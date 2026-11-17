"""Install the compact emitter hook into an operator-supplied engine source tree."""
import argparse
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("engine", type=Path)
args = parser.parse_args()
directory = args.engine / "Source/Engine/Src"
source = directory / "AxEmitter.cpp"
text = source.read_bytes()
newline = b"\r\n" if b"\r\n" in text else b"\n"
include = b'#include "compact-emitter-mesh.inc"'
call = b"        BuildCompactEmitterTriangles(cachedMesh);"
if (include in text) != (call in text):
    raise SystemExit("Incomplete compact emitter installation")
if include not in text:
    definition = b"void GetRandStaticMeshVertex( FVector& emitPos, AStaticMeshActor* sourceActor, FVector origin, float radius )" + newline + b"{"
    load = b"        cachedMesh->RawTriangles.Load();"
    if text.count(definition) != 1 or text.count(load) != 1:
        raise SystemExit("Unrecognized emitter source")
    text = text.replace(definition, include + newline * 2 + definition)
    text = text.replace(load, load + newline + call)
# A new position can legitimately yield no emission surface. Return before
# sampling an empty list, including after moving from a nonempty search area.
old_empty = newline.join([b"    if ( prevCnt == 0 )", b"        return;", b"", b"    if ( cachedTriIndex.Num()==0 )", b"        cachedTriIndex.Add( prevCnt );"])
safe_empty = newline.join([b"    if (prevCnt == 0 || cachedTriIndex.Num() == 0)", b"        return;"])
if old_empty in text:
    text = text.replace(old_empty, safe_empty)
elif safe_empty not in text:
    raise SystemExit("Unexpected particle selection source")
(directory / "compact-emitter-mesh.inc").write_bytes(Path(__file__).with_name("compact-emitter-mesh.inc").read_bytes())
temp = source.with_suffix(".cpp.part")
temp.write_bytes(text)
temp.replace(source)
