/* NightOwl action registry and portable shortcut catalog.
 *
 * This module is intentionally usable from both the isolated renderer and the
 * Electron main process. The renderer owns executable actions; the main process
 * consumes only portable shortcut metadata when constructing native menus.
 */
(function initNightOwlActionRegistry(root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  if (!root || !root.document) return;

  root.NightOwlActionRegistryModule = api;
  root.NightOwlActions = root.NightOwlActions || api.createActionRegistry({
    platform: root.navigator?.platform || ''
  });

  root.registerCommand = function registerCommand(id, label, action, shortcut, options = {}) {
    const definition = typeof id === 'object'
      ? { ...id }
      : { ...options, id, label, run: action, shortcut };
    const catalogEntry = api.getShortcutDefinition(definition.id);

    return root.NightOwlActions.register({
      ...definition,
      run: definition.run || definition.action,
      shortcut: catalogEntry?.shortcut || definition.shortcut,
      shortcutScope: definition.shortcutScope || catalogEntry?.scope || 'global'
    });
  };
})(typeof globalThis !== 'undefined' ? globalThis : this, function createModule() {
  'use strict';

  const ACTION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
  const MODIFIER_ORDER = ['Mod', 'Ctrl', 'Alt', 'Shift'];
  const PHYSICAL_MODIFIER_ORDER = ['Meta', 'Control', 'Alt', 'Shift'];

  const CORE_SHORTCUTS = Object.freeze({
    'app.commandPalette': { shortcut: 'Mod+Shift+P', scope: 'global' },
    'file.quickOpen': { shortcut: 'Mod+P', scope: 'global' },
    'file.new': { shortcut: 'Mod+N', scope: 'global' },
    'file.open': { shortcut: 'Mod+O', scope: 'global' },
    'file.openFolder': { shortcut: 'Mod+Alt+O', scope: 'global' },
    'file.save': { shortcut: 'Mod+S', scope: 'global' },
    'file.saveAs': { shortcut: 'Mod+Shift+S', scope: 'global' },
    'file.closeTab': { shortcut: 'Mod+W', scope: 'global' },
    'edit.undo': { shortcut: 'Mod+Z', scope: 'editor' },
    'edit.redo': { shortcut: 'Mod+Shift+Z', scope: 'editor' },
    'edit.cut': { shortcut: 'Mod+X', scope: 'editor' },
    'edit.copy': { shortcut: 'Mod+C', scope: 'editor' },
    'edit.paste': { shortcut: 'Mod+V', scope: 'editor' },
    'edit.selectAll': { shortcut: 'Mod+A', scope: 'editor' },
    'edit.find': { shortcut: 'Mod+F', scope: 'editor' },
    'edit.replace': { shortcut: 'Mod+H', scope: 'editor' },
    'edit.findGlobal': { shortcut: 'Mod+Shift+F', scope: 'global' },
    'settings.open': { shortcut: 'Mod+,', scope: 'global' },
    'view.editorMode': { shortcut: 'Mod+1', scope: 'global' },
    'view.presentationMode': { shortcut: 'Mod+2', scope: 'global' },
    'view.networkMode': { shortcut: 'Mod+3', scope: 'global' },
    'view.circleMode': { shortcut: 'Mod+4', scope: 'global' },
    'view.libraryMode': { shortcut: 'Mod+5', scope: 'global' },
    'view.writingStats': { shortcut: 'Mod+Shift+G', scope: 'global' },
    'view.visualMarkdown': { shortcut: 'Mod+Shift+V', scope: 'editor' },
    'view.togglePreview': { shortcut: 'Mod+Shift+M', scope: 'editor' },
    'view.wordWrap.toggle': { shortcut: 'Alt+Z', scope: 'editor' },
    'view.zenMode': { shortcut: 'Mod+Shift+Enter', scope: 'global' },
    'view.focusMode': { shortcut: 'Mod+.', scope: 'editor' },
    'terminal.toggle': { shortcut: 'Mod+Alt+`', scope: 'global' },
    'format.bold': { shortcut: 'Mod+B', scope: 'editor' },
    'format.italic': { shortcut: 'Mod+I', scope: 'editor' },
    'format.code': { shortcut: 'Mod+`', scope: 'editor' },
    'format.strikethrough': { shortcut: 'Mod+Shift+X', scope: 'editor' },
    'format.heading1': { shortcut: 'Mod+Alt+1', scope: 'editor' },
    'format.heading2': { shortcut: 'Mod+Alt+2', scope: 'editor' },
    'format.heading3': { shortcut: 'Mod+Alt+3', scope: 'editor' },
    'format.bulletList': { shortcut: 'Mod+Shift+8', scope: 'editor' },
    'format.numberedList': { shortcut: 'Mod+Shift+7', scope: 'editor' },
    'format.insertLink': { shortcut: 'Mod+K', scope: 'editor' },
    'format.insertImage': { shortcut: 'Mod+Shift+I', scope: 'editor' },
    'format.blockquote': { shortcut: 'Mod+Shift+.', scope: 'editor' },
    'fold.current': { shortcut: 'Mod+Shift+[', scope: 'editor' },
    'fold.unfoldCurrent': { shortcut: 'Mod+Shift+]', scope: 'editor' },
    'nav.gotoLine': { shortcut: 'Mod+G', scope: 'editor' },
    'presentation.start': { shortcut: 'F5', scope: 'presentation' },
    'presentation.exit': { shortcut: 'Escape', scope: 'presentation' },
    'presentation.firstSlide': { shortcut: 'Home', scope: 'presentation' },
    'app.quit': { shortcut: 'Mod+Q', scope: 'global' }
  });

  function canonicalToken(token) {
    const value = String(token || '').trim();
    const lower = value.toLowerCase();
    if (['mod', 'cmdorctrl', 'cmd', 'command', 'meta', 'ctrlcmd'].includes(lower)) return 'Mod';
    if (['ctrl', 'control'].includes(lower)) return 'Ctrl';
    if (['alt', 'option', 'opt'].includes(lower)) return 'Alt';
    if (lower === 'shift') return 'Shift';
    if (lower === 'esc') return 'Escape';
    if (lower === 'space') return 'Space';
    if (value.length === 1 && /[a-z]/i.test(value)) return value.toUpperCase();
    if (/^f\d{1,2}$/i.test(value)) return value.toUpperCase();
    return value.length > 1 ? value[0].toUpperCase() + value.slice(1) : value;
  }

  function normalizeShortcut(shortcut) {
    if (!shortcut || shortcut === false) return null;
    const tokens = String(shortcut).split('+').map(canonicalToken).filter(Boolean);
    const modifiers = MODIFIER_ORDER.filter(modifier => tokens.includes(modifier));
    const keys = tokens.filter(token => !MODIFIER_ORDER.includes(token));
    if (keys.length !== 1) {
      throw new Error(`Shortcut must contain exactly one key: ${shortcut}`);
    }
    return [...modifiers, keys[0]].join('+');
  }

  function isMacPlatform(platform = '') {
    return /mac|darwin/i.test(String(platform));
  }

  function shortcutTokensForPlatform(shortcut, platform = '') {
    const normalized = normalizeShortcut(shortcut);
    if (!normalized) return [];
    const tokens = normalized.split('+');
    const mapped = tokens.map(token => {
      if (token === 'Mod') return isMacPlatform(platform) ? 'Meta' : 'Control';
      if (token === 'Ctrl') return 'Control';
      return token;
    });
    const modifiers = PHYSICAL_MODIFIER_ORDER.filter(modifier => mapped.includes(modifier));
    const keys = mapped.filter(token => !PHYSICAL_MODIFIER_ORDER.includes(token));
    return [...modifiers, ...keys];
  }

  function normalizeShortcutForPlatform(shortcut, platform = '') {
    return shortcutTokensForPlatform(shortcut, platform).join('+') || null;
  }

  function formatShortcut(shortcut, platform = '') {
    const normalized = normalizeShortcut(shortcut);
    if (!normalized) return '';
    return normalized.split('+').map(token => {
      if (token === 'Mod') return isMacPlatform(platform) ? 'Cmd' : 'Ctrl';
      if (token === 'Ctrl') return 'Ctrl';
      return token;
    }).join('+');
  }

  function toElectronAccelerator(shortcut) {
    const normalized = normalizeShortcut(shortcut);
    if (!normalized) return undefined;
    return normalized.split('+').map(token => {
      if (token === 'Mod') return 'CmdOrCtrl';
      if (token === 'Ctrl') return 'Control';
      return token;
    }).join('+');
  }

  function getShortcutDefinition(actionId) {
    return CORE_SHORTCUTS[actionId] || null;
  }

  function getShortcutForAction(actionId) {
    return getShortcutDefinition(actionId)?.shortcut || null;
  }

  function getElectronAccelerator(actionId) {
    return toElectronAccelerator(getShortcutForAction(actionId));
  }

  function eventShortcut(event, platform = '') {
    const tokens = [];
    if (event.metaKey) tokens.push('Meta');
    if (event.ctrlKey) tokens.push('Control');
    if (event.altKey) tokens.push('Alt');
    if (event.shiftKey) tokens.push('Shift');
    let key = canonicalToken(event.key);
    if (['Mod', 'Ctrl', 'Alt', 'Shift'].includes(key)) return null;
    if (key === ' ') key = 'Space';
    return [...PHYSICAL_MODIFIER_ORDER.filter(token => tokens.includes(token)), key].join('+');
  }

  function eventMatchesShortcut(event, shortcut, platform = '') {
    return eventShortcut(event, platform) === normalizeShortcutForPlatform(shortcut, platform);
  }

  function inferCategory(label) {
    const prefix = String(label || '').split(':', 1)[0].trim();
    return prefix || 'Other';
  }

  function validateDefinition(definition) {
    if (!definition || typeof definition !== 'object') throw new Error('Action definition is required.');
    if (!ACTION_ID_PATTERN.test(definition.id || '')) throw new Error(`Invalid action id: ${definition.id || ''}`);
    if (!String(definition.label || '').trim()) throw new Error(`Action ${definition.id} requires a label.`);
    if (typeof definition.run !== 'function') throw new Error(`Action ${definition.id} requires a run function.`);
  }

  function findShortcutConflicts(actions, platform = '') {
    const assignments = new Map();
    for (const action of actions || []) {
      if (!action?.shortcut) continue;
      const physical = normalizeShortcutForPlatform(action.shortcut, platform);
      const scope = action.shortcutScope || 'global';
      const key = `${scope}:${physical}`;
      if (!assignments.has(key)) assignments.set(key, []);
      assignments.get(key).push(action.id);
    }
    return Array.from(assignments.entries())
      .filter(([, ids]) => new Set(ids).size > 1)
      .map(([assignment, ids]) => ({ assignment, actionIds: [...new Set(ids)].sort() }));
  }

  function getCatalogShortcutConflicts(platform = '') {
    return findShortcutConflicts(Object.entries(CORE_SHORTCUTS).map(([id, entry]) => ({
      id,
      shortcut: entry.shortcut,
      shortcutScope: entry.scope
    })), platform);
  }

  function createActionRegistry({ platform = '' } = {}) {
    const actions = new Map();
    const listeners = new Set();

    function emit(type, action) {
      for (const listener of listeners) listener({ type, action });
    }

    function register(definition) {
      const catalogEntry = getShortcutDefinition(definition?.id);
      const action = {
        category: inferCategory(definition?.label),
        owner: 'core',
        shortcutScope: catalogEntry?.scope || 'global',
        allowInInput: false,
        handleShortcut: true,
        ...definition,
        shortcut: catalogEntry?.shortcut || definition?.shortcut || null
      };
      validateDefinition(action);
      action.shortcut = normalizeShortcut(action.shortcut);
      action.searchText = [action.label, action.category, ...(action.keywords || [])]
        .join(' ')
        .toLowerCase();

      const existed = actions.has(action.id);
      if (existed && !action.replace) {
        throw new Error(`Action already registered: ${action.id}`);
      }
      actions.set(action.id, Object.freeze({ ...action }));
      emit(existed ? 'updated' : 'registered', actions.get(action.id));
      return actions.get(action.id);
    }

    function unregister(id) {
      const action = actions.get(id);
      if (!action) return false;
      actions.delete(id);
      emit('unregistered', action);
      return true;
    }

    function get(id) {
      return actions.get(id) || null;
    }

    function isAvailable(action, context) {
      if (!action) return false;
      if (typeof action.enabled === 'function' && !action.enabled(context)) return false;
      if (action.enabled === false) return false;
      if (typeof action.when === 'function' && !action.when(context)) return false;
      return true;
    }

    function list({ includeUnavailable = true, context } = {}) {
      return Array.from(actions.values())
        .filter(action => includeUnavailable || isAvailable(action, context))
        .sort((left, right) => left.label.localeCompare(right.label));
    }

    function search(query = '', options = {}) {
      const needle = String(query).trim().toLowerCase();
      return list(options).filter(action => !needle || action.searchText.includes(needle));
    }

    async function execute(id, context, ...args) {
      const action = get(id);
      if (!action) throw new Error(`Unknown action: ${id}`);
      if (!isAvailable(action, context)) throw new Error(`Action is unavailable: ${id}`);
      return action.run(context, ...args);
    }

    function subscribe(listener) {
      if (typeof listener !== 'function') return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    }

    function getShortcutConflicts() {
      return findShortcutConflicts(list(), platform);
    }

    function installShortcutHandler(target, { contextProvider = () => undefined } = {}) {
      if (!target?.addEventListener) return () => {};
      const handler = event => {
        if (event.defaultPrevented || event.repeat) return;
        const context = contextProvider(event);
        const targetElement = event.target;
        const isMonacoInput = Boolean(targetElement?.closest?.('.monaco-editor'));
        const isFormInput = !isMonacoInput && Boolean(
          targetElement?.matches?.('input, textarea, select, [contenteditable="true"]')
        );
        const action = list({ includeUnavailable: false, context }).find(candidate => (
          candidate.handleShortcut !== false &&
          candidate.shortcut &&
          (!isFormInput || candidate.allowInInput) &&
          eventMatchesShortcut(event, candidate.shortcut, platform)
        ));
        if (!action) return;
        event.preventDefault();
        event.stopImmediatePropagation?.();
        Promise.resolve(execute(action.id, context)).catch(error => {
          console.error(`[Actions] Failed to execute ${action.id}:`, error);
        });
      };
      target.addEventListener('keydown', handler, true);
      return () => target.removeEventListener('keydown', handler, true);
    }

    return Object.freeze({
      register,
      unregister,
      get,
      list,
      search,
      execute,
      subscribe,
      isAvailable,
      getShortcutConflicts,
      installShortcutHandler,
      platform
    });
  }

  return Object.freeze({
    ACTION_ID_PATTERN,
    CORE_SHORTCUTS,
    createActionRegistry,
    normalizeShortcut,
    normalizeShortcutForPlatform,
    formatShortcut,
    toElectronAccelerator,
    getShortcutDefinition,
    getShortcutForAction,
    getElectronAccelerator,
    eventMatchesShortcut,
    findShortcutConflicts,
    getCatalogShortcutConflicts
  });
});
