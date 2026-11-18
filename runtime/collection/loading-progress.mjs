/** Phase-scoped loading telemetry. All transfer counts are HTTP-encoded BODY bytes,
 * excluding headers. Fetch chunks after Content-Encoding decoding are not wire bytes.
 * IDs must be stable across duplicate reports and unique across worker/request attempts.
 * See LOADING_PROGRESS_PROTOCOL for the public integration contract. */
export const LOADING_PROGRESS_PROTOCOL = Object.freeze({version:1,event:'collection-loading-progress',scope:'phase',transferBasis:'HTTP-encoded response body; not decoded fetch chunks',events:['phase','plan','transfer','decode','ready','error']});

export function createLoadingProgressModel(options={}){
 const stages=new Map(),listeners=new Set();let active=null,notificationQueued=false;
 const clock=options.clock||Date.now;const eventTime=e=>typeof e.at==='number'&&Number.isFinite(e.at)&&e.at>=0?e.at:clock();
 const schedule=options.schedule||(typeof globalThis.requestAnimationFrame==='function'?fn=>globalThis.requestAnimationFrame(fn):fn=>queueMicrotask(fn));
 const number=x=>Number.isSafeInteger(x)&&x>=0?x:null;
 const blank=()=>({transferLoaded:0,transferTotal:0,decodeLoaded:0,decodeTotal:0,transferUnknown:0,decodeUnknown:0,uncountedResponses:0,cached:0,retries:0,estimates:0});
 function measure(r){
  const a=blank();let networkCount=0,hasCache=r.cached,jobTotal=0,abandoned=0;
  for(const q of r.requests.values()){
   if(q.source==='cache'){hasCache=true;continue;}networkCount++;a.transferLoaded+=q.loadedBytes||0;if(q.loadedBytes===null)a.uncountedResponses++;
   const total=q.state==='failed'?q.loadedBytes:q.totalBytes;if(total===null)a.transferUnknown++;else a.transferTotal+=Math.max(total,q.loadedBytes||0);
  }
  if(r.hasTransferWork&&!networkCount&&!hasCache){if(r.transferTotalBytes===null)a.transferUnknown++;else a.transferTotal=r.transferTotalBytes;}
  for(const q of r.jobs.values()){if(['failed','cancelled'].includes(q.state)){abandoned+=q.abandonedTotalBytes||0;continue;}a.decodeLoaded+=q.loadedBytes;if(q.totalBytes===null)a.decodeUnknown++;else jobTotal+=Math.max(q.totalBytes,q.loadedBytes);}
  if(r.decodeTotalBytes!==null){a.decodeTotal=Math.max(Math.max(0,r.decodeTotalBytes-abandoned),jobTotal,a.decodeLoaded);a.decodeUnknown=0;}else a.decodeTotal=jobTotal;
  a.cached=Number(hasCache);a.retries=Math.max(0,networkCount-1);a.estimates=Number(r.certainty==='estimate');return a;
 }
 function resource(s,id){if(!s.resources.has(id)){const r={hasTransferWork:false,transferTotalBytes:null,decodeTotalBytes:null,certainty:'estimate',cached:false,requests:new Map(),jobs:new Map()};r.aggregate=measure(r);for(const k of Object.keys(s.totals))s.totals[k]+=r.aggregate[k];s.resources.set(id,r);}return s.resources.get(id);}
 function change(s,r,fn){const before=r.aggregate;fn();r.aggregate=measure(r);for(const k of Object.keys(s.totals))s.totals[k]+=r.aggregate[k]-before[k];}
 function make(e){return {id:e.stageId,stage:e.stage==='match'?'match':'menu',label:typeof e.label==='string'?e.label.slice(0,80):null,state:'loading',startedAt:eventTime(e),readyAt:null,discoveryComplete:false,resources:new Map(),requests:new Map(),jobs:new Map(),totals:blank(),forecastTransferBytes:number(e.forecastTransferBytes),forecastDecodeBytes:number(e.forecastDecodeBytes),message:null,revisions:0};}
 function snapshot(){
  const s=stages.get(active);if(!s)return {stageId:null,stage:'menu',state:'idle',ready:false,startedAt:null,readyAt:null,transfer:{loadedBytes:0,totalBytes:null,unknown:0},decode:{loadedBytes:0,totalBytes:null,unknown:0},cachedResources:0,retries:0,discoveryComplete:false,revisions:0};
  // Forecasts describe undiscovered work, not the completed phase's actual cost.
  // Keep measured/known totals and unknown markers after discovery; readiness also
  // guards against late plan events accidentally reactivating an old forecast.
  const forecasting=!s.discoveryComplete&&s.state!=='ready',transferForecast=forecasting?s.forecastTransferBytes:null,decodeForecast=forecasting?s.forecastDecodeBytes:null;
  const a=s.totals,transferBudget=Math.max(a.transferTotal,transferForecast||0,(a.transferTotal>0||transferForecast!==null)?a.transferLoaded:0),decodeBudget=Math.max(a.decodeTotal,decodeForecast||0,(a.decodeTotal>0||decodeForecast!==null)?a.decodeLoaded:0);return {stageId:s.id,stage:s.stage,label:s.label,state:s.state,ready:s.state==='ready',startedAt:s.startedAt,readyAt:s.readyAt,message:s.message,discoveryComplete:s.discoveryComplete,estimated:!s.discoveryComplete||a.estimates>0,revisions:s.revisions,cachedResources:a.cached,repeatDownloads:a.retries,retries:a.retries,transfer:{loadedBytes:a.transferLoaded,totalBytes:transferBudget||(!a.transferUnknown?0:null),knownTotalBytes:a.transferTotal,forecastBytes:transferForecast,unknown:a.transferUnknown,uncountedResponses:a.uncountedResponses},decode:{loadedBytes:a.decodeLoaded,totalBytes:decodeBudget||(!a.decodeUnknown?0:null),knownTotalBytes:a.decodeTotal,forecastBytes:decodeForecast,unknown:a.decodeUnknown}};
 }
 function notify(){if(notificationQueued)return;notificationQueued=true;schedule(()=>{notificationQueued=false;const s=snapshot();for(const fn of listeners)fn(s);});}
 function update(e){
  if(!e||e.v!==1||typeof e.stageId!=='string'||!e.stageId||e.scope==='archive')return snapshot();
  if(e.type==='phase'){
   if(!stages.has(e.stageId)&&e.state==='start'){stages.set(e.stageId,make(e));active=e.stageId;while(stages.size>4)stages.delete(stages.keys().next().value);}
   else if(e.state==='playing'&&stages.has(e.stageId)){const s=stages.get(e.stageId);s.state='ready';if(s.readyAt===null)s.readyAt=eventTime(e);s.discoveryComplete=true;}
   else if(e.state==='loading'&&active===e.stageId&&stages.get(e.stageId).state!=='ready'){stages.get(e.stageId).state='loading';stages.get(e.stageId).message=null;}
  }
  const s=stages.get(e.stageId);if(!s)return snapshot();
  if(e.type==='plan'){
   for(const key of ['forecastTransferBytes','forecastDecodeBytes'])if(key in e){const n=number(e[key]);if(s[key]!==n)s.revisions++;s[key]=n;}
   if(typeof e.discoveryComplete==='boolean')s.discoveryComplete=e.discoveryComplete;
   if(typeof e.resourceId==='string'&&e.resourceId){const r=resource(s,e.resourceId);change(s,r,()=>{if('transferTotalBytes'in e)r.hasTransferWork=true;for(const key of ['transferTotalBytes','decodeTotalBytes'])if(key in e){const n=number(e[key]);if(r[key]!==n)s.revisions++;r[key]=n;}r.certainty=e.certainty==='exact'?'exact':'estimate';if(typeof e.cached==='boolean')r.cached=e.cached;});}
  }else if(e.type==='transfer'&&typeof e.requestId==='string'&&typeof e.resourceId==='string'){
   const prior=s.requests.get(e.requestId);if(prior&&prior.resourceId!==e.resourceId)return snapshot();const r=resource(s,e.resourceId);
   change(s,r,()=>{r.hasTransferWork=true;const q=prior||{resourceId:e.resourceId,loadedBytes:null,totalBytes:null,state:'active',source:e.source==='cache'?'cache':'network'};const n=number(e.loadedBytes);if(n!==null)q.loadedBytes=Math.max(q.loadedBytes||0,n);const total=number(e.totalBytes);if(total!==null)q.totalBytes=Math.max(q.totalBytes||0,total);if(e.source==='cache'){q.source='cache';q.loadedBytes=0;q.totalBytes=0;r.cached=true;}if(q.state==='active'&&['active','complete','failed'].includes(e.state))q.state=e.state;s.requests.set(e.requestId,q);r.requests.set(e.requestId,q);});
  }else if(e.type==='decode'&&typeof e.jobId==='string'){
   const id=typeof e.resourceId==='string'?e.resourceId:e.jobId,prior=s.jobs.get(e.jobId);if(prior&&prior.resourceId!==id)return snapshot();const r=resource(s,id);
   change(s,r,()=>{let q=prior||{resourceId:id,loadedBytes:0,totalBytes:null,state:'queued'};if(q.state==='complete')return;if(['failed','cancelled'].includes(q.state)){if(!['queued','working'].includes(e.state))return;q={resourceId:id,loadedBytes:0,totalBytes:null,state:'queued'};}const total=number(e.totalBytes);if(['failed','cancelled'].includes(e.state)){q.abandonedTotalBytes=Math.max(q.totalBytes||0,total||0);q.loadedBytes=0;q.totalBytes=0;q.state=e.state;}else{const n=number(e.loadedBytes);if(n!==null)q.loadedBytes=Math.max(q.loadedBytes,n);if(total!==null)q.totalBytes=Math.max(q.totalBytes||0,total);if(['queued','working','complete'].includes(e.state))q.state=e.state;}s.jobs.set(e.jobId,q);r.jobs.set(e.jobId,q);});
  }else if(e.type==='ready'){s.state='ready';if(s.readyAt===null)s.readyAt=eventTime(e);s.discoveryComplete=true;}
  else if(e.type==='error'&&s.state!=='ready'){s.state='error';s.message=typeof e.message==='string'?e.message.slice(0,240):'Loading stopped';}
  notify();return snapshot();
 }
 return {update,snapshot,subscribe(fn){listeners.add(fn);fn(snapshot());return()=>listeners.delete(fn);}};
}

