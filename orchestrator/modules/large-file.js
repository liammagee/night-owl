/**
 * Large File Handling
 * Optimizes Monaco editor performance for large files.
 * - Warns on large files and offers read-only mode
 * - Disables expensive features (word wrap, minimap detail) for big files
 * - Provides file size info in status bar
 *
 * @module large-file
 */

(function () {
  'use strict';

  const WARN_SIZE = 500 * 1024;     // 500 KB
  const READONLY_SIZE = 2 * 1024 * 1024; // 2 MB
  const DISABLE_FEATURES_SIZE = 200 * 1024; // 200 KB

  let currentFileSize = 0;
  let largeModeActive = false;
  let originalOptions = {};

  function estimateUtf8ByteLength(text) {
    if (typeof text !== 'string') return 0;
    let bytes = 0;
    for (let i = 0; i < text.length; i += 1) {
      const code = text.charCodeAt(i);
      if (code < 0x80) bytes += 1;
      else if (code < 0x800) bytes += 2;
      else if (code >= 0xd800 && code <= 0xdbff) {
        bytes += 4;
        i += 1;
      } else {
        bytes += 3;
      }
    }
    return bytes;
  }

  function countLines(text) {
    if (typeof text !== 'string' || text.length === 0) return 1;
    let lines = 1;
    for (let i = 0; i < text.length; i += 1) {
      if (text.charCodeAt(i) === 10) lines += 1;
    }
    return lines;
  }

  function applyLargeFileState(filePath, size, lineCount) {
    currentFileSize = size;
    updateStatusBar(currentFileSize, lineCount);

    if (currentFileSize > READONLY_SIZE) {
      showLargeFileWarning(filePath, currentFileSize, lineCount, true);
    } else if (currentFileSize > WARN_SIZE) {
      showLargeFileWarning(filePath, currentFileSize, lineCount, false);
    }

    if (currentFileSize > DISABLE_FEATURES_SIZE) {
      enableLargeFileMode();
    } else if (largeModeActive) {
      disableLargeFileMode();
    }
  }

  /**
   * Check file size and apply optimizations when a file is opened.
   */
  function onFileOpened(content, filePath) {
    if (!window.editor) return;

    applyLargeFileState(filePath, estimateUtf8ByteLength(content), countLines(content));
  }

  function onModelOpened(model, filePath) {
    if (!model) return;
    if (typeof model.getValueLength === 'function' && typeof model.getLineCount === 'function') {
      applyLargeFileState(filePath, model.getValueLength(), model.getLineCount());
      return;
    }

    const content = typeof model.getValue === 'function' ? model.getValue() : '';
    onFileOpened(content, filePath);
  }

  function enableLargeFileMode() {
    if (largeModeActive || !window.editor) return;
    largeModeActive = true;

    // Save current options
    const opts = window.editor.getOptions();
    originalOptions = {
      wordWrap: window.editor.getRawOptions().wordWrap,
      folding: window.editor.getRawOptions().folding,
      renderWhitespace: window.editor.getRawOptions().renderWhitespace,
      occurrencesHighlight: window.editor.getRawOptions().occurrencesHighlight
    };

    // Apply performance optimizations
    window.editor.updateOptions({
      wordWrap: 'off',
      folding: false,
      renderWhitespace: 'none',
      occurrencesHighlight: 'off',
      suggest: { showWords: false },
      quickSuggestions: false,
      minimap: { maxColumn: 80 }
    });
  }

  function disableLargeFileMode() {
    if (!largeModeActive || !window.editor) return;
    largeModeActive = false;

    window.editor.updateOptions({
      wordWrap: originalOptions.wordWrap || 'on',
      folding: originalOptions.folding !== false,
      renderWhitespace: originalOptions.renderWhitespace || 'selection',
      occurrencesHighlight: originalOptions.occurrencesHighlight || 'singleFile',
      suggest: { showWords: true },
      quickSuggestions: true,
      minimap: { maxColumn: 120 }
    });
  }

  function showLargeFileWarning(filePath, size, lineCount, suggestReadOnly) {
    const name = (filePath || 'file').split('/').pop();
    const sizeStr = formatSize(size);

    if (suggestReadOnly) {
      if (window.showNotification) {
        window.showNotification(
          `${name} is ${sizeStr} (${lineCount.toLocaleString()} lines). Opened in read-only mode for performance.`,
          'warning'
        );
      }
      if (window.editor) {
        window.editor.updateOptions({ readOnly: true });
      }
    } else {
      if (window.showNotification) {
        window.showNotification(
          `${name} is ${sizeStr} (${lineCount.toLocaleString()} lines). Some features disabled for performance.`,
          'info'
        );
      }
    }
  }

  function updateStatusBar(size, lineCount) {
    let indicator = document.getElementById('file-size-indicator');
    if (!indicator) {
      const statusBar = document.querySelector('.status-bar') || document.getElementById('status-bar');
      if (!statusBar) return;

      indicator = document.createElement('span');
      indicator.id = 'file-size-indicator';
      indicator.style.cssText = 'font-size:11px;color:#888;margin-left:12px;';
      statusBar.appendChild(indicator);
    }

    indicator.textContent = `${formatSize(size)} | ${lineCount.toLocaleString()} lines`;
    if (largeModeActive) {
      indicator.textContent += ' (optimized)';
      indicator.style.color = '#facc15';
    } else {
      indicator.style.color = '#888';
    }
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  /**
   * Hook into file open events.
   */
  function init() {
    // Listen for model changes in the editor
    const check = setInterval(() => {
      if (window.editor) {
        clearInterval(check);

        window.editor.onDidChangeModel(() => {
          const model = window.editor.getModel();
          if (model) {
            onModelOpened(model, window.currentFilePath || '');
          }
        });

        // Initial check
        const model = window.editor.getModel();
        if (model) {
          onModelOpened(model, window.currentFilePath || '');
        }
      }
    }, 500);
    setTimeout(() => clearInterval(check), 15000);

    if (window.commandPaletteCommands) {
      window.commandPaletteCommands.push({
        name: 'Large File: Toggle Optimized Mode',
        action: () => {
          if (largeModeActive) {
            disableLargeFileMode();
            if (window.showNotification) window.showNotification('Large file optimizations disabled', 'info');
          } else {
            enableLargeFileMode();
            if (window.showNotification) window.showNotification('Large file optimizations enabled', 'info');
          }
        }
      });
    }
  }

  window.largeFile = {
    onFileOpened,
    onModelOpened,
    isLargeModeActive: () => largeModeActive,
    enable: enableLargeFileMode,
    disable: disableLargeFileMode
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 200);
  }
})();
