# Compact browser engine extensions

These are build-time additions for an operator-supplied UT2004 engine tree.
The integration was tested with engine commit
`d6b102813a70ca219bf45d5511611ac887d79f39` and Emscripten 5.0.7.
This directory contains the new serialization and playback code.

* The emitter hook rebuilds a particle-emission surface on demand from the
  compiled triangle sections of a mesh whose source triangles were removed.
* Compact vertex streams store position components in exact dictionaries.
  Render normals use signed eight-bit components. Collision vertices keep
  their original IDs and IEEE-754 position words.
* Compact instance color streams contain an adaptive RGB palette and exact
  vertex alpha. A format marker identifies baked lighting to the renderer.
* The music extension accepts mono Ogg Opus as well as native Vorbis. It
  decodes one block at a time and emits the track's declared original rate,
  frame count and loop duration to OpenAL.

Apply the install scripts only to a separate checkout used for the web build:

```sh
python3 tools/engine/install-compact-emitter.py /path/to/engine
python3 tools/engine/install-compact-instance.py /path/to/engine
python3 tools/engine/install-compact-vertices.py /path/to/engine
python3 tools/engine/install-compact-music.py /path/to/engine /path/to/opus /path/to/opusfile /path/to/ogg
```

The tested dependencies were libopus 1.6.1, libogg 1.3.6, and opusfile
commit `6dfd29e7adb87f2e193575fc3fa88cbf1a0b27df`. The Opus reader has
its own symbol-prefixed libogg so that the stock Vorbis decoder keeps its
original ABI. Include all three dependency licenses with a deployment.

Configure the engine's web performance preset with `ALSOFT_ENABLE_MODULES=OFF`
and the game data matching the engine version. This avoids a C++20 module
linkage mismatch between the OpenAL web backend and its logging implementation.
On macOS the upstream final link step expects GNU-style `sed -i`. Use the
matching generated JS/WASM pair and reapply the collection frontend changes
when the generated import or export bindings change.

To cook music, compile the source reader against system libvorbisfile and the
playback check against system libopusfile, using the same reader compiled into
the web engine. Supply a complete original collection catalog.

```sh
cc -O2 tools/audio/source-music-pcm.c -o /tmp/source-music-pcm $(pkg-config --cflags --libs vorbisfile)
cc -O2 tools/audio/check-compact-opus.c tools/engine/compact-opus-stream.c -o /tmp/check-compact-opus $(pkg-config --cflags --libs opusfile)
python3 tools/build-streamed-opus-music.py --files /path/to/catalog/files --output /path/to/new/music --decoder /tmp/source-music-pcm --verify-reader /tmp/check-compact-opus --bitrate 14000
```

The converter retains individual source comments, adds explicit playback-rate
and sample-count tags, and verifies complete decode, rewind and seek before
selecting an encode. The bitrate is intentionally lossy.
