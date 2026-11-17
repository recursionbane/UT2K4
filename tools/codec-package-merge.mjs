/** Combine independently validated codec candidates without losing other regions. */
import crypto from 'node:crypto';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

/** Materialize one checked slice from an offline patch file. */
export function materializePatch(patch,fileBytes) {
  const file=Buffer.from(fileBytes.buffer,fileBytes.byteOffset,fileBytes.byteLength),start=patch.fileOffset??0;
  if(!Number.isSafeInteger(start)||start<0||!Number.isSafeInteger(patch.length)||patch.length<1||
     !Number.isSafeInteger(start+patch.length)||start+patch.length>file.length)
    throw Error('Invalid packed patch bounds');
  if(patch.fileOffset===undefined&&file.length!==patch.length)throw Error('Patch file length mismatch');
  if(patch.fileOffset!==undefined&&!/^[a-f0-9]{64}$/.test(patch.derivedSha256||''))throw Error('Packed patch requires derived hash');
  const bytes=Buffer.from(file.subarray(start,start+patch.length));
  if(patch.derivedSha256&&sha(bytes)!==patch.derivedSha256)throw Error('Patch slice integrity mismatch');
  return {...patch,bytes};
}

export function mergeCodecCandidates({source, candidates, patches=[]}) {
  const original = Buffer.from(source), sourceSha256 = sha(original), regions = [];
  for (const candidate of candidates) {
    if (candidate.sourceSha256 !== sourceSha256 || candidate.size !== original.length)
      throw Error('Codec candidate source mismatch');
    const expected = Buffer.from(original);
    let end = 0;
    for (const region of candidate.regions) {
      if (!Number.isSafeInteger(region.offset) || !Number.isSafeInteger(region.length) ||
          region.length <= 0 || region.offset < end || region.offset + region.length > original.length)
        throw Error('Invalid candidate region bounds');
      end = region.offset + region.length;
      expected.fill(0, region.offset, end);
      regions.push(structuredClone(region));
    }
    if (!expected.equals(Buffer.from(candidate.skeleton)))
      throw Error('Candidate changed bytes outside its codec regions');
  }
  regions.sort((a,b) => a.offset - b.offset);
  const skeleton = Buffer.from(original);
  let end = 0;
  for (const region of regions) {
    if (region.offset < end) throw Error('Codec candidates overlap');
    end = region.offset + region.length;
    skeleton.fill(0, region.offset, end);
  }
  let patchEnd=0,regionIndex=0;
  for(const patch of [...patches].sort((a,b)=>a.offset-b.offset)) {
    const bytes=Buffer.from(patch.bytes);
    if(!Number.isSafeInteger(patch.offset)||!Number.isSafeInteger(patch.length)||patch.offset<patchEnd||
       patch.length<=0||patch.offset+patch.length>original.length||bytes.length!==patch.length)
      throw Error('Invalid offline patch bounds');
    patchEnd=patch.offset+patch.length;
    if(sha(original.subarray(patch.offset,patchEnd))!==patch.sourceSha256)
      throw Error('Offline patch source mismatch');
    while(regionIndex<regions.length&&regions[regionIndex].offset+regions[regionIndex].length<=patch.offset)regionIndex++;
    if(regionIndex<regions.length&&regions[regionIndex].offset<patchEnd)
      throw Error('Offline patch overlaps a codec region');
    skeleton.set(bytes,patch.offset);
  }
  return {sourceSha256, size:original.length, skeleton, skeletonSha256:sha(skeleton), regions};
}

/** Rebase an independently built supplemental region set onto a newer skeleton.
 * A supplement may only zero its declared new regions; existing transformations
 * and descriptors must remain intact. Inputs are already hash-verified by caller. */
