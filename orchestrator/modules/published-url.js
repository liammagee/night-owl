(function(root) {
    function normalizePath(value) {
        return String(value || '')
            .replace(/\\/g, '/')
            .replace(/\/+$/g, '');
    }

    function trimSlashes(value) {
        return String(value || '').replace(/^\/+|\/+$/g, '');
    }

    function getDirname(pathValue) {
        const normalized = normalizePath(pathValue);
        const index = normalized.lastIndexOf('/');
        return index >= 0 ? normalized.slice(0, index) : '';
    }

    function getBasename(pathValue) {
        const normalized = normalizePath(pathValue);
        const index = normalized.lastIndexOf('/');
        return index >= 0 ? normalized.slice(index + 1) : normalized;
    }

    function stripExtension(pathValue) {
        return String(pathValue || '').replace(/\.[^/.]+$/u, '');
    }

    function getExtension(pathValue) {
        const match = String(pathValue || '').match(/(\.[^/.]+)$/u);
        return match ? match[1] : '';
    }

    function toHtmlPath(relativePath, isFolder = false) {
        if (isFolder) return trimSlashes(relativePath);
        return String(relativePath || '').replace(/\.(md|markdown)$/iu, '.html');
    }

    function slugify(value) {
        return String(value || '')
            .replace(/\.[^/.]+$/u, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/gu, '-')
            .replace(/^-+|-+$/gu, '');
    }

    function encodePath(value) {
        if (!value) return '';
        return String(value)
            .split('/')
            .map(segment => encodeURIComponent(segment))
            .join('/');
    }

    function inferHomeDirectory(settings = {}, referencePath = '') {
        const candidates = [
            settings.homeDirectory,
            settings.home,
            settings.userHome,
            settings.workingDirectory,
            referencePath,
            typeof process !== 'undefined' ? process.env?.HOME : ''
        ];

        for (const candidate of candidates) {
            const normalized = normalizePath(candidate);
            if (!normalized) continue;

            const macHome = normalized.match(/^(\/Users\/[^/]+)(?:\/|$)/u);
            if (macHome) return macHome[1];

            const linuxHome = normalized.match(/^(\/home\/[^/]+)(?:\/|$)/u);
            if (linuxHome) return linuxHome[1];

            const windowsHome = normalized.match(/^([A-Za-z]:\/Users\/[^/]+)(?:\/|$)/u);
            if (windowsHome) return windowsHome[1];
        }

        return '';
    }

    function expandLocalRoot(localRoot, settings = {}, referencePath = '') {
        let expanded = String(localRoot || '').trim();
        if (!expanded) return '';
        const homeDirectory = inferHomeDirectory(settings, referencePath);
        expanded = expanded
            .replace(/\{workingDirectory\}/g, settings.workingDirectory || '')
            .replace(/\{homeDirectory\}/g, homeDirectory)
            .replace(/\{home\}/g, homeDirectory);
        if (expanded === '~' || expanded.startsWith('~/')) {
            expanded = homeDirectory ? `${homeDirectory}${expanded.slice(1)}` : expanded;
        }
        return normalizePath(expanded);
    }

    function isPathInsideRoot(pathValue, rootValue) {
        const path = normalizePath(pathValue);
        const rootPath = normalizePath(rootValue);
        return path === rootPath || path.startsWith(`${rootPath}/`);
    }

    function getRelativePath(pathValue, rootValue) {
        const path = normalizePath(pathValue);
        const rootPath = normalizePath(rootValue);
        if (path === rootPath) return '';
        return trimSlashes(path.slice(rootPath.length + 1));
    }

    function inferContentId(relativePath, isFolder = false) {
        const normalized = trimSlashes(relativePath);
        if (!normalized) return '';

        const pathWithoutExtension = isFolder ? normalized : stripExtension(normalized);
        const parts = pathWithoutExtension.split('/').filter(Boolean);
        const nameSlug = slugify(parts[parts.length - 1] || '');
        if (!nameSlug) return '';

        if (parts[0] === 'courses' && parts.length >= 3) {
            const courseSlug = slugify(parts[1]);
            return courseSlug ? `${courseSlug}-${nameSlug}` : nameSlug;
        }

        if (parts[0] === 'articles' && parts.length >= 3) {
            const parentSlug = slugify(parts[parts.length - 2]);
            return parentSlug ? `${parentSlug}-${nameSlug}` : nameSlug;
        }

        const parentSlug = parts.length >= 2 ? slugify(parts[parts.length - 2]) : '';
        return parentSlug && parentSlug !== 'articles' && parentSlug !== 'courses'
            ? `${parentSlug}-${nameSlug}`
            : nameSlug;
    }

    function createTokens(filePath, localRoot, options = {}) {
        const isFolder = Boolean(options.isFolder);
        const relativePath = getRelativePath(filePath, localRoot);
        const htmlPath = toHtmlPath(relativePath, isFolder);
        const basename = getBasename(relativePath);
        const basenameNoExt = stripExtension(basename);
        const parentName = getBasename(getDirname(relativePath));
        const parentSlug = slugify(parentName);
        const slug = slugify(basename || relativePath);
        const parentSlugAndSlug = parentSlug && slug ? `${parentSlug}-${slug}` : slug;
        const contentId = inferContentId(relativePath, isFolder);

        return {
            path: normalizePath(filePath),
            relativePath,
            relativePathNoExt: stripExtension(relativePath),
            htmlPath,
            htmlPathNoExt: stripExtension(htmlPath),
            basename,
            basenameNoExt,
            extension: getExtension(relativePath).replace(/^\./u, ''),
            slug,
            parentSlug,
            parentSlugAndSlug,
            contentId
        };
    }

    function normalizeTemplate(template) {
        const value = String(template || '').trim();
        if (!value) return '';
        if (/\{[a-zA-Z][a-zA-Z0-9]*\}/.test(value)) return value;
        return `${value.replace(/\/?$/u, '/')}{htmlPath}`;
    }

    function applyTemplate(template, tokens) {
        const normalizedTemplate = normalizeTemplate(template);
        if (!normalizedTemplate) return '';

        return normalizedTemplate.replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g, (match, tokenName) => {
            if (!Object.prototype.hasOwnProperty.call(tokens, tokenName)) return match;
            return encodePath(tokens[tokenName]);
        });
    }

    function parseMappingLines(text) {
        const source = String(text || '').trim();
        if (!source) return [];

        if (source.startsWith('[')) {
            try {
                const parsed = JSON.parse(source);
                return Array.isArray(parsed)
                    ? parsed
                        .map(mapping => ({
                            localRoot: String(mapping.localRoot || mapping.root || '').trim(),
                            urlTemplate: String(mapping.urlTemplate || mapping.template || '').trim()
                        }))
                        .filter(mapping => mapping.localRoot && mapping.urlTemplate)
                    : [];
            } catch {
                return [];
            }
        }

        return source
            .split(/\r?\n/u)
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'))
            .map(line => {
                const delimiterIndex = line.indexOf('=>');
                if (delimiterIndex === -1) return null;
                const localRoot = line.slice(0, delimiterIndex).trim();
                const urlTemplate = line.slice(delimiterIndex + 2).trim();
                if (!localRoot || !urlTemplate) return null;
                return { localRoot, urlTemplate };
            })
            .filter(Boolean);
    }

    function serializeMappings(mappings) {
        if (!Array.isArray(mappings)) return '';
        return mappings
            .filter(mapping => mapping && mapping.localRoot && mapping.urlTemplate)
            .map(mapping => `${mapping.localRoot} => ${mapping.urlTemplate}`)
            .join('\n');
    }

    function getConfiguredMappings(settings = {}) {
        const publishing = settings.publishing || {};
        const candidates = [
            publishing.urlMappings,
            publishing.publishedUrlMappings,
            settings.publishedUrlMappings
        ];
        const mappings = candidates.find(Array.isArray);
        return Array.isArray(mappings) ? mappings : [];
    }

    function findBestMapping(filePath, options = {}) {
        const settings = options.settings || {};
        const mappings = options.mappings || getConfiguredMappings(settings);
        const normalizedFilePath = normalizePath(filePath);

        return mappings
            .map(mapping => ({
                mapping,
                localRoot: expandLocalRoot(mapping.localRoot || mapping.root, settings, normalizedFilePath)
            }))
            .filter(entry => entry.localRoot && isPathInsideRoot(normalizedFilePath, entry.localRoot))
            .sort((a, b) => b.localRoot.length - a.localRoot.length)[0] || null;
    }

    function resolvePublishedUrlInfo(filePath, options = {}) {
        if (!filePath) return null;
        const entry = findBestMapping(filePath, options);
        if (!entry) return null;

        const tokens = createTokens(filePath, entry.localRoot, options);
        const url = applyTemplate(entry.mapping.urlTemplate || entry.mapping.template, tokens);
        if (!url) return null;

        return {
            url,
            mapping: entry.mapping,
            localRoot: entry.localRoot,
            relativePath: tokens.relativePath,
            tokens
        };
    }

    function resolvePublishedUrl(filePath, options = {}) {
        return resolvePublishedUrlInfo(filePath, options)?.url || null;
    }

    const api = {
        normalizePath,
        parseMappingLines,
        serializeMappings,
        getConfiguredMappings,
        resolvePublishedUrl,
        resolvePublishedUrlInfo,
        inferContentId,
        inferHomeDirectory,
        createTokens
    };

    if (root) {
        root.NightOwlPublishedUrls = api;
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
