import assert from 'node:assert/strict';import vm from 'node:vm';import {installMenuTouch,patchMenuTouch,patchMenuTouchFrontend} from './menu-touch.mjs';
let job,prime=0;const canvas={};const scope={Module:{print(){},canvas,arguments:['./this.program','NoIntro']},setTimeout(fn){job=fn;return 1;},clearTimeout(){},__privateMenuPrimeMouse(){prime++;}};installMenuTouch(scope);const sent=[];function e(type,count=1){return {type,target:canvas,touches:Array.from({length:count},()=>({})),changedTouches:[{clientX:12,clientY:45}],preventDefault(){this.prevented=true;}};}const send=x=>{if(!scope.__privateMenuTouch(x,send))sent.push(x.type);};send(e('touchstart'));send(e('touchend',0));assert.equal(prime,1);assert.deepEqual(sent,[]);job();assert.deepEqual(sent,['touchstart','touchend']);
let start=e('touchstart');send(start);send(e('touchcancel',0));job();assert.equal(sent.length,2);
send(e('touchstart'));send(e('touchstart',2));assert.deepEqual(sent.slice(-2),['touchstart','touchstart']);
scope.__privateAimBridge={status:()=>({ready:true,telemetry:{guiActive:'0'}})};send(e('touchstart'));assert.equal(prime,3);assert.equal(sent.at(-1),'touchstart');
scope.__privateAimBridge=null;scope.Module.print('Log: Browse: DM-Rankin?Game=XGame.xDeathMatch');const before=prime;send(e('touchstart'));assert.equal(prime,before);
let poll;const pad={style:{display:'grid'}};let gui='1';const padScope={Module:{print(){},arguments:['NoIntro']},document:{createElement:()=>({}),head:{appendChild(){}},getElementById:()=>pad},setInterval(fn){poll=fn;},setTimeout(){},clearTimeout(){},__privateAimBridge:{status:()=>({ready:true,telemetry:{guiActive:gui}})}};installMenuTouch(padScope);poll();assert.equal(pad.hidden,true);assert.equal(pad.style.display,'grid');pad.style.display='none';gui='0';poll();assert.equal(pad.hidden,false);assert.equal(pad.style.display,'none');
console.log('Native GUI hides the pad without overriding the source visibility policy.');

const source='s=a=>{const c=a,u=i.handle(a.type,c.changedTouches);return u}';
const app=patchMenuTouchFrontend(source);assert.equal(patchMenuTouchFrontend(app),app);
const c={globalThis:{__privateNativeMenuActive:()=>true},i:{handle(){throw Error('Gamepad must not consume a menu touch')}}};
vm.runInNewContext(app,c);assert.equal(c.s({type:'touchstart',changedTouches:[]}),undefined);
let calls=0;c.globalThis.__privateNativeMenuActive=()=>false;c.i.handle=()=>++calls;
assert.equal(c.s({type:'touchstart',changedTouches:[]}),1);assert.equal(calls,1);
console.log('Capture router passes menu input through and retains gameplay routing.');

const {patchPadOwnership}=await import('./input-patches.mjs');
const guard='if(globalThis.__privateOwnsNativeTouch?.(e))return;';
const callbacks='var touchEventHandlerFunc=e=>{'+guard+'calls.push("touch");};var mouseEventHandlerFunc=e=>{'+guard+guard+'calls.push("mouse");};';
const patched=patchPadOwnership(callbacks);assert.equal(patchPadOwnership(patched),patched);
const io={calls:[],globalThis:{__privateOwnsNativeTouch:e=>e.pad}};vm.runInNewContext(patched,io);io.touchEventHandlerFunc({pad:true});io.mouseEventHandlerFunc({pad:true});assert.equal(io.calls.length,0);io.touchEventHandlerFunc({pad:false});io.mouseEventHandlerFunc({pad:false});assert.deepEqual(io.calls,['touch','mouse']);
console.log('Input ownership blocks pad duplicates, keeps native controls and stays idempotent.');

const foreign=new Set([5]);let cancelled=0;
c.globalThis.__privateNativeMenuActive=()=>true;
c.i.handle=(type,touches)=>{assert.equal(type,'touchcancel');for(const touch of touches)foreign.delete(touch.identifier);return {};};
c.r={cancel(){cancelled++;}};
c.s({type:'touchend',changedTouches:[{identifier:5}]});assert.equal(foreign.size,0);assert.equal(cancelled,1);
console.log('Menu touch end clears held gameplay contact bookkeeping.');
