// Circle visualization module for hermeneutic circle patterns
// D3 is loaded globally from lib/d3.min.js

class CircleView {
    constructor() {
        this.nodes = [];
        this.links = [];
        this.svg = null;
        this.g = null;
        this.width = 800;
        this.height = 600;
        this.centerX = 400;
        this.centerY = 300;
        this.stages = [];
        this.currentStage = 0;
        
        // Document preview state
        this.previewMode = false;
        this.currentDocument = null;
        this.documentContent = null;
        this.summaryParagraph = null;
        this.summarySentence = null;
        this.zoomLevel = 0; // 0: full text, 1: paragraph summary, 2: sentence summary
        this.maxZoomLevel = 2;
        
        // AI configuration
        this.aiEnabled = true; // Will be configurable
        this.summariesGenerated = false;
        
        // Summary caching system (shared with preview zoom)
        if (!window.sharedSummaryCache) {
            window.sharedSummaryCache = new Map(); // filePath -> { contentHash, summaries, timestamp }
        }
        this.summaryCache = window.sharedSummaryCache;
        this.cacheExpiryMs = 24 * 60 * 60 * 1000; // 24 hours
        this.changeThreshold = 0.15; // 15% content change triggers refresh
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
            console.log('[CircleView] Cache expired for', filePath);
            return false;
        }
        
        // Check content similarity
        const similarity = this.calculateContentSimilarity(cached.originalContent, currentContent);
        const hasSignificantChange = similarity < (1 - this.changeThreshold);
        
        if (hasSignificantChange) {
            console.log(`[CircleView] Significant content change detected (${Math.round((1-similarity)*100)}% different) for ${filePath}`);
            return false;
        }
        
        console.log(`[CircleView] Using cached summaries for ${filePath} (${Math.round(similarity*100)}% similar)`);
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
        console.log(`[CircleView] Cached summaries for ${filePath}`);
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

    async initialize(container) {
        console.log('[CircleView] Initializing hermeneutic circle visualization');
        
        // Clear any existing content
        container.innerHTML = '';
        
        // Create container div
        const circleContainer = document.createElement('div');
        circleContainer.id = 'circle-container';
        circleContainer.style.width = '100%';
        circleContainer.style.height = '100%';
        circleContainer.style.position = 'relative';
        circleContainer.style.background = '#fafafa';
        container.appendChild(circleContainer);

        // Create SVG
        this.svg = d3.select(circleContainer)
            .append('svg')
            .attr('width', '100%')
            .attr('height', '100%')
            .style('cursor', 'grab');

        // Get dimensions
        const rect = circleContainer.getBoundingClientRect();
        this.width = rect.width;
        this.height = rect.height;
        this.centerX = this.width / 2;
        this.centerY = this.height / 2;

        // Create a group for zoom/pan
        this.g = this.svg.append('g');

        // Add zoom behavior
        const zoom = d3.zoom()
            .scaleExtent([0.1, 4])
            .on('zoom', (event) => {
                this.g.attr('transform', event.transform);
            });

        this.svg.call(zoom);

        // Initialize the hermeneutic circle
        await this.loadCircleData();
        this.render();

        // Add controls
        this.addControls(circleContainer);
    }

    async loadCircleData() {
        console.log('[CircleView] Loading circle data');
        
        try {
            // Get filtered files for visualization
            const result = await window.getFilteredVisualizationFiles();
            const files = result.files;
            
            console.log(`[CircleView] Using ${files.length} files (filtered from ${result.totalFiles} total)`);
            console.log('[CircleView] Applied filters:', result.filters);
            
            if (!files || files.length === 0) {
                console.log('[CircleView] No files available after filtering');
                return;
            }

            // For now, create a simple demonstration of the hermeneutic circle
            // This represents the iterative understanding process
            this.stages = [
                {
                    name: 'Initial Understanding',
                    description: 'First encounter with the text/concept',
                    nodes: files.slice(0, Math.min(3, files.length)),
                    color: '#e3f2fd',
                    radius: 80
                },
                {
                    name: 'Contextual Analysis', 
                    description: 'Understanding parts in relation to whole',
                    nodes: files.slice(0, Math.min(6, files.length)),
                    color: '#f3e5f5',
                    radius: 120
                },
                {
                    name: 'Deeper Interpretation',
                    description: 'Refined understanding through iteration',
                    nodes: files.slice(0, Math.min(9, files.length)),
                    color: '#e8f5e8',
                    radius: 160
                },
                {
                    name: 'Comprehensive Understanding',
                    description: 'Whole informs parts, parts inform whole',
                    nodes: files,
                    color: '#fff3e0',
                    radius: 200
                }
            ];

            console.log(`[CircleView] Created ${this.stages.length} stages of understanding`);
        } catch (error) {
            console.error('[CircleView] Error loading circle data:', error);
        }
    }

