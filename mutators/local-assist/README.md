# Local Matrix Assist

Authored standalone UT2004 addon: `LocalAim.MutLocalAim`. Tested with the Collection's **3369** browser engine. Compatibility with other engine builds, including 3374, is not established by that test.

Requires the separately obtained original `Matrix2004_v130` package and the authored [MatrixModern compatibility package](../matrix-modern/README.md) for Matrix play. This folder contains only authored addon classes and their compiled package, not the original mod or game assets. Enable LocalAim before the original Matrix mutator so its controller and console commands are installed correctly. Recovery is a separate optional package in [local-recovery](../local-recovery/README.md).

Defaults: full automatic targeting, first-person camera, unlimited Matrix adrenaline, automatic wallrunning near a vertical wall after a moving jump, and **Y** toggles bullet time. Hold Y does not repeatedly toggle. Original Matrix movement remains in control. Wallruns, sideways rolls and wall-exit flips temporarily use third person, then restore the chosen camera preference.

A large **red circle** marks the currently acquired enemy. Assisted shot and weapon direction follow that target while camera look remains manual. A lock requires a living, visible enemy inside the viewport with clear collision traces; looking away or losing visibility releases it. Orange peripheral arcs show incoming damage direction; unknown environmental sources use a ring.

Controls through the normal Unreal console:

- `mutate mmAim auto on|off`: automatic acquisition; off still permits explicit selection.
- `mutate mmAim select 0.5 0.5`: select at normalized viewport coordinates, suitable for a double-tap input bridge.
- `mutate mmAim clear` or `mutate mmAim status`.
- `mutate mmMatrix camera on|off|toggle`: preferred third-person view.
- `mutate mmMatrix wallrun on|off`.
- `mutate mmMatrix time toggle`, or `mutate mmMatrix time mode toggle|hold`.

These commands and features apply only to local standalone play. Native `MMAIM_READY`/`MMAIM_STATUS` telemetry distinguishes the preferred camera (`preferredThird`) from effective and temporary third person (`thirdperson`, `temporaryThird`). `guiActive` identifies native menus/chat so input bridges can preserve their controls. A one-time `COLLECTION_STAGE_RENDERED map=<name>` marker reports a valid world PostRender even before Fire to join; Entry is excluded. Loading UI should combine that evidence with drained transfer/decode queues.

## Native callback safety

`GetViewRotation` reads a recent validated snapshot and performs scalar/vector math. Its helper chain makes no collision traces, camera/projection queries, pose changes, or enemy-pawn dereferences. Ordinary tick/render work refreshes the snapshot; firing independently checks current visibility and the muzzle path. Rendering alone uses Canvas camera/projection queries.

Held target pointers must match a freshly owned pawn in the current controller list before pawn fields are read. HUD restoration requires the current HUD identity; shot telemetry stores a label rather than a retired actor reference. Owner, level, camera and targeting changes invalidate the snapshot before pose restoration. The source guard follows helper calls transitively so moving a trace into another function cannot bypass the camera-accessor boundary.

## Build

Use a matching, user-supplied Windows UT2004 compiler installation with the original Matrix package and its assets already available. No compiler or game data is downloaded by the tool. The script builds the authored assist, recovery and menu-bootstrap packages:

```sh
python3 tools/build-assist.py \
  --compiler-system /path/to/compiler/System \
  --assets /path/to/game \
  --matrix-assets /path/to/original-matrix/Textures
```

On a Wine host, add `--wine /path/to/wine`; for CrossOver, also pass `--wine-bottle your-bottle`. The script preserves stock compiler package order, writes temporary build configuration/logs into the supplied compiler directory, and replaces only the authored packages' build outputs. It copies compiled files into each mutator's System folder and prints their SHA-256 hashes. The menu bootstrap deliberately has no UCL gameplay registration. Run from the repository checkout; arguments are explicit and contain no machine-specific defaults.
