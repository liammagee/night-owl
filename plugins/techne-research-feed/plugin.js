/* Techne Research Feed plugin
   Sidebar panel that polls arxiv / reddit / bluesky / mastodon / google /
   x.com (logged-in session) for new posts and ranks them by relevance to
   what the user is currently writing.

   The plugin runs in the renderer; all networking goes through IPC handlers
   in /ipc/feedHandlers.js so we never touch external origins from the page
   context. Polling state and the SQLite cache are owned by the main process.
*/

(function () {
    'use strict';

    const PLUGIN_ID = 'techne-research-feed';

    window.TechnePlugins.register({
        id: PLUGIN_ID,

        async init(host) {
            host.log(`[${PLUGIN_ID}] Initializing...`);

            if (!host.isElectron || !host.electronAPI) {
                host.warn(`[${PLUGIN_ID}] Requires Electron host; disabling.`);
                return;
            }

            await host.loadCSS(`plugins/${PLUGIN_ID}/feed-panel.css`);
            await host.loadScript(`plugins/${PLUGIN_ID}/feed-panel.js`);

            if (!window.ResearchFeedPanel) {
                host.error(`[${PLUGIN_ID}] feed-panel.js failed to expose ResearchFeedPanel`);
                return;
            }

            const panel = new window.ResearchFeedPanel(host);
            await panel.mount();

            // Expose a global toggler so menu wiring / keybindings can reach it later.
            window.toggleResearchFeedPanel = () => panel.toggle();

            host.emit('research-feed:ready', { panel });
            host.log(`[${PLUGIN_ID}] Ready.`);
        }
    });
})();
