"""Install packed non-root animation track support into a disposable engine checkout."""
import argparse,shutil
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__);p.add_argument('engine',type=Path);args=p.parse_args()
inc=args.engine/'Source/Engine/Inc';f=inc/'UnSkeletalMesh.h';s=f.read_text()
old='return Ar << A.Flags << A.KeyQuat << A.KeyPos << A.KeyTime;'
new='''Ar << A.Flags;
        if (Ar.IsLoading() && Ar.IsPersistent() && A.Flags==0x434b5031)
            return ReadBrowserCompactPose(Ar,A);
        return Ar << A.KeyQuat << A.KeyPos << A.KeyTime;'''
if new not in s:
    if s.count(old)!=1:raise SystemExit('Unexpected AnalogTrack serializer')
    needle='struct AnalogTrack\n{'
    if s.count(needle)!=1:raise SystemExit('Unexpected AnalogTrack declaration')
    s=s.replace(needle,'struct AnalogTrack;\nENGINE_API FArchive& ReadBrowserCompactPose(FArchive&, AnalogTrack&);\n\n'+needle)
    f.write_text(s.replace(old,new))
src=args.engine/'Source/Engine/Src'
code=Path(__file__).with_name('compact-pose.inc').read_text().replace('static FArchive& ReadCompactPose','ENGINE_API FArchive& ReadBrowserCompactPose')
(src/'compact-pose.inc').write_text(code)
cpp=src/'UnSkeletalMesh.cpp';s=cpp.read_text()
if '#include "compact-pose.inc"' not in s:cpp.write_text(s+'\n#include "compact-pose.inc"\n')
