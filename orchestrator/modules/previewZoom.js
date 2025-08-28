// Preview zoom-based text abstraction module
class PreviewZoom {
    constructor() {
        this.isEnabled = false;
        this.currentZoomLevel = 0; // 0: full text, 1: paragraph summary, 2: sentence summary
        this.maxZoomLevel = 2;
        this.originalContent = null;
        this.summaryParagraph = null;
        this.summarySentence = null;
        this.currentFilePath = null;
        this.summariesGenerated = false;
        this.controls = null;
        this.isInitialized = false;
        this.updatingControls = false; // Prevent recursive updates
        this.isRegenerating = false; // Track regeneration state
        this.scrollListener = null; // Store scroll listener for cleanup
        this.scrollCooldown = false; // Prevent rapid scroll transitions
        this.keyListener = null; // Store keyboard listener for cleanup
        this.keyCooldown = false; // Prevent rapid key transitions
        
        // Summary caching system (shared between preview and circle views)
        if (!window.sharedSummaryCache) {
            window.sharedSummaryCache = new Map(); // filePath -> { contentHash, summaries, timestamp }
            this.loadPersistentCache(); // Load cache from localStorage on first initialization
        }
        this.summaryCache = window.sharedSummaryCache;
        this.cacheExpiryMs = 7 * 24 * 60 * 60 * 1000; // 7 days (longer for persistent cache)
        this.changeThreshold = 0.15; // 15% content change triggers refresh
    }

    initialize() {
        if (this.isInitialized) return;
        
        // console.log('[PreviewZoom] 🚀 Initializing preview zoom functionality');
        this.addControls();
        this.isInitialized = true;
    }

    // Generate a simple hash of content for change detection
    generateContentHash(content) {
        let hash = 0;
        if (content.length === 0) return hash;
        for (let i = 0; i < content.length; i++) {
            const char = content.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash.toString();
    }

    // Calculate content similarity (simple word-based comparison)
    calculateContentSimilarity(content1, content2) {
        if (!content1 || !content2) return 0;
        
        const words1 = content1.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        const words2 = content2.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        
        if (words1.length === 0 && words2.length === 0) return 1;
        if (words1.length === 0 || words2.length === 0) return 0;
        
        const set1 = new Set(words1);
        const set2 = new Set(words2);
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);
        
        return intersection.size / union.size;
    }

    // Check if cached summaries are still valid
    areCachedSummariesValid(filePath, currentContent) {
        const cached = this.summaryCache.get(filePath);
        if (!cached) return false;
        
        // Check expiry
        const now = Date.now();
        if (now - cached.timestamp > this.cacheExpiryMs) {
            console.log(`[PreviewZoom] Cache expired for ${filePath} (${Math.round((now - cached.timestamp) / (24 * 60 * 60 * 1000))} days old)`);
            this.summaryCache.delete(filePath); // Clean up expired cache
            return false;
        }
        
        // For persistent cache entries without originalContent, do a simpler validation
        if (!cached.originalContent) {
            // Check if content length changed significantly (rough heuristic)
            const lengthChange = Math.abs(currentContent.length - (cached.contentLength || 0));
            const lengthChangeRatio = lengthChange / Math.max(currentContent.length, cached.contentLength || 1);
            
            if (lengthChangeRatio > this.changeThreshold) {
                console.log(`[PreviewZoom] Content length changed significantly for ${filePath} (${lengthChangeRatio.toFixed(2)} ratio)`);
                return false;
            }
            
            // For persistent cache, be more lenient since we can't do full content comparison
            console.log(`[PreviewZoom] Using persistent cached summaries for ${filePath}`);
            return true;
        }
        
        // Check content similarity for in-memory cache entries
        const similarity = this.calculateContentSimilarity(cached.originalContent, currentContent);
        const hasSignificantChange = similarity < (1 - this.changeThreshold);
        
        if (hasSignificantChange) {
            console.log(`[PreviewZoom] Significant content change detected for ${filePath} (similarity: ${similarity.toFixed(2)})`);
            return false;
        }
        
        console.log(`[PreviewZoom] Using cached summaries for ${filePath} (similarity: ${similarity.toFixed(2)})`);
        return true;
    }

    // Load persistent cache from localStorage
    loadPersistentCache() {
        try {
            const persistentCache = localStorage.getItem('hegel-summary-cache');
            if (persistentCache) {
                const cacheData = JSON.parse(persistentCache);
                const now = Date.now();
                
                // Load non-expired entries into the in-memory cache
                let loadedCount = 0;
                Object.entries(cacheData).forEach(([filePath, data]) => {
                    if (now - data.timestamp < this.cacheExpiryMs) {
                        // For persistent cache entries, we don't have originalContent 
                        // but we'll add it when the file is loaded
                        const cacheEntry = {
                            ...data,
                            originalContent: null // Will be filled when content is loaded
                        };
                        window.sharedSummaryCache.set(filePath, cacheEntry);
                        loadedCount++;
                    }
                });
                
                console.log(`[PreviewZoom] Loaded ${loadedCount} cached summaries from persistent storage`);
            }
        } catch (error) {
            console.warn('[PreviewZoom] Failed to load persistent cache:', error);
        }
    }

