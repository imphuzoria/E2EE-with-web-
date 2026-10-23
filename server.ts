import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Support large payload for encrypted files and binary buffers
app.use(express.json({ limit: '100mb' }));

// Memory storage for encrypted rooms
// Notice: The server has ZERO KNOWLEDGE of message contents, file contents, or keys.
// The server only acts as a blind encrypted relay and temporary buffer.
interface EncryptedMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  senderPublicKey?: string;
  iv: string; // Base64 AES-GCM IV (96-bit)
  ciphertext: string; // Base64 ciphertext + auth tag
  salt?: string; // Base64 PBKDF2 salt
  timestamp: number;
  type: 'text' | 'file' | 'system' | 'key-exchange';
  fileMeta?: {
    fileId: string;
    encryptedFilename: string; // Filename encrypted on client
    size: number;
    mimeType: string;
  };
  expiresAt?: number | null;
}

interface PeerInfo {
  id: string;
  name: string;
  publicKey?: string;
  lastSeen: number;
}

interface RoomData {
  id: string;
  createdAt: number;
  messages: EncryptedMessage[];
  peers: Map<string, PeerInfo>;
  clients: Set<Response>;
}

const rooms = new Map<string, RoomData>();

// In-memory encrypted file blobs store: fileId -> Buffer
const encryptedFiles = new Map<string, { buffer: Buffer; mimeType: string; expiresAt?: number | null }>();

function getOrCreateRoom(roomId: string): RoomData {
  let room = rooms.get(roomId);
  if (!room) {
    room = {
      id: roomId,
      createdAt: Date.now(),
      messages: [],
      peers: new Map(),
      clients: new Set(),
    };
    rooms.set(roomId, room);
  }
  return room;
}

function broadcastToRoom(roomId: string, eventType: string, data: any, excludeClient?: Response) {
  const room = rooms.get(roomId);
  if (!room) return;

  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of room.clients) {
    if (client !== excludeClient && !client.writableEnded) {
      try {
        client.write(payload);
      } catch (err) {
        // Ignored, client will be cleaned up
      }
    }
  }
}

// Clean up expired ephemeral messages every 10 seconds
setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of rooms.entries()) {
    const initialLen = room.messages.length;
    room.messages = room.messages.filter((msg) => !msg.expiresAt || msg.expiresAt > now);
    if (room.messages.length !== initialLen) {
      broadcastToRoom(roomId, 'messages-pruned', { now });
    }

    // Clean up inactive peers (older than 2 minutes)
    for (const [peerId, peer] of room.peers.entries()) {
      if (now - peer.lastSeen > 120000) {
        room.peers.delete(peerId);
        broadcastToRoom(roomId, 'peer-left', { peerId });
      }
    }
  }

  // Clean up expired files
  for (const [fileId, file] of encryptedFiles.entries()) {
    if (file.expiresAt && file.expiresAt <= now) {
      encryptedFiles.delete(fileId);
    }
  }
}, 10000);

// --- API ROUTES ---

// Health & Info
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    serverType: 'CipherHaven Zero-Knowledge E2EE Relay',
    activeRooms: rooms.size,
    timestamp: Date.now(),
  });
});

// Download native Windows .exe
app.get('/api/download-exe', (req: Request, res: Response) => {
  const exePath = path.resolve(__dirname, 'public', '####.exe');
  res.setHeader('Content-Type', 'application/x-msdownload');
  res.setHeader('Content-Disposition', 'attachment; filename="####.exe"');
  res.sendFile(exePath);
});

// Download launcher script
app.get('/api/download-bat', (req: Request, res: Response) => {
  const batContent = `@echo off
title #### Desktop
echo Запуск локального мессенджера ####...
start "" "http://localhost:3000"
exit`;
  res.setHeader('Content-Type', 'application/x-bat');
  res.setHeader('Content-Disposition', 'attachment; filename="####-launcher.bat"');
  res.send(batContent);
});

