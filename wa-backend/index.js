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
  downloadMediaMessage,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 4000;
const FRONTEND_URL = process.env.FRONTEND_URL || '*';
const MAX_SESSIONS = 6;
const IDLE_TIMEOUT_MS = 60 * 60 * 1000; // 60 menit batas idle sesi

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
    version: '1.4.0'
  });
});

// 1. Konfigurasi Server & Socket.io Anti-Drop (50 MB Max Payload & Heartbeat Optimal)
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || '*',
    methods: ['GET', 'POST']
  },
  maxHttpBufferSize: 5e7, // 50 MB agar foto/video Base64 tidak pernah terputus
  pingTimeout: 60000,
  pingInterval: 25000
});

// Map penyimpan sesi aktif: sessionId -> { sock, status, targetNumber, targetJids, lidMap, pendingMedia, lastActive, ... }
const sessions = new Map();

// Helper resolusi path folder auth multi-file sesi (Mendukung auth_info_<id> dan sessions/<id>)
function getSessionDir(sessionId) {
  const cleanId = String(sessionId).replace(/[^a-zA-Z0-9_-]/g, '');
  const dirAuth = path.join(__dirname, `auth_info_${cleanId}`);
  const dirSessions = path.join(__dirname, 'sessions', cleanId);
  if (fs.existsSync(dirAuth)) return dirAuth;
  if (fs.existsSync(dirSessions)) return dirSessions;
  return dirAuth;
}

// Helper pembersih tuntas folder auth sesi
function removeSessionDir(sessionId) {
  const cleanId = String(sessionId).replace(/[^a-zA-Z0-9_-]/g, '');
  const dirs = [
    path.join(__dirname, `auth_info_${cleanId}`),
    path.join(__dirname, 'sessions', cleanId)
  ];
  for (const dir of dirs) {
    try {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    } catch (err) {
      console.error(`[Session ${cleanId}] Gagal membersihkan folder auth:`, err.message);
    }
  }
}

// 3. Logika Normalisasi Nomor Telepon (Anti-Gagal Format WhatsApp)
function normalizePhone(raw) {
  if (!raw) return '';
  let digits = String(raw).replace(/\D/g, '');
  if (digits.startsWith('0')) {
    digits = '62' + digits.slice(1);
  } else if (digits.startsWith('8')) {
    digits = '62' + digits;
  }
  return digits;
}

// 3. Logika Pemetaan Proaktif Identifiers Target (@lid dan JID WhatsApp)
async function resolveTargetIdentifiers(session) {
  if (!session || !session.targetNumber) return;
  if (!session.targetJids) session.targetJids = new Set();

  session.targetJids.clear();
  session.targetJids.add(session.targetNumber);
  session.targetJids.add(`${session.targetNumber}@s.whatsapp.net`);

  if (session.sock) {
    try {
      const [res] = await session.sock.onWhatsApp(session.targetNumber);
      if (res?.jid) {
        session.targetJids.add(res.jid);
        const p = normalizePhone(res.jid.split('@')[0]);
        if (p && session.lidMap) session.lidMap.set(res.jid, p);
      }
      if (res?.lid) {
        session.targetJids.add(res.lid);
        if (session.lidMap) session.lidMap.set(res.lid, session.targetNumber);
      }
    } catch (_) {}

    try {
      const lid = await session.sock.signalRepository?.lidMapping?.getLIDForPN?.(
        `${session.targetNumber}@s.whatsapp.net`
      );
      if (lid) {
        session.targetJids.add(lid);
        if (session.lidMap) session.lidMap.set(lid, session.targetNumber);
      }
    } catch (_) {}
  }
}

