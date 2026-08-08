'use strict';

const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  launchIsolatedElectronApp,
  test,
  expect
} = require('./fixtures/electron-app');
const {
  DEFAULT_BUDGETS,
  summarizeSamples
} = require('../../orchestrator/modules/performance-budgets');
const packageJson = require('../../package.json');

const isHeadlessLinux = process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY;
const SAMPLE_COUNT = Math.max(3, Number(process.env.NIGHTOWL_PERF_SAMPLES) || 3);
const REPORT_DIR = path.resolve(__dirname, '../../test-results/performance');
const REPORT_PATH = path.join(REPORT_DIR, 'nightowl-performance-report.json');

const FIXTURES = Object.freeze({
  markdownSmall: '# Benchmark note\n\nA short paragraph with **formatting** and [a link](https://example.com).',
  markdownLarge: Array.from({ length: 5000 }, (_, index) => [
    `## Section ${index + 1}`,
    '',
    'This fixed paragraph exercises Markdown parsing, preview replacement, links, emphasis, and a moderately large Monaco model.',
    '',
    `- item ${index + 1}.1`,
    `- item ${index + 1}.2`
  ].join('\n')).join('\n\n'),
  jsonlLarge: Array.from({ length: 1200 }, (_, index) => JSON.stringify({
    item_id: `item-${String(index + 1).padStart(4, '0')}`,
    category: index % 2 ? 'interpretation' : 'evidence',
    prompt: `Review fixed benchmark record ${index + 1}`,
    response: `This is deterministic response text for record ${index + 1}.`,
    score: index % 5
  })).join('\n'),
  csvLarge: [
    'item_id,category,prompt,response,score',
    ...Array.from({ length: 1200 }, (_, index) => [
      `item-${String(index + 1).padStart(4, '0')}`,
      index % 2 ? 'interpretation' : 'evidence',
      `Review fixed benchmark record ${index + 1}`,
      `Deterministic response text ${index + 1}`,
      index % 5
    ].map(value => `"${String(value).replaceAll('"', '""')}"`).join(','))
  ].join('\n'),
  presentationSmall: '# First benchmark slide\n\nSmall deck.\n\n---\n\n# Second benchmark slide\n\nReady.',
  presentationLarge: Array.from({ length: 35 }, (_, index) => [
    `# Benchmark slide ${index + 1}`,
    '',
    'A deterministic presentation paragraph used to exercise parsing, layout, and complete-slide fitting.',
    '',
    `- point ${index + 1}.1`,
    `- point ${index + 1}.2`
  ].join('\n')).join('\n\n---\n\n')
});

function fixtureMetadata(name, content) {
  return {
    name,
    bytes: Buffer.byteLength(content, 'utf8'),
    characters: content.length,
    lines: content.split(/\r?\n/).length,
    records: name.startsWith('jsonl') ? content.split('\n').filter(Boolean).length
      : name.startsWith('csv') ? Math.max(0, content.split('\n').length - 1)
        : null,
    slides: name.startsWith('presentation') ? content.split(/^---\s*$/m).length : null
  };
}

async function waitForNightOwlReady(page) {
  await page.waitForSelector('#editor-container', { timeout: 30000 });
  await page.waitForFunction(() => (
    document.documentElement.dataset.nightOwlStartupState === 'ready' &&
    Boolean(window.editor?.setValue || document.querySelector('#editor-container textarea')) &&
    typeof window.NightOwlPerformance?.getReadinessRecords === 'function'
  ), undefined, { timeout: 30000 });
}

async function collectAppDiagnostics(page) {
  return page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0] || null;
    return {
      editorReady: Boolean(window.editor?.getModel?.() || window.editor?.setValue),
      featureLoaderReady: Boolean(window.NightOwlFeatures),
      startupState: document.documentElement.dataset.nightOwlStartupState || null,
      navigation: navigation ? {
        domInteractive: navigation.domInteractive,
        domContentLoadedEventEnd: navigation.domContentLoadedEventEnd,
        loadEventEnd: navigation.loadEventEnd
      } : null,
      readinessRecords: window.NightOwlPerformance?.getReadinessRecords?.() || []
    };
  });
}

function metadataMatches(metadata, expected) {
  return Object.entries(expected).every(([key, value]) => metadata?.[key] === value);
}

