// === Search Module ===
// Handles all search functionality including:
// - Global search across files
// - Search result display and navigation
// - Search options and filters
// - Global replace functionality

// --- Global Search Variables ---
let globalSearchResults = [];
let searchInProgress = false;

// Get search elements
const showSearchBtn = document.getElementById('show-search-btn');
const searchPane = document.getElementById('search-pane');
const globalSearchInput = document.getElementById('global-search-input');
const globalSearchBtn = document.getElementById('global-search-btn');
const searchCaseSensitive = document.getElementById('search-case-sensitive');
const searchRegex = document.getElementById('search-regex');
const searchWholeWord = document.getElementById('search-whole-word');
const searchFilePattern = document.getElementById('search-file-pattern');
const searchResults = document.getElementById('search-results');
const searchResultsCount = document.getElementById('search-results-count');
const clearSearchResultsBtn = document.getElementById('clear-search-results');

// Get search execute button
const globalSearchExecuteBtn = document.getElementById('global-search-execute');

// Get replace elements
const globalReplaceInput = document.getElementById('global-replace-input');
const globalReplaceExecuteBtn = document.getElementById('global-replace-execute');
const globalReplacePreviewBtn = document.getElementById('global-replace-preview');

// --- Initialize Search Functionality ---
function initializeGlobalSearch() {
    if (showSearchBtn) {
        showSearchBtn.addEventListener('click', () => {
            showRightPane('search');
        });
    }
    
    if (globalSearchBtn) {
        globalSearchBtn.addEventListener('click', performGlobalSearch);
    }
    
    if (globalSearchExecuteBtn) {
        globalSearchExecuteBtn.addEventListener('click', performGlobalSearch);
    }
    
    if (globalSearchInput) {
        globalSearchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                performGlobalSearch();
            }
        });
    }
    
    // Replace functionality event handlers
    if (globalReplaceExecuteBtn) {
        globalReplaceExecuteBtn.addEventListener('click', () => {
            performGlobalReplace(false); // false = execute replacement
        });
    }
    
    if (globalReplacePreviewBtn) {
        globalReplacePreviewBtn.addEventListener('click', () => {
            performGlobalReplace(true); // true = preview only
        });
    }
    
    if (globalReplaceInput) {
        globalReplaceInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                performGlobalReplace(false); // Ctrl+Enter to execute
            }
        });
    }
    
    // Clear search results button
    if (clearSearchResultsBtn) {
        clearSearchResultsBtn.addEventListener('click', () => {
            clearSearchResults();
            showSearchStatus('No search performed');
        });
    }
}

// --- Global Search Functions ---
async function performGlobalSearch() {
    if (!globalSearchInput || !window.electronAPI) return;
    
    const query = globalSearchInput.value.trim();
    if (!query) {
        showSearchStatus('Please enter a search term');
        return;
    }
    
    if (searchInProgress) {
        showSearchStatus('Search in progress...');
        return;
    }
    
    searchInProgress = true;
    showSearchStatus('Searching...');
    clearSearchResults();
    
    try {
        const options = {
            caseSensitive: searchCaseSensitive?.checked || false,
            wholeWord: searchWholeWord?.checked || false,
            useRegex: searchRegex?.checked || false,
            filePattern: searchFilePattern?.value || '*.{md,markdown,txt}'
        };
        
        // Search for tags first if tag manager is available
        let tagResults = [];
        if (window.tagManager) {
            // Check if query matches any tags
            const matchingTags = window.tagManager.searchTags(query);
            if (matchingTags.length > 0) {
                // Get files for matching tags
                matchingTags.forEach(({ tag, count }) => {
                    const files = window.tagManager.findFilesByTags([tag]);
                    tagResults.push({ tag, count, files });
                });
            }
            
            // Also check if files have the query in their metadata
            const allFiles = Array.from(window.tagManager.fileTags.keys());
            const metadataMatches = allFiles.filter(file => {
                const metadata = window.tagManager.getFileMetadata(file);
                const tags = window.tagManager.getFileTags(file);
                
                // Check if query matches title, category, or description
                const titleMatch = metadata.title && metadata.title.toLowerCase().includes(query.toLowerCase());
                const categoryMatch = metadata.category && metadata.category.toLowerCase().includes(query.toLowerCase());
                const descMatch = metadata.description && metadata.description.toLowerCase().includes(query.toLowerCase());
                const tagMatch = tags.some(tag => tag.toLowerCase().includes(query.toLowerCase()));
                
                return titleMatch || categoryMatch || descMatch || tagMatch;
            });
            
            if (metadataMatches.length > 0) {
                tagResults.push({ 
                    tag: 'Metadata matches', 
                    count: metadataMatches.length, 
                    files: metadataMatches 
                });
            }
        }
        
        // Perform regular content search
        const result = await window.electronAPI.invoke('global-search', { query, options });
        
        if (result.success) {
            globalSearchResults = result.results;
            displaySearchResultsWithTags(result.results, tagResults, query);
            
            const totalMatches = result.results.length + 
                (tagResults.reduce((sum, tr) => sum + tr.count, 0));
            showSearchStatus(`Found ${totalMatches} matches`);
        } else {
            // Even if content search fails, show tag results if any
            if (tagResults.length > 0) {
                displaySearchResultsWithTags([], tagResults, query);
                const tagMatches = tagResults.reduce((sum, tr) => sum + tr.count, 0);
                showSearchStatus(`Found ${tagMatches} tag matches`);
            } else {
                showSearchStatus(`Search failed: ${result.error}`);
            }
        }
    } catch (error) {
        console.error('[Search] Global search error:', error);
        showSearchStatus('Search failed: An unexpected error occurred');
    } finally {
        searchInProgress = false;
    }
}

