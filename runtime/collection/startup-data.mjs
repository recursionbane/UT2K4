import {menuUserIni} from './startup-policy.mjs';
const NAMES=['/System/Build.ini','/System/DefUser.ini','/System/Default.ini','/System/Packages.md5'];
const ORIGINAL=[55,10602,22016,64146];
export function embeddedIndex(loader){
 const marker='loadPackage(';let at=-1,start=-1;
 while((at=loader.indexOf(marker,at+1))>=0){let n=at+marker.length;while(/\s/.test(loader[n]||''))n++;if(loader[n]==='{'){if(start!==-1)throw Error('Multiple embedded package literals');start=n;}}
 if(start<0)throw Error('Embedded package literal absent');
 let depth=0,quote=false,escape=false,end=-1;
 for(let i=start;i<loader.length;i++){const c=loader[i];if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')quote=false;continue;}if(c==='"'){quote=true;continue;}if(c==='{')depth++;else if(c==='}'&&!--depth){end=i+1;break;}}
 if(end<0)throw Error('Unterminated embedded package literal');
 const raw=loader.slice(start,end);
 // Only these Emscripten metadata keys may use JavaScript's unquoted spelling.
 const json=raw.replace(/([{,]\s*)(files|filename|start|end|remote_package_size)\s*:/g,'$1"$2":');
 let index;try{index=JSON.parse(json);}catch{throw Error('Invalid embedded package metadata');}
 if(Object.keys(index).sort().join(',')!=='files,remote_package_size'||!Array.isArray(index.files)||index.files.length!==4)throw Error('Unexpected embedded package schema');
 let cursor=0;for(let i=0;i<4;i++){const f=index.files[i];if(Object.keys(f).sort().join(',')!=='end,filename,start'||f.filename!==NAMES[i]||f.start!==cursor||!Number.isSafeInteger(f.end)||f.end<f.start)throw Error('Invalid embedded file layout');cursor=f.end;}
 if(index.remote_package_size!==cursor)throw Error('Embedded package total mismatch');
 if((cursor===96819||/[{,]\s*files\s*:/.test(raw))&&index.files.some((f,i)=>f.end-f.start!==ORIGINAL[i]))throw Error('Pinned original byte counts mismatch');
 return {index,start,end};
}
function setIni(source,section,values){
 const wanted=section.toLowerCase(),keys=new Set(Object.keys(values).map(k=>k.toLowerCase())),remaining=new Map(Object.entries(values).map(([k,v])=>[k.toLowerCase(),[k,String(v)]]));
 const lines=source.replace(/\r\n/g,'\n').split('\n');let active=false,found=false;const out=[];
 function flush(){if(active)for(const [k,v]of remaining.values())out.push(k+'='+v);if(active)remaining.clear();}
 for(const line of lines){const h=line.match(/^\[([^\]]+)\]\s*$/);if(h){flush();active=h[1].toLowerCase()===wanted;if(active)found=true;out.push(line);continue;}const k=line.match(/^\s*([^;#=]+?)\s*=/);if(active&&k&&keys.has(k[1].toLowerCase())){const item=remaining.get(k[1].toLowerCase());if(item){out.push(item[0]+'='+item[1]);remaining.delete(k[1].toLowerCase());}continue;}out.push(line);}
 flush();if(!found){out.push('['+section+']');for(const [k,v]of Object.entries(values))out.push(k+'='+v);}
 return out.join('\n').replace(/\n*$/,'\n');
}
export function applyEmbeddedMenuDefaults({loader,data,mutators,lowMemory=true,userIni}){
 const bytes=Buffer.from(data),{index,start,end}=embeddedIndex(loader);if(bytes.length!==index.remote_package_size)throw Error('Embedded data length mismatch');
 const parts=index.files.map(f=>Buffer.from(bytes.subarray(f.start,f.end)));
 parts[1]=Buffer.from(menuUserIni(parts[1].toString('utf8'),mutators));
 let ini=parts[2].toString('utf8');ini=setIni(ini,'URL',{LocalMap:'NoIntro.ut2'});
 if(lowMemory){if(!/^\[SDL2Drv\.SDL2Client\]/mi.test(ini))throw Error('Pinned SDL2 client section absent');ini=setIni(ini,'SDL2Drv.SDL2Client',{TextureDetailWorld:'Low',TextureDetailTerrain:'Low',TextureDetailPlayerSkin:'Low',TextureDetailWeaponSkin:'Low',TextureDetailRenderMap:'Low',TextureDetailLightmap:'Low',TextureDetailInterface:'Normal',WindowedViewportX:1024,WindowedViewportY:768,FullscreenViewportX:1280,FullscreenViewportY:720});}
 // This is the existing no-gore policy, preserved explicitly when rebuilding config.
 ini=setIni(ini,'Engine.GameInfo',{GoreLevel:0});parts[2]=Buffer.from(ini);
 let cursor=0;const files=parts.map((p,i)=>{const f={filename:NAMES[i],start:cursor,end:cursor+p.length};cursor+=p.length;return f;});
 const next={files,remote_package_size:cursor};const result={loader:loader.slice(0,start)+JSON.stringify(next)+loader.slice(end),data:Buffer.concat(parts),index:next};
 if(userIni!==undefined)result.userIni=menuUserIni(String(userIni),mutators);
 return result;
}
