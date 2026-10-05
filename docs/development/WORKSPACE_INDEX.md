# Workspace index

NightOwl uses one main-process, in-memory workspace index for file discovery,
content search, internal links, tags, citations, rename planning, and graph
data. Renderer features consume fixed preload capabilities rather than walking
the filesystem independently.

## Coverage and limits

The index extracts content and metadata from Markdown, plain text, BibTeX,
JSON/JSONC, JSONL, CSV/TSV, HTML, and YAML. It also records bounded metadata
for supported binary files such as PDF, images, presentations, and documents,
without parsing their binary contents.

The default budget is exposed in every completed status response:

- at most 50,000 indexed files;
- at most 2 MB read from any searchable text file; and
- a scheduler yield after every 100 discovered or extracted files.

The renderer shows progress with a cancel action. Cancellation leaves the last
complete index active and marks it dirty for a later retry; consumers never see
a partially replaced index.

## Freshness model

`ipc/workspaceIndexHandlers.js` owns the active roots and recursive filesystem
watchers. Application file mutations also invalidate the index through the
existing file-cache boundary. On platforms where a root cannot be watched
recursively, each query performs a deterministic metadata verification scan.

Refreshes reuse extraction for entries whose path, size, modification time,
and extractor version have not changed. A refresh rebuilds link resolution
against the complete candidate index, so changes, renames, deletes, ignored
paths, and additional workspace roots become visible together.

## Shared identities

Each file identity is its normalized absolute path. Quick Open, search,
backlinks, unresolved links, tags, citations, and graph nodes project that same
identity. Link resolution considers source-relative paths, workspace-relative
paths, normalized aliases, and Markdown extension variants. Ambiguous matches
remain unresolved and include their candidates.

Rename planning is read-only. It returns every resolved reference with source
path, line, original target, and replacement before the existing file mutation
workflow asks for confirmation and writes anything.

## Capability surface

Renderer consumers use `window.electronAPI.search` methods corresponding to:

- `workspace-index-list` and `workspace-index-search`;
- `workspace-index-links` and `workspace-index-resolve-link`;
- `workspace-index-plan-rename` and `workspace-index-graph`; and
- `workspace-index-refresh`, `workspace-index-cancel`, and
  `workspace-index-status`.

The main process emits `workspace-index-progress`. The Command Palette exposes
**Workspace: Refresh File Index**, **Workspace: Show Index Status**, and
**Workspace: Cancel Indexing**.

## Verification

Focused unit and integration coverage lives in:

- `tests/unit/main/workspace-index.test.js`;
- `tests/unit/main/workspace-index-handlers.test.js`;
- `tests/integration/search-handlers.test.js`; and
- the `@required @workspace-index` Electron workflow.

The tests cover supported formats, incremental reuse, change/rename/delete and
ignore behavior, multi-root link identities, structured search, read-only
rename plans, cancellation, budgets, preload routing, and renderer consumers.
