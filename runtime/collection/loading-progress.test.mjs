import test from 'node:test';
import assert from 'node:assert/strict';
import {createLoadingProgressModel,loadingProgressView,loadingProgressClient,installLoadingProgress,LOADING_PROGRESS_PROTOCOL} from './loading-progress.mjs';
const phase=(id='menu-1',stage='menu')=>({v:1,type:'phase',state:'start',stageId:id,stage});
function setup(){const m=createLoadingProgressModel();m.update(phase());return {m,send:e=>m.update({v:1,stageId:'menu-1',...e})};}
test('worker cumulative reports deduplicate and never regress actual transfer bytes',()=>{
 const {m,send}=setup();send({type:'plan',resourceId:'a',transferTotalBytes:100,decodeTotalBytes:400,certainty:'exact'});
 for(const n of [20,20,15,70])send({type:'transfer',resourceId:'a',requestId:'worker-1/request-1',loadedBytes:n,totalBytes:100,state:'active'});
 assert.equal(m.snapshot().transfer.loadedBytes,70);assert.equal(m.snapshot().transfer.totalBytes,100);
 send({type:'transfer',resourceId:'b',requestId:'worker-2/request-1',loadedBytes:30,totalBytes:30,state:'complete'});assert.equal(m.snapshot().transfer.loadedBytes,100);
 send({type:'decode',resourceId:'a',jobId:'a/page-0',loadedBytes:400,totalBytes:400,state:'complete'});send({type:'decode',resourceId:'a',jobId:'a/page-0',loadedBytes:400,totalBytes:400,state:'complete'});assert.equal(m.snapshot().decode.loadedBytes,400);assert.equal(m.snapshot().decode.totalBytes,400);
});
test('HTTP compression never promotes decoded fetch chunks to network bytes',()=>{
 const {m,send}=setup();send({type:'transfer',resourceId:'wasm',requestId:'http/1',loadedBytes:null,totalBytes:2692138,bodyLoaded:13876113,encoding:'br',state:'active'});
 assert.equal(m.snapshot().transfer.loadedBytes,0);assert.equal(m.snapshot().transfer.uncountedResponses,1);assert.match(loadingProgressView(m.snapshot()).notice,/Compressed response/);
 send({type:'transfer',resourceId:'wasm',requestId:'http/1',loadedBytes:2692138,totalBytes:2692138,state:'complete'});assert.equal(m.snapshot().transfer.loadedBytes,2692138);assert.equal(m.snapshot().decode.loadedBytes,0);
});
test('cache hits spend zero transfer bytes while verified decode work stays separate',()=>{
 const {m,send}=setup();send({type:'plan',resourceId:'cached',cached:true,transferTotalBytes:100000000,decodeTotalBytes:500,certainty:'exact'});send({type:'transfer',resourceId:'cached',requestId:'cache/1',source:'cache',loadedBytes:100000000,totalBytes:100000000,state:'complete'});send({type:'decode',resourceId:'cached',jobId:'cached/raw',loadedBytes:500,totalBytes:500,state:'complete'});
 const s=m.snapshot();assert.equal(s.transfer.loadedBytes,0);assert.equal(s.transfer.totalBytes,0);assert.equal(s.decode.loadedBytes,500);assert.equal(s.cachedResources,1);assert.match(loadingProgressView(s).cache,/1 file reused/);
});
test('failed partial bytes and retries remain in transfer workload accounting',()=>{
 const {m,send}=setup();send({type:'plan',resourceId:'frame',transferTotalBytes:100,certainty:'exact'});send({type:'transfer',resourceId:'frame',requestId:'attempt-1',loadedBytes:40,totalBytes:100,state:'failed'});assert.equal(m.snapshot().transfer.totalBytes,40);
 send({type:'transfer',resourceId:'frame',requestId:'attempt-2',loadedBytes:10,totalBytes:100,state:'active'});assert.equal(m.snapshot().transfer.loadedBytes,50);assert.equal(m.snapshot().transfer.totalBytes,140);assert.equal(m.snapshot().retries,1);
 send({type:'transfer',resourceId:'frame',requestId:'attempt-2',loadedBytes:100,totalBytes:100,state:'complete'});assert.equal(m.snapshot().transfer.loadedBytes,140);assert.equal(m.snapshot().transfer.totalBytes,140);
});
test('phase discovery can revise selected totals without counting the archive',()=>{
 const {m,send}=setup();send({type:'plan',resourceId:'archive',transferTotalBytes:24000000000,scope:'archive'});assert.equal(m.snapshot().transfer.totalBytes,0);
 send({type:'plan',resourceId:'range-1',transferTotalBytes:1000000,certainty:'estimate'});send({type:'plan',resourceId:'range-2',transferTotalBytes:2000000,certainty:'exact'});assert.equal(m.snapshot().transfer.totalBytes,3000000);assert.match(loadingProgressView(m.snapshot()).summary,/~3\.0 MB/);
 send({type:'plan',resourceId:'range-1',transferTotalBytes:1500000,certainty:'exact'});send({type:'plan',discoveryComplete:true});assert.equal(m.snapshot().transfer.totalBytes,3500000);assert.equal(m.snapshot().estimated,false);
});
test('unknown totals and finished known work do not claim completion before native ready',()=>{
 const {m,send}=setup();send({type:'transfer',resourceId:'unknown',requestId:'u/1',loadedBytes:2000000,totalBytes:null,state:'active'});let v=loadingProgressView(m.snapshot());assert.equal(v.transfer.value,null);assert.match(v.summary,/total unknown/);assert.equal(v.visible,true);
 send({type:'transfer',resourceId:'unknown',requestId:'u/1',loadedBytes:3000000,totalBytes:3000000,state:'complete'});v=loadingProgressView(m.snapshot());assert.equal(v.transfer.value,null);assert.equal(v.transfer.waiting,true);assert.equal(v.visible,true);assert(!v.summary.includes('100%'));
 send({type:'ready'});v=loadingProgressView(m.snapshot());assert.equal(v.visible,false);assert.equal(v.transfer.value,3000000);assert.equal(m.snapshot().ready,true);
});
test('new match phases reset phase counters; late menu events cannot switch the active phase',()=>{
 const {m,send}=setup();send({type:'transfer',resourceId:'menu-file',requestId:'m/1',loadedBytes:100,totalBytes:100,state:'complete'});send(phase());assert.equal(m.snapshot().transfer.loadedBytes,100);send({type:'ready'});
 m.update(phase('match-1','match'));assert.equal(m.snapshot().transfer.loadedBytes,0);send({type:'transfer',resourceId:'menu-file',requestId:'m/1',loadedBytes:110,totalBytes:110,state:'complete'});send(phase());assert.equal(m.snapshot().stageId,'match-1');assert.equal(m.snapshot().transfer.loadedBytes,0);
 m.update({v:1,type:'error',stageId:'match-1',message:'A file could not be loaded'});assert.match(loadingProgressView(m.snapshot()).notice,/could not be loaded/);assert.equal(m.snapshot().ready,false);
});
test('invalid values, missing phase declarations and clock time create no progress',()=>{
 const m=createLoadingProgressModel();m.update({v:1,stageId:'undeclared',type:'transfer',resourceId:'a',requestId:'1',loadedBytes:100});assert.equal(m.snapshot().state,'idle');m.update(phase());const before=m.snapshot();m.update({v:2,stageId:'menu-1',type:'ready'});assert.deepEqual(m.snapshot(),before);
 m.update({v:1,stageId:'menu-1',type:'transfer',resourceId:'a',requestId:'1',loadedBytes:-1,totalBytes:NaN});assert.equal(m.snapshot().transfer.loadedBytes,0);assert.equal(m.snapshot().transfer.totalBytes,null);
});

