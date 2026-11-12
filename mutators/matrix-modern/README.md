# MatrixModern compatibility adapter

This independently written UnrealScript mutator restores the original MonkeyMatrixMoves 2004 v130b controller on modern UT2004 data. It contains no original MonkeyMatrix source or assets.

The old mutator sets `PlayerControllerClassName` during login. Modern `GameInfo.Login` prefers an already cached `PlayerControllerClass`, which leaves the player using ordinary UT2004 movement. This adapter sets the cached class and pawn class explicitly, letting **the original compiled MatrixPlayer and MatrixPawn implement all movement**.

Enable both:

```text
?Mutator=Matrix2004_v130.MutMonkeyMatrixMoves,MatrixModern.MutMatrixModern
```

Install with the adjacent preservation tool:

```sh
python3 mutators/monkey-matrix-moves/preserve.py --install '/path/to/UT2004' --bind-b --modern-compat
```

The adapter logs `MATRIX_COMPAT_LOGIN` and `MATRIX_COMPAT_PLAYER` so integration tests can distinguish authentic Matrix controllers from ordinary `xPlayer`/`xPawn`. Its original package dependency is loaded dynamically and is not redistributed here.

## Build

The included `System/MatrixModern.u` was compiled with the full original DVD Windows `UCC.exe` and matching original System packages under CrossOver. The compiler reported **0 errors, 0 warnings**. Windows UCC cannot load modern 3374 Core packages; use a matching full Windows compiler installation for rebuilding.

Copy `Classes/MutMatrixModern.uc` to `<game>/MatrixModern/Classes/`, add `EditPackages=MatrixModern` under `[Editor.EditorEngine]` in a build INI, then run from `<game>/System`:

```text
UCC.exe make -ini=MatrixBuild.ini
```

The result is `System/MatrixModern.u`; UCC also generates its `.ucl` mutator registration file. The source and compiled adapter are this project's own code. The original MonkeyMatrix package remains separately downloaded and local.
