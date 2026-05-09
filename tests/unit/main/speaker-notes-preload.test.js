describe('speaker-notes preload bridge', () => {
  let exposeInMainWorld;
  let ipcOn;
  let ipcRemoveListener;

  beforeEach(() => {
    jest.resetModules();
    exposeInMainWorld = jest.fn();
    ipcOn = jest.fn();
    ipcRemoveListener = jest.fn();

    jest.doMock('electron', () => ({
      contextBridge: {
        exposeInMainWorld
      },
      ipcRenderer: {
        on: ipcOn,
        removeListener: ipcRemoveListener
      }
    }));
  });

  afterEach(() => {
    jest.dontMock('electron');
  });

  test('exposes a minimal listener API for speaker note updates', () => {
    require('../../../speaker-notes-preload.js');

    expect(exposeInMainWorld).toHaveBeenCalledWith('speakerNotesAPI', {
      onUpdateSpeakerNotes: expect.any(Function)
    });

    const api = exposeInMainWorld.mock.calls[0][1];
    const listener = jest.fn();

    const unsubscribe = api.onUpdateSpeakerNotes(listener);
    expect(ipcOn).toHaveBeenCalledWith('update-speaker-notes', expect.any(Function));

    const subscription = ipcOn.mock.calls[0][1];
    const payload = { notes: 'Safe notes', slideNumber: 3 };
    subscription({}, payload);

    expect(listener).toHaveBeenCalledWith(payload);

    unsubscribe();
    expect(ipcRemoveListener).toHaveBeenCalledWith('update-speaker-notes', subscription);
  });
});
