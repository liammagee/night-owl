/**
 * Browser-level smoke coverage for the primary editor workflows.
 *
 * This launches the Electron renderer and stubs IPC responses so the test is
 * stable without native file dialogs or a particular local workspace.
 */
const { test, expect, _electron: electron } = require('@playwright/test');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const APP_PATH = path.join(__dirname, '../..');
const isHeadless = process.env.CI || process.env.HEADLESS || !process.env.DISPLAY;

test.describe('Primary workflow smoke', () => {
  let app;
  let window;
  let workspacePath;

  test.beforeAll(async () => {
    test.skip(isHeadless, 'Electron smoke tests require a desktop display');

    workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'nightowl-primary-smoke-'));
    await Promise.all([
      fs.writeFile(path.join(workspacePath, 'index.html'), '<!doctype html><html><body><h1>HTML Smoke</h1></body></html>'),
      fs.writeFile(path.join(workspacePath, 'paper.md'), '---\nbibliography: refs.bib\n---\n\n# Paper\n\nCitation [@hegel1807].'),
      fs.writeFile(path.join(workspacePath, 'refs.bib'), '@book{hegel1807,title={Phenomenology of Spirit},author={Hegel, G. W. F.},year={1807}}')
    ]);

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

    await window.evaluate(async (workspace) => {
      await window.electronAPI.workspace.switchWorkspace(workspace);
      window.appSettings = {
        ...(window.appSettings || {}),
        workingDirectory: workspace
      };
    }, workspacePath);
  });

  test.afterAll(async () => {
    if (app) await app.close();
    if (workspacePath) await fs.rm(workspacePath, { recursive: true, force: true });
  });

  test('opens a folder tree, searches wildcard, opens HTML, edits Markdown, previews citations, and saves', async () => {
    await window.evaluate(() => window.renderFileTree());
    await expect(window.locator('#file-tree-view .file-tree-item.file')).toHaveCount(3);

    await window.fill('#global-search-input', '*.html');
    await window.click('#global-search-execute');
    await expect(window.locator('#search-results')).toContainText('index.html');

    await window.locator('#file-tree-view .file-tree-item.file', { hasText: 'index.html' }).click();
    await expect.poll(() => window.evaluate(() => window.currentFilePath)).toBe(path.join(workspacePath, 'index.html'));
    await expect(window.locator('#preview-content iframe')).toBeVisible();

    await window.locator('#file-tree-view .file-tree-item.file', { hasText: 'paper.md' }).click();
    await window.evaluate(() => {
      window.editor.setValue(`${window.editor.getValue()}\n\nAdded smoke edit.`);
      window.updatePreviewAndStructure(window.editor.getValue());
    });
    await expect(window.locator('#preview-content')).toContainText('Paper');
    await expect(window.locator('#preview-content')).toContainText('Citation');

    await window.keyboard.press(process.platform === 'darwin' ? 'Meta+S' : 'Control+S');
    await expect.poll(() => window.evaluate(() => window.currentFilePath)).toBe(path.join(workspacePath, 'paper.md'));
  });

  test('executes a bounded command through the terminal capability', async () => {
    await window.click('#show-chat-btn');
    await expect(window.locator('#chat-pane')).toBeVisible();

    const result = await window.evaluate((workspace) => (
      window.electronAPI.terminal.exec({ command: 'pwd', cwd: workspace })
    ), workspacePath);
    expect(result).toMatchObject({ success: true });
    expect(result.output).toContain(workspacePath);
  });
});
