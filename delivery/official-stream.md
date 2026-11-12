# Official streaming checks — 2026-11-12

Measured from the deployed `https://recursionbane.github.io/UT2K4/` page, not inferred from command-line downloads:

| Source | Range support | Readable by the Pages client |
| --- | --- | --- |
| `files.oldunreal.net/UT2004.ISO` | HTTP 206; exact Content-Range | No: response omits Access-Control-Allow-Origin |
| `files2.oldunreal.net/UT2004.ISO` | Browser request reached CORS failure | No: response omits Access-Control-Allow-Origin |
| `files3.oldunreal.net/UT2004.ISO` | Server advertises ranges | No: response omits Access-Control-Allow-Origin |
| Official Linux installer's archive.org ZIP fallback | Final CDN returns HTTP 206 for the final 56 bytes of the 2,978,714,427-byte ZIP | No Access-Control-Allow-Origin in the final CDN response |
| Native engine v0.2.0 public GitHub release asset, fetched through the documented GitHub API | Metadata readable; binary redirect reached | Binary redirect omits Access-Control-Allow-Origin; browser rejects it |
| `https://games.rgnv.dev/ut2004/` | Public root timed out in browser and command-line checks | Not an available streaming source in this test |

All three ISO requests produced actual browser CORS errors. The first ISO request used `Range: bytes=32768-34815`; its server response is `bytes 32768-34815/2995322880`, but JavaScript cannot read it. `no-cors` would produce an opaque response whose package bytes cannot be consumed by the engine. A service worker cannot lift this restriction. An ISO/CAB or ZIP index also cannot bypass the browser's source permissions.

The fallback ZIP URL and SHA-256 are taken directly from OldUnreal's `FullGameInstallers/Linux/install-ut2004.sh`, rather than an unrelated archive listing. No private upstream game-file URL was used, no public CORS proxy was introduced, and no content was rehosted.

The implemented personal streaming route is `tools/stream-game.py`: the local machine serves its own full install and locally obtained native client with explicit Pages-origin CORS and byte ranges. Chrome may require Local Network Access permission before a secure public page can fetch a loopback source. After that permission is granted, package streaming avoids a full browser import and can auto-resume the game. The public Pages application cannot automatically obtain a first-time player's full game bytes from the tested official remote sources under their current CORS configuration.