export function formatLoadingMB(bytes){return (Math.max(0,Number(bytes)||0)/1000000).toFixed(1)+' MB';}
export function loadingProgressView(s){
 const title=s.label||(s.stage==='match'?'Loading match':'Loading menu');
 function track(data,kind){const known=data.totalBytes!==null,uncertain=!!data.unknown||s.estimated;
  const amount=(data.uncountedResponses?'≥':'')+formatLoadingMB(data.loadedBytes),total=known?formatLoadingMB(data.totalBytes)+(data.unknown&&!data.forecastBytes?' +':''):null;
  const text=total&&data.totalBytes>0?amount+' / '+(uncertain?'~':'')+total:amount+(data.unknown?' · total unknown':'');
  // Do not invent a 99% wait or claim 100% before the native stage is ready.
  // Completed known work becomes indeterminate while dependencies/finalization
  // remain; the numeric byte counts stay truthful and never animate with time.
  const numeric=known&&data.totalBytes>0&&(!data.unknown||data.forecastBytes>0)&&(data.loadedBytes<data.totalBytes||s.ready);
  return {label:kind==='transfer'?'Download':'Decode',text,value:numeric?Math.min(data.loadedBytes,data.totalBytes):null,max:known&&data.totalBytes>0?data.totalBytes:1,waiting:!s.ready&&known&&data.totalBytes>0&&data.loadedBytes>=data.totalBytes};
 }
 const transfer=track(s.transfer,'transfer'),decode=track(s.decode,'decode');
 return {visible:s.state!=='idle'&&!s.ready,title:s.ready?'Ready':s.state==='error'?'Loading stopped':title,summary:(s.state==='error'?'Loading stopped':title)+' · '+transfer.text,transfer,decode,notice:s.message||(s.transfer.uncountedResponses?'Compressed response bytes are counted when measurable.':!s.discoveryComplete?(s.transfer.forecastBytes!==null&&s.transfer.forecastBytes!==undefined?'Estimated for this load; total may change as files are found.':'Total covers known files and may change as more are found.'):'Known files for this load.'),cache:s.cachedResources?s.cachedResources+' file'+(s.cachedResources===1?'':'s')+' reused locally':'',retry:s.retries?s.retries+' repeat download'+(s.retries===1?'':'s')+' included in download bytes':'',basis:'MB are decimal. Download counts HTTP-encoded body bytes, excluding headers. Decode counts verified output bytes.'};
}

