describe('formatting module table insertion', () => {
  const modulePath = '../../../orchestrator/modules/formatting.js';

  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
    window.updatePreviewAndStructure = jest.fn().mockResolvedValue(undefined);
    window.editor = {
      getPosition: jest.fn(() => ({ lineNumber: 1, column: 1 })),
      executeEdits: jest.fn(),
      focus: jest.fn(),
      getValue: jest.fn(() => '')
    };
  });

  test('insertTable inserts markdown without forcing a second preview refresh', () => {
    require(modulePath);

    window.insertTable();

    const form = document.querySelector('form');
    expect(form).toBeTruthy();

    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    expect(window.editor.executeEdits).toHaveBeenCalledTimes(1);
    const [, edits] = window.editor.executeEdits.mock.calls[0];
    expect(edits[0].text).toContain('| Header 1 | Header 2 | Header 3 |');
    expect(edits[0].text).toContain('| --- | --- | --- |');
    expect(window.updatePreviewAndStructure).not.toHaveBeenCalled();
  });
});
