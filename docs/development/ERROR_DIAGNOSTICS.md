# Renderer incidents and recovery

NightOwl records transition-critical renderer failures as small structured
incidents. The intent is to make a failed view explainable and recoverable
without collecting the document being edited.

## Incident contract

`orchestrator/modules/diagnostics.js` owns the renderer incident ring buffer and
structured logger. Every incident has:

- a stable correlation/request ID;
- a level, domain, diagnostic code, and timestamp;
- an explicit terminal state such as `failed` or `degraded`;
- a redacted error and bounded context object.

File and preview transitions share a correlation ID when the preview is part of
the file-open request. Presentation mounts receive a new correlation ID for each
attempt. Direct error logging in these transition paths routes through the
structured logger so the user-facing state and copied report refer to the same
incident.

## Privacy boundary

The diagnostics boundary redacts values under document-content and credential
keys, credential-shaped values embedded in messages, full user/private paths,
and long or deeply nested values. File readiness reports only the extension,
not the current filename. Error stacks are bounded and path-redacted.

Callers should still pass the smallest useful context. In particular, never pass
Markdown, editor buffers, clipboard text, credentials, request bodies, or AI
messages to `report()` or `logger()`.

## Recovery actions

File, preview, and presentation failures expose the incident ID and four local
actions:

- **Retry** starts a fresh request or remount;
- **Reset View** clears the failed view and returns to a usable editor state;
- **Copy diagnostics** copies a report limited to the correlated incident;
- **View diagnostics** opens the full diagnostics screen.

Reset never discards or rewrites document contents. It only clears transient
view state. Presentation reset also returns to editor mode.

## Diagnostics screen

Open **Help > Diagnostics...** to inspect and copy:

- app version, source/packaged mode, platform, and architecture;
- current view and feature readiness;
- recent renderer incidents;
- renderer lifecycle, file watcher, feed timer, and terminal process counts.

The same report is available programmatically:

```js
await window.NightOwlDiagnostics.getReport()
await window.NightOwlDiagnostics.copyReport()
```

The diagnostics window's two global error listeners intentionally live for the
renderer-window lifetime and are owned by the shared resource registry.
