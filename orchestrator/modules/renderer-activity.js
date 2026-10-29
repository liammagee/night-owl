/** Pause visual work when the window is unused; leave data work and saves alone. */
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    } else if (root?.document) {
        root.nightowlRendererActivity = api.createRendererActivity(root, root.document);
    }
})(typeof window !== 'undefined' ? window : null, function () {
    'use strict';

    function createRendererActivity(window, document) {
        let focused = document.hasFocus();
        let active;
        let nativeState = null;
        let unsubscribeNative;
        let disposed = false;
        const simulations = new Set();

        function synchronizeSimulation(entry) {
            if (!active) {
                entry.simulation.stop();
                entry.paused = true;
            } else if (entry.paused) {
                entry.paused = false;
                // Resume the existing layout without reheating a settled graph.
                if (entry.simulation.alpha() >= entry.simulation.alphaMin() || entry.simulation.alphaTarget() > 0) {
                    entry.simulation.restart();
                }
            }
        }

        function synchronize() {
            if (disposed) return;
            const visible = document.visibilityState !== 'hidden' && nativeState?.visible !== false;
            // A visible presentation may be on a second display or shared while
            // the presenter uses speaker notes or another application.
            const presenting = document.body?.dataset.nightowlMode === 'presentation'
                && Boolean(document.querySelector('.presentation-shell[data-presentation-mode="delivery"]'));
            const nextActive = visible && (focused || presenting);
            if (nextActive === active) return;
            active = nextActive;
            document.documentElement.toggleAttribute('data-nightowl-visuals-paused', !active);
            for (const entry of simulations) synchronizeSimulation(entry);
            window.dispatchEvent(new window.CustomEvent('nightowl-activity-changed', {
                detail: { active, focused, visible }
            }));
        }

        function onFocus() {
            if (!nativeState) focused = true;
            synchronize();
        }
        function onBlur() {
            if (!nativeState) focused = false;
            synchronize();
        }
        function onVisibilityChange() {
            observePresentationRoot();
            if (!nativeState) focused = document.hasFocus();
            synchronize();
        }

        unsubscribeNative = window.electronAPI?.events?.windowActivityChanged?.(state => {
            if (typeof state?.focused !== 'boolean' || typeof state?.visible !== 'boolean') return;
            nativeState = state;
            focused = state.focused;
            synchronize();
        });

        window.addEventListener('focus', onFocus);
        window.addEventListener('blur', onBlur);
        document.addEventListener('visibilitychange', onVisibilityChange);
        document.addEventListener('DOMContentLoaded', onVisibilityChange);
        const observer = new window.MutationObserver(synchronize);
        observer.observe(document.documentElement, {
            subtree: true,
            attributes: true,
            attributeFilter: ['data-nightowl-mode', 'data-presentation-mode']
        });
        function observePresentationRoot() {
            const presentationRoot = document.querySelector('#presentation-root');
            if (presentationRoot) observer.observe(presentationRoot, { childList: true });
        }
        observePresentationRoot();
        synchronize();

        return {
            isActive: () => active,
            trackSimulation(simulation) {
                const entry = { simulation, paused: false };
                simulations.add(entry);
                synchronizeSimulation(entry);
                return () => simulations.delete(entry);
            },
            dispose() {
                if (disposed) return;
                disposed = true;
                observer.disconnect();
                unsubscribeNative?.();
                window.removeEventListener('focus', onFocus);
                window.removeEventListener('blur', onBlur);
                document.removeEventListener('visibilitychange', onVisibilityChange);
                document.removeEventListener('DOMContentLoaded', onVisibilityChange);
                // Release only layouts paused by this controller.
                active = true;
                for (const entry of simulations) synchronizeSimulation(entry);
                simulations.clear();
                document.documentElement.removeAttribute('data-nightowl-visuals-paused');
            }
        };
    }

    return { createRendererActivity };
});
