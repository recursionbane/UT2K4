// Cook a user-supplied, verified transport snapshot into an independent overlay.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {cookMeshLod} from './cook-browser-mesh-lod.mjs';
import {buildRawPackage,decodePackageFrames,DEFAULT_POLICY} from '../runtime/collection/jit-packages.mjs';
import {readUe2Package} from '../runtime/collection/ue2-texture-layout.mjs';
import {readUe2StaticMeshLayout} from '../runtime/collection/ue2-mesh-layout.mjs';
import {compactSourceTriangles} from '../runtime/collection/ue2-mesh-source-triangles.mjs';
import {cookAnimation} from './cook-browser-animation.mjs';

const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const zstdOptions = {params:{[zlib.constants.ZSTD_c_compressionLevel]:15}};

function read(roots, name) {
  if(path.isAbsolute(name)||name.split(/[\\/]/).includes('..'))throw Error('Invalid package path');
  const p = roots.map(root=>path.join(root,name)).find(f=>fs.existsSync(f));
  if(!p)throw Error('Missing '+name);
  return fs.readFileSync(p);
}
function write(root, name, bytes) {
  const p=path.join(root,name);
  fs.mkdirSync(path.dirname(p),{recursive:true});
  fs.writeFileSync(p+'.part',bytes);fs.renameSync(p+'.part',p);
}

export async function buildBrowserGeometry({roots,output,logical,entry,simplifier=null}) {
  const indexBytes=entry.jit?read(roots,entry.path+'.jit.json'):null;
  const index=indexBytes?JSON.parse(indexBytes):null;
  const old=read(roots,entry.path+(index?'.jit':''));
  const raw=index?decodePackageFrames(index,old):zlib.zstdDecompressSync(old);
  if(raw.length!==entry.size)throw Error('Native size mismatch');
  const currentBytes=old.length+(indexBytes?.length||0);
  const receipt={logical,sourcePath:entry.path,currentBytes,selectedBytes:currentBytes,accepted:false,unsupported:[],sourcePackageSha256:sha(old),sourceIndexSha256:indexBytes?sha(indexBytes):null};
  const pkg=readUe2Package(raw),types=new Set(pkg.exports.map(e=>pkg.object(e.classIndex)?.name));
  if(!types.has('StaticMesh')&&!types.has('MeshAnimation'))return receipt;
  const derived=Buffer.from(raw), edits=[];
  if(types.has('StaticMesh')){
    let layout;
    try{layout=readUe2StaticMeshLayout(raw);}catch(e){receipt.unsupported.push(e.message);}
    for(const mesh of layout?.meshes||[]){
      let change;
      try{change=compactSourceTriangles(raw,mesh,pkg.version,pkg.licensee,derived);}catch(e){
        if(!receipt.unsupported.includes(e.message))receipt.unsupported.push(e.message);
        continue;
      }
      if(change.attributes){edits.push(change);receipt.sourceTriangles=(receipt.sourceTriangles||0)+change.triangles;}
      if(simplifier && !change.legacy) {
        const lod=cookMeshLod(raw,derived,mesh,simplifier);
        if(lod.changed) {
          receipt.oldRenderFaces=(receipt.oldRenderFaces||0)+lod.oldFaces;
          receipt.newRenderFaces=(receipt.newRenderFaces||0)+lod.newFaces;
          edits.push({offset:mesh.exportOffset,length:mesh.exportLength});
        }
      }

    }
  }
  if(types.has('MeshAnimation')){
    // Keep other accepted edits if an unfamiliar animation layout is encountered.
    const trial=Buffer.from(derived);
    try {
      const result=cookAnimation(raw,trial);
      if(result.changes.length){for(const span of result.changes){trial.copy(derived,span.offset,span.offset,span.offset+span.length);edits.push(span);}receipt.removedKeys=result.removedKeys;}
    } catch(e){receipt.unsupported.push(e.message);}
  }
  if(!edits.length||raw.equals(derived))return receipt;
  for(const edit of edits)if(index?.regions?.some(r=>r.offset<edit.offset+edit.length&&edit.offset<r.offset+r.length))throw Error('Geometry edit overlaps active codec payload');
  const names=index?[entry.path+'.jit',entry.path+'.jit.json']:[entry.path];
  if(index){
    const built=await buildRawPackage({logical,entry,raw:derived,output,policy:{...DEFAULT_POLICY,blockSize:index.blockSize,level:index.level},base:{index,container:old}});
    const next=JSON.parse(fs.readFileSync(path.join(output,built.index)));
    if(index.regions)next.regions=index.regions;
    const serialized=Buffer.from(JSON.stringify(next));
    if(serialized.length>4*1024*1024)throw Error('Geometry index too large');
    receipt.candidateBytes=serialized.length+built.containerSize;
    write(output,built.index,serialized);
  } else {
    const encoded=zlib.zstdCompressSync(derived,zstdOptions);
    if(!zlib.zstdDecompressSync(encoded).equals(derived))throw Error('Whole-file round trip failed');
    receipt.candidateBytes=encoded.length;write(output,entry.path,encoded);
  }
  if(receipt.candidateBytes>=currentBytes){
    for(const name of names)fs.rmSync(path.join(output,name),{force:true});
    return receipt;
  }
  receipt.accepted=true;receipt.selectedBytes=receipt.candidateBytes;
  receipt.outputs=names.map(name=>{const bytes=fs.readFileSync(path.join(output,name));return{name,size:bytes.length,sha256:sha(bytes)};});
  return receipt;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [base,output,shardText='0',shardsText='1',...fallback]=process.argv.slice(2);
  if(!base||!output)throw Error('Usage: node tools/build-browser-geometry.mjs BASE NEW_OUTPUT SHARD SHARDS [FALLBACK ...]');
  const shard=Number(shardText),shards=Number(shardsText),roots=[base,...fallback];
  if(!Number.isSafeInteger(shard)||!Number.isSafeInteger(shards)||shard<0||shard>=shards)throw Error('Invalid shard');
  if(roots.map(r=>path.resolve(r)).includes(path.resolve(output)))throw Error('Output must be isolated');
  const manifest=JSON.parse(read(roots,'file-manifest.json'));
  const entries=Object.entries(manifest).filter(([n,e])=>/\.(ut2|ukx|usx|utx|u|uax)$/i.test(n)&&e.path.endsWith('.zst'));
  let simplifier=null;
  if(process.env.BROWSER_COOK_MESHOPT){
    simplifier=(await import(pathToFileURL(path.resolve(process.env.BROWSER_COOK_MESHOPT)))).MeshoptSimplifier;
    await simplifier.ready;
  }
  const progress=[];
  for(const [i,[logical,entry]]of entries.entries()){
    if(i%shards!==shard)continue;
    let result;
    try{result=await buildBrowserGeometry({roots,output,logical,entry,simplifier});}catch(e){result={logical,error:e.message,accepted:false};}
    progress.push(result);console.log(JSON.stringify(result));
    if(progress.length%25===0)write(output,'shard-'+shard+'.json',JSON.stringify(progress));
  }
  write(output,'shard-'+shard+'.json',JSON.stringify(progress));
}
