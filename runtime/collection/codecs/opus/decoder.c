/* Small authored API wrapper around the BSD-licensed reference Opus decoder. */
#include <stdint.h>
#include <opus.h>
uintptr_t collection_opus_create(int channels) {
    if(channels<1 || channels>2)return 0;
    int error=0;OpusDecoder *decoder=opus_decoder_create(48000,channels,&error);
    return error==OPUS_OK?(uintptr_t)decoder:0;
}
int collection_opus_decode(uintptr_t state,const unsigned char *packet,int length,float *output,int frames) {
    if(!state||!packet||!output||length<1||length>1048576||frames<120||frames>5760)return OPUS_BAD_ARG;
    return opus_decode_float((OpusDecoder*)state,packet,length,output,frames,0);
}
void collection_opus_destroy(uintptr_t state) { if(state)opus_decoder_destroy((OpusDecoder*)state); }
