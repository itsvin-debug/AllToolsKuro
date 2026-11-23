require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const pino = require('pino');
const QRCode = require('qrcode');

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage
} = require('@whiskeysockets/baileys');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 4000;
const FRONTEND_URL = process.env.FRONTEND_URL || '*';
const MAX_SESSIONS = 6;
const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 menit idle disconnect cleanup

const pinoLogger = pino({ level: 'silent' });

app.use(cors({ origin: FRONTEND_URL === '*' ? '*' : [FRONTEND_URL, 'http://localhost:5173'] }));
app.use(express.json());

// Anti-Sleep Ping Endpoint untuk Render Free Tier
app.get('/ping', (req, res) => {
  res.json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    activeSessions: sessions.size,
    maxSessions: MAX_SESSIONS
  });
});

app.get('/', (req, res) => {
  res.json({
    service: 'AllToolsKuro WhatsApp View Once Vault Backend',
    status: 'online',
    version: '1.0.0'
  });
});

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  maxHttpBufferSize: 25 * 1024 * 1024 // 25MB untuk buffer transfer aman
});

// Map penyimpan sesi aktif: sessionId -> SessionData
const sessions = new Map();

// Helper normalisasi nomor telepon ke format digit standar WhatsApp (628xxx)
function normalizeToDigits(raw) {
  if (!raw) return '';
  let digits = String(raw).replace(/\D/g, '');
  if (digits.startsWith('08')) {
    digits = '628' + digits.slice(2);
  } else if (digits.startsWith('8')) {
    digits = '628' + digits.slice(1);
  }
  return digits;
}

// Helper pembersih direktori auth sesi
function removeSessionDir(sessionId) {
  const sessionDir = path.join(__dirname, 'sessions', sessionId);
  try {
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
  } catch (err) {
    console.error(`[Session ${sessionId}] Gagal menghapus folder sesi:`, err.message);
  }
}

