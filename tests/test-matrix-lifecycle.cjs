// Source-level guard for the authored compatibility lifecycle; native travel QA is separate.
const fs=require('fs'),assert=require('node:assert/strict');
const compat=fs.readFileSync('mutators/matrix-modern/Classes/CompatibleMatrixPlayer.uc','utf8').replace(/\/\/[^\n]*/g,''),mutator=fs.readFileSync('mutators/matrix-modern/Classes/MutMatrixModern.uc','utf8'),aim=fs.readFileSync('mutators/local-assist/Classes/LocalAimMatrixPlayer.uc','utf8'),build=fs.readFileSync('tools/build-assist.py','utf8');
assert.match(compat,/extends Matrix2004_v130\.MatrixPlayer/);assert.match(compat,/simulated event PreBeginPlay\(\)/);assert.match(aim,/extends MatrixModern\.CompatibleMatrixPlayer/);
assert(compat.indexOf('Super.PreBeginPlay()')<compat.indexOf('myOSM=None'));
assert.match(compat,/foreach AllActors\(class'Matrix2004_v130\.OnionSkinManager',Manager\)/);assert.match(compat,/Manager\.Level==Level && !Manager\.bDeleteMe/);assert.match(compat,/myOSM=Manager/);assert.match(compat,/if\(myOSM==None\)\s*myOSM=Spawn/);
assert(!/AllObjects|PlayerTick|PlayerCalcView|GetViewRotation|SetPhysics/.test(compat));assert.match(mutator,/PlayerControllerClassName = "MatrixModern\.CompatibleMatrixPlayer"/);
assert(build.includes("'Matrix2004_v130', 'MatrixModern', 'LocalAim'"));
console.log('PASS: current-level manager binding before tick, inheritance reaches original MatrixPlayer, no movement/camera/tick override, correct build order');
