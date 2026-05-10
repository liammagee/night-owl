#!/usr/bin/env node

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

const GENERATED_DIRS = [
  '.claude/worktrees/',
  'coverage/',
  'dist/',
  'node_modules/',
  'out/',
  'playwright-report/',
  'test-results/',
  'test-reports/'
];

const REQUIRED_GITIGNORE_ENTRIES = [
  '.DS_Store',
  '.claude',
  'dist/',
  'node_modules',
  'out/',
  'playwright-report/',
  'test-results/',
  'test-reports/'
];

const REQUIRED_JEST_IGNORES = [
  '<rootDir>/.claude/',
  '<rootDir>/playwright-report/',
  '<rootDir>/test-results/'
];

function readRepoFile(filePath) {
  return fs.readFileSync(path.join(repoRoot, filePath), 'utf8');
}

function git(args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
}

function assertIncludes(source, needles, label) {
  const missing = needles.filter(needle => !source.includes(needle));
  if (missing.length > 0) {
    throw new Error(`${label} missing required entries: ${missing.join(', ')}`);
  }
}

function assertNoTrackedGeneratedDirs() {
  const trackedFiles = git(['ls-files'])
    .split(/\r?\n/)
    .filter(Boolean);
  const offenders = trackedFiles.filter(file => (
    GENERATED_DIRS.some(dir => file === dir.replace(/\/$/, '') || file.startsWith(dir))
  ));

  if (offenders.length > 0) {
    throw new Error(`Generated files are tracked: ${offenders.slice(0, 20).join(', ')}`);
  }
}

function main() {
  assertIncludes(readRepoFile('.gitignore'), REQUIRED_GITIGNORE_ENTRIES, '.gitignore');
  assertIncludes(readRepoFile('jest.config.js'), REQUIRED_JEST_IGNORES, 'jest.config.js');
  assertIncludes(readRepoFile('scripts/quality-metrics.js'), ['--exclude-standard'], 'quality-metrics.js');
  assertNoTrackedGeneratedDirs();
  console.log('Quality static checks passed');
}

if (require.main === module) {
  main();
}

module.exports = {
  GENERATED_DIRS,
  REQUIRED_GITIGNORE_ENTRIES,
  REQUIRED_JEST_IGNORES,
  main
};
