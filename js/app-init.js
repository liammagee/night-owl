// App Initialization Functions
// Handles application startup, UI setup, and component initialization

function initializeStyleSystem() {
  // Initialize the style system
  console.log('[App Init] Initializing style system');
  
  // Style system initialization would go here
  // This is likely handled by the style-manager.js file already loaded
  if (window.initializeStyles) {
    window.initializeStyles();
  }
  
  // Setup style settings UI
  if (window.setupStyleSettingsUI) {
    window.setupStyleSettingsUI();
  }
  
  console.log('[App Init] Style system initialized');
}

function setupUIInteractions() {
  console.log('[App Init] Setting up UI interactions');
  
  // Handle responsive layout adjustments
  const handleResize = () => {
    // Dispatch a custom event for components that need to know about resizes
    window.dispatchEvent(new CustomEvent('windowResize'));
  };
  
  window.addEventListener('resize', handleResize);
  
  // Handle presentation mode UI adjustments
  const handlePresentationMode = () => {
    const isInPresentationMode = document.body.classList.contains('presentation-mode');
    
    if (isInPresentationMode) {
      // Hide unnecessary UI elements in presentation mode
      console.log('[App Init] Entering presentation mode - adjusting UI');
    } else {
      // Restore UI elements when leaving presentation mode
      console.log('[App Init] Exiting presentation mode - restoring UI');
    }
  };
  
  // Monitor body class changes for presentation mode
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        handlePresentationMode();
      }
    });
  });
  
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ['class']
  });
  
  // Toggle buttons functionality
  const toggleButtons = document.querySelector('#right-pane .toggle-buttons');
  if (toggleButtons) {
    console.log('[App Init] Setting up toggle buttons');
    
    // Handle toggle button active states
    const buttons = toggleButtons.querySelectorAll('.pane-toggle-button');
    buttons.forEach(button => {
      button.addEventListener('click', () => {
        // Remove active from all buttons
        buttons.forEach(btn => btn.classList.remove('active'));
        // Add active to clicked button
        button.classList.add('active');
      });
    });
    
    // Make buttons sticky when scrolling
    let fixed = false;
    
    const handleScroll = () => {
      const rightPane = document.getElementById('right-pane');
      if (!rightPane) return;
      
      const rect = rightPane.getBoundingClientRect();
      if (rect.top <= 0 && !fixed) {
        const parent = toggleButtons.parentElement;
        if (parent) {
          parent.style.position = 'sticky';
          parent.style.top = '0';
          parent.style.zIndex = '100';
        }
        fixed = true;
      } else if (rect.top > 0 && fixed) {
        const parent = toggleButtons.parentElement;
        if (parent) {
          parent.style.position = '';
          parent.style.top = '';
          parent.style.zIndex = '';
        }
        fixed = false;
      }
    };
    
    window.addEventListener('scroll', handleScroll);
  }
  
  console.log('[App Init] UI interactions setup completed');
}

function setupLoadingIndicators() {
  console.log('[App Init] Setting up loading indicators');
  
  // AI flow indicator
  const flowIndicator = document.getElementById('ai-flow-indicator');
  if (flowIndicator) {
    // Hide initially
    flowIndicator.style.display = 'none';
    
    // Function to show loading
    window.showAILoading = (message = 'Processing...') => {
      flowIndicator.textContent = message;
      flowIndicator.style.display = 'block';
    };
    
    // Function to hide loading
    window.hideAILoading = () => {
      flowIndicator.style.display = 'none';
    };
  }
  
  // Generic loading state management
  const loadingSelectors = [
    '.loading',
    '.processing',
    '.spinner'
  ];
  
  // Function to show loading state
  window.showLoading = (selector) => {
    const elements = document.querySelectorAll(selector);
    elements.forEach(el => {
      el.classList.add('loading');
      el.style.opacity = '0.6';
      el.style.pointerEvents = 'none';
    });
  };
  
  // Function to hide loading state
  window.hideLoading = (selector) => {
    const elements = document.querySelectorAll(selector || '.loading');
    elements.forEach(el => {
      el.classList.remove('loading');
      el.style.opacity = '';
      el.style.pointerEvents = '';
    });
  };
  
  console.log('[App Init] Loading indicators setup completed');
}

