#!/usr/bin/env python3
"""Build authored assist, recovery and menu packages with a user-supplied UT2004 compiler."""
import argparse
import hashlib
from pathlib import Path
import re
import shutil
import subprocess


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--compiler-system', required=True, type=Path,
                        help='System directory containing matching UCC.exe, Default.ini and compiled dependencies')
    parser.add_argument('--assets', required=True, type=Path,
                        help='Matching game root containing Maps, Textures, Animations, StaticMeshes and Sounds')
    parser.add_argument('--matrix-assets', action='append', default=[], type=Path,
                        help='Additional directory containing original Matrix .utx textures (repeatable)')
    parser.add_argument('--wine', type=Path, help='Optional Wine executable; omitted for a native Windows build')
    parser.add_argument('--wine-bottle', help='Optional CrossOver bottle name, used with --wine')
    args = parser.parse_args()
    if args.wine_bottle and not args.wine:
        parser.error('--wine-bottle requires --wine')
    root = Path(__file__).resolve().parents[1]
    system = args.compiler_system.resolve()
    game = system.parent
    for name in ('UCC.exe', 'Default.ini', 'Core.u', 'Engine.u', 'XGame.u', 'XInterface.u', 'GUI2K4.u', 'Matrix2004_v130.u'):
        if not (system / name).is_file():
            parser.error('Missing compiler dependency: ' + name)
    packages = [('LocalAim', 'local-assist', ('u', 'ucl')), ('LocalRecovery', 'local-recovery', ('u', 'ucl')), ('MenuProfile', 'menu-profile', ('u',)), ('DeferredMenu', 'deferred-menu', ('u',))]
    for package, folder, _ in packages:
        destination = game / package / 'Classes'
        destination.mkdir(parents=True, exist_ok=True)
        sources = list((root / 'mutators' / folder / 'Classes').glob('*.uc'))
        if not sources:
            parser.error('Authored sources missing for ' + package)
        for source in sources:
            shutil.copy2(source, destination / source.name)
    ini = (system / 'Default.ini').read_text()
    section = re.search(r'(?ms)^\[Editor.EditorEngine\]\n.*?(?=^\[|\Z)', ini)
    if not section:
        parser.error('Default.ini has no Editor.EditorEngine section')
    # Preserve the compiler's stock package order; original Matrix is a dependency.
    addition = ''.join('EditPackages=' + package + '\n' for package in
                       ('Matrix2004_v130', 'LocalAim', 'LocalRecovery', 'MenuProfile', 'DeferredMenu')
                       if not re.search(r'(?mi)^EditPackages=' + re.escape(package) + r'\s*$', section[0]))
    ini = ini[:section.end()] + addition + ini[section.end():]
    def compiler_path(path):
        text = str(path.resolve())
        return 'Z:' + text if args.wine and text.startswith('/') else text
    paths = ''
    for directory, extension in [('Textures', 'utx'), ('Animations', 'ukx'),
                                 ('StaticMeshes', 'usx'), ('Sounds', 'uax'), ('Maps', 'ut2')]:
        asset_dir = args.assets.resolve() / directory
        if not asset_dir.is_dir():
            parser.error('Missing asset directory: ' + str(asset_dir))
        paths += 'Paths=' + compiler_path(asset_dir / ('*.' + extension)) + '\n'
    for directory in args.matrix_assets:
        if not directory.is_dir():
            parser.error('Missing Matrix texture directory: ' + str(directory))
        paths += 'Paths=' + compiler_path(directory / '*.utx') + '\n'
    ini = ini.replace('[Core.System]', '[Core.System]\n' + paths)
    (system / 'LocalAssistBuild.ini').write_text(ini)
    for package, _, _ in packages:
        (system / (package + '.u')).unlink(missing_ok=True)
    command = [str(system / 'UCC.exe'), 'make', '-ini=LocalAssistBuild.ini']
    if args.wine:
        prefix = [str(args.wine)]
        if args.wine_bottle:
            prefix += ['--bottle', args.wine_bottle, '--workdir', str(system)]
        command = prefix + command
    result = subprocess.run(command, cwd=system, capture_output=True, text=True)
    # Build logs stay in the user-supplied compiler tree, outside public sources.
    (system / 'LocalAssistBuild.log').write_text(result.stdout + '\n' + result.stderr)
    if result.returncode or 'Success - 0 error(s)' not in result.stdout:
        raise SystemExit('Compile failed; inspect LocalAssistBuild.log in the compiler System directory')
    for package, folder, extensions in packages:
        output = root / 'mutators' / folder / 'System'
        output.mkdir(parents=True, exist_ok=True)
        for extension in extensions:
            target = output / (package + '.' + extension)
            shutil.copy2(system / target.name, target)
            print(hashlib.sha256(target.read_bytes()).hexdigest(), target.relative_to(root))
    print('Compiled all authored packages with zero errors.')


if __name__ == '__main__':
    main()
