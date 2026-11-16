// CI-visible real fallback tests; no game data. The nested suite uses an authored sine tone.
import './codecs/opus/decoder.test.mjs';
import fs from'node:fs';import assert from'node:assert/strict';import{createOpusPacketDecoder}from'./codecs/opus/decoder.mjs';
const decoder=await createOpusPacketDecoder({wasmBytes:fs.readFileSync(new URL('./codecs/opus/opus_decoder.wasm',import.meta.url))}),silence=new Uint8Array([0xf8,0xff,0xfe]);
for(const channels of[1,2]){const decoded=decoder.decodePackets([silence],channels);assert.equal(decoded.total,960);assert.equal(decoded.parts.length,1);assert.equal(decoded.parts[0].length,channels);for(const plane of decoded.parts[0]){assert.equal(plane.length,960);assert.ok(plane.every(Number.isFinite));assert.ok(plane.every(x=>Math.abs(x)<.000001));}}
assert.equal(decoder.memoryBytes,2097152);assert.throws(()=>decoder.decodePackets([new Uint8Array(1048577)],1),/length/);assert.throws(()=>decoder.decodePackets([silence],3),/request/);
console.log('PASS: actual vendor WASM mono/stereo Opus silence960frames, finite/silentPCM, packet/channel bounds and fixed2MiB budget');
