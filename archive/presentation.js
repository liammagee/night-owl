class InteractivePresentation {
    constructor() {
        this.slides = [];
        this.overviewItems = [];
        this.currentSlide = 0;
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
        this.isDragging = false;
        this.isOverviewMode = false;
        this.isZoomedIn = false;

        this.svg = document.getElementById('presentation-svg');
        this.container = document.getElementById('presentation-container');
        this.slideCounterElement = document.getElementById('slide-counter');
        this.overviewToggle = document.getElementById('overview-toggle');
        this.fileInput = document.getElementById('file-input'); // For direct file load button
        this.markdownFileElement = document.getElementById('markdown-file'); // The actual <input type="file">
        this.loadSampleButton = document.getElementById('load-sample');
        this.presentationTitleElement = document.getElementById('presentation-title');

        this.slideWidth = window.innerWidth * 0.8;
        this.slideHeight = window.innerHeight * 0.8;
        
        this.mainGroup = null;
        this.contentMaxX = 0;
        this.contentMaxY = 0;

        const requiredElements = [
            this.svg, this.container, this.slideCounterElement, 
            this.overviewToggle, this.markdownFileElement, this.loadSampleButton
        ];

        if (requiredElements.some(el => !el)) {
            console.error('One or more required UI elements are missing from the DOM.');
            return;
        }
        
        if (typeof marked === 'undefined') {
            console.error('Marked library is not loaded.');
            this.container.innerHTML = '<p style="color:red; text-align:center; padding-top: 50px;">Error: Markdown library not found.</p>';
            return;
        }

        this.setupEventListeners();
        this.loadSamplePresentation();
    }

    setupEventListeners() {
        this.overviewToggle.addEventListener('click', () => this.toggleOverview());
        document.getElementById('prev-slide').addEventListener('click', () => this.previousSlide());
        document.getElementById('next-slide').addEventListener('click', () => this.nextSlide());
        
        const loadFileBtn = document.getElementById('load-file-btn');
        if (loadFileBtn) {
             loadFileBtn.addEventListener('click', () => this.markdownFileElement.click());
        }

        this.markdownFileElement.addEventListener('change', (e) => this.handleFileLoad(e));
        this.loadSampleButton.addEventListener('click', () => this.loadSamplePresentation());

        document.addEventListener('keydown', (e) => this.handleKeyboard(e));
        this.svg.addEventListener('wheel', (e) => this.handleWheel(e));
        this.svg.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.svg.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.svg.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.svg.addEventListener('mouseleave', (e) => this.handleMouseUp(e));
        this.svg.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    
    loadSamplePresentation() {
        const sampleMarkdown = `# Hegel's Dialectical Method\n## A Journey Through Philosophical Development\n\nWelcome to an interactive exploration of G.W.F. Hegel's revolutionary approach to understanding reality, consciousness, and historical development.\n\n---\n\n## The Structure of Dialectical Thinking\n\n### Thesis → Antithesis → Synthesis\n\nHegel's dialectical method reveals how:\n- **Thesis**: An initial position or concept\n- **Antithesis**: The negation or contradiction of the thesis  \n- **Synthesis**: A higher unity that preserves and transcends both.\n\nThis process is not merely logical but ontological, driving change and development in all spheres.\n\n---\n\n## Key Concepts\n\n### Aufhebung (Sublation)\nThis crucial term means to simultaneously:\n1.  Negate or abolish\n2.  Preserve or keep\n3.  Lift up or elevate\n\nIt captures the dynamic nature of synthesis.\n\n### Spirit (Geist)\nFor Hegel, Spirit refers to the collective consciousness and culture of humanity, evolving through dialectical stages.\n\n---\n\n## Conclusion: The End of History?\n\nFor Hegel, \"Absolute Knowing\" represented a kind of culmination, where Spirit fully understands itself.\n- This doesn't mean events stop, but that the fundamental principles of reality and freedom are comprehended.\n- The ongoing dialectic continues within this achieved understanding.`;
        this.parseMarkdown(sampleMarkdown);
        if (this.presentationTitleElement) {
            this.presentationTitleElement.textContent = "Hegel's Dialectical Method";
        }
    }

    parseMarkdown(markdown) {
        const slideTexts = markdown.split(/^---\s*$/m);
        this.slides = [];
        this.overviewItems = [];
        let overviewItemIdCounter = 0;

        slideTexts.forEach((slideText) => {
            const trimmedSlideText = slideText.trim();
            if (!trimmedSlideText) return;

            try {
                const slideId = this.slides.length;
                const slideHtml = marked.parse(trimmedSlideText);
                const position = this.calculateSlidePosition(slideId);
                const slide = {
                    id: slideId,
                    content: trimmedSlideText,
                    html: slideHtml,
                    x: position.x,
                    y: position.y,
                    headings: []
                };

                const tokens = marked.lexer(trimmedSlideText);
                tokens.forEach(token => {
                    if (token.type === 'heading') {
                        this.overviewItems.push({
                            id: overviewItemIdCounter++,
                            text: token.text,
                            level: token.depth,
                            slideId: slideId,
                            originalSlideIndex: slideId 
                        });
                    }
                });
                this.slides.push(slide);
            } catch (error) {
                console.error('Error parsing slide:', error);
            }
        });

        if (this.slides.length === 0) {
            this.renderSlides();
            this.updateSlideCounter();
            return;
        }

        this.currentSlide = 0;

        // --- Calculate total content dimensions for viewBox ---
        let maxContentX = 0;
        let maxContentY = 0;

        this.slides.forEach((slide, index) => {
            maxContentX = Math.max(maxContentX, slide.x + this.slideWidth);
            maxContentY = Math.max(maxContentY, slide.y + this.slideHeight);
        });
        this.contentMaxX = maxContentX + 100;
        this.contentMaxY = maxContentY + 100;

        this.svg.setAttribute('viewBox', `0 0 ${this.contentMaxX} ${this.contentMaxY}`);
        
        this.renderSlides();
        this.updateSlideCounter();
        this.focusOnSlide(0);
    }

    calculateSlidePosition(index) {
        const marginX = 150;
        const marginY = 100;
        const cols = 3;
        
        const row = Math.floor(index / cols);
        const col = index % cols;

        const initialOffsetX = 50;
        const initialOffsetY = 50;

        const x = col * (this.slideWidth + marginX) + initialOffsetX;
        const y = row * (this.slideHeight + marginY) + initialOffsetY;

        return { x, y };
    }

    calculateOverviewItemPosition(index) {
        const itemWidth = 700, itemHeight = 50, itemMarginY = 15;
        const initialX = 20, initialY = 20;
        return {
            x: initialX,
            y: initialY + index * (itemHeight + itemMarginY),
            width: itemWidth,
            height: itemHeight
        };
    }

    renderSlides() {
        this.svg.innerHTML = '';
        this.mainGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        this.mainGroup.classList.add('presentation-main-group');
        this.svg.appendChild(this.mainGroup);

        if (this.isOverviewMode) {
            this.overviewItems.forEach((item, index) => {
                const pos = this.calculateOverviewItemPosition(index);
                const itemGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                itemGroup.classList.add('overview-item');
                itemGroup.setAttribute('transform', `translate(${pos.x}, ${pos.y})`);

                const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                background.setAttribute('width', pos.width.toString());
                background.setAttribute('height', pos.height.toString());
                background.setAttribute('rx', '5');
                background.setAttribute('fill', 'rgba(255, 255, 255, 0.95)');
                background.setAttribute('stroke', '#ddd');
                background.setAttribute('stroke-width', '1');

                const textElement = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                textElement.setAttribute('x', '15');
                textElement.setAttribute('y', (pos.height / 2 + 5).toString());
                textElement.setAttribute('font-size', `${Math.max(12, 20 - (item.level * 2))}px`);
                textElement.textContent = `${' '.repeat(item.level * 2)}${item.text}`;
                
                itemGroup.append(background, textElement);
                itemGroup.addEventListener('click', () => !this.isDragging && this.goToSlide(item.originalSlideIndex));
                this.mainGroup.appendChild(itemGroup);
            });
        } else {
            this.slides.forEach((slide, index) => {
                const slideGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                slideGroup.classList.add('slide');
                slideGroup.setAttribute('transform', `translate(${slide.x}, ${slide.y})`);

                const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                background.setAttribute('width', this.slideWidth);
                background.setAttribute('height', this.slideHeight);
                background.setAttribute('rx', '12');
                background.setAttribute('fill', 'white');
                background.setAttribute('stroke', index === this.currentSlide ? '#333333' : 'transparent');
                background.setAttribute('stroke-width', '4');
                
                const foreignObject = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
                foreignObject.setAttribute('width', this.slideWidth);
                foreignObject.setAttribute('height', this.slideHeight);
                
                const contentDiv = document.createElement('div');
                contentDiv.classList.add('slide-content');
                contentDiv.innerHTML = slide.html;
                
                foreignObject.appendChild(contentDiv);
                slideGroup.append(background, foreignObject);
                slideGroup.addEventListener('click', () => {
                    if (!this.isDragging) {
                        this.focusOnSlide(index);
                    }
                });
                this.mainGroup.appendChild(slideGroup);
            });
        }
        this.updateTransform();
    }

    updateTransform() {
        if (!this.mainGroup) return;
        const transformValue = `translate(${this.panX}, ${this.panY}) scale(${this.zoom})`;
        this.mainGroup.setAttribute('transform', transformValue);
    }

    focusOnSlide(index) {
        if (index < 0 || index >= this.slides.length) return;

        if (this.isZoomedIn && index === this.currentSlide) {
            this.zoomOutToGrid();
            return;
        }

        this.currentSlide = index;
        const slide = this.slides[index];
        const containerRect = this.container.getBoundingClientRect();
        
        const zoomX = containerRect.width * 0.8 / this.slideWidth;
        const zoomY = containerRect.height * 0.8 / this.slideHeight;
        const targetZoom = Math.min(zoomX, zoomY, 2.0);

        const slideCenterX = slide.x + this.slideWidth / 2;
        const slideCenterY = slide.y + this.slideHeight / 2;

        const targetPanX = (containerRect.width / 2) - (slideCenterX * targetZoom);
        const targetPanY = (containerRect.height / 2) - (slideCenterY * targetZoom);
        
        this.isZoomedIn = true;
        this.animateToPosition(targetPanX, targetPanY, targetZoom);
        this.updateSlideCounter();
        // Re-render to update stroke on focused slide, but only if not in overview mode
        if (!this.isOverviewMode) {
            this.renderSlides();
        }
    }

    zoomOutToGrid() {
        const containerRect = this.container.getBoundingClientRect();
        const margin = 50;

        let targetZoom = 1;
        if (this.contentMaxX > 0 && this.contentMaxY > 0) {
            const scaleX = (containerRect.width - margin * 2) / this.contentMaxX;
            const scaleY = (containerRect.height - margin * 2) / this.contentMaxY;
            targetZoom = Math.min(scaleX, scaleY, 1);
        }

        const contentCenterX = this.contentMaxX / 2;
        const contentCenterY = this.contentMaxY / 2;

        const targetPanX = (containerRect.width / 2) - (contentCenterX * targetZoom);
        const targetPanY = (containerRect.height / 2) - (contentCenterY * targetZoom);

        this.isZoomedIn = false;
        this.animateToPosition(targetPanX, targetPanY, targetZoom);
    }

    showOverview() {
        if (this.overviewItems.length === 0) return;

        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        this.overviewItems.forEach((item, index) => {
            const pos = this.calculateOverviewItemPosition(index);
            minX = Math.min(minX, pos.x);
            maxX = Math.max(maxX, pos.x + pos.width);
            minY = Math.min(minY, pos.y);
            maxY = Math.max(maxY, pos.y + pos.height);
        });

        const contentWidth = maxX - minX;
        const contentHeight = maxY - minY;
        const containerRect = this.container.getBoundingClientRect();
        const margin = 50;

        let targetZoom = 1;
        if (contentWidth > 0 && contentHeight > 0) {
            const scaleX = (containerRect.width - margin * 2) / contentWidth;
            const scaleY = (containerRect.height - margin * 2) / contentHeight;
            targetZoom = Math.min(scaleX, scaleY, 1); // Cap overview zoom at 1
        }

        const overviewContentCenterX = minX + contentWidth / 2;
        const overviewContentCenterY = minY + contentHeight / 2;

        const targetPanX = (containerRect.width / 2) - (overviewContentCenterX * targetZoom);
        const targetPanY = (containerRect.height / 2) - (overviewContentCenterY * targetZoom);
        
        this.animateToPosition(targetPanX, targetPanY, targetZoom);
    }
    
    animateToPosition(targetX, targetY, targetZoom) {
        const startX = this.panX, startY = this.panY, startZoom = this.zoom;
        const duration = 350;
        const startTime = performance.now();

        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            let progress = Math.min(elapsed / duration, 1);
            progress = 1 - Math.pow(1 - progress, 3); // Ease-out cubic

            this.panX = startX + (targetX - startX) * progress;
            this.panY = startY + (targetY - startY) * progress;
            this.zoom = startZoom + (targetZoom - startZoom) * progress;
            
            this.updateTransform();
            
            if (progress < 1) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    }

    toggleOverview() {
        this.isOverviewMode = !this.isOverviewMode;
        this.isZoomedIn = false; // Always reset zoom state when toggling overview
        document.body.classList.toggle('overview-mode', this.isOverviewMode);
        this.renderSlides();
        if (this.isOverviewMode) {
            this.showOverview();
        } else {
            this.focusOnSlide(this.currentSlide);
        }
    }

    goToSlide(index) {
        if (index < 0 || index >= this.slides.length) return;
        
        if (this.isOverviewMode) {
            this.isOverviewMode = false;
            document.body.classList.remove('overview-mode');
        }
        
        this.focusOnSlide(index);
    }

    nextSlide() {
        if (this.currentSlide < this.slides.length - 1) {
            this.goToSlide(this.currentSlide + 1);
        }
    }

    previousSlide() {
        if (this.currentSlide > 0) {
            this.goToSlide(this.currentSlide - 1);
        }
    }

    updateSlideCounter() {
        if (this.slideCounterElement) {
            this.slideCounterElement.innerHTML = `Slide ${this.slides.length > 0 ? this.currentSlide + 1 : 0} of ${this.slides.length}`;
        }
        document.getElementById('prev-slide').disabled = this.currentSlide === 0;
        document.getElementById('next-slide').disabled = this.currentSlide >= this.slides.length - 1;
    }

    handleKeyboard(e) {
        const keyMap = {
            'ArrowRight': () => this.nextSlide(),
            'PageDown': () => this.nextSlide(),
            ' ': () => this.nextSlide(),
            'ArrowLeft': () => this.previousSlide(),
            'PageUp': () => this.previousSlide(),
            'o': () => this.toggleOverview(),
            'O': () => this.toggleOverview(),
            'Home': () => this.goToSlide(0),
            'End': () => this.goToSlide(this.slides.length - 1),
        };
        if (keyMap[e.key] && !e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            keyMap[e.key]();
        }
    }

    handleWheel(e) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.max(0.1, Math.min(10, this.zoom * delta));
        
        const containerRect = this.container.getBoundingClientRect();
        const mouseX = e.clientX - containerRect.left;
        const mouseY = e.clientY - containerRect.top;

        const pointX = (mouseX - this.panX) / this.zoom;
        const pointY = (mouseY - this.panY) / this.zoom;

        this.panX = mouseX - pointX * newZoom;
        this.panY = mouseY - pointY * newZoom;
        this.zoom = newZoom;
        
        this.isZoomedIn = false; // Manual zoom resets the toggle state
        this.updateTransform();
    }

    handleMouseDown(e) {
        if (e.button !== 0) return; // Only main button (left-click)
        this.isDragging = true;
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        this.dragStartPanX = this.panX;
        this.dragStartPanY = this.panY;
        this.svg.style.cursor = 'grabbing';
        this.svg.classList.add('dragging');
    }

    handleMouseMove(e) {
        if (!this.isDragging) return;
        
        this.panX = this.dragStartPanX + (e.clientX - this.dragStartX);
        this.panY = this.dragStartPanY + (e.clientY - this.dragStartY);
        
        this.updateTransform();
    }

    handleMouseUp(e) {
        if (e.button !== 0 && !this.isDragging) return;
        this.isDragging = false;
        this.svg.style.cursor = 'grab';
        this.svg.classList.remove('dragging');
    }

    handleFileLoad(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        if (this.presentationTitleElement) {
            this.presentationTitleElement.textContent = file.name;
        }

        const reader = new FileReader();
        reader.onload = (event) => this.parseMarkdown(event.target.result);
        reader.readAsText(file);
        e.target.value = null; // Reset file input
    }
}

document.addEventListener('DOMContentLoaded', () => new InteractivePresentation());