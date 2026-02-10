/* NightOwl Bridge
   Syncs techne-theme-manager state to NightOwl's dark-mode/light-mode classes
   and Monaco editor theme. Loaded automatically when running inside NightOwl.
*/

(function () {
    'use strict';

    const DARK_THEMES = ['dark', 'techne-red', 'techne-orange'];

    function syncNightOwl(themeId) {
        const isDark = DARK_THEMES.includes(themeId);

        // Sync body classes
        document.body.classList.remove('dark-mode', 'light-mode');
        document.body.classList.add(isDark ? 'dark-mode' : 'light-mode');

        // Sync Techne overlay classes
        document.body.classList.remove('techne-theme', 'techne-accent-orange');
        if (themeId === 'techne-red' || themeId === 'techne-orange') {
            document.body.classList.add('techne-theme');
            if (themeId === 'techne-orange') {
                document.body.classList.add('techne-accent-orange');
            }
        }

        // Sync Monaco editor theme
        if (window.monaco && window.monaco.editor) {
            window.monaco.editor.setTheme(isDark ? 'markdown-dark' : 'markdown-light');
        }

        // Dispatch NightOwl's native event for other listeners
        window.dispatchEvent(new CustomEvent('app-theme-changed', {
            detail: {
                preference: themeId,
                applied: themeId,
                isDark
            }
        }));
    }

    // Listen for plugin theme changes
    document.addEventListener('techne-theme-changed', (e) => {
        syncNightOwl(e.detail.themeId);
    });

    // Sync on load if theme manager already initialized
    if (window.techneThemeManager) {
        const current = window.techneThemeManager.getActiveTheme();
        if (current) syncNightOwl(current);
    }
})();
