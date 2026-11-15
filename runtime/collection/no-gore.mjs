import zlib from 'node:zlib';
import crypto from 'node:crypto';
import {embeddedIndex} from './startup-data.mjs';
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
export function noGoreINI(bytes){
  const text=bytes.toString('utf8');
  const changed=text.replace(/^([ \t]*GoreLevel[ \t]*=[ \t]*)[0-2]([ \t]*\r?)$/gmi, (_,prefix,suffix)=>prefix+'0'+suffix);
  return Buffer.from(changed,'utf8');
}
export function globalNoGore({bytes,replace,fileManifest}){
  const loader=bytes('SDLLaunch.js').toString();
  const {index:metadata}=embeddedIndex(loader);
  const packaged=Buffer.from(bytes('SDLLaunch.data'));
  const entries=metadata.files;
  if(packaged.length!==metadata.remote_package_size)throw Error('Native startup data length mismatch');
  let found=false;
  for(const {filename:name,start:begin,end} of entries){
    if(!name.toLowerCase().endsWith('/default.ini'))continue;
    const raw=packaged.subarray(Number(begin),Number(end));
    const patched=noGoreINI(raw);
    if(patched.length!==raw.length)throw Error('Configuration edit changed native preload offsets');
    if(!/\[Engine\.GameInfo\][\s\S]*?\bGoreLevel=0\b/.test(patched.toString()))throw Error('No Gore default missing');
    patched.copy(packaged,Number(begin));found=true;
  }
  if(!found)throw Error('Base game default settings missing');
  replace('SDLLaunch.data',packaged,'application/octet-stream');
  for(const [name,item] of Object.entries(fileManifest)){
    if(!name.toLowerCase().endsWith('.ini'))continue;
    const encoded=bytes(item.path),compressed=item.path.endsWith('.zst');
    const raw=compressed?zlib.zstdDecompressSync(encoded):encoded,patched=noGoreINI(raw);
    if(patched.equals(raw))continue;
    const output=compressed?zlib.zstdCompressSync(patched):patched;
    replace(item.path,output,'application/octet-stream');
    fileManifest[name]={...item,size:patched.length,...(compressed?{compressedSize:output.length}:{})};
  }
  const shells=JSON.parse(bytes('shell-files.json'));
  const row=shells.files.find(v=>v.path==='SDLLaunch.data');
  if(!row)throw Error('Missing shell integrity record');
  row.size=packaged.length;row.sha256=sha(packaged);
  replace('shell-files.json',JSON.stringify(shells),'application/json');
  const meta=JSON.parse(bytes('meta.json'));meta.checksums.data='sha256-'+sha(packaged);
  replace('meta.json',JSON.stringify(meta),'application/json');
}