    render() {
        console.log('[CircleView] Rendering hermeneutic circle');
        
        // Clear existing elements
        this.g.selectAll('*').remove();

        // Add title
        this.g.append('text')
            .attr('x', this.centerX)
            .attr('y', 40)
            .attr('text-anchor', 'middle')
            .attr('font-size', '24px')
            .attr('font-weight', 'bold')
            .attr('fill', '#333')
            .text('Hermeneutic Circle');

        this.g.append('text')
            .attr('x', this.centerX)
            .attr('y', 65)
            .attr('text-anchor', 'middle')
            .attr('font-size', '14px')
            .attr('fill', '#666')
            .text('Iterative Understanding Patterns');

        // Render all stages as concentric circles
        this.stages.forEach((stage, index) => {
            this.renderStage(stage, index);
        });

        // Add central understanding node
        this.g.append('circle')
            .attr('cx', this.centerX)
            .attr('cy', this.centerY)
            .attr('r', 20)
            .attr('fill', '#ff6b35')
            .attr('stroke', '#fff')
            .attr('stroke-width', 3)
            .style('cursor', 'pointer')
            .on('click', () => this.animateCircle());

        this.g.append('text')
            .attr('x', this.centerX)
            .attr('y', this.centerY + 5)
            .attr('text-anchor', 'middle')
            .attr('font-size', '12px')
            .attr('font-weight', 'bold')
            .attr('fill', 'white')
            .style('pointer-events', 'none')
            .text('Understanding');
    }

    renderStage(stage, stageIndex) {
        const g = this.g.append('g')
            .attr('class', `stage-${stageIndex}`)
            .style('opacity', stageIndex <= this.currentStage ? 1 : 0.3);

        // Draw the circle for this stage
        g.append('circle')
            .attr('cx', this.centerX)
            .attr('cy', this.centerY)
            .attr('r', stage.radius)
            .attr('fill', 'none')
            .attr('stroke', stage.color)
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', stageIndex > this.currentStage ? '5,5' : 'none');

        // Add stage label
        g.append('text')
            .attr('x', this.centerX)
            .attr('y', this.centerY - stage.radius - 10)
            .attr('text-anchor', 'middle')
            .attr('font-size', '12px')
            .attr('font-weight', 'bold')
            .attr('fill', '#333')
            .text(stage.name);

        // Position nodes around the circle
        const angleStep = (2 * Math.PI) / stage.nodes.length;
        stage.nodes.forEach((fileItem, nodeIndex) => {
            const angle = nodeIndex * angleStep;
            const x = this.centerX + Math.cos(angle) * stage.radius;
            const y = this.centerY + Math.sin(angle) * stage.radius;

            // Extract file path from file item (could be string or object)
            const filePath = typeof fileItem === 'string' ? fileItem : (fileItem.path || fileItem.filePath || fileItem.name || String(fileItem));
            
            // Ensure we have a valid file path
            if (typeof filePath !== 'string') {
                console.warn('[CircleView] Invalid file path type:', typeof filePath, fileItem);
                return;
            }

            // Extract filename without path and extension
            const fileName = filePath.split('/').pop().replace('.md', '');

            // Node circle
            g.append('circle')
                .attr('cx', x)
                .attr('cy', y)
                .attr('r', 8)
                .attr('fill', stage.color)
                .attr('stroke', '#333')
                .attr('stroke-width', 1)
                .style('cursor', 'pointer')
                .on('click', () => this.handleNodeClick(filePath))
                .on('mouseover', function() { 
                    d3.select(this).attr('r', 10);
                })
                .on('mouseout', function() { 
                    d3.select(this).attr('r', 8);
                });

            // Node label
            g.append('text')
                .attr('x', x)
                .attr('y', y + 20)
                .attr('text-anchor', 'middle')
                .attr('font-size', '10px')
                .attr('fill', '#333')
                .style('pointer-events', 'none')
                .text(fileName.length > 10 ? fileName.substring(0, 10) + '...' : fileName);

            // Draw connection to center (understanding)
            if (stageIndex <= this.currentStage) {
                g.append('line')
                    .attr('x1', x)
                    .attr('y1', y)
                    .attr('x2', this.centerX)
                    .attr('y2', this.centerY)
                    .attr('stroke', stage.color)
                    .attr('stroke-width', 1)
                    .attr('opacity', 0.3);
            }
        });
    }

