"""Install lazy wire-edge rebuilding in the supplied compact web engine."""
from pathlib import Path
import argparse,shutil
p=argparse.ArgumentParser(description=__doc__);p.add_argument('engine',type=Path);args=p.parse_args()
d=args.engine/'Source/Engine/Src';f=d/'UnStaticMesh.cpp';s=f.read_text()
shutil.copyfile(Path(__file__).with_name('compact-wire.inc'),d/'compact-wire.inc')
if '#include "compact-wire.inc"' not in s:
    mark='void UStaticMesh::Serialize(FArchive& Ar)';old='<< IndexBuffer\n\t\t\t<< WireframeIndexBuffer\n\t\t\t<< CollisionModel;'
    if s.count(mark)!=1 or s.count(old)!=1:raise SystemExit('Unexpected mesh wire serializer')
    f.write_text(s.replace(mark,'#include "compact-wire.inc"\n'+mark).replace(old,'<< IndexBuffer;\n        if (!ReadCompactWireMarker(Ar,WireframeIndexBuffer)) Ar << WireframeIndexBuffer;\n        Ar << CollisionModel;'))
f=d/'UnRenderStaticMesh.cpp';s=f.read_text();old='RI->SetIndexBuffer(&StaticMesh->WireframeIndexBuffer,0);'
if 'EnsureBrowserWireIndices(StaticMesh)' not in s:
    if s.count(old)!=1:raise SystemExit('Unexpected wireframe render path')
    f.write_text(s.replace(old,'extern void EnsureBrowserWireIndices(UStaticMesh*);\n        EnsureBrowserWireIndices(StaticMesh);\n        '+old))
