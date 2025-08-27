// Mode Switching Functions
// Handles switching between editor, presentation, network, and circle modes

// Global mode state
let currentMode = 'editor';
let presentationEditorContent = '';

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
    
    // Ensure React component is rendered
    const presentationRoot = document.getElementById('presentation-root');
    if (presentationRoot) {
      console.log('[Mode Switching] Rendering React presentation component for presentation mode');
      try {
        ReactDOM.render(React.createElement(window.MarkdownPreziApp), presentationRoot);
        console.log('[Mode Switching] React component rendered successfully');
      } catch (error) {
        console.error('[Mode Switching] Error rendering React component:', error);
      }
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
      showSpeakerNotesPanel(currentContent);
    } else {
      console.warn('[Mode Switching] No content available to sync to presentation');
      showSpeakerNotesPanel('');
    }
  } else if (modeName === 'network') {
    document.body.classList.remove('presentation-mode');
    hideSpeakerNotesPanel();
    
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
    hideSpeakerNotesPanel();
    
    // Initialize circle visualization
    console.log('[Mode Switching] Initializing circle visualization');
    const circleContainer = document.getElementById('circle-visualization');
    if (circleContainer && window.initializeCircleVisualization) {
      window.initializeCircleVisualization();
    }
  } else {
    // Default case (editor mode)
    document.body.classList.remove('presentation-mode');
    hideSpeakerNotesPanel();
    restoreUIElementsAfterPresentation();
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