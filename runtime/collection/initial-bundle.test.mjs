import { gunzipSync } from "node:zlib";
import test from "node:test";
import assert from "node:assert/strict";
import {
  selectInitialRanges,
  createInitialBundle,
} from "../../tools/initial-bundle-build.mjs";
import { initialBundleReader, initialShellRuntime } from "./initial-bundle.mjs";
test("production trace selection unions overlapping exact ranges and full engine files", () => {
  const selection = selectInitialRanges([
    { path: "/v/ut2004/game.jit", range: "bytes=2-5", status: 206 },
    { path: "/v/ut2004/game.jit", range: "bytes=4-8", status: 206 },
    { path: "/v/ut2004/engine.wasm", status: 200 },
    { path: "/session", status: 200 },
  ]);
  const b = createInitialBundle(selection, () => Buffer.from("0123456789"));
  assert.equal(b.entries.length, 2);
  assert.deepEqual(b.entries[0], {
    name: "game.jit",
    start: 2,
    length: 7,
    size: 10,
    offset: 0,
  });
  assert.equal(b.entries[1].length, 10);
});
test("fetch waits for complete bundle seed, serves exact ranges, and falls back for uncovered reads", async () => {
  const bundle = createInitialBundle(
    new Map([
      ["game.jit", [[2, 9]]],
      ["engine.wasm", [null]],
    ]),
    () => Buffer.from("0123456789"),
  );
  let requests = 0;
  const scope = {
      fetch: async () => {
        requests++;
        return new Response("fallback");
      },
    },
    reader = initialBundleReader(scope);
  let resolved = false;
  const result = scope
    .fetch("https://a.test/v/ut2004/game.jit", {
      headers: { Range: "bytes=3-6" },
    })
    .then((r) => {
      resolved = true;
      return r;
    });
  await Promise.resolve();
  assert.equal(resolved, false);
  reader.seed(gunzipSync(bundle.data), "https://a.test/v/ut2004/");
  const r = await result;
  assert.equal(r.status, 206);
  assert.equal(r.headers.get("Content-Range"), "bytes 3-6/10");
  assert.equal(await r.text(), "3456");
  assert.equal(requests, 0);
  assert.equal(
    (await scope.fetch("https://a.test/v/ut2004/engine.wasm")).headers.get(
      "Content-Type",
    ),
    "application/wasm",
  );
  assert.equal(
    await (await scope.fetch("https://a.test/v/ut2004/game.jit")).text(),
    "fallback",
  );
  assert.equal(requests, 1);
});
test("invalid inputs fail closed and runtime contains full transfer hash gate", () => {
  assert.throws(
    () => selectInitialRanges([{ path: "/v/ut2004/../secret", status: 200 }]),
    /Unsafe/,
  );
  assert.throws(
    () =>
      createInitialBundle(new Map([["a", [[0, 12]]]]), () => Buffer.alloc(10)),
    /exceeds/,
  );
  const runtime = initialShellRuntime({
    name: "x",
    size: 100,
    sha256: "0".repeat(64),
  });
  assert.ok(
    runtime.indexOf("digest!==record.sha256") <
      runtime.indexOf("const NativeWorker"),
  );
  new Function(runtime);
});

test("shared backing storage is retained and HEAD/POST semantics are preserved", async () => {
  const bundle = createInitialBundle(new Map([["engine.wasm", [null]]]), () =>
    Buffer.from("abcdef"),
  );
  const raw = gunzipSync(bundle.data),
    shared = new Uint8Array(new SharedArrayBuffer(raw.length));
  shared.set(raw);
  let methods = [];
  const scope = {
    fetch: async (input, init) => {
      methods.push(init.method);
      return new Response("posted");
    },
  };
  const reader = initialBundleReader(scope);
  reader.seed(shared, "https://a.test/v/ut2004/");
  assert.equal(reader.bytes, shared);
  assert.equal(reader.bytes.buffer, shared.buffer);
  const head = await scope.fetch("https://a.test/v/ut2004/engine.wasm", {
    method: "HEAD",
  });
  assert.equal(head.headers.get("Content-Length"), "6");
  assert.equal(await head.text(), "");
  assert.equal(
    await (await scope.fetch("https://a.test/v/ut2004/engine.wasm")).text(),
    "abcdef",
  );
  assert.equal(
    await (
      await scope.fetch("https://a.test/v/ut2004/engine.wasm", {
        method: "POST",
      })
    ).text(),
    "posted",
  );
  assert.deepEqual(methods, ["POST"]);
});
