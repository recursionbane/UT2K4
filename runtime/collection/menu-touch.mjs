export function installMenuTouch(scope){
 const bypass=new WeakSet();let pending=null,menuWorld=true;
 const originalPrint=scope.Module?.print;if(typeof originalPrint==='function')scope.Module.print=function(...args){const m=args.map(String).join(' ').match(/(?:^|\n)(?:Log: )?Browse:\s+([^?\s]+)/);if(m)menuWorld=/^(NoIntro|Index|Entry)(?:\.ut2)?$/i.test(m[1]);return originalPrint.apply(this,args);};
 const menu=()=>{const b=scope.__privateAimBridge?.status?.();return b?.ready?b.telemetry?.guiActive==='1':menuWorld&&scope.Module?.arguments?.some(x=>/^NoIntro(?:\?|$)/i.test(String(x)))===true;};
 // The source virtual pad owns transparent zones even in native menus; hide only
 // that overlay while native GUI owns input so the canvas receives real touches.
 if(scope.document&&scope.setInterval){const style=scope.document.createElement('style');style.textContent='#touch-gamepad-overlay[hidden]{display:none!important}';scope.document.head.appendChild(style);scope.setInterval(()=>{const root=scope.document.getElementById('touch-gamepad-overlay');if(root){const hidden=menu();if(root.hidden!==hidden)root.hidden=hidden;}},100);}
 scope.__privateNativeMenuActive=menu;
 const forward=(event,send)=>{bypass.add(event);try{send(event);}finally{bypass.delete(event);}};
 const flush=()=>{const p=pending;if(!p)return;pending=null;scope.clearTimeout(p.timer);for(const [event,send] of p.queue)forward(event,send);};
 scope.__privateMenuTouch=(event,send)=>{
  if(bypass.has(event))return false;scope.__privateMenuTouchState={type:event.type,menu:menu(),hasPrime:!!scope.__privateMenuPrimeMouse,arg:String(scope.Module?.arguments?.[0]||'')};if(!menu()||!scope.__privateMenuPrimeMouse)return false;
  const canvas=scope.Module?.canvas;if(event.target!==canvas)return false;
  if(event.type==='touchcancel'){if(pending){scope.clearTimeout(pending.timer);pending=null;event.preventDefault();return true;}return false;}
  if(event.touches?.length>1||event.changedTouches?.length!==1){flush();return false;}
  if(event.type==='touchstart'){
   if(pending){flush();return false;}
   const t=event.changedTouches[0],r=canvas.getBoundingClientRect?.()||{left:0,top:0,width:1280,height:900},last=scope.__privateMenuPointer||{x:r.left+r.width/2,y:r.top+r.height/2};
   scope.__privateMenuPrimeMouse({timeStamp:event.timeStamp,screenX:t.screenX,screenY:t.screenY,clientX:t.clientX,clientY:t.clientY,movementX:t.clientX-last.x,movementY:t.clientY-last.y,button:0,buttons:0,ctrlKey:false,shiftKey:false,altKey:false,metaKey:false,preventDefault(){}});
   pending={queue:[[event,send]],timer:scope.setTimeout(flush,80)};event.preventDefault();return true;
  }
  if(pending){pending.queue.push([event,send]);event.preventDefault();return true;}
  return false;
 };
}
function once(s,a,b){if(s.split(a).length!==2)throw Error('Menu touch native callback seam changed');return s.replace(a,b);}
export function patchMenuTouch(loader){
 const installer='/* __privateMenuTouchV1 */\n('+installMenuTouch.toString()+')(globalThis);\n';
 if(loader.includes('__privateMenuTouchV1')){
  const prior=/\/\* __privateMenuTouchV1 \*\/\n[\s\S]*?\)\(globalThis\);\n/;
  if(!prior.test(loader))throw Error('Menu touch installer boundary changed');
  return loader.replace(prior,()=>installer);
 }
 loader=once(loader,'var eventHandler={target,allowsDeferredCalls:eventTypeString!="mousemove"','if(eventTypeString==="mousemove")globalThis.__privateMenuPrimeMouse=mouseEventHandlerFunc;var eventHandler={target,allowsDeferredCalls:eventTypeString!="mousemove"');
 loader=once(loader,'var mouseEventHandlerFunc=e=>{','var mouseEventHandlerFunc=e=>{if(eventTypeString==="mousemove")globalThis.__privateMenuPointer={x:e.clientX,y:e.clientY};');
 loader=once(loader,'var touchEventHandlerFunc=e=>{','var touchEventHandlerFunc=e=>{if(globalThis.__privateMenuTouch?.(e,touchEventHandlerFunc))return;');
 return installer+loader;
}

export function patchMenuTouchFrontend(source){
 const seam='s=a=>{const c=a,u=i.handle(a.type,c.changedTouches);';
 const old='s=a=>{if(globalThis.__privateNativeMenuActive?.())return;const c=a,u=i.handle(a.type,c.changedTouches);';
 const next='s=a=>{if(globalThis.__privateNativeMenuActive?.()){if(a.type==="touchend"||a.type==="touchcancel"){i.handle("touchcancel",a.changedTouches);r.cancel()}return}const c=a,u=i.handle(a.type,c.changedTouches);';
 if(source.includes(next))return source;
 if(source.includes(old))return once(source,old,next);
 return once(source,seam,next);
}
