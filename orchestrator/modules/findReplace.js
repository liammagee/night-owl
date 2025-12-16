// === Find & Replace Module ===
// Handles in-editor find and replace functionality including:
// - Find text within the current document
// - Replace text with various options (case sensitivity, regex, whole word)
// - Navigation through search results
// - Highlight search matches

// --- Find & Replace Variables ---
let currentSearchResults = [];
let currentSearchIndex = -1;
let currentDecorations = [];

// --- Find & Replace Functions ---
function showFindReplaceDialog(showReplace = false) {
    const findReplaceDialog = document.getElementById('find-replace-dialog');
    const replaceInput = document.getElementById('replace-input');
    const findInput = document.getElementById('find-input');
    
    if (!findReplaceDialog || !findInput) return;
    
    findReplaceDialog.classList.remove('hidden');
    
    // Show/hide replace field
    const replaceField = replaceInput?.closest('.find-replace-field');
    if (replaceField) {
        if (showReplace) {
            replaceField.style.display = 'block';
        } else {
            replaceField.style.display = 'none';
        }
    }
    
    // Focus find input and select current selection if any
    findInput.focus();
    
    if (window.editor && window.editor.getModel()) {
        const selection = window.editor.getSelection();
        if (selection && !selection.isEmpty()) {
            const selectedText = window.editor.getModel().getValueInRange(selection);
            findInput.value = selectedText;
        }
    }
}

function hideFindReplaceDialog() {
    const findReplaceDialog = document.getElementById('find-replace-dialog');
    if (!findReplaceDialog) return;
    
    findReplaceDialog.classList.add('hidden');
    clearSearchHighlights();
    // Return focus to editor
    if (window.editor) {
        window.editor.focus();
    }
}

function buildSearchQuery() {
    const findInput = document.getElementById('find-input');
    const caseSensitive = document.getElementById('case-sensitive');
    const regexMode = document.getElementById('regex-mode');
    const wholeWord = document.getElementById('whole-word');
    
    if (!findInput) return null;
    
    const query = findInput.value;
    if (!query) return null;
    
    let flags = 'g';
    if (!caseSensitive?.checked) {
        flags += 'i';
    }
    
    let pattern = query;
    if (regexMode?.checked) {
        try {
            return new RegExp(pattern, flags);
        } catch (e) {
            console.warn('Invalid regex pattern:', pattern);
            return null;
        }
    } else {
        // Escape special regex characters for literal search
        pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        if (wholeWord?.checked) {
            pattern = '\\b' + pattern + '\\b';
        }
        
        return new RegExp(pattern, flags);
    }
}

function performSearch() {
    if (!window.editor || !window.editor.getModel()) {
        return;
    }

    const regex = buildSearchQuery();
    if (!regex) {
        clearSearchHighlights();
        updateSearchStatus('');
        return;
    }

    const model = window.editor.getModel();
    const isRegexMode = document.getElementById('regex-mode')?.checked || false;
    const isCaseSensitive = document.getElementById('case-sensitive')?.checked || false;
    const isWholeWord = document.getElementById('whole-word')?.checked || false;

    // Monaco findMatches signature:
    // findMatches(searchString, searchOnlyEditableRange, isRegex, matchCase, wordSeparators, captureMatches)
    const matches = model.findMatches(
        regex.source,           // searchString (pattern)
        false,                  // searchOnlyEditableRange
        isRegexMode,            // isRegex
        isCaseSensitive,        // matchCase
        isWholeWord ? null : null, // wordSeparators (null = use default)
        true                    // captureMatches
    );

    currentSearchResults = matches;
    currentSearchIndex = -1;

    if (matches.length > 0) {
        highlightSearchResults(matches);
        updateSearchStatus(`${matches.length} match${matches.length === 1 ? '' : 'es'}`);

        // Navigate to first match
        findNext();
    } else {
        clearSearchHighlights();
        updateSearchStatus('No matches');
    }
}

function findNext() {
    if (currentSearchResults.length === 0) return;

    currentSearchIndex = (currentSearchIndex + 1) % currentSearchResults.length;
    const match = currentSearchResults[currentSearchIndex];

    // Navigate to the match
    window.editor.setSelection(match.range);
    window.editor.revealLineInCenter(match.range.startLineNumber);

    // Update highlight to show current match
    updateCurrentHighlight();

    updateSearchStatus(`${currentSearchIndex + 1} of ${currentSearchResults.length}`);
}

function findPrevious() {
    if (currentSearchResults.length === 0) return;

    currentSearchIndex = currentSearchIndex <= 0 ?
        currentSearchResults.length - 1 : currentSearchIndex - 1;
    const match = currentSearchResults[currentSearchIndex];

    // Navigate to the match
    window.editor.setSelection(match.range);
    window.editor.revealLineInCenter(match.range.startLineNumber);

    // Update highlight to show current match
    updateCurrentHighlight();

    updateSearchStatus(`${currentSearchIndex + 1} of ${currentSearchResults.length}`);
}

