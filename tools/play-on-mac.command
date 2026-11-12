#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
data="${UT2004_DATA:-.local-runtime/full-3374}"
client="${UT2004_WEB_CLIENT:-.local-runtime/ut2004-web-v0.2.0.tar.gz}"
site="${UT2004_SITE:-_site}"
port=8789
launcher_ready() {
  curl -fsS --max-time 2 "http://127.0.0.1:$1/manifest.json" 2>/dev/null |
    python3 -c 'import json,sys; v=json.load(sys.stdin); sys.exit(not(v.get("format")=="ut2k4-stream-v1" and v.get("launcherVersion",0)>=1))' 2>/dev/null
}
port_available() {
  python3 -c 'import socket,sys; s=socket.socket(); s.bind(("127.0.0.1",int(sys.argv[1]))); s.close()' "$1" 2>/dev/null
}
play_url() {
  echo "http://127.0.0.1:$1/play/?source=http%3A%2F%2F127.0.0.1%3A$1%2Fmanifest.json"
}
if launcher_ready "$port"; then
  open "$(play_url "$port")"
  exit 0
fi
if ! port_available "$port"; then
  echo 'A previous helper is still running. Starting the updated launcher alongside it.'
  port=''
  for candidate in 8790 8791 8792 8793 8794 8795 8796 8797 8798 8799; do
    if launcher_ready "$candidate"; then
      open "$(play_url "$candidate")"
      exit 0
    fi
    if port_available "$candidate"; then port="$candidate"; break; fi
  done
  if [ -z "$port" ]; then
    echo 'The local launcher ports are busy. Close an old game-helper Terminal window and try again.'
    exit 1
  fi
fi
if [ ! -d "$data/System" ] || [ ! -f "$client" ]; then
  echo 'The full game and web client need to be prepared first.'
  echo 'Set UT2004_DATA to the full installation and UT2004_WEB_CLIENT to the v0.2.0 web archive.'
  exit 1
fi
if [ "$site" = '_site' ]; then sh tools/build-site.sh "$site"; fi
if [ ! -f "$site/index.html" ] || [ ! -f "$site/sw.js" ]; then
  echo 'The launcher is missing. Run tools/build-site.sh and try again.'
  exit 1
fi
python3 tools/stream-game.py "$data" --client "$client" --site "$site" --port "$port" &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true' EXIT
ready=false
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if launcher_ready "$port"; then
    open "$(play_url "$port")"
    ready=true
    break
  fi
  if ! kill -0 "$server_pid" 2>/dev/null; then break; fi
  sleep 1
done
if [ "$ready" != true ]; then
  echo 'The game helper could not start. Check the message above and try again.'
  exit 1
fi
echo 'Matrix is opening in your browser. Keep this window open while playing.'
wait "$server_pid"
