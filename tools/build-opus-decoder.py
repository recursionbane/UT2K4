#!/usr/bin/env python3
"""Build the fixed-memory, decoder-only Opus WASM API from a pinned official archive."""
import argparse,hashlib,json,re,shutil,subprocess,tarfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SHA='6ffcb593207be92584df15b32466ed64bbec99109f007c82205f0194572411a1'
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--archive',required=True,type=Path);p.add_argument('--work',type=Path,default=ROOT/'.local-runtime/codecs/opus-rebuild');p.add_argument('--emcc',default='emcc');p.add_argument('--emcmake',default='emcmake');p.add_argument('--cmake',default='cmake');p.add_argument('--jobs',type=int,default=4);p.add_argument('--update-runtime',action='store_true');a=p.parse_args()
if hashlib.sha256(a.archive.read_bytes()).hexdigest()!=SHA:p.error('Official Opus1.6.1 archive SHA256 mismatch')
a.work.mkdir(parents=True,exist_ok=True)
with tarfile.open(a.archive)as archive:archive.extractall(a.work,filter='data')
source=(a.work/'opus-1.6.1').resolve();build=(a.work/'build').resolve();out=ROOT/'runtime/collection/codecs/opus';target=out/'opus_decoder.wasm'
flags=['-DCMAKE_BUILD_TYPE=MinSizeRel','-DOPUS_BUILD_SHARED_LIBRARY=OFF','-DOPUS_BUILD_PROGRAMS=OFF','-DOPUS_BUILD_TESTING=OFF','-DBUILD_TESTING=OFF','-DOPUS_DISABLE_INTRINSICS=ON','-DOPUS_DRED=OFF','-DOPUS_OSCE=OFF','-DOPUS_HARDENING=ON','-DCMAKE_C_FLAGS=\"-ffile-prefix-map='+str(source)+'=opus\"']
subprocess.run([a.emcmake,a.cmake,'-S',str(source),'-B',str(build)]+flags,check=True);subprocess.run([a.cmake,'--build',str(build),'-j',str(max(1,min(8,a.jobs)))],check=True)
link=['-Oz','-flto','--no-entry','-s','STANDALONE_WASM=1','-s','MALLOC=emmalloc','-s','FILESYSTEM=0','-s','ASSERTIONS=0','-s','SUPPORT_LONGJMP=0','-s','ALLOW_MEMORY_GROWTH=0','-s','INITIAL_MEMORY=2097152','-s','STACK_SIZE=262144','-s','EXPORTED_FUNCTIONS=["_malloc","_free","_collection_opus_create","_collection_opus_decode","_collection_opus_destroy"]']
subprocess.run([a.emcc,str(out/'decoder.c'),str(build/'libopus.a'),'-I'+str(source/'include')]+link+['-o',str(target)],check=True);digest=hashlib.sha256(target.read_bytes()).hexdigest();shutil.copyfile(source/'COPYING',out/'LICENSE')
meta={'codec':'Opus','version':'1.6.1','source':'https://downloads.xiph.org/releases/opus/opus-1.6.1.tar.gz','sourceSha256':SHA,'wasmSha256':digest,'wasmBytes':target.stat().st_size,'memoryBytes':2097152,'memoryGrowth':False,'compiler':subprocess.check_output([a.emcc,'--version'],text=True).splitlines()[0],'cmakeFlags':[flag.replace(str(source),'<source>')for flag in flags],'linkFlags':link}
(out/'build.json').write_text(json.dumps(meta,indent=2)+'\n')
if a.update_runtime:
 module=out/'decoder.mjs';module.write_text(re.sub(r"OPUS_WASM_SHA256='[0-9a-f]{64}'","OPUS_WASM_SHA256='"+digest+"'",module.read_text()))
print('Built Opus WASM SHA256',digest)
if not a.update_runtime:print('Use --update-runtime when adopting this rebuilt artifact; its runtime integrity constant must match.')
