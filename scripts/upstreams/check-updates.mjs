import { writeFile } from 'node:fs/promises';
import { fetchGitHubJson, optionValue, readUpstreamLock, shortSha } from './lib.mjs';

const args = process.argv.slice(2);
const lock = await readUpstreamLock();
const lsp = lock.sources['starlims-lsp'];
const vscode = lock.sources.starlimsvscode;

const [release, releaseCommit, vscodeCommit] = await Promise.all([
  fetchGitHubJson(`repos/${lsp.repository}/releases/latest`),
  fetchGitHubJson(`repos/${lsp.repository}/commits/${encodeURIComponent(lsp.tag)}`),
  fetchGitHubJson(`repos/${vscode.repository}/commits/${encodeURIComponent(vscode.branch)}`)
]);

const lspUpdateAvailable = release.tag_name !== lsp.tag || releaseCommit.sha !== lsp.commit;
const vscodeUpdateAvailable = vscodeCommit.sha !== vscode.commit;
const report = {
  checkedAt: new Date().toISOString(),
  hasUpdates: lspUpdateAvailable || vscodeUpdateAvailable,
  sources: {
    'starlims-lsp': {
      repository: lsp.repository,
      current: { version: lsp.version, tag: lsp.tag, commit: lsp.commit },
      latest: {
        version: String(release.tag_name || '').replace(/^v/, ''),
        tag: release.tag_name,
        commit: releaseCommit.sha,
        publishedAt: release.published_at,
        url: release.html_url
      },
      updateAvailable: lspUpdateAvailable
    },
    starlimsvscode: {
      repository: vscode.repository,
      current: { branch: vscode.branch, commit: vscode.commit },
      latest: {
        branch: vscode.branch,
        commit: vscodeCommit.sha,
        committedAt: vscodeCommit.commit?.committer?.date,
        message: String(vscodeCommit.commit?.message || '').split('\n')[0],
        url: vscodeCommit.html_url
      },
      updateAvailable: vscodeUpdateAvailable
    }
  }
};

const markdown = `# STARLIMS upstream update report

Checked: ${report.checkedAt}

| Source | Integrated | Latest | Status |
| --- | --- | --- | --- |
| starlims-lsp | ${lsp.tag} (${shortSha(lsp.commit)}) | ${release.tag_name} (${shortSha(releaseCommit.sha)}) | ${report.sources['starlims-lsp'].updateAvailable ? 'Update available' : 'Current'} |
| starlimsvscode | ${shortSha(vscode.commit)} | ${shortSha(vscodeCommit.sha)} | ${report.sources.starlimsvscode.updateAvailable ? 'Review required' : 'Current'} |

## Latest starlims-lsp

- Release: ${release.html_url}
- Published: ${release.published_at}
- Assets: ${(release.assets || []).map((asset) => asset.name).join(', ')}

## Latest starlimsvscode commit

- Commit: ${vscodeCommit.html_url}
- Date: ${vscodeCommit.commit?.committer?.date || 'unknown'}
- Message: ${String(vscodeCommit.commit?.message || '').split('\n')[0] || 'unknown'}

This report is metadata-only. No upstream source or executable was run.
`;

const markdownOutput = optionValue(args, '--output');
const jsonOutput = optionValue(args, '--json-output');
if (markdownOutput) await writeFile(markdownOutput, markdown, 'utf8');
if (jsonOutput) await writeFile(jsonOutput, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
if (!markdownOutput) process.stdout.write(markdown);
if (args.includes('--fail-on-update') && report.hasUpdates) process.exitCode = 2;
