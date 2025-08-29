
// --- Electron IPC (for theme) ---
// Access IPC functions exposed by preload.js via window.electronAPI

// --- Electron Remote (for context menu) ---
// Context menu items (Menu, MenuItem) are now handled in the main process

// --- Global Variables ---
try {
    // Startup debug logging removed
} catch (startupError) {
    console.error('ERROR in renderer.js startup:', startupError);
}
let editor = null;
let fallbackEditor = null;
let markedInstance = null;

// Auto-save variables
let autoSaveTimer = null;
let hasUnsavedChanges = false;
let lastSavedContent = '';
let suppressAutoSave = false; // Flag to temporarily disable auto-save during file operations

// Speaker notes variables
let currentSpeakerNotes = [];
let speakerNotesVisible = false;

// --- DOM Elements ---
const editorContainer = document.getElementById('editor-container');
const previewContent = document.getElementById('preview-content');
const structureList = document.getElementById('structure-list');
const showPreviewBtn = document.getElementById('show-preview-btn');
const showChatBtn = document.getElementById('show-chat-btn');
const showWholepartBtn = document.getElementById('show-wholepart-btn');
const previewPane = document.getElementById('preview-pane');
const chatPane = document.getElementById('chat-pane');
const wholepartPane = document.getElementById('wholepart-pane');
const structurePaneTitle = document.getElementById('structure-pane-title');
const showStructureBtn = document.getElementById('show-structure-btn');
const showFilesBtn = document.getElementById('show-files-btn');
const fileTreeView = document.getElementById('file-tree-view');
const tagSearchSection = document.getElementById('tag-search-section');
const tagSearchInput = document.getElementById('tag-search-input');
const tagFilterChips = document.getElementById('tag-filter-chips');
window.fileTreeView = fileTreeView;
const newFolderBtn = document.getElementById('new-folder-btn');
const changeDirectoryBtn = document.getElementById('change-directory-btn');
const chatMessages = document.getElementById('chat-messages');

// Find & Replace elements
const findReplaceDialog = document.getElementById('find-replace-dialog');
const findReplaceClose = document.getElementById('find-replace-close');
const findInput = document.getElementById('find-input');
const replaceInput = document.getElementById('replace-input');
const caseSensitive = document.getElementById('case-sensitive');
const regexMode = document.getElementById('regex-mode');
const wholeWord = document.getElementById('whole-word');
const findNextEl = document.getElementById('find-next');
const findPreviousEl = document.getElementById('find-previous');
const replaceCurrent = document.getElementById('replace-current');
const replaceAllEl = document.getElementById('replace-all');
const findReplaceStats = document.getElementById('find-replace-stats');

// Folder name modal elements
const folderNameModal = document.getElementById('folder-name-modal');
const folderNameInput = document.getElementById('folder-name-input');
const folderNameError = document.getElementById('folder-name-error');
const folderNameCancel = document.getElementById('folder-name-cancel');
const folderNameCreate = document.getElementById('folder-name-create');

const chatInput = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send-btn');
const loadEditorToChatBtn = document.getElementById('load-editor-to-chat-btn'); // Get the new button
const copyAIResponseBtn = document.getElementById('copy-ai-response-btn'); // New button

// Command Palette elements
const commandPaletteOverlay = document.getElementById('command-palette-overlay');
const commandPaletteInput = document.getElementById('command-palette-input');
const commandPaletteResults = document.getElementById('command-palette-results');

// Speaker notes pane elements

// Keep require.config as needed - only if require is available
if (typeof require !== 'undefined') {
    require.config({ paths: { 'vs': './node_modules/monaco-editor/min/vs' } });
}

// --- Status Bar Update Function ---
function updateStatusBar(content) {
    const wordCountEl = document.getElementById('word-count');
    const charCountEl = document.getElementById('char-count');
    const lineCountEl = document.getElementById('line-count');
    const cursorPosEl = document.getElementById('cursor-position');
    
    if (!content) content = '';
    
    // Check if there's selected text in the Monaco editor
    let selectedText = '';
    let isSelection = false;
    
    if (editor && editor.getSelection && editor.getModel) {
        const selection = editor.getSelection();
        if (selection && !selection.isEmpty()) {
            selectedText = editor.getModel().getValueInRange(selection);
            isSelection = true;
        }
    }
    
    // Determine which content to analyze (selection vs full document)
    const contentToAnalyze = isSelection ? selectedText : content;
    const prefix = isSelection ? 'Sel: ' : '';
    
    // Count words (split by whitespace, filter empty strings)
    const words = contentToAnalyze.trim().split(/\s+/).filter(word => word.length > 0);
    const wordCount = contentToAnalyze.trim() === '' ? 0 : words.length;
    
    // Count characters
    const charCount = contentToAnalyze.length;
    
    // Count lines
    const lineCount = contentToAnalyze === '' ? 1 : contentToAnalyze.split('\n').length;
    
    // Update status bar elements with consistent styling
    if (wordCountEl) {
        wordCountEl.textContent = `${prefix}Words: ${wordCount}`;
    }
    
    if (charCountEl) {
        charCountEl.textContent = `${prefix}Chars: ${charCount}`;
    }
    
    if (lineCountEl) {
        lineCountEl.textContent = `${prefix}Lines: ${lineCount}`;
    }
    
    // Update cursor position if editor is available
    if (editor && editor.getPosition) {
        const position = editor.getPosition();
        if (cursorPosEl && position) {
            if (isSelection) {
                const selection = editor.getSelection();
                const startLine = selection.startLineNumber;
                const endLine = selection.endLineNumber;
                
                if (startLine === endLine) {
                    cursorPosEl.textContent = `Ln ${startLine} (sel)`;
                } else {
                    cursorPosEl.textContent = `Ln ${startLine}-${endLine} (sel)`;
                }
            } else {
                cursorPosEl.textContent = `Ln ${position.lineNumber}, Col ${position.column}`;
            }
        }
    } else if (cursorPosEl) {
        cursorPosEl.textContent = 'Ln 1, Col 1';
    }
}

function updateStatusBarWithKanban(totalTasks, doneTasks) {
    const wordCountEl = document.getElementById('word-count');
    const charCountEl = document.getElementById('char-count');
    const lineCountEl = document.getElementById('line-count');
    const cursorPosEl = document.getElementById('cursor-position');
    
    // Calculate progress
    const inProgressTasks = totalTasks - doneTasks;
    const progressPercent = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
    
    // Update status bar elements with Kanban stats
    if (wordCountEl) wordCountEl.textContent = `📋 Total Tasks: ${totalTasks}`;
    if (charCountEl) charCountEl.textContent = `✅ Completed: ${doneTasks}`;
    if (lineCountEl) lineCountEl.textContent = `⏳ Remaining: ${inProgressTasks}`;
    if (cursorPosEl) cursorPosEl.textContent = `📊 Progress: ${progressPercent}%`;
}

// --- Process Speaker Notes Extension ---
function processSpeakerNotes(content) {
    // Extract speaker notes from ```notes blocks
    const speakerNotesRegex = /```notes\n([\s\S]*?)\n```/g;
    const extractedNotes = [];
    let noteIndex = 0;
    
    // Replace speaker notes blocks with placeholders and extract content
    const processedContent = content.replace(speakerNotesRegex, (match, notesContent) => {
        const noteId = `speaker-note-${noteIndex}`;
        extractedNotes.push({
            id: noteId,
            content: notesContent.trim(),
            index: noteIndex
        });
        noteIndex++;
        
        // Return a placeholder that will be processed later
        return `<div class="speaker-notes-placeholder" data-note-id="${noteId}" style="display: none;"></div>`;
    });
    
    // Store extracted notes globally
    currentSpeakerNotes = extractedNotes;
    
    return processedContent;
}

// Internal links processing is handled by the internalLinks.js module

// --- Process Annotations ---
// Annotations processing is handled by the annotations.js module

// --- Math Rendering Functions ---
async function renderMathInContent(container) {
    if (!container) return;
    
    // Check if MathJax is available and ready
    if (typeof window.MathJax === 'undefined' || !window.MathJax) {
        return; // MathJax not loaded yet
    }
    
    try {
        // Check if MathJax has the typesetPromise method (v3)
        if (window.MathJax.typesetPromise) {
            // Tell MathJax to process the new content
            await window.MathJax.typesetPromise([container]);
        } else if (window.MathJax.typeset) {
            // Fallback to synchronous typeset if available
            window.MathJax.typeset([container]);
        } else if (window.MathJax.startup && window.MathJax.startup.document) {
            // Alternative approach for MathJax v3
            window.MathJax.startup.document.clear();
            window.MathJax.startup.document.updateDocument();
        }
    } catch (error) {
        // Only log error if it's not about MathJax not being ready
        if (!error.message?.includes('typesetPromise')) {
            console.error('Error rendering math:', error);
        }
    }
}

// Helper function to render math in presentation slides
async function renderMathInPresentation() {
    const presentationContent = document.getElementById('presentation-content');
    if (presentationContent) {
        await renderMathInContent(presentationContent);
    }
}

// --- Internal Links Functionality ---
// All internal links functionality has been moved to modules/internalLinks.js
// --- Update Function Definition ---
async function updatePreviewAndStructure(markdownContent) {
    // Ensure markdownContent is a string
    if (typeof markdownContent !== 'string') {
        markdownContent = markdownContent ? String(markdownContent) : '';
    }
    
    // Updating preview and structure
    
    // Check if we should suppress this preview update (for PDF/non-markdown files)
    if (window.suppressNextPreviewUpdate || window.suppressPreviewUpdateCount > 0) {
        // Suppressing preview update as requested
        window.suppressNextPreviewUpdate = false;
        if (window.suppressPreviewUpdateCount > 0) {
            window.suppressPreviewUpdateCount--;
        }
        return;
    }
    
    if (!previewContent) {
        console.error('[renderer.js] previewContent element not found!');
        return; // Don't proceed if the element is missing
    }
    
    // Ensure markdownContent is defined
    if (typeof markdownContent === 'undefined' || markdownContent === null) {
        // Try to get content from editor if available
        if (window.editor && typeof window.editor.getValue === 'function') {
            markdownContent = window.editor.getValue();
        } else {
            // Only warn if we truly have no content source
            markdownContent = '';
            // This is normal on initial load or when called without arguments
            // console.debug('[renderer.js] No markdown content provided, using empty string');
        }
    }
    
    // Check if this should be rendered as a Kanban board (async)
    const currentFilePath = window.currentFilePath;
    // Check for Kanban rendering
    
    if (currentFilePath) {
        // Handle Kanban check asynchronously
        window.electronAPI.invoke('get-settings')
            .then(async settings => {
                if (shouldRenderAsKanban(currentFilePath, settings)) {
                    // Title remains consistent - don't change document title for Kanban files
                    
                    // Parse Kanban data
                    const parsedKanban = parseKanbanFromMarkdown(markdownContent, settings);
                    
                    // Use intelligent update instead of full re-render
                    const wasUpdated = updateKanbanBoard(previewContent, parsedKanban, currentFilePath);
                    
                    // Always ensure drag-and-drop is set up, regardless of updates
                    if (settings.kanban?.enableDragDrop) {
                        const kanbanBoard = previewContent.querySelector('.kanban-board');
                        if (kanbanBoard) {
                            setupKanbanDragAndDrop(previewContent, currentFilePath);
                        }
                    }
                    
                    // Set up task action buttons (edit, delete, add)
                    const kanbanBoard = previewContent.querySelector('.kanban-board');
                    if (kanbanBoard) {
                        setupKanbanTaskActions(previewContent, currentFilePath);
                    }
                    
                    // Only run other setup operations if the board was actually updated
                    if (wasUpdated) {
                        // Running additional setup operations
                        
                        // Force horizontal scrolling after Kanban renders
                        setTimeout(() => {
                            forceKanbanHorizontalScroll();
                        }, 100);
                    } else {
                        console.log('[renderer.js] Kanban board unchanged, skipping render-dependent operations');
                    }
                    
                    // Update status bar with Kanban stats
                    const totalTasks = parsedKanban.tasks.length;
                    const doneTasks = parsedKanban.tasksByColumn.done?.length || 0;
                    updateStatusBarWithKanban(totalTasks, doneTasks);
                    
                    // Clear structure pane for Kanban view
                    const structureList = document.getElementById('structure-list');
                    if (structureList) {
                        structureList.innerHTML = '<li>📋 Kanban Board View</li>';
                    }
                    
                    // Adjust layout for Kanban view - minimize editor pane
                    const editorPane = document.getElementById('editor-pane');
                    const previewPane = document.getElementById('preview-pane');
                    if (editorPane && previewPane) {
                        editorPane.style.flex = '0 0 300px'; // Minimize editor to 300px
                        previewPane.style.flex = '1'; // Preview takes remaining space
                    }
                    
                    return; // Exit early for Kanban rendering
                }
                
                // Not a Kanban file - render as regular markdown
                // Title remains consistent - don't change document title for markdown files
                await renderRegularMarkdown(markdownContent);
            })
            .catch(async error => {
                console.error('[renderer.js] Error checking Kanban rendering:', error);
                // Fall back to regular markdown rendering
                await renderRegularMarkdown(markdownContent);
            });
        
        return; // Exit to avoid double rendering
    }
    
    // If no currentFilePath, render regular markdown
    await renderRegularMarkdown(markdownContent);
}

// Helper functions for markdown rendering
function resetKanbanStateAndLayout() {
    // Reset kanban state when switching to non-kanban files
    if (window.resetKanbanState) {
        window.resetKanbanState();
    }
}

function restoreNormalLayout() {
    const editorPane = document.getElementById('editor-pane');
    const previewPane = document.getElementById('preview-pane');
    
    if (editorPane && previewPane) {
        editorPane.style.flex = '1'; // 50% width for editor
        previewPane.style.flex = '1'; // 50% width for preview
        
        // Force remove Kanban-specific width constraints (including !important ones)
        previewPane.style.setProperty('max-width', 'none', 'important');
        previewPane.style.setProperty('overflow-x', 'visible', 'important');
        previewPane.style.setProperty('overflow-y', 'visible', 'important');
        
        // Then remove the properties entirely to let CSS defaults take over
        setTimeout(() => {
            previewPane.style.removeProperty('max-width');
            previewPane.style.removeProperty('overflow-x');
            previewPane.style.removeProperty('overflow-y');
        }, 10);
        
        console.log('[renderer.js] Restored normal layout and removed Kanban constraints');
    }
    
    return { editorPane, previewPane };
}

function checkAndFixCorruptedLayout(editorPane, previewPane) {
    const leftSidebar = document.getElementById('left-sidebar');
    if (!leftSidebar || !editorPane || !previewPane) return;
    
    let shouldResetLayout = false;
    
    try {
        const settings = window.appSettings;
        if (settings?.layout) {
            const rightWidthNum = parseFloat(settings.layout.rightWidth);
            const editorWidthNum = parseFloat(settings.layout.editorWidth);
            const structureWidthNum = parseFloat(settings.layout.structureWidth);
            
            // If any width is over 80% or the total is over 120%, layout is corrupted
            if (rightWidthNum > 80 || editorWidthNum > 80 || structureWidthNum > 80 ||
                (rightWidthNum + editorWidthNum + structureWidthNum) > 120) {
                shouldResetLayout = true;
                console.log('[renderer.js] Detected corrupted layout values, resetting');
            }
        }
    } catch (error) {
        shouldResetLayout = true;
        console.log('[renderer.js] Error checking layout, resetting to defaults');
    }
    
    if (shouldResetLayout) {
        // Reset to sensible default layout when switching from Kanban
        leftSidebar.style.flex = '0 0 18%';
        editorPane.style.flex = '0 0 41%';
        previewPane.style.flex = '0 0 41%';
        
        // Also save the corrected layout
        if (window.electronAPI) {
            window.electronAPI.invoke('set-settings', 'layout', {
                structureWidth: '18%',
                editorWidth: '41%',
                rightWidth: '41%'
            }).catch(error => console.error('Failed to save corrected layout:', error));
        }
    }
}

function removePreviewOverflowConstraints() {
    if (previewContent) {
        previewContent.style.setProperty('overflow-x', 'visible', 'important');
        previewContent.style.setProperty('overflow-y', 'visible', 'important');
        
        setTimeout(() => {
            previewContent.style.removeProperty('overflow-x');
            previewContent.style.removeProperty('overflow-y');
        }, 10);
    }
}

function createCustomMarkdownRenderer() {
    const renderer = new marked.Renderer();
    const originalHeading = renderer.heading.bind(renderer);
    const originalImage = renderer.image.bind(renderer);

    // Override the heading method to add IDs
    renderer.heading = (text, level, raw) => {
        let html = originalHeading(text, level, raw);
        const id = `heading-${slugify(raw || text)}`;
        if (id !== 'heading-') {
            html = html.replace(/^(<h[1-6])/, `$1 id="${id}"`);
        }
        return html;
    };

    // Override the image method to fix relative paths
    renderer.image = (href, title, text) => {
        if (href && !href.startsWith('http') && !href.startsWith('/') && !href.startsWith('file://')) {
            const baseDir = window.currentFileDirectory || window.appSettings?.workingDirectory || '/Users/lmagee/Dev/hegel-pedagogy-ai/lectures';
            const fullPath = `file://${baseDir}/${href}`;
            return originalImage(fullPath, title, text);
        }
        return originalImage(href, title, text);
    };

    return renderer;
}

function processMarkdownContent(markdownContent) {
    // Ensure we have a string to process
    if (typeof markdownContent !== 'string') {
        markdownContent = markdownContent || '';
    }
    
    let processedContent = markdownContent;
    
    // Process annotations first
    if (typeof processAnnotations === 'function') {
        processedContent = processAnnotations(processedContent);
    }
    
    // Process speaker notes after annotations
    processedContent = processSpeakerNotes(processedContent);
    
    return processedContent;
}

async function renderMarkdownContent(markdownContent) {
    // Check if marked is available
    if (typeof marked === 'undefined') {
        console.error('[renderer.js] Marked library not loaded, using fallback');
        previewContent.innerHTML = '<pre>' + markdownContent + '</pre>';
        return;
    }

    if (!window.marked) {
        console.warn('[renderer.js] Marked instance not available yet');
        previewContent.innerHTML = '<p>Markdown preview loading...</p>';
        return;
    }

    const renderer = createCustomMarkdownRenderer();
    const processedContent = processMarkdownContent(markdownContent);
    
    // Use the custom renderer with marked.parse
    let htmlContent = window.marked.parse(processedContent, { 
        renderer: renderer, 
        gfm: true, 
        breaks: true 
    });
    
    // Process Obsidian-style [[]] internal links on the rendered HTML
    if (typeof processInternalLinksHTML === 'function') {
        htmlContent = await processInternalLinksHTML(htmlContent);
    }
    
    // Apply preview zoom if available (but not for PDFs)
    const isPDF = window.currentFilePath && window.currentFilePath.endsWith('.pdf');
    if (window.previewZoom && !isPDF) {
        htmlContent = await window.previewZoom.onPreviewUpdate(window.currentFilePath, htmlContent);
    }
    
    previewContent.innerHTML = htmlContent;
    
    // Render math equations with MathJax
    await renderMathInContent(previewContent);
    
    // Update speaker notes display if visible
    updateSpeakerNotesDisplay();
}

async function renderRegularMarkdown(markdownContent) {
    resetKanbanStateAndLayout();
    const { editorPane, previewPane } = restoreNormalLayout();
    checkAndFixCorruptedLayout(editorPane, previewPane);
    removePreviewOverflowConstraints();
    
    // Update status bar with current content
    updateStatusBar(markdownContent);

    try {
        await renderMarkdownContent(markdownContent);
    } catch (error) {
        console.error('[renderer.js] Error parsing Markdown for preview:', error);
        previewContent.innerHTML = '<p>Error rendering Markdown preview.</p>';
    }

    // Update structure pane (ensure this happens after preview update)
    updateStructurePane(markdownContent);
}

// --- Structure Pane Logic ---
// Helper functions for structure pane
function validateStructurePaneInputs(markdownContent) {
    if (!markedInstance) {
        console.warn('[renderer.js] Marked instance not ready for structure pane.');
        return { isValid: false };
    }
    
    if (!markdownContent || typeof markdownContent !== 'string') {
        console.warn('[renderer.js] markdownContent is undefined or not a string:', markdownContent);
        const structurePane = document.getElementById('structure-pane');
        if (structurePane) {
            structurePane.innerHTML = '<p>No content to display structure.</p>';
        }
        return { isValid: false };
    }
    
    return { isValid: true };
}

function extractHeadingsFromMarkdown(markdownContent) {
    const lines = markdownContent.split('\n');
    const headings = [];
    const headingRegex = /^(#{1,6})\s+(.*)/; // Regex to find headings

    // Iterate through lines to find headings and their correct line numbers
    lines.forEach((line, index) => {
        const match = line.trim().match(headingRegex);
        if (match) {
            const level = match[1].length; // Number of '#' determines level
            const title = match[2].trim(); // Text after '#'
            headings.push({
                level: level,
                title: title,
                startLine: index, // Use the actual line index (0-based)
                endLine: lines.length - 1 // Default end line, will be updated
            });
        }
    });

    return { headings, totalLines: lines.length };
}

function calculateHeadingEndLines(headings, totalLines) {
    // Determine end lines for each heading
    for (let i = 0; i < headings.length; i++) {
        let nextHeadingLine = totalLines; // Default to end of doc
        for (let j = i + 1; j < headings.length; j++) {
            // Find the next heading at the same or higher level
            if (headings[j].level <= headings[i].level) {
                nextHeadingLine = headings[j].startLine;
                break;
            }
        }
        // End line is the line before the next heading starts
        headings[i].endLine = nextHeadingLine > 0 ? nextHeadingLine - 1 : 0;
        // Adjust end line if it's before start line (e.g., empty section)
        if (headings[i].endLine < headings[i].startLine) {
             headings[i].endLine = headings[i].startLine; 
        }
    }
    
    return headings;
}

function createHeadingListElement(heading, index) {
    const li = document.createElement('li');
    li.classList.add(`level-${heading.level}`);

    // Add toggle icon
    const toggle = document.createElement('span');
    toggle.classList.add('structure-toggle');
    toggle.textContent = '▼'; // Default: expanded
    toggle.onclick = (event) => {
        event.stopPropagation(); // Prevent li's onclick from firing
        toggleCollapse(li, heading.level);
    };
    li.appendChild(toggle);

    // Add heading text (strip anchor tags for display)
    const textSpan = document.createElement('span');
    const cleanTitle = heading.title
        .replace(/<a\s+(?:name|id)="[^"]*"><\/a>/g, '')  // Remove anchor tags
        .replace(/\*\*(.*?)\*\*/g, '$1')                 // Remove bold markdown **text**
        .replace(/\*(.*?)\*/g, '$1')                     // Remove italic markdown *text*
        .replace(/__(.*?)__/g, '$1')                     // Remove bold markdown __text__
        .replace(/_(.*?)_/g, '$1')                       // Remove italic markdown _text_
        .trim();
    
    // Truncate very long headings over 50 characters
    const displayTitle = cleanTitle.length > 50 ? cleanTitle.substring(0, 47) + '...' : cleanTitle;
    
    textSpan.textContent = displayTitle;
    textSpan.classList.add('structure-heading-text');
    textSpan.title = cleanTitle; // Show full text on hover
    li.appendChild(textSpan);

    // Add structure action buttons
    const actionsContainer = document.createElement('div');
    actionsContainer.classList.add('structure-actions');
    
    // Promote heading level (left arrow)
    const promoteBtn = document.createElement('button');
    promoteBtn.classList.add('structure-btn', 'structure-promote');
    promoteBtn.textContent = '←';
    promoteBtn.title = 'Promote heading level';
    promoteBtn.onclick = (event) => {
        event.stopPropagation();
        promoteHeadingLevel(heading, index);
    };
    promoteBtn.oncontextmenu = (event) => {
        event.stopPropagation(); // Let parent handle context menu
    };
    actionsContainer.appendChild(promoteBtn);
    
    // Demote heading level (right arrow)
    const demoteBtn = document.createElement('button');
    demoteBtn.classList.add('structure-btn', 'structure-demote');
    demoteBtn.textContent = '→';
    demoteBtn.title = 'Demote heading level';
    demoteBtn.onclick = (event) => {
        event.stopPropagation();
        demoteHeadingLevel(heading, index);
    };
    demoteBtn.oncontextmenu = (event) => {
        event.stopPropagation(); // Let parent handle context menu
    };
    actionsContainer.appendChild(demoteBtn);
    
    // Move section up
    const moveUpBtn = document.createElement('button');
    moveUpBtn.classList.add('structure-btn', 'structure-move-up');
    moveUpBtn.innerHTML = '&#8593;'; // ↑ as HTML entity
    moveUpBtn.title = 'Move section up';
    moveUpBtn.onclick = (event) => {
        event.stopPropagation();
        moveSectionUp(heading, index);
    };
    moveUpBtn.oncontextmenu = (event) => {
        event.stopPropagation(); // Let parent handle context menu
    };
    actionsContainer.appendChild(moveUpBtn);
    
    // Move section down
    const moveDownBtn = document.createElement('button');
    moveDownBtn.classList.add('structure-btn', 'structure-move-down');
    moveDownBtn.innerHTML = '&#8595;'; // ↓ as HTML entity
    moveDownBtn.title = 'Move section down';
    moveDownBtn.onclick = (event) => {
        event.stopPropagation();
        moveSectionDown(heading, index);
    };
    moveDownBtn.oncontextmenu = (event) => {
        event.stopPropagation(); // Let parent handle context menu
    };
    actionsContainer.appendChild(moveDownBtn);
    
    li.appendChild(actionsContainer);

    // Set attributes
    li.draggable = true;
    li.dataset.startLine = heading.startLine;
    li.dataset.endLine = heading.endLine;
    li.dataset.headingIndex = index;
    li.dataset.level = heading.level;
    li.dataset.expanded = 'true'; // Default state
    li.dataset.headingText = heading.title;

    // Add event handlers
    setupHeadingElementHandlers(li, heading);
    
    return li;
}

function setupHeadingElementHandlers(li, heading) {
    // Drag and drop handlers
    li.ondragstart = (event) => handleDragStart(event, heading);
    li.ondragover = (event) => handleDragOver(event);
    li.ondrop = (event) => handleDrop(event, heading);
    li.ondragend = (event) => handleDragEnd(event);
    li.ondragleave = (event) => handleDragLeave(event);
    li.oncontextmenu = (event) => handleContextMenu(event, heading);
    
    // Click handler for scrolling and selection
    li.onclick = (event) => {
        // Prevent triggering click if toggle icon or structure buttons were clicked
        if (event.target.classList.contains('structure-toggle') || 
            event.target.classList.contains('structure-btn') ||
            event.target.closest('.structure-actions')) {
            return;
        }

        // Remove previous selection
        document.querySelectorAll('#structure-list li.selected').forEach(item => {
            item.classList.remove('selected');
        });
        
        // Add selection to current item
        li.classList.add('selected');

        const lineNumber = parseInt(li.dataset.startLine, 10) + 1; // Get startLine and add 1 for editor
        const headingText = li.dataset.headingText; // Get heading text from LI dataset

        scrollToHeadingInEditor(lineNumber);
        scrollToHeadingInPreview(headingText);
    };
}

function scrollToHeadingInEditor(lineNumber) {
    if (editor && typeof editor.revealLineInCenter === 'function') {
        editor.revealLineInCenter(lineNumber);
        editor.setPosition({ lineNumber: lineNumber, column: 1 });
        editor.focus(); // Focus editor after scrolling
    }
}

function scrollToHeadingInPreview(headingText) {
    if (headingText) {
        const previewId = `heading-${slugify(headingText)}`;
        const previewElement = document.getElementById(previewId);
        const previewContentDiv = document.getElementById('preview-content');

        if (previewElement && previewContentDiv) {
            // Wrap scroll in requestAnimationFrame to handle timing issues
            requestAnimationFrame(() => {
                previewElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start' // Scrolls to the top of the element
                });
            });
        }
    }
}

function updateStructurePane(markdownContent) {
    const validation = validateStructurePaneInputs(markdownContent);
    if (!validation.isValid) {
        return;
    }

    structureList.innerHTML = ''; // Clear existing structure
    
    const { headings, totalLines } = extractHeadingsFromMarkdown(markdownContent);
    const processedHeadings = calculateHeadingEndLines(headings, totalLines);

    // Populate the structure list
    processedHeadings.forEach((heading, index) => {
        const li = createHeadingListElement(heading, index);
        structureList.appendChild(li);
    });
}

// --- Expand/Collapse Logic ---
function toggleCollapse(listItem, level) {
    const isExpanded = listItem.dataset.expanded === 'true';
    const toggleIcon = listItem.querySelector('.structure-toggle');

    // Update state and icon
    listItem.dataset.expanded = isExpanded ? 'false' : 'true';
    toggleIcon.textContent = isExpanded ? '▶' : '▼';

    // Iterate over subsequent siblings
    let currentSibling = listItem.nextElementSibling;    
    while (currentSibling) {        
         const siblingLevel = parseInt(currentSibling.dataset.level, 10);

         // Stop if we reach a heading at the same or higher level
         if (siblingLevel <= level) {
             break;
         }

         // Toggle visibility of children
         if (isExpanded) {
             // Collapse: hide children deeper than the current level
             currentSibling.style.display = 'none';            
         } else {
             // Expand: Show only direct children (level + 1).
             // If a direct child is collapsed, its children remain hidden.
             if (siblingLevel === level + 1) {
                 currentSibling.style.display = 'flex'; // Or 'block', 'flex' used for alignment
                 // If this newly shown child is itself collapsed, skip its children
                 if (currentSibling.dataset.expanded === 'false') {
                     // Skip deeper levels until we find the next sibling at level+1 or <= level
                     let deeperSibling = currentSibling.nextElementSibling;
                     while (deeperSibling) {
                         const deeperLevel = parseInt(deeperSibling.dataset.level, 10);
                         if (deeperLevel <= siblingLevel) break; // Found next relevant sibling
                         deeperSibling = deeperSibling.nextElementSibling;
                     }
                     currentSibling = deeperSibling; // Jump ahead
                     continue; // Skip the standard nextElementSibling increment
                 }
             }
         }

         currentSibling = currentSibling ? currentSibling.nextElementSibling : null;
     }
 }

 // --- Drag and Drop Handlers (Placeholders) ---
function handleDragStart(event, heading) {
    event.dataTransfer.setData('text/plain', JSON.stringify(heading)); // Pass heading data
    event.dataTransfer.effectAllowed = 'move';
    
    // Add visual feedback
    event.target.classList.add('dragging');
}

function handleDragOver(event) {
    event.preventDefault(); // Necessary to allow dropping
    event.dataTransfer.dropEffect = 'move';
    
    // Add visual feedback to drop target
    event.target.closest('li').classList.add('drag-over');
}

function handleDrop(event, targetHeading) {
    event.preventDefault();
    const draggedHeadingData = event.dataTransfer.getData('text/plain');
    if (!draggedHeadingData) return;

    try {
        const draggedHeading = JSON.parse(draggedHeadingData);

        // Prevent dropping onto itself
        if (draggedHeading.startLine === targetHeading.startLine) {
            return;
        }


        if (!editor) {
            console.error("Editor instance not available for drop operation.");
            return;
        }

        const model = editor.getModel();
        if (!model) {
            console.error("Editor model not available for drop operation.");
            return;
        }

        // 1. Define the range of the dragged section (Monaco lines are 1-based)
        // Ensure endLine includes the last character of the line
        const dragRange = new monaco.Range(
            draggedHeading.startLine + 1, 
            1, 
            draggedHeading.endLine + 1, 
            model.getLineLength(draggedHeading.endLine + 1) + 1 // Correct method + column is 1-based
        );

        // 2. Get the text content of the dragged section (including trailing newline)
        let draggedText = model.getValueInRange(dragRange);
        // Ensure it ends with a newline for proper formatting
        if (!draggedText.endsWith('\n')) {
             draggedText += '\n';
        }
         // Add extra newline if needed between sections
        const lineAfterNumber = draggedHeading.endLine + 2;
        if (draggedText.length > 0 && !draggedText.endsWith('\n\n') && lineAfterNumber <= model.getLineCount()) {
             const lineAfter = model.getLineContent(lineAfterNumber);
             if (lineAfter && lineAfter.trim() !== '') {
                 // Add newline if the next line isn't empty
                 draggedText += '\n'; 
             }
        }

        // 3. Define the insertion position (before the target heading's line, column 1)
        // Adjust insertion point if dragging downwards past the target
        const insertLineNumber = targetHeading.startLine + 1;
        const insertPosition = new monaco.Position(insertLineNumber, 1);

        // 4. Create edit operations
        const edits = [];

        // Delete operation: Delete the original text
        edits.push({
            range: dragRange,
            text: null // Setting text to null signifies deletion
        });

        // Insert operation: Insert the text at the new position
        edits.push({
            range: new monaco.Range(insertPosition.lineNumber, insertPosition.column, insertPosition.lineNumber, insertPosition.column),
            text: draggedText,
            forceMoveMarkers: true // Important for cursor/selection behavior
        });

        // 5. Apply edits atomically
        // Using pushEditOperations for better undo/redo stack management
        const identifier = { major: 1, minor: 1 }; // Identifier for the edits
        model.pushEditOperations([], edits, (inverseEdits) => inverseEdits);

        // The onDidChangeModelContent listener will handle refreshing the UI
        console.log("Drop operation applied to editor model.");

    } catch (e) {
        console.error("Error processing drop data:", e);
    } finally {
        // Clean up visual feedback classes
        cleanupDragClasses();
    }
}

function handleDragEnd(event) {
    // Clean up visual feedback classes when drag ends
    cleanupDragClasses();
}

function handleDragLeave(event) {
    // Remove drag-over class when leaving a drop target
    const target = event.target.closest('li');
    if (target) {
        target.classList.remove('drag-over');
    }
}

function cleanupDragClasses() {
    // Remove all drag-related classes from structure list items
    const structureList = document.getElementById('structure-list');
    if (structureList) {
        const items = structureList.querySelectorAll('li');
        items.forEach(item => {
            item.classList.remove('dragging', 'drag-over');
        });
    }
}

// --- Context Menu Handler ---
function handleContextMenu(event, heading) {
    event.preventDefault(); // Prevent default browser context menu
    console.log('[renderer.js] Context menu triggered on structure pane.');

    const target = event.target;
    const li = target.closest('li'); // Find the closest list item

    if (li && (li.dataset.startLine || li.dataset.lineNumber)) {
        const lineNumberStr = li.dataset.startLine || li.dataset.lineNumber;
        console.log(`[renderer.js] Requesting context menu from main for line: ${lineNumberStr}`);

        // Ask the main process to show the context menu
        window.electronAPI.invoke('show-context-menu', { lineNumber: lineNumberStr })
          .then(() => console.log('[renderer.js] Context menu request sent to main.'))
          .catch(err => console.error('[renderer.js] Error invoking context menu:', err));
    } else {
        console.log('[renderer.js] Context menu triggered outside a valid list item.');
    }
}

// Listener for commands coming back from the main process context menu
function setupContextMenuListener() {
    if (!window.electronAPI) {
        console.error("[renderer.js] Cannot set up context menu listener: electronAPI not available.");
        return;
    }
    window.electronAPI.on('context-menu-command', (args) => {
        const { command, lineNumber } = args;
        console.log(`[renderer.js] Received context menu command: ${command} for line ${lineNumber}`);
        handleContextMenuAction(command, parseInt(lineNumber, 10)); // Reuse existing handler
    });
    console.log('[renderer.js] Context menu command listener set up.');
}

