'use strict';

const { ipcMain } = require('electron');
const fsSync = require('fs');
const path = require('path');
const { createRuntimeWorkspaceResolver, pathExists } = require('./runtimeWorkspace');
const { isInside, WorkspaceIndex } = require('../services/workspaceIndex');

let activeRegistration = null;

function cleanup() {
  if (!activeRegistration) return false;
  activeRegistration.cleanup();
  activeRegistration = null;
  return true;
}

function getActiveIndex() {
  return activeRegistration?.index || null;
}

function invalidate(reason = 'application-file-mutation') {
  const index = getActiveIndex();
  if (!index) return false;
  index.invalidate(reason);
  return true;
}

function getDiagnostics() {
  if (!activeRegistration) {
    return { active: false, watchers: 0, indexed: 0, state: 'idle', dirty: true };
  }
  const status = activeRegistration.index.getStatus();
  return {
    active: true,
    watchers: activeRegistration.watchers.size,
    indexed: status.indexed,
    state: status.state,
    dirty: status.dirty,
    durationMs: status.durationMs,
    budget: status.budget
  };
}

function register(deps) {
  cleanup();
  const {
    appSettings,
    currentWorkingDirectory,
    getCurrentWorkingDirectory,
    mainWindow,
    getMainWindow
  } = deps;
  const index = new WorkspaceIndex();
  const watchers = new Map();
  const getWorkingDirectory = createRuntimeWorkspaceResolver({
    appSettings,
    currentWorkingDirectory,
    getCurrentWorkingDirectory
  });

  function rendererWindow() {
    return typeof getMainWindow === 'function' ? getMainWindow() : mainWindow;
  }

  function sendProgress(progress) {
    const target = rendererWindow();
    if (!target?.isDestroyed?.() && target?.webContents?.send) {
      target.webContents.send('workspace-index-progress', progress);
    }
  }

  function stopWatchers() {
    for (const watcher of watchers.values()) {
      try { watcher.close(); } catch (_) { /* already closed */ }
    }
    watchers.clear();
  }

  function watchRoots(roots) {
    const signature = roots.join('\n');
    if (signature === activeRegistration?.watchSignature) return;
    stopWatchers();
    for (const root of roots) {
      try {
        const watcher = fsSync.watch(root, { recursive: true, persistent: false }, (eventType, fileName) => {
          index.invalidate(`watch:${eventType}:${String(fileName || '')}`);
        });
        watcher.on?.('error', () => {
          watchers.delete(root);
          index.invalidate('watch-error');
        });
        watchers.set(root, watcher);
      } catch (_) {
        // Recursive watching is not supported on every platform. Queries force
        // a metadata verification scan when any root lacks a watcher.
      }
    }
    if (activeRegistration) activeRegistration.watchSignature = signature;
  }

  function syncRoots() {
    const primary = getWorkingDirectory();
    const candidates = [primary, ...(Array.isArray(appSettings.workspaceFolders) ? appSettings.workspaceFolders : [])]
      .filter(root => typeof root === 'string' && pathExists(root));
    const roots = index.setRoots(candidates);
    watchRoots(roots);
    return roots;
  }

  function assertWorkspacePath(value, label, options = {}) {
    if (value == null && options.optional) return null;
    if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
    const resolved = path.resolve(value);
    if (!index.roots.some(root => isInside(root, resolved))) throw new Error(`${label} is outside the active workspace`);
    return resolved;
  }

  function sanitizeOptions(input = {}) {
    const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    const result = {
      query: source.query == null ? '' : String(source.query),
      limit: source.limit == null ? undefined : Number(source.limit),
      maxResults: source.maxResults == null ? undefined : Number(source.maxResults),
      caseSensitive: source.caseSensitive === true,
      wholeWord: source.wholeWord === true,
      useRegex: source.useRegex === true,
      filePattern: source.filePattern == null ? undefined : String(source.filePattern),
      extensions: Array.isArray(source.extensions) ? source.extensions.map(String) : undefined,
      formats: Array.isArray(source.formats) ? source.formats.map(String) : undefined
    };
    if (Array.isArray(source.paths)) result.paths = source.paths.map(item => assertWorkspacePath(item, 'Scoped path'));
    return result;
  }

  async function prepare(options = {}) {
    const roots = syncRoots();
    if (!roots.length) throw new Error('No active workspace folder exists');
    if (watchers.size < roots.length && index.getStatus().state === 'ready') {
      index.invalidate('unwatched-verification');
    }
    await index.ensureFresh({ ...options, onProgress: sendProgress });
  }

  async function handle(operation) {
    try {
      syncRoots();
      return await operation();
    } catch (error) {
      return { success: false, error: error.message || String(error) };
    }
  }

  ipcMain.handle('workspace-index-refresh', (_event, request = {}) => handle(async () => {
    syncRoots();
    if (request.force !== false) index.invalidate('manual-refresh');
    return index.refresh({ onProgress: sendProgress });
  }));
  ipcMain.handle('workspace-index-cancel', () => ({ success: true, cancelled: index.cancel() }));
  ipcMain.handle('workspace-index-status', () => ({ success: true, ...index.getStatus(), watchers: watchers.size }));
  ipcMain.handle('workspace-index-list', (_event, request = {}) => handle(async () => {
    await prepare();
    return index.list(sanitizeOptions(request));
  }));
  ipcMain.handle('workspace-index-search', (_event, request = {}) => handle(async () => {
    await prepare();
    return index.search(String(request.query || ''), sanitizeOptions(request.options));
  }));
  ipcMain.handle('workspace-index-links', (_event, request = {}) => handle(async () => {
    await prepare();
    return index.getLinks({ filePath: assertWorkspacePath(request.filePath, 'File path', { optional: true }) });
  }));
  ipcMain.handle('workspace-index-resolve-link', (_event, request = {}) => handle(async () => {
    await prepare();
    return index.resolveLink(
      assertWorkspacePath(request.sourcePath, 'Source path', { optional: true }),
      String(request.target || '')
    );
  }));
  ipcMain.handle('workspace-index-plan-rename', (_event, request = {}) => handle(async () => {
    await prepare();
    return index.planRename(
      assertWorkspacePath(request.filePath, 'File path'),
      assertWorkspacePath(request.newPath, 'New path')
    );
  }));
  ipcMain.handle('workspace-index-graph', (_event, request = {}) => handle(async () => {
    await prepare();
    return index.graph(sanitizeOptions({ paths: request.paths }));
  }));

  activeRegistration = {
    index,
    watchers,
    watchSignature: '',
    prepare,
    syncRoots,
    cleanup: () => {
      index.cancel();
      stopWatchers();
    }
  };
  syncRoots();
  return activeRegistration;
}

async function list(options = {}) {
  if (!activeRegistration) return null;
  await activeRegistration.prepare();
  return activeRegistration.index.list(options);
}

async function search(query, options = {}) {
  if (!activeRegistration) return null;
  await activeRegistration.prepare();
  return activeRegistration.index.search(query, options);
}

module.exports = {
  cleanup,
  getActiveIndex,
  getDiagnostics,
  invalidate,
  list,
  register,
  search
};
