/**
 * Graph visualization module for conceptual relationships
 * Uses D3.js for force-directed graph layout
 * D3 is loaded globally from lib/d3.min.js
 *
 * @module graph
 */

/**
 * GraphView class for visualizing document relationships
 * Renders an interactive force-directed graph showing:
 * - Document files as nodes
 * - Headings within documents
 * - Links between documents (internal references)
 * - Tags extracted from documents
 *
 * @class
 * @example
 * const graph = new GraphView();
 * await graph.initialize(document.getElementById('graph-container'));
 */
class GraphView {
    /**
     * Create a new GraphView instance
     * @constructor
     */
    constructor() {
        /** @type {Array<Object>} Array of graph nodes */
        this.nodes = [];
        /** @type {Array<Object>} Array of graph links */
        this.links = [];
        /** @type {Object|null} D3 force simulation instance */
        this.simulation = null;
        /** @type {Object|null} D3 SVG selection */
        this.svg = null;
        /** @type {Object|null} D3 group element for zoom/pan */
        this.g = null;
        /** @type {string|null} Path to currently focused file */
        this.currentFile = null;
        /** @type {Map<string, string>} Map of file paths to their content */
        this.allFiles = new Map();
        /** @type {Map<string, Object>} Map of node IDs to node objects */
        this.nodeMap = new Map();
        /** @type {Object|null} Mini-map SVG selection */
        this.minimap = null;
        /** @type {Object|null} Mini-map viewport rectangle */
        this.minimapViewport = null;
        /** @type {boolean} Whether mini-map is visible */
        this.minimapVisible = true;
        /** @type {Object|null} D3 zoom behavior reference */
        this.zoomBehavior = null;
        /** @type {Object|null} Current transform state */
        this.currentTransform = d3.zoomIdentity;
        /** @type {Object} Custom node colors by type/level */
        this.customColors = this.loadCustomColors();
        /** @type {Object} Default color scheme */
        this.defaultColors = {
            file: '#E91E63',       // Pink for files
            tag: '#FF9800',        // Orange for tags
            h1: '#2196F3',         // Blue
            h2: '#03A9F4',         // Light Blue
            h3: '#00BCD4',         // Cyan
            h4: '#009688',         // Teal
            h5: '#4CAF50',         // Green
            h6: '#8BC34A'          // Light Green
        };
    }

    /**
     * Initialize the graph visualization
     * Sets up SVG, zoom behavior, and loads initial data
     *
     * @async
     * @param {HTMLElement} container - DOM element to render the graph into
     * @returns {Promise<void>}
     */
    async initialize(container) {
        console.log('[GraphView] Initializing graph visualization');
        
        // Clear any existing content
        container.innerHTML = '';
        
        // Create container div
        const graphContainer = document.createElement('div');
        graphContainer.id = 'graph-container';
        graphContainer.style.width = '100%';
        graphContainer.style.height = '100%';
        graphContainer.style.position = 'relative';
        graphContainer.style.background = '#1e1e1e';
        container.appendChild(graphContainer);

        // Create SVG
        this.svg = d3.select(graphContainer)
            .append('svg')
            .attr('width', '100%')
            .attr('height', '100%')
            .style('cursor', 'grab');

        // Get dimensions
        const rect = graphContainer.getBoundingClientRect();
        this.width = rect.width;
        this.height = rect.height;

        // Create a group for zoom/pan
        this.g = this.svg.append('g');

        // Add zoom behavior
        this.zoomBehavior = d3.zoom()
            .scaleExtent([0.1, 4])
            .on('zoom', (event) => {
                this.currentTransform = event.transform;
                this.g.attr('transform', event.transform);
                this.updateMinimapViewport();
            });

        this.svg.call(this.zoomBehavior);

        // Define arrow markers for directed links
        this.svg.append('defs').append('marker')
            .attr('id', 'arrowhead')
            .attr('viewBox', '-0 -5 10 10')
            .attr('refX', 20)
            .attr('refY', 0)
            .attr('orient', 'auto')
            .attr('markerWidth', 8)
            .attr('markerHeight', 8)
            .attr('xoverflow', 'visible')
            .append('path')
            .attr('d', 'M 0,-5 L 10,0 L 0,5')
            .attr('fill', '#666')
            .style('stroke', 'none');

        // Initialize the graph
        await this.loadGraphData();
        this.createForceSimulation();
        this.render();

        // Add controls
        this.addControls(graphContainer);

        // Create mini-map
        this.createMinimap(graphContainer);
    }

