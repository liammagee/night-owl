// Preview markdown helpers extracted from renderer.js.
// This owns fallback markdown preprocessing/render setup; renderer.js still
// coordinates pane state, plugin delegation, scroll sync, and structure updates.
(function() {
    function getMarked() {
        if (typeof window !== 'undefined' && window.marked) return window.marked;
        if (typeof marked !== 'undefined') return marked;
        return null;
    }

    function slugify(text) {
        if (!text) return '';
        return text.toString().toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^\w\-]+/g, '')
            .replace(/\-\-+/g, '-')
            .replace(/^[-]+/, '')
            .replace(/-+$/, '');
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function setupFallbackMarkdownRenderer() {
        const markedLib = getMarked();
        if (!markedLib?.use) return;
        if (typeof window !== 'undefined' && window._fallbackRendererConfigured) return;
        if (typeof window !== 'undefined') {
            window._fallbackRendererConfigured = true;
        }

        markedLib.use({
            renderer: {
                heading(token) {
                    const text = token.text;
                    const depth = token.depth;
                    const raw = token.raw;
                    const headingText = text != null ? text : (raw || '').replace(/^#+\s*/, '').trim();
                    const headingSlugText = (headingText || '')
                        .replace(/<[^>]*>/g, '')
                        .trim();
                    const id = `heading-${slugify(headingSlugText)}`;
                    const headingHtml = this?.parser?.parseInline && Array.isArray(token.tokens)
                        ? this.parser.parseInline(token.tokens)
                        : headingText;
                    if (id === 'heading-') {
                        return `<h${depth}>${headingHtml}</h${depth}>\n`;
                    }
                    return `<h${depth} id="${id}">${headingHtml}</h${depth}>\n`;
                },
                image({ href, title, text }) {
                    const hrefStr = String(href || '');
                    if (
                        hrefStr &&
                        !hrefStr.startsWith('http') &&
                        !hrefStr.startsWith('/') &&
                        !hrefStr.startsWith('file://') &&
                        !hrefStr.startsWith('data:')
                    ) {
                        const baseDir = window.currentFileDirectory || window.appSettings?.workingDirectory;
                        const normalizedHref = hrefStr.replace(/^\.\//, '');
                        const fullPath = `file://${baseDir}/${normalizedHref}`;
                        const titleAttr = title ? ` title="${title}"` : '';
                        return `<img src="${fullPath}" alt="${text || ''}"${titleAttr} />`;
                    }
                    const titleAttr = title ? ` title="${title}"` : '';
                    return `<img src="${hrefStr}" alt="${text || ''}"${titleAttr} />`;
                }
            },
            gfm: true,
            breaks: true
        });
    }

    function renderFrontmatterHeaderFallback(yamlBlock) {
        if (!yamlBlock) return '';
        const meta = {};
        for (const line of yamlBlock.split(/\r?\n/)) {
            const kv = line.match(/^(\w[\w-]*)\s*:\s*(.+)$/);
            if (kv) {
                const val = kv[2].replace(/^["']|["']$/g, '').trim();
                meta[kv[1].toLowerCase()] = val;
            }
        }
        const parts = [];
        if (meta.title) {
            parts.push(`<h1 class="frontmatter-title" style="margin-bottom: 0.2em;">${escapeHtml(meta.title)}</h1>`);
        }
        const sub = [meta.author, meta.date].filter(Boolean).map(escapeHtml).join(' &mdash; ');
        if (sub) {
            parts.push(`<p class="frontmatter-meta" style="color: #666; font-style: italic; margin-top: 0;">${sub}</p>`);
        }
        if (parts.length) parts.push('<hr>');
        return parts.join('\n');
    }

    // Fix headerless table snippets, e.g. |---|---| without a preceding header row.
    function fixHeaderlessTables(markdown) {
        const lines = String(markdown || '').split('\n');
        const result = [];
        const sepRe = /^\|?([\s:]*-{1,}[\s:]*\|)+[\s:]*-{1,}[\s:]*\|?\s*$/;
        const rowRe = /^\|.*\|/;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (sepRe.test(line)) {
                const prev = i > 0 ? result[result.length - 1] : '';
                if (!rowRe.test(prev)) {
                    const cols = line.replace(/^\||\|$/g, '').split('|').length;
                    const header = '| ' + Array(cols).fill(' ').join(' | ') + ' |';
                    result.push(header);
                }
            }
            result.push(line);
        }
        return result.join('\n');
    }

    function processMarkdownContent(markdownContent, dependencies = {}) {
        let processedContent = typeof markdownContent === 'string'
            ? markdownContent
            : (markdownContent || '');

        const annotationProcessor = dependencies.processAnnotations ||
            (typeof window !== 'undefined' && typeof window.processAnnotations === 'function'
                ? window.processAnnotations
                : null);
        if (annotationProcessor) {
            processedContent = annotationProcessor(processedContent);
        }

        const speakerNotesProcessor = dependencies.processSpeakerNotes ||
            (typeof window !== 'undefined' && typeof window.processSpeakerNotes === 'function'
                ? window.processSpeakerNotes
                : null);
        if (speakerNotesProcessor) {
            processedContent = speakerNotesProcessor(processedContent);
        }

        return fixHeaderlessTables(processedContent);
    }

    const BLOCKED_PREVIEW_TAGS = new Set([
        'script',
        'style',
        'object',
        'embed',
        'link',
        'meta',
        'base',
        'form',
        'input',
        'button',
        'textarea',
        'select',
        'option'
    ]);
    const URI_ATTRIBUTES = new Set([
        'href',
        'src',
        'xlink:href',
        'poster',
        'action',
        'formaction'
    ]);
    const ALLOWED_IFRAME_HOSTS = new Set([
        'www.youtube.com',
        'youtube.com',
        'www.youtube-nocookie.com',
        'player.vimeo.com'
    ]);

    function isAllowedDataImage(value) {
        return /^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(String(value || '').trim());
    }

    function isAllowedPreviewUrl(value, tagName, attrName) {
        const raw = String(value || '').trim();
        if (!raw) return true;
        if (raw.startsWith('#') || raw.startsWith('/') || raw.startsWith('./') || raw.startsWith('../')) {
            return true;
        }

        let parsed;
        try {
            parsed = new URL(raw, 'file:///');
        } catch {
            return false;
        }

        const protocol = parsed.protocol.toLowerCase();
        if (attrName === 'href' && (protocol === 'http:' || protocol === 'https:' || protocol === 'file:' || protocol === 'mailto:')) {
            return true;
        }
        if (tagName === 'img' && attrName === 'src') {
            return protocol === 'http:' || protocol === 'https:' || protocol === 'file:' || isAllowedDataImage(raw);
        }
        if (tagName === 'iframe' && attrName === 'src') {
            return protocol === 'https:' && (
                ALLOWED_IFRAME_HOSTS.has(parsed.hostname) ||
                parsed.hostname.endsWith('.zoom.us')
            );
        }

        return protocol === 'http:' || protocol === 'https:' || protocol === 'file:';
    }

    function sanitizeStyleAttribute(element) {
        const style = element.getAttribute('style');
        if (!style) return;
        if (/(?:url\s*\(|expression\s*\(|javascript:|vbscript:)/i.test(style)) {
            element.removeAttribute('style');
        }
    }

    function sanitizePreviewHTML(html) {
        if (typeof document === 'undefined') {
            return String(html || '');
        }

        const template = document.createElement('template');
        template.innerHTML = String(html || '');

        const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_ELEMENT);
        const blocked = [];

        while (walker.nextNode()) {
            const element = walker.currentNode;
            const tagName = element.tagName.toLowerCase();

            if (BLOCKED_PREVIEW_TAGS.has(tagName)) {
                blocked.push(element);
                continue;
            }

            if (tagName === 'iframe') {
                const src = element.getAttribute('src') || '';
                if (!src || !isAllowedPreviewUrl(src, tagName, 'src')) {
                    blocked.push(element);
                    continue;
                }
                element.removeAttribute('srcdoc');
                element.setAttribute('sandbox', element.getAttribute('sandbox') || 'allow-same-origin allow-scripts allow-popups');
                element.setAttribute('referrerpolicy', element.getAttribute('referrerpolicy') || 'no-referrer');
            }

            for (const attr of Array.from(element.attributes)) {
                const attrName = attr.name.toLowerCase();
                if (attrName.startsWith('on') || attrName === 'srcdoc') {
                    element.removeAttribute(attr.name);
                    continue;
                }

                if (URI_ATTRIBUTES.has(attrName) && !isAllowedPreviewUrl(attr.value, tagName, attrName)) {
                    element.removeAttribute(attr.name);
                    continue;
                }

                if (attrName === 'style') {
                    sanitizeStyleAttribute(element);
                }
            }

            if (tagName === 'a' && element.getAttribute('target') === '_blank') {
                element.setAttribute('rel', 'noopener noreferrer');
            }
        }

        blocked.forEach((element) => element.remove());
        return template.innerHTML;
    }

    function setSanitizedHTML(element, html) {
        if (!element) return '';
        const sanitized = sanitizePreviewHTML(html);
        const template = document.createElement('template');
        template.innerHTML = sanitized;
        if (typeof element.replaceChildren === 'function') {
            element.replaceChildren(template.content.cloneNode(true));
        } else {
            while (element.firstChild) {
                element.removeChild(element.firstChild);
            }
            element.appendChild(template.content.cloneNode(true));
        }
        return sanitized;
    }

    const api = {
        setupFallbackMarkdownRenderer,
        renderFrontmatterHeaderFallback,
        fixHeaderlessTables,
        processMarkdownContent,
        sanitizePreviewHTML,
        setSanitizedHTML
    };

    if (typeof window !== 'undefined') {
        window.NightOwlPreviewMarkdown = api;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})();
