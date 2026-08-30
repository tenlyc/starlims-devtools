# Release readiness / 发布验收

## Beta gate / Beta 门禁

Run `npm run release:beta:check`. It executes the normal project verification,
enforces the ESLint warning ceiling, and writes a local report to
`release-readiness/beta-report.md`.

运行 `npm run release:beta:check`。该命令执行项目完整检查、阻止 ESLint
warning 数量增加，并在 `release-readiness/beta-report.md` 生成本机验收报告。

### Live STARLIMS write acceptance / STARLIMS 真实写入验收

Use only a disposable, dedicated acceptance-test item. The script intentionally
requires an explicit confirmation value and never discovers a write target by
itself. Every write still appears in the DevTools conversation approval UI.

只能选择专用、可丢弃的测试项目。脚本要求明确确认值，不会自行寻找写入目标；
每次写入仍需在 DevTools 对话内完成授权。

```bash
export STARLIMS_ACCEPTANCE_URI='/Applications/Acceptance/DEVTOOLS_MCP_TEST/ServerScripts/WRITE_TEST'
export STARLIMS_ACCEPTANCE_LANGUAGE='ENG'
export STARLIMS_ACCEPTANCE_CONFIRM='I_UNDERSTAND_THIS_WRITES_TO_STARLIMS'
export STARLIMS_ACCEPTANCE_FINALIZE='undo'
npm run test:mcp-live-write
```

For an HTML/XFD Form, optionally add the Resources URI and explicit language:

```bash
export STARLIMS_ACCEPTANCE_RESOURCES_URI='/Applications/Acceptance/DEVTOOLS_FORM/HTMLForms/Resources/FORM_TEST'
export STARLIMS_ACCEPTANCE_RESOURCES_LANGUAGE='CHS'
```

Run the code-item scenario twice on dedicated targets: one run with `undo`, and
one with `checkin`. The sequence verifies versioned read, checkout, no-op save,
read-back equality, stale-version rejection, optional multilingual Resources,
and finalization. A no-op save is used so acceptance does not intentionally
change source content, although `checkin` still creates source-control history.

代码项目需要用专用目标执行两次：一次 `undo`，一次 `checkin`。流程覆盖带版本读取、
签出、原内容保存、回读一致性、旧版本阻断、可选的多语言 Resources 以及最终签入或撤销。
保存内容保持不变，但 `checkin` 仍会产生 SCM 历史记录。

To include the live run in the generated Beta report, also set
`BETA_INCLUDE_LIVE_WRITE=1` before `npm run release:beta:check`.

### Latest live result / 最近一次真实验收结果

- Date / 日期: 2026-08-30
- Server / 服务器: `LEEKK`
- Dedicated item / 专用页面:
  `/Applications/RunCreateResultsEntryRunApprov/RUNBUILD_RESENT_APPROVE/HTMLForms/XML/DEVTOOLS_MCP_ACCEPTANCE_20260830`
- Language / 语言: `ENG`
- Passed / 已通过: versioned read, checkout, no-op save, read-back,
  stale-version rejection, Resources read/save verification, undo checkout,
  and check-in.
- Check-in reason / 签入说明:
  `STARLIMS DevTools Beta write-path acceptance 2026-08-30`

The acceptance page is intentionally retained as a reusable, clearly named
fixture. It contains only the default blank form content; the verification uses
no-op writes and does not copy business data into the repository or reports.

该页面会作为名称明确、可重复使用的验收夹具保留。页面仅包含新建表单的默认空白内容；
验收执行的是无内容变化写入，不会把业务数据复制到仓库或验收报告中。

## Stable-only gates / 正式版门禁

- macOS artifacts must be signed with Developer ID Application and notarized;
  `codesign --verify --deep --strict` and `spctl --assess` must pass.
- Build and install the Windows package on a real supported Windows machine,
  then repeat connection, editor, LSP, MCP read, and live write acceptance.
- Exercise MCP Server and LSP update, SHA-256 rejection, version switch, restart
  failure rollback, and bundled-version recovery from the application UI.

- macOS 产物必须完成 Developer ID 签名与公证，并通过 `codesign`、`spctl` 检查。
- 必须在真实受支持的 Windows 环境安装并复测连接、编辑器、LSP、MCP 读取和写入。
- 必须从应用界面验收 MCP Server 与 LSP 的更新、SHA-256 拒绝、版本切换、启动失败回退和内置版本恢复。

## ESLint baseline / ESLint 基线

`quality/eslint-baseline.json` records the existing warning ceiling. CI permits
warning cleanup but rejects any increase; existing warnings can therefore be
removed incrementally without allowing new debt.

`quality/eslint-baseline.json` 记录现有 warning 上限。CI 允许数量下降、拒绝增加，
因此无需阻塞 Beta，也不会继续积累新的告警债务。
