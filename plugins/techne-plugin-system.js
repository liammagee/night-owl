/* Techne Plugin System (portable core)
   - Lightweight plugin loader for both Electron apps and plain websites.
   - Plugins register themselves via `window.TechnePlugins.register({ id, init(host) { ... } })`.
   - A manifest is provided by `window.TECHNE_PLUGIN_MANIFEST = [{ id, entry, enabledByDefault }]`.
*/

(function () {
    if (window.TechnePlugins) return;

    const state = {
        started: false,
        startPromise: null,
        host: null,
        manifest: [],
        enabled: new Set(),
        plugins: new Map(),
        pending: new Map(),
        cssLoaded: new Set(),
        scriptLoaded: new Set(),
        events: new Map()
    };

    const log = (...args) => console.log('[TechnePlugins]', ...args);
    const warn = (...args) => console.warn('[TechnePlugins]', ...args);
    const error = (...args) => console.error('[TechnePlugins]', ...args);

    const isElectron = () => Boolean(window?.electronAPI?.isElectron);

    const on = (eventName, handler) => {
        if (!eventName || typeof handler !== 'function') return () => {};
        const name = String(eventName);
        const list = state.events.get(name) || [];
        list.push(handler);
        state.events.set(name, list);
        return () => off(name, handler);
    };

    const off = (eventName, handler) => {
        const name = String(eventName || '');
        const list = state.events.get(name);
        if (!list?.length) return;
        const next = list.filter((fn) => fn !== handler);
        if (next.length) state.events.set(name, next);
        else state.events.delete(name);
    };

    const emit = (eventName, payload) => {
        const name = String(eventName || '');
        const list = state.events.get(name);
        if (!list?.length) return;
        for (const fn of list.slice()) {
            try {
                fn(payload);
            } catch (err) {
                error(`Listener failed for ${name}:`, err);
            }
        }
    };

    const loadCSS = (href, { id } = {}) => {
        const url = String(href || '').trim();
        if (!url) return Promise.resolve(false);
        if (state.cssLoaded.has(url)) return Promise.resolve(true);
        state.cssLoaded.add(url);

        return new Promise((resolve) => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = url;
            if (id) link.id = String(id);
            link.onload = () => resolve(true);
            link.onerror = () => resolve(false);
            document.head.appendChild(link);
        });
    };

    const loadScript = (src, { id, async = false, type = 'text/javascript' } = {}) => {
        const url = String(src || '').trim();
        if (!url) return Promise.resolve(false);
        if (state.scriptLoaded.has(url)) return Promise.resolve(true);
        state.scriptLoaded.add(url);

        return new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = url;
            script.type = type;
            script.async = Boolean(async);
            if (id) script.id = String(id);
            script.onload = () => resolve(true);
            script.onerror = () => resolve(false);
            document.head.appendChild(script);
        });
    };

    const loadScriptsSequential = async (urls) => {
        const list = Array.isArray(urls) ? urls : [];
        for (const url of list) {
            const ok = await loadScript(url, { async: false });
            if (!ok) {
                warn('Failed to load script:', url);
                return false;
            }
        }
        return true;
    };

    // Host capability adapters - can be extended by the consuming app
    const hostCapabilities = {
        // File operations
        readFile: async (filePath) => {
            if (window?.electronAPI?.invoke) {
                const result = await window.electronAPI.invoke('read-file-content', filePath);
                return result?.success ? { content: result.content } : null;
            }
            return null;
        },

        openFile: async (filePath) => {
            if (window?.electronAPI?.invoke) {
                return window.electronAPI.invoke('open-file', filePath);
            }
        },

        // Get files for visualization
        getFiles: async (options = {}) => {
            if (window.getFilteredVisualizationFiles) {
                return window.getFilteredVisualizationFiles();
            }
            return { files: [], totalFiles: 0 };
        },

        // AI summaries
        generateSummaries: async ({ content, filePath }) => {
            if (window?.electronAPI?.invoke) {
                return window.electronAPI.invoke('generate-document-summaries', { content, filePath });
            }
            return { success: false, error: 'Not available' };
        }
    };

    // Allow apps to extend host capabilities
    const extendHost = (capabilities) => {
        Object.assign(hostCapabilities, capabilities);
        // Update existing host if already created
        if (state.host) {
            Object.assign(state.host, capabilities);
        }
    };

    const createHost = ({ appId = 'unknown', settings = null } = {}) => {
        return {
            appId,
            settings,
            isElectron: isElectron(),
            electronAPI: window?.electronAPI || null,
            on,
            off,
            emit,
            loadCSS,
            loadScript,
            loadScriptsSequential,
            log,
            warn,
            error,
            // Host capabilities (can be extended)
            ...hostCapabilities
        };
    };

    const waitForRegistration = (pluginId, timeoutMs = 8000) => {
        const id = String(pluginId || '');
        if (!id) return Promise.resolve(null);
        const existing = state.plugins.get(id);
        if (existing) return Promise.resolve(existing);

        const pending = state.pending.get(id);
        if (pending?.promise) return pending.promise;

        let timeoutId = null;
        let resolve = null;
        let reject = null;

        const promise = new Promise((res, rej) => {
            resolve = res;
            reject = rej;
        });

        timeoutId = setTimeout(() => {
            state.pending.delete(id);
            reject?.(new Error(`Plugin "${id}" did not register within ${timeoutMs}ms`));
        }, timeoutMs);

        state.pending.set(id, { promise, resolve, reject, timeoutId });
        return promise;
    };

    const initPluginIfEnabled = async (plugin) => {
        if (!plugin || typeof plugin !== 'object') return;
        const id = String(plugin.id || '');
        if (!id) return;
        if (!state.enabled.has(id)) return;
        if (plugin.__techneInited) return;
        if (typeof plugin.init !== 'function') return;

        plugin.__techneInited = true;
        try {
            await plugin.init(state.host);
        } catch (err) {
            error(`Plugin init failed (${id}):`, err);
        }
    };

    const register = (plugin) => {
        if (!plugin || typeof plugin !== 'object') {
            warn('Ignored invalid plugin registration:', plugin);
            return;
        }
        const id = String(plugin.id || '').trim();
        if (!id) {
            warn('Ignored plugin registration with missing id:', plugin);
            return;
        }

        if (!state.plugins.has(id)) {
            state.plugins.set(id, plugin);
            emit('plugin:registered', { id });
        }

        const pending = state.pending.get(id);
        if (pending?.timeoutId) clearTimeout(pending.timeoutId);
        pending?.resolve?.(plugin);
        if (pending) state.pending.delete(id);

        if (state.started) {
            queueMicrotask(() => initPluginIfEnabled(plugin));
        }
    };

    const normalizeId = (value) => String(value || '').trim();

    const applyManifest = (rawManifest) => {
        const list = Array.isArray(rawManifest) ? rawManifest : [];
        state.manifest = list;
    };

    const updateEnabled = (enabled) => {
        if (Array.isArray(enabled)) {
            for (const id of enabled) {
                const norm = normalizeId(id);
                if (norm) state.enabled.add(norm);
            }
            return;
        }

        // If nothing is enabled yet, fall back to defaults from the manifest.
        if (state.enabled.size === 0) {
            const defaults = state.manifest
                .filter((p) => p?.enabledByDefault !== false)
                .map((p) => normalizeId(p?.id))
                .filter(Boolean);
            state.enabled = new Set(defaults);
        }
    };

    const loadEnabledPlugins = async () => {
        const manifestById = new Map();
        for (const entry of state.manifest) {
            const id = normalizeId(entry?.id);
            if (!id) continue;
            manifestById.set(id, entry);
        }

        for (const id of Array.from(state.enabled)) {
            const already = state.plugins.get(id);
            if (already) {
                await initPluginIfEnabled(already);
                continue;
            }

            const entry = manifestById.get(id);
            const scriptUrl = normalizeId(entry?.entry);
            if (!scriptUrl) {
                warn(`Missing entry for enabled plugin "${id}"`);
                continue;
            }

            const waitForPlugin = waitForRegistration(id);
            const ok = await loadScript(scriptUrl, { async: false });
            if (!ok) {
                warn(`Failed to load plugin entry for "${id}":`, scriptUrl);
                continue;
            }

            try {
                const plugin = await waitForPlugin;
                await initPluginIfEnabled(plugin);
            } catch (err) {
                warn(String(err?.message || err));
            }
        }
    };

    const start = async ({ manifest = null, enabled = null, appId = null, settings } = {}) => {
        state.startPromise = Promise.resolve(state.startPromise).then(async () => {
            if (!state.host) {
                state.host = createHost({
                    appId: appId || 'techne',
                    settings: typeof settings === 'undefined' ? null : settings
                });
            } else {
                if (appId) state.host.appId = String(appId);
                if (typeof settings !== 'undefined') state.host.settings = settings;
            }

            if (manifest || state.manifest.length === 0) {
                const rawManifest = manifest || window.TECHNE_PLUGIN_MANIFEST || [];
                applyManifest(rawManifest);
            }

            updateEnabled(enabled);

            const isFirstStart = !state.started;
            state.started = true;
            emit(isFirstStart ? 'plugins:starting' : 'plugins:activating', {
                enabled: Array.from(state.enabled)
            });

            await loadEnabledPlugins();

            emit(isFirstStart ? 'plugins:started' : 'plugins:activated', {
                enabled: Array.from(state.enabled)
            });

            return { enabled: Array.from(state.enabled) };
        });

        return state.startPromise;
    };

    const getPlugin = (id) => state.plugins.get(String(id || '').trim()) || null;
    const listPlugins = () => Array.from(state.plugins.keys()).sort((a, b) => a.localeCompare(b));

    window.TechnePlugins = {
        register,
        start,
        on,
        off,
        emit,
        loadCSS,
        loadScript,
        loadScriptsSequential,
        getPlugin,
        listPlugins,
        extendHost
    };

    const autostart = window.TECHNE_PLUGIN_AUTOSTART !== false;
    if (autostart) {
        document.addEventListener('DOMContentLoaded', () => {
            start().catch((err) => warn('Autostart failed:', err));
        });
    }
})();
