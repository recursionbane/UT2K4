"""Prepare candidate mixed-codec containers using verified, content-keyed XZ frames."""
import argparse
import hashlib
import json
from pathlib import Path
import sqlite3
import importlib.util
from contextlib import closing
import os

def sha(data):return hashlib.sha256(data).hexdigest()
def compact(data):return json.dumps(data,separators=(',',':'),ensure_ascii=False).encode()
def persist(path,body):
    path.parent.mkdir(parents=True,exist_ok=True)
    temp=path.with_suffix(path.suffix+'.part');temp.write_bytes(body);temp.replace(path)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output',type=Path);parser.add_argument('cache',type=Path)
    parser.add_argument('roots',nargs='+',type=Path);parser.add_argument('--only',action='append')
    args=parser.parse_args();out=args.output
    if out.resolve() in [p.resolve() for p in args.roots]:raise ValueError('Output must be separate')
    spec=importlib.util.spec_from_file_location('frame_encoder',Path(__file__).with_name('build-xz-frame-cache.py'))
    encoder=importlib.util.module_from_spec(spec);spec.loader.exec_module(encoder)
    def locate(name):
        if Path(name).is_absolute() or '..' in Path(name).parts:raise ValueError('Invalid path')
        for r in args.roots:
            p=r/name
            if p.is_file():return p
        raise FileNotFoundError(name)
    manifest=json.loads(locate('file-manifest.json').read_text());receipts=[]
    base_sha=sha(locate('candidate.json').read_bytes())
    with closing(sqlite3.connect(args.cache,timeout=60)) as db:
        for logical,e in manifest.items():
            if not e.get('jit') or (args.only and logical not in args.only):continue
            name=e['path']+'.jit';idxname=name+'.json';idxbytes=locate(idxname).read_bytes();idx=json.loads(idxbytes)
            if idx['format']!='zstd-pages-v1':raise ValueError('Only plain Zstd source profile supported')
            file=locate(name);old=file.read_bytes()
            if len(old)!=idx['containerSize'] or sha(old)!=idx['containerSha256']:raise ValueError('Source container identity')
            blocks=[];parts=[];offset=0;chosen=0;new_cache=[]
            for block in idx['blocks']:
                rawlen=block['rawLength'];h=block['sha256'];start=block['offset'];n=block['length'];original=old[start:start+n]
                row=db.execute('select raw_len,encoded from xz_v1 where raw_sha=?',(h,)).fetchone()
                if row:
                    if row[0]!=rawlen:raise ValueError('Frame extent mismatch')
                    enc=row[1]
                else:
                    key,rawlen,_,enc=encoder.encode((file,block));new_cache.append((key,rawlen,enc))
                b=dict(block)
                if len(enc)+16<len(original):
                    # Validate storage integrity at assembly even on cache hits.
                    decoded=encoder.lzma.decompress(enc,memlimit=8*1048576)
                    if len(decoded)!=rawlen or sha(decoded)!=h:raise ValueError('Cached XZ frame changed')
                    data=enc;b['codec']='xz';chosen+=1
                else:data=original
                b['offset']=offset;b['length']=len(data);blocks.append(b);parts.append(data);offset+=len(data)
            if new_cache:
                db.executemany('insert or ignore into xz_v1 values(?,?,?)',new_cache);db.commit()
            if chosen:
                body=b''.join(parts);nidx={**idx,'format':'mixed-pages-v1','containerSize':len(body),'containerSha256':sha(body),'blocks':blocks};encoded=compact(nidx)
                if len(encoded)<=4*1048576 and len(encoded)+len(body)<len(old)+len(idxbytes):
                    persist(out/name,body);persist(out/idxname,encoded)
                    receipts.append({'logical':logical,'container':name,'index':idxname,'sourceIndexSha256':sha(idxbytes),'sourceContainerSha256':idx['containerSha256'],'containerSha256':nidx['containerSha256'],'indexSha256':sha(encoded),'framesChanged':chosen,'savedBytes':len(idxbytes)+len(old)-len(encoded)-len(body)})
            if len(receipts)%100==0:print('accepted',len(receipts),flush=True)
    persist(out/'summary.json',compact({'baseCandidateSha256':base_sha,'finished':True,'packages':receipts,'savedBytes':sum(x['savedBytes'] for x in receipts)}))
if __name__=='__main__':main()
