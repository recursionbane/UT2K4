/* The virtual gamepad owns its touch contacts. Avoid feeding the same contacts
 * into SDL's touch-to-mouse path while retaining native touch menus and mice. */
(function (scope) {
  'use strict';
  let lastPadTouch = -Infinity;
  const onPad = node => !!node?.closest?.('#touch-gamepad-overlay,[data-ufront-pad]');
  scope.__privateOwnsNativeTouch = function (event) {
    const bridge = scope.__privateAimBridge?.status?.();
    if (!bridge?.ready || bridge.telemetry?.standalone !== '1' || bridge.telemetry?.guiActive !== '0') return false;
    if (event.type.startsWith('touch')) {
      const contacts = Array.from(event.changedTouches || []);
      const owned = contacts.length > 0 ? contacts.every(touch => onPad(touch.target || event.target)) : onPad(event.target);
      if (owned) lastPadTouch = scope.performance.now();
      else if (contacts.length > 0) lastPadTouch = -Infinity;
      return owned;
    }
    // Real hardware mouse input explicitly reports firesTouchEvents=false.
    if (event.sourceCapabilities?.firesTouchEvents === false) return false;
    const recentPadTouch = scope.performance.now() - lastPadTouch < 700;
    const compatibilityMouse = event.sourceCapabilities?.firesTouchEvents === true || recentPadTouch;
    return compatibilityMouse && (onPad(event.target) || (recentPadTouch && event.target === scope.document?.getElementById('canvas')));
  };
})(globalThis);
