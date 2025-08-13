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
        this.aiEnabled = true; // Will be configurable
        this.controls = null;
        this.isInitialized = false;
        
        // Summary caching system (shared between preview and circle views)
        if (!window.sharedSummaryCache) {
            window.sharedSummaryCache = new Map(); // filePath -> { contentHash, summaries, timestamp }
        }
        this.summaryCache = window.sharedSummaryCache;
        this.cacheExpiryMs = 24 * 60 * 60 * 1000; // 24 hours
        this.changeThreshold = 0.15; // 15% content change triggers refresh
    }

    initialize() {
        if (this.isInitialized) return;
        
        console.log('[PreviewZoom] Initializing preview zoom functionality');
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
            console.log('[PreviewZoom] Cache expired for', filePath);
            return false;
        }
        
        // Check content similarity
        const similarity = this.calculateContentSimilarity(cached.originalContent, currentContent);
        const hasSignificantChange = similarity < (1 - this.changeThreshold);
        
        if (hasSignificantChange) {
            console.log(`[PreviewZoom] Significant content change detected (${Math.round((1-similarity)*100)}% different) for ${filePath}`);
            return false;
        }
        
        console.log(`[PreviewZoom] Using cached summaries for ${filePath} (${Math.round(similarity*100)}% similar)`);
        return true;
    }

    // Save summaries to cache
    cacheSummaries(filePath, content, summaryParagraph, summarySentence) {
        this.summaryCache.set(filePath, {
            contentHash: this.generateContentHash(content),
            originalContent: content,
            summaries: {
                paragraph: summaryParagraph,
                sentence: summarySentence
            },
            timestamp: Date.now()
        });
        console.log(`[PreviewZoom] Cached summaries for ${filePath}`);
    }

    // Load summaries from cache
    loadCachedSummaries(filePath) {
        const cached = this.summaryCache.get(filePath);
        if (cached) {
            this.summaryParagraph = cached.summaries.paragraph;
            this.summarySentence = cached.summaries.sentence;
            this.summariesGenerated = true;
            return true;
        }
        return false;
    }

    addControls() {
        // Create zoom controls container
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

        // Create controls div
        this.controls = document.createElement('div');
        this.controls.id = 'preview-zoom-controls';
        this.controls.style.cssText = `
            position: absolute;
            top: 10px;
            right: 10px;
            z-index: 1000;
            background: rgba(255, 255, 255, 0.95);
            padding: 12px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            font-size: 12px;
            min-width: 200px;
            border: 1px solid #e1e4e8;
            display: none;
        `;

        this.updateControlsContent();
        previewPane.appendChild(this.controls);

        // Add event listeners
        this.setupEventListeners();
    }

    updateControlsContent() {
        if (!this.controls) return;

        this.controls.innerHTML = `
            <div style="margin-bottom: 12px;">
                <h4 style="margin: 0 0 8px 0; color: #333; font-size: 13px;">Text Abstraction</h4>
                <label style="display: flex; align-items: center; margin-bottom: 8px;">
                    <input type="checkbox" id="preview-zoom-enable" ${this.isEnabled ? 'checked' : ''} 
                           style="margin-right: 6px;">
                    <span style="font-size: 11px;">Enable zoom-based abstraction</span>
                </label>
            </div>
            
            <div id="zoom-controls-section" style="display: ${this.isEnabled ? 'block' : 'none'};">
                <div style="margin-bottom: 10px;">
                    <label style="display: flex; align-items: center; margin-bottom: 6px;">
                        <input type="checkbox" id="preview-ai-summaries" ${this.aiEnabled ? 'checked' : ''} 
                               style="margin-right: 6px;">
                        <span style="font-size: 11px;">AI Summaries (experimental)</span>
                    </label>
                </div>
                
                <div style="margin-bottom: 12px;">
                    <div style="font-weight: bold; margin-bottom: 6px; font-size: 11px;">Zoom Level: ${this.currentZoomLevel}/${this.maxZoomLevel}</div>
                    <div style="display: flex; gap: 5px;">
                        <button id="preview-zoom-out" style="padding: 6px 10px; font-size: 11px; background: ${this.currentZoomLevel < this.maxZoomLevel ? '#ff6b35' : '#ccc'}; color: white; border: none; border-radius: 4px; cursor: ${this.currentZoomLevel < this.maxZoomLevel ? 'pointer' : 'not-allowed'};">−</button>
                        <button id="preview-zoom-in" style="padding: 6px 10px; font-size: 11px; background: ${this.currentZoomLevel > 0 ? '#4CAF50' : '#ccc'}; color: white; border: none; border-radius: 4px; cursor: ${this.currentZoomLevel > 0 ? 'pointer' : 'not-allowed'};">+</button>
                        <button id="preview-zoom-reset" style="padding: 6px 10px; font-size: 11px; background: #007acc; color: white; border: none; border-radius: 4px; cursor: pointer;">Reset</button>
                    </div>
                </div>
                
                <div style="margin-bottom: 10px;">
                    <div style="font-size: 11px; color: #666; margin-bottom: 4px;"><strong>Current Level:</strong></div>
                    <div style="font-size: 10px; color: #333;">${this.getZoomLevelDescription()}</div>
                </div>
                
                <div style="font-size: 10px; color: ${this.summariesGenerated ? '#28a745' : '#999'};">
                    ${this.summariesGenerated ? 
                        (this.aiEnabled ? '✓ AI summaries ready' : '✓ Fallback summaries ready') : 
                        'Summaries pending...'}
                </div>
            </div>
        `;
    }

    setupEventListeners() {
        // Enable/disable toggle
        const enableToggle = document.getElementById('preview-zoom-enable');
        if (enableToggle) {
            enableToggle.addEventListener('change', (e) => {
                this.isEnabled = e.target.checked;
                this.updateControlsContent();
                
                if (this.isEnabled && this.originalContent) {
                    this.generateSummaries();
                } else if (!this.isEnabled) {
                    this.resetToOriginal();
                }
            });
        }

        // AI summaries toggle
        const aiToggle = document.getElementById('preview-ai-summaries');
        if (aiToggle) {
            aiToggle.addEventListener('change', (e) => {
                this.aiEnabled = e.target.checked;
                console.log('[PreviewZoom] AI summaries', this.aiEnabled ? 'enabled' : 'disabled');
                
                // Regenerate summaries if toggled on
                if (this.aiEnabled && !this.summariesGenerated && this.originalContent) {
                    this.generateSummaries();
                }
                this.updateControlsContent();
            });
        }

        // Zoom controls
        const zoomOutBtn = document.getElementById('preview-zoom-out');
        const zoomInBtn = document.getElementById('preview-zoom-in');
        const resetBtn = document.getElementById('preview-zoom-reset');

        if (zoomOutBtn) {
            zoomOutBtn.addEventListener('click', () => this.zoomOut());
        }
        if (zoomInBtn) {
            zoomInBtn.addEventListener('click', () => this.zoomIn());
        }
        if (resetBtn) {
            resetBtn.addEventListener('click', () => this.resetZoom());
        }
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

        if (!isMarkdown || !this.isEnabled) {
            return htmlContent; // Return unchanged
        }

        // Store original content and file path
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
            this.loadCachedSummaries(filePath);
            console.log('[PreviewZoom] Loaded summaries from cache');
        } else {
            // Need to regenerate summaries
            this.summariesGenerated = false;
            this.summaryParagraph = null;
            this.summarySentence = null;
            
            // Generate summaries in background
            if (this.aiEnabled) {
                this.generateSummaries(textContent);
            }
        }

        this.updateControlsContent();
        return htmlContent; // Return original content initially
    }

    async generateSummaries(textContent = null) {
        if (this.summariesGenerated || !this.originalContent || !this.currentFilePath) return;
        
        console.log('[PreviewZoom] Generating summaries for preview...');
        
        try {
            // Extract text content from HTML if not provided
            if (!textContent) {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = this.originalContent;
                textContent = tempDiv.textContent || tempDiv.innerText || '';
            }

            // Request AI summaries from the main process
            const summaryResult = await window.electronAPI.invoke('generate-document-summaries', {
                content: textContent,
                filePath: this.currentFilePath
            });
            
            if (summaryResult && summaryResult.success) {
                this.summaryParagraph = summaryResult.paragraph;
                this.summarySentence = summaryResult.sentence;
                this.summariesGenerated = true;
                
                // Cache the summaries
                this.cacheSummaries(this.currentFilePath, textContent, this.summaryParagraph, this.summarySentence);
                
                console.log('[PreviewZoom] AI summaries generated and cached successfully for preview');
            } else {
                console.warn('[PreviewZoom] AI summary generation failed:', summaryResult?.error);
                // Fallback to simple text truncation
                this.generateFallbackSummaries(textContent);
            }
        } catch (error) {
            console.error('[PreviewZoom] Error generating summaries:', error);
            // Fallback to simple text truncation
            if (!textContent) {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = this.originalContent;
                textContent = tempDiv.textContent || tempDiv.innerText || '';
            }
            this.generateFallbackSummaries(textContent);
        }

        this.updateControlsContent();
    }

    generateFallbackSummaries(textContent) {
        if (!textContent) return;
        
        // Simple fallback: extract first paragraph and first sentence
        const paragraphs = textContent.split('\n\n').filter(p => p.trim().length > 0);
        const sentences = textContent.split(/[.!?]+/).filter(s => s.trim().length > 20);
        
        this.summaryParagraph = paragraphs[0] || textContent.substring(0, 300) + '...';
        this.summarySentence = sentences[0] ? sentences[0].trim() + '.' : textContent.substring(0, 100) + '...';
        this.summariesGenerated = true;
        
        // Cache the fallback summaries too
        if (this.currentFilePath) {
            this.cacheSummaries(this.currentFilePath, textContent, this.summaryParagraph, this.summarySentence);
        }
        
        console.log('[PreviewZoom] Generated and cached fallback summaries for preview');
    }

    zoomOut() {
        if (!this.isEnabled || this.currentZoomLevel >= this.maxZoomLevel) return;
        
        console.log('[PreviewZoom] Zooming out to higher abstraction level');
        this.currentZoomLevel++;
        this.updatePreviewContent();
        this.updateControlsContent();
    }

    zoomIn() {
        if (!this.isEnabled || this.currentZoomLevel <= 0) return;
        
        console.log('[PreviewZoom] Zooming in to more detailed level');
        this.currentZoomLevel--;
        this.updatePreviewContent();
        this.updateControlsContent();
    }

    resetZoom() {
        if (!this.isEnabled) return;
        
        console.log('[PreviewZoom] Resetting zoom to full text');
        this.currentZoomLevel = 0;
        this.updatePreviewContent();
        this.updateControlsContent();
    }

    updatePreviewContent() {
        const previewContent = document.getElementById('preview-content');
        if (!previewContent || !this.originalContent) return;

        let contentToShow = '';
        
        switch(this.currentZoomLevel) {
            case 0: // Full text
                contentToShow = this.originalContent;
                break;
            case 1: // Paragraph summary
                contentToShow = this.summaryParagraph ? 
                    `<div class="zoom-summary zoom-paragraph"><h3>Summary</h3><p>${this.summaryParagraph}</p></div>` : 
                    '<div class="zoom-summary"><p>Generating summary...</p></div>';
                break;
            case 2: // Sentence summary
                contentToShow = this.summarySentence ? 
                    `<div class="zoom-summary zoom-sentence"><h3>Essence</h3><p><strong>${this.summarySentence}</strong></p></div>` : 
                    '<div class="zoom-summary"><p>Generating summary...</p></div>';
                break;
        }

        // Add smooth transition
        previewContent.style.transition = 'opacity 0.3s ease';
        previewContent.style.opacity = '0';
        
        setTimeout(() => {
            previewContent.innerHTML = contentToShow;
            previewContent.style.opacity = '1';
        }, 150);
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

    getZoomLevelDescription() {
        switch(this.currentZoomLevel) {
            case 0: return 'Full Text - Complete Document';
            case 1: return 'Summary - Key Points';
            case 2: return 'Essence - Core Idea';
            default: return 'Unknown Level';
        }
    }

    destroy() {
        if (this.controls) {
            this.controls.remove();
            this.controls = null;
        }
        this.isInitialized = false;
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
`;
document.head.appendChild(style);