/**
 * Visual Markdown Module
 * Provides visual enhancements for markdown editing in Monaco editor:
 * - Inline image previews via content widgets
 * - Visual formatting decorations (bold, italic, strikethrough)
 * - Clickable links with hover preview
 * - Wiki-style internal links [[filename]] navigation
 * - Collapsible code blocks with syntax info
 * - Table preview and WYSIWYG editing
 *
 * @module visualMarkdown
 */

/** @type {Array<Object>} Array of Monaco image content widgets */
let imageWidgets = [];

/** @type {Array<string>} Array of formatting decoration IDs */
let formatDecorations = [];

/** @type {Array<string>} Array of link decoration IDs */
let linkDecorations = [];

/** @type {Array<string>} Array of code block decoration IDs */
let codeBlockDecorations = [];

/** @type {Array<Object>} Array of code block content widgets */
let codeBlockWidgets = [];

/** @type {Set<string>} Set of block IDs that are currently collapsed */
let collapsedCodeBlocks = new Set();

/** @type {Object|null} Current hover preview widget */
let hoverWidget = null;

/** @type {number|null} Timeout ID for debounced updates */
let updateTimeout = null;

/** @type {Array<Object>} Track code block ranges for collapse functionality */
let codeBlockRanges = [];

/** @type {Array<Object>} Table preview widgets */
let tableWidgets = [];

/** @type {Array<string>} Table decoration IDs */
let tableDecorations = [];

/** @type {Array<Object>} Track table ranges for editing */
let tableRanges = [];

/** @type {Array<Object>} Math preview widgets */
let mathWidgets = [];

/** @type {Array<string>} Math decoration IDs */
let mathDecorations = [];

// --- Configuration ---
const config = {
    enabled: false, // Disabled by default - opt-in feature
    showImagePreviews: true,
    showFormattingDecorations: true,
    showLinkDecorations: true,
    showCodeBlockDecorations: true,
    showTablePreviews: true, // Show formatted table previews
    showMathPreviews: true, // Show rendered LaTeX/Math previews
    enableWysiwygEditing: true, // Enable click-to-edit for formatted elements
    enableCheckboxToggle: true, // Enable click to toggle checkboxes
    collapsibleCodeBlocks: true, // Enable collapse/expand for code blocks
    autoCollapseCodeBlocks: false, // Auto-collapse code blocks on load
    codeBlockCollapsedLines: 3, // Number of lines to show when collapsed
    imageMaxWidth: 400,
    imageMaxHeight: 300,
    updateDebounceMs: 150,
    // Virtual scrolling settings
    virtualScrolling: true, // Enable viewport-based rendering for large documents
    viewportBuffer: 50, // Extra lines to render above/below viewport
    largeDocumentThreshold: 500, // Line count above which virtual scrolling activates
    scrollDebounceMs: 50 // Debounce time for scroll updates
};

// --- Virtual Scrolling State ---
/** @type {{startLine: number, endLine: number}} Current visible range */
let visibleRange = { startLine: 1, endLine: 100 };

/** @type {number|null} Scroll update timeout */
let scrollTimeout = null;

/** @type {boolean} Whether document is large enough for virtual scrolling */
let isLargeDocument = false;

// --- Parsed Markdown Cache ---
/**
 * Cache for parsed markdown decorations per line
 * Key: line number, Value: { hash: string, decorations: array }
 */
const lineDecorationCache = new Map();

/**
 * Cache for code block boundaries (multi-line structures)
 * Key: 'codeblocks', Value: { hash: string, ranges: array }
 */
const structureCache = new Map();

/**
 * Simple hash function for line content
 * @param {string} str - String to hash
 * @returns {string}
 */
function hashLine(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
}

/**
 * Get cached decorations for a line or null if cache miss
 * @param {number} lineNumber - Line number
 * @param {string} lineContent - Current line content
 * @returns {Array|null}
 */
function getCachedLineDecorations(lineNumber, lineContent) {
    const cached = lineDecorationCache.get(lineNumber);
    if (!cached) return null;

    const currentHash = hashLine(lineContent);
    if (cached.hash !== currentHash) return null;

    return cached.decorations;
}

/**
 * Store decorations in cache for a line
 * @param {number} lineNumber - Line number
 * @param {string} lineContent - Line content
 * @param {Array} decorations - Decorations for this line
 */
function cacheLineDecorations(lineNumber, lineContent, decorations) {
    lineDecorationCache.set(lineNumber, {
        hash: hashLine(lineContent),
        decorations: decorations
    });
}

/**
 * Invalidate cache entries for lines that have changed
 * @param {number} startLine - First changed line
 * @param {number} endLine - Last changed line (or Infinity for all after start)
 */
function invalidateCacheRange(startLine, endLine = Infinity) {
    for (const [lineNum] of lineDecorationCache) {
        if (lineNum >= startLine && lineNum <= endLine) {
            lineDecorationCache.delete(lineNum);
        }
    }
}

/**
 * Clear all caches
 */
function clearDecorationCaches() {
    lineDecorationCache.clear();
    structureCache.clear();
}

/**
 * Get the visible line range with buffer for the current viewport
 * @param {Object} editor - Monaco editor instance
 * @returns {{startLine: number, endLine: number, isLarge: boolean}}
 */
function getVisibleRange(editor) {
    if (!editor) return { startLine: 1, endLine: 100, isLarge: false };

    const model = editor.getModel();
    if (!model) return { startLine: 1, endLine: 100, isLarge: false };

    const lineCount = model.getLineCount();
    const isLarge = lineCount > config.largeDocumentThreshold;

    // For small documents, render everything
    if (!config.virtualScrolling || !isLarge) {
        return { startLine: 1, endLine: lineCount, isLarge: false };
    }

    // Get visible ranges from Monaco
    const ranges = editor.getVisibleRanges();
    if (!ranges || ranges.length === 0) {
        return { startLine: 1, endLine: Math.min(100, lineCount), isLarge };
    }

    // Find the full visible range (union of all visible ranges)
    let minLine = lineCount;
    let maxLine = 1;
    for (const range of ranges) {
        minLine = Math.min(minLine, range.startLineNumber);
        maxLine = Math.max(maxLine, range.endLineNumber);
    }

    // Add buffer
    const buffer = config.viewportBuffer;
    const startLine = Math.max(1, minLine - buffer);
    const endLine = Math.min(lineCount, maxLine + buffer);

    return { startLine, endLine, isLarge };
}

/**
 * Check if a line is within the visible range
 * @param {number} lineNumber - Line number to check
 * @returns {boolean}
 */
function isLineVisible(lineNumber) {
    if (!isLargeDocument) return true;
    return lineNumber >= visibleRange.startLine && lineNumber <= visibleRange.endLine;
}

/**
 * Check if a range overlaps with the visible range
 * @param {number} startLine - Start line of range
 * @param {number} endLine - End line of range
 * @returns {boolean}
 */
function isRangeVisible(startLine, endLine) {
    if (!isLargeDocument) return true;
    return !(endLine < visibleRange.startLine || startLine > visibleRange.endLine);
}

// --- Environment Detection ---
// Detect if running in Electron or browser using multiple methods for reliability
// This handles cases where window.electronAPI may not be available yet or detection fails

/**
 * Detect if running in Electron environment
 * Uses multiple detection methods for reliability:
 * 1. Check window.electronAPI.isElectron (preload script sets this)
 * 2. Check for Electron-specific process object
 * 3. Check navigator.userAgent for Electron
 * 4. Check for Electron-specific window properties
 * @returns {boolean} True if running in Electron
 */
function detectElectron() {
    // Method 1: Check preload-exposed API (most reliable if available)
    if (window.electronAPI && window.electronAPI.isElectron === true) {
        return true;
    }

    // Method 2: Check for process.versions.electron (works in Node integration contexts)
    if (typeof process !== 'undefined' && process.versions && process.versions.electron) {
        return true;
    }

    // Method 3: Check userAgent for Electron
    if (typeof navigator !== 'undefined' && navigator.userAgent &&
        navigator.userAgent.toLowerCase().includes('electron')) {
        return true;
    }

    // Method 4: Check for Electron-specific window properties
    if (typeof window !== 'undefined' && window.process && window.process.type) {
        return true;
    }

    return false;
}

const isElectron = detectElectron();
const isBrowserMode = !isElectron;

// Log detection result for debugging
console.log(`[visualMarkdown] Environment detection: isElectron=${isElectron}, isBrowserMode=${isBrowserMode}`);

// In browser mode, visual markdown is always disabled (read-only viewing)
if (isBrowserMode) {
    config.enabled = false;
    console.log('[visualMarkdown] Browser mode detected - visual markdown disabled');
}

// --- Regex Patterns ---
const patterns = {
    // Images: ![alt](url) or ![alt](url "title")
    image: /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g,

    // Bold: **text** or __text__
    bold: /(\*\*|__)(?!\s)(.+?)(?<!\s)\1/g,

    // Italic: *text* or _text_ (not inside bold)
    italic: /(?<!\*|\w)(\*|_)(?!\s|\1)(.+?)(?<!\s)\1(?!\*|\w)/g,

    // Strikethrough: ~~text~~
    strikethrough: /~~(?!\s)(.+?)(?<!\s)~~/g,

    // Inline code: `code`
    inlineCode: /`([^`\n]+)`/g,

    // Links: [text](url) or [text](url "title")
    link: /(?<!!)\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g,

    // Wiki-style links: [[filename]] or [[filename|display text]]
    wikiLink: /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,

    // Checkbox: - [ ] or - [x] or - [X] (also with * or + as list markers)
    checkbox: /^(\s*[-*+]\s+)\[([ xX])\]/,

    // Footnote reference: [^1] or [^note]
    footnoteRef: /\[\^([^\]]+)\]/g,

    // Footnote definition: [^1]: text
    footnoteDef: /^\[\^([^\]]+)\]:\s*(.+)$/,

    // Inline math: $...$ (single dollar signs, not inside code)
    inlineMath: /(?<![`$\\])\$(?!\$)([^$\n]+?)\$(?!\$)/g,

    // Block/display math: $$...$$ (can span multiple lines)
    blockMath: /\$\$([\s\S]+?)\$\$/g,

    // Code blocks: ```language ... ```
    codeBlock: /^```(\w*)\s*\n([\s\S]*?)^```\s*$/gm,

    // Headings for reference
    heading: /^(#{1,6})\s+(.+)$/gm,

    // Table row: | cell | cell | cell |
    tableRow: /^\|(.+)\|$/,

    // Table separator: |---|---|---|
    tableSeparator: /^\|[-:\s|]+\|$/
};

