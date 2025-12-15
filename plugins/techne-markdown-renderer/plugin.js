(function () {
    const PLUGIN_ID = 'techne-markdown-renderer';
    const BASE = 'plugins/techne-markdown-renderer';

    const register = () => {
        if (!window.TechnePlugins?.register) return;

        window.TechnePlugins.register({
            id: PLUGIN_ID,
            init: async (host) => {
                await host.loadCSS(`${BASE}/techne-markdown-renderer.css`, { id: `${PLUGIN_ID}-css` });

                const scripts = [];
                if (!window.previewZoom) scripts.push(`${BASE}/previewZoom.js`);
                if (!window.TechneMarkdownRenderer) scripts.push(`${BASE}/techne-markdown-renderer.js`);

                if (scripts.length) {
                    await host.loadScriptsSequential(scripts);
                }

                host.emit('markdown-renderer:ready', { id: PLUGIN_ID });
            }
        });
    };

    register();
})();