async function handleContextMenuAction(action, lineNumber) {
    if (!editor) return;
    const model = editor.getModel();
    if (!model) return;

    // 1. Define the range of the section (Monaco lines are 1-based)
    // Ensure endLine includes the last character of the line
    const range = new monaco.Range(
        lineNumber + 1, 
        1, 
        lineNumber + 1, 
        model.getLineLength(lineNumber + 1) + 1 // Correct method + column is 1-based
    );

    // 2. Get the text content of the section (including trailing newline)
    let text = model.getValueInRange(range);
    // Ensure it ends with a newline for proper formatting
    if (!text.endsWith('\n')) {
         text += '\n';
    }

    switch (action) {
        case 'cut':
            navigator.clipboard.writeText(text)
                .then(() => {
                    console.log(`Cut section: ${lineNumber}`);
                    // Perform delete after successful copy
                    const deleteEdit = { range: range, text: null };
                    model.pushEditOperations([], [deleteEdit], () => null);
                })
                .catch(err => console.error('Failed to cut text: ', err));
            break;
        case 'copy':
            navigator.clipboard.writeText(text)
                .then(() => console.log(`Copied section: ${lineNumber}`))
                .catch(err => console.error('Failed to copy text: ', err));
            break;
        case 'paste':
            try {
                let textToPaste = await navigator.clipboard.readText();
                if (!textToPaste) return;

                // Ensure trailing newlines for proper formatting
                if (!textToPaste.endsWith('\n')) {
                    textToPaste += '\n';
                }
                if (!textToPaste.endsWith('\n\n')) {
                    textToPaste += '\n'; // Add a blank line after pasted content
                }

                const insertPosition = new monaco.Position(lineNumber + 1, 1);
                const pasteEdit = {
                    range: new monaco.Range(insertPosition.lineNumber, 1, insertPosition.lineNumber, 1),
                    text: textToPaste,
                    forceMoveMarkers: true
                };
                model.pushEditOperations([], [pasteEdit], () => null);
                console.log(`Pasted content before section: ${lineNumber}`);
            } catch (err) {
                console.error('Failed to paste text: ', err);
            }
            break;
        case 'delete':
            const deleteEdit = { range: range, text: null };
            model.pushEditOperations([], [deleteEdit], () => null);
            console.log(`Deleted section: ${lineNumber}`);
            break;
        default:
            console.error(`Unknown context menu action: ${action}`);
    }
}

function slugify(text) {
    if (!text) return '';
    return text.toString().toLowerCase()
        .replace(/\s+/g, '-')           // Replace spaces with -
        .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
        .replace(/\-\-+/g, '-')         // Replace multiple - with single -
        .replace(/^[-]+/, '')             // Trim - from start of text
        .replace(/-+$/, '');            // Trim - from end of text
}

