import assert from 'node:assert/strict';
import test from 'node:test';
import { installTouchPointerMode } from './touch-pointer-mode.mjs';
import { menuStartupScript } from './startup-policy.mjs';

test('touch sticks keep absolute coordinates and a real mouse can still request raw input', async () => {
  class Canvas {
    requestPointerLock(options) { this.options = options; return 'mouse'; }
  }
  const events = new Map();
  const doc = {
    pointerLockElement: null,
    addEventListener(name, listener) { events.set(name, listener); },
    exitPointerLock() { this.pointerLockElement = null; },
  };
  const canvas = new Canvas();
  installTouchPointerMode({ document: doc, HTMLCanvasElement: Canvas, navigator: { maxTouchPoints: 1 } });
  assert.equal(await canvas.requestPointerLock(), undefined);
  doc.pointerLockElement = canvas;
  events.get('pointerlockchange')();
  assert.equal(doc.pointerLockElement, null);
  events.get('pointerdown')({ isTrusted: true, pointerType: 'mouse', sourceCapabilities: { firesTouchEvents: true } });
  assert.equal(await canvas.requestPointerLock(), undefined);
  events.get('pointerdown')({ isTrusted: true, pointerType: 'mouse' });
  const options = { unadjustedMovement: true };
  assert.equal(canvas.requestPointerLock(options), 'mouse');
  assert.equal(canvas.options, options);
  doc.pointerLockElement = canvas;
  events.get('pointerdown')({ isTrusted: true, pointerType: 'touch' });
  assert.equal(doc.pointerLockElement, null);
  assert.ok(menuStartupScript([]).includes(installTouchPointerMode.toString()));
});
