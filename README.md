# UT2K4

A browser preservation project for the Unreal Tournament 2004 demo v3334 and Monkey Matrix Moves. The original Windows demo runs through Wine-Assembly's x86 WebAssembly runtime. The movement arena is an independent implementation with its own C source.

[Browser launcher](https://recursionbane.github.io/UT2K4/) · [Original Windows demo download](https://github.com/recursionbane/UT2K4/releases/tag/demo-3334)

## Demo provenance

The Windows installer contains the September 2004 localized demo, including DM-Rankin, two CTF maps, two Onslaught maps, AS-Convoy and BR-Colossus. Its bundled `System/DemoLicense.int` section 3 permits free Internet redistribution. The published release preserves the installer byte for byte. The browser runtime executes the original x86 program.

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| Ut2004-NewDemo.exe | 296049152 | 01b92a315f506a56fcdfbd86e9f92ca3d6d43aae02863e55d57df078b973835b |
| System/UT2004.exe |  | 2a95e2fa8c22ae94eb1c361fdb49ea8ec44c5e2a93faa00831308c01e951db8d |

[Archived original download](https://archive.org/details/UnrealTournament2004Demo) · [Epic’s archived demo listing](https://zx.net.nz/mirror/www.unrealtournament.com/ut2004/downloads.html) · [Upstream emulator and gameplay evidence](https://berrry.wine/docs/re-notes/unreal-family-demos.html)

Unreal Tournament is a trademark of Epic Games. This is an independent preservation project.
