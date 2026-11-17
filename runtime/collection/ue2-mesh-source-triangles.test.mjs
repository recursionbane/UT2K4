import assert from 'node:assert/strict';
import test from 'node:test';
import {compactSourceTriangles} from './ue2-mesh-source-triangles.mjs';

function fixture(internalVersion = 11) {
  const parts=[];
  let length=0;
  function add(n,value=0){const b=Buffer.alloc(n,value);parts.push(b);length+=n;return b;}
  function word(n){const b=add(4);b.writeInt32LE(n);return b;}
  add(3); // no collision model, no kDOP nodes or triangles
  const lazy=word(0);add(1,1);
  const position=add(36,17);word(2);
  const attributes=length;add(48,29);add(12,128);
  const tail=length;word(3);word(15);
  lazy.writeInt32LE(length);word(internalVersion);add(1);add(1);word(89);
  const bytes=Buffer.concat(parts);
  const mesh={exportOffset:0,exportLength:bytes.length,opaqueTail:{offset:4}};
  return {bytes,mesh,position,attributes,tail};
}
test('source triangle cook keeps particle positions, material, smoothing and collision bytes',()=>{
  const {bytes,mesh,attributes,tail}=fixture(),output=Buffer.from(bytes);
  assert.equal(compactSourceTriangles(bytes,mesh,126,29,output).attributes,60);
  assert.deepEqual(output.subarray(0,attributes),bytes.subarray(0,attributes));
  assert.deepEqual(output.subarray(tail),bytes.subarray(tail));
  assert.deepEqual(output.subarray(attributes,tail),Buffer.alloc(60));
});
test('older builds and unexpected boundaries retain the source attributes',()=>{
  const {bytes,mesh}=fixture(10),output=Buffer.from(bytes);
  assert.equal(compactSourceTriangles(bytes,mesh,126,29,output).legacy,true);
  assert.deepEqual(bytes,output);
  bytes.writeInt32LE(0,3);
  assert.throws(()=>compactSourceTriangles(bytes,mesh,126,29,output),/boundary/);
});
