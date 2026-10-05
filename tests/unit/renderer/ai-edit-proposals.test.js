const path = require('path');

const modulePath = path.resolve(__dirname, '../../../orchestrator/modules/ai-edit-proposals.js');

function positionAt(text, offset) {
  const before = text.slice(0, offset);
  const lines = before.split('\n');
  return { lineNumber: lines.length, column: lines[lines.length - 1].length + 1 };
}

function offsetAt(text, position) {
  const lines = text.split('\n');
  let offset = 0;
  for (let line = 1; line < position.lineNumber; line += 1) offset += lines[line - 1].length + 1;
  return offset + position.column - 1;
}

function createEditor(text, versionId = 7) {
  const model = {
    getVersionId: jest.fn(() => versionId),
    getOffsetAt: jest.fn(position => offsetAt(text, position)),
    getPositionAt: jest.fn(offset => positionAt(text, offset)),
    getValueInRange: jest.fn(range => text.slice(
      offsetAt(text, { lineNumber: range.startLineNumber, column: range.startColumn }),
      offsetAt(text, { lineNumber: range.endLineNumber, column: range.endColumn })
    ))
  };
  return {
    model,
    editor: {
      getModel: () => model,
      executeEdits: jest.fn(() => true),
      pushUndoStop: jest.fn(),
      focus: jest.fn()
    }
  };
}

describe('reviewable AI edit proposals', () => {
  let api;

  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
    delete global.editor;
    delete global.electronAPI;
    api = require(modulePath);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('creates deterministic, independently selectable line hunks', () => {
    const hunks = api.createDiffHunks(
      'Alpha line\nKeep this line\nGamma line\n',
      'Beta line\nKeep this line\nDelta line\n'
    );

    expect(hunks).toEqual([
      expect.objectContaining({ id: 'hunk-1', original: 'Alpha line\n', replacement: 'Beta line\n', sourceLine: 1 }),
      expect.objectContaining({ id: 'hunk-2', original: 'Gamma line\n', replacement: 'Delta line\n', sourceLine: 3 })
    ]);
    expect(api.createDiffHunks('unchanged', 'unchanged')).toEqual([]);
  });

  test('applies accepted hunks once through an undo-bounded Monaco edit', () => {
    const source = 'Alpha line\nKeep this line\nGamma line\n';
    const { editor } = createEditor(source);
    const range = { startLineNumber: 1, startColumn: 1, endLineNumber: 4, endColumn: 1 };
    const captured = api.captureEditorSource(editor, range);
    const proposal = api.createProposal({
      ...captured,
      replacementText: 'Beta line\nKeep this line\nDelta line\n',
      provenance: { provider: 'local', model: 'test', recipe: 'test-v1' }
    });

    expect(api.applyProposal(proposal, editor, new Set(['hunk-2']))).toEqual({
      success: true,
      appliedHunks: 1,
      proposalId: proposal.id
    });
    expect(editor.executeEdits).toHaveBeenCalledTimes(1);
    expect(editor.executeEdits).toHaveBeenCalledWith('ai-edit-proposal', [
      expect.objectContaining({ text: 'Delta line\n' })
    ]);
    expect(editor.pushUndoStop).toHaveBeenCalledTimes(2);
  });

  test('rejects a proposal when the source revision changed', () => {
    const source = 'Original text';
    const { editor, model } = createEditor(source, 4);
    const range = { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: source.length + 1 };
    const captured = api.captureEditorSource(editor, range);
    const proposal = api.createProposal({ ...captured, replacementText: 'Replacement text' });
    model.getVersionId.mockReturnValue(5);

    expect(api.applyProposal(proposal, editor, new Set(['hunk-1']))).toMatchObject({
      success: false,
      stale: true
    });
    expect(editor.executeEdits).not.toHaveBeenCalled();
  });

  test('review UI is non-mutating and supports a decision per hunk', async () => {
    const source = 'Alpha line\nKeep this line\nGamma line\n';
    const { editor } = createEditor(source);
    const range = { startLineNumber: 1, startColumn: 1, endLineNumber: 4, endColumn: 1 };
    const proposal = api.createProposal({
      ...api.captureEditorSource(editor, range),
      replacementText: 'Beta line\nKeep this line\nDelta line\n',
      context: { label: 'Selection', text: source },
      provenance: { provider: 'local', model: 'fixture', recipe: 'rewrite-v1' }
    });

    const resultPromise = api.showReview(proposal, editor);
    expect(editor.executeEdits).not.toHaveBeenCalled();
    const hunks = document.querySelectorAll('.ai-edit-hunk');
    expect(hunks).toHaveLength(2);
    hunks[0].querySelector('[data-ai-edit-decision="reject"]').click();
    document.querySelector('[data-ai-edit-apply]').click();

    await expect(resultPromise).resolves.toMatchObject({ status: 'applied', appliedHunks: 1 });
    expect(editor.executeEdits).toHaveBeenCalledWith('ai-edit-proposal', [
      expect.objectContaining({ text: 'Delta line\n' })
    ]);
  });

  test('remote context policy preserves explicitly local editing', () => {
    expect(api.canSendContext({ provider: 'openai', allowRemoteDocumentContext: false })).toBe(false);
    expect(api.canSendContext({ provider: 'local', allowRemoteDocumentContext: false })).toBe(true);
    expect(api.canSendContext({ provider: 'lmstudio', allowRemoteDocumentContext: false })).toBe(true);
    expect(api.isLocalProvider('ollama')).toBe(true);
  });
});
