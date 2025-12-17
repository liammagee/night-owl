// === Visual Markdown Module ===
// Provides visual enhancements for markdown editing in Monaco editor:
// - Inline image previews via content widgets
// - Visual formatting decorations (bold, italic, strikethrough)
// - Clickable links with hover preview
// - Collapsible code blocks with syntax info

// --- State Variables ---
let imageWidgets = [];
let formatDecorations = [];
let linkDecorations = [];
let codeBlockDecorations = [];
let codeBlockWidgets = [];
let collapsedCodeBlocks = new Set(); // Set of block IDs that are collapsed
let hoverWidget = null;
let updateTimeout = null;
let codeBlockRanges = []; // Track code block ranges for collapse functionality
let tableWidgets = []; // Table preview widgets
let tableDecorations = []; // Table decorations
let tableRanges = []; // Track table ranges for editing

// --- Configuration ---
const config = {
    enabled: false, // Disabled by default - opt-in feature
    showImagePreviews: true,
    showFormattingDecorations: true,
    showLinkDecorations: true,
    showCodeBlockDecorations: true,
    showTablePreviews: true, // Show formatted table previews
    collapsibleCodeBlocks: true, // Enable collapse/expand for code blocks
    autoCollapseCodeBlocks: false, // Auto-collapse code blocks on load
    codeBlockCollapsedLines: 3, // Number of lines to show when collapsed
    imageMaxWidth: 400,
    imageMaxHeight: 300,
    updateDebounceMs: 150
};

// --- Environment Detection ---
// Detect if running in Electron or browser
const isElectron = !!(window.electronAPI && window.electronAPI.isElectron);
const isBrowserMode = !isElectron;

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
        // Check if we have a current directory context
        if (window.currentDirectory) {
            return `file://${window.currentDirectory}/${imageUrl}`;
        }
    }
    return imageUrl;
}

function updateImagePreviews(editor) {
    if (!config.enabled || !config.showImagePreviews) return;

    // Remove existing widgets
    imageWidgets.forEach(widget => {
        try {
            editor.removeContentWidget(widget);
        } catch (e) {
            // Widget may already be removed
        }
    });
    imageWidgets = [];

    const model = editor.getModel();
    if (!model) return;

    const text = model.getValue();
    const lines = text.split('\n');

    lines.forEach((line, lineIndex) => {
        const regex = new RegExp(patterns.image.source, 'g');
        let match;

        while ((match = regex.exec(line)) !== null) {
            const widget = createImageWidget(editor, match, lineIndex, match.index);
            imageWidgets.push(widget);
            editor.addContentWidget(widget);
        }
    });
}

