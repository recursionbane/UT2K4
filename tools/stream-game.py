#!/usr/bin/env python3
"""Serve a player's full game to the Pages launcher over read-only HTTP ranges."""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import tarfile
from threading import Lock
from pathlib import Path
import re
from urllib.parse import quote, unquote, urlsplit

PAGES = 'https://recursionbane.github.io'
DIRECTORIES = {'animations', 'forcefeedback', 'karmadata', 'maps', 'music', 'sounds',
               'speech', 'staticmeshes', 'system', 'textures'}
EXTENSIONS = set('ukx ifr ka ut2 ogg uax xml usx u ucl upl ini int utx md5 dat det est frt itt kot tmt rut plt het het_utx rut_utx'.split())
PLAY_ASSETS = {
    'index.html', 'style.css', 'launch.js', 'media.js', 'native-import.js',
    'full-game.js', 'stream.js', 'sw.js', 'matrix-index.json', 'matrix-files.js',
    'hosted-mod.js', 'rankin.jpg',
    'arena/index.html', 'arena/arena.js', 'arena/movement.wasm',
    'compat/MatrixModern.u', 'compat/MatrixModern.ucl',
}
PLAY_TYPES = {'.html':'text/html; charset=utf-8', '.js':'text/javascript',
              '.css':'text/css', '.json':'application/json', '.jpg':'image/jpeg',
              '.wasm':'application/wasm'}


def play_asset(site, name):
    """Only generated public assets; never expose repository/private files."""
    if name not in PLAY_ASSETS:
        return None
    candidate = site / name
    if not candidate.is_file() or candidate.is_symlink():
        return None
    try:
        candidate.resolve().relative_to(site.resolve())
    except ValueError:
        return None
    return candidate


