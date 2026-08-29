# STARLIMS DevTools

跨平台 STARLIMS 开发工具 - 一款提供高级 STARLIMS 开发能力的桌面应用程序，集成 Enterprise Designer 功能。

Cross-platform STARLIMS Development Tools - A desktop application providing advanced STARLIMS development capabilities with Enterprise Designer integration.

## 免责声明 | Disclaimer

> **警告 | Warning**: 这是一款非官方、不受支持的 STARLIMS 开发工具。使用风险自负。
> This is an unofficial, unsupported tool for STARLIMS development. Use at your own risk.

<img width="3822" height="2079" alt="image" src="https://github.com/user-attachments/assets/554a7c5c-64f2-42fe-ad77-91962f7085a4" />
<img width="3818" height="2003" alt="image" src="https://github.com/user-attachments/assets/59c7ef0c-3c72-4852-aa2e-6d5a7191310d" />



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

### STARLIMS MCP | AI Programming Integration

| 功能 | Feature | 说明 | Description |
|------|---------|------|-------------|
| 本地 MCP 服务 | Local MCP Server | `http://127.0.0.1:3002/mcp` | Streamable HTTP，仅监听本机回环地址 |
| AI 工具兼容 | AI Client Support | Codex、ChatGPT Desktop、Claude Code、Cursor、VS Code 等 | 客户端负责模型选择，DevTools 负责 STARLIMS 工具能力 |
| AI 编程闭环 | Agentic Workflow | 浏览、搜索、读取、签出、保存、检入、撤销签出、执行 | 复用 DevTools 当前登录的 STARLIMS 会话 |
| 安全提示 | Safety | 写入和执行工具标记为非只读 | 建议客户端将写工具审批模式设为 `writes` |

右侧 Agent Console 当前开放 Codex App Server 集成，启动时会自动注入当前 STARLIMS MCP endpoint。Codex 的回复、Reasoning、MCP 调用、命令、文件变更和审批会按发生顺序显示在统一时间线中，回复支持 Markdown/GFM 与代码块样式。Claude Code 与 OpenCode 的界面入口暂时隐藏，待后续完善后开放。可在签出列表或当前编辑器中右键选择“引用到 AI”，将完整脚本或编辑器选区作为 `@context` 附加到下一次提问。

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
npm run lint
npx tsc --noEmit
npm run test:ssl
npm run test:server-config
npm run test:ai-context
npm run test:agent-runtime
npm run test:mcp
npm run test:editor-languages
npm audit
npm run build
```

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
│   ├── ai/              # 旧 AI 提供商代码（不再由主界面加载）
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

### [1.6.0] - 2026-08-29

- Agent Console 集成 Codex App Server，支持持久会话、流式回复、停止、审批和 STARLIMS MCP 工具调用
- Reasoning、MCP、命令、文件变更与回复按事件顺序显示，Markdown/GFM 和代码块使用富文本样式
- Claude Code 与 OpenCode 的入口暂时隐藏，保留底层实现供后续开发
- 升级至 Electron 44、Vite 8 和 electron-builder 26，生产及完整依赖审计均无已知漏洞
- 引入 Cursor 风格三栏工作台、签出脚本详情、右键引用脚本和多语言 Monaco 高亮
- 同步 SSL 解析、诊断、格式化、导航、补全、参数提示、CodeLens 和快速修复能力

### [1.5.0] - 2026-08-29

- 增加 Cursor 风格工作台、Agent Console、脚本上下文引用和更清晰的签出列表

### [1.4.0] - 2026-08-29

- 增加服务器编辑与 URL 规范化，修复 STARLIMS 登录地址兼容问题

### [1.3.0] - 2026-08-29

- 增加 SSL 定义/引用/重命名、参数提示、CodeLens 和诊断快速修复

### [1.2.0] - 2026-08-29

- 迁移 SSL 解析器、139 个内置函数、实时诊断、格式化和编辑器语言能力

### [1.1.0] - 2026-08-29

- 使用本地 Streamable HTTP MCP 替换内置 AI 助手入口
- MCP 工具复用当前 STARLIMS 会话，支持 AI 编程读写闭环
- 同步 starlimsvscode 1.8.2 的 SCM_API 后端包
- MCP 服务仅绑定 `127.0.0.1`，写工具可由客户端单独审批

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