    // Save in-memory cache to localStorage
    savePersistentCache() {
        try {
            const cacheObj = {};
            this.summaryCache.forEach((value, key) => {
                // Don't store the full originalContent in persistent cache to save space
                cacheObj[key] = {
                    contentHash: value.contentHash,
                    summaries: value.summaries,
                    timestamp: value.timestamp,
                    // Store content length for validation
                    contentLength: value.originalContent ? value.originalContent.length : 0
                };
            });
            localStorage.setItem('hegel-summary-cache', JSON.stringify(cacheObj));
            console.log(`[PreviewZoom] Saved ${Object.keys(cacheObj).length} summaries to persistent storage`);
        } catch (error) {
            console.warn('[PreviewZoom] Failed to save persistent cache:', error);
        }
    }

    // Save summaries to cache (both in-memory and persistent)
    cacheSummaries(filePath, content, summaryParagraph, summarySentence) {
        const cacheEntry = {
            contentHash: this.generateContentHash(content),
            originalContent: content,
            summaries: {
                paragraph: summaryParagraph,
                sentence: summarySentence
            },
            timestamp: Date.now()
        };
        
        this.summaryCache.set(filePath, cacheEntry);
        
        // Save to persistent storage (debounced to avoid excessive writes)
        clearTimeout(this.persistentCacheTimeout);
        this.persistentCacheTimeout = setTimeout(() => {
            this.savePersistentCache();
        }, 1000);
        
        console.log(`[PreviewZoom] Cached summaries for ${filePath} (${content.length} chars)`);
    }

    // Load summaries from cache
    loadCachedSummaries(filePath, currentContent = null) {
        const cached = this.summaryCache.get(filePath);
        if (cached) {
            this.summaryParagraph = cached.summaries.paragraph;
            this.summarySentence = cached.summaries.sentence;
            this.summariesGenerated = true;
            
            // If we have current content and this is a persistent cache entry, update it with full content
            if (currentContent && !cached.originalContent) {
                cached.originalContent = currentContent;
                cached.contentLength = currentContent.length;
            }
            
            return true;
        }
        return false;
    }

    addControls() {
        // Create zoom controls toolbar at the bottom of preview pane
        const previewPane = document.getElementById('preview-pane');
        if (!previewPane) {
            console.warn('[PreviewZoom] Preview pane not found');
            return;
        }

        // Remove existing controls if any
        const existingControls = document.getElementById('preview-zoom-controls');
        if (existingControls) {
            existingControls.remove();
        }

        // Create toolbar div
        this.controls = document.createElement('div');
        this.controls.id = 'preview-zoom-controls';
        this.controls.style.cssText = `
            position: relative;
            width: 100%;
            background: ${document.body.classList.contains('dark-mode') ? '#2d2d2d' : '#f8f9fa'};
            border-top: 1px solid ${document.body.classList.contains('dark-mode') ? '#444' : '#e1e4e8'};
            padding: 8px 12px;
            font-size: 12px;
            display: none;
            flex-shrink: 0;
            z-index: 100;
        `;

        // Insert toolbar at the end of preview pane
        this.updateControlsContent();
        previewPane.appendChild(this.controls);
        
        // Add scroll listener for scroll-based navigation
        this.addScrollNavigation();
        
        // Add keyboard listener for arrow key navigation
        this.addKeyboardNavigation();
    }
    
    addScrollNavigation() {
        // Use a more resilient approach - wait for content to be available
        let retryCount = 0;
        const maxRetries = 50; // Maximum 5 seconds of retrying (50 * 100ms)
        
        const tryAddListener = () => {
            const previewContent = document.getElementById('preview-content');
            if (!previewContent) {
                if (retryCount < maxRetries) {
                    console.log('[PreviewZoom] Preview content not found, retrying...', retryCount + 1);
                    retryCount++;
                    setTimeout(tryAddListener, 100);
                    return;
                } else {
                    console.warn('[PreviewZoom] Max retries reached for scroll navigation setup');
                    return;
                }
            }
            
            console.log('[PreviewZoom] Adding scroll listener to preview content');
            console.log('[PreviewZoom] Preview content element:', previewContent);
            console.log('[PreviewZoom] Current scroll properties:', {
                scrollTop: previewContent.scrollTop,
                scrollHeight: previewContent.scrollHeight,
                clientHeight: previewContent.clientHeight
            });
            
            // Remove existing listener if any
            if (this.scrollListener) {
                previewContent.removeEventListener('wheel', this.scrollListener);
            }
            
            this.scrollListener = (event) => {
                console.log('[PreviewZoom] Wheel event detected:', {
                    enabled: this.isEnabled,
                    cooldown: this.scrollCooldown,
                    deltaY: event.deltaY
                });
                
                if (!this.isEnabled || this.scrollCooldown) return;
                
                const isAtTop = previewContent.scrollTop <= 1;
                const isAtBottom = previewContent.scrollTop + previewContent.clientHeight >= previewContent.scrollHeight - 5;
                
                console.log('[PreviewZoom] Scroll position check:', {
                    scrollTop: previewContent.scrollTop,
                    clientHeight: previewContent.clientHeight,
                    scrollHeight: previewContent.scrollHeight,
                    isAtTop,
                    isAtBottom,
                    currentZoomLevel: this.currentZoomLevel
                });
                
                // Scroll up at top -> go to next higher abstraction level only
                if (event.deltaY < 0 && isAtTop && this.currentZoomLevel < this.maxZoomLevel) {
                    const nextLevel = this.currentZoomLevel + 1;
                    console.log(`[PreviewZoom] ⬆️ Scrolling up: ${this.currentZoomLevel} -> ${nextLevel}`);
                    event.preventDefault();
                    event.stopPropagation();
                    this.scrollCooldown = true;
                    this.setZoomLevel(nextLevel);
                    setTimeout(() => {
                        this.scrollCooldown = false;
                    }, 1000);
                }
                // Scroll down at bottom -> go to next lower abstraction level only
                else if (event.deltaY > 0 && isAtBottom && this.currentZoomLevel > 0) {
                    const nextLevel = this.currentZoomLevel - 1;
                    console.log(`[PreviewZoom] ⬇️ Scrolling down: ${this.currentZoomLevel} -> ${nextLevel}`);
                    event.preventDefault();
                    event.stopPropagation();
                    this.scrollCooldown = true;
                    this.setZoomLevel(nextLevel);
                    setTimeout(() => {
                        this.scrollCooldown = false;
                    }, 1000);
                }
            };
            
            previewContent.addEventListener('wheel', this.scrollListener, { passive: false });
            console.log('[PreviewZoom] ✅ Scroll listener attached successfully');
        };
        
        tryAddListener();
    }
    
