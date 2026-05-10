// === Collaboration WebSocket Handlers ===
// Simple WebSocket server for real-time document collaboration

const { ipcMain } = require('electron');
const http = require('http');
const crypto = require('crypto');
const { createDebugLogger } = require('./logging');

const debug = createDebugLogger('CollaborationHandlers');

let wsServer = null;
let httpServer = null;
let clients = new Map(); // ws -> { id, name, cursor }
let sharedDoc = { content: '', version: 0 };

function register(deps) {
  debug('Registering collaboration handlers...');

  ipcMain.handle('collab-start-server', async (event, { port }) => {
    try {
      if (wsServer) return { success: true, port, message: 'Server already running' };

      const serverPort = port || 9876;
      httpServer = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('NightOwl Collaboration Server');
      });

      httpServer.listen(serverPort);

      // Manual WebSocket upgrade (no ws dependency needed)
      httpServer.on('upgrade', (req, socket, head) => {
        const key = req.headers['sec-websocket-key'];
        if (!key) { socket.destroy(); return; }

        const accept = crypto.createHash('sha1')
          .update(key + '258EAFA5-E914-47DA-95CA-5AB5DC11CE56')
          .digest('base64');

        socket.write(
          'HTTP/1.1 101 Switching Protocols\r\n' +
          'Upgrade: websocket\r\n' +
          'Connection: Upgrade\r\n' +
          `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
        );

        const clientId = crypto.randomUUID();
        clients.set(socket, { id: clientId, name: 'User', cursor: null });

        socket.on('data', (buf) => {
          const msg = decodeFrame(buf);
          if (msg === null) return;
          try {
            const data = JSON.parse(msg);
            handleMessage(socket, data, event.sender);
          } catch (_) { /* ignore parse errors */ }
        });

        socket.on('close', () => {
          const info = clients.get(socket);
          clients.delete(socket);
          if (info) broadcast({ type: 'peer-left', peerId: info.id, name: info.name });
          notifyRenderer(event.sender, 'collab-peer-left', { peerId: info?.id });
        });

        socket.on('error', () => clients.delete(socket));

        // Send welcome
        sendFrame(socket, JSON.stringify({ type: 'welcome', peerId: clientId, version: sharedDoc.version }));
        broadcast({ type: 'peer-joined', peerId: clientId }, socket);
        notifyRenderer(event.sender, 'collab-peer-joined', { peerId: clientId });
      });

      wsServer = httpServer;
      return { success: true, port: serverPort };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('collab-stop-server', async () => {
    try {
      if (httpServer) {
        for (const [socket] of clients) {
          sendFrame(socket, JSON.stringify({ type: 'server-shutdown' }));
          socket.destroy();
        }
        clients.clear();
        httpServer.close();
        httpServer = null;
        wsServer = null;
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('collab-get-status', async () => {
    return {
      success: true,
      running: !!wsServer,
      peerCount: clients.size,
      peers: Array.from(clients.values()).map(c => ({ id: c.id, name: c.name }))
    };
  });

  ipcMain.handle('collab-broadcast-edit', async (event, { edit, version }) => {
    sharedDoc.version = version;
    broadcast({ type: 'edit', edit, version });
    return { success: true };
  });

  ipcMain.handle('collab-broadcast-cursor', async (event, { cursor }) => {
    broadcast({ type: 'cursor', cursor, peerId: 'host' });
    return { success: true };
  });

  debug('Registered collaboration handlers');
}

function handleMessage(socket, data, sender) {
  const info = clients.get(socket);
  if (!info) return;

  switch (data.type) {
    case 'set-name':
      info.name = String(data.name).slice(0, 32);
      broadcast({ type: 'peer-renamed', peerId: info.id, name: info.name });
      notifyRenderer(sender, 'collab-peer-renamed', { peerId: info.id, name: info.name });
      break;
    case 'edit':
      sharedDoc.version = data.version || sharedDoc.version + 1;
      broadcast({ type: 'edit', edit: data.edit, peerId: info.id, version: sharedDoc.version }, socket);
      notifyRenderer(sender, 'collab-remote-edit', { edit: data.edit, peerId: info.id });
      break;
    case 'cursor':
      info.cursor = data.cursor;
      broadcast({ type: 'cursor', cursor: data.cursor, peerId: info.id, name: info.name }, socket);
      notifyRenderer(sender, 'collab-remote-cursor', { cursor: data.cursor, peerId: info.id, name: info.name });
      break;
    case 'request-doc':
      notifyRenderer(sender, 'collab-doc-requested', { peerId: info.id });
      break;
  }
}

function broadcast(msg, exclude) {
  const frame = JSON.stringify(msg);
  for (const [socket] of clients) {
    if (socket !== exclude) {
      try { sendFrame(socket, frame); } catch (_) { /* ignore */ }
    }
  }
}

function notifyRenderer(sender, channel, data) {
  try { sender.send(channel, data); } catch (_) { /* window may be closed */ }
}

// Minimal WebSocket frame encoding/decoding (text frames only)
function sendFrame(socket, text) {
  const payload = Buffer.from(text, 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81; // FIN + text opcode
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  socket.write(Buffer.concat([header, payload]));
}

function decodeFrame(buf) {
  if (buf.length < 2) return null;
  const opcode = buf[0] & 0x0f;
  if (opcode === 0x8) return null; // close frame
  if (opcode !== 0x1) return null; // only text

  const masked = !!(buf[1] & 0x80);
  let payloadLen = buf[1] & 0x7f;
  let offset = 2;

  if (payloadLen === 126) {
    if (buf.length < 4) return null;
    payloadLen = buf.readUInt16BE(2);
    offset = 4;
  } else if (payloadLen === 127) {
    if (buf.length < 10) return null;
    payloadLen = Number(buf.readBigUInt64BE(2));
    offset = 10;
  }

  let maskKey;
  if (masked) {
    if (buf.length < offset + 4) return null;
    maskKey = buf.slice(offset, offset + 4);
    offset += 4;
  }

  if (buf.length < offset + payloadLen) return null;
  const payload = buf.slice(offset, offset + payloadLen);

  if (masked) {
    for (let i = 0; i < payload.length; i++) {
      payload[i] ^= maskKey[i % 4];
    }
  }

  return payload.toString('utf8');
}

module.exports = { register };
