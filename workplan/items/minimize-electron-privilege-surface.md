---
id: "minimize-electron-privilege-surface"
title: "Minimize Electron preload and remote privilege surface"
status: "triaged"
type: "security"
priority: "P2"
area: "security"
owner: "unassigned"
source: "systematic-review"
evidence: "opportunity"
created: "2026-08-07"
updated: "2026-08-07"
verification: "NightOwl runs with no unused @electron/remote enablement, a smaller typed preload API, sender validation for privileged IPC, and an explicit documented reason for every sandbox exception."
tags: ["electron", "ipc", "preload"]
depends_on: ["sanitize-rendered-markdown-and-navigation"]
---

## Context

The main window correctly enables context isolation and disables Node integration,
and `preload-ipc-guard.js` allowlists channels. However, the allowlist exposes a
very broad generic invoke surface covering roughly 249 main-process handlers,
including filesystem, Git, terminal, collaboration, server, and credential
operations. The renderer sandbox is disabled because preload imports local
modules, and `@electron/remote` is initialized/enabled even though no renderer
consumer was found in this review.

## Proposed change

Remove unused remote support, group preload methods by capability with input
schemas, validate sender/frame origin for privileged handlers, and investigate a
sandbox-compatible preload bundle. Keep the existing path guards and add
contract tests at the bridge boundary.

## Acceptance criteria

- [ ] No unused remote module is initialized or packaged.
- [ ] Privileged IPC rejects malformed payloads and unexpected senders.
- [ ] Renderer code cannot invoke arbitrary allowlisted strings through a generic escape hatch.
- [ ] Sandbox exceptions and residual risk are documented and tested.
