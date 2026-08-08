const path = require('path');

const modulePath = path.resolve(__dirname, '../../../orchestrator/modules/structured-record-mode.js');
const nativeGetElementById = Object.getPrototypeOf(document).getElementById.bind(document);

describe('structured record mode helpers', () => {
  let helpers;

  beforeEach(() => {
    jest.resetModules();
    document.getElementById = nativeGetElementById;
    delete window.JSONLModeUtils;
    delete window.StructuredRecordModeUtils;
    delete window.jsonlMode;
    delete window.recordMode;
    window.currentFilePath = null;
    window.requestAnimationFrame = callback => callback();
    global.requestAnimationFrame = window.requestAnimationFrame;
    document.body.innerHTML = '';
    helpers = require(modulePath);
  });

  test('parses one object per non-blank line with source line locations', () => {
    const parsed = helpers.parseJSONL([
      '{"item_id":"a","score":1}',
      '',
      '{"item_id":"b","score":2}',
      ''
    ].join('\n'));

    expect(parsed.errors).toEqual([]);
    expect(parsed.records).toHaveLength(2);
    expect(parsed.records[0]).toMatchObject({ lineNumber: 1, lineIndex: 0 });
    expect(parsed.records[1]).toMatchObject({ lineNumber: 3, lineIndex: 2 });
    expect(parsed.trailingNewline).toBe(true);
  });

  test('reports malformed and non-object records without discarding valid lines', () => {
    const parsed = helpers.parseJSONL([
      '{"item_id":"valid"}',
      '{broken}',
      '[1,2,3]'
    ].join('\n'));

    expect(parsed.records).toHaveLength(1);
    expect(parsed.errors).toHaveLength(2);
    expect(parsed.errors.map(error => error.lineNumber)).toEqual([2, 3]);
    expect(parsed.errors[1].message).toContain('Expected a JSON object');
  });

  test('replaces only the selected JSONL source line', () => {
    const original = '{"id":"a"}\n{"id":"b","value":1}\n';
    const updated = helpers.replaceRecordLine(original, 2, { id: 'b', value: 2 });

    expect(updated).toBe('{"id":"a"}\n{"id":"b","value":2}\n');
  });

  test('parses CSV quoting, escaped quotes, CRLF, and multiline cells', () => {
    const source = [
      'item_id,notes,score',
      'dev-001,"hello, ""world""",5',
      'dev-002,"line one\r\nline two",'
    ].join('\r\n') + '\r\n';
    const parsed = helpers.parseCSV(source);

    expect(parsed.errors).toEqual([]);
    expect(parsed.headers).toEqual(['item_id', 'notes', 'score']);
    expect(parsed.records).toHaveLength(2);
    expect(parsed.records[0].value).toEqual({
      item_id: 'dev-001',
      notes: 'hello, "world"',
      score: '5'
    });
    expect(parsed.records[1]).toMatchObject({ lineNumber: 3, endLine: 4 });
    expect(parsed.records[1].value.notes).toBe('line one\r\nline two');
    expect(parsed.trailingNewline).toBe(true);
    expect(parsed.newline).toBe('\r\n');
  });

  test('replaces one CSV record and preserves surrounding source', () => {
    const source = 'item_id,notes,score\ndev-001,Before,5\ndev-002,Keep,4\n';
    const parsed = helpers.parseCSV(source);
    const updated = helpers.replaceCSVRecord(
      source,
      parsed.records[0],
      ['dev-001', 'Needs, review', '3']
    );

    expect(updated).toBe('item_id,notes,score\ndev-001,"Needs, review",3\ndev-002,Keep,4\n');
  });

  test('offers constrained controls for the human-labelling CSV fields', () => {
    expect(helpers.getCSVFieldOptions('applicability')).toEqual(['', 'applicable', 'not_applicable']);
    expect(helpers.getCSVFieldOptions('content_accuracy_score')).toEqual(['', '1', '2', '3', '4', '5']);
    expect(helpers.getCSVFieldOptions('confidence')).toEqual(['', '1', '2', '3', '4', '5']);
    expect(helpers.getCSVFieldOptions('notes')).toBeNull();
  });

  test('coerces edits using the original JSON value type', () => {
    expect(helpers.coerceFieldValue('3.5', 1)).toBe(3.5);
    expect(helpers.coerceFieldValue('false', true)).toBe(false);
    expect(helpers.coerceFieldValue('["a","b"]', [])).toEqual(['a', 'b']);
    expect(helpers.coerceFieldValue('{"ok":true}', {})).toEqual({ ok: true });
    expect(helpers.coerceFieldValue('ordinary text', 'before')).toBe('ordinary text');
    expect(() => helpers.coerceFieldValue('not a number', 1)).toThrow('finite number');
  });

  test('matches search terms across IDs, metadata, and content', () => {
    const record = {
      item_id: 'dev-004',
      domain: 'mathematics',
      learner_message: 'What is the arithmetic mean?'
    };

    expect(helpers.recordMatches(record, 'DEV-004')).toBe(true);
    expect(helpers.recordMatches(record, 'arithmetic mean')).toBe(true);
    expect(helpers.recordMatches(record, 'chemistry')).toBe(false);
  });

  test('describes JSONL distinctly from ordinary JSON and Markdown', () => {
    expect(helpers.getFileStatusLabel('/workspace/items.jsonl')).toBe('JSONL (.jsonl)');
    expect(helpers.getFileStatusLabel('/workspace/labels.csv')).toBe('CSV (.csv)');
    expect(helpers.getFileStatusLabel('/workspace/config.json')).toBe('JSON (.json)');
    expect(helpers.getFileStatusLabel('/workspace/notes.md')).toBe('Markdown (.md)');
  });

  test('renders record mode and writes a form edit back to its source line', () => {
    document.body.innerHTML = `
      <div id="editor-pane"></div>
      <div id="resizer"></div>
      <div id="right-pane">
        <div id="preview-pane">
          <button id="preview-scroll-sync-btn"></button>
          <button id="preview-source-btn"></button>
          <button id="preview-fullscreen-btn"></button>
          <div id="preview-content"></div>
          <div id="preview-source-toolbar"></div>
          <pre id="preview-source"></pre>
        </div>
      </div>
      <span id="word-count"></span>
      <span id="preview-word-count"></span>
      <span id="char-count"></span>
      <span id="line-count"></span>
      <span id="file-status"></span>
    `;
    const source = [
      '{"item_id":"dev-001","domain":"mathematics","learner_message":"Before"}',
      '{"item_id":"dev-002","domain":"physics","learner_message":"Second"}'
    ].join('\n');
    const model = {
      getLineMaxColumn: jest.fn(lineNumber => source.split('\n')[lineNumber - 1].length + 1)
    };
    window.editor = {
      getValue: jest.fn(() => source),
      getModel: jest.fn(() => model),
      executeEdits: jest.fn(),
      layout: jest.fn()
    };
    window.monaco = {
      Range: jest.fn((startLineNumber, startColumn, endLineNumber, endColumn) => ({
        startLineNumber,
        startColumn,
        endLineNumber,
        endColumn
      }))
    };
    window.currentFilePath = '/workspace/development-items.blinded.jsonl';
    window.updateStatusBar = jest.fn();

    expect(window.jsonlMode.handlePreviewUpdate(window.currentFilePath, source)).toBe(true);
    expect(document.querySelectorAll('.jsonl-record-list-item')).toHaveLength(2);
    expect(document.getElementById('editor-pane').classList.contains('nightowl-ui-hidden')).toBe(true);
    expect(window.recordMode.getState()).toMatchObject({ active: true, sourceVisible: false });
    expect(window.updateStatusBar).toHaveBeenCalledWith(source);
    expect(document.getElementById('preview-word-count').textContent).toBe('Records: 2');
    expect(document.getElementById('file-status').textContent).toBe('JSONL (.jsonl)');

    const learnerField = document.querySelector('[data-field="learner_message"]');
    learnerField.value = 'After';
    learnerField.dispatchEvent(new Event('blur'));

    expect(window.editor.executeEdits).toHaveBeenCalledWith('jsonl-record-mode', [
      expect.objectContaining({
        text: '{"item_id":"dev-001","domain":"mathematics","learner_message":"After"}'
      })
    ]);

    document.getElementById('jsonl-source-toggle').click();
    expect(document.getElementById('editor-pane').classList.contains('nightowl-ui-hidden')).toBe(false);
    expect(window.recordMode.getState()).toMatchObject({ active: true, sourceVisible: true });
  });

  test('renders a CSV labelling sheet with constrained selects and writes a valid row', () => {
    document.body.innerHTML = `
      <div id="editor-pane"></div>
      <div id="resizer"></div>
      <div id="right-pane">
        <div id="preview-pane">
          <button id="preview-scroll-sync-btn"></button>
          <button id="preview-source-btn"></button>
          <button id="preview-fullscreen-btn"></button>
          <div id="preview-content"></div>
          <div id="preview-source-toolbar"></div>
          <pre id="preview-source"></pre>
        </div>
      </div>
      <span id="preview-word-count"></span>
      <span id="file-status"></span>
    `;
    const source = [
      'coder_id,item_id,applicability,content_accuracy_score,confidence,notes',
      'coder-a,dev-001,,,,'
    ].join('\n');
    const positionAt = offset => {
      const before = source.slice(0, offset).split('\n');
      return { lineNumber: before.length, column: before[before.length - 1].length + 1 };
    };
    const model = { getPositionAt: jest.fn(positionAt) };
    window.editor = {
      getValue: jest.fn(() => source),
      getModel: jest.fn(() => model),
      executeEdits: jest.fn(),
      layout: jest.fn()
    };
    window.monaco = {
      Range: jest.fn((startLineNumber, startColumn, endLineNumber, endColumn) => ({
        startLineNumber,
        startColumn,
        endLineNumber,
        endColumn
      }))
    };
    window.currentFilePath = '/workspace/development-human-labels-coder-a.csv';
    window.updateStatusBar = jest.fn();

    expect(window.recordMode.handlePreviewUpdate(window.currentFilePath, source)).toBe(true);
    expect(document.getElementById('jsonl-mode-eyebrow').textContent).toBe('CSV record mode');
    expect(document.getElementById('file-status').textContent).toBe('CSV (.csv)');
    expect(document.querySelectorAll('.jsonl-record-list-item')).toHaveLength(1);

    const applicability = document.querySelector('[data-field="applicability"]');
    const score = document.querySelector('[data-field="content_accuracy_score"]');
    expect(applicability.tagName).toBe('SELECT');
    expect(score.tagName).toBe('SELECT');
    expect(score.options).toHaveLength(6);

    applicability.value = 'applicable';
    applicability.dispatchEvent(new Event('change'));

    expect(window.editor.executeEdits).toHaveBeenCalledWith('csv-record-mode', [
      expect.objectContaining({
        text: 'coder-a,dev-001,applicable,,,'
      })
    ]);
  });

  test('cancels a delayed field edit before another file and model become active', () => {
    jest.useFakeTimers();
    document.body.innerHTML = `
      <div id="editor-pane"></div>
      <div id="resizer"></div>
      <div id="right-pane"><div id="preview-pane"><div id="preview-content"></div></div></div>
      <span id="preview-word-count"></span>
      <span id="file-status"></span>
    `;
    const sourceA = '{"item_id":"a","notes":"Before"}';
    const modelA = { getLineMaxColumn: jest.fn(() => sourceA.length + 1) };
    const modelB = { getLineMaxColumn: jest.fn(() => 10) };
    let activeModel = modelA;
    window.editor = {
      getValue: jest.fn(() => sourceA),
      getModel: jest.fn(() => activeModel),
      executeEdits: jest.fn(),
      layout: jest.fn()
    };
    window.currentFilePath = '/workspace/a.jsonl';

    window.recordMode.handlePreviewUpdate(window.currentFilePath, sourceA);
    const notes = document.querySelector('[data-field="notes"]');
    notes.value = 'Pending edit';
    notes.dispatchEvent(new Event('input'));

    activeModel = modelB;
    window.currentFilePath = '/workspace/b.md';
    window.recordMode.handlePreviewUpdate(window.currentFilePath, '# B');
    jest.advanceTimersByTime(500);

    expect(window.editor.executeEdits).not.toHaveBeenCalled();
    expect(window.recordMode.getState().fieldTimers.size).toBe(0);
    jest.useRealTimers();
  });
});
