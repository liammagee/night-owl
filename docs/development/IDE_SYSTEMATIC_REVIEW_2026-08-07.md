# NightOwl IDE systematic review

Date: 2026-08-07

Baseline: branch `codex/jsonl-csv-record-mode`, commit `9a1226f` before this review

Scope: Electron main/preload/renderer, editor and preview routing, presentation,
structured records, packaging, tests, security boundaries, accessibility,
performance, documentation, and maintainability

## Executive conclusion

NightOwl has substantial functional breadth and a large automated unit-test
base, but its most important user workflows are coordinated through shared
renderer globals and order-sensitive asynchronous side effects. That explains
why a view can appear healthy in ordinary use yet occasionally load the wrong
state or fail to finish loading.

The first implementation work should be two narrow reliability fixes, not a
general rewrite:

1. Make file opening, structured-record commits, and preview rendering one
   latest-wins transition.
2. Fit a complete 16:9 slide to the presentation viewport and add geometry
   regression tests.

The next release-hardening wave should repair packaged tutor-core storage,
restore the missing entitlements file, and replace misleading E2E coverage with
a small real Electron smoke suite. Renderer decomposition should follow these
behavioral contracts so refactoring preserves known-correct behavior.

The review created a source-controlled triage system under `workplan/` with 18
authored items and generated Markdown/JSON views. Each item distinguishes direct
reproduction, test failure, source analysis, and prospective opportunity.

## Method and evidence boundary

The review used four evidence sources:

- Source inspection across the main process, preload bridge, renderer,
  presentation source and CSS, structured-record mode, build configuration,
  tests, and existing architecture/refactoring documents.
- Static and automated checks, including the repository quality scripts and all
  Jest projects with dependencies resolved from the primary checkout.
- A real packaged-app session launched from this worktree with an isolated
  user-data directory and a purpose-built three-slide overflow fixture.
- Structural inventory: file sizes, duplicated assets, logging density, listener
  and interval sites, IPC surface, and E2E discovery.

Evidence labels in the workplan mean:

- `reproduced`: observed in the running packaged app.
- `test-failure`: an automated/preflight check failed directly.
- `source-analysis`: a concrete failure path is present in code, but the
  intermittent user-visible outcome was not forced in the short UI session.
- `opportunity`: architectural or product work rather than a confirmed defect.

This review documents and prioritizes fixes. It does not silently treat proposed
refactors as already validated solutions.

## Architecture and risk map

| Surface | Current responsibility | Main risk |
| --- | --- | --- |
| `main.js` (3,834 lines) | Window lifecycle, menus, settings, services, handler registration | Broad privileged surface and release lifecycle coupling |
| `preload.js` and `preload-ipc-guard.js` | Renderer-to-main bridge and channel allowlists | Very wide generic API; difficult payload-level auditing |
| `ipc/fileHandlers.js` (3,257 lines) | Workspace, file operations, watchers, external opening | Resource lifecycle and filesystem policy share one module |
| `orchestrator/renderer.js` (16,643 lines) | Editor, files, tabs, preview, formats, layout, dialogs, state | Cross-workflow races and global state ownership |
| `js/mode-switcher.js` | Editor/presentation/network/library transitions | Split state plus direct DOM/style restoration |
| presentation plugin JSX/CSS | Markdown parsing, slide layout, Present mode, media and recording | Fixed geometry, duplicated build/style sources, missing error boundary |
| structured-record mode | JSONL/CSV parsing, forms, Monaco edits, record layout | Delayed edits are not scoped to file/model; task schema is hard-coded |
| test/build tooling | Jest, Playwright, static metrics, Electron Builder | Unit depth is good; system-level confidence is currently weak |

The codebase contains about 194,807 lines across tracked JavaScript, JSX, CSS,
and HTML outside `dist/` and `vs/`. Other high-coupling files include
`LibraryExplorerView.js` (5,649 lines), `index.html` (5,300),
`orchestrator/style.css` (5,116), `gamification.js` (4,553),
`citationManager.js` (3,878), and `settings.js` (3,487).

## Priority findings

