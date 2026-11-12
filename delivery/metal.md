# Mac graphics and power profiles

This client uses the actual upstream engine's OpenGLDrv → GL4ES → WebGL rendering path. It has no native Metal renderer and does not use WebGPU/wgpu. On supported Mac browsers, WebGL can be translated to Metal by the browser's graphics implementation. [ANGLE documents its Metal backend](https://github.com/google/angle/blob/main/doc/MetalBackendShaders.md); [WebKit's release notes also identify its Metal WebGL backend](https://webkit.org/blog/18482/release-notes-for-safari-technology-preview-255/). A site cannot force the browser's backend or guarantee a hardware renderer.

## Controls

The imported client shell exposes Power, Frame cap and Graphics info controls. Parameters remain scoped to the current local game profile:

| Query | Default resolution | Pixel budget | Default cap | Dynamic DPR limit |
| --- | --- | --- | --- | --- |
| `power=efficient` (default) | 640×480 | 307,200 | 30 | 1 |
| `power=balanced` | 960×540 desktop; 640×480 touch | 921,600 | 60 | 1 |
| `power=quality` | 1280×720 | 2,073,600 | 60 | 2 |

`fps=30`, `fps=60` or `fps=native` overrides the cap. Native keeps upstream scheduling. The profile still controls pixel budget. An explicit `res=WxH`, the resolution picker, and dynamic sizing are constrained by that profile's budget, preserving aspect ratio except at the minimum 320×240 limits. Choosing a new power profile clears the explicit resolution query. No profile promises a particular frame rate; these are upper limits.

The cap is installed in the Emscripten `Module.postRun` hook and replaces only `MainLoop.requestAnimationFrame`. It uses the browser's native RAF timestamp to skip engine callbacks until the target interval has elapsed, and selects upstream RAF timing mode. It leaves the mobile input library's and all other RAF callbacks untouched. Unit tests simulate a 120 Hz display and verify 30/60 caps. This is real scheduling control, rather than a CSS animation change or an unverified legacy INI frame-rate setting.

When hidden, the capped engine callback does not run. RAF is normally suspended by the browser in background tabs, and the imported shell already suspends its audio context on visibility loss. This follows the browser's existing [background scheduling policy](https://developer.chrome.com/blog/background_tabs/); the adapter avoids manually tearing down or resuming the game loop. Backgrounding a multiplayer tab can therefore suspend simulation/network work as in the upstream client. This site primarily starts local sessions.

`Module.powerEvidence` reports the selected profile, target, scheduler installation, callback count and observed scheduler frequency over approximately one second. Graphics info reports the existing engine context's API, vendor/renderer (where browser privacy allows), framebuffer resolution and power evidence. It never creates a competing graphics context. This diagnostic indicates the selected graphics path and callback frequency; it does not measure GPU execution time, CPU utilization or electricity use.

## Evidence on this Mac

2026-11-12, fresh headless installed Google Chrome 157, default graphics flags:

- WebGL API: `WebGL 2.0 (OpenGL ES 3.0 Chromium)`.
- Renderer: `ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Max, Unspecified Version)`.
- Vendor: `Google Inc. (Apple)`.

This is a real local browser context probe, not a claim that the game has been rewritten for Metal. Safari was not tested in this check. Four adapter browser checks also passed desktop automatic input, touch automatic input, forced touch off and forced touch on, including Matrix TIME key dispatch and both session INI bindings. Full-engine visual/gameplay evidence is tracked separately by the native runtime probes.

The implementation reduces the amount of work requested through lower pixel counts and optional frame caps. No wattage, battery-life or frames-per-watt benchmark was performed. Efficient is a conservative workload default, not a proven optimal point for every Mac.

## Developer hooks

`nativePowerProfile(name, touch)`, `nativePixelBudget(width, height, profile)`, `installNativePowerLoop(profile, requestedFPS)` and `nativeGraphicsInfo()` live in `native-import.js`. The shell embeds original adapter functions into the locally imported upstream shell at response time. It does not modify or redistribute the engine binary. Run `node delivery/test-native-import.cjs /path/to/ut2004-web-v0.2.0.tar.gz` to verify import fingerprints, profile budgets, actual scheduler behavior, route delegation and generated shell syntax.