    /**
     * Load graph data from workspace files
     * Processes markdown files to extract nodes (files, headings, tags)
     * and links (references, hierarchy, tags)
     *
     * @async
     * @returns {Promise<void>}
     */
    async loadGraphData() {
        console.log('[GraphView] Loading graph data');
        
        try {
            // Get filtered files for visualization
            const result = await window.getFilteredVisualizationFiles();
            const files = result.files;
            
            console.log(`[GraphView] Using ${files.length} files (filtered from ${result.totalFiles} total)`);
            console.log('[GraphView] Applied filters:', result.filters);
            
            if (!files || files.length === 0) {
                console.log('[GraphView] No files available after filtering');
                return;
            }

            // Clear existing data
            this.nodes = [];
            this.links = [];
            this.nodeMap.clear();
            this.allFiles.clear();

            // Store links to be created after all nodes are processed
            this.pendingLinks = [];

            // First pass: Process each file to create nodes
            for (const fileItem of files) {
                // Extract file path from file item (could be string or object)
                const filePath = typeof fileItem === 'string' ? fileItem : (fileItem.path || fileItem.filePath || fileItem.name || String(fileItem));
                
                // Ensure we have a valid file path
                if (typeof filePath !== 'string') {
                    console.warn('[GraphView] Invalid file path type:', typeof filePath, fileItem);
                    continue;
                }
                
                if (filePath.endsWith('.md') || filePath.endsWith('.markdown')) {
                    await this.processFile(filePath);
                }
            }

            // Second pass: Create all the links now that all nodes exist
            console.log(`[GraphView] Processing ${this.pendingLinks.length} pending links`);
            console.log(`[GraphView] Available nodes:`, Array.from(this.nodeMap.keys()));
            
            for (const link of this.pendingLinks) {
                const sourceExists = this.nodeMap.has(link.source);
                const targetExists = this.nodeMap.has(link.target);
                
                if (sourceExists && targetExists) {
                    this.links.push(link);
                    if (link.type === 'reference') {
                        console.log(`[GraphView] Added reference link: ${link.source} -> ${link.target}`);
                    }
                } else {
                    console.log(`[GraphView] Skipping link: source=${link.source} (exists: ${sourceExists}), target=${link.target} (exists: ${targetExists})`);
                }
            }

            console.log(`[GraphView] Loaded ${this.nodes.length} nodes and ${this.links.length} links`);
            
            // Clear pendingLinks after processing
            this.pendingLinks = [];
        } catch (error) {
            console.error('[GraphView] Error loading graph data:', error);
        }
    }

    /**
     * Process a single markdown file to extract graph elements
     * Creates nodes for the file, its headings, and tags
     * Creates links for internal references and heading hierarchy
     *
     * @async
     * @param {string} filePath - Absolute path to the markdown file
     * @returns {Promise<void>}
     */
    async processFile(filePath) {
        try {
            console.log(`[GraphView] Processing file: ${filePath}`);
            const content = await window.electronAPI.invoke('read-file-content', filePath);
            
            if (!content || !content.success || !content.content) {
                console.warn(`[GraphView] Failed to read content for ${filePath}:`, content?.error);
                // Still create a node for the file even if we can't read its content
                const fileName = filePath.split('/').pop().replace('.md', '');
                const fileNodeId = `file:${filePath}`;
                const fileNode = {
                    id: fileNodeId,
                    name: fileName,
                    type: 'file',
                    filePath: filePath,
                    radius: 12,
                    color: '#757575' // Gray color for unreadable files
                };
                this.nodes.push(fileNode);
                this.nodeMap.set(fileNodeId, fileNode);
                return;
            }

            const fileContent = content.content;
            this.allFiles.set(filePath, fileContent);

            // Extract filename without path and extension
            const fileName = filePath.split('/').pop().replace('.md', '');
            
            // Create main file node
            const fileNodeId = `file:${filePath}`;
            const fileNode = {
                id: fileNodeId,
                name: fileName,
                type: 'file',
                filePath: filePath,
                radius: 12,
                color: '#4CAF50'
            };
            this.nodes.push(fileNode);
            this.nodeMap.set(fileNodeId, fileNode);

            // Extract headings
            const headingRegex = /^(#{1,6})\s+(.+)$/gm;
            let match;
            let headingNodes = [];

            while ((match = headingRegex.exec(fileContent)) !== null) {
                const level = match[1].length;
                const headingText = match[2].trim();
                const headingId = `heading:${filePath}:${headingText}`;
                
                const headingNode = {
                    id: headingId,
                    name: headingText,
                    type: 'heading',
                    level: level,
                    filePath: filePath,
                    radius: Math.max(6, 12 - level * 1.5),
                    color: this.getHeadingColor(level)
                };
                
                this.nodes.push(headingNode);
                this.nodeMap.set(headingId, headingNode);
                headingNodes.push(headingNode);

                // Link heading to file (use pendingLinks during initial load)
                const linkObj = {
                    source: fileNodeId,
                    target: headingId,
                    type: 'contains',
                    strength: 0.5
                };
                if (this.pendingLinks) {
                    this.pendingLinks.push(linkObj);
                } else {
                    this.links.push(linkObj);
                }
            }

            // Create hierarchy between headings
            for (let i = 0; i < headingNodes.length - 1; i++) {
                const current = headingNodes[i];
                const next = headingNodes[i + 1];
                
                // If next heading is a subheading of current
                if (next.level > current.level) {
                    const linkObj = {
                        source: current.id,
                        target: next.id,
                        type: 'hierarchy',
                        strength: 0.3
                    };
                    // Always use pendingLinks during initial load
                    if (Array.isArray(this.pendingLinks)) {
                        this.pendingLinks.push(linkObj);
                    } else {
                        this.links.push(linkObj);
                    }
                }
            }

            // Extract internal links [[...]]
            const linkRegex = /\[\[([^\]]+)\]\]/g;
            let linkMatch;
            let foundLinks = [];
            while ((linkMatch = linkRegex.exec(fileContent)) !== null) {
                const linkedFile = linkMatch[1].trim();
                foundLinks.push(linkedFile);
            }
            
            if (foundLinks.length > 0) {
                console.log(`[GraphView] Found ${foundLinks.length} internal links in ${fileName}:`, foundLinks);
            }
            
            for (const linkedFile of foundLinks) {
                const linkedPath = this.resolveLink(linkedFile);
                
                if (linkedPath) {
                    const targetId = `file:${linkedPath}`;
                    
                    // Check if target node exists or will exist
                    console.log(`[GraphView] Creating link from ${fileNodeId} to ${targetId}`);
                    console.log(`[GraphView] Source exists: ${this.nodeMap.has(fileNodeId)}, Target exists: ${this.nodeMap.has(targetId)}`);
                    
                    // Create link between files
                    const linkObj = {
                        source: fileNodeId,
                        target: targetId,
                        type: 'reference',
                        strength: 0.7
                    };
                    // Always use pendingLinks during initial load
                    if (Array.isArray(this.pendingLinks)) {
                        this.pendingLinks.push(linkObj);
                    } else {
                        this.links.push(linkObj);
                    }
                } else {
                    console.log(`[GraphView] Could not resolve link: "${linkedFile}" from ${fileName}`);
                }
            }

            // Extract tags
            const tagRegex = /#(\w+)/g;
            let tagMatch;
            while ((tagMatch = tagRegex.exec(fileContent)) !== null) {
                const tag = tagMatch[1];
                const tagId = `tag:${tag}`;
                
                // Create tag node if it doesn't exist
                if (!this.nodeMap.has(tagId)) {
                    const tagNode = {
                        id: tagId,
                        name: `#${tag}`,
                        type: 'tag',
                        radius: 8,
                        color: '#FF9800'
                    };
                    this.nodes.push(tagNode);
                    this.nodeMap.set(tagId, tagNode);
                }
                
                // Link file to tag
                const linkObj = {
                    source: fileNodeId,
                    target: tagId,
                    type: 'tagged',
                    strength: 0.4
                };
                if (this.pendingLinks) {
                    this.pendingLinks.push(linkObj);
                } else {
                    this.links.push(linkObj);
                }
            }

        } catch (error) {
            console.error(`[GraphView] Error processing file ${filePath}:`, error);
        }
    }

