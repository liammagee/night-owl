# NightOwl architecture

This document describes the checked-in NightOwl desktop application as of
2026-08-09. It is an ownership map: when behavior crosses a process or directory
boundary, the boundary named here should remain responsible for its policy and
cleanup.

For executable build steps, see
[`docs/development/BUILD_AND_RELEASE.md`](docs/development/BUILD_AND_RELEASE.md).
For live engineering status, use [`workplan/BOARD.md`](workplan/BOARD.md); this
document is not a second backlog.

## Process model

NightOwl is an Electron app with three security and execution boundaries:

```text
Renderer (Chromium, no Node globals)
  index.html + orchestrator/renderer.js + modules/features
                │ fixed window.electronAPI capabilities
                ▼
Preload (context isolation bridge)
  preload.js + preload-ipc-guard.js
                │ validated ipcRenderer invoke/on/send calls
                ▼
Main process (Node.js)
  main.js + ipc/* + services/*
                │
                ├─ filesystem, settings, Git, terminal and exports
                └─ user-data databases, logs and packaged runtime storage
```

### Main process

`main.js` owns the Electron application lifecycle, windows, menus, navigation
policy, runtime paths, and dependency assembly. `ipc/index.js` registers handler
families from `ipc/` and disposes long-lived file, terminal, citation, and feed
resources at shutdown. Main-process services live in `services/`; handlers adapt
their results into serializable IPC responses.

The main process is the only boundary allowed to perform privileged filesystem,
process, shell, operating-system dialog, or external-navigation work.

### Preload capability bridge

`preload.js` exposes the object produced by `createCapabilityApi()` in
`preload-ipc-guard.js`. The renderer receives named capability groups such as
`files`, `settings`, `terminal`, `citations`, `pdfResearch`, `performance`, and
`events`.

There is deliberately no renderer-facing `invoke(channel)`, `on(channel)`,
`send(channel)`, `ipcRenderer`, or Electron remote escape hatch. The guard owns:

- the complete invoke, event, and signal allowlists;
- channel-to-capability method names;
- serializability and nesting checks; and
- stricter argument validation for high-risk methods such as save, terminal,
  collaboration, feed credentials, and external navigation.

Adding IPC requires a registered main handler, a fixed guard contract, and
contract tests. Do not bypass this surface with a string-based bridge.

### Renderer

`index.html` owns static DOM structure and script order. It loads critical
browser/CommonJS-compatible modules before `orchestrator/renderer.js`, then loads
deferred feature modules and `js/mode-switcher.js`.

`orchestrator/renderer.js` remains a large integration adapter (about 16,500
lines at this snapshot). It owns Monaco and concrete DOM/IPC adapters, while
multi-step policy and mutable workflow state move into smaller modules. The
stable controller boundary is described in
[`docs/development/RENDERER_WORKFLOWS.md`](docs/development/RENDERER_WORKFLOWS.md).

Canonical renderer state is split by concern:

- `current-file-state.js` owns current path/directory synchronization.
- `file-transition-coordinator.js` owns latest-wins file and preview tokens.
- `ui-state-store.js` owns application mode, pane projection, fullscreen/source
  overlays, and structured-record visibility.
- `resourceLifecycle.js` owns deterministic timer, listener, observer, watcher,
  object-URL, and child-process disposal.
- `performance-budgets.js` owns semantic readiness records and benchmark budgets.
- `diagnostics.js` owns redacted, correlated renderer failure reports.

## Runtime workflow ownership

| Workflow | Policy owner | Concrete adapter or service |
| --- | --- | --- |
| File opening | `orchestrator/modules/file-open-controller.js` and `file-transition-coordinator.js` | `renderer.js`, `electronAPI.files`, Monaco models |
| Preview selection and latest-wins rendering | `orchestrator/modules/preview-router.js` | Markdown, HTML, binary, and record renderers in `renderer.js` |
| JSONL/CSV record tasks | `structured-record-mode.js` and `structured-record-schema.js` | Monaco edits, sidecar/workspace schema reads, record DOM |
| File tree refresh and polling | `file-tree-controller.js`, `file-tree-state.js`, `file-tree-filter.js` | `renderer.js` DOM and `ipc/fileHandlers.js` |
| Modes and panes | `ui-state-store.js`, `pane-controller.js`, `js/mode-switcher.js` | Renderer layout, presentation/network/circle/library mounts |
| Presentation load and fit | `js/mode-switcher.js`, `plugins/techne-presentations/src/MarkdownPreziApp.jsx`, `presentation-viewport.js` | Generated presentation runtime and speaker-notes service |
| Optional bundled features | `orchestrator/modules/feature-loader.js` | Feature entry points under `plugins/techne-*` |
| Content trust policy | `services/contentSecurity.js` | Markdown preview, presentation rendering, main navigation policy |
| Diagnostics and recovery | `orchestrator/modules/diagnostics.js` | Renderer error states and `ipc/performanceHandlers.js` runtime data |
| Terminal | `orchestrator/modules/assistant-terminal.js` | `ipc/terminalHandlers.js`, xterm, PTY or degraded pipe process |
| Citations | renderer citation modules | `ipc/citationHandlers.js`, `services/citationService.js`, SQLite |
| PDF research | `orchestrator/pdfAnnotations.js` | `ipc/pdfResearchHandlers.js`, `services/pdfResearch.js`, user-data storage |
| Tutor runtime data | tutor bridge modules | `services/tutorRuntimePaths.js` and user-data storage outside `app.asar` |

