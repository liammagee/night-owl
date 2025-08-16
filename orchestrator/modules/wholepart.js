// === Whole/Part Relations Visualization Module ===
// Adapted from wholepart/script.js for integration into the main application

class WholepartVisualization {
    constructor() {
        this.initialized = false;
        this.width = 600;
        this.height = 400;
        this.centerX = this.width / 2;
        this.centerY = this.height / 2;
        
        this.currentVisualization = 0;
        this.isAnimating = false;
        this.animationTime = 0;
        
        // Data extracted from current document
        this.concepts = [];
        this.wholeName = '';
        
        this.philosophicalDescriptions = [
            {
                title: "Circular Ring - Whole at Top",
                description: "The whole transcends its parts while remaining their foundation. Parts orbit the whole, connected yet distinct, in a harmonious relationship of dependency and autonomy."
            },
            {
                title: "Center-Radial - Whole at Center",
                description: "The whole as the absolute center from which all parts emanate. This represents the idealist notion that reality unfolds from a central principle or idea."
            },
            {
                title: "Containment - Parts within Whole",
                description: "The whole as the encompassing totality that contains and gives meaning to its parts. Parts exist within the horizon of the whole's self-understanding."
            },
            {
                title: "Spiral from Center",
                description: "The dialectical emergence of parts from the whole through a spiral process. Each part emerges at a different stage of the whole's self-development."
            },
            {
                title: "Spiral of Parts",
                description: "Parts connected in a developmental sequence, each building upon the previous. The whole emerges through this progressive spiral of part-relationships."
            },
            {
                title: "Dialectical Progression",
                description: "The dynamic interplay between whole and parts through thesis-antithesis-synthesis. Each part negates and preserves previous parts in a higher unity."
            },
            {
                title: "Spiral with Radiating Parts",
                description: "A complex relationship where parts both emerge spirally and radiate outward, showing multiple modes of whole-part relationship simultaneously."
            },
            {
                title: "Fractal Self-Similarity",
                description: "Each part contains the structure of the whole within itself. This represents the holographic nature of reality where the whole is implicit in every part."
            },
            {
                title: "Hegelian Nested Containment",
                description: "Recursive containment where parts contain sub-parts, creating a nested hierarchy. The absolute whole contains relative wholes as its parts."
            }
        ];
    }

    initialize() {
        if (this.initialized) return;
        
        console.log('[Wholepart] Initializing visualization...');
        this.extractConceptsFromDocument();
        this.setupSVG();
        this.setupEventListeners();
        this.createVisualization(0);
        this.updateDescription(0);
        this.initialized = true;
    }

    extractConceptsFromDocument() {
        // Try to extract concepts from the current editor content
        let content = '';
        if (window.editor && typeof window.editor.getValue === 'function') {
            content = window.editor.getValue();
        }

        // Extract filename for the "whole"
        const currentFile = window.currentFilePath || 'Document';
        this.wholeName = currentFile.split('/').pop()?.replace(/\.[^/.]+$/, "") || 'Document';

        // Parse different formats of lists
        this.concepts = this.parseConceptsFromContent(content);
        
        // Fallback to default concepts if none found
        if (this.concepts.length === 0) {
            this.concepts = [
                'Synthesis: ML & Human Learning',
                'Experience', 
                'Attention',
                'Recognition',
                'Consciousness',
                'Alignment',
                'Critique',
                'Synthesis: Technosymbiosis'
            ];
            this.wholeName = 'Hegel Pedagogy Course';
        }

        console.log(`[Wholepart] Extracted ${this.concepts.length} concepts for whole: "${this.wholeName}"`);
    }

