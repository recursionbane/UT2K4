/** Conditional visual-viewport fit for native portrait menus. No match URL changes. */
export function visibleMenuRect(rect, view, safe = {}) {
  const left = Math.max(rect.left, view.left + (safe.left || 0));
  const top = Math.max(rect.top, view.top + (safe.top || 0));
  const right = Math.min(
    rect.right,
    view.left + view.width - (safe.right || 0),
  );
  const bottom = Math.min(
    rect.bottom,
    view.top + view.height - (safe.bottom || 0),
  );
  if (
    ![left, top, right, bottom].every(Number.isFinite) ||
    right - left < 64 ||
    bottom - top < 64
  )
    return null;
  if (
    Math.abs(left - rect.left) <= 1 &&
    Math.abs(top - rect.top) <= 1 &&
    Math.abs(right - rect.right) <= 1 &&
    Math.abs(bottom - rect.bottom) <= 1
  )
    return null;
  return { left, top, width: right - left, height: bottom - top };
}

export function installMenuViewportFit(scope) {
  const doc = scope.document;
  if (!doc) return null;
  const state = (scope.__collectionMenuViewportFit = {
    active: false,
    pending: false,
    requests: 0,
    layouts: 0,
    error: null,
  });
  const properties = [
    "position",
    "left",
    "top",
    "width",
    "height",
    "max-width",
    "max-height",
  ];
  let canvas = null,
    originalStyles = null,
    scale = null,
    desiredNative = null;
  let lastKey = "",
    lastTarget = "",
    attempts = 0,
    busy = false,
    stopped = false,
    probe = null;

  function progress() {
    return scope.__collectionLoadingProgress?.snapshot?.() || null;
  }
  function nativeReady() {
    const current = progress();
    return typeof scope.ueExecResult === "function" && current?.ready === true;
  }
  function menuReady() {
    return nativeReady() && progress()?.stage === "menu";
  }
  function visible() {
    const v = scope.visualViewport;
    return {
      left: v?.offsetLeft || 0,
      top: v?.offsetTop || 0,
      width: v?.width || scope.innerWidth,
      height: v?.height || scope.innerHeight,
    };
  }
  function safeInsets() {
    if (!scope.getComputedStyle) return {};
    if (!probe) {
      probe = doc.createElement("div");
      probe.style.cssText =
        "position:fixed;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top);padding-right:env(safe-area-inset-right);padding-bottom:env(safe-area-inset-bottom);padding-left:env(safe-area-inset-left)";
      doc.documentElement.appendChild(probe);
    }
    const style = scope.getComputedStyle(probe);
    return {
      top: parseFloat(style.paddingTop) || 0,
      right: parseFloat(style.paddingRight) || 0,
      bottom: parseFloat(style.paddingBottom) || 0,
      left: parseFloat(style.paddingLeft) || 0,
    };
  }
  function saveStyles() {
    originalStyles = Object.fromEntries(
      properties.map((name) => [
        name,
        {
          value: canvas.style.getPropertyValue(name),
          priority: canvas.style.getPropertyPriority(name),
        },
      ]),
    );
  }
  function restoreStyles() {
    if (!canvas || !originalStyles) return;
    for (const name of properties) {
      const prior = originalStyles[name];
      if (prior.value)
        canvas.style.setProperty(name, prior.value, prior.priority);
      else canvas.style.removeProperty(name);
    }
  }
  function apply(rect) {
    const styles = {
      position: "fixed",
      left: rect.left + "px",
      top: rect.top + "px",
      width: rect.width + "px",
      height: rect.height + "px",
      "max-width": "none",
      "max-height": "none",
    };
    for (const [name, value] of Object.entries(styles))
      canvas.style.setProperty(name, value, "important");
  }
  function requestNative(width, height) {
    width = Math.max(64, Math.round(width));
    height = Math.max(64, Math.round(height));
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width > 16384 ||
      height > 16384
    )
      throw Error("Menu viewport dimensions outside native bounds");
    const key = width + "x" + height;
    if (key !== lastTarget) {
      lastTarget = key;
      attempts = 0;
    }
    desiredNative = { width, height };
    state.requested = desiredNative;
  }
  async function resizeNative() {
    if (!desiredNative || state.pending) return;
    if (
      canvas.width === desiredNative.width &&
      canvas.height === desiredNative.height
    ) {
      desiredNative = null;
      if (!originalStyles) scale = null;
      return;
    }
    // Never capture or resize the default 300x150 placeholder before native menu readiness.
    if (!nativeReady()) return;
    if (attempts >= 3) {
      state.error = "Native menu viewport did not accept the requested size";
      return;
    }
    state.pending = true;
    attempts++;
    state.requests++;
    try {
      const result = await scope.ueExecResult(
        "setres " + desiredNative.width + "x" + desiredNative.height,
        3000,
      );
      if (result?.ok === false)
        throw Error("Native menu resize was not accepted");
    } finally {
      state.pending = false;
    }
  }
  async function reconcile(force = false) {
    if (stopped || busy) return;
    const currentCanvas = scope.Module?.canvas || doc.getElementById("canvas");
    if (!currentCanvas?.getBoundingClientRect || !currentCanvas.style) return;
    if (canvas !== currentCanvas) {
      canvas = currentCanvas;
      originalStyles = null;
      scale = null;
      lastKey = "";
    }
    const menu = scope.__privateNativeMenuActive?.() === true;
    const view = visible(),
      portrait = scope.innerHeight > scope.innerWidth;
    const ready = menuReady();
    const key = [
      menu,
      portrait,
      ready,
      view.left,
      view.top,
      view.width,
      view.height,
      scope.innerWidth,
      scope.innerHeight,
    ].join(":");
    busy = true;
    try {
      if (force || key !== lastKey) {
        lastKey = key;
        // On gameplay with no owned fit there is no canvas layout read or CSS write.
        if (originalStyles || (menu && portrait && ready)) {
          if (originalStyles) restoreStyles();
          const natural = canvas.getBoundingClientRect();
          state.layouts++;
          state.visible = view;
          state.natural = {
            left: natural.left,
            top: natural.top,
            width: natural.width,
            height: natural.height,
          };
          const fit =
            menu && portrait
              ? visibleMenuRect(natural, view, safeInsets())
              : null;
          if (fit) {
            if (!originalStyles) {
              saveStyles();
              // Captured only after a real native menu frame, never from the loader placeholder.
              scale ||= {
                x: canvas.width / natural.width,
                y: canvas.height / natural.height,
              };
            }
            apply(fit);
            state.active = true;
            state.fitted = fit;
            requestNative(fit.width * scale.x, fit.height * scale.y);
          } else if (originalStyles) {
            originalStyles = null;
            state.active = false;
            state.fitted = null;
            requestNative(natural.width * scale.x, natural.height * scale.y);
          }
        }
      }
      await resizeNative();
      state.actual = { width: canvas.width, height: canvas.height };
    } catch (error) {
      state.error = String(error.message || error);
    } finally {
      busy = false;
    }
  }
  const changed = () => reconcile(true);
  const timer = scope.setInterval?.(reconcile, 250);
  scope.visualViewport?.addEventListener("resize", changed, { passive: true });
  scope.visualViewport?.addEventListener("scroll", changed, { passive: true });
  scope.addEventListener?.("resize", changed, { passive: true });
  doc.addEventListener?.("fullscreenchange", changed, { passive: true });
  reconcile();
  return {
    state,
    reconcile,
    stop() {
      stopped = true;
      scope.clearInterval?.(timer);
      restoreStyles();
      probe?.remove();
    },
  };
}

export function menuViewportClient() {
  return (
    "(" +
    installMenuViewportFit
      .toString()
      .replace("visibleMenuRect(", "(" + visibleMenuRect.toString() + ")(") +
    ")(globalThis);"
  );
}
