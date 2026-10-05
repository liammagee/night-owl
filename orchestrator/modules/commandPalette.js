// === Command Palette Module ===
// Provides a command palette interface for quick access to all application functions
// Supports keyboard navigation, fuzzy search, and keyboard shortcuts

(function () {
'use strict';

// --- Command Registry ---
let commandRegistry = new Map();
let commandPalette = null;
let selectedIndex = 0;
let initialized = false;
let previousFocus = null;

// --- Command Registration ---
function registerCommand(id, label, action, shortcut = null) {
    commandRegistry.set(id, {
        id,
        label,
        action,
        shortcut,
        searchText: label.toLowerCase()
    });
}

async function openFileFromPalette() {
    const selection = await window.electronAPI.invoke('dialog-open-file');
    if (!selection?.success) {
        if (selection?.error) throw new Error(selection.error);
        return;
    }
    const result = await window.electronAPI.invoke('read-file', selection.filePath);
    if (!result?.success) throw new Error(result?.error || 'Could not read file');
    await window.openFileInEditor(result.filePath, result.content);
}

async function openFolderFromPalette() {
    const result = await window.electronAPI.invoke('change-working-directory');
    if (!result?.success && result?.error) throw new Error(result.error);
}

function showSidebarView(view) {
    if (document.getElementById('left-sidebar')?.style.display === 'none') window.toggleSidebar();
    window.switchStructureView(view);
}

function selectBoundaryFile(index) {
    window.updateFileTreeItems();
    window.selectFileTreeItem(index);
}

// --- Initialize Command Palette ---
function initializeCommandPalette() {
    if (initialized) return;
    initialized = true;
    // File Operations
    registerCommand('file.new', 'File: New File', () => window.newFile(), 'Cmd+N');
    registerCommand('file.open', 'File: Open File', openFileFromPalette, 'Cmd+O');
    registerCommand('file.save', 'File: Save', () => window.saveFile(), 'Cmd+S');
    registerCommand('file.saveAs', 'File: Save As...', () => window.saveAsFile(), 'Cmd+Shift+S');
    registerCommand('file.openFolder', 'File: Open Folder', openFolderFromPalette);
    registerCommand('file.newFolder', 'File: New Folder', () => window.showNewFolderModal());
    
    // Edit Operations
    registerCommand('edit.find', 'Edit: Find and Replace', () => window.showFindReplaceDialog(), 'Cmd+F');
    registerCommand('edit.findGlobal', 'Edit: Global Search', () => window.showPane('search'), 'Cmd+Shift+F');
    registerCommand('edit.undo', 'Edit: Undo', () => window.editor?.trigger('source', 'undo'), 'Cmd+Z');
    registerCommand('edit.redo', 'Edit: Redo', () => window.editor?.trigger('source', 'redo'), 'Cmd+Shift+Z');
    
    // View Operations
    registerCommand('view.togglePreview', 'View: Toggle Preview', () => window.togglePreview(), 'Cmd+Shift+V');
    registerCommand('view.toggleStructure', 'View: Show Structure Panel', () => showSidebarView('structure'));
    registerCommand('view.toggleFiles', 'View: Show File Explorer', () => showSidebarView('file'));
    registerCommand('view.editorMode', 'View: Editor Mode', () => window.switchToMode('editor'), 'Cmd+1');
    registerCommand('view.presentationTab', 'View: Presentation Mode', () => window.switchToMode('presentation'), 'Cmd+2');
    registerCommand('view.networkMode', 'View: Network Mode', () => window.switchToMode('network'), 'Cmd+3');
    registerCommand('view.circleMode', 'View: Circle Mode', () => window.switchToMode('circle'), 'Cmd+4');
    registerCommand('view.libraryMode', 'View: Library Maze Mode', () => window.switchToMode('library'), 'Cmd+5');
    registerCommand('view.minimap.toggle', 'View: Toggle Minimap', () => {
        if (window.editor && window.editor.updateOptions) {
            const currentOptions = window.editor.getRawOptions();
            const minimapEnabled = currentOptions.minimap && currentOptions.minimap.enabled;
            window.editor.updateOptions({
                minimap: { enabled: !minimapEnabled }
            });
        }
    });
    registerCommand('view.wordWrap.toggle', 'View: Toggle Word Wrap', () => {
        if (window.editor && window.editor.updateOptions) {
            const currentOptions = window.editor.getRawOptions();
            const wrapOn = currentOptions.wordWrap !== 'off';
            const wordWrap = wrapOn ? 'off' : 'on';
            if (window.NightOwlEditorLayout?.applyWordWrap) {
                window.NightOwlEditorLayout.applyWordWrap(window.editor, wordWrap);
            } else {
                window.editor.updateOptions({ wordWrap });
            }
            if (window.showNotification) {
                window.showNotification(`Word wrap ${wrapOn ? 'off' : 'on'}`, 'info');
            }
        }
    }, 'Alt+Z');
    registerCommand('view.zenMode', 'View: Toggle Zen Mode (Distraction-Free)', () => {
        window.toggleZenMode();
    }, 'Cmd+Shift+Enter');

    // Formatting
    registerCommand('format.bold', 'Format: Bold', () => window.formatText('**', '**', 'bold text'), 'Cmd+B');
    registerCommand('format.italic', 'Format: Italic', () => window.formatText('*', '*', 'italic text'), 'Cmd+I');
    registerCommand('format.code', 'Format: Inline Code', () => window.formatText('`', '`', 'code'), 'Cmd+`');
    registerCommand('format.strikethrough', 'Format: Strikethrough', () => window.formatText('~~', '~~', 'strikethrough'));
    registerCommand('format.heading1', 'Format: Heading 1', () => window.formatHeading(1));
    registerCommand('format.heading2', 'Format: Heading 2', () => window.formatHeading(2));
    registerCommand('format.heading3', 'Format: Heading 3', () => window.formatHeading(3));
    registerCommand('format.bulletList', 'Format: Bullet List', () => window.formatList('-'));
    registerCommand('format.numberedList', 'Format: Numbered List', () => window.formatList('1.'));
    registerCommand('format.insertLink', 'Format: Insert Link', () => window.insertLink(), 'Cmd+K');
    registerCommand('format.insertImage', 'Format: Insert Image', () => window.insertImage());
    registerCommand('format.blockquote', 'Format: Blockquote', () => window.formatBlockquote());
    registerCommand('format.inlineMath', 'Format: Inline Math ($...$)', async () => await window.formatText('$', '$', 'math'));
    registerCommand('format.displayMath', 'Format: Display Math ($$...$$)', async () => await window.formatDisplayMath());
    registerCommand('format.table', 'Format: Insert Table', () => window.insertTable());
    registerCommand('format.slideMarkers', 'Format: Add Slide Markers', async () => await window.addSlideMarkersToParagraphs());
    registerCommand('format.removeSlideMarkers', 'Format: Remove Slide Markers', async () => await window.removeAllSlideMarkers());
    
    // Annotations
    registerCommand('annotation.comment', 'Annotation: Insert Comment', async () => await window.insertCommentAnnotation());
    registerCommand('annotation.highlight', 'Annotation: Insert Highlight', async () => await window.insertHighlightAnnotation());
    registerCommand('annotation.block', 'Annotation: Insert Block', async () => await window.insertBlockAnnotation());
    
    // Navigation
    registerCommand('nav.back', 'Navigate: Back', () => window.navigateBack());
    registerCommand('nav.forward', 'Navigate: Forward', () => window.navigateForward());
    registerCommand('nav.gotoLine', 'Navigate: Go to Line', () => window.editor?.getAction('editor.action.gotoLine')?.run(), 'Ctrl+G');
    registerCommand('nav.fileUp', 'Navigate: Previous File', () => window.moveFileSelection(-1), '↑');
    registerCommand('nav.fileDown', 'Navigate: Next File', () => window.moveFileSelection(1), '↓');
    registerCommand('nav.firstFile', 'Navigate: First File', () => selectBoundaryFile(0), 'Home');
    registerCommand('nav.lastFile', 'Navigate: Last File', () => selectBoundaryFile(-1), 'End');
    registerCommand('nav.openSelectedFile', 'Navigate: Open Selected File', () => window.openSelectedFile(), 'Enter');
    
    // Folding
    registerCommand('fold.all', 'Fold: Fold All', () => window.foldAll());
    registerCommand('fold.unfoldAll', 'Fold: Unfold All', () => window.unfoldAll());
    registerCommand('fold.current', 'Fold: Fold Current', () => window.foldCurrent());
    registerCommand('fold.unfoldCurrent', 'Fold: Unfold Current', () => window.unfoldCurrent());
    
    // Export
    registerCommand('export.pdf', 'Export: PDF', () => window.exportToPDF());
    registerCommand('export.pdfWithRefs', 'Export: PDF with References', () => window.exportToPDFWithReferences());
    registerCommand('export.html', 'Export: HTML', () => window.exportToHTML());
    registerCommand('export.htmlWithRefs', 'Export: HTML with References', () => window.exportToHTMLWithReferences());
    registerCommand('export.word', 'Export: Word (.docx)', () => window.exportToWord());
    registerCommand('export.wordWithRefs', 'Export: Word with References', () => window.exportToWordWithReferences());
    registerCommand('export.powerpoint', 'Export: PowerPoint', () => window.exportToPowerPoint());
    registerCommand('export.accessible-html', 'Export: Accessible HTML', () => window.exportToAccessibleHTML());
    
    // AI Operations
    registerCommand('ai.chat', 'Assistant: Show Terminal', () => window.showPane('chat'));
    registerCommand('terminal.toggle', 'Terminal: Toggle Integrated Terminal', () => window.terminalPanel.toggle(), 'Ctrl+`');
    registerCommand('terminal.shell', 'Terminal: Spawn Interactive Shell', () => {
        window.terminalPanel.show();
        return window.terminalPanel.spawnShell();
    });
    registerCommand('ai.todoSuggestions', 'AI: Get TODO Suggestions', () => {
        const gamification = window.gamificationInstance;
        if (gamification && gamification.todoGamification) {
            gamification.todoGamification.generateAISuggestionsNow();
        } else {
            console.warn('[Command Palette] TODO gamification not available');
            if (window.showNotification) {
                window.showNotification('TODO gamification not initialized. Please open a TODO file first.', 'warning');
            }
        }
    });
    
    // Inline AI completions
    registerCommand('ai.inlineCompletions', 'AI: Toggle Inline Ghost Text Completions', () => window.toggleInlineAICompletions());

    // Table of Contents
    registerCommand('toc.insert', 'Table of Contents: Insert ToC', async () => await window.insertTableOfContents());
    registerCommand('toc.remove', 'Table of Contents: Remove ToC', async () => await window.removeTableOfContents());
    
    // Gamification
    registerCommand('gamification.toggle', 'Gamification: Toggle Panel', () => {
        const gamificationPanel = document.getElementById('gamification-menu');
        if (gamificationPanel) {
            if (window.gamificationSystem && window.gamificationSystem.toggleMenu) {
                window.gamificationSystem.toggleMenu();
            }
        }
    });
    registerCommand('gamification.startWriting', 'Gamification: Start Writing Session', () => {
        if (window.gamificationSystem && window.gamificationSystem.startWritingSession) {
            window.gamificationSystem.startWritingSession();
        }
    });
    registerCommand('gamification.endWriting', 'Gamification: End Writing Session', () => {
        if (window.gamificationSystem && window.gamificationSystem.endWritingSession) {
            window.gamificationSystem.endWritingSession();
        }
    });
    registerCommand('gamification.showStats', 'Gamification: Show Statistics', () => {
        if (window.gamificationSystem && window.gamificationSystem.showStatsModal) {
            window.gamificationSystem.showStatsModal();
        }
    });
    registerCommand('gamification.customizeGoals', 'Gamification: Customize Goals', () => {
        if (window.gamificationSystem && window.gamificationSystem.showGoalsModal) {
            window.gamificationSystem.showGoalsModal();
        }
    });
    
    // Settings
    registerCommand('settings.open', 'Settings: Open Preferences', () => window.openSettingsDialog(), 'Cmd+,');
    registerCommand('settings.theme.toggle', 'Settings: Toggle Light/Dark Theme', () => {
        window.techneThemeManager.applyTheme(document.body.classList.contains('dark-mode') ? 'light' : 'dark');
    });
    registerCommand('settings.linkPreview.toggle', 'Settings: Toggle Link Previews', async () => await window.toggleLinkPreview());
    
    // Speaker Notes
    registerCommand('speaker.toggle', 'Speaker Notes: Show View', () => window.showPane('speaker-notes'));
    registerCommand('speaker.add', 'Speaker Notes: Add Note', () => window.insertSpeakerNotesTemplate());
    
    console.log(`[CommandPalette] Registered ${commandRegistry.size} commands`);
    
    // Set up keyboard shortcut to show command palette
    // Use capture phase to ensure this runs before other handlers
    document.addEventListener('keydown', (e) => {
        if (e.defaultPrevented || e.isComposing || e.repeat || e.altKey) return;
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
            e.preventDefault();
            e.stopPropagation();
            showCommandPalette();
        }
    }, true); // Use capture phase
    document.getElementById('command-palette-btn')?.addEventListener('click', showCommandPalette);
}

// --- Command Palette UI ---
function showCommandPalette() {
    initializeCommandPalette();
    if (commandPalette) {
        commandPalette.querySelector('.command-palette-input')?.focus();
        return;
    }
    previousFocus = document.activeElement;
    
    // Create command palette overlay
    commandPalette = document.createElement('div');
    commandPalette.className = 'command-palette-overlay';
    commandPalette.innerHTML = `
        <div class="command-palette">
            <div class="command-palette-input-container">
                <input type="text" class="command-palette-input" placeholder="Type a command..." autocomplete="off" spellcheck="false">
                <div class="command-palette-shortcut">Ctrl+Shift+P</div>
            </div>
            <div class="command-palette-results" id="command-results"></div>
        </div>
    `;
    
    document.body.appendChild(commandPalette);
    
    const input = commandPalette.querySelector('.command-palette-input');
    const results = commandPalette.querySelector('.command-palette-results');
    
    // Focus synchronously: a delayed focus can steal focus from a command dialog.
    input.focus();
    
    // Show all commands initially
    selectedIndex = 0;
    updateCommandResults('', results);
    
    // Handle input changes
    input.addEventListener('input', (e) => {
        selectedIndex = 0; // Reset selection when search changes
        updateCommandResults(e.target.value, results);
    });
    
    // Handle keyboard navigation
    input.addEventListener('keydown', async (e) => {
        if (e.isComposing) return;
        const items = results.querySelectorAll('.command-item');
        
        switch (e.key) {
            case 'Escape':
                e.preventDefault();
                e.stopPropagation();
                hideCommandPalette();
                break;
                
            case 'ArrowDown':
                e.preventDefault();
                e.stopPropagation();
                selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
                updateSelection(items, selectedIndex);
                break;
                
            case 'ArrowUp':
                e.preventDefault();
                e.stopPropagation();
                selectedIndex = Math.max(selectedIndex - 1, 0);
                updateSelection(items, selectedIndex);
                break;
                
            case 'Enter':
                e.preventDefault();
                e.stopPropagation();
                if (e.repeat || !commandPalette) return;
                const selectedItem = items[selectedIndex];
                // Hide before execution so command-owned dialogs keep their focus.
                hideCommandPalette();
                if (selectedItem) {
                    await executeCommand(selectedItem.dataset.commandId);
                }
                break;
        }
    });
    
    // Handle click outside to close
    commandPalette.addEventListener('click', (e) => {
        if (e.target === commandPalette) {
            hideCommandPalette();
        }
    });
}

function hideCommandPalette() {
    if (!commandPalette) return;
    commandPalette.remove();
    commandPalette = null;
    const focusTarget = previousFocus;
    previousFocus = null;
    if (focusTarget?.isConnected && focusTarget !== document.body) {
        focusTarget.focus();
    } else {
        window.editor?.focus?.();
    }
}

function updateCommandResults(query, resultsContainer) {
    const filteredCommands = Array.from(commandRegistry.values())
        .filter(cmd => cmd.searchText.includes(query.toLowerCase()))
        .slice(0, 50);

    resultsContainer.replaceChildren();
    if (!filteredCommands.length) {
        const empty = document.createElement('div');
        empty.className = 'command-palette-no-results';
        empty.textContent = 'No matching commands';
        resultsContainer.appendChild(empty);
        return;
    }
    filteredCommands.forEach((command, index) => {
        const item = document.createElement('div');
        item.className = `command-item${index === 0 ? ' selected' : ''}`;
        item.dataset.commandId = command.id;
        const label = document.createElement('div');
        label.className = 'command-label';
        appendHighlightedText(label, command.label, query);
        item.appendChild(label);
        if (command.shortcut) {
            const shortcut = document.createElement('div');
            shortcut.className = 'command-shortcut';
            shortcut.textContent = command.shortcut;
            item.appendChild(shortcut);
        }
        item.addEventListener('click', async () => {
            if (!commandPalette) return;
            hideCommandPalette();
            await executeCommand(command.id);
        });
        resultsContainer.appendChild(item);
    });
}

function appendHighlightedText(container, text, query) {
    const index = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
    if (index < 0) {
        container.textContent = text;
        return;
    }
    container.appendChild(document.createTextNode(text.slice(0, index)));
    const mark = document.createElement('mark');
    mark.textContent = text.slice(index, index + query.length);
    container.appendChild(mark);
    container.appendChild(document.createTextNode(text.slice(index + query.length)));
}

function updateSelection(items, selectedIndex) {
    items.forEach((item, index) => {
        item.classList.toggle('selected', index === selectedIndex);
    });
    
    // Scroll selected item into view
    const selectedItem = items[selectedIndex];
    if (selectedItem) {
        selectedItem.scrollIntoView({ 
            block: 'nearest', 
            behavior: 'smooth',
            inline: 'nearest'
        });
    }
}

async function executeCommand(commandId) {
    const command = commandRegistry.get(commandId);
    if (command) {
        console.log(`[CommandPalette] Executing command: ${command.label}`);
        try {
            await command.action();
        } catch (error) {
            console.error(`[CommandPalette] Error executing command ${commandId}:`, error);
            if (window.showNotification) {
                window.showNotification(`Error executing command: ${command.label}`, 'error');
            }
        }
    }
}

// --- Export Functions for Global Access ---
window.showCommandPalette = showCommandPalette;
window.hideCommandPalette = hideCommandPalette;
window.initializeCommandPalette = initializeCommandPalette;
window.registerCommand = registerCommand;

})();
