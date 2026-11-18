/* Session-scoped display control; fullscreen includes the native touch overlay. */
(function(scope){
  'use strict';
  if(!scope.document)return;
  const doc=scope.document;
  const allowed=scope.location.pathname.startsWith('/v/')||(['127.0.0.1','localhost','[::1]'].includes(scope.location.hostname)&&scope.location.pathname.startsWith('/ut2004/'));
  if(!allowed)return;
  function mount(){
    if(!doc.body||doc.getElementById('game-fullscreen-toggle'))return;
    const button=doc.createElement('button');button.id='game-fullscreen-toggle';button.type='button';button.setAttribute('data-private-aim-ui','');
    button.style.cssText='position:fixed;left:calc(env(safe-area-inset-left,0px) + 10px);bottom:calc(env(safe-area-inset-bottom,0px) + 10px);z-index:2147483646;min-height:44px;padding:10px 14px;border:1px solid #a8bdcf;border-radius:7px;background:#111d29ed;color:#fff;font:600 14px system-ui;touch-action:manipulation;cursor:pointer';
    const status=doc.createElement('span');status.setAttribute('role','status');status.style.cssText='position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)';
    function update(){const active=!!(doc.fullscreenElement||doc.webkitFullscreenElement);button.textContent=active?'Exit fullscreen':'Fullscreen';button.setAttribute('aria-pressed',String(active));button.setAttribute('aria-label',button.textContent);}
    button.addEventListener('click',async()=>{try{if(doc.fullscreenElement||doc.webkitFullscreenElement){const exit=doc.exitFullscreen||doc.webkitExitFullscreen;await exit.call(doc);}else{const root=doc.documentElement;const enter=root.requestFullscreen||root.webkitRequestFullscreen;if(!enter)throw Error('Fullscreen unavailable');await enter.call(root);}status.textContent='';}catch{status.textContent='Fullscreen is unavailable in this browser.';}update();});
    for(const type of ['pointerdown','pointerup','keydown','keyup'])button.addEventListener(type,event=>event.stopPropagation());
    doc.addEventListener('fullscreenchange',update);doc.addEventListener('webkitfullscreenchange',update);doc.body.append(button,status);update();
  }
  if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})(globalThis);
