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
            this._boundToggle = () => this.toggle();
            this._boundKeydown = event => {
                if (event.key === 'Escape' && this.active) this.deactivate();
            };
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
            hint.textContent = 'Select a frame to return to full-size reading';
            header.append(summary, hint);

            const grid = this.document.createElement('div');
            grid.className = 'microfiche-grid';
            pages.forEach((page, pageIndex) => grid.appendChild(this._createFrame(page, pageIndex)));
            this.shell.append(header, grid);
            this.previewContent.replaceChildren(this.source, this.shell);
            this.previewContent.classList.add('microfiche-active');
            this.previewContent.scrollTop = 0;
            this.active = true;
            this.preferredEnabled = true;
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
            frame.addEventListener('click', focus);
            frame.addEventListener('keydown', event => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                focus();
            });
            return frame;
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
            this.active = false;
            this.source = null;
            this.shell = null;
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
        PreviewMicrofiche,
        TARGET_PAGE_WEIGHT,
        contentWeight,
        paginateNodes,
        stripCloneIdentity
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
