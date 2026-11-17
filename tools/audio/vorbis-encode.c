/* Reencode raw interleaved float PCM from stdin as native-compatible Ogg Vorbis.
 * Build against user-installed libogg/libvorbis; no game content is included. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <vorbis/vorbisenc.h>
static int write_pages(ogg_stream_state *stream,int force){ogg_page page;while(force?ogg_stream_flush(stream,&page):ogg_stream_pageout(stream,&page)){if(fwrite(page.header,1,page.header_len,stdout)!=(size_t)page.header_len||fwrite(page.body,1,page.body_len,stdout)!=(size_t)page.body_len)return -1;}return 0;}
int main(int argc,char **argv){if(argc!=4&&argc!=5&&argc!=7){fprintf(stderr,"usage: audio-vorbis-encode channels rate quality-or-b16000 [comment-packet [--lowpass-khz value]] < float32le.pcm > music.ogg\n");return 2;}int channels=atoi(argv[1]),rate=atoi(argv[2]);int managed=argv[3][0]=='b';long bitrate=managed?atol(argv[3]+1):0;float quality=atof(argv[3]);if(channels<1||channels>2||rate<8000||rate>96000||(!managed&&(quality<-.1f||quality>1.f))||(managed&&(bitrate<8000||bitrate>256000)))return 2;
vorbis_info info;vorbis_comment comment;vorbis_dsp_state dsp;vorbis_block block;ogg_stream_state stream;ogg_packet head,tags,setup,packet;vorbis_info_init(&info);
if (argc == 7) {
    char *end;
    double cutoff = strtod(argv[6], &end);
    if (managed || strcmp(argv[5], "--lowpass-khz") || *end != '\0' ||
        !isfinite(cutoff) || cutoff <= 0 || cutoff > rate / 2000.0) return 2;
    if (vorbis_encode_setup_vbr(&info, channels, rate, quality) ||
        vorbis_encode_ctl(&info, OV_ECTL_LOWPASS_SET, &cutoff) ||
        vorbis_encode_setup_init(&info)) return 3;
} else if (managed ? vorbis_encode_init(&info, channels, rate, -1, bitrate, -1)
                   : vorbis_encode_init_vbr(&info, channels, rate, quality)) return 3;
vorbis_comment_init(&comment);vorbis_comment_add_tag(&comment,"ENCODER","libvorbis candidate encoder");vorbis_analysis_init(&dsp,&info);vorbis_block_init(&dsp,&block);ogg_stream_init(&stream,1001);vorbis_analysis_headerout(&dsp,&comment,&head,&tags,&setup);unsigned char *original_tags=NULL;if(argc>=5){FILE *f=fopen(argv[4],"rb");if(!f)return 6;if(fseek(f,0,SEEK_END))return 6;long n=ftell(f);if(n<8||n>16*1024*1024)return 6;rewind(f);original_tags=malloc(n);if(!original_tags||fread(original_tags,1,n,f)!=(size_t)n)return 6;fclose(f);tags.packet=original_tags;tags.bytes=n;}ogg_stream_packetin(&stream,&head);ogg_stream_packetin(&stream,&tags);ogg_stream_packetin(&stream,&setup);if(write_pages(&stream,1))return 4;free(original_tags);
float input[2048];int done=0;while(!done){size_t count=fread(input,sizeof(float),1024*channels,stdin);if(count%(size_t)channels)return 5;int frames=count/channels;if(!frames){vorbis_analysis_wrote(&dsp,0);done=1;}else{float **buffer=vorbis_analysis_buffer(&dsp,frames);for(int i=0;i<frames;i++)for(int c=0;c<channels;c++)buffer[c][i]=input[i*channels+c];vorbis_analysis_wrote(&dsp,frames);}while(vorbis_analysis_blockout(&dsp,&block)==1){vorbis_analysis(&block,NULL);vorbis_bitrate_addblock(&block);while(vorbis_bitrate_flushpacket(&dsp,&packet)){ogg_stream_packetin(&stream,&packet);if(write_pages(&stream,0))return 4;}}}if(ferror(stdin)||write_pages(&stream,1))return 4;ogg_stream_clear(&stream);vorbis_block_clear(&block);vorbis_dsp_clear(&dsp);vorbis_comment_clear(&comment);vorbis_info_clear(&info);return 0;}
