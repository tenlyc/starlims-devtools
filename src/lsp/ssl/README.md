# SSL language integration

STARLIMS DevTools uses a hybrid integration:

- Native validation and whole-document formatting are synchronized with
  [`mahoskye/starlims-lsp`](https://github.com/mahoskye/starlims-lsp)
  at the version pinned in `upstreams/upstreams.lock.json` (currently
  **v0.21.0**). The platform binary is downloaded from its GitHub Release at
  build time and verified against the locked SHA-256.
- The TypeScript core in this directory remains the offline fallback and
  supplies Monaco-native hover, completion, document symbols, folding,
  definition, references, rename, inlay hints, code lenses and quick fixes.
  It originated from `MrDoe/starlimsvscode` commit
  `92b9014244eb09a56ed589db5155c3b7914b70a2`.

The Monaco adapter lives in `src/services/sslLanguageFeatures.ts`. Native
diagnostics automatically fall back to the TypeScript core when the upstream
binary is unavailable. `sslLspCompatibility.ts` preserves DevTools-specific
STARLIMS Designer syntax, notably `#include` directives without semicolons.

Both upstream projects are MIT licensed. The native binary's license and
third-party notices are included under `resources/starlims-lsp/` in packaged
applications.
