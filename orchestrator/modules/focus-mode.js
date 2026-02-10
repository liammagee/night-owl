/**
 * Focus Mode
 * Dims all lines except the current paragraph and optionally enables
 * typewriter scrolling (cursor line stays centred in the viewport).
 *
 * Toggle: Cmd+.  (or via command palette)
 *
 * @module focus-mode
 */

(function () {
  'use strict';

  let active = false;
  let typewriterEnabled = true;
  let decorationIds = [];
  let cursorListener = null;
  let lastParagraph = null; // { start, end }

  /**
   * Find paragraph boundaries around the given line number.
   * A "paragraph" is a contiguous run of non-blank lines.
   */
  function getParagraphAt(model, lineNumber) {
    const totalLines = model.getLineCount();

    // Current line blank? Focus just that line
    if (model.getLineContent(lineNumber).trim() === '') {
      return { start: lineNumber, end: lineNumber };
    }

    let start = lineNumber;
    while (start > 1 && model.getLineContent(start - 1).trim() !== '') {
      start--;
    }

    let end = lineNumber;
    while (end < totalLines && model.getLineContent(end + 1).trim() !== '') {
      end++;
    }

    return { start, end };
  }

  /**
   * Apply dimming decorations to all lines outside the active paragraph.
   */
  function updateDecorations() {
    if (!window.editor || !active) return;

    const model = window.editor.getModel();
    if (!model) return;

    const pos = window.editor.getPosition();
    if (!pos) return;

    const para = getParagraphAt(model, pos.lineNumber);

    // Skip update if paragraph hasn't changed
    if (lastParagraph && lastParagraph.start === para.start && lastParagraph.end === para.end) {
      return;
    }
    lastParagraph = para;

    const totalLines = model.getLineCount();
    const newDecorations = [];

    // Dim lines before the paragraph
    if (para.start > 1) {
      newDecorations.push({
        range: new monaco.Range(1, 1, para.start - 1, 1),
        options: {
          isWholeLine: true,
          className: 'focus-mode-dimmed'
        }
      });
    }

    // Dim lines after the paragraph
    if (para.end < totalLines) {
      newDecorations.push({
        range: new monaco.Range(para.end + 1, 1, totalLines, 1),
        options: {
          isWholeLine: true,
          className: 'focus-mode-dimmed'
        }
      });
    }

    decorationIds = window.editor.deltaDecorations(decorationIds, newDecorations);
  }

  /**
   * Typewriter scroll: keep cursor line centred in the editor viewport.
   */
  function typewriterScroll() {
    if (!window.editor || !active || !typewriterEnabled) return;

    const pos = window.editor.getPosition();
    if (!pos) return;

    window.editor.revealLineInCenter(pos.lineNumber);
  }

  function activate() {
    if (active || !window.editor) return;
    active = true;
    lastParagraph = null;

    document.body.classList.add('focus-mode-active');

    // Listen for cursor changes
    cursorListener = window.editor.onDidChangeCursorPosition(() => {
      updateDecorations();
      typewriterScroll();
    });

    // Initial decoration pass
    updateDecorations();
    typewriterScroll();

    if (window.showNotification) {
      window.showNotification('Focus mode — press Cmd+. or Esc to exit', 'info');
    }
  }

  function deactivate() {
    if (!active) return;
    active = false;
    lastParagraph = null;

    document.body.classList.remove('focus-mode-active');

    // Clear decorations
    if (window.editor) {
      decorationIds = window.editor.deltaDecorations(decorationIds, []);
    }

    // Remove listener
    if (cursorListener) {
      cursorListener.dispose();
      cursorListener = null;
    }
  }

  function toggle() {
    if (active) {
      deactivate();
    } else {
      activate();
    }
  }

  function toggleTypewriter() {
    typewriterEnabled = !typewriterEnabled;
    if (window.showNotification) {
      window.showNotification(
        `Typewriter scrolling ${typewriterEnabled ? 'enabled' : 'disabled'}`,
        'info'
      );
    }
  }

  function init() {
    // Command palette
    if (window.commandPaletteCommands) {
      window.commandPaletteCommands.push({
        name: 'View: Toggle Focus Mode',
        action: toggle
      });
      window.commandPaletteCommands.push({
        name: 'View: Toggle Typewriter Scrolling',
        action: toggleTypewriter
      });
    }

    // Keyboard shortcut: Cmd+. (Mac) / Ctrl+.
    document.addEventListener('keydown', (e) => {
      if (e.key === '.' && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
        e.preventDefault();
        toggle();
      }
      // Esc exits focus mode (only if focus mode is active and zen mode is not)
      if (e.key === 'Escape' && active && !document.body.classList.contains('zen-mode')) {
        deactivate();
      }
    });
  }

  // Public API
  window.focusMode = {
    toggle,
    activate,
    deactivate,
    isActive: () => active,
    toggleTypewriter
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 100);
  }
})();
