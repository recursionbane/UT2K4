#!/usr/bin/env python3
"""Mirror the public UT2004 release privately, compressed and verified, for localhost playback.

Three bounded workers, completed-file resume, no automatic retries or upstream proxying.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed, CancelledError
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import struct
import subprocess
import threading
import time
from urllib.parse import quote, urlsplit
from urllib.request import Request, urlopen
from urllib.robotparser import RobotFileParser

BASE='https://unrealcollection.games/ut2004/'
AGENT='UT2K4-Private-Offline-Mirror/1.0 (personal localhost playback)'


def safe(name):
    if not name or name.startswith('/') or '..' in PurePosixPath(name).parts or '\\' in name:
        raise ValueError('Unsafe upstream manifest path: '+name)
    return name


def atomic_json(path, value):
    path.parent.mkdir(parents=True,exist_ok=True)
    temp=path.with_name(path.name+'.part')
    temp.write_text(json.dumps(value,indent=2)+'\n');os.replace(temp,path)


def package_guid_offset(header, size):
    version=struct.unpack_from('<H',header,4)[0]
    if version>=68:return 36
    count,offset=struct.unpack_from('<II',header,36)
    position=offset+16*(count-1)
    if count<1 or position<44 or position+16>size:
        raise ValueError('Invalid legacy package heritage table')
    return position


class Fetcher:
    def __init__(self,root):
        self.root=root;self.lock=threading.Lock();self.next_request=0.;self.delay=.05
        self.stop=threading.Event();self.policy=None
        self.legacy_compatible=False
        try:
            self.old_manifest_sha=json.loads(self.receipt('file-manifest.json').read_text())['sha256']
            self.old_build=json.loads((root/'catalog.json').read_text())['build']
        except (OSError,ValueError,KeyError):self.old_manifest_sha=None;self.old_build=None

    def request(self,url):
        if self.stop.is_set(): raise RuntimeError('Mirror stopped after an upstream failure')
        if self.policy and not self.policy.can_fetch(AGENT,url): raise RuntimeError('robots.txt disallows '+url)
        with self.lock:
            pause=max(0,self.next_request-time.monotonic())
            if pause:time.sleep(pause)
            self.next_request=time.monotonic()+self.delay
        return urlopen(Request(url,headers={'User-Agent':AGENT,'Accept-Encoding':'identity'}),timeout=45)

    def small(self,url):
        with self.request(url) as response:
            if response.status!=200:raise RuntimeError('Unexpected upstream HTTP '+str(response.status))
            return response.read(16*1024*1024)

    def receipt(self,name):
        return self.root/'receipts'/(hashlib.sha256(name.encode()).hexdigest()+'.json')

    def fetch(self,name,item):
        safe(name);target=self.root/'files'/name;receipt=self.receipt(name)
        identity=hashlib.sha256(json.dumps(item,sort_keys=True).encode()).hexdigest()
        if target.is_file() and receipt.is_file():
            old=json.loads(receipt.read_text())
            with target.open('rb') as stream:digest=hashlib.file_digest(stream,'sha256').hexdigest()
            legacy=hashlib.sha256(json.dumps({k:v for k,v in item.items() if k!='mtime'},sort_keys=True).encode()).hexdigest()
            if old.get('sha256')==digest and target.stat().st_size==item['size']:
                if old.get('identity')==identity:return False
                if self.legacy_compatible and old.get('identity')==legacy:
                    old['identity']=identity;old['resumedFromUnchangedPinnedManifest']=True
                    atomic_json(receipt,old);return False
        target.parent.mkdir(parents=True,exist_ok=True);part=target.with_name(target.name+'.part')
        url=BASE+quote(name,safe='/');digest=hashlib.sha256();count=0
        try:
            with self.request(url) as response,part.open('wb') as output:
                if response.status!=200:raise RuntimeError('Unexpected upstream HTTP '+str(response.status))
                if urlsplit(response.url).hostname!='unrealcollection.games':raise RuntimeError('Unexpected cross-host redirect')
                expected_length=response.headers.get('Content-Length')
                if expected_length and int(expected_length)!=item['size']:raise RuntimeError('Upstream Content-Length differs from pinned manifest: '+name)
                etag=response.headers.get('ETag');modified=response.headers.get('Last-Modified')
                while True:
                    block=response.read(256*1024)
                    if not block:break
                    output.write(block);digest.update(block);count+=len(block)
                    if count>item['size']:raise RuntimeError('Oversized upstream asset: '+name)
            actual=digest.hexdigest()
            if count!=item['size']:raise RuntimeError('Truncated upstream asset: '+name)
            if item.get('sha256') and actual!=item['sha256']:raise RuntimeError('Upstream SHA-256 differs from pinned shell manifest: '+name)
            raw_digest=None
            if name.endswith('.zst'):
                process=subprocess.Popen(['zstd','-q','-d','-c',str(part)],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
                raw_hash=hashlib.sha256();raw_count=0;head=bytearray();guid_data=bytearray();guid_at=None
                while True:
                    block=process.stdout.read(1024*1024)
                    if not block:break
                    raw_hash.update(block);begin=raw_count;raw_count+=len(block)
                    if len(head)<64:head.extend(block[:64-len(head)])
                    if item.get('guid'):
                        if guid_at is None:guid_at=package_guid_offset(head,item['rawSize'])
                        low=max(begin,guid_at);high=min(raw_count,guid_at+16)
                        if high>low:guid_data.extend(block[low-begin:high-begin])
                    if raw_count>item.get('rawSize',2**32):process.kill();raise RuntimeError('Oversized decompressed asset: '+name)
                error=process.stderr.read().decode('utf-8','replace');code=process.wait()
                process.stdout.close();process.stderr.close()
                if code or raw_count!=item['rawSize']:raise RuntimeError('Zstandard integrity/expanded-size failure: '+name+' '+error[:200])
                if item.get('guid'):
                    guid=''.join(f'{n:08X}' for n in struct.unpack('<4I',guid_data)) if len(guid_data)==16 else ''
                    if guid.upper()!=item['guid'].upper():raise RuntimeError('Package GUID differs from manifest: '+name)
                raw_digest=raw_hash.hexdigest()
            os.replace(part,target)
            atomic_json(receipt,{'path':name,'source':url,'identity':identity,'size':count,'sha256':actual,
                                 'rawSha256':raw_digest,'etag':etag,'lastModified':modified,
                                 'verifiedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())})
            return True
        except Exception:
            self.stop.set();raise
        finally:
            if part.exists():part.unlink()


def run(args):
    root=args.dest.resolve();root.mkdir(parents=True,exist_ok=True)
    for marker in ('complete.json','rankin-ready.json','failure.json'):
        (root/marker).unlink(missing_ok=True)
    if not shutil.which('zstd'):raise RuntimeError('Install zstd to verify the compressed package stream')
    fetcher=Fetcher(root)
    robots=fetcher.small('https://unrealcollection.games/robots.txt').decode('utf-8')
    policy=RobotFileParser();policy.parse(robots.splitlines());fetcher.policy=policy
    fetcher.delay=max(fetcher.delay,policy.crawl_delay(AGENT) or policy.crawl_delay('*') or 0)
    (root/'robots.txt').write_text(robots)
    source=fetcher.small(BASE+'shell-files.json');shell=json.loads(source)
    shell_items={safe(v['path']):{'size':v['size'],'sha256':v['sha256']} for v in shell['files']}
    fetcher.legacy_compatible=fetcher.old_build==shell['build'] and fetcher.old_manifest_sha==shell_items['file-manifest.json']['sha256']
    shell_items['shell-files.json']={'size':len(source),'sha256':hashlib.sha256(source).hexdigest()}
    for name,item in shell_items.items():
        fetcher.fetch(name,item)
    # PWA bootstrap files are directly referenced by the pinned glue, but omitted
    # from its shell hash list to avoid the service-worker build-hash cycle.
    for name in ('sw.js','ufront-service-worker.js'):
        content=fetcher.small(BASE+name)
        shell_items[name]={'size':len(content),'sha256':hashlib.sha256(content).hexdigest()}
        fetcher.fetch(name,shell_items[name])
    manifest=json.loads((root/'files/file-manifest.json').read_text())
    dependencies=json.loads((root/'files/dependency-manifest.json').read_text())
    catalog=dict(shell_items)
    for logical,entry in manifest.items():
        name=safe(entry['path'])
        catalog[name]={'size':entry.get('compressedSize',entry['size']),'mtime':entry.get('mtime')}
        if name.endswith('.zst'):
            catalog[name]['rawSize']=entry['size']
            if entry.get('guid'):catalog[name]['guid']=entry['guid']
    atomic_json(root/'catalog.json',{'source':BASE,'build':shell['build'],'files':catalog})
    precache=json.loads((root/'files/precache-list.json').read_text())
    if isinstance(precache,dict):precache=precache.get('files',list(precache))
    pending=[str(p).lower() for p in precache if isinstance(p,str)]+['maps/dm-rankin.ut2','music/kr-rankin.ogg','textures/teamsymbols_ut2004.utx']
    priority=set()
    while pending:
        name=pending.pop()
        if name in priority:continue
        priority.add(name);pending.extend(dependencies.get(name,[]))
    data_items={entry['path']:catalog[entry['path']] for entry in manifest.values()}
    prioritized={manifest[k]['path'] for k in priority if k in manifest}
    ordered=sorted(data_items,key=lambda p:(p not in prioritized,p))
    print(json.dumps({'build':shell['build'],'assets':len(catalog),'compressedBytes':sum(i['size'] for i in catalog.values()),
                      'expandedGameBytes':sum(e['size'] for e in manifest.values()),'priorityAssets':len(prioritized),'jobs':args.jobs}),flush=True)
    complete=0;downloaded=0;priority_left=len(prioritized);started=time.monotonic();last=started;failures=[];stopping=False
    with ThreadPoolExecutor(max_workers=args.jobs) as pool:
        futures={pool.submit(fetcher.fetch,name,item):name for name,item in ((n,data_items[n]) for n in ordered)}
        for future in as_completed(futures):
            name=futures[future]
            try:
                downloaded+=bool(future.result());complete+=1
                if name in prioritized:priority_left-=1
                if priority_left==0 and not (root/'rankin-ready.json').exists():
                    atomic_json(root/'rankin-ready.json',{'build':shell['build'],'priorityAssets':len(prioritized),'ready':True})
                    print('RANKIN PRIORITY ASSETS VERIFIED',flush=True)
                now=time.monotonic()
                if complete%100==0 or now-last>15:
                    print(json.dumps({'verified':complete,'total':len(data_items),'downloaded':downloaded,'priorityRemaining':priority_left,'seconds':round(now-started)}),flush=True);last=now
            except CancelledError:continue
            except Exception as error:
                if not str(error).startswith('Mirror stopped') and len(failures)<20:
                    failures.append({'path':name,'error':str(error)});print('STOP: '+str(error),flush=True)
                if not stopping:
                    stopping=True;fetcher.stop.set()
                    for queued in futures:queued.cancel()
    if failures:
        atomic_json(root/'failure.json',{'failures':failures,'verified':complete})
        raise RuntimeError('Mirror incomplete; upstream limits/errors were not retried. See failure.json')
    result={'source':BASE,'build':shell['build'],'files':len(catalog),'verifiedDataAssets':complete,
            'compressedBytes':sum(i['size'] for i in catalog.values()),'expandedGameBytes':sum(e['size'] for e in manifest.values()),
            'complete':True,'completedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())}
    atomic_json(root/'complete.json',result);print(json.dumps(result),flush=True)
    (root/'failure.json').unlink(missing_ok=True)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dest',type=Path,default=Path(__file__).resolve().parents[1]/'.local-runtime/collection')
    parser.add_argument('--jobs',type=int,choices=(1,2,3,4),default=3)
    args=parser.parse_args()
    try:run(args)
    except Exception as error:
        failure=args.dest.resolve()/'failure.json'
        if not failure.exists():atomic_json(failure,{'error':str(error),'source':getattr(error,'url',BASE)})
        raise SystemExit(str(error))

if __name__=='__main__':main()
