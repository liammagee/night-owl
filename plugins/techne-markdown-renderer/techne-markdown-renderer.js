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

    // === Footnote Processing ===
    // Supports standard Markdown footnote syntax:
    //   Inline reference: [^id]
    //   Definition: [^id]: Footnote content here
    //   Multi-line definitions (indented continuation lines)

    /**
     * Extract footnote definitions from markdown source.
     * Returns { body, footnotes } where body has definitions removed
     * and footnotes is a Map<id, htmlContent>.
     */
    const extractFootnoteDefinitions = (markdown) => {
        const footnotes = new Map();
        // Match [^id]: content, including continuation lines (indented by 2+ spaces or tab)
        const defPattern = /^\[\^([^\]]+)\]:\s*([\s\S]*?)(?=\n(?:\[\^[^\]]+\]:|\S)|\n*$)/gm;

        // Two-pass: first collect multi-line definitions properly
        const lines = markdown.split('\n');
        let body = '';
        let currentId = null;
        let currentContent = '';
        let skipLines = false;

        const flushFootnote = () => {
            if (currentId !== null) {
                footnotes.set(currentId, currentContent.trim());
                currentId = null;
                currentContent = '';
            }
        };

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const defMatch = line.match(/^\[\^([^\]]+)\]:\s*(.*)/);

            if (defMatch) {
                flushFootnote();
                currentId = defMatch[1];
                currentContent = defMatch[2];
                skipLines = true;
            } else if (skipLines && (line.startsWith('    ') || line.startsWith('\t') || line.trim() === '')) {
                // Continuation of current footnote definition
                if (currentId !== null) {
                    currentContent += '\n' + (line.startsWith('    ') ? line.slice(4) : line.startsWith('\t') ? line.slice(1) : line);
                }
            } else {
                flushFootnote();
                skipLines = false;
                body += line + '\n';
            }
        }
        flushFootnote();

        return { body, footnotes };
    };

    /**
     * Replace [^id] inline references with superscript links and
     * append a footnotes section at the end.
     */
    const renderFootnotes = (html, footnotes, markedApi) => {
        if (!footnotes || footnotes.size === 0) return html;

        // Track which footnotes are actually referenced and assign numbers
        const referencedOrder = [];
        const refNumberMap = new Map();

        // Replace inline [^id] with superscript links
        // In the HTML, marked may have rendered [^id] as literal text or inside <p> tags
        const processed = html.replace(/\[\^([^\]]+)\]/g, (match, id) => {
            if (!footnotes.has(id)) return match;

            if (!refNumberMap.has(id)) {
                referencedOrder.push(id);
                refNumberMap.set(id, referencedOrder.length);
            }
            const num = refNumberMap.get(id);
            return `<sup class="footnote-ref"><a href="#fn-${id}" id="fnref-${id}" title="Footnote ${num}">${num}</a></sup>`;
        });

        if (referencedOrder.length === 0) return html;

        // Build footnotes section
        const items = referencedOrder.map(id => {
            const num = refNumberMap.get(id);
            let content = footnotes.get(id) || '';

            // Parse footnote content through marked for inline formatting
            if (markedApi?.parseInline) {
                content = markedApi.parseInline(content);
            } else if (markedApi?.parse) {
                // Fallback: full parse, strip wrapping <p> tags
                content = markedApi.parse(content).replace(/^<p>([\s\S]*)<\/p>\s*$/, '$1');
            }

            return `<li id="fn-${id}" class="footnote-item"><span class="footnote-content">${content}</span> <a href="#fnref-${id}" class="footnote-backref" title="Back to reference ${num}">↩</a></li>`;
        });

        const footnotesHtml = `
<section class="footnotes-section" role="doc-endnotes">
    <hr class="footnotes-separator">
    <ol class="footnotes-list">
        ${items.join('\n        ')}
    </ol>
</section>`;

        return processed + footnotesHtml;
    };

    /**
     * CSS for footnote rendering
     */
    const getFootnoteCSS = () => `
/* Footnote Styles */
.footnote-ref a {
    color: var(--primary, #6366f1);
    text-decoration: none;
    font-size: 0.75em;
    vertical-align: super;
    line-height: 0;
    padding: 0 1px;
}

.footnote-ref a:hover {
    text-decoration: underline;
}

.footnotes-section {
    margin-top: 2em;
    font-size: 0.9em;
    color: var(--text-secondary, #475569);
}

.footnotes-separator {
    border: none;
    border-top: 1px solid var(--border-color, #e2e8f0);
    margin-bottom: 1em;
}

.footnotes-list {
    padding-left: 1.5em;
    margin: 0;
}

.footnote-item {
    margin-bottom: 0.5em;
    line-height: 1.5;
}

.footnote-backref {
    color: var(--primary, #6366f1);
    text-decoration: none;
    font-size: 0.85em;
    margin-left: 0.25em;
}

.footnote-backref:hover {
    text-decoration: underline;
}

/* Dark mode */
body.dark-mode .footnotes-section {
    color: var(--text-secondary, #a1a1aa);
}

body.dark-mode .footnotes-separator {
    border-top-color: var(--border-color, #3f3f46);
}
`;

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

        // Extract footnote definitions before marked parsing
        const { body: bodyWithoutFootnotes, footnotes } = extractFootnoteDefinitions(processed);

        // Configure marked once, update baseDir per render
        _currentBaseDir = options.baseDir || '';
        if (markedApi.use) {
            setupMarkedOnce(markedApi);
        }

        let html = markedApi.parse(bodyWithoutFootnotes);

        // Add custom classes to lists (post-processing since marked v13+ tokens don't have body)
        html = addListClasses(html);

        // Render footnote references and section
        html = renderFootnotes(html, footnotes, markedApi);

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
        renderPreview,
        getFootnoteCSS,
        // Exposed for testing
        _extractFootnoteDefinitions: extractFootnoteDefinitions,
        _renderFootnotes: renderFootnotes
    };
})();

