# Collection runtime profile

These authored modules adapt the pinned UT2004 3369 Collection browser runtime. They contain no game data, engine WASM, credentials, hosting origin, or original Matrix distribution. Node 24 or newer is required for the packaging helpers and tests.

The profile starts the normal engine launcher automatically, skips the cinematic with `NoIntro`, and reaches the native main menu. It acknowledges only unavailable IndexedDB and synchronous OPFS storage capabilities, which have a memory fallback; unsupported rendering and threading features still remain visible. Instant Action receives its four default mutators through real `DefUser.ini` configuration, so matches started with the normal GUI retain them.

Native texture detail is **Low** for world, terrain, player/weapon skins, render maps and lightmaps; interface textures remain Normal. This selects lower-resolution mip levels through the engine while sparse package reads avoid unnecessary bulk data. Package bytes remain intact, and the user can change graphics settings in the game. Original viewport defaults are retained for correct responsive input/rendering.

## Integration

Supply a complete, compatible runtime and its authorized assets, including the original `Matrix2004_v130` dependency. Build the two authored addons with [build-assist.py](../../tools/build-assist.py), and include the separately authored MatrixModern compatibility package.

The normal preset is:

```text
LocalAim.MutLocalAim,LocalRecovery.MutLocalRecovery,Matrix2004_v130.MutMonkeyMatrixMoves,MatrixModern.MutMatrixModern
```

Apply the pure transformations to copies of the runtime files:

1. `startup-data.mjs`: call `applyEmbeddedMenuDefaults({loader, data, mutators, lowMemory: true})`. Save both returned loader and data together. The helper safely parses embedded metadata, preserves unrelated files, merges menu presets and GoreLevel=0, and rebuilds every offset and total size.
2. `startup-policy.mjs`: inject `startupClient({lowMemory: true, mutators})` and use `menuLaunch()` for the native-menu route. Startup goes through the existing Start control; its wrapper preserves the normal launch arguments and appends the validated settings.
3. `menu-touch.mjs`: apply **both** `patchMenuTouch(loader)` and `patchMenuTouchFrontend(appBundle)`. The latter lets menu touches bypass the upstream virtual-gamepad capture router. The loader hides the pad while native menus own input, primes the native cursor, and forwards the original touch after a frame delay. Gameplay retains the original pad path.
4. `jit-patches.mjs`: apply the glue and cache-worker patches to an unpatched compatible source. Add `jit: {format: "zstd-pages-v1", blockSize: 262144}` only for manifest entries whose verified container and descriptor are actually present. Unmarked entries retain ordinary whole-file loading.
5. `tiny-bundle.mjs`: rebuild the tiny-file bundle and its worker patch after changing INI, INT, UCL or localization bytes. A previously built bundle must not replace newer same-size configurations.
6. Include `assist-client.js` and `pad-native-routing.js` in the page, and apply `input-patches.mjs`'s `patchPadOwnership(loader)`. It installs each ownership guard once even when other input patches are already present. Keep game and interface control events separate.
7. Optionally apply `runtime-diagnostics.mjs`. It records a bounded, origin-redacted WASM fault context and rethrows the original exception; it does not suppress traps or claim their cause.
8. Apply `pointer-capture.mjs`'s `patchPointerCapture()` to the compatible virtual-gamepad library. It tolerates only inactive-pointer DOM exceptions, releases controls when menus hide the pad, and retains native pointer capture for real active contacts. The original library license header is preserved.

Refresh shell integrity hashes and any transport encodings after changing bytes. Rebuild from the pinned original source when a patch implementation changes, except where the patch explicitly supports installer replacement. All resources should share the game's origin; the range transport rejects cross-origin assets.

## Streaming

`jit-packages.mjs` creates independently compressed Zstd frames and adjacent `.jit.json` descriptors. It verifies every decoded frame and records raw/container hashes. The browser requests only the needed ranges, validates HTTP206 identity and decoded hashes, and keeps bounded memory caches. Optional read-ahead fetches at most four pages after sequential demand; random reads stay at one page.

Supply a decoded length when using the older bundled WASM Zstd decoder with new frames. Its legacy callback also receives a codec object as the second argument, so the wrapper forwards only positive integer length hints. This is covered by the private native integration tests and the published callback implementation.

Do not assume splitting every package saves bandwidth. Independently compressed frames can be larger if fully consumed. Keep frequently read small/code packages whole when measured results support that decision, and measure the actual menu/match working set.

## Validation

```sh
npm ci
npx playwright install chromium
node --test runtime/collection/test.mjs
node runtime/collection/startup-policy.test.mjs
node runtime/collection/menu-touch.test.mjs
node runtime/collection/pointer-capture.test.mjs
node runtime/collection/assist-client.test.cjs
node runtime/collection/pad-native-routing.test.cjs
python3 tools/check-assist-source.py
```

These tests use synthetic data and run without a game installation. Native integration additionally checks automatic main-menu startup, first trusted menu taps at desktop and DPR2 mobile dimensions, normal Instant Action starts, real moving-target occlusion while firing, target deletion/death, acrobatic camera transitions, directional damage, and recovery timing. A reported old-build memory trap was not reproduced in the controlled runs; the unsafe native camera call cycle was removed and the same scenarios pass with the fix. Physical-phone behavior remains a separate hardware check.
