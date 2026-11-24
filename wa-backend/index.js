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
const MAX_ACTIVE_SESSIONS = 10;
const IDLE_TIMEOUT_MS = 45 * 60 * 1000; // 45 menit batas idle sesi terhubung tanpa klien

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

// Konfigurasi CORS super toleran
app.use(
  cors({
    origin: (origin, callback) => {
      callback(null, true);
    },
    credentials: true
  })
);
app.use(express.json());

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

// Auto-Janitor Startup: Bersihkan folder auth kedaluwarsa atau tanpa creds.json
function cleanupOrphanedAuthDirs() {
  const dirs = [__dirname, path.join(__dirname, 'sessions')];
  const now = Date.now();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  for (const baseDir of dirs) {
    if (!fs.existsSync(baseDir)) continue;
    try {
      const entries = fs.readdirSync(baseDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const name = entry.name;
        if (name.startsWith('auth_info_') || name.startsWith('auth_sessions_') || baseDir.endsWith('sessions')) {
          const fullPath = path.join(baseDir, name);
          try {
            const stat = fs.statSync(fullPath);
            const credsFile = path.join(fullPath, 'creds.json');
            const hasCreds = fs.existsSync(credsFile);

            const isOld = now - stat.mtimeMs > ONE_DAY_MS;
            const cleanId = name.replace(/^auth_info_|^auth_sessions_/, '');
            const isActive = sessions.has(cleanId) && sessions.get(cleanId)?.status === 'connected';

            if ((!hasCreds || isOld) && !isActive) {
              fs.rmSync(fullPath, { recursive: true, force: true });
              console.log(`[WA-JANITOR] Folder auth kedaluwarsa dibersihkan: ${name}`);
            }
          } catch (_) {}
        }
      }
    } catch (_) {}
  }
}
cleanupOrphanedAuthDirs();

// Global Download Queue Lintas Semua Sesi (Maks 2 Unduhan Bersamaan, Maks 1 per Sesi)
class GlobalMediaDownloadQueue {
  constructor(maxConcurrent = 2, maxQueueSize = 30) {
    this.maxConcurrent = maxConcurrent;
    this.maxQueueSize = maxQueueSize;
    this.queue = [];
    this.activeCount = 0;
    this.sessionActiveCounts = new Map();
  }

  push(taskFn, sessionId = 'global') {
    if (this.queue.length >= this.maxQueueSize) {
      this.queue.shift(); // Buang tugas terlama jika antrean penuh
    }
    this.queue.push({ taskFn, sessionId });
    this.runNext();
  }

  async runNext() {
    if (this.activeCount >= this.maxConcurrent || this.queue.length === 0) return;

    // Cari tugas berikutnya yang sesinya belum mencapai batas per-sesi (1)
    const taskIndex = this.queue.findIndex(t => (this.sessionActiveCounts.get(t.sessionId) || 0) < 1);
    if (taskIndex === -1) return;

    const [item] = this.queue.splice(taskIndex, 1);
    const { taskFn, sessionId } = item;

    this.activeCount++;
    this.sessionActiveCounts.set(sessionId, (this.sessionActiveCounts.get(sessionId) || 0) + 1);

    try {
      await taskFn();
    } catch (err) {
      console.warn('[GlobalDownloadQueue] Error eksekusi unduhan:', err.message);
    } finally {
      this.activeCount--;
      const cur = (this.sessionActiveCounts.get(sessionId) || 1) - 1;
      if (cur <= 0) {
        this.sessionActiveCounts.delete(sessionId);
      } else {
        this.sessionActiveCounts.set(sessionId, cur);
      }
      this.runNext();
    }
  }
}

const globalMediaDownloadQueue = new GlobalMediaDownloadQueue(2, 30);

// Anti-Sleep Ping Endpoint untuk Render Free Tier (Pre-warm Super Cepat & Monitor RAM Multi-User)
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

// Helper konversi ARGB 32-bit int ke format hex '#RRGGBB'
function argbToHex(argb) {
  if (argb === null || argb === undefined) return '#1e293b';
  const num = Number(argb);
  if (isNaN(num)) return '#1e293b';
  const hex = (num >>> 0).toString(16).padStart(8, '0');
  return '#' + hex.slice(2);
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

// Schema Payload Seragam 100% Primitif (Anti React Error #31)
function buildVaultPayload({
  id,
  category = 'chat', // 'chat' | 'status'
  senderNumber = '',
  senderName = '',
  mediaType = 'text', // 'text' | 'image' | 'video' | 'audio' | 'sticker' | 'document'
  mimeType = '',
  textContent = '',
  caption = '',
  bgColor = '',
  fileName = '',
  fileSize = 0,
  durationSec = 0,
  isVoiceNote = false,
  isViewOnce = false,
  isDeleted = false,
  deletedAt = null,
  isEdited = false,
  editedText = '',
  editedAt = null,
  sentAt = Date.now(),
  base64Data = '',
  thumbnailBase64 = '',
  needsOnDemandLoad = false
}) {
  return {
    id: String(id || Date.now()),
    category: category === 'status' ? 'status' : 'chat',
    senderNumber: String(senderNumber || ''),
    senderName: String(senderName || ''),
    mediaType: String(mediaType || 'text'),
    mimeType: String(mimeType || ''),
    textContent: String(textContent || ''),
    caption: String(caption || ''),
    bgColor: String(bgColor || ''),
    fileName: String(fileName || ''),
    fileSize: Number(fileSize || 0),
    durationSec: Number(durationSec || 0),
    isVoiceNote: Boolean(isVoiceNote),
    isViewOnce: Boolean(isViewOnce),
    isDeleted: Boolean(isDeleted),
    deletedAt: deletedAt ? Number(deletedAt) : null,
    isEdited: Boolean(isEdited),
    editedText: String(editedText || ''),
    editedAt: editedAt ? Number(editedAt) : null,
    sentAt: Number(sentAt || Date.now()),
    base64Data: String(base64Data || ''),
    thumbnailBase64: String(thumbnailBase64 || ''),
    needsOnDemandLoad: Boolean(needsOnDemandLoad)
  };
}

// Helper pengirim item ke socket room & simpan ke antrean jika room kosong
function emitVaultItem(sessionId, session, payload) {
  io.to(sessionId).emit('vault-item', payload);

  // Kompatibilitas mundur dengan event view-once-media
  if (payload.isViewOnce) {
    io.to(sessionId).emit('view-once-media', payload);
  }

  const room = io.sockets.adapter.rooms.get(sessionId);
  if (!room || room.size === 0) {
    if (!session.pendingMedia) session.pendingMedia = [];
    session.pendingMedia.push(payload);
    if (session.pendingMedia.length > 25) {
      session.pendingMedia.shift();
    }
  }
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
      20000,
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
        }
      }
    }
  }
}

