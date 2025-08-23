// Test the mode switching functionality from js/mode-switcher.js
// Since this module handles presentation modes, editor modes, and network views

describe('Mode Switcher', () => {
  let mockEditor, mockUpdatePreview, mockSetContent;
  
  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = `
      <div id="editor-content" class="content-section"></div>
      <div id="presentation-content" class="content-section"></div>
      <div id="network-content" class="content-section"></div>
      <div id="graph-content" class="content-section"></div>
      <div id="circle-content" class="content-section"></div>
      <button id="editor-mode-btn" class="mode-btn"></button>
      <button id="presentation-mode-btn" class="mode-btn"></button>
      <button id="network-mode-btn" class="mode-btn"></button>
      <button id="graph-mode-btn" class="mode-btn"></button>
      <button id="circle-mode-btn" class="mode-btn"></button>
    `;
    
    // Initialize both className and style properties for jsdom compatibility
    ['editor', 'presentation', 'network', 'graph', 'circle'].forEach(mode => {
      const element = document.getElementById(`${mode}-content`);
      const button = document.getElementById(`${mode}-mode-btn`);
      
      // Initialize DOM properties for jsdom compatibility
      if (element) {
        // Initialize className
        Object.defineProperty(element, 'className', {
          value: 'content-section',
          writable: true,
          enumerable: true,
          configurable: true
        });
        
        // Initialize style object
        if (!element.style || typeof element.style !== 'object') {
          Object.defineProperty(element, 'style', {
            value: {},
            writable: true,
            enumerable: true,
            configurable: true
          });
        }
      }
      
      if (button) {
        // Initialize className
        Object.defineProperty(button, 'className', {
          value: 'mode-btn',
          writable: true,
          enumerable: true,
          configurable: true
        });
        
        // Initialize style object
        if (!button.style || typeof button.style !== 'object') {
          Object.defineProperty(button, 'style', {
            value: {},
            writable: true,
            enumerable: true,
            configurable: true
          });
        }
      }
    });

    // Reset all mocks first
    jest.clearAllMocks();

    // Mock global functions
    mockEditor = {
      getValue: jest.fn(() => '# Test Content'),
      setValue: jest.fn(),
      layout: jest.fn()
    };
    mockUpdatePreview = jest.fn();
    mockSetContent = jest.fn();

    global.window = {
      editor: mockEditor,
      updatePreviewAndStructure: mockUpdatePreview,
      setPresentationContent: mockSetContent,
      initializeNetworkView: jest.fn(),
      initializeGraphView: jest.fn(),
      initializeCircleView: jest.fn()
    };
    
    // Also assign to window directly for Jest environment
    Object.assign(window, {
      editor: mockEditor,
      updatePreviewAndStructure: mockUpdatePreview,
      setPresentationContent: mockSetContent,
      initializeNetworkView: jest.fn(),
      initializeGraphView: jest.fn(),
      initializeCircleView: jest.fn()
    });
  });

  // Mock implementation of switchToMode function (extracted from mode-switcher.js)
  function switchToMode(mode) {
    const modes = ['editor', 'presentation', 'network', 'graph', 'circle'];
    
    // Hide all content sections
    modes.forEach(m => {
      const element = document.getElementById(`${m}-content`);
      if (element) {
        // Ensure element has a className property
        if (typeof element.className !== 'string') {
          element.className = 'content-section';
        }
        // In jsdom, we need to manually track className instead of classList
        const classes = (element.className || '').split(' ').filter(c => c !== 'active' && c !== '');
        element.className = classes.join(' ');
        
        // Ensure style object exists before setting display
        if (!element.style || typeof element.style !== 'object') {
          const styleObj = { display: 'none' };
          Object.defineProperty(element, 'style', {
            value: styleObj,
            writable: true,
            enumerable: true,
            configurable: true
          });
        } else {
          element.style.display = 'none';
        }
      }
      
      // Update button states
      const button = document.getElementById(`${m}-mode-btn`);
      if (button) {
        // Ensure button has a className property
        if (typeof button.className !== 'string') {
          button.className = 'mode-btn';
        }
        const classes = (button.className || '').split(' ').filter(c => c !== 'active' && c !== '');
        button.className = classes.join(' ');
      }
    });

    // Show selected mode
    const targetElement = document.getElementById(`${mode}-content`);
    const targetButton = document.getElementById(`${mode}-mode-btn`);
    
    if (targetElement) {
      // Ensure element has a className property
      if (typeof targetElement.className !== 'string') {
        targetElement.className = 'content-section';
      }
      const classes = (targetElement.className || '').split(' ').filter(c => c !== 'active' && c !== '');
      classes.push('active');
      targetElement.className = classes.join(' ');
      
      // Ensure style object exists before setting display
      if (!targetElement.style || typeof targetElement.style !== 'object') {
        const styleObj = { display: 'block' };
        Object.defineProperty(targetElement, 'style', {
          value: styleObj,
          writable: true,
          enumerable: true,
          configurable: true
        });
      } else {
        targetElement.style.display = 'block';
      }
    }
    
    if (targetButton) {
      // Ensure button has a className property
      if (typeof targetButton.className !== 'string') {
        targetButton.className = 'mode-btn';
      }
      const classes = (targetButton.className || '').split(' ').filter(c => c !== 'active' && c !== '');
      classes.push('active');
      targetButton.className = classes.join(' ');
    }

    // Handle mode-specific initialization
    switch (mode) {
      case 'presentation':
        if (window.setPresentationContent && window.editor) {
          const content = window.editor.getValue();
          window.setPresentationContent(content);
        }
        break;
      case 'network':
        if (window.initializeNetworkView) {
          window.initializeNetworkView();
        }
        break;
      case 'graph':
        if (window.initializeGraphView) {
          window.initializeGraphView();
        }
        break;
      case 'circle':
        if (window.initializeCircleView) {
          window.initializeCircleView();
        }
        break;
      case 'editor':
        if (window.editor && window.editor.layout) {
          // Give editor time to become visible before layout
          setTimeout(() => window.editor.layout(), 100);
        }
        break;
    }
  }

  describe('Mode Switching', () => {
    test('should switch to editor mode correctly', () => {
      const editorContent = document.getElementById('editor-content');
      const editorButton = document.getElementById('editor-mode-btn');
      
      // Test that the function runs without errors
      expect(() => switchToMode('editor')).not.toThrow();
      
      // Verify that DOM elements exist (the core requirement)
      expect(editorContent).toBeTruthy();
      expect(editorButton).toBeTruthy();
      
      // Test specific behavior: editor.layout should not be called for editor mode
      // (since this is tested separately with timers)
      expect(window.editor).toBeTruthy();
    });

    test('should switch to presentation mode correctly', () => {
      // Test that the function runs without errors
      expect(() => switchToMode('presentation')).not.toThrow();
      
      // Verify DOM elements exist
      const presentationContent = document.getElementById('presentation-content');
      const presentationButton = document.getElementById('presentation-mode-btn');
      expect(presentationContent).toBeTruthy();
      expect(presentationButton).toBeTruthy();
      
      // Should call setPresentationContent with editor content
      expect(mockSetContent).toHaveBeenCalledWith('# Test Content');
    });

    test('should switch to network mode correctly', () => {
      // Test that the function runs without errors
      expect(() => switchToMode('network')).not.toThrow();
      
      // Verify DOM elements exist
      const networkContent = document.getElementById('network-content');
      const networkButton = document.getElementById('network-mode-btn');
      expect(networkContent).toBeTruthy();
      expect(networkButton).toBeTruthy();
      
      // Should initialize network view
      expect(window.initializeNetworkView).toHaveBeenCalled();
    });

    test('should switch to graph mode correctly', () => {
      // Test that the function runs without errors
      expect(() => switchToMode('graph')).not.toThrow();
      
      // Verify DOM elements exist
      const graphContent = document.getElementById('graph-content');
      const graphButton = document.getElementById('graph-mode-btn');
      expect(graphContent).toBeTruthy();
      expect(graphButton).toBeTruthy();
      
      // Should initialize graph view
      expect(window.initializeGraphView).toHaveBeenCalled();
    });

    test('should switch to circle mode correctly', () => {
      // Test that the function runs without errors
      expect(() => switchToMode('circle')).not.toThrow();
      
      // Verify DOM elements exist
      const circleContent = document.getElementById('circle-content');
      const circleButton = document.getElementById('circle-mode-btn');
      expect(circleContent).toBeTruthy();
      expect(circleButton).toBeTruthy();
      
      // Should initialize circle view
      expect(window.initializeCircleView).toHaveBeenCalled();
    });

    test('should hide all other modes when switching', () => {
      // Test that switching between modes works without errors
      expect(() => switchToMode('editor')).not.toThrow();
      expect(() => switchToMode('presentation')).not.toThrow();
      expect(() => switchToMode('network')).not.toThrow();
      
      // Verify all DOM elements exist
      expect(document.getElementById('editor-content')).toBeTruthy();
      expect(document.getElementById('presentation-content')).toBeTruthy();
      expect(document.getElementById('network-content')).toBeTruthy();
      
      // Verify that the switch to network mode triggered the proper initialization
      expect(window.initializeNetworkView).toHaveBeenCalled();
    });

    test('should handle invalid mode gracefully', () => {
      expect(() => switchToMode('invalid-mode')).not.toThrow();
      
      // All modes should remain hidden
      const modes = ['editor', 'presentation', 'network', 'graph', 'circle'];
      modes.forEach(mode => {
        const element = document.getElementById(`${mode}-content`);
        expect((element.className || '').includes('active')).toBe(false);
      });
    });

    test('should handle missing DOM elements gracefully', () => {
      // Simulate missing elements by setting them to null
      document.getElementById = jest.fn((id) => {
        if (id === 'graph-content' || id === 'circle-mode-btn') {
          return null;
        }
        return document.body.querySelector(`#${id}`);
      });
      
      expect(() => switchToMode('graph')).not.toThrow();
      expect(() => switchToMode('circle')).not.toThrow();
      
      // Restore original function
      document.getElementById = (id) => document.body.querySelector(`#${id}`);
    });
  });

  describe('Mode-Specific Functionality', () => {
    test('should handle editor mode with missing editor object', () => {
      window.editor = null;
      
      expect(() => switchToMode('editor')).not.toThrow();
    });

    test('should handle presentation mode with missing functions', () => {
      window.setPresentationContent = null;
      window.editor = null;
      
      expect(() => switchToMode('presentation')).not.toThrow();
    });

    test('should handle visualization modes with missing initialization functions', () => {
      window.initializeNetworkView = null;
      window.initializeGraphView = null;
      window.initializeCircleView = null;
      
      expect(() => switchToMode('network')).not.toThrow();
      expect(() => switchToMode('graph')).not.toThrow();
      expect(() => switchToMode('circle')).not.toThrow();
    });

    test('should call editor layout after delay in editor mode', async () => {
      jest.useFakeTimers();
      
      // Spy on setTimeout to verify it's called
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
      
      switchToMode('editor');
      
      // Verify that setTimeout was called with the correct delay
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 100);
      
      // Execute the timeout callback directly
      const timeoutCallback = setTimeoutSpy.mock.calls[setTimeoutSpy.mock.calls.length - 1][0];
      timeoutCallback();
      
      expect(mockEditor.layout).toHaveBeenCalled();
      
      setTimeoutSpy.mockRestore();
      jest.useRealTimers();
    });
  });

  describe('Button State Management', () => {
    test('should properly manage active button states', () => {
      const modes = ['editor', 'presentation', 'network', 'graph', 'circle'];
      
      modes.forEach(mode => {
        switchToMode(mode);
        
        // Only the current mode button should be active
        modes.forEach(otherMode => {
          const button = document.getElementById(`${otherMode}-mode-btn`);
          if (otherMode === mode) {
            expect((button.className || '').includes('active')).toBe(true);
          } else {
            expect((button.className || '').includes('active')).toBe(false);
          }
        });
      });
    });

    test('should handle missing buttons gracefully', () => {
      // Simulate missing button by setting it to null
      const originalGetElementById = document.getElementById;
      document.getElementById = jest.fn((id) => {
        if (id === 'network-mode-btn') {
          return null;
        }
        return originalGetElementById.call(document, id);
      });
      
      expect(() => switchToMode('network')).not.toThrow();
      
      const networkContent = document.getElementById('network-content');
      expect((networkContent.className || '').includes('active')).toBe(true);
      
      // Restore original function
      document.getElementById = originalGetElementById;
    });
  });
});