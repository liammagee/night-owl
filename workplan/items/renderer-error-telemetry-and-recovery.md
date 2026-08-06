---
id: "renderer-error-telemetry-and-recovery"
title: "Provide structured diagnostics and recoverable view errors"
status: "triaged"
type: "enhancement"
priority: "P2"
area: "platform"
owner: "unassigned"
source: "systematic-review"
evidence: "opportunity"
created: "2026-08-07"
updated: "2026-08-07"
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

- [ ] Direct logging in transition-critical paths routes through the shared logger.
- [ ] File/preview/presentation failures include a correlation ID and terminal state.
- [ ] Copied diagnostics omit document contents, credentials, and full private paths by default.
- [ ] Recovery actions do not require a full app restart.
