# STARLIMS MCP architecture and provenance boundaries

[简体中文](MCP_ARCHITECTURE.md) · **English**

STARLIMS DevTools uses [`tenlyc/starlims-mcp`](https://github.com/tenlyc/starlims-mcp) as its shared MCP contract and host-neutral runtime. DevTools starts the package's independent HTTP Server process. The Electron main process retains the signed-in session, approval policy, write gates, and Renderer IPC adapter; the shared Server has no VS Code dependency.

The Server communicates with the product permission layer through a loopback-only bridge protected by a random Bearer token. STARLIMS passwords never enter the child process. If startup or health checks fail, DevTools switches to its built-in compatibility Server. Both the shared Server and bridge are stopped when the application exits.

## Repository responsibilities

| Repository | Responsibility | Out of scope |
| --- | --- | --- |
| `MrDoe/starlimsvscode` | Upstream `SCM_API`, VS Code implementation, and compatibility reference | DevTools product runtime |
| `tenlyc/starlims-mcp` | MCP contracts, origin/risk metadata, Profiles, capability negotiation, shared backend extensions, and verified MCP/SCM snapshots | Credentials, server selection, and product UI |
| `tenlyc/starlims-devtools` | Electron/React product, Agents, workspaces, approvals, and quality gates | Replacing the upstream `SCM_API` contract |

## Tool origin and host support

Every shared tool has one of two `origin` values:

- `starlimsvscode` for upstream or upstream-derived base behavior such as `get_item_code`, `checkout_item`, and `save_item(uri, code, language, expectedVersion?)`.
- `starlims-mcp` for first-party shared behavior, including capabilities initially implemented by DevTools such as `list_checked_out_items` and `query_checkin_history`.

Multilingual forms use the shared `get_form_resources`, `set_form_resource`, and `save_form_resources` contracts. `language` is mandatory; writes include conflict detection and read-after-write verification. Host-specific local-path behavior has a distinct name such as `vscode_save_local_item`, so it cannot conflict with the shared remote `save_item` contract.

Whether a tool can run in a particular product is expressed independently through Profiles and Adapter capabilities. DevTools is the `devtools` Profile/Adapter, not a third origin. Clients should call `get_capabilities` after connecting instead of inferring support from product names.

## Offline archive and reuse

The `starlims-mcp/vendor/` directory contains reviewed MCP/SCM snapshots pinned to full Git commits. Each snapshot records its source, license, file manifest, per-file SHA-256 values, and aggregate digest, without Git submodule or LFS pointers.

An archived version therefore remains recoverable and auditable if an upstream repository is deleted, made private, or temporarily unavailable. Vendor snapshots are immutable: new work enters the shared contract or owning product first, then is imported as a new snapshot.

## One SCM_API deployment package

- STARLIMS receives one `SCM_API.*` namespace and one `SCM_API.sdp` package.
- Upstream scripts retain their names; first-party additions use the `Mcp*` prefix to avoid future collisions.
- `npm run build:scm-api` builds the combined package and updates both the application resource and `release/SCM_API.sdp`.
- Current first-party backend scripts are `McpGetSCMUsers`, `McpGetCheckInHistory`, `McpExportPackage`, and `McpImportPackage`. They are owned by `tenlyc/starlims-mcp` and hosted by the DevTools Adapter.

Provenance is preserved through MCP metadata, lock files, and audit documents rather than separate deployment packages. A new backend endpoint must use an `Mcp*` name, update the manifest/content, and rebuild the same `SCM_API.sdp`.

## Upgrade flow

1. `npm run upstream:check` discovers a `starlimsvscode` change.
2. Review the generated report by SCM API, MCP contract, and VS Code UI capability.
3. Import accepted source into a new immutable `starlims-mcp/vendor` snapshot; update contracts, provenance, Profiles, and contract tests; publish an immutable tag.
4. DevTools advances its pinned package/tag and `components/shared-components.lock.json`, then bundles the shared Server CLI.
5. Run MCP, Agent-tool, write-gate, and full smoke tests before advancing the accepted upstream baseline.

## Runtime Server updates and rollback

The MCP page lists only tools that the active DevTools Adapter really supports, including risk, capability, and origin metadata.

The Upstream Components page can check official `tenlyc/starlims-mcp` GitHub Releases and install an independent Server manually. A Release must contain both `starlims-mcp-devtools-server.cjs` and its `.sha256` file. DevTools verifies SHA-256 before executing remote JavaScript and stores versions separately. A bad digest, modified cache, failed startup, or failed health check causes an automatic rollback to the bundled Server or built-in compatibility Server.

Updating the Server never replaces DevTools credentials, approvals, write gates, or the STARLIMS backend SDP automatically.
