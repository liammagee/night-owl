// Unified Network Visualization Module
// Combines network and graph views with configurable options

class UnifiedNetworkVisualization {
    constructor() {
        this.nodes = [];
        this.links = [];
        this.simulation = null;
        this.svg = null;
        this.container = null;
        
        // Configuration options
        this.options = {
            includeHeadings: false,  // Show headings as nodes
            includeSubheadings: false, // Show subheadings (h2-h6) as nodes
            theme: 'light', // 'light' or 'dark'
            showLabels: true,
            showStats: true,
            nodeSize: 'normal', // 'small', 'normal', 'large'
            linkStrength: 0.5
        };
        
        // Color schemes
        this.themes = {
            light: {
                background: '#f8f9fa',
                nodeFile: '#4CAF50',
                nodeHeading: '#2196F3',
                nodeSubheading: '#00BCD4',
                nodeFileStroke: '#388E3C',
                nodeHeadingStroke: '#1976D2',
                nodeSubheadingStroke: '#0097A7',
                link: '#999',
                linkHighlight: '#333',
                text: '#333',
                textBg: 'rgba(255, 255, 255, 0.9)'
            },
            dark: {
                background: '#1e1e1e',
                nodeFile: '#66BB6A',
                nodeHeading: '#42A5F5',
                nodeSubheading: '#26C6DA',
                nodeFileStroke: '#4CAF50',
                nodeHeadingStroke: '#2196F3',
                nodeSubheadingStroke: '#00BCD4',
                link: '#666',
                linkHighlight: '#aaa',
                text: '#fff',
                textBg: 'rgba(30, 30, 30, 0.9)'
            }
        };
        
        // Stats
        this.stats = {
            files: 0,
            headings: 0,
            links: 0,
            avgConnections: 0
        };
    }

    async initialize(container) {
        console.log('[UnifiedNetwork] Initializing visualization');
        this.container = container;
        
        // Clear container
        container.innerHTML = '';
        
        // Create main visualization div
        const vizDiv = document.createElement('div');
        vizDiv.id = 'unified-network-viz';
        vizDiv.style.cssText = 'width: 100%; height: 100%; position: relative;';
        container.appendChild(vizDiv);
        
        // Create controls panel
        this.createControlsPanel();
        
        // Create SVG canvas
        this.createSVG(vizDiv);
        
        // Load and render data
        await this.refresh();
    }

    createControlsPanel() {
        const controls = document.createElement('div');
        controls.id = 'unified-network-controls';
        controls.style.cssText = `
            position: absolute;
            top: 10px;
            right: 10px;
            background: ${this.getCurrentTheme().textBg};
            padding: 12px;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            font-size: 12px;
            z-index: 1000;
            min-width: 200px;
        `;
        
        controls.innerHTML = `
            <div style="margin-bottom: 10px; font-weight: bold; font-size: 13px;">Network Visualization</div>
            
            <!-- Action Buttons -->
            <div style="margin-bottom: 10px; display: flex; gap: 4px;">
                <button id="unified-refresh" class="btn" style="padding: 4px 8px; font-size: 11px;">🔄 Refresh</button>
                <button id="unified-center" class="btn" style="padding: 4px 8px; font-size: 11px;">🎯 Center</button>
                <button id="unified-fit" class="btn" style="padding: 4px 8px; font-size: 11px;">📐 Fit</button>
                <button id="unified-export" class="btn" style="padding: 4px 8px; font-size: 11px;" title="Export as PNG">📸 Export</button>
            </div>
            
            <!-- Options -->
            <div style="border-top: 1px solid #ddd; padding-top: 8px; margin-top: 8px;">
                <!-- Theme Toggle -->
                <div style="margin-bottom: 6px;">
                    <label style="display: flex; align-items: center; cursor: pointer;">
                        <input type="checkbox" id="theme-toggle" style="margin-right: 6px;">
                        <span>Dark Theme</span>
                    </label>
                </div>
                
                <!-- Include Headings -->
                <div style="margin-bottom: 6px;">
                    <label style="display: flex; align-items: center; cursor: pointer;">
                        <input type="checkbox" id="headings-toggle" style="margin-right: 6px;">
                        <span>Show Headings (H1)</span>
                    </label>
                </div>
                
                <!-- Include Subheadings -->
                <div style="margin-bottom: 6px;">
                    <label style="display: flex; align-items: center; cursor: pointer;">
                        <input type="checkbox" id="subheadings-toggle" style="margin-right: 6px;">
                        <span>Show Subheadings (H2-H6)</span>
                    </label>
                </div>
                
                <!-- Show Labels -->
                <div style="margin-bottom: 6px;">
                    <label style="display: flex; align-items: center; cursor: pointer;">
                        <input type="checkbox" id="labels-toggle" style="margin-right: 6px;" checked>
                        <span>Show Labels</span>
                    </label>
                </div>
            </div>
            
            <!-- Stats -->
            <div id="unified-stats" style="border-top: 1px solid #ddd; padding-top: 8px; margin-top: 8px; font-size: 11px; color: #666;">
                <div>Files: <span id="stat-files">0</span></div>
                <div>Headings: <span id="stat-headings">0</span></div>
                <div>Links: <span id="stat-links">0</span></div>
                <div>Avg Connections: <span id="stat-avg">0</span></div>
            </div>
        `;
        
        this.container.appendChild(controls);
        
        // Setup event listeners
        this.setupControlListeners();
    }

