// Offline triangle-list LOD. The collision tree references original vertex IDs.
// Keep every position and vertex ID and use a subset for the rendered surfaces.
export function cookMeshLod(input, output, mesh, simplifier) {
  const sections=mesh.sectionRecords;
  if (!sections?.length || sections.some(s=>s.unknown!==0 || s.unknownFaces!==s.faces))
    return {changed:false};
  const indexStream=mesh.indices[0];
  let previousEnd=0;
  for(const s of sections){
    if(s.faces && (s.firstIndex<previousEnd || s.firstIndex+s.faces*3>indexStream.count))return {changed:false};
    if(s.faces)previousEnd=s.firstIndex+s.faces*3;
  }
  const count=mesh.vertices.count,positions=new Float32Array(count*3);
  const attributes=new Float32Array(count*5),uv=mesh.uvs[0];
  for(let i=0;i<count;i++){
    const start=mesh.vertices.offset+i*24;
    for(let c=0;c<3;c++){
      positions[3*i+c]=input.readFloatLE(start+c*4);
      attributes[5*i+c]=input.readFloatLE(start+12+c*4);
    }
    if(uv?.count){
      for(let c=0;c<2;c++){
        const value=input.readFloatLE(uv.offset+i*8+c*4);
        if(!Number.isFinite(value))return {changed:false};
        attributes[5*i+3+c]=value;
      }
    }
  }
  const used=new Uint8Array(count),replacements=[];
  let oldFaces=0,newFaces=0,maxError=0;
  for(const section of sections){
    const offset=indexStream.offset+section.firstIndex*2;
    const indices=new Uint32Array(section.faces*3);
    for(let i=0;i<indices.length;i++)indices[i]=input.readUInt16LE(offset+i*2);
    let result=indices;
    if(section.faces>=64){
      const target=Math.max(24,Math.ceil(section.faces*.22))*3;
      const [simplified,error]=simplifier.simplifyWithAttributes(indices,positions,3,attributes,5,
        [.12,.12,.12,.4,.4],null,target,.018,['LockBorder','Sparse']);
      if(simplified.length>=3 && simplified.length<indices.length && Number.isFinite(error)){
        result=simplified;maxError=Math.max(maxError,error);
        replacements.push({section,offset,result});
      }
    }
    for(const i of result) {
      if(i>=count || i<section.firstVertex || i>section.lastVertex)throw Error('Invalid simplified vertex');
      used[i]=1;
    }
    oldFaces+=section.faces; newFaces+=result.length/3;
  }
  if(!replacements.length)return {changed:false};
  for(const {section,offset,result} of replacements){
    output.fill(0,offset,offset+section.faces*6);
    for(let i=0;i<result.length;i++)output.writeUInt16LE(result[i],offset+i*2);
    output.writeUInt16LE(result.length/3,section.offset+10);
    output.writeUInt16LE(result.length/3,section.offset+12);
  }
  for(let i=0;i<count;i++){
    const start=mesh.vertices.offset+i*24;
    if(!used[i]){
      output.fill(0,start+12,start+24);
      for(const stream of mesh.uvs)if(stream.count)output.fill(0,stream.offset+i*8,stream.offset+i*8+8);
      for(const stream of mesh.colors)if(stream.count)output.fill(0,stream.offset+i*4,stream.offset+i*4+4);
    }
  }
  return {changed:true,oldFaces,newFaces,maxError};
}
