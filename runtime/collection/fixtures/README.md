`basis-gradient.ktx2` is an authored test fixture, not game content. Its source
is a 16×16 opaque procedural RGBA gradient:
R=x*17, G=y*17, B=(x XOR y)*17, A=255.
Encoded using the pinned Basis Universal encoder, ETC1S quality128/effort2.

`basis-alpha.ktx2` is another authored 16×16 procedural fixture. It uses the
same RGB formula and A=x*17, encoded as ETC1S at quality 255 / effort 2. It
exercises alpha reconstruction without using a game texture.

`opus-tone.opus` is an authored 440 Hz sine wave, 0.2 seconds at 48 kHz,
encoded with libopus at 20 kbps. It exercises the actual Opus decoder without
using a game recording.
