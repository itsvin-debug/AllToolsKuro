require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const pino = require('pino');
const QRCode = require('qrcode');

const baileysModule = require('@whiskeysockets/baileys');
const makeWASocket =
  baileysModule.default?.default ||
  baileysModule.default ||
  baileysModule.makeWASocket ||
  baileysModule;

const {
  useMultiFileAuthState,
  DisconnectReason,
  downloadContentFromMessage,
  downloadMediaMessage,
  makeCacheableSignalKeyStore,
  Browsers
} = baileysModule;

const fetchLatestBaileysVersion =
  baileysModule.fetchLatestBaileysVersion || baileysModule.fetchLatestWaWebVersion;
const proto = baileysModule.proto || baileysModule.WAProto;
const NodeCache = require('node-cache');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 4000;
const FRONTEND_URL = process.env.FRONTEND_URL || '*';
const MAX_SESSIONS = 6;
const IDLE_TIMEOUT_MS = 60 * 60 * 1000; // 60 menit batas idle sesi

const pinoLogger = pino({ level: 'silent' });
const baileysLogger = pino({ level: 'warn' });

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

// Passive LID Learning: Otomatis pelajari dan ikat pasangan @lid <-> @s.whatsapp.net dari setiap msg.key
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

// Helper pengupas pembungkus pesan keluar (deviceSentMessage, ephemeralMessage, editedMessage, dll.)
function unwrapOutgoingContainer(rawMsg, depth = 0) {
  if (!rawMsg || typeof rawMsg !== 'object' || depth > 8) return rawMsg;
  if (rawMsg.deviceSentMessage?.message) {
    return unwrapOutgoingContainer(rawMsg.deviceSentMessage.message, depth + 1);
  }
  if (rawMsg.ephemeralMessage?.message) {
    return unwrapOutgoingContainer(rawMsg.ephemeralMessage.message, depth + 1);
  }
  if (rawMsg.editedMessage?.message) {
    return unwrapOutgoingContainer(rawMsg.editedMessage.message, depth + 1);
  }
  if (rawMsg.documentWithCaptionMessage?.message) {
    return unwrapOutgoingContainer(rawMsg.documentWithCaptionMessage.message, depth + 1);
  }
  if (rawMsg.futureProofMessage?.message) {
    return unwrapOutgoingContainer(rawMsg.futureProofMessage.message, depth + 1);
  }
  if (rawMsg.viewOnceMessage?.message) {
    return unwrapOutgoingContainer(rawMsg.viewOnceMessage.message, depth + 1);
  }
  if (rawMsg.viewOnceMessageV2?.message) {
    return unwrapOutgoingContainer(rawMsg.viewOnceMessageV2.message, depth + 1);
  }
  if (rawMsg.viewOnceMessageV2Extension?.message) {
    return unwrapOutgoingContainer(rawMsg.viewOnceMessageV2Extension.message, depth + 1);
  }
  return rawMsg;
}

// 1. Pencocokan Pengirim Pesan Terhadap Target Terkunci (Menggunakan resolveJidToPhone)
async function isFromTarget(msg, session) {
  if (!session?.targetNumber) return false;

  // Tangkap destinationJid jika pesan keluar dibungkus oleh deviceSentMessage
  const destinationJid =
    msg.message?.deviceSentMessage?.destinationJid ||
    msg.message?.ephemeralMessage?.message?.deviceSentMessage?.destinationJid ||
    '';

  const candidates = [
    msg.key?.remoteJid,
    msg.key?.remoteJidAlt,
    msg.key?.senderPn,
    msg.key?.participant,
    msg.key?.participantAlt,
    msg.key?.participantPn,
    destinationJid
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

  // 1. Direct media check dengan flag viewOnce atau inherited
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

  // 2. View Once wrappers spesifik WhatsApp
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

  // 3. Wrapper umum, futureProofMessage, ephemeral, forwarding, dll.
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

// Helper Timeout Promise
function withTimeout(promise, ms, errorMsg = 'Timeout') {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(errorMsg)), ms))
  ]);
}

// Helper Konversi Buffer Aman (Mendukung Buffer, Uint8Array, Base64, { type: 'Buffer', data }, Array, protobuf)
function toCleanBuffer(val) {
  if (!val) return null;
  if (Buffer.isBuffer(val)) return val;
  if (val instanceof Uint8Array) return Buffer.from(val.buffer, val.byteOffset, val.byteLength);
  if (typeof val === 'string') {
    try {
      return Buffer.from(val, 'base64');
    } catch (_) {
      return Buffer.from(val);
    }
  }
  if (typeof val === 'object') {
    if (val.type === 'Buffer' && Array.isArray(val.data)) {
      return Buffer.from(val.data);
    }
    if (Array.isArray(val)) {
      return Buffer.from(val);
    }
    try {
      const values = Object.values(val);
      if (values.length > 0 && typeof values[0] === 'number') {
        return Buffer.from(values);
      }
    } catch (_) {}
  }
  return null;
}
const toBufferSafe = toCleanBuffer;

// Validasi Magic Bytes Buffer Media (Cegah Simpan File Rusak/Kosong)
function isValidMediaBuffer(buf, type) {
  if (!buf || !Buffer.isBuffer(buf) || buf.length < 4) return false;
  const t = String(type || '').toLowerCase();
  if (t === 'image' || t === 'imagemessage') {
    if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return true; // JPEG
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return true; // PNG
    if (buf.length >= 12 && buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return true; // WEBP
  }
  if (t === 'video' || t === 'videomessage' || t === 'ptvmessage') {
    const header32 = buf.slice(0, 32).toString('latin1');
    if (header32.includes('ftyp') || header32.includes('moov') || header32.includes('mdat')) return true;
  }
  if (t === 'audio' || t === 'audiomessage') {
    if (buf.slice(0, 4).toString() === 'OggS') return true;
    if (buf.slice(0, 3).toString() === 'ID3' || (buf[0] === 0xFF && (buf[1] & 0xE0) === 0xE0)) return true;
    if (buf.length >= 8 && buf.slice(4, 8).toString() === 'ftyp') return true;
  }
  if (t === 'sticker' || t === 'stickermessage') {
    if (buf.length >= 12 && buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return true;
  }
  return buf.length > 16;
}

// Scanner Media Universal Ala Bot WA .rvo — Cek 5 Tipe Media Tanpa Syarat Flag viewOnce: true
function findAnyDownloadableMedia(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 10) return null;
  if (Buffer.isBuffer(obj) || obj instanceof Uint8Array || Array.isArray(obj)) return null;

  const checks = [
    { key: 'imageMessage', mediaType: 'image', downloadType: 'image' },
    { key: 'videoMessage', mediaType: 'video', downloadType: 'video' },
    { key: 'ptvMessage', mediaType: 'video', downloadType: 'video' },
    { key: 'audioMessage', mediaType: 'audio', downloadType: 'audio' },
    { key: 'stickerMessage', mediaType: 'sticker', downloadType: 'sticker' }
  ];

  for (const c of checks) {
    const mediaObj = obj[c.key];
    if (mediaObj && typeof mediaObj === 'object') {
      const hasMediaKey = Boolean(mediaObj.mediaKey);
      const hasPathOrUrl = Boolean(mediaObj.directPath || mediaObj.url);
      if (hasMediaKey && hasPathOrUrl) {
        return {
          mediaType: c.mediaType,
          downloadType: c.downloadType,
          keyName: c.key,
          mediaObj
        };
      }
    }
  }

  // Telusuri rekursif setiap property bernilai object (abaikan contextInfo, Array, Buffer/Uint8Array)
  for (const [key, val] of Object.entries(obj)) {
    if (
      key !== 'contextInfo' &&
      val &&
      typeof val === 'object' &&
      !Array.isArray(val) &&
      !Buffer.isBuffer(val) &&
      !(val instanceof Uint8Array)
    ) {
      const found = findAnyDownloadableMedia(val, depth + 1);
      if (found) return found;
    }
  }

  return null;
}

// Fallback Scanner jika kunci media di-strip WhatsApp tapi jpegThumbnail masih ada
function findAnyThumbnailMedia(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 10) return null;
  if (Buffer.isBuffer(obj) || obj instanceof Uint8Array || Array.isArray(obj)) return null;

  const checks = [
    { key: 'imageMessage', mediaType: 'image', downloadType: 'image' },
    { key: 'videoMessage', mediaType: 'video', downloadType: 'video' },
    { key: 'ptvMessage', mediaType: 'video', downloadType: 'video' }
  ];

  for (const c of checks) {
    const mediaObj = obj[c.key];
    if (mediaObj && typeof mediaObj === 'object' && mediaObj.jpegThumbnail) {
      return {
        mediaType: c.mediaType,
        downloadType: c.downloadType,
        keyName: c.key,
        mediaObj
      };
    }
  }

  for (const [key, val] of Object.entries(obj)) {
    if (
      key !== 'contextInfo' &&
      val &&
      typeof val === 'object' &&
      !Array.isArray(val) &&
      !Buffer.isBuffer(val) &&
      !(val instanceof Uint8Array)
    ) {
      const found = findAnyThumbnailMedia(val, depth + 1);
      if (found) return found;
    }
  }

  return null;
}

