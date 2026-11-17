"""Encode verified existing JIT frames for reuse across successive compact builds."""
import argparse
import ctypes
from ctypes.util import find_library
import hashlib
import json
import lzma
from pathlib import Path
import sqlite3
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
import time

def encode(item):
    name,frame=item
    with open(name,'rb') as f:
        f.seek(frame['offset'])
        packed=f.read(frame['length'])
    n=frame['rawLength']
    if n<1 or n>1048576 or len(packed)!=frame['length']:raise ValueError('Invalid frame extent')
    if frame.get('codec')=='xz':
        raw=lzma.decompress(packed,memlimit=8*1048576)
        if len(raw)!=n:raise ValueError('XZ input size mismatch')
    elif not frame.get('codec'):
        output=ctypes.create_string_buffer(n)
        if zstd.ZSTD_decompress(output,n,packed,len(packed))!=n:raise ValueError('Zstd size mismatch')
        raw=output.raw
    else:raise ValueError('Unrecognized input frame codec')
    if hashlib.sha256(raw).hexdigest()!=frame['sha256']:raise ValueError('Frame identity mismatch')
    encoded=lzma.compress(raw,format=lzma.FORMAT_XZ,check=lzma.CHECK_CRC32,filters=[{'id':lzma.FILTER_LZMA2,'preset':7,'dict_size':262144}])
    if lzma.decompress(encoded,memlimit=8*1048576)!=raw:raise ValueError('XZ round trip failed')
    return frame['sha256'],n,len(packed),encoded

zstd=ctypes.CDLL(find_library('zstd'))
zstd.ZSTD_decompress.argtypes=[ctypes.c_void_p,ctypes.c_size_t,ctypes.c_void_p,ctypes.c_size_t]
zstd.ZSTD_decompress.restype=ctypes.c_size_t

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('db',type=Path);p.add_argument('roots',nargs='+',type=Path)
    p.add_argument('--jobs',type=int,default=4)
    a=p.parse_args();a.db.parent.mkdir(parents=True,exist_ok=True)
    def locate(name):
        if Path(name).is_absolute() or '..' in Path(name).parts:raise ValueError('Invalid asset name')
        for r in a.roots:
            f=r/name
            if f.is_file():return f
        raise FileNotFoundError(name)
    with closing(sqlite3.connect(a.db)) as db:
        db.execute('pragma journal_mode=WAL')
        db.execute('create table if not exists xz_v1 (raw_sha text primary key, raw_len integer not null, encoded blob not null) without rowid')
        known={v[0] for v in db.execute('select raw_sha from xz_v1')};todo=[]
        m=json.loads(locate('file-manifest.json').read_text())
        for entry in m.values():
            if not entry.get('jit'):continue
            name=entry['path']+'.jit';idx=json.loads(locate(name+'.json').read_text());file=locate(name)
            if idx['format'] not in ('zstd-pages-v1','mixed-pages-v1'):raise ValueError('Unknown source framing')
            for frame in idx['blocks']:
                if frame['sha256'] not in known:
                    known.add(frame['sha256']);todo.append((file,frame))
        start=time.monotonic();done=saved=0
        print(json.dumps({'plannedUniqueFrames':len(todo)}),flush=True)
        with ThreadPoolExecutor(max_workers=max(1,min(a.jobs,12))) as pool:
            for i in range(0,len(todo),512):
                for key,n,old,encoded in pool.map(encode,todo[i:i+512]):
                    db.execute('insert or ignore into xz_v1 values (?,?,?)',(key,n,encoded));done+=1
                    saved+=max(0,old-len(encoded)-16)
                db.commit()
                print(json.dumps({'done':done,'total':len(todo),'uniqueEstimatedSavingsAfterHeader':saved,'seconds':round(time.monotonic()-start)}),flush=True)
if __name__=='__main__':main()
