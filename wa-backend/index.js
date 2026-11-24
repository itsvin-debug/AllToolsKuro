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
const path = require('path');
const fs = require('fs');
const pino = require('pino');
const QRCode = require('qrcode');
const NodeCache = require('node-cache');

const baileysModule = require('@whiskeysockets/baileys');
const makeWASocket = baileysModule.default?.default || baileysModule.default || baileysModule;
const {
  useMultiFileAuthState,
  DisconnectReason,
  downloadContentFromMessage,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
  proto
} = baileysModule;

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 4000;
const FRONTEND_URL = process.env.FRONTEND_URL || '*';
const MAX_SESSIONS = 6;
const IDLE_TIMEOUT_MS = 60 * 60 * 1000; // 60 menit batas idle sesi

const pinoSilent = pino({ level: 'silent' });

// Cache versi WA Web memori global (TTL 6 jam) + fallback instan 3s
let cachedWaVersion = null;
let cachedWaVersionTime = 0;
const WA_VERSION_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 jam
const FALLBACK_WA_VERSION = [2, 3000, 1017531287];

async function getWaVersion() {
  if (cachedWaVersion && Date.now() - cachedWaVersionTime < WA_VERSION_CACHE_TTL) {
    return cachedWaVersion;
  }
  try {
    const fetchPromise = fetchLatestBaileysVersion();
    const fetched = await Promise.race([
      fetchPromise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('fetchLatestBaileysVersion timeout (3s)')), 3000)
      )
    ]);
    if (fetched?.version && Array.isArray(fetched.version)) {
      cachedWaVersion = fetched.version;
      cachedWaVersionTime = Date.now();
      return cachedWaVersion;
    }
  } catch (err) {
    console.warn(`[WA-VAULT] fetchLatestBaileysVersion gagal/timeout (${err.message}). Menggunakan versi fallback.`);
  }
  if (cachedWaVersion) return cachedWaVersion;
  return FALLBACK_WA_VERSION;
}

// Konfigurasi CORS super toleran agar pre-warm ping tidak pernah terblokir
app.use(
  cors({
    origin: (origin, callback) => {
      callback(null, true);
    },
    credentials: true
  })
);
app.use(express.json());

// Anti-Sleep Ping Endpoint untuk Render Free Tier (Pre-warm Super Cepat)
app.get('/ping', (req, res) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Access-Control-Allow-Origin': '*'
  });
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
    version: '1.7.0'
  });
});

// Socket.io Server (50 MB Max Payload & Heartbeat)
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      callback(null, true);
    },
    methods: ['GET', 'POST']
  },
  maxHttpBufferSize: 5e7, // 50 MB
  pingTimeout: 60000,
  pingInterval: 25000
});

// Map sesi aktif: sessionId -> session object
const sessions = new Map();

// Helper resolusi path folder auth
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

// Helper promise timeout
function withTimeout(promise, ms = 15000, errorMsg = 'Operation timed out') {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(errorMsg)), ms))
  ]);
}

// Helper konversi data ke Buffer bersih
function toCleanBuffer(data) {
  if (!data) return null;
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof Uint8Array) return Buffer.from(data);
  if (Array.isArray(data)) return Buffer.from(data);
  return null;
}