class Element{constructor(tag){this.tagName=tag;this.children=[];this.attributes={};this.hidden=false;this.open=false;this.textContent='';}append(...nodes){this.children.push(...nodes);for(const n of nodes)n.parent=this;}setAttribute(k,v){this.attributes[k]=String(v);}removeAttribute(k){delete this.attributes[k];}remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);}contains(node){return this===node||this.children.some(x=>x.contains?.(node));}}
function dom(){const frames=[],listeners=new Map(),doc={head:new Element('head'),body:new Element('body'),createElement:tag=>new Element(tag),activeElement:null};const scope={document:doc,requestAnimationFrame(fn){frames.push(fn)},addEventListener(k,v){listeners.set(k,v)},removeEventListener(k){listeners.delete(k)}};return {scope,doc,listeners,flush(){while(frames.length)frames.shift()();}};}
test('client uses accessible native controls, coalesces updates and hides/collapses at readiness',()=>{
 const d=dom(),api=installLoadingProgress(d.scope);d.flush();assert.equal(api.root.hidden,true);api.emit(phase());for(let n=0;n<10;n++)api.emit({v:1,stageId:'menu-1',type:'transfer',resourceId:'asset',requestId:'1',loadedBytes:n,totalBytes:20});d.flush();assert.equal(api.root.hidden,false);assert.equal(api.root.children[0].tagName,'summary');assert(api.root.children[0].attributes['aria-controls']);api.root.open=true;d.listeners.get(LOADING_PROGRESS_PROTOCOL.event)({detail:{v:1,stageId:'menu-1',type:'ready'}});d.flush();assert.equal(api.root.hidden,true);assert.equal(api.root.open,false);assert.equal(d.doc.body.children[1].attributes['aria-live'],'polite');api.destroy();assert.equal(d.doc.body.children.length,0);assert.equal(d.doc.head.children.length,0);assert.equal(d.listeners.size,0);
});
test('classic-script bundle is self-contained and installs without imports or network',()=>{const d=dom(),source=loadingProgressClient();new Function('globalThis',source)(d.scope);d.flush();assert(d.scope.__collectionLoadingProgress);d.scope.__collectionLoadingProgress.destroy();});

