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
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');
const NodeCache = require('node-cache');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 4000;
const FRONTEND_URL = process.env.FRONTEND_URL || '*';
const MAX_SESSIONS = 6;
const IDLE_TIMEOUT_MS = 60 * 60 * 1000; // 60 menit batas idle sesi

const pinoLogger = pino({ level: 'silent' });
const baileysLogger = pino({ level: 'silent' });

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
    version: '1.5.0'
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

// Helper normalisasi nomor telepon standar (08/8 -> 628)
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

// 1. Resolusi 2 Arah @lid <-> Nomor HP (KUNCI UTAMA ANTI-GAGAL @lid)
async function resolveJidToPhone(jid, session) {
  if (!jid || typeof jid !== 'string') return null;
  const cleanJid = jid.trim();

  // a) Jika jid berakhiran @s.whatsapp.net: ambil angka sebelum '@' dan ':', lalu normalisasi
  if (cleanJid.endsWith('@s.whatsapp.net') || (!cleanJid.includes('@lid') && cleanJid.includes('@'))) {
    const rawNumber = cleanJid.split('@')[0].split(':')[0];
    const phone = normalizePhone(rawNumber);
    if (phone) {
      if (session?.lidMap) session.lidMap.set(cleanJid, phone);
      return phone;
    }
  }

  // b) Jika jid berakhiran @lid: cek dulu di session.lidMap
  if (cleanJid.endsWith('@lid')) {
    if (session?.lidMap?.has(cleanJid)) {
      return session.lidMap.get(cleanJid);
    }

    // c) Jika belum ada di lidMap: panggil signalRepository.lidMapping.getPNForLID(jid)
    try {
      if (session?.sock?.signalRepository?.lidMapping?.getPNForLID) {
        const pn = await session.sock.signalRepository.lidMapping.getPNForLID(cleanJid);
        if (pn) {
          const rawPN = typeof pn === 'string' ? pn.split('@')[0].split(':')[0] : String(pn);
          const phone = normalizePhone(rawPN);
          if (phone) {
            session.lidMap?.set(cleanJid, phone);
            session.lidMap?.set(phone, cleanJid);
            return phone;
          }
        }
      }
    } catch (_) {}

    // d) Cek juga sock.authState?.creds
    try {
      if (session?.sock?.authState?.creds?.me?.lid === cleanJid) {
        const myPhone = normalizePhone(session.sock.authState.creds.me.id?.split(':')[0]);
        if (myPhone) {
          session.lidMap?.set(cleanJid, myPhone);
          return myPhone;
        }
      }
    } catch (_) {}
  }

  // Fallback digit jika berupa nomor polos
  const fallbackDigits = normalizePhone(cleanJid);
  if (fallbackDigits && fallbackDigits.length >= 8) {
    return fallbackDigits;
  }

  return null;
}

// Pemetaan Proaktif Identifiers Target (@lid dan JID WhatsApp)
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
        if (p && session.lidMap) {
          session.lidMap.set(res.jid, p);
          session.lidMap.set(p, res.jid);
        }
      }
      if (res?.lid) {
        session.targetJids.add(res.lid);
        if (session.lidMap) {
          session.lidMap.set(res.lid, session.targetNumber);
          session.lidMap.set(session.targetNumber, res.lid);
        }
      }
    } catch (_) {}

    try {
      const lid = await session.sock.signalRepository?.lidMapping?.getLIDForPN?.(
        `${session.targetNumber}@s.whatsapp.net`
      );
      if (lid) {
        session.targetJids.add(lid);
        if (session.lidMap) {
          session.lidMap.set(lid, session.targetNumber);
          session.lidMap.set(session.targetNumber, lid);
        }
      }
    } catch (_) {}
  }
}

// 1. Pencocokan Pengirim Pesan Terhadap Target Terkunci (Menggunakan resolveJidToPhone)
async function isFromTarget(msg, session) {
  if (!session?.targetNumber) return false;

  const candidates = [
    msg.key?.remoteJid,
    msg.key?.remoteJidAlt,
    msg.key?.participant,
    msg.key?.participantAlt
  ].filter(Boolean);

  for (const candidate of candidates) {
    // 1) Cocokkan langsung dengan targetJids yang telah dipetakan
    if (session.targetJids && session.targetJids.has(candidate)) {
      return true;
    }

    // 2) Resolusi JID/LID kandidat ke nomor HP murni
    const phone = await resolveJidToPhone(candidate, session);
    if (phone) {
      if (phone === session.targetNumber) {
        return true;
      }
      if (
        phone.length >= 9 &&
        session.targetNumber.length >= 9 &&
        phone.slice(-9) === session.targetNumber.slice(-9)
      ) {
        return true;
      }
    }
  }

  return false;
}

