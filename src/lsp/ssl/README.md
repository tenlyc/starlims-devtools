# SSL language core

These modules are synchronized from `MrDoe/starlimsvscode` commit `92b9014244eb09a56ed589db5155c3b7914b70a2` and adapted to use `vscode-languageserver-types` without the VS Code server transport.

The Monaco integration lives in `src/services/sslLanguageFeatures.ts`. Keep behavioral changes in the adapter when possible so the core files can be compared with future upstream revisions.

Upstream copyright: Marius Popovici and Christoph Döllinger. MIT License.
