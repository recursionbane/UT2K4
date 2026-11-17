// Generate ordinary visual-mip alternatives for compact browser assets. Retain
// gameplay maps, authored UI, procedural data and uncertain material semantics.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import zlib from 'node:zlib';
import {readUe2TextureLayout,readUe2Package} from '../runtime/collection/ue2-texture-layout.mjs';
import BASIS from '../runtime/collection/codecs/basis/basis-transcoder.mjs';
import {pixelsFromDds,downsampleRgba} from './texture-convert.mjs';
import {encodeNativeImage} from './native-block-encode.mjs';
const [source,output,shardArg='0',shardsArg='1']=process.argv.slice(2),shard=Number(shardArg),shards=Number(shardsArg);
if(!source||!output||!Number.isInteger(shard)||!Number.isInteger(shards)||shard<0||shard>=shards)throw Error('Usage: source output shard shardCount');
const micro=process.argv.includes('--micro');
const guardFile=process.env.TERRAIN_TEXTURE_GUARD;
if(micro&&!guardFile)throw Error('A terrain dependency inventory is required for the smaller preview');
const terrainGuard=micro?JSON.parse(fs.readFileSync(guardFile)):{names:[],retainedMaps:[]};
const protectedNames=new Set(terrainGuard.names),protectedMaps=new Set(terrainGuard.retainedMaps);
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const write=(file,data)=>{fs.mkdirSync(path.dirname(file),{recursive:true});const part=file+'.part-'+process.pid;fs.writeFileSync(part,data);fs.renameSync(part,file);};
const module=await BASIS({wasmBinary:fs.readFileSync(new URL('../runtime/collection/codecs/basis/basis_transcoder.wasm',import.meta.url))});module.initializeBasis();
const manifest=JSON.parse(fs.readFileSync(path.join(source,'file-manifest.json')));
const entries=Object.entries(manifest).filter(([n,e])=>/\.(ut2|usx|ukx|utx|u)$/i.test(n)&&e.path.endsWith('.zst'));
const complete=[],retained=[];let scanned=0;
for(const [index,[logical,e]]of entries.entries()){
 if(index%shards!==shard)continue;
 if(protectedMaps.has(logical))continue;
 let raw,layout,pkg;
 try{raw=zlib.zstdDecompressSync(fs.readFileSync(path.join(source,e.path)));layout=readUe2TextureLayout(raw);pkg=readUe2Package(raw);}catch(err){retained.push({logical,reason:err.message});continue;}
 const regions=[];let generated=0;
 if(!layout.classes.Font)for(const t of layout.textures){
   const name=t.path||t.name,format=t.formatName==='RGBA8'?'BGRA8':t.formatName,props=t.properties;
   if(!['BC1','BC2','BC3','BGRA8'].includes(format)||props.bRealtime||props.bParametric||props.LODSet===5)continue;
   if(/(?:height|density|terrainmap|alphamap|lookup|displac|vertexdata|positiondata|weights|collision|physics|radar|reticle|scope|crosshair|glyph|font|menu|hud|interface|opacit(?:y)?map|normalmap|bumpmap|screenshot|levelshot|preview|(?:^|[._])lut)/i.test(name))continue;
   // Never synthesize height, layer-weight, collision or script data. A generated
   // replacement additionally requires positive visual evidence in the name or
   // the native player/weapon skin classification. Use only direct Texture exports.
   if(protectedNames.has(t.name.toLowerCase()))continue;
   const visual=(micro&&[1,2,3].includes(props.LODSet??1))||[2,3].includes(props.LODSet)||/brick|wall|floor|ceil|roof|tile|plank|rock|marble|stone|metal|rust|steel|skin|armor|body|leaf|foliage|branch|plant|bark|tree|glass|grate|fence|canopy|waterfall|flame|smoke|flare|corona|muzzle|splash|skybox|panorama/i.test(name);
   if(!visual)continue;
   const flag=pkg.exports[t.exportIndex-1].flags;if(!(flag&0x30000)&&(flag&0x40000))continue;
   const cap=/skybox|panorama/i.test(name)?(micro?64:128):[2,3].includes(props.LODSet)?(micro?32:64):(micro?8:32);
   const mips=t.mips.filter(x=>x.length&&x.width<=4096&&x.height<=4096);
   const targets=mips.filter(x=>x.length>=4096&&Math.max(x.width,x.height)>cap);
   if(!targets.length)continue;
   const small=mips.find(x=>Math.max(x.width,x.height)<=cap);
   let ew,eh,bytes,codec,proof;
   if(small){
      ew=small.width;eh=small.height;bytes=raw.subarray(small.offset,small.offset+small.length);
      codec='native-mip-zstd';proof={nativeMipSourceOffset:small.offset};
   }else{
      // Avoid synthesizing compact texture data in mixed terrain/script packages
      // unless a trusted purpose is explicit. Authored mip choices can be shared.
      if((layout.classes.TerrainInfo&&!micro)||layout.classes.Class)continue;
      const from=mips.at(-1);
      let scale=1;while(Math.max(from.width/scale,from.height/scale)>cap)scale*=2;
      ew=Math.max(1,from.width/scale);eh=Math.max(1,from.height/scale);
      if(!Number.isInteger(ew)||!Number.isInteger(eh))continue;
      const image=pixelsFromDds(module,raw.subarray(from.offset,from.offset+from.length),from.width,from.height,t.formatName);
      const target=downsampleRgba(image,from.width,from.height,ew,eh);
      bytes=encodeNativeImage(target,ew,eh,format);
      const actual=pixelsFromDds(module,bytes,ew,eh,t.formatName);
      let rgb=0,alpha=0,flips=0,originalVisible=0,visible=0;
      for(let j=0;j<actual.length;j+=4){for(let k=0;k<3;k++)rgb+=(actual[j+k]-target[j+k])**2;
        alpha+=(actual[j+3]-target[j+3])**2;flips+=(actual[j+3]>=128)!==(target[j+3]>=128);visible+=actual[j+3]>=128;}
      for(let j=3;j<image.length;j+=4)originalVisible+=image[j]>=128;
      const samples=ew*eh,psnr=rgb===0?99:10*Math.log10(255**2/(rgb/(samples*3)));
      if(psnr<23||alpha/samples>100||flips/samples>.025||Math.abs(visible/samples-originalVisible/(image.length/4))>.075)continue;
      codec='visual-mip-zstd';proof={generated:true};generated++;
   }
   const packed=zlib.zstdCompressSync(bytes,{params:{[zlib.constants.ZSTD_c_compressionLevel]:15}});
   const hash=sha(packed),url='images/'+hash+'.zst',dest=path.join(output,url);
   if(!fs.existsSync(dest))write(dest,packed);
   for(const mip of targets){
     const sx=mip.width/ew,sy=mip.height/eh;
     if(!Number.isInteger(sx)||!Number.isInteger(sy)||sx<1||sy<1||(sx&(sx-1))||(sy&(sy-1)))continue;
     regions.push({offset:mip.offset,length:mip.length,codec,encoded:{url,offset:0,length:packed.length,sha256:hash},params:{nativeFormat:format,width:mip.width,height:mip.height,encodedWidth:ew,encodedHeight:eh,decodedByteLength:mip.length,nativeMipSha256:sha(bytes),...proof}});
   }
 }
 if(regions.length){
   regions.sort((a,b)=>a.offset-b.offset);const receipt='receipts/'+sha(Buffer.from(logical)).slice(0,32)+'.json';
   write(path.join(output,receipt),JSON.stringify({logical,sourceSha256:sha(raw),size:raw.length,regions,generated}));
   complete.push({logical,receipt,regions:regions.length,generated});
 }
 if(++scanned%100===0)console.log(JSON.stringify({scanned,accepted:complete.length}));
}
write(path.join(output,'shard-'+shard+'.json'),JSON.stringify({complete,retained,scanned,finished:true}));