    addKeyboardNavigation() {
        // Use a similar resilient approach for keyboard events
        let keyRetryCount = 0;
        const maxKeyRetries = 50; // Maximum 5 seconds of retrying (50 * 100ms)
        
        const tryAddKeyListener = () => {
            const previewContent = document.getElementById('preview-content');
            if (!previewContent) {
                if (keyRetryCount < maxKeyRetries) {
                    console.log('[PreviewZoom] Preview content not found for keyboard, retrying...', keyRetryCount + 1);
                    keyRetryCount++;
                    setTimeout(tryAddKeyListener, 100);
                    return;
                } else {
                    console.warn('[PreviewZoom] Max retries reached for keyboard navigation setup');
                    return;
                }
            }
            
            console.log('[PreviewZoom] Adding keyboard listener to preview content');
            
            // Remove existing listener if any
            if (this.keyListener) {
                previewContent.removeEventListener('keydown', this.keyListener);
            }
            
            this.keyListener = (event) => {
                // Only handle if preview content is focused or if no other input is focused
                const activeElement = document.activeElement;
                const isInputFocused = activeElement && (
                    activeElement.tagName === 'INPUT' || 
                    activeElement.tagName === 'TEXTAREA' || 
                    activeElement.contentEditable === 'true'
                );
                
                // Skip if an input is focused (to avoid interfering with normal input)
                if (isInputFocused) return;
                
                console.log('[PreviewZoom] Key event detected:', {
                    key: event.key,
                    enabled: this.isEnabled,
                    cooldown: this.keyCooldown,
                    activeElement: activeElement?.tagName
                });
                
                if (!this.isEnabled || this.keyCooldown) return;
                
                const isAtTop = previewContent.scrollTop <= 1;
                const isAtBottom = previewContent.scrollTop + previewContent.clientHeight >= previewContent.scrollHeight - 5;
                
                // Arrow Up at top -> go to higher abstraction
                if (event.key === 'ArrowUp' && isAtTop && this.currentZoomLevel < this.maxZoomLevel) {
                    const nextLevel = this.currentZoomLevel + 1;
                    console.log(`[PreviewZoom] ⬆️ Arrow up: ${this.currentZoomLevel} -> ${nextLevel}`);
                    event.preventDefault();
                    event.stopPropagation();
                    this.keyCooldown = true;
                    this.setZoomLevel(nextLevel);
                    setTimeout(() => {
                        this.keyCooldown = false;
                    }, 800);
                }
                // Arrow Down at bottom -> go to lower abstraction
                else if (event.key === 'ArrowDown' && isAtBottom && this.currentZoomLevel > 0) {
                    const nextLevel = this.currentZoomLevel - 1;
                    console.log(`[PreviewZoom] ⬇️ Arrow down: ${this.currentZoomLevel} -> ${nextLevel}`);
                    event.preventDefault();
                    event.stopPropagation();
                    this.keyCooldown = true;
                    this.setZoomLevel(nextLevel);
                    setTimeout(() => {
                        this.keyCooldown = false;
                    }, 800);
                }
            };
            
            // Make sure preview content can receive keyboard events
            previewContent.setAttribute('tabindex', '0');
            previewContent.addEventListener('keydown', this.keyListener);
            console.log('[PreviewZoom] ✅ Keyboard listener attached successfully');
        };
        
        tryAddKeyListener();
    }