function replaceNext() {
    const replaceInput = document.getElementById('replace-input');
    if (!replaceInput || currentSearchResults.length === 0) return;

    // If no match is currently selected, select the first one
    if (currentSearchIndex < 0) {
        findNext();
        return;
    }

    if (currentSearchIndex < currentSearchResults.length) {
        const match = currentSearchResults[currentSearchIndex];
        const replaceText = replaceInput.value;

        // Perform the replacement
        window.editor.executeEdits('replace', [{
            range: match.range,
            text: replaceText
        }]);

        // Mark document as modified
        if (window.markDocumentModified) {
            window.markDocumentModified();
        }

        // Update preview if available
        if (window.updatePreviewAndStructure) {
            window.updatePreviewAndStructure(window.editor.getValue());
        }

        // Refresh search to update positions and move to next match
        setTimeout(() => {
            performSearch();
            // After refresh, the index will be reset, so we stay at current position
        }, 10);
    }
}

function replaceAll() {
    const replaceInput = document.getElementById('replace-input');
    if (!replaceInput || currentSearchResults.length === 0) return;

    const replaceText = replaceInput.value;
    const replacedCount = currentSearchResults.length;

    // Create edits in reverse order to preserve positions
    const edits = currentSearchResults
        .slice()
        .reverse()
        .map(match => ({
            range: match.range,
            text: replaceText
        }));

    // Perform all replacements
    window.editor.executeEdits('replace-all', edits);

    // Mark document as modified
    if (window.markDocumentModified) {
        window.markDocumentModified();
    }

    // Update preview if available
    if (window.updatePreviewAndStructure) {
        window.updatePreviewAndStructure(window.editor.getValue());
    }

    updateSearchStatus(`Replaced ${replacedCount} match${replacedCount === 1 ? '' : 'es'}`);

    // Clear search results
    clearSearchHighlights();
    currentSearchResults = [];
    currentSearchIndex = -1;
}

function highlightSearchResults(matches) {
    if (!window.editor) return;

    const decorations = matches.map((match, index) => ({
        range: match.range,
        options: {
            className: index === currentSearchIndex ? 'search-highlight-current' : 'search-highlight',
            stickiness: 1 // monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
        }
    }));

    // Clear previous decorations and add new ones
    currentDecorations = window.editor.deltaDecorations(currentDecorations, decorations);
}

function updateCurrentHighlight() {
    // Update decorations to reflect current selection
    if (currentSearchResults.length > 0) {
        highlightSearchResults(currentSearchResults);
    }
}

function clearSearchHighlights() {
    if (window.editor && currentDecorations.length > 0) {
        currentDecorations = window.editor.deltaDecorations(currentDecorations, []);
    }
}

function updateSearchStatus(message) {
    const searchStatus = document.getElementById('find-replace-stats');
    if (searchStatus) {
        searchStatus.textContent = message;
    }
}

// --- Initialize Find & Replace ---
function initializeFindReplace() {
    const findInput = document.getElementById('find-input');
    const replaceInput = document.getElementById('replace-input');
    const findNextBtn = document.getElementById('find-next');
    const findPrevBtn = document.getElementById('find-previous');
    const replaceBtn = document.getElementById('replace-current');
    const replaceAllBtn = document.getElementById('replace-all');
    const findReplaceClose = document.getElementById('find-replace-close');
    
    // Event listeners
    if (findInput) {
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
    }
    
    if (replaceInput) {
        replaceInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (e.ctrlKey || e.metaKey) {
                    replaceAll();
                } else {
                    replaceNext();
                }
            } else if (e.key === 'Escape') {
                hideFindReplaceDialog();
            }
        });
    }
    
    if (findNextBtn) findNextBtn.addEventListener('click', findNext);
    if (findPrevBtn) findPrevBtn.addEventListener('click', findPrevious);
    if (replaceBtn) replaceBtn.addEventListener('click', replaceNext);
    if (replaceAllBtn) replaceAllBtn.addEventListener('click', replaceAll);
    if (findReplaceClose) findReplaceClose.addEventListener('click', hideFindReplaceDialog);
    
    // Search option checkboxes
    const caseSensitive = document.getElementById('case-sensitive');
    const regexMode = document.getElementById('regex-mode');
    const wholeWord = document.getElementById('whole-word');
    
    if (caseSensitive) caseSensitive.addEventListener('change', performSearch);
    if (regexMode) regexMode.addEventListener('change', performSearch);
    if (wholeWord) wholeWord.addEventListener('change', performSearch);
}

// --- Export Functions for Global Access ---
window.showFindReplaceDialog = showFindReplaceDialog;
window.hideFindReplaceDialog = hideFindReplaceDialog;
window.initializeFindReplace = initializeFindReplace;
window.performSearch = performSearch;
window.findNext = findNext;
window.findPrevious = findPrevious;
window.replaceNext = replaceNext;
window.replaceAll = replaceAll;

// --- Auto-initialize on DOMContentLoaded ---
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeFindReplace);
} else {
    // DOM already loaded
    initializeFindReplace();
}