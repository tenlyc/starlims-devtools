# starlimsvscode upstream sync

Baseline: `MrDoe/starlimsvscode` commit `92b9014244eb09a56ed589db5155c3b7914b70a2`, version 1.8.2, fetched 2026-08-29.

The machine-readable baseline is maintained in `upstreams/upstreams.lock.json`.
This document describes integration decisions; the lock file is the only
source of truth for automated checks and builds.

The upstream project is a VS Code extension while STARLIMS DevTools is an Electron/React application. A direct file merge would replace the application shell and is therefore not safe. Updates are synchronized by capability layer.

Shared MCP schemas and provenance now live in the separately versioned
[`tenlyc/starlims-mcp`](https://github.com/tenlyc/starlims-mcp) package. The
package version is locked in `components/shared-components.lock.json`; it does
not replace the third-party baseline in `upstreams/upstreams.lock.json`.

## Integrated in 1.1.0

- SCM_API 1.8.2 server package and all source assets under `src/scm_api`.
- Upstream MCP transport pattern: loopback-only Streamable HTTP, stateful sessions, health endpoint, structured tool results and read-only annotations.
- STARLIMS MCP programming workflow: browse/search, code retrieval, checkout, save, check-in, undo checkout, logs, script/data-source execution and table definitions.
- MCP server-wide instructions telling agents to treat remote STARLIMS content as authoritative and to check out before saving.
- Shared MCP tool catalog, risk metadata, host Profiles and `get_capabilities`
  handshake are consumed from `@tenlyc/starlims-mcp` v0.2.0.
- The reviewed `starlimsvscode` and DevTools MCP/SCM sources are preserved as
  immutable, per-file SHA-256-verified snapshots in `starlims-mcp/vendor`.
  Builds do not depend on either source repository remaining online.

## Adapted for Electron

- The MCP HTTP server runs in the Electron main process.
- Electron owns the DevTools Adapter and transport; the generic Agent and MCP
  HTTP server derive their built-in tool schemas from the same shared catalog.
- Tool calls cross a narrow IPC bridge and execute through the existing renderer `EnterpriseService`, reusing the active login session.
- `save_item` accepts `uri`, `code`, and optional `language`. DevTools also maintains a per-server/user Git workspace for checked-out items, but write-back still crosses the unified fingerprint and quality gate instead of allowing the LSP or filesystem to save remotely.
- The old provider-specific AI panel is no longer loaded by the application. Model selection and credentials belong to the external MCP client.

## Integrated in 1.2.0

- Upstream SSL lexer, parser, AST, symbol table and 139 built-in function definitions.
- Parser diagnostics plus the upstream SSL style-guide diagnostics, including keyword casing, unsafe SQL construction, Hungarian notation, block-depth and procedure-shape rules.
- Monaco document/range formatting, including embedded SQL formatting.
- Monaco hover, signature help, keyword/builtin completion, document symbols and folding ranges.
- A direct Monaco adapter replaces the VS Code language-server transport while retaining the upstream language core.

## Integrated in 1.3.0

- Monaco definition, reference, rename and document-highlight providers for local SSL symbols.
- Parameter-name inlay hints and procedure-reference CodeLens.
- Monaco quick fixes for upstream SSL style diagnostics, including line/file suppression actions.
- Scope-aware local symbol lookup so parameter and variable navigation resolves in the procedure that owns the reference.
- The upstream call-hierarchy calculation core is retained, but Monaco does not expose a public call-hierarchy provider API to register it in this application shell.

## Integrated in 1.6.2

- A persistent stdio adapter starts the locked native `starlims-lsp` binary and synchronizes every checked-out SSL workspace document.
- Monaco definition, references, rename, and workspace-symbol search use the native session first. A conservative DevTools index supplements cross-document `:PROCEDURE Name` / `Name(...)` navigation that upstream 0.21.0 does not yet resolve.
- Cross-file rename opens affected scripts as reviewable local dirty buffers; it never writes directly to STARLIMS.
- Customize exposes LSP health, document count, workspace-symbol search, the locked `starlimsvscode` audit commit, restart, and version selection.
- Bundled LSP binaries are cached by version only after SHA-256 verification. Previous verified versions remain selectable after an application upgrade.

## Deferred compatibility work

These upstream capabilities depend heavily on VS Code APIs and need dedicated Electron implementations rather than copying files:

1. Call hierarchy UI integration requires either a custom Monaco contribution or a future public Monaco provider API.
2. Table designer and form-resource data views.
3. Ticket management, item transfer between servers and multi-server automation.
4. Ollama-assisted check-in/commit messages. This is lower priority because MCP clients already provide model choice.

## Recommended next sync phases

1. Move SSL validation to a web worker if profiling shows noticeable latency on very large scripts.
2. Port the upstream automation result contract into a shared, UI-independent STARLIMS core service.
3. Add optional MCP integration tests against a test STARLIMS server.
4. Review the report produced by `npm run upstream:audit:starlimsvscode` and
   update the locked commit only after selected capabilities pass DevTools
   contract tests.

## Automated maintenance

- `npm run upstream:check` compares the locked LSP Release and reference
  commit with GitHub without running upstream code.
- `npm run upstream:update:lsp -- vX.Y.Z` downloads every supported platform
  asset, calculates SHA-256, tests the current-platform candidate, and updates
  the lock only after compatibility checks pass.
- `npm run upstream:accept:starlimsvscode -- <commit> --confirm-reviewed`
  advances the reference baseline only after the selected changes were ported
  and the SSL/SCM/language contracts pass.
- `.github/workflows/upstream-watch.yml` runs weekly and creates or refreshes
  one review Issue when either upstream changes.
- Whole-repository merges and Git submodules are intentionally avoided because
  VS Code extension APIs must not leak into the Electron application shell.
