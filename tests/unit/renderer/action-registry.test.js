const {
  CORE_SHORTCUTS,
  createActionRegistry,
  normalizeShortcut,
  normalizeShortcutForPlatform,
  formatShortcut,
  getElectronAccelerator,
  eventMatchesShortcut,
  getCatalogShortcutConflicts
} = require('../../../orchestrator/modules/action-registry');

describe('NightOwl action registry', () => {
  test('normalizes portable shortcuts for renderer display and Electron menus', () => {
    expect(normalizeShortcut('Cmd+Shift+P')).toBe('Mod+Shift+P');
    expect(normalizeShortcutForPlatform('Mod+Shift+P', 'MacIntel')).toBe('Meta+Shift+P');
    expect(normalizeShortcutForPlatform('Mod+Shift+P', 'Win32')).toBe('Control+Shift+P');
    expect(formatShortcut('Mod+Alt+O', 'MacIntel')).toBe('Cmd+Alt+O');
    expect(formatShortcut('Mod+Alt+O', 'Win32')).toBe('Ctrl+Alt+O');
    expect(getElectronAccelerator('file.quickOpen')).toBe('CmdOrCtrl+P');
  });

  test('keeps the canonical shortcut catalog conflict-free on macOS and Windows', () => {
    expect(Object.keys(CORE_SHORTCUTS).length).toBeGreaterThan(20);
    expect(getCatalogShortcutConflicts('MacIntel')).toEqual([]);
    expect(getCatalogShortcutConflicts('Win32')).toEqual([]);
    expect(CORE_SHORTCUTS['app.commandPalette'].shortcut).toBe('Mod+Shift+P');
    expect(CORE_SHORTCUTS['file.quickOpen'].shortcut).toBe('Mod+P');
    expect(CORE_SHORTCUTS['view.togglePreview'].shortcut).toBe('Mod+Shift+M');
    expect(CORE_SHORTCUTS['view.visualMarkdown'].shortcut).toBe('Mod+Shift+V');
  });

  test('registers, searches, executes, and rejects duplicate action identities', async () => {
    const registry = createActionRegistry({ platform: 'MacIntel' });
    const run = jest.fn().mockReturnValue('done');

    registry.register({
      id: 'feature.example',
      label: 'Example: Run Feature',
      category: 'Example',
      keywords: ['sample'],
      run
    });

    expect(registry.search('sample').map(action => action.id)).toEqual(['feature.example']);
    await expect(registry.execute('feature.example', { source: 'test' })).resolves.toBe('done');
    expect(run).toHaveBeenCalledWith({ source: 'test' });
    expect(() => registry.register({
      id: 'feature.example',
      label: 'Example: Duplicate',
      run: () => {}
    })).toThrow('Action already registered: feature.example');
  });

  test('reports conflicts for two active actions in the same shortcut scope', () => {
    const registry = createActionRegistry({ platform: 'MacIntel' });
    registry.register({
      id: 'feature.first',
      label: 'Feature: First',
      shortcut: 'Mod+Alt+9',
      shortcutScope: 'global',
      run: () => {}
    });
    registry.register({
      id: 'feature.second',
      label: 'Feature: Second',
      shortcut: 'Cmd+Alt+9',
      shortcutScope: 'global',
      run: () => {}
    });

    expect(registry.getShortcutConflicts()).toEqual([{
      assignment: 'global:Meta+Alt+9',
      actionIds: ['feature.first', 'feature.second']
    }]);
  });

  test('dispatches registered shortcuts and respects ordinary form inputs', async () => {
    const registry = createActionRegistry({ platform: 'MacIntel' });
    const run = jest.fn();
    registry.register({
      id: 'feature.keyboard',
      label: 'Feature: Keyboard Action',
      shortcut: 'Mod+Shift+Y',
      run
    });
    const dispose = registry.installShortcutHandler(document);

    document.body.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'y', metaKey: true, shiftKey: true, bubbles: true, cancelable: true
    }));
    await Promise.resolve();
    expect(run).toHaveBeenCalledTimes(1);

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'y', metaKey: true, shiftKey: true, bubbles: true, cancelable: true
    }));
    await Promise.resolve();
    expect(run).toHaveBeenCalledTimes(1);

    dispose();
    input.remove();
  });

  test('matches physical keyboard events against portable shortcuts', () => {
    const macEvent = { key: 'p', metaKey: true, ctrlKey: false, altKey: false, shiftKey: true };
    const windowsEvent = { key: 'p', metaKey: false, ctrlKey: true, altKey: false, shiftKey: true };
    expect(eventMatchesShortcut(macEvent, 'Mod+Shift+P', 'MacIntel')).toBe(true);
    expect(eventMatchesShortcut(windowsEvent, 'Mod+Shift+P', 'Win32')).toBe(true);
    expect(eventMatchesShortcut(macEvent, 'Mod+P', 'MacIntel')).toBe(false);
  });
});
