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
    version: '1.2.0'
  });
});

// 1. Naikkan Limit Payload Socket.io ke 50 MB agar transfer Base64 foto/video HD aman
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  maxHttpBufferSize: 5e7 // 50 MB
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

// 2. Helper unwrap pesan View Once secara rekursif mengupas semua lapisan Baileys
function unwrapViewOnceMessage(rawMessage) {
  if (!rawMessage || typeof rawMessage !== 'object') return null;
  let current = rawMessage;
  let isViewOnce = false;

  // Kupas berlapis jika dibungkus pesan ephemeral / viewOnce / documentWithCaption
  for (let depth = 0; depth < 5; depth++) {
    if (!current || typeof current !== 'object') break;

    if (current.ephemeralMessage?.message) {
      current = current.ephemeralMessage.message;
      continue;
    }
    if (current.viewOnceMessage?.message) {
      isViewOnce = true;
      current = current.viewOnceMessage.message;
      continue;
    }
    if (current.viewOnceMessageV2?.message) {
      isViewOnce = true;
      current = current.viewOnceMessageV2.message;
      continue;
    }
    if (current.viewOnceMessageV2Extension?.message) {
      isViewOnce = true;
      current = current.viewOnceMessageV2Extension.message;
      continue;
    }
    if (current.documentWithCaptionMessage?.message) {
      current = current.documentWithCaptionMessage.message;
      continue;
    }
    break;
  }

  if (!current) return null;

  const imageMsg = current.imageMessage;
  const videoMsg = current.videoMessage;

  if (!imageMsg && !videoMsg) return null;

  if (imageMsg?.viewOnce === true || videoMsg?.viewOnce === true) {
    isViewOnce = true;
  }

  if (!isViewOnce) return null;

  return {
    unwrappedContent: current,
    mediaType: imageMsg ? 'image' : 'video',
    targetMedia: imageMsg || videoMsg,
    isViewOnce: true
  };
}

// 3. Helper ekstraksi nomor pengirim (Mendukung @lid dan nomor WhatsApp biasa)
function extractSenderDigits(msg, lidToPhoneMap) {
  const candidates = [
    msg.key?.remoteJid,
    msg.key?.remoteJidAlt,
    msg.key?.participant,
    msg.key?.participantAlt
  ].filter(Boolean);

  const resultDigits = new Set();

  for (const rawJid of candidates) {
    const jidStr = String(rawJid).trim();

    // Jika berakhiran @lid, cari nomor aslinya di map
    if (jidStr.endsWith('@lid') && lidToPhoneMap) {
      const mapped = lidToPhoneMap.get(jidStr);
      if (mapped) {
        resultDigits.add(mapped);
      }
    }

    // Bersihkan dari domain WhatsApp (@s.whatsapp.net, @c.us, dll.)
    const cleanNumber = jidStr.split('@')[0];
    const digits = normalizeToDigits(cleanNumber);
    if (digits) {
      resultDigits.add(digits);
    }
  }

  return Array.from(resultDigits);
}

// Helper pencocokan nomor target (Eksak atau 9-10 digit terakhir)
function isTargetMatch(candidateDigitsList, targetNumber) {
  if (!targetNumber || !candidateDigitsList || candidateDigitsList.length === 0) return false;
  const cleanTarget = normalizeToDigits(targetNumber);
  const targetLast9 = cleanTarget.slice(-9);

  for (const candidate of candidateDigitsList) {
    if (candidate === cleanTarget) return true;
    if (targetLast9.length >= 9 && candidate.slice(-9) === targetLast9) return true;
  }
  return false;
}

