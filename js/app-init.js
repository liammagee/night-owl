// App Initialization Functions
// Handles application startup, UI setup, and component initialization

function initializeStyleSystem() {
  if (window.initializeStyles) {
    window.initializeStyles();
  }
  if (window.setupStyleSettingsUI) {
    window.setupStyleSettingsUI();
  }
}

function setupUIInteractions() {
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
    } else {
      // Restore UI elements when leaving presentation mode
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
}

function setupLoadingIndicators() {
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
  
}

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Only handle shortcuts when not in an input field
    const isInputFocused = e.target.tagName === 'INPUT' || 
                          e.target.tagName === 'TEXTAREA' || 
                          e.target.isContentEditable;
    
    if (isInputFocused) return;
    
    // Handle different key combinations
    if (e.ctrlKey || e.metaKey) {
      switch (e.key) {
        case '1':
          e.preventDefault();
          switchToMode('editor');
          return;
        case '2':
          e.preventDefault();
          switchToMode('presentation');
          return;
        case '3':
          e.preventDefault();
          switchToMode('network');
          return;
        case '4':
          e.preventDefault();
          switchToMode('circle');
          return;
        case '5':
          e.preventDefault();
          switchToMode('library');
          return;
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
          switchToMode('circle');
          break;
        case '5':
          e.preventDefault();
          switchToMode('library');
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
}

function updateGamificationToggleButton(toggleBtn, isVisible) {
  if (!toggleBtn) return;

  toggleBtn.classList.remove('toggle-off');
  toggleBtn.classList.remove('btn-primary', 'btn-warning', 'btn-error', 'btn-success');

  if (isVisible) {
    toggleBtn.classList.add('btn-warning');
    toggleBtn.setAttribute('aria-pressed', 'true');
  } else {
    toggleBtn.classList.add('toggle-off');
    toggleBtn.setAttribute('aria-pressed', 'false');
  }

  // Clear any legacy inline styles
  toggleBtn.style.background = '';
  toggleBtn.style.color = '';
  toggleBtn.style.opacity = '';
}

function setupGamificationToggleIntegration() {
  const setupToggleHandler = () => {
    const gamificationToggleBtn = document.getElementById('toggle-gamification-btn');
    if (gamificationToggleBtn) {
      gamificationToggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (window.writingGamification && window.writingGamification.toggleMenuVisibility) {
          const newVisibility = window.writingGamification.toggleMenuVisibility();
          updateGamificationToggleButton(document.getElementById('toggle-gamification-btn'), newVisibility);
        } else if (window.gamificationInstance && window.gamificationInstance.toggleMenuVisibility) {
          const newVisibility = window.gamificationInstance.toggleMenuVisibility();
          updateGamificationToggleButton(document.getElementById('toggle-gamification-btn'), newVisibility);
        } else {
          const gamificationMenu = document.getElementById('gamification-menu') || document.querySelector('.gamification-menu');
          if (gamificationMenu) {
            const isVisible = gamificationMenu.style.display !== 'none';
            gamificationMenu.style.display = isVisible ? 'none' : 'block';
            updateGamificationToggleButton(document.getElementById('toggle-gamification-btn'), !isVisible);
            localStorage.setItem('gamification-menu-visible', !isVisible);
          } else {
            console.error('[App Init] No gamification menu found to toggle');
          }
        }
      });
    } else {
      setTimeout(setupToggleHandler, 200);
    }
  };

  setupToggleHandler();
}

function setupGamificationToggle() {
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
      
      const isVisible = toggleGamificationPanel();
      updateGamificationToggleButton(gamificationToggleBtn, isVisible);
    });
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
    
    return !isVisible;
  }
  
  // Load saved state and set initial button appearance
  const savedState = localStorage.getItem('gamification-panel-visible');
  const isVisible = savedState !== 'false'; // Default to visible
  
  gamificationPanel.style.display = isVisible ? 'block' : 'none';
  
  // Set initial button state
  updateGamificationToggleButton(gamificationToggleBtn, isVisible);
}

