#!/usr/bin/env python3
"""Guard native camera accessors transitively, plus trace and lifetime boundaries."""
from pathlib import Path
import re
root=Path(__file__).resolve().parents[1]/'mutators/local-assist/Classes'
def functions(text):
    text=re.sub(r'//[^\n]*','',text);out={}
    pattern=r'\b(?:function|event)\s+(?:\w+\s+)?(\w+)\s*\([^)]*\)\s*\{'
    for match in re.finditer(pattern,text):
        start=match.end();depth=1;quote=None;escape=False;i=start
        while i<len(text)and depth:
            c=text[i]
            if quote:
                if escape:escape=False
                elif c=='\\':escape=True
                elif c==quote:quote=None
            elif c in['"',"'"]:quote=c
            elif c=='{':depth+=1
            elif c=='}':depth-=1
            i+=1
        assert depth==0,'Unterminated source function'
        out[match[1]]=text[start:i-1]
    return out
interaction=(root/'LocalAimInteraction.uc').read_text();helpers=functions(interaction)
forbidden={'Trace','FastTrace','Visible','FireAim','CameraAim','EyePosition','WorldToScreen','GetCameraLocation','PlayerCalcView','SetRotation','FaceRotation','SetViewPitch','SetPhysics','ClientSetBehindView','Release','Status','CacheValidatedAim'}
pure={'if','for','while','switch','return','Abs','Tan','FClamp','GetAxes','Normalize','rotator','IsA','LocalAimInteraction','PlayerController'}
def inspect(entry,table,seen=None):
    seen=set()if seen is None else seen
    if entry in seen:return
    seen.add(entry);body=table[entry]
    for call in re.finditer(r'(?:(\b\w+)\s*\.)?(\w+)\s*\(',body):
        prefix,name=call.groups()
        if prefix=='Super'and name=='GetViewRotation':continue
        assert name not in forbidden,'Unsafe camera accessor call chain reaches '+name
        if name in table:inspect(name,table,seen)
        else:assert name in pure,'Unreviewed camera accessor call: '+name
for name in['LocalAimMatrixPlayer','LocalAimPlayer']:
    table={**helpers,**functions((root/(name+'.uc')).read_text())};inspect('GetViewRotation',table)
# Demonstrate that moving a trace behind a helper cannot bypass this guard.
bad=dict(helpers);bad['CachedViewAim']=bad['CachedViewAim']+' Visible(None,Point);'
try:inspect('CachedViewAim',bad)
except AssertionError:pass
else:raise AssertionError('Transitive unsafe-call guard is ineffective')
assert not re.search(r'\b(?:Target|AimSnapshotTarget|CurrentTarget)\s*\.',helpers['CachedViewAim']),'Getter dereferences an enemy'
code=re.sub(r'//[^\n]*','',interaction);render=code.index('function PostRender(')
assert not re.search(r'\bPlayerCalcView\s*\(',code)
for match in re.finditer(r'\.(?:WorldToScreen|GetCameraLocation)\s*\(',code):assert match.start()>render,'Render context used outside PostRender'
for name in['FireAim','CameraAim']:
    assert'if(bComputingAim)return false'in helpers[name]and'bComputingAim=true'in helpers[name]and'bComputingAim=false'in helpers[name]
release=helpers['Release'];assert release.index('InvalidateAimSnapshot()')<release.index('FaceRotation(')
assert helpers['Enemy'].index('C.Pawn==Candidate')<helpers['Enemy'].index('P.Health')
assert 'PC.MyHUD==SavedHUD'in helpers['RestoreCrosshair']and"SavedHUD.IsA('HUD')"in helpers['RestoreCrosshair']
recovery=functions((root.parents[1]/'local-recovery/Classes/LocalRecoveryRules.uc').read_text())
assert recovery['Eligible'].index('C.Pawn!=Candidate')<recovery['Eligible'].index('P.Health')
print('PASS: transitive pure camera accessor, enemy-free getter, fresh ownership before Pawn fields, safe HUD restore and render-only projection')
