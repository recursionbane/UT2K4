// Browser cache-worker implementation; RAM only, same-origin, bounded verified pages.
export function createJitCache({fetcher=fetch,decode,decodeXZ=null,baseURL=globalThis.location?.href,maxBytes=32*1024*1024,maxIndexBytes=8*1024*1024,onProgress=()=>{},onEvent=()=>{},reconstruct=null,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),attempts=4,readAheadPages=1,readBudgetMs=100000}={}){
 if(!Number.isSafeInteger(readAheadPages)||readAheadPages<1||readAheadPages>4)throw Error('Read ahead must be 1–4 pages');
 if(!Number.isSafeInteger(readBudgetMs)||readBudgetMs<1||readBudgetMs>110000)throw Error('Invalid native read budget');
 if(!Number.isSafeInteger(maxIndexBytes)||maxIndexBytes<1)throw Error('Invalid metadata cache budget');
 const indexSizes=new Map();let indexBytesKept=0;
 const indices=new Map(),pages=new Map(),pending=new Map(),lastDemand=new Map(),speculative=new Set();let bytesKept=0,decodeSequence=0;
 const stats={indexRequests:0,indexEvictions:0,rangeRequests:0,wireBytes:0,decodedBytes:0,readCalls:0,readBytes:0,indexBytes:0,cacheHits:0,retries:0,readAheadConfiguredPages:readAheadPages,readAheadPages:0,readAheadBytes:0,readAheadWireBytes:0,readAheadUsedPages:0,readAheadEvictedPages:0};
 const absolute=value=>{const u=new URL(value,baseURL);if(baseURL&&u.origin!==new URL(baseURL).origin)throw Error('JIT requires same-origin assets');return u;};
 const suffix=(url,extra)=>{const u=absolute(url);u.pathname+=extra;return u.href;};
 const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
 const key=(url,n)=>url+'#'+n;
 function retryError(message,delay=0){const e=Error(message);e.retryable=true;e.retryDelay=delay;return e;}
 async function retry(action){
  for(let at=0;;at++)try{return await action();}catch(error){
   if(!error.retryable||at>=attempts-1)throw error;
   const delay=Math.max([150,450,1000][Math.min(at,2)],error.retryDelay||0);
   // Honor longer rate-limit periods by surfacing the error, never retrying early.
   if(delay>30000)throw error;stats.retries++;await sleep(delay);
  }
 }
 async function response(url,init,wanted){
  let r;try{r=await fetcher(url,{...init,cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(30000)});}catch{throw retryError('JIT network request failed');}
  if(r.status!==wanted){
   const transient=r.status===429||[500,502,503,504].includes(r.status),after=r.headers.get('Retry-After');
   let delay=0;if(after){const n=Number(after);delay=Number.isFinite(n)?Math.max(0,n*1000):Math.max(0,Date.parse(after)-Date.now())||0;}
   if(r.body)await r.body.cancel().catch(()=>{});
   if(transient)throw retryError('JIT temporary HTTP '+r.status,delay);
   throw Error('JIT HTTP status mismatch: '+r.status);
  }return r;
 }
 async function body(r,limit){
  if(Number(r.headers.get('Content-Length')||0)>limit)throw Error('JIT body exceeds bound');
  if(!r.body){const bytes=new Uint8Array(await r.arrayBuffer());if(bytes.length>limit)throw Error('JIT body exceeds bound');return bytes;}
  const reader=r.body.getReader(),pieces=[];let count=0;
  try{for(;;){let next;try{next=await reader.read();}catch{throw retryError('JIT body was interrupted');}if(next.done)break;count+=next.value.length;if(count>limit){await reader.cancel();throw Error('JIT body exceeds bound');}pieces.push(next.value);}}
  finally{reader.releaseLock();}
  const out=new Uint8Array(count);let at=0;for(const p of pieces){out.set(p,at);at+=p.length;}return out;
 }
 function touch(k){const p=pages.get(k);if(p){pages.delete(k);pages.set(k,p);stats.cacheHits++;}return p;}
 function keep(k,p){if(pages.has(k)){bytesKept-=pages.get(k).length;pages.delete(k);}while(pages.size&&bytesKept+p.length>maxBytes){const oldest=pages.keys().next().value;bytesKept-=pages.get(oldest).length;pages.delete(oldest);if(speculative.delete(oldest))stats.readAheadEvictedPages++;}if(p.length<=maxBytes){pages.set(k,p);bytesKept+=p.length;}}
 function forgetIndex(url){const n=indexSizes.get(url)||0;indexBytesKept-=n;indexSizes.delete(url);indices.delete(url);}
 function keepIndex(url,n){
  indexSizes.set(url,n);indexBytesKept+=n;
  for(const key of indices.keys()){
   if(indexBytesKept<=maxIndexBytes)break;
   if(indexSizes.has(key)){forgetIndex(key);stats.indexEvictions++;}
  }
 }
 async function index(url,size,blockSize,format){
  if(indices.has(url)){const value=indices.get(url);indices.delete(url);indices.set(url,value);return value;}
  if(!indices.has(url))indices.set(url,retry(async()=>{
   stats.indexRequests++;const r=await response(suffix(url,'.jit.json'),{},200),bytes=await body(r,4*1024*1024);stats.indexBytes+=bytes.length;
   const data=JSON.parse(new TextDecoder().decode(bytes));
   if(data.format!==format||data.size!==size||data.blockSize!==blockSize||!Array.isArray(data.blocks)||data.blocks.length!==Math.ceil(size/blockSize))throw Error('JIT index identity mismatch');
   let at=0;for(let n=0;n<data.blocks.length;n++){const b=data.blocks[n],raw=Math.min(blockSize,size-n*blockSize);if((b.codec!==undefined&&(format!=='mixed-pages-v1'||b.codec!=='xz'))||![b.offset,b.length,b.rawLength].every(Number.isSafeInteger)||b.offset!==at||b.length<=0||b.length>blockSize*2+65536||b.rawLength!==raw||!/^[a-f0-9]{64}$/.test(b.sha256))throw Error('Invalid JIT frame descriptor');at+=b.length;}
   if(at!==data.containerSize)throw Error('JIT container length mismatch');keepIndex(url,bytes.length);return data;
  }).catch(e=>{forgetIndex(url);throw e;}));return indices.get(url);
 }
 function fetchRun(url,data,first,last,demandLast){
  const start=data.blocks[first].offset,end=data.blocks[last].offset+data.blocks[last].length-1;
  const loading=retry(async()=>{
   stats.rangeRequests++;const r=await response(suffix(url,'.jit'),{headers:{Range:`bytes=${start}-${end}`}},206);
   if(r.headers.get('Content-Range')!==`bytes ${start}-${end}/${data.containerSize}`){if(r.body)await r.body.cancel().catch(()=>{});throw Error('JIT HTTP range identity mismatch');}
   const packed=await body(r,end-start+1);stats.wireBytes+=packed.length;if(packed.length!==end-start+1)throw retryError('JIT HTTP range truncated');
   const resourceId=new URL(suffix(url,'.jit')).pathname+'|bytes='+start+'-'+end,jobId='jit-'+(++decodeSequence),decodeTotal=data.blocks.slice(first,last+1).reduce((n,b)=>n+b.rawLength,0);
   onEvent({type:'decode',resourceId,jobId,loadedBytes:0,totalBytes:decodeTotal,state:'working'});
   const found=new Map();
   try{
   for(let n=first;n<=last;n++){
    const b=data.blocks[n],frame=packed.subarray(b.offset-start,b.offset-start+b.length);let raw;
    const decodeFrame=b.codec==='xz'?decodeXZ:decode;
    if(typeof decodeFrame!=='function')throw Error('Requested frame decoder unavailable');
    try{raw=new Uint8Array(await decodeFrame(frame,b.rawLength));}catch{throw retryError('JIT frame could not be decoded');}
    if(raw.length!==b.rawLength||await hash(raw)!==b.sha256)throw retryError('JIT decoded frame checksum mismatch');
    found.set(n,raw);
   }
   }catch(error){onEvent({type:'decode',resourceId,jobId,loadedBytes:0,totalBytes:decodeTotal,state:'failed'});throw error;}
   // Commit only after the entire range verifies. Failed attempts poison no cache.
   for(const [n,raw]of found){stats.decodedBytes+=raw.length;const k=key(url,n);keep(k,raw);if(n>demandLast&&pages.has(k)){speculative.add(k);stats.readAheadPages++;stats.readAheadBytes+=raw.length;stats.readAheadWireBytes+=data.blocks[n].length;}}onProgress({...stats});onEvent({type:'decode',resourceId,jobId,loadedBytes:decodeTotal,totalBytes:decodeTotal,state:'complete'});return found;
  });
  for(let n=first;n<=last;n++){const k=key(url,n);const p=loading.then(map=>map.get(n)).finally(()=>pending.delete(k));p.catch(()=>{});pending.set(k,p);}
 }
 async function read(req,destination){
  if(!req.jit||!['mixed-pages-v1','zstd-pages-v1'].includes(req.jit.format))throw Error('Missing explicit JIT declaration');
  if(!Number.isSafeInteger(req.max)||req.max<0||!Number.isSafeInteger(req.off)||req.off<0||!Number.isSafeInteger(req.size)||req.size<0||!Number.isSafeInteger(req.jit.blockSize)||req.jit.blockSize<65536||req.jit.blockSize>1024*1024)throw Error('Invalid JIT read');
  const n=Math.min(destination.length,req.max,Math.max(0,req.size-req.off));if(n<=0)return 0;
  const clock=()=>globalThis.performance?.now?.()??Date.now(),controller=new AbortController(),deadline=clock()+readBudgetMs,expired=()=>Error('JIT read deadline exceeded');
  const check=()=>{if(controller.signal.aborted||clock()>=deadline)throw expired();};
  const work=async()=>{
  const view=new Uint8Array(n);
  const url=absolute(req.url).href,data=await index(url,req.size,req.jit.blockSize,req.jit.format),first=Math.floor(req.off/data.blockSize),last=Math.floor((req.off+n-1)/data.blockSize),current=new Map(),waiting=new Map();check();
  const prior=lastDemand.get(url),sequence=prior&&first===prior.end+1?prior.sequence+1:1;
  lastDemand.set(url,{end:last,sequence});
  const ahead=sequence>=2?Math.min(readAheadPages,Math.max(1,Math.floor(1048576/data.blockSize))):1;
  for(let page=first;page<=last;page++)if(speculative.delete(key(url,page)))stats.readAheadUsedPages++;
  for(let page=first;page<=last;){const k=key(url,page),cached=touch(k);if(cached){current.set(page,cached);page++;continue;}if(pending.has(k)){page++;continue;}let end=page,limit=Math.max(last,Math.min(data.blocks.length-1,page+ahead-1));while(end<limit&&!pages.has(key(url,end+1))&&!pending.has(key(url,end+1)))end++;fetchRun(url,data,page,end,last);page=end+1;}
  // Keep every needed promise locally before any await can let the LRU evict its
  // resolved page and the shared in-flight map discard its settled promise.
  for(let page=first;page<=last;page++){if(current.has(page))continue;const k=key(url,page);const cached=pages.get(k);if(cached)current.set(page,cached);else waiting.set(page,pending.get(k));}
  for(const [page,promise]of waiting){const raw=await promise;check();if(!raw)throw Error('JIT page was not delivered');current.set(page,raw);}
  let filled=0;while(filled<n){const offset=req.off+filled,page=Math.floor(offset/data.blockSize),within=offset%data.blockSize,raw=current.get(page),take=Math.min(n-filled,raw.length-within);if(take<=0)throw Error('JIT short frame');view.set(raw.subarray(within,within+take),filled);filled+=take;}
  if(data.regions?.length){if(!req.jit.regions||typeof reconstruct!=='function')throw Error('Reconstructed package transport is not installed');check();await reconstruct({regions:data.regions,size:req.size,offset:req.off,view:view.subarray(0,filled),signal:controller.signal});}
  check();destination.set(view.subarray(0,filled));stats.readCalls++;stats.readBytes+=filled;return filled;
  };
  let timer;try{return await Promise.race([work(),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(expired());},readBudgetMs);})]);}finally{clearTimeout(timer);}
 }
 return {read,stats,get residentBytes(){return bytesKept;},get indexResidentBytes(){return indexBytesKept;}};
}
