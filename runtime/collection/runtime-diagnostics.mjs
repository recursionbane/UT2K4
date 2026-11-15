// Diagnosis only: preserve and rethrow the original WASM trap; never claim a cause.
function once(s,a,b,label){if(s.split(a).length!==2)throw Error(label+' source seam changed');return s.replace(a,b);}
export function patchRuntimeDiagnostics(source){
 if(source.includes('__privateRuntimeFaultV1'))return source;
 const report=`try{if(!globalThis.__privateFaults)globalThis.__privateFaults=[];if(globalThis.__privateFaults.length<8){const fault={kind:'wasm-export-trap',name:String(error&&error.name||''),message:String(error&&error.message||error).replace(/https?:\\/\\/[^/\\s)]+/g,'[origin]'),exportName:wrapper.__privateExport||original.name||'',memoryBytes:typeof wasmMemory!=='undefined'?wasmMemory.buffer.byteLength:0,heapViewBytes:typeof HEAPU8!=='undefined'?HEAPU8.byteLength:0,asyncifyState:Asyncify.state,asyncifyDepth:Asyncify.exportCallStack.length,lastRead:globalThis.__privateLastJitRead||null,stack:String(error&&error.stack||'').replace(/https?:\\/\\/[^/\\s)]+/g,'[origin]').slice(0,10000)};globalThis.__privateFaults.push(fault);if(typeof ENVIRONMENT_IS_PTHREAD!=='undefined'&&ENVIRONMENT_IS_PTHREAD)postMessage({privateRuntimeFault:fault});else console.error('PRIVATE_RUNTIME_FAULT',JSON.stringify(fault));}}catch(_){} `;
 source=once(source,'try{return original(...args)}finally{if(!ABORT)','try{return original(...args)}catch(error){'+report+'throw error}finally{if(!ABORT)','Asyncify trap');
 source=once(source,'var wrapper=Asyncify.instrumentFunction(original);ret[x]=wrapper','var wrapper=Asyncify.instrumentFunction(original);wrapper.__privateExport=x;ret[x]=wrapper','export label');
 return '/* __privateRuntimeFaultV1 */\n'+source;
}
export function patchJitReadBounds(source){
 if(source.includes('__privateLastJitRead='))return source;
 const at='function jitRead(file,f,buffer,length,offset){';if(!source.includes(at))throw Error('JIT bounds seam absent');
 return source.replace(at,at+`\n      globalThis.__privateLastJitRead={path:f.path,size:f.size,buffer,length,offset,heapBytes:Module.HEAPU8.byteLength};\n      if(![buffer,length,offset].every(Number.isSafeInteger)||buffer<0||length<0||offset<0||buffer+Math.min(length,Math.max(0,f.size-offset))>Module.HEAPU8.byteLength){unservableReport(f,'JIT destination/offset bounds rejected');return 0;}\n`);
}
