/**
 * Table Editor Toolbar
 * Floating toolbar that appears when the cursor is inside a markdown table,
 * providing structural operations: add/remove row/col, alignment, sort.
 *
 * Works alongside the existing visual markdown table system which handles
 * parsing, rendering, and cell editing.
 *
 * @module table-editor
 */

(function () {
  'use strict';

  let toolbarEl = null;
  let cursorListener = null;
  let currentTable = null; // { startLine, endLine, headers, rows, alignments }

  const TABLE_ROW_RE = /^\|(.+)\|$/;
  const TABLE_SEP_RE = /^\|[-:\s|]+\|$/;

  /**
   * Parse the table surrounding the given line number.
   * Returns null if the cursor is not inside a valid markdown table.
   */
  function getTableAtLine(model, lineNumber) {
    const totalLines = model.getLineCount();
    const line = model.getLineContent(lineNumber);

    // Quick check: current line must look like a table row
    if (!TABLE_ROW_RE.test(line) && !TABLE_SEP_RE.test(line)) return null;

    // Walk up to find start
    let start = lineNumber;
    while (start > 1) {
      const prev = model.getLineContent(start - 1);
      if (!TABLE_ROW_RE.test(prev) && !TABLE_SEP_RE.test(prev)) break;
      start--;
    }

    // Walk down to find end
    let end = lineNumber;
    while (end < totalLines) {
      const next = model.getLineContent(end + 1);
      if (!TABLE_ROW_RE.test(next) && !TABLE_SEP_RE.test(next)) break;
      end++;
    }

    // Need at least header + separator
    if (end - start < 1) return null;

    // Validate separator is on line 2
    const sepLine = model.getLineContent(start + 1);
    if (!TABLE_SEP_RE.test(sepLine)) return null;

    // Parse header
    const headerLine = model.getLineContent(start);
    const headerMatch = headerLine.match(TABLE_ROW_RE);
    if (!headerMatch) return null;

    const headers = headerMatch[1].split('|').map(c => c.trim());
    const colCount = headers.length;

    // Parse alignments
    const sepCells = sepLine.replace(/^\||\|$/g, '').split('|');
    const alignments = sepCells.map(cell => {
      const t = cell.trim();
      if (t.startsWith(':') && t.endsWith(':')) return 'center';
      if (t.endsWith(':')) return 'right';
      return 'left';
    });

    // Parse data rows
    const rows = [];
    for (let i = start + 2; i <= end; i++) {
      const rowLine = model.getLineContent(i);
      const rowMatch = rowLine.match(TABLE_ROW_RE);
      if (rowMatch) {
        rows.push(rowMatch[1].split('|').map(c => c.trim()));
      }
    }

    return {
      startLine: start,
      endLine: end,
      headers,
      alignments,
      rows,
      colCount,
      cursorRow: lineNumber - start, // 0=header, 1=sep, 2+=data rows
      cursorDataRow: lineNumber - start - 2 // -1 if on header/sep
    };
  }

  /**
   * Build a markdown separator cell for the given alignment.
   */
  function makeSepCell(align) {
    switch (align) {
      case 'center': return ':---:';
      case 'right': return '---:';
      default: return '---';
    }
  }

  /**
   * Rebuild markdown source for a table and replace it in the editor.
   */
  function writeTable(table) {
    if (!window.editor) return;
    const model = window.editor.getModel();
    if (!model) return;

    const lines = [];

    // Header
    lines.push('| ' + table.headers.join(' | ') + ' |');

    // Separator
    const sepCells = table.alignments.map(makeSepCell);
    lines.push('| ' + sepCells.join(' | ') + ' |');

    // Data rows
    table.rows.forEach(row => {
      // Pad row to column count
      while (row.length < table.colCount) row.push('');
      lines.push('| ' + row.slice(0, table.colCount).join(' | ') + ' |');
    });

    const range = new monaco.Range(
      table.startLine, 1,
      table.endLine, model.getLineContent(table.endLine).length + 1
    );

    window.editor.executeEdits('table-editor', [{
      range,
      text: lines.join('\n')
    }]);
  }

  // ── Operations ──

  function addRowBelow() {
    if (!currentTable) return;
    const t = { ...currentTable, rows: [...currentTable.rows.map(r => [...r])] };
    const newRow = new Array(t.colCount).fill('');
    const insertIdx = Math.max(0, t.cursorDataRow + 1);
    t.rows.splice(insertIdx, 0, newRow);
    t.endLine = t.startLine + 1 + t.rows.length; // recalculate
    writeTable(t);
  }

  function addRowAbove() {
    if (!currentTable) return;
    const t = { ...currentTable, rows: [...currentTable.rows.map(r => [...r])] };
    const newRow = new Array(t.colCount).fill('');
    const insertIdx = Math.max(0, t.cursorDataRow);
    t.rows.splice(insertIdx, 0, newRow);
    t.endLine = t.startLine + 1 + t.rows.length;
    writeTable(t);
  }

  function deleteRow() {
    if (!currentTable || currentTable.cursorDataRow < 0) return;
    if (currentTable.rows.length <= 1) return; // keep at least 1 data row
    const t = { ...currentTable, rows: [...currentTable.rows.map(r => [...r])] };
    t.rows.splice(t.cursorDataRow, 1);
    t.endLine = t.startLine + 1 + t.rows.length;
    writeTable(t);
  }

  function addColumnRight() {
    if (!currentTable) return;
    const t = { ...currentTable, rows: [...currentTable.rows.map(r => [...r])] };
    const pos = getCursorCol();
    const insertAt = pos + 1;
    t.headers.splice(insertAt, 0, '');
    t.alignments.splice(insertAt, 0, 'left');
    t.rows.forEach(r => r.splice(insertAt, 0, ''));
    t.colCount++;
    t.endLine = t.startLine + 1 + t.rows.length;
    writeTable(t);
  }

  function addColumnLeft() {
    if (!currentTable) return;
    const t = { ...currentTable, rows: [...currentTable.rows.map(r => [...r])] };
    const pos = getCursorCol();
    t.headers.splice(pos, 0, '');
    t.alignments.splice(pos, 0, 'left');
    t.rows.forEach(r => r.splice(pos, 0, ''));
    t.colCount++;
    t.endLine = t.startLine + 1 + t.rows.length;
    writeTable(t);
  }

  function deleteColumn() {
    if (!currentTable || currentTable.colCount <= 1) return;
    const t = { ...currentTable, rows: [...currentTable.rows.map(r => [...r])] };
    const pos = getCursorCol();
    t.headers.splice(pos, 1);
    t.alignments.splice(pos, 1);
    t.rows.forEach(r => r.splice(pos, 1));
    t.colCount--;
    t.endLine = t.startLine + 1 + t.rows.length;
    writeTable(t);
  }

  function cycleAlignment() {
    if (!currentTable) return;
    const t = { ...currentTable, rows: [...currentTable.rows.map(r => [...r])], alignments: [...currentTable.alignments] };
    const col = getCursorCol();
    const order = ['left', 'center', 'right'];
    const cur = order.indexOf(t.alignments[col]) || 0;
    t.alignments[col] = order[(cur + 1) % 3];
    t.endLine = t.startLine + 1 + t.rows.length;
    writeTable(t);
  }

  function sortColumn(ascending) {
    if (!currentTable || currentTable.rows.length < 2) return;
    const t = { ...currentTable, rows: [...currentTable.rows.map(r => [...r])] };
    const col = getCursorCol();
    t.rows.sort((a, b) => {
      const va = (a[col] || '').toLowerCase();
      const vb = (b[col] || '').toLowerCase();
      // Try numeric comparison
      const na = parseFloat(va), nb = parseFloat(vb);
      if (!isNaN(na) && !isNaN(nb)) return ascending ? na - nb : nb - na;
      return ascending ? va.localeCompare(vb) : vb.localeCompare(va);
    });
    t.endLine = t.startLine + 1 + t.rows.length;
    writeTable(t);
  }

  function insertNewTable() {
    if (!window.editor) return;
    const pos = window.editor.getPosition();
    if (!pos) return;

    const template = '| Header 1 | Header 2 | Header 3 |\n| --- | --- | --- |\n| cell | cell | cell |\n';
    const model = window.editor.getModel();
    const lineContent = model.getLineContent(pos.lineNumber);
    const prefix = lineContent.trim() === '' ? '' : '\n';

    window.editor.executeEdits('table-editor', [{
      range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column),
      text: prefix + template
    }]);
  }

  /**
   * Get the column index the cursor is in (based on pipe positions).
   */
  function getCursorCol() {
    if (!window.editor || !currentTable) return 0;
    const pos = window.editor.getPosition();
    const model = window.editor.getModel();
    if (!pos || !model) return 0;

    const line = model.getLineContent(pos.lineNumber);
    let col = 0;
    let pipeCount = 0;
    for (let i = 0; i < pos.column - 1 && i < line.length; i++) {
      if (line[i] === '|') {
        pipeCount++;
      }
    }
    // First pipe is the leading |, so column = pipeCount - 1
    return Math.max(0, Math.min(pipeCount - 1, currentTable.colCount - 1));
  }

  // ── Tab navigation between cells ──

  function handleTab(e) {
    if (!currentTable || !window.editor) return;

    const pos = window.editor.getPosition();
    const model = window.editor.getModel();
    if (!pos || !model) return;

    const line = model.getLineContent(pos.lineNumber);
    if (!TABLE_ROW_RE.test(line)) return;

    e.preventDefault();
    e.stopPropagation();

    const cells = line.split('|').slice(1, -1);
    const curCol = getCursorCol();
    const backward = e.shiftKey;

    let nextLine = pos.lineNumber;
    let nextCol = curCol;

    if (backward) {
      nextCol--;
      if (nextCol < 0) {
        // Move to previous row, last column
        nextLine--;
        // Skip separator line
        if (nextLine === currentTable.startLine + 1) nextLine--;
        if (nextLine < currentTable.startLine) return;
        nextCol = currentTable.colCount - 1;
      }
    } else {
      nextCol++;
      if (nextCol >= currentTable.colCount) {
        // Move to next row, first column
        nextLine++;
        // Skip separator line
        if (nextLine === currentTable.startLine + 1) nextLine++;
        if (nextLine > currentTable.endLine) {
          // Add a new row at the end
          addRowBelow();
          nextLine = currentTable.endLine + 1; // After the write, this is the new last row
          // Re-parse to get updated table
          const updatedTable = getTableAtLine(model, nextLine);
          if (updatedTable) nextLine = updatedTable.endLine;
        }
        nextCol = 0;
      }
    }

    // Select the target cell content
    selectCell(model, nextLine, nextCol);
  }

  function selectCell(model, lineNumber, colIndex) {
    const lineContent = model.getLineContent(lineNumber);
    const cells = lineContent.split('|').slice(1, -1);
    if (colIndex >= cells.length) return;

    let charPos = 2; // after first |
    for (let i = 0; i < colIndex; i++) {
      charPos += cells[i].length + 1;
    }

    const cellContent = cells[colIndex];
    const trimStart = cellContent.length - cellContent.trimStart().length;
    const trimEnd = cellContent.trimEnd().length;

    const startCol = charPos + trimStart;
    const endCol = charPos + trimEnd;

    window.editor.setSelection(new monaco.Range(lineNumber, startCol, lineNumber, endCol));
    window.editor.revealLineInCenter(lineNumber);
    window.editor.focus();
  }

  // ── Toolbar UI ──

  function createToolbar() {
    if (toolbarEl) return toolbarEl;

    toolbarEl = document.createElement('div');
    toolbarEl.id = 'table-editor-toolbar';
    toolbarEl.style.cssText = `
      display: none;
      position: fixed;
      z-index: 9999;
      background: var(--bg-primary, #252526);
      border: 1px solid var(--border-color, #444);
      border-radius: 6px;
      padding: 3px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.3);
      font-family: system-ui, sans-serif;
      font-size: 12px;
      gap: 2px;
      flex-wrap: wrap;
      align-items: center;
    `;

    const buttons = [
      { icon: '↓+', title: 'Add row below', action: addRowBelow },
      { icon: '↑+', title: 'Add row above', action: addRowAbove },
      { icon: '↓×', title: 'Delete row', action: deleteRow },
      { sep: true },
      { icon: '→+', title: 'Add column right', action: addColumnRight },
      { icon: '←+', title: 'Add column left', action: addColumnLeft },
      { icon: '→×', title: 'Delete column', action: deleteColumn },
      { sep: true },
      { icon: '⇔', title: 'Cycle alignment (left/center/right)', action: cycleAlignment },
      { icon: 'A↓', title: 'Sort ascending', action: () => sortColumn(true) },
      { icon: 'A↑', title: 'Sort descending', action: () => sortColumn(false) },
    ];

    buttons.forEach(b => {
      if (b.sep) {
        const sep = document.createElement('div');
        sep.style.cssText = 'width:1px;height:18px;background:var(--border-color,#555);margin:0 2px;';
        toolbarEl.appendChild(sep);
        return;
      }

      const btn = document.createElement('button');
      btn.textContent = b.icon;
      btn.title = b.title;
      btn.style.cssText = `
        background: transparent;
        border: none;
        color: var(--text-primary, #d4d4d4);
        cursor: pointer;
        padding: 3px 6px;
        border-radius: 3px;
        font-size: 12px;
        font-weight: 600;
        line-height: 1;
      `;
      btn.addEventListener('mouseenter', () => {
        btn.style.background = 'var(--bg-hover, rgba(255,255,255,0.1))';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.background = 'transparent';
      });
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault(); // Don't steal focus from editor
      });
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        b.action();
        // Re-parse after edit
        setTimeout(updateToolbarState, 50);
      });
      toolbarEl.appendChild(btn);
    });

    document.body.appendChild(toolbarEl);
    return toolbarEl;
  }

  function showToolbar() {
    const tb = createToolbar();
    if (!window.editor || !currentTable) {
      tb.style.display = 'none';
      return;
    }

    // Position toolbar above the table
    const editorDom = window.editor.getDomNode();
    if (!editorDom) return;

    // Get the position of the table's first line
    const topLine = currentTable.startLine;
    const lineTop = window.editor.getTopForLineNumber(topLine);
    const scrollTop = window.editor.getScrollTop();
    const editorRect = editorDom.getBoundingClientRect();

    const y = editorRect.top + (lineTop - scrollTop) - 32;
    const x = editorRect.left + 60; // offset past line numbers

    tb.style.display = 'flex';
    tb.style.top = Math.max(editorRect.top, y) + 'px';
    tb.style.left = x + 'px';
  }

  function hideToolbar() {
    if (toolbarEl) {
      toolbarEl.style.display = 'none';
    }
  }

  function updateToolbarState() {
    if (!window.editor) return;

    const model = window.editor.getModel();
    const pos = window.editor.getPosition();
    if (!model || !pos) {
      currentTable = null;
      hideToolbar();
      return;
    }

    const table = getTableAtLine(model, pos.lineNumber);
    if (table) {
      currentTable = table;
      showToolbar();
    } else {
      currentTable = null;
      hideToolbar();
    }
  }

  // ── Init ──

  function init() {
    if (typeof window.registerCommand === 'function') {
      window.registerCommand('table.insert', 'Table: Insert New Table', insertNewTable);
      window.registerCommand('table.addRow', 'Table: Add Row Below', addRowBelow);
      window.registerCommand('table.addColumn', 'Table: Add Column Right', addColumnRight);
      window.registerCommand('table.cycleAlignment', 'Table: Cycle Column Alignment', cycleAlignment);
      window.registerCommand('table.sortAscending', 'Table: Sort Column Ascending', () => sortColumn(true));
      window.registerCommand('table.sortDescending', 'Table: Sort Column Descending', () => sortColumn(false));
    }

    // Wait for Monaco editor to be ready, then attach cursor listener
    function attachListener() {
      if (!window.editor) return false;

      cursorListener = window.editor.onDidChangeCursorPosition(() => {
        updateToolbarState();
      });

      // Also update on scroll (toolbar is fixed-position)
      window.editor.onDidScrollChange(() => {
        if (currentTable) showToolbar();
      });

      // Tab key override when inside a table
      window.editor.onKeyDown((e) => {
        if (e.keyCode === monaco.KeyCode.Tab && currentTable) {
          handleTab(e.browserEvent);
          e.preventDefault();
          e.stopPropagation();
        }
      });

      return true;
    }

    if (!attachListener()) {
      const interval = setInterval(() => {
        if (attachListener()) clearInterval(interval);
      }, 500);
      setTimeout(() => clearInterval(interval), 30000);
    }
  }

  // Public API
  window.tableEditor = {
    insertNewTable,
    addRowBelow,
    addRowAbove,
    deleteRow,
    addColumnRight,
    addColumnLeft,
    deleteColumn,
    cycleAlignment,
    sortColumn
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 100);
  }
})();
