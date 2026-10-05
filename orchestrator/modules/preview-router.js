/**
 * Classifies files and coordinates preview routing. Rendering remains injected
 * so this module is deterministic and testable without a DOM.
 */
(function (root, factory) {
    const api = factory();
    if (root) root.NightOwlPreviewRouter = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : null, function createModule() {
    'use strict';

    const IMAGE_RE = /\.(?:png|jpe?g|gif|bmp|svg|webp|ico)$/i;

    function classifyFilePath(filePath) {
        const path = String(filePath || '');
        const lower = path.toLowerCase();
        const isPDF = lower.endsWith('.pdf');
        const isPPTX = lower.endsWith('.pptx');
        const isImage = IMAGE_RE.test(lower);
        const isHTML = /\.html?$/.test(lower);
        const isJSONL = lower.endsWith('.jsonl');
        const isCSV = lower.endsWith('.csv');
        const isBibTeX = lower.endsWith('.bib');
        const isMarkdown = lower.endsWith('.md') || lower.endsWith('.markdown');
        const isStructuredRecord = isJSONL || isCSV;
        const isBinaryPreview = isPDF || isPPTX || isImage;

        let kind = 'text';
        if (isPDF) kind = 'pdf';
        else if (isPPTX) kind = 'pptx';
        else if (isImage) kind = 'image';
        else if (isHTML) kind = 'html';
        else if (isJSONL) kind = 'jsonl';
        else if (isCSV) kind = 'csv';
        else if (isBibTeX) kind = 'bibtex';
        else if (isMarkdown) kind = 'markdown';

        return {
            path,
            kind,
            isPDF,
            isPPTX,
            isImage,
            isHTML,
            isJSONL,
            isCSV,
            isBibTeX,
            isMarkdown,
            isStructuredRecord,
            isBinaryPreview,
            isEditable: !isPDF && !isPPTX && !isImage
        };
    }

    function createPreviewRouter(options = {}) {
        const transitions = options.transitions;
        if (!transitions?.begin || !transitions?.complete || !transitions?.fail) {
            throw new TypeError('A file-transition coordinator is required');
        }
        const getCurrentFilePath = options.getCurrentFilePath || (() => '');
        const isFileTransitionCurrent = options.isFileTransitionCurrent || (() => true);
        const getSourceViewState = options.getSourceViewState || (() => null);
        const mirrorSource = options.mirrorSource || (() => {});
        const renderRecord = options.renderRecord || (() => false);
        const deactivateRecord = options.deactivateRecord || (() => {});
        const renderHTML = options.renderHTML || (() => {});
        const renderMarkdown = options.renderMarkdown;
        const onBlocked = options.onBlocked || (() => {});
        const onError = options.onError || (() => {});
        if (typeof renderMarkdown !== 'function') throw new TypeError('renderMarkdown must be a function');

        async function render(rawContent, renderOptions = {}) {
            let content = typeof rawContent === 'string' ? rawContent : String(rawContent || '');
            if (!content && renderOptions.useEditorFallback) {
                content = String(options.getEditorContent?.() || '');
            }

            const filePath = renderOptions.filePath ?? getCurrentFilePath() ?? '';
            const classification = classifyFilePath(filePath);
            const transition = renderOptions.previewTransition || transitions.begin(
                'preview',
                filePath,
                {
                    fileTransitionId: renderOptions.fileTransition?.id || null,
                    correlationId: renderOptions.correlationId || renderOptions.fileTransition?.correlationId || null
                }
            );
            const isCurrent = () => (
                transition.isCurrent() &&
                isFileTransitionCurrent(renderOptions.fileTransition) &&
                (renderOptions.allowPathMismatch || filePath === (getCurrentFilePath() || ''))
            );

            try {
                if (!isCurrent()) return transition.done;

                const sourceState = getSourceViewState();
                if (sourceState?.sourceView && !sourceState.sourceFilePath) {
                    transition.commit(() => mirrorSource(content));
                }

                if (classification.isBinaryPreview && !renderOptions.force) {
                    transitions.supersede('preview', 'file-scoped-preview-policy');
                    onBlocked({ filePath, classification, transition });
                    return transition.done;
                }

                if (classification.isStructuredRecord) {
                    const handled = transition.commit(() => renderRecord(filePath, content, classification));
                    if (handled.committed && handled.value) {
                        return transitions.complete(transition, { renderer: 'records' });
                    }
                } else {
                    deactivateRecord();
                }

                if (classification.isHTML) {
                    transition.commit(() => renderHTML(filePath, content));
                    return transitions.complete(transition, { renderer: 'html' });
                }

                const renderer = await renderMarkdown({
                    filePath,
                    content,
                    classification,
                    renderOptions,
                    transition,
                    isCurrent
                });
                if (!isCurrent() || renderer?.status === 'superseded') return transition.done;
                return transitions.complete(transition, {
                    renderer: typeof renderer === 'string' ? renderer : (renderer?.renderer || 'markdown')
                });
            } catch (error) {
                if (!isCurrent()) return transition.done;
                onError({
                    filePath,
                    renderOptions,
                    transition,
                    error,
                    retry: () => render(content, {
                        ...renderOptions,
                        fileTransition: null,
                        previewTransition: null,
                        correlationId: transition.correlationId
                    })
                });
                return transitions.fail(transition, error);
            }
        }

        return { render, classifyFilePath };
    }

    return { IMAGE_RE, classifyFilePath, createPreviewRouter };
});
