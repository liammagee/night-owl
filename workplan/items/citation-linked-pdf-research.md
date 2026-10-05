---
id: "citation-linked-pdf-research"
title: "Integrate PDF annotations with citations and research notes"
status: "done"
type: "enhancement"
priority: "P1"
area: "preview"
owner: "codex"
source: "systematic-review"
evidence: "source-analysis"
created: "2026-08-09"
updated: "2026-08-09"
verification: "Packaged and development builds can highlight PDF text, persist page-addressed annotations, link them to a citation, and create a source-linked Markdown note without falling back to no-op annotation behavior."
tags: ["pdf", "citations", "annotations", "research"]
depends_on: ["minimize-electron-privilege-surface", "resource-lifecycle-ownership"]
---

## Context

NightOwl has substantial PDF annotation and citation code, but the renderer
loads the annotation module by reading a workspace-relative source file and
injecting it at runtime. Failure silently installs no-op annotation methods,
making an important research workflow unreliable in packaged applications.

## Proposed change

Bundle the annotation module through the normal renderer asset path and define
a stable annotation store keyed by document identity and page. Link annotations
to citation records and Markdown notes while preserving content-security and
user-data storage boundaries.

## Implemented change

The annotation runtime is now an explicit packaged renderer asset loaded before
the main renderer; workspace-relative source loading and silent no-op fallbacks
have been removed. A fixed `pdfResearch` preload capability delegates to a
main-process store under Electron user data. The store hashes PDF content for a
stable document identity, groups normalized records by page, records path
aliases, atomically saves JSON, and imports an adjacent legacy sidecar once.

The annotation dialog can link an existing citation or create one for the open
PDF. Each stored annotation retains citation ID, key, and title, and can create
a workspace-bounded Markdown note containing document identity/path, page,
quotation, annotation, and citation provenance. The PDF header now reports
research readiness and explicitly warns when no selectable text/OCR layer is
available.

## Acceptance criteria

- [x] PDF annotations load from packaged application resources, never from the open workspace.
- [x] Highlights and notes persist across close, reopen, rename, and application restart.
- [x] An annotation can link to an existing or newly created citation.
- [x] Creating a Markdown research note preserves document, page, quotation, and citation provenance.
- [x] Missing text extraction or OCR support degrades visibly rather than installing no-op controls.

## Verification

Main-process tests exercise page grouping, atomic user-data persistence,
rename plus fresh-service restart identity, live-workspace handler routing,
provenance note content, path rejection, packaged asset ordering, visible
degradation, and fixed IPC contracts. The required Electron workflow uses a
real temporary PDF and citation to prove save, rename, reload, and note output.
The packaged Electron suite repeats asset/capability loading, persistence, and
note creation against the built application. See
`docs/development/PDF_RESEARCH.md` for the storage and authoring contracts.
