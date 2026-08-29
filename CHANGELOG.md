# Changelog | 更新日志

所有重要的 STARLIMS DevTools 更改都将记录在此文件中。
All notable changes to "STARLIMS DevTools" will be documented in this file.

格式基于 [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)，本项目遵循 [语义化版本](https://semver.org/spec/v2.0.0.html)。
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] | 未发布

### Changed | 变更

- AI Agent Console 暂时只展示 Codex，隐藏尚待完善的 Claude 与 OpenCode 入口；底层实现保留供后续开发
- 升级至 Electron 44、electron-builder 26、Vite 8、TypeScript 5.9 和已修复的 DOMPurify 版本

### Fixed | 修复

- 修复项目 ESLint 的全部错误级问题，并保持现有功能测试通过
- 清理生产和开发/构建依赖中的已知安全漏洞，`npm audit` 结果为 0

## [1.6.0] - 2026-08-29

### Added | 新增功能

- Codex AI 面板改为官方 App Server 常驻会话，支持线程续聊、流式事件和停止当前轮次
- AI 面板显示 STARLIMS MCP 工具调用、命令输出、文件变更、统一 Diff 和运行状态
- 命令、文件修改和权限请求提供单次允许、会话允许与拒绝操作
- 集成官方 Claude Agent SDK 和随应用分发的 Claude Code runtime，并强制连接同一 STARLIMS MCP endpoint

### Changed | 变更

- Codex 与 Claude 使用各自的持久 Agent 会话，不再为每条消息启动一次性 CLI 进程
- OpenCode 暂时保留 CLI 兼容模式
- Codex、Claude 与 OpenCode 各自保存独立的界面对话，切换 AI 不再混用历史
- 消息、Reasoning、MCP、命令、文件变更和审批按事件发生顺序显示在同一时间线
- AI 回复使用 Markdown/GFM 富文本渲染，标题、列表、表格、引用、行内代码和代码块采用独立样式

### Fixed | 修复

- 修复 MCP 和 Reasoning 活动总是堆积在回复文字底部的问题
- 修复 AI 回复直接显示 Markdown 源字符、代码无法区分展示的问题

## [1.5.0] - 2026-08-29

### Added | 新增功能

- Cursor 风格活动栏、三栏工作台配色和可调整的 Explorer/Agent 面板
- 右侧 AI Agent Console，可检测并调用 Codex、Claude Code 和 OpenCode CLI
- AI Console 多轮记录、CLI 状态、MCP 状态和引用上下文标签
- 签出脚本和当前编辑器右键“引用到 AI”，可附带脚本源码或当前选区
- 签出列表显示脚本类型、应用/分类路径、语言、签出用户和项目数量
- AI 上下文拼装烟测，并限制历史和引用源码长度

### Changed | 变更

- Codex CLI 启动时自动注入当前 STARLIMS MCP HTTP endpoint
- 底部输出面板默认折叠，为代码和 Agent Console 保留更多空间
- 状态栏改为读取实际应用版本，并接通 SCM Package Manager 按钮

### Fixed | 修复

- AI Agent 面板现在会完整跟随应用的明暗主题，包括消息区、引用标签和输入框
- CLI 可用性只在版本探测成功退出时显示为可用，避免 Claude/OpenCode 错误输出被误判为已安装
- Codex 启动时将 STARLIMS MCP 标记为必需依赖，MCP 初始化失败时不再静默进入无工具会话
- 修复 Electron 主进程缺少 Web Crypto 导致 Codex 能读取 MCP 配置、但协议握手失败的问题
- Codex 执行前主动确认本地 STARLIMS MCP 服务已启动
- 修复签出项新类型名称落入纯文本模式，以及 Client Script/Code Behind 被错误识别为 C#/HTML 的问题
- Data Source 根据服务端 `SCRIPTLANGUAGE` 自动选择 SSL 或 SQL，高亮 XML、JSON、JavaScript 和表定义

## [1.4.0] - 2026-08-29

### Added | 新增功能

- 服务器列表增加编辑功能，可修改名称、URL、用户名和 URL 后缀
- 重命名服务器时迁移已保存密码和当前选中项
- 自动将 `starthtml.lims` 启动地址规范化为 SCM API 使用的 STARLIMS 应用根地址
- 服务器 URL 配置烟测

### Changed | 变更

- 编辑当前服务器会断开旧会话，防止 MCP 或编辑器继续使用过期连接配置
- 登录页版本号改为读取实际应用版本

## [1.3.0] - 2026-08-29

### Added | 新增功能

