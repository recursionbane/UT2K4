// Independent browser package frames. The caller supplies the exact native size.
#include <stdint.h>
#include "xz.h"

#define PAGE_MAX (1024u * 1024u)
static uint8_t input[PAGE_MAX + 65536];
static uint8_t output[PAGE_MAX];
static int initialized;

uint8_t *frame_input(void) { return input; }
uint8_t *frame_output(void) { return output; }
int decode_frame(uint32_t input_size, uint32_t output_size) {
    if (!input_size || input_size > sizeof(input) ||
        !output_size || output_size > sizeof(output)) return -1;
    if (!initialized) { xz_crc32_init(); initialized = 1; }
    struct xz_dec *decoder = xz_dec_init(XZ_SINGLE, 0);
    if (!decoder) return -1;
    struct xz_buf b = { .in=input, .in_pos=0, .in_size=input_size,
                        .out=output, .out_pos=0, .out_size=output_size };
    enum xz_ret result=xz_dec_run(decoder,&b);
    xz_dec_end(decoder);
    return result==XZ_STREAM_END && b.in_pos==input_size && b.out_pos==output_size ? 0 : -1;
}
