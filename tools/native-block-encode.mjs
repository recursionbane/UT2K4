// Offline BC1/BC2/BC3 endpoint selection for very small visual mips.
// Preserve punch-through alpha mode and reconstruct BC2/BC3 alpha separately.
function rgb565(rgb) {
  return (Math.round(rgb[0]*31/255)<<11)|(Math.round(rgb[1]*63/255)<<5)|Math.round(rgb[2]*31/255);
}
function expand(c){
  const r=c>>11,g=(c>>5)&63,b=c&31;return [(r<<3)|(r>>2),(g<<2)|(g>>4),(b<<3)|(b>>2)];
}
function colorBlock(pixels,punch) {
  const visible=pixels.filter(p=>!punch||p[3]>=128);
  if(!visible.length)return Buffer.from([0,0,0,0,255,255,255,255]);
  const mean=[0,1,2].map(k=>visible.reduce((n,p)=>n+p[k],0)/visible.length),cov=Array.from({length:3},()=>Array(3).fill(0));
  for(const p of visible)for(let i=0;i<3;i++)for(let j=0;j<3;j++)cov[i][j]+=(p[i]-mean[i])*(p[j]-mean[j]);
  let dir=[.3,.6,.1];
  for(let n=0;n<4;n++){const v=cov.map(row=>row.reduce((a,x,i)=>a+x*dir[i],0)),s=Math.hypot(...v);if(!s)break;dir=v.map(x=>x/s);}
  let lo=Infinity,hi=-Infinity,a,b;
  for(const p of visible){const s=dir.reduce((v,x,k)=>v+p[k]*x,0);if(s<lo){lo=s;a=p;}if(s>hi){hi=s;b=p;}}
  let ca=rgb565(a),cb=rgb565(b);
  if(punch?ca>cb:ca<cb)[ca,cb]=[cb,ca];
  if(!punch&&ca===cb){if(ca<65535)ca++;else cb--;}
  const x=expand(ca),y=expand(cb),pal=[x,y];
  if(punch)pal.push(x.map((v,k)=>(v+y[k])/2));
  else {pal.push(x.map((v,k)=>(v*2+y[k])/3));pal.push(x.map((v,k)=>(v+y[k]*2)/3));}
  let idx=0;
  for(let i=0;i<16;i++){
    let best=3;
    if(!punch||pixels[i][3]>=128){let min=Infinity;for(let j=0;j<pal.length;j++){
      const error=pal[j].reduce((s,v,k)=>s+(v-pixels[i][k])**2,0);
      if(error<min){min=error;best=j;}
    }}
    idx=(idx|best<<(i*2))>>>0;
  }
  const out=Buffer.alloc(8);out.writeUInt16LE(ca,0);out.writeUInt16LE(cb,2);out.writeUInt32LE(idx,4);return out;
}
function alphaBlock(pixels,format) {
  const a=pixels.map(p=>p[3]),out=Buffer.alloc(8);
  if(format==='BC2'){for(let i=0;i<16;i++)out[i>>1]|=Math.round(a[i]/17)<<((i&1)*4);return out;}
  const low=Math.min(...a),high=Math.max(...a);
  out[0]=high;out[1]=low;const palette=[high,low];
  if(high>low){for(let i=1;i<=6;i++)palette.push(((7-i)*high+i*low)/7);}
  else palette.push(low,low,low,low,0,255);
  let bits=0n;
  for(let i=0;i<16;i++){let best=0;for(let j=1;j<8;j++)if(Math.abs(palette[j]-a[i])<Math.abs(palette[best]-a[i]))best=j;bits|=BigInt(best)<<BigInt(i*3);}
  for(let i=0;i<6;i++)out[i+2]=Number((bits>>BigInt(i*8))&255n);return out;
}
export function encodeNativeImage(rgba,width,height,format) {
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||width>512||height<1||height>512||rgba.length!==4*width*height)throw Error('Invalid visual mip');
  if(format==='BGRA8'){const b=Buffer.from(rgba);for(let i=0;i<b.length;i+=4)[b[i],b[i+2]]=[b[i+2],b[i]];return b;}
  if(!['BC1','BC2','BC3'].includes(format))throw Error('Unsupported block format');
  const blocks=[];
  for(let y=0;y<height;y+=4)for(let x=0;x<width;x+=4){
    const p=[];for(let dy=0;dy<4;dy++)for(let dx=0;dx<4;dx++){
      const i=4*(Math.min(height-1,y+dy)*width+Math.min(width-1,x+dx));p.push(rgba.subarray(i,i+4));
    }
    if(format!=='BC1')blocks.push(alphaBlock(p,format));
    blocks.push(colorBlock(p,format==='BC1'&&p.some(v=>v[3]<128)));
  }
  return Buffer.concat(blocks);
}
