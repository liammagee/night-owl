const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');

test.describe('Editor Theme Inheritance', () => {
  let app;
  let window;

  test.beforeEach(async () => {
    const { ELECTRON_RUN_AS_NODE, ...cleanEnv } = process.env;
    app = await electron.launch({
      args: [path.join(__dirname, '../..')],
      env: { ...cleanEnv, NODE_ENV: 'test' }
    });

    window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await window.waitForSelector('.monaco-editor', { timeout: 15000 });
  });

  test.afterEach(async () => {
    await app.close();
  });

  test('editor background does not inherit presentation bg-color when surface tokens are available', async () => {
    await window.evaluate(() => {
      const root = document.documentElement;
      root.style.setProperty('--bg-color', '#d1fae5'); // green presentation token
      root.style.setProperty('--surface', '#f3eee2'); // app/editor surface token
      root.style.setProperty('--panel-bg', '#f3eee2');
      root.style.setProperty('--surface-variant', '#ebe6dc');
      root.style.setProperty('--text', '#1f2937');
      root.style.setProperty('--text-muted', '#6b7280');
      root.style.setProperty('--primary', '#2563eb');
      root.style.setProperty('--border', '#d1d5db');

      if (typeof window.syncEditorThemeWithAppTheme === 'function') {
        window.syncEditorThemeWithAppTheme();
      }
    });

    await window.waitForTimeout(200);

    const state = await window.evaluate(() => {
      const editorBgNode = document.querySelector('.monaco-editor .monaco-editor-background');
      const computedBg = editorBgNode ? getComputedStyle(editorBgNode).backgroundColor : null;
      return { computedBg };
    });

    expect(state.computedBg).toBe('rgb(243, 238, 226)');
    expect(state.computedBg).not.toBe('rgb(209, 250, 229)');
  });
});
