# NightOwl Chromium Trace Runbook

Use this when validating large-workspace or rendering performance changes.

## Capture

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

## Compare

Compare a baseline and current trace:

```bash
node scripts/compare-chromium-traces.js /path/to/base-trace.json /path/to/current-trace.json
```

The comparator reports the heaviest complete events by total duration and the
largest deltas between traces. Treat large positive deltas in scripting,
layout, painting, GPU, or compositing events as regressions to investigate.

## Storage

Do not commit raw trace files. They can be large and may include local paths.
Attach the comparison output to an issue, PR, or local performance note instead.
