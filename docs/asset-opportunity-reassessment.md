# Reassessment of the 3.35 GB release

The November 17 review used the published 3,350,065,331-byte profile, all 861 retained maps, and the recorded cold protected-release run through the menu, Rankin and Deck17. Decimal MB are used throughout. Storage savings, phase transfer and latency have different denominators. The experiments below overlap and their results cannot be added into a forecast.

## Entering a match

In the live run the menu transferred 35.39 MB and verified 155.75 MB of decode output. The Rankin load transferred another 31.40 MB and verified 272.07 MB of decode output. The latter took about 66 seconds from request to render readiness. A byte count alone does not explain that delay.

* Matching recorded decode demand to both shipped bundles found 214 distinct missing payloads totaling 1,017,204 bytes, including 189 Opus clips. Rebuild bundle membership from several runs to separate stable startup reads from bot- or spawn-dependent sounds. One encoded pack received 160 requests for distinct slices totaling 693,432 bytes. Its full size was 3,344,421 bytes. A bundle containing just those slices would cost around 0.69 MB plus its directory. A whole-pack fetch would cost 2.65 MB extra. Rankin also fetched 54 package indexes. A match-specific index bundle and demand-selected range bundle are worth a paired cold-start test using the production access gate.
* The encryption gateway reads and authenticates a complete ciphertext object for an asset range. Replaying the recorded 206 responses against the sealed manifest gave 600 menu ranges for 9.07 MB across objects totaling 35.63 MB, then 1,246 match ranges for 20.26 MB across objects totaling 53.27 MB. A sequential replay of only those requests with an initially empty two-object cache would decrypt 85.07 MB and 128.63 MB respectively. These are modeled edge bytes. Worker reuse, concurrent requests, non-range reads and actual cache residency were not observed. Measure ciphertext reads, decrypted bytes and wait time at the gateway before changing object sizes or cache limits.
* Skeleton range traffic dominated both phases. There were 600 menu and 1,032 match requests, including 92 and 288 repeated exact ranges respectively. Repeats accounted for 2.00 MB and 2.48 MB of response bodies. The trace lacks cache touch and eviction events, so it cannot support a reliable prediction that a larger phone cache would fix these repeats. Instrument the 32 MiB page cache before increasing it.
* A phase-specific pack can be prepared offline while keeping the server-side unlock boundary. Compare the same map, hash-bound asset profile and network conditions over repeated baseline and candidate runs. Measure menu time, time to first controllable pawn, body bytes and peak decoded memory separately.

## Storage experiments

**Extend the shipped frame encoder to maps and textures first.** The preceding release tried both Zstd encoder modes on meshes and animations only. Applying the same lossless per-frame choice to six complete maps (Rankin, Deck17, Torlan, Tintagel, Convoy and BridgeOfFate) took their frames plus indexes from 27.00 MB to 24.08 MB, a measured 2.92 MB saving. The existing transcoder verified the bytes of each frame and preserved its 256 KiB request granularity. Tintagel contributed 1.84 MB, so the six-map percentage should not be extrapolated.

A separate uniform sample without replacement took 1,200 of all 49,847 map frames. On 1,045 frames the alternate encoding was smaller. Keeping the smaller encoding saved 3.60 MB in the sample and projects to **149.6 MB** across map frames (estimated sampling standard error 6.2 MB). A sample of 300 of 29,311 texture-package frames projects to **23.2 MB** (standard error 4.9 MB). Whole-corpus index size changes are excluded from these projections. A full offline conversion with a per-package size gate would give exact numbers and requires no new browser decoder.

**Exact aliases before format changes.** Across 89,019 deployed frames, 38.32 MB of compressed frame bytes are exact repeats. Another 12.64 MB are exact repeated unframed file bodies in 609 groups, including four Ogg duplicates totaling 10.63 MB. These figures measure redundancy in the active file inventory. File aliases retain separate logical paths, and a frame pool needs a range map and request grouping. The measured storage opportunity overlaps both sibling-map patches and the same-frame encoder pass. Recompute it after choosing canonical frame encodings. Simply aliasing a file does not save a first visit that requests only one copy.

**Index storage and transfer.** Independently deflating the 2,445 existing package indexes took their aggregate size from 57.36 MB to 11.46 MB. HTTP compression already handles many responses and the menu bundles its startup indexes. The 45.90 MB difference is a storage comparison. For entering Rankin, prioritize eliminating the 54 index round trips over changing the JSON representation.

