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
async function resolveJidToPhone(jid, session, msg = null) {
  if (!jid || typeof jid !== 'string') return null;
  const cleanJid = jid.trim();

  // a) Periksa properti nomor alternatif di msg.key jika tersedia (Baileys v7)
  if (msg?.key) {
    const altCandidate = msg.key.senderPn || msg.key.participantPn || msg.key.remoteJidAlt || msg.key.participantAlt;
    if (altCandidate) {
      const rawAlt = typeof altCandidate === 'string' ? altCandidate.split('@')[0].split(':')[0] : String(altCandidate);
      const phoneAlt = normalizePhone(rawAlt);
      if (phoneAlt && phoneAlt.length >= 8) {
        if (session?.lidMap) {
          session.lidMap.set(cleanJid, phoneAlt);
          session.lidMap.set(phoneAlt, cleanJid);
        }
        return phoneAlt;
      }
    }
  }

  // b) Jika jid berakhiran @s.whatsapp.net: ambil angka sebelum '@' dan ':', lalu normalisasi
  if (cleanJid.endsWith('@s.whatsapp.net') || (!cleanJid.includes('@lid') && cleanJid.includes('@'))) {
    const rawNumber = cleanJid.split('@')[0].split(':')[0];
    const phone = normalizePhone(rawNumber);
    if (phone) {
      if (session?.lidMap) session.lidMap.set(cleanJid, phone);
      return phone;
    }
  }

  // c) Jika jid berakhiran @lid
  if (cleanJid.endsWith('@lid') || cleanJid.includes('@lid')) {
    const lidId = cleanJid.split('@')[0].split(':')[0];

    // 1) Cek session.lidMap
    if (session?.lidMap?.has(cleanJid)) {
      return session.lidMap.get(cleanJid);
    }
    if (session?.lidMap?.has(lidId)) {
      return session.lidMap.get(lidId);
    }

    // 2) Cek langsung store internal Baileys via session.authKeys
    try {
      if (session?.authKeys?.get) {
        const reverseData = await session.authKeys.get('lid-mapping', [lidId + '_reverse']);
        const reverseVal = reverseData?.[lidId + '_reverse'] || reverseData?.[lidId];
        if (reverseVal) {
          const rawPN = typeof reverseVal === 'string' ? reverseVal.split('@')[0].split(':')[0] : String(reverseVal);
          const p = normalizePhone(rawPN);
          if (p) {
            session.lidMap?.set(cleanJid, p);
            session.lidMap?.set(p, cleanJid);
            return p;
          }
        }
      }
    } catch (_) {}

    // 3) Cek via signalRepository.lidMapping
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

    // 4) Cek sock.authState?.creds
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
  if (!session.confirmedTargetLids) session.confirmedTargetLids = new Set();
  if (!session.lidMap) session.lidMap = new Map();

  session.targetJids.clear();
  session.targetJids.add(session.targetNumber);
  session.targetJids.add(`${session.targetNumber}@s.whatsapp.net`);

  // Masukkan semua LID target yang telah dikonfirmasi pengguna
  for (const confirmedLid of session.confirmedTargetLids) {
    session.targetJids.add(confirmedLid);
    const lidDigits = confirmedLid.split('@')[0].split(':')[0];
    session.targetJids.add(lidDigits);
  }

  // Cek langsung key store Baileys untuk nomor target
  try {
    if (session.authKeys?.get) {
      const mapping = await session.authKeys.get('lid-mapping', [session.targetNumber]);
      const foundLid = mapping?.[session.targetNumber];
      if (foundLid) {
        const cleanFound = String(foundLid);
        session.targetJids.add(cleanFound);
        if (!cleanFound.includes('@')) {
          session.targetJids.add(`${cleanFound}@lid`);
        }
        session.lidMap.set(cleanFound, session.targetNumber);
        session.lidMap.set(session.targetNumber, cleanFound);
      }
    }
  } catch (_) {}

  if (session.sock) {
    try {
      const results = await session.sock.onWhatsApp(session.targetNumber);
      const res = Array.isArray(results) ? results[0] : results;
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
    msg.key?.senderPn,
    msg.key?.participant,
    msg.key?.participantAlt,
    msg.key?.participantPn
  ].filter(Boolean);

  for (const candidate of candidates) {
    // 1) Cocokkan langsung dengan confirmedTargetLids dan targetJids
    if (session.confirmedTargetLids && session.confirmedTargetLids.has(candidate)) {
      return true;
    }
    if (session.targetJids && session.targetJids.has(candidate)) {
      return true;
    }

    // 2) Resolusi JID/LID kandidat ke nomor HP murni
    const phone = await resolveJidToPhone(candidate, session, msg);
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

// 2. Detektor View Once Rekursif Mendalam (Anti-Lolos Semua Format WA)
function deepExtractViewOnce(obj, inheritedViewOnce = false, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 8) {
    return null;
  }

  if (obj.imageMessage && (inheritedViewOnce || obj.imageMessage.viewOnce === true)) {
    return {
      mediaType: 'image',
      mediaObj: obj.imageMessage,
      unwrappedMessage: { imageMessage: obj.imageMessage }
    };
  }

  if (obj.videoMessage && (inheritedViewOnce || obj.videoMessage.viewOnce === true)) {
    return {
      mediaType: 'video',
      mediaObj: obj.videoMessage,
      unwrappedMessage: { videoMessage: obj.videoMessage }
    };
  }

  const viewOnceWrappers = ['viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension'];
  for (const key of viewOnceWrappers) {
    if (obj[key]?.message) {
      const res = deepExtractViewOnce(obj[key].message, true, depth + 1);
      if (res) return res;
    }
  }

  const commonWrappers = [
    'ephemeralMessage',
    'deviceSentMessage',
    'editedMessage',
    'documentWithCaptionMessage',
    'associatedChildMessage',
    'message'
  ];
  for (const key of commonWrappers) {
    if (obj[key]?.message) {
      const res = deepExtractViewOnce(obj[key].message, inheritedViewOnce, depth + 1);
      if (res) return res;
    }
  }

  return null;
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
      confirmedTargetLids: new Set(),
      lidMap: new Map(),
      unmappedLidQueue: new Map(),
      msgCache: new Map(),
      msgRetryCounterCache: new NodeCache({ stdTTL: 600, useClones: false }),
      pendingMedia: [],
      presenceInterval: null,
      authKeys: null,
      isInitializing: true,
      lastActive: Date.now(),
      qrCode: null,
      qrDataUrl: null
    };
    sessions.set(sessionId, session);
  } else {
    session.isInitializing = true;
    if (!session.confirmedTargetLids) session.confirmedTargetLids = new Set();
    if (!session.unmappedLidQueue) session.unmappedLidQueue = new Map();
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
    session.authKeys = state.keys;

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

    sock.ev.on('lid-mapping.update', (update) => {
      if (!update) return;
      try {
        if (Array.isArray(update)) {
          for (const item of update) {
            if (item?.lid && item?.pn) {
              const p = normalizePhone(item.pn);
              if (p) {
                session.lidMap.set(item.lid, p);
                session.lidMap.set(p, item.lid);
              }
            }
          }
        } else if (typeof update === 'object') {
          if (update.lid && update.pn) {
            const p = normalizePhone(update.pn);
            if (p) {
              session.lidMap.set(update.lid, p);
              session.lidMap.set(p, update.lid);
            }
          } else {
            for (const [k, v] of Object.entries(update)) {
              if (typeof v === 'string') {
                const p = normalizePhone(v.includes('@') ? v.split('@')[0] : v);
                if (p) {
                  session.lidMap.set(k, p);
                  session.lidMap.set(p, k);
                }
              }
            }
          }
        }
      } catch (_) {}
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
        if (!msg.message && !msg.messageStubType) continue;

        const remoteJid = String(msg.key?.remoteJid || '');

        // 1. Langsung abaikan dan JANGAN log pesan dari grup, status, atau newsletter
        if (
          remoteJid.endsWith('@g.us') ||
          remoteJid === 'status@broadcast' ||
          remoteJid.endsWith('@newsletter')
        ) {
          continue;
        }

        // Cetak 1 baris log bersih untuk SEMUA pesan chat pribadi
        console.log('[WA-VAULT][PRIVATE]', {
          from: msg.key?.remoteJid,
          alt: msg.key?.remoteJidAlt || msg.key?.senderPn,
          fromMe: msg.key?.fromMe,
          pushName: msg.pushName,
          stub: msg.messageStubType,
          keys: Object.keys(msg.message || {})
        });

        // Simpan msg.message ke session.msgCache (maks 100 item, FIFO) untuk kebutuhan retry getMessage Baileys
        if (msg.key?.id && msg.message) {
          if (!currentSession.msgCache) currentSession.msgCache = new Map();
          if (currentSession.msgCache.size >= 100) {
            const firstKey = currentSession.msgCache.keys().next().value;
            currentSession.msgCache.delete(firstKey);
          }
          currentSession.msgCache.set(msg.key.id, msg.message);
        }

        currentSession.lastActive = Date.now();

        // Deteksi apakah pesan merupakan View Once (rekursif mendalam)
        const viewOnceData = deepExtractViewOnce(msg.message);

        // Jika pesan keluar (fromMe === true)
        if (msg.key?.fromMe === true) {
          if (viewOnceData || msg.message?.protocolMessage) {
            io.to(sessionId).emit('vault-activity', {
              time: Date.now(),
              text: 'Terdeteksi pesan View Once KELUAR (fromMe). Kirim dari HP target ke akun yang tertaut agar bisa ditangkap.'
            });
          }
          continue;
        }

        if (!viewOnceData) continue;

        const { mediaType, mediaObj, unwrappedMessage } = viewOnceData;
        const matched = await isFromTarget(msg, currentSession);

        // 4. Dekripsi View Once + Jaring Pengaman LID Belum Terpetakan
        if (matched) {
          io.to(sessionId).emit('vault-activity', {
            time: Date.now(),
            text: 'Media View Once dari target terdeteksi! Mendekripsi...'
          });

          let buffer = null;
          let errDetail = '';

          try {
            const stream = await downloadContentFromMessage(mediaObj, mediaType);
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            buffer = Buffer.concat(chunks);
          } catch (err1) {
            errDetail = err1.message;
            console.warn(`[WA-VAULT] Tahap 1 gagal (${err1.message}), mencoba Tahap 2 fallback...`);
          }

          if (!buffer || buffer.length === 0) {
            try {
              buffer = await downloadMediaMessage(
                { key: msg.key, message: unwrappedMessage },
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

          console.log(`[WA-VAULT Captured] ${mediaType.toUpperCase()} (${buffer.length} bytes) dari target +${currentSession.targetNumber}`);

          io.to(sessionId).emit('view-once-media', payload);
          io.to(sessionId).emit('vault-activity', {
            time: Date.now(),
            text: 'Berhasil menangkap ' + (mediaType === 'image' ? 'Foto' : 'Video') + ' View Once dari target!'
          });

          const room = io.sockets.adapter.rooms.get(sessionId);
          if (!room || room.size === 0) {
            if (!currentSession.pendingMedia) currentSession.pendingMedia = [];
            currentSession.pendingMedia.push(payload);
            if (currentSession.pendingMedia.length > 10) {
              currentSession.pendingMedia.shift();
            }
          }
        } else if (remoteJid.endsWith('@lid')) {
          // Matched false tapi pengirim berakhiran @lid (nomor disembunyikan WhatsApp)
          let buffer = null;
          try {
            const stream = await downloadContentFromMessage(mediaObj, mediaType);
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            buffer = Buffer.concat(chunks);
          } catch (_) {
            try {
              buffer = await downloadMediaMessage(
                { key: msg.key, message: unwrappedMessage },
                'buffer',
                {},
                { logger: baileysLogger, reuploadRequest: sock.updateMediaMessage }
              );
            } catch (_) {}
          }

          if (buffer && buffer.length > 0) {
            const mimeType = mediaObj.mimetype || (mediaType === 'image' ? 'image/jpeg' : 'video/mp4');
            const base64Data = 'data:' + mimeType + ';base64,' + buffer.toString('base64');
            const sentAt = Number(msg.messageTimestamp) ? Number(msg.messageTimestamp) * 1000 : Date.now();

            const unmappedPayload = {
              id: String(msg.key?.id || Date.now()),
              senderNumber: currentSession.targetNumber,
              senderName: String(msg.pushName || 'Kontak Tanpa Nama'),
              mediaType: String(mediaType),
              mimeType: String(mimeType),
              caption: String(mediaObj.caption || ''),
              sentAt: Number(sentAt),
              base64Data
            };

            if (!currentSession.unmappedLidQueue) currentSession.unmappedLidQueue = new Map();
            let list = currentSession.unmappedLidQueue.get(remoteJid) || [];
            list.push({ payload: unmappedPayload, createdAt: Date.now() });
            if (list.length > 5) list.shift();
            currentSession.unmappedLidQueue.set(remoteJid, list);

            setTimeout(() => {
              if (currentSession.unmappedLidQueue?.has(remoteJid)) {
                const items = currentSession.unmappedLidQueue.get(remoteJid) || [];
                const fresh = items.filter((it) => Date.now() - it.createdAt < 5 * 60 * 1000);
                if (fresh.length > 0) {
                  currentSession.unmappedLidQueue.set(remoteJid, fresh);
                } else {
                  currentSession.unmappedLidQueue.delete(remoteJid);
                }
              }
            }, 5 * 60 * 1000);

            io.to(sessionId).emit('unmapped-lid-view-once', {
              lid: remoteJid,
              pushName: String(msg.pushName || 'Kontak Tanpa Nama'),
              mediaType: String(mediaType),
              sentAt
            });

            io.to(sessionId).emit('vault-activity', {
              time: Date.now(),
              text: 'View Once masuk dari ID tersembunyi (' + (msg.pushName || remoteJid) + '). Konfirmasi jika itu nomor target Anda.'
            });
          }
        } else {
          // Matched false dan bukan @lid (nomor HP biasa @s.whatsapp.net yang bukan target)
          io.to(sessionId).emit('vault-activity', {
            time: Date.now(),
            text: 'View Once dari nomor lain (bukan target terkunci) diabaikan.'
          });
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
      const { sessionId, targetNumber, confirmedLids } = payload || {};
      if (!sessionId) return;

      socket.join(sessionId);

      let session = sessions.get(sessionId);

      if (session) {
        if (targetNumber) {
          const clean = normalizePhone(targetNumber);
          session.targetNumber = clean;
        }

        if (Array.isArray(confirmedLids)) {
          if (!session.confirmedTargetLids) session.confirmedTargetLids = new Set();
          for (const cl of confirmedLids) {
            if (cl) {
              const cleanL = String(cl).trim();
              session.confirmedTargetLids.add(cleanL);
              if (session.targetJids) {
                session.targetJids.add(cleanL);
                session.targetJids.add(cleanL.split('@')[0].split(':')[0]);
              }
              if (session.targetNumber && session.lidMap) {
                session.lidMap.set(cleanL, session.targetNumber);
              }
            }
          }
        }

        if (session.targetNumber) {
          await resolveTargetIdentifiers(session);
        }

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
        if (Array.isArray(confirmedLids) && session) {
          if (!session.confirmedTargetLids) session.confirmedTargetLids = new Set();
          for (const cl of confirmedLids) {
            if (cl) {
              const cleanL = String(cl).trim();
              session.confirmedTargetLids.add(cleanL);
              session.targetJids?.add(cleanL);
            }
          }
        }
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
      const { sessionId, targetNumber, confirmedLids } = payload || {};
      if (!sessionId) return;

      socket.join(sessionId);

      const session = sessions.get(sessionId);
      const clean = targetNumber ? normalizePhone(targetNumber) : null;

      if (session) {
        session.targetNumber = clean;
        session.lastActive = Date.now();

        if (Array.isArray(confirmedLids)) {
          if (!session.confirmedTargetLids) session.confirmedTargetLids = new Set();
          for (const cl of confirmedLids) {
            if (cl) {
              const cleanL = String(cl).trim();
              session.confirmedTargetLids.add(cleanL);
              if (session.targetJids) session.targetJids.add(cleanL);
            }
          }
        }

        await resolveTargetIdentifiers(session);
      }

      io.to(sessionId).emit('target-synced', { targetNumber: clean });
      io.to(sessionId).emit('target-updated', { targetNumber: clean });
    } catch (err) {
      console.error('Error set-target:', err.message);
      socket.emit('session-error', { message: 'Gagal memperbarui target: ' + err.message });
    }
  });

  // Event 'confirm-target-lid' (Jaring Pengaman 1-Klik untuk ID Tersembunyi)
  socket.on('confirm-target-lid', async (payload) => {
    try {
      const { sessionId, lid } = payload || {};
      if (!sessionId || !lid) return;

      const session = sessions.get(sessionId);
      if (!session) return;

      const cleanLid = String(lid).trim();
      if (!session.confirmedTargetLids) session.confirmedTargetLids = new Set();
      session.confirmedTargetLids.add(cleanLid);

      if (!session.targetJids) session.targetJids = new Set();
      session.targetJids.add(cleanLid);
      const lidDigits = cleanLid.split('@')[0].split(':')[0];
      session.targetJids.add(lidDigits);

      if (session.targetNumber) {
        if (!session.lidMap) session.lidMap = new Map();
        session.lidMap.set(cleanLid, session.targetNumber);
        session.lidMap.set(lidDigits, session.targetNumber);
        session.lidMap.set(session.targetNumber, cleanLid);
      }

      // Ambil semua media tertahan milik lid tersebut dari unmappedLidQueue dan buka langsung
      if (session.unmappedLidQueue?.has(cleanLid)) {
        const queuedList = session.unmappedLidQueue.get(cleanLid) || [];
        for (const item of queuedList) {
          const finalPayload = {
            ...item.payload,
            senderNumber: session.targetNumber || item.payload.senderNumber
          };
          io.to(sessionId).emit('view-once-media', finalPayload);
        }
        session.unmappedLidQueue.delete(cleanLid);
      }

      io.to(sessionId).emit('vault-activity', {
        time: Date.now(),
        text: 'ID target berhasil diikat permanen! Media View Once langsung dibuka.'
      });
    } catch (err) {
      console.error('Error confirm-target-lid:', err.message);
    }
  });

  // Event 'dismiss-unmapped-lid' (Abaikan media dari ID tersembunyi non-target)
  socket.on('dismiss-unmapped-lid', (payload) => {
    try {
      const { sessionId, lid } = payload || {};
      if (!sessionId || !lid) return;
      const session = sessions.get(sessionId);
      if (session?.unmappedLidQueue) {
        session.unmappedLidQueue.delete(String(lid).trim());
      }
      io.to(sessionId).emit('vault-activity', {
        time: Date.now(),
        text: 'Pesan dari ID tersembunyi diabaikan.'
      });
    } catch (err) {
      console.error('Error dismiss-unmapped-lid:', err.message);
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