## Bundled feature loader

`window.NightOwlFeatures` is an app-native loader, not a third-party plugin
marketplace. Its manifest currently owns these feature entries:

| Feature ID | Entry | Default |
| --- | --- | --- |
| `nightowl-backdrop` | `plugins/techne-backdrop/plugin.js` | enabled |
| `nightowl-presentations` | `plugins/techne-presentations/plugin.js` | enabled |
| `nightowl-markdown-renderer` | `plugins/techne-markdown-renderer/plugin.js` | enabled |
| `nightowl-network-diagram` | `plugins/techne-network-diagram/plugin.js` | enabled |
| `nightowl-circle` | `plugins/techne-circle/plugin.js` | disabled |
| `nightowl-maze` | `plugins/techne-maze/plugin.js` | enabled |
| `nightowl-ai-tutor` | `plugins/techne-ai-tutor/plugin.js` | disabled |
| `nightowl-research-feed` | `plugins/techne-research-feed/plugin.js` | disabled |

The loader normalizes legacy `techne-*` IDs, loads scripts/styles once,
initializes enabled entries, and gives each feature an owned resource registry.
New app-native behavior should normally live under `orchestrator/modules/`,
`services/`, or `css/`; the remaining `plugins/techne-*` paths are bundled
feature boundaries retained during incremental migration.

## IPC examples that exist today

Renderer code calls named methods. The underlying channel is recorded here for
main/preload maintenance and can be verified in `preload-ipc-guard.js`.

| Renderer method | IPC channel | Main owner | Purpose |
| --- | --- | --- | --- |
| `electronAPI.files.openFilePath(path)` | `open-file-path` | `ipc/fileHandlers.js` | Read a selected file and return content/path metadata. |
| `electronAPI.files.readFileContentOnly(path)` | `read-file-content-only` | `ipc/fileHandlers.js` | Read supporting content without changing the current file. |
| `electronAPI.settings.getSettings()` | `get-settings` | `ipc/settingsHandlers.js` | Load persisted app settings. |
| `electronAPI.terminal.spawn(options)` | `terminal-spawn` | `ipc/terminalHandlers.js` | Start an owned terminal process. |
| `electronAPI.performance.getResourceDiagnostics()` | `performance:get-resource-diagnostics` | `ipc/performanceHandlers.js` | Inspect main and renderer resource ownership. |
| `electronAPI.citations.get(query)` | `citations-get` | `ipc/citationHandlers.js` | Query citations through the fixed citation capability. |
| `electronAPI.pdfResearch.loadAnnotations(request)` | `pdf-research-load-annotations` | `ipc/pdfResearchHandlers.js` | Load page-addressed annotations by stable PDF identity. |
| `electronAPI.events.switchToPresentation(handler)` | `switch-to-presentation` | menu/main event sender | Subscribe to the presentation shortcut signal. |

IPC results must be plain serializable data. Renderer modules must check both
capability availability and `{ success, error }` responses for optional or
fallible operations.

## Directory responsibility map

The “owner” column names an architectural boundary, not an individual person.

| Top-level path | Owner | Responsibility |
| --- | --- | --- |
| `main.js` | Electron lifecycle | App/window lifecycle, menus, navigation, handler dependencies. |
| `preload.js`, `preload-ipc-guard.js`, `speaker-notes-preload.js` | Security boundary | Fixed renderer capabilities and the smaller notes-window bridge. |
| `index.html` | Renderer shell | DOM landmarks, static CSS/script order, renderer boot. |
| `bin/` | CLI surface | The `nightowl` command and workspace-profile launch forwarding. |
| `build/` | Release inputs | Tracked platform icons and macOS entitlements consumed by electron-builder. |
| `css/` | Static UI styling | Base, layout, component, mode, accessibility, diagnostics, and theme-adapter CSS. |
| `ipc/` | Main-process adapters | Fixed handler families, path guards, runtime workspace, and cleanup. |
| `js/` | Renderer boot/mode adapters | Mode switching, app initialization, notes, editor utilities, and compatibility entry points. |
| `lib/` | Vendored browser runtimes | Checked-in React, D3, Marked, MathJax, PDF, and canvas browser bundles. |
| `orchestrator/` | Core renderer | Monaco/DOM integration, canonical renderer stylesheet, and workflow modules. |
| `plugins/` | Bundled feature teams | Feature entry points and feature-scoped assets loaded by `NightOwlFeatures`. |
| `services/` | Shared services | Citation, content security, credentials, media, runtime paths, CLI, and lifecycle logic. |
| `styles/` | Style-manager feature | Presentation style definitions, previews, and the style settings UI. |
| `templates/` | Export/reference assets | CSL, PowerPoint, and sample templates used by export or authoring flows. |
| `vs/` | Monaco runtime | Vendored Monaco AMD loader, workers, language assets, and localizations. |
| `docs/` | Maintainer documentation | Current operating guides plus historical audits clearly dated as snapshots. |
| `harness/` | Feature maintainers | Browser harness pages for isolated manual feature development. |
| `integrations/` | Integration maintainers | Optional external capture sources such as the citation bookmarklet. |
| `fauna-playground/` | Backdrop maintainers | Development-only generative backdrop experiments; shipped behavior lives in the feature bundle. |
| `scripts/` | Build/tooling owners | CI, builds, distribution checks, workplan tooling, metrics, CLI installers, and helpers. |
| `tests/` | Quality owners | Jest projects, Electron fixtures, required/optional/packaged E2E, and test reporters. |
| `workplan/` | Engineering triage | Authored work items and generated board views. |
| `.github/` | Hosted automation | Required Electron checks and tagged cross-platform release builds. |