// --- Markdown Folding Provider ---
function registerMarkdownFoldingProvider() {
    try {
        monaco.languages.registerFoldingRangeProvider('markdown', {
            provideFoldingRanges: function(model, context, token) {
                // Folding provider called
                const foldingRanges = [];
                const lines = model.getLinesContent(); // Use getLinesContent() instead
                
                // Processing lines for folding
                
                // Simple header-based folding first
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    
                    // Match headers (# ## ### etc.)
                    const headerMatch = line.match(/^(#{1,6})\s+(.+)/);
                    if (headerMatch) {
                        const level = headerMatch[1].length;
                        const startLine = i + 1; // Monaco uses 1-based line numbers
                        
                        // Find the next header of same or higher level (lower number)
                        let endLine = lines.length;
                        for (let j = i + 1; j < lines.length; j++) {
                            const nextHeaderMatch = lines[j].match(/^(#{1,6})\s+(.+)/);
                            if (nextHeaderMatch) {
                                const nextLevel = nextHeaderMatch[1].length;
                                if (nextLevel <= level) {
                                    endLine = j;
                                    break;
                                }
                            }
                        }
                        
                        // Only create fold range if there's content to fold
                        if (endLine > startLine + 1) {
                            foldingRanges.push({
                                start: startLine,
                                end: endLine,
                                kind: monaco.languages.FoldingRangeKind.Region
                            });
                            // Added header folding range
                        }
                    }
                    
                    // Match code blocks
                    const codeBlockMatch = line.match(/^```/);
                    if (codeBlockMatch) {
                        const startLine = i + 1;
                        // Find closing ```
                        for (let j = i + 1; j < lines.length; j++) {
                            if (lines[j].match(/^```\s*$/)) {
                                const endLine = j + 1;
                                foldingRanges.push({
                                    start: startLine,
                                    end: endLine,
                                    kind: monaco.languages.FoldingRangeKind.Region
                                });
                                //console.log('[renderer.js] Added code block folding range:', startLine, '->', endLine);
                                break;
                            }
                        }
                    }
                }
                
                // Generated folding ranges
                return foldingRanges;
            }
        });
        
        console.log('[renderer.js] Markdown folding provider registered successfully');
    } catch (error) {
        console.error('[renderer.js] Error registering folding provider:', error);
    }
}

// --- Folding Keyboard Shortcuts ---
function addFoldingKeyboardShortcuts() {
    // Fold current section (Ctrl/Cmd + Shift + [)
    editor.addAction({
        id: 'fold-current',
        label: 'Fold Current Section',
        keybindings: [
            monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.US_OPEN_SQUARE_BRACKET
        ],
        run: function() {
            editor.getAction('editor.fold').run();
        }
    });
    
    // Unfold current section (Ctrl/Cmd + Shift + ])
    editor.addAction({
        id: 'unfold-current',
        label: 'Unfold Current Section',
        keybindings: [
            monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.US_CLOSE_SQUARE_BRACKET
        ],
        run: function() {
            editor.getAction('editor.unfold').run();
        }
    });
    
    // Fold all sections (Ctrl/Cmd + K, Ctrl/Cmd + 0)
    editor.addAction({
        id: 'fold-all',
        label: 'Fold All Sections',
        keybindings: [
            monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_K,
            monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_0
        ],
        run: function() {
            editor.getAction('editor.foldAll').run();
        }
    });
    
    // Unfold all sections (Ctrl/Cmd + K, Ctrl/Cmd + J)
    editor.addAction({
        id: 'unfold-all',
        label: 'Unfold All Sections',
        keybindings: [
            monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_K,
            monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_J
        ],
        run: function() {
            editor.getAction('editor.unfoldAll').run();
        }
    });
    
    // Fold recursively (Ctrl/Cmd + K, Ctrl/Cmd + [)
    editor.addAction({
        id: 'fold-recursively',
        label: 'Fold Recursively',
        keybindings: [
            monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_K,
            monaco.KeyMod.CtrlCmd | monaco.KeyCode.US_OPEN_SQUARE_BRACKET
        ],
        run: function() {
            editor.getAction('editor.foldRecursively').run();
        }
    });
    
    // Unfold recursively (Ctrl/Cmd + K, Ctrl/Cmd + ])
    editor.addAction({
        id: 'unfold-recursively',
        label: 'Unfold Recursively',
        keybindings: [
            monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_K,
            monaco.KeyMod.CtrlCmd | monaco.KeyCode.US_CLOSE_SQUARE_BRACKET
        ],
        run: function() {
            editor.getAction('editor.unfoldRecursively').run();
        }
    });
    
    // Add Save action (Ctrl/Cmd + S)
    editor.addAction({
        id: 'save-file',
        label: 'Save File',
        keybindings: [
            monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS
        ],
        run: async function() {
            console.log('[Monaco] Save action triggered');
            await saveFile();
        }
    });
    
    // Add Save As action (Ctrl/Cmd + Shift + S)
    editor.addAction({
        id: 'save-as-file',
        label: 'Save As...',
        keybindings: [
            monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyS
        ],
        run: async function() {
            console.log('[Monaco] Save As action triggered');
            await saveAsFile();
        }
    });
    
    // console.log('[renderer.js] Folding keyboard shortcuts added');
    // console.log('[renderer.js] Save keyboard shortcuts added');
}

// --- Formatting Keyboard Shortcuts ---
function addFormattingKeyboardShortcuts() {
    // Bold formatting (Ctrl/Cmd + B)
    editor.addAction({
        id: 'format-bold',
        label: 'Format: Bold',
        keybindings: [
            monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyB
        ],
        run: async function() {
            await formatText('**', '**', 'bold text');
        }
    });
    
    // Italic formatting (Ctrl/Cmd + I) - Override Monaco's autocomplete
    editor.addAction({
        id: 'format-italic',
        label: 'Format: Italic',
        keybindings: [
            monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyI
        ],
        run: async function() {
            await formatText('*', '*', 'italic text');
        }
    });
    
    // Inline code formatting (Ctrl/Cmd + `)
    editor.addAction({
        id: 'format-code',
        label: 'Format: Inline Code', 
        keybindings: [
            monaco.KeyMod.CtrlCmd | monaco.KeyCode.US_BACKTICK
        ],
        run: async function() {
            await formatText('`', '`', 'code');
        }
    });
    
    // Link insertion (Ctrl/Cmd + K)
    editor.addAction({
        id: 'insert-link',
        label: 'Insert Link',
        keybindings: [
            monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK
        ],
        run: function() {
            insertLink();
        }
    });
    
    // console.log('[renderer.js] Formatting keyboard shortcuts added');
}

// --- Folding Toolbar Controls ---
function addFoldingToolbarControls() {
    // Get toolbar buttons
    const foldAllBtn = document.getElementById('fold-all-btn');
    const unfoldAllBtn = document.getElementById('unfold-all-btn');
    const foldCurrentBtn = document.getElementById('fold-current-btn');
    const unfoldCurrentBtn = document.getElementById('unfold-current-btn');
    
    if (foldAllBtn) {
        foldAllBtn.addEventListener('click', () => {
            editor.getAction('editor.foldAll').run();
        });
    }
    
    if (unfoldAllBtn) {
        unfoldAllBtn.addEventListener('click', () => {
            editor.getAction('editor.unfoldAll').run();
        });
    }
    
    if (foldCurrentBtn) {
        foldCurrentBtn.addEventListener('click', () => {
            editor.getAction('editor.fold').run();
        });
    }
    
    if (unfoldCurrentBtn) {
        unfoldCurrentBtn.addEventListener('click', () => {
            editor.getAction('editor.unfold').run();
        });
    }
    
    // console.log('[renderer.js] Folding toolbar controls added');
}

// Export folding functions globally
function foldAll() {
    if (window.editor && window.editor.getAction) {
        window.editor.getAction('editor.foldAll').run();
    }
}

function unfoldAll() {
    if (window.editor && window.editor.getAction) {
        window.editor.getAction('editor.unfoldAll').run();
    }
}

function foldCurrent() {
    if (window.editor && window.editor.getAction) {
        window.editor.getAction('editor.fold').run();
    }
}

function unfoldCurrent() {
    if (window.editor && window.editor.getAction) {
        window.editor.getAction('editor.unfold').run();
    }
}

// Export functions globally
window.foldAll = foldAll;
window.unfoldAll = unfoldAll;
window.foldCurrent = foldCurrent;
window.unfoldCurrent = unfoldCurrent;

// --- AI Summarization Action ---
// Helper functions for AI summarization actions
function validateEditorSelection(ed, actionName) {
    const selection = ed.getSelection();
    const selectedText = ed.getModel().getValueInRange(selection);
    
    // DEBUG: Log selection details  
    console.log(`[renderer.js] ${actionName} - Selected text (${selectedText?.length || 0} chars):`, selectedText?.substring(0, 200) + '...');
    
    if (!selectedText || selectedText.trim() === '') {
        console.warn(`[renderer.js] No text selected for ${actionName}`);
        showNotification(`Please select some text to ${actionName.toLowerCase()}`, 'warning');
        return { isValid: false };
    }
    
    return { isValid: true, selection, selectedText };
}

async function handleAISummarization(ed) {
    const validation = validateEditorSelection(ed, 'AI summarization');
    if (!validation.isValid) return;
    
    const { selection, selectedText } = validation;
    
    try {
        showNotification('Generating speaker notes...', 'info');
        
        const result = await window.electronAPI.invoke('summarize-text-to-notes', selectedText);
        
        if (result.error) {
            console.error('[renderer.js] AI summarization failed:', result.error);
            showNotification(`Error: ${result.error}`, 'error');
            return;
        }
        
        if (result.success) {
            // Replace selected text with bullet points and put original text in notes block
            const bulletPoints = result.summary; // AI-generated bullet points
            const originalText = selectedText; // Original selected text
            const notesText = bulletPoints + '\n\n```notes\n' + originalText + '\n```';
            
            ed.executeEdits('ai-summarization', [{
                range: selection,
                text: notesText
            }]);
            
            showNotification(`Speaker notes generated using ${result.provider} (${result.model})`, 'success');
            
            console.log('[renderer.js] Speaker notes generated - replaced text with bullets and moved original to notes:', {
                bulletPoints: result.summary?.substring(0, 100) + '...',
                originalInNotes: selectedText.substring(0, 100) + '...',
                provider: result.provider,
                model: result.model
            });
        }
    } catch (error) {
        console.error('[renderer.js] Error in AI summarization:', error);
        showNotification('Failed to generate speaker notes. Please try again.', 'error');
    }
}

async function handleNotesExtraction(ed) {
    const validation = validateEditorSelection(ed, 'notes extraction');
    if (!validation.isValid) return;
    
    const { selection, selectedText } = validation;
    
    console.log(`[renderer.js] Starting notes extraction for selected text: "${selectedText.substring(0, 100)}..."`);
    
    try {
        showNotification('Extracting notes content...', 'info');
        
        const result = await window.electronAPI.invoke('extract-notes-content', selectedText);
        
        if (result.error) {
            console.error('[renderer.js] Notes extraction failed:', result.error);
            showNotification(`Error: ${result.error}`, 'error');
            return;
        }
        
        if (result.success) {
            console.log(`[renderer.js] Notes extraction successful: found ${result.blocksFound} block(s)`);
            
            ed.executeEdits('extract-notes', [{
                range: selection,
                text: result.extractedContent
            }]);
            
            const message = `Extracted content from ${result.blocksFound} notes block${result.blocksFound === 1 ? '' : 's'}`;
            showNotification(message, 'success');
        } else {
            console.warn('[renderer.js] Notes extraction returned no success flag');
            showNotification('Failed to extract notes content', 'error');
        }
        
    } catch (error) {
        console.error('[renderer.js] Notes extraction failed:', error);
        showNotification('Failed to extract notes content', 'error');
    }
}

async function handleScholarSupport(ed) {
    const validation = validateEditorSelection(ed, 'scholar support');
    if (!validation.isValid) return;
    
    const { selection, selectedText } = validation;
    
    console.log(`[renderer.js] 🎓 Starting AI heading generation for selected text: "${selectedText.substring(0, 50)}..."`);
    
    try {
        showNotification('🤔 Dr. Chen is analyzing your selection...', 'info');
        
        // Get full document content for context
        const fullContent = ed.getValue();
        
        // Build prompt for Dr. Chen
        const prompt = `I am Dr. Chen, an AI assistant specializing in academic writing and scholarly document organization.

You are working on a scholarly document. I need to generate a concise, contextual heading for a selected text passage.

DOCUMENT CONTEXT (for understanding existing heading style and content themes):
${fullContent.length > 3000 ? fullContent.substring(0, 3000) + '...' : fullContent}

SELECTED TEXT TO SUMMARIZE:
${selectedText}

TASK: Generate a single, concise heading that:
1. Summarizes the key concept/theme of the selected text
2. Matches the style and tone of existing headings in this document  
3. Uses academic writing conventions
4. Is suitable for scholarly/academic work

Use ## markdown heading format.

Respond with ONLY the heading text (including the ## markdown symbols). No explanation or additional text.`;

        const result = await window.electronAPI.invoke('ai-chat', {
            message: prompt,
            options: {
                temperature: 0.3,
                maxTokens: 100,
                newConversation: true
            }
        });
        
        if (result.error) {
            console.error('[renderer.js] 🎓 Scholar support failed:', result.error);
            showNotification(`Error generating heading: ${result.error}`, 'error');
            return;
        }
        
        if (result.response) {
            // Clean up the AI response
            let heading = result.response.trim();
            heading = heading.replace(/^["']|["']$/g, ''); // Remove quotes
            if (!heading.startsWith('#')) {
                heading = '## ' + heading;
            }
            heading = heading.replace(/\s+/g, ' '); // Remove multiple spaces
            heading = heading.replace(/^(#+)([^#\s])/, '$1 $2'); // Ensure space after #
            
            console.log(`[renderer.js] 🎓 Generated heading: "${heading}"`);
            
            // Find insertion point - look for preceding paragraph break
            const selectionStart = selection.getStartPosition();
            let insertLineNumber = selectionStart.lineNumber;
            
            // Find the preceding paragraph break (empty line or start of document)
            for (let i = selectionStart.lineNumber - 1; i >= 1; i--) {
                const lineContent = ed.getModel().getLineContent(i);
                if (lineContent.trim() === '') {
                    insertLineNumber = i + 1;
                    break;
                }
            }
            
            // Insert heading with proper spacing
            const insertText = insertLineNumber === 1 ? `${heading}\n\n` : `\n${heading}\n\n`;
            const insertPosition = { lineNumber: insertLineNumber, column: 1 };
            
            ed.executeEdits('scholar-support', [{
                range: new monaco.Range(insertPosition.lineNumber, insertPosition.column, insertPosition.lineNumber, insertPosition.column),
                text: insertText
            }]);
            
            showNotification(`🎓 AI heading inserted: "${heading}"`, 'success');
            console.log(`[renderer.js] 🎓 Successfully inserted heading at line ${insertLineNumber}`);
        }
        
    } catch (error) {
        console.error('[renderer.js] 🎓 Scholar support failed:', error);
        showNotification('Failed to generate AI heading. Please try again.', 'error');
    }
}

function addAISummarizationAction() {
    if (!editor) {
        console.warn('[renderer.js] Cannot add AI summarization action: editor not available');
        return;
    }
    
    // Add context menu action for AI summarization
    editor.addAction({
        id: 'ai-summarize-to-notes',
        label: '🤖 Summarize to Speaker Notes',
        contextMenuGroupId: 'modification',
        contextMenuOrder: 1.5,
        precondition: 'editorHasSelection',
        run: handleAISummarization
    });
    
    // Add context menu action for extracting notes content
    editor.addAction({
        id: 'extract-notes-content',
        label: '📝 Extract Notes Content',
        contextMenuGroupId: 'modification',
        contextMenuOrder: 1.6,
        precondition: 'editorHasSelection',
        run: handleNotesExtraction
    });
    
    // Add context menu action for scholar support (AI heading generation)
    editor.addAction({
        id: 'generate-ai-heading',
        label: '📑 Generate AI Heading',
        contextMenuGroupId: 'modification',
        contextMenuOrder: 1.7,
        precondition: 'editorHasSelection',
        run: handleScholarSupport
    });
}

// --- Command Palette Action ---
function addCommandPaletteAction() {
    if (!editor) {
        console.warn('[renderer.js] Cannot add command palette action: editor not available');
        return;
    }
    
    // Add command palette action that overrides default Monaco keybinding
    editor.addAction({
        id: 'show-command-palette',
        label: 'Show Command Palette',
        keybindings: [
            monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyP
        ],
        
        run: function(ed) {
            if (window.showCommandPalette) {
                window.showCommandPalette();
            }
        }
    });
    
    // console.log('[renderer.js] Command palette action added to Monaco editor');
}

// --- Custom Selection Keybindings ---
function addCustomSelectionKeybindings() {
    if (!editor) {
        console.warn('[renderer.js] Cannot add selection keybindings: editor not available');
        return;
    }
    
    // Override Shift+Option+Up to select whole lines upward
    editor.addAction({
        id: 'select-lines-up',
        label: 'Select Whole Lines Up',
        keybindings: [
            monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.UpArrow
        ],
        run: function(ed) {
            const selection = ed.getSelection();
            const model = ed.getModel();
            
            // Get the current selection bounds
            const startLine = Math.min(selection.startLineNumber, selection.endLineNumber);
            const endLine = Math.max(selection.startLineNumber, selection.endLineNumber);
            
            // Extend selection up by one line (select the line above)
            const newStartLine = Math.max(1, startLine - 1);
            
            // Create new selection from start of new start line to end of current end line
            const newSelection = new monaco.Selection(
                newStartLine, 1,
                endLine, model.getLineMaxColumn(endLine)
            );
            
            ed.setSelection(newSelection);
        }
    });
    
    // Override Shift+Option+Down to select whole lines downward
    editor.addAction({
        id: 'select-lines-down',
        label: 'Select Whole Lines Down',
        keybindings: [
            monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.DownArrow
        ],
        run: function(ed) {
            const selection = ed.getSelection();
            const model = ed.getModel();
            
            // Get the current selection bounds
            const startLine = Math.min(selection.startLineNumber, selection.endLineNumber);
            const endLine = Math.max(selection.startLineNumber, selection.endLineNumber);
            
            // Extend selection down by one line (select the line below)
            const newEndLine = Math.min(model.getLineCount(), endLine + 1);
            
            // Create new selection from start of current start line to end of new end line
            const newSelection = new monaco.Selection(
                startLine, 1,
                newEndLine, model.getLineMaxColumn(newEndLine)
            );
            
            ed.setSelection(newSelection);
        }
    });
    
    console.log('[renderer.js] Custom selection keybindings added');
}

// --- Navigation Controls Setup ---
function setupNavigationControls() {
    const backBtn = document.getElementById('nav-back-btn');
    const forwardBtn = document.getElementById('nav-forward-btn');
    
    if (backBtn) {
        backBtn.addEventListener('click', navigateBack);
    }
    
    if (forwardBtn) {
        forwardBtn.addEventListener('click', navigateForward);
    }
    
    // Add keyboard shortcuts for navigation
    document.addEventListener('keydown', (event) => {
        // Alt+Left Arrow = Back
        if (event.altKey && event.code === 'ArrowLeft') {
            event.preventDefault();
            navigateBack();
        }
        // Alt+Right Arrow = Forward
        else if (event.altKey && event.code === 'ArrowRight') {
            event.preventDefault();
            navigateForward();
        }
    });
    
    // Initialize buttons state and load saved history
    updateNavigationButtons();
    loadNavigationHistoryFromSettings();
    
    console.log('[renderer.js] Navigation controls setup complete');
}

// --- BibTeX Language Registration ---
function registerBibTeXLanguage() {
    console.log('[renderer.js] Registering BibTeX language support...');
    
    // Register the BibTeX language
    monaco.languages.register({ id: 'bibtex' });
    
    // Define BibTeX tokens for syntax highlighting
    monaco.languages.setMonarchTokensProvider('bibtex', {
        tokenizer: {
            root: [
                // Entry types (@article, @book, etc.)
                [/@\w+/, 'keyword'],
                
                // Entry keys (the citation key after the entry type)
                [/\{\s*([^,\s}]+)/, 'entity.name.function'],
                
                // Field names (title, author, year, etc.)
                [/\b(title|author|editor|journal|booktitle|year|volume|number|pages|publisher|address|isbn|doi|url|note|keywords|abstract)\s*=/, 'attribute.name'],
                
                // Quoted strings
                [/"([^"]*)"/, 'string'],
                
                // Braced strings
                [/\{([^{}]*)\}/, 'string'],
                
                // Numbers
                [/\b\d+\b/, 'number'],
                
                // Comments
                [/%.*$/, 'comment'],
                
                // Braces and brackets
                [/[{}\[\]]/, 'bracket'],
                
                // Commas and equals
                [/[,=]/, 'delimiter'],
                
                // Whitespace
                [/\s+/, 'white']
            ]
        }
    });
    
    // Define BibTeX language configuration
    monaco.languages.setLanguageConfiguration('bibtex', {
        brackets: [
            ['{', '}'],
            ['[', ']'],
            ['(', ')']
        ],
        autoClosingPairs: [
            { open: '{', close: '}' },
            { open: '[', close: ']' },
            { open: '(', close: ')' },
            { open: '"', close: '"' }
        ],
        surroundingPairs: [
            { open: '{', close: '}' },
            { open: '[', close: ']' },
            { open: '(', close: ')' },
            { open: '"', close: '"' }
        ],
        comments: {
            lineComment: '%'
        }
    });
    
    // Define theme colors for BibTeX
    monaco.editor.defineTheme('bibtex-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [
            { token: 'keyword', foreground: '569cd6', fontStyle: 'bold' },
            { token: 'entity.name.function', foreground: 'dcdcaa' },
            { token: 'attribute.name', foreground: '9cdcfe' },
            { token: 'string', foreground: 'ce9178' },
            { token: 'number', foreground: 'b5cea8' },
            { token: 'comment', foreground: '6a9955', fontStyle: 'italic' },
            { token: 'bracket', foreground: 'ffd700' },
            { token: 'delimiter', foreground: 'd4d4d4' }
        ],
        colors: {}
    });
    
    monaco.editor.defineTheme('bibtex-light', {
        base: 'vs',
        inherit: true,
        rules: [
            { token: 'keyword', foreground: '0000ff', fontStyle: 'bold' },
            { token: 'entity.name.function', foreground: '795e26' },
            { token: 'attribute.name', foreground: '001080' },
            { token: 'string', foreground: 'a31515' },
            { token: 'number', foreground: '09885a' },
            { token: 'comment', foreground: '008000', fontStyle: 'italic' },
            { token: 'bracket', foreground: 'af00db' },
            { token: 'delimiter', foreground: '000000' }
        ],
        colors: {}
    });
    
    console.log('[renderer.js] BibTeX language support registered successfully.');
}

// --- Citation Autocomplete Functionality ---
let bibEntries = [];

// Parse BibTeX entries from content
function parseBibTeX(content) {
    const entries = [];
    const entryRegex = /@(\w+)\s*\{\s*([^,\s}]+)\s*,([^}]*)\}/g;
    let match;
    
    while ((match = entryRegex.exec(content)) !== null) {
        const type = match[1];
        const key = match[2];
        const fields = match[3];
        
        // Extract title and author for better display
        const titleMatch = fields.match(/title\s*=\s*[{"']([^}"']*)[}"']/i);
        const authorMatch = fields.match(/author\s*=\s*[{"']([^}"']*)[}"']/i);
        const yearMatch = fields.match(/year\s*=\s*[{"']?(\d{4})[}"']?/i);
        
        const title = titleMatch ? titleMatch[1] : '';
        const author = authorMatch ? authorMatch[1] : '';
        const year = yearMatch ? yearMatch[1] : '';
        
        entries.push({
            key: key,
            type: type,
            title: title,
            author: author,
            year: year
        });
    }
    
    return entries;
}

// Load BibTeX files from the lectures directory
async function loadBibTeXFiles() {
    try {
        // Look for .bib files specifically in the lectures subdirectory
        const bibFiles = [];
        
        try {
            // First, get the current working directory to understand the context
            const workingDir = await window.electronAPI.invoke('get-working-directory');
            console.log('[renderer.js] Current working directory:', workingDir);
            
            // Try multiple possible locations for the lectures directory
            const possiblePaths = [
                'lectures',           // lectures in current directory (should work now)
                '../lectures',        // lectures in parent directory (fallback)
            ];
            
            for (const relativePath of possiblePaths) {
                try {
                    console.log(`[renderer.js] Trying to list files in: ${relativePath}`);
                    const lecturesFiles = await window.electronAPI.invoke('list-directory-files', relativePath);
                    
                    if (lecturesFiles && Array.isArray(lecturesFiles)) {
                        // Filter for .bib files
                        for (const file of lecturesFiles) {
                            if (file.isFile && file.name.endsWith('.bib')) {
                                // Construct the full path for reading
                                const fullBibPath = `${relativePath}/${file.name}`;
                                
                                // Try to read the file directly
                                try {
                                    console.log(`[renderer.js] Attempting to read: ${fullBibPath}`);
                                    const content = await window.electronAPI.invoke('read-file', fullBibPath);
                                    
                                    const entries = parseBibTeX(content);
                                    console.log(`[renderer.js] Successfully parsed ${entries.length} entries from ${fullBibPath}`);
                                    if (entries.length > 0) {
                                        console.log('[renderer.js] Sample parsed entry:', entries[0]);
                                        bibEntries.push(...entries);
                                    }
                                } catch (readError) {
                                    console.log(`[renderer.js] Could not read ${fullBibPath}:`, readError.message);
                                    
                                    // Try alternative path resolution
                                    try {
                                        // If relative path failed, try with just the filename in lectures
                                        const altPath = `lectures/${file.name}`;
                                        console.log(`[renderer.js] Trying alternative path: ${altPath}`);
                                        const content = await window.electronAPI.invoke('read-file', altPath);
                                        
                                        const entries = parseBibTeX(content);
                                        console.log(`[renderer.js] Successfully parsed ${entries.length} entries from ${altPath}`);
                                        if (entries.length > 0) {
                                            console.log('[renderer.js] Sample parsed entry:', entries[0]);
                                            bibEntries.push(...entries);
                                        }
                                    } catch (altError) {
                                        console.log(`[renderer.js] Alternative path also failed:`, altError.message);
                                    }
                                }
                            }
                        }
                        
                        if (bibEntries.length > 0) {
                            console.log(`[renderer.js] Total entries loaded so far: ${bibEntries.length}`);
                            break; // Stop after successfully loading entries
                        }
                    }
                } catch (error) {
                    console.log(`[renderer.js] Could not access ${relativePath}:`, error.message);
                }
            }
            
            // Log final status
            if (bibEntries.length === 0) {
                console.log('[renderer.js] No .bib entries loaded from any source');
                const directoryFiles = await window.electronAPI.invoke('list-directory-files');
                console.log('[renderer.js] Current working directory contains:', 
                    directoryFiles?.filter(f => f.isDirectory).map(d => d.name));
            }
        } catch (error) {
            console.log('[renderer.js] Error during BibTeX file loading:', error.message);
        }
        
        console.log(`[renderer.js] Total BibTeX entries loaded: ${bibEntries.length}`);
        return bibEntries;
    } catch (error) {
        console.error('[renderer.js] Error loading BibTeX files:', error);
        return [];
    }
}

// Register citation autocomplete provider for Markdown
function registerCitationAutocomplete() {
    console.log('[renderer.js] Registering citation autocomplete provider...');
    console.log('[renderer.js] Current bibEntries count:', bibEntries.length);
    if (bibEntries.length > 0) {
        console.log('[renderer.js] Sample entry:', bibEntries[0]);
    }
    
    monaco.languages.registerCompletionItemProvider('markdown', {
        triggerCharacters: ['@'],
        provideCompletionItems: function(model, position) {
            console.log('[renderer.js] Citation autocomplete triggered');
            
            // Get current line text
            const currentLine = model.getLineContent(position.lineNumber);
            const textBeforePointer = currentLine.substring(0, position.column - 1);
            
            console.log('[renderer.js] Text before pointer:', textBeforePointer);
            console.log('[renderer.js] Available bibEntries:', bibEntries.length);
            
            // Look for citation pattern: [@...] where we're after the @
            const citationMatch = textBeforePointer.match(/\[@([^\]]*)?$/);
            
            if (!citationMatch) {
                console.log('[renderer.js] Not in citation context');
                return { suggestions: [] };
            }
            
            const searchTerm = citationMatch[1] || '';
            console.log('[renderer.js] Search term:', searchTerm);
            
            // Filter entries based on search term
            const suggestions = bibEntries
                .filter(entry => {
                    if (!searchTerm) return true;
                    const searchLower = searchTerm.toLowerCase();
                    return entry.key.toLowerCase().includes(searchLower) ||
                           entry.title.toLowerCase().includes(searchLower) ||
                           entry.author.toLowerCase().includes(searchLower);
                })
                .map(entry => {
                    // Create a detailed description
                    const description = [
                        entry.author && `Author: ${entry.author}`,
                        entry.year && `Year: ${entry.year}`,
                        entry.title && `Title: ${entry.title}`
                    ].filter(Boolean).join('\n');
                    
                    return {
                        label: entry.key,
                        kind: monaco.languages.CompletionItemKind.Reference,
                        insertText: entry.key + ']',
                        detail: `@${entry.type}`,
                        documentation: description,
                        range: {
                            startLineNumber: position.lineNumber,
                            endLineNumber: position.lineNumber,
                            startColumn: position.column - searchTerm.length,
                            endColumn: position.column
                        }
                    };
                });
            
            return { suggestions: suggestions };
        }
    });
    
    console.log('[renderer.js] Citation autocomplete provider registered successfully.');
}

// Global variable to store available files for autocomplete
let availableFiles = [];

// Function to update the available files list
async function updateAvailableFiles() {
    if (!window.electronAPI) {
        return;
    }
    
    try {
        const fileTree = await window.electronAPI.invoke('request-file-tree');
        availableFiles = [];
        
        // Recursively extract all files from the tree
        function extractFiles(node, path = '') {
            if (node.type === 'file' && (node.name.endsWith('.md') || node.name.endsWith('.markdown'))) {
                const fullPath = path ? `${path}/${node.name}` : node.name;
                const fileName = node.name.replace(/\.(md|markdown)$/, ''); // Remove extension for display
                availableFiles.push({
                    name: fileName,
                    path: fullPath,
                    fullPath: node.path
                });
            }
            
            if (node.children) {
                const newPath = path ? `${path}/${node.name}` : node.name;
                for (const child of node.children) {
                    extractFiles(child, newPath);
                }
            }
        }
        
        if (fileTree && fileTree.children) {
            for (const child of fileTree.children) {
                extractFiles(child);
            }
        }
        
        console.log('[renderer.js] Updated available files for autocomplete:', availableFiles.length, 'files');
    } catch (error) {
        console.error('[renderer.js] Error updating available files:', error);
    }
}

// Register file link autocomplete provider for Markdown
function registerFileLinkAutocomplete() {
    console.log('[renderer.js] Registering file link autocomplete provider...');
    
    monaco.languages.registerCompletionItemProvider('markdown', {
        triggerCharacters: ['['],
        provideCompletionItems: function(model, position) {
            // Get current line text
            const currentLine = model.getLineContent(position.lineNumber);
            const textBeforePointer = currentLine.substring(0, position.column - 1);
            
            // Look for file link pattern: [[...] where we're after the second [
            const fileLinkMatch = textBeforePointer.match(/\[\[([^\]]*)?$/);
            
            if (!fileLinkMatch) {
                return { suggestions: [] };
            }
            
            const searchTerm = fileLinkMatch[1] || '';
            
            // Filter files based on search term
            const suggestions = availableFiles
                .filter(file => {
                    if (!searchTerm) return true;
                    const searchLower = searchTerm.toLowerCase();
                    return file.name.toLowerCase().includes(searchLower) ||
                           file.path.toLowerCase().includes(searchLower);
                })
                .map(file => {
                    return {
                        label: file.name,
                        kind: monaco.languages.CompletionItemKind.File,
                        insertText: file.name + ']]',
                        detail: file.path,
                        documentation: `Link to: ${file.path}`,
                        range: {
                            startLineNumber: position.lineNumber,
                            endLineNumber: position.lineNumber,
                            startColumn: position.column - searchTerm.length,
                            endColumn: position.column
                        }
                    };
                });
            
            return { suggestions: suggestions };
        }
    });
    
    console.log('[renderer.js] File link autocomplete provider registered successfully.');
}

// --- Initialize Monaco Editor ---
async function initializeMonacoEditor() {
    console.log('[renderer.js] *** initializeMonacoEditor() CALLED ***');
    console.log('[renderer.js] Initializing Monaco editor...');
    
    // Check if editor already exists
    console.log('[renderer.js] Current editor state:', !!window.editor);
    console.log('[renderer.js] Current fallbackEditor state:', !!fallbackEditor);
    console.log('[renderer.js] editorContainer exists:', !!document.getElementById('editor-container'));
    console.log('[renderer.js] About to require Monaco editor module...');
    
    // Add error handling for require itself
    try {
        await new Promise((resolve, reject) => {
            require(['vs/editor/editor.main'], async function() {
                console.log('[renderer.js] Monaco module loaded successfully!');
        
        // Configure Monaco Environment for Electron
        self.MonacoEnvironment = {
            getWorkerUrl: function (moduleId, label) {
                if (label === 'json') {
                    return './node_modules/monaco-editor/min/vs/language/json/jsonWorker.js';
                }
                if (label === 'css' || label === 'scss' || label === 'less') {
                    return './node_modules/monaco-editor/min/vs/language/css/cssWorker.js';
                }
                if (label === 'html' || label === 'handlebars' || label === 'razor') {
                    return './node_modules/monaco-editor/min/vs/language/html/htmlWorker.js';
                }
                if (label === 'typescript' || label === 'javascript') {
                    return './node_modules/monaco-editor/min/vs/language/typescript/tsWorker.js';
                }
                return './node_modules/monaco-editor/min/vs/base/worker/workerMain.js';
            }
        };
        
        // Register BibTeX language support
        registerBibTeXLanguage();
        
        try {
            // IMPORTANT: Only use specific content if there's a file to restore
            // Otherwise, start with empty content to avoid overwriting user files
            let initialContent = '';
            
            console.log('[renderer.js] Monaco content decision - restoredFileContent exists:', !!window.restoredFileContent);
            console.log('[renderer.js] Monaco content decision - hasFileToRestore:', window.hasFileToRestore);
            console.log('[renderer.js] Monaco content decision - useDefaultContentFallback:', window.useDefaultContentFallback);
            console.log('[renderer.js] Monaco content decision - currentFilePath:', window.currentFilePath);
            
            if (window.restoredFileContent) {
                initialContent = window.restoredFileContent.content;
                console.log('[renderer.js] ✅ Using restored file content for Monaco initialization');
            } else if (window.currentFilePath || window.hasFileToRestore) {
                // If there's a current file path or file to restore, start with empty content
                // The file will be loaded properly by openFileInEditor or restoration process
                initialContent = '';
                console.log('[renderer.js] ✅ Using empty content for Monaco initialization (file will be loaded separately)');
            } else if (window.useDefaultContentFallback && !window.currentFilePath) {
                // Only use default content if explicitly requested AND there's no current file
                initialContent = '# New Document\n\nStart writing your content here...';
                console.log('[renderer.js] ✅ Using minimal default content for Monaco initialization (fresh start only)');
            } else {
                // Fallback: if we reach here, use empty content to avoid overwriting anything
                if (!initialContent) {
                    console.log('[renderer.js] ✅ No specific content determined, using empty content to prevent overwrites');
                    initialContent = '';
                } else {
                    console.log('[renderer.js] ❌ Using empty content for Monaco initialization (file restoration pending)');
                }
            }
            
            
            editor = monaco.editor.create(editorContainer, {
                value: initialContent,
                language: 'markdown',
                theme: 'vs', // Will be updated based on settings after creation
                automaticLayout: true,
                wordWrap: 'on',
                // Conditionally disable auto-closing brackets based on citation autocomplete setting
                autoClosingBrackets: 'beforeWhitespace', // Will be updated after settings load
                autoClosingQuotes: 'never',
                // Code folding options
                folding: true,
                foldingStrategy: 'auto', // Change from 'indentation' to 'auto'
                foldingHighlight: true,
                unfoldOnClickAfterEndOfLine: true,
                showFoldingControls: 'always',
                // Additional options for better folding experience
                minimap: {
                    enabled: true,
                    showSlider: 'always'
                },
                scrollbar: {
                    verticalScrollbarSize: 10,
                    horizontalScrollbarSize: 10
                }
            });
            
            // Make editor available globally for formatting functions
            window.editor = editor;
            console.log('[renderer.js] Monaco editor instance created and assigned to window.editor.');
            
            // Setup editor context menu for text extraction
            setupEditorContextMenu();
            
            // Setup scroll-based minimap visibility
            setupSmartMinimap(editor);
            
            // Register custom Markdown folding provider and add shortcuts
            setTimeout(() => {
                registerMarkdownFoldingProvider();
                addFoldingKeyboardShortcuts();
                addFormattingKeyboardShortcuts();
                addCustomSelectionKeybindings();
                addFoldingToolbarControls();
                addAISummarizationAction();
                addCommandPaletteAction();
            }, 100);
            
            const editorContent = editor.getValue() || '';
            await updatePreviewAndStructure(editorContent);
            
            // Track previous content to detect changes
            let previousContent = editor.getValue();
            
            // Listen for selection changes to update status bar
            editor.onDidChangeCursorSelection((event) => {
                // Update status bar to show selection info
                updateStatusBar(editor.getValue());
            });
            
            editor.onDidChangeModelContent(async (event) => {
                const currentContent = editor.getValue();
                
                // Process content changes for AI writing companion
                console.log('[Editor] 📝 Content change detected, current length:', currentContent.length, 'previous length:', previousContent.length);
                
                // CRITICAL: Only process for AI companion if this is NOT a programmatic change
                if (window.aiCompanion && typeof window.aiCompanion.processNewWriting === 'function' && !suppressAutoSave) {
                    console.log('[Editor] 🤖 AI Companion available, processing changes...');
                    
                    // Extract changes from Monaco's event if available
                    if (event && event.changes && event.changes.length > 0) {
                        console.log('[Editor] 🔍 Processing Monaco change events, count:', event.changes.length);
                        
                        // Process each change in the event
                        for (const change of event.changes) {
                            console.log('[Editor] 📋 Change details:', {
                                text: change.text,
                                textLength: change.text?.length,
                                range: change.range
                            });
                            
                            if (change.text && change.text.length > 0) {
                                console.log('[Editor] ✅ Sending to AI Companion:', JSON.stringify(change.text));
                                // This is new text being added
                                window.aiCompanion.processNewWriting(change.text);
                            } else {
                                console.log('[Editor] ⚠️ Change event has no text or empty text');
                            }
                        }
                    } else {
                        console.log('[Editor] 🔄 Using fallback change detection...');
                        console.log('[Editor] 🔄 Event details:', { 
                            hasEvent: !!event, 
                            hasChanges: !!(event && event.changes), 
                            changesLength: event && event.changes ? event.changes.length : 'N/A' 
                        });
                        
                        // Fallback: detect simple additions
                        if (currentContent.length > previousContent.length) {
                            const newText = currentContent.slice(previousContent.length);
                            console.log('[Editor] 📝 Fallback detected new text:', JSON.stringify(newText));
                            
                            if (newText.length > 0) {
                                console.log('[Editor] ✅ Sending fallback text to AI Companion');
                                window.aiCompanion.processNewWriting(newText);
                            }
                        } else if (currentContent.length < previousContent.length) {
                            console.log('[Editor] ✂️ Text was deleted (length decreased)');
                        } else {
                            console.log('[Editor] ❌ No change in content length');
                        }
                    }
                } else {
                    console.log('[Editor] ❌ AI Companion not available:', {
                        hasWindow: !!window.aiCompanion,
                        hasMethod: !!(window.aiCompanion && typeof window.aiCompanion.processNewWriting === 'function')
                    });
                }
                
                // Update for next change detection
                previousContent = currentContent;
                
                await updatePreviewAndStructure(currentContent);
                scheduleAutoSave(); // Schedule auto-save when content changes
            });
            
            // Clear fallback editor since Monaco loaded successfully
            fallbackEditor = null;
            
            // Make editor globally accessible for debugging
            window.editor = editor;
            
            // Initialize auto-save after editor is ready
            initializeAutoSave();
            
            // Load settings and apply editor options
            window.electronAPI.invoke('get-settings').then(settings => {
                window.appSettings = settings;
                
                // Apply all editor settings using the centralized function
                applyEditorSettings(settings);
                
                // Citation autocomplete setting (separate from general editor settings)
                const citationOptions = {};
                if (settings?.editor?.enableCitationAutocomplete !== false) {
                    citationOptions.autoClosingBrackets = 'never'; // Disable auto-closing brackets for citation autocomplete
                    
                    // Load BibTeX files and register citation autocomplete
                    loadBibTeXFiles().then(() => {
                        registerCitationAutocomplete();
                    });
                } else {
                    citationOptions.autoClosingBrackets = 'beforeWhitespace';
                }
                
                // Apply citation-specific options
                editor.updateOptions(citationOptions);
                
                // Update available files and register file link autocomplete
                updateAvailableFiles().then(() => {
                    registerFileLinkAutocomplete();
                });
                
            }).catch(error => {
                console.error('[renderer.js] Error loading settings:', error);
                // Fallback: enable citation autocomplete by default
                editor.updateOptions({
                    autoClosingBrackets: 'never'
                });
                loadBibTeXFiles().then(() => {
                    registerCitationAutocomplete();
                });
                
                // Update available files and register file link autocomplete
                updateAvailableFiles().then(() => {
                    registerFileLinkAutocomplete();
                });
            });
            
            // Update cursor position when cursor moves
            editor.onDidChangeCursorPosition(() => {
                const position = editor.getPosition();
                const cursorPosEl = document.getElementById('cursor-position');
                if (cursorPosEl && position) {
                    cursorPosEl.textContent = `Ln ${position.lineNumber}, Col ${position.column}`;
                }
            });

            // --- THEME SYNC: Ensure Monaco theme matches settings ---
            // Use the current body class to determine theme if appSettings is not yet set
            let isDark;
            if (window.appSettings && typeof appSettings.theme === 'string') {
                isDark = appSettings.theme === 'dark';
            } else {
                // Fallback: check body class
                isDark = document.body.classList.contains('dark-mode');
            }
            applyTheme(isDark);
            
            // Explicitly set Monaco theme immediately after creation
            if (monaco.editor && editor) {
                editor.updateOptions({ theme: isDark ? 'vs-dark' : 'vs' });
            }

            // Trigger file restoration if we have restored content but didn't use it during initialization
            if (window.restoredFileContent && !initialContent) {
                console.log('[renderer.js] Triggering delayed file restoration after Monaco initialization');
                
                if (window.restoredFileContent.isPDF) {
                    // For PDFs, directly handle as PDF file instead of trying to load content
                    console.log('[renderer.js] Restoring PDF file:', window.restoredFileContent.path);
                    handlePDFFile(window.restoredFileContent.path);
                } else {
                    // For regular text files, load content into editor
                    await openFileInEditor(window.restoredFileContent.path, window.restoredFileContent.content);
                }
                
                // Clear the restored content flag
                window.restoredFileContent = null;
            }

            // --- Resizing Logic (MOVED HERE) --- 
            console.log('[renderer.js] Setting up resizer logic...');
            const resizer = document.getElementById('resizer');
            const editorPane = document.getElementById('editor-pane'); 
            const rightPane = document.getElementById('right-pane'); 
            let isResizing = false;
            let startX, initialEditorWidth, initialRightWidth;

            // Check if elements were found before proceeding
            if (!resizer || !editorPane || !rightPane) {
                console.error('Resizer or pane elements not found after Monaco init!');
            } else {
                // Attach the initial mousedown listener to the resizer only if elements exist
                resizer.addEventListener('mousedown', handleMouseDown);
                console.log('[renderer.js] Vertical resizer event listener attached to:', resizer);
            }

            // --- Resizing Logic for Left Resizer ---
            console.log('[renderer.js] Setting up left resizer logic...');
            const resizerLeft = document.getElementById('sidebar-resizer');
            const leftSidebar = document.getElementById('left-sidebar');
            // editorPane is already defined above for the right resizer

            let isResizingLeft = false;
            let startXLeft, initialSidebarWidth;

            if (!resizerLeft || !leftSidebar) { // Check all required panes
                console.error('Left resizer or left sidebar not found after Monaco init!');
            } else {
                resizerLeft.addEventListener('mousedown', handleMouseDownLeft);
                console.log('[renderer.js] Horizontal (sidebar) resizer event listener attached to:', resizerLeft);
            }

            function handleMouseDownLeft(e) {
                if (!resizerLeft || !leftSidebar) return;
                console.log('[Resize Left] Mouse Down');
                isResizingLeft = true;
                startXLeft = e.clientX;
                initialSidebarWidth = leftSidebar.offsetWidth;
                // Prevent text selection during drag
                e.preventDefault(); 
                document.addEventListener('mousemove', handleMouseMoveLeft);
                document.addEventListener('mouseup', handleMouseUpLeft);
            }

            function handleMouseMoveLeft(e) {
                if (!isResizingLeft || !leftSidebar) return;
                // console.log('[Resize Left] Mouse Move');
                const container = leftSidebar.parentElement; // Get the container
                if (!container) return;
                const containerWidth = container.offsetWidth;

                const deltaX = e.clientX - startXLeft;
                let newSidebarPx = initialSidebarWidth + deltaX;

                const minWidth = 200; // Min width for sidebar
                const maxWidth = containerWidth * 0.5; // Max 50% of container width

                // Enforce minimum and maximum widths
                if (newSidebarPx < minWidth) {
                    newSidebarPx = minWidth;
                }
                if (newSidebarPx > maxWidth) {
                    newSidebarPx = maxWidth;
                }

                // Apply the new width directly
                console.log(`[Resize Left] Setting sidebar width: ${newSidebarPx}px`);
                leftSidebar.style.width = `${newSidebarPx}px`;
                leftSidebar.style.flexBasis = `${newSidebarPx}px`;
                leftSidebar.style.flex = `0 0 ${newSidebarPx}px`;

                // Trigger layout recalculation for Monaco if needed (resizing sidebar might shift editor)
                requestAnimationFrame(() => {
                    if (editor && typeof editor.layout === 'function') {
                        editor.layout(); 
                    }
                });
            }

            function handleMouseUpLeft() {
                if (!isResizingLeft) return;
                console.log('[Resize Left] Mouse Up');
                isResizingLeft = false;
                document.removeEventListener('mousemove', handleMouseMoveLeft);
                document.removeEventListener('mouseup', handleMouseUpLeft);
                // Send layout settings to main process
                saveCurrentLayout();
            }

            // Define handlers within the scope where variables are accessible
            function handleMouseDown(e) {
                if (!resizer || !editorPane || !rightPane) return; 
                console.log('[Resize] Mouse Down on resizer');
                isResizing = true;
                startX = e.clientX;
                initialEditorWidth = editorPane.offsetWidth;
                initialRightWidth = rightPane.offsetWidth; // Need right width too
                document.addEventListener('mousemove', handleMouseMove);
                document.addEventListener('mouseup', handleMouseUp);
            }
        
            function handleMouseMove(e) {
                if (!isResizing || !editorPane || !rightPane) return;
                // console.log('[Resize] Mouse Move during resize');
                const container = editorPane.parentElement;
                if (!container) return;
                const containerWidth = container.offsetWidth;

                const deltaX = e.clientX - startX;
                let newEditorPx = initialEditorWidth + deltaX;
                let newRightPx = initialRightWidth - deltaX;

                const minWidth = 150; 
                // Enforce minimum widths
                if (newEditorPx < minWidth) {
                    const diff = minWidth - newEditorPx;
                    newEditorPx = minWidth;
                    newRightPx -= diff;
                }
                if (newRightPx < minWidth) {
                    const diff = minWidth - newRightPx;
                    newRightPx = minWidth;
                    newEditorPx -= diff;
                }

                // Check boundaries again after adjustments
                if (newEditorPx < minWidth) newEditorPx = minWidth;

                // Apply the new widths directly
                console.log(`[Resize] Setting editor width: ${newEditorPx}px, right width: ${newRightPx}px`);
                editorPane.style.flex = `0 0 ${newEditorPx}px`;
                rightPane.style.flex = `0 0 ${newRightPx}px`;
                
                // Also set width for backup
                editorPane.style.width = `${newEditorPx}px`;
                rightPane.style.width = `${newRightPx}px`;

                requestAnimationFrame(() => {
                    if (editor && typeof editor.layout === 'function') {
                        editor.layout(); 
                    }
                });
            }
        
            function handleMouseUp() {
                if (!isResizing) return;
                console.log('[Resize] Mouse Up, stopping resize');
                isResizing = false;
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
                // Send layout settings to main process
                saveCurrentLayout();
            }

        } catch (error) {
            console.error('[renderer.js] Failed to create Monaco editor instance:', error);
            console.error('[renderer.js] Full error details:', error.stack || error);
            editorContainer.innerText = 'Failed to load code editor.';
            await createFallbackEditor(); 
        }
        
                // Resolve the Promise when Monaco initialization is complete
                resolve();
            }, function(requireError) {
                // Handle require loading errors
                console.error('[renderer.js] Error in require callback:', requireError);
                reject(requireError);
            });
        }); 
    } catch (requireError) {
        console.error('[renderer.js] Error loading Monaco editor module:', requireError);
        console.log('[renderer.js] Falling back to textarea editor due to require failure');
        await createFallbackEditor();
    }

    // --- Theme Initialization (Can stay here) ---
}

async function loadAppSettings() {
    if (!window.electronAPI) {
        console.error('[renderer.js] electronAPI not available for loading settings.');
        return;
    }
    try {
        appSettings = await window.electronAPI.invoke('get-settings');
        window.appSettings = appSettings; // Make settings globally available
        console.log('[renderer.js] Loaded settings - appSettings.currentFile:', appSettings.currentFile);
        // Handle both empty string and null for currentFile
        const currentFileFromSettings = appSettings.currentFile;
        console.log('[renderer.js] Raw currentFile from settings:', JSON.stringify(currentFileFromSettings), 'type:', typeof currentFileFromSettings);
        
        window.currentFilePath = (currentFileFromSettings && currentFileFromSettings.trim()) ? currentFileFromSettings : null;
        console.log('[renderer.js] Set window.currentFilePath to:', window.currentFilePath);
        
        // Immediately sync currentFilePath with main process to ensure consistency
        if (window.currentFilePath) {
            try {
                await window.electronAPI.invoke('set-current-file', window.currentFilePath);
                console.log('[renderer.js] Synced currentFilePath with main process:', window.currentFilePath);
            } catch (error) {
                console.error('[renderer.js] Failed to sync currentFilePath with main process:', error);
            }
        }
        
        let themeAppliedFromSettings = false;
        
        // Store flag for file restoration to coordinate with Monaco initialization
        window.hasFileToRestore = !!window.currentFilePath;
        
        // Load the last opened file if it exists
        if (window.currentFilePath) {
            console.log('[renderer.js] Restoring last opened file:', window.currentFilePath);
            
            // Check if it's a PDF file - handle differently
            const isPDF = window.currentFilePath.endsWith('.pdf');
            
            if (isPDF) {
                console.log('[renderer.js] Last file was a PDF - handling PDF restoration');
                // For PDFs, we don't need to restore content, just open the PDF viewer
                window.restoredFileContent = {
                    path: window.currentFilePath,
                    isPDF: true
                };
            } else {
                try {
                    const result = await window.electronAPI.invoke('open-file-path', window.currentFilePath);
                    if (result.success) {
                        console.log('[renderer.js] Successfully restored last opened file');
                        // Store the content to be loaded into editor after Monaco is initialized
                        window.restoredFileContent = {
                            path: window.currentFilePath,
                            content: result.content
                        };
                    } else {
                        console.warn('[renderer.js] Could not reopen last file:', result.error);
                        // File restoration failed - mark for default content fallback
                        window.currentFilePath = null;
                        window.hasFileToRestore = false;
                        window.useDefaultContentFallback = true;
                        await window.electronAPI.invoke('set-current-file', null);
                    }
                } catch (error) {
                    console.error('[renderer.js] Error restoring last opened file:', error);
                    // File restoration failed - mark for default content fallback
                    window.currentFilePath = null;
                    window.hasFileToRestore = false;
                    window.useDefaultContentFallback = true;
                    await window.electronAPI.invoke('set-current-file', null);
                }
            }
        }

        // 1. Apply theme based on explicit settings ('light' or 'dark')
        if (typeof appSettings.theme === 'string') {
            if (appSettings.theme === 'dark') {
                console.log('[renderer.js] Applying theme from setting: dark');
                applyTheme(true);
                themeAppliedFromSettings = true;
            } else if (appSettings.theme === 'light') {
                console.log('[renderer.js] Applying theme from setting: light');
                applyTheme(false);
                themeAppliedFromSettings = true;
            }
        }

        // 2. If no specific theme set (or set to 'auto'), check initial OS theme
        if (!themeAppliedFromSettings) {
            try {
                // Assuming 'get-initial-theme' returns boolean 'isDarkMode'
                const osIsDarkMode = await window.electronAPI.invoke('get-initial-theme');
                console.log('[renderer.js] Initial OS theme is:', osIsDarkMode ? 'dark' : 'light');
                applyTheme(osIsDarkMode);
            } catch (osThemeErr) {
                console.error('[renderer.js] Failed to get initial OS theme:', osThemeErr);
                // Apply a default fallback if OS theme check fails?
                // applyTheme(false); // e.g., default to light
            }
        }

        // Apply layout settings
        applyLayoutSettings(appSettings.layout);

        // File restoration is now handled in the updated logic above

        // 3. NOW set up the listener for future OS changes, only once
        if (!window.electronAPI._themeListenerAttached) { // Use a flag to prevent duplicates
            window.electronAPI.on('theme-updated', (osIsDarkMode) => {
                console.log('[renderer.js] OS theme updated event received.');
                // Skip OS updates if user has an explicit 'light' or 'dark' theme selected
                if (typeof appSettings.theme === 'string' && (appSettings.theme === 'light' || appSettings.theme === 'dark')) {
                    return;
                }
                // Apply theme based on OS update if setting is 'auto' or not set
                console.log('[renderer.js] Applying OS theme update:', osIsDarkMode ? 'dark' : 'light');
                applyTheme(osIsDarkMode);
            });
            window.electronAPI._themeListenerAttached = true; // Set flag
            console.log('[renderer.js] OS theme update listener initialized.');
        } else {
            console.log('[renderer.js] OS theme update listener already attached.');
        }

    } catch (err) {
        console.error('[renderer.js] Failed to load settings:', err);
    }
    
    // Initialize modules after Monaco editor is ready
    console.log('[renderer.js] Initializing modules...');
    
    // Initialize formatting module
    if (window.initializeMarkdownFormatting) {
        setTimeout(() => {
            window.initializeMarkdownFormatting();
        }, 100);
    }
    
    // Initialize search module
    if (window.initializeGlobalSearch) {
        setTimeout(() => {
            window.initializeGlobalSearch();
        }, 100);
    }
    
    // Initialize command palette module
    if (window.initializeCommandPalette) {
        setTimeout(() => {
            window.initializeCommandPalette();
        }, 100);
    }
    
    // Initialize speaker notes module
    if (window.initializeSpeakerNotes) {
        setTimeout(() => {
            window.initializeSpeakerNotes();
        }, 100);
    }
    
    console.log('[renderer.js] Module initialization queued.');
}

// Handle file opened event (e.g., from File > Open or File Tree click)
if (window.electronAPI) {
    window.electronAPI.on('file-opened', async (data) => {
        console.log('[Renderer] Received file-opened event:', data);
        if (data && typeof data.content === 'string' && typeof data.filePath === 'string') {
            await openFileInEditor(data.filePath, data.content);
            // Save current file to settings
            window.electronAPI.invoke('set-current-file', data.filePath);
        }
    });
}

// Helper to open file in editor
async function refreshCurrentFile() {
    if (!currentFilePath) {
        console.log('[Renderer] No current file to refresh');
        return;
    }
    
    try {
        console.log('[Renderer] Refreshing current file:', currentFilePath);
        console.log('[Renderer] Before refresh - editor content preview:', editor ? editor.getValue().substring(0, 200) : 'No editor');
        
        const result = await window.electronAPI.invoke('open-file-path', currentFilePath);
        console.log('[Renderer] Open-file result:', result.success ? 'Success' : 'Failed', result.error);
        
        if (result.success) {
            console.log('[Renderer] New file content preview:', result.content.substring(0, 200));
            
            // Preserve the current cursor position if possible
            const editor = document.querySelector('.editor textarea');
            const cursorPos = editor ? editor.selectionStart : 0;
            
            await openFileInEditor(result.filePath, result.content);
            
            // Restore cursor position
            if (editor && cursorPos) {
                setTimeout(() => {
                    const newEditor = document.querySelector('.editor textarea');
                    if (newEditor) {
                        newEditor.setSelectionRange(cursorPos, cursorPos);
                    }
                }, 100);
            }
            
            console.log('[Renderer] File refreshed successfully');
            console.log('[Renderer] After refresh - editor content preview:', editor ? editor.getValue().substring(0, 200) : 'No editor');
        } else {
            console.error('[Renderer] Failed to refresh file:', result.error);
        }
    } catch (error) {
        console.error('[Renderer] Error refreshing current file:', error);
    }
}

// Update AI Chat context when file changes
function updateAIChatContext(filePath) {
    // Update the chat context display
    const contextDisplay = document.getElementById('chat-context-display');
    if (contextDisplay) {
        if (filePath) {
            const fileName = filePath.split('/').pop() || filePath.split('\\').pop();
            
            // Get editor content stats
            let stats = '';
            if (window.editor && typeof window.editor.getValue === 'function') {
                const content = window.editor.getValue();
                if (content) {
                    const wordCount = content.trim().split(/\s+/).filter(word => word.length > 0).length;
                    const lineCount = content.split('\n').length;
                    stats = ` (${lineCount} lines, ${wordCount} words)`;
                }
            }
            
            contextDisplay.textContent = `Context: ${fileName}${stats} | Type /help`;
        } else {
            contextDisplay.textContent = 'No file open | Type /help for commands';
        }
    }
    
    // Check if chat pane is visible and show an initial context message only if chat is empty
    const chatPane = document.getElementById('chat-pane');
    const chatMessages = document.getElementById('chat-messages');
    
    if (chatPane && chatMessages && chatPane.style.display !== 'none') {
        // Only add a message if the chat is empty (first time opening)
        if (chatMessages.children.length === 0 && window.addChatMessage) {
            const fileName = filePath ? (filePath.split('/').pop() || filePath.split('\\').pop()) : null;
            if (fileName) {
                // Get editor content stats
                let stats = '';
                if (window.editor && typeof window.editor.getValue === 'function') {
                    const content = window.editor.getValue();
                    if (content) {
                        const wordCount = content.trim().split(/\s+/).filter(word => word.length > 0).length;
                        const lineCount = content.split('\n').length;
                        stats = ` (${lineCount} lines, ${wordCount} words)`;
                    }
                }
                window.addChatMessage(`AI Assistant ready. Currently editing: ${fileName}${stats}\n\nEditor content will be automatically included with your messages.\nType /help for available commands.`, 'AI');
            } else {
                window.addChatMessage(`AI Assistant ready. No file currently open.\n\nType /help for available commands.`, 'AI');
            }
        }
    }
    
    console.log('[Renderer] AI chat context updated for file:', filePath);
}

async function openFileInEditor(filePath, content, options = {}) {
    console.log('[openFileInEditor] Opening file:', filePath);
    if (options.isInternalLinkPreview) {
        console.log('[openFileInEditor] Internal link preview mode');
    }
    
    // Close image viewer if it's currently open
    if (window.imageViewerOriginalContent) {
        console.log('[openFileInEditor] Closing image viewer to show file content');
        const mainContent = document.getElementById('main-content');
        if (mainContent) {
            mainContent.innerHTML = window.imageViewerOriginalContent;
            delete window.imageViewerOriginalContent;
        }
    }
    
    // Detect file type
    const isPDF = filePath.endsWith('.pdf');
    const isHTML = filePath.endsWith('.html') || filePath.endsWith('.htm');
    const isBibTeX = filePath.endsWith('.bib');
    const isMarkdown = filePath.endsWith('.md') || filePath.endsWith('.markdown');
    
    // Exit PDF-only mode if we're opening a non-PDF file
    if (!isPDF && !options.isInternalLinkPreview) {
        exitPDFOnlyMode();
    }
    
    // CRITICAL FIX: Only set current file path if this is NOT an internal link preview
    if (!options.isInternalLinkPreview) {
        console.log('[FILEPATH TRACE] Setting currentFilePath FROM:', window.currentFilePath, 'TO:', filePath);
        window.currentFilePath = filePath;
        window.editorFileName = filePath; // Also set editorFileName for AI Chat context
    } else {
        console.log('[FILEPATH TRACE] SKIPPING currentFilePath change (internal link preview)');
    }
    
    // Only update UI state if this is NOT an internal link preview
    if (!options.isInternalLinkPreview) {
        // Highlight the currently opened file in the file tree
        highlightCurrentFileInTree(filePath);
        
        // Add to navigation history and recent files (unless we're navigating history)
        const fileName = filePath.split('/').pop();
        addToNavigationHistory(filePath, fileName);
        addFileToRecents(filePath);
    } else {
        console.log('[DEBUG] SKIPPING navigation/tree updates (internal link preview)');
    }
    
    // Store current file directory for image path resolution (only for real file opens)
    if (!options.isInternalLinkPreview) {
        // Extract directory from file path
        const lastSlash = filePath.lastIndexOf('/');
        window.currentFileDirectory = lastSlash >= 0 ? filePath.substring(0, lastSlash) : '';
        console.log('[Renderer] Set current file directory:', window.currentFileDirectory);
    }
    
    // Handle PDF files
    if (isPDF) {
        handlePDFFile(filePath);
        // Note: PDF files don't trigger AI chat context updates since they're not editable
        return;
    }
    
    // Handle HTML files
    if (isHTML) {
        await handleHTMLFile(filePath, content);
        updateAIChatContext(filePath);
        return;
    }
    
    // Handle editable files (Markdown, BibTeX)
    await handleEditableFile(filePath, content, { isBibTeX, isMarkdown });
    
    // Update AI chat context when file changes
    updateAIChatContext(filePath);
}

// Layout management for PDF-only mode
function enterPDFOnlyMode() {
    console.log('[Renderer] Entering PDF-only mode');
    
    // Hide the editor pane
    const editorPane = document.getElementById('editor-pane');
    const rightPane = document.getElementById('right-pane');
    const resizer = document.getElementById('resizer');
    
    if (editorPane) {
        editorPane.style.display = 'none';
    }
    
    // Hide the resizer between editor and preview
    if (resizer) {
        resizer.style.display = 'none';
    }
    
    // Hide preview zoom controls (text abstraction feature)
    const previewZoomControls = document.getElementById('preview-zoom-controls');
    if (previewZoomControls) {
        previewZoomControls.style.display = 'none';
    }
    
    // Disable preview zoom functionality for PDFs
    if (window.previewZoom) {
        window.previewZoom.isEnabled = false;
    }
    
    // Expand right pane (which contains preview) to take full width
    if (rightPane) {
        // Store original width for restoration
        if (!rightPane.dataset.originalWidth) {
            rightPane.dataset.originalWidth = rightPane.style.width || '';
            rightPane.dataset.originalFlex = rightPane.style.flex || '';
        }
        // Make right pane take full width
        rightPane.style.width = '100%';
        rightPane.style.flex = '1';
    }
    
    // Add a visual indicator that we're in PDF-only mode
    const indicator = document.getElementById('pdf-only-indicator') || document.createElement('div');
    indicator.id = 'pdf-only-indicator';
    indicator.style.cssText = `
        position: absolute;
        top: 8px;
        right: 8px;
        background: var(--accent-color, #007acc);
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        z-index: 1000;
        pointer-events: none;
    `;
    indicator.textContent = 'PDF Only';
    
    if (previewPane && !document.getElementById('pdf-only-indicator')) {
        previewPane.appendChild(indicator);
    }
}

function exitPDFOnlyMode() {
    console.log('[Renderer] Exiting PDF-only mode');
    
    // Remove PDF keyboard navigation
    if (window.pdfKeyboardListener) {
        document.removeEventListener('keydown', window.pdfKeyboardListener);
        window.pdfKeyboardListener = null;
        console.log('[PDF] Removed keyboard navigation listeners');
    }
    
    // Remove PDF wheel navigation
    if (window.pdfWheelListener) {
        document.removeEventListener('wheel', window.pdfWheelListener, { passive: false });
        window.pdfWheelListener = null;
        console.log('[PDF] Removed wheel navigation listeners');
    }
    
    // Restore the editor pane
    const editorPane = document.getElementById('editor-pane');
    const rightPane = document.getElementById('right-pane');
    const resizer = document.getElementById('resizer');
    
    if (editorPane) {
        editorPane.style.display = '';
    }
    
    // Restore the resizer
    if (resizer) {
        resizer.style.display = '';
    }
    
    // Restore preview zoom controls (text abstraction feature)
    const previewZoomControls = document.getElementById('preview-zoom-controls');
    if (previewZoomControls) {
        previewZoomControls.style.display = '';
    }
    
    // Restore right pane to original size
    if (rightPane && rightPane.dataset.originalWidth !== undefined) {
        rightPane.style.width = rightPane.dataset.originalWidth;
        rightPane.style.flex = rightPane.dataset.originalFlex;
        delete rightPane.dataset.originalWidth;
        delete rightPane.dataset.originalFlex;
    }
    
    // Remove PDF-only indicator
    const indicator = document.getElementById('pdf-only-indicator');
    if (indicator) {
        indicator.remove();
    }
}

// Handle PDF file opening
function handlePDFFile(filePath) {
    console.log('[Renderer] Handling PDF file:', filePath);
    
    // Enter PDF-only mode immediately to hide editor and text abstraction controls
    enterPDFOnlyMode();
    
    // Check for associated Markdown file
    const baseName = filePath.replace(/\.pdf$/i, '');
    const associatedMdFile = baseName + '.md';
    
    // Check if associated markdown file exists
    window.electronAPI.invoke('check-file-exists', associatedMdFile)
        .then(result => {
            if (result.exists) {
                console.log('[Renderer] Found associated markdown file:', associatedMdFile);
                // Exit PDF-only mode and restore normal layout
                exitPDFOnlyMode();
                // Load the markdown file in the editor
                return window.electronAPI.invoke('open-file-path', associatedMdFile);
            } else {
                console.log('[Renderer] No associated markdown file found - staying in PDF-only mode');
                // PDF-only mode already entered above
                return null;
            }
        })
        .then(async markdownResult => {
            if (markdownResult && markdownResult.success) {
                console.log('[Renderer] Loading associated markdown file in editor');
                // Set a counter for multiple suppression calls
                window.suppressPreviewUpdateCount = 2; // For both Monaco event and handleEditableFile call
                await handleEditableFile(associatedMdFile, markdownResult.content, { isMarkdown: true });
            } else {
                // No associated markdown, clear editor without updating preview
                clearEditor(true);
            }
            
            // Display PDF in preview panel (this should not be overridden)
            displayPDFInPreview(filePath);
        })
        .catch(error => {
            console.error('[Renderer] Error checking for associated markdown:', error);
            // Assume no associated markdown and enter PDF-only mode
            enterPDFOnlyMode();
            clearEditor(true);
            displayPDFInPreview(filePath);
        });
}

// Handle HTML file opening
async function handleHTMLFile(filePath, content) {
    console.log('[Renderer] Handling HTML file:', filePath);
    
    // Check for associated Markdown file
    const baseName = filePath.replace(/\.html?$/i, '');
    const associatedMdFile = baseName + '.md';
    
    // Check if associated markdown file exists
    window.electronAPI.invoke('check-file-exists', associatedMdFile)
        .then(exists => {
            if (exists) {
                console.log('[Renderer] Found associated markdown file:', associatedMdFile);
                // Load the markdown file in the editor
                return window.electronAPI.invoke('open-file-path', associatedMdFile);
            }
            return null;
        })
        .then(async markdownResult => {
            if (markdownResult && markdownResult.success) {
                console.log('[Renderer] Loading associated markdown file in editor');
                // Set suppression counter for both Monaco event and handleEditableFile call
                window.suppressPreviewUpdateCount = 2;
                await handleEditableFile(associatedMdFile, markdownResult.content, { isMarkdown: true });
            } else {
                // No associated markdown, load the HTML content in the editor
                console.log('[Renderer] No associated markdown found, loading HTML content in editor');
                // Suppress preview updates so HTML file content shows in preview, not markdown rendering
                window.suppressPreviewUpdateCount = 2;
                await handleEditableFile(filePath, content, { isHTML: true });
            }
            
            // Display HTML in preview panel (should not be overridden by markdown rendering)
            displayHTMLInPreview(content, filePath);
        })
        .catch(async error => {
            console.error('[Renderer] Error checking for associated markdown:', error);
            // Fallback to loading HTML content in editor
            window.suppressPreviewUpdateCount = 2;
            await handleEditableFile(filePath, content, { isHTML: true });
            displayHTMLInPreview(content, filePath);
        });
}

// Handle editable files (Markdown, BibTeX, HTML)
async function handleEditableFile(filePath, content, fileTypes) {
    console.log('[Renderer] Handling editable file:', filePath, fileTypes);
    
    // Exit PDF-only mode when opening editable files
    exitPDFOnlyMode();
    console.log('[Renderer] handleEditableFile content length:', content ? content.length : 'NO CONTENT');
    console.log('[Renderer] Editor available:', !!editor, 'setValue function:', typeof editor?.setValue);
    
    // Process tags for markdown files
    if (fileTypes.isMarkdown && content && window.tagManager) {
        try {
            const fileData = window.tagManager.processFile(filePath, content);
            console.log('[TagManager] Processed file:', filePath, 'Tags:', fileData.tags, 'Metadata:', fileData.metadata);
            
            // Store file data for later use
            window.currentFileData = fileData;
            
            // Trigger file tree update to show new tags (if UI is ready)
            if (window.updateFileTreeWithTags) {
                window.updateFileTreeWithTags();
            }
        } catch (error) {
            console.error('[TagManager] Error processing file tags:', error);
        }
    }
    
    // Set up internal link click handler if not already done
    if (!window.internalLinkHandlerSetup) {
        document.addEventListener('click', (event) => {
            // Use window reference to ensure function is available
            if (window.handleInternalLinkClick && typeof window.handleInternalLinkClick === 'function') {
                window.handleInternalLinkClick(event);
            }
        });
        window.internalLinkHandlerSetup = true;
        console.log('[Renderer] Internal link click handler set up');
    }
    
    // Set up link preview handlers if not already done
    if (!window.linkPreviewHandlerSetup) {
        setupLinkPreviewHandlers();
        window.linkPreviewHandlerSetup = true;
        console.log('[Renderer] Link preview handlers set up');
    }
    
    // Set editor content and language (Monaco or fallback)
    if (editor && typeof editor.setValue === 'function') {
        console.log('[openFileInEditor] Setting content in Monaco editor');
        
        // Temporarily suppress auto-save during programmatic content setting
        suppressAutoSave = true;
        
        try {
            // Set editor content safely
            const currentModel = editor.getModel();
            if (currentModel) {
                currentModel.setValue(content);
            } else {
                const newModel = monaco.editor.createModel(content, 'markdown');
                editor.setModel(newModel);
            }
            
            // Force a layout update
            editor.layout();
            
        } catch (error) {
            console.error('[openFileInEditor] Error setting editor content:', error);
            // Fallback to basic setValue
            try {
                editor.setValue(content);
            } catch (fallbackError) {
                console.error('[openFileInEditor] Fallback setValue also failed:', fallbackError);
            }
        }
        
        suppressAutoSave = false;
        
        // Configure language and theme based on file type  
        const currentModel = editor.getModel();
        if (currentModel) {
            if (fileTypes.isBibTeX) {
                monaco.editor.setModelLanguage(currentModel, 'bibtex');
                // Apply appropriate BibTeX theme based on current theme
                const isDarkTheme = editor._themeService?.getColorTheme()?.type === 'dark' || 
                                  window.currentTheme === 'dark';
                editor.updateOptions({ theme: isDarkTheme ? 'bibtex-dark' : 'bibtex-light' });
                console.log('[Renderer] Configured editor for BibTeX file with', isDarkTheme ? 'dark' : 'light', 'theme');
            } else if (fileTypes.isHTML) {
                monaco.editor.setModelLanguage(currentModel, 'html');
                editor.updateOptions({ theme: window.currentTheme === 'dark' ? 'vs-dark' : 'vs' });
                console.log('[Renderer] Configured editor for HTML file');
            } else {
                // Default to markdown for .md files and others
                monaco.editor.setModelLanguage(currentModel, 'markdown');
                editor.updateOptions({ theme: window.currentTheme === 'dark' ? 'vs-dark' : 'vs' });
                console.log('[Renderer] Configured editor for Markdown file');
            }
        }
    } else if (fallbackEditor) {
        console.log('[openFileInEditor] Using fallback editor');
        fallbackEditor.value = content;
    } else {
        console.error('[openFileInEditor] ERROR: No editor available (neither Monaco nor fallback)');
    }
    
    // Update last saved content for auto-save tracking
    lastSavedContent = content;
    hasUnsavedChanges = false;
    updateUnsavedIndicator(false);
    
    // Clear AI companion buffers when opening new file to prevent stale analysis
    if (window.aiCompanion && typeof window.aiCompanion.clearAllBuffers === 'function') {
        window.aiCompanion.clearAllBuffers();
    }
    
    // Update preview and structure (unless suppressed)
    if (!window.suppressNextPreviewUpdate && !window.suppressPreviewUpdateCount) {
        await updatePreviewAndStructure(content);
    } else {
        console.log('[Renderer] Skipping preview update in handleEditableFile due to suppression');
        // Don't clear the flags here - let updatePreviewAndStructure handle the counters
    }
    
    // Sync content to presentation view (if available)
    if (window.syncContentToPresentation) {
        window.syncContentToPresentation(content);
    }
    
    // Save current file to settings (redundant, but ensures consistency)
    window.electronAPI.invoke('set-current-file', filePath);
}

// Clear the editor
function clearEditor(suppressPreviewUpdate = false) {
    console.log('[Renderer] Clearing editor for non-editable file, suppressPreviewUpdate:', suppressPreviewUpdate);
    
    if (editor && typeof editor.setValue === 'function') {
        if (suppressPreviewUpdate) {
            // Set a flag to prevent the next preview update
            window.suppressNextPreviewUpdate = true;
        }
        editor.setValue('# File Preview\n\nThis file is displayed in the preview panel.');
    } else if (fallbackEditor) {
        fallbackEditor.value = '# File Preview\n\nThis file is displayed in the preview panel.';
    }
    
    lastSavedContent = '';
    hasUnsavedChanges = false;
    updateUnsavedIndicator(false);
}

// Display PDF in preview panel with search functionality
function displayPDFInPreview(filePath) {
    console.log('[Renderer] Displaying PDF in preview with search:', filePath);
    const previewContent = document.getElementById('preview-content');
    
    if (previewContent) {
        // Create advanced PDF viewer with search
        const pdfViewer = `
            <div class="pdf-preview-container" style="width: 100%; height: 100vh; display: flex; flex-direction: column; position: absolute; top: 0; left: 0; right: 0; bottom: 0;">
                <div class="pdf-header" style="padding: 8px 12px; background: var(--preview-bg-color, #f8f9fa); border-bottom: 1px solid var(--border-color, #e1e4e8); display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; font-size: 14px;">
                    <div style="font-weight: bold;">
                        📄 ${filePath.split('/').pop()}
                    </div>
                    <div class="pdf-search-controls" style="display: flex; align-items: center; gap: 8px;">
                        <input type="text" id="pdf-search-input" placeholder="Search in PDF..." style="padding: 4px 8px; border: 1px solid var(--border-color, #ccc); border-radius: 3px; font-size: 12px; width: 200px;">
                        <button id="pdf-search-prev" style="padding: 4px 8px; border: 1px solid var(--border-color, #ccc); border-radius: 3px; background: var(--button-bg, #fff); cursor: pointer;" title="Previous">↑</button>
                        <button id="pdf-search-next" style="padding: 4px 8px; border: 1px solid var(--border-color, #ccc); border-radius: 3px; background: var(--button-bg, #fff); cursor: pointer;" title="Next">↓</button>
                        <span id="pdf-search-results" style="font-size: 12px; color: var(--text-muted, #666); margin-left: 8px;"></span>
                    </div>
                </div>
                <div style="flex: 1; position: relative; overflow: hidden; min-height: 0;">
                    <canvas id="pdf-canvas" style="display: block; margin: 0 auto; max-width: 100%; max-height: 100%;"></canvas>
                    <div class="pdf-fallback" style="display: none; padding: 20px; text-align: center; color: #666;">
                        <p>📄 PDF preview not available</p>
                        <p><small>Path: ${filePath}</small></p>
                        <button onclick="window.electronAPI.invoke('open-external', '${filePath}')" style="margin-top: 10px; padding: 8px 16px; background: #007acc; color: white; border: none; border-radius: 4px; cursor: pointer;">Open in External Viewer</button>
                    </div>
                    <div class="pdf-loading" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: var(--text-muted, #666);">
                        Loading PDF...
                    </div>
                </div>
                <div class="pdf-controls" style="padding: 8px 12px; background: var(--preview-bg-color, #f8f9fa); border-top: 1px solid var(--border-color, #e1e4e8); display: flex; align-items: center; justify-content: center; gap: 12px; flex-shrink: 0;">
                    <button id="pdf-prev-page" style="padding: 4px 8px; border: 1px solid var(--border-color, #ccc); border-radius: 3px; background: var(--button-bg, #fff); cursor: pointer;">Previous</button>
                    <span id="pdf-page-info" style="font-size: 12px; color: var(--text-muted, #666);">Page 1 of 1</span>
                    <button id="pdf-next-page" style="padding: 4px 8px; border: 1px solid var(--border-color, #ccc); border-radius: 3px; background: var(--button-bg, #fff); cursor: pointer;">Next</button>
                    <button id="pdf-zoom-out" style="padding: 4px 8px; border: 1px solid var(--border-color, #ccc); border-radius: 3px; background: var(--button-bg, #fff); cursor: pointer; margin-left: 12px;">-</button>
                    <span id="pdf-zoom-level" style="font-size: 12px; color: var(--text-muted, #666);">100%</span>
                    <button id="pdf-zoom-in" style="padding: 4px 8px; border: 1px solid var(--border-color, #ccc); border-radius: 3px; background: var(--button-bg, #fff); cursor: pointer;">+</button>
                </div>
            </div>
        `;
        
        previewContent.innerHTML = pdfViewer;
        
        // Initialize PDF.js viewer
        initializePDFViewer(filePath);
    }
}

// PDF.js viewer state
let pdfViewerState = {
    doc: null,
    currentPage: 1,
    totalPages: 0,
    scale: 1.0,
    canvas: null,
    ctx: null,
    searchMatches: [],
    currentMatch: -1,
    textContent: []
};

// Initialize PDF.js viewer
async function initializePDFViewer(filePath) {
    console.log('[PDF] Initializing PDF viewer for:', filePath);
    
    try {
        // Wait for PDF.js to be available from CDN
        if (typeof window.pdfjsLib === 'undefined') {
            console.log('[PDF] Waiting for PDF.js to load...');
            await new Promise((resolve) => {
                const checkPdfJs = () => {
                    if (typeof window.pdfjsLib !== 'undefined') {
                        resolve();
                    } else {
                        setTimeout(checkPdfJs, 100);
                    }
                };
                checkPdfJs();
            });
        }
        
        const pdfjsLib = window.pdfjsLib;
        
        // Set up PDF.js worker (should already be set in HTML, but ensure it's correct)
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdfjs/pdf.worker.min.js';
        }
        
        // Initialize canvas and context
        const canvas = document.getElementById('pdf-canvas');
        const ctx = canvas.getContext('2d');
        pdfViewerState.canvas = canvas;
        pdfViewerState.ctx = ctx;
        
        // Load PDF document
        const loadingElement = document.querySelector('.pdf-loading');
        const fallbackElement = document.querySelector('.pdf-fallback');
        
        loadingElement.style.display = 'block';
        
        const pdf = await pdfjsLib.getDocument(`file://${filePath}`).promise;
        pdfViewerState.doc = pdf;
        pdfViewerState.totalPages = pdf.numPages;
        
        console.log('[PDF] Loaded PDF with', pdf.numPages, 'pages');
        
        // Hide loading, show canvas
        loadingElement.style.display = 'none';
        canvas.style.display = 'block';
        
        // Render first page
        await renderPage(1);
        
        // Extract text content for search
        await extractAllTextContent();
        
        // Set up event handlers
        setupPDFEventHandlers();
        
        updatePageInfo();
        
    } catch (error) {
        console.error('[PDF] Error initializing PDF viewer:', error);
        
        // Show fallback
        document.querySelector('.pdf-loading').style.display = 'none';
        document.querySelector('.pdf-fallback').style.display = 'block';
    }
}

// Render a specific page with smooth transition
async function renderPage(pageNum, smooth = true) {
    if (!pdfViewerState.doc) return;
    
    try {
        const page = await pdfViewerState.doc.getPage(pageNum);
        const viewport = page.getViewport({ scale: pdfViewerState.scale });
        
        const canvas = pdfViewerState.canvas;
        const ctx = pdfViewerState.ctx;
        
        // Add smooth transition if enabled
        if (smooth && pdfViewerState.currentPage !== pageNum) {
            canvas.style.transition = 'opacity 0.2s ease-in-out';
            canvas.style.opacity = '0.3';
        }
        
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        const renderContext = {
            canvasContext: ctx,
            viewport: viewport
        };
        
        await page.render(renderContext).promise;
        
        // Complete smooth transition
        if (smooth && pdfViewerState.currentPage !== pageNum) {
            setTimeout(() => {
                canvas.style.opacity = '1';
                // Remove transition after animation completes
                setTimeout(() => {
                    canvas.style.transition = '';
                }, 200);
            }, 50);
        }
        
        pdfViewerState.currentPage = pageNum;
        updatePageInfo();
        
        console.log('[PDF] Rendered page', pageNum);
        
    } catch (error) {
        console.error('[PDF] Error rendering page:', error);
    }
}

// Extract text content from all pages for search
async function extractAllTextContent() {
    if (!pdfViewerState.doc) return;
    
    console.log('[PDF] Extracting text content for search...');
    pdfViewerState.textContent = [];
    
    for (let i = 1; i <= pdfViewerState.totalPages; i++) {
        try {
            const page = await pdfViewerState.doc.getPage(i);
            const textContent = await page.getTextContent();
            
            const pageText = textContent.items.map(item => item.str).join(' ');
            pdfViewerState.textContent.push({
                pageNum: i,
                text: pageText
            });
            
        } catch (error) {
            console.error(`[PDF] Error extracting text from page ${i}:`, error);
            pdfViewerState.textContent.push({
                pageNum: i,
                text: ''
            });
        }
    }
    
    console.log('[PDF] Text extraction complete');
}

// Search functionality
function searchPDF(query) {
    if (!query.trim()) {
        pdfViewerState.searchMatches = [];
        pdfViewerState.currentMatch = -1;
        updateSearchResults();
        return;
    }
    
    console.log('[PDF] Searching for:', query);
    
    const matches = [];
    const searchTerm = query.toLowerCase();
    
    pdfViewerState.textContent.forEach(pageContent => {
        const pageText = pageContent.text.toLowerCase();
        let index = pageText.indexOf(searchTerm);
        
        while (index !== -1) {
            matches.push({
                pageNum: pageContent.pageNum,
                index: index,
                text: pageContent.text.substr(Math.max(0, index - 20), 60)
            });
            index = pageText.indexOf(searchTerm, index + 1);
        }
    });
    
    pdfViewerState.searchMatches = matches;
    pdfViewerState.currentMatch = matches.length > 0 ? 0 : -1;
    
    console.log('[PDF] Found', matches.length, 'matches');
    updateSearchResults();
    
    // Go to first match
    if (matches.length > 0) {
        goToSearchMatch(0);
    }
}

// Navigate to a specific search match
async function goToSearchMatch(matchIndex) {
    if (matchIndex < 0 || matchIndex >= pdfViewerState.searchMatches.length) return;
    
    const match = pdfViewerState.searchMatches[matchIndex];
    pdfViewerState.currentMatch = matchIndex;
    
    // Navigate to the page containing the match
    if (match.pageNum !== pdfViewerState.currentPage) {
        await renderPage(match.pageNum);
    }
    
    updateSearchResults();
}

// Update search results display
function updateSearchResults() {
    const resultsElement = document.getElementById('pdf-search-results');
    if (!resultsElement) return;
    
    if (pdfViewerState.searchMatches.length === 0) {
        resultsElement.textContent = '';
    } else {
        resultsElement.textContent = `${pdfViewerState.currentMatch + 1} of ${pdfViewerState.searchMatches.length}`;
    }
    
    // Update button states
    const prevBtn = document.getElementById('pdf-search-prev');
    const nextBtn = document.getElementById('pdf-search-next');
    
    if (prevBtn) prevBtn.disabled = pdfViewerState.currentMatch <= 0;
    if (nextBtn) nextBtn.disabled = pdfViewerState.currentMatch >= pdfViewerState.searchMatches.length - 1;
}

// Update page info display
function updatePageInfo() {
    const pageInfo = document.getElementById('pdf-page-info');
    if (pageInfo) {
        pageInfo.textContent = `Page ${pdfViewerState.currentPage} of ${pdfViewerState.totalPages}`;
    }
    
    // Update navigation button states
    const prevBtn = document.getElementById('pdf-prev-page');
    const nextBtn = document.getElementById('pdf-next-page');
    
    if (prevBtn) prevBtn.disabled = pdfViewerState.currentPage <= 1;
    if (nextBtn) nextBtn.disabled = pdfViewerState.currentPage >= pdfViewerState.totalPages;
    
    // Update zoom info
    const zoomLevel = document.getElementById('pdf-zoom-level');
    if (zoomLevel) {
        zoomLevel.textContent = `${Math.round(pdfViewerState.scale * 100)}%`;
    }
}

// Set up event handlers for PDF viewer
function setupPDFEventHandlers() {
    // Global keyboard navigation for PDFs
    const addPDFKeyboardNavigation = () => {
        // Remove existing PDF keyboard listeners
        if (window.pdfKeyboardListener) {
            document.removeEventListener('keydown', window.pdfKeyboardListener);
        }
        
        window.pdfKeyboardListener = (e) => {
            // Only handle keyboard events when PDF is visible and no input is focused
            const pdfContainer = document.querySelector('.pdf-preview-container');
            const isPDFVisible = pdfContainer && pdfContainer.style.display !== 'none';
            const isInputFocused = document.activeElement && 
                                   (document.activeElement.tagName === 'INPUT' || 
                                    document.activeElement.tagName === 'TEXTAREA' ||
                                    document.activeElement.isContentEditable);
            
            if (!isPDFVisible || isInputFocused) return;
            
            switch (e.key) {
                case 'ArrowUp':
                case 'PageUp':
                    e.preventDefault();
                    if (pdfViewerState.currentPage > 1) {
                        renderPage(pdfViewerState.currentPage - 1);
                    }
                    break;
                    
                case 'ArrowDown':  
                case 'PageDown':
                case ' ': // Spacebar
                    e.preventDefault();
                    if (pdfViewerState.currentPage < pdfViewerState.totalPages) {
                        renderPage(pdfViewerState.currentPage + 1);
                    }
                    break;
                    
                case 'Home':
                    e.preventDefault();
                    renderPage(1);
                    break;
                    
                case 'End':
                    e.preventDefault();
                    renderPage(pdfViewerState.totalPages);
                    break;
            }
        };
        
        document.addEventListener('keydown', window.pdfKeyboardListener);
        console.log('[PDF] Added keyboard navigation listeners');
    };
    
    // Add keyboard navigation
    addPDFKeyboardNavigation();
    
    // Add mouse wheel navigation for PDF pages
    const addPDFWheelNavigation = () => {
        // Remove existing PDF wheel listeners
        if (window.pdfWheelListener) {
            document.removeEventListener('wheel', window.pdfWheelListener, { passive: false });
        }
        
        let wheelTimeout;
        let wheelCooldown = false;
        let accumulatedDelta = 0;
        const DELTA_THRESHOLD = 100; // Require more significant scroll to change page
        
        window.pdfWheelListener = (e) => {
            // Only handle wheel events when PDF is visible and over the PDF viewer
            const pdfContainer = document.querySelector('.pdf-preview-container');
            const pdfCanvas = document.getElementById('pdf-canvas');
            
            // Check if PDF is currently displayed
            const isPDFVisible = pdfContainer && pdfCanvas && pdfCanvas.style.display !== 'none';
            
            // Check if wheel event is over the PDF viewer area (be more permissive)
            const isOverPDFViewer = pdfContainer && (pdfContainer.contains(e.target) || e.target === pdfCanvas);
            
            if (!isPDFVisible || !isOverPDFViewer) {
                return;
            }
            
            // Prevent default scrolling behavior
            e.preventDefault();
            
            // Skip if in cooldown
            if (wheelCooldown) {
                return;
            }
            
            // Accumulate scroll delta
            accumulatedDelta += e.deltaY;
            
            // Clear timeout for delta reset
            clearTimeout(wheelTimeout);
            wheelTimeout = setTimeout(() => {
                accumulatedDelta = 0; // Reset accumulated delta after inactivity
            }, 150);
            
            // Check if accumulated delta exceeds threshold
            if (Math.abs(accumulatedDelta) >= DELTA_THRESHOLD) {
                if (accumulatedDelta > 0) {
                    // Scroll down - next page
                    if (pdfViewerState.currentPage < pdfViewerState.totalPages) {
                        renderPage(pdfViewerState.currentPage + 1);
                        // Set cooldown after page change
                        wheelCooldown = true;
                        setTimeout(() => {
                            wheelCooldown = false;
                        }, 300); // Cooldown period after page change
                    }
                } else if (accumulatedDelta < 0) {
                    // Scroll up - previous page
                    if (pdfViewerState.currentPage > 1) {
                        renderPage(pdfViewerState.currentPage - 1);
                        // Set cooldown after page change
                        wheelCooldown = true;
                        setTimeout(() => {
                            wheelCooldown = false;
                        }, 300); // Cooldown period after page change
                    }
                }
                // Reset accumulated delta after page change
                accumulatedDelta = 0;
            }
        };
        
        document.addEventListener('wheel', window.pdfWheelListener, { passive: false });
        console.log('[PDF] Added mouse wheel navigation listeners');
    };
    
    // Add wheel navigation
    addPDFWheelNavigation();
    
    // Search input
    const searchInput = document.getElementById('pdf-search-input');
    if (searchInput) {
        let searchTimeout;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                searchPDF(e.target.value);
            }, 300);
        });
        
        // Handle Enter key
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (pdfViewerState.searchMatches.length > 0) {
                    const nextIndex = (pdfViewerState.currentMatch + 1) % pdfViewerState.searchMatches.length;
                    goToSearchMatch(nextIndex);
                }
            }
        });
    }
    
    // Search navigation
    const searchPrev = document.getElementById('pdf-search-prev');
    const searchNext = document.getElementById('pdf-search-next');
    
    if (searchPrev) {
        searchPrev.addEventListener('click', () => {
            if (pdfViewerState.currentMatch > 0) {
                goToSearchMatch(pdfViewerState.currentMatch - 1);
            }
        });
    }
    
    if (searchNext) {
        searchNext.addEventListener('click', () => {
            if (pdfViewerState.currentMatch < pdfViewerState.searchMatches.length - 1) {
                goToSearchMatch(pdfViewerState.currentMatch + 1);
            }
        });
    }
    
    // Page navigation
    const prevPage = document.getElementById('pdf-prev-page');
    const nextPage = document.getElementById('pdf-next-page');
    
    if (prevPage) {
        prevPage.addEventListener('click', async () => {
            if (pdfViewerState.currentPage > 1) {
                await renderPage(pdfViewerState.currentPage - 1);
            }
        });
    }
    
    if (nextPage) {
        nextPage.addEventListener('click', async () => {
            if (pdfViewerState.currentPage < pdfViewerState.totalPages) {
                await renderPage(pdfViewerState.currentPage + 1);
            }
        });
    }
    
    // Zoom controls
    const zoomIn = document.getElementById('pdf-zoom-in');
    const zoomOut = document.getElementById('pdf-zoom-out');
    
    if (zoomIn) {
        zoomIn.addEventListener('click', async () => {
            pdfViewerState.scale = Math.min(3.0, pdfViewerState.scale * 1.2);
            await renderPage(pdfViewerState.currentPage);
        });
    }
    
    if (zoomOut) {
        zoomOut.addEventListener('click', async () => {
            pdfViewerState.scale = Math.max(0.5, pdfViewerState.scale / 1.2);
            await renderPage(pdfViewerState.currentPage);
        });
    }
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Only handle when PDF viewer is active
        if (!document.getElementById('pdf-canvas') || document.getElementById('pdf-canvas').style.display === 'none') {
            return;
        }
        
        if (e.ctrlKey || e.metaKey) {
            if (e.key === 'f') {
                e.preventDefault();
                const searchInput = document.getElementById('pdf-search-input');
                if (searchInput) {
                    searchInput.focus();
                    searchInput.select();
                }
            }
        }
        
        // Arrow key navigation
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (pdfViewerState.currentPage > 1) {
                renderPage(pdfViewerState.currentPage - 1);
            }
        } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            e.preventDefault();
            if (pdfViewerState.currentPage < pdfViewerState.totalPages) {
                renderPage(pdfViewerState.currentPage + 1);
            }
        }
    });
}

// Display HTML in preview panel
function displayHTMLInPreview(htmlContent, filePath) {
    console.log('[Renderer] Displaying HTML in preview:', filePath);
    const previewContent = document.getElementById('preview-content');
    
    if (previewContent) {
        // Create HTML preview with safety measures
        const htmlViewer = `
            <div class="html-preview-container" style="width: 100%; height: 100vh; display: flex; flex-direction: column; position: absolute; top: 0; left: 0; right: 0; bottom: 0;">
                <div class="html-header" style="padding: 8px 12px; background: var(--preview-bg-color, #f8f9fa); border-bottom: 1px solid var(--border-color, #e1e4e8); font-weight: bold; flex-shrink: 0; font-size: 14px;">
                    🌐 ${filePath.split('/').pop()}
                </div>
                <div style="flex: 1; overflow: hidden; position: relative; min-height: 0;">
                    <iframe srcdoc="${htmlContent.replace(/"/g, '&quot;')}" 
                            style="width: 100%; height: 100%; border: 1px solid var(--border-color, #e1e4e8); border-radius: 4px; display: block;"
                            sandbox="allow-scripts allow-same-origin">
                    </iframe>
                </div>
            </div>
        `;
        
        previewContent.innerHTML = htmlViewer;
    }
}

// Update cursor position for fallback textarea editor
function updateFallbackCursorPosition() {
    const textarea = document.getElementById('fallback-editor');
    const cursorPosEl = document.getElementById('cursor-position');
    
    if (!textarea || !cursorPosEl) return;
    
    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = textarea.value.substring(0, cursorPos);
    const lines = textBeforeCursor.split('\n');
    const lineNumber = lines.length;
    const columnNumber = lines[lines.length - 1].length + 1;
    
    cursorPosEl.textContent = `Ln ${lineNumber}, Col ${columnNumber}`;
}

// Fallback editor in case Monaco fails to load
async function createFallbackEditor() {
    console.log('[renderer.js] Creating fallback textarea editor...');
    const textarea = document.createElement('textarea');
    fallbackEditor = textarea;
    window.fallbackEditor = textarea; // Make available globally for debugging
    
    // Use restored file content if available, otherwise use default content if no file was being restored OR if restoration failed
    if (window.restoredFileContent) {
        if (window.restoredFileContent.isPDF) {
            // For PDFs, don't try to load binary content into textarea, handle as PDF
            console.log('[renderer.js] Restored file was a PDF - handling PDF restoration');
            handlePDFFile(window.restoredFileContent.path);
            window.restoredFileContent = null;
            return; // Exit early, PDF doesn't need fallback editor
        } else {
            textarea.value = window.restoredFileContent.content;
            console.log('[renderer.js] Using restored file content for fallback editor');
            // Clear the restored content flag
            window.restoredFileContent = null;
        }
    } else if (!window.hasFileToRestore || window.useDefaultContentFallback) {
        textarea.value = '# Welcome!\n\nStart typing your Markdown here.';
        if (window.useDefaultContentFallback) {
            console.log('[renderer.js] Using default content for fallback editor (file restoration failed)');
        } else {
            console.log('[renderer.js] Using default content for fallback editor (fresh start)');
        }
    } else {
        // Fallback: if we reach here with empty content, use default
        textarea.value = '# Welcome!\n\nStart typing your Markdown here.';
        console.log('[renderer.js] Using default content for fallback editor (no file restoration)');
    }
    textarea.style.width = '100%';
    textarea.style.height = '100%';
    textarea.style.padding = '8px';
    textarea.style.border = 'none';
    textarea.style.resize = 'none';
    textarea.style.fontFamily = 'monospace';
    editorContainer.innerHTML = '';
    editorContainer.appendChild(textarea);
    await updatePreviewAndStructure(textarea.value);
    // Track previous content for change detection
    let previousFallbackContent = textarea.value;
    
    textarea.addEventListener('input', async (event) => {
        const currentContent = textarea.value;
        
        // Process content changes for AI writing companion
        if (window.aiCompanion && typeof window.aiCompanion.processNewWriting === 'function') {
            // Detect new text added
            if (currentContent.length > previousFallbackContent.length) {
                const newText = currentContent.slice(previousFallbackContent.length);
                if (newText.length > 0) {
                    window.aiCompanion.processNewWriting(newText);
                }
            }
        }
        
        // Update for next change detection
        previousFallbackContent = currentContent;
        
        await updatePreviewAndStructure(currentContent);
    });
    
    // Update cursor position for fallback editor
    textarea.addEventListener('selectionchange', updateFallbackCursorPosition);
    textarea.addEventListener('keyup', updateFallbackCursorPosition);
    textarea.addEventListener('mouseup', updateFallbackCursorPosition);
    
    console.log('[renderer.js] Fallback editor created and initialized.');
}

// --- Global Keyboard Shortcuts ---
document.addEventListener('keydown', async (e) => {
    
    // Only handle shortcuts when not in input fields (except find/replace inputs)
    const isInInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable;
    const isInFindReplace = e.target === findInput || e.target === replaceInput;
    
    // Ctrl+F or Cmd+F: Open Find dialog
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        showFindReplaceDialog(false);
        return;
    }
    
    // Ctrl+H or Cmd+H: Open Find & Replace dialog
    if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
        e.preventDefault();
        showFindReplaceDialog(true);
        return;
    }
    
    // Ctrl+P or Cmd+P: Open Command Palette (VS Code style file picker)
    if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        showCommandPalette();
        return;
    }
    
    // Ctrl+S or Cmd+S: Save file
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        console.log('[renderer.js] Save shortcut triggered (Ctrl/Cmd+S)');
        await saveFile();
        return;
    }
    
    // Ctrl+Shift+S or Cmd+Shift+S: Save As file
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        console.log('[renderer.js] Save As shortcut triggered (Ctrl/Cmd+Shift+S)');
        await saveAsFile();
        return;
    }
    
    // Ctrl+Shift+F or Cmd+Shift+F: Open Global Search
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        showRightPane('search');
        if (globalSearchInput) {
            globalSearchInput.focus();
        }
        return;
    }
    
    // Markdown formatting shortcuts
    // Ctrl+B or Cmd+B: Bold - Now handled by Monaco editor action
    // if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
    //     e.preventDefault();
    //     await formatText('**', '**', 'bold text');
    //     return;
    // }
    
    // Ctrl+I or Cmd+I: Italic - Now handled by Monaco editor action
    // if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
    //     e.preventDefault();
    //     await formatText('*', '*', 'italic text');
    //     return;
    // }
    
    // Ctrl+` or Cmd+`: Inline code - Now handled by Monaco editor action  
    // if ((e.ctrlKey || e.metaKey) && e.key === '`') {
    //     e.preventDefault();
    //     await formatText('`', '`', 'code');
    //     return;
    // }
    
    // Ctrl+K or Cmd+K: Insert link - Now handled by Monaco editor action
    // if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    //     e.preventDefault();
    //     insertLink();
    //     return;
    // }
    
    // F3: Find Next (when find dialog is open or when not in input)
    if (e.key === 'F3' && (!isInInput || isInFindReplace)) {
        e.preventDefault();
        if (e.shiftKey) {
            findPrevious();
        } else {
            findNext();
        }
        return;
    }
    
    // Escape: Close find dialog (global)
    if (e.key === 'Escape' && !findReplaceDialog.classList.contains('hidden')) {
        hideFindReplaceDialog();
        return;
    }

    // Cmd+Shift+' or Ctrl+Shift+': Invoke Ash (AI Writing Companion) explicitly
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "'") {
        e.preventDefault();
        console.log('[renderer.js] Explicit Ash invocation triggered (Cmd/Ctrl+Shift+\')');
        await invokeAshExplicitly();
        return;
    }
});

