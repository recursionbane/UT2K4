// Strict UT2004 StaticMeshInstance grammar. FRawColorStream's Color+Revision
// matches UEViewer UnMesh2.h. Light masks are checked against vertex count;
// unfamiliar profiles fail closed instead of scanning for color-like bytes.
import{readUe2Package,readUe2Properties}from'./ue2-texture-layout.mjs';
const count=(r,max)=>{const n=r.compact();if(n<0||n>max)throw Error('Invalid instance array count');return n;};
export function readUe2InstancePayload(r,{readName,resolveObject}){
 const propertyStart=r.pos;readUe2Properties(r,readName);const properties={offset:propertyStart,length:r.pos-propertyStart};
 const vertices=count(r,1000000),colors={offset:r.pos,length:vertices*4,count:vertices,stride:4};r.skip(colors.length);const revision=r.i32(),lightCount=count(r,65536),lights=[];
 for(let i=0;i<lightCount;i++){const recordStart=r.pos,reference=r.compact(),object=resolveObject(reference);if(!reference||!object)throw Error('Invalid instance light reference');const length=count(r,125000);if(length!==Math.ceil(vertices/8))throw Error('Instance shadow mask does not match vertex count');const mask={offset:r.pos,length};r.skip(length);const applied=r.i32();if(applied!==0&&applied!==1)throw Error('Invalid instance applied-light boolean');lights.push({reference,mask,applied,record:{offset:recordStart,length:r.pos-recordStart}});}
 if(r.pos!==r.end)throw Error('Unrecognized instance trailing serialization');return{properties,colors,revision,lights};
}
export function readUe2InstanceLayout(bytes){const pkg=readUe2Package(bytes);if(pkg.version<112)throw Error('Unsupported old instance serialization');const instances=[];for(const e of pkg.exports){if(pkg.object(e.classIndex)?.name!=='StaticMeshInstance'||!e.size)continue;if(e.flags&0x02000000)throw Error('Instance state stack unsupported');const layout=readUe2InstancePayload(pkg.reader(e),{readName:pkg.name,resolveObject:pkg.object});instances.push({name:e.name,exportOffset:e.offset,exportLength:e.size,...layout});}return{format:'ue2-instance-lighting-v1',version:pkg.version,licensee:pkg.licensee,size:pkg.bytes.length,instances};}
// Visual lighting only. Alpha and all light masks/references stay bit-exact.
// Blocking adjacent vertex colors deliberately loses baked lighting detail;
// it does not remove vertices or alter any geometry/collision data.
export function reduceInstanceColors(input,{bits=4,blockVertices=1}={}){if(input.length%4||!Number.isInteger(bits)||bits<1||bits>8||!Number.isSafeInteger(blockVertices)||blockVertices<1||blockVertices>1000000)throw Error('Invalid instance color policy');const out=Uint8Array.from(input),levels=2**bits-1;let maxRgbError=0,sumSquared=0;
 for(let at=0;at<input.length;at+=blockVertices*4){const end=Math.min(input.length,at+blockVertices*4),n=(end-at)/4;for(let c=0;c<3;c++){let sum=0;for(let p=at;p<end;p+=4)sum+=input[p+c];const value=Math.round(Math.round(sum/n*levels/255)*255/levels);for(let p=at;p<end;p+=4){const error=Math.abs(input[p+c]-value);maxRgbError=Math.max(maxRgbError,error);sumSquared+=error*error;out[p+c]=value;}}}
 return{bytes:out,metrics:{bits,blockVertices,maxRgbError,rgbRmse:input.length?Math.sqrt(sumSquared/(input.length/4*3)):0,alphaBitExact:true}};}
