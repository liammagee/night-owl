const { test, expect } = require('@playwright/test');
const { startInterfaceLayoutHarness } = require('../helpers/interface-layout-harness');
let harness;

test.beforeAll(async () => { harness = await startInterfaceLayoutHarness(); });
test.afterAll(async () => { await harness.close(); });
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.goto(harness.url);
  await page.waitForFunction(() => window.editor?.getModel?.());
});

test('header mode buttons are reachable at narrow widths instead of being clipped', async ({ page }) => {
  const modeSwitcher = page.locator('#mode-switcher');
  const clipped = await modeSwitcher.evaluate((el) => {
    const bounds = el.getBoundingClientRect();
    const last = el.lastElementChild.getBoundingClientRect();
    return { overflow: getComputedStyle(el).overflowX, hidden: last.right > bounds.right + el.scrollWidth - el.clientWidth };
  });
  expect(clipped.overflow).toBe('auto');
  expect(clipped.hidden).toBe(false);
  for (const id of ['#editor-mode-btn', '#presentation-mode-btn', '#toggle-preview-btn']) {
    await expect(page.locator(id)).toBeInViewport();
  }
});

test('turning word wrap off keeps a visible horizontal scrollbar in the editor', async ({ page }) => {
  await page.evaluate(() => window.NightOwlEditorLayout.applyWordWrap(window.editor, 'off', document.getElementById('preview-source')));
  await page.waitForTimeout(300);
  const state = await page.evaluate(() => {
    const bar = document.querySelector('#editor-container .monaco-scrollable-element > .scrollbar.horizontal');
    const style = bar && getComputedStyle(bar);
    return {
      overflowing: window.editor.getScrollWidth() > window.editor.getLayoutInfo().width,
      barVisible: Boolean(style) && style.display !== 'none' && Number(style.opacity) > 0
    };
  });
  expect(state.overflowing).toBe(true);
  expect(state.barVisible).toBe(true);
});

test('source view follows word wrap and scrolls horizontally when wrap is off', async ({ page }) => {
  await page.evaluate(() => {
    document.getElementById('preview-content').style.display = 'none';
    document.getElementById('preview-source').style.display = '';
    document.getElementById('preview-source-toolbar').style.display = '';
  });
  const pre = page.locator('#preview-source');
  await page.evaluate(() => window.NightOwlEditorLayout.syncSourceViewWrap('on'));
  expect(await pre.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(false);
  await page.evaluate(() => window.NightOwlEditorLayout.syncSourceViewWrap('off'));
  expect(await pre.evaluate((el) => getComputedStyle(el).whiteSpace)).toBe('pre');
  expect(await pre.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);

  // The floating preview buttons must not cover the source toolbar's own buttons.
  const syncRight = await page.locator('#preview-source-sync-toggle').evaluate((el) => el.getBoundingClientRect().right);
  const floatingLeft = await page.locator('#preview-scroll-sync-btn').evaluate((el) => el.getBoundingClientRect().left);
  expect(syncRight).toBeLessThanOrEqual(floatingLeft);
});

test('routine save confirmations land in the status bar, errors stay as toasts', async ({ page }) => {
  await page.evaluate(() => {
    window.showNotification('File saved successfully', 'success');
    window.showNotification('Auto-saved', 'success', 1000);
  });
  await expect(page.locator('#editor-status-bar #status-notification')).toHaveText('Auto-saved');
  const statusBar = await page.locator('#editor-status-bar').evaluate((el) => ({
    height: el.getBoundingClientRect().height,
    wrapped: Array.from(el.querySelectorAll('span')).some((span) => span.getBoundingClientRect().height > 22)
  }));
  expect(statusBar.height).toBeLessThanOrEqual(26);
  expect(statusBar.wrapped).toBe(false);
  await expect(page.locator('.notification')).toHaveCount(0);

  await page.evaluate(() => {
    window.showNotification('Failed to save file', 'error');
    window.showNotification('Failed to save file', 'error');
  });
  await expect(page.locator('.notification')).toHaveCount(1);
  await expect(page.locator('.notification')).toHaveClass(/notification-error/);
});

test('preview resolves raw <img> tags against the open file directory with encoding', async ({ page }) => {
  const sources = await page.evaluate(() => {
    window.currentFileDirectory = '/ws/Week 3 #notes';
    const target = document.getElementById('preview-content');
    window.NightOwlPreviewMarkdown.setSanitizedHTML(target, '<img src="img/my shot.png"><img src="https://example.com/x.png">');
    return Array.from(target.querySelectorAll('img')).map((img) => img.getAttribute('src'));
  });
  expect(sources).toEqual(['file:///ws/Week%203%20%23notes/img/my%20shot.png', 'https://example.com/x.png']);
});