// === Explicit Ash Invocation ===
async function invokeAshExplicitly() {
    try {
        console.log('[renderer.js] 🎯 Explicit Ash invocation - bypassing all cooldowns and thresholds');
        
        // Store the prompt for "Copy to Chat" functionality
        window.lastExplicitAshPrompt = `Please provide brief writing feedback or encouragement for the current document. The user has explicitly requested your assistance.`;
        
        // Get current document content for analysis
        const currentContent = editor ? editor.getValue() : '';
        
        // Check if AI companion is available - try multiple global references
        let aiCompanion = null;
        
        if (window.aiCompanionManager && window.aiCompanionManager.feedbackSystem) {
            aiCompanion = window.aiCompanionManager;
            console.log('[renderer.js] Found aiCompanionManager on window');
        } else if (window.aiCompanion && window.aiCompanion.feedbackSystem) {
            aiCompanion = window.aiCompanion;
            console.log('[renderer.js] Found aiCompanion on window');
        } else if (window.gamificationManager && window.gamificationManager.aiCompanion) {
            aiCompanion = window.gamificationManager.aiCompanion;
            console.log('[renderer.js] Found aiCompanion via gamificationManager');
        } else {
            console.warn('[renderer.js] ⚠️ AI companion system not available. Checking window properties:', {
                aiCompanionManager: !!window.aiCompanionManager,
                aiCompanion: !!window.aiCompanion,
                gamificationManager: !!window.gamificationManager,
                gamificationManagerAiCompanion: !!(window.gamificationManager && window.gamificationManager.aiCompanion),
                windowKeys: Object.keys(window).filter(k => k.toLowerCase().includes('ai') || k.toLowerCase().includes('companion')),
                allRelevantKeys: Object.keys(window).filter(k => k.toLowerCase().includes('ai') || k.toLowerCase().includes('companion') || k.toLowerCase().includes('gamif'))
            });
            
            // Try to trigger AI companion initialization if gamification manager exists
            if (window.gamificationManager && !window.gamificationManager.aiCompanion) {
                console.log('[renderer.js] Gamification manager exists but no AI companion - attempting initialization');
                try {
                    if (typeof window.gamificationManager.initializeAICompanion === 'function') {
                        await window.gamificationManager.initializeAICompanion();
                        if (window.gamificationManager.aiCompanion) {
                            aiCompanion = window.gamificationManager.aiCompanion;
                            console.log('[renderer.js] ✅ Successfully initialized AI companion via gamification manager');
                        }
                    }
                } catch (error) {
                    console.error('[renderer.js] Failed to initialize AI companion:', error);
                }
            }
        }
        
        if (aiCompanion && aiCompanion.feedbackSystem) {
            console.log('[renderer.js] Using AI companion system for explicit invocation');
            
            // Create analysis object with current content
            const analysis = {
                fullDocumentText: currentContent,
                lastSentence: currentContent.split('.').pop()?.trim() || '',
                recentText: currentContent.slice(-500), // Last 500 chars
                isExplicitInvocation: true // Flag to bypass cooldowns
            };
            
            // Call feedback system directly, bypassing normal checks
            const feedback = await aiCompanion.feedbackSystem.generateExplicitFeedback(analysis);
            
            if (feedback && feedback.message) {
                console.log('[renderer.js] ✅ Explicit feedback generated:', feedback.message);
                // Display feedback in chat pane
                if (typeof displayAIMessage === 'function') {
                    displayAIMessage(feedback.message, feedback.persona || 'Ash');
                } else {
                    // Fallback: show in console and try to show in UI
                    console.log('[renderer.js] 💬 Ash says:', feedback.message);
                    // Convert Markdown to HTML and show in styled notification
                    let convertedMessage = feedback.message;
                    
                    // Convert Markdown to HTML if marked is available
                    if (window.marked || markedInstance) {
                        const markdownParser = window.marked || markedInstance;
                        try {
                            convertedMessage = markdownParser.parse(feedback.message);
                            // Remove wrapping <p> tags if present
                            convertedMessage = convertedMessage.replace(/^<p>|<\/p>$/g, '');
                        } catch (error) {
                            console.warn('[renderer.js] Failed to parse markdown:', error);
                            // Fallback to simple replacements
                            convertedMessage = feedback.message
                                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                                .replace(/`(.*?)`/g, '<code>$1</code>')
                                .replace(/\n/g, '<br>');
                        }
                    } else {
                        // Simple Markdown-to-HTML conversions if marked not available
                        convertedMessage = feedback.message
                            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                            .replace(/\*(.*?)\*/g, '<em>$1</em>')
                            .replace(/`(.*?)`/g, '<code>$1</code>')
                            .replace(/\n/g, '<br>');
                    }
                    
                    // Create asynchronous-style popup
                    showAsyncStyleFeedback(feedback.message, 'Ash', 'explicit_feedback');
                }
            } else {
                console.warn('[renderer.js] ⚠️ No feedback generated from explicit invocation');
            }
        } else {
            console.warn('[renderer.js] ⚠️ AI companion system not available - trying direct fallback');
            // Fallback: Try to call AI service directly
            try {
                const response = await window.electronAPI.invoke('ai-chat', {
                    message: `Please provide brief writing feedback or encouragement for the current document. The user has explicitly requested your assistance.`,
                    options: {
                        context: 'explicit_ash_invocation',
                        newConversation: true
                    }
                });
                
                if (response && response.response) {
                    console.log('[renderer.js] ✅ Direct AI response:', response.response);
                    if (typeof displayAIMessage === 'function') {
                        displayAIMessage(response.response, 'Ash');
                    } else {
                        console.log('[renderer.js] 💬 Ash says:', response.response);
                        // Convert Markdown to HTML and show in styled notification
                        let convertedMessage = response.response;
                        
                        // Convert Markdown to HTML if marked is available
                        if (window.marked || markedInstance) {
                            const markdownParser = window.marked || markedInstance;
                            try {
                                convertedMessage = markdownParser.parse(response.response);
                                // Remove wrapping <p> tags if present
                                convertedMessage = convertedMessage.replace(/^<p>|<\/p>$/g, '');
                            } catch (error) {
                                console.warn('[renderer.js] Failed to parse markdown:', error);
                                // Fallback to simple replacements
                                convertedMessage = response.response
                                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                    .replace(/\*(.*?)\*/g, '<em>$1</em>')
                                    .replace(/`(.*?)`/g, '<code>$1</code>')
                                    .replace(/\n/g, '<br>');
                            }
                        } else {
                            // Simple Markdown-to-HTML conversions if marked not available
                            convertedMessage = response.response
                                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                                .replace(/`(.*?)`/g, '<code>$1</code>')
                                .replace(/\n/g, '<br>');
                        }
                        
                        // Create asynchronous-style popup
                        showAsyncStyleFeedback(response.response, 'Ash', 'explicit_feedback');
                    }
                } else {
                    console.warn('[renderer.js] ⚠️ No response from direct AI call');
                }
            } catch (error) {
                console.error('[renderer.js] ❌ Direct AI call failed:', error);
            }
        }
    } catch (error) {
        console.error('[renderer.js] ❌ Failed to invoke Ash explicitly:', error);
    }
}

