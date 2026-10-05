const path = require('path');
const fs = require('fs');
const { createElectronApiMock } = require('../../helpers/electron-api-mock');

const modulePath = path.resolve(__dirname, '../../../orchestrator/modules/commandPalette.js');

describe('command palette lifecycle and shortcuts', () => {
  let listeners;
  let callbackNames;

  beforeEach(() => {
    jest.resetModules();
    document.getElementById = Document.prototype.getElementById;
    document.body.innerHTML = '<button id="command-palette-btn">Commands</button><textarea id="writing"></textarea>';
    window.editor = { focus: jest.fn(), updateOptions: jest.fn(), getRawOptions: jest.fn(() => ({ wordWrap: 'bounded' })) };
    window.showNotification = jest.fn();
    window.electronAPI = createElectronApiMock().api;
    window.appSettings = { editor: { wordWrap: 'bounded' } };
    delete window.NightOwlActions;
    const registryModule = require('../../../orchestrator/modules/action-registry');
    window.NightOwlActions = registryModule.createActionRegistry({ platform: 'Win32' });
    callbackNames = [];
    listeners = jest.spyOn(document, 'addEventListener');
    require(modulePath);
    window.initializeCommandPalette();
  });

  afterEach(() => {
    window.hideCommandPalette();
    window.__nightOwlActionShortcutCleanup?.();
    delete window.__nightOwlActionShortcutCleanup;
    for (const [type, listener, options] of listeners.mock.calls) {
      document.removeEventListener(type, listener, options);
    }
    listeners.mockRestore();
    delete window.NightOwlEditorLayout;
    for (const name of callbackNames) delete window[name];
    document.body.classList.remove('dark-mode');
  });

  function shortcut(options = {}) {
    const event = new KeyboardEvent('keydown', { key: 'P', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true, ...options });
    document.dispatchEvent(event);
    return event;
  }

  function search(query) {
    const input = document.querySelector('.command-palette-input');
    input.value = query;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return input;
  }

  function mockCallback(name, implementation) {
    callbackNames.push(name);
    window[name] = jest.fn(implementation);
    return window[name];
  }

  async function runCommand(label) {
    window.showCommandPalette();
    search(label);
    const command = document.querySelector('.command-item');
    expect(command).not.toBeNull();
    command.click();
    // Let both the command and its IPC continuations finish.
    for (let index = 0; index < 6; index++) await Promise.resolve();
  }

  test('renderer no longer overrides the command module with legacy global declarations', () => {
    const renderer = fs.readFileSync(path.resolve(__dirname, '../../../orchestrator/renderer.js'), 'utf8');
    expect(renderer).not.toMatch(/function (?:showCommandPalette|hideCommandPalette|initializeCommandPalette)\s*\(/);
  });

  test('initialization is idempotent and repeated opens keep one populated palette', () => {
    window.initializeCommandPalette();
    window.initializeCommandPalette();
    const ids = window.NightOwlActions.list().map(action => action.id);
    expect(new Set(ids).size).toBe(ids.length);
    const newFile = mockCallback('newFile');
    shortcut({ key: 'n', shiftKey: false });
    expect(newFile).toHaveBeenCalledTimes(1);
    expect(shortcut().defaultPrevented).toBe(true);
    expect(document.querySelectorAll('.command-palette-overlay')).toHaveLength(1);
    expect(document.querySelectorAll('.command-item').length).toBeGreaterThan(0);
    window.showCommandPalette();
    shortcut();
    expect(document.querySelectorAll('.command-palette-overlay')).toHaveLength(1);
    expect(document.activeElement.className).toBe('command-palette-input');
  });

  test('ordinary typing, key repeat, composition and AltGr do not open the palette', () => {
    window.initializeCommandPalette();
    shortcut({ repeat: true });
    shortcut({ isComposing: true });
    shortcut({ altKey: true });
    shortcut({ ctrlKey: false, shiftKey: false, key: 'p' });
    expect(document.querySelector('.command-palette-overlay')).toBeNull();
    shortcut({ key: 'p' });
    expect(document.querySelector('.command-palette-overlay')).not.toBeNull();
  });

  test('opening commands from an input and Escape restores the original focus', () => {
    const writing = document.getElementById('writing');
    writing.focus();
    window.initializeCommandPalette();
    writing.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }));
    const input = document.querySelector('.command-palette-input');
    expect(document.activeElement).toBe(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('.command-palette-overlay')).toBeNull();
    expect(document.activeElement).toBe(writing);
  });

  test('a command opens its dialog once and retains focus', async () => {
    const action = jest.fn(() => {
      const dialogInput = document.createElement('input');
      dialogInput.id = 'command-dialog-input';
      document.body.appendChild(dialogInput);
      dialogInput.focus();
    });
    window.registerCommand('test.dialog', 'Test: open own dialog', action);
    window.showCommandPalette();
    const input = search('open own dialog');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', repeat: true, bubbles: true }));
    expect(action).not.toHaveBeenCalled();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await Promise.resolve();
    expect(action).toHaveBeenCalledTimes(1);
    expect(document.activeElement.id).toBe('command-dialog-input');
    expect(document.querySelector('.command-palette-overlay')).toBeNull();
  });

  test('a composition-confirming Enter does not execute a command', () => {
    const action = jest.fn();
    window.registerCommand('test.ime', 'Test IME', action);
    window.showCommandPalette();
    search('Test IME').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }));
    expect(action).not.toHaveBeenCalled();
    expect(document.querySelector('.command-palette-overlay')).not.toBeNull();
  });

  test('plugin labels are rendered as text and empty searches explain the result', () => {
    window.registerCommand('test.html', 'Test <img src=x> command', jest.fn());
    window.showCommandPalette();
    search('<img');
    expect(document.querySelector('.command-label').textContent).toBe('Test <img src=x> command');
    expect(document.querySelector('.command-label img')).toBeNull();
    expect(document.querySelector('.command-label mark').textContent).toBe('<img');
    search('no matching phrase');
    expect(document.querySelector('.command-palette-no-results').textContent).toBe('No matching commands');
  });

  test('word-wrap command applies matching source and scrollbar options', () => {
    window.NightOwlEditorLayout = { applyWordWrap: jest.fn() };
    window.showCommandPalette();
    search('Toggle Word Wrap');
    document.querySelector('.command-item').click();
    expect(window.NightOwlEditorLayout.applyWordWrap).toHaveBeenCalledWith(window.editor, 'off');
  });

  test.each([
    ['Format: Bold', 'formatText', ['**', '**', 'bold text']],
    ['Format: Italic', 'formatText', ['*', '*', 'italic text']],
    ['Format: Inline Code', 'formatText', ['`', '`', 'code']],
    ['Format: Strikethrough', 'formatText', ['~~', '~~', 'strikethrough']],
    ['Format: Heading 1', 'formatHeading', [1]],
    ['Format: Heading 2', 'formatHeading', [2]],
    ['Format: Heading 3', 'formatHeading', [3]],
    ['Format: Bullet List', 'formatList', ['-']],
    ['Format: Numbered List', 'formatList', ['1.']],
    ['Format: Blockquote', 'formatBlockquote', []],
    ['Format: Insert Link', 'insertLink', []],
    ['Format: Insert Image', 'insertImage', []],
    ['Settings: Open Preferences', 'openSettingsDialog', []],
    ['Edit: Global Search', 'showPane', ['search']],
    ['Assistant: Show Terminal', 'showPane', ['chat']],
    ['Speaker Notes: Show View', 'showPane', ['speaker-notes']],
    ['Speaker Notes: Add Note', 'insertSpeakerNotesTemplate', []]
  ])('%s invokes the current application API', async (label, name, args) => {
    const callback = mockCallback(name);
    await runCommand(label);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(...args);
    expect(window.showNotification).not.toHaveBeenCalled();
  });

  test('structure and files commands reveal the sidebar and select its existing view', async () => {
    const sidebar = document.createElement('aside');
    sidebar.id = 'left-sidebar';
    sidebar.style.display = 'none';
    document.body.appendChild(sidebar);
    const toggle = mockCallback('toggleSidebar', () => { sidebar.style.display = 'flex'; });
    const switchView = mockCallback('switchStructureView');

    await runCommand('View: Show Structure Panel');
    await runCommand('View: Show File Explorer');
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(switchView.mock.calls).toEqual([['structure'], ['file']]);
  });

  test('open file uses native selection and the shared file-open controller', async () => {
    const ipc = createElectronApiMock(async () => ({ success: true, filePath: '/notes/draft.md' }));
    window.electronAPI = ipc.api;
    const open = mockCallback('openFilePathInEditor');

    await runCommand('File: Open File');
    expect(ipc.invoke.mock.calls).toEqual([['dialog-open-file']]);
    expect(open).toHaveBeenCalledWith('/notes/draft.md', {
      source: 'command-palette', refreshExistingTabContent: false
    });
  });

  test('cancelled file selection does not open a document or report an error', async () => {
    window.electronAPI = createElectronApiMock(async () => ({ success: false, canceled: true })).api;
    const open = mockCallback('openFilePathInEditor');

    await runCommand('File: Open File');
    expect(open).not.toHaveBeenCalled();
    expect(window.showNotification).not.toHaveBeenCalled();
  });

  test('open folder delegates to the fixed workspace capability', async () => {
    const ipc = createElectronApiMock(async () => ({ success: true, directory: '/notes' }));
    window.electronAPI = ipc.api;
    await runCommand('File: Open Folder');
    expect(ipc.invoke).toHaveBeenCalledWith('change-working-directory');
  });

  test('first/last file and goto line use the current navigation APIs', async () => {
    const refresh = mockCallback('updateFileTreeItems');
    const select = mockCallback('selectFileTreeItem');
    const goto = jest.fn();
    window.editor.getAction = jest.fn(() => ({ run: goto }));

    await runCommand('Navigate: First File');
    await runCommand('Navigate: Last File');
    await runCommand('Navigate: Go to Line');
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(select.mock.calls).toEqual([[0], [-1]]);
    expect(window.editor.getAction).toHaveBeenCalledWith('editor.action.gotoLine');
    expect(goto).toHaveBeenCalledTimes(1);
  });

  test('terminal commands use the integrated terminal controller', async () => {
    callbackNames.push('terminalPanel');
    window.terminalPanel = { toggle: jest.fn(), show: jest.fn(), spawnShell: jest.fn() };
    // Feature modules own their actions; the palette consumes the shared registry.
    window.registerCommand('terminal.toggle', 'Terminal: Toggle Integrated Terminal', () => window.terminalPanel.toggle());
    window.registerCommand('terminal.spawnShell', 'Terminal: Spawn Interactive Shell', () => {
      window.terminalPanel.show();
      return window.terminalPanel.spawnShell();
    });
    await runCommand('Terminal: Toggle Integrated Terminal');
    await runCommand('Terminal: Spawn Interactive Shell');
    expect(window.terminalPanel.toggle).toHaveBeenCalledTimes(1);
    expect(window.terminalPanel.show).toHaveBeenCalledTimes(1);
    expect(window.terminalPanel.spawnShell).toHaveBeenCalledTimes(1);
  });

  test('theme toggling uses the installed theme manager', async () => {
    callbackNames.push('techneThemeManager');
    window.techneThemeManager = { applyTheme: jest.fn() };
    await runCommand('Settings: Toggle Light/Dark Theme');
    document.body.classList.add('dark-mode');
    await runCommand('Settings: Toggle Light/Dark Theme');
    expect(window.techneThemeManager.applyTheme.mock.calls).toEqual([['dark'], ['light']]);
  });

  test('retired chat and nonexistent board commands are not offered', () => {
    window.showCommandPalette();
    for (const label of ['Copy Last Response', 'Load Editor Content to Chat', 'Clear Chat History', 'Summarize Document', 'Open Kanban Board']) {
      search(label);
      expect(document.querySelector('.command-item')).toBeNull();
    }
  });
});
