/* NightOwl Hermeneutic Circle feature
   Hermeneutic circle visualization for iterative understanding patterns.
   Dependencies: D3.js (loaded via host)
*/

(function () {
    const FEATURE_ID = 'nightowl-circle';
    const BASE = 'plugins/techne-circle';

    window.NightOwlFeatures.register({
        id: FEATURE_ID,

        async init(host) {
            host.log(`[${FEATURE_ID}] Initializing...`);

            // Load D3 if not already present
            if (typeof d3 === 'undefined') {
                const d3Loaded = await host.loadScript('lib/d3.min.js');
                if (!d3Loaded) {
                    host.error(`[${FEATURE_ID}] Failed to load D3.js`);
                    return;
                }
            }

            // Load circle styles
            await host.loadCSS(`${BASE}/circle.css`);

            // Load the CircleView class
            await host.loadScript(`${BASE}/circle-view.js`);

            // Expose the view class globally for mode registration
            if (window.CircleView) {
                host.log(`[${FEATURE_ID}] CircleView loaded successfully`);

                // Emit event so host can register the mode
                host.emit('mode:available', {
                    id: 'circle',
                    title: 'Hermeneutic Circle',
                    icon: '◎',
                    viewClass: window.CircleView,
                    mount: async (container) => {
                        const view = new window.CircleView(host);
                        await view.initialize(container);
                        return view;
                    },
                    unmount: (view) => {
                        if (view && typeof view.destroy === 'function') {
                            view.destroy();
                        }
                    }
                });
            }

            host.log(`[${FEATURE_ID}] Initialized`);
        }
    });
})();
