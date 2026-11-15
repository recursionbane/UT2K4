/** Keep thousands of tiny configuration reads off the network's serial critical path. */
import crypto from 'node:crypto';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const marker='// PRIVATE_TINY_BUNDLE_START';
export function createTinyBundle(fileManifest,read){
 const index={},parts=[];let offset=0;
 for(const [logical,entry]of Object.entries(fileManifest).sort(([a],[b])=>a.localeCompare(b))){
  if(entry.size>=65536||! /\.(ini|int|ucl|upl|det|est|frt|itt|kot|smt|rut|jpt)$/i.test(logical))continue;
  if(index[entry.path])continue;
  const bytes=read(entry.path);
  index[entry.path]=[offset,bytes.length];parts.push(bytes);offset+=bytes.length;
 }
 const metadata=Buffer.from(JSON.stringify(index));
 const header=Buffer.alloc(8);header.write('TPK1');header.writeUInt32LE(metadata.length,4);
 const data=Buffer.concat([header,metadata,...parts]);
 return {data,index,sha256:sha(data),name:'bootstrap-'+sha(data).slice(0,16)+'.bin',files:Object.keys(index).length};
}
export function tinyBundleRuntime({name,sha256}){
 return `${marker}
const privateTinyName=${JSON.stringify(name)},privateTinyHash=${JSON.stringify(sha256)};
let privateTinyLoading;
async function privateTinyBody(url) {
 const resolved=new URL(pageUrl(url,pageBase),self.location.href);
 if(!/\\.(ini|int|ucl|upl|det|est|frt|itt|kot|smt|rut|jpt)(?:\\.zst|\\.gz)?$/i.test(resolved.pathname))return null;
 if(!privateTinyLoading)privateTinyLoading=(async()=>{
   const result=await fetchBody(pageUrl(privateTinyName,pageBase),{init:{cache:'no-store'},stallMs:downloadStallMs});
   if(!result.ok)throw Error('bootstrap HTTP '+result.status);
   const data=result.bytes;
   const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),b=>b.toString(16).padStart(2,'0')).join('');
   if(digest!==privateTinyHash||new TextDecoder().decode(data.subarray(0,4))!=='TPK1')throw Error('bootstrap integrity');
   const length=new DataView(data.buffer,data.byteOffset,data.byteLength).getUint32(4,true),start=8+length;
   if(start>data.length)throw Error('bootstrap index');
   const entries=JSON.parse(new TextDecoder().decode(data.subarray(8,start))),byURL=new Map();
   for(const [path,range]of Object.entries(entries)){
     const [offset,size]=range;
     if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(size)||offset<0||size<0||start+offset+size>data.length)throw Error('bootstrap bounds');
     const key=new URL(pageUrl(path,pageBase),self.location.href);key.search='';key.hash='';
     byURL.set(key.href,data.subarray(start+offset,start+offset+size));
   }
   console.log('[PackageCache] tiny bootstrap ready: '+byURL.size+' files, '+data.length+' bytes');
   return byURL;
 })().catch(()=>{console.warn('[PackageCache] tiny bootstrap unavailable; using individual asset reads');return null;});
 const bundle=await privateTinyLoading;resolved.search='';resolved.hash='';
 const bytes=bundle?.get(resolved.href);
 return bytes?{ok:true,status:200,bytes}:null;
}
// PRIVATE_TINY_BUNDLE_END
`;
}
export function patchTinyBundle(source,bundle){
 const call='const res = await fetchBody(pageUrl(url, pageBase), {';
 const patched='const res = await privateTinyBody(url) || await fetchBody(pageUrl(url, pageBase), {';
 source=source.replace(/\/\/ PRIVATE_TINY_BUNDLE_START[\s\S]*?\/\/ PRIVATE_TINY_BUNDLE_END\n/,'').replace(patched,call);
 if(source.split(call).length!==2)throw Error('Cache download seam changed');
 const declaration='  async function download(url, { size } = {}) {';
 if(source.split(declaration).length!==2)throw Error('Cache download declaration changed');
 return source.replace(declaration,tinyBundleRuntime(bundle)+declaration).replace(call,patched);
}
