(function () {
    if (window.TechneMarkdownRenderer) return;

    const getMarked = () => window.marked || globalThis.marked || null;

    const escapeHtml = (value) =>
        String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

    const slugify = (text) => {
        if (!text) return '';
        return text
            .toString()
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^\w\-]+/g, '')
            .replace(/\-\-+/g, '-')
            .replace(/^[-]+/, '')
            .replace(/-+$/, '');
    };

    const isAbsoluteLike = (href) =>
        /^(https?:|file:|data:|blob:)/i.test(String(href || '')) || String(href || '').startsWith('/');

    const joinPath = (baseDir, rel) => {
        const base = String(baseDir || '').replace(/\/+$/, '');
        const part = String(rel || '').replace(/^\/+/, '');
        return base && part ? `${base}/${part}` : base || part;
    };

    const resolveImageHref = (href, { baseDir } = {}) => {
        const value = String(href || '').trim();
        if (!value || isAbsoluteLike(value)) return href;
        if (!baseDir) return href;

        const joined = joinPath(baseDir, value);
        const isElectron = Boolean(window?.electronAPI?.isElectron);
        if (isElectron && !/^file:\/\//i.test(joined)) {
            const normalized = joined.startsWith('/') ? joined : `/${joined}`;
            return `file://${normalized}`;
        }
        return joined;
    };

    const setSpeakerNotesGlobal = (notes) => {
        try {
            if (typeof currentSpeakerNotes !== 'undefined') {
                currentSpeakerNotes = notes;
                return;
            }
        } catch {
            // ignore
        }
        window.currentSpeakerNotes = notes;
    };

    const processSpeakerNotes = (content) => {
        const speakerNotesRegex = /```notes\n([\s\S]*?)\n```/g;
        const extractedNotes = [];
        let noteIndex = 0;

        const processed = String(content || '').replace(speakerNotesRegex, (_match, notesContent) => {
            const noteId = `speaker-note-${noteIndex}`;
            extractedNotes.push({
                id: noteId,
                content: String(notesContent || '').trim(),
                index: noteIndex
            });
            noteIndex += 1;
            return `<div class="speaker-notes-placeholder" data-note-id="${noteId}" style="display: none;"></div>`;
        });

        setSpeakerNotesGlobal(extractedNotes);
        return processed;
    };

    const createCustomMarkdownRenderer = ({ baseDir } = {}) => {
        const markedApi = getMarked();
        if (!markedApi?.Renderer) return null;

        const renderer = new markedApi.Renderer();
        const originalHeading = typeof renderer.heading === 'function' ? renderer.heading.bind(renderer) : null;
        const originalImage = typeof renderer.image === 'function' ? renderer.image.bind(renderer) : null;
        const originalList = typeof renderer.list === 'function' ? renderer.list.bind(renderer) : null;
        const originalListitem = typeof renderer.listitem === 'function' ? renderer.listitem.bind(renderer) : null;

        renderer.heading = (text, level, raw) => {
            const html = originalHeading
                ? originalHeading(text, level, raw)
                : `<h${level}>${text}</h${level}>\n`;

            const id = `heading-${slugify(raw || text)}`;
            if (id === 'heading-') return html;
            return String(html).replace(/^(<h[1-6])/, `$1 id="${id}"`);
        };

        renderer.image = (href, title, text) => {
            const resolved = resolveImageHref(href, { baseDir });
            if (originalImage) return originalImage(resolved, title, text);
            const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
            return `<img src="${escapeHtml(resolved)}" alt="${escapeHtml(text)}"${titleAttr} />`;
        };

        renderer.list = (body, ordered, start) => {
            if (!originalList) {
                const type = ordered ? 'ol' : 'ul';
                const startAttr = ordered && start !== 1 ? ` start="${start}"` : '';
                return `<${type}${startAttr} class="markdown-list">\n${body}</${type}>\n`;
            }

            const type = ordered ? 'ol' : 'ul';
            const startAttr = ordered && start !== 1 ? ` start="${start}"` : '';
            return `<${type}${startAttr} class="markdown-list">\n${body}</${type}>\n`;
        };

        renderer.listitem = (text, task, checked) => {
            if (task) {
                const checkedAttr = checked ? ' checked=""' : '';
                return `<li class="task-list-item markdown-list-item"><input type="checkbox"${checkedAttr} disabled=""> ${text}</li>\n`;
            }
            if (originalListitem) return `<li class="markdown-list-item">${text}</li>\n`;
            return `<li class="markdown-list-item">${text}</li>\n`;
        };

        return renderer;
    };

    const processMarkdownContent = (markdownContent, { processAnnotations } = {}) => {
        let processed = typeof markdownContent === 'string' ? markdownContent : String(markdownContent || '');

        if (typeof processAnnotations === 'function') {
            processed = processAnnotations(processed);
        }

        processed = processSpeakerNotes(processed);
        return processed;
    };

    const renderToHtml = async (markdownContent, options = {}) => {
        const markedApi = getMarked();
        if (!markedApi?.parse) {
            return `<pre>${escapeHtml(markdownContent)}</pre>`;
        }

        const processed = processMarkdownContent(markdownContent, options);
        const renderer = createCustomMarkdownRenderer(options);

        let html = markedApi.parse(processed, {
            renderer: renderer || undefined,
            gfm: true,
            breaks: true,
            pedantic: false,
            smartLists: true
        });

        if (typeof options.processInternalLinksHTML === 'function') {
            html = await options.processInternalLinksHTML(html);
        }

        const filePath = String(options.filePath || '');
        const isPDF = filePath.toLowerCase().endsWith('.pdf');
        if (!isPDF && options.previewZoom?.onPreviewUpdate && filePath) {
            try {
                html = await options.previewZoom.onPreviewUpdate(filePath, html);
            } catch (err) {
                // best-effort
            }
        }

        return html;
    };

    const renderPreview = async ({
        markdownContent,
        previewElement,
        filePath = '',
        baseDir = '',
        processAnnotations = null,
        processInternalLinksHTML = null,
        previewZoom = window.previewZoom || null,
        renderMathInContent = null,
        renderMermaidDiagrams = null,
        updateSpeakerNotesDisplay = null,
        renderCitations = true
    } = {}) => {
        if (!previewElement) return '';

        let html = await renderToHtml(markdownContent, {
            filePath,
            baseDir,
            processAnnotations,
            processInternalLinksHTML,
            previewZoom
        });

        // Process citations and add bibliography if citation renderer is available
        if (renderCitations && window.TechneCitationRenderer) {
            try {
                html = window.TechneCitationRenderer.renderCitations(html, {
                    includeBibliography: true
                });
            } catch (err) {
                console.warn('[TechneMarkdownRenderer] Citation rendering failed:', err);
            }
        }

        previewElement.innerHTML = html;

        if (typeof renderMathInContent === 'function') {
            await renderMathInContent(previewElement);
        }
        if (typeof renderMermaidDiagrams === 'function') {
            await renderMermaidDiagrams(previewElement);
        }
        if (typeof updateSpeakerNotesDisplay === 'function') {
            updateSpeakerNotesDisplay();
        }

        return html;
    };

    window.TechneMarkdownRenderer = {
        renderToHtml,
        renderPreview
    };
})();

