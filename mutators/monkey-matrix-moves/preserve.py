#!/usr/bin/env python3
"""Recover the unmodified 2004 release locally; never vendor third-party code."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import re
import shutil
import urllib.request
import zipfile

BASE = Path(__file__).resolve().parent
ARCHIVE = 'MonkeyMatrixMoves2004_v130_selfextractor.exe'
SHA1 = 'fded10fc61067161084d69b8d1f3afe01c1b951d'
MIRRORS = [
    'https://unreal-archive-files-eu.s3.de.io.cloud.ovh.net/',
    'https://unreal-archive-files-na.s3.ca-east-tor.io.cloud.ovh.net/',
]
REMOTE = 'Unreal%20Tournament%202004/Mutators/M/f/d/ed10fc/' + ARCHIVE
HASHES = {
    'System/Matrix2004_v130.u': 'c8097fe4a47fc84531b409f0002bb4257062ff55',
    'Textures/matrixrings.utx': '5c638195981dd6632c2a92aeeffaccdb0d8e4a92',
    'Textures/MonkeyMatrixInterface.utx': '32faf8c8dd334ebbc6ebfbd83c22d57cbbfbdf69',
}

def digest(data):
    return hashlib.sha1(data).hexdigest()

def recover(archive=None):
    local = BASE / 'local'
    local.mkdir(exist_ok=True)
    cached = local / ARCHIVE
    source = str(archive or cached)
    if archive:
        data = Path(archive).read_bytes()
    elif cached.exists():
        data = cached.read_bytes()
    else:
        errors = []
        for mirror in MIRRORS:
            try:
                source = mirror + REMOTE
                with urllib.request.urlopen(source, timeout=60) as response:
                    data = response.read()
                break
            except Exception as exc:
                errors.append(str(exc))
        else:
            raise RuntimeError('All mirrors failed: ' + '; '.join(errors))
    if digest(data) != SHA1:
        raise ValueError('Archive checksum mismatch; refusing extraction')
    cached.write_bytes(data)
    target = local / 'release'
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        # Reject anything outside the original seven-file allowlist.
        allowed = set(HASHES) | {'System/MonkeyMatrixMoves2004.int',
            'System/Matrix2004_v130.ucl', 'install.txt', 'MonkeyMatrixMoves_README.html'}
        files = {i.filename for i in z.infolist() if not i.is_dir()}
        if files != allowed:
            raise ValueError('Unexpected archive contents')
        for name in allowed:
            payload = z.read(name)
            if name in HASHES and digest(payload) != HASHES[name]:
                raise ValueError('Package checksum mismatch: ' + name)
            path = target / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(payload)
    # These are source text buffers embedded by the original authors, not a
    # bytecode decompilation. Serialized defaultproperties are not included.
    package = (target / 'System/Matrix2004_v130.u').read_bytes()
    source_dir = local / 'source-text'
    source_dir.mkdir(exist_ok=True)
    recovered = []
    for text in re.findall(rb'(class [^\x00]+)\x00', package):
        name = re.match(rb'class\s+(\w+)\s+extends\s+', text)
        if name:
            filename = name[1].decode('ascii') + '.uc'
            (source_dir / filename).write_bytes(text)
            recovered.append(filename)
    if len(recovered) != 66:
        raise ValueError('Expected 66 embedded class text buffers')
    manifest = {'archive': ARCHIVE, 'sha1': SHA1, 'source': MIRRORS[0] + REMOTE, 'input_source': source,
        'package_sha1': HASHES, 'recovered_source_text_count': len(recovered),
        'source_text_limit': 'Embedded class text only; no serialized defaultproperties.',
        'rights': 'No license or source redistribution grant found in original README.'}
    (local / 'provenance.json').write_text(json.dumps(manifest, indent=2) + '\n')
    return target, source_dir

def bind_b(game):
    path = game / 'System/User.ini'
    text = path.read_text()
    section = re.search(r'(?ms)^\[Engine\.Input\]\s*\n(.*?)(?=^\[|\Z)', text)
    if section is None:
        raise ValueError('User.ini has no [Engine.Input] section')
    body = section[1]
    updated = re.sub(r'(?m)^B=.*$', 'B=slowtimedown', body)
    if updated == body and not re.search(r'(?m)^B=', body):
        updated = 'B=slowtimedown\n' + body
    result = text[:section.start(1)] + updated + text[section.end(1):]
    backup = path.with_name('User.ini.before-monkey-matrix')
    if not backup.exists():
        backup.write_bytes(path.read_bytes())
    path.write_text(result)
    print('Bound B to slowtimedown; original User.ini saved as', backup.name)

def install(release, game):
    game = game.resolve()
    if not (game / 'System/Core.u').is_file():
        raise ValueError('Expected UT2004 installation containing System/Core.u')
    plan = []
    for folder in ('System', 'Textures'):
        for src in (release / folder).iterdir():
            dest = game / folder / src.name
            if dest.exists() and dest.read_bytes() != src.read_bytes():
                raise ValueError('Refusing to overwrite different existing file: ' + str(dest))
            plan.append((src, dest))
    for src, dest in plan:
        shutil.copy2(src, dest)
    print('Installed original release into', game)
    print('Launch DM with ?Mutator=Matrix2004_v130.MutMonkeyMatrixMoves')
    print('Bind bullet time in controls or console: set input B slowtimedown')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', type=Path, help='Use an already downloaded original archive')
    parser.add_argument('--install', type=Path, metavar='UT2004_ROOT', help='Install verified original packages')
    parser.add_argument('--modern-compat', action='store_true', help='With --install, install the independently written modern-controller adapter')
    parser.add_argument('--bind-b', action='store_true', help='With --install, bind B to bullet time and back up User.ini')
    args = parser.parse_args()
    if (args.bind_b or args.modern_compat) and not args.install:
        parser.error('--bind-b and --modern-compat require --install')
    release, sources = recover(args.archive)
    print('Verified original release:', release)
    print('Recovered 66 original source texts locally:', sources)
    if args.install:
        install(release, args.install)
        if args.modern_compat:
            for src in (BASE.parent / 'matrix-modern/System').glob('MatrixModern.*'):
                dest = args.install / 'System' / src.name
                if dest.exists() and dest.read_bytes() != src.read_bytes():
                    raise ValueError('Refusing to overwrite different adapter: ' + str(dest))
                shutil.copy2(src, dest)
            print('Enable both mutators: Matrix2004_v130.MutMonkeyMatrixMoves,MatrixModern.MutMatrixModern')
        if args.bind_b:
            bind_b(args.install)
