function streamURL(value, base) {
  const url = new URL(value,base);
  const local = ['127.0.0.1','localhost','[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password) {
    throw Error('Use an HTTPS asset manifest or an HTTP loopback source on your computer.');
  }
  return url;
}
async function openStream(source) {
  const url = streamURL(source, location.href);
  const response = await fetch(url, {credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(15000)});
  if (!response.ok) throw Error('Stream manifest returned HTTP '+response.status);
  const raw = await response.json();
  const wrapped = raw.format === 'ut2k4-stream-v1';
  const paths = wrapped ? raw.files : raw;
  const sizes = Object.create(null);
  for (const [path,size] of Object.entries(paths)) {
    if (gamePath(path) && Number.isSafeInteger(size) && size>=0 && !path.includes('..') && !path.includes('\\')) sizes[path]=size;
  }
  const names = new Set(Object.keys(sizes).map(s=>s.toLowerCase()));
  if (!names.has('system/core.u')||!names.has('maps/dm-antalus.ut2')) throw Error('The stream manifest must index a full UT2004 installation.');
  const base=streamURL((wrapped&&raw.data)||'data/',url);
  if (!base.pathname.endsWith('/')) base.pathname+='/';
  const id=crypto.randomUUID();
  const info={id,sizes,count:Object.keys(sizes).length,remote:base.href,source:url.href,
    runtime:wrapped && raw.runtime ? streamURL(raw.runtime,url).href : null,
    client:wrapped && raw.client ? streamURL(raw.client,url).href : null};
  await mediaSave([['dataset/'+id,sizes],['current-game',info]]);
  return info;
}
async function streamFile(request,base,path,size) {
  const file=new URL(path.split('/').map(encodeURIComponent).join('/'),base);
  const range=request.headers.get('Range'),headers={};
  if (range) headers.Range=range;
  const response=await fetch(file,{method:request.method,headers,credentials:'omit',signal:request.signal});
  // Do not silently download a whole multi-megabyte package from a server that ignores Range.
  if (range && response.status!==206) {
    await response.body?.cancel();
    return new Response('Asset server must support HTTP ranges for '+path,{status:502});
  }
  if (!response.ok) return new Response('Asset host returned '+response.status,{status:response.status});
  const copied=new Headers(response.headers);
  if(range){
    const m=/^bytes=(\d+)-(\d+)$/.exec(range);
    if(!m) return new Response('Unsupported byte range',{status:416});
    const end=Math.min(Number(m[2]),size-1);
    const expected='bytes '+m[1]+'-'+end+'/'+size;
    const actual=copied.get('Content-Range');
    if(actual!==expected) throw Error('Expose a matching Content-Range header on the asset host: '+path);
  }
  return new Response(response.body,{status:response.status,headers:copied});
}