    setupControlListeners() {
        // Refresh button
        document.getElementById('unified-refresh')?.addEventListener('click', () => {
            this.refresh();
        });
        
        // Center button
        document.getElementById('unified-center')?.addEventListener('click', () => {
            this.centerView();
        });
        
        // Fit button
        document.getElementById('unified-fit')?.addEventListener('click', () => {
            this.fitView();
        });
        
        // Export button
        document.getElementById('unified-export')?.addEventListener('click', () => {
            this.exportVisualization();
        });
        
        // Theme toggle
        document.getElementById('theme-toggle')?.addEventListener('change', (e) => {
            this.options.theme = e.target.checked ? 'dark' : 'light';
            this.updateTheme();
            this.render();
        });
        
        // Headings toggle
        document.getElementById('headings-toggle')?.addEventListener('change', (e) => {
            this.options.includeHeadings = e.target.checked;
            this.refresh();
        });
        
        // Subheadings toggle
        document.getElementById('subheadings-toggle')?.addEventListener('change', (e) => {
            this.options.includeSubheadings = e.target.checked;
            // Only refresh if headings are enabled
            if (this.options.includeHeadings) {
                this.refresh();
            }
        });
        
        // Labels toggle
        document.getElementById('labels-toggle')?.addEventListener('change', (e) => {
            this.options.showLabels = e.target.checked;
            this.updateLabelsVisibility();
        });
    }

    createSVG(container) {
        const width = container.clientWidth;
        const height = container.clientHeight;
        
        this.svg = d3.select(container)
            .append('svg')
            .attr('width', width)
            .attr('height', height)
            .style('background', this.getCurrentTheme().background);
        
        // Create groups for different elements
        this.g = this.svg.append('g');
        this.linksGroup = this.g.append('g').attr('class', 'links');
        this.nodesGroup = this.g.append('g').attr('class', 'nodes');
        this.labelsGroup = this.g.append('g').attr('class', 'labels');
        
        // Add zoom behavior
        const zoom = d3.zoom()
            .scaleExtent([0.1, 4])
            .on('zoom', (event) => {
                this.g.attr('transform', event.transform);
            });
        
        this.svg.call(zoom);
        this.zoomBehavior = zoom;
        
        // Store dimensions
        this.width = width;
        this.height = height;
    }

    getCurrentTheme() {
        return this.themes[this.options.theme];
    }

    updateTheme() {
        const theme = this.getCurrentTheme();
        
        // Update background
        if (this.svg) {
            this.svg.style('background', theme.background);
        }
        
        // Update controls panel
        const controls = document.getElementById('unified-network-controls');
        if (controls) {
            controls.style.background = theme.textBg;
            controls.style.color = theme.text;
        }
    }

    async refresh() {
        console.log('[UnifiedNetwork] Refreshing visualization');
        
        // Load data
        await this.loadData();
        
        // Create force simulation
        this.createSimulation();
        
        // Render
        this.render();
        
        // Update stats
        this.updateStats();
    }

