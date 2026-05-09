
// Renderer initialization
// Replace console logging with IPC-based logging for visibility in main process
function debugLog(level, message, data) {
    if (window.electronAPI) {
        window.electronAPI.invoke('debug-log', level, message, data);
    }
    // Also keep console logs as fallback
    if (data !== undefined) {
        console[level](message, data);
    } else {
        console[level](message);
    }
}


// --- Electron IPC (for theme) ---
// Access IPC functions exposed by preload.js via window.electronAPI

// --- Electron Remote (for context menu) ---
// Context menu items (Menu, MenuItem) are now handled in the main process

// --- PDF Annotations Module ---
// Load PDF annotations using Electron's file system API
async function loadPDFAnnotationsModule() {
    try {
        // Use Electron's file system to read the pdfAnnotations.js file
        const filePath = './orchestrator/pdfAnnotations.js';
        const response = await window.electronAPI.invoke('read-file', filePath);
        
        if (response.success) {
            // Create a script element instead of using eval() to avoid CSP issues
            const script = document.createElement('script');
            script.type = 'text/javascript';
            script.textContent = response.content;
            
            // Add event handlers
            script.onload = script.onreadystatechange = function() {
                // Initialize CanvasTextSelector after module loads
                if (typeof initializeCanvasTextSelector === 'function') {
                    initializeCanvasTextSelector();
                }
            };
            
            script.onerror = function(error) {
                console.error('[renderer.js] Error executing PDF annotations script:', error);
                throw new Error('Failed to execute pdfAnnotations.js content');
            };
            
            // Append to head to execute
            document.head.appendChild(script);
            
        } else {
            throw new Error(`Failed to read pdfAnnotations.js: ${response.error}`);
        }
        
    } catch (error) {
        console.error('[renderer.js] Error loading PDF annotations via Electron API:', error);
        console.error('[renderer.js] Falling back to minimal implementation');
        
        // Fallback to minimal implementation
        class CanvasTextSelector {
            constructor() {
            }
        }
        
        window.CanvasTextSelector = CanvasTextSelector;
        window.clearAllHighlights = function() {};
        window.savePDFAnnotations = function() {};
        window.loadPDFAnnotations = function() {};
        
    }
}

// Load the module when DOM content is loaded or immediately if already loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadPDFAnnotationsModule);
} else {
    loadPDFAnnotationsModule();
}

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
window.hasUnsavedChanges = false; // Make this globally accessible
let lastSavedContent = '';
let suppressAutoSave = false; // Flag to temporarily disable auto-save during file operations

// Bridge suppressAutoSave to window so editor-tabs.js can control it during model swaps
Object.defineProperty(window, 'suppressAutoSave', {
    get() { return suppressAutoSave; },
    set(v) { suppressAutoSave = v; }
});

// Expose setter for lastSavedContent so editor-tabs.js can sync it during tab activation
window._setLastSavedContent = function(val) { lastSavedContent = val; };

// Tag filtering variables
let activeTagFilters = new Set();
let tagFilteringInitialized = false;

// File tree rendering state
let fileTreeRendered = false;
let isRenderingFileTree = false; // Prevent concurrent renders

// Multi-select state for file tree
let selectedFiles = new Set();        // Currently selected file paths
let lastSelectedFile = null;          // Last clicked file (for Shift+click range selection)
let allVisibleFiles = [];             // Ordered list of all visible file paths (for range selection)

// Currently "active" folder in the file tree — used as the default directory
// for new file / save-as dialogs. Updated when the user clicks a folder, opens
// a file (set to that file's parent), or right-clicks a folder. Falls back to
// appSettings.workingDirectory in saveFile/saveAsFile when null.
window.selectedFolderPath = null;
function setActiveTreeFolder(folderPath) {
    if (window.selectedFolderPath === folderPath) return;
    document.querySelectorAll('.file-tree-item.folder-active').forEach((el) => {
        el.classList.remove('folder-active');
    });
    window.selectedFolderPath = folderPath || null;
    if (folderPath) {
        const escaped = (window.CSS && typeof window.CSS.escape === 'function')
            ? window.CSS.escape(folderPath)
            : folderPath.replace(/(["\\])/g, '\\$1');
        const el = document.querySelector(`.file-tree-item.folder[data-path="${escaped}"]`);
        if (el) el.classList.add('folder-active');
    }
}
window.setActiveTreeFolder = setActiveTreeFolder;

// Speaker notes variables (currentSpeakerNotes managed by modules/status-bar.js via window.currentSpeakerNotes)
window.currentSpeakerNotes = window.currentSpeakerNotes || [];
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
const addWorkspaceFolderBtn = document.getElementById('add-workspace-folder-btn');
const chatMessages = document.getElementById('chat-messages');

// Source view elements
const previewSourceBtn = document.getElementById('preview-source-btn');
const previewSourceEl = document.getElementById('preview-source');
const previewSourceToolbar = document.getElementById('preview-source-toolbar');
const previewSourceFilepath = document.getElementById('preview-source-filepath');
const previewSourceOpenBtn = document.getElementById('preview-source-open-btn');
const previewSourceSyncToggle = document.getElementById('preview-source-sync-toggle');
const previewScrollSyncBtn = document.getElementById('preview-scroll-sync-btn');
let previewSourceMode = false;
let sourceViewFilePath = null; // null = mirror editor, string = independent file
let sourceViewSyncToEditor = true; // scroll sync enabled when mirroring
let previewScrollSyncEnabled = true; // global scroll sync on/off
let _syncingFromEditor = false;
let _syncingFromSource = false;

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

// File creation modal elements
const fileNameModal = document.getElementById('file-name-modal');
const fileNameInput = document.getElementById('file-name-input');
const fileNameError = document.getElementById('file-name-error');
const fileNameCancel = document.getElementById('file-name-cancel');
const fileNameCreate = document.getElementById('file-name-create');

// Track parent folder for context menu folder creation
let folderCreationParentPath = '';

// Track parent folder for context menu file creation
let fileCreationParentPath = '';

// File clipboard for cut/copy/paste operations
let fileClipboard = {
    filePath: null,
    operation: null  // 'cut' or 'copy'
};

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
// Status bar, speaker notes, and git status indicator extracted to modules/status-bar.js

async function showGitPublishDialog(gitInfo) {
    return new Promise((resolve) => {
        const isDarkMode = document.body.classList.contains('dark-mode');
        const status = gitInfo.status || {};

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
            background: ${isDarkMode ? '#1e1e1e' : 'white'};
            color: ${isDarkMode ? '#e0e0e0' : '#333'};
            border-radius: 8px;
            padding: 20px;
            min-width: 400px;
            max-width: 500px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;

        // Build status summary
        let statusHtml = '';
        if (status.total > 0) {
            const items = [];
            if (status.staged > 0) items.push(`<span style="color: #22c55e;">+${status.staged} staged</span>`);
            if (status.modified > 0) items.push(`<span style="color: #f59e0b;">~${status.modified} modified</span>`);
            if (status.untracked > 0) items.push(`<span style="color: #6366f1;">?${status.untracked} untracked</span>`);
            statusHtml = items.join(' &nbsp;|&nbsp; ');
        } else {
            statusHtml = '<span style="color: #22c55e;">✓ No changes to commit</span>';
        }

        dialog.innerHTML = `
            <h3 style="margin: 0 0 15px 0; display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 20px;">📤</span>
                Publish to Git
            </h3>
            <div style="margin-bottom: 15px; padding: 10px; background: ${isDarkMode ? '#2d2d2d' : '#f5f5f5'}; border-radius: 4px;">
                <div style="font-size: 12px; color: ${isDarkMode ? '#aaa' : '#666'}; margin-bottom: 4px;">Branch</div>
                <div style="font-weight: 500;">⎇ ${gitInfo.branch || 'unknown'}</div>
            </div>
            <div style="margin-bottom: 15px; padding: 10px; background: ${isDarkMode ? '#2d2d2d' : '#f5f5f5'}; border-radius: 4px;">
                <div style="font-size: 12px; color: ${isDarkMode ? '#aaa' : '#666'}; margin-bottom: 4px;">Changes</div>
                <div>${statusHtml}</div>
            </div>
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-weight: 500;">Commit Message</label>
                <textarea id="git-commit-message" style="
                    width: 100%;
                    height: 80px;
                    padding: 8px;
                    border: 1px solid ${isDarkMode ? '#3c3c3c' : '#ddd'};
                    border-radius: 4px;
                    background: ${isDarkMode ? '#2d2d2d' : 'white'};
                    color: ${isDarkMode ? '#e0e0e0' : '#333'};
                    font-family: inherit;
                    font-size: 13px;
                    resize: vertical;
                    box-sizing: border-box;
                " placeholder="Describe your changes..."></textarea>
            </div>
            <div style="display: flex; justify-content: flex-end; gap: 10px;">
                <button id="git-cancel" class="btn btn-sm btn-ghost">Cancel</button>
                <button id="git-publish" class="btn btn-sm btn-primary" ${status.total === 0 ? 'disabled' : ''}>
                    Commit & Push
                </button>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const messageInput = dialog.querySelector('#git-commit-message');
        const publishBtn = dialog.querySelector('#git-publish');
        const cancelBtn = dialog.querySelector('#git-cancel');

        messageInput.focus();

        const handlePublish = () => {
            const message = messageInput.value.trim();
            if (!message) {
                messageInput.style.borderColor = '#ef4444';
                return;
            }
            document.body.removeChild(overlay);
            resolve({ confirmed: true, message, gitInfo });
        };

        const handleCancel = () => {
            document.body.removeChild(overlay);
            resolve({ confirmed: false });
        };

        publishBtn.addEventListener('click', handlePublish);
        cancelBtn.addEventListener('click', handleCancel);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) handleCancel();
        });

        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
                handlePublish();
            } else if (e.key === 'Escape') {
                handleCancel();
            }
        });
    });
}

// Internal links processing is handled by the internalLinks.js module

// --- Process Annotations ---
// Annotations processing is handled by the annotations.js module

// --- Math Rendering Functions ---
// --- Lazy post-processing for large documents ---
// Uses IntersectionObserver to defer MathJax/Mermaid rendering to visible elements only.
let _mathObserver = null;
let _mermaidObserver = null;

function _typesetElement(el) {
    if (el.dataset.mathTypeset) return; // Already processed
    el.dataset.mathTypeset = '1';
    try {
        if (window.MathJax?.typesetPromise) {
            window.MathJax.typesetPromise([el]);
        } else if (window.MathJax?.typeset) {
            window.MathJax.typeset([el]);
        }
    } catch (error) {
        if (!error.message?.includes('typesetPromise')) {
            console.error('Error rendering math:', error);
        }
    }
}

async function renderMathInContent(container) {
    if (!container) return;
    if (typeof window.MathJax === 'undefined' || !window.MathJax) return;

    // For small documents or non-preview contexts, typeset everything at once
    const mathElements = container.querySelectorAll('mjx-container, .MathJax, script[type="math/tex"], [class*="math"]');
    const sectionCount = container.querySelectorAll('h1, h2, hr').length;
    if (sectionCount <= 10) {
        try {
            if (window.MathJax.typesetPromise) {
                await window.MathJax.typesetPromise([container]);
            } else if (window.MathJax.typeset) {
                window.MathJax.typeset([container]);
            } else if (window.MathJax.startup?.document) {
                window.MathJax.startup.document.clear();
                window.MathJax.startup.document.updateDocument();
            }
        } catch (error) {
            if (!error.message?.includes('typesetPromise')) {
                console.error('Error rendering math:', error);
            }
        }
        return;
    }

    // Large document: observe sections and typeset lazily
    if (_mathObserver) _mathObserver.disconnect();
    _mathObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (entry.isIntersecting) {
                _typesetElement(entry.target);
                _mathObserver.unobserve(entry.target);
            }
        }
    }, { rootMargin: '200px 0px' }); // Process slightly before entering viewport

    // Observe block-level containers (sections between headings/HRs) instead of individual elements
    const children = container.children;
    for (let i = 0; i < children.length; i++) {
        _mathObserver.observe(children[i]);
    }
}

// Helper function to render math in presentation slides
async function renderMathInPresentation() {
    const presentationContent = document.getElementById('presentation-content');
    if (presentationContent) {
        await renderMathInContent(presentationContent);
    }
}

// Render a single mermaid code block (used by the lazy observer path)
async function _renderSingleMermaidBlock(codeBlock) {
    try {
        const mermaidCode = codeBlock.textContent;
        const id = `mermaid-diagram-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const diagramDiv = document.createElement('div');
        diagramDiv.id = id;
        diagramDiv.className = 'mermaid-diagram';

        const { svg } = await window.mermaid.render(id, mermaidCode);
        diagramDiv.innerHTML = svg;

        const wrapper = document.createElement('div');
        wrapper.className = 'mermaid-diagram-wrapper';
        wrapper.appendChild(diagramDiv);

        const pre = codeBlock.closest('pre');
        if (pre) {
            pre.parentNode.replaceChild(wrapper, pre);
        } else {
            codeBlock.parentNode.replaceChild(wrapper, codeBlock);
        }
    } catch (error) {
        console.error('[Mermaid] Error rendering deferred diagram:', error);
    }
}

// Helper function to render Mermaid diagrams
// For large documents, defers rendering of offscreen diagrams via IntersectionObserver.
async function renderMermaidDiagrams(container) {
    if (!window.mermaid) {
        return;
    }

    try {
        // Find all code blocks with language=mermaid
        const mermaidBlocks = container.querySelectorAll('code.language-mermaid, pre.language-mermaid code');

        if (mermaidBlocks.length === 0) {
            return;
        }

        // For large documents with many mermaid blocks, render lazily
        const sectionCount = container.querySelectorAll('h1, h2, hr').length;
        if (sectionCount > 10 && mermaidBlocks.length > 2) {
            if (_mermaidObserver) _mermaidObserver.disconnect();
            _mermaidObserver = new IntersectionObserver((entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) {
                        _mermaidObserver.unobserve(entry.target);
                        // Render this single diagram inline
                        const block = entry.target.querySelector('code.language-mermaid, pre.language-mermaid code');
                        if (block) _renderSingleMermaidBlock(block, container);
                    }
                }
            }, { rootMargin: '300px 0px' });

            for (const block of mermaidBlocks) {
                const pre = block.closest('pre') || block.parentNode;
                _mermaidObserver.observe(pre);
            }
            return;
        }

        for (let i = 0; i < mermaidBlocks.length; i++) {
            const codeBlock = mermaidBlocks[i];
            const mermaidCode = codeBlock.textContent;

            // Create a unique ID for this diagram
            const id = `mermaid-diagram-${Date.now()}-${i}`;

            // Create a wrapper for the diagram with controls
            const wrapper = document.createElement('div');
            wrapper.className = 'mermaid-diagram-wrapper';

            // Create zoom controls
            const controls = document.createElement('div');
            controls.className = 'mermaid-zoom-controls';
            controls.innerHTML = `
                <button class="mermaid-zoom-btn" data-action="zoom-in" title="Zoom In">+</button>
                <button class="mermaid-zoom-btn" data-action="zoom-out" title="Zoom Out">−</button>
                <button class="mermaid-zoom-btn" data-action="reset" title="Reset Zoom">⟲</button>
                <button class="mermaid-zoom-btn" data-action="expand" title="Expand Diagram">⛶</button>
                <button class="mermaid-zoom-btn" data-action="download" title="Download as PNG">💾</button>
                <button class="mermaid-zoom-btn" data-action="copy" title="Copy to Clipboard">📋</button>
            `;

            // Create a div to hold the rendered diagram
            const diagramDiv = document.createElement('div');
            diagramDiv.id = id;
            diagramDiv.className = 'mermaid-diagram';

            try {
                // Render the diagram
                const { svg } = await window.mermaid.render(id, mermaidCode);

                // Set the SVG content
                diagramDiv.innerHTML = svg;

                // Remove any width/height constraints from the SVG to allow full-size rendering
                const svgElement = diagramDiv.querySelector('svg');
                if (svgElement) {
                    // Remove max-width if Mermaid added it
                    svgElement.style.maxWidth = 'none';
                    // Keep the viewBox for proper scaling, but remove fixed width/height
                    // Only keep the natural dimensions
                    const width = svgElement.getAttribute('width');
                    const height = svgElement.getAttribute('height');
                }

                // Assemble the wrapper
                wrapper.appendChild(controls);
                wrapper.appendChild(diagramDiv);

                // Replace the code block with the wrapper
                const pre = codeBlock.closest('pre');
                if (pre) {
                    pre.parentNode.replaceChild(wrapper, pre);
                } else {
                    codeBlock.parentNode.replaceChild(wrapper, codeBlock);
                }

                // Initialize panzoom on the diagram
                let panzoomInstance = null;
                if (window.Panzoom && svgElement) {
                    panzoomInstance = window.Panzoom(svgElement, {
                        maxScale: 10,
                        minScale: 0.1,
                        step: 0.3,
                        cursor: 'move'
                    });

                    // Attach control event listeners
                    controls.querySelector('[data-action="zoom-in"]').addEventListener('click', () => {
                        panzoomInstance.zoomIn();
                    });

                    controls.querySelector('[data-action="zoom-out"]').addEventListener('click', () => {
                        panzoomInstance.zoomOut();
                    });

                    controls.querySelector('[data-action="reset"]').addEventListener('click', () => {
                        panzoomInstance.reset();
                    });

                    // Add expand/collapse functionality
                    const expandBtn = controls.querySelector('[data-action="expand"]');
                    let overlayElement = null;
                    let originalParent = null;
                    let originalNextSibling = null;

                    expandBtn.addEventListener('click', () => {
                        // Check if we're currently in an overlay
                        if (overlayElement && document.body.contains(overlayElement)) {
                            // Close overlay

                            // Move wrapper back to original location
                            if (originalNextSibling) {
                                originalParent.insertBefore(wrapper, originalNextSibling);
                            } else {
                                originalParent.appendChild(wrapper);
                            }

                            // Remove overlay
                            document.body.removeChild(overlayElement);
                            document.body.style.overflow = '';
                            expandBtn.textContent = '⛶';
                            expandBtn.title = 'Expand Diagram';
                            overlayElement = null;

                            // Remove fullscreen classes
                            wrapper.classList.remove('mermaid-in-fullscreen');
                            diagramDiv.classList.remove('mermaid-in-fullscreen');
                            svgElement.classList.remove('mermaid-in-fullscreen');

                            // Destroy overlay panzoom before recreating
                            if (panzoomInstance) {
                                panzoomInstance.destroy();
                                panzoomInstance = null;
                            }

                            // Recreate panzoom instance for normal view
                            if (window.Panzoom) {
                                panzoomInstance = window.Panzoom(svgElement, {
                                    maxScale: 10,
                                    minScale: 0.1,
                                    step: 0.3,
                                    cursor: 'move'
                                });

                                // Re-enable wheel zoom
                                diagramDiv.addEventListener('wheel', (event) => {
                                    if (!event.ctrlKey && !event.metaKey) {
                                        return;
                                    }
                                    panzoomInstance.zoomWithWheel(event);
                                });
                            }
                        } else {
                            // Open overlay

                            // DESTROY panzoom before moving - this is the key!
                            if (panzoomInstance) {
                                panzoomInstance.destroy();
                                panzoomInstance = null;
                            }

                            // Store the original parent so we can restore later
                            originalParent = wrapper.parentNode;
                            originalNextSibling = wrapper.nextSibling;

                            // Create fullscreen overlay
                            overlayElement = document.createElement('div');
                            overlayElement.className = 'mermaid-fullscreen-overlay';
                            overlayElement.id = `overlay-${id}`;

                            // Move the wrapper into the overlay
                            overlayElement.appendChild(wrapper);
                            document.body.appendChild(overlayElement);
                            document.body.style.overflow = 'hidden';

                            // Clear any inline styles that panzoom may have set
                            wrapper.style.cssText = '';
                            diagramDiv.style.cssText = '';
                            svgElement.style.cssText = '';
                            svgElement.removeAttribute('width');
                            svgElement.removeAttribute('height');

                            // Add special class to force CSS overrides
                            wrapper.classList.add('mermaid-in-fullscreen');
                            diagramDiv.classList.add('mermaid-in-fullscreen');
                            svgElement.classList.add('mermaid-in-fullscreen');

                            // Recreate panzoom for the overlay
                            if (window.Panzoom) {
                                panzoomInstance = window.Panzoom(svgElement, {
                                    maxScale: 10,
                                    minScale: 0.1,
                                    step: 0.3,
                                    cursor: 'move'
                                });

                                // Re-enable wheel zoom
                                diagramDiv.addEventListener('wheel', (event) => {
                                    if (!event.ctrlKey && !event.metaKey) {
                                        return;
                                    }
                                    panzoomInstance.zoomWithWheel(event);
                                });
                            }

                            // Change expand button to close button
                            expandBtn.textContent = '✕';
                            expandBtn.title = 'Close (Esc)';

                            // Escape key handler
                            const overlayEscapeHandler = (event) => {
                                if (event.key === 'Escape' && overlayElement) {
                                    expandBtn.click(); // Reuse the button logic
                                    document.removeEventListener('keydown', overlayEscapeHandler);
                                }
                            };
                            document.addEventListener('keydown', overlayEscapeHandler);

                            // Click outside to close
                            overlayElement.addEventListener('click', (e) => {
                                if (e.target === overlayElement) {
                                    expandBtn.click(); // Reuse the button logic
                                }
                            });

                        }
                    });

                    // Add download functionality
                    const downloadBtn = controls.querySelector('[data-action="download"]');
                    downloadBtn.addEventListener('click', async () => {
                        try {
                            // Just download the SVG directly - simpler and more reliable
                            const svgData = svgElement.outerHTML;
                            const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `mermaid-diagram-${Date.now()}.svg`;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                        } catch (error) {
                            console.error('[Mermaid] Error downloading diagram:', error);
                            alert('Failed to download diagram: ' + error.message);
                        }
                    });

                    // Add copy to clipboard functionality
                    const copyBtn = controls.querySelector('[data-action="copy"]');
                    copyBtn.addEventListener('click', async () => {
                        try {
                            // Get the bounding box for actual rendered size
                            const bbox = svgElement.getBoundingClientRect();
                            const width = Math.ceil(bbox.width);
                            const height = Math.ceil(bbox.height);


                            // Create a new SVG with embedded styles
                            const svgClone = svgElement.cloneNode(true);

                            // Create a style element with all Mermaid styles
                            const styleEl = document.createElement('style');
                            // Get all stylesheets and extract Mermaid-related rules
                            let mermaidStyles = '';
                            for (const sheet of document.styleSheets) {
                                try {
                                    for (const rule of sheet.cssRules) {
                                        const ruleText = rule.cssText;
                                        // Include rules that might affect SVG/Mermaid
                                        if (ruleText.includes('mermaid') || ruleText.includes('node') ||
                                            ruleText.includes('edge') || ruleText.includes('cluster') ||
                                            ruleText.includes('label') || ruleText.includes('svg')) {
                                            mermaidStyles += ruleText + '\n';
                                        }
                                    }
                                } catch (e) {
                                    // Skip stylesheets we can't access (CORS)
                                }
                            }
                            styleEl.textContent = mermaidStyles;
                            svgClone.insertBefore(styleEl, svgClone.firstChild);

                            // Set proper attributes
                            svgClone.setAttribute('width', width);
                            svgClone.setAttribute('height', height);
                            svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

                            // Create canvas for PNG conversion
                            const scale = 2; // 2x for retina/high quality
                            const canvas = document.createElement('canvas');
                            canvas.width = width * scale;
                            canvas.height = height * scale;

                            const ctx = canvas.getContext('2d');
                            ctx.scale(scale, scale);
                            ctx.fillStyle = 'white';
                            ctx.fillRect(0, 0, width, height);

                            // Convert SVG to data URL
                            const svgString = new XMLSerializer().serializeToString(svgClone);
                            const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
                            const url = URL.createObjectURL(svgBlob);

                            const img = new Image();
                            img.onload = async () => {
                                ctx.drawImage(img, 0, 0, width, height);
                                URL.revokeObjectURL(url);

                                // Convert canvas to blob and copy to clipboard
                                canvas.toBlob(async (blob) => {
                                    try {
                                        await navigator.clipboard.write([
                                            new ClipboardItem({ 'image/png': blob })
                                        ]);

                                        // Visual feedback
                                        const originalText = copyBtn.textContent;
                                        copyBtn.textContent = '✓';
                                        setTimeout(() => {
                                            copyBtn.textContent = originalText;
                                        }, 1500);
                                    } catch (clipboardError) {
                                        console.error('[Mermaid] Clipboard error:', clipboardError);
                                        alert('Failed to copy to clipboard: ' + clipboardError.message);
                                    }
                                }, 'image/png');
                            };

                            img.onerror = (error) => {
                                console.error('[Mermaid] Image load error:', error);
                                URL.revokeObjectURL(url);
                                alert('Failed to convert diagram to PNG. Try downloading as SVG instead.');
                            };

                            img.src = url;
                        } catch (error) {
                            console.error('[Mermaid] Error copying diagram:', error);
                            alert('Failed to copy diagram: ' + error.message);
                        }
                    });

                    // Add Escape key handler for expanded diagrams
                    const escapeHandler = (event) => {
                        if (event.key === 'Escape' && wrapper.classList.contains('mermaid-expanded')) {
                            wrapper.classList.remove('mermaid-expanded');
                            expandBtn.textContent = '⛶';
                            expandBtn.title = 'Expand Diagram';
                            document.body.style.overflow = '';

                            // Restore original styles
                            diagramDiv.style.overflow = '';
                            diagramDiv.style.width = '';
                            diagramDiv.style.height = '';

                            svgElement.style.width = '';
                            svgElement.style.height = '';
                        }
                    };
                    document.addEventListener('keydown', escapeHandler);

                    // Enable mouse wheel zoom
                    diagramDiv.addEventListener('wheel', (event) => {
                        if (!event.ctrlKey && !event.metaKey) {
                            return;
                        }
                        panzoomInstance.zoomWithWheel(event);
                    });

                }
            } catch (error) {
                console.error(`[Mermaid] Error rendering diagram ${i + 1}:`, error);
                // Keep the code block if rendering fails
            }
        }
    } catch (error) {
        console.error('[Mermaid] Error in renderMermaidDiagrams:', error);
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
    
    // Keep source view in sync when active (only if mirroring editor, not showing independent file)
    if (previewSourceMode && previewSourceEl && !sourceViewFilePath) {
        previewSourceEl.textContent = markdownContent;
    }

    // Check if we should suppress this preview update (for PDF/non-markdown files)
    if (window.suppressNextPreviewUpdate || window.suppressPreviewUpdateCount > 0) {
        // Suppressing preview update as requested
        window.suppressNextPreviewUpdate = false;
        if (window.suppressPreviewUpdateCount > 0) {
            window.suppressPreviewUpdateCount--;
        }
        if (activeFileLoadToken) {
            finishLargeFileIndicator(activeFileLoadToken);
        }
        return;
    }
    
    if (!previewContent) {
        console.error('[renderer.js] previewContent element not found!');
        if (activeFileLoadToken) {
            finishLargeFileIndicator(activeFileLoadToken);
        }
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
        // Use cached settings to avoid IPC overhead on every preview update
        // Settings are cached in window.appSettings and refreshed when changed
        const settings = window.appSettings || {};

        // Only fetch settings if not cached (first load)
        const settingsPromise = window.appSettings
            ? Promise.resolve(settings)
            : window.electronAPI.invoke('get-settings');

        settingsPromise.then(async settings => {
            // Cache for future use
            if (!window.appSettings) window.appSettings = settings;
                if (typeof shouldRenderAsKanban === 'function' && shouldRenderAsKanban(currentFilePath, settings)) {
                    const loadToken = activeFileLoadToken;
                    if (loadToken) {
                        updateLargeFileIndicator(loadToken, 'Rendering board…');
                    }
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
                    
                    if (loadToken) {
                        finishLargeFileIndicator(loadToken);
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
            }
        }
    } catch (error) {
        shouldResetLayout = true;
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

// Debounced version of updatePreviewAndStructure for use during typing
// This prevents preview updates on every keystroke which causes sluggishness.
// Delay scales with document complexity to keep large documents responsive.
let previewUpdateTimeout = null;
function debouncedUpdatePreviewAndStructure(markdownContent, delay) {
    if (delay === undefined) {
        // Adaptive delay: count slide separators as a complexity proxy
        const slideCount = (markdownContent.match(/\n---[ \t]*\n/g) || []).length + 1;
        if (slideCount > 30) {
            delay = 500;
        } else if (slideCount > 10) {
            delay = 300;
        } else {
            delay = 150;
        }
    }
    if (previewUpdateTimeout) {
        clearTimeout(previewUpdateTimeout);
    }
    previewUpdateTimeout = setTimeout(() => {
        updatePreviewAndStructure(markdownContent);
        previewUpdateTimeout = null;
    }, delay);
}

function setupFallbackMarkdownRenderer() {
    // Use marked.use() with v16 token API (old Renderer API is broken in marked v16+)
    if (window._fallbackRendererConfigured) return;
    window._fallbackRendererConfigured = true;

    marked.use({
        renderer: {
            heading(token) {
                const text = token.text;
                const depth = token.depth;
                const raw = token.raw;
                const headingText = text != null ? text : (raw || '').replace(/^#+\s*/, '').trim();
                const headingSlugText = (headingText || '')
                    .replace(/<[^>]*>/g, '')
                    .trim();
                const id = `heading-${slugify(headingSlugText)}`;
                const headingHtml = this?.parser?.parseInline && Array.isArray(token.tokens)
                    ? this.parser.parseInline(token.tokens)
                    : headingText;
                if (id === 'heading-') {
                    return `<h${depth}>${headingHtml}</h${depth}>\n`;
                }
                return `<h${depth} id="${id}">${headingHtml}</h${depth}>\n`;
            },
            image({ href, title, text }) {
                const hrefStr = String(href || '');
                if (hrefStr && !hrefStr.startsWith('http') && !hrefStr.startsWith('/') && !hrefStr.startsWith('file://') && !hrefStr.startsWith('data:')) {
                    const baseDir = window.currentFileDirectory || window.appSettings?.workingDirectory;
                    const normalizedHref = hrefStr.replace(/^\.\//, '');
                    const fullPath = `file://${baseDir}/${normalizedHref}`;
                    const titleAttr = title ? ` title="${title}"` : '';
                    return `<img src="${fullPath}" alt="${text || ''}"${titleAttr} />`;
                }
                const titleAttr = title ? ` title="${title}"` : '';
                return `<img src="${hrefStr}" alt="${text || ''}"${titleAttr} />`;
            }
        },
        gfm: true,
        breaks: true
    });
}

function renderFrontmatterHeaderFallback(yamlBlock) {
    if (!yamlBlock) return '';
    const meta = {};
    for (const line of yamlBlock.split(/\r?\n/)) {
        const kv = line.match(/^(\w[\w-]*)\s*:\s*(.+)$/);
        if (kv) {
            const val = kv[2].replace(/^["']|["']$/g, '').trim();
            meta[kv[1].toLowerCase()] = val;
        }
    }
    const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const parts = [];
    if (meta.title) {
        parts.push(`<h1 class="frontmatter-title" style="margin-bottom: 0.2em;">${esc(meta.title)}</h1>`);
    }
    const sub = [meta.author, meta.date].filter(Boolean).map(esc).join(' &mdash; ');
    if (sub) {
        parts.push(`<p class="frontmatter-meta" style="color: #666; font-style: italic; margin-top: 0;">${sub}</p>`);
    }
    if (parts.length) parts.push('<hr>');
    return parts.join('\n');
}

// Fix headerless table snippets (e.g. |---|---| without a preceding header row)
function fixHeaderlessTables(markdown) {
    const lines = markdown.split('\n');
    const result = [];
    const sepRe = /^\|?([\s:]*-{1,}[\s:]*\|)+[\s:]*-{1,}[\s:]*\|?\s*$/;
    const rowRe = /^\|.*\|/;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (sepRe.test(line)) {
            const prev = i > 0 ? result[result.length - 1] : '';
            if (!rowRe.test(prev)) {
                const cols = line.replace(/^\||\|$/g, '').split('|').length;
                const header = '| ' + Array(cols).fill(' ').join(' | ') + ' |';
                result.push(header);
            }
        }
        result.push(line);
    }
    return result.join('\n');
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

    // Fix headerless tables for the fallback renderer
    processedContent = fixHeaderlessTables(processedContent);

    return processedContent;
}

async function renderMarkdownContent(markdownContent) {
    // Prefer the shared Techne markdown renderer plugin when available
    if (window.TechneMarkdownRenderer?.renderPreview) {
        try {
            await window.TechneMarkdownRenderer.renderPreview({
                markdownContent,
                previewElement: previewContent,
                filePath: window.currentFilePath || '',
                baseDir: window.currentFileDirectory || window.appSettings?.workingDirectory || '',
                processAnnotations: typeof processAnnotations === 'function' ? processAnnotations : null,
                processInternalLinksHTML: typeof processInternalLinksHTML === 'function' ? processInternalLinksHTML : null,
                previewZoom: window.previewZoom || null,
                renderMathInContent: typeof renderMathInContent === 'function' ? renderMathInContent : null,
                renderMermaidDiagrams: typeof renderMermaidDiagrams === 'function' ? renderMermaidDiagrams : null,
                updateSpeakerNotesDisplay: typeof updateSpeakerNotesDisplay === 'function' ? updateSpeakerNotesDisplay : null
            });
            return;
        } catch (pluginError) {
            console.warn('[renderer.js] TechneMarkdownRenderer failed, falling back:', pluginError);
        }
    }

    // Check if marked is available
    if (typeof marked === 'undefined') {
        console.error('[renderer.js] Marked library not loaded, using fallback');
        previewContent.innerHTML = '<pre>' + markdownContent + '</pre>';
        return;
    }

    if (!window.marked) {
        previewContent.innerHTML = '<p>Markdown preview loading...</p>';
        return;
    }

    setupFallbackMarkdownRenderer();

    // Strip frontmatter before markdown parsing and render header
    let bodyContent = markdownContent;
    let headerHtml = '';
    const fmMatch = markdownContent.match(/^(\uFEFF?\s*---\r?\n)([\s\S]*?\r?\n)(---\r?\n)/);
    if (fmMatch) {
        bodyContent = markdownContent.slice(fmMatch[0].length);
        headerHtml = renderFrontmatterHeaderFallback(fmMatch[2]);
    }

    const processedContent = processMarkdownContent(bodyContent);

    // Extract footnote definitions before marked parsing
    let contentForParsing = processedContent;
    let footnotes = null;
    if (window.TechneMarkdownRenderer?._extractFootnoteDefinitions) {
        const extracted = window.TechneMarkdownRenderer._extractFootnoteDefinitions(processedContent);
        contentForParsing = extracted.body;
        footnotes = extracted.footnotes;
    }

    // marked.use() was already called by setupFallbackMarkdownRenderer — just parse
    let htmlContent = window.marked.parse(contentForParsing);

    // Render footnote references and section
    if (footnotes && footnotes.size > 0 && window.TechneMarkdownRenderer?._renderFootnotes) {
        htmlContent = window.TechneMarkdownRenderer._renderFootnotes(htmlContent, footnotes, window.marked);
    }

    // Process Obsidian-style [[]] internal links on the rendered HTML
    if (typeof processInternalLinksHTML === 'function') {
        htmlContent = await processInternalLinksHTML(htmlContent);
    }

    // Apply preview zoom if available (but not for PDFs)
    const isPDF = window.currentFilePath && window.currentFilePath.endsWith('.pdf');
    if (window.previewZoom && !isPDF) {
        htmlContent = await window.previewZoom.onPreviewUpdate(window.currentFilePath, htmlContent);
    }

    previewContent.innerHTML = headerHtml + htmlContent;

    // Render math equations with MathJax
    await renderMathInContent(previewContent);

    // Render Mermaid diagrams
    await renderMermaidDiagrams(previewContent);

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

    const loadToken = activeFileLoadToken;
    if (loadToken) {
        updateLargeFileIndicator(loadToken, 'Rendering preview…');
        await waitForNextPaint();
    }

    try {
        if (isMarkdownFilePath(window.currentFilePath)) {
            await refreshBibliographyFromContent(window.currentFilePath, markdownContent);
        }
        await renderMarkdownContent(markdownContent);
        // Inject source line markers for scroll sync
        _injectSourceLineAttributes(previewContent, markdownContent);
        // Bind click handlers for inline citation keys
        if (window.TechneCitationRenderer?.bindCitationClickHandlers) {
            window.TechneCitationRenderer.bindCitationClickHandlers(previewContent);
        }
        if (typeof window.updatePreviewWordCount === 'function') {
            window.updatePreviewWordCount(previewContent);
        }
    } catch (error) {
        console.error('[renderer.js] Error parsing Markdown for preview:', error);
        previewContent.innerHTML = '<p>Error rendering Markdown preview.</p>';
        if (typeof window.updatePreviewWordCount === 'function') {
            window.updatePreviewWordCount(previewContent);
        }
    }

    const finalizeStructure = () => {
        updateStructurePane(markdownContent);
        if (loadToken) {
            finishLargeFileIndicator(loadToken);
        }
    };

    if (loadToken) {
        setTimeout(finalizeStructure, 0);
    } else {
        finalizeStructure();
    }
}

// --- Structure Pane Logic ---
// Helper functions for structure pane
function validateStructurePaneInputs(markdownContent) {
    if (!markedInstance) {
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

let _headingsCache = { hash: 0, result: null };

function extractHeadingsFromMarkdown(markdownContent) {
    // Cache: skip re-parsing if content unchanged
    const hash = _quickHash(markdownContent);
    if (hash === _headingsCache.hash && _headingsCache.result) {
        return _headingsCache.result;
    }

    const lines = markdownContent.split('\n');
    const headings = [];
    const headingRegex = /^(#{1,6})[ \t]+(.+?)(?:[ \t]+#+[ \t]*)?$/; // ATX headings with optional closing hashes

    // Iterate through lines to find headings and their correct line numbers
    for (let index = 0; index < lines.length; index++) {
        const trimmed = lines[index].trim();
        // Quick check: headings start with '#'
        if (trimmed.charCodeAt(0) !== 35) continue; // '#' = 35
        const match = trimmed.match(headingRegex);
        if (match) {
            headings.push({
                level: match[1].length,
                title: match[2].trim(),
                startLine: index,
                endLine: lines.length - 1
            });
        }
    }

    const result = { headings, totalLines: lines.length };
    _headingsCache = { hash, result };
    return result;
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
    const target = event.target;
    const li = target.closest('li'); // Find the closest list item

    if (li && (li.dataset.startLine || li.dataset.lineNumber)) {
        const lineNumberStr = li.dataset.startLine || li.dataset.lineNumber;
        // Ask the main process to show the context menu
        window.electronAPI.invoke('show-context-menu', { lineNumber: lineNumberStr })
          .catch(err => console.error('[renderer.js] Error invoking context menu:', err));
    } else {
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
        handleContextMenuAction(command, parseInt(lineNumber, 10)); // Reuse existing handler
    });
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
                    // Perform delete after successful copy
                    const deleteEdit = { range: range, text: null };
                    model.pushEditOperations([], [deleteEdit], () => null);
                })
                .catch(err => console.error('Failed to cut text: ', err));
            break;
        case 'copy':
            navigator.clipboard.writeText(text)
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
            } catch (err) {
                console.error('Failed to paste text: ', err);
            }
            break;
        case 'delete':
            const deleteEdit = { range: range, text: null };
            model.pushEditOperations([], [deleteEdit], () => null);
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
            await saveAsFile();
        }
    });

    // Add Insert Citation action (Ctrl/Cmd + Shift + C)
    editor.addAction({
        id: 'insert-citation',
        label: 'Insert Citation...',
        keybindings: [
            monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyC
        ],
        contextMenuGroupId: 'insert',
        contextMenuOrder: 1,
        run: async function() {
            await showCitationDialog();
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

// --- Editing Keyboard Shortcuts ---
function addEditingKeyboardShortcuts() {
    if (!editor) {
        console.warn('[renderer.js] Cannot add editing keybindings: editor not available');
        return;
    }

    editor.addAction({
        id: 'duplicate-line-or-selection',
        label: 'Duplicate Line or Selection',
        keybindings: [
            monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyD
        ],
        run: function(ed) {
            const duplicateAction = ed.getAction('editor.action.copyLinesDownAction');
            if (duplicateAction) {
                return duplicateAction.run();
            }
            console.warn('[renderer.js] Duplicate action unavailable on editor');
            return null;
        }
    });
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

// --- Keyboard Shortcuts Help Button ---
function addKeyboardShortcutsButton() {
    const shortcutsBtn = document.getElementById('keyboard-shortcuts-btn');

    if (shortcutsBtn) {
        shortcutsBtn.addEventListener('click', () => {
            showKeyboardShortcuts();
        });
    }

    // Also add keyboard shortcut to trigger help with '?'
    document.addEventListener('keydown', (event) => {
        // Only trigger if '?' is pressed without modifiers and not in an input field
        if (event.key === '?' && !event.metaKey && !event.ctrlKey && !event.altKey) {
            const activeElement = document.activeElement;
            const isInputField = activeElement && (
                activeElement.tagName === 'INPUT' ||
                activeElement.tagName === 'TEXTAREA' ||
                activeElement.isContentEditable
            );

            // Don't trigger if user is typing in an input field
            if (!isInputField) {
                event.preventDefault();
                showKeyboardShortcuts();
            }
        }
    });

    // Close modal on Escape key
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            const overlay = document.getElementById('keyboard-shortcuts-overlay');
            if (overlay && overlay.style.display === 'flex') {
                hideKeyboardShortcuts();
            }
        }
    });

    // Close modal when clicking outside
    const overlay = document.getElementById('keyboard-shortcuts-overlay');
    if (overlay) {
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) {
                hideKeyboardShortcuts();
            }
        });
    }
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
    
    try {
        showNotification('Extracting notes content...', 'info');
        
        const result = await window.electronAPI.invoke('extract-notes-content', selectedText);
        
        if (result.error) {
            console.error('[renderer.js] Notes extraction failed:', result.error);
            showNotification(`Error: ${result.error}`, 'error');
            return;
        }
        
        if (result.success) {
            
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
            
;
            
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
        // Skip when focus is in a text field — Alt+Arrow is word-jump on macOS
        const tag = event.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || event.target.isContentEditable) return;

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
    
}

// --- BibTeX Language Registration ---
function registerBibTeXLanguage() {
    
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
    
}

// --- Citation Autocomplete Functionality ---
let bibEntries = [];
let currentBibLoadToken = 0;
let lastBibliographyConfig = { filePath: null, signature: null };
let bibliographyRefreshTimer = null;
let bibliographyStatusTimer = null;
let fileLoadIndicatorTimer = null;
let activeFileLoadToken = 0;
const LARGE_MARKDOWN_CHAR_THRESHOLD = 200000;
// Expose bibEntries to window for citation renderer plugin
window.bibEntries = bibEntries;

// Allow citation manager to refresh bibEntries after edits
window.loadDatabaseCitationsIntoBibEntries = async function() {
    const dbEntries = await loadDatabaseCitations();
    // Replace DB-sourced entries while keeping .bib-sourced ones
    const bibSourced = bibEntries.filter(e => e.source !== 'database');
    bibEntries.length = 0;
    bibEntries.push(...bibSourced, ...dbEntries);
    window.bibEntries = bibEntries;
    if (window.TechneCitationRenderer?.invalidateCache) {
        window.TechneCitationRenderer.invalidateCache();
    }
    console.log(`[bibEntries] Refreshed: ${bibSourced.length} from .bib + ${dbEntries.length} from DB`);
};

function computeCitationKey(citation) {
    if (citation.key && typeof citation.key === 'string') {
        return citation.key;
    }
    if (citation.citation_key && typeof citation.citation_key === 'string') {
        return citation.citation_key;
    }

    let key = '';

    if (citation.authors) {
        const authors = citation.authors.split(/\s+and\s+/i);
        const firstAuthor = (authors[0] || '').trim();
        const lastName = firstAuthor.includes(',')
            ? firstAuthor.split(',')[0].trim()
            : firstAuthor.split(/\s+/).pop() || firstAuthor;
        key += lastName.replace(/[^A-Za-z]/g, '');
    } else {
        key += 'Citation';
    }

    key += (citation.publication_year || new Date().getFullYear());

    if (citation.title) {
        const cleanedWords = citation.title
            .split(/\s+/)
            .map(word => word.replace(/[^A-Za-z]/g, ''))
            .filter(Boolean);
        const significant = cleanedWords.filter(word => word.length > 3);
        const chosen = (significant.length > 0 ? significant : cleanedWords).slice(0, 2);
        if (chosen.length > 0) {
            key += chosen.join('');
        }
    }

    if (!key) {
        key = `Citation${citation.id || Date.now()}`;
    }

    citation.key = key;
    return key;
}

// Parse BibTeX entries from content (handles nested braces/quotes)
function parseBibTeX(content, sourceLabel = '') {
    const entries = [];

    if (!content || typeof content !== 'string') {
        return entries;
    }

    const isNameChar = (ch) => /[A-Za-z0-9_\-:]/.test(ch);

    const parseFields = (fieldsStr) => {
        const fields = {};
        let i = 0;
        const len = fieldsStr.length;

        while (i < len) {
            while (i < len && /[\s,]/.test(fieldsStr[i])) {
                i += 1;
            }
            if (i >= len) {
                break;
            }

            const nameStart = i;
            while (i < len && isNameChar(fieldsStr[i])) {
                i += 1;
            }
            const name = fieldsStr.slice(nameStart, i).trim().toLowerCase();
            if (!name) {
                break;
            }

            while (i < len && /\s/.test(fieldsStr[i])) {
                i += 1;
            }
            if (fieldsStr[i] !== '=') {
                while (i < len && fieldsStr[i] !== ',') {
                    i += 1;
                }
                if (fieldsStr[i] === ',') {
                    i += 1;
                }
                continue;
            }

            i += 1;
            while (i < len && /\s/.test(fieldsStr[i])) {
                i += 1;
            }

            let value = '';
            if (fieldsStr[i] === '{') {
                i += 1;
                const start = i;
                let depth = 1;
                let escaped = false;
                while (i < len && depth > 0) {
                    const ch = fieldsStr[i];
                    if (escaped) {
                        escaped = false;
                        i += 1;
                        continue;
                    }
                    if (ch === '\\') {
                        escaped = true;
                        i += 1;
                        continue;
                    }
                    if (ch === '{') {
                        depth += 1;
                    } else if (ch === '}') {
                        depth -= 1;
                    }
                    if (depth > 0) {
                        i += 1;
                    }
                }
                value = fieldsStr.slice(start, i);
                i += 1; // skip closing brace
            } else if (fieldsStr[i] === '"') {
                i += 1;
                const start = i;
                let escaped = false;
                while (i < len) {
                    const ch = fieldsStr[i];
                    if (escaped) {
                        escaped = false;
                        i += 1;
                        continue;
                    }
                    if (ch === '\\') {
                        escaped = true;
                        i += 1;
                        continue;
                    }
                    if (ch === '"') {
                        break;
                    }
                    i += 1;
                }
                value = fieldsStr.slice(start, i);
                i += 1; // skip closing quote
            } else {
                const start = i;
                while (i < len && fieldsStr[i] !== ',' && fieldsStr[i] !== '\n' && fieldsStr[i] !== '\r') {
                    i += 1;
                }
                value = fieldsStr.slice(start, i).trim();
            }

            if (name) {
                fields[name] = value.trim();
            }

            while (i < len && fieldsStr[i] !== ',') {
                i += 1;
            }
            if (fieldsStr[i] === ',') {
                i += 1;
            }
        }

        return fields;
    };

    let i = 0;
    const len = content.length;

    while (i < len) {
        const at = content.indexOf('@', i);
        if (at === -1) {
            break;
        }

        i = at + 1;
        while (i < len && /\s/.test(content[i])) {
            i += 1;
        }

        const typeStart = i;
        while (i < len && /[A-Za-z]/.test(content[i])) {
            i += 1;
        }
        const type = content.slice(typeStart, i).trim().toLowerCase();
        if (!type) {
            continue;
        }

        while (i < len && /\s/.test(content[i])) {
            i += 1;
        }

        const openChar = content[i];
        if (openChar !== '{' && openChar !== '(') {
            continue;
        }
        const closeChar = openChar === '{' ? '}' : ')';
        i += 1;

        while (i < len && /\s/.test(content[i])) {
            i += 1;
        }

        const keyStart = i;
        while (i < len && content[i] !== ',' && content[i] !== closeChar) {
            i += 1;
        }
        const key = content.slice(keyStart, i).trim();

        if (!key || type === 'comment' || type === 'preamble') {
            while (i < len && content[i] !== closeChar) {
                i += 1;
            }
            i += 1;
            continue;
        }

        if (content[i] === ',') {
            i += 1;
        }

        const fieldsStart = i;
        let depth = 0;
        let inQuotes = false;
        let escaped = false;

        for (; i < len; i += 1) {
            const ch = content[i];
            if (escaped) {
                escaped = false;
                continue;
            }
            if (ch === '\\') {
                escaped = true;
                continue;
            }
            if (inQuotes) {
                if (ch === '"') {
                    inQuotes = false;
                }
                continue;
            }
            if (ch === '"') {
                inQuotes = true;
                continue;
            }
            if (ch === '{') {
                depth += 1;
                continue;
            }
            if (ch === '}') {
                if (closeChar === '}' && depth === 0) {
                    break;
                }
                depth = Math.max(0, depth - 1);
                continue;
            }
            if (ch === ')' && closeChar === ')' && depth === 0 && !inQuotes) {
                break;
            }
        }

        const fieldsStr = content.slice(fieldsStart, i);
        i += 1;

        const fields = parseFields(fieldsStr);

        entries.push({
            key: key,
            type: type,
            title: fields.title || '',
            author: fields.author || '',
            year: fields.year || '',
            journal: fields.journal || '',
            booktitle: fields.booktitle || '',
            publisher: fields.publisher || '',
            volume: fields.volume || '',
            issue: fields.number || fields.issue || '',
            pages: fields.pages || '',
            doi: fields.doi || '',
            url: fields.url || '',
            abstract: fields.abstract || '',
            source: 'bibtex',
            sourceDetail: sourceLabel
        });
    }

    return entries;
}

function extractFrontmatter(content) {
    if (!content || typeof content !== 'string') {
        return null;
    }

    let normalized = content;
    if (normalized.charCodeAt(0) === 0xFEFF) {
        normalized = normalized.slice(1);
    }

    const lines = normalized.split(/\r?\n/);
    let i = 0;

    // Allow leading blank lines before frontmatter.
    while (i < lines.length && lines[i].trim() === '') {
        i += 1;
    }

    if (i >= lines.length || lines[i].trim() !== '---') {
        return null;
    }

    i += 1;
    const frontmatterLines = [];
    for (; i < lines.length; i += 1) {
        const line = lines[i];
        if (line.trim() === '---') {
            return frontmatterLines.join('\n');
        }
        frontmatterLines.push(line);
    }

    return null;
}

function normalizeBibliographyValue(value) {
    if (!value || typeof value !== 'string') {
        return '';
    }
    return value.trim().replace(/^['"]|['"]$/g, '').trim();
}

function parseBibliographyFromFrontmatter(frontmatter) {
    if (!frontmatter) {
        return [];
    }

    const lines = frontmatter.split(/\r?\n/);
    const bibFiles = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const match = line.match(/^\s*bibliography\s*:\s*(.*)$/);
        if (!match) {
            continue;
        }

        const value = match[1].trim();
        if (value) {
            if (value.startsWith('[') && value.endsWith(']')) {
                const list = value.slice(1, -1).split(',');
                list.forEach(item => {
                    const cleaned = normalizeBibliographyValue(item);
                    if (cleaned) {
                        bibFiles.push(cleaned);
                    }
                });
            } else if (value.includes(',')) {
                const list = value.split(',');
                list.forEach(item => {
                    const cleaned = normalizeBibliographyValue(item);
                    if (cleaned) {
                        bibFiles.push(cleaned);
                    }
                });
            } else {
                const cleaned = normalizeBibliographyValue(value);
                if (cleaned) {
                    bibFiles.push(cleaned);
                }
            }
        } else {
            for (let j = i + 1; j < lines.length; j++) {
                const nextLine = lines[j];
                const listMatch = nextLine.match(/^\s*-\s*(.+)$/);
                if (listMatch) {
                    const cleaned = normalizeBibliographyValue(listMatch[1]);
                    if (cleaned) {
                        bibFiles.push(cleaned);
                    }
                    continue;
                }
                if (/^\s*\w[\w-]*\s*:/.test(nextLine)) {
                    break;
                }
                if (!nextLine.trim()) {
                    continue;
                }
                break;
            }
        }
        break;
    }

    return bibFiles;
}

function isMarkdownFilePath(filePath) {
    return /\.(md|markdown)$/i.test(filePath || '');
}

function getDirectoryName(filePath) {
    if (!filePath || typeof filePath !== 'string') {
        return '';
    }
    const normalized = filePath.replace(/\\/g, '/');
    const lastSlash = normalized.lastIndexOf('/');
    return lastSlash >= 0 ? normalized.slice(0, lastSlash) : '';
}

function getRelativePath(fromDirectory, targetPath) {
    const normalizedFrom = (fromDirectory || '').replace(/\\/g, '/').replace(/\/+$/, '');
    const normalizedTarget = (targetPath || '').replace(/^file:\/\//, '').replace(/\\/g, '/');

    if (!normalizedFrom || !normalizedTarget.startsWith('/')) {
        return normalizedTarget;
    }

    const fromParts = normalizedFrom.split('/').filter(Boolean);
    const targetParts = normalizedTarget.split('/').filter(Boolean);
    let commonLength = 0;

    while (
        commonLength < fromParts.length &&
        commonLength < targetParts.length &&
        fromParts[commonLength] === targetParts[commonLength]
    ) {
        commonLength += 1;
    }

    const upSegments = fromParts.slice(commonLength).map(() => '..');
    const downSegments = targetParts.slice(commonLength);
    const relative = [...upSegments, ...downSegments].join('/');
    return relative || targetParts[targetParts.length - 1] || normalizedTarget;
}

function formatYamlBibliographyValue(value) {
    const cleaned = String(value || '').trim();
    if (/^[A-Za-z0-9_./@:-]+$/.test(cleaned)) {
        return cleaned;
    }
    return `"${cleaned.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function replaceBibliographyFrontmatterField(yamlBlock, bibReference) {
    const newline = yamlBlock.includes('\r\n') ? '\r\n' : '\n';
    const lines = yamlBlock.split(/\r?\n/);
    const replacement = `bibliography: ${formatYamlBibliographyValue(bibReference)}`;
    const output = [];
    let replaced = false;

    for (let i = 0; i < lines.length;) {
        const line = lines[i];
        if (/^\s*bibliography\s*:/.test(line)) {
            if (!replaced) {
                output.push(replacement);
            }
            replaced = true;
            i += 1;

            while (i < lines.length) {
                const continuation = lines[i];
                if (/^\s*-\s+/.test(continuation) || /^\s{2,}\S/.test(continuation)) {
                    i += 1;
                    continue;
                }
                break;
            }
            continue;
        }

        output.push(line);
        i += 1;
    }

    if (!replaced) {
        if (output.length > 0 && output[output.length - 1].trim() !== '') {
            output.push(replacement);
        } else if (output.length > 0) {
            output.splice(output.length - 1, 0, replacement);
        } else {
            output.push(replacement);
        }
    }

    return output.join(newline).replace(/\s+$/, '');
}

function upsertBibliographyFrontmatter(content, bibReference) {
    const markdown = typeof content === 'string' ? content : '';
    const bom = markdown.charCodeAt(0) === 0xFEFF ? '\uFEFF' : '';
    const body = bom ? markdown.slice(1) : markdown;
    const match = body.match(/^([ \t]*(?:\r?\n[ \t]*)*)(---[ \t]*\r?\n)([\s\S]*?)(\r?\n---[ \t]*(?:\r?\n|$))/);

    if (!match) {
        return `${bom}---\nbibliography: ${formatYamlBibliographyValue(bibReference)}\n---\n\n${body}`;
    }

    const updatedYaml = replaceBibliographyFrontmatterField(match[3], bibReference);
    const afterFrontmatter = body.slice(match[0].length);
    return `${bom}${match[1]}${match[2]}${updatedYaml}${match[4]}${afterFrontmatter}`;
}

async function setBibliographyForMarkdownFile(filePath = window.currentFilePath) {
    if (!filePath) {
        showNotification('Open or select a Markdown file first', 'warning');
        return;
    }

    if (!isMarkdownFilePath(filePath)) {
        showNotification('BibTeX bibliographies can be attached to Markdown files', 'warning');
        return;
    }

    if (!window.electronAPI?.invoke) {
        showNotification('File dialog is not available', 'error');
        return;
    }

    const markdownDirectory = getDirectoryName(filePath);
    const selection = await window.electronAPI.invoke('dialog-open-file', {
        title: 'Select BibTeX Bibliography',
        defaultPath: markdownDirectory || window.currentFileDirectory || window.appSettings?.workingDirectory || undefined,
        filters: [
            { name: 'BibTeX Bibliography', extensions: ['bib'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });

    if (!selection?.success || !selection.filePath) {
        return;
    }

    const bibReference = getRelativePath(markdownDirectory, selection.filePath);
    const isCurrentFile = window.currentFilePath === filePath && editor;
    let markdownContent = isCurrentFile ? editor.getValue() : '';
    let expectedMtimeMs = null;

    if (!isCurrentFile) {
        const readResult = await window.electronAPI.invoke('read-file', filePath);
        if (!readResult?.success) {
            showNotification(readResult?.error || 'Failed to read Markdown file', 'error');
            return;
        }
        markdownContent = readResult.content || '';
        expectedMtimeMs = readResult.mtimeMs;
    }

    const updatedContent = upsertBibliographyFrontmatter(markdownContent, bibReference);
    if (updatedContent === markdownContent) {
        showNotification('Bibliography was already set to that file', 'info');
        return;
    }

    const saveOptions = Number.isFinite(expectedMtimeMs) ? { expectedMtimeMs } : {};
    let saveResult = await window.electronAPI.invoke('perform-save-with-path', updatedContent, filePath, saveOptions);

    if (!saveResult?.success && saveResult?.code === 'FILE_MODIFIED_EXTERNALLY') {
        const overwriteConfirmed = window.confirm(
            'This Markdown file changed on disk before the bibliography could be attached. Overwrite it and create a backup?'
        );
        if (!overwriteConfirmed) {
            showNotification('Bibliography update canceled', 'warning');
            return;
        }
        saveResult = await window.electronAPI.invoke('perform-save-with-path', updatedContent, filePath, {
            force: true,
            expectedMtimeMs: saveResult.currentMtimeMs
        });
    }

    if (!saveResult?.success) {
        showNotification(saveResult?.error || 'Failed to save bibliography setting', 'error');
        return;
    }

    if (isCurrentFile) {
        const previousSuppressAutoSave = suppressAutoSave;
        suppressAutoSave = true;
        editor.setValue(updatedContent);
        suppressAutoSave = previousSuppressAutoSave;
        lastSavedContent = updatedContent;
        window.hasUnsavedChanges = false;
        updateUnsavedIndicator(false);
        if (window.tabManager) {
            window.tabManager.syncActiveTabDirty(false, updatedContent);
        }
    }

    updateLastBibliographyConfig(null, null);
    const loaded = await loadBibliographyForMarkdownFile(filePath, updatedContent);
    if (!loaded) {
        await loadBibTeXFiles();
    }

    if (isCurrentFile) {
        await updatePreviewAndStructure(updatedContent);
    }

    showNotification(`Attached bibliography: ${bibReference}`, 'success');
}

window.setBibliographyForMarkdownFile = setBibliographyForMarkdownFile;

function showBibliographyStatus(message, duration = 2000) {
    const statusEl = document.getElementById('bib-status');
    if (!statusEl) {
        return;
    }

    statusEl.textContent = message;
    statusEl.style.display = '';

    if (bibliographyStatusTimer) {
        clearTimeout(bibliographyStatusTimer);
    }

    bibliographyStatusTimer = setTimeout(() => {
        statusEl.textContent = '';
        statusEl.style.display = 'none';
        bibliographyStatusTimer = null;
    }, duration);
}

function formatBibliographyStatus(bibliographyFiles) {
    if (!Array.isArray(bibliographyFiles) || bibliographyFiles.length === 0) {
        return 'Bibliography: workspace';
    }
    if (bibliographyFiles.length === 1) {
        return `Bibliography: ${bibliographyFiles[0]}`;
    }
    return `Bibliography: ${bibliographyFiles.length} files`;
}

function formatFileSize(bytes) {
    if (!Number.isFinite(bytes)) {
        return '';
    }
    if (bytes < 1024) {
        return `${bytes} B`;
    }
    const kb = bytes / 1024;
    if (kb < 1024) {
        return `${Math.round(kb)} KB`;
    }
    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB`;
}

function waitForNextPaint() {
    return new Promise(resolve => {
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => resolve());
        } else {
            setTimeout(resolve, 0);
        }
    });
}

function startLargeFileIndicator(filePath, contentLength) {
    const statusEl = document.getElementById('load-status');
    if (!statusEl) {
        return 0;
    }

    const token = ++activeFileLoadToken;
    const fileName = filePath ? filePath.split('/').pop() : 'file';
    const sizeLabel = formatFileSize(contentLength);
    const baseMessage = sizeLabel ? `Loading ${fileName} (${sizeLabel})…` : `Loading ${fileName}…`;

    if (fileLoadIndicatorTimer) {
        clearTimeout(fileLoadIndicatorTimer);
    }

    fileLoadIndicatorTimer = setTimeout(() => {
        if (activeFileLoadToken !== token) {
            return;
        }
        statusEl.textContent = baseMessage;
        statusEl.style.display = '';
    }, 120);

    return token;
}

function updateLargeFileIndicator(token, message) {
    const statusEl = document.getElementById('load-status');
    if (!statusEl || token === 0 || activeFileLoadToken !== token) {
        return;
    }
    statusEl.textContent = message;
    statusEl.style.display = '';
}

function finishLargeFileIndicator(token) {
    const statusEl = document.getElementById('load-status');
    if (!statusEl || token === 0 || activeFileLoadToken !== token) {
        return;
    }

    if (fileLoadIndicatorTimer) {
        clearTimeout(fileLoadIndicatorTimer);
        fileLoadIndicatorTimer = null;
    }

    statusEl.textContent = '';
    statusEl.style.display = 'none';
    activeFileLoadToken = 0;
}

function getBibliographySignature(filePath, bibliographyFiles) {
    if (!bibliographyFiles || bibliographyFiles.length === 0) {
        return null;
    }

    const normalized = bibliographyFiles
        .map(normalizeBibliographyValue)
        .filter(Boolean);

    if (normalized.length === 0) {
        return null;
    }

    return `${filePath || ''}::${normalized.join('|')}`;
}

function updateLastBibliographyConfig(filePath, signature) {
    lastBibliographyConfig = {
        filePath: filePath || null,
        signature: signature || null
    };
}

function resolveBibliographyPath(bibPath, baseDir) {
    if (!bibPath || typeof bibPath !== 'string') {
        return null;
    }

    let cleaned = bibPath.trim().replace(/^file:\/\//, '');
    if (/^[A-Za-z]:[\\/]/.test(cleaned) || cleaned.startsWith('/')) {
        return cleaned;
    }

    cleaned = cleaned.replace(/^\.\//, '');
    if (!baseDir) {
        return cleaned;
    }

    const normalizedBase = baseDir.replace(/\/$/, '');
    return `${normalizedBase}/${cleaned}`;
}

async function loadBibliographyForMarkdownFile(filePath, content) {
    const frontmatter = extractFrontmatter(content);
    const bibliographyFiles = parseBibliographyFromFrontmatter(frontmatter);
    const signature = getBibliographySignature(filePath, bibliographyFiles);
    updateLastBibliographyConfig(filePath, signature);

    if (!bibliographyFiles.length) {
        return false;
    }

    const baseDir = window.currentFileDirectory || filePath?.substring(0, filePath.lastIndexOf('/')) || '';
    const token = ++currentBibLoadToken;
    const entries = [];

    for (const bibPath of bibliographyFiles) {
        const resolvedPath = resolveBibliographyPath(bibPath, baseDir);
        if (!resolvedPath) {
            continue;
        }

        try {
            const response = await window.electronAPI.invoke('read-file', resolvedPath);
            if (!response.success) {
                console.warn(`[renderer.js] Failed to read bibliography file: ${resolvedPath}`, response.error);
                continue;
            }

            const parsed = parseBibTeX(response.content, bibPath);
            if (parsed.length > 0) {
                entries.push(...parsed);
            }
        } catch (error) {
            console.warn(`[renderer.js] Error loading bibliography file: ${resolvedPath}`, error);
        }
    }

    if (token !== currentBibLoadToken) {
        return true;
    }

    // Sync .bib file entries into the citation database so they're searchable
    if (entries.length > 0) {
        syncBibEntriesToDatabase(entries).catch(err =>
            console.warn('[renderer.js] Background bib→DB sync failed:', err)
        );
    }

    bibEntries.length = 0;
    bibEntries.push(...entries);

    const dbEntries = await loadDatabaseCitations();
    bibEntries.push(...dbEntries);

    window.bibEntries = bibEntries;
    if (window.TechneCitationRenderer?.invalidateCache) {
        window.TechneCitationRenderer.invalidateCache();
    }

    showBibliographyStatus(formatBibliographyStatus(bibliographyFiles));
    return true;
}

async function refreshBibliographyFromContent(filePath, content) {
    const frontmatter = extractFrontmatter(content);
    const bibliographyFiles = parseBibliographyFromFrontmatter(frontmatter);
    const signature = getBibliographySignature(filePath, bibliographyFiles);
    const sameFile = lastBibliographyConfig.filePath === filePath;

    if (sameFile && signature === lastBibliographyConfig.signature) {
        return;
    }

    updateLastBibliographyConfig(filePath, signature);

    if (bibliographyFiles.length > 0) {
        await loadBibliographyForMarkdownFile(filePath, content);
    } else {
        await loadBibTeXFiles();
        showBibliographyStatus(formatBibliographyStatus([]));
    }
}

function scheduleBibliographyRefresh(filePath, content) {
    if (!filePath) {
        return;
    }

    if (bibliographyRefreshTimer) {
        clearTimeout(bibliographyRefreshTimer);
    }

    bibliographyRefreshTimer = setTimeout(() => {
        bibliographyRefreshTimer = null;
        refreshBibliographyFromContent(filePath, content);
    }, 400);
}

// Load database citations and convert to BibTeX-like format
async function loadDatabaseCitations() {
    try {
        const response = await window.electronAPI.invoke('citations-get', {});
        
        if (!response.success) {
            throw new Error(response.error || 'Failed to load database citations');
        }
        
        const citations = response.citations || [];
        
        // Convert database citations to BibTeX-like format
        const dbEntries = citations.map(citation => {
            const key = computeCitationKey(citation);
            return {
                key: key,
                type: citation.citation_type || 'article',
                title: citation.title || 'Untitled',
                author: citation.authors || 'Unknown',
                year: citation.publication_year ? citation.publication_year.toString() : '',
                journal: citation.journal || '',
                doi: citation.doi || '',
                url: citation.url || '',
                source: 'database',  // Mark as database entry
                sourceDetail: 'Citation Manager'
            };
        });
        
        return dbEntries;
    } catch (error) {
        console.error('[loadDB] Error loading database citations:', error);
        return [];
    }
}

// Sync parsed BibTeX entries from .bib files into the citation database
// so they become searchable and linked to DB records.
async function syncBibEntriesToDatabase(entries) {
    if (!entries || entries.length === 0) return;

    // Rebuild minimal BibTeX text from parsed entries for the import handler
    const bibLines = entries.map(entry => {
        const type = entry.type || 'article';
        const key = entry.key || 'unknown';
        const fields = [];
        if (entry.title) fields.push(`  title={${entry.title}}`);
        if (entry.author) fields.push(`  author={${entry.author}}`);
        if (entry.year) fields.push(`  year={${entry.year}}`);
        if (entry.journal) fields.push(`  journal={${entry.journal}}`);
        if (entry.doi) fields.push(`  doi={${entry.doi}}`);
        if (entry.url) fields.push(`  url={${entry.url}}`);
        if (entry.volume) fields.push(`  volume={${entry.volume}}`);
        if (entry.number || entry.issue) fields.push(`  number={${entry.number || entry.issue}}`);
        if (entry.pages) fields.push(`  pages={${entry.pages}}`);
        if (entry.publisher) fields.push(`  publisher={${entry.publisher}}`);
        if (entry.abstract) fields.push(`  abstract={${entry.abstract}}`);
        return `@${type}{${key},\n${fields.join(',\n')}\n}`;
    });

    const bibContent = bibLines.join('\n\n');
    try {
        const result = await window.electronAPI.invoke('citations-import-bib-to-db', bibContent);
        if (result.success) {
            const { imported, updated, skipped } = result;
            if (imported > 0 || updated > 0) {
                console.log(`[syncBibToDB] Synced .bib → DB: ${imported} new, ${updated} updated, ${skipped} unchanged`);
            }
        }
    } catch (error) {
        console.warn('[syncBibToDB] Failed to sync bib entries to database:', error);
    }
}

// Load BibTeX files from the lectures directory
async function loadBibTeXFiles() {
    // Clear existing entries to prevent duplicates
    bibEntries.length = 0;

    try {
        // Look for .bib files specifically in the lectures subdirectory
        const bibFiles = [];
        
        try {
            // First, get the current working directory to understand the context
            const workingDir = await window.electronAPI.invoke('get-working-directory');
            // Try multiple possible locations for BibTeX files
            const possiblePaths = [
                '.',                  // current working directory
                // Since working directory is already /lectures, we don't need other paths
            ];
            
            for (const relativePath of possiblePaths) {
                try {
                    const lecturesFiles = await window.electronAPI.invoke('list-directory-files', relativePath);
                    
                    if (lecturesFiles && Array.isArray(lecturesFiles)) {
                        // Filter for .bib files
                        const bibFiles = lecturesFiles.filter(file => file.isFile && file.name.endsWith('.bib'));
                        
                        for (const file of lecturesFiles) {
                            if (file.isFile && file.name.endsWith('.bib')) {
                                // Use the absolute path from the file listing
                                const fullBibPath = file.path || `${workingDir}/${relativePath === '.' ? '' : relativePath + '/'}${file.name}`;
                                
                                // Try to read the file directly
                                try {
                                    const response = await window.electronAPI.invoke('read-file', fullBibPath);
                                    
                                    if (!response.success) {
                                        console.error(`[loadBibTeX] Failed to read ${fullBibPath}:`, response.error);
                                        continue;
                                    }
                                    
                                    const content = response.content;
                                    const sourceLabel = relativePath && relativePath !== '.'
                                        ? `${relativePath}/${file.name}`
                                        : file.name;
                                    const entries = parseBibTeX(content, sourceLabel);
                                    if (entries.length > 0) {
                                        bibEntries.push(...entries);
                                        
                                    }
                                } catch (readError) {
                                    // Try alternative path resolution
                                    try {
                                        // If relative path failed, try with just the filename in lectures
                                        const altPath = `lectures/${file.name}`;
                                        const response = await window.electronAPI.invoke('read-file', altPath);
                                        
                                        if (!response.success) {
                                            console.error(`[loadBibTeX] Alternative path failed ${altPath}:`, response.error);
                                            continue;
                                        }
                                        
                                        const content = response.content;
                                        const sourceLabel = relativePath && relativePath !== '.'
                                            ? `${relativePath}/${file.name}`
                                            : file.name;
                                        const entries = parseBibTeX(content, sourceLabel);
                                        if (entries.length > 0) {
                                            bibEntries.push(...entries);
                                        }
                                    } catch (altError) {
                                    }
                                }
                            }
                        }
                        
                        if (bibEntries.length > 0) {
                            break; // Stop after successfully loading entries
                        }
                    }
                } catch (error) {
                }
            }
            
        } catch (error) {
            console.error('[renderer.js] Error during BibTeX file loading:', error.message);
        }
        
        // Sync .bib file entries into the citation database
        if (bibEntries.length > 0) {
            syncBibEntriesToDatabase(bibEntries).catch(err =>
                console.warn('[loadBibTeX] Background bib→DB sync failed:', err)
            );
        }

        // Also load database citations
        const dbEntries = await loadDatabaseCitations();

        // Combine BibTeX and database entries into the global bibEntries array
        bibEntries.push(...dbEntries);

        // Update window reference for citation renderer plugin
        window.bibEntries = bibEntries;

        // Invalidate citation cache since bibEntries changed
        if (window.TechneCitationRenderer?.invalidateCache) {
            window.TechneCitationRenderer.invalidateCache();
        }

        return bibEntries;
    } catch (error) {
        console.error('[renderer.js] Error loading BibTeX files:', error);
        return [];
    }
}

async function refreshCitationAutocompleteData(context = {}) {
    try {
        const updatedEntries = await loadBibTeXFiles();
    } catch (error) {
        console.error('[renderer.js] Error refreshing citation autocomplete data:', error);
    }
}

// Make refresh helper accessible to other modules (e.g., citation manager)
window.refreshCitationAutocompleteData = refreshCitationAutocompleteData;

// Register citation autocomplete provider for Markdown
function registerCitationAutocomplete() {
    const MAX_SUGGESTIONS = 50;
    const truncate = (text, length = 80) => {
        if (!text) return '';
        return text.length > length ? text.slice(0, length - 1).trimEnd() + '…' : text;
    };

    monaco.languages.registerCompletionItemProvider('markdown', {
        triggerCharacters: ['@', '['],
        // Also support manual triggering (Ctrl+Space)
        provideCompletionItems: function(model, position, context, token) {
            // Get current line text
            const currentLine = model.getLineContent(position.lineNumber);
            const textBeforePointer = currentLine.substring(0, position.column - 1);

            // Look for citation pattern: [@...] where we're after the [@
            const citationMatch = textBeforePointer.match(/\[@([^\]]*)?$/);

            if (!citationMatch) {
                return { suggestions: [] };
            }

            const searchTerm = citationMatch[1] || '';
            
            // Filter entries based on search term (supports fuzzy matching)
            const searchLower = (searchTerm || '').toLowerCase();
            const _fuzzyMatch = typeof fuzzyMatchBest === 'function' ? fuzzyMatchBest : null;
            const scoredEntries = bibEntries
                .map(entry => {
                    if (!searchLower) return { entry, score: 0, match: true };

                    const fields = [entry.key, entry.title, entry.author, entry.year, entry.journal].filter(Boolean);

                    // Use fuzzy matching if available
                    if (_fuzzyMatch) {
                        const result = _fuzzyMatch(searchLower, fields, { threshold: 0.3 });
                        return { entry, score: result.match ? (1 - result.score) : 999, match: result.match };
                    }

                    // Fallback: simple substring matching
                    const haystack = fields.join(' ').toLowerCase();
                    if (!haystack.includes(searchLower)) return { entry, score: 999, match: false };

                    const keyLower = entry.key?.toLowerCase() || '';
                    const titleLower = entry.title?.toLowerCase() || '';
                    const authorLower = entry.author?.toLowerCase() || '';
                    let score = 3;
                    if (keyLower.startsWith(searchLower)) {
                        score = 0;
                    } else if (authorLower.startsWith(searchLower) || titleLower.startsWith(searchLower)) {
                        score = 1;
                    } else if (keyLower.includes(searchLower)) {
                        score = 2;
                    }
                    return { entry, score, match: true };
                })
                .filter(r => r.match)
                .sort((a, b) => {
                    if (a.score !== b.score) return a.score - b.score;
                    return (a.entry.key || '').localeCompare(b.entry.key || '');
                })
                .slice(0, MAX_SUGGESTIONS);

            const suggestions = scoredEntries.map(({ entry }, index) => {
                    // Use different icons for different sources
                    const kind = entry.source === 'database' 
                        ? monaco.languages.CompletionItemKind.Database
                        : monaco.languages.CompletionItemKind.Reference;

                    const titleSnippet = entry.title ? truncate(entry.title, 60) : '';
                    const authorSnippet = entry.author ? truncate(entry.author, 40) : '';
                    const sourceDisplay = entry.source === 'database'
                        ? 'Citation Manager'
                        : (entry.sourceDetail || 'BibTeX');
                    const detail = entry.type
                        ? `${sourceDisplay} • @${entry.type}`
                        : sourceDisplay;

                    const documentationParts = [];
                    if (entry.title) {
                        documentationParts.push(`**${entry.title}**`);
                    }
                    const metaLine = [entry.author, entry.year, entry.journal].filter(Boolean).join(' • ');
                    if (metaLine) {
                        documentationParts.push(metaLine);
                    }
                    documentationParts.push(`Source: ${sourceDisplay}`);
                    if (entry.doi) {
                        documentationParts.push(`DOI: ${entry.doi}`);
                    }
                    if (entry.url) {
                        documentationParts.push(entry.url);
                    }
                    if (entry.sourceDetail && entry.source !== 'database') {
                        documentationParts.push(`File: ${entry.sourceDetail}`);
                    }

                    const labelDetails = (authorSnippet || titleSnippet)
                        ? { detail: authorSnippet || undefined, description: titleSnippet || undefined }
                        : undefined;

                    const completionItem = {
                        label: entry.key,
                        kind: kind,
                        insertText: entry.key + ']',
                        detail: detail,
                        documentation: {
                            value: documentationParts.join('\n\n'),
                            isTrusted: false
                        },
                        sortText: `${index.toString().padStart(4, '0')}_${entry.key}`,
                        filterText: `${entry.key} ${entry.title || ''} ${entry.author || ''} ${entry.year || ''} ${entry.journal || ''} ${sourceDisplay} ${entry.sourceDetail || ''}`,
                        range: {
                            startLineNumber: position.lineNumber,
                            endLineNumber: position.lineNumber,
                            startColumn: position.column - searchTerm.length,
                            endColumn: position.column
                        }
                    };

                    if (labelDetails) {
                        completionItem.labelDetails = labelDetails;
                    }

                    return completionItem;
                });
            
            return { suggestions: suggestions };
        }
    });
    
}

// Global variable to store available files for autocomplete
let availableFiles = [];

// Function to update the available files list
async function updateAvailableFiles(fileTreeOverride = null) {
    if (!fileTreeOverride && !window.fileTreeData && !window.electronAPI) {
        return;
    }
    
    try {
        const fileTree = fileTreeOverride || window.fileTreeData || await window.electronAPI.invoke('request-file-tree');
        if (!fileTree) {
            return;
        }

        window.fileTreeData = fileTree;
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
        
    } catch (error) {
        console.error('[renderer.js] Error updating available files:', error);
    }
}

// Register file link autocomplete provider for Markdown
function registerFileLinkAutocomplete() {
    
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
    
}

// --- Inline AI Completion Provider (Ghost Text) ---
let inlineCompletionEnabled = false;
let inlineCompletionDebounceTimer = null;
const INLINE_COMPLETION_DELAY = 800; // ms pause before requesting

function registerInlineAICompletions() {

    monaco.languages.registerInlineCompletionsProvider('markdown', {
        provideInlineCompletions: async (model, position, context, token) => {
            // Check if feature is enabled
            if (!inlineCompletionEnabled) return { items: [] };

            // Only trigger on automatic invocations (typing pause)
            if (context.triggerKind !== monaco.languages.InlineCompletionTriggerKind.Automatic) {
                // Also allow explicit trigger
            }

            // Get surrounding context
            const lineContent = model.getLineContent(position.lineNumber);
            const textBefore = lineContent.substring(0, position.column - 1);

            // Don't trigger on empty lines, very short text, or in code blocks
            if (textBefore.trim().length < 10) return { items: [] };

            // Get a few lines of context before cursor
            const startLine = Math.max(1, position.lineNumber - 15);
            const contextLines = [];
            for (let i = startLine; i <= position.lineNumber; i++) {
                contextLines.push(model.getLineContent(i));
            }
            const contextText = contextLines.join('\n');

            // Debounce — wait for typing to stop
            return new Promise((resolve) => {
                clearTimeout(inlineCompletionDebounceTimer);
                inlineCompletionDebounceTimer = setTimeout(async () => {
                    if (token.isCancellationRequested) {
                        resolve({ items: [] });
                        return;
                    }

                    try {
                        const result = await window.electronAPI.invoke('send-chat-message', {
                            message: `Continue this markdown text naturally. Output ONLY the continuation (1-2 sentences max, no explanation). Do not repeat any existing text:\n\n${contextText}`,
                            systemMessage: 'You are a ghost-text writing assistant. Complete the text naturally and concisely. Output ONLY the continuation text, nothing else. Keep it brief (1-2 sentences).',
                            newConversation: true
                        });

                        if (token.isCancellationRequested || !result || result.error) {
                            resolve({ items: [] });
                            return;
                        }

                        let completion = (result.response || '').trim();
                        // Remove any quotes or code blocks the AI might wrap around the response
                        completion = completion.replace(/^["'`]+|["'`]+$/g, '');
                        if (!completion) { resolve({ items: [] }); return; }

                        resolve({
                            items: [{
                                insertText: completion,
                                range: new monaco.Range(
                                    position.lineNumber, position.column,
                                    position.lineNumber, position.column
                                )
                            }]
                        });
                    } catch (error) {
                        console.warn('[InlineAI] Completion error:', error);
                        resolve({ items: [] });
                    }
                }, INLINE_COMPLETION_DELAY);
            });
        },
        freeInlineCompletions: () => {}
    });

}

// Toggle inline AI completions
function toggleInlineAICompletions() {
    inlineCompletionEnabled = !inlineCompletionEnabled;
    if (window.showNotification) {
        window.showNotification(`AI ghost text ${inlineCompletionEnabled ? 'enabled' : 'disabled'}`, 'info');
    }
}
window.toggleInlineAICompletions = toggleInlineAICompletions;

// --- Initialize Monaco Editor ---
async function initializeMonacoEditor() {
    // Add error handling for require itself
    try {
        await new Promise((resolve, reject) => {
            require(['vs/editor/editor.main'], async function() {
        
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

        // Define custom themes with better link colors for markdown
        monaco.editor.defineTheme('markdown-dark', {
            base: 'vs-dark',
            inherit: true,
            rules: [
                { token: 'string.link', foreground: '93c5fd' },  // Light blue for link brackets/URLs
                { token: 'string.target', foreground: '93c5fd' }  // For {target} style links
            ],
            colors: {
                'editorLink.activeForeground': '#93c5fd'
            }
        });

        monaco.editor.defineTheme('markdown-light', {
            base: 'vs',
            inherit: true,
            rules: [
                { token: 'string.link', foreground: '2563eb' },  // Blue for markdown links
                { token: 'string.target', foreground: '2563eb' }  // For {target} style links
            ],
            colors: {
                'editorLink.activeForeground': '#2563eb'
            }
        });

        try {
            // IMPORTANT: Only use specific content if there's a file to restore
            // Otherwise, start with empty content to avoid overwriting user files
            let initialContent = '';
            
            if (window.restoredFileContent) {
                initialContent = window.restoredFileContent.content;
            } else if (window.currentFilePath || window.hasFileToRestore) {
                // If there's a current file path or file to restore, start with empty content
                // The file will be loaded properly by openFileInEditor or restoration process
                initialContent = '';
            } else if (window.useDefaultContentFallback && !window.currentFilePath) {
                // Only use default content if explicitly requested AND there's no current file
                initialContent = '# New Document\n\nStart writing your content here...';
            } else {
                // Fallback: if we reach here, use empty content to avoid overwriting anything
                if (!initialContent) {
                    initialContent = '';
                }
            }
            editor = monaco.editor.create(editorContainer, {
                value: initialContent,
                language: 'markdown',
                theme: 'markdown-light', // Will be updated based on settings after creation
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
                // Disable sticky scroll to prevent line number errors
                stickyScroll: {
                    enabled: false
                },
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

            // If we loaded a restored file directly into Monaco, update the navigation/filename display
            if (window.restoredFileContent && window.currentFilePath) {
                const fileName = window.currentFilePath.split('/').pop();
                if (typeof addToNavigationHistory === 'function') {
                    addToNavigationHistory(window.currentFilePath, fileName);
                } else if (typeof window.updateCurrentFileName === 'function') {
                    window.updateCurrentFileName(fileName);
                }
                // Set currentFileDirectory for image path resolution
                const lastSlash = window.currentFilePath.lastIndexOf('/');
                window.currentFileDirectory = lastSlash >= 0 ? window.currentFilePath.substring(0, lastSlash) : '';
                // Clear the restored content since we've used it
                window.restoredFileContent = null;
            }

            // Setup editor context menu for text extraction
            setupEditorContextMenu();
            
            // Setup scroll-based minimap visibility
            setupSmartMinimap(editor);
            
            // Register custom Markdown folding provider and add shortcuts
            setTimeout(() => {
                registerMarkdownFoldingProvider();
                addFoldingKeyboardShortcuts();
                addFormattingKeyboardShortcuts();
                addEditingKeyboardShortcuts();
                addCustomSelectionKeybindings();
                addFoldingToolbarControls();
                addKeyboardShortcutsButton();
                addAISummarizationAction();
                addCommandPaletteAction();
                // Initialize visual markdown enhancements
                if (typeof initializeVisualMarkdown === 'function') {
                    initializeVisualMarkdown(editor);
                }

                // Initialize collaboration indicators (available for future real-time sync)
                if (typeof window.CollaborationIndicators !== 'undefined') {
                    window.CollaborationIndicators.initialize(editor, {
                        showCursorLabel: true,
                        cursorBlink: true
                    });
                    // Generate a local user ID for this session
                    const localUserId = `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                    window.CollaborationIndicators.setLocalUserId(localUserId);
                }
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
                const shouldCleanPlaceholders = Array.isArray(event?.changes) &&
                    event.changes.some(change => typeof change.text === 'string' && change.text.includes('$0'));
                if (shouldCleanPlaceholders) {
                    setTimeout(removeCitationPlaceholderArtifacts, 0);
                }

                const currentContent = editor.getValue();

                // Process content changes for AI writing companion (silent - no logging)
                if (window.aiCompanion && typeof window.aiCompanion.processNewWriting === 'function' && !suppressAutoSave) {
                    if (event && event.changes && event.changes.length > 0) {
                        for (const change of event.changes) {
                            if (change.text && change.text.length > 0) {
                                window.aiCompanion.processNewWriting(change.text);
                            }
                        }
                    } else if (currentContent.length > previousContent.length) {
                        const newText = currentContent.slice(previousContent.length);
                        if (newText.length > 0) {
                            window.aiCompanion.processNewWriting(newText);
                        }
                    }
                }

                // Update for next change detection
                previousContent = currentContent;

                // Use debounced preview update to prevent sluggishness during rapid typing
                // Skip during programmatic file opens (suppressAutoSave is true)
                // to avoid cascading double-renders
                if (!suppressAutoSave) {
                    debouncedUpdatePreviewAndStructure(currentContent);
                    updateSlideThumbnails(currentContent);
                }
                if (window.scheduleAutoSave) {
                    window.scheduleAutoSave();
                } else {
                    scheduleAutoSave();
                }

                // Ensure recovery persistence even when auto-save is disabled
                // (scheduleAutoSave bails early if auto-save is off, but we still
                // want to persist unsaved content for crash recovery)
                if (window.tabManager && !suppressAutoSave) {
                    window.tabManager.syncActiveTabDirty(true);
                }

                if (!suppressAutoSave) {
                    const currentFilePath = window.currentFilePath;
                    const isMarkdownFile = currentFilePath &&
                        (currentFilePath.endsWith('.md') || currentFilePath.endsWith('.markdown'));
                    if (isMarkdownFile) {
                        scheduleBibliographyRefresh(currentFilePath, currentContent);
                    }
                }
            });
            
            // Clear fallback editor since Monaco loaded successfully
            fallbackEditor = null;

            // Register inline AI completions provider
            registerInlineAICompletions();

            // Make editor globally accessible for debugging
            window.editor = editor;

            // Activate preview scroll sync now that editor is ready
            requestAnimationFrame(() => _activateScrollSyncForCurrentPane());

            // Load settings first, then initialize auto-save
            window.electronAPI.invoke('get-settings').then(settings => {
                window.appSettings = settings;

                // Initialize auto-save after settings are loaded
                const initStatus = {
                    hasInitializeAutoSave: !!window.initializeAutoSave,
                    hasAppSettings: !!window.appSettings,
                    autoSaveSettings: window.appSettings?.autoSave
                };

                if (window.initializeAutoSave) {
                    window.initializeAutoSave();
                }
                
                // Apply all editor settings using the centralized function
                applyEditorSettings(settings);
                
                // Citation autocomplete setting (separate from general editor settings)
                const citationOptions = {};
                if (settings?.editor?.enableCitationAutocomplete !== false) {
                    citationOptions.autoClosingBrackets = 'never'; // Disable auto-closing brackets for citation autocomplete
                    
                    // Load BibTeX files and register citation autocomplete
                    loadBibTeXFiles().then(() => {
                        registerCitationAutocomplete();
                    }).catch(error => {
                        console.error('[renderer.js] Error loading BibTeX files:', error);
                        // Still try to register autocomplete even if loading fails
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
                }).catch(error => {
                    console.error('[renderer.js] Fallback BibTeX loading error:', error);
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

            const pasteGestureGuard = typeof window.createPasteGestureGuard === 'function'
                ? window.createPasteGestureGuard({ lockMs: 150 })
                : { tryAcquire: () => true };

            // Keep a single document-level paste listener so image pastes from
            // menu actions and keyboard shortcuts go through one guarded path.
            const globalPasteHandler = async (event) => {
                // Only handle if editor is focused
                if (editor.hasTextFocus() && pasteGestureGuard.tryAcquire()) {
                    await handleImagePaste(event);
                }
            };
            
            document.addEventListener('paste', globalPasteHandler);
            
            // Helper function to check if text is a valid URL
            function isValidURL(text) {
                try {
                    // Check if it's a valid URL
                    const url = new URL(text.trim());
                    // Accept http, https protocols
                    return ['http:', 'https:'].includes(url.protocol);
                } catch {
                    // Also check for URLs without protocol
                    const urlPattern = /^(www\.)?[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(\/[^\s]*)?$/;
                    return urlPattern.test(text.trim());
                }
            }

            // Helper function to fetch page title from URL
            async function fetchPageTitle(url) {
                try {
                    // Use the main process to fetch the title to avoid CORS issues
                    if (window.electronAPI && window.electronAPI.invoke) {
                        const result = await window.electronAPI.invoke('fetch-url-title', url);
                        if (result.success) {
                            return result.title;
                        }
                    }
                } catch (error) {
                    console.warn('[Editor] Could not fetch page title:', error);
                }
                // Fallback to domain name if title fetch fails
                try {
                    const urlObj = new URL(url);
                    return urlObj.hostname.replace('www.', '');
                } catch {
                    return 'Link';
                }
            }

            // Smart keyboard command - handles images and URLs, lets normal text through
            editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyV, async () => {
                if (!pasteGestureGuard.tryAcquire()) {
                    return;
                }

                // Only intercept paste when the editor has focus — let other
                // inputs (Find dialog, settings, etc.) use native paste.
                if (!editor.hasTextFocus()) {
                    document.execCommand('paste');
                    return;
                }

                try {
                    // First, try to detect if there are images using Electron's clipboard API
                    if (await pasteImageFromClipboard()) {
                        // Return early to prevent text paste
                        return;
                    }

                    // No image found, check for URL in clipboard
                    const clipboardText = await navigator.clipboard.readText();

                    if (clipboardText && isValidURL(clipboardText)) {

                        // Normalize the URL (add https:// if missing)
                        let normalizedUrl = clipboardText.trim();
                        if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
                            normalizedUrl = 'https://' + normalizedUrl;
                        }

                        // Fetch the page title
                        const pageTitle = await fetchPageTitle(normalizedUrl);

                        // Create Markdown link
                        const markdownLink = `[${pageTitle}](${normalizedUrl})`;

                        // Insert the Markdown link at current position
                        const position = editor.getPosition();
                        const selection = editor.getSelection();

                        editor.executeEdits('paste-url-as-markdown', [{
                            range: selection,
                            text: markdownLink
                        }]);

                        // Select the title text for easy editing
                        const newPosition = {
                            lineNumber: position.lineNumber,
                            column: position.column + 1 // Position after '['
                        };
                        const endPosition = {
                            lineNumber: position.lineNumber,
                            column: position.column + pageTitle.length + 1 // Before ']'
                        };

                        editor.setSelection(new monaco.Range(
                            newPosition.lineNumber,
                            newPosition.column,
                            endPosition.lineNumber,
                            endPosition.column
                        ));


                        // Update preview
                        if (window.updatePreview) {
                            await window.updatePreview(editor.getValue());
                        }

                        return;
                    }

                    // No image or URL found, let Monaco handle normal text paste
                    editor.trigger('keyboard', 'editor.action.clipboardPasteAction');

                } catch (error) {
                    console.error('[Editor] Error in smart paste handler:', error);
                    // On error, fallback to default text paste
                    editor.trigger('keyboard', 'editor.action.clipboardPasteAction');
                }
            });
            
            // Helper function to handle image paste
            async function pasteImageFromClipboard() {
                const result = await window.electronAPI.invoke('paste-image-from-clipboard', {
                    sourceFilePath: window.currentFilePath || null,
                    sourceFileDirectory: window.currentFileDirectory || null
                });

                if (!result.success) {
                    return false;
                }

                const position = editor.getPosition();
                editor.executeEdits('paste-image', [{
                    range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
                    text: result.markdownLink
                }]);

                editor.setPosition({
                    lineNumber: position.lineNumber,
                    column: position.column + result.markdownLink.length
                });

                if (window.updatePreview) {
                    await window.updatePreview(editor.getValue());
                }

                if (window.electronAPI && window.electronAPI.invoke) {
                    try {
                        await window.electronAPI.invoke('refresh-file-tree');
                    } catch (error) {
                        console.warn('[Editor] Could not refresh file tree:', error);
                    }
                }

                return true;
            }

            async function handleImagePaste(event) {
                const clipboardData = event.clipboardData || window.clipboardData;
                if (!clipboardData) {
                    return;
                }
                
                const items = clipboardData.items;
                let hasImage = false;
                
                for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    
                    if (item.type.indexOf('image') !== -1) {
                        hasImage = true;
                        
                        // Only prevent default if we have an image
                        event.preventDefault();
                        
                        try {
                            await pasteImageFromClipboard();
                        } catch (error) {
                            console.error('[Editor] Error handling image paste:', error);
                        }
                        
                        break;
                    }
                }
                
            }
            

            // --- THEME SYNC: Ensure Monaco inherits current app theme tokens ---
            const initialThemePreference = (window.appSettings && typeof appSettings.theme === 'string')
                ? appSettings.theme
                : (document.body.classList.contains('dark-mode') ? 'dark' : 'light');
            applyTheme(initialThemePreference);
            initializeMonacoThemeInheritanceObserver();
            syncEditorThemeWithAppTheme();

            // Helper to strip lingering snippet placeholders like "$0" that Monaco may introduce
            let isCleaningCitationPlaceholder = false;
            const removeCitationPlaceholderArtifacts = () => {
                if (!editor || isCleaningCitationPlaceholder) {
                    return;
                }

                const model = editor.getModel();
                if (!model) {
                    return;
                }

                const placeholderMatches = model.findMatches(
                    '\\[@[^\\]]*\\]\\$0',
                    false,
                    true,
                    false,
                    null,
                    true
                );

                if (!placeholderMatches.length) {
                    return;
                }

                isCleaningCitationPlaceholder = true;

                const edits = placeholderMatches.map(match => ({
                    range: new monaco.Range(
                        match.range.endLineNumber,
                        match.range.endColumn - 2,
                        match.range.endLineNumber,
                        match.range.endColumn
                    ),
                    text: ''
                }));

                editor.executeEdits('cleanup-citation-placeholder', edits);
                isCleaningCitationPlaceholder = false;
            };

            // --- IMAGE DRAG & DROP: Add drag/drop support for images ---
            function setupImageDragAndDrop() {
                const editorContainer = document.getElementById('editor');
                if (!editorContainer) return;

                // Prevent default drag behaviors on the editor container
                editorContainer.addEventListener('dragover', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    event.dataTransfer.dropEffect = 'copy';
                }, false);

                editorContainer.addEventListener('dragenter', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                }, false);

                editorContainer.addEventListener('dragleave', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                }, false);

                // Handle file drop
                editorContainer.addEventListener('drop', async (event) => {
                    event.preventDefault();
                    event.stopPropagation();

                    const files = event.dataTransfer.files;
                    if (!files || files.length === 0) return;


                    // Process each dropped file
                    for (let i = 0; i < files.length; i++) {
                        const file = files[i];

                        // Check if it's an image file
                        if (file.type.startsWith('image/')) {
                            try {
                                // Get the file path (Electron provides this)
                                const filePath = file.path;
                                if (!filePath) {
                                    console.warn('[Editor] No file path available for dropped image');
                                    continue;
                                }

                                const result = await window.electronAPI.invoke('copy-local-image-file', filePath);

                                if (result.success) {

                                    // Insert the markdown link at cursor position
                                    const position = editor.getPosition();
                                    const range = new monaco.Range(
                                        position.lineNumber,
                                        position.column,
                                        position.lineNumber,
                                        position.column
                                    );

                                    editor.executeEdits('drop-image', [{
                                        range: range,
                                        text: result.markdownLink + '\n\n'
                                    }]);

                                    // Move cursor to end of inserted text
                                    const newPosition = {
                                        lineNumber: position.lineNumber + 2,
                                        column: 1
                                    };
                                    editor.setPosition(newPosition);

                                    // Update preview
                                    if (window.updatePreview) {
                                        const content = editor.getValue();
                                        await window.updatePreview(content);
                                    }

                                    // Refresh file tree to show new image
                                    if (window.electronAPI && window.electronAPI.invoke) {
                                        try {
                                            await window.electronAPI.invoke('refresh-file-tree');
                                        } catch (error) {
                                            console.warn('[Editor] Could not refresh file tree:', error);
                                        }
                                    }

                                } else {
                                    console.error('[Editor] Failed to copy image:', result.error);
                                    if (window.showNotification) {
                                        window.showNotification(`Failed to copy image: ${result.error}`, 'error');
                                    }
                                }
                            } catch (error) {
                                console.error('[Editor] Error processing dropped image:', error);
                                if (window.showNotification) {
                                    window.showNotification('Error processing dropped image', 'error');
                                }
                            }
                        } else {
                        }
                    }
                }, false);
            }

            // Initialize drag and drop after editor is ready
            setupImageDragAndDrop();

            // --- CITATION DRAG & DROP: Add drag/drop support for citations ---
            function setupCitationDragAndDrop() {
                const editorContainer = document.getElementById('editor');
                if (!editorContainer) return;

                // Clean up snippet placeholders that sometimes hitch a ride with dragged text
                const cleanDroppedCitationText = (text) => {
                    if (!text) return '';
                    return text
                        .replace(/\$\{\d+:([^}]*)\}/g, '$1') // unwrap ${1:placeholder} style snippets
                        .replace(/\$\d+/g, '') // strip trailing $0 style placeholders
                        .trim();
                };

                // Add citation-specific drop handling to the existing dragover listener
                editorContainer.addEventListener('dragover', (event) => {
                    const types = event.dataTransfer.types;
                    if (types.includes('application/x-citation-key') || types.includes('text/plain')) {
                        event.preventDefault();
                        event.stopPropagation();
                        event.dataTransfer.dropEffect = 'copy';

                        // Add visual feedback for citation drop
                        editorContainer.style.backgroundColor = '#f0fdf4';
                        editorContainer.style.borderColor = '#16a34a';
                    }
                }, false);

                editorContainer.addEventListener('dragleave', (event) => {
                    // Reset visual feedback
                    editorContainer.style.backgroundColor = '';
                    editorContainer.style.borderColor = '';
                }, false);

                // Handle citation drop
                editorContainer.addEventListener('drop', async (event) => {
                    const types = Array.from(event.dataTransfer?.types || []);
                    const citationKey = event.dataTransfer.getData('application/x-citation-key');
                    const rawText = event.dataTransfer.getData('text') || event.dataTransfer.getData('text/plain') || '';
                    const citationText = cleanDroppedCitationText(rawText);
                    const isCitationDrop = Boolean(
                        citationKey ||
                        (citationText && citationText.startsWith('[@')) ||
                        types.includes('application/x-citation-key')
                    );

                    if (!isCitationDrop) {
                        return;
                    }

                    event.preventDefault();
                    if (event.stopImmediatePropagation) {
                        event.stopImmediatePropagation();
                    }
                    event.stopPropagation();

                    // Reset visual feedback
                    editorContainer.style.backgroundColor = '';
                    editorContainer.style.borderColor = '';

                    const sanitizedKey = cleanDroppedCitationText(citationKey);
                    let sanitizedCitation = '';

                    if (sanitizedKey) {
                        sanitizedCitation = `[@${sanitizedKey}]`;
                    } else if (citationText && citationText.startsWith('[@')) {
                        sanitizedCitation = citationText;
                    } else if (citationText) {
                        sanitizedCitation = `[@${citationText.replace(/^\[@?/, '').replace(/\]$/, '')}]`;
                    }

                    sanitizedCitation = cleanDroppedCitationText(sanitizedCitation);

                    if (!sanitizedCitation) {
                        console.warn('[Citation Drop] Unable to determine citation text from drop payload', {
                            rawText,
                            citationKey,
                            types
                        });
                        return;
                    }


                    if (editor) {
                        const insertStart = editor.getPosition();
                        const range = new monaco.Range(
                            insertStart.lineNumber,
                            insertStart.column,
                            insertStart.lineNumber,
                            insertStart.column
                        );

                        editor.executeEdits('drop-citation', [{
                            range: range,
                            text: sanitizedCitation
                        }]);

                        const model = editor.getModel();
                        const insertEndColumn = insertStart.column + sanitizedCitation.length;

                        if (model) {
                            const lineText = model.getLineContent(insertStart.lineNumber) || '';
                            const trailingText = lineText.slice(insertEndColumn - 1);
                            if (trailingText.startsWith('$0')) {
                                const cleanupRange = new monaco.Range(
                                    insertStart.lineNumber,
                                    insertEndColumn,
                                    insertStart.lineNumber,
                                    insertEndColumn + 2
                                );
                                editor.executeEdits('drop-citation-cleanup', [{
                                    range: cleanupRange,
                                    text: ''
                                }]);
                            }
                        }

                        editor.setPosition({
                            lineNumber: insertStart.lineNumber,
                            column: insertEndColumn
                        });

                        removeCitationPlaceholderArtifacts();


                        if (window.showNotification) {
                            window.showNotification(`Citation inserted: ${citationKey || sanitizedCitation}`, 'success');
                        }

                        if (window.updatePreview) {
                            const content = editor.getValue();
                            await window.updatePreview(content);
                        }
                    }
                }, false);
            }

            // Initialize citation drag and drop
            setupCitationDragAndDrop();

            // Initialize TabManager if available (editor-tabs.js loaded via defer)
            if (window.tabManager && typeof window.tabManager.init === 'function') {
                await window.tabManager.init();
            }

            // Trigger file restoration if we have restored content but didn't use it during initialization
            // Skip if TabManager will handle restoration from persisted tabs
            if (window.restoredFileContent && !initialContent && !window._tabManagerWillRestore) {

                if (window.restoredFileContent.isPDF) {
                    // For PDFs, directly handle as PDF file instead of trying to load content
                    handlePDFFile(window.restoredFileContent.path);
                } else {
                    // For regular text files, load content into editor
                    await openFileInEditor(window.restoredFileContent.path, window.restoredFileContent.content);
                }

                // Clear the restored content flag
                window.restoredFileContent = null;
            }

            // --- Resizing Logic (MOVED HERE) --- 
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
            }

            // --- Resizing Logic for Left Resizer ---
            const resizerLeft = document.getElementById('sidebar-resizer');
            const leftSidebar = document.getElementById('left-sidebar');
            // editorPane is already defined above for the right resizer

            let isResizingLeft = false;
            let startXLeft, initialSidebarWidth;

            if (!resizerLeft || !leftSidebar) { // Check all required panes
                console.error('Left resizer or left sidebar not found after Monaco init!');
            } else {
                resizerLeft.addEventListener('mousedown', handleMouseDownLeft);
            }

            function handleMouseDownLeft(e) {
                if (!resizerLeft || !leftSidebar) return;
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
                isResizingLeft = false;
                document.removeEventListener('mousemove', handleMouseMoveLeft);
                document.removeEventListener('mouseup', handleMouseUpLeft);
                // Send layout settings to main process
                saveCurrentLayout();
            }

            // Define handlers within the scope where variables are accessible
            function handleMouseDown(e) {
                if (!resizer || !editorPane || !rightPane) return; 
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
        // Handle both empty string and null for currentFile
        const currentFileFromSettings = appSettings.currentFile;
        
        window.currentFilePath = (currentFileFromSettings && currentFileFromSettings.trim()) ? currentFileFromSettings : null;
        
        // Immediately sync currentFilePath with main process to ensure consistency
        if (window.currentFilePath) {
            try {
                await window.electronAPI.invoke('set-current-file', window.currentFilePath);
            } catch (error) {
                console.error('[renderer.js] Failed to sync currentFilePath with main process:', error);
            }
        }
        
        let themeAppliedFromSettings = false;
        
        // Store flag for file restoration to coordinate with Monaco initialization
        window.hasFileToRestore = !!window.currentFilePath;
        
        // Load the last opened file if it exists
        if (window.currentFilePath) {
            
            // Check if it's a PDF file - handle differently
            const isPDF = window.currentFilePath.endsWith('.pdf');
            
            if (isPDF) {
                // For PDFs, we don't need to restore content, just open the PDF viewer
                window.restoredFileContent = {
                    path: window.currentFilePath,
                    isPDF: true
                };
            } else {
                try {
                    const result = await window.electronAPI.invoke('open-file-path', window.currentFilePath);
                    if (result.success) {
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

        // 1. Apply any explicit theme preference up front.
        if (typeof appSettings.theme === 'string' && appSettings.theme && appSettings.theme !== 'auto') {
            applyTheme(appSettings.theme);
            themeAppliedFromSettings = true;
        }

        // 2. If no specific theme set (or set to 'auto'), check initial OS theme
        if (!themeAppliedFromSettings) {
            try {
                // Assuming 'get-initial-theme' returns boolean 'isDarkMode'
                const osIsDarkMode = await window.electronAPI.invoke('get-initial-theme');
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
                // Skip OS updates when the user has any explicit non-auto theme selected.
                if (typeof appSettings.theme === 'string' && appSettings.theme && appSettings.theme !== 'auto') {
                    return;
                }
                // Apply theme based on OS update if setting is 'auto' or not set
                applyTheme(osIsDarkMode);
            });
            window.electronAPI._themeListenerAttached = true; // Set flag
        } else {
        }

    } catch (err) {
        console.error('[renderer.js] Failed to load settings:', err);
    }
    
    // Initialize modules after Monaco editor is ready
    
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
    
}

// Handle file opened event (e.g., from File > Open or File Tree click)
if (window.electronAPI) {
    window.electronAPI.on('file-opened', async (data) => {
        if (data && typeof data.content === 'string' && typeof data.filePath === 'string') {
            await openFileInEditor(data.filePath, data.content);
            // Save current file to settings
            window.electronAPI.invoke('set-current-file', data.filePath);
        }
    });
}

let diskReloadInProgress = false;
let lastDiskConflictNotificationKey = null;

async function applyDiskReloadToCurrentEditor(filePath, content) {
    const activeTab = window.tabManager?.tabs?.get(filePath);
    const viewState = editor?.saveViewState ? editor.saveViewState() : null;

    suppressAutoSave = true;
    try {
        if (activeTab?.model && !activeTab.model.isDisposed?.()) {
            activeTab.model.setValue(content);
            activeTab.lastSavedContent = content;
            activeTab.isDirty = false;
            if (window.tabManager.activeTabPath === filePath && editor && editor.getModel() !== activeTab.model) {
                editor.setModel(activeTab.model);
            }
        } else if (editor?.getModel()) {
            editor.getModel().setValue(content);
        } else if (editor?.setValue) {
            editor.setValue(content);
        } else if (fallbackEditor) {
            fallbackEditor.value = content;
        }
    } finally {
        suppressAutoSave = false;
    }

    if (viewState && editor?.restoreViewState) {
        try {
            editor.restoreViewState(viewState);
        } catch (error) {
            console.warn('[disk-reload] Could not restore editor view state:', error);
        }
    }

    lastSavedContent = content;
    if (typeof window._setLastSavedContent === 'function') {
        window._setLastSavedContent(content);
    }
    window.hasUnsavedChanges = false;
    updateUnsavedIndicator(false);

    if (window.tabManager) {
        window.tabManager.syncActiveTabDirty(false, content);
    }

    if (isMarkdownFilePath(filePath)) {
        try {
            const loaded = await loadBibliographyForMarkdownFile(filePath, content);
            if (!loaded) {
                await loadBibTeXFiles();
            }
        } catch (error) {
            console.warn('[disk-reload] Could not refresh bibliography after disk reload:', error);
        }

        if (window.tagManager) {
            try {
                window.currentFileData = window.tagManager.processFile(filePath, content);
                if (window.updateFileTreeWithTags) window.updateFileTreeWithTags();
            } catch (error) {
                console.warn('[disk-reload] Could not refresh tags after disk reload:', error);
            }
        }

        updateSlideThumbnails(content);
    }

    await updatePreviewAndStructure(content);
    if (window.syncContentToPresentation) {
        window.syncContentToPresentation(content);
    }
    updateAIChatContext(filePath);
}

async function reloadCurrentFileFromDisk(payload = {}) {
    const filePath = payload.filePath;
    if (!filePath || filePath !== window.currentFilePath || diskReloadInProgress) {
        return;
    }

    const changeKey = `${filePath}:${payload.mtimeMs || ''}:${payload.size || ''}`;
    if (window.hasUnsavedChanges) {
        if (lastDiskConflictNotificationKey !== changeKey) {
            lastDiskConflictNotificationKey = changeKey;
            showNotification('File changed on disk. Save or reopen to resolve local edits before reloading.', 'warning', 6000);
        }
        return;
    }

    diskReloadInProgress = true;
    try {
        const result = await window.electronAPI.invoke('read-file', filePath);
        if (!result?.success) {
            showNotification(result?.error || 'Failed to reload changed file from disk', 'error');
            return;
        }

        await applyDiskReloadToCurrentEditor(filePath, result.content || '');
        lastDiskConflictNotificationKey = null;
        showNotification(`Reloaded ${filePath.split('/').pop()} from disk`, 'info', 1800);
    } catch (error) {
        console.error('[disk-reload] Failed to reload changed file:', error);
        showNotification('Failed to reload changed file from disk', 'error');
    } finally {
        diskReloadInProgress = false;
    }
}

function handleCurrentFileDeletedOnDisk(payload = {}) {
    if (!payload.filePath || payload.filePath !== window.currentFilePath) {
        return;
    }
    showNotification('Current file was deleted or moved on disk', 'warning', 6000);
    if (window.renderFileTree) {
        fileTreeRendered = false;
        window.renderFileTree();
    }
}

if (window.electronAPI) {
    window.electronAPI.on('current-file-changed-on-disk', reloadCurrentFileFromDisk);
    window.electronAPI.on('current-file-deleted-on-disk', handleCurrentFileDeletedOnDisk);
}

// Helper to open file in editor
async function refreshCurrentFile() {
    if (!currentFilePath) {
        return;
    }
    
    try {
        
        const result = await window.electronAPI.invoke('open-file-path', currentFilePath);
        
        if (result.success) {
            
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
                    const counts = countWordsAndLines(content);
                    const wordCount = counts.words;
                    const lineCount = counts.lines;
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
                        const counts = countWordsAndLines(content);
                        const wordCount = counts.words;
                        const lineCount = counts.lines;
                        stats = ` (${lineCount} lines, ${wordCount} words)`;
                    }
                }
                window.addChatMessage(`AI Assistant ready. Currently editing: ${fileName}${stats}\n\nEditor content will be automatically included with your messages.\nType /help for available commands.`, 'AI');
            } else {
                window.addChatMessage(`AI Assistant ready. No file currently open.\n\nType /help for available commands.`, 'AI');
            }
        }
    }

}

// --- PDF to Markdown Import (Docling) ---
async function importPdfAsMarkdown() {

    // Show a loading indicator
    const statusElement = document.getElementById('status-bar-text') || document.getElementById('status-text');
    const originalStatus = statusElement?.textContent || '';
    if (statusElement) {
        statusElement.textContent = 'Importing PDF... (this may take a moment)';
    }

    try {
        // Call the IPC handler to open file dialog and convert
        const result = await window.electronAPI.invoke('import-pdf-as-markdown');

        if (result.cancelled) {
            if (statusElement) statusElement.textContent = originalStatus;
            return;
        }

        if (!result.success) {
            console.error('[Renderer] PDF import failed:', result.error);

            // Show error dialog with install instructions if docling not available
            let errorMessage = result.error || 'Unknown error occurred';
            if (result.install_instructions) {
                errorMessage += '\n\nTo install Docling, run:\n' + result.install_instructions.docling;
            }

            alert('PDF Import Failed\n\n' + errorMessage);
            if (statusElement) statusElement.textContent = originalStatus;
            return;
        }

        // Success - we have markdown content

        // Set the content in the editor
        if (editor && typeof editor.setValue === 'function') {
            editor.setValue(result.markdown);
        }

        // Mark as unsaved (this is new content, not yet saved)
        if (typeof markDocumentModified === 'function') {
            markDocumentModified();
        }
        window.hasUnsavedChanges = true;
        window.currentFilePath = null; // No file path yet - user needs to save

        // Update preview
        if (typeof updatePreviewAndStructure === 'function') {
            await updatePreviewAndStructure(result.markdown);
        }

        // Suggest saving
        const suggestedName = result.suggestedFilename || 'converted.md';
        if (statusElement) {
            statusElement.textContent = `PDF imported! Save as: ${suggestedName}`;
        }

        // Show success notification

    } catch (error) {
        console.error('[Renderer] Error during PDF import:', error);
        alert('PDF Import Error\n\n' + error.message);
        if (statusElement) statusElement.textContent = originalStatus;
    }
}

// Export for global access
window.importPdfAsMarkdown = importPdfAsMarkdown;

// --- Word to Markdown Import (Pandoc) ---
async function importWordAsMarkdown() {

    // Show a loading indicator
    const statusElement = document.getElementById('status-bar-text') || document.getElementById('status-text');
    const originalStatus = statusElement?.textContent || '';
    if (statusElement) {
        statusElement.textContent = 'Importing Word document...';
    }

    try {
        // Call the IPC handler to open file dialog and convert
        const result = await window.electronAPI.invoke('import-word-as-markdown');

        if (result.cancelled) {
            if (statusElement) statusElement.textContent = originalStatus;
            return;
        }

        if (!result.success) {
            console.error('[Renderer] Word import failed:', result.error);

            // Show error dialog with install instructions if pandoc not available
            let errorMessage = result.error || 'Unknown error occurred';
            if (result.install_instructions) {
                const platform = window.electronAPI?.platform || 'unknown';
                const installCmd = result.install_instructions[platform] || result.install_instructions.macos;
                errorMessage += '\n\nTo install Pandoc:\n' + installCmd;
            }

            alert('Word Import Failed\n\n' + errorMessage);
            if (statusElement) statusElement.textContent = originalStatus;
            return;
        }

        // Success - we have markdown content

        // Set the content in the editor
        if (editor && typeof editor.setValue === 'function') {
            editor.setValue(result.markdown);
        }

        // Mark as unsaved (this is new content, not yet saved)
        if (typeof markDocumentModified === 'function') {
            markDocumentModified();
        }
        window.hasUnsavedChanges = true;
        window.currentFilePath = null; // No file path yet - user needs to save

        // Update preview
        if (typeof updatePreviewAndStructure === 'function') {
            await updatePreviewAndStructure(result.markdown);
        }

        // Suggest saving
        const suggestedName = result.suggestedFilename || 'converted.md';
        if (statusElement) {
            statusElement.textContent = `Word document imported! Save as: ${suggestedName}`;
        }

        // Show success notification

    } catch (error) {
        console.error('[Renderer] Error during Word import:', error);
        alert('Word Import Error\n\n' + error.message);
        if (statusElement) statusElement.textContent = originalStatus;
    }
}

// Export for global access
window.importWordAsMarkdown = importWordAsMarkdown;

// --- Thumbnail Generation (Nano Banana) ---
async function generateThumbnail(options = {}) {

    // Show a loading indicator
    const statusElement = document.getElementById('status-bar-text') || document.getElementById('status-text');
    const originalStatus = statusElement?.textContent || '';

    try {
        // If no options provided, show the dialog
        if (!options.input) {
            const dialogResult = await window.electronAPI.invoke('generate-thumbnail-dialog', window.currentFilePath);

            if (dialogResult.cancelled) {
                return;
            }

            if (!dialogResult.success) {
                console.error('[Renderer] Thumbnail dialog failed:', dialogResult.error);
                alert('Thumbnail Generation Error\n\n' + dialogResult.error);
                return;
            }

            // Use the dialog results
            options = {
                input: dialogResult.input,
                style: dialogResult.style,
                recursive: dialogResult.recursive
            };
        }

        if (statusElement) {
            statusElement.textContent = 'Generating thumbnail...';
        }

        // Call the thumbnail generation handler
        const result = await window.electronAPI.invoke('generate-thumbnail', options);

        if (!result.success) {
            console.error('[Renderer] Thumbnail generation failed:', result.error);
            alert('Thumbnail Generation Failed\n\n' + result.error);
            if (statusElement) statusElement.textContent = originalStatus;
            return;
        }

        // Success

        const successCount = result.successful || 1;
        const outputPaths = result.results?.filter(r => r.success).map(r => r.output) || [];

        if (statusElement) {
            statusElement.textContent = `Thumbnail generated! (${successCount} file${successCount > 1 ? 's' : ''})`;
        }

        // Show success notification with paths
        if (outputPaths.length > 0) {
            const pathList = outputPaths.slice(0, 3).join('\n');
            const moreCount = outputPaths.length > 3 ? `\n...and ${outputPaths.length - 3} more` : '';
        }

        // Reset status after a delay
        setTimeout(() => {
            if (statusElement && statusElement.textContent.includes('Thumbnail generated')) {
                statusElement.textContent = originalStatus;
            }
        }, 5000);

    } catch (error) {
        console.error('[Renderer] Error during thumbnail generation:', error);
        alert('Thumbnail Generation Error\n\n' + error.message);
        if (statusElement) statusElement.textContent = originalStatus;
    }
}

// Export for global access
window.generateThumbnail = generateThumbnail;

// Generate thumbnail for a specific file (called from context menu)
async function generateThumbnailForFile(filePath) {

    // Show style selection dialog
    const styles = ['photo', 'illustration', 'abstract', 'minimal'];
    const styleLabels = {
        'photo': '📷 Photo (realistic)',
        'illustration': '🎨 Illustration (artistic)',
        'abstract': '🌀 Abstract (conceptual)',
        'minimal': '⬜ Minimal (clean)'
    };

    const colorModes = ['color', 'bw', 'sepia', 'duotone'];
    const colorLabels = {
        'color': '🌈 Full Color',
        'bw': '⬛ Black & White',
        'sepia': '🟤 Sepia',
        'duotone': '🔵 Duotone'
    };

    // Create a simple style picker dialog
    const styleDialog = document.createElement('div');
    styleDialog.className = 'modal-overlay';
    styleDialog.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
    `;

    const isDarkMode = document.body.classList.contains('dark-mode');
    const bgColor = isDarkMode ? '#2d2d2d' : 'white';
    const textColor = isDarkMode ? '#e0e0e0' : '#333';
    const borderColor = isDarkMode ? '#444' : '#ddd';
    const labelColor = isDarkMode ? '#aaa' : '#666';

    styleDialog.innerHTML = `
        <div style="background: ${bgColor}; color: ${textColor}; padding: 20px; border-radius: 8px; min-width: 380px; max-width: 450px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
            <h3 style="margin: 0 0 16px 0; font-size: 16px;">🎨 Generate Thumbnail</h3>

            <div style="margin-bottom: 16px;">
                <label style="display: block; font-size: 12px; color: ${labelColor}; margin-bottom: 6px; font-weight: 500;">Style</label>
                <div id="style-options" style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
                    ${styles.map((style, i) => `
                        <button class="style-option-btn" data-style="${style}" style="
                            padding: 8px 12px;
                            border: 1px solid ${borderColor};
                            border-radius: 4px;
                            background: ${i === 0 ? (isDarkMode ? '#3a3a3a' : '#f0f0f0') : 'transparent'};
                            color: ${textColor};
                            cursor: pointer;
                            text-align: left;
                            font-size: 12px;
                        ">${styleLabels[style]}</button>
                    `).join('')}
                </div>
            </div>

            <div style="margin-bottom: 16px;">
                <label style="display: block; font-size: 12px; color: ${labelColor}; margin-bottom: 6px; font-weight: 500;">Color Mode</label>
                <div id="color-options" style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
                    ${colorModes.map((mode, i) => `
                        <button class="color-option-btn" data-color="${mode}" style="
                            padding: 8px 12px;
                            border: 1px solid ${borderColor};
                            border-radius: 4px;
                            background: ${i === 0 ? (isDarkMode ? '#3a3a3a' : '#f0f0f0') : 'transparent'};
                            color: ${textColor};
                            cursor: pointer;
                            text-align: left;
                            font-size: 12px;
                        ">${colorLabels[mode]}</button>
                    `).join('')}
                </div>
            </div>

            <div style="margin-bottom: 16px;">
                <label style="display: block; font-size: 12px; color: ${labelColor}; margin-bottom: 6px; font-weight: 500;">Reference Image (optional)</label>
                <div style="display: flex; gap: 8px; align-items: center;">
                    <input type="text" id="reference-image-path" placeholder="Path to reference image..." style="
                        flex: 1;
                        padding: 8px 12px;
                        border: 1px solid ${borderColor};
                        border-radius: 4px;
                        background: ${isDarkMode ? '#1e1e1e' : '#fff'};
                        color: ${textColor};
                        font-size: 12px;
                    ">
                    <button id="browse-reference-btn" style="
                        padding: 8px 12px;
                        border: 1px solid ${borderColor};
                        border-radius: 4px;
                        background: transparent;
                        color: ${textColor};
                        cursor: pointer;
                        font-size: 12px;
                    ">Browse...</button>
                </div>
                <p style="margin: 4px 0 0 0; font-size: 11px; color: ${labelColor};">
                    AI will analyze the reference image and match its color palette and style.
                </p>
            </div>

            <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; padding-top: 16px; border-top: 1px solid ${borderColor};">
                <button id="cancel-thumbnail-btn" style="padding: 8px 16px; border: 1px solid ${borderColor}; border-radius: 4px; background: transparent; color: ${textColor}; cursor: pointer;">Cancel</button>
                <button id="generate-thumbnail-btn" style="padding: 8px 16px; border: none; border-radius: 4px; background: #007acc; color: white; cursor: pointer;">Generate</button>
            </div>
        </div>
    `;

    document.body.appendChild(styleDialog);

    let selectedStyle = 'photo';
    let selectedColorMode = 'color';
    let referenceImagePath = '';

    // Handle style selection
    styleDialog.querySelectorAll('.style-option-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            styleDialog.querySelectorAll('.style-option-btn').forEach(b => {
                b.style.background = 'transparent';
            });
            btn.style.background = isDarkMode ? '#3a3a3a' : '#f0f0f0';
            selectedStyle = btn.dataset.style;
        });
    });

    // Handle color mode selection
    styleDialog.querySelectorAll('.color-option-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            styleDialog.querySelectorAll('.color-option-btn').forEach(b => {
                b.style.background = 'transparent';
            });
            btn.style.background = isDarkMode ? '#3a3a3a' : '#f0f0f0';
            selectedColorMode = btn.dataset.color;
        });
    });

    // Handle reference image browse
    const browseBtn = styleDialog.querySelector('#browse-reference-btn');
    const referenceInput = styleDialog.querySelector('#reference-image-path');
    browseBtn.addEventListener('click', async () => {
        try {
            const result = await window.electronAPI.invoke('select-image-file');
            if (result && result.filePath) {
                referenceInput.value = result.filePath;
                referenceImagePath = result.filePath;
            }
        } catch (error) {
            console.error('[Renderer] Error selecting reference image:', error);
        }
    });

    referenceInput.addEventListener('input', (e) => {
        referenceImagePath = e.target.value;
    });

    // Return a promise that resolves when user confirms or cancels
    return new Promise((resolve) => {
        const cancelBtn = styleDialog.querySelector('#cancel-thumbnail-btn');
        const generateBtn = styleDialog.querySelector('#generate-thumbnail-btn');

        cancelBtn.addEventListener('click', () => {
            styleDialog.remove();
            resolve();
        });

        // Close on escape key
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                styleDialog.remove();
                document.removeEventListener('keydown', handleEscape);
                resolve();
            }
        };
        document.addEventListener('keydown', handleEscape);

        generateBtn.addEventListener('click', async () => {
            styleDialog.remove();
            document.removeEventListener('keydown', handleEscape);

            // Now generate the thumbnail
            try {
                showNotification('Generating thumbnail with AI...', 'info');

                const options = {
                    input: filePath,
                    style: selectedStyle,
                    colorMode: selectedColorMode
                };

                if (referenceImagePath) {
                    options.referenceImage = referenceImagePath;
                }

                const result = await window.electronAPI.invoke('generate-thumbnail', options);

                if (!result.success) {
                    console.error('[Renderer] Thumbnail generation failed:', result.error);
                    showNotification('Thumbnail generation failed: ' + result.error, 'error');
                    resolve();
                    return;
                }

                // Success
                const outputPath = result.results?.[0]?.output || 'thumbnail';
                showNotification(`Thumbnail generated: ${outputPath.split('/').pop()}`, 'success');

                // Refresh file tree to show new thumbnail
                fileTreeRendered = false;
                renderFileTree();

                resolve();
            } catch (error) {
                console.error('[Renderer] Error generating thumbnail:', error);
                showNotification('Error generating thumbnail: ' + error.message, 'error');
                resolve();
            }
        });
    });
}

// Generate thumbnails for all markdown files in a folder
async function generateThumbnailsForFolder(folderPath) {

    // Show style selection dialog (similar to single file but with batch options)
    const styles = ['photo', 'illustration', 'abstract', 'minimal'];
    const styleLabels = {
        'photo': '📷 Photo (realistic)',
        'illustration': '🎨 Illustration (artistic)',
        'abstract': '🌀 Abstract (conceptual)',
        'minimal': '⬜ Minimal (clean)'
    };

    const colorModes = ['color', 'bw', 'sepia', 'duotone'];
    const colorLabels = {
        'color': '🌈 Full Color',
        'bw': '⬛ Black & White',
        'sepia': '🟤 Sepia',
        'duotone': '🔵 Duotone'
    };

    const styleDialog = document.createElement('div');
    styleDialog.className = 'modal-overlay';
    styleDialog.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
    `;

    const isDarkMode = document.body.classList.contains('dark-mode');
    const bgColor = isDarkMode ? '#2d2d2d' : 'white';
    const textColor = isDarkMode ? '#e0e0e0' : '#333';
    const borderColor = isDarkMode ? '#444' : '#ddd';
    const labelColor = isDarkMode ? '#aaa' : '#666';
    const folderName = folderPath.split('/').pop();

    styleDialog.innerHTML = `
        <div style="background: ${bgColor}; color: ${textColor}; padding: 20px; border-radius: 8px; min-width: 380px; max-width: 450px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
            <h3 style="margin: 0 0 16px 0; font-size: 16px;">🎨 Generate Folder Thumbnail</h3>
            <p style="margin: 0 0 8px 0; font-size: 13px; color: ${labelColor};">
                Synthesize all Markdown files into a single thumbnail for:
            </p>
            <p style="margin: 0 0 16px 0; font-size: 12px; font-family: monospace; background: ${isDarkMode ? '#1a1a1a' : '#f5f5f5'}; padding: 6px 8px; border-radius: 4px; overflow: hidden; text-overflow: ellipsis;">
                ${folderName}/
            </p>

            <div style="margin-bottom: 16px;">
                <label style="display: block; font-size: 12px; color: ${labelColor}; margin-bottom: 6px; font-weight: 500;">Style</label>
                <div id="style-options" style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
                    ${styles.map((style, i) => `
                        <button class="style-option-btn" data-style="${style}" style="
                            padding: 8px 12px;
                            border: 1px solid ${borderColor};
                            border-radius: 4px;
                            background: ${i === 0 ? (isDarkMode ? '#3a3a3a' : '#f0f0f0') : 'transparent'};
                            color: ${textColor};
                            cursor: pointer;
                            text-align: left;
                            font-size: 12px;
                        ">${styleLabels[style]}</button>
                    `).join('')}
                </div>
            </div>

            <div style="margin-bottom: 16px;">
                <label style="display: block; font-size: 12px; color: ${labelColor}; margin-bottom: 6px; font-weight: 500;">Color Mode</label>
                <div id="color-options" style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
                    ${colorModes.map((mode, i) => `
                        <button class="color-option-btn" data-color="${mode}" style="
                            padding: 8px 12px;
                            border: 1px solid ${borderColor};
                            border-radius: 4px;
                            background: ${i === 0 ? (isDarkMode ? '#3a3a3a' : '#f0f0f0') : 'transparent'};
                            color: ${textColor};
                            cursor: pointer;
                            text-align: left;
                            font-size: 12px;
                        ">${colorLabels[mode]}</button>
                    `).join('')}
                </div>
            </div>

            <div style="margin-bottom: 16px;">
                <label style="display: block; font-size: 12px; color: ${labelColor}; margin-bottom: 6px; font-weight: 500;">Reference Image (optional)</label>
                <div style="display: flex; gap: 8px; align-items: center;">
                    <input type="text" id="reference-image-path" placeholder="Path to reference image..." style="
                        flex: 1;
                        padding: 8px 12px;
                        border: 1px solid ${borderColor};
                        border-radius: 4px;
                        background: ${isDarkMode ? '#1e1e1e' : '#fff'};
                        color: ${textColor};
                        font-size: 12px;
                    ">
                    <button id="browse-reference-btn" style="
                        padding: 8px 12px;
                        border: 1px solid ${borderColor};
                        border-radius: 4px;
                        background: transparent;
                        color: ${textColor};
                        cursor: pointer;
                        font-size: 12px;
                    ">Browse...</button>
                </div>
            </div>

            <div style="margin-bottom: 12px;">
                <label style="display: flex; align-items: center; font-size: 13px; cursor: pointer;">
                    <input type="checkbox" id="include-subdirs" style="margin-right: 8px;">
                    Include subdirectories
                </label>
            </div>
            <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; padding-top: 16px; border-top: 1px solid ${borderColor};">
                <button id="cancel-thumbnail-btn" style="padding: 8px 16px; border: 1px solid ${borderColor}; border-radius: 4px; background: transparent; color: ${textColor}; cursor: pointer;">Cancel</button>
                <button id="generate-thumbnail-btn" style="padding: 8px 16px; border: none; border-radius: 4px; background: #007acc; color: white; cursor: pointer;">Generate Thumbnail</button>
            </div>
        </div>
    `;

    document.body.appendChild(styleDialog);

    let selectedStyle = 'photo';
    let selectedColorMode = 'color';
    let referenceImagePath = '';

    // Handle style selection
    styleDialog.querySelectorAll('.style-option-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            styleDialog.querySelectorAll('.style-option-btn').forEach(b => {
                b.style.background = 'transparent';
            });
            btn.style.background = isDarkMode ? '#3a3a3a' : '#f0f0f0';
            selectedStyle = btn.dataset.style;
        });
    });

    // Handle color mode selection
    styleDialog.querySelectorAll('.color-option-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            styleDialog.querySelectorAll('.color-option-btn').forEach(b => {
                b.style.background = 'transparent';
            });
            btn.style.background = isDarkMode ? '#3a3a3a' : '#f0f0f0';
            selectedColorMode = btn.dataset.color;
        });
    });

    // Handle reference image browse
    const browseBtn = styleDialog.querySelector('#browse-reference-btn');
    const referenceInput = styleDialog.querySelector('#reference-image-path');
    browseBtn.addEventListener('click', async () => {
        try {
            const result = await window.electronAPI.invoke('select-image-file');
            if (result && result.filePath) {
                referenceInput.value = result.filePath;
                referenceImagePath = result.filePath;
            }
        } catch (error) {
            console.error('[Renderer] Error selecting reference image:', error);
        }
    });

    referenceInput.addEventListener('input', (e) => {
        referenceImagePath = e.target.value;
    });

    return new Promise((resolve) => {
        const cancelBtn = styleDialog.querySelector('#cancel-thumbnail-btn');
        const generateBtn = styleDialog.querySelector('#generate-thumbnail-btn');
        const includeSubdirs = styleDialog.querySelector('#include-subdirs');

        cancelBtn.addEventListener('click', () => {
            styleDialog.remove();
            resolve();
        });

        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                styleDialog.remove();
                document.removeEventListener('keydown', handleEscape);
                resolve();
            }
        };
        document.addEventListener('keydown', handleEscape);

        generateBtn.addEventListener('click', async () => {
            const recursive = includeSubdirs.checked;
            styleDialog.remove();
            document.removeEventListener('keydown', handleEscape);

            try {
                showNotification('Synthesizing folder content into thumbnail... This may take a moment.', 'info');

                const options = {
                    input: folderPath,
                    style: selectedStyle,
                    colorMode: selectedColorMode,
                    recursive: recursive,
                    synthesize: true  // Combine all files into one thumbnail
                };

                if (referenceImagePath) {
                    options.referenceImage = referenceImagePath;
                }

                const result = await window.electronAPI.invoke('generate-thumbnail', options);

                if (!result.success) {
                    console.error('[Renderer] Folder thumbnail generation failed:', result.error);
                    showNotification('Thumbnail generation failed: ' + result.error, 'error');
                    resolve();
                    return;
                }

                // Success - synthesize mode creates a single thumbnail
                const outputPath = result.results?.[0]?.output || 'thumbnail';
                const fileName = outputPath.split('/').pop();
                showNotification(`Folder thumbnail generated: ${fileName}`, 'success');

                // Refresh file tree
                fileTreeRendered = false;
                renderFileTree();

                resolve();
            } catch (error) {
                console.error('[Renderer] Error generating folder thumbnail:', error);
                showNotification('Error generating thumbnail: ' + error.message, 'error');
                resolve();
            }
        });
    });
}

// Generate synthesized thumbnail from multiple selected files
async function generateThumbnailForMultipleFiles(filePaths) {

    const styles = ['photo', 'illustration', 'abstract', 'minimal'];
    const styleLabels = {
        'photo': '📷 Photo (realistic)',
        'illustration': '🎨 Illustration (artistic)',
        'abstract': '🌀 Abstract (conceptual)',
        'minimal': '⬜ Minimal (clean)'
    };

    const styleDialog = document.createElement('div');
    styleDialog.className = 'modal-overlay';
    styleDialog.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
    `;

    const isDarkMode = document.body.classList.contains('dark-mode');
    const bgColor = isDarkMode ? '#2d2d2d' : 'white';
    const textColor = isDarkMode ? '#e0e0e0' : '#333';
    const borderColor = isDarkMode ? '#444' : '#ddd';

    // Get common directory for the output
    const commonDir = filePaths[0].substring(0, filePaths[0].lastIndexOf('/'));
    const dirName = commonDir.split('/').pop();

    styleDialog.innerHTML = `
        <div style="background: ${bgColor}; color: ${textColor}; padding: 20px; border-radius: 8px; min-width: 350px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
            <h3 style="margin: 0 0 16px 0; font-size: 16px;">🎨 Generate Synthesized Thumbnail</h3>
            <p style="margin: 0 0 8px 0; font-size: 13px; color: ${isDarkMode ? '#aaa' : '#666'};">
                Combine ${filePaths.length} selected files into a single thumbnail:
            </p>
            <p style="margin: 0 0 16px 0; font-size: 12px; font-family: monospace; background: ${isDarkMode ? '#1a1a1a' : '#f5f5f5'}; padding: 6px 8px; border-radius: 4px; max-height: 60px; overflow-y: auto;">
                ${filePaths.map(f => f.split('/').pop()).join(', ')}
            </p>
            <p style="margin: 0 0 12px 0; font-size: 13px; color: ${isDarkMode ? '#aaa' : '#666'};">
                Choose a style:
            </p>
            <div id="style-options" style="display: flex; flex-direction: column; gap: 8px;">
                ${styles.map((style, i) => `
                    <button class="style-option-btn" data-style="${style}" style="
                        padding: 10px 16px;
                        border: 1px solid ${borderColor};
                        border-radius: 4px;
                        background: ${i === 0 ? (isDarkMode ? '#3a3a3a' : '#f0f0f0') : 'transparent'};
                        color: ${textColor};
                        cursor: pointer;
                        text-align: left;
                        font-size: 13px;
                    ">${styleLabels[style]}</button>
                `).join('')}
            </div>
            <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px;">
                <button id="cancel-thumbnail-btn" style="padding: 8px 16px; border: 1px solid ${borderColor}; border-radius: 4px; background: transparent; color: ${textColor}; cursor: pointer;">Cancel</button>
                <button id="generate-thumbnail-btn" style="padding: 8px 16px; border: none; border-radius: 4px; background: #007acc; color: white; cursor: pointer;">Generate</button>
            </div>
        </div>
    `;

    document.body.appendChild(styleDialog);

    let selectedStyle = 'photo';

    styleDialog.querySelectorAll('.style-option-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            styleDialog.querySelectorAll('.style-option-btn').forEach(b => {
                b.style.background = 'transparent';
            });
            btn.style.background = isDarkMode ? '#3a3a3a' : '#f0f0f0';
            selectedStyle = btn.dataset.style;
        });
    });

    return new Promise((resolve) => {
        const cancelBtn = styleDialog.querySelector('#cancel-thumbnail-btn');
        const generateBtn = styleDialog.querySelector('#generate-thumbnail-btn');

        cancelBtn.addEventListener('click', () => {
            styleDialog.remove();
            resolve();
        });

        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                styleDialog.remove();
                document.removeEventListener('keydown', handleEscape);
                resolve();
            }
        };
        document.addEventListener('keydown', handleEscape);

        generateBtn.addEventListener('click', async () => {
            styleDialog.remove();
            document.removeEventListener('keydown', handleEscape);

            try {
                showNotification('Synthesizing content from selected files...', 'info');

                // Use the common directory as input with synthesize flag
                // The script will use the files list to synthesize
                const result = await window.electronAPI.invoke('generate-thumbnail', {
                    input: commonDir,
                    style: selectedStyle,
                    synthesize: true,
                    files: filePaths  // Pass the specific files to synthesize
                });

                if (!result.success) {
                    console.error('[Renderer] Multi-file thumbnail generation failed:', result.error);
                    showNotification('Thumbnail generation failed: ' + result.error, 'error');
                    resolve();
                    return;
                }

                const outputPath = result.results?.[0]?.output || 'thumbnail';
                const fileName = outputPath.split('/').pop();
                showNotification(`Synthesized thumbnail: ${fileName}`, 'success');

                // Clear selection after success
                clearFileSelection();

                // Refresh file tree
                fileTreeRendered = false;
                renderFileTree();

                resolve();
            } catch (error) {
                console.error('[Renderer] Error generating synthesized thumbnail:', error);
                showNotification('Error generating thumbnail: ' + error.message, 'error');
                resolve();
            }
        });
    });
}

// Guard against concurrent openFileInEditor calls for the same file
let _openingFilePath = null;

async function openFileInEditor(filePath, content, options = {}) {
    // Prevent duplicate concurrent opens for the same file
    if (_openingFilePath === filePath) return;
    _openingFilePath = filePath;
    try {
        await _openFileInEditorImpl(filePath, content, options);
    } finally {
        if (_openingFilePath === filePath) _openingFilePath = null;
    }
}

async function _openFileInEditorImpl(filePath, content, options = {}) {
    // Trigger autosave before switching files (unless this is an internal link preview)
    if (!options.isInternalLinkPreview && window.performAutoSave && window.currentFilePath && window.hasUnsavedChanges) {
        try {
            await window.performAutoSave();
        } catch (error) {
            console.warn('[openFileInEditor] Autosave failed during file switch:', error);
        }
    }
    
    // Close image viewer if it's currently open
    const imageViewer = document.getElementById('image-viewer-container');
    const wasImageViewerOpen = !!imageViewer;
    if (imageViewer) {
        imageViewer.remove();
        const panesContainer = document.getElementById('panes-container');
        const modeSwitcher = document.getElementById('mode-switcher');
        if (panesContainer) panesContainer.style.display = '';
        if (modeSwitcher) modeSwitcher.style.display = '';
    }

    // Force Monaco editor to recalculate its layout
    if (wasImageViewerOpen && typeof editor !== 'undefined' && editor && typeof editor.layout === 'function') {
        setTimeout(() => editor.layout(), 0);
    }

    // --- Tab Manager routing ---
    if (window.tabManager && !options.isInternalLinkPreview) {
        const isPDFFile = filePath.endsWith('.pdf');
        const isImageFile = /\.(png|jpg|jpeg|gif|bmp|svg|webp|ico)$/i.test(filePath);

        // Only manage non-binary files as tabs
        if (!isPDFFile && !isImageFile) {
            // If tab already exists, just activate it (preserves cursor, scroll, undo)
            if (window.tabManager.hasTab(filePath)) {
                window.tabManager.activateTab(filePath);
                // Still run tag processing for markdown files
                const isMarkdown = filePath.endsWith('.md') || filePath.endsWith('.markdown');
                if (isMarkdown && window.tagManager) {
                    try {
                        const c = editor.getValue();
                        const fileData = window.tagManager.processFile(filePath, c);
                        window.currentFileData = fileData;
                        if (window.updateFileTreeWithTags) window.updateFileTreeWithTags();
                    } catch (e) { /* silent */ }
                }
                updateAIChatContext(filePath);
                return;
            }

            // At the cap, try to drain an LRU clean tab before giving up.
            // Silent fallback behaviour — the user clicked a file in the tree
            // expecting it to open; a warning toast they don't notice feels
            // like the app is broken. Only warn if every tab is dirty.
            if (window.tabManager.tabs.size >= window.tabManager.maxTabs) {
                const evicted = window.tabManager.evictLRUCleanTab();
                if (!evicted) {
                    if (typeof showNotification === 'function') {
                        showNotification(`All ${window.tabManager.maxTabs} tabs have unsaved changes. Save or close one to open a new file.`, 'warning');
                    }
                    return;
                }
            }

            // Create a new tab (model created here, handleEditableFile will skip model setup)
            window.tabManager.createTab(filePath, content);
            window.tabManager.activateTab(filePath);
        }
    }

    // Detect file type
    const isPDF = filePath.endsWith('.pdf');
    const isHTML = filePath.endsWith('.html') || filePath.endsWith('.htm');
    const isBibTeX = filePath.endsWith('.bib');
    const isMarkdown = filePath.endsWith('.md') || filePath.endsWith('.markdown');
    const isLargeMarkdown = isMarkdown && content && content.length >= LARGE_MARKDOWN_CHAR_THRESHOLD;
    
    // Exit PDF-only mode if we're opening a non-PDF file
    if (!isPDF && !options.isInternalLinkPreview) {
        exitPDFOnlyMode();
    }
    
    // Only set current file path if this is NOT an internal link preview
    if (!options.isInternalLinkPreview) {
        window.currentFilePath = filePath;
        window.editorFileName = filePath;
    }
    
    // Only update UI state if this is NOT an internal link preview
    if (!options.isInternalLinkPreview) {
        // Highlight the currently opened file in the file tree
        highlightCurrentFileInTree(filePath);

        // Update breadcrumb navigation
        updateBreadcrumb(filePath);

        // Add to navigation history and recent files (unless we're navigating history)
        const fileName = filePath.split('/').pop();
        addToNavigationHistory(filePath, fileName);
        addFileToRecents(filePath);
    } else {
        // Still add to navigation history for internal link clicks, but skip file tree highlighting
        const fileName = filePath.split('/').pop();
        addToNavigationHistory(filePath, fileName);
    }
    
    // Store current file directory for image path resolution (only for real file opens)
    if (!options.isInternalLinkPreview) {
        const lastSlash = filePath.lastIndexOf('/');
        window.currentFileDirectory = lastSlash >= 0 ? filePath.substring(0, lastSlash) : '';
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
    
    let loadToken = 0;
    if (isLargeMarkdown && !options.isInternalLinkPreview) {
        loadToken = startLargeFileIndicator(filePath, content.length);
        if (loadToken) {
            await waitForNextPaint();
        }
    }

    if (isMarkdown && !options.isInternalLinkPreview) {
        const loaded = await loadBibliographyForMarkdownFile(filePath, content);
        if (!loaded) {
            await loadBibTeXFiles();
        }
    }

    // Handle editable files (Markdown, BibTeX)
    await handleEditableFile(filePath, content, { isBibTeX, isMarkdown });
    
    // Update AI chat context when file changes
    updateAIChatContext(filePath);
}

// Layout management for PDF-only mode
function enterPDFOnlyMode() {
    
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
    // PDF Only indicator removed - no longer needed
}

function exitPDFOnlyMode() {
    
    // Remove PDF keyboard navigation
    if (window.pdfKeyboardListener) {
        document.removeEventListener('keydown', window.pdfKeyboardListener);
        window.pdfKeyboardListener = null;
    }
    
    // Remove PDF wheel navigation
    if (window.pdfWheelListener) {
        document.removeEventListener('wheel', window.pdfWheelListener, { passive: false });
        window.pdfWheelListener = null;
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
    
    // Clear any existing highlights from previous PDF
    clearAllHighlights();
    
    // Enter PDF-only mode immediately to hide editor and text abstraction controls
    enterPDFOnlyMode();
    
    // Check for associated Markdown file
    const baseName = filePath.replace(/\.pdf$/i, '');
    const associatedMdFile = baseName + '.md';
    
    // Check if associated markdown file exists
    window.electronAPI.invoke('check-file-exists', associatedMdFile)
        .then(result => {
            const exists = typeof result === 'object' ? result?.exists : result;
            if (exists) {
                // Exit PDF-only mode and restore normal layout
                exitPDFOnlyMode();
                // Load the markdown file in the editor
                return window.electronAPI.invoke('open-file-path', associatedMdFile);
            } else {
                // PDF-only mode already entered above
                return null;
            }
        })
        .then(async markdownResult => {
            if (markdownResult && markdownResult.success) {
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
    
    // Check for associated Markdown file
    const baseName = filePath.replace(/\.html?$/i, '');
    const associatedMdFile = baseName + '.md';
    
    // Check if associated markdown file exists
    window.electronAPI.invoke('check-file-exists', associatedMdFile)
        .then(result => {
            const exists = typeof result === 'object' ? result?.exists : result;
            if (exists) {
                // Load the markdown file in the editor
                return window.electronAPI.invoke('open-file-path', associatedMdFile);
            }
            return null;
        })
        .then(async markdownResult => {
            if (markdownResult && markdownResult.success) {
                // Set suppression counter for both Monaco event and handleEditableFile call
                window.suppressPreviewUpdateCount = 2;
                await handleEditableFile(associatedMdFile, markdownResult.content, { isMarkdown: true });
            } else {
                // No associated markdown, just show HTML in preview only
                // Clear the editor since HTML files are not editable
                if (editor) {
                    editor.setValue('');
                }
            }
            
            // Display HTML in preview panel (should not be overridden by markdown rendering)
            displayHTMLInPreview(content, filePath);
        })
        .catch(async error => {
            console.error('[Renderer] Error checking for associated markdown:', error);
            // Fallback to showing HTML in preview only
            if (editor) {
                editor.setValue('');
            }
            displayHTMLInPreview(content, filePath);
        });
}

// Handle editable files (Markdown, BibTeX, HTML)
async function handleEditableFile(filePath, content, fileTypes) {
    // Exit PDF-only mode when opening editable files
    exitPDFOnlyMode();

    // Process tags for markdown files
    if (fileTypes.isMarkdown && content && window.tagManager) {
        try {
            const fileData = window.tagManager.processFile(filePath, content);
            window.currentFileData = fileData;
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
            if (window.handleInternalLinkClick && typeof window.handleInternalLinkClick === 'function') {
                window.handleInternalLinkClick(event);
            }
        });
        window.internalLinkHandlerSetup = true;
    }

    // Set up link preview handlers if not already done
    if (!window.linkPreviewHandlerSetup) {
        setupLinkPreviewHandlers();
        window.linkPreviewHandlerSetup = true;
    }

    // Set editor content and language (Monaco or fallback)
    // When TabManager is active, it already set the model via activateTab() — skip model setup
    const tabManagerHandledModel = !!(window.tabManager && window.tabManager.hasTab(filePath));

    if (tabManagerHandledModel && editor) {
        // TabManager already called setModel() — just ensure layout is fresh
        editor.layout();
        setTimeout(() => {
            if (editor && typeof editor.layout === 'function') editor.layout();
        }, 50);
    } else if (editor && typeof editor.setValue === 'function') {

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

            // Force a layout update immediately and after a short delay
            // (needed when returning from image viewer where panes were hidden)
            editor.layout();
            setTimeout(() => {
                if (editor && typeof editor.layout === 'function') {
                    editor.layout();
                }
            }, 50);

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
                const t = getMonacoTheme('bibtex');
                if (t) monaco.editor.setTheme(t);
            } else if (fileTypes.isHTML) {
                monaco.editor.setModelLanguage(currentModel, 'html');
                const t = getMonacoTheme('html');
                if (t) monaco.editor.setTheme(t);
            } else {
                monaco.editor.setModelLanguage(currentModel, 'markdown');
                const t = getMonacoTheme('markdown');
                if (t) monaco.editor.setTheme(t);
            }
        }
    } else if (fallbackEditor) {
        fallbackEditor.value = content;
    } else {
        console.error('[handleEditableFile] No editor available');
    }

    // Trigger slide thumbnail strip on file open (not just on content change)
    if (fileTypes.isMarkdown && content) {
        updateSlideThumbnails(content);
    }

    // Update last saved content for auto-save tracking
    lastSavedContent = content;
    window.hasUnsavedChanges = false;
    updateUnsavedIndicator(false);

    // Clear AI companion buffers when opening new file
    if (window.aiCompanion && typeof window.aiCompanion.clearAllBuffers === 'function') {
        window.aiCompanion.clearAllBuffers();
    }

    // Update preview and structure (unless suppressed)
    if (!window.suppressNextPreviewUpdate && !window.suppressPreviewUpdateCount) {
        await updatePreviewAndStructure(content);
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
    window.hasUnsavedChanges = false;
    updateUnsavedIndicator(false);
}

// Display PDF in preview panel with search functionality
function displayPDFInPreview(filePath) {
    const previewContent = document.getElementById('preview-content');
    
    if (previewContent) {
        // Create advanced PDF viewer with search
        const pdfViewer = `
            <div class="pdf-preview-container" style="width: 100%; height: 100vh; display: flex; flex-direction: column; position: absolute; top: 0; left: 0; right: 0; bottom: 0; z-index: 1;">
                <div class="pdf-header" style="padding: 8px 12px; background: var(--preview-bg-color, #f8f9fa); border-bottom: 1px solid var(--border-color, #e1e4e8); display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; font-size: 14px; position: sticky; top: 0; z-index: 100; min-height: 40px;">
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
                    <div id="pdf-text-layer" style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; overflow: hidden;"></div>
                    <div class="pdf-fallback" style="display: none; padding: 20px; text-align: center; color: #666;">
                        <p>📄 PDF preview not available</p>
                        <p><small>Path: ${filePath}</small></p>
                        <button class="btn btn-primary" onclick="window.electronAPI.invoke('open-external', '${filePath}')" style="margin-top: 10px;">Open in External Viewer</button>
                    </div>
                    <div class="pdf-loading" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: var(--text-muted, #666);">
                        Loading PDF...
                    </div>
                </div>
                <div class="pdf-controls" style="padding: 8px 12px; background: var(--preview-bg-color, #f8f9fa); border-top: 1px solid var(--border-color, #e1e4e8); display: flex; align-items: center; justify-content: center; gap: 12px; flex-shrink: 0; position: sticky; bottom: 0; z-index: 100; min-height: 40px;">
                    <button id="pdf-prev-page" style="padding: 4px 8px; border: 1px solid var(--border-color, #ccc); border-radius: 3px; background: var(--button-bg, #fff); cursor: pointer;">Previous</button>
                    <span id="pdf-page-info" style="font-size: 12px; color: var(--text-muted, #666);">Page 1 of 1</span>
                    <button id="pdf-next-page" style="padding: 4px 8px; border: 1px solid var(--border-color, #ccc); border-radius: 3px; background: var(--button-bg, #fff); cursor: pointer;">Next</button>
                    <button id="pdf-zoom-out" style="padding: 4px 8px; border: 1px solid var(--border-color, #ccc); border-radius: 3px; background: var(--button-bg, #fff); cursor: pointer; margin-left: 12px;">-</button>
                    <span id="pdf-zoom-level" style="font-size: 12px; color: var(--text-muted, #666);">100%</span>
                    <button id="pdf-zoom-in" style="padding: 4px 8px; border: 1px solid var(--border-color, #ccc); border-radius: 3px; background: var(--button-bg, #fff); cursor: pointer;">+</button>
                    <button id="pdf-highlight-mode" style="padding: 4px 8px; border: 1px solid var(--border-color, #ccc); border-radius: 3px; background: var(--button-bg, #fff); cursor: pointer; margin-left: 12px;" title="Toggle Highlight Mode">🖍️</button>
                    <button id="pdf-clear-highlights" style="padding: 4px 8px; border: 1px solid var(--border-color, #ccc); border-radius: 3px; background: var(--button-bg, #fff); cursor: pointer;" title="Clear All Highlights">🗑️</button>
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
    currentRenderTask: null,
    searchMatches: [],
    currentMatch: -1,
    textContent: [],
    highlights: [],
    highlightMode: false,
    searchHighlights: []
};

// Make pdfViewerState available globally for CanvasTextSelector
window.pdfViewerState = pdfViewerState;

// Initialize PDF.js viewer
async function initializePDFViewer(filePath) {
    
    try {
        // Wait for PDF.js to be available from CDN
        if (typeof window.pdfjsLib === 'undefined') {
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
        
        
        // Hide loading, show canvas
        loadingElement.style.display = 'none';
        canvas.style.display = 'block';
        
        // Render first page
        await renderPage(1);
        
        // Extract text content for search
        await extractAllTextContent();
        
        // Load existing annotations for this PDF
        await loadPDFAnnotations();
        
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
        // Cancel any existing render task
        if (pdfViewerState.currentRenderTask) {
            try {
                await pdfViewerState.currentRenderTask.cancel();
            } catch (e) {
                // Ignore cancellation errors - task may already be cancelled
            }
            pdfViewerState.currentRenderTask = null;
        }
        
        const page = await pdfViewerState.doc.getPage(pageNum);
        const viewport = page.getViewport({ scale: pdfViewerState.scale });
        
        const canvas = pdfViewerState.canvas;
        const ctx = pdfViewerState.ctx;
        
        // Clear canvas before rendering
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Store old page for smooth transition
        const oldPage = pdfViewerState.currentPage;
        
        // Add smooth transition if enabled
        if (smooth && oldPage !== pageNum) {
            canvas.style.transition = 'opacity 0.2s ease-in-out';
            canvas.style.opacity = '0.3';
        }
        
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        const renderContext = {
            canvasContext: ctx,
            viewport: viewport
        };
        
        // Store the render task so we can cancel it if needed
        pdfViewerState.currentRenderTask = page.render(renderContext);
        await pdfViewerState.currentRenderTask.promise;
        pdfViewerState.currentRenderTask = null;
        
        // Update current page BEFORE initializing text selector
        pdfViewerState.currentPage = pageNum;
        
        // Get text content for canvas-based text selection
        const textContent = await page.getTextContent();
        
        // Use canvas-based text selection instead of problematic text layer
        if (!pdfViewerState.highlightMode) {
            // Clear any existing text layer
            const textLayerDiv = document.getElementById('pdf-text-layer');
            if (textLayerDiv) {
                textLayerDiv.innerHTML = '';
                textLayerDiv.style.display = 'none';
            }
            
            // Initialize canvas text selector
            if (!canvasTextSelector && typeof window.createCanvasTextSelector === 'function') {
                canvasTextSelector = window.createCanvasTextSelector();
            }
            if (canvasTextSelector) {
                canvasTextSelector.initialize(pdfViewerState.canvas, page, viewport, textContent);
            } else {
                console.error('[PDF] canvasTextSelector is null, cannot initialize');
            }
            
            // Restore any existing selection highlight after page render
            if (canvasTextSelector && canvasTextSelector.currentSelection) {
                setTimeout(() => canvasTextSelector.drawSelectedTextHighlight(), 50);
            }
        } else {
            // In highlight mode, still use text layer for search functionality
            await renderTextLayer(page, pageNum, viewport);
        }
        
        // Draw highlights on the current page
        drawHighlights(ctx, pageNum);
        
        // Draw any stored selection highlight
        if (canvasTextSelector && typeof canvasTextSelector.drawSelectedTextHighlight === 'function') {
            canvasTextSelector.drawSelectedTextHighlight();
        }
        
        // Complete smooth transition
        if (smooth && oldPage !== pageNum) {
            setTimeout(() => {
                canvas.style.opacity = '1';
                // Remove transition after animation completes
                setTimeout(() => {
                    canvas.style.transition = '';
                }, 200);
            }, 50);
        }
        
        updatePageInfo();
        
        
    } catch (error) {
        // RenderingCancelledException is expected when navigating quickly between pages
        if (error.name === 'RenderingCancelledException') {
        } else {
            console.error('[PDF] Error rendering page:', error);
        }
    }
}

// Canvas-based text selection system is now handled by pdfAnnotations.js module

// All PDF annotation functionality is now loaded from pdfAnnotations.js module

// PDF annotation functions will be available after module loads:
// - window.createCanvasTextSelector() - creates CanvasTextSelector instance
// - window.savePDFAnnotations() - saves annotations
// - window.loadPDFAnnotations() - loads annotations
// - window.clearAllHighlights() - clears all highlights

// The CanvasTextSelector class and all PDF annotation functions have been moved to pdfAnnotations.js
// They will be available as global functions after the module loads

// All PDF functions have been moved to pdfAnnotations.js module

// Display HTML in preview panel
function displayHTMLInPreview(htmlContent, filePath) {
    const previewContent = document.getElementById('preview-content');
    
    if (previewContent) {
        // Fix relative paths in HTML content to absolute file:// URLs
        const htmlDir = filePath.replace(/[^\/]+$/, ''); // Get directory of HTML file
        let fixedHtmlContent = htmlContent;
        
        // Fix relative image paths (src="images/..." -> src="file:///absolute/path/images/...")
        fixedHtmlContent = fixedHtmlContent.replace(
            /src="([^"]+)"/g,
            (match, src) => {
                if (!src.startsWith('http') && !src.startsWith('file://') && !src.startsWith('/')) {
                    // Convert relative path to absolute file:// URL
                    const absolutePath = htmlDir + src;
                    return `src="file://${absolutePath}"`;
                }
                return match;
            }
        );
        
        // Fix relative href paths for links
        fixedHtmlContent = fixedHtmlContent.replace(
            /href="([^"]+)"/g,
            (match, href) => {
                if (!href.startsWith('http') && !href.startsWith('file://') && !href.startsWith('/') && !href.startsWith('#')) {
                    // Convert relative path to absolute file:// URL
                    const absolutePath = htmlDir + href;
                    return `href="file://${absolutePath}"`;
                }
                return match;
            }
        );
        
        // Create HTML preview with safety measures
        const htmlViewer = `
            <div class="html-preview-container" style="width: 100%; height: 100vh; display: flex; flex-direction: column; position: absolute; top: 0; left: 0; right: 0; bottom: 0;">
                <div class="html-header" style="padding: 8px 12px; background: var(--preview-bg-color, #f8f9fa); border-bottom: 1px solid var(--border-color, #e1e4e8); font-weight: bold; flex-shrink: 0; font-size: 14px;">
                    🌐 ${filePath.split('/').pop()}
                </div>
                <div style="flex: 1; overflow: hidden; position: relative; min-height: 0;">
                    <iframe srcdoc="${fixedHtmlContent.replace(/"/g, '&quot;')}" 
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

// Global text selector instance and permanent highlights
let canvasTextSelector = null;
let globalPermanentHighlights = [];
let globalPermanentAnnotations = [];

// Initialize CanvasTextSelector when the module is loaded
function initializeCanvasTextSelector() {
    if (typeof window.createCanvasTextSelector === 'function') {
        canvasTextSelector = window.createCanvasTextSelector();
    } else {
    }
}

// PDF annotation functions are now handled by pdfAnnotations.js module

// --- PDF Display and Management Functions ---
async function displayPDF(filePath) {
    
    if (typeof window.pdfjsLib === 'undefined') {
        console.error('[PDF] PDF.js not loaded');
        previewContent.innerHTML = '<p>Error: PDF.js library not loaded.</p>';
        return;
    }
        
        // Get click position relative to canvas
        const rect = this.canvas.getBoundingClientRect();
        const x = (event.clientX - rect.left) * (this.canvas.width / rect.width);
        const y = (event.clientY - rect.top) * (this.canvas.height / rect.height);
        
        
        // Check if clicking on existing highlight/annotation even without current selection
        const clickedHighlight = this.findHighlightAtPoint(x, y);
        const clickedAnnotation = this.findAnnotationAtPoint(x, y);
        
        if (clickedHighlight || clickedAnnotation || (this.currentSelection && this.currentSelection.text)) {
            // Show context menu at mouse position
            this.showContextMenu(event.clientX, event.clientY, { x, y });
        } else {
        }
        
    // Clear and load PDF
    clearAllHighlights();
    loadPDFAnnotations();
    
    try {
        // Set worker source
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = './node_modules/pdfjs-dist/build/pdf.worker.js';
        }
        
        // Loading task setup
        const loadingTask = pdfjsLib.getDocument(filePath);
        const pdf = await loadingTask.promise;
        
        
        // Initialize PDF viewer state
        window.pdfViewerState = {
            pdf: pdf,
            currentPage: 1,
            totalPages: pdf.numPages,
            currentRenderTask: null,
            highlightMode: false,
            searchMatches: [],
            currentMatch: 0
        };
        
        // Render first page
        await renderPDFPage(pdf, 1);
        
    } catch (error) {
        console.error('[PDF] Error loading PDF:', error);
        previewContent.innerHTML = '<p>Error loading PDF file.</p>';
    }
}

// --- PDF Page Rendering ---
async function renderPDFPage(pdf, pageNumber, smooth = false) {
    if (pageNumber < 1 || pageNumber > pdf.numPages) return;
    
    const oldPage = window.pdfViewerState.currentPage;
    window.pdfViewerState.currentPage = pageNumber;
    
    try {
        // Cancel existing render task
        if (window.pdfViewerState.currentRenderTask) {
            window.pdfViewerState.currentRenderTask.cancel();
        }
        
        const page = await pdf.getPage(pageNumber);
        const scale = 1.5;
        const viewport = page.getViewport({scale: scale});
        
        // Create canvas
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        // Render page
        const renderContext = {
            canvasContext: context,
            viewport: viewport
        };
        
        const renderTask = page.render(renderContext);
        window.pdfViewerState.currentRenderTask = renderTask;
        
        await renderTask.promise;
        
        // Display canvas
        previewContent.innerHTML = '';
        previewContent.appendChild(canvas);
        
        
    } catch (error) {
        if (error.name === 'RenderingCancelledException') {
        } else {
            console.error('[PDF] Error rendering page:', error);
        }
    }
}

// All PDF annotation functionality has been moved to pdfAnnotations.js module

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


// Calculate dynamic positioning for text layer based on PDF layout
async function calculateDynamicTextLayerPositioning(page, viewport, canvasRect, currentScale) {
    try {
        const textContent = await page.getTextContent();
        
        if (textContent.items.length === 0) {
            // Fallback to default values
            return {
                leftOffset: 24,
                topOffset: -12,
                horizontalScale: 0.62,
                verticalScale: 0.62
            };
        }
        
        // Analyze first few text items to determine layout characteristics
        const sampleItems = textContent.items.slice(0, 20).filter(item => item.str.trim() !== '');
        
        if (sampleItems.length === 0) {
            return {
                leftOffset: 24,
                topOffset: -12,
                horizontalScale: 0.62,
                verticalScale: 0.62
            };
        }
        
        // Calculate page margins by finding leftmost and topmost content
        const leftMargin = Math.min(...sampleItems.map(item => item.transform[4]));
        const topPositions = sampleItems.map(item => viewport.height - item.transform[5]);
        const topMargin = Math.min(...topPositions);
        
        // Calculate average font size to determine scaling
        const avgFontSize = sampleItems.reduce((sum, item) => sum + Math.abs(item.transform[0]), 0) / sampleItems.length;
        
        // Calculate line heights by looking at vertical spacing
        const sortedByTop = sampleItems.sort((a, b) => (viewport.height - a.transform[5]) - (viewport.height - b.transform[5]));
        let lineSpacing = avgFontSize * 1.2; // Default
        
        for (let i = 1; i < sortedByTop.length; i++) {
            const currentY = viewport.height - sortedByTop[i].transform[5];
            const prevY = viewport.height - sortedByTop[i-1].transform[5];
            const spacing = currentY - prevY;
            
            if (spacing > avgFontSize && spacing < avgFontSize * 3) {
                lineSpacing = spacing;
                break;
            }
        }
        
        // Calculate scaling factors based on current zoom level
        const baseScale = currentScale || 1;
        const canvasScale = canvasRect.width / viewport.width;
        
        // Dynamic calculations based on PDF layout
        const leftOffset = (leftMargin * canvasScale) + (10 * baseScale);
        const topOffset = -(topMargin * canvasScale * 0.5); // Adjust for PDF coordinate system
        
        // Scale factors based on font size and line spacing relative to expected values
        const horizontalScale = Math.max(0.5, Math.min(0.8, 0.65 * baseScale));
        const verticalScale = Math.max(0.4, Math.min(0.8, (avgFontSize / lineSpacing) * 0.6 * baseScale));
        
        return {
            leftOffset: Math.round(leftOffset),
            topOffset: Math.round(topOffset),
            horizontalScale: Math.round(horizontalScale * 100) / 100,
            verticalScale: Math.round(verticalScale * 100) / 100
        };
        
    } catch (error) {
        console.warn('Failed to calculate dynamic positioning, using defaults:', error);
        return {
            leftOffset: 24,
            topOffset: -12,
            horizontalScale: 0.62,
            verticalScale: 0.62
        };
    }
}

// Render selectable text layer
async function renderTextLayer(page, pageNum, viewport) {
    const textLayerDiv = document.getElementById('pdf-text-layer');
    if (!textLayerDiv) return;
    
    try {
        // Clear existing text layer
        textLayerDiv.innerHTML = '';
        
        // Get text content
        const textContent = await page.getTextContent();
        const canvas = document.getElementById('pdf-canvas');
        if (!canvas) return;
        
        // Dynamic positioning calculation based on PDF layout and zoom
        const canvasRect = canvas.getBoundingClientRect();
        const positioning = await calculateDynamicTextLayerPositioning(page, viewport, canvasRect, pdfViewerState.scale);
        
        textLayerDiv.style.width = canvasRect.width + 'px';
        textLayerDiv.style.height = canvasRect.height + 'px';
        textLayerDiv.style.position = 'absolute';
        textLayerDiv.style.left = (canvas.offsetLeft + positioning.leftOffset) + 'px';
        textLayerDiv.style.top = (canvas.offsetTop + positioning.topOffset) + 'px';
        textLayerDiv.style.transformOrigin = '0 0';
        textLayerDiv.style.transform = `scale(${positioning.horizontalScale}, ${positioning.verticalScale})`;
        
        // Try using renderTextLayer function if available
        if (typeof pdfjsLib.renderTextLayer !== 'undefined') {
            const textDivs = [];
            const textContentItemsStr = [];
            
            // Prepare text content items
            textContent.items.forEach(item => {
                textContentItemsStr.push(item.str);
            });
            
            // Scale viewport to match displayed canvas size
            const scale = canvasRect.width / canvas.width;
            const scaledViewport = viewport.clone({
                scale: scale
            });
            
            const textLayerRenderTask = pdfjsLib.renderTextLayer({
                textContent: textContent,
                container: textLayerDiv,
                viewport: scaledViewport,
                textDivs: textDivs,
                textContentItemsStr: textContentItemsStr,
                enhanceTextSelection: true
            });
            
            await textLayerRenderTask.promise;
            
            // Make text transparent but selectable and fix positioning issues
            const spans = textLayerDiv.querySelectorAll('span');
            spans.forEach(span => {
                span.style.color = 'transparent';
                span.style.cursor = 'text';
                span.style.userSelect = 'text';
                span.style.webkitUserSelect = 'text';
                span.style.MozUserSelect = 'text';
                
                // Keep it simple - let PDF.js handle positioning, just make transparent
                span.style.whiteSpace = 'pre';
                span.style.padding = '0';
                span.style.margin = '0';
                
                // Just make transparent and selectable - let container handle positioning
                span.style.color = 'transparent';
                span.style.padding = '0';
                span.style.margin = '0';
            });
        } else if (typeof pdfjsLib.TextLayer !== 'undefined') {
            // Fallback to TextLayer class
            const textLayer = new pdfjsLib.TextLayer({
                textContentSource: textContent,
                container: textLayerDiv,
                viewport: viewport,
                textDivs: [],
                textContentItemsStr: []
            });
            
            await textLayer.render();
            
            // Make all text transparent but selectable
            const spans = textLayerDiv.querySelectorAll('span[role="presentation"]');
            spans.forEach(span => {
                span.style.color = 'transparent';
                span.style.cursor = 'text';
                span.style.userSelect = 'text';
                span.style.webkitUserSelect = 'text';
                span.style.MozUserSelect = 'text';
                
                // Just make transparent and selectable - let container handle positioning
                span.style.color = 'transparent';
                span.style.padding = '0';
                span.style.margin = '0';
            });
        } else {
            console.warn('PDF.js TextLayer not available, using fallback');
            // Fallback to simple approach if TextLayer is not available
            textContent.items.forEach(item => {
                if (!item.str || item.str.trim() === '') return;
                
                const span = document.createElement('span');
                span.textContent = item.str;
                span.style.position = 'absolute';
                span.style.left = `${item.transform[4] * canvasRect.width / viewport.width}px`;
                // Add a small offset to compensate for the remaining 2-line offset
                const topPos = (viewport.height - item.transform[5]) * canvasRect.height / viewport.height;
                span.style.top = `${topPos + 30}px`; // Add 30px to move down approximately 2 lines
                span.style.fontSize = `${Math.abs(item.transform[0]) * canvasRect.height / viewport.height}px`;
                span.style.color = 'transparent';
                span.style.cursor = 'text';
                span.style.userSelect = 'text';
                textLayerDiv.appendChild(span);
            });
        }
        
        // Add CSS for text selection highlighting
        if (!document.getElementById('pdf-text-selection-style')) {
            const style = document.createElement('style');
            style.id = 'pdf-text-selection-style';
            style.textContent = `
                .pdf-text-layer-item::selection {
                    background-color: rgba(0, 100, 200, 0.3);
                    color: transparent;
                }
                .pdf-text-layer-item::-moz-selection {
                    background-color: rgba(0, 100, 200, 0.3);
                    color: transparent;
                }
            `;
            document.head.appendChild(style);
        }
        
    } catch (error) {
        console.error('[PDF] Error rendering text layer:', error);
    }
}

// Draw highlights on the current page
function drawHighlights(ctx, pageNum) {
    // Draw permanent highlights for current page
    const pageHighlights = pdfViewerState.highlights.filter(h => h.page === pageNum);
    pageHighlights.forEach(highlight => {
        ctx.save();
        ctx.fillStyle = highlight.color;
        ctx.fillRect(
            highlight.startX,
            highlight.startY,
            highlight.endX - highlight.startX,
            highlight.endY - highlight.startY
        );
        ctx.restore();
    });
    
    // Draw search highlights for current page (scaled to current zoom)
    const searchHighlights = pdfViewerState.searchHighlights.filter(h => h.page === pageNum);
    searchHighlights.forEach(highlight => {
        ctx.save();
        ctx.fillStyle = highlight.color || 'rgba(255, 165, 0, 0.6)'; // Orange for search
        
        // Scale coordinates to current zoom level
        const scaledX = highlight.startX * pdfViewerState.scale;
        const scaledY = highlight.startY * pdfViewerState.scale;
        const scaledWidth = (highlight.endX - highlight.startX) * pdfViewerState.scale;
        const scaledHeight = (highlight.endY - highlight.startY) * pdfViewerState.scale;
        
        ctx.fillRect(scaledX, scaledY, scaledWidth, scaledHeight);
        ctx.restore();
    });
    
    // Draw search indicator if there are search matches on this page
    if (pdfViewerState.searchMatches.length > 0) {
        const matchesOnPage = pdfViewerState.searchMatches.filter(m => m.pageNum === pageNum);
        if (matchesOnPage.length > 0) {
            ctx.save();
            // Draw a small indicator in top-right corner
            const canvas = ctx.canvas;
            ctx.fillStyle = 'rgba(255, 165, 0, 0.8)';
            ctx.fillRect(canvas.width - 60, 10, 50, 20);
            ctx.fillStyle = '#fff';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(`${matchesOnPage.length}`, canvas.width - 35, 24);
            ctx.restore();
        }
    }
}

// Extract text content from all pages for search
async function extractAllTextContent() {
    if (!pdfViewerState.doc) return;
    
    pdfViewerState.textContent = [];
    
    for (let i = 1; i <= pdfViewerState.totalPages; i++) {
        try {
            const page = await pdfViewerState.doc.getPage(i);
            const textContent = await page.getTextContent();
            const viewport = page.getViewport({ scale: 1.0 });
            
            const pageText = textContent.items.map(item => item.str).join(' ');
            const textItems = textContent.items.map(item => ({
                str: item.str,
                transform: item.transform,
                width: item.width,
                height: item.height,
                bbox: [
                    item.transform[4],
                    viewport.height - item.transform[5] - item.height,
                    item.transform[4] + item.width,
                    viewport.height - item.transform[5]
                ]
            }));
            
            pdfViewerState.textContent.push({
                pageNum: i,
                text: pageText,
                items: textItems,
                viewport: viewport
            });
            
        } catch (error) {
            console.error(`[PDF] Error extracting text from page ${i}:`, error);
            pdfViewerState.textContent.push({
                pageNum: i,
                text: ''
            });
        }
    }
    
}

// Find text coordinates for highlighting
function findTextCoordinates(pageContent, startIndex, length) {
    if (!pageContent.items) return null;
    
    let currentIndex = 0;
    let highlights = [];
    
    for (const item of pageContent.items) {
        const itemLength = item.str.length;
        const itemEnd = currentIndex + itemLength;
        
        // Check if search term overlaps with this text item
        if (startIndex < itemEnd && startIndex + length > currentIndex) {
            const overlapStart = Math.max(0, startIndex - currentIndex);
            const overlapEnd = Math.min(itemLength, startIndex + length - currentIndex);
            
            if (overlapStart < overlapEnd) {
                // Calculate character width for this item
                const charWidth = item.width / itemLength;
                
                highlights.push({
                    x: item.bbox[0] + (overlapStart * charWidth),
                    y: item.bbox[1],
                    width: (overlapEnd - overlapStart) * charWidth,
                    height: item.bbox[3] - item.bbox[1]
                });
            }
        }
        
        currentIndex = itemEnd + 1; // +1 for space between items
        if (currentIndex > startIndex + length) break;
    }
    
    return highlights.length > 0 ? highlights : null;
}

// Search functionality
function searchPDF(query) {
    if (!query.trim()) {
        pdfViewerState.searchMatches = [];
        pdfViewerState.currentMatch = -1;
        pdfViewerState.searchHighlights = [];
        updateSearchResults();
        renderPage(pdfViewerState.currentPage, false);
        return;
    }
    
    
    const matches = [];
    const searchTerm = query.toLowerCase();
    
    pdfViewerState.textContent.forEach(pageContent => {
        const pageText = pageContent.text.toLowerCase();
        let index = pageText.indexOf(searchTerm);
        
        while (index !== -1) {
            // Find the text coordinates for highlighting
            const textHighlight = findTextCoordinates(pageContent, index, searchTerm.length);
            
            matches.push({
                pageNum: pageContent.pageNum,
                index: index,
                text: pageContent.text.substr(Math.max(0, index - 20), 60),
                highlight: textHighlight
            });
            index = pageText.indexOf(searchTerm, index + 1);
        }
    });
    
    pdfViewerState.searchMatches = matches;
    pdfViewerState.currentMatch = matches.length > 0 ? 0 : -1;
    
    // Clear existing search highlights and create new ones
    pdfViewerState.searchHighlights = [];
    
    // Create visual highlights for all matches
    matches.forEach(match => {
        if (match.highlight) {
            match.highlight.forEach(rect => {
                pdfViewerState.searchHighlights.push({
                    page: match.pageNum,
                    startX: rect.x,
                    startY: rect.y,
                    endX: rect.x + rect.width,
                    endY: rect.y + rect.height,
                    color: 'rgba(255, 165, 0, 0.6)' // Orange highlight
                });
            });
        }
    });
    
    updateSearchResults();
    
    // Go to first match
    if (matches.length > 0) {
        goToSearchMatch(0);
    } else {
        // Re-render to clear any existing highlights
        renderPage(pdfViewerState.currentPage, false);
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
    } else {
        // Re-render to update search highlighting
        await renderPage(pdfViewerState.currentPage, false);
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
        const DELTA_THRESHOLD = 150; // Require more significant scroll to change page (increased from 100)
        
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
            }, 200); // Increased from 150ms to 200ms
            
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
                        }, 400); // Increased cooldown period from 300ms to 400ms
                    }
                } else if (accumulatedDelta < 0) {
                    // Scroll up - previous page
                    if (pdfViewerState.currentPage > 1) {
                        renderPage(pdfViewerState.currentPage - 1);
                        // Set cooldown after page change
                        wheelCooldown = true;
                        setTimeout(() => {
                            wheelCooldown = false;
                        }, 400); // Increased cooldown period from 300ms to 400ms
                    }
                }
                // Reset accumulated delta after page change
                accumulatedDelta = 0;
            }
        };
        
        document.addEventListener('wheel', window.pdfWheelListener, { passive: false });
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
    
    // Highlight controls
    const highlightMode = document.getElementById('pdf-highlight-mode');
    const clearHighlights = document.getElementById('pdf-clear-highlights');
    
    if (highlightMode) {
        highlightMode.addEventListener('click', () => {
            pdfViewerState.highlightMode = !pdfViewerState.highlightMode;
            highlightMode.style.background = pdfViewerState.highlightMode ? 
                'var(--accent-color, #007acc)' : 'var(--button-bg, #fff)';
            highlightMode.style.color = pdfViewerState.highlightMode ? 
                '#fff' : 'var(--text-color, #000)';
            
            // Update cursor style and pointer events
            const canvas = document.getElementById('pdf-canvas');
            const textLayer = document.getElementById('pdf-text-layer');
            
            if (canvas) {
                if (pdfViewerState.highlightMode) {
                    canvas.style.pointerEvents = 'auto';
                    canvas.style.cursor = 'crosshair';
                    canvas.style.userSelect = 'none';
                } else {
                    // Allow text selection directly on canvas when not highlighting
                    canvas.style.pointerEvents = 'auto';
                    canvas.style.cursor = 'text';
                    canvas.style.userSelect = 'text';
                }
            }
            
            // Toggle text layer interactivity (opposite of canvas)
            if (textLayer) {
                textLayer.style.pointerEvents = pdfViewerState.highlightMode ? 'none' : 'auto';
                textLayer.style.display = 'block';
            }
        });
    }
    
    if (clearHighlights) {
        clearHighlights.addEventListener('click', async () => {
            pdfViewerState.highlights = [];
            pdfViewerState.searchHighlights = [];
            await renderPage(pdfViewerState.currentPage);
        });
    }
    
    // Canvas mouse events are now handled by CanvasTextSelector
    // Old highlight mode functionality removed to prevent conflicts
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Only handle when PDF viewer is active
        if (!document.getElementById('pdf-canvas') || document.getElementById('pdf-canvas').style.display === 'none') {
            return;
        }

        // Don't intercept keys when user is typing in input fields
        const activeElement = document.activeElement;
        const isInputFocused = activeElement && (
            activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.isContentEditable ||
            activeElement.classList.contains('monaco-editor')
        );

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

        // Arrow key navigation - only when not in an input field
        if (!isInputFocused) {
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
        }
    });
}

// Display HTML in preview panel
function displayHTMLInPreview(htmlContent, filePath) {
    const previewContent = document.getElementById('preview-content');
    
    if (previewContent) {
        // Fix relative paths in HTML content to absolute file:// URLs
        const htmlDir = filePath.replace(/[^\/]+$/, ''); // Get directory of HTML file
        let fixedHtmlContent = htmlContent;
        
        // Fix relative image paths (src="images/..." -> src="file:///absolute/path/images/...")
        fixedHtmlContent = fixedHtmlContent.replace(
            /src="([^"]+)"/g,
            (match, src) => {
                if (!src.startsWith('http') && !src.startsWith('file://') && !src.startsWith('/')) {
                    // Convert relative path to absolute file:// URL
                    const absolutePath = htmlDir + src;
                    return `src="file://${absolutePath}"`;
                }
                return match;
            }
        );
        
        // Fix relative href paths for links
        fixedHtmlContent = fixedHtmlContent.replace(
            /href="([^"]+)"/g,
            (match, href) => {
                if (!href.startsWith('http') && !href.startsWith('file://') && !href.startsWith('/') && !href.startsWith('#')) {
                    // Convert relative path to absolute file:// URL
                    const absolutePath = htmlDir + href;
                    return `href="file://${absolutePath}"`;
                }
                return match;
            }
        );
        
        // Create HTML preview with safety measures
        const htmlViewer = `
            <div class="html-preview-container" style="width: 100%; height: 100vh; display: flex; flex-direction: column; position: absolute; top: 0; left: 0; right: 0; bottom: 0;">
                <div class="html-header" style="padding: 8px 12px; background: var(--preview-bg-color, #f8f9fa); border-bottom: 1px solid var(--border-color, #e1e4e8); font-weight: bold; flex-shrink: 0; font-size: 14px;">
                    🌐 ${filePath.split('/').pop()}
                </div>
                <div style="flex: 1; overflow: hidden; position: relative; min-height: 0;">
                    <iframe srcdoc="${fixedHtmlContent.replace(/"/g, '&quot;')}" 
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
    const textarea = document.createElement('textarea');
    fallbackEditor = textarea;
    window.fallbackEditor = textarea; // Make available globally for debugging
    
    // Use restored file content if available, otherwise use default content if no file was being restored OR if restoration failed
    if (window.restoredFileContent) {
        if (window.restoredFileContent.isPDF) {
            // For PDFs, don't try to load binary content into textarea, handle as PDF
            handlePDFFile(window.restoredFileContent.path);
            window.restoredFileContent = null;
            return; // Exit early, PDF doesn't need fallback editor
        } else {
            textarea.value = window.restoredFileContent.content;
            // Update navigation/filename display for restored file
            if (window.currentFilePath) {
                const fileName = window.currentFilePath.split('/').pop();
                if (typeof addToNavigationHistory === 'function') {
                    addToNavigationHistory(window.currentFilePath, fileName);
                } else if (typeof window.updateCurrentFileName === 'function') {
                    window.updateCurrentFileName(fileName);
                }
                // Set currentFileDirectory for image path resolution
                const lastSlash = window.currentFilePath.lastIndexOf('/');
                window.currentFileDirectory = lastSlash >= 0 ? window.currentFilePath.substring(0, lastSlash) : '';
            }
            window.restoredFileContent = null;
        }
    } else if (!window.hasFileToRestore || window.useDefaultContentFallback) {
        textarea.value = '# Welcome!\n\nStart typing your Markdown here.';
        if (window.useDefaultContentFallback) {
        } else {
        }
    } else {
        // Fallback: if we reach here with empty content, use default
        textarea.value = '# Welcome!\n\nStart typing your Markdown here.';
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
    
    // Ctrl+P or Cmd+P: Quick-open file picker
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'p') {
        e.preventDefault();
        showQuickOpen();
        return;
    }
    
    // Ctrl+S or Cmd+S: Save file
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        await saveFile();
        return;
    }
    
    // Ctrl+Shift+S or Cmd+Shift+S: Save As file
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        await saveAsFile();
        return;
    }
    
    // Alt+Z: Toggle word wrap
    if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyZ') {
        e.preventDefault();
        if (window.editor && window.editor.updateOptions) {
            const wrapOn = window.editor.getRawOptions().wordWrap === 'on';
            const newValue = wrapOn ? 'off' : 'on';
            window.editor.updateOptions({ wordWrap: newValue });
            // Persist to saved settings
            if (window.appSettings?.editor) {
                window.appSettings.editor.wordWrap = newValue;
                if (window.electronAPI) {
                    window.electronAPI.invoke('set-settings', window.appSettings).catch(() => {});
                }
            }
            if (window.showNotification) {
                window.showNotification(`Word wrap ${newValue}`, 'info');
            }
        }
        return;
    }

    // Cmd+Shift+Enter: Toggle Zen Mode
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Enter') {
        e.preventDefault();
        toggleZenMode();
        return;
    }

    // F2: Rename current file
    if (e.key === 'F2' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (window.currentFilePath) {
            e.preventDefault();
            handleFileContextMenuAction('rename', window.currentFilePath, false, false);
            return;
        }
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
    
    // Escape: Close find dialog (global) - TODO: Complete find/replace implementation
    // Temporarily disabled to prevent ReferenceErrors
    /*
    if (e.key === 'Escape' && !findReplaceDialog.classList.contains('hidden')) {
        hideFindReplaceDialog();
        return;
    }
    */

    // Cmd+Shift+' or Ctrl+Shift+': Invoke Ash (AI Writing Companion) explicitly
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "'") {
        e.preventDefault();

        await invokeAshExplicitly();
        return;
    }
});

// === Explicit Ash Invocation ===
async function invokeAshExplicitly() {
    try {
        
        // Store the prompt for "Copy to Chat" functionality
        window.lastExplicitAshPrompt = `Please provide brief writing feedback or encouragement for the current document. The user has explicitly requested your assistance.`;
        
        // Get current document content for analysis
        const currentContent = editor ? editor.getValue() : '';
        
        // Check if AI companion is available - try multiple global references
        let aiCompanion = null;
        
        if (window.aiCompanionManager && window.aiCompanionManager.feedbackSystem) {
            aiCompanion = window.aiCompanionManager;
        } else if (window.aiCompanion && window.aiCompanion.feedbackSystem) {
            aiCompanion = window.aiCompanion;
        } else if (window.gamificationManager && window.gamificationManager.aiCompanion) {
            aiCompanion = window.gamificationManager.aiCompanion;
        } else {
            // Try to trigger AI companion initialization if gamification manager exists
            if (window.gamificationManager && !window.gamificationManager.aiCompanion) {
                try {
                    if (typeof window.gamificationManager.initializeAICompanion === 'function') {
                        await window.gamificationManager.initializeAICompanion();
                        if (window.gamificationManager.aiCompanion) {
                            aiCompanion = window.gamificationManager.aiCompanion;
                        }
                    }
                } catch (error) {
                    console.error('[renderer.js] Failed to initialize AI companion:', error);
                }
            }
        }
        
        if (aiCompanion && aiCompanion.feedbackSystem) {
            
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
                // Display feedback in chat pane
                if (typeof displayAIMessage === 'function') {
                    displayAIMessage(feedback.message, feedback.persona || 'Ash');
                } else {
                    // Fallback: show in console and try to show in UI
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
            }
        } else {
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
                    if (typeof displayAIMessage === 'function') {
                        displayAIMessage(response.response, 'Ash');
                    } else {
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
    // Load settings before initializing the rest of the app
    await loadAppSettings();

    // Start Techne plugin system (shared feature bundles for Electron + web)
    try {
        if (window.TechnePlugins?.start) {
            await window.TechnePlugins.start({
                appId: 'nightowl',
                enabled: window.appSettings?.plugins || null,
                settings: window.appSettings?.plugins || null
            });
        }
    } catch (pluginError) {
        console.warn('[renderer.js] Failed to start TechnePlugins:', pluginError);
    }
    
    // Load citation data early for autocomplete
    try {
        const allEntries = await loadBibTeXFiles();
    } catch (error) {
        console.error('[renderer.js] Error in early citation loading:', error);
    }
    
    // Since Marked script has 'defer', it should be loaded and executed before DOMContentLoaded.
    // Let's check if window.marked exists now.
    if (window.marked) {
        markedInstance = window.marked; // Assign the globally loaded instance
        markedInstance.setOptions({
            breaks: true,
            gfm: true,
            headerIds: false,
            mangle: false
        });
        applyLayoutSettings(appSettings.layout); // Apply saved layout settings
        
        // Initialize gamification system (may be lazy-loaded later)
        if (!window.gamification && typeof GamificationManager !== 'undefined') {
            try {
                window.gamification = new GamificationManager();
                window.gamificationManager = window.gamification;
                window.gamificationInstance = window.gamification;

                if (typeof window.gamification.initialize === 'function') {
                    setTimeout(() => {
                        window.gamification.initialize();
                    }, 200);
                }

            } catch (error) {
                console.error('[renderer.js] Error initializing gamification:', error);
            }
        } else if (!window.gamification) {
        }
        
        // Initialize AI TODO suggestions toolbar button
        const aiTodoBtn = document.getElementById('ai-todo-suggestions-btn');
        if (aiTodoBtn) {
            aiTodoBtn.addEventListener('click', () => {
                const gamification = window.gamification || window.gamificationInstance;
                if (gamification && gamification.todoGamification) {
                    gamification.todoGamification.generateAISuggestionsNow();
                } else {
                    if (window.showNotification) {
                        window.showNotification('TODO gamification not initialized. Please open a TODO file first.', 'warning');
                    }
                }
            });
        } else {
        }
        
        try {
            await initializeMonacoEditor(); // Initialize now that Marked is ready and DOM is loaded
        } catch (initError) {
            console.error('[renderer.js] *** ERROR in initializeMonacoEditor() ***:', initError);
            console.error('[renderer.js] *** initializeMonacoEditor() ERROR STACK ***:', initError.stack);
        }
        
        setupNavigationControls(); // Setup navigation buttons and keyboard shortcuts
        
        // Initialize style manager
        if (window.styleManager && typeof window.styleManager.initialize === 'function') {
            try {
                await window.styleManager.initialize();
            } catch (styleError) {
                console.warn('[renderer.js] Failed to initialize style manager:', styleError);
            }
        }

        // Initialize theme
        if (window.applyTheme && appSettings.theme) {
            try {
                window.applyTheme(appSettings.theme);
            } catch (themeError) {
                console.warn('[renderer.js] Failed to apply theme:', themeError);
            }
        }
        
        // Initialize file tree view on startup
        switchStructureView('file'); // Switch to file view (this will also render the tree)
    } else {
        // If Marked is still not loaded here, there's a problem with the script tag or network.
        console.error('[renderer.js] CRITICAL: window.marked not found after DOMContentLoaded. Check Marked script tag in index.html and network connection.');
        
        // Initialize the app even without marked - the Monaco editor should still work
        // Preview functionality will be limited but editor will be functional
        applyLayoutSettings(appSettings.layout); // Apply saved layout settings
        
        try {
            await initializeMonacoEditor(); // Initialize the Monaco editor
        } catch (initError) {
            console.error('[renderer.js] *** ERROR in initializeMonacoEditor() (no marked fallback) ***:', initError);
            console.error('[renderer.js] *** initializeMonacoEditor() ERROR STACK (no marked fallback) ***:', initError.stack);
        }
        
        setupNavigationControls(); // Setup navigation buttons and keyboard shortcuts
        
        // Initialize file tree view on startup
        switchStructureView('file'); // Switch to file view (this will also render the tree)
    }
    
    // Initialize AI Chat functionality (may be lazy-loaded later)
    if (window.initializeChatFunctionality) {
        window.initializeChatFunctionality();
    } else {
    }
    
    // Initialize Export handlers
    if (window.initializeExportHandlers) {
        window.initializeExportHandlers();
    } else {
    }

    // Initialize Git status indicator
    initGitStatusIndicator();
}

// Emergency fallback - create a basic editor immediately if nothing else works
function createEmergencyEditor() {
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
        
        return true;
    }
    return false;
}

// Try emergency editor after a delay if nothing else worked
setTimeout(() => {
    if (!window.editor && !fallbackEditor) {
        createEmergencyEditor();
    }
}, 3000);

// Wait for the DOM to be fully loaded before trying to initialize
if (document.readyState === 'loading') {
    // DOM hasn't finished loading yet
    document.addEventListener('DOMContentLoaded', performAppInitialization);
} else {
    // DOM has already finished loading
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

    // Restore pane visibility from saved layout state
    _restoringPaneVisibility = true;
    try {
        if (layout?.editorVisible === false && editorVisible) {
            toggleEditor();
        }
        if (layout?.sidebarVisible === false && sidebarVisible) {
            toggleSidebar();
        }
        // Preview: check both the legacy editor.showPreview setting and layout state
        const showPreview = layout?.previewVisible ?? (appSettings?.editor?.showPreview !== false);
        if (!showPreview && previewVisible) {
            togglePreview();
        }
    } finally {
        _restoringPaneVisibility = false;
    }
}

// --- Settings Management ---
let appSettings = {};


// --- Structure/File Pane Toggle Listeners ---
window.window.currentStructureView = 'file'; // 'structure' or 'file' - default to files - make it global so other modules can access

showStructureBtn.addEventListener('click', () => {
    if (window.currentStructureView !== 'structure') {
        switchStructureView('structure');
    }
});

showFilesBtn.addEventListener('click', () => {
    if (window.currentStructureView !== 'file') {
        switchStructureView('file');
    }
});

// Search button event listener - handled in search.js module
const searchBtn = document.getElementById('show-search-btn');
if (searchBtn) {
    searchBtn.addEventListener('click', () => {
        if (window.currentStructureView !== 'search') {
            switchStructureView('search');
        }
    });
}

// Statistics button event listener
const showStatsBtn = document.getElementById('show-stats-btn');
if (showStatsBtn) {
    showStatsBtn.addEventListener('click', () => {
        if (window.currentStructureView !== 'statistics') {
            switchStructureView('statistics');
        }
    });
}

// Citations button event listener
const showCitationsBtn = document.getElementById('show-citations-btn');
if (showCitationsBtn) {
    showCitationsBtn.addEventListener('click', () => {
        if (window.currentStructureView !== 'citations') {
            switchStructureView('citations');
        }
    });
}

// Footnotes button event listener
const showFootnotesBtn2 = document.getElementById('show-footnotes-btn');
if (showFootnotesBtn2) {
    showFootnotesBtn2.addEventListener('click', () => {
        if (window.currentStructureView !== 'footnotes') {
            switchStructureView('footnotes');
        }
    });
}

// Git button event listener
const showGitBtn2 = document.getElementById('show-git-btn');
if (showGitBtn2) {
    showGitBtn2.addEventListener('click', () => {
        if (window.currentStructureView !== 'git') {
            switchStructureView('git');
        }
    });
}

// Slides button event listener
const showSlidesBtn = document.getElementById('show-slides-btn');
if (showSlidesBtn) {
    showSlidesBtn.addEventListener('click', () => {
        if (window.currentStructureView !== 'slides') {
            switchStructureView('slides');
        }
    });
}

// Refresh statistics button event listener
const refreshStatsBtn = document.getElementById('refresh-statistics-btn');
if (refreshStatsBtn) {
    refreshStatsBtn.addEventListener('click', () => {
        updateStatisticsPane();
    });
}


// Statistics scope switcher event listeners
const statsScopeDocument = document.getElementById('stats-scope-document');
const statsScopeProject = document.getElementById('stats-scope-project');

if (statsScopeDocument && statsScopeProject) {
    statsScopeDocument.addEventListener('click', () => {
        switchStatsScope('document');
    });
    
    statsScopeProject.addEventListener('click', () => {
        switchStatsScope('project');
    });
}

// --- New Folder Button Listener ---
newFolderBtn.addEventListener('click', async () => {
    await createNewFolder();
});

// --- Change Directory Button Listener (dropdown with recent workspaces) ---
changeDirectoryBtn.addEventListener('click', async (e) => {
    e.stopPropagation();

    // Remove any existing dropdown
    const existing = document.getElementById('workspace-dropdown');
    if (existing) { existing.remove(); return; }

    // Build dropdown
    const dropdown = document.createElement('div');
    dropdown.id = 'workspace-dropdown';
    dropdown.style.cssText = `
        position: absolute; z-index: 9999;
        background: var(--surface, #fff); color: var(--text-color, #1e293b);
        border: 1px solid var(--border-color, #ccc); border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15); min-width: 260px; max-width: 400px;
        padding: 4px 0; font-size: 12px;
    `;

    // Current workspace header
    const currentDir = window.appSettings?.workingDirectory || '';
    const header = document.createElement('div');
    header.style.cssText = 'padding: 6px 12px; font-size: 11px; color: var(--text-muted, #888); border-bottom: 1px solid var(--border-color, #eee);';
    header.textContent = `Current: ${currentDir.split('/').pop() || currentDir}`;
    header.title = currentDir;
    dropdown.appendChild(header);

    // Fetch recent workspaces
    let recents = [];
    try {
        recents = await window.electronAPI.invoke('get-recent-workspaces');
    } catch (err) {
        console.warn('[Renderer] Could not fetch recent workspaces:', err);
    }

    // Filter out the current workspace
    const filtered = recents.filter(p => p !== currentDir);

    if (filtered.length > 0) {
        for (const ws of filtered) {
            const item = document.createElement('div');
            item.style.cssText = `
                padding: 6px 12px; cursor: pointer;
                white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            `;
            item.textContent = ws.split('/').pop() || ws;
            item.title = ws;
            item.addEventListener('mouseenter', () => { item.style.background = 'var(--surface-hover, #f0f0f0)'; });
            item.addEventListener('mouseleave', () => { item.style.background = ''; });
            item.addEventListener('click', async () => {
                dropdown.remove();
                try {
                    const result = await window.electronAPI.invoke('switch-workspace', ws);
                    if (result.success) {
                        if (window.appSettings) window.appSettings.workingDirectory = result.directory;
                        showNotification(`Switched to ${ws.split('/').pop()}`, 'success');
                        fileTreeRendered = false;
                        renderFileTree();
                    } else {
                        showNotification(result.error || 'Failed to switch', 'error');
                    }
                } catch (err) {
                    showNotification('Error switching workspace', 'error');
                }
            });
            dropdown.appendChild(item);
        }
    } else {
        const empty = document.createElement('div');
        empty.style.cssText = 'padding: 6px 12px; color: var(--text-muted, #999); font-style: italic;';
        empty.textContent = 'No recent workspaces';
        dropdown.appendChild(empty);
    }

    // Separator + Browse option
    const sep = document.createElement('div');
    sep.style.cssText = 'border-top: 1px solid var(--border-color, #eee); margin: 4px 0;';
    dropdown.appendChild(sep);

    const browse = document.createElement('div');
    browse.style.cssText = 'padding: 6px 12px; cursor: pointer; font-weight: 500;';
    browse.textContent = '📂 Browse…';
    browse.addEventListener('mouseenter', () => { browse.style.background = 'var(--surface-hover, #f0f0f0)'; });
    browse.addEventListener('mouseleave', () => { browse.style.background = ''; });
    browse.addEventListener('click', async () => {
        dropdown.remove();
        try {
            const result = await window.electronAPI.invoke('change-working-directory');
            if (result.success) {
                if (window.appSettings) window.appSettings.workingDirectory = result.directory;
                showNotification(`Working directory changed`, 'success');
                fileTreeRendered = false;
                renderFileTree();
            }
        } catch (err) {
            showNotification('Error changing working directory', 'error');
        }
    });
    dropdown.appendChild(browse);

    // Position relative to button
    const rect = changeDirectoryBtn.getBoundingClientRect();
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.top = `${rect.bottom + 4}px`;
    dropdown.style.position = 'fixed';
    document.body.appendChild(dropdown);

    // Close on outside click
    const closeDropdown = (ev) => {
        if (!dropdown.contains(ev.target) && ev.target !== changeDirectoryBtn) {
            dropdown.remove();
            document.removeEventListener('click', closeDropdown, true);
        }
    };
    setTimeout(() => document.addEventListener('click', closeDropdown, true), 0);
});

// --- Add Workspace Folder Button Listener ---
if (addWorkspaceFolderBtn) {
    addWorkspaceFolderBtn.addEventListener('click', async () => {
        try {
            const result = await window.electronAPI.invoke('add-workspace-folder');
            if (result.success) {
                // Update global settings cache with new folder
                if (window.appSettings) {
                    window.appSettings.workspaceFolders = result.workspaceFolders;
                }
                showNotification(`Folder added to workspace`, 'success');
                // Refresh file tree to show new folder
                fileTreeRendered = false;
                renderFileTree();
            } else if (result.cancelled) {
                // User cancelled, no notification needed
            } else if (result.error) {
                showNotification(result.error, 'error');
            }
        } catch (error) {
            console.error('[Renderer] Error adding workspace folder:', error);
            showNotification('Error adding folder to workspace', 'error');
        }
    });
}

// --- Find & Replace ---
// Find & Replace is initialized via the findReplace.js module
// which is loaded separately and calls initializeFindReplace() on DOMContentLoaded

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

// File name modal event listeners
fileNameCancel.addEventListener('click', hideFileNameModal);
fileNameCreate.addEventListener('click', handleCreateFile);

// Handle Enter key in file name input
fileNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        handleCreateFile();
    } else if (e.key === 'Escape') {
        e.preventDefault();
        hideFileNameModal();
    }
});

// Hide file modal when clicking on backdrop
fileNameModal.addEventListener('click', (e) => {
    if (e.target === fileNameModal) {
        hideFileNameModal();
    }
});

// Clear validation error when typing in file name
fileNameInput.addEventListener('input', () => {
    fileNameError.style.display = 'none';
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

// --- Source View Toggle ---
if (previewSourceBtn) {
    previewSourceBtn.addEventListener('click', () => {
        previewSourceMode = !previewSourceMode;
        previewSourceBtn.classList.toggle('active', previewSourceMode);
        if (previewSourceMode) {
            // Reset to mirror mode
            sourceViewFilePath = null;
            sourceViewSyncToEditor = true;
            if (previewSourceFilepath) previewSourceFilepath.textContent = 'Current Editor';
            if (previewSourceSyncToggle) {
                previewSourceSyncToggle.classList.add('active');
                previewSourceSyncToggle.style.display = '';
            }
            // Populate source from the editor
            const source = window.editor ? window.editor.getValue() : '';
            previewSourceEl.textContent = source;
            previewContent.style.display = 'none';
            previewSourceEl.style.display = '';
            if (previewSourceToolbar) previewSourceToolbar.style.display = '';
            // Delay setup so the <pre> has time to lay out its content and compute scrollHeight
            requestAnimationFrame(() => _setupSourceScrollSync());
        } else {
            previewContent.style.display = '';
            previewSourceEl.style.display = 'none';
            if (previewSourceToolbar) previewSourceToolbar.style.display = 'none';
            // Switch scroll sync back to preview content
            requestAnimationFrame(() => _activateScrollSyncForCurrentPane());
        }
    });
}

// --- Source View: Open File Button ---
if (previewSourceOpenBtn) {
    previewSourceOpenBtn.addEventListener('click', async () => {
        try {
            const result = await window.electronAPI.invoke('dialog-open-file', {
                title: 'Open File in Source View',
                filters: [
                    { name: 'Text Files', extensions: ['md', 'txt', 'js', 'html', 'css', 'json', 'yaml', 'yml', 'toml', 'py', 'rb', 'sh', 'ts', 'tsx', 'jsx'] },
                    { name: 'All Files', extensions: ['*'] }
                ]
            });
            if (!result.success || result.canceled) return;

            const fileResult = await window.electronAPI.invoke('read-file-content-only', result.filePath);
            if (!fileResult.success) {
                console.error('[SourceView] Failed to read file:', fileResult.error);
                return;
            }

            sourceViewFilePath = result.filePath;
            sourceViewSyncToEditor = false;
            previewSourceEl.textContent = fileResult.content;
            if (previewSourceFilepath) {
                previewSourceFilepath.textContent = fileResult.fileName;
                previewSourceFilepath.title = result.filePath;
            }
            if (previewSourceSyncToggle) {
                previewSourceSyncToggle.classList.remove('active');
                previewSourceSyncToggle.style.display = 'none';
            }
            _teardownSourceScrollSync();
        } catch (err) {
            console.error('[SourceView] Error opening file:', err);
        }
    });
}

// --- Source View: Sync Toggle ---
if (previewSourceSyncToggle) {
    previewSourceSyncToggle.addEventListener('click', () => {
        if (sourceViewFilePath) return; // sync toggle only works in mirror mode
        sourceViewSyncToEditor = !sourceViewSyncToEditor;
        previewSourceSyncToggle.classList.toggle('active', sourceViewSyncToEditor);
        if (sourceViewSyncToEditor) {
            _setupSourceScrollSync();
        } else {
            _teardownSourceScrollSync();
        }
    });
}

// --- Bidirectional Scroll Sync ---
// For source view <pre>: proportional ratio (same content, different fonts)
// For rendered preview: line-based mapping via data-source-line markers

let _scrollSyncEditorDispose = null;
let _scrollSyncTargetHandler = null;
let _scrollSyncTargetEl = null;
let _scrollSyncMode = null; // 'proportional' | 'linemap'

// ---- Line map utilities for preview scroll sync ----

// Build a source-line → token map from marked lexer output (with caching)
let _sourceLineMapCache = { hash: 0, entries: [] };

function _buildSourceLineMap(markdown) {
    // Check cache — skip re-lexing if content hasn't changed
    const hash = _quickHash(markdown);
    if (hash === _sourceLineMapCache.hash && _sourceLineMapCache.entries.length > 0) {
        return _sourceLineMapCache.entries;
    }

    const markedApi = window.marked || globalThis.marked;
    if (!markedApi?.lexer) return [];

    // Strip frontmatter before lexing (matches the render pipeline)
    let body = markdown;
    const fmMatch = markdown.match(/^(\uFEFF?\s*---\r?\n)([\s\S]*?\r?\n)(---\r?\n)/);
    const fmLineCount = fmMatch ? fmMatch[0].split('\n').length - 1 : 0;
    if (fmMatch) body = markdown.slice(fmMatch[0].length);

    const tokens = markedApi.lexer(body);
    const entries = []; // { line, type }
    let lineOffset = fmLineCount;

    for (const token of tokens) {
        if (token.type === 'space') {
            lineOffset += (token.raw.match(/\n/g) || []).length;
            continue;
        }
        entries.push({ line: lineOffset + 1, type: token.type }); // 1-based
        lineOffset += (token.raw.match(/\n/g) || []).length;
    }

    _sourceLineMapCache = { hash, entries };
    return entries;
}

// After preview render, stamp data-source-line on top-level block elements
function _injectSourceLineAttributes(containerEl, markdown) {
    if (!containerEl || !markdown) return;
    const lineMap = _buildSourceLineMap(markdown);
    if (!lineMap.length) return;

    // Collect renderable block elements (skip frontmatter header, hidden elements)
    const blockEls = [];
    for (const child of containerEl.children) {
        const tag = child.tagName;
        if (!tag) continue;
        // Skip frontmatter header elements
        if (child.classList.contains('frontmatter-title') || child.classList.contains('frontmatter-meta')) continue;
        if (tag === 'HR' && blockEls.length === 0) continue; // frontmatter <hr>
        // Skip hidden elements
        if (child.style.display === 'none') continue;
        blockEls.push(child);
    }

    // Zip line map entries with block elements (they're in the same order)
    const len = Math.min(lineMap.length, blockEls.length);
    for (let i = 0; i < len; i++) {
        blockEls[i].setAttribute('data-source-line', lineMap[i].line);
    }
}

// Find the preview element closest to (at or before) a given source line
function _findPreviewElementForLine(containerEl, line) {
    const marked = containerEl.querySelectorAll('[data-source-line]');
    if (!marked.length) return null;

    let best = null;
    for (const el of marked) {
        const elLine = parseInt(el.getAttribute('data-source-line'), 10);
        if (elLine <= line) best = el;
        else break; // sorted, so we can stop
    }
    return best || marked[0];
}

// Find which source line is at the top of the preview viewport
function _findSourceLineForPreviewScroll(containerEl) {
    const marked = containerEl.querySelectorAll('[data-source-line]');
    if (!marked.length) return 1;

    const containerTop = containerEl.scrollTop;
    let best = null;
    let bestLine = 1;
    for (const el of marked) {
        const elTop = el.offsetTop - containerEl.offsetTop;
        if (elTop <= containerTop + 5) { // 5px tolerance
            best = el;
            bestLine = parseInt(el.getAttribute('data-source-line'), 10);
        } else {
            // Interpolate between previous and this element
            if (best) {
                const prevTop = best.offsetTop - containerEl.offsetTop;
                const prevLine = parseInt(best.getAttribute('data-source-line'), 10);
                const nextLine = parseInt(el.getAttribute('data-source-line'), 10);
                const fraction = (elTop - prevTop) > 0
                    ? (containerTop - prevTop) / (elTop - prevTop)
                    : 0;
                bestLine = prevLine + fraction * (nextLine - prevLine);
            }
            break;
        }
    }
    return bestLine;
}

// ---- Setup/teardown ----

function _setupScrollSync(targetEl, mode) {
    _teardownScrollSync();
    if (!window.editor || !targetEl) return;

    _scrollSyncTargetEl = targetEl;
    _scrollSyncMode = mode;

    if (mode === 'proportional') {
        // Editor → Target (proportional ratio)
        _scrollSyncEditorDispose = window.editor.onDidScrollChange(() => {
            if (_syncingFromSource) return;
            const info = window.editor.getLayoutInfo();
            const scrollHeight = window.editor.getScrollHeight() - info.height;
            if (scrollHeight <= 0) return;
            const ratio = window.editor.getScrollTop() / scrollHeight;
            _syncingFromEditor = true;
            targetEl.scrollTop = ratio * (targetEl.scrollHeight - targetEl.clientHeight);
            requestAnimationFrame(() => { _syncingFromEditor = false; });
        });

        // Target → Editor (proportional, debounced)
        let scrollTimer = null;
        _scrollSyncTargetHandler = () => {
            if (_syncingFromEditor) return;
            clearTimeout(scrollTimer);
            scrollTimer = setTimeout(() => {
                const targetMax = targetEl.scrollHeight - targetEl.clientHeight;
                if (targetMax <= 0) return;
                const ratio = targetEl.scrollTop / targetMax;
                const info = window.editor.getLayoutInfo();
                _syncingFromSource = true;
                window.editor.setScrollTop(ratio * (window.editor.getScrollHeight() - info.height));
                requestAnimationFrame(() => { _syncingFromSource = false; });
            }, 16);
        };
        targetEl.addEventListener('scroll', _scrollSyncTargetHandler);

    } else if (mode === 'linemap') {
        // Editor → Preview (line-based)
        _scrollSyncEditorDispose = window.editor.onDidScrollChange(() => {
            if (_syncingFromSource) return;
            const topLine = window.editor.getVisibleRanges()?.[0]?.startLineNumber;
            if (!topLine) return;
            const el = _findPreviewElementForLine(targetEl, topLine);
            if (!el) return;
            _syncingFromEditor = true;
            // Scroll so the element is at the top of the preview viewport
            const elTop = el.offsetTop - targetEl.offsetTop;
            targetEl.scrollTop = elTop;
            requestAnimationFrame(() => { _syncingFromEditor = false; });
        });

        // Preview → Editor (line-based, debounced)
        let scrollTimer = null;
        _scrollSyncTargetHandler = () => {
            if (_syncingFromEditor) return;
            clearTimeout(scrollTimer);
            scrollTimer = setTimeout(() => {
                const line = _findSourceLineForPreviewScroll(targetEl);
                if (!line) return;
                _syncingFromSource = true;
                window.editor.revealLineNearTop(Math.round(line));
                requestAnimationFrame(() => { _syncingFromSource = false; });
            }, 50);
        };
        targetEl.addEventListener('scroll', _scrollSyncTargetHandler);
    }
}

function _teardownScrollSync() {
    if (_scrollSyncEditorDispose) {
        _scrollSyncEditorDispose.dispose();
        _scrollSyncEditorDispose = null;
    }
    if (_scrollSyncTargetHandler && _scrollSyncTargetEl) {
        _scrollSyncTargetEl.removeEventListener('scroll', _scrollSyncTargetHandler);
        _scrollSyncTargetHandler = null;
    }
    _scrollSyncTargetEl = null;
    _scrollSyncMode = null;
}

// Activate scroll sync for whichever pane is currently visible
function _activateScrollSyncForCurrentPane() {
    if (!previewScrollSyncEnabled) { _teardownScrollSync(); return; }
    if (previewSourceMode && !sourceViewFilePath && sourceViewSyncToEditor) {
        // Source view mirror mode — proportional (same text content)
        _setupScrollSync(previewSourceEl, 'proportional');
    } else if (!previewSourceMode && previewContent && previewContent.style.display !== 'none') {
        // Normal preview mode — line-based mapping
        _setupScrollSync(previewContent, 'linemap');
    } else {
        _teardownScrollSync();
    }
}

// Legacy wrappers used by source view toggle
function _setupSourceScrollSync() { _activateScrollSyncForCurrentPane(); }
function _teardownSourceScrollSync() { _teardownScrollSync(); }

// --- Preview Scroll Sync Toggle Button ---
if (previewScrollSyncBtn) {
    // Start active
    previewScrollSyncBtn.classList.add('active');
    previewScrollSyncBtn.addEventListener('click', () => {
        previewScrollSyncEnabled = !previewScrollSyncEnabled;
        previewScrollSyncBtn.classList.toggle('active', previewScrollSyncEnabled);
        previewScrollSyncBtn.title = previewScrollSyncEnabled
            ? 'Scroll sync enabled — click to disable'
            : 'Scroll sync disabled — click to enable';
        _activateScrollSyncForCurrentPane();
    });
}

// --- Right Pane Switching Function ---
// Helper functions for right pane management
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

function showRightPane(paneType) {
    hideAllRightPanes();
    deactivateAllToggleButtons();
    _teardownScrollSync(); // tear down before switching
    showSpecificPane(paneType);
    // Activate scroll sync when preview pane is shown (and not in source-with-independent-file mode)
    if (paneType === 'preview') {
        requestAnimationFrame(() => _activateScrollSyncForCurrentPane());
    }
}

// Expose showPane globally for plugins (AI Tutor, etc.)
window.showPane = function(paneType) {
    // First make sure the right pane is visible
    const rightPane = document.getElementById('right-pane');
    if (rightPane && (rightPane.classList.contains('pane-hidden') || !previewVisible)) {
        togglePreview(); // This will show the right pane
    }
    // Then switch to the requested pane
    showRightPane(paneType);
};

// --- Structure Pane / File Tree Functions ---

/**
 * Switches the view in the structure pane between 'structure', 'file', and 'search'.
 * @param {'structure' | 'file' | 'search'} view - The view to switch to.
 */
function switchStructureView(view) {
    window.currentStructureView = view;
    
    // Get elements
    const fileTreeView = document.getElementById('file-tree-view');
    const searchPane = document.getElementById('search-pane');
    
    // Reset all button states and hide all views
    showStructureBtn.classList.remove('active');
    showFilesBtn.classList.remove('active');
    if (searchBtn) searchBtn.classList.remove('active');
    if (showStatsBtn) showStatsBtn.classList.remove('active');
    const showCitationsBtn = document.getElementById('show-citations-btn');
    if (showCitationsBtn) showCitationsBtn.classList.remove('active');
    const showFootnotesBtn = document.getElementById('show-footnotes-btn');
    if (showFootnotesBtn) showFootnotesBtn.classList.remove('active');
    const showGitBtn = document.getElementById('show-git-btn');
    if (showGitBtn) showGitBtn.classList.remove('active');
    const showSlidesBtnEl = document.getElementById('show-slides-btn');
    if (showSlidesBtnEl) showSlidesBtnEl.classList.remove('active');

    structureList.style.display = 'none';
    if (fileTreeView) fileTreeView.style.display = 'none';
    if (searchPane) searchPane.style.display = 'none';
    const statisticsPane = document.getElementById('statistics-pane');
    if (statisticsPane) statisticsPane.style.display = 'none';
    const citationsPane = document.getElementById('citations-pane');
    if (citationsPane) citationsPane.style.display = 'none';
    const footnotesPane = document.getElementById('footnotes-pane');
    if (footnotesPane) footnotesPane.style.display = 'none';
    const gitPane = document.getElementById('git-pane');
    if (gitPane) gitPane.style.display = 'none';
    const slidesPane = document.getElementById('slides-pane');
    if (slidesPane) slidesPane.style.display = 'none';
    if (tagSearchSection) tagSearchSection.style.display = 'none';
    newFolderBtn.style.display = 'none';
    changeDirectoryBtn.style.display = 'none';
    if (addWorkspaceFolderBtn) addWorkspaceFolderBtn.style.display = 'none';

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
        if (addWorkspaceFolderBtn) addWorkspaceFolderBtn.style.display = ''; // Show Add Folder button

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
    } else if (view === 'statistics') {
        structurePaneTitle.textContent = 'Statistics';
        if (showStatsBtn) showStatsBtn.classList.add('active');
        if (statisticsPane) {
            statisticsPane.style.display = 'block';
            // Update statistics content when showing the pane
            updateStatisticsPane();
        }
    } else if (view === 'citations') {
        structurePaneTitle.textContent = 'Citations';
        if (showCitationsBtn) showCitationsBtn.classList.add('active');
        if (citationsPane) {
            citationsPane.style.display = 'flex';
            // Call citations manager to handle citations-specific setup
            if (window.citationManager) {
                window.citationManager.showCitationsPanel();
            }
        }
    } else if (view === 'footnotes') {
        structurePaneTitle.textContent = 'Footnotes';
        if (showFootnotesBtn) showFootnotesBtn.classList.add('active');
        if (footnotesPane) {
            footnotesPane.style.display = 'flex';
            updateFootnotesPanel();
        }
    } else if (view === 'git') {
        structurePaneTitle.textContent = 'Source Control';
        if (showGitBtn) showGitBtn.classList.add('active');
        if (gitPane) {
            gitPane.style.display = 'flex';
            if (window.gitPanel) {
                window.gitPanel.refresh();
            }
        }
    } else if (view === 'slides') {
        structurePaneTitle.textContent = 'Slides';
        if (showSlidesBtnEl) showSlidesBtnEl.classList.add('active');
        if (slidesPane) {
            slidesPane.style.display = 'flex';
            renderVerticalSlideThumbnails();
        }
    }
}

// Expose switchStructureView to window object for external access
window.switchStructureView = switchStructureView;

// Statistics functions moved to modules/statistics.js

// --- File Tree Functions ---
// Global state for tracking expanded folders
window.expandedFolders = window.expandedFolders || new Set();

function escapeFileTreeText(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getFileTreeIconClass(node, isFolder) {
    if (isFolder) {
        return 'file-icon-folder';
    }

    const name = (node.name || '').toLowerCase();
    if (name.endsWith('.md') || name.endsWith('.markdown')) {
        return 'file-icon-file file-icon-markdown';
    }
    if (name.endsWith('.bib')) {
        return 'file-icon-file file-icon-bib';
    }
    return 'file-icon-file';
}

async function renderFileTree() {
    
    // Prevent concurrent renders
    if (isRenderingFileTree) {
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
        window.fileTreeData = fileTree;
        
        if (!fileTreeView) {
            console.warn('[renderFileTree] fileTreeView element not found');
            isRenderingFileTree = false;
            return;
        }
        
        // Clear existing content - double check it's still the file tree view
        if (fileTreeView.id === 'file-tree-view') {
            fileTreeView.innerHTML = '';
        }

        // Reset visible files list for multi-select range selection
        allVisibleFiles = [];

        // Mark tree as rendered
        fileTreeRendered = true;
        
        // Render the file tree
        if (fileTree && fileTree.children) {
            // Check if this is a multi-folder workspace
            if (fileTree.isMultiFolder) {
                // Render each folder as a separate root
                for (const folderTree of fileTree.children) {
                    // Auto-expand the folder on first load
                    if (window.expandedFolders.size === 0) {
                        expandCommonFolders(folderTree);
                    }
                    // Pre-process tags for visible markdown files
                    await preProcessMarkdownTags(folderTree);
                    // Render as a workspace folder root (depth 0)
                    // Pass both isWorkspaceFolder and isPrimary flags
                    renderFileTreeNode(folderTree, fileTreeView, 0, folderTree.isWorkspaceFolder, folderTree.isPrimary);
                }
            } else {
                // Single folder mode (backward compatible)
                // Auto-expand the root directory and common folders on first load
                if (window.expandedFolders.size === 0) {
                    expandCommonFolders(fileTree);
                }

                // Pre-process tags for visible markdown files
                await preProcessMarkdownTags(fileTree);

                renderFileTreeNode(fileTree, fileTreeView, 0);
            }
        } else {
            fileTreeView.innerHTML = '<div class="no-files">No files found</div>';
        }
        
        
        // Update available files for autocomplete
        updateAvailableFiles(fileTree);

        // Apply git status decorations to file tree
        if (window.gitPanel && window.gitPanel.applyFileTreeGitStatus) {
            window.gitPanel.applyFileTreeGitStatus();
        }
    } catch (error) {
        console.error('[renderFileTree] Error loading file tree:', error);
        if (fileTreeView) {
            fileTreeView.innerHTML = '<div class="error">Error loading files</div>';
        }
    } finally {
        // Always clear the rendering flag
        isRenderingFileTree = false;
    }
}

function renderFileTreeNode(node, container, depth, isWorkspaceFolder = false, isPrimary = false) {
    const nodeElement = document.createElement('div');
    nodeElement.className = 'file-tree-item';
    nodeElement.style.setProperty('--tree-depth', depth);

    // Track if this is a workspace folder root for context menu
    const isWorkspaceFolderRoot = isWorkspaceFolder && depth === 0;
    const isPrimaryRoot = isPrimary && depth === 0;

    const isFolder = node.type === 'folder' || node.type === 'directory';
    const hasChildren = isFolder && node.children && node.children.length > 0;
    const isExpanded = window.expandedFolders.has(node.path);

    
    // Create expand/collapse arrow for folders with children
    let expandArrow = '';
    if (hasChildren) {
        expandArrow = `<span class="expand-arrow" aria-hidden="true">${isExpanded ? '▾' : '▸'}</span>`;
    } else if (isFolder) {
        expandArrow = '<span class="expand-spacer" aria-hidden="true"></span>';
    }

    const iconClass = getFileTreeIconClass(node, isFolder);
    const fileName = escapeFileTreeText(node.name);
    
    // Get tags for markdown files
    let tagsDisplay = '';
    if (!isFolder && isMarkdownFilePath(node.name) && window.tagManager) {
        const fileTags = window.tagManager.getFileTags(node.path);
        if (fileTags && fileTags.length > 0) {
            const tagElements = fileTags.slice(0, 2).map(tag =>
                `<span class="file-tag">${escapeFileTreeText(tag)}</span>`
            ).join('');
            const moreCount = fileTags.length > 2
                ? `<span class="file-tags-more">+${fileTags.length - 2}</span>`
                : '';
            tagsDisplay = `<div class="file-tags">${tagElements}${moreCount}</div>`;
        }
    }
    
    nodeElement.innerHTML = `
        <div class="file-tree-main">
            ${expandArrow}
            <span class="file-icon ${iconClass}" aria-hidden="true"></span>
            <span class="file-name">${fileName}</span>
            ${tagsDisplay}
        </div>
    `;

    // data-path is set below and used by CSS tooltip on hover
    
    // Add appropriate classes and properties
    if (isFolder) {
        nodeElement.classList.add('folder', isExpanded ? 'folder-expanded' : 'folder-collapsed');
        nodeElement.dataset.path = node.path;
        nodeElement.draggable = true;

        // Re-apply active-folder highlight after a tree re-render — the DOM is
        // recreated each time so window.selectedFolderPath needs to be reflected
        // back onto the new node element.
        if (window.selectedFolderPath === node.path) {
            nodeElement.classList.add('folder-active');
        }

        // Add special styling for primary and workspace folder roots
        if (isPrimaryRoot) {
            nodeElement.classList.add('primary-folder-root');
        } else if (isWorkspaceFolderRoot) {
            nodeElement.classList.add('workspace-folder-root');
        }

        // Add click handler for folders to toggle expand/collapse in place
        nodeElement.addEventListener('click', async (event) => {
            event.preventDefault();
            // Mark this folder as active for the next save / new-file dialog.
            setActiveTreeFolder(node.path);
            if (hasChildren || isFolder) {
                const wasExpanded = window.expandedFolders.has(node.path);
                toggleFolderExpansion(node.path);
                const isNowExpanded = window.expandedFolders.has(node.path);

                // Find or create children container
                let childrenContainer = nodeElement.nextElementSibling;
                if (!childrenContainer || !childrenContainer.classList.contains('folder-children')) {
                    childrenContainer = document.createElement('div');
                    childrenContainer.className = 'folder-children';
                    childrenContainer.dataset.folderPath = node.path;
                    childrenContainer.style.setProperty('--tree-depth', depth + 1);
                    nodeElement.parentNode.insertBefore(childrenContainer, nodeElement.nextSibling);
                }

                // Update the arrow icon
                const arrow = nodeElement.querySelector('.expand-arrow');
                if (arrow) {
                    arrow.textContent = isNowExpanded ? '▾' : '▸';
                }

                nodeElement.classList.toggle('folder-expanded', isNowExpanded);
                nodeElement.classList.toggle('folder-collapsed', !isNowExpanded);

                if (isNowExpanded) {
                    // Refresh folder contents when expanding
                    try {
                        const result = await window.electronAPI.invoke('get-folder-contents', node.path);
                        if (result.success && result.children) {
                            // Clear and re-render children
                            childrenContainer.innerHTML = '';
                            for (const child of result.children) {
                                renderFileTreeNode(child, childrenContainer, depth + 1);
                            }
                        }
                    } catch (error) {
                        console.error('[FileTree] Error refreshing folder contents:', error);
                    }
                    childrenContainer.style.display = 'block';
                } else {
                    childrenContainer.style.display = 'none';
                }
            }
        });

        // Add context menu for folders
        nodeElement.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            // Right-clicking a folder also marks it active so that the
            // "New File" item creates the file in the folder the user
            // just right-clicked, and so the next save defaults there.
            setActiveTreeFolder(node.path);
            showFileContextMenu(event, node.path, true, isWorkspaceFolderRoot);
        });
    } else {
        nodeElement.classList.add('file', 'file-clickable');
        nodeElement.dataset.path = node.path;
        nodeElement.draggable = true;

        // data-path is set above and used by CSS tooltip on hover

        // Track this file in the visible files list for range selection
        allVisibleFiles.push(node.path);

        // Apply selected styling if this file is in the selection
        if (selectedFiles.has(node.path)) {
            nodeElement.classList.add('file-selected');
        }

        nodeElement.addEventListener('click', async (event) => {
            // Ignore double-clicks (browser fires 2 click events on dblclick)
            if (event.detail > 1) return;

            try {
                const filePath = node.path;

                // Handle multi-select with modifier keys
                if (event.shiftKey && lastSelectedFile) {
                    // Shift+click: Select range from last selected to current
                    event.preventDefault();
                    const startIndex = allVisibleFiles.indexOf(lastSelectedFile);
                    const endIndex = allVisibleFiles.indexOf(filePath);

                    if (startIndex !== -1 && endIndex !== -1) {
                        const start = Math.min(startIndex, endIndex);
                        const end = Math.max(startIndex, endIndex);

                        // Add all files in range to selection
                        for (let i = start; i <= end; i++) {
                            selectedFiles.add(allVisibleFiles[i]);
                        }
                        updateFileSelectionUI();
                    }
                    return; // Don't open the file on Shift+click
                } else if (event.altKey || event.metaKey) {
                    // Alt/Option+click (or Cmd+click on Mac): Toggle individual file selection
                    event.preventDefault();
                    if (selectedFiles.has(filePath)) {
                        selectedFiles.delete(filePath);
                    } else {
                        selectedFiles.add(filePath);
                    }
                    lastSelectedFile = filePath;
                    updateFileSelectionUI();
                    return; // Don't open the file on Alt/Cmd+click
                }

                // Regular click - clear selection and open file
                selectedFiles.clear();
                selectedFiles.add(filePath);
                lastSelectedFile = filePath;
                updateFileSelectionUI();

                // Track the file's parent folder as the active folder so that
                // a subsequent New File / Save-As defaults to the same folder
                // the user is reading in.
                const parentFolder = filePath.substring(0, filePath.lastIndexOf('/'));
                if (parentFolder) setActiveTreeFolder(parentFolder);


                // Check if it's an image file
                const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', '.webp', '.ico'];
                const fileExtension = filePath.toLowerCase().substring(filePath.lastIndexOf('.'));

                if (imageExtensions.includes(fileExtension)) {
                    showImageViewer(filePath);
                } else {
                    // Trigger autosave before switching files

                    if (window.performAutoSave && window.currentFilePath && window.hasUnsavedChanges) {
                        try {
                            await window.performAutoSave();
                        } catch (error) {
                            console.warn('[renderFileTree] ❌ Autosave failed during file switch:', error);
                            // Continue with file opening even if autosave fails
                        }
                    } else {
                    }

                    // Regular file opening logic
                    const result = await window.electronAPI.invoke('open-file-path', filePath);
                    if (result.success && window.openFileInEditor) {
                        await window.openFileInEditor(result.filePath, result.content);
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
            const filePath = node.path;

            // If right-clicking on a file that's not in the selection, select it
            if (!selectedFiles.has(filePath)) {
                selectedFiles.clear();
                selectedFiles.add(filePath);
                lastSelectedFile = filePath;
                updateFileSelectionUI();
            }

            showFileContextMenu(event, filePath, false);
        });
    }
    
    container.appendChild(nodeElement);

    // Create children container for folders - only render children if already expanded
    // (collapsed folders will fetch fresh contents when expanded)
    if (hasChildren && isExpanded) {
        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'folder-children';
        childrenContainer.dataset.folderPath = node.path;
        childrenContainer.style.setProperty('--tree-depth', depth + 1);
        childrenContainer.style.display = 'block';

        // Render children into the container
        for (const child of node.children) {
            renderFileTreeNode(child, childrenContainer, depth + 1);
        }

        container.appendChild(childrenContainer);
    }
}

// Function to toggle folder expansion state
function toggleFolderExpansion(folderPath) {
    if (window.expandedFolders.has(folderPath)) {
        window.expandedFolders.delete(folderPath);
    } else {
        window.expandedFolders.add(folderPath);
    }
}

// Update visual selection state for all file elements
function updateFileSelectionUI() {
    const fileTreeView = document.getElementById('file-tree-view');
    if (!fileTreeView) return;

    // Get all file elements
    const fileElements = fileTreeView.querySelectorAll('.file-tree-item.file');

    fileElements.forEach(element => {
        const filePath = element.dataset.path;
        if (selectedFiles.has(filePath)) {
            element.classList.add('file-selected');
        } else {
            element.classList.remove('file-selected');
        }
    });

    // Update status bar with selection count
    updateSelectionStatus();
}

// Update status bar to show selection count
function updateSelectionStatus() {
    const count = selectedFiles.size;
    if (count > 1) {
        // Show selection count in a subtle way
        const statusElement = document.getElementById('file-status');
        if (statusElement) {
            statusElement.textContent = `${count} files selected`;
        }
    }
}

// Clear file selection
function clearFileSelection() {
    selectedFiles.clear();
    lastSelectedFile = null;
    updateFileSelectionUI();
}

// Get array of selected file paths
function getSelectedFiles() {
    return Array.from(selectedFiles);
}

// Expose selection functions globally
window.selectedFiles = selectedFiles;
window.getSelectedFiles = getSelectedFiles;
window.clearFileSelection = clearFileSelection;

// Tag filtering and file tree functions use variables declared at top of file

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
            <button id="tag-edit-cancel" class="btn btn-sm btn-ghost" style="margin-right: 8px;">Cancel</button>
            <button id="tag-edit-save" class="btn btn-sm btn-primary">Save</button>
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

// Show citation insertion dialog
async function showCitationDialog() {
    if (!bibEntries || bibEntries.length === 0) {
        showNotification('No citations available. Please ensure BibTeX files are loaded.', 'warning');
        return;
    }

    // Create backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'dialog-backdrop';
    backdrop.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.5);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
    `;

    // Create dialog
    const dialog = document.createElement('div');
    dialog.className = 'citation-dialog';
    dialog.style.cssText = `
        background: white;
        border-radius: 8px;
        padding: 24px;
        width: 600px;
        max-width: 90vw;
        max-height: 70vh;
        overflow: hidden;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
        display: flex;
        flex-direction: column;
    `;

    dialog.innerHTML = `
        <div style="margin-bottom: 20px;">
            <h3 style="margin: 0 0 10px 0; font-size: 18px; color: #333;">Insert Citation</h3>
            <input type="text" id="citation-search" placeholder="Search citations by title, author, or key..."
                   style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;">
        </div>
        <div style="flex: 1; overflow-y: auto; border: 1px solid #eee; border-radius: 4px; max-height: 300px;">
            <div id="citation-list" style="padding: 8px;"></div>
        </div>
        <div style="margin-top: 16px; display: flex; justify-content: flex-end; gap: 12px;">
            <button id="citation-cancel" class="btn btn-sm btn-ghost">Cancel</button>
            <button id="citation-insert" class="btn btn-sm btn-primary" disabled>Insert Citation</button>
        </div>
    `;

    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);

    const searchInput = document.getElementById('citation-search');
    const citationList = document.getElementById('citation-list');
    const insertBtn = document.getElementById('citation-insert');
    let selectedCitation = null;

    // Function to render citation list
    function renderCitations(entries) {
        citationList.innerHTML = '';

        if (entries.length === 0) {
            citationList.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">No citations found</div>';
            return;
        }

        entries.forEach(entry => {
            const citationItem = document.createElement('div');
            citationItem.className = 'citation-item';
            citationItem.style.cssText = `
                padding: 12px;
                border: 1px solid #eee;
                border-radius: 4px;
                margin-bottom: 8px;
                cursor: pointer;
                transition: background-color 0.2s;
            `;

            citationItem.innerHTML = `
                <div style="font-weight: bold; color: #333; margin-bottom: 4px;">${entry.title || 'Untitled'}</div>
                <div style="color: #666; font-size: 13px; margin-bottom: 4px;">${entry.author || 'Unknown Author'}</div>
                <div style="color: #888; font-size: 12px;">Key: ${entry.key} ${entry.year ? `• Year: ${entry.year}` : ''}</div>
            `;

            citationItem.addEventListener('click', () => {
                // Remove previous selection
                document.querySelectorAll('.citation-item').forEach(item => {
                    item.style.backgroundColor = '';
                    item.style.borderColor = '#eee';
                });

                // Select this item
                citationItem.style.backgroundColor = '#f0f9ff';
                citationItem.style.borderColor = '#0ea5e9';
                selectedCitation = entry;
                insertBtn.disabled = false;
            });

            citationItem.addEventListener('mouseover', () => {
                if (selectedCitation !== entry) {
                    citationItem.style.backgroundColor = '#f8f9fa';
                }
            });

            citationItem.addEventListener('mouseout', () => {
                if (selectedCitation !== entry) {
                    citationItem.style.backgroundColor = '';
                }
            });

            citationList.appendChild(citationItem);
        });
    }

    // Initial render
    renderCitations(bibEntries);

    // Search functionality
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const filtered = bibEntries.filter(entry =>
            (entry.title && entry.title.toLowerCase().includes(searchTerm)) ||
            (entry.author && entry.author.toLowerCase().includes(searchTerm)) ||
            (entry.key && entry.key.toLowerCase().includes(searchTerm))
        );
        selectedCitation = null;
        insertBtn.disabled = true;
        renderCitations(filtered);
    });

    // Handle insert
    insertBtn.addEventListener('click', async () => {
        if (selectedCitation && editor) {
            const citationText = `[@${selectedCitation.key}]`;
            const position = editor.getPosition();
            const range = new monaco.Range(
                position.lineNumber,
                position.column,
                position.lineNumber,
                position.column
            );

            editor.executeEdits('insert-citation', [{
                range: range,
                text: citationText
            }]);

            // Move cursor to end of inserted text
            const newPosition = {
                lineNumber: position.lineNumber,
                column: position.column + citationText.length
            };
            editor.setPosition(newPosition);

            showNotification(`Inserted citation: ${selectedCitation.key}`, 'success');

            // Close dialog
            backdrop.remove();
        }
    });

    // Handle cancel
    document.getElementById('citation-cancel').addEventListener('click', () => {
        backdrop.remove();
    });

    // Handle escape key
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            backdrop.remove();
            document.removeEventListener('keydown', handleEscape);
        }
    };
    document.addEventListener('keydown', handleEscape);

    // Focus search input
    searchInput.focus();
}

// Collect all markdown file paths from a tree node
function collectMarkdownPaths(node, paths = []) {
    if (node.type === 'file' && node.name.endsWith('.md')) {
        paths.push(node.path);
    }
    if (node.children) {
        for (const child of node.children) {
            collectMarkdownPaths(child, paths);
        }
    }
    return paths;
}

// Function to pre-process tags for markdown files in the tree (optimized batch version)
async function preProcessMarkdownTags(node) {
    if (!window.tagManager || !window.electronAPI) return;

    // Collect all markdown file paths
    const markdownPaths = collectMarkdownPaths(node);

    if (markdownPaths.length === 0) return;

    const startTime = performance.now();

    try {
        // Use batch frontmatter reading - much faster than reading full files
        const results = await window.electronAPI.invoke('batch-read-frontmatter', markdownPaths);

        for (const result of results) {
            if (result.success && result.hasFrontmatter && result.content) {
                // Process the frontmatter content
                window.tagManager.processFile(result.filePath, result.content);
            }
        }

        const elapsed = performance.now() - startTime;
    } catch (error) {
        console.warn('[preProcessMarkdownTags] Error batch processing files:', error);
        // Fall back to no tags rather than slow individual processing
    }
}

// Function to automatically expand common/important folders on first load
function expandCommonFolders(rootNode) {
    // Always expand the root directory if it has children
    if (rootNode.children && rootNode.children.length > 0) {
        window.expandedFolders.add(rootNode.path);

        // Only auto-expand subfolders if the setting is enabled
        if (window.appSettings?.navigation?.autoExpandFolders !== false) {
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
                    }
                }
            }
        }
    }
}

async function showFileContextMenu(event, filePath, isFolder, isWorkspaceFolderRoot = false) {
    // Remove any existing context menu
    const existingMenu = document.querySelector('.file-context-menu');
    if (existingMenu) {
        existingMenu.remove();
    }

    // Check if folder is part of a git repository
    let gitInfo = null;
    if (isFolder && window.electronAPI) {
        try {
            gitInfo = await window.electronAPI.invoke('git-find-repo', filePath);
        } catch (error) {
        }
    }

    // Create context menu
    const menu = document.createElement('div');
    menu.className = 'file-context-menu';
    menu.style.cssText = `
        position: fixed;
        left: ${event.pageX}px;
        top: ${event.pageY}px;
        background: var(--surface, white);
        color: var(--text-color, #333);
        border: 1px solid var(--border-color, #ddd);
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
            { label: 'New File', action: 'new-file' },
            { label: 'New Folder', action: 'new-subfolder' },
            { separator: true },
            { label: 'Open in Finder', action: 'open-in-finder' },
            { label: 'Rename Folder', action: 'rename' },
            { label: 'Delete Folder', action: 'delete' },
            { separator: true },
            { label: '🎨 Generate Folder Thumbnail', action: 'generate-thumbnails-batch' }
        );
        // Add Paste option if there's a file in the clipboard
        if (fileClipboard.filePath && fileClipboard.operation) {
            const clipboardFileName = fileClipboard.filePath.split('/').pop();
            const pasteLabel = fileClipboard.operation === 'cut'
                ? `Paste (Move "${clipboardFileName}")`
                : `Paste (Copy "${clipboardFileName}")`;
            menuItems.push(
                { separator: true },
                { label: pasteLabel, action: 'paste-file' }
            );
        }
        // Add "Set as Primary Folder" for any folder
        menuItems.push(
            { separator: true },
            { label: '🏠 Set as Primary Folder', action: 'set-as-primary' }
        );
        // Add "Remove from Workspace" option for workspace folder roots (not the primary folder)
        if (isWorkspaceFolderRoot) {
            menuItems.push(
                { label: 'Remove from Workspace', action: 'remove-from-workspace' }
            );
        }
        // Add git publish option if folder is in a git repo
        if (gitInfo && gitInfo.success) {
            menuItems.push(
                { separator: true },
                { label: 'Publish to Git...', action: 'publish-git', gitInfo }
            );
        }
    } else {
        // Check if multiple files are selected
        const multipleSelected = selectedFiles.size > 1 && selectedFiles.has(filePath);

        if (multipleSelected) {
            // Multi-file selection menu
            const fileCount = selectedFiles.size;
            menuItems.push(
                { label: `${fileCount} files selected`, action: 'none', disabled: true },
                { separator: true },
                { label: `Delete ${fileCount} Files`, action: 'delete-multiple' },
                { label: 'Copy Paths', action: 'copy-paths-multiple' },
                { separator: true },
                { label: 'Clear Selection', action: 'clear-selection' }
            );

            // Check if all selected are markdown files for thumbnail generation
            const allMarkdown = Array.from(selectedFiles).every(f => f.endsWith('.md'));
            if (allMarkdown) {
                menuItems.push(
                    { separator: true },
                    { label: '🎨 Generate Synthesized Thumbnail', action: 'generate-thumbnail-multiple' }
                );
            }
        } else {
            // Single file menu
            menuItems.push(
                { label: 'Open', action: 'open' },
                { label: 'Open in Split Editor', action: 'open-in-split' },
                { label: 'Rename File', action: 'rename' },
                { separator: true },
                { label: 'Cut', action: 'cut-file' },
                { label: 'Copy', action: 'copy-file-to-clipboard' },
                { separator: true },
                { label: 'Delete File', action: 'delete' },
                { label: 'Copy Path', action: 'copy-path' }
            );

            // Add tag editing option for markdown files
            if (isMarkdownFilePath(filePath)) {
                menuItems.push({ label: 'Set BibTeX Bibliography...', action: 'set-bibliography' });
                menuItems.push({ label: 'Edit Tags', action: 'edit-tags' });
                menuItems.push({ label: '🎨 Generate Thumbnail', action: 'generate-thumbnail' });
            }
        }

        // Add insert option for image files
        const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', '.webp', '.ico', '.tiff', '.tif'];
        const fileExtension = filePath.toLowerCase().substring(filePath.lastIndexOf('.'));
        if (imageExtensions.includes(fileExtension)) {
            menuItems.push({ label: 'Insert in Document', action: 'insert-image' });
        }
    }
    
    const isDarkMode = document.body.classList.contains('dark-mode');
    const hoverBg = isDarkMode ? '#3c3c3c' : '#f0f0f0';
    const normalBg = isDarkMode ? 'var(--surface, #252526)' : 'white';
    const separatorColor = isDarkMode ? '#4a4a4a' : '#e0e0e0';
    const borderColor = isDarkMode ? '#3c3c3c' : '#f0f0f0';

    menuItems.forEach((item, index) => {
        // Handle separator items
        if (item.separator) {
            const separator = document.createElement('div');
            separator.style.cssText = `
                height: 1px;
                background: ${separatorColor};
                margin: 4px 0;
            `;
            menu.appendChild(separator);
            return;
        }

        const menuItem = document.createElement('div');
        menuItem.style.cssText = `
            padding: 8px 12px;
            cursor: pointer;
            border-bottom: ${index < menuItems.length - 1 && !menuItems[index + 1]?.separator ? `1px solid ${borderColor}` : 'none'};
        `;
        menuItem.textContent = item.label;
        menuItem.addEventListener('click', () => {
            handleFileContextMenuAction(item.action, filePath, isFolder, item.gitInfo);
            menu.remove();
        });
        menuItem.addEventListener('mouseenter', () => {
            menuItem.style.background = hoverBg;
        });
        menuItem.addEventListener('mouseleave', () => {
            menuItem.style.background = normalBg;
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

async function handleFileContextMenuAction(action, filePath, isFolder, gitInfo = null) {
    
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
            
        case 'open-in-split':
            if (!isFolder && window.splitEditor) {
                window.splitEditor.openInSplit(filePath);
            }
            break;

        case 'rename':
            const newName = await showCustomPrompt(
                `Rename ${isFolder ? 'Folder' : 'File'}`, 
                `Enter new name for ${isFolder ? 'folder' : 'file'}:`,
                filePath.split('/').pop()
            );
            if (newName && newName !== filePath.split('/').pop()) {
                try {
                    const result = await window.electronAPI.invoke('rename-item', { 
                        filePath: filePath, 
                        newName: newName 
                    });
                    if (result.success) {
                        let message = `${isFolder ? 'Folder' : 'File'} renamed to "${newName}" successfully`;

                        // Add info about updated links if any
                        if (result.linksUpdated && result.linksUpdated > 0) {
                            message += ` (${result.linksUpdated} internal link${result.linksUpdated > 1 ? 's' : ''} updated)`;
                        }

                        showNotification(message, 'success');
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
                try {
                    const result = await window.electronAPI.invoke('delete-item', {
                        path: filePath,
                        type: isFolder ? 'directory' : 'file',
                        name: filePath.split('/').pop()
                    });
                    if (result.success) {
                        showNotification(result.message, 'success');
                        
                        // If we deleted the currently open file, clear the editor
                        if (!isFolder && window.currentFilePath === filePath) {
                            if (window.editor) {
                                window.editor.setValue('');
                            }
                            window.currentFilePath = null;
                            window.editorFileName = null; // Also clear editorFileName
                            updateBreadcrumb(null);
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

        case 'clear-selection':
            clearFileSelection();
            showNotification('Selection cleared', 'info');
            break;

        case 'copy-paths-multiple':
            if (selectedFiles.size > 0) {
                try {
                    const paths = Array.from(selectedFiles).join('\n');
                    await navigator.clipboard.writeText(paths);
                    showNotification(`${selectedFiles.size} paths copied to clipboard`, 'success');
                } catch (error) {
                    console.error('[handleFileContextMenuAction] Error copying paths:', error);
                    showNotification('Error copying paths', 'error');
                }
            }
            break;

        case 'delete-multiple':
            if (selectedFiles.size > 0) {
                const fileCount = selectedFiles.size;
                const fileList = Array.from(selectedFiles).slice(0, 5).map(f => f.split('/').pop()).join('\n');
                const moreText = fileCount > 5 ? `\n...and ${fileCount - 5} more` : '';
                const confirmDelete = confirm(`Are you sure you want to delete ${fileCount} files?\n\n${fileList}${moreText}\n\nThis action cannot be undone.`);

                if (confirmDelete) {
                    let deletedCount = 0;
                    let failedCount = 0;

                    for (const path of selectedFiles) {
                        try {
                            const result = await window.electronAPI.invoke('delete-item', {
                                path: path,
                                type: 'file',
                                name: path.split('/').pop()
                            });
                            if (result.success) {
                                deletedCount++;
                                // If we deleted the currently open file, clear the editor
                                if (window.currentFilePath === path) {
                                    if (window.editor) {
                                        window.editor.setValue('');
                                    }
                                    window.currentFilePath = null;
                                    window.editorFileName = null;
                                    updateBreadcrumb(null);
                                }
                            } else {
                                failedCount++;
                            }
                        } catch (error) {
                            console.error('[handleFileContextMenuAction] Error deleting file:', path, error);
                            failedCount++;
                        }
                    }

                    // Clear selection after delete
                    clearFileSelection();

                    if (failedCount === 0) {
                        showNotification(`Deleted ${deletedCount} files`, 'success');
                    } else {
                        showNotification(`Deleted ${deletedCount} files, ${failedCount} failed`, 'warning');
                    }

                    // Refresh file tree
                    if (window.renderFileTree) {
                        fileTreeRendered = false;
                        window.renderFileTree();
                    }
                }
            }
            break;

        case 'generate-thumbnail-multiple':
            if (selectedFiles.size > 0) {
                // Generate synthesized thumbnail from multiple selected markdown files
                await generateThumbnailForMultipleFiles(Array.from(selectedFiles));
            }
            break;

        case 'edit-tags':
            if (!isFolder && isMarkdownFilePath(filePath)) {
                await showTagEditDialog(filePath);
            }
            break;

        case 'set-bibliography':
            if (!isFolder && isMarkdownFilePath(filePath)) {
                await setBibliographyForMarkdownFile(filePath);
            }
            break;

        case 'generate-thumbnail':
            if (!isFolder && isMarkdownFilePath(filePath)) {
                await generateThumbnailForFile(filePath);
            }
            break;

        case 'insert-image':
            if (!isFolder) {
                try {

                    // Check if it's an image file
                    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', '.webp', '.ico', '.tiff', '.tif'];
                    const fileExtension = filePath.toLowerCase().substring(filePath.lastIndexOf('.'));

                    if (!imageExtensions.includes(fileExtension)) {
                        showNotification('Selected file is not a recognized image format', 'error');
                        return;
                    }

                    // Copy the image to project images directory and get markdown link
                    const result = await window.electronAPI.invoke('copy-local-image-file', filePath);

                    if (result.success) {

                        // Insert the markdown link at cursor position
                        if (window.editor) {
                            const position = window.editor.getPosition();
                            const range = new monaco.Range(
                                position.lineNumber,
                                position.column,
                                position.lineNumber,
                                position.column
                            );

                            window.editor.executeEdits('insert-image', [{
                                range: range,
                                text: result.markdownLink + '\n\n'
                            }]);

                            // Move cursor to end of inserted text
                            const newPosition = {
                                lineNumber: position.lineNumber + 2,
                                column: 1
                            };
                            window.editor.setPosition(newPosition);

                            // Update preview
                            if (window.updatePreview) {
                                const content = window.editor.getValue();
                                await window.updatePreview(content);
                            }

                            // Refresh file tree to show new image
                            if (window.electronAPI && window.electronAPI.invoke) {
                                try {
                                    await window.electronAPI.invoke('refresh-file-tree');
                                } catch (error) {
                                    console.warn('[handleFileContextMenuAction] Could not refresh file tree:', error);
                                }
                            }

                            showNotification('Image inserted into document', 'success');
                        } else {
                            showNotification('No editor available to insert image', 'error');
                        }
                    } else {
                        console.error('[handleFileContextMenuAction] Failed to copy image:', result.error);
                        showNotification(`Failed to copy image: ${result.error}`, 'error');
                    }
                } catch (error) {
                    console.error('[handleFileContextMenuAction] Error inserting image:', error);
                    showNotification('Error inserting image', 'error');
                }
            }
            break;
            
        case 'open-in-finder':
            if (isFolder) {
                try {
                    const result = await window.electronAPI.invoke('open-folder-in-finder', filePath);
                    if (!result.success) {
                        showNotification(`Failed to open folder: ${result.error}`, 'error');
                    }
                } catch (error) {
                    console.error('[handleFileContextMenuAction] Error opening folder:', error);
                    showNotification('Error opening folder in system file manager', 'error');
                }
            }
            break;

        case 'new-file':
            if (isFolder) {
                showFileNameModalWithParent(filePath);
            } else {
                showNotification('New file can only be created inside directories', 'error');
            }
            break;

        case 'new-subfolder':
            if (isFolder) {
                showFolderNameModalWithParent(filePath);
            } else {
                showNotification('New folder can only be created inside directories', 'error');
            }
            break;

        case 'set-as-primary':
            if (isFolder) {
                try {
                    const result = await window.electronAPI.invoke('switch-workspace', filePath);
                    if (result.success) {
                        if (window.appSettings) window.appSettings.workingDirectory = result.directory;
                        showNotification(`Primary folder set to ${filePath.split('/').pop()}`, 'success');
                        fileTreeRendered = false;
                        renderFileTree();
                    } else {
                        showNotification(result.error || 'Failed to set primary folder', 'error');
                    }
                } catch (error) {
                    showNotification('Error setting primary folder', 'error');
                }
            }
            break;

        case 'remove-from-workspace':
            if (isFolder) {
                const confirmRemove = confirm(`Remove this folder from workspace?\n\n${filePath}\n\nThis will only remove it from the file tree view, not delete the folder.`);
                if (confirmRemove) {
                    try {
                        const result = await window.electronAPI.invoke('remove-workspace-folder', filePath);
                        if (result.success) {
                            // Update global settings cache
                            if (window.appSettings) {
                                window.appSettings.workspaceFolders = result.workspaceFolders;
                            }
                            showNotification('Folder removed from workspace', 'success');
                            // Refresh file tree
                            fileTreeRendered = false;
                            renderFileTree();
                        } else {
                            showNotification(`Failed to remove folder: ${result.error}`, 'error');
                        }
                    } catch (error) {
                        console.error('[handleFileContextMenuAction] Error removing workspace folder:', error);
                        showNotification('Error removing folder from workspace', 'error');
                    }
                }
            }
            break;

        case 'publish-git':
            if (isFolder && gitInfo) {
                try {
                    // Show the git publish dialog
                    const result = await showGitPublishDialog(filePath, gitInfo);

                    if (result) {
                        // User confirmed, execute git publish
                        showNotification('Publishing changes...', 'info');

                        const publishResult = await window.electronAPI.invoke('git-publish', {
                            repoRoot: result.gitInfo.repoRoot,
                            subfolder: result.gitInfo.relativePath,
                            message: result.message
                        });

                        if (publishResult.success) {
                            showNotification(`Published successfully! Commit: ${publishResult.commitHash}`, 'success');
                        } else {
                            showNotification(`Publish failed: ${publishResult.error}`, 'error');
                        }
                    }
                } catch (error) {
                    console.error('[handleFileContextMenuAction] Error in git publish:', error);
                    showNotification('Error publishing to Git', 'error');
                }
            }
            break;

        case 'generate-thumbnails-batch':
            if (isFolder) {
                await generateThumbnailsForFolder(filePath);
            }
            break;

        case 'cut-file':
            if (!isFolder) {
                fileClipboard = {
                    filePath: filePath,
                    operation: 'cut'
                };
                const fileName = filePath.split('/').pop();
                showNotification(`Cut "${fileName}" - right-click a folder to paste`, 'info');
            }
            break;

        case 'copy-file-to-clipboard':
            if (!isFolder) {
                fileClipboard = {
                    filePath: filePath,
                    operation: 'copy'
                };
                const fileName = filePath.split('/').pop();
                showNotification(`Copied "${fileName}" - right-click a folder to paste`, 'info');
            }
            break;

        case 'paste-file':
            if (isFolder && fileClipboard.filePath && fileClipboard.operation) {
                try {
                    const sourceFilePath = fileClipboard.filePath;
                    const fileName = sourceFilePath.split('/').pop();
                    const currentDir = sourceFilePath.substring(0, sourceFilePath.lastIndexOf('/'));
                    const destinationFolder = filePath;

                    // Check if trying to paste to same location for move operation
                    if (fileClipboard.operation === 'cut' && currentDir === destinationFolder) {
                        showNotification('File is already in this folder', 'info');
                        break;
                    }

                    let destinationPath = destinationFolder + '/' + fileName;

                    // For copy operation to same directory, add "(copy)" suffix
                    if (fileClipboard.operation === 'copy' && currentDir === destinationFolder) {
                        const baseName = fileName.substring(0, fileName.lastIndexOf('.')) || fileName;
                        const ext = fileName.includes('.') ? fileName.substring(fileName.lastIndexOf('.')) : '';
                        destinationPath = destinationFolder + '/' + baseName + ' (copy)' + ext;
                    }

                    if (fileClipboard.operation === 'cut') {
                        // Perform move
                        const moveResult = await window.electronAPI.invoke('move-file', {
                            source: sourceFilePath,
                            destination: destinationPath
                        });

                        if (moveResult.success) {
                            showNotification(`Moved "${fileName}" to ${destinationFolder.split('/').pop()}`, 'success');

                            // Clear clipboard after successful cut/paste
                            fileClipboard = { filePath: null, operation: null };

                            // If this was the currently open file, update the path
                            if (window.currentFilePath === sourceFilePath) {
                                window.currentFilePath = moveResult.newPath;
                                updateBreadcrumb(moveResult.newPath);
                            }

                            // Refresh file tree
                            if (window.renderFileTree) {
                                window.renderFileTree();
                            }
                        } else {
                            showNotification(`Failed to move file: ${moveResult.error}`, 'error');
                        }
                    } else {
                        // Perform copy
                        const copyResult = await window.electronAPI.invoke('copy-file-to', {
                            source: sourceFilePath,
                            destination: destinationPath
                        });

                        if (copyResult.success) {
                            const destFileName = destinationPath.split('/').pop();
                            showNotification(`Copied "${fileName}" to ${destinationFolder.split('/').pop()}`, 'success');

                            // Keep clipboard for copy (allows multiple pastes)

                            // Refresh file tree
                            if (window.renderFileTree) {
                                window.renderFileTree();
                            }
                        } else {
                            showNotification(`Failed to copy file: ${copyResult.error}`, 'error');
                        }
                    }
                } catch (error) {
                    console.error('[handleFileContextMenuAction] Error pasting file:', error);
                    showNotification('Error pasting file', 'error');
                }
            }
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
                break;
            }
        }
    } catch (error) {
        console.error('[highlightCurrentFileInTree] Error highlighting file:', error);
    }
}

// --- Folder Name Modal Functions ---
function showFolderNameModal() {
    folderCreationParentPath = ''; // Reset to root level
    folderNameModal.classList.remove('hidden');
    folderNameInput.value = '';
    folderNameError.style.display = 'none';
    folderNameInput.focus();
}

function hideFolderNameModal() {
    folderNameModal.classList.add('hidden');
    folderCreationParentPath = ''; // Reset parent path when modal is hidden
}

function showFolderNameModalWithParent(parentPath) {
    folderCreationParentPath = parentPath;
    folderNameModal.classList.remove('hidden');
    folderNameInput.value = '';
    folderNameError.style.display = 'none';
    folderNameInput.focus();
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
        
        // Send request to main process to create folder
        const result = await window.electronAPI.invoke('create-folder', trimmedName, folderCreationParentPath);
        
        if (result.success) {
            hideFolderNameModal();
            folderCreationParentPath = ''; // Reset parent path after successful creation
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

// File creation modal functions
function showFileNameModal() {
    fileCreationParentPath = ''; // Reset to root level
    fileNameModal.classList.remove('hidden');
    fileNameInput.value = '';
    fileNameError.style.display = 'none';
    fileNameInput.focus();
}

function hideFileNameModal() {
    fileNameModal.classList.add('hidden');
    fileCreationParentPath = ''; // Reset parent path when modal is hidden
}

function showFileNameModalWithParent(parentPath) {
    fileCreationParentPath = parentPath;
    fileNameModal.classList.remove('hidden');
    fileNameInput.value = '';
    fileNameError.style.display = 'none';
    fileNameInput.focus();
}

function validateFileName(name) {
    if (!name || name.trim() === '') {
        return 'File name cannot be empty.';
    }

    const trimmedName = name.trim();

    // Check for invalid characters (similar to folder validation but more restrictive for files)
    if (!/^[a-zA-Z0-9_\-\s\.]+$/.test(trimmedName)) {
        return 'File name can only contain letters, numbers, spaces, hyphens, underscores, and periods.';
    }

    // Check if it has a valid extension (encourage .md files)
    if (!trimmedName.includes('.')) {
        return 'File name should include an extension (e.g., .md, .txt).';
    }

    // Prevent certain invalid names
    const invalidNames = ['con', 'prn', 'aux', 'nul', 'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9', 'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9'];
    const baseName = trimmedName.toLowerCase().split('.')[0];
    if (invalidNames.includes(baseName)) {
        return 'This file name is reserved by the system.';
    }

    return null; // Valid
}

function showFileNameError(message) {
    fileNameError.textContent = message;
    fileNameError.style.display = 'block';
}

async function handleCreateFile() {
    const fileName = fileNameInput.value;

    // Validate file name
    const validationError = validateFileName(fileName);
    if (validationError) {
        showFileNameError(validationError);
        return;
    }

    try {
        const trimmedName = fileName.trim();

        // Convert absolute path to relative path for backend
        let relativePath = fileCreationParentPath;
        if (relativePath && window.appSettings?.workingDirectory) {
            const workingDir = window.appSettings.workingDirectory;
            if (relativePath.startsWith(workingDir)) {
                relativePath = relativePath.replace(workingDir, '').replace(/^[\/\\]/, '');
            }
        }

        // Use the create-file IPC handler
        const result = await window.electronAPI.invoke('create-file', trimmedName, relativePath, '');

        if (result.success) {
            hideFileNameModal();
            fileCreationParentPath = ''; // Reset parent path after successful creation
            // Refresh the file tree to show the new file
            fileTreeRendered = false;
            debouncedRenderFileTree();
            showNotification('File created successfully', 'success');

            // Open the newly created file in the editor and bind current file context.
            try {
                const openResult = await window.electronAPI.invoke('open-file-path', result.filePath);
                if (openResult.success && window.openFileInEditor) {
                    await window.openFileInEditor(openResult.filePath, openResult.content);
                } else if (!openResult.success) {
                    console.error('[Renderer] Failed to open newly created file:', openResult.error);
                }
            } catch (error) {
                console.error('[Renderer] Error opening newly created file:', error);
            }
        } else {
            console.error(`[Renderer] Error creating file: ${result.error}`);
            showFileNameError(result.error);
        }
    } catch (error) {
        console.error('[Renderer] Error in handleCreateFile:', error);
        showFileNameError('Failed to create file. Please try again.');
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

        } else {
            // Ensure navigationHistory is always an array
            if (!Array.isArray(navigationHistory)) {
                navigationHistory = [];
                currentHistoryIndex = -1;
            }
        }
    } catch (error) {
        console.error('[Navigation] Error loading navigation history:', error);
        // Ensure navigationHistory is always an array on error
        if (!Array.isArray(navigationHistory)) {
            navigationHistory = [];
            currentHistoryIndex = -1;
        }
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
let monacoThemeSyncTimer = null;
let monacoThemeObserver = null;

function getMonacoThemeUtils() {
    return window.MonacoThemeUtils || null;
}

function readThemeVar(styles, names, fallback) {
    if (!styles || !Array.isArray(names)) return fallback;
    for (const name of names) {
        const value = String(styles.getPropertyValue(name) || '').trim();
        if (value) return value;
    }
    return fallback;
}

function normalizeHexColor(rawColor, fallback) {
    const utils = getMonacoThemeUtils();
    if (utils && typeof utils.normalizeHexColor === 'function') {
        return utils.normalizeHexColor(rawColor, fallback);
    }

    const value = String(rawColor || '').trim();
    if (!value) return fallback;

    const hexMatch = value.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);
    if (hexMatch) {
        const hex = hexMatch[1];
        if (hex.length === 3) {
            return '#' + hex.split('').map(ch => ch + ch).join('');
        }
        return '#' + hex.slice(0, 6);
    }

    const rgbMatch = value.match(
        /^rgba?\((\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(0|0?\.\d+|1))?\)$/i
    );
    if (rgbMatch) {
        const clamp = (n) => Math.max(0, Math.min(255, Number(n)));
        const toHex = (n) => clamp(n).toString(16).padStart(2, '0');
        return `#${toHex(rgbMatch[1])}${toHex(rgbMatch[2])}${toHex(rgbMatch[3])}`;
    }

    return fallback;
}

function applyHexAlpha(rawColor, alphaHex, fallback) {
    const utils = getMonacoThemeUtils();
    if (utils && typeof utils.applyHexAlpha === 'function') {
        return utils.applyHexAlpha(rawColor, alphaHex, fallback);
    }

    const base = normalizeHexColor(rawColor, fallback).replace('#', '').slice(0, 6);
    const alpha = String(alphaHex || '40').replace('#', '').slice(0, 2).padEnd(2, '0');
    return `#${base}${alpha}`;
}

function toMonacoTokenColor(rawColor, fallback) {
    const utils = getMonacoThemeUtils();
    if (utils && typeof utils.toMonacoTokenColor === 'function') {
        return utils.toMonacoTokenColor(rawColor, fallback);
    }

    return normalizeHexColor(rawColor, fallback).replace('#', '').slice(0, 6);
}

function buildMonacoThemeDefinition(language, isDark) {
    // Read from <body> so we pick up body.techne-dark overrides
    // (CSS vars set via class selectors on body don't cascade up to <html>).
    const rootStyles = getComputedStyle(document.body || document.documentElement);
    const utils = getMonacoThemeUtils();
    if (utils && typeof utils.buildMonacoThemeDefinition === 'function') {
        return utils.buildMonacoThemeDefinition(language, isDark, rootStyles);
    }

    const background = normalizeHexColor(
        readThemeVar(
            rootStyles,
            ['--editor-bg', '--surface', '--panel-bg', '--surface-variant', '--bg-secondary', '--bg-color'],
            isDark ? '#1e1e1e' : '#ffffff'
        ),
        isDark ? '#1e1e1e' : '#ffffff'
    );
    const surface = normalizeHexColor(
        readThemeVar(
            rootStyles,
            ['--surface-variant', '--surface-hover', '--bg-secondary', '--toolbar-bg', '--panel-bg', '--bg-color'],
            isDark ? '#252526' : '#f8fafc'
        ),
        isDark ? '#252526' : '#f8fafc'
    );
    const foreground = normalizeHexColor(
        readThemeVar(
            rootStyles,
            ['--text', '--menu-text-color', '--text-secondary', '--text-color'],
            isDark ? '#d4d4d4' : '#1e293b'
        ),
        isDark ? '#d4d4d4' : '#1e293b'
    );
    const muted = normalizeHexColor(
        readThemeVar(
            rootStyles,
            ['--text-muted', '--text-secondary', '--text-color'],
            isDark ? '#6b6b6b' : '#94a3b8'
        ),
        isDark ? '#6b6b6b' : '#94a3b8'
    );
    const accent = normalizeHexColor(
        readThemeVar(
            rootStyles,
            ['--primary', '--primary-500', '--accent-color'],
            isDark ? '#818cf8' : '#6366f1'
        ),
        isDark ? '#818cf8' : '#6366f1'
    );
    const border = normalizeHexColor(
        readThemeVar(
            rootStyles,
            ['--border', '--toolbar-border', '--button-border', '--border-color'],
            isDark ? '#3c3c3c' : '#e2e8f0'
        ),
        isDark ? '#3c3c3c' : '#e2e8f0'
    );

    const accentToken = toMonacoTokenColor(accent, isDark ? '#93c5fd' : '#2563eb');
    const textToken = toMonacoTokenColor(foreground, isDark ? '#d4d4d4' : '#1e293b');
    const mutedToken = toMonacoTokenColor(muted, isDark ? '#6b6b6b' : '#94a3b8');

    const markdownRules = [
        { token: 'string.link', foreground: accentToken },
        { token: 'string.target', foreground: accentToken },
        { token: 'markup.underline.link', foreground: accentToken },
        { token: 'markup.underline', foreground: accentToken }
    ];

    const bibtexRules = [
        { token: 'keyword', foreground: accentToken, fontStyle: 'bold' },
        { token: 'entity.name.function', foreground: textToken },
        { token: 'attribute.name', foreground: accentToken },
        { token: 'string', foreground: textToken },
        { token: 'number', foreground: accentToken },
        { token: 'comment', foreground: mutedToken, fontStyle: 'italic' },
        { token: 'bracket', foreground: textToken },
        { token: 'delimiter', foreground: textToken }
    ];

    return {
        base: isDark ? 'vs-dark' : 'vs',
        inherit: true,
        rules: language === 'bibtex' ? bibtexRules : markdownRules,
        colors: {
            'editor.background': background,
            'editor.foreground': foreground,
            'editor.lineHighlightBackground': surface,
            'editorLineNumber.foreground': muted,
            'editorLineNumber.activeForeground': foreground,
            'editorCursor.foreground': accent,
            'editor.selectionBackground': applyHexAlpha(accent, '40', '#6366f1'),
            'editor.inactiveSelectionBackground': applyHexAlpha(accent, '24', '#6366f1'),
            'editorLink.activeForeground': `#${accentToken}`,
            'editorIndentGuide.background': applyHexAlpha(border, '66', '#3c3c3c'),
            'editorIndentGuide.activeBackground': applyHexAlpha(muted, '88', '#6b6b6b'),
            'editorWidget.background': surface,
            'editorWidget.border': border,
            'editorGutter.background': background,
            'minimap.background': background,
            'scrollbarSlider.background': applyHexAlpha(border, '88', '#3c3c3c'),
            'scrollbarSlider.hoverBackground': applyHexAlpha(muted, '99', '#6b6b6b')
        }
    };
}

function syncEditorThemeWithAppTheme() {
    if (!window.monaco || !monaco.editor) return;

    const isDark = document.body?.classList.contains('dark-mode');
    monaco.editor.defineTheme('markdown-dynamic', buildMonacoThemeDefinition('markdown', isDark));
    monaco.editor.defineTheme('bibtex-dynamic', buildMonacoThemeDefinition('bibtex', isDark));

    const language = window.editor?.getModel?.()?.getLanguageId?.() || 'markdown';
    const themeId = getMonacoTheme(language);
    if (themeId) {
        monaco.editor.setTheme(themeId);
    }
}

function scheduleMonacoThemeSync() {
    if (monacoThemeSyncTimer) {
        clearTimeout(monacoThemeSyncTimer);
    }
    monacoThemeSyncTimer = setTimeout(() => {
        monacoThemeSyncTimer = null;
        syncEditorThemeWithAppTheme();
    }, 0);
}

function initializeMonacoThemeInheritanceObserver() {
    if (monacoThemeObserver || typeof MutationObserver !== 'function') return;
    const body = document.body;
    const root = document.documentElement;
    if (!body || !root) return;

    monacoThemeObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type !== 'attributes') continue;
            const bodyThemeMutation = mutation.target === body && (
                mutation.attributeName === 'class' ||
                mutation.attributeName === 'style' ||
                mutation.attributeName === 'data-techne-theme'
            );
            const rootStyleMutation = mutation.target === root && mutation.attributeName === 'style';
            if (bodyThemeMutation || rootStyleMutation) {
                scheduleMonacoThemeSync();
                break;
            }
        }
    });

    monacoThemeObserver.observe(body, {
        attributes: true,
        attributeFilter: ['class', 'style', 'data-techne-theme']
    });
    monacoThemeObserver.observe(root, {
        attributes: true,
        attributeFilter: ['style']
    });
}

// Returns the Monaco theme name for the active model language.
function getMonacoTheme(language) {
    if (language === 'bibtex') return 'bibtex-dynamic';
    return 'markdown-dynamic';
}

window.getMonacoTheme = getMonacoTheme;
window.syncEditorThemeWithAppTheme = syncEditorThemeWithAppTheme;

// Expose helpers for editor-tabs.js
window.highlightCurrentFileInTree = highlightCurrentFileInTree;
window.updateBreadcrumb = updateBreadcrumb;
window.updateUnsavedIndicator = updateUnsavedIndicator;
window.updatePreviewAndStructure = updatePreviewAndStructure;

// Canonical theme applicator used across the renderer.
// Accepts either:
// - a boolean `true|false` (apply actual dark state without changing user preference), or
// - a string theme preference: 'auto' | 'light' | 'dark' | 'techne'
function applyTheme(themeOrIsDark) {
    const body = document.body;
    if (!body) return;

    const preference = (typeof themeOrIsDark === 'string' && themeOrIsDark)
        ? themeOrIsDark
        : (window.appSettings?.theme || 'auto');
    const managedTheme = preference !== 'auto'
        && preference !== 'techne'
        && typeof window.techneThemeManager?.getThemes === 'function'
        && window.techneThemeManager.getThemes()[preference];

    if (managedTheme && typeof window.techneThemeManager?.applyTheme === 'function') {
        window.currentTheme = preference;
        window.techneThemeManager.applyTheme(preference);
        return;
    }

    const prefersDark = () => {
        try {
            return Boolean(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
        } catch (error) {
            return false;
        }
    };

    const shouldUseTechne = preference === 'techne';

    // Determine applied dark/light state
    let appliedDark = false;
    if (typeof themeOrIsDark === 'boolean') {
        // Respect explicit preferences even when OS/theme events provide boolean state.
        if (shouldUseTechne) {
            appliedDark = false;
        } else if (preference === 'dark') {
            appliedDark = true;
        } else if (preference === 'light') {
            appliedDark = false;
        } else if (preference === 'auto') {
            appliedDark = themeOrIsDark;
        } else {
            appliedDark = themeOrIsDark;
        }
    } else if (preference === 'dark') {
        appliedDark = true;
    } else if (preference === 'light') {
        appliedDark = false;
    } else if (preference === 'auto') {
        appliedDark = prefersDark();
    } else if (preference === 'techne') {
        appliedDark = false;
    } else {
        appliedDark = false;
    }

    // Reset classes
    body.classList.remove(
        'dark-mode',
        'light-mode',
        'techne-theme',
        'techne-accent-orange',
        'techne-grid-off',
        'techne-noise-off'
    );

    body.classList.add(appliedDark ? 'dark-mode' : 'light-mode');

    // Apply Techne as an overlay on light mode
    if (shouldUseTechne) {
        body.classList.remove('dark-mode');
        body.classList.add('light-mode');
        body.classList.add('techne-theme');

        const techne = window.appSettings?.techne || {};
        const accent = techne.accent === 'orange' ? 'orange' : 'red';
        const gridOn = techne.grid !== false;
        const noiseOn = techne.noise !== false;

        body.classList.toggle('techne-accent-orange', accent === 'orange');
        body.classList.toggle('techne-grid-off', !gridOn);
        body.classList.toggle('techne-noise-off', !noiseOn);

        // Prefer matching Techne presentation templates when available
        if (window.styleManager && typeof window.styleManager.getPresentationTemplates === 'function') {
            const desiredTemplate = accent === 'orange' ? 'techne-orange' : 'techne-red';
            const available = window.styleManager.getPresentationTemplates().some(t => t.id === desiredTemplate);
            if (available && typeof window.styleManager.applyPresentationTemplate === 'function') {
                const current = window.styleManager.getCurrentStyles?.().presentation;
                if (current !== desiredTemplate) {
                    window.styleManager.applyPresentationTemplate(desiredTemplate);
                }
            }
        }
    }

    // Store applied theme for other modules
    window.currentTheme = shouldUseTechne ? 'techne' : (appliedDark ? 'dark' : 'light');

    // Sync Monaco theme from current CSS variables/classes.
    if (window.monaco && monaco.editor) {
        initializeMonacoThemeInheritanceObserver();
        requestAnimationFrame(() => scheduleMonacoThemeSync());
    }

    // Notify listeners (network/library/etc)
    try {
        window.dispatchEvent(new CustomEvent('app-theme-changed', {
            detail: {
                preference,
                applied: window.currentTheme,
                isDark: appliedDark
            }
        }));
    } catch (error) {
        // ignore
    }
}


// Setup context menu listener
setupContextMenuListener();

// Duplicate file-opened event listener removed - already handled at line 2065

// Handle new file creation signal from main process
if (window.electronAPI) {
    window.electronAPI.on('new-file-created', () => {

        // Create a new untitled tab (rather than reusing the current tab)
        if (window.tabManager) {
            if (window.tabManager.tabs.size >= window.tabManager.maxTabs) {
                if (typeof showNotification === 'function') {
                    showNotification(`Maximum ${window.tabManager.maxTabs} tabs open. Please close a tab first.`, 'warning');
                }
                return;
            }
            const untitledPath = window.tabManager.createUntitledTab();
            window.tabManager.activateTab(untitledPath);
        } else {
            // Fallback when tab manager is not available
            window.currentFilePath = null;
            window.editorFileName = null;
            if (editor) {
                editor.setValue('');
            } else if (fallbackEditor) {
                fallbackEditor.value = '';
            }
        }

        // Clear preview and structure for the new empty file
        if (previewContent) {
            previewContent.innerHTML = '';
        }
        if (structureList) {
            structureList.innerHTML = '';
        }

        // Update AI chat context for new file
        updateAIChatContext(null);

        // Update breadcrumb for untitled file
        updateBreadcrumb(null);
        const nav = document.getElementById('breadcrumb-nav');
        if (nav) nav.innerHTML = '<span class="breadcrumb-segment current-file">Untitled</span>';

        // Ensure structure view is active (optional, good UX)
        if (window.currentStructureView !== 'structure') {
            switchStructureView('structure');
        }

    });
}

// Listen for signal to refresh the file tree (e.g., after Open Folder)
if (window.electronAPI) {
    window.electronAPI.on('refresh-file-tree', () => {

        // Reset the rendered flag to force a refresh
        fileTreeRendered = false;

        // Switch to file view (which will trigger renderFileTree if needed)
        if (window.currentStructureView !== 'files') {
            switchStructureView('file');
        } else {
            // If already in file view, manually refresh
            fileTreeRendered = false;  // Reset flag to force refresh
            debouncedRenderFileTree();
        }
    });

    // Listen for settings changes from main process (e.g., working directory change)
    window.electronAPI.on('settings-changed', (changedSettings) => {

        // Update global appSettings with changed values
        if (changedSettings && changedSettings.workingDirectory && window.appSettings) {
            window.appSettings.workingDirectory = changedSettings.workingDirectory;
        }
    });
}

// Listen for theme updates from main process

// Listen for 'set-theme' event via electronAPI, calling applyTheme(theme === 'dark')
if (window.electronAPI && window.electronAPI.on) {
    window.electronAPI.on('set-theme', (theme) => {
        applyTheme(typeof theme === 'string' ? theme : Boolean(theme));
    });
    
    window.electronAPI.on('show-command-palette', () => {
        if (window.showCommandPalette) {
            window.showCommandPalette();
        }
    });

    window.electronAPI.on('toggle-visual-markdown', (enabled) => {
        if (typeof window.setVisualMarkdownEnabled === 'function') {
            window.setVisualMarkdownEnabled(enabled);
        } else {
            console.warn('[renderer.js] setVisualMarkdownEnabled not available');
        }
    });

    window.electronAPI.on('toggle-preview-pane', (visible) => {
        // Sync the previewVisible state with the incoming value
        if (visible !== previewVisible) {
            togglePreview();
        }
    });

    window.electronAPI.on('trigger-import-pdf', async () => {
        await importPdfAsMarkdown();
    });

    window.electronAPI.on('trigger-import-word', async () => {
        await importWordAsMarkdown();
    });

    window.electronAPI.on('trigger-generate-thumbnail', async () => {
        await generateThumbnail();
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
        // Use the existing saveFile function which handles all the logic
        await saveFile();
    });
}

// Listen for 'Save As' trigger from main process
if (window.electronAPI) {
    window.electronAPI.on('trigger-save-as', async () => {
        // Use the existing saveAsFile function which handles all the logic
        await saveAsFile();
    });
}

// Cmd+W closes the active tab. The main-process menu handler sends this
// IPC instead of invoking role: 'close' so the accelerator stays hooked
// in the OS menu layer (DOM keydown would never see it otherwise).
// When there are no tabs, fall back to closing the window so the shortcut
// still behaves sensibly for an empty editor.
if (window.electronAPI) {
    window.electronAPI.on('menu:close-tab', async () => {
        const tm = window.tabManager;
        if (tm && tm.activeTabPath && tm.tabs.has(tm.activeTabPath)) {
            await tm.closeTab(tm.activeTabPath);
        } else {
            window.close();
        }
    });
}

// Listen for 'save-all-and-close' from main process (window close with unsaved changes)
if (window.electronAPI) {
    window.electronAPI.on('save-all-and-close', async () => {
        try {
            if (window.editorTabs) {
                for (const [filePath, tab] of window.editorTabs.tabs) {
                    if (tab.isDirty && filePath && !filePath.startsWith('untitled:')) {
                        const content = tab.model ? tab.model.getValue() : null;
                        if (content !== null) {
                            await window.electronAPI.invoke('save-file', { filePath, content });
                        }
                    }
                }
            } else {
                // Fallback: save the current file
                await saveFile();
            }
        } catch (err) {
            console.error('[renderer] Error saving all files before close:', err);
        }
        // Signal main process that saves are done and it can close
        window.electronAPI.send('saves-completed-close');
    });
}

// --- End Save/Save As Logic ---

// --- Export Logic ---

// Handle HTML export signal from main process
if (window.electronAPI) {


    window.electronAPI.on('trigger-export-pdf', async () => {
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
    
    // Listen for HTML export completion to refresh preview if needed
    window.electronAPI.on('html-export-completed', async (exportedFilePath) => {
        
        // Check if the exported HTML file should refresh the current preview
        let shouldRefresh = false;
        let refreshReason = '';
        
        if (window.currentFilePath) {
            // Direct match (HTML file is currently open)
            if (window.currentFilePath === exportedFilePath) {
                shouldRefresh = true;
                refreshReason = 'HTML file directly open';
            }
            // Check if the exported HTML corresponds to the currently open markdown file
            else if (window.currentFilePath.endsWith('.md')) {
                const expectedHtmlPath = window.currentFilePath.replace('.md', '.html');
                if (expectedHtmlPath === exportedFilePath) {
                    shouldRefresh = true;
                    refreshReason = 'corresponding markdown file open';
                }
            }
        }
        
        // Additional check: Always refresh if preview is currently showing HTML content
        const previewContent = document.getElementById('preview-content');
        if (previewContent && previewContent.innerHTML.includes('html-preview-container')) {
            shouldRefresh = true;
            refreshReason += (refreshReason ? ' + ' : '') + 'HTML preview currently visible';
        }
        
        if (shouldRefresh) {
            
            try {
                // Re-read the HTML file content and refresh the preview
                const response = await window.electronAPI.invoke('read-file', exportedFilePath);
                if (response.success) {
                    displayHTMLInPreview(response.content, exportedFilePath);
                } else {
                    console.error('[renderer.js] Error re-reading HTML file for refresh:', response.error);
                }
            } catch (error) {
                console.error('[renderer.js] Error refreshing HTML preview:', error);
            }
        } else {
        }
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



function notificationsEnabled() {
    return window.appSettings?.notifications?.enabled !== false;
}

function aiNotificationsEnabled() {
    return window.appSettings?.notifications?.aiEnabled !== false;
}

function looksLikeAINotification(message) {
    if (typeof message !== 'string') return false;
    return /\b(ai|ash|dr\.?\s*chen|summari(z|s)e|speaker notes|ghost text|openai|anthropic|gemini|openrouter)\b/i.test(message);
}

function showNotification(message, type = 'info', optionsOrDuration = undefined) {
    if (!notificationsEnabled()) {
        return;
    }

    let isHTML = false;
    let duration = 4000;
    let source = 'general';

    if (typeof optionsOrDuration === 'number') {
        duration = optionsOrDuration;
    } else if (typeof optionsOrDuration === 'boolean') {
        isHTML = optionsOrDuration;
    } else if (typeof optionsOrDuration === 'string') {
        source = optionsOrDuration;
    } else if (optionsOrDuration && typeof optionsOrDuration === 'object') {
        isHTML = optionsOrDuration.isHTML === true;
        duration = typeof optionsOrDuration.duration === 'number' ? optionsOrDuration.duration : duration;
        source = typeof optionsOrDuration.source === 'string' ? optionsOrDuration.source : source;
    }

    const isAIMessage = source === 'ai' || looksLikeAINotification(message);
    if (isAIMessage && !aiNotificationsEnabled()) {
        return;
    }

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
    
    // Auto-remove after configured duration with hide animation
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
    }, Math.max(500, duration));
}


// --- Auto-save functionality (moved to autosave.js module) ---

// Mark that there are unsaved changes and schedule auto-save
function scheduleAutoSave() {
    if (!window.appSettings?.ui?.autoSave || suppressAutoSave) return;
    
    const currentContent = editor ? editor.getValue() : '';
    
    // Check if content has actually changed
    if (currentContent === lastSavedContent) {
        window.hasUnsavedChanges = false;
        return;
    }
    
    window.hasUnsavedChanges = true;

    // Sync dirty state to active tab
    if (window.tabManager) {
        window.tabManager.syncActiveTabDirty(true);
    }

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
    if (!window.hasUnsavedChanges || !editor) {
        return;
    }

    try {
        const content = editor.getValue();

        // Only save if we have a current file path and the file still exists
        if (window.currentFilePath && window.electronAPI) {
            // Check if file was deleted externally
            try {
                const existsResult = await window.electronAPI.invoke('check-file-exists', window.currentFilePath);
                const exists = typeof existsResult === 'object' ? existsResult?.exists : existsResult;
                if (!exists) {
                    console.warn('[renderer.js] File no longer exists, skipping auto-save:', window.currentFilePath);
                    window.hasUnsavedChanges = false;
                    updateUnsavedIndicator(false);
                    if (window.tabManager) window.tabManager.syncActiveTabDirty(false, content);
                    return;
                }
            } catch (e) {
                // If we can't check, proceed with save attempt
            }
            // CRITICAL FIX: Pass the file path explicitly to prevent saving to wrong file
            const result = await window.electronAPI.invoke('perform-save-with-path', content, window.currentFilePath);
            
            if (result.success) {
                lastSavedContent = content;
                window.hasUnsavedChanges = false;
                updateUnsavedIndicator(false);
                showNotification('Auto-saved', 'success', 1000); // Brief notification

                // Sync saved state to active tab
                if (window.tabManager) {
                    window.tabManager.syncActiveTabDirty(false, content);
                }

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
        }
    } catch (error) {
        console.error('[renderer.js] Auto-save error:', error);
    }
}

// Update breadcrumb navigation to show full file path
function updateBreadcrumb(filePath) {
    const nav = document.getElementById('breadcrumb-nav');
    if (!nav) return;

    if (!filePath) {
        nav.innerHTML = '<span class="breadcrumb-segment" style="color: #999;">No file selected</span>';
        return;
    }

    const parts = filePath.split('/').filter(Boolean);
    // Show last N parts to keep it compact; show at least folder + file
    const maxParts = 4;
    const displayParts = parts.length > maxParts
        ? ['...', ...parts.slice(-maxParts)]
        : parts;

    const html = displayParts.map((part, i) => {
        const isLast = i === displayParts.length - 1;
        const isEllipsis = part === '...';

        // Build the full path for this segment (for click-to-reveal in tree)
        let segmentPath = '';
        if (!isEllipsis) {
            const realIndex = parts.length - displayParts.length + i;
            segmentPath = '/' + parts.slice(0, realIndex + 1).join('/');
        }

        let segmentHtml;
        if (isEllipsis) {
            segmentHtml = `<span class="breadcrumb-segment" title="${'/' + parts.join('/')}" style="color: #aaa;">…</span>`;
        } else if (isLast) {
            segmentHtml = `<span class="breadcrumb-segment current-file" title="${filePath}">${part}</span>`;
        } else {
            segmentHtml = `<span class="breadcrumb-segment clickable" data-path="${segmentPath}" title="${segmentPath}">${part}</span>`;
        }

        const separator = isLast ? '' : '<span class="breadcrumb-separator">›</span>';
        return segmentHtml + separator;
    }).join('');

    nav.innerHTML = html;

    // Add click handlers for folder segments to expand in file tree
    nav.querySelectorAll('.breadcrumb-segment.clickable').forEach(el => {
        el.addEventListener('click', () => {
            const folderPath = el.dataset.path;
            if (folderPath && window.expandedFolders) {
                window.expandedFolders.add(folderPath);
                if (window.renderFileTree) {
                    window.renderFileTree();
                }
            }
        });
    });
}

// Update the unsaved changes indicator
function updateUnsavedIndicator(hasUnsaved) {
    const currentFileEl = document.querySelector('#breadcrumb-nav .current-file');
    if (currentFileEl) {
        const text = currentFileEl.textContent;
        if (hasUnsaved && !text.includes('●')) {
            currentFileEl.textContent = '● ' + text;
        } else if (!hasUnsaved && text.includes('●')) {
            currentFileEl.textContent = text.replace('● ', '');
        }
    }
}

// Mark content as saved (called when user manually saves)
function markContentAsSaved() {
    if (editor) {
        lastSavedContent = editor.getValue();
        window.hasUnsavedChanges = false;
        updateUnsavedIndicator(false);

        // Sync saved state to active tab
        if (window.tabManager) {
            window.tabManager.syncActiveTabDirty(false, lastSavedContent);
        }

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
    const setBibliographyBtn = document.getElementById('set-bibliography-btn');
    
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
    if (setBibliographyBtn) {
        setBibliographyBtn.addEventListener('click', async () => await setBibliographyForMarkdownFile());
    }
    
    // Formatting initialization complete
}, 2000);

// === Pane Toggle Functionality ===
let sidebarVisible = true;
let editorVisible = true;
let previewVisible = true;

// Persist pane visibility to settings so state survives restarts
let _restoringPaneVisibility = false;
function savePaneVisibility() {
    if (_restoringPaneVisibility) return; // Skip saves during initial restore
    if (window.electronAPI) {
        window.electronAPI.send('save-layout', {
            sidebarVisible,
            editorVisible,
            previewVisible
        });
    }
}

function setPaneVisibilityButtonState(toggleBtn, isVisible, onVariantClass = 'btn-primary') {
    if (!toggleBtn) return;

    toggleBtn.classList.remove('toggle-off');
    toggleBtn.classList.remove('btn-primary', 'btn-warning', 'btn-error', 'btn-success');

    if (isVisible) {
        toggleBtn.classList.add(onVariantClass);
        toggleBtn.setAttribute('aria-pressed', 'true');
    } else {
        toggleBtn.classList.add('toggle-off');
        toggleBtn.setAttribute('aria-pressed', 'false');
    }

    // Clear any legacy inline styles
    toggleBtn.style.background = '';
    toggleBtn.style.color = '';
    toggleBtn.style.opacity = '';
}

function toggleSidebar() {
    
    const sidebar = document.getElementById('left-sidebar');
    const resizer = document.getElementById('sidebar-resizer');
    const toggleBtn = document.getElementById('toggle-sidebar-btn');
    
    if (sidebarVisible) {
        sidebar.style.display = 'none';
        resizer.style.display = 'none';
        setPaneVisibilityButtonState(toggleBtn, false, 'btn-primary');
        
        // Remove width constraints completely
        sidebar.style.width = '0px';
        sidebar.style.minWidth = '0px';
        sidebar.style.maxWidth = '0px';
        sidebar.style.overflow = 'hidden';
        
    } else {
        sidebar.style.display = 'flex';
        resizer.style.display = 'block';
        setPaneVisibilityButtonState(toggleBtn, true, 'btn-primary');
        
        // Restore sidebar width
        sidebar.style.width = '';
        sidebar.style.minWidth = '';
        sidebar.style.maxWidth = '';
        sidebar.style.overflow = '';
        
        // Restore normal layout proportions
        refreshLayoutProportions();
    }
    
    sidebarVisible = !sidebarVisible;
    savePaneVisibility();
}

function toggleEditor() {
    const editorPane = document.getElementById('editor-pane');
    const toggleBtn = document.getElementById('toggle-editor-btn');
    
    if (editorVisible) {
        editorPane.style.display = 'none';
        setPaneVisibilityButtonState(toggleBtn, false, 'btn-primary');
        // Adjust preview to take full width
        const previewPane = document.getElementById('preview-pane');
        if (previewPane) previewPane.style.flex = '1';
    } else {
        editorPane.style.display = 'flex';
        setPaneVisibilityButtonState(toggleBtn, true, 'btn-primary');
        // Restore normal layout proportions
        refreshLayoutProportions();
    }
    editorVisible = !editorVisible;
    savePaneVisibility();
}

function togglePreview() {
    const rightPane = document.getElementById('right-pane');
    const toggleBtn = document.getElementById('toggle-preview-btn');

    if (!rightPane) {
        console.warn('[togglePreview] right-pane element not found');
        return;
    }

    if (previewVisible) {
        // Use CSS class to hide - inline display:none is overridden by CSS !important
        rightPane.classList.add('pane-hidden');
        if (toggleBtn) setPaneVisibilityButtonState(toggleBtn, false, 'btn-primary');
        // Adjust editor to take full width
        const editorContainer = document.getElementById('editor-container');
        if (editorContainer) editorContainer.style.flex = '1';
    } else {
        rightPane.classList.remove('pane-hidden');
        if (toggleBtn) setPaneVisibilityButtonState(toggleBtn, true, 'btn-primary');
        // Restore normal layout proportions
        refreshLayoutProportions();
    }
    previewVisible = !previewVisible;
    savePaneVisibility();
}

// Expose togglePreview globally for command palette
window.togglePreview = togglePreview;

// --- Zen Mode (Distraction-Free) ---
let zenModeActive = false;
let zenModeState = {}; // Stores previous visibility state

function toggleZenMode() {
    const sidebar = document.getElementById('left-sidebar');
    const modeSwitcher = document.getElementById('mode-switcher');
    const editorToolbar = document.getElementById('editor-toolbar');
    const rightPane = document.getElementById('right-pane');
    const gamificationPanel = document.getElementById('gamification-panel');
    const statusBar = document.getElementById('status-bar');

    if (!zenModeActive) {
        // Enter zen mode — save current state and hide everything except editor
        zenModeState = {
            sidebarHidden: sidebar?.classList.contains('pane-hidden'),
            previewVisible: previewVisible,
            gamificationHidden: gamificationPanel?.classList.contains('pane-hidden'),
        };

        if (sidebar) sidebar.classList.add('pane-hidden');
        if (modeSwitcher) modeSwitcher.style.display = 'none';
        if (editorToolbar) editorToolbar.style.display = 'none';
        if (rightPane) rightPane.classList.add('pane-hidden');
        if (gamificationPanel) gamificationPanel.classList.add('pane-hidden');
        if (statusBar) statusBar.style.display = 'none';

        // Give editor full width
        const editorContainer = document.getElementById('editor-container');
        if (editorContainer) editorContainer.style.flex = '1';

        previewVisible = false;
        zenModeActive = true;
        document.body.classList.add('zen-mode');

        if (window.showNotification) {
            window.showNotification('Zen mode — press Cmd+Shift+Enter or Esc to exit', 'info');
        }
    } else {
        // Exit zen mode — restore previous state
        if (modeSwitcher) modeSwitcher.style.display = '';
        if (editorToolbar) editorToolbar.style.display = '';
        if (statusBar) statusBar.style.display = '';

        if (sidebar && !zenModeState.sidebarHidden) {
            sidebar.classList.remove('pane-hidden');
        }
        if (rightPane && zenModeState.previewVisible) {
            rightPane.classList.remove('pane-hidden');
            previewVisible = true;
            refreshLayoutProportions();
        }
        if (gamificationPanel && !zenModeState.gamificationHidden) {
            gamificationPanel.classList.remove('pane-hidden');
        }

        zenModeActive = false;
        document.body.classList.remove('zen-mode');
    }

    // Re-layout editor
    if (window.editor && window.editor.layout) {
        setTimeout(() => window.editor.layout(), 50);
    }
}
window.toggleZenMode = toggleZenMode;

// Esc key exits zen mode
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && zenModeActive) {
        toggleZenMode();
    }
});

// --- Quick Open File Picker (Cmd+P) ---
let quickOpenOverlay = null;

async function showQuickOpen() {
    if (quickOpenOverlay) {
        hideQuickOpen();
        return;
    }

    // Fetch recent files and workspace files in parallel
    let recentFiles = [];
    let workspaceFiles = [];
    try {
        [recentFiles, workspaceFiles] = await Promise.all([
            window.electronAPI.invoke('get-recent-files').catch(() => []),
            window.electronAPI.invoke('get-markdown-files').then(r => r?.files || r || []).catch(() => [])
        ]);
    } catch (err) {
        console.warn('[QuickOpen] Error fetching files:', err);
    }

    // Build combined list: recent files first, then workspace files (deduplicated)
    const recentSet = new Set(recentFiles);
    const allFiles = [
        ...recentFiles.map(f => ({ path: f, isRecent: true })),
        ...workspaceFiles.filter(f => !recentSet.has(f)).map(f => ({ path: f, isRecent: false }))
    ];

    quickOpenOverlay = document.createElement('div');
    quickOpenOverlay.className = 'command-palette-overlay';
    quickOpenOverlay.innerHTML = `
        <div class="command-palette">
            <div class="command-palette-input-container">
                <input type="text" class="command-palette-input" placeholder="Search files by name..." autocomplete="off" spellcheck="false">
                <div class="command-palette-shortcut">Cmd+P</div>
            </div>
            <div class="command-palette-results" id="quick-open-results"></div>
        </div>
    `;
    document.body.appendChild(quickOpenOverlay);

    const input = quickOpenOverlay.querySelector('.command-palette-input');
    const results = quickOpenOverlay.querySelector('#quick-open-results');
    let selectedIdx = 0;

    function renderResults(query) {
        const q = query.toLowerCase();
        const filtered = allFiles
            .filter(f => {
                const name = f.path.split('/').pop().toLowerCase();
                const fullPath = f.path.toLowerCase();
                return name.includes(q) || fullPath.includes(q);
            })
            .slice(0, 30);

        results.innerHTML = filtered.map((f, i) => {
            const name = f.path.split('/').pop();
            const dir = f.path.substring(0, f.path.length - name.length - 1).split('/').slice(-2).join('/');
            const recentBadge = f.isRecent ? '<span style="font-size:9px;color:#999;margin-left:6px;">recent</span>' : '';
            return `<div class="command-item ${i === selectedIdx ? 'selected' : ''}" data-file-path="${f.path}">
                <div class="command-label">${highlightFileMatch(name, query)}${recentBadge}</div>
                <div class="command-shortcut" style="font-size:10px;color:#999;max-width:200px;overflow:hidden;text-overflow:ellipsis;">${dir}</div>
            </div>`;
        }).join('');

        if (filtered.length === 0) {
            results.innerHTML = '<div style="padding:12px;color:#999;text-align:center;">No matching files</div>';
        }

        // Click handlers
        results.querySelectorAll('.command-item').forEach(item => {
            item.addEventListener('click', () => {
                openQuickOpenFile(item.dataset.filePath);
            });
        });
    }

    function highlightFileMatch(text, query) {
        if (!query) return text;
        const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        return text.replace(regex, '<mark>$1</mark>');
    }

    async function openQuickOpenFile(filePath) {
        hideQuickOpen();
        try {
            const result = await window.electronAPI.invoke('read-file', filePath);
            if (result.success) {
                await openFileInEditor(filePath, result.content);
            }
        } catch (error) {
            console.error('[QuickOpen] Error opening file:', error);
        }
    }

    renderResults('');
    setTimeout(() => input.focus(), 10);

    input.addEventListener('input', (e) => {
        selectedIdx = 0;
        renderResults(e.target.value);
    });

    input.addEventListener('keydown', (e) => {
        const items = results.querySelectorAll('.command-item');
        switch (e.key) {
            case 'Escape':
                e.preventDefault();
                hideQuickOpen();
                break;
            case 'ArrowDown':
                e.preventDefault();
                selectedIdx = Math.min(selectedIdx + 1, items.length - 1);
                items.forEach((item, i) => item.classList.toggle('selected', i === selectedIdx));
                items[selectedIdx]?.scrollIntoView({ block: 'nearest' });
                break;
            case 'ArrowUp':
                e.preventDefault();
                selectedIdx = Math.max(selectedIdx - 1, 0);
                items.forEach((item, i) => item.classList.toggle('selected', i === selectedIdx));
                items[selectedIdx]?.scrollIntoView({ block: 'nearest' });
                break;
            case 'Enter':
                e.preventDefault();
                const sel = items[selectedIdx];
                if (sel) openQuickOpenFile(sel.dataset.filePath);
                break;
        }
    });

    quickOpenOverlay.addEventListener('click', (e) => {
        if (e.target === quickOpenOverlay) hideQuickOpen();
    });
}

function hideQuickOpen() {
    if (quickOpenOverlay) {
        document.body.removeChild(quickOpenOverlay);
        quickOpenOverlay = null;
        if (window.editor) setTimeout(() => window.editor.focus(), 10);
    }
}
window.showQuickOpen = showQuickOpen;

// --- Slide Preview Thumbnails ---
let slideThumbnailTimer = null;
let slideThumbnailsHidden = false; // user preference to hide the strip

let _lastThumbnailHash = '';
let _slideContentCache = new Map(); // per-slide hash → rendered HTML
let _thumbnailObserver = null; // IntersectionObserver for lazy rendering

// Simple fast hash for change detection
function _quickHash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return h;
}

function updateSlideThumbnails(content) {
    clearTimeout(slideThumbnailTimer);
    const slideCount = (content.match(/\n---[ \t]*\n/g) || []).length + 1;
    // Fast update for active slide highlight, slower for full rebuild
    const delay = slideCount > 30 ? 1000 : slideCount > 15 ? 500 : 250;
    slideThumbnailTimer = setTimeout(() => {
        renderSlideThumbnails(content);
    }, delay);
}

function toggleSlideThumbnails() {
    slideThumbnailsHidden = !slideThumbnailsHidden;
    const strip = document.getElementById('slide-thumbnails-strip');
    if (strip) strip.style.display = slideThumbnailsHidden ? 'none' : 'block';
}
window.toggleSlideThumbnails = toggleSlideThumbnails;

function renderSlideThumbnails(content) {
    const strip = document.getElementById('slide-thumbnails-strip');
    if (!strip) return;

    // Split on slide separators (--- on its own line)
    const slides = content.split(/\n---[ \t]*\n/).map(s => s.trim()).filter(Boolean);

    // Only show if there are 2+ slides and user hasn't hidden them
    if (slides.length < 2) {
        strip.style.display = 'none';
        updateSlidesSidebarButton(content);
        return;
    }

    if (slideThumbnailsHidden) {
        // Show a minimal re-show button instead of the full strip
        strip.style.display = 'block';
        strip.innerHTML = `<button class="slide-strip-close" onclick="toggleSlideThumbnails()" title="Show slide thumbnails" style="margin-top: 0;">▸ ${slides.length} slides</button>`;
        strip.style.padding = '2px 8px';
        strip.style.maxHeight = '24px';
        return;
    }
    strip.style.padding = '6px 8px';
    strip.style.maxHeight = '110px';

    strip.style.display = 'block';

    // Find which slide the cursor is in
    let activeSlide = 0;
    if (window.editor) {
        const cursorLine = window.editor.getPosition()?.lineNumber || 1;
        const lines = content.split('\n');
        let slideIdx = 0;
        for (let i = 0; i < lines.length && i < cursorLine; i++) {
            if (lines[i].match(/^---\s*$/) && i > 0) slideIdx++;
        }
        activeSlide = Math.min(slideIdx, slides.length - 1);
    }

    // Check if only the active slide changed (cursor moved) — skip full rebuild
    const contentHash = _quickHash(content);
    const activeOnly = contentHash === _lastThumbnailHash;
    _lastThumbnailHash = contentHash;

    if (activeOnly) {
        // Just update active class without rebuilding DOM
        strip.querySelectorAll('.slide-thumb').forEach(t => {
            const idx = parseInt(t.dataset.slideIndex);
            t.classList.toggle('active', idx === activeSlide);
        });
        const activeEl = strip.querySelector('.slide-thumb.active');
        if (activeEl) activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        return;
    }

    // Extract background image directive from slide markdown
    const extractSlideBg = (md) => {
        const match = md.match(/<!--\s*bg:\s*(.+?)\s*-->/i);
        if (!match) return null;
        let imgPath = match[1].trim();
        if (imgPath && !imgPath.startsWith('http') && !imgPath.startsWith('/') && !imgPath.startsWith('file://') && !imgPath.startsWith('data:')) {
            const baseDir = window.currentFileDirectory || window.appSettings?.workingDirectory;
            if (baseDir) imgPath = `file://${baseDir}/${imgPath}`;
        } else if (imgPath.startsWith('/')) {
            imgPath = `file://${imgPath}`;
        }
        return imgPath;
    };

    // Render thumbnail HTML with per-slide caching
    const renderHTML = (md, slideHash) => {
        if (_slideContentCache.has(slideHash)) return _slideContentCache.get(slideHash);
        const clean = md.replace(/```notes\s*\n[\s\S]*?\n```/g, '').replace(/<!--\s*bg:\s*.+?\s*-->\s*/gi, '').trim();
        let html;
        if (window.marked) {
            try { html = window.marked.parse(clean); } catch (e) { html = clean.replace(/\n/g, '<br>'); }
        } else {
            html = clean.replace(/\n/g, '<br>');
        }
        _slideContentCache.set(slideHash, html);
        // Keep cache bounded
        if (_slideContentCache.size > 200) {
            const first = _slideContentCache.keys().next().value;
            _slideContentCache.delete(first);
        }
        return html;
    };

    const closeBtn = `<button class="slide-strip-close" onclick="toggleSlideThumbnails()" title="Hide slide thumbnails">✕</button>`;

    // For large decks, use lazy rendering — create placeholder thumbs
    const LAZY_THRESHOLD = 15;
    const useLazy = slides.length > LAZY_THRESHOLD;

    strip.innerHTML = closeBtn + slides.map((slide, i) => {
        const slideHash = _quickHash(slide);
        const bgImage = extractSlideBg(slide);
        const bgStyle = bgImage ? `background-image: url('${bgImage}'); background-size: cover; background-position: center;` : '';
        // For lazy rendering, only render nearby slides initially
        const isNearby = !useLazy || Math.abs(i - activeSlide) <= 5;
        const html = isNearby ? renderHTML(slide, slideHash) : '';
        return `<div class="slide-thumb ${i === activeSlide ? 'active' : ''}" data-slide-index="${i}" data-slide-hash="${slideHash}" title="Slide ${i + 1}" style="${bgStyle}" ${!isNearby ? 'data-lazy="true"' : ''}>
            <div class="slide-thumb-content">${html}</div>
            <span class="slide-thumb-label">${i + 1}</span>
        </div>`;
    }).join('');

    // Set up IntersectionObserver for lazy thumbnails
    if (useLazy) {
        if (_thumbnailObserver) _thumbnailObserver.disconnect();
        _thumbnailObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const thumb = entry.target;
                    if (thumb.dataset.lazy === 'true') {
                        const idx = parseInt(thumb.dataset.slideIndex);
                        const slideHash = parseInt(thumb.dataset.slideHash);
                        const html = renderHTML(slides[idx], slideHash);
                        thumb.querySelector('.slide-thumb-content').innerHTML = html;
                        delete thumb.dataset.lazy;
                        _thumbnailObserver.unobserve(thumb);
                    }
                }
            });
        }, { root: strip, rootMargin: '200px' });

        strip.querySelectorAll('.slide-thumb[data-lazy="true"]').forEach(t => {
            _thumbnailObserver.observe(t);
        });
    }

    // Set up drag-and-drop reordering (also handles click-to-navigate)
    setupSlideDragAndDrop(strip, content);

    // Restore selected state for multi-select
    if (_slideSelectedIndices.size > 0) {
        strip.querySelectorAll('.slide-thumb').forEach(t => {
            if (_slideSelectedIndices.has(parseInt(t.dataset.slideIndex))) {
                t.classList.add('selected');
            }
        });
    }

    // Auto-scroll to active thumbnail
    const activeEl = strip.querySelector('.slide-thumb.active');
    if (activeEl) activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });

    // Update sidebar Slides button visibility
    updateSlidesSidebarButton(content);

    // If vertical slides pane is currently active, update it too
    if (window.currentStructureView === 'slides') {
        renderVerticalSlideThumbnails();
    }
}

function navigateToSlide(slideIndex, content) {
    if (!window.editor) return;
    const lines = content.split('\n');
    let slideIdx = 0;
    let targetLine = 1;
    for (let i = 0; i < lines.length; i++) {
        if (slideIdx === slideIndex) { targetLine = i + 1; break; }
        if (lines[i].match(/^---\s*$/) && i > 0) {
            slideIdx++;
            if (slideIdx === slideIndex) { targetLine = i + 2; break; }
        }
    }
    window.editor.revealLineInCenter(targetLine);
    window.editor.setPosition({ lineNumber: targetLine, column: 1 });
    window.editor.focus();
}

// --- Slide Drag-and-Drop Reordering ---
let _slideSelectedIndices = new Set(); // multi-select tracking
let _slideDragIndices = null; // indices being dragged

function reorderSlides(fromIndices, toIndex) {
    if (!window.editor) return;
    const content = window.editor.getValue();

    // Split preserving the separator pattern. We re-join with \n\n---\n\n.
    const slides = content.split(/\n---[ \t]*\n/);
    if (slides.length < 2) return;

    // Validate indices
    const fromSorted = [...fromIndices].sort((a, b) => a - b);
    if (fromSorted.some(i => i < 0 || i >= slides.length)) return;
    if (toIndex < 0 || toIndex > slides.length) return;

    // Extract the dragged slides (in their original order)
    const dragged = fromSorted.map(i => slides[i]);

    // Build the remaining slides (without the dragged ones)
    const remaining = slides.filter((_, i) => !fromIndices.has(i));

    // Adjust toIndex: for each dragged index before the target, the target shifts down by 1
    let adjustedTo = toIndex;
    for (const idx of fromSorted) {
        if (idx < toIndex) adjustedTo--;
    }
    adjustedTo = Math.max(0, Math.min(adjustedTo, remaining.length));

    // Insert dragged slides at the adjusted position
    remaining.splice(adjustedTo, 0, ...dragged);

    // Reconstruct the document
    const newContent = remaining.join('\n\n---\n\n');

    // Apply via pushEditOperations for proper undo support
    const model = window.editor.getModel();
    if (!model) return;
    const fullRange = model.getFullModelRange();
    model.pushEditOperations(
        [],
        [{ range: fullRange, text: newContent }],
        () => null
    );

    // Navigate to where the first dragged slide ended up
    _slideSelectedIndices.clear();
    navigateToSlide(adjustedTo, newContent);
}

function setupSlideDragAndDrop(strip, content) {
    const thumbs = strip.querySelectorAll('.slide-thumb');

    thumbs.forEach(thumb => {
        thumb.setAttribute('draggable', 'true');

        // Right-click context menu
        thumb.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const idx = parseInt(thumb.dataset.slideIndex);
            if (!_slideSelectedIndices.has(idx)) {
                _slideSelectedIndices.clear();
                thumbs.forEach(t => t.classList.remove('selected'));
                _slideSelectedIndices.add(idx);
                thumb.classList.add('selected');
            }
            showSlideContextMenu(e, new Set(_slideSelectedIndices), content);
        });

        // Multi-select on click with Ctrl/Cmd
        thumb.addEventListener('click', (e) => {
            const idx = parseInt(thumb.dataset.slideIndex);
            if (e.metaKey || e.ctrlKey) {
                e.preventDefault();
                if (_slideSelectedIndices.has(idx)) {
                    _slideSelectedIndices.delete(idx);
                    thumb.classList.remove('selected');
                } else {
                    _slideSelectedIndices.add(idx);
                    thumb.classList.add('selected');
                }
                return;
            }
            // Plain click — clear selection and navigate
            _slideSelectedIndices.clear();
            thumbs.forEach(t => t.classList.remove('selected'));
            navigateToSlide(idx, content);
        });

        thumb.addEventListener('dragstart', (e) => {
            const idx = parseInt(thumb.dataset.slideIndex);
            // If dragging a non-selected thumb, select only that one
            if (!_slideSelectedIndices.has(idx)) {
                _slideSelectedIndices.clear();
                thumbs.forEach(t => t.classList.remove('selected'));
            }
            _slideSelectedIndices.add(idx);

            _slideDragIndices = new Set(_slideSelectedIndices);

            // Visual feedback
            thumbs.forEach(t => {
                if (_slideDragIndices.has(parseInt(t.dataset.slideIndex))) {
                    t.classList.add('dragging');
                }
            });

            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', JSON.stringify([...sorted(_slideDragIndices)]));

            // Custom drag image showing count
            if (_slideDragIndices.size > 1) {
                const ghost = document.createElement('div');
                ghost.textContent = `${_slideDragIndices.size} slides`;
                ghost.style.cssText = 'position:fixed;top:-100px;padding:4px 10px;background:#ef4444;color:#fff;border-radius:4px;font-size:12px;white-space:nowrap;';
                document.body.appendChild(ghost);
                e.dataTransfer.setDragImage(ghost, 0, 0);
                requestAnimationFrame(() => ghost.remove());
            }
        });

        thumb.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';

            // Determine if dropping before or after based on mouse position
            const rect = thumb.getBoundingClientRect();
            const midX = rect.left + rect.width / 2;

            // Clear all drop indicators
            thumbs.forEach(t => { t.classList.remove('drop-before', 'drop-after'); });

            if (e.clientX < midX) {
                thumb.classList.add('drop-before');
            } else {
                thumb.classList.add('drop-after');
            }
        });

        thumb.addEventListener('dragleave', () => {
            thumb.classList.remove('drop-before', 'drop-after');
        });

        thumb.addEventListener('drop', (e) => {
            e.preventDefault();
            if (!_slideDragIndices || _slideDragIndices.size === 0) return;

            const targetIdx = parseInt(thumb.dataset.slideIndex);
            const rect = thumb.getBoundingClientRect();
            const midX = rect.left + rect.width / 2;
            const dropIndex = e.clientX < midX ? targetIdx : targetIdx + 1;

            // Don't move if dropping in the same position
            const dragSorted = [..._slideDragIndices].sort((a, b) => a - b);
            const isNoop = dragSorted.length === 1 && (dragSorted[0] === dropIndex || dragSorted[0] === dropIndex - 1);
            if (!isNoop) {
                reorderSlides(_slideDragIndices, dropIndex);
            }

            // Cleanup
            thumbs.forEach(t => {
                t.classList.remove('dragging', 'drop-before', 'drop-after', 'selected');
            });
            _slideDragIndices = null;
            _slideSelectedIndices.clear();
        });

        thumb.addEventListener('dragend', () => {
            thumbs.forEach(t => {
                t.classList.remove('dragging', 'drop-before', 'drop-after');
            });
            _slideDragIndices = null;
        });
    });
}

// Helper to sort a Set of numbers
function sorted(set) {
    return [...set].sort((a, b) => a - b);
}

// --- Vertical Slide Pane (Left Sidebar) ---

// Show/hide the Slides sidebar button based on whether the current file has slides
function updateSlidesSidebarButton(content) {
    const btn = document.getElementById('show-slides-btn');
    if (!btn) return;
    const slideCount = (content.match(/\n---[ \t]*\n/g) || []).length + 1;
    btn.style.display = slideCount >= 2 ? '' : 'none';
    const countEl = document.getElementById('slides-pane-count');
    if (countEl) countEl.textContent = slideCount >= 2 ? slideCount : '0';
}

function renderVerticalSlideThumbnails() {
    const paneList = document.getElementById('slides-pane-list');
    if (!paneList) return;
    if (!window.editor) return;
    const content = window.editor.getValue();
    const slides = content.split(/\n---[ \t]*\n/).map(s => s.trim()).filter(Boolean);
    if (slides.length < 2) {
        paneList.innerHTML = '<div style="padding: 12px; color: #999; font-size: 12px;">No slides detected. Use --- separators to create slides.</div>';
        return;
    }

    // Find active slide
    let activeSlide = 0;
    const cursorLine = window.editor.getPosition()?.lineNumber || 1;
    const lines = content.split('\n');
    let slideIdx = 0;
    for (let i = 0; i < lines.length && i < cursorLine; i++) {
        if (lines[i].match(/^---\s*$/) && i > 0) slideIdx++;
    }
    activeSlide = Math.min(slideIdx, slides.length - 1);

    const extractSlideBg = (md) => {
        const match = md.match(/<!--\s*bg:\s*(.+?)\s*-->/i);
        if (!match) return null;
        let imgPath = match[1].trim();
        if (imgPath && !imgPath.startsWith('http') && !imgPath.startsWith('/') && !imgPath.startsWith('file://') && !imgPath.startsWith('data:')) {
            const baseDir = window.currentFileDirectory || window.appSettings?.workingDirectory;
            if (baseDir) imgPath = `file://${baseDir}/${imgPath}`;
        } else if (imgPath.startsWith('/')) {
            imgPath = `file://${imgPath}`;
        }
        return imgPath;
    };

    const renderHTML = (md) => {
        const clean = md.replace(/```notes\s*\n[\s\S]*?\n```/g, '').replace(/<!--\s*bg:\s*.+?\s*-->\s*/gi, '').trim();
        if (window.marked) {
            try { return window.marked.parse(clean); } catch (e) { /* fall through */ }
        }
        return clean.replace(/\n/g, '<br>');
    };

    // Compute scale based on pane width
    const paneWidth = paneList.clientWidth - 16; // minus padding
    const sourceWidth = 864;
    const sourceHeight = 486;
    const scale = Math.max(0.1, paneWidth / sourceWidth);

    paneList.innerHTML = slides.map((slide, i) => {
        const html = renderHTML(slide);
        const bgImage = extractSlideBg(slide);
        const bgStyle = bgImage ? `background-image: url('${bgImage}'); background-size: cover; background-position: center;` : '';
        const thumbHeight = sourceHeight * scale;
        return `<div class="slide-thumb-vertical ${i === activeSlide ? 'active' : ''}" data-slide-index="${i}" title="Slide ${i + 1}" style="${bgStyle} height: ${thumbHeight}px;">
            <div class="slide-thumb-vertical-content" style="transform: scale(${scale}); width: ${sourceWidth}px; height: ${sourceHeight}px;">${html}</div>
            <span class="slide-thumb-vertical-label">${i + 1}</span>
        </div>`;
    }).join('');

    // Set up drag-and-drop for vertical thumbnails (reuse same logic)
    setupVerticalSlideDragAndDrop(paneList, content);

    // Scroll active into view
    const activeEl = paneList.querySelector('.slide-thumb-vertical.active');
    if (activeEl) activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function setupVerticalSlideDragAndDrop(container, content) {
    const thumbs = container.querySelectorAll('.slide-thumb-vertical');

    thumbs.forEach(thumb => {
        thumb.setAttribute('draggable', 'true');

        thumb.addEventListener('click', (e) => {
            const idx = parseInt(thumb.dataset.slideIndex);
            if (e.metaKey || e.ctrlKey) {
                e.preventDefault();
                if (_slideSelectedIndices.has(idx)) {
                    _slideSelectedIndices.delete(idx);
                    thumb.classList.remove('selected');
                } else {
                    _slideSelectedIndices.add(idx);
                    thumb.classList.add('selected');
                }
                return;
            }
            _slideSelectedIndices.clear();
            thumbs.forEach(t => t.classList.remove('selected'));
            navigateToSlide(idx, content);
        });

        // Right-click context menu
        thumb.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const idx = parseInt(thumb.dataset.slideIndex);
            // If right-clicking a non-selected thumb, select just that one
            if (!_slideSelectedIndices.has(idx)) {
                _slideSelectedIndices.clear();
                thumbs.forEach(t => t.classList.remove('selected'));
                _slideSelectedIndices.add(idx);
                thumb.classList.add('selected');
            }
            showSlideContextMenu(e, new Set(_slideSelectedIndices), content);
        });

        thumb.addEventListener('dragstart', (e) => {
            const idx = parseInt(thumb.dataset.slideIndex);
            if (!_slideSelectedIndices.has(idx)) {
                _slideSelectedIndices.clear();
                thumbs.forEach(t => t.classList.remove('selected'));
            }
            _slideSelectedIndices.add(idx);
            _slideDragIndices = new Set(_slideSelectedIndices);
            thumbs.forEach(t => {
                if (_slideDragIndices.has(parseInt(t.dataset.slideIndex))) t.classList.add('dragging');
            });
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', JSON.stringify([...sorted(_slideDragIndices)]));
        });

        thumb.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            const rect = thumb.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            thumbs.forEach(t => { t.classList.remove('drop-before', 'drop-after'); });
            if (e.clientY < midY) {
                thumb.classList.add('drop-before');
            } else {
                thumb.classList.add('drop-after');
            }
        });

        thumb.addEventListener('dragleave', () => {
            thumb.classList.remove('drop-before', 'drop-after');
        });

        thumb.addEventListener('drop', (e) => {
            e.preventDefault();
            if (!_slideDragIndices || _slideDragIndices.size === 0) return;
            const targetIdx = parseInt(thumb.dataset.slideIndex);
            const rect = thumb.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            const dropIndex = e.clientY < midY ? targetIdx : targetIdx + 1;
            const dragSorted = [..._slideDragIndices].sort((a, b) => a - b);
            const isNoop = dragSorted.length === 1 && (dragSorted[0] === dropIndex || dragSorted[0] === dropIndex - 1);
            if (!isNoop) reorderSlides(_slideDragIndices, dropIndex);
            thumbs.forEach(t => t.classList.remove('dragging', 'drop-before', 'drop-after', 'selected'));
            _slideDragIndices = null;
            _slideSelectedIndices.clear();
        });

        thumb.addEventListener('dragend', () => {
            thumbs.forEach(t => t.classList.remove('dragging', 'drop-before', 'drop-after'));
            _slideDragIndices = null;
        });
    });
}

// Also add right-click context menu to horizontal strip thumbnails
function addContextMenuToHorizontalThumbs(strip, content) {
    strip.querySelectorAll('.slide-thumb').forEach(thumb => {
        thumb.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const idx = parseInt(thumb.dataset.slideIndex);
            if (!_slideSelectedIndices.has(idx)) {
                _slideSelectedIndices.clear();
                strip.querySelectorAll('.slide-thumb').forEach(t => t.classList.remove('selected'));
                _slideSelectedIndices.add(idx);
                thumb.classList.add('selected');
            }
            showSlideContextMenu(e, new Set(_slideSelectedIndices), content);
        });
    });
}

// --- Slide Context Menu ---
let _slideClipboard = null; // { slides: [string], operation: 'copy'|'cut', sourceFile: string }

function showSlideContextMenu(event, selectedIndices, content) {
    // Remove existing menu
    const existing = document.querySelector('.slide-context-menu');
    if (existing) existing.remove();

    const slides = content.split(/\n---[ \t]*\n/);
    const selectedSlides = sorted(selectedIndices).map(i => slides[i]).filter(s => s !== undefined);
    const count = selectedSlides.length;
    const label = count === 1 ? 'Slide' : `${count} Slides`;

    const menu = document.createElement('div');
    menu.className = 'slide-context-menu';
    menu.style.cssText = `
        position: fixed;
        left: ${event.pageX}px;
        top: ${event.pageY}px;
        background: var(--surface, white);
        color: var(--text-color, #333);
        border: 1px solid var(--border-color, #ddd);
        border-radius: 4px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 13px;
        min-width: 180px;
        padding: 4px 0;
    `;

    const items = [
        { label: `Copy ${label}`, action: 'copy' },
        { label: `Cut ${label}`, action: 'cut' },
        { separator: true },
        { label: `Duplicate ${label}`, action: 'duplicate' },
        { label: `Delete ${label}`, action: 'delete' },
        { separator: true },
        { label: `Paste Slide(s) Before`, action: 'paste-before', disabled: !_slideClipboard },
        { label: `Paste Slide(s) After`, action: 'paste-after', disabled: !_slideClipboard },
        { separator: true },
        { label: `Copy to File...`, action: 'copy-to-file' },
        { label: `Move to File...`, action: 'move-to-file' },
    ];

    items.forEach(item => {
        if (item.separator) {
            const sep = document.createElement('div');
            sep.style.cssText = 'height: 1px; background: var(--border-color, #ddd); margin: 4px 0;';
            menu.appendChild(sep);
            return;
        }
        const el = document.createElement('div');
        el.textContent = item.label;
        el.style.cssText = `padding: 6px 16px; cursor: ${item.disabled ? 'default' : 'pointer'}; opacity: ${item.disabled ? '0.4' : '1'};`;
        if (!item.disabled) {
            el.addEventListener('mouseenter', () => { el.style.background = 'var(--primary-100, rgba(239,68,68,0.1))'; });
            el.addEventListener('mouseleave', () => { el.style.background = ''; });
            el.addEventListener('click', () => {
                menu.remove();
                handleSlideContextAction(item.action, selectedIndices, selectedSlides, content);
            });
        }
        menu.appendChild(el);
    });

    document.body.appendChild(menu);

    // Ensure menu stays within viewport
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = `${window.innerWidth - rect.width - 4}px`;
    if (rect.bottom > window.innerHeight) menu.style.top = `${window.innerHeight - rect.height - 4}px`;

    // Close on click outside
    const closeMenu = (e) => {
        if (!menu.contains(e.target)) {
            menu.remove();
            document.removeEventListener('mousedown', closeMenu);
        }
    };
    setTimeout(() => document.addEventListener('mousedown', closeMenu), 0);
}

async function handleSlideContextAction(action, selectedIndices, selectedSlides, content) {
    const sourceFile = window.currentFilePath || '';

    if (action === 'copy') {
        _slideClipboard = { slides: selectedSlides, operation: 'copy', sourceFile };
        showNotification(`Copied ${selectedSlides.length} slide(s) to clipboard`);

    } else if (action === 'cut') {
        _slideClipboard = { slides: selectedSlides, operation: 'cut', sourceFile };
        // Remove from editor
        deleteSlides(selectedIndices);
        showNotification(`Cut ${selectedSlides.length} slide(s)`);

    } else if (action === 'duplicate') {
        duplicateSlides(selectedIndices);

    } else if (action === 'delete') {
        deleteSlides(selectedIndices);

    } else if (action === 'paste-before' || action === 'paste-after') {
        if (!_slideClipboard) return;
        const targetIdx = action === 'paste-before'
            ? Math.min(...sorted(selectedIndices))
            : Math.max(...sorted(selectedIndices)) + 1;
        pasteSlides(targetIdx, _slideClipboard.slides);
        // If it was a cut, clear the clipboard
        if (_slideClipboard.operation === 'cut') _slideClipboard = null;

    } else if (action === 'copy-to-file' || action === 'move-to-file') {
        await copyOrMoveSlidesToFile(selectedIndices, selectedSlides, action === 'move-to-file');
    }
}

function deleteSlides(indices) {
    if (!window.editor) return;
    const content = window.editor.getValue();
    const slides = content.split(/\n---[ \t]*\n/);
    const remaining = slides.filter((_, i) => !indices.has(i));
    if (remaining.length === 0) return; // Don't delete all slides
    const model = window.editor.getModel();
    if (!model) return;
    model.pushEditOperations([], [{ range: model.getFullModelRange(), text: remaining.join('\n\n---\n\n') }], () => null);
}

function duplicateSlides(indices) {
    if (!window.editor) return;
    const content = window.editor.getValue();
    const slides = content.split(/\n---[ \t]*\n/);
    const fromSorted = [...indices].sort((a, b) => a - b);
    const dupes = fromSorted.map(i => slides[i]);
    // Insert duplicates right after the last selected slide
    const insertAfter = fromSorted[fromSorted.length - 1];
    const newSlides = [...slides];
    newSlides.splice(insertAfter + 1, 0, ...dupes);
    const model = window.editor.getModel();
    if (!model) return;
    model.pushEditOperations([], [{ range: model.getFullModelRange(), text: newSlides.join('\n\n---\n\n') }], () => null);
}

function pasteSlides(beforeIndex, slideTexts) {
    if (!window.editor) return;
    const content = window.editor.getValue();
    const slides = content.split(/\n---[ \t]*\n/);
    const idx = Math.max(0, Math.min(beforeIndex, slides.length));
    slides.splice(idx, 0, ...slideTexts);
    const model = window.editor.getModel();
    if (!model) return;
    model.pushEditOperations([], [{ range: model.getFullModelRange(), text: slides.join('\n\n---\n\n') }], () => null);
    navigateToSlide(idx, slides.join('\n\n---\n\n'));
}

async function copyOrMoveSlidesToFile(indices, slideTexts, isMove) {
    // Get list of markdown files
    let mdFiles = [];
    try {
        const result = await window.electronAPI.invoke('get-markdown-files');
        mdFiles = (result?.files || result || []).filter(f => f !== window.currentFilePath);
    } catch (err) {
        showNotification('Could not list markdown files', 'error');
        return;
    }

    if (mdFiles.length === 0) {
        showNotification('No other markdown files found', 'error');
        return;
    }

    // Show a simple file picker dialog
    const existing = document.querySelector('.slide-file-picker');
    if (existing) existing.remove();

    const picker = document.createElement('div');
    picker.className = 'slide-file-picker';
    picker.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: var(--surface, white);
        color: var(--text-color, #333);
        border: 1px solid var(--border-color, #ddd);
        border-radius: 8px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.2);
        z-index: 10001;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 13px;
        min-width: 300px;
        max-width: 500px;
        max-height: 400px;
        display: flex;
        flex-direction: column;
    `;

    const header = document.createElement('div');
    header.style.cssText = 'padding: 12px 16px; border-bottom: 1px solid var(--border-color, #ddd); font-weight: 600;';
    header.textContent = isMove ? 'Move Slide(s) to File' : 'Copy Slide(s) to File';
    picker.appendChild(header);

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Filter files...';
    searchInput.style.cssText = 'margin: 8px 16px; padding: 6px 8px; border: 1px solid var(--border-color, #ddd); border-radius: 4px; font-size: 12px;';
    picker.appendChild(searchInput);

    const listContainer = document.createElement('div');
    listContainer.style.cssText = 'flex: 1; overflow-y: auto; padding: 4px 0;';
    picker.appendChild(listContainer);

    const renderList = (filter) => {
        const filtered = filter
            ? mdFiles.filter(f => f.toLowerCase().includes(filter.toLowerCase()))
            : mdFiles;
        listContainer.innerHTML = '';
        filtered.forEach(f => {
            const item = document.createElement('div');
            const displayName = f.split('/').pop();
            const dirPath = f.split('/').slice(-2, -1)[0] || '';
            item.innerHTML = `<span style="font-weight:500">${displayName}</span> <span style="opacity:0.5;font-size:11px">${dirPath}</span>`;
            item.style.cssText = 'padding: 6px 16px; cursor: pointer;';
            item.addEventListener('mouseenter', () => { item.style.background = 'var(--primary-100, rgba(239,68,68,0.1))'; });
            item.addEventListener('mouseleave', () => { item.style.background = ''; });
            item.addEventListener('click', async () => {
                picker.remove();
                backdrop.remove();
                await appendSlidesToFile(f, slideTexts);
                if (isMove) deleteSlides(indices);
                showNotification(`${isMove ? 'Moved' : 'Copied'} ${slideTexts.length} slide(s) to ${displayName}`);
            });
            listContainer.appendChild(item);
        });
    };

    searchInput.addEventListener('input', () => renderList(searchInput.value));
    renderList('');

    const backdrop = document.createElement('div');
    backdrop.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:10000;background:rgba(0,0,0,0.3);';
    backdrop.addEventListener('click', () => { picker.remove(); backdrop.remove(); });

    document.body.appendChild(backdrop);
    document.body.appendChild(picker);
    searchInput.focus();
}

async function appendSlidesToFile(filePath, slideTexts) {
    try {
        const result = await window.electronAPI.invoke('read-file-content-only', filePath);
        if (!result?.success) {
            showNotification(`Failed to read ${filePath}`, 'error');
            return;
        }
        let existingContent = result.content || '';
        // Append slides with separator
        const slidesBlock = slideTexts.join('\n\n---\n\n');
        const newContent = existingContent.trim()
            ? existingContent.trimEnd() + '\n\n---\n\n' + slidesBlock
            : slidesBlock;
        await window.electronAPI.invoke('write-file', { filePath, content: newContent });
    } catch (err) {
        showNotification(`Error writing to file: ${err.message}`, 'error');
    }
}

// --- Footnote Management Panel ---
function updateFootnotesPanel() {
    const list = document.getElementById('footnotes-list');
    const stats = document.getElementById('footnotes-stats');
    if (!list) return;

    const content = window.editor ? window.editor.getValue() : '';
    if (!content) {
        list.innerHTML = '<div style="color: #999; padding: 12px; text-align: center;">No document open</div>';
        if (stats) stats.textContent = '';
        return;
    }

    const lines = content.split('\n');

    // Parse footnote definitions
    const definitions = new Map();
    lines.forEach((line, i) => {
        const match = line.match(/^\[\^([^\]]+)\]:\s*(.+)$/);
        if (match) {
            definitions.set(match[1], { content: match[2].trim(), line: i + 1 });
        }
    });

    // Parse footnote references
    const references = new Map(); // id -> [lineNumbers]
    lines.forEach((line, i) => {
        // Skip definition lines
        if (line.match(/^\[\^([^\]]+)\]:/)) return;
        const refRegex = /\[\^([^\]]+)\]/g;
        let match;
        while ((match = refRegex.exec(line)) !== null) {
            const id = match[1];
            if (!references.has(id)) references.set(id, []);
            references.get(id).push(i + 1);
        }
    });

    // Merge into combined list
    const allIds = new Set([...definitions.keys(), ...references.keys()]);
    const footnotes = Array.from(allIds).map(id => ({
        id,
        definition: definitions.get(id),
        refLines: references.get(id) || [],
        hasDefinition: definitions.has(id),
        hasReferences: references.has(id)
    })).sort((a, b) => {
        // Sort by definition line number, then by ID
        const lineA = a.definition?.line || Infinity;
        const lineB = b.definition?.line || Infinity;
        return lineA - lineB || a.id.localeCompare(b.id);
    });

    if (stats) stats.textContent = `${footnotes.length} footnote${footnotes.length !== 1 ? 's' : ''}`;

    if (footnotes.length === 0) {
        list.innerHTML = '<div style="color: #999; padding: 12px; text-align: center;">No footnotes found.<br><small>Use [^id] for references and [^id]: text for definitions.</small></div>';
        return;
    }

    list.innerHTML = footnotes.map(fn => {
        const defLine = fn.definition ? `line ${fn.definition.line}` : '<span style="color:#d73a49;">undefined</span>';
        const refCount = fn.refLines.length;
        const preview = fn.definition ? fn.definition.content.substring(0, 80) + (fn.definition.content.length > 80 ? '...' : '') : '';
        const warnings = [];
        if (!fn.hasDefinition) warnings.push('No definition');
        if (!fn.hasReferences) warnings.push('Unused');

        return `<div class="footnote-item" style="padding: 8px; border-bottom: 1px solid #eee; cursor: pointer;" data-fn-line="${fn.definition?.line || fn.refLines[0] || 1}">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <strong style="color: #d73a49; font-size: 12px;">[^${fn.id}]</strong>
                <span style="font-size: 10px; color: #999;">${defLine} · ${refCount} ref${refCount !== 1 ? 's' : ''}</span>
            </div>
            ${preview ? `<div style="font-size: 11px; color: #555; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${preview}</div>` : ''}
            ${warnings.length ? `<div style="font-size: 10px; color: #e67e22; margin-top: 2px;">${warnings.join(' · ')}</div>` : ''}
        </div>`;
    }).join('');

    // Click to navigate
    list.querySelectorAll('.footnote-item').forEach(item => {
        item.addEventListener('click', () => {
            const line = parseInt(item.dataset.fnLine);
            if (window.editor && line) {
                window.editor.revealLineInCenter(line);
                window.editor.setPosition({ lineNumber: line, column: 1 });
                window.editor.focus();
            }
        });
    });
}
window.updateFootnotesPanel = updateFootnotesPanel;

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
    }
}

// Initialize pane toggles
document.addEventListener('DOMContentLoaded', function() {
    const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');
    const toggleEditorBtn = document.getElementById('toggle-editor-btn');
    const togglePreviewBtn = document.getElementById('toggle-preview-btn');

    if (toggleSidebarBtn) {
        toggleSidebarBtn.addEventListener('click', () => {
            toggleSidebar();
        });
    }

    if (toggleEditorBtn) {
        toggleEditorBtn.addEventListener('click', () => {
            toggleEditor();
        });
    }

    if (togglePreviewBtn) {
        togglePreviewBtn.addEventListener('click', () => {
            togglePreview();
        });
    }
    
    // Wait for MathJax to be ready
    if (window.MathJax && window.MathJax.startup) {
        window.MathJax.startup.promise = window.MathJax.startup.promise.then(() => {
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
                    editor.setValue(result.updatedContent);
                    lastSavedContent = result.updatedContent;
                } else {
                    lastSavedContent = content;
                }

                window.hasUnsavedChanges = false;
                updateUnsavedIndicator(false);
                showNotification('File saved successfully', 'success');

                // Sync saved state to active tab
                if (window.tabManager) {
                    window.tabManager.syncActiveTabDirty(false, lastSavedContent);
                }

                // Refresh git status after save
                updateGitStatusIndicator();

                // Update file tree and current file info if this was a new file save
                if (result.filePath && !window.currentFilePath) {
                    window.currentFilePath = result.filePath;
                    window.editorFileName = result.filePath; // Also update editorFileName
                    updateBreadcrumb(result.filePath);
                    renderFileTree();
                }
            } else if (result.code === 'FILE_MODIFIED_EXTERNALLY') {
                const overwriteConfirmed = window.confirm(
                    'This file changed on disk since you opened it. Overwrite anyway? A backup will be created first.'
                );
                if (!overwriteConfirmed) {
                    showNotification('Save canceled to avoid overwriting external changes', 'warning');
                    return;
                }

                const forcedResult = await window.electronAPI.invoke('perform-save', content, {
                    force: true,
                    expectedMtimeMs: result.currentMtimeMs
                });

                if (forcedResult.success) {
                    lastSavedContent = content;
                    window.hasUnsavedChanges = false;
                    updateUnsavedIndicator(false);
                    showNotification('File saved (forced overwrite)', 'success');
                    if (window.tabManager) {
                        window.tabManager.syncActiveTabDirty(false, lastSavedContent);
                    }
                    updateGitStatusIndicator();
                } else {
                    showNotification(`Save failed: ${forcedResult.error}`, 'error');
                }
            } else {
                console.error('[saveFile] Save failed:', result.error);
                showNotification(`Save failed: ${result.error}`, 'error');
            }
        } else {
            // Save new file - show save dialog.
            // Prefer the folder the user has active in the file tree (last clicked
            // folder, or the parent of the last opened file). Falls back to the
            // workspace root only when nothing has been clicked yet.
            let defaultDirectory = window.selectedFolderPath
                || window.appSettings?.workingDirectory;
            if (!defaultDirectory) {
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
                const trimmedContent = content.trim();
                const shouldAddHeading = trimmedContent.length === 0 || 
                                       (trimmedContent.length < 50 && !trimmedContent.includes('---') && !trimmedContent.startsWith('#'));
                
                if (shouldAddHeading) {
                    const updatedContent = addH1HeadingIfNeeded(content, fileName);
                    
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
                    lastSavedContent = content;
                }
                
                window.hasUnsavedChanges = false;
                updateUnsavedIndicator(false);
                showNotification('File saved successfully', 'success');
                
                // Update current file in electron
                window.electronAPI.invoke('set-current-file', result.filePath);

                // If saving from an untitled tab, re-key it to the real path instead of
                // opening a brand-new tab (which would leave an orphan untitled tab).
                if (window.tabManager && window.tabManager.activeTabPath
                    && window.isUntitledPath && window.isUntitledPath(window.tabManager.activeTabPath)) {
                    window.tabManager.rekeyTab(window.tabManager.activeTabPath, result.filePath);
                    // activateTab to sync globals (currentFilePath, breadcrumb, etc.)
                    window.tabManager.activateTab(result.filePath);
                } else if (window.openFileInEditor) {
                    // Ensure the saved path is the active opened file/tab (not just a scratch buffer).
                    await window.openFileInEditor(result.filePath, lastSavedContent || content);
                }
                
                // Update file tree and highlight the new file
                renderFileTree();
                highlightCurrentFileInTree(result.filePath);

                // Also refresh via IPC to ensure file tree is completely up to date
                try {
                    await window.electronAPI.invoke('refresh-file-tree');
                } catch (error) {
                    console.warn('[renderer.js] Failed to refresh file tree via IPC:', error);
                }
                
                // Update breadcrumb display
                updateBreadcrumb(result.filePath);
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
    
    // Clean the filename for use as a heading
    const cleanFileName = fileName
        .replace(/[-_]/g, ' ') // Replace dashes and underscores with spaces
        .replace(/\b\w/g, l => l.toUpperCase()); // Capitalize each word
    
    
    // Check if content is empty or very short (just whitespace)
    const trimmedContent = content.trim();
    
    if (trimmedContent.length === 0) {
        // Empty file - add H1 heading
        const result = `# ${cleanFileName}\n\n`;
        return result;
    }
    
    // Check if content already starts with an H1 heading
    const lines = content.split('\n');
    const firstNonEmptyLine = lines.find(line => line.trim().length > 0);
    
    if (firstNonEmptyLine && firstNonEmptyLine.trim().startsWith('# ')) {
        // Already has H1 heading - don't add another
        return content;
    }
    
    // Check if content starts with slide markers (---) - presentation format
    if (firstNonEmptyLine && firstNonEmptyLine.trim() === '---') {
        // This is presentation content with slide markers
        // Add H1 as the first slide content, not before the markers
        
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
        return result;
    }
    
    // Add H1 heading at the beginning (normal content)
    const result = `# ${cleanFileName}\n\n${content}`;
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
        
        // Force save-as by always showing save dialog.
        // Prefer the folder the user has active in the file tree, then the
        // current file's parent (so Save As next to the original is one click),
        // and only finally fall back to the workspace root.
        const currentFileDir = window.currentFilePath
            ? window.currentFilePath.substring(0, window.currentFilePath.lastIndexOf('/'))
            : null;
        let defaultDirectory = window.selectedFolderPath
            || currentFileDir
            || window.appSettings?.workingDirectory;
        if (!defaultDirectory) {
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
            const trimmedContent = content.trim();
            const shouldAddHeading = trimmedContent.length === 0 || 
                                   (trimmedContent.length < 50 && !trimmedContent.includes('---') && !trimmedContent.startsWith('#'));
            
            if (shouldAddHeading) {
                const updatedContent = addH1HeadingIfNeeded(content, fileName);
                
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
                lastSavedContent = content;
            }
            
            window.hasUnsavedChanges = false;
            updateUnsavedIndicator(false);
            showNotification('File saved successfully', 'success');

            // Refresh file tree to show new file
            if (window.renderFileTree) {
                window.renderFileTree();
                if (window.highlightCurrentFileInTree) {
                    window.highlightCurrentFileInTree(result.filePath);
                }
            }

            // Also refresh via IPC to ensure file tree is completely up to date
            try {
                await window.electronAPI.invoke('refresh-file-tree');
            } catch (error) {
                console.warn('[renderer.js] Failed to refresh file tree via IPC:', error);
            }

            // Ensure the saved path is the active opened file/tab (not just a scratch buffer).
            if (window.openFileInEditor) {
                await window.openFileInEditor(result.filePath, lastSavedContent || content);
            }

            // Update breadcrumb display
            updateBreadcrumb(result.filePath);
        } else {
            showNotification(`Save failed: ${result.error || 'Unknown error'}`, 'error');
            console.error('[renderer.js] Manual save-as failed:', result.error);
        }
    } catch (error) {
        console.error('[renderer.js] Manual save-as error:', error);
        showNotification('Save-as error: ' + error.message, 'error');
    }
}

// --- Git Publish Dialog ---

async function showGitPublishDialog(folderPath, gitInfo) {
    const isDarkMode = document.body.classList.contains('dark-mode');
    const bgColor = isDarkMode ? '#252526' : 'white';
    const textColor = isDarkMode ? '#d4d4d4' : '#333';
    const secondaryColor = isDarkMode ? '#9d9d9d' : '#666';
    const borderColor = isDarkMode ? '#4a4a4a' : '#ddd';
    const inputBg = isDarkMode ? '#3c3c3c' : 'white';

    // Fetch git status
    let changes = [];
    try {
        const statusResult = await window.electronAPI.invoke('git-status', {
            repoRoot: gitInfo.repoRoot,
            subfolder: gitInfo.relativePath
        });
        if (statusResult.success) {
            changes = statusResult.changes;
        }
    } catch (error) {
        console.error('[showGitPublishDialog] Error fetching status:', error);
    }

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
            background: ${bgColor};
            color: ${textColor};
            border-radius: 8px;
            padding: 24px;
            min-width: 500px;
            max-width: 600px;
            max-height: 80vh;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;

        const folderName = folderPath.split('/').pop();
        const repoName = gitInfo.repoRoot.split('/').pop();

        // Build changes list HTML
        let changesHtml = '';
        if (changes.length === 0) {
            changesHtml = `<p style="color: ${secondaryColor}; font-style: italic; margin: 8px 0;">No changes to commit</p>`;
        } else {
            changesHtml = `
                <div style="max-height: 150px; overflow-y: auto; border: 1px solid ${borderColor}; border-radius: 4px; margin: 8px 0;">
                    ${changes.map(c => {
                        const statusColor = c.status === 'added' ? '#22c55e' :
                                           c.status === 'deleted' ? '#ef4444' :
                                           c.status === 'untracked' ? '#3b82f6' : '#f59e0b';
                        return `<div style="padding: 6px 10px; border-bottom: 1px solid ${borderColor}; font-family: monospace; font-size: 12px;">
                            <span style="color: ${statusColor}; font-weight: 500;">[${c.status}]</span>
                            <span style="margin-left: 8px;">${c.file}</span>
                        </div>`;
                    }).join('')}
                </div>
            `;
        }

        dialog.innerHTML = `
            <h3 style="margin: 0 0 8px 0; font-size: 18px;">Publish to Git</h3>
            <p style="margin: 0 0 16px 0; color: ${secondaryColor}; font-size: 13px;">
                <strong>${folderName}</strong> in <em>${repoName}</em>
            </p>

            <div style="margin-bottom: 16px;">
                <label style="display: block; margin-bottom: 6px; font-weight: 500; font-size: 13px;">
                    Changes (${changes.length} file${changes.length !== 1 ? 's' : ''}):
                </label>
                ${changesHtml}
            </div>

            <div style="margin-bottom: 20px;">
                <label style="display: block; margin-bottom: 6px; font-weight: 500; font-size: 13px;">
                    Commit message:
                </label>
                <textarea id="git-commit-message" style="
                    width: 100%;
                    height: 80px;
                    padding: 10px 12px;
                    border: 1px solid ${borderColor};
                    border-radius: 4px;
                    font-size: 14px;
                    font-family: monospace;
                    box-sizing: border-box;
                    resize: vertical;
                    background: ${inputBg};
                    color: ${textColor};
                " placeholder="Enter commit message..." ${changes.length === 0 ? 'disabled' : ''}></textarea>
            </div>

            <div style="text-align: right;">
                <button id="git-cancel" class="btn btn-ghost" style="margin-right: 10px;">Cancel</button>
                <button id="git-publish" class="btn btn-primary" ${changes.length === 0 ? 'disabled' : ''}>
                    Commit & Push
                </button>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        // Focus textarea
        const textarea = dialog.querySelector('#git-commit-message');
        if (changes.length > 0) {
            textarea.focus();
        }

        // Handle events
        const handlePublish = async () => {
            const message = textarea.value.trim();
            if (!message) {
                textarea.style.borderColor = '#ef4444';
                textarea.focus();
                return;
            }

            // Disable buttons and show loading state
            const publishBtn = dialog.querySelector('#git-publish');
            const cancelBtn = dialog.querySelector('#git-cancel');
            publishBtn.disabled = true;
            publishBtn.textContent = 'Publishing...';
            cancelBtn.disabled = true;

            document.body.removeChild(overlay);
            resolve({ message, gitInfo });
        };

        const handleCancel = () => {
            document.body.removeChild(overlay);
            resolve(null);
        };

        dialog.querySelector('#git-publish').onclick = handlePublish;
        dialog.querySelector('#git-cancel').onclick = handleCancel;

        // Handle Ctrl+Enter to publish
        textarea.onkeydown = (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handlePublish();
            } else if (e.key === 'Escape') {
                handleCancel();
            }
        };

        // Close on overlay click
        overlay.onclick = (e) => {
            if (e.target === overlay) {
                handleCancel();
            }
        };
    });
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
                <button id="prompt-cancel" class="btn btn-sm btn-ghost" style="margin-right: 10px;">Cancel</button>
                <button id="prompt-ok" class="btn btn-sm btn-primary">OK</button>
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
            
            // Reload the modified original file content into the editor
            if (result.updatedOriginalContent) {
                editor.setValue(result.updatedOriginalContent);
                lastSavedContent = result.updatedOriginalContent;
                window.hasUnsavedChanges = false;
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

// File tree keyboard navigation extracted to modules/file-tree-nav.js
window.showNotification = showNotification;
window.notificationsEnabled = notificationsEnabled;
window.aiNotificationsEnabled = aiNotificationsEnabled;
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
    // Close the notification
    const notification = document.getElementById('notification');
    if (notification) {
        notification.style.display = 'none';
    }
}

function copyAshToChat(response, sender) {
    try {
        // Try to add both the prompt and response to the chat if the chat system is available
        if (window.addMessage && typeof window.addMessage === 'function') {
            // Store the last explicit prompt that was sent to Ash
            if (window.lastExplicitAshPrompt) {
                // Add the user's prompt first
                window.addMessage(window.lastExplicitAshPrompt, 'You');
                // Add Ash's response
                window.addMessage(response, sender);
                showNotification('Conversation copied to chat', 'success');
            } else {
                // Just add the response if we don't have the prompt
                window.addMessage(response, sender);
                showNotification('Response copied to chat', 'success');
            }
        } else {
            console.warn('[renderer.js] Chat system not available, falling back to clipboard');
            // Fallback to copying to clipboard
            const fullConversation = window.lastExplicitAshPrompt 
                ? `**You:** ${window.lastExplicitAshPrompt}\n\n**${sender}:** ${response}`
                : `**${sender}:** ${response}`;
            
            navigator.clipboard.writeText(fullConversation).then(() => {
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
                    margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid var(--border, #eee); 
                }
                .ai-persona { font-weight: 600; color: var(--text, #333); }
                .ai-feedback-type { 
                    font-size: 12px; color: var(--text-muted, #666); background: var(--surface-variant, #f5f5f5); 
                    padding: 2px 6px; border-radius: 3px; 
                }
                .ai-feedback-close { 
                    background: none; border: none; font-size: 18px; 
                    cursor: pointer; color: #999; 
                }
                .ai-feedback-close:hover { color: #666; }
                .ai-feedback-message { 
                    margin-bottom: 12px; line-height: 1.4; color: var(--text, #444); 
                }
                .ai-feedback-footer { 
                    display: flex; justify-content: space-between; 
                    font-size: 11px; color: var(--text-muted, #888); margin-bottom: 12px; 
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
                    background: var(--surface-hover, #f0f0f0); color: var(--text, #333); border: 1px solid var(--border, #ddd); 
                }
                .ai-feedback-thanks-btn:hover { background: var(--surface-active, #e0e0e0); }
                .ai-feedback-save-btn { background: var(--primary, #007acc); border: 1px solid var(--primary, #007acc); color: var(--text-on-primary, #fff); }
                .ai-feedback-save-btn:hover { background: var(--primary-hover, #005a9e); border-color: var(--primary-hover, #005a9e); }
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

// === Keyboard Shortcuts Help Functions ===

// Show keyboard shortcuts help dialog
function showKeyboardShortcuts() {
    const overlay = document.getElementById('keyboard-shortcuts-overlay');
    const content = document.getElementById('keyboard-shortcuts-content');

    if (!overlay || !content) return;

    // Detect platform for keyboard shortcuts display
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const cmdKey = isMac ? '⌘' : 'Ctrl';
    const optKey = isMac ? '⌥' : 'Alt';

    // Define all keyboard shortcuts organized by category
    const shortcuts = {
        'File Operations': [
            { description: 'Save Document', keys: [cmdKey, 'S'] },
            { description: 'Open Command Palette', keys: [cmdKey, 'Shift', 'P'] }
        ],
        'Editing': [
            { description: 'Duplicate Line/Selection', keys: [cmdKey, 'Shift', 'D'] },
            { description: 'Bold', keys: [cmdKey, 'B'] },
            { description: 'Italic', keys: [cmdKey, 'I'] },
            { description: 'Inline Code', keys: [cmdKey, '`'] },
            { description: 'Insert Link', keys: [cmdKey, 'K'] },
            { description: 'Comment', keys: [cmdKey, '/'] },
            { description: 'Undo', keys: [cmdKey, 'Z'] },
            { description: 'Redo', keys: [cmdKey, 'Shift', 'Z'] }
        ],
        'Selection': [
            { description: 'Select Whole Lines Up', keys: ['Shift', optKey, '↑'] },
            { description: 'Select Whole Lines Down', keys: ['Shift', optKey, '↓'] },
            { description: 'Select All', keys: [cmdKey, 'A'] }
        ],
        'Code Folding': [
            { description: 'Fold Current Section', keys: [cmdKey, 'Shift', '['] },
            { description: 'Unfold Current Section', keys: [cmdKey, 'Shift', ']'] },
            { description: 'Fold All Sections', keys: [cmdKey, 'K', cmdKey, '0'] },
            { description: 'Unfold All Sections', keys: [cmdKey, 'K', cmdKey, 'J'] }
        ],
        'Navigation': [
            { description: 'Navigate Back', keys: [cmdKey, optKey, '←'] },
            { description: 'Navigate Forward', keys: [cmdKey, optKey, '→'] },
            { description: 'Go to Line', keys: [cmdKey, 'G'] }
        ],
        'Search': [
            { description: 'Find', keys: [cmdKey, 'F'] },
            { description: 'Global Search', keys: [cmdKey, 'Shift', 'F'] },
            { description: 'Replace', keys: [cmdKey, 'H'] }
        ],
        'View': [
            { description: 'Toggle Presentation Mode', keys: [cmdKey, 'Shift', 'M'] },
            { description: 'Capture Citation from Clipboard', keys: [cmdKey, 'Shift', 'Y'] }
        ],
        'AI Features': [
            { description: 'Invoke Ash (AI Writing)', keys: [cmdKey, 'Shift', '\''] }
        ]
    };

    // Build HTML for shortcuts
    let html = '';
    for (const [category, items] of Object.entries(shortcuts)) {
        html += `<div class="shortcuts-section">`;
        html += `<h4>${category}</h4>`;

        for (const item of items) {
            html += `<div class="shortcut-item">`;
            html += `<span class="shortcut-description">${item.description}</span>`;
            html += `<div class="shortcut-keys">`;

            for (const key of item.keys) {
                html += `<span class="shortcut-key">${key}</span>`;
            }

            html += `</div>`;
            html += `</div>`;
        }

        html += `</div>`;
    }

    content.innerHTML = html;
    overlay.style.display = 'flex';
}

// Hide keyboard shortcuts help dialog
function hideKeyboardShortcuts() {
    const overlay = document.getElementById('keyboard-shortcuts-overlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

// Make functions globally accessible
window.showKeyboardShortcuts = showKeyboardShortcuts;
window.hideKeyboardShortcuts = hideKeyboardShortcuts;

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
        const workingDir = window.currentFileDirectory || window.currentDirectory || window.appSettings?.workingDirectory || '.';
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
    const existingViewer = document.getElementById('image-viewer-container');
    if (existingViewer && typeof window.restoreEditorAfterImageViewer === 'function') {
        window.restoreEditorAfterImageViewer({
            documentRef: document,
            switchToMode: window.switchToMode,
            exitPreviewOnlyMode: exitPDFOnlyMode,
            refreshEditorLayout: window.refreshEditorLayout,
            editorRef: typeof editor !== 'undefined' ? editor : null
        });
    }

    // Get the main content area
    const mainContent = document.getElementById('main-content');
    if (!mainContent) {
        console.error('[ImageViewer] Main content area not found');
        return;
    }

    // Hide the panes container instead of replacing content
    const panesContainer = document.getElementById('panes-container');
    const modeSwitcher = document.getElementById('mode-switcher');
    if (panesContainer) {
        panesContainer.style.display = 'none';
    }
    if (modeSwitcher) {
        modeSwitcher.style.display = 'none';
    }

    // Create image viewer container
    const viewerContainer = document.createElement('div');
    viewerContainer.className = 'image-viewer-container';
    viewerContainer.id = 'image-viewer-container';
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
    closeBtn.className = 'btn btn-sm btn-primary';
    
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
        document.removeEventListener('keydown', keyHandler);

        if (typeof window.restoreEditorAfterImageViewer === 'function') {
            window.restoreEditorAfterImageViewer({
                documentRef: document,
                switchToMode: window.switchToMode,
                exitPreviewOnlyMode: exitPDFOnlyMode,
                refreshEditorLayout: window.refreshEditorLayout,
                editorRef: typeof editor !== 'undefined' ? editor : null
            });
            return;
        }

        const viewerToRemove = document.getElementById('image-viewer-container');
        if (viewerToRemove) {
            viewerToRemove.remove();
        }
    };

    closeBtn.addEventListener('click', closeViewer);

    // Close on Escape key
    const keyHandler = (e) => {
        if (e.key === 'Escape') {
            closeViewer();
        }
    };
    document.addEventListener('keydown', keyHandler);

    // Append image viewer to main content (don't replace)
    mainContent.appendChild(viewerContainer);
}

// Make image viewer available globally
window.showImageViewer = showImageViewer;
