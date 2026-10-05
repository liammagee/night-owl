/* NightOwl bundled feature loader.
   This is intentionally app-native: it loads the editor's built-in feature
   bundles without exposing the old portable Techne plugin surface.
*/

(function () {
    'use strict';

    if (window.NightOwlFeatures) return;

    const FEATURE_ID_ALIASES = Object.freeze({
        'techne-backdrop': 'nightowl-backdrop',
        'techne-presentations': 'nightowl-presentations',
        'techne-markdown-renderer': 'nightowl-markdown-renderer',
        'techne-network-diagram': 'nightowl-network-diagram',
        'techne-circle': 'nightowl-circle',
        'techne-maze': 'nightowl-maze',
        'techne-ai-tutor': 'nightowl-ai-tutor',
        'techne-research-feed': 'nightowl-research-feed'
    });

    const FEATURE_MANIFEST = Object.freeze([
        {
            id: 'nightowl-backdrop',
            name: 'Backdrop',
            description: 'Animated theme backdrop layers.',
            entry: 'plugins/techne-backdrop/plugin.js',
            enabledByDefault: true
        },
        {
            id: 'nightowl-presentations',
            name: 'Presentations',
            description: 'Slide-based presentation mode with speaker notes support.',
            entry: 'plugins/techne-presentations/plugin.js',
            enabledByDefault: true
        },
        {
            id: 'nightowl-markdown-renderer',
            name: 'Markdown Renderer',
            description: 'Enhanced preview rendering and citation support.',
            entry: 'plugins/techne-markdown-renderer/plugin.js',
            enabledByDefault: true
        },
        {
            id: 'nightowl-network-diagram',
            name: 'Network Diagram',
            description: 'Interactive graph visualization for linked documents.',
            entry: 'plugins/techne-network-diagram/plugin.js',
            enabledByDefault: true
        },
        {
            id: 'nightowl-circle',
            name: 'Hermeneutic Circle',
            description: 'Circular visualization for interpretive movement through a text.',
            entry: 'plugins/techne-circle/plugin.js',
            enabledByDefault: false
        },
        {
            id: 'nightowl-maze',
            name: 'Babel Maze',
            description: 'Library of Babel-inspired navigation through your documents.',
            entry: 'plugins/techne-maze/plugin.js',
            enabledByDefault: true
        },
        {
            id: 'nightowl-ai-tutor',
            name: 'AI Tutor',
            description: 'Guided onboarding and tutorial overlays.',
            entry: 'plugins/techne-ai-tutor/plugin.js',
            enabledByDefault: false
        },
        {
            id: 'nightowl-research-feed',
            name: 'Research Feed',
            description: 'Optional research feed panel ranked against current writing context.',
            entry: 'plugins/techne-research-feed/plugin.js',
            enabledByDefault: false
        }
    ]);

    const state = {
        appId: 'nightowl',
        manifest: [...FEATURE_MANIFEST],
        features: new Map(),
        enabled: new Set(),
        pending: new Map(),
        loadedScripts: new Set(),
        scriptPromises: new Map(),
        loadedStyles: new Set(),
        stylePromises: new Map(),
        settings: {},
        featureSettings: new Map(),
        lifecycles: new Map(),
        events: new Map(),
        host: null,
        hostCapabilities: {},
        started: false,
        startPromise: Promise.resolve()
    };

    const isDebugEnabled = () => Boolean(
        window.NIGHTOWL_DEBUG_FEATURES ||
        window.appSettings?.advanced?.enableDebugMode
    );

    const log = (...args) => {
        if (isDebugEnabled()) console.log('[NightOwlFeatures]', ...args);
    };
    const warn = (...args) => console.warn('[NightOwlFeatures]', ...args);
    const error = (...args) => console.error('[NightOwlFeatures]', ...args);

    const normalizeId = (value) => {
        const id = String(value || '').trim();
        return FEATURE_ID_ALIASES[id] || id;
    };
    const isElectron = () => typeof window.electronAPI !== 'undefined';

    function mergeSettingsValue(current, next) {
        if (
            current && typeof current === 'object' && !Array.isArray(current) &&
            next && typeof next === 'object' && !Array.isArray(next)
        ) {
            return { ...next, ...current };
        }
        return typeof current === 'undefined' ? next : current;
    }

    function migrateFeatureSettings(settings) {
        if (Array.isArray(settings)) {
            return Array.from(new Set(settings.map(normalizeId).filter(Boolean)));
        }
        if (!settings || typeof settings !== 'object') return {};

        const migrated = { ...settings };
        for (const [legacyId, canonicalId] of Object.entries(FEATURE_ID_ALIASES)) {
            if (!Object.prototype.hasOwnProperty.call(migrated, legacyId)) continue;
            migrated[canonicalId] = mergeSettingsValue(migrated[canonicalId], migrated[legacyId]);
            delete migrated[legacyId];
        }

        if (Array.isArray(migrated.enabled)) {
            migrated.enabled = Array.from(new Set(migrated.enabled.map(normalizeId).filter(Boolean)));
        }

        return migrated;
    }

    function normalizePath(src) {
        const value = String(src || '').trim();
        if (!value) return '';
        try {
            return new URL(value, window.location.href).toString();
        } catch (_) {
            return value;
        }
    }

    function on(eventName, handler) {
        const name = String(eventName || '');
        if (!name || typeof handler !== 'function') return () => {};
        if (!state.events.has(name)) state.events.set(name, new Set());
        state.events.get(name).add(handler);
        return () => off(name, handler);
    }

    function off(eventName, handler) {
        const listeners = state.events.get(String(eventName || ''));
        if (!listeners) return;
        listeners.delete(handler);
        if (listeners.size === 0) state.events.delete(String(eventName || ''));
    }

    function emit(eventName, payload) {
        const listeners = state.events.get(String(eventName || ''));
        if (!listeners) return;
        for (const handler of Array.from(listeners)) {
            try {
                handler(payload);
            } catch (err) {
                error(`Feature event handler failed for "${eventName}":`, err);
            }
        }
    }

    function loadCSS(href, { id } = {}) {
        const url = normalizePath(href);
        if (!url) return Promise.resolve(false);
        if (id && document.getElementById(id)) return Promise.resolve(true);
        if (state.loadedStyles.has(url)) return Promise.resolve(true);
        if (state.stylePromises.has(url)) return state.stylePromises.get(url);

        const promise = new Promise((resolve) => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = url;
            if (id) link.id = String(id);
            link.onload = () => {
                state.loadedStyles.add(url);
                state.stylePromises.delete(url);
                resolve(true);
            };
            link.onerror = () => {
                link.remove();
                state.stylePromises.delete(url);
                resolve(false);
            };
            document.head.appendChild(link);
        });

        state.stylePromises.set(url, promise);
        return promise;
    }

    function loadScript(src, { id, async = false, type = 'text/javascript' } = {}) {
        const url = normalizePath(src);
        if (!url) return Promise.resolve(false);
        if (id && document.getElementById(id)) return Promise.resolve(true);
        if (state.loadedScripts.has(url)) return Promise.resolve(true);
        if (state.scriptPromises.has(url)) return state.scriptPromises.get(url);

        const promise = new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = url;
            script.type = type;
            script.async = Boolean(async);
            if (id) script.id = String(id);
            script.onload = () => {
                state.loadedScripts.add(url);
                state.scriptPromises.delete(url);
                resolve(true);
            };
            script.onerror = () => {
                script.remove();
                state.scriptPromises.delete(url);
                resolve(false);
            };
            document.head.appendChild(script);
        });

        state.scriptPromises.set(url, promise);
        return promise;
    }

    async function loadScriptsSequential(urls) {
        for (const url of Array.isArray(urls) ? urls : []) {
            const ok = await loadScript(url, { async: false });
            if (!ok) {
                warn('Failed to load feature script:', url);
                return false;
            }
        }
        return true;
    }

    function getFeatureSettings(featureId) {
        const id = normalizeId(featureId);
        if (!id) return null;
        if (state.featureSettings.has(id)) return state.featureSettings.get(id);
        const fromSettings = state.settings?.[id];
        return fromSettings && typeof fromSettings === 'object' ? fromSettings : null;
    }

    function setFeatureSettings(featureId, settings) {
        const id = normalizeId(featureId);
        if (!id) return false;
        state.featureSettings.set(id, settings);
        if (!state.settings || typeof state.settings !== 'object') state.settings = {};
        state.settings[id] = {
            ...(state.settings[id] && typeof state.settings[id] === 'object' ? state.settings[id] : {}),
            ...(settings && typeof settings === 'object' ? settings : {})
        };
        emit('feature:settings-changed', { id, settings: state.settings[id] });
        return true;
    }

    function updateFeatureSettings(featureId, updates) {
        const existing = getFeatureSettings(featureId) || {};
        return setFeatureSettings(featureId, { ...existing, ...(updates || {}) });
    }

    function getFeatureLifecycle(featureId, { create = true } = {}) {
        const id = normalizeId(featureId);
        const existing = state.lifecycles.get(id);
        if (existing && !existing.isDisposed()) return existing;
        if (!create) return null;
        const lifecycle = window.NightOwlResourceLifecycle?.createRegistry?.({
            name: `feature:${id}`,
            scope: 'feature',
            onError: (error, resource) => warn(`Feature resource cleanup failed (${id}/${resource.type}):`, error)
        }) || null;
        if (lifecycle) state.lifecycles.set(id, lifecycle);
        return lifecycle;
    }

    function disposeFeatureLifecycle(featureId) {
        const id = normalizeId(featureId);
        const lifecycle = getFeatureLifecycle(id, { create: false });
        state.lifecycles.delete(id);
        return lifecycle?.dispose?.() || { disposed: false, errors: [] };
    }

    function createHostForFeature(featureId, lifecycle = getFeatureLifecycle(featureId)) {
        const boundGetSettings = () => getFeatureSettings(featureId);
        const boundSetSettings = (settings) => setFeatureSettings(featureId, settings);
        const boundUpdateSettings = (updates) => updateFeatureSettings(featureId, updates);
        const boundOn = (eventName, handler) => {
            const unsubscribe = on(eventName, handler);
            if (!lifecycle) return unsubscribe;
            const release = lifecycle.add(unsubscribe, { type: 'listener', label: `feature-event:${eventName}` });
            return () => release();
        };

        return {
            appId: state.appId,
            getAppId: () => state.appId,
            settings: state.settings,
            isElectron: isElectron(),
            electronAPI: window.electronAPI || null,
            on: boundOn,
            off,
            emit,
            loadCSS,
            loadScript,
            loadScriptsSequential,
            log,
            warn,
            error,
            getSettings: boundGetSettings,
            setSettings: boundSetSettings,
            updateSettings: boundUpdateSettings,
            getSetting: (key) => boundGetSettings()?.[key],
            setSetting: (key, value) => {
                const next = { ...(boundGetSettings() || {}), [key]: value };
                return boundSetSettings(next);
            },
            lifecycle,
            interval: (...args) => lifecycle?.interval?.(...args),
            timeout: (...args) => lifecycle?.timeout?.(...args),
            listen: (...args) => lifecycle?.listen?.(...args),
            observe: (...args) => lifecycle?.observe?.(...args),
            track: (...args) => lifecycle?.track?.(...args),
            readFile: async (filePath) => {
                if (!window.electronAPI?.files?.readFileContent) return null;
                const result = await window.electronAPI.files.readFileContent(filePath);
                return result?.success ? { content: result.content } : null;
            },
            openFile: async (filePath) => window.electronAPI?.files?.openFile(filePath),
            getFiles: async () => {
                if (typeof window.getFilteredVisualizationFiles === 'function') {
                    return window.getFilteredVisualizationFiles();
                }
                return { files: [], totalFiles: 0 };
            },
            generateSummaries: async ({ content, filePath }) => {
                if (!window.electronAPI?.ai?.generateDocumentSummaries) return { success: false, error: 'Not available' };
                return window.electronAPI.ai.generateDocumentSummaries({ content, filePath });
            },
            getCurrentFile: () => window.currentFilePath || null,
            getEditor: () => window.editor || null,
            getAICompanion: () => window.aiCompanionManager || null,
            markContentAsSaved: () => window.markContentAsSaved?.(),
            openFileInEditor: (...args) => window.openFileInEditor?.(...args),
            switchMode: (mode) => window.showPane?.(mode),
            ...state.hostCapabilities
        };
    }

    function waitForRegistration(featureId, timeoutMs = 8000) {
        const id = normalizeId(featureId);
        if (!id) return Promise.resolve(null);
        const existing = state.features.get(id);
        if (existing) return Promise.resolve(existing);
        if (state.pending.has(id)) return state.pending.get(id).promise;

        let timeoutId;
        let resolve;
        let reject;
        const promise = new Promise((res, rej) => {
            resolve = res;
            reject = rej;
        });
        timeoutId = setTimeout(() => {
            state.pending.delete(id);
            reject(new Error(`Feature "${id}" did not register within ${timeoutMs}ms`));
        }, timeoutMs);
        state.pending.set(id, { promise, resolve, reject, timeoutId });
        return promise;
    }

    async function initFeature(feature) {
        const id = normalizeId(feature?.id);
        if (!id || !state.enabled.has(id) || feature.__nightOwlInited) return;
        if (typeof feature.init !== 'function') return;

        const lifecycle = getFeatureLifecycle(id);
        feature.__nightOwlInited = true;
        try {
            await feature.init(createHostForFeature(id, lifecycle));
            emit('feature:initialized', { id });
        } catch (err) {
            feature.__nightOwlInited = false;
            disposeFeatureLifecycle(id);
            error(`Feature init failed (${id}):`, err);
        }
    }

    function register(feature) {
        const id = normalizeId(feature?.id);
        if (!id) {
            warn('Ignored feature registration without an id:', feature);
            return null;
        }

        const registeredFeature = { ...feature, id };
        state.features.set(id, registeredFeature);
        emit('feature:registered', { id });

        const pending = state.pending.get(id);
        if (pending) {
            clearTimeout(pending.timeoutId);
            pending.resolve(registeredFeature);
            state.pending.delete(id);
        }

        if (state.started) {
            queueMicrotask(() => initFeature(registeredFeature));
        }
        return registeredFeature;
    }

    function getDefaultEnabled() {
        return state.manifest
            .filter((feature) => feature?.enabledByDefault !== false)
            .map((feature) => normalizeId(feature.id))
            .filter(Boolean);
    }

    function updateEnabled(enabledConfig) {
        if (Array.isArray(enabledConfig)) {
            state.enabled = new Set(enabledConfig.map(normalizeId).filter(Boolean));
            return;
        }

        if (enabledConfig && typeof enabledConfig === 'object') {
            const enabled = new Set(
                Array.isArray(enabledConfig.enabled)
                    ? enabledConfig.enabled.map(normalizeId).filter(Boolean)
                    : getDefaultEnabled()
            );

            for (const [id, config] of Object.entries(enabledConfig)) {
                if (id === 'enabled') continue;
                const featureId = normalizeId(id);
                if (!featureId) continue;
                if (config?.enabled === false) enabled.delete(featureId);
                if (config?.enabled === true) enabled.add(featureId);
            }

            state.enabled = enabled;
            return;
        }

        if (state.enabled.size === 0) {
            state.enabled = new Set(getDefaultEnabled());
        }
    }

    async function loadEnabledFeatures() {
        const byId = new Map(state.manifest.map((entry) => [normalizeId(entry.id), entry]));
        for (const id of Array.from(state.enabled)) {
            const existing = state.features.get(id);
            if (existing) {
                await initFeature(existing);
                continue;
            }

            const entry = byId.get(id);
            if (!entry?.entry) {
                warn(`Missing entry for enabled feature "${id}"`);
                continue;
            }

            const waitForFeature = waitForRegistration(id);
            const ok = await loadScript(entry.entry, { async: false, id: `${id}-entry` });
            if (!ok) {
                warn(`Failed to load feature entry for "${id}":`, entry.entry);
                continue;
            }

            try {
                await initFeature(await waitForFeature);
            } catch (err) {
                warn(String(err?.message || err));
            }
        }
    }

    function extendHost(capabilities) {
        Object.assign(state.hostCapabilities, capabilities || {});
    }

    async function start({ manifest = null, enabled = null, settings = null, appId = 'nightowl' } = {}) {
        state.startPromise = Promise.resolve(state.startPromise).then(async () => {
            state.appId = String(appId || 'nightowl');
            if (Array.isArray(manifest)) {
                state.manifest = manifest.map((entry) => ({
                    ...entry,
                    id: normalizeId(entry?.id)
                }));
            }
            if (settings && typeof settings === 'object') state.settings = migrateFeatureSettings(settings);
            updateEnabled(enabled ? migrateFeatureSettings(enabled) : enabled);

            const firstStart = !state.started;
            state.started = true;
            emit(firstStart ? 'features:starting' : 'features:activating', { enabled: getEnabled() });
            await loadEnabledFeatures();
            emit(firstStart ? 'features:started' : 'features:activated', { enabled: getEnabled() });
            return { enabled: getEnabled() };
        });

        return state.startPromise;
    }

    async function enableFeature(id) {
        const featureId = normalizeId(id);
        if (!featureId) return false;
        state.enabled.add(featureId);
        if (state.started) await loadEnabledFeatures();
        emit('feature:enabled', { id: featureId });
        return true;
    }

    function disableFeature(id) {
        const featureId = normalizeId(id);
        if (!featureId || !state.enabled.has(featureId)) return false;
        state.enabled.delete(featureId);
        const feature = state.features.get(featureId);
        const lifecycle = getFeatureLifecycle(featureId, { create: false });
        if (feature?.destroy) {
            try {
                feature.destroy(createHostForFeature(featureId, lifecycle));
            } catch (err) {
                warn(`Feature destroy failed (${featureId}):`, err);
            }
        }
        disposeFeatureLifecycle(featureId);
        if (feature) feature.__nightOwlInited = false;
        emit('feature:disabled', { id: featureId });
        return true;
    }

    function disposeAllFeatures() {
        for (const feature of state.features.values()) {
            if (!feature.__nightOwlInited) continue;
            const lifecycle = getFeatureLifecycle(feature.id, { create: false });
            try {
                feature.destroy?.(createHostForFeature(feature.id, lifecycle));
            } catch (err) {
                warn(`Feature destroy failed (${feature.id}):`, err);
            }
            feature.__nightOwlInited = false;
        }
        for (const id of Array.from(state.lifecycles.keys())) disposeFeatureLifecycle(id);
    }

    function getLifecycleDiagnostics() {
        return window.NightOwlResourceLifecycle?.getDiagnostics?.() || {
            activeRegistries: 0,
            activeResources: 0,
            byType: {},
            registries: []
        };
    }

    function getFeature(id) {
        return state.features.get(normalizeId(id)) || null;
    }

    function listFeatures() {
        return Array.from(state.features.keys()).sort((a, b) => a.localeCompare(b));
    }

    function getManifest() {
        return state.manifest.map((entry) => ({ ...entry }));
    }

    function getEnabled() {
        return Array.from(state.enabled);
    }

    function isEnabled(id) {
        return state.enabled.has(normalizeId(id));
    }

    window.NightOwlFeatures = {
        register,
        start,
        on,
        off,
        emit,
        loadCSS,
        loadScript,
        loadScriptsSequential,
        extendHost,
        enableFeature,
        disableFeature,
        disposeAllFeatures,
        getLifecycleDiagnostics,
        getFeature,
        listFeatures,
        getManifest,
        getEnabled,
        isEnabled,
        getFeatureSettings,
        setFeatureSettings,
        updateFeatureSettings,
        getAppId: () => state.appId
    };

    const queuedFeatures = Array.isArray(window.NIGHTOWL_FEATURE_QUEUE)
        ? [...window.NIGHTOWL_FEATURE_QUEUE]
        : [];
    window.NIGHTOWL_FEATURE_QUEUE = { push: register };
    queuedFeatures.forEach(register);

    log('Feature loader ready');
})();
