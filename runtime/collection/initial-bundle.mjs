import { restoreInitialLinks } from "./initial-links.mjs";
import { initialDownloadProgress } from "./initial-download-progress.mjs";
// This function is serialized unchanged into both window and workers. Memory only.
export function initialBundleReader(scope) {
  const nativeFetch = scope.fetch.bind(scope);
  let bytes, entries, base, readyResolve;
  const ready = new Promise((r) => (readyResolve = r));
  function seed(data, root) {
    bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    if (new TextDecoder().decode(bytes.slice(0, 4)) !== "IBN1")
      throw Error("Initial bundle signature");
    const n = new DataView(bytes.buffer, bytes.byteOffset).getUint32(4, true),
      start = 8 + n;
    if (start > bytes.length) throw Error("Initial bundle directory");
    entries = JSON.parse(new TextDecoder().decode(bytes.slice(8, start)));
    base = new URL(root);
    for (const e of entries) {
      if (
        !Number.isSafeInteger(e.offset) ||
        !Number.isSafeInteger(e.length) ||
        e.offset < 0 ||
        e.length < 0 ||
        start + e.offset + e.length > bytes.length
      )
        throw Error("Initial bundle bounds");
      e.at = start + e.offset;
    }
    readyResolve();
  }
  function lookup(input, init) {
    const method = String(init?.method || input?.method || "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD") return null;
    const u = new URL(
      typeof input === "string" || input instanceof URL ? input : input.url,
      base,
    );
    if (u.origin !== base.origin || !u.pathname.startsWith(base.pathname))
      return null;
    const name = decodeURIComponent(u.pathname.slice(base.pathname.length));
    if (name === "SDLLaunch-debug.js")
      return new Response(null, { status: 404 });
    const rows = entries.filter((e) => e.name === name);
    if (!rows.length) return null;
    const range = new Headers(init?.headers || input?.headers).get("Range"),
      m = range && /^bytes=(\d+)-(\d*)$/.exec(range);
    if (range && !m) return null;
    const size = rows[0].size,
      start = m ? Number(m[1]) : 0,
      end = m ? (m[2] ? Number(m[2]) + 1 : size) : size,
      row = rows.find((e) => start >= e.start && end <= e.start + e.length);
    if (!row) return null;
    const headers = {
      "Content-Length": String(end - start),
      "Content-Type": /\.wasm$/.test(name)
        ? "application/wasm"
        : /\.(m?js)$/.test(name)
          ? "text/javascript"
          : /\.json$/.test(name)
            ? "application/json"
            : "application/octet-stream",
    };
    if (m) headers["Content-Range"] = `bytes ${start}-${end - 1}/${size}`;
    const body = bytes.subarray(
      row.at + start - row.start,
      row.at + end - row.start,
    );
    return new Response(
      method === "HEAD"
        ? null
        : typeof SharedArrayBuffer === "function" &&
            body.buffer instanceof SharedArrayBuffer
          ? body.slice()
          : body,
      { status: m ? 206 : 200, headers },
    );
  }
  scope.fetch = async (input, init) => {
    await ready;
    return lookup(input, init) || nativeFetch(input, init);
  };
  return {
    seed,
    ready,
    lookup,
    nativeFetch,
    get bytes() {
      return bytes;
    },
    get base() {
      return base;
    },
  };
}
export function initialWorkerPreamble() {
  return `const __initialReader=(${initialBundleReader.toString()})(globalThis);addEventListener('message',function initialSeed(e){if(!e.data?.__initialBundle)return;e.stopImmediatePropagation();__initialReader.seed(e.data.bytes,e.data.base);removeEventListener('message',initialSeed,true);},{capture:true});
const __initialModules=new Map();globalThis.__initialImport=async function initialImport(path){await __initialReader.ready;const url=new URL(path,__initialReader.base).href;if(!__initialModules.has(url))__initialModules.set(url,(async()=>{const r=__initialReader.lookup(url);if(!r)return url;let source=await r.text();const specs=[...source.matchAll(/(?:from\\s*|import\\s*\\(\\s*|import\\s*)['"](\\.[^'"]+)['"]/g)];for(const m of specs){const relative=m[1],target=new URL(relative,url).href,blob=await globalThis.__initialModuleURL(target);source=source.split("'"+relative+"'").join("'"+blob+"'").split('"'+relative+'"').join('"'+blob+'"');}source=source.replaceAll('import.meta.url',JSON.stringify(url));return URL.createObjectURL(new Blob([source],{type:'text/javascript'}));})());return import(await __initialModules.get(url));};
globalThis.__initialModuleURL=async function(url){if(!__initialModules.has(url)){await globalThis.__initialImport(url);}return __initialModules.get(url);};\n`;
}

