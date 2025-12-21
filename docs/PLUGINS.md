## Techne Plugin System

Goal: make major subsystems reusable across **NightOwl** (Electron Markdown editor) and the LMS website, so features can live in their **own repos** and be “vendored” into each app.

### What exists now

- Core loader: `plugins/techne-plugin-system.js`
- App manifest: `plugins/manifest.js` (sets `window.TECHNE_PLUGIN_MANIFEST`)
- Reference plugin (fauna + shapes): `plugins/techne-backdrop/`
- Presentations plugin (TTS + recording + speaker notes + UI bundle): `plugins/techne-presentations/`
- Markdown renderer plugin (Marked + preview abstraction): `plugins/techne-markdown-renderer/`
- Network diagram plugin (D3 force-directed graph): `plugins/techne-network-diagram/`
- Hermeneutic Circle plugin (iterative understanding visualization): `plugins/techne-circle/`
- Plugin harness pages: `harness/` (standalone browser testing)
- NightOwl starts plugins after settings load: `orchestrator/renderer.js`
- NightOwl default enabled plugins: `main.js` (`defaultSettings.plugins.enabled`)

### Plugin contract (v0)

A plugin is a browser-friendly script that registers itself:

```js
window.TechnePlugins.register({
  id: 'your-plugin-id',
  name: 'Optional name',
  version: '0.1.0',
  async init(host) {
    await host.loadCSS('...');
    await host.loadScriptsSequential(['...']);
    host.on('some:event', () => {});
  }
});
```

The loader reads `window.TECHNE_PLUGIN_MANIFEST`, which is an array of:

```js
{ id: '...', entry: 'path/to/plugin.js', enabledByDefault: true }
```

### Why this style?

- Works in Electron *and* plain websites (no bundler required).
- Each plugin can be a self-contained folder that is easy to extract to its own repo.
- The “consumer app” controls what’s enabled via settings.

### Recommended repo layout for a plugin

When you extract a plugin into its own repository, keep it “static-asset friendly”:

```
techne-plugin-foo/
  dist/
    plugin.js
    plugin.css        (optional)
    vendor/…          (optional)
  manifest.json       (optional, for tooling)
```

Then each consumer app vendors it into its own `plugins/` directory (via copy, git submodule, or an install+copy script), and points the app manifest at `plugins/techne-plugin-foo/plugin.js`.

### Host Adapter Interface

The plugin system provides a standard host interface that plugins can use. Consuming apps can extend these capabilities via `TechnePlugins.extendHost()`.

**Core capabilities (always available)**

- `host.loadCSS(href)` - Load a stylesheet
- `host.loadScript(src)` - Load a script
- `host.loadScriptsSequential(urls)` - Load scripts in order
- `host.on(event, handler)` / `host.off()` / `host.emit()` - Event bus
- `host.log()` / `host.warn()` / `host.error()` - Logging

**File capabilities (v1 - implemented)**

- `host.readFile(path)` - Read file content, returns `{ content }` or null
- `host.openFile(path)` - Open file in editor
- `host.getFiles(options)` - Get files for visualization, returns `{ files, totalFiles }`
- `host.generateSummaries({ content, filePath })` - AI document summaries

**Mode registration (via events)**

Plugins can emit `mode:available` to register visualization modes:

```js
host.emit('mode:available', {
  id: 'circle',
  title: 'Hermeneutic Circle',
  mount: async (container) => { /* returns view instance */ },
  unmount: (view) => { view.destroy(); }
});
```

**Extending host capabilities**

Consuming apps can add or override capabilities:

```js
TechnePlugins.extendHost({
  getGraph: () => window.myApp.graphData,
  appendLink: (source, target, label) => window.myApp.addLink(source, target, label)
});
```

**Planned capabilities (next)**

- `host.registerCommand({ id, run, autocomplete })` (MUD commands, actions)
- `host.getGraph()` / `host.on('graph:changed', …)` (notes/network/maze)
- `host.appendLink(sourcePath, targetId, label)` (link creation)
- `host.renderMarkdown(markdown, options)` (shared pipeline)
- `host.theme.get()` / `host.theme.onChange(...)` (palette + techne layers)

