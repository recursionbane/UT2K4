import test from 'node:test';
import assert from 'node:assert/strict';
import {installTransferTelemetry,transferTelemetryClient} from './transfer-telemetry.mjs';
import {createLoadingProgressModel} from './loading-progress.mjs';
let serial=0;
function fixture({main=true,fetcher=async()=>new Response('fixture'),worker=false}={}){
 let time=10;const events=[],messages=[],intervals=[],listeners=new Map(),model=createLoadingProgressModel();
 class FakeWorker{constructor(){this.listeners=[];this.sent=[];}addEventListener(name,fn){if(name==='message')this.listeners.push(fn);}postMessage(message){this.sent.push(message);}receive(data){let stopped=false;const e={data,stopImmediatePropagation(){stopped=true;}};for(const fn of this.listeners){fn(e);if(stopped)break;}}terminate(){this.terminated=true;}}
 const scope={...(main?{document:{}}:{}),location:{href:'https://fixture.invalid/app/',origin:'https://fixture.invalid'},crypto:{randomUUID:()=>`fixture-${++serial}`},performance:{timeOrigin:1000000,now:()=>time},fetch:fetcher,setInterval(fn){intervals.push(fn);return 1;},addEventListener(type,fn){listeners.set(type,fn)},postMessage(value){messages.push(value)},__collectionLoadingProgress:{emit(e){events.push(e);model.update(e)}},...(worker?{Worker:FakeWorker}:{})};
 const api=installTransferTelemetry(scope);return {scope,api,events,messages,intervals,listeners,model,advance(n){time+=n},epoch(){return 1000000+time}};
}
function withMetadata(text,url,headers={}){const r=new Response(text,{headers});Object.defineProperty(r,'url',{value:url});return r;}
test('fetch capability, cross-realm URL-like inputs and cloned response metadata/body stay compatible',async()=>{
 const f=fixture({fetcher:async()=>withMetadata('hello','https://fixture.invalid/data',{'Content-Length':'5'})});assert.equal(f.api.tracksFetch,true);const r=await f.scope.fetch({toString:()=>'/data'}),copy=r.clone();assert.equal(r.url,'https://fixture.invalid/data');assert.equal(copy.url,r.url);assert.equal(copy.type,r.type);assert.equal(await r.text(),'hello');assert.equal(await copy.text(),'hello');assert.equal(r.bodyUsed,true);assert.throws(()=>r.clone());assert.equal(f.api.snapshot().active,0);assert(f.events.some(e=>e.resourceId==='/data|'));
});
test('HTTP gzip/br EOF fallback counts declared encoded bytes, never decoded chunks',async()=>{
 const raw='decoded output '.repeat(1000),f=fixture({fetcher:async()=>new Response(raw,{headers:{'Content-Encoding':'br','Content-Length':'137'}})});const r=await f.scope.fetch('/compressed');assert.equal(await r.text(),raw);const completed=f.events.filter(e=>e.type==='transfer'&&e.state==='complete');assert.equal(completed.at(-1).loadedBytes,137);assert.equal(completed.at(-1).totalBytes,137);assert(!f.events.some(e=>e.type==='transfer'&&e.loadedBytes===raw.length));
});
test('request headers preserve distinct Range work IDs and Request inputs',async()=>{
 const headers=[];const f=fixture({fetcher:async(input,init)=>{headers.push(new Headers(init?.headers||input.headers).get('Range'));return new Response('range',{headers:{'Content-Length':'5'}})}});
 await(await f.scope.fetch(new Request('https://fixture.invalid/asset',{headers:{Range:'bytes=0-4'}}))).arrayBuffer();await(await f.scope.fetch('/asset',{headers:{range:'bytes=5-9'}})).arrayBuffer();assert.deepEqual(headers,['bytes=0-4','bytes=5-9']);assert(f.events.some(e=>e.resourceId==='/asset|bytes=0-4'));assert(f.events.some(e=>e.resourceId==='/asset|bytes=5-9'));assert.equal(new Set(f.events.filter(e=>e.requestId).map(e=>e.requestId)).size,2);
});
test('ResourceTiming retires ignored bodies and duplicates do not invent another request',async()=>{
 const f=fixture({fetcher:async()=>new Response('0123456789',{headers:{'Content-Length':'10'}})}),r=await f.scope.fetch('/ignored');assert.equal(f.api.snapshot().active,1);const e={name:'https://fixture.invalid/ignored',startTime:10,duration:3,encodedBodySize:10,decodedBodySize:10,transferSize:310};f.api.performanceEntry(e);f.api.performanceEntry(e);f.api.performanceEntry({...e});assert.equal(f.api.snapshot().active,0);assert.equal(await r.text(),'0123456789');assert.equal(new Set(f.events.filter(x=>x.requestId).map(x=>x.requestId)).size,1);assert.equal(f.model.snapshot().transfer.loadedBytes,10);
 const standalone={...e,name:'https://fixture.invalid/script.js',startTime:30};f.api.performanceEntry(standalone);f.api.performanceEntry({...standalone});assert.equal(f.model.snapshot().transfer.loadedBytes,20);
});
test('cache timing overrides payload bytes to zero physical network transfer',async()=>{
 const f=fixture({fetcher:async()=>new Response('cached',{headers:{'Content-Length':'6'}})});await(await f.scope.fetch('/cached')).text();f.api.performanceEntry({name:'https://fixture.invalid/cached',startTime:10,duration:2,encodedBodySize:6,decodedBodySize:6,transferSize:0});assert.equal(f.model.snapshot().transfer.loadedBytes,0);assert.equal(f.model.snapshot().cachedResources,1);
});
test('instrumented-worker handshake never posts stage messages to capability workers',()=>{
 const f=fixture({worker:true}),plain=new f.scope.Worker('probe.js'),instrumented=new f.scope.Worker('instrumented.js');f.advance(5);f.api.phase('match','fixture-map');assert.equal(plain.sent.length,0);assert.equal(instrumented.sent.length,0);let userMessages=0;instrumented.addEventListener('message',()=>userMessages++);instrumented.receive({__collectionTelemetryReady:true});assert.equal(instrumented.sent.length,1);assert.equal(userMessages,0);instrumented.receive({answer:42});assert.equal(userMessages,1);plain.terminate();f.api.phase('match','next-map');assert.equal(plain.sent.length,0);assert.equal(instrumented.sent.length,2);
});
test('worker fetch-start epochs retain correct phases across delayed stage propagation',()=>{
 const f=fixture({worker:true}),worker=new f.scope.Worker('instrumented.js'),old=f.epoch();f.advance(50);f.api.phase('match','fixture-map');const current=f.api.snapshot().stage.stageId;worker.receive({__collectionTelemetryReady:true});worker.receive({__collectionLoadingEvent:{v:1,type:'transfer',stageId:'menu-1',stage:'menu',requestId:'old',resourceId:'/old|',requestStartedAt:old,loadedBytes:3,totalBytes:9,state:'active'}});worker.receive({__collectionLoadingEvent:{v:1,type:'transfer',stageId:'menu-1',stage:'menu',requestId:'new',resourceId:'/new|',requestStartedAt:f.epoch()+1,loadedBytes:5,totalBytes:5,state:'complete'}});assert.equal(f.events.find(e=>e.requestId==='old').stageId,'menu-1');assert.equal(f.events.find(e=>e.requestId==='new').stageId,current);assert.equal(f.api.snapshot().active,0);assert.equal(f.api.snapshot().activeAll,1);
});
test('generic decode IDs are namespaced by emitting worker and preserve queued phase',()=>{
 const a=fixture({main:false}),b=fixture({main:false});a.api.emit({type:'decode',jobId:'same',resourceId:'/a|',state:'working',loadedBytes:0,totalBytes:10});b.api.emit({type:'decode',jobId:'same',resourceId:'/a|',state:'working',loadedBytes:0,totalBytes:10});const ae=a.messages.find(x=>x.__collectionLoadingEvent)?.__collectionLoadingEvent,be=b.messages.find(x=>x.__collectionLoadingEvent)?.__collectionLoadingEvent;assert.notEqual(ae.jobId,be.jobId);a.advance(5);a.listeners.get('message')({data:{__collectionLoadingStage:{stageId:'match-2',stage:'match'}},stopImmediatePropagation(){}});a.api.emit({type:'decode',jobId:'same',resourceId:'/a|',state:'complete',loadedBytes:10,totalBytes:10});const end=a.messages.at(-1).__collectionLoadingEvent;assert.equal(end.jobId,ae.jobId);assert.equal(end.stageId,'menu-1');assert.equal(a.api.snapshot().decodes,0);
});
test('stale asynchronous menu probes cannot mark a new match ready',async()=>{
 const f=fixture();let resolve;f.scope.ufrontConfig={launchState:{engineRunning:true}};f.scope.ueExecResult=()=>new Promise(r=>resolve=r);const pending=f.intervals[0]();f.advance(10);f.api.phase('match','fixture-map');resolve({ok:true,output:"ActivePage = UT2k4MainMenu'Package.Menu'"});await pending;assert.equal(f.api.snapshot().readyHint,false);assert.equal(f.events.some(e=>e.type==='ready'),false);
});
test('bodyless response and cancellation retain fetch semantics and close active work',async()=>{
 const empty=fixture({fetcher:async()=>new Response(null,{status:204})});assert.equal((await empty.scope.fetch('/empty')).status,204);assert.equal(empty.api.snapshot().active,0);const cancelled=fixture({fetcher:async()=>new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(32));},cancel(){}}))});const r=await cancelled.scope.fetch('/cancelled');await r.body.cancel();assert.equal(cancelled.api.snapshot().active,0);assert.equal(cancelled.events.filter(e=>e.type==='transfer').at(-1).state,'failed');
});
test('classic client bundle parses without external imports',()=>{new Function(transferTelemetryClient());});