    async loadData() {
        try {
            // Get filtered files
            const result = await window.getFilteredVisualizationFiles();
            const files = result.files;
            
            console.log(`[UnifiedNetwork] Processing ${files.length} files`);
            
            // Clear existing data
            this.nodes = [];
            this.links = [];
            const nodeMap = new Map();
            
            // Process each file
            for (const file of files) {
                // Add file node
                const fileNode = {
                    id: file.name,
                    name: file.name.replace(/\.md$/, ''),
                    type: 'file',
                    path: file.path,
                    group: 1
                };
                this.nodes.push(fileNode);
                nodeMap.set(file.name, fileNode);
                
                // Get file content
                const content = await this.getFileContent(file.path);
                if (!content) continue;
                
                // Extract headings if enabled
                if (this.options.includeHeadings) {
                    this.extractHeadings(content, file, nodeMap);
                }
                
                // Extract internal links
                const links = this.parseInternalLinks(content, file.name);
                for (const link of links) {
                    // Only add links to files that exist
                    if (nodeMap.has(link.target) || link.target.startsWith('heading:')) {
                        this.links.push(link);
                    }
                }
            }
            
            console.log(`[UnifiedNetwork] Created ${this.nodes.length} nodes and ${this.links.length} links`);
            
        } catch (error) {
            console.error('[UnifiedNetwork] Error loading data:', error);
        }
    }

