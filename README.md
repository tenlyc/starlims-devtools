<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="src/assets/starlims-devtools-mark-white.svg">
    <source media="(prefers-color-scheme: light)" srcset="src/assets/starlims-devtools-mark-black.svg">
    <img src="src/assets/starlims-devtools-mark-black.svg" width="104" height="104" alt="STARLIMS DevTools 图标">
  </picture>
</p>

<h1 align="center">STARLIMS DevTools</h1>

<p align="center"><strong>简体中文</strong> · <a href="README.en.md">English</a></p>

<p align="center">
  面向 STARLIMS 的 AI 原生跨平台开发工作台<br>
  <sub>AI-native cross-platform development workbench for STARLIMS</sub>
</p>

STARLIMS DevTools 是一个桌面开发工具，把脚本编辑、源码管理、表单预览和 AI 助手放在同一个工作台中。你可以手动开发，也可以让 AI 通过 MCP 查找、修改和验证 STARLIMS 项目。

[下载 Beta 6](https://github.com/tenlyc/starlims-devtools/releases/tag/v1.7.0-beta.6) · [版本说明](docs/releases/v1.7.0-beta.6.md) · [使用与开发文档](docs/README.md) · [反馈问题](https://github.com/tenlyc/starlims-devtools/issues)

![STARLIMS DevTools 工作台](docs/images/workbench-overview.png)

*界面示例使用虚构服务器、账号和脚本。*

## 能做什么？

| 功能 | 日常用途 |
| --- | --- |
| 项目浏览与搜索 | 浏览企业树，按名称查找项目，搜索脚本内容，查看已签出项。 |
| 脚本编辑 | 编辑 SSL、SQL、JavaScript、XML 等内容，使用补全、格式化、诊断和跨脚本导航。 |
| 源码管理 | 签出、保存、比较、签入、撤销签出，以及 SDP 导入和导出。 |
| 运行与排错 | 执行 Server Script 和 Data Source，查看结果、问题面板和 STARLIMS 日志。 |
| HTML 表单 | 编辑 XML、Code Behind 和多语言资源，打开 Preview / Debug，检查控件与截图。 |
| AI 辅助开发 | 引用项目上下文，让 AI 编写代码、维护表定义和资源、配置菜单，再审查变更。 |

## 下载与开始使用

当前测试版为 **1.7.0 Beta 6**，提供 macOS Apple Silicon 和 Windows x64 安装包。

1. 从 [Release 页面](https://github.com/tenlyc/starlims-devtools/releases/tag/v1.7.0-beta.6) 下载对应安装包和 `SCM_API.sdp`。
2. 在 STARLIMS 环境中部署配套 `SCM_API.sdp`。已有兼容版本可以复用；服务端需允许访问所需的 `SCM_API.*` HTTP 接口。
3. 打开 DevTools，添加服务器地址和账号，登录后从企业树打开项目。
4. 需要 AI 时，进入“AI 能力中心”，配置本机 Codex，或填写兼容 OpenAI API 的服务地址、API Key 和模型。

使用安装包无需自行编译；Node.js 与源码构建步骤见下方开发说明。AI 服务需要相应账号或 API 配置。

测试包尚未签名。Windows 已通过 CI 构建，真实 Windows STARLIMS 环境尚未完成实机验收；建议先在测试环境使用。

## 如何使用 AI？

在对话中使用 `@` 引用脚本，也可以附上截图，让 AI 结合当前项目处理任务。例如：

> 检查当前脚本，说明问题并提出修改建议，先不要保存。

> 参考现有材料类型页面创建一个测试页面，完成后验证中文显示。添加菜单前，先向我确认分组、名称、参数和角色。

DevTools 支持 Codex 和兼容 OpenAI API 的通用 Agent，提供会话记录、变更对比和操作审批。`Ask` / `Plan` 模式限制为只读；写入或执行时按任务需要选择授权方式。

保存成功只表示源码已更新。页面是否正常，还需要验证实际运行界面；表单签入会涉及同一表单的 XML、Code Behind、Resources 等内容。

[查看 AI 能力中心界面示例](docs/images/ai-capability-center.png)

## DevTools 和 starlims-mcp 的关系

**starlims-mcp 统一维护 MCP 接口与 SCM_API 服务包，DevTools 集成它们并提供桌面操作和登录会话。**

Beta 6 固定使用 [starlims-mcp v0.5.2](https://github.com/tenlyc/starlims-mcp/releases/tag/v0.5.2)，通过 DevTools 提供 **37 个 MCP 工具**，涵盖代码、表定义、资源、菜单与预览。通常不需要再单独安装 MCP 服务。

其他支持 HTTP MCP 的 AI 应用也可以连接：

```text
http://127.0.0.1:3102/mcp
```

连接时保持 DevTools 运行并登录 STARLIMS。可让 AI 调用 `get_capabilities` 查询当前可用工具。

想不打开 DevTools、单独运行 MCP，可查看 [starlims-mcp 使用说明](https://github.com/tenlyc/starlims-mcp#readme)。独立运行目前仅提供部分能力。

## 从源码开发

仅在修改或自行构建 DevTools 时需要 Node.js 22.12 或更新版本和 Git。

```bash
git clone https://github.com/tenlyc/starlims-devtools.git
cd starlims-devtools
npm ci
npm run dev
```

```bash
npm run check               # 代码检查、构建和回归测试
npm run release:beta:check   # 测试版发布检查
npm run build               # 生成当前平台安装包，输出到 release/
```

MCP 接口和后端源码请在 [starlims-mcp](https://github.com/tenlyc/starlims-mcp) 中维护。DevTools 的 `src/scm_api` 是从共享包同步的兼容镜像。架构与维护细节见 [文档目录](docs/README.md)。

## 文档与反馈

- [当前版本说明](docs/releases/v1.7.0-beta.6.md)与[历史变更](CHANGELOG.md)
- [多语言资源与中文页面](docs/FORM_RESOURCES.md)
- [菜单配置接口](docs/MENU_MCP_RESEARCH.md)
- [AI 开发材料类型页面的实测记录](docs/MATERIAL_TYPES_AGENT_ACCEPTANCE.md)
- [MCP 集中管理与验收](docs/MCP_CENTRALIZATION_ACCEPTANCE.md)
- [贡献指南](CONTRIBUTING.md)与[打包发布](PACKAGING.md)

提交 [Issue](https://github.com/tenlyc/starlims-devtools/issues) 时，请注明版本、复现步骤和错误信息，并移除凭据及业务敏感内容。

## 来源与许可

本项目为非官方社区工具，与 STARLIMS Corporation 无隶属或支持关系，采用 [MIT License](LICENSE)。

语言服务使用 [starlims-lsp](https://github.com/mahoskye/starlims-lsp)，MCP 使用 [starlims-mcp](https://github.com/tenlyc/starlims-mcp)，部分 STARLIMS 兼容实现参考 [starlimsvscode](https://github.com/MrDoe/starlimsvscode)。