// Engine Dekripsi 3-Tier Multi-Fallback
async function downloadMediaStreamBuffer(mediaObj, mediaType, rawMsg = null, sock = null) {
  if (!mediaObj) return null;

  if (mediaObj.mediaKey && !Buffer.isBuffer(mediaObj.mediaKey)) {
    try {
      mediaObj.mediaKey = Buffer.from(mediaObj.mediaKey);
    } catch (_) {}
  }

  // Tier 1: downloadContentFromMessage stream
  try {
    const stream = await withTimeout(
      downloadContentFromMessage(mediaObj, mediaType),
      12000,
      'Tier 1 downloadContentFromMessage timeout'
    );
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const buf = Buffer.concat(chunks);
    if (buf && buf.length > 0) {
      return buf;
    }
  } catch (err1) {
    console.warn(`[WA-VAULT][DECRYPT] Tier 1 gagal (${err1.message}), beralih ke Tier 2...`);
  }

  // Tier 2: downloadMediaMessage langsung dari raw message
  if (rawMsg) {
    try {
      const buf2 = await withTimeout(
        downloadMediaMessage(
          rawMsg,
          'buffer',
          {},
          { logger: pinoSilent, reuploadRequest: sock?.updateMediaMessage }
        ),
        15000,
        'Tier 2 downloadMediaMessage timeout'
      );
      const cleanBuf2 = toCleanBuffer(buf2);
      if (cleanBuf2 && cleanBuf2.length > 0) {
        return cleanBuf2;
      }
    } catch (err2) {
      console.warn(`[WA-VAULT][DECRYPT] Tier 2 gagal (${err2.message}), beralih ke Tier 3...`);
    }
  }

  // Tier 3: Synthetic message wrapper fallback
  try {
    const syntheticKey = rawMsg?.key || { id: 'synthetic_' + Date.now(), remoteJid: 'status@broadcast', fromMe: false };
    const syntheticMsg = {
      key: syntheticKey,
      message: {
        [`${mediaType}Message`]: mediaObj
      }
    };
    const buf3 = await withTimeout(
      downloadMediaMessage(
        syntheticMsg,
        'buffer',
        {},
        { logger: pinoSilent, reuploadRequest: sock?.updateMediaMessage }
      ),
      15000,
      'Tier 3 synthetic downloadMediaMessage timeout'
    );
    const cleanBuf3 = toCleanBuffer(buf3);
    if (cleanBuf3 && cleanBuf3.length > 0) {
      return cleanBuf3;
    }
  } catch (err3) {
    console.error(`[WA-VAULT][DECRYPT] Tier 3 juga gagal:`, err3.message);
  }

  return null;
}

