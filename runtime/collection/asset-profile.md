# Browser asset profile

The collection profile converts authorized local game data offline and serves a selected subset when the native engine reads it. The public repository and Pages artifact contain the authored tooling, runtime, synthetic test fixtures, and licensed codec implementations. Game data belongs in the operator's private distribution.

## Texture transport

Validated texture payloads are stored as ETC1S KTX2 and reconstructed to the native package's block or pixel layout. The compact profile uses smaller authored mip levels where available. World textures target 128 pixels; player and weapon skins and map previews target 256 pixels. Fonts, reticles, masks, height fields, and other special data need separate eligibility checks. Unsupported or unprofitable assets retain their original transport.

The decoder supports native BC1, BC2, BC3, and BGRA8 layouts. It can reconstruct only the byte range requested by the engine. This avoids allocating an entire large mip for a small archive read. Package offsets, dimensions, and object references remain intact.

A supplemental path handles suitable masks, normal maps, and interface backgrounds using an existing smaller mip from the original package. Its native pixel/block bytes are Zstd-compressed and checked against the original mip hash. This preserves BC1 punchthrough alpha and the authored smaller mip's values without an additional lossy texture encode. It never generates a replacement mip for special data. Fonts, reticles, height fields, lookup data, and procedural textures remain protected.

This is intentionally lossy. Enlarging a smaller mip preserves compatibility, not the original texture detail. Native texture-detail settings remain important: a small network payload does not automatically produce a small GPU allocation.

## Audio and music

Sound-effect PCM payloads use Opus transport and reconstruct their original PCM shape before the engine consumes them. Original channel layouts and timing are retained. Bitrates depend on the cue category so short interface and weapon cues can receive more detail than long ambience or voice samples.

The selected music profile is **Vorbis quality 0, mono, at the original sample rate**. Stereo music is deliberately downmixed. Music stays in the engine's compatible Vorbis format and uses its native streaming path. Sample counts and loop metadata must validate before a candidate can replace the original.

Neither an objective error metric nor a successful playback test establishes perceptual transparency. Candidate reports separate codec validation, native playback coverage, and listening assessment.

## Geometry and animation

Same-length, source-hashed patches can coexist with audio and texture regions. Patch application rejects changes to the wrong source, overlapping edits, and edits that overlap a reconstructed codec region. Geometry and animation converters must validate their serialized layouts and numeric error limits independently. Unsupported layouts retain original bytes.

## Streaming and memory

The loader uses independent verified Zstd frames, encoded payload ranges, and a small menu bundle selected from observed startup reads. Repeated encoded payloads can share one stored object across packages. Loading a map does not require downloading every map or mod.

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

These are component budgets, not a total browser-memory limit. Parsed JavaScript objects, in-flight operations, the engine heap, audio buffers, and GPU allocations consume additional memory. Audio reconstruction preserves native PCM size. Index budgeting uses serialized bytes as an accounting measure, not a claim about JavaScript heap size.

Workers without WebCodecs Opus use a same-origin reference Opus WASM decoder with fixed 2 MiB linear memory. Its wrapper verifies the shipped decoder hash. Audio decode working buffers are separate from that memory and from the caches above.

## Measuring the result

`tools/audit-runtime-profile.mjs` counts each active data file once, including shared codec packs. It excludes original recovery transports, duplicate prefetch bundles, and the application shell, and states those exclusions in its output. A full collection inventory is distinct from the amount transferred to reach the menu or start one match.

The loading UI reports HTTP-encoded body bytes and verified decode output separately. HTTP headers are excluded. Cache hits contribute no network body bytes; actual repeated downloads are included. A forecast is labelled as an estimate and cannot declare completion before native readiness.

The protected deployment stays behind its server-side passphrase gate. Publishing the authored runtime to GitHub Pages does not activate it in the separate legacy data-source launcher or expose the private game distribution.