    animateCircle() {
        console.log('[CircleView] Animating hermeneutic circle progression');
        
        // Progress to next stage
        this.currentStage = (this.currentStage + 1) % this.stages.length;
        
        // Re-render with new stage
        this.render();
        
        // Add some visual feedback
        this.g.selectAll('.stage-' + this.currentStage)
            .transition()
            .duration(1000)
            .style('opacity', 1);
    }

    async handleNodeClick(filePath) {
        console.log(`[CircleView] Entering preview mode for: ${filePath}`);
        
        try {
            // Load document content
            const result = await window.electronAPI.invoke('read-file-content', filePath);
            if (result && result.success && result.content) {
                this.currentDocument = filePath;
                this.documentContent = result.content;
                this.previewMode = true;
                this.zoomLevel = 0;
                
                // Check if we have valid cached summaries
                if (this.areCachedSummariesValid(filePath, this.documentContent)) {
                    // Load from cache
                    this.loadCachedSummaries(filePath);
                    console.log('[CircleView] Loaded summaries from cache');
                } else {
                    // Need to regenerate summaries
                    this.summariesGenerated = false;
                    this.summaryParagraph = null;
                    this.summarySentence = null;
                    
                    // Generate summaries in background if AI is enabled
                    if (this.aiEnabled) {
                        this.generateSummaries();
                    }
                }
                
                // Switch to preview mode
                this.renderPreview();
            } else {
                console.error('[CircleView] Failed to load document content');
                // Fallback to opening in editor
                window.electronAPI.invoke('open-file', filePath);
            }
        } catch (error) {
            console.error('[CircleView] Error loading document:', error);
            // Fallback to opening in editor
            window.electronAPI.invoke('open-file', filePath);
        }
    }

