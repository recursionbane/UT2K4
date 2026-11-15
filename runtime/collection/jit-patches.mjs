// Pinned-source patch generators. They do not read secrets or edit a deployment.
import {createJitCache}from'./jit-cache.mjs';
function once(source,needle,replacement,label){const n=source.split(needle).length-1;if(n!==1)throw Error(label+' seam changed ('+n+')');return source.replace(needle,replacement);}
export function patchJitGlue(source,{engineCacheBytes=32*1024*1024}={}){
 if(source.includes('/* private-jit-range-v1 */'))return source;
 source=once(source,'return { path: f.path, size: entry ? entry.size : 0, mtime: entry ? entry.mtime : 0 };','return { path: f.path, size: entry ? entry.size : 0, mtime: entry ? entry.mtime : 0, jit: entry ? entry.jit || null : null };','main metadata');
 source=once(source,'{ path: answer.path, size: answer.size | 0, mtime: answer.mtime || 0, data: null }','{ path: answer.path, size: answer.size | 0, mtime: answer.mtime || 0, jit: answer.jit || null, data: null }','worker metadata');
 const cache=`/* private-jit-range-v1 */\n    const jitPages = new Map(); let jitBytes = 0;\n    function jitKeep(k,v){if(jitPages.has(k)){jitBytes-=jitPages.get(k).length;jitPages.delete(k);}while(jitPages.size&&jitBytes+v.length>${engineCacheBytes}){const old=jitPages.keys().next().value;jitBytes-=jitPages.get(old).length;jitPages.delete(old);}jitPages.set(k,v);jitBytes+=v.length;}\n    function jitRead(file,f,buffer,length,offset){\n      const want=Math.min(length,Math.max(0,f.size-offset));if(want<=0)return 0;\n      const block=f.jit.blockSize;if(!Number.isSafeInteger(block)||block<65536||block>1048576)throw Error('Invalid JIT page size');\n      let filled=0;while(filled<want){const pos=offset+filled,start=Math.floor(pos/block)*block,k=f.path+'@'+start;let page=jitPages.get(k);\n        if(page){jitPages.delete(k);jitPages.set(k,page);}else{const url=f.jitUrl||(f.jitUrl=call({op:'url',path:f.path}));const answer=fetchChunk({op:'read',path:f.path,off:start,max:Math.min(block,f.size-start),size:f.size,mtime:f.mtime,url,jit:f.jit});\n          if(!(answer instanceof Uint8Array)||answer.length!==Math.min(block,f.size-start)){unservableReport(f,'JIT page could not be served'+(answer&&answer.error?': '+answer.error:''));return 0;}page=answer;jitKeep(k,page);stats.jitPageFetches=(stats.jitPageFetches||0)+1;}\n        const within=pos-start,n=Math.min(want-filled,page.length-within);if(n<=0){unservableReport(f,'JIT short read');return 0;}Module.HEAPU8.set(page.subarray(within,within+n),buffer+filled);filled+=n;}\n      stats.jitReadCalls=(stats.jitReadCalls||0)+1;stats.jitReadBytes=(stats.jitReadBytes||0)+filled;return filled;\n    }\n    `;
 source=once(source,'    const unservable = /* @__PURE__ */ new Set();',cache+'const unservable = /* @__PURE__ */ new Set();','worker sparse cache');
 source=once(source,'      read(file, buffer, length, offset) {\n        const f = resolve(file);','      read(file, buffer, length, offset) {\n        const f = resolve(file);\n        if (!f.data && f.jit && f.jit.format === "zstd-pages-v1") return jitRead(file,f,buffer,length,offset);','worker read');
 return source;
}
export function patchJitCacheWorker(source,{readAheadPages=1}={}){
 if(!Number.isSafeInteger(readAheadPages)||readAheadPages<1||readAheadPages>4)throw Error('Invalid JIT read-ahead policy');
 if(source.includes('/* private-jit-cache-v1 */'))return source;
 const helper='/* private-jit-cache-v1 */\n  const __createPrivateJitCache = '+createJitCache.toString()+';\n';
 source=helper+source;
 source=once(source,'return (bytes) => decoder.decode(bytes);','return (bytes, expectedSize) => decoder.decode(bytes, Number.isSafeInteger(expectedSize) && expectedSize > 0 ? expectedSize : undefined);','bounded page decoder');
 source=once(source,'    const readHold = createReadHold();',`    const jit = __createPrivateJitCache({baseURL:pageBase||self.location.href,readAheadPages:${readAheadPages},decode:async(bytes,expectedSize)=>{const decoder=await getDecoder({name:'zstd',ext:'.zst'});if(!decoder)throw Error('JIT decoder unavailable');return decoder(bytes,expectedSize);},onProgress:stats=>{try{postMessage({ufrontJitProgress:stats});}catch{}}});\n    const readHold = createReadHold();`,'cache reader init');
 source=once(source,'      const off = req.off | 0;','      const off = req.off | 0;\n      if(req.jit&&req.jit.format===\'zstd-pages-v1\'){if(!req.url)return {needUrl:true};try{return await jit.read(req,window);}catch(error){return {error:\'JIT read failed: \'+String(error&&error.message||error)};}}','cache range read');
 return source;
}
export function patchReadTelemetry(source){
 const needle='      read(file, buffer, length, offset) {\n        const f = resolve(file);';
 const record=`\n        if(!globalThis.__privateReadStats){globalThis.__privateReadStats={};addEventListener('message',event=>{if(event.data&&event.data.privateReadSnapshot)postMessage({privateReadSnapshot:globalThis.__privateReadStats});});}\n        {const all=globalThis.__privateReadStats,key=f.path||'?';const s=all[key]||(all[key]={size:f.size,calls:0,requestedBytes:0,pages:[]});s.calls++;s.requestedBytes+=length;const pageSize=262144;for(let p=Math.floor(offset/pageSize);p<=Math.floor((Math.min(f.size,offset+length)-1)/pageSize);p++)if(!s.pages.includes(p))s.pages.push(p);}\n`;
 return once(source,needle,needle+record,'read telemetry');
}
