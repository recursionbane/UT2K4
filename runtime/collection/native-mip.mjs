/** Preserve an authored smaller mip exactly; expand only requested native bytes. */
import {upscaleBcRange,upscaleBgraRange} from './bcn-upscale.mjs';
export function createNativeMipDecoder({decodeZstd,maxBytes=4*1024*1024}={}) {
  if(typeof decodeZstd!=='function'||!Number.isSafeInteger(maxBytes)||maxBytes<1)throw Error('Invalid native mip decoder configuration');
  const cache=new Map(),pending=new Map();let kept=0;
  const sha=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),x=>x.toString(16).padStart(2,'0')).join('');
  function shape(region){
    const p=region?.params,format=p?.nativeFormat;
    if(region?.codec!=='native-mip-zstd'||!['BC1','BC2','BC3','BGRA8'].includes(format))throw Error('Unsupported native mip codec');
    const {width,height,encodedWidth:sw,encodedHeight:sh}=p;
    if(![width,height,sw,sh].every(Number.isSafeInteger)||sw<1||sh<1||width<sw||height<sh||width>4096||height>4096||sw>512||sh>512)throw Error('Invalid native mip dimensions');
    for(const ratio of [width/sw,height/sh])if(!Number.isInteger(ratio)||(ratio&(ratio-1)))throw Error('Native mip scale must be a power of two');
    const size=(w,h)=>format==='BGRA8'?w*h*4:Math.ceil(w/4)*Math.ceil(h/4)*(format==='BC1'?8:16);
    const expected=size(width,height),small=size(sw,sh);
    if(region.length!==expected||p.decodedByteLength!==expected||small>1024*1024||!/^[a-f0-9]{64}$/.test(p.nativeMipSha256))throw Error('Invalid native mip byte identity');
    return {width,height,sw,sh,format,expected,small};
  }
  async function small(region,encoded,d){
    const key=region.params.nativeMipSha256+'#'+d.format+'#'+d.sw+'x'+d.sh;
    if(cache.has(key)){const value=cache.get(key);cache.delete(key);cache.set(key,value);return value;}
    if(!pending.has(key))pending.set(key,(async()=>{
      if(!(encoded instanceof Uint8Array)||encoded.length>2*1024*1024)throw Error('Encoded native mip exceeds bound');
      const value=new Uint8Array(await decodeZstd(encoded,d.small));
      if(value.length!==d.small||await sha(value)!==region.params.nativeMipSha256)throw Error('Authored native mip integrity mismatch');
      if(value.length<=maxBytes){while(cache.size&&kept+value.length>maxBytes){const first=cache.keys().next().value;kept-=cache.get(first).length;cache.delete(first);}cache.set(key,value);kept+=value.length;}
      return value;
    })().finally(()=>pending.delete(key)));
    return pending.get(key);
  }
  async function decodeRange(region,encoded,offset,length){
    const d=shape(region);
    if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||offset<0||length<0||offset+length>d.expected)throw Error('Native mip read outside bounds');
    if(!length)return new Uint8Array(0);
    const data=await small(region,encoded,d);
    return d.format==='BGRA8'?upscaleBgraRange(data,d.sw,d.sh,d.width,d.height,offset,length):upscaleBcRange(data,d.sw,d.sh,d.width,d.height,d.format,offset,length);
  }
  const decode=(region,encoded)=>decodeRange(region,encoded,0,region.length);
  decode.decodeRange=decodeRange;decode.stats=()=>({smallCacheBytes:kept,smallCacheEntries:cache.size});return decode;
}
