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

    const processSpeakerNotes = (content, speakerNotesSink = null) => {
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

        if (typeof speakerNotesSink === 'function') {
            speakerNotesSink(extractedNotes);
        } else {
            setSpeakerNotesGlobal(extractedNotes);
        }
        return processed;
    };

    // === Footnote Processing ===
    // Supports standard Markdown footnote syntax:
    //   Inline reference: [^id]
    //   Definition: [^id]: Footnote content here
    //   Multi-line definitions (indented continuation lines)
    //   Pandoc inline footnotes: ^[content here]
    //   Prose inline footnotes: [^content with spaces] (no matching definition)

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
     * Convert inline footnotes to reference-style footnotes.
     * Handles two patterns:
     *   1. Pandoc-style: ^[content here] → [^_fn_N] with auto-generated definition
     *   2. Prose-in-brackets: [^content with spaces] (no matching definition) → [^_fn_N]
     * Must be called after extractFootnoteDefinitions so the footnotes map exists.
     */
    const extractInlineFootnotes = (markdown, footnotes) => {
        let counter = footnotes.size;

        // Bracket-aware content pattern: matches non-bracket chars OR complete [...] pairs
        // Handles one level of nesting (sufficient for citations like [-@key])
        const bracketContent = '((?:[^\\[\\]]*|\\[[^\\]]*\\])*)';

        // 1. Pandoc-style inline footnotes: ^[content] (content may contain [...] pairs)
        const pandocRe = new RegExp('\\^\\[' + bracketContent + '\\]', 'g');
        let processed = markdown.replace(pandocRe, (_match, content) => {
            counter++;
            const autoId = `_fn_${counter}`;
            footnotes.set(autoId, content.trim());
            return `[^${autoId}]`;
        });

        // 2. Prose-in-brackets: [^content with spaces] where no definition exists
        const proseRe = new RegExp('\\[\\^' + bracketContent + '\\]', 'g');
        processed = processed.replace(proseRe, (match, id) => {
            // Skip if a definition already exists (normal reference footnote)
            if (footnotes.has(id)) return match;
            // Only treat as inline footnote if id contains spaces (prose, not a key)
            if (!id.includes(' ')) return match;
            counter++;
            const autoId = `_fn_${counter}`;
            footnotes.set(autoId, id.trim());
            return `[^${autoId}]`;
        });

        return processed;
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

/* Frontmatter Header Styles */
.frontmatter-header {
    margin-bottom: 1.5em;
}

.frontmatter-title {
    margin-bottom: 0.15em;
    line-height: 1.2;
}

.frontmatter-subtitle {
    font-size: 1.25em;
    color: var(--text-secondary, #475569);
    margin-top: 0;
    margin-bottom: 0.5em;
    font-style: italic;
}

.frontmatter-meta {
    color: var(--text-secondary, #666);
    font-style: italic;
    margin-top: 0;
    margin-bottom: 0.75em;
}

.frontmatter-abstract {
    background: var(--bg-secondary, #f8fafc);
    border-left: 3px solid var(--primary, #6366f1);
    padding: 0.75em 1em;
    margin-bottom: 0.75em;
    font-size: 0.95em;
    line-height: 1.6;
    color: var(--text-secondary, #475569);
}

.frontmatter-keywords {
    margin-bottom: 0.75em;
    display: flex;
    flex-wrap: wrap;
    gap: 0.35em;
}

.frontmatter-keyword {
    display: inline-block;
    background: var(--bg-tertiary, #e2e8f0);
    color: var(--text-secondary, #475569);
    padding: 0.1em 0.5em;
    border-radius: 3px;
    font-size: 0.85em;
}

.frontmatter-separator {
    border: none;
    border-top: 1px solid var(--border-color, #e2e8f0);
    margin-top: 0.5em;
}

/* Dark mode */
body.dark-mode .frontmatter-subtitle {
    color: var(--text-secondary, #a1a1aa);
}

body.dark-mode .frontmatter-meta {
    color: var(--text-secondary, #a1a1aa);
}

body.dark-mode .frontmatter-abstract {
    background: var(--bg-secondary, #27272a);
    color: var(--text-secondary, #a1a1aa);
}

body.dark-mode .frontmatter-keyword {
    background: var(--bg-tertiary, #3f3f46);
    color: var(--text-secondary, #a1a1aa);
}

body.dark-mode .frontmatter-separator {
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

    // Strip YAML frontmatter and return { body, meta } where meta has parsed fields.
    // Handles simple values, inline arrays [a, b], block scalars (| / >), and list items (- val).
    const stripFrontmatter = (content) => {
        const str = typeof content === 'string' ? content : String(content || '');
        const match = str.match(/^(\uFEFF?\s*---\r?\n)([\s\S]*?\r?\n)(---\r?\n)/);
        if (!match) return { body: str, meta: null };

        const yaml = match[2];
        const body = str.slice(match[0].length);
        const meta = {};
        const lines = yaml.split(/\r?\n/);
        let currentKey = null;
        let currentBlock = null; // 'scalar' for |/>, 'list' for - items

        const flushBlock = () => {
            if (currentKey && currentBlock === 'scalar' && Array.isArray(meta[currentKey])) {
                meta[currentKey] = meta[currentKey].join('\n').trim();
            }
            currentKey = null;
            currentBlock = null;
        };

        for (const line of lines) {
            // Top-level key: value
            const kv = line.match(/^(\w[\w-]*)\s*:\s*(.*)/);
            if (kv) {
                flushBlock();
                const key = kv[1].toLowerCase();
                let val = kv[2].trim();

                if (val === '|' || val === '>') {
                    // Block scalar — collect indented continuation lines
                    currentKey = key;
                    currentBlock = 'scalar';
                    meta[key] = [];
                } else if (val === '') {
                    // Empty value — may be followed by list items or indented block
                    currentKey = key;
                    currentBlock = 'list';
                    meta[key] = [];
                } else if (val.startsWith('[') && val.endsWith(']')) {
                    // Inline array: [a, b, c]
                    meta[key] = val.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
                } else {
                    meta[key] = val.replace(/^["']|["']$/g, '').trim();
                }
                continue;
            }

            // Indented continuation or list item
            if (currentKey && (line.startsWith('  ') || line.startsWith('\t'))) {
                const trimmed = line.replace(/^\s+/, '');
                if (currentBlock === 'list' && trimmed.startsWith('- ')) {
                    // List item
                    const item = trimmed.slice(2).trim().replace(/^["']|["']$/g, '');
                    if (!Array.isArray(meta[currentKey])) meta[currentKey] = [];
                    meta[currentKey].push(item);
                } else if (currentBlock === 'scalar') {
                    meta[currentKey].push(trimmed);
                } else if (currentBlock === 'list' && trimmed && !trimmed.startsWith('- ')) {
                    // Indented text continuation (treat as scalar block)
                    if (Array.isArray(meta[currentKey]) && meta[currentKey].length === 0) {
                        currentBlock = 'scalar';
                    }
                    meta[currentKey].push(trimmed);
                }
                continue;
            }

            // Blank line inside a block — keep for scalar, ignore otherwise
            if (currentKey && line.trim() === '') {
                if (currentBlock === 'scalar') {
                    meta[currentKey].push('');
                }
                continue;
            }

            flushBlock();
        }
        flushBlock();

        return { body, meta };
    };

    const renderFrontmatterHeader = (meta) => {
        if (!meta) return '';
        const parts = [];

        if (meta.title) {
            parts.push(`<h1 class="frontmatter-title">${escapeHtml(meta.title)}</h1>`);
        }
        if (meta.subtitle) {
            parts.push(`<p class="frontmatter-subtitle">${escapeHtml(meta.subtitle)}</p>`);
        }

        // Author(s) + date line
        const authorStr = Array.isArray(meta.author)
            ? meta.author.map(a => typeof a === 'string' ? a : (a.name || '')).filter(Boolean).join(', ')
            : (meta.author || '');
        const sub = [authorStr, meta.date].filter(Boolean).map(escapeHtml).join(' — ');
        if (sub) {
            parts.push(`<p class="frontmatter-meta">${sub}</p>`);
        }

        // Abstract
        if (meta.abstract) {
            const abstractText = Array.isArray(meta.abstract) ? meta.abstract.join(' ') : meta.abstract;
            parts.push(`<div class="frontmatter-abstract"><strong>Abstract:</strong> ${escapeHtml(abstractText)}</div>`);
        }

        // Keywords
        if (meta.keywords) {
            const kws = Array.isArray(meta.keywords) ? meta.keywords : meta.keywords.split(',').map(s => s.trim());
            if (kws.length > 0) {
                const tags = kws.map(k => `<span class="frontmatter-keyword">${escapeHtml(k)}</span>`).join(' ');
                parts.push(`<div class="frontmatter-keywords">${tags}</div>`);
            }
        }

        if (parts.length) {
            parts.push('<hr class="frontmatter-separator">');
        }
        return parts.length ? `<header class="frontmatter-header">${parts.join('\n')}</header>` : '';
    };

    // Encode Pandoc-style image attributes into the title field.
    // ![alt](url){width=50%} → ![alt](url "|||width=50%")
    // ![alt](url "caption"){width=50% height=200px} → ![alt](url "caption|||width=50% height=200px")
    const ATTR_DELIM = '|||';
    const processImageAttributes = (markdown) => {
        return markdown.replace(
            /!\[([^\]]*)\]\(([^)]+)\)\{([^}]+)\}/g,
            (_match, alt, urlPart, attrs) => {
                const attrStr = attrs.trim();
                const titleMatch = urlPart.match(/^(.*?)\s+"([^"]*)"$/);
                if (titleMatch) {
                    return `![${alt}](${titleMatch[1]} "${titleMatch[2]}${ATTR_DELIM}${attrStr}")`;
                }
                return `![${alt}](${urlPart} "${ATTR_DELIM}${attrStr}")`;
            }
        );
    };

    // Fix headerless table snippets by inserting an empty header row.
    // GFM requires: header row, separator row, data rows. If a separator row
    // (e.g. |---|---|) appears without a preceding header row, prepend one
    // with the correct number of columns so marked parses it as a table.
    const fixHeaderlessTables = (markdown) => {
        const lines = markdown.split('\n');
        const result = [];
        // Matches a GFM table separator: | :?-+:? | :?-+:? | ...
        const sepRe = /^\|?([\s:]*-{1,}[\s:]*\|)+[\s:]*-{1,}[\s:]*\|?\s*$/;
        // Matches a line that looks like a table row (has | delimiters)
        const rowRe = /^\|.*\|/;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (sepRe.test(line)) {
                // Check if previous line is a header row
                const prev = i > 0 ? result[result.length - 1] : '';
                if (!rowRe.test(prev)) {
                    // Count columns from separator
                    const cols = line.replace(/^\||\|$/g, '').split('|').length;
                    const header = '| ' + Array(cols).fill(' ').join(' | ') + ' |';
                    result.push(header);
                }
            }
            result.push(line);
        }
        return result.join('\n');
    };

    const processMarkdownContent = (markdownContent, { processAnnotations, speakerNotesSink } = {}) => {
        let processed = typeof markdownContent === 'string' ? markdownContent : String(markdownContent || '');

        if (typeof processAnnotations === 'function') {
            processed = processAnnotations(processed);
        }

        processed = processSpeakerNotes(processed, speakerNotesSink);
        processed = processImageAttributes(processed);
        processed = fixHeaderlessTables(processed);
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
                    const alt = escapeHtml(text || '');

                    // Extract Pandoc-style attributes encoded in title via |||
                    let displayTitle = title;
                    let styleAttr = '';
                    if (title && title.includes(ATTR_DELIM)) {
                        const [titlePart, attrStr] = title.split(ATTR_DELIM, 2);
                        displayTitle = titlePart || null;
                        const styles = [];
                        (attrStr || '').replace(/([\w-]+)\s*=\s*"?([^"\s}]+)"?/g, (_m, key, val) => {
                            if (key === 'width') styles.push(`width: ${val}`);
                            else if (key === 'height') styles.push(`height: ${val}`);
                            else if (key === 'max-width') styles.push(`max-width: ${val}`);
                        });
                        if (styles.length) styleAttr = ` style="${styles.join('; ')}"`;
                    }

                    const titleHtml = displayTitle ? ` title="${escapeHtml(displayTitle)}"` : '';
                    const img = `<img src="${escapeHtml(resolved)}" alt="${alt}"${titleHtml}${styleAttr} />`;

                    // Wrap in <figure> with caption when display title is provided
                    if (displayTitle) {
                        return `<figure class="md-figure"><div class="md-figure-img">${img}</div><figcaption class="md-figcaption">${escapeHtml(displayTitle)}</figcaption></figure>`;
                    }
                    return img;
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

        // Convert inline footnotes (^[content] and [^prose]) to reference-style
        const bodyWithInlineFootnotes = extractInlineFootnotes(bodyWithoutFootnotes, footnotes);

        // Configure marked once, update baseDir per render
        _currentBaseDir = options.baseDir || '';
        if (markedApi.use) {
            setupMarkedOnce(markedApi);
        }

        let html = markedApi.parse(bodyWithInlineFootnotes);

        // Add custom classes to lists (post-processing since marked v13+ tokens don't have body)
        html = addListClasses(html);

        // Auto-embed YouTube links that are the sole content of a paragraph
        html = html.replace(
            /<p>\s*(?:<a[^>]*>)?\s*https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]+)(?:[^<\s]*)?\s*(?:<\/a>)?\s*<\/p>/gi,
            (match, videoId) => {
                return `<div class="slide-video-wrapper" style="position:relative;width:100%;max-width:720px;margin:1em auto;aspect-ratio:16/9"><iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="position:absolute;top:0;left:0;width:100%;height:100%;border-radius:6px"></iframe></div>`;
            }
        );

        // Auto-embed Zoom meeting/recording links that are the sole content of a paragraph
        html = html.replace(
            /<p>\s*(?:<a[^>]*>)?\s*(https?:\/\/[\w.-]*zoom\.us\/(?:j|rec\/(?:share|play))\/[^\s<]+)\s*(?:<\/a>)?\s*<\/p>/gi,
            (match, url) => {
                return `<div class="slide-video-wrapper" style="position:relative;width:100%;max-width:720px;margin:1em auto;aspect-ratio:16/9"><iframe src="${url}" frameborder="0" allow="microphone; camera; fullscreen" allowfullscreen sandbox="allow-same-origin allow-scripts allow-forms allow-popups" style="position:absolute;top:0;left:0;width:100%;height:100%;border-radius:6px"></iframe></div>`;
            }
        );

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

    const RENDER_CONTRACT = 'nightowl-trusted-markdown-v1';

    const renderTrustedHtml = async ({
        markdownContent,
        filePath = '',
        baseDir = '',
        processAnnotations = null,
        processInternalLinksHTML = null,
        speakerNotesSink = null,
        previewZoom = window.previewZoom || null,
        renderCitations = true
    } = {}) => {
        let html = await renderToHtml(markdownContent, {
            filePath,
            baseDir,
            processAnnotations,
            processInternalLinksHTML,
            speakerNotesSink,
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

        const security = window.NightOwlPreviewMarkdown || window.NightOwlContentSecurity;
        if (security?.sanitizePreviewHTML) {
            html = security.sanitizePreviewHTML(html, { baseDir });
        } else if (security?.sanitizeRenderedHTML) {
            html = security.sanitizeRenderedHTML(html, { baseDir });
        } else {
            html = escapeHtml(html);
        }

        return Object.freeze({ html, contract: RENDER_CONTRACT });
    };

    const renderPreview = async ({
        markdownContent,
        previewElement,
        filePath = '',
        baseDir = '',
        processAnnotations = null,
        processInternalLinksHTML = null,
        speakerNotesSink = null,
        previewZoom = window.previewZoom || null,
        renderMathInContent = null,
        renderMermaidDiagrams = null,
        updateSpeakerNotesDisplay = null,
        renderCitations = true
    } = {}) => {
        if (!previewElement) return '';

        const rendered = await renderTrustedHtml({
            markdownContent,
            filePath,
            baseDir,
            processAnnotations,
            processInternalLinksHTML,
            speakerNotesSink,
            previewZoom,
            renderCitations
        });
        const html = rendered.html;

        if (window.NightOwlPreviewMarkdown?.setSanitizedHTML) {
            window.NightOwlPreviewMarkdown.setSanitizedHTML(previewElement, html);
        } else if (window.NightOwlContentSecurity?.setSanitizedHTML) {
            window.NightOwlContentSecurity.setSanitizedHTML(previewElement, html);
        } else {
            // The sanitizer is a required security boundary. If startup order
            // is incomplete, show inert source rather than briefly mounting
            // active markup before the preview helper arrives.
            previewElement.textContent = html;
        }

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
        RENDER_CONTRACT,
        renderToHtml,
        renderTrustedHtml,
        renderPreview,
        getFootnoteCSS,
        // Exposed for testing
        _extractFootnoteDefinitions: extractFootnoteDefinitions,
        _extractInlineFootnotes: extractInlineFootnotes,
        _renderFootnotes: renderFootnotes,
        _stripFrontmatter: stripFrontmatter,
        _renderFrontmatterHeader: renderFrontmatterHeader,
        _processImageAttributes: processImageAttributes
    };
})();
