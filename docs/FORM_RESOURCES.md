# HTML Form Resources 保存与加载

> 最新验收（2026-09-05）：人员管理 CHS 页面已在 Chrome 调试入口及普通主菜单入口正常显示中文；此前下文记录的“尚未通过”是历史中间状态。详见文末最终验收。

Resources XML 保存成功不等于 HTML Form 已经加载这些资源。保存流程必须同时检查：

1. `SCM_API.SaveCode` 把资源 DataSet 交给 `Enterprise_Data_Providers.FormProvider.SaveProgramaticXfdResources`。
2. Form XML 的顶层 `Resources` 指向该表单、该语言的 `RUNTIME_SUPPORT.GetFormResources.lims`，并指定 `isProgramatic=Y`、`KeyItem=ResourceId`、`TextItem=ResourceValue`。
3. 回读 Resources 和 Form XML。Source Control 工作副本与运行时发布状态分别报告；不自动 Check In。

## 系统方法对照

2026-09-05 通过当前 STARLIMS MCP 只读检查系统的
`Enterprise_Designer.XFD2HTMLResourcesCopy`。其 `_MergeHTMLResources` 先修复 Form XML
的加载配置，`_CopyResources` 再合并 DataSet 并调用 `SaveProgramaticXfdResources`。
正常 BatchManager CHS 页面包含该配置，以及用于层级回退的 `AlternativeData`。
人员管理 AI 测试入口有资源记录，但完整 Form XML 缺少顶层 `Resources`。

系统批量迁移方法还包含直接更新表和 Check In 操作，不能直接作为 MCP 单页修复调用。
本实现只复用其加载配置约定，所有保存继续经过已有 SaveCode 和写入门禁。

## MCP 行为

- `save_form_resources` 和 `set_form_resource` 对 HTML Form 自动预检并修复标准加载配置；已有 `AlternativeData` 等配置保留。
- 从企业树按准确 URI 获取真实 Form GUID，不信任 AI 生成或复制的 Form XML 中的 `Guid`。
- 自定义 Resources 数据源拒绝自动覆盖，需要人工判断；XFD Form 不套用 HTML 绑定规则。
- Designer 粘贴格式执行合并，完整 DataSet 表示明确替换。合并以读取时版本为基线，防止覆盖并发修改。
- 返回 `formBindingVerified` / `formBindingUpdated`，同时保留工作副本、Designer 重载和 Check In 状态。
- Resources 和 Form XML 是两次受门禁保护的保存，不是事务。后一步失败时不能宣称整体完成，应重新读取两份文档后重试。

## 验证

离线测试覆盖 CDATA、命名空间、空资源、GUID 保留、加载配置缺失/语言错误、层级回退保留和并发修改。
`node scripts/live-form-resources-binding-acceptance.mjs` 使用显式指定的专用 HTML Form：
设置 `STARLIMS_ACCEPTANCE_RESOURCES_URI`、`STARLIMS_ACCEPTANCE_RESOURCES_LANGUAGE` 和
`STARLIMS_ACCEPTANCE_CONFIRM=I_UNDERSTAND_THIS_WRITES_TO_STARLIMS`。
它保存原资源内容并验证绑定修复，保留签出状态，不修改业务数据、不 Check In。

### 2026-09-05 实机结果

- 实际入口：`TestApp/LIYC_AI_UserManagement_TEST/PersonnelManager_AI_Test`，签出语言为 ENG。
- 企业树确认的 Form GUID 为 `72C5ABFE-423D-44A3-A245-090B37B278CA`；原 XML 根 Guid 与它不同，因此加载绑定采用企业树的 GUID。
- 实际执行结果：55 条资源的值和 GUID 全部保持不变；`formBindingVerified=true`、`formBindingUpdated=true`；未 Check In。
- Chrome 调试页仍有 `TABBASIC`、`TABCONTACT` 等未翻译键，尚不能认定页面本地化验收完成。
- 打开该表单的 HTML Designer 后，加载报错：`TypeError: param 0 must be of type StarlimsTreeListColumn, but is actually of type Object`，堆栈位于 `CreateControlFromXML`。因此 Designer 完整重载验收也未通过。该错误与资源保存回读结果分别记录；没有为绕过错误执行系统批量迁移或自动 Check In。

## 三个接口的结构诊断

`get_form_resources` 返回 `format` 和 `formDiagnostics`；两个写接口也返回写后诊断。
`formDiagnostics.status` 为 `valid`（加载绑定正确）、`repair_required`、`unsupported`（例如自定义数据源）、`unavailable`（读取/解析失败）或 `not_applicable`（XFD）。
诊断读取不修改表单；无法读取 Form XML 时保留资源结果并明确返回不可用状态。
`missingColumnTypes` 列出缺少 xtype 的列，`warnings` 提示 XML Guid 与系统 GUID 不一致等问题。
`valid` 只说明资源加载绑定正确；三个接口均返回 `runtimeVerified=false`，不会把结构检查当成 Designer 或浏览器验收。

