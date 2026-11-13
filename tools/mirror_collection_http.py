"""Read-only localhost handler for the verified private Unreal Collection mirror."""
import hashlib
import json
from pathlib import Path, PurePosixPath
from threading import RLock
from urllib.parse import unquote, urlsplit

TYPES = {'.html':'text/html; charset=utf-8','.js':'text/javascript',
         '.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json',
         '.wasm':'application/wasm','.png':'image/png','.txt':'text/plain; charset=utf-8'}

class CollectionMirror:
    def __init__(self, root):
        self.root=Path(root).resolve();self.files={};self.stamp=None
        self.verified={};self.lock=RLock()

    def catalog(self):
        path=self.root/'catalog.json'
        stamp=path.stat().st_mtime_ns
        with self.lock:
            if stamp!=self.stamp:
                self.files=json.loads(path.read_text())['files'];self.stamp=stamp
            return self.files

    def serve(self, handler, raw_url_path, body=True):
        url=urlsplit(raw_url_path);path=unquote(url.path)
        if path=='/ut2004':
            handler.send_response(302);handler.send_header('Location','/ut2004/'+('?' + url.query if url.query else ''))
            handler.send_header('Content-Length','0');handler.end_headers();return True
        if not path.startswith('/ut2004/'): return False
        relative=path[len('/ut2004/'):] or 'index.html'
        if relative.startswith('/') or '..' in PurePosixPath(relative).parts:
            handler.send_error(404);return True
        try: item=self.catalog().get(relative)
        except (OSError,ValueError):
            handler.send_error(503,'The private game mirror is being prepared');return True
        if not item: handler.send_error(404);return True
        target=self.root/'files'/relative
        receipt=self.root/'receipts'/(hashlib.sha256(relative.encode()).hexdigest()+'.json')
        try:
            if target.is_symlink() or not target.is_file(): raise FileNotFoundError()
            target.resolve().relative_to((self.root/'files').resolve())
            evidence=json.loads(receipt.read_text())
            stat=target.stat();key=(stat.st_mtime_ns,stat.st_size,evidence['sha256'])
            if stat.st_size!=item['size']: raise ValueError('size mismatch')
            if item.get('sha256') and item['sha256']!=evidence['sha256']: raise ValueError('identity mismatch')
            with self.lock:
                if self.verified.get(relative)!=key:
                    with target.open('rb') as source:
                        digest=hashlib.file_digest(source,'sha256').hexdigest()
                    if digest!=evidence['sha256']: raise ValueError('checksum mismatch')
                    self.verified[relative]=key
        except FileNotFoundError:
            handler.send_error(503,'This verified asset is not downloaded yet');return True
        except (OSError,ValueError,KeyError):
            handler.send_error(503,'Private mirror asset verification failed');return True
        size=stat.st_size;start=0;end=size-1;status=200
        requested=handler.headers.get('Range')
        if requested:
            import re
            match=re.fullmatch(r'bytes=(\d*)-(\d*)',requested)
            if not match or not any(match.groups()): start=size
            else:
                start=int(match[1]) if match[1] else max(0,size-int(match[2]))
                end=min(int(match[2]),end) if match[1] and match[2] else end
            if start>=size or start>end:
                handler.send_response(416);handler.send_header('Content-Range',f'bytes */{size}');handler.send_header('Content-Length','0');handler.end_headers();return True
            status=206
        handler.send_response(status)
        handler.send_header('Content-Type',TYPES.get(target.suffix,'application/octet-stream'))
        handler.send_header('Content-Length',str(max(0,end-start+1)))
        handler.send_header('Accept-Ranges','bytes')
        handler.send_header('ETag','"'+evidence['sha256']+'"')
        handler.send_header('Cross-Origin-Opener-Policy','same-origin')
        handler.send_header('Cross-Origin-Embedder-Policy','require-corp')
        handler.send_header('Cross-Origin-Resource-Policy','same-origin')
        handler.send_header('Content-Security-Policy',"connect-src 'self' blob: data:; frame-ancestors 'self'")
        handler.send_header('X-Content-Type-Options','nosniff')
        if status==206: handler.send_header('Content-Range',f'bytes {start}-{end}/{size}')
        handler.end_headers()
        if body and size:
            with target.open('rb') as stream:
                stream.seek(start);left=end-start+1
                while left:
                    block=stream.read(min(left,256*1024))
                    if not block: break
                    handler.wfile.write(block);left-=len(block)
        return True