// --- Formatting Decorations ---
function updateFormattingDecorations(editor) {
    if (!config.enabled || !config.showFormattingDecorations) return;

    const model = editor.getModel();
    if (!model) return;

    const decorations = [];
    const text = model.getValue();
    const lines = text.split('\n');

    lines.forEach((line, lineIndex) => {
        const lineNumber = lineIndex + 1;

        // Bold decorations
        let boldRegex = new RegExp(patterns.bold.source, 'g');
        let match;
        while ((match = boldRegex.exec(line)) !== null) {
            const startCol = match.index + 1;
            const endCol = match.index + match[0].length + 1;
            const markerLen = match[1].length;

            // Style the content (not the markers)
            decorations.push({
                range: new monaco.Range(lineNumber, startCol + markerLen, lineNumber, endCol - markerLen),
                options: {
                    inlineClassName: 'visual-md-bold',
                    stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
                }
            });

            // Dim the markers
            decorations.push({
                range: new monaco.Range(lineNumber, startCol, lineNumber, startCol + markerLen),
                options: {
                    inlineClassName: 'visual-md-marker',
                    stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
                }
            });
            decorations.push({
                range: new monaco.Range(lineNumber, endCol - markerLen, lineNumber, endCol),
                options: {
                    inlineClassName: 'visual-md-marker',
                    stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
                }
            });
        }

        // Italic decorations (avoiding bold markers)
        let italicRegex = new RegExp(patterns.italic.source, 'g');
        while ((match = italicRegex.exec(line)) !== null) {
            const startCol = match.index + 1;
            const endCol = match.index + match[0].length + 1;

            decorations.push({
                range: new monaco.Range(lineNumber, startCol + 1, lineNumber, endCol - 1),
                options: {
                    inlineClassName: 'visual-md-italic',
                    stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
                }
            });

            // Dim markers
            decorations.push({
                range: new monaco.Range(lineNumber, startCol, lineNumber, startCol + 1),
                options: {
                    inlineClassName: 'visual-md-marker',
                    stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
                }
            });
            decorations.push({
                range: new monaco.Range(lineNumber, endCol - 1, lineNumber, endCol),
                options: {
                    inlineClassName: 'visual-md-marker',
                    stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
                }
            });
        }

        // Strikethrough decorations
        let strikeRegex = new RegExp(patterns.strikethrough.source, 'g');
        while ((match = strikeRegex.exec(line)) !== null) {
            const startCol = match.index + 1;
            const endCol = match.index + match[0].length + 1;

            decorations.push({
                range: new monaco.Range(lineNumber, startCol + 2, lineNumber, endCol - 2),
                options: {
                    inlineClassName: 'visual-md-strikethrough',
                    stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
                }
            });

            // Dim markers
            decorations.push({
                range: new monaco.Range(lineNumber, startCol, lineNumber, startCol + 2),
                options: {
                    inlineClassName: 'visual-md-marker',
                    stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
                }
            });
            decorations.push({
                range: new monaco.Range(lineNumber, endCol - 2, lineNumber, endCol),
                options: {
                    inlineClassName: 'visual-md-marker',
                    stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
                }
            });
        }

        // Inline code decorations
        let codeRegex = new RegExp(patterns.inlineCode.source, 'g');
        while ((match = codeRegex.exec(line)) !== null) {
            const startCol = match.index + 1;
            const endCol = match.index + match[0].length + 1;

            decorations.push({
                range: new monaco.Range(lineNumber, startCol, lineNumber, endCol),
                options: {
                    inlineClassName: 'visual-md-inline-code',
                    stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
                }
            });
        }

        // Heading decorations
        const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
        if (headingMatch) {
            const level = headingMatch[1].length;
            const hashEnd = headingMatch[1].length + 1;

            // Style the heading text
            decorations.push({
                range: new monaco.Range(lineNumber, hashEnd + 1, lineNumber, line.length + 1),
                options: {
                    inlineClassName: `visual-md-heading visual-md-h${level}`,
                    stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
                }
            });

            // Dim the hash marks
            decorations.push({
                range: new monaco.Range(lineNumber, 1, lineNumber, hashEnd + 1),
                options: {
                    inlineClassName: 'visual-md-marker visual-md-heading-marker',
                    stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
                }
            });
        }
    });

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

    lines.forEach((line, lineIndex) => {
        const lineNumber = lineIndex + 1;
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
                    hoverMessage: { value: `**Link:** [${linkUrl}](${linkUrl})` },
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
    });

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
    });
}

function openLink(url) {
    // Handle different link types
    if (url.startsWith('http://') || url.startsWith('https://')) {
        // External link - open in browser
        if (window.electronAPI && window.electronAPI.invoke) {
            window.electronAPI.invoke('open-external', url);
        } else {
            window.open(url, '_blank');
        }
    } else if (url.endsWith('.md')) {
        // Internal markdown link - could navigate to file
        console.log('Internal link navigation:', url);
        // TODO: Implement internal file navigation
    } else if (url.startsWith('#')) {
        // Anchor link - scroll to heading
        const headingId = url.substring(1);
        scrollToHeading(headingId);
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

// --- Main Update Function ---
function updateVisualMarkdown(editor) {
    if (!editor || !config.enabled) return;

    // Clear any pending update
    if (updateTimeout) {
        clearTimeout(updateTimeout);
    }

    // Debounce updates
    updateTimeout = setTimeout(() => {
        updateImagePreviews(editor);
        updateFormattingDecorations(editor);
        updateLinkDecorations(editor);
        updateCodeBlockDecorations(editor);
        updateTableDecorations(editor);
    }, config.updateDebounceMs);
}

// --- Cleanup Function ---
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

    // Clear decorations
    formatDecorations = editor.deltaDecorations(formatDecorations, []);
    linkDecorations = editor.deltaDecorations(linkDecorations, []);
    codeBlockDecorations = editor.deltaDecorations(codeBlockDecorations, []);
    tableDecorations = editor.deltaDecorations(tableDecorations, []);

    // Clear code block state
    codeBlockRanges = [];
    collapsedCodeBlocks.clear();

    // Clear table state
    tableRanges = [];

    // Clear timeout
    if (updateTimeout) {
        clearTimeout(updateTimeout);
        updateTimeout = null;
    }
}

// --- Toggle Functions ---
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

// --- Initialization ---
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

    // Set up link click handler
    setupLinkClickHandler(editor);

    // Initial update (only if enabled)
    if (config.enabled) {
        updateVisualMarkdown(editor);
    }

    console.log('[visualMarkdown] Initialized visual markdown enhancements, enabled:', config.enabled);
}

// Check if visual markdown is available (not in browser mode)
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
        config
    };
}