async function measureReadiness(page, name, action, expectedMetadata = {}) {
  const before = await page.evaluate(readinessName => (
    window.NightOwlPerformance.getReadinessRecords(readinessName).length
  ), name);
  await action();
  await page.waitForFunction(({ readinessName, offset, expected }) => {
    const records = window.NightOwlPerformance.getReadinessRecords(readinessName).slice(offset);
    return records.some(record => record.status !== 'cancelled' && Object.entries(expected).every(
      ([key, value]) => record.metadata?.[key] === value
    ));
  }, { readinessName: name, offset: before, expected: expectedMetadata }, { timeout: 30000 });
  const record = await page.evaluate(({ readinessName, offset, expected }) => (
    window.NightOwlPerformance.getReadinessRecords(readinessName)
      .slice(offset)
      .filter(candidate => candidate.status !== 'cancelled' && Object.entries(expected).every(
        ([key, value]) => candidate.metadata?.[key] === value
      ))
      .at(-1)
  ), { readinessName: name, offset: before, expected: expectedMetadata });
  if (record.status !== 'ready') {
    throw new Error(`${name} ended as ${record.status}: ${record.metadata?.error || record.metadata?.reason || 'unknown'}`);
  }
  if (!metadataMatches(record.metadata, expectedMetadata)) {
    throw new Error(`${name} readiness metadata did not identify the requested workflow`);
  }
  return record.durationMs;
}

async function openDocument(page, filePath, content) {
  return page.evaluate(({ requestedPath, source }) => window.openFileInEditor(
    requestedPath,
    source,
    { source: 'performance-benchmark', refreshExistingTabContent: true }
  ), { requestedPath: filePath, source: content });
}

async function benchmarkFileSwitch(page, filePath, content) {
  return measureReadiness(
    page,
    'file-switch',
    () => openDocument(page, filePath, content),
    { filePath }
  );
}

async function benchmarkPreview(page, filePath, content) {
  await openDocument(page, filePath, content);
  return measureReadiness(
    page,
    'preview-ready',
    () => page.evaluate(({ requestedPath, source }) => window.updatePreviewAndStructure(
      source,
      { filePath: requestedPath, allowPathMismatch: true, force: true }
    ), { requestedPath: filePath, source: content }),
    { filePath }
  );
}

async function benchmarkStructured(page, filePath, content) {
  const duration = await measureReadiness(
    page,
    'preview-ready',
    () => openDocument(page, filePath, content),
    { filePath, renderer: 'records' }
  );
  await expect(page.locator('#jsonl-record-mode')).not.toHaveClass(/nightowl-ui-hidden/);
  await expect(page.locator('#jsonl-record-list .jsonl-record-list-item').first()).toBeVisible();
  return duration;
}

async function benchmarkPresentationReady(page, filePath, content, expectedSlides) {
  await page.evaluate(() => window.switchToMode('editor'));
  await openDocument(page, filePath, content);
  const duration = await measureReadiness(
    page,
    'presentation-ready',
    () => page.evaluate(() => window.switchToMode('presentation'))
  );
  await expect(page.locator('#presentation-root')).toHaveAttribute('data-presentation-load-state', 'ready');
  await expect(page.locator('#presentation-root [data-slide-index]')).toHaveCount(expectedSlides);
  return duration;
}

async function benchmarkPresentationFit(page, filePath, content, expectedSlides) {
  await benchmarkPresentationReady(page, filePath, content, expectedSlides);
  const duration = await measureReadiness(
    page,
    'presentation-fit',
    () => page.locator('.presentation-present-btn').click()
  );
  await expect(page.locator('.presentation-stage')).toHaveAttribute('data-fit-state', 'ready');
  const contained = await page.evaluate(() => {
    const stage = document.querySelector('.presentation-stage')?.getBoundingClientRect();
    const slide = document.querySelector('.presentation-current-slide')?.getBoundingClientRect();
    return Boolean(stage && slide && slide.width > 0 && slide.height > 0 &&
      slide.left >= stage.left - 1 && slide.top >= stage.top - 1 &&
      slide.right <= stage.right + 1 && slide.bottom <= stage.bottom + 1);
  });
  expect(contained).toBe(true);
  await page.getByRole('button', { name: 'Exit presentation' }).click();
  return duration;
}

