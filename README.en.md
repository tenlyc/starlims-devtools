<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="src/assets/starlims-devtools-mark-white.svg">
    <source media="(prefers-color-scheme: light)" srcset="src/assets/starlims-devtools-mark-black.svg">
    <img src="src/assets/starlims-devtools-mark-black.svg" width="104" height="104" alt="STARLIMS DevTools icon">
  </picture>
</p>

<h1 align="center">STARLIMS DevTools</h1>

<p align="center"><a href="README.md">简体中文</a> · <strong>English</strong></p>

<p align="center">AI-native cross-platform development workbench for STARLIMS</p>

STARLIMS DevTools brings script editing, source control, form previews and AI assistance into one desktop workspace. Develop manually or ask an AI agent to find, modify and verify STARLIMS projects through MCP.

[Download Beta 6](https://github.com/tenlyc/starlims-devtools/releases/tag/v1.7.0-beta.6) · [Release notes](docs/releases/v1.7.0-beta.6.md) · [Documentation](docs/README.md) · [Report an issue](https://github.com/tenlyc/starlims-devtools/issues)

![STARLIMS DevTools workbench](docs/images/workbench-overview.png)

*The example interface uses fictional servers, accounts and scripts.*

## What can it do?

| Feature | Everyday use |
| --- | --- |
| Browse and search | Explore the enterprise tree, find items by name, search code and view checkouts. |
| Edit scripts | Work with SSL, SQL, JavaScript and XML using completion, formatting, diagnostics and navigation. |
| Source control | Check out, save, compare, check in, undo checkout, and import/export SDP packages. |
| Run and troubleshoot | Execute Server Scripts and Data Sources; inspect results, diagnostics and STARLIMS logs. |
| HTML Forms | Edit XML, Code Behind and multilingual resources; open Preview / Debug, inspect controls and capture screenshots. |
| AI assistance | Reference project context, ask AI to edit code, tables, resources and menus, then review changes. |

## Download and get started

The current test release is **1.7.0 Beta 6**, with macOS Apple Silicon and Windows x64 installers.

1. Download the appropriate installer and `SCM_API.sdp` from the [release page](https://github.com/tenlyc/starlims-devtools/releases/tag/v1.7.0-beta.6).
2. Deploy the matching SDP to STARLIMS, or reuse a compatible installation. The server must allow the required `SCM_API.*` HTTP endpoints.
3. Open DevTools, configure the server URL and account, sign in and open a project from the enterprise tree.
4. For AI assistance, open AI Capability Center and configure local Codex or an OpenAI-compatible service URL, API key and model.

Installers do not require a source build. AI services require their own account or API configuration.

Beta installers are unsigned. Windows CI builds passed, but real Windows STARLIMS host acceptance remains unverified. Start in a test environment.

## Work with AI

Use `@` to reference scripts, or attach screenshots. For example:

> Review this script and suggest fixes. Do not save changes yet.

> Create a test page based on the existing material-type page and verify its Chinese UI. Before adding a menu, ask me for the group, name, parameters and roles.

DevTools supports Codex and OpenAI-compatible agents, with conversation history, diffs and operation approvals. `Ask` / `Plan` modes are read-only; choose authorization appropriate to the task before writes or execution.

A successful save updates source code; verify the actual runtime page separately. Checking in a form affects its XML, Code Behind, Resources and related form content together.

[AI Capability Center example](docs/images/ai-capability-center.png)

## How DevTools uses starlims-mcp

**starlims-mcp maintains the MCP interfaces and SCM_API package. DevTools integrates them with its desktop tools and signed-in session.**

Beta 6 pins [starlims-mcp v0.5.2](https://github.com/tenlyc/starlims-mcp/releases/tag/v0.5.2), providing **37 MCP tools** through DevTools for code, tables, resources, menus and previews. A separate MCP installation is normally unnecessary.

Other HTTP MCP clients can connect to:

```text
http://127.0.0.1:3102/mcp
```

Keep DevTools running and signed in. Ask the AI to call `get_capabilities` to list tools available on the current connection.

To run MCP without DevTools, see the [standalone guide](https://github.com/tenlyc/starlims-mcp#readme). Standalone mode currently implements a subset of the desktop capabilities.

## Develop from source

Node.js 22.12 or later and Git are needed only to modify or build DevTools yourself.

```bash
git clone https://github.com/tenlyc/starlims-devtools.git
cd starlims-devtools
npm ci
npm run dev
```

```bash
npm run check               # Code checks, build and regression tests
npm run release:beta:check   # Beta release checks
npm run build               # Current-platform installers in release/
```

Maintain MCP contracts and server sources in [starlims-mcp](https://github.com/tenlyc/starlims-mcp). DevTools `src/scm_api` is a compatibility mirror synchronized from that package. See the [documentation index](docs/README.md) for architecture and maintenance details.

## Documentation and feedback

- [Current release notes](docs/releases/v1.7.0-beta.6.md) and [changelog](CHANGELOG.md)
- [Multilingual form resources](docs/FORM_RESOURCES.md)
- [Menu integration](docs/MENU_MCP_RESEARCH.md)
- [AI material-type page acceptance](docs/MATERIAL_TYPES_AGENT_ACCEPTANCE.md)
- [Shared MCP integration acceptance](docs/MCP_CENTRALIZATION_ACCEPTANCE.md)
- [Contributing](CONTRIBUTING.md) and [packaging](PACKAGING.md)

When filing an [issue](https://github.com/tenlyc/starlims-devtools/issues), include the version, reproduction steps and errors. Remove credentials and sensitive business content.

## Credits and license

This is an unofficial community tool, not affiliated with or supported by STARLIMS Corporation. It is licensed under [MIT](LICENSE).

Language services use [starlims-lsp](https://github.com/mahoskye/starlims-lsp); MCP uses [starlims-mcp](https://github.com/tenlyc/starlims-mcp). Some STARLIMS compatibility behavior references [starlimsvscode](https://github.com/MrDoe/starlimsvscode).
