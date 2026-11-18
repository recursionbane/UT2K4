import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const base=path.resolve(process.argv[2]||'.local-runtime/compact-stick-full-release'),output=path.resolve(process.argv[3]||'.local-runtime/full-ui-controls');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const cb=fs.readFileSync(base+'/candidate.json'),c=JSON.parse(cb),rows=new Map(c.files.map(f=>[f.name,f]));
const parents=[base,...JSON.parse(fs.readFileSync(base+'/local-profile-parents.json'))];
function read(n){for(const r of parents){const p=path.join(r,n);if(fs.existsSync(p))return fs.readFileSync(p);}throw Error('Missing '+n);}
if(fs.existsSync(output))throw Error('Stage already exists');fs.mkdirSync(output,{recursive:true});
function put(n,b,type){b=Buffer.from(b);fs.mkdirSync(path.dirname(output+'/'+n),{recursive:true});fs.writeFileSync(output+'/'+n,b);rows.set(n,{name:n,size:b.length,sha256:sha(b),type});}
let html=read('index.html').toString();const old=html.match(/<script defer data-personal-input src="\.\/([^"]+)"><\/script>/)?.[1];if(!old)throw Error('No assist script');
// Patch the selected artifact, preserving its exact native bridge behavior.
let client=read(old).toString();const a=client.indexOf('    function mount(){'),b=client.indexOf('    function tick(){',a);if(a<0||b<0)throw Error('No pinned mount');client=client.slice(0,a)+'    function mount(){}\n'+client.slice(b)+'\n'+fs.readFileSync('runtime/collection/game-display.js','utf8');
const name='assist-'+sha(client).slice(0,16)+'.js';put(name,client,'text/javascript; charset=utf-8');html=html.replace('./'+old,'./'+name);put('index.html',html,'text/html; charset=utf-8');
const shell=JSON.parse(read('shell-files.json'));for(const f of shell.files){if(f.path===old){const r=rows.get(name);f.path=name;f.size=r.size;f.sha256=r.sha256;}}put('shell-files.json',JSON.stringify(shell),'application/json');
c.files=[...rows.values()].filter(f=>f.name!==old);c.gameDisplay={sourceCandidateSha256:sha(cb),fullscreenSelector:'#game-fullscreen-toggle',removedUI:['#private-aim-settings','#private-matrix-time'],nativeBridgePreserved:true};fs.writeFileSync(output+'/candidate.json',JSON.stringify(c,null,2));fs.writeFileSync(output+'/local-profile-parents.json',JSON.stringify(parents));console.log(JSON.stringify({output,client:name,candidateSha256:sha(fs.readFileSync(output+'/candidate.json'))}));
