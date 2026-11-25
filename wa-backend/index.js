if (!globalThis.crypto) {
  try {
    globalThis.crypto = require('crypto').webcrypto;
  } catch (_) {}
}

require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const { PORT, ensureAuthRootDir } = require('./src/config/constants');
const { sessions, globalMediaDownloadQueue, cleanupOrphanedAuthDirs } = require('./src/state/sessionStore');
const { startLifecycleTimers } = require('./src/services/sessionLifecycleService');
const { registerSocketHandlers } = require('./src/handlers/socketHandler');

ensureAuthRootDir();
cleanupOrphanedAuthDirs();

const app = express();
const server = http.createServer(app);

app.use(
  cors({
    origin: (origin, callback) => {
      callback(null, true);
    },
    credentials: true
  })
);
app.use(express.json());

// Endpoint status ringan untuk Render Free Tier & monitoring RAM
app.get('/ping', (req, res) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Access-Control-Allow-Origin': '*'
  });

  const rssMB = Math.round(process.memoryUsage().rss / 1024 / 1024);
  let totalStatusPointers = 0;
  for (const s of sessions.values()) {
    if (s.statusPointers) totalStatusPointers += s.statusPointers.size;
  }

  res.json({
    status: 'alive',
    rssMB,
    activeSessions: sessions.size,
    totalStatusPointers,
    activeDownloads: globalMediaDownloadQueue.activeCount,
    diskMode: 'zero-media-disk'
  });
});

app.get('/', (req, res) => {
  res.json({
    service: 'AllToolsKuro WhatsApp 4-in-1 Stealth Vault Backend',
    status: 'online',
    version: '2.2.0',
    zeroDiskMedia: true
  });
});

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      callback(null, true);
    },
    methods: ['GET', 'POST']
  },
  maxHttpBufferSize: 5e7,
  pingTimeout: 60000,
  pingInterval: 25000
});

registerSocketHandlers(io);
startLifecycleTimers(io);

server.listen(PORT, () => {
  console.log(`[AllToolsKuro] WA 4-in-1 Backend v2.3.0 aktif di port ${PORT} (Isolasi Perangkat & Zero-Disk Media Aktif)`);
});
