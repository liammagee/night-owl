/**
 * BibTeX Parser for Techne Markdown Renderer
 *
 * Parses BibTeX format bibliography files and converts them to
 * the format expected by citationRenderer.js (window.bibEntries).
 *
 * Usage:
 *   const entries = TechneBibtexParser.parse(bibtexString);
 *   // or
 *   await TechneBibtexParser.loadFromFile('/path/to/refs.bib');
 */
(function() {
    if (window.TechneBibtexParser) return;

    /**
     * Parse a BibTeX string into an array of entry objects
     */
    function parse(bibtex) {
        const entries = [];

        // Match entry patterns: @type{key, ... }
        // Use a more robust regex that handles nested braces
        const entryRegex = /@(\w+)\s*\{\s*([^,]+)\s*,/g;
        let match;

        while ((match = entryRegex.exec(bibtex)) !== null) {
            const type = match[1].toLowerCase();
            const key = match[2].trim();
            const startIndex = match.index + match[0].length;

            // Find the matching closing brace
            let braceCount = 1;
            let endIndex = startIndex;
            for (let i = startIndex; i < bibtex.length && braceCount > 0; i++) {
                if (bibtex[i] === '{') braceCount++;
                else if (bibtex[i] === '}') braceCount--;
                endIndex = i;
            }

            const body = bibtex.substring(startIndex, endIndex);
            const fields = parseFields(body);

            entries.push({
                key,
                type: normalizeType(type),
                ...fields
            });
        }

        return entries;
    }

    /**
     * Parse field assignments from entry body
     */
    function parseFields(body) {
        const fields = {};

        // Match field = value patterns
        // Values can be: {braced}, "quoted", or numeric
        const fieldRegex = /(\w+)\s*=\s*(?:\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}|"([^"]*)"|(\d+))/g;
        let match;

        while ((match = fieldRegex.exec(body)) !== null) {
            const fieldName = match[1].toLowerCase();
            const value = match[2] || match[3] || match[4] || '';

            // Clean up the value
            const cleanValue = cleanFieldValue(value);

            // Map BibTeX field names to our expected format
            fields[mapFieldName(fieldName)] = cleanValue;
        }

        return fields;
    }

    /**
     * Clean field value - remove LaTeX commands, extra braces, etc.
     */
    function cleanFieldValue(value) {
        if (!value) return '';

        return value
            // Remove outer braces used for capitalization preservation
            .replace(/^\{|\}$/g, '')
            // Remove remaining single braces (but not paired ones)
            .replace(/\{([^{}]+)\}/g, '$1')
            // Convert LaTeX dashes
            .replace(/---/g, '\u2014') // em-dash
            .replace(/--/g, '\u2013') // en-dash
            // Convert common LaTeX commands
            .replace(/\\&/g, '&')
            .replace(/\\\$/g, '$')
            .replace(/\\%/g, '%')
            .replace(/\\_/g, '_')
            .replace(/\\textit\{([^}]+)\}/g, '$1')
            .replace(/\\textbf\{([^}]+)\}/g, '$1')
            .replace(/\\emph\{([^}]+)\}/g, '$1')
            // Remove other LaTeX commands
            .replace(/\\[a-zA-Z]+\{([^}]*)\}/g, '$1')
            .replace(/\\[a-zA-Z]+/g, '')
            // Normalize whitespace
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Map BibTeX field names to our expected format
     */
    function mapFieldName(name) {
        const mapping = {
            'journaltitle': 'journal',
            'booktitle': 'booktitle',
            'address': 'location',
            'edition': 'edition',
            'number': 'number',
            'note': 'note',
            'abstract': 'abstract',
            'keywords': 'keywords',
            'url': 'url',
            'urldate': 'urldate',
            'howpublished': 'howpublished'
        };
        return mapping[name] || name;
    }

    /**
     * Normalize entry type to standard categories
     */
    function normalizeType(type) {
        const typeMapping = {
            'article': 'article',
            'book': 'book',
            'inbook': 'chapter',
            'incollection': 'chapter',
            'inproceedings': 'conference',
            'conference': 'conference',
            'proceedings': 'proceedings',
            'phdthesis': 'thesis',
            'mastersthesis': 'thesis',
            'thesis': 'thesis',
            'techreport': 'report',
            'report': 'report',
            'manual': 'manual',
            'misc': 'misc',
            'online': 'online',
            'unpublished': 'unpublished'
        };
        return typeMapping[type] || type;
    }

    /**
     * Load and parse a BibTeX file from URL or path
     */
    async function loadFromFile(url) {
        try {
            let resolvedUrl = url;

            // If this is a relative or absolute path (not already a full URL), resolve it
            if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('file://')) {
                // Get the working directory from various sources
                const workingDir = window.appSettings?.workingDirectory ||
                    window.currentDirectory ||
                    window.electronAPI?.getWorkingDirectory?.();

                if (workingDir) {
                    // Remove leading slash from path if present, as workingDir already has the full path
                    const cleanPath = url.replace(/^\//, '');
                    resolvedUrl = `file://${workingDir}/${cleanPath}`;
                } else {
                    // Fallback: try using electronAPI to read the file directly
                    if (window.electronAPI?.invoke) {
                        // Construct a likely path based on the url
                        const filePath = url.startsWith('/') ? url : `/${url}`;
                        console.log(`[TechneBibtexParser] Attempting to load via IPC: ${filePath}`);
                        const result = await window.electronAPI.invoke('read-file', filePath);
                        if (result.success && result.content) {
                            return parse(result.content);
                        }
                    }
                    console.warn(`[TechneBibtexParser] No working directory available for: ${url}`);
                    return [];
                }
            }

            console.log(`[TechneBibtexParser] Loading: ${resolvedUrl}`);
            const response = await fetch(resolvedUrl);
            if (!response.ok) {
                throw new Error(`Failed to load BibTeX file: ${response.status}`);
            }
            const text = await response.text();
            return parse(text);
        } catch (error) {
            console.error('[TechneBibtexParser] Error loading file:', error);
            return [];
        }
    }

    /**
     * Load BibTeX file and set as global bibEntries
     */
    async function loadAndSetGlobal(url) {
        const entries = await loadFromFile(url);
        window.bibEntries = entries;

        // Notify citation renderer if available
        if (window.TechneCitationRenderer?.invalidateCache) {
            window.TechneCitationRenderer.invalidateCache();
        }

        console.log(`[TechneBibtexParser] Loaded ${entries.length} bibliography entries`);
        return entries;
    }

    /**
     * Add entries to global bibEntries (merge)
     */
    function addEntries(newEntries) {
        window.bibEntries = window.bibEntries || [];

        // Add entries, avoiding duplicates by key
        const existingKeys = new Set(window.bibEntries.map(e => e.key));
        for (const entry of newEntries) {
            if (!existingKeys.has(entry.key)) {
                window.bibEntries.push(entry);
                existingKeys.add(entry.key);
            }
        }

        // Notify citation renderer if available
        if (window.TechneCitationRenderer?.invalidateCache) {
            window.TechneCitationRenderer.invalidateCache();
        }
    }

    // Export the parser
    window.TechneBibtexParser = {
        parse,
        loadFromFile,
        loadAndSetGlobal,
        addEntries
    };

    console.log('[TechneBibtexParser] BibTeX parser loaded');
})();
