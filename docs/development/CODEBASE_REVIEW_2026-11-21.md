# NightOwl review continuation — 2026-11-21

Repository: `night-owl` / `machinespirits-ide`. Branch:
`codex/nightowl-codebase-review-20261117`. Stable checkout:
`/Users/lmagee/Dev/machinespirits/nightowl-codebase-review-20261117`.
Reviewed starting commit: `fe8e1d1`, continuing the [November 17 review](CODEBASE_REVIEW_2026-11-17.md).

## Outcomes

| Priority | Defect | Change and evidence |
| --- | --- | --- |
| P1 | Delayed editor slide target overwrote newer presenter navigation | Held the old 300ms callback, navigated once, then released it: expected index 1, received 3 before repair. Apply targets during entry; navigation revisions invalidate geometry retries. Required Electron regression exercises this ordering. This establishes a failure mechanism matching the original symptom; the original November 17 OS event trace was not retained. |
| P1 | Authoring content reconciliation overwrote a same-frame navigation action | Pending refresh now carries its navigation revision; a newer action invalidates it. Real Electron regression dispatches a content refresh then Right Arrow in one turn: expected 1 / received 0 before repair. |
| P1 | Re-entering a reused deck ignored target slide zero | Mode switcher now passes zero as a valid target. Accessibility sequence exposed retained slide 1 and passes after repair. Its setup explicitly places the editor caret at the start, because tabs restore caret positions. |
| P1 | Obsolete narration callbacks could move a newly selected slide | Slide/mode generations and navigation revisions invalidate old speech completion, polling and advance callbacks; exit disables narration; delayed focus attempts are disposed. Real Electron regression completes old narration after two manual moves. |
| P2 | Separate speaker notes were overwritten by a previous deck cache or delayed navigation callback | Use the current parsed slides for window/inline notes; remove duplicate legacy and delayed updates. The presenter workflow seeds a stale cache, then checks sanitized current notes in both views. Also repair mutable inline-panel references used during recreation. |
| P1 | Partial disk writes could truncate documents; concurrent saves accepted the same baseline; rapid backups collided | Shared save service stages and fsyncs a same-directory file before rename, serializes canonical target paths, captures each request's baseline before queuing, and generates exclusive UUID backup names. Four real-filesystem tests cover partial write failure, conflict, backup uniqueness/mode and symlink preservation; three failed before repair. |
| P1 | Image/recording filenames could escape their destination; duplicate images overwrote originals; recording reveal interpolated shell syntax | Validate path segments; exclusive writes/copies; native `shell.showItemInFolder`; metadata filename cannot equal the recording. Image requests without a filename now work. Five regressions failed before repair. Default recordings use Electron's videos directory rather than a hardcoded Documents path. Image fetch uses a real abort deadline. |
| P1 | Settings accepted prototype keys and could import main-owned state when absent | Validate the complete object before mutation; reject dangerous keys/depth; remove workspace/session keys from imported preferences regardless of current presence. Two regressions failed before repair. |
| P1 | PDF research note creation overwrote existing notes and could follow parent symlinks outside the workspace | Exclusive creation; canonical ancestor/parent checks before directory creation and write; require an explicit workspace. Existing-file regression failed before repair; symlink escape tested. |
| P1 | PDF alias bookkeeping could overwrite a concurrent annotation save | Serialize record read/modify/write by document digest. A controlled delayed-rename test checks annotation preservation and both aliases. |
| P2 | Citation capture damaged multibyte UTF-8 split across chunks | Collect bytes and decode once, reject aborted input; byte-at-a-time regression failed before repair. |
| P1 | Closed terminal input pipe could crash the main process with unhandled EPIPE | Handle input-stream errors and report them to the terminal. Regression failed before repair. |
| P2 | Deferred microfiche fitting exposed a placeholder scale and overwrote manual zoom | Fit on activation before announcing readiness; deferred callbacks require the same canvas and retained fit mode. Controlled animation-frame regression and full required workflow. |
| P2 | Outline preview navigation reset to zero during editor layout changes | Resolve the heading inside the animation frame, scoped to preview content; editor-to-preview scroll sync responds only to scrollTopChanged, not layout-only events. Full editor sequence reproduced the reset; regression also replaces the target before the frame. |
| P2 | Late project statistics replaced newer document statistics | Request revision check before success/error rendering; error messages use textContent. Deferred project-result regression. |
| P1 | EPUB export emitted XHTML, not an EPUB archive; regex LaTeX conversion damaged Markdown/code structure | Shared bounded Pandoc conversion with argv, temporary inputs, metadata file and cleanup. Real local conversion produced an EPUB ZIP with mimetype/container/manifest/navigation/content and a standalone LaTeX document. Missing Pandoc reports a clear error. |
| P1 | Template PDF exported the application window instead of supplied HTML | Isolated hidden sandboxed window with JavaScript disabled prints the requested document, then closes on success/failure. Unit checks cover content ownership, failure preservation and cleanup; packaged test verifies a one-page Letter PDF and window count. |
| P2 | Packaged export assets were omitted | Include `templates/**/*`; packaged check requires APA CSL and PowerPoint reference files. |
| P1 | Dependency audit reported 39 entries including critical/high advisories | Refresh compatible dependencies, Electron 45.4.1, builder 26.18.0, sqlite3 6.0.1; targeted minimatch overrides and tutor-core better-sqlite3 13.2.0 override. Initial native rebuild caught incompatible V8 APIs in better-sqlite3 12; N-API replacement rebuilds and initializes in the packaged application. Final npm audit reports zero entries. |
| P2 | Runtime upgrade changes build/trace contracts | Node 22.12 minimum and CI alignment; Linux build image pinned to Ubuntu 26.04. Native verifier accepts only matching platform/architecture N-API prebuilds. Performance output uses `.pftrace`; JSON comparator gives conversion instructions and rejects dataless input. |

