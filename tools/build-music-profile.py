#!/usr/bin/env python3
"""Candidate-only music corpus: compatible Vorbis, exact comment packet/sample count, no source writes."""
from pathlib import Path
import argparse,concurrent.futures,hashlib,json,os,struct,subprocess,time
ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--files',type=Path,default=ROOT/'.local-runtime/collection/files');p.add_argument('--output',type=Path);p.add_argument('--encoder',type=Path,default=ROOT/'.local-runtime/audio/audio-vorbis-encode');p.add_argument('--only');p.add_argument('--all-folders',action='store_true');p.add_argument('--profile',choices=['balanced','compact','user64','mono-vbr0','mono-budget'],default='mono-vbr0');p.add_argument('--lowpass-khz',type=float,default=5.0);p.add_argument('--sample-rate',type=int,default=0);p.add_argument('--compact-rate',type=int,default=22050);p.add_argument('--compact-bitrate',type=int,default=24000);p.add_argument('--jobs',type=int,default=2);p.add_argument('--minimum-win',type=float,default=.10);a=p.parse_args();
if a.profile=='mono-budget' and (not 1 <= a.lowpass_khz <= 20 or a.sample_rate):
 p.error('mono-budget preserves the source rate and accepts a low-pass cutoff from 1 to 20 kHz')
a.files=a.files.resolve();a.output=(a.output or ROOT/(f'.local-runtime/audio-budget/{a.lowpass_khz:g}khz' if a.profile=='mono-budget' else '.local-runtime/audio/music-corpus'if a.profile=='balanced'else'.local-runtime/audio-compact/music'if a.profile in('user64','mono-vbr0')else'.local-runtime/audio-experimental/mono'+str(a.compact_rate)+'-'+str(a.compact_bitrate))).resolve();a.encoder=a.encoder.resolve();a.output.mkdir(parents=True,exist_ok=True)
manifest=json.loads((a.files/'file-manifest.json').read_text());start=time.monotonic();sha=lambda b:hashlib.sha256(b).hexdigest()
def ogg(path):
 b=path.read_bytes();at=0;packet=bytearray();packets=[];serial=None;sequence=0;granule=0;eos=False
 while at<len(b):
  if b[at:at+4]!=b'OggS'or at+27>len(b):raise ValueError('Invalid Ogg page')
  sid=struct.unpack_from('<I',b,at+14)[0];seq=struct.unpack_from('<I',b,at+18)[0]
  if serial is None:serial=sid
  if sid!=serial or seq!=sequence:raise ValueError('Chained/discontinuous stream retained unchanged')
  sequence+=1;flags=b[at+5];n=b[at+26];body=at+27+n
  if body>len(b):raise ValueError('Truncated lacing')
  g=struct.unpack_from('<Q',b,at+6)[0]
  if g!=0xffffffffffffffff:granule=g
  for count in b[at+27:at+27+n]:
   if body+count>len(b):raise ValueError('Truncated Ogg packet')
   packet.extend(b[body:body+count]);body+=count
   if count<255:packets.append(bytes(packet));packet.clear()
  at=body;eos=bool(flags&4)
 if packet or not eos or len(packets)<3:raise ValueError('Incomplete Ogg stream')
 head=packets[0]
 if head[:7]!=b'\x01vorbis'or packets[1][:7]!=b'\x03vorbis':raise ValueError('Non-Vorbis source retained')
 channels=head[11];rate=struct.unpack_from('<I',head,12)[0];nominal=struct.unpack_from('<i',head,20)[0]
 return {'sha256':sha(b),'bytes':len(b),'channels':channels,'rate':rate,'nominal':nominal,'frames':granule,'comment':packets[1],'audioPacketsSha256':sha(b''.join(packets[3:]))}
def retime_comments(packet,source_rate,target_rate):
 if source_rate==target_rate:return packet,[]
 if packet[:7]!=b'\x03vorbis':raise ValueError('Not a Vorbis comment packet')
 at=7;vendor_len=struct.unpack_from('<I',packet,at)[0];at+=4;vendor=packet[at:at+vendor_len];at+=vendor_len;count=struct.unpack_from('<I',packet,at)[0];at+=4;comments=[];changes=[]
 for i in range(count):
  n=struct.unpack_from('<I',packet,at)[0];at+=4;value=packet[at:at+n];at+=n
  key,sep,text=value.partition(b'=')
  if sep and key.upper()in[b'LOOPSTART',b'LOOPEND',b'LOOPLENGTH',b'LOOP_START',b'LOOP_END',b'LOOP_LENGTH']:
   if not text.isdigit():raise ValueError('Non-integer loop sample metadata; retain original')
   old=int(text);new=round(old*target_rate/source_rate);value=key+b'='+str(new).encode();changes.append({'key':key.decode('ascii'),'sourceSamples':old,'candidateSamples':new,'timeErrorSeconds':abs(new/target_rate-old/source_rate)})
  comments.append(value)
 if packet[at:]!=b'\x01':raise ValueError('Unexpected comment framing; retain original')
 return b'\x03vorbis'+struct.pack('<I',len(vendor))+vendor+struct.pack('<I',len(comments))+b''.join(struct.pack('<I',len(c))+c for c in comments)+b'\x01',changes
