// Lossless seekable package transport. Creates candidates only; never edits a release.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import zlib from 'node:zlib';import {promisify}from'node:util';
const compress=promisify(zlib.zstdCompress);
export const DEFAULT_POLICY={minimum:4*1024*1024,blockSize:256*1024,level:15,extensions:['u','ut2','utx','usx','ukx','uax','umx','ogg']};
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function safe(name){if(!name||name.startsWith('/')||name.includes('\\')||name.split('/').some(p=>p==='.'||p==='..'))throw Error('Unsafe transport path');return name;}
export function eligible(logical,size,policy=DEFAULT_POLICY){return size>=policy.minimum&&new RegExp('\\.('+policy.extensions.join('|')+')$','i').test(logical);}
export async function buildPackage({logical,entry,transport,output,policy=DEFAULT_POLICY}){
 safe(entry.path);const transportHash=sha(transport),containerPath=entry.path+'.jit',indexPath=entry.path+'.jit.json';
 const target=path.join(output,containerPath),descriptor=path.join(output,indexPath);fs.mkdirSync(path.dirname(target),{recursive:true});
 if(fs.existsSync(descriptor)&&fs.existsSync(target)){
  const old=JSON.parse(fs.readFileSync(descriptor));
  if(old.transportSha256===transportHash&&old.blockSize===policy.blockSize&&old.level===policy.level&&old.containerSize===fs.statSync(target).size&&old.containerSha256===sha(fs.readFileSync(target)))return {logical,container:containerPath,index:indexPath,...old,resumed:true};
 }
 const raw=entry.path.endsWith('.zst')?zlib.zstdDecompressSync(transport):entry.path.endsWith('.gz')?zlib.gunzipSync(transport):Buffer.from(transport);
 if(raw.length!==entry.size)throw Error('Source expanded length mismatch: '+logical);
 const blocks=[],temp=target+'.part';const fd=fs.openSync(temp,'w');let offset=0;const hash=crypto.createHash('sha256');
 try{
  for(let at=0;at<raw.length;at+=policy.blockSize){
   const bytes=raw.subarray(at,Math.min(raw.length,at+policy.blockSize));
   const frame=await compress(bytes,{params:{[zlib.constants.ZSTD_c_compressionLevel]:policy.level}});
   // Verify every independent frame, not merely the container's byte count.
   const decoded=zlib.zstdDecompressSync(frame);if(!decoded.equals(bytes))throw Error('Independent Zstd round-trip failed');
   fs.writeSync(fd,frame);hash.update(frame);blocks.push({offset,length:frame.length,rawLength:bytes.length,sha256:sha(bytes)});offset+=frame.length;
  }
 }finally{fs.closeSync(fd);}
 const index={format:'zstd-pages-v1',size:raw.length,blockSize:policy.blockSize,level:policy.level,containerSize:offset,transportSha256:transportHash,rawSha256:sha(raw),containerSha256:hash.digest('hex'),blocks};
 fs.renameSync(temp,target);fs.writeFileSync(descriptor+'.part',JSON.stringify(index));fs.renameSync(descriptor+'.part',descriptor);
 return {logical,container:containerPath,index:indexPath,...index,resumed:false};
}
export async function buildCorpus({manifest,readTransport,output,policy=DEFAULT_POLICY,jobs=3,only=null,onProgress=()=>{}}){
 const entries=Object.entries(manifest).filter(([name,e])=>eligible(name,e.size,policy)&&(!only||name.toLowerCase().includes(only.toLowerCase())));let cursor=0;const results=[];
 await Promise.all(Array.from({length:Math.min(jobs,entries.length)},async()=>{for(;;){const at=cursor++;if(at>=entries.length)return;const[logical,entry]=entries[at];const transport=await readTransport(entry.path);const result=await buildPackage({logical,entry,transport,output,policy});results.push(result);onProgress({complete:results.length,total:entries.length,logical,rawBytes:result.size,containerBytes:result.containerSize,resumed:result.resumed});}}));
 const summary={format:'zstd-pages-corpus-v1',policy,files:results.map(({logical,container,index,size,containerSize,rawSha256,transportSha256})=>({logical,container,index,size,containerSize,rawSha256,transportSha256}))};
 fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'jit-outputs.json'),JSON.stringify(summary,null,2));return summary;
}
if(process.argv[1]&&path.resolve(process.argv[1])===import.meta.filename){
 const argv=process.argv.slice(2),get=(name,fallback)=>{const at=argv.indexOf('--'+name);return at<0?fallback:argv[at+1];};
 const root=path.resolve(import.meta.dirname,'../..');const files=path.resolve(get('files',path.join(root,'.local-runtime/collection/files'))),overlay=get('overlay',null),output=path.resolve(get('output',path.join(root,'.local-runtime/jit'))),manifest=JSON.parse(fs.readFileSync(get('manifest',path.join(files,'file-manifest.json'))));
 const policy={...DEFAULT_POLICY,minimum:Number(get('min-bytes',DEFAULT_POLICY.minimum)),blockSize:Number(get('block-size',DEFAULT_POLICY.blockSize)),level:Number(get('level',15))};
 if(!Number.isSafeInteger(policy.blockSize)||policy.blockSize<65536||policy.blockSize>1024*1024)throw Error('Block size must be 64KiB–1MiB');
 const result=await buildCorpus({manifest,output,policy,jobs:Number(get('jobs',3)),only:get('only',null),readTransport:async name=>{safe(name);const candidate=overlay&&path.join(overlay,name);return fs.readFileSync(candidate&&fs.existsSync(candidate)?candidate:path.join(files,name));},onProgress:value=>console.log(JSON.stringify(value))});
 console.log('Candidate corpus complete:',result.files.length,'packages');
}
