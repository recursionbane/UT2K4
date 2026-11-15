#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
site_dir="${1:-_site}"
mkdir -p "$site_dir/arena" "$site_dir/compat"
for asset in index.html style.css launch.js media.js matrix-files.js hosted-mod.js native-import.js full-game.js stream.js sw.js matrix-index.json rankin.jpg; do
  cp "delivery/$asset" "$site_dir/$asset"
done
for asset in arena.js index.html movement.wasm; do cp "arena/$asset" "$site_dir/arena/$asset"; done
cp mutators/matrix-modern/System/MatrixModern.u mutators/matrix-modern/System/MatrixModern.ucl "$site_dir/compat/"
cp mutators/local-assist/System/LocalAim.u mutators/local-assist/System/LocalAim.ucl "$site_dir/compat/"
cp mutators/local-recovery/System/LocalRecovery.u mutators/local-recovery/System/LocalRecovery.ucl "$site_dir/compat/"
