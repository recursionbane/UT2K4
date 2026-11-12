#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
site_dir="${1:-_site}"
mkdir -p "$site_dir/arena"
for asset in index.html style.css launch.js media.js native-import.js full-game.js sw.js matrix-index.json rankin.jpg; do
  cp "delivery/$asset" "$site_dir/$asset"
done
for asset in arena.js index.html movement.wasm; do cp "arena/$asset" "$site_dir/arena/$asset"; done