export function initialShellRuntime(record) {
  return `(${async function (record, reader, progress, restoreLinks) {
    const api = reader(globalThis);
    progress(globalThis, record);
    globalThis.__collectionInitialBundleReady = (async () => {
      const base = new URL("./", location.href).href,
        r = await api.nativeFetch(new URL(record.name, base), {
          cache: "no-store",
          credentials: "same-origin",
        });
      if (!r.ok) throw Error("Initial download HTTP " + r.status);
      const received = new Uint8Array(record.size);
      let loaded = 0;
      const stream = r.body.getReader();
      for (;;) {
        const n = await stream.read();
        if (n.done) break;
        if (loaded + n.value.length > record.size)
          throw Error("Initial download bound");
        received.set(n.value, loaded);
        loaded += n.value.length;
        globalThis.dispatchEvent(
          new CustomEvent("collection-initial-transfer", {
            detail: { loaded, total: record.size },
          }),
        );
      }
      globalThis.dispatchEvent(
        new CustomEvent("collection-initial-phase", {
          detail: { phase: "verifying" },
        }),
      );
      const digest = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", received)),
        (b) => b.toString(16).padStart(2, "0"),
      ).join("");
      if (loaded !== record.size || digest !== record.sha256)
        throw Error("Initial download integrity");
      globalThis.dispatchEvent(
        new CustomEvent("collection-initial-phase", {
          detail: { phase: "preparing" },
        }),
      );
      const bytes = new Uint8Array(
        globalThis.crossOriginIsolated &&
        typeof SharedArrayBuffer === "function"
          ? new SharedArrayBuffer(record.decodedSize)
          : new ArrayBuffer(record.decodedSize),
      );
      const decodedReader = new ReadableStream({
        start(controller) {
          controller.enqueue(received);
          controller.close();
        },
      })
        .pipeThrough(new DecompressionStream("gzip"))
        .getReader();
      let decodedLength = 0;
      try {
        for (;;) {
          const next = await decodedReader.read();
          if (next.done) break;
          if (decodedLength + next.value.length > bytes.length) {
            await decodedReader.cancel();
            throw Error("Initial decoded size");
          }
          bytes.set(next.value, decodedLength);
          decodedLength += next.value.length;
        }
      } finally {
        decodedReader.releaseLock();
      }
      if (decodedLength !== bytes.length) throw Error("Initial decoded size");
      api.seed(bytes, base);
      await restoreLinks(api, base);
      globalThis.dispatchEvent(
        new CustomEvent("collection-initial-phase", {
          detail: { phase: "starting" },
        }),
      );
      const glueText = await api
        .lookup(new URL("ufront-glue.js", base).href)
        .text();
      const engineURL = new URL("SDLLaunch.js", base).href,
        engineResponse = api.lookup(engineURL),
        engineWorkerURL = engineResponse
          ? URL.createObjectURL(
              new Blob(
                [
                  glueText +
                    "\n" +
                    (await engineResponse.text())
                      .replace('importScripts("ufront-glue.js");', "")
                      .replaceAll(
                        "self.location.href",
                        JSON.stringify(engineURL),
                      )
                      .replaceAll(
                        "globalThis.document?.currentScript?.src",
                        JSON.stringify(engineURL),
                      ),
                ],
                { type: "text/javascript" },
              ),
            )
          : null;
      const cacheURL = new URL("ufront-cache-worker.js", base).href,
        cacheSource = await api.lookup(cacheURL).text(),
        cacheWorkerURL = URL.createObjectURL(
          new Blob(
            [
              cacheSource
                .replaceAll("self.location.href", JSON.stringify(cacheURL))
                .replaceAll("scope.location.href", JSON.stringify(cacheURL)),
            ],
            { type: "text/javascript" },
          ),
        );
      const NativeWorker = globalThis.Worker;
      globalThis.Worker = class extends NativeWorker {
        constructor(url, options) {
          super(
            new URL(url, base).href === cacheURL
              ? cacheWorkerURL
              : engineWorkerURL && new URL(url, base).href === engineURL
                ? engineWorkerURL
                : url,
            options,
          );
          if (new URL(url, base).pathname.endsWith("/ufront-cache-worker.js"))
            this.postMessage({ __initialBundle: true, bytes, base });
        }
      };
      const scriptSrc = Object.getOwnPropertyDescriptor(
        HTMLScriptElement.prototype,
        "src",
      );
      Object.defineProperty(HTMLScriptElement.prototype, "src", {
        ...scriptSrc,
        set(value) {
          const original = new URL(value, base).href,
            response = api.lookup(original);
          if (response) {
            api
              .lookup(original)
              .text()
              .then((text) => {
                const blob = new Blob(
                  [
                    text
                      .replaceAll(
                        "globalThis.document?.currentScript?.src",
                        JSON.stringify(original),
                      )
                      .replaceAll(
                        "document.currentScript.src",
                        JSON.stringify(original),
                      ) +
                      "\n//# sourceURL=" +
                      original,
                  ],
                  { type: "text/javascript" },
                );
                scriptSrc.set.call(this, URL.createObjectURL(blob));
              });
          } else scriptSrc.set.call(this, value);
        },
      });
      const pending = [
        ...document.querySelectorAll("script[data-initial-src]"),
      ];
      pending.sort(
        (a, b) =>
          (a.dataset.initialType === "module") -
          (b.dataset.initialType === "module"),
      );
      for (const script of pending) {
        const original = script.dataset.initialSrc;
        const response = api.lookup(new URL(original, base).href);
        if (!response) throw Error("Initial shell asset missing " + original);
        const next = document.createElement("script");
        for (const a of script.attributes)
          if (a.name !== "data-initial-src" && a.name !== "type")
            next.setAttribute(a.name, a.value);
        if (script.dataset.initialType) next.type = script.dataset.initialType;
        const originalURL = new URL(original, base).href;
        next.textContent = (await response.text())
          .replaceAll("import.meta.url", JSON.stringify(originalURL))
          .replaceAll(
            "document.currentScript.src",
            JSON.stringify(originalURL),
          );
        script.replaceWith(next);
      }
      globalThis.dispatchEvent(new CustomEvent("collection-initial-ready"));
      return { bytes: loaded };
    })();
    globalThis.__collectionInitialBundleReady.catch((error) => {
      console.error(error);
      globalThis.dispatchEvent(
        new CustomEvent("collection-initial-error", {
          detail: { message: error.message },
        }),
      );
    });
  }.toString()})(${JSON.stringify(record)},${initialBundleReader.toString()},${initialDownloadProgress.toString()},${restoreInitialLinks.toString()});`;
}
