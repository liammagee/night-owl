---
id: "sanitize-rendered-markdown-and-navigation"
title: "Sanitize rendered Markdown and restrict external navigation"
status: "triaged"
type: "security"
priority: "P1"
area: "security"
owner: "unassigned"
source: "systematic-review"
evidence: "source-analysis"
created: "2026-08-07"
updated: "2026-08-07"
verification: "A malicious Markdown fixture cannot execute handlers, load disallowed iframe origins, or open a non-allowlisted URI scheme in development or packaged builds."
tags: ["html", "markdown", "navigation", "xss"]
---

## Context

Presentation Markdown is parsed with `marked` and assigned through React
`dangerouslySetInnerHTML` without an explicit sanitizer. The fallback parser also
interpolates source content into HTML. Electron has context isolation and no
renderer Node integration, which limits impact, but untrusted local Markdown can
still create active HTML, remote content, or scheme navigation. The main window's
`setWindowOpenHandler` passes any URL to `shell.openExternal`, while the explicit
`open-external` IPC path correctly allowlists `http`, `https`, and `mailto`.

## Proposed change

Define one sanitizer and URL policy shared by preview, presentation, exports,
citations, and internal links. Disable raw HTML by default or sanitize with a
documented allowlist. Apply the same protocol policy to window-open, navigation,
iframes, images, and IPC.

## Acceptance criteria

- [ ] Event attributes, scripts, unsafe URLs, and unexpected iframes are removed or blocked.
- [ ] Allowed local images and explicitly supported media embeds still work.
- [ ] `setWindowOpenHandler` rejects non-allowlisted protocols before calling the OS.
- [ ] Security regression fixtures run against both preview and presentation renderers.
