# starlims-lsp integration map

Source: https://github.com/mahoskye/starlims-lsp

The upstream Go binary is treated as a replaceable language engine. STARLIMS
DevTools consumes only its documented CLI/LSP contracts and normalizes all
responses before they reach Monaco.

| Upstream capability | DevTools integration | Policy |
| --- | --- | --- |
| `--validate --stdin` | Native diagnostics | Enabled with TypeScript fallback |
| `--validate --ds` | Data Source diagnostics | Enabled for `slsql` documents |
| `--format --stdin` | Whole-document formatting | Enabled behind Designer compatibility |
| `--export-signatures` | Completion, hover, signature inventory | Merged with local inventory |
| `--stdio` | Full workspace LSP | Planned; not yet the primary Monaco transport |

DevTools-owned behavior must remain outside the upstream binary:

- Designer `#include` lines do not require semicolons.
- HTML Form CHS/ENG language routing is preserved.
- STARLIMS virtual document URIs and checked-out item identity remain stable.
- Unified write gates and content fingerprints apply before remote writes.

Upgrades are pinned by tag, commit, asset name, and SHA-256 in
`upstreams/upstreams.lock.json`. No application code may depend directly on
upstream JSON shapes without going through the native LSP adapter types.
