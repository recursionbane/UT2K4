const assert = require('node:assert/strict');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');
const api = require('../delivery/hosted-mod.js');
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-zip-test-'));
  try {
    const files = [['System/Matrix2004_v130.u', new Blob([Uint8Array.of(0, 255, 65)])], ['Textures/matrixrings.utx', new Blob(['rings'])], ['System/MatrixModern.u', new Blob(['adapter'])]];
    let calls = 0;
    globalThis.matrixProfileFiles = async progress => { calls++; progress('verified loader'); return files; };
    const statuses = [], result = await api.build({ onProgress: s => statuses.push(s) });
    assert.equal(calls, 1); assert.equal(result.blob.type, 'application/zip');
    assert.equal(result.entries.length, 4); assert.ok(statuses.includes('verified loader'));
    const target = path.join(dir, result.filename); fs.writeFileSync(target, Buffer.from(await result.blob.arrayBuffer()));
    execFileSync('python3', ['-c', `import zipfile,sys\nz=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None\nassert z.read('System/Matrix2004_v130.u') == bytes([0,255,65])\nassert z.read('Textures/matrixrings.utx') == b'rings'\nassert z.read('System/MatrixModern.u') == b'adapter'\nassert b'set input B slowtimedown' in z.read('README-matrix-hosted.txt')\nassert all(i.compress_type == zipfile.ZIP_STORED for i in z.infolist())`, target]);
    const url = new URL(api.launchURL());
    assert.equal(url.origin, 'https://unrealcollection.games'); assert.equal(url.searchParams.get('map'), 'DM-Rankin');
    assert.equal(url.searchParams.get('Game'), 'XGame.xDeathMatch'); assert.equal(url.searchParams.get('NumBots'), '2');
    assert.equal(url.searchParams.get('Mutator'), 'Matrix2004_v130.MutMonkeyMatrixMoves,MatrixModern.MutMatrixModern');
    for (const invalid of ['../bad.u', '/bad.u', 'System/../bad.u', 'System\\bad.u']) await assert.rejects(api.build({files:[[invalid,new Blob(['bad'])]]}), /Unsafe/);
    await assert.rejects(api.build({files:[['System/X.u',new Blob()],['system/x.u',new Blob()]]}), /Duplicate/);
    delete globalThis.matrixProfileFiles; await assert.rejects(api.build(), /unavailable/);
    console.log('Hosted ZIP format, binary integrity, shared loader, travel URL, and path validation passed.');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
