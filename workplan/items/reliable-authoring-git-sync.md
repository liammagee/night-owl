---
id: "reliable-authoring-git-sync"
title: "Make authoring changes easy and reliable to commit and push"
status: "done"
type: "bug"
priority: "P1"
area: "editor"
owner: "codex"
source: "user-report"
evidence: "reproduced"
created: "2026-11-12"
updated: "2026-11-12"
verification: "Local CI, real temporary-repository Git integration tests, renderer behavior tests, and performance budgets pass."
tags: ["git", "authoring", "performance", "accessibility"]
---

## Context

Git operations block the main process, interpolate paths and messages into a
shell, and parse newline-delimited status incorrectly for unusual filenames.
Folder publishing includes unrelated staged work and obscures a successful
local commit when pushing fails. The panel lacks a clear destination and a
single staged-commit-and-push action. Real Electron testing also exposed saved
recovery copies entering Stage All; the backup directory now ignores its own
contents. One-shot terminal commands had the same main-process blocking issue
and now complete asynchronously.

## Acceptance criteria

- [x] Git subprocesses are asynchronous and use literal argument arrays.
- [x] Status preserves unusual filenames and renames; unborn branches and worktrees work.
- [x] Scoped publishing preserves unrelated staged changes; push failures preserve and report the local commit.
- [x] The panel clearly shows repository, branch, destination, working state, and commit/push progress.
- [x] Pulls fast-forward only; overlapping mutations are rejected.
- [x] Local CI, real Git regressions, renderer behavior checks, and performance budgets pass.

## Verification

- `node scripts/local-ci.js`: all seven stages pass; 1,570 tests across 152
  Jest suites and 25 required Electron workflows pass without skips.
- `npm test -- --runInBand --runTestsByPath tests/unit/renderer/autosave.test.js`:
  passes after the final autosave notification addition.
- Real Git coverage uses disposable local repositories and bare remotes. It
  exercises literal paths/messages, worktrees, unborn branches, partial staging,
  scoped publishing, push retry, divergent history, and mutation serialization.
- The required Electron Git workflow saves an actual document, stages only the
  authoring change (excluding recovery copies), commits and pushes to a local
  bare remote. It captures both themes and checks serious/critical accessibility
  violations in the Git panel.
- All ten performance budgets pass, with three samples per scenario on an
  Apple M3 Max. Median startup is 963.9 ms; small Markdown switching 19.5 ms;
  large Markdown switching 841.2 ms. These are current working-tree observations,
  not a measured speedup relative to the base revision.

## Boundaries

This change covers the Git authoring workflow, adjacent save correctness,
main-process blocking, and Source Control appearance. Validation used local
remotes; hosted credentials, website deployment, and a packaged application
installation were not exercised. The complete regression gate is not a claim
that every possible bug in the application has been eliminated.