def decode_count(path,channels):
 proc=subprocess.Popen(['ffmpeg','-v','error','-nostdin','-i',str(path),'-f','s16le','-'],stdout=subprocess.PIPE,stderr=subprocess.PIPE);count=0
 while True:
  chunk=proc.stdout.read(262144)
  if not chunk:break
  count+=len(chunk)
 err=proc.stderr.read();code=proc.wait()
 if code:raise RuntimeError(err.decode())
 if count%(2*channels):raise ValueError('Partial decoded PCM frame')
 return count//(2*channels)
def convert(item):
 logical,entry=item;source=(a.files/entry['path']).resolve();row={'logical':logical,'sourcePath':entry['path'],'sourceBytes':entry['size'],'decision':'retain-original','nativePlaybackVerified':False,'listening':{'status':'not-listened','transparencyClaim':False}}
 try:
  if not source.is_relative_to(a.files):raise ValueError('Source path escapes catalog root')
  info=ogg(source);row.update(sourceSha256=info['sha256'],sourceBytes=info['bytes'],channels=info['channels'],sampleRate=info['rate'],sampleFrames=info['frames'],durationSeconds=info['frames']/info['rate'],sourceNominalBitrate=info['nominal'],sourceActualBitrate=round(info['bytes']*8*info['rate']/info['frames']),commentPacketSha256=sha(info['comment']))
  if info['bytes']!=entry['size']:raise ValueError('Source manifest size mismatch')
  compact=a.profile=='compact';user64=a.profile=='user64';budget=a.profile=='mono-budget';mono=a.profile in ('mono-vbr0','mono-budget');special=logical in ['music/kr-ut2003-menu.ogg','music/kr-rankin.ogg'];quality=-.1 if budget else 0.0 if special or mono else .2
  if not compact and not user64 and not mono and not special and info['nominal']<112000:row['reason']='Already low-rate; retained conservatively';return row
  if info['channels']not in(1,2)or not 8000<=info['rate']<=96000:row['reason']='Unsupported shape; retained';return row
  out_rate=min(info['rate'],a.compact_rate)if compact else min(info['rate'],a.sample_rate)if mono and a.sample_rate>0 else info['rate'];out_channels=1 if(compact or mono)else info['channels'];out_frames=round(info['frames']*out_rate/info['rate']);encoder_setting='b'+str(64000 if user64 else a.compact_bitrate)if(compact or user64)else str(quality);key=info['sha256']+('-compact-m'+str(out_rate)+'-b'+str(a.compact_bitrate)if compact else'-user64'if user64 else f'-mono-qminus1-lowpass{a.lowpass_khz:g}k-r{out_rate}' if budget else'-mono-vbr0-r'+str(out_rate)if mono else'-q'+str(round(quality*10)));target=a.output/(key+'.ogg');tags=a.output/(key+'.comment');stamp=a.output/(key+'.verified.json');comment,loop_updates=retime_comments(info['comment'],info['rate'],out_rate)if(compact or out_rate!=info['rate'])else(info['comment'],[]);tags.write_bytes(comment);row['quality']=None if(compact or user64)else quality*10;row['profile']=a.profile;row['loopMetadataUpdates']=loop_updates;began=time.monotonic()
  encoder_args=[str(a.encoder),str(out_channels),str(out_rate),encoder_setting,str(tags)]
  if budget:
   cutoff=min(a.lowpass_khz,out_rate/2000)
   encoder_args.extend(['--lowpass-khz',str(cutoff)])
   row['lowpassKHz']=cutoff
  if not(target.exists()and stamp.exists()and json.loads(stamp.read_text()).get('candidateSha256')==sha(target.read_bytes())):
   temp=target.with_suffix('.part');filters=(['pan=mono|c0=0.5*c0+0.5*c1']if(compact or mono)and info['channels']==2 else[])+(['aresample='+str(out_rate),'apad=whole_len='+str(out_frames),'atrim=end_sample='+str(out_frames)]if(compact or out_rate!=info['rate'])else[]);decode=subprocess.Popen(['ffmpeg','-v','error','-nostdin','-i',str(source)]+(['-af',','.join(filters)]if filters else[])+['-ar',str(out_rate),'-ac',str(out_channels),'-f','f32le','-'],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
   with temp.open('wb')as f:encode=subprocess.Popen(encoder_args,stdin=subprocess.PIPE,stdout=f,stderr=subprocess.PIPE)
   count=0
   while True:
    block=decode.stdout.read(262144)
    if not block:break
    count+=len(block);encode.stdin.write(block)
   encode.stdin.close();de=decode.stderr.read();ee=encode.stderr.read();dc=decode.wait();ec=encode.wait()
   if dc or ec:raise RuntimeError((de+ee).decode())
   if count!=out_frames*out_channels*4:raise ValueError('Source decoder frame count differs from Ogg duration')
   temp.replace(target)
  candidate=ogg(target)
  if candidate['comment']!=comment:raise ValueError('Original comment metadata was not preserved byte-for-byte')
  if candidate['frames']!=out_frames or candidate['rate']!=out_rate or candidate['channels']!=out_channels:raise ValueError('Candidate shape/duration differs')
  frames=decode_count(target,out_channels)
  if frames!=out_frames:raise ValueError('Decoded candidate sample count differs')
  row.update(candidatePath=str(target.relative_to(ROOT))if target.is_relative_to(ROOT)else str(target),candidateSha256=candidate['sha256'],candidateBytes=candidate['bytes'],candidateAudioPacketsSha256=candidate['audioPacketsSha256'],candidateDecodedFrames=frames,candidateSampleRate=out_rate,candidateChannels=out_channels,requestedBitrate=64000 if user64 else a.compact_bitrate if compact else None,durationErrorSeconds=abs(frames/out_rate-info['frames']/info['rate']),metadataByteExact=candidate['comment']==info['comment'],metadataPreservedWithLoopRetiming=True,sourcePreserved=True,shapeVerified=True,elapsedSeconds=round(time.monotonic()-began,3),savedBytes=info['bytes']-candidate['bytes'],savedFraction=round(1-candidate['bytes']/info['bytes'],5),specialLowRateException=special)
  stamp.write_text(json.dumps({'candidateSha256':candidate['sha256'],'sourceSha256':info['sha256'],'metadataByteExact':True,'shapeVerified':True}))
  if candidate['bytes']>info['bytes']*(1-a.minimum_win):row['reason']='Less than required size win; retained original';return row
  row['decision']='candidate';row['reason']='Budget mono Vorbis; timeline and loop metadata verified' if budget else 'User-confirmed mono VBR quality0; timeline and loop metadata preserved'if mono else'User64 native Vorbis ABR64kbps; original rate/channels and metadata preserved'if user64 else'Compact mono/rate-reduced native Vorbis; timeline and loop metadata verified'if compact else'Specific q0 exception pending native loop validation'if special else'Conservative q2 with at least10% size win'
  return row
 except Exception as e:row['reason']='Validation failed; retained original: '+str(e);return row
items=[(n,e)for n,e in manifest.items()if (a.all_folders or n.startswith('music/'))and n.endswith('.ogg')and(not a.only or n in a.only.split(','))];rows=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=max(1,min(a.jobs,4)))as pool:
 for result in pool.map(convert,items):rows.append(result);print(json.dumps({'complete':len(rows),'total':len(items),'logical':result['logical'],'decision':result['decision'],'sourceBytes':result.get('sourceBytes'),'candidateBytes':result.get('candidateBytes'),'reason':result['reason']}),flush=True);(a.output/'progress.json').write_text(json.dumps({'complete':len(rows),'total':len(items),'elapsedSeconds':round(time.monotonic()-start,1)}))
