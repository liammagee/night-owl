## NightOwl Development Notes

NightOwl now treats bundled feature code as part of this application repository.

The old `@machinespirits/techne-plugins` source-of-truth workflow has been retired. Do not edit a separate `~/Dev/techne-plugins` repository and sync it back into this app. If a feature currently lives under `plugins/techne-*`, treat it as legacy bundled app code until it is ported into an app-native module.

### Feature Migration Direction

1. Keep active user-facing features working while they are still in `plugins/`.
2. Port features into `orchestrator/modules/`, `css/`, `styles/`, or service modules one at a time.
3. Remove each feature from the generic plugin loader after it has an app-native startup path.
4. Delete `plugins/techne-plugin-system.js` only after no runtime code depends on `window.TechnePlugins`.

See `docs/refactoring/assistant-terminal-and-feature-migration.md` for the current migration plan.