NightOwl implements these against existing globals (Monaco, IPC, mode switcher). The LMS will implement these against its router + markdown pages.

### Extraction TODOs (high-level)

1. **Extract plugin core** to its own repo (e.g. `techne-plugin-system`), then vendor into both apps.
2. **Backdrop plugin**: extract `plugins/techne-backdrop/` into `techne-plugin-backdrop`.
3. **Presentation plugin**
   - ✅ v0 implemented as `plugins/techne-presentations/` (loads TTS + recording + speaker notes + the current React presenter bundle in NightOwl).
   - Next: define a clean host interface for file access, TTS/audio, capture/recording, navigation, and a browser-friendly presenter UI for the LMS.
4. **Babel Maze plugin**
   - ✅ Implemented as `plugins/techne-maze/` (MUD-style knowledge explorer with wiki-link graph).
   - Uses host adapter for file operations, supports plugin mounting via `initialize()`.
   - Next: integrate with NightOwl mode switcher, add harness link to index.
5. **Network diagram plugin**
   - ✅ Implemented as `plugins/techne-network-diagram/` (D3 force-directed graph).
   - Next: graph access via host adapter instead of globals.
6. **Markdown renderer plugin (levels of abstraction)**
   - ✅ v0 implemented as `plugins/techne-markdown-renderer/` (Marked rendering + preview abstraction/scrolling via `PreviewZoom`).
   - Next: move more of the NightOwl-specific preview pipeline (MathJax, Mermaid, internal link previews) behind host adapters so the LMS can share it cleanly.
7. **Hermeneutic Circle plugin**
   - ✅ Implemented as `plugins/techne-circle/` (D3 concentric circle visualization with document preview).
   - Uses host adapter for file operations (`host.readFile`, `host.openFile`, `host.getFiles`, `host.generateSummaries`).
   - Emits `mode:available` for mode registration.

### Testing

- Unit tests (plugin system + plugins): `npm run test:unit`
- Plugin system tests: `npm test -- --testPathPattern="techne-plugin-system"`
- Standalone harness server: `npm run harness` then open `http://localhost:8090/harness/`

---

## API Reference

### TechnePlugins (Global Object)

The plugin system exposes `window.TechnePlugins` with the following methods:

#### Core Methods

##### `register(plugin)`
Register a plugin with the system.

```js
TechnePlugins.register({
  id: 'my-plugin',           // Required: unique identifier
  name: 'My Plugin',         // Optional: display name
  version: '1.0.0',          // Optional: version string
  init: async (host) => {},  // Optional: initialization function
  destroy: () => {}          // Optional: cleanup function
});
```

##### `start(options)`
Start the plugin system and initialize enabled plugins.

```js
await TechnePlugins.start({
  manifest: [...],           // Plugin manifest array (or uses window.TECHNE_PLUGIN_MANIFEST)
  enabled: ['plugin-a'],     // Array of plugin IDs to enable
  appId: 'my-app',           // Application identifier passed to plugins
  settings: {},              // App settings passed to plugins
  devMode: false             // Enable hot reload support
});
```

**Returns:** `Promise<{ enabled: string[] }>`

##### `getPlugin(id)`
Get a registered plugin by ID.

```js
const plugin = TechnePlugins.getPlugin('my-plugin');
```

**Returns:** Plugin object or `null`

##### `listPlugins()`
Get a sorted list of all registered plugin IDs.

```js
const plugins = TechnePlugins.listPlugins();
// ['alpha-plugin', 'beta-plugin', 'gamma-plugin']
```

#### Enable/Disable Methods

##### `enablePlugin(id)`
Enable a plugin dynamically. Automatically enables dependencies.

```js
await TechnePlugins.enablePlugin('my-plugin');
```

**Returns:** `Promise<boolean>` - success status