(a.output/'inventory.json').write_text(json.dumps(rows,indent=2)+'\n');selected=[r for r in rows if r['decision']=='candidate'];summary={'tracksScanned':len(rows),'candidates':len(selected),'retained':len(rows)-len(selected),'sourceBytes':sum(r.get('sourceBytes',0)for r in rows),'selectedSourceBytes':sum(r['sourceBytes']for r in selected),'selectedCandidateBytes':sum(r['candidateBytes']for r in selected),'elapsedSeconds':round(time.monotonic()-start,1),'policy':f'Budget mono Vorbis, quality -1, up to {a.lowpass_khz:g} kHz bandwidth; preserve source sample rate and timeline' if a.profile=='mono-budget' else 'User-confirmed mono VBR quality0 native Vorbis; requested rate '+str(a.sample_rate or 'original')+'Hz; preserve timeline/loop semantics'if a.profile=='mono-vbr0'else'User-confirmed 64kbps native Vorbis; preserve original rate/channels and exact metadata/sample count'if a.profile=='user64'else'Compact mono '+str(a.compact_rate)+'Hz ABR '+str(a.compact_bitrate)+'bps native Vorbis; timeline/loop metadata preserved;>=10% gain'if a.profile=='compact'else'q2 only high-rate sources; q0 only specific menu/Rankin pending native validation;>=10% gain;exactmetadata/shape/decodecount'};(a.output/'summary.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps(summary))
