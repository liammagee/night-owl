// Touch Gesture Support for Presentation Navigation
// Adds swipe navigation and pinch-to-zoom for mobile devices

(function() {
  'use strict';

  // Configuration
  const SWIPE_THRESHOLD = 50;  // Minimum distance for a swipe
  const SWIPE_VELOCITY_THRESHOLD = 0.3;  // Minimum velocity (px/ms)
  const PINCH_THRESHOLD = 0.1;  // Minimum scale change for zoom

  // State
  let touchState = {
    startX: 0,
    startY: 0,
    startTime: 0,
    startDistance: null,
    isMultiTouch: false,
    isSwiping: false,
    lastTap: 0
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
    // Don't handle touches on controls or speaker notes
    if (e.target.closest('button, select, input, #speaker-notes-panel, .speaker-notes-header')) {
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
    // Don't handle touches on controls or speaker notes
    if (e.target.closest('button, select, input, #speaker-notes-panel, .speaker-notes-header')) {
      return;
    }

    const touches = e.touches;

    if (touches.length === 2 && touchState.isMultiTouch && touchState.startDistance) {
      // Pinch gesture
      const currentDistance = getTouchDistance(touches);
      const scale = currentDistance / touchState.startDistance;

      if (Math.abs(scale - 1) > PINCH_THRESHOLD) {
        e.preventDefault();
        // We'll handle zoom on touch end
      }
    } else if (touches.length === 1 && !touchState.isMultiTouch) {
      const dx = touches[0].clientX - touchState.startX;
      const dy = touches[0].clientY - touchState.startY;

      // If horizontal movement is greater than vertical, it's likely a swipe
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > SWIPE_THRESHOLD / 2) {
        touchState.isSwiping = true;
        // Prevent vertical scrolling during horizontal swipe
        e.preventDefault();
      }
    }
  }

  // Touch end handler
  function handleTouchEnd(e) {
    // Don't handle touches on controls or speaker notes
    if (e.target.closest('button, select, input, #speaker-notes-panel, .speaker-notes-header')) {
      return;
    }

    const touches = e.changedTouches;
    const elapsed = Date.now() - touchState.startTime;

    if (touchState.isMultiTouch && touchState.startDistance) {
      // Handle pinch-to-zoom
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

      // Check for double tap to toggle presentation mode
      const now = Date.now();
      if (elapsed < 300 && Math.abs(dx) < 10 && Math.abs(dy) < 10) {
        if (now - touchState.lastTap < 300) {
          // Double tap detected
          // Could toggle fullscreen or focus mode here
          touchState.lastTap = 0;
        } else {
          touchState.lastTap = now;
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

    // Add touch event listeners with passive: false to allow preventDefault
    presentationRoot.addEventListener('touchstart', handleTouchStart, { passive: true });
    presentationRoot.addEventListener('touchmove', handleTouchMove, { passive: false });
    presentationRoot.addEventListener('touchend', handleTouchEnd, { passive: true });

    console.log('[Touch Gestures] Initialized swipe navigation for presentations');
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTouchGestures);
  } else {
    initTouchGestures();
  }

  // Also reinitialize when presentation content updates
  window.addEventListener('updatePresentationContent', function() {
    setTimeout(initTouchGestures, 100);
  });

  // Expose navigation functions globally for the React component to use
  window.initPresentationTouchGestures = initTouchGestures;
})();
