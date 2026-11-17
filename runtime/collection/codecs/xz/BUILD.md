The 15,858-byte decoder uses XZ Embedded at commit ae63ae3a36ed01724674e8f3d750dc47bf125410
from https://github.com/tukaani-project/xz-embedded. The included LICENSE is the
upstream licensing notice. The wrapper is in frame-decoder.c.

Build with Emscripten 5.0.7. Set XZ_ROOT to the pinned source checkout.

```sh
emcc -Oz --no-entry -sSTANDALONE_WASM=1 -sINITIAL_MEMORY=4194304 -sSTACK_SIZE=65536 \
  -sALLOW_MEMORY_GROWTH=0 -sFILESYSTEM=0 \
  -sEXPORTED_FUNCTIONS='["_frame_input","_frame_output","_decode_frame"]' \
  -I"$XZ_ROOT/userspace" -I"$XZ_ROOT/linux/include/linux" frame-decoder.c \
  "$XZ_ROOT/linux/lib/xz/xz_crc32.c" "$XZ_ROOT/linux/lib/xz/xz_dec_stream.c" \
  "$XZ_ROOT/linux/lib/xz/xz_dec_lzma2.c" -o frame-decoder.wasm
```

The wrapper requires a single complete XZ frame and checks the exact decoded
length. The caller verifies the original native frame hash. The encoded profile
uses LZMA2 with a 256 KiB dictionary and the XZ CRC32 check.
