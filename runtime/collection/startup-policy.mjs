// Menu-first, session-only settings through the source launcher's normal controls.
export const LOW_MEMORY_ARGS = [
 '-ini:System:[SDL2Drv.SDL2Client]:TextureDetailWorld=Low',
 '-ini:System:[SDL2Drv.SDL2Client]:TextureDetailTerrain=Low',
 '-ini:System:[SDL2Drv.SDL2Client]:TextureDetailPlayerSkin=Low',
 '-ini:System:[SDL2Drv.SDL2Client]:TextureDetailWeaponSkin=Low',
 '-ini:System:[SDL2Drv.SDL2Client]:TextureDetailRenderMap=Low',
 '-ini:System:[SDL2Drv.SDL2Client]:TextureDetailLightmap=Low',
 '-ini:System:[SDL2Drv.SDL2Client]:TextureDetailInterface=Normal',
];
export function menuMutatorArgs(mutators){
 if(!Array.isArray(mutators)||!mutators.length||!mutators.every(x=>/^[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*$/.test(x)))throw Error('Invalid native mutator preset');
 const value=[...new Set(mutators)].join(',');
 return ['UT2K4Tab_MutatorSP','UT2K4Tab_MutatorBase'].map(name=>'-ini:User:[GUI2K4.'+name+']:LastActiveMutators='+value);
}
export function menuLaunch(prior='/v/ut2004/',{bootstrapMutator}={}){
 const u=new URL(prior,'https://placeholder.invalid');
 if(u.origin!=='https://placeholder.invalid'||!u.pathname.startsWith('/v/ut2004/'))throw Error('Invalid menu route');
 u.searchParams.set('map','NoIntro');u.searchParams.delete('Game');u.searchParams.delete('game');u.searchParams.delete('NumBots');for(const name of [...u.searchParams.keys()])if(name.toLowerCase()==='mutator')u.searchParams.delete(name);
 if(bootstrapMutator!==undefined){if(bootstrapMutator!=='MenuProfile.MenuProfileBootstrap')throw Error('Invalid menu bootstrap mutator');u.searchParams.set('Mutator',bootstrapMutator);}
 return u.pathname+u.search;
}
export function installMenuStartup(scope,args){
 if(!scope.document)return;
 const doc=scope.document;let started=false,configured=false;
 scope.__privateStartupPolicy={mode:'menu-first',configured:false,started:false};
 const timer=scope.setInterval(()=>{
  const dialog=doc.getElementById('capability-dialog');
  if(dialog){const rows=Array.from(dialog.querySelectorAll('[data-capability]'));if(rows.length&&rows.every(n=>['indexedDb','opfsSyncAccess'].includes(n.getAttribute('data-capability'))))doc.getElementById('capability-continue')?.click();}
  const button=doc.getElementById('start-btn');
  if(!started&&button&&!button.disabled&&button.getBoundingClientRect().width>0&&scope.ufrontConfig?.launchState?.ready&&!scope.__ufrontLaunch?.started&&!doc.getElementById('capability-dialog')){
   if(!configured&&typeof scope.launchEngine==='function'){const original=scope.launchEngine;scope.launchEngine=function(nativeArgs){const merged=Array.isArray(nativeArgs)?nativeArgs.slice():[];for(const arg of args)if(!merged.includes(arg))merged.push(arg);return original.call(this,merged);};configured=true;scope.__privateStartupPolicy.configured=true;}
   if(args.length&&!configured)return;
   started=true;scope.__privateStartupPolicy.started=true;button.click();scope.clearInterval(timer);
  }
 },250);
}
export function startupClient({lowMemory=true,mutators=[]}={}){const args=[...(lowMemory?LOW_MEMORY_ARGS:[]),...(mutators.length?menuMutatorArgs(mutators):[])];return '('+installMenuStartup.toString()+')(globalThis,'+JSON.stringify(args)+');';}
// Packaging-time alternative when the engine's CLI INI override support is unknown.
// Preserve other keys/comments; replace only the selected keys in the native GUI sections.
export function menuUserIni(source,mutators,{map='DM-Rankin'}={}){
 if(!/^DM-[A-Za-z0-9_-]+$/.test(map))throw Error('Invalid default deathmatch map');
 const value=menuMutatorArgs(mutators)[0].split(':LastActiveMutators=')[1];
 const sections=[['GUI2K4.UT2K4Tab_MutatorSP','LastActiveMutators',value],['GUI2K4.UT2K4Tab_MutatorBase','LastActiveMutators',value],['GUI2K4.UT2K4Tab_MainSP','LastSelectedMap',map]];
 const found=new Set();let active=null;const out=[];
 for(const line of String(source).replace(/\r\n/g,'\n').split('\n')){
  const header=line.match(/^\[([^\]]+)\]\s*$/);
  if(header){active=sections.find(n=>n[0].toLowerCase()===header[1].toLowerCase())||null;out.push(line);if(active){found.add(active[0].toLowerCase());out.push(active[1]+'='+active[2]);}continue;}
  if(active&&line.split('=')[0].trim().toLowerCase()===active[1].toLowerCase())continue;
  out.push(line);
 }
 for(const [name,key,val] of sections)if(!found.has(name.toLowerCase()))out.push('['+name+']',key+'='+val);
 return out.join('\n').replace(/\n*$/,'\n');
}
