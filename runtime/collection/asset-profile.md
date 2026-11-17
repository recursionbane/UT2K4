# Browser asset profile

The collection profile converts authorized local game data offline and serves a selected subset when the native engine reads it. The public repository and Pages artifact contain the authored tooling, runtime, synthetic test fixtures, and licensed codec implementations. Game data belongs in the operator's private distribution.

## Texture transport

Validated texture payloads are stored as ETC1S KTX2 and reconstructed to the native package's block or pixel layout. The compact profile uses smaller authored mip levels where available. World textures target 128 pixels; player and weapon skins and map previews target 256 pixels. Fonts, reticles, masks, height fields, and other special data need separate eligibility checks. Unsupported or unprofitable assets retain their original transport.

The decoder supports native BC1, BC2, BC3, and BGRA8 layouts. It can reconstruct only the byte range requested by the engine. This avoids allocating an entire large mip for a small archive read. Package offsets, dimensions, and object references remain intact.

A supplemental path handles suitable masks, normal maps, and interface backgrounds using an existing smaller mip from the original package. Its native pixel/block bytes are Zstd-compressed and checked against the original mip hash. This preserves BC1 punchthrough alpha and the authored smaller mip's values without an additional lossy texture encode. It never generates a replacement mip for special data. Fonts, reticles, height fields, lookup data, and procedural textures remain protected.

This is intentionally lossy. Enlarging a smaller mip preserves compatibility, not the original texture detail. Native texture-detail settings remain important: a small network payload does not automatically produce a small GPU allocation.

Model exports contain additional baked-lightmap textures outside ordinary Texture
exports. The supplemental converter parses both native mip arrays and applies the
128-pixel cap only when the paired mip quality and whole-package size checks pass.
It preserves BSP geometry, collision, light references and shadow masks. Relaxed
lighting experiments remain separate from the selected strict profile.

## Audio and music

Sound-effect PCM payloads use Opus transport and reconstruct their original PCM shape before the engine consumes them. Original channel layouts and timing are retained. Bitrates depend on the cue category so short interface and weapon cues can receive more detail than long ambience or voice samples.

The inventory includes sounds embedded in maps, animations, meshes and texture
packages, as well as sound containers. Candidates are merged with existing texture
and geometry changes and measured against the current package frames. Malformed,
unsupported, oversized or unprofitable clips remain original.

The selected music profile is **Vorbis quality 0, mono, at the original sample rate**. Stereo music is deliberately downmixed. Music stays in the engine's compatible Vorbis format and uses its native streaming path. Sample counts and loop metadata must validate before a candidate can replace the original.

Neither an objective error metric nor a successful playback test establishes perceptual transparency. Candidate reports separate codec validation, native playback coverage, and listening assessment.

## Geometry and animation

Same-length, source-hashed patches can coexist with audio and texture regions. Patch application rejects changes to the wrong source, overlapping edits, and edits that overlap a reconstructed codec region. Geometry and animation converters must validate their serialized layouts and numeric error limits independently. Unsupported layouts retain original bytes.

Static-mesh instance lighting uses four bits per RGB channel, with a maximum
channel error of eight. Alpha, shadow masks, geometry and collision remain exact.
A more aggressive flattened-lighting candidate was rejected after native visual
comparison showed visibly darkened structures and lost detail.

Terrain grids use predicted vertices and normals plus XOR residuals. The decoder
reconstructs the original bytes, including collision-relevant data, and checks
each requested 64 KiB chunk against its original hash before returning it. Grid
layouts that fail validation retain their original representation. Full corpus
decoder checks cover Chrome and WebKit; native terrain validation is representative,
not a playthrough of every map.

## Streaming and memory

The loader uses independent verified Zstd frames, encoded payload ranges, and a small menu bundle selected from observed startup reads. Repeated encoded payloads can share one stored object across packages. Loading a map does not require downloading every map or mod.

Selected mesh and animation packages keep the smaller original or synchronous
Zstd encoding for each frame. Frame size remains 256 KiB, with identical native
bytes and hashes. Larger-frame experiments are not part of this profile.

The default reconstruction caches are bounded separately:

| Cache | Budget |
|---|---:|
| Decoded codec regions | 32 MiB |
| Encoded codec payloads | 8 MiB |
| Small transcoded texture mips | 8 MiB |
| Exact authored smaller mips | 4 MiB |
| Phase bundles, combined | 12 MiB |
| Verified Zstd pages in the cache worker | 32 MiB |
| Serialized package-index accounting | 8 MiB |
| Coded terrain residuals | 12 MiB |
| Verified decoded terrain chunks | 1 MiB |

These are component budgets, not a total browser-memory limit. Parsed JavaScript objects, in-flight operations, the engine heap, audio buffers, and GPU allocations consume additional memory. Audio reconstruction preserves native PCM size. Index budgeting uses serialized bytes as an accounting measure, not a claim about JavaScript heap size.

Workers without WebCodecs Opus use a same-origin reference Opus WASM decoder with fixed 2 MiB linear memory. Its wrapper verifies the shipped decoder hash. Audio decode working buffers are separate from that memory and from the caches above.

## Measuring the result

The [aggregate report](../../docs/browser-asset-profile.json) records the measured full-collection size, retained map count, codec settings, and validation status. The selected profile is approximately 3.35 GB, down from 3.98 GB. The 100–200 MB collection target and 10%-of-current-size geometry target have not been achieved. The [remaining-work ledger](../../docs/remaining-asset-work.json) distinguishes selected improvements from experiments and retained data.

`tools/audit-runtime-profile.mjs` counts each active data file once, including shared codec packs. It excludes original recovery transports, duplicate prefetch bundles, and the application shell, and states those exclusions in its output. A full collection inventory is distinct from the amount transferred to reach the menu or start one match.

The loading UI reports HTTP-encoded body bytes and verified decode output separately. HTTP headers are excluded. Cache hits contribute no network body bytes; actual repeated downloads are included. A forecast is labelled as an estimate and cannot declare completion before native readiness.

The protected deployment stays behind its server-side passphrase gate. Publishing the authored runtime to GitHub Pages does not activate it in the separate legacy data-source launcher or expose the private game distribution.