// Pengunduh 3-Tier Bervalidasi Magic Bytes & Timeout Ala viewOnceService.js
async function downloadMediaStreamBuffer(mediaObj, type, rawMsg = null, keyContext = null, sock = null) {
  if (!mediaObj) {
    return { buffer: null, isThumbnail: false, mimeType: '', error: new Error('Media object kosong') };
  }

  const cleanMedia = { ...mediaObj };
  if (cleanMedia.mediaKey) cleanMedia.mediaKey = toCleanBuffer(cleanMedia.mediaKey);
  if (cleanMedia.fileEncSha256) cleanMedia.fileEncSha256 = toCleanBuffer(cleanMedia.fileEncSha256);
  if (cleanMedia.fileSha256) cleanMedia.fileSha256 = toCleanBuffer(cleanMedia.fileSha256);

  const downloadType =
    type === 'sticker' ? 'sticker' :
    type === 'document' ? 'document' :
    type === 'audio' ? 'audio' :
    type === 'video' ? 'video' : 'image';
  const keyName = `${downloadType}Message`;

  let buffer = null;
  let lastError = null;

  // Tier 1 (timeout 20s): downloadContentFromMessage (metode paling murni ala bot)
  try {
    const stream = await withTimeout(
      downloadContentFromMessage(cleanMedia, downloadType),
      20000,
      'Tier 1 timeout 20s'
    );
    let buf = Buffer.alloc(0);
    for await (const chunk of stream) {
      buf = Buffer.concat([buf, chunk]);
    }
    if (buf && buf.length > 0 && isValidMediaBuffer(buf, downloadType)) {
      buffer = buf;
    }
  } catch (err1) {
    lastError = err1;
    console.warn(`[WA-VAULT][DOWNLOAD] Tier 1 gagal (${err1.message}), mencoba Tier 2...`);
  }

  // Tier 2 (timeout 15s): downloadMediaMessage dengan rawMsg lengkap jika tersedia
  if ((!buffer || buffer.length === 0) && rawMsg) {
    try {
      const buf2 = await withTimeout(
        downloadMediaMessage(
          rawMsg,
          'buffer',
          {},
          { logger: baileysLogger, reuploadRequest: sock?.updateMediaMessage }
        ),
        15000,
        'Tier 2 timeout 15s'
      );
      if (buf2 && buf2.length > 0 && isValidMediaBuffer(buf2, downloadType)) {
        buffer = buf2;
      }
    } catch (err2) {
      lastError = err2;
      console.warn(`[WA-VAULT][DOWNLOAD] Tier 2 gagal: ${err2.message}`);
    }
  }

  // Tier 3 (timeout 15s): downloadMediaMessage dengan syntheticKey & wrapped message
  if ((!buffer || buffer.length === 0) && (keyContext || rawMsg?.key)) {
    try {
      const syntheticKey = keyContext || rawMsg?.key;
      const wrapped = { [keyName]: cleanMedia };
      const buf3 = await withTimeout(
        downloadMediaMessage(
          { message: wrapped, key: syntheticKey },
          'buffer',
          {},
          { logger: baileysLogger, reuploadRequest: sock?.updateMediaMessage }
        ),
        15000,
        'Tier 3 timeout 15s'
      );
      if (buf3 && buf3.length > 0 && isValidMediaBuffer(buf3, downloadType)) {
        buffer = buf3;
      }
    } catch (err3) {
      lastError = err3;
      console.warn(`[WA-VAULT][DOWNLOAD] Tier 3 gagal: ${err3.message}`);
    }
  }

  // Tier 4: Fallback Thumbnail jika file resolusi penuh di-strip WhatsApp tapi jpegThumbnail ada
  if ((!buffer || buffer.length === 0) && mediaObj.jpegThumbnail) {
    const thumbBuf = toCleanBuffer(mediaObj.jpegThumbnail);
    if (thumbBuf && thumbBuf.length > 0) {
      return {
        buffer: thumbBuf,
        isThumbnail: true,
        mimeType: 'image/jpeg',
        error: null
      };
    }
  }

  if (buffer && buffer.length > 0) {
    const defaultMimes = {
      image: 'image/jpeg',
      video: 'video/mp4',
      audio: cleanMedia.ptt ? 'audio/ogg; codecs=opus' : 'audio/mp4',
      sticker: 'image/webp',
      document: 'application/octet-stream'
    };
    return {
      buffer,
      isThumbnail: false,
      mimeType: cleanMedia.mimetype || defaultMimes[downloadType] || 'application/octet-stream',
      error: null
    };
  }

  return {
    buffer: null,
    isThumbnail: false,
    mimeType: cleanMedia.mimetype || '',
    error: lastError || new Error('Gagal mendekripsi media di semua tier')
  };
}

// Wrapper Kompatibilitas untuk pemanggilan decryptMediaLikeRvoBot
async function decryptMediaLikeRvoBot(mediaObj, downloadType, keyName, msgKey, sock) {
  return downloadMediaStreamBuffer(mediaObj, downloadType, null, msgKey, sock);
}

// 3-Store Helper Functions (Ramah RAM Render Free Tier)
function saveToViewOnceStore(session, msgId, item) {
  if (!session || !msgId) return;
  if (!session.viewOnceStore) session.viewOnceStore = new Map();
  session.viewOnceStore.set(String(msgId), item);
  if (session.viewOnceStore.size > 100) {
    const oldestKey = session.viewOnceStore.keys().next().value;
    session.viewOnceStore.delete(oldestKey);
  }
  // Simpan buffer hanya untuk maksimal 15 item terbaru agar RAM Render tetap ringan
  let bufferCount = 0;
  const entries = Array.from(session.viewOnceStore.entries()).reverse();
  for (const [, val] of entries) {
    if (val && val.buffer) {
      bufferCount++;
      if (bufferCount > 15) {
        val.buffer = null;
      }
    }
  }
}

function saveToActiveMessageStore(session, msgId, data) {
  if (!session || !msgId) return;
  if (!session.activeMessageStore) session.activeMessageStore = new Map();
  session.activeMessageStore.set(String(msgId), {
    ...data,
    id: String(msgId),
    createdAt: Date.now()
  });
  if (session.activeMessageStore.size > 200) {
    const oldestKey = session.activeMessageStore.keys().next().value;
    session.activeMessageStore.delete(oldestKey);
  }
}

function updateLatestChatViewOnce(session, keys, msgId) {
  if (!session || !msgId) return;
  if (!session.latestChatViewOnce) session.latestChatViewOnce = new Map();
  const now = Date.now();
  for (const k of keys) {
    if (k) session.latestChatViewOnce.set(String(k), { msgId: String(msgId), timestamp: now });
  }
}

function getLatestChatViewOnceId(session, keys) {
  if (!session?.latestChatViewOnce) return null;
  const now = Date.now();
  const MAX_AGE = 60 * 60 * 1000; // 60 menit
  for (const k of keys) {
    if (!k) continue;
    const entry = session.latestChatViewOnce.get(String(k));
    if (entry && (now - entry.timestamp) < MAX_AGE) {
      return entry.msgId;
    }
  }
  return null;
}

function savePendingUnavailable(session, msgId, info) {
  if (!session || !msgId) return;
  if (!session.pendingUnavailableMap) session.pendingUnavailableMap = new Map();
  session.pendingUnavailableMap.set(String(msgId), {
    ...info,
    id: String(msgId),
    createdAt: Date.now()
  });
  const now = Date.now();
  for (const [id, val] of session.pendingUnavailableMap.entries()) {
    if (now - val.createdAt > 60 * 60 * 1000) {
      session.pendingUnavailableMap.delete(id);
    }
  }
}

function isViewOnceMessage(msg) {
  if (!msg?.message) return false;
  const m = msg.message;
  return Boolean(
    m.viewOnceMessage ||
    m.viewOnceMessageV2 ||
    m.viewOnceMessageV2Extension ||
    m.imageMessage?.viewOnce ||
    m.videoMessage?.viewOnce ||
    m.audioMessage?.viewOnce ||
    deepExtractViewOnce(m)
  );
}