## Coverage ledger

Review combined source inspection at failure/security/lifecycle boundaries, the complete
owned JavaScript syntax inventory, existing unit/integration/behavioral tests, real
Electron workflows and native packaged smoke. This ledger distinguishes those
methods; it does not claim every line of every vendor bundle was manually audited.

| Area | Source boundaries inspected | Verification and limits |
| --- | --- | --- |
| Startup, windows, IPC/preload | Main BrowserWindow isolation, fixed capability guards, handler registration, notes preload, runtime storage paths | Startup/IPC/native storage tests; packaged app initialization. Main preload intentionally remains unsandboxed to import local modules, with context isolation and no renderer Node integration. |
| Files, workspaces, search, saving, recovery | Guarded writes, path guards, replacement planning, file handler roots, editor state and prior review fixes | Real filesystem fault/conflict tests; actual replacement/Git/workspace Electron workflows; editor session suite. Multi-file replacement remains nontransactional. |
| Presentation, modes, notes, speech | Navigation and entry ordering, retries, content updates, target zero, delayed focus, narration lifecycle | Deterministic held-callback and late-speech tests, spiral geometry, accessibility and mode-recovery flows. Live speech provider and OS screen recording permissions not exercised. |
| Renderer, editor, previews and structured records | Mode/UI state, file/preview routing, statistics, HTML sanitization boundaries, resource ownership | Full renderer/behavioral suite; required editor/record/preview workflows, accessibility/themes, microfiche/PPTX packaged smoke. Ancillary renderer modules receive suite/static coverage, not equivalent line-by-line manual review. |
| Citation/PDF/research data | Capture request decoding/limits, annotation identity/storage, note paths, citation/feed SQL | Capture loopback and chunk tests, PDF concurrency tests and actual packaged persistence; citation/feed tests. No account-backed research ingestion. |
| Media, terminal and subprocesses | Image/recording destinations, reveal shell use, pipe failure, CLI provider environment/output/timeout boundaries, Docling/PPTX subprocess bounds | Media safety, terminal, CLI, conversion and capability tests; native rebuild. No installed CLI model invocation or media-permission grant. |
| AI/tutor and collaboration | CLI transport boundaries, tutor writable paths, sandbox/plugin contracts, retired collaboration boundary | Existing mocked routing/privacy/UI tests and packaged tutor initialization without a provider. No claim about model response quality or remote collaboration; retired collaboration remains unsupported. |
| Feeds/credentials/integrations | Parameterized feed store writes, source network timeouts, X sandbox/origin filter, credential safeStorage wrapper, browser/CLI adapters | Existing feed/credential/adapter tests, source inspection. Authenticated providers, live X DOM, OS keychain round trips not run. |
| Git/publishing | argv-based Git invocation, path/ref validation, NUL status parsing, publishing staging/manifest/HTML policy, profiles | Existing integration suite plus actual local bare-remote authoring flow and offline publication preflight. No remote push/deploy. |
| Export | Standard Pandoc invocation, advanced EPUB/LaTeX/PDF implementations, template paths, PPTX/Docling handling | Converter fault/cleanup tests, real local Pandoc output, packaged native PDF and assets. Full standards conformance for every document/style is not established. |
| Packaging/dependencies/performance | Package contents, release workflows, native verifier, tool engine versions, Electron breaking changes, trace comparator, metrics tooling | npm audit, native rebuild/signature repair, unsigned macOS arm64 package, package tests, optional performance/accessibility suite. No Windows/Linux execution, signing/notarization or installer installation. |
| Remaining owned support code | Syntax inventory includes scripts, plugins, tests and browser integration code; repository static policy and workplan checks | Full repository suites exercise ancillary graph, annotation, spelling, writing, theme and gamification modules. Vendored `lib/` and `vs/`, lecture content and backdrop experiments are excluded from manual/syntax ownership scope. npm audit does not audit those checked-in bundles. |

