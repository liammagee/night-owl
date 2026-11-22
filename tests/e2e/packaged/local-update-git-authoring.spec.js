'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { injectAxe, checkA11y } = require('axe-playwright');
const { test, expect } = require('../fixtures/packaged-electron-app');

test('@required @git-authoring save, review, stage, commit and push to a local website remote', async ({ appPage }) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'nightowl-git-ui-'));
  const root = path.join(temp, 'machinespirits-website');
  const remote = path.join(temp, 'website.git');
  fs.mkdirSync(root);
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' });
  git('init', '-b', 'main'); git('config', 'user.name', 'Author'); git('config', 'user.email', 'author@example.invalid');
  git('config', 'commit.gpgsign', 'false'); git('config', 'core.hooksPath', path.join(temp, 'hooks'));
  git('init', '--bare', remote); git('remote', 'add', 'origin', remote);
  fs.writeFileSync(path.join(root, 'lesson.md'), '# Learning through dialogue\n\nAn opening question.\n');
  git('add', '.'); git('commit', '-m', 'Initial lesson');
  const previous = await appPage.evaluate(() => window.electronAPI.workspace.getWorkingDirectory());
  try {
    await appPage.evaluate(async root => {
      const result = await window.electronAPI.workspace.switchWorkspace(root);
      if (!result.success) throw new Error(result.error);
      window.appSettings = { ...window.appSettings, workingDirectory: root, workspaceFolders: [] };
      await window.openFilePathInEditor(`${root}/lesson.md`);
      window.editor.setValue('# Learning through dialogue\n\nWhat makes a question worth asking?\n');
      const saved = await window.saveFile();
      if (!saved?.success) throw new Error(saved?.error || `Save failed: ${JSON.stringify(saved)}`);
      window.switchStructureView('git');
      await window.gitPanel.refresh();
    }, root);
    const pane = appPage.locator('#git-pane');
    await expect(pane).toBeVisible();
    await expect(appPage.locator('#git-repository-name')).toHaveText('machinespirits-website');
    await expect(appPage.locator('#git-unstaged-list')).toContainText('lesson.md');
    await appPage.locator('#git-stage-all-btn').click();
    await expect(appPage.locator('#git-staged-count')).toHaveText('1');
    await appPage.locator('#git-commit-message').fill('Refine the opening question');
    await expect(appPage.locator('#git-publish-btn')).toBeEnabled();
    await appPage.evaluate(() => window.techneThemeManager.applyTheme('techne-red-light'));
    await pane.screenshot({ path: 'test-results/git-authoring-light.png' });
    await injectAxe(appPage);
    await checkA11y(appPage, '#git-pane', { includedImpacts: ['critical', 'serious'], detailedReport: true });
    await appPage.evaluate(() => window.techneThemeManager.applyTheme('techne-red-dark'));
    await pane.screenshot({ path: 'test-results/git-authoring-dark.png' });
    await checkA11y(appPage, '#git-pane', { includedImpacts: ['critical', 'serious'], detailedReport: true });
    await appPage.evaluate(() => window.techneThemeManager.applyTheme('techne-red-light'));
    await appPage.locator('#git-publish-btn').click();
    await expect(appPage.locator('#git-operation-status')).toContainText('Published');
    expect(git('show', 'HEAD:lesson.md')).toContain('What makes a question worth asking?');
    expect(git('rev-parse', '@{u}')).toBe(git('rev-parse', 'HEAD'));
    expect(git('status', '--porcelain')).toBe('');
    await expect(appPage.locator('#git-destination')).toHaveText('origin/main');
  } finally {
    await appPage.evaluate(async previous => {
      window.techneThemeManager.applyTheme('techne-red-light');
      await window.electronAPI.workspace.switchWorkspace(previous);
      window.appSettings.workingDirectory = previous;
      await window.gitPanel.refresh();
    }, previous);
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
