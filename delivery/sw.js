importScripts(
  './media.js',
  './full-game.js',
  './native-import.js',
  './stream.js',
);
self.addEventListener('install', (event) =>
  event.waitUntil(self.skipWaiting()),
);
self.addEventListener('activate', (event) =>
  event.waitUntil(self.clients.claim()),
);
const scope = self.registration.scope;
const profiles = new Map();
async function profileData(id) {
  if (!profiles.has(id))
    profiles.set(
      id,
      (async () => {
        const profile = await mediaGet('profile/' + id);
        if (!profile)
          throw Error(
            'This game session is unavailable. Return to the launcher.',
          );
        const sizes = await mediaGet('dataset/' + profile.base);
        if (!sizes)
          throw Error('The local game folder needs to be selected again.');
        return {
          ...profile,
          names: new Map(
            Object.keys(sizes).map((name) => [name.toLowerCase(), name]),
          ),
          files: { ...sizes, ...profile.extra },
          extras: new Set(
            Object.keys(profile.extra).map((s) => s.toLowerCase()),
          ),
        };
      })().catch((e) => {
        profiles.delete(id);
        throw e;
      }),
    );
  return profiles.get(id);
}
function sendFile(blob, request) {
  if (!blob) return new Response('Missing game file', { status: 404 });
  const headers = new Headers({
    'Content-Type': 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
  });
  let start = 0,
    end = blob.size - 1,
    code = 200;
  const range = request.headers.get('Range');
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!m || (!m[1] && !m[2])) return new Response(null, { status: 416 });
    start = m[1] ? Number(m[1]) : Math.max(0, blob.size - Number(m[2]));
    end = m[1] && m[2] ? Math.min(Number(m[2]), end) : end;
    if (start > end || start >= blob.size)
      return new Response(null, {
        status: 416,
        headers: { 'Content-Range': 'bytes */' + blob.size },
      });
    code = 206;
    headers.set(
      'Content-Range',
      'bytes ' + start + '-' + end + '/' + blob.size,
    );
  }
  headers.set('Content-Length', String(end - start + 1));
  return new Response(
    request.method === 'HEAD' ? null : blob.slice(start, end + 1),
    { status: code, headers },
  );
}
async function localResponse(request, id, path) {
  if (
    path === 'files.json' ||
    path === 'file-sizes.json' ||
    path.startsWith('data/')
  ) {
    const p = await profileData(id);
    if (path === 'files.json') return Response.json(Object.keys(p.files));
    if (path === 'file-sizes.json') return Response.json(p.files);
    const name = path.slice(5).toLowerCase();
    if (p.remote && !p.extras.has(name)) {
      const path = p.names.get(name);
      return path
        ? streamFile(request, p.remote, path, p.files[path])
        : new Response('Unknown asset', { status: 404 });
    }
    const blob = p.extras.has(name)
      ? await mediaGet('overlay/' + id + '/' + name)
      : await gameFile(p.base, name);
    return sendFile(blob, request);
  }
  return (
    (await nativeResponse(request, scope, async (name) => {
      const profile = await profileData(id);
      if (!profile.runtime) return null;
      const url = new URL(name, profile.runtime);
      const response = await fetch(url, { credentials: 'omit' });
      if (!response.ok)
        throw Error(
          'Native client stream returned HTTP ' +
            response.status +
            ' for ' +
            name,
        );
      return response.blob();
    })) || new Response('Missing client file', { status: 404 })
  );
}
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (!event.request.url.startsWith(scope)) return;
  const rel = decodeURIComponent(
    url.pathname.slice(new URL(scope).pathname.length),
  );
  const match = /^native\/([a-zA-Z0-9_-]+)\/(.*)$/.exec(rel);
  if (!match) return;
  event.respondWith(
    localResponse(event.request, match[1], match[2]).catch(
      (err) => new Response(err.message, { status: 503 }),
    ),
  );
});
