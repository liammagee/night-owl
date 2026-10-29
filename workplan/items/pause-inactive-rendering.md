---
id: "pause-inactive-rendering"
title: "Pause decorative rendering while NightOwl is inactive"
status: "review"
type: "bug"
priority: "P2"
area: "editor"
owner: "codex"
source: "user-report"
evidence: "reproduced"
created: "2026-10-29"
updated: "2026-10-29"
verification: "Electron checks show CSS animations and graph ticks pause on blur/hide, resume on focus, background saves continue, and visible presentations remain live."
tags: ["performance", "electron", "regression"]
---

## Context

During a CPU investigation of the installed app, renderer plus GPU CPU usage
fell from about 50–60% of one core to about 3% when NightOwl was explicitly
hidden. Losing focus alone does not suspend decorative visual work. The exact
expensive element in the user's workspace has not been isolated.

## Proposed change

Use focus and page visibility to pause decorative CSS animations, transitions,
D3 graph simulations, and file-tree polling. Resume on return. Do not suspend
application timers, autosaves, terminal sessions, or data jobs. Keep visible delivery
presentations live for second-screen and screen-sharing use.

## Acceptance criteria

- [x] Decorative animations, pseudo-elements, and new UI pause while inactive.
- [x] Focus restores animation progress and graph layouts without reheating settled graphs.
- [x] File-tree polling stops while inactive and checks again on return.
- [x] Background saves continue while inactive.
- [x] Visible delivery presentations remain live without focus; inactive authoring and hidden presentations pause.
- [x] Isolated Electron verification executes with no skipped checks.

## Implementation and verification

- Native BrowserWindow focus, hide, minimize, restore, and renderer reload events
  drive the renderer activity policy through a fixed, read-only preload event.
- Pauses CSS animations (including pseudo-elements and inserted UI), transitions,
  all three shipped D3 graph implementations, and file-tree signature polling.
  Graph creation/replacement and plugin rerenders respect inactive state.
- Delayed presentation focus requests respect hidden/minimized windows instead
  of reopening them.
- Resumes layouts without reheating settled graphs. Application timers and frame
  callbacks are not intercepted; autosaves and background work continue.
- Visible delivery presentation mode remains live for a second display or screen sharing;
  hiding the presentation pauses visual work.
- 44 focused unit tests passed in seven suites.
- Four packaged Electron workflows passed, zero skipped: actual CSS animation
  time stops on native blur; all three graph tick streams stop and resume across
  repeated focus changes; background autosave writes while polling is stopped;
  visible and hidden presentations follow the intended policy.
- Earlier source-wide Jest run: 1,597 passed / 13 failed. The unchanged f98acd3 baseline has
  1,588 passed / 13 failed, in the same seven pre-existing failing suites (the
  renderer security/Markdown checks, presentation parsing/build, and a stale
  presentation code-quality assertion).
- Unchanged-baseline Electron checks also reproduce the presentation-fitting,
  static-publication, and preview-readiness failures seen in broader runs.
- Repaired package built from the installed app, rather than rebuilding other
  features from the older source baseline. Native unpack layout, ASAR integrity,
  and app signature are verified. Content hashes show that only the ten repair
  files differ; every other packaged file is preserved.

## Activation

The repaired app is staged at
`/Users/lmagee/Dev/nightowl-artifacts/inactive-rendering-20261029-v4/NightOwl.app`.
The original app is backed up at
`/Users/lmagee/Dev/nightowl-backups/before-inactive-rendering-20261029/NightOwl.app`.
Receipts and the minimal source patch are beside the staged app. Installation
and a live-workspace CPU measurement remain pending: the user previously asked
that NightOwl stay open, so activation requires a graceful restart.
