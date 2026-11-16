/* Authenticated single-player aim controls. No persistent storage or network API. */
(function (global) {
  'use strict';
  const DEFAULTS = Object.freeze({doubleTapMs:350,doubleTapDistance:28,tapMove:14,tapHoldMs:280,commandGapMs:120});
  function finite(v,fallback=0){const n=Number.parseFloat(v);return Number.isFinite(n)?n:fallback;}
  function position(value){if(value==='left'||value==='top')return 0;if(value==='right'||value==='bottom')return 1;if(value==='center')return .5;return /%$/.test(value||'')?finite(value,50)/100:.5;}
  function viewportPoint(geometry,x,y,locked=false){
    const r=geometry.rect,s=geometry.style||{};
    if(!r||![r.left,r.top,r.width,r.height,x,y].every(Number.isFinite)||r.width<=0||r.height<=0)return null;
    const sx=r.width/(geometry.offsetWidth||r.width),sy=r.height/(geometry.offsetHeight||r.height);
    const left=r.left+(finite(s.borderLeftWidth)+finite(s.paddingLeft))*sx;
    const top=r.top+(finite(s.borderTopWidth)+finite(s.paddingTop))*sy;
    const width=r.width-(finite(s.borderLeftWidth)+finite(s.borderRightWidth)+finite(s.paddingLeft)+finite(s.paddingRight))*sx;
    const height=r.height-(finite(s.borderTopWidth)+finite(s.borderBottomWidth)+finite(s.paddingTop)+finite(s.paddingBottom))*sy;
    if(width<=0||height<=0)return null;
    if(locked)return {x:.5,y:.5,clientX:x,clientY:y};
    if(x<left||x>left+width||y<top||y>top+height)return null;
    const iw=geometry.width||width,ih=geometry.height||height;
    let renderWidth=width,renderHeight=height;
    if(['contain','cover','scale-down','none'].includes(s.objectFit)){
      let scale=s.objectFit==='cover'?Math.max(width/iw,height/ih):Math.min(width/iw,height/ih);
      if(s.objectFit==='scale-down')scale=Math.min(1,scale);
      if(s.objectFit==='none')scale=1;
      renderWidth=iw*scale;renderHeight=ih*scale;
    }
    const parts=(s.objectPosition||'50% 50%').trim().split(/\s+/);
    const renderLeft=left+(width-renderWidth)*position(parts[0]);
    const renderTop=top+(height-renderHeight)*position(parts[1]||'50%');
    const u=(x-renderLeft)/renderWidth,v=(y-renderTop)/renderHeight;
    if(!Number.isFinite(u)||!Number.isFinite(v)||u<0||u>1||v<0||v>1)return null;
    return {x:Math.max(0,Math.min(1,u)),y:Math.max(0,Math.min(1,v)),clientX:x,clientY:y};
  }
  function selectCommand(point){
    if(!point||![point.x,point.y].every(v=>Number.isFinite(v)&&v>=0&&v<=1))throw Error('Invalid viewport point');
    return 'mutate mmAim select '+point.x.toFixed(6)+' '+point.y.toFixed(6);
  }
  function parseTelemetry(line){
    const found=String(line).match(/^(?:\[[^\]]+\]\s*)?(?:(?:Script)?Log:\s*)?(MMAIM_READY|MMAIM_STATUS)\b(.*)/);
    if(!found)return null;
    const fields={marker:found[1]};
    for(const pair of found[2].matchAll(/\b([a-zA-Z][a-zA-Z0-9_]*)=([^\s]+)/g)){
      if(pair[1]!=='constructor'&&pair[1]!=='prototype')fields[pair[1]]=pair[2];
    }
    return fields;
  }
  class TapPair {
    constructor(options={}){this.options={...DEFAULTS,...options};this.active=new Map();this.last=null;}
    reset(){this.active.clear();this.last=null;}
    down(id,point,time){
      if(this.active.size){for(const p of this.active.values())p.cancelled=true;this.last=null;this.active.set(id,{cancelled:true});return;}
      this.active.set(id,{point,time,cancelled:false});
    }
    move(id,point){const p=this.active.get(id);if(p&&!p.cancelled&&(!point||Math.hypot(point.clientX-p.point.clientX,point.clientY-p.point.clientY)>this.options.tapMove))p.cancelled=true;}
    cancel(id){if(this.active.delete(id))this.last=null;}
    up(id,point,time,type){
      const p=this.active.get(id);this.active.delete(id);
      if(!p)return null;
      if(p.cancelled||!point||time<p.time||time-p.time>this.options.tapHoldMs||Math.hypot(point.clientX-p.point.clientX,point.clientY-p.point.clientY)>this.options.tapMove){this.last=null;return null;}
      const old=this.last;
      if(old&&old.type===type&&time>=old.time&&time-old.time<=this.options.doubleTapMs&&Math.hypot(point.clientX-old.point.clientX,point.clientY-old.point.clientY)<=this.options.doubleTapDistance){this.last=null;return point;}
      this.last={point,time,type};return null;
    }
  }
  function install(scope=global){
    const localPreview=['127.0.0.1','localhost','[::1]'].includes(scope.location?.hostname)&&scope.location.pathname.startsWith('/ut2004/');
    if(!scope.document||(!scope.location.pathname.startsWith('/v/')&&!localPreview)||scope.__privateAimBridge)return null;
    const doc=scope.document,options=DEFAULTS,taps=new TapPair(),pending=new Map(),configPending=new Map();
    const state={ready:false,wantedAuto:true,actualAuto:null,wantedThirdPerson:false,actualThirdPerson:null,wantedWallrun:true,actualWallrun:null,wantedTimeToggle:true,timeToggle:null,timeActive:null,timeNative:null,telemetry:null,selectedAt:0,commands:0,lastCommand:null,lastError:null,epoch:0};
    let queue=Promise.resolve(),queued=0,lastCommandAt=0,lastTouch=-Infinity,lastSelect=-Infinity,lastTimeToggle=-Infinity,hookedModule=null,hookedPrint=null,priorPrint=null,destroyed=false;
    const canvas=()=>scope.Module?.canvas||doc.getElementById('canvas');
    function standalone(){const mode=scope.Module?.playerState?.netMode;return state.telemetry?.standalone==='1'&&(mode===undefined||mode===null||Number(mode)===0);}
    function uiText(value){if(ui)ui.status.textContent=value;}
    function show(){
      if(!ui)return;
      ui.auto.checked=state.wantedAuto;ui.camera.checked=state.wantedThirdPerson;ui.wallrun.checked=state.wantedWallrun;ui.timeMode.checked=state.wantedTimeToggle;const enabled=state.ready&&standalone();ui.clear.disabled=!enabled;ui.camera.disabled=!enabled||state.actualThirdPerson===null;ui.wallrun.disabled=!enabled||state.actualWallrun===null;ui.time.disabled=!enabled||state.timeNative!==true;ui.timeMode.disabled=!enabled||state.timeNative!==true;ui.time.setAttribute('aria-pressed',String(state.timeActive===true));ui.time.textContent=state.timeActive?'TIME · ON':'TIME';
      if(!state.ready||!standalone()){uiText(state.telemetry?.standalone==='0'?'Single-player matches only.':'Waiting for a single-player match.');return;}
      const target=state.telemetry?.target;
      if(target&&target!=='None')uiText((state.telemetry.manual==='1'?'Enemy selected.':'Tracking visible enemy.'));
      else uiText(state.wantedAuto?'Full auto aim is on. Double-tap an enemy to select it.':'Automatic acquisition is off. Double-tap an enemy to select it.');
    }
    function ingest(line){
      scope.__collectionTransferTelemetry?.observeLog?.(String(line));
      if(/^\s*(?:Log:\s*)?Browse:|^\s*Init:\s*LoadMap:/.test(String(line))){state.ready=false;state.actualAuto=null;state.actualThirdPerson=null;state.actualWallrun=null;state.timeToggle=null;state.timeActive=null;state.timeNative=null;state.telemetry=null;state.epoch++;configPending.clear();taps.reset();show();}
      const status=parseTelemetry(line);if(!status)return false;
      state.telemetry=status;state.ready=status.standalone==='1';
      if(status.preferredThird==='1'||status.preferredThird==='0')status.thirdperson=status.preferredThird;
      for(const [key,field]of [['auto','actualAuto'],['thirdperson','actualThirdPerson'],['wallrun','actualWallrun'],['timeToggle','timeToggle'],['timeActive','timeActive'],['timeNative','timeNative']])if(status[key]==='1'||status[key]==='0')state[field]=status[key]==='1';
      show();applySettings();return true;
    }
    function send(command,kind='status'){
      if(destroyed||!state.ready||!standalone()||typeof scope.ueExecResult!=='function')return Promise.resolve(false);
      if(queued>=6){state.lastError='Please wait for the current aim command.';return Promise.resolve(false);}
      const epoch=state.epoch;queued++;
      const task=async()=>{
        try{
          if(destroyed||epoch!==state.epoch||!state.ready||!standalone())return false;
          const wait=Math.max(0,options.commandGapMs-(scope.performance.now()-lastCommandAt));
          if(wait)await new Promise(resolve=>scope.setTimeout(resolve,wait));
          lastCommandAt=scope.performance.now();state.lastCommand=command;state.commands++;
          const result=await scope.ueExecResult(command,4000);
          if(result?.output)for(const line of String(result.output).split(/\r?\n/))ingest(line);
          if(!result?.ok){state.lastError='Aim controls are not ready yet.';uiText(kind==='select'?'Wait for the match, then double-tap again.':'Aim setting not confirmed. Try after the match is ready.');return false;}
          state.lastError=null;return true;
        }catch{state.lastError='Aim controls are not ready yet.';uiText('Aim controls are not ready yet.');return false;}
        finally{queued--;}
      };
      const result=queue.then(task,task);queue=result.catch(()=>{});return result;
    }
    function applySettings(){
      if(!state.ready||!standalone())return;
      for(const setting of [
        ['auto','wantedAuto','actualAuto','mutate mmAim auto '],
        ['camera','wantedThirdPerson','actualThirdPerson','mutate mmMatrix camera '],
        ['wallrun','wantedWallrun','actualWallrun','mutate mmMatrix wallrun ']
      ]){
        const [key,wanted,actual,prefix]=setting;
        if(state[actual]===null||state[actual]===state[wanted]||configPending.has(key))continue;
        const token={value:state[wanted],epoch:state.epoch};configPending.set(key,token);
        send(prefix+(token.value?'on':'off'),'setting').finally(()=>{if(configPending.get(key)!==token)return;configPending.delete(key);if(state.epoch===token.epoch&&state[wanted]!==token.value)applySettings();});
      }
      if(state.timeNative===true&&state.timeToggle!==null&&state.timeToggle!==state.wantedTimeToggle&&!configPending.has('timeMode')){
        const token={value:state.wantedTimeToggle,epoch:state.epoch};configPending.set('timeMode',token);
        send('mutate mmMatrix time mode '+(token.value?'toggle':'hold'),'setting').finally(()=>{if(configPending.get('timeMode')!==token)return;configPending.delete('timeMode');if(state.epoch===token.epoch&&state.wantedTimeToggle!==token.value)applySettings();});
      }
    }
    function toggleTime(){
      const now=scope.performance.now();if(now-lastTimeToggle<300||!state.ready||!standalone()||state.timeNative!==true)return Promise.resolve(false);
      lastTimeToggle=now;return send('mutate mmMatrix time toggle','time');
    }
    function point(event){
      const c=canvas();if(!c)return null;
      return viewportPoint({rect:c.getBoundingClientRect(),width:c.width,height:c.height,offsetWidth:c.offsetWidth,offsetHeight:c.offsetHeight,style:scope.getComputedStyle(c)},event.clientX,event.clientY,doc.pointerLockElement===c&&event.pointerType!=='touch'&&event.pointerType!=='pen');
    }
    function inside(node,x,y){const r=node.getBoundingClientRect();return r.width>0&&r.height>0&&x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom&&scope.getComputedStyle(node).visibility!=='hidden';}
    function allowed(event,checkControls=true){
      const c=canvas(),target=event.target;if(!c||!target?.closest||target.closest('[data-private-aim-ui]'))return false;
      if(target.closest('button,input,select,textarea,a,[role="button"],[data-control],[data-stick],.tp-stick-knob'))return false;
      const direct=target===c||event.composedPath?.().includes(c);
      const zone=target.closest('.tp-zone[data-zone="look"],.tp-zone[data-zone="move"]');
      if(!direct&&!zone)return false;
      if(checkControls&&!(doc.pointerLockElement===c&&!['touch','pen'].includes(event.pointerType))){
        for(const control of doc.querySelectorAll('#touch-gamepad-overlay [data-control],#touch-gamepad-overlay [data-stick],#touch-gamepad-overlay .tp-stick-knob')){
          // The upstream stick rings/knobs are visual guides, not hit targets.
          // Actual interactive buttons/sticks keep their exclusion hitboxes.
          if(scope.getComputedStyle(control).pointerEvents==='none')continue;
          if(inside(control,event.clientX,event.clientY))return false;
        }
      }
      return !!point(event);
    }
    function select(p){
      const now=scope.performance.now();if(now-lastSelect<250||!state.ready||!standalone()||scope.Module?.playerState?.guiActive)return false;
      lastSelect=now;state.selectedAt=now;
      try{canvas()?.focus({preventScroll:true});}catch{}
      send(selectCommand(p),'select');return true;
    }
    function down(event){
      if(!['touch','pen'].includes(event.pointerType)||event.button!==0||!allowed(event))return;
      const p=point(event);pending.set(event.pointerId,event.pointerType);taps.down(event.pointerId,p,scope.performance.now());lastTouch=scope.performance.now();
    }
    function move(event){if(pending.has(event.pointerId))taps.move(event.pointerId,point(event));}
    function up(event){
      const type=pending.get(event.pointerId);if(!type)return;pending.delete(event.pointerId);lastTouch=scope.performance.now();
      // A valid down owns this gesture. Pointer capture can retarget up to the
      // overlay root, so do not require the original canvas/zone ancestry again.
      let blocked=!!event.target?.closest?.('[data-private-aim-ui],button,input,select,textarea,a,[role="button"],[data-control],[data-stick],.tp-stick-knob');
      if(!blocked)for(const control of doc.querySelectorAll('[data-private-aim-ui],#touch-gamepad-overlay [data-control]'))if(inside(control,event.clientX,event.clientY)){blocked=true;break;}
      const p=blocked?null:point(event);const selected=taps.up(event.pointerId,p,scope.performance.now(),type);if(selected)select(selected);
    }
    function cancel(event){pending.delete(event.pointerId);taps.cancel(event.pointerId);}
    function doubleClick(event){if(event.button!==0||event.sourceCapabilities?.firesTouchEvents||scope.performance.now()-lastTouch<700||!allowed(event))return;select(point(event));}
    const listeners=[['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',cancel],['lostpointercapture',cancel],['dblclick',doubleClick]];
    for(const[type,handler]of listeners)doc.addEventListener(type,handler,{capture:true,passive:true});
    let ui=null;
    function mount(){
      if(!doc.body||ui)return;
      const panel=doc.createElement('details');panel.setAttribute('data-private-aim-ui','');panel.id='private-aim-settings';
      panel.style.cssText='position:fixed;top:8px;left:8px;z-index:2147483646;max-width:min(320px,calc(100vw - 90px));background:#15191fee;color:#e8edf4;border:1px solid #697483;border-radius:7px;padding:8px;font:14px system-ui;touch-action:manipulation';
      const summary=doc.createElement('summary');summary.textContent='Matrix settings';summary.style.cursor='pointer';panel.appendChild(summary);
      const check=(id,text)=>{const label=doc.createElement('label');label.style.cssText='display:block;padding:8px 0';const input=doc.createElement('input');input.type='checkbox';input.checked=true;input.id=id;label.append(input,doc.createTextNode(' '+text));panel.appendChild(label);return input;};
      const checkbox=check('private-aim-auto','Full auto aim (single-player bots)');
      const camera=check('private-matrix-camera','Third-person camera');
      const wallrun=check('private-matrix-wallrun','Automatic wallrun (jump + move near a wall)');
      const timeMode=check('private-matrix-time-mode','Toggle bullet time with Y');
      const clear=doc.createElement('button');clear.type='button';clear.textContent='Clear selected enemy';clear.disabled=true;clear.style.cssText='font:inherit;padding:6px';panel.appendChild(clear);
      const help=doc.createElement('p');help.textContent='Y follows the option above; TIME always toggles bullet time. Double-tap an enemy to select it.';help.style.cssText='margin:8px 0;line-height:1.4';panel.appendChild(help);
      const status=doc.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.style.cssText='margin:8px 0 0;line-height:1.4';panel.appendChild(status);
      const time=doc.createElement('button');time.type='button';time.id='private-matrix-time';time.setAttribute('data-private-aim-ui','');time.setAttribute('aria-label','Toggle bullet time');time.setAttribute('aria-pressed','false');time.title='Toggle bullet time (Y)';time.textContent='TIME';time.style.cssText='position:fixed;top:8px;left:148px;z-index:2147483646;min-width:60px;padding:8px;background:#15191fee;color:#e8edf4;border:1px solid #697483;border-radius:7px;font:14px system-ui;touch-action:manipulation';
      time.addEventListener('click',toggleTime);
      time.addEventListener('keydown',event=>{if(event.repeat&&(event.key==='Enter'||event.key===' '))event.preventDefault();});
      checkbox.addEventListener('change',()=>{state.wantedAuto=checkbox.checked;show();applySettings();});
      camera.addEventListener('change',()=>{state.wantedThirdPerson=camera.checked;show();applySettings();});
      wallrun.addEventListener('change',()=>{state.wantedWallrun=wallrun.checked;show();applySettings();});
      timeMode.addEventListener('change',()=>{state.wantedTimeToggle=timeMode.checked;show();applySettings();});
      clear.addEventListener('click',()=>send('mutate mmAim clear','clear'));
      doc.body.append(panel,time);ui={panel,auto:checkbox,camera,wallrun,timeMode,time,clear,status};show();
    }
    function tick(){
      if(destroyed)return;mount();
      if(ui){let pad=false;try{pad=!!scope.__ufrontTouchPad?.state?.().visible;}catch{}const top=pad?Math.ceil(.30*Math.min(scope.innerWidth,scope.innerHeight)):8;if(ui.panel.style.top!==top+'px')ui.panel.style.top=top+'px';ui.time.style.top=top+'px';ui.time.style.left=Math.max(8,Math.min(ui.panel.getBoundingClientRect().right+8,scope.innerWidth-ui.time.getBoundingClientRect().width-8))+'px';}
      const module=scope.Module;
      if(module&&typeof module.print==='function'&&(hookedModule!==module||module.print!==hookedPrint)){
        priorPrint=module.print;hookedModule=module;const original=priorPrint;
        hookedPrint=function(...args){const result=original.apply(this,args);ingest(args[0]);return result;};module.print=hookedPrint;
      }

    }
    const timer=scope.setInterval(tick,500);tick();
    const bridge={
      status:()=>({...state,telemetry:state.telemetry?{...state.telemetry}:null,queued}),
      refresh:()=>send('mutate mmAim status'),
      setAuto(value){state.wantedAuto=!!value;show();applySettings();},
      setThirdPerson(value){state.wantedThirdPerson=!!value;show();applySettings();},
      setWallrun(value){state.wantedWallrun=!!value;show();applySettings();},
      setTimeToggle(value){state.wantedTimeToggle=!!value;show();applySettings();},
      toggleTime,
      clear:()=>send('mutate mmAim clear','clear'),
      destroy(){destroyed=true;scope.clearInterval(timer);for(const[type,handler]of listeners)doc.removeEventListener(type,handler,true);if(hookedModule?.print===hookedPrint)hookedModule.print=priorPrint;ui?.panel.remove();ui?.time.remove();taps.reset();pending.clear();configPending.clear();delete scope.__privateAimBridge;}
    };
    scope.__privateAimBridge=bridge;return bridge;
  }
  const api={viewportPoint,selectCommand,parseTelemetry,TapPair,install,DEFAULTS};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else {global.PrivateAimBridge=api;if(global.document)install(global);}
})(typeof window!=='undefined'?window:globalThis);
