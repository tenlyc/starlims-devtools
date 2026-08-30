# STARLIMS MCP 架构与来源边界

STARLIMS DevTools 使用 [`tenlyc/starlims-mcp`](https://github.com/tenlyc/starlims-mcp)
作为共享 MCP 契约和宿主无关运行时。DevTools 保留 Electron HTTP 传输、当前登录会话、
权限审批、写入门禁和 Renderer IPC 适配器，不直接依赖 VS Code API。

## 仓库职责

| 仓库 | 职责 | 不负责 |
| --- | --- | --- |
| `MrDoe/starlimsvscode` | 上游 `SCM_API`、VS Code 扩展实现和兼容行为参考 | DevTools 产品运行时 |
| `tenlyc/starlims-mcp` | MCP 工具契约、来源/风险元数据、Profile、能力握手、公共后端扩展，以及经过校验的 MCP/SCM 历史快照 | 登录凭据、服务器选择和产品 UI |
| `tenlyc/starlims-devtools` | Electron/React 产品、Agent、工作区、审批和质量门禁 | 覆盖上游 `SCM_API` |

## 工具来源

共享核心为每个工具公开 `origin`：

- `shared`：两个宿主应采用的统一契约，例如 `get_item_code`、`checkout_item` 和
  `save_item(uri, code, language, expectedVersion?)`。
- 多语言表单资源使用共享的 `get_form_resources`、`set_form_resource` 和
  `save_form_resources` 契约；`language` 必填，写入带版本冲突和保存后回读校验。
- `starlimsvscode`：上游宿主专属能力；本地路径保存使用独立名称
  `vscode_save_local_item`，避免与统一 `save_item` 参数冲突。
- `starlims-devtools`：DevTools 专属能力，例如 `list_checked_out_items` 和
  `query_checkin_history`。
- `starlims-mcp`：未来由共享仓库独立发展的公共工具。

客户端连接后先调用 `get_capabilities`，以获得实际注册的工具、来源、风险、Schema
版本、Adapter 能力和后端组件版本。不要根据产品名称猜测能力。

## 离线归档与复用

`starlims-mcp` 的 `vendor/` 目录保存经过人工审查、固定到完整 Git 提交的
`starlimsvscode` 与 `starlims-devtools` MCP/SCM 实际文件。每个快照包含来源、许可、
文件清单、逐文件 SHA-256 和整体摘要，不使用 Git Submodule 或 Git LFS 外部指针。

因此，上游仓库删除、转私有或暂时不可访问时，已归档版本仍可恢复、审计并供其他
STARLIMS 工具复用。Vendor 快照保持不可变；新能力进入共享契约或对应产品仓库，
再以新提交导入一个新快照，不能直接修改旧快照。

## SCM 命名空间

- `SCM_API.*`：来自 `MrDoe/starlimsvscode`。以提交、许可和兼容测试锁定，只通过人工
  审查同步，不在 DevTools 或共享仓库直接改名覆盖。
- `STARLIMS_MCP_API.*`：多个宿主都需要的新后端能力，放在 `starlims-mcp`。
- `STARLIMS_DEVTOOLS_API.*`：仅服务 DevTools UI、Agent 工作区或质量门禁，继续放在
  DevTools。

新能力先判断是否需要 STARLIMS 后端脚本。纯契约或客户端编排优先加入共享核心；只有
跨宿主都需要的后端逻辑才进入 `STARLIMS_MCP_API`。

## 更新流程

1. `npm run upstream:check` 发现 `starlimsvscode` 更新。
2. 生成审计报告，按能力审查 `SCM_API`、MCP 契约和 VS Code UI 变化。
3. 将审查通过的来源提交导入 `starlims-mcp/vendor`，校验逐文件摘要；同时更新契约、
   来源映射、兼容 Profile 和契约测试，再发布不可变标签。
4. DevTools 更新固定 Git 标签依赖和 `components/shared-components.lock.json`。
5. 运行 MCP、Agent 工具、写入门禁及完整 smoke tests；通过后才推进上游基线。

这样既能持续吸收上游更新，也不会把 VS Code 实现细节或上游 SCM 修改与 DevTools
自有能力混在一起。
