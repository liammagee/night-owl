/**
 * Pane command facade over the shared UI state store. It owns persistence and
 * restoration suppression; callers inject pane-specific content callbacks.
 */
(function (root, factory) {
    const api = factory();
    if (root) root.NightOwlPaneController = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : null, function createModule() {
    'use strict';

    function createPaneController(options = {}) {
        const store = options.store;
        if (!store?.dispatch || !store?.getState) throw new TypeError('A UI state store is required');
        const persist = options.persist || (() => {});
        const onBeforeShow = options.onBeforeShow || (() => {});
        const onShown = options.onShown || (() => {});
        const onSearch = options.onSearch || (() => {});
        let restoring = false;

        function persistPanes() {
            if (restoring) return;
            const panes = store.getState().panes;
            persist({
                sidebarVisible: panes.sidebar,
                editorVisible: panes.editor,
                previewVisible: panes.right
            });
        }

        function hydrate(panes) {
            restoring = true;
            try {
                return store.dispatch({ type: 'HYDRATE_PANES', panes });
            } finally {
                restoring = false;
            }
        }

        function toggle(pane) {
            const state = store.dispatch({ type: 'TOGGLE_PANE', pane });
            persistPanes();
            return state;
        }

        function hideRight() {
            const state = store.dispatch({ type: 'SET_PANE_VISIBILITY', pane: 'right', visible: false });
            persistPanes();
            return state;
        }

        function show(pane) {
            if (pane === 'search') {
                onSearch();
                return store.getState();
            }
            onBeforeShow(pane);
            const state = store.dispatch({ type: 'SHOW_RIGHT_PANE', pane });
            if (state.activeRightPane === pane) onShown(pane, state);
            return state;
        }

        return {
            hydrate,
            toggle,
            hideRight,
            show,
            persist: persistPanes,
            isRestoring: () => restoring,
            getState: () => store.getState()
        };
    }

    return { createPaneController };
});