function createGamificationPanel() {
  const panel = document.createElement('div');
  panel.id = 'gamification-panel';
  panel.className = 'gamification-panel';
  
  panel.innerHTML = `
    <div class="gamification-header">
      <h3>📚 Library Ledger</h3>
      <button class="gamification-toggle" onclick="window.toggleGamificationPanel?.()">−</button>
    </div>
    <div class="gamification-content">
      <div class="stats-grid">
        <div class="stat-item" style="background: linear-gradient(135deg, rgba(99,102,241,0.25) 0%, rgba(14,165,233,0.2) 100%); border: 1px solid rgba(99,102,241,0.35);">
          <div class="stat-value">0</div>
          <div class="stat-label">Manuscripts Today</div>
        </div>
        <div class="stat-item" style="background: linear-gradient(135deg, rgba(249,115,22,0.25) 0%, rgba(217,70,239,0.18) 100%); border: 1px solid rgba(249,115,22,0.35);">
          <div class="stat-value">0</div>
          <div class="stat-label">Candles Lit (Streak)</div>
        </div>
        <div class="stat-item" style="background: linear-gradient(135deg, rgba(56,189,248,0.22) 0%, rgba(34,197,94,0.18) 100%); border: 1px solid rgba(56,189,248,0.3);">
          <div class="stat-value">0</div>
          <div class="stat-label">Focus Rituals</div>
        </div>
        <div class="stat-item" style="background: linear-gradient(135deg, rgba(139,92,246,0.25) 0%, rgba(14,165,233,0.2) 100%); border: 1px solid rgba(139,92,246,0.35);">
          <div class="stat-value">0</div>
          <div class="stat-label">Catalogue Sigils</div>
        </div>
      </div>
      <div class="gamification-actions">
        <button class="ai-suggestions-btn" id="start-writing-session-btn">Begin Focus Ritual</button>
        <button class="ai-suggestions-btn" id="view-achievements-btn">Browse Lore Fragments</button>
      </div>
    </div>
  `;
  
  // Insert the panel into the body
  document.body.appendChild(panel);
  
  // Add event handlers for the action buttons
  const startSessionBtn = panel.querySelector('#start-writing-session-btn');
  const viewAchievementsBtn = panel.querySelector('#view-achievements-btn');
  
  if (startSessionBtn) {
    startSessionBtn.addEventListener('click', () => {
      if (window.gamification && window.gamification.startWritingSession) {
        window.gamification.startWritingSession();
      } else {
        alert('🕯 Focus ritual initiated. Guard this candle of attention.');
      }
    });
  }

  if (viewAchievementsBtn) {
    viewAchievementsBtn.addEventListener('click', () => {
      if (window.gamification && window.gamification.showStatsModal) {
        window.gamification.showStatsModal();
      } else {
        showSimpleAchievements();
      }
    });
  }
  
  return panel;
}

function showSimpleAchievements() {
  // Simple achievements display as fallback
  const achievements = JSON.parse(localStorage.getItem('gamification_achievements') || '{}');
  const achievementCount = Object.keys(achievements).length;
  
  if (achievementCount === 0) {
    alert('📜 Lore Fragments\n\nNo fragments have manifested yet. Continue inscribing manuscripts to awaken them.\n\nPossible fragments:\n• Compose your first 500 words\n• Sustain a 3-night candle vigil\n• Complete a 30-minute immersion');
  } else {
    const recentAchievements = Object.values(achievements)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 5);
    
    const achievementText = recentAchievements
      .map(a => `🏆 ${a.title}\n   ${a.description}`)
      .join('\n\n');
    
    alert(`📜 Lore Fragments (${achievementCount} awakened)\n\nRecent fragments:\n\n${achievementText}`);
  }
}

function setupElectronIntegration() {
  if (window.electronAPI && window.electronAPI.isElectron) {
    const invokeAshBtn = document.getElementById('invoke-ash-btn');
    if (invokeAshBtn) {
      invokeAshBtn.addEventListener('click', () => {
        // Handled by the main Electron process
      });
    }
    
    // Handle app ready state
    window.electronAPI.onAppReady?.(() => {});
    
    // Handle file operations
    window.electronAPI.onFileOpened?.((content, filePath) => {
      setEditorContent(content);
    });
    
    // Handle app updates
    window.electronAPI.onUpdateAvailable?.((info) => {
      // Show update notification
    });
    
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

function initializeApp() {
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
    
    // Setup gamification toggle - Integration with gamification.js system
    setupGamificationToggleIntegration();
    
    // Initialize gamification system from gamification.js with retry logic
    let gamificationRetries = 0;
    const MAX_GAMIFICATION_RETRIES = 50; // 5 seconds max
    const initGamification = () => {
      if (window.initializeGamification) {
        try {
          window.initializeGamification();
        } catch (error) {
          console.error('[App Init] Error initializing gamification system:', error);
        }
      } else if (gamificationRetries < MAX_GAMIFICATION_RETRIES) {
        gamificationRetries++;
        setTimeout(initGamification, 100);
      }
    };

    // Start gamification initialization (with retry logic for deferred scripts)
    initGamification();
    
    // Initialize default mode
    switchToMode('editor');

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
