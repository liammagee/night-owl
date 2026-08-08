const fs = require('fs');
const path = require('path');

const RequiredSmokeReporter = require('../../../tests/e2e/reporters/required-smoke-reporter');

describe('required Electron E2E harness', () => {
  test('default config selects only the required Electron matrix', () => {
    const config = require('../../../playwright.config');

    expect(config.testDir).toBe('./tests/e2e/required');
    expect(config.testMatch).toBe('**/*.spec.js');
    expect(config.workers).toBe(1);
    expect(config.fullyParallel).toBe(false);
    expect(config.reporter).toContainEqual([
      './tests/e2e/reporters/required-smoke-reporter.js'
    ]);
  });

  test('packaged config selects only the packaged runtime contract', () => {
    const config = require('../../../playwright.packaged.config');
    const source = fs.readFileSync(
      path.join(__dirname, '../../../tests/e2e/packaged/tutor-core.spec.js'),
      'utf8'
    );

    expect(config.testDir).toBe('./tests/e2e/packaged');
    expect(config.testMatch).toBe('**/*.spec.js');
    expect(config.workers).toBe(1);
    expect(source).toContain("window.electronAPI.invoke('get-tutor-core-status')");
    expect(source).toContain('expect(status.runtimePaths)');
    expect(source).not.toMatch(/sendMessage|generateText|fetch\(/);

    const securitySource = fs.readFileSync(
      path.join(__dirname, '../../../tests/e2e/packaged/content-security.spec.js'),
      'utf8'
    );
    expect(securitySource).toContain('@packaged @content-security');
    expect(securitySource).toContain('malicious-markdown.md');

    const uiStateSource = fs.readFileSync(
      path.join(__dirname, '../../../tests/e2e/packaged/ui-state.spec.js'),
      'utf8'
    );
    expect(uiStateSource).toContain('@packaged @ui-state');
    expect(uiStateSource).toContain('window.NightOwlUIState');
  });

  test('packaging pins tutor-core and excludes its development-only files', () => {
    const packageJson = require('../../../package.json');
    const tutorDependency = packageJson.dependencies['@machinespirits/tutor-core'];

    expect(tutorDependency).toContain('321b9d21686c3cf4d9395524e569fe21ffd40361');
    expect(tutorDependency).not.toMatch(/^file:/);
    expect(packageJson.build.files).toEqual(expect.arrayContaining([
      '!node_modules/@machinespirits/tutor-core/.claude{,/**/*}',
      '!node_modules/@machinespirits/tutor-core/.github{,/**/*}',
      '!node_modules/@machinespirits/tutor-core/.npmignore',
      '!node_modules/@machinespirits/tutor-core/CHANGELOG.md',
      '!node_modules/@machinespirits/tutor-core/package-lock.json',
      '!node_modules/@machinespirits/tutor-core/services/__tests__{,/**/*}',
      '!node_modules/@machinespirits/tutor-core/vitest.config.js'
    ]));
  });

  test('active required tests use current production selectors and cover each contract', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../../tests/e2e/required/primary-workflows.spec.js'),
      'utf8'
    );

    expect(source).toContain('@file-switch');
    expect(source).toContain('@preview');
    expect(source).toContain('@mode-recovery');
    expect(source).toContain('@ui-state');
    expect(source).toContain('@slide-geometry');
    expect(source).toContain('@content-security');
    expect(source).not.toContain('show-presentation-btn');
    expect(source).not.toContain('presentation-view');
    expect(source).not.toContain('process.env.DISPLAY');
  });

  test('required reporter fails empty and wholly skipped runs', () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const empty = new RequiredSmokeReporter();
      empty.onBegin({}, { allTests: () => [] });
      expect(empty.onEnd()).toEqual({ status: 'failed' });

      const skipped = new RequiredSmokeReporter();
      skipped.onBegin({}, { allTests: () => [{ id: 'one' }] });
      skipped.onTestEnd({ id: 'one' }, { status: 'skipped' });
      expect(skipped.onEnd()).toEqual({ status: 'failed' });

      const executed = new RequiredSmokeReporter();
      executed.onBegin({}, { allTests: () => [{ id: 'one' }] });
      executed.onTestEnd({ id: 'one' }, { status: 'passed' });
      expect(executed.onEnd()).toBeUndefined();
    } finally {
      log.mockRestore();
      error.mockRestore();
    }
  });
});