function clearSearchResults() {
    if (searchResults) {
        searchResults.innerHTML = '';
    }
}

function showSearchStatus(message) {
    if (searchResultsCount) {
        searchResultsCount.textContent = message;
    }
}

function displaySearchResultsWithTags(contentResults, tagResults, query) {
    if (!searchResults) return;
    
    clearSearchResults();
    
    const hasContentResults = contentResults && contentResults.length > 0;
    const hasTagResults = tagResults && tagResults.length > 0;
    
    if (!hasContentResults && !hasTagResults) {
        searchResults.innerHTML = '<div class="no-results">No matches found</div>';
        return;
    }
    
    // Create results header
    const resultsHeader = document.createElement('div');
    resultsHeader.className = 'search-results-header';
    const totalResults = (contentResults?.length || 0) + (tagResults?.reduce((sum, tr) => sum + tr.count, 0) || 0);
    resultsHeader.innerHTML = `
        <div style="margin-bottom: 12px; font-weight: bold; color: #333;">
            Found ${totalResults} matches for "<span style="color: #0066cc;">${escapeHtml(query)}</span>"
        </div>
    `;
    searchResults.appendChild(resultsHeader);
    
    // Display tag results first
    if (hasTagResults) {
        const tagSection = document.createElement('div');
        tagSection.className = 'search-tag-section';
        tagSection.style.cssText = 'margin-bottom: 20px; padding: 12px; background: #f8f9fa; border-radius: 4px;';
        
        const tagHeader = document.createElement('div');
        tagHeader.style.cssText = 'font-weight: bold; margin-bottom: 8px; color: #16a34a;';
        tagHeader.innerHTML = '🏷 Tag & Metadata Matches';
        tagSection.appendChild(tagHeader);
        
        tagResults.forEach(({ tag, count, files }) => {
            const tagGroup = document.createElement('div');
            tagGroup.style.cssText = 'margin-bottom: 8px;';
            
            const tagLabel = document.createElement('div');
            tagLabel.style.cssText = 'font-size: 13px; margin-bottom: 4px; display: flex; align-items: center; gap: 8px;';
            
            const tagChip = document.createElement('span');
            tagChip.className = 'tag-chip clickable-tag';
            tagChip.style.cssText = 'background: #16a34a; color: white; padding: 2px 8px; border-radius: 12px; font-size: 11px; cursor: pointer;';
            tagChip.textContent = tag;
            tagChip.title = 'Click to filter by this tag';
            
            // Make tag clickable to add as filter
            tagChip.onclick = () => {
                // Switch to file tree view
                if (window.showFilesView) {
                    window.showFilesView();
                }
                
                // Add tag to filters
                if (window.addTagFilter) {
                    window.addTagFilter(tag);
                }
                
                // Show notification
                if (window.showNotification) {
                    window.showNotification(`Filtering by tag: ${tag}`, 'info');
                }
            };
            
            tagChip.addEventListener('mouseenter', () => {
                tagChip.style.background = '#15803d';
            });
            tagChip.addEventListener('mouseleave', () => {
                tagChip.style.background = '#16a34a';
            });
            
            tagLabel.appendChild(tagChip);
            
            const countSpan = document.createElement('span');
            countSpan.style.cssText = 'color: #666; font-size: 11px;';
            countSpan.textContent = `${count} file${count !== 1 ? 's' : ''}`;
            tagLabel.appendChild(countSpan);
            
            tagGroup.appendChild(tagLabel);
            
            const fileList = document.createElement('div');
            fileList.style.cssText = 'margin-left: 20px;';
            
            files.slice(0, 5).forEach(filePath => {
                const fileItem = document.createElement('div');
                fileItem.className = 'search-tag-file';
                fileItem.style.cssText = 'padding: 4px 8px; margin: 2px 0; cursor: pointer; font-size: 12px; color: #0066cc; hover: underline;';
                
                const fileName = filePath.split('/').pop();
                const metadata = window.tagManager?.getFileMetadata(filePath);
                const title = metadata?.title || fileName;
                
                fileItem.innerHTML = `📄 ${title}`;
                fileItem.onclick = async () => {
                    try {
                        const result = await window.electronAPI.invoke('open-file-path', filePath);
                        if (result.success && window.openFileInEditor) {
                            await window.openFileInEditor(result.filePath, result.content);
                        }
                    } catch (error) {
                        console.error('[Search] Error opening file:', error);
                    }
                };
                
                fileItem.addEventListener('mouseenter', () => {
                    fileItem.style.textDecoration = 'underline';
                });
                fileItem.addEventListener('mouseleave', () => {
                    fileItem.style.textDecoration = 'none';
                });
                
                fileList.appendChild(fileItem);
            });
            
            if (files.length > 5) {
                const moreItem = document.createElement('div');
                moreItem.style.cssText = 'padding: 4px 8px; font-size: 11px; color: #666; font-style: italic;';
                moreItem.textContent = `...and ${files.length - 5} more`;
                fileList.appendChild(moreItem);
            }
            
            tagGroup.appendChild(fileList);
            tagSection.appendChild(tagGroup);
        });
        
        searchResults.appendChild(tagSection);
    }
    
    // Display content results
    if (hasContentResults) {
        displaySearchResults(contentResults, query);
    }
}