## Validation

- Complete unit/integration/behavioral suite: **159 suites / 1,623 tests**.
- Required Electron workflows: **31/31**, zero skipped.
- Editor/session/template regressions after scroll repair: **14/14**.
- Optional accessibility/theme/performance diagnostics: **7/7**, all measured budgets passed.
- Native rebuild and signature repair completed; unsigned macOS arm64 package built.
- Packaged workflows: **7/7**, including native one-page Letter PDF output, export assets and tutor database initialization.
- Dependency audit: **0 advisory entries** (baseline 39).
- Syntax inventory: **475 owned JavaScript/JSX/module/test/tool files parsed**.
- Real Pandoc EPUB: first uncompressed mimetype, correct MIME contents and XML parsing of container, manifest, navigation and chapter documents passed.
- Final release gate: **8/8 stages passed**, including microfiche, content-reconciliation and speaker-notes repairs.
- Focused presentation matrix: **12/12** across three repetitions; the final required suite also passes after removing the redundant delayed notes writers.

Earlier intermediate failures
remain material evidence: native V8 rebuild failure repaired by the N-API upgrade;
new test cleanup corrected after leaving delivery mode active; valid zero-target
re-entry bug then reproduced by accessibility and repaired. These were not counted
as passing runs. A final packaged-suite invocation omitted `NIGHTOWL_PACKAGED_APP`;
all seven stopped in fixture setup before launch. The corrected invocation points
explicitly to this checkout's built bundle. That bundle then failed before startup:
ASAR extraction returned unrelated bytes for package.json and main.js. Review
documents had been edited during packaging, likely invalidating archive offsets.
An ad-hoc signature repair did not change the failure. A fresh build with frozen
inputs then passed manifest parsing, byte equality of main.js, and all seven
packaged workflows (12.8s), without a distribution signing identity. The first complete Jest continuation passed 156 suites / 1,613 tests.

## Practical boundaries

- Atomic rename protects the original against staged-write failure. It is not a
  cross-process compare-and-swap or a directory-fsync power-loss guarantee. An
  external writer can still race the final rename. Existing symlinks are resolved
  to their canonical target; hardlink identity and extended attributes are not
  preserved by replacement, and permissions are preserved only as POSIX mode bits.
- PDF record serialization is within one service instance, not a multi-process lock.
  Canonical path checks do not eliminate hostile concurrent symlink swaps.
- Pandoc is now explicitly required for advanced EPUB/LaTeX export. The previous
  EPUB fallback was not a valid EPUB. No external converter was installed by this task.
- Dependency/runtime changes are substantial and require platform release validation.
  The isolated macOS package is unsigned and is not an installed-app replacement.
- No paid/model calls, live publishing, remote push, merge, or real account mutation.
  Live accounts, Windows/Linux, signed release distribution, and vendor source audits
  remain unverified; passing local tests cannot establish absence of bugs.

## Upstream compatibility sources

- [Electron 45.4.1](https://releases.electronjs.org/release/v45.4.1).
- [Electron breaking changes](https://www.electronjs.org/docs/latest/breaking-changes): sandboxed preload and tracing changes; safeStorage synchronous methods remain available but are deprecated for removal in Electron 46.
- [better-sqlite3 releases](https://github.com/WiseLibs/better-sqlite3/releases): N-API transition and current platform requirements.
- [GitHub runner availability](https://github.com/actions/runner-images/issues/14747): Ubuntu 26.04 is generally available; explicitly pinning avoids the moving ubuntu-latest transition.

Final aggregate log: `/private/tmp/nightowl-complete-gate.log`; repeated presentation log: `/private/tmp/nightowl-notes-regression.log`; final package evidence:
`/private/tmp/nightowl-frozen-package-integrity.log` and `/private/tmp/nightowl-frozen-package-tests.log`.

Raw logs are local `/private/tmp/nightowl-*nov21*`, `nightowl-*-final*`, and
`nightowl-*-before.log`; they may expire. This source-controlled report preserves
mechanisms, regression locations, outcomes and limits. Playwright diagnostics live
in the checkout's ignored `test-results/` directory.
