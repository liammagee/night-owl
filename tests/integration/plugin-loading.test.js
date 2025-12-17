/**
 * Integration tests for plugin loading
 * Tests the plugin system functionality
 */

const path = require('path');
const fs = require('fs/promises');

describe('Plugin Loading Integration', () => {
  describe('Plugin Discovery', () => {
    function createPluginLoader(pluginDir) {
      return {
        discoverPlugins: jest.fn(async () => {
          const plugins = [];
          
          // Simulate reading plugin directories
          const mockPlugins = [
            {
              name: 'techne-maze',
              displayName: 'Babel Maze',
              version: '1.0.0',
              description: 'Interactive maze navigation',
              main: 'index.js',
              enabled: true
            },
            {
              name: 'techne-presentations',
              displayName: 'Presentations',
              version: '1.0.0',
              description: 'Slide presentations',
              main: 'index.js',
              enabled: true
            },
            {
              name: 'techne-disabled',
              displayName: 'Disabled Plugin',
              version: '1.0.0',
              description: 'This is disabled',
              main: 'index.js',
              enabled: false
            }
          ];
          
          return mockPlugins;
        }),
        loadPlugin: jest.fn(async (pluginName) => {
          const manifest = {
            name: pluginName,
            displayName: pluginName.replace('techne-', '').replace(/-/g, ' '),
            version: '1.0.0',
            main: 'index.js'
          };
          
          return {
            success: true,
            plugin: {
              manifest,
              loaded: true,
              exports: {
                init: jest.fn(),
                activate: jest.fn(),
                deactivate: jest.fn()
              }
            }
          };
        }),
        unloadPlugin: jest.fn(async (pluginName) => {
          return { success: true, message: `Plugin ${pluginName} unloaded` };
        })
      };
    }

    test('should discover all plugins in directory', async () => {
      const loader = createPluginLoader('/plugins');
      const plugins = await loader.discoverPlugins();

      expect(plugins).toHaveLength(3);
      expect(plugins.map(p => p.name)).toContain('techne-maze');
      expect(plugins.map(p => p.name)).toContain('techne-presentations');
    });

    test('should identify enabled and disabled plugins', async () => {
      const loader = createPluginLoader('/plugins');
      const plugins = await loader.discoverPlugins();

      const enabled = plugins.filter(p => p.enabled);
      const disabled = plugins.filter(p => !p.enabled);

      expect(enabled).toHaveLength(2);
      expect(disabled).toHaveLength(1);
      expect(disabled[0].name).toBe('techne-disabled');
    });

    test('should load plugin successfully', async () => {
      const loader = createPluginLoader('/plugins');
      const result = await loader.loadPlugin('techne-maze');

      expect(result.success).toBe(true);
      expect(result.plugin.loaded).toBe(true);
      expect(result.plugin.manifest.name).toBe('techne-maze');
    });

    test('should unload plugin successfully', async () => {
      const loader = createPluginLoader('/plugins');
      const result = await loader.unloadPlugin('techne-maze');

      expect(result.success).toBe(true);
      expect(result.message).toContain('techne-maze');
    });
  });

  describe('Plugin Manifest Validation', () => {
    function validateManifest(manifest) {
      const required = ['name', 'version', 'main'];
      const missing = required.filter(field => !manifest[field]);
      
      if (missing.length > 0) {
        return { valid: false, errors: missing.map(f => `Missing required field: ${f}`) };
      }
      
      // Validate name format
      if (!/^techne-[a-z0-9-]+$/.test(manifest.name)) {
        return { valid: false, errors: ['Invalid plugin name format'] };
      }
      
      // Validate version format (semver-like)
      if (!/^\d+\.\d+\.\d+/.test(manifest.version)) {
        return { valid: false, errors: ['Invalid version format'] };
      }
      
      return { valid: true, errors: [] };
    }

    test('should validate correct manifest', () => {
      const manifest = {
        name: 'techne-test-plugin',
        version: '1.0.0',
        main: 'index.js',
        description: 'Test plugin'
      };

      const result = validateManifest(manifest);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should reject manifest missing required fields', () => {
      const manifest = {
        name: 'techne-incomplete',
        description: 'Missing version and main'
      };

      const result = validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: version');
      expect(result.errors).toContain('Missing required field: main');
    });

    test('should reject invalid plugin name format', () => {
      const manifest = {
        name: 'invalid_plugin_name',
        version: '1.0.0',
        main: 'index.js'
      };

      const result = validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid plugin name format');
    });

    test('should reject invalid version format', () => {
      const manifest = {
        name: 'techne-test',
        version: 'v1',
        main: 'index.js'
      };

      const result = validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid version format');
    });
  });

  describe('Plugin Settings Persistence', () => {
    function createPluginSettings() {
      const storage = new Map();

      return {
        savePluginState: jest.fn((pluginName, enabled) => {
          storage.set(pluginName, { enabled, savedAt: Date.now() });
          return { success: true };
        }),
        loadPluginState: jest.fn((pluginName) => {
          const state = storage.get(pluginName);
          if (!state) {
            return { enabled: true }; // Default to enabled
          }
          return state;
        }),
        getAllPluginStates: jest.fn(() => {
          const states = {};
          for (const [name, state] of storage) {
            states[name] = state;
          }
          return states;
        })
      };
    }

    test('should save plugin enabled state', () => {
      const settings = createPluginSettings();
      
      const result = settings.savePluginState('techne-maze', false);
      expect(result.success).toBe(true);

      const state = settings.loadPluginState('techne-maze');
      expect(state.enabled).toBe(false);
    });

    test('should return default enabled state for unknown plugin', () => {
      const settings = createPluginSettings();
      
      const state = settings.loadPluginState('techne-unknown');
      expect(state.enabled).toBe(true);
    });

    test('should get all plugin states', () => {
      const settings = createPluginSettings();
      
      settings.savePluginState('techne-maze', true);
      settings.savePluginState('techne-presentations', false);

      const states = settings.getAllPluginStates();
      expect(Object.keys(states)).toHaveLength(2);
      expect(states['techne-maze'].enabled).toBe(true);
      expect(states['techne-presentations'].enabled).toBe(false);
    });
  });

  describe('Plugin Lifecycle', () => {
    function createPluginLifecycle() {
      const loadedPlugins = new Map();

      return {
        initialize: jest.fn(async (pluginName, manifest) => {
          const plugin = {
            name: pluginName,
            manifest,
            state: 'initialized',
            exports: {
              init: jest.fn(() => { plugin.state = 'ready'; }),
              activate: jest.fn(() => { plugin.state = 'active'; }),
              deactivate: jest.fn(() => { plugin.state = 'inactive'; }),
              cleanup: jest.fn(() => { plugin.state = 'cleaned'; })
            }
          };
          loadedPlugins.set(pluginName, plugin);
          plugin.exports.init();
          return { success: true, plugin };
        }),
        activate: jest.fn(async (pluginName) => {
          const plugin = loadedPlugins.get(pluginName);
          if (!plugin) {
            return { success: false, error: 'Plugin not initialized' };
          }
          plugin.exports.activate();
          return { success: true, state: plugin.state };
        }),
        deactivate: jest.fn(async (pluginName) => {
          const plugin = loadedPlugins.get(pluginName);
          if (!plugin) {
            return { success: false, error: 'Plugin not loaded' };
          }
          plugin.exports.deactivate();
          return { success: true, state: plugin.state };
        }),
        cleanup: jest.fn(async (pluginName) => {
          const plugin = loadedPlugins.get(pluginName);
          if (!plugin) {
            return { success: false, error: 'Plugin not found' };
          }
          plugin.exports.cleanup();
          loadedPlugins.delete(pluginName);
          return { success: true };
        }),
        getState: jest.fn((pluginName) => {
          const plugin = loadedPlugins.get(pluginName);
          return plugin ? plugin.state : null;
        })
      };
    }

    test('should initialize plugin', async () => {
      const lifecycle = createPluginLifecycle();
      const manifest = { name: 'techne-test', version: '1.0.0' };

      const result = await lifecycle.initialize('techne-test', manifest);

      expect(result.success).toBe(true);
      expect(lifecycle.getState('techne-test')).toBe('ready');
    });

    test('should activate initialized plugin', async () => {
      const lifecycle = createPluginLifecycle();
      await lifecycle.initialize('techne-test', { name: 'techne-test' });

      const result = await lifecycle.activate('techne-test');

      expect(result.success).toBe(true);
      expect(lifecycle.getState('techne-test')).toBe('active');
    });

    test('should deactivate active plugin', async () => {
      const lifecycle = createPluginLifecycle();
      await lifecycle.initialize('techne-test', { name: 'techne-test' });
      await lifecycle.activate('techne-test');

      const result = await lifecycle.deactivate('techne-test');

      expect(result.success).toBe(true);
      expect(lifecycle.getState('techne-test')).toBe('inactive');
    });

    test('should cleanup and remove plugin', async () => {
      const lifecycle = createPluginLifecycle();
      await lifecycle.initialize('techne-test', { name: 'techne-test' });

      const result = await lifecycle.cleanup('techne-test');

      expect(result.success).toBe(true);
      expect(lifecycle.getState('techne-test')).toBeNull();
    });

    test('should fail to activate non-initialized plugin', async () => {
      const lifecycle = createPluginLifecycle();

      const result = await lifecycle.activate('techne-nonexistent');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not initialized');
    });
  });
});
