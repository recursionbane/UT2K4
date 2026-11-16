# Worker Opus fallback

This same-origin fallback is used only when worker WebCodecs Opus is unavailable.
It uses no generated JavaScript, eval, external CDN, threads or SIMD. Its reference
WASM decoder has fixed 2 MiB linear memory. Normal worker CSP must permit the same
`'wasm-unsafe-eval'` capability needed by the game, plus same-origin modules/fetch.

Source: official Opus 1.6.1 release, pinned archive SHA-256 in `build.json` and the
build tool. `LICENSE` contains the original license; `NOTICE` records attribution.
The authored sine-tone fixture and standard 20 ms Opus silence packet exercise
actual mono/stereo decoding in CI without game assets.

With CMake and Emscripten on PATH, provide the official local archive:

```sh
python3 tools/build-opus-decoder.py --archive /path/to/opus-1.6.1.tar.gz --update-runtime
node runtime/collection/opus-wasm.test.mjs
```

The tool verifies the archive before extraction and strips local source prefixes
from library diagnostic strings. `--no-entry` produces a standalone reactor;
calling its `_initialize` export once is required before allocation/decoding.
The wrapper exposes only create/decode/destroy plus malloc/free. The loader checks
the exact WASM digest, limits its response to 512 KiB, bounds download time to
30 seconds, cancels oversized bodies and releases stream-reader locks.

`build.json` records the shipped artifact. Different toolchain versions can
produce different bytes; adopting a rebuild must update the runtime integrity
constant. Native PCM shape and all original loop metadata remain owned by the
separate audio reconstruction adapter.
