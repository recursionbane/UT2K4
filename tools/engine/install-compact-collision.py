"""Enable decoding of verified compact k-DOP trees in a supplied web engine."""
import argparse,shutil
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__);p.add_argument('engine',type=Path);args=p.parse_args()
src=args.engine/'Source/Engine/Src';f=src/'UnStaticMesh.cpp';s=f.read_text()
shutil.copyfile(Path(__file__).with_name('compact-collision-tree.inc'),src/'compact-collision-tree.inc')
if '#include "compact-collision-tree.inc"' not in s:
    anchor='void UStaticMesh::Serialize(FArchive& Ar)';old='Ar\t<< kDOPTree;'
    if s.count(anchor)!=1 or s.count(old)!=1:raise SystemExit('Unexpected static mesh tree serialization')
    f.write_text(s.replace(anchor,'#include "compact-collision-tree.inc"\n'+anchor).replace(old,'if (!ReadCompactCollisionTree(Ar,this)) Ar << kDOPTree;'))
