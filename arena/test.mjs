import assert from 'node:assert/strict';
import fs from 'node:fs';
const p = (
  await WebAssembly.instantiate(
    fs.readFileSync(new URL('movement.wasm', import.meta.url)),
  )
).instance.exports;
const step = (j = 0, c = 0, d = 0, s = 0, x = 0, y = 0) =>
  p.step(1 / 60, x, y, j, c, d, s);
p.reset(1);
step(1);
assert(p.state(2) > 0, 'jump lifts player');
for (let i = 0; i < 35; i++) step();
step(1);
assert(p.state(5) > 0, 'late Matrix double jump');
p.reset(1);
step(1, 1);
assert(p.state(5) > 12, 'super jump');
p.reset(0);
step(1, 1);
assert(p.state(5) < 9, 'classic has no super jump');
p.reset(1);
step(1);
for (let i = 0; i < 20; i++) step(0, 1);
assert(p.state(5) > 0 && p.state(5) < 3, 'hover damps vertical velocity');
step();
assert(p.state(5) > 6, 'release restores pre-hover vertical velocity');
p.reset(1);
for (let i = 0; i < 1000; i++) step(0, 0, 0, 0, 1, 0);
assert(p.state(0) <= 19, 'arena wall collision');
p.reset(1);
step(0, 0, 0, 1);
assert(p.state(6) < 100, 'bullet time drains adrenaline');
for (let i = 0; i < 1000; i++) step();
assert.equal(p.state(2), 0, 'lands on ground');
console.log('7 movement checks passed');