    /**
     * Resolve a wiki-style link to an actual file path
     * Searches through loaded files to find a matching file name
     *
     * @param {string} link - The link text from [[link]] syntax
     * @returns {string|null} The resolved file path, or null if not found
     */
    resolveLink(link) {
        // Remove any path separators and extensions from the link
        const linkName = link.replace(/\.md$/, '').split('/').pop();
        
        console.log(`[GraphView] Resolving link: "${link}" (cleaned: "${linkName}")`);
        
        // Try to find the file in our file list
        for (const [filePath, ] of this.allFiles) {
            // Extract just the filename without extension from the full path
            const fileName = filePath.split('/').pop().replace(/\.md$/, '');
            
            // Check if this is the file we're looking for
            if (fileName === linkName || filePath.endsWith(`/${link}.md`) || filePath.endsWith(`/${link}`)) {
                console.log(`[GraphView] Resolved link "${link}" to "${filePath}"`);
                return filePath;
            }
        }
        
        // Also check if any node already exists with this ID
        const possibleId = `file:${link}`;
        if (this.nodeMap.has(possibleId)) {
            console.log(`[GraphView] Found existing node for link "${link}"`);
            return link;
        }
        
        console.log(`[GraphView] Could not resolve link: "${link}"`);
        return null;
    }

    /**
     * Get the color for a heading node based on its level
     * Uses custom colors if set, otherwise falls back to defaults
     *
     * @param {number} level - Heading level (1-6)
     * @returns {string} Hex color code
     */
    getHeadingColor(level) {
        const key = `h${level}`;
        return this.customColors[key] || this.defaultColors[key] || '#8BC34A';
    }

    /**
     * Get the color for a node based on its type
     * @param {Object} node - The node object
     * @returns {string} Hex color code
     */
    getNodeColor(node) {
        if (node.type === 'file') {
            return this.customColors.file || this.defaultColors.file;
        }
        if (node.type === 'tag') {
            return this.customColors.tag || this.defaultColors.tag;
        }
        if (node.type === 'heading') {
            return this.getHeadingColor(node.level);
        }
        return '#888888';
    }

    /**
     * Load custom colors from localStorage
     * @returns {Object} Custom colors object
     */
    loadCustomColors() {
        try {
            const saved = localStorage.getItem('graphCustomColors');
            return saved ? JSON.parse(saved) : {};
        } catch (e) {
            console.warn('[GraphView] Failed to load custom colors:', e);
            return {};
        }
    }

    /**
     * Save custom colors to localStorage
     */
    saveCustomColors() {
        try {
            localStorage.setItem('graphCustomColors', JSON.stringify(this.customColors));
        } catch (e) {
            console.warn('[GraphView] Failed to save custom colors:', e);
        }
    }

    /**
     * Set a custom color for a node type
     * @param {string} type - Node type (file, tag, h1-h6)
     * @param {string} color - Hex color code
     */
    setCustomColor(type, color) {
        this.customColors[type] = color;
        this.saveCustomColors();
        this.updateNodeColors();
        this.updateMinimap();
    }

    /**
     * Reset colors to defaults
     */
    resetColors() {
        this.customColors = {};
        this.saveCustomColors();
        this.updateNodeColors();
        this.updateMinimap();
    }

    /**
     * Update all node colors in the graph
     */
    updateNodeColors() {
        if (!this.g) return;

        this.g.selectAll('.nodes circle')
            .attr('fill', d => this.getNodeColor(d));
    }

    /**
     * Create and configure the D3 force simulation
     * Sets up link forces, charge forces, centering, and collision detection
     */
    createForceSimulation() {
        // Create force simulation
        this.simulation = d3.forceSimulation(this.nodes)
            .force('link', d3.forceLink(this.links)
                .id(d => d.id)
                .distance(d => {
                    // Vary distance based on link type
                    switch(d.type) {
                        case 'contains': return 80;
                        case 'hierarchy': return 60;
                        case 'reference': return 120;
                        case 'tagged': return 100;
                        default: return 100;
                    }
                })
                .strength(d => d.strength || 0.5))
            .force('charge', d3.forceManyBody()
                .strength(d => {
                    // Stronger repulsion for file nodes
                    if (d.type === 'file') return -300;
                    if (d.type === 'tag') return -200;
                    return -100;
                }))
            .force('center', d3.forceCenter(this.width / 2, this.height / 2))
            .force('collision', d3.forceCollide()
                .radius(d => d.radius + 5));
    }

