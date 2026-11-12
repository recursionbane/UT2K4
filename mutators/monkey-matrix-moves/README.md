# Monkey Matrix Moves: original UT2004 preservation

This integration uses the authentic **MonkeyMatrixMoves 2004 v130b**, by Adam “MonkeyCircus” Bradley and Rob “[Apoc]Death” Gutermuth. The original already targets UT2004; a new port is unnecessary.

```sh
python3 mutators/monkey-matrix-moves/preserve.py
python3 mutators/monkey-matrix-moves/preserve.py --install '/path/to/UT2004' --bind-b
```

Python 3 and internet access are sufficient. Alternatively, supply `--archive /path/to/MonkeyMatrixMoves2004_v130_selfextractor.exe`. The executable is treated as a ZIP archive and is never executed. Archive and package SHA1 hashes are checked before extraction; installation refuses to replace a different existing package.

The download, complete release, original readme, and **66 recovered original UnrealScript class source texts** are stored in ignored `local/`. These are embedded text buffers, not decompiled bytecode. They exclude serialized `defaultproperties`, so they are research material rather than a complete buildable source release. The original README contains no license or source redistribution grant. Only this independently written recovery tooling and documentation belong in the public repository.

Launch with:

```text
UT2004.exe DM-Rankin?game=XGame.xDeathMatch?Mutator=Matrix2004_v130.MutMonkeyMatrixMoves
```

`--bind-b` binds B to Bullet Time and saves `User.ini.before-monkey-matrix` before changing controls. Stock UT2004 binds B to weapon switching, so enabling the mutator alone does not make B activate Bullet Time. Alternatively, bind Bullet Time in controls. The original console command is:

```text
set input B slowtimedown
```

Choose the mutator's Configuration button for adrenaline, bot activation, movement, projectile weapons, arena, and hover settings. The original README excludes Assault and Onslaught. Start with Deathmatch on Rankin.

This original package loaded successfully on the Windows UT2004 demo **build 3334** under CrossOver on macOS, using a dedicated server on DM-Rankin. This verifies native package/server startup, not client animation, input, or network prediction. Demo UCC does not include the `make` or `batchexport` commandlets; compilation cannot be claimed from this installation.

See [research and provenance](../../docs/mutator-research.md) and [native test record](../../docs/mutator-native-verification.md).
