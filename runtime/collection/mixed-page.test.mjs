import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import zlib from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {createXzFrameDecoder} from './codecs/xz/decoder.mjs';
import {createJitCache} from './jit-cache.mjs';

test('mixed archive reads span real XZ/Zstd boundaries and verify both raw hashes',async()=>{
  const decodeXZ=await createXzFrameDecoder({wasmBinary:fs.readFileSync(new URL('./codecs/xz/frame-decoder.wasm',import.meta.url))});
  const a=Buffer.alloc(65536,64),b=Buffer.from('unreal second frame');
  const xz=execFileSync('xz',['-c','--check=crc32','--lzma2=dict=256KiB'],{input:a});
  const zs=zlib.zstdCompressSync(b),container=Buffer.concat([xz,zs]),size=a.length+b.length;
  const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
  const index={format:'mixed-pages-v1',size,blockSize:65536,containerSize:container.length,
    blocks:[{offset:0,length:xz.length,rawLength:a.length,sha256:sha(a),codec:'xz'},
      {offset:xz.length,length:zs.length,rawLength:b.length,sha256:sha(b)}]};
  const fetcher=async(url,init)=>{if(url.endsWith('.json'))return Response.json(index);
    assert.equal(init.headers.Range,'bytes=0-'+(container.length-1));
    return new Response(container,{status:206,headers:{'Content-Range':'bytes 0-'+(container.length-1)+'/'+container.length}});};
  const cache=createJitCache({baseURL:'https://local.test/',fetcher,decodeXZ,decode:v=>zlib.zstdDecompressSync(v),attempts:1});
  const out=new Uint8Array(b.length+3);
  const request={path:'example.ut2',size,off:a.length-3,max:out.length,url:'https://local.test/file',jit:{format:index.format,blockSize:65536}};
  assert.equal(await cache.read(request,out),out.length);
  assert.deepEqual(Buffer.from(out),Buffer.concat([a.subarray(-3),b]));
  assert.throws(()=>decodeXZ(xz,a.length-1));
  assert.throws(()=>decodeXZ(Buffer.concat([xz,Buffer.of(0)]),a.length));
});
