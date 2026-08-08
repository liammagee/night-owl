---
id: "citation-linked-pdf-research"
title: "Integrate PDF annotations with citations and research notes"
status: "triaged"
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

## Acceptance criteria

- [ ] PDF annotations load from packaged application resources, never from the open workspace.
- [ ] Highlights and notes persist across close, reopen, rename, and application restart.
- [ ] An annotation can link to an existing or newly created citation.
- [ ] Creating a Markdown research note preserves document, page, quotation, and citation provenance.
- [ ] Missing text extraction or OCR support degrades visibly rather than installing no-op controls.