    /**
     * Render the graph visualization
     * Creates SVG elements for nodes and links, sets up event handlers
     */
    render() {
        console.log(`[GraphView] Rendering graph with ${this.nodes.length} nodes and ${this.links.length} links`);
        
        // Count link types
        const linkTypes = {};
        this.links.forEach(l => {
            linkTypes[l.type] = (linkTypes[l.type] || 0) + 1;
        });
        console.log('[GraphView] Link types:', linkTypes);
        
        // Clear existing elements
        this.g.selectAll('*').remove();

        // Create link elements
        const link = this.g.append('g')
            .attr('class', 'links')
            .selectAll('line')
            .data(this.links)
            .enter().append('line')
            .attr('stroke', d => {
                switch(d.type) {
                    case 'contains': return '#666';
                    case 'hierarchy': return '#888';
                    case 'reference': return '#4CAF50';
                    case 'tagged': return '#FF9800';
                    default: return '#999';
                }
            })
            .attr('stroke-opacity', d => d.type === 'hierarchy' ? 0.3 : 0.6)
            .attr('stroke-width', d => d.type === 'reference' ? 2 : 1)
            .attr('marker-end', d => d.type === 'reference' ? 'url(#arrowhead)' : '');

        // Create node groups
        const node = this.g.append('g')
            .attr('class', 'nodes')
            .selectAll('g')
            .data(this.nodes)
            .enter().append('g')
            .attr('cursor', 'pointer')
            .call(this.drag(this.simulation));

        // Add circles for nodes
        node.append('circle')
            .attr('r', d => d.radius)
            .attr('fill', d => this.getNodeColor(d))
            .attr('stroke', '#fff')
            .attr('stroke-width', 2)
            .on('click', (event, d) => this.handleNodeClick(event, d))
            .on('mouseover', (event, d) => this.handleNodeHover(event, d, true))
            .on('mouseout', (event, d) => this.handleNodeHover(event, d, false));

        // Add labels
        node.append('text')
            .text(d => d.name)
            .attr('x', 0)
            .attr('y', d => d.radius + 15)
            .attr('text-anchor', 'middle')
            .attr('fill', '#fff')
            .attr('font-size', d => {
                if (d.type === 'file') return '12px';
                if (d.type === 'heading') return `${10 - d.level * 0.5}px`;
                return '10px';
            })
            .attr('font-weight', d => d.type === 'file' ? 'bold' : 'normal')
            .style('pointer-events', 'none');

        // Update positions on simulation tick
        let tickCount = 0;
        this.simulation.on('tick', () => {
            link
                .attr('x1', d => d.source.x)
                .attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x)
                .attr('y2', d => d.target.y);

            node.attr('transform', d => `translate(${d.x},${d.y})`);

            // Update minimap periodically (every 10 ticks to reduce overhead)
            tickCount++;
            if (tickCount % 10 === 0) {
                this.updateMinimap();
            }
        });

