# starlimsvscode integration map / 集成映射

Source: https://github.com/MrDoe/starlimsvscode

This repository is a reference implementation, not a runtime dependency. It
does not publish versioned releases, so DevTools records the last reviewed
commit and selectively ports compatible behavior.

| Change category | Default action |
| --- | --- |
| SSL rules, built-ins, regression cases | Review and port data/tests |
| SCM API contracts and backend scripts | Manual STARLIMS compatibility review; retain `SCM_API` provenance |
| MCP tool schemas and risk metadata | Normalize in `tenlyc/starlims-mcp`, then consume by fixed tag |
| Checkout/check-in and language handling | Port behind DevTools services and write gates |
| VS Code commands, TreeView, Webview, activation | Do not copy; reimplement only when needed |
| Branding, settings, packaging | Ignore |

Copied or derived source must retain MIT attribution and record its source
commit. Whole-repository merges and direct imports from VS Code APIs are not
allowed. `scripts/upstreams/audit-starlimsvscode.mjs` classifies upstream
changes so reviewers can decide what should be ported. After the selected
changes and tests have been reviewed, advance the baseline with
`npm run upstream:accept:starlimsvscode -- <commit> --confirm-reviewed`.

## 中文摘要

本仓库仅作为参考实现，不是运行时依赖。SSL 规则、内置符号和回归案例可审查后移植；SCM API 契约与后端脚本必须进行 STARLIMS 兼容性审查；MCP Schema 与风险元数据先在 `tenlyc/starlims-mcp` 归一化。VS Code Command、TreeView、Webview、激活逻辑、品牌和打包配置不直接复制。

任何复制或派生源码必须保留 MIT 归属和完整来源提交。禁止整仓合并及直接导入 VS Code API。使用审计脚本生成分类报告，人工审查移植内容和测试后才能推进锁定基线。

Shared MCP contracts are a runtime dependency on `tenlyc/starlims-mcp`, not a
runtime dependency on this VS Code extension. Host-specific local-path behavior
uses the `vscode-compat` profile so it cannot silently change the DevTools
`uri + code + language` write contract.