| Priority | Finding | Evidence | Workplan item |
| --- | --- | --- | --- |
| P0 | Different-file opens can run concurrently and old preview work can commit late | Source analysis | `reliable-editor-preview-transitions` |
| P0 | A delayed JSONL/CSV input commit can target the next active file/model | Source analysis | `reliable-editor-preview-transitions` |
| P0 | Presentation slides are clipped/scrollable and extend outside the viewport | Reproduced | `fit-presentation-slides-to-viewport` |
| P1 | Presentation render exceptions can leave the Loading placeholder indefinitely | Source analysis | `recover-presentation-load-failures` |
| P1 | Mode truth is split and `window.currentMode` becomes stale | Source analysis | `single-source-mode-and-pane-state` |
| P1 | Packaged tutor-core tries to create data inside `app.asar` and is disabled | Reproduced | `package-tutor-core-writable-data-path` |
| P1 | A clean checkout cannot pass macOS distribution readiness | Test failure | `restore-release-entitlements` |
| P1 | Much of the 181-test Playwright inventory is stale, browser-only, or skipped on macOS | Source analysis | `modernize-electron-e2e-harness` |
| P1 | Unsanitized rendered HTML and inconsistent URL scheme policy widen attack surface | Source analysis | `sanitize-rendered-markdown-and-navigation` |
| P2 | `renderer.js` owns too many stateful workflows | Opportunity | `decompose-renderer-orchestrator` |
| P2 | Presentation source/build/CSS ownership is ambiguous | Opportunity | `consolidate-presentation-source-and-styles` |
| P2 | Timers/listeners/watchers lack a consistent dispose contract | Source analysis | `resource-lifecycle-ownership` |
| P2 | Icon controls and SVG hiding need accessibility correction | Reproduced | `accessible-names-and-presentation-semantics` |
| P2 | Console-only failures provide little user recovery or diagnostic context | Opportunity | `renderer-error-telemetry-and-recovery` |
| P2 | Architecture/build documentation is materially stale | Opportunity | `refresh-architecture-and-build-docs` |
| P2 | Quality metrics do not yet measure user-perceived transition latency | Opportunity | `performance-and-large-document-budgets` |
| P2 | Tests hard-code local dependency/network assumptions across worktrees | Test failure | `hermetic-tests-across-worktrees` |
| P2 | Electron remote/preload privilege can be reduced | Opportunity | `minimize-electron-privilege-surface` |
| P2 | Structured editing can become a reusable schema-driven labelling workflow | Opportunity | `schema-driven-record-workflows` |

## Detailed analysis

### 1. Editor and preview transitions are not atomic

The highest-risk path is visible at `orchestrator/renderer.js:6155-6187`.
`_openingFilePath` is a single marker, but queuing happens only when the next
request has the same path. If A is opening and B is requested, B overwrites the
marker and both implementations run. Either can then update the Monaco model,
tab, current path, preview, load indicator, and presentation content.

`updatePreviewAndStructure` has a second ordering defect at
`orchestrator/renderer.js:847-932`: it creates `settingsPromise.then(async ...)`
and immediately returns. Callers that await the function do not await regular
Markdown rendering. The downstream renderer awaits internal-link processing,
preview settings, MathJax, Mermaid, and other work without a render revision
guard. An old render can therefore write after a new file is active.

PDF routing adds global count-based suppression at
`orchestrator/renderer.js:6495-6506`. The assumption that exactly two later
preview calls should be suppressed is not tied to a file or request. If event
counts change, a later unrelated update can be consumed.

The new structured-record editor has a related potential data-integrity defect.
At `orchestrator/modules/structured-record-mode.js:773-780`, text input schedules
a commit after 300 ms. The callback resolves `state.parsed` and the active Monaco
model at execution time. `deactivate()` at lines 556-571 resets shared state but
does not enumerate and cancel pending timers. A fast file switch can therefore
make a field callback operate against the next document.

Recommended boundary: a monotonic `FileTransition` object owns target path,
format, Monaco model, content revision, preview policy, and cancellation. Only
the current transition may commit. Structured edits should capture and verify
the file/model revision or be flushed before the transition begins.

### 2. Presentation has both geometry and load-state defects

The UI reproduction used a three-slide Markdown fixture. On the 18-item slide,
the lower items and footer were unavailable without internal scrolling. In
Present mode the 864-pixel slide extended beyond the right edge of the window,
and another slide remained faintly visible under the current one.

The implementation fixes slide dimensions at 864 by 486
(`MarkdownPreziApp.jsx:45-49`) and renders them with absolute positions and a
translate transform (`MarkdownPreziApp.jsx:2633-2690`). It does not derive a
base scale from the available viewport. Plugin CSS hides outer overflow but sets
`.slide-content` to `overflow: auto`
(`preview-presentation.css:1153-1165`), producing a scrollable viewport inside a
supposedly complete slide.

Presentation feature readiness is more careful than much of the renderer: it
uses a nonce to cancel old loads and has explicit timeout/runtime errors. But the
actual React render catch at `js/mode-switcher.js:342-348` logs only, so the
Loading placeholder written at line 324 can remain forever.

