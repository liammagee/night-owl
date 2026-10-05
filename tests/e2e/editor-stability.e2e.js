const { test, expect, _electron: electron } = require('@playwright/test');
const fs = require('fs');
const os = require('os');
const path = require('path');

const appRoot = path.resolve(__dirname, '../..');
// macOS and Windows desktop sessions do not use DISPLAY.
const noLinuxDisplay = process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY;

test.describe('Editor pane and command stability', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(noLinuxDisplay, 'Electron needs a Linux display server');

  let app;
  let page;
  let temporaryRoot;
  let workspace;
  let filePath;
  let pageErrors = [];

  test.beforeAll(async () => {
    temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nightowl-editor-stability-'));
    workspace = path.join(temporaryRoot, 'workspace');
    const profile = path.join(temporaryRoot, 'profile');
    fs.mkdirSync(workspace);
    fs.mkdirSync(profile);
    filePath = path.join(workspace, 'writing.md');
    fs.writeFileSync(filePath, '# Editor stability\n\nA test document.\n');
    fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({
      workingDirectory: workspace,
      workspaceFolders: [],
      currentFile: filePath,
      autoSave: { enabled: true, interval: 300 },
      ai: { enableInlineCompletions: false },
      gamification: { enabled: false }
    }));
    const { ELECTRON_RUN_AS_NODE, ...cleanEnv } = process.env;
    app = await electron.launch({
      executablePath: process.env.NIGHTOWL_EDITOR_TEST_EXECUTABLE || require('electron'),
      args: [...(process.env.NIGHTOWL_EDITOR_TEST_EXECUTABLE ? [] : [appRoot]), `--user-data-dir=${profile}`],
      env: { ...cleanEnv, NODE_ENV: 'test', NIGHTOWL_WORKSPACE_USER_DATA_DIR: profile, NIGHTOWL_DISABLE_SINGLE_INSTANCE: '1' },
      timeout: 30000
    });
    page = await app.firstWindow();
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.waitForLoadState('domcontentloaded');
    // Capture errors from the full startup script sequence, including scripts
    // that may have executed before firstWindow() attached its listener.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.editor?.getModel && window.tabManager && window.splitEditor, null, { timeout: 20000 });
    await page.evaluate(async (target) => {
      const result = await (window.electronAPI.files?.readFile(target) || window.electronAPI.invoke('read-file', target));
      if (!result.success) throw new Error(result.error);
      await window.openFileInEditor(target, result.content);
      window.editor.focus();
    }, filePath);
  });

  test.afterAll(async () => {
    if (app) {
      // Only this disposable test instance is terminated; avoid a native save
      // prompt if an assertion interrupted a test with a dirty temporary file.
      await app.evaluate(({ app: electronApp }) => electronApp.exit(0)).catch(() => {});
      await app.close().catch(() => {});
    }
    if (temporaryRoot) fs.rmSync(temporaryRoot, { recursive: true, force: true });
  });

  test('startup renders Markdown without a preview ReferenceError', async () => {
    await expect(page.locator('#preview-content')).toContainText('Editor stability');
    expect(pageErrors.filter((message) => /ReferenceError|is not defined|before initialization/.test(message))).toEqual([]);
    expect(await page.evaluate(() => window.editor.getModel().getValue())).toContain('# Editor stability');
  });

  test('shortcut and toolbar each show one populated command palette', async () => {
    await page.evaluate(() => window.editor.focus());
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+P' : 'Control+Shift+P');
    await expect(page.locator('.command-palette-overlay:visible')).toHaveCount(1);
    await expect(page.locator('.command-item')).not.toHaveCount(0);
    await expect(page.locator('.command-palette-input')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('.command-palette-overlay:visible')).toHaveCount(0);
    expect(await page.evaluate(() => window.editor.hasTextFocus())).toBe(true);
    await page.locator('#command-palette-btn').click();
    await expect(page.locator('.command-palette-overlay:visible')).toHaveCount(1);
    await expect(page.locator('.command-item')).not.toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.locator('.command-palette-overlay:visible')).toHaveCount(0);
  });

  test('typing and repeated shortcut events do not create additional panes', async () => {
    await page.evaluate(() => {
      window.editor.focus();
      const model = window.editor.getModel();
      window.editor.setPosition({ lineNumber: model.getLineCount(), column: model.getLineMaxColumn(model.getLineCount()) });
    });
    await page.keyboard.type(' Ordinary typing, punctuation? and editor shortcuts.');
    await page.evaluate(() => {
      for (const options of [{ repeat: true }, { isComposing: true }, { altKey: true }]) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'P', ctrlKey: true, shiftKey: true, bubbles: true, ...options }));
      }
    });
    await expect(page.locator('#editor-pane-2')).toHaveCount(0);
    await expect(page.locator('.command-palette-overlay:visible')).toHaveCount(0);
    expect(await page.evaluate(() => window.editor.getValue())).toContain('Ordinary typing');
  });

  test('a command-owned input retains focus after the palette closes', async () => {
    await page.evaluate(() => {
      window.registerCommand('test.focus', 'Regression: focus dialog', () => {
        const input = document.createElement('input');
        input.id = 'regression-dialog-input';
        input.style.cssText = 'position:fixed;top:20px;left:20px;z-index:20000';
        document.body.appendChild(input);
        input.focus();
      });
      window.showCommandPalette();
    });
    await page.locator('.command-palette-input').fill('Regression: focus dialog');
    await page.keyboard.press('Enter');
    await expect(page.locator('.command-palette-overlay:visible')).toHaveCount(0);
    await expect(page.locator('#regression-dialog-input')).toBeFocused();
    await page.keyboard.type('still focused');
    await expect(page.locator('#regression-dialog-input')).toHaveValue('still focused');
    await page.locator('#regression-dialog-input').evaluate((element) => element.remove());
  });

  test('global search opens in the left sidebar and leaves the right preview intact', async () => {
    await page.evaluate(() => {
      window.showPane('preview');
      window.editor.focus();
    });
    await expect(page.locator('#preview-pane')).toBeVisible();
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+F' : 'Control+Shift+F');
    await expect(page.locator('#search-pane')).toBeVisible();
    await expect(page.locator('#global-search-input')).toBeFocused();
    await expect(page.locator('#preview-pane')).toBeVisible();
    await expect(page.locator('#preview-content')).toContainText('Editor stability');
    expect(await page.locator('#search-pane').evaluate((element) => !document.getElementById('right-pane').contains(element))).toBe(true);
    await expect(page.locator('#editor-pane-2')).toHaveCount(0);

    // A fresh packaged-app profile presents dismissible first-run setup guidance.
    const guidance = page.locator('#capability-first-run-guidance');
    if (await guidance.isVisible()) await guidance.getByRole('button', { name: 'Dismiss', exact: true }).click();
    await page.locator('#show-speaker-notes-btn').click();
    await expect(page.locator('#speaker-notes-pane')).toBeVisible();
    await expect(page.locator('#search-pane')).toBeVisible();
    await page.locator('#show-preview-btn').click();
    await expect(page.locator('#preview-pane')).toBeVisible();
    await expect(page.locator('#search-pane')).toBeVisible();
    await expect(page.locator('#workspace-index-progress')).toBeHidden();
  });

  test('failed split opens leave no blank pane, while explicit valid opens close cleanly', async () => {
    const missingPath = path.join(workspace, 'missing.md');
    expect(await page.evaluate((target) => window.splitEditor.openInSplit(target), missingPath)).toBe(false);
    await expect(page.locator('#editor-pane-2')).toHaveCount(0);
    await expect(page.locator('#split-editor-resizer')).toHaveCount(0);
    expect(await page.evaluate((target) => window.splitEditor.openInSplit(target), filePath)).toBe(true);
    await expect(page.locator('#editor-pane-2')).toHaveCount(1);
    await expect(page.locator('#split-editor-filename')).toContainText('writing.md');
    await page.locator('#split-editor-close').click();
    await expect(page.locator('#editor-pane-2')).toHaveCount(0);
    await expect(page.locator('#split-editor-resizer')).toHaveCount(0);
  });
  test('commented slide markers stay hidden in thumbnails and presentation view', async () => {
    const markdown = '---\ntitle: Example\n---\n# Visible first\n\n<!--\n---\nHidden draft slide\n-->\n\n***\n\n# Visible second';
    await page.evaluate(async (content) => {
      window.editor.setValue(content);
      renderSlideThumbnails(content);
      renderVerticalSlideThumbnails();
      updateSlidesSidebarButton(content);
      navigateToSlide(1, content);
      await window.NightOwlFeatures.enableFeature('nightowl-presentations');
    }, markdown);
    await expect(page.locator('#slide-thumbnails-strip .slide-thumb')).toHaveCount(2);
    await expect(page.locator('#slides-pane-list .slide-thumb-vertical')).toHaveCount(2);
    await expect(page.locator('#slides-pane-count')).toHaveText('2');
    expect(await page.evaluate(() => window.editor.getPosition().lineNumber)).toBe(12);
    expect(await page.locator('#slide-thumbnails-strip').innerText()).not.toContain('Hidden draft slide');
    await page.evaluate((content) => {
      const root = document.createElement('div');
      root.id = 'slide-regression-presentation';
      root.style.cssText = 'position:fixed;inset:0;z-index:99999';
      document.body.appendChild(root);
      window.pendingPresentationContent = content;
      window.ReactDOM.render(window.React.createElement(window.MarkdownPreziApp, { markdown: content }), root);
    }, markdown);
    const presentation = page.locator('#slide-regression-presentation');
    await expect(presentation.getByText('1 / 2', { exact: true })).toBeVisible();
    await expect(presentation).toContainText('Visible first');
    await expect(presentation).toContainText('Visible second');
    await expect(presentation).not.toContainText('Hidden draft slide');
    await page.evaluate(() => {
      const root = document.getElementById('slide-regression-presentation');
      window.ReactDOM.unmountComponentAtNode(root);
      root.remove();
    });
  });

  test('outline navigation scrolls the preview without moving its ancestors', async () => {
    await page.evaluate(() => {
      window.showPane('preview');
      window.editor.setValue('# Start\n\n' + 'A paragraph.\n\n'.repeat(150) + '# Destination');
    });
    await expect(page.locator('#heading-destination')).toBeVisible();
    await page.evaluate(() => {
      document.getElementById('main-content').scrollTop = 0;
      document.getElementById('app-container').scrollTop = 0;
      scrollToHeadingInPreview('Destination');
    });
    await expect.poll(() => page.evaluate(() => Math.max(document.getElementById('preview-pane').scrollTop, document.getElementById('preview-content').scrollTop))).toBeGreaterThan(100);
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => ({
      main: document.getElementById('main-content').scrollTop,
      app: document.getElementById('app-container').scrollTop
    }))).toEqual({ main: 0, app: 0 });
  });

  test('typing on a late slide scrolls thumbnails without shifting the editor sideways', async () => {
    const content = Array.from({ length: 20 }, (_, i) => `# Slide ${i + 1}\n\nNotes for slide ${i + 1}.`).join('\n\n---\n\n');
    await page.evaluate((markdown) => {
      // A wide mode bar at a narrow viewport or increased zoom made this ancestor scrollable.
      document.getElementById('mode-switcher').style.minWidth = '1800px';
      window.editor.setValue(markdown);
      window.editor.setPosition({ lineNumber: 1, column: 1 });
      renderSlideThumbnails(markdown);
    }, content);
    await page.waitForTimeout(800); // Let the existing smooth thumbnail scroll settle.
    const before = await page.evaluate(() => {
      const main = document.getElementById('main-content');
      main.scrollLeft = 0;
      const rect = document.getElementById('editor-pane').getBoundingClientRect();
      return { x: rect.x, width: rect.width };
    });
    await page.evaluate(() => {
      const model = window.editor.getModel();
      const last = model.getLineCount();
      window.editor.setPosition({ lineNumber: last, column: model.getLineMaxColumn(last) });
      window.editor.revealLine(last);
      window.editor.focus();
      renderSlideThumbnails(model.getValue());
    });
    await page.keyboard.type(' More notes.');
    await expect(page.locator('#slide-thumbnails-strip .slide-thumb.active')).toHaveAttribute('data-slide-index', '19');
    await expect.poll(() => page.evaluate(() => document.getElementById('slide-thumbnails-strip').scrollLeft)).toBeGreaterThan(100);
    await page.waitForTimeout(1200); // Exercise the typing debounce and smooth-scroll completion.
    const after = await page.evaluate(() => {
      const rect = document.getElementById('editor-pane').getBoundingClientRect();
      return { x: rect.x, width: rect.width,
        mainScroll: document.getElementById('main-content').scrollLeft,
        appScroll: document.getElementById('app-container').scrollLeft };
    });
    expect(after.mainScroll).toBe(0);
    expect(after.appScroll).toBe(0);
    expect(after.x).toBeCloseTo(before.x, 1);
    expect(after.width).toBeCloseTo(before.width, 1);
  });

});
