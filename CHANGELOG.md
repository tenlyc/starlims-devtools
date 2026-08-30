# Changelog | 更新日志

所有重要的 STARLIMS DevTools 更改都将记录在此文件中。
All notable changes to "STARLIMS DevTools" will be documented in this file.

格式基于 [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)，本项目遵循 [语义化版本](https://semver.org/spec/v2.0.0.html)。
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] | 未发布

## [1.7.0-beta.1] - 2026-08-30

### Added | 新增

- 增加平台原生编辑器快捷键、Data Source SQL 智能提示、执行结果表格/原始数据视图，以及可直接保存的 `Ctrl/Cmd+S`
- 增加对话内 MCP 写入审批和三档 Agent 授权策略，工具活动默认折叠为紧凑时间线
- 增加持久化 `starlims-lsp` 会话、版本锁、校验缓存、回退选择与上游更新审计工具
- 重构企业树与签出树图标和布局，固定签出标题/刷新操作，并完善右键菜单中英文与功能验证
- 将 Customize 升级为 AI 能力中心，统一展示 Agent 工作区、模型配置、用户规则、MCP 与依赖索引
- 同步当前用户签出项时自动分析 include、服务端脚本、数据源和表单引用，支持上下游影响与未解析引用查看
- AI 对话按当前引用脚本注入预算受控的依赖事实，并明确与用户 `AGENTS.md`/`agent.md` 规则隔离
- 增加规划、实现、审查、测试四角色工作流，支持依赖顺序执行和审查/测试并行阶段
- 增加测试用例、工作区测试命令与结果留存，以及 Diff、SSL、删除、测试写回门禁
- 增加团队、项目、个人配置分层和安全导入导出；导入的 `agent.md` 保持独立且拥有最高用户规则优先级
- 增加版本化 AI 扩展清单，可贡献第三方 MCP、工具元数据、语言映射和工作流模板
- 增加独立 `starlims-mcp` 共享组件，将 MCP 工具来源、风险、Schema、宿主 Profile 与后端版本握手统一管理
- 增加按明确语言读取、结构化修改和完整保存 HTML/XFD Form Resources 的 MCP 工具，并提供内容版本冲突检查与保存后语义回读验证
- DevTools 自动启动 `starlims-mcp` v0.5.1 独立 Server 子进程，通过令牌化本地桥接保留当前登录会话和对话内审批，并在健康检查失败或进程退出时回退到内置服务
- “上游组件”统一支持检查 MCP Server 与 `starlims-lsp` GitHub Release、手动安装经过 SHA-256/兼容性校验的版本、切换本地版本和启动失败自动回退
- 构建时生成唯一的合并 `SCM_API.sdp`，同时包含固定的 `starlimsvscode` 上游基础包与 `starlims-mcp` 自有 `Mcp*` 后端扩展

### Fixed | 修复

- 修复“新增企业项目”仍发送旧版小写参数、无法调用当前合并 `SCM_API.Add` 的问题，同时保留对旧服务端的兼容
- 修复企业名称搜索结果中的应用/分类节点缺少真实 URI、从搜索结果右键新增会失败的问题
- 修复 DevTools MCP `get_item_code` 未返回内容版本、`save_item` 声明了 `expectedVersion` 却未在桥接层阻止过期写入的问题
- 修复通用 OpenAI-compatible Agent 只暴露业务工具、无法调用 MCP `get_capabilities` 能力发现工具的问题
- 修复 HTML Form 保存时误将文件类型作为 `UserLang` 的问题
- 修复 MCP 签出与检入声明了语言参数、但执行阶段丢失参数的问题
- 修复切换到服务器专属 Agent 工作区时，Codex 正常重启被错误显示为 `exited with code null` 的问题
- 修复 `#include "Module.Script"` 脚本引用被错误要求以分号结尾的问题
- 修复 Data Source 运行成功但结果不可见，以及 Run 使用了错误执行契约的问题
- 修复 Codex 模型列表在 App Server 暂时不可用时一直停留在“加载中”的问题
- 修复短生命周期 LSP 校验进程已成功返回、但关闭 stdin 的无害 `EPIPE` 导致 Linux CI 失败的问题

### Changed | 变更

- Agent 工作区支持在“自定义 → 工作区”中选择本机根目录，并继续按 STARLIMS 服务器与用户隔离
- Agent 工作区改为同步当前用户的全部签出脚本，并使用远端基线与本地工作副本分离的模型，自动刷新不再覆盖 Agent 修改
- “自定义 → 工作区”增加多文件 Diff、修改选择和确认写回；写回前检查签出、语言、远端冲突与 SSL 语法，保存后执行回读校验
- 对规则、最近对话和脚本引用实施约 32K token 的分区预算，超限内容会明确标记截断
- 移除旧 AI 面板、旧提供商实现和重复配置；行内补全改为复用当前通用 Agent 平台、模型及密钥
- 移除内置 Claude Agent SDK；Claude Code 等第三方客户端继续通过外部 MCP 使用 STARLIMS 工具，显著缩小桌面安装包
- 启动时清理旧 AI 面板遗留的普通配置项，避免历史版本的明文密钥继续残留
- 内置 MCP HTTP 服务与通用 Agent 改为共用固定版本的工具目录；工具归属只保留 `starlimsvscode` 与 `starlims-mcp`，DevTools 作为 Profile/Adapter，STARLIMS 侧统一部署单一 `SCM_API` 命名空间
- 将共享组件升级到 `starlims-mcp` v0.5.1；DevTools 与上游 MCP/SCM 实际源码现在按提交和 SHA-256 归档，可离线恢复并供其他 STARLIMS 工具复用