// 3. Pencocokan Pengirim Pesan Terhadap Target Terkunci (Mendukung @lid, JID, dan 10 Digit Terakhir)
function isFromTarget(msg, session) {
  if (!session?.targetNumber) return false;

  const candidates = [
    msg.key?.remoteJid,
    msg.key?.remoteJidAlt,
    msg.key?.participant,
    msg.key?.participantAlt
  ].filter(Boolean);

  for (const jid of candidates) {
    // 1) Cek apakah session.targetJids.has(jid)
    if (session.targetJids && session.targetJids.has(jid)) return true;

    // 2) Cek apakah session.lidMap.get(jid) === session.targetNumber
    if (session.lidMap && session.lidMap.get(jid) === session.targetNumber) return true;

    // 3) Ambil bagian sebelum '@' dan sebelum ':', lalu normalisasi
    const rawPrefix = String(jid).split('@')[0].split(':')[0];
    const normalized = normalizePhone(rawPrefix);

    // 4) Cek kesamaan nilai normalisasi atau 10 digit terakhir
    if (normalized) {
      if (normalized === session.targetNumber) return true;
      const targetLast10 = session.targetNumber.slice(-10);
      if (targetLast10.length >= 8 && normalized.endsWith(targetLast10)) return true;
    }
  }

  return false;
}

// 4. Logika Unwrap Pesan Secara Rekursif Mengupas Lapisan Baileys
function unwrapMessage(rawMessage) {
  if (!rawMessage || typeof rawMessage !== 'object') {
    return { unwrapped: null, isViewOnce: false };
  }

  let current = rawMessage;
  let isViewOnce = false;
  let depth = 0;

  while (current && typeof current === 'object' && depth < 5) {
    depth++;

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
    if (current.editedMessage?.message) {
      current = current.editedMessage.message;
      continue;
    }
    if (current.documentWithCaptionMessage?.message) {
      current = current.documentWithCaptionMessage.message;
      continue;
    }
    break;
  }

  if (!current) return { unwrapped: null, isViewOnce: false };

  if (current.imageMessage?.viewOnce === true || current.videoMessage?.viewOnce === true) {
    isViewOnce = true;
  }

  return { unwrapped: current, isViewOnce };
}

