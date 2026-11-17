import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {mergeCodecCandidates,packCodecRegions,materializePatch,mergeSupplementalRegions} from './codec-package-merge.mjs';
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const source = Buffer.from(Array.from({length:64},(_,i)=>i+1));
test('supplements preserve independent changes and reject silent overwrites',()=>{
 const old={offset:4,length:4,codec:'existing'},fresh={offset:16,length:4,codec:'new'};
 const baseline=Buffer.from(source);baseline.fill(0,4,8);
 const supplement=Buffer.from(baseline);supplement.fill(0,16,20);
 const current=Buffer.from(baseline);current.fill(7,40,44);
 const args={baseline,supplement,current,baselineRegions:[old],supplementRegions:[old,fresh],currentRegions:[old]};
 const result=mergeSupplementalRegions(args);
 assert.deepEqual(result.skeleton.subarray(16,20),Buffer.alloc(4));
 assert.deepEqual(result.skeleton.subarray(40,44),Buffer.alloc(4,7));
 assert.deepEqual(result.added,[fresh]);assert.deepEqual(current.subarray(16,20),source.subarray(16,20));
 assert.throws(()=>mergeSupplementalRegions({...args,supplementRegions:[fresh]}),/omitted/);
 assert.throws(()=>mergeSupplementalRegions({...args,supplementRegions:[{...old,codec:'other'},fresh]}),/replaced/);
 assert.throws(()=>mergeSupplementalRegions({...args,currentRegions:[old,fresh]}),/overlaps/);
 assert.throws(()=>mergeSupplementalRegions({...args,currentRegions:[]}),/baseline descriptor/);
 const bad=Buffer.from(supplement);bad[30]=0;
 assert.throws(()=>mergeSupplementalRegions({...args,supplement:bad}),/outside/);
 const changed=Buffer.from(current);changed[16]=0;
 assert.throws(()=>mergeSupplementalRegions({...args,current:changed}),/current transformation/);
});
test('packed offline patches enforce slice bounds and independent hashes',()=>{
 const file=Buffer.from([9,8,7,6,5,4]);const patch={offset:4,length:3,fileOffset:2,derivedSha256:sha(file.subarray(2,5))};
 const result=materializePatch(patch,file);assert.deepEqual([...result.bytes],[7,6,5]);file.fill(0);assert.deepEqual([...result.bytes],[7,6,5]);
 assert.throws(()=>materializePatch(patch,file),/integrity/);
 assert.throws(()=>materializePatch({...patch,fileOffset:5},file),/bounds/);
 assert.throws(()=>materializePatch({...patch,derivedSha256:null},file),/hash/);
});
function candidate(offset, length=8) {
  const skeleton = Buffer.from(source); skeleton.fill(0,offset,offset+length);
  return {sourceSha256:sha(source),size:source.length,skeleton,
    regions:[{offset,length,codec:'fixture',encoded:{url:'old',length:2,sha256:sha(Buffer.from([1,2]))}}]};
}
test('mixed texture/audio candidates preserve metadata and both sets of regions',()=>{
  const a=candidate(8),b=candidate(32),merged=mergeCodecCandidates({source,candidates:[b,a]});
  assert.deepEqual(merged.regions.map(r=>r.offset),[8,32]);
  const expected=Buffer.from(source);expected.fill(0,8,16);expected.fill(0,32,40);
  assert.deepEqual(merged.skeleton,expected);assert.equal(source[8],9);
  for(const bad of [{...a,sourceSha256:'bad'},{...a,skeleton:Buffer.alloc(64)}])
    assert.throws(()=>mergeCodecCandidates({source,candidates:[bad]}));
  assert.throws(()=>mergeCodecCandidates({source,candidates:[a,candidate(12)]}),/overlap/);
});
test('range packs reconstruct every encoded payload and share identical bytes',async()=>{
  const payloads=[Buffer.from([1,2]),Buffer.from([3,4,5]),Buffer.from([1,2]),Buffer.from([6,7,8,9])];
  const regions=payloads.map((b,i)=>({offset:i*8,length:8,codec:'fixture',encoded:{url:String(i),length:b.length,sha256:sha(b)}}));
  const files=new Map();const result=await packCodecRegions({regions,maxBytes:6,
    readEncoded:r=>payloads[Number(r.encoded.url)],writeObject:(n,b)=>files.set(n,b)});
  for(let i=0;i<result.length;i++){const e=result[i].encoded;assert.deepEqual(files.get(e.url).subarray(e.offset,e.offset+e.length),payloads[i]);}
  // A full pack is flushed immediately; deduplication never requires retaining all corpus bytes.
  assert([...files.values()].every(b=>b.length<=6));
  assert.equal(result[0].encoded.url,result[2].encoded.url);
  assert.equal(result[0].encoded.offset,result[2].encoded.offset);
  assert.equal([...files.values()].reduce((n,b)=>n+b.length,0),9);
  await assert.rejects(()=>packCodecRegions({regions,readEncoded:()=>Buffer.from([0]),writeObject:()=>{}}),/integrity/);
});
test('the same encoded texture is shared across independently built packages',async()=>{
  const sharedLocations=new Map(),files=new Map(),regions=candidate(8).regions;
  const options={regions,sharedLocations,readEncoded:()=>Buffer.from([1,2]),writeObject:(n,b)=>files.set(n,b)};
  const first=await packCodecRegions(options);
  const second=await packCodecRegions({...options,readEncoded:()=>{throw Error('Already packed');}});
  assert.deepEqual(second[0].encoded,first[0].encoded);assert.equal(files.size,1);
});
test('source-bound float patches coexist with codec regions without changing package length',()=>{
  const patch={offset:32,length:4,sourceSha256:sha(source.subarray(32,36)),bytes:Buffer.from([0,0,128,63])};
  const result=mergeCodecCandidates({source,candidates:[candidate(8)],patches:[patch]});
  assert.equal(result.skeleton.length,source.length);assert.deepEqual(result.skeleton.subarray(32,36),patch.bytes);
  assert.deepEqual(result.skeleton.subarray(16,32),source.subarray(16,32));
  assert.throws(()=>mergeCodecCandidates({source,candidates:[candidate(32)],patches:[patch]}),/overlap/);
  assert.throws(()=>mergeCodecCandidates({source,candidates:[],patches:[{...patch,sourceSha256:'invalid'}]}),/source mismatch/);
});
