#!/usr/bin/env python3
"""Boot the user-supplied native UT2004 WASM Node release against full game data."""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--client', required=True, type=Path, help='Locally extracted ut2004-node/ut2004.js')
    parser.add_argument('--data', required=True, type=Path, help='Full 3369 or 3374 root containing System/')
    parser.add_argument('--map', default='DM-Rankin')
    parser.add_argument('--mutator', action='append', default=[])
    parser.add_argument('--ticks', type=int, default=600)
    parser.add_argument('--timeout', type=int, default=180)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    if not re.fullmatch(r'[A-Za-z0-9_-]+', args.map):
        parser.error('Invalid map package')
    if any(not re.fullmatch(r'[A-Za-z_]\w*\.[A-Za-z_]\w*', value) for value in args.mutator):
        parser.error('Mutators must be Package.Class names')
    level = args.map + ('?Mutator=' + ','.join(args.mutator) if args.mutator else '')
    environment = dict(os.environ, UT2004_BASE=str(args.data.resolve() / 'System'),
                       UT2004_MAP=level, UT2004_HEADLESS_TICKS=str(args.ticks))
    result = subprocess.run(['node', str(args.client.resolve())], env=environment,
                            capture_output=True, text=True, timeout=args.timeout)
    log = result.stdout + result.stderr
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(log)
    passed = result.returncode == 0 and 'WASM: clean exit' in log and 'WASM_HEADLESS_PROOF:' in log
    print(json.dumps({'exitCode': result.returncode, 'passed': passed, 'mapURL': level,
                      'proof': [line for line in log.splitlines() if 'WASM_HEADLESS_PROOF:' in line],
                      'errors': [line for line in log.splitlines() if line.startswith(('Critical:', 'Error:', 'WASM defaults'))]}, indent=2))
    raise SystemExit(0 if passed else 1)

if __name__ == '__main__':
    main()
