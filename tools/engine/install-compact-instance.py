"""Install compact baked-instance color support into an operator-supplied WASM engine."""
from pathlib import Path
import argparse,shutil
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('engine',type=Path);args=parser.parse_args()
src=args.engine/'Source/Engine/Src'
shutil.copyfile(Path(__file__).with_name('compact-instance-light.inc'),src/'compact-instance-light.inc')
def patch(file,old,new):
    text=file.read_text()
    if new in text:return
    if text.count(old)!=1:raise SystemExit('Unexpected pinned engine source at '+str(file))
    file.write_text(text.replace(old,new))
f=src/'UnStaticMesh.cpp'
patch(f,'void UStaticMeshInstance::Serialize(FArchive& Ar)', '#include "compact-instance-light.inc"\n\nvoid UStaticMeshInstance::Serialize(FArchive& Ar)')
patch(f,'else\n\t\tAr << ColorStream;','else if (!ReadCompactInstanceColors(Ar, ColorStream))\n\t\tAr << ColorStream;')
f=src/'UnRenderStaticMesh.cpp'
patch(f,'guard(CalculateStaticMeshLighting);','guard(CalculateStaticMeshLighting);\n    if (StaticMeshInstance->ColorStream.Revision == -202605 && !StaticMeshInstance->Lights.Num()) return;')
