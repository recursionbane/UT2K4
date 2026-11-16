import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {createRegionCache} from './region-cache.mjs';
const packed=Uint8Array.from([1,2,3,4]),hash=crypto.createHash('sha256').update(packed).digest('hex');
function region(offset=20){return {offset,length:8,codec:'fixture-v1',encoded:{url:'payload.bin',length:4,sha256:hash},params:{channels:1}};}
function make(options={}){let fetches=0,decodes=0;const scratch=Uint8Array.from([10,11,12,13,14,15,16,17]);const c=createRegionCache({baseURL:'https://fixture.invalid/game/',fetcher:async()=>{fetches++;return new Response(packed)},decoders:{'fixture-v1':async()=>{decodes++;return scratch}},...options});return {c,scratch,counts:()=>({fetches,decodes})};}
test('metadata/header reads do not fetch codec payloads; intersections preserve surrounding bytes',async()=>{const t=make(),regions=[region()];let view=new Uint8Array(10).fill(99);await t.c.overlay({regions,size:100,offset:0,view});assert.deepEqual(t.counts(),{fetches:0,decodes:0});assert(view.every(n=>n===99));view=new Uint8Array(15).fill(99);await t.c.overlay({regions,size:100,offset:17,view});assert.deepEqual([...view],[99,99,99,10,11,12,13,14,15,16,17,99,99,99,99]);assert.deepEqual(t.counts(),{fetches:1,decodes:1});t.scratch.fill(0);view=new Uint8Array(3);await t.c.overlay({regions,size:100,offset:24,view});assert.deepEqual([...view],[14,15,16]);assert.equal(t.c.residentBytes,8);});
test('concurrent reads share decode work; eviction stays bounded',async()=>{const t=make({maxBytes:8}),regions=[region(),{...region(40),params:{channels:2}}];await Promise.all([t.c.overlay({regions,size:100,offset:20,view:new Uint8Array(2)}),t.c.overlay({regions,size:100,offset:24,view:new Uint8Array(2)})]);assert.deepEqual(t.counts(),{fetches:1,decodes:1});await t.c.overlay({regions,size:100,offset:40,view:new Uint8Array(2)});assert.equal(t.c.residentBytes,8);assert.equal(t.c.stats.evictions,1);});
test('bad layouts, cross-origin data, corruption and wrong decode lengths fail before modifying destination',async()=>{const t=make(),view=new Uint8Array(30).fill(99);for(const regions of [[region(),region(25)],[{...region(),offset:99}],[{...region(),encoded:{...region().encoded,url:'https://other.invalid/payload'}}]])await assert.rejects(()=>t.c.overlay({regions,size:100,offset:10,view}));assert(view.every(n=>n===99));assert.equal(t.counts().fetches,0);const corrupt=make({fetcher:async()=>new Response(new Uint8Array(4))});await assert.rejects(()=>corrupt.c.overlay({regions:[region()],size:100,offset:10,view}),/integrity/);assert(view.every(n=>n===99));const short=make({decoders:{'fixture-v1':()=>new Uint8Array(2)}});await assert.rejects(()=>short.c.overlay({regions:[region()],size:100,offset:10,view}),/length/);assert(view.every(n=>n===99));});
test('explicit unsupported codec and wrong range identity are not silently served as zero samples',async()=>{const t=make({decoders:{}});await assert.rejects(()=>t.c.overlay({regions:[region()],size:100,offset:20,view:new Uint8Array(4)}),e=>e.code==='UNSUPPORTED_REGION_CODEC');const r=region();r.encoded.offset=0;const q=make();await assert.rejects(()=>q.c.overlay({regions:[r],size:100,offset:20,view:new Uint8Array(4)}),/HTTP status/);});
test('transient transfers retry with distinct attempts; permanent failures never alter native bytes',async()=>{
  let calls=0;const events=[];
  const t=make({retryDelays:[0,0],onEvent:e=>events.push(e),fetcher:async()=>{
    calls++;if(calls===1)throw new TypeError('Network interrupted');
    if(calls===2)return new Response('busy',{status:503});return new Response(packed);
  }});
  const view=new Uint8Array(4);await t.c.overlay({regions:[region()],size:100,offset:20,view});
  assert.equal(calls,3);assert.deepEqual([...view],[10,11,12,13]);
  const terminal=events.filter(e=>e.type==='transfer'&&e.state!=='active');
  assert.deepEqual(terminal.map(e=>e.state),['failed','failed','complete']);
  assert.equal(new Set(terminal.map(e=>e.requestId)).size,3);
  let missing=0;const q=make({retryDelays:[0,0],fetcher:async()=>{missing++;return new Response('',{status:404});}});
  const original=new Uint8Array(4).fill(99);
  await assert.rejects(()=>q.c.overlay({regions:[region()],size:100,offset:20,view:original}));
  assert.equal(missing,1);assert(original.every(n=>n===99));assert.equal(q.c.residentBytes,0);
});
test('failed decoding retires its progress job without caching invalid bytes',async()=>{
  const events=[],t=make({onEvent:e=>events.push(e),decoders:{'fixture-v1':()=>{throw Error('decode failed');}}});
  await assert.rejects(()=>t.c.overlay({regions:[region()],size:100,offset:20,view:new Uint8Array(4)}),/decode failed/);
  assert.deepEqual(events.filter(e=>e.type==='decode').map(e=>e.state),['working','failed']);
  assert.equal(t.c.residentBytes,0);
});
test('large texture regions decode only demanded bytes and share bounded encoded payloads',async()=>{
  let fetches=0;const slices=[];
  const decode=()=>{throw Error('Full mip allocation is forbidden in this fixture');};
  decode.decodeRange=async(encoded,params,r,offset,length)=>{slices.push([offset,length]);return Uint8Array.from({length},(_,i)=>(offset+i)%256);};
  const c=createRegionCache({baseURL:'https://fixture.invalid/',maxEncodedBytes:4,maxBytes:16,
    fetcher:async()=>{fetches++;return new Response(packed);},decoders:{'fixture-v1':decode}});
  const r={...region(),length:64*1024*1024},regions=[r],size=r.offset+r.length;
  const a=new Uint8Array(5),b=new Uint8Array(7);
  await Promise.all([c.overlay({regions,size,offset:23,view:a}),c.overlay({regions,size,offset:1000,view:b})]);
  assert.deepEqual([...a],[3,4,5,6,7]);assert.deepEqual([...b],[212,213,214,215,216,217,218]);
  assert.equal(fetches,1);assert.deepEqual(slices,[[3,5],[980,7]]);
  assert.equal(c.stats.decodedBytes,12);assert.equal(c.residentBytes,12);assert.equal(c.encodedResidentBytes,4);
  await c.overlay({regions,size,offset:23,view:new Uint8Array(5)});assert.equal(slices.length,2);
  await assert.rejects(()=>c.overlay({regions:[{...r,decodedSha256:'a'.repeat(64)}],size,offset:23,view:new Uint8Array(5)}),/region/);
  assert.equal(fetches,1,'a full-image hash cannot bypass the full-decode allocation cap');
});
test('cancellation during reconstruction leaves the caller destination untouched',async()=>{
 const controller=new AbortController(),view=new Uint8Array(4).fill(99);
 const t=make({decoders:{'fixture-v1':async()=>{controller.abort();return new Uint8Array(8);}}});
 await assert.rejects(()=>t.c.overlay({regions:[region()],size:100,offset:20,view,signal:controller.signal}),/cancelled/);
 assert(view.every(n=>n===99));
});
