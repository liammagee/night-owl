# Visual work ownership

A visible editor should be quiet when no useful work is pending. Focus alone is
not permission to animate indefinitely: a focused window can sit idle for hours.

`nightowlRendererActivity.trackVisualWork()` owns the start/stop lifetime of
recurring visual work. Each registration supplies a name, start callback, stop
callback, and eligibility predicate. The controller starts it at most once per
active period and calls stop when the window becomes inactive, its view becomes
ineligible, reduced motion is requested, or decorative work reaches the idle
deadline (three seconds without pointer, keyboard, wheel or touch input).

The stop callback must cancel its actual requestAnimationFrame/timer handles and
remove work-specific listeners. A callback that keeps scheduling itself while
returning early is still background work. Unregistering or disposing the owner
also stops it. Errors are contained per owner and reported in diagnostics.

Input extends a single idle deadline; it does not create a timer per event.
At idle there is no recurring controller timer. Eligibility checks run on
lifecycle changes, not on every display frame. Call `refresh()` when a view's
eligibility changes. Do not observe animation-written style attributes in a
way that triggers repeated eligibility checks.

The backdrop registers one owner for its transform and fauna loops. It checks
the rendered background's display/visibility rather than guessing from theme
names. Both loops are canceled at idle, and fauna keeps its last frame. Input
resumes animation without jumping through elapsed idle time. Theme changes,
hide/show, reduced-motion changes and feature destruction are covered by tests.

Functional work can register with `decorative: false`; it must still supply a
view-eligibility predicate and cancellation. Idle policy does not intercept
application timers, requestAnimationFrame globally, IPC, autosave, terminal
output, or presentation playback. Existing graph settling and visible delivery
exceptions retain their previous activity rules. New visual loops should use
this owner API rather than adding independent perpetual timers.

The Resource Profiler's runtime details and JSON report include registered jobs,
running jobs, stop reasons and start/stop counts. Use `getDiagnostics()` for
bounded programmatic assertions. Avoid polling that API in production when the
profiler is closed.

## Regression checks and measurements

- Unit tests: `visual-work-ownership.test.js`, `renderer-activity.test.js`.
- Electron: `demand-driven-rendering.spec.js`, `inactive-rendering.spec.js`.
- `scripts/profile-idle-rendering.js LABEL` captures two ten-second idle windows
  after five-second settling periods: default editor and visible backdrop.
- Set `NIGHTOWL_PACKAGED_APP` to profile a packaged `.app` with an isolated
  temporary profile. Outputs stay in `test-results/idle-rendering/LABEL`.
- CPU is computed from cumulative process CPU time over the sample window;
  100% means one fully occupied CPU core. It differs from the profiler panel's
  Electron-normalized machine percentage. Raw samples are retained.

CPU measurements depend on display, machine load and other apps. The stronger
regression invariant is that idle decorative callbacks and pending frame handles
reach zero, remain zero, and resume correctly after real input. A short capture
does not prove that every workload, plugin or source of CPU use is fixed.

## File browsing and hidden consumers

Editor startup must not request the full workspace content index. The Library
explorer defers graph initialization until its container has layout; a visibility
observer renders the latest pending state on entry. Normal tree tag decoration
uses the bounded frontmatter reader for visible files only.

The file browser requests root and expanded directory listings. Native directory
watchers invalidate cached names/types; repeated signature checks reuse those
listings without walking the disk. Collapsed folders load when expanded. Unsupported
watchers fall back to a four-second cache expiry. Changing workspaces or closing
folders prunes unused watches, and handler disposal closes all watches.

Explicit file/tag search and wiki-link completion can request a recursive tree;
only explicit search requests the content index for cross-folder tags. Traversal
uses directory entry types instead of statting every file, skips symlinks (avoiding
cycles), and is bounded at 50,000 entries and 100 levels. These bounds mean very
large recursive results can be incomplete; normal browsing can still expand a
particular subtree. This change does not disable content search or document saves.

Regression checks: `file-tree-snapshot.test.js`, `library-view-demand.test.js`,
and `lazy-file-tree.spec.js` exercise no-work cache hits, external changes, hidden
view deferral/resume, folder expansion, deep name/tag search and link completion.
