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

    function createRendererActivity(window, document, options = {}) {
        let focused = document.hasFocus();
        let active;
        let nativeState = null;
        let unsubscribeNative;
        let disposed = false;
        const simulations = new Set();
        const visualJobs = new Map();
        const idleAfterMs = options.idleAfterMs ?? 3000;
        const now = () => window.performance.now();
        let lastInteraction = now();
        let idleTimer = null;
        let sequence = 0;
        const motionPreference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
        const inputEvents = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'];

        function jobReason(entry) {
            if (entry.error) return 'error';
            if (!active) return 'window-inactive';
            if (!entry.isEligible()) return 'view-hidden';
            if (entry.decorative && motionPreference?.matches) return 'reduced-motion';
            if (entry.decorative && now() - lastInteraction >= idleAfterMs) return 'idle';
            return 'running';
        }

        function stopJob(entry) {
            if (!entry.running) return;
            entry.running = false;
            entry.stops++;
            entry.stop();
        }

        function synchronizeVisualJobs() {
            if (disposed) return;
            let needsDeadline = false;
            for (const entry of visualJobs.values()) {
                try {
                    entry.reason = jobReason(entry);
                    const run = entry.reason === 'running';
                    if (run && !entry.running) {
                        entry.running = true;
                        entry.starts++;
                        entry.start();
                    } else if (!run) stopJob(entry);
                    if (run && entry.decorative) needsDeadline = true;
                } catch (error) {
                    // A broken decoration must not prevent other jobs from stopping.
                    entry.error = String(error?.message || error);
                    entry.reason = 'error';
                    try { stopJob(entry); } catch (_) { /* Preserve the original failure. */ }
                }
            }
            const idle = now() - lastInteraction >= idleAfterMs;
            document.documentElement.toggleAttribute('data-nightowl-decorations-paused',
                !active || idle || Boolean(motionPreference?.matches));
            if (!needsDeadline && idleTimer !== null) {
                window.clearTimeout(idleTimer);
                idleTimer = null;
            } else if (needsDeadline && idleTimer === null) {
                idleTimer = window.setTimeout(() => {
                    idleTimer = null;
                    synchronizeVisualJobs();
                }, Math.max(1, idleAfterMs - (now() - lastInteraction)));
            }
        }

        function onInteraction() {
            if (disposed) return;
            lastInteraction = now();
            // Already-running jobs need no style reads or timer churn for every
            // pointer event. Their single deadline will account for later input.
            if (Array.from(visualJobs.values()).some(entry => entry.reason === 'idle')) {
                synchronizeVisualJobs();
            }
        }
        function onMotionChange() { synchronizeVisualJobs(); }
        for (const event of inputEvents) window.addEventListener(event, onInteraction, { passive: true });
        motionPreference?.addEventListener?.('change', onMotionChange);

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
            const changed = nextActive !== active;
            if (changed && nextActive) lastInteraction = now();
            active = nextActive;
            document.documentElement.toggleAttribute('data-nightowl-visuals-paused', !active);
            for (const entry of simulations) synchronizeSimulation(entry);
            synchronizeVisualJobs();
            if (!changed) return;
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
            refresh: synchronizeVisualJobs,
            // Each owner supplies cancellation. No global RAF/timer interception:
            // editing, autosave, terminal output and presentation playback continue.
            trackVisualWork({ name, start, stop, isEligible = () => true, decorative = true }) {
                if (disposed) throw new Error('Renderer activity is disposed');
                if (typeof start !== 'function' || typeof stop !== 'function') throw new Error('Visual work requires start and stop');
                const id = ++sequence;
                const entry = { name: name || `visual-${id}`, start, stop, isEligible, decorative,
                    running: false, reason: 'registered', starts: 0, stops: 0, error: null };
                visualJobs.set(id, entry);
                synchronizeVisualJobs();
                return () => {
                    try { stopJob(entry); } finally {
                        visualJobs.delete(id);
                        synchronizeVisualJobs();
                    }
                };
            },
            getDiagnostics: () => ({
                active, idle: now() - lastInteraction >= idleAfterMs, idleAfterMs,
                reducedMotion: Boolean(motionPreference?.matches),
                registeredJobs: visualJobs.size,
                runningJobs: Array.from(visualJobs.values()).filter(entry => entry.running).length,
                jobs: Array.from(visualJobs.values()).map(({ name, running, reason, starts, stops, error }) =>
                    ({ name, running, reason, starts, stops, error }))
            }),
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
                if (idleTimer !== null) window.clearTimeout(idleTimer);
                idleTimer = null;
                for (const entry of visualJobs.values()) {
                    try { stopJob(entry); } catch (_) { /* Finish releasing the other owners. */ }
                }
                visualJobs.clear();
                for (const event of inputEvents) window.removeEventListener(event, onInteraction);
                motionPreference?.removeEventListener?.('change', onMotionChange);
                document.documentElement.removeAttribute('data-nightowl-decorations-paused');
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