test('old-phase worker activity cannot postpone a rendered current stage forever',async()=>{
 const f=fixture({worker:true}),w=new f.scope.Worker('instrumented.js'),old=f.epoch();f.advance(10);f.api.phase('match','fixture-map');f.api.observeLog('COLLECTION_STAGE_RENDERED map=fixture-map');f.advance(400);w.receive({__collectionLoadingEvent:{v:1,type:'transfer',stageId:'menu-1',requestId:'old',resourceId:'/old|',requestStartedAt:old,loadedBytes:50,totalBytes:100,state:'active'}});await f.intervals[0]();assert.equal(f.api.snapshot().finished,true);assert.equal(f.api.snapshot().activeAll,1);assert(f.events.some(e=>e.type==='ready'&&e.stage==='match'));
});

test('distinct unwrapped resource requests near a wrapped fetch are not mistaken for duplicate timing',async()=>{
 const f=fixture({fetcher:async()=>new Response('abcdefghij',{headers:{'Content-Length':'10'}})});await(await f.scope.fetch('/same')).text();const e={name:'https://fixture.invalid/same',startTime:10,duration:3,encodedBodySize:10,decodedBodySize:10,transferSize:310};f.api.performanceEntry(e);f.api.performanceEntry({...e,startTime:11,duration:4});assert.equal(f.model.snapshot().transfer.loadedBytes,20);assert.equal(new Set(f.events.filter(x=>x.requestId).map(x=>x.requestId)).size,2);
});

