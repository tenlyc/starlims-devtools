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

### AI 助手 | AI Assistant

| 功能 | Feature | 说明 | Description |
|------|---------|------|-------------|
| 多模型支持 | Multi-model Support | MiniMax, Claude, OpenAI, DeepSeek, Kimi, Qwen, Gemini, Azure OpenAI, Spark, Hunyuan, Doubao | 支持多种 AI 模型提供商 |
| 提供商配置 | Provider Configuration | 每个提供商独立保存 API Key 和配置 | Each provider saves its own API Key and configuration |
| Base URL 自动填充 | Base URL Auto-fill | 根据选择的提供商自动填充默认地址 | Auto-fill default URL based on selected provider |
| API Key 显示/隐藏 | API Key Show/Hide | 可切换显示或隐藏 API Key | Toggle to show or hide API Key |

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
| `Ctrl+Shift+A` | Ctrl+Shift+A | 切换 AI 面板 / Toggle AI Panel |
| `F12` | F12 | 打开开发者工具 / Open Developer Tools |

## 技术栈 | Technology Stack

- **框架 | Framework**: Electron 28.x
- **前端 | Frontend**: React 18.x + TypeScript
- **编辑器 | Editor**: Monaco Editor
- **样式 | Styling**: Tailwind CSS
- **状态管理 | State Management**: Zustand
- **构建工具 | Build Tool**: Vite

## 快速开始 | Quick Start

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
│   │   ├── AIAssistant/ # AI 助手面板 / AI Assistant panel
│   │   └── SCM/         # 源码管理器 / Source Control Manager
│   ├── services/        # API 服务 / API services
│   ├── stores/          # Zustand 状态管理 / Zustand state stores
│   ├── ai/              # AI 模型提供程序 / AI model providers
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
