// Build a conservative exclusion list for CPU-read terrain textures. Resolve
// nested layer and decoration references. If a map's tags are unfamiliar,
// protect every texture reference in that map instead.
import fs from'node:fs';import path from'node:path';import z from'node:zlib';
import{readUe2Package}from'../runtime/collection/ue2-texture-layout.mjs';
import{readTerrainProperties}from'../runtime/collection/ue2-terrain-layout.mjs';
const [root,out]=process.argv.slice(2);if(!root||!out)throw Error('Usage: catalog-files output.json');
const m=JSON.parse(fs.readFileSync(path.join(root,'file-manifest.json'))),names=new Set(),unknown=[],retainedMaps=[];let terrains=0;
for(const [logical,e]of Object.entries(m).filter(([n])=>n.endsWith('.ut2'))){
 const bytes=z.zstdDecompressSync(fs.readFileSync(path.join(root,e.path)));let pkg;
 try{pkg=readUe2Package(bytes)}catch{retainedMaps.push(logical);continue;}
 const actors=pkg.exports.filter(x=>pkg.object(x.classIndex)?.name==='TerrainInfo');
 for(const exp of actors){const r=pkg.reader(exp);try{
   if(exp.flags&0x02000000){const node=r.compact();r.compact();r.skip(12);if(node)r.compact();}
   const tags=readTerrainProperties(pkg,r).tags;
   function walk(items){for(const t of items){
     if(t.reference?.name && t.reference.name!=='None')names.add(t.reference.name.toLowerCase());
     if(t.children)walk(t.children);for(const layer of t.layers||[])walk(layer);
   }}
   walk(tags);terrains++;
 }catch{
   unknown.push({logical,actor:exp.name});
   retainedMaps.push(logical);
   for(const imp of pkg.imports)if(imp.className==='Texture')names.add(imp.name.toLowerCase());
   for(const x of pkg.exports)if(pkg.object(x.classIndex)?.name==='Texture')names.add(x.name.toLowerCase());
   break;
 }}
}
fs.writeFileSync(out,JSON.stringify({names:[...names].sort(),retainedMaps:[...new Set(retainedMaps)].sort(),unknown,terrains},null,2));
