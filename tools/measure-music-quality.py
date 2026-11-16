from pathlib import Path
import concurrent.futures,json,subprocess,re,math,argparse
root=Path(__file__).resolve().parents[1];parser=argparse.ArgumentParser();parser.add_argument('--files',type=Path,default=root/'.local-runtime/collection/files');parser.add_argument('--corpus',type=Path,default=root/'.local-runtime/audio/music-corpus');args=parser.parse_args();out=args.corpus.resolve();files=args.files.resolve();rows=json.loads((out/'inventory.json').read_text());selected=[r for r in rows if r['decision']=='candidate']
def stats(path):
 r=subprocess.run(['ffmpeg','-hide_banner','-nostdin','-i',str(path),'-af','astats=metadata=0:reset=0','-f','null','-'],stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,text=True)
 if r.returncode:raise RuntimeError('Audio quality decoder error')
 rms=re.findall(r'RMS level dB: ([\-\w.]+)',r.stderr);peak=re.findall(r'Peak level dB: ([\-\w.]+)',r.stderr)
 return {'rmsDb':float(rms[-1]),'peakDb':float(peak[-1])}
def measure(r):
 x=stats(files/r['sourcePath']);y=stats(root/r['candidatePath']);delta=y['rmsDb']-x['rmsDb'] if math.isfinite(x['rmsDb']) and math.isfinite(y['rmsDb']) else 0 if x['rmsDb']==y['rmsDb'] else None;x={k:v if math.isfinite(v)else None for k,v in x.items()};y={k:v if math.isfinite(v)else None for k,v in y.items()};return {'logical':r['logical'],'candidateSha256':r['candidateSha256'],'source':x,'candidate':y,'rmsDeltaDb':round(delta,4)if delta is not None else None,'levelStable':delta is not None and abs(delta)<.5,'catastrophicDownmix':delta is None or delta < -9.0,'downmixThresholdDb':-9.0,'meaning':'Objective level/peak check only; not a perceptual transparency or listening test'}
results=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=2)as pool:
 for r in pool.map(measure,selected):results.append(r);print(json.dumps({'complete':len(results),'total':len(selected),'logical':r['logical'],'rmsDeltaDb':r['rmsDeltaDb']}),flush=True)
(out/'quality.json').write_text(json.dumps(results,indent=2)+'\n')