export function mergeSupplementalRegions({baseline,supplement,current,baselineRegions=[],supplementRegions=[],currentRegions=[]}) {
  const original=Buffer.from(baseline),candidate=Buffer.from(supplement),merged=Buffer.from(current);
  if(original.length!==candidate.length||original.length!==merged.length)throw Error('Supplement size mismatch');
  const key=r=>`${r.offset}:${r.length}`,prior=new Map(baselineRegions.map(r=>[key(r),r]));
  if(prior.size!==baselineRegions.length)throw Error('Duplicate baseline regions');
  const active=new Map(currentRegions.map(r=>[key(r),r]));
  for(const [id,r] of prior)if(JSON.stringify(active.get(id))!==JSON.stringify(r))
    throw Error('Current profile dropped or replaced a baseline descriptor');
  const seen=new Set(),added=[];
  for(const region of supplementRegions) {
    const id=key(region);
    if(seen.has(id))throw Error('Duplicate supplemental region');seen.add(id);
    if(prior.has(id)) {
      if(JSON.stringify(region)!==JSON.stringify(prior.get(id)))throw Error('Supplement replaced an existing descriptor');
    } else added.push(structuredClone(region));
  }
  if([...prior.keys()].some(id=>!seen.has(id)))throw Error('Supplement omitted existing regions');
  const regions=[...currentRegions.map(r=>structuredClone(r)),...added].sort((a,b)=>a.offset-b.offset);
  let end=0;
  for(const r of regions) {
    if(!Number.isSafeInteger(r.offset)||!Number.isSafeInteger(r.length)||r.length<1||r.offset<end||r.offset+r.length>merged.length)
      throw Error('Supplement overlaps current regions or has invalid bounds');
    end=r.offset+r.length;
  }
  const expected=Buffer.from(original);
  for(const r of added) {
    const end=r.offset+r.length;
    if(!merged.subarray(r.offset,end).equals(original.subarray(r.offset,end)))throw Error('Supplement replaces a current transformation');
    expected.fill(0,r.offset,end);merged.fill(0,r.offset,end);
  }
  if(!expected.equals(candidate))throw Error('Supplement changed bytes outside declared new regions');
  return {skeleton:merged,regions,added};
}

/** Pack encoded regions into range-addressable objects; decoded payloads stay lazy. */
export async function packCodecRegions({regions, readEncoded, writeObject, maxBytes=4*1024*1024, sharedLocations=new Map()}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw Error('Invalid pack limit');
  const result = regions.map(r => structuredClone(r));
  let parts = [], length = 0, references = [], locations = new Map();
  async function flush() {
    if (!parts.length) return;
    const bytes = Buffer.concat(parts), url = 'encoded/packs/'+sha(bytes)+'.bin';
    await writeObject(url, bytes);
    for (const {region, offset} of references) {
      region.encoded = {...region.encoded, url, offset};
      sharedLocations.set(region.encoded.sha256,{url,offset,length:region.encoded.length});
    }
    parts = []; length = 0; references = []; locations = new Map();
  }
  for (const region of result) {
    const encoded = region.encoded;
    if (sharedLocations.has(encoded.sha256)) {
      const location=sharedLocations.get(encoded.sha256);
      if(location.length!==encoded.length)throw Error('Conflicting shared digest length');
      region.encoded={...encoded,...location};continue;
    }
    if (locations.has(encoded.sha256)) {
      const prior = locations.get(encoded.sha256);
      if (encoded.length !== prior.length) throw Error('Conflicting encoded digest length');
      references.push({region, offset:prior.offset});
      continue;
    }
    const bytes = Buffer.from(await readEncoded(region));
    if (bytes.length !== encoded.length || sha(bytes) !== encoded.sha256)
      throw Error('Encoded region integrity mismatch');
    if (length && length + bytes.length > maxBytes) await flush();
    references.push({region, offset:length});
    locations.set(encoded.sha256, {offset:length,length:bytes.length});
    parts.push(bytes); length += bytes.length;
    if (length >= maxBytes) await flush();
  }
  await flush();
  return result;
}
