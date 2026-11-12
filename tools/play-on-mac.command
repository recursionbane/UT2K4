#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
data="${UT2004_DATA:-.local-runtime/full-3374}"
client="${UT2004_WEB_CLIENT:-.local-runtime/ut2004-web-v0.2.0.tar.gz}"
pages='https://recursionbane.github.io/UT2K4/?source=http%3A%2F%2F127.0.0.1%3A8789%2Fmanifest.json'
if curl -fsS --max-time 2 http://127.0.0.1:8789/manifest.json | python3 -c 'import json,sys; sys.exit(json.load(sys.stdin).get("format") != "ut2k4-stream-v1")' 2>/dev/null; then
  open "$pages"
  exit 0
fi
if [ ! -d "$data/System" ] || [ ! -f "$client" ]; then
  echo 'Set UT2004_DATA to your full installation and UT2004_WEB_CLIENT to the v0.2.0 web archive.'
  exit 1
fi
python3 tools/stream-game.py "$data" --client "$client" &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true' EXIT
for attempt in 1 2 3 4 5; do
  if curl -fsS --max-time 2 --output /dev/null http://127.0.0.1:8789/manifest.json; then
    open "$pages"
    break
  fi
  sleep 1
done
wait "$server_pid"
