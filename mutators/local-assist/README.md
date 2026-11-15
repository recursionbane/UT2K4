# Local Matrix Assist

Authored standalone UT2004 addon: `LocalAim.MutLocalAim`. Tested with the Collection's **3369** browser engine. Compatibility with other engine builds, including 3374, is not established by that test.

Requires the separately obtained original `Matrix2004_v130` package for Matrix play. This folder contains only authored addon classes and their compiled package, not the original mod or game assets. Enable LocalAim before the original Matrix mutator so its controller and console commands are installed correctly. Recovery is a separate optional package in [local-recovery](../local-recovery/README.md).

Defaults: full automatic targeting, first-person camera, unlimited Matrix adrenaline, automatic wallrunning near a vertical wall after a moving jump, and **Y** toggles bullet time. Hold Y does not repeatedly toggle. Original Matrix movement remains in control. Wallruns, sideways rolls and wall-exit flips temporarily use third person, then restore the chosen camera preference.

A large **red circle** marks the currently acquired enemy. Assisted shot and weapon direction follow that target while camera look remains manual. A lock requires a living, visible enemy inside the viewport with clear collision traces; looking away or losing visibility releases it. Orange peripheral arcs show incoming damage direction; unknown environmental sources use a ring.

Controls through the normal Unreal console:

- `mutate mmAim auto on|off`: automatic acquisition; off still permits explicit selection.
- `mutate mmAim select 0.5 0.5`: select at normalized viewport coordinates, suitable for a double-tap input bridge.
- `mutate mmAim clear` or `mutate mmAim status`.
- `mutate mmMatrix camera on|off|toggle`: preferred third-person view.
- `mutate mmMatrix wallrun on|off`.
- `mutate mmMatrix time toggle`, or `mutate mmMatrix time mode toggle|hold`.

These commands and features apply only to local standalone play. Native `MMAIM_READY`/`MMAIM_STATUS` telemetry distinguishes the preferred camera (`preferredThird`) from effective and temporary third person (`thirdperson`, `temporaryThird`). `guiActive` identifies native menus/chat so input bridges can preserve their controls.

## Native callback safety

Aim/view overrides use cached camera scalars and collision traces. They never invoke native view calculation recursively or use a transient Canvas outside `PostRender`. Rendering alone queries camera/projection; firing is guarded against re-entry, and releasing a target clears its reference before restoring the body pose. This specifically avoids the callback cycle `GetViewRotation → aim → PlayerCalcView → GetViewRotation` when visibility changes around a corner.

## Build

Use a matching, user-supplied Windows UT2004 compiler installation with the original Matrix package and its assets already available. No compiler or game data is downloaded by the tool. The script builds both authored packages:

```sh
python3 tools/build-assist.py \
  --compiler-system /path/to/compiler/System \
  --assets /path/to/game \
  --matrix-assets /path/to/original-matrix/Textures
```

On a Wine host, add `--wine /path/to/wine`; for CrossOver, also pass `--wine-bottle your-bottle`. The script preserves stock compiler package order, writes temporary build configuration/logs into the supplied compiler directory, and replaces only the two authored packages' build outputs. It copies compiled `.u`/`.ucl` files here and into local-recovery, and prints their SHA-256 hashes. Run from the repository checkout; arguments are explicit and contain no machine-specific defaults.