请区分三种 XML：

| XML | 用途 | 资源接口输入 |
| --- | --- | --- |
| `ResourcesDataset/ResourcesTable/ResourceId/ResourceValue` | SCM 资源数据 | 完整替换 |
| `Resources/Resource/Id/Value` | Designer 粘贴资源数据 | 合并，保留现有 GUID 和其他条目 |
| `Form/Resources/Data/KeyItem/TextItem` | HTML Form 资源加载绑定 | 不能作为资源数据提交 |

解析器拒绝加载绑定、错误子节点、嵌套资源行以及缺失 Value/ResourceValue 的行；显式空值元素仍合法。

AI 页面与正常页面的差异不能只看排版。2026-09-05 再次只读取得人员管理页 ENG 工作副本：
`OrgName` 树列缺少 `xtype`，其他 DataGrid 列有 `StarlimsDataGridColumn`。
此前 Designer 错误要求 `StarlimsTreeListColumn`，与缺失类型导致普通 Object 的现象吻合。
创建表单时应以 Designer 生成的同控件模板为基础，保留类型和结构元数据；Resources 接口只报告控件结构问题，不擅自重写控件。

## 最终中文运行验收（2026-09-05）

结果：通过用户指定的“人员管理中文页面能正常显示”标准。

- 三个接口 `get_form_resources` / `save_form_resources` / `set_form_resource` 已在当前 DevTools 打包应用中执行 CHS 真实读写；55 条资源值与 GUID 全部保留。
- CHS 文档补齐真实 Form GUID、`OrgName` 的 `StarlimsTreeListColumn` 类型和中文 Resources 加载绑定。最终结构诊断 `status=valid`、`warnings=[]`、`missingColumnTypes=[]`。
- 用户明确授权仅对 `PersonnelManager_AI_Test` 签入。已完成 ENG 工作副本签入、CHS 资源保存与最终 CHS 签入；没有签入其他项目，也没有写人员业务数据。
- Chrome `LangId=CHS` 实际入口显示“基本信息、联系方式、教育经历、工作经历、附件、审批历史”；逐页检查中文字段、表头和占位说明。按钮“查询、新增、编辑、保存、删除、刷新”正常显示。
- 普通主菜单 `Demo → LIYC_AI_UserManagement_TEST` 重新进入后，页面面包屑显示“AI 测试人员管理”，按钮、标签页、字段及表头均为中文。不是通过浏览器临时替换文字或页面 mock 得到的结果。
- 本次验收范围为显示与资源链路；附件、审批历史仍保留原来的只读占位实现，未宣称人员 CRUD 或完整业务功能通过验收。

### 本轮进一步确认的系统约定

1. `GetPendingCheckins` 可以不返回 LANGID。客户端现在保留未知状态，不再默认造出 ENG 签出语言；有明确语言冲突时写入会阻止，缺失信息交由原生保存与回读确认。
2. 系统 `Enterprise_Designer.XFD2HTMLResourcesCopy` 调用 `CheckInProvider.CheckInItem` 的第三个参数是用户名。现有服务器 SCM_API.CheckIn 把语言码传入该位置且忽略 `ERROR` 字符串，产生假成功。本次仅对授权表单通过 MCP 调用同一原生方法、传入 LIYC，获得 `OK` 并验证浏览器生效。本地随包 SCM_API 的 CheckIn/CheckOut 源码已修复参数或返回值检查；未改写服务器全局包装脚本。
3. 原生浏览器资源访问会把键转成小写，并回退到全局资源；此前表单资源集合为空，才会出现 QUERY、TABBASIC 和混合翻译。不能仅据混合大小写断言它是本次故障原因。
4. 系统 `FormDesigner.ReadXML` 的列处理分支强制把全部列设为 `StarlimsDataGridColumn`，导致 TreeListView 列在 Designer 中报类型错误。该全局 Designer 问题与已通过的中文运行页验收分开记录，本次没有修改系统 Designer。

### 2026-09-05：checkin_item 后续修复

上述“未改写服务器全局包装脚本”是前一次资源验收时的状态。现已修复并部署 LEEKK/LKK_NEW 的 `SCM_API.CheckIn`，补齐 Resources 类型及错误传播，DevTools 和独立 MCP 增加签入前后状态核验。新版应用通过正式 `checkin_item` 对 `PersonnelManager_AI_Test` CHS 验收成功：签出释放、55 条资源保持原值、重复签入明确失败。详见 [MCP 完整性评估](MCP_READINESS.md)。
