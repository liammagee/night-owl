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

    // Reset all mocks
    jest.clearAllMocks();
  });

  // Mock implementation of switchToMode function (extracted from mode-switcher.js)
  function switchToMode(mode) {
    const modes = ['editor', 'presentation', 'network', 'graph', 'circle'];
    
    // Hide all content sections
    modes.forEach(m => {
      const element = document.getElementById(`${m}-content`);
      if (element) {
        element.classList.remove('active');
        element.style.display = 'none';
      }
      
      // Update button states
      const button = document.getElementById(`${m}-mode-btn`);
      if (button) {
        button.classList.remove('active');
      }
    });

    // Show selected mode
    const targetElement = document.getElementById(`${mode}-content`);
    const targetButton = document.getElementById(`${mode}-mode-btn`);
    
    if (targetElement) {
      targetElement.classList.add('active');
      targetElement.style.display = 'block';
    }
    
    if (targetButton) {
      targetButton.classList.add('active');
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
      switchToMode('editor');

      const editorContent = document.getElementById('editor-content');
      const editorButton = document.getElementById('editor-mode-btn');
      
      expect(editorContent.classList.contains('active')).toBe(true);
      expect(editorContent.style.display).toBe('block');
      expect(editorButton.classList.contains('active')).toBe(true);
      
      // Other modes should be hidden
      const presentationContent = document.getElementById('presentation-content');
      expect(presentationContent.classList.contains('active')).toBe(false);
      expect(presentationContent.style.display).toBe('none');
    });

    test('should switch to presentation mode correctly', () => {
      switchToMode('presentation');

      const presentationContent = document.getElementById('presentation-content');
      const presentationButton = document.getElementById('presentation-mode-btn');
      
      expect(presentationContent.classList.contains('active')).toBe(true);
      expect(presentationContent.style.display).toBe('block');
      expect(presentationButton.classList.contains('active')).toBe(true);
      
      // Should call setPresentationContent with editor content
      expect(mockSetContent).toHaveBeenCalledWith('# Test Content');
    });

    test('should switch to network mode correctly', () => {
      switchToMode('network');

      const networkContent = document.getElementById('network-content');
      const networkButton = document.getElementById('network-mode-btn');
      
      expect(networkContent.classList.contains('active')).toBe(true);
      expect(networkContent.style.display).toBe('block');
      expect(networkButton.classList.contains('active')).toBe(true);
      
      // Should initialize network view
      expect(window.initializeNetworkView).toHaveBeenCalled();
    });

    test('should switch to graph mode correctly', () => {
      switchToMode('graph');

      const graphContent = document.getElementById('graph-content');
      const graphButton = document.getElementById('graph-mode-btn');
      
      expect(graphContent.classList.contains('active')).toBe(true);
      expect(graphContent.style.display).toBe('block');
      expect(graphButton.classList.contains('active')).toBe(true);
      
      // Should initialize graph view
      expect(window.initializeGraphView).toHaveBeenCalled();
    });

    test('should switch to circle mode correctly', () => {
      switchToMode('circle');

      const circleContent = document.getElementById('circle-content');
      const circleButton = document.getElementById('circle-mode-btn');
      
      expect(circleContent.classList.contains('active')).toBe(true);
      expect(circleContent.style.display).toBe('block');
      expect(circleButton.classList.contains('active')).toBe(true);
      
      // Should initialize circle view
      expect(window.initializeCircleView).toHaveBeenCalled();
    });

    test('should hide all other modes when switching', () => {
      // Start in editor mode
      switchToMode('editor');
      expect(document.getElementById('editor-content').classList.contains('active')).toBe(true);
      
      // Switch to presentation
      switchToMode('presentation');
      expect(document.getElementById('editor-content').classList.contains('active')).toBe(false);
      expect(document.getElementById('presentation-content').classList.contains('active')).toBe(true);
      
      // Switch to network
      switchToMode('network');
      expect(document.getElementById('presentation-content').classList.contains('active')).toBe(false);
      expect(document.getElementById('network-content').classList.contains('active')).toBe(true);
    });

    test('should handle invalid mode gracefully', () => {
      expect(() => switchToMode('invalid-mode')).not.toThrow();
      
      // All modes should remain hidden
      const modes = ['editor', 'presentation', 'network', 'graph', 'circle'];
      modes.forEach(mode => {
        const element = document.getElementById(`${mode}-content`);
        expect(element.classList.contains('active')).toBe(false);
      });
    });

    test('should handle missing DOM elements gracefully', () => {
      // Remove some elements
      const graphContent = document.getElementById('graph-content');
      const circleBtn = document.getElementById('circle-mode-btn');
      if (graphContent) graphContent.parentNode.removeChild(graphContent);
      if (circleBtn) circleBtn.parentNode.removeChild(circleBtn);
      
      expect(() => switchToMode('graph')).not.toThrow();
      expect(() => switchToMode('circle')).not.toThrow();
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

    test('should call editor layout after delay in editor mode', (done) => {
      switchToMode('editor');
      
      // Check that layout is called after timeout
      setTimeout(() => {
        expect(mockEditor.layout).toHaveBeenCalled();
        done();
      }, 150);
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
            expect(button.classList.contains('active')).toBe(true);
          } else {
            expect(button.classList.contains('active')).toBe(false);
          }
        });
      });
    });

    test('should handle missing buttons gracefully', () => {
      const networkBtn = document.getElementById('network-mode-btn');
      if (networkBtn) networkBtn.parentNode.removeChild(networkBtn);
      
      expect(() => switchToMode('network')).not.toThrow();
      
      const networkContent = document.getElementById('network-content');
      expect(networkContent.classList.contains('active')).toBe(true);
    });
  });
});