test('WebKit cache timing with header-only transfer and zero body sizes corrects reused bytes to zero',async()=>{
 const f=fixture({fetcher:async()=>new Response('cached',{headers:{'Content-Length':'6'}})});await(await f.scope.fetch('/webkit-cache')).text();f.api.performanceEntry({name:'https://fixture.invalid/webkit-cache',startTime:10,duration:2,encodedBodySize:0,decodedBodySize:0,transferSize:300});assert.equal(f.model.snapshot().transfer.loadedBytes,0);assert.equal(f.model.snapshot().cachedResources,1);
});

test('browser null-body status quirks never construct an illegal streamed Response',async()=>{
 const response={status:204,headers:new Headers(),body:new ReadableStream({start(c){c.close()}})},f=fixture({fetcher:async()=>response});assert.equal(await f.scope.fetch('/quirk-204'),response);assert.equal(f.api.snapshot().active,0);
});
test('cancelling a pending compressed read cannot report a full successful encoded body',async()=>{
 const f=fixture({fetcher:async()=>new Response(new ReadableStream({cancel(){}}),{headers:{'Content-Encoding':'br','Content-Length':'137'}})}),r=await f.scope.fetch('/pending');await Promise.resolve();await r.body.cancel('fixture-cancel');assert.equal(f.api.snapshot().active,0);assert.equal(f.events.filter(e=>e.type==='transfer').at(-1).state,'failed');assert(!f.events.some(e=>e.type==='transfer'&&e.state==='complete'&&e.loadedBytes===137));
});
test('original fetch rejection is preserved and does not leave readiness blocked',async()=>{
 const error=new TypeError('synthetic offline'),f=fixture({fetcher:async()=>{throw error}});await assert.rejects(()=>f.scope.fetch('/offline'),e=>e===error);assert.equal(f.api.snapshot().active,0);assert.equal(f.events.filter(e=>e.type==='transfer').at(-1).state,'failed');
});

