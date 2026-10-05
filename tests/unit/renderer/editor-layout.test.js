const path = require('path');

const modulePath = path.resolve(__dirname, '../../../orchestrator/modules/editor-layout.js');

describe('editor layout helpers', () => {
  let layout;

  beforeEach(() => {
    // The shared renderer setup stubs getElementById; these modules need the real DOM.
    document.getElementById = Document.prototype.getElementById;
    jest.resetModules();
    delete window.NightOwlEditorLayout;
    layout = require(modulePath);
  });

  test('word wrap off keeps the horizontal scrollbar visible', () => {
    const options = layout.editorOptionsForWordWrap('off');
    expect(options.wordWrap).toBe('off');
    expect(options.scrollbar.horizontal).toBe('visible');
    expect(options.scrollBeyondLastColumn).toBeGreaterThan(0);
  });

  test('word wrap on lets the horizontal scrollbar auto-hide', () => {
    expect(layout.editorOptionsForWordWrap('on').scrollbar.horizontal).toBe('auto');
    expect(layout.editorOptionsForWordWrap(undefined).wordWrap).toBe('on');
    expect(layout.editorOptionsForWordWrap(false).wordWrap).toBe('off');
    expect(layout.editorOptionsForWordWrap('bounded').scrollbar.horizontal).toBe('auto');
  });

  test('applyWordWrap updates the editor and toggles source-view wrapping together', () => {
    const editor = { updateOptions: jest.fn() };
    const pre = document.createElement('pre');
    layout.applyWordWrap(editor, 'off', pre);
    expect(editor.updateOptions).toHaveBeenCalledWith(expect.objectContaining({ wordWrap: 'off' }));
    expect(pre.classList.contains(layout.SOURCE_NOWRAP_CLASS)).toBe(true);
    layout.applyWordWrap(editor, 'on', pre);
    expect(pre.classList.contains(layout.SOURCE_NOWRAP_CLASS)).toBe(false);
  });

  test('syncSourceViewWrap finds #preview-source by default', () => {
    document.body.innerHTML = '<pre id="preview-source"></pre>';
    expect(layout.syncSourceViewWrap('off')).toBe(true);
    expect(document.getElementById('preview-source').className).toBe(layout.SOURCE_NOWRAP_CLASS);
  });
});
