// Mode Switching Functions
// Handles switching between editor, presentation, network, circle, and library modes

// Global mode state
let currentMode = 'editor';
let presentationEditorContent = '';
let presentationLoadNonce = 0;

function ensureTechnePresentationsReady(timeoutMs = 8000) {
  const isReady = () =>
    Boolean(window.MarkdownPreziApp) &&
    typeof window.showSpeakerNotesPanel === 'function' &&
    typeof window.hideSpeakerNotesPanel === 'function';

  if (isReady()) return Promise.resolve(true);

  const startPluginsBestEffort = async () => {
    if (!window.TechnePlugins?.start) return;
    try {
      await window.TechnePlugins.start({
        appId: 'nightowl',
        enabled: window.appSettings?.plugins?.enabled || null,
        settings: window.appSettings?.plugins || null
      });
    } catch (error) {
      console.warn('[Mode Switching] Failed to start TechnePlugins:', error);
    }
  };

  return new Promise((resolve) => {
    let finished = false;
    let unsubscribe = null;

    const finish = (ok) => {
      if (finished) return;
      finished = true;
      if (unsubscribe) unsubscribe();
      clearInterval(intervalId);
      clearTimeout(timeoutId);
      resolve(ok);
    };

    const check = () => {
      if (isReady()) finish(true);
    };

    if (window.TechnePlugins?.on) {
      unsubscribe = window.TechnePlugins.on('presentations:ready', () => check());
    }

    const intervalId = setInterval(check, 50);
    const timeoutId = setTimeout(() => finish(isReady()), timeoutMs);

    startPluginsBestEffort();
    check();
  });
}

function jumpToSlideInEditor(slideIndex) {
  console.log('[Mode Switching] Jumping to slide', slideIndex, 'in editor');
  
  if (!window.editor || !window.goToLine) {
    console.warn('[Mode Switching] Editor or goToLine function not available');
    return;
  }
  
  try {
    // Get the current editor content
    const content = window.editor.getValue();
    if (!content) {
      console.warn('[Mode Switching] No content available in editor');
      return;
    }
    
    // Split content by slide separators (--- on standalone lines)
    // Match --- that is either at start/end of string or surrounded by newlines
    // but NOT part of a table (which would have | characters on the same line)
    const slideSeparatorRegex = /(?:^|\n)---(?:\n|$)/;
    const slides = content.split(slideSeparatorRegex).filter(s => s.trim());
    
    if (slideIndex >= slides.length) {
      console.warn('[Mode Switching] Slide index', slideIndex, 'exceeds available slides', slides.length);
      return;
    }
    
    // Calculate line number by counting lines before the target slide
    let lineNumber = 1;
    for (let i = 0; i < slideIndex; i++) {
      // Count lines in this slide plus the separator line
      const slideLines = slides[i].split('\n').length;
      lineNumber += slideLines;
      if (i > 0) lineNumber += 1; // Add separator line (--- takes 1 line)
    }
    
    // Add a few lines to account for any extra whitespace after separators
    if (slideIndex > 0) {
      lineNumber += 1;
    }
    
    console.log('[Mode Switching] Calculated line number:', lineNumber, 'for slide', slideIndex);
    
    // Jump to the calculated line
    window.goToLine(lineNumber);
    
  } catch (error) {
    console.error('[Mode Switching] Error jumping to slide in editor:', error);
  }
}

function calculateSlideFromCursor() {
  console.log('[Mode Switching] Calculating slide from cursor position');
  
  if (!window.editor) {
    console.warn('[Mode Switching] Editor not available');
    return 0;
  }
  
  try {
    // Get current cursor position
    const position = window.editor.getPosition();
    if (!position) {
      console.warn('[Mode Switching] Could not get cursor position');
      return 0;
    }
    
    const currentLine = position.lineNumber;
    console.log('[Mode Switching] Current cursor line:', currentLine);
    
    // Get the current editor content
    const content = window.editor.getValue();
    if (!content) {
      console.warn('[Mode Switching] No content available in editor');
      return 0;
    }
    
    // Split content by slide separators (--- on standalone lines)
    // Match --- that is either at start/end of string or surrounded by newlines
    // but NOT part of a table (which would have | characters on the same line)
    const slideSeparatorRegex = /(?:^|\n)---(?:\n|$)/;
    const slides = content.split(slideSeparatorRegex).filter(s => s.trim());
    console.log('[Mode Switching] Found', slides.length, 'slides');
    
    // Calculate which slide the cursor is in by counting lines
    let accumulatedLines = 0;
    
    for (let i = 0; i < slides.length; i++) {
      const slideLines = slides[i].split('\n').length;
      
      // Add separator line count (except for first slide)
      if (i > 0) {
        accumulatedLines += 1; // separator line
      }
      
      // Check if current line falls within this slide
      const slideStart = accumulatedLines + 1;
      const slideEnd = accumulatedLines + slideLines;
      
      console.log('[Mode Switching] Slide', i, 'lines:', slideStart, 'to', slideEnd);
      
      if (currentLine >= slideStart && currentLine <= slideEnd) {
        console.log('[Mode Switching] Cursor is in slide', i);
        return i;
      }
      
      accumulatedLines += slideLines;
    }
    
    // If we didn't find a match, assume last slide
    const lastSlide = Math.max(0, slides.length - 1);
    console.log('[Mode Switching] Cursor beyond all slides, using last slide:', lastSlide);
    return lastSlide;
    
  } catch (error) {
    console.error('[Mode Switching] Error calculating slide from cursor:', error);
    return 0;
  }
}

