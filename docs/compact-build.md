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
BSP representation. The first fully sealed result including those changes was
**1,574,445,497 bytes**, 574,445,497 bytes over target. Its gateway checks
verified 188 encrypted chunks, 9,570 authenticated files and 9,568 ranges.
It has not replaced production.

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