// Resolusi 2 Arah @lid <-> Nomor HP
async function resolveJidToPhone(jid, session, msg = null) {
  if (!jid || typeof jid !== 'string') return null;
  const cleanJid = jid.trim();

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

  if (cleanJid.endsWith('@s.whatsapp.net') || (!cleanJid.includes('@lid') && cleanJid.includes('@'))) {
    const rawNumber = cleanJid.split('@')[0].split(':')[0];
    const phone = normalizePhone(rawNumber);
    if (phone) {
      if (session?.lidMap) session.lidMap.set(cleanJid, phone);
      return phone;
    }
  }

  if (cleanJid.endsWith('@lid') || cleanJid.includes('@lid')) {
    const lidId = cleanJid.split('@')[0].split(':')[0];

    if (session?.lidMap?.has(cleanJid)) {
      return session.lidMap.get(cleanJid);
    }
    if (session?.lidMap?.has(lidId)) {
      return session.lidMap.get(lidId);
    }

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

  const fallbackDigits = normalizePhone(cleanJid);
  if (fallbackDigits && fallbackDigits.length >= 8) {
    return fallbackDigits;
  }

  return null;
}

// Pemetaan Identifiers Target (@lid dan JID WhatsApp)
async function resolveTargetIdentifiers(session) {
  if (!session || !session.targetNumber) return;
  if (!session.targetJids) session.targetJids = new Set();
  if (!session.confirmedTargetLids) session.confirmedTargetLids = new Set();
  if (!session.lidMap) session.lidMap = new Map();

  session.targetJids.clear();
  session.targetJids.add(session.targetNumber);
  session.targetJids.add(`${session.targetNumber}@s.whatsapp.net`);

  for (const confirmedLid of session.confirmedTargetLids) {
    session.targetJids.add(confirmedLid);
    const lidDigits = confirmedLid.split('@')[0].split(':')[0];
    session.targetJids.add(lidDigits);
  }

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

// Passive LID Learning
function learnLidPair(key, session) {
  if (!key || !session) return;
  const jids = [
    key.remoteJid,
    key.remoteJidAlt,
    key.senderPn,
    key.participant,
    key.participantAlt,
    key.participantPn
  ].filter((j) => typeof j === 'string' && j.includes('@'));

  let lidCandidate = null;
  let pnCandidate = null;

  for (const jid of jids) {
    if (jid.endsWith('@lid') || jid.includes('@lid')) {
      if (!lidCandidate) lidCandidate = jid;
    } else if (
      jid.endsWith('@s.whatsapp.net') ||
      (!jid.includes('@lid') && !jid.endsWith('@g.us') && jid !== 'status@broadcast')
    ) {
      if (!pnCandidate) pnCandidate = jid;
    }
  }

  if (lidCandidate && pnCandidate) {
    const rawNumber = pnCandidate.split('@')[0].split(':')[0];
    const phone = normalizePhone(rawNumber);
    if (phone && phone.length >= 8) {
      if (!session.lidMap) session.lidMap = new Map();
      const lidId = lidCandidate.split('@')[0].split(':')[0];
      session.lidMap.set(lidCandidate, phone);
      session.lidMap.set(lidId, phone);
      session.lidMap.set(phone, lidCandidate);

      if (session.targetNumber) {
        const matchesTarget =
          phone === session.targetNumber ||
          (phone.length >= 9 &&
            session.targetNumber.length >= 9 &&
            phone.slice(-9) === session.targetNumber.slice(-9));

        if (matchesTarget) {
          if (!session.targetJids) session.targetJids = new Set();
          session.targetJids.add(lidCandidate);
          session.targetJids.add(lidId);
          session.targetJids.add(`${lidId}@lid`);

          if (!session.confirmedTargetLids) session.confirmedTargetLids = new Set();
          session.confirmedTargetLids.add(lidCandidate);
          session.confirmedTargetLids.add(lidId);
          console.log(`[WA-VAULT][PASSIVE-LID-LEARNED] Target LID otomatis terikat: ${lidCandidate} <-> +${session.targetNumber}`);
        }
      }
    }
  }
}

// Pencocokan Pengirim Pesan Terhadap Target Terkunci
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
    if (session.confirmedTargetLids && session.confirmedTargetLids.has(candidate)) {
      return true;
    }
    if (session.targetJids && session.targetJids.has(candidate)) {
      return true;
    }

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

// Detektor View Once Rekursif Mendalam
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

  if (obj.audioMessage && (inheritedViewOnce || obj.audioMessage.viewOnce === true)) {
    return {
      mediaType: 'audio',
      mediaObj: obj.audioMessage,
      unwrappedMessage: { audioMessage: obj.audioMessage }
    };
  }

  const viewOnceWrappers = ['viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension'];
  for (const key of viewOnceWrappers) {
    if (obj[key]?.message) {
      const res = deepExtractViewOnce(obj[key].message, true, depth + 1);
      if (res) return res;
    } else if (obj[key] && typeof obj[key] === 'object') {
      const res = deepExtractViewOnce(obj[key], true, depth + 1);
      if (res) return res;
    }
  }

  const commonWrappers = [
    'ephemeralMessage',
    'deviceSentMessage',
    'editedMessage',
    'documentWithCaptionMessage',
    'associatedChildMessage',
    'futureProofMessage',
    'message'
  ];
  for (const key of commonWrappers) {
    if (obj[key]?.message) {
      const res = deepExtractViewOnce(obj[key].message, inheritedViewOnce, depth + 1);
      if (res) return res;
    } else if (obj[key] && typeof obj[key] === 'object' && key !== 'message') {
      const res = deepExtractViewOnce(obj[key], inheritedViewOnce, depth + 1);
      if (res) return res;
    }
  }

  return null;
}

// Inisialisasi & Penghubung Baileys 6.7.24 (QR Instan & Anti-Deadlock)
async function startBaileys(
  sessionId,
  targetNumber = null,
  cleanAuth = false,
  authMethod = 'pairing',
  pairingPhone = '',
  forceNew = false
) {
  let session = sessions.get(sessionId);
  const now = Date.now();
  const isStuckInitializing = session?.isInitializing && now - (session.initStartTime || 0) > 8000;

  if (session?.isInitializing && !isStuckInitializing && !forceNew) {
    console.log(`[Session ${sessionId}] Inisialisasi sedang berjalan, abaikan permintaan socket ganda.`);
    return session;
  }

  if (!session) {
    session = {
      sessionId,
      sock: null,
      status: 'connecting',
      authMethod: authMethod || 'pairing',
      pairingPhone: pairingPhone ? normalizePhone(pairingPhone) : '',
      pairingCode: null,
      pairingCodeRequested: false,
      targetNumber: targetNumber ? normalizePhone(targetNumber) : null,
      targetJids: new Set(),
      confirmedTargetLids: new Set(),
      lidMap: new Map(),
      unmappedLidQueue: new Map(),
      pendingUnavailableIds: new Set(),
      msgCache: new Map(),
      msgRetryCounterCache: new NodeCache({ stdTTL: 600, useClones: false }),
      viewOnceStore: new Map(),
      latestTargetViewOnceId: null,
      pendingMedia: [],
      presenceInterval: null,
      authKeys: null,
      isInitializing: true,
      initStartTime: now,
      lastActive: now,
      qrCode: null,
      qrDataUrl: null
    };
    sessions.set(sessionId, session);
  } else {
    session.isInitializing = true;
    session.initStartTime = now;
    session.authMethod = authMethod || session.authMethod || 'pairing';
    if (pairingPhone) session.pairingPhone = normalizePhone(pairingPhone);
    session.pairingCode = null;
    session.pairingCodeRequested = false;
    if (!session.confirmedTargetLids) session.confirmedTargetLids = new Set();
    if (!session.unmappedLidQueue) session.unmappedLidQueue = new Map();
    if (!session.pendingUnavailableIds) session.pendingUnavailableIds = new Set();
    if (!session.msgCache) session.msgCache = new Map();
    if (!session.viewOnceStore) session.viewOnceStore = new Map();
    if (!session.msgRetryCounterCache) {
      session.msgRetryCounterCache = new NodeCache({ stdTTL: 600, useClones: false });
    }
    session.status = authMethod === 'qr' ? 'generating_qr' : 'connecting';
    session.lastActive = now;
    if (targetNumber) {
      session.targetNumber = normalizePhone(targetNumber);
    }
  }

  try {
    const hadActiveSocket = Boolean(session.sock);
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

    // Jeda minimal: 100ms jika ada socket lama yang perlu ditutup, 0ms jika socket baru
    if (hadActiveSocket) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const sessionDir = getSessionDir(sessionId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    // Ambil versi WA Web dari cache instan (atau max 3 detik)
    const version = await getWaVersion();

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    session.authKeys = state.keys;

    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pinoSilent)
      },
      browser: Browsers.ubuntu('Chrome'),
      syncFullHistory: false,
      shouldIgnoreJid: (jid) => {
        if (!jid) return true;
        return jid.endsWith('@g.us') || jid === 'status@broadcast' || jid.endsWith('@newsletter');
      },
      markOnlineOnConnect: true,
      connectTimeoutMs: 120000,
      keepAliveIntervalMs: 25000,
      defaultQueryTimeoutMs: 60000,
      msgRetryCounterCache: session.msgRetryCounterCache,
      retryRequestDelayMs: 250,
      maxMsgRetryCount: 5,
      logger: pinoSilent,
      printQRInTerminal: false,
      getMessage: async (key) => {
        const cached = session.msgCache?.get(key?.id);
        if (cached) return cached;
        return proto?.Message?.fromObject ? proto.Message.fromObject({}) : undefined;
      }
    });

    session.sock = sock;

    sock.ev.on('creds.update', saveCreds);

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

    // Handler connection.update (QR Cepat & Handshake Sesi)
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // 1. Tangani Mode Pairing Code
      if (
        !sock.authState.creds.registered &&
        session.authMethod === 'pairing' &&
        session.pairingPhone &&
        !session.pairingCodeRequested
      ) {
        session.pairingCodeRequested = true;
        setTimeout(async () => {
          try {
            if (session.sock && !session.sock.authState.creds.registered) {
              const code = await session.sock.requestPairingCode(session.pairingPhone);
              session.pairingCode = code;
              session.status = 'pairing_ready';
              session.isInitializing = false;
              session.lastActive = Date.now();
              io.to(sessionId).emit('pairing-code', { code });
              io.to(sessionId).emit('session-status', { status: 'pairing_ready', code });
              console.log(`[WA-VAULT][PAIRING-CODE] Sesi ${sessionId} kode pairing: ${code}`);
            }
          } catch (err) {
            console.error(`[WA-VAULT][PAIRING-CODE-ERR] Sesi ${sessionId}:`, err.message);
            session.pairingCodeRequested = false;
            session.isInitializing = false;
            io.to(sessionId).emit('session-error', { message: 'Gagal membuat kode pairing: ' + err.message });
          }
        }, 2000);
      }

      // 2. Tangani Mode QR Code Instan (1-2 Detik)
      if (qr && session.authMethod !== 'pairing') {
        session.qrCode = qr;
        session.status = 'qr_ready';
        session.isInitializing = false;
        session.lastActive = Date.now();
        console.log('[WA-VAULT] QR Code diterbitkan untuk sesi:', sessionId);

        try {
          const qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 260, errorCorrectionLevel: 'M' });
          session.qrDataUrl = qrDataUrl;
          io.to(sessionId).emit('qr-code', { qr, qrDataUrl });
          io.to(sessionId).emit('qr', { qr, qrDataUrl });
          io.to(sessionId).emit('session-status', { status: 'qr_ready', qr, qrDataUrl });
        } catch (_) {
          io.to(sessionId).emit('qr-code', { qr });
          io.to(sessionId).emit('qr', { qr });
          io.to(sessionId).emit('session-status', { status: 'qr_ready', qr });
        }
      }

      // 3. Status Terhubung (Open)
      if (connection === 'open') {
        session.isInitializing = false;
        session.status = 'connected';
        session.qrCode = null;
        session.qrDataUrl = null;
        session.pairingCode = null;
        session.pairingCodeRequested = false;
        session.lastActive = Date.now();

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
        }, 35000);

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

      // 4. Status Terputus (Close)
      if (connection === 'close') {
        session.isInitializing = false;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const isRestartRequired = statusCode === 515 || statusCode === DisconnectReason.restartRequired;
        const wasRegistered = Boolean(sock.authState?.creds?.registered);
        const isLoggedOut = (statusCode === DisconnectReason.loggedOut || statusCode === 401) && wasRegistered;

        if (session.presenceInterval) {
          clearInterval(session.presenceInterval);
          session.presenceInterval = null;
        }

        if (isRestartRequired) {
          console.log(`[Session ${sessionId}] Handshake restart required (code 515). Reconnecting in 300ms without auth wipe...`);
          session.status = 'connecting';
          io.to(sessionId).emit('session-status', { status: 'connecting' });
          setTimeout(() => {
            if (sessions.has(sessionId)) {
              startBaileys(sessionId, session.targetNumber, false, session.authMethod, session.pairingPhone, false);
            }
          }, 300);
        } else if (isLoggedOut) {
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
              startBaileys(sessionId, session.targetNumber, false, session.authMethod, session.pairingPhone, false);
            }
          }, 1500);
        }
      }
    });

    // Interseptor Pesan & Dekripsi View Once Real-Time
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify' && type !== 'append') return;

      const currentSession = sessions.get(sessionId);
      if (!currentSession) return;

      for (const msg of messages) {
        if (!msg || !msg.key) continue;

        const remoteJid = String(msg.key?.remoteJid || '');
        if (
          remoteJid.endsWith('@g.us') ||
          remoteJid === 'status@broadcast' ||
          remoteJid.endsWith('@newsletter')
        ) {
          continue;
        }

        learnLidPair(msg.key, currentSession);

        if (msg.key?.id && msg.message) {
          if (!currentSession.msgCache) currentSession.msgCache = new Map();
          if (currentSession.msgCache.size >= 100) {
            const firstKey = currentSession.msgCache.keys().next().value;
            currentSession.msgCache.delete(firstKey);
          }
          currentSession.msgCache.set(msg.key.id, msg.message);
        }

        currentSession.lastActive = Date.now();
        const matched = await isFromTarget(msg, currentSession);
        const voCheck = deepExtractViewOnce(msg.message);

        if (matched) {
          console.log('[WA-VAULT][INCOMING]', {
            from: msg.key?.remoteJid,
            alt: msg.key?.remoteJidAlt || msg.key?.senderPn,
            fromMe: Boolean(msg.key?.fromMe),
            hasMessage: Boolean(msg.message),
            keys: Object.keys(msg.message || {}),
            isViewOnce: Boolean(voCheck),
            hasMediaKey: Boolean(voCheck?.mediaObj?.mediaKey),
            hasUrlOrPath: Boolean(voCheck?.mediaObj?.directPath || voCheck?.mediaObj?.url)
          });
        }

        if (!msg.message) {
          if (matched && msg.key?.fromMe === false) {
            io.to(sessionId).emit('vault-activity', {
              time: Date.now(),
              text: 'Media sekali lihat dari target masuk (status unavailable). Meminta salinan dekripsi dari HP utama...'
            });

            try {
              if (typeof sock?.requestPlaceholderResend === 'function') {
                await sock.requestPlaceholderResend(msg.key);
              }
            } catch (err) {
              console.log('[WA-VAULT][RESEND-ERR]', err.message);
            }
          }
          continue;
        }

        // Quoted Reply Bypass (fromMe: true)
        if (msg.key?.fromMe === true) {
          const innerMsg =
            msg.message?.ephemeralMessage?.message ||
            msg.message?.viewOnceMessage?.message ||
            msg.message;
          const ctx =
            innerMsg?.extendedTextMessage?.contextInfo ||
            innerMsg?.imageMessage?.contextInfo ||
            innerMsg?.videoMessage?.contextInfo ||
            innerMsg?.stickerMessage?.contextInfo ||
            innerMsg?.reactionMessage?.contextInfo ||
            null;

          if (ctx?.quotedMessage && matched) {
            const targetStanzaId = ctx.stanzaId || currentSession.latestTargetViewOnceId;
            if (targetStanzaId && currentSession.viewOnceStore?.has(targetStanzaId)) {
              const storedItem = currentSession.viewOnceStore.get(targetStanzaId);
              io.to(sessionId).emit('view-once-media', storedItem);
              io.to(sessionId).emit('vault-activity', {
                time: Date.now(),
                text: 'Berhasil mengambil View Once dari memory store via balasan!'
              });
              continue;
            }

            let quotedVO = deepExtractViewOnce(ctx.quotedMessage);
            if (!quotedVO) {
              if (ctx.quotedMessage?.imageMessage) {
                quotedVO = {
                  mediaType: 'image',
                  mediaObj: ctx.quotedMessage.imageMessage,
                  unwrappedMessage: { imageMessage: ctx.quotedMessage.imageMessage }
                };
              } else if (ctx.quotedMessage?.videoMessage) {
                quotedVO = {
                  mediaType: 'video',
                  mediaObj: ctx.quotedMessage.videoMessage,
                  unwrappedMessage: { videoMessage: ctx.quotedMessage.videoMessage }
                };
              }
            }

            if (quotedVO) {
              io.to(sessionId).emit('vault-activity', {
                time: Date.now(),
                text: 'Terdeteksi balasan (reply) pesan View Once target! Mendekripsi via Reply Bypass...'
              });

              const rawQuotedMsg = {
                key: {
                  remoteJid,
                  id: ctx.stanzaId || msg.key?.id,
                  fromMe: false
                },
                message: quotedVO.unwrappedMessage
              };

              const buffer = await downloadMediaStreamBuffer(quotedVO.mediaObj, quotedVO.mediaType, rawQuotedMsg, sock);

              if (buffer && buffer.length > 0) {
                const mimeType = quotedVO.mediaObj.mimetype || (quotedVO.mediaType === 'image' ? 'image/jpeg' : 'video/mp4');
                const base64Data = 'data:' + mimeType + ';base64,' + buffer.toString('base64');
                const sentAt = Number(msg.messageTimestamp) ? Number(msg.messageTimestamp) * 1000 : Date.now();

                const payload = {
                  id: String(ctx.stanzaId || msg.key?.id || Date.now()),
                  senderNumber: currentSession.targetNumber,
                  senderName: String(currentSession.targetNumber ? '+' + currentSession.targetNumber : 'Target'),
                  mediaType: String(quotedVO.mediaType),
                  mimeType: String(mimeType),
                  caption: String(quotedVO.mediaObj.caption || ''),
                  sentAt: Number(sentAt),
                  base64Data
                };

                if (!currentSession.viewOnceStore) currentSession.viewOnceStore = new Map();
                if (currentSession.viewOnceStore.size >= 50) {
                  const firstKey = currentSession.viewOnceStore.keys().next().value;
                  currentSession.viewOnceStore.delete(firstKey);
                }
                currentSession.viewOnceStore.set(payload.id, payload);
                currentSession.latestTargetViewOnceId = payload.id;

                console.log(`[WA-VAULT Captured via Reply Bypass] ${quotedVO.mediaType.toUpperCase()} (${buffer.length} bytes) dari target +${currentSession.targetNumber}`);

                io.to(sessionId).emit('view-once-media', payload);
                io.to(sessionId).emit('vault-activity', {
                  time: Date.now(),
                  text: 'Berhasil membuka View Once via jalur Reply Bypass!'
                });
              } else {
                io.to(sessionId).emit('vault-activity', {
                  time: Date.now(),
                  text: 'Gagal mendekripsi media reply bypass: Buffer kosong'
                });
              }
            }
          }
          continue;
        }

        // Tangkap otomatis pesan masuk View Once (fromMe: false)
        if (voCheck) {
          const { mediaType, mediaObj, unwrappedMessage } = voCheck;

          if (matched) {
            io.to(sessionId).emit('vault-activity', {
              time: Date.now(),
              text: 'Media View Once dari target terdeteksi! Mendekripsi...'
            });

            const buffer = await downloadMediaStreamBuffer(
              mediaObj,
              mediaType,
              { key: msg.key, message: unwrappedMessage },
              sock
            );

            if (buffer && buffer.length > 0) {
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

              if (!currentSession.viewOnceStore) currentSession.viewOnceStore = new Map();
              if (currentSession.viewOnceStore.size >= 50) {
                const firstKey = currentSession.viewOnceStore.keys().next().value;
                currentSession.viewOnceStore.delete(firstKey);
              }
              currentSession.viewOnceStore.set(payload.id, payload);
              currentSession.latestTargetViewOnceId = payload.id;

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
            } else {
              io.to(sessionId).emit('vault-activity', {
                time: Date.now(),
                text: 'Gagal mendekripsi media View Once: Buffer kosong'
              });
            }
          } else if (remoteJid.endsWith('@lid')) {
            const buffer = await downloadMediaStreamBuffer(
              mediaObj,
              mediaType,
              { key: msg.key, message: unwrappedMessage },
              sock
            );

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
          }
        }
      }
    });

    return session;
  } finally {
    session.isInitializing = false;
  }
}

