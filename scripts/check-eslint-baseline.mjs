import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ESLint } from 'eslint';

const root = resolve('.');
const baseline = JSON.parse(await readFile(resolve(root, 'quality/eslint-baseline.json'), 'utf8'));
const eslint = new ESLint({ cwd: root, extensions: ['.ts', '.tsx'] });
const results = await eslint.lintFiles(['src']);
const warnings = results.reduce((total, result) => total + result.warningCount, 0);
const errors = results.reduce((total, result) => total + result.errorCount + result.fatalErrorCount, 0);

if (errors > baseline.maxErrors || warnings > baseline.maxWarnings) {
  console.error(`ESLint baseline exceeded: ${errors} error(s), ${warnings} warning(s); allowed ${baseline.maxErrors}/${baseline.maxWarnings}.`);
  process.exit(1);
}

console.log(`ESLint baseline passed: ${errors} error(s), ${warnings}/${baseline.maxWarnings} warning(s).`);
