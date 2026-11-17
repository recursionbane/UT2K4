import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import {decodePackageFrames} from './jit-packages.mjs';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function fixture() {
  const raw=Buffer.from('first---second--tail'),size=8,parts=[],blocks=[];
  let offset=0;
  for(let at=0;at<raw.length;at+=size) {
    const bytes=raw.subarray(at,at+size),frame=zlib.zstdCompressSync(bytes);
    parts.push(frame);blocks.push({offset,length:frame.length,rawLength:bytes.length,sha256:sha(bytes)});offset+=frame.length;
  }
  const container=Buffer.concat(parts);
  return {raw,container,index:{format:'zstd-pages-v1',size:raw.length,blockSize:size,containerSize:container.length,containerSha256:sha(container),rawSha256:sha(raw),blocks}};
}
test('offline JIT reconstruction verifies and decodes every indexed frame',()=>{
  const {raw,container,index}=fixture();assert.deepEqual(decodePackageFrames(index,container),raw);
  const legacy=structuredClone(index);delete legacy.rawSha256;assert.deepEqual(decodePackageFrames(legacy,container),raw);
});
test('offline JIT reconstruction rejects inconsistent bounds, hashes and output limits',()=>{
  const {container,index}=fixture();
  for(const mutate of [i=>i.blocks[1].offset++,i=>i.blocks[0].rawLength++,i=>i.blocks[0].sha256='0'.repeat(64),i=>i.rawSha256='0'.repeat(64),i=>i.blocks.pop()]) {
    const altered=structuredClone(index);mutate(altered);assert.throws(()=>decodePackageFrames(altered,container));
  }
  assert.throws(()=>decodePackageFrames(index,container,{maxBytes:1}));
  const extra=Buffer.concat([container,Buffer.from([0])]),withExtra={...index,containerSize:extra.length,containerSha256:sha(extra)};
  assert.throws(()=>decodePackageFrames(withExtra,extra),/trailing data/);
});
