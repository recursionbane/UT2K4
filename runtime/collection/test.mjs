// Public, data-free runtime regressions. Run with Node 24+: node --test runtime/collection/test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import {applyEmbeddedMenuDefaults, embeddedIndex} from './startup-data.mjs';
import {buildPackage, DEFAULT_POLICY} from './jit-packages.mjs';
import {createJitCache} from './jit-cache.mjs';
import {installMenuStartup, menuMutatorArgs, LOW_MEMORY_ARGS} from './startup-policy.mjs';

const preset=['Fixture.First','Fixture.Second'];
function archive(controller) {
 const parts=[Buffer.from([0,255,3,4]),Buffer.from('[Other]\nKeep=abc\n[GUI2K4.UT2K4Tab_MutatorSP]\nLastActiveMutators=Old.Entry\n'),Buffer.from('[URL]\nLocalMap=Old.ut2\n[SDL2Drv.SDL2Client]\nTextureDetailWorld=High\nKeep=7\n[Engine.GameInfo]\nGoreLevel=2\nGoreLevel=1\n'),Buffer.from([10,0,128,255,12])];
 if(controller)parts[2]=Buffer.concat([parts[2],Buffer.from('[Engine.Engine]\nGUIController='+controller+'\n')]);
 const names=['Build.ini','DefUser.ini','Default.ini','Packages.md5'];let offset=0;
 const files=parts.map((p,i)=>{const f={filename:'/System/'+names[i],start:offset,end:offset+p.length};offset=f.end;return f;});
 return {parts,data:Buffer.concat(parts),loader:'/* before */loadPackage('+JSON.stringify({files,remote_package_size:offset})+');/* after */'};
}
test('embedded archive repacks offsets while preserving unrelated binary bytes and config',()=>{
 const original=archive();const result=applyEmbeddedMenuDefaults({...original,mutators:preset,userIni:'[Other]\nUserValue=yes\n'});
 const parsed=embeddedIndex(result.loader).index;assert.deepEqual(parsed,result.index);assert.equal(parsed.remote_package_size,result.data.length);
 assert(result.loader.startsWith('/* before */loadPackage('));assert(result.loader.endsWith(');/* after */'));
 let cursor=0;const parts=parsed.files.map(f=>{assert.equal(f.start,cursor);cursor=f.end;return result.data.subarray(f.start,f.end);});
 assert.deepEqual(parts[0],original.parts[0]);assert.deepEqual(parts[3],original.parts[3]);
 const defaults=parts[2].toString();assert.match(defaults,/LocalMap=NoIntro\.ut2/);assert.match(defaults,/TextureDetailWorld=Low/);assert.match(defaults,/Keep=7/);assert.equal((defaults.match(/^GoreLevel=/gm)||[]).length,1);assert.match(defaults,/GoreLevel=0/);
 for(const field of ['TextureDetailTerrain','TextureDetailPlayerSkin','TextureDetailWeaponSkin','TextureDetailRenderMap','TextureDetailLightmap'])assert.match(defaults,new RegExp(field+'=Low'));
 assert.match(defaults,/TextureDetailInterface=Normal/);assert.match(defaults,/WindowedViewportX=1024/);
 assert.match(parts[1].toString(),/Keep=abc/);assert(!parts[1].includes(Buffer.from('Old.Entry')));assert.match(result.userIni,/UserValue=yes/);
 assert.equal((parts[1].toString().match(/LastActiveMutators=Fixture.First,Fixture.Second/g)||[]).length,2);
 const twice=applyEmbeddedMenuDefaults({...result,mutators:preset,userIni:result.userIni});assert.deepEqual(twice.data,result.data);assert.equal(twice.loader,result.loader);assert.equal(twice.userIni,result.userIni);
 const normal=applyEmbeddedMenuDefaults({...original,mutators:preset,lowMemory:false});assert.match(normal.data.toString(),/TextureDetailWorld=High/);
});
test('menu warmup deferral replaces only the stock GUI controller',()=>{
 const guiController='DeferredMenu.DeferredPlayerRecordsController';
 for(const controller of ['GUI2K4.UT2K4GUIController',guiController]){
  const result=applyEmbeddedMenuDefaults({...archive(controller),mutators:preset,guiController});
  assert.match(result.data.toString(),/GUIController=DeferredMenu\.DeferredPlayerRecordsController/);
 }
 const custom=applyEmbeddedMenuDefaults({...archive('Conversion.CustomGUI'),mutators:preset,guiController});
 assert.match(custom.data.toString(),/GUIController=Conversion\.CustomGUI/);
 assert(!custom.data.toString().includes('GUIController='+guiController));
 assert.throws(()=>applyEmbeddedMenuDefaults({...archive(),mutators:preset,guiController:'Unknown.Controller'}),/Unsupported/);
});
test('embedded archive rejects ambiguous, overlapping, truncated and unexpected layouts',()=>{
 const a=archive();assert.throws(()=>embeddedIndex(a.loader+a.loader),/Multiple/);
 const metadata=embeddedIndex(a.loader).index;metadata.files[1].start++;
 assert.throws(()=>embeddedIndex('loadPackage('+JSON.stringify(metadata)+')'),/layout/);
 assert.throws(()=>applyEmbeddedMenuDefaults({...a,data:a.data.subarray(1),mutators:preset}),/length/);
 assert.throws(()=>applyEmbeddedMenuDefaults({...a,mutators:['Bad\nKey=1']}),/preset/);
});

