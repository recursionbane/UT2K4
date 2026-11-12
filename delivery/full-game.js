// The engine enumerates these folders with their canonical names on all host OSes.
const gameDirs = new Map('System Maps Textures StaticMeshes Animations Music Sounds KarmaData ForceFeedback Speech'.split(' ').map(v=>[v.toLowerCase(),v]));
function gamePath(path) {
  const parts = path.split('/');
  if (parts.length !== 2 || !gameDirs.has(parts[0].toLowerCase())) return null;
  if (!/\.(?:ut2|utx|usx|ukx|uax|u|ucl|ini|int|upl|ka|ogg|ifr|xml|det|est|frt|itt|kot|tmt)$/i.test(parts[1])) return null;
  return gameDirs.get(parts[0].toLowerCase()) + '/' + parts[1];
}
async function fromDirectory(handle) {
  const entries = [];
  for await (const [dir, sub] of handle.entries()) {
    if (sub.kind !== 'directory' || !gameDirs.has(dir.toLowerCase())) continue;
    for await (const [name, child] of sub.entries()) {
      const path = gamePath(dir+'/'+name);
      if (path && child.kind === 'file') entries.push({path, asset:child});
    }
  }
  return entries;
}
function fromSelection(files) {
  return Array.from(files, file=>({path:gamePath(file.webkitRelativePath.split('/').slice(1).join('/')),asset:file})).filter(v=>v.path);
}
async function importGame(entries, progress, handle) {
  const paths = new Set(entries.map(v=>v.path.toLowerCase()));
  for (const required of ['system/core.u','system/engine.u','maps/dm-rankin.ut2','maps/dm-antalus.ut2']) {
    if (!paths.has(required)) throw Error('Choose the full game folder containing System and Maps. Missing '+required+'.');
  }
  const id = crypto.randomUUID(), sizes = {}, records = [];
  const seen = new Set();
  for (let start=0;start<entries.length;start+=40) {
    const batch = entries.slice(start,start+40);
    await Promise.all(batch.map(async ({path,asset})=>{
      const key=path.toLowerCase();
      if (seen.has(key)) throw Error('Two files have the same game path: '+path);
      seen.add(key);
      const file = asset.kind === 'file' ? await asset.getFile() : asset;
      sizes[path] = file.size;
      records.push(['game/'+id+'/'+key,asset]);
    }));
    progress('Indexing full game · '+Math.min(start+40,entries.length)+' / '+entries.length+' files');
  }
  // The selected dataset becomes visible only after all of its handles or blobs are stored.
  const info = {id, sizes, handle, count:entries.length};
  await mediaSave([...records,['dataset/'+id,sizes],['current-game',info]]);
  return info;
}
async function gameFile(base,path) {
  const item = await mediaGet('game/'+base+'/'+path.toLowerCase());
  return item && item.kind === 'file' ? await item.getFile() : item;
}
