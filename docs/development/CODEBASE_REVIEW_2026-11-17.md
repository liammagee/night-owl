# NightOwl codebase review — 2026-11-17

## Scope and evidence

Reviewed revision `4df02d8` in isolated local checkout
`~/Dev/machinespirits/nightowl-codebase-review-20261117`, branch
`codex/nightowl-codebase-review-20261117`. Installed dependencies from its exact
lockfile; the primary checkout's dependencies did not match. Existing repair
worktrees and the installed application were not modified.

This is a broad source-and-test review with focused fixes. It is not an exhaustive
line-by-line audit of every feature, vendored library, operating system, or remote
service. Passing tests establish their exercised contracts, not absence of bugs.

465 owned JavaScript/JSX/module and test files parsed with Babel without syntax
errors (excluding vendored `lib/`, `vs/`, lectures, and bootstrap fixtures).
Manual source review concentrated on filesystem and replacement integrity,
main/preload/renderer contracts, editor saving, workspace path policy, statistics,
settings, presentation navigation, and lifecycle ownership. Other subsystems were
covered by the repository's existing tests, not a claim of equivalent manual review.

## Confirmed defects and repairs

| Area | Failure | Repair and evidence |
| --- | --- | --- |
| Global replacement UI | Omitted required search results; preview expected different field names; reload tried `.includes()` on a numeric count | Fresh search supplies positions; before/after and count/path contracts aligned; renderer tests and required real Electron workflow |
| Replacement correctness | Multiple hits on one line repeatedly replaced newly inserted text; count measured lines rather than matches | Pure replacement planner applies selected original positions once, preserves captures, lookarounds, literal dollar signs and CRLF; capped selections and zero-width matches tested |
| Replacement safety | Stale search results overwrote changed lines; caller-supplied paths/symlinks could escape the workspace; writes bypassed backups | Canonical and lexical workspace checks before file processing, stale-line validation, shared guarded write with expected-content comparison and backup; three real-filesystem regressions failed before repair |
| Replacement failure reporting | Per-file errors still returned overall success | Explicit failure plus per-file errors and completed paths; operation remains non-transactional across multiple files |
| Search routing/filter | Regex ending in `*` routed to filename search; fallback content search ignored file filter | Regex mode bypasses glob routing; fallback applies requested filename/path filter; integration regression |
| Settings import | Exported scalar/array values were silently dropped | Reuse full-object merge contract, preserve live workspace/session state; round-trip regression failed before repair |
| Statistics | Link labels disappeared, images counted as links, punctuation counted as words, non-Latin vocabulary vanished | Retain visible labels, separate image count, Unicode-aware token filtering; project average word length uses cleaned prose; two regressions failed before repair |
| Path policy | Legitimate `..draft.md` treated as traversal | Check parent directory components rather than arbitrary two-dot prefixes in guards/index |
| Presentation accessibility | Start presentation button failed Axe color contrast | Replace forced black foreground with theme's text-on-accent token; existing full accessibility test is the regression |

## Refactoring

`services/fileWrites.js` now owns the existing guarded write/backup implementation,
shared by editor saves and replacement. Existing file handler test hooks remain
compatible. `services/searchReplace.js` owns deterministic replacement planning;
IPC retains filesystem policy and execution. No broad rewrite of the renderer or
change to dependency versions was attempted.

## Verification

Baseline: 152 Jest suites / 1,583 tests passed. Required Electron baseline was
26/27: spiral navigation advanced to slide index 3 after one Right Arrow instead
of index 1. An isolated diagnostic rerun and the subsequent full required suite
passed without changing presentation navigation. This intermittent failure is
unresolved, not counted as a repaired defect.

- Final `npm run ci:local:release`: **8/8 stages passed**.
- Jest: **154 suites, 1,600 tests passed** (17 additional regression tests).
- Required Electron: **28/28 passed**, zero skipped, including real replacement.
- Editor/session/template regressions: **14/14 passed**.
- Optional accessibility/theme/performance diagnostics: **7/7 passed** after repair
  and browser setup. All measured performance budgets passed.
- Five bounded repetitions of the spiral navigation test: **5/5 passed**; the
  original intermittent failure remains unexplained.
- `git diff --check`: passed.

The first optional diagnostic run found the contrast defect and lacked the pinned
Chromium headless browser for two theme tests. Installed that browser under
`/private/tmp/nightowl-review-browsers` and reran after the CSS repair. A temporary
whitespace defect in the intermediate patch was corrected before final validation.

Raw execution logs are local temporary evidence under `/private/tmp/nightowl-review-*`.
Playwright artifacts and performance measurements are under this checkout's ignored
`test-results/`. These outputs are not committed and may expire.

## Remaining limits and follow-up

- Reproduce the intermittent presentation navigation failure with input/event
  tracing over repeated starts and theme changes; its cause remains unknown.
- The shared guarded-write implementation preserves backups and checks expected
  content, but still uses direct writes and a check-then-write sequence. It is not
  a filesystem transaction or protection against every concurrent external writer.
  Crash-safe writes and multi-file rollback require a separate design and failure
  injection tests.
- Replacement is limited to returned search matches (normally 500); it does not
  silently replace unreturned matches. Preview and execution perform separate
  searches. Changes to a file can require repeating search rather than overwriting.
- Statistics remain heuristic Markdown/readability estimates, not a complete
  CommonMark parser or language-aware segmentation/readability model.
- Windows/Linux native behavior, signed/notarized installers, packaged application
  smoke, authenticated AI/feed providers, OS keychain integrations, external media
  tools, and live remote publishing were not verified by this pass. Distribution
  preflight does not substitute for building and testing a package.
- No dependency vulnerability audit or exhaustive vendored-code audit was performed.
- The 16k-line renderer and other large feature modules still warrant incremental
  extraction around reproducible behavior contracts. Large-scale rewriting would
  add regression risk without evidence of a specific improvement.

No installed-app replacement, publishing, remote push, or merge was performed.

## Continuation

The [November 21 continuation](CODEBASE_REVIEW_2026-11-21.md) supersedes the
presentation, save durability, dependency and packaging follow-up status above.
This November 17 report remains a historical record of its original results.