// Inisialisasi koneksi Baileys per sesi dengan isolasi memori penuh
async function initBaileysSession(sessionId, sessionToken, socket) {
  const sessionDir = path.join(__dirname, 'sessions', sessionId);
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

  const sock = makeWASocket({
    auth: state,
    logger: pinoLogger,
    printQRInTerminal: false,
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
    markOnlineOnConnect: false
  });

  const sessionData = {
    sessionId,
    token: sessionToken,
    sock,
    targetNumbers: new Set(),
    connectedSockets: new Set([socket.id]),
    disconnectTimer: null,
    qrCode: null,
    status: 'connecting',
    lastActive: Date.now()
  };

  sessions.set(sessionId, sessionData);

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      sessionData.qrCode = qr;
      sessionData.status = 'qr_ready';
      try {
        const qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, scale: 7 });
        io.to(sessionId).emit('qr', { qr, qrDataUrl });
      } catch (err) {
        io.to(sessionId).emit('qr', { qr });
      }
    }

    if (connection === 'open') {
      sessionData.status = 'connected';
      sessionData.qrCode = null;
      sessionData.lastActive = Date.now();
      io.to(sessionId).emit('status', { status: 'connected' });
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      if (!shouldReconnect) {
        // Pengguna logout dari WhatsApp HP atau sesi hangus
        sessionData.status = 'disconnected';
        io.to(sessionId).emit('status', { status: 'disconnected', reason: 'logged_out' });
        try {
          sock.end();
        } catch (_) {}
        removeSessionDir(sessionId);
        sessions.delete(sessionId);
      } else {
        // Reconnect jika koneksi sekadar drop sementara
        sessionData.status = 'reconnecting';
        io.to(sessionId).emit('status', { status: 'reconnecting' });
      }
    }
  });

  // Interseptor Pesan: Tangkap View Once dari Nomor Target Secara Eksak
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (!msg.message) continue;
      if (msg.key?.fromMe) continue;
      if (msg.key?.remoteJid === 'status@broadcast') continue;

      // Dapatkan nomor murni pengirim pesan
      let rawSender = msg.key?.remoteJid || '';
      if (msg.key?.participant) {
        rawSender = msg.key.participant;
      }
      const senderDigits = normalizeToDigits(rawSender);
      if (!senderDigits) continue;

      const currentSession = sessions.get(sessionId);
      if (!currentSession || !currentSession.targetNumbers || currentSession.targetNumbers.size === 0) {
        continue;
      }

      // Validasi ketat target nomor: nomor pengirim wajib ada dalam daftar target pengguna
      if (!currentSession.targetNumbers.has(senderDigits)) {
        continue;
      }

      // Deteksi pembungkus View Once WhatsApp (V1, V2, V2Extension)
      const viewOnceWrapper =
        msg.message?.viewOnceMessage?.message ||
        msg.message?.viewOnceMessageV2?.message ||
        msg.message?.viewOnceMessageV2Extension?.message;

      if (!viewOnceWrapper) continue;

      const imageMsg = viewOnceWrapper.imageMessage;
      const videoMsg = viewOnceWrapper.videoMessage;
      if (!imageMsg && !videoMsg) continue;

      try {
        const mediaType = imageMsg ? 'image' : 'video';
        const targetMedia = imageMsg || videoMsg;
        const mimeType = targetMedia.mimetype || (mediaType === 'image' ? 'image/jpeg' : 'video/mp4');
        const caption = targetMedia.caption || '';
        const senderName = msg.pushName || senderDigits;

        // Zero-Disk: unduh buffer langsung ke RAM tanpa menulis ke disk server
        let buffer = await downloadMediaMessage(
          msg,
          'buffer',
          {},
          {
            logger: pinoLogger,
            reuploadRequest: sock.updateMediaMessage
          }
        );

        if (buffer && buffer.length > 0) {
          const base64Data = `data:${mimeType};base64,${buffer.toString('base64')}`;

          // Kirim eksklusif hanya ke room sessionId pemiliknya
          io.to(sessionId).emit('view-once-media', {
            id: msg.key?.id || `vo_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            senderNumber: senderDigits,
            senderName,
            mediaType,
            mimeType,
            caption,
            timestamp: msg.messageTimestamp ? Number(msg.messageTimestamp) * 1000 : Date.now(),
            base64Data
          });

          // Bebaskan memori buffer secepatnya untuk Garbage Collector
          buffer = null;
        }
      } catch (mediaErr) {
        console.error(`[Session ${sessionId}] Gagal download media View Once:`, mediaErr.message);
      }
    }
  });

  return sessionData;
}

// Penanganan Event Socket.IO Multi-User
io.on('connection', (socket) => {
  socket.on('start-session', async (payload) => {
    try {
      const { sessionId, sessionToken } = payload || {};
      if (!sessionId || !sessionToken || typeof sessionId !== 'string' || typeof sessionToken !== 'string') {
        return socket.emit('session-error', { message: 'Parameter sesi tidak valid.' });
      }

      socket.join(sessionId);

      let sessionData = sessions.get(sessionId);

      // Verifikasi token jika sesi sudah tercatat sebelumnya
      if (sessionData) {
        if (sessionData.token !== sessionToken) {
          return socket.emit('session-error', { message: 'Token otentikasi sesi tidak cocok.' });
        }

        // Batalkan timer idle disconnect jika user tersambung kembali
        if (sessionData.disconnectTimer) {
          clearTimeout(sessionData.disconnectTimer);
          sessionData.disconnectTimer = null;
        }

        sessionData.connectedSockets.add(socket.id);
        sessionData.lastActive = Date.now();

        // Informasikan status terakhir ke klien
        socket.emit('status', {
          status: sessionData.status,
          targets: Array.from(sessionData.targetNumbers)
        });

        if (sessionData.qrCode && sessionData.status === 'qr_ready') {
          try {
            const qrDataUrl = await QRCode.toDataURL(sessionData.qrCode, { margin: 1, scale: 7 });
            socket.emit('qr', { qr: sessionData.qrCode, qrDataUrl });
          } catch (_) {
            socket.emit('qr', { qr: sessionData.qrCode });
          }
        }
        return;
      }

      // Periksa kuota maksimal sesi aktif di Render Free Tier
      if (sessions.size >= MAX_SESSIONS) {
        return socket.emit('session-error', {
          message: 'Server sedang padat (batas 6 sesi aktif tercapai). Silakan coba lagi beberapa saat lagi.'
        });
      }

      // Buat sesi baru
      sessionData = await initBaileysSession(sessionId, sessionToken, socket);
      socket.emit('status', { status: sessionData.status });
    } catch (err) {
      console.error('Error start-session:', err);
      socket.emit('session-error', { message: 'Gagal menginisialisasi sesi WhatsApp: ' + err.message });
    }
  });

  // Sinkronisasi nomor target kontak
  socket.on('set-targets', (payload) => {
    try {
      const { sessionId, sessionToken, targets } = payload || {};
      const sessionData = sessions.get(sessionId);
      if (!sessionData) {
        return socket.emit('session-error', { message: 'Sesi belum aktif.' });
      }
      if (sessionData.token !== sessionToken) {
        return socket.emit('session-error', { message: 'Otorisasi sesi ditolak.' });
      }

      const normalizedSet = new Set();
      if (Array.isArray(targets)) {
        targets.forEach((num) => {
          const norm = normalizeToDigits(num);
          if (norm && norm.length >= 8) {
            normalizedSet.add(norm);
          }
        });
      }

      sessionData.targetNumbers = normalizedSet;
      sessionData.lastActive = Date.now();

      io.to(sessionId).emit('targets-updated', {
        targets: Array.from(normalizedSet)
      });
    } catch (err) {
      socket.emit('session-error', { message: 'Gagal memperbarui target: ' + err.message });
    }
  });

  // Logout & pembersihan tuntas sesi
  socket.on('logout-session', async (payload) => {
    try {
      const { sessionId, sessionToken } = payload || {};
      const sessionData = sessions.get(sessionId);
      if (!sessionData || sessionData.token !== sessionToken) return;

      if (sessionData.disconnectTimer) {
        clearTimeout(sessionData.disconnectTimer);
      }

      try {
        await sessionData.sock.logout();
      } catch (_) {
        try {
          sessionData.sock.end();
        } catch (_) {}
      }

      removeSessionDir(sessionId);
      sessions.delete(sessionId);

      io.to(sessionId).emit('status', { status: 'disconnected', reason: 'user_logout' });
    } catch (err) {
      console.error('Error logout-session:', err);
    }
  });

  socket.on('disconnect', () => {
    for (const [sessionId, sessionData] of sessions.entries()) {
      if (sessionData.connectedSockets.has(socket.id)) {
        sessionData.connectedSockets.delete(socket.id);

        // Jika tidak ada lagi tab browser yang terhubung ke sesi ini, jadwalkan timer idle cleanup
        if (sessionData.connectedSockets.size === 0) {
          sessionData.disconnectTimer = setTimeout(() => {
            try {
              sessionData.sock.end();
            } catch (_) {}
            removeSessionDir(sessionId);
            sessions.delete(sessionId);
            console.log(`[Session ${sessionId}] Dibersihkan otomatis setelah 15 menit idle.`);
          }, IDLE_TIMEOUT_MS);
        }
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`[AllToolsKuro] WA Backend aktif di port ${PORT}`);
});
