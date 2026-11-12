# UT2K4

Play the full Unreal Tournament 2004 in a browser using rgnv’s native WebAssembly engine port and the original Monkey Matrix Moves v130b mutator. The launcher, mutator recovery tooling, independent movement arena and verification scripts live in this repository.

**[Play on GitHub Pages](https://recursionbane.github.io/UT2K4/)** · [Movement arena (no installation)](https://recursionbane.github.io/UT2K4/arena/) · [Upstream native WASM release](https://github.com/rgnv/ut2004-wasm/releases/tag/v0.2.0)

## Stream and autostart

Run the supplied read-only helper on the computer holding the game. It serves the player’s own packages without copying the game into the browser or uploading them to Pages.

```sh
python3 tools/stream-game.py /path/to/UT2004 --client /path/to/ut2004-web-v0.2.0.tar.gz
```

Open the [Pages launcher](https://recursionbane.github.io/UT2K4/). On a fresh visit it looks for the helper at `127.0.0.1:8789`. Allow local network access when the browser asks. With a configured source, it loads the verified engine at launch, starts DM-Rankin and resumes that profile on subsequent visits. Use [setup](https://recursionbane.github.io/UT2K4/?setup=1) to change sources or settings. On the prepared Mac, `tools/play-on-mac.command` opens the stream and launcher.

For a separate HTTPS asset server, enter its manifest URL in **Stream from an asset server**, or share a Pages URL with `?source=<encoded manifest URL>`. The launcher accepts the upstream `file-sizes.json` format (data under adjacent `data/`) or the helper's `manifest.json` format, which also identifies the client archive. The host must allow the Pages origin and expose `Content-Range` for HTTP 206 responses. Texture packages, maps, sound packages and Vorbis music are read as the engine requests them. Startup also reads the game's configuration and localization files. The landing page and GitHub Pages deployment contain no full game data or engine WASM.

## Mac graphics

Efficient mode targets 30 fps with a 307,200-pixel budget. Balanced and Quality allow 60 fps with larger framebuffers. Graphics info reports the browser renderer. On the tested Apple M1 Max, Chrome used ANGLE’s Metal backend for WebGL. The browser handles hardware selection. No wall-power measurement was made. [Graphics profiles and checks](delivery/metal.md)

## Full game data

1. Use your full 3369 installation or the pinned OldUnreal 3374-preview-23 data. To reproduce the tested full installation on Linux, obtain the [upstream v0.2.0 web release](https://github.com/rgnv/ut2004-wasm/releases/tag/v0.2.0), extract it, and run its `bash scripts/install-game-data.sh --dest /path/to/UT2004`. It fetches the disc and patch from the sources used by OldUnreal. Other OldUnreal releases can have a different native class layout. [OldUnreal installers](https://www.oldunreal.com/downloads/ut2004/full-game-installers/)
2. On the Pages launcher select the original **ut2004-web-v0.2.0.tar.gz** file. The browser verifies the client and keeps it on the device. Select the game directory containing both `System` and `Maps`. Chromium can read files directly from that directory. Browsers without the directory-handle API store the selection in local browser storage and need enough space.
3. Select a map and mutator, then **Play full game**. The initial configuration uses DM-Rankin and Monkey Matrix Moves. Click the viewport to focus or join. Use WASD, mouse, Space and C. Touchscreen controls are capability-detected with a manual override in Display and controls. Browser audio may need a tap or click.
4. For other mutators, select **Local mutator packages**, choose their files and dependencies, and enter the UnrealScript `Package.Class` names. Classes already present in the selected install can be used directly. Package compatibility depends on the game build and game type. This site launches local bot matches.

The site fetches the original Matrix package from Unreal Archive, checks its SHA-256, and mounts its five files plus the independent MatrixModern compatibility package. The adapter restores the original controller and pawn during human login on 3374. The Matrix profile binds **B** to `slowtimedown`. The original mod supports deathmatch, CTF and bombing run. Its authors exclude Assault and Onslaught.

## Preservation

The original mutator was created by Adam “MonkeyCircus” Bradley and Rob “[Apoc]Death” Gutermuth. Their UT2004 release contains 66 embedded UnrealScript class texts. Recover them locally and verify the per-file digests:

```sh
python3 mutators/monkey-matrix-moves/preserve.py
(cd mutators/monkey-matrix-moves/local/source-text && shasum -a 256 -c ../../source-sha256.txt)
```

The public recovery tool, hashes, and provenance identify the original texts. Their release includes no source republication grant. Full game data and the compiled native engine are imported on each player's device under their respective terms. The MIT license for rgnv’s integration covers its original harnesses and shell. [Mutator research](docs/mutator-research.md) · [Engine notice](https://github.com/rgnv/ut2004-wasm/blob/v0.2.0/NOTICE.md)

## Build and test

```sh
node arena/test.mjs
node delivery/test-native-import.cjs /path/to/ut2004-web-v0.2.0.tar.gz
tools/build-site.sh
python3 -m http.server 8000 --directory _site
```

Open localhost:8000. A service worker serves verified client files and game assets from local browser storage, including HTTP byte ranges. The GitHub Actions workflow builds the static launcher and deploys to Pages. For the independent arena's C-to-WASM build, see [its README](arena/README.md).

The archived [3334 demo installer](https://github.com/recursionbane/UT2K4/releases/tag/demo-3334) predates the full-game release target. Unreal Tournament belongs to Epic Games and its licensors. This project is unaffiliated with Epic Games and OldUnreal.