function restoreUIElementsAfterPresentation() {
  console.log('[Mode Switching] Restoring UI elements after presentation mode');
  
  // Force refresh of pane visibility and layout
  if (window.refreshPaneVisibility) {
    window.refreshPaneVisibility();
  }
  
  // Reset any inline styles that might have been applied
  const elementsToReset = [
    '#left-sidebar', '#sidebar-resizer', '#editor-container', '#mode-switcher', 
    '#editor-toolbar', '#right-pane', '#main-content'
  ];
  
  elementsToReset.forEach(selector => {
    const element = document.querySelector(selector);
    if (element) {
      // Remove any inline display styles that might override CSS
      element.style.removeProperty('display');
      element.style.removeProperty('width');
      element.style.removeProperty('height');
      element.style.removeProperty('flex');
    }
  });
  
  // Trigger a layout refresh
  setTimeout(() => {
    if (window.refreshEditorLayout) {
      window.refreshEditorLayout();
    }
    
    // Ensure editor is visible and focused
    const editorContainer = document.getElementById('editor-container');
    if (editorContainer) {
      editorContainer.style.display = '';
    }
    
    console.log('[Mode Switching] UI restoration completed');
  }, 100);
}

function switchToMode(modeName) {
  console.log('[Mode Switching] Switching to:', modeName);

  // Cancel any in-flight presentation load when leaving presentation mode
  if (modeName !== 'presentation') {
    presentationLoadNonce += 1;
  }
  
  // Hide all content views
  const contentViews = document.querySelectorAll('.content-view');
  console.log('[Mode Switching] Found content views:', contentViews.length);
  contentViews.forEach(view => {
    console.log('[Mode Switching] Removing active from:', view.id);
    view.classList.remove('active');
  });

  // Show selected content view
  const targetView = document.getElementById(`${modeName}-content`);
  console.log('[Mode Switching] Target view:', targetView);
  if (targetView) {
    targetView.classList.add('active');
    console.log('[Mode Switching] Added active class to:', modeName + '-content');
    console.log('[Mode Switching] Target view classes:', targetView.className);
  } else {
    console.error('[Mode Switching] Could not find target view:', modeName + '-content');
  }

  // Update mode buttons
  const modeButtons = document.querySelectorAll('.mode-btn');
  modeButtons.forEach(btn => btn.classList.remove('active'));
  
  const targetButton = document.getElementById(`${modeName}-mode-btn`);
  if (targetButton) {
    targetButton.classList.add('active');
  }

  // Handle mode-specific logic
  if (modeName === 'presentation') {
    document.body.classList.add('presentation-mode');
    
    // Calculate which slide to jump to based on cursor position if coming from editor
    let targetSlide = 0;
    if (currentMode === 'editor') {
      targetSlide = calculateSlideFromCursor();
      console.log('[Mode Switching] Calculated target slide from cursor:', targetSlide);
      console.log('[Mode Switching] Current mode was:', currentMode, ', switching to presentation with target slide:', targetSlide);
    }
    
    // Store target slide for React component to pick up
    if (targetSlide > 0) {
      window.targetPresentationSlide = targetSlide;
      console.log('[Mode Switching] Set window.targetPresentationSlide to:', targetSlide);
    }
    
    // Ensure React component is rendered
    const presentationRoot = document.getElementById('presentation-root');
    if (presentationRoot) {
      const nonce = ++presentationLoadNonce;
      presentationRoot.innerHTML = '<div style="padding: 16px; opacity: 0.8;">Loading presentation…</div>';

      (async () => {
        const ok = await ensureTechnePresentationsReady();
        if (nonce !== presentationLoadNonce) return;

        if (!ok) {
          presentationRoot.innerHTML =
            '<div style="padding: 16px; color: #b91c1c; font-weight: 700;">Presentation plugin not ready. Please try again.</div>';
          return;
        }

        if (!window.ReactDOM?.render || !window.React?.createElement || !window.MarkdownPreziApp) {
          presentationRoot.innerHTML =
            '<div style="padding: 16px; color: #b91c1c; font-weight: 700;">Presentation runtime missing (React globals).</div>';
          return;
        }

        console.log('[Mode Switching] Rendering React presentation component for presentation mode');
        try {
          window.ReactDOM.render(window.React.createElement(window.MarkdownPreziApp), presentationRoot);
          console.log('[Mode Switching] React component rendered successfully');
        } catch (error) {
          console.error('[Mode Switching] Error rendering React component:', error);
        }
      })();
    }
    
    // Always get the latest content from the editor when switching to presentation mode
    console.log('[Mode Switching] Getting fresh content from editor for presentation mode');
    let currentContent = '';
    
    // Priority 1: Try getCurrentEditorContent function (from renderer.js)
    if (typeof getCurrentEditorContent === 'function') {
      try {
        currentContent = getCurrentEditorContent();
        console.log('[Mode Switching] Retrieved fresh content from getCurrentEditorContent(), length:', currentContent.length);
      } catch (error) {
        console.warn('[Mode Switching] Error calling getCurrentEditorContent():', error);
      }
    }
    
    // Priority 2: Try getting content directly from editor global variable
    if (!currentContent && window.editor && window.editor.getValue) {
      try {
        currentContent = window.editor.getValue();
        console.log('[Mode Switching] Retrieved fresh content from window.editor, length:', currentContent.length);
      } catch (error) {
        console.warn('[Mode Switching] Error getting content from window.editor:', error);
      }
    }
    
    // Fallback: Use stored content if available
    if (!currentContent && window.pendingPresentationContent) {
      currentContent = window.pendingPresentationContent;
      console.log('[Mode Switching] No editor content available, using pending presentation content, length:', currentContent.length);
    }
    
    // Fallback 2: Use stored content as last resort
    if (!currentContent && presentationEditorContent) {
      currentContent = presentationEditorContent;
      console.log('[Mode Switching] Using last resort stored presentation content, length:', currentContent.length);
    }
    
    // Sync the content to presentation
    if (currentContent) {
      console.log('[Mode Switching] Syncing fresh content to presentation');
      
      // Always try both methods to ensure content gets to the React component
      if (window.syncContentToPresentation) {
        window.syncContentToPresentation(currentContent);
      }
      
      // Also dispatch the event directly
      console.log('[Mode Switching] Dispatching content update event directly');
      const contentUpdateEvent = new CustomEvent('updatePresentationContent', {
        detail: { content: currentContent }
      });
      window.dispatchEvent(contentUpdateEvent);
      
      // Also set it directly for immediate access
      window.pendingPresentationContent = currentContent;
      
      // Show speaker notes panel and populate with notes
      if (typeof window.showSpeakerNotesPanel === 'function') {
        window.showSpeakerNotesPanel(currentContent);
      }
    } else {
      console.warn('[Mode Switching] No content available to sync to presentation');
      if (typeof window.showSpeakerNotesPanel === 'function') {
        window.showSpeakerNotesPanel('');
      }
    }
  } else if (modeName === 'network') {
    document.body.classList.remove('presentation-mode');
    window.hideSpeakerNotesPanel?.();
    
    // Initialize unified network visualization
    console.log('[Mode Switching] Initializing unified network visualization');
    if (window.UnifiedNetworkVisualization) {
      const networkContainer = document.getElementById('network-content');
      if (networkContainer && !window.unifiedNetworkInstance) {
        window.unifiedNetworkInstance = new window.UnifiedNetworkVisualization();
        window.unifiedNetworkInstance.initialize(networkContainer);
      } else if (window.unifiedNetworkInstance) {
        // Just refresh if already exists
        window.unifiedNetworkInstance.refresh();
      }
    }
  } else if (modeName === 'circle') {
    document.body.classList.remove('presentation-mode');
    window.hideSpeakerNotesPanel?.();
    
    // Initialize circle visualization
    console.log('[Mode Switching] Initializing circle visualization');
    const circleContainer = document.getElementById('circle-visualization');
    if (circleContainer && window.initializeCircleVisualization) {
      window.initializeCircleVisualization();
    }
  } else if (modeName === 'library') {
    document.body.classList.remove('presentation-mode');
    window.hideSpeakerNotesPanel?.();
    const explorer =
      (window.gamificationInstance && window.gamificationInstance.explorerView) ||
      (window.gamificationManager && window.gamificationManager.explorerView) ||
      null;
    if (explorer && typeof explorer.ensureContainer === 'function') {
      const container = explorer.ensureContainer();
      if (container && typeof explorer.renderMaze === 'function') {
        try {
          const world =
            explorer.currentWorldState &&
            Object.keys(explorer.currentWorldState).length
              ? explorer.currentWorldState
              : explorer.gamification?.worldEngine?.getWorldState?.() || {};
          explorer.renderMaze(world);
        } catch (error) {
          console.warn('[Mode Switching] Failed to render maze on library mode switch:', error);
        }
      }
    }
  } else {
    // Default case (editor mode)
    document.body.classList.remove('presentation-mode');
    window.hideSpeakerNotesPanel?.();
    restoreUIElementsAfterPresentation();
    
    // Jump to current slide position in editor if coming from presentation
    if (currentMode === 'presentation' && typeof window.currentPresentationSlide === 'number') {
      jumpToSlideInEditor(window.currentPresentationSlide);
    }
  }

  // Update current mode
  currentMode = modeName;
  console.log('[Mode Switching] Mode switched to:', currentMode);
}

