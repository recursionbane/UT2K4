// Bounded USound layout: UObject properties → FName → optional UT2 float →
// TLazyArray<byte>. Checked against UEViewer Unreal/UnSound.h and TLazyArray.
import{readUe2Package,readUe2Properties}from'./ue2-texture-layout.mjs';
export function readPcmWave(bytes,offset,length){
 const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes),v=new DataView(b.buffer,b.byteOffset,b.byteLength),text=new TextDecoder('ascii');
 if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||offset<0||length<12||offset+length>b.length)throw Error('WAV outside Sound RawData');
 if(text.decode(b.subarray(offset,offset+4))!=='RIFF'||text.decode(b.subarray(offset+8,offset+12))!=='WAVE')return{supported:false,reason:'Not a RIFF WAVE payload'};
 const end=offset+8+v.getUint32(offset+4,true);if(end>offset+length||end<offset+12)throw Error('WAV RIFF boundary exceeds Sound RawData');let fmt,data;
 for(let at=offset+12;at+8<=end;){const id=text.decode(b.subarray(at,at+4)),n=v.getUint32(at+4,true),next=at+8+n;if(next>end)throw Error('WAV chunk exceeds RIFF boundary');if(id==='fmt '){if(n<16)throw Error('Short WAV format');fmt={codec:v.getUint16(at+8,true),channels:v.getUint16(at+10,true),sampleRate:v.getUint32(at+12,true),align:v.getUint16(at+20,true),bits:v.getUint16(at+22,true)};}if(id==='data'){if(data)throw Error('Multiple WAV sample payloads unsupported');data={offset:at+8,length:n};}at=next+(n&1);}
 if(!fmt||!data)throw Error('WAV format/data missing');if(fmt.codec!==1||![8,16].includes(fmt.bits)||![1,2].includes(fmt.channels))return{supported:false,...fmt,reason:'Unsupported WAV codec/channel/sample width'};
 if(fmt.align!==fmt.channels*fmt.bits/8||data.length%fmt.align)throw Error('PCM byte alignment mismatch');return{supported:true,...data,...fmt,frames:data.length/fmt.align,waveOffset:offset,waveLength:end-offset};
}
export function readUe2AudioLayout(input){
 const p=readUe2Package(input),sounds=[];for(const exp of p.exports){if(p.object(exp.classIndex)?.name!=='Sound'||!exp.size)continue;const sound={name:exp.name,exportIndex:exp.index,exportOffset:exp.offset,exportLength:exp.size};try{if(exp.flags&0x02000000)throw Error('Sound state-stack serialization unsupported');const r=p.reader(exp);readUe2Properties(r,p.name);sound.fileType=p.name(r);if(p.licensee>=2)sound.durationField=r.f32();const skipEnd=r.i32(),length=r.compact(),offset=r.pos;if(length<0)throw Error('Negative Sound RawData length');r.skip(length);if(skipEnd!==r.pos&&!(skipEnd===0&&length===0))throw Error('Sound lazy-array end mismatch');if(r.pos!==r.end)throw Error('Unrecognized Sound trailing serialization');sound.rawData={offset,length};if(length)sound.wave=readPcmWave(p.bytes,offset,length);else sound.reason='Empty Sound RawData';}catch(e){sound.reason=e.message;}sounds.push(sound);}
 return{format:'ue2-audio-layout-v1',version:p.version,licensee:p.licensee,size:p.bytes.length,sounds};
}