// --- Image Preview Functions ---
function createImageWidget(editor, match, lineNumber, startColumn) {
    const imageUrl = match[2];
    const altText = match[1] || 'Image';

    // Create widget container
    const widgetId = `image-widget-${lineNumber}-${startColumn}`;

    const widget = {
        getId: () => widgetId,
        getDomNode: () => {
            if (widget.domNode) return widget.domNode;

            const container = document.createElement('div');
            container.className = 'monaco-image-preview-widget';
            container.style.cssText = `
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 8px;
                background: var(--bg-secondary, #f5f5f5);
                border: 1px solid var(--border-color, #ddd);
                border-radius: 4px;
                margin: 4px 0;
                max-width: ${config.imageMaxWidth}px;
            `;

            const img = document.createElement('img');
            img.src = resolveImagePath(imageUrl);
            img.alt = altText;
            img.title = altText;
            img.style.cssText = `
                max-width: ${config.imageMaxWidth}px;
                max-height: ${config.imageMaxHeight}px;
                object-fit: contain;
                border-radius: 2px;
            `;

            img.onerror = () => {
                container.innerHTML = `
                    <div style="color: var(--text-muted, #888); font-size: 12px; padding: 8px;">
                        <span style="font-size: 16px;">🖼️</span> Image not found: ${altText}
                    </div>
                `;
            };

            container.appendChild(img);
            widget.domNode = container;
            return container;
        },
        getPosition: () => ({
            position: { lineNumber: lineNumber + 1, column: 1 },
            preference: [monaco.editor.ContentWidgetPositionPreference.BELOW]
        })
    };

    return widget;
}

function resolveImagePath(imageUrl) {
    // Handle relative paths
    if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://') && !imageUrl.startsWith('data:')) {
        // Check if we have a current directory context (try both variable names)
        const currentDir = window.currentFileDirectory || window.currentDirectory;
        if (currentDir) {
            return `file://${currentDir}/${imageUrl}`;
        }
    }
    return imageUrl;
}

function updateImagePreviews(editor) {
    if (!config.enabled || !config.showImagePreviews) return;

    const model = editor.getModel();
    if (!model) return;

    // For virtual scrolling, only remove widgets outside visible range
    if (isLargeDocument) {
        const widgetsToKeep = [];
        const widgetsToRemove = [];

        imageWidgets.forEach(widget => {
            const lineNum = widget._lineNumber;
            if (lineNum && isLineVisible(lineNum)) {
                widgetsToKeep.push(widget);
            } else {
                widgetsToRemove.push(widget);
            }
        });

        widgetsToRemove.forEach(widget => {
            try { editor.removeContentWidget(widget); } catch (e) {}
        });

        imageWidgets = widgetsToKeep;
    } else {
        // Small document: remove all and rebuild
        imageWidgets.forEach(widget => {
            try { editor.removeContentWidget(widget); } catch (e) {}
        });
        imageWidgets = [];
    }

    const text = model.getValue();
    const lines = text.split('\n');

    // Only process visible lines for large documents
    const startIdx = isLargeDocument ? visibleRange.startLine - 1 : 0;
    const endIdx = isLargeDocument ? Math.min(visibleRange.endLine, lines.length) : lines.length;

    // Track existing widget line numbers to avoid duplicates
    const existingLines = new Set(imageWidgets.map(w => w._lineNumber));

    for (let lineIndex = startIdx; lineIndex < endIdx; lineIndex++) {
        const lineNumber = lineIndex + 1;

        // Skip if already have widget for this line
        if (existingLines.has(lineNumber)) continue;

        const line = lines[lineIndex];
        const regex = new RegExp(patterns.image.source, 'g');
        let match;

        while ((match = regex.exec(line)) !== null) {
            const widget = createImageWidget(editor, match, lineIndex, match.index);
            widget._lineNumber = lineNumber; // Track line number for virtual scrolling
            imageWidgets.push(widget);
            editor.addContentWidget(widget);
        }
    }
}

// --- Formatting Decorations ---

/**
 * Parse formatting decorations for a single line
 * @param {string} line - Line content
 * @param {number} lineNumber - Line number (1-based)
 * @returns {Array} Array of decoration objects
 */
function parseLineFormattingDecorations(line, lineNumber) {
    const decorations = [];

    // Bold decorations
    let boldRegex = new RegExp(patterns.bold.source, 'g');
    let match;
    while ((match = boldRegex.exec(line)) !== null) {
        const startCol = match.index + 1;
        const endCol = match.index + match[0].length + 1;
        const markerLen = match[1].length;

        decorations.push({
            range: new monaco.Range(lineNumber, startCol + markerLen, lineNumber, endCol - markerLen),
            options: { inlineClassName: 'visual-md-bold', stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges }
        });
        decorations.push({
            range: new monaco.Range(lineNumber, startCol, lineNumber, startCol + markerLen),
            options: { inlineClassName: 'visual-md-marker', stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges }
        });
        decorations.push({
            range: new monaco.Range(lineNumber, endCol - markerLen, lineNumber, endCol),
            options: { inlineClassName: 'visual-md-marker', stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges }
        });
    }

    // Italic decorations
    let italicRegex = new RegExp(patterns.italic.source, 'g');
    while ((match = italicRegex.exec(line)) !== null) {
        const startCol = match.index + 1;
        const endCol = match.index + match[0].length + 1;
        decorations.push({
            range: new monaco.Range(lineNumber, startCol + 1, lineNumber, endCol - 1),
            options: { inlineClassName: 'visual-md-italic', stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges }
        });
        decorations.push({
            range: new monaco.Range(lineNumber, startCol, lineNumber, startCol + 1),
            options: { inlineClassName: 'visual-md-marker', stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges }
        });
        decorations.push({
            range: new monaco.Range(lineNumber, endCol - 1, lineNumber, endCol),
            options: { inlineClassName: 'visual-md-marker', stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges }
        });
    }

    // Strikethrough decorations
    let strikeRegex = new RegExp(patterns.strikethrough.source, 'g');
    while ((match = strikeRegex.exec(line)) !== null) {
        const startCol = match.index + 1;
        const endCol = match.index + match[0].length + 1;
        decorations.push({
            range: new monaco.Range(lineNumber, startCol + 2, lineNumber, endCol - 2),
            options: { inlineClassName: 'visual-md-strikethrough', stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges }
        });
        decorations.push({
            range: new monaco.Range(lineNumber, startCol, lineNumber, startCol + 2),
            options: { inlineClassName: 'visual-md-marker', stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges }
        });
        decorations.push({
            range: new monaco.Range(lineNumber, endCol - 2, lineNumber, endCol),
            options: { inlineClassName: 'visual-md-marker', stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges }
        });
    }

    // Inline code decorations
    let codeRegex = new RegExp(patterns.inlineCode.source, 'g');
    while ((match = codeRegex.exec(line)) !== null) {
        const startCol = match.index + 1;
        const endCol = match.index + match[0].length + 1;
        decorations.push({
            range: new monaco.Range(lineNumber, startCol, lineNumber, endCol),
            options: { inlineClassName: 'visual-md-inline-code', stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges }
        });
    }

    // Heading decorations
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
        const level = headingMatch[1].length;
        const hashEnd = headingMatch[1].length + 1;
        decorations.push({
            range: new monaco.Range(lineNumber, hashEnd + 1, lineNumber, line.length + 1),
            options: { inlineClassName: `visual-md-heading visual-md-h${level}`, stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges }
        });
        decorations.push({
            range: new monaco.Range(lineNumber, 1, lineNumber, hashEnd + 1),
            options: { inlineClassName: 'visual-md-marker visual-md-heading-marker', stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges }
        });
    }

    // Checkbox decorations
    const checkboxMatch = line.match(patterns.checkbox);
    if (checkboxMatch && config.enableCheckboxToggle) {
        const prefixLen = checkboxMatch[1].length;
        const isChecked = checkboxMatch[2].toLowerCase() === 'x';
        const bracketStart = prefixLen + 1;
        const bracketEnd = prefixLen + 4;
        decorations.push({
            range: new monaco.Range(lineNumber, bracketStart, lineNumber, bracketEnd),
            options: {
                inlineClassName: isChecked ? 'visual-md-checkbox visual-md-checkbox-checked' : 'visual-md-checkbox',
                hoverMessage: { value: '*Click to toggle checkbox*' },
                stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
            }
        });
    }

    return decorations;
}

function updateFormattingDecorations(editor) {
    if (!config.enabled || !config.showFormattingDecorations) return;

    const model = editor.getModel();
    if (!model) return;

    const decorations = [];
    const text = model.getValue();
    const lines = text.split('\n');

    // Only process visible lines for large documents
    const startIdx = isLargeDocument ? visibleRange.startLine - 1 : 0;
    const endIdx = isLargeDocument ? Math.min(visibleRange.endLine, lines.length) : lines.length;

    let cacheHits = 0;
    let cacheMisses = 0;

    for (let lineIndex = startIdx; lineIndex < endIdx; lineIndex++) {
        const line = lines[lineIndex];
        const lineNumber = lineIndex + 1;

        // Try to get from cache first
        const cached = getCachedLineDecorations(lineNumber, line);
        if (cached) {
            decorations.push(...cached);
            cacheHits++;
            continue;
        }

        // Parse and cache
        const lineDecorations = parseLineFormattingDecorations(line, lineNumber);
        cacheLineDecorations(lineNumber, line, lineDecorations);
        decorations.push(...lineDecorations);
        cacheMisses++;
    }

    // Log cache performance for large documents
    if (isLargeDocument && (cacheHits > 0 || cacheMisses > 0)) {
        console.log(`[visualMarkdown] Cache: ${cacheHits} hits, ${cacheMisses} misses`);
    }

    formatDecorations = editor.deltaDecorations(formatDecorations, decorations);
}

