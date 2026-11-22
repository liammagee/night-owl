const { test, expect } = process.env.NIGHTOWL_PACKAGED_APP
  ? require('../fixtures/packaged-electron-app') : require('../fixtures/electron-app');

test('visible editor decorations become idle, wake on input, and cancel when hidden or disabled', async ({ appPage, electronApp }) => {
  test.setTimeout(60000);
  await appPage.waitForFunction(() => window.nightowlRendererActivity?.trackVisualWork && window.TechneBackdrop?.getDiagnostics);
  await electronApp.evaluate(({ app, BrowserWindow }) => {
    app.focus({ steal: true }); const win = BrowserWindow.getAllWindows()[0]; win.show(); win.focus();
  });
  await appPage.waitForFunction(() => document.documentElement.dataset.nightOwlStartupState === 'ready');
  await appPage.evaluate(async () => { await window.switchToMode('editor'); window.appSettings.theme = 'techne'; window.applyTheme('techne'); });
  await expect(appPage.locator('body')).toHaveClass(/techne-theme/);
  await appPage.mouse.move(450, 250);
  await expect.poll(() => appPage.evaluate(() => window.TechneBackdrop.getDiagnostics().running)).toBe(true);
  await expect.poll(() => appPage.evaluate(() => window.nightowlRendererActivity.getDiagnostics().jobs[0]?.reason), { timeout: 10000 }).toBe('idle');
  const paused = await appPage.evaluate(() => window.TechneBackdrop.getDiagnostics());
  // Check absence of work across many display frames, not just a paused flag.
  await appPage.waitForTimeout(800);
  expect(await appPage.evaluate(() => window.TechneBackdrop.getDiagnostics())).toEqual(paused);
  expect(paused).toMatchObject({ running: false, faunaRunning: false, pendingFrame: false });
  await appPage.evaluate(() => window.editor.focus());
  await appPage.keyboard.type('Idle rendering regression check.');
  expect(await appPage.evaluate(() => window.editor.getValue())).toContain('Idle rendering regression check.');
  await expect.poll(() => appPage.evaluate(() => window.TechneBackdrop.getDiagnostics().frameCount)).toBeGreaterThan(paused.frameCount);
  await appPage.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => appPage.evaluate(() => window.TechneBackdrop.getDiagnostics().running)).toBe(false);
  await appPage.emulateMedia({ reducedMotion: 'no-preference' });
  await appPage.mouse.move(500, 250);
  await expect.poll(() => appPage.evaluate(() => window.TechneBackdrop.getDiagnostics().running)).toBe(true);
  const win = await electronApp.browserWindow(appPage);
  await win.evaluate(win => win.hide());
  await expect.poll(() => appPage.evaluate(() => window.TechneBackdrop.getDiagnostics().running)).toBe(false);
  await win.evaluate(win => { win.show(); win.focus(); });
  await expect.poll(() => appPage.evaluate(() => window.TechneBackdrop.getDiagnostics().running)).toBe(true);
  await appPage.evaluate(() => document.getElementById('techne-background').style.display = 'none');
  await expect.poll(() => appPage.evaluate(() => window.nightowlRendererActivity.getDiagnostics().jobs[0]?.reason)).toBe('view-hidden');
  await appPage.evaluate(() => window.TechneBackdrop.destroy());
  expect(await appPage.evaluate(() => window.nightowlRendererActivity.getDiagnostics().registeredJobs)).toBe(0);
});