// 2. Inisialisasi & Penghubung Baileys Anti-Putus (Handle 515 & Multi-File Auth)
async function startBaileys(sessionId, targetNumber = null) {
  const sessionDir = getSessionDir(sessionId);
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  // Wajib panggil fetchLatestBaileysVersion sebelum makeWASocket
  let version = [2, 3000, 1015901307];
  try {
    const fetched = await fetchLatestBaileysVersion();
    if (fetched?.version) {
      version = fetched.version;
    }
  } catch (verErr) {
    console.warn(`[Session ${sessionId}] fetchLatestBaileysVersion gagal: ${verErr.message}, menggunakan fallback.`);
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

  let session = sessions.get(sessionId);
  if (!session) {
    session = {
      sessionId,
      sock,
      status: 'connecting',
      targetNumber: targetNumber ? normalizePhone(targetNumber) : null,
      targetJids: new Set(),
      lidMap: new Map(),
      pendingMedia: [],
      lastActive: Date.now(),
      qrCode: null,
      qrDataUrl: null
    };
    sessions.set(sessionId, session);
  } else {
    session.sock = sock;
    session.status = 'connecting';
    session.lastActive = Date.now();
    if (targetNumber) {
      session.targetNumber = normalizePhone(targetNumber);
    }
  }

  // Wajib pasang sock.ev.on('creds.update', saveCreds)
  sock.ev.on('creds.update', saveCreds);

  // Listener untuk memetakan contact.lid <-> phone
  sock.ev.on('contacts.upsert', (contacts) => {
    if (!Array.isArray(contacts)) return;
    for (const c of contacts) {
      if (c.lid && c.id) {
        const phone = normalizePhone(c.id);
        if (phone) {
          session.lidMap.set(c.lid, phone);
          session.lidMap.set(phone, c.lid);
        }
      }
    }
  });

  sock.ev.on('contacts.update', (updates) => {
    if (!Array.isArray(updates)) return;
    for (const u of updates) {
      if (u.lid && u.id) {
        const phone = normalizePhone(u.id);
        if (phone) {
          session.lidMap.set(u.lid, phone);
          session.lidMap.set(phone, u.lid);
        }
      }
    }
  });

  sock.ev.on('messaging-history.set', (payload) => {
    const contacts = payload?.contacts;
    if (!Array.isArray(contacts)) return;
    for (const c of contacts) {
      if (c.lid && c.id) {
        const phone = normalizePhone(c.id);
        if (phone) {
          session.lidMap.set(c.lid, phone);
          session.lidMap.set(phone, c.lid);
        }
      }
    }
  });

  // Handler connection.update Anti-Putus
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      session.qrCode = qr;
      session.status = 'qr_ready';
      session.lastActive = Date.now();
      try {
        const qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, scale: 7 });
        session.qrDataUrl = qrDataUrl;
        io.to(sessionId).emit('qr-code', { qr, qrDataUrl });
        io.to(sessionId).emit('qr', { qr, qrDataUrl });
      } catch (_) {
        io.to(sessionId).emit('qr-code', { qr });
        io.to(sessionId).emit('qr', { qr });
      }
    }

    if (connection === 'open') {
      session.status = 'connected';
      session.qrCode = null;
      session.qrDataUrl = null;
      session.lastActive = Date.now();

      // Jika nomor target sudah ada, langsung petakan ke JID dan LID
      if (session.targetNumber) {
        await resolveTargetIdentifiers(session);
      }

      const phone = sock.user?.id ? sock.user.id.split(':')[0] : (sock.user?.id || '');
      io.to(sessionId).emit('session-status', {
        status: 'connected',
        phone,
        targetNumber: session.targetNumber || ''
      });
      io.to(sessionId).emit('status', { status: 'connected', phone });

      // Jika ada pending media, langsung kirim semua lalu kosongkan arraynya
      if (session.pendingMedia && session.pendingMedia.length > 0) {
        while (session.pendingMedia.length > 0) {
          const item = session.pendingMedia.shift();
          io.to(sessionId).emit('view-once-media', item);
        }
      }
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const isLoggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 401;

      if (isLoggedOut) {
        // Status 401: Hapus folder auth dan bersihkan sesi
        removeSessionDir(sessionId);
        sessions.delete(sessionId);
        io.to(sessionId).emit('session-status', {
          status: 'disconnected',
          message: 'Sesi keluar dari perangkat.'
        });
        io.to(sessionId).emit('status', { status: 'disconnected', reason: 'logged_out' });
      } else {
        // SELAIN 401 (termasuk 515 restartRequired): JANGAN HAPUS folder auth!
        session.status = 'reconnecting';
        io.to(sessionId).emit('session-status', {
          status: 'reconnecting',
          statusCode
        });
        io.to(sessionId).emit('status', { status: 'reconnecting' });

        setTimeout(() => {
          if (sessions.has(sessionId)) {
            startBaileys(sessionId, session.targetNumber);
          }
        }, 1500);
      }
    }
  });

  // 4. Interseptor Pesan & Dekripsi View Once Real-Time (Tanpa Buka di HP)
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify' && type !== 'append') return;

    for (const msg of messages) {
      if (!msg.message || msg.key?.remoteJid === 'status@broadcast') continue;

      const currentSession = sessions.get(sessionId);
      if (!currentSession) continue;

      currentSession.lastActive = Date.now();

      const { unwrapped, isViewOnce } = unwrapMessage(msg.message);
      if (!isViewOnce || !unwrapped) continue;

      const matchedTarget = isFromTarget(msg, currentSession);

      // Log diagnostik singkat ke console Render
      console.log('[WA-VAULT]', {
        sessionId,
        remoteJid: msg.key?.remoteJid,
        remoteJidAlt: msg.key?.remoteJidAlt,
        fromMe: msg.key?.fromMe,
        isViewOnce,
        matchedTarget
      });

      if (!matchedTarget) continue;

      const mediaObj = unwrapped.imageMessage || unwrapped.videoMessage;
      const mediaType = unwrapped.imageMessage ? 'image' : 'video';
      if (!mediaObj) continue;

      // Dekripsi & Unduh Media (Metode Ganda dengan Fallback)
      let buffer = null;

      // Metode 1 (Utama): downloadContentFromMessage
      try {
        const stream = await downloadContentFromMessage(mediaObj, mediaType);
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        buffer = Buffer.concat(chunks);
      } catch (m1Err) {
        console.warn(`[WA-VAULT] Metode 1 gagal (${m1Err.message}), mencoba Metode 2 fallback...`);
        // Metode 2 (Fallback): downloadMediaMessage
        try {
          buffer = await downloadMediaMessage(
            { key: msg.key, message: unwrapped },
            'buffer',
            {},
            { logger: pinoLogger, reuploadRequest: sock.updateMediaMessage }
          );
        } catch (m2Err) {
          console.error('[WA-VAULT] Metode 2 juga gagal:', m2Err.message);
        }
      }

      if (buffer && buffer.length > 0) {
        const mimeType = mediaObj.mimetype || (mediaType === 'image' ? 'image/jpeg' : 'video/mp4');
        const base64Data = 'data:' + mimeType + ';base64,' + buffer.toString('base64');
        const sentAt = Number(msg.messageTimestamp) ? Number(msg.messageTimestamp) * 1000 : Date.now();

        const payload = {
          id: String(msg.key?.id || Date.now()),
          senderNumber: String(currentSession.targetNumber),
          senderName: String(msg.pushName || ''),
          mediaType: String(mediaType),
          mimeType: String(mimeType),
          caption: String(mediaObj.caption || ''),
          sentAt: Number(sentAt),
          base64Data
        };

        console.log(`[WA-VAULT Captured] ${mediaType.toUpperCase()} (${buffer.length} bytes) dari +${currentSession.targetNumber}`);

        // Kirim real-time ke room socket client
        io.to(sessionId).emit('view-once-media', payload);

        // Jika tidak ada socket client di room, simpan ke antrian pendingMedia
        const room = io.sockets.adapter.rooms.get(sessionId);
        if (!room || room.size === 0) {
          if (!currentSession.pendingMedia) currentSession.pendingMedia = [];
          currentSession.pendingMedia.push(payload);
          if (currentSession.pendingMedia.length > 10) {
            currentSession.pendingMedia.shift();
          }
        }
      }
    }
  });

  return session;
}