- 迁移 SSL 局部定义、引用查找、符号重命名和文档高亮
- 迁移函数参数内联提示与过程引用数量 CodeLens
- 迁移 SSL 风格诊断快速修复及文件/行级规则抑制操作
- 烟测覆盖导航、重命名、内联提示、CodeLens 和快速修复

### Fixed | 修复

- 按引用所属词法作用域解析局部参数和变量，避免解析完成后回到全局作用域导致定义跳转失败

## [1.2.0] - 2026-08-29

### Added | 新增功能

- 从 starlimsvscode 迁移 SSL 词法分析器、解析器、符号表和 139 个内置函数定义
- Monaco 实时语法错误与 18 类 SSL 风格诊断（250ms 防抖）
- SSL 文档/选区格式化与内嵌 SQL 格式化
- SSL 悬停文档、参数签名提示、关键字/内置函数补全、文档符号和代码折叠
- `npm run test:ssl` 语言核心烟测

## [1.1.0] - 2026-08-29

### Added | 新增功能

- 本地 STARLIMS Streamable HTTP MCP 服务（默认 `127.0.0.1:3002/mcp`）
- 面向 Codex、ChatGPT Desktop、Claude Code、Cursor 和 VS Code 的 MCP 连接面板
- 浏览、搜索、读取、签出、保存、检入、撤销签出、日志、脚本/数据源执行和表定义工具

### Changed | 变更

- 主界面中的内置 AI 助手替换为 MCP 集成入口
- SCM_API 后端同步到 starlimsvscode 1.8.2（upstream commit `92b9014`）

## [1.0.0] - 2026-04-12

### Added | 新增功能

#### 核心功能 | Core Features
- 跨平台 Electron 桌面应用程序 | Cross-platform Electron desktop application
- 企业树浏览器 - 浏览 STARLIMS 项目 | Enterprise Tree Browser - Explore STARLIMS items
- Monaco 代码编辑器 - 支持 SSL/CS/DS/SQL/XML/HTML 语法高亮 | Monaco code editor with SSL/CS/DS/SQL/XML/HTML syntax highlighting
- 检出/检入功能 | Check Out/In functionality
- 跳转到定义（F11）| Go To Navigation (F11)
- 全局代码搜索（Ctrl+Alt+F）| Global Code Search (Ctrl+Alt+F)
- HTML 表单调试 | HTML Form Debugging
- 源码管理器 - 导出/导入 SDP 包 | Source Control Manager - Export/Import SDP packages
- 输出日志面板 | Output Log Panel
- 多标签编辑器界面 | Multi-tab editor interface
- 用户和日期过滤 | User and date filtering
- 表操作和 SQL 语句生成 | Table operations and SQL statement generation

#### 代码编辑器功能 | Code Editor Features
- 代码折叠 | Code Folding
- 括号匹配高亮 | Bracket Matching Highlight
- 面包屑导航 | Breadcrumb Navigation
- 大纲视图（符号导航）| Outline View (Symbol Navigation)
- 多光标编辑 | Multi-cursor Editing
- 选择所有匹配 | Select All Matches
- 注释切换（Ctrl+/）| Toggle Comment (Ctrl+/)
- 跳转到行（Ctrl+G）| Go to Line (Ctrl+G)
- 悬停信息和参数提示 | Hover Info and Parameter Hints
- 字体大小控制 | Font Size Controls (A+/A-)
- 行号显示/隐藏 | Line Numbers Toggle
- 自动换行 | Word Wrap Toggle
- 空白字符显示 | Whitespace Display Toggle
- 小地图 | Minimap Toggle
- 标签页右键菜单 - 关闭/关闭其他/关闭已保存/关闭全部 | Tab Context Menu - Close/Close Others/Close Saved/Close All
- 标签页悬停路径提示 | Tab Hover Path Tooltip

#### AI 助手功能 | AI Assistant Features
- 多模型支持 - MiniMax, Claude, OpenAI, DeepSeek, Kimi, Qwen, Gemini, Azure OpenAI, Spark, Hunyuan, Doubao | Multi-model Support
- 每提供商独立 API Key 存储 | Per-provider API Key Storage
- Base URL 自动填充 | Base URL Auto-fill
- API Key 显示/隐藏切换 | API Key Show/Hide Toggle

#### 系统功能 | System Features
- 明暗主题切换 | Light/Dark Theme Toggle
- 可调整大小的侧边栏和面板 | Resizable Sidebar and Panels
- 键盘快捷键支持 | Keyboard Shortcuts Support
- 服务器连接管理 | Server Connection Management
