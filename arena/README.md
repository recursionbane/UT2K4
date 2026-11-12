# Movement laboratory

Original standalone C / WebAssembly movement approximation and Canvas arena. No Epic code, UT assets, game data, emulator or original mutator is included. This is not a browser port of UT2004 or an authentic playable demo. Bots are roaming shooting targets; they do not attack or navigate like UT bots.

Run from the repository root with `python3 -m http.server 8000`, then open http://localhost:8000/arena/ . Loading directly via file:// cannot fetch WebAssembly in most browsers.

## Rebuild

Install LLVM with a WebAssembly linker or Emscripten. Run `./arena/build.sh` (defaults to `wasm32-clang`, available with Homebrew Emscripten). Set `WASM_CC=/path/to/clang` if needed. No runtime libraries or imported functions are used. The included `movement.wasm` is built from `movement.c`.

Run `node arena/test.mjs` from repository root for physics tests. `node --check arena/arena.js` verifies JS syntax. Optional browser smoke test: install Python Playwright and its Chromium browser, start the HTTP server on 8014, and run `python3 arena/qa_browser.py`. Set `ARENA_URL` to override the URL and `CHROME_PATH` to use an installed Chrome executable. The test uses separate desktop and touch contexts, checks real jump controls, load errors and overflow, and writes screenshots under /tmp.

## Controls and scope

WASD / arrows move; Enter arena captures mouse; Escape releases it. Space jumps, C or Shift crouches/hovers, B toggles bullet time (75 adrenaline needed to begin), F or click shoots. Double-tap a direction to dodge. Mutator mode allows late double jump, hover with damped flight up to seven seconds once per jump (restoring entry vertical velocity on release), superjump with crouch+jump, one airborne dodge per flight and a brief wall-run initiated by dodging toward and holding into the wall. Jump during wall-run flips off. Classic mode disables mutator extras, retaining ground dodge and early double jump.

Coarse-pointer devices automatically get a move pad and action buttons; drag the right arena area to look. Touch controls can also be toggled manually. Hold Hover then tap Jump for a superjump. Dodge follows the movement pad direction. Inputs are cleared on focus loss.

The arena uses approximate tunable constants in metre/second units rather than Unreal units. Collision is an empty 38 m square. Projectile simulation, weapon parity, wall-contact animations, UT air control, and original configurable mutator parameters are outside this approximation. Bullet time scales player physics and target motion; firing is hitscan with a 180 ms game-time cooldown. These are deliberate simplifications, not claims of game parity.

Mechanic references: [Monkey Matrix 1.3.0](https://www.moddb.com/games/unreal-tournament-2004/downloads/monkey-matrix-1-3-0), supplied alongside archive research. No third-party runtime dependencies.
