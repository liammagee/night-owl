/**
 * Pure helpers for filtering the file tree by name, path, and tags.
 *
 * The renderer uses these helpers to render a filtered tree from cached file
 * data, so search can find files inside collapsed folders instead of only
 * filtering rows currently present in the DOM.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (root) {
        root.NightOwlFileTreeFilter = api;
    }
})(typeof window !== 'undefined' ? window : globalThis, function () {
    function normalizeQuery(query) {
        return String(query || '').trim().toLowerCase();
    }

    function normalizeTags(tags) {
        if (!tags) return [];
        const values = tags instanceof Set ? Array.from(tags) : tags;
        return Array.isArray(values)
            ? values.map(tag => String(tag || '').trim().toLowerCase()).filter(Boolean)
            : [];
    }

    function isFolderNode(node) {
        return Boolean(node && (
            node.type === 'folder' ||
            node.type === 'directory' ||
            node.type === 'workspace-root'
        ));
    }

    function getNodeSearchText(node) {
        return `${node?.name || ''} ${node?.path || ''}`.toLowerCase();
    }

    function getFileTags(tagManager, filePath) {
        if (!tagManager || typeof tagManager.getFileTags !== 'function' || !filePath) {
            return [];
        }

        try {
            const tags = tagManager.getFileTags(filePath);
            return Array.isArray(tags)
                ? tags.map(tag => String(tag || '').toLowerCase()).filter(Boolean)
                : [];
        } catch (_error) {
            return [];
        }
    }

    function fileMatchesActiveTags(node, activeTags, tagManager) {
        if (activeTags.length === 0) return true;
        const fileTags = getFileTags(tagManager, node?.path);
        return activeTags.some(tag => fileTags.includes(tag));
    }

    function nodeMatchesQuery(node, query, tagManager) {
        if (!query) return true;
        if (getNodeSearchText(node).includes(query)) return true;

        if (!isFolderNode(node)) {
            return getFileTags(tagManager, node?.path)
                .some(tag => tag.includes(query));
        }

        return false;
    }

    function cloneNode(node, children) {
        const clone = { ...node };
        if (children) {
            clone.children = children;
        } else if ('children' in clone) {
            clone.children = [];
        }
        return clone;
    }

    function cloneSubtree(node) {
        if (!node || !Array.isArray(node.children)) {
            return { ...node };
        }
        return cloneNode(node, node.children.map(cloneSubtree));
    }

    function countFiles(node) {
        if (!node) return 0;
        if (!isFolderNode(node)) return 1;
        return (node.children || []).reduce((sum, child) => sum + countFiles(child), 0);
    }

    function filterNode(node, options) {
        if (!node) return null;

        const query = normalizeQuery(options?.query);
        const activeTags = normalizeTags(options?.activeTags);
        const tagManager = options?.tagManager;

        if (!query && activeTags.length === 0) {
            return cloneSubtree(node);
        }

        if (!isFolderNode(node)) {
            return nodeMatchesQuery(node, query, tagManager) &&
                fileMatchesActiveTags(node, activeTags, tagManager)
                ? { ...node }
                : null;
        }

        const children = Array.isArray(node.children) ? node.children : [];
        const folderMatchesQuery = Boolean(query && getNodeSearchText(node).includes(query));

        if (folderMatchesQuery && activeTags.length === 0) {
            return cloneSubtree(node);
        }

        const filteredChildren = children
            .map(child => filterNode(child, { query, activeTags, tagManager }))
            .filter(Boolean);

        if (filteredChildren.length === 0) {
            return null;
        }

        return cloneNode(node, filteredChildren);
    }

    function hasActiveFilter(options) {
        return Boolean(normalizeQuery(options?.query) || normalizeTags(options?.activeTags).length > 0);
    }

    function filterTree(fileTree, options = {}) {
        const active = hasActiveFilter(options);
        if (!active) {
            return {
                tree: fileTree,
                hasFilter: false,
                matchCount: null
            };
        }

        const filtered = filterNode(fileTree, options);
        return {
            tree: filtered,
            hasFilter: true,
            matchCount: countFiles(filtered)
        };
    }

    return {
        countFiles,
        filterNode,
        filterTree,
        hasActiveFilter,
        isFolderNode,
        normalizeQuery,
        normalizeTags,
        nodeMatchesQuery
    };
});