`node_modules/`, `dist/`, `test-results/`, `playwright-report/`, coverage output,
and local logs are generated local state, not architecture inputs.

## Source, generated, and vendored files

| Artifact | Classification | Rule |
| --- | --- | --- |
| `plugins/techne-presentations/src/MarkdownPreziApp.jsx` | Canonical source | Edit this file for presentation component changes. |
| `plugins/techne-presentations/MarkdownPreziApp.js` | Generated and tracked | Run `npm run presentation:build`; commit it with the source. |
| `workplan/items/*.md` | Canonical source | Edit item status/acceptance/outcomes here. |
| `workplan/BOARD.md`, `workplan/board.json` | Generated and tracked | Run `npm run wp:render`; never hand-edit. |
| `package-lock.json` | Canonical lock input | Commit dependency resolution changes with `package.json`. |
| `lib/`, `vs/` | Vendored and tracked | Replace deliberately; do not regenerate during routine CI. |
| `build/icon.*`, `build/entitlements.mac.plist` | Tracked release inputs | Distribution checks fail if required inputs are missing. |
| `dist/` | Generated, ignored | electron-builder output; never commit. |
| `test-results/`, `playwright-report/` | Generated, ignored | Local reports, traces, screenshots, and videos. |
| `test-results/performance/nightowl-performance-report.json` | Generated, ignored | Machine-specific benchmark evidence, not a portable baseline. |

Presentation ownership details are in
[`docs/development/PRESENTATION_ASSETS.md`](docs/development/PRESENTATION_ASSETS.md).

## Data and persistence boundaries

- Workspace documents remain user-selected files; Monaco models are the source
  of truth during editing and saves go through fixed file capabilities.
- Settings, runtime databases, logs, recovery data, feed state, and tutor-core
  writable data belong under Electron's user-data directory, never inside the
  application bundle or `app.asar`.
- Structured-record schemas are optional workspace data: direct sidecars or
  `.nightowl/record-schemas.json`. Generic JSONL/CSV editing remains available
  without them.
- `.env` is local configuration and is ignored. `.env.example` is the only
  tracked environment template.

## Quality and release layers

| Layer | Command | Contract |
| --- | --- | --- |
| Unit/integration/behavior | `npm test` | Four Jest projects: main, renderer, integration, behavioral. |
| Required source Electron | `npm run test:e2e` | Real main/preload/renderer workflows with isolated profiles. |
| Optional diagnostics | `npm run test:e2e:optional` | Slower theme and accessibility diagnostics. |
| Performance budgets | `npm run benchmark:performance` | Fixed fixture sizes, readiness marks, p50/p95 and thresholds. |
| Local branch gate | `npm run ci:local` | Whitespace, static policy, workplan, presentation output, Jest, required Electron. |
| Release preflight | `npm run ci:local:release` | Local branch gate plus distribution prerequisites. |
| Unpacked package | `npm run dist:dir -- --mac --arm64` | Build a package directory for packaged-app smoke tests. |
| Packaged Electron | `NIGHTOWL_PACKAGED_APP=... npm run test:e2e:packaged` | Bundle security, state/resources, and writable tutor runtime. |
| Distributables | `npm run dist` | electron-builder installers/archives without publishing. |

Pull requests and pushes to `main` run `.github/workflows/electron-e2e.yml`.
Tags matching `v*` run the cross-platform release workflow. Signing and
notarization requirements are release credentials, not files to commit.

## Evolving the architecture

Architectural changes follow the authored-item workflow in `workplan/`:

1. Capture evidence and user impact in `workplan/items/<id>.md`.
2. Link dependencies and an observable verification contract.
3. Change one ownership boundary at a time behind tests.
4. Run `npm run wp:render` and the relevant CI layer.
5. Record the outcome in the item and move it to `done` only when verified.

The completed audit sequence and remaining extraction guidance are summarized in
[`docs/development/FUTURE_REFACTORING_PLAN.md`](docs/development/FUTURE_REFACTORING_PLAN.md),
with direct links to the workplan item IDs that carry status.