// Initialize the application 
async function performAppInitialization() {
    console.log('[renderer.js] *** performAppInitialization() CALLED ***');
    console.log('[renderer.js] Current timestamp:', new Date().toISOString());
    console.log('[renderer.js] DOM fully loaded and parsed.');
    console.log('[renderer.js] window.marked available:', !!window.marked);
    // Load settings before initializing the rest of the app
    await loadAppSettings();
    // Since Marked script has 'defer', it should be loaded and executed before DOMContentLoaded.
    // Let's check if window.marked exists now.
    if (window.marked) {
        console.log('[renderer.js] window.marked found after DOMContentLoaded.');
        markedInstance = window.marked; // Assign the globally loaded instance
        markedInstance.setOptions({
            breaks: true,
            gfm: true,
            headerIds: false,
            mangle: false
        });
        console.log('[renderer.js] Marked instance configured.');
        applyLayoutSettings(appSettings.layout); // Apply saved layout settings
        
        // Initialize gamification system
        console.log('[renderer.js] Checking for gamification system...');
        console.log('[renderer.js] window.gamification exists:', !!window.gamification);
        console.log('[renderer.js] GamificationManager class exists:', typeof GamificationManager !== 'undefined');
        
        if (!window.gamification && typeof GamificationManager !== 'undefined') {
            try {
                console.log('[renderer.js] Creating GamificationManager...');
                window.gamification = new GamificationManager();
                window.gamificationManager = window.gamification; // For compatibility
                window.gamificationInstance = window.gamification; // For legacy code compatibility
                
                // Call initialize method
                if (typeof window.gamification.initialize === 'function') {
                    setTimeout(() => {
                        console.log('[renderer.js] Calling gamification.initialize()...');
                        window.gamification.initialize();
                    }, 200);
                }
                
                console.log('[renderer.js] Gamification system initialized successfully');
            } catch (error) {
                console.error('[renderer.js] Error initializing gamification:', error);
            }
        } else if (window.gamification) {
            console.log('[renderer.js] Gamification system already initialized');
        } else {
            console.warn('[renderer.js] GamificationManager class not available');
        }
        
        // Initialize AI TODO suggestions toolbar button
        const aiTodoBtn = document.getElementById('ai-todo-suggestions-btn');
        if (aiTodoBtn) {
            aiTodoBtn.addEventListener('click', () => {
                console.log('[renderer.js] AI TODO suggestions button clicked');
                const gamification = window.gamification || window.gamificationInstance;
                if (gamification && gamification.todoGamification) {
                    gamification.todoGamification.generateAISuggestionsNow();
                } else {
                    console.warn('[renderer.js] TODO gamification not available');
                    if (window.showNotification) {
                        window.showNotification('TODO gamification not initialized. Please open a TODO file first.', 'warning');
                    }
                }
            });
            console.log('[renderer.js] AI TODO suggestions button handler added');
        } else {
            console.warn('[renderer.js] AI TODO suggestions button not found');
        }
        
        console.log('[renderer.js] *** ABOUT TO CALL initializeMonacoEditor() ***');
        try {
            await initializeMonacoEditor(); // Initialize now that Marked is ready and DOM is loaded
            console.log('[renderer.js] *** initializeMonacoEditor() COMPLETED SUCCESSFULLY ***');
        } catch (initError) {
            console.error('[renderer.js] *** ERROR in initializeMonacoEditor() ***:', initError);
            console.error('[renderer.js] *** initializeMonacoEditor() ERROR STACK ***:', initError.stack);
        }
        
        setupNavigationControls(); // Setup navigation buttons and keyboard shortcuts
        
        // Initialize file tree view on startup
        switchStructureView('file'); // Switch to file view (this will also render the tree)
    } else {
        // If Marked is still not loaded here, there's a problem with the script tag or network.
        console.error('[renderer.js] CRITICAL: window.marked not found after DOMContentLoaded. Check Marked script tag in index.html and network connection.');
        console.log('[renderer.js] Initializing Monaco editor anyway to fix editor issue...');
        
        // Initialize the app even without marked - the Monaco editor should still work
        // Preview functionality will be limited but editor will be functional
        applyLayoutSettings(appSettings.layout); // Apply saved layout settings
        
        console.log('[renderer.js] *** ABOUT TO CALL initializeMonacoEditor() (no marked fallback) ***');
        try {
            await initializeMonacoEditor(); // Initialize the Monaco editor
            console.log('[renderer.js] *** initializeMonacoEditor() COMPLETED SUCCESSFULLY (no marked fallback) ***');
        } catch (initError) {
            console.error('[renderer.js] *** ERROR in initializeMonacoEditor() (no marked fallback) ***:', initError);
            console.error('[renderer.js] *** initializeMonacoEditor() ERROR STACK (no marked fallback) ***:', initError.stack);
        }
        
        setupNavigationControls(); // Setup navigation buttons and keyboard shortcuts
        
        // Initialize file tree view on startup
        switchStructureView('file'); // Switch to file view (this will also render the tree)
    }
    
    // Initialize AI Chat functionality
    if (window.initializeChatFunctionality) {
        console.log('[renderer.js] Initializing AI Chat functionality...');
        window.initializeChatFunctionality();
    } else {
        console.warn('[renderer.js] AI Chat initialization function not found');
    }
    
    // Initialize Export handlers
    if (window.initializeExportHandlers) {
        console.log('[renderer.js] Initializing export handlers...');
        window.initializeExportHandlers();
    } else {
        console.warn('[renderer.js] Export handlers initialization function not found');
    }
}

// Emergency fallback - create a basic editor immediately if nothing else works
function createEmergencyEditor() {
    console.log('[renderer.js] Creating emergency fallback editor...');
    const editorContainer = document.getElementById('editor-container');
    if (editorContainer && !window.editor && !fallbackEditor) {
        const textarea = document.createElement('textarea');
        textarea.style.width = '100%';
        textarea.style.height = '100%';
        textarea.style.border = 'none';
        textarea.style.padding = '10px';
        textarea.style.fontFamily = 'monospace';
        textarea.style.fontSize = '14px';
        textarea.value = '# Emergency Editor\n\nThe main editor failed to load. This is a basic fallback.';
        
        editorContainer.innerHTML = '';
        editorContainer.appendChild(textarea);
        
        window.editor = {
            getValue: () => textarea.value,
            setValue: (value) => { textarea.value = value; },
            getModel: () => null,
            layout: () => {},
            focus: () => textarea.focus(),
            onKeyDown: () => {}, // Stub for listManagement.js
            onDidChangeModelContent: (callback) => {
                // Track previous content for AI companion integration
                let previousEmergencyContent = textarea.value;
                
                const wrappedCallback = (event) => {
                    const currentContent = textarea.value;
                    
                    // Process content changes for AI writing companion
                    if (window.aiCompanion && typeof window.aiCompanion.processNewWriting === 'function') {
                        // Detect new text added
                        if (currentContent.length > previousEmergencyContent.length) {
                            const newText = currentContent.slice(previousEmergencyContent.length);
                            if (newText.length > 0) {
                                window.aiCompanion.processNewWriting(newText);
                            }
                        }
                    }
                    
                    // Update for next change detection
                    previousEmergencyContent = currentContent;
                    
                    // Call the original callback
                    callback(event);
                };
                
                textarea.addEventListener('input', wrappedCallback);
                return { dispose: () => {} };
            },
            getPosition: () => ({ lineNumber: 1, column: 1 }),
            setPosition: () => {},
            revealLineInCenter: () => {},
            updateOptions: () => {},
            dispose: () => {}
        };
        
        console.log('[renderer.js] Emergency editor created successfully');
        return true;
    }
    return false;
}

// Try emergency editor after a delay if nothing else worked
setTimeout(() => {
    if (!window.editor && !fallbackEditor) {
        console.log('[renderer.js] No editor detected after 3 seconds, creating emergency editor...');
        createEmergencyEditor();
    }
}, 3000);

// Wait for the DOM to be fully loaded before trying to initialize
console.log('[renderer.js] *** Checking document.readyState:', document.readyState, ' ***');
if (document.readyState === 'loading') {
    // DOM hasn't finished loading yet
    console.log('[renderer.js] DOM still loading, waiting for DOMContentLoaded...');
    document.addEventListener('DOMContentLoaded', performAppInitialization);
} else {
    // DOM has already finished loading
    console.log('[renderer.js] DOM already loaded, initializing immediately...');
    try {
        performAppInitialization();
    } catch (error) {
        console.error('[renderer.js] ERROR in performAppInitialization:', error);
        // Try emergency editor if main initialization fails
        setTimeout(createEmergencyEditor, 1000);
    }
}

// --- Apply Layout Settings Function ---
function applyLayoutSettings(layout) {
    
    // Check if we're in editor mode before applying layout
    const editorContent = document.getElementById('editor-content');
    if (!editorContent || !editorContent.classList.contains('active')) {
        console.log('[renderer.js] Not in editor mode, skipping layout application.');
        return;
    }
    
    const leftSidebar = document.getElementById('left-sidebar');
    const editorPane = document.getElementById('editor-pane');
    const rightPane = document.getElementById('right-pane');
    const container = editorContent; // Use editor content as container

    if (!leftSidebar || !editorPane || !rightPane) {
        console.error('[renderer.js] Cannot apply layout: one or more pane elements not found in editor mode.');
        return;
    }

    // Use default layout if settings are invalid or missing
    const defaultLayout = { structureWidth: '20%', editorWidth: '50%', rightWidth: '30%' };
    const effectiveLayout = {
        structureWidth: layout?.structureWidth || defaultLayout.structureWidth,
        editorWidth: layout?.editorWidth || defaultLayout.editorWidth,
        rightWidth: layout?.rightWidth || defaultLayout.rightWidth
    };

    // Basic validation: ensure they look like percentages
    const isValid = (val) => typeof val === 'string' && /^\d+(\.\d+)?%$/.test(val);

    if (isValid(effectiveLayout.structureWidth) && 
        isValid(effectiveLayout.editorWidth) && 
        isValid(effectiveLayout.rightWidth)) {

        // Ensure percentages roughly add up to 100% (allow for minor rounding)
        const totalPercent = parseFloat(effectiveLayout.structureWidth) + 
                             parseFloat(effectiveLayout.editorWidth) + 
                             parseFloat(effectiveLayout.rightWidth);

        if (totalPercent < 95 || totalPercent > 105) {
            // Only warn for major discrepancies (5% threshold instead of 2%)
            leftSidebar.style.flex = `0 0 ${defaultLayout.structureWidth}`;
            editorPane.style.flex = `0 0 ${defaultLayout.editorWidth}`;
            rightPane.style.flex = `0 0 ${defaultLayout.rightWidth}`;
        } else {
            // Apply layout without excessive logging for minor variations
            leftSidebar.style.flex = `0 0 ${effectiveLayout.structureWidth}`;
            editorPane.style.flex = `0 0 ${effectiveLayout.editorWidth}`;
            rightPane.style.flex = `0 0 ${effectiveLayout.rightWidth}`;
        }
    } else {
        console.warn('[renderer.js] Invalid layout format found in settings. Using defaults.');
        leftSidebar.style.flex = `0 0 ${defaultLayout.structureWidth}`;
        editorPane.style.flex = `0 0 ${defaultLayout.editorWidth}`;
        rightPane.style.flex = `0 0 ${defaultLayout.rightWidth}`;
    }
}

// --- Settings Management ---
let appSettings = {};


// --- Structure/File Pane Toggle Listeners ---
let currentStructureView = 'file'; // 'structure' or 'file' - default to files

showStructureBtn.addEventListener('click', () => {
    if (currentStructureView !== 'structure') {
        switchStructureView('structure');
    }
});

showFilesBtn.addEventListener('click', () => {
    if (currentStructureView !== 'file') {
        switchStructureView('file');
    }
});

// Search button event listener - handled in search.js module
const searchBtn = document.getElementById('show-search-btn');
if (searchBtn) {
    searchBtn.addEventListener('click', () => {
        if (currentStructureView !== 'search') {
            switchStructureView('search');
        }
    });
}

// --- New Folder Button Listener ---
newFolderBtn.addEventListener('click', async () => {
    console.log('[Renderer] New Folder button clicked');
    await createNewFolder();
});

// --- Change Directory Button Listener ---
changeDirectoryBtn.addEventListener('click', async () => {
    console.log('[Renderer] Change Directory button clicked');
    try {
        const result = await window.electronAPI.invoke('change-working-directory');
        if (result.success) {
            showNotification(`Working directory changed`, 'success');
            // Refresh file tree to show new directory contents
            renderFileTree();
        } else if (!result.error.includes('cancelled')) {
            showNotification(result.error, 'error');
        }
    } catch (error) {
        console.error('[Renderer] Error changing directory:', error);
        showNotification('Error changing working directory', 'error');
    }
});

// --- Find & Replace Event Listeners ---
findReplaceClose.addEventListener('click', hideFindReplaceDialog);

// Button event listeners
findNextEl.addEventListener('click', findNext);
findPreviousEl.addEventListener('click', findPrevious);
replaceCurrent.addEventListener('click', replaceNext);
replaceAllEl.addEventListener('click', replaceAll);

// Input event listeners
findInput.addEventListener('input', performSearch);
findInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) {
            findPrevious();
        } else {
            findNext();
        }
    } else if (e.key === 'Escape') {
        hideFindReplaceDialog();
    }
});

replaceInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        replaceNext();
    } else if (e.key === 'Escape') {
        hideFindReplaceDialog();
    }
});

// Option change listeners
caseSensitive.addEventListener('change', performSearch);
regexMode.addEventListener('change', performSearch);
wholeWord.addEventListener('change', performSearch);

// --- Folder Name Modal Event Listeners ---
folderNameCancel.addEventListener('click', hideFolderNameModal);
folderNameCreate.addEventListener('click', handleCreateFolder);

// Handle Enter key in folder name input
folderNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        handleCreateFolder();
    } else if (e.key === 'Escape') {
        e.preventDefault();
        hideFolderNameModal();
    }
});

// Hide modal when clicking on backdrop
folderNameModal.addEventListener('click', (e) => {
    if (e.target === folderNameModal) {
        hideFolderNameModal();
    }
});

// Clear validation error when typing
folderNameInput.addEventListener('input', () => {
    if (folderNameError.style.display !== 'none') {
        hideFolderNameError();
    }
});

// --- Right Pane Toggle Listeners (Updated to use unified function) ---
showPreviewBtn.addEventListener('click', () => {
    showRightPane('preview');
});

showChatBtn.addEventListener('click', () => {
    showRightPane('chat');
});

showWholepartBtn.addEventListener('click', () => {
    showRightPane('wholepart');
});

// --- Right Pane Switching Function ---
// Helper functions for right pane management
function debugToggleButtonsVisibility(toggleButtons, phase) {
    if (!toggleButtons) return;
    
    console.log(`[DEBUG] Right pane toggle buttons ${phase} - display:`, window.getComputedStyle(toggleButtons).display);
    console.log(`[DEBUG] Right pane toggle buttons ${phase} - visibility:`, window.getComputedStyle(toggleButtons).visibility);
    console.log(`[DEBUG] Right pane toggle buttons ${phase} - parent:`, toggleButtons.parentElement);
}

function hideAllRightPanes() {
    const panes = [
        { element: previewPane, name: 'preview' },
        { element: chatPane, name: 'chat' },
        { element: wholepartPane, name: 'wholepart' },
        { element: document.getElementById('search-pane'), name: 'search' },
        { element: document.getElementById('speaker-notes-pane'), name: 'speaker-notes' }
    ];
    
    panes.forEach(({ element }) => {
        if (element) {
            element.style.display = 'none';
            element.classList.add('pane-hidden');
        }
    });
}

function deactivateAllToggleButtons() {
    const buttons = [
        showPreviewBtn,
        showChatBtn,
        showWholepartBtn,
        document.getElementById('show-search-btn'),
        document.getElementById('show-speaker-notes-btn')
    ];
    
    buttons.forEach(btn => {
        if (btn) btn.classList.remove('active');
    });
}

function showSpecificPane(paneType) {
    switch (paneType) {
        case 'preview':
            if (previewPane) {
                previewPane.style.display = '';
                previewPane.classList.remove('pane-hidden');
            }
            if (showPreviewBtn) showPreviewBtn.classList.add('active');
            break;
        case 'chat':
            if (chatPane) {
                chatPane.style.display = '';
                chatPane.classList.remove('pane-hidden');
            }
            if (showChatBtn) showChatBtn.classList.add('active');
            break;
        case 'search':
            const searchPane = document.getElementById('search-pane');
            if (searchPane) {
                searchPane.style.display = '';
                searchPane.classList.remove('pane-hidden');
            }
            if (searchBtn) searchBtn.classList.add('active');
            break;
        case 'speaker-notes':
            const speakerNotesPane = document.getElementById('speaker-notes-pane');
            if (speakerNotesPane) {
                speakerNotesPane.style.display = '';
                speakerNotesPane.classList.remove('pane-hidden');
            }
            const showSpeakerNotesBtn = document.getElementById('show-speaker-notes-btn');
            if (showSpeakerNotesBtn) showSpeakerNotesBtn.classList.add('active');
            updateSpeakerNotesDisplay();
            break;
        case 'wholepart':
            if (wholepartPane) {
                wholepartPane.style.display = '';
                wholepartPane.classList.remove('pane-hidden');
            }
            if (showWholepartBtn) showWholepartBtn.classList.add('active');
            if (window.initializeWholepartVisualization) {
                window.initializeWholepartVisualization();
            }
            break;
        default:
            // Default to preview if unknown pane type
            if (previewPane) {
                previewPane.style.display = '';
                previewPane.classList.remove('pane-hidden');
            }
            if (showPreviewBtn) showPreviewBtn.classList.add('active');
            break;
    }
}

function debugDetailedToggleButtonsInfo(toggleButtons) {
    if (!toggleButtons) return;
    
    console.log('[DEBUG] Right pane toggle buttons after switch - display:', window.getComputedStyle(toggleButtons).display);
    console.log('[DEBUG] Right pane toggle buttons after switch - visibility:', window.getComputedStyle(toggleButtons).visibility);
    console.log('[DEBUG] Right pane toggle buttons after switch - parent:', toggleButtons.parentElement);
    console.log('[DEBUG] Right pane toggle buttons after switch - style:', toggleButtons.style.cssText);
    
    // Check the actual position and size
    const rect = toggleButtons.getBoundingClientRect();
    console.log('[DEBUG] Toggle buttons position/size:', {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        bottom: rect.bottom,
        right: rect.right
    });
    
    // Check viewport dimensions
    console.log('[DEBUG] Viewport dimensions:', {
        width: window.innerWidth,
        height: window.innerHeight
    });
    
    // Check if it's actually visible in viewport
    const isInViewport = rect.top >= 0 && rect.left >= 0 && 
                       rect.bottom <= window.innerHeight && 
                       rect.right <= window.innerWidth;
    console.log('[DEBUG] Toggle buttons in viewport:', isInViewport);
    
    // Check the right pane itself
    const rightPane = document.getElementById('right-pane');
    if (rightPane) {
        const rightPaneRect = rightPane.getBoundingClientRect();
        console.log('[DEBUG] Right pane position/size:', {
            top: rightPaneRect.top,
            left: rightPaneRect.left,
            width: rightPaneRect.width,
            height: rightPaneRect.height
        });
    }
    
    // Check z-index and positioning
    const computedStyle = window.getComputedStyle(toggleButtons);
    console.log('[DEBUG] Toggle buttons computed style:', {
        position: computedStyle.position,
        zIndex: computedStyle.zIndex,
        transform: computedStyle.transform,
        opacity: computedStyle.opacity,
        overflow: computedStyle.overflow
    });
    
    // Check if anything is covering the buttons
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const elementAtCenter = document.elementFromPoint(centerX, centerY);
    console.log('[DEBUG] Element at toggle buttons center:', elementAtCenter);
    
    // Check the buttons themselves
    const buttons = toggleButtons.querySelectorAll('button');
    console.log('[DEBUG] Number of buttons found:', buttons.length);
    buttons.forEach((btn, index) => {
        const btnRect = btn.getBoundingClientRect();
        console.log(`[DEBUG] Button ${index} (${btn.textContent}):`, {
            visible: btnRect.width > 0 && btnRect.height > 0,
            position: { top: btnRect.top, left: btnRect.left, width: btnRect.width, height: btnRect.height }
        });
    });
}

function showRightPane(paneType) {
    console.log('[DEBUG] showRightPane called with:', paneType);
    
    const toggleButtons = document.querySelector('#right-pane .toggle-buttons');
    debugToggleButtonsVisibility(toggleButtons, 'before switch');
    
    hideAllRightPanes();
    deactivateAllToggleButtons();
    showSpecificPane(paneType);
    
    debugDetailedToggleButtonsInfo(toggleButtons);
}

// --- Structure Pane / File Tree Functions ---

/**
 * Switches the view in the structure pane between 'structure', 'file', and 'search'.
 * @param {'structure' | 'file' | 'search'} view - The view to switch to.
 */
function switchStructureView(view) {
    currentStructureView = view;
    
    // Get elements
    const fileTreeView = document.getElementById('file-tree-view');
    const searchPane = document.getElementById('search-pane');
    
    // Reset all button states and hide all views
    showStructureBtn.classList.remove('active');
    showFilesBtn.classList.remove('active');
    if (searchBtn) searchBtn.classList.remove('active');
    
    structureList.style.display = 'none';
    if (fileTreeView) fileTreeView.style.display = 'none';
    if (searchPane) searchPane.style.display = 'none';
    if (tagSearchSection) tagSearchSection.style.display = 'none';
    newFolderBtn.style.display = 'none';
    changeDirectoryBtn.style.display = 'none';
    
    if (view === 'structure') {
        structurePaneTitle.textContent = 'Structure';
        showStructureBtn.classList.add('active');
        structureList.style.display = ''; // Show structure list
        // Optionally, re-run structure update if needed
        // updateStructurePane(editor?.getValue() || '');
    } else if (view === 'file') {
        structurePaneTitle.textContent = 'Files';
        showFilesBtn.classList.add('active');
        if (fileTreeView) fileTreeView.style.display = ''; // Show file tree
        if (tagSearchSection) tagSearchSection.style.display = ''; // Show tag search
        newFolderBtn.style.display = ''; // Show New Folder button
        changeDirectoryBtn.style.display = ''; // Show Change Directory button
        
        // Initialize tag filtering system
        initializeTagFiltering();
        
        // Only render file tree if it hasn't been rendered yet
        if (!fileTreeRendered && !isRenderingFileTree) {
            renderFileTree(); // Populate the file tree view
            // Note: fileTreeRendered is set to true inside renderFileTree after successful render
        }
    } else if (view === 'search') {
        structurePaneTitle.textContent = 'Search';
        if (searchBtn) searchBtn.classList.add('active');
        if (searchPane) searchPane.style.display = 'block'; // Show search pane
    }
}

// --- File Tree Functions ---
// Global state for tracking expanded folders
window.expandedFolders = window.expandedFolders || new Set();

async function renderFileTree() {
    console.log('[renderFileTree] Starting file tree render');
    
    // Prevent concurrent renders
    if (isRenderingFileTree) {
        console.log('[renderFileTree] Already rendering, skipping duplicate render');
        return;
    }
    
    if (!window.electronAPI) {
        console.warn('[renderFileTree] ElectronAPI not available');
        return;
    }
    
    const fileTreeView = document.getElementById('file-tree-view');
    
    try {
        // Set rendering flag
        isRenderingFileTree = true;
        
        const fileTree = await window.electronAPI.invoke('request-file-tree');
        
        if (!fileTreeView) {
            console.warn('[renderFileTree] fileTreeView element not found');
            isRenderingFileTree = false;
            return;
        }
        
        // Clear existing content - double check it's still the file tree view
        if (fileTreeView.id === 'file-tree-view') {
            fileTreeView.innerHTML = '';
        }
        
        // Mark tree as rendered
        fileTreeRendered = true;
        
        // Render the file tree
        if (fileTree && fileTree.children) {
            // Auto-expand the root directory and common folders on first load
            if (window.expandedFolders.size === 0) {
                expandCommonFolders(fileTree);
            }
            
            // Pre-process tags for visible markdown files
            await preProcessMarkdownTags(fileTree);
            
            renderFileTreeNode(fileTree, fileTreeView, 0);
        } else {
            fileTreeView.innerHTML = '<div class="no-files">No files found</div>';
        }
        
        
        // Update available files for autocomplete
        updateAvailableFiles();
    } catch (error) {
        console.error('[renderFileTree] Error loading file tree:', error);
        if (fileTreeView) {
            fileTreeView.innerHTML = '<div class="error">Error loading files</div>';
        }
    } finally {
        // Always clear the rendering flag
        isRenderingFileTree = false;
        console.log('[renderFileTree] Render complete');
    }
}

function renderFileTreeNode(node, container, depth) {
    console.log(`[renderFileTreeNode] Rendering ${node.type}: ${node.name} at depth ${depth}`);
    const nodeElement = document.createElement('div');
    nodeElement.className = 'file-tree-item';
    nodeElement.style.paddingLeft = `${depth * 16}px`;
    
    const isFolder = node.type === 'folder' || node.type === 'directory';
    const hasChildren = isFolder && node.children && node.children.length > 0;
    const isExpanded = window.expandedFolders.has(node.path);
    
    // Create expand/collapse arrow for folders with children
    let expandArrow = '';
    if (hasChildren) {
        expandArrow = `<span class="expand-arrow" style="margin-right: 4px; cursor: pointer; user-select: none;">${isExpanded ? '▼' : '▶'}</span>`;
    } else if (isFolder) {
        expandArrow = '<span style="margin-right: 12px;"></span>'; // Spacing for empty folders
    }
    
    const icon = isFolder ? '📁' : '📄';
    const fileName = node.name;
    
    // Get tags for markdown files
    let tagsDisplay = '';
    if (!isFolder && node.name.endsWith('.md') && window.tagManager) {
        const fileTags = window.tagManager.getFileTags(node.path);
        if (fileTags && fileTags.length > 0) {
            const tagElements = fileTags.slice(0, 3).map(tag => 
                `<span class="file-tag">${tag}</span>`
            ).join('');
            const moreCount = fileTags.length > 3 ? ` +${fileTags.length - 3}` : '';
            tagsDisplay = `<div class="file-tags">${tagElements}${moreCount}</div>`;
        }
    }
    
    nodeElement.innerHTML = `
        <div class="file-tree-main">
            ${expandArrow}
            <span class="file-icon">${icon}</span>
            <span class="file-name">${fileName}</span>
        </div>
        ${tagsDisplay}
    `;
    
    // Add appropriate classes and properties
    if (isFolder) {
        nodeElement.classList.add('folder');
        nodeElement.dataset.path = node.path;
        nodeElement.draggable = true;
        
        // Add click handler for folders to toggle expand/collapse
        nodeElement.addEventListener('click', (event) => {
            event.preventDefault();
            if (hasChildren) {
                toggleFolderExpansion(node.path);
                // Reset the flag to allow re-render
                fileTreeRendered = false;
                debouncedRenderFileTree(); // Use debounced version to prevent rapid re-renders
            }
        });
        
        // Add context menu for folders
        nodeElement.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            console.log(`[renderFileTree] Context menu requested for folder: ${node.path}`);
            showFileContextMenu(event, node.path, true);
        });
    } else {
        nodeElement.classList.add('file', 'file-clickable');
        nodeElement.dataset.path = node.path;
        nodeElement.draggable = true;
        nodeElement.addEventListener('click', async () => {
            try {
                console.log(`[renderFileTree] Opening file: ${node.path}`);
                
                // Check if it's an image file
                const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', '.webp', '.ico'];
                const fileExtension = node.path.toLowerCase().substring(node.path.lastIndexOf('.'));
                
                if (imageExtensions.includes(fileExtension)) {
                    console.log(`[renderFileTree] Opening image file: ${node.path}`);
                    showImageViewer(node.path);
                } else {
                    // Regular file opening logic
                    const result = await window.electronAPI.invoke('open-file-path', node.path);
                    console.log(`[renderFileTree] IPC result:`, result);
                    if (result.success && window.openFileInEditor) {
                        console.log(`[renderFileTree] Calling openFileInEditor with:`, result.filePath, result.content ? result.content.substring(0, 100) + '...' : 'NO CONTENT');
                        await window.openFileInEditor(result.filePath, result.content);
                        console.log(`[renderFileTree] openFileInEditor completed`);
                    } else {
                        console.error(`[renderFileTree] Failed to open file:`, result.success ? 'openFileInEditor not available' : result.error);
                    }
                }
            } catch (error) {
                console.error('[renderFileTree] Error opening file:', error);
            }
        });
        
        // Add context menu for files
        nodeElement.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            console.log(`[renderFileTree] Context menu requested for file: ${node.path}`);
            showFileContextMenu(event, node.path, false);
        });
    }
    
    container.appendChild(nodeElement);
    
    // Render children only if it's a folder, has children, and is expanded
    if (hasChildren && isExpanded) {
        for (const child of node.children) {
            renderFileTreeNode(child, container, depth + 1);
        }
    }
}

// Function to toggle folder expansion state
function toggleFolderExpansion(folderPath) {
    if (window.expandedFolders.has(folderPath)) {
        window.expandedFolders.delete(folderPath);
        console.log(`[toggleFolderExpansion] Collapsed folder: ${folderPath}`);
    } else {
        window.expandedFolders.add(folderPath);
        console.log(`[toggleFolderExpansion] Expanded folder: ${folderPath}`);
    }
}

// Tag filtering variables
let activeTagFilters = new Set();
let tagFilteringInitialized = false;

// File tree rendering state
let fileTreeRendered = false;
let isRenderingFileTree = false;  // Prevent concurrent renders

// Debounce utility for file tree rendering
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Debounced version of renderFileTree
const debouncedRenderFileTree = debounce(renderFileTree, 100);

