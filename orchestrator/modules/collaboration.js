/**
 * Collaboration
 * Frontend for real-time collaborative editing via WebSocket.
 * Host starts a server, peers connect. Edits and cursors are broadcast.
 *
 * @module collaboration
 */

(function () {
  'use strict';

  let isHost = false;
  let ws = null;
  let peerId = null;
  let peerCursors = {}; // { peerId: { line, column, name, decorationIds } }
  let cursorDecorationIds = [];

  const PEER_COLORS = ['#569cd6', '#4ec9b0', '#ce9178', '#c586c0', '#dcdcaa', '#6a9955'];

  function getPeerColor(id) {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = ((hash << 5) - hash) + id.charCodeAt(i);
    return PEER_COLORS[Math.abs(hash) % PEER_COLORS.length];
  }

  async function startServer(port) {
    if (!window.electronAPI) return;
    try {
      const result = await window.electronAPI.collaboration.startServer({ port: port || 9876 });
      if (result.success) {
        isHost = true;
        if (window.showNotification) window.showNotification('Collaboration server started on port ' + (port || 9876), 'success');
        setupHostListeners();
      } else {
        if (window.showNotification) window.showNotification('Failed to start server: ' + result.error, 'error');
      }
      return result;
    } catch (e) {
      if (window.showNotification) window.showNotification('Server error: ' + e.message, 'error');
    }
  }

  async function stopServer() {
    if (!window.electronAPI) return;
    try {
      const result = await window.electronAPI.collaboration.stopServer();
      isHost = false;
      clearPeerCursors();
      if (result.success && window.showNotification) {
        window.showNotification('Collaboration server stopped', 'info');
      }
    } catch (e) { /* ignore */ }
  }

  function connectToServer(url) {
    if (ws) ws.close();

    try {
      ws = new WebSocket(url || 'ws://localhost:9876');

      ws.onopen = () => {
        if (window.showNotification) window.showNotification('Connected to collaboration server', 'success');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleServerMessage(data);
        } catch (_) { /* ignore */ }
      };

      ws.onclose = () => {
        ws = null;
        clearPeerCursors();
        if (window.showNotification) window.showNotification('Disconnected from collaboration server', 'info');
      };

      ws.onerror = () => {
        if (window.showNotification) window.showNotification('Collaboration connection error', 'error');
      };

      // Send edits
      if (window.editor) {
        window.editor.onDidChangeModelContent((e) => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'edit',
              edit: e.changes.map(c => ({
                range: { startLine: c.range.startLineNumber, startCol: c.range.startColumn, endLine: c.range.endLineNumber, endCol: c.range.endColumn },
                text: c.text
              }))
            }));
          }
        });

        window.editor.onDidChangeCursorPosition((e) => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'cursor',
              cursor: { line: e.position.lineNumber, column: e.position.column }
            }));
          }
        });
      }
    } catch (e) {
      if (window.showNotification) window.showNotification('Failed to connect: ' + e.message, 'error');
    }
  }

  function disconnect() {
    if (ws) { ws.close(); ws = null; }
    clearPeerCursors();
  }

  function handleServerMessage(data) {
    switch (data.type) {
      case 'welcome':
        peerId = data.peerId;
        break;
      case 'edit':
        applyRemoteEdit(data.edit, data.peerId);
        break;
      case 'cursor':
        updatePeerCursor(data.peerId, data.cursor, data.name);
        break;
      case 'peer-joined':
        if (window.showNotification) window.showNotification('Peer joined: ' + data.peerId.slice(0, 8), 'info');
        break;
      case 'peer-left':
        removePeerCursor(data.peerId);
        if (window.showNotification) window.showNotification((data.name || 'Peer') + ' left', 'info');
        break;
      case 'server-shutdown':
        disconnect();
        if (window.showNotification) window.showNotification('Server shut down', 'info');
        break;
    }
  }

  function setupHostListeners() {
    if (!window.electronAPI) return;
    // Listen for IPC events from server
    window.electronAPI.events.collabRemoteEdit((event, data) => {
      applyRemoteEdit(data.edit, data.peerId);
    });
    window.electronAPI.events.collabRemoteCursor((event, data) => {
      updatePeerCursor(data.peerId, data.cursor, data.name);
    });
    window.electronAPI.events.collabPeerJoined((event, data) => {
      if (window.showNotification) window.showNotification('Peer connected: ' + data.peerId.slice(0, 8), 'info');
    });
    window.electronAPI.events.collabPeerLeft((event, data) => {
      removePeerCursor(data.peerId);
    });
  }

  function applyRemoteEdit(edits, fromPeerId) {
    if (!window.editor || !edits) return;
    const model = window.editor.getModel();
    if (!model) return;

    const monacoEdits = edits.map(e => ({
      range: new monaco.Range(e.range.startLine, e.range.startCol, e.range.endLine, e.range.endCol),
      text: e.text
    }));

    model.pushEditOperations([], monacoEdits, () => null);
  }

  function updatePeerCursor(id, cursor, name) {
    if (!window.editor || !cursor) return;
    peerCursors[id] = { line: cursor.line, column: cursor.column, name: name || id.slice(0, 8) };
    renderPeerCursors();
  }

  function removePeerCursor(id) {
    delete peerCursors[id];
    renderPeerCursors();
  }

  function clearPeerCursors() {
    peerCursors = {};
    renderPeerCursors();
  }

  function renderPeerCursors() {
    if (!window.editor) return;

    const decorations = [];
    for (const [id, cursor] of Object.entries(peerCursors)) {
      const color = getPeerColor(id);
      decorations.push({
        range: new monaco.Range(cursor.line, cursor.column, cursor.line, cursor.column + 1),
        options: {
          className: 'peer-cursor',
          beforeContentClassName: 'peer-cursor-line',
          hoverMessage: { value: cursor.name },
          stickiness: 1,
          overviewRuler: { color, position: monaco.editor.OverviewRulerLane.Right }
        }
      });
    }

    cursorDecorationIds = window.editor.deltaDecorations(cursorDecorationIds, decorations);
  }

  // ── Collaboration dialog ──

  function showCollabDialog() {
    const existing = document.getElementById('collab-dialog');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'collab-dialog';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:10000;display:flex;align-items:center;justify-content:center;';

    const dialog = document.createElement('div');
    dialog.style.cssText = 'background:var(--bg-color,#1e1e1e);color:var(--text-color,#d4d4d4);border-radius:8px;padding:16px;width:400px;box-shadow:0 8px 32px rgba(0,0,0,0.5);font-family:system-ui,sans-serif;';

    dialog.innerHTML = `
      <h3 style="margin:0 0 12px;font-size:14px;">Collaboration</h3>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <div style="font-size:12px;color:#888;">Host a session or connect to a peer.</div>
        <div style="display:flex;gap:6px;">
          <button id="collab-host" style="flex:1;background:#569cd6;color:#fff;border:none;border-radius:4px;padding:8px;cursor:pointer;font-size:12px;">Host Session</button>
          <button id="collab-stop" style="flex:1;background:#f48771;color:#fff;border:none;border-radius:4px;padding:8px;cursor:pointer;font-size:12px;">Stop Server</button>
        </div>
        <div style="font-size:12px;color:#888;margin-top:4px;">Or connect to a host:</div>
        <div style="display:flex;gap:6px;">
          <input id="collab-url" type="text" placeholder="ws://localhost:9876" value="ws://localhost:9876" style="flex:1;background:var(--bg-secondary,#252526);border:1px solid #555;color:var(--text-color,#d4d4d4);border-radius:4px;padding:6px 8px;font-size:12px;">
          <button id="collab-connect" style="background:#4ec9b0;color:#fff;border:none;border-radius:4px;padding:6px 12px;cursor:pointer;font-size:12px;">Connect</button>
        </div>
        <button id="collab-disconnect" style="background:transparent;border:1px solid #555;color:#888;border-radius:4px;padding:6px;cursor:pointer;font-size:12px;">Disconnect</button>
      </div>
      <div style="text-align:right;margin-top:12px;">
        <button id="collab-close" style="background:transparent;border:1px solid #555;color:#888;border-radius:4px;padding:6px 12px;cursor:pointer;font-size:12px;">Close</button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    document.getElementById('collab-host').addEventListener('click', () => { startServer(); });
    document.getElementById('collab-stop').addEventListener('click', () => { stopServer(); });
    document.getElementById('collab-connect').addEventListener('click', () => {
      const url = document.getElementById('collab-url').value.trim();
      if (url) connectToServer(url);
    });
    document.getElementById('collab-disconnect').addEventListener('click', () => { disconnect(); });
    document.getElementById('collab-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.addEventListener('keydown', function handler(e) {
      if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', handler); }
    });
  }

  function init() {
    if (typeof window.registerCommand === 'function') {
      window.registerCommand('collaboration.sessions', 'Collaboration: Open Session Manager', showCollabDialog);
      window.registerCommand('collaboration.host', 'Collaboration: Host Session', () => startServer());
      window.registerCommand('collaboration.stop', 'Collaboration: Stop Server', stopServer);
    }
  }

  window.collaboration = {
    startServer,
    stopServer,
    connect: connectToServer,
    disconnect,
    showDialog: showCollabDialog
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 200);
  }
})();
