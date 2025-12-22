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

                // Emit mode:available if UnifiedNetworkVisualization is loaded
                if (window.UnifiedNetworkVisualization) {
                    host.log(`[${PLUGIN_ID}] UnifiedNetworkVisualization loaded, registering mode`);
                    host.emit('mode:available', {
                        id: 'network-diagram',
                        title: 'Network Diagram',
                        icon: '🕸️',
                        mount: async (container, options = {}) => {
                            const viz = new window.UnifiedNetworkVisualization();

                            // Parse content if provided as JSON string
                            let data = { nodes: [], edges: [] };
                            if (options.content) {
                                try {
                                    data = typeof options.content === 'string'
                                        ? JSON.parse(options.content)
                                        : options.content;
                                } catch (e) {
                                    host.warn('Failed to parse network data:', e);
                                }
                            }

                            await viz.initialize(container, {
                                showControls: true,
                                enableSelection: true,
                                ...options
                            });

                            // If test data provided, set nodes/links directly and re-render
                            if (data.nodes?.length > 0) {
                                viz.nodes = data.nodes.map(n => ({
                                    ...n,
                                    type: n.type || 'file',
                                    name: n.label || n.name || n.id
                                }));
                                viz.links = (data.edges || data.links || []).map(l => ({
                                    ...l,
                                    type: l.type || 'reference'
                                }));
                                // Follow the same sequence as refresh()
                                viz.assignNodeLayout();
                                viz.createSimulation();
                                viz.render();
                                viz.updateStats();
                            }

                            return viz;
                        },
                        unmount: (view) => {
                            if (view && typeof view.destroy === 'function') {
                                view.destroy();
                            }
                        }
                    });
                }

                host.emit('network-diagram:ready', { id: PLUGIN_ID });
            }
        });
    };

    register();
})();

