// A locked canvas reports zero client coordinates to Chrome touch pointer
// events. The on-screen sticks need absolute positions while the mouse uses
// relative deltas. Select the mode before SDL processes the input event.
export function installTouchPointerMode(scope) {
  const doc = scope.document;
  const canvasType = scope.HTMLCanvasElement;
  const prototype = canvasType?.prototype;
  const request = prototype?.requestPointerLock;
  if (!doc || typeof request !== 'function') return;
  let touch = scope.navigator?.maxTouchPoints > 0 || !!scope.matchMedia?.('(pointer: coarse)').matches;
  function releaseCanvas() {
    if (touch && doc.pointerLockElement instanceof canvasType) doc.exitPointerLock();
  }
  doc.addEventListener('pointerdown', event => {
    if (!event.isTrusted) return;
    if (event.pointerType === 'touch') {
      touch = true;
      releaseCanvas();
    } else if (event.pointerType === 'mouse' && !event.sourceCapabilities?.firesTouchEvents) {
      touch = false;
    }
  }, true);
  // Also handle a request bound before the game startup script was installed.
  doc.addEventListener('pointerlockchange', releaseCanvas);
  Object.defineProperty(prototype, 'requestPointerLock', {
    configurable: true,
    writable: true,
    value: function (...args) {
      if (touch) return Promise.resolve();
      return request.apply(this, args);
    },
  });
  releaseCanvas();
}
