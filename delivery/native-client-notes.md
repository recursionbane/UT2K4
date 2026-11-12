# Native WebAssembly client provenance and local import

Reviewed 2026-11-12: rgnv/ut2004-wasm tag v0.2.0, its release NOTICE, and the community engine source at its pinned commit deda0fb.

The [port LICENSE](https://github.com/rgnv/ut2004-wasm/blob/v0.2.0/LICENSE) applies MIT to the author's harnesses, shell and documentation. Its explicit scope note excludes Epic's engine code, data and assets and excludes the fetched community source tree. The [NOTICE](https://github.com/rgnv/ut2004-wasm/blob/v0.2.0/NOTICE.md) describes the release WebAssembly engine as intended for personal use with separately obtained game data. It does not supply an express public engine redistribution grant. Therefore the presence of an MIT license on the port repository is insufficient evidence for bundling its compiled engine into this site's public deployment.

The [pinned engine README](https://github.com/emmanuelgoldstein1337/UT2004_CMAKE/blob/deda0fb/README.md) describes its provenance as leaked code. This conflicts with the port README's characterization of a source release. The pinned tree has component licenses but no root engine redistribution license in its recursive file listing. Its [System/License.int](https://github.com/emmanuelgoldstein1337/UT2004_CMAKE/blob/deda0fb/System/License.int) contains the commercial game's restrictive EULA, rather than an open engine license. This review did not establish permission to republish the compiled engine. It does not resolve whether any individual user's use is authorized.

The browser shell itself can be reused under MIT with the full upstream copyright and license notice preserved. Third-party components have separate terms; consult the upstream NOTICE. The complete downloaded web release was inspected locally: it includes a 23,222,347-byte `ut2004.wasm`, generated JS, index shell, worker, two mobile-input assets and data manifests. It contains compiled Epic engine code despite containing no game packages.

## Integration

`native-import.js` does not bundle or download the client. A user selects their local `ut2004-web-v0.2.0.tar.gz`; `importNativeClient(file, statusCallback)` validates the six used files against pinned SHA-256 checksums and atomically saves them into local IndexedDB using `media.js`. Unsupported versions and altered archives are rejected. The user-selected executable code remains on their device and is never uploaded by the importer.

Load `media.js` and `native-import.js` in the launcher. Use `nativeClientReady()` to check local availability. Add `importScripts('./native-import.js')` after media.js in the service worker, then call `await nativeResponse(request, self.registration.scope)` early in fetch handling and return it when non-null. It serves virtual `native/<profileid>/` client resources. The owner of the data service worker must provide `native/<profileid>/data/*`, `files.json` and `file-sizes.json`; these requests deliberately return null from the client handler. COOP/COEP/CORP headers are supplied on imported resources. Client responses support GET, HEAD and simple byte ranges.

The adapter rewrites the upstream shell to resolve assets and data beneath the current profile, and permits only validated Package.Class entries in the `mutator` query parameter. It leaves all actual engine mechanics untouched. Game packages must match the native port's supported 3369 or 3374-preview-23 era; the 3334 demo package layout is incompatible with this v0.2.0 engine (engine-agent test result).

No engine bytes, upstream generated JS, or upstream shell copy are committed by this import module. Local copies under /tmp are development evidence only. Public distribution of any separately supplied game data requires a distinct review.
