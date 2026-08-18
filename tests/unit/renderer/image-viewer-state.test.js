describe('image viewer state restore', () => {
  test('restores editor mode and pane visibility after closing the image viewer', () => {
    const { restoreEditorAfterImageViewer } = require('../../../orchestrator/modules/image-viewer-state.js');

    document.body.innerHTML = `
      <div id="image-viewer-container"></div>
      <div id="panes-container" style="display:none"></div>
      <div id="mode-switcher" style="display:none"></div>
      <div id="editor-pane" style="display:none"></div>
      <div id="editor-container" style="display:none"></div>
      <div id="resizer" style="display:none"></div>
      <div id="preview-zoom-controls" style="display:none"></div>
    `;

    const switchToMode = jest.fn();
    const exitPreviewOnlyMode = jest.fn();
    const refreshEditorLayout = jest.fn();
    const editorRef = {
      layout: jest.fn(),
      focus: jest.fn()
    };
    const scheduled = [];
    const schedule = (callback) => scheduled.push(callback);
    const documentRef = {
      getElementById: (id) => document.querySelector(`#${id}`)
    };
    const disposeViewer = jest.fn();
    document.querySelector('#image-viewer-container')._nightOwlDispose = disposeViewer;

    restoreEditorAfterImageViewer({
      documentRef,
      switchToMode,
      exitPreviewOnlyMode,
      refreshEditorLayout,
      editorRef,
      schedule
    });

    expect(document.querySelector('#image-viewer-container')).toBeNull();
    expect(disposeViewer).toHaveBeenCalledTimes(1);
    expect(switchToMode).toHaveBeenCalledWith('editor');
    expect(exitPreviewOnlyMode).toHaveBeenCalled();
    expect(document.querySelector('#panes-container').style.display).toBe('flex');
    expect(document.querySelector('#mode-switcher').style.display).toBe('');
    expect(document.querySelector('#editor-pane').style.display).toBe('');
    expect(document.querySelector('#editor-container').style.display).toBe('');
    expect(document.querySelector('#resizer').style.display).toBe('');
    expect(document.querySelector('#preview-zoom-controls').style.display).toBe('');

    scheduled.forEach((callback) => callback());

    expect(refreshEditorLayout).toHaveBeenCalled();
    expect(editorRef.layout).toHaveBeenCalled();
    expect(editorRef.focus).toHaveBeenCalled();
  });

  test('still restores the editor chrome when optional callbacks are unavailable', () => {
    const { restoreEditorAfterImageViewer } = require('../../../orchestrator/modules/image-viewer-state.js');

    document.body.innerHTML = `
      <div id="image-viewer-container"></div>
      <div id="panes-container" style="display:none"></div>
      <div id="mode-switcher" style="display:none"></div>
      <div id="editor-pane" style="display:none"></div>
      <div id="editor-container" style="display:none"></div>
      <div id="resizer" style="display:none"></div>
      <div id="preview-zoom-controls" style="display:none"></div>
    `;

    const documentRef = {
      getElementById: (id) => document.querySelector(`#${id}`)
    };

    expect(() => {
      restoreEditorAfterImageViewer({
        documentRef,
        schedule: () => {}
      });
    }).not.toThrow();

    expect(document.querySelector('#image-viewer-container')).toBeNull();
    expect(document.querySelector('#panes-container').style.display).toBe('flex');
    expect(document.querySelector('#mode-switcher').style.display).toBe('');
    expect(document.querySelector('#editor-pane').style.display).toBe('');
    expect(document.querySelector('#editor-container').style.display).toBe('');
    expect(document.querySelector('#resizer').style.display).toBe('');
    expect(document.querySelector('#preview-zoom-controls').style.display).toBe('');
  });
});