// SSE Stream for Room events
app.get('/api/rooms/:roomId/events', (req: Request, res: Response) => {
  const { roomId } = req.params;
  const peerId = (req.query.peerId as string) || `peer_${Date.now()}`;
  const peerName = (req.query.peerName as string) || 'Anonymous Secure Node';
  const publicKey = (req.query.publicKey as string) || '';

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const room = getOrCreateRoom(roomId);
  room.clients.add(res);

  // Update peer status
  room.peers.set(peerId, {
    id: peerId,
    name: peerName,
    publicKey,
    lastSeen: Date.now(),
  });

  // Send initial room snapshot
  const initialData = {
    roomId,
    messages: room.messages,
    peers: Array.from(room.peers.values()),
  };
  res.write(`event: init\ndata: ${JSON.stringify(initialData)}\n\n`);

  // Broadcast peer joined
  broadcastToRoom(roomId, 'peer-joined', {
    peer: { id: peerId, name: peerName, publicKey, lastSeen: Date.now() },
  }, res);

  // Keep alive ping every 15 seconds
  const pingInterval = setInterval(() => {
    if (!res.writableEnded) {
      res.write(': keepalive\n\n');
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(pingInterval);
    room.clients.delete(res);
    room.peers.delete(peerId);
    broadcastToRoom(roomId, 'peer-left', { peerId });
  });
});

// Post an encrypted message (Server does not have keys to decrypt)
app.post('/api/rooms/:roomId/messages', (req: Request, res: Response) => {
  const { roomId } = req.params;
  const { id, senderId, senderName, senderPublicKey, iv, ciphertext, salt, type, fileMeta, expiresAt } = req.body;

  if (!ciphertext || !iv) {
    return res.status(400).json({ error: 'Missing ciphertext or iv in encrypted envelope' });
  }

  const room = getOrCreateRoom(roomId);

  const message: EncryptedMessage = {
    id: id || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    roomId,
    senderId,
    senderName,
    senderPublicKey,
    iv,
    ciphertext,
    salt,
    timestamp: Date.now(),
    type: type || 'text',
    fileMeta,
    expiresAt: expiresAt ? Date.now() + expiresAt * 1000 : null,
  };

  room.messages.push(message);

  // Cap message buffer per room to 300 to manage memory in demo
  if (room.messages.length > 300) {
    room.messages.shift();
  }

  // Broadcast to all peers in the room
  broadcastToRoom(roomId, 'message', message);

  res.json({ success: true, messageId: message.id, timestamp: message.timestamp });
});

// Upload Encrypted File (stored purely as encrypted bytes)
app.post('/api/rooms/:roomId/files', express.raw({ type: '*/*', limit: '100mb' }), (req: Request, res: Response) => {
  const { roomId } = req.params;
  const fileId = req.headers['x-file-id'] as string || `file_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const expiresAfterSec = parseInt(req.headers['x-expires-sec'] as string || '0', 10);

  if (!req.body || (Buffer.isBuffer(req.body) && req.body.length === 0)) {
    return res.status(400).json({ error: 'Empty file payload' });
  }

  const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body);
  const expiresAt = expiresAfterSec > 0 ? Date.now() + expiresAfterSec * 1000 : null;

  encryptedFiles.set(fileId, {
    buffer,
    mimeType: 'application/octet-stream', // Pure ciphertext binary
    expiresAt,
  });

  res.json({
    success: true,
    fileId,
    size: buffer.length,
    roomId,
  });
});

// Download Encrypted File by fileId
app.get('/api/rooms/:roomId/files/:fileId', (req: Request, res: Response) => {
  const { fileId } = req.params;
  const file = encryptedFiles.get(fileId);

  if (!file) {
    return res.status(404).json({ error: 'Encrypted file not found or has expired' });
  }

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Length', file.buffer.length);
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.send(file.buffer);
});

// Signal typing or presence
app.post('/api/rooms/:roomId/typing', (req: Request, res: Response) => {
  const { roomId } = req.params;
  const { peerId, peerName, isTyping } = req.body;
  broadcastToRoom(roomId, 'typing', { peerId, peerName, isTyping });
  res.json({ success: true });
});

// Clear room messages (remote wipe for the room)
app.delete('/api/rooms/:roomId/messages', (req: Request, res: Response) => {
  const { roomId } = req.params;
  const room = rooms.get(roomId);
  if (room) {
    room.messages = [];
    broadcastToRoom(roomId, 'room-wiped', { roomId, timestamp: Date.now() });
  }
  res.json({ success: true });
});

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (isProd) {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[CipherHaven] E2EE Zero-Knowledge Relay running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[CipherHaven] Startup Error:', err);
  process.exit(1);
});