// Pencarian 6 Tingkat Ala resolveViewOnceItem Saat User Me-Reply (Reply Bebas Tanpa Harus Ketik .rvo)
async function resolveViewOnceItem(session, remoteJid, cleanPhone, quotedId, quotedMsg, msg, sock) {
  if (!session) return null;

  // 1) Cari di session.viewOnceStore dengan quotedId
  if (quotedId && session.viewOnceStore?.has(String(quotedId))) {
    const item = session.viewOnceStore.get(String(quotedId));
    if (item?.buffer) {
      return { ...item, source: 'viewOnceStore_buffer' };
    }
    if (item?.mediaObj) {
      return { ...item, source: 'viewOnceStore_mediaObj' };
    }
  }

  // 2) Cari di session.activeMessageStore dengan quotedId
  if (quotedId && session.activeMessageStore?.has(String(quotedId))) {
    const act = session.activeMessageStore.get(String(quotedId));
    if (act?.mediaObj) {
      return {
        id: act.id,
        mediaObj: act.mediaObj,
        mediaType: act.mediaType,
        rawMsg: act.rawMsg,
        keyContext: act.rawMsg?.key || { remoteJid, id: quotedId, fromMe: false },
        senderNumber: act.senderNumber || cleanPhone,
        senderName: act.senderName || 'Target',
        source: 'activeMessageStore'
      };
    }
  }

  // 3) Ekstrak media langsung dari quotedMsg (tanpa syarat flag viewOnce: true)
  if (quotedMsg && typeof quotedMsg === 'object') {
    const found = findAnyDownloadableMedia(quotedMsg) || findAnyThumbnailMedia(quotedMsg);
    if (found?.mediaObj) {
      return {
        id: quotedId || msg.key?.id,
        mediaObj: found.mediaObj,
        mediaType: found.mediaType,
        rawMsg: null,
        keyContext: { remoteJid, id: quotedId || msg.key?.id, fromMe: false },
        senderNumber: cleanPhone,
        senderName: 'Target',
        source: 'quotedMsg'
      };
    }
  }

  // 4) Cari di session.msgCache dengan quotedId
  if (quotedId && session.msgCache?.has(String(quotedId))) {
    const cachedMsg = session.msgCache.get(String(quotedId));
    const found = findAnyDownloadableMedia(cachedMsg) || findAnyThumbnailMedia(cachedMsg);
    if (found?.mediaObj) {
      return {
        id: quotedId,
        mediaObj: found.mediaObj,
        mediaType: found.mediaType,
        rawMsg: { key: { remoteJid, id: quotedId, fromMe: false }, message: cachedMsg },
        keyContext: { remoteJid, id: quotedId, fromMe: false },
        senderNumber: cleanPhone,
        senderName: 'Target',
        source: 'msgCache'
      };
    }
  }

  // 5) Cari di session.latestChatViewOnce berdasarkan remoteJid / cleanPhone (valid < 60 min)
  const latestId = getLatestChatViewOnceId(session, [remoteJid, cleanPhone]);
  if (latestId) {
    if (session.viewOnceStore?.has(latestId)) {
      const item = session.viewOnceStore.get(latestId);
      if (item?.buffer || item?.mediaObj) {
        return { ...item, source: 'latestChatViewOnce_viewOnceStore' };
      }
    }
    if (session.activeMessageStore?.has(latestId)) {
      const act = session.activeMessageStore.get(latestId);
      if (act?.mediaObj) {
        return {
          id: act.id,
          mediaObj: act.mediaObj,
          mediaType: act.mediaType,
          rawMsg: act.rawMsg,
          keyContext: act.rawMsg?.key || { remoteJid, id: latestId, fromMe: false },
          senderNumber: act.senderNumber || cleanPhone,
          senderName: act.senderName || 'Target',
          source: 'latestChatViewOnce_activeMessageStore'
        };
      }
    }
  }

  // 6) Cari media terbaru milik chat tersebut di session.activeMessageStore
  if (session.activeMessageStore && session.activeMessageStore.size > 0) {
    const now = Date.now();
    const entries = Array.from(session.activeMessageStore.values()).reverse();
    for (const act of entries) {
      if (
        (act.chatJid === remoteJid || act.senderNumber === cleanPhone) &&
        act.mediaObj &&
        (now - act.createdAt) < 60 * 60 * 1000
      ) {
        return {
          id: act.id,
          mediaObj: act.mediaObj,
          mediaType: act.mediaType,
          rawMsg: act.rawMsg,
          keyContext: act.rawMsg?.key || { remoteJid, id: act.id, fromMe: false },
          senderNumber: act.senderNumber || cleanPhone,
          senderName: act.senderName || 'Target',
          source: 'activeMessageStore_recent'
        };
      }
    }
  }

  return null;
}

// Fungsi Evaluasi Izin Pesan (Mode Pemantauan Fleksibel: 'all' vs 'single')
async function isAllowedMessage(msg, session) {
  if (!msg?.key) return false;
  const remoteJid = String(msg.key.remoteJid || '');
  if (
    !remoteJid ||
    remoteJid.endsWith('@g.us') ||
    remoteJid === 'status@broadcast' ||
    remoteJid.endsWith('@newsletter')
  ) {
    return false;
  }
  if (!session) return true;
  if (session.monitorMode === 'all') {
    return true;
  }
  return await isFromTarget(msg, session);
}

// Helper Pencari contextInfo yang memiliki quotedMessage secara Rekursif
function extractContextInfoRecursive(rawMsg, depth = 0) {
  if (!rawMsg || typeof rawMsg !== 'object' || depth > 8) return null;
  const unwrapped = unwrapOutgoingContainer(rawMsg);
  if (!unwrapped || typeof unwrapped !== 'object') return null;

  if (unwrapped.contextInfo?.quotedMessage) {
    return unwrapped.contextInfo;
  }

  for (const val of Object.values(unwrapped)) {
    if (val && typeof val === 'object' && !Array.isArray(val) && !Buffer.isBuffer(val) && !(val instanceof Uint8Array)) {
      if (val.contextInfo?.quotedMessage) {
        return val.contextInfo;
      }
      const deeper = extractContextInfoRecursive(val, depth + 1);
      if (deeper) return deeper;
    }
  }

  return null;
}

// Helper Inspeksi Aman untuk Protobuf / Objek WhatsApp (Anti Circular, Ringkas Buffer & String Panjang)
function safeInspect(obj, depth = 0) {
  if (depth > 3) return '[Object]';
  if (obj === null || obj === undefined) return String(obj);
  if (typeof obj !== 'object') {
    if (typeof obj === 'string' && obj.length > 80) {
      return `"${obj.slice(0, 80)}..." (${obj.length} chars)`;
    }
    return obj;
  }
  if (Buffer.isBuffer(obj) || obj instanceof Uint8Array) {
    return `<Buffer length=${obj.length || obj.byteLength}>`;
  }
  if (Array.isArray(obj)) {
    if (obj.length > 5) {
      return `[Array(${obj.length}) ${obj.slice(0, 3).map((x) => safeInspect(x, depth + 1)).join(', ')}...]`;
    }
    return `[${obj.map((x) => safeInspect(x, depth + 1)).join(', ')}]`;
  }
  const res = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'contextInfo' && depth > 0) continue;
    res[k] = safeInspect(v, depth + 1);
  }
  return res;
}

// Helper Pencatat ID Media yang Sudah Berhasil Ditangkap (Maks 300 Entri untuk Cegah Memory Leak)
function markCapturedId(session, id) {
  if (!session || !id) return;
  if (!session.capturedIds) session.capturedIds = new Set();
  session.capturedIds.add(String(id));
  if (session.capturedIds.size > 300) {
    const first = session.capturedIds.values().next().value;
    session.capturedIds.delete(first);
  }
}

// Helper Standardisasi Payload WA Vault (Anti React Error #31 - Semua Nilai Primitif)
function buildVaultPayload({
  id,
  senderNumber = '',
  senderName = 'Target',
  mediaType = 'text',
  mimeType = '',
  caption = '',
  text = '',
  textContent = '',
  fileName = '',
  fileSize = 0,
  isVoiceNote = false,
  isPtt = false,
  isViewOnce = false,
  isPending = false,
  isDeleted = false,
  deletedAt = null,
  isEdited = false,
  editedText = null,
  editedAt = null,
  sentAt = Date.now(),
  base64Data = ''
}) {
  const finalText = String(textContent || text || caption || '');
  const finalPtt = Boolean(isVoiceNote || isPtt);
  return {
    id: String(id || Date.now()),
    senderNumber: String(senderNumber || ''),
    senderName: String(senderName || 'Target'),
    mediaType: String(mediaType || 'text'),
    mimeType: String(mimeType || (mediaType === 'text' ? 'text/plain' : '')),
    caption: String(caption || ''),
    text: finalText,
    textContent: finalText,
    fileName: String(fileName || ''),
    fileSize: Number(fileSize || 0),
    isPtt: finalPtt,
    isVoiceNote: finalPtt,
    isViewOnce: Boolean(isViewOnce),
    isPending: Boolean(isPending),
    isDeleted: Boolean(isDeleted),
    deletedAt: deletedAt ? Number(deletedAt) : null,
    isEdited: Boolean(isEdited),
    editedText: editedText ? String(editedText) : null,
    editedAt: editedAt ? Number(editedAt) : null,
    sentAt: Number(sentAt || Date.now()),
    base64Data: typeof base64Data === 'string' ? base64Data : ''
  };
}

