// Take only completed, byte-addressable package reads seen before native menu readiness.
export function collectMenuRangeGroups(requests, menuReadyAt) {
  if (!Number.isFinite(menuReadyAt)) throw Error('Missing menu-ready timestamp');
  const reads = new Map(), groups = Object.create(null);
  for (const row of requests) {
    if (row.status !== 206 || !Number.isFinite(row.startAt) || row.startAt > menuReadyAt ||
        !/^\/v\/ut2004\/(?:zstd\/.*\.jit|encoded\/packs\/[a-f0-9]+\.bin)$/.test(row.path)) continue;
    const request = /^bytes=(\d+)-(\d+)$/.exec(row.range);
    const actual = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(row.contentRange);
    if (!request || !actual || request[1] !== actual[1] || request[2] !== actual[2]) {
      throw Error('Unexpected menu range response');
    }
    const [start, end, size] = actual.slice(1).map(Number);
    if (![start,end,size].every(Number.isSafeInteger) || start > end || end >= size) {
      throw Error('Invalid package extent');
    }
    const file = reads.get(row.path) ?? { size, ranges: new Map() };
    if (file.size !== size) throw Error('Package changed during trace');
    file.ranges.set(row.range, [start, end]);
    reads.set(row.path, file);
  }
  for (const [path, file] of reads) {
    const intervals = [];
    for (const [start, end] of [...file.ranges.values()].sort((a, b) => a[0] - b[0])) {
      const last = intervals.at(-1);
      if (last && start - last[1] - 1 <= 4096 && Math.max(end, last[1]) - last[0] + 1 <= 256 * 1024) {
        last[1] = Math.max(last[1], end);
      } else {
        intervals.push([start, end]);
      }
    }
    groups[path] = intervals;
  }
  return { groups, sizes: Object.fromEntries([...reads].map(([path, file]) => [path, file.size])) };
}
