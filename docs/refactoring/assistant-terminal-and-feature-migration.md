# Assistant Terminal and Feature Migration Plan

## Goals

NightOwl should stop maintaining a bespoke in-app AI chat assistant. The primary AI workflow is now terminal-first: open the workspace, launch `codex`, `claude`, or `gemini`, and let those tools own their own conversational state.

NightOwl should also move away from the portable Techne plugin architecture as the default extension point. Website overlap is not enough reason to keep a generic plugin loader in the editor. Shared code can still be copied or ported deliberately, but app features should be app-native modules.

## Migration 1: AI Chat to Assistant Terminal

1. Replace the right-pane `AI Chat` tab with an `Assistant Terminal` tab.
2. Keep one obvious launcher row for `codex`, `claude`, `gemini`, plus a plain shell.
3. Use the workspace root as the default working directory.
4. Preserve a text command input for arbitrary CLI commands.
5. Keep the existing lower integrated terminal as a general terminal, but share IPC behavior with the assistant terminal.
6. Stop exposing image attachment, prompt templating, Dr. Chen persona state, chat history export, and direct tutor-core chat controls in the primary right pane.
7. Leave lower-level AI IPC in place temporarily because proofreading, flow feedback, and writing-coach modules still call it.

## Migration 2: Techne Plugins to App Features

1. Remove `@machinespirits/techne-plugins` as an external source-of-truth dependency.
2. Remove the `sync-techne-plugins` postinstall/manual sync workflow.
3. Treat the existing `plugins/techne-*` files as bundled legacy feature code until each feature is ported.
4. Rename user-facing settings from "Plugins" to "Features" and stop describing them as portable website plugins.
5. Introduce a lightweight app-native feature registry as the replacement boundary.
6. Port features one at a time:
   - Theme manager: move to `orchestrator/modules/theme-*` and app CSS.
   - Presentations: move plugin registration into app startup, keep React runtime local.
   - Markdown renderer: fold renderer hooks into preview module.
   - Network/Circle/Maze: move mode registration into app mode modules.
   - Research feed: keep tracked, but make it an app module instead of a plugin.
   - Backdrop: either delete or make it a plain theme option.
7. Delete the generic plugin loader once no feature depends on `window.TechnePlugins`.

## Verification

Focused checks for each slice:

- Terminal IPC unit tests for workspace fallback and assistant command launch.
- Static guard that the right pane no longer exposes the old assistant chat controls.
- Static guard that external Techne plugin sync wiring is removed.
- Smoke launch to confirm the Assistant Terminal tab renders and can spawn a shell.
- Theme visual audit for managed themes, especially Solarized Light, across sidebar, toolbar, editor, preview, right-pane tabs, status bar, flow indicator, and plugin surfaces.

## Current Slice

This pass performs steps 1-6 of the AI terminal migration and steps 1-3 of the plugin migration. Remaining feature ports are intentionally left as explicit follow-up work so the active presentation, theme, renderer, and graph surfaces do not regress in one large rewrite.

## Theme Consistency Slice

The first Solarized Light hardening pass loads the theme adapter as base app CSS, applies Solarized fallback tokens when the theme manager is not yet available, and overrides the high-specificity active tab/button and flow indicator styles that were leaking green/orange chrome into managed themes.

## Remaining Follow-up

- Upgrade the assistant terminal backend to a real PTY (`node-pty` or equivalent) if Codex, Claude, or Gemini need full terminal control instead of stdin/stdout pipes.
- Add an Electron smoke test for launching a workspace shell from the Assistant Terminal pane.
- Finish the broader theme consistency sweep. The first pass covers the screenshot's active button and flow-chip leaks, but the remaining pass should still verify Solarized Light and at least one dark theme visually across settings, preview controls, plugin panels, proofreader, research feed, and presentation surfaces.
- Port bundled `plugins/techne-*` features into app-native modules one at a time, then remove `window.TechnePlugins`.
- Decide whether the retained lower-level AI IPC remains for writing tools or gets renamed and narrowed further.