        // Final minimap update when simulation ends
        this.simulation.on('end', () => {
            this.updateMinimap();
        });
    }

    /**
     * Create drag behavior for nodes
     * Allows users to drag and reposition nodes in the graph
     *
     * @param {Object} simulation - D3 force simulation instance
     * @returns {Object} D3 drag behavior
     */
    drag(simulation) {
        function dragstarted(event) {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            event.subject.fx = event.subject.x;
            event.subject.fy = event.subject.y;
        }

        function dragged(event) {
            event.subject.fx = event.x;
            event.subject.fy = event.y;
        }

        function dragended(event) {
            if (!event.active) simulation.alphaTarget(0);
            event.subject.fx = null;
            event.subject.fy = null;
        }

        return d3.drag()
            .on('start', dragstarted)
            .on('drag', dragged)
            .on('end', dragended);
    }

    /**
     * Handle click events on graph nodes
     * Opens files, navigates to headings, or handles tag clicks
     *
     * @param {Event} event - DOM click event
     * @param {Object} node - The clicked node data
     */
    handleNodeClick(event, node) {
        event.stopPropagation();

        if (node.type === 'file') {
            // Open the file in editor
            console.log(`[GraphView] Opening file: ${node.filePath}`);
            window.electronAPI.invoke('open-file', node.filePath);
        } else if (node.type === 'heading') {
            // Open file and scroll to heading
            console.log(`[GraphView] Opening file at heading: ${node.filePath} - ${node.name}`);
            window.electronAPI.invoke('open-file', node.filePath).then(() => {
                // Wait for file to load, then navigate to heading
                setTimeout(() => {
                    this.navigateToHeading(node.name, node.level);
                }, 300);
            });
        } else if (node.type === 'tag') {
            // Search for documents with this tag
            console.log(`[GraphView] Clicked tag: ${node.name}`);
            // Could implement tag search in the future
        }
    }

    /**
     * Navigate to a heading in the currently open document
     * @param {string} headingText - The heading text to find
     * @param {number} level - The heading level (1-6)
     */
    navigateToHeading(headingText, level) {
        if (!window.editor || !window.editor.getModel()) {
            console.warn('[GraphView] Editor not available for heading navigation');
            return;
        }

        const model = window.editor.getModel();
        const content = model.getValue();
        const lines = content.split('\n');

        // Build the heading pattern to search for
        const hashPrefix = '#'.repeat(level);
        const headingPattern = new RegExp(`^${hashPrefix}\\s+${this.escapeRegex(headingText)}\\s*$`);

        // Find the line with the matching heading
        for (let i = 0; i < lines.length; i++) {
            if (headingPattern.test(lines[i])) {
                const lineNumber = i + 1; // Monaco uses 1-based line numbers

                console.log(`[GraphView] Found heading "${headingText}" at line ${lineNumber}`);

                // Set cursor position and reveal the line
                window.editor.setPosition({ lineNumber: lineNumber, column: 1 });
                window.editor.revealLineInCenter(lineNumber);
                window.editor.focus();

                // Briefly highlight the heading line
                this.highlightLine(lineNumber);
                return;
            }
        }

        // Fallback: try a more flexible search (in case heading text was modified)
        const flexiblePattern = new RegExp(`^#{1,6}\\s+.*${this.escapeRegex(headingText.substring(0, 20))}`, 'i');
        for (let i = 0; i < lines.length; i++) {
            if (flexiblePattern.test(lines[i])) {
                const lineNumber = i + 1;
                console.log(`[GraphView] Found heading (flexible match) at line ${lineNumber}`);
                window.editor.setPosition({ lineNumber: lineNumber, column: 1 });
                window.editor.revealLineInCenter(lineNumber);
                window.editor.focus();
                this.highlightLine(lineNumber);
                return;
            }
        }

        console.warn(`[GraphView] Could not find heading "${headingText}" in document`);
    }

    /**
     * Escape special regex characters in a string
     *
     * @param {string} string - String to escape
     * @returns {string} Escaped string safe for use in RegExp
     */
    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Briefly highlight a line in the editor with animation
     * Creates a temporary decoration that fades out after 1.5 seconds
     *
     * @param {number} lineNumber - The 1-based line number to highlight
     */
    highlightLine(lineNumber) {
        if (!window.editor) return;

        const decorations = window.editor.deltaDecorations([], [{
            range: new monaco.Range(lineNumber, 1, lineNumber, 1),
            options: {
                isWholeLine: true,
                className: 'graph-heading-highlight',
                stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
            }
        }]);

        // Remove highlight after 1.5 seconds
        setTimeout(() => {
            window.editor.deltaDecorations(decorations, []);
        }, 1500);
    }

    /**
     * Handle hover events on graph nodes
     * Highlights connected nodes and links, dims unconnected elements
     *
     * @param {Event} event - DOM mouse event
     * @param {Object} node - The hovered node data
     * @param {boolean} isHover - True if mouse entered, false if mouse left
     */
    handleNodeHover(event, node, isHover) {
        if (isHover) {
            // Highlight connected nodes and links
            const connectedNodes = new Set();
            const connectedLinks = new Set();

            this.links.forEach(link => {
                if (link.source.id === node.id || link.target.id === node.id) {
                    connectedNodes.add(link.source.id);
                    connectedNodes.add(link.target.id);
                    connectedLinks.add(link);
                }
            });

            // Update opacity
            this.g.selectAll('.nodes g')
                .style('opacity', d => connectedNodes.has(d.id) ? 1 : 0.3);

            this.g.selectAll('.links line')
                .style('opacity', d => connectedLinks.has(d) ? 1 : 0.1);
        } else {
            // Reset opacity
            this.g.selectAll('.nodes g').style('opacity', 1);
            this.g.selectAll('.links line').style('opacity', 0.6);
        }
    }

    /**
     * Add control panel to the graph container
     * Provides buttons for refresh, center view, and toggle visibility options
     *
     * @param {HTMLElement} container - The graph container element
     */
    addControls(container) {
        const controls = document.createElement('div');
        controls.style.position = 'absolute';
        controls.style.top = '10px';
        controls.style.right = '10px';
        controls.style.zIndex = '1000';
        controls.style.background = 'rgba(30, 30, 30, 0.9)';
        controls.style.padding = '10px';
        controls.style.borderRadius = '5px';
        controls.style.color = '#fff';
        controls.style.fontSize = '12px';

        controls.innerHTML = `
            <div style="margin-bottom: 10px;">
                <button id="graph-refresh" style="padding: 5px 10px; margin-right: 5px;">Refresh</button>
                <button id="graph-center" style="padding: 5px 10px; margin-right: 5px;">Center</button>
                <button id="graph-colors" style="padding: 5px 10px; margin-right: 5px;">Colors</button>
                <button id="graph-export" style="padding: 5px 10px;">Export</button>
            </div>
            <div style="margin-bottom: 5px;">
                <label><input type="checkbox" id="show-headings" checked> Headings</label>
            </div>
            <div style="margin-bottom: 5px;">
                <label><input type="checkbox" id="show-tags" checked> Tags</label>
            </div>
            <div style="margin-bottom: 5px;">
                <label><input type="checkbox" id="show-labels" checked> Labels</label>
            </div>
            <div>
                <label><input type="checkbox" id="show-minimap" checked> Mini-map</label>
            </div>
        `;

        container.appendChild(controls);

        // Add event listeners
        document.getElementById('graph-refresh').addEventListener('click', async () => {
            await this.loadGraphData();
            this.createForceSimulation();
            this.render();
        });

        document.getElementById('graph-center').addEventListener('click', () => {
            this.svg.transition()
                .duration(750)
                .call(d3.zoom().transform, d3.zoomIdentity);
        });

        document.getElementById('graph-export').addEventListener('click', () => {
            this.showExportDialog();
        });

        document.getElementById('graph-colors').addEventListener('click', () => {
            this.showColorDialog();
        });

        document.getElementById('show-headings').addEventListener('change', (e) => {
            const show = e.target.checked;
            this.g.selectAll('.nodes g')
                .filter(d => d.type === 'heading')
                .style('display', show ? 'block' : 'none');
        });

        document.getElementById('show-tags').addEventListener('change', (e) => {
            const show = e.target.checked;
            this.g.selectAll('.nodes g')
                .filter(d => d.type === 'tag')
                .style('display', show ? 'block' : 'none');
        });

        document.getElementById('show-labels').addEventListener('change', (e) => {
            const show = e.target.checked;
            this.g.selectAll('.nodes text')
                .style('display', show ? 'block' : 'none');
        });

        document.getElementById('show-minimap').addEventListener('change', (e) => {
            this.minimapVisible = e.target.checked;
            const minimapContainer = document.getElementById('graph-minimap');
            if (minimapContainer) {
                minimapContainer.style.display = this.minimapVisible ? 'block' : 'none';
            }
        });
    }

    /**
     * Create the mini-map navigation overlay
     * Shows a small overview of the entire graph with viewport indicator
     * @param {HTMLElement} container - The graph container element
     */
    createMinimap(container) {
        const minimapWidth = 180;
        const minimapHeight = 120;

        // Create minimap container
        const minimapContainer = document.createElement('div');
        minimapContainer.id = 'graph-minimap';
        minimapContainer.style.cssText = `
            position: absolute;
            bottom: 10px;
            left: 10px;
            width: ${minimapWidth}px;
            height: ${minimapHeight}px;
            background: rgba(30, 30, 30, 0.9);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 5px;
            overflow: hidden;
            cursor: pointer;
            z-index: 1000;
        `;

        // Create minimap SVG
        this.minimap = d3.select(minimapContainer)
            .append('svg')
            .attr('width', minimapWidth)
            .attr('height', minimapHeight)
            .style('cursor', 'crosshair');

        // Create minimap content group
        const minimapG = this.minimap.append('g')
            .attr('class', 'minimap-content');

        // Create viewport rectangle (shows current view area)
        this.minimapViewport = this.minimap.append('rect')
            .attr('class', 'minimap-viewport')
            .attr('fill', 'rgba(74, 144, 226, 0.3)')
            .attr('stroke', '#4A90E2')
            .attr('stroke-width', 1)
            .attr('rx', 2);

        container.appendChild(minimapContainer);

        // Add click handler to navigate
        this.minimap.on('click', (event) => {
            this.handleMinimapClick(event, minimapWidth, minimapHeight);
        });

        // Add drag handler for panning
        this.minimap.call(d3.drag()
            .on('drag', (event) => {
                this.handleMinimapDrag(event, minimapWidth, minimapHeight);
            }));

        // Initial minimap render
        this.updateMinimap();
    }

    /**
     * Update the minimap content to reflect current graph state
     */
    updateMinimap() {
        if (!this.minimap || !this.nodes.length) return;

        const minimapWidth = 180;
        const minimapHeight = 120;
        const padding = 10;

        // Calculate bounds of all nodes
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        this.nodes.forEach(node => {
            if (node.x !== undefined && node.y !== undefined) {
                minX = Math.min(minX, node.x);
                minY = Math.min(minY, node.y);
                maxX = Math.max(maxX, node.x);
                maxY = Math.max(maxY, node.y);
            }
        });

        // Handle case where nodes haven't been positioned yet
        if (minX === Infinity) {
            minX = 0; minY = 0; maxX = this.width; maxY = this.height;
        }

        // Calculate scale to fit all nodes in minimap
        const contentWidth = maxX - minX + padding * 2;
        const contentHeight = maxY - minY + padding * 2;
        const scaleX = (minimapWidth - padding * 2) / contentWidth;
        const scaleY = (minimapHeight - padding * 2) / contentHeight;
        const scale = Math.min(scaleX, scaleY, 1);

        // Store bounds for click handling
        this.minimapBounds = { minX, minY, maxX, maxY, scale, padding, contentWidth, contentHeight };

        // Update minimap content
        const minimapG = this.minimap.select('.minimap-content');
        minimapG.selectAll('*').remove();

        // Calculate transform to center content
        const offsetX = (minimapWidth - contentWidth * scale) / 2 - minX * scale + padding;
        const offsetY = (minimapHeight - contentHeight * scale) / 2 - minY * scale + padding;

        // Draw links
        minimapG.selectAll('line')
            .data(this.links)
            .enter().append('line')
            .attr('x1', d => d.source.x * scale + offsetX)
            .attr('y1', d => d.source.y * scale + offsetY)
            .attr('x2', d => d.target.x * scale + offsetX)
            .attr('y2', d => d.target.y * scale + offsetY)
            .attr('stroke', '#444')
            .attr('stroke-width', 0.5);

        // Draw nodes
        minimapG.selectAll('circle')
            .data(this.nodes)
            .enter().append('circle')
            .attr('cx', d => d.x * scale + offsetX)
            .attr('cy', d => d.y * scale + offsetY)
            .attr('r', d => Math.max(2, d.radius * scale * 0.5))
            .attr('fill', d => this.getNodeColor(d))
            .attr('opacity', 0.8);

        // Store offsets for viewport calculation
        this.minimapOffsets = { offsetX, offsetY, scale };

        // Update viewport rectangle
        this.updateMinimapViewport();
    }

    /**
     * Update the viewport rectangle to show current view area
     */
    updateMinimapViewport() {
        if (!this.minimapViewport || !this.minimapOffsets) return;

        const { offsetX, offsetY, scale } = this.minimapOffsets;

        // Calculate viewport bounds based on current transform
        const viewportWidth = this.width / this.currentTransform.k;
        const viewportHeight = this.height / this.currentTransform.k;
        const viewportX = -this.currentTransform.x / this.currentTransform.k;
        const viewportY = -this.currentTransform.y / this.currentTransform.k;

        // Transform to minimap coordinates
        this.minimapViewport
            .attr('x', viewportX * scale + offsetX)
            .attr('y', viewportY * scale + offsetY)
            .attr('width', viewportWidth * scale)
            .attr('height', viewportHeight * scale);
    }

    /**
     * Handle click on minimap to navigate
     * @param {Event} event - Click event
     * @param {number} minimapWidth - Width of minimap
     * @param {number} minimapHeight - Height of minimap
     */
    handleMinimapClick(event, minimapWidth, minimapHeight) {
        if (!this.minimapOffsets) return;

        const { offsetX, offsetY, scale } = this.minimapOffsets;
        const rect = event.target.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const clickY = event.clientY - rect.top;

        // Convert minimap coordinates to graph coordinates
        const graphX = (clickX - offsetX) / scale;
        const graphY = (clickY - offsetY) / scale;

        // Calculate new transform to center on clicked point
        const newX = this.width / 2 - graphX * this.currentTransform.k;
        const newY = this.height / 2 - graphY * this.currentTransform.k;

        // Apply transform with animation
        this.svg.transition()
            .duration(300)
            .call(this.zoomBehavior.transform,
                d3.zoomIdentity.translate(newX, newY).scale(this.currentTransform.k));
    }

    /**
     * Handle drag on minimap for panning
     * @param {Event} event - Drag event
     * @param {number} minimapWidth - Width of minimap
     * @param {number} minimapHeight - Height of minimap
     */
    handleMinimapDrag(event, minimapWidth, minimapHeight) {
        if (!this.minimapOffsets) return;

        const { offsetX, offsetY, scale } = this.minimapOffsets;

        // Convert minimap coordinates to graph coordinates
        const graphX = (event.x - offsetX) / scale;
        const graphY = (event.y - offsetY) / scale;

        // Calculate new transform to center on dragged point
        const newX = this.width / 2 - graphX * this.currentTransform.k;
        const newY = this.height / 2 - graphY * this.currentTransform.k;

        // Apply transform immediately (no animation for smooth dragging)
        this.svg.call(this.zoomBehavior.transform,
            d3.zoomIdentity.translate(newX, newY).scale(this.currentTransform.k));
    }

    /**
     * Refresh the graph visualization
     * Reloads data and recreates the force simulation
     *
     * @async
     * @returns {Promise<void>}
     */
    async refresh() {
        console.log('[GraphView] Refreshing graph...');
        await this.loadGraphData();
        this.createForceSimulation();
        this.render();
    }

    /**
     * Show export dialog with format options
     */
    showExportDialog() {
        // Remove any existing dialog
        const existingDialog = document.getElementById('graph-export-dialog');
        if (existingDialog) existingDialog.remove();

        const dialog = document.createElement('div');
        dialog.id = 'graph-export-dialog';
        dialog.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #2d2d2d;
            padding: 20px;
            border-radius: 8px;
            z-index: 10001;
            box-shadow: 0 4px 20px rgba(0,0,0,0.5);
            color: #fff;
            min-width: 280px;
        `;

        dialog.innerHTML = `
            <h3 style="margin-top: 0; margin-bottom: 15px;">Export Graph</h3>
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 8px;">
                    <input type="radio" name="export-format" value="png" checked> PNG (Image)
                </label>
                <label style="display: block; margin-bottom: 8px;">
                    <input type="radio" name="export-format" value="svg"> SVG (Vector)
                </label>
            </div>
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px;">Scale:</label>
                <select id="export-scale" style="width: 100%; padding: 5px;">
                    <option value="1">1x (Standard)</option>
                    <option value="2" selected>2x (High Resolution)</option>
                    <option value="3">3x (Very High Resolution)</option>
                </select>
            </div>
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button id="export-cancel" style="padding: 8px 16px; cursor: pointer;">Cancel</button>
                <button id="export-confirm" style="padding: 8px 16px; background: #4CAF50; color: white; border: none; cursor: pointer;">Export</button>
            </div>
        `;

        // Add backdrop
        const backdrop = document.createElement('div');
        backdrop.id = 'graph-export-backdrop';
        backdrop.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.5);
            z-index: 10000;
        `;

        document.body.appendChild(backdrop);
        document.body.appendChild(dialog);

        // Event handlers
        document.getElementById('export-cancel').addEventListener('click', () => {
            dialog.remove();
            backdrop.remove();
        });

        backdrop.addEventListener('click', () => {
            dialog.remove();
            backdrop.remove();
        });

        document.getElementById('export-confirm').addEventListener('click', () => {
            const format = document.querySelector('input[name="export-format"]:checked').value;
            const scale = parseInt(document.getElementById('export-scale').value);

            dialog.remove();
            backdrop.remove();

            if (format === 'svg') {
                this.exportAsSVG();
            } else {
                this.exportAsPNG(scale);
            }
        });
    }

    /**
     * Show color customization dialog
     */
    showColorDialog() {
        // Remove any existing dialog
        const existingDialog = document.getElementById('graph-color-dialog');
        if (existingDialog) existingDialog.remove();
        const existingBackdrop = document.getElementById('graph-color-backdrop');
        if (existingBackdrop) existingBackdrop.remove();

        const dialog = document.createElement('div');
        dialog.id = 'graph-color-dialog';
        dialog.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #2d2d2d;
            padding: 20px;
            border-radius: 8px;
            z-index: 10001;
            min-width: 350px;
            max-height: 80vh;
            overflow-y: auto;
            color: #fff;
            box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        `;

        // Build color rows for each type
        const colorTypes = [
            { key: 'file', label: 'Files' },
            { key: 'tag', label: 'Tags' },
            { key: 'h1', label: 'Heading 1' },
            { key: 'h2', label: 'Heading 2' },
            { key: 'h3', label: 'Heading 3' },
            { key: 'h4', label: 'Heading 4' },
            { key: 'h5', label: 'Heading 5' },
            { key: 'h6', label: 'Heading 6' }
        ];

        let colorRows = '';
        colorTypes.forEach(({ key, label }) => {
            const currentColor = this.customColors[key] || this.defaultColors[key];
            colorRows += `
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
                    <label style="flex: 1;">${label}</label>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <input type="color" id="color-${key}" value="${currentColor}" style="width: 50px; height: 30px; border: none; cursor: pointer;">
                        <button class="reset-color-btn" data-key="${key}" style="padding: 4px 8px; font-size: 11px; cursor: pointer;">Reset</button>
                    </div>
                </div>
            `;
        });

        dialog.innerHTML = `
            <h3 style="margin-top: 0; margin-bottom: 15px;">Customize Node Colors</h3>
            <div style="margin-bottom: 20px;">
                ${colorRows}
            </div>
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button id="color-reset-all" style="padding: 8px 16px; cursor: pointer;">Reset All</button>
                <button id="color-cancel" style="padding: 8px 16px; cursor: pointer;">Cancel</button>
                <button id="color-apply" style="padding: 8px 16px; background: #4CAF50; color: white; border: none; cursor: pointer;">Apply</button>
            </div>
        `;

        // Add backdrop
        const backdrop = document.createElement('div');
        backdrop.id = 'graph-color-backdrop';
        backdrop.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.5);
            z-index: 10000;
        `;

        document.body.appendChild(backdrop);
        document.body.appendChild(dialog);

        // Event handlers
        document.getElementById('color-cancel').addEventListener('click', () => {
            dialog.remove();
            backdrop.remove();
        });

        backdrop.addEventListener('click', () => {
            dialog.remove();
            backdrop.remove();
        });

        // Reset individual colors
        dialog.querySelectorAll('.reset-color-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const key = btn.dataset.key;
                const defaultColor = this.defaultColors[key];
                document.getElementById(`color-${key}`).value = defaultColor;
            });
        });

        // Reset all colors
        document.getElementById('color-reset-all').addEventListener('click', () => {
            colorTypes.forEach(({ key }) => {
                document.getElementById(`color-${key}`).value = this.defaultColors[key];
            });
        });

        // Apply colors
        document.getElementById('color-apply').addEventListener('click', () => {
            colorTypes.forEach(({ key }) => {
                const color = document.getElementById(`color-${key}`).value;
                if (color !== this.defaultColors[key]) {
                    this.customColors[key] = color;
                } else {
                    delete this.customColors[key];
                }
            });

            this.saveCustomColors();
            this.updateNodeColors();
            this.updateMinimap();

            dialog.remove();
            backdrop.remove();
        });
    }

    /**
     * Export the graph as SVG
     */
    exportAsSVG() {
        console.log('[GraphView] Exporting as SVG...');

        // Clone the SVG element
        const svgNode = this.svg.node();
        const clonedSvg = svgNode.cloneNode(true);

        // Set explicit dimensions
        clonedSvg.setAttribute('width', this.width);
        clonedSvg.setAttribute('height', this.height);

        // Add background
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('width', '100%');
        rect.setAttribute('height', '100%');
        rect.setAttribute('fill', '#1e1e1e');
        clonedSvg.insertBefore(rect, clonedSvg.firstChild);

        // Serialize to string
        const serializer = new XMLSerializer();
        const svgString = serializer.serializeToString(clonedSvg);

        // Create download
        const blob = new Blob([svgString], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `graph-${Date.now()}.svg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log('[GraphView] SVG export complete');
    }

    /**
     * Export the graph as PNG
     * @param {number} scale - Scale factor for resolution
     */
    exportAsPNG(scale = 2) {
        console.log(`[GraphView] Exporting as PNG at ${scale}x scale...`);

        // Get the SVG element
        const svgNode = this.svg.node();
        const clonedSvg = svgNode.cloneNode(true);

        // Set explicit dimensions
        const width = this.width * scale;
        const height = this.height * scale;
        clonedSvg.setAttribute('width', width);
        clonedSvg.setAttribute('height', height);

        // Apply scale transform to the content
        const gElement = clonedSvg.querySelector('g');
        if (gElement) {
            const currentTransform = gElement.getAttribute('transform') || '';
            gElement.setAttribute('transform', `scale(${scale}) ${currentTransform}`);
        }

        // Add background
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('width', width);
        rect.setAttribute('height', height);
        rect.setAttribute('fill', '#1e1e1e');
        clonedSvg.insertBefore(rect, clonedSvg.firstChild);

        // Serialize SVG
        const serializer = new XMLSerializer();
        const svgString = serializer.serializeToString(clonedSvg);
        const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);

        // Create canvas and draw
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');

            // Draw background
            ctx.fillStyle = '#1e1e1e';
            ctx.fillRect(0, 0, width, height);

            // Draw SVG
            ctx.drawImage(img, 0, 0);

            // Convert to PNG and download
            canvas.toBlob((blob) => {
                const pngUrl = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = pngUrl;
                a.download = `graph-${Date.now()}.png`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(pngUrl);
                URL.revokeObjectURL(url);

                console.log('[GraphView] PNG export complete');
            }, 'image/png');
        };

        img.onerror = (err) => {
            console.error('[GraphView] Error loading SVG for PNG export:', err);
            URL.revokeObjectURL(url);
        };

        img.src = url;
    }

    /**
     * Clean up and destroy the graph visualization
     * Stops the simulation and removes SVG elements
     */
    destroy() {
        if (this.simulation) {
            this.simulation.stop();
        }
        if (this.svg) {
            this.svg.remove();
        }
    }
}

// Export for use in renderer
window.GraphView = GraphView;