// --- Link Decorations and Hover ---
function updateLinkDecorations(editor) {
    if (!config.enabled || !config.showLinkDecorations) return;

    const model = editor.getModel();
    if (!model) return;

    const decorations = [];
    const text = model.getValue();
    const lines = text.split('\n');

    // Only process visible lines for large documents
    const startIdx = isLargeDocument ? visibleRange.startLine - 1 : 0;
    const endIdx = isLargeDocument ? Math.min(visibleRange.endLine, lines.length) : lines.length;

    for (let lineIndex = startIdx; lineIndex < endIdx; lineIndex++) {
        const line = lines[lineIndex];
        const lineNumber = lineIndex + 1;

        // Standard markdown links [text](url)
        const linkRegex = new RegExp(patterns.link.source, 'g');
        let match;

        while ((match = linkRegex.exec(line)) !== null) {
            const fullMatchStart = match.index + 1;
            const fullMatchEnd = match.index + match[0].length + 1;
            const linkText = match[1];
            const linkUrl = match[2];

            // Find where the link text is (after the opening bracket)
            const textStart = fullMatchStart + 1;
            const textEnd = textStart + linkText.length;

            // Make link text look like a link
            decorations.push({
                range: new monaco.Range(lineNumber, textStart, lineNumber, textEnd),
                options: {
                    inlineClassName: 'visual-md-link',
                    hoverMessage: { value: `**Link:** [${linkUrl}](${linkUrl})\n\n*Ctrl+Click to open*` },
                    stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
                }
            });

            // Dim the markdown syntax
            decorations.push({
                range: new monaco.Range(lineNumber, fullMatchStart, lineNumber, textStart),
                options: {
                    inlineClassName: 'visual-md-marker',
                    stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
                }
            });
            decorations.push({
                range: new monaco.Range(lineNumber, textEnd, lineNumber, fullMatchEnd),
                options: {
                    inlineClassName: 'visual-md-marker visual-md-link-url',
                    stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
                }
            });
        }

        // Wiki-style links [[filename]] or [[filename|display]]
        const wikiLinkRegex = new RegExp(patterns.wikiLink.source, 'g');

        while ((match = wikiLinkRegex.exec(line)) !== null) {
            const fullMatchStart = match.index + 1;
            const fullMatchEnd = match.index + match[0].length + 1;
            const filename = match[1].trim();
            const displayText = match[2] ? match[2].trim() : filename;

            // The display text position (either custom or filename)
            // [[filename]] -> display after [[
            // [[filename|display]] -> display is after |
            const bracketLen = 2; // [[
            let textStart, textEnd;

            if (match[2]) {
                // Has display text: [[filename|display]]
                textStart = fullMatchStart + bracketLen + filename.length + 1; // +1 for |
                textEnd = textStart + displayText.length;
            } else {
                // No display text: [[filename]]
                textStart = fullMatchStart + bracketLen;
                textEnd = textStart + filename.length;
            }

            // Make the display text look like a link
            decorations.push({
                range: new monaco.Range(lineNumber, textStart, lineNumber, textEnd),
                options: {
                    inlineClassName: 'visual-md-link visual-md-wiki-link',
                    hoverMessage: { value: `**Wiki Link:** ${filename}\n\n*Ctrl+Click to open*` },
                    stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
                }
            });

            // Dim the opening brackets [[
            decorations.push({
                range: new monaco.Range(lineNumber, fullMatchStart, lineNumber, fullMatchStart + bracketLen),
                options: {
                    inlineClassName: 'visual-md-marker',
                    stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
                }
            });

            // Dim the closing brackets ]]
            decorations.push({
                range: new monaco.Range(lineNumber, fullMatchEnd - bracketLen, lineNumber, fullMatchEnd),
                options: {
                    inlineClassName: 'visual-md-marker',
                    stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
                }
            });

            // If there's a pipe and filename part, dim them too
            if (match[2]) {
                // Dim the filename and pipe: [[filename|
                decorations.push({
                    range: new monaco.Range(lineNumber, fullMatchStart + bracketLen, lineNumber, textStart),
                    options: {
                        inlineClassName: 'visual-md-marker',
                        stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
                    }
                });
            }
        }
    }

    // Parse footnote definitions from the document (need to scan all for complete lookup)
    const footnoteDefinitions = new Map();
    lines.forEach((line, lineIndex) => {
        const defMatch = line.match(patterns.footnoteDef);
        if (defMatch) {
            const id = defMatch[1];
            const content = defMatch[2].trim();
            footnoteDefinitions.set(id, { content, lineNumber: lineIndex + 1 });
        }
    });

    // Add footnote reference decorations with hover preview (only visible lines)
    for (let lineIndex = startIdx; lineIndex < endIdx; lineIndex++) {
        const line = lines[lineIndex];
        const lineNumber = lineIndex + 1;
        const footnoteRefRegex = new RegExp(patterns.footnoteRef.source, 'g');
        let match;

        while ((match = footnoteRefRegex.exec(line)) !== null) {
            // Skip if this line is a footnote definition
            if (line.match(patterns.footnoteDef)) continue;

            const fullMatchStart = match.index + 1;
            const fullMatchEnd = match.index + match[0].length + 1;
            const footnoteId = match[1];
            const definition = footnoteDefinitions.get(footnoteId);

            let hoverContent = definition
                ? `**Footnote [^${footnoteId}]:**\n\n${definition.content}\n\n*Line ${definition.lineNumber}*`
                : `*Footnote [^${footnoteId}] not found*`;

            decorations.push({
                range: new monaco.Range(lineNumber, fullMatchStart, lineNumber, fullMatchEnd),
                options: {
                    inlineClassName: 'visual-md-footnote',
                    hoverMessage: { value: hoverContent },
                    stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
                }
            });
        }
    }

    linkDecorations = editor.deltaDecorations(linkDecorations, decorations);
}

function setupLinkClickHandler(editor) {
    editor.onMouseDown((e) => {
        if (!config.enabled || !config.showLinkDecorations) return;

        // Check for Ctrl/Cmd + click
        if (!(e.event.ctrlKey || e.event.metaKey)) return;

        const position = e.target.position;
        if (!position) return;

        const model = editor.getModel();
        if (!model) return;

        const line = model.getLineContent(position.lineNumber);

        // Check for standard markdown links [text](url)
        const linkRegex = new RegExp(patterns.link.source, 'g');
        let match;

        while ((match = linkRegex.exec(line)) !== null) {
            const startCol = match.index + 1;
            const endCol = match.index + match[0].length + 1;

            if (position.column >= startCol && position.column <= endCol) {
                const url = match[2];
                openLink(url);
                e.event.preventDefault();
                return;
            }
        }

        // Check for wiki-style links [[filename]] or [[filename|display]]
        const wikiLinkRegex = new RegExp(patterns.wikiLink.source, 'g');

        while ((match = wikiLinkRegex.exec(line)) !== null) {
            const startCol = match.index + 1;
            const endCol = match.index + match[0].length + 1;

            if (position.column >= startCol && position.column <= endCol) {
                // match[1] is the filename, match[2] is optional display text
                const filename = match[1].trim();
                openWikiLink(filename);
                e.event.preventDefault();
                return;
            }
        }
    });

    // Checkbox click handler (single click, no modifier required)
    editor.onMouseDown((e) => {
        if (!config.enabled || !config.enableCheckboxToggle) return;

        // Only handle single clicks without modifiers
        if (e.event.ctrlKey || e.event.metaKey || e.event.shiftKey) return;

        const position = e.target.position;
        if (!position) return;

        const model = editor.getModel();
        if (!model) return;

        const line = model.getLineContent(position.lineNumber);
        const checkboxMatch = line.match(patterns.checkbox);

        if (checkboxMatch) {
            const prefixLen = checkboxMatch[1].length;
            const bracketStart = prefixLen + 1;
            const bracketEnd = prefixLen + 4;

            // Check if click is on the checkbox brackets
            if (position.column >= bracketStart && position.column <= bracketEnd) {
                toggleCheckbox(editor, position.lineNumber, checkboxMatch);
                e.event.preventDefault();
                e.event.stopPropagation();
            }
        }
    });
}

/**
 * Toggle a checkbox on the specified line
 * @param {Object} editor - Monaco editor instance
 * @param {number} lineNumber - The line number (1-based)
 * @param {Array} checkboxMatch - The regex match result
 */
function toggleCheckbox(editor, lineNumber, checkboxMatch) {
    const model = editor.getModel();
    if (!model) return;

    const line = model.getLineContent(lineNumber);
    const prefixLen = checkboxMatch[1].length;
    const currentState = checkboxMatch[2];
    const isChecked = currentState.toLowerCase() === 'x';

    // Toggle the checkbox state
    const newState = isChecked ? ' ' : 'x';
    const checkPos = prefixLen + 2; // Position of the x or space inside [ ]

    // Create the edit
    const range = new monaco.Range(lineNumber, checkPos, lineNumber, checkPos + 1);

    editor.executeEdits('toggle-checkbox', [{
        range: range,
        text: newState
    }]);

    // Mark document as modified
    if (window.markDocumentModified) {
        window.markDocumentModified();
    }

    // Update preview if available
    if (window.updatePreviewAndStructure) {
        window.updatePreviewAndStructure(editor.getValue());
    }

    console.log(`[visualMarkdown] Toggled checkbox on line ${lineNumber}: ${isChecked ? 'unchecked' : 'checked'}`);
}

/**
 * Open a wiki-style link [[filename]]
 * @param {string} filename - The filename (without or with .md extension)
 */
function openWikiLink(filename) {
    console.log('[visualMarkdown] Opening wiki link:', filename);

    // Check if it contains anchor
    let anchor = null;
    let targetFile = filename;

    if (filename.includes('#')) {
        [targetFile, anchor] = filename.split('#');
        targetFile = targetFile.trim();
        anchor = anchor.trim();
    }

    // If it's just an anchor (e.g., [[#heading]]), scroll to it
    if (!targetFile && anchor) {
        scrollToHeading(anchor);
        return;
    }

    // Ensure .md extension
    if (!targetFile.endsWith('.md') && !targetFile.endsWith('.markdown')) {
        targetFile = targetFile + '.md';
    }

    // Navigate to the file
    navigateToInternalFile(targetFile, anchor);
}

