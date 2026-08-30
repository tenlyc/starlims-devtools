# SSL language integration / SSL 语言集成

## English

STARLIMS DevTools uses a hybrid integration:

- Native validation and whole-document formatting are synchronized with
  [`mahoskye/starlims-lsp`](https://github.com/mahoskye/starlims-lsp)
  at the version pinned in `upstreams/upstreams.lock.json` (currently
  **v0.21.0**). The platform binary is downloaded from its GitHub Release at
  build time and verified against the locked SHA-256.
- The TypeScript core in this directory remains the offline fallback and
  supplies Monaco-native hover, completion, document symbols, folding,
  definition, references, rename, inlay hints, code lenses and quick fixes.
  It originated from `MrDoe/starlimsvscode` commit
  `92b9014244eb09a56ed589db5155c3b7914b70a2`.

The Monaco adapter lives in `src/services/sslLanguageFeatures.ts`. Native
diagnostics automatically fall back to the TypeScript core when the upstream
binary is unavailable. `sslLspCompatibility.ts` preserves DevTools-specific
STARLIMS Designer syntax, notably `#include` directives without semicolons.

Both upstream projects are MIT licensed. The native binary's license and
third-party notices are included under `resources/starlims-lsp/` in packaged
applications.

## 简体中文

STARLIMS DevTools 使用混合语言服务架构：

- 原生诊断与全文件格式化同步自 [`mahoskye/starlims-lsp`](https://github.com/mahoskye/starlims-lsp)，版本固定在 `upstreams/upstreams.lock.json`（当前 **v0.21.0**）。构建时从 GitHub Release 下载当前平台二进制并校验锁定的 SHA-256。
- 本目录中的 TypeScript 核心是离线回退，同时提供 Monaco 原生悬停、补全、文档符号、折叠、定义、引用、重命名、内联提示、CodeLens 与快速修复。其来源为 `MrDoe/starlimsvscode` commit `92b9014244eb09a56ed589db5155c3b7914b70a2`。

Monaco 适配器位于 `src/services/sslLanguageFeatures.ts`。原生诊断不可用时自动降级到 TypeScript 核心；`sslLspCompatibility.ts` 保留 STARLIMS Designer 特有语法，尤其是无需分号的 `#include`。

两个上游项目均采用 MIT 许可。打包应用会在 `resources/starlims-lsp/` 中包含原生二进制许可和第三方声明。
