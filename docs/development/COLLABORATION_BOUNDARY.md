# Collaboration boundary

## Product decision

NightOwl does not currently offer real-time collaborative editing. The former
prototype has been retired from the renderer, command registry, preload API,
and main-process IPC registry. It broadcast positional Monaco edits over an
unauthenticated WebSocket without a convergent document model, stable document
identity, permission checks, reconnect resynchronization, or conflict recovery.
Keeping that surface discoverable could silently diverge or overwrite a newer
local document.

The supported workflow remains local editing plus explicit Git-based review and
publishing. `services/collaborationBoundary.js` is the only retained extension
contract. It rejects session and edit attempts without opening a listener,
changing a document, or presenting collaboration as available.

## Requirements for reintroduction

A future implementation must satisfy all of these requirements before any
renderer action, preload capability, or network listener is restored:

1. Use a proven convergent document model such as a CRDT or equivalently tested
   operational-transform protocol; raw positional edits are insufficient.
2. Bind every connection to explicit session, document, client, and protocol
   identities, including a document digest or equivalent version vector.
3. Authenticate participants and enforce named read/write permissions rather
   than trusting any process that can reach a port.
4. Define initial sync, reconnect, snapshot, incremental resync, and incompatible
   protocol behavior. A mismatch must stop or branch; it must not overwrite.
5. Preserve newer local content on every failure path and expose recoverable
   conflict state to the user.
6. Own and deterministically dispose sockets, editor listeners, cursors, timers,
   sessions, and main-process handlers.
7. Pass a hermetic two-client suite covering simultaneous divergent edits,
   reconnect, document mismatch, permission denial, process interruption, and
   clean shutdown before required Electron coverage enables discovery.

## Current verification contract

The retired boundary is deliberately executable so tests can prove the absence
of mutation. Two independent clients retain their original local documents when
they attempt simultaneous edits; reconnect is rejected without resync;
document mismatches are explicit; and shutdown is idempotent. Code-quality and
required Electron tests also prove that no collaboration script, command,
preload capability, or IPC handler remains discoverable.