function setupModeSwitching() {
  console.log('[Mode Switching] Setting up mode switching');
  
  // Mode switching buttons
  const editorModeBtn = document.getElementById('editor-mode-btn');
  const presentationModeBtn = document.getElementById('presentation-mode-btn');
  const networkModeBtn = document.getElementById('network-mode-btn');
  const libraryModeBtn = document.getElementById('library-mode-btn');
  
  if (editorModeBtn) {
    editorModeBtn.addEventListener('click', () => {
      console.log('[Mode Switching] Editor mode button clicked');
      switchToMode('editor');
    });
  }

  if (presentationModeBtn) {
    presentationModeBtn.addEventListener('click', () => {
      console.log('[Mode Switching] Presentation mode button clicked');
      switchToMode('presentation');
    });
  }

  if (networkModeBtn) {
    networkModeBtn.addEventListener('click', () => {
      console.log('[Mode Switching] Network mode button clicked');
      switchToMode('network');
    });
  }

  const circleModeBtn = document.getElementById('circle-mode-btn');
  if (circleModeBtn) {
    circleModeBtn.addEventListener('click', () => {
      console.log('[Mode Switching] Circle mode button clicked');
      switchToMode('circle');
    });
  }

  if (libraryModeBtn) {
    libraryModeBtn.addEventListener('click', () => {
      console.log('[Mode Switching] Library mode button clicked');
      switchToMode('library');
    });
  }

  // Speaker notes panel toggle
  const toggleButton = document.getElementById('toggle-speaker-notes-panel');
  if (toggleButton) {
    toggleButton.addEventListener('click', () => {
      const panel = document.getElementById('speaker-notes-panel');
      if (panel) {
        const isVisible = panel.style.display !== 'none';
        panel.style.display = isVisible ? 'none' : 'block';
        toggleButton.textContent = isVisible ? 'Show' : 'Hide';
        
        // Remember the user's preference
        if (!isVisible) {
          localStorage.removeItem('speakerNotesAutoHidden');
        } else {
          localStorage.setItem('speakerNotesAutoHidden', 'true');
        }
      }
    });
  }

  // Sync content to presentation when switching
  const presentationRoot = document.getElementById('presentation-root');
  if (presentationRoot) {
    // Function to sync current editor content to presentation
    window.syncContentToPresentation = (content) => {
      console.log('[Mode Switching] Syncing content to presentation, length:', content ? content.length : 0);
      
      if (content) {
        // Store content for React component
        window.pendingPresentationContent = content;
        
        // Dispatch custom event for React component to pick up
        const contentUpdateEvent = new CustomEvent('updatePresentationContent', {
          detail: { content: content }
        });
        window.dispatchEvent(contentUpdateEvent);
        
        console.log('[Mode Switching] Content synced and event dispatched');
      }
    };
  }

  // Custom window controls removed - using native titlebar

  console.log('[Mode Switching] Mode switching setup completed');
}

// Export functions to global scope for backward compatibility
window.switchToMode = switchToMode;
window.setupModeSwitching = setupModeSwitching;
window.restoreUIElementsAfterPresentation = restoreUIElementsAfterPresentation;
window.currentMode = currentMode;
window.presentationEditorContent = presentationEditorContent;
