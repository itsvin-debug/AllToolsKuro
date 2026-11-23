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
  downloadContentFromMessage,
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
    version: '1.3.0'
  });
});

// 1. Limit Payload Socket.io 50 MB agar transfer Base64 foto/video HD aman
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
function extractViewOnceMedia(rawMessage) {
  if (!rawMessage || typeof rawMessage !== 'object') return null;
  let current = rawMessage;
  let isViewOnce = false;

  // Kupas berlapis jika dibungkus pesan ephemeral / viewOnce / documentWithCaption / deviceSent
  for (let depth = 0; depth < 6; depth++) {
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
    if (current.deviceSentMessage?.message) {
      current = current.deviceSentMessage.message;
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
    mediaObj: imageMsg || videoMsg,
    isViewOnce: true
  };
}

// Resolusi nomor target & @lid proaktif via onWhatsApp & signalRepository
async function resolveTargetLid(sock, sessionData) {
  if (!sock || !sessionData?.targetNumber) return;
  const targetNumber = sessionData.targetNumber;

  try {
    const results = await sock.onWhatsApp(targetNumber);
    if (Array.isArray(results) && results[0]) {
      const res = results[0];
      if (res.jid) {
        sessionData.targetJid = res.jid;
        const phone = normalizeToDigits(res.jid);
        if (phone) sessionData.lidToPhoneMap.set(res.jid, phone);
      }
      if (res.lid) {
        sessionData.targetLid = res.lid;
        sessionData.lidToPhoneMap.set(res.lid, targetNumber);
      }
    }
  } catch (_) {}

  try {
    if (sock.signalRepository?.lidMapping?.getLIDForPN) {
      const lid = await sock.signalRepository.lidMapping.getLIDForPN(targetNumber);
      if (lid) {
        sessionData.targetLid = lid;
        sessionData.lidToPhoneMap.set(lid, targetNumber);
      }
    }
  } catch (_) {}
}

// Helper pencocokan nomor pengirim terhadap target terkunci (Mendukung @lid dan digit nomor)
function isTargetMatch(candidateJids, sessionData) {
  if (!sessionData?.targetNumber || !candidateJids || candidateJids.length === 0) return false;
  const targetNumber = sessionData.targetNumber;
  const targetLast9 = targetNumber.slice(-9);
  const targetLid = sessionData.targetLid;
  const targetJid = sessionData.targetJid;

  for (const raw of candidateJids) {
    if (!raw) continue;
    const str = String(raw).trim();

    // 1. Cocokkan LID langsung
    if (targetLid && str === targetLid) return true;
    if (str.endsWith('@lid') && sessionData.lidToPhoneMap.has(str)) {
      const mapped = sessionData.lidToPhoneMap.get(str);
      if (mapped === targetNumber || (targetLast9.length >= 9 && mapped.slice(-9) === targetLast9)) {
        return true;
      }
    }

    // 2. Cocokkan targetJid
    if (targetJid && str === targetJid) return true;

    // 3. Cocokkan digit nomor telepon
    const cleanNumber = str.split('@')[0];
    const digits = normalizeToDigits(cleanNumber);
    if (digits) {
      if (digits === targetNumber) return true;
      if (targetLast9.length >= 9 && digits.slice(-9) === targetLast9) return true;
    }
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
      targetJid: null,
      targetLid: null,
      lidToPhoneMap: new Map(),
      pendingMedia: [],
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
        if (phone) sessionData.lidToPhoneMap.set(c.lid, phone);
      }
    }
  });

  sock.ev.on('contacts.update', (updates) => {
    if (!Array.isArray(updates)) return;
    for (const u of updates) {
      if (u.lid && u.id) {
        const phone = normalizeToDigits(u.id);
        if (phone) sessionData.lidToPhoneMap.set(u.lid, phone);
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

      // Resolusi target JID & LID otomatis jika nomor target sudah ada
      if (sessionData.targetNumber) {
        await resolveTargetLid(sock, sessionData);
      }

      io.to(sessionId).emit('session-status', {
        status: 'connected',
        phone,
        targetNumber: sessionData.targetNumber
      });
      io.to(sessionId).emit('status', { status: 'connected', phone });

      // Jika ada pending media saat pengguna baru terhubung, kirimkan langsung
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

  // Interseptor Pesan: Tangkap & Dekripsi View Once Menggunakan downloadContentFromMessage
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify' && type !== 'append') return;

    for (const msg of messages) {
      if (!msg.message) continue;
      if (msg.key?.remoteJid === 'status@broadcast') continue;

      const currentSession = sessions.get(sessionId);
      if (!currentSession || !currentSession.targetNumber) {
        continue;
      }

      const candidateJids = [
        msg.key?.remoteJid,
        msg.key?.remoteJidAlt,
        msg.key?.participant,
        msg.key?.participantAlt
      ].filter(Boolean);

      const isTargetMatched = isTargetMatch(candidateJids, currentSession);
      const unwrapped = extractViewOnceMedia(msg.message);
      const isViewOnce = !!unwrapped;

      // Log singkat diagnostik di Render Logs
      console.log(
        `[WA Msg] remoteJid: ${msg.key?.remoteJid} | alt: ${msg.key?.remoteJidAlt || '-'} | fromMe: ${msg.key?.fromMe} | isViewOnce: ${isViewOnce} | isTargetMatch: ${isTargetMatched}`
      );

      // Hanya proses jika target cocok dan pesan merupakan View Once
      if (!isTargetMatched || !isViewOnce) continue;

      try {
        const { mediaType, mediaObj } = unwrapped;
        const mimeType = mediaObj.mimetype || (mediaType === 'image' ? 'image/jpeg' : 'video/mp4');
        const caption = mediaObj.caption || '';
        const senderName = msg.pushName || '';

        // Dekripsi langsung media stream tanpa perlu dibuka di HP
        const stream = await downloadContentFromMessage(mediaObj, mediaType);
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);

        if (buffer && buffer.length > 0) {
          const base64Data = `data:${mimeType};base64,${buffer.toString('base64')}`;
          const sentAt = Number(msg.messageTimestamp) ? Number(msg.messageTimestamp) * 1000 : Date.now();

          const payload = {
            id: msg.key?.id || String(Date.now()),
            senderNumber: currentSession.targetNumber,
            senderName,
            mediaType,
            mimeType,
            caption,
            sentAt,
            timestamp: sentAt,
            base64Data
          };

          console.log(`[WA ViewOnce Captured] ${mediaType.toUpperCase()} (${buffer.length} bytes) dari +${currentSession.targetNumber}`);

          // Kirim real-time ke room client
          if (currentSession.connectedSockets && currentSession.connectedSockets.size > 0) {
            io.to(sessionId).emit('view-once-media', payload);
          } else {
            if (!currentSession.pendingMedia) currentSession.pendingMedia = [];
            currentSession.pendingMedia.push(payload);
            if (currentSession.pendingMedia.length > 10) currentSession.pendingMedia.shift();
          }
        }
      } catch (mediaErr) {
        console.error(`[Session ${sessionId}] Gagal unduh media View Once:`, mediaErr.message);
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
          if (sessionData.sock) {
            await resolveTargetLid(sessionData.sock, sessionData);
          }
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
          if (sessionData.sock) {
            await resolveTargetLid(sessionData.sock, sessionData);
          }
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
  socket.on('set-target', async (payload) => {
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

      if (clean && sessionData.sock) {
        await resolveTargetLid(sessionData.sock, sessionData);
      }

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
  console.log(`[AllToolsKuro] WA Backend v1.3.0 aktif di port ${PORT}`);
});
