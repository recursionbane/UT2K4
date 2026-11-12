/* Local-only import of rgnv/ut2004-wasm v0.2.0. No engine bytes are bundled.
 * Requires media.js. Used from both launcher and its scoped service worker. */
(function(root){
'use strict';
const hashes={
 'ut2004.js':'95044f404998b03c97bd83177da7bd811040c8811b3a24fd4906c4e7e75b522d',
 'ut2004.wasm':'5480a6b38d0f101689bd25b64f1733a2788321d89b6c4f3d20adfb02f85f6b02',
 'index.html':'9a2a1ea53c2f1fd8491960ab188cb2f793cdc20e3a154425f3bfcfe0feb0061b',
 'worker.js':'46f379c4743756f60da68878ba4b8de3531ac4d65ca900dfa4473ed19e4acdd5',
 'assets/mobile-input.js':'d8a3d12da92ebd4143442ee3cd762041732c6343014848ce1c746bc48bb36bd1',
 'assets/mobile-input.css':'0edf0cd9a35b6e9f308548aac9228cf9a2dba069780830c5b5bed125ec7c7cf2'
};
const text=new TextDecoder();
function field(bytes,a,n){return text.decode(bytes.subarray(a,a+n)).split('\0')[0]}
function parseNativeTar(buffer){
 const bytes=new Uint8Array(buffer),files=new Map();
 for(let at=0;at+512<=bytes.length;){
  const h=bytes.subarray(at,at+512);if(h.every(v=>v===0))break;
  let sum=0;for(let i=0;i<512;i++)sum+=i>=148&&i<156?32:h[i];
  if(sum!==parseInt(field(h,148,8).trim(),8))throw Error('Invalid client archive header.');
  const name=(field(h,345,155)?field(h,345,155)+'/':'')+field(h,0,100),size=parseInt(field(h,124,12).trim()||'0',8),type=field(h,156,1);
  if(!Number.isSafeInteger(size)||size<0||size>100*1024*1024||at+512+size>bytes.length)throw Error('Invalid client archive size.');
  if(name.startsWith('/')||name.split('/').includes('..')||name.includes('\\'))throw Error('Unsafe client archive path.');
  const path=name.replace(/^\.\//,'').replace(/^ut2004-web\//,'');
  if(hashes[path]&&(type==='0'||type==='')){
   if(files.has(path))throw Error('Duplicate client file: '+path);
   files.set(path,new Blob([bytes.slice(at+512,at+512+size)]));
  }
  at+=512+Math.ceil(size/512)*512;
 }
 return files;
}
async function importNativeClient(file,onProgress=()=>{}){
 if(!file||file.size>100*1024*1024)throw Error('Choose the upstream ut2004-web-v0.2.0.tar.gz client archive (under 100 MB).');
 onProgress('Reading the local WebAssembly client…');
 const magic=new Uint8Array(await file.slice(0,2).arrayBuffer());
 const tar=magic[0]===31&&magic[1]===139?await new Response(file.stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer():await file.arrayBuffer();
 if(tar.byteLength>100*1024*1024)throw Error('Client archive expands beyond the supported size.');
 const files=parseNativeTar(tar),entries=[];
 for(const [path,hash]of Object.entries(hashes)){
  const blob=files.get(path);if(!blob)throw Error('Client archive is missing '+path);
  onProgress('Verifying '+path+'…');
  if(await sha256(blob)!==hash)throw Error('Client checksum mismatch: '+path+'. Select the unmodified v0.2.0 release.');
  entries.push(['native-client/'+path,blob]);
 }
 // A single transaction makes a failed import leave the previous client intact.
 await mediaSave([...entries,['native-client-ready',{version:'0.2.0',files:Object.keys(hashes),importedAt:new Date().toISOString()}]]);
 return {version:'0.2.0',files:entries.length};
}
async function nativeClientReady(){return !!(await mediaGet('native-client-ready'))}
function patchNativeUserIni(source,matrix){
 if(!matrix)return source;
 const newline=source.includes('\r\n')?'\r\n':'\n';
 const lines=source.split(/\r?\n/);let inside=false,found=false;
 for(let i=0;i<lines.length;i++){
  if(/^\[/.test(lines[i]))inside=/^\[Engine\.Input\]\s*$/i.test(lines[i]);
  if(inside&&/^B\s*=/i.test(lines[i])){lines[i]='B=slowtimedown';found=true;}
 }
 if(!found){const at=lines.findIndex(line=>/^\[Engine\.Input\]\s*$/i.test(line));
  if(at>=0)lines.splice(at+1,0,'B=slowtimedown');else lines.push('[Engine.Input]','B=slowtimedown');}
 return lines.join(newline);
}
function nativePowerProfile(name,touch){
 const selected=['efficient','balanced','quality'].includes(name)?name:'efficient';
 return {name:selected,fps:selected==='efficient'?30:60,defaultResolution:selected==='quality'?'1280x720':selected==='balanced'&&!touch?'960x540':'640x480',maxPixels:selected==='efficient'?307200:selected==='balanced'?921600:2073600,maxDPR:selected==='quality'?2:1};
}
function nativePixelBudget(width,height,profile){
 const scale=Math.min(1,Math.sqrt(profile.maxPixels/(width*height)));
 let w=Math.max(320,Math.floor(width*scale/2)*2),h=Math.max(240,Math.floor(height*scale/2)*2);
 if(w*h>profile.maxPixels){if(w>=h)w=Math.floor(profile.maxPixels/h/2)*2;else h=Math.floor(profile.maxPixels/w/2)*2;}
 return [w,h];
}
function installNativePowerLoop(profile,requestedFPS){
 const fps=requestedFPS==='native'?0:requestedFPS==='30'?30:requestedFPS==='60'?60:profile.fps;
 let evidence=Module.powerEvidence;
 if(!evidence)evidence=Module.powerEvidence={profile:profile.name,targetFPS:fps||'native',scheduler:'pending',hiddenPolicy:'Browser requestAnimationFrame suspension; existing audio visibility handling'};
 if(!fps){evidence.scheduler='upstream-native';evidence.mainLoopReady=typeof MainLoop!=='undefined'&&!!MainLoop.func;return;}
 if(typeof MainLoop==='undefined'){evidence.scheduler='waiting-for-main-loop';return;}
 if(!MainLoop.pagesPowerCap){
  const nativeRAF=window.requestAnimationFrame.bind(window);let last=-Infinity,sampleStart,sampleCount=0;
  evidence.schedulerCallbacks=0;
  MainLoop.requestAnimationFrame=function(callback){
   const tick=time=>{
    if(document.hidden){sampleStart=undefined;sampleCount=0;nativeRAF(tick);return;}
    if(time-last<1000/fps-.5){nativeRAF(tick);return;}
    last=time;evidence.schedulerCallbacks++;evidence.lastCallbackAt=time;
    if(sampleStart===undefined)sampleStart=time;else sampleCount++;
    if(time-sampleStart>=1000){evidence.observedSchedulerFPS=Math.round(sampleCount*10000/(time-sampleStart))/10;sampleStart=time;sampleCount=0;}
    callback(time);
   };nativeRAF(tick);
  };
  MainLoop.pagesPowerCap=true;
 }
 // postRun can precede creation of the interactive engine main loop. Install
 // the scheduler immediately, then select RAF timing again at the first frame.
 if(MainLoop.func&&typeof _emscripten_set_main_loop_timing==='function'&&!evidence.timingApplied){
  _emscripten_set_main_loop_timing(1,1);evidence.timingApplied=true;
 }
 evidence.scheduler='engine-only-requestAnimationFrame-cap';
 evidence.mainLoopReady=!!MainLoop.func;
}

function nativeGraphicsInfo(){
 let gl=Module.ctx;
 if((!gl||!gl.getParameter)&&typeof GL!=='undefined')gl=GL.currentContext?.GLctx;
 if(!gl||!gl.getParameter)return {api:'WebGL',renderer:'Context not ready; wait for engine startup'};
 const debug=gl.getExtension('WEBGL_debug_renderer_info');
 return {api:gl.getParameter(gl.VERSION),renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),vendor:debug?gl.getParameter(debug.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),resolution:[Module.canvas.width,Module.canvas.height],power:Module.powerEvidence||null};
}
function patchNativeShell(source){
 const setup=`const options = new URLSearchParams(location.search);
const touchRequested = options.get('touch');
const touchPreferred = touchRequested === '1' || (touchRequested !== '0' && (matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0));
const matrixSession = /(?:^|,)Matrix2004_v130\\.MutMonkeyMatrixMoves(?:,|$)/i.test(options.get('mutator') || '');
const getPowerProfile = ${nativePowerProfile.toString()};
const budgetPixels = ${nativePixelBudget.toString()};
const installPowerLoop = ${installNativePowerLoop.toString()};
const readGraphicsInfo = ${nativeGraphicsInfo.toString()};
const powerProfile = getPowerProfile(options.get('power'),touchPreferred);
const powerSelect = document.getElementById('pages-power');
powerSelect.value=powerProfile.name;
powerSelect.onchange=()=>{const url=new URL(location.href);url.searchParams.set('power',powerSelect.value);url.searchParams.delete('res');location.assign(url);};
const fpsSelect=document.getElementById('pages-fps');fpsSelect.value=['30','60','native'].includes(options.get('fps'))?options.get('fps'):String(powerProfile.fps);
fpsSelect.onchange=()=>{const url=new URL(location.href);url.searchParams.set('fps',fpsSelect.value);location.assign(url);};
document.getElementById('pages-graphics').onclick=()=>{document.getElementById('pages-gpu').textContent=JSON.stringify(readGraphicsInfo(),null,2);};
const inputSelect = document.getElementById('pages-input');
inputSelect.value = touchRequested === '1' ? '1' : touchRequested === '0' ? '0' : 'auto';
inputSelect.onchange = () => { const url = new URL(location.href); if(inputSelect.value==='auto')url.searchParams.delete('touch');else url.searchParams.set('touch',inputSelect.value);location.assign(url); };
document.querySelector('form').onsubmit = event => { event.preventDefault();const url=new URL(location.href);url.searchParams.set('name',document.getElementById('name').value);url.searchParams.delete('connect');url.searchParams.set('interactive','1');location.assign(url); };
const patchSessionUserIni = ${patchNativeUserIni.toString()};`;
 return source.replace(/(["'])(?:\.\.\/|\/)assets\//g,'$1assets/')
 .replace(/dataBaseURL:\s*[^,\n]+/,"dataBaseURL: new URL('data/', location.href).href")
 .replace('<h1>', '<nav><a href="../../?setup=1">← Game launcher</a> · <label>Input <select id="pages-input" aria-label="Input controls"><option value="auto">Automatic</option><option value="1">Touch</option><option value="0">Mouse and keyboard</option></select></label> · <label>Power <select id="pages-power"><option value="efficient">Efficient</option><option value="balanced">Balanced</option><option value="quality">Quality</option></select></label> · <label>Frame cap <select id="pages-fps"><option value="30">30</option><option value="60">60</option><option value="native">Native</option></select></label> <button id="pages-graphics" type="button">Graphics info</button><pre id="pages-gpu" role="status"></pre></nav><h1>')
 .replace('<input type="hidden" name="connect" value="1">','')
 .replace('Join multiplayer</button>','Restart local session</button>')
 .replace(/<p><a href="\?interactive=1&map=DM-Rankin">[\s\S]*?<button id="stop" type="button">Stop client<\/button><\/p>/, '<p><button id="stop" type="button">Stop client</button></p>')
 .replace('const options = new URLSearchParams(location.search);',setup)
 .replace("[options.get('res'), savedResolution, '1280x720']", "[options.get('res'), powerProfile.defaultResolution]")
 .replace("const initialSize = activeResolution === 'dynamic' ? dynamicSize() : activeResolution.split('x').map(Number);", "const initialSize = budgetPixels(...(activeResolution === 'dynamic' ? dynamicSize() : activeResolution.split('x').map(Number)),powerProfile);")
 .replace("const [width, height] = value === 'dynamic' ? dynamicSize() : value.split('x').map(Number);", "const [width,height] = budgetPixels(...(value === 'dynamic' ? dynamicSize() : value.split('x').map(Number)),powerProfile);")
 .replace(/innerWidth \* devicePixelRatio/g,'innerWidth * Math.min(devicePixelRatio,powerProfile.maxDPR)')
 .replace(/innerHeight \* devicePixelRatio/g,'innerHeight * Math.min(devicePixelRatio,powerProfile.maxDPR)')
 .replace('++Module.frameCount;', "if(!Module.powerEvidence?.mainLoopReady)installPowerLoop(powerProfile,options.get('fps')); ++Module.frameCount;")
 .replace('configFiles: {}', "postRun: [() => installPowerLoop(powerProfile,options.get('fps'))], configFiles: {}")
 .replace(/const defaultJoin = [^;]+;/,'const defaultJoin = false;')
 .replace("interactive: defaultJoin || options.has('interactive') || options.has('map'),", "interactive: !options.has('bounded'),")
 .replace("connect: defaultJoin || options.has('connect'),", "connect: options.has('connect'),")
 .replace("Module.localMap = !Module.connect && !!requestedMap;", "Module.localMap = !Module.connect && !Module.splash;")
 .replace('Module.gameClass = Module.localMap ? requestedGame : null;', `Module.gameClass = Module.localMap ? requestedGame : null;
  const importedMutators = (options.get('mutator') || '').split(',').filter(Boolean);
  if (importedMutators.length && importedMutators.every(value => /^[a-z_]\\w*\\.[a-z_]\\w*$/i.test(value))) {
    Module.map += '?Mutator=' + importedMutators.join(',');
  }`)
 .replace('window.mobileInput = MobileInput.attach(mobileConfig);', `mobileConfig.force = touchRequested === '1' ? 'on' : touchRequested === '0' ? 'off' : undefined;
if(matrixSession){mobileConfig.binds.bullet='KeyB';mobileConfig.touch.buttons.push({id:'bullet',label:'TIME'});mobileConfig.touch.buttons.find(button=>button.id==='crouch').label='HOVER';}
window.mobileInput = MobileInput.attach(mobileConfig);
Module.canvas.addEventListener('pointerdown', () => Module.canvas.focus({preventScroll:true}));
Module.canvas.focus({preventScroll:true});`)
 .replace('bytes = new TextEncoder().encode(text);', `bytes = new TextEncoder().encode(/(?:^|\\/)System\\/(?:DefUser|User)\\.ini$/i.test('/'+path) ? patchSessionUserIni(text,matrixSession) : text);`)
 .replace('Tab opens console.', 'Tab opens chat. Tilde opens console.')
 .replace("document.getElementById('status').textContent = 'Loading config files…';", "document.getElementById('status').textContent = 'Loading config files…';\n  if(matrixSession)document.getElementById('input-help').textContent += ' Matrix: B / TIME toggles bullet time (75 adrenaline by default; configurable); C holds hover; C + Space superjumps.';");
}

async function nativeResponse(request,scope){
 const url=new URL(request.url),base=new URL(scope);
 if(url.origin!==base.origin||!url.pathname.startsWith(base.pathname))return null;
 const relative=url.pathname.slice(base.pathname.length),match=/^native\/([a-zA-Z0-9_-]+)\/(.*)$/.exec(relative);
 if(!match||!['GET','HEAD'].includes(request.method))return null;
 let path=match[2]||'index.html';if(path==='files.json'||path==='file-sizes.json'||path.startsWith('data/'))return null;
 if(!hashes[path])return null;
 let blob=await mediaGet('native-client/'+path);
 if(!blob)return new Response('Import the local v0.2.0 WebAssembly client in the launcher first.',{status:404});
 if(path==='index.html')blob=new Blob([patchNativeShell(await blob.text())]);
 const mime=path.endsWith('.wasm')?'application/wasm':path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html';
 const headers=new Headers({'Content-Type':mime,'Cache-Control':'no-store','Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Resource-Policy':'same-origin','Accept-Ranges':'bytes'});
 let start=0,end=blob.size-1,status=200;
 if(request.headers.has('Range')){
  const m=/^bytes=(\d+)-(\d*)$/.exec(request.headers.get('Range'));
  if(!m||+m[1]>=blob.size)return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+blob.size}});
  start=+m[1];end=m[2]?Math.min(+m[2],end):end;
  if(end<start)return new Response(null,{status:416});status=206;headers.set('Content-Range',`bytes ${start}-${end}/${blob.size}`);
 }
 headers.set('Content-Length',String(end-start+1));
 return new Response(request.method==='HEAD'?null:blob.slice(start,end+1),{status,headers});
}
Object.assign(root,{importNativeClient,nativeClientReady,nativeResponse,patchNativeShell,parseNativeTar,patchNativeUserIni,nativePowerProfile,nativePixelBudget,installNativePowerLoop,nativeGraphicsInfo});
if(typeof module!=='undefined'&&module.exports)module.exports={parseNativeTar,patchNativeShell,patchNativeUserIni,nativePowerProfile,nativePixelBudget,installNativePowerLoop,nativeGraphicsInfo,hashes};
})(typeof self!=='undefined'?self:globalThis);
