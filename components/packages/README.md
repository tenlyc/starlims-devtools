# Local shared MCP release candidate

`tenlyc-starlims-mcp-0.5.2.tgz` is the npm pack output of the separate starlims-mcp repository, not a second maintained implementation. Its full source commit and SHA-256 are recorded in `../shared-components.lock.json`; npm integrity is recorded in package-lock.json.

Independent repository publication is pending authorization. This committed artifact makes local installs reproducible without referring to an unpublished remote tag. After that release is published, advance the dependency to its immutable Git tag and rerun integration tests. Do not edit or repack this archive in DevTools; make changes in starlims-mcp first.