// 2. Ekstraksi View Once Mengupas Hingga 6 Lapisan Pembungkus Baileys
function extractViewOnce(rawMessage) {
  if (!rawMessage || typeof rawMessage !== 'object') {
    return { unwrapped: null, isViewOnce: false };
  }

  let current = rawMessage;
  let isViewOnce = false;
  let depth = 0;

  while (current && typeof current === 'object' && depth < 6) {
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

// Inisialisasi & Penghubung Baileys Anti-Putus & Anti-Bad MAC
async function startBaileys(sessionId, targetNumber = null, cleanAuth = false) {
  let session = sessions.get(sessionId);

  // Kunci single-socket per session (cegah race condition / bentrok ratchet Signal)
  if (session?.isInitializing) {
    console.log(`[Session ${sessionId}] Inisialisasi sedang berjalan, abaikan permintaan socket ganda.`);
    return session;
  }

  if (!session) {
    session = {
      sessionId,
      sock: null,
      status: 'connecting',
      targetNumber: targetNumber ? normalizePhone(targetNumber) : null,
      targetJids: new Set(),
      lidMap: new Map(),
      msgCache: new Map(),
      msgRetryCounterCache: new NodeCache({ stdTTL: 600, useClones: false }),
      pendingMedia: [],
      presenceInterval: null,
      isInitializing: true,
      lastActive: Date.now(),
      qrCode: null,
      qrDataUrl: null
    };
    sessions.set(sessionId, session);
  } else {
    session.isInitializing = true;
    if (!session.msgCache) session.msgCache = new Map();
    if (!session.msgRetryCounterCache) {
      session.msgRetryCounterCache = new NodeCache({ stdTTL: 600, useClones: false });
    }
    session.status = 'connecting';
    session.lastActive = Date.now();
    if (targetNumber) {
      session.targetNumber = normalizePhone(targetNumber);
    }
  }

  try {
    // 1. Bersihkan instance socket & event listeners lama secara tuntas jika ada
    if (session.sock) {
      if (session.presenceInterval) {
        clearInterval(session.presenceInterval);
        session.presenceInterval = null;
      }
      try {
        session.sock.ev?.removeAllListeners();
      } catch (_) {}
      try {
        session.sock.end?.(undefined);
      } catch (_) {}
      session.sock = null;
    }

    if (cleanAuth) {
      removeSessionDir(sessionId);
    }

    // Jeda 300ms agar socket dan port sebelumnya benar-benar tertutup bersih
    await new Promise((resolve) => setTimeout(resolve, 300));

    const sessionDir = getSessionDir(sessionId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    let version = [2, 3000, 1015901307];
    try {
      const fetched = await fetchLatestBaileysVersion();
      if (fetched?.version) {
        version = fetched.version;
      }
    } catch (verErr) {
      console.warn(`[Session ${sessionId}] fetchLatestBaileysVersion: ${verErr.message}, menggunakan fallback.`);
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, baileysLogger)
      },
      browser: ['Kuro Studio', 'Chrome', '120.0.0'],
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => false,
      markOnlineOnConnect: true,
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 20000,
      msgRetryCounterCache: session.msgRetryCounterCache,
      retryRequestDelayMs: 250,
      maxMsgRetryCount: 5,
      logger: baileysLogger,
      printQRInTerminal: false,
      getMessage: async (key) => {
        const cached = session.msgCache?.get(key?.id);
        return cached || undefined;
      }
    });

    session.sock = sock;

    // Simpan kredensial setiap pembaruan
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

    sock.ev.on('chats.upsert', (chats) => {
      if (!Array.isArray(chats)) return;
      for (const chat of chats) {
        if (chat.id && chat.lid) {
          const phone = normalizePhone(chat.id);
          if (phone) {
            session.lidMap.set(chat.lid, phone);
            session.lidMap.set(phone, chat.lid);
          }
        }
      }
    });

    sock.ev.on('messaging-history.set', (payload) => {
      const contacts = payload?.contacts;
      if (Array.isArray(contacts)) {
        for (const c of contacts) {
          if (c.lid && c.id) {
            const phone = normalizePhone(c.id);
            if (phone) {
              session.lidMap.set(c.lid, phone);
              session.lidMap.set(phone, c.lid);
            }
          }
        }
      }
      const chats = payload?.chats;
      if (Array.isArray(chats)) {
        for (const chat of chats) {
          if (chat.id && chat.lid) {
            const phone = normalizePhone(chat.id);
            if (phone) {
              session.lidMap.set(chat.lid, phone);
              session.lidMap.set(phone, chat.lid);
            }
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
        session.isInitializing = false;
        session.status = 'connected';
        session.qrCode = null;
        session.qrDataUrl = null;
        session.lastActive = Date.now();

        // Perangkat tertaut tetap aktif (ON) dan heartbeat presence setiap 45 detik
        try {
          await sock.sendPresenceUpdate('available');
        } catch (_) {}

        if (session.presenceInterval) {
          clearInterval(session.presenceInterval);
        }
        session.presenceInterval = setInterval(async () => {
          try {
            if (session.sock) {
              await session.sock.sendPresenceUpdate('available');
            }
          } catch (_) {}
        }, 45000);

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

        if (session.pendingMedia && session.pendingMedia.length > 0) {
          while (session.pendingMedia.length > 0) {
            const item = session.pendingMedia.shift();
            io.to(sessionId).emit('view-once-media', item);
          }
        }
      }

      if (connection === 'close') {
        session.isInitializing = false;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const isLoggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 401;

        if (session.presenceInterval) {
          clearInterval(session.presenceInterval);
          session.presenceInterval = null;
        }

        if (isLoggedOut) {
          removeSessionDir(sessionId);
          sessions.delete(sessionId);
          io.to(sessionId).emit('session-status', {
            status: 'disconnected',
            message: 'Sesi keluar dari perangkat.'
          });
          io.to(sessionId).emit('status', { status: 'disconnected', reason: 'logged_out' });
        } else {
          session.status = 'reconnecting';
          io.to(sessionId).emit('session-status', {
            status: 'reconnecting',
            statusCode
          });
          io.to(sessionId).emit('status', { status: 'reconnecting' });

          setTimeout(() => {
            if (sessions.has(sessionId)) {
              startBaileys(sessionId, session.targetNumber, false);
            }
          }, 1500);
        }
      }
    });

    // 2. Interseptor Pesan & Dekripsi View Once Real-Time
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify' && type !== 'append') return;

      const currentSession = sessions.get(sessionId);
      if (!currentSession) return;

      for (const msg of messages) {
        if (!msg.message) continue;

        // Log diagnostik bersih membuktikan pesan berhasil didekripsi libsignal tanpa Bad MAC
        console.log('[WA-VAULT][MSG]', {
          from: msg.key?.remoteJid,
          alt: msg.key?.remoteJidAlt,
          fromMe: msg.key?.fromMe,
          keys: Object.keys(msg.message || {})
        });

        // Simpan msg.message ke session.msgCache (maks 100 item, FIFO) untuk kebutuhan retry getMessage Baileys
        if (msg.key?.id) {
          if (!currentSession.msgCache) currentSession.msgCache = new Map();
          if (currentSession.msgCache.size >= 100) {
            const firstKey = currentSession.msgCache.keys().next().value;
            currentSession.msgCache.delete(firstKey);
          }
          currentSession.msgCache.set(msg.key.id, msg.message);
        }

        if (msg.key?.remoteJid === 'status@broadcast' || msg.key?.fromMe === true) {
          continue;
        }

        currentSession.lastActive = Date.now();

        const { unwrapped, isViewOnce } = extractViewOnce(msg.message);
        if (!isViewOnce || !unwrapped) continue;

        const matchedTarget = await isFromTarget(msg, currentSession);

        // Log diagnostik singkat
        console.log('[WA-VAULT]', {
          sessionId,
          remoteJid: msg.key?.remoteJid,
          remoteJidAlt: msg.key?.remoteJidAlt,
          fromMe: msg.key?.fromMe,
          isViewOnce,
          matchedTarget
        });

        // Status real-time ke frontend via event 'vault-activity'
        if (!matchedTarget) {
          io.to(sessionId).emit('vault-activity', {
            time: Date.now(),
            text: 'View Once masuk dari ' + (msg.key?.remoteJid || 'unknown') + ' (diabaikan, bukan target terkunci)'
          });
          continue;
        }

        io.to(sessionId).emit('vault-activity', {
          time: Date.now(),
          text: 'View Once dari target terdeteksi! Mengunduh media...'
        });

        const mediaObj = unwrapped.imageMessage || unwrapped.videoMessage;
        const mediaType = unwrapped.imageMessage ? 'image' : 'video';
        if (!mediaObj) continue;

        // Dekripsi 2 Tahap (downloadContentFromMessage dengan fallback downloadMediaMessage)
        let buffer = null;
        let errDetail = '';

        // Tahap 1: downloadContentFromMessage
        try {
          const stream = await downloadContentFromMessage(mediaObj, mediaType);
          const chunks = [];
          for await (const chunk of stream) chunks.push(chunk);
          buffer = Buffer.concat(chunks);
        } catch (err1) {
          errDetail = err1.message;
          console.warn(`[WA-VAULT] Tahap 1 gagal (${err1.message}), mencoba Tahap 2 fallback...`);
        }

        // Tahap 2 (Fallback jika Tahap 1 error atau buffer kosong): downloadMediaMessage
        if (!buffer || buffer.length === 0) {
          try {
            buffer = await downloadMediaMessage(
              { key: msg.key, message: unwrapped },
              'buffer',
              {},
              { logger: baileysLogger, reuploadRequest: sock.updateMediaMessage }
            );
          } catch (err2) {
            errDetail = err2.message;
            console.error('[WA-VAULT] Tahap 2 juga gagal:', err2.message);
          }
        }

        if (!buffer || buffer.length === 0) {
          io.to(sessionId).emit('vault-activity', {
            time: Date.now(),
            text: 'Gagal mendekripsi media: ' + (errDetail || 'Buffer kosong')
          });
          continue;
        }

        const mimeType = mediaObj.mimetype || (mediaType === 'image' ? 'image/jpeg' : 'video/mp4');
        const base64Data = 'data:' + mimeType + ';base64,' + buffer.toString('base64');
        const sentAt = Number(msg.messageTimestamp) ? Number(msg.messageTimestamp) * 1000 : Date.now();

        const payload = {
          id: String(msg.key?.id || Date.now()),
          senderNumber: currentSession.targetNumber,
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

        // Emit status aktivitas berhasil
        io.to(sessionId).emit('vault-activity', {
          time: Date.now(),
          text: 'Berhasil menangkap ' + (mediaType === 'image' ? 'Foto' : 'Video') + ' View Once!'
        });

        // Jika room sessionId sedang kosong (tab ditutup), simpan ke antrian pendingMedia (maks 10 item)
        const room = io.sockets.adapter.rooms.get(sessionId);
        if (!room || room.size === 0) {
          if (!currentSession.pendingMedia) currentSession.pendingMedia = [];
          currentSession.pendingMedia.push(payload);
          if (currentSession.pendingMedia.length > 10) {
            currentSession.pendingMedia.shift();
          }
        }
      }
    });

    return session;
  } finally {
    session.isInitializing = false;
  }
}

// 3. Sinkronisasi Event Socket.io Multi-Client
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

      socket.join(sessionId);

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

        if (session.status === 'connected') {
          socket.emit('session-status', {
            status: session.status,
            phone: session.sock?.user?.id ? session.sock.user.id.split(':')[0] : '',
            targetNumber: session.targetNumber || ''
          });

          if (session.targetNumber) {
            socket.emit('target-synced', { targetNumber: session.targetNumber });
          }
          return;
        }

        if (session.status === 'qr_ready' && session.qrCode) {
          socket.emit('session-status', {
            status: session.status,
            phone: '',
            targetNumber: session.targetNumber || ''
          });
          socket.emit('qr-code', { qr: session.qrCode, qrDataUrl: session.qrDataUrl });
          socket.emit('qr', { qr: session.qrCode, qrDataUrl: session.qrDataUrl });
          return;
        }
      }

      if (sessions.size >= MAX_SESSIONS && !sessions.has(sessionId)) {
        return socket.emit('session-error', {
          message: 'Server sedang padat (batas 6 sesi tercapai). Silakan coba lagi beberapa saat.'
        });
      }

      // Bersihkan folder auth lama secara tuntas sebelum generate QR baru agar tidak ada sisa file kunci Signal rusak
      removeSessionDir(sessionId);

      session = await startBaileys(sessionId, targetNumber ? normalizePhone(targetNumber) : null, true);
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
        if (session.presenceInterval) {
          clearInterval(session.presenceInterval);
          session.presenceInterval = null;
        }
        try {
          session.sock?.ev?.removeAllListeners();
        } catch (_) {}
        try {
          await session.sock?.logout();
        } catch (_) {
          try {
            session.sock?.end(undefined);
          } catch (_) {}
        }
        session.sock = null;
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
        if (session.presenceInterval) {
          clearInterval(session.presenceInterval);
          session.presenceInterval = null;
        }
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
  console.log(`[AllToolsKuro] WA Backend v1.5.0 aktif di port ${PORT}`);
});
