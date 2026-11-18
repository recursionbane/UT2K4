/** Observes HTTP-encoded response bodies; decoded fetch chunks are never wire bytes. */
export function installTransferTelemetry(scope,options={}) {
  if(scope.__collectionTransferTelemetry)return scope.__collectionTransferTelemetry;
  const main=!!scope.document,origin=scope.location?.origin,workers=new Set(),readyWorkers=new WeakSet(),records=[],active=new Map(),decodeJobs=new Map(),jobAssignments=new Map();
  const prefix=scope.crypto?.randomUUID?.()||String(Math.random()).slice(2),now=()=>scope.performance?.now?.()||0;
  const epoch=()=>Number.isFinite(scope.performance?.timeOrigin)?scope.performance.timeOrigin+now():Date.now();
  let serial=0,phaseSerial=1,stage={stageId:'menu-1',stage:'menu'},lastActivity=now(),readyHint=false,finished=false,queryPending=false,menuPage=null,menuOpening=false;
  const history=[{at:epoch(),stage:{...stage}}],originalFetch=scope.fetch?.bind(scope),originalWorker=scope.Worker,seenObjects=new WeakSet(),standaloneSeen=new Set();
  const resource=(url,range='')=>{const u=new URL(url,scope.location.href);return u.pathname+u.search+'|'+range;};
  const assignedAt=at=>{for(let i=history.length-1;i>=0;i--)if(history[i].at<=at)return history[i].stage;return history[0].stage;};
  const countCurrent=map=>{let n=0;for(const id of map.values())if(id===stage.stageId)n++;return n;};
  function send(event,assigned=stage){const value={v:1,...assigned,at:epoch(),...event};if(main)scope.__collectionLoadingProgress?.emit(value);else scope.postMessage({__collectionLoadingEvent:value});}
  function emit(event){
    if(event.type!=='decode'){send(event);return;}
    const raw=String(event.jobId),existing=jobAssignments.get(raw),assigned=existing?.stage||(event.stageId?{stageId:event.stageId,stage:event.stage||stage.stage}:stage),id=existing?.id||prefix+'-decode-'+raw,startedAt=existing?.at||event.jobStartedAt||epoch();
    if(['complete','failed','cancelled'].includes(event.state)){decodeJobs.delete(id);jobAssignments.delete(raw);}else{decodeJobs.set(id,assigned.stageId);jobAssignments.set(raw,{id,stage:{...assigned},at:startedAt});}if(assigned.stageId===stage.stageId)lastActivity=now();send({...event,...(['failed','cancelled'].includes(event.state)?{loadedBytes:0}:{}),jobId:id,jobStartedAt:startedAt},assigned);
  }
  function phase(kind,map=''){
    menuOpening=false;
    stage={stageId:kind+'-'+(++phaseSerial),stage:kind,label:map||undefined};history.push({at:epoch(),stage:{...stage}});if(history.length>64)history.shift();readyHint=false;finished=false;lastActivity=now();
    const forecast=options.forecasts?.[kind==='menu'?'menu':map.toLowerCase()];send({type:'phase',state:'start',...(forecast?{forecastTransferBytes:forecast.transferBytes,forecastDecodeBytes:forecast.decodeBytes}:{})});
    for(const worker of workers)if(readyWorkers.has(worker))worker.postMessage({__collectionLoadingStage:{...stage}});
  }
  function observeLog(line){const browse=String(line).match(/(?:^|\n)(?:Log:\s*)?Browse:\s+([^?\s]+)/);if(browse&&!/^(entry|nointro|index)(\.ut2)?$/i.test(browse[1]))phase('match',browse[1].replace(/\.ut2$/i,''));if(/COLLECTION_STAGE_RENDERED\s+map=/i.test(line)&&stage.stage==='match')readyHint=true;}
  function endRecord(r,state='complete'){
    if(r.ended)return;r.ended=true;active.delete(r.id);if(r.stage.stageId===stage.stageId)lastActivity=now();
    const loaded=r.encoding==='identity'?r.received:state==='complete'?r.total:null;
    send({type:'transfer',requestId:r.id,resourceId:r.resourceId,requestStartedAt:r.startedAt,loadedBytes:loaded,totalBytes:r.total,state,source:'network',encoding:r.encoding},r.stage);
  }
  function performanceEntry(entry){
    if(!entry?.name||!/^https?:/.test(entry.name))return;const u=new URL(entry.name);if(u.origin!==origin||u.pathname==='/session')return;
    if(typeof entry==='object'){if(seenObjects.has(entry))return;seenObjects.add(entry);}
    const fingerprint=[entry.name,entry.startTime,entry.duration,entry.encodedBodySize,entry.decodedBodySize,entry.transferSize].join('@');
    let candidates=records.filter(r=>!r.timed&&r.url===entry.name&&entry.startTime>=r.start-3&&entry.startTime<=(r.responseAt??Infinity)+3);
    const encoded=Number(entry.encodedBodySize),sized=candidates.filter(r=>r.total!==null&&r.total===encoded);if(sized.length)candidates=sized;
    candidates.sort((a,b)=>Math.abs(entry.startTime-a.start)-Math.abs(entry.startTime-b.start));const r=candidates[0];
    if(!r){if(standaloneSeen.has(fingerprint)||records.some(x=>x.timed&&x.timingFingerprint===fingerprint))return;standaloneSeen.add(fingerprint);}
    if(r){r.timed=true;r.timingFingerprint=fingerprint;active.delete(r.id);if(r.stage.stageId===stage.stageId)lastActivity=now();}
    const known=Number.isFinite(encoded)&&encoded>=0&&(encoded>0||entry.transferSize>0||r?.total===0),cached=entry.deliveryType==='cache'||(entry.transferSize>0&&entry.transferSize<encoded)||(entry.transferSize===0&&encoded>0)||(encoded===0&&entry.decodedBodySize===0&&entry.transferSize>0&&r&&(r.total>0||r.received>0));if(!known)return;
    const id=r?.id||prefix+'-resource-'+(++serial),resourceId=r?.resourceId||resource(entry.name),startedAt=r?.startedAt||(scope.performance?.timeOrigin||epoch()-now())+entry.startTime,assigned=r?.stage||assignedAt(startedAt);
    send({type:'plan',resourceId,requestStartedAt:startedAt,transferTotalBytes:cached?0:encoded,certainty:'exact',cached},assigned);
    send({type:'transfer',requestId:id,resourceId,requestStartedAt:startedAt,loadedBytes:cached?0:encoded,totalBytes:cached?0:encoded,state:'complete',source:cached?'cache':'network',encoding:r?.encoding},assigned);
  }
  if(scope.PerformanceObserver)try{const observer=new scope.PerformanceObserver(list=>{for(const e of list.getEntries())performanceEntry(e);});observer.observe({type:'resource',buffered:true});}catch{}
  function metadata(wrapped,response){for(const name of ['url','type','redirected'])try{Object.defineProperty(wrapped,name,{value:response[name]});}catch{}const clone=wrapped.clone.bind(wrapped);try{Object.defineProperty(wrapped,'clone',{value:()=>metadata(clone(),response)});}catch{}return wrapped;}
  if(originalFetch)scope.fetch=async function(input,init){
    const value=typeof input==='string'?input:typeof input?.url==='string'?input.url:String(input),url=new URL(value,scope.location.href),method=String(init?.method||input?.method||'GET').toUpperCase();
    if(url.origin!==origin||!/^https?:$/.test(url.protocol)||method!=='GET'||url.pathname==='/session')return originalFetch(input,init);
    const headers=new Headers(init?.headers||input?.headers),range=headers.get('Range')||'',r={id:prefix+'-fetch-'+(++serial),url:url.href,resourceId:resource(url.href,range),stage:{...stage},start:now(),startedAt:epoch(),received:0,total:null,encoding:'identity',ended:false,timed:false};
    records.push(r);if(records.length>12000){let removed=0;for(let i=0;i<records.length&&removed<2000;)if(records[i].timed&&records[i].ended){records.splice(i,1);removed++;}else i++;}active.set(r.id,r.stage.stageId);lastActivity=now();
    let response;try{response=await originalFetch(input,init);}catch(error){endRecord(r,'failed');throw error;}
    r.responseAt=now();r.encoding=(response.headers.get('Content-Encoding')||'identity').toLowerCase();const declared=response.headers.get('Content-Length');r.total=declared!==null&&/^\d+$/.test(declared)&&Number.isSafeInteger(Number(declared))?Number(declared):null;
    send({type:'plan',resourceId:r.resourceId,requestStartedAt:r.startedAt,transferTotalBytes:r.total,certainty:r.total===null?'estimate':'exact'},r.stage);
    send({type:'transfer',requestId:r.id,resourceId:r.resourceId,requestStartedAt:r.startedAt,loadedBytes:r.encoding==='identity'?0:null,totalBytes:r.total,state:'active',source:'network',encoding:r.encoding},r.stage);
    if(!response.body||response.status<200||[204,205,304].includes(response.status)){r.total=0;endRecord(r);return response;}
    const reader=response.body.getReader();let lastReport=0;const release=()=>{try{reader.releaseLock();}catch{}};
    const stream=new ReadableStream({async pull(controller){try{const next=await reader.read();if(next.done){endRecord(r);release();controller.close();return;}r.received+=next.value.length;if(r.stage.stageId===stage.stageId)lastActivity=now();if(r.encoding==='identity'&&now()-lastReport>120){lastReport=now();send({type:'transfer',requestId:r.id,resourceId:r.resourceId,requestStartedAt:r.startedAt,loadedBytes:r.received,totalBytes:r.total,state:'active',source:'network',encoding:r.encoding},r.stage);}controller.enqueue(next.value);}catch(error){endRecord(r,'failed');release();controller.error(error);}},async cancel(reason){endRecord(r,'failed');try{await reader.cancel(reason);}finally{release();}}});
    return metadata(new Response(stream,{status:response.status,statusText:response.statusText,headers:response.headers}),response);
  };
  if(originalWorker)scope.Worker=class extends originalWorker{
    constructor(...args){super(...args);workers.add(this);this.addEventListener('message',e=>{if(e.data?.__collectionTelemetryReady){e.stopImmediatePropagation();readyWorkers.add(this);this.postMessage({__collectionLoadingStage:{...stage}});return;}if(!e.data?.__collectionLoadingEvent)return;e.stopImmediatePropagation();let event=e.data.__collectionLoadingEvent;
      if(main){const at=event.requestStartedAt||event.jobStartedAt||event.at;event={...event,...assignedAt(at)};if(event.type==='transfer'){if(event.state==='active')active.set(event.requestId,event.stageId);else active.delete(event.requestId);}if(event.type==='decode'){if(['failed','cancelled'].includes(event.state))event.loadedBytes=0;if(['complete','failed','cancelled'].includes(event.state))decodeJobs.delete(event.jobId);else decodeJobs.set(event.jobId,event.stageId);}if(event.stageId===stage.stageId)lastActivity=now();scope.__collectionLoadingProgress?.emit(event);}else scope.postMessage(e.data);
    });}
    terminate(){workers.delete(this);return super.terminate();}
  };
  if(!main){scope.addEventListener('message',e=>{if(!e.data?.__collectionLoadingStage)return;e.stopImmediatePropagation();stage={...e.data.__collectionLoadingStage};for(const worker of workers)if(readyWorkers.has(worker))worker.postMessage(e.data);});scope.postMessage({__collectionTelemetryReady:true});}
  const api={tracksFetch:!!originalFetch,emit,observeLog,phase,snapshot:()=>({stage:{...stage},active:countCurrent(active),activeAll:active.size,decodes:countCurrent(decodeJobs),readyHint,finished}),performanceEntry};scope.__collectionTransferTelemetry=api;
  if(main){
    // Begin before the native GUI handles the trusted activation. Subsequent
    // worker reads belong to this stage even while native page creation blocks.
    const activation=e=>{
      if(!finished||stage.stage!=='menu'||menuPage!=='ut2k4mainmenu')return;
      if(e.type==='keydown'&&!['Enter',' '].includes(e.key))return;
      if(e.type!=='keydown'&&(e.target!==scope.Module?.canvas||(e.button!==undefined&&e.button!==0)))return;
      if(e.type!=='keydown'){const r=scope.Module.canvas.getBoundingClientRect?.();if(!r?.width||!r?.height)return;const x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;if(x<0.43||x>0.70||y<0.62||y>0.71)return;}
      phase('menu','Opening Instant Action');menuOpening=true;
    };
    scope.addEventListener('pointerdown',activation,{capture:true});
    scope.addEventListener('keydown',activation,{capture:true});
    send({type:'phase',state:'start',...(options.forecasts?.menu?{forecastTransferBytes:options.forecasts.menu.transferBytes,forecastDecodeBytes:options.forecasts.menu.decodeBytes}:{})});scope.setInterval(async()=>{
    const queriedStage=stage.stageId;
    if(stage.stage==='menu'&&!queryPending&&typeof scope.ueExecResult==='function'&&scope.ufrontConfig?.launchState?.engineRunning){queryPending=true;try{const result=await scope.ueExecResult('getall GUIController ActivePage',1500);if(stage.stageId===queriedStage&&stage.stage==='menu'&&result?.ok){const page=/ActivePage\s*=\s*(\w+)'/i.exec(result.output||'')?.[1]?.toLowerCase();menuPage=page||null;if(menuOpening){if(page&&page!=='ut2k4mainmenu')readyHint=true;}else if(page==='ut2k4mainmenu')readyHint=true;}}catch{}finally{queryPending=false;}}
    if(!finished&&readyHint&&!countCurrent(active)&&!countCurrent(decodeJobs)&&now()-lastActivity>=300){finished=true;send({type:'plan',discoveryComplete:true});send({type:'ready'});}
  },500);}
  return api;
}
export function transferTelemetryClient(options={}){return '('+installTransferTelemetry.toString()+')(globalThis,'+JSON.stringify(options)+');';}
