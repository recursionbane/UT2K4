import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'tools'))
SPEC = importlib.util.spec_from_file_location('private_stream', ROOT/'tools/stream-game.py')
STREAM = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(STREAM)


class PrivateMatrixTests(unittest.TestCase):
    def test_bad_archive_refused_and_verified_bytes_retained(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp)/'private.exe'
            path.write_bytes(b'bad release')
            with self.assertRaisesRegex(ValueError, 'checksum mismatch'):
                STREAM.matrix_archive(path)
            payload = b'verified test release'
            path.write_bytes(payload)
            with patch.object(STREAM, 'MATRIX_SHA256', hashlib.sha256(payload).hexdigest()):
                retained = STREAM.matrix_archive(path)
            path.write_bytes(b'changed after verification')
            self.assertEqual(retained, payload)

    def test_private_manifest_route_ranges_and_origin_gate(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            for name in ('System/Core.u', 'Maps/DM-Antalus.ut2'):
                path = root/name
                path.parent.mkdir(exist_ok=True)
                path.write_bytes(b'game test')
            archive = root/'private.exe'
            payload = b'verified test release'
            archive.write_bytes(payload)
            # Pin a small synthetic fixture, so public tests require no original assets.
            code = f"import importlib.util,sys; sys.path.insert(0,{str(ROOT/'tools')!r}); s=importlib.util.spec_from_file_location('stream',{str(ROOT/'tools/stream-game.py')!r}); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); m.MATRIX_SHA256={hashlib.sha256(payload).hexdigest()!r}; m.main()"
            with subprocess.Popen([sys.executable,'-c',code,str(root),'--port','0','--matrix-archive',str(archive)],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True) as server:
                try:
                    launch=server.stdout.readline().strip()
                    base=launch.split('Play: ',1)[1].split('/play/',1)[0]
                    with urlopen(base+'/manifest.json',timeout=5) as response:
                        manifest=json.load(response)
                    self.assertEqual(manifest['matrixArchive'],'matrix-release.exe')
                    self.assertNotIn('private.exe',manifest['files'])
                    self.assertNotIn(str(archive),json.dumps(manifest))
                    archive.write_bytes(b'replaced file')
                    with urlopen(base+'/matrix-release.exe',timeout=5) as response:
                        self.assertEqual(response.read(),payload)
                    with urlopen(Request(base+'/matrix-release.exe',headers={'Range':'bytes=2-8'}),timeout=5) as response:
                        self.assertEqual(response.status,206)
                        self.assertEqual(response.read(),payload[2:9])
                    for path in ('/matrix-release.exe','/play/matrix-release.exe'):
                        with self.assertRaises(HTTPError) as denied:
                            urlopen(Request(base+path,headers={'Origin':'https://untrusted.example'}),timeout=5)
                        self.assertEqual(denied.exception.code,403)
                        denied.exception.close()
                    with self.assertRaises(HTTPError) as not_public:
                        urlopen(base+'/play/matrix-release.exe',timeout=5)
                    self.assertEqual(not_public.exception.code,404)
                    not_public.exception.close()
                finally:
                    server.terminate()


if __name__=='__main__':
    unittest.main()
