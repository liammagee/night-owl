/* NightOwl Babel Maze feature
   Babel Maze - MUD-style knowledge base explorer inspired by Borges' Library of Babel.
   Transforms Markdown files into explorable rooms with wiki-style links as corridors.
*/

(function () {
    const FEATURE_ID = 'nightowl-maze';
    const BASE = 'plugins/techne-maze';

    window.NightOwlFeatures.register({
        id: FEATURE_ID,

        async init(host) {
            host.log(`[${FEATURE_ID}] Initializing...`);

            // Load maze styles
            await host.loadCSS(`${BASE}/babel-maze.css`);

            // Load the BabelMazeView class
            await host.loadScript(`${BASE}/BabelMazeView.js`);

            // Expose the view class globally for mode registration
            if (window.BabelMazeView) {
                host.log(`[${FEATURE_ID}] BabelMazeView loaded successfully`);

                // Emit event so host can register the mode
                host.emit('mode:available', {
                    id: 'maze',
                    title: 'Babel Maze',
                    icon: '🏛️',
                    viewClass: window.BabelMazeView,
                    mount: async (container, options = {}) => {
                        const view = new window.BabelMazeView(host, options);
                        await view.initialize(container);
                        return view;
                    },
                    unmount: (view) => {
                        if (view && typeof view.destroy === 'function') {
                            view.destroy();
                        }
                    }
                });
            } else {
                host.error(`[${FEATURE_ID}] BabelMazeView not found after loading`);
            }

            host.log(`[${FEATURE_ID}] Initialized`);
        }
    });
})();
