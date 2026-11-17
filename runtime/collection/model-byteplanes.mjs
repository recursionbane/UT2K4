/** Reversible byte-domain transport for bounded, export-table-verified Model
 * spans. No semantic float/index interpretation or collision changes. */
export function transformModelBytes(input,mode='shuffle4',inverse=false){
 const b=input instanceof Uint8Array?input:new Uint8Array(input);if(b.length>32*1024*1024)throw Error('Model region exceeds 32 MiB bound');
 if(!['identity','shuffle4','delta4','delta4-shuffle','xor4-shuffle','bitshuffle32','delta4-bitshuffle32'].includes(mode))throw Error('Unknown Model transform');
 const n=b.length,aligned=n-n%4,out=Uint8Array.from(b),bitshuffle=mode.includes('bitshuffle'),shuffle=!bitshuffle&&mode.includes('shuffle'),predict=mode.startsWith('delta')?'delta':mode.startsWith('xor')?'xor':null;
 function planes(src,dst,undo){for(let lane=0;lane<4;lane++)for(let i=0;i<aligned/4;i++)if(undo)dst[i*4+lane]=src[lane*(aligned/4)+i];else dst[lane*(aligned/4)+i]=src[i*4+lane];}
 function bits(src,dst,undo){for(let at=0;at+32<=n;at+=32)for(let bit=0;bit<32;bit++){const byte=bit>>>3,mask=1<<(bit&7);if(undo){for(let word=0;word<8;word++){const k=at+word*4+byte;if(bit%8===0)dst[k]=0;if(src[at+bit]&(1<<word))dst[k]|=mask;}}else{let value=0;for(let word=0;word<8;word++)if(src[at+word*4+byte]&mask)value|=1<<word;dst[at+bit]=value;}}}
 if(inverse){if(shuffle)planes(b,out,true);if(bitshuffle)bits(b,out,true);if(predict)for(let i=4;i<aligned;i++)out[i]=predict==='xor'?out[i]^out[i-4]:(out[i]+out[i-4])&255;}
 else{if(predict)for(let i=aligned-1;i>=4;i--)out[i]=predict==='xor'?b[i]^b[i-4]:(b[i]-b[i-4])&255;if(shuffle){const temp=out.slice();planes(temp,out,false);}if(bitshuffle){const temp=out.slice();bits(temp,out,false);}}
 return out;
}
export function createModelByteplaneDecoder({decodeZstd}={}){if(typeof decodeZstd!=='function')throw Error('Model Zstd decoder required');return async(region,encoded)=>{const length=region.length,p=region.params;if(!Number.isSafeInteger(length)||length<1||length>32*1024*1024||p?.decodedByteLength!==length)throw Error('Invalid Model region bounds');const raw=new Uint8Array(await decodeZstd(encoded,length));if(raw.length!==length)throw Error('Model decoded length mismatch');return transformModelBytes(raw,p.transform,true);};}
