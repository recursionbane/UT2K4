const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),http=require('http');
const {chromium}=require('playwright');
const source=fs.readFileSync(__dirname+'/assist-client.js','utf8');
const context={module:{exports:{}}};vm.runInNewContext(source,context);const {viewportPoint,selectCommand,parseTelemetry,TapPair}=context.module.exports;
const geometry={rect:{left:20,top:80,width:800,height:450},width:1600,height:900,offsetWidth:800,offsetHeight:450,style:{}};
assert.equal(viewportPoint(geometry,420,305).x,.5);assert.equal(viewportPoint(geometry,420,305).y,.5);
assert.equal(viewportPoint(geometry,19,305),null);assert.equal(viewportPoint(geometry,821,305),null);
assert.equal(viewportPoint(geometry,0,0,true).x,.5);
const contain={...geometry,rect:{left:0,top:0,width:800,height:600},offsetWidth:800,offsetHeight:600,style:{objectFit:'contain',objectPosition:'50% 50%'}};
assert.equal(viewportPoint(contain,400,10),null);assert.equal(viewportPoint(contain,400,300).y,.5);
assert.equal(selectCommand({x:.25,y:.75}),'mutate mmAim select 0.250000 0.750000');
assert.throws(()=>selectCommand({x:Infinity,y:0}));assert.throws(()=>selectCommand({x:-.1,y:0}));
assert.equal(parseTelemetry('ScriptLog: MMAIM_READY standalone=1 auto=1 manual=0').standalone,'1');
assert.equal(parseTelemetry('not a native marker'),null);assert.equal(parseTelemetry('ScriptLog: Chat: player says MMAIM_READY standalone=1'),null);
const point=(x=10,y=10)=>({x:.5,y:.5,clientX:x,clientY:y});
let taps=new TapPair();taps.down(1,point(),0);assert.equal(taps.up(1,point(),50,'touch'),null);taps.down(2,point(15),150);assert.ok(taps.up(2,point(15),200,'touch'));
taps=new TapPair();taps.down(1,point(),0);taps.move(1,point(50));assert.equal(taps.up(1,point(),50,'touch'),null);taps.down(2,point(),100);assert.equal(taps.up(2,point(),150,'touch'),null);
taps=new TapPair();taps.down(1,point(),0);taps.down(2,point(),10);assert.equal(taps.up(1,point(),50,'touch'),null);assert.equal(taps.up(2,point(),60,'touch'),null);
taps=new TapPair();taps.down(1,point(),0);assert.equal(taps.up(1,point(),500,'touch'),null);
(async()=>{
 const html=`<!doctype html><body style="margin:0"><canvas id="canvas" width="1600" height="900" style="position:absolute;left:20px;top:80px;width:800px;height:450px"></canvas><div id="touch-gamepad-overlay"><div class="tp-zone tp-zone-move" data-zone="move" style="position:absolute;left:20px;top:80px;width:320px;height:450px"></div><div class="tp-zone tp-zone-look" data-zone="look" style="position:absolute;left:500px;top:80px;width:320px;height:450px"></div><button id="pad" data-control="fire" style="position:absolute;left:740px;top:440px;width:60px;height:60px">Fire</button><div data-stick="move" style="position:absolute;left:40px;top:400px;width:80px;height:80px"></div></div><script>window.commands=[];window.nativeSettings={auto:0,thirdperson:0,wallrun:0,timeToggle:0,timeActive:0,timeNative:1};window.Module={canvas:document.getElementById('canvas'),print:()=>{},playerState:{netMode:0}};window.ueExecResult=async function(cmd){commands.push(cmd);await new Promise(r=>setTimeout(r,20));if(cmd.startsWith('mutate mmAim auto '))nativeSettings.auto=cmd.endsWith('on')?1:0;if(cmd.startsWith('mutate mmMatrix camera '))nativeSettings.thirdperson=cmd.endsWith('on')?1:0;if(cmd.startsWith('mutate mmMatrix wallrun '))nativeSettings.wallrun=cmd.endsWith('on')?1:0;if(cmd.startsWith('mutate mmMatrix time mode '))nativeSettings.timeToggle=cmd.endsWith('toggle')?1:0;if(cmd==='mutate mmMatrix time toggle')nativeSettings.timeActive=1-nativeSettings.timeActive;const output='MMAIM_STATUS standalone=1 manual=0 target=None '+Object.entries(nativeSettings).map(([k,v])=>k+'='+v).join(' ');setTimeout(()=>Module.print(output),30);return {ok:true,output:''};}</script><script src="/aim.js"></script>`;
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/aim.js'?'text/javascript':'text/html');res.end(req.url==='/aim.js'?source:html)});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;
 try{
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
 const page=await browser.newPage({viewport:{width:1000,height:700}});await page.goto('http://127.0.0.1:'+server.address().port+'/v/ut2004/');
 await page.waitForFunction(()=>!!window.__privateAimBridge);
 await page.evaluate(()=>Module.print('MMAIM_READY standalone=1 auto=0 manual=0 thirdperson=0 wallrun=0 timeToggle=0 timeActive=0 timeNative=1'));
 await page.waitForFunction(()=>commands.includes('mutate mmAim auto on'));
 await page.waitForFunction(()=>{const s=__privateAimBridge.status();return s.actualAuto&&s.actualThirdPerson===false&&s.actualWallrun&&s.timeToggle});
 assert.equal(await page.locator('#private-aim-settings,#private-matrix-time').count(),0);
 const pair=async(target,x,y)=>page.evaluate(async({target,x,y})=>{const t=document.querySelector(target);for(let n=0;n<2;n++){t.dispatchEvent(new PointerEvent('pointerdown',{pointerId:n+10,pointerType:'touch',button:0,clientX:x,clientY:y,bubbles:true}));await new Promise(r=>setTimeout(r,25));t.dispatchEvent(new PointerEvent('pointerup',{pointerId:n+10,pointerType:'touch',button:0,clientX:x,clientY:y,bubbles:true}));await new Promise(r=>setTimeout(r,35));}},{target,x,y});
 await page.evaluate(()=>{const node=document.createElement('div');node.className='tp-stick-base';node.dataset.stick='look';node.style.cssText='position:absolute;left:600px;top:240px;width:40px;height:40px;pointer-events:none';document.getElementById('touch-gamepad-overlay').appendChild(node)});
 await pair('.tp-zone-look',620,260);await page.waitForFunction(()=>commands.some(s=>s.startsWith('mutate mmAim select')));
 const selection=await page.evaluate(()=>commands.find(s=>s.startsWith('mutate mmAim select')));assert.equal(selection,'mutate mmAim select 0.750000 0.400000');

 await page.waitForTimeout(300);
 await page.evaluate(async()=>{
  const zone=document.querySelector('.tp-zone-move'),root=document.getElementById('touch-gamepad-overlay');
  const ev=(type,id)=>new PointerEvent(type,{pointerId:id,pointerType:'touch',button:0,clientX:220,clientY:260,bubbles:true});
  zone.dispatchEvent(ev('pointerdown',31));await new Promise(r=>setTimeout(r,25));root.dispatchEvent(ev('pointerup',31));
  const visual=document.createElement('div');visual.className='tp-stick-base clicked';visual.dataset.stick='move';visual.style.cssText='position:absolute;left:200px;top:240px;width:40px;height:40px;pointer-events:none';root.appendChild(visual);
  await new Promise(r=>setTimeout(r,35));zone.dispatchEvent(ev('pointerdown',32));await new Promise(r=>setTimeout(r,25));root.dispatchEvent(ev('pointerup',32));visual.remove();
 });
 await page.waitForFunction(()=>commands.includes('mutate mmAim select 0.250000 0.400000'));
 const capturedCount=await page.evaluate(()=>commands.filter(s=>s.startsWith('mutate mmAim select')).length);
 await page.waitForTimeout(300);await pair('.tp-zone-move',80,440);await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>commands.filter(s=>s.startsWith('mutate mmAim select')).length),capturedCount);
 const before=await page.evaluate(()=>commands.filter(s=>s.startsWith('mutate mmAim select')).length);
 await pair('#pad',770,470);await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>commands.filter(s=>s.startsWith('mutate mmAim select')).length),before);
 await page.evaluate(()=>{__privateAimBridge.setAuto(false);__privateAimBridge.setAuto(true)});await page.waitForTimeout(500);assert.equal(await page.evaluate(()=>__privateAimBridge.status().actualAuto),true);
 await page.waitForTimeout(800);await page.evaluate(()=>document.getElementById('canvas').dispatchEvent(new MouseEvent('dblclick',{button:0,clientX:420,clientY:305,bubbles:true})));await page.waitForTimeout(200);
 assert.ok(await page.evaluate(()=>commands.includes('mutate mmAim select 0.500000 0.500000')));

 await page.evaluate(()=>Module.print('MMAIM_STATUS standalone=1 auto=1 thirdperson=1 preferredThird=0 temporaryThird=1 wallrun=1 timeToggle=1 timeNative=1'));await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>__privateAimBridge.status().actualThirdPerson),false);
 await page.evaluate(()=>__privateAimBridge.setThirdPerson(true));await page.waitForFunction(()=>__privateAimBridge.status().actualThirdPerson===true);
 await page.evaluate(()=>__privateAimBridge.setThirdPerson(false));await page.waitForFunction(()=>__privateAimBridge.status().actualThirdPerson===false);
 await page.evaluate(()=>__privateAimBridge.setWallrun(false));await page.waitForFunction(()=>__privateAimBridge.status().actualWallrun===false);
 await page.evaluate(()=>__privateAimBridge.setTimeToggle(false));await page.waitForFunction(()=>__privateAimBridge.status().timeToggle===false);await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>__privateAimBridge.status().timeToggle),false);
 await page.evaluate(()=>__privateAimBridge.toggleTime());await page.waitForFunction(()=>__privateAimBridge.status().timeActive===true);
 const afterTime=await page.evaluate(()=>commands.filter(v=>v==='mutate mmMatrix time toggle').length);await page.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'y',code:'KeyY',bubbles:true})));await page.waitForTimeout(120);assert.equal(await page.evaluate(()=>commands.filter(v=>v==='mutate mmMatrix time toggle').length),afterTime);
 await page.evaluate(()=>Module.print('MMAIM_STATUS standalone=1 auto=1 manual=0 thirdperson=0 wallrun=0 timeToggle=0 timeActive=0 timeNative=0'));const fallback=await page.evaluate(()=>commands.length);await page.evaluate(()=>{__privateAimBridge.toggleTime();__privateAimBridge.setTimeToggle(true)});await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>commands.length),fallback);
 const total=await page.evaluate(()=>commands.length);await page.evaluate(()=>{Module.playerState.netMode=1;document.getElementById('canvas').dispatchEvent(new MouseEvent('dblclick',{button:0,clientX:420,clientY:305,bubbles:true}));__privateAimBridge.setAuto(false)});await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>commands.length),total);
 console.log('PASS: viewport/DPR/letterbox geometry, touch double-tap, drag/pinch/hold rejection, native marker readiness, default/toggled auto, look/move overlay hits, captured-root pointerup, decorative idle/clicked-stick pass-through, interactive-stick and pad exclusion, mouse double-click, camera/wallrun/Y-toggle controls, one-shot TIME, no duplicate Y listener, plain fallback and multiplayer guards');
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e.message);process.exitCode=1});
