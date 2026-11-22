# Resource profiling — 2026-11-11

> Historical first profiling pass. The subsequent root-cause repair and packaged
> comparison are documented in [idle CPU investigation](idle-cpu-2026-11-11/README.md).

## Implementation and verification

Branch `codex/resource-profiler`, source baseline `75ce863`, checkout
`~/Dev/machinespirits/nightowl-resource-profiler`. The installed app was not replaced.
Open the dock with **Resources** in the editor status bar or **View: Toggle Resource
Profiler** in the command palette. See [usage and metric semantics](performance-trace-runbook.md#in-editor-resource-profiler).

- 18 focused tests passed across performance handlers, profiler lifecycle,
  readiness budgets and existing diagnostics.
- Real Electron integration passed after the final changes: process metrics,
  pause/resume, automatic 30-second trace capture, JSON data and close cleanup.
- Static quality checks, diff whitespace checks and workplan validation passed.
- Matching dependencies came from `~/Dev/machinespirits/nightowl-inactive-cpu-20261029/node_modules`.
  The primary checkout's mismatched dependencies were rejected before launch.
- No full release build or installed-app deployment was performed.

## Existing installed instances

Twelve `ps` observations at two-second spacing (22 seconds overall) covered both
already-running NightOwl instances. No document changes or restarts were made.
The busy renderer (PID 82788) averaged **30.5% CPU**, with a **43.2%** maximum;
its GPU helper (PID 82773) averaged **26.1%**, with a **28.0%** maximum. The other
renderer averaged 8.1%, and its GPU helper 4.9%. These are macOS `ps` percentages,
which use a different scale and averaging method from Electron's metrics below.
User activity/window state was not controlled, so these are observations rather
than an idle benchmark. A subsequent three-second native renderer stack sample
lacked sufficiently resolved symbols to identify a feature-level cause.

## Isolated source-build capture

Electron 32.3.3, Chromium 128.0.6613.186, macOS arm64,
14 logical CPUs. One fresh temporary profile, with normal features
active. The test captured a quiet interval, inserted a fixed 600-section Markdown
fixture, made five edits and requested preview updates, then allowed settling.
The UI screenshot showed an escaped-markup preview and a companion notification;
this was a profiler integration workload, not a preview correctness benchmark.

| Phase | Samples | Mean app CPU | Peak app CPU | Peak summed working sets |
| --- | ---: | ---: | ---: | ---: |
| Before fixture | 9 | 0.79% | 1.11% | 638.6 MiB |
| Fixture editing and settling | 13 | 2.85% | 9.04% | 989.5 MiB |

CPU percentages are normalized across logical CPUs by the pinned Electron 32
implementation. Null warm-up readings are excluded from CPU statistics. The
before-fixture phase includes startup settling, a pause/resume and trace startup;
these phases are not a controlled before/after experiment. Tracing contributes
CPU and memory through its own tracing-service process. Summed working sets can
count shared pages repeatedly and are not a unique physical memory footprint.
Memory growth in this short capture does not demonstrate a leak.

The trace contains 857,114 events. Largest JavaScript function groups by
inclusive recorded duration:

| Function group | Calls | Total duration | Largest call |
| --- | ---: | ---: | ---: |
| `editor/editor.main.js · anonymous · line 122` | 56 | 284.5 ms | 47.7 ms |
| `techne-backdrop/techne-backdrop.js · animate · line 150` | 3493 | 140.3 ms | 0.5 ms |
| `nightowl-resource-profiler/index.html · MutationObserver.observe.childList · line 5315` | 61 | 39.6 ms | 4.4 ms |
| `orchestrator/renderer.js · anonymous · line 1174` | 5 | 39.1 ms | 8.4 ms |
| `worker/workerMain.js · self.onmessage · line 11` | 18 | 12.5 ms | 9.0 ms |

The backdrop's continuous animation callback is a concrete follow-up target:
source at `plugins/techne-backdrop/techne-backdrop.js` schedules the next animation
frame unconditionally until destroyed. This establishes recurring work in this
source build; it does **not** establish that it caused the installed instance's
higher CPU. Monaco work is also visible during fixture edits. Event durations can
nest and span processes; do not add these rows into a CPU percentage.

## Local evidence

Raw traces are ignored by Git and can contain local paths. The temporary Electron
profile is removed after testing; its trace is copied into the retained test
output first.

- `test-results/resource-profiler/nightowl-installed-resource-samples.json`
- `test-results/resource-profiler/nightowl-hot-renderer.sample.txt`
- `test-results/required-electron/resource-profiler-resource-8bc08-ed-trace-and-stops-on-close-electron-required/resource-report.json`
- `test-results/required-electron/resource-profiler-resource-8bc08-ed-trace-and-stops-on-close-electron-required/chromium-trace.json`
- `test-results/required-electron/resource-profiler-resource-8bc08-ed-trace-and-stops-on-close-electron-required/resource-profiler.png`

Next investigation: repeat the same workload with backdrop animation disabled
and compare traces, then reproduce in the installed build. No animation behavior
or application defaults were changed in this work.