##### `disablePlugin(id)`
Disable a plugin. Fails if other enabled plugins depend on it.

```js
const success = TechnePlugins.disablePlugin('my-plugin');
```

**Returns:** `boolean` - success status (false if has dependents)

##### `isEnabled(id)`
Check if a plugin is enabled.

```js
if (TechnePlugins.isEnabled('my-plugin')) { ... }
```

##### `getEnabled()`
Get array of all enabled plugin IDs.

```js
const enabled = TechnePlugins.getEnabled();
```

#### Event System

##### `on(eventName, handler)`
Subscribe to an event.

```js
const unsubscribe = TechnePlugins.on('plugin:registered', (payload) => {
  console.log('Plugin registered:', payload.id);
});

// Later: unsubscribe();
```

**Returns:** Unsubscribe function

##### `off(eventName, handler)`
Unsubscribe from an event.

```js
TechnePlugins.off('my-event', myHandler);
```

##### `emit(eventName, payload)`
Emit an event to all subscribers.

```js
TechnePlugins.emit('my-event', { data: 'value' });
```

**Built-in Events:**
| Event | Payload | Description |
|-------|---------|-------------|
| `plugins:starting` | `{ enabled: string[] }` | Before loading plugins |
| `plugins:started` | `{ enabled: string[] }` | After all plugins loaded |
| `plugin:registered` | `{ id: string }` | Plugin registered |
| `plugin:enabled` | `{ id: string, dependencies: string[] }` | Plugin enabled |
| `plugin:disabled` | `{ id: string }` | Plugin disabled |
| `plugin:settings-changed` | `{ id, settings, oldSettings }` | Settings updated |
| `plugin:loading` | `{ id: string }` | Lazy plugin loading |
| `plugin:loaded` | `{ id: string }` | Lazy plugin loaded |
| `plugin:reloading` | `{ id: string }` | Hot reload starting |
| `plugin:reloaded` | `{ id: string }` | Hot reload complete |

#### Settings Persistence

##### `getPluginSettings(pluginId)`
Get settings for a plugin.

```js
const settings = TechnePlugins.getPluginSettings('my-plugin');
// { theme: 'dark', fontSize: 14 } or null
```

##### `setPluginSettings(pluginId, settings)`
Set (replace) settings for a plugin.

```js
TechnePlugins.setPluginSettings('my-plugin', { theme: 'light' });
```

##### `updatePluginSettings(pluginId, updates)`
Merge updates into existing settings.

```js
TechnePlugins.updatePluginSettings('my-plugin', { fontSize: 16 });
// Existing settings preserved, fontSize updated
```

##### `clearPluginSettings(pluginId)`
Remove all settings for a plugin.

```js
TechnePlugins.clearPluginSettings('my-plugin');
```

#### Dependency Management

##### `getDependencies(pluginId)`
Get all dependencies for a plugin (including nested).

```js
const deps = TechnePlugins.getDependencies('my-plugin');
// ['base-plugin', 'core-plugin']
```

##### `getDependents(pluginId)`
Get all plugins that depend on this plugin.

```js
const dependents = TechnePlugins.getDependents('core-plugin');
// ['feature-a', 'feature-b']
```

#### Lazy Loading

##### `loadPlugin(pluginId)`
Load a lazy plugin on demand.

```js
const result = await TechnePlugins.loadPlugin('lazy-feature');
if (result.success) {
  console.log('Loaded:', result.plugin);
} else {
  console.error('Failed:', result.error);
}
```

**Returns:** `Promise<{ success: boolean, plugin?: object, error?: string }>`

##### `isLazy(pluginId)`
Check if a plugin is lazy (enabled but not yet loaded).

```js
if (TechnePlugins.isLazy('heavy-plugin')) {
  await TechnePlugins.loadPlugin('heavy-plugin');
}
```

##### `getLazyPlugins()`
Get list of lazy plugins that haven't been loaded yet.

```js
const lazy = TechnePlugins.getLazyPlugins();
```

