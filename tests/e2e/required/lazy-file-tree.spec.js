const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const { test, expect } = process.env.NIGHTOWL_PACKAGED_APP
  ? require('../fixtures/packaged-electron-app') : require('../fixtures/electron-app');

test('browsing loads expanded directories, observes external files, and searches collapsed folders on demand', async ({ appPage, electronApp }) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'nightowl-lazy-tree-'));
  const folder = path.join(workspace, 'folder');
  const deep = path.join(folder, 'deep');
  try {
    await fs.mkdir(deep, { recursive: true });
    await fs.writeFile(path.join(workspace, 'visible.md'), '---\ntags: [visible]\n---\n# Note');
    await fs.writeFile(path.join(folder, 'child.md'), '# Child');
    await fs.writeFile(path.join(deep, 'hidden-needle.md'), '---\ntags: [deep-tag]\n---\n# Hidden');
    await appPage.waitForFunction(() => window.editor && window.renderFileTree && window.switchToMode);
    const win = await electronApp.browserWindow(appPage);
    await win.evaluate(win => { win.show(); win.focus(); });
    // The worker shares a window: leave presentation delivery through its UI first.
    if (await appPage.evaluate(() => window.NightOwlPresentationTools?.getState().isPresenting)) {
      await appPage.keyboard.press('Escape');
      await expect(appPage.locator('body')).not.toHaveClass(/is-presenting/);
    }
    await appPage.evaluate(async workspace => {
      await window.switchToMode('editor');
      window.NightOwlWorkflows.panes.hydrate({ sidebar: true, editor: true, right: true });
      window.switchStructureView('file');
      window.appSettings.autoSave = { enabled: false };
      window.expandedFolders.clear();
      const result = await window.electronAPI.workspace.switchWorkspace(workspace);
      if (!result.success) throw new Error(result.error);
      await window.renderFileTree();
    }, workspace);
    await expect(appPage.locator(`.file-tree-item[data-path="${folder}"]`)).toBeVisible();
    const initial = await appPage.evaluate(() => window.fileTreeData);
    expect(initial.children.find(n => n.path === folder)).toMatchObject({ childrenLoaded: false, children: [] });
    await appPage.locator(`.file-tree-item[data-path="${folder}"]`).click();
    await expect(appPage.locator(`.file-tree-item[data-path="${path.join(folder,'child.md')}"]`)).toBeVisible();
    await fs.writeFile(path.join(folder, 'external.md'), '# External');
    await expect(appPage.locator(`.file-tree-item[data-path="${path.join(folder,'external.md')}"]`)).toBeVisible({ timeout: 15000 });
    const status = await appPage.evaluate(() => window.electronAPI.search.workspaceIndexStatus());
    expect(status.indexed).toBe(0); // Visible tag decoration must not build the content index.
    await appPage.evaluate(() => { window.editor.setValue(''); window.editor.focus(); });
    await appPage.keyboard.type('[[hidden-needle');
    await expect(appPage.locator('.suggest-widget.visible')).toContainText('hidden-needle');
    await appPage.keyboard.press('Escape');
    await appPage.getByPlaceholder('Search files by name or tag...').fill('deep-tag');
    await expect(appPage.locator(`.file-tree-item[data-path="${path.join(deep,'hidden-needle.md')}"]`)).toBeVisible();
    await appPage.getByPlaceholder('Search files by name or tag...').fill('hidden-needle');
    await expect(appPage.locator(`.file-tree-item[data-path="${path.join(deep,'hidden-needle.md')}"]`)).toBeVisible();
  } finally { await fs.rm(workspace, { recursive: true, force: true }); }
});
