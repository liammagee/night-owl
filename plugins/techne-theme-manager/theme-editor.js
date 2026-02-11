/* Techne Theme Editor — Preset & Custom Theme Engine
   Extracted from NightOwl's theme-editor.js.
   Manages built-in presets, custom theme CRUD, and variable groups.
   Persistence: host.setSetting() with localStorage fallback.
*/

(function () {
    'use strict';

    const STORAGE_KEY = 'techne-theme-custom-themes';
    const ACTIVE_KEY  = 'techne-theme-active-custom';

    // ── Built-in presets (from NightOwl) ──

    const PRESETS = {
        solarized_light: {
            name: 'Solarized Light',
            base: 'light',
            vars: {
                '--techne-bg': '#fdf6e3',
                '--techne-surface': '#eee8d5',
                '--techne-surface-elevated': '#e0daca',
                '--techne-text': '#657b83',
                '--techne-text-muted': '#93a1a1',
                '--techne-accent': '#268bd2',
                '--techne-accent-hover': '#2176b5',
                '--techne-accent-active': '#1a5e94',
                '--techne-border': '#d5cec0',
                '--techne-border-subtle': '#e0daca',
                '--techne-glass-bg': 'rgba(253, 246, 227, 0.85)',
                '--techne-glass-border': 'rgba(253, 246, 227, 0.18)'
            }
        },
        solarized_dark: {
            name: 'Solarized Dark',
            base: 'dark',
            vars: {
                '--techne-bg': '#002b36',
                '--techne-surface': '#073642',
                '--techne-surface-elevated': '#0a4050',
                '--techne-text': '#839496',
                '--techne-text-muted': '#586e75',
                '--techne-accent': '#268bd2',
                '--techne-accent-hover': '#2176b5',
                '--techne-accent-active': '#1a5e94',
                '--techne-border': '#0a4050',
                '--techne-border-subtle': '#073642',
                '--techne-glass-bg': 'rgba(0, 43, 54, 0.85)',
                '--techne-glass-border': 'rgba(7, 54, 66, 0.18)'
            }
        },
        nord: {
            name: 'Nord',
            base: 'dark',
            vars: {
                '--techne-bg': '#2e3440',
                '--techne-surface': '#3b4252',
                '--techne-surface-elevated': '#434c5e',
                '--techne-text': '#d8dee9',
                '--techne-text-muted': '#4c566a',
                '--techne-accent': '#88c0d0',
                '--techne-accent-hover': '#81a1c1',
                '--techne-accent-active': '#5e81ac',
                '--techne-border': '#4c566a',
                '--techne-border-subtle': '#3b4252',
                '--techne-glass-bg': 'rgba(46, 52, 64, 0.85)',
                '--techne-glass-border': 'rgba(59, 66, 82, 0.18)'
            }
        },
        monokai: {
            name: 'Monokai',
            base: 'dark',
            vars: {
                '--techne-bg': '#272822',
                '--techne-surface': '#3e3d32',
                '--techne-surface-elevated': '#49483e',
                '--techne-text': '#f8f8f2',
                '--techne-text-muted': '#75715e',
                '--techne-accent': '#a6e22e',
                '--techne-accent-hover': '#8dc820',
                '--techne-accent-active': '#74a81a',
                '--techne-border': '#49483e',
                '--techne-border-subtle': '#3e3d32',
                '--techne-glass-bg': 'rgba(39, 40, 34, 0.85)',
                '--techne-glass-border': 'rgba(62, 61, 50, 0.18)'
            }
        },
        sepia: {
            name: 'Sepia',
            base: 'light',
            vars: {
                '--techne-bg': '#f5f0e8',
                '--techne-surface': '#ebe4d8',
                '--techne-surface-elevated': '#e0d8c8',
                '--techne-text': '#5b4636',
                '--techne-text-muted': '#a08c78',
                '--techne-accent': '#8b6914',
                '--techne-accent-hover': '#755810',
                '--techne-accent-active': '#5e470d',
                '--techne-border': '#d5c8b8',
                '--techne-border-subtle': '#e0d8c8',
                '--techne-glass-bg': 'rgba(245, 240, 232, 0.85)',
                '--techne-glass-border': 'rgba(235, 228, 216, 0.18)'
            }
        },
        dracula: {
            name: 'Dracula',
            base: 'dark',
            vars: {
                '--techne-bg': '#282a36',
                '--techne-surface': '#343746',
                '--techne-surface-elevated': '#44475a',
                '--techne-text': '#f8f8f2',
                '--techne-text-muted': '#6272a4',
                '--techne-accent': '#bd93f9',
                '--techne-accent-hover': '#a070e0',
                '--techne-accent-active': '#8858c8',
                '--techne-border': '#44475a',
                '--techne-border-subtle': '#343746',
                '--techne-glass-bg': 'rgba(40, 42, 54, 0.85)',
                '--techne-glass-border': 'rgba(52, 55, 70, 0.18)'
            }
        },
        github_light: {
            name: 'GitHub Light',
            base: 'light',
            vars: {
                '--techne-bg': '#ffffff',
                '--techne-surface': '#f6f8fa',
                '--techne-surface-elevated': '#ebeef1',
                '--techne-text': '#1f2328',
                '--techne-text-muted': '#8b949e',
                '--techne-accent': '#0969da',
                '--techne-accent-hover': '#0550ae',
                '--techne-accent-active': '#033d8b',
                '--techne-border': '#d0d7de',
                '--techne-border-subtle': '#ebeef1',
                '--techne-glass-bg': 'rgba(255, 255, 255, 0.85)',
                '--techne-glass-border': 'rgba(246, 248, 250, 0.18)'
            }
        }
    };

    // ── Editable variable groups ──

    const VAR_GROUPS = [
        {
            label: 'Surfaces',
            vars: ['--techne-bg', '--techne-surface', '--techne-surface-elevated']
        },
        {
            label: 'Text',
            vars: ['--techne-text', '--techne-text-muted', '--techne-text-inverted']
        },
        {
            label: 'Accent',
            vars: ['--techne-accent', '--techne-accent-hover', '--techne-accent-active']
        },
        {
            label: 'Borders',
            vars: ['--techne-border', '--techne-border-subtle']
        },
        {
            label: 'Semantic',
            vars: ['--techne-success', '--techne-warning', '--techne-error']
        },
        {
            label: 'Glass',
            vars: ['--techne-glass-bg', '--techne-glass-border']
        }
    ];

    // ── Storage ──

    let _host = null;

    function loadCustomThemes() {
        // Try host settings first
        if (_host?.getSetting) {
            const v = _host.getSetting('customThemes');
            if (v && typeof v === 'object') return v;
        }
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            return stored ? JSON.parse(stored) : {};
        } catch (_) { return {}; }
    }

    function saveCustomThemes(themes) {
        if (_host?.setSetting) {
            _host.setSetting('customThemes', themes);
        }
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(themes));
        } catch (_) { /* ignore */ }
    }

    function getActiveCustomTheme() {
        if (_host?.getSetting) {
            const v = _host.getSetting('activeCustomTheme');
            if (v) return v;
        }
        try { return localStorage.getItem(ACTIVE_KEY) || null; } catch (_) { return null; }
    }

    function setActiveCustomTheme(id) {
        if (_host?.setSetting) {
            _host.setSetting('activeCustomTheme', id || '');
        }
        try {
            if (id) localStorage.setItem(ACTIVE_KEY, id);
            else localStorage.removeItem(ACTIVE_KEY);
        } catch (_) { /* ignore */ }
    }

    // ── Apply helpers ──

    function applyThemeVars(vars) {
        const root = document.documentElement;
        for (const [key, value] of Object.entries(vars)) {
            root.style.setProperty(key, value);
        }
    }

    function clearThemeVars() {
        const root = document.documentElement;
        const allVars = new Set();
        for (const group of VAR_GROUPS) {
            group.vars.forEach(v => allVars.add(v));
        }
        for (const preset of Object.values(PRESETS)) {
            Object.keys(preset.vars).forEach(v => allVars.add(v));
        }
        allVars.forEach(v => root.style.removeProperty(v));
    }

    function applyPreset(presetId) {
        const preset = PRESETS[presetId];
        if (!preset) return;

        clearThemeVars();
        applyThemeVars(preset.vars);

        // Use theme manager to set base mode
        const themeId = preset.base === 'dark' ? 'dark' : 'light';
        if (window.techneThemeManager) {
            window.techneThemeManager.applyTheme(themeId);
        }

        // Apply preset-specific vars on top (after theme manager sets defaults)
        applyThemeVars(preset.vars);

        setActiveCustomTheme('preset:' + presetId);
    }

    function applyCustomTheme(themeId) {
        const themes = loadCustomThemes();
        const theme = themes[themeId];
        if (!theme) return;

        clearThemeVars();

        // Use theme manager to set base mode
        const baseTheme = theme.base === 'dark' ? 'dark' : 'light';
        if (window.techneThemeManager) {
            window.techneThemeManager.applyTheme(baseTheme);
        }

        applyThemeVars(theme.vars);
        setActiveCustomTheme('custom:' + themeId);
    }

    function resetToDefault() {
        clearThemeVars();
        setActiveCustomTheme(null);
        if (window.techneThemeManager) {
            window.techneThemeManager.applyTheme('light');
        }
    }

    // ── Color conversion helper ──

    function toHex(color) {
        if (!color || color === 'transparent') return '#000000';
        if (color.startsWith('#')) {
            if (color.length === 4) {
                return '#' + color[1] + color[1] + color[2] + color[2] + color[3] + color[3];
            }
            return color.slice(0, 7);
        }
        const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (match) {
            const r = parseInt(match[1]).toString(16).padStart(2, '0');
            const g = parseInt(match[2]).toString(16).padStart(2, '0');
            const b = parseInt(match[3]).toString(16).padStart(2, '0');
            return `#${r}${g}${b}`;
        }
        return '#000000';
    }

    // ── Restore on load ──

    function _prefersDark() {
        try { return localStorage.getItem('techne-dark') === 'on'; } catch (_) { return false; }
    }

    function _swapPresetDarkLight(presetId, wantDark) {
        const preset = PRESETS[presetId];
        if (!preset) return presetId;
        const isDark = preset.base === 'dark';
        if (isDark === wantDark) return presetId; // already matches
        // Try to find the counterpart: solarized_light ↔ solarized_dark
        const base = presetId.replace(/_light$|_dark$/, '');
        const target = base + (wantDark ? '_dark' : '_light');
        if (PRESETS[target]) return target;
        return presetId; // no counterpart, keep as-is
    }

    function restoreTheme() {
        const active = getActiveCustomTheme();
        if (!active) return;
        const wantDark = _prefersDark();

        if (active.startsWith('preset:')) {
            const id = _swapPresetDarkLight(active.replace('preset:', ''), wantDark);
            if (PRESETS[id]) {
                setTimeout(() => applyPreset(id), 300);
            }
        } else if (active.startsWith('custom:')) {
            const id = active.replace('custom:', '');
            setTimeout(() => {
                applyCustomTheme(id);
                // For custom themes, ensure base mode matches dark preference
                if (wantDark && window.techneThemeManager) {
                    window.techneThemeManager.applyTheme('dark');
                }
            }, 300);
        }
    }

    // ── Public API ──

    window.techneThemeEditor = {
        getPresets: () => ({ ...PRESETS }),
        getVarGroups: () => VAR_GROUPS.map(g => ({ ...g, vars: [...g.vars] })),
        loadCustomThemes,
        saveCustomThemes,
        getActiveCustomTheme,
        setActiveCustomTheme,
        applyPreset,
        applyCustomTheme,
        applyThemeVars,
        clearThemeVars,
        resetToDefault,
        toHex,
        restoreTheme,
        _setHost(host) { _host = host; }
    };

    // Auto-restore if we load after theme-manager
    if (window.techneThemeManager) {
        restoreTheme();
    }
})();
