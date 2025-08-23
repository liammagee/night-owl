/**
 * DOM setup utilities for tests
 * Provides common DOM initialization and jsdom compatibility helpers
 */

/**
 * Initialize DOM elements with proper jsdom compatibility
 * @param {string[]} elementIds - Array of element IDs to initialize
 */
function initializeDOMElements(elementIds) {
  elementIds.forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      // Initialize style object with proper getters/setters
      if (!element.style || typeof element.style !== 'object') {
        const styleObj = {};
        Object.defineProperty(element, 'style', {
          value: styleObj,
          writable: true,
          enumerable: true,
          configurable: true
        });
      }
      
      // Initialize textContent property
      if (element.textContent === undefined) {
        Object.defineProperty(element, 'textContent', {
          value: '',
          writable: true,
          enumerable: true,
          configurable: true
        });
      }
      
      // Initialize className property
      if (typeof element.className !== 'string') {
        Object.defineProperty(element, 'className', {
          value: element.getAttribute('class') || '',
          writable: true,
          enumerable: true,
          configurable: true
        });
      }
    }
  });
}

/**
 * Initialize classList and className for jsdom compatibility
 * @param {string[]} modes - Array of mode names (e.g., ['editor', 'presentation'])
 */
function initializeModeElements(modes) {
  modes.forEach(mode => {
    const element = document.getElementById(`${mode}-content`);
    const button = document.getElementById(`${mode}-mode-btn`);
    
    [element, button].forEach(el => {
      if (el) {
        // Initialize className
        Object.defineProperty(el, 'className', {
          value: el.getAttribute('class') || (el === element ? 'content-section' : 'mode-btn'),
          writable: true,
          enumerable: true,
          configurable: true
        });
        
        // Initialize style object
        if (!el.style || typeof el.style !== 'object') {
          Object.defineProperty(el, 'style', {
            value: {},
            writable: true,
            enumerable: true,
            configurable: true
          });
        }
      }
    });
  });
}

/**
 * Setup basic DOM structure for renderer tests
 * @param {string} htmlContent - HTML content to set as document.body.innerHTML
 */
function setupBasicDOM(htmlContent) {
  document.body.innerHTML = htmlContent;
  
  // Override getElementById to add querySelector support for all elements
  const originalGetElementById = document.getElementById;
  document.getElementById = (id) => {
    const element = document.body.querySelector(`#${id}`);
    if (element) {
      // Ensure querySelector is available on all elements
      if (!element.querySelector) {
        element.querySelector = (selector) => {
          // Basic querySelector mock for innerHTML-created elements
          if (element.innerHTML) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(`<div>${element.innerHTML}</div>`, 'text/html');
            return doc.querySelector(selector);
          }
          return null;
        };
      }
    }
    return element;
  };
}

/**
 * Setup document.querySelectorAll override for dynamic elements
 * @param {string} selector - Selector to override (e.g., '.chat-message')
 * @param {string} containerId - ID of container to search within
 */
function setupQuerySelectorAll(selector, containerId) {
  const originalQuerySelectorAll = document.querySelectorAll;
  document.querySelectorAll = function(sel) {
    const container = document.getElementById(containerId);
    if (sel === selector && container) {
      // Parse innerHTML to find elements using DOMParser
      if (container.innerHTML) {
        try {
          const parser = new DOMParser();
          const doc = parser.parseFromString(`<div>${container.innerHTML}</div>`, 'text/html');
          const elements = doc.querySelectorAll(selector);
          return elements;
        } catch (e) {
          // Fallback: manual parsing
          const innerHTML = container.innerHTML;
          const matches = innerHTML.match(new RegExp(`<[^>]*class="[^"]*${selector.substring(1)}[^"]*"[^>]*>`, 'g'));
          return matches ? { length: matches.length } : { length: 0 };
        }
      }
    }
    return originalQuerySelectorAll.call(document, sel);
  };
}

/**
 * Reset DOM to clean state
 */
function resetDOM() {
  document.body.innerHTML = '';
  // Reset any overridden document methods
  if (document.getElementById.__original) {
    document.getElementById = document.getElementById.__original;
  }
  if (document.querySelectorAll.__original) {
    document.querySelectorAll = document.querySelectorAll.__original;
  }
}

module.exports = {
  initializeDOMElements,
  initializeModeElements,
  setupBasicDOM,
  setupQuerySelectorAll,
  resetDOM
};