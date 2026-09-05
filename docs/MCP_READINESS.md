# STARLIMS AI/MCP 完整性评估

2026-09-05：当前对外服务注册 37 个工具，基础开发可用，但尚未覆盖 AI 自主完成复杂 STARLIMS 开发与验收的全过程。接口数量不能代替执行契约和运行验证。

## 菜单接口

新增 get_menu_configuration、plan_menu_item、apply_menu_item，接入 DevTools 各 MCP 运行方式和 AI 工作流。写入采用独立 SCM_API.MenuManagement，不修改 Console 原生方法。Demo 下测试菜单已通过新 MCP 创建，并在 Chrome 的 Lims_Admin 角色下点击打开中文页面。范围与验证见 [菜单 MCP](MENU_MCP_RESEARCH.md)。

## 编辑器预览入口验收（2026-09-05）

- HTML Form XML 与 Code Behind 的工具栏、编辑器右键菜单已恢复 Preview/Debug；Design 继续隐藏，预览中保留独立的“本地布局”入口。
- 修复编辑器的 XML/JavaScript 等语法标识被用作 LangId 的问题：预览忽略这些标识并使用会话语言，显式 CHS/ENG 仍优先。
- 最终 macOS 包实测 XML Preview 和右键 Debug，切换 CHS 后 PersonnelManager_AI_Test 的基本信息、用户名、查询、部门 / 服务组正常显示；两种模式均为 runtime、loading=false、加载错误 0。控制台仍有 3 条系统日志，未宣称控制台无错误。
- XML/Code Behind 工具栏及右键菜单可见性均已实测；预览 smoke test、语言回归、构建及 git diff --check 通过。未签入其他表单或修改人员数据。

## 本次完成的 checkin_item 修复

- SCM_API.CheckIn 对 Form 使用当前用户名作为原生 CheckInItem 的第三个参数，检查返回的 ERROR 字符串，并拒绝未支持的类型。
- 支持 HTML/XFD Resources URI；客户端将同一表单的 Resources、CodeBehind、Guide 路由到 XML 主项目，明确签入范围是整个表单。
- DevTools 与独立 starlims-mcp 均先解析准确目标 GUID，确认当前用户已签出；提交后重新读取原生签出状态。仅在目标确实释放后返回 `checkedIn=true, verified=true, verification=checkout_released`。
- 错误字符串、签出未释放、签出列表读取失败/格式错误均不能成为成功。状态核验失败后不自动重复写入。
- verified 指签出释放得到验证，不代表运行页面、业务逻辑或其他环境部署已通过。
- 服务端修复已部署到本次连接的 LEEKK/LKK_NEW；未批量部署其他服务器，未提交 GitHub。

## 验证结果

- DevTools：32 项 smoke tests 通过；独立 starlims-mcp：21 项测试通过。ESLint 为 0 errors、218/219 warnings，macOS 应用打包成功并已重启连接。
- 正式 MCP 实测：对 `PersonnelManager_AI_Test` 的 CHS Resources URI 签出、原值保存、调用 `checkin_item`，返回 `verified=true`，并确认父 Form 签出释放。
- 签入前后 55 条资源完全一致；再次调用 `checkin_item` 明确返回错误，未报告虚假成功。未修改人员业务数据。
- 可复现脚本：`scripts/live-checkin-acceptance.mjs`，需要显式指定测试 URI、语言和签入确认环境变量。此次验证覆盖签入及资源保全；中文页面运行验收见 `FORM_RESOURCES.md` 的先前记录。

## 本轮完成：执行契约与页面验收

- `execute_server_script`：`entryPoint`、`parameters`、`outputType` 从 schema 经 bridge、write gate、service 传入 `SCM_API.RunScript`；`maxCharacters` 限制返回内容。ARRAY 保留原生结果，JSON 序列化，XML 要求脚本返回 XML 文本。非法入口在执行前拒绝。
- `execute_data_source`：参数传给原生 `RunDS`，支持 ARRAY/XML/JSON；返回 `totalRows`、`rowsTruncated`。`maxRows` 当前作用于首个结果表，默认 100、上限 10000；多表数据集的统一行数限制仍待扩展。`maxCharacters` 默认 50000、上限 1000000；它限制返回内容，不限制数据库工作或执行副作用。
- 输出超长时明确返回 `truncated=true, outputEncoding=text-fragment`；不再同时附带未限制的重复 rows。截断文本不能作为完整 XML/JSON 解析。
- 保留 false、0 等原生结果；后端失败携带原始错误，缺失成功状态不能作为空结果成功。不因错误自动重跑执行。
- 兼容系统 `RunDS` 返回的无 XML 声明头数据集。新建数据源原先被 `SCM_API.Add` 强制改为 SQL，现保留 SQL/STARLIMS，并接受 SSL 别名；不支持的语言明确报错。
- 7 个预览工具已接通：`open_form_preview`、`refresh_form_preview`、`set_preview_viewport`、`capture_form_screenshot`、`inspect_form_element`、`get_preview_console_errors`、`get_preview_load_errors`。
- 共享 MCP 子进程、内置回退服务、Generic Agent 和能力清单同步；`get_capabilities` 包含本地工具。打开/刷新按执行权限处理，截图返回 MCP image 内容；预览结果不复用旧缓存。
- 返回实际 URL、loading、runtime/layout 状态；打开成功仅表示请求已提交。布局回退不能用于运行截图/DOM 验收。刷新会清空旧导航日志，避免把历史失败算作当前失败。自动登录支持填入凭据前暂时禁用的 ExtJS 登录按钮；通过可见密码框/登录面板识别登录页，避免把业务页的“用户名”标签误报为登录失败。按用户要求，仅在可见的 STARLIMS 登录面板内先选择第一个可用站点，等待角色加载，再按角色值或显示名称匹配 `Lims_Admin` 并确认；若账号在该站点没有此角色，明确提示而不改选其他角色。

