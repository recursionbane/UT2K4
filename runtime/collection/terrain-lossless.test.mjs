import assert from'node:assert/strict';import{transformTerrainBytes,createTerrainLosslessDecoder}from'./terrain-lossless.mjs';
const source=new Uint8Array(1031);for(let i=0;i<source.length;i++)source[i]=(i*73+19)%256;
for(const mode of['identity','shuffle4','xor-shuffle4','delta-shuffle4'])for(const stride of[1,3,6]){const packed=transformTerrainBytes(source,{mode,stride});assert.deepEqual(transformTerrainBytes(packed,{mode,stride,inverse:true}),source);}
assert.throws(()=>transformTerrainBytes(source,{mode:'drop-height'}));assert.throws(()=>transformTerrainBytes(source,{stride:0}));const decode=createTerrainLosslessDecoder({decodeZstd:(_,n)=>new Uint8Array(n-1)});await assert.rejects(()=>decode({codec:'terrain-lossless-zstd',length:16,params:{decodedByteLength:16,mode:'identity',stride:1}},new Uint8Array(2)),/mismatch/);
console.log('PASS: exact arbitrary terrain bytes and odd tails round-trip; invalid transform and bounded decode rejection');
