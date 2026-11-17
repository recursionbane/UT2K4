import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import BASIS from '../runtime/collection/codecs/basis/basis-transcoder.mjs';
import {pixelsFromDds} from './texture-convert.mjs';
import {encodeNativeImage} from './native-block-encode.mjs';
const module=await BASIS({wasmBinary:fs.readFileSync(new URL('../runtime/collection/codecs/basis/basis_transcoder.wasm',import.meta.url))});module.initializeBasis();
for(const format of ['BC1','BC2','BC3','BGRA8'])test('generated '+format+' mip retains dimensions and transparency',()=>{
 const w=8,h=4,p=new Uint8Array(w*h*4);
 for(let i=0;i<w*h;i++){p.set([i%2?248:0,i%2?0:252,0,(i%5===0)?0:255],i*4);}
 const enc=encodeNativeImage(p,w,h,format);const out=pixelsFromDds(module,enc,w,h,format==='BGRA8'?'RGBA8':format);
 assert.equal(out.length,p.length);for(let i=0;i<w*h;i++){assert.equal(out[i*4+3],p[i*4+3]);if(p[i*4+3]!==0){for(let c=0;c<3;c++)assert(Math.abs(out[i*4+c]-p[i*4+c])<=8);}}
});
