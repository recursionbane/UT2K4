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
function patchNativeShell(source){
 const setup=`const options = new URLSearchParams(location.search);
const touchRequested = options.get('touch');
const touchPreferred = touchRequested === '1' || (touchRequested !== '0' && (matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0));
const matrixSession = /(?:^|,)Matrix2004_v130\\.MutMonkeyMatrixMoves(?:,|$)/i.test(options.get('mutator') || '');
const inputSelect = document.getElementById('pages-input');
inputSelect.value = touchRequested === '1' ? '1' : touchRequested === '0' ? '0' : 'auto';
inputSelect.onchange = () => { const url = new URL(location.href); if(inputSelect.value==='auto')url.searchParams.delete('touch');else url.searchParams.set('touch',inputSelect.value);location.assign(url); };
document.querySelector('form').onsubmit = event => { event.preventDefault();const url=new URL(location.href);url.searchParams.set('name',document.getElementById('name').value);url.searchParams.delete('connect');url.searchParams.set('interactive','1');location.assign(url); };
const patchSessionUserIni = ${patchNativeUserIni.toString()};`;
 return source.replace(/(["'])(?:\.\.\/|\/)assets\//g,'$1assets/')
 .replace(/dataBaseURL:\s*[^,\n]+/,"dataBaseURL: new URL('data/', location.href).href")
 .replace('<h1>', '<nav><a href="../../">← Game launcher</a> · <label>Input <select id="pages-input" aria-label="Input controls"><option value="auto">Automatic</option><option value="1">Touch</option><option value="0">Mouse and keyboard</option></select></label></nav><h1>')
 .replace('<input type="hidden" name="connect" value="1">','')
 .replace('Join multiplayer</button>','Restart local session</button>')
 .replace(/<p><a href="\?interactive=1&map=DM-Rankin">[\s\S]*?<button id="stop" type="button">Stop client<\/button><\/p>/, '<p><button id="stop" type="button">Stop client</button></p>')
 .replace('const options = new URLSearchParams(location.search);',setup)
 .replace("[options.get('res'), savedResolution, '1280x720']", "[options.get('res'), touchPreferred ? null : savedResolution, touchPreferred ? '640x480' : '1280x720']")
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
 .replace("document.getElementById('status').textContent = 'Loading config files…';", "document.getElementById('status').textContent = 'Loading config files…';\n  if(matrixSession)document.getElementById('input-help').textContent += ' Matrix: B / TIME toggles bullet time (50 adrenaline); C holds hover; C + Space superjumps.';");
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
Object.assign(root,{importNativeClient,nativeClientReady,nativeResponse,patchNativeShell,parseNativeTar,patchNativeUserIni});
if(typeof module!=='undefined'&&module.exports)module.exports={parseNativeTar,patchNativeShell,patchNativeUserIni,hashes};
})(typeof self!=='undefined'?self:globalThis);