test('1500 resources stay incremental, idempotent and frame-coalesced under out-of-order worker bursts',()=>{
 const frames=[],m=createLoadingProgressModel({schedule:fn=>frames.push(fn)});let notifications=0;m.subscribe(()=>notifications++);const begin=performance.now();m.update(phase());
 for(let i=0;i<1500;i++){const resourceId='synthetic-'+i; m.update({v:1,stageId:'menu-1',type:'plan',resourceId,transferTotalBytes:1000,decodeTotalBytes:4000,certainty:'exact'});for(const loadedBytes of [300,300,200,900,1000,500])m.update({v:1,stageId:'menu-1',type:'transfer',resourceId,requestId:'worker-'+i%4+'/request-'+i,loadedBytes,totalBytes:1000,state:loadedBytes===1000?'complete':'active'});for(let n=0;n<2;n++)m.update({v:1,stageId:'menu-1',type:'decode',resourceId,jobId:resourceId+'/raw',loadedBytes:4000,totalBytes:4000,state:'complete'});}
 const elapsed=performance.now()-begin,s=m.snapshot();assert.equal(s.transfer.loadedBytes,1500000);assert.equal(s.transfer.totalBytes,1500000);assert.equal(s.decode.loadedBytes,6000000);assert.equal(s.decode.totalBytes,6000000);assert.equal(notifications,1);assert.equal(frames.length,1);frames.shift()();assert.equal(notifications,2);assert(elapsed<2500,`Incremental fixture took ${elapsed.toFixed(1)}ms`);
});
test('head bootstrap buffers telemetry before DOMContentLoaded and mounts latest values',()=>{
 const d=dom(),ready=new Map();d.doc.body=null;d.doc.addEventListener=(name,fn)=>ready.set(name,fn);d.doc.removeEventListener=name=>ready.delete(name);const api=installLoadingProgress(d.scope);assert.equal(api.root,null);api.emit(phase());api.emit({v:1,stageId:'menu-1',type:'transfer',resourceId:'early',requestId:'head/1',loadedBytes:123,totalBytes:456,state:'active'});d.flush();assert.equal(api.snapshot().transfer.loadedBytes,123);d.doc.body=new Element('body');ready.get('DOMContentLoaded')();d.flush();assert.equal(api.root.hidden,false);assert.match(api.root.children[0].attributes['aria-label'],/Loading menu/);assert.equal(api.snapshot().transfer.loadedBytes,123);api.destroy();assert.equal(ready.size,0);
});

