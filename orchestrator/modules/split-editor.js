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
  let secondFilePath = null;
  let secondModel = null;

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
    if (splitActive) return;

    const editorPane = getEditorPane();
    if (!editorPane || !window.monaco) return;

    // Save original flex style
    editorPane.dataset.originalFlex = editorPane.style.flex || '';
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
    secondEditor = window.monaco.editor.create(container, {
      value: '// Open a file here by right-clicking in the file tree → "Open in Split"',
      language: 'plaintext',
      theme: theme,
      automaticLayout: true,
      wordWrap: 'on',
      minimap: { enabled: false },
      folding: true,
      scrollBeyondLastLine: false,
      stickyScroll: { enabled: false }
    });

    // Close button
    document.getElementById('split-editor-close').addEventListener('click', deactivateSplit);

    // Resizer drag
    initSplitResizer(resizer, editorPane, secondPane);

    splitActive = true;
  }

  function deactivateSplit() {
    if (!splitActive) return;

    // Dispose second editor
    if (secondEditor) {
      secondEditor.dispose();
      secondEditor = null;
    }
    if (secondModel) {
      secondModel.dispose();
      secondModel = null;
    }

    // Remove elements
    const secondPane = getSecondPane();
    const resizer = getSplitResizer();
    if (secondPane) secondPane.remove();
    if (resizer) resizer.remove();

    // Restore original editor pane
    const editorPane = getEditorPane();
    if (editorPane) {
      editorPane.style.flex = editorPane.dataset.originalFlex || '';
    }

    secondFilePath = null;
    splitActive = false;

    // Re-layout primary editor
    if (window.editor && window.editor.layout) {
      setTimeout(() => window.editor.layout(), 50);
    }
  }

  async function openInSplit(filePath) {
    if (!splitActive) activateSplit();
    if (!secondEditor || !window.electronAPI) return;

    try {
      const result = await window.electronAPI.files.readFile(filePath);
      const content = typeof result === 'string' ? result : (result?.content || '');

      // Detect language
      const lang = detectLanguage(filePath);

      // Dispose old model
      if (secondModel) {
        secondModel.dispose();
      }

      secondModel = window.monaco.editor.createModel(content, lang);
      secondEditor.setModel(secondModel);
      secondFilePath = filePath;

      // Update header
      const filenameEl = document.getElementById('split-editor-filename');
      if (filenameEl) {
        filenameEl.textContent = filePath.split('/').pop();
        filenameEl.title = filePath;
      }

      // Auto-save on change
      secondModel.onDidChangeContent(() => {
        if (secondFilePath) {
          clearTimeout(secondModel._saveTimer);
          secondModel._saveTimer = setTimeout(async () => {
            try {
              await window.electronAPI.files.saveFile({
                filePath: secondFilePath,
                content: secondModel.getValue()
              });
            } catch (e) {
              console.warn('[SplitEditor] Auto-save failed:', e);
            }
          }, 2000);
        }
      });
    } catch (e) {
      console.error('[SplitEditor] Failed to open file:', e);
    }
  }

  function detectLanguage(filePath) {
    if (filePath.endsWith('.js')) return 'javascript';
    if (filePath.endsWith('.ts')) return 'typescript';
    if (filePath.endsWith('.json') || filePath.endsWith('.jsonl')) return 'json';
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
    let startX, leftWidth;

    function onMouseDown(e) {
      startX = e.clientX;
      leftWidth = leftPane.getBoundingClientRect().width;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
    }

    function onMouseMove(e) {
      const dx = e.clientX - startX;
      const newLeftWidth = leftWidth + dx;
      const container = leftPane.parentNode;
      const totalWidth = container.getBoundingClientRect().width;

      if (newLeftWidth > 100 && newLeftWidth < totalWidth - 200) {
        leftPane.style.flex = 'none';
        leftPane.style.width = newLeftWidth + 'px';
        rightPane.style.flex = '1';
      }
    }

    function onMouseUp() {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (window.editor) window.editor.layout();
      if (secondEditor) secondEditor.layout();
    }

    resizer.addEventListener('mousedown', onMouseDown);
  }

  function init() {
    if (typeof window.registerCommand === 'function') {
      window.registerCommand(
        'view.splitEditor',
        'View: Toggle Split Editor',
        () => {
          if (splitActive) {
            deactivateSplit();
          } else {
            activateSplit();
          }
        }
      );
      window.registerCommand(
        'view.openCurrentInSplit',
        'View: Open Current File in Split',
        () => {
          if (window.currentFilePath) {
            openInSplit(window.currentFilePath);
          }
        }
      );
    }
  }

  // Expose public API
  window.splitEditor = {
    activate: activateSplit,
    deactivate: deactivateSplit,
    openInSplit,
    isActive: () => splitActive,
    getSecondEditor: () => secondEditor
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 100);
  }
})();