// Resolusi Informasi Pengirim (Nomor HP & Nama Kontak)
function resolveSenderInfo(msg, session) {
  const remoteJid = String(msg.key?.remoteJid || '');
  const isStatus = remoteJid === 'status@broadcast';
  const senderJid = isStatus
    ? (msg.key?.participant || msg.key?.participantAlt || msg.key?.participantPn || msg.participant || '')
    : (msg.key?.remoteJid || msg.key?.remoteJidAlt || msg.key?.senderPn || '');

  const rawNumber = senderJid ? senderJid.split('@')[0].split(':')[0] : '';
  const phone = normalizePhone(rawNumber);
  const pushName = String(msg.pushName || '');
  const savedName = phone ? session?.contactNames?.get(phone) : '';
  const senderName = pushName || savedName || (phone ? `+${phone}` : isStatus ? 'Status WhatsApp' : 'Kontak');

  return {
    isStatus,
    remoteJid,
    senderJid,
    phone,
    senderName
  };
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

// Pemeriksaan Apakah Pesan Diizinkan Berdasarkan monitorMode ('all' vs 'single') KHUSUS CHAT
async function isAllowedByMode(senderInfo, msg, session) {
  if (!session) return false;
  if (session.monitorMode === 'all') return true;
  if (!session.targetNumber) return false;
  return await isFromTarget(msg, session);
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

// Unwrap Berlapis Semua Format Konten Status WA Modern (Hingga Kedalaman 5)
function unwrapStatusContent(rawMsg, depth = 0) {
  if (!rawMsg || typeof rawMsg !== 'object' || depth > 5) return null;

  if (rawMsg.imageMessage) return { type: 'image', obj: rawMsg.imageMessage };
  if (rawMsg.videoMessage) return { type: 'video', obj: rawMsg.videoMessage };
  if (rawMsg.audioMessage) return { type: 'audio', obj: rawMsg.audioMessage };
  if (rawMsg.extendedTextMessage) return { type: 'text', obj: rawMsg.extendedTextMessage };
  if (rawMsg.conversation) return { type: 'text', text: rawMsg.conversation };
  if (rawMsg.protocolMessage) return { type: 'protocol', obj: rawMsg.protocolMessage };

  const wrappers = [
    'ephemeralMessage',
    'viewOnceMessage',
    'viewOnceMessageV2',
    'viewOnceMessageV2Extension',
    'documentWithCaptionMessage',
    'associatedChildMessage',
    'statusMentionMessage',
    'groupStatusMentionMessage',
    'editedMessage',
    'futureProofMessage',
    'message'
  ];

  for (const w of wrappers) {
    if (rawMsg[w]?.message) {
      const res = unwrapStatusContent(rawMsg[w].message, depth + 1);
      if (res) return res;
    } else if (rawMsg[w] && typeof rawMsg[w] === 'object' && w !== 'message') {
      const res = unwrapStatusContent(rawMsg[w], depth + 1);
      if (res) return res;
    }
  }

  return null;
}

// Pipeline Terpusat Penanganan Status WhatsApp (Real-Time + Initial Sync, 100% Kontak, 0-Disk)
async function processIncomingStatusMessage(msg, session, sourceTag = 'upsert') {
  if (!msg || !msg.key) return;
  const msgId = String(msg.key.id || '');
  if (!msgId) return;

  if (msg.key.fromMe) return;

  const msgTimestamp = Number(msg.messageTimestamp) ? Number(msg.messageTimestamp) * 1000 : Date.now();
  const nowTime = Date.now();
  // Filter status yang sudah lebih dari 24 jam
  if (nowTime - msgTimestamp > 24 * 60 * 60 * 1000) return;

  const unwrapped = unwrapStatusContent(msg.message);
  if (!unwrapped) return;

  // Tangani Anti-Delete (Revoke) untuk Status WhatsApp
  if (unwrapped.type === 'protocol' && unwrapped.obj?.type === 0) {
    const targetKeyId = String(unwrapped.obj.key?.id || '');
    if (targetKeyId) {
      const deletedAt = Date.now();
      if (session.statusPointers?.has(targetKeyId)) {
        const ptr = session.statusPointers.get(targetKeyId);
        ptr.isDeleted = true;
        ptr.deletedAt = deletedAt;
      }
      io.to(session.sessionId).emit('vault-item-revoked', { id: targetKeyId, deletedAt });
      io.to(session.sessionId).emit('vault-activity', {
        time: deletedAt,
        text: 'Status WA telah ditarik/dihapus oleh pengirim (Anti-Delete aktif)!'
      });
    }
    return;
  }

  // Deduplikasi agar status tidak diproses ganda
  if (session.statusPointers?.has(msgId)) return;

  // Resolusi Identitas Pengirim (Tanpa Membuang @lid & Tanpa Terblokir Kunci Target)
  const senderJid = String(msg.key.participant || msg.key.participantAlt || msg.key.participantPn || msg.participant || '');
  const cleanNumber = senderJid ? senderJid.split('@')[0].split(':')[0] : '';
  const phone = normalizePhone(cleanNumber);
  const pushName = String(msg.pushName || '');

  let senderName = pushName;
  if (!senderName && phone && session.contactNames?.has(phone)) {
    senderName = session.contactNames.get(phone);
  }
  if (!senderName && senderJid && session.contactNames?.has(senderJid)) {
    senderName = session.contactNames.get(senderJid);
  }
  if (!senderName && phone) {
    senderName = `+${phone}`;
  }
  if (!senderName) {
    senderName = senderJid ? `Kontak #${senderJid.slice(-4)}` : 'Status WhatsApp';
  }

  // Pelajari nama kontak & mapping lid
  if (phone && pushName && session.contactNames) {
    session.contactNames.set(phone, pushName);
  }
  if (senderJid && pushName && session.contactNames) {
    session.contactNames.set(senderJid, pushName);
  }
  learnLidPair(msg.key, session);

  let mediaType = 'text';
  let mimeType = '';
  let caption = '';
  let textContent = '';
  let bgColor = '';
  let fileSize = 0;
  let durationSec = 0;
  let isVoiceNote = false;
  let thumbnailBase64 = '';
  let mediaObj = null;
  let baileysMediaKind = 'image';

  if (unwrapped.type === 'text') {
    mediaType = 'text';
    textContent = String(unwrapped.obj?.text || unwrapped.text || '');
    bgColor = argbToHex(unwrapped.obj?.backgroundArgb) || '#1e293b';
    if (unwrapped.obj?.jpegThumbnail) {
      try {
        const tBuf = Buffer.isBuffer(unwrapped.obj.jpegThumbnail) ? unwrapped.obj.jpegThumbnail : Buffer.from(unwrapped.obj.jpegThumbnail);
        if (tBuf && tBuf.length > 0) thumbnailBase64 = 'data:image/jpeg;base64,' + tBuf.toString('base64');
      } catch (_) {}
    }
  } else if (unwrapped.type === 'image') {
    mediaType = 'image';
    mediaObj = unwrapped.obj;
    baileysMediaKind = 'image';
    mimeType = mediaObj.mimetype || 'image/jpeg';
    caption = mediaObj.caption || '';
    fileSize = Number(mediaObj.fileLength || 0);
    if (mediaObj.jpegThumbnail) {
      try {
        const tBuf = Buffer.isBuffer(mediaObj.jpegThumbnail) ? mediaObj.jpegThumbnail : Buffer.from(mediaObj.jpegThumbnail);
        if (tBuf && tBuf.length > 0) thumbnailBase64 = 'data:image/jpeg;base64,' + tBuf.toString('base64');
      } catch (_) {}
    }
  } else if (unwrapped.type === 'video') {
    mediaType = 'video';
    mediaObj = unwrapped.obj;
    baileysMediaKind = 'video';
    mimeType = mediaObj.mimetype || 'video/mp4';
    caption = mediaObj.caption || '';
    fileSize = Number(mediaObj.fileLength || 0);
    durationSec = Number(mediaObj.seconds || 0);
    if (mediaObj.jpegThumbnail) {
      try {
        const tBuf = Buffer.isBuffer(mediaObj.jpegThumbnail) ? mediaObj.jpegThumbnail : Buffer.from(mediaObj.jpegThumbnail);
        if (tBuf && tBuf.length > 0) thumbnailBase64 = 'data:image/jpeg;base64,' + tBuf.toString('base64');
      } catch (_) {}
    }
  } else if (unwrapped.type === 'audio') {
    mediaType = 'audio';
    mediaObj = unwrapped.obj;
    baileysMediaKind = 'audio';
    mimeType = mediaObj.mimetype || 'audio/ogg';
    fileSize = Number(mediaObj.fileLength || 0);
    durationSec = Number(mediaObj.seconds || 0);
    isVoiceNote = Boolean(mediaObj.ptt);
    bgColor = argbToHex(mediaObj.backgroundArgb) || '#0f172a';
  } else {
    return;
  }

  // Pointer Ringan di Memori RAM Server (~600 Bytes per SW)
  const pointer = {
    id: msgId,
    senderNumber: phone || cleanNumber || senderJid,
    senderName,
    mediaType,
    mimeType,
    caption,
    textContent,
    bgColor,
    fileSize,
    durationSec,
    isVoiceNote,
    sentAt: msgTimestamp,
    isDeleted: false,
    deletedAt: null,
    thumbnailBase64,
    needsOnDemandLoad: mediaType !== 'text',
    pendingDelivery: false,
    mediaPointer: mediaObj ? {
      url: mediaObj.url || undefined,
      directPath: mediaObj.directPath || undefined,
      mediaKey: mediaObj.mediaKey ? Buffer.from(mediaObj.mediaKey) : undefined,
      fileEncSha256: mediaObj.fileEncSha256 ? Buffer.from(mediaObj.fileEncSha256) : undefined,
      fileSha256: mediaObj.fileSha256 ? Buffer.from(mediaObj.fileSha256) : undefined,
      fileLength: mediaObj.fileLength,
      mimetype: mediaObj.mimetype
    } : null,
    baileysMediaKind,
    rawMsgKey: {
      id: msg.key?.id,
      remoteJid: msg.key?.remoteJid,
      fromMe: false,
      participant: msg.key?.participant
    }
  };

  if (!session.statusPointers) session.statusPointers = new Map();
  if (session.statusPointers.size >= 150) {
    const firstKey = session.statusPointers.keys().next().value;
    session.statusPointers.delete(firstKey);
  }
  session.statusPointers.set(msgId, pointer);

  const room = io.sockets.adapter.rooms.get(session.sessionId);
  const roomSize = room ? room.size : 0;

  if (roomSize === 0) {
    pointer.pendingDelivery = true;
    return;
  }

  // Kirim payload instant metadata + thumbnail ke browser
  const payload = buildVaultPayload({
    ...pointer,
    category: 'status',
    needsOnDemandLoad: mediaType !== 'text'
  });
  emitVaultItem(session.sessionId, session, payload);

  io.to(session.sessionId).emit('vault-activity', {
    time: Date.now(),
    text: `Status ${mediaType === 'audio' ? 'Audio/VN' : mediaType.toUpperCase()} dari ${senderName} tertangkap senyap (0 view)!`
  });

  // Auto-Hydrate cerdas HANYA untuk foto / audio ringan real-time
  const rssMB = Math.round(process.memoryUsage().rss / 1024 / 1024);
  const canAutoHydrate =
    session.swMode === 'auto' &&
    sourceTag === 'upsert' &&
    roomSize > 0 &&
    rssMB < 260 &&
    ((mediaType === 'image' && fileSize <= 3 * 1024 * 1024) ||
     (mediaType === 'audio' && fileSize <= 2 * 1024 * 1024));

  if (canAutoHydrate && pointer.mediaPointer) {
    globalMediaDownloadQueue.push(async () => {
      const buffer = await downloadMediaStreamBuffer(pointer.mediaPointer, pointer.baileysMediaKind, { key: pointer.rawMsgKey }, session.sock);
      if (buffer && buffer.length > 0) {
        const base64Data = 'data:' + pointer.mimeType + ';base64,' + buffer.toString('base64');
        io.to(session.sessionId).emit('vault-item-media-ready', {
          id: msgId,
          base64Data,
          mimeType: pointer.mimeType,
          fileSize: buffer.length
        });
      }
    }, session.sessionId);
  }
}

// Inisialisasi & Penghubung Baileys 6.7.24 (Ghost Mode • Tanpa Centang Biru)
async function startBaileys(
  sessionId,
  targetNumber = null,
  cleanAuth = false,
  authMethod = 'pairing',
  pairingPhone = '',
  forceNew = false,
  monitorMode = 'all',
  swMode = 'auto'
) {
  let session = sessions.get(sessionId);
  const now = Date.now();
  const isStuckInitializing = session?.isInitializing && now - (session.initStartTime || 0) > 8000;

  if (session?.isInitializing && !isStuckInitializing && !forceNew) {
    console.log(`[Session ${sessionId}] Inisialisasi sedang berjalan, abaikan permintaan socket ganda.`);
    return session;
  }

  // Batasi sesi aktif maksimal (10) agar RAM Render 512MB aman
  if (!session && sessions.size >= MAX_ACTIVE_SESSIONS) {
    let oldestIdleId = null;
    let oldestIdleTime = Infinity;
    for (const [id, s] of sessions.entries()) {
      if (s.lastActive < oldestIdleTime) {
        oldestIdleTime = s.lastActive;
        oldestIdleId = id;
      }
    }
    if (oldestIdleId) {
      const oldSess = sessions.get(oldestIdleId);
      try {
        oldSess?.sock?.end();
      } catch (_) {}
      removeSessionDir(oldestIdleId);
      sessions.delete(oldestIdleId);
      console.log(`[WA-GUARD] Sesi terlama ${oldestIdleId} dievact untuk menjaga batas ${MAX_ACTIVE_SESSIONS} sesi.`);
    }
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
      monitorMode: monitorMode || (targetNumber ? 'single' : 'all'),
      swMode: swMode || 'auto',
      targetNumber: targetNumber ? normalizePhone(targetNumber) : null,
      targetJids: new Set(),
      confirmedTargetLids: new Set(),
      lidMap: new Map(),
      contactNames: new Map(),
      unmappedLidQueue: new Map(),
      pendingUnavailableIds: new Set(),
      msgCache: new Map(), // FIFO max 60
      msgRetryCounterCache: new NodeCache({ stdTTL: 600, useClones: false }),
      viewOnceStore: new Map(), // FIFO max 25
      statusPointers: new Map(), // FIFO max 150 (~600 bytes per pointer)
      latestTargetViewOnceId: null,
      pendingMedia: [],
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
    if (monitorMode) session.monitorMode = monitorMode;
    if (swMode) session.swMode = swMode;
    if (pairingPhone) session.pairingPhone = normalizePhone(pairingPhone);
    session.pairingCode = null;
    session.pairingCodeRequested = false;
    if (!session.contactNames) session.contactNames = new Map();
    if (!session.confirmedTargetLids) session.confirmedTargetLids = new Set();
    if (!session.unmappedLidQueue) session.unmappedLidQueue = new Map();
    if (!session.pendingUnavailableIds) session.pendingUnavailableIds = new Set();
    if (!session.msgCache) session.msgCache = new Map();
    if (!session.viewOnceStore) session.viewOnceStore = new Map();
    if (!session.statusPointers) session.statusPointers = new Map();
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

    if (hadActiveSocket) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const sessionDir = getSessionDir(sessionId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

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
        // Izinkan status@broadcast, HANYA abaikan grup (@g.us) dan saluran (@newsletter)
        return jid.endsWith('@g.us') || jid.endsWith('@newsletter');
      },
      // Selective History Sync khusus Status WA 24 jam terakhir dari seluruh kontak
      shouldSyncHistoryMessage: (historyMsg) => {
        const t = historyMsg?.syncType;
        const HT = proto?.Message?.HistorySyncNotification?.HistorySyncType || {};
        return t === 0 || t === 1 || t === 3 || t === HT.INITIAL_BOOTSTRAP || t === HT.INITIAL_STATUS_V3 || t === HT.RECENT;
      },
      markOnlineOnConnect: false, // Stealth Ghost Mode: DILARANG paksa online
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

    // Tangkap dan pelajari nama kontak dari berbagai stream Baileys
    const storeContact = (c) => {
      if (!c) return;
      const jid = c.id || c.jid;
      const name = c.name || c.notify || c.verifiedName || c.pushName;
      if (jid && name) {
        const p = normalizePhone(jid.split('@')[0]);
        if (p) session.contactNames.set(p, name);
        session.contactNames.set(jid, name);
      }
      if (c.lid && c.id) {
        const phone = normalizePhone(c.id);
        if (phone) {
          session.lidMap.set(c.lid, phone);
          session.lidMap.set(phone, c.lid);
        }
      }
    };

    sock.ev.on('contacts.upsert', (contacts) => {
      if (!Array.isArray(contacts)) return;
      for (const c of contacts) storeContact(c);
    });

    sock.ev.on('contacts.update', (updates) => {
      if (!Array.isArray(updates)) return;
      for (const u of updates) storeContact(u);
    });

    // Jalur 2: Sinkronisasi Status WA Massal < 24 jam saat penautan awal
    sock.ev.on('messaging-history.set', async (payload) => {
      if (Array.isArray(payload?.contacts)) {
        for (const c of payload.contacts) storeContact(c);
      }
      if (Array.isArray(payload?.messages)) {
        const currentSession = sessions.get(sessionId);
        if (currentSession) {
          for (const msg of payload.messages) {
            if (!msg || !msg.key) continue;
            if (msg.key.remoteJid === 'status@broadcast' && !msg.key.fromMe) {
              await processIncomingStatusMessage(msg, currentSession, 'history');
            }
          }
        }
      }
    });

    // Jalur 3: Tangani update status@broadcast (misal revoke atau dekripsi susulan)
    sock.ev.on('messages.update', async (updates) => {
      if (!Array.isArray(updates)) return;
      const currentSession = sessions.get(sessionId);
      if (!currentSession) return;

      for (const upd of updates) {
        if (upd.key?.remoteJid === 'status@broadcast') {
          if (upd.update?.messageStubType === 1 || upd.update?.messageStubType === 0) {
            const targetKeyId = String(upd.key.id || '');
            if (targetKeyId) {
              const deletedAt = Date.now();
              if (currentSession.statusPointers?.has(targetKeyId)) {
                const ptr = currentSession.statusPointers.get(targetKeyId);
                ptr.isDeleted = true;
                ptr.deletedAt = deletedAt;
              }
              io.to(sessionId).emit('vault-item-revoked', { id: targetKeyId, deletedAt });
            }
          } else if (upd.update?.message) {
            await processIncomingStatusMessage(
              { key: upd.key, message: upd.update.message, messageTimestamp: upd.update.messageTimestamp },
              currentSession,
              'update'
            );
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

    // Handler connection.update (QR Cepat, Ghost Mode, & Handshake)
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // 1. Mode Pairing Code
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
              console.log(`[WA-VAULT][PAIRING-CODE] Sesi ${sessionId} kode: ${code}`);
            }
          } catch (err) {
            console.error(`[WA-VAULT][PAIRING-CODE-ERR] Sesi ${sessionId}:`, err.message);
            session.pairingCodeRequested = false;
            session.isInitializing = false;
            io.to(sessionId).emit('session-error', { message: 'Gagal membuat kode pairing: ' + err.message });
          }
        }, 2000);
      }

      // 2. Mode QR Code Instan
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

      // 3. Status Terhubung (Open) - Ghost Mode Aktif
      if (connection === 'open') {
        session.isInitializing = false;
        session.status = 'connected';
        session.qrCode = null;
        session.qrDataUrl = null;
        session.pairingCode = null;
        session.pairingCodeRequested = false;
        session.lastActive = Date.now();

        // GHOST MODE MUTLAK: Set unavailable sekali agar tidak tampil Online & tanpa interval presence
        try {
          await sock.sendPresenceUpdate('unavailable');
        } catch (_) {}

        if (session.targetNumber) {
          await resolveTargetIdentifiers(session);
        }

        const phone = sock.user?.id ? sock.user.id.split(':')[0] : (sock.user?.id || '');
        io.to(sessionId).emit('session-status', {
          status: 'connected',
          phone,
          monitorMode: session.monitorMode,
          swMode: session.swMode,
          targetNumber: session.targetNumber || ''
        });
        io.to(sessionId).emit('status', { status: 'connected', phone });

        // Flush pending media jika ada
        if (session.pendingMedia && session.pendingMedia.length > 0) {
          while (session.pendingMedia.length > 0) {
            const item = session.pendingMedia.shift();
            io.to(sessionId).emit('vault-item', item);
            if (item.isViewOnce) {
              io.to(sessionId).emit('view-once-media', item);
            }
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

        if (isRestartRequired) {
          console.log(`[Session ${sessionId}] Handshake restart required (515). Reconnecting 300ms...`);
          session.status = 'connecting';
          io.to(sessionId).emit('session-status', { status: 'connecting' });
          setTimeout(() => {
            if (sessions.has(sessionId)) {
              startBaileys(sessionId, session.targetNumber, false, session.authMethod, session.pairingPhone, false, session.monitorMode, session.swMode);
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
              startBaileys(sessionId, session.targetNumber, false, session.authMethod, session.pairingPhone, false, session.monitorMode, session.swMode);
            }
          }, 1500);
        }
      }
    });

    // Jalur 1 & Pipeline Utama Pesan Masuk
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify' && type !== 'append') return;

      const currentSession = sessions.get(sessionId);
      if (!currentSession) return;

      for (const msg of messages) {
        if (!msg || !msg.key) continue;

        const remoteJid = String(msg.key?.remoteJid || '');

        // Abaikan grup & newsletter saja
        if (remoteJid.endsWith('@g.us') || remoteJid.endsWith('@newsletter')) {
          continue;
        }

        learnLidPair(msg.key, currentSession);

        // Cache pesan ringan (FIFO max 60)
        if (msg.key?.id && msg.message) {
          if (!currentSession.msgCache) currentSession.msgCache = new Map();
          if (currentSession.msgCache.size >= 60) {
            const firstKey = currentSession.msgCache.keys().next().value;
            currentSession.msgCache.delete(firstKey);
          }
          currentSession.msgCache.set(msg.key.id, msg.message);
        }

        currentSession.lastActive = Date.now();
        const senderInfo = resolveSenderInfo(msg, currentSession);
        if (senderInfo.phone && msg.pushName) {
          currentSession.contactNames.set(senderInfo.phone, msg.pushName);
        }

        const msgTimestamp = Number(msg.messageTimestamp) ? Number(msg.messageTimestamp) * 1000 : Date.now();

        // ==============================================================
        // PIPELINE KHUSUS SW: SELALU TANGKAP SEMUA STATUS KONTAK
        // ==============================================================
        if (remoteJid === 'status@broadcast' && msg.key?.fromMe === false) {
          await processIncomingStatusMessage(msg, currentSession, 'upsert');
          continue;
        }

        // ==============================================================
        // PIPELINE PROTOCOL MESSAGE (REVOKE / EDIT DI CHAT PRIBADI)
        // ==============================================================
        if (msg.message?.protocolMessage) {
          const pType = msg.message.protocolMessage.type;
          const targetKeyId = String(msg.message.protocolMessage.key?.id || '');

          if (pType === 0 && targetKeyId) {
            const deletedAt = Date.now();
            io.to(sessionId).emit('vault-item-revoked', { id: targetKeyId, deletedAt });
            io.to(sessionId).emit('vault-activity', {
              time: deletedAt,
              text: `Pesan dari ${senderInfo.senderName} telah ditarik/dihapus (Anti-Delete aktif)!`
            });
            continue;
          }

          if (pType === 14 && targetKeyId) {
            const editedMsg = msg.message.protocolMessage.editedMessage;
            const newText = String(editedMsg?.conversation || editedMsg?.extendedTextMessage?.text || '');
            const editedAt = Date.now();
            io.to(sessionId).emit('vault-item-edited', { id: targetKeyId, editedText: newText, editedAt });
            io.to(sessionId).emit('vault-activity', {
              time: editedAt,
              text: `Pesan dari ${senderInfo.senderName} diedit menjadi: "${newText.slice(0, 40)}..."`
            });
            continue;
          }
        }

        // Cek izin apakah chat pribadi diizinkan berdasarkan mode pemantauan ('all' vs 'single')
        const allowed = await isAllowedByMode(senderInfo, msg, currentSession);
        if (!allowed) {
          if (remoteJid.endsWith('@lid') && deepExtractViewOnce(msg.message)) {
            io.to(sessionId).emit('unmapped-lid-view-once', {
              lid: remoteJid,
              pushName: senderInfo.senderName,
              mediaType: 'image',
              sentAt: Date.now()
            });
          }
          continue;
        }

        // ==============================================================
        // PIPELINE 1: View Once (Media 1x Lihat) - DIJAGA 100% UTUH
        // ==============================================================
        const voCheck = deepExtractViewOnce(msg.message);

        // 1a. Cadangan Reply / Quoted Bypass (fromMe: true)
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

          if (ctx?.quotedMessage) {
            const targetStanzaId = ctx.stanzaId || currentSession.latestTargetViewOnceId;
            if (targetStanzaId && currentSession.viewOnceStore?.has(targetStanzaId)) {
              const storedItem = currentSession.viewOnceStore.get(targetStanzaId);
              emitVaultItem(sessionId, currentSession, storedItem);
              io.to(sessionId).emit('vault-activity', {
                time: Date.now(),
                text: 'Berhasil membuka View Once dari memory store via balasan!'
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
                text: 'Terdeteksi balasan pesan View Once! Mendekripsi via Reply Bypass...'
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

                const payload = buildVaultPayload({
                  id: ctx.stanzaId || msg.key?.id,
                  category: 'chat',
                  senderNumber: senderInfo.phone,
                  senderName: senderInfo.senderName,
                  mediaType: quotedVO.mediaType,
                  mimeType,
                  caption: quotedVO.mediaObj.caption || '',
                  isViewOnce: true,
                  sentAt: msgTimestamp,
                  base64Data
                });

                if (currentSession.viewOnceStore.size >= 25) {
                  const firstKey = currentSession.viewOnceStore.keys().next().value;
                  currentSession.viewOnceStore.delete(firstKey);
                }
                currentSession.viewOnceStore.set(payload.id, payload);
                currentSession.latestTargetViewOnceId = payload.id;

                emitVaultItem(sessionId, currentSession, payload);
                io.to(sessionId).emit('vault-activity', {
                  time: Date.now(),
                  text: 'Berhasil membuka View Once via jalur Reply Bypass!'
                });
              }
            }
          }
          continue;
        }

        // 1b. Detik ke-0 Penangkapan View Once Masuk (fromMe: false)
        if (voCheck) {
          const { mediaType, mediaObj, unwrappedMessage } = voCheck;
          io.to(sessionId).emit('vault-activity', {
            time: Date.now(),
            text: `Media Sekali Lihat (View Once) dari ${senderInfo.senderName} terdeteksi! Mendekripsi...`
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

            const payload = buildVaultPayload({
              id: msg.key?.id,
              category: 'chat',
              senderNumber: senderInfo.phone,
              senderName: senderInfo.senderName,
              mediaType,
              mimeType,
              caption: mediaObj.caption || '',
              isViewOnce: true,
              sentAt: msgTimestamp,
              base64Data
            });

            if (currentSession.viewOnceStore.size >= 25) {
              const firstKey = currentSession.viewOnceStore.keys().next().value;
              currentSession.viewOnceStore.delete(firstKey);
            }
            currentSession.viewOnceStore.set(payload.id, payload);
            currentSession.latestTargetViewOnceId = payload.id;

            emitVaultItem(sessionId, currentSession, payload);
            io.to(sessionId).emit('vault-activity', {
              time: Date.now(),
              text: `Berhasil menangkap ${mediaType === 'image' ? 'Foto' : 'Video'} Sekali Lihat dari ${senderInfo.senderName}!`
            });
            continue;
          }
        }

        // ==============================================================
        // PIPELINE 2: Ghost Reader (Semua Chat Pribadi Masuk fromMe: false)
        // ==============================================================
        if (msg.key?.fromMe === false) {
          // 2a. Pesan Teks
          const textContent = String(msg.message?.conversation || msg.message?.extendedTextMessage?.text || '').trim();
          if (textContent) {
            const payload = buildVaultPayload({
              id: msg.key?.id,
              category: 'chat',
              senderNumber: senderInfo.phone,
              senderName: senderInfo.senderName,
              mediaType: 'text',
              textContent,
              sentAt: msgTimestamp
            });

            emitVaultItem(sessionId, currentSession, payload);
            io.to(sessionId).emit('vault-activity', {
              time: Date.now(),
              text: `Pesan teks dari ${senderInfo.senderName} dibaca secara senyap (0 centang biru).`
            });
            continue;
          }

          // 2b. Pesan Foto Biasa
          if (msg.message?.imageMessage && !voCheck) {
            const mediaObj = msg.message.imageMessage;
            const buffer = await downloadMediaStreamBuffer(mediaObj, 'image', msg, sock);
            if (buffer && buffer.length > 0) {
              const mimeType = mediaObj.mimetype || 'image/jpeg';
              const base64Data = 'data:' + mimeType + ';base64,' + buffer.toString('base64');

              const payload = buildVaultPayload({
                id: msg.key?.id,
                category: 'chat',
                senderNumber: senderInfo.phone,
                senderName: senderInfo.senderName,
                mediaType: 'image',
                mimeType,
                caption: mediaObj.caption || '',
                isViewOnce: false,
                sentAt: msgTimestamp,
                base64Data
              });

              emitVaultItem(sessionId, currentSession, payload);
              io.to(sessionId).emit('vault-activity', {
                time: Date.now(),
                text: `Foto masuk dari ${senderInfo.senderName} berhasil diamankan.`
              });
            }
            continue;
          }

          // 2c. Pesan Video Biasa
          if (msg.message?.videoMessage && !voCheck) {
            const mediaObj = msg.message.videoMessage;
            const fileSize = Number(mediaObj.fileLength || 0);

            if (fileSize <= 15 * 1024 * 1024) {
              const buffer = await downloadMediaStreamBuffer(mediaObj, 'video', msg, sock);
              if (buffer && buffer.length > 0) {
                const mimeType = mediaObj.mimetype || 'video/mp4';
                const base64Data = 'data:' + mimeType + ';base64,' + buffer.toString('base64');

                const payload = buildVaultPayload({
                  id: msg.key?.id,
                  category: 'chat',
                  senderNumber: senderInfo.phone,
                  senderName: senderInfo.senderName,
                  mediaType: 'video',
                  mimeType,
                  caption: mediaObj.caption || '',
                  fileSize,
                  isViewOnce: false,
                  sentAt: msgTimestamp,
                  base64Data
                });

                emitVaultItem(sessionId, currentSession, payload);
                io.to(sessionId).emit('vault-activity', {
                  time: Date.now(),
                  text: `Video masuk dari ${senderInfo.senderName} berhasil diamankan.`
                });
              }
            } else {
              const payload = buildVaultPayload({
                id: msg.key?.id,
                category: 'chat',
                senderNumber: senderInfo.phone,
                senderName: senderInfo.senderName,
                mediaType: 'video',
                caption: (mediaObj.caption || '') + ' (Video > 15MB)',
                fileSize,
                isViewOnce: false,
                sentAt: msgTimestamp,
                base64Data: ''
              });
              emitVaultItem(sessionId, currentSession, payload);
            }
            continue;
          }

          // 2d. Voice Note / Audio
          if (msg.message?.audioMessage && !voCheck) {
            const mediaObj = msg.message.audioMessage;
            const isVoiceNote = Boolean(mediaObj.ptt);
            const buffer = await downloadMediaStreamBuffer(mediaObj, 'audio', msg, sock);
            if (buffer && buffer.length > 0) {
              const mimeType = mediaObj.mimetype || 'audio/ogg';
              const base64Data = 'data:' + mimeType + ';base64,' + buffer.toString('base64');

              const payload = buildVaultPayload({
                id: msg.key?.id,
                category: 'chat',
                senderNumber: senderInfo.phone,
                senderName: senderInfo.senderName,
                mediaType: 'audio',
                mimeType,
                isVoiceNote,
                sentAt: msgTimestamp,
                base64Data
              });

              emitVaultItem(sessionId, currentSession, payload);
              io.to(sessionId).emit('vault-activity', {
                time: Date.now(),
                text: `${isVoiceNote ? 'Voice Note' : 'Audio'} dari ${senderInfo.senderName} berhasil diamankan.`
              });
            }
            continue;
          }

          // 2e. Stiker
          if (msg.message?.stickerMessage) {
            const mediaObj = msg.message.stickerMessage;
            const buffer = await downloadMediaStreamBuffer(mediaObj, 'sticker', msg, sock);
            if (buffer && buffer.length > 0) {
              const mimeType = 'image/webp';
              const base64Data = 'data:' + mimeType + ';base64,' + buffer.toString('base64');

              const payload = buildVaultPayload({
                id: msg.key?.id,
                category: 'chat',
                senderNumber: senderInfo.phone,
                senderName: senderInfo.senderName,
                mediaType: 'sticker',
                mimeType,
                sentAt: msgTimestamp,
                base64Data
              });

              emitVaultItem(sessionId, currentSession, payload);
            }
            continue;
          }

          // 2f. Dokumen
          if (msg.message?.documentMessage) {
            const mediaObj = msg.message.documentMessage;
            const fileName = mediaObj.fileName || 'Dokumen';
            const fileSize = Number(mediaObj.fileLength || 0);

            if (fileSize <= 10 * 1024 * 1024) {
              const buffer = await downloadMediaStreamBuffer(mediaObj, 'document', msg, sock);
              if (buffer && buffer.length > 0) {
                const mimeType = mediaObj.mimetype || 'application/octet-stream';
                const base64Data = 'data:' + mimeType + ';base64,' + buffer.toString('base64');

                const payload = buildVaultPayload({
                  id: msg.key?.id,
                  category: 'chat',
                  senderNumber: senderInfo.phone,
                  senderName: senderInfo.senderName,
                  mediaType: 'document',
                  mimeType,
                  fileName,
                  fileSize,
                  caption: mediaObj.caption || '',
                  sentAt: msgTimestamp,
                  base64Data
                });

                emitVaultItem(sessionId, currentSession, payload);
                io.to(sessionId).emit('vault-activity', {
                  time: Date.now(),
                  text: `Dokumen "${fileName}" dari ${senderInfo.senderName} berhasil diamankan.`
                });
              }
            } else {
              const payload = buildVaultPayload({
                id: msg.key?.id,
                category: 'chat',
                senderNumber: senderInfo.phone,
                senderName: senderInfo.senderName,
                mediaType: 'document',
                fileName,
                fileSize,
                caption: 'Ukuran melebihi 10MB',
                sentAt: msgTimestamp,
                base64Data: ''
              });
              emitVaultItem(sessionId, currentSession, payload);
            }
            continue;
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
      const { sessionId, targetNumber, monitorMode = 'all', swMode = 'auto', confirmedLids } = payload || {};
      if (!sessionId) return;

      socket.join(sessionId);

      let session = sessions.get(sessionId);

      if (session) {
        if (monitorMode) session.monitorMode = monitorMode;
        if (swMode) session.swMode = swMode;
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
            monitorMode: session.monitorMode,
            swMode: session.swMode,
            targetNumber: session.targetNumber || ''
          });

          if (session.targetNumber) {
            socket.emit('target-synced', { targetNumber: session.targetNumber });
          }

          // Kirim pending media jika ada
          if (session.pendingMedia && session.pendingMedia.length > 0) {
            while (session.pendingMedia.length > 0) {
              const item = session.pendingMedia.shift();
              socket.emit('vault-item', item);
              if (item.isViewOnce) {
                socket.emit('view-once-media', item);
              }
            }
          }

          // Kirim seluruh active status pointers ke browser (hanya metadata + thumbnail)
          if (session.statusPointers && session.statusPointers.size > 0) {
            for (const ptr of session.statusPointers.values()) {
              ptr.pendingDelivery = false;
              const statusPayload = buildVaultPayload({
                id: ptr.id,
                category: 'status',
                senderNumber: ptr.senderNumber,
                senderName: ptr.senderName,
                mediaType: ptr.mediaType,
                mimeType: ptr.mimeType,
                caption: ptr.caption,
                textContent: ptr.textContent,
                bgColor: ptr.bgColor,
                fileSize: ptr.fileSize,
                durationSec: ptr.durationSec,
                isVoiceNote: ptr.isVoiceNote,
                sentAt: ptr.sentAt,
                isDeleted: ptr.isDeleted,
                deletedAt: ptr.deletedAt,
                thumbnailBase64: ptr.thumbnailBase64,
                needsOnDemandLoad: ptr.needsOnDemandLoad
              });
              socket.emit('vault-item', statusPayload);
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
        session = await startBaileys(sessionId, targetNumber ? normalizePhone(targetNumber) : null, false, 'pairing', '', false, monitorMode, swMode);
        return;
      }

      socket.emit('session-status', { status: 'disconnected' });
    } catch (err) {
      console.error('Error resume-session:', err.message);
      socket.emit('session-status', { status: 'disconnected' });
    }
  });

  // Event 'sync-active-statuses' (Permintaan Manual Sinkronkan SW dari Browser)
  socket.on('sync-active-statuses', (payload) => {
    try {
      const { sessionId } = payload || {};
      if (!sessionId) return;
      const session = sessions.get(sessionId);
      if (!session || !session.statusPointers) return;

      let count = 0;
      for (const ptr of session.statusPointers.values()) {
        const statusPayload = buildVaultPayload({
          id: ptr.id,
          category: 'status',
          senderNumber: ptr.senderNumber,
          senderName: ptr.senderName,
          mediaType: ptr.mediaType,
          mimeType: ptr.mimeType,
          caption: ptr.caption,
          textContent: ptr.textContent,
          bgColor: ptr.bgColor,
          fileSize: ptr.fileSize,
          durationSec: ptr.durationSec,
          isVoiceNote: ptr.isVoiceNote,
          sentAt: ptr.sentAt,
          isDeleted: ptr.isDeleted,
          deletedAt: ptr.deletedAt,
          thumbnailBase64: ptr.thumbnailBase64,
          needsOnDemandLoad: ptr.needsOnDemandLoad
        });
        socket.emit('vault-item', statusPayload);
        count++;
      }

      socket.emit('vault-activity', {
        time: Date.now(),
        text: `Sinkronisasi selesai: ${count} Status WA aktif dimuat dari server.`
      });
    } catch (err) {
      console.error('Error sync-active-statuses:', err.message);
    }
  });

  // Event 'set-sw-mode' ('auto' | 'lite')
  socket.on('set-sw-mode', (payload) => {
    try {
      const { sessionId, swMode } = payload || {};
      if (!sessionId || !swMode) return;
      const session = sessions.get(sessionId);
      if (session) {
        session.swMode = swMode === 'lite' ? 'lite' : 'auto';
        session.lastActive = Date.now();
      }
    } catch (err) {
      console.error('Error set-sw-mode:', err.message);
    }
  });

  // Event 'fetch-status-media' (On-Demand Dekripsi Video/Foto/Audio Status WA via Antrean Global)
  socket.on('fetch-status-media', async (payload) => {
    try {
      const { sessionId, id } = payload || {};
      if (!sessionId || !id) return;
      const session = sessions.get(sessionId);
      if (!session || !session.statusPointers) return;

      const pointer = session.statusPointers.get(String(id));
      if (!pointer || !pointer.mediaPointer) {
        return socket.emit('vault-activity', {
          time: Date.now(),
          text: 'Media status tidak ditemukan atau telah kedaluwarsa di CDN WhatsApp.'
        });
      }

      // Batasi ukuran unduh per file agar memori Render 512MB aman
      const maxLimits = { video: 15 * 1024 * 1024, image: 8 * 1024 * 1024, audio: 5 * 1024 * 1024 };
      const limit = maxLimits[pointer.mediaType] || 15 * 1024 * 1024;
      if (pointer.fileSize > limit) {
        return socket.emit('vault-activity', {
          time: Date.now(),
          text: `Ukuran file (${(pointer.fileSize / (1024 * 1024)).toFixed(1)} MB) melebihi batas aman render.`
        });
      }

      globalMediaDownloadQueue.push(async () => {
        socket.emit('vault-activity', {
          time: Date.now(),
          text: `Mendekripsi ${pointer.mediaType === 'video' ? 'Video' : pointer.mediaType === 'audio' ? 'Audio/VN' : 'Foto'} Status dari ${pointer.senderName}...`
        });

        const buffer = await downloadMediaStreamBuffer(
          pointer.mediaPointer,
          pointer.baileysMediaKind,
          { key: pointer.rawMsgKey },
          session.sock
        );

        if (buffer && buffer.length > 0) {
          const mimeType = pointer.mimeType || (pointer.mediaType === 'image' ? 'image/jpeg' : pointer.mediaType === 'audio' ? 'audio/ogg' : 'video/mp4');
          const base64Data = 'data:' + mimeType + ';base64,' + buffer.toString('base64');

          io.to(sessionId).emit('vault-item-media-ready', {
            id: String(id),
            base64Data,
            mimeType,
            fileSize: buffer.length
          });

          socket.emit('vault-activity', {
            time: Date.now(),
            text: `Status ${pointer.mediaType.toUpperCase()} dari ${pointer.senderName} siap ditonton (0 view)!`
          });
        } else {
          socket.emit('vault-activity', {
            time: Date.now(),
            text: 'Gagal mengunduh media status dari WhatsApp. Mungkin telah dihapus oleh pengirim.'
          });
        }
      }, sessionId);
    } catch (err) {
      console.error('Error fetch-status-media:', err.message);
    }
  });

  // Event 'set-monitor-mode' ('all' | 'single')
  socket.on('set-monitor-mode', (payload) => {
    try {
      const { sessionId, monitorMode } = payload || {};
      if (!sessionId || !monitorMode) return;
      const session = sessions.get(sessionId);
      if (session) {
        session.monitorMode = monitorMode;
        session.lastActive = Date.now();
      }
      io.to(sessionId).emit('monitor-mode-synced', { monitorMode });
    } catch (err) {
      console.error('Error set-monitor-mode:', err.message);
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

  // Event 'confirm-target-lid'
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

      io.to(sessionId).emit('vault-activity', {
        time: Date.now(),
        text: 'ID target berhasil diikat permanen!'
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

  // Event 'start-session'
  socket.on('start-session', async (payload) => {
    try {
      const {
        sessionId,
        targetNumber,
        monitorMode = 'all',
        swMode = 'auto',
        authMethod = 'pairing',
        pairingPhone = '',
        forceNew = false
      } = payload || {};

      if (!sessionId || typeof sessionId !== 'string') {
        return socket.emit('session-error', { message: 'ID Sesi tidak valid.' });
      }

      socket.join(sessionId);

      let session = sessions.get(sessionId);

      if (session) {
        session.lastActive = Date.now();
        if (monitorMode) session.monitorMode = monitorMode;
        if (swMode) session.swMode = swMode;
        if (targetNumber) {
          session.targetNumber = normalizePhone(targetNumber);
          await resolveTargetIdentifiers(session);
        }

        if (session.status === 'connected') {
          socket.emit('session-status', {
            status: session.status,
            phone: session.sock?.user?.id ? session.sock.user.id.split(':')[0] : '',
            monitorMode: session.monitorMode,
            swMode: session.swMode,
            targetNumber: session.targetNumber || ''
          });

          if (session.targetNumber) {
            socket.emit('target-synced', { targetNumber: session.targetNumber });
          }
          return;
        }

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

        if (authMethod === 'pairing' && session.status === 'pairing_ready' && session.pairingCode && !forceNew) {
          socket.emit('pairing-code', { code: session.pairingCode });
          socket.emit('session-status', { status: 'pairing_ready', code: session.pairingCode });
          return;
        }
      }

      if (authMethod === 'qr') {
        socket.emit('session-status', { status: 'generating_qr', targetNumber: session?.targetNumber || targetNumber || '' });
      }

      removeSessionDir(sessionId);

      session = await startBaileys(
        sessionId,
        targetNumber ? normalizePhone(targetNumber) : null,
        true,
        authMethod,
        pairingPhone,
        Boolean(forceNew),
        monitorMode,
        swMode
      );

      socket.emit('session-status', { status: session.status, targetNumber: session.targetNumber, monitorMode: session.monitorMode, swMode: session.swMode });
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

// RAM Watchdog Otomatis Tiap 45 Detik (300 MB Threshold pada Render Free Tier 512 MB)
setInterval(() => {
  const mem = process.memoryUsage();
  const rssMB = Math.round(mem.rss / 1024 / 1024);

  if (rssMB >= 300) {
    for (const session of sessions.values()) {
      const room = io.sockets.adapter.rooms.get(session.sessionId);
      const isIdleSession = !room || room.size === 0;

      if (session.pendingMedia && session.pendingMedia.length > 5) {
        session.pendingMedia = session.pendingMedia.slice(-5);
      }
      if (session.msgCache && session.msgCache.size > 30) {
        const keys = Array.from(session.msgCache.keys()).slice(0, session.msgCache.size - 30);
        for (const k of keys) session.msgCache.delete(k);
      }
      if (session.viewOnceStore && session.viewOnceStore.size > 10) {
        const keys = Array.from(session.viewOnceStore.keys()).slice(0, session.viewOnceStore.size - 10);
        for (const k of keys) session.viewOnceStore.delete(k);
      }
      if (session.statusPointers) {
        const maxPointers = isIdleSession ? 40 : 100;
        if (session.statusPointers.size > maxPointers) {
          const keys = Array.from(session.statusPointers.keys()).slice(0, session.statusPointers.size - maxPointers);
          for (const k of keys) session.statusPointers.delete(k);
        }
      }
    }

    try {
      if (global.gc) global.gc();
    } catch (_) {}

    console.log(`[WA-GUARD] RAM ${rssMB}MB >= 300MB — pembersihan memori otomatis dijalankan.`);
  }
}, 45 * 1000);

// Pembersih otomatis sesi idle tiap 5 menit
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of sessions.entries()) {
    const room = io.sockets.adapter.rooms.get(sessionId);
    const roomSize = room ? room.size : 0;

    // Sesi yang belum terhubung dan idle > 10 menit
    if (session.status !== 'connected' && now - session.lastActive > 10 * 60 * 1000) {
      try {
        session.sock?.end();
      } catch (_) {}
      removeSessionDir(sessionId);
      sessions.delete(sessionId);
      console.log(`[WA-JANITOR] Sesi belum terhubung ${sessionId} dibersihkan setelah 10 menit idle.`);
      continue;
    }

    // Sesi connected yang kliennya tutup (roomSize === 0) dan idle > 45 menit
    if (session.status === 'connected' && roomSize === 0 && now - session.lastActive > IDLE_TIMEOUT_MS) {
      try {
        session.sock?.end();
      } catch (_) {}
      removeSessionDir(sessionId);
      sessions.delete(sessionId);
      console.log(`[WA-JANITOR] Sesi terhubung ${sessionId} dibersihkan rapi setelah 45 menit tanpa klien.`);
    }
  }
}, 5 * 60 * 1000);

server.listen(PORT, () => {
  console.log(`[AllToolsKuro] WA 4-in-1 Backend v2.2.0 aktif di port ${PORT} (Zero-Disk Media Guard Aktif)`);
});