    async generateSummaries() {
        if (this.summariesGenerated || !this.documentContent) {
            console.log('[CircleView] Skipping summary generation:', {
                summariesGenerated: this.summariesGenerated,
                hasDocumentContent: !!this.documentContent
            });
            return;
        }
        
        console.log('[CircleView] 🚀 Starting AI summary generation...', {
            filePath: this.currentDocument,
            aiEnabled: this.aiEnabled,
            contentLength: this.documentContent?.length
        });
        
        try {
            console.log('[CircleView] 📤 Sending API request for summaries...', {
                textContentLength: this.documentContent.length,
                textPreview: this.documentContent.substring(0, 100) + '...'
            });

            const startTime = Date.now();
            
            // Request AI summaries from the main process
            const summaryResult = await window.electronAPI.invoke('generate-document-summaries', {
                content: this.documentContent,
                filePath: this.currentDocument
            });
            
            const duration = Date.now() - startTime;
            
            console.log('[CircleView] 📥 Received API response:', {
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
                this.cacheSummaries(this.currentDocument, this.documentContent, this.summaryParagraph, this.summarySentence);
                
                console.log('[CircleView] ✅ AI summaries generated and cached successfully:', {
                    paragraphLength: this.summaryParagraph?.length,
                    sentenceLength: this.summarySentence?.length
                });
            } else {
                console.warn('[CircleView] ⚠️ AI summary generation failed, using fallback:', summaryResult?.error);
                // Fallback to simple text truncation
                this.generateFallbackSummaries();
            }
        } catch (error) {
            console.error('[CircleView] ❌ Error generating summaries:', error);
            // Fallback to simple text truncation
            this.generateFallbackSummaries();
        }
    }

    generateFallbackSummaries() {
        if (!this.documentContent) return;
        
        // Simple fallback: extract first 3 paragraphs and first sentence
        const paragraphs = this.documentContent.split('\n\n').filter(p => p.trim().length > 0);
        const sentences = this.documentContent.split(/[.!?]+/).filter(s => s.trim().length > 0);
        
        // Take first 3 paragraphs for intermediate summary
        const firstThreeParagraphs = paragraphs.slice(0, 3);
        this.summaryParagraph = firstThreeParagraphs.length > 0 
            ? firstThreeParagraphs.join('\n\n') 
            : this.documentContent.substring(0, 300) + '...';
        
        this.summarySentence = sentences[0] ? sentences[0].trim() + '.' : this.documentContent.substring(0, 100) + '...';
        this.summariesGenerated = true;
        
        // Cache the fallback summaries too
        if (this.currentDocument) {
            this.cacheSummaries(this.currentDocument, this.documentContent, this.summaryParagraph, this.summarySentence);
        }
        
        console.log('[CircleView] Generated and cached fallback summaries (3 paragraphs)');
    }

    renderPreview() {
        console.log('[CircleView] Rendering document preview at zoom level:', this.zoomLevel);
        
        // Clear existing content
        this.g.selectAll('*').remove();
        
        // Add back button
        this.g.append('circle')
            .attr('cx', 50)
            .attr('cy', 50)
            .attr('r', 20)
            .attr('fill', '#007acc')
            .attr('stroke', '#fff')
            .attr('stroke-width', 2)
            .style('cursor', 'pointer')
            .on('click', () => this.exitPreview());
            
        this.g.append('text')
            .attr('x', 50)
            .attr('y', 55)
            .attr('text-anchor', 'middle')
            .attr('font-size', '12px')
            .attr('fill', 'white')
            .style('pointer-events', 'none')
            .text('←');

        // Add document title
        const fileName = this.currentDocument.split('/').pop().replace('.md', '');
        this.g.append('text')
            .attr('x', this.centerX)
            .attr('y', 50)
            .attr('text-anchor', 'middle')
            .attr('font-size', '20px')
            .attr('font-weight', 'bold')
            .attr('fill', '#333')
            .text(fileName);

        // Add zoom level indicator
        this.g.append('text')
            .attr('x', this.centerX)
            .attr('y', 80)
            .attr('text-anchor', 'middle')
            .attr('font-size', '12px')
            .attr('fill', '#666')
            .text(this.getZoomLevelDescription());

        // Render content based on zoom level
        this.renderTextContent();
        
        // Add zoom controls
        this.addZoomControls();
    }

    renderTextContent() {
        const contentGroup = this.g.append('g').attr('class', 'content-group');
        
        let textToShow = '';
        let maxWidth = this.width - 100;
        let startY = 120;
        
        switch(this.zoomLevel) {
            case 0: // Full text
                textToShow = this.documentContent;
                break;
            case 1: // Paragraph summary
                textToShow = this.summaryParagraph || 'Generating summary...';
                break;
            case 2: // Sentence summary
                textToShow = this.summarySentence || 'Generating summary...';
                break;
        }
        
        // Wrap and display text
        this.wrapText(contentGroup, textToShow, 50, startY, maxWidth, 16);
    }

    wrapText(container, text, x, y, maxWidth, lineHeight) {
        const words = text.split(/\s+/);
        let line = '';
        let lineNumber = 0;
        const maxLines = Math.floor((this.height - 150) / lineHeight);
        
        words.forEach((word, index) => {
            const testLine = line + word + ' ';
            const testElement = container.append('text')
                .attr('x', x)
                .attr('y', y + lineNumber * lineHeight)
                .attr('font-size', '14px')
                .attr('fill', '#333')
                .text(testLine);
                
            if (testElement.node().getBBox().width > maxWidth && line !== '') {
                // Line is too long, add the previous line
                container.append('text')
                    .attr('x', x)
                    .attr('y', y + lineNumber * lineHeight)
                    .attr('font-size', '14px')
                    .attr('fill', '#333')
                    .text(line.trim())
                    .style('opacity', 0)
                    .transition()
                    .duration(500)
                    .style('opacity', 1);
                    
                line = word + ' ';
                lineNumber++;
                
                if (lineNumber >= maxLines) {
                    container.append('text')
                        .attr('x', x)
                        .attr('y', y + lineNumber * lineHeight)
                        .attr('font-size', '14px')
                        .attr('fill', '#999')
                        .text('...')
                        .style('opacity', 0)
                        .transition()
                        .duration(500)
                        .style('opacity', 1);
                    return;
                }
            } else {
                line = testLine;
            }
            
            testElement.remove();
            
            // If this is the last word, add the line
            if (index === words.length - 1 && lineNumber < maxLines) {
                container.append('text')
                    .attr('x', x)
                    .attr('y', y + lineNumber * lineHeight)
                    .attr('font-size', '14px')
                    .attr('fill', '#333')
                    .text(line.trim())
                    .style('opacity', 0)
                    .transition()
                    .duration(500)
                    .style('opacity', 1);
            }
        });
    }

    addZoomControls() {
        const controlsGroup = this.g.append('g').attr('class', 'zoom-controls');
        
        // Zoom out button (-)
        controlsGroup.append('circle')
            .attr('cx', this.width - 100)
            .attr('cy', this.height - 80)
            .attr('r', 20)
            .attr('fill', this.zoomLevel < this.maxZoomLevel ? '#ff6b35' : '#ccc')
            .attr('stroke', '#fff')
            .attr('stroke-width', 2)
            .style('cursor', this.zoomLevel < this.maxZoomLevel ? 'pointer' : 'not-allowed')
            .on('click', () => this.zoomOut());
            
        controlsGroup.append('text')
            .attr('x', this.width - 100)
            .attr('y', this.height - 75)
            .attr('text-anchor', 'middle')
            .attr('font-size', '16px')
            .attr('font-weight', 'bold')
            .attr('fill', 'white')
            .style('pointer-events', 'none')
            .text('−');
            
        // Zoom in button (+)
        controlsGroup.append('circle')
            .attr('cx', this.width - 50)
            .attr('cy', this.height - 80)
            .attr('r', 20)
            .attr('fill', this.zoomLevel > 0 ? '#4CAF50' : '#ccc')
            .attr('stroke', '#fff')
            .attr('stroke-width', 2)
            .style('cursor', this.zoomLevel > 0 ? 'pointer' : 'not-allowed')
            .on('click', () => this.zoomIn());
            
        controlsGroup.append('text')
            .attr('x', this.width - 50)
            .attr('y', this.height - 75)
            .attr('text-anchor', 'middle')
            .attr('font-size', '16px')
            .attr('font-weight', 'bold')
            .attr('fill', 'white')
            .style('pointer-events', 'none')
            .text('+');
            
        // Zoom level description
        controlsGroup.append('text')
            .attr('x', this.width - 75)
            .attr('y', this.height - 40)
            .attr('text-anchor', 'middle')
            .attr('font-size', '12px')
            .attr('fill', '#666')
            .text(`${this.zoomLevel}/${this.maxZoomLevel}`);
    }

    zoomOut() {
        if (this.zoomLevel < this.maxZoomLevel) {
            console.log('[CircleView] Zooming out to higher abstraction level');
            
            // Fade out current content
            this.g.select('.content-group')
                .transition()
                .duration(300)
                .style('opacity', 0)
                .on('end', () => {
                    this.zoomLevel++;
                    this.renderTextContent();
                });
        }
    }

    zoomIn() {
        if (this.zoomLevel > 0) {
            console.log('[CircleView] Zooming in to more detailed level');
            
            // Fade out current content
            this.g.select('.content-group')
                .transition()
                .duration(300)
                .style('opacity', 0)
                .on('end', () => {
                    this.zoomLevel--;
                    this.renderTextContent();
                });
        }
    }

    getZoomLevelDescription() {
        switch(this.zoomLevel) {
            case 0: return 'Full Text - Complete Document';
            case 1: return 'Summary - Key Points';
            case 2: return 'Essence - Core Idea';
            default: return 'Unknown Level';
        }
    }

    exitPreview() {
        console.log('[CircleView] Exiting preview mode');
        this.previewMode = false;
        this.currentDocument = null;
        this.documentContent = null;
        this.zoomLevel = 0;
        this.render();
    }

    addControls(container) {
        const controls = document.createElement('div');
        controls.style.position = 'absolute';
        controls.style.top = '10px';
        controls.style.right = '10px';
        controls.style.zIndex = '1000';
        controls.style.background = 'rgba(255, 255, 255, 0.9)';
        controls.style.padding = '15px';
        controls.style.borderRadius = '8px';
        controls.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
        controls.style.fontSize = '12px';
        controls.style.minWidth = '200px';

        if (this.previewMode) {
            controls.innerHTML = `
                <div style="margin-bottom: 15px;">
                    <h4 style="margin: 0 0 10px 0; color: #333;">Document Preview</h4>
                    <p style="margin: 0; color: #666; line-height: 1.4;">
                        Use zoom controls to explore different levels of abstraction
                    </p>
                </div>
                <div style="margin-bottom: 10px;">
                    <label style="display: flex; align-items: center; margin-bottom: 8px;">
                        <input type="checkbox" id="ai-summaries-toggle" ${this.aiEnabled ? 'checked' : ''} 
                               style="margin-right: 5px;">
                        <span style="font-size: 11px;">AI Summaries (experimental)</span>
                    </label>
                </div>
                <div style="margin-bottom: 10px;">
                    <strong>Zoom Levels:</strong><br>
                    <span style="font-size: 11px; color: #666;">
                        • Full Text (zoom level 0)<br>
                        • Summary (zoom level 1)<br>
                        • Essence (zoom level 2)
                    </span>
                </div>
                <div style="margin-bottom: 10px;">
                    <button id="circle-exit-preview" style="padding: 8px 12px; font-size: 11px; background: #007acc; color: white; border: none; border-radius: 4px;">← Back to Circle</button>
                </div>
                <div style="font-size: 10px; color: #999;">
                    ${this.summariesGenerated ? 
                        (this.aiEnabled ? '✓ AI summaries ready' : '✓ Fallback summaries ready') : 
                        '<span class="loading-ellipsis">Generating summaries</span>'}
                </div>
            `;
        } else {
            controls.innerHTML = `
                <div style="margin-bottom: 15px;">
                    <h4 style="margin: 0 0 10px 0; color: #333;">Hermeneutic Circle</h4>
                    <p style="margin: 0; color: #666; line-height: 1.4;">
                        Click any file node to enter preview mode with zoom-based abstraction levels
                    </p>
                </div>
                <div style="margin-bottom: 10px;">
                    <button id="circle-reset" style="padding: 8px 12px; margin-right: 5px; font-size: 11px;">Reset</button>
                    <button id="circle-animate" style="padding: 8px 12px; margin-right: 5px; font-size: 11px;">Animate</button>
                    <button id="circle-export" style="padding: 8px 12px; font-size: 11px; background: #4CAF50; color: white; border: 1px solid #45a049;">📸 Export</button>
                </div>
                <div style="margin-bottom: 10px;">
                    <strong>Current Stage:</strong><br>
                    <span id="current-stage-name" style="color: #007acc;">${this.stages[this.currentStage]?.name || 'Initial'}</span>
                </div>
                <div style="font-size: 11px; color: #888;">
                    <strong>Stages:</strong><br>
                    1. Initial Understanding<br>
                    2. Contextual Analysis<br>
                    3. Deeper Interpretation<br>
                    4. Comprehensive Understanding
                </div>
            `;
        }

        container.appendChild(controls);

        // Add event listeners based on mode
        if (this.previewMode) {
            const aiToggle = document.getElementById('ai-summaries-toggle');
            if (aiToggle) {
                aiToggle.addEventListener('change', (e) => {
                    this.aiEnabled = e.target.checked;
                    console.log('[CircleView] AI summaries', this.aiEnabled ? 'enabled' : 'disabled');
                    
                    // Regenerate summaries if toggled on
                    if (this.aiEnabled && !this.summariesGenerated) {
                        this.generateSummaries();
                    }
                });
            }
            
            const exitButton = document.getElementById('circle-exit-preview');
            if (exitButton) {
                exitButton.addEventListener('click', () => {
                    this.exitPreview();
                });
            }
        } else {
            const resetButton = document.getElementById('circle-reset');
            if (resetButton) {
                resetButton.addEventListener('click', () => {
                    this.currentStage = 0;
                    this.render();
                    const stageName = document.getElementById('current-stage-name');
                    if (stageName) stageName.textContent = this.stages[0].name;
                });
            }

            const animateButton = document.getElementById('circle-animate');
            if (animateButton) {
                animateButton.addEventListener('click', () => {
                    this.animateCircle();
                    const stageName = document.getElementById('current-stage-name');
                    if (stageName) stageName.textContent = this.stages[this.currentStage].name;
                });
            }

            // Export button
            const exportButton = document.getElementById('circle-export');
            if (exportButton) {
                exportButton.addEventListener('click', () => {
                    if (window.exportVisualizationAsPNG) {
                        window.exportVisualizationAsPNG('circle-visualization', 'hermeneutic-circle');
                    }
                });
            }
        }
    }

    async refresh() {
        console.log('[CircleView] Refreshing circle...');
        await this.loadCircleData();
        this.render();
    }

    destroy() {
        if (this.svg) {
            this.svg.remove();
        }
    }
}

// Export for use in renderer
window.CircleView = CircleView;