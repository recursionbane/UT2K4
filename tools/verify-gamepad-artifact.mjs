import fs from 'node:fs';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { patchPointerCapture } from '../runtime/collection/pointer-capture.mjs';

// Verify the bytes that a release will serve, including negotiated encodings.
export function verifyGamepadArtifact(original, identity, variants = []) {
  if (original.includes('/* __privatePointerCaptureV1 */')) {
    throw Error('The reference must be the original upstream virtual gamepad');
  }
  const expected = Buffer.from(patchPointerCapture(original));
  if (!expected.equals(identity)) throw Error('Gamepad identity differs from the patched source');
  for (const { encoding, bytes } of variants) {
    let decoded;
    if (encoding === 'br') decoded = brotliDecompressSync(bytes);
    else if (encoding === 'gzip') decoded = gunzipSync(bytes);
    else throw Error('Unknown gamepad encoding ' + encoding);
    if (!expected.equals(decoded)) throw Error('Gamepad ' + encoding + ' differs from identity');
  }
}

if (import.meta.main) {
  const [reference, staged, ...paths] = process.argv.slice(2);
  if (!reference || !staged) throw Error('Usage: verify-gamepad-artifact.mjs ORIGINAL STAGED [VARIANT.br|VARIANT.gz ...]');
  const files = new Set([...paths, ...['.br','.gz'].map(ext => staged + ext).filter(p => fs.existsSync(p))]);
  const variants = [...files].map(path => ({
    encoding: path.endsWith('.br') ? 'br' : path.endsWith('.gz') ? 'gzip' : path,
    bytes: fs.readFileSync(path),
  }));
  verifyGamepadArtifact(fs.readFileSync(reference, 'utf8'), fs.readFileSync(staged), variants);
  console.log('Verified the gamepad identity and ' + variants.length + ' compressed representations.');
}