test.describe('Performance budget matrix', () => {
  test.skip(isHeadlessLinux || process.env.HEADLESS, 'Electron performance benchmarks require a desktop display');

  test('reports p50 and p95 readiness across fixed document sizes', async ({ appPage, electronApp }) => {
    test.setTimeout(6 * 60 * 1000);
    await waitForNightOwlReady(appPage);

    const samples = Object.fromEntries(Object.keys(DEFAULT_BUDGETS).map(name => [name, []]));
    const correctnessFailures = [];
    const runScenario = async (name, operation) => {
      try {
        for (let sample = 0; sample < SAMPLE_COUNT; sample += 1) {
          samples[name].push(await operation(sample));
        }
      } catch (error) {
        correctnessFailures.push({ scenario: name, message: error.message });
      }
    };

    const initialDiagnostics = await collectAppDiagnostics(appPage);
    const initialStartup = initialDiagnostics.readinessRecords
      .filter(record => record.name === 'startup' && record.status === 'ready')
      .at(-1);
    if (initialStartup) samples['startup.small'].push(initialStartup.durationMs);
    else correctnessFailures.push({ scenario: 'startup.small', message: 'Initial app emitted no startup-ready record' });

    while (samples['startup.small'].length < SAMPLE_COUNT) {
      let launched;
      try {
        launched = await launchIsolatedElectronApp({ profilePrefix: 'nightowl-perf-startup-' });
        const page = await launched.app.firstWindow();
        await page.waitForLoadState('domcontentloaded');
        await waitForNightOwlReady(page);
        const diagnostics = await collectAppDiagnostics(page);
        const record = diagnostics.readinessRecords
          .filter(candidate => candidate.name === 'startup' && candidate.status === 'ready')
          .at(-1);
        if (!record) throw new Error('Fresh app emitted no startup-ready record');
        samples['startup.small'].push(record.durationMs);
      } catch (error) {
        correctnessFailures.push({ scenario: 'startup.small', message: error.message });
        break;
      } finally {
        await launched?.close();
      }
    }

    await runScenario('file-switch.markdown.small', sample => benchmarkFileSwitch(
      appPage, `/virtual-workspace/perf-small-${sample}.md`, FIXTURES.markdownSmall
    ));
    await runScenario('file-switch.markdown.large', sample => benchmarkFileSwitch(
      appPage, `/virtual-workspace/perf-large-${sample}.md`, FIXTURES.markdownLarge
    ));
    await runScenario('preview.markdown.small', sample => benchmarkPreview(
      appPage, `/virtual-workspace/preview-small-${sample}.md`, FIXTURES.markdownSmall
    ));
    await runScenario('preview.markdown.large', sample => benchmarkPreview(
      appPage, `/virtual-workspace/preview-large-${sample}.md`, FIXTURES.markdownLarge
    ));
    await runScenario('structured.jsonl.large', sample => benchmarkStructured(
      appPage, `/virtual-workspace/records-${sample}.jsonl`, FIXTURES.jsonlLarge
    ));
    await runScenario('structured.csv.large', sample => benchmarkStructured(
      appPage, `/virtual-workspace/records-${sample}.csv`, FIXTURES.csvLarge
    ));
    await runScenario('presentation-ready.small', sample => benchmarkPresentationReady(
      appPage, `/virtual-workspace/deck-small-${sample}.md`, FIXTURES.presentationSmall, 2
    ));
    await runScenario('presentation-ready.large', sample => benchmarkPresentationReady(
      appPage, `/virtual-workspace/deck-large-${sample}.md`, FIXTURES.presentationLarge, 35
    ));
    await runScenario('presentation-fit.large', sample => benchmarkPresentationFit(
      appPage, `/virtual-workspace/deck-fit-${sample}.md`, FIXTURES.presentationLarge, 35
    ));

    const scenarioResults = Object.fromEntries(Object.entries(samples).map(([name, values]) => [
      name,
      summarizeSamples(values, DEFAULT_BUDGETS[name])
    ]));
    const electron = await electronApp.evaluate(() => ({
      electron: process.versions.electron,
      chrome: process.versions.chrome
    }));
    const report = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      sampleCount: SAMPLE_COUNT,
      build: {
        gitSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
        appVersion: packageJson.version,
        node: process.version,
        ...electron
      },
      machine: {
        platform: os.platform(),
        release: os.release(),
        architecture: os.arch(),
        cpuModel: os.cpus()[0]?.model || 'unknown',
        cpuCount: os.cpus().length,
        memoryBytes: os.totalmem()
      },
      fixtures: Object.fromEntries(Object.entries(FIXTURES).map(([name, content]) => [
        name,
        fixtureMetadata(name, content)
      ])),
      thresholds: {
        semantics: {
          correctnessFailure: 'A required view or state did not become usable.',
          warning: 'p95 exceeded warningMs; record as noisy signal without failing the job.',
          regression: 'p95 exceeded regressionMs; fail the benchmark job.'
        },
        budgets: DEFAULT_BUDGETS
      },
      scenarios: scenarioResults,
      correctnessFailures
    };

    await fs.mkdir(REPORT_DIR, { recursive: true });
    await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`NightOwl performance report: ${REPORT_PATH}`);
    for (const [name, result] of Object.entries(scenarioResults)) {
      console.log(`${result.status.toUpperCase()} ${name}: p50=${result.p50Ms?.toFixed(1)}ms p95=${result.p95Ms?.toFixed(1)}ms`);
    }

    const regressions = Object.entries(scenarioResults)
      .filter(([, result]) => result.status === 'regression')
      .map(([name]) => name);
    expect(correctnessFailures).toEqual([]);
    expect(regressions).toEqual([]);
  });
});
