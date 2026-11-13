const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const expected =
  '03f1d4fa6fe07feb3704e019cbec93db120172497ebb3755e8c7ead7a724bd96';
const packed = zlib.deflateRawSync(Buffer.from('original bytes'));
function loader({
  selected,
  cached = false,
  privateMissing = false,
  corrupt = false,
  archiveFails = false,
  page = 'http://127.0.0.1:9999/play/',
} = {}) {
  const calls = [],
    saved = [];
  const context = {
    Blob,
    Response,
    DecompressionStream,
    URL,
    location: { href: page },
    sha256: async () => (corrupt ? 'bad' : expected),
    mediaGet: async (key) =>
      key === 'current-game'
        ? selected
        : key === 'matrix-release' && cached
          ? new Blob([packed])
          : null,
    mediaSave: async (entries) => saved.push(...entries),
    fetch: async (value) => {
      const url = String(value);
      calls.push(url);
      if (url.endsWith('/manifest.json'))
        return Response.json(
          privateMissing ? {} : { matrixArchive: 'matrix-release.exe' },
        );
      if (url === 'matrix-index.json')
        return Response.json({ 'System/Original.u': [0, packed.length, 14] });
      if (url.startsWith('compat/')) return new Response('own adapter');
      if (archiveFails) return new Response('missing', { status: 404 });
      return new Response(packed);
    },
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('delivery/matrix-files.js', 'utf8'), context);
  return { run: () => context.matrixProfileFiles(), calls, saved };
}
(async () => {
  const current = {
    id: 'keep-id',
    source: 'http://127.0.0.1:9999/manifest.json',
    runtime: 'http://127.0.0.1:9999/runtime/',
    custom: 'keep-setting',
  };
  let test = loader({
    selected: {
      ...current,
      matrixArchive: 'http://127.0.0.1:9999/matrix-release.exe',
    },
  });
  let files = await test.run();
  assert.equal(await files[0][1].text(), 'original bytes');
  assert.equal(test.calls[0], 'http://127.0.0.1:9999/matrix-release.exe');
  assert.ok(test.calls.every((u) => !u.startsWith('https:')));
  test = loader({ selected: current });
  await test.run();
  assert.equal(test.calls[0], current.source);
  let refreshed = test.saved.find(([k]) => k === 'current-game')[1];
  assert.equal(refreshed.id, current.id);
  assert.equal(refreshed.custom, 'keep-setting');
  assert.equal(refreshed.source, current.source);
  assert.equal(
    refreshed.matrixArchive,
    'http://127.0.0.1:9999/matrix-release.exe',
  );
  test = loader({ selected: { id: 'folder-choice', custom: 'keep-import' } });
  await test.run();
  assert.equal(
    test.saved.find(([k]) => k === 'current-game')[1].id,
    'folder-choice',
  );
  for (const opts of [{ privateMissing: true }, { archiveFails: true }]) {
    test = loader({ selected: current, ...opts });
    await assert.rejects(test.run(), /--matrix-archive/);
    assert.ok(test.calls.every((u) => !u.startsWith('https:')));
  }
  test = loader({ selected: current, cached: true, corrupt: true });
  await assert.rejects(test.run(), /checksum mismatch/);
  assert.equal(test.calls.length, 1);
  test = loader({
    selected: {
      id: 'explicit',
      source: 'https://my-stream.example/manifest.json',
    },
    page: 'https://launcher.example/',
  });
  await test.run();
  assert.ok(test.calls[0].includes('unreal-archive-files-eu'));
  assert.equal(
    test.saved.some(([k]) => k === 'current-game'),
    false,
  );
  const records = [];
  const stream = {
    URL,
    AbortSignal,
    location: { href: 'http://127.0.0.1:9999/play/' },
    crypto: { randomUUID: () => 'new-dataset' },
    gamePath: (p) => /\.(u|ut2)$/.test(p),
    mediaSave: async (x) => records.push(...x),
    fetch: async () =>
      Response.json({
        format: 'ut2k4-stream-v1',
        files: { 'System/Core.u': 20, 'Maps/DM-Antalus.ut2': 30 },
        data: 'data/',
        runtime: 'runtime/',
        matrixArchive: 'matrix-release.exe',
      }),
    Response,
  };
  vm.createContext(stream);
  vm.runInContext(fs.readFileSync('delivery/stream.js', 'utf8'), stream);
  const info = await stream.openStream('http://127.0.0.1:9999/manifest.json');
  assert.equal(info.matrixArchive, 'http://127.0.0.1:9999/matrix-release.exe');
  assert.equal(info.runtime, 'http://127.0.0.1:9999/runtime/');
  assert.equal(info.source, 'http://127.0.0.1:9999/manifest.json');
  console.log(
    'Cold private load, cached-profile metadata refresh, missing-private refusal, cache integrity, and existing stream preservation passed.',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
