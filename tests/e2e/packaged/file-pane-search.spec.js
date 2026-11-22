'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { test, expect } = require('../fixtures/packaged-electron-app');

test('@packaged file-pane search finds collapsed files and clears back to browsing', async ({ appPage, packagedProfile }) => {
  const root = await fs.mkdtemp(path.join(packagedProfile, 'nightowl-file-scope-'));
  const nested = path.join(root, 'manuscript');
  await fs.mkdir(nested);
  await fs.writeFile(path.join(nested, 'PREFACE.md'), '# Preface\n');
  await fs.writeFile(path.join(nested, 'appendix.md'), '---\ntags: [tag-only-match]\n---\n# Appendix\n');
  await fs.writeFile(path.join(root, 'README.md'), '# Readme\n');

  await appPage.waitForFunction(() => document.documentElement.dataset.nightOwlStartupState === 'ready');
  const previous = await appPage.evaluate(() => window.electronAPI.workspace.getWorkingDirectory());
  const search = appPage.locator('#tag-search-input');
  const rows = appPage.locator('#file-tree-view');
  try {
    const switched = await appPage.evaluate(root => window.electronAPI.workspace.switchWorkspace(root), root);
    expect(switched.success).toBe(true);
    await expect(rows.getByText(path.basename(root), { exact: true })).toBeVisible();
    const rootRow = rows.getByText(path.basename(root), { exact: true });
    if (!await rows.getByText('README.md', { exact: true }).isVisible()) {
      await rootRow.locator('..').locator('.expand-arrow').click();
    }
    await expect(rows.getByText('README.md', { exact: true })).toBeVisible();
    await expect(rows.getByText('PREFACE.md', { exact: true })).toBeHidden();

    await search.pressSequentially('preface');
    await expect(rows.getByText('PREFACE.md', { exact: true })).toBeVisible();
    await expect(rows.getByText('README.md', { exact: true })).toBeHidden();
    await search.fill('manuscript/preface');
    await expect(rows.getByText('PREFACE.md', { exact: true })).toBeVisible();
    await search.fill('tag-only-match');
    await expect(rows.getByText('appendix.md', { exact: true })).toBeVisible();
    await expect(rows.getByText('PREFACE.md', { exact: true })).toBeHidden();
    await search.fill(path.basename(root));
    await expect(appPage.locator('#file-tree-view .no-results')).toContainText('No matching files');
    await search.press('Escape');
    await expect(search).toHaveValue('');
    await expect(rows.getByText('README.md', { exact: true })).toBeVisible();
    await expect(rows.getByText('PREFACE.md', { exact: true })).toBeHidden();
  } finally {
    if (await search.isVisible()) await search.fill('');
    if (previous) await appPage.evaluate(root => window.electronAPI.workspace.switchWorkspace(root), previous);
    await fs.rm(root, { recursive: true, force: true });
  }
});
