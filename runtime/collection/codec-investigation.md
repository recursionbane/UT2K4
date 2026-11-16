# Modern asset transport: verified scope

These modules reconstruct bytes in the formats the existing engine understands.
They do not teach the engine to load KTX2, replace its renderer, change package
GUIDs, or decimate a mesh. Game data and comparison images stay in private local
candidate directories.

## Texture conversion

`ue2-texture-layout.mjs` reads UT2004-era UE2 name/import/export tables, compact
indices, tagged properties and native mip arrays. It checks table/export bounds
and nonoverlap, each lazy-array end, dimensions, mip chain, format byte lengths,
and exact texture export end. Zero-length missing mips are retained: this is an
explicit supported case in the reference serializer (including DemoSkeleton).
Unsupported variants fail closed rather than searching for image signatures.

The grammar was checked against pinned UEViewer
[a0bfb468](https://github.com/gildor2/UEViewer/tree/a0bfb468d42be831b126632fd8a0ae6b3614f981):
[texture/mip serializer](https://github.com/gildor2/UEViewer/blob/a0bfb468d42be831b126632fd8a0ae6b3614f981/Unreal/UnrealMaterial/UnTexture2.cpp),
[mip structure/format enum](https://github.com/gildor2/UEViewer/blob/a0bfb468d42be831b126632fd8a0ae6b3614f981/Unreal/UnrealMaterial/UnMaterial2.h),
[property tags](https://github.com/gildor2/UEViewer/blob/a0bfb468d42be831b126632fd8a0ae6b3614f981/Unreal/UnObject.cpp).

The offline converter decodes original BC pixels, encodes each selected mip to
ETC1S KTX2 with Basis Universal, then verifies the actual browser WASM transcoder
produces the exact original mip byte **length** in BC1 or BC3. The pixel bytes are
lossy. Original metadata, dimensions, offsets and all unselected bytes remain
unchanged. A separate compressed skeleton zeros only accepted mip payloads.
The decoder must overlay only a requested native read's intersections, so a
header read sharing a page with a mip does not trigger an unnecessary transcode.

BC1 punchthrough/masked textures, BC2/DXT3, non-BC formats and unsupported package
variants are not converted. The startup corpus also excludes UI/font/particle
packages, masked/realtime/parametric textures and declared/interface or named
normal/bump/mask/font data. These exclusions are conservative heuristics, not a
proof of every material's semantics.

Basis uses the pinned Apache-2.0 source in `codecs/basis/build.json`. Its
[documented transcoder](https://github.com/BinomialLLC/basis_universal/wiki/How-to-Use-and-Configure-the-Transcoder)
supports the old BC targets. The strict-CSP build uses DYNAMIC_EXECUTION=0 and
EMBIND_AOT; JavaScript unsafe-eval is unnecessary. WASM compilation needs
wasm-unsafe-eval. Original Apache, Zstd and Emscripten notices are included.
`createBasisTextureDecoder()` is lazy; `.prepare()` can prewarm the same module
promise. Its dimensions/output are bounded and each KTX2 is deleted after use.

The actual Chrome module-worker test used strict CSP, compared every decoded
byte SHA against offline WASM output and uploaded reconstructed BC data through
WebGL S3TC without errors. Node tests use only an authored procedural fixture.

### Current candidate quality and size

The trace-selected private corpus contains 10 packages and 500 accepted mips.
It uses q192, retries q255, requires RGB PSNR >= 34 dB, alpha MSE <= 9, maximum
alpha error 16, maximum RGB error 80, and at least 10% saving against an independent
per-mip Zstd15 frame including 384 bytes allowance. Failed gates retain original
payloads. UI/particle packages are not blindly converted.

- Native BC payloads selected: 64,823,296 bytes.
- Corresponding independent per-mip Zstd frames: 39,677,379 bytes.
- KTX2 payloads: 21,312,926 bytes (46.28% lower).
- Minimum accepted RGB PSNR: 34.007 dB. 113 mips needed q255.

These are payload measurements, **not a measured reduction in game startup**.
Headers, unchanged data, the transcoder and actual requested mips also matter.
The reference metric compares decoded 8-bit RGB/alpha; PSNR is not perceptual
equivalence. Private contact sheets include worst accepted and representative
weapon/player/vehicle crops. Reviewed samples have mild smoothing/block changes;
this is not described as perceptually lossless. Native full-corpus playback is
an integration gate, separate from successful codec and package reconstruction.

## Geometry investigation

`ue2-mesh-layout.mjs` validates the UT2004 static render-stream prefix: 24-byte
position/normal vertices, colors, UV arrays, indices and section bounds. The
collision/editor tail stays opaque. Reordering vertices without understanding
that tail can change collision references, so it is not performed.

Pinned [meshoptimizer](https://github.com/zeux/meshoptimizer/tree/f0a684f11ead064e176775c9b796f82a55910e92)
was tested on 243 actual meshes. Exact vertex bytes round-trip with vertex codec
v1, but that alone is usually larger than the existing Zstd stream. For example,
Alleria render vertices are 542KB with Zstd, versus 1026KB meshopt or 848KB after
also Zstd-compressing meshopt. Optional EXP16 quantization still produces 659KB.
Nvidia is an exception: 168KB Zstd versus 113KB EXP16 meshopt. There is no blanket
geometry deployment based on these results.

EXP16 maximum observed position error is 0.0622 **mesh-local** Unreal units;
actor transforms can amplify it. It changes neither triangle counts nor order,
but rendered/collision error is not validated. No geometry codec or decimation
is enabled in the game release.

## Animation investigation

`ue2-animation-layout.mjs` fully validates Version0 MeshAnimation exports in
HumanMaleA, HumanFemaleA and Jugg: 260 clips, 7,639 tracks including root tracks,
original variable quaternion/position/time arrays and notifications. No key
counts/times are changed by the investigation.

Actual meshopt track benchmarks round-trip lossless bytes. EXP16 has maximum
local key rotation error 0.00269 degrees and bone-local translation error 0.00392
Unreal units. These are **not hierarchical pose, skin, ragdoll or rendered error
bounds**. HumanMale independent track outputs total 421KB with EXP16 versus 553KB
lossless meshopt. An ideal concatenated stream is smaller, but excludes the
mapping/container overhead needed to reconstruct scattered UE2 arrays.

[ACL's current raw-track compressor](https://github.com/nfrechette/acl/blob/develop/docs/compressing_raw_tracks.md)
uses uniform sampling and requires matching transform/error metrics and shell
distances. Adapting the engine's variable-key tracks would need additional
sampling, skeleton and pose validation. No ACL conversion, animation runtime
codec or lossy animation deployment is implemented here.

## Full collection execution

The 500-mip corpus above is an integration smoke, not the complete collection.
The full candidate job inventories every file and inspects all recognized UE
package extensions, including nested mod folders and Texture exports embedded
in maps, code, static-mesh, animation or sound packages. It keeps unsupported
serialization, non-color formats, critical UI/masks, quality failures and
unprofitable regions in their original transport. No map or mode is removed.

```
node tools/texture-full-corpus.mjs --inventory-only
node tools/texture-full-corpus.mjs --scan-only --jobs 1 \
 --output .local-runtime/texture-full-inventory
node tools/texture-full-corpus.mjs --jobs 3 \
 --output .local-runtime/texture-full
node tools/texture-corpus-verify.mjs .local-runtime/texture-full
```

The offline CLIs require a Node version with Zstandard and a pinned native
Basis encoder. Build that encoder from the same revision as the transcoder:
`cmake -S .../basis -B .../basis/build-native -DBASISU_EXAMPLES=OFF`, followed by
`cmake --build .../basis/build-native --target basisu -j 6`. `--encoder` selects
its executable. Inputs are existing local files; the tools do not download or
publish game data.

Per-package checkpoints bind compressed input SHA and the conversion policy,
and validate existing encoded payload/container hashes before resuming. Encoded
cache identity includes dimensions, native format, quality, effort and pinned
codec profile. Canonical merging refuses a different payload under an existing
encoded URL. Native mip metadata is unchanged; prefix/layout bytes are never
inferred from a texture signature scan.

The manifest's shared/root asset directories (including QuickScreenshots,
ForceFeedback, Speech and Benchmark) contain 3,915 files, 17.950GB raw and
6.098GB compressed transport. Eight named mod/conversion folders contain 2,996
files, 6.544GB raw and 2.412891GB transport. This filesystem boundary is not a
claim that every root-tree file is first-party content. There are 3,038 recognized
package files to inspect. Shell files are outside this manifest inventory.

Neither these inventory numbers nor per-mip codec ratios establish that the
whole game will fit 200MB or achieve 10× reduction. Full quality-gated coverage,
unchanged assets, deduplication and actual native read demand must be measured.

## Aggressive candidate profile (new user-authorized scope)

The full high-quality job was stopped with its encoded checkpoints retained.
The replacement V5 candidate keeps one region per native mip, but usually encodes
an authored smaller mip: world/terrain cap 128, player/weapon cap 256 (verified
LODSet 2/3 with path fallback), QuickScreenshots cap 256. If no smaller authored
mip exists, an explicit box downsample supplies the encoded image. Critical
fonts/UI/reticles, masked/punchthrough and native normal/height/data textures
remain original. Map-preview images are an explicit UI exception; labels/fonts
are separate unchanged assets.

`encodedWidth`/`encodedHeight` describe KTX2 dimensions; `width`/`height` remain
the original native dimensions. `bcn-upscale.mjs` reconstructs original-format
BC selectors exactly equivalent to nearest-neighbor expansion. BC2 uses the
Basis BC3 color blocks plus explicit 4-bit alpha reconstructed from the KTX2
RGBA alpha. BGRA8 uses RGBA32 transcoding plus the source-verified B/R swizzle.
Tests cover BC1/BC2/BC3 selectors at 2× through 32×, alpha quantization/endpoints,
BGRA channel identity, and arbitrary unaligned range/full-output equality.

`decoder.decodeRange(region, encoded, relativeOffset, length)` returns an owned
array of exactly the requested bytes. It does not allocate a whole native 64 MiB
RGBA mip for a header read. Only small transcoded images are cached, bounded to
8 MiB. Existing `decode()` and `.prepare()` remain supported. Parent fetch/cache
code must validate encoded identity and bounds and use the ranged API for large
regions. Native logical dimensions are intentionally unchanged; this is not a
validated relocating UE package writer. Native Low LOD still controls engine
residency.

V5's codec-error gate is measured at the encoded/capped resolution, NOT against
full-resolution source detail. It uses q128 with q192 fallback, RGB PSNR 30 dB,
alpha MSE 64/max error 34, <=2% pixel mismatches at alpha 128 and <=1% change in
threshold coverage. It does not claim exact source alpha endpoints or perceptual
losslessness. Known visual alpha/specular/shadow/lightmap layers may pass these
gates; normal/height/font/data exclusions stay. This policy was tested once on a
large representative weapon package and checkerboard-composited alpha samples
before the full run resumed.

That package (BWBP_OP_Tex) is 49.13 MB original transport. The V5 candidate is
17.42 MB skeleton plus 1.26 MB UNIQUE KTX2 (region references total 2.72 MB because
large mips share their smaller source image). This is a package-storage example,
not a measured whole-game startup result.

### Active geometry and animation candidates

`tools/geometry-quantize.mjs` emits same-size, source-hashed native byte patches.
Static mesh positions, indices, UVs and opaque collision data remain bit-exact;
only normals lose mantissa precision, bounded to 0.05 degrees. The parser accepts
legitimate zero-face section slots with 65535 vertex sentinels, while validating
all nonempty sections and indices. Geometry data is never reordered/decimated.

Animation key floats retain counts, times, sequence/notify data and hierarchy.
The patcher bounds local quaternion/key and sampled slerp/nlerp error to 0.005
degrees and local translation error to 0.002 Unreal units. Degenerate quaternions
and ambiguous 180-degree arcs remain unchanged. These local bounds do not replace
native rendered hierarchical-pose/ragdoll/movement validation.

Patches need >=3% saving on their individual Zstd15 streams; the parent additionally
checks actual affected package frames and overall merged transport before
acceptance. Reported 20% smoke savings concern PATCH STREAMS, not whole packages.
The emitted schema is `{sourceSha256,size,patches:[{offset,length,sourceSha256,file}]}`,
with files relative to the corpus root. Texture/audio region spans and patches
must be disjoint; the parent builds the single merged skeleton from the original.
All native-validation status remains explicit in separate receipts.

The initial BC1/BC3-only scope described above is superseded for the aggressive
profile: validated BC2 and native BGRA8 now have tested ranged decoders too.
Strict source alpha-endpoint equality was replaced by bounded alpha error and
threshold-coverage gates after representative checkerboard comparisons; no
runtime alpha snapping is performed. Whole-game encoded-size results remain
pending the complete candidate and merged native read trace.
