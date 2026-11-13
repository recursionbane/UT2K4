import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import sys
import tempfile
from threading import Thread
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from mirror_collection_http import CollectionMirror


class CollectionServingTests(unittest.TestCase):
    def test_mirror_serves_verified_files_locally(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            data = b'render this from local disk'
            name = 'index.html'
            digest = hashlib.sha256(data).hexdigest()
            (root / 'files').mkdir()
            (root / 'receipts').mkdir()
            file = root / 'files' / name
            file.write_bytes(data)
            (root / 'catalog.json').write_text(json.dumps({'files': {
                name: {'size': len(data), 'sha256': digest}
            }}))
            receipt = hashlib.sha256(name.encode()).hexdigest() + '.json'
            (root / 'receipts' / receipt).write_text(json.dumps({'sha256':digest}))
            mirror = CollectionMirror(root)

            class Handler(BaseHTTPRequestHandler):
                def do_GET(self):
                    if not mirror.serve(self, self.path, True):
                        self.send_error(404)

                def log_message(self, *args):
                    pass

            with ThreadingHTTPServer(('127.0.0.1',0), Handler) as server:
                thread = Thread(target=server.serve_forever, daemon=True)
                thread.start()
                base = f'http://127.0.0.1:{server.server_port}/ut2004/'
                try:
                    req = Request(base+'?map=DM-Rankin', headers={'Range':'bytes=7-10'})
                    with urlopen(req,timeout=4) as res:
                        self.assertEqual(res.status, 206)
                        self.assertEqual(res.read(), data[7:11])
                        self.assertEqual(res.headers['Cross-Origin-Opener-Policy'], 'same-origin')
                        self.assertIn("connect-src 'self'", res.headers['Content-Security-Policy'])
                    for path in ('secrets.txt','%2e%2e/catalog.json'):
                        with self.assertRaises(HTTPError) as err:
                            urlopen(base+path,timeout=4)
                        self.assertEqual(err.exception.code,404)
                        err.exception.close()
                    file.write_bytes(bytes(len(data)))
                    with self.assertRaises(HTTPError) as err:
                        urlopen(base,timeout=4)
                    self.assertEqual(err.exception.code,503)
                    err.exception.close()
                finally:
                    server.shutdown()
                    thread.join()


if __name__ == '__main__':
    unittest.main()
