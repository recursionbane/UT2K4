// Render one Vorbis stream to mono PCM while preserving its user comments.
// The decoded frame count is authoritative for sources with a short final page.
#include <vorbis/vorbisfile.h>
#include <stdio.h>
#include <stdint.h>
#include <string.h>
#include <math.h>
static int write32(FILE *f,uint32_t v){
    unsigned char b[4]={(unsigned char)v,(unsigned char)(v>>8),(unsigned char)(v>>16),(unsigned char)(v>>24)};
    return fwrite(b,1,4,f)==4;
}
int main(int argc,char **argv) {
    if(argc!=4)return 2;
    OggVorbis_File ov;if(ov_fopen(argv[1],&ov))return 3;
    vorbis_info *vi=ov_info(&ov,0);vorbis_comment *vc=ov_comment(&ov,0);
    if(ov_streams(&ov)!=1||!vi||!vc||(vi->channels!=1&&vi->channels!=2)||vi->rate<8000||vi->rate>48000)return 4;
    FILE *tags=fopen(argv[3],"wb"),*pcm=fopen(argv[2],"wb");
    if(!pcm||!tags||!write32(tags,(uint32_t)vc->comments))return 5;
    for(int i=0;i<vc->comments;i++){
        long l=vc->comment_lengths[i];if(l<0||l>1048576||!write32(tags,l)||fwrite(vc->user_comments[i],1,l,tags)!=(size_t)l)return 6;
    }
    if(fclose(tags))return 6;
    int link;float **planes,mono[8192];long n;int64_t frames=0;double sum=0,original=0;
    while((n=ov_read_float(&ov,&planes,8192,&link))>0){
        for(int i=0;i<n;i++){
            const double a=planes[0][i],b=planes[vi->channels-1][i];
            mono[i]=(float)((a+b)*.5);sum+=mono[i]*mono[i];original+=(a*a+b*b)*.5;
        }
        if(fwrite(mono,sizeof(float),n,pcm)!=(size_t)n)return 7;
        frames+=n;
    }
    if(n<0||frames<1||fclose(pcm)||!isfinite(sum)||!isfinite(original))return 8;
    if(original>0 && sum/original < .125892541)return 9;
    printf("%ld %lld %.9f\n",vi->rate,(long long)frames,sum);
    ov_clear(&ov);return 0;
}
