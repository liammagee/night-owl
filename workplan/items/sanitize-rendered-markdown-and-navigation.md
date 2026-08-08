---
id: "sanitize-rendered-markdown-and-navigation"
title: "Sanitize rendered Markdown and restrict external navigation"
status: "done"
type: "security"
priority: "P1"
area: "security"
owner: "codex"
source: "systematic-review"
evidence: "reproduced"
created: "2026-08-07"
updated: "2026-08-08"
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

## Implemented change

NightOwl now loads DOMPurify and applies a shared post-sanitization URL policy
from `services/contentSecurity.js`. Preview, preview zoom, slide thumbnails,
presentation slides, and speaker notes all use this boundary and fail closed if
it is unavailable. Local images are resolved against the document directory;
supported YouTube, Vimeo, and Zoom embeds receive a fixed sandbox and referrer
policy. The complete allowlist is documented in
`docs/development/CONTENT_SECURITY.md`.

The main window now denies every popup, prevents navigation away from the app
document, and sends only `http:`, `https:`, and `mailto:` targets to
`shell.openExternal`. The `open-external` IPC shares the protocol check and
rejects explicit unsupported schemes without falling through to `openPath`.

The same malicious Markdown fixture runs through preview and presentation in
the source Electron smoke and the built application smoke. That end-to-end
fixture also caught and closed two secondary raw-DOM paths in preview zoom and
slide thumbnails.

## Acceptance criteria

- [x] Event attributes, scripts, unsafe URLs, and unexpected iframes are removed or blocked.
- [x] Allowed local images and explicitly supported media embeds still work.
- [x] `setWindowOpenHandler` rejects non-allowlisted protocols before calling the OS.
- [x] Security regression fixtures run against both preview and presentation renderers.

## Verification

- Focused Jest regression set: 9 suites, 126 tests passed.
- Complete local CI: 5/5 stages passed, including 89 Jest suites and 1,186 tests.
- Source Electron required suite: 5/5 workflows passed with no skips.
- Fresh signed ARM64 directory build completed; the packaged ASAR contains
  DOMPurify and `services/contentSecurity.js`.
- Packaged Electron suite: 2/2 workflows passed with no skips, including the
  malicious-Markdown fixture and tutor-core storage smoke.