function setupKeyboardShortcuts() {
  console.log('[App Init] Setting up keyboard shortcuts');
  
  document.addEventListener('keydown', (e) => {
    // Only handle shortcuts when not in an input field
    const isInputFocused = e.target.tagName === 'INPUT' || 
                          e.target.tagName === 'TEXTAREA' || 
                          e.target.isContentEditable;
    
    if (isInputFocused) return;
    
    // Handle different key combinations
    if (e.ctrlKey || e.metaKey) {
      switch (e.key) {
        case 's':
          e.preventDefault();
          // Trigger save
          if (window.electronAPI) {
            window.electronAPI.invoke('perform-save', getCurrentEditorContent());
          }
          break;
          
        case 'n':
          e.preventDefault();
          // New file
          if (window.electronAPI) {
            window.electronAPI.invoke('trigger-new-file');
          }
          break;
          
        case 'o':
          e.preventDefault();
          // Open file
          if (window.electronAPI) {
            // This would trigger the file open dialog
          }
          break;
      }
    }
    
    // Mode switching shortcuts
    if (e.altKey) {
      switch (e.key) {
        case '1':
          e.preventDefault();
          switchToMode('editor');
          break;
        case '2':
          e.preventDefault();
          switchToMode('presentation');
          break;
        case '3':
          e.preventDefault();
          switchToMode('network');
          break;
        case '4':
          e.preventDefault();
          switchToMode('graph');
          break;
        case '5':
          e.preventDefault();
          switchToMode('circle');
          break;
      }
    }
    
    // Presentation mode shortcuts
    if (document.body.classList.contains('presentation-mode')) {
      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          switchToMode('editor');
          break;
      }
    }
  });
  
  console.log('[App Init] Keyboard shortcuts setup completed');
}


function setupGamificationToggle() {
  console.log('[App Init] Setting up gamification toggle');
  
  // Create or find the gamification panel
  let gamificationPanel = document.getElementById('gamification-panel');
  if (!gamificationPanel) {
    gamificationPanel = createGamificationPanel();
  }
  
  // Add click handler to the dedicated gamification toggle button
  const gamificationToggleBtn = document.getElementById('toggle-gamification-btn');
  if (gamificationToggleBtn) {
    gamificationToggleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const wasVisible = toggleGamificationPanel();
      
      // Update button visual state
      if (wasVisible) {
        gamificationToggleBtn.style.background = '#f59e0b'; // Orange - inactive
        gamificationToggleBtn.style.opacity = '0.7';
      } else {
        gamificationToggleBtn.style.background = '#dc2626'; // Red - active
        gamificationToggleBtn.style.opacity = '1';
      }
      
      console.log('[App Init] Gamification panel toggled via dedicated button');
    });
  } else {
    console.warn('[App Init] Gamification toggle button not found');
  }
  
  // Global toggle function
  window.toggleGamificationPanel = toggleGamificationPanel;
  
  function toggleGamificationPanel() {
    const isVisible = gamificationPanel.style.display !== 'none';
    
    if (isVisible) {
      gamificationPanel.style.display = 'none';
      localStorage.setItem('gamification-panel-visible', 'false');
    } else {
      gamificationPanel.style.display = 'block';
      localStorage.setItem('gamification-panel-visible', 'true');
    }
    
    console.log('[App Init] Gamification panel toggled:', !isVisible);
    return !isVisible;
  }
  
  // Load saved state and set initial button appearance
  const savedState = localStorage.getItem('gamification-panel-visible');
  const isVisible = savedState !== 'false'; // Default to visible
  
  gamificationPanel.style.display = isVisible ? 'block' : 'none';
  
  // Set initial button state
  if (gamificationToggleBtn) {
    if (isVisible) {
      gamificationToggleBtn.style.background = '#dc2626'; // Red - active
      gamificationToggleBtn.style.opacity = '1';
    } else {
      gamificationToggleBtn.style.background = '#f59e0b'; // Orange - inactive
      gamificationToggleBtn.style.opacity = '0.7';
    }
  }
  
  console.log('[App Init] Gamification toggle setup completed');
}

