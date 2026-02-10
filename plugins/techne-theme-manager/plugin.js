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

    // Detect host app: Electron (NightOwl) vs browser (website)
    const isElectron = typeof window.electronAPI !== 'undefined';
    const HOST_ADAPTER = isElectron
        ? { path: 'css/techne-theme-adapter.css',    bridge: 'bridges/nightowl-bridge.js' }
        : { path: 'styles/techne-theme-adapter.css', bridge: 'bridges/website-bridge.js' };

    window.TechnePlugins?.register?.({
        id: 'techne-theme-manager',
        name: 'Techne Theme Manager',
        version: '0.2.1',
        settings: {
            activeTheme: {
                type: 'select',
                label: 'Active Theme',
                options: [
                    { value: 'light', label: 'Light' },
                    { value: 'dark', label: 'Dark' },
                    { value: 'techne-red', label: 'Techne Red' },
                    { value: 'techne-orange', label: 'Techne Orange' },
                    { value: 'solarized-light', label: 'Solarized Light' },
                    { value: 'solarized-dark', label: 'Solarized Dark' }
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
            try {
                const adapterOk = await host.loadCSS(HOST_ADAPTER.path);
                if (adapterOk) {
                    await host.loadScript(resolve(HOST_ADAPTER.bridge));
                }
            } catch (e) { console.warn('[techne-theme-manager] adapter/bridge skipped:', e); }

            // 3. Load theme definitions + core manager
            await host.loadScript(resolve('themes.js'));
            await host.loadScript(resolve('theme-manager.js'));

            // 4. Load theme editor
            await host.loadScript(resolve('theme-editor.js'));
            await host.loadScript(resolve('theme-editor-ui.js'));

            // 5. Initialize the manager with the host API
            if (window.techneThemeManager) {
                window.techneThemeManager._init(host);
                console.log('[techne-theme-manager] ready, theme:', window.techneThemeManager.getActiveTheme());
            }
        },
        destroy() {
            if (window.techneThemeManager) {
                window.techneThemeManager._destroy();
            }
        }
    });
})();
