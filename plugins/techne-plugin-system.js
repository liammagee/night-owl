/* Techne Plugin System (portable core)
   - Lightweight plugin loader for both Electron apps and plain websites.
   - Plugins register themselves via `window.TechnePlugins.register({ id, init(host) { ... } })`.
   - A manifest is provided by `window.TECHNE_PLUGIN_MANIFEST = [{ id, entry, enabledByDefault, dependencies }]`.
   - Supports plugin-specific settings persistence, dependency resolution, and hot reload.
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
        events: new Map(),
        // Plugin-specific settings storage
        pluginSettings: new Map(),
        // Track script URLs for hot reload
        scriptUrls: new Map(),
        // Development mode flag
        devMode: false,
        // Storage key prefix for persistence
        storageKey: 'techne-plugin-settings'
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

    // Normalize path - keep relative for file:// protocol, make absolute for http(s)
    const normalizePath = (path) => {
        const trimmed = String(path || '').trim();
        if (!trimmed) return '';
        // Already absolute or external URL
        if (trimmed.startsWith('/') || trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
            return trimmed;
        }
        // For file:// protocol (Electron), keep paths relative so they resolve from app directory
        if (window.location.protocol === 'file:') {
            return trimmed;
        }
        // For http(s), make relative paths absolute from root
        return '/' + trimmed;
    };

    const loadCSS = (href, { id } = {}) => {
        const url = normalizePath(href);
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

    const loadScript = (src, { id, async = false, type = 'text/javascript', forceReload = false } = {}) => {
        const url = normalizePath(src);
        if (!url) return Promise.resolve(false);

        // Skip cache check if forcing reload (for hot reload)
        if (!forceReload && state.scriptLoaded.has(url)) return Promise.resolve(true);
        state.scriptLoaded.add(url);

        return new Promise((resolve) => {
            const script = document.createElement('script');
            // Add cache-busting for hot reload
            script.src = forceReload ? `${url}?t=${Date.now()}` : url;
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

    // ==========================================
    // Plugin Settings Persistence
    // ==========================================

    const loadPersistedSettings = () => {
        try {
            const stored = localStorage.getItem(state.storageKey);
            if (stored) {
                const parsed = JSON.parse(stored);
                if (parsed && typeof parsed === 'object') {
                    for (const [pluginId, settings] of Object.entries(parsed)) {
                        state.pluginSettings.set(pluginId, settings);
                    }
                    log('Loaded persisted plugin settings');
                }
            }
        } catch (err) {
            warn('Failed to load persisted plugin settings:', err);
        }
    };

    const persistSettings = () => {
        try {
            const obj = {};
            for (const [pluginId, settings] of state.pluginSettings) {
                obj[pluginId] = settings;
            }
            localStorage.setItem(state.storageKey, JSON.stringify(obj));
        } catch (err) {
            warn('Failed to persist plugin settings:', err);
        }
    };

    const getPluginSettings = (pluginId) => {
        const id = String(pluginId || '').trim();
        if (!id) return null;
        return state.pluginSettings.get(id) || null;
    };

    const setPluginSettings = (pluginId, settings) => {
        const id = String(pluginId || '').trim();
        if (!id) return false;

        const oldSettings = state.pluginSettings.get(id);
        state.pluginSettings.set(id, settings);
        persistSettings();

        emit('plugin:settings-changed', { id, settings, oldSettings });
        return true;
    };

    const updatePluginSettings = (pluginId, updates) => {
        const id = String(pluginId || '').trim();
        if (!id) return false;

        const current = state.pluginSettings.get(id) || {};
        const newSettings = { ...current, ...updates };
        return setPluginSettings(id, newSettings);
    };

    const clearPluginSettings = (pluginId) => {
        const id = String(pluginId || '').trim();
        if (!id) return false;

        state.pluginSettings.delete(id);
        persistSettings();
        emit('plugin:settings-cleared', { id });
        return true;
    };

    // ==========================================
    // Plugin Dependencies
    // ==========================================

    const resolveDependencies = (pluginId, visited = new Set()) => {
        const id = String(pluginId || '').trim();
        if (!id) return [];

        // Prevent circular dependencies
        if (visited.has(id)) {
            warn(`Circular dependency detected for plugin "${id}"`);
            return [];
        }
        visited.add(id);

        // Find manifest entry for this plugin
        const entry = state.manifest.find(p => normalizeId(p?.id) === id);
        if (!entry) return [];

        const deps = Array.isArray(entry.dependencies) ? entry.dependencies : [];
        const resolved = [];

        for (const depId of deps) {
            const normDep = normalizeId(depId);
            if (!normDep) continue;

            // Recursively resolve dependencies of dependencies
            const subDeps = resolveDependencies(normDep, new Set(visited));
            for (const subDep of subDeps) {
                if (!resolved.includes(subDep)) {
                    resolved.push(subDep);
                }
            }

            // Add this dependency
            if (!resolved.includes(normDep)) {
                resolved.push(normDep);
            }
        }

        return resolved;
    };

    const getDependencies = (pluginId) => {
        return resolveDependencies(pluginId);
    };

    const getDependents = (pluginId) => {
        const id = String(pluginId || '').trim();
        if (!id) return [];

        const dependents = [];
        for (const entry of state.manifest) {
            const entryId = normalizeId(entry?.id);
            if (!entryId || entryId === id) continue;

            const deps = Array.isArray(entry.dependencies) ? entry.dependencies : [];
            if (deps.some(d => normalizeId(d) === id)) {
                dependents.push(entryId);
            }
        }
        return dependents;
    };

    // ==========================================
    // Hot Reload (Development Mode)
    // ==========================================

    const setDevMode = (enabled) => {
        state.devMode = Boolean(enabled);
        log(`Development mode ${state.devMode ? 'enabled' : 'disabled'}`);
    };

    const isDevMode = () => state.devMode;

    const reloadPlugin = async (pluginId) => {
        const id = String(pluginId || '').trim();
        if (!id) return { success: false, error: 'Invalid plugin ID' };

        if (!state.devMode) {
            warn(`Hot reload requires dev mode. Call setDevMode(true) first.`);
            return { success: false, error: 'Dev mode not enabled' };
        }

        const plugin = state.plugins.get(id);
        const entry = state.manifest.find(p => normalizeId(p?.id) === id);

        if (!entry?.entry) {
            return { success: false, error: `Plugin "${id}" not found in manifest` };
        }

        log(`Hot reloading plugin "${id}"...`);
        emit('plugin:reloading', { id });

        try {
            // Call destroy if plugin has it
            if (plugin?.destroy) {
                try {
                    await plugin.destroy();
                } catch (err) {
                    warn(`Error destroying plugin "${id}" during reload:`, err);
                }
            }

            // Mark plugin as not initialized
            if (plugin) {
                plugin.__techneInited = false;
            }

            // Remove from loaded scripts to force reload
            const scriptUrl = normalizePath(entry.entry);
            state.scriptLoaded.delete(scriptUrl);

            // Remove old plugin registration
            state.plugins.delete(id);

            // Reload the script with cache busting
            const waitForPlugin = waitForRegistration(id);
            const ok = await loadScript(scriptUrl, { async: false, forceReload: true });

            if (!ok) {
                return { success: false, error: `Failed to reload script for "${id}"` };
            }

            // Wait for re-registration
            const newPlugin = await waitForPlugin;

            // Re-initialize if enabled
            if (state.enabled.has(id)) {
                await initPluginIfEnabled(newPlugin);
            }

            log(`Hot reload complete for "${id}"`);
            emit('plugin:reloaded', { id });

            return { success: true };
        } catch (err) {
            error(`Hot reload failed for "${id}":`, err);
            return { success: false, error: String(err?.message || err) };
        }
    };

    const reloadAllPlugins = async () => {
        if (!state.devMode) {
            warn(`Hot reload requires dev mode. Call setDevMode(true) first.`);
            return { success: false, error: 'Dev mode not enabled' };
        }

        const results = {};
        for (const id of state.enabled) {
            results[id] = await reloadPlugin(id);
        }
        return { success: true, results };
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
            // Plugin settings methods (bound to plugin context in init)
            getSettings: (pluginId) => getPluginSettings(pluginId),
            setSettings: (pluginId, settings) => setPluginSettings(pluginId, settings),
            updateSettings: (pluginId, updates) => updatePluginSettings(pluginId, updates),
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
            // Pass plugin's persisted settings via host
            const pluginHost = {
                ...state.host,
                // Convenience methods bound to this plugin
                getSettings: () => getPluginSettings(id),
                setSettings: (settings) => setPluginSettings(id, settings),
                updateSettings: (updates) => updatePluginSettings(id, updates)
            };
            await plugin.init(pluginHost);
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
        // Handle array format: ['plugin-a', 'plugin-b']
        if (Array.isArray(enabled)) {
            for (const id of enabled) {
                const norm = normalizeId(id);
                if (norm) state.enabled.add(norm);
            }
            return;
        }

        // Handle object format: { 'plugin-a': { enabled: true }, 'plugin-b': { enabled: false } }
        if (enabled && typeof enabled === 'object' && !Array.isArray(enabled)) {
            // First, get defaults from manifest
            const defaults = new Set(
                state.manifest
                    .filter((p) => p?.enabledByDefault !== false)
                    .map((p) => normalizeId(p?.id))
                    .filter(Boolean)
            );

            // Apply saved settings on top of defaults
            for (const [id, config] of Object.entries(enabled)) {
                const norm = normalizeId(id);
                if (!norm) continue;
                if (config?.enabled === true) {
                    defaults.add(norm);
                } else if (config?.enabled === false) {
                    defaults.delete(norm);
                }
            }

            state.enabled = defaults;
            return;
        }

        // If nothing is provided, fall back to defaults from the manifest.
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

        // Build load order based on dependencies
        const loadOrder = [];
        const processed = new Set();

        const addWithDeps = (id) => {
            if (processed.has(id)) return;
            processed.add(id);

            // First add all dependencies
            const deps = resolveDependencies(id);
            for (const depId of deps) {
                if (!processed.has(depId)) {
                    addWithDeps(depId);
                }
            }

            // Then add the plugin itself
            loadOrder.push(id);
        };

        for (const id of Array.from(state.enabled)) {
            addWithDeps(id);
        }

        // Load plugins in dependency order
        for (const id of loadOrder) {
            // Enable dependencies automatically if not already enabled
            if (!state.enabled.has(id)) {
                log(`Auto-enabling dependency "${id}"`);
                state.enabled.add(id);
            }

            const already = state.plugins.get(id);
            if (already) {
                await initPluginIfEnabled(already);
                continue;
            }

            const entry = manifestById.get(id);
            const scriptUrl = normalizePath(entry?.entry);
            if (!scriptUrl) {
                warn(`Missing entry for enabled plugin "${id}"`);
                continue;
            }

            // Track script URL for hot reload
            state.scriptUrls.set(id, scriptUrl);

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

    const start = async ({ manifest = null, enabled = null, appId = null, settings, devMode = false } = {}) => {
        state.startPromise = Promise.resolve(state.startPromise).then(async () => {
            // Set dev mode
            state.devMode = Boolean(devMode);

            // Load persisted plugin settings from localStorage
            loadPersistedSettings();

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

    // Helper methods for settings UI
    const getManifest = () => [...state.manifest];
    const getEnabled = () => Array.from(state.enabled);
    const isEnabled = (id) => state.enabled.has(String(id || '').trim());

    // Enable/disable a plugin dynamically
    const enablePlugin = async (id) => {
        const pluginId = String(id || '').trim();
        if (!pluginId) return false;
        if (state.enabled.has(pluginId)) return true; // Already enabled

        // Auto-enable dependencies first
        const deps = resolveDependencies(pluginId);
        for (const depId of deps) {
            if (!state.enabled.has(depId)) {
                log(`Auto-enabling dependency "${depId}" for "${pluginId}"`);
                state.enabled.add(depId);
            }
        }

        state.enabled.add(pluginId);
        if (state.started) {
            await loadEnabledPlugins();
            emit('plugin:enabled', { id: pluginId, dependencies: deps });
        }
        return true;
    };

    const disablePlugin = (id) => {
        const pluginId = String(id || '').trim();
        if (!pluginId) return false;
        if (!state.enabled.has(pluginId)) return true; // Already disabled

        // Check if other plugins depend on this one
        const dependents = getDependents(pluginId).filter(d => state.enabled.has(d));
        if (dependents.length > 0) {
            warn(`Cannot disable "${pluginId}" - required by: ${dependents.join(', ')}`);
            return false;
        }

        state.enabled.delete(pluginId);
        const plugin = state.plugins.get(pluginId);
        if (plugin?.destroy) {
            try {
                plugin.destroy();
            } catch (err) {
                warn(`Failed to destroy plugin "${pluginId}":`, err);
            }
        }
        emit('plugin:disabled', { id: pluginId });
        return true;
    };

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
        getManifest,
        getEnabled,
        isEnabled,
        enablePlugin,
        disablePlugin,
        extendHost,
        // Plugin settings persistence
        getPluginSettings,
        setPluginSettings,
        updatePluginSettings,
        clearPluginSettings,
        // Dependency management
        getDependencies,
        getDependents,
        // Hot reload (dev mode)
        setDevMode,
        isDevMode,
        reloadPlugin,
        reloadAllPlugins
    };

    const autostart = window.TECHNE_PLUGIN_AUTOSTART !== false;
    if (autostart) {
        document.addEventListener('DOMContentLoaded', () => {
            start().catch((err) => warn('Autostart failed:', err));
        });
    }
})();
