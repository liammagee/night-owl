# Electron privilege and IPC model

NightOwl treats renderer content as untrusted even though the primary renderer is
loaded from the packaged application. The main window uses context isolation,
disables Node integration and the Electron remote module, and exposes only fixed
capability methods from `preload.js`.

## Preload boundary

`preload-ipc-guard.js` is the shared contract for the renderer and main process.
It groups operations by capability (`files`, `git`, `terminal`, `settings`, and
others), gives each channel one fixed method, strips Electron event objects from
subscriptions, and validates serializable and high-risk payloads before sending.
There is deliberately no renderer-visible `invoke(channel)`, `on(channel)`, or
`send(channel)` method.

`services/ipcSecurity.js` installs the same contract on `ipcMain`. Every invoke
must come from the primary frame of a known NightOwl window and match the app's
local entry URL. A child frame, detached/foreign WebContents, unknown channel, or
malformed payload is rejected before the registered handler runs. One-way
renderer signals receive the same sender and serializability checks.

## Sandbox exception

The primary renderer currently sets `sandbox: false`. Its preload requires the
local shared contract module, which Electron's sandboxed preload loader cannot
load without a bundle step. Context isolation remains enabled and Node
integration remains disabled. The residual risk is that a preload compromise has
the unsandboxed preload process's Node authority; fixed capabilities, main-frame
sender validation, navigation guards, path guards, and payload validation limit
what compromised renderer content can request through IPC.

Moving to `sandbox: true` requires producing and verifying a single-file preload
bundle for both source and packaged launches. Until that build artifact is owned
by the distribution pipeline, the explicit exception is preferable to a hidden
or environment-dependent preload failure.

## Verification

- Unit contract tests prove arbitrary channel strings are not exposed and
  malformed terminal, Git, file, collaboration, and credential payloads fail.
- Main-process tests prove foreign WebContents and app subframes cannot invoke
  privileged handlers.
- Required Electron tests inspect the real context-bridged API and exercise a
  valid file call plus locally rejected malformed privileged calls.
- Packaged tests confirm the same restricted surface is present in the asar app.
