#include <stdint.h>
#include <stddef.h>
#include "brotli/decode.h"
int bounded_brotli_decode(const uint8_t *input, size_t input_size, uint8_t *output, size_t output_size) {
  if (!input || !output || input_size > 33554432 || output_size > 33554432) return -1;
  size_t decoded_size = output_size;
  BrotliDecoderResult result = BrotliDecoderDecompress(input_size, input, &decoded_size, output);
  if (result != BROTLI_DECODER_RESULT_SUCCESS || decoded_size != output_size) return -2;
  return (int)decoded_size;
}
