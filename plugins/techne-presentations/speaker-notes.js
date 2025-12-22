// Speaker Notes Functions
// Handles speaker notes extraction, display, and panel management

// Simple markdown to HTML converter for speaker notes
function markdownToHtml(markdown) {
  if (!markdown || typeof markdown !== 'string') return '';
  
  let html = markdown;
  
  // Headers (must be first to avoid conflicts)
  html = html.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.*?)$/gm, '<h1>$1</h1>');
  
  // Bold and italic (order matters - bold first)
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Simple italic - single asterisk not preceded or followed by asterisk
  html = html.replace(/\*([^*\n]+?)\*/g, '<em>$1</em>');
  
  // Inline code
  html = html.replace(/`([^`]+?)`/g, '<code>$1</code>');
  
  // Process lists - convert to list items first
  const lines = html.split('\n');
  let inList = false;
  let listType = null;
  const processedLines = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Check for unordered list
    if (line.match(/^[-*+] (.+)/)) {
      const content = line.replace(/^[-*+] /, '');
      if (!inList || listType !== 'ul') {
        if (inList) processedLines.push(`</${listType}>`);
        processedLines.push('<ul>');
        listType = 'ul';
        inList = true;
      }
      processedLines.push(`<li>${content}</li>`);
    }
    // Check for ordered list
    else if (line.match(/^\d+\. (.+)/)) {
      const content = line.replace(/^\d+\. /, '');
      if (!inList || listType !== 'ol') {
        if (inList) processedLines.push(`</${listType}>`);
        processedLines.push('<ol>');
        listType = 'ol';
        inList = true;
      }
      processedLines.push(`<li>${content}</li>`);
    }
    // Regular line
    else {
      if (inList) {
        processedLines.push(`</${listType}>`);
        inList = false;
        listType = null;
      }
      if (line.length > 0) {
        processedLines.push(line);
      } else {
        processedLines.push(''); // Preserve empty lines for paragraph breaks
      }
    }
  }
  
  // Close any open list
  if (inList) {
    processedLines.push(`</${listType}>`);
  }
  
  html = processedLines.join('\n');
  
  // Handle paragraphs - split by double newlines and wrap non-HTML content
  const paragraphs = html.split(/\n\s*\n/);
  const htmlParagraphs = paragraphs.map(p => {
    const trimmed = p.trim();
    if (!trimmed) return '';
    // Don't wrap if it's already HTML (starts with <)
    if (trimmed.startsWith('<')) return trimmed;
    // Convert single newlines to <br> and wrap in <p>
    return '<p>' + trimmed.replace(/\n/g, '<br>') + '</p>';
  });
  
  html = htmlParagraphs.filter(p => p).join('\n\n');
  
  return html;
}

// Speaker Notes Functions
function extractSpeakerNotes(content) {
  if (!content) return [];
  
  // Split content by slide markers
  const slides = content.split(/\n---\n|\n--- \n/);
  const speakerNotes = [];
  
  slides.forEach((slide, index) => {
    // Extract notes using regex
    const notesRegex = /```notes\s*\n([\s\S]*?)\n```/g;
    const slideNotes = [];
    let match;
    
    while ((match = notesRegex.exec(slide)) !== null) {
      slideNotes.push(match[1].trim());
    }
    
    speakerNotes.push(slideNotes.join('\n\n'));
  });
  
  return speakerNotes;
}

async function showSpeakerNotesPanel(content, forceInline = false) {
  
  // Check if we should use separate window mode
  // Only use separate window if we're actually in presenting mode (is-presenting class on body)
  const isInPresentingMode = document.body.classList.contains('is-presenting');
  const useSeparateWindow = isInPresentingMode && !forceInline && window.electronAPI;
  
  if (useSeparateWindow) {
    // Open speaker notes in a separate window
    const allNotes = extractSpeakerNotes(content);
    // Always start with slide 0 (the actual first slide), regardless of whether it has notes
    let startSlideIndex = 0;
    const currentSlideNotes = allNotes[startSlideIndex] || '';
    
    try {
      const formattedFirstSlideNotes = markdownToHtml(currentSlideNotes);
      const windowData = {
        notes: formattedFirstSlideNotes,
        slideNumber: startSlideIndex + 1, // Convert to 1-based numbering
        allNotes: allNotes
      };
      
      const result = await window.electronAPI.invoke('open-speaker-notes-window', windowData);
      
      // Store notes for later updates and make them available to React component
      // Only create if React isn't already controlling it
      if (!window.REACT_CONTROLS_SPEAKER_NOTES) {
        window.speakerNotesData = {
          allNotes: allNotes,
          currentSlide: 0, // Always start with slide 0 (first slide)
          content: content
        };
      }
      
      // Hide the inline panel when using separate window
      const panel = document.getElementById('speaker-notes-panel');
      if (panel) {
        panel.style.setProperty('display', 'none', 'important');
      }
      
      // Set timestamp to prevent immediate closing
      window.speakerNotesJustOpened = Date.now();
      console.log('[Speaker Notes] Opened in separate window for presenting mode');
    } catch (error) {
      console.error('[Speaker Notes] Failed to open separate window:', error);
      // Fall back to inline panel
      showInlineSpeakerNotesPanel(content);
    }
  } else {
    // Use inline panel (when just in presentation view, not presenting)
    // Don't show inline panel at all when just switching to presentation view
    // Only show it if explicitly requested with forceInline
    if (forceInline) {
      showInlineSpeakerNotesPanel(content);
    } else {
      // Just store the notes for later when presenting starts
      const allNotes = extractSpeakerNotes(content);
      window.pendingSpeakerNotes = {
        content: content,
        allNotes: allNotes
      };
      // Ensure inline panel stays hidden
      const panel = document.getElementById('speaker-notes-panel');
      if (panel) {
        panel.style.setProperty('display', 'none', 'important');
        console.log('[Speaker Notes] Ensured inline panel stays hidden - stored notes for later');
      }
    }
  }
}

function showInlineSpeakerNotesPanel(content) {
  // Don't show inline panel if React has explicitly set separate window mode
  if (window.explicitlySeparateWindow) {
    console.log('[Speaker Notes] Skipping inline panel - React has explicitly set separate window mode');
    return;
  }
  
  const panel = document.getElementById('speaker-notes-panel');
  const notesContainer = document.getElementById('current-slide-notes');
  
  if (panel && notesContainer) {
    panel.style.setProperty('display', 'block', 'important');
    
    // Add exit presentation mode button if not already present and actively presenting
    if (!document.getElementById('exit-presentation-btn') && document.body.classList.contains('is-presenting')) {
      const exitBtn = document.createElement('button');
      exitBtn.id = 'exit-presentation-btn';
      exitBtn.innerHTML = 'Exit Presentation (ESC)';
      exitBtn.style.cssText = 'position: fixed; top: 10px; right: 10px; z-index: 10000; padding: 8px 16px; background: rgba(0,0,0,0.7); color: white; border: 1px solid rgba(255,255,255,0.3); border-radius: 4px; cursor: pointer; font-size: 12px;';
      exitBtn.onclick = () => {
        // Trigger the React component to exit presenting
        const event = new CustomEvent('exitPresenting');
        window.dispatchEvent(event);
      };
      document.body.appendChild(exitBtn);
    }
    
    // Extract all speaker notes
    const allNotes = extractSpeakerNotes(content);
    const currentSlideNotes = allNotes[0] || ''; // Start with first slide
    
    if (currentSlideNotes) {
      notesContainer.innerHTML = markdownToHtml(currentSlideNotes);
    } else {
      notesContainer.innerHTML = '<em>No speaker notes for this slide.</em>';
    }
    
    console.log('[Speaker Notes] Panel shown with notes:', currentSlideNotes);
  }
}

async function hideSpeakerNotesPanel() {
  // Prevent closing window immediately after opening (during initialization chaos)
  if (window.speakerNotesJustOpened && Date.now() - window.speakerNotesJustOpened < 2000) {
    console.log('[Speaker Notes] Ignoring close request - window just opened');
    return;
  }
  
  // Close the separate window if it exists
  if (window.electronAPI) {
    try {
      await window.electronAPI.invoke('close-speaker-notes-window');
      console.log('[Speaker Notes] Separate window closed');
    } catch (error) {
      console.error('[Speaker Notes] Failed to close separate window:', error);
    }
  }
  
  // Also hide the inline panel
  const panel = document.getElementById('speaker-notes-panel');
  if (panel) {
    panel.style.setProperty('display', 'none', 'important');
    console.log('[Speaker Notes] Panel hidden');
  }
  
  // Remove exit presentation button
  const exitBtn = document.getElementById('exit-presentation-btn');
  if (exitBtn) {
    exitBtn.remove();
  }
  
  // Clear stored notes data and reset React control flag
  delete window.speakerNotesData;
  window.REACT_CONTROLS_SPEAKER_NOTES = false;
  console.log('[Speaker Notes] Cleared speaker notes data and reset React control flag');
}

async function updateSpeakerNotes(slideIndex, content) {
  // If speakerNotesData is missing but we have content, recreate it
  if (!window.speakerNotesData && content) {
    const allNotes = extractSpeakerNotes(content);
    window.speakerNotesData = {
      allNotes: allNotes,
      currentSlide: slideIndex,
      content: content
    };
  }
  
  // Update separate window if it exists
  if (window.speakerNotesData && window.electronAPI) {
    const allNotes = window.speakerNotesData.allNotes || extractSpeakerNotes(content);
    const currentSlideNotes = allNotes[slideIndex] || '';
    
    try {
      const formattedNotes = currentSlideNotes ? markdownToHtml(currentSlideNotes) : '<em>No speaker notes for this slide.</em>';
      const updateResult = await window.electronAPI.invoke('update-speaker-notes', {
        notes: formattedNotes,
        slideNumber: slideIndex + 1
      });
      
      // If update failed because window doesn't exist, recreate it
      if (!updateResult.success && updateResult.error === 'Speaker notes window not available') {
        // Recreate the window with the full speaker notes data
        try {
          await window.electronAPI.invoke('open-speaker-notes-window', {
            notes: formattedNotes,
            slideNumber: slideIndex + 1,
            allNotes: window.speakerNotesData.allNotes
          });
        } catch (recreateError) {
          console.error('[Speaker Notes] Failed to recreate speaker notes window:', recreateError);
        }
      }
      
      window.speakerNotesData.currentSlide = slideIndex;
    } catch (error) {
      console.error('[Speaker Notes] Failed to update separate window:', error);
    }
  }
  
  // Always update inline panel (it may be shown later or visible now)
  const notesContainer = document.getElementById('current-slide-notes');
  if (notesContainer) {
    const allNotes = extractSpeakerNotes(content);
    const currentSlideNotes = allNotes[slideIndex] || '';

    if (currentSlideNotes) {
      notesContainer.innerHTML = markdownToHtml(currentSlideNotes);
    } else {
      notesContainer.innerHTML = '<em>No speaker notes for this slide.</em>';
    }

    console.log('[Speaker Notes] Updated inline panel for slide', slideIndex);
  }
}

function setupSpeakerNotesResize() {
  const panel = document.getElementById('speaker-notes-panel');
  const resizeHandle = document.getElementById('speaker-notes-resize-handle');
  const presentationContent = document.getElementById('presentation-content');
  
  if (!panel || !resizeHandle || !presentationContent) return;
  
  let isResizing = false;
  let startY = 0;
  let startHeight = 0;
  
  // Mouse events
  resizeHandle.addEventListener('mousedown', (e) => {
    isResizing = true;
    startY = e.clientY;
    startHeight = panel.offsetHeight;
    e.preventDefault();
    
    document.addEventListener('mousemove', handleResize);
    document.addEventListener('mouseup', stopResize);
  });
  
  function handleResize(e) {
    if (!isResizing) return;
    
    const deltaY = startY - e.clientY; // Inverted because panel grows upward
    const newHeight = Math.max(80, Math.min(startHeight + deltaY, presentationContent.offsetHeight * 0.6));
    panel.style.height = newHeight + 'px';
  }
  
  function stopResize() {
    isResizing = false;
    document.removeEventListener('mousemove', handleResize);
    document.removeEventListener('mouseup', stopResize);
  }
  
  // Touch events for mobile
  resizeHandle.addEventListener('touchstart', (e) => {
    isResizing = true;
    startY = e.touches[0].clientY;
    startHeight = panel.offsetHeight;
    e.preventDefault();
    
    document.addEventListener('touchmove', handleTouchResize);
    document.addEventListener('touchend', stopTouchResize);
  });
  
  function handleTouchResize(e) {
    if (!isResizing) return;
    
    const deltaY = startY - e.touches[0].clientY;
    const newHeight = Math.max(80, Math.min(startHeight + deltaY, presentationContent.offsetHeight * 0.6));
    panel.style.height = newHeight + 'px';
  }
  
  function stopTouchResize() {
    isResizing = false;
    document.removeEventListener('touchmove', handleTouchResize);
    document.removeEventListener('touchend', stopTouchResize);
  }
}

// Listen for presentation mode changes
function setupPresentationModeListener() {
  // Use MutationObserver to watch for class changes on body
  const observer = new MutationObserver(async (mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        const isNowPresenting = document.body.classList.contains('is-presenting');
        
        if (isNowPresenting) {
          // ALWAYS skip automatic window opening - let React handle it
          console.log('[Speaker Notes] Detected entering presentation mode - letting React handle window management');
          
          // Just hide the inline panel and store notes
          // Entering presentation mode - open speaker notes window and hide inline panel
          console.log('[Speaker Notes] Skipping automatic window open');
          
          // Hide inline panel by default and keep it hidden
          const panel = document.getElementById('speaker-notes-panel');
          if (panel) {
            panel.style.setProperty('display', 'none', 'important');
            console.log('[Speaker Notes] Hidden inline panel on presentation start');
          }
          
          // Re-enabled but with protection
          // Only try to open separate window if electronAPI is available
          if (window.electronAPI && !window.SPEAKER_NOTES_WINDOW_OPEN) {
            // Use stored notes if available, or get current content
            let content = '';
            if (window.pendingSpeakerNotes) {
              content = window.pendingSpeakerNotes.content;
            } else if (window.getCurrentEditorContent && typeof window.getCurrentEditorContent === 'function') {
              content = window.getCurrentEditorContent();
            } else if (window.editor && window.editor.getValue) {
              content = window.editor.getValue();
            }
            
            if (content) {
              // Don't force inline - let showSpeakerNotesPanel decide based on mode
              window.SPEAKER_NOTES_WINDOW_OPEN = true; // Set flag to prevent double-opening
              await showSpeakerNotesPanel(content);
            }
          } else {
            // No Electron available - just keep panel hidden and store notes for later
            console.log('[Speaker Notes] No Electron API or window already open - keeping inline panel hidden');
          }
        } else {
          // Exiting presentation mode - close speaker notes window and hide inline panel
          console.log('[Speaker Notes] Detected exiting presentation mode');
          window.SPEAKER_NOTES_WINDOW_OPEN = false; // Clear flag
          await hideSpeakerNotesPanel();
          
          // Also hide inline panel
          const panel = document.getElementById('speaker-notes-panel');
          if (panel) {
            panel.style.setProperty('display', 'none', 'important');
          }
        }
      }
    }
  });
  
  // Start observing body for class changes
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ['class']
  });
  
  console.log('[Speaker Notes] Presentation mode listener setup complete');
}

// Set up the listener when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupPresentationModeListener);
} else {
  setupPresentationModeListener();
}

// Export functions to global scope for backward compatibility
window.markdownToHtml = markdownToHtml;
window.extractSpeakerNotes = extractSpeakerNotes;
window.showSpeakerNotesPanel = showSpeakerNotesPanel;
window.hideSpeakerNotesPanel = hideSpeakerNotesPanel;
window.updateSpeakerNotes = updateSpeakerNotes;
window.setupSpeakerNotesResize = setupSpeakerNotesResize;