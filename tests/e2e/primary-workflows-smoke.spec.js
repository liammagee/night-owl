/**
 * Browser-level smoke coverage for the primary editor workflows.
 *
 * This launches the Electron renderer and stubs IPC responses so the test is
 * stable without native file dialogs or a particular local workspace.
 */
const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');

const APP_PATH = path.join(__dirname, '../..');
const isHeadless = process.env.CI || process.env.HEADLESS || !process.env.DISPLAY;

test.describe('Primary workflow smoke', () => {
  let app;
  let window;

  test.beforeAll(async () => {
    test.skip(isHeadless, 'Electron smoke tests require a desktop display');

    const electronPath = require('electron');
    const { ELECTRON_RUN_AS_NODE, ...cleanEnv } = process.env;
    app = await electron.launch({
      executablePath: electronPath,
      args: [APP_PATH, '--dev'],
      env: { ...cleanEnv, NODE_ENV: 'test' },
      timeout: 30000
    });
    window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await window.waitForFunction(() => Boolean(window.editor && window.renderFileTree), null, { timeout: 30000 });

    await window.evaluate(() => {
      const files = new Map([
        ['/workspace/index.html', '<!doctype html><html><body><h1>HTML Smoke</h1></body></html>'],
        ['/workspace/paper.md', '---\nbibliography: refs.bib\n---\n\n# Paper\n\nCitation [@hegel1807].'],
        ['/workspace/refs.bib', '@book{hegel1807,title={Phenomenology of Spirit},author={Hegel, G. W. F.},year={1807}}']
      ]);

      const originalInvoke = window.electronAPI.invoke.bind(window.electronAPI);
      window.electronAPI.invoke = async (channel, payload) => {
        if (channel === 'request-file-tree') {
          return {
            name: 'workspace',
            type: 'directory',
            path: '/workspace',
            children: [
              { name: 'index.html', type: 'file', path: '/workspace/index.html' },
              { name: 'paper.md', type: 'file', path: '/workspace/paper.md' },
              { name: 'refs.bib', type: 'file', path: '/workspace/refs.bib' }
            ]
          };
        }
        if (channel === 'global-search') {
          return {
            success: true,
            isFilePatternSearch: true,
            fileMatches: [{
              name: 'index.html',
              path: '/workspace/index.html',
              relativePath: 'index.html',
              sourceFolder: '/workspace',
              isPrimaryFolder: true
            }]
          };
        }
        if (channel === 'open-file-path' || channel === 'read-file') {
          const filePath = typeof payload === 'string' ? payload : payload?.filePath;
          return { success: true, filePath, content: files.get(filePath) || '' };
        }
        if (channel === 'save-file') {
          return { success: true, filePath: payload?.filePath || '/workspace/paper.md' };
        }
        if (channel === 'set-current-file' || channel === 'get-working-directory') {
          return channel === 'get-working-directory' ? '/workspace' : { success: true };
        }
        return originalInvoke(channel, payload);
      };
    });
  });

  test.afterAll(async () => {
    if (app) await app.close();
  });

  test('opens a folder tree, searches wildcard, opens HTML, edits Markdown, previews citations, and saves', async () => {
    await window.evaluate(() => window.renderFileTree());
    await expect(window.locator('#file-tree-view .file-tree-item.file')).toHaveCount(3);

    await window.fill('#global-search-input', '*.html');
    await window.click('#global-search-execute');
    await expect(window.locator('#search-results')).toContainText('index.html');

    await window.locator('#file-tree-view .file-tree-item.file', { hasText: 'index.html' }).click();
    await expect.poll(() => window.evaluate(() => window.currentFilePath)).toBe('/workspace/index.html');
    await expect(window.locator('#preview-content iframe')).toBeVisible();

    await window.locator('#file-tree-view .file-tree-item.file', { hasText: 'paper.md' }).click();
    await window.evaluate(() => {
      window.editor.setValue(`${window.editor.getValue()}\n\nAdded smoke edit.`);
      window.updatePreviewAndStructure(window.editor.getValue());
    });
    await expect(window.locator('#preview-content')).toContainText('Paper');
    await expect(window.locator('#preview-content')).toContainText('Citation');

    await window.keyboard.press(process.platform === 'darwin' ? 'Meta+S' : 'Control+S');
    await expect.poll(() => window.evaluate(() => window.currentFilePath)).toBe('/workspace/paper.md');
  });
});