function syntheticBytes(length){const b=Buffer.alloc(length);let state=0x12345678;for(let i=0;i<length;i++){state^=state<<13;state^=state>>>17;state^=state<<5;b[i]=state&255;}return b;}
async function fixture(blockSize=65536){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'collection-runtime-test-'));const raw=syntheticBytes(blockSize*9+29),transport=zlib.zstdCompressSync(raw),entry={path:'assets/synthetic.bin.zst',size:raw.length};
 try{const built=await buildPackage({logical:'synthetic.utx',entry,transport,output:dir,policy:{...DEFAULT_POLICY,blockSize,level:1}});return {dir,raw,entry,built,index:JSON.parse(fs.readFileSync(path.join(dir,built.index))),packed:fs.readFileSync(path.join(dir,built.container)),transport};}catch(e){fs.rmSync(dir,{recursive:true,force:true});throw e;}
}
const small=await fixture(),large=await fixture(256*1024);
test.after(()=>{for(const f of [small,large])fs.rmSync(f.dir,{recursive:true,force:true});});
function server(f,{fault=()=>null}={}){
 const calls=[];let count=0;
 const fetcher=async(url,init)=>{
  const u=new URL(url);assert.equal(u.origin,'https://fixture.invalid');assert.equal(init.cache,'no-store');assert.equal(init.credentials,'same-origin');
  const isIndex=u.pathname.endsWith('.jit.json');const call={index:isIndex,range:init.headers?.Range,url:u.pathname};calls.push(call);
  const injected=await fault(call,++count);if(injected)return injected;
  if(isIndex)return new Response(JSON.stringify(f.index),{status:200});
  const match=/^bytes=(\d+)-(\d+)$/.exec(call.range);assert(match);const start=Number(match[1]),end=Number(match[2]);assert(start>=0&&end<f.packed.length&&start<=end);
  return new Response(f.packed.subarray(start,end+1),{status:206,headers:{'Content-Range':`bytes ${start}-${end}/${f.packed.length}`}});
 };
 return {calls,fetcher};
}
function cache(f,options={}){const s=server(f,options),delays=[];const c=createJitCache({fetcher:s.fetcher,decode:(bytes,size)=>{const out=zlib.zstdDecompressSync(bytes);assert.equal(out.length,size);return out;},baseURL:'https://fixture.invalid/',sleep:async ms=>{delays.push(ms);},...options});return {...s,c,delays};}
async function read(h,f,off,max,viewLength=max){const view=new Uint8Array(viewLength).fill(0xaa);const n=await h.c.read({url:f.entry.path,size:f.raw.length,off,max,jit:{format:'zstd-pages-v1',blockSize:f.index.blockSize}},view);assert.deepEqual(Buffer.from(view.subarray(0,n)),f.raw.subarray(off,off+n));assert(view.subarray(n).every(x=>x===0xaa));return n;}
const ranges=h=>h.calls.filter(x=>!x.index);
test('synthetic Zstd packaging round-trips independent frames and resumes verified output',async()=>{
 for(const b of small.index.blocks)assert.deepEqual(zlib.zstdDecompressSync(small.packed.subarray(b.offset,b.offset+b.length)),small.raw.subarray(small.index.blocks.indexOf(b)*small.index.blockSize,small.index.blocks.indexOf(b)*small.index.blockSize+b.rawLength));
 const again=await buildPackage({logical:'synthetic.utx',entry:small.entry,transport:small.transport,output:small.dir,policy:{...DEFAULT_POLICY,blockSize:65536,level:1}});assert.equal(again.resumed,true);
 await assert.rejects(()=>buildPackage({logical:'synthetic.utx',entry:{...small.entry,path:'../escape'},transport:small.transport,output:small.dir}),/Unsafe/);
});
test('JIT exact first, cross-page and EOF reads; overlapping requests deduplicate',async()=>{
 const h=cache(small);assert.equal(await read(h,small,0,37),37);assert.equal(await read(h,small,65530,35),35);
 assert.equal(await read(h,small,small.raw.length-7,30),7);const count=h.calls.length;assert.equal(await read(h,small,small.raw.length+2,15),0);assert.equal(h.calls.length,count);
 const concurrent=cache(small);await Promise.all([read(concurrent,small,10,200),read(concurrent,small,20,100)]);assert.equal(concurrent.calls.filter(x=>x.index).length,1);assert.equal(ranges(concurrent).length,1);
 await assert.rejects(()=>h.c.read({url:'https://other.invalid/x',size:small.raw.length,off:0,max:1,jit:{format:'zstd-pages-v1',blockSize:65536}},new Uint8Array(1)),/same-origin/);
});
test('transient network, service failure and corrupt frame retry without poisoning cache',async()=>{
 let attempts=0;const h=cache(small,{fault(call){if(call.index)return null;attempts++;if(attempts===1)throw Error('synthetic disconnect');if(attempts===2)return new Response('',{status:503});if(attempts===3)return new Response(new Uint8Array(Number(call.range.split('-')[1])+1).fill(0),{status:206,headers:{'Content-Range':`bytes 0-${Number(call.range.split('-')[1])}/${small.packed.length}`}});return null;}});
 await read(h,small,0,80);assert.equal(h.c.stats.retries,3);assert.deepEqual(h.delays,[150,450,1000]);assert.equal(h.c.residentBytes,65536);await read(h,small,1,10);assert.equal(attempts,4);
});
test('long Retry-After and invalid range identities fail promptly',async()=>{
 const rate=cache(small,{fault:call=>call.index?null:new Response('',{status:429,headers:{'Retry-After':'45'}})});await assert.rejects(()=>read(rate,small,0,10),/temporary HTTP 429/);assert.deepEqual(rate.delays,[]);assert.equal(ranges(rate).length,1);
 const wrong=cache(small,{fault:call=>call.index?null:new Response(new Uint8Array(1),{status:206,headers:{'Content-Range':'bytes 0-0/1'}})});await assert.rejects(()=>read(wrong,small,0,10),/range identity/);assert.equal(wrong.c.residentBytes,0);assert.equal(wrong.c.stats.retries,0);
});
test('bounded LRU evicts least recently used pages and retains in-flight multi-page results',async()=>{
 const h=cache(small,{maxBytes:2*65536});await read(h,small,0,8);await read(h,small,65536,8);await read(h,small,0,8);await read(h,small,2*65536,8);assert.equal(h.c.residentBytes,2*65536);await read(h,small,65536,8);assert.equal(ranges(h).length,4);assert(h.c.residentBytes<=2*65536);
 const tiny=cache(small,{maxBytes:65536});await read(tiny,small,65530,2*65536+50);assert(tiny.c.residentBytes<=65536);assert.equal(ranges(tiny).length,1);
});
test('package index metadata has a separate LRU budget across maps',async()=>{
 const n=Buffer.byteLength(JSON.stringify(small.index)),h=cache(small,{maxIndexBytes:n*2});
 const other=name=>({...small,entry:{...small.entry,path:'assets/'+name+'.zst'}});
 const a=other('a'),b=other('b'),c=other('c');
 await read(h,a,0,4);await read(h,b,0,4);await read(h,a,0,4);await read(h,c,0,4);
 assert.equal(h.c.indexResidentBytes,n*2);assert.equal(h.c.stats.indexEvictions,1);
 const before=h.c.stats.indexRequests;await read(h,a,0,4);assert.equal(h.c.stats.indexRequests,before);
 await read(h,b,0,4);assert.equal(h.c.stats.indexRequests,before+1);assert(h.c.indexResidentBytes<=n*2);
});
test('native read deadlines return before late codec work and never overwrite a reused destination',async()=>{
 let release,started,finished,aborted=false;
 const begun=new Promise(r=>started=r),done=new Promise(r=>finished=r),gate=new Promise(r=>release=r);
 const f={...small,index:{...small.index,regions:[{fixture:true}]}};
 const h=cache(f,{readBudgetMs:50,reconstruct:async({view,signal})=>{started();await gate;aborted=signal.aborted;view.fill(0);finished();}});
 const view=new Uint8Array(12).fill(77);
 const reading=h.c.read({url:f.entry.path,size:f.raw.length,off:0,max:12,jit:{format:'zstd-pages-v1',blockSize:f.index.blockSize,regions:true}},view);
 const rejected=assert.rejects(reading,/deadline/);await begun;await rejected;
 assert(view.every(n=>n===77));view.fill(99);release();await done;await Promise.resolve();
 assert(aborted);assert(view.every(n=>n===99));assert.equal(h.c.stats.readCalls,0);
});
test('adaptive read-ahead starts only after sequential demand, stays at 1MiB and serves prefetched pages',async()=>{
 const h=cache(large,{readAheadPages:4,maxBytes:8*large.index.blockSize}),bs=large.index.blockSize;
 await read(h,large,0,16);assert.equal(h.c.stats.readAheadPages,0);await read(h,large,bs,16);assert.equal(h.c.stats.readAheadPages,3);assert.equal(h.c.stats.readAheadBytes,3*bs);
 const before=ranges(h).length;await read(h,large,2*bs,16);assert.equal(ranges(h).length,before);assert.equal(h.c.stats.readAheadUsedPages,1);
 for(const request of ranges(h)){const match=/bytes=(\d+)-(\d+)/.exec(request.range);const blocks=large.index.blocks.filter(b=>b.offset>=Number(match[1])&&b.offset+b.length-1<=Number(match[2]));assert(blocks.reduce((sum,b)=>sum+b.rawLength,0)<=1048576);}
 const random=cache(large,{readAheadPages:4});await read(random,large,0,2);await read(random,large,6*bs,2);assert.equal(random.c.stats.readAheadPages,0);await read(random,large,9*bs,50);assert.equal(random.c.stats.readAheadPages,0);
});

