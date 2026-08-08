/**
 * Owns file-tree request coalescing and signature polling. DOM rendering,
 * Electron IPC, visibility policy, and timers are injected by the renderer.
 */
(function (root, factory) {
    const api = factory();
    if (root) root.NightOwlFileTreeController = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : null, function createModule() {
    'use strict';

    function createFileTreeController(options = {}) {
        if (typeof options.requestTree !== 'function') throw new TypeError('requestTree must be a function');
        if (typeof options.renderTree !== 'function') throw new TypeError('renderTree must be a function');
        const requestSignature = options.requestSignature || (async () => null);
        const onError = options.onError || (() => {});
        const shouldPoll = options.shouldPoll || (() => true);
        const onSignatureChanged = options.onSignatureChanged || (() => render());
        const setIntervalFn = options.setInterval || setInterval;
        const clearIntervalFn = options.clearInterval || clearInterval;
        const setTimeoutFn = options.setTimeout || setTimeout;
        const pollMs = options.pollMs || 4000;

        let rendered = false;
        let rendering = false;
        let pendingRender = false;
        let signature = null;
        let pollTimer = null;
        let pollInFlight = false;
        let pollActive = false;

        async function render() {
            if (rendering) {
                pendingRender = true;
                return { status: 'queued' };
            }
            rendering = true;
            try {
                const tree = await options.requestTree();
                if (tree?.signature) signature = tree.signature;
                options.renderTree(tree);
                rendered = true;
                return { status: 'rendered', tree };
            } catch (error) {
                onError(error);
                return { status: 'failed', error };
            } finally {
                rendering = false;
                if (pendingRender) {
                    pendingRender = false;
                    void render();
                }
            }
        }

        async function pollOnce() {
            if (!pollActive || !rendered || rendering || pollInFlight || !shouldPoll()) {
                return { status: 'idle' };
            }
            pollInFlight = true;
            try {
                const result = await requestSignature();
                if (!result?.success || !result.signature) return { status: 'unavailable' };
                if (!signature) {
                    signature = result.signature;
                    return { status: 'initialized', signature };
                }
                if (result.signature !== signature) {
                    const previousSignature = signature;
                    signature = result.signature;
                    rendered = false;
                    onSignatureChanged({ previousSignature, signature });
                    return { status: 'changed', previousSignature, signature };
                }
                return { status: 'unchanged', signature };
            } catch (error) {
                onError(error, { phase: 'signature' });
                return { status: 'failed', error };
            } finally {
                pollInFlight = false;
            }
        }

        function startPolling() {
            if (pollActive || !shouldPoll({ starting: true })) return false;
            pollActive = true;
            pollTimer = setIntervalFn(() => void pollOnce(), pollMs);
            setTimeoutFn(() => void pollOnce(), 0);
            return true;
        }

        function stopPolling() {
            pollActive = false;
            if (pollTimer !== null) {
                clearIntervalFn(pollTimer);
                pollTimer = null;
            }
        }

        function dispose() {
            stopPolling();
            pendingRender = false;
        }

        function markStale() {
            rendered = false;
        }

        function resetSignature() {
            signature = null;
        }

        function getSnapshot() {
            return {
                rendered,
                rendering,
                pendingRender,
                signature,
                pollInFlight,
                pollActive
            };
        }

        return {
            render,
            pollOnce,
            startPolling,
            stopPolling,
            dispose,
            markStale,
            resetSignature,
            getSnapshot
        };
    }

    return { createFileTreeController };
});
