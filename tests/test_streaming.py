import json
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
            with subprocess.Popen([sys.executable, str(ROOT / 'tools/stream-game.py'), str(root),
                                   '--port', '0', '--client', str(root / paths[0])],
                                  stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True) as server:
                try:
                    launch = server.stdout.readline().split('Play: ', 1)[1].strip()
                    manifest_url = parse_qs(urlparse(launch).query)['source'][0]
                    base = manifest_url.rsplit('/', 1)[0]
                    with urlopen(manifest_url, timeout=5) as res:
                        manifest = json.load(res)
                    self.assertEqual(set(manifest['files']), set(paths))
                    for url in ['data/'+p for p in paths] + [manifest['client']]:
                        req = Request(base+'/'+url, headers={'Origin':ORIGIN,'Range':'bytes=3-10'})
                        with urlopen(req, timeout=5) as res:
                            self.assertEqual(res.status, 206)
                            self.assertEqual(res.headers['Content-Range'], 'bytes 3-10/128')
                            self.assertEqual(res.headers['Access-Control-Allow-Origin'], ORIGIN)
                            self.assertEqual(res.read(), bytes(range(3, 11)))
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
