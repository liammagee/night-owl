#!/usr/bin/env node
// A bounded local diagnostic, not a CI CPU threshold: host contention is noisy.
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const { launchIsolatedElectronApp, closeElectronApp } = require('../tests/e2e/fixtures/electron-app');
const { _electron: electron } = require('@playwright/test');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function launchProfileApp() {
  if (!process.env.NIGHTOWL_PACKAGED_APP) return launchIsolatedElectronApp();
  const profilePath = await fs.mkdtemp(path.join(os.tmpdir(), 'nightowl-idle-profile-'));
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !['ELECTRON_RUN_AS_NODE', 'NODE_OPTIONS'].includes(key) && !/(API_KEY|ACCESS_TOKEN)$/.test(key)));
  let app;
  try {
    app = await electron.launch({
      executablePath: path.join(process.env.NIGHTOWL_PACKAGED_APP, 'Contents/MacOS/NightOwl'),
      cwd: profilePath,
      env: { ...env, NODE_ENV: 'test', NIGHTOWL_DISABLE_SINGLE_INSTANCE: '1', NIGHTOWL_WORKSPACE_USER_DATA_DIR: profilePath }
    });
  } catch (error) { await fs.rm(profilePath, { recursive: true, force: true }); throw error; }
  return { app, async close() { await closeElectronApp(app); await fs.rm(profilePath, { recursive: true, force: true }); } };
}
async function main() {
  const label = (process.argv[2] || 'capture').replace(/[^a-z0-9-]/gi, '-');
  const output = path.resolve(__dirname, '../test-results/idle-rendering', label);
  await fs.mkdir(output, { recursive: true });
  const launched = await launchProfileApp();
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => window.editor?.getModel && window.TechneBackdrop && window.nightowlRendererActivity);
    await page.evaluate(() => window.switchToMode('editor'));
    await launched.app.evaluate(({ app, BrowserWindow }) => {
      app.focus({ steal: true }); const win = BrowserWindow.getAllWindows()[0]; win.show(); win.focus();
    });
    await page.evaluate(() => {
      window.__idleFrameCounts = {};
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = callback => raf(time => {
        const name = callback.name || 'anonymous';
        window.__idleFrameCounts[name] = (window.__idleFrameCounts[name] || 0) + 1;
        callback(time);
      });
    });
    let captureNumber = 0;
    const capture = async name => {
      const win = await launched.app.browserWindow(page);
      await win.evaluate(win => { win.setFocusable(true); win.show(); win.focus(); });
      await launched.app.evaluate(({ app }) => app.focus({ steal: true }));
      await page.bringToFront();
      await page.waitForFunction(() => window.nightowlRendererActivity.isActive(), undefined, { timeout: 10000 });
      // Exercise a real input/resume before measuring the subsequent idle state.
      await page.mouse.move(450 + (++captureNumber * 30), 250);
      await delay(5000); // Settle startup, theme transitions and the idle deadline.
      await page.evaluate(() => { window.__idleFrameCounts = {}; });
      const samples = [];
      for (let i = 0; i < 6; i++) {
        samples.push(await launched.app.evaluate(({ app }) => ({ at: Date.now(), processes: app.getAppMetrics() })));
        if (i < 5) await delay(2000);
      }
      const ui = await page.evaluate(() => ({
        startupState: document.documentElement.dataset.nightOwlStartupState,
        classes: document.body.className, active: window.nightowlRendererActivity.isActive(),
        activity: window.nightowlRendererActivity.getDiagnostics?.(),
        frames: window.__idleFrameCounts,
        backdrop: window.TechneBackdrop.getDiagnostics?.(),
        animations: document.getAnimations().filter(a => a.playState === 'running').slice(0,30)
          .map(a => ({ name: a.animationName, target: a.effect?.target?.id || a.effect?.target?.className })),
        mode: document.body.dataset.nightowlMode,
        backgroundDisplay: getComputedStyle(document.getElementById('techne-background')).display
      }));
      if (!ui.active) throw new Error('Idle capture lost native window focus; repeat with the editor focused.');
      const first = samples[0], last = samples.at(-1), seconds = (last.at-first.at)/1000;
      const perProcess = last.processes.map(p => {
        const old = first.processes.find(o => o.pid === p.pid && o.creationTime === p.creationTime);
        const corePercent = old && Number.isFinite(p.cpu.cumulativeCPUUsage) && Number.isFinite(old.cpu.cumulativeCPUUsage)
          ? 100*(p.cpu.cumulativeCPUUsage-old.cpu.cumulativeCPUUsage)/seconds : null;
        return { pid:p.pid, type:p.type, name:p.name, corePercent, workingSetMiB:(p.memory?.workingSetSize||0)/1024 };
      });
      const result = { name, seconds, ui, perProcess, corePercent:perProcess.reduce((n,p)=>n+(p.corePercent||0),0), samples };
      console.log(JSON.stringify({ name, corePercent:result.corePercent, frames:ui.frames, backgroundDisplay:ui.backgroundDisplay, activity:ui.activity, backdrop:ui.backdrop }));
      return result;
    };
    const defaultClasses = await page.evaluate(() => document.body.className);
    const scenarios = [await capture('default-editor-idle')];
    await page.evaluate(() => { window.appSettings.theme = 'techne'; window.applyTheme('techne'); });
    scenarios.push(await capture('visible-backdrop-idle'));
    const report = { label, appPath: process.env.NIGHTOWL_PACKAGED_APP || 'source checkout', generatedAt:new Date().toISOString(), logicalCPUs:os.cpus().length, defaultClasses, scenarios };
    await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
    await page.screenshot({path:path.join(output,'idle-editor.png')});
  } finally { await launched.close(); }
}
main().catch(error => { console.error(error); process.exitCode=1; });
