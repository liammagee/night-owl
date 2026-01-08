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
                if (!window.TechneBibtexParser) scripts.push(`${BASE}/bibtexParser.js`);
                if (!window.TechneCitationRenderer) scripts.push(`${BASE}/citationRenderer.js`);
                if (!window.TechneMarkdownRenderer) scripts.push(`${BASE}/techne-markdown-renderer.js`);

                if (scripts.length) {
                    await host.loadScriptsSequential(scripts);
                }

                // Inject citation renderer CSS
                if (window.TechneCitationRenderer?.getCSS) {
                    const style = document.createElement('style');
                    style.id = `${PLUGIN_ID}-citation-css`;
                    style.textContent = window.TechneCitationRenderer.getCSS();
                    document.head.appendChild(style);
                }

                // Auto-load bibliography files
                if (window.TechneBibtexParser && !window.bibEntries?.length) {
                    try {
                        await window.TechneBibtexParser.loadAndSetGlobal('/markdown/references.bib');
                        console.log(`[${PLUGIN_ID}] Loaded references.bib`);

                        // Also load exported_items.bib and merge
                        const exported = await window.TechneBibtexParser.loadFromFile('/markdown/exported_items.bib');
                        if (exported?.length) {
                            window.TechneBibtexParser.addEntries(exported);
                            console.log(`[${PLUGIN_ID}] Added ${exported.length} entries from exported_items.bib`);
                        }

                        console.log(`[${PLUGIN_ID}] Bibliography loaded: ${window.bibEntries?.length || 0} entries`);
                        host.emit('bibliography:loaded', { count: window.bibEntries?.length || 0 });
                    } catch (err) {
                        console.warn(`[${PLUGIN_ID}] Failed to load bibliography:`, err);
                    }
                }

                host.emit('markdown-renderer:ready', { id: PLUGIN_ID });
            }
        });
    };

    register();
})();