export const LOADING_PROGRESS_CSS = `
#download-overlay{display:none!important}
#collection-loading{position:fixed;z-index:2147483645;top:calc(env(safe-area-inset-top,0px) + 8px);left:50%;transform:translateX(-50%);width:max-content;max-width:min(360px,calc(100vw - 440px));color:#d8e8f6;font:12px/1.4 system-ui,sans-serif;pointer-events:auto;touch-action:manipulation}
#collection-loading[hidden]{display:none!important}#collection-loading>summary{list-style:none;cursor:pointer;border:1px solid #52677e;border-radius:5px;background:#111d29ee;padding:6px 10px;display:flex;align-items:center;gap:7px;white-space:nowrap;overflow:hidden;font-variant-numeric:tabular-nums;box-shadow:0 2px 8px #0003}#collection-loading .clp-title{min-width:0;overflow:hidden;text-overflow:ellipsis}#collection-loading .clp-summary-count{flex:none;font-variant-numeric:tabular-nums}#collection-loading>summary::-webkit-details-marker{display:none}#collection-loading>summary::after{content:' ⌄';color:#8aabc5}#collection-loading[open]>summary::after{content:' ⌃'}#collection-loading summary:focus-visible{outline:2px solid #73b9ee;outline-offset:3px}
#collection-loading .clp-panel{position:absolute;top:calc(100% + 5px);left:50%;transform:translateX(-50%);width:min(310px,calc(100vw - 24px));box-sizing:border-box;padding:12px;background:#111d29f7;border:1px solid #52677e;border-radius:5px;box-shadow:0 8px 24px #0005}#collection-loading .clp-row{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:4px}#collection-loading .clp-count{font:11px/1.5 ui-monospace,'SFMono-Regular',monospace;white-space:nowrap}#collection-loading progress{display:block;width:100%;height:5px;margin:0 0 10px;accent-color:#73b9ee;border:0;background:#283747}#collection-loading progress[data-kind=decode]{accent-color:#d4b46b}#collection-loading progress::-webkit-progress-bar{background:#283747;border-radius:2px}#collection-loading progress::-webkit-progress-value{background:#73b9ee;border-radius:2px}#collection-loading progress[data-kind=decode]::-webkit-progress-value{background:#d4b46b}#collection-loading progress::-moz-progress-bar{background:#73b9ee}#collection-loading progress[data-kind=decode]::-moz-progress-bar{background:#d4b46b}#collection-loading p{margin:5px 0 0;color:#aabdd0;font-size:11px}#collection-loading .clp-basis{font-size:10px;color:#91a6ba}#collection-loading-status{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
@media(max-width:700px){#collection-loading{top:calc(env(safe-area-inset-top,0px) + 52px);max-width:calc(100vw - 24px)}#collection-loading>summary{padding:5px 9px;font-size:11px}#collection-loading .clp-panel{max-height:calc(100svh - 110px);overflow:auto}}
@media(prefers-reduced-motion:reduce){#collection-loading progress:indeterminate{animation:none}}
`;

