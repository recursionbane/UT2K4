# Matrix movement research and preservation

Research date: 2026-11-12.

## Identity and lineage

The recovered original README identifies **MonkeyMatrixMoves 2004 v130b**, created by Adam “MonkeyCircus” Bradley (MonkeyMatrix) and Rob “[Apoc]Death” Gutermuth (APOC Matrix Moves). It describes MonkeyMatrix beginning in **UT2003**, merging with APOC Matrix Moves, then being ported to UT2004. Its 2004 changes include movement afterimages and additional configuration.

The similar UT99 mod is **Matrix Moves**, with a Beta 4 release and seven movement features, preserved separately on [ModDB](https://www.moddb.com/mods/matrix-moves). Its older Linux compatibility is documented by [OpenUT](https://openut.sourceforge.net/mods.php.html). Do not label UT99 Matrix Moves as MonkeyMatrixMoves or infer a shared source lineage from similar names. The original UT99 author and source license were not established in this research.

## Exact 2004 release

[Unreal Archive release record](https://unrealarchive.org/unreal-tournament-2004/mutators/M/monkey-matrix-moves-2004_fded10fc.html) identifies the authors, archive, and individual package hashes. The original archive contains seven files: three System files, two textures, installation text, and HTML readme. The archive was downloaded successfully from the EU mirror; the Azure US mirror returned 403.

| Artifact | SHA1 |
| --- | --- |
| `MonkeyMatrixMoves2004_v130_selfextractor.exe` | `fded10fc61067161084d69b8d1f3afe01c1b951d` |
| `System/Matrix2004_v130.u` | `c8097fe4a47fc84531b409f0002bb4257062ff55` |
| `Textures/matrixrings.utx` | `5c638195981dd6632c2a92aeeffaccdb0d8e4a92` |
| `Textures/MonkeyMatrixInterface.utx` | `32faf8c8dd334ebbc6ebfbd83c22d57cbbfbdf69` |

Pinned content-addressed mirror path:

```text
https://unreal-archive-files-eu.s3.de.io.cloud.ovh.net/Unreal%20Tournament%202004/Mutators/M/f/d/ed10fc/MonkeyMatrixMoves2004_v130_selfextractor.exe
```

The original publisher URL named by its README was `http://www.planetunreal.com/proleague/thematrix.html`; its forum was `http://www.apoc.org/mmforums/`. These are historical references, not verified live download services.

## Source recovery and rights

The `.u` package retains plaintext UnrealScript. The repository's recovery script verifies the exact package, extracts 66 embedded class source texts, and records a local manifest. It does not decompile bytecode. Source text includes the movement controller, pawn, mutator, combo, weapons, UI, and effects. Serialized default properties live elsewhere in the package and are not reconstructed by this tool.

No explicit redistribution or modification license appears in the original README or installation file. Public availability and embedded source do not establish source publication rights. Consequently the original archive, binaries, textures, readme, and recovered source stay in an ignored local directory. A repository clone can reproduce local recovery using the pinned URL and hashes. No author was contacted or permission represented as obtained.

## Mechanics verified against original local release

The release README describes bullet time, arbitrary-timing double jump, crouch hover, air dodge, super jump, and wall run. [The mirrored release description](https://www.moddb.com/games/unreal-tournament-2004/downloads/monkey-matrix-1-3-0) also lists the original controls. For exact implementation research, recover and inspect these original files locally:

| Original class | Relevant behavior |
| --- | --- |
| `MutMonkeyMatrixMoves` | Configuration, package setup, controller replacement, weapons and pickups |
| `MatrixPlayer` | `slowtimedown` command, hover/roll/wall-run states and movement replication |
| `MatrixPawn` | Directional dodges, world-geometry wall trace, crouch jump and double jump |
| `Bullettimecombo` | Game-speed smoothing, adrenaline consumption, activation/deactivation |

Additional implementation findings: wall run enters spider physics after a short directional world-geometry trace; hover enters flying physics and restores saved velocity on exit; falling dodges cancel downward velocity before applying the dodge; first-person rolls are controller states. These are observations of locally recovered code, not copied implementation in the browser toy.

The mutator is a controller/pawn/weapon replacement with configuration and networking, substantially more than a global slow-motion command. The original declares standard gametype support but excludes Assault and Onslaught. Multiplayer support is stated in its README. Modern patch compatibility and client movement have not been established by the server smoke test.
