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
   - Move the maze engine + view + MUD commands into a plugin.
   - Host contract: graph access, link insertion, open-in-editor, and persistence.
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
- Standalone harness server: `npm run harness` then open `http://localhost:8090/harness/`

### Loading plugins in the website (Machine Spirits)

Machine Spirits vendors the Techne loader and plugins as static assets under `my-website/plugins/`.

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
