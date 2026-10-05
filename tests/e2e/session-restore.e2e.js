const { test, expect, _electron: electron } = require('@playwright/test');
const fs = require('fs');
const os = require('os');
const path = require('path');

test.describe('Editor session across process restarts', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY,
    'Electron needs a Linux display server');
  let root, workspace, profile, firstFile, lastFile, app, page;

  async function launch() {
    const { ELECTRON_RUN_AS_NODE, ...env } = process.env;
    app = await electron.launch({
      executablePath: process.env.NIGHTOWL_SESSION_TEST_EXECUTABLE || require('electron'),
      args: [...(process.env.NIGHTOWL_SESSION_TEST_EXECUTABLE ? [] : [path.resolve(__dirname, '../..')]),
        workspace, `--user-data-dir=${profile}`],
      env: { ...env, NODE_ENV: 'test', NIGHTOWL_WORKSPACE_USER_DATA_DIR: profile, NIGHTOWL_DISABLE_SINGLE_INSTANCE: '1' },
      timeout: 30000
    });
    page = await app.firstWindow();
    await page.waitForFunction(() => window.editor && window.tabManager?._initialized
      && !window.tabManager._restoringTabs, null, { timeout: 20000 });
  }

  test.beforeAll(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'nightowl-session-restore-'));
    workspace = path.join(root, 'workspace');
    profile = path.join(root, 'profile');
    fs.mkdirSync(workspace);
    fs.mkdirSync(profile);
    firstFile = path.join(workspace, 'first.md');
    lastFile = path.join(workspace, 'last.md');
    fs.writeFileSync(firstFile, '# First document');
    fs.writeFileSync(lastFile, '# Last document');
    fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({
      workingDirectory: workspace, workspaceFolders: [], currentFile: firstFile,
      autoSave: { enabled: false }, gamification: { enabled: false }
    }));
    await launch();
  });

  test.afterAll(async () => {
    if (app) {
      await app.evaluate(({ app: electronApp }) => electronApp.exit(0)).catch(() => {});
      await app.close().catch(() => {});
    }
    if (root) fs.rmSync(root, { recursive: true, force: true });
  });

  test('a normal quit and same-workspace relaunch retain the last edited tab despite stale preferences', async () => {
    await expect.poll(() => page.evaluate(() => window.tabManager.activeTabPath)).toBe(firstFile);
    await page.evaluate(async (target) => {
      const staleSettings = await (window.electronAPI.settings?.getSettings() || window.electronAPI.invoke('get-settings'));
      const file = await (window.electronAPI.files?.readFile(target) || window.electronAPI.invoke('read-file', target));
      await window.openFileInEditor(target, file.content);
      window.editor.setValue('# Last document\n\nLatest saved edit.');
      await window.saveFile();
      // Theme/settings controls often submit a cached whole-settings object.
      await (window.electronAPI.settings?.setSettings({ ...staleSettings, theme: 'dark' })
        || window.electronAPI.invoke('set-settings', { ...staleSettings, theme: 'dark' }));
    }, lastFile);
    expect(fs.readFileSync(lastFile, 'utf8')).toBe('# Last document\n\nLatest saved edit.');
    await app.close();
    app = null;
    await launch();
    await expect.poll(() => page.evaluate(() => window.tabManager.activeTabPath)).toBe(lastFile);
    expect(await page.evaluate(() => window.editor.getValue())).toBe('# Last document\n\nLatest saved edit.');
    expect(await page.evaluate(() => window.tabManager.tabOrder)).toEqual([firstFile, lastFile]);
  });

  test('renderer reload keeps the last edited file open', async () => {
    await page.evaluate(async (target) => {
      const file = await (window.electronAPI.files?.readFile(target) || window.electronAPI.invoke('read-file', target));
      await window.openFileInEditor(target, file.content);
      window.editor.setValue('# Last document\n\nEdited before reload.');
      await window.saveFile();
    }, lastFile);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.editor && window.tabManager?._initialized
      && !window.tabManager._restoringTabs, null, { timeout: 20000 });
    await expect.poll(() => page.evaluate(() => window.tabManager.activeTabPath)).toBe(lastFile);
    expect(await page.evaluate(() => window.editor.getValue())).toBe('# Last document\n\nEdited before reload.');
    await expect(page.locator('#editor-pane')).toBeVisible();
  });

  test('queued saves remain attached to the original tab when focus changes', async () => {
    await page.evaluate(async ({ first, last }) => {
      window.appSettings.autoSave.enabled = false;
      await window._editorSaveQueue;
      const read = target => window.electronAPI.files?.readFile(target) || window.electronAPI.invoke('read-file', target);
      window.tabManager.createTab(last, (await read(last)).content);
      await window.openFileInEditor(first, (await read(first)).content);
      window.editor.setValue('# First document\n\nSaved from its own tab.');
      let release;
      window._editorSaveQueue = new Promise(resolve => { release = resolve; });
      const pending = window.saveFile();
      window.tabManager.activateTab(last);
      window.editor.setValue('# Last document\n\nKeep these other edits.');
      release();
      await pending;
    }, { first: firstFile, last: lastFile });
    expect(fs.readFileSync(firstFile, 'utf8')).toBe('# First document\n\nSaved from its own tab.');
    expect(fs.readFileSync(lastFile, 'utf8')).not.toContain('Keep these other edits');
    expect(await page.evaluate(() => window.editor.getValue())).toBe('# Last document\n\nKeep these other edits.');
    expect(await page.evaluate(() => window.tabManager.tabs.get(window.tabManager.activeTabPath).isDirty)).toBe(true);
    await page.evaluate(() => window.saveFile());
  });

  test('an untitled draft is restored as the active document after a restart', async () => {
    await page.evaluate(() => {
      const draft = window.tabManager.createUntitledTab();
      window.tabManager.activateTab(draft);
      window.editor.setValue('An unfinished draft that must reopen.');
    });
    const recoveryFile = path.join(profile, 'recovery', 'unsaved-tabs.json');
    await expect.poll(() => {
      try { return Object.values(JSON.parse(fs.readFileSync(recoveryFile, 'utf8'))).some(entry => entry.content === 'An unfinished draft that must reopen.'); }
      catch { return false; }
    }).toBe(true);
    // Simulate a process restart without accepting a native Save As dialog.
    await app.evaluate(({ app: electronApp }) => electronApp.exit(0));
    await app.close().catch(() => {});
    app = null;
    await launch();
    expect(await page.evaluate(() => window.tabManager.activeTabPath)).toMatch(/^untitled:/);
    expect(await page.evaluate(() => window.editor.getValue())).toBe('An unfinished draft that must reopen.');
    expect(await page.evaluate(() => window.tabManager.tabs.get(window.tabManager.activeTabPath).isDirty)).toBe(true);
  });
});
