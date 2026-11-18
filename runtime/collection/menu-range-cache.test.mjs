import assert from 'node:assert/strict';
import test from 'node:test';
import { createMenuRangeFetch } from './menu-range-cache.mjs';
import { collectMenuRangeGroups } from '../../tools/menu-range-profile.mjs';

const origin = 'https://example.invalid';
const path = '/v/ut2004/zstd/Maps/one.ut2.zst.jit';
const url = origin + path;
const body = Uint8Array.from({ length: 40 }, (_, i) => i);
function setup({ maxBytes = 32, broken = false } = {}) {
  const calls = [];
  const fetcher = async (input, init) => {
    const range = new Headers(init.headers).get('range');
    calls.push([input, range]);
    const [lo, hi] = range.slice(6).split('-').map(Number);
    const bytes = body.slice(lo, hi + 1);
    if (broken && range === 'bytes=0-15') return new Response(bytes);
    return new Response(bytes, { status: 206, headers: { 'Content-Range': 'bytes ' + lo + '-' + hi + '/40' } });
  };
  const read = createMenuRangeFetch({ origin, groups: { [path]: [[0,15],[16,31]] }, fetcher, maxBytes });
  return { calls, get: (range, input=url) => read(input, { headers: { Range: range } }) };
}

test('concurrent native reads share one grouped HTTP range and receive exact extents', async () => {
  const { calls, get } = setup();
  const [a,b] = await Promise.all([get('bytes=1-2'), get('bytes=10-12')]);
  assert.deepEqual(calls, [[url,'bytes=0-15']]);
  assert.equal(a.headers.get('Content-Range'), 'bytes 1-2/40');
  assert.equal(b.headers.get('Content-Length'), '3');
  assert.deepEqual([...new Uint8Array(await b.arrayBuffer())], [10,11,12]);
});

test('eviction, unrelated origins and a failed grouped read preserve direct range requests', async () => {
  const { calls, get } = setup({ maxBytes: 16 });
  await get('bytes=2-3'); await get('bytes=20-22'); await get('bytes=2-3');
  await get('bytes=2-3', 'https://elsewhere.invalid' + path);
  assert.deepEqual(calls.map(row => row[1]), ['bytes=0-15','bytes=16-31','bytes=0-15','bytes=2-3']);
  const failed = setup({ broken: true });
  const result = await failed.get('bytes=1-2');
  assert.deepEqual(failed.calls.map(row => row[1]), ['bytes=0-15','bytes=1-2']);
  assert.deepEqual([...new Uint8Array(await result.arrayBuffer())], [1,2]);
});

test('only measured menu ranges from the same version contribute to coalescing', () => {
  const row = (lo,hi,at) => ({ status:206, path, startAt:at, range:'bytes='+lo+'-'+hi,
    contentRange:'bytes '+lo+'-'+hi+'/100000' });
  const rows = [row(2,3,1),row(9,11,2),row(10000,10010,3),row(30000,30010,5)];
  assert.deepEqual(collectMenuRangeGroups(rows, 3).groups[path], [[2,11],[10000,10010]]);
  assert.throws(() => collectMenuRangeGroups([...rows,{...rows[0],contentRange:'bytes 2-3/50'}], 3));
});
