// React presentation component
// Using global React and ReactDOM instead of imports
const React = window.React;
const ReactDOM = window.ReactDOM;
const { useState, useRef, useEffect, useLayoutEffect, useCallback } = React;
const contentSecurity = window.NightOwlContentSecurity;

const sanitizeRenderedHTML = (html) => {
  if (contentSecurity?.sanitizeRenderedHTML) {
    return contentSecurity.sanitizeRenderedHTML(html, {
      baseDir: window.currentFileDirectory || window.appSettings?.workingDirectory
    });
  }
  return String(html || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
};

const setSanitizedHTML = (element, html) => {
  if (!element) return '';
  if (contentSecurity?.setSanitizedHTML) {
    return contentSecurity.setSanitizedHTML(element, html, {
      baseDir: window.currentFileDirectory || window.appSettings?.workingDirectory
    });
  }
  element.textContent = String(html || '');
  return element.textContent;
};

// Lucide React icons as simple SVG components
const ChevronLeft = () => (
  <svg aria-hidden="true" focusable="false" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="15,18 9,12 15,6"></polyline>
  </svg>
);

const ChevronRight = () => (
  <svg aria-hidden="true" focusable="false" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="9,18 15,12 9,6"></polyline>
  </svg>
);

const Upload = () => (
  <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    <polyline points="7,10 12,15 17,10"></polyline>
    <line x1="12" y1="15" x2="12" y2="3"></line>
  </svg>
);

const ZoomIn = () => (
  <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8"></circle>
    <path d="m21 21-4.35-4.35"></path>
    <line x1="11" y1="8" x2="11" y2="14"></line>
    <line x1="8" y1="11" x2="14" y2="11"></line>
  </svg>
);

const ZoomOut = () => (
  <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8"></circle>
    <path d="m21 21-4.35-4.35"></path>
    <line x1="8" y1="11" x2="14" y2="11"></line>
  </svg>
);

const presentationViewport = window.NightOwlPresentationViewport;
const SLIDE_WIDTH = presentationViewport?.SLIDE_WIDTH || 864;
const SLIDE_HEIGHT = presentationViewport?.SLIDE_HEIGHT || 486;
const SLIDE_HALF_WIDTH = SLIDE_WIDTH / 2;
const SLIDE_HALF_HEIGHT = SLIDE_HEIGHT / 2;
const SLIDE_SPACING = SLIDE_WIDTH + 240;

const PresentationSlideContent = ({ html, isPresenting }) => {
  const frameRef = useRef(null);
  const contentRef = useRef(null);
  const [contentScale, setContentScale] = useState(1);
  const sanitizedHtml = sanitizeRenderedHTML(html);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const element = contentRef.current;
    if (!frame || !element) return undefined;
    const slideElement = element.closest('.slide');
    let animationFrame = null;

    const measure = () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        animationFrame = null;
        const availableWidth = Math.min(frame.clientWidth, element.clientWidth);
        const availableHeight = Math.min(frame.clientHeight, element.clientHeight);
        const descendants = Array.from(element.querySelectorAll('*'));
        const contentWidth = descendants.reduce(
          (maximum, child) => Math.max(maximum, child.scrollWidth || 0),
          Math.max(availableWidth, element.scrollWidth)
        );
        const contentHeight = descendants.reduce(
          (maximum, child) => Math.max(maximum, (child.offsetTop || 0) + (child.scrollHeight || 0)),
          Math.max(availableHeight, element.scrollHeight)
        );
        const nextScale = presentationViewport?.calculateContentScale?.({
          availableWidth,
          availableHeight,
          contentWidth,
          contentHeight
        }) ?? 1;
        const overflows = nextScale < 0.999;

        if (slideElement) {
          slideElement.dataset.contentOverflow = overflows ? 'true' : 'false';
        }
        setContentScale(previous => Math.abs(previous - nextScale) > 0.001 ? nextScale : previous);
      });
    };

    measure();
    const resizeObserver = typeof ResizeObserver === 'function'
      ? new ResizeObserver(measure)
      : null;
    resizeObserver?.observe(frame);
    resizeObserver?.observe(element);
    const mutationObserver = new MutationObserver(measure);
    mutationObserver.observe(element, { childList: true, subtree: true, characterData: true });
    element.querySelectorAll('img').forEach(image => image.addEventListener('load', measure));
    window.addEventListener('resize', measure);

    return () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      mutationObserver.disconnect();
      element.querySelectorAll('img').forEach(image => image.removeEventListener('load', measure));
      window.removeEventListener('resize', measure);
      if (slideElement) delete slideElement.dataset.contentOverflow;
    };
  }, [sanitizedHtml, isPresenting]);

  return (
    <div
      ref={frameRef}
      className="slide-content-frame"
      style={{ height: '100%', width: '100%', overflow: 'hidden' }}
    >
      <div
        ref={contentRef}
        className={`slide-content ${isPresenting ? 'slide-content-delivery' : 'slide-content-authoring'}`}
        data-content-scale={contentScale.toFixed(4)}
        style={{
          height: '100%',
          width: '100%',
          transform: isPresenting ? `scale(${contentScale})` : 'none',
          transformOrigin: 'top left'
        }}
        onClick={(event) => window.handleInternalLinkClick?.(event)}
        dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
      />
    </div>
  );
};

const Home = () => (
  <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
    <polyline points="9,22 9,12 15,12 15,22"></polyline>
  </svg>
);

const Play = () => (
  <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="5,3 19,12 5,21"></polygon>
  </svg>
);

const StickyNote = () => (
  <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 3v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V3z"></path>
    <path d="M8 7h8"></path>
    <path d="M8 11h8"></path>
    <path d="M8 15h5"></path>
  </svg>
);

const Eye = () => (
  <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
    <circle cx="12" cy="12" r="3"></circle>
  </svg>
);

const EyeOff = () => (
  <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"></path>
    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 11 8 11 8a13.16 13.16 0 0 1-1.67 2.68"></path>
    <path d="M6.61 6.61A13.526 13.526 0 0 0 1 12s4 8 11 8a9.74 9.74 0 0 0 5.39-1.61"></path>
    <line x1="2" y1="2" x2="22" y2="22"></line>
  </svg>
);

const Speaker = () => (
  <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
  </svg>
);

const SpeakerOff = () => (
  <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
    <line x1="23" y1="1" x2="1" y2="23"></line>
  </svg>
);

const LoadingSpinner = () => (
  <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin" style={{ display: 'inline-block' }}>
    <circle cx="12" cy="12" r="10" strokeOpacity="0.25"></circle>
    <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"></path>
  </svg>
);

const RecordIcon = () => (
  <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10"></circle>
  </svg>
);

const StopIcon = () => (
  <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2">
    <rect x="6" y="6" width="12" height="12"></rect>
  </svg>
);

const PauseIcon = () => (
  <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="6" y="4" width="4" height="16"></rect>
    <rect x="14" y="4" width="4" height="16"></rect>
  </svg>
);

