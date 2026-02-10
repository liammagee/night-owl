/* Techne Theme Manager Plugin
   - Unified design tokens, theme switching, and theme editing.
   - Defines canonical --techne-* CSS custom properties.
   - Each host app provides an adapter CSS that maps --techne-* → app-specific vars.
   - Bridge scripts sync plugin state to each app's native theming mechanism.
*/

(function () {
    const baseUrl = (() => {
        const src = document.currentScript?.src;
        if (src) return new URL('./', src).toString();
        return 'plugins/techne-theme-manager/';
    })();

    const resolve = (rel) => new URL(rel, baseUrl).toString();

    // Detect host app by probing for adapter CSS
    const HOST_ADAPTERS = [
        { path: 'styles/techne-theme-adapter.css', bridge: 'bridges/website-bridge.js' },
        { path: 'css/techne-theme-adapter.css',    bridge: 'bridges/nightowl-bridge.js' }
    ];

    window.TechnePlugins?.register?.({
        id: 'techne-theme-manager',
        name: 'Techne Theme Manager',
        version: '0.2.0',
        settings: {
            activeTheme: {
                type: 'select',
                label: 'Active Theme',
                options: [
                    { value: 'light', label: 'Light' },
                    { value: 'dark', label: 'Dark' },
                    { value: 'techne-red', label: 'Techne Red' },
                    { value: 'techne-orange', label: 'Techne Orange' }
                ],
                default: 'light'
            },
            followSystem: {
                type: 'boolean',
                label: 'Follow system light/dark preference',
                default: false
            }
        },
        async init(host) {
            // 1. Load canonical tokens
            await host.loadCSS(resolve('techne-tokens.css'));

            // 2. Load host-provided adapter CSS + bridge script
            for (const adapter of HOST_ADAPTERS) {
                try {
                    const resp = await fetch(adapter.path, { method: 'HEAD' });
                    if (resp.ok) {
                        await host.loadCSS(adapter.path);
                        await host.loadScript(resolve(adapter.bridge));
                        break;
                    }
                } catch (_) { /* not found, try next */ }
            }

            // 3. Load theme definitions + core manager
            await host.loadScript(resolve('themes.js'));
            await host.loadScript(resolve('theme-manager.js'));

            // 4. Load theme editor
            await host.loadScript(resolve('theme-editor.js'));
            await host.loadScript(resolve('theme-editor-ui.js'));

            // 5. Initialize the manager with the host API
            if (window.techneThemeManager) {
                window.techneThemeManager._init(host);
            }
        },
        destroy() {
            if (window.techneThemeManager) {
                window.techneThemeManager._destroy();
            }
        }
    });
})();
