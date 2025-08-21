// Network Visualization Functions
// Handles network graph creation, data parsing, and visualization controls

let networkGraph = null;
let networkData = { nodes: [], links: [] };

function parseInternalLinks(content, filename) {
  const links = [];
  
  if (!content || typeof content !== 'string') {
    console.log(`[Network] parseInternalLinks: No content for ${filename}`);
    return links;
  }
  
  console.log(`[Network] parseInternalLinks: Parsing ${filename} (${content.length} chars)`);
  
  // Parse [[internal]] links
  const internalLinkRegex = /\[\[([^\]|]+)(\|[^\]]+)?\]\]/g;
  let match;
  let matchCount = 0;
  const maxMatches = 1000; // Prevent infinite loops
  
  while ((match = internalLinkRegex.exec(content)) !== null && matchCount < maxMatches) {
    const targetFile = match[1].trim();
    // Add .md extension if not present
    const targetWithExt = targetFile.includes('.') ? targetFile : targetFile + '.md';
    
    console.log(`[Network] Found internal link: ${filename} -> ${targetWithExt}`);
    
    links.push({
      source: filename,
      target: targetWithExt,
      type: 'internal'
    });
    
    matchCount++;
  }
  
  // Parse [text](link.md) style links
  const mdLinkRegex = /\[([^\]]+)\]\(([^)]+\.md)\)/g;
  while ((match = mdLinkRegex.exec(content)) !== null && matchCount < maxMatches) {
    const targetFile = match[2];
    
    console.log(`[Network] Found markdown link: ${filename} -> ${targetFile}`);
    
    links.push({
      source: filename,
      target: targetFile,
      type: 'markdown'
    });
    
    matchCount++;
  }
  
  console.log(`[Network] parseInternalLinks: Found ${links.length} total links in ${filename}`);
  
  return links;
}

async function getFileContentForParsing(filename) {
  try {
    if (window.electronAPI) {
      const result = await window.electronAPI.invoke('read-file-content', filename);
      return result.success ? result.content : '';
    }
    return '';
  } catch (error) {
    console.warn('[Network] Could not read file for parsing:', filename, error);
    return '';
  }
}

async function buildNetworkData() {
  console.log('[Network] Building network data...');
  
  try {
    // Get list of markdown files from the working directory
    const result = await window.getFilteredVisualizationFiles();
    const files = result.files;
    
    if (!files || files.length === 0) {
      console.log('[Network] No files found for network visualization');
      return { nodes: [], links: [] };
    }
    
    // Create file nodes (limit for performance)
    const mdFiles = files.map(fileItem => {
      // Extract file path from file item (could be string or object)
      const filePath = typeof fileItem === 'string' ? fileItem : (fileItem.path || fileItem.filePath || fileItem.name || String(fileItem));
      
      // Ensure we have a valid file path
      if (typeof filePath !== 'string') {
        console.warn('[Network] Invalid file path type:', typeof filePath, fileItem);
        return null;
      }
      
      return {
        name: filePath.split('/').pop(),
        path: filePath
      };
    }).filter(item => item !== null).slice(0, 100); // Filter out nulls and limit to 100 files for performance
    
    console.log('[Network] Processing', mdFiles.length, 'files for network visualization');
    
    // Create nodes
    const nodes = mdFiles.map(file => ({
      id: file.name,
      name: file.name.replace(/\.md$/, ''),
      path: file.path,
      group: 1
    }));
    
    // Parse links from all files
    const allLinks = [];
    
    for (const file of mdFiles) {
      try {
        const content = await getFileContentForParsing(file.path);
        
        if (content) {
          console.log(`[Network] Found content for ${file.name}, length: ${content.length}`);
          const fileLinks = parseInternalLinks(content, file.name);
          console.log(`[Network] Found ${fileLinks.length} links in ${file.name}`);
          allLinks.push(...fileLinks);
        } else {
          console.log(`[Network] No content found for ${file.name}`);
        }
      } catch (error) {
        console.warn('[Network] Error parsing links from file:', file.name, error);
      }
      
      // Add small delay to prevent UI blocking
      if (allLinks.length % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 1));
      }
    }
    
    // Filter links to only include files that exist in our node set
    const nodeIds = new Set(nodes.map(n => n.id));
    
    console.log('[Network] Found', allLinks.length, 'total links, filtering to existing nodes');
    
    const links = allLinks.filter(link => {
      const sourceExists = nodeIds.has(link.source);
      const targetExists = nodeIds.has(link.target);
      
      if (!sourceExists) {
        console.debug('[Network] Source file not in node set:', link.source);
      }
      if (!targetExists) {
        console.debug('[Network] Target file not in node set:', link.target);
      }
      
      return sourceExists && targetExists;
    });
    
    console.log('[Network] Filtered to', links.length, 'valid links between', nodes.length, 'nodes');
    
    return { nodes, links };
    
  } catch (error) {
    console.error('[Network] Error building network data:', error);
    return { nodes: [], links: [] };
  }
}