The fix should keep two scales separate: a viewport-fit base scale and user
canvas zoom. Present mode should position only the current slide at the visual
center after subtracting controls/notes. Content overflow should be detected in
authoring and tested across text, table, image, diagram, and code fixtures.

### 3. Mode and pane restoration has competing sources of truth

`js/mode-switcher.js` updates module-local `currentMode` at line 503, but assigns
`window.currentMode` only once at module load (line 736). Other modules can see a
permanently stale value. View state is additionally represented by body classes,
per-view `active` classes, localStorage, and inline display/flex/width values.

Leaving presentation removes multiple inline properties and schedules a delayed
layout refresh (`js/mode-switcher.js:220-258`). The structured-record mode also
captures/restores inline layouts. These mechanisms can each be correct in
isolation but are not composable when transitions overlap.

A state reducer with explicit invariants is preferable to more cleanup code.
The first goal is not a framework migration; it is one owner for mode, panes,
fullscreen, source view, and record view, plus deterministic transition tests.

### 4. Packaged and release paths are not represented by normal tests

The packaged app started, but tutor-core import failed while trying to create
`.../Resources/app.asar/node_modules/@machinespirits/tutor-core/data`. The bridge
then reported tutor-core unavailable. This disables the primary AI integration
even though source-level bridge tests pass with mocks. All writable tutor-core
paths must be injected before import-time or initialization side effects and
placed under Electron `userData`.

The committed build configuration names `build/entitlements.mac.plist` twice,
but Git tracks only the icons under `build/`. `node
scripts/check-distribution-readiness.js` fails both entitlement checks. The same
absence fails the code-quality guard. This is a real release-input defect, not a
sandbox limitation.

These failures support one general rule: required CI should include a clean
packaged launch and a few non-network capability checks, not stop at source-level
unit tests.

### 5. Test quantity currently overstates end-to-end confidence

With `NODE_PATH` pointed at the primary checkout dependencies, Jest reported:

- 81 suites discovered; 77 passed and 4 failed.
- 1,130 tests discovered; 1,119 passed and 11 failed.
- Eight failures were spellcheck tests that hard-code
  `<current-worktree>/node_modules/dictionary-en` instead of resolving the
  package.
- One watcher assertion failed after `fs.watch` emitted `EMFILE`.
- One citation-capture test could not bind loopback in the restricted test
  environment.
- One code-quality assertion correctly detected the missing entitlements file.

The renderer suites, including the 13 structured-record tests, passed. Static
quality checks also passed.

Playwright discovery found 181 tests, but discovery is not execution confidence.
Examples:

- `basic-functionality.spec.js` uses the ordinary browser `page` fixture without
  a server or Electron launch and references old `show-presentation-btn` IDs.
- `ui-interactions.spec.js` attempts `page.goto('app://./index.html')` in an
  ordinary browser context.
- `app-workflow.e2e.js` looks for `#presentation-view`, while production uses
  `#presentation-content`.
- More current Electron suites set `isHeadless` when `DISPLAY` is absent, which
  skips them on normal macOS desktops.

The recommended response is to shrink required E2E coverage first: one isolated
Electron fixture and a small set of deterministic primary workflows. Old suites
should be ported or retired rather than retained as nominal coverage.

### 6. Security boundaries are partly strong but inconsistently applied

Positive controls already exist: context isolation is enabled, renderer Node
integration is disabled, and preload channels are allowlisted. Path-guard and
preload-guard tests passed.

The main gaps are consistency and breadth:

- Presentation Markdown uses `marked.parse` and
  `dangerouslySetInnerHTML` without an explicit sanitizer
  (`MarkdownPreziApp.jsx:555-593`, then `2686-2690`).
- `setWindowOpenHandler` forwards any URL to `shell.openExternal`
  (`main.js:1444-1447`), unlike the explicit IPC handler, which checks allowed
  protocols.
- The generic preload invoke allowlist fronts roughly 249 main-process handler
  registrations, including filesystem, Git, PTY, collaboration server, and
  credential operations.
- Renderer sandboxing is disabled for preload imports, and
  `@electron/remote` is enabled even though no renderer use was found.

Sanitization and navigation policy should be fixed first. Privilege minimization
can then proceed incrementally with payload schemas and sender validation.

### 7. Maintainability, lifecycle, accessibility, and performance