### 本轮真实验收

- 在 LEEKK/LKK_NEW 已部署并验证 `SCM_API.RunScript` 和 `SCM_API.Add`，两项脚本均确认签出释放。DevTools 最终 macOS 包已重启连接。
- 系统只读元数据数据源按 Manager/APP_FRM 参数筛选出 106 行；三种输出格式均能限制到一行、报告总行数及截断。缺失数据源明确失败。
- 修复后的 create_item 新建 `MCP_ExecutionAcceptanceNative`（STARLIMS 数据源），只校验固定参数并返回两行内存 XML。入口、参数、三种格式、maxRows=1、maxCharacters=20 均通过。
- `PersonnelManager_AI_Test` 的 CHS debug 页面在集成运行预览中正常显示中文按钮、表头和标签页。正式 MCP 已完成打开、DOM 检查、截图、视口切换、刷新、两类日志读取，加载错误为 0。此前运行复查覆盖了自动选择首个站点/角色及刷新后中文内容断言；后续角色默认规则已按用户要求改为 Lims_Admin，并通过名称匹配及角色缺失回归测试，未再出现登录误报。
- 控制台仍有公共 photograph/html5-qrcode 脚本 MIME 错误、时区 bridge 提示和一项 `[object Object]` 信息；已如实返回，不能据此声称页面完全无运行日志错误。此次未修改这些系统公共资源。
- 33 项 smoke tests 通过（包括禁用登录按钮回归），ESLint 0 errors、218/219 warnings；最终打包完成。未提交或推送 GitHub。
- 三个验收数据源均位于 `LIYC_AI_UserManagement_TEST`，保持签出：`MCP_ExecutionAcceptanceRows`、`MCP_ExecutionAcceptanceRowsSSL`（均为有效常量 SQL；后者名称保留了语言问题排查过程）、`MCP_ExecutionAcceptanceNative`（STARLIMS）。没有人员业务数据写入。
- 执行验收脚本：`scripts/live-mcp-execution-acceptance.mjs`，环境变量 `STARLIMS_ACCEPTANCE_DATASOURCE_URI` 允许上述 Native 夹具或 `/DataSources/SourceControlMgmt/dsGetItemsFromSearch`。

## 已有接口的实际缺口

| 优先级 | 发现 | 对 AI 的影响 | 建议 |
| --- | --- | --- | --- |
| P0 | 部分 service 将后端失败转换为空字符串、空数组或 false | AI 无法区分空结果和失败 | 保留结构化后端错误，区分成功空结果、错误和无法验证 |
| P1 | CodeBehind/HTML XML 缺少与 SSL 同等明确的校验接口 | 生成的 XML 语法合法也可能无法由 Designer 或运行时处理 | 增加控件类型、事件绑定、表单资源引用、语言及 GUID 诊断 |
| P1 | 已移除将宿主版本冒充 SCM_API 版本的字段，但仍未读取真实服务器版本 | AI 只能知道版本未知 | 补充真实服务器版本探测和各项能力验证 |



## 值得补充的接口（提议，尚未实现）

| 优先级 | 建议接口 | 目标 |
| --- | --- | --- |
| P1 | get_item_metadata / get_form_bundle | 一次取得真实 GUID、类型、代码语言、目标语言、XML、CodeBehind、Resources、事件和签出状态，避免读错对象 |
| P1 | get_control_schema / get_form_template | 获取系统真实控件属性、事件和同类表单模板，避免 AI 凭空拼 XML |
| P1 | get_dependencies / find_references | 查询调用、被调用、数据源和表字段影响；现有本地依赖索引只覆盖已索引签出文件，未作为 MCP 工具开放 |
| P1 | validate_form / validate_javascript | 在保存前检查 HTML Form 结构、控件类型和 JS 事件代码；结合真实运行验收 |
| P1 | run_form_test / get_test_result | 执行受控页面步骤及断言，返回截图、错误和结果；当前 run_integration_tests 不在 DevTools profile 中 |
| P2 | preview_changes / apply_item_patch | 以版本为前提生成差异和精确修改，减少整份 XML/脚本重写 |
| P2 | prepare_change_set / get_operation_status | 管理多脚本、多语言、多表变更的顺序和部分失败；在后端不支持事务时明确各项状态，不能伪称原子提交 |
| P2 | get_item_history / restore_item_version | 按准确项目查看版本并执行可审计恢复；现有历史查询主要按用户和日期筛选 |

建议顺序：先修契约和错误结果，再接通页面验收，再补元数据/模板/依赖，最后扩展批量变更与恢复。不建议优先给 AI 增加无限制 SQL 或任意运行时 JavaScript 执行入口。
