'use strict';

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../fixtures/packaged-electron-app');

test('@packaged @pptx packaged decks preview or provide the native-open fallback', async ({ appPage }) => {
  await appPage.waitForFunction(() => (
    Boolean(window.editor?.getValue) &&
    typeof window.openFilePathInEditor === 'function' &&
    typeof window.switchToMode === 'function' &&
    typeof window.electronAPI?.presentation?.renderPptxPreview === 'function'
  ), undefined, { timeout: 30 * 1000 });
  await appPage.evaluate(() => window.switchToMode('editor'));

  const activeWorkspace = await appPage.evaluate(() => window.electronAPI.workspace.getWorkingDirectory());
  const workspacePath = fs.mkdtempSync(path.join(activeWorkspace, '.nightowl-packaged-pptx-'));
  const deckPath = path.join(workspacePath, 'reference.pptx');
  fs.copyFileSync(path.resolve(__dirname, '../../../templates/reference.pptx'), deckPath);

  try {
    const outcome = await appPage.evaluate(
      deck => window.openFilePathInEditor(deck, { source: 'packaged-pptx-e2e' }),
      deckPath
    );

    expect(outcome).toMatchObject({ status: 'committed', filePath: deckPath });
    await expect(appPage.getByRole('button', { name: 'Open in PowerPoint' })).toBeVisible();

    if (process.platform === 'darwin') {
      await expect(appPage.locator('.pptx-preview-frame')).toBeVisible();
      await expect(appPage.frameLocator('.pptx-preview-frame').locator('.slide')).toHaveCount(3);
      await expect(appPage.locator('#pptx-preview-status')).toContainText('Quick Look preview');
    } else {
      await expect(appPage.locator('.pptx-preview-fallback')).toBeVisible();
      await expect(appPage.locator('#pptx-preview-status')).toContainText('Preview unavailable');
    }
  } finally {
    fs.rmSync(workspacePath, { recursive: true, force: true });
  }
});
