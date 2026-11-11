---
id: "demand-driven-rendering"
title: "Make idle editor rendering and file browsing demand-driven"
status: "done"
type: "bug"
priority: "P1"
area: "performance"
owner: "codex"
source: "user-report"
evidence: "source-analysis"
created: "2026-11-11"
updated: "2026-11-11"
verification: "Matched Electron idle measurements show recurring decorative callbacks stop; focused interaction, resume, hidden views, disposal and presentation delivery are covered by regression checks."
tags: ["performance", "lifecycle", "rendering", "filesystem"]
---

## Context

User reports high CPU while idle with the editor visible. Earlier inactivity
repair stops CSS and graphs on blur but leaves backdrop requestAnimationFrame
and fauna loops running. The prior profiler trace recorded about 3,500 backdrop
callbacks per 30 seconds. No installed NightOwl process was running at this
turn's first inspection. Repair starts from 45c7558 (including prior activity,
PDF and citation fixes), with the existing resource profiler integrated.

## Acceptance criteria

- [x] Shared ownership and cancellation of visual jobs, with idle, visibility,
      view eligibility and reduced-motion handling.
- [x] Backdrop and fauna stop work when hidden, idle or inactive, and release
      listeners/callbacks on disable; no global interception of application timers.
- [x] Regression checks protect editing, background saves and visible delivery.
- [x] Repeatable before/after idle resource measurements and an installable artifact.

- [x] Normal browsing loads only expanded directories and uses watch-invalidated
      directory caches; visible tag hydration does not build the content index.
- [x] Hidden Library rendering does not start indexing; visible entry resumes work.
- [x] Explicit name/tag search and link completion still find collapsed files.

## Verification and evidence

Focused unit checks: 65 passed across 11 suites. Source Electron browsing check
passed. Packaged checks cover decorative idle/wake/hide/reduced motion/destruction,
CSS inactivity, all three graph simulations, autosave with polling stopped, visible
presentation delivery, lazy browsing/external changes/deep name and tag search/link
completion, and on-demand profiling with a bounded trace.

Matched packaged captures with native focus: 195.91% to 5.44% CPU for the default
editor; 186.77% to 7.41% with visible backdrop (100% = one core). Both repaired
idle captures executed zero animation callbacks. See
[findings and raw evidence](../../docs/idle-cpu-2026-11-11/README.md).

Staged artifact: `/Users/lmagee/Dev/nightowl-artifacts/rendering-demand-20261111-v4/NightOwl.app`.
Twelve app files changed; 12,439 unrelated archive files verified unchanged.
Code signature and six native runtime files verified. Existing installed PDF,
citation and other changes were preserved by patching the installed archive.

Final packaged sequence: **7/7 passed**, with no skipped tests. A shared-window
setup issue was resolved by exiting presentation delivery with Escape before
starting the independent editor browsing check. No production workaround was
added for the test setup.

Installed at `/Applications/NightOwl.app` after verifying it was closed and its
archive still matched the measured original. Previous app retained at
`/Users/lmagee/Dev/nightowl-backups/before-rendering-demand-20261111/NightOwl.app`.
No user process was stopped; no user profile or document was migrated. See the
[installation receipt](../../docs/idle-cpu-2026-11-11/installation-receipt.json).

Post-install smoke check passed using an isolated temporary profile: the installed
Resources panel reported five real processes over three samples. The installed
native runtime verification passed; the isolated test app was then closed.
