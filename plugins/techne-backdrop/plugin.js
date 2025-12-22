/* Techne Backdrop Plugin
   - Shapes + rotating shapes + fauna overlay layers for Techne theme.
   - Self-contained so it can be extracted to its own repo.
*/

(function () {
    const baseUrl = (() => {
        const src = document.currentScript?.src;
        if (src) return new URL('./', src).toString();
        return 'plugins/techne-backdrop/';
    })();

    const resolve = (rel) => new URL(rel, baseUrl).toString();

    window.TechnePlugins?.register?.({
        id: 'techne-backdrop',
        name: 'Techne Backdrop',
        version: '0.1.0',
        async init(host) {
            await host.loadCSS(resolve('techne-backdrop-layers.css'));
            const scripts = [resolve('techne-backdrop-markup.js')];
            if (typeof window.FaunaOverlay !== 'function') {
                scripts.push(resolve('fauna-overlay.js'));
            }
            scripts.push(resolve('techne-backdrop.js'));
            await host.loadScriptsSequential(scripts);
        },
        destroy() {
            // Clean up the backdrop when plugin is disabled
            if (window.TechneBackdrop?.destroy) {
                window.TechneBackdrop.destroy();
            }
        }
    });
})();