#### Hot Reload (Development)

##### `setDevMode(enabled)`
Enable or disable development mode for hot reload.

```js
TechnePlugins.setDevMode(true);
```

##### `isDevMode()`
Check if development mode is enabled.

```js
if (TechnePlugins.isDevMode()) { ... }
```

##### `reloadPlugin(pluginId)`
Hot reload a single plugin (dev mode only).

```js
const result = await TechnePlugins.reloadPlugin('my-plugin');
```

**Returns:** `Promise<{ success: boolean, error?: string }>`

##### `reloadAllPlugins()`
Hot reload all enabled plugins (dev mode only).

```js
const result = await TechnePlugins.reloadAllPlugins();
```

#### Resource Loading

##### `loadCSS(href, options)`
Load a CSS stylesheet.

```js
const success = await TechnePlugins.loadCSS('styles/theme.css', { id: 'theme-css' });
```

##### `loadScript(src, options)`
Load a JavaScript file.

```js
const success = await TechnePlugins.loadScript('lib/utils.js', {
  id: 'utils-script',
  async: false,
  forceReload: false
});
```

##### `loadScriptsSequential(urls)`
Load multiple scripts in order.

```js
const success = await TechnePlugins.loadScriptsSequential([
  'lib/dep1.js',
  'lib/dep2.js',
  'lib/main.js'
]);
```

#### Host Extension

##### `extendHost(capabilities)`
Add custom methods to the host object passed to plugins.

```js
TechnePlugins.extendHost({
  getCustomData: () => myApp.data,
  performAction: (params) => myApp.doSomething(params)
});
```

##### `getManifest()`
Get a copy of the current plugin manifest.

```js
const manifest = TechnePlugins.getManifest();
```

---

### Host Object (Plugin Context)

When a plugin's `init(host)` is called, `host` provides:

#### Standard Methods

| Method | Description |
|--------|-------------|
| `host.appId` | Application identifier |
| `host.settings` | Application settings |
| `host.isElectron` | Boolean: running in Electron |
| `host.electronAPI` | Electron IPC API (if available) |
| `host.on(event, handler)` | Subscribe to events |
| `host.off(event, handler)` | Unsubscribe from events |
| `host.emit(event, payload)` | Emit events |
| `host.loadCSS(href)` | Load stylesheet |
| `host.loadScript(src)` | Load script |
| `host.loadScriptsSequential(urls)` | Load scripts in order |
| `host.log(...args)` | Log with plugin prefix |
| `host.warn(...args)` | Warning with plugin prefix |
| `host.error(...args)` | Error with plugin prefix |

#### Plugin-Bound Settings

| Method | Description |
|--------|-------------|
| `host.getSettings()` | Get this plugin's settings |
| `host.setSettings(settings)` | Set this plugin's settings |
| `host.updateSettings(updates)` | Merge updates into settings |

#### Extended Capabilities (App-Specific)

These are added by the consuming application via `extendHost()`:

| Method | Description |
|--------|-------------|
| `host.readFile(path)` | Read file content |
| `host.openFile(path)` | Open file in editor |
| `host.getFiles(options)` | Get files for visualization |
| `host.generateSummaries(options)` | AI document summaries |

---

### Plugin Manifest Format

```js
window.TECHNE_PLUGIN_MANIFEST = [
  {
    id: 'my-plugin',           // Required: unique identifier
    entry: 'plugins/my-plugin/plugin.js',  // Required: script path
    enabledByDefault: true,    // Optional: auto-enable (default: true)
    dependencies: ['other-plugin'],  // Optional: required plugins
    lazy: false                // Optional: defer loading until requested
  }
];
```

---

### Example Plugin

