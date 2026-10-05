/**
 * Coordinates latest-wins file-open requests without depending on renderer
 * globals. The renderer injects I/O, content application, and user-facing
 * failure callbacks.
 */
(function (root, factory) {
    const api = factory();
    if (root) root.NightOwlFileOpenController = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : null, function createModule() {
    'use strict';

    function requireFunction(value, name) {
        if (typeof value !== 'function') throw new TypeError(`${name} must be a function`);
        return value;
    }

    function createFileOpenController(options = {}) {
        const transitions = options.transitions;
        if (!transitions?.begin || !transitions?.complete || !transitions?.fail) {
            throw new TypeError('A file-transition coordinator is required');
        }

        const readPath = requireFunction(options.readPath, 'readPath');
        const applyContent = requireFunction(options.applyContent, 'applyContent');
        const onBegin = options.onBegin || (() => {});
        const onComplete = options.onComplete || (() => {});
        const onFailure = options.onFailure || (() => {});
        const onLogError = options.onLogError || (() => {});

        function begin(filePath, metadata = {}) {
            transitions.supersede?.('preview', 'file-transition');
            const transition = transitions.begin('file', filePath, metadata);
            onBegin({ filePath, metadata, transition });
            return transition;
        }

        function fail(transition, error, retry) {
            if (!transition?.isCurrent?.()) return transition?.done;
            onFailure({ transition, error, retry });
            return transitions.fail(transition, error);
        }

        async function openPath(filePath, requestOptions = {}) {
            const transition = begin(filePath, {
                source: requestOptions.source || 'path-request'
            });
            try {
                const result = await readPath(filePath, requestOptions);
                if (!transition.isCurrent()) return transition.done;
                if (!result?.success) {
                    throw new Error(result?.error || `Could not read ${filePath}`);
                }
                return openContent(result.filePath || filePath, result.content, {
                    refreshExistingTabContent: requestOptions.refreshExistingTabContent !== false,
                    ...requestOptions,
                    transition
                });
            } catch (error) {
                return fail(transition, error, () => openPath(filePath, requestOptions));
            }
        }

        async function openContent(filePath, content, requestOptions = {}) {
            const transition = requestOptions.transition || begin(filePath, {
                source: requestOptions.source || 'content-ready'
            });
            try {
                if (!transition.isCurrent()) return transition.done;
                await applyContent(filePath, content, { ...requestOptions, transition });
                if (!transition.isCurrent()) return transition.done;
                onComplete({ filePath, transition });
                return transitions.complete(transition, { filePath });
            } catch (error) {
                onLogError({ filePath, transition, error });
                return fail(
                    transition,
                    error,
                    () => openContent(filePath, content, { ...requestOptions, transition: null })
                );
            }
        }

        return {
            begin,
            fail,
            openPath,
            openContent,
            getActive: () => transitions.getCurrent?.('file') || null
        };
    }

    return { createFileOpenController };
});
