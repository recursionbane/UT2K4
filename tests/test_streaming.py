import io
import json
import tarfile
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = 'https://recursionbane.github.io'


class StreamingTest(unittest.TestCase):
    def test_manifest_and_ranged_audio_texture_engine(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            paths = ('System/Core.u', 'Maps/DM-Antalus.ut2', 'System/Packages.md5',
                     'Textures/Test.utx', 'Music/Test.ogg', 'Sounds/Test.uax')
            for relative in paths:
                f = root / relative
                f.parent.mkdir(exist_ok=True)
                f.write_bytes(bytes(range(128)))
            secret = root / 'System/unrelated.txt'
            secret.write_text('not served')
            site = root / 'site'
            site.mkdir()
            for name in ('index.html', 'sw.js', 'matrix-files.js', 'hosted-mod.js'):
                (site / name).write_text('public-'+name)
            (site / 'private.txt').write_text('not public')
            (root / 'outside.js').write_text('private outside site')
            (site / 'launch.js').symlink_to(root / 'outside.js')
            client = root / 'release.tar.gz'
            with tarfile.open(client, 'w:gz') as archive:
                for name, content in [('ut2004.wasm', b'wasm-test'), ('ut2004.wasm.br', b'br-test')]:
                    entry = tarfile.TarInfo('ut2004-web/'+name)
                    entry.size = len(content)
                    archive.addfile(entry, io.BytesIO(content))
            with subprocess.Popen([sys.executable, str(ROOT / 'tools/stream-game.py'), str(root),
                                   '--port', '0', '--client', str(client), '--site', str(site)],
                                  stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True) as server:
                try:
                    launch = server.stdout.readline().split('Play: ', 1)[1].strip()
                    manifest_url = parse_qs(urlparse(launch).query)['source'][0]
                    base = manifest_url.rsplit('/', 1)[0]
                    with urlopen(manifest_url, timeout=5) as res:
                        manifest = json.load(res)
                    self.assertEqual(set(manifest['files']), set(paths))
                    self.assertEqual(manifest['launcher'], 'play/')
                    self.assertEqual(manifest['launcherVersion'], 1)
                    self.assertEqual(urlparse(launch).path, '/play/')
                    for name in ('index.html', 'sw.js', 'matrix-files.js', 'hosted-mod.js'):
                        request = Request(base+'/play/'+name, headers={'Origin':base})
                        with urlopen(request, timeout=5) as response:
                            self.assertEqual(response.read(), ('public-'+name).encode())
                            self.assertEqual(response.headers['X-UT2K4-Launcher'], '1')
                            self.assertEqual(response.headers['Cache-Control'], 'no-store')
                            self.assertEqual(response.headers['Content-Type'].split(';')[0], 'text/html' if name.endswith('.html') else 'text/javascript')
                            if name=='sw.js':
                                self.assertEqual(response.headers['Service-Worker-Allowed'], '/play/')
                    with urlopen(base+'/play/?setup=1', timeout=5) as response:
                        self.assertEqual(response.read(), b'public-index.html')
                    with urlopen(base+'/play/native/test-session/index.html?map=DM-Rankin', timeout=5) as response:
                        bootstrap = response.read().decode()
                        self.assertIn("register('/play/sw.js'", bootstrap)
                        self.assertIn('controllerchange', bootstrap)
                        self.assertIn('location.reload()', bootstrap)
                    for path in ('/play/private.txt', '/play/launch.js', '/play/../outside.js',
                                 '/play/%2e%2e/outside.js', '/play/native/x/ut2004.wasm',
                                 '/play/native/x/index.html/extra', '/tools/stream-game.py'):
                        with self.assertRaises(HTTPError) as refused_file:
                            urlopen(base+path,timeout=5)
                        self.assertEqual(refused_file.exception.code,404)
                        refused_file.exception.close()
                    for url in ['data/'+p for p in paths]:
                        req = Request(base+'/'+url, headers={'Origin':ORIGIN,'Range':'bytes=3-10'})
                        with urlopen(req, timeout=5) as res:
                            self.assertEqual(res.status, 206)
                            self.assertEqual(res.headers['Content-Range'], 'bytes 3-10/128')
                            self.assertEqual(res.headers['Access-Control-Allow-Origin'], ORIGIN)
                            self.assertEqual(res.read(), bytes(range(3, 11)))
                    for encoding, content in [('br', b'br-test'), ('identity', b'wasm-test')]:
                        request = Request(base+'/runtime/ut2004.wasm', headers={'Accept-Encoding':encoding})
                        with urlopen(request, timeout=5) as response:
                            self.assertEqual(response.read(), content)
                            self.assertEqual(response.headers.get('Content-Encoding'), 'br' if encoding=='br' else None)
                    with self.assertRaises(HTTPError) as refused:
                        urlopen(Request(manifest_url, headers={'Origin':'https://example.org'}))
                    self.assertEqual(refused.exception.code,403)
                    refused.exception.close()
                    with self.assertRaises(HTTPError) as missing:
                        urlopen(base+'/data/System/unrelated.txt')
                    self.assertEqual(missing.exception.code,404)
                    missing.exception.close()
                finally:
                    server.terminate()


if __name__ == '__main__':
    unittest.main()
