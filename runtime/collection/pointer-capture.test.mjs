import assert from 'node:assert/strict';
import {safePointerCapture} from './pointer-capture.mjs';
const calls=[];
const target={isConnected:true,setPointerCapture(id){calls.push(['capture',id]);},releasePointerCapture(id){calls.push(['release',id]);}};
assert(safePointerCapture(target,7,true));assert(safePointerCapture(target,7,false));
assert.deepEqual(calls,[['capture',7],['release',7]]);
target.isConnected=false;assert.equal(safePointerCapture(target,8,true),false);assert.equal(calls.length,2);
target.isConnected=true;assert.equal(safePointerCapture(target,-1,true),false);assert.equal(safePointerCapture(target,NaN,true),false);
for(const name of ['InvalidStateError','NotFoundError']){target.setPointerCapture=()=>{throw new DOMException('inactive pointer',name);};assert.equal(safePointerCapture(target,9,true),false);}
const failure=new Error('unrelated implementation error');target.setPointerCapture=()=>{throw failure;};assert.throws(()=>safePointerCapture(target,9,true),e=>e===failure);
console.log('Pointer capture preserves native calls, handles only inactive/detached pointers, and rethrows unrelated errors.');
