// Compact-engine edition. Particle emitters obtain source triangles from the
// compiled render topology in the patched engine. Preserve the collision tree,
// compiled buffers and native object IDs. Older meshes keep their build data.
import {readUe2Package} from '../runtime/collection/ue2-texture-layout.mjs';
import {readUe2StaticMeshLayout} from '../runtime/collection/ue2-mesh-layout.mjs';
import {compactSourceTriangles} from '../runtime/collection/ue2-mesh-source-triangles.mjs';
import {compactSize,rewriteExportSizes} from './ue2-export-rewrite.mjs';

export function cookCompiledMeshes(bytes) {
  const pkg=readUe2Package(bytes);
  const output=Buffer.from(bytes),sizes=new Map(),ranges=[];
  if(!pkg.exports.some(e=>pkg.object(e.classIndex)?.name==='StaticMesh'))
    return {bytes,removed:0,ranges};
  const layout=readUe2StaticMeshLayout(bytes);
  const at=new Map(pkg.exports.filter(e=>e.size).map(e=>[e.offset,e]));
  let removed=0;
  for(const mesh of layout.meshes){
    const exp=at.get(mesh.exportOffset);
    let source;
    try {source=compactSourceTriangles(bytes,mesh,layout.version,layout.licensee,output);}
    catch {continue;}
    if(source.legacy||!source.triangles)continue;
    // Only drop an emission source if the engine can recover triangle surfaces.
    if(!mesh.sectionRecords.some(s=>s.faces>0)||mesh.sectionRecords.some(s=>s.unknown!==0&&s.unknown!==1)){
      bytes.copy(output,exp.offset,exp.offset,exp.offset+exp.size);
      continue;
    }
    const lazy=source.offset-compactSize(source.triangles).length-4;
    const oldEnd=source.offset+source.length,newEnd=lazy+5;
    if(bytes.readInt32LE(lazy)!==oldEnd)throw Error('Lazy source triangle pointer disagrees');
    output.writeInt32LE(newEnd,lazy);output[lazy+4]=0;
    bytes.copy(output,newEnd,oldEnd,exp.offset+exp.size);
    const newSize=exp.size-(oldEnd-newEnd);
    output.fill(0,exp.offset+newSize,exp.offset+exp.size);
    sizes.set(exp.index,newSize);removed+=exp.size-newSize;
    ranges.push({offset:lazy,length:exp.offset+exp.size-lazy});
  }
  if(!removed)return {bytes,removed:0,ranges:[]};
  ranges.push(rewriteExportSizes(bytes,output,sizes));
  const reread=readUe2StaticMeshLayout(output);
  for(const mesh of reread.meshes){
    if(!sizes.has(at.get(mesh.exportOffset).index))continue;
    const result=compactSourceTriangles(output,mesh,layout.version,layout.licensee,output);
    if(result.triangles!==0)throw Error('Compiled mesh retained source triangles');
  }
  return {bytes:output,removed,ranges};
}
