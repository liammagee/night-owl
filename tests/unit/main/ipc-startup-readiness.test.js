const fs = require('fs');
const path = require('path');

describe('IPC startup readiness', () => {
  test('registers IPC before loading renderer code or awaiting optional tutor startup', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../../main.js'), 'utf8');
    const createWindowIndex = source.indexOf('createWindow({ deferLoad: true })');
    const registerIndex = source.indexOf('ipcHandlers.registerAllHandlers({', createWindowIndex);
    const tutorIndex = source.indexOf('const tutorInitialization = (async () => {', registerIndex);
    const loadIndex = source.indexOf('await loadMainWindow(initialWindow)', tutorIndex);
    const awaitTutorIndex = source.indexOf('await tutorInitialization;', loadIndex);

    expect(createWindowIndex).toBeGreaterThan(-1);
    expect(registerIndex).toBeGreaterThan(createWindowIndex);
    expect(tutorIndex).toBeGreaterThan(registerIndex);
    expect(loadIndex).toBeGreaterThan(tutorIndex);
    expect(awaitTutorIndex).toBeGreaterThan(loadIndex);
  });

  test('continues registering independent groups after one subsystem fails', () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { registerHandlerGroups } = require('../../../ipc');
    const calls = [];
    const failure = new Error('optional service unavailable');

    const result = registerHandlerGroups([
      { label: 'First', register: () => calls.push('first') },
      { label: 'Optional', register: () => { throw failure; } },
      { label: 'Settings', register: () => calls.push('settings') },
      { label: 'File', register: () => calls.push('file') }
    ]);

    expect(calls).toEqual(['first', 'settings', 'file']);
    expect(result).toMatchObject({
      success: false,
      registered: 3,
      failures: [{ label: 'Optional', error: failure }]
    });
    expect(consoleError).toHaveBeenCalledWith(
      '[IPC] Error registering Optional handlers:',
      failure
    );
    consoleError.mockRestore();
  });
});
