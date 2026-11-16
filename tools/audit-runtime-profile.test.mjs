import test from 'node:test';import assert from 'node:assert/strict';import {auditRuntimeProfile} from './audit-runtime-profile.mjs';
test('active collection accounting shares encoded objects and excludes raw fallback copies',()=>{
 const index=Buffer.from(JSON.stringify({regions:[{encoded:{url:'shared.bin'}}]}));
 const source=new Map([['a.zst',Buffer.alloc(1000)],['a.zst.jit',Buffer.alloc(20)],['a.zst.jit.json',index],['b.zst',Buffer.alloc(2000)],['b.zst.jit',Buffer.alloc(30)],['b.zst.jit.json',index],['shared.bin',Buffer.alloc(5)],['track.ogg',Buffer.alloc(40)]]);
 const manifest={'a.utx':{path:'a.zst',size:3000,jit:{}},'b.utx':{path:'b.zst',size:5000,jit:{}},'track.ogg':{path:'track.ogg',size:40}};
 const report=auditRuntimeProfile({manifest,readFile:n=>{assert(source.has(n));return source.get(n);}});
 assert.equal(report.activeBytes,20+30+5+40+index.length*2);assert.equal(report.uniqueFiles,6);
 assert.equal(report.categories['encoded-regions'].bytes,5);assert(!report.files.some(f=>['a.zst','b.zst'].includes(f.name)));
});