const MarkdownPreziApp = ({ markdown = '', onPresentationError = null } = {}) => {
  console.log('[Presentation] *** COMPONENT LOADING ***');

  // Set up the global handler immediately, not in useEffect
  if (!window.handleInternalLinkClick) {
    window.handleInternalLinkClick = function(event) {
      const linkElement = event.target?.closest?.('.internal-link');
      console.log('[Internal Link] *** CLICK DETECTED *** Global handler called:', {
        target: linkElement || event.target,
        tagName: linkElement?.tagName,
        className: linkElement?.className,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        hasInternalLinkClass: Boolean(linkElement)
      });

      // Check if this is a click on an internal link with Cmd/Ctrl modifier
      if ((event.metaKey || event.ctrlKey) && linkElement) {
        console.log('[Internal Link] *** CMD/CTRL+CLICK DETECTED ***');
        event.preventDefault();
        event.stopPropagation();

        const linkPath = linkElement.getAttribute('data-link');
        if (linkPath) {
          const decodedPath = decodeURIComponent(linkPath);
          console.log('[Internal Link] Opening:', decodedPath);

          // Use the existing window API to open the file
          if (window.openFile) {
            console.log('[Internal Link] Using window.openFile');
            window.openFile(decodedPath);
          } else if (window.electronAPI?.files?.openFile) {
            // Fallback for Electron API
            console.log('[Internal Link] Using electronAPI');
            window.electronAPI.files.openFile(decodedPath);
          } else {
            console.warn('[Internal Link] No file opening API available');
          }
        } else {
          console.warn('[Internal Link] No data-link attribute found');
        }
      } else if (linkElement) {
        // Regular click on internal link - prevent default but don't open
        console.log('[Internal Link] Regular click on internal link - preventing default');
        event.preventDefault();
      }
    };
    console.log('[Internal Link] *** GLOBAL HANDLER SET UP ***');
  }

  // Check if running in Electron
  const isElectron = window.electronAPI && window.electronAPI.isElectron;
  
  // React component rendering
  const [slides, setSlides] = useState([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isZooming, setIsZooming] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [isPresenting, setIsPresenting] = useState(false);
  const [layoutType, setLayoutType] = useState('spiral');
  const [focusedSlide, setFocusedSlide] = useState(null);
  const [speakerNotesVisible, setSpeakerNotesVisible] = useState(true);
  const [speakerNotesWindowVisible, setSpeakerNotesWindowVisible] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoadingTTS, setIsLoadingTTS] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState('sarah'); // Default voice
  const ttsStateRef = useRef({ 
    isAdvancing: false,
    currentSpeakingSlide: -1 
  });
  const MIN_ZOOM = 0.1;
  const MAX_ZOOM = 3;
  
  // Video recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingTimerRef = useRef(null);
  
  // Current slides and slide index state
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const stageRef = useRef(null);
  const presentationControlsRef = useRef(null);
  const navigationControlsRef = useRef(null);
  const previousFocusRef = useRef(null);
  const zoomInteractionTimeoutRef = useRef(null);
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  const [presentationInsets, setPresentationInsets] = useState({ top: 16, right: 16, bottom: 16, left: 16 });
  const [presentationFit, setPresentationFit] = useState({ scale: 1, pan: { x: 0, y: 0 } });
  const [presentationFitReady, setPresentationFitReady] = useState(false);

  // Sample markdown content for demo
  const sampleMarkdown = `# SAMPLE CONTENT TEST
This is sample content to test speaker notes.

\`\`\`notes
🔴 SAMPLE SPEAKER NOTES: If you can see this, the speaker notes parsing is working correctly!

This is a test of the speaker notes functionality in presentation mode.
\`\`\`

---

## What is This?
- Advanced Markdown editor with AI assistance
- Interactive presentation capabilities
- Integrated file management
- Philosophical content support

\`\`\`notes
Explain each bullet point briefly:

1. Advanced editor - mention Monaco editor, syntax highlighting
2. Presentation capabilities - this is what they're seeing now!
3. File management - integrated file tree, folder operations
4. Philosophical content - specifically designed for philosophy education

Ask if anyone has questions about the core features before moving on.
\`\`\`

---

## Key Features
### Editor Mode
- Monaco editor with syntax highlighting
- Real-time preview
- AI chat integration
- Document structure navigation

### Presentation Mode
- Zoomable presentation canvas
- Multiple layout types
- Smooth transitions
- Interactive navigation

\`\`\`notes
Demonstrate the dual modes:

Editor Mode:
- Show how the editor looks
- Mention real-time preview
- AI chat for philosophical discussions

Presentation Mode:
- This is what we're in right now
- Mention zoom capabilities (demonstrate if needed)
- Different layouts available (spiral, grid, linear, circle)

Transition: "Now let's talk about the philosophical foundation..."
\`\`\`

---

## Philosophical Focus
### Hegelian Dialectic
- **Thesis**: Initial position or concept
- **Antithesis**: Negation or contradiction
- **Synthesis**: Higher unity transcending both

### AI & Pedagogy
Integration of artificial intelligence with philosophical education.

\`\`\`notes
This is the core philosophical concept we're exploring:

Hegelian Dialectic explanation:
- Thesis: Starting point, initial idea
- Antithesis: Opposition, contradiction, challenge
- Synthesis: Resolution that preserves and transcends both

Give a concrete example if time permits - maybe democracy/authoritarianism -> constitutional democracy.

AI & Pedagogy:
- Not replacing human instruction
- Augmenting and enhancing learning
- Helping students explore complex philosophical concepts
\`\`\`

---

## Getting Started
1. Switch between Editor and Presentation views
2. Load your Markdown files
3. Use AI chat for assistance
4. Create engaging presentations
5. Explore philosophical concepts

\`\`\`notes
Practical steps for new users:

1. Mode switching - use the buttons at the top
2. File loading - integrated file system
3. AI assistance - context-aware help for philosophical concepts
4. Presentations - what they're experiencing now
5. Exploration - encourage experimentation

Remind them that speaker notes like these are available in presentation mode!

Next: Thank them and open for questions.
\`\`\`

---

## Thank You!
Welcome to the future of philosophical education.

*Happy learning and presenting!*

\`\`\`notes
Closing remarks:

- Thank the audience for their attention
- Emphasize the innovative nature of combining AI with philosophy
- Invite questions and discussion
- Mention that this is just the beginning

End with: "Are there any questions about the platform or its philosophical applications?"

Note: You can press 'N' to toggle these speaker notes on/off during presentation.
\`\`\``;

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  useLayoutEffect(() => {
    if (!isPresenting) {
      setPresentationInsets({ top: 0, right: 0, bottom: 0, left: 0 });
      return undefined;
    }

    const notesPanel = document.getElementById('speaker-notes-panel');
    const observedElements = [containerRef.current, presentationControlsRef.current, navigationControlsRef.current, notesPanel]
      .filter(Boolean);
    let animationFrame = null;

    const measureChrome = () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        animationFrame = null;
        const controlsHeight = presentationControlsRef.current?.getBoundingClientRect?.().height || 0;
        const navigationHeight = navigationControlsRef.current?.getBoundingClientRect?.().height || 0;
        const notesStyle = notesPanel ? window.getComputedStyle(notesPanel) : null;
        const notesHeight = notesPanel && notesStyle?.display !== 'none' && notesStyle?.visibility !== 'hidden'
          ? notesPanel.getBoundingClientRect().height
          : 0;
        const next = {
          top: controlsHeight > 0 ? controlsHeight + 28 : 16,
          right: 16,
          bottom: Math.max(navigationHeight > 0 ? navigationHeight + 28 : 16, notesHeight > 0 ? notesHeight + 12 : 0),
          left: 16
        };
        setPresentationInsets(previous => (
          previous.top === next.top &&
          previous.right === next.right &&
          previous.bottom === next.bottom &&
          previous.left === next.left
        ) ? previous : next);
      });
    };

    measureChrome();
    const resizeObserver = typeof ResizeObserver === 'function'
      ? new ResizeObserver(measureChrome)
      : null;
    observedElements.forEach(element => resizeObserver?.observe(element));
    const mutationObserver = new MutationObserver(measureChrome);
    mutationObserver.observe(document.body, { attributes: true, attributeFilter: ['class'], childList: true });
    if (notesPanel) {
      mutationObserver.observe(notesPanel, { attributes: true, attributeFilter: ['class', 'style'] });
    }
    window.addEventListener('resize', measureChrome);

    return () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener('resize', measureChrome);
    };
  }, [isPresenting, speakerNotesWindowVisible]);

  useLayoutEffect(() => {
    if (!isPresenting || slides.length === 0) {
      setPresentationFitReady(false);
      return undefined;
    }
    const stage = stageRef.current;
    const slide = slides[currentSlide];
    if (!stage || !slide) return undefined;
    let animationFrame = null;
    let readyFrame = null;
    let readinessToken = null;

    const updateFit = () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      if (readyFrame) cancelAnimationFrame(readyFrame);
      window.NightOwlPerformance?.readiness?.cancel(readinessToken, { reason: 'presentation-fit-recalculated' });
      readinessToken = window.NightOwlPerformance?.readiness?.begin('presentation-fit', {
        slideIndex: currentSlide,
        viewportWidth: stage.clientWidth,
        viewportHeight: stage.clientHeight
      }) || null;
      setPresentationFitReady(false);
      animationFrame = requestAnimationFrame(() => {
        animationFrame = null;
        if (!stage.clientWidth || !stage.clientHeight) return;
        const next = presentationViewport?.calculateFitTransform?.({
          viewportWidth: stage.clientWidth,
          viewportHeight: stage.clientHeight,
          slideX: slide.position.x,
          slideY: slide.position.y,
          slideWidth: SLIDE_WIDTH,
          slideHeight: SLIDE_HEIGHT,
          padding: 12
        });
        if (!next) return;
        setPresentationFit(previous => (
          Math.abs(previous.scale - next.scale) < 0.0001 &&
          Math.abs(previous.pan.x - next.pan.x) < 0.1 &&
          Math.abs(previous.pan.y - next.pan.y) < 0.1
        ) ? previous : { scale: next.scale, pan: next.pan });
        readyFrame = requestAnimationFrame(() => {
          readyFrame = null;
          setPresentationFitReady(true);
          window.NightOwlPerformance?.readiness?.complete(readinessToken, {
            scale: next.scale,
            slideIndex: currentSlide
          });
          readinessToken = null;
        });
      });
    };

    updateFit();
    const resizeObserver = typeof ResizeObserver === 'function'
      ? new ResizeObserver(updateFit)
      : null;
    resizeObserver?.observe(stage);
    window.addEventListener('resize', updateFit);

    return () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      if (readyFrame) cancelAnimationFrame(readyFrame);
      window.NightOwlPerformance?.readiness?.cancel(readinessToken, { reason: 'presentation-fit-unmounted' });
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateFit);
    };
  }, [isPresenting, slides, currentSlide, presentationInsets]);

  const markZoomInteraction = useCallback(() => {
    setIsZooming(true);
    if (zoomInteractionTimeoutRef.current) {
      clearTimeout(zoomInteractionTimeoutRef.current);
    }
    zoomInteractionTimeoutRef.current = setTimeout(() => {
      setIsZooming(false);
    }, 180);
  }, []);

  useEffect(() => {
    return () => {
      if (zoomInteractionTimeoutRef.current) {
        clearTimeout(zoomInteractionTimeoutRef.current);
      }
    };
  }, []);

  // Calculate slide positioning based on layout type
  const calculateSlidePosition = (index, total) => {
    const spacing = SLIDE_SPACING;
    
    switch (layoutType) {
      case 'linear':
        return { x: index * spacing, y: 0 };
        
      case 'grid':
        const cols = Math.ceil(Math.sqrt(total));
        const gridRow = Math.floor(index / cols);
        const col = index % cols;
        return { x: col * spacing, y: gridRow * spacing };
        
      case 'circle':
        const circleAngle = (index / total) * 2 * Math.PI - Math.PI / 2;
        const circleRadius = spacing * 0.6;
        return {
          x: Math.cos(circleAngle) * circleRadius,
          y: Math.sin(circleAngle) * circleRadius
        };
        
      case 'spiral':
        if (index === 0) return { x: 0, y: 0 };
        const spiralAngle = (index / total) * 4 * Math.PI;
        const spiralRadius = (SLIDE_HALF_WIDTH * 0.75) + (index * (SLIDE_HALF_WIDTH * 0.6));
        return {
          x: Math.cos(spiralAngle) * spiralRadius,
          y: Math.sin(spiralAngle) * spiralRadius
        };
        
      case 'tree':
        if (index === 0) return { x: 0, y: 0 };
        const level = Math.floor(Math.log2(index + 1));
        const posInLevel = index - (Math.pow(2, level) - 1);
        const maxInLevel = Math.pow(2, level);
        const branchWidth = spacing * maxInLevel;
        return {
          x: (posInLevel - maxInLevel / 2 + 0.5) * (branchWidth / maxInLevel),
          y: level * spacing
        };
        
      case 'zigzag':
        const zigzagRow = Math.floor(index / 3);
        const zigzagCol = index % 3;
        const isEvenRow = zigzagRow % 2 === 0;
        return {
          x: isEvenRow ? zigzagCol * spacing : (2 - zigzagCol) * spacing,
          y: zigzagRow * spacing
        };
        
      default:
        return { x: 0, y: 0 };
    }
  };

  // Process nested lists properly
  const processNestedLists = (html) => {
    const lines = html.split('\n');
    const processedLines = [];
    let inListMode = false;
    let currentListHtml = '';

    // First, extract just the list portions and process them
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // Check if this is a list item
      const isListItem = /^(\s*)[-*+]\s+(.+)$/.test(line) || /^(\s*)(\d+)\.\s+(.+)$/.test(line);

      if (isListItem) {
        if (!inListMode) {
          inListMode = true;
          currentListHtml = '';
        }
        currentListHtml += line + '\n';
      } else {
        if (inListMode && trimmedLine === '') {
          // Allow blank lines within a list without breaking numbering
          currentListHtml += '\n';
          continue;
        }
        // End of list section
        if (inListMode) {
          // Process the accumulated list HTML
          processedLines.push(processListSection(currentListHtml.trim()));
          inListMode = false;
          currentListHtml = '';
        }

        // Add non-list line as is
        if (trimmedLine) {
          processedLines.push(line);
        }
      }
    }

    // Handle any remaining list at end of content
    if (inListMode && currentListHtml.trim()) {
      processedLines.push(processListSection(currentListHtml.trim()));
    }

    return processedLines.join('\n');
  };

  // Process a section of list items into proper nested HTML
  const processListSection = (listMarkdown) => {
    // Prefer the full Marked parser to preserve correct nesting semantics
    if (window.marked && typeof window.marked.parse === 'function') {
      try {
        let parsedHtml = window.marked.parse(listMarkdown, { breaks: false });
        // Normalize spacing and add our presentation-specific classes
        parsedHtml = parsedHtml
          .replace(/<ul>/g, '<ul class="markdown-list">')
          .replace(/<ol>/g, '<ol class="markdown-list markdown-list-ordered">')
          .replace(/<li>/g, '<li class="markdown-list-item">');

        return parsedHtml.trim();
      } catch (error) {
        console.error('[MarkdownParser] Failed to parse list section via marked:', error);
      }
    }

    // Fallback: basic nested list handling (maintained for offline safety)
    const lines = listMarkdown.split('\n');
    const processedLines = [];
    const listStack = [];

    const closeToIndent = (targetIndent) => {
      while (listStack.length > 0 && listStack[listStack.length - 1].indent > targetIndent) {
        processedLines.push('</li>');
        processedLines.push(`</${listStack.pop().type}>`);
      }
    };

    for (const rawLine of lines) {
      if (!rawLine.trim()) continue;

      const unorderedMatch = rawLine.match(/^(\s*)[-*+]\s+(.+)$/);
      const orderedMatch = rawLine.match(/^(\s*)(\d+)\.\s+(.+)$/);
      if (!unorderedMatch && !orderedMatch) continue;

      const indent = (unorderedMatch || orderedMatch)[1].length;
      const content = unorderedMatch ? unorderedMatch[2] : orderedMatch[3];
      const listType = orderedMatch ? 'ol' : 'ul';

      closeToIndent(indent);

      let current = listStack[listStack.length - 1];

      if (!current || current.indent < indent || current.type !== listType) {
        if (current && current.indent === indent && current.type !== listType) {
          processedLines.push('</li>');
          processedLines.push(`</${listStack.pop().type}>`);
          current = listStack[listStack.length - 1];
        }

        processedLines.push(`<${listType} class="markdown-list">`);
        listStack.push({ type: listType, indent });
        current = listStack[listStack.length - 1];
      } else {
        processedLines.push('</li>');
      }

      processedLines.push(`<li class="markdown-list-item">${content}`);
    }

    // Close any remaining open tags
    closeToIndent(-1);
    // Ensure we close the final item and list if any remain open
    while (listStack.length > 0) {
      processedLines.push('</li>');
      processedLines.push(`</${listStack.pop().type}>`);
    }

    return processedLines.join('\n');
  };

  // Primary markdown parser — delegates to the shared marked library when
  // available so that preview and presentation rendering stay in sync.
  // Falls back to the built-in regex parser when marked isn't loaded.
  const parseMarkdownContent = (content) => {
    if (window.marked && typeof window.marked.parse === 'function') {
      try {
        let html = window.marked.parse(content, { breaks: false });

        // Fix image paths — convert relative to file:// URLs
        html = html.replace(/<img\s+src="([^"]+)"/g, (match, src) => {
          if (src && !src.startsWith('http') && !src.startsWith('/') && !src.startsWith('file://') && !src.startsWith('data:')) {
            const baseDir = window.currentFileDirectory || window.appSettings?.workingDirectory;
            if (baseDir) return `<img src="file://${baseDir}/${src}"`;
          }
          return match;
        });

        // Auto-embed YouTube URLs that are sole content of a paragraph
        html = html.replace(
          /<p>\s*(?:<a[^>]*>)?\s*https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]+)(?:[^<\s]*)?\s*(?:<\/a>)?\s*<\/p>/gi,
          (match, videoId) => {
            return `<div class="slide-video-wrapper"><iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
          }
        );

        // Auto-embed Zoom meeting/recording links
        html = html.replace(
          /<p>\s*(?:<a[^>]*>)?\s*(https?:\/\/[\w.-]*zoom\.us\/(?:j|rec\/(?:share|play))\/[^\s<]+)\s*(?:<\/a>)?\s*<\/p>/gi,
          (match, url) => {
            return `<div class="slide-video-wrapper"><iframe src="${url}" frameborder="0" allow="microphone; camera; fullscreen" allowfullscreen sandbox="allow-same-origin allow-scripts allow-forms allow-popups"></iframe></div>`;
          }
        );

        return sanitizeRenderedHTML(html);
      } catch (error) {
        console.warn('[MarkdownParser] marked.parse failed, using fallback:', error);
      }
    }
    return _fallbackParseMarkdown(content);
  };

  // Fallback regex-based markdown parser (used when marked is not available)
  const _fallbackParseMarkdown = (content) => {
    let html = content;
    
    // Handle code blocks first
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>');
    
    // Headers
    html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
    html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
    html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');
    
    // Bold and italic
    html = html.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Fix image paths - convert relative paths to absolute file:// URLs
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, altText, imagePath) => {
      // Check if this is a relative path
      if (imagePath && !imagePath.startsWith('http') && !imagePath.startsWith('/') && !imagePath.startsWith('file://')) {
        // Use current file directory if available, otherwise fallback to working directory
        const baseDir = window.currentFileDirectory || window.appSettings?.workingDirectory;
        if (baseDir) {
          const fullPath = `file://${baseDir}/${imagePath}`;
          console.log(`[React Presentation] Converting image path: ${imagePath} -> ${fullPath}`);
          return `<img src="${fullPath}" alt="${altText}" />`;
        }
      }
      return `<img src="${imagePath}" alt="${altText}" />`;
    });
    
    // YouTube video embeds — bare URL on its own line becomes an iframe
    html = html.replace(
      /^(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]+)(?:[&?][^\s]*)?)$/gm,
      (match, url, videoId) => {
        return `<div class="slide-video-wrapper"><iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
      }
    );

    // Zoom meeting/recording embeds — bare URL on its own line
    html = html.replace(
      /^(https?:\/\/[\w.-]*zoom\.us\/(?:j|rec\/(?:share|play))\/[^\s]+)$/gm,
      (match, url) => {
        return `<div class="slide-video-wrapper"><iframe src="${url}" frameborder="0" allow="microphone; camera; fullscreen" allowfullscreen sandbox="allow-same-origin allow-scripts allow-forms allow-popups"></iframe></div>`;
      }
    );

    // Process math expressions before other markdown to preserve them
    // Note: We preserve LaTeX math syntax for MathJax to process later
    // This ensures math expressions don't get processed as other markdown

    // Store math expressions to protect them from markdown processing
    const mathExpressions = [];
    let mathCounter = 0;

    // Preserve display math ($$...$$)
    html = html.replace(/\$\$([\s\S]*?)\$\$/g, (match) => {
      const placeholder = `MATH_DISPLAY_${mathCounter++}`;
      mathExpressions.push({ placeholder, content: match });
      return placeholder;
    });

    // Preserve inline math ($...$)
    html = html.replace(/\$([^$\n]+?)\$/g, (match) => {
      const placeholder = `MATH_INLINE_${mathCounter++}`;
      mathExpressions.push({ placeholder, content: match });
      return placeholder;
    });

    // Process Obsidian-style [[]] internal links first
    html = html.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (match, link, displayText) => {
      const cleanLink = link.trim();
      const display = displayText ? displayText.trim() : cleanLink;
      let filePath = cleanLink;
      if (!filePath.endsWith('.md') && !filePath.includes('.')) {
        filePath += '.md';
      }

      // Create full path for internal links, similar to image path logic
      if (!filePath.startsWith('/') && !filePath.startsWith('http')) {
        const baseDir = window.currentFileDirectory || window.appSettings?.workingDirectory;
        if (baseDir) {
          filePath = `${baseDir}/${filePath}`;
        }
      }

      return `<a href="#" class="internal-link" data-link="${encodeURIComponent(filePath)}" data-original-link="${encodeURIComponent(cleanLink)}" title="Open ${display}">${display}</a>`;
    });
    
    // Regular markdown links
    html = html.replace(/\[([^\]]+)\]\(([^\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

    // Handle tables - simpler approach
    // First, let's collect all table-related lines
    const lines = html.split('\n');
    const processedLines = [];
    let currentTable = [];
    let inTable = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Check if this is a table row (starts and ends with |)
      if (line.startsWith('|') && line.endsWith('|') && line.includes('|')) {
        // Check if this is a separator row (contains only |, -, and spaces)
        const isSeparator = /^\|[\s\-\|]+\|$/.test(line);

        if (!isSeparator) {
          if (!inTable) {
            inTable = true;
            currentTable = [];
          }

          // Parse the row
          const cells = line.slice(1, -1).split('|').map(cell => cell.trim());

          // Check if next line is a separator to determine if this is header
          const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : '';
          const nextIsSeparator = /^\|[\s\-\|]+\|$/.test(nextLine);
          const isHeader = nextIsSeparator && currentTable.length === 0;

          const cellTag = isHeader ? 'th' : 'td';
          const htmlRow = `<tr>${cells.map(cell => `<${cellTag}>${cell}</${cellTag}>`).join('')}</tr>`;
          currentTable.push(htmlRow);
        }
        // Skip separator rows
      } else {
        // Not a table row
        if (inTable && currentTable.length > 0) {
          // End current table
          processedLines.push(`<table class="presentation-table">${currentTable.join('')}</table>`);
          currentTable = [];
          inTable = false;
        }

        if (line || !inTable) {
          processedLines.push(lines[i]); // Keep original line with spacing
        }
      }
    }

    // Handle table at end of content
    if (inTable && currentTable.length > 0) {
      processedLines.push(`<table class="presentation-table">${currentTable.join('')}</table>`);
    }

    html = processedLines.join('\n');

    // Handle nested lists properly
    console.log('[MarkdownParser] Before list processing:', html.substring(0, 200));
    html = processNestedLists(html);
    console.log('[MarkdownParser] After list processing:', html.substring(0, 400));
    
    // Blockquotes - handle multi-line blockquotes properly
    // First, collect all blockquote lines and group them
    const blockquoteLines_raw = html.split('\n');
    let inBlockquote = false;
    let blockquoteLines = [];
    const blockquoteProcessedLines = [];
    
    for (let i = 0; i < blockquoteLines_raw.length; i++) {
      const line = blockquoteLines_raw[i];
      const blockquoteMatch = line.match(/^>\s*(.*)/);
      
      if (blockquoteMatch) {
        // This is a blockquote line
        if (!inBlockquote) {
          inBlockquote = true;
          blockquoteLines = [];
        }
        blockquoteLines.push(blockquoteMatch[1]); // Content after '> '
      } else {
        // Not a blockquote line
        if (inBlockquote) {
          // End of blockquote, process accumulated lines
          const blockquoteContent = blockquoteLines.join('<br>').trim();
          blockquoteProcessedLines.push(`<blockquote class="presentation-blockquote">${blockquoteContent}</blockquote>`);
          inBlockquote = false;
          blockquoteLines = [];
        }
        blockquoteProcessedLines.push(line);
      }
    }
    
    // Handle case where blockquote is at the end of content
    if (inBlockquote && blockquoteLines.length > 0) {
      const blockquoteContent = blockquoteLines.join('<br>').trim();
      blockquoteProcessedLines.push(`<blockquote class="presentation-blockquote">${blockquoteContent}</blockquote>`);
    }

    html = blockquoteProcessedLines.join('\n');
    
    // Horizontal rules
    html = html.replace(/^---\s*$/gm, '<hr>');
    
    // Convert remaining text to paragraphs
    const paragraphLines = html.split('\n');
    const finalProcessedLines = paragraphLines.map(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.match(/^<(h[1-6]|ul|ol|li|blockquote|pre|hr|div)/)) {
        return line;
      }
      return trimmed ? `<p>${trimmed}</p>` : '';
    });
    
    html = finalProcessedLines.join('\n');
    html = html.replace(/\n+/g, '\n');
    html = html.replace(/<p>\s*<\/p>/g, '');

    // Restore math expressions
    mathExpressions.forEach(({ placeholder, content }) => {
      html = html.replace(placeholder, content);
    });

    return sanitizeRenderedHTML(html);
  };

  // Extract speaker notes from slide content
  const extractSpeakerNotes = (slideContent) => {
    // Extracting speaker notes
    
    // More flexible regex pattern for speaker notes
    const notesRegex = /```notes\s*\n([\s\S]*?)\n```/g;
    const notes = [];
    let match;
    
    while ((match = notesRegex.exec(slideContent)) !== null) {
      const noteContent = match[1].trim();
      // Found speaker note
      notes.push(noteContent);
    }
    
    // Remove speaker notes from slide content (more flexible pattern)
    const cleanContent = slideContent.replace(/```notes\s*\n[\s\S]*?\n```/g, '').trim();
    
    const result = { 
      cleanContent, 
      speakerNotes: notes.join('\n\n') 
    };
    
    // Speaker notes extraction complete
    return result;
  };

  // Extract slide directives (e.g., background image) from HTML comments
  const extractSlideDirectives = (slideContent) => {
    const bgRegex = /<!--\s*bg:\s*(.+?)\s*-->/i;
    const match = bgRegex.exec(slideContent);
    let backgroundImage = null;

    if (match) {
      const imagePath = match[1].trim();
      const baseDir = window.currentFileDirectory || window.appSettings?.workingDirectory;
      backgroundImage = contentSecurity?.resolveImageUrl
        ? contentSecurity.resolveImageUrl(imagePath, baseDir)
        : null;
    }

    // Remove bg directive and all remaining HTML comments from visible content
    const cleanContent = slideContent
      .replace(/<!--\s*bg:\s*.+?\s*-->\s*/gi, '')
      .replace(/<!--[\s\S]*?-->\s*/g, '')
      .trim();
    return { cleanContent, backgroundImage };
  };

  // Parse markdown into slides
  const parseMarkdown = (markdown) => {
    try {
      // Strip trailing whitespace from the entire markdown content first
      const trimmedMarkdown = markdown.replace(/[ \t]+$/gm, '');

      // Split content by slide separators (--- on standalone lines)
      // Match --- with optional trailing whitespace that is either at start/end of string or surrounded by newlines
      const slideSeparatorRegex = /(?:^|\n)---[ \t]*(?:\n|$)/;
      const slideTexts = trimmedMarkdown.split(slideSeparatorRegex).map(slide => slide.trim()).filter(slide => slide);
      return slideTexts.map((text, index) => {
        const { cleanContent: afterNotes, speakerNotes } = extractSpeakerNotes(text);
        const { cleanContent, backgroundImage } = extractSlideDirectives(afterNotes);
        return {
          id: index,
          content: text,
          cleanContent: cleanContent,
          speakerNotes: speakerNotes,
          backgroundImage: backgroundImage,
          position: calculateSlidePosition(index, slideTexts.length),
          parsed: parseMarkdownContent(cleanContent)
        };
      });
    } catch (error) {
      console.error('[Presentation] Failed to parse slide content:', error);
      if (typeof onPresentationError === 'function') {
        onPresentationError(error);
      }
      return [];
    }
  };

  // Initialize - wait for content from editor or use sample as fallback
  useEffect(() => {
    // Initializing presentation component
    
    // Brief delay to allow content synchronization from editor
    const initTimeout = setTimeout(() => {
      // Prefer the mount prop so a newly mounted component receives the current
      // document exactly once. The pending global remains a compatibility path
      // for older callers that do not supply a prop.
      const initialContent = markdown || window.pendingPresentationContent || sampleMarkdown;
      setSlides(parseMarkdown(initialContent));
      window.pendingPresentationContent = null;
    }, 100); // Small delay to allow content synchronization
    
    return () => clearTimeout(initTimeout);
  }, []);

  // Navigate to specific slide with smooth transition
  const goToSlide = useCallback((slideIndex, _retries = 0) => {
    if (slideIndex < 0 || slideIndex >= slides.length) return;

    const MAX_RETRIES = 20;
    const slide = slides[slideIndex];
    const canvas = canvasRef.current;
    if (!canvas) {
      if (_retries < MAX_RETRIES) {
        setTimeout(() => goToSlide(slideIndex, _retries + 1), 50);
      }
      return;
    }

    // Ensure canvas has proper dimensions
    if (canvas.clientWidth === 0 || canvas.clientHeight === 0) {
      if (_retries < MAX_RETRIES) {
        setTimeout(() => goToSlide(slideIndex, _retries + 1), 50);
      }
      return;
    }

    if (!isPresenting) {
      const targetZoom = 1.2;
      const targetPan = computeCenteredPan(slide, targetZoom, panRef.current);
      console.log('[Presentation] Centering slide', slideIndex, 'at position:', targetPan);
      markZoomInteraction();
      zoomRef.current = targetZoom;
      panRef.current = targetPan;
      setZoom(targetZoom);
      setPan(targetPan);
    }
    setCurrentSlide(slideIndex);
    setFocusedSlide(null);
    
    // Mark slide transition in recording if recording is active
    if (isRecording && window.videoRecordingService) {
      const slideTitle = slides[slideIndex]?.content.split('\n')[0] || `Slide ${slideIndex + 1}`;
      window.videoRecordingService.markSlideTransition(slideIndex + 1, slideTitle);
      console.log('[VIDEO] Marked slide transition:', slideIndex + 1, slideTitle);
    }
    
    // Ensure speaker notes are updated immediately when slide changes
    // This is especially important on second presentation load
    if (isPresenting && window.updateSpeakerNotes && typeof window.updateSpeakerNotes === 'function' && slides.length > 0) {
      const currentContent = slides.map(slide => slide.content).join('\n\n---\n\n');
      // Use setTimeout to ensure state update completes first
      setTimeout(() => {
        window.updateSpeakerNotes(slideIndex, currentContent);
      }, 50);
    }
  }, [slides, isPresenting, isRecording, markZoomInteraction]);

  // Center on first slide when presentation view becomes active
  useEffect(() => {
    const checkIfPresentationActive = () => {
      const presentationContent = document.getElementById('presentation-content');
      if (presentationContent && presentationContent.classList.contains('active')) {
        // Presentation view is now active, center on first slide if we haven't moved yet
        if (slides.length > 0 && pan.x === 0 && pan.y === 0 && zoom === 1) {
          console.log('[Presentation] Presentation view activated, centering on first slide');
          setTimeout(() => {
            if (canvasRef.current && canvasRef.current.clientWidth > 0) {
              goToSlide(0);
            }
          }, 150); // Slightly longer delay to ensure view is fully active
        }
      }
    };

    // Set up a mutation observer to watch for class changes on the presentation content
    const presentationContent = document.getElementById('presentation-content');
    if (presentationContent) {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
            checkIfPresentationActive();
          }
        });
      });

      observer.observe(presentationContent, {
        attributes: true,
        attributeFilter: ['class']
      });

      // Also check immediately in case it's already active
      checkIfPresentationActive();

      return () => observer.disconnect();
    }
  }, [slides.length, pan.x, pan.y, zoom, goToSlide]);

  // Listen for content updates from the lecture summary generator
  useEffect(() => {
    const handleContentUpdate = (event) => {
      // Received content update event
      const newContent = event.detail?.content;
      
      if (newContent && newContent.trim()) {
        // Parsing new content into slides
        const newSlides = parseMarkdown(newContent);
        
        setSlides(newSlides);
        setCurrentSlide(0);
        zoomRef.current = 1;
        panRef.current = { x: 0, y: 0 };
        setZoom(1);
        setPan({ x: 0, y: 0 });
        setFocusedSlide(null);
        
        // Center first slide after state updates
        setTimeout(() => {
          if (canvasRef.current && newSlides.length > 0) {
            console.log('[Presentation] Centering first slide after content update');
            goToSlide(0);
          }
        }, 50);
        // Successfully updated slides
      } else {
        console.warn('[React Presentation] No valid content received');
      }
    };

    // Setting up content update listener
    window.addEventListener('updatePresentationContent', handleContentUpdate);
    return () => {
      // Removing content update listener
      window.removeEventListener('updatePresentationContent', handleContentUpdate);
    };
  }, []);

  useEffect(() => {
    if (slides.length === 0) return;
    window.dispatchEvent(new CustomEvent('nightowl:presentation-content-ready', {
      detail: { slides: slides.length }
    }));
  }, [slides]);

  // Set up Electron API listeners (only once)
  useEffect(() => {
    const unsubscribers = [];
    if (isElectron && window.electronAPI?.events) {
      // File loading
      unsubscribers.push(window.electronAPI.events.loadPresentationFile((content, filePath, error) => {
        if (error) {
          console.error('Error loading file:', error);
          return;
        }
        if (content) {
          const newSlides = parseMarkdown(content);
          setSlides(newSlides);
          setCurrentSlide(0);
          // Ensure canvas is ready before centering first slide
          setTimeout(() => {
            if (canvasRef.current && newSlides.length > 0) {
              console.log('[Presentation] Centering first slide on presentation start');
              goToSlide(0);
            }
          }, 100); // Give more time for canvas to be ready
        }
      }));

      // Presentation controls
      unsubscribers.push(window.electronAPI.events.startPresentation(() => {
        setIsPresenting(true);
      }));

      unsubscribers.push(window.electronAPI.events.exitPresentation(() => {
        console.log('[PRESENTATION] External exit presentation triggered...');
        
        // Stop TTS audio
        stopSpeaking();
        
        // Stop video recording if active
        if (isRecording && window.videoRecordingService) {
          console.log('[VIDEO] Stopping recording on external exit');
          stopRecording();
        }
        
        setIsPresenting(false);
      }));

      unsubscribers.push(window.electronAPI.events.togglePresentationMode(() => {
        // Switch to presentation mode
        switchToMode('presentation');
      }));

      // Auto-generate and show statistics
      unsubscribers.push(window.electronAPI.events.showPresentationStatistics(() => {
        console.log('[PRESENTATION] Auto-generating and showing statistics');
        // Auto-switch to statistics view and display immediately
        if (window.switchStructureView) {
          window.switchStructureView('statistics');
        }
      }));

      // Zoom controls
      unsubscribers.push(window.electronAPI.events.zoomIn(() => {
        handleZoomIn();
      }));

      unsubscribers.push(window.electronAPI.events.zoomOut(() => {
        handleZoomOut();
      }));

      unsubscribers.push(window.electronAPI.events.resetZoom(() => {
        resetView();
      }));

      // Layout changes
      unsubscribers.push(window.electronAPI.events.changeLayout((layout) => {
        setLayoutType(layout);
      }));
    }

    return () => {
      unsubscribers.forEach(unsubscribe => unsubscribe?.());
    };
  }, []);

  // Reset the legacy navigation flag without disturbing listeners owned by
  // other renderer features.
  useEffect(() => {
    window.navigationListenersSetup = false;
  }, []); // Run once on mount

  // Recalculate positions when layout changes
  useEffect(() => {
    if (slides.length > 0) {
      const updatedSlides = slides.map((slide, index) => ({
        ...slide,
        position: calculateSlidePosition(index, slides.length)
      }));
      setSlides(updatedSlides);
    }
  }, [layoutType]);

  // Center view on first slide when slides are initially loaded
  useEffect(() => {
    if (slides.length > 0 && canvasRef.current) {
      // Only center if we're at the initial position (haven't moved around yet)
      if (pan.x === 0 && pan.y === 0 && zoom === 1 && currentSlide === 0) {
        console.log('[Presentation] Initial slides loaded, centering on first slide');
        // Small delay to ensure canvas is properly rendered
        setTimeout(() => {
          if (canvasRef.current && canvasRef.current.clientWidth > 0) {
            goToSlide(0);
          }
        }, 100);
      }
    }
  }, [slides.length, pan.x, pan.y, zoom, currentSlide, goToSlide]);

  // Render math in slides whenever slides change or current slide changes
  useEffect(() => {
    if (slides.length > 0 && window.MathJax && window.MathJax.typesetPromise) {
      console.log('[MathJax] Triggering math rendering for', slides.length, 'slides');

      // Small delay to ensure slides are rendered in DOM
      const timer = setTimeout(() => {
        const presentationContainer = document.getElementById('presentation-content');
        if (presentationContainer) {
          console.log('[MathJax] Rendering math in presentation container');
          window.MathJax.typesetPromise([presentationContainer])
            .then(() => console.log('[MathJax] Math rendering completed successfully'))
            .catch((err) => console.error('[MathJax] Error rendering math in presentation:', err));
        } else {
          console.warn('[MathJax] Presentation container not found');
        }
      }, 200);

      return () => clearTimeout(timer);
    } else {
      if (slides.length === 0) console.log('[MathJax] No slides to render');
      if (!window.MathJax) console.log('[MathJax] MathJax not available');
      if (!window.MathJax?.typesetPromise) console.log('[MathJax] typesetPromise not available');
    }
  }, [slides, currentSlide]);



  // Handle double click on slide to zoom in and focus
  const computeCenteredPan = (slide, zoomLevel, fallbackPan = panRef.current) => {
    const canvas = canvasRef.current;
    if (!canvas || !slide) {
      return fallbackPan;
    }

    const viewportCenterX = canvas.clientWidth / 2;
    const viewportCenterY = canvas.clientHeight / 2;

    return {
      x: viewportCenterX - (slide.position.x * zoomLevel),
      y: viewportCenterY - (slide.position.y * zoomLevel)
    };
  };

  const handleSlideDoubleClick = (slideIndex) => {
    const slide = slides[slideIndex];
    if (!slide) return;

    markZoomInteraction();

    const targetZoom = 2;
    const targetPan = computeCenteredPan(slide, targetZoom);

    setCurrentSlide(slideIndex);
    setFocusedSlide(slideIndex);
    zoomRef.current = targetZoom;
    panRef.current = targetPan;
    setZoom(targetZoom);
    setPan(targetPan);
  };

  // Zoom handlers - zoom from current slide center
  const handleZoomIn = () => {
    const newZoom = Math.min(MAX_ZOOM, zoom * 1.1);
    zoomFromCurrentSlide(newZoom);
  };

  const handleZoomOut = () => {
    const newZoom = Math.max(MIN_ZOOM, zoom / 1.1);
    zoomFromCurrentSlide(newZoom);
  };

  // Helper function to zoom from current slide center
  const zoomFromCurrentSlide = (requestedZoom) => {
    const clampedZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, requestedZoom));

    if (Math.abs(clampedZoom - zoomRef.current) < 0.0001) {
      return;
    }

    markZoomInteraction();

    if (slides.length === 0 || currentSlide >= slides.length) {
      zoomRef.current = clampedZoom;
      setZoom(clampedZoom);
      return;
    }

    const slide = slides[currentSlide];
    const newPan = computeCenteredPan(slide, clampedZoom);

    zoomRef.current = clampedZoom;
    panRef.current = newPan;
    setZoom(clampedZoom);
    setPan(newPan);
  };

  const resetView = () => {
    const canvas = canvasRef.current;
    if (!canvas || canvas.clientWidth === 0 || canvas.clientHeight === 0) {
      setTimeout(() => resetView(), 50);
      return;
    }

    const baseSlideIndex = slides.length > 0 ? 0 : currentSlide;
    const targetZoom = 1;
    const centeredPan = computeCenteredPan(slides[baseSlideIndex], targetZoom, { x: 0, y: 0 });

    markZoomInteraction();
    zoomRef.current = targetZoom;
    panRef.current = centeredPan;
    setZoom(targetZoom);
    setPan(centeredPan);
    if (slides.length > 0) {
      setCurrentSlide(baseSlideIndex);
    }
    setFocusedSlide(null);

    if (
      slides.length > 0 &&
      isPresenting &&
      window.updateSpeakerNotes &&
      typeof window.updateSpeakerNotes === 'function'
    ) {
      const currentContent = slides.map(slide => slide.content).join('\n\n---\n\n');
      setTimeout(() => {
        window.updateSpeakerNotes(baseSlideIndex, currentContent);
      }, 50);
    }
  };

  // Wheel zoom effect with cursor-aware panning
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e) => {
      if (!containerRef.current) {
        return;
      }

      e.preventDefault();
      if (isPresenting) return;
      markZoomInteraction();

      const previousZoom = zoomRef.current || 1;
      const deltaModeMultiplier = e.deltaMode === 1 ? 33 : 1;
      const rawDelta = e.deltaY * deltaModeMultiplier;
      if (rawDelta === 0) {
        return;
      }

      const normalizedDelta = Math.max(-1, Math.min(1, rawDelta / 120));
      const zoomStep = (e.ctrlKey || e.metaKey) ? 0.12 : 0.08;
      const deltaMagnitude = Math.max(0.02, Math.abs(normalizedDelta) * zoomStep);
      const zoomFactor = 1 + deltaMagnitude;

      let targetZoom = normalizedDelta < 0
        ? previousZoom * zoomFactor
        : previousZoom / zoomFactor;

      targetZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, targetZoom));

      if (Math.abs(targetZoom - previousZoom) < 0.0001) {
        return;
      }

      const slide = slides[currentSlide];
      const newPan = computeCenteredPan(slide, targetZoom, panRef.current);

      zoomRef.current = targetZoom;
      panRef.current = newPan;
      setZoom(targetZoom);
      setPan(newPan);
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [markZoomInteraction, MAX_ZOOM, MIN_ZOOM, slides, currentSlide, isPresenting]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyPress = (e) => {
      // Only handle keyboard events if we're in presentation view and not focused on an input element
      const isInPresentationView = Boolean(
        document.body.classList.contains('presentation-mode') &&
        containerRef.current?.isConnected
      );
      const isInputFocused = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable;
      const isInteractiveControl = Boolean(e.target.closest?.(
        'button, a[href], select, [role="button"], [role="menuitem"], [role="option"]'
      ));
      
      if (!isInPresentationView || isInputFocused || isInteractiveControl) {
        return; // Preserve native keyboard behavior for focused controls.
      }
      
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        goToSlide(currentSlide + 1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goToSlide(currentSlide - 1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        goToSlide(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        goToSlide(slides.length - 1);
      } else if (e.key === 'Escape') {
        console.log('[PRESENTATION] Escaping presentation mode...');
        
        // Stop TTS audio
        stopSpeaking();
        
        // Stop video recording if active
        if (isRecording && window.videoRecordingService) {
          console.log('[VIDEO] Stopping recording on escape');
          stopRecording();
        }
        
        setIsPresenting(false);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [currentSlide, goToSlide, slides.length]);


  // Control body class for presenting mode
  useEffect(() => {
    if (isPresenting) {
      if (!previousFocusRef.current) previousFocusRef.current = document.activeElement;
      document.body.classList.add('is-presenting');
      console.log('[Presentation] Added is-presenting class to body');
      
      // Focus the main window to ensure keyboard navigation works immediately (multiple attempts)
      const focusMainWindow = () => {
        if (window.electronAPI?.presentation?.focusMainWindow) {
          window.electronAPI.presentation.focusMainWindow();
          console.log('[Presentation] Focused main window for keyboard navigation');
        } else {
          // Fallback for non-Electron environments
          window.focus();
        }
      };
      
      // Immediate focus
      focusMainWindow();
      requestAnimationFrame(() => {
        containerRef.current
          ?.querySelector('[data-current-slide="true"]')
          ?.focus({ preventScroll: true });
      });
      
      // Additional focus attempts to override any focus stealing
      setTimeout(focusMainWindow, 100);
      setTimeout(focusMainWindow, 300);
      setTimeout(focusMainWindow, 600);
      
      // Hide sidebar speaker notes pane when entering presentation mode
      const sidebarPane = document.getElementById('speaker-notes-pane');
      if (sidebarPane) {
        sidebarPane.style.display = 'none';
        console.log('[Presentation] Hidden sidebar speaker notes pane on presentation start');
      }

      // Hide content toolbar (high z-index floating elements on right side)
      document.querySelectorAll('[class*="z-[12"]').forEach(el => {
        el.dataset.hiddenByPresentation = 'true';
        el.style.display = 'none';
      });
      // Also hide by checking fixed elements on right side with buttons
      document.querySelectorAll('body > div').forEach(el => {
        const style = window.getComputedStyle(el);
        const right = parseInt(style.right) || 999;
        const zIndex = parseInt(style.zIndex) || 0;
        const buttons = el.querySelectorAll('button');
        if (style.position === 'fixed' && right < 50 && zIndex > 1000 && buttons.length >= 3) {
          el.dataset.hiddenByPresentation = 'true';
          el.style.display = 'none';
        }
      });
      console.log('[Presentation] Hidden content toolbar');
      
      // Create speaker notes data if it doesn't exist (after flag reset, this should work properly)
      console.log('[Presentation] DEBUG: Checking speaker notes data creation:', {
        hasSpeakerNotesData: !!window.speakerNotesData,
        reactControlsFlag: window.REACT_CONTROLS_SPEAKER_NOTES,
        slidesLength: slides.length,
        slidesHaveNotes: slides.map(slide => !!slide.speakerNotes)
      });
      
      if (!window.speakerNotesData && slides.length > 0) {
        const allNotes = slides.map(slide => slide.speakerNotes || '');
        window.speakerNotesData = {
          allNotes: allNotes,
          currentSlide: 0,
          content: slides.map(slide => slide.content).join('\n\n---\n\n')
        };
        // Set flag to prevent legacy system from clearing our data
        window.REACT_CONTROLS_SPEAKER_NOTES = true;
        console.log('[Presentation] Created initial speaker notes data:', allNotes.length, 'slides with notes:', allNotes.filter(n => n).length);
        console.log('[Presentation] DEBUG: Sample notes preview:', allNotes.map((note, i) => ({ 
          slideIndex: i, 
          hasNotes: !!note, 
          length: note.length, 
          preview: note ? note.substring(0, 50) + '...' : 'empty' 
        })));
      } else if (slides.length === 0) {
        console.log('[Presentation] DEBUG: No slides available for speaker notes creation');
      } else {
        console.log('[Presentation] DEBUG: Speaker notes data already exists, using existing data');
      }
      
      // Wait for legacy system to open window, then sync React state with it
      setTimeout(() => {
        if (window.speakerNotesData && window.SPEAKER_NOTES_WINDOW_OPEN) {
          // Legacy system opened the window, sync our state
          setSpeakerNotesWindowVisible(true);
          window.explicitlySeparateWindow = true;
          console.log('[Presentation] React synced with legacy speaker notes window');
          
          // Focus main window after speaker notes window has opened and stolen focus
          if (window.electronAPI?.presentation?.focusMainWindow) {
            window.electronAPI.presentation.focusMainWindow();
            console.log('[Presentation] Re-focused main window after speaker notes window opened');
          } else {
            window.focus();
          }
          
          // Add additional aggressive focus attempts
          setTimeout(() => {
            if (window.electronAPI?.presentation?.focusMainWindow) {
              window.electronAPI.presentation.focusMainWindow();
              console.log('[Presentation] Additional focus attempt at 1.5s');
            }
          }, 500); // 1.5 seconds total
          
          setTimeout(() => {
            if (window.electronAPI?.presentation?.focusMainWindow) {
              window.electronAPI.presentation.focusMainWindow();
              console.log('[Presentation] Final focus attempt at 2s');
            }
          }, 1000); // 2 seconds total
        }
      }, 1000); // Wait for legacy system to finish
      
      console.log('[Presentation] Entering presentation mode - current speakerNotesWindowVisible:', speakerNotesWindowVisible);
    } else {
      document.body.classList.remove('is-presenting');
      console.log('[Presentation] Removed is-presenting class from body');

      // Restore content toolbar and other hidden elements
      document.querySelectorAll('[data-hidden-by-presentation="true"]').forEach(el => {
        el.style.display = '';
        delete el.dataset.hiddenByPresentation;
      });
      console.log('[Presentation] Restored content toolbar');

      const previousFocus = previousFocusRef.current;
      previousFocusRef.current = null;
      if (previousFocus) {
        requestAnimationFrame(() => {
          const target = previousFocus.isConnected
            ? previousFocus
            : containerRef.current?.querySelector('.presentation-present-btn');
          target?.focus({ preventScroll: true });
        });
      }
    }
  }, [isPresenting]);

  // Listen for external exit presentation events
  useEffect(() => {
    const handleExitPresenting = () => {
      console.log('[PRESENTATION] External exit presenting event...');
      
      // Stop TTS audio
      stopSpeaking();
      
      // Stop video recording if active
      if (isRecording && window.videoRecordingService) {
        console.log('[VIDEO] Stopping recording on external exit event');
        stopRecording();
      }
      
      setIsPresenting(false);
    };
    
    window.addEventListener('exitPresenting', handleExitPresenting);
    return () => window.removeEventListener('exitPresenting', handleExitPresenting);
  }, []);

  // Listen for speaker notes window being closed externally
  useEffect(() => {
    if (isElectron && window.electronAPI) {
      const handleSpeakerNotesWindowClosed = () => {
        // Ignore close events during controlled toggle to prevent race condition
        if (window.REACT_CONTROLLED_TOGGLE) {
          console.log('[React Presentation] Speaker notes window close ignored - controlled toggle in progress');
          window.REACT_CONTROLLED_TOGGLE = false; // Reset flag
          return;
        }
        
        // Only handle external close if React is actually managing the window
        // Ignore closes during initial setup when legacy system is in control
        if (window.explicitlySeparateWindow) {
          setSpeakerNotesWindowVisible(false);
          window.explicitlySeparateWindow = false;
          console.log('[React Presentation] Speaker notes window was closed externally by user');
        } else {
          console.log('[React Presentation] Speaker notes window close ignored - not managed by React');
        }
      };

      // Set up listener for speaker notes window close event
      if (window.electronAPI.events?.speakerNotesWindowClosed) {
        const cleanup = window.electronAPI.events.speakerNotesWindowClosed(handleSpeakerNotesWindowClosed);
        return cleanup;
      }
    }
  }, [isElectron]);

  // Speak notes when slide changes if TTS is enabled
  useEffect(() => {
    console.log('[PRESENTATION-TTS] ⚡ useEffect triggered - currentSlide:', currentSlide, 'ttsEnabled:', ttsEnabled, 'isSpeaking:', isSpeaking, 'isAdvancing:', ttsStateRef.current.isAdvancing);
    
    // Only trigger TTS on slide changes, not on isSpeaking state changes
    if (ttsEnabled && slides[currentSlide]?.speakerNotes) {
      // Stop any current speech before starting new one
      if (window.ttsService && window.ttsService.isSpeaking) {
        console.log('[PRESENTATION-TTS] 🛑 Stopping previous TTS before starting new slide');
        window.ttsService.stop();
        setIsSpeaking(false);
      }
      
      // Start TTS for new slide after a brief delay to ensure state is clean
      setTimeout(() => {
        const currentTtsEnabled = ttsStateRef.current.ttsEnabled !== undefined 
          ? ttsStateRef.current.ttsEnabled 
          : ttsEnabled;
        
        console.log('[PRESENTATION-TTS] 🔍 Checking TTS start conditions:', {
          currentTtsEnabled,
          ttsEnabled,
          hasNotes: !!slides[currentSlide]?.speakerNotes,
          isAdvancing: ttsStateRef.current.isAdvancing,
          currentSlide,
          noteLength: slides[currentSlide]?.speakerNotes?.length
        });
        
        if (currentTtsEnabled && slides[currentSlide]?.speakerNotes && !ttsStateRef.current.isAdvancing) {
          console.log('[PRESENTATION-TTS] 📢 Starting TTS for slide:', currentSlide);
          speakText(slides[currentSlide].speakerNotes, currentSlide);
        } else {
          console.log('[PRESENTATION-TTS] ❌ TTS start blocked - conditions not met');
        }
      }, 100);
      
    } else if (ttsEnabled && !slides[currentSlide]?.speakerNotes && !ttsStateRef.current.isAdvancing) {
      console.log('[PRESENTATION-TTS] 📝 Slide', currentSlide, 'has no speaker notes, scheduling 10-second auto-advance');
      // If current slide has no notes but TTS is enabled, auto-advance after 10 seconds
      if (currentSlide < slides.length - 1) {
        ttsStateRef.current.isAdvancing = true;
        setTimeout(() => {
          // Get current ttsEnabled state to avoid closure issues
          const currentTtsEnabled = ttsStateRef.current.ttsEnabled !== undefined 
            ? ttsStateRef.current.ttsEnabled 
            : ttsEnabled;
            
          if (currentTtsEnabled) {
            console.log('[PRESENTATION-TTS] ⏩ Auto-advancing past slide with no notes:', currentSlide, '→', currentSlide + 1);
            goToSlide(currentSlide + 1);
            ttsStateRef.current.isAdvancing = false;
          } else {
            console.log('[PRESENTATION-TTS] ❌ Auto-advance canceled - TTS disabled');
            ttsStateRef.current.isAdvancing = false;
          }
        }, 10000); // 10 seconds
      }
    } else {
      console.log('[PRESENTATION-TTS] ⏸️ Conditions not met for TTS:', {
        ttsEnabled,
        hasNotes: !!slides[currentSlide]?.speakerNotes,
        isSpeaking,
        isAdvancing: ttsStateRef.current.isAdvancing
      });
    }
  }, [currentSlide, ttsEnabled]); // Removed isSpeaking from dependency array to prevent loops

  // Update speaker notes display when current slide changes
  useEffect(() => {
    const updateSpeakerNotes = async () => {
      const notesPanel = document.getElementById('speaker-notes-panel');
      const notesContent = document.getElementById('current-slide-notes');
      
      // Update separate speaker notes window if in presenting mode and window is visible
      if (isPresenting && speakerNotesWindowVisible && window.electronAPI && window.speakerNotesData) {
        try {
          let noteText = '';
          if (slides.length > 0 && slides[currentSlide] && slides[currentSlide].speakerNotes) {
            noteText = slides[currentSlide].speakerNotes.trim();
          }
          
          // Format for HTML display - call the markdown converter
          let formattedNotes;
          if (noteText) {
            // Use the markdownToHtml function from speaker-notes.js
            if (window.markdownToHtml && typeof window.markdownToHtml === 'function') {
              formattedNotes = window.markdownToHtml(noteText);
            } else {
              // Fallback to simple formatting
              formattedNotes = noteText.split('\n')
                .map(line => line.trim())
                .filter(line => line)
                .join('<br>');
            }
          } else {
            formattedNotes = '<em>No speaker notes for this slide.</em>';
          }
          
          await window.electronAPI.presentation.updateSpeakerNotes({
            notes: formattedNotes,
            slideNumber: currentSlide + 1
          });
          
          // Also call the global updateSpeakerNotes function to ensure consistency
          if (window.updateSpeakerNotes && typeof window.updateSpeakerNotes === 'function') {
            const currentContent = slides.map(slide => slide.content).join('\n\n---\n\n');
            await window.updateSpeakerNotes(currentSlide, currentContent);
          }
        } catch (error) {
          console.error('[React Presentation] Failed to update separate speaker notes window:', error);
        }
      }
      
      // Update inline panel if it's visible (when separate window is hidden)  
      // Only show inline panel if explicitly requested (not during initial setup)
      const shouldShowInlinePanel = !speakerNotesWindowVisible && isPresenting && window.speakerNotesData && !window.explicitlySeparateWindow && window.REACT_READY_FOR_INLINE;
      
      if (shouldShowInlinePanel) {
        // Recreate panel if it was removed
        if (!notesPanel && window.speakerNotesPanel_HTML) {
          const presentationContent = document.getElementById('presentation-content');
          if (presentationContent) {
            presentationContent.insertAdjacentHTML('beforeend', window.speakerNotesPanel_HTML);
            notesPanel = document.getElementById('speaker-notes-panel');
            notesContent = document.getElementById('current-slide-notes');
          }
        }
        
        if (notesPanel && notesContent) {
          // Only show inline panel when separate window is not visible
          notesPanel.style.setProperty('display', 'block', 'important');
          const currentSlideNotes = window.speakerNotesData.allNotes[currentSlide] || '';
          
          if (currentSlideNotes) {
            // Use HTML conversion for inline panel too
            if (window.markdownToHtml && typeof window.markdownToHtml === 'function') {
              setSanitizedHTML(notesContent, window.markdownToHtml(currentSlideNotes));
            } else {
              setSanitizedHTML(notesContent, currentSlideNotes.replace(/\n/g, '<br>'));
            }
          } else {
            setSanitizedHTML(notesContent, '<em>No speaker notes for this slide.</em>');
          }
        }
      } else {
        // Always hide inline panel when separate window should be visible OR when not in correct state
        if (notesPanel) {
          notesPanel.style.setProperty('display', 'none', 'important');
        }
      }
    };

    updateSpeakerNotes();
  }, [currentSlide, slides, speakerNotesVisible, isPresenting, speakerNotesWindowVisible]);

  // Expose current slide index to global scope for navigation
  useEffect(() => {
    window.currentPresentationSlide = currentSlide;
  }, [currentSlide]);

  // Jump to target slide when entering presentation mode from editor
  useEffect(() => {
    if (slides.length > 0 && typeof window.targetPresentationSlide === 'number') {
      const targetSlide = window.targetPresentationSlide;
      console.log('[Presentation] Target slide from editor detected:', targetSlide);
      
      // Clear the target slide to avoid jumping again
      window.targetPresentationSlide = undefined;
      
      // Jump to the target slide if it's valid and different from current
      if (targetSlide >= 0 && targetSlide < slides.length) {
        console.log('[Presentation] Navigating to target slide:', targetSlide, 'current:', currentSlide);
        // Use a longer delay to avoid conflicts with initial centering
        setTimeout(() => {
          console.log('[Presentation] Executing goToSlide for target:', targetSlide);
          goToSlide(targetSlide);
        }, 300);
      }
    }
  }, [slides, goToSlide]);

  // Hide speaker notes panel when exiting presentation mode
  useEffect(() => {
    if (!isPresenting) {
      const panel = document.getElementById('speaker-notes-panel');
      if (panel) {
        panel.style.setProperty('display', 'none', 'important');
        console.log('[React Presentation] Hidden inline panel on exit presentation mode');
      }
      
      // Clean up panel visibility monitor when exiting presentation
      if (window.panelVisibilityMonitor) {
        clearInterval(window.panelVisibilityMonitor);
        window.panelVisibilityMonitor = null;
        console.log('[Panel Monitor] Cleaned up on presentation exit');
      }
      
      // Clear React control flag so legacy system can manage data normally
      window.REACT_CONTROLS_SPEAKER_NOTES = false;
      console.log('[Presentation] Cleared React speaker notes control flag');
    }
  }, [isPresenting]);

  // Toggle between separate speaker notes window and inline panel
  // Handle TTS toggle
  const handleTtsToggle = () => {
    console.log('[PRESENTATION-TTS] === TTS Toggle Clicked ===');
    console.log('[PRESENTATION-TTS] Current ttsEnabled:', ttsEnabled);
    console.log('[PRESENTATION-TTS] Current slide:', currentSlide);
    console.log('[PRESENTATION-TTS] Has speaker notes:', !!slides[currentSlide]?.speakerNotes);
    
    const newTtsEnabled = !ttsEnabled;
    setTtsEnabled(newTtsEnabled);
    // Also store in ref to avoid closure issues in completion callbacks
    ttsStateRef.current.ttsEnabled = newTtsEnabled;
    
    // If turning on TTS, speak the current slide's speaker notes
    if (!ttsEnabled && slides[currentSlide]?.speakerNotes) {
      console.log('[PRESENTATION-TTS] Enabling TTS and starting speech');
      ttsStateRef.current.isAdvancing = false; // Reset state
      speakText(slides[currentSlide].speakerNotes, currentSlide);
    } else if (ttsEnabled) {
      // If turning off TTS, stop any current speech
      console.log('[PRESENTATION-TTS] Disabling TTS and stopping speech');
      stopSpeaking();
      ttsStateRef.current.isAdvancing = false; // Reset state
    }
  };

  // Speak text using TTS with auto-advance
  const speakText = async (text, slideIndex) => {
    console.log('[PRESENTATION-TTS] === speakText called ===');
    console.log('[PRESENTATION-TTS] Text length:', text?.length || 0);
    console.log('[PRESENTATION-TTS] Slide index:', slideIndex);
    console.log('[PRESENTATION-TTS] Current isSpeaking:', isSpeaking);
    console.log('[PRESENTATION-TTS] Is advancing:', ttsStateRef.current.isAdvancing);
    
    if (!text) {
      console.warn('[PRESENTATION-TTS] No text to speak');
      return;
    }
    
    // Only block if already speaking the SAME slide to prevent loops
    if (isSpeaking && ttsStateRef.current.currentSpeakingSlide === slideIndex) {
      console.log('[PRESENTATION-TTS] Already speaking this slide, ignoring duplicate request');
      return;
    }
    
    // Stop any current speech before starting new one
    if (window.ttsService && window.ttsService.isSpeaking) {
      console.log('[PRESENTATION-TTS] 🛑 Stopping current TTS before starting new slide');
      window.ttsService.stop();
    }
    
    console.log('[PRESENTATION-TTS] Text preview:', text.substring(0, 100) + '...');
    setIsLoadingTTS(true); // Show loading indicator while fetching audio
    setIsSpeaking(true);
    ttsStateRef.current.currentSpeakingSlide = slideIndex;
    
    // Use the TTS service if available
    if (window.ttsService) {
      try {
        console.log('[PRESENTATION-TTS] 🎬 Starting TTS for slide', slideIndex);
        
        // Try to use TTS service with callback if available
        let completionHandled = false;
        const handleCompletion = () => {
          if (completionHandled) return; // Prevent duplicate calls
          completionHandled = true;
          
          console.log('[PRESENTATION-TTS] ✅ TTS completed via callback for slide:', slideIndex);
          setIsSpeaking(false);
          ttsStateRef.current.currentSpeakingSlide = -1;
          
          // Schedule auto-advance - get current ttsEnabled state to avoid closure issues
          const currentTtsEnabled = ttsStateRef.current.ttsEnabled !== undefined 
            ? ttsStateRef.current.ttsEnabled 
            : true; // Assume true if not set, since we're in a completion callback
            
          console.log('[PRESENTATION-TTS] 🔍 Auto-advance condition check:', {
            ttsEnabledFromClosure: ttsEnabled,
            currentTtsEnabled: currentTtsEnabled,
            slideIndex: slideIndex, 
            slidesLength: slides.length,
            slideIndexLessThanLength: slideIndex < slides.length - 1,
            finalCondition: currentTtsEnabled && slideIndex < slides.length - 1
          });
          
          if (currentTtsEnabled && slideIndex < slides.length - 1) {
            console.log('[PRESENTATION-TTS] ⏭️ Scheduling advance to slide:', slideIndex + 1);
            ttsStateRef.current.isAdvancing = true;
            
            setTimeout(() => {
              // Get current ttsEnabled state to avoid closure issues
              const currentTtsEnabled = ttsStateRef.current.ttsEnabled !== undefined 
                ? ttsStateRef.current.ttsEnabled 
                : ttsEnabled; // fallback to state if ref not set
                
              if (currentTtsEnabled) {
                console.log('[PRESENTATION-TTS] 🚀 ADVANCING to slide:', slideIndex + 1);
                goToSlide(slideIndex + 1);
                // Clear isAdvancing flag immediately so TTS can start on the new slide
                ttsStateRef.current.isAdvancing = false;
                console.log('[PRESENTATION-TTS] ✅ Cleared isAdvancing flag');
              } else {
                console.log('[PRESENTATION-TTS] ❌ TTS disabled, canceling advance');
                ttsStateRef.current.isAdvancing = false;
              }
            }, 1000);
          } else {
            console.log('[PRESENTATION-TTS] 🏁 Reached end or TTS disabled - slideIndex:', slideIndex, 'slides.length:', slides.length, 'ttsEnabled:', ttsEnabled);
          }
        };
        
        // Start the TTS with options including voice and callbacks
        const ttsOptions = {
          voice: selectedVoice,
          onStart: () => {
            console.log('[PRESENTATION-TTS] 🎵 Audio started playing - clearing loading state');
            setIsLoadingTTS(false);
          },
          onEnd: handleCompletion,
          onError: (err) => {
            console.error('[PRESENTATION-TTS] ❌ TTS error:', err);
            setIsLoadingTTS(false);
            handleCompletion();
          }
        };

        console.log('[PRESENTATION-TTS] 📞 Starting TTS with options:', { voice: selectedVoice });
        const ttsPromise = window.ttsService.speak(text, ttsOptions);
        
        // Only use polling if no callback support
        if (window.ttsService.speak.length <= 1) {
          // Poll the TTS service to check when it's done speaking (fallback method)
          let pollCount = 0;
          const maxPollCount = 120; // 120 * 500ms = 60 seconds max
          const checkCompletion = () => {
            pollCount++;
            const ttsIsSpeaking = window.ttsService.isSpeaking;
            const ttsIsLoading = window.ttsService.isLoading;
            console.log('[PRESENTATION-TTS] 🔍 Polling completion - count:', pollCount, 'isSpeaking:', ttsIsSpeaking, 'isLoading:', ttsIsLoading);

            // Only consider complete if NOT speaking AND NOT loading
            if ((!ttsIsSpeaking && !ttsIsLoading) || pollCount >= maxPollCount) {
              if (completionHandled) return; // Callback already handled it
              handleCompletion(); // Use the same completion handler
            } else {
              // Still speaking or loading, check again in 500ms
              setTimeout(checkCompletion, 500);
            }
          };

          // Start checking for completion after a brief delay
          setTimeout(checkCompletion, 1000);
        }
        
        // Also set a maximum timeout fallback
        setTimeout(() => {
          if (isSpeaking) {
            console.log('[PRESENTATION-TTS] 🚨 Maximum timeout reached, forcing completion');
            setIsSpeaking(false);
            setIsLoadingTTS(false);
            ttsStateRef.current.isAdvancing = false;
            ttsStateRef.current.currentSpeakingSlide = -1;
          }
        }, 30000); // 30 second max timeout

      } catch (error) {
        console.error('[PRESENTATION-TTS] ❌ Exception:', error);
        setIsSpeaking(false);
        setIsLoadingTTS(false);
        ttsStateRef.current.isAdvancing = false;
        ttsStateRef.current.currentSpeakingSlide = -1;
      }
    } else {
      console.error('[PRESENTATION-TTS] TTS service not available!');
      setIsSpeaking(false);
      setIsLoadingTTS(false);
      ttsStateRef.current.currentSpeakingSlide = -1;
    }
  };

  // Stop speaking
  const stopSpeaking = () => {
    console.log('[PRESENTATION-TTS] === stopSpeaking called ===');
    
    if (window.ttsService) {
      console.log('[PRESENTATION-TTS] Calling ttsService.stop()');
      window.ttsService.stop();
    }
    
    setIsSpeaking(false);
    ttsStateRef.current.isAdvancing = false;
    ttsStateRef.current.currentSpeakingSlide = -1;
  };

  // Video Recording Functions
  const startRecording = async () => {
    console.log('[VIDEO] Starting recording...');
    
    if (!window.videoRecordingService) {
      console.error('[VIDEO] Video recording service not available');
      alert('Recording service not available. Please ensure you are using a supported browser.');
      return;
    }

    try {
      // Configure recording options
      const options = {
        video: true,
        audio: false, // Start with no audio to simplify
        audioSource: 'none', // Disable audio initially
        videoQuality: 'high',
        frameRate: 30
      };
      
      // Ask user if they want to include audio
      const includeAudio = await window.showAppConfirm({
        title: 'Include Recording Audio',
        message: 'Include audio in the recording?',
        detail: 'Microphone permission will be requested when microphone audio is used.',
        confirmText: 'Include Audio',
        cancelText: 'Video Only',
        variant: 'warning'
      });
      
      if (includeAudio) {
        options.audio = true;
        options.audioSource = ttsEnabled ? 'tts' : 'microphone';
      }

      // Initialize and start recording
      await window.videoRecordingService.initializeRecording(options);
      await window.videoRecordingService.startRecording(options);
      
      setIsRecording(true);
      setIsPaused(false);
      setRecordingDuration(0);
      
      // Start duration timer
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
      
      // Mark the first slide
      if (slides[currentSlide]) {
        window.videoRecordingService.markSlideTransition(
          currentSlide + 1,
          slides[currentSlide].content.split('\n')[0]
        );
      }
      
      console.log('[VIDEO] Recording started successfully');
    } catch (error) {
      console.error('[VIDEO] Failed to start recording:', error);
      
      // Provide more specific error messages
      if (error.message.includes('NotAllowedError')) {
        alert('Screen recording permission denied. Please allow screen recording and try again.');
      } else if (error.message.includes('NotSupportedError')) {
        alert('Screen recording is not supported in this browser. Please try Chrome or Edge.');
      } else {
        alert(`Failed to start recording: ${error.message}\n\nPlease check browser permissions and try again.`);
      }
    }
  };

  const stopRecording = () => {
    console.log('[VIDEO] Stopping recording...');
    
    if (!window.videoRecordingService || !isRecording) {
      return;
    }

    // Stop the timer
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    // Stop recording
    window.videoRecordingService.stopRecording();
    
    setIsRecording(false);
    setIsPaused(false);
    setRecordingDuration(0);
    
    console.log('[VIDEO] Recording stopped');
  };

  const togglePauseRecording = () => {
    if (!window.videoRecordingService || !isRecording) {
      return;
    }

    if (isPaused) {
      window.videoRecordingService.resumeRecording();
      // Resume timer
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
      setIsPaused(false);
      console.log('[VIDEO] Recording resumed');
    } else {
      window.videoRecordingService.pauseRecording();
      // Pause timer
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      setIsPaused(true);
      console.log('[VIDEO] Recording paused');
    }
  };

  const formatRecordingTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Statistics calculation functions
  const calculateStatistics = () => {
    const stats = {
      slideCount: slides.length,
      slideContent: {
        totalWords: 0,
        totalQuotes: 0,
        totalImages: 0,
        totalCodeBlocks: 0
      },
      speakerNotes: {
        totalWords: 0,
        totalQuotes: 0,
        slidesWithNotes: 0
      },
      estimatedTalkingTime: {
        notesOnly: 0,
        withExtemporization: 0
      }
    };

    slides.forEach(slide => {
      // Count slide content
      const slideText = slide.content || '';
      const slideWords = slideText.match(/\b\w+\b/g) || [];
      stats.slideContent.totalWords += slideWords.length;
      
      // Count quotes in slide content (text within quotation marks)
      const slideQuotes = slideText.match(/["']([^"']*?)["']/g) || [];
      stats.slideContent.totalQuotes += slideQuotes.length;
      
      // Count images
      const imageMatches = slideText.match(/!\[[^\]]*\]\([^)]*\)/g) || [];
      stats.slideContent.totalImages += imageMatches.length;
      
      // Count code blocks
      const codeBlocks = slideText.match(/```[\s\S]*?```/g) || [];
      const inlineCode = slideText.match(/`[^`]+`/g) || [];
      stats.slideContent.totalCodeBlocks += codeBlocks.length + inlineCode.length;
      
      // Count speaker notes
      if (slide.speakerNotes && slide.speakerNotes.trim()) {
        stats.speakerNotes.slidesWithNotes++;
        const notesWords = slide.speakerNotes.match(/\b\w+\b/g) || [];
        stats.speakerNotes.totalWords += notesWords.length;
        
        // Count quotes in speaker notes
        const notesQuotes = slide.speakerNotes.match(/["']([^"']*?)["']/g) || [];
        stats.speakerNotes.totalQuotes += notesQuotes.length;
      }
    });

    // Calculate talking time estimates
    // Average speaking rate: 150-160 words per minute, we'll use 150
    const wordsPerMinute = 150;
    stats.estimatedTalkingTime.notesOnly = Math.ceil(stats.speakerNotes.totalWords / wordsPerMinute);
    
    // Add 50% for extemporization, pauses, and slide transitions
    stats.estimatedTalkingTime.withExtemporization = Math.ceil(stats.estimatedTalkingTime.notesOnly * 1.5);
    
    // Add additional time for slides without notes (assume 30 seconds per slide)
    const slidesWithoutNotes = stats.slideCount - stats.speakerNotes.slidesWithNotes;
    const timeForSlidesWithoutNotes = Math.ceil(slidesWithoutNotes * 0.5); // 0.5 minutes per slide
    stats.estimatedTalkingTime.withExtemporization += timeForSlidesWithoutNotes;

    return stats;
  };

  const formatTime = (minutes) => {
    if (minutes < 60) {
      return `${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  };

  const toggleSpeakerNotesWindow = async () => {
    if (!isPresenting || !window.electronAPI) {
      return;
    }
    
    if (speakerNotesWindowVisible) {
      // Switch from separate window to inline panel
      try {
        // Temporarily disable external close handler to prevent race condition
        window.REACT_CONTROLLED_TOGGLE = true;
        
        // Close the separate window
        await window.electronAPI.presentation.closeSpeakerNotesWindow();
        setSpeakerNotesWindowVisible(false);
        // Clear the flag since we're now explicitly using inline panel
        window.explicitlySeparateWindow = false;
        // Set flag to allow inline panel to show
        window.REACT_READY_FOR_INLINE = true;
        
        // Stop monitoring panel visibility since we want inline panel to be visible now
        if (window.panelVisibilityMonitor) {
          clearInterval(window.panelVisibilityMonitor);
          window.panelVisibilityMonitor = null;
        }
        
        // Show the inline panel with current slide notes - recreate if needed
        let panel = document.getElementById('speaker-notes-panel');
        if (!panel && window.speakerNotesPanel_HTML) {
          // Recreate panel from stored HTML
          const presentationContent = document.getElementById('presentation-content');
          if (presentationContent) {
            presentationContent.insertAdjacentHTML('beforeend', window.speakerNotesPanel_HTML);
            panel = document.getElementById('speaker-notes-panel');
          }
        }
        
        if (panel && window.speakerNotesData) {
          panel.style.setProperty('display', 'block', 'important');
          
          // Update the inline panel with current slide notes
          const notesContainer = document.getElementById('current-slide-notes');
          if (notesContainer) {
            const currentSlideNotes = window.speakerNotesData.allNotes[currentSlide] || '';
            if (currentSlideNotes && window.markdownToHtml) {
              setSanitizedHTML(notesContainer, window.markdownToHtml(currentSlideNotes));
            } else {
              setSanitizedHTML(notesContainer, currentSlideNotes || '<em>No speaker notes for this slide.</em>');
            }
          }
        }
      } catch (error) {
        console.error('[React Presentation] Failed to switch to inline panel:', error);
      } finally {
        // Ensure flag is cleared even if there was an error
        window.REACT_CONTROLLED_TOGGLE = false;
      }
    } else {
      // Switch from inline panel to separate window
      try {
        // Set controlled toggle flag for this direction too
        window.REACT_CONTROLLED_TOGGLE = true;
        // COMPLETELY REMOVE the inline panel from DOM
        const panel = document.getElementById('speaker-notes-panel');
        if (panel) {
          // Store panel HTML for later restoration if needed
          window.speakerNotesPanel_HTML = panel.outerHTML;
          panel.remove();
        }

        // ALSO hide the sidebar speaker notes pane if it's visible
        const sidebarPane = document.getElementById('speaker-notes-pane');
        if (sidebarPane) {
          sidebarPane.style.display = 'none';
        }
        
        // Ensure we have speaker notes data, recreate if needed
        if (!window.speakerNotesData && slides.length > 0) {
          // Recreate speaker notes data from current slides
          const allNotes = slides.map(slide => slide.speakerNotes || '');
          window.speakerNotesData = {
            allNotes: allNotes,
            currentSlide: currentSlide,
            content: slides.map(slide => slide.content).join('\n\n---\n\n')
          };
          // Set flag to prevent legacy system from clearing our data
          window.REACT_CONTROLS_SPEAKER_NOTES = true;
        }
        
        // Open the separate window with current slide data
        if (window.speakerNotesData) {
          const currentSlideNotes = window.speakerNotesData.allNotes[currentSlide] || '';
          let formattedNotes;
          if (currentSlideNotes) {
            if (window.markdownToHtml && typeof window.markdownToHtml === 'function') {
              formattedNotes = window.markdownToHtml(currentSlideNotes);
            } else {
              formattedNotes = currentSlideNotes.split('\n')
                .map(line => line.trim())
                .filter(line => line)
                .join('<br>');
            }
          } else {
            formattedNotes = '<em>No speaker notes for this slide.</em>';
          }

          await window.electronAPI.presentation.openSpeakerNotesWindow({
            notes: formattedNotes,
            slideNumber: currentSlide + 1,
            allNotes: window.speakerNotesData.allNotes
          });
          setSpeakerNotesWindowVisible(true);
          // Set a flag to prevent useEffect from showing inline panel
          window.explicitlySeparateWindow = true;

          // Focus main window after opening speaker notes window
          setTimeout(() => {
            if (window.electronAPI?.presentation?.focusMainWindow) {
              window.electronAPI.presentation.focusMainWindow();
            }
          }, 100); // Short delay to ensure window has opened
          // Clear inline panel flag
          window.REACT_READY_FOR_INLINE = false;

          // Immediately hide any visible panel before starting monitoring
          const panel = document.getElementById('speaker-notes-panel');
          if (panel) {
            panel.style.setProperty('display', 'none', 'important');
          }

          // Start monitoring for panel visibility and force hide it when in separate window mode
          if (window.panelVisibilityMonitor) {
            clearInterval(window.panelVisibilityMonitor);
          }

          window.panelVisibilityMonitor = setInterval(() => {
            if (window.explicitlySeparateWindow) {
              const panel = document.getElementById('speaker-notes-panel');
              if (panel) {
                const computedStyle = window.getComputedStyle(panel);
                if (computedStyle.display !== 'none') {
                  panel.style.setProperty('display', 'none', 'important');
                }
              }
            }
          }, 100); // Check every 100ms
        } else {
          console.warn('[React Presentation] No speaker notes data available for separate window');
          // Still set the state to indicate separate window should be visible
          setSpeakerNotesWindowVisible(true);
        }
      } catch (error) {
        console.error('[React Presentation] Failed to switch to separate window:', error);
        // Ensure panel stays hidden even if separate window fails
        const panel = document.getElementById('speaker-notes-panel');
        if (panel) {
          panel.style.setProperty('display', 'none', 'important');
        }
      } finally {
        // Ensure flag is cleared even if there was an error
        window.REACT_CONTROLLED_TOGGLE = false;
      }
    }
  };

  // Removed old speaker notes panel toggle - now handled by main toggle button

  // Mouse handlers for panning
  const handleMouseDown = (e) => {
    if (isPresenting) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setPanStart(pan);
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const deltaX = e.clientX - dragStart.x;
    const deltaY = e.clientY - dragStart.y;
    const newPan = {
      x: panStart.x + deltaX,
      y: panStart.y + deltaY
    };
    panRef.current = newPan;
    setPan(newPan);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Expose statistics functions to window object for sidebar access
  useEffect(() => {
    window.calculateStatistics = calculateStatistics;
    window.formatTime = formatTime;
    return () => {
      window.calculateStatistics = null;
      window.formatTime = null;
    };
  }, []);

  const activeZoom = isPresenting ? presentationFit.scale : zoom;
  const activePan = isPresenting ? presentationFit.pan : pan;
  const presentationStageStyle = isPresenting ? {
    position: 'absolute',
    top: `${presentationInsets.top}px`,
    right: `${presentationInsets.right}px`,
    bottom: `${presentationInsets.bottom}px`,
    left: `${presentationInsets.left}px`,
    overflow: 'hidden'
  } : {
    position: 'absolute',
    inset: 0,
    overflow: 'hidden'
  };

  return (
    <div 
      ref={containerRef}
      className={`presentation-shell w-full h-full relative overflow-hidden ${isPresenting ? '' : 'cursor-grab active:cursor-grabbing'}`}
      data-presentation-mode={isPresenting ? 'delivery' : 'authoring'}
      role="region"
      aria-label={isPresenting ? 'Presentation delivery' : 'Presentation editor'}
      style={{
        background: 'var(--presentation-bg-gradient, linear-gradient(135deg, var(--techne-bg, #fdf6e3) 0%, #f7f0de 48%, var(--techne-surface, #eee8d5) 100%))',
        height: '100%',
        minHeight: 0
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Controls */}
      {!isPresenting && (
        <div className="absolute top-4 left-4 z-10 flex gap-2" role="group" aria-label="Presentation layout">
          <select
            value={layoutType}
            onChange={(e) => setLayoutType(e.target.value)}
            aria-label="Presentation layout"
            className="px-3 py-2 text-gray-900 rounded-lg border border-gray-300 focus:border-[#E63946] outline-none shadow-lg"
            style={{backgroundColor: '#fefdfb'}}
          >
            <option value="spiral">Spiral</option>
            <option value="linear">Linear</option>
            <option value="grid">Grid</option>
            <option value="circle">Circle</option>
            <option value="tree">Tree</option>
            <option value="zigzag">Zigzag</option>
          </select>
          
        </div>
      )}

      {/* Zoom Controls */}
      {!isPresenting && (
        <div className="absolute top-4 right-4 z-10 flex gap-2" role="toolbar" aria-label="Presentation editor controls">
          <button
            onClick={handleZoomIn}
            aria-label="Zoom in"
            className="p-2 bg-cream hover:bg-gray-100 rounded-lg transition-colors shadow-lg border text-gray-900"
            data-tooltip="Zoom in"
          >
            <ZoomIn />
          </button>
          <button
            onClick={handleZoomOut}
            aria-label="Zoom out"
            className="p-2 bg-cream hover:bg-gray-100 rounded-lg transition-colors shadow-lg border text-gray-900"
            data-tooltip="Zoom out"
          >
            <ZoomOut />
          </button>
          <button
            onClick={resetView}
            aria-label="Reset presentation view"
            className="p-2 bg-cream hover:bg-gray-100 rounded-lg transition-colors shadow-lg border text-gray-900"
            data-tooltip="Reset presentation view"
          >
            <Home />
          </button>
          <button
            onClick={() => {
              if (window.exportVisualizationAsPNG) {
                window.exportVisualizationAsPNG('presentation-root', 'presentation');
              }
            }}
            className="p-2 bg-cream hover:bg-gray-100 rounded-lg transition-colors shadow-lg border text-gray-900"
            aria-label="Export presentation as PNG"
            data-tooltip="Export presentation as PNG"
          >
            📸
          </button>
	          <button
	            onClick={() => {
	              previousFocusRef.current = document.activeElement;
	              setIsPresenting(true);
	            }}
	            className="presentation-control-btn presentation-present-btn flex items-center gap-2 px-3 py-2 rounded-lg transition-colors shadow-lg border"
	            aria-label="Start presentation"
	          >
	            <Play />
	            Present
	          </button>
        </div>
      )}

      {/* Navigation Controls */}
      <nav
        ref={navigationControlsRef}
        className="presentation-navigation absolute bottom-4 left-1/2 transform -translate-x-1/2 z-50 flex items-center gap-4"
        aria-label="Slide navigation"
      >
        <button
          onClick={() => goToSlide(currentSlide - 1)}
          disabled={currentSlide === 0}
          aria-label="Previous slide"
          className="p-3 disabled:opacity-50 rounded-lg transition-colors shadow-lg"
          style={{
            background: 'var(--techne-off-white, #fafafa)',
            color: 'var(--techne-black, #0a0a0a)',
            border: '2px solid var(--techne-black, #0a0a0a)',
            boxShadow: '3px 3px 0 var(--techne-black, rgba(0,0,0,0.8))'
          }}
        >
          <ChevronLeft />
        </button>

        <div
          className="flex items-center gap-2 px-4 py-2 rounded-lg shadow-lg"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          style={{
            background: 'var(--techne-off-white, #fafafa)',
            color: 'var(--techne-black, #0a0a0a)',
            border: '2px solid var(--techne-black, #0a0a0a)',
            boxShadow: '3px 3px 0 var(--techne-black, rgba(0,0,0,0.8))'
          }}
        >
          <span className="text-sm font-medium">
            {currentSlide + 1} / {slides.length}
          </span>
        </div>

        <button
          onClick={() => goToSlide(currentSlide + 1)}
          disabled={currentSlide === slides.length - 1}
          aria-label="Next slide"
          className="p-3 disabled:opacity-50 rounded-lg transition-colors shadow-lg"
          style={{
            background: 'var(--techne-accent, #E63946)',
            color: 'var(--techne-white, #ffffff)',
            border: '2px solid var(--techne-black, #0a0a0a)',
            boxShadow: '3px 3px 0 var(--techne-black, rgba(0,0,0,0.8))'
          }}
        >
          <ChevronRight />
        </button>
      </nav>

      {/* Presentation Mode Controls */}
      {isPresenting && (
        <div ref={presentationControlsRef} className="presentation-toolbar absolute top-4 right-4 z-10 flex gap-2" role="toolbar" aria-label="Presentation delivery controls">
          <button
            onClick={() => {
              if (window.exportVisualizationAsPNG) {
                window.exportVisualizationAsPNG('presentation-root', 'presentation');
              }
            }}
            className="p-2 bg-cream hover:bg-gray-100 rounded-lg transition-colors shadow-lg border text-gray-900"
            aria-label="Export presentation as PNG"
            data-tooltip="Export presentation as PNG"
          >
            📸
          </button>
          <button
            onClick={() => toggleSpeakerNotesWindow()}
            className={`p-2 rounded-lg transition-colors shadow-lg border ${
              speakerNotesWindowVisible 
                ? 'bg-green-600 hover:bg-green-700 text-white border-green-700' 
                : 'bg-cream hover:bg-gray-100 text-gray-900'
            }`}
            data-tooltip={speakerNotesWindowVisible ? "Show speaker notes in bottom panel" : "Show speaker notes in separate window"}
            aria-label={speakerNotesWindowVisible ? "Show speaker notes in bottom panel" : "Show speaker notes in separate window"}
            aria-pressed={speakerNotesWindowVisible}
          >
            {speakerNotesWindowVisible ? <StickyNote /> : <Eye />}
            <span style={{fontSize: '8px', marginLeft: '2px'}}>{speakerNotesWindowVisible ? 'T' : 'F'}</span>
          </button>
          <button
            onClick={() => handleTtsToggle()}
            className={`p-2 rounded-lg transition-colors shadow-lg border ${
              isLoadingTTS
                ? 'tts-loading-indicator'
                : ttsEnabled
                  ? ''
                  : 'bg-cream hover:bg-gray-100 text-gray-900'
            }`}
            style={
              isLoadingTTS
                ? { background: 'var(--techne-accent, #E63946)', color: 'white', borderColor: 'var(--techne-black, #0a0a0a)' }
                : ttsEnabled
                  ? { background: 'var(--techne-accent, #E63946)', color: 'white', borderColor: 'var(--techne-black, #0a0a0a)' }
                  : {}
            }
            data-tooltip={isLoadingTTS ? "Loading slide narration" : ttsEnabled ? "Disable slide narration" : "Enable slide narration"}
            aria-label={isLoadingTTS ? "Loading slide narration" : ttsEnabled ? "Disable slide narration" : "Enable slide narration"}
            aria-pressed={ttsEnabled}
            disabled={isLoadingTTS}
          >
            {isLoadingTTS ? <LoadingSpinner /> : ttsEnabled ? <Speaker /> : <SpeakerOff />}
          </button>

          {/* Voice Selection Dropdown */}
          <select
            value={selectedVoice}
            onChange={(e) => setSelectedVoice(e.target.value)}
            aria-label="Narration voice"
            className="px-2 py-1 text-sm rounded-lg bg-cream hover:bg-gray-100 text-gray-900 border shadow-lg cursor-pointer"
            data-tooltip="Select narration voice"
            style={{ maxWidth: '90px' }}
          >
            <option value="sarah">Sarah</option>
            <option value="john">John</option>
            <option value="emily">Emily</option>
            <option value="michael">Michael</option>
          </select>

          {/* Recording Controls */}
          {!isRecording ? (
            <button
              onClick={startRecording}
              aria-label="Start presentation recording"
              className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors shadow-lg border border-red-700"
              data-tooltip="Start presentation recording"
            >
              <RecordIcon />
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={togglePauseRecording}
                aria-label={isPaused ? "Resume presentation recording" : "Pause presentation recording"}
                aria-pressed={isPaused}
                className="p-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors shadow-lg border border-yellow-700"
                data-tooltip={isPaused ? "Resume presentation recording" : "Pause presentation recording"}
              >
                {isPaused ? <RecordIcon /> : <PauseIcon />}
              </button>
              <button
                onClick={stopRecording}
                aria-label="Stop presentation recording"
                className="p-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors shadow-lg border border-gray-700"
                data-tooltip="Stop presentation recording"
              >
                <StopIcon />
              </button>
              <span className="px-2 py-1 bg-red-600 text-white rounded text-sm">
                {formatRecordingTime(recordingDuration)}
              </span>
            </div>
          )}
          
          <button
            onClick={() => {
              console.log('[PRESENTATION] Exiting presentation mode...');
              
              // Stop TTS audio
              stopSpeaking();
              
              // Stop video recording if active
              if (isRecording && window.videoRecordingService) {
                console.log('[VIDEO] Stopping recording on presentation exit');
                stopRecording();
              }
              
              // Exit presentation mode
              setIsPresenting(false);
            }}
            className="px-4 py-2 bg-cream hover:bg-gray-100 rounded-lg transition-colors shadow-lg border text-gray-900"
            aria-label="Exit presentation"
          >
            Exit Presentation
          </button>
        </div>
      )}

      <div
        ref={stageRef}
        className="presentation-stage"
        data-fit-mode={isPresenting ? 'contain' : 'canvas'}
        data-fit-state={isPresenting ? (presentationFitReady ? 'ready' : 'measuring') : 'inactive'}
        style={presentationStageStyle}
      >
        {/* Canvas */}
        <div
          ref={canvasRef}
          className="presentation-canvas w-full h-full"
          data-active-scale={activeZoom.toFixed(6)}
          style={{
            transform: `translate(${activePan.x}px, ${activePan.y}px) scale(${activeZoom})`,
            transformOrigin: '0 0',
            transition: (isDragging || isZooming)
              ? 'none'
              : isPresenting
                ? 'transform 0.35s ease-out'
                : 'transform 0.2s ease-out'
          }}
        >
          <div className="relative w-full h-full flex items-center justify-center">
            {/* Slides */}
            {slides.map((slide, index) => {
              const isFocused = index === focusedSlide;
              const isCurrent = index === currentSlide;
              if (isPresenting && !isCurrent) return null;

              return (
                <div
                  key={slide.id}
                  data-slide-index={index}
                  data-current-slide={isCurrent ? 'true' : 'false'}
                  role="group"
                  aria-roledescription="slide"
                  aria-label={`Slide ${index + 1} of ${slides.length}`}
                  aria-current={isCurrent ? 'step' : undefined}
                  tabIndex={isCurrent ? 0 : -1}
                  className={`absolute slide rounded-xl shadow-2xl transition-all duration-500 transform ${
                    slide.backgroundImage ? 'slide-has-bg' : ''
                  } ${
                    isPresenting
                      ? 'presentation-current-slide'
                      : isFocused
                        ? 'ring-4 ring-purple-500 shadow-purple-500/50 animate-pulse'
                        : isCurrent
                          ? 'ring-4 ring-green-500 shadow-green-500/50 scale-105'
                          : 'hover:shadow-3xl hover:scale-105 hover:ring-2 hover:ring-blue-400'
                  }`}
                  style={{
                    '--slide-x': `${slide.position.x}px`,
                    '--slide-y': `${slide.position.y}px`,
                    left: `${slide.position.x}px`,
                    top: `${slide.position.y}px`,
                    width: `${SLIDE_WIDTH}px`,
                    height: `${SLIDE_HEIGHT}px`,
                    minHeight: `${SLIDE_HEIGHT}px`,
                    transform: 'translate(-50%, -50%)',
                    opacity: 1,
                    zIndex: isFocused ? 1000 : isCurrent ? 999 : 1,
                    position: 'absolute',
                    boxSizing: 'border-box',
                    overflow: 'hidden',
                    ...(slide.backgroundImage ? {
                      backgroundImage: `url('${slide.backgroundImage}')`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      backgroundRepeat: 'no-repeat'
                    } : {})
                  }}
                  onDoubleClick={isPresenting ? undefined : () => handleSlideDoubleClick(index)}
                >
                  <PresentationSlideContent html={slide.parsed} isPresenting={isPresenting} />
                </div>
              );
            })}

            {/* Connection Lines */}
            {!isPresenting && (
              <svg className="presentation-connection-lines absolute inset-0 pointer-events-none" aria-hidden="true" focusable="false" style={{ width: '200%', height: '200%' }}>
                {slides.map((slide, index) => {
                  if (index === slides.length - 1) return null;
                  const nextSlide = slides[index + 1];
                  return (
                    <line
                      key={`line-${index}`}
                      x1={slide.position.x + SLIDE_HALF_WIDTH}
                      y1={slide.position.y + SLIDE_HALF_HEIGHT}
                      x2={nextSlide.position.x + SLIDE_HALF_WIDTH}
                      y2={nextSlide.position.y + SLIDE_HALF_HEIGHT}
                      stroke="rgba(255,255,255,0.1)"
                      strokeWidth="2"
                      strokeDasharray="5,5"
                    />
                  );
                })}
              </svg>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Make component available globally
window.MarkdownPreziApp = MarkdownPreziApp;

// Expose statistics functions to window object for sidebar access
window.calculateStatistics = null;
window.formatTime = null;