function createNetworkVisualization(data) {
  const container = document.getElementById('network-canvas');
  if (!container) {
    console.error('[Network] Network canvas container not found');
    return null;
  }
  
  // Clear previous visualization
  container.innerHTML = '';
  
  const width = container.offsetWidth;
  const height = container.offsetHeight;
  
  console.log('[Network] Creating visualization with dimensions:', width, 'x', height);
  console.log('[Network] Data:', data.nodes.length, 'nodes,', data.links.length, 'links');
  
  // Create SVG
  const svg = d3.select(container)
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .style('background', '#fefdfb');
  
  // Add zoom behavior
  const zoom = d3.zoom()
    .scaleExtent([0.1, 10])
    .on('zoom', (event) => {
      g.attr('transform', event.transform);
    });
  
  svg.call(zoom);
  
  const g = svg.append('g');
  
  // Create force simulation
  const simulation = d3.forceSimulation(data.nodes)
    .force('link', d3.forceLink(data.links).id(d => d.id).distance(100))
    .force('charge', d3.forceManyBody().strength(-300))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(20));
  
  // Create links
  const link = g.append('g')
    .attr('stroke', '#999')
    .attr('stroke-opacity', 0.6)
    .selectAll('line')
    .data(data.links)
    .join('line')
    .attr('stroke-width', d => Math.sqrt(1));
  
  // Create nodes
  const node = g.append('g')
    .attr('stroke', '#fff')
    .attr('stroke-width', 1.5)
    .selectAll('circle')
    .data(data.nodes)
    .join('circle')
    .attr('r', 8)
    .attr('fill', '#4ecdc4')
    .call(d3.drag()
      .on('start', dragstarted)
      .on('drag', dragged)
      .on('end', dragended));
  
  // Add labels
  const label = g.append('g')
    .selectAll('text')
    .data(data.nodes)
    .join('text')
    .text(d => d.name)
    .style('font-size', '10px')
    .style('font-family', 'Arial, sans-serif')
    .style('fill', '#333')
    .style('pointer-events', 'none')
    .attr('dx', 12)
    .attr('dy', 4);
  
  // Add click handler to nodes
  node.on('click', (event, d) => {
    console.log('[Network] Node clicked:', d.name);
    if (window.electronAPI && d.path) {
      window.electronAPI.invoke('open-file-path', d.path)
        .then(result => {
          if (result.success) {
            console.log('[Network] File opened:', d.path);
            // Switch back to editor mode
            switchToMode('editor');
          } else {
            console.error('[Network] Error opening file:', result.error);
          }
        })
        .catch(error => {
          console.error('[Network] Error opening file:', error);
        });
    }
  });
  
  // Add tooltip
  node.append('title')
    .text(d => `${d.name}\nPath: ${d.path}`);
  
  // Update positions on simulation tick
  simulation.on('tick', () => {
    link
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x)
      .attr('y2', d => d.target.y);
    
    node
      .attr('cx', d => d.x)
      .attr('cy', d => d.y);
    
    label
      .attr('x', d => d.x)
      .attr('y', d => d.y);
  });
  
  // Drag functions
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
  
  return {
    svg: svg,
    simulation: simulation,
    width: width,
    height: height
  };
}

function updateNetworkStats(data) {
  const statsEl = document.getElementById('network-stats');
  if (statsEl) {
    const nodeCount = data.nodes.length;
    const linkCount = data.links.length;
    const avgConnections = nodeCount > 0 ? (linkCount * 2 / nodeCount).toFixed(1) : 0;
    
    statsEl.innerHTML = `
      <div class="stats-item">
        <span class="stats-label">Files:</span>
        <span class="stats-value">${nodeCount}</span>
      </div>
      <div class="stats-item">
        <span class="stats-label">Links:</span>
        <span class="stats-value">${linkCount}</span>
      </div>
      <div class="stats-item">
        <span class="stats-label">Avg Connections:</span>
        <span class="stats-value">${avgConnections}</span>
      </div>
    `;
  }
  
  // Update canvas info
  const canvas = document.getElementById('network-canvas');
  if (canvas && data.nodes.length === 0) {
    canvas.innerHTML = `
      <div style="display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100%; color: #666; text-align: center;">
        <div style="font-size: 48px; margin-bottom: 16px;">🔗</div>
        <div style="font-size: 18px; margin-bottom: 8px;">No Network Data</div>
        <div style="font-size: 14px;">No markdown files with internal links found in the current directory.</div>
        <div style="font-size: 12px; margin-top: 8px; opacity: 0.8;">
          Links are created by using [[internal links]] or [markdown links](file.md) syntax.
        </div>
      </div>
    `;
  }
}

async function refreshNetwork() {
  console.log('[Network] Refreshing network visualization...');
  networkData = await buildNetworkData();
  networkGraph = createNetworkVisualization(networkData);
  updateNetworkStats(networkData);
}

function centerNetwork() {
  if (networkGraph && networkGraph.svg) {
    const transform = d3.zoomIdentity.translate(networkGraph.width / 2, networkGraph.height / 2).scale(1);
    networkGraph.svg.transition().duration(750).call(
      d3.zoom().transform, transform
    );
  }
}

