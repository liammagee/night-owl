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

const RecordIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10"></circle>
  </svg>
);

const StopIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2">
    <rect x="6" y="6" width="12" height="12"></rect>
  </svg>
);

const PauseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="6" y="4" width="4" height="16"></rect>
    <rect x="14" y="4" width="4" height="16"></rect>
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
  const ttsStateRef = useRef({ 
    isAdvancing: false,
    currentSpeakingSlide: -1 
  });
  
  // Video recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingTimerRef = useRef(null);
  
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
  const processListSection = (listHtml) => {
    const lines = listHtml.split('\n');
    const processedLines = [];
    const listStack = [];

    for (const line of lines) {
      const unorderedMatch = line.match(/^(\s*)[-*+]\s+(.+)$/);
      const orderedMatch = line.match(/^(\s*)(\d+)\.\s+(.+)$/);

      if (unorderedMatch || orderedMatch) {
        const indent = (unorderedMatch || orderedMatch)[1].length;
        const content = unorderedMatch ? unorderedMatch[2] : orderedMatch[3];
        const isOrdered = !!orderedMatch;

        // Close lists deeper than current level
        while (listStack.length > 0 && listStack[listStack.length - 1].indent >= indent) {
          const closedList = listStack.pop();
          processedLines.push(`</${closedList.type}>`);
        }

        // Start new list if needed
        if (listStack.length === 0 || listStack[listStack.length - 1].indent < indent) {
          const listType = isOrdered ? 'ol' : 'ul';
          processedLines.push(`<${listType} class="markdown-list">`);
          listStack.push({ type: listType, indent: indent });
        }

        // Add list item
        processedLines.push(`<li class="markdown-list-item">${content}</li>`);
      }
    }

    // Close all remaining open lists
    while (listStack.length > 0) {
      const closedList = listStack.pop();
      processedLines.push(`</${closedList.type}>`);
    }

    return processedLines.join('\n');
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
    // Split content by slide separators (--- on standalone lines)
    // Match --- that is either at start/end of string or surrounded by newlines
    const slideSeparatorRegex = /(?:^|\n)---(?:\n|$)/;
    const slideTexts = markdown.split(slideSeparatorRegex).map(slide => slide.trim()).filter(slide => slide);
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
  }, [slides, isPresenting, isRecording]);

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
        console.log('[PRESENTATION] External exit presentation triggered...');
        
        // Stop TTS audio
        stopSpeaking();
        
        // Stop video recording if active
        if (isRecording && window.videoRecordingService) {
          console.log('[VIDEO] Stopping recording on external exit');
          stopRecording();
        }
        
        setIsPresenting(false);
      });

      window.electronAPI.onTogglePresentationMode(() => {
        // Switch to presentation mode
        switchToMode('presentation');
      });

      // Auto-generate and show statistics
      window.electronAPI.onShowPresentationStatistics(() => {
        console.log('[PRESENTATION] Auto-generating and showing statistics');
        // Auto-switch to statistics view and display immediately
        if (window.switchStructureView) {
          window.switchStructureView('statistics');
        }
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
      if (window.electronAPI.on) {
        const cleanup = window.electronAPI.on('speaker-notes-window-closed', handleSpeakerNotesWindowClosed);
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
        
        // Start the TTS - try with callback first, fallback to polling
        let ttsPromise;
        if (window.ttsService.speak.length > 1) {
          // TTS service supports callbacks
          console.log('[PRESENTATION-TTS] 📞 Using callback-based TTS');
          ttsPromise = window.ttsService.speak(text, handleCompletion);
        } else {
          // No callback support, use polling method
          console.log('[PRESENTATION-TTS] 📊 Using polling-based TTS');
          ttsPromise = window.ttsService.speak(text);
        }
        
        // Only use polling if no callback support
        if (window.ttsService.speak.length <= 1) {
          // Poll the TTS service to check when it's done speaking (fallback method)
          let pollCount = 0;
          const maxPollCount = 120; // 120 * 500ms = 60 seconds max
          const checkCompletion = () => {
            pollCount++;
            console.log('[PRESENTATION-TTS] 🔍 Polling completion - count:', pollCount, 'isSpeaking:', window.ttsService.isSpeaking);
            
            if (!window.ttsService.isSpeaking || pollCount >= maxPollCount) {
              if (completionHandled) return; // Callback already handled it
              handleCompletion(); // Use the same completion handler
            } else {
              // Still speaking, check again in 500ms
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
            ttsStateRef.current.isAdvancing = false;
            ttsStateRef.current.currentSpeakingSlide = -1;
          }
        }, 30000); // 30 second max timeout
        
      } catch (error) {
        console.error('[PRESENTATION-TTS] ❌ Exception:', error);
        setIsSpeaking(false);
        ttsStateRef.current.isAdvancing = false;
        ttsStateRef.current.currentSpeakingSlide = -1;
      }
    } else {
      console.error('[PRESENTATION-TTS] TTS service not available!');
      setIsSpeaking(false);
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
      const includeAudio = confirm('Do you want to include audio in the recording? (Microphone permission will be requested)');
      
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

  // Expose statistics functions to window object for sidebar access
  useEffect(() => {
    window.calculateStatistics = calculateStatistics;
    window.formatTime = formatTime;
    return () => {
      window.calculateStatistics = null;
      window.formatTime = null;
    };
  }, []);

  return (
    <div 
      ref={containerRef}
      className="w-full h-screen relative overflow-hidden cursor-grab active:cursor-grabbing" 
      style={{background: 'var(--presentation-bg-gradient, linear-gradient(135deg, #14532d 0%, #15803d 50%, #22c55e 100%))'}}
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
          
          {/* Recording Controls */}
          {!isRecording ? (
            <button
              onClick={startRecording}
              className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors shadow-lg border border-red-700"
              title="Start Recording"
            >
              <RecordIcon />
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={togglePauseRecording}
                className="p-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors shadow-lg border border-yellow-700"
                title={isPaused ? "Resume Recording" : "Pause Recording"}
              >
                {isPaused ? <RecordIcon /> : <PauseIcon />}
              </button>
              <button
                onClick={stopRecording}
                className="p-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors shadow-lg border border-gray-700"
                title="Stop Recording"
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
          transition: isDragging ? 'none' : 'transform 0.8s cubic-bezier(0.68, -0.55, 0.265, 1.55)'
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
                className={`absolute slide rounded-xl shadow-2xl transition-all duration-500 cursor-pointer transform ${
                  isFocused
                    ? 'ring-4 ring-purple-500 shadow-purple-500/50 animate-pulse'
                    : isCurrent
                      ? 'ring-4 ring-green-500 shadow-green-500/50 scale-105'
                      : 'hover:shadow-3xl hover:scale-105 hover:ring-2 hover:ring-blue-400'
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

// Expose statistics functions to window object for sidebar access
window.calculateStatistics = null;
window.formatTime = null;