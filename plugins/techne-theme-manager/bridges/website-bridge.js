/* Website Bridge — Machine Spirits
   Syncs techne-theme-manager state to legacy body classes used by main.css
   and injects a theme-picker button.
   Loaded automatically by the plugin when running inside machinespirits-website.
*/

(function () {
    'use strict';

    // Map plugin theme IDs → legacy website body classes
    const LEGACY_CLASSES = {
        'light': [],
        'dark': ['theme-dark'],
        'techne-red': ['theme-dark'],
        'techne-orange': ['theme-dark', 'theme-orange'],
        'solarized-light': [],
        'solarized-dark': ['theme-dark']
    };

    const ALL_LEGACY = ['theme-dark', 'theme-orange'];

    function syncLegacyClasses(themeId) {
        ALL_LEGACY.forEach(cls => document.body.classList.remove(cls));
        const classes = LEGACY_CLASSES[themeId] || [];
        classes.forEach(cls => document.body.classList.add(cls));
    }

    // ── Floating theme button ───────────────────────────────────────

    function injectThemeButton() {
        if (document.getElementById('techne-theme-btn')) return;

        const btn = document.createElement('button');
        btn.id = 'techne-theme-btn';
        btn.type = 'button';
        btn.title = 'Theme Editor';
        btn.setAttribute('aria-label', 'Open Theme Editor');
        btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><path d="M8 2a6 6 0 0 1 0 12V2z" fill="currentColor" opacity="0.3"/><circle cx="8" cy="5" r="1.2" fill="currentColor"/><circle cx="5.5" cy="8" r="1.2" fill="currentColor"/><circle cx="8" cy="11" r="1.2" fill="currentColor"/></svg>`;
        btn.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 20px;
            z-index: 9000;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            border: 1px solid var(--techne-border, rgba(255,255,255,0.1));
            background: var(--techne-glass-bg, rgba(10,10,10,0.7));
            color: var(--techne-text-muted, #888);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            transition: transform 0.15s, color 0.15s;
        `;
        btn.addEventListener('mouseenter', () => {
            btn.style.transform = 'scale(1.1)';
            btn.style.color = 'var(--techne-accent, #E63946)';
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.transform = 'scale(1)';
            btn.style.color = 'var(--techne-text-muted, #888)';
        });
        btn.addEventListener('click', () => {
            if (window.techneThemeEditorUI) {
                window.techneThemeEditorUI.show();
            }
        });

        document.body.appendChild(btn);
    }

    // ── Init ────────────────────────────────────────────────────────

    // Listen for plugin theme changes
    document.addEventListener('techne-theme-changed', (e) => {
        syncLegacyClasses(e.detail.themeId);
    });

    // Sync on load if theme manager already initialized
    if (window.techneThemeManager) {
        const current = window.techneThemeManager.getActiveTheme();
        if (current) syncLegacyClasses(current);
    }

    // Inject theme button when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectThemeButton);
    } else {
        injectThemeButton();
    }
})();
