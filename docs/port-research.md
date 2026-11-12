# Full-game browser port research

On 2026-11-12 we searched Kagi for `ut2k4 wasm` in Orion. Kagi surfaced the [rgnv v0.2.0 release](https://github.com/rgnv/ut2004-wasm/releases/tag/v0.2.0), its [repository](https://github.com/rgnv/ut2004-wasm), and the [OldUnreal game patches](https://github.com/OldUnreal/UT2004Patches/releases).

The native Emscripten engine, GL4ES renderer, OpenAL audio path, headless harness, touchscreen controls and controller mappings already exist. This project imports and verifies the upstream release, adapts its browser shell for device-local game data and mutators, and exercises the original Monkey Matrix Moves package.

Upstream reports complete map sweeps on full data versions 3369 and 3374-preview-23. Its [release notice](https://github.com/rgnv/ut2004-wasm/blob/v0.2.0/NOTICE.md) describes the scope of the port's MIT components and personal-use binary distribution. The static Pages site includes our integration. Players import the upstream archive and full data locally.

[Wine-Assembly](https://berrry.wine/docs/re-notes/unreal-family-demos.html) provides another route by executing the original Windows x86 program. Its documented DM-Rankin run used the 3334 demo. Our local native v0.2.0 probe against the demo stopped at a Core.Object defaults-size mismatch. The launcher targets the full game as requested.

[OpenUT2k4](https://github.com/GloriousEggroll/OpenUT2k4) is a separate UE5 reimplementation. This project uses rgnv’s native WASM build to execute the original UnrealScript packages.