function displaySearchResults(results, query) {
    if (!searchResults) return;
    
    // Don't clear results if we're appending to tag results
    // clearSearchResults();
    
    if (results.length === 0) {
        return;
    }
    
    // Create content results section header
    const contentHeader = document.createElement('div');
    contentHeader.style.cssText = 'font-weight: bold; margin: 16px 0 8px 0; color: #333;';
    contentHeader.innerHTML = '📝 Content Matches';
    searchResults.appendChild(contentHeader);
    
    // Group results by file
    const fileGroups = {};
    results.forEach(result => {
        if (!fileGroups[result.file]) {
            fileGroups[result.file] = [];
        }
        fileGroups[result.file].push(result);
    });
    
    // Create file sections
    Object.entries(fileGroups).forEach(([filePath, fileResults]) => {
        const fileSection = document.createElement('div');
        fileSection.className = 'search-file-section';
        
        const fileHeader = document.createElement('div');
        fileHeader.className = 'search-file-header';
        fileHeader.innerHTML = `
            <span class="search-file-name">${fileResults[0].fileName}</span>
            <span class="search-file-count">${fileResults.length} matches</span>
        `;
        fileSection.appendChild(fileHeader);
        
        const fileResultsList = document.createElement('div');
        fileResultsList.className = 'search-file-results';
        
        fileResults.forEach(result => {
            const resultDiv = document.createElement('div');
            resultDiv.className = 'search-result-item';
            resultDiv.onclick = () => openSearchResult(result);
            
            // Highlight the matched text
            const highlightedText = highlightSearchTerm(result.text, query);
            
            resultDiv.innerHTML = `
                <div class="search-result-line">Line ${result.line}</div>
                <div class="search-result-text">${highlightedText}</div>
            `;
            
            fileResultsList.appendChild(resultDiv);
        });
        
        fileSection.appendChild(fileResultsList);
        searchResults.appendChild(fileSection);
    });
}