function fitNetwork() {
  if (networkGraph && networkGraph.svg && networkData.nodes.length > 0) {
    // Calculate bounds of all nodes
    let minX = d3.min(networkData.nodes, d => d.x || 0);
    let maxX = d3.max(networkData.nodes, d => d.x || 0);
    let minY = d3.min(networkData.nodes, d => d.y || 0);
    let maxY = d3.max(networkData.nodes, d => d.y || 0);
    
    const padding = 50;
    const width = maxX - minX + padding * 2;
    const height = maxY - minY + padding * 2;
    
    const scale = Math.min(networkGraph.width / width, networkGraph.height / height, 2);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    
    const transform = d3.zoomIdentity
      .translate(networkGraph.width / 2 - centerX * scale, networkGraph.height / 2 - centerY * scale)
      .scale(scale);
    
    networkGraph.svg.transition().duration(750).call(
      d3.zoom().transform, transform
    );
  }
}

function setupNetworkControls() {
  const refreshBtn = document.getElementById('network-refresh');
  const centerBtn = document.getElementById('network-center');
  const fitBtn = document.getElementById('network-fit');
  
  if (refreshBtn) {
    refreshBtn.addEventListener('click', refreshNetwork);
  }
  
  if (centerBtn) {
    centerBtn.addEventListener('click', centerNetwork);
  }
  
  if (fitBtn) {
    fitBtn.addEventListener('click', fitNetwork);
  }
}

function updateNetworkOnFileChange() {
  console.log('[Network] File change detected, updating network...');
  if (currentMode === 'network') {
    refreshNetwork();
  }
}

function setupNetworkFileWatchers() {
  // Watch for file changes if we have the capability
  if (window.electronAPI) {
    // Set up file change listeners
    // This would need to be implemented in the main process
    console.log('[Network] File watchers would be set up here');
  }
  
  // Debounced update function
  let debounceTimer = null;
  function debounceNetworkUpdate() {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(updateNetworkOnFileChange, 1000);
  }
  
  // Listen for editor content changes
  window.addEventListener('editorContentChanged', debounceNetworkUpdate);
}

async function initializeNetworkVisualization() {
  console.log('[Network] Initializing network visualization');
  setupNetworkControls();
  setupNetworkFileWatchers();
  await refreshNetwork();
}

// Graph and Circle visualization instances
let graphViewInstance = null;
let circleViewInstance = null;

// Initialize Graph visualization
async function initializeGraphVisualization() {
  console.log('[Graph] Initializing graph visualization');
  
  const graphContainer = document.getElementById('graph-visualization');
  if (!graphContainer) {
    console.error('[Graph] Graph container not found');
    return;
  }
  
  // Wait for GraphView class to be available
  if (typeof window.GraphView === 'undefined') {
    console.error('[Graph] GraphView class not available. Make sure graph.js is loaded.');
    return;
  }
  
  try {
    // Destroy existing instance
    if (graphViewInstance) {
      graphViewInstance.destroy();
    }
    
    // Create new instance
    graphViewInstance = new window.GraphView();
    await graphViewInstance.initialize(graphContainer);
    
    console.log('[Graph] Graph visualization initialized successfully');
  } catch (error) {
    console.error('[Graph] Error initializing graph visualization:', error);
  }
}

// Initialize Circle visualization  
async function initializeCircleVisualization() {
  console.log('[Circle] Initializing circle visualization');
  
  const circleContainer = document.getElementById('circle-visualization');
  if (!circleContainer) {
    console.error('[Circle] Circle container not found');
    return;
  }
  
  // Wait for CircleView class to be available
  if (typeof window.CircleView === 'undefined') {
    console.error('[Circle] CircleView class not available. Make sure circle.js is loaded.');
    return;
  }
  
  try {
    // Destroy existing instance
    if (circleViewInstance) {
      circleViewInstance.destroy();
    }
    
    // Create new instance
    circleViewInstance = new window.CircleView();
    await circleViewInstance.initialize(circleContainer);
    
    console.log('[Circle] Circle visualization initialized successfully');
  } catch (error) {
    console.error('[Circle] Error initializing circle visualization:', error);
  }
}

// Refresh functions for graph and circle
function refreshGraph() {
  if (graphViewInstance) {
    graphViewInstance.refresh();
  }
}

function refreshCircle() {
  if (circleViewInstance) {
    circleViewInstance.refresh();
  }
}

// Export functions to global scope for backward compatibility
window.initializeNetworkVisualization = initializeNetworkVisualization;
window.initializeGraphVisualization = initializeGraphVisualization;
window.initializeCircleVisualization = initializeCircleVisualization;
window.refreshNetwork = refreshNetwork;
window.refreshGraph = refreshGraph;
window.refreshCircle = refreshCircle;
window.centerNetwork = centerNetwork;
window.fitNetwork = fitNetwork;
window.parseInternalLinks = parseInternalLinks;
window.buildNetworkData = buildNetworkData;
window.createNetworkVisualization = createNetworkVisualization;
window.updateNetworkStats = updateNetworkStats;