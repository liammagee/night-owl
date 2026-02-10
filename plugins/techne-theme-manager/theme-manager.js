/* Techne Theme Manager
   Core switching logic. Loaded after themes.js by the plugin shell.
   Exposes window.techneThemeManager API.
*/

(function () {
    'use strict';

    const THEMES = window._TECHNE_THEMES || {};
    const STORAGE_KEY = 'techne-theme-active';
    const MANAGED_CLASSES = Object.values(THEMES)
        .map(t => t.bodyClass)
        .filter(Boolean)
        .filter((v, i, a) => a.indexOf(v) === i); // unique

    let _host = null;
    let _activeThemeId = null;
    let _systemMediaQuery = null;
    let _systemListener = null;

    // ── helpers ──

    function persist(themeId) {
        // Prefer plugin host settings; fall back to localStorage
        if (_host?.setSetting) {
            _host.setSetting('activeTheme', themeId);
        }
        try { localStorage.setItem(STORAGE_KEY, themeId); } catch (_) { /* noop */ }
    }

    function readSaved() {
        // Host settings take priority
        if (_host?.getSetting) {
            const v = _host.getSetting('activeTheme');
            if (v && THEMES[v]) return v;
        }
        try {
            const v = localStorage.getItem(STORAGE_KEY);
            if (v && THEMES[v]) return v;
        } catch (_) { /* noop */ }
        return null;
    }

    function followSystemEnabled() {
        if (_host?.getSetting) {
            return !!_host.getSetting('followSystem');
        }
        return false;
    }

    // ── core ──

    function applyTheme(themeId) {
        const theme = THEMES[themeId];
        if (!theme) {
            console.warn('[techne-theme-manager] Unknown theme:', themeId);
            return;
        }

        const prev = _activeThemeId;
        _activeThemeId = themeId;

        // 1. Manage body classes + data attribute (for adapter specificity)
        MANAGED_CLASSES.forEach(cls => document.body.classList.remove(cls));
        if (theme.bodyClass) {
            document.body.classList.add(theme.bodyClass);
        }
        document.body.setAttribute('data-techne-theme', themeId);

        // 2. Apply token overrides on :root
        const root = document.documentElement;
        // Clear any previous per-theme overrides
        root.style.cssText = root.style.cssText.replace(
            /--techne-[a-z-]+:\s*[^;]+;\s*/g, ''
        );
        if (theme.tokens) {
            Object.entries(theme.tokens).forEach(([prop, value]) => {
                root.style.setProperty(prop, value);
            });
        }

        // 3. Persist + notify
        persist(themeId);

        if (_host?.emit) {
            _host.emit('theme:changed', { themeId, prev });
        }
        // Also dispatch a DOM event for non-plugin listeners
        document.dispatchEvent(
            new CustomEvent('techne-theme-changed', { detail: { themeId, prev } })
        );
    }

    function getActiveTheme() {
        return _activeThemeId;
    }

    function getThemes() {
        return { ...THEMES };
    }

    function detectSystemPreference() {
        if (typeof window.matchMedia !== 'function') return 'light';
        return window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light';
    }

    // ── system preference tracking ──

    function startSystemWatch() {
        if (_systemMediaQuery) return; // already watching
        if (typeof window.matchMedia !== 'function') return;

        _systemMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        _systemListener = (e) => {
            if (!followSystemEnabled()) return;
            applyTheme(e.matches ? 'dark' : 'light');
        };
        _systemMediaQuery.addEventListener('change', _systemListener);
    }

    function stopSystemWatch() {
        if (_systemMediaQuery && _systemListener) {
            _systemMediaQuery.removeEventListener('change', _systemListener);
        }
        _systemMediaQuery = null;
        _systemListener = null;
    }

    // ── plugin lifecycle ──

    function _init(host) {
        _host = host;

        // Determine starting theme: saved > followSystem > 'light'
        let startTheme = readSaved();
        if (!startTheme && followSystemEnabled()) {
            startTheme = detectSystemPreference();
        }
        applyTheme(startTheme || 'light');

        startSystemWatch();
    }

    function _destroy() {
        stopSystemWatch();

        // Remove managed body classes + data attribute
        MANAGED_CLASSES.forEach(cls => document.body.classList.remove(cls));
        document.body.removeAttribute('data-techne-theme');

        // Clear inline --techne-* overrides
        const root = document.documentElement;
        root.style.cssText = root.style.cssText.replace(
            /--techne-[a-z-]+:\s*[^;]+;\s*/g, ''
        );

        _host = null;
        _activeThemeId = null;
    }

    // ── public API ──

    window.techneThemeManager = {
        applyTheme,
        getActiveTheme,
        getThemes,
        detectSystemPreference,
        _init,
        _destroy
    };
})();
