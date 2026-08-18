/**
 * Microfiche preview mode for scanning long rendered documents as a grid of
 * miniature semantic pages. The original preview nodes are moved, not copied,
 * so leaving the mode restores their event listeners and interactive state.
 */
(function (root, factory) {
    const isCommonJS = typeof module !== 'undefined' && module.exports;
    const api = factory(root, { autoInitialize: !isCommonJS });
    if (root) root.NightOwlPreviewMicrofiche = api;
    if (isCommonJS) module.exports = api;
})(typeof window !== 'undefined' ? window : null, function createPreviewMicroficheModule(root, moduleOptions) {
    'use strict';

    moduleOptions = moduleOptions || {};

    const TARGET_PAGE_WEIGHT = 2400;
    const MIN_TEXT_LENGTH = 1200;
    const MIN_BLOCK_COUNT = 6;
    const SOURCE_INDEX_ATTRIBUTE = 'data-microfiche-source-index';
    const MIN_SCALE = 0.18;
    const MAX_SCALE = 2.5;
    const ZOOM_STEP = 1.2;

    function clamp(value, minimum, maximum) {
        return Math.min(maximum, Math.max(minimum, value));
    }

    function wheelShouldZoom(event = {}) {
        if (event.ctrlKey || event.metaKey || event.altKey) return true;
        const deltaX = Math.abs(Number(event.deltaX) || 0);
        const deltaY = Math.abs(Number(event.deltaY) || 0);
        if ((Number(event.deltaMode) || 0) !== 0 && deltaY > 0) return true;
        return deltaY >= 48 && deltaX <= deltaY * 0.25;
    }

    function contentWeight(node) {
        if (!node) return 0;
        const textLength = String(node.textContent || '').trim().length;
        if (node.nodeType !== 1) return textLength;
        return textLength +
            (node.matches?.('pre, table') ? 700 : 0) +
            (node.querySelectorAll?.('pre, table').length || 0) * 500 +
            (node.querySelectorAll?.('img, svg, canvas, iframe').length || 0) * 900;
    }

    function isSectionHeading(node) {
        return node?.nodeType === 1 && node.matches?.('h1, h2');
    }

    function isMeaningfulNode(node) {
        return node?.nodeType === 1 || String(node?.textContent || '').trim().length > 0;
    }

    function paginateNodes(nodes, targetWeight = TARGET_PAGE_WEIGHT) {
        const pages = [];
        let current = [];
        let weight = 0;

        const commit = () => {
            if (!current.length) return;
            pages.push(current);
            current = [];
            weight = 0;
        };

        Array.from(nodes || []).filter(isMeaningfulNode).forEach((node, index) => {
            const nodeWeight = Math.max(1, contentWeight(node));
            const startsSection = isSectionHeading(node) && current.length > 0 && weight >= targetWeight * 0.35;
            const exceedsPage = current.length > 0 && weight + nodeWeight > targetWeight;
            if (startsSection || exceedsPage) commit();
            current.push({ node, sourceIndex: index });
            weight += nodeWeight;
            if (weight >= targetWeight * 1.35) commit();
        });
        commit();
        return pages;
    }

    function stripCloneIdentity(node) {
        if (!node || node.nodeType !== 1) return node;
        const elements = [node, ...node.querySelectorAll('*')];
        elements.forEach(element => {
            element.removeAttribute('id');
            element.removeAttribute('name');
            element.removeAttribute('tabindex');
            element.removeAttribute('contenteditable');
            element.removeAttribute('autofocus');
            if (element.matches('a, area')) element.removeAttribute('href');
            if (element.matches('button, input, select, textarea')) element.setAttribute('disabled', '');
        });
        return node;
    }

    function pageLabel(page, index) {
        const firstHeading = page
            .map(item => item.node)
            .find(node => node.nodeType === 1 && node.matches?.('h1, h2, h3'));
        const text = String(firstHeading?.textContent || page[0]?.node?.textContent || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 80);
        return text ? `Open frame ${index + 1}: ${text}` : `Open frame ${index + 1}`;
    }

    class PreviewMicrofiche {
        constructor(options = {}) {
            this.document = options.document || root?.document || null;
            this.window = options.window || root || null;
            this.targetPageWeight = options.targetPageWeight || TARGET_PAGE_WEIGHT;
            this.minTextLength = options.minTextLength ?? MIN_TEXT_LENGTH;
            this.minBlockCount = options.minBlockCount ?? MIN_BLOCK_COUNT;
            this.active = false;
            this.preferredEnabled = false;
            this.eligible = false;
            this.suspended = false;
            this.source = null;
            this.shell = null;
            this.originalScrollTop = 0;
            this.currentFilePath = '';
            this.button = null;
            this.previewContent = null;
            this.viewport = null;
            this.canvas = null;
            this.grid = null;
            this.zoomLabel = null;
            this.zoomOutButton = null;
            this.zoomInButton = null;
            this.scale = 1;
            this.translateX = 0;
            this.translateY = 0;
            this.fitMode = true;
            this._panSession = null;
            this._gestureSession = null;
            this._suppressFrameClick = false;
            this._resizeFrame = null;
            this._boundToggle = () => this.toggle();
            this._boundKeydown = event => {
                if (event.key === 'Escape' && this.active) this.deactivate();
            };
            this._boundResize = () => {
                if (!this.active || this._resizeFrame) return;
                const schedule = this.window?.requestAnimationFrame || (callback => this.window?.setTimeout?.(callback, 0));
                this._resizeFrame = schedule?.(() => {
                    this._resizeFrame = null;
                    if (!this.active) return;
                    if (this.fitMode) this.fitToViewport({ announce: false });
                    else this._applyTransform();
                });
            };
            this._boundMouseMove = event => this._movePan(event, 'mouse');
            this._boundMouseUp = event => this._finishPan(event, 'mouse');
        }

        initialize() {
            if (!this.document) return false;
            this.previewContent = this.document.getElementById('preview-content');
            this.button = this.document.getElementById('preview-microfiche-btn');
            if (!this.previewContent || !this.button) return false;
            this.button.removeEventListener('click', this._boundToggle);
            this.button.addEventListener('click', this._boundToggle);
            this.document.removeEventListener('keydown', this._boundKeydown);
            this.document.addEventListener('keydown', this._boundKeydown);
            this._setButtonState();
            return true;
        }

        prepareForFile(classification = {}) {
            this.deactivate({ preservePreference: true });
            this.suspended = false;
            this.eligible = Boolean(
                classification.isMarkdown ||
                (!classification.isBinaryPreview &&
                    !classification.isHTML &&
                    !classification.isStructuredRecord &&
                    !classification.isBibTeX &&
                    /\.(?:txt|text|rst)$/i.test(classification.path || ''))
            );
            this.currentFilePath = classification.path || '';
            this._setButtonState();
        }

        handlePreviewCommit({ filePath = '', renderer = 'markdown', classification = null } = {}) {
            if (!this.previewContent || !this.button) this.initialize();
            if (!this.previewContent || !this.button) return false;

            // A committed render replaces preview-content, including any prior
            // microfiche shell. Drop stale references before inspecting it.
            const wasActive = this.active;
            if (wasActive) this._discardActiveState();
            if (classification) this.prepareForFile(classification);
            this.currentFilePath = filePath || this.currentFilePath;

            const supportedRenderer = renderer === 'markdown';
            const textLength = String(this.previewContent.textContent || '').trim().length;
            const blockCount = Array.from(this.previewContent.childNodes).filter(isMeaningfulNode).length;
            const longEnough = textLength >= this.minTextLength || blockCount >= this.minBlockCount;
            this.eligible = Boolean(this.eligible && supportedRenderer && longEnough &&
                !this.previewContent.querySelector('.kanban-board, .preview-transition-error'));
            this._setButtonState({ textLength, blockCount });

            if (this.preferredEnabled && this.eligible && !this.suspended) return this.activate();
            if (wasActive) this._dispatch('preview-microfiche-exit', { filePath: this.currentFilePath });
            return false;
        }

        handlePreviewFailure() {
            this.deactivate({ preservePreference: true });
            this.eligible = false;
            this._setButtonState();
        }

        toggle() {
            return this.active ? this.deactivate() : this.activate();
        }

        activate() {
            if (this.active || !this.eligible || this.suspended || !this.previewContent) return false;
            const originalNodes = Array.from(this.previewContent.childNodes).filter(isMeaningfulNode);
            const pages = paginateNodes(originalNodes, this.targetPageWeight);
            if (!pages.length) return false;

            this.originalScrollTop = this.previewContent.scrollTop;
            this.source = this.document.createElement('div');
            this.source.className = 'microfiche-source';
            this.source.hidden = true;
            this.source.setAttribute('aria-hidden', 'true');
            originalNodes.forEach((node, index) => {
                if (node.nodeType === 1) node.setAttribute(SOURCE_INDEX_ATTRIBUTE, String(index));
                this.source.appendChild(node);
            });

            this.shell = this.document.createElement('section');
            this.shell.className = 'microfiche-shell';
            this.shell.setAttribute('aria-label', 'Microfiche document overview');

            const header = this.document.createElement('header');
            header.className = 'microfiche-header';
            const summary = this.document.createElement('span');
            summary.className = 'microfiche-summary';
            summary.textContent = `${pages.length} frame${pages.length === 1 ? '' : 's'}`;
            const hint = this.document.createElement('span');
            hint.className = 'microfiche-hint';
            hint.textContent = 'Drag or two-finger scroll to pan · pinch or mouse wheel to zoom · select a frame to read';

            const controls = this.document.createElement('div');
            controls.className = 'microfiche-controls';
            controls.setAttribute('role', 'group');
            controls.setAttribute('aria-label', 'Microfiche zoom controls');
            this.zoomOutButton = this._createControlButton('−', 'Zoom out', () => this.zoomOut());
            this.zoomLabel = this._createControlButton('100%', 'Reset zoom to fit all frames', () => this.fitToViewport());
            this.zoomLabel.classList.add('microfiche-zoom-label');
            this.zoomLabel.setAttribute('aria-live', 'polite');
            this.zoomInButton = this._createControlButton('+', 'Zoom in', () => this.zoomIn());
            const fitButton = this._createControlButton('Fit', 'Fit all frames', () => this.fitToViewport());
            fitButton.classList.add('microfiche-fit-button');
            controls.append(this.zoomOutButton, this.zoomLabel, this.zoomInButton, fitButton);
            header.append(summary, hint, controls);

            const grid = this.document.createElement('div');
            grid.className = 'microfiche-grid';
            grid.style.setProperty('--microfiche-columns', String(Math.max(1, Math.ceil(Math.sqrt(pages.length * 1.3)))));
            pages.forEach((page, pageIndex) => grid.appendChild(this._createFrame(page, pageIndex)));

            this.viewport = this.document.createElement('div');
            this.viewport.className = 'microfiche-viewport';
            this.viewport.tabIndex = 0;
            this.viewport.setAttribute('role', 'region');
            this.viewport.setAttribute('aria-label', 'Pannable and zoomable microfiche canvas');
            this.viewport.setAttribute('aria-keyshortcuts', 'ArrowUp ArrowDown ArrowLeft ArrowRight + - 0');
            this.canvas = this.document.createElement('div');
            this.canvas.className = 'microfiche-canvas';
            this.canvas.appendChild(grid);
            this.grid = grid;
            this.viewport.appendChild(this.canvas);
            this._bindViewportInteractions();
            this.shell.append(header, this.viewport);
            this.previewContent.replaceChildren(this.source, this.shell);
            this.previewContent.classList.add('microfiche-active');
            this.previewContent.scrollTop = 0;
            this.active = true;
            this.preferredEnabled = true;
            this.scale = 1;
            this.translateX = 0;
            this.translateY = 0;
            this.fitMode = true;
            this.window?.addEventListener?.('resize', this._boundResize);
            const schedule = this.window?.requestAnimationFrame || (callback => this.window?.setTimeout?.(callback, 0));
            schedule?.(() => {
                if (this.active) this.fitToViewport({ announce: false });
            });
            this._setButtonState();
            this._setScrollSyncDisabled(true);
            this._setCompanionControlsHidden(true);
            this._dispatch('preview-microfiche-enter', { pageCount: pages.length, filePath: this.currentFilePath });
            return true;
        }

        deactivate(options = {}) {
            const preservePreference = options.preservePreference === true;
            const announce = options.announce !== false;
            if (!preservePreference) this.preferredEnabled = false;
            if (!this.active || !this.previewContent || !this.source) {
                this._discardActiveState();
                this._setButtonState();
                return false;
            }

            const restored = Array.from(this.source.childNodes);
            restored.forEach(node => {
                if (node.nodeType === 1) node.removeAttribute(SOURCE_INDEX_ATTRIBUTE);
            });
            this.previewContent.replaceChildren(...restored);
            this.previewContent.classList.remove('microfiche-active');
            this.previewContent.scrollTop = this.originalScrollTop;
            this._discardActiveState();
            this._setButtonState();
            this._setScrollSyncDisabled(false);
            this._setCompanionControlsHidden(false);
            if (announce) this._dispatch('preview-microfiche-exit', { filePath: this.currentFilePath });
            return true;
        }

        suspend() {
            this.suspended = true;
            this.deactivate({ preservePreference: true });
        }

        resume() {
            this.suspended = false;
            if (this.preferredEnabled && this.eligible) return this.activate();
            return false;
        }

        _createFrame(page, pageIndex) {
            const frame = this.document.createElement('article');
            frame.className = 'microfiche-frame';
            frame.tabIndex = 0;
            frame.setAttribute('role', 'button');
            frame.setAttribute('aria-label', pageLabel(page, pageIndex));
            frame.dataset.pageIndex = String(pageIndex);
            frame.dataset.sourceIndex = String(page[0].sourceIndex);

            const paper = this.document.createElement('div');
            paper.className = 'microfiche-paper';
            const content = this.document.createElement('div');
            content.className = 'microfiche-frame-content';
            content.setAttribute('inert', '');
            content.setAttribute('aria-hidden', 'true');
            page.forEach(item => content.appendChild(stripCloneIdentity(item.node.cloneNode(true))));
            const number = this.document.createElement('span');
            number.className = 'microfiche-frame-number';
            number.textContent = String(pageIndex + 1).padStart(2, '0');
            paper.append(content, number);
            frame.appendChild(paper);

            const focus = () => this.focusFrame(Number(frame.dataset.sourceIndex));
            frame.addEventListener('click', event => {
                if (this._suppressFrameClick) {
                    event.preventDefault();
                    this._suppressFrameClick = false;
                    return;
                }
                focus();
            });
            frame.addEventListener('keydown', event => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                focus();
            });
            return frame;
        }

        _createControlButton(text, label, action) {
            const button = this.document.createElement('button');
            button.type = 'button';
            button.className = 'microfiche-control';
            button.textContent = text;
            button.title = label;
            button.setAttribute('aria-label', label);
            button.addEventListener('click', event => {
                event.stopPropagation();
                action();
                this.viewport?.focus?.({ preventScroll: true });
            });
            return button;
        }

        _bindViewportInteractions() {
            if (!this.viewport) return;
            this.viewport.addEventListener('pointerdown', event => {
                if (event.pointerType === 'mouse') return;
                if (event.button !== undefined && event.button !== 0) return;
                this._startPan(event, event.pointerId);
            });
            this.viewport.addEventListener('pointermove', event => {
                if (event.pointerType === 'mouse') return;
                this._movePan(event, event.pointerId);
            });
            this.viewport.addEventListener('pointerup', event => this._finishPan(event, event.pointerId));
            this.viewport.addEventListener('pointercancel', event => this._finishPan(event, event.pointerId));
            this.viewport.addEventListener('mousedown', event => {
                if (event.button !== 0) return;
                this._startPan(event, 'mouse');
            });
            this.window?.addEventListener?.('mousemove', this._boundMouseMove);
            this.window?.addEventListener?.('mouseup', this._boundMouseUp);
            this.viewport.addEventListener('wheel', event => {
                event.preventDefault();
                event.stopPropagation();
                if (wheelShouldZoom(event)) {
                    const rect = this.viewport.getBoundingClientRect();
                    const factor = Math.exp(-event.deltaY * 0.0025);
                    this.setScale(this.scale * factor, event.clientX - rect.left, event.clientY - rect.top);
                    return;
                }
                this.panBy(-event.deltaX, -event.deltaY);
            }, { passive: false });
            this.viewport.addEventListener('gesturestart', event => {
                event.preventDefault();
                event.stopPropagation();
                this._gestureSession = { scale: this.scale };
            }, { passive: false });
            this.viewport.addEventListener('gesturechange', event => {
                if (!this._gestureSession) return;
                event.preventDefault();
                event.stopPropagation();
                const rect = this.viewport.getBoundingClientRect();
                this.setScale(
                    this._gestureSession.scale * (Number(event.scale) || 1),
                    event.clientX - rect.left,
                    event.clientY - rect.top
                );
            }, { passive: false });
            this.viewport.addEventListener('gestureend', event => {
                event.preventDefault();
                this._gestureSession = null;
            }, { passive: false });
            this.viewport.addEventListener('dblclick', event => {
                event.preventDefault();
                event.stopPropagation();
                const rect = this.viewport.getBoundingClientRect();
                this.setScale(this.scale * 1.5, event.clientX - rect.left, event.clientY - rect.top);
            });
            this.viewport.addEventListener('keydown', event => {
                const panStep = event.shiftKey ? 140 : 48;
                const actions = {
                    ArrowLeft: () => this.panBy(panStep, 0),
                    ArrowRight: () => this.panBy(-panStep, 0),
                    ArrowUp: () => this.panBy(0, panStep),
                    ArrowDown: () => this.panBy(0, -panStep),
                    '+': () => this.zoomIn(),
                    '=': () => this.zoomIn(),
                    '-': () => this.zoomOut(),
                    '_': () => this.zoomOut(),
                    '0': () => this.fitToViewport(),
                    Home: () => this.fitToViewport()
                };
                const action = actions[event.key];
                if (!action) return;
                event.preventDefault();
                action();
            });
        }

        _startPan(event, pointerId) {
            this._panSession = {
                pointerId,
                startX: event.clientX,
                startY: event.clientY,
                lastX: event.clientX,
                lastY: event.clientY,
                moved: false
            };
        }

        _movePan(event, pointerId) {
            const session = this._panSession;
            if (!session || session.pointerId !== pointerId) return;
            const deltaX = event.clientX - session.lastX;
            const deltaY = event.clientY - session.lastY;
            session.lastX = event.clientX;
            session.lastY = event.clientY;
            if (!session.moved && Math.hypot(event.clientX - session.startX, event.clientY - session.startY) >= 5) {
                session.moved = true;
                this.viewport?.classList.add('is-panning');
                if (pointerId !== 'mouse') this.viewport?.setPointerCapture?.(pointerId);
            }
            if (!session.moved) return;
            event.preventDefault();
            this.panBy(deltaX, deltaY);
        }

        _finishPan(event, pointerId) {
            const session = this._panSession;
            if (!session || session.pointerId !== pointerId) return;
            if (session.moved && pointerId !== 'mouse') this.viewport?.releasePointerCapture?.(pointerId);
            this.viewport?.classList.remove('is-panning');
            this._panSession = null;
            if (!session.moved) return;
            event.preventDefault?.();
            this._suppressFrameClick = true;
            this.window?.setTimeout?.(() => { this._suppressFrameClick = false; }, 0);
        }

        getViewState() {
            return {
                scale: this.scale,
                translateX: this.translateX,
                translateY: this.translateY,
                fitMode: this.fitMode
            };
        }

        zoomIn() {
            return this.setScale(this.scale * ZOOM_STEP);
        }

        zoomOut() {
            return this.setScale(this.scale / ZOOM_STEP);
        }

        setScale(nextScale, anchorX = null, anchorY = null, options = {}) {
            if (!this.active || !this.viewport || !this.canvas) return false;
            const oldScale = this.scale || 1;
            const scale = clamp(Number(nextScale) || oldScale, MIN_SCALE, MAX_SCALE);
            const viewportWidth = this.viewport.clientWidth || 0;
            const viewportHeight = this.viewport.clientHeight || 0;
            const resolvedAnchorX = Number.isFinite(anchorX) ? anchorX : viewportWidth / 2;
            const resolvedAnchorY = Number.isFinite(anchorY) ? anchorY : viewportHeight / 2;
            const worldX = (resolvedAnchorX - this.translateX) / oldScale;
            const worldY = (resolvedAnchorY - this.translateY) / oldScale;
            this.scale = scale;
            this.translateX = resolvedAnchorX - worldX * scale;
            this.translateY = resolvedAnchorY - worldY * scale;
            this.fitMode = options.fitMode === true;
            this._applyTransform();
            return true;
        }

        panBy(deltaX, deltaY) {
            if (!this.active || !this.canvas) return false;
            this.translateX += Number(deltaX) || 0;
            this.translateY += Number(deltaY) || 0;
            this.fitMode = false;
            this._applyTransform();
            return true;
        }

        fitToViewport(options = {}) {
            if (!this.active || !this.viewport || !this.grid) return false;
            const viewportWidth = this.viewport.clientWidth || 0;
            const viewportHeight = this.viewport.clientHeight || 0;
            const canvasWidth = this.grid.scrollWidth || this.grid.offsetWidth || 0;
            const canvasHeight = this.grid.scrollHeight || this.grid.offsetHeight || 0;
            if (!viewportWidth || !viewportHeight || !canvasWidth || !canvasHeight) {
                this.scale = 1;
                this.translateX = 0;
                this.translateY = 0;
                this.fitMode = true;
                this._applyTransform();
                return true;
            }
            const padding = 28;
            this.scale = clamp(Math.min(
                (viewportWidth - padding * 2) / canvasWidth,
                (viewportHeight - padding * 2) / canvasHeight,
                1
            ), MIN_SCALE, MAX_SCALE);
            this.translateX = (viewportWidth - canvasWidth * this.scale) / 2;
            this.translateY = (viewportHeight - canvasHeight * this.scale) / 2;
            this.fitMode = true;
            this._applyTransform();
            if (options.announce !== false) this.viewport.focus?.({ preventScroll: true });
            return true;
        }

        _canvasDimensions() {
            return {
                width: (this.grid?.scrollWidth || this.grid?.offsetWidth || 0) * this.scale,
                height: (this.grid?.scrollHeight || this.grid?.offsetHeight || 0) * this.scale
            };
        }

        _clampTranslation() {
            if (!this.viewport) return;
            const viewportWidth = this.viewport.clientWidth || 0;
            const viewportHeight = this.viewport.clientHeight || 0;
            const canvas = this._canvasDimensions();
            if (!viewportWidth || !viewportHeight || !canvas.width || !canvas.height) return;
            const visibleX = Math.min(72, canvas.width, viewportWidth);
            const visibleY = Math.min(72, canvas.height, viewportHeight);
            const minimumX = visibleX - canvas.width;
            const maximumX = viewportWidth - visibleX;
            const minimumY = visibleY - canvas.height;
            const maximumY = viewportHeight - visibleY;
            this.translateX = clamp(this.translateX, minimumX, maximumX);
            this.translateY = clamp(this.translateY, minimumY, maximumY);
        }

        _applyTransform() {
            if (!this.canvas) return;
            this._clampTranslation();
            this.canvas.style.transform = `translate3d(${this.translateX}px, ${this.translateY}px, 0) scale(${this.scale})`;
            if (this.zoomLabel) this.zoomLabel.textContent = `${Math.round(this.scale * 100)}%`;
            if (this.zoomOutButton) this.zoomOutButton.disabled = this.scale <= MIN_SCALE + 0.001;
            if (this.zoomInButton) this.zoomInButton.disabled = this.scale >= MAX_SCALE - 0.001;
        }

        focusFrame(sourceIndex) {
            if (!this.active || !this.source) return false;
            const target = Array.from(this.source.childNodes)[sourceIndex] || this.source.firstElementChild;
            this.deactivate();
            if (!target || target.nodeType !== 1) return true;
            this.window?.requestAnimationFrame?.(() => {
                target.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
                target.classList.add('microfiche-focus-target');
                this.window?.setTimeout?.(() => target.classList.remove('microfiche-focus-target'), 1400);
            });
            return true;
        }

        _discardActiveState() {
            this.window?.removeEventListener?.('resize', this._boundResize);
            this.window?.removeEventListener?.('mousemove', this._boundMouseMove);
            this.window?.removeEventListener?.('mouseup', this._boundMouseUp);
            if (this._resizeFrame && this.window?.cancelAnimationFrame) {
                this.window.cancelAnimationFrame(this._resizeFrame);
            }
            this._resizeFrame = null;
            this.active = false;
            this.source = null;
            this.shell = null;
            this.viewport = null;
            this.canvas = null;
            this.grid = null;
            this.zoomLabel = null;
            this.zoomOutButton = null;
            this.zoomInButton = null;
            this._panSession = null;
            this._gestureSession = null;
            this._suppressFrameClick = false;
            this.previewContent?.classList.remove('microfiche-active');
            this._setScrollSyncDisabled(false);
            this._setCompanionControlsHidden(false);
        }

        _setScrollSyncDisabled(disabled) {
            const button = this.document?.getElementById('preview-scroll-sync-btn');
            if (!button) return;
            button.disabled = Boolean(disabled);
            button.setAttribute('aria-disabled', String(Boolean(disabled)));
        }

        _setCompanionControlsHidden(hidden) {
            this.document?.getElementById('preview-zoom-controls')?.classList.toggle(
                'nightowl-ui-hidden',
                Boolean(hidden)
            );
        }

        _setButtonState(metrics = {}) {
            if (!this.button) return;
            this.button.hidden = !this.eligible;
            this.button.disabled = !this.eligible;
            this.button.classList.toggle('active', this.active);
            this.button.setAttribute('aria-pressed', String(this.active));
            let label = this.active ? 'Exit microfiche overview' : 'Show microfiche overview';
            if (!this.eligible && (metrics.textLength || metrics.blockCount)) {
                label = 'Microfiche overview is available for longer documents';
            }
            this.button.title = label;
            this.button.dataset.tooltip = label;
            this.button.setAttribute('aria-label', label);
        }

        _dispatch(name, detail) {
            if (!this.window?.dispatchEvent || !this.window?.CustomEvent) return;
            this.window.dispatchEvent(new this.window.CustomEvent(name, { detail }));
        }
    }

    const api = {
        MIN_BLOCK_COUNT,
        MIN_TEXT_LENGTH,
        MAX_SCALE,
        MIN_SCALE,
        PreviewMicrofiche,
        TARGET_PAGE_WEIGHT,
        ZOOM_STEP,
        clamp,
        contentWeight,
        paginateNodes,
        stripCloneIdentity,
        wheelShouldZoom
    };

    if (moduleOptions.autoInitialize && root?.document) {
        root.previewMicrofiche = new PreviewMicrofiche();
        const initialize = () => root.previewMicrofiche.initialize();
        if (root.document.readyState === 'loading') {
            root.document.addEventListener('DOMContentLoaded', initialize, { once: true });
        } else {
            initialize();
        }
    }

    return api;
});