The dominant maintainability issue is ownership rather than raw line count. The
largest files combine user workflows, state, DOM construction, and infrastructure.
There are also exact duplicate assets (`plugins/techne-network-diagram/unified-network.js`
and `orchestrator/modules/unifiedNetwork.js`; plugin and global Babel Maze CSS)
plus non-identical presentation stylesheets with overlapping purpose. The shipped
presentation JavaScript is compiled output, but there is no root build/check
command connecting it to JSX source.

Resource lifetime is similarly implicit. The renderer/plugin tree has 827
listener-add sites and 77 removal sites. That ratio is not itself a defect because
many listeners live for the whole app, but dynamic features and dialogs need an
owner/dispose contract. The feed loop provides a concrete example: its polling
interval is stored and stopped, while its daily prune interval is not.

The live accessibility tree showed icon-only controls without stable names. Broad
mobile presentation CSS hides every SVG under `body.is-presenting`, potentially
hiding diagrams and control icons along with decorative connection lines. Current
accessibility coverage checks only a sample of the first 20 buttons.

Existing quality metrics are useful for detecting known structural regressions,
but they do not measure startup, file-switch, preview-ready, or presentation-ready
latency. Those should become explicit performance marks and p50/p95 budgets over
fixed small and large fixtures.

### 8. Structured records are a promising feature surface

The JSONL/CSV mode already does several things well: it treats Monaco as source
of truth, keeps normal undo/autosave behavior, parses multiline quoted CSV,
coerces JSON types, provides search, and uses constrained selects for current
human-labelling fields. The next feature step should be declarative schemas, not
more hard-coded column names.

A schema can define labels, ordering, help, types, enumerations, required fields,
read-only IDs, and record completion. That would turn the current special mode
into a reusable human-labelling workflow while preserving generic record editing
when no schema exists.

## Validation snapshot

Commands and observations at review time:

| Check | Result |
| --- | --- |
| `node scripts/quality-static-checks.js` | Passed |
| Jest with primary-checkout dependencies | 77/81 suites, 1,119/1,130 tests passed; failures classified above |
| `node scripts/quality-metrics.js HEAD~1 WORKTREE` | Completed; 0 duplicate top-level renderer functions, 1,412 static test declarations |
| `node scripts/check-distribution-readiness.js` | Failed: both configured entitlements paths missing; signing/notarization warnings expected locally |
| Playwright discovery | 181 tests in 15 files; not run as a trustworthy suite because harness models conflict |
| Packaged app: editor/preview | Loaded normally in the simple fixture |
| Packaged app: presentation | Slide clipping, internal scrolling, off-viewport geometry, and adjacent-slide overlap reproduced |
| Packaged app: tutor-core | `app.asar` data-directory failure reproduced; bridge disabled |

## Recommended execution sequence

### Wave 1: protect document state and restore visible correctness

1. `reliable-editor-preview-transitions`
2. `fit-presentation-slides-to-viewport`
3. `recover-presentation-load-failures`

These should be small, test-led changes. Do not begin broad renderer extraction
until the transition and slide-geometry contracts exist.

### Wave 2: make a releasable binary trustworthy

1. `package-tutor-core-writable-data-path`
2. `restore-release-entitlements`
3. `modernize-electron-e2e-harness`
4. `hermetic-tests-across-worktrees`
5. `sanitize-rendered-markdown-and-navigation`

The exit condition is a clean-checkout package plus a required Electron smoke
run that exercises the editor, preview, presentation, and one tutor-core path.

### Wave 3: reduce recurrence and improve supportability

1. `single-source-mode-and-pane-state`
2. `decompose-renderer-orchestrator`
3. `consolidate-presentation-source-and-styles`
4. `resource-lifecycle-ownership`
5. `renderer-error-telemetry-and-recovery`
6. `minimize-electron-privilege-surface`

Refactor one workflow at a time behind the behavior established in Waves 1-2.

### Wave 4: product quality and reusable workflows

1. `accessible-names-and-presentation-semantics`
2. `performance-and-large-document-budgets`
3. `schema-driven-record-workflows`
4. `refresh-architecture-and-build-docs`

## How to operate the board

Authored items live in `workplan/items/`; generated views are `workplan/BOARD.md`
and `workplan/board.json`.

```bash
npm run wp:list
npm run wp:list -- --priority P0
node scripts/workplan.js show reliable-editor-preview-transitions
node scripts/workplan.js set reliable-editor-preview-transitions status active
npm run wp:validate
npm run wp:render
npm run wp:check
```

When work starts, assign an owner and set one item to `active`. Move it to
`review` only when its verification command/fixture exists. Move it to `done`
only when the stated observable verification and acceptance criteria pass.