// Initialize tag filtering system
function initializeTagFiltering() {
    if (tagFilteringInitialized) return;
    tagFilteringInitialized = true;
    
    if (!tagSearchInput || !tagFilterChips) return;
    
    // Set up search input with autocomplete
    tagSearchInput.addEventListener('input', handleTagSearchInput);
    tagSearchInput.addEventListener('keydown', handleTagSearchKeydown);
    
    console.log('[TagFiltering] Tag filtering system initialized');
}

// Handle tag search input (supports both name and tag filtering)
function handleTagSearchInput(event) {
    const query = event.target.value.trim();
    
    if (query.length === 0) {
        // Clear any autocomplete suggestions and reset file display
        clearTagSuggestions();
        applyNameAndTagFilters('');
        return;
    }
    
    // Apply real-time name filtering as user types
    applyNameAndTagFilters(query);
    
    if (query.length >= 2 && window.tagManager) {
        // Show tag suggestions
        showTagSuggestions(query);
    }
}

// Handle keyboard events in tag search
function handleTagSearchKeydown(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        const query = event.target.value.trim();
        if (query) {
            // Try to add as a tag filter if it matches existing tags
            if (window.tagManager && window.tagManager.searchTags(query).includes(query)) {
                addTagFilter(query);
                event.target.value = '';
                clearTagSuggestions();
            }
            // If not a tag, just keep the current name/tag filtering active
        }
    } else if (event.key === 'Escape') {
        event.target.value = '';
        clearTagSuggestions();
        applyNameAndTagFilters(''); // Reset filters
        event.target.blur();
    }
}

// Show tag suggestions
function showTagSuggestions(query) {
    if (!window.tagManager) return;
    
    const suggestions = window.tagManager.searchTags(query);
    
    // Remove any existing suggestions
    clearTagSuggestions();
    
    if (suggestions.length === 0) return;
    
    // Create suggestion dropdown
    const dropdown = document.createElement('div');
    dropdown.id = 'tag-suggestions';
    dropdown.style.cssText = `
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        background: var(--neutral-0);
        border: 1px solid var(--neutral-300);
        border-radius: 4px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        z-index: 1000;
        max-height: 150px;
        overflow-y: auto;
    `;
    
    suggestions.slice(0, 8).forEach(({ tag, count }) => {
        const item = document.createElement('div');
        item.style.cssText = `
            padding: 6px 8px;
            cursor: pointer;
            border-bottom: 1px solid var(--neutral-100);
            font-size: 11px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        `;
        item.innerHTML = `
            <span>${tag}</span>
            <span style="opacity: 0.6; font-size: 10px;">${count} file${count !== 1 ? 's' : ''}</span>
        `;
        
        item.addEventListener('click', () => {
            addTagFilter(tag);
            tagSearchInput.value = '';
            clearTagSuggestions();
        });
        
        item.addEventListener('mouseenter', () => {
            item.style.backgroundColor = 'var(--primary-100)';
        });
        
        item.addEventListener('mouseleave', () => {
            item.style.backgroundColor = '';
        });
        
        dropdown.appendChild(item);
    });
    
    // Position dropdown relative to search input
    tagSearchInput.style.position = 'relative';
    tagSearchInput.parentNode.style.position = 'relative';
    tagSearchInput.parentNode.appendChild(dropdown);
}

// Clear tag suggestions
function clearTagSuggestions() {
    const existing = document.getElementById('tag-suggestions');
    if (existing) {
        existing.remove();
    }
}

// Add a tag filter
function addTagFilter(tag) {
    if (activeTagFilters.has(tag)) return;
    
    activeTagFilters.add(tag);
    updateTagFilterChips();
    applyTagFilters();
}

// Remove a tag filter
function removeTagFilter(tag) {
    activeTagFilters.delete(tag);
    updateTagFilterChips();
    applyTagFilters();
}

// Update the visual tag filter chips
function updateTagFilterChips() {
    if (!tagFilterChips) return;
    
    tagFilterChips.innerHTML = '';
    
    activeTagFilters.forEach(tag => {
        const chip = document.createElement('div');
        chip.className = 'tag-chip active';
        chip.innerHTML = `
            <span>${tag}</span>
            <span class="tag-chip-remove" data-tag="${tag}">×</span>
        `;
        
        // Add remove handler
        chip.querySelector('.tag-chip-remove').addEventListener('click', (e) => {
            e.stopPropagation();
            removeTagFilter(tag);
        });
        
        tagFilterChips.appendChild(chip);
    });
}

// Apply tag filters to file tree
function applyTagFilters() {
    if (!fileTreeView || !window.tagManager) return;
    
    const fileItems = fileTreeView.querySelectorAll('.file-tree-item');
    
    fileItems.forEach(item => {
        const filePath = item.dataset.path;
        const isFolder = item.classList.contains('folder');
        
        if (isFolder) {
            // Always show folders
            item.style.display = '';
            return;
        }
        
        if (!filePath || !filePath.endsWith('.md')) {
            // Show non-markdown files if no filters are active
            item.style.display = activeTagFilters.size === 0 ? '' : 'none';
            return;
        }
        
        if (activeTagFilters.size === 0) {
            // No filters, show all files
            item.style.display = '';
            return;
        }
        
        // Check if file matches any of the active tag filters
        const fileTags = window.tagManager.getFileTags(filePath);
        const matches = Array.from(activeTagFilters).some(filterTag => 
            fileTags.includes(filterTag)
        );
        
        item.style.display = matches ? '' : 'none';
    });
}

// Apply name and tag filters to file tree (real-time filtering)
function applyNameAndTagFilters(query) {
    if (!fileTreeView) return;
    
    const fileItems = fileTreeView.querySelectorAll('.file-tree-item');
    
    fileItems.forEach(item => {
        const filePath = item.dataset.path;
        const isFolder = item.classList.contains('folder');
        
        if (isFolder) {
            // Always show folders
            item.style.display = '';
            return;
        }
        
        if (!filePath) {
            item.style.display = query.length === 0 ? '' : 'none';
            return;
        }
        
        // Extract filename from path
        const fileName = filePath.split('/').pop() || '';
        const fileNameNoExt = fileName.replace(/\.[^/.]+$/, ''); // Remove extension
        
        let matches = false;
        
        if (query.length === 0) {
            // No query, show all files (unless tag filters are active)
            matches = activeTagFilters.size === 0;
            if (activeTagFilters.size > 0 && filePath.endsWith('.md') && window.tagManager) {
                const fileTags = window.tagManager.getFileTags(filePath);
                matches = Array.from(activeTagFilters).some(filterTag => 
                    fileTags.includes(filterTag)
                );
            }
        } else {
            // Check filename match (case-insensitive)
            const nameMatch = fileNameNoExt.toLowerCase().includes(query.toLowerCase()) ||
                              fileName.toLowerCase().includes(query.toLowerCase());
            
            // Check tag match for markdown files
            let tagMatch = false;
            if (filePath.endsWith('.md') && window.tagManager) {
                const fileTags = window.tagManager.getFileTags(filePath);
                tagMatch = fileTags.some(tag => 
                    tag.toLowerCase().includes(query.toLowerCase())
                );
            }
            
            matches = nameMatch || tagMatch;
        }
        
        item.style.display = matches ? '' : 'none';
    });
}

// Show tag edit dialog for a markdown file
async function showTagEditDialog(filePath) {
    if (!window.tagManager || !window.electronAPI) {
        showNotification('Tag manager not available', 'error');
        return;
    }
    
    // Get current tags for the file
    const currentTags = window.tagManager.getFileTags(filePath);
    const metadata = window.tagManager.getFileMetadata(filePath);
    
    // Get all available tags from the system
    const allTags = window.tagManager.getAllTags();
    const availableTags = allTags
        .map(t => t.tag)
        .filter(tag => !currentTags.includes(tag))
        .slice(0, 20); // Limit to 20 most popular tags
    
    // Create dialog
    const dialog = document.createElement('div');
    dialog.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        border: 1px solid #ddd;
        border-radius: 8px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.2);
        z-index: 10001;
        padding: 20px;
        min-width: 400px;
        max-width: 500px;
        max-height: 80vh;
        overflow-y: auto;
    `;
    
    // Create available tags HTML
    let availableTagsHtml = '';
    if (availableTags.length > 0) {
        availableTagsHtml = `
        <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 8px; font-size: 13px; font-weight: 500;">Available Tags (click to add):</label>
            <div id="available-tags" style="display: flex; flex-wrap: wrap; gap: 6px; padding: 8px; background: #f8f9fa; border-radius: 4px; max-height: 120px; overflow-y: auto;">
                ${availableTags.map(tag => `
                    <span class="available-tag" data-tag="${tag}" style="
                        background: #e9ecef;
                        color: #495057;
                        padding: 4px 10px;
                        border-radius: 12px;
                        font-size: 12px;
                        cursor: pointer;
                        border: 1px solid #dee2e6;
                        transition: all 0.2s;
                    ">${tag}</span>
                `).join('')}
            </div>
        </div>
        `;
    }
    
    dialog.innerHTML = `
        <h3 style="margin: 0 0 16px 0; font-size: 16px;">Edit Tags</h3>
        <div style="margin-bottom: 8px; font-size: 12px; color: #666;">
            File: ${filePath.split('/').pop()}
        </div>
        <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 4px; font-size: 13px;">Current Tags:</label>
            <div id="current-tags-display" style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; min-height: 32px; padding: 8px; background: #f0f7ff; border-radius: 4px;">
                ${currentTags.length > 0 ? currentTags.map(tag => `
                    <span class="current-tag" data-tag="${tag}" style="
                        background: #16a34a;
                        color: white;
                        padding: 4px 10px;
                        border-radius: 12px;
                        font-size: 12px;
                        display: inline-flex;
                        align-items: center;
                        gap: 6px;
                    ">
                        ${tag}
                        <span class="remove-tag" data-tag="${tag}" style="cursor: pointer; font-weight: bold;">×</span>
                    </span>
                `).join('') : '<span style="color: #999; font-size: 12px;">No tags yet. Click available tags below or type new ones.</span>'}
            </div>
            <input type="text" id="tag-edit-input" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;" 
                   placeholder="Type new tags separated by commas and press Enter">
        </div>
        ${availableTagsHtml}
        <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 4px; font-size: 13px;">Title:</label>
            <input type="text" id="title-edit-input" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;" 
                   value="${metadata.title || ''}" placeholder="Document title">
        </div>
        <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 4px; font-size: 13px;">Category:</label>
            <input type="text" id="category-edit-input" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;" 
                   value="${metadata.category || ''}" placeholder="Document category">
        </div>
        <div style="text-align: right; margin-top: 20px;">
            <button id="tag-edit-cancel" style="padding: 8px 16px; margin-right: 8px; border: 1px solid #ddd; border-radius: 4px; background: white; cursor: pointer;">Cancel</button>
            <button id="tag-edit-save" style="padding: 8px 16px; border: none; border-radius: 4px; background: #16a34a; color: white; cursor: pointer;">Save</button>
        </div>
    `;
    
    document.body.appendChild(dialog);
    
    // Add backdrop
    const backdrop = document.createElement('div');
    backdrop.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.3);
        z-index: 10000;
    `;
    document.body.appendChild(backdrop);
    
    // Keep track of current tags
    let workingTags = [...currentTags];
    
    // Function to update the current tags display
    function updateCurrentTagsDisplay() {
        const display = document.getElementById('current-tags-display');
        if (workingTags.length > 0) {
            display.innerHTML = workingTags.map(tag => `
                <span class="current-tag" data-tag="${tag}" style="
                    background: #16a34a;
                    color: white;
                    padding: 4px 10px;
                    border-radius: 12px;
                    font-size: 12px;
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                ">
                    ${tag}
                    <span class="remove-tag" data-tag="${tag}" style="cursor: pointer; font-weight: bold;">×</span>
                </span>
            `).join('');
            
            // Re-attach remove handlers
            display.querySelectorAll('.remove-tag').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const tagToRemove = btn.dataset.tag;
                    workingTags = workingTags.filter(t => t !== tagToRemove);
                    updateCurrentTagsDisplay();
                    updateAvailableTagsVisibility();
                });
            });
        } else {
            display.innerHTML = '<span style="color: #999; font-size: 12px;">No tags yet. Click available tags below or type new ones.</span>';
        }
    }
    
    // Function to update available tags visibility
    function updateAvailableTagsVisibility() {
        const availableTagsContainer = document.getElementById('available-tags');
        if (availableTagsContainer) {
            availableTagsContainer.querySelectorAll('.available-tag').forEach(tagEl => {
                const tag = tagEl.dataset.tag;
                if (workingTags.includes(tag)) {
                    tagEl.style.display = 'none';
                } else {
                    tagEl.style.display = 'inline-block';
                }
            });
        }
    }
    
    // Handle clicking on available tags
    const availableTagsContainer = document.getElementById('available-tags');
    if (availableTagsContainer) {
        availableTagsContainer.querySelectorAll('.available-tag').forEach(tagEl => {
            tagEl.addEventListener('click', () => {
                const tag = tagEl.dataset.tag;
                if (!workingTags.includes(tag)) {
                    workingTags.push(tag);
                    updateCurrentTagsDisplay();
                    updateAvailableTagsVisibility();
                }
            });
            
            // Add hover effect
            tagEl.addEventListener('mouseenter', () => {
                tagEl.style.background = '#16a34a';
                tagEl.style.color = 'white';
                tagEl.style.borderColor = '#16a34a';
            });
            tagEl.addEventListener('mouseleave', () => {
                tagEl.style.background = '#e9ecef';
                tagEl.style.color = '#495057';
                tagEl.style.borderColor = '#dee2e6';
            });
        });
    }
    
    // Handle removing current tags
    document.querySelectorAll('.remove-tag').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const tagToRemove = btn.dataset.tag;
            workingTags = workingTags.filter(t => t !== tagToRemove);
            updateCurrentTagsDisplay();
            updateAvailableTagsVisibility();
        });
    });
    
    // Handle input field for new tags
    const tagInput = document.getElementById('tag-edit-input');
    tagInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const input = tagInput.value.trim();
            if (input) {
                const newTags = input.split(',').map(t => t.trim()).filter(t => t.length > 0);
                newTags.forEach(tag => {
                    if (!workingTags.includes(tag)) {
                        workingTags.push(tag);
                    }
                });
                tagInput.value = '';
                updateCurrentTagsDisplay();
                updateAvailableTagsVisibility();
            }
        }
    });
    
    // Focus on input
    tagInput.focus();
    
    // Handle save
    document.getElementById('tag-edit-save').addEventListener('click', async () => {
        // Add any remaining text in the input field
        const remainingInput = document.getElementById('tag-edit-input').value.trim();
        if (remainingInput) {
            const additionalTags = remainingInput.split(',').map(t => t.trim()).filter(t => t.length > 0);
            additionalTags.forEach(tag => {
                if (!workingTags.includes(tag)) {
                    workingTags.push(tag);
                }
            });
        }
        
        const newTitle = document.getElementById('title-edit-input').value.trim();
        const newCategory = document.getElementById('category-edit-input').value.trim();
        
        const newTags = workingTags;
        
        // Update metadata
        const newMetadata = {
            ...metadata,
            title: newTitle || metadata.title,
            category: newCategory || metadata.category
        };
        
        // Generate new content with updated frontmatter
        const newContent = window.tagManager.updateFileFrontmatter(filePath, newMetadata, newTags);
        
        if (newContent) {
            try {
                // Save the file with updated frontmatter
                const result = await window.electronAPI.invoke('write-file', filePath, newContent);
                
                if (result.success) {
                    showNotification('Tags updated successfully', 'success');
                    
                    // Update the tag manager's internal state
                    window.tagManager.processFile(filePath, newContent);
                    
                    // Refresh the file tree to show updated tags
                    if (window.renderFileTree) {
                        window.renderFileTree();
                    }
                    
                    // If this is the current file, reload it in the editor
                    if (window.currentFilePath === filePath && window.openFileInEditor) {
                        await window.openFileInEditor(filePath, newContent);
                    }
                } else {
                    showNotification('Failed to save tags', 'error');
                }
            } catch (error) {
                console.error('[showTagEditDialog] Error saving tags:', error);
                showNotification('Error saving tags', 'error');
            }
        }
        
        // Close dialog
        dialog.remove();
        backdrop.remove();
    });
    
    // Handle cancel
    document.getElementById('tag-edit-cancel').addEventListener('click', () => {
        dialog.remove();
        backdrop.remove();
    });
    
    // Handle escape key
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            dialog.remove();
            backdrop.remove();
            document.removeEventListener('keydown', handleEscape);
        }
    };
    document.addEventListener('keydown', handleEscape);
}

// Function to pre-process tags for markdown files in the tree
async function preProcessMarkdownTags(node) {
    if (!window.tagManager || !window.electronAPI) return;
    
    // Process this node if it's a markdown file
    if (node.type === 'file' && node.name.endsWith('.md')) {
        try {
            const result = await window.electronAPI.invoke('read-file-content-only', node.path);
            if (result.success && result.content) {
                window.tagManager.processFile(node.path, result.content);
            }
        } catch (error) {
            console.warn('[preProcessMarkdownTags] Error processing file:', node.path, error);
        }
    }
    
    // Recursively process children
    if (node.children) {
        await Promise.all(node.children.map(child => preProcessMarkdownTags(child)));
    }
}

// Function to automatically expand common/important folders on first load
function expandCommonFolders(rootNode) {
    // Always expand the root directory if it has children
    if (rootNode.children && rootNode.children.length > 0) {
        window.expandedFolders.add(rootNode.path);
        
        // Auto-expand folders with common names or small number of items
        for (const child of rootNode.children) {
            if (child.type === 'folder' || child.type === 'directory') {
                const folderName = child.name.toLowerCase();
                const childCount = child.children ? child.children.length : 0;
                
                // Expand if:
                // 1. Common folder names (src, docs, components, etc.)
                // 2. Small folders (5 or fewer items)
                // 3. Only folder in the directory
                if (folderName.match(/(src|docs|components|utils|lib|assets|styles|images|lectures|notes|content)/) ||
                    childCount <= 5 ||
                    rootNode.children.length === 1) {
                    window.expandedFolders.add(child.path);
                    console.log(`[expandCommonFolders] Auto-expanded: ${child.path}`);
                }
            }
        }
    }
}

function showFileContextMenu(event, filePath, isFolder) {
    // Remove any existing context menu
    const existingMenu = document.querySelector('.file-context-menu');
    if (existingMenu) {
        existingMenu.remove();
    }
    
    // Create context menu
    const menu = document.createElement('div');
    menu.className = 'file-context-menu';
    menu.style.cssText = `
        position: fixed;
        left: ${event.pageX}px;
        top: ${event.pageY}px;
        background: white;
        border: 1px solid #ddd;
        border-radius: 4px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 13px;
        min-width: 150px;
    `;
    
    // Create menu items based on whether it's a file or folder
    const menuItems = [];
    
    if (isFolder) {
        menuItems.push(
            { label: 'New File in Folder', action: 'new-file' },
            { label: 'New Folder', action: 'new-subfolder' },
            { label: 'Rename Folder', action: 'rename' },
            { label: 'Delete Folder', action: 'delete' }
        );
    } else {
        menuItems.push(
            { label: 'Open', action: 'open' },
            { label: 'Rename File', action: 'rename' },
            { label: 'Delete File', action: 'delete' },
            { label: 'Copy Path', action: 'copy-path' }
        );
        
        // Add tag editing option for markdown files
        if (filePath.endsWith('.md')) {
            menuItems.push({ label: 'Edit Tags', action: 'edit-tags' });
        }
    }
    
    menuItems.forEach((item, index) => {
        const menuItem = document.createElement('div');
        menuItem.style.cssText = `
            padding: 8px 12px;
            cursor: pointer;
            border-bottom: ${index < menuItems.length - 1 ? '1px solid #f0f0f0' : 'none'};
        `;
        menuItem.textContent = item.label;
        menuItem.addEventListener('click', () => {
            handleFileContextMenuAction(item.action, filePath, isFolder);
            menu.remove();
        });
        menuItem.addEventListener('mouseenter', () => {
            menuItem.style.background = '#f0f0f0';
        });
        menuItem.addEventListener('mouseleave', () => {
            menuItem.style.background = 'white';
        });
        menu.appendChild(menuItem);
    });
    
    document.body.appendChild(menu);
    
    // Remove menu when clicking elsewhere
    const removeMenu = (e) => {
        if (!menu.contains(e.target)) {
            menu.remove();
            document.removeEventListener('click', removeMenu);
        }
    };
    setTimeout(() => {
        document.addEventListener('click', removeMenu);
    }, 10);
}

async function handleFileContextMenuAction(action, filePath, isFolder) {
    console.log(`[handleFileContextMenuAction] Action: ${action}, Path: ${filePath}, IsFolder: ${isFolder}`);
    
    switch (action) {
        case 'open':
            if (!isFolder) {
                try {
                    const result = await window.electronAPI.invoke('open-file-path', filePath);
                    if (result.success && window.openFileInEditor) {
                        await window.openFileInEditor(result.filePath, result.content);
                    }
                } catch (error) {
                    console.error('[handleFileContextMenuAction] Error opening file:', error);
                    showNotification('Error opening file', 'error');
                }
            }
            break;
            
        case 'rename':
            const newName = await showCustomPrompt(
                `Rename ${isFolder ? 'Folder' : 'File'}`, 
                `Enter new name for ${isFolder ? 'folder' : 'file'}:`,
                filePath.split('/').pop()
            );
            if (newName && newName !== filePath.split('/').pop()) {
                console.log(`[handleFileContextMenuAction] Renaming ${filePath} to ${newName}`);
                try {
                    const result = await window.electronAPI.invoke('rename-item', { 
                        filePath: filePath, 
                        newName: newName 
                    });
                    if (result.success) {
                        showNotification(`${isFolder ? 'Folder' : 'File'} renamed to "${newName}" successfully`, 'success');
                        // Refresh the file tree to show the renamed item
                        renderFileTree();
                    } else {
                        showNotification(`Failed to rename ${isFolder ? 'folder' : 'file'}: ${result.error}`, 'error');
                    }
                } catch (error) {
                    console.error('[handleFileContextMenuAction] Rename error:', error);
                    showNotification(`Failed to rename ${isFolder ? 'folder' : 'file'}: ${error.message}`, 'error');
                }
            }
            break;
            
        case 'delete':
            const confirmDelete = confirm(`Are you sure you want to delete this ${isFolder ? 'folder' : 'file'}?\n\n${filePath}\n\nThis action cannot be undone.`);
            if (confirmDelete) {
                console.log(`[handleFileContextMenuAction] Deleting ${filePath}`);
                try {
                    const result = await window.electronAPI.invoke('delete-file', filePath);
                    if (result.success) {
                        showNotification(result.message, 'success');
                        
                        // If we deleted the currently open file, clear the editor
                        if (!isFolder && window.currentFilePath === filePath) {
                            if (window.editor) {
                                window.editor.setValue('');
                            }
                            window.currentFilePath = null;
                            window.editorFileName = null; // Also clear editorFileName
                            const currentFileNameEl = document.getElementById('current-file-name');
                            if (currentFileNameEl) {
                                currentFileNameEl.textContent = 'No file selected';
                            }
                        }
                        
                        // Refresh file tree to show the file is gone
                        if (window.renderFileTree) {
                            window.renderFileTree();
                        }
                    } else {
                        showNotification(`Failed to delete: ${result.error}`, 'error');
                    }
                } catch (error) {
                    console.error('[handleFileContextMenuAction] Error deleting file:', error);
                    showNotification('Error deleting file', 'error');
                }
            }
            break;
            
        case 'copy-path':
            if (!isFolder) {
                try {
                    await navigator.clipboard.writeText(filePath);
                    showNotification('Path copied to clipboard', 'success');
                } catch (error) {
                    console.error('[handleFileContextMenuAction] Error copying path:', error);
                    showNotification('Error copying path', 'error');
                }
            }
            break;
            
        case 'edit-tags':
            if (!isFolder && filePath.endsWith('.md')) {
                await showTagEditDialog(filePath);
            }
            break;
            
        case 'new-file':
        case 'new-subfolder':
            showNotification('This functionality will be implemented soon', 'info');
            break;
            
        default:
            console.warn(`[handleFileContextMenuAction] Unknown action: ${action}`);
    }
}

function highlightCurrentFileInTree(filePath) {
    const fileTreeView = document.getElementById('file-tree-view');
    if (!fileTreeView || !filePath) {
        return;
    }
    
    try {
        console.log('[highlightCurrentFileInTree] Highlighting file:', filePath);
        
        // Remove existing highlights
        const existingHighlights = fileTreeView.querySelectorAll('.file-tree-item.current-file');
        existingHighlights.forEach(item => item.classList.remove('current-file'));
        
        // Find and highlight the current file
        const fileItems = fileTreeView.querySelectorAll('.file-tree-item');
        const fileName = filePath.split('/').pop();
        
        for (const item of fileItems) {
            const fileNameSpan = item.querySelector('.file-name');
            if (fileNameSpan && fileNameSpan.textContent === fileName) {
                item.classList.add('current-file');
                console.log('[highlightCurrentFileInTree] Highlighted file:', fileName);
                break;
            }
        }
    } catch (error) {
        console.error('[highlightCurrentFileInTree] Error highlighting file:', error);
    }
}

// --- Folder Name Modal Functions ---
function showFolderNameModal() {
    folderNameModal.classList.remove('hidden');
    folderNameInput.value = '';
    folderNameError.style.display = 'none';
    folderNameInput.focus();
}

function hideFolderNameModal() {
    folderNameModal.classList.add('hidden');
}

function validateFolderName(name) {
    if (!name || name.trim() === '') {
        return 'Folder name cannot be empty.';
    }
    
    const trimmedName = name.trim();
    
    if (!/^[a-zA-Z0-9_\-\s]+$/.test(trimmedName)) {
        return 'Folder name can only contain letters, numbers, spaces, hyphens, and underscores.';
    }
    
    return null; // Valid
}

function showFolderNameError(message) {
    folderNameError.textContent = message;
    folderNameError.style.display = 'block';
    folderNameInput.style.borderColor = '#dc3545';
}

function hideFolderNameError() {
    folderNameError.style.display = 'none';
    folderNameInput.style.borderColor = '#ddd';
}

// --- Create New Folder Function ---
async function createNewFolder() {
    showFolderNameModal();
}

// --- Create New Folder Modal (for command palette) ---
window.showNewFolderModal = createNewFolder;

async function handleCreateFolder() {
    const folderName = folderNameInput.value;
    
    // Validate folder name
    const validationError = validateFolderName(folderName);
    if (validationError) {
        showFolderNameError(validationError);
        return;
    }
    
    hideFolderNameError();
    const trimmedName = folderName.trim();
    
    try {
        console.log(`[Renderer] Creating new folder: ${trimmedName}`);
        
        // Send request to main process to create folder
        const result = await window.electronAPI.invoke('create-folder', trimmedName);
        
        if (result.success) {
            console.log(`[Renderer] Folder created successfully: ${result.folderPath}`);
            hideFolderNameModal();
            // Refresh the file tree to show the new folder
            fileTreeRendered = false;
            debouncedRenderFileTree();
            showNotification('Folder created successfully', 'success');
        } else {
            console.error(`[Renderer] Error creating folder: ${result.error}`);
            showFolderNameError(result.error);
        }
    } catch (error) {
        console.error('[Renderer] Error in handleCreateFolder:', error);
        showFolderNameError('Failed to create folder. Please try again.');
    }
}

// Navigation history management is handled by the navigation.js module

// --- Settings Integration ---
async function saveNavigationHistoryToSettings() {
    try {
        await window.electronAPI.invoke('save-navigation-history', navigationHistory);
    } catch (error) {
        console.error('[Navigation] Error saving navigation history:', error);
    }
}

async function loadNavigationHistoryFromSettings() {
    try {
        const savedHistory = await window.electronAPI.invoke('get-navigation-history');
        if (Array.isArray(savedHistory) && savedHistory.length > 0) {
            navigationHistory = savedHistory;
            currentHistoryIndex = navigationHistory.length - 1;
            updateNavigationButtons();
            
            // Set current file name if we have history
            if (navigationHistory.length > 0) {
                updateCurrentFileName(navigationHistory[currentHistoryIndex].fileName);
            }
            
            console.log('[Navigation] Loaded navigation history:', navigationHistory.length, 'entries');
        }
    } catch (error) {
        console.error('[Navigation] Error loading navigation history:', error);
    }
}

async function addFileToRecents(filePath) {
    try {
        await window.electronAPI.invoke('add-recent-file', filePath);
    } catch (error) {
        console.error('[Settings] Error adding file to recents:', error);
    }
}

// Drag and drop event listeners are now handled in modules/dragdrop.js

// --- Theme Handling ---
function applyTheme(isDarkMode) {
    const body = document.body;
    // Store current theme globally for reference by other parts of code
    window.currentTheme = isDarkMode ? 'dark' : 'light';
    
    // Only toggle theme classes on body! CSS expects this.
    if (isDarkMode) {
        body.classList.remove('light-mode');
        body.classList.add('dark-mode');
        if (window.monaco && monaco.editor) {
            monaco.editor.setTheme('vs-dark');
        }
    } else {
        body.classList.remove('dark-mode');
        body.classList.add('light-mode');
        if (window.monaco && monaco.editor) {
            monaco.editor.setTheme('vs');
        }
    }
}


// Setup context menu listener
setupContextMenuListener();

// Duplicate file-opened event listener removed - already handled at line 2065

// Handle new file creation signal from main process
if (window.electronAPI) {
    window.electronAPI.on('new-file-created', () => {
        console.log('[Renderer] Received new-file-created signal.');
        
        // Clear current file path so save will trigger save-as dialog
        window.currentFilePath = null;
        window.editorFileName = null; // Also clear editorFileName
        
        // Clear editor
        if (editor) {
            editor.setValue('');
        } else if (fallbackEditor) {
            fallbackEditor.value = '';
        }
        // Clear preview
        if (previewContent) {
            previewContent.innerHTML = '';
        }
        // Clear structure pane
        if (structureList) {
            structureList.innerHTML = '';
        }
        
        // Update AI chat context for new file
        updateAIChatContext(null);
        
        // Update file name display to show "Untitled"
        const currentFileNameEl = document.getElementById('current-file-name');
        if (currentFileNameEl) {
            currentFileNameEl.textContent = 'Untitled';
        }
        
        // Ensure structure view is active (optional, good UX)
        if (currentStructureView !== 'structure') {
            switchStructureView('structure');
        }
        
        console.log('[Renderer] Editor, preview, structure cleared and currentFilePath reset for new file.');
    });
}

// Listen for signal to refresh the file tree (e.g., after Open Folder)
if (window.electronAPI) {
    console.log('[Renderer] Setting up refresh-file-tree signal handler');
    window.electronAPI.on('refresh-file-tree', () => {
        console.log('[Renderer] Received refresh-file-tree signal.');
        console.log('[Renderer] Current structure view:', currentStructureView);
        
        // Reset the rendered flag to force a refresh
        fileTreeRendered = false;
        
        // Switch to file view (which will trigger renderFileTree if needed)
        if (currentStructureView !== 'files') {
            console.log('[Renderer] Switching to file view');
            switchStructureView('file');
        } else {
            // If already in file view, manually refresh
            console.log('[Renderer] Already in file view, refreshing tree');
            fileTreeRendered = false;  // Reset flag to force refresh
            debouncedRenderFileTree();
        }
    });
}

// Listen for theme updates from main process

// Listen for 'set-theme' event via electronAPI, calling applyTheme(theme === 'dark')
if (window.electronAPI && window.electronAPI.on) {
    window.electronAPI.on('set-theme', (theme) => {
        console.log('[renderer.js] Received set-theme event:', theme);
        applyTheme(theme === 'dark');
    });
    
    window.electronAPI.on('show-command-palette', () => {
        console.log('[renderer.js] Received show-command-palette event');
        if (window.showCommandPalette) {
            window.showCommandPalette();
        }
    });
}

// AI chat functionality is handled by the aiChat.js module

// --- Save/Save As Logic ---
// Function to get current editor content
function getCurrentEditorContent() {
    let content = '';
    if (editor && typeof editor.getValue === 'function') {
        content = editor.getValue();
    } else if (fallbackEditor) { // Fallback if Monaco fails
        content = fallbackEditor.value;
    }
    return content;
}

// Listen for 'Save' trigger from main process
if (window.electronAPI) {
    window.electronAPI.on('trigger-save', async () => {
        console.log('[Renderer] Received trigger-save.');
        // Use the existing saveFile function which handles all the logic
        await saveFile();
    });
}

// Listen for 'Save As' trigger from main process
if (window.electronAPI) {
    window.electronAPI.on('trigger-save-as', async () => {
        console.log('[Renderer] Received trigger-save-as.');
        // Use the existing saveAsFile function which handles all the logic
        await saveAsFile();
    });
}

// --- End Save/Save As Logic ---

// --- Export Logic ---

