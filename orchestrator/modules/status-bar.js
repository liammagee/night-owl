// Status Bar Module
// Extracted from renderer.js — handles word/line/char counts, cursor position,
// Kanban stats display, speaker notes extraction, and git status indicator.

function countWordsAndLines(text) {
    let words = 0;
    let lines = text.length > 0 ? 1 : 0;
    let inWord = false;

    for (let i = 0; i < text.length; i += 1) {
        const ch = text[i];
        if (ch === '\n') {
            lines += 1;
        }
        if (
            ch === ' ' ||
            ch === '\n' ||
            ch === '\r' ||
            ch === '\t' ||
            ch === '\f' ||
            ch === '\v'
        ) {
            inWord = false;
        } else if (!inWord) {
            inWord = true;
            words += 1;
        }
    }

    return { words, lines: lines || 1 };
}

function updateStatusBar(content) {
    const wordCountEl = document.getElementById('word-count');
    const charCountEl = document.getElementById('char-count');
    const lineCountEl = document.getElementById('line-count');
    const cursorPosEl = document.getElementById('cursor-position');

    if (!content) content = '';

    // Check if there's selected text in the Monaco editor
    let selectedText = '';
    let isSelection = false;

    const editor = window.editor;
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

    const { words: wordCount, lines: lineCount } = countWordsAndLines(contentToAnalyze);
    const charCount = contentToAnalyze.length;

    // Update status bar elements with consistent styling
    if (wordCountEl) {
        wordCountEl.textContent = isSelection
            ? `Source sel: ${wordCount} words`
            : `Source: ${wordCount} words`;
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

function getVisiblePreviewText(previewElement) {
    if (!previewElement) return '';

    const clone = previewElement.cloneNode(true);
    clone.querySelectorAll('script, style, noscript, .speaker-notes-placeholder, [aria-hidden="true"]').forEach(el => {
        el.remove();
    });

    return clone.innerText || clone.textContent || '';
}

function updatePreviewWordCount(previewElement = document.getElementById('preview-content')) {
    const previewWordCountEl = document.getElementById('preview-word-count');
    if (!previewWordCountEl) return;

    const previewText = getVisiblePreviewText(previewElement)
        .replace(/\s+/g, ' ')
        .trim();
    const { words } = countWordsAndLines(previewText);

    previewWordCountEl.textContent = `Preview: ${words} words`;
    previewWordCountEl.title = 'Words in the rendered preview text';
}

function updatePreviewWordCountFromText(text = '') {
    const previewWordCountEl = document.getElementById('preview-word-count');
    if (!previewWordCountEl) return;

    const previewText = String(text || '')
        .replace(/\s+/g, ' ')
        .trim();
    const { words } = countWordsAndLines(previewText);

    previewWordCountEl.textContent = `Preview: ${words} words`;
    previewWordCountEl.title = 'Words in the rendered preview text';
}

function updateStatusBarWithKanban(totalTasks, doneTasks) {
    const wordCountEl = document.getElementById('word-count');
    const previewWordCountEl = document.getElementById('preview-word-count');
    const charCountEl = document.getElementById('char-count');
    const lineCountEl = document.getElementById('line-count');
    const cursorPosEl = document.getElementById('cursor-position');

    // Calculate progress
    const inProgressTasks = totalTasks - doneTasks;
    const progressPercent = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

    // Update status bar elements with Kanban stats
    if (wordCountEl) wordCountEl.textContent = `📋 Total Tasks: ${totalTasks}`;
    if (previewWordCountEl) previewWordCountEl.textContent = '';
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
    window.currentSpeakerNotes = extractedNotes;

    return processedContent;
}

// --- Git Status Indicator ---
let gitStatusCache = {
    repoRoot: null,
    branch: null,
    status: null,
    lastCheck: 0
};

async function getRuntimeWorkingDirectory() {
    if (window.electronAPI?.invoke) {
        try {
            const workingDirectory = await window.electronAPI.invoke('get-working-directory');
            if (workingDirectory) return workingDirectory;
        } catch (error) {
            console.warn('[GitStatus] Could not resolve runtime working directory:', error);
        }
    }
    return window.appSettings?.workingDirectory;
}

async function updateGitStatusIndicator() {
    const indicator = document.getElementById('git-status-indicator');
    if (!indicator || !window.electronAPI) return;

    const workingDir = await getRuntimeWorkingDirectory();
    if (!workingDir) {
        indicator.style.display = 'none';
        return;
    }

    try {
        // Check if working directory is in a git repo
        const repoResult = await window.electronAPI.invoke('git-find-repo', workingDir);
        if (!repoResult.success) {
            indicator.style.display = 'none';
            gitStatusCache.repoRoot = null;
            return;
        }

        const repoRoot = repoResult.repoRoot;
        gitStatusCache.repoRoot = repoRoot;

        // Get branch name
        const branchResult = await window.electronAPI.invoke('git-get-branch', repoRoot);
        const branch = branchResult.success ? branchResult.branch : 'unknown';
        gitStatusCache.branch = branch;

        // Get status summary
        const statusResult = await window.electronAPI.invoke('git-status-summary', repoRoot);

        if (statusResult.success) {
            gitStatusCache.status = statusResult;
            gitStatusCache.lastCheck = Date.now();

            // Build indicator text
            let statusText = `⎇ ${branch}`;
            const parts = [];

            if (statusResult.staged > 0) {
                parts.push(`+${statusResult.staged}`);
            }
            if (statusResult.modified > 0) {
                parts.push(`~${statusResult.modified}`);
            }
            if (statusResult.untracked > 0) {
                parts.push(`?${statusResult.untracked}`);
            }
            if (statusResult.ahead > 0) {
                parts.push(`↑${statusResult.ahead}`);
            }

            if (parts.length > 0) {
                statusText += ` [${parts.join(' ')}]`;
            } else if (statusResult.clean) {
                statusText += ' ✓';
            }

            indicator.textContent = statusText;
            indicator.style.display = 'inline';

            // Color based on state
            if (statusResult.clean) {
                indicator.style.color = '#22c55e'; // green
            } else if (statusResult.staged > 0) {
                indicator.style.color = '#f59e0b'; // amber - staged changes
            } else {
                indicator.style.color = '#6366f1'; // indigo - has changes
            }

            // Update tooltip
            let tooltip = `Branch: ${branch}`;
            if (statusResult.staged > 0) tooltip += `\nStaged: ${statusResult.staged}`;
            if (statusResult.modified > 0) tooltip += `\nModified: ${statusResult.modified}`;
            if (statusResult.untracked > 0) tooltip += `\nUntracked: ${statusResult.untracked}`;
            if (statusResult.ahead > 0) tooltip += `\nUnpushed commits: ${statusResult.ahead}`;
            if (statusResult.clean) tooltip += `\n✓ Working tree clean`;
            tooltip += `\n\nClick to open Source Control`;
            indicator.title = tooltip;
        } else {
            indicator.style.display = 'none';
        }
    } catch (error) {
        console.error('[Git] Error updating status indicator:', error);
        indicator.style.display = 'none';
    }
}

// Initialize git status indicator click handler
function initGitStatusIndicator() {
    const indicator = document.getElementById('git-status-indicator');
    if (!indicator) return;

    indicator.addEventListener('click', () => {
        // Open the git panel in the sidebar
        if (typeof switchStructureView === 'function') {
            switchStructureView('git');
        }
    });

    // Initial check
    updateGitStatusIndicator();

    // Refresh every 30 seconds
    setInterval(updateGitStatusIndicator, 30000);
}

// Export to global scope
window.countWordsAndLines = countWordsAndLines;
window.updateStatusBar = updateStatusBar;
window.updatePreviewWordCount = updatePreviewWordCount;
window.updatePreviewWordCountFromText = updatePreviewWordCountFromText;
window.updateStatusBarWithKanban = updateStatusBarWithKanban;
window.processSpeakerNotes = processSpeakerNotes;
window.gitStatusCache = gitStatusCache;
window.updateGitStatusIndicator = updateGitStatusIndicator;
window.initGitStatusIndicator = initGitStatusIndicator;
