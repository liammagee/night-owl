/**
 * Citation Renderer for Techne Markdown Renderer
 *
 * Processes [@citation-key] patterns in markdown and renders them as
 * formatted inline citations with a bibliography section at the end.
 *
 * Supports:
 * - Single citations: [@smith2023]
 * - Multiple citations: [@smith2023; @jones2024]
 * - Citations with page numbers: [@smith2023, p. 42]
 * - Citations with prefixes: [see @smith2023]
 * - Citations with suffixes: [@smith2023, emphasis added]
 *
 * Features lazy caching for performance in multi-user web contexts.
 */
(function() {
    if (window.TechneCitationRenderer) return;

    // === Citation Cache ===
    // Caches rendered HTML to avoid re-processing unchanged content
    const cache = {
        entries: new Map(),  // Map<cacheKey, { html, timestamp, citedKeys }>
        maxEntries: 100,     // Max cache entries (LRU eviction)
        maxAge: 5 * 60 * 1000, // Cache TTL: 5 minutes
        bibEntriesVersion: 0   // Incremented when bibEntries changes
    };

    /**
     * Simple hash function for cache keys
     */
    function hashContent(content) {
        let hash = 0;
        for (let i = 0; i < content.length; i++) {
            const char = content.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return hash.toString(36);
    }

    /**
     * Generate a cache key from content, style, and bibEntries version
     */
    function getCacheKey(html, options = {}) {
        const contentHash = hashContent(html);
        const styleKey = currentStyle;
        const bibVersion = cache.bibEntriesVersion;
        const includeBib = options.includeBibliography !== false ? '1' : '0';
        return `${contentHash}-${styleKey}-${bibVersion}-${includeBib}`;
    }

    /**
     * Get cached result if valid
     */
    function getFromCache(key) {
        const entry = cache.entries.get(key);
        if (!entry) return null;

        // Check if expired
        if (Date.now() - entry.timestamp > cache.maxAge) {
            cache.entries.delete(key);
            return null;
        }

        return entry;
    }

    /**
     * Store result in cache with LRU eviction
     */
    function setInCache(key, html, citedKeys) {
        // LRU eviction if at capacity
        if (cache.entries.size >= cache.maxEntries) {
            const oldestKey = cache.entries.keys().next().value;
            cache.entries.delete(oldestKey);
        }

        cache.entries.set(key, {
            html,
            citedKeys,
            timestamp: Date.now()
        });
    }

    /**
     * Invalidate cache (call when bibEntries changes)
     */
    function invalidateCache() {
        cache.bibEntriesVersion++;
        cache.entries.clear();
        console.log('[TechneCitationRenderer] Cache invalidated, version:', cache.bibEntriesVersion);
    }

    /**
     * Clear expired entries from cache
     */
    function pruneCache() {
        const now = Date.now();
        for (const [key, entry] of cache.entries) {
            if (now - entry.timestamp > cache.maxAge) {
                cache.entries.delete(key);
            }
        }
    }

    /**
     * Get cache statistics (for debugging)
     */
    function getCacheStats() {
        return {
            size: cache.entries.size,
            maxEntries: cache.maxEntries,
            version: cache.bibEntriesVersion,
            maxAge: cache.maxAge
        };
    }

    // Citation styles
    const STYLES = {
        apa: {
            name: 'APA 7th',
            inline: (entry, suffix) => {
                const authors = formatAuthorsInline(entry.author, 'apa');
                const year = entry.year || 'n.d.';
                const suffixStr = suffix ? `, ${suffix}` : '';
                return `(${authors}, ${year}${suffixStr})`;
            },
            bibliography: (entry) => {
                const authors = formatAuthorsBib(entry.author, 'apa');
                const year = entry.year ? `(${entry.year})` : '(n.d.)';
                const title = entry.title || 'Untitled';
                const journal = entry.journal ? `<em>${entry.journal}</em>` : '';
                const volume = entry.volume || '';
                const issue = entry.issue ? `(${entry.issue})` : '';
                const pages = entry.pages ? `, ${entry.pages}` : '';
                const doi = entry.doi ? ` https://doi.org/${entry.doi}` : '';
                const url = !entry.doi && entry.url ? ` ${entry.url}` : '';

                if (entry.type === 'book') {
                    const publisher = entry.publisher || '';
                    return `${authors} ${year}. <em>${title}</em>. ${publisher}${doi}${url}`;
                }

                return `${authors} ${year}. ${title}. ${journal}${volume ? `, ${volume}` : ''}${issue}${pages}.${doi}${url}`;
            }
        },
        chicago: {
            name: 'Chicago',
            inline: (entry, suffix) => {
                const authors = formatAuthorsInline(entry.author, 'chicago');
                const year = entry.year || 'n.d.';
                const suffixStr = suffix ? `, ${suffix}` : '';
                return `(${authors} ${year}${suffixStr})`;
            },
            bibliography: (entry) => {
                const authors = formatAuthorsBib(entry.author, 'chicago');
                const title = entry.title || 'Untitled';
                const year = entry.year || 'n.d.';
                const journal = entry.journal ? `<em>${entry.journal}</em>` : '';
                const volume = entry.volume || '';
                const pages = entry.pages ? `: ${entry.pages}` : '';
                const doi = entry.doi ? ` https://doi.org/${entry.doi}` : '';

                if (entry.type === 'book') {
                    const publisher = entry.publisher || '';
                    const location = entry.location || '';
                    return `${authors}. <em>${title}</em>. ${location ? `${location}: ` : ''}${publisher}, ${year}.${doi}`;
                }

                return `${authors}. "${title}." ${journal} ${volume}${pages} (${year}).${doi}`;
            }
        }
    };

    // Current style (default to APA)
    let currentStyle = 'apa';

    /**
     * Format author names for inline citation
     */
    function formatAuthorsInline(authorStr, style) {
        if (!authorStr) return 'Unknown';

        const authors = parseAuthors(authorStr);
        if (authors.length === 0) return 'Unknown';

        if (authors.length === 1) {
            return authors[0].last;
        } else if (authors.length === 2) {
            return `${authors[0].last} & ${authors[1].last}`;
        } else {
            return `${authors[0].last} et al.`;
        }
    }

    /**
     * Format author names for bibliography
     */
    function formatAuthorsBib(authorStr, style) {
        if (!authorStr) return 'Unknown';

        const authors = parseAuthors(authorStr);
        if (authors.length === 0) return 'Unknown';

        if (style === 'apa') {
            if (authors.length === 1) {
                return `${authors[0].last}, ${authors[0].first ? authors[0].first.charAt(0) + '.' : ''}`;
            } else if (authors.length === 2) {
                return `${authors[0].last}, ${authors[0].first ? authors[0].first.charAt(0) + '.' : ''}, & ${authors[1].last}, ${authors[1].first ? authors[1].first.charAt(0) + '.' : ''}`;
            } else {
                const firstAuthor = `${authors[0].last}, ${authors[0].first ? authors[0].first.charAt(0) + '.' : ''}`;
                return `${firstAuthor}, et al.`;
            }
        }

        // Chicago style
        if (authors.length === 1) {
            return `${authors[0].last}, ${authors[0].first || ''}`;
        } else {
            const names = authors.map((a, i) => {
                if (i === 0) return `${a.last}, ${a.first || ''}`;
                return `${a.first || ''} ${a.last}`;
            });
            const last = names.pop();
            return `${names.join(', ')}, and ${last}`;
        }
    }

    /**
     * Parse author string into structured format
     */
    function parseAuthors(authorStr) {
        if (!authorStr) return [];

        // Handle "and" separated authors
        const parts = authorStr.split(/\s+and\s+/i);

        return parts.map(part => {
            part = part.trim();
            // Handle "Last, First" format
            if (part.includes(',')) {
                const [last, first] = part.split(',').map(s => s.trim());
                return { last, first };
            }
            // Handle "First Last" format
            const words = part.split(/\s+/);
            if (words.length >= 2) {
                return { first: words.slice(0, -1).join(' '), last: words[words.length - 1] };
            }
            return { last: part, first: '' };
        });
    }

    /**
     * Get citation entry by key from global bibEntries
     */
    function getEntry(key) {
        const entries = window.bibEntries || [];
        return entries.find(e => e.key === key || e.id === key);
    }

    /**
     * Parse a citation reference like [@smith2023, p. 42]
     * Returns { key, prefix, suffix }
     */
    function parseCitationRef(ref) {
        // Remove @ prefix
        ref = ref.replace(/^@/, '');

        // Check for suffix (after comma)
        const commaIndex = ref.indexOf(',');
        if (commaIndex > 0) {
            return {
                key: ref.substring(0, commaIndex).trim(),
                suffix: ref.substring(commaIndex + 1).trim()
            };
        }

        return { key: ref.trim(), suffix: '' };
    }

    /**
     * Process citation patterns in markdown content
     * Returns { html, citedKeys }
     */
    function processCitations(html) {
        const citedKeys = new Set();

        // Match citation patterns: [@key], [@key, suffix], [prefix @key], [@key1; @key2]
        // Also match patterns like: [@-key] which should render the author name inline
        const citationPattern = /\[((?:[^@\]]*)?@[\w\-]+(?:,\s*[^\]]*)?(?:\s*;\s*(?:[^@\]]*)?@[\w\-]+(?:,\s*[^\]]*)?)*)\]/g;

        const processedHtml = html.replace(citationPattern, (match, content) => {
            const style = STYLES[currentStyle];

            // Handle multiple citations separated by semicolons
            const refs = content.split(/\s*;\s*/);
            const citations = [];

            for (const ref of refs) {
                // Extract prefix (text before @)
                const atIndex = ref.indexOf('@');
                const prefix = atIndex > 0 ? ref.substring(0, atIndex).trim() : '';
                const afterAt = ref.substring(atIndex + 1);

                // Check for author-only citation (starts with -)
                const authorOnly = afterAt.startsWith('-');
                const citationRef = authorOnly ? afterAt.substring(1) : afterAt;

                const { key, suffix } = parseCitationRef(citationRef);
                const entry = getEntry(key);

                if (entry) {
                    citedKeys.add(key);

                    if (authorOnly) {
                        // Render just author name (for "Smith (2023) argues...")
                        const authors = formatAuthorsInline(entry.author, currentStyle);
                        citations.push(`${prefix}${authors}`);
                    } else {
                        const inlineCite = style.inline(entry, suffix);
                        // Remove outer parentheses for combining
                        const inner = inlineCite.replace(/^\(/, '').replace(/\)$/, '');
                        citations.push(`${prefix}${inner}`);
                    }
                } else {
                    // Unknown citation - render as-is with warning style
                    citations.push(`<span class="citation-unknown">@${key}</span>`);
                }
            }

            // Combine citations
            if (citations.some(c => c.includes('citation-unknown'))) {
                return `<span class="citation">${citations.join('; ')}</span>`;
            }

            return `<span class="citation">(${citations.join('; ')})</span>`;
        });

        return { html: processedHtml, citedKeys: Array.from(citedKeys) };
    }

    /**
     * Generate bibliography HTML for cited entries
     */
    function generateBibliography(citedKeys) {
        if (!citedKeys || citedKeys.length === 0) return '';

        const style = STYLES[currentStyle];
        const entries = citedKeys
            .map(key => getEntry(key))
            .filter(e => e)
            .sort((a, b) => {
                // Sort by author last name, then year
                const aAuthor = (a.author || '').toLowerCase();
                const bAuthor = (b.author || '').toLowerCase();
                if (aAuthor !== bAuthor) return aAuthor.localeCompare(bAuthor);
                return (a.year || '').localeCompare(b.year || '');
            });

        if (entries.length === 0) return '';

        const items = entries.map(entry => {
            const formatted = style.bibliography(entry);
            return `<li class="bibliography-item" data-key="${entry.key || entry.id}">${formatted}</li>`;
        }).join('\n');

        return `
<div class="bibliography-section">
    <h2 class="bibliography-heading">References</h2>
    <ol class="bibliography-list">
        ${items}
    </ol>
</div>`;
    }

    /**
     * Process HTML content: replace citations and append bibliography
     * Uses caching for performance - results are cached by content hash
     */
    function renderCitations(html, options = {}) {
        const { includeBibliography = true, useCache = true } = options;

        // Check if we have any citations to process
        if (!html.includes('[@')) {
            return html;
        }

        // Check cache first
        if (useCache) {
            const cacheKey = getCacheKey(html, options);
            const cached = getFromCache(cacheKey);
            if (cached) {
                console.log('[TechneCitationRenderer] Cache hit');
                return cached.html;
            }
        }

        // Process citations
        const { html: processedHtml, citedKeys } = processCitations(html);

        let result;
        if (includeBibliography && citedKeys.length > 0) {
            const bibliography = generateBibliography(citedKeys);
            result = processedHtml + bibliography;
        } else {
            result = processedHtml;
        }

        // Store in cache
        if (useCache) {
            const cacheKey = getCacheKey(html, options);
            setInCache(cacheKey, result, citedKeys);
            console.log('[TechneCitationRenderer] Cache miss, stored result');
        }

        return result;
    }

    /**
     * Set the citation style
     */
    function setStyle(styleName) {
        if (STYLES[styleName]) {
            currentStyle = styleName;
        }
    }

    /**
     * Get available styles
     */
    function getStyles() {
        return Object.entries(STYLES).map(([key, style]) => ({
            key,
            name: style.name
        }));
    }

    /**
     * Get CSS styles for citations
     */
    function getCSS() {
        return `
/* Citation Renderer Styles */
.citation {
    color: var(--primary, #6366f1);
    cursor: default;
}

.citation-unknown {
    color: #ef4444;
    font-style: italic;
}

.bibliography-section {
    margin-top: 3em;
    padding-top: 2em;
    border-top: 2px solid var(--border-color, #e2e8f0);
}

.bibliography-heading {
    font-size: 1.5em;
    margin-bottom: 1em;
    color: var(--text-color, #1e293b);
}

.bibliography-list {
    list-style: none;
    padding: 0;
    margin: 0;
}

.bibliography-item {
    margin-bottom: 1em;
    padding-left: 2em;
    text-indent: -2em;
    line-height: 1.6;
    color: var(--text-secondary, #475569);
}

.bibliography-item em {
    font-style: italic;
}

/* Dark mode adjustments */
body.dark-mode .citation {
    color: var(--primary, #818cf8);
}

body.dark-mode .bibliography-section {
    border-top-color: var(--border-color, #3f3f46);
}

body.dark-mode .bibliography-heading {
    color: var(--text-color, #f4f4f5);
}

body.dark-mode .bibliography-item {
    color: var(--text-secondary, #a1a1aa);
}
`;
    }

    // Prune cache periodically (every 2 minutes)
    setInterval(pruneCache, 2 * 60 * 1000);

    // Export the module
    window.TechneCitationRenderer = {
        renderCitations,
        processCitations,
        generateBibliography,
        setStyle,
        getStyles,
        getCSS,
        STYLES,
        // Cache management
        invalidateCache,
        getCacheStats,
        pruneCache
    };

    console.log('[TechneCitationRenderer] Citation renderer loaded with caching');
})();
