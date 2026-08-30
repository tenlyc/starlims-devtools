# STARLIMS MCP 架构与来源边界

**简体中文** · [English](MCP_ARCHITECTURE.en.md)

STARLIMS DevTools 使用 [`tenlyc/starlims-mcp`](https://github.com/tenlyc/starlims-mcp)
作为共享 MCP 契约和宿主无关运行时。DevTools 自动启动该共享包构建出的独立 HTTP
Server 子进程；Electron 主进程保留当前登录会话、权限审批、写入门禁和 Renderer IPC
适配器，不直接依赖 VS Code API。

独立 Server 与产品权限层之间使用仅监听回环地址、带随机 Bearer Token 的内部桥接。
STARLIMS 密码不会传入子进程。共享进程启动或健康检查失败时，DevTools 自动启用内置
兼容 Server，保证 Codex 和通用 Agent 仍可使用；应用退出时同时关闭子进程与桥接端口。

## 仓库职责

| 仓库 | 职责 | 不负责 |
| --- | --- | --- |
| `MrDoe/starlimsvscode` | 上游 `SCM_API`、VS Code 扩展实现和兼容行为参考 | DevTools 产品运行时 |
| `tenlyc/starlims-mcp` | MCP 工具契约、来源/风险元数据、Profile、能力握手、公共后端扩展，以及经过校验的 MCP/SCM 历史快照 | 登录凭据、服务器选择和产品 UI |
| `tenlyc/starlims-devtools` | Electron/React 产品、Agent、工作区、审批和质量门禁 | 覆盖上游 `SCM_API` |

## 工具来源

共享核心为每个工具公开代码归属 `origin`，值只保留两类：

- `starlimsvscode`：来自或派生自上游的基础能力，例如 `get_item_code`、`checkout_item`
  和 `save_item(uri, code, language, expectedVersion?)`。
- 多语言表单资源使用共享的 `get_form_resources`、`set_form_resource` 和
  `save_form_resources` 契约；`language` 必填，写入带版本冲突和保存后回读校验。
- 上游宿主专属能力仍归属 `starlimsvscode`；本地路径保存使用独立名称
  `vscode_save_local_item`，避免与统一 `save_item` 参数冲突。
- `starlims-mcp`：所有自有能力，包括最初在 DevTools 中实现的
  `list_checked_out_items` 和 `query_checkin_history`。

工具能否在某个宿主运行由 `profiles` 和 Adapter capabilities 单独表达。DevTools 是
`devtools` Profile/Adapter，不是第三种来源。

客户端连接后先调用 `get_capabilities`，以获得实际注册的工具、来源、风险、Schema
版本、Adapter 能力和后端组件版本。不要根据产品名称猜测能力。

## 离线归档与复用

`starlims-mcp` 的 `vendor/` 目录保存经过人工审查、固定到完整 Git 提交的
`starlimsvscode` 与 `starlims-devtools` MCP/SCM 实际文件。每个快照包含来源、许可、
文件清单、逐文件 SHA-256 和整体摘要，不使用 Git Submodule 或 Git LFS 外部指针。

因此，上游仓库删除、转私有或暂时不可访问时，已归档版本仍可恢复、审计并供其他
STARLIMS 工具复用。Vendor 快照保持不可变；新能力进入共享契约或对应产品仓库，
再以新提交导入一个新快照，不能直接修改旧快照。

## 单一 SCM_API 部署包

- STARLIMS 侧只部署 `SCM_API.*` 命名空间和一个 `SCM_API.sdp`。
- 上游脚本保持原名称；自有扩展使用 `Mcp*` 前缀避免与后续上游新增脚本冲突。
- `npm run build:scm-api` 从 `src/scm_api` 构建合并包，同时更新应用内资源和
  `release/SCM_API.sdp`。
- 当前自有脚本为 `McpGetSCMUsers`、`McpGetCheckInHistory`、`McpExportPackage` 和
  `McpImportPackage`，代码归属 `tenlyc/starlims-mcp`，宿主实现仍在 DevTools Adapter。

来源通过 MCP `origin`/`provenance`、锁文件和审计文档区分，而不是通过多个 SDP
区分。新增后端接口时使用 `Mcp*` 名称、更新同一个 manifest/content，并重新构建
`SCM_API.sdp`。

## 更新流程

1. `npm run upstream:check` 发现 `starlimsvscode` 更新。
2. 生成审计报告，按能力审查 `SCM_API`、MCP 契约和 VS Code UI 变化。
3. 将审查通过的来源提交导入 `starlims-mcp/vendor`，校验逐文件摘要；同时更新契约、
   来源映射、兼容 Profile 和契约测试，再发布不可变标签。
4. DevTools 更新固定 Git 标签依赖和 `components/shared-components.lock.json`，并把共享
   Server CLI 打包成独立子进程入口。
5. 运行 MCP、Agent 工具、写入门禁及完整 smoke tests；通过后才推进上游基线。

这样既能持续吸收上游更新，也能只向 STARLIMS 管理员交付一个包，同时通过元数据清楚
区分上游与自有能力。

## 运行时 Server 更新

AI 能力中心的 MCP 页面只展示当前 DevTools Adapter 实际支持的接口，并同时显示工具
风险、Capability 和来源；共享契约中尚未由当前宿主实现的接口不会被误标为可用。

“上游组件”页面可检查 `tenlyc/starlims-mcp` 官方 GitHub Release，并由用户手动安装
独立 Server。Release 必须同时提供 `starlims-mcp-devtools-server.cjs` 与对应
`.sha256` 文件。程序在执行远程 JavaScript 前验证 SHA-256，按版本写入本机缓存，校验
失败时拒绝安装；缓存文件被篡改、所选 Server 无法启动或健康检查失败时，自动退回随
程序提供的版本或内置兼容 Server。更新 Server 不会替换 DevTools 的登录、审批和写入
门禁，也不会自动更新 STARLIMS 后端 SDP。
