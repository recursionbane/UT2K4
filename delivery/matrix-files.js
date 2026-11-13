const release =
  'https://unreal-archive-files-eu.s3.de.io.cloud.ovh.net/Unreal%20Tournament%202004/Mutators/M/f/d/ed10fc/MonkeyMatrixMoves2004_v130_selfextractor.exe';

const matrixSetupHelp =
  'The private Matrix archive is unavailable. Run mutators/monkey-matrix-moves/preserve.py, then restart tools/stream-game.py with --matrix-archive <verified archive path>.';

async function matrixArchiveSource(selected) {
  if (selected?.matrixArchive) return selected.matrixArchive;
  const here = new URL(location.href);
  const loopback = (url) =>
    ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  const saved = selected?.source ? new URL(selected.source, here) : null;
  const prepared = loopback(here) && here.pathname.startsWith('/play/');
  if (!prepared && !(saved && loopback(saved))) return release;
  // Refresh only addon metadata. Keep the chosen dataset, ID, and user settings.
  const manifest =
    saved && loopback(saved) ? saved : new URL('/manifest.json', here);
  try {
    const response = await fetch(manifest.href, {
      credentials: 'omit',
      cache: 'no-store',
    });
    if (!response.ok) throw Error('Missing private manifest.');
    const raw = await response.json();
    if (typeof raw.matrixArchive !== 'string' || !raw.matrixArchive)
      throw Error('Missing archive metadata.');
    const archive = new URL(raw.matrixArchive, manifest);
    if (
      !loopback(archive) ||
      archive.origin !== manifest.origin ||
      archive.username ||
      archive.password
    )
      throw Error('Matrix must be served by the private game source.');
    if (selected)
      await mediaSave([
        ['current-game', { ...selected, matrixArchive: archive.href }],
      ]);
    return archive.href;
  } catch (_) {
    throw Error(matrixSetupHelp);
  }
}

async function matrixProfileFiles(onProgress = () => {}) {
  const selected = await mediaGet('current-game');
  const source = await matrixArchiveSource(selected);
  let archive = await mediaGet('matrix-release');
  if (!archive) {
    onProgress(
      source !== release
        ? 'Loading the original mutator from your game source…'
        : 'Fetching the original mutator from Unreal Archive…',
    );
    let response;
    try {
      response = await fetch(source, { credentials: 'omit' });
    } catch (error) {
      throw Error(source === release ? error.message : matrixSetupHelp);
    }
    if (!response.ok)
      throw Error(
        source === release
          ? 'The mutator source returned HTTP ' + response.status
          : matrixSetupHelp,
      );
    archive = await response.blob();
  }
  // Verify cached bytes too; a failed local source never falls back to a mirror.
  if (
    (await sha256(archive)) !==
    '03f1d4fa6fe07feb3704e019cbec93db120172497ebb3755e8c7ead7a724bd96'
  )
    throw Error('Mutator checksum mismatch.');
  await mediaSave([['matrix-release', archive]]);
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
