/**
 * Split Editor Module
 * Allows opening two files side-by-side in the editor area.
 *
 * @module split-editor
 */

(function () {
  'use strict';

  let splitActive = false;
  let secondEditor = null;
  let currentFile = null;
  let openRequest = 0;
  let originalPaneStyle = null;
  let cleanupResizer = null;

  function reportError(message, error) {
    console.error(`[SplitEditor] ${message}:`, error);
    if (typeof window.showNotification === 'function') {
      window.showNotification(`${message}: ${error.message || error}`, 'error');
    }
  }

  function disposeFile(file) {
    if (!file) return;
    clearTimeout(file.saveTimer);
    file.changeSubscription?.dispose();
    file.sourceSubscription?.dispose();
    file.model.dispose();
  }

  function getPrimaryTab(filePath) {
    const tab = window.tabManager?.tabs?.get(filePath);
    return tab?.model && !tab.model.isDisposed?.() ? tab : null;
  }

  // Keep each save bound to its own model/path and finish pending edits before
  // replacing or closing the pane. Serializing saves also prevents an older
  // slow write from overwriting a newer edit.
  async function saveFile(file) {
    if (!file) return true;
    clearTimeout(file.saveTimer);
    file.saveTimer = null;
    if (file.readOnly) return true;
    if (file.savePromise) return file.savePromise;
    file.savePromise = (async () => {
      try {
        while (file.model.getValue() !== file.savedContent) {
          // A file opened independently in this pane may subsequently acquire
          // a primary tab. Retain both buffers until the user resolves them.
          if (getPrimaryTab(file.path)) {
            throw new Error('This file is also open in the main editor. Your split edits are preserved; close the main tab before retrying this save.');
          }
          const content = file.model.getValue();
          const result = await window.electronAPI.invoke('perform-save-with-path', content, file.path, {
            expectedContent: file.savedContent
          });
          if (!result?.success) throw new Error(result?.error || 'Save was not confirmed');
          file.savedContent = content;
        }
        return true;
      } catch (error) {
        reportError('Could not save split editor file', error);
        return false;
      }
    })();
    try {
      return await file.savePromise;
    } finally {
      file.savePromise = null;
    }
  }

  function getEditorPane() {
    return document.getElementById('editor-pane');
  }

  function getSecondPane() {
    return document.getElementById('editor-pane-2');
  }

  function getSplitResizer() {
    return document.getElementById('split-editor-resizer');
  }

  function activateSplit() {
    if (splitActive) return true;

    const editorPane = getEditorPane();
    if (!editorPane?.parentNode || !window.monaco?.editor) return false;

    originalPaneStyle = { flex: editorPane.style.flex, width: editorPane.style.width };
    editorPane.style.flex = '1';

    // Create resizer
    const resizer = document.createElement('div');
    resizer.id = 'split-editor-resizer';
    resizer.className = 'resizer';
    resizer.style.cssText = 'width: 4px; cursor: ew-resize; background: #ddd; flex-shrink: 0;';
    editorPane.parentNode.insertBefore(resizer, editorPane.nextSibling);

    // Create second editor pane
    const secondPane = document.createElement('div');
    secondPane.id = 'editor-pane-2';
    secondPane.style.cssText = 'flex: 1; display: flex; flex-direction: column; min-width: 100px; position: relative;';

    // Header showing filename
    const header = document.createElement('div');
    header.id = 'split-editor-header';
    header.style.cssText = 'height: 24px; background: var(--neutral-50, #f8f8f8); border-bottom: 1px solid var(--neutral-200, #ddd); display: flex; align-items: center; justify-content: space-between; padding: 0 8px; font-size: 11px; color: #666; flex-shrink: 0;';
    header.innerHTML = `
      <span id="split-editor-filename" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">No file open</span>
      <button id="split-editor-close" style="background:none;border:none;font-size:14px;cursor:pointer;color:#888;padding:0 4px;" title="Close split">✕</button>
    `;
    secondPane.appendChild(header);

    // Editor container
    const container = document.createElement('div');
    container.id = 'editor-container-2';
    container.style.cssText = 'flex: 1; width: 100%;';
    secondPane.appendChild(container);

    resizer.parentNode.insertBefore(secondPane, resizer.nextSibling);

    // Move the second pane before the main resizer (before #resizer)
    const mainResizer = document.getElementById('resizer');
    if (mainResizer) {
      mainResizer.parentNode.insertBefore(secondPane, mainResizer);
      mainResizer.parentNode.insertBefore(resizer, secondPane);
    }

    // Create second Monaco editor
    const theme = typeof window.getMonacoTheme === 'function'
      ? window.getMonacoTheme('markdown')
      : (document.body.classList.contains('dark-mode') ? 'vs-dark' : 'markdown-light');
    try {
      secondEditor = window.monaco.editor.create(container, {
        model: null,
        language: 'plaintext',
        theme: theme,
        automaticLayout: true,
        wordWrap: 'on',
        minimap: { enabled: false },
        folding: true,
        scrollBeyondLastLine: false,
        stickyScroll: { enabled: false }
      });
    } catch (error) {
      secondPane.remove();
      resizer.remove();
      editorPane.style.flex = originalPaneStyle.flex;
      editorPane.style.width = originalPaneStyle.width;
      originalPaneStyle = null;
      reportError('Could not create split editor', error);
      return false;
    }

    // Close button
    document.getElementById('split-editor-close').addEventListener('click', deactivateSplit);

    // Resizer drag
    cleanupResizer = initSplitResizer(resizer, editorPane, secondPane);

    splitActive = true;
    return true;
  }

  async function deactivateSplit() {
    // Invalidate even a pending first open, before it has created any pane.
    const request = ++openRequest;
    if (!splitActive) return true;
    if (currentFile && !await saveFile(currentFile)) return false;
    if (request !== openRequest) return false;

    cleanupResizer?.();
    cleanupResizer = null;
    if (secondEditor) {
      secondEditor.setModel(null);
      secondEditor.dispose();
      secondEditor = null;
    }
    disposeFile(currentFile);
    currentFile = null;

    getSecondPane()?.remove();
    getSplitResizer()?.remove();

    const editorPane = getEditorPane();
    if (editorPane && originalPaneStyle) {
      editorPane.style.flex = originalPaneStyle.flex;
      editorPane.style.width = originalPaneStyle.width;
    }
    originalPaneStyle = null;
    splitActive = false;

    if (window.editor?.layout) window.editor.layout();
    return true;
  }

  async function openInSplit(filePath) {
    const request = ++openRequest;
    if (typeof filePath !== 'string' || !filePath || !window.electronAPI?.invoke) return false;
    if (currentFile?.path === filePath) {
      secondEditor?.focus?.();
      return true;
    }

    try {
      // Primary tabs own their editable buffers. Show their current draft in a
      // read-only clone so two independent models cannot overwrite one another.
      let sourceTab = getPrimaryTab(filePath);
      let content = sourceTab?.model.getValue();
      if (!sourceTab) {
        // Failed reads must not create a blank pane or replace an existing file.
        const result = await window.electronAPI.invoke('read-file', filePath);
        if (request !== openRequest) return false;
        sourceTab = getPrimaryTab(filePath);
        content = sourceTab ? sourceTab.model.getValue()
          : (typeof result === 'string' ? result : result?.content);
        if (!sourceTab && (result?.success === false || typeof content !== 'string')) {
          throw new Error(result?.error || 'File content was unavailable');
        }
      }

      if (currentFile && !await saveFile(currentFile)) return false;
      if (request !== openRequest) return false;
      if (!window.monaco?.editor || !getEditorPane()) return false;
      // Flushing the outgoing split can yield long enough for primary ownership
      // or its content to change. Recheck before installing the new model.
      sourceTab = getPrimaryTab(filePath) || sourceTab;
      if (sourceTab && !sourceTab.model.isDisposed?.()) content = sourceTab.model.getValue();
      const readOnly = Boolean(sourceTab);
      const model = window.monaco.editor.createModel(content, detectLanguage(filePath));
      if (!activateSplit()) {
        model.dispose();
        return false;
      }

      const previousFile = currentFile;
      try {
        secondEditor.setModel(model);
        secondEditor.updateOptions({ readOnly, domReadOnly: readOnly });
      } catch (error) {
        model.dispose();
        throw error;
      }
      currentFile = { path: filePath, model, readOnly, savedContent: content, saveTimer: null, savePromise: null };
      disposeFile(previousFile);

      const filenameEl = document.getElementById('split-editor-filename');
      if (filenameEl) {
        filenameEl.textContent = filePath.split(/[\\/]/).pop() + (readOnly ? ' (read-only)' : '');
        filenameEl.title = filePath + (readOnly ? ' — edit this file in its main tab' : '');
      }

      const file = currentFile;
      if (readOnly) {
        if (!sourceTab.model.isDisposed?.()) {
          file.sourceSubscription = sourceTab.model.onDidChangeContent(() => {
            const latest = sourceTab.model.getValue();
            if (model.getValue() !== latest) model.setValue(latest);
            file.savedContent = latest;
          });
        }
      } else {
        file.changeSubscription = model.onDidChangeContent(() => {
          clearTimeout(file.saveTimer);
          file.saveTimer = setTimeout(() => saveFile(file), 2000);
        });
      }
      return true;
    } catch (error) {
      if (request === openRequest) reportError('Could not open split editor file', error);
      return false;
    }
  }

  function detectLanguage(filePath) {
    filePath = filePath.toLowerCase();
    if (filePath.endsWith('.js')) return 'javascript';
    if (filePath.endsWith('.ts')) return 'typescript';
    if (filePath.endsWith('.json')) return 'json';
    if (filePath.endsWith('.html') || filePath.endsWith('.htm')) return 'html';
    if (filePath.endsWith('.css')) return 'css';
    if (filePath.endsWith('.md')) return 'markdown';
    if (filePath.endsWith('.py')) return 'python';
    if (filePath.endsWith('.sh')) return 'shell';
    if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) return 'yaml';
    if (filePath.endsWith('.xml')) return 'xml';
    return 'plaintext';
  }

  function initSplitResizer(resizer, leftPane, rightPane) {
    let startX, leftWidth, pairWidth;
    let dragging = false;
    let originalCursor, originalUserSelect;

    function onMouseDown(e) {
      if (e.button !== 0) return;
      e.preventDefault();
      startX = e.clientX;
      leftWidth = leftPane.getBoundingClientRect().width;
      pairWidth = leftWidth + rightPane.getBoundingClientRect().width;
      originalCursor = document.body.style.cursor;
      originalUserSelect = document.body.style.userSelect;
      dragging = true;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
    }

    function onMouseMove(e) {
      const newLeftWidth = leftWidth + e.clientX - startX;
      if (newLeftWidth >= 100 && newLeftWidth <= pairWidth - 100) {
        leftPane.style.flex = 'none';
        leftPane.style.width = newLeftWidth + 'px';
        rightPane.style.flex = '1';
      }
    }

    function onMouseUp() {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      if (!dragging) return;
      dragging = false;
      document.body.style.cursor = originalCursor;
      document.body.style.userSelect = originalUserSelect;
      window.editor?.layout?.();
      secondEditor?.layout?.();
    }

    resizer.addEventListener('mousedown', onMouseDown);
    return () => {
      onMouseUp();
      resizer.removeEventListener('mousedown', onMouseDown);
    };
  }

  // Register command palette commands
  function init() {
    if (typeof window.registerCommand !== 'function') return;
    const openCurrent = () => {
      const activeTabPath = window.tabManager?.activeTabPath;
      const filePath = getPrimaryTab(activeTabPath) ? activeTabPath : window.currentFilePath;
      if (!filePath) {
        window.showNotification?.('Open a file or draft before opening the split editor.', 'info');
        return false;
      }
      return openInSplit(filePath);
    };
    window.registerCommand('view.split.toggle', 'View: Toggle Split Editor',
      () => splitActive ? deactivateSplit() : openCurrent());
    window.registerCommand('view.split.openCurrent', 'View: Open Current File in Split', openCurrent);
  }

  // Expose public API
  window.splitEditor = {
    activate: activateSplit,
    deactivate: deactivateSplit,
    openInSplit,
    isActive: () => splitActive,
    getCurrentFilePath: () => currentFile?.path || null,
    flushPendingSave: () => saveFile(currentFile),
    hasUnsavedChanges: () => Boolean(currentFile && !currentFile.readOnly && (currentFile.savePromise || currentFile.model.getValue() !== currentFile.savedContent)),
    getSecondEditor: () => secondEditor
  };

  // Registration has no DOM dependency. The command module loads before this
  // deferred script, so commands are available immediately on first open.
  init();
})();
