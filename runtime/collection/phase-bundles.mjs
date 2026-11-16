/** Profile-selected encoded payload bundles. No decoded/native bytes are persisted. */
export function createPhaseBundleReader({baseURL,fetcher=fetch,maxBytes=12*1024*1024,phase=()=>globalThis.__collectionTransferTelemetry?.snapshot()?.stage}={}) {
 if(!Number.isSafeInteger(maxBytes)||maxBytes<8)throw Error('Invalid bundle cache budget');
 const bundles=new Map(),sizes=new Map();let indexPromise,heldBytes=0;
 async function bounded(response,limit){
  if(Number(response.headers.get('Content-Length')||0)>limit){await response.body?.cancel();throw Error('Bundle response exceeds bound');}
  const reader=response.body?.getReader();if(!reader)throw Error('Missing bundle response body');
  const parts=[];let length=0;try{for(;;){const n=await reader.read();if(n.done)break;length+=n.value.length;if(length>limit){await reader.cancel();throw Error('Bundle response exceeds bound');}parts.push(n.value);}}finally{reader.releaseLock();}
  const result=new Uint8Array(length);let offset=0;for(const part of parts){result.set(part,offset);offset+=part.length;}return result;
 }
 const sha=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),x=>x.toString(16).padStart(2,'0')).join('');
 const absolute=p=>{const u=new URL(p,baseURL);if(u.origin!==new URL(baseURL).origin)throw Error('Bundle origin mismatch');return u.href;};
 const index=()=>indexPromise??=fetcher(absolute('runtime/collection/codec-prefetch.json'),{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(3000)}).then(async r=>{if(!r.ok){await r.body?.cancel();return {phases:{}};}const text=new TextDecoder().decode(await bounded(r,1024*1024));const data=JSON.parse(text);if(data.format!=='encoded-phase-bundles-v1')throw Error('Bundle index format mismatch');return data;}).catch(()=>({phases:{}}));
 async function open(record){
  if(!Number.isSafeInteger(record.size)||record.size<8||record.size>maxBytes)throw Error('Bundle size exceeds bound');
  const r=await fetcher(absolute(record.url),{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(3000)});if(r.status!==200)throw Error('Bundle unavailable');
  const reader=r.body.getReader(),parts=[];let length=0;try{for(;;){const next=await reader.read();if(next.done)break;length+=next.value.length;if(length>record.size){await reader.cancel();throw Error('Bundle larger than declared');}parts.push(next.value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(length);let at=0;for(const p of parts){bytes.set(p,at);at+=p.length;}
  if(length!==record.size||await sha(bytes)!==record.sha256||new TextDecoder().decode(bytes.subarray(0,4))!=='CRB1')throw Error('Bundle integrity mismatch');
  const size=new DataView(bytes.buffer).getUint32(4,true),start=8+size;if(start>bytes.length)throw Error('Bundle directory exceeds bounds');const directory=JSON.parse(new TextDecoder().decode(bytes.subarray(8,start))),items=new Map();
  for(const [key,[offset,n]]of Object.entries(directory)){if(!/^[a-f0-9]{64}$/.test(key)||!Number.isSafeInteger(offset)||!Number.isSafeInteger(n)||offset<0||n<1||start+offset+n>bytes.length)throw Error('Bundle entry invalid');items.set(key,bytes.subarray(start+offset,start+offset+n));}return items;
 }
 return async encoded=>{
  const data=await index(),current=phase(),name=current?.stage==='match'?String(current.label||'').toLowerCase():'menu';
  // Already fetched menu data remains reusable in a following match.
  for(const promise of bundles.values()){const items=await promise;if(items?.has(encoded.sha256))return items.get(encoded.sha256);}
  const record=data.phases?.[name];if(!record||!record.members?.includes(encoded.sha256))return null;
  if(!bundles.has(record.url)){
   if(!Number.isSafeInteger(record.size)||record.size<8||record.size>maxBytes)return null;
   while(bundles.size&&(bundles.size>=2||heldBytes+record.size>maxBytes)){const first=bundles.keys().next().value;heldBytes-=sizes.get(first)||0;sizes.delete(first);bundles.delete(first);}
   heldBytes+=record.size;sizes.set(record.url,record.size);bundles.set(record.url,open(record).catch(()=>null));
  }
  return (await bundles.get(record.url))?.get(encoded.sha256)||null;
 };
}
