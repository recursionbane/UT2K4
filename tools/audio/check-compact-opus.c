// Exercise the same bounded streaming reader linked into the WASM engine.
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
int compact_is_opus(FILE*);
void *compact_open_opus(FILE*,int*,double*);
int compact_read_opus(void*,char*,int);
int compact_seek_opus(void*,double);
void compact_close_opus(void*);
int main(int argc,char **argv) {
    if(argc!=4)return 1;
    long long expected=atoll(argv[3]),frames=0;int rate,bytes;double seconds;
    FILE *f=fopen(argv[1],"rb");if(!f||!compact_is_opus(f))return 2;
    void *s=compact_open_opus(f,&rate,&seconds);if(!s||rate!=atoi(argv[2]))return 3;
    char buffer[65536],first[1024];size_t first_n=0;
    while((bytes=compact_read_opus(s,buffer,sizeof(buffer)))>0){
        if(!frames){first_n=bytes<1024?bytes:1024;memcpy(first,buffer,first_n);}
        frames+=bytes/2;
    }
    if(bytes<0||frames!=expected||compact_seek_opus(s,0))return 4;
    if(compact_read_opus(s,buffer,first_n)!=(int)first_n || memcmp(first,buffer,first_n))return 5;
    if(compact_seek_opus(s,seconds*.5)||compact_read_opus(s,buffer,512)<=0)return 6;
    compact_close_opus(s);fclose(f);puts("OK");return 0;
}
