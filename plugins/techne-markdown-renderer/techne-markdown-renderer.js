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

    // Create renderer extensions for marked v13+ (using marked.use() API)
    const createRendererExtensions = ({ baseDir } = {}) => {
        return {
            renderer: {
                // Heading with auto-generated IDs
                heading({ text, depth, raw }) {
                    const id = `heading-${slugify(raw || text)}`;
                    if (id === 'heading-') {
                        return `<h${depth}>${text}</h${depth}>\n`;
                    }
                    return `<h${depth} id="${id}">${text}</h${depth}>\n`;
                },

                // Image with baseDir resolution
                image({ href, title, text }) {
                    const resolved = resolveImageHref(href, { baseDir });
                    const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
                    return `<img src="${escapeHtml(resolved)}" alt="${escapeHtml(text || '')}"${titleAttr} />`;
                }
                // Note: list/listitem use default marked rendering; classes added via addListClasses post-processing
            }
        };
    };

    // Post-process HTML to add custom classes to lists
    const addListClasses = (html) => {
        return html
            .replace(/<ul>/g, '<ul class="markdown-list">')
            .replace(/<ol>/g, '<ol class="markdown-list">')
            .replace(/<ol start=/g, '<ol class="markdown-list" start=')
            .replace(/<li>/g, '<li class="markdown-list-item">');
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

        // For marked v13+, use marked.use() with renderer extensions
        if (markedApi.use) {
            const extensions = createRendererExtensions(options);
            markedApi.use({
                ...extensions,
                gfm: true,
                breaks: true,
            });
        }

        let html = markedApi.parse(processed);

        // Add custom classes to lists (post-processing since marked v13+ tokens don't have body)
        html = addListClasses(html);

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