// Handle HTML export signal from main process
if (window.electronAPI) {
    window.electronAPI.on('trigger-export-html', async () => {
        console.log('[Renderer] Received trigger-export-html.');
        const content = getCurrentEditorContent();
        try {
            // Show initial notification
            showNotification('Preparing HTML export...', 'info');
            
            // Generate HTML from markdown
            const htmlContent = await generateHTMLFromMarkdown(content);
            
            // Export options for enhanced pandoc support
            const exportOptions = {
                usePandoc: true,
                pandocArgs: [
                    '--mathjax', // Enable math rendering
                    '--highlight-style=github', // Code syntax highlighting
                    '--css=pandoc.css' // Add custom styling if available
                ]
            };
            
            const result = await window.electronAPI.invoke('perform-export-html', content, htmlContent, exportOptions);
            if (result.success) {
                console.log(`[Renderer] HTML exported successfully to: ${result.filePath}`);
                
                // Enhanced success message
                let message = 'HTML exported successfully';
                if (result.usedPandoc) {
                    message += ' (with Pandoc)';
                    if (result.bibFilesFound > 0) {
                        message += ` and ${result.bibFilesFound} bibliography file${result.bibFilesFound === 1 ? '' : 's'}`;
                    }
                }
                showNotification(message, 'success');
            } else if (!result.cancelled) {
                console.error(`[Renderer] HTML export failed: ${result.error}`);
                showNotification(result.error || 'HTML export failed', 'error');
            }
        } catch (error) {
            console.error('[Renderer] Error during HTML export:', error);
            showNotification('Error during HTML export', 'error');
        }
    });

    // Handle HTML export with references signal from main process
    window.electronAPI.on('trigger-export-html-pandoc', async () => {
        console.log('[Renderer] Received trigger-export-html-pandoc.');
        const content = getCurrentEditorContent();
        try {
            // Show initial notification
            showNotification('Preparing HTML export with references...', 'info');
            
            // Generate HTML from markdown
            const htmlContent = await generateHTMLFromMarkdown(content);
            
            // Export options for pandoc with bibliography support
            const exportOptions = {
                usePandoc: true,
                pandocArgs: [
                    '--mathjax', // Enable math rendering
                    '--highlight-style=pygments' // Code syntax highlighting
                ]
            };
            
            // Ensure only serializable data is passed through IPC
            const serializableHtmlContent = typeof htmlContent === 'string' ? htmlContent : String(htmlContent);
            
            const result = await window.electronAPI.invoke('perform-export-html-pandoc', content, serializableHtmlContent, exportOptions);
            if (result.success) {
                console.log(`[Renderer] HTML with references exported successfully to: ${result.filePath}`);
                
                // Enhanced success message
                let message = 'HTML with references exported successfully';
                if (result.bibFilesFound > 0) {
                    message += ` (${result.bibFilesFound} bibliography file${result.bibFilesFound === 1 ? '' : 's'} processed)`;
                } else {
                    message += ' (no bibliography files found)';
                }
                showNotification(message, 'success');
            } else if (!result.cancelled) {
                console.error(`[Renderer] HTML with references export failed: ${result.error}`);
                showNotification(result.error || 'HTML with references export failed', 'error');
            }
        } catch (error) {
            console.error('[Renderer] Error during HTML with references export:', error);
            showNotification('Error during HTML with references export', 'error');
        }
    });

    window.electronAPI.on('trigger-export-pdf', async () => {
        console.log('[Renderer] Received trigger-export-pdf.');
        const content = getCurrentEditorContent();
        try {
            // Show initial notification
            showNotification('Preparing PDF export...', 'info');
            
            // Generate HTML from markdown
            const htmlContent = await generateHTMLFromMarkdown(content);
            
            // Export options for enhanced pandoc support
            const exportOptions = {
                usePandoc: true,
                pandocArgs: [
                    '--mathjax', // Enable math rendering
                    '--highlight-style=github', // Code syntax highlighting
                    '--variable', 'linkcolor:blue',
                    '--variable', 'urlcolor:blue'
                ]
            };
            
            const result = await window.electronAPI.invoke('perform-export-pdf', content, htmlContent, exportOptions);
            if (result.success) {
                console.log(`[Renderer] PDF exported successfully to: ${result.filePath}`);
                
                // Enhanced success message
                let message = 'PDF exported successfully';
                if (result.usedPandoc) {
                    message += ' (with Pandoc)';
                    if (result.bibFilesFound > 0) {
                        message += ` and ${result.bibFilesFound} bibliography file${result.bibFilesFound === 1 ? '' : 's'}`;
                    }
                } else {
                    message += ' (using Electron renderer)';
                }
                showNotification(message, 'success');
            } else if (!result.cancelled) {
                console.error(`[Renderer] PDF export failed: ${result.error}`);
                showNotification(result.error || 'PDF export failed', 'error');
            }
        } catch (error) {
            console.error('[Renderer] Error during PDF export:', error);
            showNotification('Error during PDF export', 'error');
        }
    });

    window.electronAPI.on('trigger-export-pptx', async () => {
        console.log('[Renderer] Received trigger-export-pptx.');
        const content = getCurrentEditorContent();
        try {
            // Show initial notification
            showNotification('Preparing PowerPoint export...', 'info');
            
            // Export options for PowerPoint
            const exportOptions = {
                usePandoc: true,
                pandocArgs: [
                    '--variable', 'theme:metropolis', // Clean theme
                    '--variable', 'aspectratio:169'   // 16:9 aspect ratio
                ]
            };
            
            const result = await window.electronAPI.invoke('perform-export-pptx', content, exportOptions);
            if (result.success) {
                console.log(`[Renderer] PowerPoint exported successfully to: ${result.filePath}`);
                
                // Enhanced success message
                let message = `PowerPoint exported successfully (${result.slidesCreated} slide${result.slidesCreated === 1 ? '' : 's'})`;
                if (result.bibFilesFound > 0) {
                    message += ` with ${result.bibFilesFound} bibliography file${result.bibFilesFound === 1 ? '' : 's'}`;
                }
                showNotification(message, 'success');
            } else if (!result.cancelled) {
                console.error(`[Renderer] PowerPoint export failed: ${result.error}`);
                showNotification(result.error || 'PowerPoint export failed', 'error');
            }
        } catch (error) {
            console.error('[Renderer] Error during PowerPoint export:', error);
            showNotification('Error during PowerPoint export', 'error');
        }
    });

    window.electronAPI.on('trigger-export-pdf-pandoc', async () => {
        console.log('[Renderer] Received trigger-export-pdf-pandoc.');
        const content = getCurrentEditorContent();
        try {
            // Show initial notification
            showNotification('Preparing PDF export with references...', 'info');
            
            // Export options for enhanced PDF with references
            const exportOptions = {
                pandocArgs: [
                    '--variable', 'linkcolor:blue',
                    '--variable', 'urlcolor:blue',
                    '--variable', 'toccolor:black'
                    // Note: removed eisvogel template as it may not be installed
                ]
            };
            
            const result = await window.electronAPI.invoke('perform-export-pdf-pandoc', content, exportOptions);
            if (result.success) {
                console.log(`[Renderer] PDF with references exported successfully to: ${result.filePath}`);
                
                // Enhanced success message
                let message = 'PDF with references exported successfully';
                if (result.bibFilesFound > 0) {
                    message += ` (${result.bibFilesFound} bibliography file${result.bibFilesFound === 1 ? '' : 's'} processed)`;
                } else {
                    message += ' (no bibliography files found)';
                }
                showNotification(message, 'success');
            } else if (!result.cancelled) {
                console.error(`[Renderer] PDF with references export failed: ${result.error}`);
                showNotification(result.error || 'PDF export with references failed', 'error');
            }
        } catch (error) {
            console.error('[Renderer] Error during PDF with references export:', error);
            showNotification('Error during PDF export with references', 'error');
        }
    });

    // Handle settings dialog triggers from main process
    window.electronAPI.on('open-settings-dialog', () => {
        openSettingsDialog();
    });

    window.electronAPI.on('open-ai-settings-dialog', () => {
        openSettingsDialog('ai');
    });

    window.electronAPI.on('open-editor-settings-dialog', () => {
        openSettingsDialog('editor');
    });

    window.electronAPI.on('open-export-settings-dialog', () => {
        openSettingsDialog('export');
    });
}

// Export functionality including HTML generation is handled by the export.js module

// --- Theme Change Listeners ---
// --- Helper to Save Current Layout --- 
function saveCurrentLayout() {
    const leftSidebar = document.getElementById('left-sidebar');
    const editorPane = document.getElementById('editor-pane');
    const rightPane = document.getElementById('right-pane');
    const appContainer = document.getElementById('app-container');

    if (!leftSidebar || !editorPane || !rightPane || !appContainer) {
        console.error('[renderer.js] Cannot save layout: one or more pane elements or container not found.');
        return;
    }

    const containerWidth = appContainer.offsetWidth;
    if (containerWidth <= 0) {
         console.warn('[renderer.js] Cannot save layout: container width is zero.');
        return;
    }

    // Calculate percentages with proper rounding and validation
    const structurePercent = Math.round((leftSidebar.offsetWidth / containerWidth) * 100 * 100) / 100; // 2 decimal places
    const editorPercent = Math.round((editorPane.offsetWidth / containerWidth) * 100 * 100) / 100;
    const rightPercent = Math.round((rightPane.offsetWidth / containerWidth) * 100 * 100) / 100;
    
    // Ensure percentages are reasonable (each between 5% and 80%)
    const clampPercent = (percent) => Math.max(5, Math.min(80, percent));
    
    let finalStructure = clampPercent(structurePercent);
    let finalEditor = clampPercent(editorPercent);
    let finalRight = clampPercent(rightPercent);
    
    // Normalize to exactly 100% if needed
    const total = finalStructure + finalEditor + finalRight;
    if (Math.abs(total - 100) > 0.1) {
        const ratio = 100 / total;
        finalStructure = Math.round(finalStructure * ratio * 100) / 100;
        finalEditor = Math.round(finalEditor * ratio * 100) / 100;
        finalRight = Math.round(finalRight * ratio * 100) / 100;
        
        // Final adjustment to ensure exactly 100%
        const newTotal = finalStructure + finalEditor + finalRight;
        const diff = 100 - newTotal;
        finalEditor += diff; // Add any remainder to the editor pane
    }
    
    const layoutData = {
        structureWidth: `${finalStructure}%`,
        editorWidth: `${finalEditor}%`,
        rightWidth: `${finalRight}%`
    };

    window.electronAPI.send('save-layout', layoutData);
}

// Global search functionality is handled by the search.js module



function showNotification(message, type = 'info', isHTML = false) {
    // Remove any existing notification
    const existingNotification = document.querySelector('.notification');
    if (existingNotification) {
        existingNotification.classList.add('hide');
        setTimeout(() => {
            if (existingNotification.parentNode) {
                existingNotification.remove();
            }
        }, 250); // Wait for hide animation
    }
    
    // Create new notification
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    
    // Set content based on whether HTML is enabled
    if (isHTML) {
        notification.innerHTML = message;
    } else {
        notification.textContent = message;
    }
    
    document.body.appendChild(notification);
    
    // Trigger show animation
    requestAnimationFrame(() => {
        notification.classList.add('show');
    });
    
    // Auto-remove after 4 seconds with hide animation
    setTimeout(() => {
        if (notification.parentNode) {
            notification.classList.remove('show');
            notification.classList.add('hide');
            
            // Remove from DOM after animation
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 250);
        }
    }, 4000);
}


// --- Auto-save functionality ---

// Initialize auto-save functionality
function initializeAutoSave() {
    if (!window.appSettings || !window.appSettings.ui || !window.appSettings.ui.autoSave) {
        return;
    }
    
    const interval = window.appSettings.ui.autoSaveInterval || 2000; // Default 2 seconds
    console.log(`[renderer.js] Auto-save initialized with ${interval}ms interval`);
    
    // Set initial saved content
    if (editor) {
        lastSavedContent = editor.getValue();
    }
}

// Mark that there are unsaved changes and schedule auto-save
function scheduleAutoSave() {
    if (!window.appSettings?.ui?.autoSave || suppressAutoSave) return;
    
    const currentContent = editor ? editor.getValue() : '';
    
    // Check if content has actually changed
    if (currentContent === lastSavedContent) {
        hasUnsavedChanges = false;
        return;
    }
    
    hasUnsavedChanges = true;
    
    // Clear existing timer
    if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
    }
    
    // Schedule auto-save
    const interval = window.appSettings.ui.autoSaveInterval || 2000;
    autoSaveTimer = setTimeout(() => {
        performAutoSave();
    }, interval);
    
    // Update status indicator
    updateUnsavedIndicator(true);
}

// Perform the actual auto-save
async function performAutoSave() {
    if (!hasUnsavedChanges || !editor) {
        return;
    }
    
    try {
        const content = editor.getValue();
        console.log('[renderer.js] Performing auto-save...');
        console.log('[renderer.js] Auto-save: currentFilePath =', window.currentFilePath);
        console.log('[renderer.js] Auto-save: content length =', content.length);
        
        // Only save if we have a current file path
        if (window.currentFilePath && window.electronAPI) {
            // CRITICAL FIX: Pass the file path explicitly to prevent saving to wrong file
            const result = await window.electronAPI.invoke('perform-save-with-path', content, window.currentFilePath);
            
            if (result.success) {
                lastSavedContent = content;
                hasUnsavedChanges = false;
                updateUnsavedIndicator(false);
                console.log('[renderer.js] Auto-save completed successfully');
                showNotification('Auto-saved', 'success', 1000); // Brief notification
                
                // Update current file path if this was a save-as operation
                if (result.filePath && result.filePath !== window.currentFilePath) {
                    window.currentFilePath = result.filePath;
                    window.editorFileName = result.filePath; // Also update editorFileName
                    if (window.electronAPI) {
                        window.electronAPI.invoke('set-current-file', result.filePath);
                    }
                }
            } else {
                console.warn('[renderer.js] Auto-save failed:', result.error);
            }
        } else {
            console.log('[renderer.js] Auto-save skipped - no file path or API unavailable');
        }
    } catch (error) {
        console.error('[renderer.js] Auto-save error:', error);
    }
}

// Update the unsaved changes indicator
function updateUnsavedIndicator(hasUnsaved) {
    const currentFileName = document.getElementById('current-file-name');
    if (currentFileName) {
        const text = currentFileName.textContent;
        if (hasUnsaved && !text.includes('●')) {
            currentFileName.textContent = '● ' + text;
        } else if (!hasUnsaved && text.includes('●')) {
            currentFileName.textContent = text.replace('● ', '');
        }
    }
}

// Mark content as saved (called when user manually saves)
function markContentAsSaved() {
    if (editor) {
        lastSavedContent = editor.getValue();
        hasUnsavedChanges = false;
        updateUnsavedIndicator(false);
        
        // Clear auto-save timer
        if (autoSaveTimer) {
            clearTimeout(autoSaveTimer);
            autoSaveTimer = null;
        }
    }
}

// Initialize formatting directly
setTimeout(() => {
    // Initializing formatting buttons
    
    const formatBoldBtn = document.getElementById('format-bold-btn');
    const formatItalicBtn = document.getElementById('format-italic-btn');
    const formatCodeBtn = document.getElementById('format-code-btn');
    
    if (formatBoldBtn && window.formatText) {
        formatBoldBtn.addEventListener('click', async () => await window.formatText('**', '**', 'bold text'));
        // Bold button initialized
    }
    if (formatItalicBtn && window.formatText) {
        formatItalicBtn.addEventListener('click', async () => await window.formatText('*', '*', 'italic text'));
        // Italic button initialized
    }
    if (formatCodeBtn && window.formatText) {
        formatCodeBtn.addEventListener('click', async () => await window.formatText('`', '`', 'code'));
        // Code button initialized
    }
    
    // Formatting initialization complete
}, 2000);

// === Pane Toggle Functionality ===
let sidebarVisible = true;
let editorVisible = true;
let previewVisible = true;

function toggleSidebar() {
    console.log('[Sidebar Toggle] Function called, current sidebarVisible:', sidebarVisible);
    
    const sidebar = document.getElementById('left-sidebar');
    const resizer = document.getElementById('sidebar-resizer');
    const toggleBtn = document.getElementById('toggle-sidebar-btn');
    
    console.log('[Sidebar Toggle] Elements found:', {
        sidebar: !!sidebar,
        resizer: !!resizer,
        toggleBtn: !!toggleBtn
    });
    
    if (sidebarVisible) {
        console.log('[Sidebar Toggle] Hiding sidebar');
        sidebar.style.display = 'none';
        resizer.style.display = 'none';
        toggleBtn.style.background = '#ccc';
        toggleBtn.style.color = '#666';
        toggleBtn.style.opacity = '0.7';
        
        // Remove width constraints completely
        sidebar.style.width = '0px';
        sidebar.style.minWidth = '0px';
        sidebar.style.maxWidth = '0px';
        sidebar.style.overflow = 'hidden';
        
        console.log('[Sidebar Toggle] Sidebar hidden, adjusting layout');
    } else {
        console.log('[Sidebar Toggle] Showing sidebar');
        sidebar.style.display = 'flex';
        resizer.style.display = 'block';
        toggleBtn.style.background = '#16a34a';
        toggleBtn.style.color = 'white';
        toggleBtn.style.opacity = '1';
        
        // Restore sidebar width
        sidebar.style.width = '';
        sidebar.style.minWidth = '';
        sidebar.style.maxWidth = '';
        sidebar.style.overflow = '';
        
        console.log('[Sidebar Toggle] Sidebar shown, restoring layout');
        // Restore normal layout proportions
        refreshLayoutProportions();
    }
    
    sidebarVisible = !sidebarVisible;
    console.log('[Sidebar Toggle] Toggle complete, new sidebarVisible:', sidebarVisible);
}

function toggleEditor() {
    const editorPane = document.getElementById('editor-pane');
    const toggleBtn = document.getElementById('toggle-editor-btn');
    
    if (editorVisible) {
        editorPane.style.display = 'none';
        toggleBtn.style.background = '#ccc';
        toggleBtn.style.color = '#666';
        // Adjust preview to take full width
        const previewPane = document.getElementById('preview-pane');
        if (previewPane) previewPane.style.flex = '1';
    } else {
        editorPane.style.display = 'flex';
        toggleBtn.style.background = '#007acc';
        toggleBtn.style.color = 'white';
        // Restore normal layout proportions
        refreshLayoutProportions();
    }
    editorVisible = !editorVisible;
}

function togglePreview() {
    const rightPane = document.getElementById('right-pane');
    const toggleBtn = document.getElementById('toggle-preview-btn');
    
    if (previewVisible) {
        rightPane.style.display = 'none';
        toggleBtn.style.background = '#ccc';
        toggleBtn.style.color = '#666';
        toggleBtn.style.opacity = '0.7';
        // Adjust editor to take full width
        const editorContainer = document.getElementById('editor-container');
        if (editorContainer) editorContainer.style.flex = '1';
    } else {
        rightPane.style.display = 'flex';
        toggleBtn.style.background = '#16a34a';
        toggleBtn.style.color = 'white';
        toggleBtn.style.opacity = '1';
        // Restore normal layout proportions
        refreshLayoutProportions();
    }
    previewVisible = !previewVisible;
}

function refreshLayoutProportions() {
    const editorPane = document.getElementById('editor-pane');
    const previewPane = document.getElementById('preview-pane');
    
    // Check if we're in Kanban view
    const isKanban = document.querySelector('.kanban-board') !== null;
    
    if (editorVisible && previewVisible) {
        if (isKanban) {
            editorPane.style.flex = '0 0 300px';
            previewPane.style.flex = '1';
        } else {
            editorPane.style.flex = '1';
            previewPane.style.flex = '1';
        }
    }
}

function forceKanbanHorizontalScroll() {
    const previewContent = document.getElementById('preview-content');
    const kanbanBoard = document.querySelector('.kanban-board');
    
    if (!previewContent || !kanbanBoard) {
        console.log('[Kanban] Preview content or Kanban board not found for scroll setup');
        return;
    }
    
    // Setting up horizontal scroll
    
    // CORRECT APPROACH: Constrain the parent containers that are too wide
    // The issue is the main content area is enormous, making preview-content expand
    
    // Find and constrain the problematic parent containers
    const previewPane = document.getElementById('preview-pane');
    const editorContent = document.getElementById('editor-content');
    
    // Measuring container widths
    
    // Constrain the preview pane to a reasonable width for Kanban viewing
    const maxKanbanContainerWidth = 1200; // Reasonable max width for Kanban
    
    if (previewPane) {
        previewPane.style.setProperty('max-width', maxKanbanContainerWidth + 'px', 'important');
        previewPane.style.setProperty('overflow-x', 'auto', 'important');
        previewPane.style.setProperty('overflow-y', 'auto', 'important');
        // Constrained preview pane width
    }
    
    // Set overflow properties on preview content
    previewContent.style.setProperty('overflow-x', 'auto', 'important');
    previewContent.style.setProperty('overflow-y', 'auto', 'important');
    
    // Make Kanban board wider than the constrained container
    const columns = kanbanBoard.querySelectorAll('.kanban-column');
    const minColumnWidth = 350; // Good column width for readability
    const calculatedWidth = columns.length * (minColumnWidth + 16) + 32; // columns * (width + gap) + padding
    const requiredWidth = Math.max(calculatedWidth, maxKanbanContainerWidth + 200); // Ensure overflow
    
    // Calculated Kanban dimensions
    
    // Apply natural sizing to Kanban board
    kanbanBoard.style.setProperty('min-width', requiredWidth + 'px', 'important');
    kanbanBoard.style.setProperty('width', 'max-content', 'important');
    kanbanBoard.style.setProperty('flex-shrink', '0', 'important');
    
    // Ensure columns have appropriate width
    columns.forEach(column => {
        column.style.setProperty('min-width', minColumnWidth + 'px', 'important');
        column.style.setProperty('max-width', minColumnWidth + 'px', 'important');
        column.style.setProperty('flex-shrink', '0', 'important');
    });
    
    // Force reflow
    previewContent.offsetHeight;
    
    // Setup complete - checking scroll availability
    
    if (previewContent.scrollWidth > previewContent.clientWidth) {
        // Horizontal scrolling is now available
        // Test the scroll
        setTimeout(() => {
            previewContent.scrollLeft = 100;
            setTimeout(() => previewContent.scrollLeft = 0, 1000);
        }, 500);
    } else {
        console.log('[Kanban] Still no overflow - may need further adjustment');
    }
}

// Initialize pane toggles
document.addEventListener('DOMContentLoaded', function() {
    const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');
    const toggleEditorBtn = document.getElementById('toggle-editor-btn');
    const togglePreviewBtn = document.getElementById('toggle-preview-btn');
    
    if (toggleSidebarBtn) {
        toggleSidebarBtn.addEventListener('click', toggleSidebar);
    }
    
    if (toggleEditorBtn) {
        toggleEditorBtn.addEventListener('click', toggleEditor);
    }
    
    if (togglePreviewBtn) {
        togglePreviewBtn.addEventListener('click', togglePreview);
    }
    
    // Wait for MathJax to be ready
    if (window.MathJax && window.MathJax.startup) {
        window.MathJax.startup.promise = window.MathJax.startup.promise.then(() => {
            console.log('MathJax is ready');
            // Re-render any existing content that might have math
            const preview = document.getElementById('preview');
            if (preview) {
                renderMathInContent(preview);
            }
        }).catch((error) => {
            console.warn('MathJax initialization error:', error);
        });
    }

    // Initialize export buttons for visualizations (excluding presentation and network which have their own)
    setTimeout(() => {
        if (window.addExportButton) {
            // Add export buttons to visualizations that don't have them built-in
            // Only try to add if the container exists (circle view may not always be visible)
            const circleControls = document.getElementById('circle-export-controls');
            if (circleControls) {
                window.addExportButton('circle-export-controls', 'circle-content', '📸 Export as PNG');
            }
        }
    }, 1500); // Small delay to ensure everything is loaded
});

// --- Command Palette ---
// Command palette functionality moved to modules/commandPalette.js
// Export command functions are handled by the export.js module

// --- Apply Editor Settings Function ---
function applyEditorSettings(settings) {
    if (!editor) {
        console.warn('[renderer.js] Cannot apply editor settings - editor not available');
        return;
    }
    
    const editorOptions = {};
    
    if (settings?.editor) {
        if (settings.editor.showLineNumbers !== undefined) {
            editorOptions.lineNumbers = settings.editor.showLineNumbers ? 'on' : 'off';
        }
        if (settings.editor.showMinimap !== undefined) {
            editorOptions.minimap = { enabled: settings.editor.showMinimap };
        }
        if (settings.editor.wordWrap !== undefined) {
            editorOptions.wordWrap = settings.editor.wordWrap;
        }
        if (settings.editor.fontSize !== undefined) {
            editorOptions.fontSize = settings.editor.fontSize;
        }
        if (settings.editor.fontFamily !== undefined) {
            editorOptions.fontFamily = settings.editor.fontFamily;
        }
    }
    
    // Apply editor options
    editor.updateOptions(editorOptions);
}

// --- Manual Save Function ---
async function saveFile() {
    console.log('[saveFile] Saving file:', window.currentFilePath);
    
    if (!editor) {
        console.error('[saveFile] No editor available');
        showNotification('No editor available', 'error');
        return;
    }
    
    if (!window.electronAPI) {
        console.error('[saveFile] electronAPI not available');
        showNotification('Save functionality not available', 'error');
        return;
    }
    
    try {
        const content = editor.getValue();
        
        if (window.currentFilePath) {
            // Save existing file
            const result = await window.electronAPI.invoke('perform-save', content);
            
            if (result.success) {
                // Check if content was modified during save (e.g., H1 heading added)
                if (result.contentChanged && result.updatedContent && editor) {
                    console.log('[saveFile] Content was modified during save, updating editor');
                    editor.setValue(result.updatedContent);
                    lastSavedContent = result.updatedContent;
                } else {
                    lastSavedContent = content;
                }
                
                hasUnsavedChanges = false;
                updateUnsavedIndicator(false);
                showNotification('File saved successfully', 'success');
                
                // Update file tree and current file info if this was a new file save
                if (result.filePath && !window.currentFilePath) {
                    window.currentFilePath = result.filePath;
                    window.editorFileName = result.filePath; // Also update editorFileName
                    const fileName = result.filePath.split('/').pop();
                    const currentFileNameEl = document.getElementById('current-file-name');
                    if (currentFileNameEl) {
                        currentFileNameEl.textContent = fileName;
                    }
                    renderFileTree();
                }
            } else {
                console.error('[saveFile] Save failed:', result.error);
                showNotification(`Save failed: ${result.error}`, 'error');
            }
        } else {
            // Save new file - show save dialog
            // Try to get default directory, with fallbacks
            let defaultDirectory = window.appSettings?.workingDirectory;
            if (!defaultDirectory) {
                // Try to load settings if not available
                try {
                    const settings = await window.electronAPI.invoke('get-settings');
                    defaultDirectory = settings?.workingDirectory;
                } catch (error) {
                    console.warn('[renderer.js] saveFile - Failed to load settings:', error);
                }
            }
            
            const result = await window.electronAPI.invoke('perform-save-as', {
                content: content,
                defaultDirectory: defaultDirectory
            });
            
            if (result.success && result.filePath) {
                window.currentFilePath = result.filePath;
                window.editorFileName = result.filePath; // Also update editorFileName
                
                // Only add H1 heading for truly empty or very short content to avoid modifying existing files
                const fileName = result.filePath.split('/').pop().replace(/\.[^/.]+$/, ""); // Remove extension
                console.log('[saveFile] About to call addH1HeadingIfNeeded with fileName:', fileName);
                const trimmedContent = content.trim();
                const shouldAddHeading = trimmedContent.length === 0 || 
                                       (trimmedContent.length < 50 && !trimmedContent.includes('---') && !trimmedContent.startsWith('#'));
                
                if (shouldAddHeading) {
                    const updatedContent = addH1HeadingIfNeeded(content, fileName);
                    console.log('[saveFile] Content changed?', updatedContent !== content);
                    
                    // Update editor with new content if heading was added
                    if (updatedContent !== content && editor) {
                        editor.setValue(updatedContent);
                        lastSavedContent = updatedContent;
                        
                        // Save the updated content with the heading
                        try {
                            const saveResult = await window.electronAPI.invoke('perform-save', updatedContent);
                            if (!saveResult.success) {
                                console.warn('[renderer.js] Failed to save file with H1 heading:', saveResult.error);
                            }
                        } catch (error) {
                            console.warn('[renderer.js] Error saving file with H1 heading:', error);
                        }
                    } else {
                        lastSavedContent = content;
                    }
                } else {
                    // Skip adding heading for files with existing content or slide markers
                    console.log('[saveFile] Skipping H1 heading addition for existing content');
                    lastSavedContent = content;
                }
                
                hasUnsavedChanges = false;
                updateUnsavedIndicator(false);
                showNotification('File saved successfully', 'success');
                console.log('[renderer.js] Manual save-as completed successfully');
                
                // Update current file in electron
                window.electronAPI.invoke('set-current-file', result.filePath);
                
                // Update file tree and highlight the new file
                renderFileTree();
                highlightCurrentFileInTree(result.filePath);
                
                // Update current file name display
                const displayFileName = result.filePath.split('/').pop();
                const currentFileNameEl = document.getElementById('current-file-name');
                if (currentFileNameEl) {
                    currentFileNameEl.textContent = displayFileName;
                }
            } else {
                showNotification(`Save failed: ${result.error || 'Unknown error'}`, 'error');
                console.error('[renderer.js] Manual save-as failed:', result.error);
            }
        }
    } catch (error) {
        console.error('[saveFile] Error saving file:', error);
        showNotification('Save error: ' + error.message, 'error');
    }
}

// Add H1 heading with filename if needed
function addH1HeadingIfNeeded(content, fileName) {
    console.log('[addH1HeadingIfNeeded] Called with:', { content: content.substring(0, 50), fileName });
    
    // Clean the filename for use as a heading
    const cleanFileName = fileName
        .replace(/[-_]/g, ' ') // Replace dashes and underscores with spaces
        .replace(/\b\w/g, l => l.toUpperCase()); // Capitalize each word
    
    console.log('[addH1HeadingIfNeeded] Clean filename:', cleanFileName);
    
    // Check if content is empty or very short (just whitespace)
    const trimmedContent = content.trim();
    console.log('[addH1HeadingIfNeeded] Trimmed content length:', trimmedContent.length);
    
    if (trimmedContent.length === 0) {
        // Empty file - add H1 heading
        const result = `# ${cleanFileName}\n\n`;
        console.log('[addH1HeadingIfNeeded] Empty file - adding H1:', result);
        return result;
    }
    
    // Check if content already starts with an H1 heading
    const lines = content.split('\n');
    const firstNonEmptyLine = lines.find(line => line.trim().length > 0);
    console.log('[addH1HeadingIfNeeded] First non-empty line:', firstNonEmptyLine);
    
    if (firstNonEmptyLine && firstNonEmptyLine.trim().startsWith('# ')) {
        // Already has H1 heading - don't add another
        console.log('[addH1HeadingIfNeeded] Already has H1 - no change');
        return content;
    }
    
    // Check if content starts with slide markers (---) - presentation format
    if (firstNonEmptyLine && firstNonEmptyLine.trim() === '---') {
        // This is presentation content with slide markers
        // Add H1 as the first slide content, not before the markers
        console.log('[addH1HeadingIfNeeded] Detected slide markers - adding H1 as first slide');
        
        // Find the end of the first slide marker section
        let insertIndex = 0;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim() === '---') {
                insertIndex = i + 1;
                break;
            }
        }
        
        // Insert the H1 heading after the first slide marker
        const beforeMarker = lines.slice(0, insertIndex);
        const afterMarker = lines.slice(insertIndex);
        const result = beforeMarker.concat([`# ${cleanFileName}`, ''], afterMarker).join('\n');
        console.log('[addH1HeadingIfNeeded] Adding H1 after first slide marker:', result.substring(0, 100));
        return result;
    }
    
    // Add H1 heading at the beginning (normal content)
    const result = `# ${cleanFileName}\n\n${content}`;
    console.log('[addH1HeadingIfNeeded] Adding H1 to beginning:', result.substring(0, 100));
    return result;
}

// Force save-as dialog (always shows save dialog regardless of current file)
async function saveAsFile() {
    if (!editor) {
        showNotification('No editor available', 'error');
        return;
    }
    
    try {
        const content = editor.getValue();
        
        // Force save-as by always showing save dialog
        // Try to get default directory, with fallbacks
        let defaultDirectory = window.appSettings?.workingDirectory;
        if (!defaultDirectory) {
            // Try to load settings if not available
            try {
                const settings = await window.electronAPI.invoke('get-settings');
                defaultDirectory = settings?.workingDirectory;
            } catch (error) {
                console.warn('[renderer.js] saveAsFile - Failed to load settings:', error);
            }
        }
        
        
        const result = await window.electronAPI.invoke('perform-save-as', {
            content: content,
            defaultDirectory: defaultDirectory
        });
        
        if (result.success && result.filePath) {
            window.currentFilePath = result.filePath;
            window.editorFileName = result.filePath; // Also update editorFileName
            
            // Only add H1 heading for truly empty or very short content to avoid modifying existing files
            const fileName = result.filePath.split('/').pop().replace(/\.[^/.]+$/, ""); // Remove extension
            console.log('[saveAsFile] About to call addH1HeadingIfNeeded with fileName:', fileName);
            const trimmedContent = content.trim();
            const shouldAddHeading = trimmedContent.length === 0 || 
                                   (trimmedContent.length < 50 && !trimmedContent.includes('---') && !trimmedContent.startsWith('#'));
            
            if (shouldAddHeading) {
                const updatedContent = addH1HeadingIfNeeded(content, fileName);
                console.log('[saveAsFile] Content changed?', updatedContent !== content);
                
                // Update editor with new content if heading was added
                if (updatedContent !== content && editor) {
                    editor.setValue(updatedContent);
                    lastSavedContent = updatedContent;
                    
                    // Save the updated content with the heading
                    try {
                        const saveResult = await window.electronAPI.invoke('perform-save', updatedContent);
                        if (!saveResult.success) {
                            console.warn('[renderer.js] Failed to save file with H1 heading:', saveResult.error);
                        }
                    } catch (error) {
                        console.warn('[renderer.js] Error saving file with H1 heading:', error);
                    }
                } else {
                    lastSavedContent = content;
                }
            } else {
                // Skip adding heading for files with existing content or slide markers
                console.log('[saveAsFile] Skipping H1 heading addition for existing content');
                lastSavedContent = content;
            }
            
            hasUnsavedChanges = false;
            updateUnsavedIndicator(false);
            showNotification('File saved successfully', 'success');
            console.log('[renderer.js] Manual save-as completed successfully');
            
            // Update the file name display
            const displayFileName = result.filePath.split('/').pop();
            const currentFileNameEl = document.getElementById('current-file-name');
            if (currentFileNameEl) {
                currentFileNameEl.textContent = displayFileName;
            }
        } else {
            showNotification(`Save failed: ${result.error || 'Unknown error'}`, 'error');
            console.error('[renderer.js] Manual save-as failed:', result.error);
        }
    } catch (error) {
        console.error('[renderer.js] Manual save-as error:', error);
        showNotification('Save-as error: ' + error.message, 'error');
    }
}

// --- Text Extraction Feature ---

function showCustomPrompt(title, message, defaultValue = '') {
    return new Promise((resolve) => {
        // Create overlay
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        
        // Create dialog
        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background: white;
            border-radius: 8px;
            padding: 20px;
            min-width: 400px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;
        
        // Create content
        dialog.innerHTML = `
            <h3 style="margin: 0 0 15px 0; color: #333;">${title}</h3>
            <p style="margin: 0 0 15px 0; color: #666;">${message}</p>
            <input type="text" id="prompt-input" style="
                width: 100%;
                padding: 8px 12px;
                border: 1px solid #ddd;
                border-radius: 4px;
                font-size: 14px;
                margin-bottom: 15px;
                box-sizing: border-box;
            " placeholder="Enter filename..." value="${defaultValue}">
            <div style="text-align: right;">
                <button id="prompt-cancel" style="
                    background: #f5f5f5;
                    border: 1px solid #ddd;
                    padding: 8px 16px;
                    border-radius: 4px;
                    margin-right: 10px;
                    cursor: pointer;
                ">Cancel</button>
                <button id="prompt-ok" style="
                    background: #007acc;
                    color: white;
                    border: none;
                    padding: 8px 16px;
                    border-radius: 4px;
                    cursor: pointer;
                ">OK</button>
            </div>
        `;
        
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        
        // Focus input and select default text if present
        const input = dialog.querySelector('#prompt-input');
        input.focus();
        if (defaultValue) {
            input.select();
        }
        
        // Handle events
        const handleOK = () => {
            const value = input.value.trim();
            document.body.removeChild(overlay);
            resolve(value);
        };
        
        const handleCancel = () => {
            document.body.removeChild(overlay);
            resolve(null);
        };
        
        dialog.querySelector('#prompt-ok').onclick = handleOK;
        dialog.querySelector('#prompt-cancel').onclick = handleCancel;
        
        // Handle Enter key
        input.onkeydown = (e) => {
            if (e.key === 'Enter') {
                handleOK();
            } else if (e.key === 'Escape') {
                handleCancel();
            }
        };
        
        // Handle overlay click
        overlay.onclick = (e) => {
            if (e.target === overlay) {
                handleCancel();
            }
        };
    });
}

function generateDefaultFileName(text) {
    // Get first few words from the selected text
    const words = text
        .trim()
        .replace(/[^\w\s]/g, '') // Remove punctuation
        .split(/\s+/) // Split on whitespace
        .filter(word => word.length > 0) // Remove empty strings
        .slice(0, 3); // Take first 3 words
    
    if (words.length === 0) {
        return 'extracted-text';
    }
    
    // Join with hyphens and convert to lowercase
    return words.join('-').toLowerCase();
}