    parseConceptsFromContent(content) {
        const concepts = [];
        
        // Split into lines and process
        const lines = content.split('\n');
        
        for (const line of lines) {
            const trimmed = line.trim();
            
            // Match numbered lists: "1. Concept" or "1) Concept"
            const numberedMatch = trimmed.match(/^\d+[\.\)]\s*(.+)$/);
            if (numberedMatch) {
                concepts.push(numberedMatch[1].trim());
                continue;
            }
            
            // Match bullet points: "- Concept" or "* Concept"
            const bulletMatch = trimmed.match(/^[-\*]\s+(.+)$/);
            if (bulletMatch) {
                concepts.push(bulletMatch[1].trim());
                continue;
            }
            
            // Match headers: "## Concept" or "### Concept"
            const headerMatch = trimmed.match(/^#{2,6}\s+(.+)$/);
            if (headerMatch) {
                concepts.push(headerMatch[1].trim());
                continue;
            }
        }
        
        // Remove duplicates and empty items
        return [...new Set(concepts)].filter(c => c.length > 0);
    }

    setupSVG() {
        const container = document.getElementById('wholepart-visualization');
        if (!container) {
            console.error('[Wholepart] Container not found');
            return;
        }

        // Clear any existing content
        container.innerHTML = '';

        // Calculate dimensions based on container
        const rect = container.getBoundingClientRect();
        this.width = Math.max(400, rect.width - 20);
        this.height = Math.max(300, rect.height - 20);
        this.centerX = this.width / 2;
        this.centerY = this.height / 2;

        this.svg = d3.select(container)
            .append('svg')
            .attr('width', this.width)
            .attr('height', this.height)
            .style('background', '#fafafa');

        // Add definitions for markers and gradients
        const defs = this.svg.append('defs');
        
        defs.append('marker')
            .attr('id', 'arrowhead')
            .attr('viewBox', '0 -5 10 10')
            .attr('refX', 8)
            .attr('refY', 0)
            .attr('markerWidth', 6)
            .attr('markerHeight', 6)
            .attr('orient', 'auto')
            .append('path')
            .attr('d', 'M0,-5L10,0L0,5')
            .attr('fill', '#4ecdc4');

        // Create main groups
        this.connectionsGroup = this.svg.append('g').attr('class', 'connections');
        this.nodesGroup = this.svg.append('g').attr('class', 'nodes');
        this.labelsGroup = this.svg.append('g').attr('class', 'labels');
    }

