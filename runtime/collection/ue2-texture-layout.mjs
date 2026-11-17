// Bounded UT2004 UE2 layout reader. Grammar checked against UEViewer's
// UnPackage2.cpp, UnObject.cpp FPropertyTag, UnMaterial2.h FMipmap and
// UnCoreSerialize.cpp TLazyArray. No scanning for image signatures.
export class Ue2Reader {
 constructor(bytes,pos=0,end=bytes.length){this.bytes=bytes;this.view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);this.pos=pos;this.end=end;}
 need(n){if(!Number.isSafeInteger(n)||n<0||this.pos+n>this.end)throw Error('UE2 read outside declared bounds');}
 u8(){this.need(1);return this.bytes[this.pos++];}
 u16(){this.need(2);const n=this.view.getUint16(this.pos,true);this.pos+=2;return n;}
 f32(){this.need(4);const n=this.view.getFloat32(this.pos,true);this.pos+=4;if(!Number.isFinite(n))throw Error('Nonfinite UE2 float');return n;}
 u32(){this.need(4);const n=this.view.getUint32(this.pos,true);this.pos+=4;return n;}
 i32(){this.need(4);const n=this.view.getInt32(this.pos,true);this.pos+=4;return n;}
 compact(){const a=this.u8();let n=a&63,mul=64,b=a;if(a&64){for(let i=1;i<5;i++){b=this.u8();n+=(b&127)*mul;if(!(b&128))break;if(i===4)throw Error('Invalid UE2 compact index');mul*=128;}}if(n>((a&128)?2147483648:2147483647))throw Error('UE2 compact index overflow');return a&128?-n:n;}
 skip(n){this.need(n);this.pos+=n;}
 string(){const n=this.compact();if(!n)return '';const length=Math.abs(n)*(n<0?2:1);this.need(length);const b=this.bytes.subarray(this.pos,this.pos+length);this.pos+=length;if(n>0){if(b.at(-1)!==0)throw Error('Unterminated UE2 name');return new TextDecoder('windows-1252').decode(b.subarray(0,-1));}if(b.at(-1)!==0||b.at(-2)!==0)throw Error('Unterminated UTF16 UE2 name');return new TextDecoder('utf-16le').decode(b.subarray(0,-2));}
}
const FORMAT_NAMES={0:'P8',1:'RGBA7',2:'RGB16',3:'BC1',4:'RGB8',5:'RGBA8',6:'NODATA',7:'BC2',8:'BC3',9:'L8',10:'G16'};
export function readUe2Package(input){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input),r=new Ue2Reader(bytes);if(r.u32()!==0x9e2a83c1)throw Error('Not a little-endian UE package');const version=r.u16(),licensee=r.u16();
 if(version<68||version>128||licensee>29)throw Error('Unsupported UE2 serialization profile');const flags=r.u32(),nameCount=r.i32(),nameOffset=r.i32(),exportCount=r.i32(),exportOffset=r.i32(),importCount=r.i32(),importOffset=r.i32();
 for(const [count,offset]of [[nameCount,nameOffset],[exportCount,exportOffset],[importCount,importOffset]])if(count<0||count>1000000||offset<36||offset>=bytes.length)throw Error('Invalid UE2 table bounds');
 r.pos=52;const generations=r.i32();if(generations<0||generations>1024)throw Error('Invalid UE2 generation count');r.skip(generations*8);const spans=[[0,r.pos,'header']];
 const names=[];r.pos=nameOffset;for(let i=0;i<nameCount;i++){names.push(r.string());r.u32();}
 spans.push([nameOffset,r.pos,'names']);
 const name=rr=>{const n=rr.compact();if(n<0||n>=names.length)throw Error('Invalid UE2 name reference');return names[n];};
 const imports=[];r.pos=importOffset;for(let i=0;i<importCount;i++)imports.push({classPackage:name(r),className:name(r),outer:r.i32(),name:name(r)});
 spans.push([importOffset,r.pos,'imports']);
 const exports=[];r.pos=exportOffset;for(let i=0;i<exportCount;i++){const x={index:i+1,classIndex:r.compact(),superIndex:r.compact(),outer:r.i32(),name:name(r),flags:r.u32(),size:r.compact()};x.offset=x.size?r.compact():0;if(x.size<0||x.offset<0||x.offset+x.size>bytes.length)throw Error('Invalid UE2 export bounds');exports.push(x);}
 spans.push([exportOffset,r.pos,'exports']);for(const e of exports)if(e.size)spans.push([e.offset,e.offset+e.size,'object '+e.index]);const ordered=spans.filter(s=>s[1]>s[0]).sort((a,b)=>a[0]-b[0]);for(let i=1;i<ordered.length;i++)if(ordered[i][0]<ordered[i-1][1])throw Error('Overlapping UE2 serialized ranges');
 for(const ref of [...imports.map(i=>i.outer),...exports.flatMap(e=>[e.classIndex,e.superIndex,e.outer])])if(ref < -imports.length||ref>exports.length)throw Error('Invalid UE2 object reference');
 const object=idx=>idx<0?imports[-idx-1]:exports[idx-1];
 const objectPath=idx=>{const parts=[],seen=new Set();while(idx){if(seen.has(idx)||parts.length>64)throw Error('Cyclic UE2 object outer chain');seen.add(idx);const item=object(idx);if(!item)throw Error('Invalid UE2 object path');parts.unshift(item.name);idx=item.outer;}return parts.join('.');};
 return {bytes,version,licensee,flags,nameCount,exportCount,names,imports,exports,object,objectPath,name,reader:exp=>new Ue2Reader(bytes,exp.offset,exp.offset+exp.size)};
}
export function readUe2Properties(p,name){const props={};let tags=0;
  while(true){if(++tags>10000)throw Error('Too many UE2 texture properties');const key=name(p);if(key==='None')break;const info=p.u8(),type=info&15;if(!type)throw Error('Invalid UE2 property type');if(type===10)name(p);const code=(info>>4)&7;let size=[1,2,4,12,16][code];if(code===5)size=p.u8();if(code===6)size=p.u16();if(code===7)size=p.i32();if(type!==3&&(info&128)){const a=p.u8();if(a&128){p.u8();if(a&64){p.u8();p.u8();}}}if(type===3){props[key]=!!(info&128);continue;}p.need(size);if(type===1&&size===1)props[key]=p.bytes[p.pos];else if(type===2&&size===4)props[key]=p.view.getInt32(p.pos,true);p.skip(size);
  }
 return props;
}
export function readUe2TextureLayout(input){
 const pkg=readUe2Package(input),{bytes,version,licensee,flags,nameCount,exportCount,exports,object,name}=pkg;
 const textures=[];
 for(const exp of exports){const cls=object(exp.classIndex);if(cls?.name!=='Texture'||!exp.size)continue;if(version<100)throw Error('Unsupported legacy texture serialization profile');if(exp.flags&0x02000000)throw Error('Texture state-stack serialization unsupported');const p=pkg.reader(exp),props=readUe2Properties(p,name);
  const format=props.Format??0,mipCount=p.compact();if(mipCount<0||mipCount>16)throw Error('Invalid UE2 texture mip count');const mips=[];let previous;
  for(let mip=0;mip<mipCount;mip++){const lazyHeader=p.pos,skipEnd=p.i32(),length=p.compact(),offset=p.pos;if(length<0)throw Error('Negative UE2 mip length');p.skip(length);if(skipEnd!==p.pos&&!(skipEnd===0&&length===0))throw Error('UE2 lazy array end mismatch');const width=p.i32(),height=p.i32(),uBits=p.u8(),vBits=p.u8();if(width<1||height<1||width>16384||height>16384||width!==2**uBits||height!==2**vBits)throw Error('Unsupported UE2 mip dimensions');if(previous&&(width!==Math.max(1,previous.width>>1)||height!==Math.max(1,previous.height>>1)))throw Error('Invalid UE2 mip chain');let expected;if([3,7,8].includes(format))expected=Math.max(1,Math.ceil(width/4))*Math.max(1,Math.ceil(height/4))*(format===3?8:16);else if([0,9].includes(format))expected=width*height;else if([2,10].includes(format))expected=width*height*2;else if([1,5].includes(format))expected=width*height*4;else if(format===4)expected=width*height*3;if(length!==0&&expected!==undefined&&length!==expected)throw Error('UE2 mip byte length differs from declared format: '+exp.name+' mip='+mip+' format='+format+' dimensions='+width+'x'+height+' actual='+length+' expected='+expected);previous={width,height};mips.push({mip,offset,length,width,height,lazyHeader,skipEnd,missing:length===0});}
  if(p.pos!==p.end)throw Error('Unrecognized UE2 texture trailing serialization');textures.push({name:exp.name,path:pkg.objectPath(exp.index),exportIndex:exp.index,exportOffset:exp.offset,exportLength:exp.size,format,formatName:FORMAT_NAMES[format]??'UNKNOWN',properties:props,mips});
 }
 return {format:'ue2-texture-layout-v1',version,licensee,size:bytes.length,flags,names:nameCount,exports:exportCount,classes:exports.reduce((a,e)=>{const type=e.classIndex===0?'Class':object(e.classIndex)?.name||'Unknown';a[type]=(a[type]||0)+1;return a;},{}),textures};
}
