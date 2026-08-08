---
id: "renderer-error-telemetry-and-recovery"
title: "Provide structured diagnostics and recoverable view errors"
status: "done"
type: "enhancement"
priority: "P2"
area: "platform"
owner: "codex"
source: "systematic-review"
evidence: "opportunity"
created: "2026-08-07"
updated: "2026-08-08"
verification: "A user can copy a redacted diagnostic report for a failed view and retry or reset that view without restarting the app."
tags: ["diagnostics", "errors", "logging"]
depends_on: ["reliable-editor-preview-transitions", "recover-presentation-load-failures"]
---

## Context

High-risk files still contain hundreds of direct console calls (248 in
`renderer.js`, 119 in presentation JSX, 73 in file handlers, 61 in mode switching,
and 51 in `main.js`). Errors frequently log and continue, leaving the user with
stale or empty UI but no shared incident context. Existing debug utilities are
not consistently used.

## Proposed change

Use one structured logger with levels, domains, request IDs, and automatic path
redaction. Add per-view error boundaries with Retry and Reset View. Expose a
diagnostics screen for build version, feature readiness, renderer errors,
watchers, and packaging health.

## Acceptance criteria

- [x] Direct logging in transition-critical paths routes through the shared logger.
- [x] File/preview/presentation failures include a correlation ID and terminal state.
- [x] Copied diagnostics omit document contents, credentials, and full private paths by default.
- [x] Recovery actions do not require a full app restart.

## Outcome

- Added a shared renderer diagnostics service with structured domains, incident
  codes, correlation/request IDs, terminal states, bounded incident history, and
  automatic redaction of content, credentials, and private paths.
- Added file, preview, and presentation failure surfaces with Retry, Reset View,
  Copy diagnostics, and View diagnostics actions that recover without restarting
  NightOwl.
- Added a Help > Diagnostics screen that reports redacted incidents, feature/view
  readiness, resource lifecycle health, and source-versus-packaged runtime data.
- Routed transition-critical file, preview, and presentation errors through the
  shared logger and documented the incident/privacy contract.

## Verification

- `npm run ci:local:release` passed all 7 stages: 95 suites / 1,206 tests and 9/9
  required Electron workflows.
- A fresh ARM64 app directory built with `npm run dist:dir -- --mac --arm64`.
- `NIGHTOWL_PACKAGED_APP=dist/mac-arm64/NightOwl.app npm run test:e2e:packaged`
  passed all 3 packaged workflows, including packaged diagnostics metadata and
  readiness reporting.
