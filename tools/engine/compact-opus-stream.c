// An Ogg Opus song is decoded in bounded blocks and delivered to OpenAL at the
// original native song rate. Its stream metadata binds the exact frame count.
#include <opusfile.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <limits.h>

typedef struct {
    OggOpusFile *file;
    int rate;
    int64_t frames, position, decoded_start;
    int decoded_count, previous, has_previous;
    opus_int16 decoded[5760];
} CompactOpusStream;

static int read_bytes(void *file, unsigned char *buffer, int size) {
    size_t n = fread(buffer, 1, size, file);
    return n || !ferror((FILE *)file) ? (int)n : -1;
}
static int seek_file(void *file, opus_int64 offset, int whence) {
    if (offset > LONG_MAX || offset < LONG_MIN) return -1;
    return fseek(file, (long)offset, whence);
}
static opus_int64 tell_file(void *file) { return ftell(file); }

static int64_t positive_tag(const OpusTags *tag, const char *name, int64_t max) {
    const char *s = opus_tags_query(tag, name, 0);int64_t value = 0;
    if (!s || !*s || opus_tags_query_count(tag,name)!=1) return 0;
    for (; *s; ++s) {
        if (*s<'0'||*s>'9'||value>(max-(*s-'0'))/10) return 0;
        value=value*10+(*s-'0');
    }
    return value;
}
int compact_is_opus(FILE *file) {
    unsigned char head[512];size_t n=fread(head,1,sizeof(head),file);
    rewind(file);
    if(n<28 || memcmp(head,"OggS",4) || head[4]!=0)return 0;
    size_t at=27u+head[26];return at+8<=n && memcmp(head+at,"OpusHead",8)==0;
}
void *compact_open_opus(FILE *file,int *rate,double *seconds) {
    const OpusFileCallbacks callbacks={read_bytes,seek_file,tell_file,NULL};
    int error=0;
    OggOpusFile *ogg=op_open_callbacks(file,&callbacks,NULL,0,&error);
    if(!ogg)return NULL;
    op_set_dither_enabled(ogg,0);
    const OpusTags *tags=op_tags(ogg,0);
    const int64_t native_rate=positive_tag(tags,"UT_NATIVE_RATE",96000);
    const int64_t frames=positive_tag(tags,"UT_NATIVE_FRAMES",INT32_MAX);
    const int64_t opus_frames=op_pcm_total(ogg,-1);
    // Encoder output can differ by a single input-rate rounding interval.
    if(op_link_count(ogg)!=1 || op_channel_count(ogg,0)!=1 || native_rate<8000 ||
       !frames || opus_frames<1 || llabs(opus_frames*native_rate-frames*48000)>96000) {
        op_free(ogg);return NULL;
    }
    CompactOpusStream *s=calloc(1,sizeof(*s));
    if(!s){op_free(ogg);return NULL;}
    s->file=ogg;s->rate=(int)native_rate;s->frames=frames;
    *rate=s->rate;*seconds=(double)frames/s->rate;
    return s;
}
void compact_close_opus(void *stream) {
    CompactOpusStream *s=stream;if(s){op_free(s->file);free(s);}
}
static int value_at(CompactOpusStream *s,int64_t i,int *sample) {
    while(i>=s->decoded_start+s->decoded_count) {
        const int64_t next=s->decoded_start+s->decoded_count;
        int previous=s->decoded_count?s->decoded[s->decoded_count-1]:0;
        const int count=op_read(s->file,s->decoded,5760,NULL);
        if(count==0 && s->decoded_count){*sample=previous;return 1;}
        if(count<1)return 0;
        s->has_previous=s->decoded_count!=0;s->previous=previous;
        s->decoded_start=next;s->decoded_count=count;
    }
    if(i==s->decoded_start-1 && s->has_previous){*sample=s->previous;return 1;}
    if(i<s->decoded_start)return 0;
    *sample=s->decoded[i-s->decoded_start];return 1;
}
int compact_read_opus(void *stream,char *out,int bytes) {
    CompactOpusStream *s=stream;int written=0;
    // Read both neighboring samples in order. Carry the last sample across
    // decoder packet boundaries when two neighboring output frames share it.
    while(written+2<=bytes && s->position<s->frames) {
        const int64_t scaled=s->position*48000;
        const int64_t a=scaled/s->rate;const int fraction=(int)(scaled%s->rate);
        int left,right;
        if(!value_at(s,a,&left))return -1;
        right=left;
        if(fraction && !value_at(s,a+1,&right))return -1;
        int v=left+(int)((int64_t)(right-left)*fraction/s->rate);
        out[written]=(char)(v&255);out[written+1]=(char)((unsigned)v>>8);
        written+=2;s->position++;
    }
    return written;
}
int compact_seek_opus(void *stream,double seconds) {
    CompactOpusStream *s=stream;
    if(!(seconds>=0 && seconds<=(double)s->frames/s->rate))return -1;
    int64_t frame=(int64_t)(seconds*s->rate);
    int64_t sample=(frame*48000)/s->rate;
    if(op_pcm_seek(s->file,sample)!=0)return -1;
    s->position=frame;s->decoded_start=sample;s->decoded_count=0;s->has_previous=0;return 0;
}
