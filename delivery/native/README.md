# Native WebAssembly client

Use the user's locally imported [ut2004-wasm v0.2.0 release](https://github.com/rgnv/ut2004-wasm/releases/tag/v0.2.0) with a **full 3369 or 3374** game data tree. The 3334 demo is incompatible: both the Node and browser clients fail before Core package initialization with `Core.Object defaults=40 object=40 base=44`. No class layout check is bypassed.

The release's `NOTICE.md` provides compiled engine binaries for personal use with legally obtained data. Its MIT license covers its original harnesses and shell, and grants no rights over Epic's engine. This repository therefore imports those binaries locally instead of republishing them.

Local Node validation:

```sh
python3 tools/probe-native.py --client /path/to/ut2004-node/ut2004.js --data /path/to/full-ut2004 --output /tmp/native-rankin.log
python3 tools/probe-native.py --client /path/to/ut2004-node/ut2004.js --data /path/to/full-ut2004 --mutator Matrix2004_v130.MutMonkeyMatrixMoves --output /tmp/native-matrix.log
```

The probe requires real engine initialization, `WASM_HEADLESS_PROOF` controlled-pawn output, and a clean exit. Headless success validates loading and ticking; browser rendering and input require separate observation.

The browser's virtual root is `native/<profileid>/`. Imported client files remain at that root, with `assets/` beside `index.html`. The profile supplies `file-sizes.json` mapping original-case game-relative names to byte counts, `files.json` containing the names, and `data/<OriginalCasePath>` supporting exact HTTP Range/Content-Range responses. Shell adaptation sets `Module.dataBaseURL` to the relative `data/` directory and preserves original engine binaries.

The engine's normal map argument accepts `DM-Rankin?Mutator=Matrix2004_v130.MutMonkeyMatrixMoves`. A shell adapter validates package/class names before appending mutators to `Module.map`; `game=XGame.xDeathMatch` selects the game class. `B=slowtimedown` in `[Engine.Input]` of the profile's User.ini binds the original Matrix ability.
