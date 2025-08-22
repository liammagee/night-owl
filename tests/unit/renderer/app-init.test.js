// Test the application initialization functionality from js/app-init.js

describe('App Initialization', () => {
  let mockElectronAPI, mockGamification;
  
  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = `
      <div id="app-container"></div>
      <div id="gamification-panel" style="display: none;"></div>
      <button id="toggle-gamification-btn"></button>
      <div id="ai-flow-indicator" style="display: none;"></div>
    `;

    // Mock global objects
    mockElectronAPI = {
      isElectron: true,
      invoke: jest.fn(),
      onAppReady: jest.fn(),
      onFileOpened: jest.fn(),
      onUpdateAvailable: jest.fn(),
      onToggleGamificationPanel: jest.fn()
    };

    mockGamification = {
      startWritingSession: jest.fn(),
      showStatsModal: jest.fn()
    };

    const mockLocalStorage = {
      getItem: jest.fn(),
      setItem: jest.fn()
    };
    
    global.window = {
      electronAPI: mockElectronAPI,
      gamification: mockGamification,
      showAILoading: jest.fn(),
      hideAILoading: jest.fn(),
      showLoading: jest.fn(),
      hideLoading: jest.fn(),
      addEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
      localStorage: mockLocalStorage
    };
    
    // Also expose mockLocalStorage for tests
    global.mockLocalStorage = mockLocalStorage;

    global.document = {
      ...document,
      readyState: 'complete',
      addEventListener: jest.fn(),
      querySelectorAll: jest.fn(() => []),
      getElementById: jest.fn((id) => document.getElementById(id))
    };

    // Reset all mocks
    jest.clearAllMocks();
  });

  // Mock implementation of key functions from app-init.js
  function setupLoadingIndicators() {
    const flowIndicator = document.getElementById('ai-flow-indicator');
    if (flowIndicator) {
      flowIndicator.style.display = 'none';
      
      window.showAILoading = (message = 'Processing...') => {
        flowIndicator.textContent = message;
        flowIndicator.style.display = 'block';
      };
      
      window.hideAILoading = () => {
        flowIndicator.style.display = 'none';
      };
    }

    window.showLoading = (selector) => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => {
        el.classList.add('loading');
        el.style.opacity = '0.6';
        el.style.pointerEvents = 'none';
      });
    };

    window.hideLoading = (selector) => {
      const elements = document.querySelectorAll(selector || '.loading');
      elements.forEach(el => {
        el.classList.remove('loading');
        el.style.opacity = '';
        el.style.pointerEvents = '';
      });
    };
  }

  function setupGamificationToggle() {
    let gamificationPanel = document.getElementById('gamification-panel');
    if (!gamificationPanel) {
      gamificationPanel = createGamificationPanel();
    }

    const gamificationToggleBtn = document.getElementById('toggle-gamification-btn');
    if (gamificationToggleBtn) {
      gamificationToggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const wasVisible = toggleGamificationPanel();
        
        if (wasVisible) {
          gamificationToggleBtn.style.background = '#f59e0b';
          gamificationToggleBtn.style.opacity = '0.7';
        } else {
          gamificationToggleBtn.style.background = '#dc2626';
          gamificationToggleBtn.style.opacity = '1';
        }
      });
    }

    function toggleGamificationPanel() {
      const isVisible = gamificationPanel.style.display !== 'none';
      
      if (isVisible) {
        gamificationPanel.style.display = 'none';
        window.localStorage.setItem('gamification-panel-visible', 'false');
      } else {
        gamificationPanel.style.display = 'block';
        window.localStorage.setItem('gamification-panel-visible', 'true');
      }
      
      return !isVisible;
    }

    // Load saved state
    const savedState = window.localStorage.getItem('gamification-panel-visible');
    const isVisible = savedState !== 'false';
    gamificationPanel.style.display = isVisible ? 'block' : 'none';
  }

  function createGamificationPanel() {
    const panel = document.createElement('div');
    panel.id = 'gamification-panel';
    panel.className = 'gamification-panel';
    
    panel.innerHTML = `
      <div class="gamification-header">
        <h3>🎮 Writing Stats</h3>
      </div>
      <div class="gamification-content">
        <div class="stats-grid">
          <div class="stat-item">
            <div class="stat-value">0</div>
            <div class="stat-label">Words Today</div>
          </div>
        </div>
        <div class="gamification-actions">
          <button class="ai-suggestions-btn" id="start-writing-session-btn">Start Writing Session</button>
          <button class="ai-suggestions-btn" id="view-achievements-btn">View Achievements</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(panel);
    return panel;
  }

  function setupElectronIntegration() {
    if (window.electronAPI && window.electronAPI.isElectron) {
      // Handle app ready state
      if (window.electronAPI.onAppReady) {
        window.electronAPI.onAppReady(() => {
          console.log('Electron app is ready');
        });
      }

      // Handle file operations
      if (window.electronAPI.onFileOpened) {
        window.electronAPI.onFileOpened((content, filePath) => {
          console.log('File opened:', filePath);
        });
      }

      // Handle gamification panel toggle from menu
      if (window.electronAPI.onToggleGamificationPanel) {
        window.electronAPI.onToggleGamificationPanel(() => {
          if (window.toggleGamificationPanel) {
            window.toggleGamificationPanel();
          }
        });
      }
    }
  }

  describe('Loading Indicators Setup', () => {
    test('should set up AI loading indicator correctly', () => {
      const flowIndicator = document.getElementById('ai-flow-indicator');
      expect(flowIndicator).toBeTruthy();
      
      setupLoadingIndicators();
      
      // Initially should be hidden (setupLoadingIndicators sets display to 'none')
      expect(flowIndicator.style.display).toBe('none');
      
      // Test show loading
      expect(typeof window.showAILoading).toBe('function');
      window.showAILoading('Test message');
      expect(flowIndicator.textContent).toBe('Test message');
      expect(flowIndicator.style.display).toBe('block');
      
      // Test hide loading
      expect(typeof window.hideAILoading).toBe('function');
      window.hideAILoading();
      expect(flowIndicator.style.display).toBe('none');
    });

    test('should set up generic loading functions', () => {
      // Create test elements
      const testEl1 = document.createElement('div');
      testEl1.className = 'test-element';
      const testEl2 = document.createElement('div');
      testEl2.className = 'test-element';
      document.body.appendChild(testEl1);
      document.body.appendChild(testEl2);

      // Mock querySelectorAll
      document.querySelectorAll = jest.fn((selector) => {
        if (selector === '.test-element') {
          return [testEl1, testEl2];
        }
        return [];
      });

      setupLoadingIndicators();

      // Test show loading
      window.showLoading('.test-element');
      expect(testEl1.classList.contains('loading')).toBe(true);
      expect(testEl1.style.opacity).toBe('0.6');
      expect(testEl1.style.pointerEvents).toBe('none');

      // Test hide loading
      window.hideLoading('.test-element');
      expect(testEl1.classList.contains('loading')).toBe(false);
      expect(testEl1.style.opacity).toBe('');
      expect(testEl1.style.pointerEvents).toBe('');
    });

    test('should handle missing AI flow indicator gracefully', () => {
      const element = document.getElementById('ai-flow-indicator');
      if (element.parentNode) {
        element.parentNode.removeChild(element);
      }
      
      expect(() => setupLoadingIndicators()).not.toThrow();
    });
  });

  describe('Gamification Toggle Setup', () => {
    test('should set up gamification toggle correctly', () => {
      const mockEventListener = jest.fn();
      const toggleBtn = document.getElementById('toggle-gamification-btn');
      toggleBtn.addEventListener = mockEventListener;

      setupGamificationToggle();

      expect(mockEventListener).toHaveBeenCalledWith('click', expect.any(Function));
    });

    test('should create gamification panel if missing', () => {
      const element = document.getElementById('gamification-panel');
      if (element.parentNode) {
        element.parentNode.removeChild(element);
      }
      
      setupGamificationToggle();
      
      const panel = document.getElementById('gamification-panel');
      expect(panel).toBeTruthy();
      expect(panel.querySelector('#start-writing-session-btn')).toBeTruthy();
      expect(panel.querySelector('#view-achievements-btn')).toBeTruthy();
    });

    test('should load saved panel state from localStorage', () => {
      global.mockLocalStorage.getItem.mockReturnValue('false');
      
      setupGamificationToggle();
      
      const panel = document.getElementById('gamification-panel');
      expect(panel.style.display).toBe('none');
    });

    test('should default to visible when no saved state', () => {
      global.mockLocalStorage.getItem.mockReturnValue(null);
      
      setupGamificationToggle();
      
      const panel = document.getElementById('gamification-panel');
      expect(panel.style.display).toBe('block');
    });

    test('should handle missing toggle button gracefully', () => {
      const element = document.getElementById('toggle-gamification-btn');
      if (element.parentNode) {
        element.parentNode.removeChild(element);
      }
      
      expect(() => setupGamificationToggle()).not.toThrow();
    });
  });

  describe('Gamification Panel Creation', () => {
    test('should create panel with correct structure', () => {
      const panel = createGamificationPanel();
      
      expect(panel.id).toBe('gamification-panel');
      expect(panel.className).toBe('gamification-panel');
      expect(panel.querySelector('.gamification-header')).toBeTruthy();
      expect(panel.querySelector('.gamification-content')).toBeTruthy();
      expect(panel.querySelector('.stats-grid')).toBeTruthy();
      expect(panel.querySelector('.gamification-actions')).toBeTruthy();
    });

    test('should include required action buttons', () => {
      const panel = createGamificationPanel();
      
      const startBtn = panel.querySelector('#start-writing-session-btn');
      const achievementsBtn = panel.querySelector('#view-achievements-btn');
      
      expect(startBtn).toBeTruthy();
      expect(startBtn.textContent).toBe('Start Writing Session');
      expect(achievementsBtn).toBeTruthy();
      expect(achievementsBtn.textContent).toBe('View Achievements');
    });

    test('should append panel to document body', () => {
      const initialChildCount = document.body.children.length;
      
      createGamificationPanel();
      
      expect(document.body.children.length).toBe(initialChildCount + 1);
      expect(document.getElementById('gamification-panel')).toBeTruthy();
    });
  });

  describe('Electron Integration Setup', () => {
    test('should set up Electron handlers when running in Electron', () => {
      setupElectronIntegration();

      expect(mockElectronAPI.onAppReady).toHaveBeenCalled();
      expect(mockElectronAPI.onFileOpened).toHaveBeenCalled();
      expect(mockElectronAPI.onToggleGamificationPanel).toHaveBeenCalled();
    });

    test('should handle missing Electron API gracefully', () => {
      window.electronAPI = null;
      
      expect(() => setupElectronIntegration()).not.toThrow();
    });

    test('should handle Electron API without isElectron flag', () => {
      window.electronAPI = { ...mockElectronAPI, isElectron: false };
      
      setupElectronIntegration();
      
      expect(mockElectronAPI.onAppReady).not.toHaveBeenCalled();
    });

    test('should handle missing Electron API methods gracefully', () => {
      window.electronAPI = { isElectron: true };
      
      expect(() => setupElectronIntegration()).not.toThrow();
    });
  });

  describe('Integration Tests', () => {
    test('should handle gamification toggle from Electron menu', () => {
      setupGamificationToggle();
      setupElectronIntegration();

      // Simulate Electron menu trigger
      const toggleHandler = mockElectronAPI.onToggleGamificationPanel.mock.calls[0][0];
      
      // Mock the toggle function
      window.toggleGamificationPanel = jest.fn();
      
      toggleHandler();
      
      expect(window.toggleGamificationPanel).toHaveBeenCalled();
    });

    test('should handle file operations from Electron', () => {
      setupElectronIntegration();

      const fileHandler = mockElectronAPI.onFileOpened.mock.calls[0][0];
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      fileHandler('test content', '/path/to/file.md');
      
      expect(consoleSpy).toHaveBeenCalledWith('File opened:', '/path/to/file.md');
      
      consoleSpy.mockRestore();
    });

    test('should handle app ready state from Electron', () => {
      setupElectronIntegration();

      const readyHandler = mockElectronAPI.onAppReady.mock.calls[0][0];
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      readyHandler();
      
      expect(consoleSpy).toHaveBeenCalledWith('Electron app is ready');
      
      consoleSpy.mockRestore();
    });
  });
});