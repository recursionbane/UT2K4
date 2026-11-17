// A k-DOP node's bounds can usually be recovered from its existing triangle
// list (leaf) or its children. Preserve every exceptional original float word.
import {readUe2Package,Ue2Reader} from '../runtime/collection/ue2-texture-layout.mjs';
import {readUe2StaticMeshLayout} from '../runtime/collection/ue2-mesh-layout.mjs';
import {compactSize} from './ue2-export-rewrite.mjs';
const marker=compactSize(202608);marker[0]|=128;
const scratch=new DataView(new ArrayBuffer(4));
function bits(x){scratch.setFloat32(0,x,true);return scratch.getUint32(0,true);}
function coordinates(raw,mesh){
 const n=mesh.vertices.count,start=mesh.vertices.offset-compactSize(n).length,r=new Ue2Reader(raw,start);
 const stored=r.compact(),p=new Float32Array(n*3);
 if(stored===n){for(let i=0;i<n;i++)for(let c=0;c<3;c++)p[i*3+c]=raw.readFloatLE(mesh.vertices.offset+i*24+c*4);return p;}
 if(stored!==-202607||r.i32()!==mesh.vertices.offset+n*24||r.compact()!==n)throw Error('Unrecognized coordinate stream');
 const words=new Uint32Array(p.buffer);
 for(let c=0;c<3;c++){const m=r.compact();if(m<1||m>n)throw Error('Invalid coordinate dictionary');
  const offset=r.pos;r.skip(m*4);let prev=0;const values=new Uint32Array(m);
  for(let i=0;i<m;i++){let d=0;for(let j=0;j<4;j++)d+=raw[offset+m*j+i]*2**(8*j);prev=(prev+d)>>>0;values[i]=prev;}
  const width=Math.ceil(Math.log2(m)),mask=2**width-1;let acc=0,have=0;
  for(let i=0;i<n;i++){while(have<width){acc+=r.u8()*2**have;have+=8;}const rank=acc&mask;acc=Math.floor(acc/2**width);have-=width;
   if(rank>=m)throw Error('Invalid coordinate reference');words[3*i+c]=values[rank];}
 }
 return p;
}
function verifyTree(packed,expected,positions,end) {
  const r=new Ue2Reader(packed);if(r.compact()!==-202608||r.i32()!==end)throw Error('Invalid encoded collision header');
  const n=r.compact(),nodes=Buffer.alloc(n*32);
  for(let i=0;i<n;i++){nodes.writeInt32LE(r.u8(),i*32+24);nodes.writeUInt16LE(r.u16(),i*32+28);nodes.writeUInt16LE(r.u16(),i*32+30);}
  const trisAt=r.pos,nt=r.compact(),faces=r.pos;r.skip(nt*8);const tris=packed.subarray(trisAt,r.pos);
  for(let i=n-1;i>=0;i--){
    const at=i*32,leaf=nodes.readInt32LE(at+24),a=nodes.readUInt16LE(at+28),b=nodes.readUInt16LE(at+30);
    const v=[1e30,1e30,1e30,-1e30,-1e30,-1e30];
    if(leaf){
      for(let t=b;t<b+a;t++)for(let k=0;k<3;k++){const id=packed.readUInt16LE(faces+t*8+2*k);
        for(let c=0;c<3;c++){const x=positions[id*3+c];if(x<v[c])v[c]=x;if(x>v[c+3])v[c+3]=x;}}
    }else for(let c=0;c<6;c++){
      const left=nodes.readFloatLE(a*32+c*4),right=nodes.readFloatLE(b*32+c*4);
      v[c]=c<3?(left<right?left:right):(left>right?left:right);
    }
    const mask=r.u8();
    for(let c=0;c<6;c++){if(mask&(1<<c))nodes.writeUInt32LE(r.u32(),at+4*c);else nodes.writeFloatLE(v[c],at+4*c);}
  }
  const restored=Buffer.concat([compactSize(n),nodes,tris]);
  if(r.pos!==r.end||!restored.equals(expected))throw Error('Collision reconstruction changed native tree bytes');
}
function packTree(raw,mesh,out){
 const r=new Ue2Reader(raw,mesh.opaqueTail.offset-4,mesh.exportOffset+mesh.exportLength);
 r.compact();const start=r.pos,n=r.compact();if(n<2||n>65535)return null;
 const positions=coordinates(raw,mesh),nodesAt=r.pos,topology=Buffer.alloc(n*5);
 for(let i=0;i<n;i++){r.skip(24);const leaf=r.i32(),a=r.u16(),b=r.u16();if(leaf!==0&&leaf!==1)throw Error('Invalid collision node kind');topology[i*5]=leaf;topology.writeUInt16LE(a,i*5+1);topology.writeUInt16LE(b,i*5+3);}
 const trisAt=r.pos,nt=r.compact(),first=r.pos;
 if(nt<1||nt>65535)return null;r.skip(nt*8);const end=r.pos;
 for(let i=0;i<nt;i++)for(let k=0;k<3;k++)if(raw.readUInt16LE(first+i*8+k*2)>=mesh.vertices.count)throw Error('Triangle outside vertex stream');
 const exceptions=[];let exceptionWords=0;
 for(let i=n-1;i>=0;i--){
   const actual=nodesAt+i*32,a=topology.readUInt16LE(i*5+1),b=topology.readUInt16LE(i*5+3);
   let predicted=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];
   if(topology[i*5]){
     if(a===0||b+a>nt)throw Error('Invalid triangle leaf span');
     for(let t=b;t<b+a;t++)for(let k=0;k<3;k++){const id=raw.readUInt16LE(first+t*8+k*2);
       for(let c=0;c<3;c++){const v=positions[id*3+c];if(v<predicted[c])predicted[c]=v;if(v>predicted[c+3])predicted[c+3]=v;}}
   }else{
     if(a<=i||b<=i||a>=n||b>=n)throw Error('Not a bottom-up reconstructible hierarchy');
     for(let c=0;c<6;c++){const x=raw.readFloatLE(nodesAt+a*32+c*4),y=raw.readFloatLE(nodesAt+b*32+c*4);
       predicted[c]=c<3?Math.min(x,y):Math.max(x,y);}
   }
   const overrides=[];
   let mask=0;
   for(let c=0;c<6;c++){
     const word=raw.readUInt32LE(actual+4*c);
     if((word&0x7fffffff)===0 || bits(predicted[c])!==word){
       mask|=1<<c;overrides.push(raw.subarray(actual+4*c,actual+4*c+4));exceptionWords++;
     }
   }
   exceptions.push(Buffer.of(mask),...overrides);
 }
 const pointer=Buffer.alloc(4);pointer.writeInt32LE(end);
 const encoded=Buffer.concat([marker,pointer,compactSize(n),topology,raw.subarray(trisAt,end),...exceptions]);
 if(encoded.length>=end-start)return null;
 verifyTree(encoded,raw.subarray(start,end),positions,end);
 encoded.copy(out,start);out.fill(0,start+encoded.length,end);
 return {offset:start,length:end-start,removed:end-start-encoded.length,nodes:n,exceptionWords};
}
export function cookCollisionTrees(raw,original,{wire=true}={}){
 const src=readUe2Package(original);
 if(src.version<120||!src.exports.some(e=>src.object(e.classIndex)?.name==='StaticMesh'))return {bytes:raw,ranges:[],removed:0};
 const layout=readUe2StaticMeshLayout(original),out=Buffer.from(raw),ranges=[];let removed=0;
 for(const mesh of layout.meshes){
   let packed;
   if(src.version>=126){try{packed=packTree(raw,mesh,out);}catch{/* Unknown collision layouts retain the original tree. */}}
   if(packed){ranges.push(packed);removed+=packed.removed;}
   const w=mesh.indices[1];
   if(wire && w.count>8 && mesh.sectionRecords.every(s=>s.unknown===0||s.unknown===1)){
     const start=w.offset-compactSize(w.count).length,end=w.offset+w.length+4;
     const reader=new Ue2Reader(raw,start,end);
     if(reader.compact()===w.count && reader.pos===w.offset){
       const wireMarker=compactSize(202609);wireMarker[0]|=128;
       const pointer=Buffer.alloc(4);pointer.writeInt32LE(end);
       const data=Buffer.concat([wireMarker,pointer]);data.copy(out,start);out.fill(0,start+data.length,end);
       ranges.push({offset:start,length:end-start,wire:true});removed+=end-start-data.length;
     }
   }
 }
 return {bytes:out,ranges,removed};
}