// Ekstraktor Universal Semua Jenis Pesan Masuk (Teks, Foto, Video, Audio/VN, Stiker, Dokumen, View Once)
function extractAnyMessageContent(rawMsg, inheritedViewOnce = false, depth = 0) {
  if (!rawMsg || typeof rawMsg !== 'object' || depth > 8) return null;

  const isVo =
    inheritedViewOnce ||
    Boolean(rawMsg.viewOnceMessage || rawMsg.viewOnceMessageV2 || rawMsg.viewOnceMessageV2Extension);

  // 1. Teks Biasa (conversation / extendedTextMessage)
  if (typeof rawMsg.conversation === 'string' && rawMsg.conversation.trim().length > 0) {
    return {
      contentType: 'text',
      mediaType: 'text',
      text: rawMsg.conversation,
      caption: '',
      isViewOnce: false
    };
  }

  if (rawMsg.extendedTextMessage?.text) {
    return {
      contentType: 'text',
      mediaType: 'text',
      text: rawMsg.extendedTextMessage.text,
      caption: '',
      isViewOnce: false
    };
  }

  // 2. Foto / Image
  if (rawMsg.imageMessage) {
    const isThisVo = isVo || Boolean(rawMsg.imageMessage.viewOnce);
    return {
      contentType: 'media',
      mediaType: 'image',
      mediaObj: rawMsg.imageMessage,
      unwrappedMessage: { imageMessage: rawMsg.imageMessage },
      mimeType: rawMsg.imageMessage.mimetype || 'image/jpeg',
      caption: rawMsg.imageMessage.caption || '',
      fileSize: Number(rawMsg.imageMessage.fileLength || 0),
      isViewOnce: isThisVo
    };
  }

  // 3. Video
  if (rawMsg.videoMessage) {
    const isThisVo = isVo || Boolean(rawMsg.videoMessage.viewOnce);
    return {
      contentType: 'media',
      mediaType: 'video',
      mediaObj: rawMsg.videoMessage,
      unwrappedMessage: { videoMessage: rawMsg.videoMessage },
      mimeType: rawMsg.videoMessage.mimetype || 'video/mp4',
      caption: rawMsg.videoMessage.caption || '',
      fileSize: Number(rawMsg.videoMessage.fileLength || 0),
      isViewOnce: isThisVo
    };
  }

  // 4. Audio / Voice Note (PTT)
  if (rawMsg.audioMessage) {
    const isThisVo = isVo || Boolean(rawMsg.audioMessage.viewOnce);
    const isPtt = Boolean(rawMsg.audioMessage.ptt);
    return {
      contentType: 'media',
      mediaType: 'audio',
      mediaObj: rawMsg.audioMessage,
      unwrappedMessage: { audioMessage: rawMsg.audioMessage },
      mimeType: rawMsg.audioMessage.mimetype || (isPtt ? 'audio/ogg; codecs=opus' : 'audio/mp4'),
      caption: '',
      fileSize: Number(rawMsg.audioMessage.fileLength || 0),
      isPtt,
      isViewOnce: isThisVo
    };
  }

  // 5. Stiker
  if (rawMsg.stickerMessage) {
    return {
      contentType: 'media',
      mediaType: 'sticker',
      mediaObj: rawMsg.stickerMessage,
      unwrappedMessage: { stickerMessage: rawMsg.stickerMessage },
      mimeType: rawMsg.stickerMessage.mimetype || 'image/webp',
      caption: '',
      fileSize: Number(rawMsg.stickerMessage.fileLength || 0),
      isViewOnce: false
    };
  }

  // 6. Dokumen / File
  if (rawMsg.documentMessage) {
    return {
      contentType: 'media',
      mediaType: 'document',
      mediaObj: rawMsg.documentMessage,
      unwrappedMessage: { documentMessage: rawMsg.documentMessage },
      mimeType: rawMsg.documentMessage.mimetype || 'application/octet-stream',
      fileName: rawMsg.documentMessage.fileName || rawMsg.documentMessage.title || 'Dokumen',
      caption: rawMsg.documentMessage.caption || '',
      fileSize: Number(rawMsg.documentMessage.fileLength || 0),
      isViewOnce: false
    };
  }

  // 7. Bongkar wrapper rekursif
  const wrappers = [
    'viewOnceMessage',
    'viewOnceMessageV2',
    'viewOnceMessageV2Extension',
    'ephemeralMessage',
    'deviceSentMessage',
    'editedMessage',
    'documentWithCaptionMessage',
    'associatedChildMessage',
    'futureProofMessage',
    'message'
  ];

  for (const w of wrappers) {
    if (rawMsg[w]?.message) {
      const res = extractAnyMessageContent(rawMsg[w].message, isVo, depth + 1);
      if (res) return res;
    } else if (rawMsg[w] && typeof rawMsg[w] === 'object' && w !== 'message') {
      const res = extractAnyMessageContent(rawMsg[w], isVo, depth + 1);
      if (res) return res;
    }
  }

  return null;
}

