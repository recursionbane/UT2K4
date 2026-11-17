# Bounded Brotli decoder

Google Brotli 1.1.0, commit `ed738e842d2fbdf2d6459e39267a633c4a9b2f5d`, MIT license. The authored C wrapper caps input and output at 32 MiB and requires an exact decoded length. This is a lossless optional Model transport decoder; it does not interpret geometry or change collision.

Build with Emscripten 6.0.8, setting `BROTLI_SOURCE` to a checkout of that commit:

```sh
emcc -O3 bounded-decode.c "$BROTLI_SOURCE"/c/common/*.c "$BROTLI_SOURCE"/c/dec/*.c \
  -I "$BROTLI_SOURCE/c/include" \
  -s MODULARIZE=1 -s EXPORT_ES6=1 -s ENVIRONMENT=web,worker,node \
  -s DYNAMIC_EXECUTION=0 -s ALLOW_MEMORY_GROWTH=1 \
  -s INITIAL_MEMORY=16777216 -s MAXIMUM_MEMORY=134217728 \
  -s EXPORTED_FUNCTIONS='["_bounded_brotli_decode","_malloc","_free"]' \
  -s EXPORTED_RUNTIME_METHODS='["HEAPU8"]' -s FILESYSTEM=0 \
  -o brotli-decoder.mjs
```

`build.json` records output hashes. Browser initialization uses `createModelBrotliDecoder`; no JavaScript dynamic evaluation is required. Production integration and native gameplay validation are separate gates.
