# Feature Roadmap

NightOwl is a local-first writing, teaching, and research editor. The current
product direction is to keep the core app dependable, then add small academic
workflows as native features. External plugin-marketplace infrastructure is not
part of the near-term plan.

## Recently Landed

- Terminal-first assistant pane for launching `codex`, `claude`, `gemini`, or a
  shell in the current workspace.
- Managed theme adapter covering the main app chrome, terminal surfaces, file
  tree, status bar, and legacy active states.
- Configurable file-tree artifact decluttering.
- Lightweight file-tree structure polling for disk add/remove/rename changes.
- Sandboxed JavaScript support for HTML previews.
- Document statistics pane with word, time, structure, vocabulary, and
  readability metrics.

## Near-Term Reliability

1. Packaged-app smoke coverage
   - Launch the packaged app.
   - Open a workspace.
   - Verify JS preview, file-tree refresh, theme coverage, and terminal input.

2. Terminal polish
   - Keep PTY resize/focus behavior stable.
   - Restart a shell cleanly after process exit.
   - Keep theme changes synchronized with xterm.

3. Theme consistency
   - Keep moving hardcoded inline panel colors into tokenized classes.
   - Extend `tests/e2e/theme-consistency.spec.js` whenever a new pane class is
     introduced.

4. Planning hygiene
   - Keep this roadmap tied to shipped or actively scoped work.
   - Remove migration docs when their assertions are represented in tests.

## Product Queue

### Writing And Review

- Smart citations with PDF quote extraction and annotation.
- Export templates for common paper, lecture, and handout formats.
- Argument outline tools that operate on the active document.
- Quick notes panel for scratch material that should not interrupt the current
  file.

### Navigation And Project Shape

- Tab groups for named file sets.
- Better saved sessions across workspaces.
- Reading list manager with progress and links back into notes.
- Backlinks and block references for reusable argument fragments.

### Teaching And Presentation

- Lecture templates.
- Timeline visualization for historical or conceptual sequences.
- Interactive presentation affordances that can be exported cleanly.
- Lecture recording/transcript support only after the editor core is stable.

### Research And Analysis

- Concept extraction into a project-local glossary.
- Dialectical mapping over selected files or headings.
- Research feed tracking as a native optional feature.
- Project analytics that summarize writing volume, citations, and reading
  difficulty without background AI calls.

## Defer For Now

- Generic plugin marketplace.
- Bespoke AI chat persona work.
- Broad collaboration features before local versioning/recovery is stronger.
- Large AI assistants that duplicate CLI tools already available in the
  terminal pane.
