/* Techne Maze Plugin
   Babel Maze - MUD-style knowledge base explorer inspired by Borges' Library of Babel.
   Transforms Markdown files into explorable rooms with wiki-style links as corridors.
*/

(function () {
    const PLUGIN_ID = 'techne-maze';

    window.TechnePlugins.register({
        id: PLUGIN_ID,

        async init(host) {
            host.log(`[${PLUGIN_ID}] Initializing...`);

            // Load maze styles
            await host.loadCSS(`plugins/${PLUGIN_ID}/babel-maze.css`);

            // Load the BabelMazeView class
            await host.loadScript(`plugins/${PLUGIN_ID}/BabelMazeView.js`);

            // Expose the view class globally for mode registration
            if (window.BabelMazeView) {
                host.log(`[${PLUGIN_ID}] BabelMazeView loaded successfully`);

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
                host.error(`[${PLUGIN_ID}] BabelMazeView not found after loading`);
            }

            host.log(`[${PLUGIN_ID}] Initialized`);
        }
    });
})();
