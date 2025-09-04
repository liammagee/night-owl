// React presentation component
// Using global React and ReactDOM instead of imports
const React = window.React;
const ReactDOM = window.ReactDOM;
const { useState, useRef, useEffect, useCallback } = React;

// Lucide React icons as simple SVG components
const ChevronLeft = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="15,18 9,12 15,6"></polyline>
  </svg>
);

const ChevronRight = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="9,18 15,12 9,6"></polyline>
  </svg>
);

const Upload = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    <polyline points="7,10 12,15 17,10"></polyline>
    <line x1="12" y1="15" x2="12" y2="3"></line>
  </svg>
);

const ZoomIn = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8"></circle>
    <path d="m21 21-4.35-4.35"></path>
    <line x1="11" y1="8" x2="11" y2="14"></line>
    <line x1="8" y1="11" x2="14" y2="11"></line>
  </svg>
);

const ZoomOut = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8"></circle>
    <path d="m21 21-4.35-4.35"></path>
    <line x1="8" y1="11" x2="14" y2="11"></line>
  </svg>
);

const Home = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
    <polyline points="9,22 9,12 15,12 15,22"></polyline>
  </svg>
);

const Play = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="5,3 19,12 5,21"></polygon>
  </svg>
);

const StickyNote = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 3v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V3z"></path>
    <path d="M8 7h8"></path>
    <path d="M8 11h8"></path>
    <path d="M8 15h5"></path>
  </svg>
);

const Eye = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
    <circle cx="12" cy="12" r="3"></circle>
  </svg>
);

const EyeOff = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"></path>
    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 11 8 11 8a13.16 13.16 0 0 1-1.67 2.68"></path>
    <path d="M6.61 6.61A13.526 13.526 0 0 0 1 12s4 8 11 8a9.74 9.74 0 0 0 5.39-1.61"></path>
    <line x1="2" y1="2" x2="22" y2="22"></line>
  </svg>
);

const Speaker = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
  </svg>
);

const SpeakerOff = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
    <line x1="23" y1="1" x2="1" y2="23"></line>
  </svg>
);

