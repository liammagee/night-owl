# Presentation Asset Ownership

NightOwl ships a browser-compatible presentation runtime generated from JSX and
loads presentation layout from one canonical stylesheet.

## JavaScript

- Canonical source: `plugins/techne-presentations/src/MarkdownPreziApp.jsx`
- Babel configuration: `plugins/techne-presentations/.babelrc`
- Generated runtime: `plugins/techne-presentations/MarkdownPreziApp.js`

Run `npm run presentation:build` after editing the JSX source. The command uses
the root lockfile's Babel toolchain and deterministically updates the shipped
runtime. `npm run presentation:check` compares a fresh in-memory compilation
with the checked-in runtime and fails when they differ.

The stale-output check is part of local CI and distribution readiness, so both
pull-request packaging and release builds reject an uncommitted compilation.
The plugin-local `build` and `check` scripts delegate to these root commands.

## CSS

`plugins/techne-presentations/preview-presentation.css` owns preview and slide
layout. It is linked once from `index.html` with the ID
`nightowl-presentations-preview-css`; feature initialization asks for that same
ID, so the loader reuses the existing link instead of injecting a second copy.
Slide selectors are scoped below `#presentation-root`.

`plugins/techne-presentations/speaker-notes.css` separately owns the dynamically
created notes panel. There are no compatibility copies under `css/`.

## Other Feature Assets

The Babel Maze stylesheet is owned by `plugins/techne-maze/babel-maze.css`, and
the network visualization runtime is owned by
`plugins/techne-network-diagram/unified-network.js`. Both are loaded by their
feature entry points. Root-level duplicates were removed rather than synchronized.
