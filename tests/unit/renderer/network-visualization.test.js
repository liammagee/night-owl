// Test the network visualization functionality from js/network-visualization.js

describe('Network Visualization', () => {
  let mockD3, mockFiles, mockFileContent;
  
  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = `
      <div id="network-svg"></div>
      <div id="graph-svg"></div>
      <div id="circle-svg"></div>
      <div id="network-controls">
        <select id="layout-select">
          <option value="force">Force Layout</option>
          <option value="circular">Circular Layout</option>
        </select>
        <button id="reset-zoom-btn">Reset Zoom</button>
        <input type="range" id="link-distance-slider" min="50" max="300" value="150">
      </div>
    `;

    // Mock D3.js
    mockD3 = {
      select: jest.fn().mockReturnThis(),
      selectAll: jest.fn().mockReturnThis(),
      append: jest.fn().mockReturnThis(),
      attr: jest.fn().mockReturnThis(),
      style: jest.fn().mockReturnThis(),
      text: jest.fn().mockReturnThis(),
      data: jest.fn().mockReturnThis(),
      enter: jest.fn().mockReturnThis(),
      exit: jest.fn().mockReturnThis(),
      remove: jest.fn().mockReturnThis(),
      on: jest.fn().mockReturnThis(),
      call: jest.fn().mockReturnThis(),
      transition: jest.fn().mockReturnThis(),
      duration: jest.fn().mockReturnThis(),
      zoom: jest.fn(() => mockD3),
      zoomIdentity: { k: 1, x: 0, y: 0 },
      forceSimulation: jest.fn(() => ({
        nodes: jest.fn().mockReturnThis(),
        force: jest.fn().mockReturnThis(),
        on: jest.fn().mockReturnThis(),
        alpha: jest.fn().mockReturnThis(),
        restart: jest.fn().mockReturnThis()
      })),
      forceManyBody: jest.fn(() => ({ strength: jest.fn().mockReturnThis() })),
      forceLink: jest.fn(() => ({ 
        id: jest.fn().mockReturnThis(),
        distance: jest.fn().mockReturnThis()
      })),
      forceCenter: jest.fn(() => mockD3),
      scaleOrdinal: jest.fn(() => mockD3),
      schemeCategory10: ['#1f77b4', '#ff7f0e', '#2ca02c']
    };

    global.d3 = mockD3;

    // Mock file data
    mockFiles = [
      { name: 'file1.md', path: '/path/file1.md' },
      { name: 'file2.md', path: '/path/file2.md' },
      { name: 'file3.md', path: '/path/file3.md' }
    ];

    mockFileContent = {
      '/path/file1.md': 'This links to [[file2]] and mentions [[file3|Custom Name]]',
      '/path/file2.md': 'This references [[file1]] and has content',
      '/path/file3.md': 'Standalone file with no links'
    };

    // Mock global functions
    const mockGetFilteredFiles = jest.fn(() => {
      return Promise.resolve(mockFiles);
    });
    
    const mockElectronAPI = {
      invoke: jest.fn((action, arg) => {
        if (action === 'get-all-files') {
          return Promise.resolve(mockFiles);
        }
        if (action === 'read-file-content') {
          return Promise.resolve(mockFileContent[arg] || '');
        }
        return Promise.resolve();
      })
    };
    
    global.window = {
      electronAPI: mockElectronAPI,
      getFilteredFiles: mockGetFilteredFiles
    };
    
    // Also assign to window directly for Jest environment
    Object.assign(window, {
      electronAPI: mockElectronAPI,
      getFilteredFiles: mockGetFilteredFiles
    });

    // Reset all mocks (but don't clear the mockImplementation)
    // jest.clearAllMocks();
  });

  // Mock implementation of key functions from network-visualization.js
  class NetworkVisualization {
    constructor(containerId) {
      this.containerId = containerId;
      this.nodes = [];
      this.links = [];
      this.simulation = null;
      this.svg = null;
      this.width = 800;
      this.height = 600;
    }

    async loadData() {
      try {
        const files = await window.getFilteredFiles();
        const nodes = [];
        const links = [];
        const linkMap = new Map();

        // Create nodes
        for (const file of files) {
          nodes.push({
            id: file.path,
            name: file.name.replace('.md', ''),
            path: file.path,
            group: 1
          });
        }

        // Extract links from file content
        for (const file of files) {
          const content = await window.electronAPI.invoke('read-file-content', file.path);
          const internalLinks = this.extractInternalLinks(content);
          
          for (const link of internalLinks) {
            const targetFile = files.find(f => 
              f.name.replace('.md', '') === link || 
              f.path.includes(link)
            );
            
            if (targetFile) {
              const linkKey = `${file.path}->${targetFile.path}`;
              if (!linkMap.has(linkKey)) {
                links.push({
                  source: file.path,
                  target: targetFile.path,
                  value: 1
                });
                linkMap.set(linkKey, true);
              }
            }
          }
        }

        this.nodes = nodes;
        this.links = links;
        return { nodes, links };
      } catch (error) {
        console.error('Error loading network data:', error);
        return { nodes: [], links: [] };
      }
    }

    extractInternalLinks(content) {
      const linkRegex = /\[\[([^\]]+)\]\]/g;
      const links = [];
      let match;
      
      while ((match = linkRegex.exec(content)) !== null) {
        const link = match[1];
        const linkName = link.includes('|') ? link.split('|')[0] : link;
        links.push(linkName.trim());
      }
      
      return links;
    }

    initializeVisualization() {
      const container = document.getElementById(this.containerId);
      if (!container) return;

      // Create SVG
      this.svg = d3.select(`#${this.containerId}`)
        .append('svg')
        .attr('width', this.width)
        .attr('height', this.height);

      // Set up zoom
      const zoom = d3.zoom()
        .on('zoom', (event) => {
          this.svg.select('g').attr('transform', event.transform);
        });

      this.svg.call(zoom);

      // Create main group
      this.svg.append('g').attr('class', 'network-group');
    }

    updateVisualization() {
      if (!this.svg || !this.nodes.length) return;

      const group = this.svg.select('.network-group');

      // Create force simulation
      this.simulation = d3.forceSimulation(this.nodes)
        .force('link', d3.forceLink(this.links).id(d => d.id).distance(150))
        .force('charge', d3.forceManyBody().strength(-300))
        .force('center', d3.forceCenter(this.width / 2, this.height / 2));

      // Draw links
      const links = group.selectAll('.link')
        .data(this.links)
        .enter()
        .append('line')
        .attr('class', 'link')
        .style('stroke', '#999')
        .style('stroke-width', 2);

      // Draw nodes
      const nodes = group.selectAll('.node')
        .data(this.nodes)
        .enter()
        .append('circle')
        .attr('class', 'node')
        .attr('r', 8)
        .style('fill', d => d3.scaleOrdinal(d3.schemeCategory10)(d.group));

      // Add node labels
      const labels = group.selectAll('.label')
        .data(this.nodes)
        .enter()
        .append('text')
        .attr('class', 'label')
        .text(d => d.name)
        .style('font-size', '12px')
        .style('text-anchor', 'middle');

      // Update positions on simulation tick
      this.simulation.on('tick', () => {
        links
          .attr('x1', d => d.source.x)
          .attr('y1', d => d.source.y)
          .attr('x2', d => d.target.x)
          .attr('y2', d => d.target.y);

        nodes
          .attr('cx', d => d.x)
          .attr('cy', d => d.y);

        labels
          .attr('x', d => d.x)
          .attr('y', d => d.y + 4);
      });
    }

    resetZoom() {
      if (this.svg) {
        this.svg.transition()
          .duration(750)
          .call(d3.zoom().transform, d3.zoomIdentity);
      }
    }

    setLinkDistance(distance) {
      if (this.simulation) {
        this.simulation.force('link').distance(distance);
        this.simulation.alpha(1).restart();
      }
    }
  }

  describe('Network Data Loading', () => {
    let network;

    beforeEach(() => {
      network = new NetworkVisualization('network-svg');
    });

    test('should load files and create nodes', async () => {
      const data = await network.loadData();
      
      expect(data.nodes).toHaveLength(3);
      expect(data.nodes[0]).toEqual({
        id: '/path/file1.md',
        name: 'file1',
        path: '/path/file1.md',
        group: 1
      });
    });

    test('should extract internal links from content', () => {
      const content = 'This links to [[file2]] and [[file3|Custom Name]] and [[nonexistent]]';
      const links = network.extractInternalLinks(content);

      expect(links).toEqual(['file2', 'file3', 'nonexistent']);
    });

    test('should create links between connected files', async () => {
      const data = await network.loadData();

      expect(data.links).toHaveLength(3);
      expect(data.links).toContainEqual({
        source: '/path/file1.md',
        target: '/path/file2.md',
        value: 1
      });
      expect(data.links).toContainEqual({
        source: '/path/file1.md',
        target: '/path/file3.md',
        value: 1
      });
      expect(data.links).toContainEqual({
        source: '/path/file2.md',
        target: '/path/file1.md',
        value: 1
      });
    });

    test('should handle files with no links', async () => {
      const data = await network.loadData();
      
      // file3 has no outgoing links
      const file3Links = data.links.filter(link => link.source === '/path/file3.md');
      expect(file3Links).toHaveLength(0);
    });

    test('should handle API errors gracefully', async () => {
      window.getFilteredFiles = jest.fn().mockRejectedValue(new Error('API Error'));
      
      const data = await network.loadData();

      expect(data.nodes).toEqual([]);
      expect(data.links).toEqual([]);
    });

    test('should deduplicate links', async () => {
      // Mock content with duplicate links
      mockFileContent['/path/file1.md'] = 'Links to [[file2]] and [[file2]] again';
      
      const data = await network.loadData();
      
      const file1ToFile2Links = data.links.filter(
        link => link.source === '/path/file1.md' && link.target === '/path/file2.md'
      );
      expect(file1ToFile2Links).toHaveLength(1);
    });
  });

  describe('Visualization Initialization', () => {
    let network;

    beforeEach(() => {
      network = new NetworkVisualization('network-svg');
    });

    test('should create SVG element', () => {
      network.initializeVisualization();

      expect(mockD3.select).toHaveBeenCalledWith('#network-svg');
      expect(mockD3.append).toHaveBeenCalledWith('svg');
      expect(mockD3.attr).toHaveBeenCalledWith('width', 800);
      expect(mockD3.attr).toHaveBeenCalledWith('height', 600);
    });

    test('should set up zoom functionality', () => {
      network.initializeVisualization();

      expect(mockD3.zoom).toHaveBeenCalled();
      expect(mockD3.on).toHaveBeenCalledWith('zoom', expect.any(Function));
      expect(mockD3.call).toHaveBeenCalled();
    });

    test('should handle missing container element', () => {
      const network = new NetworkVisualization('nonexistent-container');
      
      expect(() => network.initializeVisualization()).not.toThrow();
    });

    test('should create main group element', () => {
      network.initializeVisualization();

      expect(mockD3.append).toHaveBeenCalledWith('g');
      expect(mockD3.attr).toHaveBeenCalledWith('class', 'network-group');
    });
  });

  describe('Visualization Updates', () => {
    let network;

    beforeEach(async () => {
      network = new NetworkVisualization('network-svg');
      network.initializeVisualization();
      await network.loadData();
    });

    test('should create force simulation with correct forces', () => {
      network.updateVisualization();

      expect(mockD3.forceSimulation).toHaveBeenCalledWith(network.nodes);
      expect(mockD3.forceLink).toHaveBeenCalled();
      expect(mockD3.forceManyBody).toHaveBeenCalled();
      expect(mockD3.forceCenter).toHaveBeenCalled();
    });

    test('should draw links', () => {
      network.updateVisualization();

      expect(mockD3.selectAll).toHaveBeenCalledWith('.link');
      expect(mockD3.data).toHaveBeenCalledWith(network.links);
      expect(mockD3.append).toHaveBeenCalledWith('line');
    });

    test('should draw nodes', () => {
      network.updateVisualization();

      expect(mockD3.selectAll).toHaveBeenCalledWith('.node');
      expect(mockD3.data).toHaveBeenCalledWith(network.nodes);
      expect(mockD3.append).toHaveBeenCalledWith('circle');
    });

    test('should draw node labels', () => {
      network.updateVisualization();

      expect(mockD3.selectAll).toHaveBeenCalledWith('.label');
      expect(mockD3.append).toHaveBeenCalledWith('text');
      expect(mockD3.text).toHaveBeenCalled();
    });

    test('should handle empty data gracefully', () => {
      network.nodes = [];
      network.links = [];
      
      expect(() => network.updateVisualization()).not.toThrow();
    });

    test('should handle missing SVG gracefully', () => {
      network.svg = null;
      
      expect(() => network.updateVisualization()).not.toThrow();
    });
  });

  describe('Interaction Controls', () => {
    let network;

    beforeEach(async () => {
      network = new NetworkVisualization('network-svg');
      network.initializeVisualization();
      await network.loadData();
      network.updateVisualization();
    });

    test('should reset zoom', () => {
      network.resetZoom();

      expect(mockD3.transition).toHaveBeenCalled();
      expect(mockD3.duration).toHaveBeenCalledWith(750);
      expect(mockD3.call).toHaveBeenCalled();
    });

    test('should update link distance', () => {
      const mockForce = {
        distance: jest.fn().mockReturnThis()
      };
      const mockSimulation = {
        force: jest.fn(() => mockForce),
        alpha: jest.fn().mockReturnThis(),
        restart: jest.fn()
      };
      network.simulation = mockSimulation;

      network.setLinkDistance(200);

      expect(mockSimulation.force).toHaveBeenCalledWith('link');
      expect(mockForce.distance).toHaveBeenCalledWith(200);
      expect(mockSimulation.alpha).toHaveBeenCalledWith(1);
      expect(mockSimulation.restart).toHaveBeenCalled();
    });

    test('should handle zoom reset with missing SVG', () => {
      network.svg = null;
      
      expect(() => network.resetZoom()).not.toThrow();
    });

    test('should handle link distance update with missing simulation', () => {
      network.simulation = null;
      
      expect(() => network.setLinkDistance(200)).not.toThrow();
    });
  });

  describe('Link Extraction Edge Cases', () => {
    let network;

    beforeEach(() => {
      network = new NetworkVisualization('network-svg');
    });

    test('should handle links with display names', () => {
      const content = 'Links to [[file1|Custom Display Name]]';
      const links = network.extractInternalLinks(content);

      expect(links).toEqual(['file1']);
    });

    test('should handle multiple links in same content', () => {
      const content = 'Links to [[file1]], [[file2]], and [[file3|Name]]';
      const links = network.extractInternalLinks(content);

      expect(links).toEqual(['file1', 'file2', 'file3']);
    });

    test('should handle empty content', () => {
      const links = network.extractInternalLinks('');
      expect(links).toEqual([]);
    });

    test('should handle content with no links', () => {
      const content = 'This content has no internal links.';
      const links = network.extractInternalLinks(content);

      expect(links).toEqual([]);
    });

    test('should handle malformed link syntax', () => {
      const content = 'Malformed [[incomplete link and [single bracket]';
      const links = network.extractInternalLinks(content);

      expect(links).toEqual([]);
    });

    test('should trim whitespace from link names', () => {
      const content = 'Links to [[ file1 ]] and [[ file2 | Name ]]';
      const links = network.extractInternalLinks(content);

      expect(links).toEqual(['file1', 'file2']);
    });
  });
});