test('measured full-phase forecasts bound the denominator without adding it twice',()=>{
 const m=createLoadingProgressModel();m.update({...phase(),forecastTransferBytes:2000000,forecastDecodeBytes:8000000});const send=e=>m.update({v:1,stageId:'menu-1',...e});send({type:'plan',resourceId:'one',transferTotalBytes:1000000,decodeTotalBytes:4000000,certainty:'exact'});let s=m.snapshot();assert.equal(s.transfer.totalBytes,2000000);assert.equal(s.transfer.knownTotalBytes,1000000);assert.equal(s.decode.totalBytes,8000000);assert.match(loadingProgressView(s).notice,/Estimated for this load/);
 send({type:'plan',resourceId:'two',transferTotalBytes:1500000,decodeTotalBytes:5000000,certainty:'exact'});s=m.snapshot();assert.equal(s.transfer.totalBytes,2500000);assert.equal(s.decode.totalBytes,9000000);send({type:'plan',forecastTransferBytes:3000000});assert.equal(m.snapshot().transfer.totalBytes,3000000);assert.equal(m.snapshot().estimated,true);
});
test('reaching an old full-phase forecast cannot finish a still-loading native stage',()=>{
 const m=createLoadingProgressModel();m.update({...phase(),forecastTransferBytes:100});m.update({v:1,stageId:'menu-1',type:'transfer',resourceId:'one',requestId:'1',loadedBytes:100,totalBytes:100,state:'complete'});let v=loadingProgressView(m.snapshot());assert.equal(v.transfer.value,null);assert.equal(v.visible,true);assert.equal(m.snapshot().ready,false);m.update({v:1,stageId:'menu-1',type:'plan',resourceId:'discovered',transferTotalBytes:50,certainty:'exact'});assert.equal(m.snapshot().transfer.totalBytes,150);m.update({v:1,stageId:'menu-1',type:'ready'});v=loadingProgressView(m.snapshot());assert.equal(v.visible,false);
});

test('full-phase forecast supports measured progress while individual request lengths remain unknown',()=>{
 const m=createLoadingProgressModel();m.update({...phase(),forecastTransferBytes:1000});m.update({v:1,stageId:'menu-1',type:'transfer',resourceId:'stream',requestId:'1',loadedBytes:200,totalBytes:null,state:'active'});let v=loadingProgressView(m.snapshot());assert.equal(v.transfer.value,200);assert.equal(v.transfer.max,1000);m.update({v:1,stageId:'menu-1',type:'transfer',resourceId:'stream',requestId:'1',loadedBytes:1200,totalBytes:null,state:'active'});assert.equal(m.snapshot().transfer.totalBytes,1200);v=loadingProgressView(m.snapshot());assert.equal(v.transfer.value,null);assert.equal(m.snapshot().ready,false);
});

