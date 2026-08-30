# starlims-lsp integration map / 集成映射

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

## 中文摘要

`starlims-lsp` 被视为可替换语言引擎。DevTools 只使用其公开 CLI/LSP 契约，并在结果进入 Monaco 前统一归一化。当前已启用原生诊断、Data Source 诊断、全文件格式化、签名导出；完整 stdio 工作区 LSP 仍不是主要传输。

Designer 无分号 `#include`、HTML Form 语言路由、虚拟 URI 以及写入门禁/内容指纹必须保留在 DevTools，不应移入或依赖上游二进制。升级必须在锁文件中固定 Tag、Commit、资产名称和 SHA-256，并通过兼容测试后才能切换。
