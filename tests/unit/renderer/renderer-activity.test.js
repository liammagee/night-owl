const { createRendererActivity } = require('../../../orchestrator/modules/renderer-activity');

describe('inactive visual work', () => {
    let activity;
    let focused;
    let visibility;

    beforeEach(() => {
        document.body.removeAttribute('data-nightowl-mode');
        document.body.innerHTML = '<div id="presentation-root"><div class="presentation-shell" data-presentation-mode="authoring"></div></div>';
        focused = true;
        visibility = 'visible';
        jest.spyOn(document, 'hasFocus').mockImplementation(() => focused);
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
        activity = createRendererActivity(window, document);
    });

    afterEach(() => {
        activity.dispose();
        jest.restoreAllMocks();
        delete document.visibilityState;
    });

    function focus(value) {
        focused = value;
        window.dispatchEvent(new Event(value ? 'focus' : 'blur'));
    }

    function simulation(alpha = 0.5) {
        return {
            stop: jest.fn(), restart: jest.fn(),
            alpha: () => alpha, alphaMin: () => 0.001, alphaTarget: () => 0
        };
    }

    test('pauses on blur and does not duplicate state changes on repeated events', () => {
        const changed = jest.fn();
        window.addEventListener('nightowl-activity-changed', changed);
        try {
            focus(false);
            focus(false);
            expect(activity.isActive()).toBe(false);
            expect(document.documentElement.hasAttribute('data-nightowl-visuals-paused')).toBe(true);
            expect(changed).toHaveBeenCalledTimes(1);
            focus(true);
            expect(activity.isActive()).toBe(true);
            expect(document.documentElement.hasAttribute('data-nightowl-visuals-paused')).toBe(false);
            expect(changed).toHaveBeenCalledTimes(2);
        } finally {
            window.removeEventListener('nightowl-activity-changed', changed);
        }
    });

    test('a visible presentation survives loss of focus but stops when hidden', async () => {
        focus(false);
        document.body.dataset.nightowlMode = 'presentation';
        await Promise.resolve();
        expect(activity.isActive()).toBe(false);
        document.querySelector('.presentation-shell').dataset.presentationMode = 'delivery';
        await Promise.resolve();
        expect(activity.isActive()).toBe(true);
        visibility = 'hidden';
        document.dispatchEvent(new Event('visibilitychange'));
        expect(activity.isActive()).toBe(false);
        visibility = 'visible';
        document.dispatchEvent(new Event('visibilitychange'));
        expect(activity.isActive()).toBe(true);
        document.body.dataset.nightowlMode = 'editor';
        await Promise.resolve();
        expect(activity.isActive()).toBe(false);
    });

    test('graphs created while inactive wait, then resume without reheating', () => {
        focus(false);
        const graph = simulation();
        activity.trackSimulation(graph);
        expect(graph.stop).toHaveBeenCalledTimes(1);
        expect(graph.restart).not.toHaveBeenCalled();
        focus(true);
        expect(graph.restart).toHaveBeenCalledTimes(1);
        focus(true);
        expect(graph.restart).toHaveBeenCalledTimes(1);
    });

    test('settled graphs and disposed graphs do not restart on focus', () => {
        const settled = simulation(0);
        const removed = simulation();
        activity.trackSimulation(settled);
        const release = activity.trackSimulation(removed);
        focus(false);
        release();
        focus(true);
        expect(settled.restart).not.toHaveBeenCalled();
        expect(removed.restart).not.toHaveBeenCalled();
    });

    test('uninstalling releases paused graphs and detaches lifecycle listeners', () => {
        const graph = simulation();
        activity.trackSimulation(graph);
        focus(false);
        activity.dispose();
        expect(graph.restart).toHaveBeenCalledTimes(1);
        focus(false);
        expect(document.documentElement.hasAttribute('data-nightowl-visuals-paused')).toBe(false);
    });

    test('native focus overrides stale DOM focus, and IPC subscriptions are released', () => {
        activity.dispose();
        const unsubscribe = jest.fn();
        let nativeChanged;
        window.electronAPI = { events: { windowActivityChanged: listener => {
            nativeChanged = listener;
            return unsubscribe;
        } } };
        activity = createRendererActivity(window, document);
        nativeChanged({ focused: false, visible: true });
        focus(true);
        expect(activity.isActive()).toBe(false);
        nativeChanged({ focused: true, visible: true });
        expect(activity.isActive()).toBe(true);
        nativeChanged({ focused: true, visible: false });
        expect(activity.isActive()).toBe(false);
        activity.dispose();
        expect(unsubscribe).toHaveBeenCalledTimes(1);
        delete window.electronAPI;
    });

    test('initializes quietly when the window starts without focus', () => {
        activity.dispose();
        focused = false;
        activity = createRendererActivity(window, document);
        expect(activity.isActive()).toBe(false);
    });
});
