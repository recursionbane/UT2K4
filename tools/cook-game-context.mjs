import {readUe2Package} from '../runtime/collection/ue2-texture-layout.mjs';

// The UT2004 linker creates an export only if its positive load bits intersect
// the active context. A standalone browser match can be both client and server.
export function cookGameContext(bytes,regions=[]) {
  const pkg=readUe2Package(bytes);
  const ranges=pkg.exports.filter(e=>e.size && (e.flags&0x30000)===0 && (e.flags&0x40000)!==0)
    .map(e=>({offset:e.offset,length:e.size})).sort((a,b)=>a.offset-b.offset);
  if(!ranges.length)return {bytes,ranges,regions,removed:0};
  const output=Buffer.from(bytes);let removed=0;
  for(const r of ranges){output.fill(0,r.offset,r.offset+r.length);removed+=r.length;}
  let cursor=0;
  const live=regions.filter(r=>{
    while(cursor<ranges.length && ranges[cursor].offset+ranges[cursor].length<=r.offset)cursor++;
    const s=ranges[cursor];if(!s||s.offset>=r.offset+r.length)return true;
    if(s.offset<=r.offset && r.offset+r.length<=s.offset+s.length)return false;
    throw Error('Codec crosses an editor export boundary');
  });
  return {bytes:output,ranges,regions:live,removed};
}
