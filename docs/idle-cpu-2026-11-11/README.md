# Idle editor CPU investigation — 2026-11-11

The reported condition was an idle, visible editor. Profiling found two independent
classes of unwanted work: continuous decorative animation and filesystem/index
work requested by editor browsing and a hidden Library visualization.

## Controlled packaged comparison

Both runs used the installed Electron runtime, a fresh isolated local temporary
profile, native focus, and an idle editor. Each scenario followed real pointer
input and five seconds of settling, then six process samples two seconds apart
(about ten seconds total). Default editor preceded visible Techne backdrop.
Both windows reported startup `ready` and active native focus at capture end.
The original and repaired apps ran sequentially, with no other test app running.

CPU is the sum of cumulative CPU time deltas across app processes divided by wall
time. **100% is one fully occupied core**, not the percentage of all 14 logical
cores shown in the in-editor profiler. These short captures are a local diagnostic,
not a universal CPU budget or a claim about every workspace/plugin.

| Scenario | Original app | Repaired app | Reduction |
| --- | ---: | ---: | ---: |
| Default editor idle | 195.91% | 5.44% | 97.2% |
| Visible backdrop idle | 186.77% | 7.41% | 96.0% |
| Main process, default editor | 192.73% | 0.23% | 99.9% |
| Main process, visible backdrop | 153.75% | 1.43% | 99.1% |

The original executed 1,199 backdrop callbacks in the first window and 2,416
combined backdrop/fauna callbacks in the second. The repair executed **zero**
in both idle windows. Interaction/resume and cancellation are independently
covered by regression checks, rather than inferred from a low CPU sample alone.

Raw process samples, native activity and animation counters are in
[before.json](before.json) and [after.json](after.json). The reproduction tool is
`scripts/profile-idle-rendering.js`; set `NIGHTOWL_PACKAGED_APP` to the app to test.
It rejects a capture that ends without native focus.

## Causes and repairs

1. The backdrop's requestAnimationFrame loops ran indefinitely even while its
   background was hidden or the editor had no interaction. Shared visual-work
   ownership now cancels both loops after three seconds idle, on hidden/inactive
   views, or reduced motion. Input resumes the animation from its last state.
2. The file tree recursively traversed the entire workspace and statted entries;
   its signature polling could repeat a whole-workspace traversal. Browsing now
   requests only expanded directories, reuses cached directory-entry listings,
   and invalidates them on native filesystem events. No per-file stat is needed.
3. Visible tag decoration requested the entire content index. It now reads bounded
   frontmatter for visible files. Explicit name/tag search still requests the
   cross-folder index; wiki-link completion loads the recursive file list on demand.
4. Gamification startup rendered the hidden Library constellation, independently
   triggering the workspace index. The Library view now defers that rendering
   until visible and renders the most recent pending state when opened.

A visual-only staged repair eliminated RAF callbacks but still consumed more than
one CPU core in the main process. A main-process CPU profile then identified
filesystem traversal. That intermediate build was never installed. The large
before/after change includes removal of this unintended background indexing; it
must not be attributed solely to animation changes.

Directory traversal skips symlinks to avoid cycles and caps recursive queries at
50,000 entries and 100 levels. Very large explicit query results can be incomplete.
Ordinary browsing remains available through folder expansion. Unsupported native
watches use an expiring cache. Full search and intentional visualization workloads
can still consume CPU when requested.

## Integration and verification

The Resource Profiler is available through **Resources** in the editor status bar.
It shows per-process CPU/memory, main-loop utilization, renderer long tasks,
lifecycle and file-handler counters, and visual job stop reasons. It supports
pause/resume, JSON export and bounded 30-second Chromium traces. Closing it stops
sampling. See [visual lifecycle](../visual-work-lifecycle.md) and
[profiling runbook](../performance-trace-runbook.md).

Source repair: `codex/rendering-demand`, based on `45c7558`, in the stable local
checkout `/Users/lmagee/Dev/machinespirits/nightowl-rendering-demand`.

The staged app is based on `/Applications/NightOwl.app`, preserving its installed
PDF, citation and other updates. Twelve app files were added/changed; 12,439
unrelated ASAR files were compared byte-for-byte. See
[repair-receipt.json](repair-receipt.json). Signature and all six required native
runtime files passed verification.

Final test and installation status is recorded in the work card
[`demand-driven-rendering`](../../workplan/items/demand-driven-rendering.md).

Final validation: **65 unit tests and all 7 packaged Electron checks passed**,
plus static/workplan checks. The repair was installed at `/Applications/NightOwl.app`
with the previous app retained under `~/Dev/nightowl-backups/before-rendering-demand-20261111/`.
The installer checked the original archive hash and absence of running user
sessions before replacement, then verified the installed code signature. See the
[installation receipt](installation-receipt.json). No user session was stopped.

Post-install smoke check: the actual installed app opened the Resources panel and
reported five real processes over three samples. The temporary test profile was
removed, and the test app closed. Profiler screenshots, JSON and the passing
30-second trace are retained locally in
`/Users/lmagee/Dev/nightowl-artifacts/rendering-demand-20261111-v4/validation/`.
