/* NightOwl Bridge
   Syncs techne-theme-manager state to NightOwl's dark-mode/light-mode classes,
   Monaco editor theme, and injects a theme-picker toolbar button.
   Loaded automatically when running inside NightOwl.
*/

(function () {
    'use strict';

    const DARK_THEMES = ['dark', 'techne-red', 'techne-orange', 'solarized-dark'];

    // ── Monaco dynamic theme ────────────────────────────────────────

    function hexToRGB(hex) {
        hex = hex.replace('#', '');
        if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
        const n = parseInt(hex, 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }

    function buildMonacoTheme(isDark) {
        const s = getComputedStyle(document.documentElement);
        const bg      = s.getPropertyValue('--techne-bg').trim()      || (isDark ? '#1e1e1e' : '#ffffff');
        const surface = s.getPropertyValue('--techne-surface').trim() || (isDark ? '#252526' : '#f8fafc');
        const text    = s.getPropertyValue('--techne-text').trim()    || (isDark ? '#d4d4d4' : '#1e293b');
        const muted   = s.getPropertyValue('--techne-text-muted').trim() || (isDark ? '#6b6b6b' : '#94a3b8');
        const accent  = s.getPropertyValue('--techne-accent').trim()  || (isDark ? '#818cf8' : '#6366f1');
        const border  = s.getPropertyValue('--techne-border').trim()  || (isDark ? '#3c3c3c' : '#e2e8f0');

        return {
            base: isDark ? 'vs-dark' : 'vs',
            inherit: true,
            rules: [
                { token: '',            foreground: text.replace('#','') },
                { token: 'comment',     foreground: muted.replace('#',''), fontStyle: 'italic' },
                { token: 'keyword',     foreground: accent.replace('#','') },
                { token: 'string',      foreground: isDark ? '98c379' : '50a14f' },
                { token: 'number',      foreground: isDark ? 'd19a66' : 'b76b01' },
                { token: 'type',        foreground: accent.replace('#','') }
            ],
            colors: {
                'editor.background':                bg,
                'editor.foreground':                text,
                'editor.lineHighlightBackground':   surface,
                'editorLineNumber.foreground':       muted,
                'editorCursor.foreground':           accent,
                'editor.selectionBackground':        accent + '40',
                'editor.inactiveSelectionBackground': accent + '20',
                'editorIndentGuide.background':       border,
                'editorWidget.background':            surface,
                'editorWidget.border':                border,
                'editorGutter.background':            bg,
                'minimap.background':                 bg,
                'scrollbarSlider.background':          border + '80',
                'scrollbarSlider.hoverBackground':     muted + '60'
            }
        };
    }

    function applyMonacoTheme(isDark) {
        if (!window.monaco?.editor) return;
        try {
            const themeDef = buildMonacoTheme(isDark);
            window.monaco.editor.defineTheme('techne-custom', themeDef);
            window.monaco.editor.setTheme('techne-custom');
        } catch (e) {
            // Fallback to built-in
            window.monaco.editor.setTheme(isDark ? 'markdown-dark' : 'markdown-light');
        }
    }

    // ── Sync classes + Monaco ───────────────────────────────────────

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

        // Apply dynamic Monaco theme from current tokens (runs after CSS vars settle)
        requestAnimationFrame(() => applyMonacoTheme(isDark));

        // Dispatch NightOwl's native event for other listeners
        window.dispatchEvent(new CustomEvent('app-theme-changed', {
            detail: {
                preference: themeId,
                applied: themeId,
                isDark
            }
        }));
    }

    // ── Toolbar button ──────────────────────────────────────────────

    function injectToolbarButton() {
        // Find the panes-area (far right of mode-switcher)
        const toolbar = document.querySelector('#mode-switcher') ||
                        document.querySelector('#editor-toolbar');
        if (!toolbar) return;

        // Don't inject twice
        if (document.getElementById('techne-theme-btn')) return;

        const btn = document.createElement('button');
        btn.id = 'techne-theme-btn';
        btn.type = 'button';
        btn.title = 'Theme Editor';
        btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><path d="M8 2a6 6 0 0 1 0 12V2z" fill="currentColor" opacity="0.3"/><circle cx="8" cy="5" r="1.2" fill="currentColor"/><circle cx="5.5" cy="8" r="1.2" fill="currentColor"/><circle cx="8" cy="11" r="1.2" fill="currentColor"/></svg>`;
        btn.style.cssText = 'background:none;border:none;color:var(--text-color,#666);cursor:pointer;padding:4px 6px;border-radius:4px;display:flex;align-items:center;';
        btn.addEventListener('mouseenter', () => { btn.style.background = 'var(--hover-color, rgba(0,0,0,0.06))'; });
        btn.addEventListener('mouseleave', () => { btn.style.background = 'none'; });
        btn.addEventListener('click', () => {
            if (window.techneThemeEditorUI) {
                window.techneThemeEditorUI.show();
            }
        });

        toolbar.appendChild(btn);
    }

    // ── Init ────────────────────────────────────────────────────────

    // Listen for plugin theme changes
    document.addEventListener('techne-theme-changed', (e) => {
        syncNightOwl(e.detail.themeId);
    });

    // Sync on load if theme manager already initialized
    if (window.techneThemeManager) {
        const current = window.techneThemeManager.getActiveTheme();
        if (current) syncNightOwl(current);
    }

    // Inject toolbar button when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectToolbarButton);
    } else {
        // DOM already ready, but toolbar may not exist yet — retry briefly
        setTimeout(injectToolbarButton, 500);
    }
})();
