// Setup for main process tests

// Mock Electron's main process APIs
jest.mock('electron', () => ({
  app: {
    getPath: jest.fn((name) => {
      const mockPaths = {
        userData: '/mock/user-data',
        documents: '/mock/documents',
        home: '/mock/home'
      };
      return mockPaths[name] || '/mock/path';
    }),
    getName: jest.fn(() => 'Hegel Pedagogy AI'),
    getVersion: jest.fn(() => '1.0.0'),
    on: jest.fn(),
    whenReady: jest.fn(() => Promise.resolve()),
    quit: jest.fn()
  },
  BrowserWindow: jest.fn(() => ({
    loadFile: jest.fn(),
    loadURL: jest.fn(),
    on: jest.fn(),
    show: jest.fn(),
    webContents: {
      send: jest.fn(),
      on: jest.fn()
    }
  })),
  ipcMain: {
    handle: jest.fn(),
    on: jest.fn()
  },
  dialog: {
    showOpenDialog: jest.fn(),
    showSaveDialog: jest.fn(),
    showMessageBox: jest.fn()
  }
}));

// Mock file system operations
jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
  readdir: jest.fn(),
  mkdir: jest.fn(),
  access: jest.fn(),
  stat: jest.fn()
}));

global.console = {
  ...console,
  // Uncomment to hide console logs during tests
  // log: jest.fn(),
  // warn: jest.fn(),
  // error: jest.fn()
};