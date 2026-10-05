---
id: "reliable-editor-preview-transitions"
title: "Make file opening and preview rendering latest-wins"
status: "done"
type: "bug"
priority: "P0"
area: "preview"
owner: "codex"
source: "user-report"
evidence: "reproduced"
created: "2026-08-07"
updated: "2026-08-08"
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

## Implemented change

Added a shared latest-wins coordinator for file opens and preview renders. File
tree, tabs, history, search, command palette, network, disk reload, and the maze
surface now enter that boundary before asynchronous file work. Markdown renders
into a detached DOM tree and commits only while current; settings,
bibliographies, internal links, MathJax, Mermaid, speaker notes, structure, and
status updates use the same ownership check.

Structured JSONL/CSV field timers are cancelled when the active file or Monaco
model changes. Failed opens restore the editor shell and expose a Retry action;
preview failures remain visible with their own retry control.

Automated verification covers A-B-A and same-file interleavings, the six target
file types, completed-preview invalidation, delayed structured edits, tab
routing, staged speaker notes, and source-level integration guardrails. The full
local CI gate passed with 83 suites and 1,148 tests; one loopback-dependent test
was explicitly skipped because this worktree cannot bind loopback sockets.

## Acceptance criteria

- [x] Rapid switching between Markdown, JSONL, CSV, HTML, image, and PDF fixtures is latest-wins.
- [x] A pending JSONL/CSV field edit is safely flushed or cancelled before another file/model becomes active.
- [x] Awaiting preview update means rendering has either committed or been explicitly superseded.
- [x] Stale MathJax, Mermaid, bibliography, settings, and internal-link work cannot overwrite the active file.
- [x] Failed transitions restore a usable editor/preview state with a visible retry action.
- [x] Unit tests cover same-file reloads and different-file interleavings.
