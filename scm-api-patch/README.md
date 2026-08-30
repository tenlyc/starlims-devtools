# SCM_API History Patch (SCM_API_History.sdp) / 历史补丁说明

> [!IMPORTANT]
> **Legacy source only / 仅保留作历史源码。** Current releases merge these capabilities into the single generated `SCM_API.sdp`; users should not install this patch separately. 当前版本已把相关能力合并进唯一生成的 `SCM_API.sdp`，用户不应再单独安装本补丁。

Incremental STARLIMS deployment package extending the `SCM_API` HTTP backend,
powering the **Version History / Labels / Compare / Recover** features of
STARLIMS DevTools (mirrors of the official *Source Control Manager*
application's `dsGetHistory`, `dsGetLabelsForItem`,
`scGetCodeFromLimsSourceControl` and `scRecoverOldVersion`).

## What it adds

| Endpoint | Description | Write? |
|----------|-------------|--------|
| `SCM_API.GetItemHistory.<suffix>?URI=<enterprise uri>` | Version history of an item from `LIMSSOURCECONTROL` + `LIMSVERSIONS` (checkout/checkin dates, users, reasons, version numbers, version GUID) | read |
| `SCM_API.GetItemLabels.<suffix>?URI=<enterprise uri>` | Labels attached to an item from `VERSIONSLABELS` / `VERSIONSLABELS_ITEMS` | read |
| `SCM_API.GetItemVersionCode.<suffix>?VERSIONID=<guid>` | Code / XFD / resource documents of a specific version from `LIMSSOURCECONTROL` | read |
| `SCM_API.GetSCMItems.<suffix>?itemName=&types=&checkedOutOnly=` | **New** SCM overview query mirroring the official `dsGetItemsFromSearch` data source: every manageable item with its checkout state (for the Source Control tree) | read |
| `SCM_API.RecoverVersion.<suffix>?URI=<uri>&VERSIONID=<guid>&Reason=<reason>` | Recover an old version into the current version (copies documents into a new version and updates the live item tables) | **write** |
| `SCM_API.ExportItems.<suffix>?items=<uri1,uri2,...>` | **New** export flow matching the official SCM "Send to Package Manager": packages the live (checked-in / current) code of the selected enterprise items into an SDP for cross-environment deployment | write (package) |
| `SCM_API.ExportPackage.<suffix>?items=<guid1,guid2,...>` | **Patched** original endpoint: optional `items` parameter limits the pending-check-in export to the selected item GUIDs; without it all pending check-ins are exported as before | write (package) |

## 中文摘要

该目录记录版本历史、标签、远端比较、版本恢复和按项目导出等功能的早期增量包来源。当前构建会把这些脚本与上游基础包、自有 `Mcp*` 扩展一起生成到 `release/SCM_API.sdp`。保留本目录是为了来源审计和兼容性追踪，不代表需要部署第二个 SDP。

恢复版本与导出包属于写入操作，必须经过 DevTools 权限审批和质量门禁，并先在测试环境验证。

`ItemBehaviour` is `merge` for the new scripts; `ExportPackage` uses
`overwrite` with the original item GUID so it replaces the shipped version.

## Install

1. In STARLIMS, import `SCM_API_History.sdp` (Administration → Import/Export,
   or via DevTools: SCM Package Manager → Import Package).
2. If STARLIMS asks about layer / overwrite, keep `merge` behaviour.
3. Restart the STARLIMS web application pool if the new endpoints do not
   appear immediately.

## Verify

After import, the following should return a JSON response:

```
<STARLIMS_URL>/SCM_API.Version.<suffix>
<STARLIMS_URL>/SCM_API.GetItemHistory.<suffix>?URI=ServerScripts/<Category>/<Name>
```

## Rebuilding

The package is a plain ZIP containing `manifest.xml` and
`Server Scripts/SCM_API/*.srvscr`:

```bash
cd scm-api-patch
zip -r SCM_API_History.sdp manifest.xml "Server Scripts"
```

The three `.srvscr` files pass the DevTools SSL LSP parser
(`npx tsx scripts/ssl-lsp-smoke-test.ts` style validation).
