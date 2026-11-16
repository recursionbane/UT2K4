/** Combine independently validated codec candidates without losing other regions. */
import crypto from 'node:crypto';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

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
