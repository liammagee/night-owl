/* NightOwl Bridge
   Syncs techne-theme-manager state to NightOwl's dark-mode/light-mode classes
   and Monaco editor theme. Loaded automatically when running inside NightOwl.
*/

(function () {
    'use strict';

    const DARK_THEMES = ['dark', 'techne-red', 'techne-orange', 'solarized-dark'];

    // Themes with custom --techne-bg tokens that need a dynamic Monaco theme
    const CUSTOM_BG_THEMES = [
        'techne-red', 'techne-orange', 'solarized-light', 'solarized-dark'
    ];

    /**
     * Build a Monaco theme from computed --techne-* CSS custom properties.
     * Falls back to markdown-light / markdown-dark when tokens aren't available.
     */
    function syncMonacoTheme(themeId, isDark) {
        if (!window.monaco || !window.monaco.editor) return;

        // Only build a dynamic theme for themes with custom backgrounds
        if (!CUSTOM_BG_THEMES.includes(themeId)) {
            window._techneMonacoReady = false;
            monaco.editor.setTheme(isDark ? 'markdown-dark' : 'markdown-light');
            return;
        }

        // Read computed techne tokens (set on :root by theme-manager)
        const style = getComputedStyle(document.documentElement);
        const get = (prop) => style.getPropertyValue(prop).trim();

        const bg      = get('--techne-bg');
        const surface  = get('--techne-surface');
        const surfaceEl = get('--techne-surface-elevated');
        const text     = get('--techne-text');
        const textMuted = get('--techne-text-muted');
        const accent   = get('--techne-accent');
        const border   = get('--techne-border');

        if (!bg) {
            // Tokens not yet available — fall back
            monaco.editor.setTheme(isDark ? 'markdown-dark' : 'markdown-light');
            return;
        }

        const hex = (c) => c.replace('#', '');

        monaco.editor.defineTheme('techne-custom', {
            base: isDark ? 'vs-dark' : 'vs',
            inherit: true,
            rules: [
                { token: 'string.link', foreground: hex(accent) },
                { token: 'string.target', foreground: hex(accent) }
            ],
            colors: {
                'editor.background': bg,
                'editor.foreground': text,
                'editor.lineHighlightBackground': surface,
                'editor.selectionBackground': isDark
                    ? surfaceEl
                    : accent + '30',
                'editor.inactiveSelectionBackground': surface + (isDark ? '' : '80'),
                'editorLineNumber.foreground': textMuted,
                'editorLineNumber.activeForeground': text,
                'editorCursor.foreground': text,
                'editorLink.activeForeground': accent,
                'editorGutter.background': bg,
                'editorWidget.background': surface,
                'editorWidget.border': border,
                'editorSuggestWidget.background': surface,
                'editorSuggestWidget.border': border,
                'editorHoverWidget.background': surface,
                'editorHoverWidget.border': border,
                'input.background': bg,
                'input.border': border,
                'input.foreground': text,
                'dropdown.background': surface,
                'dropdown.border': border,
                'list.hoverBackground': surfaceEl,
                'list.activeSelectionBackground': accent + '40',
                'scrollbarSlider.background': border + '60',
                'scrollbarSlider.hoverBackground': textMuted + '60'
            }
        });

        monaco.editor.setTheme('techne-custom');
        window._techneMonacoReady = true;
    }

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

        // Sync Monaco editor theme (dynamic for custom-bg themes)
        syncMonacoTheme(themeId, isDark);

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