/**
 * Open a link from the markdown document
 * Handles external URLs, internal markdown links, and anchors
 *
 * @param {string} url - The URL or path to open
 */
function openLink(url) {
    // Handle different link types
    if (url.startsWith('http://') || url.startsWith('https://')) {
        // External link - open in browser
        if (window.electronAPI && window.electronAPI.invoke) {
            window.electronAPI.invoke('open-external', url);
        } else {
            window.open(url, '_blank');
        }
    } else if (url.endsWith('.md') || url.endsWith('.markdown')) {
        // Internal markdown link - navigate to file
        navigateToInternalFile(url);
    } else if (url.startsWith('#')) {
        // Anchor link - scroll to heading
        const headingId = url.substring(1);
        scrollToHeading(headingId);
    } else if (url.includes('#')) {
        // File link with anchor (e.g., "other-file.md#heading")
        const [filePart, anchor] = url.split('#');
        if (filePart.endsWith('.md') || filePart.endsWith('.markdown')) {
            navigateToInternalFile(filePart, anchor);
        }
    } else if (!url.includes(':') && !url.startsWith('/')) {
        // Relative link without extension - try adding .md
        navigateToInternalFile(url + '.md');
    }
}

/**
 * Navigate to an internal markdown file
 * Resolves relative paths based on the current file's directory
 * @param {string} relativePath - The relative path to the file
 * @param {string} anchor - Optional anchor to scroll to after opening
 */
async function navigateToInternalFile(relativePath, anchor = null) {
    console.log('[visualMarkdown] Navigating to internal file:', relativePath, anchor ? `#${anchor}` : '');

    if (!window.electronAPI || !window.electronAPI.invoke) {
        console.warn('[visualMarkdown] Electron API not available for internal file navigation');
        return;
    }

    try {
        // Get the current file's directory to resolve relative paths
        let basePath = '';
        if (window.currentFilePath) {
            // Extract directory from current file path
            const lastSlash = window.currentFilePath.lastIndexOf('/');
            if (lastSlash !== -1) {
                basePath = window.currentFilePath.substring(0, lastSlash);
            }
        } else {
            // Fall back to working directory
            const workingDir = await window.electronAPI.invoke('get-working-directory');
            basePath = workingDir;
        }

        // Resolve the full path
        let fullPath;
        if (relativePath.startsWith('/')) {
            // Absolute path from workspace root
            const workingDir = await window.electronAPI.invoke('get-working-directory');
            fullPath = workingDir + relativePath;
        } else if (relativePath.startsWith('./')) {
            // Explicit relative path
            fullPath = basePath + '/' + relativePath.substring(2);
        } else if (relativePath.startsWith('../')) {
            // Parent directory navigation
            fullPath = resolveRelativePath(basePath, relativePath);
        } else {
            // Simple relative path
            fullPath = basePath + '/' + relativePath;
        }

        // Normalize the path (remove double slashes, etc.)
        fullPath = normalizePath(fullPath);

        console.log('[visualMarkdown] Resolved path:', fullPath);

        // Check if file exists first
        const fileCheck = await window.electronAPI.invoke('read-file-content', fullPath);
        if (!fileCheck.success) {
            console.warn('[visualMarkdown] File not found:', fullPath);
            // Try to find the file in workspace
            const foundPath = await findFileInWorkspace(relativePath);
            if (foundPath) {
                fullPath = foundPath;
            } else {
                showFileNotFoundToast(relativePath);
                return;
            }
        }

        // Open the file
        await window.electronAPI.invoke('open-file', fullPath);

        // If there's an anchor, scroll to it after the file loads
        if (anchor) {
            setTimeout(() => {
                scrollToHeading(anchor);
            }, 300);
        }
    } catch (error) {
        console.error('[visualMarkdown] Error navigating to internal file:', error);
    }
}

/**
 * Resolve a relative path with parent directory references (..)
 *
 * @param {string} basePath - The base directory path
 * @param {string} relativePath - The relative path to resolve
 * @returns {string} The resolved absolute path
 */
function resolveRelativePath(basePath, relativePath) {
    const baseParts = basePath.split('/').filter(p => p);
    const relParts = relativePath.split('/');

    for (const part of relParts) {
        if (part === '..') {
            baseParts.pop();
        } else if (part !== '.' && part !== '') {
            baseParts.push(part);
        }
    }

    return '/' + baseParts.join('/');
}

/**
 * Normalize a file path by removing redundant slashes and ./ references
 *
 * @param {string} path - The path to normalize
 * @returns {string} The normalized path
 */
