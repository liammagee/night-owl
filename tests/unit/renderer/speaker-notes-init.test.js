const path = require('path');

const modulePath = path.resolve(__dirname, '../../../orchestrator/modules/speakerNotes.js');

describe('speaker notes lazy initialization', () => {
  let readyState;

  beforeEach(() => {
    jest.resetModules();
    document.getElementById = Document.prototype.getElementById;
    document.body.innerHTML = `
      <button id="show-speaker-notes-btn">Notes</button>
      <div id="speaker-notes-pane"></div>
      <div id="speaker-notes-content"></div>
      <button id="toggle-speaker-notes-in-preview">Show in Preview</button>
    `;
    window.showRightPane = jest.fn();
    readyState = jest.spyOn(document, 'readyState', 'get');
  });

  afterEach(() => {
    readyState.mockRestore();
    delete window.showRightPane;
    delete window.initializeSpeakerNotes;
  });

  test('late loading binds the Notes button after renderer startup has finished', () => {
    readyState.mockReturnValue('complete');
    require(modulePath);
    document.getElementById('show-speaker-notes-btn').click();
    expect(window.showRightPane).toHaveBeenCalledWith('speaker-notes');
    expect(window.showRightPane).toHaveBeenCalledTimes(1);
  });

  test('renderer initialization and module self-initialization do not duplicate the action', () => {
    readyState.mockReturnValue('complete');
    require(modulePath);
    window.initializeSpeakerNotes();
    window.initializeSpeakerNotes();
    document.getElementById('show-speaker-notes-btn').click();
    expect(window.showRightPane).toHaveBeenCalledTimes(1);
  });

  test('loading before DOM ready also initializes once when startup calls it first', () => {
    readyState.mockReturnValue('loading');
    require(modulePath);
    window.initializeSpeakerNotes();
    document.dispatchEvent(new Event('DOMContentLoaded'));
    document.getElementById('show-speaker-notes-btn').click();
    expect(window.showRightPane).toHaveBeenCalledTimes(1);
    expect(window.showRightPane).toHaveBeenCalledWith('speaker-notes');
  });
});
