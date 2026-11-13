/* Build a normal mod ZIP on the player's device; no original packages are hosted here. */
(function (root) {
  'use strict';
  const mutators =
    'Matrix2004_v130.MutMonkeyMatrixMoves,MatrixModern.MutMatrixModern';
  const filename = 'monkey-matrix-moves-hosted.zip';
  const bindingCommand = 'set input B slowtimedown';
  const instructions =
    'Open the local collection, choose Mods, and upload this ZIP with Preserve structure (or Sort by type). Then open the Matrix launch link. In the game console, run: ' +
    bindingCommand +
    '. C crouches/hovers; Space jumps. Original bullet time requires 75 adrenaline.';
  const encoder = new TextEncoder();
  const table = Uint32Array.from({ length: 256 }, (_, n) => {
    for (let i = 0; i < 8; i++) n = (n >>> 1) ^ (n & 1 ? 0xedb88320 : 0);
    return n >>> 0;
  });
  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = (crc >>> 8) ^ table[(crc ^ byte) & 255];
    return (crc ^ 0xffffffff) >>> 0;
  }
  function header(size) {
    const bytes = new Uint8Array(size),
      view = new DataView(bytes.buffer);
    return {
      bytes,
      u16: (at, n) => view.setUint16(at, n, true),
      u32: (at, n) => view.setUint32(at, n, true),
    };
  }
  async function zip(files) {
    if (!files.length || files.length > 65535)
      throw Error('Unexpected mod file count.');
    const local = [],
      central = [],
      names = new Set();
    let offset = 0,
      centralSize = 0;
    for (const [path, blob] of files) {
      if (
        !/^[A-Za-z0-9_. -]+(?:\/[A-Za-z0-9_. -]+)*$/.test(path) ||
        path.split('/').some((p) => p === '.' || p === '..')
      )
        throw Error('Unsafe mod path: ' + path);
      const key = path.toLowerCase();
      if (names.has(key)) throw Error('Duplicate mod path: ' + path);
      names.add(key);
      const name = encoder.encode(path),
        data = new Uint8Array(await blob.arrayBuffer());
      if (
        name.length > 65535 ||
        data.length > 0xffffffff ||
        offset + data.length + name.length + 30 > 0xffffffff
      )
        throw Error('Mod ZIP exceeds supported size.');
      const crc = crc32(data),
        l = header(30),
        c = header(46);
      l.u32(0, 0x04034b50);
      l.u16(4, 20);
      l.u16(6, 0x800);
      l.u16(12, 33);
      l.u32(14, crc);
      l.u32(18, data.length);
      l.u32(22, data.length);
      l.u16(26, name.length);
      c.u32(0, 0x02014b50);
      c.u16(4, 20);
      c.u16(6, 20);
      c.u16(8, 0x800);
      c.u16(14, 33);
      c.u32(16, crc);
      c.u32(20, data.length);
      c.u32(24, data.length);
      c.u16(28, name.length);
      c.u32(42, offset);
      local.push(l.bytes, name, data);
      central.push(c.bytes, name);
      offset += 30 + name.length + data.length;
      centralSize += 46 + name.length;
    }
    const end = header(22);
    end.u32(0, 0x06054b50);
    end.u16(8, files.length);
    end.u16(10, files.length);
    end.u32(12, centralSize);
    end.u32(16, offset);
    return new Blob([...local, ...central, end.bytes], {
      type: 'application/zip',
    });
  }
  function launchURL() {
    const url = new URL('http://127.0.0.1:8789/ut2004/');
    url.searchParams.set('map', 'DM-Rankin');
    url.searchParams.set('Game', 'XGame.xDeathMatch');
    url.searchParams.set('NumBots', '2');
    url.searchParams.set('Mutator', mutators);
    return url.href;
  }
  async function build({ onProgress = () => {}, files } = {}) {
    if (!files) {
      if (typeof root.matrixProfileFiles !== 'function')
        throw Error('The verified Matrix file loader is unavailable.');
      files = await root.matrixProfileFiles(onProgress);
    }
    const entries = [
      ...files,
      [
        'README-matrix-hosted.txt',
        new Blob([instructions + '\n\n' + launchURL() + '\n']),
      ],
    ];
    onProgress('Building the Matrix mod ZIP on this device…');
    const blob = await zip(entries);
    return {
      blob,
      filename,
      entries: entries.map(([path, file]) => ({ path, size: file.size })),
      launchURL: launchURL(),
      bindingCommand,
    };
  }
  async function download(options) {
    const result = await build(options);
    const href = URL.createObjectURL(result.blob),
      anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = result.filename;
    anchor.hidden = true;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(href), 60000);
    return result;
  }
  const api = { build, download, launchURL, bindingCommand, instructions };
  root.HostedMatrixMod = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window === 'object' ? window : globalThis);