// Handler Terpadu Pemrosesan Pesan Masuk & Retry (3 Jalur View Once Vault)
async function processIncomingMessage(msg, currentSession, sock, sessionId) {
  if (!msg || !msg.key) return;

  const remoteJid = String(msg.key?.remoteJid || '');

  // 1. Langsung abaikan dan JANGAN log pesan dari grup, status, atau newsletter
  if (
    !remoteJid ||
    remoteJid.endsWith('@g.us') ||
    remoteJid === 'status@broadcast' ||
    remoteJid.endsWith('@newsletter')
  ) {
    return;
  }

  // PASSIVE LID LEARNING: Simpan setiap pasangan @lid <-> @s.whatsapp.net sebelum filter / pengecekan
  learnLidPair(msg.key, currentSession);

  // Cetak 1 baris log diagnostik bersih untuk SEMUA pesan chat pribadi SEBELUM filter !msg.message / fromMe
  console.log('[WA-VAULT][PRIVATE]', {
    from: msg.key?.remoteJid,
    alt: msg.key?.remoteJidAlt || msg.key?.senderPn,
    fromMe: msg.key?.fromMe,
    hasMessage: Boolean(msg.message),
    stubType: msg.messageStubType,
    stubParams: msg.messageStubParameters,
    protocolType: msg.message?.protocolMessage?.type,
    keys: Object.keys(msg.message || {})
  });

  // ANTI-DELETE & ANTI-EDIT: Deteksi Revoke (Tarik Pesan) & Pesan Diedit secara Real-Time
  const protocolMsg = msg.message?.protocolMessage;
  if (protocolMsg) {
    const pType = protocolMsg.type;

    // 0 = REVOKE (Pesan ditarik/dihapus oleh pengirim)
    if (pType === 0 || pType === 'REVOKE' || String(pType) === '0') {
      const targetId = protocolMsg.key?.id;
      if (targetId) {
        console.log(`[WA-VAULT][REVOKE] Pesan ID ${targetId} ditarik/dihapus oleh pengirim!`);
        io.to(sessionId).emit('vault-item-revoked', {
          id: String(targetId),
          deletedAt: Date.now()
        });
        io.to(sessionId).emit('vault-activity', {
          time: Date.now(),
          text: 'Target baru saja MENGHAPUS / MENARIK pesan (Anti-Delete aktif)!'
        });
      }
      return;
    }

    // 14 = MESSAGE_EDIT (Pesan diedit oleh pengirim)
    if (pType === 14 || pType === 'MESSAGE_EDIT' || String(pType) === '14') {
      const targetId = protocolMsg.key?.id;
      const editedContent = protocolMsg.editedMessage;
      const newText =
        editedContent?.conversation ||
        editedContent?.extendedTextMessage?.text ||
        '';
      if (targetId && newText) {
        console.log(`[WA-VAULT][EDIT] Pesan ID ${targetId} diedit! Teks baru: "${newText.slice(0, 40)}"`);
        io.to(sessionId).emit('vault-item-edited', {
          id: String(targetId),
          editedText: String(newText),
          editedAt: Date.now()
        });
        io.to(sessionId).emit('vault-activity', {
          time: Date.now(),
          text: 'Target baru saja MENGEDIT teks pesan (Anti-Edit aktif)!'
        });
      }
      return;
    }
  }

  // JALUR 3: Bedah protocolMessage (PEER_DATA_OPERATION_REQUEST_RESPONSE_MESSAGE / type 17)
  const isProtocolSync =
    msg.message?.protocolMessage?.type === 17 ||
    Boolean(msg.message?.protocolMessage?.peerDataOperationRequestResponseMessage) ||
    msg.message?.protocolMessage?.type === 16;

  const peerResults = msg.message?.protocolMessage?.peerDataOperationRequestResponseMessage?.peerDataOperationResult;
  if (Array.isArray(peerResults)) {
    for (const res of peerResults) {
      const bytes = res?.placeholderMessageResendResponse?.webMessageInfoBytes;
      if (bytes && proto?.WebMessageInfo?.decode) {
        try {
          const rawDecoded = proto.WebMessageInfo.decode(bytes);
          let decodedMsg = rawDecoded;
          try {
            if (typeof proto.WebMessageInfo.toObject === 'function') {
              decodedMsg =
                proto.WebMessageInfo.toObject(rawDecoded, {
                  longs: Number,
                  enums: String,
                  bytes: Buffer,
                  defaults: false
                }) || rawDecoded;
            }
          } catch (_) {
            decodedMsg = rawDecoded;
          }

          const peerRemoteJid = String(decodedMsg?.key?.remoteJid || '');
          if (
            !peerRemoteJid ||
            peerRemoteJid.endsWith('@g.us') ||
            peerRemoteJid === 'status@broadcast' ||
            peerRemoteJid.endsWith('@newsletter')
          ) {
            continue;
          }

          learnLidPair(decodedMsg?.key, currentSession);

          console.log('[WA-VAULT][PEER-DECODED]', {
            id: decodedMsg?.key?.id,
            remoteJid: decodedMsg?.key?.remoteJid,
            fromMe: decodedMsg?.key?.fromMe,
            inPendingUnavailable: Boolean(currentSession.pendingUnavailableIds?.has(decodedMsg?.key?.id)),
            keys: Object.keys(decodedMsg?.message || {}),
            hasImage: Boolean(
              decodedMsg?.message?.imageMessage ||
              decodedMsg?.message?.viewOnceMessage?.message?.imageMessage ||
              decodedMsg?.message?.viewOnceMessageV2?.message?.imageMessage
            ),
            hasVideo: Boolean(
              decodedMsg?.message?.videoMessage ||
              decodedMsg?.message?.viewOnceMessage?.message?.videoMessage ||
              decodedMsg?.message?.viewOnceMessageV2?.message?.videoMessage
            )
          });

          const isTargetPeer =
            Boolean(currentSession.pendingUnavailableIds?.has(decodedMsg?.key?.id)) ||
            (await isAllowedMessage(decodedMsg, currentSession));

          if (isTargetPeer && decodedMsg?.message) {
            let mediaExtraction = deepExtractViewOnce(decodedMsg.message);

            // FALLBACK PENTING: Jika deepExtractViewOnce null tapi ID ada di pendingUnavailableIds, cari image/video di level mana pun
            if (!mediaExtraction && currentSession.pendingUnavailableIds?.has(decodedMsg?.key?.id)) {
              const findMediaInObject = (obj, depth = 0) => {
                if (!obj || typeof obj !== 'object' || depth > 6) return null;
                if (obj.imageMessage) {
                  return {
                    mediaType: 'image',
                    mediaObj: obj.imageMessage,
                    unwrappedMessage: { imageMessage: obj.imageMessage }
                  };
                }
                if (obj.videoMessage) {
                  return {
                    mediaType: 'video',
                    mediaObj: obj.videoMessage,
                    unwrappedMessage: { videoMessage: obj.videoMessage }
                  };
                }
                for (const val of Object.values(obj)) {
                  if (val && typeof val === 'object') {
                    const found = findMediaInObject(val, depth + 1);
                    if (found) return found;
                  }
                }
                return null;
              };
              mediaExtraction = findMediaInObject(decodedMsg.message);
            }

            if (mediaExtraction) {
              const { mediaType, mediaObj } = mediaExtraction;

              io.to(sessionId).emit('vault-activity', {
                time: Date.now(),
                text: 'Media View Once target diterima via Peer Sync! Mendekripsi...'
              });

              const keyName = `${mediaType}Message`;
              const decryptResult = await decryptMediaLikeRvoBot(
                mediaObj,
                mediaType,
                keyName,
                decodedMsg.key,
                sock
              );

              const buffer = decryptResult?.buffer;

              if (buffer && buffer.length > 0) {
                const mimeType = decryptResult.mimeType || (mediaType === 'image' ? 'image/jpeg' : 'video/mp4');
                const base64Data = 'data:' + mimeType + ';base64,' + buffer.toString('base64');
                const sentAt = Number(decodedMsg.messageTimestamp) ? Number(decodedMsg.messageTimestamp) * 1000 : Date.now();

                const peerCardId =
                  decodedMsg.key?.id ||
                  currentSession.lastPendingViewOnceId ||
                  Date.now();

                const peerSenderPhone =
                  (await resolveJidToPhone(peerRemoteJid, currentSession, decodedMsg)) ||
                  peerRemoteJid.split('@')[0].split(':')[0] ||
                  'Target';
                const peerSenderName = String(
                  decodedMsg.pushName || (peerSenderPhone ? '+' + peerSenderPhone : 'Target')
                );

                const payload = buildVaultPayload({
                  id: String(peerCardId),
                  senderNumber: peerSenderPhone,
                  senderName: peerSenderName,
                  mediaType: String(mediaType),
                  mimeType: String(mimeType),
                  caption: String(mediaObj.caption || ''),
                  text: decryptResult.isThumbnail ? 'Pratinjau Thumbnail (File resolusi penuh dikunci WhatsApp di HP utama)' : '',
                  textContent: decryptResult.isThumbnail ? 'Pratinjau Thumbnail (File resolusi penuh dikunci WhatsApp di HP utama)' : '',
                  fileSize: buffer.length,
                  isViewOnce: true,
                  isPending: false,
                  sentAt: Number(sentAt),
                  base64Data
                });

                console.log(`[WA-VAULT Captured via Peer Sync] ${mediaType.toUpperCase()} (${buffer.length} bytes, thumb: ${decryptResult.isThumbnail}) dari +${peerSenderPhone}`);

                io.to(sessionId).emit('vault-item', payload);
                io.to(sessionId).emit('view-once-media', payload);
                io.to(sessionId).emit('vault-activity', {
                  time: Date.now(),
                  text: `Berhasil membuka media View Once dari +${peerSenderPhone} via Peer Sync!`
                });

                if (decodedMsg.key?.id) {
                  currentSession.pendingUnavailableIds?.delete(decodedMsg.key.id);
                  currentSession.pendingUnavailableMap?.delete(decodedMsg.key.id);
                  markCapturedId(currentSession, decodedMsg.key.id);
                }
                if (peerCardId) {
                  currentSession.pendingUnavailableMap?.delete(peerCardId);
                  markCapturedId(currentSession, peerCardId);
                }
                if (currentSession.lastPendingViewOnceId === decodedMsg.key?.id || currentSession.lastPendingViewOnceId === peerCardId) {
                  currentSession.lastPendingViewOnceId = null;
                }

                const room = io.sockets.adapter.rooms.get(sessionId);
                if (!room || room.size === 0) {
                  if (!currentSession.pendingMedia) currentSession.pendingMedia = [];
                  currentSession.pendingMedia.push(payload);
                  if (currentSession.pendingMedia.length > 20) {
                    currentSession.pendingMedia.shift();
                  }
                }
              } else {
                const errMsg = decryptResult?.error?.message || 'Buffer kosong';
                console.error('[WA-VAULT][PEER-DOWNLOAD-ERR]', errMsg);
                io.to(sessionId).emit('vault-activity', {
                  time: Date.now(),
                  text: 'Gagal mendekripsi media Peer Sync: ' + errMsg
                });
              }
            }
          }
        } catch (decErr) {
          console.warn('[WA-VAULT][PEER-DATA-RESEND] Gagal decode bytes:', decErr.message);
        }
      }
    }
  }

  // Jika ini pesan protokol sinkronisasi (misal protocolType: 17), hentikan di sini (JANGAN emit fromMe alert)
  if (isProtocolSync) {
    return;
  }

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

  const cleanPhone =
    (await resolveJidToPhone(remoteJid, currentSession, msg)) ||
    remoteJid.split('@')[0].split(':')[0] ||
    'Target';
  const senderName = String(msg.pushName || (cleanPhone ? '+' + cleanPhone : 'Kontak WhatsApp'));

  const isAllowed = await isAllowedMessage(msg, currentSession);

  // Simpan seluruh pesan aktif ke activeMessageStore untuk kebutuhan getMessage Baileys & anti-delete
  if (msg.message) {
    const msgId = String(msg.key?.id || Date.now());
    const initialExt = extractAnyMessageContent(msg.message);
    saveToActiveMessageStore(currentSession, msgId, {
      id: msgId,
      chatJid: remoteJid,
      senderNumber: cleanPhone,
      senderName,
      rawMsg: msg,
      mediaObj: initialExt?.mediaObj || null,
      mediaType: initialExt?.mediaType || null
    });
  }

  // Real-Time Capture & Pre-Fetch Instan di Detik ke-0 (Tanpa perlu menunggu di-reply!)
  if (msg.message && isAllowed && msg.key?.fromMe === false && isViewOnceMessage(msg)) {
    const voExtracted = extractAnyMessageContent(msg.message);
    if (voExtracted?.mediaObj) {
      const voMsgId = String(msg.key?.id || Date.now());
      const voItem = {
        id: voMsgId,
        chatJid: remoteJid,
        senderNumber: cleanPhone,
        senderName,
        mediaType: voExtracted.mediaType,
        mediaObj: voExtracted.mediaObj,
        rawMsg: msg,
        buffer: null,
        mimeType: voExtracted.mimeType || '',
        caption: voExtracted.caption || '',
        isViewOnce: true,
        createdAt: Date.now()
      };
      saveToViewOnceStore(currentSession, voMsgId, voItem);
      updateLatestChatViewOnce(currentSession, [remoteJid, cleanPhone, msg.key?.remoteJidAlt], voMsgId);

      downloadMediaStreamBuffer(voExtracted.mediaObj, voExtracted.mediaType, msg, msg.key, sock)
        .then((res) => {
          if (res?.buffer && res.buffer.length > 0) {
            voItem.buffer = res.buffer;
            const finalMime = res.mimeType || (voExtracted.mediaType === 'image' ? 'image/jpeg' : 'video/mp4');
            const base64Data = 'data:' + finalMime + ';base64,' + res.buffer.toString('base64');
            const payload = buildVaultPayload({
              id: voMsgId,
              senderNumber: cleanPhone,
              senderName,
              mediaType: voExtracted.mediaType,
              mimeType: finalMime,
              caption: voExtracted.caption || '',
              text: res.isThumbnail ? 'Pratinjau Thumbnail (File resolusi penuh dikunci WhatsApp di HP utama)' : '',
              textContent: res.isThumbnail ? 'Pratinjau Thumbnail (File resolusi penuh dikunci WhatsApp di HP utama)' : '',
              fileSize: res.buffer.length,
              isViewOnce: true,
              isPending: false,
              sentAt: Number(msg.messageTimestamp) ? Number(msg.messageTimestamp) * 1000 : Date.now(),
              base64Data
            });
            io.to(sessionId).emit('vault-item', payload);
            io.to(sessionId).emit('view-once-media', payload);
            io.to(sessionId).emit('vault-activity', {
              time: Date.now(),
              text: `Media Sekali Lihat (${voExtracted.mediaType.toUpperCase()}) dari +${cleanPhone} berhasil ditangkap & didekripsi instan!`
            });
            markCapturedId(currentSession, voMsgId);
          }
        })
        .catch((err) => {
          console.warn('[WA-VAULT][PREFETCH-ERR]', err.message);
        });
    }
  }

  // 2. Tangkap media <unavailable> (hasMessage: false) & emit kartu placeholder PENDING dengan auto-timeout 15s
  if (!msg.message) {
    if (isAllowed && msg.key?.fromMe === false) {
      const unavailableId = String(msg.key?.id || Date.now());
      currentSession.lastPendingViewOnceId = unavailableId;

      if (!currentSession.pendingUnavailableIds) currentSession.pendingUnavailableIds = new Set();
      currentSession.pendingUnavailableIds.add(unavailableId);

      savePendingUnavailable(currentSession, unavailableId, {
        key: msg.key,
        chatJid: remoteJid,
        senderNumber: cleanPhone,
        senderName
      });
      updateLatestChatViewOnce(currentSession, [remoteJid, cleanPhone, msg.key?.remoteJidAlt], unavailableId);

      // Buat placeholder kartu PENDING di web (isPending: true, mediaType: 'viewonce-pending')
      const placeholderPayload = buildVaultPayload({
        id: unavailableId,
        senderNumber: cleanPhone,
        senderName,
        mediaType: 'viewonce-pending',
        mimeType: '',
        caption: '',
        text: 'Meminta salinan dekripsi dari HP utama...',
        textContent: 'Meminta salinan dekripsi dari HP utama...',
        isViewOnce: true,
        isPending: true,
        sentAt: Number(msg.messageTimestamp) ? Number(msg.messageTimestamp) * 1000 : Date.now(),
        base64Data: null
      });

      io.to(sessionId).emit('vault-item', placeholderPayload);

      io.to(sessionId).emit('vault-activity', {
        time: Date.now(),
        text: `Media sekali lihat dari +${cleanPhone} masuk (status unavailable). Meminta salinan dekripsi dari HP utama...`
      });

      try {
        if (typeof sock?.requestPlaceholderResend === 'function') {
          console.log('[WA-VAULT] Meminta placeholder resend untuk unavailable key:', unavailableId);
          await sock.requestPlaceholderResend(msg.key);
        } else {
          console.warn('[WA-VAULT][RESEND-ERR] sock.requestPlaceholderResend tidak tersedia di Baileys.');
        }
      } catch (err) {
        console.log('[WA-VAULT][RESEND-ERR]', err.message);
      }

      // Auto-Timeout 15 Detik: Hentikan status loading jika HP utama tidak merespons
      // PENTING: DILARANG menghapus ID dari pendingUnavailableMap! (biarkan tersimpan 60 menit agar reply nanti tetap bisa membuka kartu)
      setTimeout(() => {
        console.log(`[WA-VAULT] Timeout 15s selesai untuk pending View Once ID: ${unavailableId}`);
        io.to(sessionId).emit('vault-item-update', {
          id: unavailableId,
          isPending: false,
          mediaType: 'viewonce-blocked',
          text: 'HP utama menolak mengirim otomatis. Coba balas (reply) pesan View Once di HP tanpa membukanya, atau buka langsung di HP (dibatasi protokol WhatsApp).',
          textContent: 'HP utama menolak mengirim otomatis. Coba balas (reply) pesan View Once di HP tanpa membukanya, atau buka langsung di HP (dibatasi protokol WhatsApp).'
        });
        io.to(sessionId).emit('vault-activity', {
          time: Date.now(),
          text: 'Permintaan otomatis selesai tanpa salinan dari HP utama. Silakan coba balas (reply) pesan View Once di HP.'
        });
      }, 15000);
    }
    return;
  }

  // JALUR 2: Deteksi Balasan (Reply / Quoted Message) Ala Bot WA .rvo Universal (fromMe: true maupun false)
  const ctx = extractContextInfoRecursive(msg.message);
  const quotedId = ctx?.stanzaId;
  const quotedMsg = ctx?.quotedMessage;

  if ((quotedMsg || quotedId) && isAllowed) {
    console.log('[WA-VAULT][REPLY-DETECTED]', {
      fromMe: msg.key?.fromMe,
      remoteJid,
      cleanPhone,
      quotedId,
      hasQuotedMsg: Boolean(quotedMsg)
    });
    if (quotedMsg) {
      console.log('[WA-VAULT][QUOTED-RAW]', safeInspect(quotedMsg));
    }

    const resolved = await resolveViewOnceItem(
      currentSession,
      remoteJid,
      cleanPhone,
      quotedId,
      quotedMsg,
      msg,
      sock
    );

    let targetCardId = quotedId || resolved?.id || currentSession.lastPendingViewOnceId || msg.key?.id;

    if (resolved) {
      const mediaType = resolved.mediaType || 'image';
      let buffer = resolved.buffer;
      let mimeType = resolved.mimeType;
      let isThumbnail = resolved.isThumbnail || false;

      if (!buffer && resolved.mediaObj) {
        io.to(sessionId).emit('vault-activity', {
          time: Date.now(),
          text: `Mendekripsi media (${mediaType}) via Reply Bypass...`
        });

        const decryptRes = await downloadMediaStreamBuffer(
          resolved.mediaObj,
          mediaType,
          resolved.rawMsg,
          resolved.keyContext || { remoteJid, id: targetCardId, fromMe: false },
          sock
        );

        if (decryptRes?.buffer && decryptRes.buffer.length > 0) {
          buffer = decryptRes.buffer;
          mimeType = decryptRes.mimeType;
          isThumbnail = decryptRes.isThumbnail;

          saveToViewOnceStore(currentSession, targetCardId, {
            ...resolved,
            id: targetCardId,
            buffer,
            mimeType,
            isThumbnail
          });
        }
      }

      if (buffer && buffer.length > 0) {
        const finalMime = mimeType || (mediaType === 'image' ? 'image/jpeg' : 'video/mp4');
        const base64Data = 'data:' + finalMime + ';base64,' + buffer.toString('base64');
        const sentAt = Number(msg.messageTimestamp) ? Number(msg.messageTimestamp) * 1000 : Date.now();

        const payload = buildVaultPayload({
          id: String(targetCardId || Date.now()),
          senderNumber: resolved.senderNumber || cleanPhone,
          senderName: resolved.senderName || senderName,
          mediaType: String(mediaType),
          mimeType: String(finalMime),
          caption: String(resolved.mediaObj?.caption || resolved.caption || ''),
          text: isThumbnail ? 'Pratinjau Thumbnail (File resolusi penuh dikunci WhatsApp di HP utama)' : '',
          textContent: isThumbnail ? 'Pratinjau Thumbnail (File resolusi penuh dikunci WhatsApp di HP utama)' : '',
          fileSize: buffer.length,
          isViewOnce: true,
          isPending: false,
          sentAt: Number(sentAt),
          base64Data
        });

        console.log(`[WA-VAULT Captured via Reply Bot] ${mediaType.toUpperCase()} (${buffer.length} bytes, thumb: ${isThumbnail}) dari +${resolved.senderNumber || cleanPhone}`);

        io.to(sessionId).emit('vault-item', payload);
        io.to(sessionId).emit('view-once-media', payload);
        io.to(sessionId).emit('vault-activity', {
          time: Date.now(),
          text: `Berhasil mendekripsi media ${mediaType.toUpperCase()} via Reply!`
        });

        if (targetCardId) {
          currentSession.pendingUnavailableIds?.delete(targetCardId);
          currentSession.pendingUnavailableMap?.delete(targetCardId);
          markCapturedId(currentSession, targetCardId);
        }
        if (currentSession.lastPendingViewOnceId === targetCardId) {
          currentSession.lastPendingViewOnceId = null;
        }
      } else if (msg.key?.fromMe === true && (currentSession.pendingUnavailableMap?.has(targetCardId) || currentSession.lastPendingViewOnceId === targetCardId)) {
        io.to(sessionId).emit('vault-item-update', {
          id: String(targetCardId),
          isPending: false,
          mediaType: 'viewonce-blocked',
          text: 'Reply terdeteksi, namun aplikasi WhatsApp di HP utama tidak mengirim kunci dekripsi (mediaKey kosong) ke perangkat tertaut.',
          textContent: 'Reply terdeteksi, namun aplikasi WhatsApp di HP utama tidak mengirim kunci dekripsi (mediaKey kosong) ke perangkat tertaut.'
        });
        io.to(sessionId).emit('vault-activity', {
          time: Date.now(),
          text: 'Reply terdeteksi, namun versi WhatsApp di HP memblokir pengiriman kunci media View Once ke perangkat tertaut.'
        });
      }
    } else if (msg.key?.fromMe === true && (currentSession.pendingUnavailableMap?.has(targetCardId) || currentSession.lastPendingViewOnceId === targetCardId)) {
      io.to(sessionId).emit('vault-item-update', {
        id: String(targetCardId),
        isPending: false,
        mediaType: 'viewonce-blocked',
        text: 'Reply terdeteksi, namun aplikasi WhatsApp di HP utama tidak mengirim kunci dekripsi (mediaKey kosong) ke perangkat tertaut.',
        textContent: 'Reply terdeteksi, namun aplikasi WhatsApp di HP utama tidak mengirim kunci dekripsi (mediaKey kosong) ke perangkat tertaut.'
      });
      io.to(sessionId).emit('vault-activity', {
        time: Date.now(),
        text: 'Reply terdeteksi, namun versi WhatsApp di HP memblokir pengiriman kunci media View Once ke perangkat tertaut.'
      });
    }
  }

  // Jika pesan dikirim dari diri sendiri (fromMe: true):
  if (msg.key?.fromMe === true) {
    const innerMsg = unwrapOutgoingContainer(msg.message);
    const viewOnceOut = deepExtractViewOnce(innerMsg || msg.message);
    if (viewOnceOut) {
      io.to(sessionId).emit('vault-activity', {
        time: Date.now(),
        text: 'Terdeteksi pesan View Once KELUAR (fromMe). Kirim dari HP target ke akun yang tertaut agar bisa ditangkap.'
      });
    }
    return;
  }

  // JALUR 1: Tangkap SEMUA jenis pesan masuk dari pengirim (fromMe: false)
  const extracted = extractAnyMessageContent(msg.message);

  if (!extracted) {
    return;
  }

  if (isAllowed) {
    // 1. Teks Biasa
    if (extracted.contentType === 'text') {
      const payload = buildVaultPayload({
        id: String(msg.key?.id || Date.now()),
        senderNumber: cleanPhone,
        senderName,
        mediaType: 'text',
        mimeType: 'text/plain',
        text: extracted.text,
        textContent: extracted.text,
        isViewOnce: false,
        sentAt: Number(msg.messageTimestamp) ? Number(msg.messageTimestamp) * 1000 : Date.now(),
        base64Data: ''
      });

      console.log(`[WA-VAULT Captured] TEKS dari +${cleanPhone} (${senderName}): "${extracted.text.slice(0, 40)}"`);

      io.to(sessionId).emit('vault-item', payload);
      io.to(sessionId).emit('vault-activity', {
        time: Date.now(),
        text: `Pesan teks dari +${cleanPhone} berhasil ditangkap & diamankan!`
      });

      const room = io.sockets.adapter.rooms.get(sessionId);
      if (!room || room.size === 0) {
        if (!currentSession.pendingMedia) currentSession.pendingMedia = [];
        currentSession.pendingMedia.push(payload);
        if (currentSession.pendingMedia.length > 20) currentSession.pendingMedia.shift();
      }
      return;
    }

    // 2. Media Masuk (Foto, Video, Audio/VN, Stiker, Dokumen, View Once)
    const { mediaType, mediaObj, unwrappedMessage, mimeType, caption, fileSize, isPtt, isViewOnce, fileName } = extracted;

    const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
    const MAX_DOC_BYTES = 15 * 1024 * 1024;

    if (mediaType === 'video' && fileSize > MAX_VIDEO_BYTES) {
      const payload = buildVaultPayload({
        id: String(msg.key?.id || Date.now()),
        senderNumber: cleanPhone,
        senderName,
        mediaType: 'video',
        mimeType: mimeType || 'video/mp4',
        caption: (caption || '') + ' [Ukuran video melebihi batas 25 MB]',
        fileSize,
        isViewOnce,
        sentAt: Number(msg.messageTimestamp) ? Number(msg.messageTimestamp) * 1000 : Date.now(),
        base64Data: null
      });
      io.to(sessionId).emit('vault-item', payload);
      io.to(sessionId).emit('vault-activity', {
        time: Date.now(),
        text: `Video dari +${cleanPhone} berukuran > 25 MB dicatat tanpa mengunduh buffer.`
      });
      return;
    }

    if (mediaType === 'document' && fileSize > MAX_DOC_BYTES) {
      const payload = buildVaultPayload({
        id: String(msg.key?.id || Date.now()),
        senderNumber: cleanPhone,
        senderName,
        mediaType: 'document',
        mimeType: mimeType || 'application/octet-stream',
        fileName: fileName || 'Dokumen',
        caption: (caption || '') + ' [Ukuran dokumen melebihi batas 15 MB]',
        fileSize,
        isViewOnce,
        sentAt: Number(msg.messageTimestamp) ? Number(msg.messageTimestamp) * 1000 : Date.now(),
        base64Data: null
      });
      io.to(sessionId).emit('vault-item', payload);
      io.to(sessionId).emit('vault-activity', {
        time: Date.now(),
        text: `Dokumen dari +${cleanPhone} berukuran > 15 MB dicatat tanpa mengunduh buffer.`
      });
      return;
    }

    io.to(sessionId).emit('vault-activity', {
      time: Date.now(),
      text: `${mediaType === 'audio' ? (isPtt ? 'Voice Note (VN)' : 'Audio') : mediaType.toUpperCase()}${isViewOnce ? ' (View Once)' : ''} dari +${cleanPhone} terdeteksi! Mendekripsi...`
    });

    const decryptResult = await downloadMediaStreamBuffer(
      mediaObj,
      mediaType,
      msg,
      msg.key,
      sock
    );

    const buffer = decryptResult?.buffer;

    if (!buffer || buffer.length === 0) {
      io.to(sessionId).emit('vault-activity', {
        time: Date.now(),
        text: 'Gagal mendekripsi media: ' + (decryptResult?.error?.message || 'Buffer kosong')
      });
      return;
    }

    const defaultMimes = {
      image: 'image/jpeg',
      video: 'video/mp4',
      audio: isPtt ? 'audio/ogg; codecs=opus' : 'audio/mp4',
      sticker: 'image/webp',
      document: 'application/octet-stream'
    };
    const finalMime = mimeType || defaultMimes[mediaType] || 'application/octet-stream';
    const base64Data = 'data:' + finalMime + ';base64,' + buffer.toString('base64');
    const sentAt = Number(msg.messageTimestamp) ? Number(msg.messageTimestamp) * 1000 : Date.now();

    const payload = buildVaultPayload({
      id: String(msg.key?.id || Date.now()),
      senderNumber: cleanPhone,
      senderName,
      mediaType,
      mimeType: finalMime,
      caption: caption || '',
      fileName: fileName || '',
      fileSize: buffer.length,
      isPtt,
      isViewOnce,
      sentAt,
      base64Data
    });

    console.log(`[WA-VAULT Captured] ${mediaType.toUpperCase()} (${buffer.length} bytes) dari +${cleanPhone} (${senderName})`);

    if (isViewOnce) {
      saveToViewOnceStore(currentSession, msg.key?.id, {
        id: msg.key?.id,
        chatJid: remoteJid,
        senderNumber: cleanPhone,
        senderName,
        mediaType,
        mediaObj,
        buffer,
        mimeType: finalMime,
        caption,
        isViewOnce: true,
        createdAt: Date.now()
      });
    }

    io.to(sessionId).emit('vault-item', payload);
    if (mediaType === 'image' || mediaType === 'video') {
      io.to(sessionId).emit('view-once-media', payload);
    }

    io.to(sessionId).emit('vault-activity', {
      time: Date.now(),
      text: `Berhasil menangkap ${mediaType.toUpperCase()}${isViewOnce ? ' Sekali Lihat' : ''} dari +${cleanPhone}!`
    });

    if (msg.key?.id) {
      markCapturedId(currentSession, msg.key.id);
    }

    const room = io.sockets.adapter.rooms.get(sessionId);
    if (!room || room.size === 0) {
      if (!currentSession.pendingMedia) currentSession.pendingMedia = [];
      currentSession.pendingMedia.push(payload);
      if (currentSession.pendingMedia.length > 20) {
        currentSession.pendingMedia.shift();
      }
    }
    return;
  } else if (remoteJid.endsWith('@lid') && (extracted.isViewOnce || extracted.contentType === 'media')) {
    // Pengirim @lid yang belum terpetakan saat mode single target (pertahankan jaring pengaman 1-klik)
    const { mediaType, mediaObj, unwrappedMessage, mimeType, caption } = extracted;
    const decryptResult = await downloadMediaStreamBuffer(
      mediaObj,
      mediaType,
      msg,
      msg.key,
      sock
    );

    const buffer = decryptResult?.buffer;

    if (buffer && buffer.length > 0) {
      const finalMime = mimeType || (mediaType === 'image' ? 'image/jpeg' : 'video/mp4');
      const base64Data = 'data:' + finalMime + ';base64,' + buffer.toString('base64');
      const sentAt = Number(msg.messageTimestamp) ? Number(msg.messageTimestamp) * 1000 : Date.now();

      const unmappedPayload = buildVaultPayload({
        id: String(msg.key?.id || Date.now()),
        senderNumber: cleanPhone,
        senderName: String(msg.pushName || 'Kontak Tanpa Nama'),
        mediaType,
        mimeType: finalMime,
        caption: caption || '',
        isViewOnce: Boolean(extracted.isViewOnce),
        sentAt,
        base64Data
      });

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
      text: 'Pesan dari nomor lain (bukan target terpantau) diabaikan.'
    });
  }
}

