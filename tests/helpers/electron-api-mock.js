const { createCapabilityApi } = require('../../preload-ipc-guard');

function createElectronApiMock(implementation = async () => ({})) {
  const listeners = {};
  const invoke = jest.fn(implementation);
  const send = jest.fn();
  const ipcRenderer = {
    invoke,
    send,
    on: jest.fn((channel, listener) => {
      listeners[channel] = (...args) => listener({ sender: 'main' }, ...args);
    }),
    removeListener: jest.fn((channel) => {
      delete listeners[channel];
    })
  };
  return {
    api: createCapabilityApi(ipcRenderer, { platform: 'test' }),
    invoke,
    ipcRenderer,
    listeners,
    send
  };
}

module.exports = { createElectronApiMock };