export function installLoadingProgress(scope,options={}){
 if(!scope.document)return null;const doc=scope.document;if(scope.__collectionLoadingProgress?.destroy)scope.__collectionLoadingProgress.destroy();
 const schedule=fn=>(scope.requestAnimationFrame||scope.setTimeout).call(scope,fn),model=options.model||createLoadingProgressModel({schedule}),eventListeners=new Set();let root=null,style=null,announcement=null,unsubscribe=null,destroyed=false;
 function event(e){api.emit(e.detail);}const guarded=['pointerdown','pointerup','pointermove','mousedown','mouseup','mousemove','touchstart','touchmove','touchend','touchcancel','click','keydown','keyup','wheel'];function guard(e){if(root?.contains(e.target))e.stopImmediatePropagation();}for(const name of guarded)scope.addEventListener(name,guard,{capture:true});scope.addEventListener(LOADING_PROGRESS_PROTOCOL.event,event);
 // Publish the bridge synchronously in <head>; worker telemetry can arrive before
 // body/controls exist. The model retains it and mount renders the latest snapshot.
 const api={emit(e){const value=model.update(e);if(eventListeners.size){const observed=Object.freeze({...e});for(const fn of eventListeners)try{fn(observed);}catch{}}return value;},subscribeEvents(fn){if(typeof fn!=='function')throw new TypeError('Event observer must be a function');eventListeners.add(fn);return()=>eventListeners.delete(fn);},snapshot:()=>model.snapshot(),root:null,destroy(){destroyed=true;eventListeners.clear();unsubscribe?.();for(const name of guarded)scope.removeEventListener(name,guard,{capture:true});scope.removeEventListener(LOADING_PROGRESS_PROTOCOL.event,event);doc.removeEventListener?.('DOMContentLoaded',mount);root?.remove();announcement?.remove();style?.remove();if(scope.__collectionLoadingProgress===api)delete scope.__collectionLoadingProgress;}};scope.__collectionLoadingProgress=api;
 function mount(){
  if(destroyed||root||!doc.body)return;
  root=doc.createElement('details');const summary=doc.createElement('summary'),summaryTitle=doc.createElement('span'),summaryCount=doc.createElement('span'),panel=doc.createElement('div');summaryTitle.className='clp-title';summaryCount.className='clp-summary-count';summary.append(summaryTitle,summaryCount);style=doc.createElement('style');announcement=doc.createElement('span');root.id='collection-loading';root.hidden=true;root.setAttribute('data-loading-ui','');root.setAttribute('data-private-aim-ui','');summary.setAttribute('aria-controls','collection-loading-details');summary.title='Loading details';panel.id='collection-loading-details';panel.className='clp-panel';announcement.id='collection-loading-status';announcement.setAttribute('role','status');announcement.setAttribute('aria-live','polite');announcement.setAttribute('aria-atomic','true');style.textContent=LOADING_PROGRESS_CSS;
  const rows={};for(const kind of ['transfer','decode']){const row=doc.createElement('div'),label=doc.createElement('label'),count=doc.createElement('span'),bar=doc.createElement('progress');row.className='clp-row';count.className='clp-count';bar.id='collection-loading-'+kind;bar.setAttribute('data-kind',kind);label.htmlFor=bar.id;label.textContent=kind==='transfer'?'Download':'Decode';row.append(label,count);panel.append(row,bar);rows[kind]={count,bar};}
  const notice=doc.createElement('p'),cache=doc.createElement('p'),retry=doc.createElement('p'),basis=doc.createElement('p');basis.className='clp-basis';panel.append(notice,cache,retry,basis);root.append(summary,panel);(doc.head||doc.documentElement).append(style);doc.body.append(root,announcement);api.root=root;let lastStage=null,lastState=null,pending=false,latest=model.snapshot();
  function draw(){pending=false;if(destroyed)return;const s=latest,v=loadingProgressView(s);if(s.stageId!==lastStage){root.open=false;lastStage=s.stageId;announcement.textContent=v.title;}if(s.state!==lastState&&s.ready)announcement.textContent='Ready';lastState=s.state;
   if(!v.visible){root.open=false;if(root.contains(doc.activeElement))scope.Module?.canvas?.focus?.({preventScroll:true});}root.hidden=!v.visible;summaryTitle.textContent=v.title;summaryCount.textContent=v.transfer.text;summary.setAttribute('aria-label',v.summary+'. Show loading details');
   for(const kind of ['transfer','decode']){const x=v[kind],r=rows[kind];r.count.textContent=x.text;r.bar.max=x.max;if(x.value===null)r.bar.removeAttribute('value');else r.bar.value=x.value;r.bar.setAttribute('aria-label',x.label+' · '+x.text+(x.waiting?' · waiting for stage readiness':''));}notice.textContent=v.notice;cache.textContent=v.cache;cache.hidden=!v.cache;retry.textContent=v.retry;retry.hidden=!v.retry;basis.textContent=v.basis;
  }
  unsubscribe=model.subscribe(s=>{latest=s;if(!pending){pending=true;schedule(draw);}});
 }
 if(doc.body)mount();else doc.addEventListener('DOMContentLoaded',mount,{once:true});return api;
}

/** Self-contained classic script for an existing authenticated shell. No imports,
 * network requests, storage, game assets, or credentials are required. */
export function loadingProgressClient(){return `(()=>{const LOADING_PROGRESS_PROTOCOL=${JSON.stringify(LOADING_PROGRESS_PROTOCOL)};const LOADING_PROGRESS_CSS=${JSON.stringify(LOADING_PROGRESS_CSS)};const createLoadingProgressModel=${createLoadingProgressModel.toString()};const formatLoadingMB=${formatLoadingMB.toString()};const loadingProgressView=${loadingProgressView.toString()};(${installLoadingProgress.toString()})(globalThis);})();`;}