test('phase timestamps record actual events once, not polling or elapsed-time progress',()=>{
 let now=1000;const m=createLoadingProgressModel({clock:()=>now});m.update(phase());assert.equal(m.snapshot().startedAt,1000);now=2000;assert.equal(m.snapshot().readyAt,null);m.update({v:1,stageId:'menu-1',type:'ready',at:1750});assert.equal(m.snapshot().readyAt,1750);now=3000;m.update({v:1,stageId:'menu-1',type:'ready'});assert.equal(m.snapshot().readyAt,1750);assert.equal(m.snapshot().startedAt,1000);
});
test('loading-control events are isolated without swallowing unrelated game inputs',()=>{
 const d=dom(),api=installLoadingProgress(d.scope);d.flush();let stopped=0;d.listeners.get('pointerdown')({target:api.root.children[0],stopImmediatePropagation(){stopped++}});assert.equal(stopped,1);d.listeners.get('pointerdown')({target:new Element('canvas'),stopImmediatePropagation(){stopped++}});assert.equal(stopped,1);api.destroy();assert.equal(d.listeners.size,0);
});

test('decode-only work does not invent unknown network requests',()=>{
 const {m,send}=setup();send({type:'decode',resourceId:'tiny/member',jobId:'tiny/member/raw',loadedBytes:2000,totalBytes:2000,state:'complete'});assert.equal(m.snapshot().transfer.unknown,0);assert.equal(m.snapshot().transfer.totalBytes,0);assert.equal(m.snapshot().transfer.loadedBytes,0);assert.equal(m.snapshot().decode.loadedBytes,2000);
 send({type:'plan',resourceId:'explicit-unknown',transferTotalBytes:null});assert.equal(m.snapshot().transfer.unknown,1);send({type:'plan',resourceId:'decode-plan',decodeTotalBytes:500});assert.equal(m.snapshot().transfer.unknown,1);
});

test('late background work and errors cannot reopen a native-ready stage during play',()=>{
 const {m,send}=setup();send({type:'ready'});send({type:'error',message:'Optional background request failed'});send({type:'phase',state:'loading'});send({type:'transfer',resourceId:'background',requestId:'late',loadedBytes:20,totalBytes:20,state:'complete'});assert.equal(m.snapshot().ready,true);assert.equal(loadingProgressView(m.snapshot()).visible,false);m.update(phase('match-2','match'));assert.equal(loadingProgressView(m.snapshot()).visible,true);
});

test('normal same-resource 200 rereads are labelled repeat downloads, not network failures',()=>{
 const {m,send}=setup();for(const requestId of ['read-1','read-2'])send({type:'transfer',resourceId:'evicted-file',requestId,loadedBytes:100,totalBytes:100,state:'complete'});assert.equal(m.snapshot().repeatDownloads,1);assert.match(loadingProgressView(m.snapshot()).retry,/repeat download/);assert(!/retry|fail/i.test(loadingProgressView(m.snapshot()).retry));
});

test('failed and cancelled decode attempts discard output and stale completion, not native readiness',()=>{
 const {m,send}=setup();send({type:'plan',resourceId:'codec',decodeTotalBytes:100});send({type:'decode',resourceId:'codec',jobId:'attempt',loadedBytes:50,totalBytes:100,state:'working'});send({type:'decode',resourceId:'codec',jobId:'attempt',loadedBytes:100,totalBytes:100,state:'cancelled'});assert.equal(m.snapshot().decode.loadedBytes,0);assert.equal(m.snapshot().decode.totalBytes,0);send({type:'decode',resourceId:'codec',jobId:'attempt',loadedBytes:100,totalBytes:100,state:'complete'});assert.equal(m.snapshot().decode.loadedBytes,0);send({type:'decode',resourceId:'codec',jobId:'attempt',loadedBytes:0,totalBytes:100,state:'working'});send({type:'decode',resourceId:'codec',jobId:'attempt',loadedBytes:100,totalBytes:100,state:'complete'});assert.equal(m.snapshot().decode.loadedBytes,100);assert.equal(m.snapshot().decode.totalBytes,100);assert.equal(m.snapshot().ready,false);
});

