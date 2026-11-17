// Store local non-root rotation keys with the standard smallest-three representation.
// Retain every key and its original timestamp. Keep root motion in native format.
import {readUe2Package} from '../runtime/collection/ue2-texture-layout.mjs';
import {readUe2AnimationLayout} from '../runtime/collection/ue2-animation-layout.mjs';
import {compactSize} from './ue2-export-rewrite.mjs';
const marker=0x434b5031;
export function cookPoseStreams(bytes) {
 const pkg=readUe2Package(bytes);
 if(!pkg.exports.some(e=>pkg.object(e.classIndex)?.name==='MeshAnimation'))return {bytes,removed:0,ranges:[]};
 const layout=readUe2AnimationLayout(bytes),out=Buffer.from(bytes),ranges=[];let removed=0,maxAngle=0;
 for(const anim of layout.animations)for(const move of anim.moves)for(const [index,track] of move.tracks.entries()){
   if(index===0||move.boneIndices[index]===0)continue;
   const {quat,position,time}=track,n=quat.count;if(n<4||n>65535||time.count!==n||![1,n].includes(position.count))continue;
   const start=quat.offset-compactSize(n).length-4,end=time.offset+time.length;
   const packed=Buffer.alloc(4*n),signs=Buffer.alloc(Math.ceil(n/8));let ok=true,worst=0;
   for(let i=0;i<n;i++){
     const q=Array.from({length:4},(_,c)=>bytes.readFloatLE(quat.offset+16*i+4*c)),norm=Math.hypot(...q);
     if(!(norm>=.995&&norm<=1.005)){ok=false;break;}
     let largest=0;for(let c=1;c<4;c++)if(Math.abs(q[c])>Math.abs(q[largest]))largest=c;
     const sign=q[largest]<0?-1:1;if(sign<0)signs[i>>3]|=1<<(i&7);
     const restored=[];let code=largest,shift=2,sum=0;
     for(let c=0;c<4;c++)if(c!==largest){
       const s=Math.round(q[c]/norm*sign*Math.SQRT2*511);
       if(s< -511||s>511){ok=false;break;}
       code=(code|((s&1023)<<shift))>>>0;shift+=10;
       restored[c]=Math.fround(s/(511*Math.SQRT2));sum+=restored[c]**2;
     }
     if(!ok)break;
     restored[largest]=Math.fround(Math.sqrt(Math.max(0,1-sum)));
     const dot=Math.abs(q.reduce((v,x,c)=>v+x*restored[c],0))/norm/Math.hypot(...restored);
     const angle=2*Math.acos(Math.min(1,dot))*180/Math.PI;
     if(angle>.35){ok=false;break;}worst=Math.max(worst,angle);packed.writeUInt32LE(code,i*4);
   }
   if(!ok)continue;
   const head=Buffer.alloc(12);head.writeUInt32LE(marker);head.writeInt32LE(end,4);head.writeUInt32LE(track.flags,8);
   const data=Buffer.concat([head,compactSize(n),packed,signs,compactSize(position.count),
     bytes.subarray(position.offset,position.offset+position.length),compactSize(time.count),bytes.subarray(time.offset,end)]);
   if(data.length+8>=end-start)continue;
   data.copy(out,start);out.fill(0,start+data.length,end);
   ranges.push({offset:start,length:end-start});removed+=end-start-data.length;maxAngle=Math.max(maxAngle,worst);
 }
 return {bytes:out,ranges,removed,maxError:maxAngle};
}
