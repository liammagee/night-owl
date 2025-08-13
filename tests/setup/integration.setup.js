// Setup for integration tests
const { spawn } = require('child_process');
const path = require('path');

// Extend test timeout for integration tests
jest.setTimeout(30000);

// Mock file system operations for integration tests
jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
  readdir: jest.fn(),
  mkdir: jest.fn(),
  access: jest.fn(),
  stat: jest.fn()
}));

// Mock Electron's APIs for integration tests
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

// Helper to start Electron app for testing
global.startElectronApp = async () => {
  const electronPath = require('electron');
  const appPath = path.join(__dirname, '../../');
  
  return new Promise((resolve, reject) => {
    const electronProcess = spawn(electronPath, [appPath, '--dev'], {
      stdio: 'pipe'
    });
    
    electronProcess.stdout.on('data', (data) => {
      const output = data.toString();
      if (output.includes('App ready')) {
        resolve(electronProcess);
      }
    });
    
    electronProcess.stderr.on('data', (data) => {
      console.error('Electron stderr:', data.toString());
    });
    
    electronProcess.on('error', reject);
    
    // Timeout after 15 seconds
    setTimeout(() => {
      electronProcess.kill();
      reject(new Error('Electron app start timeout'));
    }, 15000);
  });
};

// Helper to stop Electron app
global.stopElectronApp = (electronProcess) => {
  return new Promise((resolve) => {
    if (electronProcess && !electronProcess.killed) {
      electronProcess.on('close', resolve);
      electronProcess.kill();
    } else {
      resolve();
    }
  });
};