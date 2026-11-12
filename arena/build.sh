#!/bin/sh
set -eu
cd "$(dirname "$0")"
CC=${WASM_CC:-wasm32-clang}
"$CC" movement.c --target=wasm32 -O2 -nostdlib -Wl,--no-entry -Wl,--export=reset -Wl,--export=state -Wl,--export=step -o movement.wasm