```js
// plugins/my-plugin/plugin.js
(function() {
  window.TechnePlugins.register({
    id: 'my-plugin',
    name: 'My Plugin',
    version: '1.0.0',

    async init(host) {
      // Load resources
      await host.loadCSS('plugins/my-plugin/styles.css');

      // Load settings
      const settings = host.getSettings() || { count: 0 };

      // Subscribe to events
      host.on('document:changed', (doc) => {
        this.handleDocumentChange(doc);
      });

      // Register a mode
      host.emit('mode:available', {
        id: 'my-mode',
        title: 'My Mode',
        mount: (container) => this.mount(container),
        unmount: (view) => this.unmount(view)
      });

      host.log('Plugin initialized');
    },

    destroy() {
      // Cleanup resources
    },

    mount(container) {
      const view = document.createElement('div');
      view.className = 'my-plugin-view';
      container.appendChild(view);
      return view;
    },

    unmount(view) {
      view.remove();
    },

    handleDocumentChange(doc) {
      // Handle document changes
    }
  });
})();
```

---

## Markdown Slides Guide

The presentations plugin (`techne-presentations`) enables markdown-based slideshows with speaker notes, themes, and TTS narration.

### Slide Separator

Slides are separated by horizontal rules (`---`) on their own line:

```markdown
# Welcome

This is slide 1.

---

## Second Slide

This is slide 2.

---

### Third Slide

Final slide content.
```

### Speaker Notes

Add speaker notes using fenced code blocks with the `notes` language:

```markdown
## My Slide Title

Slide content visible to audience.

- Bullet point 1
- Bullet point 2

\`\`\`notes
These notes are only visible in presenter view.

Use them for:
- Talking points
- Timing reminders
- Additional context
\`\`\`
```

Speaker notes are automatically:
- Hidden from the main slide view
- Displayed in the speaker notes panel
- Used for TTS narration (if enabled)

### Slide Anchors

Add anchor IDs to headings for direct navigation:

```markdown
## <a id="introduction"></a>Introduction

Content here...

---

## <a id="conclusion"></a>Conclusion

Wrapping up...
```

These anchors enable:
- Deep linking to specific slides
- Navigation from document structure view
- Internal wiki-style links: `[[#introduction]]`

### Supported Markdown Features

Within slides, all standard markdown features work:

- **Headers**: `#`, `##`, `###`, etc.
- **Emphasis**: `*italic*`, `**bold**`, `***bold italic***`
- **Lists**: Ordered (`1.`) and unordered (`-`, `*`)
- **Code**: Inline `` `code` `` and fenced blocks
- **Links**: `[text](url)` and wiki-links `[[page]]`
- **Images**: `![alt](path/to/image.png)`
- **Tables**: Standard markdown tables
- **Math**: LaTeX with `$inline$` and `$$display$$`
- **Diagrams**: Mermaid fenced code blocks

### Themes

Presentation themes can be specified in the document frontmatter or via slide directives (planned feature).

### Touch Gestures

In presentation mode:
- **Swipe left/right**: Navigate slides
- **Tap left edge**: Previous slide
- **Tap right edge**: Next slide
- **Two-finger tap**: Toggle fullscreen

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `→` / `Space` / `Enter` | Next slide |
| `←` / `Backspace` | Previous slide |
| `F` | Toggle fullscreen |
| `S` | Open speaker notes |
| `N` | Toggle speaker notes panel |
| `P` | Toggle presenter mode |
| `Esc` | Exit presentation |

---

## Plugin Development Guide

This guide explains how to create your own Techne plugins.

### Quick Start

1. Create a plugin folder: `plugins/my-plugin/`
2. Create the main script: `plugins/my-plugin/plugin.js`
3. Register in the manifest: `plugins/manifest.js`
4. Test in the harness: `harness/my-plugin.html`

### Plugin Structure

A minimal plugin:

```js
// plugins/my-plugin/plugin.js
(function() {
    'use strict';

    window.TechnePlugins.register({
        id: 'my-plugin',
        name: 'My Plugin',
        version: '1.0.0',

        async init(host) {
            host.log('Plugin initializing...');

            // Load resources
            await host.loadCSS('plugins/my-plugin/styles.css');

            // Subscribe to events
            host.on('document:changed', this.handleDocumentChange.bind(this));

            host.log('Plugin ready');
        },

        destroy() {
            // Cleanup when plugin is disabled
        },

        handleDocumentChange(doc) {
            // React to document changes
        }
    });
})();
```

