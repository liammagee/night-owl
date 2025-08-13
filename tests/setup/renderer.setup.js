// Setup for renderer process tests

// Mock Electron's renderer APIs
global.electronAPI = {
  invoke: jest.fn(),
  on: jest.fn(),
  removeListener: jest.fn(),
  send: jest.fn()
};

// Mock Monaco Editor
global.monaco = {
  editor: {
    create: jest.fn(() => ({
      getValue: jest.fn(() => ''),
      setValue: jest.fn(),
      getModel: jest.fn(() => ({
        getValue: jest.fn(() => ''),
        setValue: jest.fn()
      })),
      setModel: jest.fn(),
      getPosition: jest.fn(() => ({ lineNumber: 1, column: 1 })),
      setPosition: jest.fn(),
      getSelection: jest.fn(() => ({
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 1
      })),
      setSelection: jest.fn(),
      executeEdits: jest.fn(),
      focus: jest.fn(),
      layout: jest.fn(),
      updateOptions: jest.fn(),
      onDidChangeModelContent: jest.fn(),
      dispose: jest.fn()
    })),
    createModel: jest.fn(() => ({
      getValue: jest.fn(() => ''),
      setValue: jest.fn(),
      dispose: jest.fn()
    })),
    defineTheme: jest.fn(),
    setTheme: jest.fn()
  },
  Range: jest.fn(),
  Selection: jest.fn()
};

// Mock marked (markdown parser)
global.marked = {
  parse: jest.fn((text) => `<p>${text}</p>`)
};

// Mock DOM elements that might not exist during tests
global.document.getElementById = jest.fn((id) => {
  const mockElements = {
    'editor': {
      style: {},
      innerHTML: '',
      appendChild: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    },
    'preview': {
      style: {},
      innerHTML: '',
      scrollTop: 0
    },
    'file-tree-view': {
      style: {},
      innerHTML: ''
    }
  };
  return mockElements[id] || {
    style: {},
    innerHTML: '',
    value: '',
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    appendChild: jest.fn(),
    removeChild: jest.fn(),
    classList: {
      add: jest.fn(),
      remove: jest.fn(),
      contains: jest.fn(() => false),
      toggle: jest.fn()
    }
  };
});

// Mock window methods
global.window.showNotification = jest.fn();
global.window.updatePreviewAndStructure = jest.fn();

// Suppress console logs during tests (optional)
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};