    extractHeadings(content, file, nodeMap) {
        const lines = content.split('\n');
        let lastH1 = null;
        
        for (const line of lines) {
            const match = line.match(/^(#{1,6})\s+(.+)$/);
            if (!match) continue;
            
            const level = match[1].length;
            const text = match[2].trim();
            
            // Skip if we're not including subheadings and this is h2-h6
            if (level > 1 && !this.options.includeSubheadings) continue;
            
            const headingId = `heading:${file.name}:${text}`;
            const headingNode = {
                id: headingId,
                name: text,
                type: level === 1 ? 'heading' : 'subheading',
                level: level,
                group: level + 1,
                parent: file.name
            };
            
            this.nodes.push(headingNode);
            nodeMap.set(headingId, headingNode);
            
            // Create link from file to heading
            this.links.push({
                source: file.name,
                target: headingId,
                type: 'contains'
            });
            
            // For subheadings, link to parent heading if exists
            if (level > 1 && lastH1) {
                this.links.push({
                    source: lastH1,
                    target: headingId,
                    type: 'hierarchy'
                });
            }
            
            if (level === 1) {
                lastH1 = headingId;
            }
        }
    }

    parseInternalLinks(content, sourceName) {
        const links = [];
        const linkRegex = /\[\[([^\]]+)\]\]/g;
        const mdLinkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
        
        let match;
        
        // Parse wiki-style links
        while ((match = linkRegex.exec(content)) !== null) {
            let targetName = match[1].trim();
            if (!targetName.endsWith('.md')) {
                targetName += '.md';
            }
            links.push({
                source: sourceName,
                target: targetName,
                type: 'reference'
            });
        }
        
        // Parse markdown links
        while ((match = mdLinkRegex.exec(content)) !== null) {
            const url = match[2].trim();
            if (url.startsWith('./') || url.startsWith('../') || !url.includes('://')) {
                let targetName = url.replace(/^\.\//, '').replace(/^\.\.\//, '');
                if (!targetName.endsWith('.md') && !targetName.includes('#')) {
                    targetName += '.md';
                }
                targetName = targetName.split('#')[0]; // Remove anchors
                if (targetName) {
                    links.push({
                        source: sourceName,
                        target: targetName,
                        type: 'reference'
                    });
                }
            }
        }
        
        return links;
    }

    async getFileContent(filePath) {
        try {
            if (window.electronAPI) {
                const result = await window.electronAPI.invoke('read-file-content', filePath);
                return result.success ? result.content : null;
            }
            return null;
        } catch (error) {
            console.error(`[UnifiedNetwork] Error reading file ${filePath}:`, error);
            return null;
        }
    }

    createSimulation() {
        // Create force simulation
        this.simulation = d3.forceSimulation(this.nodes)
            .force('link', d3.forceLink(this.links)
                .id(d => d.id)
                .distance(d => {
                    // Different distances for different link types
                    if (d.type === 'contains') return 50;
                    if (d.type === 'hierarchy') return 30;
                    return 80;
                })
                .strength(this.options.linkStrength))
            .force('charge', d3.forceManyBody()
                .strength(d => {
                    // Different charge for different node types
                    if (d.type === 'file') return -300;
                    if (d.type === 'heading') return -200;
                    return -100;
                }))
            .force('center', d3.forceCenter(this.width / 2, this.height / 2))
            .force('collision', d3.forceCollide()
                .radius(d => this.getNodeRadius(d) + 5));
    }

    getNodeRadius(d) {
        // Safety check
        if (!d || typeof d !== 'object') {
            console.warn('[UnifiedNetwork] getNodeRadius called with invalid data:', d);
            return 12; // default size
        }
        
        const sizes = {
            small: { file: 8, heading: 6, subheading: 4 },
            normal: { file: 12, heading: 10, subheading: 8 },
            large: { file: 16, heading: 14, subheading: 12 }
        };
        
        const sizeMap = sizes[this.options.nodeSize] || sizes.normal;
        return sizeMap[d.type] || sizeMap.file;
    }

    render() {
        const theme = this.getCurrentTheme();
        
        // Clear existing elements
        this.linksGroup.selectAll('*').remove();
        this.nodesGroup.selectAll('*').remove();
        this.labelsGroup.selectAll('*').remove();
        
        // Draw links
        const links = this.linksGroup.selectAll('line')
            .data(this.links)
            .enter().append('line')
            .attr('stroke', d => {
                if (d.type === 'contains') return theme.link;
                if (d.type === 'hierarchy') return theme.link;
                return theme.link;
            })
            .attr('stroke-opacity', d => {
                if (d.type === 'contains') return 0.3;
                if (d.type === 'hierarchy') return 0.2;
                return 0.6;
            })
            .attr('stroke-width', d => {
                if (d.type === 'contains') return 1;
                if (d.type === 'hierarchy') return 1;
                return 2;
            });
        
        // Draw nodes
        const nodes = this.nodesGroup.selectAll('circle')
            .data(this.nodes)
            .enter().append('circle')
            .attr('r', d => this.getNodeRadius(d))
            .attr('fill', d => {
                if (d.type === 'file') return theme.nodeFile;
                if (d.type === 'heading') return theme.nodeHeading;
                if (d.type === 'subheading') return theme.nodeSubheading;
                return theme.nodeFile;
            })
            .attr('stroke', d => {
                if (d.type === 'file') return theme.nodeFileStroke;
                if (d.type === 'heading') return theme.nodeHeadingStroke;
                if (d.type === 'subheading') return theme.nodeSubheadingStroke;
                return theme.nodeFileStroke;
            })
            .attr('stroke-width', 2)
            .style('cursor', 'pointer')
            .call(this.drag());
        
        // Draw labels
        if (this.options.showLabels) {
            const labels = this.labelsGroup.selectAll('text')
                .data(this.nodes)
                .enter().append('text')
                .text(d => d.name)
                .attr('font-size', d => {
                    if (d.type === 'file') return '11px';
                    if (d.type === 'heading') return '10px';
                    return '9px';
                })
                .attr('dx', d => this.getNodeRadius(d) + 3)
                .attr('dy', 3)
                .attr('fill', theme.text)
                .style('pointer-events', 'none');
        }
        
        // Add hover effects
        const self = this;
        nodes.on('mouseenter', function(event, d) {
            d3.select(this)
                .transition()
                .duration(200)
                .attr('r', self.getNodeRadius(d) * 1.5);
        })
        .on('mouseleave', function(event, d) {
            d3.select(this)
                .transition()
                .duration(200)
                .attr('r', self.getNodeRadius(d));
        });
        
        // Add click handler for files
        nodes.on('click', (event, d) => {
            if (d.type === 'file' && window.openFile) {
                window.openFile(d.path);
            }
        });
        
        // Update positions on simulation tick
        if (this.simulation) {
            this.simulation.on('tick', () => {
                links
                    .attr('x1', d => d.source.x)
                    .attr('y1', d => d.source.y)
                    .attr('x2', d => d.target.x)
                    .attr('y2', d => d.target.y);
                
                nodes
                    .attr('cx', d => d.x)
                    .attr('cy', d => d.y);
                
                if (this.options.showLabels) {
                    this.labelsGroup.selectAll('text')
                        .attr('x', d => d.x)
                        .attr('y', d => d.y);
                }
            });
            
            // Restart simulation
            this.simulation.alpha(1).restart();
        }
    }

    drag() {
        return d3.drag()
            .on('start', (event, d) => {
                if (!event.active) this.simulation.alphaTarget(0.3).restart();
                d.fx = d.x;
                d.fy = d.y;
            })
            .on('drag', (event, d) => {
                d.fx = event.x;
                d.fy = event.y;
            })
            .on('end', (event, d) => {
                if (!event.active) this.simulation.alphaTarget(0);
                d.fx = null;
                d.fy = null;
            });
    }

    updateLabelsVisibility() {
        if (this.options.showLabels) {
            // Re-render labels
            this.labelsGroup.selectAll('*').remove();
            const theme = this.getCurrentTheme();
            
            this.labelsGroup.selectAll('text')
                .data(this.nodes)
                .enter().append('text')
                .text(d => d.name)
                .attr('font-size', d => {
                    if (d.type === 'file') return '11px';
                    if (d.type === 'heading') return '10px';
                    return '9px';
                })
                .attr('x', d => d.x)
                .attr('y', d => d.y)
                .attr('dx', d => this.getNodeRadius(d) + 3)
                .attr('dy', 3)
                .attr('fill', theme.text)
                .style('pointer-events', 'none');
        } else {
            // Hide labels
            this.labelsGroup.selectAll('*').remove();
        }
    }

    centerView() {
        if (!this.svg || !this.zoomBehavior) return;
        
        this.svg.transition()
            .duration(750)
            .call(this.zoomBehavior.transform, d3.zoomIdentity);
    }

    fitView() {
        if (!this.svg || !this.g || !this.zoomBehavior) return;
        
        // Get the bounding box of all elements
        const bounds = this.g.node().getBBox();
        const width = this.svg.node().clientWidth;
        const height = this.svg.node().clientHeight;
        
        const dx = bounds.width;
        const dy = bounds.height;
        const x = bounds.x + bounds.width / 2;
        const y = bounds.y + bounds.height / 2;
        
        const scale = 0.9 / Math.max(dx / width, dy / height);
        const translate = [width / 2 - scale * x, height / 2 - scale * y];
        
        this.svg.transition()
            .duration(750)
            .call(this.zoomBehavior.transform, 
                d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale));
    }

    updateStats() {
        // Calculate stats
        this.stats.files = this.nodes.filter(n => n.type === 'file').length;
        this.stats.headings = this.nodes.filter(n => n.type === 'heading' || n.type === 'subheading').length;
        this.stats.links = this.links.length;
        
        // Calculate average connections
        const connectionCount = new Map();
        for (const link of this.links) {
            const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
            const targetId = typeof link.target === 'object' ? link.target.id : link.target;
            
            connectionCount.set(sourceId, (connectionCount.get(sourceId) || 0) + 1);
            connectionCount.set(targetId, (connectionCount.get(targetId) || 0) + 1);
        }
        
        const avgConnections = connectionCount.size > 0 
            ? Array.from(connectionCount.values()).reduce((a, b) => a + b, 0) / connectionCount.size
            : 0;
        
        this.stats.avgConnections = avgConnections.toFixed(1);
        
        // Update UI
        document.getElementById('stat-files').textContent = this.stats.files;
        document.getElementById('stat-headings').textContent = this.stats.headings;
        document.getElementById('stat-links').textContent = this.stats.links;
        document.getElementById('stat-avg').textContent = this.stats.avgConnections;
    }

    async exportVisualization() {
        if (!this.svg) {
            console.error('[UnifiedNetwork] No SVG to export');
            return;
        }

        try {
            // Generate filename based on current settings
            const themeString = this.options.theme;
            const labelsString = this.options.showLabels ? 'labeled' : 'unlabeled';
            const headingsString = this.options.includeHeadings ? (this.options.includeSubheadings ? 'all-headings' : 'h1-only') : 'files-only';
            const filename = `network-graph-${themeString}-${labelsString}-${headingsString}`;
            
            console.log(`[UnifiedNetwork] Exporting with settings: theme=${themeString}, labels=${this.options.showLabels}, headings=${this.options.includeHeadings}, subheadings=${this.options.includeSubheadings}`);
            
            // Export the current visualization container directly
            // The export function will capture the current visual state including theme and labels
            if (window.exportVisualizationAsPNG) {
                await window.exportVisualizationAsPNG('unified-network-viz', filename);
            }
            
        } catch (error) {
            console.error('[UnifiedNetwork] Export error:', error);
        }
    }

    destroy() {
        if (this.simulation) {
            this.simulation.stop();
        }
        if (this.container) {
            this.container.innerHTML = '';
        }
    }
}

// Export for use
window.UnifiedNetworkVisualization = UnifiedNetworkVisualization;

console.log('[UnifiedNetwork] Module loaded');