### Handling Missing TechnePlugins

If your plugin might load before the plugin system:

```js
(function() {
    const register = () => {
        if (!window.TechnePlugins?.register) return;

        window.TechnePlugins.register({
            id: 'my-plugin',
            // ...
        });
    };

    // Try immediately, or use queue
    if (window.TechnePlugins) {
        register();
    } else {
        window.TECHNE_PLUGIN_QUEUE = window.TECHNE_PLUGIN_QUEUE || [];
        window.TECHNE_PLUGIN_QUEUE.push({
            id: 'my-plugin',
            init: async (host) => { /* ... */ }
        });
    }
})();
```

### Loading Resources

```js
async init(host) {
    // Load CSS (with optional ID to prevent duplicates)
    await host.loadCSS('plugins/my-plugin/styles.css', { id: 'my-plugin-css' });

    // Load single script
    await host.loadScript('plugins/my-plugin/utils.js');

    // Load multiple scripts in order (for dependencies)
    await host.loadScriptsSequential([
        'plugins/my-plugin/vendor/lib.js',
        'plugins/my-plugin/core.js',
        'plugins/my-plugin/ui.js'
    ]);
}
```

### Using the Event System

```js
async init(host) {
    // Subscribe to events
    const unsubscribe = host.on('document:saved', (data) => {
        host.log('Document saved:', data.path);
    });

    // Store unsubscribe for cleanup
    this._unsubscribers = [unsubscribe];

    // Emit events for other plugins
    host.emit('my-plugin:ready', { version: this.version });
}

destroy() {
    // Clean up subscriptions
    this._unsubscribers?.forEach(unsub => unsub());
}
```

### Common Events

| Event | Payload | Description |
|-------|---------|-------------|
| `document:changed` | `{ content, path }` | Document content changed |
| `document:saved` | `{ path }` | Document saved |
| `document:opened` | `{ path, content }` | Document opened |
| `mode:changed` | `{ mode }` | Application mode changed |
| `theme:changed` | `{ theme }` | Theme changed |
| `settings:changed` | `{ settings }` | Settings updated |

### Registering a Mode

Plugins can add new application modes:

```js
async init(host) {
    host.emit('mode:available', {
        id: 'my-mode',
        title: 'My Mode',
        icon: '🎯',

        async mount(container) {
            const view = document.createElement('div');
            view.className = 'my-mode-view';
            container.appendChild(view);

            // Initialize your UI
            this.initializeView(view);

            return view; // Return for unmount
        },

        unmount(view) {
            // Cleanup
            view.remove();
        }
    });
}
```

### Using Settings

```js
async init(host) {
    // Get saved settings (or defaults)
    const settings = host.getSettings() || {
        theme: 'default',
        showLabels: true
    };

    // Update settings
    host.setSettings({ ...settings, showLabels: false });

    // Partial update
    host.updateSettings({ theme: 'dark' });
}
```

### Accessing Host Capabilities

The host object provides app-specific capabilities:

```js
async init(host) {
    // Check environment
    if (host.isElectron) {
        // Use Electron APIs
        const result = await host.electronAPI.invoke('some-channel', data);
    }

    // File operations (if extended by app)
    if (host.readFile) {
        const content = await host.readFile('/path/to/file.md');
    }

    // AI features (if extended by app)
    if (host.generateSummaries) {
        const summaries = await host.generateSummaries({ content, filePath });
    }
}
```

### Testing Plugins

Create a harness page for isolated testing:

