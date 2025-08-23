/**
 * Mock setup utilities for tests
 * Provides common mock configurations for Electron API, editors, etc.
 */

/**
 * Create standard Electron API mock
 * @param {Object} overrides - Custom properties to override defaults
 * @returns {Object} Mock Electron API
 */
function createMockElectronAPI(overrides = {}) {
  return {
    isElectron: true,
    invoke: jest.fn(),
    send: jest.fn(),
    onAppReady: jest.fn(),
    onFileOpened: jest.fn(),
    onFileSaved: jest.fn(),
    onUpdateAvailable: jest.fn(),
    onToggleGamificationPanel: jest.fn(),
    ...overrides
  };
}

/**
 * Create standard editor mock
 * @param {Object} overrides - Custom properties to override defaults
 * @returns {Object} Mock editor
 */
function createMockEditor(overrides = {}) {
  return {
    getValue: jest.fn(() => '# Default Content\n\nSample content for testing.'),
    setValue: jest.fn(),
    layout: jest.fn(),
    onDidChangeModelContent: jest.fn(),
    getSelection: jest.fn(() => 'selected text'),
    focus: jest.fn(),
    ...overrides
  };
}

/**
 * Create mock localStorage
 * @param {Object} initialData - Initial data for localStorage
 * @returns {Object} Mock localStorage
 */
function createMockLocalStorage(initialData = {}) {
  const storage = { ...initialData };
  
  return {
    getItem: jest.fn((key) => storage[key] || null),
    setItem: jest.fn((key, value) => {
      storage[key] = value;
    }),
    removeItem: jest.fn((key) => {
      delete storage[key];
    }),
    clear: jest.fn(() => {
      Object.keys(storage).forEach(key => delete storage[key]);
    })
  };
}

/**
 * Create mock D3.js object for network visualization tests
 * @returns {Object} Mock D3 object
 */
function createMockD3() {
  const mockD3 = {
    select: jest.fn().mockReturnThis(),
    selectAll: jest.fn().mockReturnThis(),
    append: jest.fn().mockReturnThis(),
    attr: jest.fn().mockReturnThis(),
    style: jest.fn().mockReturnThis(),
    text: jest.fn().mockReturnThis(),
    data: jest.fn().mockReturnThis(),
    enter: jest.fn().mockReturnThis(),
    exit: jest.fn().mockReturnThis(),
    remove: jest.fn().mockReturnThis(),
    on: jest.fn().mockReturnThis(),
    call: jest.fn().mockReturnThis(),
    transition: jest.fn().mockReturnThis(),
    duration: jest.fn().mockReturnThis(),
    zoomIdentity: { k: 1, x: 0, y: 0 },
    forceSimulation: jest.fn(() => ({
      nodes: jest.fn().mockReturnThis(),
      force: jest.fn().mockReturnThis(),
      on: jest.fn().mockReturnThis(),
      alpha: jest.fn().mockReturnThis(),
      restart: jest.fn().mockReturnThis()
    })),
    forceManyBody: jest.fn(() => ({ strength: jest.fn().mockReturnThis() })),
    forceLink: jest.fn(() => ({ 
      id: jest.fn().mockReturnThis(),
      distance: jest.fn().mockReturnThis()
    })),
    schemeCategory10: ['#1f77b4', '#ff7f0e', '#2ca02c']
  };

  // Add self-referencing methods after object creation
  mockD3.zoom = jest.fn(() => mockD3);
  mockD3.forceCenter = jest.fn(() => mockD3);
  mockD3.scaleOrdinal = jest.fn(() => mockD3);

  return mockD3;
}

/**
 * Setup window object with common mocks
 * @param {Object} options - Configuration options
 * @param {Object} options.electronAPI - Electron API mock
 * @param {Object} options.editor - Editor mock
 * @param {Object} options.localStorage - localStorage mock
 * @param {Object} options.additional - Additional properties to add to window
 */
function setupMockWindow({ electronAPI, editor, localStorage, additional = {} } = {}) {
  const windowProps = {
    electronAPI: electronAPI || createMockElectronAPI(),
    editor: editor || createMockEditor(),
    localStorage: localStorage || createMockLocalStorage(),
    addEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
    showAILoading: jest.fn(),
    hideAILoading: jest.fn(),
    showLoading: jest.fn(),
    hideLoading: jest.fn(),
    ...additional
  };
  
  // Set up global.window for any code that references it
  global.window = windowProps;
  
  // Set up actual window object for Jest environment
  Object.assign(window, windowProps);
}

/**
 * Create mock file data for network visualization tests
 * @returns {Object} Mock files and content
 */
function createMockFileData() {
  const files = [
    { name: 'file1.md', path: '/path/file1.md' },
    { name: 'file2.md', path: '/path/file2.md' },
    { name: 'file3.md', path: '/path/file3.md' }
  ];

  const fileContent = {
    '/path/file1.md': 'This links to [[file2]] and mentions [[file3|Custom Name]]',
    '/path/file2.md': 'This references [[file1]] and has content',
    '/path/file3.md': 'Standalone file with no links'
  };

  return { files, fileContent };
}

/**
 * Setup mock functions for network visualization
 * @param {Object} fileData - Result from createMockFileData()
 * @returns {Object} Mock functions
 */
function setupNetworkMocks(fileData) {
  const mockGetFilteredFiles = jest.fn(() => Promise.resolve(fileData.files));
  
  const mockElectronAPI = createMockElectronAPI({
    invoke: jest.fn((action, arg) => {
      if (action === 'get-all-files') {
        return Promise.resolve(fileData.files);
      }
      if (action === 'read-file-content') {
        return Promise.resolve(fileData.fileContent[arg] || '');
      }
      return Promise.resolve();
    })
  });

  return { mockGetFilteredFiles, mockElectronAPI };
}

/**
 * Clean up all mocks
 */
function resetAllMocks() {
  jest.clearAllMocks();
  jest.restoreAllMocks();
}

module.exports = {
  createMockElectronAPI,
  createMockEditor,
  createMockLocalStorage,
  createMockD3,
  setupMockWindow,
  createMockFileData,
  setupNetworkMocks,
  resetAllMocks
};