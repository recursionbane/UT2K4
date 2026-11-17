"""Create native streamed Opus candidates for the compact engine. Source files are read-only."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import struct
import subprocess
import tempfile

def sha(data):
    return hashlib.sha256(data).hexdigest()

def extract_comments(path):
    data=memoryview(path.read_bytes())
    count,=struct.unpack_from('<I',data)
    at=4; out=[]
    for _ in range(count):
        length,=struct.unpack_from('<I',data,at);at+=4
        if at+length>len(data):raise ValueError('Incomplete source metadata')
        out.append(bytes(data[at:at+length]));at+=length
    if at!=len(data):raise ValueError('Trailing source metadata')
    return out

def crc_table():
    table=[]
    for i in range(256):
        v=i<<24
        for _ in range(8):v=((v<<1)^(0x04c11db7 if v&0x80000000 else 0))&0xffffffff
        table.append(v)
    return table
CRC=crc_table()
def ogg_crc(data):
    crc=0
    for x in data:crc=((crc<<8)&0xffffffff)^CRC[((crc>>24)^x)&255]
    return crc

def laced_packet(packet):
    sizes=bytes([255])*(len(packet)//255)+bytes([len(packet)%255])
    if len(sizes)>255:raise ValueError('Comments exceed one Ogg page')
    return sizes

def write_tags(data,comments,rate,frames):
    first=27+data[26]+sum(data[27:27+data[26]])
    if data[:4]!=b'OggS' or data[27+data[26]:27+data[26]+8]!=b'OpusHead':raise ValueError('Expected OpusHead')
    page=data[first:first+27];n=page[26];body=first+27+n;end=body+sum(data[first+27:body])
    if page[:4]!=b'OggS' or data[body:body+8]!=b'OpusTags' or struct.unpack_from('<I',page,18)[0]!=1:raise ValueError('Expected standalone OpusTags page')
    if sum(v<255 for v in data[first+27:body])!=1:raise ValueError('Multiple packets in tag page')
    if any(c.partition(b'=')[0].upper() in (b'UT_NATIVE_RATE',b'UT_NATIVE_FRAMES') for c in comments):raise ValueError('Source uses reserved native timeline tags')
    fields=comments+[f'UT_NATIVE_RATE={rate}'.encode(),f'UT_NATIVE_FRAMES={frames}'.encode()]
    vendor=b'UT2K4 compact music'
    packet=b'OpusTags'+struct.pack('<I',len(vendor))+vendor+struct.pack('<I',len(fields))+b''.join(struct.pack('<I',len(c))+c for c in fields)
    lace=laced_packet(packet);header=bytearray(page);header[22:26]=bytes(4);header[26]=len(lace)
    output=header+lace+packet;struct.pack_into('<I',output,22,ogg_crc(output))
    return data[:first]+output+data[end:]

def atomic_json(path,obj):
    tmp=path.with_suffix('.part');tmp.write_text(json.dumps(obj,indent=2)+'\n');tmp.replace(path)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--files',required=True,type=Path)
    parser.add_argument('--output',required=True,type=Path)
    parser.add_argument('--decoder',required=True,type=Path)
    parser.add_argument('--verify-reader',required=True,type=Path)
    parser.add_argument('--bitrate',type=int,default=14000)
    parser.add_argument('--jobs',type=int,default=3)
    args=parser.parse_args()
    if not 8000<=args.bitrate<=64000:parser.error('Use a bitrate between 8 and 64 kb/s')
    files=args.files.resolve();out=args.output.resolve();out.mkdir(parents=True,exist_ok=True)
    manifest=json.loads((files/'file-manifest.json').read_text())
    items=[(n,e) for n,e in manifest.items() if n.endswith('.ogg')]
    def convert(item):
        logical,entry=item;row={'logical':logical,'decision':'retain-current'}
        try:
            source=(files/entry['path']).resolve()
            if not source.is_relative_to(files):raise ValueError('Catalog path escapes input directory')
            with tempfile.TemporaryDirectory() as tmpdir:
                tmp=Path(tmpdir);pcm=tmp/'mono.pcm';tags=tmp/'comments.bin'
                result=subprocess.run([args.decoder,source,pcm,tags],capture_output=True,text=True,check=True)
                rate_s,frames_s,_=result.stdout.split();rate=int(rate_s);frames=int(frames_s)
                if pcm.stat().st_size!=frames*4:raise ValueError('Source PCM extent mismatch')
                song=tmp/'song.ogg'
                subprocess.run(['ffmpeg','-v','error','-nostdin','-f','f32le','-ar',str(rate),'-ac','1','-i',str(pcm),'-c:a','libopus','-b:a',str(args.bitrate),'-vbr','constrained','-application','audio','-compression_level','10','-frame_duration','40','-f','opus',str(song)],check=True,capture_output=True)
                encoded=write_tags(song.read_bytes(),extract_comments(tags),rate,frames);song.write_bytes(encoded)
                proof=subprocess.run([args.verify_reader,song,str(rate),str(frames)],capture_output=True,text=True,check=True)
                if proof.stdout.strip()!='OK':raise ValueError('Native music reader proof missing')
                key=sha(encoded);dest=out/(key+'.ogg')
                if dest.exists() and sha(dest.read_bytes())!=key:raise ValueError('Corrupt cache')
                if not dest.exists():
                    with tempfile.NamedTemporaryFile(dir=out,delete=False,suffix='.part') as part:
                        part.write(encoded)
                    os.replace(part.name,dest)
                row.update(decision='candidate',candidatePath=str(dest),sha256=key,bytes=len(encoded),rate=rate,frames=frames,sourceSha256=sha(source.read_bytes()))
        except (OSError,ValueError,subprocess.CalledProcessError) as e:
            row['reason']=str(e)
        return row
    rows=[]
    with ThreadPoolExecutor(max_workers=max(1,min(4,args.jobs))) as pool:
        for row in pool.map(convert,items):
            rows.append(row);print(json.dumps({'done':len(rows),'logical':row['logical'],'decision':row['decision']}),flush=True)
    atomic_json(out/'inventory.json',rows)

if __name__=='__main__':main()