// 5. Sinkronisasi Event Socket.io Multi-Client
io.on('connection', (socket) => {
  // Event 'resume-session' (Sinkronisasi Otomatis saat Klien Masuk/Reconnect)
  socket.on('resume-session', async (payload) => {
    try {
      const { sessionId, targetNumber } = payload || {};
      if (!sessionId) return;

      socket.join(sessionId);

      let session = sessions.get(sessionId);

      if (targetNumber) {
        const clean = normalizePhone(targetNumber);
        if (session) {
          session.targetNumber = clean;
          await resolveTargetIdentifiers(session);
        }
      }

      if (session) {
        session.lastActive = Date.now();

        if (session.status === 'connected') {
          const phone = session.sock?.user?.id ? session.sock.user.id.split(':')[0] : '';
          socket.emit('session-status', {
            status: 'connected',
            phone,
            targetNumber: session.targetNumber || ''
          });

          if (session.targetNumber) {
            socket.emit('target-synced', { targetNumber: session.targetNumber });
          }

          if (session.pendingMedia && session.pendingMedia.length > 0) {
            while (session.pendingMedia.length > 0) {
              const item = session.pendingMedia.shift();
              socket.emit('view-once-media', item);
            }
          }
        } else if (session.status === 'qr_ready' && session.qrCode) {
          socket.emit('qr-code', { qr: session.qrCode, qrDataUrl: session.qrDataUrl });
          socket.emit('qr', { qr: session.qrCode, qrDataUrl: session.qrDataUrl });
        } else {
          socket.emit('session-status', { status: session.status });
        }
        return;
      }

      // Jika belum di memori, periksa apakah folder auth ada di disk
      const sessionDir = getSessionDir(sessionId);
      const credsFile = path.join(sessionDir, 'creds.json');
      if (fs.existsSync(credsFile)) {
        session = await startBaileys(sessionId, targetNumber ? normalizePhone(targetNumber) : null);
        return;
      }

      socket.emit('session-status', { status: 'disconnected' });
    } catch (err) {
      console.error('Error resume-session:', err.message);
      socket.emit('session-status', { status: 'disconnected' });
    }
  });

  // Event 'set-target' (Kunci 1 Nomor Target Terpantau)
  socket.on('set-target', async (payload) => {
    try {
      const { sessionId, targetNumber } = payload || {};
      if (!sessionId) return;

      const session = sessions.get(sessionId);
      const clean = targetNumber ? normalizePhone(targetNumber) : null;

      if (session) {
        session.targetNumber = clean;
        session.lastActive = Date.now();
        await resolveTargetIdentifiers(session);
      }

      io.to(sessionId).emit('target-synced', { targetNumber: clean });
      io.to(sessionId).emit('target-updated', { targetNumber: clean });
    } catch (err) {
      console.error('Error set-target:', err.message);
      socket.emit('session-error', { message: 'Gagal memperbarui target: ' + err.message });
    }
  });

  // Event 'start-session' (Permintaan Inisialisasi Sesi Baru / Scan QR)
  socket.on('start-session', async (payload) => {
    try {
      const { sessionId, targetNumber } = payload || {};
      if (!sessionId || typeof sessionId !== 'string') {
        return socket.emit('session-error', { message: 'ID Sesi tidak valid.' });
      }

      socket.join(sessionId);

      let session = sessions.get(sessionId);

      if (session) {
        session.lastActive = Date.now();
        if (targetNumber) {
          session.targetNumber = normalizePhone(targetNumber);
          await resolveTargetIdentifiers(session);
        }

        socket.emit('session-status', {
          status: session.status,
          phone: session.sock?.user?.id ? session.sock.user.id.split(':')[0] : '',
          targetNumber: session.targetNumber || ''
        });

        if (session.targetNumber) {
          socket.emit('target-synced', { targetNumber: session.targetNumber });
        }

        if (session.status === 'qr_ready' && session.qrCode) {
          socket.emit('qr-code', { qr: session.qrCode, qrDataUrl: session.qrDataUrl });
          socket.emit('qr', { qr: session.qrCode, qrDataUrl: session.qrDataUrl });
        }
        return;
      }

      if (sessions.size >= MAX_SESSIONS) {
        return socket.emit('session-error', {
          message: 'Server sedang padat (batas 6 sesi tercapai). Silakan coba lagi beberapa saat.'
        });
      }

      session = await startBaileys(sessionId, targetNumber ? normalizePhone(targetNumber) : null);
      socket.emit('session-status', { status: session.status, targetNumber: session.targetNumber });
      if (session.targetNumber) {
        socket.emit('target-synced', { targetNumber: session.targetNumber });
      }
    } catch (err) {
      console.error('Error start-session:', err.message);
      socket.emit('session-error', { message: 'Gagal menginisialisasi WhatsApp: ' + err.message });
    }
  });

  // Event 'logout-session' (Putuskan Koneksi & Bersihkan Kredensial)
  socket.on('logout-session', async (payload) => {
    try {
      const { sessionId } = payload || {};
      if (!sessionId) return;

      const session = sessions.get(sessionId);
      if (session) {
        try {
          await session.sock?.logout();
        } catch (_) {
          try {
            session.sock?.end();
          } catch (_) {}
        }
      }

      removeSessionDir(sessionId);
      sessions.delete(sessionId);

      io.to(sessionId).emit('session-status', { status: 'disconnected', reason: 'user_logout' });
      io.to(sessionId).emit('status', { status: 'disconnected', reason: 'user_logout' });
    } catch (err) {
      console.error('Error logout-session:', err.message);
    }
  });
});

// Pembersih otomatis sesi idle > 60 menit
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of sessions.entries()) {
    if (now - session.lastActive > IDLE_TIMEOUT_MS) {
      const room = io.sockets.adapter.rooms.get(sessionId);
      if (!room || room.size === 0) {
        try {
          session.sock?.end();
        } catch (_) {}
        removeSessionDir(sessionId);
        sessions.delete(sessionId);
        console.log(`[Session ${sessionId}] Dibersihkan otomatis setelah 60 menit idle.`);
      }
    }
  }
}, 5 * 60 * 1000);

server.listen(PORT, () => {
  console.log(`[AllToolsKuro] WA Backend v1.4.0 aktif di port ${PORT}`);
});
