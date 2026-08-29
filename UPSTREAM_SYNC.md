# starlimsvscode upstream sync

Baseline: `MrDoe/starlimsvscode` commit `92b9014244eb09a56ed589db5155c3b7914b70a2`, version 1.8.2, fetched 2026-08-29.

The upstream project is a VS Code extension while STARLIMS DevTools is an Electron/React application. A direct file merge would replace the application shell and is therefore not safe. Updates are synchronized by capability layer.

## Integrated in 1.1.0

- SCM_API 1.8.2 server package and all source assets under `src/scm_api`.
- Upstream MCP transport pattern: loopback-only Streamable HTTP, stateful sessions, health endpoint, structured tool results and read-only annotations.
- STARLIMS MCP programming workflow: browse/search, code retrieval, checkout, save, check-in, undo checkout, logs, script/data-source execution and table definitions.
- MCP server-wide instructions telling agents to treat remote STARLIMS content as authoritative and to check out before saving.

## Adapted for Electron

- The MCP HTTP server runs in the Electron main process.
- Tool calls cross a narrow IPC bridge and execute through the existing renderer `EnterpriseService`, reusing the active login session.
- `save_item` accepts `uri`, `code`, and optional `language`. This is intentional: unlike the VS Code extension, DevTools does not maintain a workspace file for every checked-out item.
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

## Deferred compatibility work

These upstream capabilities depend heavily on VS Code APIs and need dedicated Electron implementations rather than copying files:

1. Call hierarchy UI integration requires either a custom Monaco contribution or a future public Monaco provider API.
2. Table designer and form-resource data views.
3. Ticket management, item transfer between servers and multi-server automation.
4. Local workspace synchronization compatible with upstream's file-oriented `save_item` flow.
5. Ollama-assisted check-in/commit messages. This is lower priority because MCP clients already provide model choice.

## Recommended next sync phases

1. Move SSL validation to a web worker if profiling shows noticeable latency on very large scripts.
2. Add cross-file navigation backed by the STARLIMS MCP/search index; current language navigation is document-local.
3. Port the upstream automation result contract into a shared, UI-independent STARLIMS core service.
4. Add optional MCP integration tests against a test STARLIMS server.
5. Track upstream as a Git remote or subtree so future syncs are commit-based rather than ZIP-based.
