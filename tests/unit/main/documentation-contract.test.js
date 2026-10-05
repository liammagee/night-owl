const fs = require('fs');
const path = require('path');
const {
  ALLOWED_INVOKE_CHANNELS,
  ALLOWED_ON_CHANNELS
} = require('../../../preload-ipc-guard');

const ROOT = path.resolve(__dirname, '../../..');
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

describe('architecture and build documentation contract', () => {
  const architecture = read('ARCHITECTURE.md');
  const buildGuide = read('docs/development/BUILD_AND_RELEASE.md');
  const refactoringGuide = read('docs/development/FUTURE_REFACTORING_PLAN.md');
  const packageJson = JSON.parse(read('package.json'));

  test('maps every top-level runtime directory to an owner', () => {
    const runtimeDirectories = [
      'bin', 'build', 'css', 'ipc', 'js', 'lib', 'orchestrator',
      'plugins', 'services', 'styles', 'templates', 'vs'
    ];
    for (const directory of runtimeDirectories) {
      expect(fs.statSync(path.join(ROOT, directory)).isDirectory()).toBe(true);
      expect(architecture).toContain(`| \`${directory}/\` |`);
    }
  });

  test('documents only current fixed IPC examples', () => {
    const invokeChannels = [
      'open-file-path',
      'read-file-content-only',
      'get-settings',
      'terminal-spawn',
      'performance:get-resource-diagnostics',
      'citations-get'
    ];
    invokeChannels.forEach(channel => {
      expect(ALLOWED_INVOKE_CHANNELS.has(channel)).toBe(true);
      expect(architecture).toContain(`\`${channel}\``);
    });
    expect(ALLOWED_ON_CHANNELS.has('switch-to-presentation')).toBe(true);
    expect(architecture).toContain('`switch-to-presentation`');
    expect(architecture).not.toContain('`save-file-content`');
    expect(architecture).not.toContain('`toggle-preview-pane`');
    expect(architecture).not.toContain('invoke: (channel');
  });

  test('records canonical, generated, vendored, and ignored ownership', () => {
    for (const value of [
      'plugins/techne-presentations/src/MarkdownPreziApp.jsx',
      'plugins/techne-presentations/MarkdownPreziApp.js',
      'workplan/items/*.md',
      'workplan/BOARD.md',
      'workplan/board.json',
      'test-results/performance/nightowl-performance-report.json'
    ]) {
      expect(architecture).toContain(value);
      expect(buildGuide).toContain(value);
    }
    expect(architecture).toContain('Generated and tracked');
    expect(architecture).toContain('Generated, ignored');
  });

  test('build guide uses scripts that exist in package.json', () => {
    const requiredScripts = [
      'electron-dev',
      'native:repair',
      'presentation:build',
      'ci:local',
      'ci:local:release',
      'benchmark:performance',
      'dist:check',
      'dist:dir',
      'test:e2e:packaged',
      'dist'
    ];
    requiredScripts.forEach(script => {
      expect(packageJson.scripts[script]).toBeTruthy();
      expect(buildGuide).toContain(`npm run ${script}`);
    });
    expect(buildGuide).toContain('NIGHTOWL_REQUIRE_SIGNING_IDENTITY');
    expect(buildGuide).toContain('NIGHTOWL_REQUIRE_NOTARIZATION_CREDS');
    expect(buildGuide).toContain('.github/workflows/electron-e2e.yml');
    expect(buildGuide).toContain('.github/workflows/release.yml');
  });

  test('refactoring status links directly to authored workplan items', () => {
    const itemIds = [
      'reliable-editor-preview-transitions',
      'fit-presentation-slides-to-viewport',
      'recover-presentation-load-failures',
      'single-source-mode-and-pane-state',
      'decompose-renderer-orchestrator',
      'consolidate-presentation-source-and-styles',
      'resource-lifecycle-ownership',
      'renderer-error-telemetry-and-recovery',
      'minimize-electron-privilege-surface',
      'performance-and-large-document-budgets',
      'schema-driven-record-workflows',
      'refresh-architecture-and-build-docs'
    ];
    itemIds.forEach(id => {
      expect(fs.existsSync(path.join(ROOT, `workplan/items/${id}.md`))).toBe(true);
      expect(refactoringGuide).toContain(`../../workplan/items/${id}.md`);
    });
    expect(refactoringGuide).not.toContain('- [ ]');
  });

  test('removes stale project identity and static readiness claims from current guides', () => {
    const docsIndex = read('docs/README.md');
    const releaseAssessment = read('RELEASE_ASSESSMENT.md');
    const contributing = read('CONTRIBUTING.md');
    const testsReadme = read('tests/README.md');

    expect(architecture).not.toContain('hegel-pedagogy-ai');
    expect(architecture).not.toContain('2500+ lines');
    expect(docsIndex).toContain('# NightOwl documentation');
    expect(docsIndex).not.toContain('174/174');
    expect(releaseAssessment).not.toMatch(/\d+ unit tests passing/);
    expect(contributing).toContain('npm ci');
    expect(testsReadme).toContain('npm run ci:local');
  });
});
