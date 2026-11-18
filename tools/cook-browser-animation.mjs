// Reduce UE2 animation key counts without changing sequence duration, events,
// root motion, bone order or an unrelated export's position in the package.
import {readUe2Package, Ue2Reader} from '../runtime/collection/ue2-texture-layout.mjs';
import {readUe2AnimationLayout} from '../runtime/collection/ue2-animation-layout.mjs';

function compact(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0x7fffffff)
    throw Error('Invalid serialized size');
  let next = Math.floor(value / 64);
  const bytes = [(value & 63) | (next ? 64 : 0)];
  while (next) {
    const digit = next & 127;
    next = Math.floor(next / 128);
    bytes.push(digit | (next ? 128 : 0));
  }
  return Buffer.from(bytes);
}

function tableEntries(bytes, pkg) {
  const head = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const start = head.getInt32(24, true);
  const reader = new Ue2Reader(bytes, start);
  const entries = pkg.exports.map(exp => {
    const from = reader.pos;
    reader.compact(); reader.compact(); reader.i32(); reader.compact(); reader.u32();
    const sizeAt = reader.pos;
    if (reader.compact() !== exp.size) throw Error('Animation export table mismatch');
    const afterSize = reader.pos;
    if (exp.size && reader.compact() !== exp.offset) throw Error('Animation export offset mismatch');
    return {from, sizeAt, afterSize, end: reader.pos};
  });
  return {entries, start, end: reader.pos};
}

function dot(a,b) { return a.reduce((s,v,i)=>s+v*b[i],0); }
function normalized(q) {
  const norm = Math.hypot(...q);
  return norm > .9 && norm < 1.1 ? q.map(x=>x/norm) : null;
}
function rotationAt(a,b,t) {
  const d = dot(a,b), c = Math.min(1,Math.abs(d));
  const theta = Math.acos(c), sin = Math.sin(theta);
  const left = sin > .001 ? Math.sin((1-t)*theta)/sin : 1-t;
  const right = (sin > .001 ? Math.sin(t*theta)/sin : t) * (d<0?-1:1);
  return a.map((x,i)=>x*left+b[i]*right);
}
function chooseKeys(bytes,track) {
  const {quat,position,time} = track, n=time.count;
  if (n<3 || n>8192 || quat.count!==n || ![1,n].includes(position.count)) return null;
  const values = (field,i,size) => Array.from({length:size},(_,j)=>bytes.readFloatLE(field.offset+i*field.stride+j*4));
  const q=[],p=[],t=[];
  for(let i=0;i<n;i++){
    q.push(normalized(values(quat,i,4)));
    p.push(values(position,position.count===1?0:i,3));
    t.push(bytes.readFloatLE(time.offset+i*4));
    if (!q[i] || (i && t[i]<=t[i-1])) return null;
  }
  const keep=new Set([0,n-1]),pending=[[0,n-1]];
  while(pending.length) {
    const [lo,hi]=pending.pop();
    // Preserve large arcs even when their intermediate samples are ambiguous.
    let worst=1,split=-1;
    if(hi-lo>1 && Math.abs(dot(q[lo],q[hi]))<.1)split=(lo+hi)>>1;
    else for(let j=lo+1;j<hi;j++){
      const f=(t[j]-t[lo])/(t[hi]-t[lo]);
      const predicted=rotationAt(q[lo],q[hi],f);
      const angle=2*Math.acos(Math.min(1,Math.abs(dot(predicted,q[j]))/Math.hypot(...predicted)))*180/Math.PI;
      const distance=Math.hypot(...p[j].map((v,k)=>v-(p[lo][k]+f*(p[hi][k]-p[lo][k]))));
      const error=Math.max(angle/1.5,distance/.25);
      if(error>worst){worst=error;split=j;}
    }
    if(split<0)continue;
    keep.add(split);pending.push([lo,split],[split,hi]);
  }
  return keep.size<n?[...keep].sort((a,b)=>a-b):null;
}

function fieldBytes(bytes,field,keys) {
  if(field.count===1)return Buffer.concat([compact(1),bytes.subarray(field.offset,field.offset+field.length)]);
  return Buffer.concat([compact(keys.length),...keys.map(k=>bytes.subarray(field.offset+k*field.stride,field.offset+(k+1)*field.stride))]);
}

export function cookAnimation(bytes, output) {
  const pkg=readUe2Package(bytes);
  const layout=readUe2AnimationLayout(bytes);
  const table=tableEntries(bytes,pkg),sizes=new Map(),changes=[];
  let removedKeys=0;
  for(const animation of layout.animations){
    const exp=pkg.exports.find(e=>e.name===animation.name && pkg.object(e.classIndex)?.name==='MeshAnimation' && e.offset<=animation.moves[0]?.offset && e.offset+e.size>=animation.moves.at(-1)?.offset);
    if(!exp)continue;
    const edits=[];
    for(const move of animation.moves){
      for(const [index,track] of move.tracks.entries()){
        if(index===0 || move.boneIndices[index]===0)continue;
        const keys=chooseKeys(bytes,track);
        if(!keys)continue;
        const {quat,time}=track;
        const start=quat.offset-compact(quat.count).length,end=time.offset+time.length;
        const data=Buffer.concat([fieldBytes(bytes,quat,keys),fieldBytes(bytes,track.position,keys),fieldBytes(bytes,time,keys)]);
        edits.push({start,end,data});removedKeys+=time.count-keys.length;
      }
    }
    if(!edits.length)continue;
    let cursor=exp.offset;const parts=[];
    for(const e of edits){
      if(e.start<cursor||e.end>exp.offset+exp.size)throw Error('Animation edit outside export');
      parts.push(bytes.subarray(cursor,e.start),e.data);cursor=e.end;
    }
    parts.push(bytes.subarray(cursor,exp.offset+exp.size));
    const reduced=Buffer.concat(parts);
    sizes.set(exp.index,reduced.length);
    output.set(reduced,exp.offset);output.fill(0,exp.offset+reduced.length,exp.offset+exp.size);
    changes.push({offset:exp.offset,length:exp.size});
  }
  if(!changes.length)return {removedKeys,changes};
  const rebuilt=Buffer.concat(pkg.exports.flatMap((exp,i)=>{
    const e=table.entries[i];
    return sizes.has(exp.index)?[bytes.subarray(e.from,e.sizeAt),compact(sizes.get(exp.index)),bytes.subarray(e.afterSize,e.end)]:[bytes.subarray(e.from,e.end)];
  }));
  if(rebuilt.length>table.end-table.start)throw Error('Animation table grew');
  output.set(rebuilt,table.start);output.fill(0,table.start+rebuilt.length,table.end);
  changes.push({offset:table.start,length:table.end-table.start});
  const reread=readUe2AnimationLayout(output);
  for(const [i,a]of layout.animations.entries()) {
    const b=reread.animations[i];
    if(JSON.stringify(a.sequences)!==JSON.stringify(b.sequences)||JSON.stringify(a.bones)!==JSON.stringify(b.bones))throw Error('Animation sequence metadata changed');
  }
  return {removedKeys,changes};
}
