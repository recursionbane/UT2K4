/** Count unique active-profile files separately from original recovery transports. */
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
export function auditRuntimeProfile({manifest,readFile,originalManifest=manifest,sizeOf=name=>readFile(name).length}) {
  const files=new Map(),packages=[];
  function include(name,kind){if(!files.has(name))files.set(name,{name,kind,bytes:sizeOf(name)});}
  for(const [logical,entry]of Object.entries(manifest)){
    const row={logical,originalTransportBytes:originalManifest[logical]?.compressedSize??originalManifest[logical]?.size??null,activeFiles:[]};
    if(entry.jit){
      const indexName=entry.path+'.jit.json',container=entry.path+'.jit';
      include(indexName,'package-index');const index=JSON.parse(readFile(indexName));
      include(container,'package-frames');row.activeFiles.push(indexName,container);
      for(const region of index.regions||[]){include(region.encoded.url,'encoded-regions');row.activeFiles.push(region.encoded.url);}
    }else{include(entry.path,'original-or-reencoded-file');row.activeFiles.push(entry.path);}
    row.activeFiles=[...new Set(row.activeFiles)];packages.push(row);
  }
  const categories={};for(const file of files.values()){const c=categories[file.kind]??={files:0,bytes:0};c.files++;c.bytes+=file.bytes;}
  return {basis:'Unique active game-data file lengths before HTTP compression. Excludes shell, original recovery copies, phase-prefetch duplicates and HTTP headers. This is full collection size, not a startup trace.',
    logicalPackages:packages.length,uniqueFiles:files.size,activeBytes:[...files.values()].reduce((n,f)=>n+f.bytes,0),categories,files:[...files.values()],packages};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const args=process.argv.slice(2),get=(k,d)=>{const i=args.indexOf('--'+k);return i<0?d:args[i+1];};
 const overlay=path.resolve(get('overlay','.local-runtime/modern-release-candidate')),base=path.resolve(get('base','.local-runtime/collection/files')),jit=path.resolve(get('jit','.local-runtime/jit'));
 const overlays=args.flatMap((arg,i)=>arg==='--overlay'?[path.resolve(args[i+1])]:[]);
 const roots=[...new Set([overlay,...overlays,base,jit])],resolved=new Map();
 function locate(name){
   if(typeof name!=='string'||path.isAbsolute(name)||name.includes('\\')||name.split('/').some(part=>part==='..'||part==='.'))throw Error('Unsafe profile path');
   if(resolved.has(name))return resolved.get(name);
   for(const root of roots){
     const file=path.join(root,name);
     if(fs.existsSync(file)){resolved.set(name,file);return file;}
   }
   throw Error('Missing profile asset: '+name);
 }
 const cache=new Map();
 function readFile(name){
   if(cache.has(name))return cache.get(name);
   const data=fs.readFileSync(locate(name));
   if(data.length<=8*1024*1024){
     if(cache.size>=4)cache.delete(cache.keys().next().value);
     cache.set(name,data);
   }
   return data;
 }
 const result=auditRuntimeProfile({manifest:JSON.parse(readFile('file-manifest.json')),originalManifest:JSON.parse(fs.readFileSync(path.join(base,'file-manifest.json'))),readFile,sizeOf:name=>fs.statSync(locate(name)).size});
 const filename=path.resolve(get('output',path.join(overlay,'active-profile-audit.json')));fs.writeFileSync(filename,JSON.stringify(result,null,2));console.log(JSON.stringify({logicalPackages:result.logicalPackages,uniqueFiles:result.uniqueFiles,activeBytes:result.activeBytes,categories:result.categories}));
}
