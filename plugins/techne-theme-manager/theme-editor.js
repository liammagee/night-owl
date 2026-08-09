/* Techne Theme Editor — Preset & Custom Theme Engine
   Extracted from NightOwl's theme-editor.js.
   Manages built-in presets, custom theme CRUD, and variable groups.
   Persistence: host.setSetting() with localStorage fallback.
*/

(function () {
    'use strict';

    const STORAGE_KEY = 'techne-theme-custom-themes';
    const ACTIVE_KEY  = 'techne-theme-active-custom';
    const CONTRACT = window.TechneThemeContract;

    // ── Built-in presets ──
    // Non-brand presets (Solarized, Nord, Monokai, Dracula, Sepia, GitHub Light)
    // were removed for brand coherence. They used off-brand accent colors (blue,
    // cyan, green, purple, brown) that dilute the default experience. They can be
    // restored from git history if needed for a future "community themes" feature.

    const PRESETS = {};

    // ── Editable variable groups ──

    const VAR_GROUPS = [
        {
            label: 'Surfaces',
            vars: ['--techne-bg', '--techne-surface', '--techne-surface-elevated']
        },
        {
            label: 'Text',
            vars: ['--techne-text', '--techne-text-muted', '--techne-text-on-accent']
        },
        {
            label: 'Accent',
            vars: ['--techne-accent', '--techne-accent-hover', '--techne-accent-active']
        },
        {
            label: 'Boundaries and interaction',
            vars: ['--techne-border', '--techne-border-subtle', '--techne-focus-ring', '--techne-selection-bg', '--techne-link']
        },
        {
            label: 'Semantic',
            vars: [
                '--techne-success', '--techne-success-surface',
                '--techne-warning', '--techne-warning-surface',
                '--techne-error', '--techne-error-surface',
                '--techne-info', '--techne-info-surface'
            ]
        },
        {
            label: 'Glass',
            vars: ['--techne-glass-bg', '--techne-glass-border']
        }
    ];

    // ── Storage ──

    let _host = null;

    function normalizeTheme(theme) {
        if (!CONTRACT) return theme;
        const normalized = CONTRACT.normalizeCustomTheme(theme);
        return { ...normalized, base: normalized.colorScheme };
    }

    function normalizeThemes(themes) {
        return Object.fromEntries(Object.entries(themes || {}).map(([id, theme]) => [id, normalizeTheme(theme)]));
    }

    function validateCustomTheme(themeId, theme) {
        const normalized = normalizeTheme(theme);
        const report = CONTRACT
            ? CONTRACT.validateTheme(themeId, normalized)
            : { id: themeId, valid: true, issues: [], tokens: normalized.vars || {} };
        return { ...report, theme: normalized };
    }

    function loadCustomThemes() {
        // Try host settings first
        if (_host?.getSetting) {
            const v = _host.getSetting('customThemes');
            if (v && typeof v === 'object') return normalizeThemes(v);
        }
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            return stored ? normalizeThemes(JSON.parse(stored)) : {};
        } catch (_) { return {}; }
    }

    function saveCustomThemes(themes) {
        const normalized = normalizeThemes(themes);
        const reports = Object.entries(normalized).map(([id, theme]) => validateCustomTheme(id, theme));
        const invalid = reports.filter(report => !report.valid);
        if (invalid.length) {
            return { valid: false, themes: normalized, reports, invalid };
        }
        if (_host?.setSetting) {
            _host.setSetting('customThemes', normalized);
        }
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
        } catch (_) { /* ignore */ }
        return { valid: true, themes: normalized, reports, invalid: [] };
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
        if (!theme) return false;
        const report = validateCustomTheme(themeId, theme);
        if (!report.valid) return false;

        clearThemeVars();

        // Use theme manager to set base mode
        const baseTheme = theme.base === 'dark' ? 'dark' : 'light';
        if (window.techneThemeManager) {
            window.techneThemeManager.applyTheme(baseTheme);
        }

        applyThemeVars(theme.vars);
        setActiveCustomTheme('custom:' + themeId);
        return true;
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
        validateCustomTheme,
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