function highlightSearchTerm(text, searchTerm) {
    const escaped = escapeHtml(text);
    const escapedTerm = escapeHtml(searchTerm);
    
    // Simple highlighting - could be enhanced for regex/case sensitivity
    const regex = new RegExp(`(${escapedTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return escaped.replace(regex, '<mark>$1</mark>');
}

async function openSearchResult(result) {
    try {
        // Open the file first
        const openResult = await window.electronAPI.invoke('open-file-path', result.file);
        
        if (openResult.success) {
            // Switch to editor mode if needed
            if (window.switchToMode && typeof window.switchToMode === 'function') {
                window.switchToMode('editor');
            }
            
            // Open file in editor
            if (window.openFileInEditor) {
                await window.openFileInEditor(openResult.filePath, openResult.content);
            }
            
            // Navigate to the specific line
            if (window.editor && result.line) {
                setTimeout(() => {
                    if (window.editor) {
                        window.editor.revealLineInCenter(result.line);
                        window.editor.setPosition({ lineNumber: result.line, column: result.column || 1 });
                        window.editor.focus();
                    }
                }, 100);
            }
        }
    } catch (error) {
        console.error('[Search] Error opening search result:', error);
        if (window.showNotification) {
            window.showNotification('Failed to open search result', 'error');
        }
    }
}

// --- Global Replace Functions ---
async function performGlobalReplace(previewOnly = false) {
    if (!globalSearchInput || !globalReplaceInput || !window.electronAPI) return;
    
    const searchQuery = globalSearchInput.value.trim();
    const replaceText = globalReplaceInput.value;
    
    if (!searchQuery) {
        showSearchStatus('Please enter a search term');
        return;
    }
    
    if (searchInProgress) {
        showSearchStatus('Operation in progress...');
        return;
    }
    
    searchInProgress = true;
    
    if (previewOnly) {
        showSearchStatus('Previewing replacements...');
    } else {
        showSearchStatus('Replacing...');
    }
    
    try {
        const options = {
            caseSensitive: searchCaseSensitive?.checked || false,
            wholeWord: searchWholeWord?.checked || false,
            useRegex: searchRegex?.checked || false,
            filePattern: searchFilePattern?.value || '*.{md,markdown,txt}',
            previewOnly: previewOnly
        };
        
        const result = await window.electronAPI.invoke('global-replace', {
            searchQuery,
            replaceText,
            options
        });
        
        if (result.success) {
            if (previewOnly) {
                displayReplacePreview(result.results, searchQuery, replaceText);
                showSearchStatus(`Preview: ${result.results.length} replacements found`);
            } else {
                displayReplaceResults(result.results, searchQuery, replaceText);
                showSearchStatus(`Replaced ${result.results.length} occurrences`);
                
                // Refresh the current file if it was modified
                if (window.currentFilePath && result.modifiedFiles && 
                    result.modifiedFiles.includes(window.currentFilePath)) {
                    // Optionally reload the current file
                    if (confirm('The current file was modified. Would you like to reload it?')) {
                        const reloadResult = await window.electronAPI.invoke('open-file-path', window.currentFilePath);
                        if (reloadResult.success && window.openFileInEditor) {
                            await window.openFileInEditor(reloadResult.filePath, reloadResult.content);
                        }
                    }
                }
            }
        } else {
            showSearchStatus(`Operation failed: ${result.error}`);
        }
    } catch (error) {
        console.error('[Search] Global replace error:', error);
        showSearchStatus('Operation failed: An unexpected error occurred');
    } finally {
        searchInProgress = false;
    }
}

function displayReplacePreview(results, searchQuery, replaceText) {
    if (!searchResults) return;
    
    clearSearchResults();
    
    if (results.length === 0) {
        searchResults.innerHTML = '<div class="no-results">No replacements to preview</div>';
        return;
    }
    
    // Create preview header
    const resultsHeader = document.createElement('div');
    resultsHeader.className = 'search-results-header';
    resultsHeader.innerHTML = `
        <div style="background: #fff3cd; padding: 8px; border-radius: 4px; margin-bottom: 12px; border-left: 3px solid #ffc107;">
            <strong>Replace Preview</strong><br>
            <small>Replace: <code>${escapeHtml(searchQuery)}</code> → <code>${escapeHtml(replaceText)}</code></small>
        </div>
    `;
    searchResults.appendChild(resultsHeader);
    
    // Group results by file
    const fileGroups = {};
    results.forEach(item => {
        if (!fileGroups[item.file]) {
            fileGroups[item.file] = [];
        }
        fileGroups[item.file].push(item);
    });
    
    // Create file sections
    Object.entries(fileGroups).forEach(([filePath, fileResults]) => {
        const fileSection = document.createElement('div');
        fileSection.className = 'search-file-section';
        
        const fileHeader = document.createElement('div');
        fileHeader.className = 'search-file-header';
        fileHeader.innerHTML = `
            <span class="search-file-name">${fileResults[0].fileName}</span>
            <span class="search-file-count">${fileResults.length} to replace</span>
        `;
        fileSection.appendChild(fileHeader);
        
        const fileResultsList = document.createElement('div');
        fileResultsList.className = 'search-file-results';
        
        fileResults.forEach(item => {
            const resultDiv = document.createElement('div');
            resultDiv.className = 'replace-preview-item';
            resultDiv.innerHTML = `
                <div class="search-result-line">Line ${item.line}</div>
                <div class="replace-preview-before">Before: ${escapeHtml(item.before)}</div>
                <div class="replace-preview-after">After: ${escapeHtml(item.after)}</div>
            `;
            fileResultsList.appendChild(resultDiv);
        });
        
        fileSection.appendChild(fileResultsList);
        searchResults.appendChild(fileSection);
    });
}

function displayReplaceResults(resultsData, searchQuery, replaceText) {
    if (!searchResults) return;
    
    clearSearchResults();
    
    if (resultsData.length === 0) {
        searchResults.innerHTML = '<div class="no-results">No replacements made</div>';
        return;
    }
    
    // Create results header
    const resultsHeader = document.createElement('div');
    resultsHeader.className = 'search-results-header';
    resultsHeader.innerHTML = `
        <div style="background: #d4edda; padding: 8px; border-radius: 4px; margin-bottom: 12px; border-left: 3px solid #28a745;">
            <strong>Replacement Complete</strong><br>
            <small>Replaced: <code>${escapeHtml(searchQuery)}</code> → <code>${escapeHtml(replaceText)}</code></small>
        </div>
    `;
    searchResults.appendChild(resultsHeader);
    
    // Group results by file
    const fileGroups = {};
    resultsData.forEach(item => {
        if (!fileGroups[item.file]) {
            fileGroups[item.file] = [];
        }
        fileGroups[item.file].push(item);
    });
    
    // Create file sections
    Object.entries(fileGroups).forEach(([filePath, fileResults]) => {
        const fileSection = document.createElement('div');
        fileSection.className = 'search-file-section';
        
        const fileHeader = document.createElement('div');
        fileHeader.className = 'search-file-header';
        fileHeader.innerHTML = `
            <span class="search-file-name">${fileResults[0].fileName}</span>
            <span class="search-file-count">${fileResults.length} replaced</span>
        `;
        fileSection.appendChild(fileHeader);
        
        const fileResultsList = document.createElement('div');
        fileResultsList.className = 'search-file-results';
        
        fileResults.forEach(item => {
            const resultDiv = document.createElement('div');
            resultDiv.className = 'replace-result-item';
            resultDiv.innerHTML = `
                <div style="margin: 2px 0; padding: 4px; font-size: 12px; background: #f8f9fa;">
                    Line ${item.line}: Replaced "${escapeHtml(searchQuery)}" with "${escapeHtml(replaceText)}"
                </div>
            `;
            fileResultsList.appendChild(resultDiv);
        });
        
        fileSection.appendChild(fileResultsList);
        searchResults.appendChild(fileSection);
    });
}

// --- Utility Functions ---
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// --- Export Functions for Global Access ---
window.initializeGlobalSearch = initializeGlobalSearch;
window.performGlobalSearch = performGlobalSearch;
window.performGlobalReplace = performGlobalReplace;