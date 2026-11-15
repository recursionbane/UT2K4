function captureSafe(target,id,lock){
 if(!target?.isConnected||!Number.isInteger(id)||id<0)return false;
 try{if(lock)target.setPointerCapture(id);else target.releasePointerCapture(id);return true;}
 catch(error){if(error instanceof DOMException&&(error.name==='InvalidStateError'||error.name==='NotFoundError'))return false;throw error;}
}
export {captureSafe as safePointerCapture};
function watchHidden(target,cancel){
 const root=target.closest?.('#touch-gamepad-overlay');if(!root||typeof MutationObserver==='undefined')return()=>{};
 let record=__privatePadObservers.get(root);
 if(!record){record={callbacks:new Set(),hidden:false};record.observer=new MutationObserver(()=>{const hidden=root.hidden||root.style.display==='none';if(hidden&&!record.hidden)for(const reset of record.callbacks)reset();record.hidden=hidden;});record.observer.observe(root,{attributes:true,attributeFilter:['style','hidden']});__privatePadObservers.set(root,record);}
 record.callbacks.add(cancel);return()=>{record.callbacks.delete(cancel);if(!record.callbacks.size){record.observer.disconnect();__privatePadObservers.delete(root);}};
}
function once(s,a,b){if(s.split(a).length!==2)throw Error('Virtual pad capture seam changed');return s.replace(a,b);}
export function patchPointerCapture(source){
 if(source.includes('/* __privatePointerCaptureV1 */')){
  if(!source.includes('if(n.lockTargetWhilePressed) t.addEventListener("lostpointercapture", u)'))source=source.replace('t.addEventListener("lostpointercapture", u); if (','if(n.lockTargetWhilePressed) t.addEventListener("lostpointercapture", u); if (');
  if(!source.includes('if(e.lockTargetWhilePressed) e.tapTarget.addEventListener("lostpointercapture", d)'))source=source.replace('e.tapTarget.addEventListener("lostpointercapture", d); e.tapTarget.addEventListener','if(e.lockTargetWhilePressed) e.tapTarget.addEventListener("lostpointercapture", d); e.tapTarget.addEventListener');
  return source;
 }

 source=once(source,'n.lockTargetWhilePressed ? t.setPointerCapture(p2.pointerId) : t.releasePointerCapture(p2.pointerId)','__privateCaptureSafe(t, p2.pointerId, n.lockTargetWhilePressed)');
 source=once(source,'e.lockTargetWhilePressed ? e.tapTarget.setPointerCapture(s.pointerId) : e.tapTarget.releasePointerCapture(s.pointerId)','__privateCaptureSafe(e.tapTarget, s.pointerId, e.lockTargetWhilePressed)');
 source=once(source,'if (t.addEventListener("pointercancel", u), n.type == h.onOff)', 'const hiddenCancel = __privateWatchHidden(t, u); if(n.lockTargetWhilePressed) t.addEventListener("lostpointercapture", u); if (t.addEventListener("pointercancel", u), n.type == h.onOff)');
 const cleanup='t.removeEventListener("pointercancel", u)';if(source.split(cleanup).length!==3)throw Error('Virtual pad button cleanup seam changed');source=source.split(cleanup).join(cleanup+', t.removeEventListener("lostpointercapture", u), hiddenCancel()');
 source=once(source,'e.tapTarget.addEventListener("pointerdown", r2);','const hiddenCancel = __privateWatchHidden(e.tapTarget, () => d({pointerId:o})); if(e.lockTargetWhilePressed) e.tapTarget.addEventListener("lostpointercapture", d); e.tapTarget.addEventListener("pointerdown", r2);');
 source=once(source,'e.tapTarget.removeEventListener("pointerdown", r2), document.removeEventListener','e.tapTarget.removeEventListener("pointerdown", r2), e.tapTarget.removeEventListener("lostpointercapture", d), hiddenCancel(), document.removeEventListener');
 return '/* __privatePointerCaptureV1 */\nconst __privatePadObservers=new WeakMap();\nconst __privateCaptureSafe='+captureSafe.toString()+';\nconst __privateWatchHidden='+watchHidden.toString()+';\n'+source;
}