test('read-only event observers have no replay/history and cannot break or mutate loading behavior',()=>{
 const d=dom(),api=installLoadingProgress(d.scope);api.emit(phase());let seen=0,immutable=false;const stop=api.subscribeEvents(e=>{seen++;immutable=Object.isFrozen(e);throw Error('observer fault')});assert.equal(seen,0);const result=api.emit({v:1,type:'decode',stageId:'menu-1',resourceId:'fixture',jobId:'job',loadedBytes:0,totalBytes:10,state:'working'});assert.equal(seen,1);assert(immutable);assert.equal(result.decode.totalBytes,10);stop();d.listeners.get(LOADING_PROGRESS_PROTOCOL.event)({detail:{v:1,stageId:'menu-1',type:'ready'}});assert.equal(seen,1);assert.equal(api.snapshot().ready,true);api.destroy();
});

test('native-ready Rankin retires stale phase forecasts in favor of measured totals',()=>{
 const m=createLoadingProgressModel(),stageId='rankin';m.update({...phase(stageId,'match'),forecastTransferBytes:32000000,forecastDecodeBytes:128000000});const send=e=>m.update({v:1,stageId,...e});send({type:'transfer',resourceId:'actual',requestId:'worker/1',loadedBytes:10029754,totalBytes:10029754,state:'complete'});send({type:'decode',resourceId:'actual',jobId:'decode/1',loadedBytes:40000000,totalBytes:40000000,state:'complete'});assert.equal(m.snapshot().transfer.totalBytes,32000000);assert.equal(m.snapshot().decode.totalBytes,128000000);
 send({type:'ready'});let s=m.snapshot();assert.equal(s.transfer.loadedBytes,10029754);assert.equal(s.transfer.totalBytes,10029754);assert.equal(s.transfer.forecastBytes,null);assert.equal(s.decode.totalBytes,40000000);assert.equal(s.decode.forecastBytes,null);assert.equal(loadingProgressView(s).transfer.max,10029754);
 // Late worker plans may not turn the ready phase back into estimated remaining work.
 send({type:'plan',forecastTransferBytes:32000000,forecastDecodeBytes:128000000,discoveryComplete:false});s=m.snapshot();assert.equal(s.ready,true);assert.equal(s.transfer.totalBytes,10029754);assert.equal(s.decode.totalBytes,40000000);
});
test('completed discovery retires forecast without prematurely completing the native stage',()=>{
 const m=createLoadingProgressModel();m.update({...phase(),forecastTransferBytes:32000000});const send=e=>m.update({v:1,stageId:'menu-1',...e});send({type:'transfer',resourceId:'known',requestId:'1',loadedBytes:100,totalBytes:100,state:'complete'});send({type:'plan',discoveryComplete:true});assert.equal(m.snapshot().transfer.totalBytes,100);assert.equal(m.snapshot().transfer.forecastBytes,null);assert.equal(m.snapshot().ready,false);assert.equal(loadingProgressView(m.snapshot()).transfer.value,null);assert.equal(loadingProgressView(m.snapshot()).transfer.waiting,true);
 send({type:'transfer',resourceId:'later',requestId:'2',loadedBytes:5,totalBytes:50,state:'active'});assert.equal(m.snapshot().transfer.totalBytes,150);
});
test('retiring forecasts preserves unknown bytes, uncounted responses and playing readiness',()=>{
 const m=createLoadingProgressModel();m.update({...phase(),forecastTransferBytes:32000000,forecastDecodeBytes:8000000});const send=e=>m.update({v:1,stageId:'menu-1',...e});send({type:'transfer',resourceId:'unknown',requestId:'1',loadedBytes:null,totalBytes:null,state:'complete'});send({type:'decode',resourceId:'unknown',jobId:'1',loadedBytes:7,totalBytes:null,state:'working'});send({type:'phase',state:'playing'});const s=m.snapshot();assert.equal(s.ready,true);assert.equal(s.transfer.forecastBytes,null);assert.equal(s.transfer.totalBytes,null);assert.equal(s.transfer.unknown,1);assert.equal(s.transfer.uncountedResponses,1);assert.equal(s.decode.totalBytes,null);assert.equal(s.decode.unknown,1);assert.equal(loadingProgressView(s).transfer.value,null);
});
