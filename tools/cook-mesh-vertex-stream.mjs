import {readUe2Package} from '../runtime/collection/ue2-texture-layout.mjs';
import {readUe2StaticMeshLayout} from '../runtime/collection/ue2-mesh-layout.mjs';
// Preserve IEEE-754 position words using a per-axis dictionary. Render normals
// are quantized to signed 8-bit components. Native vertex IDs are unchanged.
import {compactSize} from './ue2-export-rewrite.mjs';
const stamp=compactSize(202607);stamp[0]|=128;
function axisStream(source,start,count,axis){
  const values=new Uint32Array(count);
  for(let i=0;i<count;i++)values[i]=source.readUInt32LE(start+i*24+axis*4);
  const unique=[...new Set(values)].sort((a,b)=>a-b);
  const bits=Math.ceil(Math.log2(unique.length));
  const references=Buffer.alloc(Math.ceil(bits*count/8)),words=Buffer.alloc(unique.length*4);
  const rank=new Map();let prev=0;
  // A monotonic integer difference is exactly reversible including negative zero.
  unique.forEach((value,i)=>{const delta=(value-prev)>>>0;prev=value;rank.set(value,i);
    for(let j=0;j<4;j++)words[j*unique.length+i]=(delta>>>(8*j))&255;});
  let acc=0,used=0,at=0;
  for(const value of values){acc+=rank.get(value)*2**used;used+=bits;
    while(used>=8){references[at++]=acc&255;acc=Math.floor(acc/256);used-=8;}}
  if(used)references[at]=acc;
  return Buffer.concat([compactSize(unique.length),words,references]);
}
// Independent decoder used by the offline builder to check every source coordinate.
function verifyAxes(parts,source,mesh) {
  const n=mesh.vertices.count;
  for(let axis=0;axis<3;axis++){
    const packed=parts[3+axis];let at=0;
    const first=packed[at++];let unique=first&63;
    if(first&64){let shift=6,next;do{next=packed[at++];unique+=(next&127)*2**shift;shift+=7;}while(next&128);}
    if(!unique||unique>n)throw Error('Invalid coordinate dictionary');
    const words=new Uint32Array(unique);let previous=0;
    for(let i=0;i<unique;i++){let delta=0;for(let j=0;j<4;j++)delta+=(packed[at+unique*j+i])*2**(j*8);
      words[i]=(previous+delta)>>>0;previous=words[i];}
    at+=unique*4;
    const bits=Math.ceil(Math.log2(unique)),mask=2**bits-1;
    let accumulator=0,have=0;
    for(let i=0;i<n;i++){while(have<bits){accumulator+=packed[at++]*2**have;have+=8;}
      const rank=accumulator&mask;accumulator=Math.floor(accumulator/2**bits);have-=bits;
      if(rank>=unique||words[rank]!==source.readUInt32LE(mesh.vertices.offset+i*24+axis*4))
        throw Error('Mesh collision position round trip failed');
    }
    if(at!==packed.length)throw Error('Trailing coordinate data');
  }
}
export function packMeshVertices(source,output,mesh){
  const {offset,count,length}=mesh.vertices;
  if(count<16||count>65536)return null;
  const start=offset-compactSize(count).length,end=offset+length;
  const skip=Buffer.alloc(4);skip.writeInt32LE(end);
  const parts=[stamp,skip,compactSize(count)];
  for(let c=0;c<3;c++)parts.push(axisStream(source,offset,count,c));
  const normals=Buffer.alloc(count*3);
  for(let c=0;c<3;c++)for(let i=0;i<count;i++){
    const v=source.readFloatLE(offset+i*24+12+c*4);
    if(!Number.isFinite(v)||Math.abs(v)>1.01)return null;
    normals[c*count+i]=Math.max(-127,Math.min(127,Math.round(v*127)))&255;
  }
  verifyAxes(parts,source,mesh);
  parts.push(normals);
  const packed=Buffer.concat(parts);
  if(packed.length>=end-start)return null;
  packed.copy(output,start);output.fill(0,start+packed.length,end);
  return {offset:start,length:end-start,payloadBytes:packed.length};
}

export function cookPackedMeshVertices(bytes) {
  const pkg=readUe2Package(bytes);
  if(!pkg.exports.some(e=>pkg.object(e.classIndex)?.name==='StaticMesh'))return {bytes,removed:0,ranges:[]};
  const layout=readUe2StaticMeshLayout(bytes),out=Buffer.from(bytes),ranges=[];let removed=0;
  for(const mesh of layout.meshes){const result=packMeshVertices(bytes,out,mesh);if(result){removed+=result.length-result.payloadBytes;ranges.push(result);}}
  return {bytes:out,removed,ranges};
}
