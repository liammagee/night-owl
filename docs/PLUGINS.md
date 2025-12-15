## Techne Plugin System

Goal: make major subsystems reusable across **NightOwl** (Electron Markdown editor) and the LMS website, so features can live in their **own repos** and be “vendored” into each app.

### What exists now

- Core loader: `plugins/techne-plugin-system.js`
- App manifest: `plugins/manifest.js` (sets `window.TECHNE_PLUGIN_MANIFEST`)
- Reference plugin (fauna + shapes): `plugins/techne-backdrop/`
- Presentations plugin (TTS + recording + speaker notes + UI bundle): `plugins/techne-presentations/`
- Markdown renderer plugin (Marked + preview abstraction): `plugins/techne-markdown-renderer/`
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

### NightOwl vs LMS: host adapters (next)

The current host surface is intentionally tiny (`loadCSS`, `loadScript`, events). To make the “big plugins” portable, we need **adapters** so plugins can request capabilities in a standard way:

**Planned host capabilities**

- `host.registerMode({ id, title, mount, unmount })` (maze/network/present)
- `host.registerCommand({ id, run, autocomplete })` (MUD commands, actions)
- `host.getGraph()` / `host.on('graph:changed', …)` (notes/network/maze)
- `host.openFile(path)` / `host.appendLink(sourcePath, targetId, label)`
- `host.renderMarkdown(markdown, options)` (website + editor share pipeline)
- `host.theme.get()` / `host.theme.onChange(...)` (palette + techne layers)

NightOwl will implement these against existing globals (Monaco, IPC, mode switcher). The LMS will implement these against its router + markdown pages.

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
   - Extract graph visualization UI.
   - Host contract: graph access + selection events (open note / filter).
6. **Markdown renderer plugin (levels of abstraction)**
   - ✅ v0 implemented as `plugins/techne-markdown-renderer/` (Marked rendering + preview abstraction/scrolling via `PreviewZoom`).
   - Next: move more of the NightOwl-specific preview pipeline (MathJax, Mermaid, internal link previews) behind host adapters so the LMS can share it cleanly.
7. **Hermeneutic Circle plugin**
   - Extract the circle view + data model.
   - Host contract: graph + markdown + selection events.

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
