---
id: "reliable-editor-preview-transitions"
title: "Make file opening and preview rendering latest-wins"
status: "triaged"
type: "bug"
priority: "P0"
area: "preview"
owner: "unassigned"
source: "user-report"
evidence: "source-analysis"
created: "2026-08-07"
updated: "2026-08-07"
verification: "A rapid A-B-A file-switch test with delayed settings and markdown rendering always leaves the editor, preview, tab, status, and current path on the final A request."
tags: ["async", "editor", "preview", "reliability"]
---

## Context

The reported blank editor/preview is consistent with two concrete race paths in
`orchestrator/renderer.js`. `openFileInEditor` only queues a second request when
it targets the same path; a request for a different file starts concurrently and
overwrites the single `_openingFilePath` marker. Separately,
`updatePreviewAndStructure` starts a `settingsPromise.then(...)` chain but returns
before that chain and `renderRegularMarkdown` finish. Neither path has a shared
revision token, so an older request can update UI belonging to a newer file.

The structured-record editor adds a higher-risk variant: text inputs schedule a
300 ms commit against module-global `state.parsed`, while `deactivate()` does not
cancel pending timers. Switching files during that window can make the callback
read the next file's record and issue an edit against the next Monaco model.

The intermittent blank state was not forced during the short UI session, so the
evidence classification remains `source-analysis`, not `reproduced`.

## Proposed change

Introduce a file-transition coordinator with monotonic request IDs. Treat editor
model swap, current path, tab selection, preview type, structure pane, load
indicator, and presentation content as one commit. Make preview rendering
cancellable or discard stale results before any DOM write.

Replace global count-based suppression (`suppressPreviewUpdateCount`) with a
request-scoped preview policy.

## Acceptance criteria

- [ ] Rapid switching between Markdown, JSONL, CSV, HTML, image, and PDF fixtures is latest-wins.
- [ ] A pending JSONL/CSV field edit is safely flushed or cancelled before another file/model becomes active.
- [ ] Awaiting preview update means rendering has either committed or been explicitly superseded.
- [ ] Stale MathJax, Mermaid, bibliography, settings, and internal-link work cannot overwrite the active file.
- [ ] Failed transitions restore a usable editor/preview state with a visible retry action.
- [ ] Unit tests cover same-file reloads and different-file interleavings.