// Inisialisasi & Penghubung Baileys Anti-Putus & Anti-Bad MAC
async function startBaileys(sessionId, targetNumber = null, cleanAuth = false, monitorMode = 'all') {
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
      monitorMode: monitorMode || 'all',
      targetNumber: targetNumber ? normalizePhone(targetNumber) : null,
      targetJids: new Set(),
      confirmedTargetLids: new Set(),
      lidMap: new Map(),
      unmappedLidQueue: new Map(),
      pendingUnavailableIds: new Set(),
      capturedIds: new Set(),
      msgCache: new Map(),
      viewOnceStore: new Map(),
      activeMessageStore: new Map(),
      latestChatViewOnce: new Map(),
      pendingUnavailableMap: new Map(),
      msgRetryCounterCache: new NodeCache({ stdTTL: 600, useClones: false }),
      placeholderResendCache: new NodeCache({ stdTTL: 600, useClones: false }),
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
    if (monitorMode) session.monitorMode = monitorMode;
    if (!session.monitorMode) session.monitorMode = 'all';
    if (!session.viewOnceStore) session.viewOnceStore = new Map();
    if (!session.activeMessageStore) session.activeMessageStore = new Map();
    if (!session.latestChatViewOnce) session.latestChatViewOnce = new Map();
    if (!session.pendingUnavailableMap) session.pendingUnavailableMap = new Map();
    if (!session.confirmedTargetLids) session.confirmedTargetLids = new Set();
    if (!session.unmappedLidQueue) session.unmappedLidQueue = new Map();
    if (!session.pendingUnavailableIds) session.pendingUnavailableIds = new Set();
    if (!session.capturedIds) session.capturedIds = new Set();
    if (!session.msgCache) session.msgCache = new Map();
    if (!session.msgRetryCounterCache) {
      session.msgRetryCounterCache = new NodeCache({ stdTTL: 600, useClones: false });
    }
    if (!session.placeholderResendCache) {
      session.placeholderResendCache = new NodeCache({ stdTTL: 600, useClones: false });
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
      if (typeof fetchLatestBaileysVersion === 'function') {
        const fetched = await fetchLatestBaileysVersion();
        if (fetched?.version) {
          version = fetched.version;
        }
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
      browser: Browsers.ubuntu('Chrome'),
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => false,
      shouldIgnoreJid: (jid) => {
        if (!jid) return true;
        return jid.endsWith('@g.us') || jid === 'status@broadcast' || jid.endsWith('@newsletter');
      },
      markOnlineOnConnect: true,
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 20000,
      msgRetryCounterCache: session.msgRetryCounterCache,
      placeholderResendCache: session.placeholderResendCache,
      retryRequestDelayMs: 250,
      maxMsgRetryCount: 5,
      logger: baileysLogger,
      printQRInTerminal: false,
      getMessage: async (key) => {
        const fromActive = session.activeMessageStore?.get(key?.id)?.rawMsg?.message;
        if (fromActive) return fromActive;
        const cached = session.msgCache?.get(key?.id);
        return cached || undefined;
      }
    });

    session.sock = sock;

    // Listener paket mentah WhatsApp khusus chat pribadi untuk memantau stanza View Once
    sock.ws.on('CB:message', (node) => {
      const from = node?.attrs?.from || '';
      if (!from || from.endsWith('@g.us') || from === 'status@broadcast' || from.endsWith('@newsletter')) return;
      const childTags = Array.isArray(node?.content)
        ? node.content.map((c) => c?.tag + (c?.attrs?.mediatype ? ':' + c.attrs.mediatype : ''))
        : [];
      console.log('[WA-VAULT][RAW-NODE]', {
        from,
        participant: node?.attrs?.participant,
        type: node?.attrs?.type,
        category: node?.attrs?.category,
        childTags
      });
    });

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
          targetNumber: session.targetNumber || '',
          monitorMode: session.monitorMode || 'all'
        });
        io.to(sessionId).emit('status', { status: 'connected', phone });

        if (session.pendingMedia && session.pendingMedia.length > 0) {
          while (session.pendingMedia.length > 0) {
            const item = session.pendingMedia.shift();
            io.to(sessionId).emit('vault-item', item);
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
            message: 'Sesi keluar dari perangkat.',
            monitorMode: session.monitorMode || 'all'
          });
          io.to(sessionId).emit('status', { status: 'disconnected', reason: 'logged_out' });
        } else {
          session.status = 'reconnecting';
          io.to(sessionId).emit('session-status', {
            status: 'reconnecting',
            statusCode,
            monitorMode: session.monitorMode || 'all'
          });
          io.to(sessionId).emit('status', { status: 'reconnecting' });

          setTimeout(() => {
            if (sessions.has(sessionId)) {
              startBaileys(sessionId, session.targetNumber, false, session.monitorMode || 'all');
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
        const jid = String(msg?.key?.remoteJid || '');
        if (
          !jid ||
          jid.endsWith('@g.us') ||
          jid === 'status@broadcast' ||
          jid.endsWith('@newsletter')
        ) {
          continue;
        }
        learnLidPair(msg?.key, currentSession);
        await processIncomingMessage(msg, currentSession, sock, sessionId);
      }
    });

    // Listener retry pesan yang didekripsi belakangan oleh Baileys
    sock.ev.on('messages.update', async (updates) => {
      if (!Array.isArray(updates)) return;
      const currentSession = sessions.get(sessionId);
      if (!currentSession) return;

      for (const item of updates) {
        const key = item.key;
        const jid = String(key?.remoteJid || '');
        if (
          !jid ||
          jid.endsWith('@g.us') ||
          jid === 'status@broadcast' ||
          jid.endsWith('@newsletter')
        ) {
          continue;
        }
        const msgUpdate = item.update || item;
        if (msgUpdate.message) {
          const reconstructedMsg = {
            key,
            message: msgUpdate.message,
            messageTimestamp: msgUpdate.messageTimestamp || Math.floor(Date.now() / 1000),
            pushName: msgUpdate.pushName || ''
          };
          await processIncomingMessage(reconstructedMsg, currentSession, sock, sessionId);
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
  // Event 'set-monitor-mode' (Beralih antara Mode Semua Nomor / Kunci 1 Target)
  socket.on('set-monitor-mode', async (payload) => {
    try {
      const { sessionId, monitorMode, targetNumber } = payload || {};
      if (!sessionId) return;

      socket.join(sessionId);
      const session = sessions.get(sessionId);
      const cleanMode = monitorMode === 'single' ? 'single' : 'all';

      if (session) {
        session.monitorMode = cleanMode;
        if (targetNumber) {
          session.targetNumber = normalizePhone(targetNumber);
          await resolveTargetIdentifiers(session);
        }
        session.lastActive = Date.now();
      }

      io.to(sessionId).emit('monitor-mode-updated', {
        monitorMode: cleanMode,
        targetNumber: session?.targetNumber || targetNumber || ''
      });
      io.to(sessionId).emit('session-status', {
        status: session?.status || 'connecting',
        phone: session?.sock?.user?.id ? session.sock.user.id.split(':')[0] : '',
        targetNumber: session?.targetNumber || '',
        monitorMode: cleanMode
      });
      io.to(sessionId).emit('vault-activity', {
        time: Date.now(),
        text: cleanMode === 'all'
          ? 'Mode pemantauan diubah: Semua Nomor (Mode Bot WA aktif, pantau seluruh chat pribadi).'
          : `Mode pemantauan diubah: Kunci 1 Target (+${session?.targetNumber || 'belum disetel'}).`
      });
    } catch (err) {
      console.error('Error set-monitor-mode:', err.message);
      socket.emit('session-error', { message: 'Gagal mengubah mode pemantauan: ' + err.message });
    }
  });

  // Event 'resume-session' (Sinkronisasi Otomatis saat Klien Masuk/Reconnect)
  socket.on('resume-session', async (payload) => {
    try {
      const { sessionId, targetNumber, confirmedLids, monitorMode } = payload || {};
      if (!sessionId) return;

      socket.join(sessionId);

      let session = sessions.get(sessionId);

      if (session) {
        if (monitorMode) {
          session.monitorMode = monitorMode === 'single' ? 'single' : 'all';
        }
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
            targetNumber: session.targetNumber || '',
            monitorMode: session.monitorMode || 'all'
          });

          if (session.targetNumber) {
            socket.emit('target-synced', { targetNumber: session.targetNumber });
          }

          if (session.pendingMedia && session.pendingMedia.length > 0) {
            while (session.pendingMedia.length > 0) {
              const item = session.pendingMedia.shift();
              socket.emit('vault-item', item);
              socket.emit('view-once-media', item);
            }
          }
        } else if (session.status === 'qr_ready' && session.qrCode) {
          socket.emit('qr-code', { qr: session.qrCode, qrDataUrl: session.qrDataUrl });
          socket.emit('qr', { qr: session.qrCode, qrDataUrl: session.qrDataUrl });
        } else {
          socket.emit('session-status', {
            status: session.status,
            monitorMode: session.monitorMode || 'all'
          });
        }
        return;
      }

      // Jika belum di memori, periksa apakah folder auth ada di disk
      const sessionDir = getSessionDir(sessionId);
      const credsFile = path.join(sessionDir, 'creds.json');
      if (fs.existsSync(credsFile)) {
        session = await startBaileys(
          sessionId,
          targetNumber ? normalizePhone(targetNumber) : null,
          false,
          monitorMode || 'all'
        );
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

      socket.emit('session-status', {
        status: 'disconnected',
        monitorMode: monitorMode || 'all'
      });
    } catch (err) {
      console.error('Error resume-session:', err.message);
      socket.emit('session-status', { status: 'disconnected' });
    }
  });

  // Event 'set-target' (Kunci 1 Nomor Target Terpantau)
  socket.on('set-target', async (payload) => {
    try {
      const { sessionId, targetNumber, confirmedLids, monitorMode } = payload || {};
      if (!sessionId) return;

      socket.join(sessionId);

      const session = sessions.get(sessionId);
      const clean = targetNumber ? normalizePhone(targetNumber) : null;

      if (session) {
        if (monitorMode) {
          session.monitorMode = monitorMode === 'single' ? 'single' : 'all';
        }
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
          io.to(sessionId).emit('vault-item', finalPayload);
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
      const { sessionId, targetNumber, monitorMode } = payload || {};
      if (!sessionId || typeof sessionId !== 'string') {
        return socket.emit('session-error', { message: 'ID Sesi tidak valid.' });
      }

      socket.join(sessionId);

      let session = sessions.get(sessionId);

      if (session) {
        if (monitorMode) {
          session.monitorMode = monitorMode === 'single' ? 'single' : 'all';
        }
        session.lastActive = Date.now();
        if (targetNumber) {
          session.targetNumber = normalizePhone(targetNumber);
          await resolveTargetIdentifiers(session);
        }

        if (session.status === 'connected') {
          socket.emit('session-status', {
            status: session.status,
            phone: session.sock?.user?.id ? session.sock.user.id.split(':')[0] : '',
            targetNumber: session.targetNumber || '',
            monitorMode: session.monitorMode || 'all'
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
            targetNumber: session.targetNumber || '',
            monitorMode: session.monitorMode || 'all'
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

      session = await startBaileys(
        sessionId,
        targetNumber ? normalizePhone(targetNumber) : null,
        true,
        monitorMode || 'all'
      );
      socket.emit('session-status', {
        status: session.status,
        targetNumber: session.targetNumber,
        monitorMode: session.monitorMode || 'all'
      });
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
