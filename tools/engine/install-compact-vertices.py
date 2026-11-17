"""Teach the web mesh serializer to accept position dictionaries."""
import argparse
from pathlib import Path
import shutil
p=argparse.ArgumentParser(description=__doc__);p.add_argument('engine',type=Path);a=p.parse_args()
d=a.engine/'Source/Engine/Src';f=d/'UnStaticMesh.cpp';s=f.read_text()
if '#include "compact-mesh-vertices.inc"' not in s:
    start='void UStaticMesh::Serialize(FArchive& Ar)'
    body='Ar\t<< VertexStream\n\t\t\t<< ColorStream'
    if s.count(start)!=1 or s.count(body)!=1:raise SystemExit('Unexpected static mesh serializer source')
    s=s.replace(start,'#include "compact-mesh-vertices.inc"\n'+start)
    s=s.replace(body,'if (!ReadCompactMeshVertices(Ar,VertexStream)) Ar << VertexStream;\n\t\tAr << ColorStream')
    f.write_text(s)
shutil.copyfile(Path(__file__).with_name('compact-mesh-vertices.inc'),d/'compact-mesh-vertices.inc')
