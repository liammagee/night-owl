## Plugin Development Workflow

This repository uses a related repository of plugins located in `~/Dev/techne-plugins`, installed as an npm dependency (`@machinespirits/techne-plugins`).

**IMPORTANT: `techne-plugins` is the source of truth for all plugin code.**

### Syncing plugins

Plugins are synced automatically on `npm install` (via postinstall hook), or manually:

```bash
npm run sync-plugins
```

This copies `core/techne-plugin-system.js`, all `plugins/techne-*/` directories, and `themes/presentations/` from techne-plugins into this repo. App-specific files (`manifest.js`) are never overwritten.

### Editing plugins

1. **Always make changes in `~/Dev/techne-plugins` first**
2. Then sync to consumers: `cd ~/Dev/machinespirits/machinespirits-ide && npm run sync-plugins`
3. If you accidentally edited plugins here, copy them back to techne-plugins first

### Backdrop reverse sync

Visual layer definitions are authored in `machinespirits-website/index.html` and extracted into the backdrop plugin:

```bash
cd ~/Dev/techne-plugins
node scripts/extract-backdrop-from-website.js ~/Dev/machinespirits-website
```

