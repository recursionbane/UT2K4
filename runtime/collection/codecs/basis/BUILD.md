Basis Universal pinned source: 073eb6a0a34a23d77e75e54f41dcd9653a52da83
https://github.com/BinomialLLC/basis_universal
Apache-2.0; original LICENSE/NOTICE included.

Built with Emscripten 6.0.8. The emitted JavaScript is renamed `.mjs`; no
runtime logic edits. This build forbids dynamic JavaScript execution and uses
AOT embind wrappers. WASM compilation requires CSP `wasm-unsafe-eval`, not
JavaScript `unsafe-eval`. The transcoder heap maximum is 128 MiB.

```
emcmake cmake -S webgl/transcoder -B build-wasm-csp \
 -DNO_DYNAMIC_EXECUTION=ON -DCMAKE_POLICY_VERSION_MINIMUM=3.5 \
 -DCMAKE_EXE_LINKER_FLAGS='-sEXPORT_ES6=1 -sENVIRONMENT=web,worker,node -sMAXIMUM_MEMORY=134217728'
cmake --build build-wasm-csp -j 6
```
