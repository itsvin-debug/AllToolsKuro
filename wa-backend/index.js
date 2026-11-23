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
  downloadMediaMessage,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 4000;
const FRONTEND_URL = process.env.FRONTEND_URL || '*';
const MAX_SESSIONS = 6;
const IDLE_TIMEOUT_MS = 60 * 60 * 1000; // 60 menit idle disconnect cleanup agar tidak cepat terputus

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
    version: '1.1.0'
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

// Inisialisasi & Penghubung Socket Baileys per Sesi
async function startBaileys(sessionId, sessionToken, targetNumber = null) {
  const sessionDir = path.join(__dirname, 'sessions', sessionId);
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  // 1. Ambil versi WA terbaru dengan fallback yang aman
  let version = [2, 3000, 1015901307];
  try {
    const fetched = await fetchLatestBaileysVersion();
    if (fetched && fetched.version) {
      version = fetched.version;
    }
  } catch (verErr) {
    console.warn(`[Session ${sessionId}] fetchLatestBaileysVersion error: ${verErr.message}, gunakan fallback.`);
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

  // 2. Konfigurasi Socket Baileys yang stabil
  const sock = makeWASocket({
    version,
    auth: state,
    browser: ['Kuro Studio', 'Chrome', '120.0.0'],
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
    markOnlineOnConnect: false,
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 25000,
    logger: pinoLogger,
    printQRInTerminal: false
  });

  // Ambil atau buat objek data sesi
  let sessionData = sessions.get(sessionId);
  if (!sessionData) {
    sessionData = {
      sessionId,
      token: sessionToken,
      sock,
      targetNumber: targetNumber ? normalizeToDigits(targetNumber) : null,
      connectedSockets: new Set(),
      disconnectTimer: null,
      qrCode: null,
      status: 'connecting',
      lastActive: Date.now()
    };
    sessions.set(sessionId, sessionData);
  } else {
    // Update socket instance & target jika ada
    sessionData.sock = sock;
    if (targetNumber) {
      sessionData.targetNumber = normalizeToDigits(targetNumber);
    }
  }

  // 3. Wajib simpan kredensial: pasang creds.update sebelum event lainnya
  sock.ev.on('creds.update', saveCreds);

  // 4. Handler connection.update: Mengatasi Error 515 & memastikan handshake tuntas
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      sessionData.qrCode = qr;
      sessionData.status = 'qr_ready';
      try {
        const qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, scale: 7 });
        io.to(sessionId).emit('qr', { qr, qrDataUrl });
      } catch (_) {
        io.to(sessionId).emit('qr', { qr });
      }
    }

    if (connection === 'open') {
      sessionData.status = 'connected';
      sessionData.qrCode = null;
      sessionData.lastActive = Date.now();
      const phone = sock.user?.id ? sock.user.id.split(':')[0] : '';

      // Kirim event status sukses tertaut
      io.to(sessionId).emit('session-status', {
        status: 'connected',
        phone,
        targetNumber: sessionData.targetNumber
      });
      io.to(sessionId).emit('status', { status: 'connected', phone });
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const isLoggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 401;
      const isRestartRequired = statusCode === DisconnectReason.restartRequired || statusCode === 515;

      // Jika restart diperlukan (515) atau bukan logout permanen: JANGAN HAPUS AUTH!
      if (!isLoggedOut) {
        sessionData.status = 'reconnecting';
        io.to(sessionId).emit('session-status', { status: 'reconnecting', statusCode });
        io.to(sessionId).emit('status', { status: 'reconnecting' });

        // Sambungkan ulang dengan jeda 1 detik agar handshake selesai
        setTimeout(() => {
          if (sessions.has(sessionId)) {
            startBaileys(sessionId, sessionData.token, sessionData.targetNumber);
          }
        }, 1000);
      } else {
        // Hapus auth folder HANYA jika benar-benar logged out dari WhatsApp HP
        sessionData.status = 'disconnected';
        io.to(sessionId).emit('session-status', { status: 'disconnected', reason: 'logged_out' });
        io.to(sessionId).emit('status', { status: 'disconnected', reason: 'logged_out' });
        try {
          sock.end();
        } catch (_) {}
        removeSessionDir(sessionId);
        sessions.delete(sessionId);
      }
    }
  });

  // 5. Interseptor Pesan: Tangkap View Once dari 1 Nomor Target Terkunci
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (!msg.message) continue;
      if (msg.key?.fromMe) continue;
      if (msg.key?.remoteJid === 'status@broadcast') continue;

      // Ekstrak nomor murni pengirim pesan
      const rawSender = msg.key?.remoteJid || msg.key?.remoteJidAlt || msg.key?.participant || msg.participant || '';
      const senderDigits = normalizeToDigits(rawSender);
      if (!senderDigits) continue;

      const currentSession = sessions.get(sessionId);
      if (!currentSession || !currentSession.targetNumber) {
        continue;
      }

      // Validasi ketat: HANYA proses jika nomor pengirim sama persis dengan nomor target terkunci
      if (senderDigits !== currentSession.targetNumber) {
        continue;
      }

      // Deteksi semua varian pembungkus View Once WhatsApp (V1, V2, V2Extension, atau viewOnce flag)
      const viewOnceWrapper =
        msg.message?.viewOnceMessage?.message ||
        msg.message?.viewOnceMessageV2?.message ||
        msg.message?.viewOnceMessageV2Extension?.message ||
        (msg.message?.imageMessage?.viewOnce ? msg.message : null) ||
        (msg.message?.videoMessage?.viewOnce ? msg.message : null);

      if (!viewOnceWrapper) continue;

      const imageMsg = viewOnceWrapper.imageMessage;
      const videoMsg = viewOnceWrapper.videoMessage;
      if (!imageMsg && !videoMsg) continue;

      try {
        const mediaType = imageMsg ? 'image' : 'video';
        const targetMedia = imageMsg || videoMsg;
        const mimeType = targetMedia.mimetype || (mediaType === 'image' ? 'image/jpeg' : 'video/mp4');
        const caption = targetMedia.caption || '';
        const senderName = msg.pushName || '';

        // Ambil tanggal & jam pengiriman asli dari WhatsApp
        const sentAt = msg.messageTimestamp ? Number(msg.messageTimestamp) * 1000 : Date.now();

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

          const payload = {
            id: msg.key?.id || `vo_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            senderNumber: senderDigits,
            senderName,
            mediaType,
            mimeType,
            caption,
            sentAt,
            timestamp: sentAt,
            base64Data
          };

          // Kirim eksklusif ke room sessionId pemiliknya
          io.to(sessionId).emit('view-once-media', payload);

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
  // Mulai sesi baru (Scan QR)
  socket.on('start-session', async (payload) => {
    try {
      const { sessionId, sessionToken, targetNumber } = payload || {};
      if (!sessionId || !sessionToken || typeof sessionId !== 'string' || typeof sessionToken !== 'string') {
        return socket.emit('session-error', { message: 'Parameter sesi tidak valid.' });
      }

      socket.join(sessionId);

      let sessionData = sessions.get(sessionId);

      // Jika sesi sudah tercatat di memori
      if (sessionData) {
        if (sessionData.token !== sessionToken) {
          return socket.emit('session-error', { message: 'Token otentikasi sesi tidak cocok.' });
        }

        if (sessionData.disconnectTimer) {
          clearTimeout(sessionData.disconnectTimer);
          sessionData.disconnectTimer = null;
        }

        sessionData.connectedSockets.add(socket.id);
        sessionData.lastActive = Date.now();
        if (targetNumber) {
          sessionData.targetNumber = normalizeToDigits(targetNumber);
        }

        socket.emit('session-status', {
          status: sessionData.status,
          phone: sessionData.sock?.user?.id ? sessionData.sock.user.id.split(':')[0] : '',
          targetNumber: sessionData.targetNumber
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

      // Buat & jalankan sesi Baileys baru
      sessionData = await startBaileys(sessionId, sessionToken, targetNumber);
      sessionData.connectedSockets.add(socket.id);
      socket.emit('session-status', { status: sessionData.status, targetNumber: sessionData.targetNumber });
    } catch (err) {
      console.error('Error start-session:', err);
      socket.emit('session-error', { message: 'Gagal menginisialisasi sesi WhatsApp: ' + err.message });
    }
  });

  // Auto-Resume Sesi saat pengguna masuk kembali ke web (Anti-Scan Ulang)
  socket.on('resume-session', async (payload) => {
    try {
      const { sessionId, sessionToken, targetNumber } = payload || {};
      if (!sessionId || !sessionToken) return;

      socket.join(sessionId);

      let sessionData = sessions.get(sessionId);

      // Skenario A: Sesi masih tersimpan aktif di memori
      if (sessionData) {
        if (sessionData.token !== sessionToken) {
          return socket.emit('session-error', { message: 'Token otentikasi sesi tidak cocok.' });
        }

        if (sessionData.disconnectTimer) {
          clearTimeout(sessionData.disconnectTimer);
          sessionData.disconnectTimer = null;
        }

        sessionData.connectedSockets.add(socket.id);
        sessionData.lastActive = Date.now();
        if (targetNumber) {
          sessionData.targetNumber = normalizeToDigits(targetNumber);
        }

        const phone = sessionData.sock?.user?.id ? sessionData.sock.user.id.split(':')[0] : '';
        socket.emit('session-status', {
          status: sessionData.status,
          phone,
          targetNumber: sessionData.targetNumber
        });

        if (sessionData.status === 'qr_ready' && sessionData.qrCode) {
          try {
            const qrDataUrl = await QRCode.toDataURL(sessionData.qrCode, { margin: 1, scale: 7 });
            socket.emit('qr', { qr: sessionData.qrCode, qrDataUrl });
          } catch (_) {
            socket.emit('qr', { qr: sessionData.qrCode });
          }
        }
        return;
      }

      // Skenario B: Folder auth sesi masih ada di disk Render (belum logout)
      const sessionDir = path.join(__dirname, 'sessions', sessionId);
      const credsFile = path.join(sessionDir, 'creds.json');
      if (fs.existsSync(credsFile)) {
        sessionData = await startBaileys(sessionId, sessionToken, targetNumber);
        sessionData.connectedSockets.add(socket.id);
        const phone = sessionData.sock?.user?.id ? sessionData.sock.user.id.split(':')[0] : '';
        socket.emit('session-status', {
          status: sessionData.status,
          phone,
          targetNumber: sessionData.targetNumber
        });
        return;
      }

      // Skenario C: Sesi belum pernah dibuat atau sudah di-logout
      socket.emit('session-status', { status: 'disconnected' });
    } catch (err) {
      console.error('Error resume-session:', err);
      socket.emit('session-status', { status: 'disconnected' });
    }
  });

  // Mengunci 1 nomor target terpantau
  socket.on('set-target', (payload) => {
    try {
      const { sessionId, sessionToken, targetNumber } = payload || {};
      const sessionData = sessions.get(sessionId);
      if (!sessionData) {
        return socket.emit('session-error', { message: 'Sesi belum aktif.' });
      }
      if (sessionData.token !== sessionToken) {
        return socket.emit('session-error', { message: 'Otorisasi sesi ditolak.' });
      }

      const clean = targetNumber ? normalizeToDigits(targetNumber) : null;
      sessionData.targetNumber = clean;
      sessionData.lastActive = Date.now();

      io.to(sessionId).emit('target-updated', {
        targetNumber: clean
      });
    } catch (err) {
      socket.emit('session-error', { message: 'Gagal memperbarui target: ' + err.message });
    }
  });

  // Kompatibilitas mundur jika frontend memanggil set-targets
  socket.on('set-targets', (payload) => {
    try {
      const { sessionId, sessionToken, targets } = payload || {};
      const targetNumber = Array.isArray(targets) && targets.length > 0 ? targets[0] : null;
      const sessionData = sessions.get(sessionId);
      if (sessionData && sessionData.token === sessionToken) {
        sessionData.targetNumber = targetNumber ? normalizeToDigits(targetNumber) : null;
        io.to(sessionId).emit('target-updated', { targetNumber: sessionData.targetNumber });
      }
    } catch (_) {}
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

      io.to(sessionId).emit('session-status', { status: 'disconnected', reason: 'user_logout' });
      io.to(sessionId).emit('status', { status: 'disconnected', reason: 'user_logout' });
    } catch (err) {
      console.error('Error logout-session:', err);
    }
  });

  // Penanganan socket terputus dengan jeda 60 menit
  socket.on('disconnect', () => {
    for (const [sessionId, sessionData] of sessions.entries()) {
      if (sessionData.connectedSockets.has(socket.id)) {
        sessionData.connectedSockets.delete(socket.id);

        if (sessionData.connectedSockets.size === 0) {
          sessionData.disconnectTimer = setTimeout(() => {
            try {
              sessionData.sock.end();
            } catch (_) {}
            removeSessionDir(sessionId);
            sessions.delete(sessionId);
            console.log(`[Session ${sessionId}] Dibersihkan otomatis setelah 60 menit idle.`);
          }, IDLE_TIMEOUT_MS);
        }
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`[AllToolsKuro] WA Backend aktif di port ${PORT}`);
});
