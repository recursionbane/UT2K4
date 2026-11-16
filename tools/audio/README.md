# Audio profile tools

These tools generate candidates from a supplied collection catalog. They do not
edit the source tree or deploy anything. Original files remain available when a
conversion is unsupported or does not produce a useful size saving.

The shipping music profile is **Vorbis VBR quality 0, mono, original sample rate**.
It preserves exact decoded frame counts and the original Vorbis comment packet,
including loop tags. It deliberately downmixes stereo; it never upsamples mono to
fake stereo. Candidates must save at least 10%. Unusual framing/timing and already
smaller originals stay unchanged.

Sound effects use Opus transport and reconstruct the original PCM shape inside
unchanged package headers. The compact class/duration policy uses 16–48 kbps per
channel: music-like assets and important UI/short cues receive 48; weapon/impact/
movement cues receive 32; voice and ambience use lower rates. Positional mono
stays mono. Package candidates must save 5%, and all regions must be inside parsed
USound RawData. The generic UE package reader supports its declared serialization
profiles; unsupported legacy packages remain original.

Requirements: Python 3.12+, Node with native Zstd support, FFmpeg with libopus,
and a C compiler with libogg/libvorbis development headers. Build the small native
Vorbis candidate encoder (this is a build tool, not browser playback code):

```sh
cc -O2 tools/audio/vorbis-encode.c -o /path/to/vorbis-encode $(pkg-config --cflags --libs vorbisenc ogg)
python3 tools/build-music-profile.py --files /path/to/catalog/files --output .local-runtime/audio-compact/music --encoder /path/to/vorbis-encode --profile mono-vbr0 --sample-rate 0 --all-folders
python3 tools/measure-music-quality.py --files /path/to/catalog/files --corpus .local-runtime/audio-compact/music
node tools/build-sound-profile.mjs --files /path/to/catalog/files --output .local-runtime/audio-compact/sounds
node tools/verify-sound-profile.mjs --files /path/to/catalog/files --corpus .local-runtime/audio-compact/sounds
```

The music validator additionally takes representative native playback evidence
and its hash-bound candidate inventory. It checks native looping/fades, exact
shape/metadata and a catastrophic mono-energy-loss threshold (default −9 dB
against input stereo energy), and writes `{summary,candidates,retainedOriginals}`.
It distinguishes individual playback from shared codec-path validation. Objective
checks do not establish perceptual transparency; no full-corpus listening claim
is made.

Sound `report.json` rows expose `eligible`, `logical`, `descriptor` and
`sourceSha256`. Descriptors retain original offsets/lengths and independent
encoded-region hashes, so a packager can group encoded objects into range bundles.
Only referenced payloads should ship; encoder-cache orphans are not release files.
The build is resumable through source/profile/hash checks and atomic artifacts.

The Opus browser adapter prefers WebCodecs and otherwise lazily loads the bundled,
licensed, fixed-2-MiB WASM decoder. It uses same-origin requests and no eval/CDN.
Its actual decoder CI tests use authored synthetic audio, not game assets.

Wire savings do not shrink the engine's original PCM allocations. Current decode
work is capped at 16 MiB of expanded 48-kHz Float32; temporary planes, output PCM,
base/region caches and the native heap are separate allocations. See measured
profile reports for actual peaks. Music uses the native Vorbis stream path and
retains native volume, pause and transition ownership.
