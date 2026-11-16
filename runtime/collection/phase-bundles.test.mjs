import test from 'node:test';import assert from'node:assert/strict';import crypto from'node:crypto';import{createPhaseBundleReader}from'./phase-bundles.mjs';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function fixture(seed=0){const a=Buffer.from([1+seed,2+seed,3+seed]),b=Buffer.from([4+seed,5+seed]),directory=Buffer.from(JSON.stringify({[sha(a)]:[0,3],[sha(b)]:[3,2]})),header=Buffer.alloc(8);header.write('CRB1');header.writeUInt32LE(directory.length,4);const data=Buffer.concat([header,directory,a,b]),record={url:'bundle.bin',size:data.length,sha256:sha(data),members:[sha(a),sha(b)]};return{a,b,data,index:{format:'encoded-phase-bundles-v1',phases:{menu:record}}};}
test('only measured phase members trigger bundle transfer, and next match reuses encoded menu data',async()=>{const f=fixture(),calls=[];let stage={stage:'menu'};const reader=createPhaseBundleReader({baseURL:'https://fixture.invalid/game/',phase:()=>stage,fetcher:async url=>{calls.push(url);return url.endsWith('.json')?Response.json(f.index):new Response(f.data)}});assert.equal(await reader({sha256:'f'.repeat(64)}),null);assert.equal(calls.length,1);assert.deepEqual(Buffer.from(await reader({sha256:sha(f.a)})),f.a);assert.deepEqual(Buffer.from(await reader({sha256:sha(f.b)})),f.b);assert.equal(calls.length,2);stage={stage:'match',label:'DM-Rankin'};assert.deepEqual(Buffer.from(await reader({sha256:sha(f.a)})),f.a);assert.equal(calls.length,2);});
test('corrupt bundles fail safely to original individual fetch path',async()=>{const f=fixture();const reader=createPhaseBundleReader({baseURL:'https://fixture.invalid/',phase:()=>({stage:'menu'}),fetcher:async url=>url.endsWith('.json')?Response.json(f.index):new Response(new Uint8Array(f.data.length))});assert.equal(await reader({sha256:sha(f.a)}),null);});
test('an unavailable optional bundle index fails open with a bounded fetch',async()=>{
 let calls=0;const reader=createPhaseBundleReader({baseURL:'https://fixture.invalid/',fetcher:async(url,options)=>{calls++;assert(options.signal instanceof AbortSignal);throw new DOMException('Fixture timeout','TimeoutError');}});
 assert.equal(await reader({sha256:'a'.repeat(64)}),null);assert.equal(await reader({sha256:'b'.repeat(64)}),null);assert.equal(calls,1);
});

test('phase bundles share one total memory budget and oversized indices fall back',async()=>{
 const f=fixture(),g=fixture(10);
 const a=f.index.phases.menu,b={...g.index.phases.menu,url:'match.bin'};
 const index={format:'encoded-phase-bundles-v1',phases:{menu:a,'dm-test':b}};
 let phase={stage:'menu'},fetches=0;
 const reader=createPhaseBundleReader({baseURL:'https://fixture.invalid/',maxBytes:a.size+1,phase:()=>phase,fetcher:async url=>{if(url.endsWith('.json'))return Response.json(index);fetches++;return new Response(url.endsWith('match.bin')?g.data:f.data);}});
 await reader({sha256:sha(f.a)});phase={stage:'match',label:'DM-Test'};await reader({sha256:sha(g.a)});phase={stage:'menu'};await reader({sha256:sha(f.a)});
 assert.equal(fetches,3);
 let bodyReads=0;const huge=createPhaseBundleReader({baseURL:'https://fixture.invalid/',fetcher:async()=>new Response(new ReadableStream({pull(c){bodyReads++;c.enqueue(new Uint8Array(1024*1024+1));c.close();}}))});
 assert.equal(await huge({sha256:sha(f.a)}),null);assert.equal(bodyReads,1);
});
