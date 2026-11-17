/* Public artifact test: generated modules/codecs, not original game payloads. */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'ut2k4-public-build-'));
try{
 execFileSync('sh',['tools/build-site.sh',out],{cwd:root});const base=path.join(out,'runtime/collection'),index=JSON.parse(fs.readFileSync(path.join(base,'index.json')));
 assert.equal(index.activatedInLegacyLauncher,false);assert.equal(index.requiresAuthorizedGameData,true);assert(fs.readFileSync(path.join(out,'compat/DeferredMenu.u')).equals(fs.readFileSync(path.join(root,'mutators/deferred-menu/System/DeferredMenu.u'))));
 for(const name of ['loading-progress.mjs','transfer-telemetry.mjs','region-cache.mjs','audio-opus.mjs','basis-texture.mjs','terrain-predict.mjs','model-brotli.mjs','codecs/basis/basis-transcoder.mjs','codecs/basis/basis_transcoder.wasm','codecs/basis/LICENSE','codecs/basis/NOTICE','codecs/opus/decoder.mjs','codecs/opus/opus_decoder.wasm','codecs/opus/LICENSE','codecs/brotli/brotli-decoder.mjs','codecs/brotli/brotli-decoder.wasm','codecs/brotli/LICENSE']){assert(index.files.includes(name),name);assert(fs.readFileSync(path.join(base,name)).equals(fs.readFileSync(path.join(root,'runtime/collection',name))),name);}
 assert(!index.files.some(name=>/\.test\.|^fixtures\//.test(name)));assert(!index.files.some(name=>/\.ut2$|\.utx$|\.uax$|\.ukx$|\.usx$|SDLLaunch/.test(name)));
 for(const name of ['browser-asset-profile.json','remaining-asset-work.json','request-checklist.json'])assert(fs.readFileSync(path.join(out,'docs',name)).equals(fs.readFileSync(path.join(root,'docs',name))),name);
 for(const name of ['.local-runtime','private-deploy','node_modules','SDLLaunch.wasm','SDLLaunch.data','data','native'])assert(!fs.existsSync(path.join(out,name)),name);
 const html=fs.readFileSync(path.join(out,'index.html'),'utf8');assert(!html.includes('transfer-telemetry.mjs'));assert(!html.includes('basis-texture.mjs'));assert(html.includes('native-import.js'));console.log('PASS: public authored modules and licensed codec assets copied; no game distribution or legacy launcher activation');
}finally{fs.rmSync(out,{recursive:true,force:true});}