test('startup waits for normal readiness, acknowledges only temporary-storage warning and presets once',()=>{
 let tick,cleared=0,clicks=0,continued=0,dialog=true,missing=['indexedDb','webgl2'],ready=false,disabled=true,width=0;const args=[...LOW_MEMORY_ARGS,...menuMutatorArgs(preset)];
 const scope={document:{getElementById(id){if(id==='capability-dialog'&&dialog)return {querySelectorAll:()=>missing.map(name=>({getAttribute:()=>name}))};if(id==='capability-continue')return {click(){continued++;dialog=false;}};if(id==='start-btn')return {get disabled(){return disabled;},getBoundingClientRect:()=>({width}),click(){clicks++;scope.launchEngine(['NoIntro',args[0]]);}};return null;}},ufrontConfig:{launchState:{get ready(){return ready;}}},setInterval(fn){tick=fn;return 17;},clearInterval(id){assert.equal(id,17);cleared++;},launchEngine(nativeArgs){this.delivered=nativeArgs;return 'native-result';}};
 installMenuStartup(scope,args);tick();assert.equal(continued,0);assert.equal(clicks,0);missing=['indexedDb','opfsSyncAccess'];tick();assert.equal(continued,1);assert.equal(clicks,0);ready=true;tick();assert.equal(clicks,0);disabled=false;tick();assert.equal(clicks,0);width=640;tick();tick();assert.equal(clicks,1);assert.equal(cleared,1);assert.deepEqual(scope.delivered,['NoIntro',...args]);assert.equal(scope.launchEngine(['Other']), 'native-result');assert.deepEqual(scope.delivered,['Other',...args]);assert(scope.__privateStartupPolicy.started);
});

