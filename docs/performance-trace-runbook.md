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
