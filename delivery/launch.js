const $=id=>document.getElementById(id);
const release='https://unreal-archive-files-eu.s3.de.io.cloud.ovh.net/Unreal%20Tournament%202004/Mutators/M/f/d/ed10fc/MonkeyMatrixMoves2004_v130_selfextractor.exe';
let current=null;
function status(msg){$('status').textContent=msg;}
function mapsFor(info) {
  const maps=Object.keys(info.sizes).filter(p=>/^Maps\/[^/]+\.ut2$/i.test(p)).map(p=>p.slice(5,-4)).sort();
  $('map').replaceChildren(...maps.map(name=>new Option(name,name)));
  $('map').value=maps.find(s=>s.toLowerCase()==='dm-rankin')||maps[0];
  $('game-info').textContent=info.count+' files · '+maps.length+' maps';
  $('mode').onchange();
}
function updateMode() {
  const mode=$('mode').value;
  $('custom-fields').hidden=mode!=='custom';
  for (const opt of $('map').options) opt.disabled=mode==='matrix'&&/^(ONS|AS)-/i.test(opt.value);
  if ($('map').selectedOptions[0]?.disabled) $('map').value='DM-Rankin';
}
$('mode').onchange=updateMode;
async function selectGame(read,handle) {
  $('start').disabled=true;
  try {current=await importGame(await read,status,handle); mapsFor(current); status('Full game indexed on this device.');}
  catch(e){status(e.message);}
  finally{$('start').disabled=false;}
}
$('choose').onclick=async ()=>{
  if (!window.showDirectoryPicker) return $('folder').click();
  try {
    const handle=await showDirectoryPicker({id:'ut2k4',mode:'read'});
    await selectGame(fromDirectory(handle),handle);
  } catch(e){if(e.name!=='AbortError') {$('folder').click();}}
};
$('folder').onchange=()=>selectGame(fromSelection($('folder').files));
async function matrixFiles() {
  let archive=await mediaGet('matrix-release');
  if (!archive) {
    status('Fetching the original mutator from Unreal Archive…');
    const response=await fetch(release);
    if (!response.ok) throw Error('The mutator mirror returned HTTP '+response.status);
    archive=await response.blob();
    if (await sha256(archive)!=='03f1d4fa6fe07feb3704e019cbec93db120172497ebb3755e8c7ead7a724bd96') throw Error('Mutator checksum mismatch.');
    await mediaSave([['matrix-release',archive]]);
  }
  const response=await fetch('matrix-index.json'); if(!response.ok) throw Error('Missing mutator index.');
  const out=[];
  for (const [path,[offset,length,size]] of Object.entries(await response.json())) {
    const bytes=archive.slice(offset,offset+length);
    const blob=await new Response(bytes.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
    if(blob.size!==size) throw Error('Unexpected mutator file length.');
    out.push([path,blob]);
  }
  return out;
}
function customFiles(){
  const classes=$('classes').value.trim().split(',').map(s=>s.trim());
  if(classes.some(c=>!/^\w+\.\w+$/.test(c))) throw Error('Enter the UnrealScript Package.Class for each mutator.');
  const dirs={u:'System',ucl:'System',int:'System',ini:'System',utx:'Textures',ukx:'Animations',usx:'StaticMeshes',uax:'Sounds',ogg:'Music'};
  const files=Array.from($('packages').files,f=>{
    const dir=dirs[f.name.split('.').pop().toLowerCase()];
    if(!dir||!/^[-\w. ]+$/.test(f.name)) throw Error('Unsupported package filename: '+f.name);
    return [dir+'/'+f.name,f];
  });
  const paths=new Set([...Object.keys(current.sizes),...files.map(v=>v[0])].map(v=>v.toLowerCase()));
  if(classes.some(c=>!paths.has('system/'+c.split('.')[0].toLowerCase()+'.u'))) throw Error('A mutator script package is missing.');
  return {files,classes:classes.join(',')};
}
$('setup').onsubmit=async e=>{
  e.preventDefault();
  if (!current) return status('Choose your full UT2004 game folder first.');
  $('start').disabled=true;
  try {
    if (current.handle && await current.handle.requestPermission({mode:'read'})!=='granted') throw Error('Folder access is needed to load game assets.');
    if(!navigator.serviceWorker) throw Error('This browser needs HTTPS and service workers to run the full game.');
    await navigator.serviceWorker.register('sw.js',{scope:'./',updateViaCache:'none'}); await navigator.serviceWorker.ready;
    if($('client').files.length) await importNativeClient($('client').files[0],status);
    if(!await nativeClientReady() && !current.runtime && current.client) {
      status('Loading the verified native engine from your stream…');
      const response=await fetch(current.client,{credentials:'omit'});
      if(!response.ok) throw Error('Could not fetch the web client from the selected stream.');
      await importNativeClient(await response.blob(),status);
    }
    if(!current.runtime && !await nativeClientReady()) throw Error('Select the downloaded v0.2.0 web client archive.');
    $('client-info').textContent=current.runtime?'v0.2.0 stream connected':'v0.2.0 verified';
    const id=crypto.randomUUID(), mode=$('mode').value, extra={}, entries=[];
    const url=new URL('native/'+id+'/index.html',location.href);
    url.search=new URLSearchParams({interactive:'1',map:$('map').value,power:$('power').value});
    if($('resolution').value!=='auto') url.searchParams.set('res',$('resolution').value);
    const touch=$('touch').value; if(touch!=='auto') url.searchParams.set('touch',touch);
    let files=[];
    if(mode==='matrix') {
      files=await matrixFiles();
      for (const name of ['MatrixModern.u','MatrixModern.ucl']) {
        const r=await fetch('compat/'+name);
        if (!r.ok) throw Error('The Matrix compatibility package is missing.');
        files.push(['System/'+name,await r.blob()]);
      }
      url.searchParams.set('mutator','Matrix2004_v130.MutMonkeyMatrixMoves,MatrixModern.MutMatrixModern');
    } else if(mode==='custom'){
      const added=customFiles();files=added.files;url.searchParams.set('mutator',added.classes);
    }
    const original=new Map(Object.keys(current.sizes).map(p=>[p.toLowerCase(),p]));
    for(const [path,blob] of files){
      const lower=path.toLowerCase(), name=original.get(lower)||path;
      if(Object.hasOwn(extra,name)) throw Error('Duplicate package: '+path);
      extra[name]=blob.size;entries.push(['overlay/'+id+'/'+lower,blob]);
    }
    await mediaSave([...entries,['profile/'+id,{base:current.id,remote:current.remote,runtime:current.runtime,extra}]]);
    localStorage.setItem('ut2k4-last-session',JSON.stringify({url:url.href,base:current.id,mode,map:$('map').value}));
    status('Starting '+$('map').value+'…');location.assign(url);
  }catch(err){status(err.message||String(err));$('start').disabled=false;}
};
$('connect-stream').onclick=async()=>{
  try{status('Reading the full-game stream index…'); current=await openStream($('stream-url').value);mapsFor(current);status('Stream connected. Packages load as the engine reads them.');}
  catch(e){status(e.message);}
};
(async()=>{
  try {
    if(await nativeClientReady()) $('client-info').textContent='v0.2.0 verified on this device';
    current=await mediaGet('current-game');
    const q=new URLSearchParams(location.search);
    if(q.get('source') && q.get('source')!==current?.source) {
      status('Connecting to the full-game stream…');
      current=await openStream(q.get('source'));
    }
    if (!current && !q.has('setup') && !q.has('source')) {
      const local='http://127.0.0.1:8789/manifest.json';
      $('stream-url').value=local;
      status('Looking for the UT2K4 stream on this device…');
      try { current=await openStream(local); }
      catch { status('Choose your full game folder or connect an asset stream below.'); }
    }
    if(current) mapsFor(current);
    if(q.has('setup')) return;
    if(current?.handle && await current.handle.queryPermission({mode:'read'})!=='granted') {
      status('Press Play to grant this browser access to the saved game folder.');return;
    }
    const last=JSON.parse(localStorage.getItem('ut2k4-last-session')||'null');
    if(last && current && last.base===current.id && (current.runtime || await nativeClientReady())) {
      const url=new URL(last.url);
      if(url.origin===location.origin && url.pathname.startsWith(new URL('native/',location.href).pathname)){
        await navigator.serviceWorker.register('sw.js',{scope:'./',updateViaCache:'none'});await navigator.serviceWorker.ready;
        location.replace(url);return;
      }
    }
    if(current && (current.runtime || current.client || await nativeClientReady())) $('setup').requestSubmit();
  }catch(e){status('Could not resume the game. Check source access and allow local network access for a stream on this computer. '+e.message);}
})();
