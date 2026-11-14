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

    function normalizePath(filePath) {
        return String(filePath || '')
            .replace(/\\/g, '/')
            .replace(/\/+$/, '')
            .toLowerCase();
    }

    function getRelativeSearchPath(nodePath, rootPath) {
        const normalizedNodePath = normalizePath(nodePath);
        const normalizedRootPath = normalizePath(rootPath);
        if (!normalizedNodePath || !normalizedRootPath) return '';
        if (normalizedNodePath === normalizedRootPath) return '';

        const rootPrefix = `${normalizedRootPath}/`;
        return normalizedNodePath.startsWith(rootPrefix)
            ? normalizedNodePath.slice(rootPrefix.length)
            : '';
    }

    function getNodeSearchText(node, rootPath) {
        const name = String(node?.name || '').toLowerCase();
        const relativePath = getRelativeSearchPath(node?.path, rootPath);
        return relativePath && relativePath !== name
            ? `${name} ${relativePath}`
            : name;
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

    function nodeMatchesQuery(node, query, tagManager, rootPath) {
        if (!query) return true;
        if (getNodeSearchText(node, rootPath).includes(query)) return true;

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
        const isRoot = Boolean(options?.isRoot);
        const inheritedRootPath = options?.rootPath;
        const rootPath = inheritedRootPath || (
            isFolderNode(node) && node.type !== 'workspace-root'
                ? node.path
                : null
        );

        if (!query && activeTags.length === 0) {
            return cloneSubtree(node);
        }

        if (!isFolderNode(node)) {
            return nodeMatchesQuery(node, query, tagManager, rootPath) &&
                fileMatchesActiveTags(node, activeTags, tagManager)
                ? { ...node }
                : null;
        }

        const children = Array.isArray(node.children) ? node.children : [];
        // The top-level directory is the search scope, not a result. Matching
        // its absolute path used to make common queries such as "dev" or
        // "users" return the entire tree and made the search appear broken.
        const folderMatchesQuery = Boolean(
            query &&
            !isRoot &&
            getNodeSearchText(node, rootPath).includes(query)
        );

        if (folderMatchesQuery && activeTags.length === 0) {
            return cloneSubtree(node);
        }

        const filteredChildren = children
            .map(child => {
                const childIsWorkspaceRoot = node.type === 'workspace-root' && isFolderNode(child);
                return filterNode(child, {
                    query,
                    activeTags,
                    tagManager,
                    rootPath: childIsWorkspaceRoot ? child.path : rootPath,
                    isRoot: childIsWorkspaceRoot
                });
            })
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

        const filtered = filterNode(fileTree, { ...options, isRoot: true });
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
        getRelativeSearchPath,
        normalizeQuery,
        normalizeTags,
        nodeMatchesQuery
    };
});
