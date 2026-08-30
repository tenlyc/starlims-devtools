# starlimsvscode 上游同步策略

**简体中文** · [English](UPSTREAM_SYNC.md)

当前基线：`MrDoe/starlimsvscode` commit `92b9014244eb09a56ed589db5155c3b7914b70a2`，版本 1.8.2，获取日期 2026-08-29。

机器可读基线记录在 `upstreams/upstreams.lock.json`，它是自动检查与构建的唯一事实来源；本文说明集成决策。

上游项目是 VS Code 扩展，而 STARLIMS DevTools 是 Electron/React 应用，因此不能直接合并整个仓库。更新按能力层选择性同步。共享 MCP Schema 和来源信息由独立版本化的 [`tenlyc/starlims-mcp`](https://github.com/tenlyc/starlims-mcp) 维护，并锁定在 `components/shared-components.lock.json`；它不会替代第三方上游基线。

## 已集成能力

- SCM API 1.8.2 服务端包及 `src/scm_api` 中的来源文件。
- 仅回环地址的 Streamable HTTP MCP、状态会话、健康检查、结构化工具结果和只读注解。
- 浏览、搜索、读取、签出、保存、检入、撤销签出、日志、脚本/数据源执行和表定义。
- Agent 先签出后保存、以远端 STARLIMS 内容为准的 Server 指令。
- 来自 `@tenlyc/starlims-mcp` 的工具目录、风险元数据、Profile 和 `get_capabilities` 握手。
- 显式语言的多语言 HTML/XFD Form Resources 读取与保存。

## 同步原则

- SSL 规则、内置符号和回归案例：审查后移植数据与测试。
- SCM API 契约和后端脚本：执行 STARLIMS 兼容性审查并保留来源。
- MCP Schema 与风险元数据：先在 `starlims-mcp` 归一化并发布固定版本，再由 DevTools 使用。
- 签出/检入与语言路由：必须经过 DevTools 服务层和统一写入门禁。
- VS Code Command、TreeView、Webview 和激活逻辑：不直接复制，仅在产品需要时重新实现。

复制或派生的源码必须保留 MIT 归属并记录完整来源提交。禁止整仓合并和直接依赖 VS Code API。

## 维护命令

```bash
# 检查公开上游元数据，不自动合并代码
npm run upstream:check

# 生成 starlimsvscode 选择性移植报告
npm run upstream:audit:starlimsvscode -- --output upstreams/reports/starlimsvscode.md

# 人工审查后推进参考提交
npm run upstream:accept:starlimsvscode -- <40位commit> --confirm-reviewed

# 下载、校验并测试指定 starlims-lsp Release
npm run upstream:update:lsp -- v0.22.0
```

## 安全边界

自动化只负责发现更新和生成报告，不会自动执行或合并上游代码。任何升级都必须固定 Tag/Commit 和 SHA-256，完成兼容性测试后才更新锁文件。MCP Server 与 LSP 支持并存版本、手动切换和失败回退；后端 `SCM_API.sdp` 仍需管理员在测试环境中独立验证和部署。

完整英文集成记录、版本历史和待处理差异见 [UPSTREAM_SYNC.md](UPSTREAM_SYNC.md)。
