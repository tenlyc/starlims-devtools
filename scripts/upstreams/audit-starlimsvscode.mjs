import { writeFile } from 'node:fs/promises';
import { fetchGitHubJson, optionValue, readUpstreamLock, shortSha } from './lib.mjs';

const args = process.argv.slice(2);
const lock = await readUpstreamLock();
const source = lock.sources.starlimsvscode;
const head = optionValue(args, '--to') || source.branch;
const comparison = await fetchGitHubJson(`repos/${source.repository}/compare/${source.commit}...${encodeURIComponent(head)}`, 60_000);

function categoryFor(path) {
  const normalized = path.toLowerCase();
  if (normalized.includes('/server scripts/') || normalized.includes('scm_api') || normalized.includes('/backend/')) return 'SCM API and STARLIMS backend';
  if (normalized.includes('lsp') || normalized.includes('language') || normalized.includes('style') || normalized.includes('builtin')) return 'SSL language rules and inventories';
  if (normalized.includes('test') || normalized.includes('spec')) return 'Regression tests';
  if (normalized.includes('extension') || normalized.includes('webview') || normalized.includes('treeview') || normalized.includes('package.json')) return 'VS Code-specific integration';
  if (normalized.includes('readme') || normalized.includes('license') || normalized.includes('changelog') || normalized.startsWith('docs/')) return 'Documentation and licensing';
  return 'Manual review';
}

const grouped = new Map();
for (const file of comparison.files || []) {
  const category = categoryFor(file.filename);
  if (!grouped.has(category)) grouped.set(category, []);
  grouped.get(category).push(file);
}

const sections = [...grouped.entries()].map(([category, files]) => {
  const lines = files.map((file) => `- \`${file.filename}\` — ${file.status}, +${file.additions}/-${file.deletions}`);
  return `## ${category}\n\n${lines.join('\n')}`;
});
const commits = (comparison.commits || []).map((commit) => `- ${shortSha(commit.sha)} ${String(commit.commit?.message || '').split('\n')[0]}`);
const markdown = `# starlimsvscode selective-port audit

- Repository: https://github.com/${source.repository}
- Integrated commit: ${source.commit}
- Compared head: ${comparison.head_commit?.sha || head}
- Status: ${comparison.status || 'unknown'}
- Commits: ${comparison.total_commits || 0}
- Changed files: ${(comparison.files || []).length}

## Commits

${commits.join('\n') || '- No new commits.'}

${sections.join('\n\n') || 'No changed files.'}

## Review policy

- Port rules, inventories, test cases, and SCM contracts selectively.
- Manually verify STARLIMS version and CHS/ENG behavior for backend changes.
- Do not copy VS Code UI, activation, or packaging code into Electron.
`;

const output = optionValue(args, '--output');
if (output) await writeFile(output, markdown, 'utf8');
else process.stdout.write(markdown);
