'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('../fixtures/electron-app');

test('@required replacement preview and execution share the real IPC contract', async ({ appPage }) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nightowl-replace-ui-'));
  const file = path.join(root, 'notes.md');
  fs.writeFileSync(file, 'cat cat\n');
  const previous = await appPage.evaluate(() => window.electronAPI.workspace.getWorkingDirectory());
  try {
    await appPage.evaluate(async root => {
      const switched = await window.electronAPI.workspace.switchWorkspace(root);
      if (!switched.success) throw new Error(switched.error);
      window.appSettings = { ...window.appSettings, workingDirectory: root, workspaceFolders: [] };
      window.switchToMode('editor');
      document.getElementById('global-search-input').value = 'cat';
      document.getElementById('global-replace-input').value = 'catcat';
      await window.performGlobalReplace(true);
    }, root);
    await expect(appPage.locator('#search-results')).toContainText('After: catcat catcat');
    expect(fs.readFileSync(file, 'utf8')).toBe('cat cat\n');
    await appPage.evaluate(() => window.performGlobalReplace(false));
    await expect(appPage.locator('#search-results-count')).toHaveText('Replaced 2 occurrences');
    expect(fs.readFileSync(file, 'utf8')).toBe('catcat catcat\n');
    expect(fs.readdirSync(path.join(root, '.nightowl-backups')).some(name => name.endsWith('.bak'))).toBe(true);
  } finally {
    await appPage.evaluate(async previous => {
      await window.electronAPI.workspace.switchWorkspace(previous);
      window.appSettings.workingDirectory = previous;
    }, previous);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