**Related map variants.** Grouping framed maps by filename after removing the game-mode prefix found 50 groups for investigation. I tried four deliberately chosen pairs using a stock Zstd level-15 reference patch. I reconstructed the current package frames individually and verified every patched target against its current decompressed skeleton. The reference was already represented in the library.

| Target skeleton | Current frames | Standalone whole file | Delta using sibling |
|---|---:|---:|---:|
| KF-Abyss-Lite | 6.02 MB | 4.81 MB | 2.81 MB |
| CTF-BridgeOfFate | 5.49 MB | 4.20 MB | 3.22 MB |
| KF-ArcticStronghold | 1.74 MB | 1.68 MB | 0.71 MB |
| DOM-UCBP-Echo | 1.20 MB | 1.17 MB | 0.10 MB |

The reference contributed **5.01 MB** beyond ordinary whole-file compression across these four targets. A first-time player would have to obtain the reference too. For runtime use, try a bounded, independently decodable page with a small shared dictionary, and measure cold single-map bytes and memory. Whole-file patches are a stronger fit for an offline archive. Exact duplicates should be handled first.

**Embedded images.** Across all 861 maps, retained non-small, non-interface color mips outside the screenshot-name group occupied 524.44 MB raw but just 44.47 MB when independently compressed at Zstd level 9. The name-selected screenshot/preview group occupied 96.49 MB raw and 54.34 MB with the same method. Other interface-class images occupied 178.35 MB raw and 85.28 MB in this probe. These are independent mip costs, not marginal savings on the deployed frames. The interface class includes skybox faces, panoramas and genuine UI. Classify by actual material or screen use and test selected images at display size before lowering resolution. Keep text-bearing credits, fonts and gameplay data distinct.

**Terrain.** A private encoder trial relaxed a grid regularity rejection while preserving exact reconstruction and recovered 13 previously retained actors for 2.18 MB of additional package savings. Reusing an existing height texture is more promising: removing the redundant height codes from 561 selected payloads reduced their encoded size by 18.94 MB before dependency and metadata costs. The 20 highest-saving actors plus Torlan all matched the height texture actually referenced by their map, accounting for 3.79 MB of that estimate. The remaining actors need map-by-map source binding, and a separate height fetch must not introduce circular reads. A separate pass through the 30 previously skipped maps preserved each property payload and used its declared boundary to reach the native data. Strict parsing and exact reconstruction recovered 28 of 67 actors. Four already-framed and ten newly framed maps saved a combined 7.76 MB after index and framing costs. The remaining 39 actors still failed validation. Positive candidates below the original one-percent package threshold totaled only 0.80 MB.

**Editor data and Model shadows.** In six selected maps totaling 44.15 MB of current frames and indexes, a diagnostic that zeroed all explicitly editor-flagged Model/Polys/Brush payloads saved 1.46 MB. Zeroing every parsed Model shadow mask saved 1.75 MB. Combining both saved 3.21 MB. These are fixed-layout counterfactuals on a selected sample. The flags alone do not establish safe removal, and eliminating masks changes lighting. Retain the safer RGB4 profile. A package-format rewrite with a different layout would need a separate benchmark.

## Remaining scope

The 100 largest maps account for 583.74 MB of the 1,720.02 MB map bases. Even removing every byte from those 100 would leave over 1.13 GB of map bases. The music category alone is 367.20 MB with the selected mono VBR profile. Reaching 200 MB across the entire library would require additional changes to that category as well. Streaming already allows a much smaller working set for one match.

The release has browser-level touch and Metal evidence. Physical iPhone memory pressure, sustained touch play and energy per frame still need hardware measurements. The public repository contains authored source, recovery tools and original-source fingerprints. Fully reproducible private builds would also benefit from publishing a sanitized, parameterized version of the final assembly and validation workflow that takes an operator-supplied catalog.

## Local evidence

The probes read the frozen release with candidate SHA-256 `4de10542cefa77bf2c3c5cac391ef4a8c1bc5779d9f962882764d4b63b3f632a`. The checkout retains the measurements under `.local-runtime/`:

| Measurement | Result file |
|---|---|
| Complete map encoder pilot and stratified frame sample | `reassess-encoder-pilot.json`, `reassess-frame-encoder.json` |
| Frame and file duplicates and index sizes | `reassess-delivery.json` |
| Reference-compressed map variants | `reassess-map-pairs.json` |
| Retained map pixels | `reassess-pixels.json` |
| Range-to-envelope replay and bundle membership | `reassess-envelope.json`, `instance-lighting/latest-live-bundle-audit.json` |
| Exact terrain recovery trials | `terrain/reassessment/summary.json` |
| Six-map editor/shadow diagnostic | `model-upper-bound-current.json` |
