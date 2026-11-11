const fs = require('fs/promises');
const { test, expect } = process.env.NIGHTOWL_PACKAGED_APP
  ? require('../fixtures/packaged-electron-app') : require('../fixtures/electron-app');

test('resource profiler samples real processes, captures a bounded trace and stops on close', async ({ appPage, electronApp }, testInfo) => {
  test.setTimeout(90000);
  await appPage.waitForFunction(() => window.NightOwlResourceProfiler && window.editor?.getModel);
  const appWindow = await electronApp.browserWindow(appPage);
  await appWindow.evaluate(win => { win.setFocusable(true); win.show(); win.focus(); });
  await appPage.evaluate(() => window.switchToMode('editor'));
  await appPage.locator('#resource-profiler-toggle').click();
  const panel = appPage.locator('#resource-profiler');
  await expect(panel).toBeVisible();
  await expect(panel.locator('tbody tr')).not.toHaveCount(0);
  await expect.poll(() => appPage.evaluate(() => window.NightOwlResourceProfiler.getReport().samples.length)).toBeGreaterThan(1);
  await expect.poll(() => appPage.evaluate(() => window.NightOwlResourceProfiler.getReport().samples.at(-1)?.cpuPercent)).not.toBeNull();
  const first = await appPage.evaluate(() => window.NightOwlResourceProfiler.getReport());
  expect(first.samples.at(-1).processes.some(item => item.type === 'Browser')).toBe(true);
  expect(first.samples.at(-1).cpuPercent).not.toBeNull();
  await panel.getByRole('button', { name: 'Pause', exact: true }).click();
  const count = await appPage.evaluate(() => window.NightOwlResourceProfiler.getReport().samples.length);
  // Deliberate waiting verifies absence of background work across a full polling interval.
  await appPage.waitForTimeout(2300);
  expect(await appPage.evaluate(() => window.NightOwlResourceProfiler.getReport().samples.length)).toBe(count);
  await panel.getByRole('button', { name: 'Resume', exact: true }).click();
  await panel.getByRole('button', { name: 'Record 30s trace', exact: true }).click();
  await expect(panel.locator('.resource-trace-status')).toContainText('recording');
  await appPage.waitForTimeout(10000);
  await appPage.evaluate(() => {
    window.__resourceWorkloadStarted = new Date().toISOString();
    window.editor.setValue('# Resource profiling fixture\n\n' + Array.from({ length: 600 }, (_, i) => `## Section ${i}\n\nA fixed paragraph with **formatting** and a list.\n\n- One\n- Two\n`).join('\n'));
  });
  for (let i = 0; i < 5; i++) {
    await appPage.evaluate(i => {
      const model = window.editor.getModel();
      window.editor.executeEdits('resource-test', [{ range: new window.monaco.Range(1, 1, 1, 1), text: `<!-- edit ${i} -->\n` }]);
      window.updatePreviewAndStructure(model.getValue());
    }, i);
    await appPage.waitForTimeout(1000);
  }
  await expect(panel.locator('.resource-trace-status')).toContainText('Trace saved:', { timeout: 40000 });
  const report = await appPage.evaluate(() => ({ ...window.NightOwlResourceProfiler.getReport(), workloadStarted: window.__resourceWorkloadStarted }));
  const saved = report.samples.at(-1).trace.last.path;
  const trace = JSON.parse(await fs.readFile(saved, 'utf8'));
  expect(trace.traceEvents.length).toBeGreaterThan(0);
  await fs.writeFile(testInfo.outputPath('resource-report.json'), JSON.stringify(report, null, 2));
  await fs.copyFile(saved, testInfo.outputPath('chromium-trace.json'));
  const dismiss = appPage.getByRole('button', { name: 'Dismiss', exact: true });
  if (await dismiss.isVisible()) await dismiss.click();
  await panel.screenshot({ path: testInfo.outputPath('resource-profiler.png') });
  await panel.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(panel).toHaveCount(0);
  const closedCount = await appPage.evaluate(() => window.NightOwlResourceProfiler.getReport().samples.length);
  await appPage.waitForTimeout(2300);
  expect(await appPage.evaluate(() => window.NightOwlResourceProfiler.getReport().samples.length)).toBe(closedCount);
});
