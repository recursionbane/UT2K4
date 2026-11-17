// Reversible transforms only. Terrain heights, collision, indices and unknown
// native fields reconstruct bit-for-bit; no terrain semantics are guessed.
const MODES=new Set(['identity','shuffle4','xor-shuffle4','delta-shuffle4']);
export function transformTerrainBytes(input,{mode='identity',stride=1,inverse=false}={}){
 const b=input instanceof Uint8Array?input:new Uint8Array(input);if(!MODES.has(mode)||!Number.isSafeInteger(stride)||stride<1||stride>64)throw Error('Invalid terrain transform');if(mode==='identity')return b.slice();const words=Math.floor(b.length/4),out=new Uint8Array(b.length),previous=new Uint32Array(stride),src=new DataView(b.buffer,b.byteOffset,b.byteLength),dst=new DataView(out.buffer);
 for(let i=0;i<words;i++){const channel=i%stride;let value;if(inverse){value=(b[i]|b[words+i]<<8|b[2*words+i]<<16|b[3*words+i]<<24)>>>0;if(mode==='xor-shuffle4')value=(value^previous[channel])>>>0;else if(mode==='delta-shuffle4')value=(value+previous[channel])>>>0;previous[channel]=value;dst.setUint32(i*4,value,true);}else{const original=src.getUint32(i*4,true);value=mode==='xor-shuffle4'?(original^previous[channel])>>>0:mode==='delta-shuffle4'?(original-previous[channel])>>>0:original;previous[channel]=original;for(let byte=0;byte<4;byte++)out[byte*words+i]=value>>>(byte*8)&255;}}
 out.set(b.subarray(words*4),words*4);return out;
}
export function createTerrainLosslessDecoder({decodeZstd,maxBytes=1024*1024}={}){
 if(typeof decodeZstd!=='function')throw Error('Terrain decoder requires bounded Zstd');
 return async(region,encoded)=>{const p=region?.params;if(region?.codec!=='terrain-lossless-zstd'||!p||!Number.isSafeInteger(region.length)||region.length<1||region.length>maxBytes||p.decodedByteLength!==region.length)throw Error('Invalid terrain region size');if(!(encoded instanceof Uint8Array)||encoded.length>2*maxBytes)throw Error('Terrain encoded size exceeds bound');const raw=new Uint8Array(await decodeZstd(encoded,region.length));if(raw.length!==region.length)throw Error('Terrain decoded size mismatch');return transformTerrainBytes(raw,{mode:p.mode,stride:p.stride,inverse:true});};
}
