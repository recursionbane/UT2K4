const assert=require('node:assert/strict');
const fs=require('node:fs');
const {parseNativeTar,patchNativeShell}=require('./native-import.js');
assert.throws(()=>parseNativeTar(new Uint8Array(512).fill(65)),/header/);
const source='<link href="../assets/mobile-input.css"><script src="/assets/mobile-input.js"></script>\nvar Module={dataBaseURL: location.pathname ? "/one/" : "/two/",};\nModule.gameClass = Module.localMap ? requestedGame : null;';
const patched=patchNativeShell(source);
assert(patched.includes('href="assets/mobile-input.css"'));
assert(patched.includes('src="assets/mobile-input.js"'));
assert(patched.includes("new URL('data/', location.href).href"));
assert(patched.includes("Module.map += '?Mutator='"));
assert(patched.includes('/^[a-z_]\\w*\\.[a-z_]\\w*$/i'));
if(process.argv[2]){
 const zlib=require('node:zlib');const archive=zlib.gunzipSync(fs.readFileSync(process.argv[2]));
 assert.equal(parseNativeTar(archive).size,6);
}
console.log('Native archive and adapter tests passed');
if(process.argv[2]) (async()=>{
 const crypto=require('node:crypto');const zlib=require('node:zlib');const vm=require('node:vm');const memory=new Map();
 global.mediaSave=async entries=>entries.forEach(([k,v])=>memory.set(k,v));global.mediaGet=async key=>memory.get(key);
 global.sha256=async blob=>crypto.createHash('sha256').update(Buffer.from(await blob.arrayBuffer())).digest('hex');
 await global.importNativeClient(new Blob([fs.readFileSync(process.argv[2])]));
 assert(await global.nativeClientReady());
 const req=new Request('https://example.test/UT2K4/native/profile123/index.html');
 const response=await global.nativeResponse(req,'https://example.test/UT2K4/');
 assert.equal(response.status,200);assert.equal(response.headers.get('Cross-Origin-Embedder-Policy'),'require-corp');
 const html=await response.text();const matrixLine=html.match(/const matrixSession = ([^;]+);/);assert(matrixLine);assert(vm.runInNewContext(matrixLine[1],{options:new URLSearchParams('mutator=Matrix2004_v130.MutMonkeyMatrixMoves')}));
 const mutatorCheck=html.match(/importedMutators.every\(value => (.+?)\.test\(value\)\)/);assert(mutatorCheck);assert(vm.runInNewContext(mutatorCheck[1]+'.test("Matrix2004_v130.MutMonkeyMatrixMoves")'));
 assert(html.includes('href="../../?setup=1"'));
 assert(html.includes('id="pages-input"'));assert(html.includes('pages-toolbar-height'));assert(html.includes("if(touchPreferred)canvas.requestPointerLock="));assert(html.includes('id="pages-touch-settings"'));assert(html.includes('id="pages-touch-fullscreen"'));assert(html.includes('.mobile-input-button[data-id=bullet]{top:54px;right:8px'));assert(html.includes("const defaultJoin = false"));assert(html.includes("powerProfile.defaultResolution"));assert(html.includes("mobileConfig.binds.bullet='KeyB'"));assert(!html.includes('Join multiplayer</button>'));assert(!html.includes('Bounded CI run'));assert(html.includes('(?:DefUser|User)'));
 const js=await memory.get('native-client/ut2004.js').text();
 const adapted=await(await global.nativeResponse(new Request('https://example.test/UT2K4/native/profile123/ut2004.js'),'https://example.test/UT2K4/')).text();
 assert(adapted.includes('await new Promise(Module.pagesRequestAnimationFrame || requestAnimationFrame)'));assert(!js.includes('Module.pagesRequestAnimationFrame'));
 const wait=adapted.match(/function __asyncjs__WaitForBrowserFrame\(\) \{[^\n]+/)[0];let hookRan=false;await vm.runInNewContext(wait+';__asyncjs__WaitForBrowserFrame()', {Asyncify:{handleAsync:fn=>fn()},Module:{pagesRequestAnimationFrame:resolve=>{hookRan=true;resolve(16)}}});assert(hookRan,'actual pinned Asyncify frame wait uses adapter');
 const bridge=js.match(/572675: \([^)]*\) => \{([^}]+)\}/);assert(bridge,'pinned native bridge exists');
 let nativeURL;vm.runInNewContext('(function($0,$1){'+bridge[1]+'})(0,1024)',{Module:{map:'DM-Rankin?Mutator=Matrix2004_v130.MutMonkeyMatrixMoves',gameClass:'XGame.xDeathMatch'},stringToUTF8:value=>nativeURL=value});
 assert.equal(nativeURL,'DM-Rankin?Mutator=Matrix2004_v130.MutMonkeyMatrixMoves?game=XGame.xDeathMatch');for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
 const wasm=await global.nativeResponse(new Request('https://example.test/UT2K4/native/profile123/ut2004.wasm',{headers:{Range:'bytes=0-7'}}),'https://example.test/UT2K4/');
 assert.equal(wasm.status,206);assert.deepEqual([...new Uint8Array(await wasm.arrayBuffer())],[0,97,115,109,1,0,0,0]);
 assert.equal(await global.nativeResponse(new Request('https://example.test/UT2K4/native/profile123/data/System/Core.u'),'https://example.test/UT2K4/'),null);
 assert.equal(await global.nativeResponse(new Request('https://example.test/UT2K4/native/profile123/files.json'),'https://example.test/UT2K4/'),null);
 assert.equal(await global.nativeResponse(new Request('https://elsewhere.test/UT2K4/native/profile123/index.html'),'https://example.test/UT2K4/'),null);
 console.log('Verified client import, patched script syntax, WASM range, route delegation and isolation passed');
})().catch(e=>{console.error(e);process.exitCode=1});
const {patchNativeUserIni}=require('./native-import.js');
const ini='[Other]\r\nB=Unrelated\r\n[Engine.Input]\r\nB=SwitchToLastWeapon\r\nSpace=Jump\r\n[Next]\r\nB=Unrelated';
assert.equal(patchNativeUserIni(ini,false),ini);
const changed=patchNativeUserIni(ini,true);
assert.equal(changed.match(/B=slowtimedown/g).length,1);
assert.equal(changed.match(/B=Unrelated/g).length,2);
assert(changed.includes('\r\nSpace=Jump'));
assert.equal(patchNativeUserIni('[Engine.Input]\nSpace=Jump',true),'[Engine.Input]\nB=slowtimedown\nSpace=Jump');
assert(patchNativeUserIni('[Other]\nTest=1',true).endsWith('[Engine.Input]\nB=slowtimedown'));
const {nativePowerProfile,nativePixelBudget,installNativePowerLoop}=require('./native-import.js');
for(const power of ['efficient','balanced','quality'])for(const dimensions of [[3840,2160],[640,480],[3840,240],[320,2160]]){
 const profile=nativePowerProfile(power,false),size=nativePixelBudget(...dimensions,profile);
 assert(size[0]*size[1]<=profile.maxPixels);
 assert(size.every(v=>v%2===0));
}
assert.equal(nativePowerProfile('unknown',false).name,'efficient');
for(const fps of [30,60]){
 const vm=require('node:vm'),pending=[];let ran=0,timing;
 const scope={Module:{},document:{hidden:false},MainLoop:{func:()=>{}},window:{requestAnimationFrame:callback=>pending.push(callback)},_emscripten_set_main_loop_timing:(...args)=>timing=args};
 vm.runInNewContext('('+installNativePowerLoop.toString()+')({name:"efficient",fps:'+fps+'},null)',scope);
 assert.equal(timing,undefined);
 function callback(){ran++;scope.Module.pagesRequestAnimationFrame(callback)}
 scope.Module.pagesRequestAnimationFrame(callback);
 for(let time=0;time<=1000;time+=1000/120)pending.shift()(time);
 assert(ran<=fps+1&&ran>=fps-1,{fps,ran});
 const before=ran;scope.document.hidden=true;for(let time=1010;time<1500;time+=10)pending.shift()(time);assert.equal(ran,before);
 assert.equal(scope.Module.powerEvidence.scheduler,'asyncify-engine-requestAnimationFrame-cap');
}
console.log('Power profile pixel budgets and actual scheduler adapter 30/60/hidden checks passed');
{
 const vm=require('node:vm');const scope={Module:{},document:{hidden:false},window:{requestAnimationFrame:()=>{}}};
 const apply='('+installNativePowerLoop.toString()+')({name:"efficient",fps:30},null)';
 vm.runInNewContext(apply,scope);const installed=scope.Module.pagesRequestAnimationFrame;
 assert.equal(scope.Module.powerEvidence.scheduler,'asyncify-engine-requestAnimationFrame-cap');
 assert.equal(scope.Module.powerEvidence.mainLoopReady,true);
 vm.runInNewContext(apply,scope);assert.equal(scope.Module.pagesRequestAnimationFrame,installed);
 const {nativeGraphicsInfo,patchNativeGlue}=require('./native-import.js');let created=0;
 assert.equal(vm.runInNewContext('('+nativeGraphicsInfo.toString()+')()', {Module:{canvas:{getContext:()=>{created++}}}}).renderer,'Context not ready; wait for engine startup');assert.equal(created,0);
 assert.throws(()=>patchNativeGlue('unsupported'),/Unsupported native/);
}
console.log('Asyncify hook installation, idempotence and context non-interference passed');
