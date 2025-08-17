
// --- Electron IPC (for theme) ---
// Access IPC functions exposed by preload.js via window.electronAPI

// --- Electron Remote (for context menu) ---
// Context menu items (Menu, MenuItem) are now handled in the main process

// --- Global Variables ---
try {
    console.log('=== RENDERER.JS STARTUP DEBUG ===');
    console.log('[Renderer] Script loading started at:', new Date().toISOString());
    console.log('[Renderer] Document ready state:', document.readyState);
    console.log('[Renderer] window object exists:', typeof window !== 'undefined');
    console.log('[Renderer] require available:', typeof require !== 'undefined');
    console.log('===================================');
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
    
    // Count words (split by whitespace, filter empty strings)
    const words = content.trim().split(/\s+/).filter(word => word.length > 0);
    const wordCount = content.trim() === '' ? 0 : words.length;
    
    // Count characters
    const charCount = content.length;
    
    // Count lines
    const lineCount = content === '' ? 1 : content.split('\n').length;
    
    // Update status bar elements
    if (wordCountEl) wordCountEl.textContent = `Words: ${wordCount}`;
    if (charCountEl) charCountEl.textContent = `Characters: ${charCount}`;
    if (lineCountEl) lineCountEl.textContent = `Lines: ${lineCount}`;
    
    // Update cursor position if editor is available
    if (editor && editor.getPosition) {
        const position = editor.getPosition();
        if (cursorPosEl && position) {
            cursorPosEl.textContent = `Ln ${position.lineNumber}, Col ${position.column}`;
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
    
    // Check if MathJax is available
    if (typeof window.MathJax === 'undefined') {
        return; // MathJax not loaded yet
    }
    
    try {
        // Tell MathJax to process the new content
        await window.MathJax.typesetPromise([container]);
    } catch (error) {
        console.error('Error rendering math:', error);
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
    if (!markdownContent && window.editor && typeof window.editor.getValue === 'function') {
        markdownContent = window.editor.getValue();
    }
    if (!markdownContent) {
        markdownContent = '';
        console.warn('[renderer.js] markdownContent is undefined, using empty string');
    }
    
    // Check if this should be rendered as a Kanban board (async)
    const currentFilePath = window.currentFilePath;
    // Check for Kanban rendering
    
    if (currentFilePath) {
        // Handle Kanban check asynchronously
        window.electronAPI.invoke('get-settings')
            .then(async settings => {
                if (shouldRenderAsKanban(currentFilePath, settings)) {
                    // Add visual indicator to title
                    document.title = '📋 Kanban: ' + (currentFilePath.split('/').pop() || 'TODO');
                    
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
                document.title = '📝 ' + (currentFilePath.split('/').pop() || 'Markdown');
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

async function renderRegularMarkdown(markdownContent) {
    // Reset kanban state when switching to non-kanban files
    if (window.resetKanbanState) {
        window.resetKanbanState();
    }
    
    // Restore normal layout (in case we're switching from Kanban view)
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
    
    // Also reset any problematic saved layout that might be causing width issues
    const leftSidebar = document.getElementById('left-sidebar');
    if (leftSidebar && editorPane && previewPane) {
        // Check for corrupted layout values and reset if necessary
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
    
    // Also remove overflow constraints from preview content
    if (previewContent) {
        previewContent.style.setProperty('overflow-x', 'visible', 'important');
        previewContent.style.setProperty('overflow-y', 'visible', 'important');
        
        setTimeout(() => {
            previewContent.style.removeProperty('overflow-x');
            previewContent.style.removeProperty('overflow-y');
        }, 10);
    }
    
    // Update status bar with current content
    updateStatusBar(markdownContent);

    try {
        // Check if marked is available
        if (typeof marked === 'undefined') {
            console.error('[renderer.js] Marked library not loaded, using fallback');
            previewContent.innerHTML = '<pre>' + markdownContent + '</pre>';
            return;
        }
        
        // Create a custom Marked renderer
        const renderer = new marked.Renderer();
        const originalHeading = renderer.heading.bind(renderer); // Keep original renderer
        const originalImage = renderer.image.bind(renderer); // Keep original image renderer
        const originalParagraph = renderer.paragraph.bind(renderer); // Keep original paragraph renderer

        // Override the heading method
        renderer.heading = (text, level, raw) => {
            // Use the original renderer first to get the basic HTML
            let html = originalHeading(text, level, raw);
            // Generate the ID using the raw, unescaped text
            const id = `heading-${slugify(raw || text)}`; // Use raw, fallback to text if raw is undefined
            if (id !== 'heading-') { // Avoid empty IDs
                // Add the ID to the heading tag
                // This is a bit fragile; assumes the heading tag is the first tag
                 html = html.replace(/^(<h[1-6])/, `$1 id="${id}"`);
            } else {
            }
            return html;
        };

        // Override the image method to fix relative paths
        renderer.image = (href, title, text) => {
            // Check if this is a relative path
            if (href && !href.startsWith('http') && !href.startsWith('/') && !href.startsWith('file://')) {
                // Use current file directory if available, otherwise fallback to working directory
                const baseDir = window.currentFileDirectory || window.appSettings?.workingDirectory || '/Users/lmagee/Dev/hegel-pedagogy-ai/lectures';
                const fullPath = `file://${baseDir}/${href}`;
                return originalImage(fullPath, title, text);
            }
            return originalImage(href, title, text);
        };

        if (window.marked) {
            // Process content in the correct order: annotations first, then speaker notes, then internal links
            // processAnnotations is handled by the annotations.js module
            let processedContent = markdownContent;
            if (typeof processAnnotations === 'function') {
                processedContent = processAnnotations(markdownContent);
            }
            
            // Process speaker notes after annotations
            processedContent = processSpeakerNotes(processedContent);
            
            // Use the custom renderer with marked.parse first
            let htmlContent = window.marked.parse(processedContent, { renderer: renderer, gfm: true, breaks: true });
            
            // Process Obsidian-style [[]] internal links on the rendered HTML (now async)
            // processInternalLinks is handled by the internalLinks.js module
            if (typeof processInternalLinksHTML === 'function') {
                htmlContent = await processInternalLinksHTML(htmlContent);
            }
            
            // Apply preview zoom if available
            if (window.previewZoom) {
                htmlContent = await window.previewZoom.onPreviewUpdate(window.currentFilePath, htmlContent);
            }
            
            previewContent.innerHTML = htmlContent;
            
            // Render math equations with MathJax
            await renderMathInContent(previewContent);
            
            // Update speaker notes display if visible
            updateSpeakerNotesDisplay();
            
        } else {
            console.warn('[renderer.js] Marked instance not available yet');
            previewContent.innerHTML = '<p>Markdown preview loading...</p>';
        }
    } catch (error) {
        console.error('[renderer.js] Error parsing Markdown for preview:', error);
        previewContent.innerHTML = '<p>Error rendering Markdown preview.</p>';
    }

    // Update structure pane (ensure this happens after preview update)
    updateStructurePane(markdownContent);
}

// --- Structure Pane Logic ---
function updateStructurePane(markdownContent) {
    if (!markedInstance) {
        console.warn('[renderer.js] Marked instance not ready for structure pane.');
        return;
    }
    
    // Handle undefined or null markdownContent
    if (!markdownContent || typeof markdownContent !== 'string') {
        console.warn('[renderer.js] markdownContent is undefined or not a string:', markdownContent);
        const structurePane = document.getElementById('structure-pane');
        if (structurePane) {
            structurePane.innerHTML = '<p>No content to display structure.</p>';
        }
        return;
    }

    structureList.innerHTML = ''; // Clear existing structure
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

    // First pass: Identify headings and their start lines (Now done by iterating lines)
    // Second pass: Determine end lines
    for (let i = 0; i < headings.length; i++) {
        let nextHeadingLine = lines.length; // Default to end of doc
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

    // Populate the structure list
    headings.forEach((heading, index) => {
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

         // Add heading text
         const textSpan = document.createElement('span');
         textSpan.textContent = heading.title;
         li.appendChild(textSpan);

         li.draggable = true;
         li.dataset.startLine = heading.startLine; // Now uses the correct index
         li.dataset.endLine = heading.endLine;
         li.dataset.headingIndex = index; // Keep track of the original index
         li.dataset.level = heading.level;
         li.dataset.expanded = 'true'; // Default state
         li.dataset.headingText = heading.title; // Use heading.title here

         // Placeholder event handlers - Implement these functions later
         li.ondragstart = (event) => handleDragStart(event, heading);
         li.ondragover = (event) => handleDragOver(event);
         li.ondrop = (event) => handleDrop(event, heading);
         li.oncontextmenu = (event) => handleContextMenu(event, heading);
         // Optional: Add click listener to scroll editor
         li.onclick = (event) => {
            // Prevent triggering click if toggle icon was clicked
            if (event.target.classList.contains('structure-toggle')) {
                return;
            }

            const lineNumber = parseInt(li.dataset.startLine, 10) + 1; // Get startLine and add 1 for editor
            const headingText = li.dataset.headingText; // Get heading text from LI dataset

            // 1. Scroll Editor Pane
            if (editor && typeof editor.revealLineInCenter === 'function') {
                editor.revealLineInCenter(lineNumber);
                editor.setPosition({ lineNumber: lineNumber, column: 1 });
                editor.focus(); // Focus editor after scrolling
            } else {
            }

            // 2. Scroll Preview Pane
            if (headingText) {
                const previewId = `heading-${slugify(headingText)}`;
                const previewElement = document.getElementById(previewId);
                const previewContentDiv = document.getElementById('preview-content');

                if (previewElement && previewContentDiv) {
                    // --- Removed diagnostic logs ---
                    
                    // Wrap scroll in requestAnimationFrame to handle timing issues
                    requestAnimationFrame(() => {
                        previewElement.scrollIntoView({
                            behavior: 'smooth',
                            block: 'start' // Scrolls to the top of the element
                        });
                    });
                    
                } else {
                }
            } else {
            }
        };
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
}

function handleDragOver(event) {
    event.preventDefault(); // Necessary to allow dropping
    event.dataTransfer.dropEffect = 'move';
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
    }
}

// --- Context Menu Handler ---
function handleContextMenu(event, heading) {
    event.preventDefault(); // Prevent default browser context menu
    console.log('[renderer.js] Context menu triggered on structure pane.');

    const target = event.target;
    const li = target.closest('li'); // Find the closest list item

    if (li && li.dataset.lineNumber) {
        const lineNumberStr = li.dataset.lineNumber;
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
                                console.log('[renderer.js] Added code block folding range:', startLine, '->', endLine);
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
    
    console.log('[renderer.js] Folding keyboard shortcuts added');
    console.log('[renderer.js] Save keyboard shortcuts added');
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
    
    console.log('[renderer.js] Folding toolbar controls added');
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
        
        // Show only when text is selected
        precondition: 'editorHasSelection',
        
        run: async function(ed) {
            const selection = ed.getSelection();
            const selectedText = ed.getModel().getValueInRange(selection);
            
            if (!selectedText || selectedText.trim() === '') {
                console.warn('[renderer.js] No text selected for AI summarization');
                showNotification('Please select some text to summarize', 'warning');
                return;
            }
            
            
            try {
                // Show loading indicator
                showNotification('Generating speaker notes...', 'info');
                
                // Call the AI summarization service
                const result = await window.electronAPI.invoke('summarize-text-to-notes', selectedText);
                
                if (result.error) {
                    console.error('[renderer.js] AI summarization failed:', result.error);
                    showNotification(`Error: ${result.error}`, 'error');
                    return;
                }
                
                if (result.success) {
                    
                    // Replace selected text with the wrapped notes
                    ed.executeEdits('ai-summarization', [{
                        range: selection,
                        text: result.wrappedText
                    }]);
                    
                    showNotification(`Speaker notes generated using ${result.provider} (${result.model})`, 'success');
                    
                    // Log the transformation for debugging
                    console.log('[renderer.js] Original text replaced with notes:', {
                        original: selectedText.substring(0, 100) + '...',
                        heading: result.heading,
                        bullets: result.bullets,
                        provider: result.provider,
                        model: result.model
                    });
                }
            } catch (error) {
                console.error('[renderer.js] Error in AI summarization:', error);
                showNotification('Failed to generate speaker notes. Please try again.', 'error');
            }
        }
    });
    
    // Add context menu action for extracting notes content
    editor.addAction({
        id: 'extract-notes-content',
        label: '📝 Extract Notes Content',
        contextMenuGroupId: 'modification',
        contextMenuOrder: 1.6,
        
        // Show only when text is selected
        precondition: 'editorHasSelection',
        
        run: async function(ed) {
            const selection = ed.getSelection();
            const selectedText = ed.getModel().getValueInRange(selection);
            
            if (!selectedText || selectedText.trim() === '') {
                console.warn('[renderer.js] No text selected for notes extraction');
                showNotification('Please select some text to extract notes from', 'warning');
                return;
            }
            
            console.log(`[renderer.js] Starting notes extraction for selected text: "${selectedText.substring(0, 100)}..."`);
            
            try {
                // Show loading indicator
                showNotification('Extracting notes content...', 'info');
                
                // Call the notes extraction service
                const result = await window.electronAPI.invoke('extract-notes-content', selectedText);
                
                if (result.error) {
                    console.error('[renderer.js] Notes extraction failed:', result.error);
                    showNotification(`Error: ${result.error}`, 'error');
                    return;
                }
                
                if (result.success) {
                    console.log(`[renderer.js] Notes extraction successful: found ${result.blocksFound} block(s)`);
                    
                    // Replace selected text with the extracted notes content
                    ed.executeEdits('extract-notes', [{
                        range: selection,
                        text: result.extractedContent
                    }]);
                    
                    // Show success notification
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
    
    console.log('[renderer.js] Command palette action added to Monaco editor');
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
                addFoldingToolbarControls();
                addAISummarizationAction();
                addCommandPaletteAction();
            }, 100);
            
            await updatePreviewAndStructure(editor.getValue());
            editor.onDidChangeModelContent(async () => {
                const currentContent = editor.getValue();
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
                await openFileInEditor(window.restoredFileContent.path, window.restoredFileContent.content);
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
        let themeAppliedFromSettings = false;
        
        // Store flag for file restoration to coordinate with Monaco initialization
        window.hasFileToRestore = !!window.currentFilePath;
        
        // Load the last opened file if it exists
        if (window.currentFilePath) {
            console.log('[renderer.js] Restoring last opened file:', window.currentFilePath);
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
    
    // Detect file type
    const isPDF = filePath.endsWith('.pdf');
    const isHTML = filePath.endsWith('.html') || filePath.endsWith('.htm');
    const isBibTeX = filePath.endsWith('.bib');
    const isMarkdown = filePath.endsWith('.md') || filePath.endsWith('.markdown');
    
    // CRITICAL FIX: Only set current file path if this is NOT an internal link preview
    if (!options.isInternalLinkPreview) {
        console.log('[FILEPATH TRACE] Setting currentFilePath FROM:', window.currentFilePath, 'TO:', filePath);
        console.log('[FILEPATH TRACE] Stack:', new Error().stack);
        window.currentFilePath = filePath;
    } else {
        console.log('[FILEPATH TRACE] SKIPPING currentFilePath change (internal link preview)');
        console.log('[FILEPATH TRACE] Keeping currentFilePath as:', window.currentFilePath);
        console.log('[FILEPATH TRACE] Attempted to change to:', filePath);
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
        updateAIChatContext(filePath);
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

// Handle PDF file opening
function handlePDFFile(filePath) {
    console.log('[Renderer] Handling PDF file:', filePath);
    
    // Check for associated Markdown file
    const baseName = filePath.replace(/\.pdf$/i, '');
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
    console.log('[Renderer] handleEditableFile content length:', content ? content.length : 'NO CONTENT');
    console.log('[Renderer] Editor available:', !!editor, 'setValue function:', typeof editor?.setValue);
    
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

// Display PDF in preview panel
function displayPDFInPreview(filePath) {
    console.log('[Renderer] Displaying PDF in preview:', filePath);
    const previewContent = document.getElementById('preview-content');
    
    if (previewContent) {
        // Create PDF viewer using HTML5 embed or iframe
        const pdfViewer = `
            <div class="pdf-preview-container" style="width: 100%; height: 100vh; display: flex; flex-direction: column; position: absolute; top: 0; left: 0; right: 0; bottom: 0;">
                <div class="pdf-header" style="padding: 8px 12px; background: var(--preview-bg-color, #f8f9fa); border-bottom: 1px solid var(--border-color, #e1e4e8); font-weight: bold; flex-shrink: 0; font-size: 14px;">
                    📄 ${filePath.split('/').pop()}
                </div>
                <div style="flex: 1; position: relative; overflow: hidden; min-height: 0;">
                    <embed src="file://${filePath}" type="application/pdf" width="100%" height="100%" style="border: none; display: block;">
                    <div class="pdf-fallback" style="display: none; padding: 20px; text-align: center; color: #666;">
                        <p>📄 PDF preview not available</p>
                        <p><small>Path: ${filePath}</small></p>
                        <button onclick="window.electronAPI.invoke('open-external', '${filePath}')" style="margin-top: 10px; padding: 8px 16px; background: #007acc; color: white; border: none; border-radius: 4px; cursor: pointer;">Open in External Viewer</button>
                    </div>
                </div>
            </div>
        `;
        
        previewContent.innerHTML = pdfViewer;
        
        // Handle PDF load errors
        const embed = previewContent.querySelector('embed');
        if (embed) {
            embed.onerror = () => {
                console.warn('[Renderer] PDF embed failed, showing fallback');
                embed.style.display = 'none';
                previewContent.querySelector('.pdf-fallback').style.display = 'block';
            };
        }
    }
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
        textarea.value = window.restoredFileContent.content;
        console.log('[renderer.js] Using restored file content for fallback editor');
        // Clear the restored content flag
        window.restoredFileContent = null;
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
    textarea.addEventListener('input', async () => {
        await updatePreviewAndStructure(textarea.value);
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
    // Ctrl+B or Cmd+B: Bold
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        await formatText('**', '**', 'bold text');
        return;
    }
    
    // Ctrl+I or Cmd+I: Italic
    if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
        e.preventDefault();
        await formatText('*', '*', 'italic text');
        return;
    }
    
    // Ctrl+` or Cmd+`: Inline code
    if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        e.preventDefault();
        await formatText('`', '`', 'code');
        return;
    }
    
    // Ctrl+K or Cmd+K: Insert link
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        insertLink();
        return;
    }
    
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
});

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
        console.log('[renderer.js] Checking for gamification initialization function...');
        console.log('[renderer.js] window.initializeGamification exists:', typeof window.initializeGamification);
        if (window.initializeGamification) {
            try {
                console.log('[renderer.js] Calling initializeGamification...');
                window.initializeGamification();
                console.log('[renderer.js] Gamification system initialized successfully');
            } catch (error) {
                console.error('[renderer.js] Error initializing gamification:', error);
            }
        } else {
            console.warn('[renderer.js] initializeGamification function not found');
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
        switchStructureView('file'); // Switch to file view
        renderFileTree(); // Load the file tree
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
        switchStructureView('file'); // Switch to file view
        renderFileTree(); // Load the file tree
    }
    
    // Initialize AI Chat functionality
    if (window.initializeChatFunctionality) {
        console.log('[renderer.js] Initializing AI Chat functionality...');
        window.initializeChatFunctionality();
    } else {
        console.warn('[renderer.js] AI Chat initialization function not found');
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
                textarea.addEventListener('input', callback);
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
function showRightPane(paneType) {
    // Hide all content panes
    if (previewPane) previewPane.style.display = 'none';
    if (chatPane) chatPane.style.display = 'none';
    if (wholepartPane) wholepartPane.style.display = 'none';
    const searchPane = document.getElementById('search-pane');
    if (searchPane) searchPane.style.display = 'none';
    const speakerNotesPane = document.getElementById('speaker-notes-pane');
    if (speakerNotesPane) speakerNotesPane.style.display = 'none';
    
    // Remove active state from all toggle buttons
    if (showPreviewBtn) showPreviewBtn.classList.remove('active');
    if (showChatBtn) showChatBtn.classList.remove('active');
    if (showWholepartBtn) showWholepartBtn.classList.remove('active');
    const showSearchBtn = document.getElementById('show-search-btn');
    if (showSearchBtn) showSearchBtn.classList.remove('active');
    const showSpeakerNotesBtn = document.getElementById('show-speaker-notes-btn');
    if (showSpeakerNotesBtn) showSpeakerNotesBtn.classList.remove('active');
    
    // Show the requested pane and activate its button
    switch (paneType) {
        case 'preview':
            if (previewPane) previewPane.style.display = '';
            if (showPreviewBtn) showPreviewBtn.classList.add('active');
            break;
        case 'chat':
            if (chatPane) chatPane.style.display = '';
            if (showChatBtn) showChatBtn.classList.add('active');
            break;
        case 'search':
            const searchPane = document.getElementById('search-pane');
            if (searchPane) searchPane.style.display = '';
            const showSearchBtn = document.getElementById('show-search-btn');
            if (showSearchBtn) showSearchBtn.classList.add('active');
            break;
        case 'speaker-notes':
            const speakerNotesPane = document.getElementById('speaker-notes-pane');
            if (speakerNotesPane) speakerNotesPane.style.display = '';
            const showSpeakerNotesBtn = document.getElementById('show-speaker-notes-btn');
            if (showSpeakerNotesBtn) showSpeakerNotesBtn.classList.add('active');
            // Update speaker notes content when pane is shown
            updateSpeakerNotesDisplay();
            break;
        case 'wholepart':
            if (wholepartPane) wholepartPane.style.display = '';
            if (showWholepartBtn) showWholepartBtn.classList.add('active');
            // Initialize wholepart visualization when pane is shown
            if (window.initializeWholepartVisualization) {
                window.initializeWholepartVisualization();
            }
            break;
        default:
            // Default to preview if unknown pane type
            if (previewPane) previewPane.style.display = '';
            if (showPreviewBtn) showPreviewBtn.classList.add('active');
            break;
    }
}

// --- Structure Pane / File Tree Functions ---

/**
 * Switches the view in the structure pane between 'structure' and 'file'.
 * @param {'structure' | 'file'} view - The view to switch to.
 */
function switchStructureView(view) {
    currentStructureView = view;
    if (view === 'structure') {
        structurePaneTitle.textContent = 'Structure';
        showStructureBtn.classList.add('active');
        showFilesBtn.classList.remove('active');
        structureList.style.display = ''; // Show structure list
        const fileTreeView = document.getElementById('file-tree-view');
        if (fileTreeView) fileTreeView.style.display = 'none'; // Hide file tree
        newFolderBtn.style.display = 'none'; // Hide New Folder button
        changeDirectoryBtn.style.display = 'none'; // Hide Change Directory button
        // Optionally, re-run structure update if needed
        // updateStructurePane(editor?.getValue() || '');
    } else { // view === 'file'
        structurePaneTitle.textContent = 'Files';
        showStructureBtn.classList.remove('active');
        showFilesBtn.classList.add('active');
        structureList.style.display = 'none'; // Hide structure list
        const fileTreeView = document.getElementById('file-tree-view');
        if (fileTreeView) fileTreeView.style.display = ''; // Show file tree
        newFolderBtn.style.display = ''; // Show New Folder button
        changeDirectoryBtn.style.display = ''; // Show Change Directory button
        renderFileTree(); // Populate the file tree view
    }
}

// --- File Tree Functions ---
// Global state for tracking expanded folders
window.expandedFolders = window.expandedFolders || new Set();

async function renderFileTree() {
    console.log('[renderFileTree] Starting file tree render');
    if (!window.electronAPI) {
        console.warn('[renderFileTree] ElectronAPI not available');
        return;
    }
    
    const fileTreeView = document.getElementById('file-tree-view');
    
    try {
        const fileTree = await window.electronAPI.invoke('request-file-tree');
        
        if (!fileTreeView) {
            console.warn('[renderFileTree] fileTreeView element not found');
            return;
        }
        
        // Clear existing content
        fileTreeView.innerHTML = '';
        
        // Render the file tree
        if (fileTree && fileTree.children) {
            // Auto-expand the root directory and common folders on first load
            if (window.expandedFolders.size === 0) {
                expandCommonFolders(fileTree);
            }
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
    
    nodeElement.innerHTML = `
        ${expandArrow}
        <span class="file-icon">${icon}</span>
        <span class="file-name">${fileName}</span>
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
                renderFileTree(); // Re-render the tree to reflect changes
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
                const result = await window.electronAPI.invoke('open-file-path', node.path);
                console.log(`[renderFileTree] IPC result:`, result);
                if (result.success && window.openFileInEditor) {
                    console.log(`[renderFileTree] Calling openFileInEditor with:`, result.filePath, result.content ? result.content.substring(0, 100) + '...' : 'NO CONTENT');
                    await window.openFileInEditor(result.filePath, result.content);
                    console.log(`[renderFileTree] openFileInEditor completed`);
                } else {
                    console.error(`[renderFileTree] Failed to open file:`, result.success ? 'openFileInEditor not available' : result.error);
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
                showNotification('Rename functionality not yet implemented', 'warning');
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
            renderFileTree();
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
        // Always switch to file view and refresh file tree
        if (currentStructureView !== 'files') {
            console.log('[Renderer] Switching to file view');
            switchStructureView('file');
        }
        console.log('[Renderer] Calling renderFileTree()');
        renderFileTree();
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
            const htmlContent = generateHTMLFromMarkdown(content);
            
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
            const htmlContent = generateHTMLFromMarkdown(content);
            
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
            const htmlContent = generateHTMLFromMarkdown(content);
            
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



function showNotification(message, type = 'info') {
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
    notification.textContent = message;
    
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
        
        // Only save if we have a current file path
        if (window.currentFilePath && window.electronAPI) {
            const result = await window.electronAPI.invoke('perform-save', content);
            
            if (result.success) {
                lastSavedContent = content;
                hasUnsavedChanges = false;
                updateUnsavedIndicator(false);
                console.log('[renderer.js] Auto-save completed successfully');
                showNotification('Auto-saved', 'success', 1000); // Brief notification
                
                // Update current file path if this was a save-as operation
                if (result.filePath && result.filePath !== window.currentFilePath) {
                    window.currentFilePath = result.filePath;
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
    const sidebar = document.getElementById('left-sidebar');
    const resizer = document.getElementById('sidebar-resizer');
    const toggleBtn = document.getElementById('toggle-sidebar-btn');
    
    if (sidebarVisible) {
        sidebar.style.display = 'none';
        resizer.style.display = 'none';
        toggleBtn.style.background = '#ccc';
        toggleBtn.style.color = '#666';
    } else {
        sidebar.style.display = 'flex';
        resizer.style.display = 'block';
        toggleBtn.style.background = '#007acc';
        toggleBtn.style.color = 'white';
    }
    sidebarVisible = !sidebarVisible;
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
    const previewPane = document.getElementById('preview-pane');
    const toggleBtn = document.getElementById('toggle-preview-btn');
    
    if (previewVisible) {
        previewPane.style.display = 'none';
        toggleBtn.style.background = '#ccc';
        toggleBtn.style.color = '#666';
        // Adjust editor to take full width
        const editorPane = document.getElementById('editor-pane');
        if (editorPane) editorPane.style.flex = '1';
    } else {
        previewPane.style.display = 'flex';
        toggleBtn.style.background = '#007acc';
        toggleBtn.style.color = 'white';
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