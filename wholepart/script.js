class D3WholePartsVisualizer {
    constructor() {
        this.width = 800;
        this.height = 600;
        this.centerX = this.width / 2;
        this.centerY = this.height / 2;
        
        this.currentVisualization = 0;
        this.isAnimating = false;
        this.animationTime = 0;
        this.numParts = 5; // Default number of parts
        
        this.setupSVG();
        this.setupEventListeners();
        this.setupPhilosophicalDescriptions();
        this.createVisualization(0);
        this.updatePhilosophicalDescription(0);
    }
    
    setupSVG() {
        this.svg = d3.select('#visualization')
            .append('svg')
            .attr('width', this.width)
            .attr('height', this.height);
        
        // Add definitions for markers and gradients
        const defs = this.svg.append('defs');
        
        // Arrow marker for reset arrows
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
        
        // Create main zoom group that will contain all zoomable elements
        this.zoomGroup = this.svg.append('g').attr('class', 'zoom-group');
        
        // Create main groups for different elements inside zoom group
        this.connectionsGroup = this.zoomGroup.append('g').attr('class', 'connections');
        this.specialPathsGroup = this.zoomGroup.append('g').attr('class', 'special-paths');
        this.nodesGroup = this.zoomGroup.append('g').attr('class', 'nodes');
        this.labelsGroup = this.zoomGroup.append('g').attr('class', 'labels');
        
        // Setup zoom behavior
        this.zoom = d3.zoom()
            .scaleExtent([0.1, 10])  // Allow zoom from 10% to 1000% for fractal exploration
            .on('zoom', (event) => {
                const { transform } = event;
                this.currentZoom = transform;
                this.applyZoom(transform);
                
                // Update fractal view on zoom changes for lazy loading
                if (this.currentVisualization === 7) { // Fractal view
                    this.updateFractalOnZoom();
                } else if (this.currentVisualization === 8) { // Hegelian view
                    this.updateHegelianOnZoom();
                }
            });
        
        // Apply zoom behavior to SVG
        this.svg.call(this.zoom);
        
        // Initialize zoom state
        this.currentZoom = d3.zoomIdentity;
    }
    
    setupEventListeners() {
        d3.select('#visualization-type').on('change', (event) => {
            const newVisualization = parseInt(event.target.value);
            this.transitionTo(newVisualization);
        });
        
        d3.select('#prev-viz').on('click', () => {
            const totalVisualizations = 9;
            let newIndex = this.currentVisualization - 1;
            if (newIndex < 0) newIndex = totalVisualizations - 1;
            d3.select('#visualization-type').property('value', newIndex);
            this.transitionTo(newIndex);
        });
        
        d3.select('#next-viz').on('click', () => {
            const totalVisualizations = 9;
            let newIndex = this.currentVisualization + 1;
            if (newIndex >= totalVisualizations) newIndex = 0;
            d3.select('#visualization-type').property('value', newIndex);
            this.transitionTo(newIndex);
        });
        
        d3.select('#animate').on('click', () => {
            this.isAnimating = !this.isAnimating;
            const button = d3.select('#animate');
            
            if (this.isAnimating) {
                button.text('Stop Animation');
                this.startAnimation();
            } else {
                button.text('Start Animation');
                this.stopAnimation();
            }
        });
        
        d3.select('#reset').on('click', () => {
            this.animationTime = 0;
            this.createVisualization(this.currentVisualization);
        });
        
        d3.select('#parts-slider').on('input', (event) => {
            this.numParts = parseInt(event.target.value);
            d3.select('#parts-count').text(this.numParts);
            this.updatePartsButtons();
            this.createVisualization(this.currentVisualization);
        });
        
        d3.select('#parts-minus').on('click', () => {
            const slider = d3.select('#parts-slider').node();
            const currentValue = parseInt(slider.value);
            const minValue = parseInt(slider.min);
            
            if (currentValue > minValue) {
                const newValue = currentValue - 1;
                slider.value = newValue;
                this.numParts = newValue;
                d3.select('#parts-count').text(this.numParts);
                this.updatePartsButtons();
                this.createVisualization(this.currentVisualization);
            }
        });
        
        d3.select('#parts-plus').on('click', () => {
            const slider = d3.select('#parts-slider').node();
            const currentValue = parseInt(slider.value);
            const maxValue = parseInt(slider.max);
            
            if (currentValue < maxValue) {
                const newValue = currentValue + 1;
                slider.value = newValue;
                this.numParts = newValue;
                d3.select('#parts-count').text(this.numParts);
                this.updatePartsButtons();
                this.createVisualization(this.currentVisualization);
            }
        });
        
        // Animate emergence button
        d3.select('#animate-emergence').on('click', () => {
            if (this.isAnimatingEmergence) {
                this.stopEmergenceAnimation();
            } else {
                this.animateEmergence();
            }
        });
        
        // Initialize button states
        this.updatePartsButtons();
        
        // Zoom control event listeners
        d3.select('#zoom-in').on('click', () => {
            this.svg.transition().duration(300).call(
                this.zoom.scaleBy, 1.5
            );
        });
        
        d3.select('#zoom-out').on('click', () => {
            this.svg.transition().duration(300).call(
                this.zoom.scaleBy, 1 / 1.5
            );
        });
        
        d3.select('#zoom-reset').on('click', () => {
            this.svg.transition().duration(500).call(
                this.zoom.transform,
                d3.zoomIdentity
            );
        });
    }
    
    setupPhilosophicalDescriptions() {
        this.philosophicalDescriptions = {
            0: {
                title: "The Cyclical Unity",
                text: "In this circular arrangement, the whole and its parts exist in eternal dialogue, each flowing into the next in an unbroken cycle. Here we see that true wholeness is not dominance over parts, but participation with them in a greater rhythm. The whole is both the beginning and the destination, suggesting that understanding emerges not from hierarchy but from the continuous circulation of meaning through all elements."
            },
            1: {
                title: "The Radiating Source", 
                text: "From the centered whole, parts extend like rays of light from the sun. This visualization embodies the classical metaphysical principle that multiplicity emerges from unity. Yet the circular connections reveal a deeper truth: that the relationship is reciprocal. The whole gives being to the parts, but the parts give meaning to the whole, creating a dynamic field of mutual dependence where center and periphery co-create each other."
            },
            2: {
                title: "The Encompassing Embrace",
                text: "Here, containment becomes a philosophical statement about the nature of belonging. The whole is not separate from its parts but is the very space within which they can exist and flourish. This suggests that true wholeness is not about control but about providing the conditions for emergence. The parts find their identity not through isolation but through dwelling within something greater than themselves."
            },
            3: {
                title: "The Evolutionary Spiral",
                text: "The spiral reveals time as the medium through which wholeness unfolds. Each part emerges at its proper moment along the path of development, connected to the source yet increasingly individuated. This visualization suggests that wholeness is not a static state but a dynamic process—a becoming rather than a being. The parts are not mere fragments but evolutionary expressions of an unfolding totality."
            },
            4: {
                title: "The Emergent Collective",
                text: "In this configuration, the whole emerges from the very arrangement of its parts. There is no separate 'whole' entity—rather, wholeness is the pattern that arises when parts align in meaningful relationship. This embodies the systems principle that the whole is more than the sum of its parts, existing not as a thing but as a quality of organization that transcends yet includes all elements."
            },
            5: {
                title: "The Progressive Manifestation",
                text: "The linear arrangement with cyclical reset suggests that wholeness unfolds through sequential stages, each building upon the previous while preparing for renewal. This reflects the philosophical insight that development is neither purely linear nor circular, but involves both progression and return. The parts manifest in temporal sequence, yet their meaning depends on their place in the recurring cycle of manifestation."
            },
            6: {
                title: "The Differentiated Unity",
                text: "Here, parts maintain their unique positions along the spiral path while remaining connected to the whole. This visualization captures the profound mystery of unity-in-diversity: how the one can become many while remaining one. Each part occupies its distinct place in the cosmic order, yet all participate in the same underlying spiral of existence. Difference and unity are revealed as complementary rather than contradictory principles."
            },
            7: {
                title: "The Infinite Recursion",
                text: "This fractal structure reveals the deepest secret of whole-part relationships: infinite self-similarity across scales. Every part contains its own whole, which contains its own parts, ad infinitum. This embodies the mystical insight that the macrocosm is reflected in the microcosm—as above, so below. Reality is not composed of fundamental units but of patterns that repeat endlessly, each level containing the complete information of the whole while expressing it at its unique scale of manifestation."
            },
            8: {
                title: "The Hegelian Infinite Regress",
                text: "Here we witness the dialectical movement of Absolute Spirit through its moments of self-determination. Each part, upon closer examination, reveals itself as a whole containing its own internal differentiation. This is Hegel's insight that the Absolute is not a static substance but pure activity—the eternal process of self-mediation. What appears as containment at one level reveals itself as self-development at another. The infinite is not beyond the finite but is the very process by which the finite transcends itself, revealing the whole within every part and every part as a moment of the absolute whole."
            }
        };
    }
    
    updatePhilosophicalDescription(visualizationType) {
        const description = this.philosophicalDescriptions[visualizationType];
        d3.select('#description-title').text(description.title);
        d3.select('#description-text').text(description.text);
    }
    
    updatePartsButtons() {
        const slider = d3.select('#parts-slider').node();
        const currentValue = parseInt(slider.value);
        const minValue = parseInt(slider.min);
        const maxValue = parseInt(slider.max);
        
        // Update minus button
        const minusButton = d3.select('#parts-minus').node();
        minusButton.disabled = currentValue <= minValue;
        
        // Update plus button
        const plusButton = d3.select('#parts-plus').node();
        plusButton.disabled = currentValue >= maxValue;
    }
    
    animateEmergence() {
        // Prevent multiple simultaneous animations
        if (this.isAnimatingEmergence) return;
        
        this.isAnimatingEmergence = true;
        const button = d3.select('#animate-emergence');
        const originalText = button.text();
        
        // Update button state
        button.text('⏸️ Animating...').node().disabled = true;
        
        // Animation parameters
        const startParts = 1;
        const endParts = 10;
        const duration = 8000; // 8 seconds total for more graceful blending
        const stepDuration = duration / (endParts - startParts);
        
        // Set to starting position
        this.numParts = startParts;
        d3.select('#parts-slider').node().value = startParts;
        d3.select('#parts-count').text(startParts);
        this.updatePartsButtons();
        this.createVisualization(this.currentVisualization);
        
        // Animate through each step
        let currentStep = startParts;
        
        const animateStep = () => {
            if (currentStep >= endParts || !this.isAnimatingEmergence) {
                // Animation complete
                this.isAnimatingEmergence = false;
                button.text(originalText).node().disabled = false;
                return;
            }
            
            setTimeout(() => {
                currentStep++;
                this.numParts = currentStep;
                
                // Update all controls
                d3.select('#parts-slider').node().value = currentStep;
                d3.select('#parts-count').text(currentStep);
                this.updatePartsButtons();
                
                // Create new visualization with smooth transition
                this.createVisualization(this.currentVisualization);
                
                // Continue to next step
                animateStep();
            }, stepDuration);
        };
        
        // Start the animation
        animateStep();
    }
    
    stopEmergenceAnimation() {
        this.isAnimatingEmergence = false;
        
        // Reset button state
        const button = d3.select('#animate-emergence');
        button.text('✨ Animate Emergence (1→10)').node().disabled = false;
    }
    
    applyZoom(transform) {
        // Apply transform to the zoom group (positions scale)
        this.zoomGroup.attr('transform', transform);
        
        // Store current zoom state
        this.currentZoom = transform;
        
        // Counter-scale nodes and text to keep them constant size
        const scale = transform.k;
        const inverseScale = 1 / scale;
        
        // Keep node circles at constant size - be more robust with error checking
        this.nodesGroup.selectAll('.node-circle')
            .each(function(d) {
                try {
                    const element = d3.select(this);
                    const baseRadius = d && d.radius ? d.radius : (d && d.isWhole ? 25 : 20);
                    const baseStrokeWidth = d && d.isWhole ? 3 : 2;
                    element.attr('r', baseRadius * inverseScale)
                           .attr('stroke-width', baseStrokeWidth * inverseScale);
                } catch (e) {
                    // Fallback for missing data
                    d3.select(this).attr('r', 15 * inverseScale).attr('stroke-width', 2 * inverseScale);
                }
            });
        
        // Keep text at constant size with fallback
        this.nodesGroup.selectAll('.node-label')
            .each(function(d) {
                try {
                    const fontSize = d && d.radius ? Math.max(8, d.radius * 0.6) : 12;
                    d3.select(this).style('font-size', (fontSize * inverseScale) + 'px');
                } catch (e) {
                    d3.select(this).style('font-size', (12 * inverseScale) + 'px');
                }
            });
        
        // Keep connection stroke widths constant - more robust
        this.connectionsGroup.selectAll('.connection')
            .style('stroke-width', (2 * inverseScale) + 'px');
        
        this.connectionsGroup.selectAll('.connection-circle')
            .style('stroke-width', (2 * inverseScale) + 'px');
        
        this.connectionsGroup.selectAll('.fractal-connection')
            .style('stroke-width', (1 * inverseScale) + 'px');
        
        // Keep special path stroke widths constant with better classification
        this.specialPathsGroup.selectAll('.special-path')
            .each(function() {
                try {
                    const element = d3.select(this);
                    let baseWidth = 2;
                    
                    if (element.classed('whole-container')) baseWidth = 4;
                    else if (element.classed('spiral-connector')) baseWidth = 3;
                    else if (element.classed('reset-arrow')) baseWidth = 3;
                    else if (element.classed('fractal-border')) baseWidth = 1;
                    else if (element.classed('golden-spiral')) baseWidth = 1;
                    else if (element.classed('dialectical-arc')) baseWidth = 2;
                    else if (element.classed('nested-container')) baseWidth = 3;
                    
                    element.style('stroke-width', (baseWidth * inverseScale) + 'px');
                } catch (e) {
                    d3.select(this).style('stroke-width', (2 * inverseScale) + 'px');
                }
            });
        
        // Keep special path text at constant size with better sizing
        this.specialPathsGroup.selectAll('text')
            .each(function() {
                try {
                    const element = d3.select(this);
                    let baseFontSize = 14;
                    
                    if (element.classed('depth-indicator')) baseFontSize = 12;
                    else if (element.classed('zoom-indicator')) baseFontSize = 14;
                    else if (element.classed('instruction')) baseFontSize = 14;
                    else if (element.classed('level-label')) baseFontSize = 14;
                    else if (element.classed('dialectical-moment')) baseFontSize = 12;
                    else baseFontSize = 18; // titles
                    
                    element.style('font-size', (baseFontSize * inverseScale) + 'px');
                } catch (e) {
                    d3.select(this).style('font-size', (14 * inverseScale) + 'px');
                }
            });
    }
    
    startAnimation() {
        const animate = () => {
            if (!this.isAnimating) return;
            
            this.animationTime += 0.02;
            this.updateAnimation();
            requestAnimationFrame(animate);
        };
        animate();
    }
    
    stopAnimation() {
        this.isAnimating = false;
    }
    
    updateAnimation() {
        // Gentle pulsing animation for nodes
        this.nodesGroup.selectAll('.node-circle')
            .attr('r', d => {
                const baseRadius = d.isWhole ? 25 : (d.radius || 20);
                const pulse = Math.sin(this.animationTime * 3 + d.id * 0.5) * 2;
                return baseRadius + pulse;
            });
        
        // Subtle opacity animation for connections
        this.connectionsGroup.selectAll('.connection')
            .style('opacity', () => 0.5 + Math.sin(this.animationTime * 2) * 0.3);
    }
    
    transitionTo(visualizationType) {
        this.currentVisualization = visualizationType;
        this.createVisualization(visualizationType);
        this.updatePhilosophicalDescription(visualizationType);
    }
    
    getVisualizationData(type) {
        const numParts = 5;
        let nodes = [];
        let connections = [];
        let specialPaths = [];
        
        switch (type) {
            case 0: // Circular Ring
                return this.getCircularRingData();
            case 1: // Center-Radial
                return this.getCenterRadialData();
            case 2: // Containment
                return this.getContainmentData();
            case 3: // Spiral from Center
                return this.getSpiralFromCenterData();
            case 4: // Spiral of Parts
                return this.getSpiralOfPartsData();
            case 5: // Dialectical Progression
                return this.getLinearCycleData();
            case 6: // Spiral with Radiating Parts
                return this.getSpiralRadiatingData();
            case 7: // Fractal Self-Similarity
                return this.getFractalData();
            case 8: // Hegelian Nested Containment
                return this.getHegelianContainmentData();
            default:
                return { nodes: [], connections: [], specialPaths: [] };
        }
    }
    
    getCircularRingData() {
        const ringRadius = 200;
        const nodes = [];
        const connections = [];
        
        // Create nodes in circular formation - whole node is part of the circle
        const totalNodes = this.numParts + 1; // 1 whole + numParts parts
        
        // Whole node positioned at top of circle
        const wholeNode = {
            id: 'whole',
            x: this.centerX + Math.cos(-Math.PI / 2) * ringRadius,
            y: this.centerY + Math.sin(-Math.PI / 2) * ringRadius,
            radius: 25,
            label: 'WHOLE',
            isWhole: true
        };
        nodes.push(wholeNode);
        
        // Parts positioned around the circle
        const partNodes = [];
        for (let i = 0; i < this.numParts; i++) {
            const angle = (i + 1) * (2 * Math.PI) / totalNodes - Math.PI / 2;
            const partNode = {
                id: `part-${i}`,
                x: this.centerX + Math.cos(angle) * ringRadius,
                y: this.centerY + Math.sin(angle) * ringRadius,
                radius: 20,
                label: `P${i + 1}`,
                isWhole: false
            };
            nodes.push(partNode);
            partNodes.push(partNode);
        }
        
        // Create sequential arc connections only if there are parts
        if (partNodes.length > 0) {
            connections.push({
                source: wholeNode,
                target: partNodes[0], // whole → P1
                type: 'arc',
                radius: ringRadius
            });
            
            for (let i = 0; i < partNodes.length - 1; i++) {
                connections.push({
                    source: partNodes[i],
                    target: partNodes[i + 1], // P1 → P2, P2 → P3, etc.
                    type: 'arc',
                    radius: ringRadius
                });
            }
            
            // Close the circle: P5 → whole
            connections.push({
                source: partNodes[partNodes.length - 1],
                target: wholeNode,
                type: 'arc',
                radius: ringRadius
            });
        }
        
        return { nodes, connections, specialPaths: [] };
    }
    
    getCenterRadialData() {
        const distance = 180;
        const nodes = [];
        const connections = [];
        
        // Whole at center
        const wholeNode = {
            id: 'whole',
            x: this.centerX,
            y: this.centerY,
            radius: 25,
            label: 'WHOLE',
            isWhole: true
        };
        nodes.push(wholeNode);
        
        // Parts with circular connections
        for (let i = 0; i < this.numParts; i++) {
            const angle = (i * 2 * Math.PI) / this.numParts;
            const partNode = {
                id: `part-${i}`,
                x: this.centerX + Math.cos(angle) * distance,
                y: this.centerY + Math.sin(angle) * distance,
                radius: 20,
                label: `P${i + 1}`,
                isWhole: false
            };
            nodes.push(partNode);
            
            connections.push({
                source: wholeNode,
                target: partNode,
                type: 'circle'
            });
        }
        
        return { nodes, connections, specialPaths: [] };
    }
    
    getContainmentData() {
        const nodes = [];
        const specialPaths = [];
        
        // Calculate dynamic container radius based on number of parts
        // Base size for 1 part, expanding to accommodate more parts comfortably
        const baseRadius = 80;  // Minimum size for 1 part
        const growthFactor = 15; // How much to grow per additional part
        const spacingBuffer = 40; // Extra space beyond parts for containment feel
        
        // Calculate optimal radius: grows with parts but ensures comfortable spacing
        const partCircleRadius = Math.max(60, (this.numParts * 12) + 30); // Radius where parts are placed
        const wholeRadius = Math.max(baseRadius, partCircleRadius + spacingBuffer + (this.numParts * growthFactor * 0.5));
        
        // Add container circle as special path
        specialPaths.push({
            type: 'container',
            x: this.centerX,
            y: this.centerY,
            radius: wholeRadius,
            label: 'WHOLE'
        });
        
        // Parts inside, positioned in optimal formation
        for (let i = 0; i < this.numParts; i++) {
            const angle = (i * 2 * Math.PI) / this.numParts;
            
            // For single part, place at center; otherwise arrange in circle
            let partX, partY;
            if (this.numParts === 1) {
                partX = this.centerX;
                partY = this.centerY;
            } else {
                partX = this.centerX + Math.cos(angle) * partCircleRadius;
                partY = this.centerY + Math.sin(angle) * partCircleRadius;
            }
            
            // Part size adapts slightly to container size
            const partRadius = Math.max(12, Math.min(20, wholeRadius * 0.08));
            
            nodes.push({
                id: `part-${i}`,
                x: partX,
                y: partY,
                radius: partRadius,
                label: `P${i + 1}`,
                isWhole: false
            });
        }
        
        return { nodes, connections: [], specialPaths };
    }
    
    getSpiralFromCenterData() {
        const baseRadius = 200;
        const nodes = [];
        const connections = [];
        const specialPaths = [];
        
        // Whole at center
        const wholeNode = {
            id: 'whole',
            x: this.centerX,
            y: this.centerY,
            radius: 20,
            label: 'WHOLE',
            isWhole: true
        };
        nodes.push(wholeNode);
        
        // Calculate spiral that expands with more parts
        const spiralTurns = Math.max(2.5, 2.5 + (this.numParts * 0.4)); // More turns for more parts
        const maxRadius = baseRadius + (this.numParts * 12); // Bigger spiral for more parts
        const totalAngle = spiralTurns * 2 * Math.PI;
        
        // Generate spiral path - ensure it always ends exactly at totalAngle
        const spiralPoints = [];
        const stepSize = 0.1;
        for (let t = 0; t <= totalAngle; t += stepSize) {
            const r = (t / totalAngle) * maxRadius;
            spiralPoints.push([
                this.centerX + r * Math.cos(t),
                this.centerY + r * Math.sin(t)
            ]);
        }
        
        // FORCE the spiral to end exactly at totalAngle
        const finalT = totalAngle;
        const finalR = maxRadius;
        spiralPoints.push([
            this.centerX + finalR * Math.cos(finalT),
            this.centerY + finalR * Math.sin(finalT)
        ]);
        
        specialPaths.push({
            type: 'spiral',
            points: spiralPoints
        });
        
        // Position parts along the spiral using simple, working calculation
        const partNodes = [];
        for (let i = 0; i < this.numParts; i++) {
            // SIMPLE approach: divide spiral into equal segments for parts
            // Start from a small offset to avoid overlapping with whole at center
            const startAngle = totalAngle * 0.15; // Start 15% along spiral
            const endAngle = totalAngle; // End at spiral end
            const angleRange = endAngle - startAngle;
            
            const t = startAngle + (i / Math.max(1, this.numParts - 1)) * angleRange;
            const r = (t / totalAngle) * maxRadius;
            
            const partNode = {
                id: `part-${i}`,
                x: this.centerX + r * Math.cos(t),
                y: this.centerY + r * Math.sin(t),
                radius: 20,
                label: `P${i + 1}`,
                isWhole: false
            };
            nodes.push(partNode);
            partNodes.push(partNode);
            
            // Connect whole to each part
            connections.push({
                source: wholeNode,
                target: partNode,
                type: 'line'
            });
        }
        
        return { nodes, connections, specialPaths };
    }
    
    getSpiralOfPartsData() {
        const maxRadius = 200;
        const nodes = [];
        const connections = [];
        const specialPaths = [];
        
        // Generate spiral path for visualization
        const spiralTurns = 4; // 4 full turns
        const totalAngle = spiralTurns * 2 * Math.PI;
        const spiralPoints = [];
        
        for (let t = 0; t <= totalAngle; t += 0.1) {
            const r = (t / totalAngle) * maxRadius;
            spiralPoints.push([
                this.centerX + r * Math.cos(t),
                this.centerY + r * Math.sin(t)
            ]);
        }
        
        specialPaths.push({
            type: 'spiral',
            points: spiralPoints
        });
        
        // Parts positioned exactly on the spiral path
        const partNodes = [];
        for (let i = 0; i < this.numParts; i++) {
            // Distribute parts evenly along the spiral, with last one always at the end
            const progress = this.numParts === 1 ? 1.0 : (i / (this.numParts - 1));
            const t = progress * totalAngle;
            const r = (t / totalAngle) * maxRadius;
            
            const partNode = {
                id: `part-${i}`,
                x: this.centerX + r * Math.cos(t),
                y: this.centerY + r * Math.sin(t),
                radius: 20,
                label: `P${i + 1}`,
                isWhole: i === 0 // First part acts as whole
            };
            nodes.push(partNode);
            partNodes.push(partNode);
            
            // Radiating line from center
            connections.push({
                source: { x: this.centerX, y: this.centerY },
                target: partNode,
                type: 'line'
            });
        }
        
        // Add spiral connections between consecutive parts
        for (let i = 0; i < partNodes.length - 1; i++) {
            connections.push({
                source: partNodes[i],
                target: partNodes[i + 1],
                type: 'arc'
            });
        }
        
        return { nodes, connections, specialPaths };
    }
    
    getLinearCycleData() {
        const spacing = 100;
        const startX = 120;
        const baseY = this.centerY + 100;
        const ascendHeight = 40; // How much each part rises
        
        const nodes = [];
        const connections = [];
        const specialPaths = [];
        
        // Add "WHOLE" node at the peak (synthesis point)
        const wholeNode = {
            id: 'whole',
            x: this.centerX,
            y: baseY - (this.numParts * ascendHeight) - 50,
            radius: 25,
            label: 'WHOLE',
            isWhole: true
        };
        nodes.push(wholeNode);
        
        // Create ascending parts
        for (let i = 0; i < this.numParts; i++) {
            const x = startX + (i * spacing);
            const y = baseY - (i * ascendHeight); // Each part rises higher
            
            nodes.push({
                id: `part-${i}`,
                x: x,
                y: y,
                radius: 20,
                label: `P${i + 1}`,
                isWhole: false
            });
            
            // Connection to next part (ascending line)
            if (i < this.numParts - 1) {
                connections.push({
                    source: { x: x, y: y },
                    target: { x: x + spacing, y: y - ascendHeight },
                    type: 'line'
                });
            }
        }
        
        // Get last part position
        const lastPartX = startX + ((this.numParts - 1) * spacing);
        const lastPartY = baseY - ((this.numParts - 1) * ascendHeight);
        const firstPartX = startX;
        const firstPartY = baseY;
        
        // Create dialectical loop back path (curved arc from last to first through whole)
        const controlX1 = lastPartX + 80;
        const controlY1 = lastPartY - 100;
        const controlX2 = firstPartX - 80;
        const controlY2 = firstPartY - 100;
        
        // Path from last part to whole (thesis to synthesis)
        connections.push({
            source: { x: lastPartX, y: lastPartY },
            target: wholeNode,
            type: 'curve',
            controlPoints: [
                { x: controlX1, y: controlY1 }
            ]
        });
        
        // Path from whole back to first part (synthesis returning to new beginning)
        connections.push({
            source: wholeNode,
            target: { x: firstPartX, y: firstPartY },
            type: 'curve',
            controlPoints: [
                { x: controlX2, y: controlY2 }
            ]
        });
        
        // Add dialectical arc visual
        specialPaths.push({
            type: 'dialectical-arc',
            x1: lastPartX,
            y1: lastPartY,
            x2: firstPartX,
            y2: firstPartY,
            cx1: controlX1,
            cy1: controlY1,
            cx2: controlX2,
            cy2: controlY2,
            wholeX: wholeNode.x,
            wholeY: wholeNode.y
        });
        
        // Add title
        specialPaths.push({
            type: 'title',
            text: 'DIALECTICAL PROGRESSION',
            x: this.centerX,
            y: 50
        });
        
        return { nodes, connections, specialPaths };
    }
    
    getSpiralRadiatingData() {
        const baseRadius = 150;
        const nodes = [];
        const connections = [];
        const specialPaths = [];
        
        // Whole at center
        const wholeNode = {
            id: 'whole',
            x: this.centerX,
            y: this.centerY,
            radius: 20,
            label: 'WHOLE',
            isWhole: true
        };
        nodes.push(wholeNode);
        
        // Dynamic spiral parameters: spiral extends to accommodate parts
        const spiralTurns = Math.max(2, Math.min(5, 2 + (this.numParts * 0.3))); // 2 to 5 turns
        const maxRadius = Math.max(baseRadius, baseRadius + (this.numParts * 6)); // Grow radius with parts
        const totalAngle = spiralTurns * 2 * Math.PI;
        
        // Generate expanding spiral path
        const spiralPoints = [];
        const pointCount = Math.max(50, this.numParts * 10); // More points for longer spirals
        
        for (let i = 0; i <= pointCount; i++) {
            const t = (i / pointCount) * totalAngle;
            const r = (t / totalAngle) * maxRadius;
            spiralPoints.push([
                this.centerX + r * Math.cos(t),
                this.centerY + r * Math.sin(t)
            ]);
        }
        
        // FORCE the spiral to end exactly at totalAngle (same as viz 4)
        const finalT = totalAngle;
        const finalR = maxRadius;
        spiralPoints.push([
            this.centerX + finalR * Math.cos(finalT),
            this.centerY + finalR * Math.sin(finalT)
        ]);
        
        // Add main spiral path as smooth curve (like viz 4)
        const spiralPath = d3.line()
            .x(d => d[0])
            .y(d => d[1])
            .curve(d3.curveBasis); // Use smooth curve
            
        specialPaths.push({
            type: 'spiral-smooth',
            pathData: spiralPath(spiralPoints)
        });
        
        // Parts positioned exactly ON the expanding spiral path
        const totalSpiralPoints = spiralPoints.length;
        const startIndex = Math.floor(totalSpiralPoints * 0.05); // Skip first 5% to avoid center
        const endIndex = totalSpiralPoints - 1;
        const usablePoints = endIndex - startIndex;
        
        const partNodes = [];
        for (let i = 0; i < this.numParts; i++) {
            // Position parts at FIXED intervals along spiral (additive approach)
            // Each part is positioned at a fixed fraction of spiral length
            const maxPossibleParts = 12; // Based on slider max
            const spiralProgress = (i + 1) / (maxPossibleParts + 1); // Fixed position regardless of numParts
            const pointIndex = startIndex + Math.floor(spiralProgress * usablePoints);
            const spiralPoint = spiralPoints[Math.min(pointIndex, endIndex)];
            
            const partNode = {
                id: `part-${i}`,
                x: spiralPoint[0], // Use exact spiral point coordinates
                y: spiralPoint[1], // Use exact spiral point coordinates
                radius: 18,
                label: `P${i + 1}`,
                isWhole: false
            };
            nodes.push(partNode);
            partNodes.push(partNode);
        }
        
        // Connect whole to first part, then arcs between parts along spiral
        if (partNodes.length > 0) {
            connections.push({
                source: wholeNode,
                target: partNodes[0],
                type: 'line'
            });
            
            // Arc connections between consecutive parts along spiral
            for (let i = 0; i < partNodes.length - 1; i++) {
                connections.push({
                    source: partNodes[i],
                    target: partNodes[i + 1],
                    type: 'arc'
                });
            }
        }
        
        // Add title with dynamic info
        specialPaths.push({
            type: 'title',
            text: `RADIATING SPIRAL (${spiralTurns.toFixed(1)} turns)`,
            x: this.centerX,
            y: 50
        });
        
        return { nodes, connections, specialPaths };
    }
    
    getFractalData() {
        const nodes = [];
        const connections = [];
        const specialPaths = [];
        
        // Performance optimizations
        const baseRadius = 150;
        const scaleFactor = 0.4;
        const currentZoomLevel = this.currentZoom ? this.currentZoom.k : 1;
        
        // Lazy loading: only render layers visible at current zoom
        const maxVisibleDepth = Math.min(4, Math.max(0, Math.floor(Math.log2(currentZoomLevel)) + 2));
        
        // Magnification thresholds for whole/part transformation
        const wholeTransformThreshold = 2.0; // Zoom level where parts become wholes
        const detailVisibilityThreshold = 1.5; // Zoom level where sub-structures appear
        
        // Function to generate fractal structure with lazy loading
        const generateFractalLevel = (centerX, centerY, radius, depth, parentId = null, parentIsWhole = false) => {
            if (depth > maxVisibleDepth) return;
            
            // Calculate if this element should be visible at current zoom
            const elementScale = Math.pow(scaleFactor, depth);
            const effectiveRadius = radius * elementScale;
            const isVisible = effectiveRadius * currentZoomLevel > 3; // Minimum visible size
            
            if (!isVisible && depth > 1) return; // Skip tiny invisible elements
            
            const wholeId = `whole-${depth}-${Math.round(centerX)}-${Math.round(centerY)}`;
            
            // Determine if this should be a whole or part based on zoom and context
            const shouldBeWhole = depth === 0 || (currentZoomLevel >= wholeTransformThreshold && parentIsWhole);
            
            // Create center node
            const centerNode = {
                id: wholeId,
                x: centerX,
                y: centerY,
                radius: Math.max(8, 25 - depth * 3),
                label: shouldBeWhole ? (depth === 0 ? 'WHOLE' : `W${depth}`) : `C${depth}`,
                isWhole: shouldBeWhole,
                fractalDepth: depth,
                opacity: Math.max(0.2, 1 - depth * 0.15),
                zoomLevel: currentZoomLevel
            };
            nodes.push(centerNode);
            
            // Connect to parent if exists
            if (parentId) {
                connections.push({
                    source: { id: parentId },
                    target: centerNode,
                    type: 'fractal-line',
                    opacity: Math.max(0.1, 0.8 - depth * 0.1)
                });
            }
            
            // Only create parts if we're zoomed in enough or at shallow depth
            const shouldShowParts = depth === 0 || currentZoomLevel >= detailVisibilityThreshold || depth <= 1;
            
            if (shouldShowParts) {
                const numParts = Math.max(1, Math.min(this.numParts, this.numParts - Math.floor(depth / 2)));
                const partRadius = radius * 0.55;
                
                for (let i = 0; i < numParts; i++) {
                    const angle = (2 * Math.PI / numParts) * i + (depth * 0.3); // Slight rotation per level
                    const partX = centerX + Math.cos(angle) * partRadius;
                    const partY = centerY + Math.sin(angle) * partRadius;
                    const partId = `part-${depth}-${i}-${Math.round(centerX)}-${Math.round(centerY)}`;
                    
                    // Parts become wholes when zoomed in sufficiently
                    const partShouldBeWhole = currentZoomLevel >= wholeTransformThreshold && depth < 2;
                    
                    const partNode = {
                        id: partId,
                        x: partX,
                        y: partY,
                        radius: Math.max(6, 18 - depth * 2),
                        label: partShouldBeWhole ? `W${depth + 1}` : `P${i + 1}`,
                        isWhole: partShouldBeWhole,
                        fractalDepth: depth,
                        opacity: Math.max(0.2, 0.9 - depth * 0.15),
                        zoomLevel: currentZoomLevel
                    };
                    nodes.push(partNode);
                    
                    // Connect part to center
                    connections.push({
                        source: centerNode,
                        target: partNode,
                        type: 'fractal-line',
                        opacity: Math.max(0.15, 0.7 - depth * 0.1)
                    });
                    
                    // Add fractal border hint when zoomed enough
                    if (currentZoomLevel >= detailVisibilityThreshold && depth < maxVisibleDepth) {
                        specialPaths.push({
                            type: 'fractal-border',
                            x: partX,
                            y: partY,
                            radius: partRadius * scaleFactor,
                            depth: depth,
                            opacity: Math.max(0.05, 0.3 - depth * 0.08)
                        });
                    }
                    
                    // Recursively create sub-fractals (lazy loaded)
                    if (depth < maxVisibleDepth && currentZoomLevel >= detailVisibilityThreshold) {
                        const subRadius = partRadius * scaleFactor;
                        generateFractalLevel(partX, partY, subRadius, depth + 1, partId, partShouldBeWhole);
                    }
                }
            }
            
            // Add golden ratio spiral only at visible scales
            if (depth <= 1 && currentZoomLevel >= 0.8) {
                const spiralPoints = [];
                const goldenAngle = Math.PI * (3 - Math.sqrt(5));
                const pointCount = Math.min(50, Math.max(20, Math.floor(30 * currentZoomLevel)));
                
                for (let i = 0; i < pointCount; i++) {
                    const t = i * 0.15;
                    const r = (t * radius * 0.08) / (1 + depth * 0.5);
                    const angle = i * goldenAngle;
                    spiralPoints.push([
                        centerX + r * Math.cos(angle),
                        centerY + r * Math.sin(angle)
                    ]);
                }
                
                if (spiralPoints.length > 5) {
                    specialPaths.push({
                        type: 'golden-spiral',
                        points: spiralPoints,
                        depth: depth,
                        opacity: Math.max(0.08, 0.25 - depth * 0.08)
                    });
                }
            }
        };
        
        // Generate main fractal structure with lazy loading
        generateFractalLevel(this.centerX, this.centerY, baseRadius, 0);
        
        // Add dynamic depth indicators based on visible depth
        for (let depth = 0; depth <= maxVisibleDepth; depth++) {
            specialPaths.push({
                type: 'depth-indicator',
                text: `Depth ${depth}${depth === maxVisibleDepth ? ' (visible)' : ''}`,
                x: 50,
                y: 100 + depth * 25,
                depth: depth,
                opacity: Math.max(0.3, 0.8 - depth * 0.15)
            });
        }
        
        // Add zoom level indicator
        specialPaths.push({
            type: 'zoom-indicator',
            text: `Zoom: ${currentZoomLevel.toFixed(1)}x`,
            x: 50,
            y: 70,
            opacity: 0.7
        });
        
        // Add title
        specialPaths.push({
            type: 'title',
            text: 'FRACTAL SELF-SIMILARITY',
            x: this.centerX,
            y: 50
        });
        
        // Dynamic instruction based on zoom state
        const instruction = currentZoomLevel < wholeTransformThreshold 
            ? 'Zoom in to see parts become wholes'
            : 'Zoom deeper to explore infinite recursion';
            
        specialPaths.push({
            type: 'instruction',
            text: instruction,
            x: this.centerX,
            y: this.height - 30
        });
        
        return { nodes, connections, specialPaths };
    }
    
    getHegelianContainmentData() {
        const nodes = [];
        const connections = [];
        const specialPaths = [];
        
        // Base parameters for nested containment
        const maxDepth = 3;
        const baseRadius = 180;
        const scaleFactor = 0.6; // How much smaller each nested level becomes
        const currentZoomLevel = this.currentZoom ? this.currentZoom.k : 1;
        
        // Zoom-based visibility thresholds
        const detailThreshold = 1.5;
        const maxVisibleDepth = Math.min(maxDepth, Math.max(1, Math.floor(Math.log2(currentZoomLevel)) + 2));
        
        // Generate nested containment structure
        const generateContainmentLevel = (centerX, centerY, radius, depth, parentLabel = '') => {
            if (depth > maxVisibleDepth) return;
            
            const levelOpacity = Math.max(0.15, 1 - depth * 0.25);
            const containerLabel = depth === 0 ? 'ABSOLUTE' : `${parentLabel}W${depth}`;
            
            // Create container boundary
            specialPaths.push({
                type: 'nested-container',
                x: centerX,
                y: centerY,
                radius: radius,
                depth: depth,
                label: containerLabel,
                opacity: levelOpacity,
                id: `container-${depth}-${Math.round(centerX)}-${Math.round(centerY)}`
            });
            
            // Determine number of parts at this level
            const numPartsAtLevel = Math.max(1, this.numParts - Math.floor(depth / 2));
            
            // Create parts within this container
            for (let i = 0; i < numPartsAtLevel; i++) {
                const angle = (i * 2 * Math.PI) / numPartsAtLevel;
                const partCircleRadius = radius * 0.65; // Parts circle within container
                
                let partX, partY;
                if (numPartsAtLevel === 1) {
                    // Single part at center
                    partX = centerX;
                    partY = centerY;
                } else {
                    // Multiple parts in circle
                    partX = centerX + Math.cos(angle) * partCircleRadius;
                    partY = centerY + Math.sin(angle) * partCircleRadius;
                }
                
                const partRadius = Math.max(8, 20 - depth * 3);
                const partId = `part-${depth}-${i}-${Math.round(centerX)}-${Math.round(centerY)}`;
                const partLabel = depth === 0 ? `P${i + 1}` : `${parentLabel}P${i + 1}`;
                
                // Each part is potentially a whole for the next level
                const isWhole = currentZoomLevel >= detailThreshold || depth === 0;
                
                nodes.push({
                    id: partId,
                    x: partX,
                    y: partY,
                    radius: partRadius,
                    label: isWhole && depth < maxVisibleDepth - 1 ? `${partLabel}/W` : partLabel,
                    isWhole: isWhole && depth < maxVisibleDepth - 1,
                    fractalDepth: depth,
                    opacity: levelOpacity
                });
                
                // Create nested containment within this part (if it's acting as a whole)
                if (depth < maxVisibleDepth && currentZoomLevel >= detailThreshold) {
                    const nestedRadius = radius * scaleFactor * 0.7;
                    if (nestedRadius > 20) { // Only create if large enough to be meaningful
                        generateContainmentLevel(partX, partY, nestedRadius, depth + 1, `${partLabel}.`);
                    }
                }
            }
            
            // Add level indicator
            if (depth <= 2) {
                specialPaths.push({
                    type: 'level-label',
                    text: depth === 0 ? 'Absolute Spirit' : `Level ${depth} Mediation`,
                    x: centerX,
                    y: centerY - radius - 25,
                    depth: depth,
                    opacity: levelOpacity * 0.8
                });
            }
        };
        
        // Generate the main nested structure
        generateContainmentLevel(this.centerX, this.centerY, baseRadius, 0);
        
        // Add Hegelian progression indicators
        for (let depth = 0; depth <= maxVisibleDepth; depth++) {
            specialPaths.push({
                type: 'dialectical-moment',
                text: this.getHegelianMoment(depth),
                x: 50,
                y: 100 + depth * 30,
                depth: depth,
                opacity: Math.max(0.4, 1 - depth * 0.2)
            });
        }
        
        // Add zoom instruction for revelation
        specialPaths.push({
            type: 'instruction',
            text: currentZoomLevel < detailThreshold ? 'Zoom to reveal the infinite within' : 'Each part contains the whole within itself',
            x: this.centerX,
            y: this.height - 30
        });
        
        // Add title
        specialPaths.push({
            type: 'title',
            text: 'HEGELIAN INFINITE REGRESS',
            x: this.centerX,
            y: 50
        });
        
        return { nodes, connections, specialPaths };
    }
    
    getHegelianMoment(depth) {
        const moments = [
            'Being-in-itself',
            'Being-for-other', 
            'Being-for-itself',
            'Absolute Knowing'
        ];
        return moments[Math.min(depth, moments.length - 1)];
    }
    
    createVisualization(type) {
        const data = this.getVisualizationData(type);
        
        // Store current zoom state before re-rendering
        const savedZoom = this.currentZoom;
        
        // Store nodes for lookup
        this.currentNodes = data.nodes;
        
        this.renderSpecialPaths(data.specialPaths);
        this.renderConnections(data.connections);
        this.renderNodes(data.nodes);
        
        // Restore zoom state after a brief delay to allow rendering
        if (savedZoom) {
            setTimeout(() => {
                this.applyZoom(savedZoom);
            }, 100);
        }
    }
    
    getNodeById(id) {
        return this.currentNodes?.find(node => node.id === id);
    }
    
    updateFractalOnZoom() {
        // Debounced update to prevent excessive re-rendering during zoom
        if (this.fractalUpdateTimeout) {
            clearTimeout(this.fractalUpdateTimeout);
        }
        
        this.fractalUpdateTimeout = setTimeout(() => {
            // Only re-render if zoom level has changed significantly
            const currentZoom = this.currentZoom ? this.currentZoom.k : 1;
            const lastZoom = this.lastFractalZoom || 1;
            const zoomChangeThreshold = 0.3; // Minimum zoom change to trigger update
            
            if (Math.abs(currentZoom - lastZoom) > zoomChangeThreshold) {
                this.lastFractalZoom = currentZoom;
                
                // Re-generate fractal data with new zoom-based visibility
                const data = this.getFractalData();
                
                // Update only the elements that need to change
                this.renderSpecialPaths(data.specialPaths);
                this.renderConnections(data.connections);
                this.renderNodes(data.nodes);
                
                // Re-apply zoom to maintain view
                this.applyZoom(this.currentZoom);
            }
        }, 150); // Debounce delay
    }
    
    updateHegelianOnZoom() {
        // Similar to fractal update but for Hegelian nested containment
        if (this.hegelianUpdateTimeout) {
            clearTimeout(this.hegelianUpdateTimeout);
        }
        
        this.hegelianUpdateTimeout = setTimeout(() => {
            const currentZoom = this.currentZoom ? this.currentZoom.k : 1;
            const lastZoom = this.lastHegelianZoom || 1;
            const zoomChangeThreshold = 0.4; // Threshold for Hegelian revelation
            
            if (Math.abs(currentZoom - lastZoom) > zoomChangeThreshold) {
                this.lastHegelianZoom = currentZoom;
                
                // Re-generate Hegelian data with new zoom-based revelation
                const data = this.getHegelianContainmentData();
                
                // Update elements with smooth transitions
                this.renderSpecialPaths(data.specialPaths);
                this.renderConnections(data.connections);
                this.renderNodes(data.nodes);
                
                // Re-apply zoom to maintain view
                this.applyZoom(this.currentZoom);
            }
        }, 200); // Slightly longer debounce for contemplative revelation
    }
    
    renderSpecialPaths(specialPaths) {
        // Create stable unique keys for special paths
        const pathData = specialPaths.map((d, i) => {
            let uniqueKey;
            if (d.id) {
                uniqueKey = d.id;
            } else if (d.type === 'spiral' && d.points) {
                // For spirals, ALWAYS force recreation with timestamp  
                const pointCount = d.points.length;
                const lastPoint = d.points[d.points.length - 1];
                const timestamp = Date.now();
                uniqueKey = `spiral-${pointCount}-${lastPoint[0].toFixed(0)}-${lastPoint[1].toFixed(0)}-${timestamp}`;
            } else if (d.type === 'spiral-smooth') {
                // For smooth spirals, also force recreation
                const timestamp = Date.now();
                uniqueKey = `spiral-smooth-${timestamp}`;
            } else {
                uniqueKey = `path-${i}-${d.type}-${d.x || 0}-${d.y || 0}`;
            }
            
            return {
                ...d,
                id: uniqueKey
            };
        });
        
        // Use enter/update/exit pattern for smooth transitions
        const pathGroups = this.specialPathsGroup.selectAll('.special-path-group')
            .data(pathData, d => d.id);
        
        // EXIT: Remove old paths
        pathGroups.exit()
            .transition()
            .duration(300)
            .style('opacity', 0)
            .remove();
        
        // UPDATE: Update existing paths (but NOT spirals - they get recreated)
        const pathUpdate = pathGroups.filter(d => d.type !== 'spiral' && d.type !== 'spiral-smooth')
            .transition()
            .duration(700);
        
        // Update container circles smoothly (non-spirals only)
        pathUpdate.select('.whole-container')
            .attr('r', d => d.radius);
        
        // FORCE spirals to be completely recreated by removing them immediately
        pathGroups.filter(d => d.type === 'spiral' || d.type === 'spiral-smooth')
            .remove();
        
        // Update spiral connector paths smoothly
        pathUpdate.select('.spiral-connector')
            .attr('d', d => {
                const line = d3.line().curve(d3.curveCardinal);
                return line(d.points);
            });
        
        // ENTER: Add new paths
        const pathsEnter = pathGroups.enter()
            .append('g')
            .attr('class', 'special-path-group');
        
        // Container circles
        pathsEnter.filter(d => d.type === 'container')
            .append('circle')
            .attr('class', 'special-path whole-container')
            .attr('cx', d => d.x)
            .attr('cy', d => d.y)
            .attr('r', 0)
            .transition()
            .duration(800)
            .attr('r', d => d.radius);
        
        // Container labels
        pathsEnter.filter(d => d.type === 'container')
            .append('text')
            .attr('class', 'special-path')
            .attr('x', d => d.x)
            .attr('y', d => d.y - d.radius - 20)
            .attr('text-anchor', 'middle')
            .style('fill', '#ff6b6b')
            .style('font-size', '18px')
            .style('font-weight', 'bold')
            .style('opacity', 0)
            .text(d => d.label)
            .transition()
            .duration(800)
            .style('opacity', 1);
        
        // Spiral paths
        pathsEnter.filter(d => d.type === 'spiral')
            .append('path')
            .attr('class', 'special-path spiral-path')
            .attr('d', d => {
                const line = d3.line();
                return line(d.points);
            })
            .style('stroke-dasharray', function() {
                return this.getTotalLength() + ' ' + this.getTotalLength();
            })
            .style('stroke-dashoffset', function() {
                return this.getTotalLength();
            })
            .transition()
            .duration(1500)
            .style('stroke-dashoffset', 0);
        
        // Smooth spiral paths (using pre-generated path data)
        pathsEnter.filter(d => d.type === 'spiral-smooth')
            .append('path')
            .attr('class', 'special-path spiral-path')
            .attr('d', d => d.pathData)
            .style('stroke-dasharray', function() {
                return this.getTotalLength() + ' ' + this.getTotalLength();
            })
            .style('stroke-dashoffset', function() {
                return this.getTotalLength();
            })
            .transition()
            .duration(1500)
            .style('stroke-dashoffset', 0);
        
        // Spiral connectors
        pathsEnter.filter(d => d.type === 'spiral-connector')
            .append('path')
            .attr('class', 'special-path spiral-connector')
            .attr('d', d => {
                const line = d3.line().curve(d3.curveCardinal);
                return line(d.points);
            })
            .style('stroke-dasharray', function() {
                return this.getTotalLength() + ' ' + this.getTotalLength();
            })
            .style('stroke-dashoffset', function() {
                return this.getTotalLength();
            })
            .transition()
            .duration(1200)
            .style('stroke-dashoffset', 0);
        
        // Dialectical arc (loop back showing synthesis)
        pathsEnter.filter(d => d.type === 'dialectical-arc')
            .append('path')
            .attr('class', 'special-path dialectical-arc')
            .attr('d', d => {
                // Create a smooth curve through the whole back to the beginning
                return `M ${d.x1} ${d.y1} 
                        Q ${d.cx1} ${d.cy1}, ${d.wholeX} ${d.wholeY}
                        Q ${d.cx2} ${d.cy2}, ${d.x2} ${d.y2}`;
            })
            .style('fill', 'none')
            .style('stroke', '#ff6b6b')
            .style('stroke-width', 2)
            .style('stroke-dasharray', '5,5')
            .style('opacity', 0.6)
            .style('stroke-dasharray', function() {
                return this.getTotalLength() + ' ' + this.getTotalLength();
            })
            .style('stroke-dashoffset', function() {
                return this.getTotalLength();
            })
            .transition()
            .duration(1500)
            .style('stroke-dashoffset', 0);
        
        // Reset arrows
        pathsEnter.filter(d => d.type === 'reset-arrow')
            .append('path')
            .attr('class', 'special-path reset-arrow')
            .attr('d', d => {
                const controlX1 = d.x1 + 50;
                const controlY1 = d.y1 - 30;
                const controlX2 = d.x2 - 50;
                const controlY2 = d.y2 - 30;
                return `M${d.x1},${d.y1} C${controlX1},${controlY1} ${controlX2},${controlY2} ${d.x2},${d.y2}`;
            })
            .style('opacity', 0)
            .transition()
            .duration(800)
            .style('opacity', 1);
        
        // Fractal borders
        pathsEnter.filter(d => d.type === 'fractal-border')
            .append('circle')
            .attr('class', 'special-path fractal-border')
            .attr('cx', d => d.x)
            .attr('cy', d => d.y)
            .attr('r', d => d.radius)
            .style('fill', 'none')
            .style('stroke', '#4ecdc4')
            .style('stroke-width', 1)
            .style('stroke-dasharray', '2,2')
            .style('opacity', d => d.opacity)
            .transition()
            .duration(1000)
            .delay((d, i) => i * 50);
        
        // Golden spirals
        pathsEnter.filter(d => d.type === 'golden-spiral')
            .append('path')
            .attr('class', 'special-path golden-spiral')
            .attr('d', d => {
                const line = d3.line().curve(d3.curveCardinal);
                return line(d.points);
            })
            .style('fill', 'none')
            .style('stroke', '#ff6b6b')
            .style('stroke-width', 1)
            .style('opacity', d => d.opacity)
            .style('stroke-dasharray', function() {
                return this.getTotalLength() + ' ' + this.getTotalLength();
            })
            .style('stroke-dashoffset', function() {
                return this.getTotalLength();
            })
            .transition()
            .duration(2000)
            .delay(d => d.depth * 300)
            .style('stroke-dashoffset', 0);
        
        // Depth indicators
        pathsEnter.filter(d => d.type === 'depth-indicator')
            .append('text')
            .attr('class', 'special-path depth-indicator')
            .attr('x', d => d.x)
            .attr('y', d => d.y)
            .style('fill', '#4ecdc4')
            .style('font-size', '12px')
            .style('font-weight', 'bold')
            .style('opacity', d => d.opacity)
            .text(d => d.text)
            .transition()
            .duration(800)
            .delay(d => d.depth * 200);
        
        // Zoom indicator
        pathsEnter.filter(d => d.type === 'zoom-indicator')
            .append('text')
            .attr('class', 'special-path zoom-indicator')
            .attr('x', d => d.x)
            .attr('y', d => d.y)
            .style('fill', '#ff6b6b')
            .style('font-size', '14px')
            .style('font-weight', 'bold')
            .style('opacity', d => d.opacity)
            .text(d => d.text);
        
        // Nested containers (Hegelian visualization)
        pathsEnter.filter(d => d.type === 'nested-container')
            .append('circle')
            .attr('class', 'special-path nested-container')
            .attr('cx', d => d.x)
            .attr('cy', d => d.y)
            .attr('r', 0)
            .style('fill', 'none')
            .style('stroke', d => d.depth === 0 ? '#ff6b6b' : '#4ecdc4')
            .style('stroke-width', d => Math.max(1, 4 - d.depth))
            .style('stroke-dasharray', d => d.depth === 0 ? 'none' : `${3 + d.depth},${2 + d.depth}`)
            .style('opacity', d => d.opacity)
            .transition()
            .duration(800)
            .delay(d => d.depth * 200)
            .attr('r', d => d.radius);
        
        // Level labels (Hegelian moments)
        pathsEnter.filter(d => d.type === 'level-label')
            .append('text')
            .attr('class', 'special-path level-label')
            .attr('x', d => d.x)
            .attr('y', d => d.y)
            .attr('text-anchor', 'middle')
            .style('fill', '#4ecdc4')
            .style('font-size', d => `${Math.max(10, 14 - d.depth * 2)}px`)
            .style('font-weight', 'bold')
            .style('opacity', 0)
            .text(d => d.text)
            .transition()
            .duration(600)
            .delay(d => d.depth * 300)
            .style('opacity', d => d.opacity);
        
        // Dialectical moments
        pathsEnter.filter(d => d.type === 'dialectical-moment')
            .append('text')
            .attr('class', 'special-path dialectical-moment')
            .attr('x', d => d.x)
            .attr('y', d => d.y)
            .style('fill', '#ff6b6b')
            .style('font-size', '12px')
            .style('font-weight', 'bold')
            .style('font-style', 'italic')
            .style('opacity', d => d.opacity)
            .text(d => d.text)
            .transition()
            .duration(800)
            .delay(d => d.depth * 150);
        
        // Instructions
        pathsEnter.filter(d => d.type === 'instruction')
            .append('text')
            .attr('class', 'special-path instruction')
            .attr('x', d => d.x)
            .attr('y', d => d.y)
            .attr('text-anchor', 'middle')
            .style('fill', '#ff6b6b')
            .style('font-size', '14px')
            .style('font-style', 'italic')
            .style('opacity', 0)
            .text(d => d.text)
            .transition()
            .duration(1000)
            .delay(1000)
            .style('opacity', 0.8);
        
        // Titles
        pathsEnter.filter(d => d.type === 'title')
            .append('text')
            .attr('class', 'special-path')
            .attr('x', d => d.x)
            .attr('y', d => d.y)
            .attr('text-anchor', 'middle')
            .style('fill', '#4ecdc4')
            .style('font-size', '18px')
            .style('font-weight', 'bold')
            .style('opacity', 0)
            .text(d => d.text)
            .transition()
            .duration(800)
            .style('opacity', 1);
    }
    
    renderConnections(connections) {
        // Create stable unique keys for connections
        const connectionData = connections.map((d, i) => ({
            ...d,
            id: d.id || `conn-${i}-${d.type}-${d.source?.x || 0}-${d.target?.x || 0}`
        }));
        
        // Use enter/update/exit pattern for smooth transitions
        const connectionGroups = this.connectionsGroup.selectAll('.connection-group')
            .data(connectionData, d => d.id);
        
        // EXIT: Remove old connections
        connectionGroups.exit()
            .transition()
            .duration(300)
            .style('opacity', 0)
            .remove();
        
        // UPDATE: Update existing connections (positions, etc.)
        connectionGroups.transition()
            .duration(600)
            .style('opacity', d => d.opacity || 0.7);
        
        // ENTER: Add new connections with smooth blending
        const linesEnter = connectionGroups.enter()
            .append('g')
            .attr('class', 'connection-group')
            .style('opacity', 0);
        
        // Line connections
        linesEnter.filter(d => d.type === 'line')
            .append('line')
            .attr('class', 'connection')
            .attr('x1', d => d.source.x)
            .attr('y1', d => d.source.y)
            .attr('x2', d => d.source.x)
            .attr('y2', d => d.source.y)
            .style('opacity', 0)
            .transition()
            .duration(600)
            .delay((d, i) => i * 80)
            .style('opacity', 0.7)
            .attr('x2', d => d.target.x)
            .attr('y2', d => d.target.y);
        
        // Circle connections
        linesEnter.filter(d => d.type === 'circle')
            .append('circle')
            .attr('class', 'connection connection-circle')
            .attr('cx', d => d.source.x + (d.target.x - d.source.x) / 2)
            .attr('cy', d => d.source.y + (d.target.y - d.source.y) / 2)
            .attr('r', 0)
            .style('opacity', 0)
            .transition()
            .duration(600)
            .delay((d, i) => i * 80)
            .style('opacity', 0.5)
            .attr('r', d => {
                const dx = d.target.x - d.source.x;
                const dy = d.target.y - d.source.y;
                return Math.sqrt(dx * dx + dy * dy) / 2;
            });
        
        // Fractal connections
        linesEnter.filter(d => d.type === 'fractal-line')
            .append('line')
            .attr('class', 'connection fractal-connection')
            .attr('x1', d => d.source.x || (d.source.id ? this.getNodeById(d.source.id)?.x : 0))
            .attr('y1', d => d.source.y || (d.source.id ? this.getNodeById(d.source.id)?.y : 0))
            .attr('x2', d => d.target.x)
            .attr('y2', d => d.target.y)
            .style('opacity', d => d.opacity || 0.5)
            .style('stroke-width', 1)
            .style('stroke-dasharray', '1,2')
            .transition()
            .duration(600)
            .delay((d, i) => i * 20);
        
        // Curve connections (for dialectical loop)
        linesEnter.filter(d => d.type === 'curve')
            .append('path')
            .attr('class', 'connection')
            .attr('d', d => {
                if (d.controlPoints && d.controlPoints.length > 0) {
                    const cp = d.controlPoints[0];
                    return `M ${d.source.x} ${d.source.y} Q ${cp.x} ${cp.y}, ${d.target.x} ${d.target.y}`;
                }
                // Fallback to simple line if no control points
                return `M ${d.source.x} ${d.source.y} L ${d.target.x} ${d.target.y}`;
            })
            .style('opacity', 0)
            .style('stroke-dasharray', function() {
                return this.getTotalLength() + ' ' + this.getTotalLength();
            })
            .style('stroke-dashoffset', function() {
                return this.getTotalLength();
            })
            .transition()
            .duration(800)
            .delay((d, i) => i * 100)
            .style('opacity', 0.7)
            .style('stroke-dashoffset', 0);
        
        // Arc connections
        linesEnter.filter(d => d.type === 'arc')
            .append('path')
            .attr('class', 'connection')
            .attr('d', d => {
                const dx = d.target.x - d.source.x;
                const dy = d.target.y - d.source.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                // Calculate the arc that follows the circle
                const centerX = this.centerX;
                const centerY = this.centerY;
                const radius = d.radius || 200;
                
                // Calculate angles
                const startAngle = Math.atan2(d.source.y - centerY, d.source.x - centerX);
                const endAngle = Math.atan2(d.target.y - centerY, d.target.x - centerX);
                
                // Determine sweep direction (shortest arc around circle)
                let sweep = endAngle - startAngle;
                if (sweep > Math.PI) sweep -= 2 * Math.PI;
                if (sweep < -Math.PI) sweep += 2 * Math.PI;
                
                const largeArcFlag = Math.abs(sweep) > Math.PI ? 1 : 0;
                const sweepFlag = sweep > 0 ? 1 : 0;
                
                return `M ${d.source.x} ${d.source.y} A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${d.target.x} ${d.target.y}`;
            })
            .style('opacity', 0)
            .style('stroke-dasharray', function() {
                return this.getTotalLength() + ' ' + this.getTotalLength();
            })
            .style('stroke-dashoffset', function() {
                return this.getTotalLength();
            })
            .transition()
            .duration(800)
            .delay((d, i) => i * 100)
            .style('opacity', 0.7)
            .style('stroke-dashoffset', 0);
        
        // Fade in all new connection groups
        linesEnter.transition()
            .duration(600)
            .delay(200) // Slight delay after nodes appear
            .style('opacity', d => d.opacity || 0.7);
    }
    
    renderNodes(nodes) {
        // Use proper D3 enter/update/exit pattern for smooth transitions
        const nodeGroups = this.nodesGroup.selectAll('.node')
            .data(nodes, d => d.id || `${d.x}-${d.y}-${d.label}`);
        
        // EXIT: Remove nodes that are no longer needed
        nodeGroups.exit()
            .transition()
            .duration(400)
            .attr('transform', d => `translate(${d.x}, ${d.y}) scale(0)`)
            .style('opacity', 0)
            .remove();
        
        // UPDATE: Update existing nodes with smooth transitions
        const nodeUpdate = nodeGroups.transition()
            .duration(600)
            .attr('transform', d => `translate(${d.x}, ${d.y}) scale(1)`)
            .style('opacity', d => d.opacity !== undefined ? d.opacity : 1);
        
        // Update circles in existing nodes
        nodeUpdate.select('.node-circle')
            .attr('r', d => d.radius)
            .style('opacity', d => d.opacity !== undefined ? d.opacity : 1)
            .style('fill-opacity', d => d.opacity !== undefined ? d.opacity : 1);
        
        // Update text in existing nodes
        nodeUpdate.select('.node-label')
            .style('font-size', d => `${Math.max(8, d.radius * 0.6)}px`)
            .text(d => d.label)
            .style('opacity', d => d.opacity !== undefined ? d.opacity : 1)
            .style('fill-opacity', d => d.opacity !== undefined ? d.opacity : 1);
        
        // ENTER: Add new nodes with smooth blending
        const nodeEnter = nodeGroups.enter()
            .append('g')
            .attr('class', 'node')
            .attr('transform', d => `translate(${d.x}, ${d.y}) scale(0)`)
            .style('opacity', 0);
        
        // Add circles to new nodes
        nodeEnter.append('circle')
            .attr('class', d => d.isWhole ? 'node-circle node-whole' : 'node-circle node-part')
            .attr('r', 0)
            .style('opacity', 0)
            .style('fill-opacity', 0);
        
        // Add text labels to new nodes  
        nodeEnter.append('text')
            .attr('class', 'node-label')
            .attr('text-anchor', 'middle')
            .attr('dy', '0.35em')
            .style('font-size', '0px')
            .text(d => d.label)
            .style('opacity', 0)
            .style('fill-opacity', 0);
        
        // Animate new nodes in with graceful blending
        const enterTransition = nodeEnter.transition()
            .duration(800)
            .delay((d, i) => {
                // Stagger new nodes, but start quickly for smoother emergence
                const isNewNode = !this.previousNodeIds || !this.previousNodeIds.has(d.id);
                return isNewNode ? i * 100 : 0;
            })
            .attr('transform', d => `translate(${d.x}, ${d.y}) scale(1)`)
            .style('opacity', d => d.opacity !== undefined ? d.opacity : 1);
        
        // Animate circles growing in
        enterTransition.select('.node-circle')
            .attr('r', d => d.radius)
            .style('opacity', d => d.opacity !== undefined ? d.opacity : 1)
            .style('fill-opacity', d => d.opacity !== undefined ? d.opacity : 1);
        
        // Animate text fading in
        enterTransition.select('.node-label')
            .style('font-size', d => `${Math.max(8, d.radius * 0.6)}px`)
            .style('opacity', d => d.opacity !== undefined ? d.opacity : 1)
            .style('fill-opacity', d => d.opacity !== undefined ? d.opacity : 1);
        
        // Store current node IDs for next comparison
        this.previousNodeIds = new Set(nodes.map(d => d.id));
        
        // Store current nodes for zoom consistency
        this.currentNodeElements = nodeEnter.merge(nodeGroups);
    }
}

// Initialize when page loads
window.addEventListener('load', () => {
    new D3WholePartsVisualizer();
});