### Security | 安全

- Plan 与 Ask 模式现在由运行时强制只读，Codex 同步使用只读 sandbox，并停用外部 MCP
- Agent、Debug 与 Multitask 模式的 STARLIMS 写入/执行操作需要应用内逐次确认
- 通用 Agent 对未声明只读的外部 MCP 工具增加确认，默认不再视作安全读操作
- 通用 Agent API Key 继续单独存入 Electron 本机密钥存储，普通配置不保存密钥
- 外部 MCP 的 Token、API Key、密码和 Authorization 等敏感字段迁移到本机密钥存储，普通配置与导出文件仅保留占位符

### Tooling | 工程化

- 增加 Beta 发布验收命令、真实 STARLIMS 写入链路脚本、正式版平台门禁文档和 ESLint warning 不增量基线
- 增加统一 `npm run check`，先准备并校验当前平台 LSP，再串行执行 lint、TypeScript/Vite/Electron 构建和 27 组 smoke tests；干净环境不依赖历史构建产物
- 增加 GitHub Actions，在 `main` 推送及 Pull Request 时执行相同检查
- 统一 `SCM_API.sdp` 在 macOS/Linux 构建时移除 ZIP 主机扩展字段和目录时间戳，保证相同源码重复构建得到相同 SHA-256

## [1.6.2] - 2026-08-30

### Added | 新增功能

- Codex AI 面板改为官方 App Server 常驻会话，支持线程续聊、流式事件和停止当前轮次
- AI 面板显示 STARLIMS MCP 工具调用、命令输出、文件变更、统一 Diff 和运行状态
- 命令、文件修改和权限请求提供单次允许、会话允许与拒绝操作
- 通用 Agent 支持多个 OpenAI-compatible 平台、独立 API Key、模型列表、默认模型和最大工具轮次
- 增加 Agent、Plan、Debug、Multitask、Ask 对话模式，以及 `@` 脚本引用、文件附件和独立会话历史
- 增加 Customize 页面，集中维护用户 Markdown 规则及 HTTP、SSE、stdio 外部 MCP
- 增加 Problems、Output、STARLIMS Log 底部面板，支持日志用户和信息/警告/错误分类
- 增加多语言 HTML Form 签出显示、固定四文件顺序与按语言导出 SDP
- 增加统一应用图标、登录/工作台品牌展示、退出登录和完整明暗主题适配
- 从 starlimsvscode 迁移 SSL 词法分析器、解析器、符号表和 139 个内置函数定义
- Monaco 实时语法错误与 18 类 SSL 风格诊断（250ms 防抖）
- SSL 文档/选区格式化、内嵌 SQL 格式化、悬停文档、参数提示、补全、文档符号和代码折叠
- 本地 STARLIMS Streamable HTTP MCP 服务，以及浏览、搜索、读取、签出、保存、检入、日志、执行和表定义工具

### Changed | 变更

- Codex 与通用 Agent 各自保存独立的界面对话，切换 AI 不再混用历史
- 消息、Reasoning、MCP、命令、文件变更和审批按事件发生顺序显示在同一时间线
- AI 回复使用 Markdown/GFM 富文本渲染，标题、列表、表格、引用、行内代码和代码块采用独立样式
- 工作台、编辑器、源码管理、设置和登录页面统一为响应式 Cursor 风格，并完整适配明暗主题
- 升级至 Electron 44、electron-builder 26、Vite 8、TypeScript 5.9 和已修复的 DOMPurify 版本

### Fixed | 修复

- 修复 MCP 和 Reasoning 活动总是堆积在回复文字底部的问题
- 修复 AI 回复直接显示 Markdown 源字符、代码无法区分展示的问题
- AI Agent 面板现在会完整跟随应用的明暗主题，包括消息区、引用标签和输入框
- Codex 启动时将 STARLIMS MCP 标记为必需依赖，MCP 初始化失败时不再静默进入无工具会话
- 修复 Electron 主进程缺少 Web Crypto 导致 Codex 能读取 MCP 配置、但协议握手失败的问题
- Codex 执行前主动确认本地 STARLIMS MCP 服务已启动
- 修复签出项新类型名称落入纯文本模式，以及 Client Script/Code Behind 被错误识别为 C#/HTML 的问题
- Data Source 根据服务端 `SCRIPTLANGUAGE` 自动选择 SSL 或 SQL，高亮 XML、JSON、JavaScript 和表定义
- 按引用所属词法作用域解析局部参数和变量，避免解析完成后回到全局作用域导致定义跳转失败
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
