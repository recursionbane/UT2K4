// UT2004 UStaticMesh::Serialize, FStaticMeshTriangle and FkDOPTree.
// Render streams and collision records precede the lazily loaded source triangles.
import {Ue2Reader} from './ue2-texture-layout.mjs';

function count(reader, maximum) {
  const n = reader.compact();
  if (n < 0 || n > maximum) throw Error('Invalid static mesh array count');
  return n;
}

function skipCollision(reader, version) {
  if (version >= 126) {
    reader.skip(count(reader, 1_000_000) * 32);
    reader.skip(count(reader, 1_000_000) * 8);
    return;
  }
  for (let i = count(reader, 1_000_000); i; i--) {
    reader.skip(64);
    for (let k = 0; k < 4; k++) reader.compact();
  }
  for (let i = count(reader, 1_000_000); i; i--) {
    for (let k = 0; k < 4; k++) reader.compact();
    reader.skip(25);
  }
}

// Return the precise set of render vertex IDs used by the native collision tree.
export function collisionVertexIds(bytes,mesh,version) {
  const r=new Ue2Reader(bytes,mesh.opaqueTail.offset-4,mesh.exportOffset+mesh.exportLength);
  r.compact();
  const used=new Set();
  if(version>=126){
    r.skip(count(r,1_000_000)*32);
    for(let i=count(r,1_000_000);i;i--){
      for(let k=0;k<3;k++)used.add(r.u16());
      r.u16();
    }
  }else{
    for(let i=count(r,1_000_000);i;i--){
      r.skip(64);
      for(let k=0;k<3;k++)used.add(r.compact());
      r.compact();
    }
  }
  for(const index of used)if(index<0 || index>=mesh.vertices.count)throw Error('Invalid mesh collision vertex index');
  return used;
}

// Positions are required by AxEmitter at runtime. Render materials, UVs,
// collision, vertex lighting and topology have their own compiled streams.
export function compactSourceTriangles(bytes, mesh, version, licensee, output) {
  if (version < 120 || version > 128 || !output || output.length !== bytes.length)
    throw Error('Unsupported source triangle profile');
  const end = mesh.exportOffset + mesh.exportLength;
  const r = new Ue2Reader(bytes, mesh.opaqueTail.offset - 4, end);
  r.compact(); // CollisionModel object reference; preceding layout consumes 4 opaque bytes.
  skipCollision(r, version);
  const lazyEnd = r.i32();
  const n = count(r, 1_000_000);
  const at = r.pos;
  for (let i = 0; i < n; i++) {
    r.skip(36);
    const uvCount = r.i32();
    if (uvCount < 0 || uvCount > 8) throw Error('Unexpected source UV count');
    r.skip(uvCount * 24 + 20);
  }
  if (r.pos !== lazyEnd) throw Error('Source triangle lazy boundary mismatch');
  const internal = r.i32();
  if (licensee === 22) r.skip(4);
  if (licensee > 22) r.skip(4 * count(r, 4096));
  r.compact(); // KPhysicsProps
  r.u32(); // AuthenticationKey
  if (r.pos !== end) throw Error('Static mesh export boundary mismatch');
  if (internal < 11) return {triangles: 0, legacy: true};
  r.pos = at;
  let attributes = 0;
  for (let i = 0; i < n; i++) {
    r.skip(36);
    const uvCount = r.i32();
    const visualBytes = uvCount * 24 + 12;
    output.fill(0, r.pos, r.pos + visualBytes);
    attributes += visualBytes;
    r.skip(visualBytes + 8); // preserve material index and smoothing mask
  }
  return {triangles: n, attributes, offset: at, length: lazyEnd - at};
}
