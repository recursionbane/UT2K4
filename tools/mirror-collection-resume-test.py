import argparse
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import struct
import shutil
import tempfile
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('mirror',Path(__file__).with_name('mirror-collection.py'))
mirror=importlib.util.module_from_spec(spec);spec.loader.exec_module(mirror)

class ResumeTests(unittest.TestCase):
    @unittest.skipUnless(shutil.which('zstd'),'zstd verifies the fixture')
    def test_legacy_guid_table_can_cross_a_stream_chunk(self):
        raw=bytearray(1024*1024+16);offset=1024*1024-8
        struct.pack_into('<I',raw,0,0x9E2A83C1);struct.pack_into('<H',raw,4,65)
        struct.pack_into('<II',raw,36,1,offset)
        struct.pack_into('<4I',raw,offset,0xAABBCCDD,0x10203040,0x50607080,0x99887766)
        packed=mirror.subprocess.run(['zstd','-q','-c'],input=raw,capture_output=True,check=True).stdout
        class Response(io.BytesIO):
            status=200;url=mirror.BASE+'old.uax.zst'
            headers={'Content-Length':str(len(packed))}
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);fetcher=mirror.Fetcher(root)
            with patch.object(fetcher,'request',return_value=Response(packed)):
                self.assertTrue(fetcher.fetch('old.uax.zst',{'size':len(packed),'rawSize':len(raw),'guid':'AABBCCDD102030405060708099887766'}))
            receipt=json.loads(fetcher.receipt('old.uax.zst').read_text())
            self.assertEqual(receipt['rawSha256'],hashlib.sha256(raw).hexdigest())

    def test_legacy_and_modern_package_guid_locations(self):
        header=bytearray(80);struct.pack_into('<H',header,4,65);struct.pack_into('<II',header,36,2,44)
        self.assertEqual(mirror.package_guid_offset(header,80),60)
        struct.pack_into('<H',header,4,128)
        self.assertEqual(mirror.package_guid_offset(header,80),36)
        struct.pack_into('<H',header,4,65);struct.pack_into('<II',header,36,0,44)
        with self.assertRaises(ValueError):mirror.package_guid_offset(header,80)

    def test_resume_hashes_completed_file_without_download(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);f=mirror.Fetcher(root);item={'size':3};target=root/'files/a.txt';target.parent.mkdir();target.write_bytes(b'abc')
            mirror.atomic_json(f.receipt('a.txt'),{'sha256':hashlib.sha256(b'abc').hexdigest(),'identity':hashlib.sha256(json.dumps(item,sort_keys=True).encode()).hexdigest()})
            with patch.object(f,'request',side_effect=AssertionError('unexpected network request')):
                self.assertFalse(f.fetch('a.txt',item))
                f.legacy_compatible=True
                self.assertFalse(f.fetch('a.txt',{'size':3,'mtime':100}))
            identity=json.loads(f.receipt('a.txt').read_text())['identity']
            self.assertEqual(identity,hashlib.sha256(json.dumps({'size':3,'mtime':100},sort_keys=True).encode()).hexdigest())

    def test_corrupted_cached_file_is_not_accepted(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);f=mirror.Fetcher(root);item={'size':3};target=root/'files/a.txt';target.parent.mkdir();target.write_bytes(b'bad')
            mirror.atomic_json(f.receipt('a.txt'),{'sha256':hashlib.sha256(b'abc').hexdigest(),'identity':hashlib.sha256(json.dumps(item,sort_keys=True).encode()).hexdigest()})
            with patch.object(f,'request',side_effect=RuntimeError('upstream unavailable')) as request:
                with self.assertRaisesRegex(RuntimeError,'upstream unavailable'):f.fetch('a.txt',item)
                self.assertEqual(request.call_count,1)
            self.assertTrue(f.stop.is_set())

    def test_new_verification_clears_stale_completion(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            for name in ('complete.json','failure.json','rankin-ready.json'):(root/name).write_text('{}')
            with patch.object(mirror.shutil,'which',return_value=None):
                with self.assertRaises(RuntimeError):mirror.run(argparse.Namespace(dest=root,jobs=1))
            self.assertFalse((root/'complete.json').exists())
            self.assertFalse((root/'rankin-ready.json').exists())

if __name__=='__main__':unittest.main()
