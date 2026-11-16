/** Reconstruct codec payloads into native package ranges without changing layout. */
export function createRegionCache({fetcher=fetch,readEncoded=null,decoders={},baseURL=globalThis.location?.href,maxBytes=32*1024*1024,maxEncodedBytes=8*1024*1024,maxRegionBytes=32*1024*1024,maxRangedRegionBytes=64*1024*1024,onEvent=()=>{},retryDelays=[150,500]}={}) {
  if(!Array.isArray(retryDelays)||retryDelays.length>4||retryDelays.some(n=>!Number.isFinite(n)||n<0||n>5000))throw Error('Invalid retry policy');
  if(![maxBytes,maxEncodedBytes,maxRegionBytes,maxRangedRegionBytes].every(n=>Number.isSafeInteger(n)&&n>0))throw Error('Invalid codec cache budget');
  const cache=new Map(),encodedCache=new Map(),pending=new Map(),pendingEncoded=new Map(),validated=new WeakMap();
  let residentBytes=0,encodedResidentBytes=0,sequence=0;
  const stats={requests:0,encodedBytes:0,decodedBytes:0,hits:0,encodedHits:0,evictions:0};
  const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
  function absolute(value){const u=new URL(value,baseURL);if(u.origin!==new URL(baseURL).origin)throw Error('Region codec asset must be same origin');return u.href;}
  function validate(regions,size){
    if(!Array.isArray(regions)||!Number.isSafeInteger(size)||size<0)throw Error('Invalid region map');
    if(validated.get(regions)===size)return regions;
    let end=0;
    for(const r of regions){
      if(!r||!Number.isSafeInteger(r.offset)||!Number.isSafeInteger(r.length)||r.offset<end||r.length<=0||r.length>(typeof decoders[r.codec]?.decodeRange==='function'&&!r.decodedSha256?maxRangedRegionBytes:maxRegionBytes)||r.offset+r.length>size)throw Error('Invalid or overlapping codec region');
      if(typeof r.codec!=='string'||!r.encoded||!Number.isSafeInteger(r.encoded.length)||r.encoded.length<=0||r.encoded.length>maxRegionBytes*2||!/^[a-f0-9]{64}$/.test(r.encoded.sha256))throw Error('Invalid encoded codec region');
      if(r.encoded.offset!==undefined&&(!Number.isSafeInteger(r.encoded.offset)||r.encoded.offset<0||!Number.isSafeInteger(r.encoded.offset+r.encoded.length)))throw Error('Invalid encoded range');
      absolute(r.encoded.url);end=r.offset+r.length;Object.freeze(r.encoded);Object.freeze(r);
    }
    Object.freeze(regions);validated.set(regions,size);return regions;
  }
  function touch(map,key){const value=map.get(key);if(value){map.delete(key);map.set(key,value);}return value;}
  function keep(key,value){
    if(value.length>maxBytes)return;
    while(cache.size&&residentBytes+value.length>maxBytes){const k=cache.keys().next().value;residentBytes-=cache.get(k).length;cache.delete(k);stats.evictions++;}
    cache.set(key,value);residentBytes+=value.length;
  }
  function keepEncoded(key,value){
    if(value.length>maxEncodedBytes)return value;
    while(encodedCache.size&&encodedResidentBytes+value.length>maxEncodedBytes){const k=encodedCache.keys().next().value;encodedResidentBytes-=encodedCache.get(k).length;encodedCache.delete(k);}
    // Bundle slices must not retain their entire backing allocation in this cache.
    const owned=new Uint8Array(value);encodedCache.set(key,owned);encodedResidentBytes+=owned.length;return owned;
  }
  async function boundedBody(response,limit,onChunk){
    if(Number(response.headers.get('Content-Length')||0)>limit){await response.body?.cancel();throw Error('Encoded region exceeds declared length');}
    const reader=response.body?.getReader();if(!reader)throw Error('Encoded region has no body');
    const pieces=[];let count=0;
    try{for(;;){const next=await reader.read();if(next.done)break;count+=next.value.length;if(count>limit){await reader.cancel();throw Error('Encoded region exceeds declared length');}pieces.push(next.value);onChunk(count);}}
    finally{reader.releaseLock();}
    const out=new Uint8Array(count);let at=0;for(const p of pieces){out.set(p,at);at+=p.length;}return out;
  }
  function identity(region){
    const url=absolute(region.encoded.url),length=region.encoded.length,offset=region.encoded.offset,range=offset===undefined?'':`bytes=${offset}-${offset+length-1}`;
    return {url,length,offset,range,resourceId:new URL(url).pathname+new URL(url).search+'|'+range};
  }
  async function fetchEncoded(region){
    const key=region.encoded.sha256+'#'+region.encoded.length,hit=touch(encodedCache,key);
    if(hit){stats.encodedHits++;return hit;}
    if(!pendingEncoded.has(key))pendingEncoded.set(key,(async()=>{
      const {url,length,offset,range,resourceId}=identity(region),tracked=!!globalThis.__collectionTransferTelemetry?.tracksFetch;
      let packed=readEncoded?await readEncoded(region.encoded):null;
      if(packed){if(packed.length!==length||await digest(packed)!==region.encoded.sha256)throw Error('Bundled codec payload integrity mismatch');return keepEncoded(key,packed);}
      if(!tracked)onEvent({type:'plan',resourceId,transferTotalBytes:length,certainty:'exact'});
      for(let attempt=0;;attempt++){
        const requestId='region-'+(++sequence),headers=range?{Range:range}:{};
        let received=0,encoding='identity';
        try{
          stats.requests++;
          const response=await fetcher(url,{headers,cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(30000)});
          if(response.status!==(offset===undefined?200:206)){
            await response.body?.cancel();const error=Error('Codec asset HTTP status mismatch');
            error.retryable=[408,429].includes(response.status)||response.status>=500;
            const after=response.headers.get('Retry-After');if(after){const n=Number(after);error.retryAfter=Number.isFinite(n)?n*1000:Date.parse(after)-Date.now();}throw error;
          }
          if(offset!==undefined){const m=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('Content-Range')||'');if(!m||Number(m[1])!==offset||Number(m[2])!==offset+length-1||Number(m[3])<offset+length){await response.body?.cancel();throw Error('Codec asset range mismatch');}}
          encoding=response.headers.get('Content-Encoding')||'identity';
          packed=await boundedBody(response,length,n=>{received=n;if(!tracked)onEvent({type:'transfer',requestId,resourceId,loadedBytes:encoding==='identity'?n:null,totalBytes:encoding==='identity'?length:null,state:'active',source:'network',encoding});});
          if(packed.length!==length||await digest(packed)!==region.encoded.sha256)throw Error('Codec payload integrity mismatch');
          stats.encodedBytes+=packed.length;
          if(!tracked)onEvent({type:'transfer',requestId,resourceId,loadedBytes:encoding==='identity'?packed.length:null,totalBytes:encoding==='identity'?length:null,state:'complete',source:'network',encoding});
          return keepEncoded(key,packed);
        }catch(error){
          if(!tracked)onEvent({type:'transfer',requestId,resourceId,loadedBytes:encoding==='identity'?received:null,totalBytes:encoding==='identity'?length:null,state:'failed',source:'network',encoding});
          const retryable=error.retryable===true||error instanceof TypeError||['TimeoutError','NetworkError'].includes(error.name);
          const delay=Math.max(retryDelays[attempt]||0,error.retryAfter||0);
          if(!retryable||attempt>=retryDelays.length||delay>5000)throw error;
          await new Promise(resolve=>setTimeout(resolve,delay));
        }
      }
    })().finally(()=>pendingEncoded.delete(key)));
    return pendingEncoded.get(key);
  }
  async function obtain(region,relativeOffset=0,length=region.length){
    const decode=decoders[region.codec];
    if(typeof decode!=='function'){const e=Error('Unsupported region codec: '+region.codec);e.code='UNSUPPORTED_REGION_CODEC';throw e;}
    const partial=typeof decode.decodeRange==='function'&&!region.decodedSha256;
    const start=partial?relativeOffset:0,count=partial?length:region.length;
    const {url,resourceId}=identity(region),key=url+'#'+region.encoded.sha256+'#'+region.codec+'#'+region.length+'#'+JSON.stringify(region.params||{})+'#'+start+':'+count;
    const hit=touch(cache,key);if(hit){stats.hits++;return partial?hit:hit.subarray(relativeOffset,relativeOffset+length);}
    if(!pending.has(key))pending.set(key,(async()=>{
      const jobId='region-decode-'+(++sequence);
      onEvent({type:'plan',resourceId,decodeTotalBytes:count,certainty:'exact'});
      const packed=await fetchEncoded(region);
      onEvent({type:'decode',jobId,resourceId,loadedBytes:0,totalBytes:count,state:'working'});
      let raw;
      try{
        const value=partial?await decode.decodeRange(packed,region.params||{},region,start,count):await decode(packed,region.params||{},region);
        raw=new Uint8Array(value);
        if(raw.length!==count)throw Error('Codec reconstructed byte length mismatch');
        if(region.decodedSha256&&await digest(raw)!==region.decodedSha256)throw Error('Codec reconstructed digest mismatch');
      }catch(error){onEvent({type:'decode',jobId,resourceId,loadedBytes:0,totalBytes:count,state:'failed'});throw error;}
      stats.decodedBytes+=raw.length;keep(key,raw);
      onEvent({type:'decode',jobId,resourceId,loadedBytes:raw.length,totalBytes:raw.length,state:'complete'});return raw;
    })().finally(()=>pending.delete(key)));
    const raw=await pending.get(key);return partial?raw:raw.subarray(relativeOffset,relativeOffset+length);
  }
  async function overlay({regions,size,offset,view,signal}){
    const active=()=>{if(signal?.aborted)throw Error('Codec reconstruction cancelled');};active();
    if(!Number.isSafeInteger(offset)||offset<0||offset+view.length>size)throw Error('Invalid reconstruction destination');
    validate(regions,size);let low=0,high=regions.length;
    while(low<high){const mid=(low+high)>>>1,r=regions[mid];if(r.offset+r.length<=offset)low=mid+1;else high=mid;}
    const decoded=[];
    for(let i=low;i<regions.length&&regions[i].offset<offset+view.length;i++){
      const region=regions[i],begin=Math.max(offset,region.offset),end=Math.min(offset+view.length,region.offset+region.length);
      active();decoded.push([begin,await obtain(region,begin-region.offset,end-begin)]);active();
    }
    // No destination bytes change until every intersecting payload validates.
    active();for(const [begin,raw]of decoded)view.set(raw,begin-offset);
    return view.length;
  }
  return {overlay,validate,stats,get residentBytes(){return residentBytes;},get encodedResidentBytes(){return encodedResidentBytes;}};
}
