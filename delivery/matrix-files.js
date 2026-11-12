const release =
  'https://unreal-archive-files-eu.s3.de.io.cloud.ovh.net/Unreal%20Tournament%202004/Mutators/M/f/d/ed10fc/MonkeyMatrixMoves2004_v130_selfextractor.exe';

async function matrixProfileFiles(onProgress = () => {}) {
  let archive = await mediaGet('matrix-release');
  if (!archive) {
    onProgress('Fetching the original mutator from Unreal Archive…');
    const response = await fetch(release);
    if (!response.ok)
      throw Error('The mutator mirror returned HTTP ' + response.status);
    archive = await response.blob();
    if (
      (await sha256(archive)) !==
      '03f1d4fa6fe07feb3704e019cbec93db120172497ebb3755e8c7ead7a724bd96'
    )
      throw Error('Mutator checksum mismatch.');
    await mediaSave([['matrix-release', archive]]);
  }
  const response = await fetch('matrix-index.json');
  if (!response.ok) throw Error('Missing mutator index.');
  const out = [];
  for (const [path, [offset, length, size]] of Object.entries(
    await response.json(),
  )) {
    const bytes = archive.slice(offset, offset + length);
    const blob = await new Response(
      bytes.stream().pipeThrough(new DecompressionStream('deflate-raw')),
    ).blob();
    if (blob.size !== size) throw Error('Unexpected mutator file length.');
    out.push([path, blob]);
  }
  for (const name of ['MatrixModern.u', 'MatrixModern.ucl']) {
    const response = await fetch('compat/' + name);
    if (!response.ok)
      throw Error('The Matrix compatibility package is missing.');
    out.push(['System/' + name, await response.blob()]);
  }
  return out;
}