```html
<!-- harness/my-plugin.html -->
<!DOCTYPE html>
<html>
<head>
    <title>My Plugin Test</title>
    <style>/* Test styles */</style>
</head>
<body>
    <div id="test-container"></div>

    <script src="../plugins/techne-plugin-system.js"></script>
    <script>
        window.TECHNE_PLUGIN_MANIFEST = [
            { id: 'my-plugin', entry: '../plugins/my-plugin/plugin.js', enabledByDefault: true }
        ];
    </script>
    <script src="../plugins/my-plugin/plugin.js"></script>
    <script>
        TechnePlugins.start({
            appId: 'harness',
            enabled: ['my-plugin']
        }).then(() => {
            console.log('Plugin loaded, ready for testing');
        });
    </script>
</body>
</html>
```

Run the harness server:

```bash
npm run harness
# Open http://localhost:8090/harness/my-plugin.html
```

### Jest Tests

Create unit tests in `tests/unit/renderer/plugins/`:

```js
// tests/unit/renderer/plugins/my-plugin.test.js
const path = require('path');
const pluginPath = path.resolve(__dirname, '../../../../plugins/my-plugin/plugin.js');

describe('my-plugin', () => {
    beforeEach(() => {
        jest.resetModules();
        window.TechnePlugins = { register: jest.fn() };
        document.body.innerHTML = '';
    });

    test('registers with correct id', () => {
        require(pluginPath);

        expect(window.TechnePlugins.register).toHaveBeenCalled();
        const plugin = window.TechnePlugins.register.mock.calls[0][0];
        expect(plugin.id).toBe('my-plugin');
    });

    test('initializes correctly', async () => {
        require(pluginPath);

        const plugin = window.TechnePlugins.register.mock.calls[0][0];
        const host = {
            log: jest.fn(),
            loadCSS: jest.fn().mockResolvedValue(true),
            on: jest.fn(),
            emit: jest.fn()
        };

        await plugin.init(host);

        expect(host.loadCSS).toHaveBeenCalled();
        expect(host.emit).toHaveBeenCalledWith(
            expect.stringContaining('ready'),
            expect.any(Object)
        );
    });
});
```

Run tests:

```bash
npm test -- --testPathPattern="my-plugin"
```

### Best Practices

1. **Self-contained**: Keep all plugin files in one folder
2. **Graceful degradation**: Handle missing capabilities
3. **Cleanup**: Always implement `destroy()` for proper cleanup
4. **Namespaced events**: Prefix events with your plugin id (`my-plugin:ready`)
5. **Settings defaults**: Always provide sensible defaults
6. **Logging**: Use `host.log/warn/error` instead of `console.log`
7. **Documentation**: Include a README in your plugin folder

### Publishing

To share a plugin:

1. Create a standalone repository with the plugin folder contents
2. Include a `manifest.json` with metadata:

```json
{
    "id": "my-plugin",
    "name": "My Plugin",
    "version": "1.0.0",
    "description": "Does something useful",
    "author": "Your Name",
    "entry": "plugin.js",
    "dependencies": []
}
```

3. Consumers can vendor it via git submodule, npm package, or file copy

---

### Loading plugins in the website (Machine Spirits)

**1) Include the loader + manifest**

In `my-website/app.html` (and `my-website/index.html`), load:

- `plugins/techne-plugin-system.js`
- `plugins/manifest.js` (sets `window.TECHNE_PLUGIN_MANIFEST`)

Optional: to fully control when plugins start, set `window.TECHNE_PLUGIN_AUTOSTART = false` *before* loading `techne-plugin-system.js`.

**2) Enable plugins**

Two supported patterns:

- **Enable-by-default**: set `enabledByDefault: true` for a plugin entry in `my-website/plugins/manifest.js`.
- **Programmatic enable (recommended for route/mode based features)**:
  call `window.TechnePlugins.start({ enabled: ['techne-presentations'] })` at the moment you need the feature.

`start()` is safe to call multiple times; later calls add to the enabled set and load/init any newly-enabled plugins.

**3) Static hosting note**

The plugins are plain files. Make sure your hosting setup serves the `plugins/` folder (in dev, `my-website/server.js` uses `express.static(__dirname)` so this works automatically).
