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

    // Post-process HTML to add custom classes to lists
    const addListClasses = (html) => {
        return html
            .replace(/<ul>/g, '<ul class="markdown-list">')
            .replace(/<ol>/g, '<ol class="markdown-list">')
            .replace(/<ol start=/g, '<ol class="markdown-list" start=')
            .replace(/<li>/g, '<li class="markdown-list-item">');
    };

    // Strip YAML frontmatter and return { body, meta } where meta has title/author/date
    const stripFrontmatter = (content) => {
        const str = typeof content === 'string' ? content : String(content || '');
        const match = str.match(/^(\uFEFF?\s*---\r?\n)([\s\S]*?\r?\n)(---\r?\n)/);
        if (!match) return { body: str, meta: null };

        const yaml = match[2];
        const body = str.slice(match[0].length);
        const meta = {};
        for (const line of yaml.split(/\r?\n/)) {
            const kv = line.match(/^(\w[\w-]*)\s*:\s*(.+)$/);
            if (kv) {
                meta[kv[1].toLowerCase()] = kv[2].replace(/^["']|["']$/g, '').trim();
            }
        }
        return { body, meta };
    };

    const renderFrontmatterHeader = (meta) => {
        if (!meta) return '';
        const parts = [];
        if (meta.title) {
            parts.push(`<h1 class="frontmatter-title" style="margin-bottom: 0.2em;">${escapeHtml(meta.title)}</h1>`);
        }
        const sub = [meta.author, meta.date].filter(Boolean).map(escapeHtml).join(' &mdash; ');
        if (sub) {
            parts.push(`<p class="frontmatter-meta" style="color: #666; font-style: italic; margin-top: 0;">${sub}</p>`);
        }
        if (parts.length) {
            parts.push('<hr>');
        }
        return parts.join('\n');
    };

    const processMarkdownContent = (markdownContent, { processAnnotations } = {}) => {
        let processed = typeof markdownContent === 'string' ? markdownContent : String(markdownContent || '');

        if (typeof processAnnotations === 'function') {
            processed = processAnnotations(processed);
        }

        processed = processSpeakerNotes(processed);
        return processed;
    };

    // Track current baseDir for image resolution (updated per render)
    let _currentBaseDir = '';
    let _markedConfigured = false;

    const setupMarkedOnce = (markedApi) => {
        if (_markedConfigured) return;
        _markedConfigured = true;
        markedApi.use({
            renderer: {
                heading(token) {
                    const text = token.text;
                    const depth = token.depth;
                    const raw = token.raw;
                    const headingText = text != null ? text : (raw || '').replace(/^#+\s*/, '').trim();
                    const id = `heading-${slugify(raw || headingText)}`;
                    if (id === 'heading-') {
                        return `<h${depth}>${headingText}</h${depth}>\n`;
                    }
                    return `<h${depth} id="${id}">${headingText}</h${depth}>\n`;
                },
                image({ href, title, text }) {
                    const resolved = resolveImageHref(href, { baseDir: _currentBaseDir });
                    const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
                    return `<img src="${escapeHtml(resolved)}" alt="${escapeHtml(text || '')}"${titleAttr} />`;
                }
            },
            gfm: true,
            breaks: true,
        });
    };

    const renderToHtml = async (markdownContent, options = {}) => {
        const markedApi = getMarked();
        if (!markedApi?.parse) {
            return `<pre>${escapeHtml(markdownContent)}</pre>`;
        }

        // Strip YAML frontmatter before markdown parsing
        const { body, meta } = stripFrontmatter(markdownContent);
        const headerHtml = renderFrontmatterHeader(meta);

        const processed = processMarkdownContent(body, options);

        // Configure marked once, update baseDir per render
        _currentBaseDir = options.baseDir || '';
        if (markedApi.use) {
            setupMarkedOnce(markedApi);
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

        return headerHtml + html;
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

