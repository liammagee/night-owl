// Speaker Notes Functions
// Handles speaker notes extraction, display, and panel management

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

function showSpeakerNotesPanel(content) {
  const panel = document.getElementById('speaker-notes-panel');
  const notesContainer = document.getElementById('current-slide-notes');
  
  if (panel && notesContainer) {
    panel.style.display = 'block';
    
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
      notesContainer.innerHTML = currentSlideNotes.replace(/\n/g, '<br>');
    } else {
      notesContainer.innerHTML = '<em>No speaker notes for this slide.</em>';
    }
    
    console.log('[Speaker Notes] Panel shown with notes:', currentSlideNotes);
  }
}

function hideSpeakerNotesPanel() {
  const panel = document.getElementById('speaker-notes-panel');
  if (panel) {
    panel.style.display = 'none';
    console.log('[Speaker Notes] Panel hidden');
  }
  
  // Remove exit presentation button
  const exitBtn = document.getElementById('exit-presentation-btn');
  if (exitBtn) {
    exitBtn.remove();
  }
}

function updateSpeakerNotes(slideIndex, content) {
  const notesContainer = document.getElementById('current-slide-notes');
  if (notesContainer) {
    const allNotes = extractSpeakerNotes(content);
    const currentSlideNotes = allNotes[slideIndex] || '';
    
    if (currentSlideNotes) {
      notesContainer.innerHTML = currentSlideNotes.replace(/\n/g, '<br>');
    } else {
      notesContainer.innerHTML = '<em>No speaker notes for this slide.</em>';
    }
    
    console.log('[Speaker Notes] Updated for slide', slideIndex, ':', currentSlideNotes);
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

// Export functions to global scope for backward compatibility
window.extractSpeakerNotes = extractSpeakerNotes;
window.showSpeakerNotesPanel = showSpeakerNotesPanel;
window.hideSpeakerNotesPanel = hideSpeakerNotesPanel;
window.updateSpeakerNotes = updateSpeakerNotes;
window.setupSpeakerNotesResize = setupSpeakerNotesResize;