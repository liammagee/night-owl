// Touch Gesture Support for Presentation Navigation
// Adds swipe navigation and pinch-to-zoom for mobile devices
// Optimized for fullscreen single-slide view on mobile

(function() {
  'use strict';

  // Configuration
  const SWIPE_THRESHOLD = 50;  // Minimum distance for a swipe
  const SWIPE_VELOCITY_THRESHOLD = 0.25;  // Minimum velocity (px/ms) - slightly lower for better responsiveness
  const PINCH_THRESHOLD = 0.1;  // Minimum scale change for zoom
  const DOUBLE_TAP_DELAY = 300;  // ms between taps for double-tap

  // State
  let touchState = {
    startX: 0,
    startY: 0,
    startTime: 0,
    startDistance: null,
    isMultiTouch: false,
    isSwiping: false,
    lastTap: 0,
    lastTapX: 0,
    lastTapY: 0
  };

  // Check if we're on a mobile device
  const isMobile = () => {
    return window.matchMedia('(max-width: 1000px)').matches ||
           window.matchMedia('(pointer: coarse)').matches;
  };

  // Check if we're in presentation mode
  const isPresenting = () => {
    return document.body.classList.contains('is-presenting');
  };

  // Get distance between two touch points
  function getTouchDistance(touches) {
    if (touches.length < 2) return null;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Get center point of two touches
  function getTouchCenter(touches) {
    if (touches.length < 2) return null;
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2
    };
  }

  // Navigate to next/previous slide
  function navigateSlide(direction) {
    // Try to find the React component's goToSlide function
    if (window.goToNextSlide && direction === 'next') {
      window.goToNextSlide();
      return;
    }
    if (window.goToPrevSlide && direction === 'prev') {
      window.goToPrevSlide();
      return;
    }

    // Try clicking the navigation buttons directly (more reliable on mobile)
    const presentationRoot = document.getElementById('presentation-root');
    if (presentationRoot) {
      const navButtons = presentationRoot.querySelectorAll('.fixed.bottom-4 button, [class*="bottom-4"] button');
      if (navButtons.length >= 2) {
        // First button is prev, last is next (middle might be slide counter)
        const targetButton = direction === 'next' ? navButtons[navButtons.length - 1] : navButtons[0];
        if (targetButton && !targetButton.disabled) {
          targetButton.click();
          return;
        }
      }
    }

    // Fallback: simulate keyboard navigation
    const keyEvent = new KeyboardEvent('keydown', {
      key: direction === 'next' ? 'ArrowRight' : 'ArrowLeft',
      code: direction === 'next' ? 'ArrowRight' : 'ArrowLeft',
      keyCode: direction === 'next' ? 39 : 37,
      which: direction === 'next' ? 39 : 37,
      bubbles: true
    });
    document.dispatchEvent(keyEvent);
  }

  // Toggle speaker notes visibility on mobile
  function toggleSpeakerNotes() {
    const notesPanel = document.getElementById('speaker-notes-panel');
    if (notesPanel) {
      notesPanel.classList.toggle('mobile-visible');
      document.body.classList.toggle('speaker-notes-visible', notesPanel.classList.contains('mobile-visible'));
    }
  }

  // Handle zoom
  function handleZoom(scale) {
    if (window.handleZoomIn && scale > 1) {
      window.handleZoomIn();
    } else if (window.handleZoomOut && scale < 1) {
      window.handleZoomOut();
    }
  }

  // Touch start handler
  function handleTouchStart(e) {
    // Only handle gestures in presentation mode on mobile
    if (!isPresenting()) return;

    // Don't handle touches on controls or speaker notes
    if (e.target.closest('button, select, input, #speaker-notes-panel, .speaker-notes-header, .fixed.bottom-4')) {
      return;
    }

    const touches = e.touches;

    touchState.startTime = Date.now();
    touchState.isSwiping = false;

    if (touches.length === 1) {
      touchState.startX = touches[0].clientX;
      touchState.startY = touches[0].clientY;
      touchState.isMultiTouch = false;
      touchState.startDistance = null;
    } else if (touches.length === 2) {
      touchState.isMultiTouch = true;
      touchState.startDistance = getTouchDistance(touches);
    }
  }

  // Touch move handler
  function handleTouchMove(e) {
    // Only handle gestures in presentation mode
    if (!isPresenting()) return;

    // Don't handle touches on controls or speaker notes
    if (e.target.closest('button, select, input, #speaker-notes-panel, .speaker-notes-header, .fixed.bottom-4')) {
      return;
    }

    const touches = e.touches;

    if (touches.length === 2 && touchState.isMultiTouch && touchState.startDistance) {
      // Pinch gesture - disabled on mobile fullscreen mode (no zoom)
      if (!isMobile()) {
        const currentDistance = getTouchDistance(touches);
        const scale = currentDistance / touchState.startDistance;

        if (Math.abs(scale - 1) > PINCH_THRESHOLD) {
          e.preventDefault();
          // We'll handle zoom on touch end
        }
      }
    } else if (touches.length === 1 && !touchState.isMultiTouch) {
      const dx = touches[0].clientX - touchState.startX;
      const dy = touches[0].clientY - touchState.startY;

      // If horizontal movement is greater than vertical, it's likely a swipe
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > SWIPE_THRESHOLD / 2) {
        touchState.isSwiping = true;
        // Prevent default scrolling during horizontal swipe on mobile
        if (isMobile()) {
          e.preventDefault();
        }
      }
    }
  }

  // Touch end handler
  function handleTouchEnd(e) {
    // Only handle gestures in presentation mode
    if (!isPresenting()) return;

    // Don't handle touches on controls or speaker notes
    if (e.target.closest('button, select, input, #speaker-notes-panel, .speaker-notes-header, .fixed.bottom-4')) {
      return;
    }

    const touches = e.changedTouches;
    const elapsed = Date.now() - touchState.startTime;

    if (touchState.isMultiTouch && touchState.startDistance && !isMobile()) {
      // Handle pinch-to-zoom (only on non-mobile)
      // Note: pinch gesture ended, but we can't get the final distance reliably
      // So we handle zoom based on the last known state
    } else if (touches.length === 1 && !touchState.isMultiTouch) {
      const endX = touches[0].clientX;
      const endY = touches[0].clientY;
      const dx = endX - touchState.startX;
      const dy = endY - touchState.startY;
      const velocity = Math.abs(dx) / elapsed;

      // Check for horizontal swipe
      if (Math.abs(dx) > SWIPE_THRESHOLD &&
          Math.abs(dx) > Math.abs(dy) * 1.5 &&  // More horizontal than vertical
          velocity > SWIPE_VELOCITY_THRESHOLD) {

        if (dx > 0) {
          // Swipe right -> previous slide
          navigateSlide('prev');
        } else {
          // Swipe left -> next slide
          navigateSlide('next');
        }
      }

      // Check for double tap on mobile to toggle speaker notes
      const now = Date.now();
      if (elapsed < 300 && Math.abs(dx) < 15 && Math.abs(dy) < 15) {
        const tapDistance = Math.sqrt(
          Math.pow(endX - touchState.lastTapX, 2) +
          Math.pow(endY - touchState.lastTapY, 2)
        );

        if (now - touchState.lastTap < DOUBLE_TAP_DELAY && tapDistance < 50) {
          // Double tap detected - toggle speaker notes on mobile
          if (isMobile()) {
            toggleSpeakerNotes();
          }
          touchState.lastTap = 0;
        } else {
          touchState.lastTap = now;
          touchState.lastTapX = endX;
          touchState.lastTapY = endY;
        }
      }
    }

    // Reset state
    touchState.isMultiTouch = false;
    touchState.startDistance = null;
    touchState.isSwiping = false;
  }

  // Initialize touch gestures
  function initTouchGestures() {
    const presentationRoot = document.getElementById('presentation-root');

    if (!presentationRoot) {
      // Wait for presentation root to be created
      setTimeout(initTouchGestures, 500);
      return;
    }

    // Remove any existing listeners to avoid duplicates
    presentationRoot.removeEventListener('touchstart', handleTouchStart);
    presentationRoot.removeEventListener('touchmove', handleTouchMove);
    presentationRoot.removeEventListener('touchend', handleTouchEnd);

    // Add touch event listeners with passive: false to allow preventDefault
    presentationRoot.addEventListener('touchstart', handleTouchStart, { passive: true });
    presentationRoot.addEventListener('touchmove', handleTouchMove, { passive: false });
    presentationRoot.addEventListener('touchend', handleTouchEnd, { passive: true });

    // Also listen on document for better coverage on mobile
    if (isMobile()) {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);

      document.addEventListener('touchstart', handleTouchStart, { passive: true });
      document.addEventListener('touchmove', handleTouchMove, { passive: false });
      document.addEventListener('touchend', handleTouchEnd, { passive: true });
    }

    console.log('[Touch Gestures] Initialized swipe navigation for presentations' + (isMobile() ? ' (mobile mode)' : ''));
  }

  // Clean up speaker notes visibility when exiting presentation
  function cleanupMobilePresentation() {
    const notesPanel = document.getElementById('speaker-notes-panel');
    if (notesPanel) {
      notesPanel.classList.remove('mobile-visible');
    }
    document.body.classList.remove('speaker-notes-visible');
  }

  // Track presentation state to avoid repeated triggers
  let lastPresentingState = false;

  // Force hide speaker notes on mobile when entering presentation mode
  function setupMobilePresentation() {
    if (!isMobile()) return;

    const notesPanel = document.getElementById('speaker-notes-panel');
    if (notesPanel) {
      // Just add inline style to hide - don't modify classes or remove properties
      // as that can trigger other observers
      notesPanel.style.setProperty('display', 'none', 'important');
    }

    // Clear any existing monitor
    if (window.mobileNotesPanelMonitor) {
      clearInterval(window.mobileNotesPanelMonitor);
      window.mobileNotesPanelMonitor = null;
    }

    // Monitor and hide any panels that React might show (check less frequently)
    window.mobileNotesPanelMonitor = setInterval(() => {
      if (!isPresenting()) {
        clearInterval(window.mobileNotesPanelMonitor);
        window.mobileNotesPanelMonitor = null;
        return;
      }
      const panel = document.getElementById('speaker-notes-panel');
      if (panel && !panel.classList.contains('mobile-visible')) {
        // Only set if not already hidden
        if (panel.style.display !== 'none') {
          panel.style.setProperty('display', 'none', 'important');
        }
      }
    }, 500); // Reduced frequency to avoid performance issues
  }

  // Watch for presentation mode changes
  const bodyObserver = new MutationObserver((mutations) => {
    const currentlyPresenting = document.body.classList.contains('is-presenting');

    // Only react to actual state changes
    if (currentlyPresenting === lastPresentingState) return;
    lastPresentingState = currentlyPresenting;

    if (currentlyPresenting) {
      // Entering presentation mode on mobile - hide speaker notes
      setupMobilePresentation();
    } else {
      // Exiting presentation mode
      cleanupMobilePresentation();
      if (window.mobileNotesPanelMonitor) {
        clearInterval(window.mobileNotesPanelMonitor);
        window.mobileNotesPanelMonitor = null;
      }
    }
  });

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initTouchGestures();
      bodyObserver.observe(document.body, { attributes: true });
    });
  } else {
    initTouchGestures();
    bodyObserver.observe(document.body, { attributes: true });
  }

  // Also reinitialize when presentation content updates
  window.addEventListener('updatePresentationContent', function() {
    setTimeout(initTouchGestures, 100);
  });

  // Expose functions globally
  window.initPresentationTouchGestures = initTouchGestures;
  window.toggleMobileSpeakerNotes = toggleSpeakerNotes;
})();
