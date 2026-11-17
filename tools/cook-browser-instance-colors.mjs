import {readUe2Package} from '../runtime/collection/ue2-texture-layout.mjs';
import {readUe2InstanceLayout} from '../runtime/collection/ue2-instance-layout.mjs';
import {compactSize,rewriteExportSizes} from './ue2-export-rewrite.mjs';
const marker=compactSize(202604);marker[0]|=128;
const decodeColor=key=>[key&255,(key>>8)&255,(key>>16)&255];
function bounds(group) {
  const lo=[255,255,255],hi=[0,0,0];let weight=0;
  for(const p of group){weight+=p.n;for(let c=0;c<3;c++){lo[c]=Math.min(lo[c],p.c[c]);hi[c]=Math.max(hi[c],p.c[c]);}}
  const widths=hi.map((v,c)=>v-lo[c]),span=Math.max(...widths);
  return {group,axis:widths.indexOf(span),score:span*span*weight,weight};
}
function paletteOf(points,limit) {
  if(points.length<=limit)return points.map(p=>p.c);
  const buckets=[bounds(points)];
  while(buckets.length<limit){
    let best=0;for(let i=1;i<buckets.length;i++)if(buckets[i].score>buckets[best].score)best=i;
    const {axis,group,weight}=buckets[best];group.sort((a,b)=>a.c[axis]-b.c[axis]);
    let split=0,total=0;while(split<group.length-1&&total<weight/2)total+=group[split++].n;
    buckets.splice(best,1,bounds(group.slice(0,split)),bounds(group.slice(split)));
  }
  return buckets.map(b=>[0,1,2].map(c=>Math.round(b.group.reduce((v,p)=>v+p.n*p.c[c],0)/b.weight)));
}

export function encodeInstanceLighting(bytes) {
  const n=bytes.length/4;
  if(!Number.isInteger(n)||n<1||n>1e6)throw Error('Invalid native vertex colors');
  const histogram=new Map();let sameAlpha=true;
  const keyAt=i=>bytes[i]|bytes[i+1]<<8|bytes[i+2]<<16;
  for(let at=0;at<bytes.length;at+=4){const k=keyAt(at);histogram.set(k,(histogram.get(k)||0)+1);sameAlpha&&=bytes[at+3]===bytes[3];}
  const points=[...histogram].map(([key,n])=>({key,n,c:decodeColor(key)}));
  let palette,indices,maxError,rmse;
  for(const limit of [1,2,4,16]){
    palette=paletteOf([...points],limit);indices=new Map();maxError=0;let sq=0;
    for(const p of points){
      let best=0,d=Infinity;
      for(let i=0;i<palette.length;i++){
        const distance=p.c.reduce((v,x,c)=>v+(x-palette[i][c])**2,0);
        if(distance<d){d=distance;best=i;}
      }
      maxError=Math.max(maxError,...p.c.map((x,c)=>Math.abs(x-palette[best][c])));sq+=d*p.n;
      indices.set(p.key,best);
    }
    rmse=Math.sqrt(sq/(3*n));
    if(maxError<=24 && rmse<=4)break;
  }
  if(maxError>60||rmse>12)return null;
  const bits=palette.length===1?0:palette.length<=2?1:palette.length<=4?2:4;
  const data=Buffer.alloc(Math.ceil(n*bits/8)),alpha=Buffer.alloc(sameAlpha?1:n);
  if(sameAlpha)alpha[0]=bytes[3];
  for(let i=0;i<n;i++){if(bits)data[(i*bits)>>3]|=indices.get(keyAt(4*i))<<((i*bits)&7);if(!sameAlpha)alpha[i]=bytes[i*4+3];}
  const rgb=Buffer.from(palette.flat());
  const parts=[marker,compactSize(n),Buffer.from([palette.length,sameAlpha?0:1]),rgb];
  if(sameAlpha)parts.push(alpha);
  parts.push(data);if(!sameAlpha)parts.push(alpha);
  parts.push(Buffer.of(0)); // Native Lights array is empty.
  return {data:Buffer.concat(parts),rmse,maxError};
}

export function cookInstanceLighting(bytes) {
  const pkg=readUe2Package(bytes);
  if(!pkg.exports.some(e=>pkg.object(e.classIndex)?.name==='StaticMeshInstance'))return {bytes,ranges:[],removed:0};
  const layout=readUe2InstanceLayout(bytes),out=Buffer.from(bytes),sizes=new Map(),ranges=[];
  const exports=new Map(pkg.exports.map(e=>[e.offset,e]));
  let removed=0,vertices=0,records=0,maxError=0,worstRmse=0;
  for(const inst of layout.instances){
    if(!inst.colors.count||!inst.lights.some(l=>l.applied))continue;
    const color=bytes.subarray(inst.colors.offset,inst.colors.offset+inst.colors.length),cooked=encodeInstanceLighting(color);
    if(!cooked)continue;
    const start=inst.properties.offset+inst.properties.length;
    const exp=exports.get(inst.exportOffset),size=start-exp.offset+cooked.data.length;
    if(size>=exp.size)continue;
    cooked.data.copy(out,start);out.fill(0,exp.offset+size,exp.offset+exp.size);sizes.set(exp.index,size);
    removed+=exp.size-size;vertices+=inst.colors.count;records+=inst.lights.length;
    maxError=Math.max(maxError,cooked.maxError);worstRmse=Math.max(worstRmse,cooked.rmse);
    ranges.push({offset:start,length:exp.size-(start-exp.offset)});
  }
  if(!removed)return {bytes,ranges:[],removed:0};
  ranges.push(rewriteExportSizes(bytes,out,sizes));
  return {bytes:out,ranges,removed,vertices,lightRecords:records,maxError,worstRmse};
}
