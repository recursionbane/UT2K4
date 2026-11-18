// Coalesce profiled nearby byte ranges. Each consumer still verifies its
// original frame or encoded region before passing decoded bytes to the engine.
export function createMenuRangeFetch({ groups, origin, fetcher = fetch, maxBytes = 8 * 1024 * 1024 }) {
  const cache = new Map();
  let reserved = 0;

  async function fill(url, init, start, end) {
    const length = end - start + 1;
    const response = await fetcher(url, {
      ...init,
      headers: { Range: 'bytes=' + start + '-' + end },
      signal: AbortSignal.timeout(30000),
    });
    const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('Content-Range') || '');
    if (response.status !== 206 || !match || Number(match[1]) !== start ||
        Number(match[2]) !== end || Number(match[3]) <= end || !response.body) {
      await response.body?.cancel();
      throw Error('Unexpected grouped range response');
    }
    const reader = response.body.getReader();
    const bytes = new Uint8Array(length);
    let offset = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (offset + value.length > length) {
          await reader.cancel();
          throw Error('Grouped range exceeded its declared length');
        }
        bytes.set(value, offset);
        offset += value.length;
      }
    } finally {
      reader.releaseLock();
    }
    if (offset !== length) throw Error('Incomplete grouped range');
    return { bytes, total: match[3] };
  }

  return async function fetchRange(input, init = {}) {
    const headers = new Headers(init.headers);
    const range = /^bytes=(\d+)-(\d+)$/.exec(headers.get('Range') || '');
    if (!range || (init.method && init.method !== 'GET') ||
        [...headers.keys()].some(name => name !== 'range')) return fetcher(input, init);
    const url = new URL(input, origin);
    if (url.origin !== origin || url.search ||
        !Object.hasOwn(groups, url.pathname)) return fetcher(input, init);
    const low = Number(range[1]), high = Number(range[2]);
    const group = groups[url.pathname].find(([start, end]) => start <= low && low <= high && high <= end);
    if (!group) return fetcher(input, init);
    const [start, end] = group, length = end - start + 1;
    if (length > maxBytes || length > 256 * 1024) return fetcher(input, init);
    init.signal?.throwIfAborted();
    const key = url.pathname + ':' + start;
    let entry = cache.get(key);
    if (entry) {
      cache.delete(key);
      cache.set(key, entry);
    } else {
      for (const [oldKey, old] of cache) {
        if (reserved + length <= maxBytes) break;
        if (old.ready) {
          cache.delete(oldKey);
          reserved -= old.length;
        }
      }
      if (reserved + length > maxBytes) return fetcher(input, init);
      reserved += length;
      entry = { length, ready: false };
      cache.set(key, entry);
      entry.promise = fill(url.href, init, start, end).then(result => {
        entry.ready = true;
        return result;
      }).catch(error => {
        cache.delete(key);
        reserved -= length;
        throw error;
      });
    }
    let block;
    try {
      block = await entry.promise;
    } catch {
      init.signal?.throwIfAborted();
      return fetcher(input, init);
    }
    init.signal?.throwIfAborted();
    const bytes = block.bytes.subarray(low - start, high - start + 1);
    return new Response(bytes, { status: 206, headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Range': 'bytes ' + low + '-' + high + '/' + block.total,
      'Content-Length': String(bytes.length),
    } });
  };
}
