const { test, expect } = require('./fixtures/electron-app');

test.describe('Editor Theme Inheritance', () => {
  test('editor background does not inherit presentation bg-color when surface tokens are available', async ({ appPage }) => {
    await appPage.evaluate(() => window.switchToMode('editor'));
    await expect(appPage.locator('.monaco-editor')).toBeVisible();

    await appPage.evaluate(() => {
      const root = document.body;
      root.style.setProperty('--bg-color', '#d1fae5'); // green presentation token
      root.style.setProperty('--techne-bg', '#f3eee2'); // managed editor canvas token
      root.style.setProperty('--editor-bg', '#f3eee2'); // explicit editor surface token
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

    await appPage.waitForTimeout(200);

    const state = await appPage.evaluate(() => {
      const editorBgNode = document.querySelector('.monaco-editor .monaco-editor-background');
      const computedBg = editorBgNode ? getComputedStyle(editorBgNode).backgroundColor : null;
      return { computedBg };
    });

    expect(state.computedBg).toBe('rgb(243, 238, 226)');
    expect(state.computedBg).not.toBe('rgb(209, 250, 229)');
  });
});