    updateControlsContent() {
        if (!this.controls || this.updatingControls) return;
        
        this.updatingControls = true;

        const darkMode = document.body.classList.contains('dark-mode');
        this.controls.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <label style="display: flex; align-items: center; gap: 6px; font-size: 11px; color: ${darkMode ? '#d4d4d4' : '#333'};">
                        <input type="checkbox" 
                               id="preview-zoom-enable" 
                               ${this.isEnabled ? 'checked' : ''} 
                               onchange="window.previewZoom.toggleEnabled(this.checked)">
                        <span>Text Abstraction</span>
                    </label>
                    
                    ${this.isEnabled ? `
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div style="display: flex; flex-direction: column; align-items: center;">
                                <div style="display: flex; justify-content: space-between; width: 120px; margin-bottom: 2px;">
                                    <span style="font-size: 9px; color: ${darkMode ? '#999' : '#666'};">Detail</span>
                                    <span style="font-size: 9px; color: ${darkMode ? '#999' : '#666'};">Summary</span>
                                    <span style="font-size: 9px; color: ${darkMode ? '#999' : '#666'};">Essence</span>
                                </div>
                                <input type="range" 
                                       id="preview-zoom-slider" 
                                       min="0" 
                                       max="${this.maxZoomLevel}" 
                                       value="${this.currentZoomLevel}" 
                                       step="1"
                                       onchange="window.previewZoom.setZoomLevel(parseInt(this.value))"
                                       style="width: 120px; height: 4px; background: #ddd; border-radius: 2px; outline: none; -webkit-appearance: none;">
                            </div>
                        </div>
                    ` : ''}
                </div>
                
                ${this.isEnabled ? `
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <button 
                            id="preview-regenerate-summaries" 
                            onclick="window.previewZoom.regenerateSummaries()" 
                            style="padding: 4px 8px; font-size: 10px; background: ${this.isRegenerating ? '#999' : '#6c757d'}; color: white; border: none; border-radius: 3px; cursor: ${this.isRegenerating ? 'not-allowed' : 'pointer'};"
                            ${this.isRegenerating ? 'disabled' : ''}>${this.isRegenerating ? '<span class="loading-ellipsis">...</span>' : '↻'}</button>
                        
                        <div style="font-size: 9px; color: ${this.summariesGenerated ? '#28a745' : '#999'};">
                            ${this.summariesGenerated ? '✓' : '<span class="loading-ellipsis">pending</span>'}
                        </div>
                        
                        <div style="font-size: 9px; color: ${darkMode ? '#666' : '#999'};">
                            Scroll ↑↓ to navigate
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
        
        // Re-attach event listeners after updating HTML content
        this.setupEventListeners();
        
        this.updatingControls = false;
    }

    setupEventListeners() {
        console.log('[PreviewZoom] 🔧 All controls now use inline handlers - no addEventListener needed');
        // All controls (checkboxes and buttons) now use inline onchange/onclick handlers
        // This prevents event listener loss when HTML is regenerated
    }

    async onPreviewUpdate(filePath, htmlContent) {
        if (!this.isInitialized) {
            this.initialize();
        }

        // Show controls only for markdown files
        const isMarkdown = filePath && (filePath.endsWith('.md') || filePath.endsWith('.markdown'));
        
        if (this.controls) {
            this.controls.style.display = isMarkdown ? 'block' : 'none';
        }

        // Always store original content for markdown files, regardless of enabled state
        if (isMarkdown) {
            console.log('[PreviewZoom] 📄 Storing original content for:', filePath);
            this.currentFilePath = filePath;
            this.originalContent = htmlContent;
            this.currentZoomLevel = 0;

            // Extract text content for similarity comparison
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = htmlContent;
            const textContent = tempDiv.textContent || tempDiv.innerText || '';

            // Check if we have valid cached summaries
            if (this.areCachedSummariesValid(filePath, textContent)) {
                // Load from cache
                this.loadCachedSummaries(filePath, textContent);
                console.log('[PreviewZoom] Loaded summaries from cache');
                
                // Update preview content if we're currently showing summaries
                if (this.isEnabled && this.currentZoomLevel > 0) {
                    this.updatePreviewContent();
                }
            } else {
                // Need to regenerate summaries
                this.summariesGenerated = false;
                this.summaryParagraph = null;
                this.summarySentence = null;
                
                // Generate summaries in background if enabled
                if (this.isEnabled) {
                    this.generateSummaries(textContent);
                }
            }

            this.updateControlsContent();
            
            // Re-add navigation listeners when content is updated
            this.addScrollNavigation();
            this.addKeyboardNavigation();
        }

        return htmlContent; // Return original content initially
    }

    async generateSummaries(textContent = null) {
        if (this.summariesGenerated || !this.originalContent || !this.currentFilePath) {
            console.log('[PreviewZoom] Skipping summary generation:', {
                summariesGenerated: this.summariesGenerated,
                hasOriginalContent: !!this.originalContent,
                hasCurrentFilePath: !!this.currentFilePath
            });
            return;
        }
        
        console.log('[PreviewZoom] 🚀 Starting summary generation for preview...', {
            filePath: this.currentFilePath,
            contentLength: this.originalContent?.length
        });
        
        // Update UI to show loading state
        this.updateControlsContent();
        
        try {
            // Extract text content from HTML if not provided
            if (!textContent) {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = this.originalContent;
                textContent = tempDiv.textContent || tempDiv.innerText || '';
            }

            console.log('[PreviewZoom] 📤 Sending API request for summaries...', {
                textContentLength: textContent.length,
                textPreview: textContent.substring(0, 100) + '...'
            });

            const startTime = Date.now();
            
            // Request AI summaries from the main process
            const summaryResult = await window.electronAPI.invoke('generate-document-summaries', {
                content: textContent,
                filePath: this.currentFilePath
            });
            
            const duration = Date.now() - startTime;
            
            console.log('[PreviewZoom] 📥 Received API response:', {
                duration: `${duration}ms`,
                success: summaryResult?.success,
                hasParagraph: !!summaryResult?.paragraph,
                hasSentence: !!summaryResult?.sentence,
                error: summaryResult?.error
            });
            
            if (summaryResult && summaryResult.success) {
                this.summaryParagraph = summaryResult.paragraph;
                this.summarySentence = summaryResult.sentence;
                this.summariesGenerated = true;
                
                // Cache the summaries
                this.cacheSummaries(this.currentFilePath, textContent, this.summaryParagraph, this.summarySentence);
                
                console.log('[PreviewZoom] ✅ AI summaries generated and cached successfully:', {
                    paragraphLength: this.summaryParagraph?.length,
                    sentenceLength: this.summarySentence?.length
                });
                
                // Update UI to show the generated summaries
                this.updateControlsContent();
                
                // Update preview content if we're currently showing summaries
                if (this.isEnabled && this.currentZoomLevel > 0) {
                    this.updatePreviewContent();
                }
            } else {
                console.warn('[PreviewZoom] ⚠️ AI summary generation failed, using fallback:', summaryResult?.error);
                // Fallback to simple text truncation
                this.generateFallbackSummaries(textContent);
                // Update UI to show fallback summaries
                this.updateControlsContent();
                
                // Update preview content if we're currently showing summaries
                if (this.isEnabled && this.currentZoomLevel > 0) {
                    this.updatePreviewContent();
                }
            }
        } catch (error) {
            console.error('[PreviewZoom] ❌ Error generating summaries:', error);
            // Fallback to simple text truncation
            if (!textContent) {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = this.originalContent;
                textContent = tempDiv.textContent || tempDiv.innerText || '';
            }
            this.generateFallbackSummaries(textContent);
            // Update UI to show fallback summaries  
            this.updateControlsContent();
            
            // Update preview content if we're currently showing summaries
            if (this.isEnabled && this.currentZoomLevel > 0) {
                this.updatePreviewContent();
            }
        }
    }

    generateFallbackSummaries(textContent) {
        if (!textContent) return;
        
        // Simple fallback: extract first 3 paragraphs and first sentence
        const paragraphs = textContent.split('\n\n').filter(p => p.trim().length > 0);
        const sentences = textContent.split(/[.!?]+/).filter(s => s.trim().length > 20);
        
        // Take first 3 paragraphs for intermediate summary
        const firstThreeParagraphs = paragraphs.slice(0, 3);
        this.summaryParagraph = firstThreeParagraphs.length > 0 
            ? firstThreeParagraphs.join('\n\n') 
            : textContent.substring(0, 300) + '...';
        
        this.summarySentence = sentences[0] ? sentences[0].trim() + '.' : textContent.substring(0, 100) + '...';
        this.summariesGenerated = true;
        
        // Cache the fallback summaries too
        if (this.currentFilePath) {
            this.cacheSummaries(this.currentFilePath, textContent, this.summaryParagraph, this.summarySentence);
        }
        
        console.log('[PreviewZoom] Generated and cached fallback summaries for preview (3 paragraphs)');
    }

    zoomOut() {
        console.log('[PreviewZoom] 🔍 Zoom out clicked (legacy method)');
        if (this.currentZoomLevel < this.maxZoomLevel) {
            this.setZoomLevel(this.currentZoomLevel + 1);
        }
    }

    zoomIn() {
        console.log('[PreviewZoom] 🔍 Zoom in clicked (legacy method)');
        if (this.currentZoomLevel > 0) {
            this.setZoomLevel(this.currentZoomLevel - 1);
        }
    }

    resetZoom() {
        console.log('[PreviewZoom] 🔄 Reset zoom clicked:', {
            isEnabled: this.isEnabled,
            currentZoomLevel: this.currentZoomLevel
        });
        
        if (!this.isEnabled) {
            console.warn('[PreviewZoom] ❌ Cannot reset zoom: feature not enabled');
            return;
        }
        
        console.log('[PreviewZoom] ✅ Resetting zoom to full text');
        this.setZoomLevel(0);
    }
    
    setZoomLevel(newLevel) {
        console.log('[PreviewZoom] 🎚️ Setting zoom level via slider:', {
            isEnabled: this.isEnabled,
            currentLevel: this.currentZoomLevel,
            newLevel: newLevel
        });
        
        if (!this.isEnabled) {
            console.warn('[PreviewZoom] ❌ Cannot change zoom level: feature not enabled');
            return;
        }
        
        if (newLevel < 0 || newLevel > this.maxZoomLevel) {
            console.warn('[PreviewZoom] ❌ Invalid zoom level:', newLevel);
            return;
        }
        
        if (newLevel === this.currentZoomLevel) {
            console.log('[PreviewZoom] No change in zoom level');
            return;
        }
        
        console.log('[PreviewZoom] ✅ Transitioning to zoom level:', newLevel);
        this.currentZoomLevel = newLevel;
        this.updatePreviewContentWithTransition();
        this.updateControlsContent();
    }

    updatePreviewContent() {
        console.log('[PreviewZoom] 🖼️ Updating preview content:', {
            currentZoomLevel: this.currentZoomLevel,
            hasPreviewContent: !!document.getElementById('preview-content'),
            hasOriginalContent: !!this.originalContent,
            hasSummaryParagraph: !!this.summaryParagraph,
            hasSummarySentence: !!this.summarySentence
        });
        
        const previewContent = document.getElementById('preview-content');
        if (!previewContent) {
            console.error('[PreviewZoom] ❌ Preview content element not found');
            return;
        }
        
        if (!this.originalContent) {
            console.error('[PreviewZoom] ❌ No original content available');
            return;
        }

        let contentToShow = '';
        let contentType = '';
        
        switch(this.currentZoomLevel) {
            case 0: // Full text
                contentToShow = this.originalContent;
                contentType = 'Full text';
                break;
            case 1: // Paragraph summary
                if (this.summaryParagraph) {
                    contentToShow = `<div class="zoom-summary zoom-paragraph"><h3>Summary</h3><p>${this.summaryParagraph}</p></div>`;
                    contentType = 'Paragraph summary';
                } else {
                    contentToShow = '<div class="zoom-summary"><p class="loading-ellipsis">Generating summary</p></div>';
                    contentType = 'Generating paragraph summary';
                }
                break;
            case 2: // Sentence summary
                if (this.summarySentence) {
                    contentToShow = `<div class="zoom-summary zoom-sentence"><h3>Essence</h3><p><strong>${this.summarySentence}</strong></p></div>`;
                    contentType = 'Sentence summary';
                } else {
                    contentToShow = '<div class="zoom-summary"><p class="loading-ellipsis">Generating summary</p></div>';
                    contentType = 'Generating sentence summary';
                }
                break;
        }
        
        console.log('[PreviewZoom] 📝 Switching to:', contentType);

        // Add smooth transition
        previewContent.style.transition = 'opacity 0.3s ease';
        previewContent.style.opacity = '0';
        
        setTimeout(() => {
            previewContent.innerHTML = contentToShow;
            previewContent.style.opacity = '1';
            console.log('[PreviewZoom] ✅ Content updated successfully');
        }, 150);
    }
    
    updatePreviewContentWithTransition() {
        console.log('[PreviewZoom] 🎭 Updating preview content with ghost transition');
        
        const previewContent = document.getElementById('preview-content');
        if (!previewContent) {
            console.error('[PreviewZoom] ❌ Preview content element not found');
            return;
        }
        
        if (!this.originalContent) {
            console.error('[PreviewZoom] ❌ No original content available');
            return;
        }

        let contentToShow = '';
        let contentType = '';
        
        switch(this.currentZoomLevel) {
            case 0: // Full text
                contentToShow = this.originalContent;
                contentType = 'Full text';
                break;
            case 1: // Paragraph summary
                if (this.summaryParagraph) {
                    contentToShow = `<div class="zoom-summary zoom-paragraph"><h3>Summary</h3><p>${this.summaryParagraph}</p></div>`;
                    contentType = '3-paragraph summary';
                } else {
                    contentToShow = '<div class="zoom-summary"><p class="loading-ellipsis">Generating summary</p></div>';
                    contentType = 'Generating paragraph summary';
                }
                break;
            case 2: // Sentence summary
                if (this.summarySentence) {
                    contentToShow = `<div class="zoom-summary zoom-sentence"><h3>Essence</h3><p><strong>${this.summarySentence}</strong></p></div>`;
                    contentType = 'Sentence summary';
                } else {
                    contentToShow = '<div class="zoom-summary"><p class="loading-ellipsis">Generating summary</p></div>';
                    contentType = 'Generating sentence summary';
                }
                break;
        }
        
        console.log('[PreviewZoom] 🎬 Transitioning to:', contentType);

        // Create a ghost overlay transition effect
        const currentContent = previewContent.innerHTML;
        
        // Get current scroll position to preserve it
        const scrollTop = previewContent.scrollTop;
        
        // Get computed styles to preserve exact layout
        const computedStyles = window.getComputedStyle(previewContent);
        
        // Create ghost element that overlays the current content
        const ghostDiv = document.createElement('div');
        ghostDiv.className = 'transition-ghost';
        ghostDiv.innerHTML = currentContent;
        ghostDiv.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            width: 100%;
            height: auto;
            min-height: 100%;
            opacity: 1;
            transition: opacity 1.5s ease-out, filter 1.5s ease-out;
            z-index: 10;
            pointer-events: none;
            background: ${document.body.classList.contains('dark-mode') ? '#1e1e1e' : 'white'};
            padding: ${computedStyles.padding};
            margin: 0;
            font-family: ${computedStyles.fontFamily};
            font-size: ${computedStyles.fontSize};
            line-height: ${computedStyles.lineHeight};
            text-align: ${computedStyles.textAlign};
            overflow: hidden;
        `;
        
        // Make container relative and add ghost overlay
        previewContent.style.position = 'relative';
        previewContent.appendChild(ghostDiv);
        
        // Start transition immediately
        requestAnimationFrame(() => {
            // Update the underlying content (hidden by ghost)
            previewContent.innerHTML = contentToShow;
            previewContent.style.position = 'relative';
            
            // Force the underlying content to have exactly the same layout as ghost
            // This prevents any recalculation jumps
            const tempComputedStyles = window.getComputedStyle(previewContent);
            previewContent.style.padding = computedStyles.padding;
            previewContent.style.margin = computedStyles.margin;
            previewContent.style.textAlign = computedStyles.textAlign;
            previewContent.style.fontSize = computedStyles.fontSize;
            previewContent.style.lineHeight = computedStyles.lineHeight;
            previewContent.style.fontFamily = computedStyles.fontFamily;
            
            previewContent.appendChild(ghostDiv); // Re-add ghost after content change
            previewContent.scrollTop = scrollTop; // Restore scroll
            
            // Start ghost fade after a brief moment
            requestAnimationFrame(() => {
                ghostDiv.style.opacity = '0';
                ghostDiv.style.filter = 'blur(1px)';
                ghostDiv.style.transition = 'opacity 2s ease-out, filter 2s ease-out';
            });
            
            // Instead of removing the ghost, make it permanently invisible
            // This prevents any layout recalculation in Electron
            setTimeout(() => {
                if (ghostDiv && ghostDiv.parentNode) {
                    // Don't remove - just make it completely inert
                    ghostDiv.style.opacity = '0';
                    ghostDiv.style.visibility = 'hidden';
                    ghostDiv.style.pointerEvents = 'none';
                    ghostDiv.style.position = 'absolute';
                    ghostDiv.style.zIndex = '-1';
                    ghostDiv.setAttribute('aria-hidden', 'true');
                    
                    // Mark it for potential cleanup much later
                    ghostDiv.classList.add('ghost-cleanup');
                }
                
                console.log('[PreviewZoom] ✨ Ghost transition complete - ghost kept invisible');
            }, 2500);
            
            // Optional cleanup of accumulated ghosts (but only when safe)
            setTimeout(() => {
                const oldGhosts = previewContent.querySelectorAll('.ghost-cleanup');
                if (oldGhosts.length > 3) { // Only clean if we have many accumulated
                    oldGhosts.forEach((ghost, index) => {
                        if (index < oldGhosts.length - 2) { // Keep the 2 most recent
                            ghost.remove();
                        }
                    });
                }
            }, 10000); // Much later cleanup
        });
    }

    resetToOriginal() {
        const previewContent = document.getElementById('preview-content');
        if (!previewContent || !this.originalContent) return;

        this.currentZoomLevel = 0;
        previewContent.style.transition = 'opacity 0.3s ease';
        previewContent.style.opacity = '0';
        
        setTimeout(() => {
            previewContent.innerHTML = this.originalContent;
            previewContent.style.opacity = '1';
        }, 150);
    }


    destroy() {
        if (this.controls) {
            this.controls.remove();
            this.controls = null;
        }
        
        // Clean up scroll listener
        if (this.scrollListener) {
            const previewContent = document.getElementById('preview-content');
            if (previewContent) {
                previewContent.removeEventListener('wheel', this.scrollListener);
            }
            this.scrollListener = null;
        }
        
        // Clean up keyboard listener
        if (this.keyListener) {
            const previewContent = document.getElementById('preview-content');
            if (previewContent) {
                previewContent.removeEventListener('keydown', this.keyListener);
            }
            this.keyListener = null;
        }
        
        this.isInitialized = false;
    }

    // Debug function to check state
    debugState() {
        console.log('[PreviewZoom] 🔍 Current state:', {
            isInitialized: this.isInitialized,
            isEnabled: this.isEnabled,
            currentZoomLevel: this.currentZoomLevel,
            maxZoomLevel: this.maxZoomLevel,
            currentFilePath: this.currentFilePath,
            hasOriginalContent: !!this.originalContent,
            summariesGenerated: this.summariesGenerated,
            hasSummaryParagraph: !!this.summaryParagraph,
            hasSummarySentence: !!this.summarySentence,
            hasControls: !!this.controls,
            controlsVisible: this.controls?.style.display !== 'none',
            previewContentExists: !!document.getElementById('preview-content')
        });
    }
    
    // Toggle functions for inline handlers
    toggleEnabled(enabled) {
        console.log('[PreviewZoom] 🔘 Enable toggle changed via inline handler:', enabled);
        this.isEnabled = enabled;
        this.updateControlsContent();
        
        if (this.isEnabled && this.originalContent) {
            console.log('[PreviewZoom] 🚀 Feature enabled, generating summaries...');
            // Extract text content for summary generation
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = this.originalContent;
            const textContent = tempDiv.textContent || tempDiv.innerText || '';
            this.generateSummaries(textContent);
        } else if (!this.isEnabled) {
            console.log('[PreviewZoom] 🔄 Feature disabled, resetting to original');
            this.resetToOriginal();
        }
    }
    
    // Manual test function
    testZoom() {
        console.log('[PreviewZoom] 🧪 Testing zoom functionality...');
        
        // First, ensure we're enabled
        if (!this.isEnabled) {
            console.log('[PreviewZoom] Enabling zoom feature for test...');
            this.isEnabled = true;
        }
        
        // Store original content if we don't have it
        if (!this.originalContent) {
            const previewContent = document.getElementById('preview-content');
            if (previewContent) {
                this.originalContent = previewContent.innerHTML;
                console.log('[PreviewZoom] Captured original content');
            } else {
                console.error('[PreviewZoom] No preview content to test with');
                return;
            }
        }
        
        // Generate test summaries if we don't have them
        if (!this.summaryParagraph) {
            this.summaryParagraph = "This is a test paragraph summary. It shows a condensed version of the content.";
            this.summarySentence = "This is a test sentence summary.";
            this.summariesGenerated = true;
            console.log('[PreviewZoom] Generated test summaries');
        }
        
        // Now try zooming
        console.log('[PreviewZoom] Current zoom level:', this.currentZoomLevel);
        console.log('[PreviewZoom] Attempting to zoom out...');
        this.zoomOut();
    }
    
    // Force regenerate summaries
    async regenerateSummaries() {
        console.log('[PreviewZoom] 🔄 Force regenerating summaries...');
        
        if (!this.originalContent || !this.currentFilePath) {
            console.warn('[PreviewZoom] Cannot regenerate: missing content or file path');
            return;
        }
        
        if (this.isRegenerating) {
            console.log('[PreviewZoom] Already regenerating, ignoring request');
            return;
        }
        
        // Set regenerating state
        this.isRegenerating = true;
        
        // Clear existing summaries and cache
        this.summariesGenerated = false;
        this.summaryParagraph = null;
        this.summarySentence = null;
        
        // Remove from cache to force fresh generation
        if (this.summaryCache.has(this.currentFilePath)) {
            this.summaryCache.delete(this.currentFilePath);
            console.log('[PreviewZoom] ♻️ Cleared cached summaries for', this.currentFilePath);
        }
        
        // Update UI to show regenerating state
        this.updateControlsContent();
        
        // Extract text content and regenerate
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = this.originalContent;
        const textContent = tempDiv.textContent || tempDiv.innerText || '';
        
        console.log('[PreviewZoom] 🚀 Starting fresh summary generation...');
        
        try {
            await this.generateSummaries(textContent);
        } finally {
            // Clear regenerating state
            this.isRegenerating = false;
            this.updateControlsContent();
            console.log('[PreviewZoom] ✅ Regeneration complete');
        }
    }
}

// Create global instance
window.previewZoom = new PreviewZoom();

// Add CSS styles for zoom summaries
const style = document.createElement('style');
style.textContent = `
.zoom-summary {
    padding: 20px;
    margin: 20px;
    border-radius: 8px;
    background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
    border-left: 4px solid #007acc;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.zoom-summary h3 {
    margin: 0 0 15px 0;
    color: #343a40;
    font-size: 18px;
    font-weight: 600;
}

.zoom-summary p {
    margin: 0;
    line-height: 1.6;
    color: #495057;
    font-size: 16px;
}

.zoom-paragraph {
    border-left-color: #28a745;
}

.zoom-sentence {
    border-left-color: #ffc107;
    text-align: center;
}

.zoom-sentence p {
    font-size: 20px;
    font-weight: 500;
}

#preview-zoom-controls {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

#preview-zoom-controls button:hover {
    opacity: 0.9;
    transform: translateY(-1px);
}

#preview-zoom-controls button:active {
    transform: translateY(0);
}

/* Animated loading ellipsis */
.loading-ellipsis::after {
    content: '';
    animation: ellipsis 1.5s infinite;
}

@keyframes ellipsis {
    0% { content: ''; }
    25% { content: '.'; }
    50% { content: '..'; }
    75% { content: '...'; }
    100% { content: ''; }
}

/* Custom slider styling */
#preview-zoom-slider {
    -webkit-appearance: none;
    appearance: none;
    background: #ddd;
    border-radius: 2px;
    outline: none;
    cursor: pointer;
}

#preview-zoom-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #007acc;
    cursor: pointer;
    border: 2px solid #fff;
    box-shadow: 0 2px 6px rgba(0,0,0,0.2);
    transition: all 0.2s ease;
}

#preview-zoom-slider::-webkit-slider-thumb:hover {
    background: #0056b3;
    transform: scale(1.1);
    box-shadow: 0 3px 8px rgba(0,0,0,0.3);
}

#preview-zoom-slider::-moz-range-thumb {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #007acc;
    cursor: pointer;
    border: 2px solid #fff;
    box-shadow: 0 2px 6px rgba(0,0,0,0.2);
    transition: all 0.2s ease;
}

#preview-zoom-slider::-moz-range-thumb:hover {
    background: #0056b3;
    transform: scale(1.1);
    box-shadow: 0 3px 8px rgba(0,0,0,0.3);
}

/* Blend layer styling */
.blend-layer {
    width: 100%;
    min-height: 100px;
}

.blend-upper {
    border-radius: 4px;
}

/* Smooth transitions for blended content */
#preview-content .blend-layer {
    transition: opacity 0.15s ease-out;
}

/* Ensure proper stacking for blend layers */
.preview-content-wrapper {
    position: relative;
}

/* Ghost transition effect */
.transition-ghost {
    filter: blur(0px);
    transition: opacity 1.5s ease-out, filter 1.5s ease-out !important;
}

.transition-ghost.fading {
    filter: blur(2px);
}

.transition-new {
    animation: fadeInScale 1s ease-in forwards;
}

@keyframes fadeInScale {
    from {
        opacity: 0;
        transform: scale(0.98);
    }
    to {
        opacity: 1;
        transform: scale(1);
    }
}
`;
document.head.appendChild(style);