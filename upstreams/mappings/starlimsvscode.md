# starlimsvscode integration map

Source: https://github.com/MrDoe/starlimsvscode

This repository is a reference implementation, not a runtime dependency. It
does not publish versioned releases, so DevTools records the last reviewed
commit and selectively ports compatible behavior.

| Change category | Default action |
| --- | --- |
| SSL rules, built-ins, regression cases | Review and port data/tests |
| SCM API contracts and backend scripts | Manual STARLIMS compatibility review |
| Checkout/check-in and language handling | Port behind DevTools services and write gates |
| VS Code commands, TreeView, Webview, activation | Do not copy; reimplement only when needed |
| Branding, settings, packaging | Ignore |

Copied or derived source must retain MIT attribution and record its source
commit. Whole-repository merges and direct imports from VS Code APIs are not
allowed. `scripts/upstreams/audit-starlimsvscode.mjs` classifies upstream
changes so reviewers can decide what should be ported. After the selected
changes and tests have been reviewed, advance the baseline with
`npm run upstream:accept:starlimsvscode -- <commit> --confirm-reviewed`.
