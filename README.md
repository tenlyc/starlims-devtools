# STARLIMS DevTools

跨平台 STARLIMS 开发工具 - 一款提供高级 STARLIMS 开发能力的桌面应用程序，集成 Enterprise Designer 功能。

Cross-platform STARLIMS Development Tools - A desktop application providing advanced STARLIMS development capabilities with Enterprise Designer integration.

## 免责声明 | Disclaimer

> **警告 | Warning**: 这是一款非官方、不受支持的 STARLIMS 开发工具。使用风险自负。
> This is an unofficial, unsupported tool for STARLIMS development. Use at your own risk.

<img width="3822" height="2079" alt="image" src="https://github.com/user-attachments/assets/554a7c5c-64f2-42fe-ad77-91962f7085a4" />
<img width="3818" height="1994" alt="image" src="https://github.com/user-attachments/assets/124fa94e-54a8-4088-9ed2-697b952825ae" />




## 简介 | Overview

STARLIMS DevTools 是一款基于 Electron 开发的跨平台桌面应用程序，提供增强的 STARLIMS 开发能力。本工具基于 [MrDoe/starlimsvscode](https://github.com/MrDoe/starlimsvscode) 进行二次开发，并扩展为独立的桌面应用体验。

STARLIMS DevTools is a cross-platform desktop application built on Electron that provides enhanced STARLIMS development capabilities. It is a fork of [MrDoe/starlimsvscode](https://github.com/MrDoe/starlimsvscode) and extends the functionality with a dedicated desktop application experience.

## 功能 | Features

### 核心功能 | Core Features

| 功能 | Feature | 说明 | Description |
|------|---------|------|-------------|
| 企业树浏览器 | Enterprise Tree Browser | 浏览 STARLIMS 项目（应用程序、数据源、服务器脚本、客户端脚本、表单）| Explore STARLIMS items (Applications, Data Sources, Server Scripts, Client Scripts, Forms) |
| 代码编辑器 | Code Editor | 内置 Monaco 编辑器，支持 SSL/CS/DS/SQL/XML/HTML 语法高亮 | Built-in Monaco editor with syntax highlighting for SSL, CS, DS, SQL, XML, HTML |
| SSL 语言服务 | SSL Language Service | 诊断/快速修复、格式化、定义/引用/重命名、参数提示、补全、符号和折叠 | Parser-backed SSL diagnostics, navigation and editor intelligence |
| 检出/检入 | Check Out/In | 直接在应用中管理代码项的检出和检入 | Manage code item checkouts and checkins directly |
| 导航跳转 | Go To Navigation | 使用 F11 快速跳转到项目定义 | Navigate to item definitions quickly with F11 |
| 全局代码搜索 | Global Code Search | 使用 Ctrl+Alt+F 在所有代码项中进行全文搜索 | Full-text search across all code items with Ctrl+Alt+F |
| 脚本执行 | Script Execution | 直接在应用中运行服务器脚本和数据源 | Run server scripts and data sources directly |
| 表单调试 | Form Debugging | 在系统浏览器中打开和调试 HTML 表单 | Open and debug HTML forms in the system browser |
| 源码管理 | Source Control Manager | 导出和导入 SDP 包用于跨环境部署 | Export and import SDP packages for deployment across environments |
| 多语言表单 | Multilingual Forms | HTML Form 按签出语言显示、编辑与导出 XML/Guide/Resources | Display, edit and export form documents by checked-out language |
| 问题与日志 | Problems & Logs | 底部统一展示 SSL 诊断、输出、STARLIMS 日志与分级过滤 | Unified SSL diagnostics, output and categorized STARLIMS logs |
| 跨平台桌面体验 | Cross-platform Desktop UX | Cursor 风格工作台、明暗主题、响应式面板与统一品牌图标 | Cursor-inspired workspace, light/dark themes, responsive panels and unified branding |

### 代码编辑器高级功能 | Code Editor Advanced Features

| 功能 | Feature | 快捷键 | Shortcut | 说明 | Description |
|------|---------|--------|----------|------|-------------|
| 多标签编辑 | Multi-tab Editing | - | - | 同时编辑多个文件 | Edit multiple files simultaneously |
| 代码折叠 | Code Folding | - | - | 支持折叠代码块 | Collapse and expand code blocks |
| 括号匹配高亮 | Bracket Matching | - | - | 高亮显示匹配的括号 | Highlight matching brackets |
| 面包屑导航 | Breadcrumb Navigation | - | - | 显示当前文件路径 | Show current file path |
| 大纲视图 | Outline View | Ctrl+Shift+O | Ctrl+Shift+O | 导航到文件中的符号 | Navigate to symbols in file |
| 多光标编辑 | Multi-cursor | Ctrl+Click | Ctrl+Click | 多个光标同时编辑 | Edit with multiple cursors |
| 选择匹配 | Select Matches | Ctrl+F2 | Ctrl+F2 | 选中文本的所有匹配项 | Select all matches of text |
| 注释切换 | Toggle Comment | Ctrl+/ | Ctrl+/ | 快速注释/取消注释代码 | Quick comment/uncomment code |
| 跳转到行 | Go to Line | Ctrl+G | Ctrl+G | 跳转到指定行号 | Jump to specific line number |
| 悬停信息 | Hover Info | - | - | 鼠标悬停显示信息 | Show information on hover |
| 参数提示 | Parameter Hints | - | - | 显示函数参数提示 | Show function parameter hints |
| 增大字体 | Increase Font | - | - | 增大编辑器字体 | Increase editor font size |
| 减小字体 | Decrease Font | - | - | 减小编辑器字体 | Decrease editor font size |
| 显示行号 | Toggle Line Numbers | - | - | 显示/隐藏行号 | Show/hide line numbers |
| 自动换行 | Toggle Word Wrap | - | - | 启用/禁用自动换行 | Enable/disable word wrap |
| 显示空白 | Toggle Whitespace | - | - | 显示/隐藏空白字符 | Show/hide whitespace characters |
| 小地图 | Toggle Minimap | - | - | 显示/隐藏代码小地图 | Show/hide code minimap |
| 右键菜单 | Tab Context Menu | Right-click | Right-click | 关闭/关闭其他/关闭已保存/关闭全部 | Close/Close Others/Close Saved/Close All |
| 路径提示 | Path Tooltip | Hover | Hover | 鼠标悬停显示完整路径 | Show full path on hover |

SSL 文件会在输入后约 250ms 自动执行语法解析和风格检查。使用编辑器的“格式化文档”或 `Shift+Alt+F` 可运行上游 SSL 格式化器，包括内嵌 SQL 字符串格式化。编辑器同时支持局部符号定义/引用、重命名、文档高亮、参数内联提示、引用数量 CodeLens，以及针对风格诊断的快速修复和规则抑制操作。

### AI Agent 与 STARLIMS MCP | AI Agent & STARLIMS MCP

| 功能 | Feature | 说明 | Description |
|------|---------|------|-------------|
| 本地 MCP 服务 | Local MCP Server | `http://127.0.0.1:3102/mcp` | Streamable HTTP，仅监听本机回环地址；避开 starlimsvscode MCP 的 3002 和表单回调端口 3003–3099 |
| Codex Agent | Codex Agent | Codex App Server 持久会话、流式回复、审批、停止与历史记录 | Persistent Codex App Server sessions with streaming, approvals, interruption and history |
| 通用 Agent | Generic Agent | 配置多个 OpenAI-compatible 平台、API Key 与模型列表 | Configure multiple OpenAI-compatible providers, API keys and model lists |
| 对话模式 | Conversation Modes | Agent、Plan、Debug、Multitask、Ask | Select a task-oriented conversation mode before sending |
| 上下文引用 | Context References | 使用 `@` 引用已打开、签出或搜索到的 STARLIMS 脚本 | Attach open, checked-out or searched STARLIMS scripts with `@` |
| 对话记录 | Conversation History | Codex 与通用 Agent 独立保存和恢复会话记录 | Separate persisted histories for Codex and Generic Agent |
| 自定义规则 | Custom Rules | 导入或粘贴 Markdown 规则，约束当前用户的 AI 行为 | Import or paste Markdown rules for the current user's AI behavior |
| 通用 MCP 配置 | External MCP Configuration | 在 Customize 中管理 HTTP、SSE、stdio MCP 服务 | Manage HTTP, SSE and stdio MCP servers from Customize |
| AI 工具兼容 | AI Client Support | Codex、ChatGPT Desktop、Claude Code、Cursor、VS Code 等 | External clients can reuse the built-in STARLIMS tool service |
| AI 编程闭环 | Agentic Workflow | 浏览、搜索、读取、签出、保存、检入、撤销签出、执行 | 复用 DevTools 当前登录的 STARLIMS 会话 |
| 工具权限 | Tool Permissions | Plan/Ask 强制只读；其他模式的写入、执行及未知外部 MCP 工具逐次确认 | Plan/Ask are enforced read-only; write, execution and unknown external MCP tools require confirmation |
| Agent 工作区 | Agent Workspace | 按服务器和用户建立稳定的本地 Git 工作区，自动镜像编辑器中打开的脚本 | Stable per-server/user Git workspace with automatic mirrors of open scripts |
| Token 预算 | Token Budget | 对规则、历史和脚本引用分配上下文预算并标记截断 | Budget rules, history and references with explicit truncation markers |

右侧 Agent Console 同时提供 Codex 与通用 Agent。Codex 启动时自动注入当前 STARLIMS MCP endpoint；通用 Agent 可保存多个服务平台及其模型列表，并将 API Key 单独存入本机密钥存储。回复、Reasoning、MCP 调用、命令、文件变更和审批按发生顺序显示在统一时间线中，支持 Markdown/GFM、代码块、脚本附件、模型选择和对话历史。可在签出列表或当前编辑器中右键选择“引用到 AI”，也可直接输入 `@` 搜索脚本并附加完整源码或编辑器选区。

Customize 页面用于集中维护用户规则和外部 MCP。规则可以从本地 Markdown 文件导入或直接粘贴；外部 MCP 支持 HTTP、SSE 与跨平台 stdio 配置，并与内置 STARLIMS MCP 分开管理。

HTML Form 的语言会贯穿读取、签出、保存、检入与 MCP 调用，不再由文件类型代替。Agent 会在应用数据目录下按服务器和用户维护独立 Git 工作区，并把编辑器中打开的脚本镜像到 `items/`，供文件搜索、批量分析、修改和测试使用；远端 STARLIMS 状态仍以 MCP 为准。行内补全直接复用当前通用 Agent 平台、模型和本机密钥，不再维护旧 AI 面板与第二套模型配置。

### 键盘快捷键 | Keyboard Shortcuts

| 快捷键 | Shortcut | 功能 | Action |
|--------|----------|------|--------|
| `F5` | F5 | 刷新企业树 / Refresh Enterprise Tree |
| `F11` | F11 | 跳转到项目 / Go To Item |
| `Ctrl+/` | Ctrl+/ | 注释/取消注释 / Toggle Comment |
| `Ctrl+F` | Ctrl+F | 当前文件搜索 / Search in Current File |
| `Ctrl+F2` | Ctrl+F2 | 选择所有匹配 / Select All Matches |
| `Ctrl+G` | Ctrl+G | 跳转到行 / Go to Line |
| `Ctrl+Alt+F` | Ctrl+Alt+F | 全局代码搜索 / Global Code Search |
| `Ctrl+Shift+O` | Ctrl+Shift+O | 跳转到符号 / Go to Symbol |
| `Ctrl+S` | Ctrl+S | 保存当前文件 / Save Current File |
| `Ctrl+B` | Ctrl+B | 切换侧边栏 / Toggle Sidebar |
| `Ctrl+Shift+A` | Ctrl+Shift+A | 切换 MCP 面板 / Toggle MCP Panel |
| `F12` | F12 | 打开开发者工具 / Open Developer Tools |

## 技术栈 | Technology Stack

- **框架 | Framework**: Electron 44.x
- **前端 | Frontend**: React 18.x + TypeScript
- **编辑器 | Editor**: Monaco Editor
- **样式 | Styling**: Tailwind CSS
- **状态管理 | State Management**: Zustand
- **构建工具 | Build Tool**: Vite 8.x

## 快速开始 | Quick Start

建议使用 Node.js 22.12 或更高版本。
Node.js 22.12 or later is recommended.

### 安装依赖 | Install Dependencies

```bash
npm install
```

### 启动开发服务器 | Start Development Server

```bash
npm run dev
```

### 构建生产版本 | Build for Production

```bash
npm run build
```

### 发布前检查 | Pre-release Checks

```bash
npm run check
npm audit --registry=https://registry.npmjs.org
npm run build
```

`npm run check` 会统一执行 ESLint、11 组 smoke tests、TypeScript 检查，以及 Renderer/Electron 构建。GitHub Actions 会在 `main` 推送和 Pull Request 时执行相同检查。

## 前置条件 | Pre-requisites

- 下载 STARLIMS .sdp 包（如果 STARLIMS 版本需要）
- Download STARLIMS .sdp package (if required for your STARLIMS version)
- 如需要使用 API 功能，在 STARLIMS web.config 中添加以下配置：
- Add the following setting to STARLIMS web.config file (if using API features):

```xml
<add key="HTTPServices" value="SCM_API.*"/>
```

## 项目结构 | Project Structure

```
starlims-devtools/
├── electron/           # Electron 主进程代码 / Electron main process code
├── src/
│   ├── components/      # React 组件 / React components
│   │   ├── Editor/     # 代码编辑器组件 / Code editor components
│   │   ├── Sidebar/     # 企业树和侧边栏 / Enterprise tree and sidebar
│   │   ├── MCP/        # MCP 状态面板与 IPC 工具桥接
│   │   └── SCM/         # 源码管理器 / Source Control Manager
│   ├── services/        # API 服务 / API services
│   ├── stores/          # Zustand 状态管理 / Zustand state stores
│   └── types/           # TypeScript 类型定义 / TypeScript type definitions
├── resources/           # 应用资源（图标、图片）/ App resources (icons, images)
├── dist/                # 构建的前端代码 / Built frontend
├── dist-electron/       # 构建的 Electron 代码 / Built Electron code
└── release/             # 打包的应用程序 / Packaged applications
```

## 贡献 | Contributing

欢迎提交 Issue 和 Pull Request！
Contributions are welcome! Please open an Issue or Pull Request on GitHub!

项目地址 | Project URL: https://github.com/tenlyc/starlims-devtools

## 已知问题 | Known Issues

- 部分 STARLIMS 服务器端功能可能需要特定版本的 STARLIMS
- Some STARLIMS server-side features may require specific STARLIMS versions

## 版本历史 | Release Notes

### [1.6.2] - 2026-08-30

- 完成 Cursor 风格三栏工作台、响应式布局、统一明暗主题和 STARLIMS AI 品牌图标
- 集成 Codex App Server 持久会话，以及支持多平台、多 API Key、多模型和工具轮次设置的通用 Agent
- 增加 Agent/Plan/Debug/Multitask/Ask 模式、`@` 脚本引用、文件附件、会话历史、自定义 Markdown 规则和外部 MCP 管理
- 内置本地 Streamable HTTP STARLIMS MCP，复用当前登录会话完成浏览、搜索、读取、签出、保存、检入、日志和执行操作
- 增加底部 Problems/Output/STARLIMS Log 面板、日志用户筛选与信息/警告/错误分类
- 签出树显示 HTML Form 的 XML、Code Behind、Guide、Resources、签出语言和签出用户，并保持固定文件顺序
- 完成 SCM 查询、SDP 导入导出、多语言表单导出和源码管理界面的统一主题
- 同步 SSL 解析器、139 个内置函数、实时诊断、格式化、导航、补全、参数提示、CodeLens 和快速修复
- 增加服务器编辑、URL 规范化、安全密码存储、退出登录和跨平台 Codex/MCP 运行环境探测
- 升级至 Electron 44、Vite 8 和 electron-builder 26

### [1.0.0] - 2026-04-12

- 初始版本发布 | Initial release
- 基于 starlimsvscode 功能 | Based on starlimsvscode functionality
- 跨平台 Electron 桌面应用程序 | Cross-platform Electron desktop application
- 企业树浏览器 | Enterprise Tree Browser
- Monaco 多标签代码编辑器 | Monaco multi-tab code editor
- 代码折叠和括号匹配高亮 | Code folding and bracket matching highlight
- AI 助手面板（支持多种模型）| AI Assistant panel (multiple model support)
- 每提供商独立 API Key 配置 | Per-provider API Key configuration
- 源码管理器（导出/导入 SDP 包）| Source Control Manager (Export/Import SDP packages)
- 跳转到定义（F11）| Go To Navigation (F11)
- 全局代码搜索（Ctrl+Alt+F）| Global Code Search (Ctrl+Alt+F)
- HTML 表单调试 | HTML Form Debugging
