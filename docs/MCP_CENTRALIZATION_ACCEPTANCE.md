# MCP 集中管理验收（2026-09-06）

## 结果与职责

DevTools 使用 starlims-mcp 的 devtools Profile：36 个业务工具加 get_capabilities，共 37 个。工具定义、Schema、能力元数据、协议注册、菜单工作流、预览契约均由共享包维护。DevTools 的工具页面、Generic Agent、子进程和进程内回退从同一目录派生；本地保留会话、执行、编辑器/预览、权限与写入门禁 Adapter。

SCM_API 的维护源码在 starlims-mcp/scm/server，部署包在 scm/distribution。DevTools 构建只校验并复制共享 SDP，src/scm_api 为兼容镜像。238 个源文件与 SDP 解包内容逐文件一致，包 SHA-256 已核验。

共享源码提交 c610d25a874532ccab6579d9b369e6aaf8550534 已发布为 v0.5.2，GitHub CI 与发布工作流通过，提供独立 Server、SDP 和校验文件。DevTools beta.6 已切换到该固定远端标签，来源提交记录于 components/shared-components.lock.json，下载完整性记录于 package-lock.json。

## 验证

- starlims-mcp：23 项测试通过，3 个不可变 vendor 快照验证通过，自动生成接口文档校验通过。共享 Server 测试覆盖 37 工具注册、菜单转发和截图图片响应。
- DevTools：完整构建、35 项 smoke tests、ESLint 基线通过（0 errors，218/219 warnings）；macOS 本地应用打包成功。
- 实际退出旧应用并启动 release/mac-arm64 中的新应用，正常登录 LEEKK；企业树、签出列表和 AI 面板正常显示。
- 实际共享子进程握手为 starlims-devtools-bridge，37 个工具；企业树、当前签出项、签入历史只读调用通过。
- get_menu_configuration 读取既有 Demo 测试菜单成功，get_form_resources 读取材料类型测试页 CHS 资源成功。
- open_form_preview 打开 MaterialTypes_AI_Test 中文运行页，inspect_form_element 返回 surface=runtime、loading=false。实际桌面截图显示中文大类/小类表格、描述、库存可见、按钮和现有测试数据。
- capture_form_screenshot 返回 image 与 text MCP 内容块。

本轮没有重复写入菜单、业务数据或修改原生系统方法。先前 CRUD/系统打印验收见 MATERIAL_TYPES_AGENT_ACCEPTANCE.md；本轮验证的是集中管理后的集成，不声称重新执行全部业务验收。

## 发现并修复的回归

共享包根入口含 Node 服务端模块，渲染端直接导入后曾导致应用空白。新增 @tenlyc/starlims-mcp/browser 纯浏览器入口，将菜单 Schema/工作流与 Node 服务端依赖隔离，增加浏览器目标打包测试；修复后实际登录和中文运行页显示通过。

旧 Windows 测试依赖 LF 字符，CRLF 会导致脚本提取失败；提取前统一换行。编辑器预览使用企业树运行 GUID，缺失时按 URI 查询，避免误用 XML 内部 GUID。

## 保留的限制

- 独立 HTTP Adapter 尚未实现全部桌面执行能力；共享契约集中不等于所有工具独立运行可用。
- 预览仍返回 4 条系统控制台日志：bridge 时区提示、photograph 与二维码脚本 MIME 错误、系统 starlims-all.js 的对象日志；未宣称零错误。
- beta.5 的旧 GitHub Windows 工作流失败；beta.6 修复 CRLF 测试问题并使用已发布共享依赖，发布由 macOS/Windows 打包门禁控制。