// Inisialisasi & Penghubung Socket Baileys per Sesi
async function startBaileys(sessionId, sessionToken, targetNumber = null) {
  const sessionDir = path.join(__dirname, 'sessions', sessionId);
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

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

  let sessionData = sessions.get(sessionId);
  if (!sessionData) {
    sessionData = {
      sessionId,
      token: sessionToken,
      sock,
      targetNumber: targetNumber ? normalizeToDigits(targetNumber) : null,
      lidToPhoneMap: new Map(),
      pendingMedia: [], // Antrian in-memory untuk media saat browser offline
      connectedSockets: new Set(),
      disconnectTimer: null,
      qrCode: null,
      status: 'connecting',
      lastActive: Date.now()
    };
    sessions.set(sessionId, sessionData);
  } else {
    sessionData.sock = sock;
    if (targetNumber) {
      sessionData.targetNumber = normalizeToDigits(targetNumber);
    }
  }

  // Wajib simpan kredensial
  sock.ev.on('creds.update', saveCreds);

  // Mapping @lid ke nomor HP dari kontak
  sock.ev.on('contacts.upsert', (contacts) => {
    if (!Array.isArray(contacts)) return;
    for (const c of contacts) {
      if (c.lid && c.id) {
        const phone = normalizeToDigits(c.id);
        if (phone) {
          sessionData.lidToPhoneMap.set(c.lid, phone);
        }
      }
    }
  });

  sock.ev.on('contacts.update', (updates) => {
    if (!Array.isArray(updates)) return;
    for (const u of updates) {
      if (u.lid && u.id) {
        const phone = normalizeToDigits(u.id);
        if (phone) {
          sessionData.lidToPhoneMap.set(u.lid, phone);
        }
      }
    }
  });

  // Handler connection.update
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

      io.to(sessionId).emit('session-status', {
        status: 'connected',
        phone,
        targetNumber: sessionData.targetNumber
      });
      io.to(sessionId).emit('status', { status: 'connected', phone });

      // Jika ada pending media, kirimkan langsung saat terhubung
      if (sessionData.pendingMedia && sessionData.pendingMedia.length > 0) {
        while (sessionData.pendingMedia.length > 0) {
          const item = sessionData.pendingMedia.shift();
          io.to(sessionId).emit('view-once-media', item);
        }
      }
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const isLoggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 401;
      const isRestartRequired = statusCode === DisconnectReason.restartRequired || statusCode === 515;

      if (!isLoggedOut) {
        sessionData.status = 'reconnecting';
        io.to(sessionId).emit('session-status', { status: 'reconnecting', statusCode });
        io.to(sessionId).emit('status', { status: 'reconnecting' });

        setTimeout(() => {
          if (sessions.has(sessionId)) {
            startBaileys(sessionId, sessionData.token, sessionData.targetNumber);
          }
        }, 1000);
      } else {
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

  // Interseptor Pesan: Tangkap View Once dari 1 Nomor Target Terkunci
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    // Tangani baik pesan 'notify' maupun 'append'
    if (type !== 'notify' && type !== 'append') return;

    for (const msg of messages) {
      if (!msg.message) continue;
      if (msg.key?.fromMe) continue;
      if (msg.key?.remoteJid === 'status@broadcast') continue;

      const currentSession = sessions.get(sessionId);
      if (!currentSession || !currentSession.targetNumber) {
        continue;
      }

      // Ekstrak semua kandidat nomor pengirim (termasuk mapping @lid)
      const senderCandidates = extractSenderDigits(msg, currentSession.lidToPhoneMap);
      const isMatched = isTargetMatch(senderCandidates, currentSession.targetNumber);

      // Kupas berlapis pesan View Once
      const unwrapped = unwrapViewOnceMessage(msg.message);

      // Diagnostic logging ringkas (tanpa payload Base64)
      console.log(
        `[WA Msg] Session: ${sessionId.slice(0, 8)} | JID: ${msg.key?.remoteJid} | Senders: [${senderCandidates.join(',')}] | Target: ${currentSession.targetNumber} | Matched: ${isMatched} | isViewOnce: ${!!unwrapped}`
      );

      if (!isMatched || !unwrapped) continue;

      try {
        const { unwrappedContent, mediaType, targetMedia } = unwrapped;
        const mimeType = targetMedia.mimetype || (mediaType === 'image' ? 'image/jpeg' : 'video/mp4');
        const caption = targetMedia.caption || '';
        const senderName = msg.pushName || '';
        const senderNumber = senderCandidates[0] || currentSession.targetNumber;

        const sentAt = msg.messageTimestamp ? Number(msg.messageTimestamp) * 1000 : Date.now();

        // Download dengan konten yang sudah dikupas langsung
        let buffer = await downloadMediaMessage(
          { key: msg.key, message: unwrappedContent },
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
            senderNumber,
            senderName,
            mediaType,
            mimeType,
            caption,
            sentAt,
            timestamp: sentAt,
            base64Data
          };

          console.log(`[WA ViewOnce Downloaded] ${mediaType.toUpperCase()} (${buffer.length} bytes) dari +${senderNumber}`);

          // Kirim langsung ke browser jika ada tab yang aktif
          if (currentSession.connectedSockets && currentSession.connectedSockets.size > 0) {
            io.to(sessionId).emit('view-once-media', payload);
          } else {
            // Simpan ke pending antrian in-memory jika browser sedang offline/refresh
            if (!currentSession.pendingMedia) currentSession.pendingMedia = [];
            currentSession.pendingMedia.push(payload);
            if (currentSession.pendingMedia.length > 10) {
              currentSession.pendingMedia.shift();
            }
          }

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

        if (sessionData.targetNumber) {
          socket.emit('target-synced', { targetNumber: sessionData.targetNumber });
        }

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

      if (sessions.size >= MAX_SESSIONS) {
        return socket.emit('session-error', {
          message: 'Server sedang padat (batas 6 sesi aktif tercapai). Silakan coba lagi beberapa saat lagi.'
        });
      }

      sessionData = await startBaileys(sessionId, sessionToken, targetNumber);
      sessionData.connectedSockets.add(socket.id);
      socket.emit('session-status', { status: sessionData.status, targetNumber: sessionData.targetNumber });
      if (sessionData.targetNumber) {
        socket.emit('target-synced', { targetNumber: sessionData.targetNumber });
      }
    } catch (err) {
      console.error('Error start-session:', err);
      socket.emit('session-error', { message: 'Gagal menginisialisasi sesi WhatsApp: ' + err.message });
    }
  });

  // Auto-Resume Sesi saat pengguna masuk kembali ke web
  socket.on('resume-session', async (payload) => {
    try {
      const { sessionId, sessionToken, targetNumber } = payload || {};
      if (!sessionId || !sessionToken) return;

      socket.join(sessionId);

      let sessionData = sessions.get(sessionId);

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

        if (sessionData.targetNumber) {
          socket.emit('target-synced', { targetNumber: sessionData.targetNumber });
        }

        // Kirimkan antrian pending media jika ada
        if (sessionData.pendingMedia && sessionData.pendingMedia.length > 0) {
          while (sessionData.pendingMedia.length > 0) {
            const item = sessionData.pendingMedia.shift();
            socket.emit('view-once-media', item);
          }
        }

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

      // Skenario B: Folder auth sesi masih ada di disk Render
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
        if (sessionData.targetNumber) {
          socket.emit('target-synced', { targetNumber: sessionData.targetNumber });
        }
        return;
      }

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

      io.to(sessionId).emit('target-synced', {
        targetNumber: clean
      });
      io.to(sessionId).emit('target-updated', {
        targetNumber: clean
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

      io.to(sessionId).emit('session-status', { status: 'disconnected', reason: 'user_logout' });
      io.to(sessionId).emit('status', { status: 'disconnected', reason: 'user_logout' });
    } catch (err) {
      console.error('Error logout-session:', err);
    }
  });

  // Penanganan socket terputus
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
  console.log(`[AllToolsKuro] WA Backend v1.2.0 aktif di port ${PORT}`);
});