function normalizePath(path) {
    return path
        .replace(/\/+/g, '/')  // Replace multiple slashes with single
        .replace(/\/\.\//g, '/');  // Remove ./ references
}

/**
 * Try to find a file in the workspace by filename
 * Searches all markdown files for a matching filename
 *
 * @async
 * @param {string} filename - The filename to search for
 * @returns {Promise<string|null>} The full path if found, null otherwise
 */
async function findFileInWorkspace(filename) {
    try {
        // Strip any path components, keep just the filename
        const baseName = filename.split('/').pop();

        // Get all markdown files in workspace
        const result = await window.electronAPI.invoke('get-markdown-files');
        if (!result.success || !result.files) return null;

        // Find matching file
        for (const filePath of result.files) {
            if (filePath.endsWith('/' + baseName) || filePath.endsWith('\\' + baseName)) {
                return filePath;
            }
        }

        return null;
    } catch (error) {
        console.error('[visualMarkdown] Error finding file in workspace:', error);
        return null;
    }
}

/**
 * Show a toast notification when a linked file is not found
 *
 * @param {string} filename - The filename that was not found
 */
function showFileNotFoundToast(filename) {
    // Check if there's a toast system available
    if (window.showToast) {
        window.showToast(`File not found: ${filename}`, 'warning');
    } else {
        // Create a simple toast notification
        const toast = document.createElement('div');
        toast.className = 'visual-md-toast';
        toast.textContent = `File not found: ${filename}`;
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #ff9800;
            color: white;
            padding: 12px 24px;
            border-radius: 4px;
            z-index: 10000;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            animation: toast-fade 3s ease-in-out;
        `;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }
}

function scrollToHeading(headingId) {
    const model = window.editor?.getModel();
    if (!model) return;

    const text = model.getValue();
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const headingMatch = lines[i].match(/^#{1,6}\s+(.+)$/);
        if (headingMatch) {
            const headingText = headingMatch[1];
            // Create slug from heading text
            const slug = headingText.toLowerCase()
                .replace(/[^\w\s-]/g, '')
                .replace(/\s+/g, '-');

            if (slug === headingId || headingText.toLowerCase() === headingId.toLowerCase()) {
                window.editor.revealLineInCenter(i + 1);
                window.editor.setPosition({ lineNumber: i + 1, column: 1 });
                break;
            }
        }
    }
}

// --- Code Block Decorations ---
function updateCodeBlockDecorations(editor) {
    if (!config.enabled || !config.showCodeBlockDecorations) return;

    const model = editor.getModel();
    if (!model) return;

    const decorations = [];
    const text = model.getValue();
    const lines = text.split('\n');

    // Clear existing code block widgets
    codeBlockWidgets.forEach(widget => {
        try {
            editor.removeContentWidget(widget);
        } catch (e) {
            // Widget may already be removed
        }
    });
    codeBlockWidgets = [];
    codeBlockRanges = [];

    let inCodeBlock = false;
    let codeBlockStart = -1;
    let codeBlockLang = '';
    let blockIndex = 0;

    lines.forEach((line, lineIndex) => {
        const lineNumber = lineIndex + 1;

        if (line.match(/^```(\w*)\s*$/)) {
            if (!inCodeBlock) {
                // Start of code block
                inCodeBlock = true;
                codeBlockStart = lineNumber;
                codeBlockLang = line.replace(/^```/, '').trim();

                // Decorate the opening fence
                decorations.push({
                    range: new monaco.Range(lineNumber, 1, lineNumber, line.length + 1),
                    options: {
                        isWholeLine: true,
                        className: 'visual-md-code-fence visual-md-code-fence-start',
                        glyphMarginClassName: 'visual-md-code-glyph',
                        stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
                    }
                });
            } else {
                // End of code block
                const codeBlockEnd = lineNumber;
                const blockId = `code-block-${codeBlockStart}`;
                const isCollapsed = collapsedCodeBlocks.has(blockId);
                const totalLines = codeBlockEnd - codeBlockStart - 1;

                // Store code block range info
                codeBlockRanges.push({
                    id: blockId,
                    startLine: codeBlockStart,
                    endLine: codeBlockEnd,
                    language: codeBlockLang,
                    totalLines: totalLines
                });

                // Decorate the closing fence
                decorations.push({
                    range: new monaco.Range(lineNumber, 1, lineNumber, line.length + 1),
                    options: {
                        isWholeLine: true,
                        className: 'visual-md-code-fence visual-md-code-fence-end',
                        stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
                    }
                });

                // Add collapsible header widget with language badge
                if (config.collapsibleCodeBlocks && totalLines > config.codeBlockCollapsedLines) {
                    const headerWidget = createCodeBlockHeaderWidget(
                        editor,
                        blockId,
                        codeBlockStart,
                        codeBlockLang,
                        totalLines,
                        isCollapsed
                    );
                    codeBlockWidgets.push(headerWidget);
                    editor.addContentWidget(headerWidget);
                } else if (codeBlockLang) {
                    // Just add language badge for small code blocks
                    decorations.push({
                        range: new monaco.Range(codeBlockStart, 1, codeBlockStart, 1),
                        options: {
                            before: {
                                content: ` ${codeBlockLang} `,
                                inlineClassName: 'visual-md-code-lang-badge'
                            }
                        }
                    });
                }

                // Handle collapsed state - hide middle lines
                if (isCollapsed && totalLines > config.codeBlockCollapsedLines) {
                    // Show first few lines
                    for (let i = 1; i <= Math.min(config.codeBlockCollapsedLines, totalLines); i++) {
                        decorations.push({
                            range: new monaco.Range(codeBlockStart + i, 1, codeBlockStart + i, lines[codeBlockStart + i - 1].length + 1),
                            options: {
                                isWholeLine: true,
                                className: 'visual-md-code-block-line',
                                stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
                            }
                        });
                    }

                    // Hide remaining lines with collapsed indicator
                    const hiddenCount = totalLines - config.codeBlockCollapsedLines;
                    if (hiddenCount > 0) {
                        // Add ellipsis decoration for hidden content
                        decorations.push({
                            range: new monaco.Range(codeBlockStart + config.codeBlockCollapsedLines + 1, 1, codeBlockEnd - 1, 1),
                            options: {
                                isWholeLine: true,
                                className: 'visual-md-code-block-collapsed',
                                after: {
                                    content: `  ... ${hiddenCount} more line${hiddenCount > 1 ? 's' : ''} ...`,
                                    inlineClassName: 'visual-md-collapsed-indicator'
                                }
                            }
                        });
                    }
                } else {
                    // Show all code block lines
                    for (let i = codeBlockStart + 1; i < codeBlockEnd; i++) {
                        decorations.push({
                            range: new monaco.Range(i, 1, i, lines[i - 1].length + 1),
                            options: {
                                isWholeLine: true,
                                className: 'visual-md-code-block-line',
                                stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
                            }
                        });
                    }
                }

                inCodeBlock = false;
                codeBlockStart = -1;
                codeBlockLang = '';
                blockIndex++;
            }
        }
    });

    codeBlockDecorations = editor.deltaDecorations(codeBlockDecorations, decorations);
}

// Create a header widget for code blocks with collapse/expand functionality
function createCodeBlockHeaderWidget(editor, blockId, lineNumber, language, totalLines, isCollapsed) {
    const widgetId = `code-header-${blockId}`;

    const widget = {
        getId: () => widgetId,
        getDomNode: () => {
            if (widget.domNode) return widget.domNode;

            const container = document.createElement('div');
            container.className = 'visual-md-code-header';
            container.style.cssText = `
                display: inline-flex;
                align-items: center;
                gap: 8px;
                padding: 2px 8px;
                font-size: 12px;
                cursor: pointer;
                user-select: none;
                position: relative;
                z-index: 10;
            `;

            // Collapse/expand button
            const toggleBtn = document.createElement('span');
            toggleBtn.className = 'visual-md-collapse-btn';
            toggleBtn.innerHTML = isCollapsed ? '▶' : '▼';
            toggleBtn.style.cssText = `
                font-size: 10px;
                color: var(--text-muted, #6a737d);
                transition: transform 0.2s;
            `;
            toggleBtn.title = isCollapsed ? 'Expand code block' : 'Collapse code block';
            container.appendChild(toggleBtn);

            // Language badge
            if (language) {
                const langBadge = document.createElement('span');
                langBadge.className = 'visual-md-code-lang-badge';
                langBadge.textContent = language;
                langBadge.style.cssText = `
                    background-color: rgba(56, 139, 253, 0.15);
                    color: #0366d6;
                    padding: 1px 6px;
                    border-radius: 3px;
                    font-size: 11px;
                    font-weight: 500;
                `;
                container.appendChild(langBadge);
            }

            // Line count
            const lineCount = document.createElement('span');
            lineCount.className = 'visual-md-code-line-count';
            lineCount.textContent = `${totalLines} line${totalLines > 1 ? 's' : ''}`;
            lineCount.style.cssText = `
                color: var(--text-muted, #6a737d);
                font-size: 11px;
            `;
            container.appendChild(lineCount);

            // Click handler for toggle
            container.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleCodeBlockCollapse(blockId, editor);
            });

            widget.domNode = container;
            return container;
        },
        getPosition: () => ({
            position: { lineNumber: lineNumber, column: 4 }, // After the ```
            preference: [monaco.editor.ContentWidgetPositionPreference.EXACT]
        })
    };

    return widget;
}

// Toggle collapse/expand state for a code block
function toggleCodeBlockCollapse(blockId, editor) {
    if (collapsedCodeBlocks.has(blockId)) {
        collapsedCodeBlocks.delete(blockId);
    } else {
        collapsedCodeBlocks.add(blockId);
    }

    // Refresh decorations
    updateCodeBlockDecorations(editor);
}

// Collapse all code blocks
function collapseAllCodeBlocks(editor) {
    codeBlockRanges.forEach(block => {
        if (block.totalLines > config.codeBlockCollapsedLines) {
            collapsedCodeBlocks.add(block.id);
        }
    });
    updateCodeBlockDecorations(editor);
}

// Expand all code blocks
function expandAllCodeBlocks(editor) {
    collapsedCodeBlocks.clear();
    updateCodeBlockDecorations(editor);
}

// --- Table Preview Functions ---

// Parse a markdown table from an array of lines
function parseMarkdownTable(lines) {
    if (lines.length < 2) return null;

    const table = {
        headers: [],
        alignments: [],
        rows: [],
        isValid: false
    };

    // Parse header row
    const headerMatch = lines[0].match(patterns.tableRow);
    if (!headerMatch) return null;

    table.headers = headerMatch[1].split('|').map(cell => cell.trim());

    // Parse separator row (second line)
    if (lines.length < 2 || !patterns.tableSeparator.test(lines[1])) {
        return null;
    }

    // Extract alignments from separator
    const separatorCells = lines[1].replace(/^\||\|$/g, '').split('|');
    table.alignments = separatorCells.map(cell => {
        const trimmed = cell.trim();
        if (trimmed.startsWith(':') && trimmed.endsWith(':')) return 'center';
        if (trimmed.endsWith(':')) return 'right';
        return 'left';
    });

    // Parse data rows
    for (let i = 2; i < lines.length; i++) {
        const rowMatch = lines[i].match(patterns.tableRow);
        if (rowMatch) {
            table.rows.push(rowMatch[1].split('|').map(cell => cell.trim()));
        }
    }

    table.isValid = true;
    return table;
}

// Find all tables in the document
function findTables(lines) {
    const tables = [];
    let tableStart = -1;
    let tableLines = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const isTableRow = patterns.tableRow.test(line);
        const isSeparator = patterns.tableSeparator.test(line);

        if (isTableRow || isSeparator) {
            if (tableStart === -1) {
                tableStart = i;
            }
            tableLines.push(line);
        } else {
            // End of table or non-table line
            if (tableStart !== -1 && tableLines.length >= 2) {
                // Verify it's a valid table (has separator in second line)
                if (patterns.tableSeparator.test(tableLines[1])) {
                    const parsed = parseMarkdownTable(tableLines);
                    if (parsed && parsed.isValid) {
                        tables.push({
                            startLine: tableStart + 1, // 1-indexed
                            endLine: i, // 1-indexed (exclusive)
                            lines: tableLines.slice(),
                            parsed: parsed
                        });
                    }
                }
            }
            tableStart = -1;
            tableLines = [];
        }
    }

    // Handle table at end of document
    if (tableStart !== -1 && tableLines.length >= 2) {
        if (patterns.tableSeparator.test(tableLines[1])) {
            const parsed = parseMarkdownTable(tableLines);
            if (parsed && parsed.isValid) {
                tables.push({
                    startLine: tableStart + 1,
                    endLine: lines.length,
                    lines: tableLines.slice(),
                    parsed: parsed
                });
            }
        }
    }

    return tables;
}

// Create a table preview widget
function createTableWidget(editor, tableData, tableIndex) {
    const widgetId = `table-widget-${tableData.startLine}`;

    const widget = {
        getId: () => widgetId,
        getDomNode: () => {
            if (widget.domNode) return widget.domNode;

            const container = document.createElement('div');
            container.className = 'visual-md-table-widget';
            container.style.cssText = `
                margin: 4px 0 4px 20px;
                max-width: calc(100% - 40px);
                overflow-x: auto;
            `;

            // Create the HTML table
            const table = createHtmlTable(tableData.parsed, tableData.startLine);
            container.appendChild(table);

            widget.domNode = container;
            return container;
        },
        getPosition: () => ({
            position: { lineNumber: tableData.endLine, column: 1 },
            preference: [monaco.editor.ContentWidgetPositionPreference.BELOW]
        })
    };

    return widget;
}

// Create an HTML table element from parsed table data
function createHtmlTable(parsed, startLine) {
    const table = document.createElement('table');
    table.className = 'visual-md-table';
    table.style.cssText = `
        border-collapse: collapse;
        font-size: 13px;
        min-width: 200px;
        background: var(--bg-primary, #fff);
        border: 1px solid var(--border-color, #e1e4e8);
        border-radius: 4px;
        overflow: hidden;
    `;

    // Create header row
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');

    parsed.headers.forEach((header, colIndex) => {
        const th = document.createElement('th');
        th.textContent = header;
        th.style.cssText = `
            padding: 8px 12px;
            text-align: ${parsed.alignments[colIndex] || 'left'};
            background: var(--bg-secondary, #f6f8fa);
            border-bottom: 2px solid var(--border-color, #e1e4e8);
            font-weight: 600;
            color: var(--text-primary, #24292e);
            white-space: nowrap;
        `;

        // Make header editable on double-click
        th.addEventListener('dblclick', (e) => {
            editTableCell(startLine, 0, colIndex, header, e.target);
        });
        th.title = 'Double-click to edit';
        th.style.cursor = 'pointer';

        headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Create body rows
    const tbody = document.createElement('tbody');

    parsed.rows.forEach((row, rowIndex) => {
        const tr = document.createElement('tr');
        tr.style.cssText = `
            transition: background-color 0.15s;
        `;
        tr.addEventListener('mouseenter', () => {
            tr.style.backgroundColor = 'var(--bg-hover, rgba(0,0,0,0.04))';
        });
        tr.addEventListener('mouseleave', () => {
            tr.style.backgroundColor = '';
        });

        row.forEach((cell, colIndex) => {
            const td = document.createElement('td');
            td.innerHTML = renderCellContent(cell);
            td.style.cssText = `
                padding: 8px 12px;
                text-align: ${parsed.alignments[colIndex] || 'left'};
                border-bottom: 1px solid var(--border-color, #e1e4e8);
                color: var(--text-primary, #24292e);
            `;

            // Make cell editable on double-click
            td.addEventListener('dblclick', (e) => {
                editTableCell(startLine, rowIndex + 2, colIndex, cell, e.target);
            });
            td.title = 'Double-click to edit';
            td.style.cursor = 'pointer';

            tr.appendChild(td);
        });

        tbody.appendChild(tr);
    });

    table.appendChild(tbody);

    return table;
}

// Render cell content with basic markdown support
function renderCellContent(content) {
    let html = content;

    // Bold
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');

    // Italic
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/_([^_]+)_/g, '<em>$1</em>');

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code style="background: rgba(175, 184, 193, 0.2); padding: 2px 4px; border-radius: 3px; font-size: 0.9em;">$1</code>');

    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color: #0366d6; text-decoration: none;">$1</a>');

    return html;
}

// Edit a table cell inline
function editTableCell(tableStartLine, rowIndex, colIndex, currentValue, targetElement) {
    if (!window.editor) return;

    // Calculate the actual line in the editor
    const lineNumber = tableStartLine + rowIndex;
    const model = window.editor.getModel();
    if (!model) return;

    const lineContent = model.getLineContent(lineNumber);

    // Parse the line to find the cell position
    const cells = lineContent.split('|').slice(1, -1); // Remove first and last empty elements
    if (colIndex >= cells.length) return;

    // Calculate column position
    let col = 2; // Start after first |
    for (let i = 0; i < colIndex; i++) {
        col += cells[i].length + 1; // +1 for |
    }

    // Find start and end of the cell content (trimmed)
    const cellContent = cells[colIndex];
    const trimmedStart = cellContent.length - cellContent.trimStart().length;
    const trimmedEnd = cellContent.trimEnd().length;

    const startCol = col + trimmedStart;
    const endCol = col + trimmedEnd;

    // Select the cell content in the editor
    window.editor.setSelection(new monaco.Range(lineNumber, startCol, lineNumber, endCol));
    window.editor.revealLineInCenter(lineNumber);
    window.editor.focus();

    // Show a hint to the user
    if (targetElement) {
        targetElement.style.outline = '2px solid var(--accent-color, #0366d6)';
        setTimeout(() => {
            targetElement.style.outline = '';
        }, 500);
    }
}

// Update table decorations and widgets
function updateTableDecorations(editor) {
    if (!config.enabled || !config.showTablePreviews) return;

    const model = editor.getModel();
    if (!model) return;

    // Remove existing table widgets
    tableWidgets.forEach(widget => {
        try {
            editor.removeContentWidget(widget);
        } catch (e) {
            // Widget may already be removed
        }
    });
    tableWidgets = [];
    tableRanges = [];

    const decorations = [];
    const text = model.getValue();
    const lines = text.split('\n');

    // Find all tables
    const tables = findTables(lines);

    tables.forEach((tableData, index) => {
        // Store table range for reference
        tableRanges.push({
            startLine: tableData.startLine,
            endLine: tableData.endLine,
            parsed: tableData.parsed
        });

        // Add decorations to dim the raw markdown table
        for (let i = tableData.startLine; i <= tableData.endLine; i++) {
            if (i <= lines.length) {
                decorations.push({
                    range: new monaco.Range(i, 1, i, lines[i - 1].length + 1),
                    options: {
                        isWholeLine: true,
                        className: 'visual-md-table-source',
                        stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
                    }
                });
            }
        }

        // Create and add table preview widget
        const widget = createTableWidget(editor, tableData, index);
        tableWidgets.push(widget);
        editor.addContentWidget(widget);
    });

    tableDecorations = editor.deltaDecorations(tableDecorations, decorations);
}

// --- Math/LaTeX Preview Functions ---

/**
 * Create a math preview widget for inline or block math
 * @param {Object} editor - Monaco editor instance
 * @param {string} mathContent - The LaTeX content to render
 * @param {number} lineNumber - Line number for positioning
 * @param {boolean} isBlock - Whether this is block (display) math
 * @param {number} startLine - Start line for block math
 * @param {number} endLine - End line for block math
 * @returns {Object} Monaco content widget
 */
function createMathWidget(editor, mathContent, lineNumber, isBlock = false, startLine = null, endLine = null) {
    const widgetId = `math-widget-${lineNumber}-${isBlock ? 'block' : 'inline'}-${Math.random().toString(36).substr(2, 9)}`;

    const widget = {
        getId: () => widgetId,
        getDomNode: () => {
            if (widget.domNode) return widget.domNode;

            const container = document.createElement('div');
            container.className = `visual-md-math-widget ${isBlock ? 'visual-md-math-block' : 'visual-md-math-inline'}`;
            container.style.cssText = `
                display: ${isBlock ? 'block' : 'inline-block'};
                padding: ${isBlock ? '12px 16px' : '2px 4px'};
                margin: ${isBlock ? '8px 0 8px 20px' : '0 2px'};
                background: ${isBlock ? 'var(--bg-secondary, #f6f8fa)' : 'transparent'};
                border-radius: ${isBlock ? '6px' : '3px'};
                ${isBlock ? 'border: 1px solid var(--border-color, #e1e4e8);' : ''}
                font-size: ${isBlock ? '1.1em' : '1em'};
                overflow-x: auto;
                max-width: calc(100% - 40px);
            `;

            // Create a placeholder while MathJax renders
            const placeholder = document.createElement('span');
            placeholder.className = 'math-placeholder';
            placeholder.style.cssText = `
                color: var(--text-muted, #6a737d);
                font-style: italic;
                font-size: 12px;
            `;
            placeholder.textContent = 'Rendering math...';
            container.appendChild(placeholder);

            // Render math using MathJax
            renderMathContent(container, mathContent, isBlock);

            widget.domNode = container;
            return container;
        },
        getPosition: () => ({
            position: {
                lineNumber: isBlock ? (endLine || lineNumber) : lineNumber,
                column: 1
            },
            preference: isBlock
                ? [monaco.editor.ContentWidgetPositionPreference.BELOW]
                : [monaco.editor.ContentWidgetPositionPreference.EXACT]
        })
    };

    return widget;
}

/**
 * Render math content using MathJax
 * @param {HTMLElement} container - Container element for rendered math
 * @param {string} mathContent - LaTeX content to render
 * @param {boolean} isBlock - Whether this is display math
 */
async function renderMathContent(container, mathContent, isBlock) {
    // Check if MathJax is available
    if (!window.MathJax || !window.MathJax.tex2svg) {
        // Wait for MathJax to load
        const checkMathJax = setInterval(() => {
            if (window.MathJax && window.MathJax.tex2svg) {
                clearInterval(checkMathJax);
                doRenderMath(container, mathContent, isBlock);
            }
        }, 100);

        // Timeout after 5 seconds
        setTimeout(() => {
            clearInterval(checkMathJax);
            if (!window.MathJax || !window.MathJax.tex2svg) {
                container.innerHTML = `<span style="color: var(--error-color, #cb2431);">MathJax not available</span>`;
            }
        }, 5000);
        return;
    }

    doRenderMath(container, mathContent, isBlock);
}

/**
 * Actually render the math content once MathJax is available
 * @param {HTMLElement} container - Container element
 * @param {string} mathContent - LaTeX content
 * @param {boolean} isBlock - Display math mode
 */
function doRenderMath(container, mathContent, isBlock) {
    try {
        // Use MathJax.tex2svg for rendering
        const options = {
            display: isBlock
        };

        const node = window.MathJax.tex2svg(mathContent, options);

        // Clear placeholder and add rendered SVG
        container.innerHTML = '';
        container.appendChild(node);

        // Style the SVG
        const svg = container.querySelector('svg');
        if (svg) {
            svg.style.verticalAlign = isBlock ? 'middle' : 'baseline';
            if (!isBlock) {
                svg.style.display = 'inline';
            }
        }

        // Add click-to-edit functionality
        container.title = 'Double-click to edit LaTeX';
        container.style.cursor = 'pointer';

    } catch (error) {
        console.error('[visualMarkdown] Math rendering error:', error);
        container.innerHTML = `
            <span style="color: var(--error-color, #cb2431); font-family: monospace; font-size: 12px;">
                Error: ${error.message || 'Failed to render math'}
            </span>
        `;
    }
}

/**
 * Update math decorations and preview widgets
 * @param {Object} editor - Monaco editor instance
 */
function updateMathDecorations(editor) {
    if (!config.enabled || !config.showMathPreviews) return;

    const model = editor.getModel();
    if (!model) return;

    // Remove existing math widgets
    mathWidgets.forEach(widget => {
        try {
            editor.removeContentWidget(widget);
        } catch (e) {
            // Widget may already be removed
        }
    });
    mathWidgets = [];

    const decorations = [];
    const text = model.getValue();
    const lines = text.split('\n');

    // Track positions to avoid duplicates
    const processedPositions = new Set();

    // Find block math first ($$...$$) - can span multiple lines
    const blockMathRegex = /\$\$([\s\S]+?)\$\$/g;
    let blockMatch;

    while ((blockMatch = blockMathRegex.exec(text)) !== null) {
        const mathContent = blockMatch[1].trim();
        const startIndex = blockMatch.index;
        const endIndex = blockMatch.index + blockMatch[0].length;

        // Calculate line numbers
        const textBefore = text.substring(0, startIndex);
        const startLine = (textBefore.match(/\n/g) || []).length + 1;
        const matchLines = (blockMatch[0].match(/\n/g) || []).length;
        const endLine = startLine + matchLines;

        // Mark positions as processed
        for (let i = startLine; i <= endLine; i++) {
            processedPositions.add(`line-${i}`);
        }

        // Add decorations to dim the raw LaTeX
        for (let i = startLine; i <= endLine; i++) {
            if (i <= lines.length) {
                decorations.push({
                    range: new monaco.Range(i, 1, i, lines[i - 1].length + 1),
                    options: {
                        isWholeLine: true,
                        className: 'visual-md-math-source',
                        stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
                    }
                });
            }
        }

        // Create and add block math preview widget
        const widget = createMathWidget(editor, mathContent, endLine, true, startLine, endLine);
        mathWidgets.push(widget);
        editor.addContentWidget(widget);
    }

    // Find inline math ($...$) - single line only
    lines.forEach((line, lineIndex) => {
        const lineNumber = lineIndex + 1;

        // Skip lines that are part of block math
        if (processedPositions.has(`line-${lineNumber}`)) return;

        // Skip lines inside code blocks
        if (isInsideCodeBlock(lineIndex, lines)) return;

        const inlineMathRegex = /(?<![`$\\])\$(?!\$)([^$\n]+?)\$(?!\$)/g;
        let match;

        while ((match = inlineMathRegex.exec(line)) !== null) {
            const mathContent = match[1];
            const startCol = match.index + 1;
            const endCol = match.index + match[0].length + 1;

            // Add decoration to style the inline math
            decorations.push({
                range: new monaco.Range(lineNumber, startCol, lineNumber, endCol),
                options: {
                    inlineClassName: 'visual-md-math-inline-source',
                    hoverMessage: {
                        value: `**LaTeX:** \`${mathContent}\`\n\n*Click to see rendered preview*`
                    },
                    stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
                }
            });
        }
    });

    mathDecorations = editor.deltaDecorations(mathDecorations, decorations);
}