    setupEventListeners() {
        const visualizationSelect = document.getElementById('wholepart-visualization-type');
        const refreshBtn = document.getElementById('wholepart-refresh');
        const animateBtn = document.getElementById('wholepart-animate');
        const resetBtn = document.getElementById('wholepart-reset');
        const zoomInBtn = document.getElementById('wholepart-zoom-in');
        const zoomOutBtn = document.getElementById('wholepart-zoom-out');

        if (visualizationSelect) {
            visualizationSelect.addEventListener('change', (e) => {
                const newType = parseInt(e.target.value);
                this.currentVisualization = newType;
                this.createVisualization(newType);
                this.updateDescription(newType);
            });
        }

        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.extractConceptsFromDocument();
                this.createVisualization(this.currentVisualization);
            });
        }

        if (animateBtn) {
            animateBtn.addEventListener('click', () => {
                this.toggleAnimation();
            });
        }

        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                this.resetView();
            });
        }

        if (zoomInBtn) {
            zoomInBtn.addEventListener('click', () => {
                this.zoom(1.2);
            });
        }

        if (zoomOutBtn) {
            zoomOutBtn.addEventListener('click', () => {
                this.zoom(0.8);
            });
        }
    }

    createVisualization(type) {
        if (!this.svg) return;

        // Clear existing visualization
        this.connectionsGroup.selectAll('*').remove();
        this.nodesGroup.selectAll('*').remove();
        this.labelsGroup.selectAll('*').remove();

        const numParts = this.concepts.length;
        
        switch (type) {
            case 0: this.createCircularRing(numParts); break;
            case 1: this.createCenterRadial(numParts); break;
            case 2: this.createContainment(numParts); break;
            case 3: this.createSpiralFromCenter(numParts); break;
            case 4: this.createSpiralOfParts(numParts); break;
            case 5: this.createDialecticalProgression(numParts); break;
            case 6: this.createSpiralRadiating(numParts); break;
            case 7: this.createFractalSimilarity(numParts); break;
            case 8: this.createNestedContainment(numParts); break;
            default: this.createCircularRing(numParts);
        }
    }

    createCircularRing(numParts) {
        const radius = Math.min(this.width, this.height) * 0.3;
        const wholeY = this.centerY - radius - 60;
        
        // Draw the whole at the top
        this.nodesGroup.append('circle')
            .attr('cx', this.centerX)
            .attr('cy', wholeY)
            .attr('r', 30)
            .attr('fill', '#e74c3c')
            .attr('stroke', '#c0392b')
            .attr('stroke-width', 3);

        this.labelsGroup.append('text')
            .attr('x', this.centerX)
            .attr('y', wholeY + 5)
            .attr('text-anchor', 'middle')
            .attr('font-size', '12px')
            .attr('font-weight', 'bold')
            .attr('fill', 'white')
            .text(this.wholeName);

        // Draw parts in a circle
        for (let i = 0; i < numParts; i++) {
            const angle = (i / numParts) * 2 * Math.PI - Math.PI / 2;
            const x = this.centerX + radius * Math.cos(angle);
            const y = this.centerY + radius * Math.sin(angle);

            // Draw connection to whole
            this.connectionsGroup.append('line')
                .attr('x1', this.centerX)
                .attr('y1', wholeY)
                .attr('x2', x)
                .attr('y2', y)
                .attr('stroke', '#4ecdc4')
                .attr('stroke-width', 2)
                .attr('stroke-dasharray', '5,5');

            // Draw part node
            this.nodesGroup.append('circle')
                .attr('cx', x)
                .attr('cy', y)
                .attr('r', 20)
                .attr('fill', '#3498db')
                .attr('stroke', '#2980b9')
                .attr('stroke-width', 2);

            // Add label
            this.labelsGroup.append('text')
                .attr('x', x)
                .attr('y', y + 4)
                .attr('text-anchor', 'middle')
                .attr('font-size', '10px')
                .attr('font-weight', 'bold')
                .attr('fill', 'white')
                .text(this.concepts[i] || `Part ${i + 1}`);
        }
    }

    createCenterRadial(numParts) {
        const radius = Math.min(this.width, this.height) * 0.35;
        
        // Draw the whole at center
        this.nodesGroup.append('circle')
            .attr('cx', this.centerX)
            .attr('cy', this.centerY)
            .attr('r', 35)
            .attr('fill', '#e74c3c')
            .attr('stroke', '#c0392b')
            .attr('stroke-width', 3);

        this.labelsGroup.append('text')
            .attr('x', this.centerX)
            .attr('y', this.centerY + 5)
            .attr('text-anchor', 'middle')
            .attr('font-size', '12px')
            .attr('font-weight', 'bold')
            .attr('fill', 'white')
            .text(this.wholeName);

        // Draw parts radiating outward
        for (let i = 0; i < numParts; i++) {
            const angle = (i / numParts) * 2 * Math.PI;
            const x = this.centerX + radius * Math.cos(angle);
            const y = this.centerY + radius * Math.sin(angle);

            // Draw connection from center
            this.connectionsGroup.append('line')
                .attr('x1', this.centerX)
                .attr('y1', this.centerY)
                .attr('x2', x)
                .attr('y2', y)
                .attr('stroke', '#4ecdc4')
                .attr('stroke-width', 2)
                .attr('marker-end', 'url(#arrowhead)');

            // Draw part node
            this.nodesGroup.append('circle')
                .attr('cx', x)
                .attr('cy', y)
                .attr('r', 18)
                .attr('fill', '#3498db')
                .attr('stroke', '#2980b9')
                .attr('stroke-width', 2);

            // Add label
            this.labelsGroup.append('text')
                .attr('x', x)
                .attr('y', y + 4)
                .attr('text-anchor', 'middle')
                .attr('font-size', '9px')
                .attr('font-weight', 'bold')
                .attr('fill', 'white')
                .text(this.concepts[i] || `Part ${i + 1}`);
        }
    }

    createContainment(numParts) {
        // Draw large containing circle for the whole
        const wholeRadius = Math.min(this.width, this.height) * 0.4;
        
        this.nodesGroup.append('circle')
            .attr('cx', this.centerX)
            .attr('cy', this.centerY)
            .attr('r', wholeRadius)
            .attr('fill', 'none')
            .attr('stroke', '#e74c3c')
            .attr('stroke-width', 4)
            .attr('stroke-dasharray', '10,5');

        // Add whole label at top
        this.labelsGroup.append('text')
            .attr('x', this.centerX)
            .attr('y', this.centerY - wholeRadius + 20)
            .attr('text-anchor', 'middle')
            .attr('font-size', '14px')
            .attr('font-weight', 'bold')
            .attr('fill', '#e74c3c')
            .text(this.wholeName);

        // Arrange parts within the whole
        const partRadius = wholeRadius * 0.6;
        for (let i = 0; i < numParts; i++) {
            const angle = (i / numParts) * 2 * Math.PI;
            const x = this.centerX + partRadius * Math.cos(angle);
            const y = this.centerY + partRadius * Math.sin(angle);

            // Draw part node
            this.nodesGroup.append('circle')
                .attr('cx', x)
                .attr('cy', y)
                .attr('r', 16)
                .attr('fill', '#3498db')
                .attr('stroke', '#2980b9')
                .attr('stroke-width', 2);

            // Add label
            this.labelsGroup.append('text')
                .attr('x', x)
                .attr('y', y + 4)
                .attr('text-anchor', 'middle')
                .attr('font-size', '9px')
                .attr('font-weight', 'bold')
                .attr('fill', 'white')
                .text(this.concepts[i] || `Part ${i + 1}`);
        }
    }

    createSpiralFromCenter(numParts) {
        const maxRadius = Math.min(this.width, this.height) * 0.35;
        
        // Draw the whole at center
        this.nodesGroup.append('circle')
            .attr('cx', this.centerX)
            .attr('cy', this.centerY)
            .attr('r', 25)
            .attr('fill', '#e74c3c')
            .attr('stroke', '#c0392b')
            .attr('stroke-width', 3);

        this.labelsGroup.append('text')
            .attr('x', this.centerX)
            .attr('y', this.centerY + 4)
            .attr('text-anchor', 'middle')
            .attr('font-size', '10px')
            .attr('font-weight', 'bold')
            .attr('fill', 'white')
            .text(this.wholeName);

        // Create spiral path for parts
        for (let i = 0; i < numParts; i++) {
            const t = i / (numParts - 1);
            const angle = t * 4 * Math.PI; // 2 full turns
            const radius = t * maxRadius;
            const x = this.centerX + radius * Math.cos(angle);
            const y = this.centerY + radius * Math.sin(angle);

            // Draw part node
            this.nodesGroup.append('circle')
                .attr('cx', x)
                .attr('cy', y)
                .attr('r', 14)
                .attr('fill', '#3498db')
                .attr('stroke', '#2980b9')
                .attr('stroke-width', 2);

            // Add label
            this.labelsGroup.append('text')
                .attr('x', x)
                .attr('y', y + 3)
                .attr('text-anchor', 'middle')
                .attr('font-size', '8px')
                .attr('font-weight', 'bold')
                .attr('fill', 'white')
                .text(this.concepts[i] || `${i + 1}`);

            // Connect to previous part or center
            if (i === 0) {
                this.connectionsGroup.append('line')
                    .attr('x1', this.centerX)
                    .attr('y1', this.centerY)
                    .attr('x2', x)
                    .attr('y2', y)
                    .attr('stroke', '#4ecdc4')
                    .attr('stroke-width', 2);
            } else {
                const prevT = (i - 1) / (numParts - 1);
                const prevAngle = prevT * 4 * Math.PI;
                const prevRadius = prevT * maxRadius;
                const prevX = this.centerX + prevRadius * Math.cos(prevAngle);
                const prevY = this.centerY + prevRadius * Math.sin(prevAngle);
                
                this.connectionsGroup.append('line')
                    .attr('x1', prevX)
                    .attr('y1', prevY)
                    .attr('x2', x)
                    .attr('y2', y)
                    .attr('stroke', '#4ecdc4')
                    .attr('stroke-width', 2);
            }
        }
    }

    createSpiralOfParts(numParts) {
        // Similar to spiral from center but no central whole
        const maxRadius = Math.min(this.width, this.height) * 0.4;
        
        for (let i = 0; i < numParts; i++) {
            const t = i / (numParts - 1);
            const angle = t * 6 * Math.PI; // 3 full turns
            const radius = 30 + t * maxRadius;
            const x = this.centerX + radius * Math.cos(angle);
            const y = this.centerY + radius * Math.sin(angle);

            // Draw part node
            const nodeRadius = i === 0 ? 20 : 16; // First part is slightly larger
            this.nodesGroup.append('circle')
                .attr('cx', x)
                .attr('cy', y)
                .attr('r', nodeRadius)
                .attr('fill', i === 0 ? '#e67e22' : '#3498db')
                .attr('stroke', i === 0 ? '#d35400' : '#2980b9')
                .attr('stroke-width', 2);

            // Add label
            this.labelsGroup.append('text')
                .attr('x', x)
                .attr('y', y + 3)
                .attr('text-anchor', 'middle')
                .attr('font-size', i === 0 ? '10px' : '8px')
                .attr('font-weight', 'bold')
                .attr('fill', 'white')
                .text(this.concepts[i] || `${i + 1}`);

            // Connect to previous part
            if (i > 0) {
                const prevT = (i - 1) / (numParts - 1);
                const prevAngle = prevT * 6 * Math.PI;
                const prevRadius = 30 + prevT * maxRadius;
                const prevX = this.centerX + prevRadius * Math.cos(prevAngle);
                const prevY = this.centerY + prevRadius * Math.sin(prevAngle);
                
                this.connectionsGroup.append('line')
                    .attr('x1', prevX)
                    .attr('y1', prevY)
                    .attr('x2', x)
                    .attr('y2', y)
                    .attr('stroke', '#4ecdc4')
                    .attr('stroke-width', 2)
                    .attr('marker-end', 'url(#arrowhead)');
            }
        }
    }

    createDialecticalProgression(numParts) {
        // Arrange in a dialectical pattern: thesis, antithesis, synthesis progression
        const stageWidth = this.width / Math.ceil(numParts / 3);
        
        for (let i = 0; i < numParts; i++) {
            const stage = Math.floor(i / 3);
            const position = i % 3; // 0=thesis, 1=antithesis, 2=synthesis
            
            const x = stageWidth * stage + stageWidth / 2;
            const y = this.centerY + (position - 1) * 60; // -60, 0, +60
            
            let color, label;
            switch (position) {
                case 0: color = '#3498db'; label = 'T'; break; // Thesis - blue
                case 1: color = '#e74c3c'; label = 'A'; break; // Antithesis - red  
                case 2: color = '#2ecc71'; label = 'S'; break; // Synthesis - green
            }
            
            // Draw part node
            this.nodesGroup.append('circle')
                .attr('cx', x)
                .attr('cy', y)
                .attr('r', 18)
                .attr('fill', color)
                .attr('stroke', d3.color(color).darker())
                .attr('stroke-width', 2);

            // Add concept label
            this.labelsGroup.append('text')
                .attr('x', x)
                .attr('y', y + 3)
                .attr('text-anchor', 'middle')
                .attr('font-size', '8px')
                .attr('font-weight', 'bold')
                .attr('fill', 'white')
                .text(this.concepts[i] || `${i + 1}`);
                
            // Add position indicator
            this.labelsGroup.append('text')
                .attr('x', x)
                .attr('y', y - 25)
                .attr('text-anchor', 'middle')
                .attr('font-size', '10px')
                .attr('font-weight', 'bold')
                .attr('fill', color)
                .text(label);

            // Draw connections within each dialectical triad
            if (position === 1) { // antithesis connects to thesis
                const thesisX = x;
                const thesisY = y - 60;
                this.connectionsGroup.append('line')
                    .attr('x1', thesisX)
                    .attr('y1', thesisY)
                    .attr('x2', x)
                    .attr('y2', y)
                    .attr('stroke', '#95a5a6')
                    .attr('stroke-width', 2)
                    .attr('stroke-dasharray', '3,3');
            } else if (position === 2) { // synthesis connects to both
                const thesisX = x;
                const thesisY = y - 120;
                const antithesisX = x;
                const antithesisY = y - 60;
                
                this.connectionsGroup.append('line')
                    .attr('x1', thesisX)
                    .attr('y1', thesisY)
                    .attr('x2', x)
                    .attr('y2', y)
                    .attr('stroke', '#4ecdc4')
                    .attr('stroke-width', 2);
                    
                this.connectionsGroup.append('line')
                    .attr('x1', antithesisX)
                    .attr('y1', antithesisY)
                    .attr('x2', x)
                    .attr('y2', y)
                    .attr('stroke', '#4ecdc4')
                    .attr('stroke-width', 2);
            }
        }
    }

    createSpiralRadiating(numParts) {
        // Combination of spiral and radial patterns
        this.createCenterRadial(Math.min(numParts, 6));
        if (numParts > 6) {
            // Add spiral for extra parts
            const remaining = numParts - 6;
            for (let i = 0; i < remaining; i++) {
                const t = i / remaining;
                const angle = t * 4 * Math.PI;
                const radius = 200 + t * 100;
                const x = this.centerX + radius * Math.cos(angle);
                const y = this.centerY + radius * Math.sin(angle);

                this.nodesGroup.append('circle')
                    .attr('cx', x)
                    .attr('cy', y)
                    .attr('r', 12)
                    .attr('fill', '#9b59b6')
                    .attr('stroke', '#8e44ad')
                    .attr('stroke-width', 2);

                this.labelsGroup.append('text')
                    .attr('x', x)
                    .attr('y', y + 3)
                    .attr('text-anchor', 'middle')
                    .attr('font-size', '8px')
                    .attr('font-weight', 'bold')
                    .attr('fill', 'white')
                    .text(this.concepts[6 + i] || `${7 + i}`);
            }
        }
    }

    createFractalSimilarity(numParts) {
        // Create nested similar structures
        const levels = Math.min(3, Math.ceil(Math.log2(numParts)));
        let partIndex = 0;
        
        for (let level = 0; level < levels && partIndex < numParts; level++) {
            const radius = 60 + level * 80;
            const partsAtLevel = Math.min(numParts - partIndex, Math.pow(2, level + 1));
            
            for (let i = 0; i < partsAtLevel && partIndex < numParts; i++) {
                const angle = (i / partsAtLevel) * 2 * Math.PI;
                const x = this.centerX + radius * Math.cos(angle);
                const y = this.centerY + radius * Math.sin(angle);
                
                const nodeRadius = 20 - level * 3;
                const colors = ['#e74c3c', '#3498db', '#2ecc71'];
                
                this.nodesGroup.append('circle')
                    .attr('cx', x)
                    .attr('cy', y)
                    .attr('r', nodeRadius)
                    .attr('fill', colors[level % colors.length])
                    .attr('stroke', d3.color(colors[level % colors.length]).darker())
                    .attr('stroke-width', 2);

                this.labelsGroup.append('text')
                    .attr('x', x)
                    .attr('y', y + 3)
                    .attr('text-anchor', 'middle')
                    .attr('font-size', `${10 - level}px`)
                    .attr('font-weight', 'bold')
                    .attr('fill', 'white')
                    .text(this.concepts[partIndex] || `${partIndex + 1}`);
                
                partIndex++;
            }
        }
    }

    createNestedContainment(numParts) {
        // Create concentric circles with nested containment
        const maxLevels = Math.min(4, Math.ceil(numParts / 2));
        let partIndex = 0;
        
        for (let level = 0; level < maxLevels; level++) {
            const radius = 50 + level * 60;
            const partsAtLevel = Math.ceil((numParts - partIndex) / (maxLevels - level));
            
            // Draw containing circle
            this.nodesGroup.append('circle')
                .attr('cx', this.centerX)
                .attr('cy', this.centerY)
                .attr('r', radius)
                .attr('fill', 'none')
                .attr('stroke', `hsl(${level * 60}, 60%, 50%)`)
                .attr('stroke-width', 3)
                .attr('stroke-dasharray', level === 0 ? 'none' : '5,3');
            
            // Place parts at this level
            const partRadius = radius - 20;
            for (let i = 0; i < Math.min(partsAtLevel, numParts - partIndex); i++) {
                const angle = (i / partsAtLevel) * 2 * Math.PI;
                const x = this.centerX + partRadius * Math.cos(angle);
                const y = this.centerY + partRadius * Math.sin(angle);
                
                this.nodesGroup.append('circle')
                    .attr('cx', x)
                    .attr('cy', y)
                    .attr('r', 12)
                    .attr('fill', `hsl(${level * 60}, 60%, 50%)`)
                    .attr('stroke', `hsl(${level * 60}, 60%, 30%)`)
                    .attr('stroke-width', 2);

                this.labelsGroup.append('text')
                    .attr('x', x)
                    .attr('y', y + 3)
                    .attr('text-anchor', 'middle')
                    .attr('font-size', '8px')
                    .attr('font-weight', 'bold')
                    .attr('fill', 'white')
                    .text(this.concepts[partIndex] || `${partIndex + 1}`);
                
                partIndex++;
                if (partIndex >= numParts) break;
            }
            if (partIndex >= numParts) break;
        }
    }

    updateDescription(type) {
        const descriptionElement = document.getElementById('wholepart-description-text');
        if (descriptionElement && this.philosophicalDescriptions[type]) {
            descriptionElement.textContent = this.philosophicalDescriptions[type].description;
        }
    }

    toggleAnimation() {
        this.isAnimating = !this.isAnimating;
        const btn = document.getElementById('wholepart-animate');
        if (btn) {
            btn.textContent = this.isAnimating ? '⏸️ Pause' : '▶️ Animate';
        }
        
        if (this.isAnimating) {
            this.startAnimation();
        }
    }

    startAnimation() {
        if (!this.isAnimating) return;
        
        // Simple pulsing animation for nodes
        this.nodesGroup.selectAll('circle')
            .transition()
            .duration(1000)
            .attr('r', function() {
                const currentR = d3.select(this).attr('r');
                return currentR * 1.2;
            })
            .transition()
            .duration(1000)
            .attr('r', function() {
                const currentR = d3.select(this).attr('r');
                return currentR / 1.2;
            })
            .on('end', () => {
                if (this.isAnimating) {
                    setTimeout(() => this.startAnimation(), 100);
                }
            });
    }

    resetView() {
        if (this.svg) {
            this.createVisualization(this.currentVisualization);
        }
        this.isAnimating = false;
        const btn = document.getElementById('wholepart-animate');
        if (btn) {
            btn.textContent = '▶️ Animate';
        }
    }

    zoom(factor) {
        if (this.svg) {
            const currentTransform = this.svg.attr('transform') || 'scale(1)';
            const match = currentTransform.match(/scale\(([^)]+)\)/);
            const currentScale = match ? parseFloat(match[1]) : 1;
            const newScale = Math.max(0.2, Math.min(3, currentScale * factor));
            
            this.svg.attr('transform', `scale(${newScale})`);
        }
    }

    refresh() {
        this.extractConceptsFromDocument();
        this.createVisualization(this.currentVisualization);
    }
}

// Global instance
let wholepartVisualization = null;

// Initialize function called by renderer.js
window.initializeWholepartVisualization = function() {
    if (!wholepartVisualization) {
        wholepartVisualization = new WholepartVisualization();
    }
    wholepartVisualization.initialize();
};

// Refresh function for when document content changes
window.refreshWholepartVisualization = function() {
    if (wholepartVisualization) {
        wholepartVisualization.refresh();
    }
};

console.log('[Wholepart] Module loaded');