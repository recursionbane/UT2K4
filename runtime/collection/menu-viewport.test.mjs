import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {
  visibleMenuRect,
  menuViewportClient,
  installMenuViewportFit,
} from "./menu-viewport.mjs";
test("unchanged good portrait and landscape; clipped top/bottom fit with safe edges", () => {
  const r = {
    left: 0,
    top: 0,
    right: 960,
    bottom: 1280,
    width: 960,
    height: 1280,
  };
  assert.equal(
    visibleMenuRect(r, { left: 0, top: 0, width: 960, height: 1280 }),
    null,
  );
  assert.deepEqual(
    visibleMenuRect(r, { left: 0, top: 31, width: 960, height: 1218 }),
    { left: 0, top: 31, width: 960, height: 1218 },
  );
  assert.deepEqual(
    visibleMenuRect(
      { ...r, top: 31, bottom: 1311 },
      { left: 0, top: 0, width: 960, height: 1280 },
    ),
    { left: 0, top: 31, width: 960, height: 1249 },
  );
  assert.deepEqual(
    visibleMenuRect(
      r,
      { left: 0, top: 0, width: 960, height: 1280 },
      { bottom: 20 },
    ),
    { left: 0, top: 0, width: 960, height: 1260 },
  );
});
test("serializable early client is self-contained", () => {
  vm.runInNewContext(menuViewportClient(), { globalThis: {} });
});
test("conditional native resize preserves pixel ratio, fullscreen and selections; restores on gameplay", async () => {
  const data = new Map(),
    style = {
      getPropertyValue: (n) => data.get(n)?.value || "",
      getPropertyPriority: (n) => data.get(n)?.priority || "",
      setProperty(n, value, priority) {
        data.set(n, { value, priority });
      },
      removeProperty: (n) => data.delete(n),
    },
    c = {
      style,
      width: 1920,
      height: 2560,
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        right: 960,
        bottom: 1280,
        width: 960,
        height: 1280,
      }),
    },
    commands = [],
    scope = {
      document: { getElementById: () => c },
      Module: { canvas: c },
      innerWidth: 960,
      innerHeight: 1280,
      visualViewport: {
        offsetLeft: 0,
        offsetTop: 31,
        width: 960,
        height: 1218,
        addEventListener() {},
      },
      __collectionLoadingProgress: {
        snapshot: () => ({ stage: "menu", ready: true }),
      },
      __privateNativeMenuActive: () => true,
      ueExecResult: async (command) => {
        commands.push(command);
        const [, w, h] = command.match(/setres (\d+)x(\d+)/);
        c.width = +w;
        c.height = +h;
        return { ok: true };
      },
      setInterval() {
        return 1;
      },
      clearInterval() {},
    };
  const fit = installMenuViewportFit(scope);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(fit.state.active, true);
  assert.deepEqual(commands, ["setres 1920x2436"]);
  assert.equal(style.getPropertyValue("top"), "31px");
  scope.__privateNativeMenuActive = () => false;
  await fit.reconcile();
  assert.deepEqual(commands, ["setres 1920x2436", "setres 1920x2560"]);
  assert.equal(data.size, 0);
  assert.equal(
    commands.some((c) => /open|start|mutate/.test(c)),
    false,
  );
});
test("loader placeholder is never scaled; stable native menu does no repeated layout/style writes", async () => {
  let ready = false,
    writes = 0;
  const data = new Map(),
    style = {
      getPropertyValue: (n) => data.get(n)?.value || "",
      getPropertyPriority: (n) => data.get(n)?.priority || "",
      setProperty(n, value, priority) {
        writes++;
        data.set(n, { value, priority });
      },
      removeProperty(n) {
        writes++;
        data.delete(n);
      },
    },
    canvas = {
      style,
      width: 300,
      height: 150,
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        right: 960,
        bottom: 1280,
        width: 960,
        height: 1280,
      }),
    },
    commands = [],
    scope = {
      document: { getElementById: () => canvas },
      Module: { canvas },
      innerWidth: 960,
      innerHeight: 1280,
      visualViewport: {
        offsetTop: 31,
        width: 960,
        height: 1218,
        addEventListener() {},
      },
      __collectionLoadingProgress: {
        snapshot: () => ({ ready, stage: "menu" }),
      },
      __privateNativeMenuActive: () => true,
      ueExecResult: async (c) => {
        commands.push(c);
        const m = c.match(/setres (\d+)x(\d+)/);
        canvas.width = +m[1];
        canvas.height = +m[2];
        return { ok: true };
      },
      setInterval() {},
      clearInterval() {},
    };
  const fit = installMenuViewportFit(scope);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(writes, 0);
  assert.equal(commands.length, 0);
  canvas.width = 1920;
  canvas.height = 2560;
  ready = true;
  await fit.reconcile();
  assert.deepEqual(commands, ["setres 1920x2436"]);
  const stableWrites = writes,
    layouts = fit.state.layouts;
  for (let i = 0; i < 8; i++) await fit.reconcile();
  assert.equal(writes, stableWrites);
  assert.equal(fit.state.layouts, layouts);
  assert.equal(commands.length, 1);
});