test('automatic startup acknowledges only storage warnings and preserves graphics/threading blockers',()=>{
 function warnings(names){let tick,ack=0,start=0,visible=true;const scope={document:{getElementById(id){if(id==='capability-dialog'&&visible)return {querySelectorAll:()=>names.map(name=>({getAttribute:()=>name}))};if(id==='capability-continue')return {click(){ack++;visible=false;}};if(id==='start-btn')return {disabled:false,getBoundingClientRect:()=>({width:640}),click(){start++;}};return null;}},ufrontConfig:{launchState:{ready:true}},setInterval(fn){tick=fn;return 1;},clearInterval(){}};installMenuStartup(scope,[]);tick();tick();return {ack,start};}
 for(const names of [['indexedDb'],['opfsSyncAccess'],['indexedDb','opfsSyncAccess']])assert.deepEqual(warnings(names),{ack:1,start:1});
 for(const blocker of ['webgl2','sharedArrayBuffer','atomics','wasmThreads','crossOriginIsolated','unknownFutureFeature']){assert.deepEqual(warnings([blocker]),{ack:0,start:0});assert.deepEqual(warnings(['indexedDb','opfsSyncAccess',blocker]),{ack:0,start:0});}
 assert.deepEqual(warnings([]),{ack:0,start:0});
});
