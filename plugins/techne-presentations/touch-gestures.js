// Touch Gesture Support for Presentation Navigation
// Adds swipe navigation and pinch-to-zoom for mobile devices
// Optimized for fullscreen single-slide view on mobile

console.log('[Touch Gestures] Script loaded - starting initialization');

(function() {
  'use strict';

  console.log('[Touch Gestures] IIFE executing');

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

  // Check if we're on a mobile device - STRICT detection
  // Must be BOTH small screen AND coarse pointer to avoid false positives on desktop Macs
  const isMobile = () => {
    const isSmallScreen = window.innerWidth <= 768;
    const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
    const result = isSmallScreen && isCoarsePointer;
    console.log('[Touch Gestures] isMobile check:', { isSmallScreen, isCoarsePointer, result, innerWidth: window.innerWidth });
    return result;
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
    console.log('[Touch Gestures] Cleaning up mobile presentation mode');

    const notesPanel = document.getElementById('speaker-notes-panel');
    if (notesPanel) {
      notesPanel.classList.remove('mobile-visible');
    }
    document.body.classList.remove('speaker-notes-visible');

    // Restore the navigation bar on mobile
    const navBar = document.querySelector('.nav');
    const mobileMenu = document.querySelector('.mobile-menu');
    if (navBar) navBar.style.display = '';
    if (mobileMenu) mobileMenu.style.display = '';

    // Show the content toolbar again
    showContentToolbar();

    // Reset slide styles that were overridden for mobile presentation
    const presentationRoot = document.getElementById('presentation-root');
    if (presentationRoot) {
      const slides = presentationRoot.querySelectorAll('.slide');
      slides.forEach(slide => {
        slide.classList.remove('mobile-current-slide');
        // Remove our inline style overrides
        slide.style.removeProperty('position');
        slide.style.removeProperty('top');
        slide.style.removeProperty('left');
        slide.style.removeProperty('transform');
        slide.style.removeProperty('width');
        slide.style.removeProperty('height');
        slide.style.removeProperty('max-height');
        slide.style.removeProperty('opacity');
        slide.style.removeProperty('z-index');
        slide.style.removeProperty('overflow');
        slide.style.removeProperty('display');
        slide.style.removeProperty('visibility');
      });
    }

    // Remove mobile UI elements
    removeMobileExitButton();
    removeMobileNav();
  }

  // Track presentation state to avoid repeated triggers
  let lastPresentingState = false;

  // Hide the content toolbar (bookmark/glossary/flashcard icons on the right side)
  function hideContentToolbar() {
    console.log('[Touch Gestures] hideContentToolbar called');

    // The ContentToolbar is rendered via React portal to document.body
    // It has inline styles and Tailwind classes like: fixed right-5 top-1/2 z-[12100]

    // Strategy 1: Find by computed style - look for fixed positioned elements on the right
    document.querySelectorAll('body > div').forEach(el => {
      const style = window.getComputedStyle(el);
      const position = style.position;
      const right = parseInt(style.right) || 999;
      const zIndex = parseInt(style.zIndex) || 0;

      // Content toolbar: fixed position, right ~20px, high z-index, has multiple buttons
      const buttons = el.querySelectorAll('button');
      const svgs = el.querySelectorAll('svg');

      if (position === 'fixed' &&
          right >= 0 && right <= 50 &&
          zIndex > 1000 &&
          buttons.length >= 3 &&
          svgs.length >= 3 &&
          !el.id?.includes('presentation') &&
          !el.id?.includes('mobile')) {
        console.log('[Touch Gestures] Hiding content toolbar (found by style)', { right, zIndex, buttons: buttons.length });
        el.style.setProperty('display', 'none', 'important');
        el.style.setProperty('visibility', 'hidden', 'important');
        el.style.setProperty('opacity', '0', 'important');
        el.style.setProperty('pointer-events', 'none', 'important');
        el.dataset.hiddenByPresentation = 'true';
      }
    });

    // Strategy 2: Find any fixed element with high z-index containing bookmark/glossary buttons
    document.querySelectorAll('div[class*="fixed"]').forEach(el => {
      const style = window.getComputedStyle(el);
      const zIndex = parseInt(style.zIndex) || 0;
      const right = parseInt(style.right) || 999;

      // Look for the characteristic structure: fixed + high z-index + on right side
      if (zIndex > 10000 && right < 100) {
        console.log('[Touch Gestures] Hiding high z-index toolbar', { zIndex, right });
        el.style.setProperty('display', 'none', 'important');
        el.style.setProperty('visibility', 'hidden', 'important');
        el.dataset.hiddenByPresentation = 'true';
      }
    });

    // Strategy 3: Directly hide elements with z-index style containing 12100
    document.querySelectorAll('[class*="z-"]').forEach(el => {
      const classList = el.className;
      if (classList.includes('12100') || classList.includes('z-[12100]')) {
        console.log('[Touch Gestures] Hiding element with z-12100 class');
        el.style.setProperty('display', 'none', 'important');
        el.style.setProperty('visibility', 'hidden', 'important');
        el.dataset.hiddenByPresentation = 'true';
      }
    });
  }

  // Show the content toolbar again when exiting presentation mode
  function showContentToolbar() {
    document.querySelectorAll('[data-hidden-by-presentation="true"]').forEach(el => {
      console.log('[Touch Gestures] Showing content toolbar');
      el.style.removeProperty('display');
      el.style.removeProperty('visibility');
      el.style.removeProperty('pointer-events');
      delete el.dataset.hiddenByPresentation;
    });
  }

  // Force hide ALL speaker notes panels on mobile when entering presentation mode
  function setupMobilePresentation() {
    if (!isMobile()) return;

    console.log('[Touch Gestures] Setting up mobile presentation mode');

    // Hide the content toolbar (bookmark/glossary/flashcard icons on the right)
    hideContentToolbar();

    // IMMEDIATELY apply mobile styles to slides to prevent flash of multiple slides
    // Look for slides directly - don't rely on presentation-root ID
    const slides = document.querySelectorAll('.slide');
    console.log('[Touch Gestures] setupMobilePresentation - initial slide count:', slides.length);

    if (slides.length > 0) {
      // Hide the SVG connection lines
      const svg = document.querySelector('.cursor-grab svg') || document.querySelector('.h-screen svg');
      if (svg) {
        svg.style.setProperty('display', 'none', 'important');
      }

      let foundCurrent = false;
      slides.forEach((slide, idx) => {
        const zIndex = parseInt(slide.style.zIndex) || 0;
        const opacity = parseFloat(slide.style.opacity);
        const hasRing = slide.classList.contains('ring-4');

        // Check if this is the current slide
        const isCurrent = zIndex >= 999 || (opacity === 1 && !foundCurrent) || (hasRing && !foundCurrent);

        if (isCurrent && !foundCurrent) {
          foundCurrent = true;
          console.log('[Touch Gestures] Initial current slide:', idx);
          slide.classList.add('mobile-current-slide');
          slide.style.setProperty('position', 'fixed', 'important');
          slide.style.setProperty('top', '50%', 'important');
          slide.style.setProperty('left', '50%', 'important');
          slide.style.setProperty('transform', 'translate(-50%, -50%)', 'important');
          slide.style.setProperty('width', 'calc(100vw - 32px)', 'important');
          slide.style.setProperty('height', 'auto', 'important');
          slide.style.setProperty('max-height', 'calc(100vh - 120px)', 'important');
          slide.style.setProperty('opacity', '1', 'important');
          slide.style.setProperty('z-index', '1000', 'important');
          slide.style.setProperty('display', 'block', 'important');
          slide.style.setProperty('visibility', 'visible', 'important');
        } else {
          // Hide non-current slides
          slide.style.setProperty('display', 'none', 'important');
          slide.style.setProperty('visibility', 'hidden', 'important');
          slide.style.setProperty('opacity', '0', 'important');
        }
      });
    }

    // Hide all possible speaker notes panels
    const panelIds = [
      'speaker-notes-panel',
      'web-speaker-notes-panel',
      'speaker-notes-pane'
    ];

    panelIds.forEach(id => {
      const panel = document.getElementById(id);
      if (panel) {
        panel.style.setProperty('display', 'none', 'important');
        panel.style.setProperty('visibility', 'hidden', 'important');
        panel.style.setProperty('width', '0', 'important');
        panel.style.setProperty('height', '0', 'important');
        panel.style.setProperty('opacity', '0', 'important');
      }
    });

    // Also hide by class
    document.querySelectorAll('[class*="speaker-notes"]:not(.mobile-visible)').forEach(el => {
      if (!el.classList.contains('speaker-notes-block') &&
          !el.classList.contains('speaker-notes-header') &&
          !el.classList.contains('speaker-notes-content')) {
        el.style.setProperty('display', 'none', 'important');
      }
    });

    // Hide toggle buttons
    const toggleBtns = ['notes-toggle-btn', 'tts-toggle-btn'];
    toggleBtns.forEach(id => {
      const btn = document.getElementById(id);
      if (btn) {
        btn.style.setProperty('display', 'none', 'important');
      }
    });

    // Clear any existing monitor
    if (window.mobileNotesPanelMonitor) {
      clearInterval(window.mobileNotesPanelMonitor);
      window.mobileNotesPanelMonitor = null;
    }

    // Monitor slides and mark current one, also keep panels hidden
    window.mobileNotesPanelMonitor = setInterval(() => {
      if (!isPresenting()) {
        clearInterval(window.mobileNotesPanelMonitor);
        window.mobileNotesPanelMonitor = null;
        // Clean up mobile-current-slide class
        document.querySelectorAll('.mobile-current-slide').forEach(el => {
          el.classList.remove('mobile-current-slide');
        });
        return;
      }

      // Re-hide all panels in case React re-showed them
      panelIds.forEach(id => {
        const panel = document.getElementById(id);
        if (panel && !panel.classList.contains('mobile-visible')) {
          if (panel.style.display !== 'none') {
            panel.style.setProperty('display', 'none', 'important');
            panel.style.setProperty('visibility', 'hidden', 'important');
          }
        }
      });

      // Keep content toolbar hidden (React may re-render and show it)
      hideContentToolbar();

      // Find and mark the current slide for mobile display
      updateMobileCurrentSlide();
    }, 200); // Check more frequently for smooth slide transitions

    // Initial slide update
    setTimeout(updateMobileCurrentSlide, 100);

    console.log('[Touch Gestures] Mobile presentation setup - hidden all speaker notes panels');
  }

  // Find and mark the current slide based on React's state
  function updateMobileCurrentSlide() {
    const mobile = isMobile();
    const presenting = isPresenting();

    console.log('[Touch Gestures] updateMobileCurrentSlide called:', { mobile, presenting });

    if (!mobile || !presenting) return;

    // Look for slides directly - don't rely on presentation-root ID
    const slides = document.querySelectorAll('.slide');
    console.log('[Touch Gestures] Found slides:', slides.length);

    if (slides.length === 0) return;

    // Find the current slide - React sets z-index: 999 and opacity: 1 on current
    let currentSlide = null;

    slides.forEach((slide, i) => {
      const zIndex = parseInt(slide.style.zIndex) || 0;
      const opacity = parseFloat(slide.style.opacity);

      // Current slide has high z-index (999) or opacity 1 while others have 0.1
      if (zIndex >= 999 || (opacity === 1 && zIndex > 0)) {
        currentSlide = slide;
        console.log('[Touch Gestures] Found current slide by z-index/opacity:', i, { zIndex, opacity });
      }
    });

    // If no slide found by z-index, look for ring classes
    if (!currentSlide) {
      currentSlide = document.querySelector('.slide.ring-green-500') ||
                     document.querySelector('.slide.ring-purple-500') ||
                     document.querySelector('.slide.ring-4');
      if (currentSlide) {
        console.log('[Touch Gestures] Found current slide by ring class');
      }
    }

    // Fallback: if still no current slide, use first slide
    if (!currentSlide && slides.length > 0) {
      currentSlide = slides[0];
      console.log('[Touch Gestures] Using first slide as fallback');
    }

    // Update classes AND inline styles to override React's positioning
    slides.forEach((slide, idx) => {
      if (slide === currentSlide) {
        if (!slide.classList.contains('mobile-current-slide')) {
          slide.classList.add('mobile-current-slide');
          console.log('[Touch Gestures] Added mobile-current-slide class to slide', idx);
        }
        // Override React's inline styles for current slide
        slide.style.setProperty('position', 'fixed', 'important');
        slide.style.setProperty('top', '50%', 'important');
        slide.style.setProperty('left', '50%', 'important');
        slide.style.setProperty('transform', 'translate(-50%, -50%)', 'important');
        slide.style.setProperty('width', 'calc(100vw - 32px)', 'important');
        slide.style.setProperty('height', 'auto', 'important');
        slide.style.setProperty('max-height', 'calc(100vh - 120px)', 'important');
        slide.style.setProperty('opacity', '1', 'important');
        slide.style.setProperty('z-index', '1000', 'important');
        slide.style.setProperty('overflow', 'auto', 'important');
      } else {
        slide.classList.remove('mobile-current-slide');
        // Hide non-current slides completely
        slide.style.setProperty('display', 'none', 'important');
        slide.style.setProperty('visibility', 'hidden', 'important');
        slide.style.setProperty('opacity', '0', 'important');
      }
    });

    // Ensure mobile UI elements are visible
    ensureExitButtonVisible();
    ensureMobileNavVisible();
  }

  // Create or update the mobile exit button
  function ensureExitButtonVisible() {
    if (!isMobile() || !isPresenting()) return;

    // Check if mobile exit button already exists
    let mobileExitBtn = document.getElementById('mobile-exit-presentation-btn');

    if (!mobileExitBtn) {
      // Create a dedicated mobile exit button
      mobileExitBtn = document.createElement('button');
      mobileExitBtn.id = 'mobile-exit-presentation-btn';
      mobileExitBtn.innerHTML = '✕ Exit';
      mobileExitBtn.setAttribute('aria-label', 'Exit presentation');

      // Style it
      Object.assign(mobileExitBtn.style, {
        position: 'fixed',
        top: '12px',
        right: '12px',
        zIndex: '10001',
        background: 'rgba(255, 255, 255, 0.95)',
        color: '#1a1a2e',
        border: 'none',
        borderRadius: '8px',
        padding: '10px 16px',
        fontSize: '14px',
        fontWeight: '600',
        minWidth: '70px',
        minHeight: '44px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '4px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      });

      // Click handler to exit presentation
      mobileExitBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        // Try multiple methods to exit presentation
        // Method 1: Click the React exit button if found
        const presentationRoot = document.getElementById('presentation-root');
        if (presentationRoot) {
          const allButtons = presentationRoot.querySelectorAll('button');
          allButtons.forEach(btn => {
            const text = btn.textContent?.toLowerCase() || '';
            if (text.includes('exit') || text.includes('esc') || text.includes('close')) {
              btn.click();
              return;
            }
          });
        }

        // Method 2: Simulate Escape key
        const escEvent = new KeyboardEvent('keydown', {
          key: 'Escape',
          code: 'Escape',
          keyCode: 27,
          which: 27,
          bubbles: true
        });
        document.dispatchEvent(escEvent);

        // Method 3: Try window function
        if (window.exitPresentation) {
          window.exitPresentation();
        }

        // Method 4: Remove is-presenting class as last resort
        setTimeout(() => {
          if (document.body.classList.contains('is-presenting')) {
            document.body.classList.remove('is-presenting');
          }
        }, 100);
      });

      // Add touch feedback
      mobileExitBtn.addEventListener('touchstart', () => {
        mobileExitBtn.style.background = 'rgba(200, 200, 200, 0.95)';
      });
      mobileExitBtn.addEventListener('touchend', () => {
        mobileExitBtn.style.background = 'rgba(255, 255, 255, 0.95)';
      });

      document.body.appendChild(mobileExitBtn);
      console.log('[Touch Gestures] Created mobile exit button');
    }

    // Ensure it's visible
    mobileExitBtn.style.display = 'flex';
  }

  // Remove mobile exit button when not presenting
  function removeMobileExitButton() {
    const mobileExitBtn = document.getElementById('mobile-exit-presentation-btn');
    if (mobileExitBtn) {
      mobileExitBtn.remove();
    }
  }

  // Create mobile navigation bar at bottom
  function ensureMobileNavVisible() {
    if (!isMobile() || !isPresenting()) return;

    let mobileNav = document.getElementById('mobile-presentation-nav');

    if (!mobileNav) {
      mobileNav = document.createElement('div');
      mobileNav.id = 'mobile-presentation-nav';

      Object.assign(mobileNav.style, {
        position: 'fixed',
        bottom: '0',
        left: '0',
        right: '0',
        height: '60px',
        background: 'rgba(26, 26, 46, 0.95)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '20px',
        zIndex: '10000',
        padding: '0 20px',
        boxShadow: '0 -2px 10px rgba(0, 0, 0, 0.3)'
      });

      // Previous button
      const prevBtn = document.createElement('button');
      prevBtn.innerHTML = '◀ Prev';
      prevBtn.setAttribute('aria-label', 'Previous slide');
      Object.assign(prevBtn.style, {
        background: 'rgba(255, 255, 255, 0.15)',
        color: 'white',
        border: '1px solid rgba(255, 255, 255, 0.3)',
        borderRadius: '8px',
        padding: '10px 20px',
        fontSize: '14px',
        fontWeight: '500',
        minWidth: '80px',
        minHeight: '44px',
        cursor: 'pointer',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      });
      prevBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        navigateSlide('prev');
      });

      // Slide indicator
      const slideIndicator = document.createElement('span');
      slideIndicator.id = 'mobile-slide-indicator';
      Object.assign(slideIndicator.style, {
        color: 'rgba(255, 255, 255, 0.8)',
        fontSize: '14px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        minWidth: '60px',
        textAlign: 'center'
      });
      slideIndicator.textContent = '—';

      // Next button
      const nextBtn = document.createElement('button');
      nextBtn.innerHTML = 'Next ▶';
      nextBtn.setAttribute('aria-label', 'Next slide');
      Object.assign(nextBtn.style, {
        background: 'rgba(78, 205, 196, 0.3)',
        color: 'white',
        border: '1px solid rgba(78, 205, 196, 0.5)',
        borderRadius: '8px',
        padding: '10px 20px',
        fontSize: '14px',
        fontWeight: '500',
        minWidth: '80px',
        minHeight: '44px',
        cursor: 'pointer',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      });
      nextBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        navigateSlide('next');
      });

      mobileNav.appendChild(prevBtn);
      mobileNav.appendChild(slideIndicator);
      mobileNav.appendChild(nextBtn);

      document.body.appendChild(mobileNav);
      console.log('[Touch Gestures] Created mobile navigation bar');
    }

    // Update slide indicator
    updateMobileSlideIndicator();
  }

  // Update the mobile slide indicator
  function updateMobileSlideIndicator() {
    const indicator = document.getElementById('mobile-slide-indicator');
    if (!indicator) return;

    const presentationRoot = document.getElementById('presentation-root');
    if (!presentationRoot) return;

    const slides = presentationRoot.querySelectorAll('.slide');
    const currentSlide = presentationRoot.querySelector('.slide.mobile-current-slide');

    if (slides.length > 0 && currentSlide) {
      const currentIndex = Array.from(slides).indexOf(currentSlide) + 1;
      indicator.textContent = `${currentIndex} / ${slides.length}`;
    }
  }

  // Remove mobile nav when not presenting
  function removeMobileNav() {
    const mobileNav = document.getElementById('mobile-presentation-nav');
    if (mobileNav) {
      mobileNav.remove();
    }
  }

  // Watch for presentation mode changes
  const bodyObserver = new MutationObserver((mutations) => {
    const currentlyPresenting = document.body.classList.contains('is-presenting');
    console.log('[Touch Gestures] MutationObserver fired:', { currentlyPresenting, lastPresentingState, isMobile: isMobile() });

    // Only react to actual state changes
    if (currentlyPresenting === lastPresentingState) return;
    lastPresentingState = currentlyPresenting;

    console.log('[Touch Gestures] State changed to:', currentlyPresenting ? 'PRESENTING' : 'NOT PRESENTING');

    if (currentlyPresenting) {
      // Entering presentation mode on mobile - hide speaker notes
      console.log('[Touch Gestures] Calling setupMobilePresentation...');
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
  console.log('[Touch Gestures] Document readyState:', document.readyState);

  function initAndCheckState() {
    console.log('[Touch Gestures] initAndCheckState running');
    initTouchGestures();
    bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    console.log('[Touch Gestures] Body observer started');

    // CRITICAL: Check if already in presentation mode when script loads
    // (MutationObserver won't fire for existing state)
    const alreadyPresenting = document.body.classList.contains('is-presenting');
    console.log('[Touch Gestures] Initial state check - already presenting?', alreadyPresenting, 'isMobile?', isMobile());

    if (alreadyPresenting && isMobile()) {
      console.log('[Touch Gestures] Already in presentation mode on mobile - setting up immediately');
      lastPresentingState = true;
      setupMobilePresentation();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      console.log('[Touch Gestures] DOMContentLoaded fired');
      initAndCheckState();
    });
  } else {
    console.log('[Touch Gestures] DOM already ready, initializing immediately');
    initAndCheckState();
  }

  // Also reinitialize when presentation content updates
  window.addEventListener('updatePresentationContent', function() {
    setTimeout(initTouchGestures, 100);
  });

  // Hide content toolbar when presentation preview is visible on mobile
  // This runs even before entering full presentation mode
  // SIMPLIFIED: Don't restructure the canvas - just hide toolbar and show Present button
  function setupMobilePreviewMode() {
    if (!isMobile()) return;

    const slides = document.querySelectorAll('.slide');
    if (slides.length === 0) {
      console.log('[Touch Gestures] No slides found for preview mode');
      return;
    }

    console.log('[Touch Gestures] Setting up mobile preview mode (simplified) - found', slides.length, 'slides');

    // Hide the content toolbar to prevent it from overlaying the Present button
    hideContentToolbar();

    // Ensure the Present button is visible and accessible
    const presentBtn = document.querySelector('.presentation-present-btn');
    if (presentBtn) {
      presentBtn.style.setProperty('z-index', '15000', 'important');
      console.log('[Touch Gestures] Boosted Present button z-index');
    }

    // Make the top-right controls container more prominent
    const topRightControls = document.querySelector('.absolute.top-4.right-4');
    if (topRightControls) {
      topRightControls.style.setProperty('z-index', '15000', 'important');
      console.log('[Touch Gestures] Boosted controls container z-index');
    }

    // DON'T restructure the canvas - let CSS handle it or leave the Prezi view as-is
    // The key is just ensuring the Present button is clickable
  }

  // Track if we've already set up preview mode
  let previewModeSetup = false;
  let previewModeSetupTimeout = null;

  // Watch for slides to appear and set up mobile preview mode
  const presentationRootObserver = new MutationObserver((mutations) => {
    // Don't run while presenting - we have different handling for that
    if (isPresenting()) {
      previewModeSetup = false; // Reset so we can set up again after exiting
      return;
    }

    // Check for slides directly - don't rely on presentation-root ID
    const slides = document.querySelectorAll('.slide');
    const hasSlides = slides.length > 0;

    if (isMobile() && hasSlides && !previewModeSetup) {
      console.log('[Touch Gestures] MutationObserver detected slides:', slides.length);
      // Debounce to avoid running multiple times
      if (previewModeSetupTimeout) clearTimeout(previewModeSetupTimeout);
      previewModeSetupTimeout = setTimeout(() => {
        if (!isPresenting()) {
          setupMobilePreviewMode();
          previewModeSetup = true;
        }
      }, 300);
    }
  });

  // Start observing for presentation-root
  presentationRootObserver.observe(document.body, { childList: true, subtree: true });

  // Helper to find presentation container (may not have id="presentation-root")
  function findPresentationContainer() {
    // First try by ID
    let container = document.getElementById('presentation-root');
    if (container) return container;

    // Fall back to finding container by structure - look for div containing .slide elements
    const slides = document.querySelectorAll('.slide');
    if (slides.length > 0) {
      // Get the common parent that contains all slides
      const firstSlide = slides[0];
      // The presentation container is typically 2-3 levels up from the slide
      let parent = firstSlide.parentElement;
      while (parent && parent !== document.body) {
        // Check if this parent has presentation-like structure
        if (parent.classList.contains('cursor-grab') ||
            (parent.classList.contains('overflow-hidden') && parent.classList.contains('h-screen')) ||
            parent.style.background?.includes('gradient')) {
          console.log('[Touch Gestures] Found presentation container by structure');
          return parent;
        }
        parent = parent.parentElement;
      }
      // If no specific container found, return the closest ancestor with overflow-hidden
      let slideParent = firstSlide.parentElement;
      while (slideParent && slideParent !== document.body) {
        if (slideParent.classList.contains('overflow-hidden')) {
          return slideParent;
        }
        slideParent = slideParent.parentElement;
      }
      return firstSlide.parentElement?.parentElement || firstSlide.parentElement;
    }
    return null;
  }

  // Poll for presentation slides since React renders asynchronously
  function checkForPresentationRoot() {
    // Look for slides directly - don't rely on #presentation-root existing
    const slides = document.querySelectorAll('.slide');
    const presentationContainer = findPresentationContainer();
    const presenting = isPresenting();
    const mobile = isMobile();

    console.log('[Touch Gestures] Poll check:', {
      hasContainer: !!presentationContainer,
      slideCount: slides.length,
      previewModeSetup,
      isPresenting: presenting,
      isMobile: mobile
    });

    // If presenting on mobile, make sure we have mobile presentation setup
    if (presenting && mobile) {
      console.log('[Touch Gestures] Mobile presentation mode detected');
      // Ensure mobile presentation is properly set up
      if (slides.length > 0) {
        setupMobilePresentation();
      }
      return;
    }

    if (previewModeSetup || presenting) return;

    if (mobile && slides.length > 0) {
      console.log('[Touch Gestures] Poll detected slides - setting up preview mode');
      setupMobilePreviewMode();
      previewModeSetup = true;
    } else if (mobile) {
      // Keep polling until we find it or 10 seconds pass
      setTimeout(checkForPresentationRoot, 500);
    }
  }

  // Start polling
  setTimeout(checkForPresentationRoot, 500);

  // Expose functions globally
  window.initPresentationTouchGestures = initTouchGestures;
  window.toggleMobileSpeakerNotes = toggleSpeakerNotes;
  window.setupMobilePreviewMode = setupMobilePreviewMode;
})();