def native_bootstrap():
    return b'''<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Starting Matrix</title><p id="status">Preparing the game launcher...</p>
<p><a href="/play/">Return to the launcher</a></p><script>
(async()=>{const back=new URL('/play/',location.href);
back.searchParams.set('source',new URL('/manifest.json',location.href));
try{if(!('serviceWorker' in navigator))throw Error('This browser needs service worker support.');
await navigator.serviceWorker.register('/play/sw.js',{scope:'/play/'});
await navigator.serviceWorker.ready;
if(navigator.serviceWorker.controller){location.replace(back);return;}
await Promise.race([new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true})),new Promise((_,reject)=>setTimeout(()=>reject(Error('The launcher is taking longer than expected. Use the link below.')),10000))]);
location.reload();}catch(error){document.getElementById('status').textContent=error.message;}})();
</script></html>'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('data', type=Path)
    parser.add_argument('--client', type=Path, help='Upstream ut2004-web-v0.2.0.tar.gz')
    parser.add_argument('--port', type=int, default=8789)
    parser.add_argument('--bind', default='127.0.0.1')
    parser.add_argument('--origin', action='append', default=[PAGES])
    parser.add_argument('--site', type=Path, default=Path(__file__).resolve().parents[1] / '_site',
                        help='Generated public launcher directory (only allowlisted assets are served)')
    args = parser.parse_args()
    root = args.data.resolve(strict=True)
    files = {}
    for folder in root.iterdir():
        if not folder.is_dir() or folder.is_symlink() or folder.name.lower() not in DIRECTORIES:
            continue
        for path in folder.iterdir():
            if path.suffix[1:].lower() in EXTENSIONS and path.is_file() and not path.is_symlink():
                files[path.relative_to(root).as_posix()] = path
    if not {'maps/dm-antalus.ut2', 'system/core.u'} <= {p.lower() for p in files}:
        parser.error('Select the full game directory containing System and Maps.')
    site = args.site.resolve()
    manifest = {'format': 'ut2k4-stream-v1', 'data': 'data/',
                'files': {k: p.stat().st_size for k, p in files.items()}}
    if play_asset(site, 'index.html') and play_asset(site, 'sw.js'):
        manifest.update(launcher='play/', launcherVersion=1)
    if args.client:
        if not args.client.is_file():
            parser.error('Could not find the v0.2.0 web client archive.')
        manifest['client'] = 'client.tar.gz'
        manifest['runtime'] = 'runtime/'
    index = json.dumps(manifest, separators=(',', ':')).encode()
    origins = set(args.origin)

    # Open the release only when the first game actually starts. Keep its shipped
    # Brotli sidecar for the wire; the browser checks the decompressed WASM hash.
    runtime = {}
    runtime_lock = Lock()
    client_files = {'index.html', 'ut2004.js', 'ut2004.wasm', 'worker.js',
                    'ut2004.wasm.br', 'assets/mobile-input.js', 'assets/mobile-input.css'}

    def runtime_bytes(name, brotli):
        if name not in client_files or name.endswith('.br') or not args.client:
            return None, False
        with runtime_lock:
            if not runtime:
                members = {}
                with tarfile.open(args.client, mode='r|gz') as archive:
                    for entry in archive:
                        filename = entry.name.removeprefix('./').removeprefix('ut2004-web/')
                        if filename in client_files and entry.isfile() and entry.size <= 32 * 1024 * 1024:
                            members[filename] = archive.extractfile(entry).read()
                runtime.update(members)
            compressed = brotli and name + '.br' in runtime
            return runtime.get(name + '.br' if compressed else name), compressed

    class Handler(BaseHTTPRequestHandler):
        def authorized(self):
            return self.headers.get('Origin') in origins or self.headers.get('Origin') is None

        def end_headers(self):
            if self.headers.get('Origin') in origins:
                self.send_header('Access-Control-Allow-Origin', self.headers['Origin'])
                self.send_header('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges')
                self.send_header('Access-Control-Allow-Private-Network', 'true')
                self.send_header('Vary', 'Origin')
            super().end_headers()

        def do_OPTIONS(self):
            if not self.authorized():
                return self.send_error(403)
            self.send_response(204)
            self.send_header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Range, Content-Type')
            self.end_headers()

        def do_HEAD(self):
            self.serve(False)

        def do_GET(self):
            self.serve(True)

        def serve(self, body):
            if not self.authorized():
                return self.send_error(403)
            path = unquote(urlsplit(self.path).path)
            if path == '/play':
                self.send_response(302)
                self.send_header('Location', '/play/' + ('?' + urlsplit(self.path).query if urlsplit(self.path).query else ''))
                self.end_headers()
                return
            if path.startswith('/play/'):
                name = path[6:] or 'index.html'
                source = play_asset(site, name)
                payload = None
                if re.fullmatch(r'native/[a-zA-Z0-9_-]+/(?:index\.html)?', name):
                    if not play_asset(site, 'sw.js'):
                        return self.send_error(503, 'Build the local launcher with tools/build-site.sh first')
                    payload = native_bootstrap()
                    content_type = PLAY_TYPES['.html']
                elif source:
                    payload = source.read_bytes()
                    content_type = PLAY_TYPES.get(source.suffix, 'application/octet-stream')
                else:
                    return self.send_error(404, 'Public launcher asset unavailable')
                self.send_response(200)
                self.send_header('Content-Type', content_type)
                self.send_header('Content-Length', str(len(payload)))
                self.send_header('Cache-Control', 'no-store')
                self.send_header('X-Content-Type-Options', 'nosniff')
                self.send_header('X-UT2K4-Launcher', '1')
                if name == 'sw.js':
                    self.send_header('Service-Worker-Allowed', '/play/')
                self.end_headers()
                if body:
                    self.wfile.write(payload)
                return
            if path == '/manifest.json':
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(index)))
                self.end_headers()
                if body:
                    self.wfile.write(index)
                return
            if path.startswith('/runtime/'):
                try:
                    payload, encoded = runtime_bytes(path[9:], 'br' in {v.strip() for v in self.headers.get('Accept-Encoding', '').split(',')})
                except (tarfile.TarError, OSError):
                    return self.send_error(422, 'Invalid native web release archive')
                if payload is None:
                    return self.send_error(404)
                self.send_response(200)
                self.send_header('Content-Type', 'application/octet-stream')
                self.send_header('Content-Length', str(len(payload)))
                if encoded:
                    self.send_header('Content-Encoding', 'br')
                self.end_headers()
                if body:
                    self.wfile.write(payload)
                return
            source = files.get(path[6:]) if path.startswith('/data/') else args.client if path == '/client.tar.gz' else None
            if not source:
                return self.send_error(404)
            size = source.stat().st_size
            start, end, code = 0, size - 1, 200
            requested = self.headers.get('Range')
            if requested:
                m = re.fullmatch(r'bytes=(\d+)-(\d*)', requested)
                if not m or int(m[1]) >= size or (m[2] and int(m[2]) < int(m[1])):
                    self.send_response(416)
                    self.send_header('Content-Range', f'bytes */{size}')
                    self.end_headers()
                    return
                start, end = int(m[1]), min(end, int(m[2])) if m[2] else end
                code = 206
            self.send_response(code)
            if code == 206:
                self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
            self.send_header('Accept-Ranges', 'bytes')
            self.send_header('Content-Length', str(end - start + 1))
            self.send_header('Content-Type', 'application/octet-stream')
            self.end_headers()
            if body:
                with source.open('rb') as stream:
                    stream.seek(start)
                    remaining = end - start + 1
                    while remaining:
                        block = stream.read(min(remaining, 65536))
                        if not block:
                            break
                        self.wfile.write(block)
                        remaining -= len(block)

        def log_message(self, fmt, *args):
            if args and str(args[1] if len(args) > 1 else '').startswith(('4','5')):
                super().log_message(fmt, *args)

    server = ThreadingHTTPServer((args.bind, args.port), Handler)
    origins.update({f'http://127.0.0.1:{server.server_port}', f'http://localhost:{server.server_port}'})
    print('Play: ' + f'http://127.0.0.1:{server.server_port}/play/?source=' +
          quote(f'http://127.0.0.1:{server.server_port}/manifest.json', safe=''), flush=True)
    server.serve_forever()


if __name__ == '__main__':
    main()