/**
 * Check if a line is inside a code block
 * @param {number} lineIndex - Zero-based line index
 * @param {Array<string>} lines - Array of document lines
 * @returns {boolean} True if inside a code block
 */
function isInsideCodeBlock(lineIndex, lines) {
    let inCodeBlock = false;
    for (let i = 0; i <= lineIndex && i < lines.length; i++) {
        if (lines[i].match(/^```/)) {
            inCodeBlock = !inCodeBlock;
        }
    }
    return inCodeBlock;
}

// --- WYSIWYG Click-to-Edit Functions ---

// Track editable element ranges for click detection
let editableRanges = [];

// Find the editable element at a given position
function findEditableElementAt(lineNumber, column, lines) {
    const line = lines[lineNumber - 1];
    if (!line) return null;

    // Check for heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
        const hashLen = headingMatch[1].length;
        const textStart = hashLen + 2; // After "# "
        const textEnd = line.length + 1;
        if (column >= textStart && column <= textEnd) {
            return {
                type: 'heading',
                level: hashLen,
                lineNumber: lineNumber,
                contentStart: textStart,
                contentEnd: textEnd,
                content: headingMatch[2],
                fullMatch: line
            };
        }
    }

    // Check for list items
    const listMatch = line.match(/^(\s*)([-*+]|\d+\.)\s+(.+)$/);
    if (listMatch) {
        const prefixLen = listMatch[1].length + listMatch[2].length + 1;
        const textStart = prefixLen + 1;
        const textEnd = line.length + 1;
        if (column >= textStart && column <= textEnd) {
            return {
                type: 'listItem',
                ordered: /\d+\./.test(listMatch[2]),
                lineNumber: lineNumber,
                contentStart: textStart,
                contentEnd: textEnd,
                content: listMatch[3],
                fullMatch: line
            };
        }
    }

    // Check for bold text
    const boldRegex = /(\*\*|__)(.+?)\1/g;
    let match;
    while ((match = boldRegex.exec(line)) !== null) {
        const startCol = match.index + 1;
        const endCol = match.index + match[0].length + 1;
        const markerLen = match[1].length;
        const contentStart = startCol + markerLen;
        const contentEnd = endCol - markerLen;

        if (column >= contentStart && column < contentEnd) {
            return {
                type: 'bold',
                lineNumber: lineNumber,
                contentStart: contentStart,
                contentEnd: contentEnd,
                fullStart: startCol,
                fullEnd: endCol,
                content: match[2],
                marker: match[1]
            };
        }
    }

    // Check for italic text (but not bold)
    const italicRegex = /(?<!\*|\w)(\*|_)(?!\s|\1)(.+?)(?<!\s)\1(?!\*|\w)/g;
    while ((match = italicRegex.exec(line)) !== null) {
        const startCol = match.index + 1;
        const endCol = match.index + match[0].length + 1;
        const contentStart = startCol + 1;
        const contentEnd = endCol - 1;

        if (column >= contentStart && column < contentEnd) {
            return {
                type: 'italic',
                lineNumber: lineNumber,
                contentStart: contentStart,
                contentEnd: contentEnd,
                fullStart: startCol,
                fullEnd: endCol,
                content: match[2],
                marker: match[1]
            };
        }
    }

    // Check for links
    const linkRegex = /(?<!!)\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g;
    while ((match = linkRegex.exec(line)) !== null) {
        const startCol = match.index + 1;
        const endCol = match.index + match[0].length + 1;
        const textStart = startCol + 1;
        const textEnd = textStart + match[1].length;

        // Check if clicking on the link text
        if (column >= textStart && column < textEnd) {
            return {
                type: 'linkText',
                lineNumber: lineNumber,
                contentStart: textStart,
                contentEnd: textEnd,
                fullStart: startCol,
                fullEnd: endCol,
                content: match[1],
                url: match[2],
                title: match[3]
            };
        }

        // Check if clicking on the URL
        const urlStart = textEnd + 2; // After ](
        const urlEnd = urlStart + match[2].length;
        if (column >= urlStart && column < urlEnd) {
            return {
                type: 'linkUrl',
                lineNumber: lineNumber,
                contentStart: urlStart,
                contentEnd: urlEnd,
                fullStart: startCol,
                fullEnd: endCol,
                content: match[2],
                text: match[1]
            };
        }
    }

    // Check for inline code
    const codeRegex = /`([^`\n]+)`/g;
    while ((match = codeRegex.exec(line)) !== null) {
        const startCol = match.index + 1;
        const endCol = match.index + match[0].length + 1;
        const contentStart = startCol + 1;
        const contentEnd = endCol - 1;

        if (column >= contentStart && column < contentEnd) {
            return {
                type: 'inlineCode',
                lineNumber: lineNumber,
                contentStart: contentStart,
                contentEnd: contentEnd,
                fullStart: startCol,
                fullEnd: endCol,
                content: match[1]
            };
        }
    }

    // Check for strikethrough
    const strikeRegex = /~~(.+?)~~/g;
    while ((match = strikeRegex.exec(line)) !== null) {
        const startCol = match.index + 1;
        const endCol = match.index + match[0].length + 1;
        const contentStart = startCol + 2;
        const contentEnd = endCol - 2;

        if (column >= contentStart && column < contentEnd) {
            return {
                type: 'strikethrough',
                lineNumber: lineNumber,
                contentStart: contentStart,
                contentEnd: contentEnd,
                fullStart: startCol,
                fullEnd: endCol,
                content: match[1]
            };
        }
    }

    return null;
}

// Handle double-click for WYSIWYG editing
function setupWysiwygClickHandler(editor) {
    // Double-click to edit formatted content
    editor.onMouseDown((e) => {
        if (!config.enabled || !config.enableWysiwygEditing) return;

        // Only handle double-clicks
        if (e.event.detail !== 2) return;

        const position = e.target.position;
        if (!position) return;

        const model = editor.getModel();
        if (!model) return;

        const lines = model.getValue().split('\n');
        const element = findEditableElementAt(position.lineNumber, position.column, lines);

        if (element) {
            e.event.preventDefault();
            e.event.stopPropagation();

            // Select the content portion for editing
            editor.setSelection(new monaco.Range(
                element.lineNumber,
                element.contentStart,
                element.lineNumber,
                element.contentEnd
            ));
            editor.focus();

            // Show visual feedback
            showEditFeedback(editor, element);
        }
    });
}

// Show visual feedback when entering edit mode
function showEditFeedback(editor, element) {
    // Create a temporary decoration to highlight what's being edited
    const decorationIds = editor.deltaDecorations([], [{
        range: new monaco.Range(
            element.lineNumber,
            element.contentStart,
            element.lineNumber,
            element.contentEnd
        ),
        options: {
            className: 'visual-md-editing',
            stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
        }
    }]);

    // Remove the highlight after a short delay
    setTimeout(() => {
        editor.deltaDecorations(decorationIds, []);
    }, 1000);
}

// Insert formatting around selected text
function insertFormatting(editor, formatType) {
    if (!editor) return;

    const selection = editor.getSelection();
    if (!selection) return;

    const model = editor.getModel();
    if (!model) return;

    const selectedText = model.getValueInRange(selection);
    let newText = '';
    let cursorOffset = 0;

    switch (formatType) {
        case 'bold':
            newText = `**${selectedText}**`;
            cursorOffset = selectedText ? 0 : 2;
            break;
        case 'italic':
            newText = `*${selectedText}*`;
            cursorOffset = selectedText ? 0 : 1;
            break;
        case 'strikethrough':
            newText = `~~${selectedText}~~`;
            cursorOffset = selectedText ? 0 : 2;
            break;
        case 'code':
            newText = `\`${selectedText}\``;
            cursorOffset = selectedText ? 0 : 1;
            break;
        case 'link':
            newText = `[${selectedText || 'text'}](url)`;
            cursorOffset = selectedText ? selectedText.length + 3 : 1;
            break;
        case 'heading1':
            newText = `# ${selectedText}`;
            break;
        case 'heading2':
            newText = `## ${selectedText}`;
            break;
        case 'heading3':
            newText = `### ${selectedText}`;
            break;
        case 'bulletList':
            newText = `- ${selectedText}`;
            break;
        case 'numberedList':
            newText = `1. ${selectedText}`;
            break;
        default:
            return;
    }

    // Apply the edit
    editor.executeEdits('format', [{
        range: selection,
        text: newText
    }]);

    // If no text was selected, position cursor appropriately
    if (!selectedText && cursorOffset > 0) {
        const newPosition = {
            lineNumber: selection.startLineNumber,
            column: selection.startColumn + cursorOffset
        };
        editor.setPosition(newPosition);
    }

    editor.focus();

    // Mark document as modified
    if (window.markDocumentModified) {
        window.markDocumentModified();
    }

    // Update preview
    if (window.updatePreviewAndStructure) {
        window.updatePreviewAndStructure(editor.getValue());
    }
}

// Remove formatting from selected text
function removeFormatting(editor, formatType) {
    if (!editor) return;

    const selection = editor.getSelection();
    if (!selection || selection.isEmpty()) return;

    const model = editor.getModel();
    if (!model) return;

    const lines = model.getValue().split('\n');
    const lineNumber = selection.startLineNumber;
    const line = lines[lineNumber - 1];
    const column = selection.startColumn;

    // Find the element at the cursor position
    const element = findEditableElementAt(lineNumber, column, lines);
    if (!element) return;

    let newText = element.content;
    let range;

    // Determine the range to replace based on element type
    if (element.fullStart && element.fullEnd) {
        range = new monaco.Range(
            lineNumber,
            element.fullStart,
            lineNumber,
            element.fullEnd
        );
    } else if (element.type === 'heading') {
        // For headings, we need to handle the whole line
        const hashLen = element.level;
        range = new monaco.Range(
            lineNumber,
            1,
            lineNumber,
            line.length + 1
        );
        newText = element.content; // Just the text without #
    } else if (element.type === 'listItem') {
        // For list items, preserve indentation but remove marker
        const indentMatch = line.match(/^(\s*)/);
        const indent = indentMatch ? indentMatch[1] : '';
        range = new monaco.Range(
            lineNumber,
            1,
            lineNumber,
            line.length + 1
        );
        newText = indent + element.content;
    } else {
        return;
    }

    // Apply the edit
    editor.executeEdits('remove-format', [{
        range: range,
        text: newText
    }]);

    editor.focus();

    // Mark document as modified
    if (window.markDocumentModified) {
        window.markDocumentModified();
    }

    // Update preview
    if (window.updatePreviewAndStructure) {
        window.updatePreviewAndStructure(editor.getValue());
    }
}

// Toggle formatting on selected text (add if not present, remove if present)
function toggleFormatting(editor, formatType) {
    if (!editor) return;

    const selection = editor.getSelection();
    if (!selection) return;

    const model = editor.getModel();
    if (!model) return;

    const lines = model.getValue().split('\n');
    const lineNumber = selection.startLineNumber;
    const column = selection.startColumn;

    // Check if we're inside formatted text
    const element = findEditableElementAt(lineNumber, column, lines);

    if (element && element.type === formatType) {
        // Remove formatting
        removeFormatting(editor, formatType);
    } else {
        // Add formatting
        insertFormatting(editor, formatType);
    }
}

/**
 * Update all visual markdown enhancements
 * Debounces updates and refreshes images, formatting, links, code blocks, and tables
 * Uses virtual scrolling for large documents (only processes visible viewport)
 *
 * @param {Object} editor - Monaco editor instance
 * @param {boolean} [scrollUpdate=false] - Whether this is a scroll-triggered update
 */
function updateVisualMarkdown(editor, scrollUpdate = false) {
    if (!editor || !config.enabled) return;

    // Clear any pending update
    if (updateTimeout) {
        clearTimeout(updateTimeout);
    }

    // Update visible range for virtual scrolling
    const range = getVisibleRange(editor);
    visibleRange = { startLine: range.startLine, endLine: range.endLine };
    isLargeDocument = range.isLarge;

    // Log performance info for large documents
    if (isLargeDocument && !scrollUpdate) {
        console.log(`[visualMarkdown] Virtual scrolling active: rendering lines ${visibleRange.startLine}-${visibleRange.endLine}`);
    }

    // Debounce updates
    updateTimeout = setTimeout(() => {
        updateImagePreviews(editor);
        updateFormattingDecorations(editor);
        updateLinkDecorations(editor);
        updateCodeBlockDecorations(editor);
        updateTableDecorations(editor);
        updateMathDecorations(editor);
    }, config.updateDebounceMs);
}

/**
 * Handle scroll events for virtual scrolling
 * Updates decorations/widgets when viewport changes in large documents
 *
 * @param {Object} editor - Monaco editor instance
 */
function handleScrollUpdate(editor) {
    if (!editor || !config.enabled || !isLargeDocument) return;

    // Clear pending scroll update
    if (scrollTimeout) {
        clearTimeout(scrollTimeout);
    }

    // Debounce scroll updates
    scrollTimeout = setTimeout(() => {
        const newRange = getVisibleRange(editor);

        // Only update if visible range changed significantly (by more than 10 lines)
        const rangeChanged =
            Math.abs(newRange.startLine - visibleRange.startLine) > 10 ||
            Math.abs(newRange.endLine - visibleRange.endLine) > 10;

        if (rangeChanged) {
            updateVisualMarkdown(editor, true);
        }
    }, config.scrollDebounceMs);
}

/**
 * Clean up all visual markdown enhancements
 * Removes all widgets, decorations, and clears state
 *
 * @param {Object} editor - Monaco editor instance
 */
function cleanupVisualMarkdown(editor) {
    if (!editor) return;

    // Remove image widgets
    imageWidgets.forEach(widget => {
        try {
            editor.removeContentWidget(widget);
        } catch (e) {
            // Ignore
        }
    });
    imageWidgets = [];

    // Remove code block widgets
    codeBlockWidgets.forEach(widget => {
        try {
            editor.removeContentWidget(widget);
        } catch (e) {
            // Ignore
        }
    });
    codeBlockWidgets = [];

    // Remove table widgets
    tableWidgets.forEach(widget => {
        try {
            editor.removeContentWidget(widget);
        } catch (e) {
            // Ignore
        }
    });
    tableWidgets = [];

    // Remove math widgets
    mathWidgets.forEach(widget => {
        try {
            editor.removeContentWidget(widget);
        } catch (e) {
            // Ignore
        }
    });
    mathWidgets = [];

    // Clear decorations
    formatDecorations = editor.deltaDecorations(formatDecorations, []);
    linkDecorations = editor.deltaDecorations(linkDecorations, []);
    codeBlockDecorations = editor.deltaDecorations(codeBlockDecorations, []);
    tableDecorations = editor.deltaDecorations(tableDecorations, []);
    mathDecorations = editor.deltaDecorations(mathDecorations, []);

    // Clear code block state
    codeBlockRanges = [];
    collapsedCodeBlocks.clear();

    // Clear table state
    tableRanges = [];

    // Clear timeouts
    if (updateTimeout) {
        clearTimeout(updateTimeout);
        updateTimeout = null;
    }
    if (scrollTimeout) {
        clearTimeout(scrollTimeout);
        scrollTimeout = null;
    }

    // Reset virtual scrolling state
    visibleRange = { startLine: 1, endLine: 100 };
    isLargeDocument = false;

    // Clear decoration caches
    clearDecorationCaches();
}

/**
 * Enable or disable visual markdown enhancements
 *
 * @param {boolean} enabled - Whether to enable visual markdown
 */
function setVisualMarkdownEnabled(enabled) {
    config.enabled = enabled;
    if (window.editor) {
        if (enabled) {
            updateVisualMarkdown(window.editor);
        } else {
            cleanupVisualMarkdown(window.editor);
        }
    }
}

/**
 * Toggle image preview display
 *
 * @param {boolean} enabled - Whether to show image previews
 */
function toggleImagePreviews(enabled) {
    config.showImagePreviews = enabled;
    if (window.editor && config.enabled) {
        if (enabled) {
            updateImagePreviews(window.editor);
        } else {
            imageWidgets.forEach(widget => {
                try {
                    window.editor.removeContentWidget(widget);
                } catch (e) {}
            });
            imageWidgets = [];
        }
    }
}

/**
 * Initialize visual markdown enhancements for an editor
 * Sets up content change listeners, scroll handlers, and click handlers
 *
 * @param {Object} editor - Monaco editor instance
 */
function initializeVisualMarkdown(editor) {
    if (!editor) return;

    // In browser mode, don't initialize at all
    if (isBrowserMode) {
        console.log('[visualMarkdown] Skipping initialization in browser mode');
        return;
    }

    // Load setting from appSettings if available
    if (window.appSettings && typeof window.appSettings.editor?.visualMarkdown === 'boolean') {
        config.enabled = window.appSettings.editor.visualMarkdown;
        console.log('[visualMarkdown] Loaded setting from appSettings:', config.enabled);
    }

    // Set up content change listener
    editor.onDidChangeModelContent(() => {
        updateVisualMarkdown(editor);
    });

    // Set up scroll listener for virtual scrolling
    editor.onDidScrollChange(() => {
        handleScrollUpdate(editor);
    });

    // Set up link click handler
    setupLinkClickHandler(editor);

    // Set up WYSIWYG click-to-edit handler
    setupWysiwygClickHandler(editor);

    // Initial update (only if enabled)
    if (config.enabled) {
        updateVisualMarkdown(editor);
    }

    console.log('[visualMarkdown] Initialized visual markdown enhancements, enabled:', config.enabled);
}

/**
 * Check if visual markdown is available in the current environment
 *
 * @returns {boolean} True if running in Electron (not browser mode)
 */
function isVisualMarkdownAvailable() {
    return !isBrowserMode;
}

// --- Export Functions ---
window.initializeVisualMarkdown = initializeVisualMarkdown;
window.updateVisualMarkdown = updateVisualMarkdown;
window.cleanupVisualMarkdown = cleanupVisualMarkdown;
window.setVisualMarkdownEnabled = setVisualMarkdownEnabled;
window.toggleImagePreviews = toggleImagePreviews;
window.isVisualMarkdownAvailable = isVisualMarkdownAvailable;
window.collapseAllCodeBlocks = collapseAllCodeBlocks;
window.expandAllCodeBlocks = expandAllCodeBlocks;
window.visualMarkdownConfig = config;

// WYSIWYG editing exports
window.insertFormatting = insertFormatting;
window.removeFormatting = removeFormatting;
window.toggleFormatting = toggleFormatting;
window.findEditableElementAt = findEditableElementAt;

// Export for module systems if available
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        initializeVisualMarkdown,
        updateVisualMarkdown,
        cleanupVisualMarkdown,
        setVisualMarkdownEnabled,
        toggleImagePreviews,
        isVisualMarkdownAvailable,
        collapseAllCodeBlocks,
        expandAllCodeBlocks,
        insertFormatting,
        removeFormatting,
        toggleFormatting,
        findEditableElementAt,
        config
    };
}
