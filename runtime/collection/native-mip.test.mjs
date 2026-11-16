import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';import zlib from 'node:zlib';
import {createNativeMipDecoder} from './native-mip.mjs';import {decodeBcPixels} from './bcn-pixels.mjs';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function region(raw,format='BC1',sw=4,sh=4,width=16,height=16){const length=format==='BGRA8'?width*height*4:Math.ceil(width/4)*Math.ceil(height/4)*(format==='BC1'?8:16);return{codec:'native-mip-zstd',length,params:{nativeFormat:format,width,height,encodedWidth:sw,encodedHeight:sh,decodedByteLength:length,nativeMipSha256:sha(raw)}};}
test('authored BC1 punchthrough alpha survives exact nearest mip expansion and range reads',async()=>{
  const raw=Buffer.from([0,0,255,255,0xe4,0xe4,0xe4,0xe4]),packed=zlib.zstdCompressSync(raw),r=region(raw);let calls=0;
  const decode=createNativeMipDecoder({decodeZstd:async(b,n)=>{calls++;const out=zlib.zstdDecompressSync(b);assert.equal(out.length,n);return out;}});
  const full=await decode(r,packed),original=decodeBcPixels(raw,4,4,'BC1'),pixels=decodeBcPixels(full,16,16,'BC1');
  assert(original.some((x,i)=>i%4===3&&x===0));
  for(let y=0;y<16;y++)for(let x=0;x<16;x++)for(let c=0;c<4;c++)assert.equal(pixels[(y*16+x)*4+c],original[(Math.floor(y/4)*4+Math.floor(x/4))*4+c]);
  assert.deepEqual(await decode.decodeRange(r,packed,7,19),full.slice(7,26));assert.equal(calls,1);
  await assert.rejects(()=>decode.decodeRange(r,packed,-1,3),/bounds/);
});
test('native BGRA ranges stay bounded, share concurrent decode, and reject wrong authored bytes',async()=>{
  const raw=Buffer.from(Array.from({length:64},(_,i)=>i)),packed=zlib.zstdCompressSync(raw),r=region(raw,'BGRA8',4,4,4096,4096);let calls=0;
  const decode=createNativeMipDecoder({maxBytes:64,decodeZstd:async b=>{calls++;return zlib.zstdDecompressSync(b);}});
  const [a,b]=await Promise.all([decode.decodeRange(r,packed,3,5),decode.decodeRange(r,packed,4096*4,4)]);
  assert.deepEqual([...a],[3,0,1,2,3]);assert.deepEqual([...b],[0,1,2,3]);assert.equal(calls,1);assert.equal(decode.stats().smallCacheBytes,64);
  const bad=createNativeMipDecoder({decodeZstd:()=>new Uint8Array(64)});
  await assert.rejects(()=>bad.decodeRange(r,packed,0,4),/integrity/);
  await assert.rejects(()=>decode({...r,params:{...r.params,encodedWidth:3}},packed),/power of two/);
});
