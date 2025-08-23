/**
 * Common test helper utilities
 * Provides reusable test patterns and assertions
 */

/**
 * Standard beforeEach setup for renderer tests
 * @param {Function} customSetup - Optional custom setup function
 */
function standardBeforeEach(customSetup) {
  return function() {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Run custom setup if provided
    if (customSetup) {
      customSetup.call(this);
    }
  };
}

/**
 * Standard afterEach cleanup for tests
 * @param {Function} customCleanup - Optional custom cleanup function
 */
function standardAfterEach(customCleanup) {
  return function() {
    // Run custom cleanup if provided
    if (customCleanup) {
      customCleanup.call(this);
    }
    
    // Restore all mocks to prevent interference with other tests
    jest.restoreAllMocks();
  };
}

/**
 * Wait for async operations to complete
 * @param {number} ms - Milliseconds to wait (default: 0)
 * @returns {Promise} Promise that resolves after delay
 */
function waitFor(ms = 0) {
  if (ms === 0) {
    return Promise.resolve();
  }
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a spy with automatic cleanup
 * @param {Object} object - Object to spy on
 * @param {string} method - Method name to spy on
 * @param {*} mockImplementation - Optional mock implementation
 * @returns {jest.SpyInstance} Jest spy that will be automatically restored
 */
function createSpy(object, method, mockImplementation) {
  const spy = jest.spyOn(object, method);
  if (mockImplementation) {
    spy.mockImplementation(mockImplementation);
  }
  
  // Store spy for cleanup
  if (!global.testSpies) {
    global.testSpies = [];
  }
  global.testSpies.push(spy);
  
  return spy;
}

/**
 * Clean up all created spies
 */
function cleanupSpies() {
  if (global.testSpies) {
    global.testSpies.forEach(spy => {
      if (spy.mockRestore) {
        spy.mockRestore();
      }
    });
    global.testSpies = [];
  }
}

/**
 * Expect no console errors during test execution
 */
function expectNoConsoleErrors() {
  const originalConsoleError = console.error;
  const errors = [];
  
  console.error = (...args) => {
    errors.push(args);
    originalConsoleError(...args);
  };
  
  return {
    restore: () => {
      console.error = originalConsoleError;
      if (errors.length > 0) {
        throw new Error(`Unexpected console errors: ${JSON.stringify(errors)}`);
      }
    }
  };
}

/**
 * Test that a function doesn't throw
 * @param {Function} fn - Function to test
 * @param {...any} args - Arguments to pass to function
 */
function expectNotToThrow(fn, ...args) {
  expect(() => fn(...args)).not.toThrow();
}

/**
 * Test that an async function doesn't throw
 * @param {Function} asyncFn - Async function to test
 * @param {...any} args - Arguments to pass to function
 */
async function expectAsyncNotToThrow(asyncFn, ...args) {
  await expect(asyncFn(...args)).resolves.not.toThrow();
}

/**
 * Verify that DOM element has expected properties
 * @param {Element} element - DOM element to check
 * @param {Object} expectedProperties - Expected properties
 */
function expectElementProperties(element, expectedProperties) {
  expect(element).toBeTruthy();
  
  Object.entries(expectedProperties).forEach(([prop, value]) => {
    if (prop === 'style') {
      Object.entries(value).forEach(([styleProp, styleValue]) => {
        expect(element.style[styleProp]).toBe(styleValue);
      });
    } else {
      expect(element[prop]).toBe(value);
    }
  });
}

/**
 * Mock event object for testing event handlers
 * @param {string} type - Event type (e.g., 'click', 'keypress')
 * @param {Object} properties - Additional event properties
 * @returns {Object} Mock event object
 */
function createMockEvent(type, properties = {}) {
  return {
    type,
    preventDefault: jest.fn(),
    stopPropagation: jest.fn(),
    target: null,
    currentTarget: null,
    ...properties
  };
}

/**
 * Test suite wrapper that provides common setup/teardown
 * @param {string} description - Test suite description
 * @param {Function} tests - Function containing the tests
 * @param {Object} options - Configuration options
 * @param {Function} options.beforeEach - Custom beforeEach setup
 * @param {Function} options.afterEach - Custom afterEach cleanup
 */
function describeSuite(description, tests, options = {}) {
  describe(description, () => {
    beforeEach(standardBeforeEach(options.beforeEach));
    afterEach(standardAfterEach(options.afterEach));
    
    tests();
  });
}

module.exports = {
  standardBeforeEach,
  standardAfterEach,
  waitFor,
  createSpy,
  cleanupSpies,
  expectNoConsoleErrors,
  expectNotToThrow,
  expectAsyncNotToThrow,
  expectElementProperties,
  createMockEvent,
  describeSuite
};