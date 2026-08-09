---
id: "unified-workspace-index"
title: "Build one multi-format workspace index"
status: "done"
type: "enhancement"
priority: "P1"
area: "files"
owner: "codex"
source: "systematic-review"
evidence: "source-analysis"
created: "2026-08-09"
updated: "2026-08-09"
verification: "Quick Open, workspace search, links, rename planning, and graph consumers query one incremental index that covers every supported text and structured-record format without stale results after a file change."
tags: ["indexing", "search", "links", "files"]
depends_on: ["reliable-editor-preview-transitions", "resource-lifecycle-ownership"]
---

## Context

NightOwl previews Markdown, text, BibTeX, JSONL, CSV, HTML, PDF, and images, but
Quick Open and several discovery paths still enumerate Markdown only. Search,
links, tags, graph data, and file navigation maintain overlapping views of the
workspace and can therefore disagree.

## Proposed change

Introduce an incremental workspace index with typed file metadata and extractor
adapters. Keep binary parsing optional, cancellable, and bounded; project the
same results into Quick Open, search, backlinks, rename previews, and graph
features.

## Implemented change

One bounded main-process index now discovers every supported text, structured,
and binary-metadata format across all active workspace roots. Quick Open,
global search, link resolution, tags, graph data, and rename previews consume
the same normalized file identities. Refreshes reuse unchanged extraction,
atomically replace complete results, invalidate through filesystem watchers and
application mutations, and fall back to metadata verification when recursive
watching is unavailable. Progress, cancellation, duration, reuse counts, and
explicit file/content budgets are visible through fixed preload capabilities
and Command Palette actions.

## Acceptance criteria

- [x] Supported textual and structured formats appear in Quick Open and scoped search.
- [x] File changes, renames, deletes, and ignored paths update the index deterministically.
- [x] Backlinks, unresolved links, tags, citations, and graph consumers share indexed identities.
- [x] Rename previews enumerate affected references before any edit is applied.
- [x] Large workspaces expose progress, cancellation, and performance-budget evidence.

## Verification

The main-process service and IPC tests exercise all extractors, incremental
reuse, external-change verification, deterministic mutation handling,
multi-root links, shared graph nodes, read-only rename plans, cancellation, and
budgets. Renderer unit tests cover Quick Open-adjacent consumers, tag hydration,
graph adaptation, internal-link resolution, and progress commands. The hosted
`@required @workspace-index` Electron workflow uses a real temporary workspace
to prove multi-format Quick Open and search plus backlinks, citations, graph
edges, rename preview, and budget status end to end.
