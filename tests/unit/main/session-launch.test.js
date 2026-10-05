const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { normalizeWorkspacePath } = require('../../../ipc/workspacePaths');
const source = fs.readFileSync(path.join(__dirname, '../../../main.js'), 'utf8');

function launchContext() {
  const appSettings = { workingDirectory: '/project', currentFile: '/project/last.md',
    editorTabs: { openTabs: [{ filePath: '/project/last.md' }], activeTabPath: '/project/last.md', activeTabIndex: 0 } };
  const context = {
    appSettings, currentFilePath: appSettings.currentFile, normalizeWorkspacePath, path,
    setPrimaryWorkingDirectory: folder => (appSettings.workingDirectory = normalizeWorkspacePath(folder)),
    addToRecentWorkspaces: jest.fn(), addToRecentFiles: jest.fn(), saveSettings: jest.fn(), debugMain: jest.fn()
  };
  vm.runInNewContext(source.slice(source.indexOf('function clearPersistedEditorTabs()'), source.indexOf('async function notifyRendererOfLaunchTarget')), context);
  return context;
}

test('relaunching the same workspace preserves its last active document and tabs', () => {
  const context = launchContext();
  context.applyLaunchTargetToSettings({ type: 'directory', path: '/project/' });
  expect(context.appSettings.currentFile).toBe('/project/last.md');
  expect(context.appSettings.editorTabs.activeTabPath).toBe('/project/last.md');
  expect(context.appSettings.editorTabs.openTabs).toHaveLength(1);
});

test('opening a different workspace clears the old session', () => {
  const context = launchContext();
  context.applyLaunchTargetToSettings({ type: 'directory', path: '/other' });
  expect(context.appSettings.currentFile).toBe('');
  expect(context.appSettings.editorTabs.openTabs).toEqual([]);
  expect(context.appSettings.editorTabs.activeTabPath).toBeNull();
});

test('an explicit file launch overrides the restored active document', () => {
  const context = launchContext();
  context.applyLaunchTargetToSettings({ type: 'file', path: '/project/requested.md' });
  expect(context.appSettings.currentFile).toBe('/project/requested.md');
  expect(context.appSettings.editorTabs.activeTabPath).toBe('/project/requested.md');
});
