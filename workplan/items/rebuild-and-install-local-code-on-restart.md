---
id: "rebuild-and-install-local-code-on-restart"
title: "Rebuild and install local code on Restart"
status: "done"
type: "enhancement"
priority: "P2"
area: "packaging"
owner: "codex"
source: "manual"
evidence: "opportunity"
created: "2026-11-17"
updated: "2026-11-17"
verification: "Installer tests, static checks, and a packaged Restart that builds, installs, and reopens with an isolated profile."
---

## Context

Restart previously relaunched the installed bundle without incorporating local source changes. Build from a remembered local source, verify the new bundle before shutdown, and install through a detached helper after normal save/cancel handling.

## Acceptance criteria

- [x] Reject overlapping builds and retain the current app when building fails.
- [x] Wait for shutdown and restore the previous bundle on installation or launch-command failure.
- [x] Verify packaged rebuilding and relaunching with an isolated profile.

## Verification

Eight focused tests pass, including save/cancel and failed-handoff retry. The full Jest run passed 1,588 tests before the final three close-flow tests were added. A packaged isolated run verified failed-build recovery, rebuilding changed source, signed bundle replacement, and reopening the same profile. Evidence is in `test-results/local-rebuild-verification/`.

The release gate passed seven of eight stages. The required presentation-tools UI test failed; the same test also failed on the unchanged baseline (at its overflow assertion). This is not a clean full-release certification.
