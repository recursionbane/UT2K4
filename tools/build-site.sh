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
cp mutators/menu-profile/System/MenuProfile.u "$site_dir/compat/"
cp mutators/deferred-menu/System/DeferredMenu.u "$site_dir/compat/"

# Publish reusable authored runtime code, not a plaintext game distribution.
# The existing data-source launcher does not activate this profile automatically.
runtime_dir="$site_dir/runtime/collection"
mkdir -p "$runtime_dir/codecs/basis"
for asset in runtime/collection/*.mjs runtime/collection/*.js; do
  [ -f "$asset" ] || continue
  case "$asset" in *.test.mjs|*.test.cjs) continue ;; esac
  cp "$asset" "$runtime_dir/"
done
cp runtime/collection/README.md runtime/collection/loading-progress-protocol.md runtime/collection/asset-profile.md "$runtime_dir/"
for asset in basis-transcoder.mjs basis_transcoder.wasm LICENSE NOTICE EMSCRIPTEN-LICENSE ZSTD-LICENSE BUILD.md build.json; do
  cp "runtime/collection/codecs/basis/$asset" "$runtime_dir/codecs/basis/"
done
mkdir -p "$runtime_dir/codecs/opus"
for asset in decoder.mjs opus_decoder.wasm LICENSE NOTICE BUILD.md build.json; do
  [ -f "runtime/collection/codecs/opus/$asset" ] || continue
  cp "runtime/collection/codecs/opus/$asset" "$runtime_dir/codecs/opus/"
done
python3 - "$runtime_dir" <<'PYBUILD'
import json,pathlib,sys
root=pathlib.Path(sys.argv[1])
index={"profile":"authored-collection-runtime","activatedInLegacyLauncher":False,"requiresAuthorizedGameData":True,"files":sorted(p.relative_to(root).as_posix() for p in root.rglob('*') if p.is_file() and p.name!='index.json')}
(root/'index.json').write_text(json.dumps(index,indent=2)+'\n')
PYBUILD
