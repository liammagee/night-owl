(function () {
    const PLUGIN_ID = 'techne-network-diagram';
    const BASE = 'plugins/techne-network-diagram';

    const register = () => {
        if (!window.TechnePlugins?.register) return;

        window.TechnePlugins.register({
            id: PLUGIN_ID,
            init: async (host) => {
                const scripts = [];
                if (!window.d3) scripts.push('lib/d3.min.js');
                if (!window.UnifiedNetworkVisualization) scripts.push(`${BASE}/unified-network.js`);

                if (scripts.length) {
                    await host.loadScriptsSequential(scripts);
                }

                host.emit('network-diagram:ready', { id: PLUGIN_ID });
            }
        });
    };

    register();
})();

