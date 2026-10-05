# Actions, commands, and shortcuts

NightOwl exposes renderer actions through `window.NightOwlActions`. An action is
the stable identity shared by the command palette, shortcut dispatcher,
keyboard-shortcut help, and native application menu metadata. Features must not
maintain a second command array or install a global shortcut listener for an
action the registry can own.

## Registering an action

Bundled renderer modules use the compatibility-light helper:

```js
window.registerCommand(
  'view.example',
  'View: Toggle Example',
  () => toggleExample(),
  null,
  { owner: 'example-feature', keywords: ['sample'] }
);
```

Action IDs are stable and namespaced. Labels are user-facing and may change.
The optional definition fields include `category`, `keywords`, `shortcut`,
`shortcutScope`, `allowInInput`, `enabled`, `when`, and `handleShortcut`.
Callers execute an action by ID with `NightOwlActions.execute(id, context)`.

## Shortcut ownership

Portable core shortcuts live in
`orchestrator/modules/action-registry.js`. Use `Mod` for the platform primary
modifier; the module projects it to `Cmd`/`Meta`, `Ctrl`/`Control`, or
`CmdOrCtrl` as appropriate. Native menu accelerators use
`getElectronAccelerator(actionId)`, and renderer help uses the registered action
metadata.

Quick Open (`Mod+P`) searches files. Command Palette (`Mod+Shift+P`) searches
actions. They are intentionally separate actions and surfaces.

Context-only keystrokes such as arrow navigation should remain with the owning
widget unless an action has a precise `when` predicate. Do not register bare
`Enter`, `Home`, or arrow keys as global shortcuts.

## Verification

- `tests/unit/renderer/action-registry.test.js` covers normalization,
  discovery, execution, dispatch, and conflict detection.
- `tests/unit/main/code-quality.test.js` rejects legacy command arrays and
  hard-coded native `CmdOrCtrl` accelerators.
- The required `@actions` Electron workflow discovers and executes a bundled
  feature action and verifies Command Palette, Quick Open, and generated help.

Every new global shortcut must keep `getShortcutConflicts()` empty on macOS and
Windows. If a feature needs a contextual binding, model its availability before
assigning the key.
