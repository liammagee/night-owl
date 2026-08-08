---
id: "unified-workspace-index"
title: "Build one multi-format workspace index"
status: "triaged"
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

## Acceptance criteria

- [ ] Supported textual and structured formats appear in Quick Open and scoped search.
- [ ] File changes, renames, deletes, and ignored paths update the index deterministically.
- [ ] Backlinks, unresolved links, tags, citations, and graph consumers share indexed identities.
- [ ] Rename previews enumerate affected references before any edit is applied.
- [ ] Large workspaces expose progress, cancellation, and performance-budget evidence.
