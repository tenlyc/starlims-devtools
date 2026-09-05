# STARLIMS 菜单 MCP 原生实现调研

日期：2026-09-05。通过运行中的 DevTools `http://127.0.0.1:3102/mcp` 查询 LEEKK/LKK_NEW；仅调用搜索、源码读取和已审阅的只读数据源，没有创建菜单或修改权限。

## 已确认的原生实现

截图中的部件设计器是 `/Applications/DashboardParts/Console/HTMLForms/CodeBehind/Designer`。不能只通过 `search_by_name("Designer")` 的结果判断不存在：本次搜索未列出 Console.Designer，但浏览 Console 应用后可以找到并读取完整源码。

以下名称均相对于 `/Applications/DashboardParts/Console/`：

| 用途 | 原生脚本/数据源 | 契约 |
| --- | --- | --- |
| 查询菜单树 | DataSources/ConsoleTreeDT | destinationType=C, groupType=HTML；读取分组、项目、排序、命令、内部 ID |
| 新建分组 | ServerScripts/addConsoleGroup_HTML | groupName, destinationType, groupType, sorter |
| 新建菜单项 | ServerScripts/addConsoleItem_HTML | groupName, itemName, destinationType, groupType, sorter；创建 GUID、默认图标和各语言标题；已存在返回 false |
| 修改入口与参数 | ServerScripts/updateConsoleDetails | groupName, itemName, groupType, destinationType, aFields；字段白名单、参数化 SQL；注意两种类型参数顺序与新增方法相反 |
| 查询标题 | DataSources/getItemCaptions_HTML | destinationType, mode, parent, item |
| 修改标题 | ServerScripts/updateProviderConsoleCaptions_HTML | 原生更新提供器：strControlID, strTableName, arrFields, nOrigRec；字段含新旧值和类型 |
| 修改角色 | ServerScripts/updateProviderConsoleRoles_HTML | 更新提供器字段需包含 PARENT、NAME、ROLEID、CHECKED、GROUPTYPE、DESTINATIONTYPE、ISMANDATORY |
| 查询角色目录 | DataSources/Roles | ROLES.TREEAUTH 为 ROLEID，ROLE 为显示名；需保留特殊角色语义 |
| 读取参数执行结果 | ServerScripts/GetCommandParameters | 读取 COMMANDPARAMETERS 后 ExecUdf 执行；不宜作为默认只读检查接口 |

`Console.FormPicker` 返回 `应用名.表单名`，同时向 Designer 写入应用 ID（PARENTID）及表单 ID（ITEMID）。不能只填写 COMMANDNAME 或运行时 URL。

参数栏保存 SSL 脚本，运行时执行后得到参数值。`updateConsoleDetails` 修改 COMMANDPARAMETERS 会调用 `Runtime_Support.ResetApplication`；Designer 还清空 `window.Starlims.LoadCache.CmdParams`。因此缓存刷新行为必须纳入接口契约。

配置涉及 SettingsDB 的 CONSOLEGROUPS、CONSOLEITEMS、CONSOLEGROUPCAPTIONS、CONSOLEITEMCAPTIONS、CONSOLEITEMROLES。菜单角色标识不能直接用显示名称替代。

## 现有测试菜单只读验证

`execute_data_source(ConsoleTreeDT, ["C", "HTML"])` 成功，返回 266 行且未截断。目标记录：

- 分组：Demo；菜单项：LIYC_AI_UserManagement_TEST；顺序：3。
- GROUPTYPE=HTML、COMMANDTYPE=A、DESTINATIONWINDOW=A（Applications Tab）。
- COMMANDNAME=LIYC_AI_UserManagement_TEST.PersonnelManager_AI_Test。
- PARENTID=02F5FCFA-0D8B-457E-8005-1000D095333F。
- ITEMID=72C5ABFE-423D-44A3-A245-090B37B278CA。
- COMMANDPARAMETERS、CAPTIONCALCULATION 均为空。
- 标题查询成功：CHS 和 ENG 目前都是 LIYC_AI_UserManagement_TEST。

角色读取已验证：改为分别读取 `Console.Roles` 和 `Console.ConsoleRoles`，避开报错的原生聚合数据源。角色目录返回 61 行，授权查询返回 1745 行；Lims_Admin 映射 ROLEID=L，原测试菜单也授权了 L。

## 已实现的 3 个 DevTools MCP 接口

1. `get_menu_configuration`：读取 HTML 分组、菜单、角色目录、当前授权；指定分组和项目时读取语言标题。
2. `plan_menu_item`：只生成方案。校验分组、语言、角色、表单映射和重名；只允许追加，不覆盖现有项目。方案在当前登录会话内有效 15 分钟，重新登录/会话刷新或应用重启后需重新生成。
3. `apply_menu_item`：应用已确认的 planId，写前核对配置及映射，写后核对入口、位置、标题和角色。成功方案重复调用返回原结果；失败/状态未知不自动重试。`configurationVerified=true` 与 `runtimeVerified` 分开报告。

菜单写入已按用户要求改为独立 `/ServerScripts/SCM_API/MenuManagement` 的 `CreateItem`，**没有修改 Console 原生方法，也不串联原生保存方法**。读取使用原生只读数据源；应用/表单 ID 使用独立 `ResolveForm` 参数化查询。新脚本已保存至 LEEKK/LKK_NEW 并保留 LIYC 签出，未签入。SDP 构建包含此脚本。

独立后端在一个 SettingsDB 事务内写 CONSOLEITEMS、CONSOLEITEMCAPTIONS、CONSOLEITEMROLES，失败时回滚；现有分组使用 SQL Server UPDLOCK/HOLDLOCK 防止同时重复创建。当前实现针对本次 SQL Server 环境，不宣称已兼容 Oracle。真实失败回滚尚未通过故障注入验收；客户端重复调用和失败阻止重试有回归测试。

第一版支持已有分组中的 HTML Application 入口、多语言标题、参数 SSL、明确角色及追加位置。窗口固定为 Applications Tab；新建分组、移动/修改/删除现有菜单、图标上传和动态标题不在此版范围。参数脚本不会在规划时执行；真实验收采用空参数。

AI 指令及 create_item 返回提示已接入：页面开发和运行验证完成后，询问是否加入菜单，并收集分组、中文标题、参数、允许角色；已回答则复用。预览登录角色不会自动成为菜单授权。MCP 接口本身不会主动弹问，询问由 AI 工作流执行。

## 新菜单真实验收（2026-09-05）

用户明确批准：Demo 下新建“AI 人员管理 MCP 测试”，参数为空，仅允许 Lims_Admin。

- 实际内部菜单名：AI_Personnel_MCP_Test；位置 4；CHS 标题：AI 人员管理 MCP 测试。
- 目标：LIYC_AI_UserManagement_TEST.PersonnelManager_AI_Test；应用和表单 ID 与前述记录一致。
- 通过新 plan/apply MCP 创建成功，配置读回完全匹配；重复 apply 未重复创建。
- Chrome 中点击主菜单刷新、展开 Demo，新菜单可见；点击新菜单后打开人员管理页面，基本信息、用户名、查询、部门 / 服务组均为中文。
- Chrome 账户面板确认角色 Lims_Admin。没有操作人员新增、编辑、删除。
- 没有通过 Git 提交/推送这些更改。原测试菜单仍保留。
