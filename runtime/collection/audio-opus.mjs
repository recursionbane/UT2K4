// Lossy audio transport adapter. Native packages retain their PCM byte layout.
const text=new TextDecoder('ascii');
const maxEncoded=32*1024*1024,maxPCM=16*1024*1024;
const bytes=value=>value instanceof Uint8Array?value:new Uint8Array(value);
export async function digest(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export function demuxOpus(value){
 const b=bytes(value),v=new DataView(b.buffer,b.byteOffset,b.byteLength),packets=[];let at=0,pieces=[],length=0,serial=null,sequence=0,granule=0;
 if(b.length>maxEncoded)throw Error('Opus object exceeds bound');
 while(at<b.length){if(at+27>b.length||text.decode(b.subarray(at,at+4))!=='OggS'||b[at+4]!==0)throw Error('Invalid Ogg page');
  const flags=b[at+5],id=v.getUint32(at+14,true),seq=v.getUint32(at+18,true),n=b[at+26];
  if(serial===null)serial=id;if(id!==serial||seq!==sequence++)throw Error('Chained or unordered Ogg unsupported');
  if(Boolean(flags&1)!==Boolean(pieces.length))throw Error('Invalid continued packet');
  if(at+27+n>b.length)throw Error('Truncated Ogg lacing');let body=at+27+n;
  const g=v.getBigUint64(at+6,true);if(g!==0xffffffffffffffffn){if(g>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Ogg timeline exceeds bound');granule=Number(g);}
  for(let i=0;i<n;i++){const count=b[at+27+i];if(body+count>b.length)throw Error('Truncated Ogg body');pieces.push(b.subarray(body,body+count));length+=count;body+=count;if(length>1024*1024)throw Error('Opus packet exceeds bound');if(count<255){const packet=new Uint8Array(length);let p=0;for(const piece of pieces){packet.set(piece,p);p+=piece.length;}packets.push(packet);pieces=[];length=0;}}
  at=body;
 }
 if(pieces.length||packets.length<3)throw Error('Incomplete Opus stream');const head=packets.shift();
 if(text.decode(head.subarray(0,8))!=='OpusHead'||head.length<19||head[8]>15||head[18]!==0||![1,2].includes(head[9]))throw Error('Unsupported Opus mapping');
 if(text.decode(packets.shift().subarray(0,8))!=='OpusTags')throw Error('Missing Opus tags');const h=new DataView(head.buffer,head.byteOffset,head.byteLength),preSkip=h.getUint16(10,true);
 if(granule<preSkip)throw Error('Invalid final Opus granule');return{packets,channels:head[9],preSkip,frames:granule-preSkip,gain:10**(h.getInt16(16,true)/256/20)};
}
function packetFrames(p){if(!p.length)throw Error('Empty Opus packet');const config=p[0]>>3,frame=config>=16?120<<(config&3):config>=12?480<<(config&1):[480,960,1920,2880][config&3],code=p[0]&3,count=code===0?1:code<3?2:p.length>1?p[1]&63:0,total=frame*count;if(!count||total>5760)throw Error('Invalid Opus duration');return total;}
async function webCodecsOpusSupported(){try{return typeof AudioDecoder!=='undefined'&&(await AudioDecoder.isConfigSupported({codec:'opus',sampleRate:48000,numberOfChannels:1})).supported;}catch{return false;}}
let fallbackModule;
async function opusFallback(){fallbackModule??=import('./codecs/opus/decoder.mjs');return(await fallbackModule).loadOpusPacketDecoder();}
export async function opusSupported(){if(await webCodecsOpusSupported())return true;try{await opusFallback();return true;}catch{return false;}}
export async function decodeOpus(value){
 const stream=demuxOpus(value);let parts=[],failure,total=0;
 if(!await webCodecsOpusSupported()){const decoded=(await opusFallback()).decodePackets(stream.packets,stream.channels);parts=decoded.parts;total=decoded.total;}else{
 // Raw-packet mode deliberately omits description: pre-skip/gain handled once here.
 const decoder=new AudioDecoder({output(data){try{if(data.numberOfChannels!==stream.channels||data.sampleRate!==48000)throw Error('Unexpected Opus output format');total+=data.numberOfFrames;if(total*stream.channels*4>maxPCM)throw Error('Decoded Opus exceeds bound');const planes=[];for(let c=0;c<stream.channels;c++){const plane=new Float32Array(data.numberOfFrames);data.copyTo(plane,{planeIndex:c,format:'f32-planar'});planes.push(plane);}parts.push(planes);}catch(e){failure=e;}finally{data.close();}},error(error){failure=error;}});
 try{decoder.configure({codec:'opus',sampleRate:48000,numberOfChannels:stream.channels});let position=0;for(const packet of stream.packets){const frames=packetFrames(packet);decoder.decode(new EncodedAudioChunk({type:'key',timestamp:Math.round(position*1e6/48000),duration:Math.round(frames*1e6/48000),data:packet}));position+=frames;if(decoder.decodeQueueSize>32)await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Opus decode stalled')),5000);decoder.addEventListener('dequeue',()=>{clearTimeout(timer);resolve();},{once:true});});if(failure)throw failure;}await decoder.flush();if(failure)throw failure;}finally{if(decoder.state!=='closed')decoder.close();}
 }
 if(total<stream.preSkip+stream.frames)throw Error('Truncated decoded Opus');const planes=Array.from({length:stream.channels},()=>new Float32Array(stream.frames));let inputAt=0;
 for(const part of parts){const n=part[0].length,start=Math.max(0,stream.preSkip-inputAt),end=Math.min(n,stream.preSkip+stream.frames-inputAt);if(end>start)for(let c=0;c<stream.channels;c++)planes[c].set(part[c].subarray(start,end),inputAt+start-stream.preSkip);inputAt+=n;}
 return{...stream,planes,sampleRate:48000};
}
export function reconstructPCM(decoded,region){
 const {frames,channels,sampleRate,bits,length}=region;
 if(!Number.isSafeInteger(frames)||frames<1||frames*channels*(bits/8)!==length||length>maxPCM||channels!==decoded.channels||![8,16].includes(bits)||!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>48000)throw Error('Invalid PCM shape');
 if(Math.abs(decoded.frames-frames*48000/sampleRate)>Math.ceil(48000/sampleRate)+1)throw Error('Opus sample count does not match original PCM');
 const out=new Uint8Array(length),view=new DataView(out.buffer),ratio=48000/sampleRate,cutoff=Math.min(1,1/ratio)*0.94,radius=20;
 // Windowed-sinc conversion preserves native sample rate and exact sample count.
 for(let i=0;i<frames;i++){const t=i*ratio,center=Math.floor(t),weights=[];let norm=0;for(let k=-radius+1;k<=radius;k++){const delta=t-(center+k),x=delta*cutoff,w=(Math.abs(x)<1e-9?1:Math.sin(Math.PI*x)/(Math.PI*x))*cutoff*(0.5+0.5*Math.cos(Math.PI*delta/radius));weights.push(w);norm+=w;}
  for(let c=0;c<channels;c++){let sample=0;for(let k=0;k<weights.length;k++){const source=Math.max(0,Math.min(decoded.frames-1,center+k-radius+1));sample+=decoded.planes[c][source]*weights[k];}sample=Math.max(-1,Math.min(1,sample/norm*decoded.gain));const index=i*channels+c;if(bits===16)view.setInt16(index*2,Math.max(-32768,Math.min(32767,Math.round(sample*32768))),true);else out[index]=Math.max(0,Math.min(255,Math.round(sample*128+128)));}
 }return out;
}
export function validateAudioDescriptor(d){
 if(d?.format!=='ue-pcm-opus-v1'||!Number.isSafeInteger(d.size)||d.size<1||!Array.isArray(d.regions)||d.regions.length>10000)throw Error('Invalid audio descriptor');let end=0;
 for(const r of d.regions){const p=r.params,e=r.encoded;if(r.codec!=='opus-pcm-v1'||!Number.isSafeInteger(r.offset)||!Number.isSafeInteger(r.length)||r.offset<end||r.length<1||r.offset+r.length>d.size||r.length>maxPCM||!p||!Number.isSafeInteger(p.frames)||p.frames*p.channels*p.bits/8!==r.length||p.decodedByteLength!==r.length||![1,2].includes(p.channels)||![8,16].includes(p.bits)||!Number.isSafeInteger(p.sampleRate)||p.sampleRate<8000||p.sampleRate>48000||!e||!/^[a-f0-9]{64}\.opus$/.test(e.url)||e.offset!==0||!Number.isSafeInteger(e.length)||e.length<1||e.length>maxEncoded||!/^[a-f0-9]{64}$/.test(e.sha256))throw Error('Invalid audio region');end=r.offset+r.length;}return d;
}
export async function decodeAudioRegion(region,value){
 if(region.codec!=='opus-pcm-v1')throw Error('Unknown audio region codec');
 return reconstructPCM(await decodeOpus(value),{...region.params,length:region.length});
}
export function createAudioOverlay({descriptors,readEncoded,budget=16*1024*1024,decoder=decodeOpus}){
 const map=new Map(Object.entries(descriptors).map(([name,d])=>[name.toLowerCase(),validateAudioDescriptor(d)])),cache=new Map(),pending=new Map();let used=0,generation=0;
 async function get(r){const key=r.encoded.sha256+':'+JSON.stringify(r.params);if(cache.has(key)){const value=cache.get(key);cache.delete(key);cache.set(key,value);return value;}if(pending.has(key))return pending.get(key);const epoch=generation;const task=(async()=>{const encoded=bytes(await readEncoded(r.encoded.url));if(encoded.length!==r.encoded.length||await digest(encoded)!==r.encoded.sha256)throw Error('Opus transport integrity failure');const pcm=reconstructPCM(await decoder(encoded),{...r.params,length:r.length});if(epoch===generation&&pcm.length<=budget){while(used+pcm.length>budget&&cache.size){const[first,value]=cache.entries().next().value;cache.delete(first);used-=value.length;}cache.set(key,pcm);used+=pcm.length;}return pcm;})();pending.set(key,task);try{return await task;}finally{pending.delete(key);}}
 return{async overlayRead(logical,offset,value){const output=bytes(value),d=map.get(logical.toLowerCase());if(!d)return output;if(!Number.isSafeInteger(offset)||offset<0||offset+output.length>d.size)throw Error('Audio read outside package');for(const r of d.regions){const start=Math.max(offset,r.offset),end=Math.min(offset+output.length,r.offset+r.length);if(start>=end)continue;const pcm=await get(r);output.set(pcm.subarray(start-r.offset,end-r.offset),start-offset);}return output;},clear(){generation++;cache.clear();used=0;},stats(){return{decodedBytes:used,decodedSounds:cache.size,inflight:pending.size};}};
}
