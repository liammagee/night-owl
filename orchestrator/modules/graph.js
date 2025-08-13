// Graph visualization module for conceptual relationships
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';

class GraphView {
    constructor() {
        this.nodes = [];
        this.links = [];
        this.simulation = null;
        this.svg = null;
        this.g = null;
        this.currentFile = null;
        this.allFiles = new Map(); // Store all file contents
        this.nodeMap = new Map(); // Map node IDs to node objects
    }

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
        const zoom = d3.zoom()
            .scaleExtent([0.1, 4])
            .on('zoom', (event) => {
                this.g.attr('transform', event.transform);
            });

        this.svg.call(zoom);

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
    }

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
            for (const file of files) {
                if (file.endsWith('.md') || file.endsWith('.markdown')) {
                    await this.processFile(file);
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

    getHeadingColor(level) {
        const colors = [
            '#2196F3', // H1 - Blue
            '#03A9F4', // H2 - Light Blue
            '#00BCD4', // H3 - Cyan
            '#009688', // H4 - Teal
            '#4CAF50', // H5 - Green
            '#8BC34A'  // H6 - Light Green
        ];
        return colors[level - 1] || '#8BC34A';
    }

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
            .attr('fill', d => d.color)
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
        this.simulation.on('tick', () => {
            link
                .attr('x1', d => d.source.x)
                .attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x)
                .attr('y2', d => d.target.y);

            node.attr('transform', d => `translate(${d.x},${d.y})`);
        });
    }

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

    handleNodeClick(event, node) {
        event.stopPropagation();
        
        if (node.type === 'file') {
            // Open the file in editor
            console.log(`[GraphView] Opening file: ${node.filePath}`);
            window.electronAPI.invoke('open-file', node.filePath);
        } else if (node.type === 'heading') {
            // Open file and scroll to heading
            console.log(`[GraphView] Opening file at heading: ${node.filePath} - ${node.name}`);
            window.electronAPI.invoke('open-file', node.filePath);
            // TODO: Add heading navigation
        }
    }

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
                <button id="graph-center" style="padding: 5px 10px;">Center</button>
            </div>
            <div style="margin-bottom: 5px;">
                <label><input type="checkbox" id="show-headings" checked> Headings</label>
            </div>
            <div style="margin-bottom: 5px;">
                <label><input type="checkbox" id="show-tags" checked> Tags</label>
            </div>
            <div>
                <label><input type="checkbox" id="show-labels" checked> Labels</label>
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
    }

    async refresh() {
        console.log('[GraphView] Refreshing graph...');
        await this.loadGraphData();
        this.createForceSimulation();
        this.render();
    }

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