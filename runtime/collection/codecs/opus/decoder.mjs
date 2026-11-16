// Lazy, same-origin, fixed-memory fallback for workers without WebCodecs Opus.
export const OPUS_WASM_SHA256='06593beb69e2f3de8d02d9bead0a727f347f0977af446ff35d0918629d988ddd';
export async function createOpusPacketDecoder({wasmBytes,wasmURL=new URL('./opus_decoder.wasm',import.meta.url),fetcher=fetch}={}){
 let bytes;
 if(wasmBytes)bytes=wasmBytes instanceof Uint8Array?wasmBytes:new Uint8Array(wasmBytes);
 else{
  const url=new URL(wasmURL,import.meta.url);if(url.origin!==new URL(import.meta.url).origin)throw Error('Opus decoder must be same-origin');
  const controller=new AbortController(),timer=typeof AbortSignal!=='undefined'&&typeof AbortSignal.timeout==='function'?null:setTimeout(()=>controller.abort(),30000);
  const signal=timer===null?AbortSignal.timeout(30000):controller.signal;
  try{const response=await fetcher(url.href,{credentials:'same-origin',cache:'no-store',signal});
   if(!response.ok){await response.body?.cancel();throw Error('Opus decoder download failed: '+response.status);}
   if(Number(response.headers.get('content-length'))>512*1024){await response.body?.cancel();throw Error('Opus decoder object exceeds bound');}
   const reader=response.body?.getReader();if(!reader)throw Error('Opus decoder response has no body');const chunks=[];let length=0;
   try{for(;;){const next=await reader.read();if(next.done)break;length+=next.value.length;if(length>512*1024){await reader.cancel();throw Error('Opus decoder object exceeds bound');}chunks.push(next.value);}}
   finally{reader.releaseLock();}
   bytes=new Uint8Array(length);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
  }finally{if(timer!==null)clearTimeout(timer);}
 }
 if(bytes.length>512*1024)throw Error('Opus decoder object exceeds bound');const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');if(hash!==OPUS_WASM_SHA256)throw Error('Opus decoder integrity failure');
 const module=await WebAssembly.compile(bytes);for(const i of WebAssembly.Module.imports(module))if(i.module!=='wasi_snapshot_preview1'||!['fd_close','fd_seek','fd_write'].includes(i.name))throw Error('Unexpected Opus WASM import');
 const e=new WebAssembly.Instance(module,{wasi_snapshot_preview1:{fd_close:()=>0,fd_seek:()=>29,fd_write:()=>{throw Error('Unexpected Opus codec diagnostic');}}}).exports;
 if(typeof e._initialize==='function')e._initialize();
 if(e.memory.buffer.byteLength!==2097152)throw Error('Unexpected Opus memory size');
 return{memoryBytes:2097152,decodePackets(packets,channels){
  if(![1,2].includes(channels)||!Array.isArray(packets)||packets.length>120000)throw Error('Invalid Opus packet request');let state=0,input=0,output=0,total=0;const parts=[];
  try{state=e.collection_opus_create(channels);input=e.malloc(1048576);output=e.malloc(5760*channels*4);if(!state||!input||!output)throw Error('Opus fixed-memory allocation failed');for(const packet of packets){if(!(packet instanceof Uint8Array)||packet.length<1||packet.length>1048576)throw Error('Invalid Opus packet length');new Uint8Array(e.memory.buffer,input,packet.length).set(packet);const frames=e.collection_opus_decode(state,input,packet.length,output,5760);if(frames<0||frames>5760)throw Error('Opus decode failed: '+frames);total+=frames;if(total*channels*4>16*1024*1024)throw Error('Decoded Opus exceeds bound');const source=new Float32Array(e.memory.buffer,output,frames*channels),planes=Array.from({length:channels},()=>new Float32Array(frames));for(let i=0;i<frames;i++)for(let c=0;c<channels;c++)planes[c][i]=source[i*channels+c];parts.push(planes);}return{parts,total};}
  finally{if(output)e.free(output);if(input)e.free(input);if(state)e.collection_opus_destroy(state);}
 }};
}
let shared;
export function loadOpusPacketDecoder(){return shared??=createOpusPacketDecoder().catch(error=>{shared=undefined;throw error;});}
