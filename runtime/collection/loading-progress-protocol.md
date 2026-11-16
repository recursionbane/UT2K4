# Loading telemetry v1

`loadingProgressClient()` returns an import-free classic script. Install it in the authenticated shell's head before loading starts. The emit bridge is available immediately; UI mounting waits for DOMContentLoaded and uses the latest buffered model state. It performs no fetches or storage writes. Send events through either:

```js
window.__collectionLoadingProgress.emit(event);
window.dispatchEvent(new CustomEvent('collection-loading-progress', {detail:event}));
```

Every event has `v:1`, a unique `stageId`, and `type`. Phase/ready events may supply `at` as epoch milliseconds; otherwise Date.now() is recorded at receipt. Snapshots retain startedAt/readyAt so QA can cut network measurements at the native event rather than its next poll. Only `phase/start` creates and activates a stage. Use a new ID for each menu load or map travel; late events from a previous stage cannot switch the visible stage. Four recent stages are retained. Resource indexes and incremental stage aggregates keep snapshots constant-time; notifications are coalesced to an animation frame. The host must identify real native readiness; transferred/decoded totals never imply readiness.

## Events

```js
{v:1, stageId:'menu-1', stage:'menu', type:'phase', state:'start',
 forecastTransferBytes:133000000, forecastDecodeBytes:400000000}
// stage can also be 'match'; label is an optional short, user-facing title.
// Forecasts are optional measured phase profiles, not a whole-archive size.

{v:1, stageId:'menu-1', type:'plan', resourceId:'asset/range-0',
 transferTotalBytes:100000, decodeTotalBytes:262144, certainty:'estimate'}
// plan can also revise forecastTransferBytes / forecastDecodeBytes without a resourceId.
// Displayed denominator = max(known request budgets, phase forecast, measured bytes),
// never forecast + resources. Forecasts are labelled estimates while discovery runs.
// Unknown maps may omit forecasts and use known-so-far / indeterminate progress.
// Totals may be null. Re-emit to revise an estimate. Only plan selected work for
// this phase, including requested read-ahead pages. Never plan the whole archive.
// scope:'archive' is explicitly rejected. A cached resource has cached:true.

{v:1, stageId:'menu-1', type:'transfer', resourceId:'asset/range-0',
 requestId:'worker-2/request-17/attempt-1', source:'network',
 loadedBytes:50000, totalBytes:100000, state:'active', encoding:'identity'}
// loadedBytes is CUMULATIVE per physical attempt. IDs must distinguish workers,
// ranges and retries. state: active | complete | failed. source: network | cache.
// A cache hit contributes zero downloaded bytes even if its payload is large.

{v:1, stageId:'menu-1', type:'decode', resourceId:'asset/range-0',
 jobId:'asset/page-0', loadedBytes:262144, totalBytes:262144, state:'complete'}
// Decode counts unique verified OUTPUT bytes, independently of download bytes.
// Repeat the same job ID after duplicate reports/retries; never add a delta to an
// already cumulative value. state: queued | working | complete | failed | cancelled. A failed checksum
// does not earn decoded progress. Failed/cancelled jobs retire immediately, discard verified-output credit and remove their abandoned work budget; a raw fallback is a separate job, not a fake successful completion. resourceId associates jobs with a planned range.

{v:1, stageId:'menu-1', type:'plan', discoveryComplete:true}
// Optional: only when all selected work is known. Otherwise totals stay estimates.

{v:1, stageId:'menu-1', type:'ready'}
// Actual native menu/match ready. The loading UI collapses and hides. Background
// transfers on this same stage do not bring the chip back during gameplay.

{v:1, stageId:'menu-1', type:'error', message:'A file could not be loaded'}
```

## HTTP compression and retries

Transfer bytes mean **HTTP-encoded response-body bytes, excluding headers**. `fetch()` streams are already decoded after HTTP Brotli/gzip: their chunks must not be reported as network bytes. For identity HTTP encoding, stream chunk lengths are valid. For compressed HTTP, report `loadedBytes:null` while the encoded count is unavailable, then use measured `PerformanceResourceTiming.encodedBodySize`, or a validated Content-Length after successful EOF. Do not substitute decoded body length. The UI marks incomplete measurements with `≥` and explains the limitation.

A new physical retry has a new request ID. The UI calls repeated same-resource requests “repeat downloads”: these can be successful rereads or evictions, not necessarily network failures. `repeatDownloads` is the snapshot counter (`retries` remains a legacy compatibility alias). Actual bytes spent by failed attempts remain in the numerator; their unreceived budget is removed, and the next attempt adds its own expected bytes. Duplicate/out-of-order cumulative reports do not inflate totals. Unknown totals stay unknown; additional discoveries can revise the denominator. This may move a bar backwards and is intentionally not smoothed into invented progress.

There is no time-based percentage or ETA. Byte counts remain visible when known work finishes, but a track becomes indeterminate until native readiness instead of claiming a premature 100%. The separate decode track reports verified work, not time spent compiling, serializing or drawing.

## UI and validation

HTML loading controls isolate their own pointer/keyboard events from game input without blocking unrelated canvas/pad events. The quiet chip sits between the Matrix controls and Lock on wide screens, and on a second header row on narrow screens. Native `<details>` provides keyboard/touch expansion. Labelled `<progress>` tracks expose known measurements; live announcements occur at phase changes, not for every chunk. Ready stages hide and release focus back to the canvas when necessary.

Run `node --test runtime/collection/loading-progress.test.mjs`. Tests use synthetic numbers and a minimal DOM; no game files, credentials, browser installation or network service are needed. Real layout and cold-load checkpoint QA belong in a separate private browser harness.