const MarkdownPreziApp = () => {
  // Check if running in Electron
  const isElectron = window.electronAPI && window.electronAPI.isElectron;
  
  // React component rendering
  const [slides, setSlides] = useState([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
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
  
  // Current slides and slide index state
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

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

  // Calculate slide positioning based on layout type
  const calculateSlidePosition = (index, total) => {
    const spacing = 800;
    
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
        const circleRadius = 600;
        return {
          x: Math.cos(circleAngle) * circleRadius,
          y: Math.sin(circleAngle) * circleRadius
        };
        
      case 'spiral':
        if (index === 0) return { x: 0, y: 0 };
        const spiralAngle = (index / total) * 4 * Math.PI;
        const spiralRadius = 300 + (index * 100);
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

  // Enhanced markdown parser
  const parseMarkdownContent = (content) => {
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
        const baseDir = window.currentFileDirectory || '/Users/lmagee/Dev/hegel-pedagogy-ai/lectures';
        const fullPath = `file://${baseDir}/${imagePath}`;
        console.log(`[React Presentation] Converting image path: ${imagePath} -> ${fullPath}`);
        return `<img src="${fullPath}" alt="${altText}" />`;
      }
      return `<img src="${imagePath}" alt="${altText}" />`;
    });
    
    // Process math expressions before other markdown to preserve them
    // Note: We preserve LaTeX math syntax for MathJax to process later
    // This ensures math expressions don't get processed as other markdown
    
    // Process Obsidian-style [[]] internal links first
    html = html.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (match, link, displayText) => {
      const cleanLink = link.trim();
      const display = displayText ? displayText.trim() : cleanLink;
      let filePath = cleanLink;
      if (!filePath.endsWith('.md') && !filePath.includes('.')) {
        filePath += '.md';
      }
      return `<a href="#" class="internal-link" data-link="${encodeURIComponent(filePath)}" data-original-link="${encodeURIComponent(cleanLink)}" title="Open ${display}">${display}</a>`;
    });
    
    // Regular markdown links
    html = html.replace(/\[([^\]]+)\]\(([^\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    
    // Handle lists
    html = html.replace(/^[\s]*[-*+]\s+(.+)$/gm, '<li>$1</li>');
    html = html.replace(/^[\s]*\d+\.\s+(.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\s*)+/gs, '<ul>$&</ul>');
    
    // Blockquotes
    html = html.replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>');
    
    // Horizontal rules
    html = html.replace(/^---\s*$/gm, '<hr>');
    
    // Convert remaining text to paragraphs
    const lines = html.split('\n');
    const processedLines = lines.map(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.match(/^<(h[1-6]|ul|ol|li|blockquote|pre|hr|div)/)) {
        return line;
      }
      return trimmed ? `<p>${trimmed}</p>` : '';
    });
    
    html = processedLines.join('\n');
    html = html.replace(/\n+/g, '\n');
    html = html.replace(/<p>\s*<\/p>/g, '');
    
    return html;
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

  // Parse markdown into slides
  const parseMarkdown = (markdown) => {
    const slideTexts = markdown.split('---').map(slide => slide.trim()).filter(slide => slide);
    return slideTexts.map((text, index) => {
      const { cleanContent, speakerNotes } = extractSpeakerNotes(text);
      return {
        id: index,
        content: text,
        cleanContent: cleanContent,
        speakerNotes: speakerNotes,
        position: calculateSlidePosition(index, slideTexts.length),
        parsed: parseMarkdownContent(cleanContent) // Parse only clean content
      };
    });
  };

  // Initialize - wait for content from editor or use sample as fallback
  useEffect(() => {
    // Initializing presentation component
    
    // Brief delay to allow content synchronization from editor
    const initTimeout = setTimeout(() => {
      // Check if there's pending content from Generate Summary or fresh editor content
      if (window.pendingPresentationContent) {
        // Found pending content, using it
        const pendingSlides = parseMarkdown(window.pendingPresentationContent);
        setSlides(pendingSlides);
        window.pendingPresentationContent = null; // Clear it after use
      } else {
        // No pending content, using sample content
        const initialSlides = parseMarkdown(sampleMarkdown);
        setSlides(initialSlides);
      }
    }, 100); // Small delay to allow content synchronization
    
    return () => clearTimeout(initTimeout);
  }, []);

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

  // Set up Electron API listeners (only once)
  useEffect(() => {
    if (isElectron && window.electronAPI) {
      // File loading
      window.electronAPI.loadPresentationFile((content, filePath, error) => {
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
      });

      // Presentation controls
      window.electronAPI.onStartPresentation(() => {
        setIsPresenting(true);
      });

      window.electronAPI.onExitPresentation(() => {
        setIsPresenting(false);
        // Stop any TTS when exiting presentation mode
        stopSpeaking();
      });

      window.electronAPI.onTogglePresentationMode(() => {
        // Switch to presentation mode
        switchToMode('presentation');
      });

      // Zoom controls
      window.electronAPI.onZoomIn(() => {
        handleZoomIn();
      });

      window.electronAPI.onZoomOut(() => {
        handleZoomOut();
      });

      window.electronAPI.onResetZoom(() => {
        resetView();
      });

      // Layout changes
      window.electronAPI.onChangeLayout((layout) => {
        setLayoutType(layout);
      });
    }

    return () => {
      if (isElectron && window.electronAPI) {
        window.electronAPI.removeAllListeners();
      }
    };
  }, []);

  // Clean up any existing IPC navigation listeners to prevent conflicts
  useEffect(() => {
    if (isElectron && window.electronAPI && window.electronAPI.removeAllListeners) {
      // Remove any existing navigation listeners that might be causing conflicts
      window.electronAPI.removeAllListeners();
      console.log('[Navigation] Cleaned up all existing IPC listeners to prevent conflicts');
    }
    
    // Reset navigation setup flag so no stale listeners remain
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

  // Render math in slides whenever slides change
  useEffect(() => {
    if (slides.length > 0 && window.MathJax && window.MathJax.typesetPromise) {
      // Small delay to ensure slides are rendered in DOM
      const timer = setTimeout(() => {
        const presentationContainer = document.getElementById('presentation-content');
        if (presentationContainer) {
          window.MathJax.typesetPromise([presentationContainer])
            .catch((err) => console.error('Error rendering math in presentation:', err));
        }
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [slides]);


  // Navigate to specific slide with smooth transition
  const goToSlide = useCallback((slideIndex) => {
    if (slideIndex < 0 || slideIndex >= slides.length) return;
    
    const slide = slides[slideIndex];
    const canvas = canvasRef.current;
    if (!canvas) {
      console.warn('[Presentation] Canvas not ready for goToSlide, retrying...');
      setTimeout(() => goToSlide(slideIndex), 50);
      return;
    }

    // Ensure canvas has proper dimensions
    if (canvas.clientWidth === 0 || canvas.clientHeight === 0) {
      console.warn('[Presentation] Canvas dimensions not ready, retrying...');
      setTimeout(() => goToSlide(slideIndex), 50);
      return;
    }

    const targetZoom = 1.2;
    const viewportCenterX = canvas.clientWidth / 2;
    const viewportCenterY = canvas.clientHeight / 2;
    const slideCenterX = slide.position.x;
    const slideCenterY = slide.position.y;
    
    const targetPan = {
      x: viewportCenterX - (slideCenterX * targetZoom),
      y: viewportCenterY - (slideCenterY * targetZoom)
    };

    console.log('[Presentation] Centering slide', slideIndex, 'at position:', targetPan);
    
    setCurrentSlide(slideIndex);
    setFocusedSlide(null);
    setZoom(targetZoom);
    setPan(targetPan);
    
    // Ensure speaker notes are updated immediately when slide changes
    // This is especially important on second presentation load
    if (isPresenting && window.updateSpeakerNotes && typeof window.updateSpeakerNotes === 'function' && slides.length > 0) {
      const currentContent = slides.map(slide => slide.content).join('\n\n---\n\n');
      // Use setTimeout to ensure state update completes first
      setTimeout(() => {
        window.updateSpeakerNotes(slideIndex, currentContent);
      }, 50);
    }
  }, [slides, isPresenting]);

  // Handle double click on slide to zoom in and focus
  const handleSlideDoubleClick = (slideIndex) => {
    const slide = slides[slideIndex];
    const canvas = canvasRef.current;
    if (!canvas) return;

    const targetZoom = 2;
    const viewportCenterX = canvas.clientWidth / 2;
    const viewportCenterY = canvas.clientHeight / 2;
    const slideCenterX = slide.position.x;
    const slideCenterY = slide.position.y;
    
    const targetPan = {
      x: viewportCenterX - (slideCenterX * targetZoom),
      y: viewportCenterY - (slideCenterY * targetZoom)
    };

    setCurrentSlide(slideIndex);
    setFocusedSlide(slideIndex);
    setZoom(targetZoom);
    setPan(targetPan);
  };

  // Zoom handlers - zoom from current slide center
  const handleZoomIn = () => {
    const newZoom = Math.min(3, zoom * 1.2);
    zoomFromCurrentSlide(newZoom);
  };

  const handleZoomOut = () => {
    const newZoom = Math.max(0.1, zoom * 0.8);
    zoomFromCurrentSlide(newZoom);
  };

  // Helper function to zoom from current slide center
  const zoomFromCurrentSlide = (newZoom) => {
    if (slides.length === 0 || currentSlide >= slides.length) {
      setZoom(newZoom);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      setZoom(newZoom);
      return;
    }

    const slide = slides[currentSlide];
    const viewportCenterX = canvas.clientWidth / 2;
    const viewportCenterY = canvas.clientHeight / 2;
    
    // Calculate the current slide's position on screen
    const currentSlideCenterX = slide.position.x * zoom + pan.x;
    const currentSlideCenterY = slide.position.y * zoom + pan.y;
    
    // Calculate new pan to keep slide centered at new zoom level
    const newPan = {
      x: viewportCenterX - (slide.position.x * newZoom),
      y: viewportCenterY - (slide.position.y * newZoom)
    };

    setZoom(newZoom);
    setPan(newPan);
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setFocusedSlide(null);
  };

  // Wheel zoom effect
  useEffect(() => {
    const handleWheel = (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(0.1, Math.min(3, zoom * zoomFactor));
      setZoom(newZoom);
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false });
      return () => container.removeEventListener('wheel', handleWheel);
    }
  }, [zoom]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyPress = (e) => {
      // Only handle keyboard events if we're in presentation view and not focused on an input element
      const presentationContent = document.getElementById('presentation-content');
      const isInPresentationView = presentationContent && presentationContent.classList.contains('active');
      const isInputFocused = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable;
      
      if (!isInPresentationView || isInputFocused) {
        return; // Don't handle keyboard events if not in presentation view or if an input is focused
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
      } else if (e.key === 'Escape') {
        setIsPresenting(false);
        // Stop any TTS when escaping presentation mode
        stopSpeaking();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [currentSlide, goToSlide]);

  // Control body class for presenting mode
  useEffect(() => {
    if (isPresenting) {
      document.body.classList.add('is-presenting');
      console.log('[Presentation] Added is-presenting class to body');
      
      // Focus the main window to ensure keyboard navigation works immediately (multiple attempts)
      const focusMainWindow = () => {
        if (window.electronAPI && window.electronAPI.invoke) {
          window.electronAPI.invoke('focus-main-window');
          console.log('[Presentation] Focused main window for keyboard navigation');
        } else {
          // Fallback for non-Electron environments
          window.focus();
        }
      };
      
      // Immediate focus
      focusMainWindow();
      
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
          if (window.electronAPI && window.electronAPI.invoke) {
            window.electronAPI.invoke('focus-main-window');
            console.log('[Presentation] Re-focused main window after speaker notes window opened');
          } else {
            window.focus();
          }
          
          // Add additional aggressive focus attempts
          setTimeout(() => {
            if (window.electronAPI && window.electronAPI.invoke) {
              window.electronAPI.invoke('focus-main-window');
              console.log('[Presentation] Additional focus attempt at 1.5s');
            }
          }, 500); // 1.5 seconds total
          
          setTimeout(() => {
            if (window.electronAPI && window.electronAPI.invoke) {
              window.electronAPI.invoke('focus-main-window');
              console.log('[Presentation] Final focus attempt at 2s');
            }
          }, 1000); // 2 seconds total
        }
      }, 1000); // Wait for legacy system to finish
      
      console.log('[Presentation] Entering presentation mode - current speakerNotesWindowVisible:', speakerNotesWindowVisible);
    } else {
      document.body.classList.remove('is-presenting');
      console.log('[Presentation] Removed is-presenting class from body');
    }
  }, [isPresenting]);

  // Listen for external exit presentation events
  useEffect(() => {
    const handleExitPresenting = () => {
      setIsPresenting(false);
      // Stop any TTS when exiting presentation mode externally
      stopSpeaking();
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
      if (window.electronAPI.on) {
        const cleanup = window.electronAPI.on('speaker-notes-window-closed', handleSpeakerNotesWindowClosed);
        return cleanup;
      }
    }
  }, [isElectron]);

  // Speak notes when slide changes if TTS is enabled
  useEffect(() => {
    if (ttsEnabled && slides[currentSlide]?.speakerNotes) {
      speakText(slides[currentSlide].speakerNotes);
    }
  }, [currentSlide, ttsEnabled]);

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
          
          await window.electronAPI.invoke('update-speaker-notes', {
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
              notesContent.innerHTML = window.markdownToHtml(currentSlideNotes);
            } else {
              notesContent.innerHTML = currentSlideNotes.replace(/\n/g, '<br>');
            }
          } else {
            notesContent.innerHTML = '<em>No speaker notes for this slide.</em>';
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
    
    setTtsEnabled(prev => !prev);
    
    // If turning on TTS, speak the current slide's speaker notes
    if (!ttsEnabled && slides[currentSlide]?.speakerNotes) {
      console.log('[PRESENTATION-TTS] Enabling TTS and starting speech');
      speakText(slides[currentSlide].speakerNotes);
    } else if (ttsEnabled) {
      // If turning off TTS, stop any current speech
      console.log('[PRESENTATION-TTS] Disabling TTS and stopping speech');
      stopSpeaking();
    }
  };

  // Speak text using TTS
  const speakText = async (text) => {
    console.log('[PRESENTATION-TTS] === speakText called ===');
    console.log('[PRESENTATION-TTS] Text length:', text?.length || 0);
    console.log('[PRESENTATION-TTS] window.ttsService available:', !!window.ttsService);
    
    if (!text) {
      console.warn('[PRESENTATION-TTS] No text to speak');
      return;
    }
    
    console.log('[PRESENTATION-TTS] Text preview:', text.substring(0, 100) + '...');
    setIsSpeaking(true);
    
    // Use the TTS service if available
    if (window.ttsService) {
      try {
        // Ensure Lemonfox availability has been checked
        console.log('[PRESENTATION-TTS] Checking Lemonfox availability...');
        await window.ttsService.checkLemonfoxAvailability();
        
        console.log('[PRESENTATION-TTS] Calling ttsService.speak()...');
        await window.ttsService.speak(text, {
          onStart: () => {
            console.log('[PRESENTATION-TTS] Speech started (onStart callback)');
            setIsSpeaking(true);
          },
          onEnd: () => {
            console.log('[PRESENTATION-TTS] Speech ended (onEnd callback)');
            setIsSpeaking(false);
          },
          onError: (error) => {
            console.error('[PRESENTATION-TTS] Speech error (onError callback):', error);
            setIsSpeaking(false);
          }
        });
        console.log('[PRESENTATION-TTS] ttsService.speak() promise resolved');
      } catch (error) {
        console.error('[PRESENTATION-TTS] Exception in speakText:', error);
        console.error('[PRESENTATION-TTS] Error stack:', error.stack);
        setIsSpeaking(false);
      }
    } else {
      console.error('[PRESENTATION-TTS] TTS service not available on window object!');
      // Fallback: simulate speaking completion after 3 seconds
      setTimeout(() => {
        setIsSpeaking(false);
      }, 3000);
    }
  };

  // Stop speaking
  const stopSpeaking = () => {
    console.log('[PRESENTATION-TTS] === stopSpeaking called ===');
    console.log('[PRESENTATION-TTS] window.ttsService available:', !!window.ttsService);
    
    if (window.ttsService) {
      console.log('[PRESENTATION-TTS] Calling ttsService.stop()');
      window.ttsService.stop();
    } else {
      console.warn('[PRESENTATION-TTS] TTS service not available for stopping');
    }
    setIsSpeaking(false);
  };

  const toggleSpeakerNotesWindow = async () => {
    console.log('[TOGGLE DEBUG] Starting toggle - speakerNotesWindowVisible:', speakerNotesWindowVisible);
    if (!isPresenting || !window.electronAPI) {
      console.log('[TOGGLE DEBUG] Cannot toggle - isPresenting:', isPresenting, 'hasElectronAPI:', !!window.electronAPI);
      return;
    }
    
    if (speakerNotesWindowVisible) {
      // Switch from separate window to inline panel
      try {
        // Temporarily disable external close handler to prevent race condition
        window.REACT_CONTROLLED_TOGGLE = true;
        
        // Close the separate window
        await window.electronAPI.invoke('close-speaker-notes-window');
        setSpeakerNotesWindowVisible(false);
        // Clear the flag since we're now explicitly using inline panel
        window.explicitlySeparateWindow = false;
        // Set flag to allow inline panel to show
        window.REACT_READY_FOR_INLINE = true;
        
        // Stop monitoring panel visibility since we want inline panel to be visible now
        if (window.panelVisibilityMonitor) {
          clearInterval(window.panelVisibilityMonitor);
          window.panelVisibilityMonitor = null;
          console.log('[Panel Monitor] Stopped - switching to inline panel');
        }
        
        // Show the inline panel with current slide notes - recreate if needed
        let panel = document.getElementById('speaker-notes-panel');
        if (!panel && window.speakerNotesPanel_HTML) {
          // Recreate panel from stored HTML
          const presentationContent = document.getElementById('presentation-content');
          if (presentationContent) {
            presentationContent.insertAdjacentHTML('beforeend', window.speakerNotesPanel_HTML);
            panel = document.getElementById('speaker-notes-panel');
            console.log('[React Presentation] Recreated panel from stored HTML');
          }
        }
        
        if (panel && window.speakerNotesData) {
          panel.style.setProperty('display', 'block', 'important');
          
          // Update the inline panel with current slide notes
          const notesContainer = document.getElementById('current-slide-notes');
          if (notesContainer) {
            const currentSlideNotes = window.speakerNotesData.allNotes[currentSlide] || '';
            if (currentSlideNotes && window.markdownToHtml) {
              notesContainer.innerHTML = window.markdownToHtml(currentSlideNotes);
            } else {
              notesContainer.innerHTML = currentSlideNotes || '<em>No speaker notes for this slide.</em>';
            }
          }
        }
        
        console.log('[React Presentation] Switched to inline panel');
      } catch (error) {
        console.error('[React Presentation] Failed to switch to inline panel:', error);
      } finally {
        // Ensure flag is cleared even if there was an error
        window.REACT_CONTROLLED_TOGGLE = false;
      }
    } else {
      // Switch from inline panel to separate window
      console.log('[TOGGLE DEBUG] Switching from inline panel to separate window');
      try {
        // Set controlled toggle flag for this direction too
        window.REACT_CONTROLLED_TOGGLE = true;
        // COMPLETELY REMOVE the inline panel from DOM (nuclear option)
        const panel = document.getElementById('speaker-notes-panel');
        console.log('[TOGGLE DEBUG] Found panel element:', !!panel);
        if (panel) {
          // Store panel HTML for later restoration if needed
          window.speakerNotesPanel_HTML = panel.outerHTML;
          panel.remove();
          console.log('[TOGGLE DEBUG] REMOVED inline panel from DOM');
        }
        
        // ALSO hide the sidebar speaker notes pane if it's visible
        const sidebarPane = document.getElementById('speaker-notes-pane');
        if (sidebarPane) {
          sidebarPane.style.display = 'none';
          console.log('[React Presentation] Hidden sidebar speaker notes pane');
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
          console.log('[TOGGLE DEBUG] Opening separate window with data:', {
            totalSlides: window.speakerNotesData.allNotes.length,
            currentSlide,
            currentSlideHasNotes: !!window.speakerNotesData.allNotes[currentSlide],
            allNotesPreview: window.speakerNotesData.allNotes.map((note, i) => ({ 
              slideIndex: i, 
              hasNotes: !!note, 
              preview: note ? note.substring(0, 30) + '...' : 'empty' 
            }))
          });
          
          const currentSlideNotes = window.speakerNotesData.allNotes[currentSlide] || '';
          let formattedNotes;
          if (currentSlideNotes) {
            if (window.markdownToHtml && typeof window.markdownToHtml === 'function') {
              formattedNotes = window.markdownToHtml(currentSlideNotes);
              console.log('[TOGGLE DEBUG] Formatted notes with markdownToHtml:', formattedNotes.substring(0, 100));
            } else {
              formattedNotes = currentSlideNotes.split('\n')
                .map(line => line.trim())
                .filter(line => line)
                .join('<br>');
              console.log('[TOGGLE DEBUG] Formatted notes with simple formatting:', formattedNotes.substring(0, 100));
            }
          } else {
            formattedNotes = '<em>No speaker notes for this slide.</em>';
            console.log('[TOGGLE DEBUG] No notes for current slide, using fallback');
          }
          
          await window.electronAPI.invoke('open-speaker-notes-window', {
            notes: formattedNotes,
            slideNumber: currentSlide + 1,
            allNotes: window.speakerNotesData.allNotes
          });
          setSpeakerNotesWindowVisible(true);
          // Set a flag to prevent useEffect from showing inline panel
          window.explicitlySeparateWindow = true;
          
          // Focus main window after opening speaker notes window
          setTimeout(() => {
            if (window.electronAPI && window.electronAPI.invoke) {
              window.electronAPI.invoke('focus-main-window');
              console.log('[TOGGLE DEBUG] Focused main window after opening separate speaker notes window');
            }
          }, 100); // Short delay to ensure window has opened
          // Clear inline panel flag
          window.REACT_READY_FOR_INLINE = false;
          console.log('[TOGGLE DEBUG] *** SET STATE AND FLAG - speakerNotesWindowVisible: true, explicitlySeparateWindow: true ***');
          
          // Immediately hide any visible panel before starting monitoring
          const panel = document.getElementById('speaker-notes-panel');
          if (panel) {
            panel.style.setProperty('display', 'none', 'important');
            console.log('[TOGGLE DEBUG] Immediately hidden panel before starting monitor');
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
                  console.log('[Panel Monitor] Force hidden panel - separate window is active (was computed:', computedStyle.display, ')');
                }
              }
            }
          }, 100); // Check every 100ms
        } else {
          console.warn('[React Presentation] No speaker notes data available for separate window');
          // Still set the state to indicate separate window should be visible
          setSpeakerNotesWindowVisible(true);
        }
        
        console.log('[React Presentation] Switched to separate window');
      } catch (error) {
        console.error('[React Presentation] Failed to switch to separate window:', error);
        // Ensure panel stays hidden even if separate window fails
        const panel = document.getElementById('speaker-notes-panel');
        if (panel) {
          panel.style.setProperty('display', 'none', 'important');
          console.log('[React Presentation] Ensured panel stays hidden after error');
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
    // Allow panning from anywhere in the canvas, even during presentation
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setPanStart(pan);
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const deltaX = e.clientX - dragStart.x;
    const deltaY = e.clientY - dragStart.y;
    setPan({
      x: panStart.x + deltaX,
      y: panStart.y + deltaY
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  return (
    <div 
      ref={containerRef}
      className="w-full h-screen relative overflow-hidden cursor-grab active:cursor-grabbing" 
      style={{background: 'linear-gradient(135deg, #14532d 0%, #15803d 50%, #22c55e 100%)'}}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Controls */}
      {!isPresenting && (
        <div className="absolute top-4 left-4 z-10 flex gap-2">
          <select
            value={layoutType}
            onChange={(e) => setLayoutType(e.target.value)}
            className="px-3 py-2 text-gray-900 rounded-lg border border-gray-300 focus:border-green-500 outline-none shadow-lg"
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
        <div className="absolute top-4 right-4 z-10 flex gap-2">
          <button
            onClick={handleZoomIn}
            className="p-2 bg-cream hover:bg-gray-100 rounded-lg transition-colors shadow-lg border text-gray-900"
            title="Zoom In"
          >
            <ZoomIn />
          </button>
          <button
            onClick={handleZoomOut}
            className="p-2 bg-cream hover:bg-gray-100 rounded-lg transition-colors shadow-lg border text-gray-900"
            title="Zoom Out"
          >
            <ZoomOut />
          </button>
          <button
            onClick={resetView}
            className="p-2 bg-cream hover:bg-gray-100 rounded-lg transition-colors shadow-lg border text-gray-900"
            title="Reset View"
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
            title="Export as PNG"
          >
            📸
          </button>
          <button
            onClick={() => setIsPresenting(true)}
            className="flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition-colors shadow-lg border border-green-700 text-white"
          >
            <Play />
            Present
          </button>
        </div>
      )}

      {/* Navigation Controls */}
      <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50 flex items-center gap-4">
        <button
          onClick={() => goToSlide(currentSlide - 1)}
          disabled={currentSlide === 0}
          className="p-3 bg-cream hover:bg-gray-100 disabled:bg-gray-300 disabled:opacity-50 rounded-full transition-colors shadow-lg border text-gray-900"
        >
          <ChevronLeft />
        </button>
        
        <div className="flex items-center gap-2 px-4 py-2 bg-cream rounded-lg shadow-lg border text-gray-900">
          <span className="text-sm">
            {currentSlide + 1} / {slides.length}
          </span>
          {slides.length > 0 && (
            <div className="flex gap-1 ml-2">
              {slides.map((_, index) => (
                <button
                  key={index}
                  onClick={() => goToSlide(index)}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    index === currentSlide ? 'bg-green-500' : 'bg-gray-400'
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        <button
          onClick={() => goToSlide(currentSlide + 1)}
          disabled={currentSlide === slides.length - 1}
          className="p-3 bg-cream hover:bg-gray-100 disabled:bg-gray-300 disabled:opacity-50 rounded-full transition-colors shadow-lg border text-gray-900"
        >
          <ChevronRight />
        </button>
      </div>

      {/* Presentation Mode Controls */}
      {isPresenting && (
        <div className="absolute top-4 right-4 z-10 flex gap-2">
          <button
            onClick={handleZoomIn}
            className="p-2 bg-cream hover:bg-gray-100 rounded-lg transition-colors shadow-lg border text-gray-900"
            title="Zoom In"
          >
            <ZoomIn />
          </button>
          <button
            onClick={handleZoomOut}
            className="p-2 bg-cream hover:bg-gray-100 rounded-lg transition-colors shadow-lg border text-gray-900"
            title="Zoom Out"
          >
            <ZoomOut />
          </button>
          <button
            onClick={resetView}
            className="p-2 bg-cream hover:bg-gray-100 rounded-lg transition-colors shadow-lg border text-gray-900"
            title="Reset Zoom"
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
            title="Export as PNG"
          >
            📸
          </button>
          <button
            onClick={() => {
              console.log('[BUTTON DEBUG] Button clicked - current state speakerNotesWindowVisible:', speakerNotesWindowVisible);
              toggleSpeakerNotesWindow();
            }}
            className={`p-2 rounded-lg transition-colors shadow-lg border ${
              speakerNotesWindowVisible 
                ? 'bg-green-600 hover:bg-green-700 text-white border-green-700' 
                : 'bg-cream hover:bg-gray-100 text-gray-900'
            }`}
            title={speakerNotesWindowVisible ? "Switch to Bottom Panel" : "Switch to Separate Window"}
          >
            {speakerNotesWindowVisible ? <StickyNote /> : <Eye />}
            <span style={{fontSize: '8px', marginLeft: '2px'}}>{speakerNotesWindowVisible ? 'T' : 'F'}</span>
          </button>
          <button
            onClick={() => handleTtsToggle()}
            className={`p-2 rounded-lg transition-colors shadow-lg border ${
              ttsEnabled 
                ? 'bg-blue-600 hover:bg-blue-700 text-white border-blue-700' 
                : 'bg-cream hover:bg-gray-100 text-gray-900'
            }`}
            title={ttsEnabled ? "Disable Text-to-Speech" : "Enable Text-to-Speech"}
          >
            {ttsEnabled ? <Speaker /> : <SpeakerOff />}
          </button>
          <button
            onClick={() => setIsPresenting(false)}
            className="px-4 py-2 bg-cream hover:bg-gray-100 rounded-lg transition-colors shadow-lg border text-gray-900"
          >
            Exit Presentation
          </button>
        </div>
      )}

      {/* Canvas */}
      <div
        ref={canvasRef}
        className="w-full h-full"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: 'center center',
          transition: isDragging ? 'none' : 'transform 0.3s ease-out'
        }}
      >
        <div className="relative w-full h-full flex items-center justify-center">
          {/* Slides */}
          {slides.map((slide, index) => {
            const isFocused = index === focusedSlide;
            const isCurrent = index === currentSlide;
            
            return (
              <div
                key={slide.id}
                className={`absolute bg-cream text-gray-900 rounded-xl shadow-2xl transition-all duration-300 cursor-pointer ${
                  isFocused 
                    ? 'ring-4 ring-purple-500 shadow-purple-500/50' 
                    : isCurrent 
                      ? 'ring-4 ring-green-500' 
                      : 'hover:shadow-3xl hover:scale-105'
                }`}
                style={{
                  left: `${slide.position.x}px`,
                  top: `${slide.position.y}px`,
                  width: '600px',
                  minHeight: '400px',
                  transform: 'translate(-50%, -50%)',
                  opacity: isPresenting && index !== currentSlide ? 0.1 : 1,
                  zIndex: isFocused ? 1000 : isCurrent ? 999 : isPresenting && index !== currentSlide ? 0 : 1,
                  position: 'absolute'
                }}
                onDoubleClick={() => handleSlideDoubleClick(index)}
              >
                <div className="p-8 h-full">
                    <div 
                    className="slide-content"
                    dangerouslySetInnerHTML={{ __html: slide.parsed }}
                  />
                </div>
              </div>
            );
          })}

          {/* Connection Lines */}
          <svg className="absolute inset-0 pointer-events-none" style={{ width: '200%', height: '200%' }}>
            {slides.map((slide, index) => {
              if (index === slides.length - 1) return null;
              const nextSlide = slides[index + 1];
              return (
                <line
                  key={`line-${index}`}
                  x1={slide.position.x + 300}
                  y1={slide.position.y + 200}
                  x2={nextSlide.position.x + 300}
                  y2={nextSlide.position.y + 200}
                  stroke="rgba(255,255,255,0.1)"
                  strokeWidth="2"
                  strokeDasharray="5,5"
                />
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
};

// Make component available globally
window.MarkdownPreziApp = MarkdownPreziApp;