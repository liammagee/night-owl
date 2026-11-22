/** @jest-environment jsdom */
const fs = require('fs');
const source = fs.readFileSync(require.resolve('../../../orchestrator/modules/proofreader.js'), 'utf8');
let text, version, model, handlers, editor;
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const clickWord = () => handlers.mouse({ event: { leftButton: true }, target: { position: { lineNumber: 1, column: 2 } } });
const popup = () => document.querySelector('.proofread-suggestions');
beforeEach(() => {
  jest.useFakeTimers();
  document.body.innerHTML = '';
  localStorage.clear();
  text = 'teh'; version = 1; handlers = {};
  model = {
    getLineCount: () => 1, getLineContent: () => text,
    getVersionId: () => version,
    getValueInRange: r => text.slice(r.startColumn - 1, r.endColumn - 1)
  };
  const listen = name => fn => { handlers[name] = fn; return { dispose: jest.fn() }; };
  editor = window.editor = {
    getModel: () => model, getOption: () => false,
    onDidChangeModelContent: listen('change'), onMouseDown: listen('mouse'),
    onDidScrollChange: listen('scroll'), onDidChangeModel: listen('model'),
    getScrolledVisiblePosition: () => ({ left: 10, top: 10, height: 20 }),
    getDomNode: () => document.body,
    deltaDecorations: jest.fn(() => []), addAction: jest.fn(), focus: jest.fn(),
    pushUndoStop: jest.fn(), executeEdits: jest.fn((_, edits) => {
      const e = edits[0];
      text = text.slice(0, e.range.startColumn - 1) + e.text + text.slice(e.range.endColumn - 1);
      version++; handlers.change({});
    })
  };
  window.monaco = {
    Range: function(a,b,c,d) { Object.assign(this, { startLineNumber:a, startColumn:b, endLineNumber:c, endColumn:d }); },
    editor: { TrackedRangeStickiness: { NeverGrowsWhenTypingAtEdges: 1 }, EditorOption: { readOnly: 1 } }
  };
  window.registerCommand = jest.fn();
  window.electronAPI = { spellcheck: {
    checkWords: jest.fn(async () => ({ success:true, misspelled:['teh'], results:{teh:['the']} })),
    getSuggestions: jest.fn(async () => ({ success:true, suggestions:['the'] })),
    addWord: jest.fn()
  } };
  window.eval(source);
  window.proofreader.activate();
});
afterEach(() => { window.proofreader.deactivate(); jest.clearAllTimers(); jest.useRealTimers(); });
test('clicking a correction changes only the word, preserves quotes and creates undo boundaries', async () => {
  text = "'teh'"; version++;
  await window.proofreader.recheck();
  clickWord(); await flush();
  [...popup().querySelectorAll('button')].find(b => b.textContent === 'the').click();
  expect(text).toBe("'the'");
  expect(editor.pushUndoStop).toHaveBeenCalledTimes(2);
  expect(popup()).toBeNull();
});
test('fetches suggestions omitted from the batch', async () => {
  window.electronAPI.spellcheck.checkWords.mockResolvedValue({ success:true, misspelled:['teh'], results:{} });
  await window.proofreader.recheck(); clickWord(); await flush();
  expect(window.electronAPI.spellcheck.getSuggestions).toHaveBeenCalledWith({word:'teh'});
  expect(popup().textContent).toContain('the');
});
test('does not reopen after an edit while suggestions are pending', async () => {
  let resolve;
  window.electronAPI.spellcheck.checkWords.mockResolvedValue({ success:true, misspelled:['teh'], results:{} });
  window.electronAPI.spellcheck.getSuggestions.mockReturnValue(new Promise(r => { resolve = r; }));
  await window.proofreader.recheck(); clickWord();
  text = 'new'; version++; handlers.change({});
  resolve({success:true,suggestions:['the']}); await flush();
  expect(popup()).toBeNull(); expect(editor.executeEdits).not.toHaveBeenCalled();
});
test('a retained button cannot edit a different model', async () => {
  await flush(); clickWord(); await flush();
  const button = [...popup().querySelectorAll('button')].find(b => b.textContent === 'the');
  model = {...model}; handlers.model(); button.click();
  expect(editor.executeEdits).not.toHaveBeenCalled(); expect(popup()).toBeNull();
});
test('dictionary action clears issues and Escape dismisses', async () => {
  await flush(); clickWord(); await flush();
  document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape'}));
  expect(popup()).toBeNull();
  clickWord(); await flush();
  [...popup().querySelectorAll('button')].find(b => b.textContent === 'Add to dictionary').click();
  expect(window.proofreader.getIssues().spelling).toHaveLength(0);
  expect(window.electronAPI.spellcheck.addWord).toHaveBeenCalledWith({word:'teh'});
});
test('pending check is discarded on deactivation', async () => {
  window.proofreader.deactivate(); await flush();
  expect(window.proofreader.getIssues().spelling).toHaveLength(0);
});