test('unsupported decode failure retires work without fake bytes and raw fallback can become ready',async()=>{
 const f=fixture();f.api.phase('match','fallback-map');f.api.emit({type:'plan',resourceId:'/opus|',decodeTotalBytes:100});f.api.emit({type:'decode',jobId:'opus',resourceId:'/opus|',loadedBytes:0,totalBytes:100,state:'working'});assert.equal(f.api.snapshot().decodes,1);f.api.emit({type:'decode',jobId:'opus',resourceId:'/opus|',loadedBytes:100,totalBytes:100,state:'failed'});assert.equal(f.api.snapshot().decodes,0);assert.equal(f.model.snapshot().decode.loadedBytes,0);assert.equal(f.model.snapshot().decode.totalBytes,0);f.api.emit({type:'decode',jobId:'raw-fallback',resourceId:'/raw|',loadedBytes:0,totalBytes:100,state:'working'});f.api.emit({type:'decode',jobId:'raw-fallback',resourceId:'/raw|',loadedBytes:100,totalBytes:100,state:'complete'});f.api.observeLog('COLLECTION_STAGE_RENDERED map=fallback-map');f.advance(400);await f.intervals[0]();assert.equal(f.api.snapshot().finished,true);assert.equal(f.model.snapshot().decode.loadedBytes,100);assert.equal(f.model.snapshot().decode.totalBytes,100);
});
test('worker cancellation retires its namespaced job at the main bridge',()=>{
 const f=fixture({worker:true}),w=new f.scope.Worker('codec-worker.js'),at=f.epoch();for(const state of ['working','cancelled'])w.receive({__collectionLoadingEvent:{v:1,type:'decode',jobId:'worker-unique-job',resourceId:'/codec|',jobStartedAt:at,loadedBytes:state==='working'?0:99,totalBytes:99,state}});assert.equal(f.api.snapshot().decodes,0);assert.equal(f.model.snapshot().decode.loadedBytes,0);assert.equal(f.model.snapshot().decode.totalBytes,0);
});

test('HTTP304 revalidation uses cached body even when ResourceTiming reports its old encoded size',async()=>{
 const f=fixture({fetcher:async()=>new Response('cached',{headers:{'Content-Length':'6'}})});await(await f.scope.fetch('/revalidated')).text();f.api.performanceEntry({name:'https://fixture.invalid/revalidated',startTime:10,duration:2,encodedBodySize:6,decodedBodySize:6,transferSize:300,deliveryType:'cache',responseStatus:200});assert.equal(f.model.snapshot().transfer.loadedBytes,0);assert.equal(f.model.snapshot().cachedResources,1);
});

test('Worker timing clock anomalies alone do not turn a known network body into a cache hit',()=>{
 const f=fixture();f.api.performanceEntry({name:'https://fixture.invalid/worker.js',startTime:100,responseEnd:90,duration:0,initiatorType:'other',encodedBodySize:40000,decodedBodySize:40000,transferSize:40300,deliveryType:''});assert.equal(f.model.snapshot().transfer.loadedBytes,40000);assert.equal(f.model.snapshot().cachedResources,0);
});