async function extractTextToNewFile() {
    console.log('\n=== EXTRACT TEXT TO NEW FILE - SIMPLIFIED APPROACH ===');
    
    if (!editor) {
        console.error('[extractTextToNewFile] No editor available');
        showNotification('No editor available', 'error');
        return;
    }
    
    // Get selected text 
    const selection = editor.getSelection();
    if (!selection || selection.isEmpty()) {
        showNotification('Please select text to extract', 'warning');
        return;
    }
    
    const selectedText = editor.getModel().getValueInRange(selection);
    if (!selectedText.trim()) {
        showNotification('Selected text is empty', 'warning');
        return;
    }
    
    console.log('[extractTextToNewFile] Selected text to extract:', JSON.stringify(selectedText));
    
    // Generate smart default filename from selected text
    const defaultFileName = generateDefaultFileName(selectedText);
    
    // Prompt for new file name
    const fileName = await showCustomPrompt(
        'Extract to New File', 
        'Enter name for new file (without .md extension):', 
        defaultFileName
    );
    if (!fileName) {
        return;
    }
    
    // Clean the filename
    const cleanFileName = fileName.trim().replace(/[^a-zA-Z0-9\s-_]/g, '').replace(/\s+/g, '-');
    if (!cleanFileName) {
        showNotification('Invalid file name', 'error');
        return;
    }
    
    try {
        // Get working directory
        let workingDirectory = window.appSettings?.workingDirectory;
        if (!workingDirectory) {
            try {
                const settings = await window.electronAPI.invoke('get-settings');
                workingDirectory = settings?.workingDirectory;
            } catch (error) {
                console.warn('[extractTextToNewFile] Failed to load settings:', error);
            }
        }
        
        // NEW APPROACH: Let the backend handle BOTH file creation AND text replacement
        const internalLink = `[[${cleanFileName}]]`;
        const newFilePath = `${workingDirectory}/${cleanFileName}.md`;
        const newFileContent = addH1HeadingIfNeeded(selectedText, cleanFileName);
        
        console.log('[extractTextToNewFile] Sending to backend - currentFile:', window.currentFilePath);
        console.log('[extractTextToNewFile] Text to replace:', JSON.stringify(selectedText));
        console.log('[extractTextToNewFile] Replacement link:', internalLink);
        
        const result = await window.electronAPI.invoke('extract-text-with-replacement', {
            // Original file info
            originalFilePath: window.currentFilePath,
            textToReplace: selectedText,
            replacementText: internalLink,
            
            // New file info  
            newFilePath: newFilePath,
            newFileContent: newFileContent,
            fileName: cleanFileName
        });
        
        if (result.success) {
            console.log(`[extractTextToNewFile] ✅ Backend successfully handled extraction and replacement!`);
            
            // Reload the modified original file content into the editor
            if (result.updatedOriginalContent) {
                console.log('[extractTextToNewFile] Reloading updated content into editor...');
                editor.setValue(result.updatedOriginalContent);
                lastSavedContent = result.updatedOriginalContent;
                hasUnsavedChanges = false;
                updateUnsavedIndicator(false);
                
                // Update preview
                if (window.updatePreviewAndStructure) {
                    window.updatePreviewAndStructure(result.updatedOriginalContent);
                }
            }
            
            showNotification(`Extracted text to new file: ${cleanFileName}.md`, 'success');
            
            // Refresh file tree to show new file
            if (window.renderFileTree) {
                window.renderFileTree();
            }
            
            // Optionally open the new file
            const shouldOpen = confirm(`Text extracted to ${cleanFileName}.md. Would you like to open the new file?`);
            if (shouldOpen) {
                const openResult = await window.electronAPI.invoke('open-file-path', newFilePath);
                if (openResult.success) {
                    await window.openFileInEditor(openResult.filePath, openResult.content);
                }
            }
        } else {
            console.error('[extractTextToNewFile] ❌ Backend extraction failed:', result.error);
            showNotification(`Failed to extract text: ${result.error}`, 'error');
        }
        
    } catch (error) {
        console.error('[extractTextToNewFile] Error:', error);
        showNotification(`Error extracting text: ${error.message}`, 'error');
    }
    
    console.log('=== EXTRACT TEXT TO NEW FILE - END ===\n');
}

function setupEditorContextMenu() {
    if (!editor) return;
    
    // Add context menu for text extraction
    editor.addAction({
        id: 'extract-to-file',
        label: 'Extract to New File',
        contextMenuGroupId: 'modification',
        contextMenuOrder: 1,
        precondition: 'editorHasSelection',
        keybindings: [
            monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyE
        ],
        run: function(ed) {
            extractTextToNewFile();
        }
    });
    
    console.log('[setupEditorContextMenu] Added extract-to-file context menu action');
}

function setupSmartMinimap(editor) {
    if (!editor) return;
    
    // Keep minimap enabled but start hidden to prevent layout shifts
    editor.updateOptions({
        minimap: {
            enabled: true,
            showSlider: 'always'
        }
    });
    
    let scrollTimeout;
    let isMinimapVisible = false;
    let isScrolling = false;
    
    // Add CSS for minimap opacity without layout changes
    const style = document.createElement('style');
    style.textContent = `
        .monaco-editor .minimap {
            opacity: 0;
            transition: opacity 0.3s ease;
            pointer-events: none;
        }
        .monaco-editor .minimap.smart-minimap-visible {
            opacity: 0.5;
            pointer-events: auto;
        }
    `;
    document.head.appendChild(style);
    
    // Initially hide the minimap
    setTimeout(() => {
        const minimapElement = document.querySelector('.monaco-editor .minimap');
        if (minimapElement) {
            minimapElement.classList.remove('smart-minimap-visible');
        }
    }, 100);
    
    // Show minimap on scroll
    function showMinimap() {
        if (!isMinimapVisible) {
            const minimapElement = document.querySelector('.monaco-editor .minimap');
            if (minimapElement) {
                minimapElement.classList.add('smart-minimap-visible');
                isMinimapVisible = true;
            }
        }
    }
    
    // Hide minimap after scroll stops
    function hideMinimap() {
        if (isMinimapVisible) {
            const minimapElement = document.querySelector('.monaco-editor .minimap');
            if (minimapElement) {
                minimapElement.classList.remove('smart-minimap-visible');
                isMinimapVisible = false;
            }
        }
    }
    
    // Listen for scroll events with proper debouncing
    editor.onDidScrollChange(() => {
        // Show minimap immediately on any scroll
        showMinimap();
        
        // Clear existing timeout
        clearTimeout(scrollTimeout);
        
        // Hide minimap after 1.5 seconds of no scrolling
        scrollTimeout = setTimeout(() => {
            hideMinimap();
        }, 1500);
    });
    
    console.log('[setupSmartMinimap] Smart minimap configured - shows on scroll with 50% opacity, no layout shifts');
}



// --- Global exports for modules ---
window.renderFileTree = renderFileTree;
window.debouncedRenderFileTree = debouncedRenderFileTree;
window.addTagFilter = addTagFilter; // Expose tag filter function
window.showFilesView = function() {
    // Switch to files view in the left sidebar
    if (showFilesBtn) {
        showFilesBtn.click();
    }
};

// === File Tree Keyboard Navigation ===
let currentSelectedFileIndex = -1;
let fileTreeItems = [];

function updateFileTreeItems() {
    const fileTreeView = document.getElementById('file-tree-view');
    if (!fileTreeView) return;
    
    // Get all file items (not folders)
    fileTreeItems = Array.from(fileTreeView.querySelectorAll('.file-tree-item'))
        .filter(item => item.classList.contains('file') && !item.classList.contains('folder'));
    
    console.log(`[FileTree Navigation] Found ${fileTreeItems.length} navigable files`);
}

function selectFileTreeItem(index) {
    if (!fileTreeItems.length) return;
    
    // Remove previous selection highlight
    fileTreeItems.forEach(item => item.classList.remove('keyboard-selected'));
    
    // Ensure index is within bounds
    if (index < 0) index = fileTreeItems.length - 1;
    if (index >= fileTreeItems.length) index = 0;
    
    currentSelectedFileIndex = index;
    const selectedItem = fileTreeItems[index];
    
    // Add selection highlight
    selectedItem.classList.add('keyboard-selected');
    
    // Scroll item into view
    selectedItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    
    console.log(`[FileTree Navigation] Selected file: ${selectedItem.dataset.path}`);
}

function moveFileSelection(direction) {
    updateFileTreeItems(); // Refresh the list in case files changed
    
    if (!fileTreeItems.length) {
        console.log('[FileTree Navigation] No files to navigate');
        return;
    }
    
    let newIndex = currentSelectedFileIndex + direction;
    selectFileTreeItem(newIndex);
}

function openSelectedFile() {
    if (currentSelectedFileIndex >= 0 && currentSelectedFileIndex < fileTreeItems.length) {
        const selectedItem = fileTreeItems[currentSelectedFileIndex];
        // Trigger click on the selected item
        selectedItem.click();
        console.log(`[FileTree Navigation] Opened selected file: ${selectedItem.dataset.path}`);
    }
}

function initializeFileTreeNavigation() {
    console.log('[FileTree Navigation] Initializing keyboard navigation...');
    
    // Add keyboard event listener
    document.addEventListener('keydown', (e) => {
        // Only handle navigation when file tree is focused or visible
        const fileTreeView = document.getElementById('file-tree-view');
        const leftPane = document.querySelector('.left-pane');
        
        if (!fileTreeView || !leftPane) return;
        
        // Check if left pane is visible (not collapsed)
        const leftPaneVisible = !leftPane.style.display || leftPane.style.display !== 'none';
        
        // Check if user is not typing in an input field
        const activeElement = document.activeElement;
        const isInputFocused = activeElement && (
            activeElement.tagName === 'INPUT' || 
            activeElement.tagName === 'TEXTAREA' || 
            activeElement.contentEditable === 'true' ||
            activeElement.classList.contains('monaco-editor')
        );
        
        if (!leftPaneVisible || isInputFocused) return;
        
        // Handle keyboard navigation
        switch(e.key) {
            case 'ArrowUp':
                e.preventDefault();
                moveFileSelection(-1);
                break;
                
            case 'ArrowDown':
                e.preventDefault();
                moveFileSelection(1);
                break;
                
            case 'Enter':
                e.preventDefault();
                openSelectedFile();
                break;
                
            case 'Home':
                e.preventDefault();
                selectFileTreeItem(0);
                break;
                
            case 'End':
                e.preventDefault();
                selectFileTreeItem(fileTreeItems.length - 1);
                break;
        }
    });
    
    // Update file list when tree is rendered
    const originalRenderFileTree = window.renderFileTree;
    window.renderFileTree = function(...args) {
        const result = originalRenderFileTree.apply(this, args);
        // Small delay to ensure DOM is updated
        setTimeout(() => {
            updateFileTreeItems();
            // Reset selection
            currentSelectedFileIndex = -1;
        }, 100);
        return result;
    };
}

// Initialize navigation when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeFileTreeNavigation);
} else {
    initializeFileTreeNavigation();
}
window.showNotification = showNotification;
window.updateAvailableFiles = updateAvailableFiles;
window.saveFile = saveFile;
window.saveAsFile = saveAsFile;
window.applyEditorSettings = applyEditorSettings;
window.extractTextToNewFile = extractTextToNewFile;
window.openFileInEditor = openFileInEditor;

// New file function - trigger the menu action
function newFile() {
    if (window.electronAPI) {
        window.electronAPI.invoke('trigger-new-file');
    }
}
window.newFile = newFile;

// Handler functions for Ash notification buttons
function handleAshThanks() {
    console.log('[renderer.js] User clicked Thanks on Ash feedback');
    // Close the notification
    const notification = document.getElementById('notification');
    if (notification) {
        notification.style.display = 'none';
    }
}

function copyAshToChat(response, sender) {
    console.log('[renderer.js] Copying Ash interaction to chat');
    try {
        // Try to add both the prompt and response to the chat if the chat system is available
        if (window.addMessage && typeof window.addMessage === 'function') {
            // Store the last explicit prompt that was sent to Ash
            if (window.lastExplicitAshPrompt) {
                // Add the user's prompt first
                window.addMessage(window.lastExplicitAshPrompt, 'You');
                // Add Ash's response
                window.addMessage(response, sender);
                console.log('[renderer.js] Successfully added Ash interaction to chat');
                showNotification('Conversation copied to chat', 'success');
            } else {
                // Just add the response if we don't have the prompt
                window.addMessage(response, sender);
                console.log('[renderer.js] Added Ash response to chat (no prompt available)');
                showNotification('Response copied to chat', 'success');
            }
        } else {
            console.warn('[renderer.js] Chat system not available, falling back to clipboard');
            // Fallback to copying to clipboard
            const fullConversation = window.lastExplicitAshPrompt 
                ? `**You:** ${window.lastExplicitAshPrompt}\n\n**${sender}:** ${response}`
                : `**${sender}:** ${response}`;
            
            navigator.clipboard.writeText(fullConversation).then(() => {
                console.log('[renderer.js] Ash conversation copied to clipboard');
                showNotification('Conversation copied to clipboard', 'success');
            }).catch(err => {
                console.error('[renderer.js] Failed to copy to clipboard:', err);
                showNotification('Failed to copy conversation', 'error');
            });
        }
    } catch (error) {
        console.error('[renderer.js] Error copying Ash conversation:', error);
        showNotification('Failed to copy conversation', 'error');
    }
}

// Function to show async-style feedback popup (matching AICompanionManager style)
function showAsyncStyleFeedback(message, persona = 'Ash', feedbackType = 'feedback') {
    // Store the message for copy functionality
    window.lastExplicitAshResponse = message;
    
    // Create or get feedback pane
    let feedbackPane = document.getElementById('ai-companion-feedback');
    
    if (!feedbackPane) {
        feedbackPane = document.createElement('div');
        feedbackPane.id = 'ai-companion-feedback';
        feedbackPane.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            max-width: 400px;
            background: white;
            border: 1px solid #ddd;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 1000;
            display: none;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;
        document.body.appendChild(feedbackPane);
        
        // Add CSS styles if not already added
        if (!document.getElementById('ai-feedback-styles')) {
            const style = document.createElement('style');
            style.id = 'ai-feedback-styles';
            style.textContent = `
                .ai-feedback-content { padding: 16px; }
                .ai-feedback-header { 
                    display: flex; justify-content: space-between; align-items: center;
                    margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #eee; 
                }
                .ai-persona { font-weight: 600; color: #333; }
                .ai-feedback-type { 
                    font-size: 12px; color: #666; background: #f5f5f5; 
                    padding: 2px 6px; border-radius: 3px; 
                }
                .ai-feedback-close { 
                    background: none; border: none; font-size: 18px; 
                    cursor: pointer; color: #999; 
                }
                .ai-feedback-close:hover { color: #666; }
                .ai-feedback-message { 
                    margin-bottom: 12px; line-height: 1.4; color: #444; 
                }
                .ai-feedback-footer { 
                    display: flex; justify-content: space-between; 
                    font-size: 11px; color: #888; margin-bottom: 12px; 
                }
                .ai-feedback-actions { 
                    display: flex; gap: 8px; justify-content: center; 
                }
                .ai-feedback-thanks-btn, .ai-feedback-save-btn { 
                    border: none; padding: 8px 16px; border-radius: 4px; 
                    cursor: pointer; font-size: 13px; font-weight: 500; 
                    transition: all 0.2s; 
                }
                .ai-feedback-thanks-btn { 
                    background: #f0f0f0; color: #333; border: 1px solid #ddd; 
                }
                .ai-feedback-thanks-btn:hover { background: #e0e0e0; }
                .ai-feedback-save-btn { background: #007acc; color: white; }
                .ai-feedback-save-btn:hover { background: #005a9e; }
                .ai-feedback-thanks-btn:active, .ai-feedback-save-btn:active { 
                    transform: translateY(1px); 
                }
            `;
            document.head.appendChild(style);
        }
    }
    
    const feedbackId = `feedback_${Date.now()}`;
    const currentTime = new Date().toLocaleTimeString();
    
    feedbackPane.innerHTML = `
        <div class="ai-feedback-content" data-feedback-id="${feedbackId}">
            <div class="ai-feedback-header">
                <span class="ai-persona">${persona}</span>
                <span class="ai-feedback-type">${feedbackType}</span>
                <button class="ai-feedback-close" onclick="this.parentElement.parentElement.parentElement.style.display='none'">×</button>
            </div>
            <div class="ai-feedback-message">${message}</div>
            <div class="ai-feedback-footer">
                <span class="ai-feedback-time">${currentTime}</span>
                <span class="ai-feedback-confidence">Explicit Request</span>
            </div>
            <div class="ai-feedback-actions">
                <button class="ai-feedback-thanks-btn" onclick="document.getElementById('ai-companion-feedback').style.display='none'">
                    👍 Thanks
                </button>
                <button class="ai-feedback-save-btn" onclick="copyAshToChat(window.lastExplicitAshResponse, '${persona}')">
                    📋 Copy to Chat
                </button>
            </div>
        </div>
    `;
    
    feedbackPane.style.display = 'block';
    
    // Auto-hide after 15 seconds
    setTimeout(() => {
        if (feedbackPane.style.display !== 'none') {
            feedbackPane.style.display = 'none';
        }
    }, 15000);
}

// Make the button handlers globally available
window.handleAshThanks = handleAshThanks;
window.copyAshToChat = copyAshToChat;
window.showAsyncStyleFeedback = showAsyncStyleFeedback;

// === Command Palette (VS Code-style Cmd+P) Implementation ===

let commandPaletteFiles = [];
let commandPaletteFilteredFiles = [];
let commandPaletteSelectedIndex = 0;

// Show command palette
function showCommandPalette() {
    if (!commandPaletteOverlay) return;
    
    commandPaletteOverlay.style.display = 'flex';
    commandPaletteInput.value = '';
    commandPaletteInput.focus();
    
    // Load and display all files
    loadCommandPaletteFiles();
}

// Hide command palette
function hideCommandPalette() {
    if (commandPaletteOverlay) {
        commandPaletteOverlay.style.display = 'none';
    }
}

// Load all available files
async function loadCommandPaletteFiles() {
    try {
        // Get all files from the file tree or use existing file data
        commandPaletteFiles = await getAllProjectFiles();
        commandPaletteFilteredFiles = [...commandPaletteFiles];
        commandPaletteSelectedIndex = 0;
        renderCommandPaletteResults();
    } catch (error) {
        console.error('[Command Palette] Error loading files:', error);
        commandPaletteResults.innerHTML = '<div class="command-palette-no-results">Error loading files</div>';
    }
}

// Get all project files recursively from current working directory
async function getAllProjectFiles() {
    try {
        const workingDir = window.currentDirectory || '.';
        const files = [];
        await scanDirectoryRecursively(workingDir, files, workingDir);
        return files;
    } catch (error) {
        console.error('[Command Palette] Error reading directory:', error);
        // Fallback: use existing loaded files if available
        const loadedFiles = [];
        if (window.fileTreeData && window.fileTreeData.children) {
            collectFilesFromTree(window.fileTreeData.children, loadedFiles);
        }
        return loadedFiles;
    }
}

// Recursively scan directory for files
async function scanDirectoryRecursively(dirPath, fileList, rootDir) {
    try {
        const items = await window.electronAPI.invoke('list-directory-files', dirPath);
        
        if (!items || !Array.isArray(items)) {
            console.warn('[Command Palette] No items returned for directory:', dirPath);
            return;
        }
        
        for (const item of items) {
            // Skip hidden files and directories
            if (item.name.startsWith('.')) continue;
            
            // Skip common non-essential directories
            if (item.isDirectory && ['node_modules', '.git', 'dist', 'build', '.vscode'].includes(item.name)) {
                continue;
            }
            
            if (item.isDirectory) {
                // Recursively scan subdirectory
                await scanDirectoryRecursively(item.path, fileList, rootDir);
            } else {
                // Add file to list
                const relativePath = item.path.replace(rootDir, '').replace(/^[\/\\]/, '');
                fileList.push({
                    name: item.name,
                    path: item.path,
                    relativePath: relativePath,
                    icon: getFileIcon(item.name)
                });
            }
        }
    } catch (error) {
        console.error('[Command Palette] Error scanning directory:', dirPath, error);
    }
}

// Recursively collect files from file tree data
function collectFilesFromTree(children, fileList, basePath = '') {
    for (const item of children) {
        if (item.type === 'file') {
            fileList.push({
                name: item.name,
                path: item.path,
                relativePath: basePath + item.name,
                icon: getFileIcon(item.name)
            });
        } else if (item.type === 'directory' && item.children) {
            collectFilesFromTree(item.children, fileList, basePath + item.name + '/');
        }
    }
}

// Get file icon based on file extension
function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const iconMap = {
        'md': '📝',
        'txt': '📄',
        'js': '📜',
        'ts': '📜',
        'json': '⚙️',
        'html': '🌐',
        'css': '🎨',
        'py': '🐍',
        'java': '☕',
        'cpp': '⚡',
        'c': '⚡',
        'pdf': '📕',
        'doc': '📘',
        'docx': '📘',
        'png': '🖼️',
        'jpg': '🖼️',
        'jpeg': '🖼️',
        'gif': '🖼️',
        'svg': '🖼️'
    };
    return iconMap[ext] || '📄';
}

// Filter files based on search query
function filterCommandPaletteFiles(query) {
    if (!query.trim()) {
        commandPaletteFilteredFiles = [...commandPaletteFiles];
    } else {
        const lowerQuery = query.toLowerCase();
        commandPaletteFilteredFiles = commandPaletteFiles.filter(file => 
            file.name.toLowerCase().includes(lowerQuery) ||
            file.relativePath.toLowerCase().includes(lowerQuery)
        );
    }
    commandPaletteSelectedIndex = 0;
    renderCommandPaletteResults();
}

// Render command palette results
function renderCommandPaletteResults() {
    if (!commandPaletteResults) return;
    
    if (commandPaletteFilteredFiles.length === 0) {
        commandPaletteResults.innerHTML = '<div class="command-palette-no-results">No files found</div>';
        return;
    }
    
    const html = commandPaletteFilteredFiles.map((file, index) => `
        <div class="command-palette-item ${index === commandPaletteSelectedIndex ? 'selected' : ''}" 
             data-index="${index}">
            <div class="command-palette-item-icon">${file.icon}</div>
            <div class="command-palette-item-name">${file.name}</div>
            <div class="command-palette-item-path">${file.relativePath}</div>
        </div>
    `).join('');
    
    commandPaletteResults.innerHTML = html;
    
    // No need to add individual click handlers - we'll use event delegation
}

// Open selected file
async function openCommandPaletteFile(file) {
    hideCommandPalette();
    try {
        // Read file content first
        const result = await window.electronAPI.invoke('read-file', file.path);
        if (result && result.success) {
            await openFileInEditor(result.filePath, result.content);
            // Save current file to settings
            window.electronAPI.invoke('set-current-file', result.filePath);
        } else {
            throw new Error(result?.error || 'Failed to read file');
        }
    } catch (error) {
        console.error('[Command Palette] Error opening file:', error);
        showNotification('Error opening file: ' + file.name, 'error');
    }
}

// Navigate selection in command palette
function moveCommandPaletteSelection(direction) {
    if (commandPaletteFilteredFiles.length === 0) return;
    
    if (direction === 'up') {
        commandPaletteSelectedIndex = Math.max(0, commandPaletteSelectedIndex - 1);
    } else if (direction === 'down') {
        commandPaletteSelectedIndex = Math.min(commandPaletteFilteredFiles.length - 1, commandPaletteSelectedIndex + 1);
    }
    
    renderCommandPaletteResults();
    
    // Scroll selected item into view
    const selectedItem = commandPaletteResults.querySelector('.command-palette-item.selected');
    if (selectedItem) {
        selectedItem.scrollIntoView({ block: 'nearest' });
    }
}

// Open currently selected file
function openSelectedCommandPaletteFile() {
    if (commandPaletteFilteredFiles.length > 0 && commandPaletteSelectedIndex >= 0) {
        const selectedFile = commandPaletteFilteredFiles[commandPaletteSelectedIndex];
        openCommandPaletteFile(selectedFile);
    }
}

// Initialize command palette event listeners
function initializeCommandPalette() {
    // Input event handler
    if (commandPaletteInput) {
        commandPaletteInput.addEventListener('input', (e) => {
            filterCommandPaletteFiles(e.target.value);
        });
        
        commandPaletteInput.addEventListener('keydown', (e) => {
            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    moveCommandPaletteSelection('down');
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    moveCommandPaletteSelection('up');
                    break;
                case 'Enter':
                    e.preventDefault();
                    openSelectedCommandPaletteFile();
                    break;
                case 'Escape':
                    e.preventDefault();
                    hideCommandPalette();
                    break;
            }
        });
    }
    
    // Results click handler using event delegation
    if (commandPaletteResults) {
        commandPaletteResults.addEventListener('click', (e) => {
            const item = e.target.closest('.command-palette-item');
            if (item) {
                e.preventDefault();
                e.stopPropagation();
                
                const index = parseInt(item.getAttribute('data-index'));
                if (!isNaN(index) && commandPaletteFilteredFiles[index]) {
                    console.log('[Command Palette] Clicked item at index:', index, 'File:', commandPaletteFilteredFiles[index].name);
                    commandPaletteSelectedIndex = index;
                    openCommandPaletteFile(commandPaletteFilteredFiles[index]);
                }
            }
        });
    }
    
    // Overlay click handler
    if (commandPaletteOverlay) {
        commandPaletteOverlay.addEventListener('click', (e) => {
            if (e.target === commandPaletteOverlay) {
                hideCommandPalette();
            }
        });
    }
}

// Initialize command palette when page loads
document.addEventListener('DOMContentLoaded', initializeCommandPalette);

// === Structure Manipulation Functions ===

// Promote heading level (H2 → H1, H3 → H2, etc.)
function promoteHeadingLevel(heading, index) {
    if (!editor || !editor.getModel()) {
        console.error('[Structure] Editor not available');
        return;
    }
    
    if (heading.level <= 1) {
        showNotification('Cannot promote H1 heading further', 'warning');
        return;
    }
    
    const model = editor.getModel();
    const lineNumber = heading.startLine + 1; // Monaco uses 1-based indexing
    const lineContent = model.getLineContent(lineNumber);
    
    // Remove one # from the beginning
    const newContent = lineContent.replace(/^#+/, (match) => match.slice(0, -1));
    
    const range = new monaco.Range(lineNumber, 1, lineNumber, lineContent.length + 1);
    const edit = {
        range: range,
        text: newContent,
        forceMoveMarkers: true
    };
    
    model.pushEditOperations([], [edit], () => null);
    showNotification(`Promoted heading to H${heading.level - 1}`, 'success');
}

// Demote heading level (H1 → H2, H2 → H3, etc.)
function demoteHeadingLevel(heading, index) {
    if (!editor || !editor.getModel()) {
        console.error('[Structure] Editor not available');
        return;
    }
    
    if (heading.level >= 6) {
        showNotification('Cannot demote H6 heading further', 'warning');
        return;
    }
    
    const model = editor.getModel();
    const lineNumber = heading.startLine + 1; // Monaco uses 1-based indexing
    const lineContent = model.getLineContent(lineNumber);
    
    // Add one # to the beginning
    const newContent = lineContent.replace(/^(#+)/, '$1#');
    
    const range = new monaco.Range(lineNumber, 1, lineNumber, lineContent.length + 1);
    const edit = {
        range: range,
        text: newContent,
        forceMoveMarkers: true
    };
    
    model.pushEditOperations([], [edit], () => null);
    showNotification(`Demoted heading to H${heading.level + 1}`, 'success');
}

// Move section up (including all subsections)
function moveSectionUp(heading, index) {
    if (!editor || !editor.getModel()) {
        console.error('[Structure] Editor not available');
        return;
    }
    
    if (index === 0) {
        showNotification('Section is already at the top', 'warning');
        return;
    }
    
    const model = editor.getModel();
    const markdownContent = model.getValue();
    const { headings } = extractHeadingsFromMarkdown(markdownContent);
    const processedHeadings = calculateHeadingEndLines(headings, model.getLineCount());
    
    const currentHeading = processedHeadings[index];
    const previousHeading = processedHeadings[index - 1];
    
    // Get the text content of both sections
    const currentSectionRange = new monaco.Range(
        currentHeading.startLine + 1, 1,
        currentHeading.endLine + 1, model.getLineLength(currentHeading.endLine + 1) + 1
    );
    let currentSectionText = model.getValueInRange(currentSectionRange);
    
    const previousSectionRange = new monaco.Range(
        previousHeading.startLine + 1, 1,
        previousHeading.endLine + 1, model.getLineLength(previousHeading.endLine + 1) + 1
    );
    let previousSectionText = model.getValueInRange(previousSectionRange);
    
    // Ensure proper newline handling
    if (!currentSectionText.endsWith('\n')) currentSectionText += '\n';
    if (!previousSectionText.endsWith('\n')) previousSectionText += '\n';
    
    // Create the combined range for both sections
    const combinedRange = new monaco.Range(
        previousHeading.startLine + 1, 1,
        currentHeading.endLine + 1, model.getLineLength(currentHeading.endLine + 1) + 1
    );
    
    // Swap the sections: current section first, then previous section
    const swappedText = currentSectionText + previousSectionText;
    
    const edit = {
        range: combinedRange,
        text: swappedText,
        forceMoveMarkers: true
    };
    
    model.pushEditOperations([], [edit], () => null);
    showNotification('Section moved up', 'success');
}

// Move section down (including all subsections)
function moveSectionDown(heading, index) {
    if (!editor || !editor.getModel()) {
        console.error('[Structure] Editor not available');
        return;
    }
    
    const model = editor.getModel();
    const markdownContent = model.getValue();
    const { headings } = extractHeadingsFromMarkdown(markdownContent);
    const processedHeadings = calculateHeadingEndLines(headings, model.getLineCount());
    
    if (index === processedHeadings.length - 1) {
        showNotification('Section is already at the bottom', 'warning');
        return;
    }
    
    const currentHeading = processedHeadings[index];
    const nextHeading = processedHeadings[index + 1];
    
    // Get the text content of both sections
    const currentSectionRange = new monaco.Range(
        currentHeading.startLine + 1, 1,
        currentHeading.endLine + 1, model.getLineLength(currentHeading.endLine + 1) + 1
    );
    let currentSectionText = model.getValueInRange(currentSectionRange);
    
    const nextSectionRange = new monaco.Range(
        nextHeading.startLine + 1, 1,
        nextHeading.endLine + 1, model.getLineLength(nextHeading.endLine + 1) + 1
    );
    let nextSectionText = model.getValueInRange(nextSectionRange);
    
    // Ensure proper newline handling
    if (!currentSectionText.endsWith('\n')) currentSectionText += '\n';
    if (!nextSectionText.endsWith('\n')) nextSectionText += '\n';
    
    // Create the combined range for both sections
    const combinedRange = new monaco.Range(
        currentHeading.startLine + 1, 1,
        nextHeading.endLine + 1, model.getLineLength(nextHeading.endLine + 1) + 1
    );
    
    // Swap the sections: next section first, then current section
    const swappedText = nextSectionText + currentSectionText;
    
    const edit = {
        range: combinedRange,
        text: swappedText,
        forceMoveMarkers: true
    };
    
    model.pushEditOperations([], [edit], () => null);
    showNotification('Section moved down', 'success');
}

// Image Viewer Function
function showImageViewer(imagePath) {
    console.log('[ImageViewer] Opening image:', imagePath);
    
    // Get the main content area
    const mainContent = document.getElementById('main-content');
    if (!mainContent) {
        console.error('[ImageViewer] Main content area not found');
        return;
    }
    
    // Store the current content to restore later
    const originalContent = mainContent.innerHTML;
    window.imageViewerOriginalContent = originalContent;
    
    // Create image viewer container
    const viewerContainer = document.createElement('div');
    viewerContainer.className = 'image-viewer-container';
    viewerContainer.style.cssText = `
        height: 100%;
        display: flex;
        flex-direction: column;
        background: #f8f9fa;
    `;
    
    // Create header bar
    const headerBar = document.createElement('div');
    headerBar.style.cssText = `
        height: 50px;
        border-bottom: 1px solid #ddd;
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: #f8f9fa;
        padding: 0 16px;
    `;
    
    // Create title
    const title = document.createElement('div');
    title.textContent = `📷 ${imagePath.split('/').pop()}`;
    title.style.cssText = `
        font-weight: bold;
        font-size: 14px;
        color: #333;
        display: flex;
        align-items: center;
        gap: 8px;
    `;
    
    // Create close button
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕ Back to Editor';
    closeBtn.style.cssText = `
        background: #007acc;
        color: white;
        border: none;
        border-radius: 4px;
        padding: 8px 12px;
        font-size: 12px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 4px;
    `;
    
    headerBar.appendChild(title);
    headerBar.appendChild(closeBtn);
    
    // Create image display area
    const imageArea = document.createElement('div');
    imageArea.style.cssText = `
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #fff;
        padding: 20px;
        overflow: auto;
    `;
    
    // Create image element
    const img = document.createElement('img');
    img.style.cssText = `
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    `;
    
    // Create loading message
    const loading = document.createElement('div');
    loading.textContent = '📷 Loading image...';
    loading.style.cssText = `
        color: #666;
        font-size: 16px;
        display: flex;
        align-items: center;
        gap: 8px;
    `;
    
    // Create image info panel
    const infoPanel = document.createElement('div');
    infoPanel.style.cssText = `
        position: absolute;
        bottom: 20px;
        left: 20px;
        right: 20px;
        background: rgba(0, 0, 0, 0.7);
        color: white;
        padding: 12px;
        border-radius: 6px;
        font-size: 12px;
        opacity: 0;
        transition: opacity 0.3s;
    `;
    
    // Set up image loading
    img.onload = () => {
        loading.style.display = 'none';
        
        // Update info panel
        infoPanel.innerHTML = `
            <div><strong>File:</strong> ${imagePath.split('/').pop()}</div>
            <div><strong>Path:</strong> ${imagePath}</div>
            <div><strong>Dimensions:</strong> ${img.naturalWidth} × ${img.naturalHeight}px</div>
        `;
        infoPanel.style.opacity = '1';
        
        console.log('[ImageViewer] Image loaded successfully');
    };
    
    img.onerror = () => {
        loading.textContent = '❌ Failed to load image';
        loading.style.color = 'red';
        console.error('[ImageViewer] Failed to load image:', imagePath);
    };
    
    // Convert file path to URL for display
    const imageUrl = `file://${imagePath}`;
    img.src = imageUrl;
    
    // Add elements to areas
    imageArea.appendChild(img);
    imageArea.appendChild(loading);
    
    // Make image area relative for info panel positioning
    imageArea.style.position = 'relative';
    imageArea.appendChild(infoPanel);
    
    // Add elements to container
    viewerContainer.appendChild(headerBar);
    viewerContainer.appendChild(imageArea);
    
    // Event handlers
    const closeViewer = () => {
        mainContent.innerHTML = window.imageViewerOriginalContent;
        delete window.imageViewerOriginalContent;
        console.log('[ImageViewer] Image viewer closed - restored editor');
    };
    
    closeBtn.addEventListener('click', closeViewer);
    
    // Close on Escape key
    const keyHandler = (e) => {
        if (e.key === 'Escape') {
            closeViewer();
            document.removeEventListener('keydown', keyHandler);
        }
    };
    document.addEventListener('keydown', keyHandler);
    
    // Replace main content with image viewer
    mainContent.innerHTML = '';
    mainContent.appendChild(viewerContainer);
}

// Make image viewer available globally
window.showImageViewer = showImageViewer;

