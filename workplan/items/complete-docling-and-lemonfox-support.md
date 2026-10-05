---
id: "complete-docling-and-lemonfox-support"
title: "Complete managed Docling and Lemonfox support"
status: "done"
type: "enhancement"
priority: "P1"
area: "platform"
owner: "codex"
source: "user-report"
evidence: "reproduced"
created: "2026-08-11"
updated: "2026-08-11"
verification: "Docling installs into writable user data and converts through a packaged bridge; Lemonfox uses OS-protected credentials and handles every supported audio response shape without exposing secrets."
tags: ["docling", "tts", "lemonfox", "packaging", "credentials"]
depends_on: ["capability-health-and-workflow-presets"]
---

## Context

Capability health could identify missing Docling and Lemonfox support, but it
could not complete either setup. Docling was probed only through `python3`, its
converter script was absent from packaged builds, and two import handlers used
different subprocess paths. Lemonfox required a launch-time environment
variable, hard-coded an incomplete voice list, assumed every response was MP3,
and treated timestamped JSON responses as raw audio.

## Implemented change

Added a managed Docling runtime under NightOwl user data, with direct argument
vectors for Python virtual-environment creation and package installation. The
runtime discovers configured, managed, Homebrew, and system Python installations
without publishing paths in capability reports. PDF import now shares one
conversion service, uses a bounded model cache, and resolves a converter bridge
that is included as an external packaged resource.

Added OS-protected Lemonfox key storage with environment-variable precedence,
configuration status, removal, and an explicit short test phrase. Provider
requests are normalized and bounded, restricted to the documented global and EU
endpoints, preserve all supported formats, and decode timestamped JSON responses.
Speech settings now expose configuration, region, current voices, and provider
health without reading a saved key back into the renderer.

## Acceptance criteria

- [x] Docling installation never writes into `app.asar` or the signed application bundle.
- [x] Packaged builds contain a Python-readable Docling conversion bridge.
- [x] All PDF-to-Markdown entry points share the same managed runtime and fallback discovery.
- [x] Lemonfox keys can be saved and removed without entering ordinary settings or renderer state.
- [x] Lemonfox raw audio and word-timestamp responses preserve format and metadata correctly.
- [x] Capability health reflects secure Lemonfox configuration and can install Docling directly.

## Verification

- Focused main-process and renderer tests cover runtime placement, packaged
  bridge resolution, direct process arguments, credential redaction, fixed
  endpoint selection, audio formats, timestamps, IPC allowlists, and install UI.
- Local CI passed its static, workplan, theme, presentation, and full Jest stages:
  129 suites and 1,356 tests passed, with one pre-existing skip.
- The required Electron suite passed all 21 workflows in a fresh desktop session,
  and all four packaged-app workflows passed against the newly built bundle.