function createGamificationPanel() {
  console.log('[App Init] Creating gamification panel');
  
  const panel = document.createElement('div');
  panel.id = 'gamification-panel';
  panel.className = 'gamification-panel';
  
  panel.innerHTML = `
    <div class="gamification-header">
      <h3>🎮 Writing Stats</h3>
      <button class="gamification-toggle" onclick="window.toggleGamificationPanel?.()">−</button>
    </div>
    <div class="gamification-content">
      <div class="stats-grid">
        <div class="stat-item" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
          <div class="stat-value">0</div>
          <div class="stat-label">Words Today</div>
        </div>
        <div class="stat-item" style="background: linear-gradient(135deg, #ff6b35 0%, #f7931e 100%);">
          <div class="stat-value">0</div>
          <div class="stat-label">Current Streak</div>
        </div>
        <div class="stat-item" style="background: linear-gradient(135deg, #3498db 0%, #2980b9 100%);">
          <div class="stat-value">0</div>
          <div class="stat-label">Sessions</div>
        </div>
        <div class="stat-item" style="background: linear-gradient(135deg, #f39c12 0%, #e67e22 100%);">
          <div class="stat-value">0</div>
          <div class="stat-label">Total Points</div>
        </div>
      </div>
      <div class="gamification-actions">
        <button class="ai-suggestions-btn">Start Writing Session</button>
        <button class="ai-suggestions-btn">View Achievements</button>
      </div>
    </div>
  `;
  
  // Insert the panel into the body
  document.body.appendChild(panel);
  console.log('[App Init] Gamification panel created and added to DOM');
  
  return panel;
}

function setupElectronIntegration() {
  console.log('[App Init] Setting up Electron integration');
  
  if (window.electronAPI && window.electronAPI.isElectron) {
    console.log('[App Init] Running in Electron environment');
    
    // Set up app-specific Electron handlers
    const invokeAshBtn = document.getElementById('invoke-ash-btn');
    if (invokeAshBtn) {
      invokeAshBtn.addEventListener('click', () => {
        // Trigger Ash AI assistant
        console.log('[App Init] Ash AI assistant invoked');
        // This would be handled by the main Electron process
      });
    }
    
    // Handle app ready state
    window.electronAPI.onAppReady?.(() => {
      console.log('[App Init] Electron app is ready');
    });
    
    // Handle file operations
    window.electronAPI.onFileOpened?.((content, filePath) => {
      console.log('[App Init] File opened:', filePath);
      setEditorContent(content);
    });
    
    // Handle app updates
    window.electronAPI.onUpdateAvailable?.((info) => {
      console.log('[App Init] Update available:', info);
      // Show update notification
    });
    
    // Handle gamification panel toggle from menu
    if (window.electronAPI.onToggleGamificationPanel) {
      window.electronAPI.onToggleGamificationPanel(() => {
        console.log('[App Init] Toggle gamification panel from menu');
        if (window.toggleGamificationPanel) {
          window.toggleGamificationPanel();
        } else {
          console.warn('[App Init] toggleGamificationPanel function not available');
        }
      });
    }
    
    console.log('[App Init] Electron integration setup completed');
  } else {
    console.log('[App Init] Running in web browser environment');
  }
}

function initializeApp() {
  console.log('[App Init] Starting application initialization');
  
  try {
    // Initialize all subsystems
    initializeStyleSystem();
    setupUIInteractions();
    setupLoadingIndicators();
    setupKeyboardShortcuts();
    setupElectronIntegration();
    
    // Initialize modular components
    if (window.setupModeSwitching) {
      setupModeSwitching();
    }
    
    if (window.setupEditorFormatting) {
      setupEditorFormatting();
    }
    
    if (window.setupSpeakerNotesResize) {
      setupSpeakerNotesResize();
    }
    
    // Setup gamification toggle
    setupGamificationToggle();
    
    // Initialize gamification system
    if (window.initializeGamification) {
      console.log('[App Init] Initializing gamification system');
      try {
        window.initializeGamification();
        console.log('[App Init] Gamification system initialized successfully');
      } catch (error) {
        console.error('[App Init] Error initializing gamification system:', error);
      }
    } else {
      console.warn('[App Init] window.initializeGamification not available');
    }
    
    // Initialize default mode
    switchToMode('editor');
    
    console.log('[App Init] Application initialization completed successfully');
    
    // Dispatch app ready event
    window.dispatchEvent(new CustomEvent('appReady'));
    
  } catch (error) {
    console.error('[App Init] Error during application initialization:', error);
  }
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}

// Export functions to global scope for backward compatibility
window.initializeApp = initializeApp;
window.initializeStyleSystem = initializeStyleSystem;
window.setupUIInteractions = setupUIInteractions;
window.setupLoadingIndicators = setupLoadingIndicators;
window.setupKeyboardShortcuts = setupKeyboardShortcuts;
window.setupElectronIntegration = setupElectronIntegration;
window.setupGamificationToggle = setupGamificationToggle;
window.createGamificationPanel = createGamificationPanel;
// window.toggleGamificationPanel is exported within setupGamificationToggle