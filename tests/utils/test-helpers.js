// Test helper utilities

/**
 * Mock Electron's electronAPI for renderer tests
 */
function createMockElectronAPI() {
  return {
    invoke: jest.fn(),
    on: jest.fn(),
    removeListener: jest.fn(),
    send: jest.fn()
  };
}

/**
 * Mock Monaco Editor instance
 */
function createMockMonacoEditor(initialContent = '') {
  return {
    getValue: jest.fn(() => initialContent),
    setValue: jest.fn((content) => {
      initialContent = content;
    }),
    getModel: jest.fn(() => ({
      getValue: jest.fn(() => initialContent),
      setValue: jest.fn((content) => {
        initialContent = content;
      })
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
  };
}

/**
 * Create mock file tree data structure
 */
function createMockFileTree() {
  return {
    name: 'root',
    type: 'directory',
    path: '/mock/root',
    children: [
      {
        name: 'lecture-1.md',
        type: 'file',
        path: '/mock/root/lecture-1.md'
      },
      {
        name: 'lecture-2.md', 
        type: 'file',
        path: '/mock/root/lecture-2.md'
      },
      {
        name: 'references.bib',
        type: 'file',
        path: '/mock/root/references.bib'
      },
      {
        name: 'subfolder',
        type: 'directory',
        path: '/mock/root/subfolder',
        children: [
          {
            name: 'nested-file.md',
            type: 'file',
            path: '/mock/root/subfolder/nested-file.md'
          }
        ]
      }
    ]
  };
}

/**
 * Wait for a condition to be true with timeout
 */
async function waitFor(condition, timeout = 5000, interval = 100) {
  const start = Date.now();
  
  while (Date.now() - start < timeout) {
    if (await condition()) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  throw new Error(`Condition not met within ${timeout}ms`);
}

/**
 * Create mock BibTeX entries for testing
 */
function createMockBibEntries() {
  return [
    {
      type: 'article',
      key: 'smith2024',
      fields: {
        title: 'A Modern Approach to Testing',
        author: 'John Smith and Jane Doe',
        journal: 'Journal of Software Testing',
        year: '2024'
      }
    },
    {
      type: 'book',
      key: 'testing2023',
      fields: {
        title: 'Comprehensive Testing Strategies',
        author: 'Alice Johnson',
        publisher: 'Academic Press',
        year: '2023'
      }
    }
  ];
}

/**
 * Create sample content with various features for testing
 */
function createSampleMarkdownContent() {
  return `# Test Document

This is a test document with various features.

## Internal Links

References to [[other-file]] and [[another-document|Custom Display]].

## Lists

- Item 1
- Item 2 with [[internal-ref]]
- Item 3

## Code

\`\`\`javascript
function test() {
    return "hello";
}
\`\`\`

## Math

Inline: $x = y + z$

Display:
$$
E = mc^2
$$

## Citations

According to @smith2024, testing is important.`;
}

/**
 * Mock DOM elements for testing
 */
function setupMockDOM() {
  const mockElements = {
    editor: document.createElement('div'),
    preview: document.createElement('div'),
    'file-tree-view': document.createElement('div'),
    'structure-pane': document.createElement('div'),
    'folder-name-modal': document.createElement('div'),
    'folder-name-input': document.createElement('input'),
    'new-folder-btn': document.createElement('button')
  };
  
  // Mock getElementById to return our mock elements
  const originalGetElementById = document.getElementById;
  document.getElementById = jest.fn((id) => {
    return mockElements[id] || originalGetElementById.call(document, id);
  });
  
  return mockElements;
}

/**
 * Clean up after DOM mocking
 */
function teardownMockDOM() {
  document.getElementById.mockRestore();
}

/**
 * Assert that content contains internal links
 */
function assertHasInternalLinks(content, expectedLinks) {
  const linkRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  const foundLinks = [];
  let match;
  
  while ((match = linkRegex.exec(content)) !== null) {
    foundLinks.push({
      target: match[1],
      display: match[2] || match[1]
    });
  }
  
  expect(foundLinks).toHaveLength(expectedLinks.length);
  
  expectedLinks.forEach((expectedLink, index) => {
    expect(foundLinks[index].target).toBe(expectedLink.target);
    if (expectedLink.display) {
      expect(foundLinks[index].display).toBe(expectedLink.display);
    }
  });
}

/**
 * Simulate keyboard shortcut
 */
function simulateKeyboardShortcut(key, modifiers = []) {
  const event = new KeyboardEvent('keydown', {
    key,
    ctrlKey: modifiers.includes('ctrl'),
    shiftKey: modifiers.includes('shift'),
    altKey: modifiers.includes('alt'),
    metaKey: modifiers.includes('meta')
  });
  
  document.dispatchEvent(event);
  return event;
}

module.exports = {
  createMockElectronAPI,
  createMockMonacoEditor,
  createMockFileTree,
  waitFor,
  createMockBibEntries,
  createSampleMarkdownContent,
  setupMockDOM,
  teardownMockDOM,
  assertHasInternalLinks,
  simulateKeyboardShortcut
};