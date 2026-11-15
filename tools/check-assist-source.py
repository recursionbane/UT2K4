#!/usr/bin/env python3
"""Guard the native callback boundary that previously allowed recursive view calculation."""
from pathlib import Path
import re
root=Path(__file__).resolve().parents[1]/'mutators/local-assist'
source=(root/'Classes/LocalAimInteraction.uc').read_text()
# Strip prose before checking calls, rather than banning the explanatory comments.
code=re.sub(r'//[^\n]*','',source)
assert not re.search(r'\bPlayerCalcView\s*\(',code),'recursive native camera calculation returned'
assert not re.search(r'\bLineOfSightTo\s*\(',code),'native view-dependent LOS returned'
render=code.index('function PostRender(')
for match in re.finditer(r'\.(?:WorldToScreen|GetCameraLocation)\s*\(',code):
    assert match.start()>render,'transient render context used outside PostRender'
for name in ('FireAim','CameraAim'):
    start=code.index('function bool '+name+'(')
    body=code[start:code.index('\nfunction ',start+1)]
    assert 'if(bComputingAim)return false' in body and 'bComputingAim=true' in body and 'bComputingAim=false' in body
release=code[code.index('function Release('):code.index('function RestoreCrosshair(')]
assert release.index('CurrentTarget=None')<release.index('FaceRotation(')
print('PASS: pure camera callback boundary, render-only projection, guarded aim, invalidate-before-pose restoration')
