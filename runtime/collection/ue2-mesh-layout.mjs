// UT2004 static render-stream prefix, checked against UEViewer UnMesh2.h/.cpp.
// Collision/editor tail is retained opaque and MUST NOT be rewritten.
import {readUe2Package,readUe2Properties}from'./ue2-texture-layout.mjs';
function count(r,max=1000000){const n=r.compact();if(n<0||n>max)throw Error('Invalid UE2 mesh array count');return n;}
function box(r){const min=[r.f32(),r.f32(),r.f32()],max=[r.f32(),r.f32(),r.f32()],valid=r.u8();if(valid>1||(valid&&min.some((v,i)=>v>max[i])))throw Error('Invalid UE2 mesh bounds: '+JSON.stringify({min,max,valid}));return{min,max,valid};}
function array(r,stride,max){const n=count(r,max),offset=r.pos;r.skip(n*stride);return{offset,length:n*stride,count:n,stride};}
export function readUe2StaticMeshLayout(bytes){
 const pkg=readUe2Package(bytes);if(pkg.version<112)throw Error('Old UE2 static meshes unsupported');const meshes=[];
 for(const exp of pkg.exports){if(pkg.object(exp.classIndex)?.name!=='StaticMesh'||!exp.size)continue;if(exp.flags&0x02000000)throw Error('Static mesh state-stack unsupported');const r=pkg.reader(exp);readUe2Properties(r,pkg.name);const bounds=box(r);for(let i=0;i<4;i++)r.f32();const sections=[];for(let n=count(r,65536),i=0;i<n;i++)sections.push({offset:r.pos,unknown:r.i32(),firstIndex:r.u16(),firstVertex:r.u16(),lastVertex:r.u16(),unknownFaces:r.u16(),faces:r.u16()});box(r);
  const vertices=array(r,24);r.i32();for(let at=vertices.offset;at<vertices.offset+vertices.length;at+=24){const v=new DataView(pkg.bytes.buffer,pkg.bytes.byteOffset+at,24);for(let k=0;k<6;k++){const f=v.getFloat32(k*4,true);if(!Number.isFinite(f))throw Error('Nonfinite static vertex');if(k<3&&bounds.valid&&(f<bounds.min[k]-1||f>bounds.max[k]+1))throw Error('Static vertex outside serialized bounds');}const n=Math.hypot(v.getFloat32(12,true),v.getFloat32(16,true),v.getFloat32(20,true));if(n>1.1)throw Error('Invalid static vertex normal');}
  const colors=[];for(let i=0;i<2;i++){const c=array(r,4);colors.push(c);if(c.count&&c.count!==vertices.count)throw Error('Static color stream count mismatch');r.i32();}
  const uvs=[];for(let n=count(r,16),i=0;i<n;i++){const uv=array(r,8);if(uv.count&&uv.count!==vertices.count)throw Error('Static UV stream count mismatch');uvs.push(uv);r.i32();r.i32();}
  const indices=[];for(let i=0;i<2;i++){const b=array(r,2);r.i32();for(let at=b.offset;at<b.offset+b.length;at+=2)if(new DataView(pkg.bytes.buffer,pkg.bytes.byteOffset+at,2).getUint16(0,true)>=vertices.count)throw Error('Static index outside vertex stream');indices.push(b);}r.i32();
  for(const s of sections)if(s.faces>0&&(s.firstVertex>s.lastVertex||s.lastVertex>=vertices.count||s.firstIndex+s.faces*3>indices[0].count))throw Error('Static section bounds mismatch: '+exp.name+' '+JSON.stringify(s)+' vertexCount='+vertices.count+' indexCount='+indices[0].count);
  meshes.push({name:exp.name,exportOffset:exp.offset,exportLength:exp.size,vertices,uvs,indices,colors,sectionRecords:sections,sections:sections.length,opaqueTail:{offset:r.pos,length:r.end-r.pos}});
 }
 return{format:'ue2-static-render-prefix-v1',version:pkg.version,licensee:pkg.licensee,size:pkg.bytes.length,meshes};
}
