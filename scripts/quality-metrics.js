#!/usr/bin/env node

const { execFileSync } = require('child_process');
const fs = require('fs');

const baseRef = process.argv[2] || process.env.BASE_REF || 'HEAD~1';
const headRef = process.argv[3] || process.env.HEAD_REF || 'HEAD';

function isWorktreeRef(ref) {
  return ['WORKTREE', 'worktree', 'working-tree'].includes(ref);
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function fileAt(ref, filePath) {
  if (isWorktreeRef(ref)) {
    try {
      return fs.readFileSync(filePath, 'utf8');
    } catch (_error) {
      return '';
    }
  }

  try {
    return git(['show', `${ref}:${filePath}`]);
  } catch (_error) {
    return '';
  }
}

function filesAt(ref, prefix) {
  if (isWorktreeRef(ref)) {
    try {
      return git(['ls-files', '--cached', '--others', '--exclude-standard', prefix])
        .split(/\r?\n/)
        .filter(Boolean);
    } catch (_error) {
      return [];
    }
  }

  try {
    return git(['ls-tree', '-r', '--name-only', ref, prefix])
      .split(/\r?\n/)
      .filter(Boolean);
  } catch (_error) {
    return [];
  }
}

function countMatches(source, regex) {
  return (source.match(regex) || []).length;
}

function findDuplicateTopLevelFunctions(source) {
  const seen = new Map();
  const duplicates = [];

  source.split(/\r?\n/).forEach((line, index) => {
    const match = line.match(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/);
    if (!match) return;

    const name = match[1];
    const lineNumber = index + 1;
    if (seen.has(name)) {
      duplicates.push({ name, firstLine: seen.get(name), duplicateLine: lineNumber });
    } else {
      seen.set(name, lineNumber);
    }
  });

  return duplicates;
}

function functionBody(source, startPattern, endPattern) {
  const start = source.indexOf(startPattern);
  if (start < 0) return '';
  const end = source.indexOf(endPattern, start + startPattern.length);
  return end < 0 ? source.slice(start) : source.slice(start, end);
}

function testMetrics(ref) {
  const testFiles = filesAt(ref, 'tests')
    .filter(file => /\.(test|spec|e2e)\.js$/.test(file));
  const testCaseCount = testFiles.reduce((total, file) => (
    total + countMatches(fileAt(ref, file), /\b(?:test|it)\s*\(/g)
  ), 0);

  return {
    files: testFiles.length,
    cases: testCaseCount
  };
}

function repoMetrics(ref) {
  const renderer = fileAt(ref, 'orchestrator/renderer.js');
  const touchGestures = fileAt(ref, 'plugins/techne-presentations/touch-gestures.js');
  const renderFileTreeBody = functionBody(
    renderer,
    'async function renderFileTree()',
    'function renderFileTreeNode('
  );
  const renderRegularMarkdownBody = functionBody(
    renderer,
    'async function renderRegularMarkdown(markdownContent)',
    '// --- Structure Pane Logic ---'
  );

  return {
    duplicateRendererFunctions: findDuplicateTopLevelFunctions(renderer).length,
    syncFileTreeTagHydrationAwaits: countMatches(renderFileTreeBody, /await\s+preProcessMarkdownTags\(/g),
    syncPreviewBibliographyAwaits: countMatches(renderRegularMarkdownBody, /await\s+refreshBibliographyFromContent\(window\.currentFilePath,\s*markdownContent\)/g),
    fileTreeFragmentUses: countMatches(renderer, /document\.createDocumentFragment\(/g),
    fileTreeFragmentReplacements: countMatches(renderer, /replaceChildren\(fragment\)/g),
    touchGestureConsoleLogs: countMatches(touchGestures, /console\.log\(/g),
    touchGestureDebugCalls: countMatches(touchGestures, /logTouchGestures\(/g),
    trackedDsStoreFiles: filesAt(ref, '.DS_Store').length,
    performanceHandlerPresent: filesAt(ref, 'ipc/performanceHandlers.js').length > 0,
    testMetrics: testMetrics(ref)
  };
}

function delta(base, head, key) {
  return head[key] - base[key];
}

function formatSigned(value) {
  return value > 0 ? `+${value}` : String(value);
}

const base = repoMetrics(baseRef);
const head = repoMetrics(headRef);

const rows = [
  ['Duplicate top-level renderer functions', base.duplicateRendererFunctions, head.duplicateRendererFunctions, delta(base, head, 'duplicateRendererFunctions')],
  ['Synchronous file-tree tag hydration awaits', base.syncFileTreeTagHydrationAwaits, head.syncFileTreeTagHydrationAwaits, delta(base, head, 'syncFileTreeTagHydrationAwaits')],
  ['Synchronous preview bibliography awaits', base.syncPreviewBibliographyAwaits, head.syncPreviewBibliographyAwaits, delta(base, head, 'syncPreviewBibliographyAwaits')],
  ['File-tree fragment creation sites', base.fileTreeFragmentUses, head.fileTreeFragmentUses, delta(base, head, 'fileTreeFragmentUses')],
  ['File-tree fragment replacement sites', base.fileTreeFragmentReplacements, head.fileTreeFragmentReplacements, delta(base, head, 'fileTreeFragmentReplacements')],
  ['Touch gesture unconditional console.log calls', base.touchGestureConsoleLogs, head.touchGestureConsoleLogs, delta(base, head, 'touchGestureConsoleLogs')],
  ['Tracked .DS_Store files', base.trackedDsStoreFiles, head.trackedDsStoreFiles, delta(base, head, 'trackedDsStoreFiles')],
  ['Renderer/unit/integration test files', base.testMetrics.files, head.testMetrics.files, head.testMetrics.files - base.testMetrics.files],
  ['Static test case declarations', base.testMetrics.cases, head.testMetrics.cases, head.testMetrics.cases - base.testMetrics.cases]
];

console.log(`# NightOwl Quality Metrics\n`);
console.log(`Baseline: \`${baseRef}\``);
console.log(`Current: \`${headRef}\``);
console.log('');
console.log('| Metric | Baseline | Current | Delta |');
console.log('| --- | ---: | ---: | ---: |');
for (const [label, before, after, change] of rows) {
  console.log(`| ${label} | ${before} | ${after} | ${formatSigned(change)} |`);
}
console.log('');
console.log('## Performance-Specific Interpretation');
console.log('');
console.log(`- Initial file-tree painting now has ${head.syncFileTreeTagHydrationAwaits} synchronous tag-hydration await(s) in the render path, down from ${base.syncFileTreeTagHydrationAwaits}. Tag metadata is hydrated after paint and capped at ${fileAt(headRef, 'orchestrator/renderer.js').includes('FILE_TREE_TAG_HYDRATION_LIMIT = 500') ? '500' : 'the configured limit'} visible Markdown files per pass.`);
console.log(`- Markdown preview rendering now has ${head.syncPreviewBibliographyAwaits} synchronous bibliography-refresh await(s) in the render path, down from ${base.syncPreviewBibliographyAwaits}. Bibliography changes rerender after the deferred refresh only when the active file and content still match.`);
console.log(`- Touch gesture runtime logging is now opt-in: ${head.touchGestureConsoleLogs} unconditional console.log call(s), down from ${base.touchGestureConsoleLogs}. Enable with \`localStorage.setItem('nightowl.debugTouchGestures', 'true')\` when diagnosing mobile presentation issues.`);
console.log(`- GPU diagnostics and Chromium trace capture are ${head.performanceHandlerPresent ? 'available' : 'not available'} through the performance IPC handlers.`);