// Socket.io Event Handling
io.on('connection', (socket) => {
  // Event 'resume-session' (Auto-Resume saat Klien Terhubung)
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
        } else if (session.status === 'pairing_ready' && session.pairingCode) {
          socket.emit('pairing-code', { code: session.pairingCode });
          socket.emit('session-status', { status: 'pairing_ready', code: session.pairingCode });
        } else if (session.status === 'qr_ready' && session.qrCode) {
          socket.emit('session-status', { status: 'qr_ready', targetNumber: session.targetNumber || '' });
          socket.emit('qr-code', { qr: session.qrCode, qrDataUrl: session.qrDataUrl });
          socket.emit('qr', { qr: session.qrCode, qrDataUrl: session.qrDataUrl });
        } else {
          socket.emit('session-status', { status: session.status, targetNumber: session.targetNumber || '' });
        }
        return;
      }

      // Periksa creds di disk jika belum di memori
      const sessionDir = getSessionDir(sessionId);
      const credsFile = path.join(sessionDir, 'creds.json');
      if (fs.existsSync(credsFile)) {
        session = await startBaileys(sessionId, targetNumber ? normalizePhone(targetNumber) : null, false);
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

  // Event 'confirm-target-lid' (Ikat @lid kontak WhatsApp tersembunyi)
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

  // Event 'dismiss-unmapped-lid'
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

  // Event 'start-session' (Mendukung authMethod: 'pairing' | 'qr' & forceNew)
  socket.on('start-session', async (payload) => {
    try {
      const { sessionId, targetNumber, authMethod = 'pairing', pairingPhone = '', forceNew = false } = payload || {};
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

        // Jika QR Code sudah siap dan tidak dipaksa baru, kirim instan (0ms)!
        if (authMethod === 'qr' && session.status === 'qr_ready' && session.qrCode && !forceNew) {
          socket.emit('session-status', {
            status: 'qr_ready',
            phone: '',
            targetNumber: session.targetNumber || ''
          });
          socket.emit('qr-code', { qr: session.qrCode, qrDataUrl: session.qrDataUrl });
          socket.emit('qr', { qr: session.qrCode, qrDataUrl: session.qrDataUrl });
          return;
        }

        // Jika Pairing Code sudah siap dan tidak dipaksa baru
        if (authMethod === 'pairing' && session.status === 'pairing_ready' && session.pairingCode && !forceNew) {
          socket.emit('pairing-code', { code: session.pairingCode });
          socket.emit('session-status', { status: 'pairing_ready', code: session.pairingCode });
          return;
        }
      }

      if (sessions.size >= MAX_SESSIONS && !sessions.has(sessionId)) {
        return socket.emit('session-error', {
          message: 'Server sedang padat (batas 6 sesi tercapai). Silakan coba lagi beberapa saat.'
        });
      }

      // Beritahu frontend seketika bahwa proses pembuatan QR/Pairing dimulai
      if (authMethod === 'qr') {
        socket.emit('session-status', { status: 'generating_qr', targetNumber: session?.targetNumber || targetNumber || '' });
      }

      // Bersihkan folder auth lama jika meminta penautan ulang / forceNew
      removeSessionDir(sessionId);

      session = await startBaileys(
        sessionId,
        targetNumber ? normalizePhone(targetNumber) : null,
        true,
        authMethod,
        pairingPhone,
        Boolean(forceNew)
      );

      socket.emit('session-status', { status: session.status, targetNumber: session.targetNumber });
      if (session.targetNumber) {
        socket.emit('target-synced', { targetNumber: session.targetNumber });
      }
    } catch (err) {
      console.error('Error start-session:', err.message);
      socket.emit('session-error', { message: 'Gagal menginisialisasi WhatsApp: ' + err.message });
    }
  });

  // Event 'logout-session'
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
  console.log(`[AllToolsKuro] WA Backend v1.7.0 aktif di port ${PORT}`);
});
