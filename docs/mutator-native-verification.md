# Native original-mutator verification

Executed 2026-11-12 on macOS, using installed CrossOver with a separate `ut2k4-matrix-check` Windows XP bottle. Runtime: Windows UT2004 demo, version **3334**, build dated 2004-09-21. A cloned installation at `/tmp/mmm-research/native` kept this experiment independent of the other game setup.

## Recovery and integration checks

- Original archive SHA1 and all three Unreal Archive package SHA1 values matched.
- Seven expected archive files recovered without executing the self-extractor.
- 66 embedded source text buffers recovered, without serialized default properties.
- Installation copied original System/Textures files into the cloned game.
- A deliberately corrupt archive was rejected.
- Installation into a test game containing a different same-name package was rejected, preserving that file.

## Runtime command

```sh
'/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin/wine' \
  --bottle ut2k4-matrix-check \
  --workdir /tmp/mmm-research/native/System \
  /tmp/mmm-research/native/System/UCC.exe server \
  'DM-Rankin?game=XGame.xDeathMatch?Mutator=Matrix2004_v130.MutMonkeyMatrixMoves?NumBots=2?Port=7999' \
  -unattended -log=MatrixNative.log
```

Selected startup evidence:

```text
Init: Version: 3334 (128.29)
Log: Executing Class Engine.ServerCommandlet
Log: Game class is 'xDeathMatch'
Log: Bringing Level DM-Rankin.myLevel up for play (20)
ScriptLog: Mutators Matrix2004_v130.MutMonkeyMatrixMoves
ScriptLog: GameInfo::InitGame : bEnableStatLogging False
Log: UdpServerQuery(crt): Port 8009 successfully bound.
```

The server continued running until deliberately stopped. No mutator-package import failure or fatal error appeared. The demo emitted missing optional texture warnings and obsolete master-server DNS failures. The raw log is preserved in ignored `mutators/monkey-matrix-moves/local/native-server.log`, as well as with the cloned runtime.

This establishes that the original UT2004 mutator can be loaded into this demo's native dedicated-server path. It does **not** establish successful human-player login, functioning client rendering, input bindings, movement replication, or completed matches. These need interactive client verification.

`UCC.exe help` listed `compress`, `decompress`, `exportcache`, `help`, `mastermd5`, `server`, and `umodunpack`. `batchexport` returned “Commandlet batchexport not found”; `make` was not listed. This demo cannot serve as the source-compilation toolchain.

## Follow-up client startup (historical demo probe)

Before the user selected full-game testing, the isolated CrossOver client was also launched with the original mutator. Its log reached `New Player`, `Opened viewport`, and D3D device creation. A software-renderer retry reached geometry precaching. This proves a further startup milestone, not interactive Matrix controls or completed gameplay. These experiments were stopped when scope changed to the full game.

The recovered `MatrixPlayer.uc` declares `exec function slowtimedown()` at line 107; it checks adrenaline before creating the original bullet-time combo. Stock `User.ini` instead binds B to `SwitchToLastWeapon`. The optional `preserve.py --install ROOT --bind-b` now performs the explicit correct binding while preserving a backup.

## Full game: native WebAssembly headless verification

The scope then changed to the full game. A separate APFS clone of the verified OldUnreal **3374-preview-23** installation was created at `/tmp/ut2k4-full-matrix`. The original v130b mutator and explicit B binding were installed there. No shared vanilla test installation was changed.

The native `ut2004-wasm` v0.2.0 headless engine (a source port, distinct from the earlier Wine emulation experiment) ran this configuration:

```sh
UT2004_BASE=/tmp/ut2k4-full-matrix/System \
UT2004_MAP='DM-Rankin?Mutator=Matrix2004_v130.MutMonkeyMatrixMoves?Port=7997' \
UT2004_HEADLESS_BOTS=8 UT2004_HEADLESS_TICKS=600 \
node /tmp/ut2k4-native-release/ut2004-node/ut2004.js
```

Observed result: **clean exit 0**, with the original mutator and Matrix assault-rifle classes loaded. The engine emitted:

```text
WASM_HEADLESS_PROOF: map=DM-Rankin game=XGame.xDeathMatch ticks=600 controllers=26 controlledNonVehiclePawns=8 botPawns=8 requestedBots=8
WASM: bounded loop complete
WASM: clean exit
```

Raw output is preserved in ignored `mutators/monkey-matrix-moves/local/full-native-matrix.log`. This verifies original UnrealScript package loading and a running bot match in the full-game native WASM engine. Bots use ordinary `xPawn`; human login is where the original mutator selects `MatrixPlayer`, so this does not by itself prove the human movement controller or bullet-time gesture.

A browser-specific preparation issue was identified: the headless engine updates `System/CacheRecords.ucl`. HTTP manifests must be generated **after** headless runs complete; otherwise cached file lengths cause an HTTP range-size abort. This was corrected before the isolated full-game Matrix browser run.

## Modern controller compatibility correction

The original package alone rendered a match, but human login still used ordinary `xPlayer`/`xPawn`: modern `GameInfo.Login` prioritizes cached `PlayerControllerClass`, while v130b only sets `PlayerControllerClassName`. A package-load-only test would have missed this.

