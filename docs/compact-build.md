# Compact browser build

This edition retains 861 maps, 271 music tracks, the gameplay mutators and the
original package names. Its working size target is 1,000,000,000 bytes for a
self-contained encrypted deployment.

| Verified intermediate inventory | Active game data |
|---|---:|
| Previous published profile | 3,350,065,331 bytes |
| Music, animation, instance and same-frame geometry pass | 2,923,330,555 bytes |
| Native Opus, compiled meshes and authored skeletal LODs | 2,667,566,240 bytes |
| Compact lighting, BSP replay, render vertices and game-context exports | 2,124,862,787 bytes |
| Integrated lower-resolution textures | 1,970,334,038 bytes |
| Mixed XZ and Zstd frame selection on that build | 1,724,862,418 bytes |

Later refinements retain 27 legacy texture packages with validated lower mips,
derive collision bounds from the original triangles with exact exceptions,
recreate wireframe edges on demand, pack quaternion rotations and add a typed
BSP representation. The complete encrypted build with the corrected startup
dialog occupies **1,574,446,287 bytes**, including the gateway, index and all
188 encrypted chunks. It exceeds the decimal target by 574,446,287 bytes.
The gateway passed 28 locked-route checks and served 9,570 authenticated
files and 9,568 ranges with the expected contents.

On a cold desktop Chrome run against the sealed gateway on loopback, the
native menu appeared at 36.7 s. The menu phase counted 64.0 MB of transferred
HTTP body data. Starting Rankin transferred another 10.0 MB. The world
rendered at 50.3 s and a normal mouse click joined the match at 55.0 s
from initial navigation. Movement and jumping changed the owned pawn's
physics state. The storage-only launcher dialog was dismissed once.
The run recorded zero page, native or worker setup errors.

### Where the game data went

These decimal MB figures count each active file once before the final
encrypted packing step. A file referenced by packages of multiple types
appears in the shared row. The map row includes terrain embedded in maps.

| Package family | Previous published profile (MB) | Compact profile (MB) |
|---|---:|---:|
| Maps | 1,801.5 | 784.0 |
| Texture packages | 428.3 | 255.2 |
| Static meshes | 270.8 | 133.0 |
| Animation packages | 281.9 | 131.5 |
| Music tracks (.ogg) | 367.2 | 92.4 |
| Sound packages | 87.2 | 53.9 |
| Files shared across package types | 44.0 | 109.8 |
| All remaining files | 69.2 | 60.5 |
| **Total** | **3,350.1** | **1,620.4** |

A further random-access compression experiment on 34 packages saved
15,511 bytes with the cold-read safeguard enabled. Its decoder and delivery
variants added 16,612 bytes. The sealed build uses the existing frame reader.

The original local installation and the complete mirrored collection differ
substantially in scope. The installed full-game folder has 131 matching maps.
The mirror contains 861 maps across stock and community content. A static
dependency comparison for the 131 matched maps, all tracks and requested
mutators accounted for 544 MB of active files on the measured intermediate
profile. That comparison is a separate scope estimate. The full-collection
figures in the table include all 861 maps.

## What changed

* The native music reader streams mono Opus, emits the original playback rate
  and sample count, and supports seeking and rewind. The complete music
  inventory occupies 92.4 MB. This is an audibly lossy encoding.
* Animated tracks keep event timing and root motion while selected tracks use
  fewer interpolated keys. A later representation packs local quaternions.
  Skinned meshes use lower-detail models authored in the original packages.
* Static meshes retain their collision vertices. Material-aware simplification
  reduces render triangles, and the particle emitter can generate its source
  triangles from the displayed surface. Quantized normals affect rendering.
* The engine regenerates world BSP render sections from its canonical BSP.
  Baked lighting uses small RGB atlases where the source has them. The 98 maps
  without a source baked atlas can look flatter under the neutral fallback.
* Baked mesh instance colors use small palettes with native alpha values. The
  renderer preserves those colors when loading compact instances.
* Frame selection compares actual index and container sizes. The bounded XZ
  decoder has a fixed 4 MiB heap. Each reconstructed native page is checked
  against the expected content hash before it reaches the engine.

The native smoke runs covered the menu, Rankin, Deck17 and representative
terrain and fallback worlds. These tests do not constitute a playthrough of
every map, a complete end-to-end music listening test or a physical iPhone
benchmark.

See the [engine build notes](../tools/engine/README.md) for the source hooks
and native music validation procedure.

## Streaming the main menu

The gateway's first remote cold run reached the native menu in 183.1 seconds.
The browser recorded 1,867 requests and 49.3 MB of encoded response bodies to
that point. The player joined Rankin at 262.9 seconds after initial navigation.
This exposed network round trips as a separate cost from package size.

The updated worker combines previously observed nearby ranges within one
package. Each grouped read starts on demand, covers at most 256 KiB and can
bridge a gap of up to 4 KiB. The worker reserves at most 8 MiB for this cache
including in-flight reads. The JIT and region decoders check each original
frame or payload. An unexpected server response falls back to the ordinary
range read. Reads outside the measured intervals use the ordinary path.

Replaying the recorded menu trace through the cache model reduced 1,703
eligible HTTP range requests to 561. Those requests accounted for 18.57 MB
before grouping and 18.52 MB in the replay. The measured encrypted artifact
with the updated worker is 1,574,467,395 bytes before the Pages routing file.
The range hints and worker add 21,108 bytes. The package bodies are shared.

Operators can regenerate the worker using the original worker and a matching
native-ready menu trace. The output must be a new path.

```sh
node tools/attach-menu-range-cache.mjs ufront-cache-worker.js requests.json phase-report.json worker-with-menu-cache.js
```
