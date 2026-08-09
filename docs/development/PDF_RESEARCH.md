# PDF research workflow

NightOwl treats PDF highlights, annotations, citations, and Markdown research
notes as one provenance-preserving workflow.

## Author workflow

1. Open a PDF in the preview.
2. Drag across selectable text, then right-click the selection.
3. Choose **Highlight** or **Add Annotation**.
4. In the annotation dialog, optionally link an existing citation or create a
   citation for the PDF.
5. Optionally create a linked Markdown research note. NightOwl writes it under
   `research-notes/` in the live workspace.

The PDF header reports whether research tools are ready. A PDF with no text
layer shows an explicit OCR/text-extraction warning: canvas display continues,
but quote selection and text search are not claimed to work.

## Persistence and identity

`orchestrator/pdfAnnotations.js` is loaded directly from `index.html`, before
the main renderer. It is included by the existing `orchestrator/**/*` package
rule; the open workspace is never asked to supply executable application code.

Editable annotation data lives under the Electron user-data directory:

```text
pdf-research/documents/<pdf-sha256>.json
```

The SHA-256 content identity survives close/reopen, file rename, workspace
rename, and application restart. Each record is grouped by page and stores
normalized highlights and annotations. Last-known paths and aliases are
metadata, not identity. If a legacy adjacent `.annotations` sidecar exists and
the user-data record does not, it is imported once; subsequent saves use the
user-data store.

The fixed preload surface is:

- `electronAPI.pdfResearch.loadAnnotations({ filePath })`
- `electronAPI.pdfResearch.saveAnnotations({ filePath, highlights, annotations })`
- `electronAPI.pdfResearch.createNote({ filePath, annotation, citation })`

No generic IPC escape hatch is exposed. Research-note destinations are resolved
inside the live workspace before any write.

## Markdown provenance

A generated note records the source filename and absolute local path, stable
document identity, page, quotation, annotation ID, creation time, citation ID,
and citation key in YAML front matter and a human-readable provenance section.
The body retains the selected quotation and annotation text. This makes the
note understandable without the running viewer while preserving a route back
to the exact local PDF page.

## Verification

- `tests/unit/main/pdf-research.test.js` covers page grouping, user-data
  persistence, rename/restart identity, provenance notes, and workspace bounds.
- `tests/unit/main/pdf-research-handlers.test.js` covers the live-workspace IPC
  boundary and stable failures.
- `tests/unit/main/pdf-research-assets.test.js` proves packaged asset ordering
  and visible degradation instead of no-op controls.
- The required `@pdf-research` Electron workflow exercises the real preload and
  main-process store, citation metadata, rename lookup, and Markdown output.
- `tests/e2e/packaged/pdf-research.spec.js` repeats the fixed-capability,
  persistence, and note path in the unpacked packaged application used by CI.
