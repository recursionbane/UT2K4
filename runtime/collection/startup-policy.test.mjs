import assert from 'node:assert/strict';
import {menuLaunch,menuMutatorArgs,startupClient,LOW_MEMORY_ARGS,installMenuStartup} from './startup-policy.mjs';
const launch=menuLaunch('/v/ut2004/?map=DM-Rankin&Game=XGame.xDeathMatch&NumBots=8&Mutator=LocalAim.MutLocalAim&mutator=Other.Mod&peerhost=127.0.0.1');
const u=new URL(launch,'https://unit.invalid');assert.equal(u.searchParams.get('map'),'NoIntro');assert.equal(u.searchParams.get('peerhost'),'127.0.0.1');assert(!/mutator|numbots|game=/i.test(u.search));
assert.throws(()=>menuLaunch('https://outside.invalid/v/ut2004/'));
assert.throws(()=>menuMutatorArgs(['x.y\nBad=1']));
const presets=menuMutatorArgs(['LocalAim.MutLocalAim','MatrixModern.MutMatrixModern','LocalAim.MutLocalAim']);assert.equal(presets.length,2);assert(presets.every(x=>x.endsWith('LocalAim.MutLocalAim,MatrixModern.MutMatrixModern')));
assert(LOW_MEMORY_ARGS.every(x=>x.includes('[SDL2Drv.SDL2Client]')));
new Function(startupClient({mutators:['LocalAim.MutLocalAim']}));
let tick,clicked=0;const scope={document:{getElementById(id){return id==='start-btn'?{disabled:false,getBoundingClientRect:()=>({width:640}),click(){clicked++;scope.launchEngine(['NoIntro']);}}:null;}},Module:{arguments:[]},launchEngine(args){this.Module.arguments=args;},ufrontConfig:{launchState:{ready:true}},setInterval(fn){tick=fn;return 1;},clearInterval(){}};
installMenuStartup(scope,presets);tick();tick();assert.equal(clicked,1);assert.deepEqual(scope.Module.arguments,['NoIntro',...presets]);assert.equal(scope.__privateStartupPolicy.started,true);
console.log('menu launch, safe preset args, quality config and normal single-click startup PASS');
const {menuUserIni}=await import('./startup-policy.mjs');
const ini=menuUserIni('[Other]\nA=1\n[GUI2K4.UT2K4Tab_MutatorSP]\nLastActiveMutators=Old.Mod\nKeep=3\n',['LocalAim.MutLocalAim']);
assert(ini.includes('A=1'));assert(ini.includes('Keep=3'));assert(!ini.includes('Old.Mod'));assert.equal(menuUserIni(ini,['LocalAim.MutLocalAim']),ini);assert.equal((ini.match(/LastActiveMutators=LocalAim.MutLocalAim/g)||[]).length,2);

assert(ini.includes('[GUI2K4.UT2K4Tab_MainSP]\nLastSelectedMap=DM-Rankin'));assert(!ini.includes('LastGameType='));assert.throws(()=>menuUserIni('', ['LocalAim.MutLocalAim'],{map:'AS-Unsafe'}));const oldMap=menuUserIni('[GUI2K4.UT2K4Tab_MainSP]\nLastSelectedMap=AS-Aarjskaw\nKeep=2\n',['LocalAim.MutLocalAim']);assert(oldMap.includes('Keep=2'));assert(!oldMap.includes('AS-Aarjskaw'));assert.equal(menuUserIni(oldMap,['LocalAim.MutLocalAim']),oldMap);

const boot=new URL(menuLaunch('/v/ut2004/?map=DM-Rankin&Mutator=LocalAim.MutLocalAim&mutator=Other.Mod',{bootstrapMutator:'MenuProfile.MenuProfileBootstrap'}),'https://unit.invalid');assert.equal(boot.searchParams.get('map'),'NoIntro');assert.equal(boot.searchParams.getAll('Mutator').length,1);assert.equal(boot.searchParams.get('Mutator'),'MenuProfile.MenuProfileBootstrap');assert(!boot.search.includes('LocalAim'));assert.throws(()=>menuLaunch('/v/ut2004/',{bootstrapMutator:'Other.Anything'}));
