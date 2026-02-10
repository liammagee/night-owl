/* Website Bridge — Machine Spirits
   Syncs techne-theme-manager state to legacy body classes used by main.css.
   Loaded automatically by the plugin when running inside machinespirits-website.
*/

(function () {
    'use strict';

    // Map plugin theme IDs → legacy website body classes
    const LEGACY_CLASSES = {
        'light': [],
        'dark': ['theme-dark'],
        'techne-red': ['theme-dark'],
        'techne-orange': ['theme-dark', 'theme-orange']
    };

    const ALL_LEGACY = ['theme-dark', 'theme-orange'];

    function syncLegacyClasses(themeId) {
        ALL_LEGACY.forEach(cls => document.body.classList.remove(cls));
        const classes = LEGACY_CLASSES[themeId] || [];
        classes.forEach(cls => document.body.classList.add(cls));
    }

    // Listen for plugin theme changes
    document.addEventListener('techne-theme-changed', (e) => {
        syncLegacyClasses(e.detail.themeId);
    });

    // Sync on load if theme manager already initialized
    if (window.techneThemeManager) {
        const current = window.techneThemeManager.getActiveTheme();
        if (current) syncLegacyClasses(current);
    }
})();