The independently written `MatrixModern.MutMatrixModern` adapter explicitly selects `Matrix2004_v130.MatrixPlayer` and `Matrix2004_v130.MatrixPawn` during login. It delegates all movement to the unchanged original package. Its source, compiled `.u`, and generated `.ucl` are under `mutators/matrix-modern/`. Compiling against the original full DVD Windows compiler and matching packages reported **0 errors, 0 warnings**. Compiled SHA256: `933c15c949055d9aeab1c5f709da12a409b088102ad5681e116f9f13972b17d8`.

After enabling both mutators in the full native browser engine, `MatrixPawn` loaded and pressing B displayed the original message **“Not enough adrenaline, 75 required”** during the rendered Rankin match. That directly exercises the original `MatrixPlayer.slowtimedown` command. The recovered release's runtime threshold is 75; a contemporary external description mentioning 50 is not its authoritative default.

Actual full-game control bindings were checked: `C=Duck`, `Shift=Duck`, `Ctrl=Jump`, `Space=Jump`. Consequently touch hover should use C or Shift, and cannot assume Ctrl means crouch.

## Full browser: original human controller and owned movement

The full native WebAssembly browser match with both mutators emitted:

```text
MATRIX_COMPAT_LOGIN: controller=Matrix2004_v130.MatrixPlayer pawn=Matrix2004_v130.MatrixPawn
MATRIX_COMPAT_PLAYER: pawn=Matrix2004_v130.MatrixPawn controller=Matrix2004_v130.MatrixPlayer
```

After the match countdown, telemetry reported `pawn=true`. Holding W for 700 ms moved that owned pawn **307.91 Unreal units** (position approximately `[4724.30,448,-366.15]` to `[4416.40,449.42,-366.15]`). The page raised no errors, and native frame evidence reported zero GL/WebGL errors. This establishes authentic class selection and actual owned-player motion, rather than spectator-camera motion.

The rendered original B-command response and compact telemetry are saved under `delivery/native/evidence/matrix-original-command.png` and `matrix-controller-proof.json`. Full browser logs remain ignored in the preservation folder. Complete wall-running, air-dodge, and multiplayer prediction coverage is not established by this smoke test.

## Full browser: original bullet time and crouch hover

For a bounded input check, the isolated test data used the original mutator's supported settings `AdrenalineBasedOnPlayers=False` and `AdrenalineRegenRate=0.05`. This accelerates adrenaline regeneration for QA; the original 75-point start threshold and movement implementation were unchanged. These test settings are disclosed in `matrix-activation-proof.json` and are not installed by the preservation tool.

Pressing B after regeneration displayed the original **“The Matrix has you…”** and **“You have started your bullet time combo”** messages. Adrenaline decreased from 100. Full original defaults confirm 40% time speed and 0.5-second smoothing.

The owned original MatrixPawn then jumped from Z≈49.85 to 76.88. Holding **C** entered its hover behavior: Z≈121.93 after the initial hold and 131.21 after a further 2.5 seconds, still airborne; releasing C resumed descent to Z≈105.96. The slight upward drift matches the original hover's flying physics and drag, rather than a perfectly stationary freeze. A generic Shift alias did not sustain hover in the browser test; literal C did. Touch hover uses KeyC.

This run also measured ~327 units of owned walking, recorded no page exceptions, and reported zero GL/WebGL errors in native frame evidence. The final activation screenshot, sustained-hover screenshot, class logs, input positions, and disclosed settings are under `delivery/native/evidence/matrix-{bullet-time.png,hover.png,activation-proof.json}`. Wall running, air dodging, and multiplayer prediction were not covered by this focused verification.

## Additional original movements: one focused browser run

A final bounded real-input run used the same original MatrixPlayer/MatrixPawn, full 3374 data, adapter, 40% bullet time, and disclosed accelerated-regeneration QA settings. Every sampled action retained `pawn=true`; no page exceptions occurred and frame evidence reported zero GL/WebGL errors.

- **Late double jump:** after the initial jump, the pawn had begun descending (Z≈−249.41 to −252.78). A second Space gesture 1.3 real seconds later restored upward movement, reaching Z≈−159.33: a rise of **93.46 units** from the descending sample.
- **Air dodge:** while still airborne, A was held for 70 ms, released for 90 ms, then held for 120 ms. The pawn moved **163.71 horizontal units**, and camera roll reached approximately **−95.8°**, visibly rotating the original first-person view.
- **Crouch jump:** after landing at Z≈−270.10, holding C before Space raised the pawn to Z≈−92.09, a rise of **178.01 units**. This exceeds an ordinary jump's standard-gravity maximum and is consistent with the original 800 crouch-jump speed.

Telemetry, exact input timings, source-class proof lines, and the test settings are in `delivery/native/evidence/matrix-additional-moves-proof.json`; screenshots are `matrix-late-jump.png`, `matrix-air-dodge.png`, and `matrix-crouch-jump.png` beside it. Wall running was not attempted in this focused pass, because locating and validating an appropriate wall contact would require a separate controlled setup. Multiplayer movement prediction also remains unverified. No additional movement runs were performed after this pass.
