// A single-call XZ decoder with a fixed four-MiB heap and no host imports.
export const wasmHash='fb28f6f1f34ba3676356cab29d0cdec6a1483d10a67f85bad7695b82f61dbaf8';
export async function createXzFrameDecoder({wasmBinary,fetcher=fetch}={}) {
  if(!wasmBinary){
    const r=await fetcher(new URL('./frame-decoder.wasm',import.meta.url),{credentials:'same-origin'});
    if(!r.ok)throw Error('XZ frame decoder unavailable');
    wasmBinary=await r.arrayBuffer();
  }
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',wasmBinary)),v=>v.toString(16).padStart(2,'0')).join('');
  if(digest!==wasmHash)throw Error('XZ decoder binary mismatch');
  const {instance}=await WebAssembly.instantiate(wasmBinary,{});
  return bindXzFrameDecoder(instance);
}
export function bindXzFrameDecoder(instance) {
  const api=instance.exports;api._initialize();
  const heap=new Uint8Array(api.memory.buffer),input=api.frame_input(),output=api.frame_output();
  return (compressed,n)=>{
    if(!(compressed instanceof Uint8Array)||compressed.length<1||compressed.length>1114112||
       !Number.isSafeInteger(n)||n<1||n>1048576)throw Error('XZ frame bounds');
    heap.set(compressed,input);
    if(api.decode_frame(compressed.length,n)!==0)throw Error('XZ frame integrity or length mismatch');
    return heap.slice(output,output+n);
  };
}
