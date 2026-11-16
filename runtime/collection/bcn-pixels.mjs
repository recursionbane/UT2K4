// BC1/BC3 reference pixel expansion for offline verification and alpha checks.
export function decodeBcPixels(input,width,height,format){
 if(!['BC1','BC2','BC3'].includes(format))throw Error('Unsupported BC reference format');
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input),size=format==='BC1'?8:16,bw=Math.ceil(width/4),bh=Math.ceil(height/4);if(bytes.length!==bw*bh*size)throw Error('BC payload size mismatch');
 const out=new Uint8Array(width*height*4),rgb=v=>[Math.round(((v>>11)&31)*255/31),Math.round(((v>>5)&63)*255/63),Math.round((v&31)*255/31)];
 for(let by=0;by<bh;by++)for(let bx=0;bx<bw;bx++){const base=(by*bw+bx)*size,c=base+(format!=='BC1'?8:0),a=bytes[c]|bytes[c+1]<<8,b=bytes[c+2]|bytes[c+3]<<8,p=[rgb(a),rgb(b)],transparent=format==='BC1'&&a<=b;
  p.push(p[0].map((v,k)=>transparent?Math.floor((v+p[1][k])/2):Math.floor((2*v+p[1][k])/3)));p.push(transparent?[0,0,0]:p[0].map((v,k)=>Math.floor((v+2*p[1][k])/3)));
  const alpha=[255,255];let alphaBits=0n;if(format==='BC3'){alpha[0]=bytes[base];alpha[1]=bytes[base+1];if(alpha[0]>alpha[1])for(let i=1;i<=6;i++)alpha.push(Math.floor(((7-i)*alpha[0]+i*alpha[1])/7));else{for(let i=1;i<=4;i++)alpha.push(Math.floor(((5-i)*alpha[0]+i*alpha[1])/5));alpha.push(0,255);}for(let i=0;i<6;i++)alphaBits|=BigInt(bytes[base+2+i])<<BigInt(i*8);}
  let bits=(bytes[c+4]|bytes[c+5]<<8|bytes[c+6]<<16|bytes[c+7]<<24)>>>0;
  for(let i=0;i<16;i++){const x=bx*4+(i&3),y=by*4+(i>>2),selector=bits&3;bits>>>=2;const av=format==='BC2'?((bytes[base+(i>>1)]>>>((i&1)*4))&15)*17:format==='BC3'?alpha[Number((alphaBits>>BigInt(i*3))&7n)]:(transparent&&selector===3?0:255);if(x<width&&y<height){const at=(y*width+x)*4;out.set(p[selector],at);out[at+3]=av;}}
 }
 return out;
}
