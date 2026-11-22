# NightOwl Performance Budgets and Chromium Trace Runbook

Use the deterministic benchmark for routine startup and view-readiness checks.
Use Chromium traces for deeper investigation after the benchmark identifies a
warning or regression.

## Deterministic benchmark

Run the complete benchmark matrix:

```bash
npm run benchmark:performance
```

The default run takes three samples per scenario. Set
`NIGHTOWL_PERF_SAMPLES=5` when collecting a more stable local baseline. Every
sample waits for a workflow-owned readiness record or DOM readiness state; the
suite contains no fixed sleeps.

The generated, untracked report is
`test-results/performance/nightowl-performance-report.json`. It includes:

- the Git SHA and Node, Electron, and Chromium versions;
- operating system, architecture, CPU model/count, and installed memory;
- actual UTF-8 byte, character, line, record, and slide counts for each fixed
  fixture;
- all samples plus nearest-rank p50 and p95 results; and
- explicit correctness failures, warnings, and regressions.

The checked-in matrix covers fresh-profile startup, small and large Markdown
file switching, Markdown preview readiness, large JSONL and CSV structured
editors, small and large presentation readiness, and complete-slide fitting in
delivery mode.

## Threshold semantics

Budgets live in `orchestrator/modules/performance-budgets.js` and have two
thresholds per scenario:

- `warningMs`: p95 above this value is noisy evidence worth investigating, but
  does not fail the benchmark.
- `regressionMs`: p95 above this value fails the benchmark.

A missing editor, incorrect record renderer, incomplete presentation, failed
load, or slide outside its stage is a correctness failure. Correctness failures
are reported independently and always fail, regardless of latency.

When comparing machines, use the report metadata rather than treating raw
times from unlike hardware as an exact baseline. Adjust a budget only with a
repeatable report and an explanation in the PR.

## Chromium trace capture

1. Start NightOwl in dev mode.
2. Open DevTools or the command surface that can invoke IPC.
3. Call `performance:start-trace`.
4. Run one workflow:
   - Large-file editing: open a 1 MB+ Markdown file, type, save, switch tabs.
   - Large file-tree startup: open a workspace with thousands of files.
   - Markdown preview: open a citation-heavy Markdown file and scroll preview.
   - Graph view: open the graph/network pane and pan/zoom.
   - Presentation view: switch to presentation mode and navigate slides.
5. Call `performance:stop-trace` and keep the returned trace path.

## Trace comparison

Compare a baseline and current trace:

```bash
node scripts/compare-chromium-traces.js /path/to/base-trace.json /path/to/current-trace.json
```

The comparator reports the heaviest complete events by total duration and the
largest deltas between traces. Treat large positive deltas in scripting,
layout, painting, GPU, or compositing events as regressions to investigate.

## Trace storage

Do not commit raw trace files. They can be large and may include local paths.
Attach the comparison output to an issue, PR, or local performance note instead.

## In-editor Resource Profiler

Click **Resources** in the editor status bar, or run **View: Toggle Resource
Profiler** from the command palette. The dock stays below the editing panes.
It samples every two seconds while open and the window is visible, retaining
at most 120 samples (about four minutes). Pause retains history; closing stops
sampling and disconnects the long-task observer. Reopening warms CPU counters
again. There is no sampling timer before the first open.

The panel includes:

- Electron processes: interval CPU, working set, peak working set and wakeups.
- CPU/memory history, approximate renderer JS heap, main event-loop utilization,
  sampling delay, and observed renderer tasks longer than 50 ms.
- Main-process memory/heap, owned lifecycle resource counts, handler counters,
  GPU feature status and the last 30 workflow readiness results.
- JSON export of the bounded history, without document text or readiness
  metadata. Trace output paths are included when a trace has been captured.
- **Record 30s trace**, backed by Chromium content tracing. The main process
  automatically stops capture after 30 seconds even if the panel closes. The
  same cap now applies to traces started through the existing diagnostics API.
  **Stop trace** ends a capture sooner. The saved path appears in the panel.

### Interpretation

CPU is Electron 32's interval average divided by the logical processor count,
so 100% represents total logical CPU capacity. macOS Activity Monitor/`ps` use
a different scale (100% per core); do not compare the percentages directly.
New processes and resumed sampling show an unavailable CPU value until warmed.
A GPU row measures CPU consumed by the GPU process, not GPU hardware utilization.
Working-set sums can double-count shared pages; they are not a unique app memory
footprint. Unsupported metrics are shown as a dash. Renderer heap values come
from Chromium's approximate performance memory API. Sampling delay includes
scheduling delays; it is not a direct measurement of input latency. Long-task
history covers only observation periods and retains the last 120 tasks.

Each profile covers one NightOwl instance and the Electron processes it reports.
Other workspace instances and arbitrary terminal subprocesses are outside that
scope. The profiler and trace recorder have their own overhead. Do not use one
short capture to establish a leak or a performance regression; reproduce the
same workflow with comparable builds and repeat the capture.

API semantics: [Electron process metrics](https://www.electronjs.org/docs/latest/api/structures/process-metric),
[CPU intervals](https://www.electronjs.org/docs/latest/api/structures/cpu-usage),
and [memory units](https://www.electronjs.org/docs/latest/api/structures/memory-info).

The normalization is verified against the [pinned Electron 32.3.3 implementation](https://github.com/electron/electron/blob/v32.3.3/shell/browser/api/electron_api_app.cc#L1197-L1215). Recheck this when upgrading Electron.
