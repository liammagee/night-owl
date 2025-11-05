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
                background: '#05060c',
                nodeFile: '#4338ca',
                nodeHeading: '#1d4ed8',
                nodeSubheading: '#0f172a',
                nodeFileStroke: '#c084fc',
                nodeHeadingStroke: '#60a5fa',
                nodeSubheadingStroke: '#38bdf8',
                link: '#94a3b8',
                linkHighlight: '#facc15',
                text: '#e2e8f0',
                textBg: 'rgba(8,11,18,0.92)'
            }
        };
        
        // Stats
        this.stats = {
            files: 0,
            headings: 0,
            links: 0,
            avgConnections: 0
        };

        // Instance-level overrides
        this.defaultInstanceOptions = {
            showControls: true,
            enableSelection: false,
            openFileOnClick: true,
            focusScale: 1.2,
            initialScale: null,
            preserveScaleOnFocus: false,
            vizId: 'unified-network-viz'
        };
        this.instanceOptions = { ...this.defaultInstanceOptions };

        // Interaction state
        this.selectionListeners = new Set();
        this.tickListeners = new Set();
        this.selectedNodeId = null;
        this.nodeElements = null;
        this.linkElements = null;
        this.labelElements = null;
        this.backdrop = null;
        this.controlsElement = null;
        this.statElements = null;
        this.pendingFocus = null;
        this.previousSelectedNodeId = null;
        this.currentTransform = null;
        this.userAdjustedZoom = false;
        this.orientationPair = null;
    }

    async initialize(container, config = {}) {
        console.log('[UnifiedNetwork] Initializing visualization');
        this.container = container;
        this.instanceOptions = { ...this.defaultInstanceOptions, ...(config || {}) };
        if (!this.instanceOptions.vizId) {
            this.instanceOptions.vizId = `unified-network-viz-${Math.random().toString(36).slice(2, 8)}`;
        }
        this.currentTransform = null;
        this.userAdjustedZoom = false;

        this.injectVisualizationStyles();

        if (config?.visualizationOptions && typeof config.visualizationOptions === 'object') {
            Object.assign(this.options, config.visualizationOptions);
        }

        // Clear container
        container.innerHTML = '';

        // Create main visualization div
        const vizDiv = document.createElement('div');
        vizDiv.id = this.instanceOptions.vizId;
        vizDiv.style.cssText = 'width: 100%; height: 100%; position: relative;';
        container.appendChild(vizDiv);

        // Create controls panel
        if (this.instanceOptions.showControls) {
            this.createControlsPanel();
        } else {
            this.controlsElement = null;
            this.statElements = null;
        }

        // Create SVG canvas
        this.createSVG(vizDiv);
        this.updateTheme();

        // Load and render data
        await this.refresh();

        if (this.instanceOptions.enableSelection && this.selectedNodeId) {
            this.updateSelectionVisuals();
        }
    }

    createControlsPanel() {
        if (!this.instanceOptions.showControls) {
            this.controlsElement = null;
            this.statElements = null;
            return;
        }

        const controls = document.createElement('div');
        const idPrefix = this.instanceOptions.vizId || 'unified-network-viz';
        const controlId = (suffix) => `${idPrefix}-${suffix}`;
        controls.id = `${idPrefix}-controls`;
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
                <button id="${controlId('refresh')}" data-control="refresh" class="btn" style="padding: 4px 8px; font-size: 11px;">🔄 Refresh</button>
                <button id="${controlId('center')}" data-control="center" class="btn" style="padding: 4px 8px; font-size: 11px;">🎯 Center</button>
                <button id="${controlId('fit')}" data-control="fit" class="btn" style="padding: 4px 8px; font-size: 11px;">📐 Fit</button>
                <button id="${controlId('export')}" data-control="export" class="btn" style="padding: 4px 8px; font-size: 11px;" title="Export as PNG">📸 Export</button>
            </div>
            
            <!-- Options -->
            <div style="border-top: 1px solid #ddd; padding-top: 8px; margin-top: 8px;">
                <!-- Theme Toggle -->
                <div style="margin-bottom: 6px;">
                    <label style="display: flex; align-items: center; cursor: pointer;">
                        <input type="checkbox" id="${controlId('theme-toggle')}" data-control="theme-toggle" style="margin-right: 6px;">
                        <span>Dark Theme</span>
                    </label>
                </div>
                
                <!-- Include Headings -->
                <div style="margin-bottom: 6px;">
                    <label style="display: flex; align-items: center; cursor: pointer;">
                        <input type="checkbox" id="${controlId('headings-toggle')}" data-control="headings-toggle" style="margin-right: 6px;">
                        <span>Show Headings (H1)</span>
                    </label>
                </div>
                
                <!-- Include Subheadings -->
                <div style="margin-bottom: 6px;">
                    <label style="display: flex; align-items: center; cursor: pointer;">
                        <input type="checkbox" id="${controlId('subheadings-toggle')}" data-control="subheadings-toggle" style="margin-right: 6px;">
                        <span>Show Subheadings (H2-H6)</span>
                    </label>
                </div>
                
                <!-- Show Labels -->
                <div style="margin-bottom: 6px;">
                    <label style="display: flex; align-items: center; cursor: pointer;">
                        <input type="checkbox" id="${controlId('labels-toggle')}" data-control="labels-toggle" style="margin-right: 6px;" checked>
                        <span>Show Labels</span>
                    </label>
                </div>
            </div>
            
            <!-- Stats -->
            <div id="${controlId('stats')}" style="border-top: 1px solid #ddd; padding-top: 8px; margin-top: 8px; font-size: 11px; color: #666;">
                <div>Files: <span id="${controlId('stat-files')}" data-stat="files">0</span></div>
                <div>Headings: <span id="${controlId('stat-headings')}" data-stat="headings">0</span></div>
                <div>Links: <span id="${controlId('stat-links')}" data-stat="links">0</span></div>
                <div>Avg Connections: <span id="${controlId('stat-avg')}" data-stat="avg">0</span></div>
            </div>
        `;

        this.container.appendChild(controls);
        this.controlsElement = controls;
        this.statElements = {
            files: controls.querySelector('[data-stat="files"]'),
            headings: controls.querySelector('[data-stat="headings"]'),
            links: controls.querySelector('[data-stat="links"]'),
            avg: controls.querySelector('[data-stat="avg"]')
        };

        // Setup event listeners
        this.setupControlListeners();
    }

    setupControlListeners() {
        if (!this.controlsElement) return;

        // Refresh button
        const refreshBtn = this.controlsElement?.querySelector('[data-control="refresh"]');
        refreshBtn?.addEventListener('click', () => {
            this.refresh();
        });

        // Center button
        const centerBtn = this.controlsElement?.querySelector('[data-control="center"]');
        centerBtn?.addEventListener('click', () => {
            this.centerView();
        });

        // Fit button
        const fitBtn = this.controlsElement?.querySelector('[data-control="fit"]');
        fitBtn?.addEventListener('click', () => {
            this.fitView();
        });

        // Export button
        const exportBtn = this.controlsElement?.querySelector('[data-control="export"]');
        exportBtn?.addEventListener('click', () => {
            this.exportVisualization();
        });

        // Theme toggle
        const themeToggle = this.controlsElement?.querySelector('[data-control="theme-toggle"]');
        if (themeToggle) {
            themeToggle.checked = this.options.theme === 'dark';
            themeToggle.addEventListener('change', (e) => {
                this.options.theme = e.target.checked ? 'dark' : 'light';
                this.updateTheme();
                this.render();
            });
        }

        // Headings toggle
        const headingsToggle = this.controlsElement?.querySelector('[data-control="headings-toggle"]');
        if (headingsToggle) {
            headingsToggle.checked = this.options.includeHeadings;
            headingsToggle.addEventListener('change', (e) => {
                this.options.includeHeadings = e.target.checked;
                this.refresh();
            });
        }

        // Subheadings toggle
        const subheadingsToggle = this.controlsElement?.querySelector('[data-control="subheadings-toggle"]');
        if (subheadingsToggle) {
            subheadingsToggle.checked = this.options.includeSubheadings;
            subheadingsToggle.addEventListener('change', (e) => {
                this.options.includeSubheadings = e.target.checked;
                // Only refresh if headings are enabled
                if (this.options.includeHeadings) {
                    this.refresh();
                }
            });
        }

        // Labels toggle
        const labelsToggle = this.controlsElement?.querySelector('[data-control="labels-toggle"]');
        if (labelsToggle) {
            labelsToggle.checked = this.options.showLabels;
            labelsToggle.addEventListener('change', (e) => {
                this.options.showLabels = e.target.checked;
                this.updateLabelsVisibility();
            });
        }
    }

    createSVG(container) {
        const width = container.clientWidth;
        const height = container.clientHeight;
        
        this.svg = d3.select(container)
            .append('svg')
            .attr('width', width)
            .attr('height', height)
            .style('background', this.getCurrentTheme().background);

        this.backdrop = this.svg.insert('rect', ':first-child')
            .attr('class', 'network-backdrop')
            .attr('x', 0)
            .attr('y', 0)
            .attr('width', width)
            .attr('height', height);
        const theme = this.getCurrentTheme();
        if (this.backdrop && theme) {
            this.backdrop.attr('fill', theme.background);
        }

        // Create groups for different elements
        this.g = this.svg.append('g');
        this.linksGroup = this.g.append('g').attr('class', 'links');
        this.nodesGroup = this.g.append('g').attr('class', 'nodes');
        this.labelsGroup = this.g.append('g').attr('class', 'labels');
        
        // Add zoom behavior
        const zoom = d3.zoom()
            .scaleExtent([0.1, 4])
            .on('zoom', (event) => {
                this.currentTransform = event.transform;
                if (event.sourceEvent && event.sourceEvent.isTrusted !== false) {
                    this.userAdjustedZoom = true;
                }
                this.g.attr('transform', event.transform);
            });
        
        this.svg.call(zoom);
        this.zoomBehavior = zoom;

        if (typeof d3 !== 'undefined') {
            const extent = zoom.scaleExtent();
            let initialTransform = d3.zoomIdentity;
            if (typeof this.instanceOptions.initialScale === 'number' && Number.isFinite(this.instanceOptions.initialScale)) {
                const clamped = Math.max(extent[0], Math.min(extent[1], this.instanceOptions.initialScale));
                initialTransform = d3.zoomIdentity.scale(clamped);
            }
            this.currentTransform = initialTransform;
            this.svg.call(this.zoomBehavior.transform, initialTransform);
        } else {
            const fallbackTransform = { x: 0, y: 0, k: 1 };
            this.currentTransform = fallbackTransform;
            this.g.attr('transform', 'translate(0,0) scale(1)');
        }
        
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
        if (this.backdrop) {
            this.backdrop.attr('fill', theme.background);
        }
        
        // Update controls panel
        if (this.controlsElement) {
            this.controlsElement.style.background = theme.textBg;
            this.controlsElement.style.color = theme.text;
        }
    }

    async refresh() {
        console.log('[UnifiedNetwork] Refreshing visualization');
        
        // Load data
        await this.loadData();

        this.assignNodeLayout();
        
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
                    if (d.type === 'contains') return 90;
                    if (d.type === 'hierarchy') return 70;
                    return 160;
                })
                .strength(Math.min(0.8, this.options.linkStrength + 0.2)))
            .force('charge', d3.forceManyBody()
                .strength(d => {
                    if (d.type === 'file') return -320;
                    if (d.type === 'heading') return -240;
                    return -200;
                }))
            .force('center', d3.forceCenter(this.width / 2, this.height / 2))
            .force('collision', d3.forceCollide()
                .radius(d => this.getNodeRadius(d) + 14)
                .strength(0.95))
            .force('x', d3.forceX(d => d.targetX ?? this.width / 2).strength(0.12))
            .force('y', d3.forceY(d => d.targetY ?? this.height / 2).strength(0.12));
    }

    assignNodeLayout() {
        if (!Array.isArray(this.nodes) || !this.nodes.length) return;
        const width = this.width || (this.container?.clientWidth ?? 960);
        const height = this.height || (this.container?.clientHeight ?? 720);
        const centerX = width / 2;
        const centerY = height / 2;
        const ringRadius = Math.min(width, height) * 0.6;

        const byType = {
            file: [],
            heading: [],
            subheading: [],
            other: []
        };

        const sortByLabel = (list) => list.sort((a, b) => {
            const labelA = (a.displayName || a.name || a.id || '').toLowerCase();
            const labelB = (b.displayName || b.name || b.id || '').toLowerCase();
            return labelA.localeCompare(labelB);
        });

        this.nodes.forEach(node => {
            if (node.type === 'file') {
                byType.file.push(node);
            } else if (node.type === 'heading') {
                byType.heading.push(node);
            } else if (node.type === 'subheading') {
                byType.subheading.push(node);
            } else {
                byType.other.push(node);
            }
            node.displayName = this.truncateLabel(node.name);
        });

        sortByLabel(byType.file);
        sortByLabel(byType.heading);
        sortByLabel(byType.subheading);
        sortByLabel(byType.other);

        const positionRing = (nodes, radius, options = {}) => {
            if (!nodes.length) return;
            const angleOffset = typeof options.phase === 'number' ? options.phase : -Math.PI / 2;
            const step = (Math.PI * 2) / nodes.length;
            nodes.forEach((node, index) => {
                const angle = angleOffset + index * step;
                const targetX = centerX + Math.cos(angle) * radius;
                const targetY = centerY + Math.sin(angle) * radius;
                node.targetX = targetX;
                node.targetY = targetY;
                node.x = node.targetX;
                node.y = node.targetY;
            });
        };

        positionRing(byType.file, ringRadius, { phase: -Math.PI / 2 });
        positionRing(byType.heading, ringRadius * 0.72, { phase: -Math.PI / 2 + (byType.heading.length ? (Math.PI / byType.heading.length) : 0) });
        positionRing(byType.subheading, ringRadius * 0.48, { phase: -Math.PI / 2 + (byType.subheading.length ? (Math.PI / byType.subheading.length) / 2 : 0) });
        positionRing(byType.other, ringRadius * 0.9, { phase: -Math.PI / 2 + Math.PI / 4 });
    }

    truncateLabel(value, max = 16) {
        if (!value) return '';
        const trimmed = value.trim();
        if (trimmed.length <= max) return trimmed;
        return `${trimmed.slice(0, max - 1)}…`;
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
            .enter()
            .append('line')
            .attr('class', d => `network-link ${d.type || 'link'}`)
            .attr('stroke', d => {
                if (d.type === 'contains') return '#4f46e5';
                if (d.type === 'hierarchy') return '#7c3aed';
                return '#94a3b8';
            })
            .attr('stroke-opacity', d => {
                if (d.type === 'contains') return 0.28;
                if (d.type === 'hierarchy') return 0.18;
                return 0.5;
            })
            .attr('stroke-width', d => {
                if (d.type === 'contains') return 1.4;
                if (d.type === 'hierarchy') return 1.2;
                return 2.2;
            });

        // Draw nodes
        const nodes = this.nodesGroup.selectAll('circle')
            .data(this.nodes)
            .enter()
            .append('circle')
            .attr('class', d => `network-node library-node ${d.type || 'file'}`)
            .attr('r', d => this.getNodeRadius(d))
            .attr('fill', d => {
                if (d.type === 'file') return '#f59e0b';
                if (d.type === 'heading') return '#0ea5e9';
                if (d.type === 'subheading') return '#7c3aed';
                return '#475569';
            })
            .attr('stroke', d => {
                if (d.type === 'file') return '#fbbf24';
                if (d.type === 'heading') return '#38bdf8';
                if (d.type === 'subheading') return '#c4b5fd';
                return '#94a3b8';
            })
            .attr('stroke-width', 2.2)
            .style('cursor', 'pointer')
            .call(this.drag());

        nodes.append('title').text(d => d.name);

        this.nodeElements = nodes;
        this.linkElements = links;

        // Draw labels (optional)
        if (this.options.showLabels) {
            const labels = this.labelsGroup.selectAll('text')
                .data(this.nodes)
                .enter()
                .append('text')
                .attr('class', d => `network-label ${d.type || 'file'}`)
                .text(d => d.displayName || this.truncateLabel(d.name))
                .attr('font-size', d => {
                    if (d.type === 'file') return '11px';
                    if (d.type === 'heading') return '10px';
                    return '9px';
                })
                .attr('dx', d => this.getNodeRadius(d) + 3)
                .attr('dy', 3)
                .attr('fill', theme.text)
                .style('pointer-events', 'none');

            this.labelElements = labels;
        } else {
            this.labelElements = null;
        }

        // Hover effects
        const self = this;
        nodes.on('mouseenter', function(event, d) {
            d3.select(this)
                .transition()
                .duration(200)
                .attr('r', self.getNodeRadius(d) * 1.18);
        }).on('mouseleave', function(event, d) {
            d3.select(this)
                .transition()
                .duration(200)
                .attr('r', self.getNodeRadius(d));
        });

        // Click interaction
        nodes.on('click', (event, d) => {
            if (this.instanceOptions.enableSelection) {
                this.setSelectedNode(d.id, { center: true, source: 'click' });
            }
            if (this.instanceOptions.openFileOnClick && d.type === 'file' && window.openFile) {
                window.openFile(d.path);
            }
        });

        this.updateSelectionVisuals();

        // Simulation tick handling
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

                if (this.labelElements) {
                    this.labelElements
                        .attr('x', d => d.x)
                        .attr('y', d => d.y);
                }

                if (this.pendingFocus) {
                    const target = this.getNodeById(this.pendingFocus.nodeId);
                    if (
                        target &&
                        Number.isFinite(target.x) &&
                        Number.isFinite(target.y)
                    ) {
                        this.focusOnNode(this.pendingFocus.nodeId, this.pendingFocus.options || {});
                        this.pendingFocus = null;
                    }
                }

                if (this.tickListeners.size) {
                    const snapshot = this.nodes.map(node => ({
                        id: node.id,
                        x: node.x,
                        y: node.y
                    }));
                    this.tickListeners.forEach(listener => {
                        try {
                            listener(snapshot);
                        } catch (error) {
                            console.error('[UnifiedNetwork] Tick listener error:', error);
                        }
                    });
                }
            });

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
            
            const labels = this.labelsGroup.selectAll('text')
                .data(this.nodes)
                .enter().append('text')
                .attr('class', d => `network-label ${d.type || 'file'}`)
                .text(d => d.displayName || this.truncateLabel(d.name))
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

            this.labelElements = labels;
        } else {
            // Hide labels
            this.labelsGroup.selectAll('*').remove();
            this.labelElements = null;
        }

        this.updateSelectionVisuals();
    }

    setSelectedNode(nodeId, options = {}) {
        if (!this.instanceOptions.enableSelection) return;

        if (!nodeId) {
            this.previousSelectedNodeId = this.selectedNodeId || null;
            this.selectedNodeId = null;
            this.updateSelectionVisuals();
            return;
        }

        const previousSelected = this.selectedNodeId;
        const node = this.getNodeById(nodeId);
        if (!node) return;

        const isSame = previousSelected === nodeId;
        this.selectedNodeId = nodeId;
        if (!isSame) {
            this.previousSelectedNodeId = previousSelected || null;
        }
        this.updateSelectionVisuals();

        if (options.center) {
            this.requestFocusOnNode(nodeId, options);
        }

        if (!isSame || options.force) {
            this.selectionListeners.forEach(listener => {
                try {
                    listener(node, options);
                } catch (error) {
                    console.error('[UnifiedNetwork] Selection listener error:', error);
                }
            });
        }
    }

    updateSelectionVisuals() {
        if (!this.instanceOptions.enableSelection) return;

        const selectedId = this.selectedNodeId;
        const previousId = this.previousSelectedNodeId;

        if (this.nodeElements) {
            const baseRadius = (d) => {
                const radius = this.getNodeRadius(d);
                return Number.isFinite(radius) ? radius : 12;
            };

            const nodeSelection = this.nodeElements
                .classed('selected', d => d.id === selectedId)
                .classed('previous', d => previousId && d.id === previousId);

            if (typeof d3 !== 'undefined' && nodeSelection.transition) {
                nodeSelection
                    .transition('selection-focus')
                    .duration(220)
                    .attr('r', d => {
                        const base = baseRadius(d);
                        if (d.id === selectedId) return base * 1.28;
                        if (previousId && d.id === previousId) return base * 1.14;
                        return base;
                    });
            } else {
                nodeSelection
                    .attr('r', d => {
                        const base = baseRadius(d);
                        if (d.id === selectedId) return base * 1.28;
                        if (previousId && d.id === previousId) return base * 1.14;
                        return base;
                    });
            }
        }

        if (this.linkElements) {
            const linkSelection = this.linkElements
                .classed('active', d => {
                    const sourceId = typeof d.source === 'object' ? d.source.id : d.source;
                    const targetId = typeof d.target === 'object' ? d.target.id : d.target;
                    return sourceId === selectedId || targetId === selectedId;
                })
                .classed('trail', d => {
                    if (!previousId || !selectedId) return false;
                    const sourceId = typeof d.source === 'object' ? d.source.id : d.source;
                    const targetId = typeof d.target === 'object' ? d.target.id : d.target;
                    return (
                        (sourceId === previousId && targetId === selectedId) ||
                        (targetId === previousId && sourceId === selectedId)
                    );
                });

            const computeBaseWidth = (d) => {
                if (d.type === 'contains') return 1.4;
                if (d.type === 'hierarchy') return 1.2;
                return 2.2;
            };

            const computeBaseOpacity = (d) => {
                if (d.type === 'contains') return 0.28;
                if (d.type === 'hierarchy') return 0.18;
                return 0.5;
            };

            const applyLinkAttributes = (selection) => selection
                .attr('stroke-width', d => {
                    const base = computeBaseWidth(d);
                    const sourceId = typeof d.source === 'object' ? d.source.id : d.source;
                    const targetId = typeof d.target === 'object' ? d.target.id : d.target;
                    const isTrail = previousId && selectedId &&
                        ((sourceId === previousId && targetId === selectedId) ||
                        (targetId === previousId && sourceId === selectedId));
                    if (isTrail) return base + 2.2;
                    const isActive = sourceId === selectedId || targetId === selectedId;
                    if (isActive) return base + 1.1;
                    return base;
                })
                .attr('stroke-opacity', d => {
                    const base = computeBaseOpacity(d);
                    const sourceId = typeof d.source === 'object' ? d.source.id : d.source;
                    const targetId = typeof d.target === 'object' ? d.target.id : d.target;
                    const isTrail = previousId && selectedId &&
                        ((sourceId === previousId && targetId === selectedId) ||
                        (targetId === previousId && sourceId === selectedId));
                    if (isTrail) return Math.min(1, base + 0.55);
                    const isActive = sourceId === selectedId || targetId === selectedId;
                    if (isActive) return Math.min(1, base + 0.35);
                    return base;
                });

            if (typeof d3 !== 'undefined' && linkSelection.transition) {
                applyLinkAttributes(
                    linkSelection
                        .transition('selection-focus')
                        .duration(200)
                );
            } else {
                applyLinkAttributes(linkSelection);
            }
        }

        if (this.labelElements) {
            this.labelElements
                .classed('selected', d => d.id === selectedId)
                .classed('previous', d => previousId && d.id === previousId);
        }

        this.updateOrientationHighlight();
    }

    setOrientationHighlight(sourceId, targetId) {
        if (!sourceId || !targetId) {
            this.orientationPair = null;
        } else {
            this.orientationPair = { source: sourceId, target: targetId };
        }
        this.updateOrientationHighlight();
    }

    updateOrientationHighlight() {
        const pair = this.orientationPair;
        const sourceId = pair?.source || null;
        const targetId = pair?.target || null;

        if (this.linkElements) {
            this.linkElements
                .classed('orientation', d => {
                    if (!pair) return false;
                    const linkSource = typeof d.source === 'object' ? d.source.id : d.source;
                    const linkTarget = typeof d.target === 'object' ? d.target.id : d.target;
                    if (!linkSource || !linkTarget) return false;
                    return (linkSource === sourceId && linkTarget === targetId) ||
                           (linkSource === targetId && linkTarget === sourceId);
                });
        }

        if (this.nodeElements) {
            this.nodeElements
                .classed('orientation-forward', d => Boolean(targetId && d.id === targetId));
        }

        if (this.labelElements) {
            this.labelElements
                .classed('orientation-forward', d => Boolean(targetId && d.id === targetId));
        }
    }

    requestFocusOnNode(nodeId, options = {}) {
        const node = this.getNodeById(nodeId);
        if (node && Number.isFinite(node.x) && Number.isFinite(node.y)) {
            this.focusOnNode(nodeId, options);
            this.pendingFocus = null;
        } else {
            this.pendingFocus = {
                nodeId,
                options
            };
        }
    }

    focusOnNode(nodeId, options = {}) {
        if (!this.svg || !this.zoomBehavior) return;
        const node = this.getNodeById(nodeId);
        if (!node || typeof node.x !== 'number' || typeof node.y !== 'number') return;

        const svgNode = this.svg.node();
        const measuredWidth = svgNode?.clientWidth;
        const measuredHeight = svgNode?.clientHeight;
        const width = Number.isFinite(measuredWidth) && measuredWidth > 0 ? measuredWidth : (Number.isFinite(this.width) ? this.width : 0);
        const height = Number.isFinite(measuredHeight) && measuredHeight > 0 ? measuredHeight : (Number.isFinite(this.height) ? this.height : 0);
        if (!width || !height) return;

        if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) {
            this.pendingFocus = {
                nodeId,
                options
            };
            return;
        }

        const rawExtent = typeof this.zoomBehavior.scaleExtent === 'function'
            ? this.zoomBehavior.scaleExtent()
            : [0.1, 4];
        const minScale = Number.isFinite(rawExtent?.[0]) && rawExtent[0] > 0 ? rawExtent[0] : 0.1;
        const maxScale = Number.isFinite(rawExtent?.[1]) && rawExtent[1] > minScale ? rawExtent[1] : Math.max(minScale, 4);

        const currentTransform = this.currentTransform || (typeof d3 !== 'undefined' ? d3.zoomTransform(svgNode) : { k: 1, x: 0, y: 0 });
        const currentScale = Number.isFinite(currentTransform?.k) && currentTransform.k > 0 ? currentTransform.k : 1;

        const preserve = options.preserveScale ?? this.instanceOptions.preserveScaleOnFocus;
        let targetScale;
        if (typeof options.scale === 'number' && Number.isFinite(options.scale)) {
            targetScale = options.scale;
        } else if (preserve) {
            targetScale = currentScale;
        } else {
            targetScale = this.instanceOptions.focusScale || currentScale || 1;
        }

        targetScale = Math.max(minScale, Math.min(maxScale, Number.isFinite(targetScale) && targetScale > 0 ? targetScale : 1));
        if (!Number.isFinite(targetScale) || targetScale <= 0) {
            targetScale = 1;
        }

        let translateX = width / 2 - node.x * targetScale;
        let translateY = height / 2 - node.y * targetScale;
        if (!Number.isFinite(translateX)) translateX = 0;
        if (!Number.isFinite(translateY)) translateY = 0;

        if (typeof d3 !== 'undefined') {
            const transform = d3.zoomIdentity.translate(translateX, translateY).scale(targetScale);
            if (!Number.isFinite(transform.k)) {
                return;
            }
            const duration = 0;
            this.svg.transition('focus-on-node')
                .duration(duration)
                .call(this.zoomBehavior.transform, transform);
            this.currentTransform = transform;
        } else {
            this.currentTransform = { x: translateX, y: translateY, k: targetScale };
            this.g.attr('transform', `translate(${translateX},${translateY}) scale(${targetScale})`);
        }
    }

    getNodeById(nodeId) {
        if (!nodeId) return null;
        return this.nodes.find(node => node.id === nodeId) || null;
    }

    getNodes() {
        return this.nodes;
    }

    getLinks() {
        return this.links;
    }

    addSelectionListener(listener) {
        if (typeof listener === 'function') {
            this.selectionListeners.add(listener);
        }
    }

    removeSelectionListener(listener) {
        if (typeof listener === 'function') {
            this.selectionListeners.delete(listener);
        }
    }

    addTickListener(listener) {
        if (typeof listener === 'function') {
            this.tickListeners.add(listener);
        }
    }

    removeTickListener(listener) {
        if (typeof listener === 'function') {
            this.tickListeners.delete(listener);
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
        if (this.statElements) {
            if (this.statElements.files) {
                this.statElements.files.textContent = this.stats.files;
            }
            if (this.statElements.headings) {
                this.statElements.headings.textContent = this.stats.headings;
            }
            if (this.statElements.links) {
                this.statElements.links.textContent = this.stats.links;
            }
            if (this.statElements.avg) {
                this.statElements.avg.textContent = this.stats.avgConnections;
            }
        }
    }

    injectVisualizationStyles() {
        if (document.getElementById('library-network-visual-styles')) return;
        const style = document.createElement('style');
        style.id = 'library-network-visual-styles';
        style.textContent = `
            .network-node.library-node.file {
                filter: drop-shadow(0 0 6px rgba(245,158,11,0.22));
            }
            .network-node.library-node.heading {
                filter: drop-shadow(0 0 5px rgba(34,211,238,0.24));
            }
            .network-node.library-node.subheading {
                filter: drop-shadow(0 0 4px rgba(165,180,252,0.25));
            }
            .network-node.library-node.selected {
                stroke-width: 3 !important;
                filter: drop-shadow(0 0 10px rgba(250,204,21,0.45));
            }
            .network-label {
                font-family: 'IBM Plex Mono','Fira Code','Courier New',monospace;
                letter-spacing: 0.04em;
                text-shadow: 0 0 6px rgba(6,10,19,0.85);
                paint-order: stroke fill;
                stroke: rgba(2,6,14,0.7);
                stroke-width: 0.6px;
            }
            .network-link.active {
                stroke: #facc15 !important;
                stroke-opacity: 0.85 !important;
            }
            .network-link.trail {
                stroke: #fde68a !important;
                stroke-opacity: 0.95 !important;
            }
            .network-link.orientation {
                stroke: #0ea5e9 !important;
                stroke-width: 3 !important;
                stroke-opacity: 0.98 !important;
            }
            .network-node.orientation-forward {
                stroke: #0ea5e9 !important;
                stroke-width: 3.4 !important;
                filter: drop-shadow(0 0 10px rgba(14,165,233,0.55));
            }
            .network-label.orientation-forward {
                fill: #bae6fd !important;
                font-weight: 600;
                text-shadow: 0 0 10px rgba(14,165,233,0.6);
            }
        `;
        document.head.appendChild(style);
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
                await window.exportVisualizationAsPNG(this.instanceOptions.vizId || 'unified-network-viz', filename);
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
        this.selectionListeners.clear();
        this.tickListeners.clear();
        this.selectedNodeId = null;
        this.nodeElements = null;
        this.linkElements = null;
        this.labelElements = null;
        this.backdrop = null;
        this.controlsElement = null;
        this.statElements = null;
        this.container = null;
        this.pendingFocus = null;
        this.previousSelectedNodeId = null;
        this.orientationPair = null;
    }
}

// Export for use
window.UnifiedNetworkVisualization = UnifiedNetworkVisualization;

console.log('[UnifiedNetwork] Module loaded');
