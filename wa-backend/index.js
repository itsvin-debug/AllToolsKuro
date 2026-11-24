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
const IDLE_TIMEOUT_MS = 60 * 60 * 1000;

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
    service: 'AllToolsKuro WhatsApp Stealth Vault Backend',
    features: ['Ghost Reader (No Blue Ticks / Offline)', 'Anti-Delete & Edit', 'Silent Status Saver (0 Views)'],
    status: 'online',
    version: '2.0.0'
  });
});

// Socket.io dengan buffer 50 MB agar stream biner Base64 tidak terpotong
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || '*',
    methods: ['GET', 'POST']
  },
  maxHttpBufferSize: 5e7,
  pingTimeout: 60000,
  pingInterval: 25000
});

// Map penyimpan sesi aktif: sessionId -> session object
const sessions = new Map();

function getSessionDir(sessionId) {
  const cleanId = String(sessionId).replace(/[^a-zA-Z0-9_-]/g, '');
  const dirAuth = path.join(__dirname, `auth_info_${cleanId}`);
  const dirSessions = path.join(__dirname, 'sessions', cleanId);
  if (fs.existsSync(dirAuth)) return dirAuth;
  if (fs.existsSync(dirSessions)) return dirSessions;
  return dirAuth;
}

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

// Konversi ARGB integer WhatsApp (32-bit unsigned) ke format CSS Hex #RRGGBB
function argbToHex(argb) {
  if (typeof argb !== 'number' || Number.isNaN(argb)) return '#1e293b';
  const unsigned = argb >>> 0;
  const hex = (unsigned & 0xffffff).toString(16).padStart(6, '0');
  return `#${hex}`;
}

// Resolusi 2 Arah @lid <-> Nomor HP
async function resolveJidToPhone(jid, session, msg = null) {
  if (!jid || typeof jid !== 'string') return null;
  const cleanJid = jid.trim();

  if (msg?.key) {
    const altCandidate =
      msg.key.senderPn ||
      msg.key.participantPn ||
      msg.key.remoteJidAlt ||
      msg.key.participantAlt;
    if (altCandidate) {
      const rawAlt = typeof altCandidate === 'string'
        ? altCandidate.split('@')[0].split(':')[0]
        : String(altCandidate);
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

  if (cleanJid.endsWith('@s.whatsapp.net') || (!cleanJid.includes('@lid') && cleanJid.includes('@') && !cleanJid.endsWith('@broadcast'))) {
    const rawNumber = cleanJid.split('@')[0].split(':')[0];
    const phone = normalizePhone(rawNumber);
    if (phone) {
      if (session?.lidMap) session.lidMap.set(cleanJid, phone);
      return phone;
    }
  }

  if (cleanJid.endsWith('@lid') || cleanJid.includes('@lid')) {
    const lidId = cleanJid.split('@')[0].split(':')[0];

    if (session?.lidMap?.has(cleanJid)) return session.lidMap.get(cleanJid);
    if (session?.lidMap?.has(lidId)) return session.lidMap.get(lidId);

    try {
      if (session?.authKeys?.get) {
        const reverseData = await session.authKeys.get('lid-mapping', [lidId + '_reverse']);
        const reverseVal = reverseData?.[lidId + '_reverse'] || reverseData?.[lidId];
        if (reverseVal) {
          const rawPN = typeof reverseVal === 'string'
            ? reverseVal.split('@')[0].split(':')[0]
            : String(reverseVal);
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

// Pemetaan Identifiers Target
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

// Buka pembungkus pesan bersarang (ephemeralMessage, viewOnce, deviceSentMessage, dll.)
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
  if (rawMsg.associatedChildMessage?.message) {
    return unwrapOutgoingContainer(rawMsg.associatedChildMessage.message, depth + 1);
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

// Ekstrak pengirim lengkap (JID, nomor HP, nama kontak) untuk Chat maupun Status WA
async function resolveSenderInfo(msg, session) {
  const isStatus = msg.key?.remoteJid === 'status@broadcast';
  const rawSenderJid = isStatus
    ? (msg.key?.participant || msg.key?.participantPn || msg.participant || '')
    : (msg.key?.remoteJid || '');

  let cleanPhone = await resolveJidToPhone(rawSenderJid, session, msg);
  if (!cleanPhone && rawSenderJid) {
    cleanPhone = normalizePhone(rawSenderJid.split('@')[0].split(':')[0]);
  }

  let contactName = '';
  if (rawSenderJid && session?.contactNames?.has(rawSenderJid)) {
    contactName = session.contactNames.get(rawSenderJid);
  } else if (cleanPhone && session?.contactNames?.has(cleanPhone)) {
    contactName = session.contactNames.get(cleanPhone);
  } else if (msg.pushName) {
    contactName = String(msg.pushName).trim();
  }

  if (contactName && cleanPhone && session?.contactNames) {
    session.contactNames.set(rawSenderJid, contactName);
    session.contactNames.set(cleanPhone, contactName);
  }

  return {
    rawJid: rawSenderJid,
    cleanPhone: cleanPhone || '',
    contactName: contactName || (cleanPhone ? `+${cleanPhone}` : 'Kontak WhatsApp'),
    isStatus
  };
}

// Cek apakah pesan / status diizinkan berdasarkan mode pemantauan
function isAllowedByMode(senderInfo, msg, session) {
  if (!session) return true;
  if (session.monitorMode === 'all') return true;

  if (session.monitorMode === 'single') {
    if (!session.targetNumber) return false;
    const { rawJid, cleanPhone } = senderInfo;

    if (cleanPhone === session.targetNumber) return true;
    if (
      cleanPhone &&
      cleanPhone.length >= 9 &&
      session.targetNumber.length >= 9 &&
      cleanPhone.slice(-9) === session.targetNumber.slice(-9)
    ) {
      return true;
    }

    if (rawJid && session.targetJids && session.targetJids.has(rawJid)) return true;
    if (rawJid && session.confirmedTargetLids && session.confirmedTargetLids.has(rawJid)) return true;

    return false;
  }

  return true;
}

function withTimeout(promise, ms, errorMsg = 'Timeout') {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(errorMsg)), ms))
  ]);
}

function toCleanBuffer(val) {
  if (!val) return null;
  if (Buffer.isBuffer(val)) return Buffer.from(val);
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

// Validasi Magic Bytes Buffer Media (Cegah penyimpanan buffer corrupt / HTML error)
function isValidMediaBuffer(buf, type) {
  if (!buf || !Buffer.isBuffer(buf) || buf.length < 4) return false;
  const t = String(type || '').toLowerCase();

  // 1. Gambar (JPEG, PNG, WEBP, GIF)
  if (t === 'image' || t === 'imagemessage') {
    if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return true;
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return true;
    if (buf.length >= 12 && buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return true;
    if (buf.length >= 4 && buf.slice(0, 4).toString('latin1') === 'GIF8') return true;
    return false;
  }

  // 2. Video / PTV (MP4, MOV, MKV, WEBM)
  if (t === 'video' || t === 'videomessage' || t === 'ptv' || t === 'ptvmessage') {
    if (buf.length >= 4 && buf[0] === 0x1A && buf[1] === 0x45 && buf[2] === 0xDF && buf[3] === 0xA3) return true;
    const header64 = buf.slice(0, Math.min(buf.length, 64)).toString('latin1');
    if (
      header64.includes('ftyp') ||
      header64.includes('moov') ||
      header64.includes('mdat') ||
      header64.includes('wide')
    ) {
      return true;
    }
    return false;
  }

  // 3. Audio / Voice Note (OGG, MP3, M4A/MP4, WAV)
  if (t === 'audio' || t === 'audiomessage') {
    if (buf.slice(0, 4).toString('latin1') === 'OggS') return true;
    if (buf.slice(0, 3).toString('latin1') === 'ID3') return true;
    if (buf.length >= 2 && buf[0] === 0xFF && (buf[1] & 0xE0) === 0xE0) return true;
    if (buf.length >= 8 && buf.slice(4, 8).toString('latin1') === 'ftyp') return true;
    if (buf.length >= 12 && buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WAVE') return true;
    return false;
  }

  // 4. Stiker: Hanya WebP
  if (t === 'sticker' || t === 'stickermessage') {
    if (buf.length >= 12 && buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return true;
    return false;
  }

  // 5. Dokumen atau unknown: tolak halaman error HTML / JSON
  const checkLen = Math.min(buf.length, 64);
  const startStr = buf.slice(0, checkLen).toString('utf8').trim().toLowerCase();
  if (
    startStr.startsWith('<html') ||
    startStr.startsWith('<!doc') ||
    startStr.startsWith('{"error"') ||
    startStr.startsWith('{"status"') ||
    startStr.startsWith('{"code"')
  ) {
    return false;
  }

  return buf.length > 16;
}

// Pengunduh 3-Tier Media Buffer dari Pesan WhatsApp
async function downloadMediaStreamBuffer(mediaObj, type, rawMsg = null, keyContext = null, sock = null) {
  if (!mediaObj) {
    return { buffer: null, isThumbnail: false, mimeType: '', error: new Error('Media object kosong') };
  }

  const cleanMedia = {
    ...mediaObj,
    ...(mediaObj.mediaKey ? { mediaKey: toCleanBuffer(mediaObj.mediaKey) } : {}),
    ...(mediaObj.fileEncSha256 ? { fileEncSha256: toCleanBuffer(mediaObj.fileEncSha256) } : {}),
    ...(mediaObj.fileSha256 ? { fileSha256: toCleanBuffer(mediaObj.fileSha256) } : {})
  };

  const downloadType =
    type === 'sticker' ? 'sticker' :
    type === 'document' ? 'document' :
    type === 'audio' ? 'audio' :
    type === 'video' || type === 'ptv' ? 'video' : 'image';
  const keyName = `${downloadType}Message`;

  const reuploadFn = sock?.updateMediaMessage ? sock.updateMediaMessage.bind(sock) : undefined;

  let buffer = null;
  let lastError = null;

  // Tier 1 (timeout 20s): downloadContentFromMessage
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
  }

  // Tier 2 (timeout 15s): downloadMediaMessage dengan rawMsg lengkap
  if ((!buffer || buffer.length === 0) && rawMsg) {
    try {
      const buf2 = await withTimeout(
        downloadMediaMessage(
          rawMsg,
          'buffer',
          {},
          { logger: baileysLogger, reuploadRequest: reuploadFn }
        ),
        15000,
        'Tier 2 timeout 15s'
      );
      if (buf2 && buf2.length > 0 && isValidMediaBuffer(buf2, downloadType)) {
        buffer = buf2;
      }
    } catch (err2) {
      lastError = err2;
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
          { logger: baileysLogger, reuploadRequest: reuploadFn }
        ),
        15000,
        'Tier 3 timeout 15s'
      );
      if (buf3 && buf3.length > 0 && isValidMediaBuffer(buf3, downloadType)) {
        buffer = buf3;
      }
    } catch (err3) {
      lastError = err3;
    }
  }

  // Tier 4: Fallback Thumbnail jika file utama di-strip
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
    error: lastError || new Error('Gagal mendekripsi buffer media')
  };
}

// Generator Schema Bersih Terpadu untuk Vault Frontend
function buildVaultPayload({
  id,
  category = 'chat', // 'chat' | 'status'
  senderNumber = '',
  senderName = 'Kontak WhatsApp',
  mediaType = 'text',
  mimeType = '',
  caption = '',
  text = '',
  textContent = '',
  bgColor = null,
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
    category: category === 'status' ? 'status' : 'chat',
    senderNumber: String(senderNumber || ''),
    senderName: String(senderName || 'Kontak WhatsApp'),
    mediaType: String(mediaType || 'text'),
    mimeType: String(mimeType || (mediaType === 'text' ? 'text/plain' : '')),
    caption: String(caption || ''),
    text: finalText,
    textContent: finalText,
    bgColor: bgColor ? String(bgColor) : null,
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

// Ekstraktor Universal Konten Pesan Masuk (Chat Pribadi & Status)
function extractAnyMessageContent(rawMsg, inheritedViewOnce = false, depth = 0) {
  if (!rawMsg || typeof rawMsg !== 'object' || depth > 8) return null;

  const isVo =
    inheritedViewOnce ||
    Boolean(rawMsg.viewOnceMessage || rawMsg.viewOnceMessageV2 || rawMsg.viewOnceMessageV2Extension);

  // 1. Teks Biasa
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
      backgroundArgb: rawMsg.extendedTextMessage.backgroundArgb,
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
      mimeType: rawMsg.videoMessage.mimetype || 'video/mp4',
      caption: rawMsg.videoMessage.caption || '',
      fileSize: Number(rawMsg.videoMessage.fileLength || 0),
      isViewOnce: isThisVo
    };
  }

  // 4. Video Note (ptvMessage)
  if (rawMsg.ptvMessage) {
    const isThisVo = isVo || Boolean(rawMsg.ptvMessage.viewOnce);
    return {
      contentType: 'media',
      mediaType: 'video',
      mediaObj: rawMsg.ptvMessage,
      mimeType: rawMsg.ptvMessage.mimetype || 'video/mp4',
      caption: rawMsg.ptvMessage.caption || '',
      fileSize: Number(rawMsg.ptvMessage.fileLength || 0),
      isViewOnce: isThisVo
    };
  }

  // 5. Audio / Voice Note (PTT)
  if (rawMsg.audioMessage) {
    const isThisVo = isVo || Boolean(rawMsg.audioMessage.viewOnce);
    const isPtt = Boolean(rawMsg.audioMessage.ptt);
    return {
      contentType: 'media',
      mediaType: 'audio',
      mediaObj: rawMsg.audioMessage,
      mimeType: rawMsg.audioMessage.mimetype || (isPtt ? 'audio/ogg; codecs=opus' : 'audio/mp4'),
      caption: '',
      fileSize: Number(rawMsg.audioMessage.fileLength || 0),
      isPtt,
      isViewOnce: isThisVo
    };
  }

  // 6. Stiker
  if (rawMsg.stickerMessage) {
    return {
      contentType: 'media',
      mediaType: 'sticker',
      mediaObj: rawMsg.stickerMessage,
      mimeType: rawMsg.stickerMessage.mimetype || 'image/webp',
      caption: '',
      fileSize: Number(rawMsg.stickerMessage.fileLength || 0),
      isViewOnce: false
    };
  }

  // 7. Dokumen
  if (rawMsg.documentMessage) {
    return {
      contentType: 'media',
      mediaType: 'document',
      mediaObj: rawMsg.documentMessage,
      mimeType: rawMsg.documentMessage.mimetype || 'application/octet-stream',
      fileName: rawMsg.documentMessage.fileName || rawMsg.documentMessage.title || 'Dokumen',
      caption: rawMsg.documentMessage.caption || '',
      fileSize: Number(rawMsg.documentMessage.fileLength || 0),
      isViewOnce: false
    };
  }

  // 8. Pembungkus Rekursif
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

// Simpan jejak pesan aktif di memory server (RAM Safe max 200 item)
function recordActiveMessage(session, msgId, data) {
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

// Handler Terpadu Pemrosesan Pesan: Ghost Reader, Anti-Delete/Edit, & Silent Status Saver
async function processIncomingMessage(msg, currentSession, sock, sessionId) {
  if (!msg || !msg.key) return;

  const remoteJid = String(msg.key?.remoteJid || '');

  // 1. Abaikan pesan dari grup (@g.us) dan saluran (@newsletter)
  if (!remoteJid || remoteJid.endsWith('@g.us') || remoteJid.endsWith('@newsletter')) {
    return;
  }

  learnLidPair(msg.key, currentSession);

  // 2. Deteksi Protokol Revoke (Anti-Delete) & Edit (Anti-Edit)
  const protocolMsg = msg.message?.protocolMessage;
  if (protocolMsg) {
    const pType = protocolMsg.type;

    // 0 = REVOKE (Pesan ditarik oleh pengirim)
    if (pType === 0 || pType === 'REVOKE' || String(pType) === '0') {
      const targetId = protocolMsg.key?.id;
      if (targetId) {
        console.log(`[WA-VAULT][REVOKE] Pesan ID ${targetId} ditarik/dihapus pengirim!`);
        io.to(sessionId).emit('vault-item-revoked', {
          id: String(targetId),
          deletedAt: Date.now()
        });
        io.to(sessionId).emit('vault-activity', {
          time: Date.now(),
          text: 'Pesan ditarik/dihapus oleh pengirim (Anti-Delete aktif, pesan tetap aman di browser)!'
        });
      }
      return;
    }

    // 14 = MESSAGE_EDIT (Teks pesan diedit oleh pengirim)
    if (pType === 14 || pType === 'MESSAGE_EDIT' || String(pType) === '14') {
      const targetId = protocolMsg.key?.id;
      const editedContent = protocolMsg.editedMessage;
      const newText =
        editedContent?.conversation ||
        editedContent?.extendedTextMessage?.text ||
        '';
      if (targetId && newText) {
        console.log(`[WA-VAULT][EDIT] Pesan ID ${targetId} diedit! Teks: "${newText.slice(0, 40)}"`);
        io.to(sessionId).emit('vault-item-edited', {
          id: String(targetId),
          editedText: String(newText),
          editedAt: Date.now()
        });
        io.to(sessionId).emit('vault-activity', {
          time: Date.now(),
          text: 'Teks pesan telah diedit oleh pengirim (Anti-Edit aktif)!'
        });
      }
      return;
    }

    // Abaikan protokol non-konten lain
    return;
  }

  // Jangan proses pesan yang kita kirim sendiri (fromMe)
  if (msg.key?.fromMe === true) {
    return;
  }

  // 3. Resolusi Data Pengirim Lengkap
  const senderInfo = await resolveSenderInfo(msg, currentSession);

  // 4. Verifikasi Izin berdasarkan Mode Pemantauan (Semua Nomor vs Kunci 1 Target)
  if (!isAllowedByMode(senderInfo, msg, currentSession)) {
    return;
  }

  const { cleanPhone, contactName, isStatus } = senderInfo;
  const msgId = String(msg.key?.id || Date.now());
  const sentAt = Number(msg.messageTimestamp) ? Number(msg.messageTimestamp) * 1000 : Date.now();

  // Cegah duplikasi proses
  if (!currentSession.capturedIds) currentSession.capturedIds = new Set();
  if (currentSession.capturedIds.has(msgId)) return;

  // -------------------------------------------------------------
  // PIPELINE 3: SILENT STATUS SAVER (Intip Status WA Kontak - 0 Views)
  // -------------------------------------------------------------
  if (isStatus) {
    const rawStatusMsg = unwrapOutgoingContainer(msg.message);
    const extractedStatus = extractAnyMessageContent(rawStatusMsg || msg.message);

    if (!extractedStatus) return;

    currentSession.capturedIds.add(msgId);
    if (currentSession.capturedIds.size > 500) {
      const first = currentSession.capturedIds.values().next().value;
      currentSession.capturedIds.delete(first);
    }

    // A. Status Teks Berwarna
    if (extractedStatus.contentType === 'text') {
      const hexColor = argbToHex(extractedStatus.backgroundArgb);
      const statusPayload = buildVaultPayload({
        id: msgId,
        category: 'status',
        senderNumber: cleanPhone,
        senderName: contactName,
        mediaType: 'text',
        mimeType: 'text/plain',
        textContent: extractedStatus.text,
        bgColor: hexColor,
        sentAt,
        base64Data: ''
      });

      console.log(`[WA-STATUS Captured] Teks dari +${cleanPhone} (${contactName}) [${hexColor}]: "${extractedStatus.text.slice(0, 30)}"`);
      io.to(sessionId).emit('vault-item', statusPayload);
      io.to(sessionId).emit('vault-activity', {
        time: Date.now(),
        text: `Status teks baru dari ${contactName} tersimpan (0 View - Senyap)!`
      });

      recordActiveMessage(currentSession, msgId, statusPayload);
      return;
    }

    // B. Status Media (Foto atau Video)
    if (extractedStatus.contentType === 'media') {
      const { mediaType, mediaObj, caption, fileSize } = extractedStatus;
      const MAX_STATUS_VIDEO = 25 * 1024 * 1024;

      if (mediaType === 'video' && fileSize > MAX_STATUS_VIDEO) {
        const statusPayload = buildVaultPayload({
          id: msgId,
          category: 'status',
          senderNumber: cleanPhone,
          senderName: contactName,
          mediaType: 'video',
          mimeType: 'video/mp4',
          caption: (caption || '') + ' [Ukuran video SW melebihi batas 25 MB]',
          fileSize,
          sentAt,
          base64Data: ''
        });
        io.to(sessionId).emit('vault-item', statusPayload);
        return;
      }

      if (!currentSession.inFlightDownloads) currentSession.inFlightDownloads = new Set();
      if (currentSession.inFlightDownloads.has(msgId)) return;
      currentSession.inFlightDownloads.add(msgId);

      io.to(sessionId).emit('vault-activity', {
        time: Date.now(),
        text: `Mengunduh Status ${mediaType.toUpperCase()} dari ${contactName} (Mode Senyap)...`
      });

      let decryptResult = null;
      try {
        decryptResult = await downloadMediaStreamBuffer(mediaObj, mediaType, msg, msg.key, sock);
      } finally {
        currentSession.inFlightDownloads.delete(msgId);
      }

      const buffer = decryptResult?.buffer;
      if (!buffer || buffer.length === 0) {
        console.warn(`[WA-STATUS] Gagal mengunduh status media:`, decryptResult?.error?.message);
        return;
      }

      const finalMime = decryptResult.mimeType || (mediaType === 'image' ? 'image/jpeg' : 'video/mp4');
      const base64Data = 'data:' + finalMime + ';base64,' + buffer.toString('base64');

      const statusPayload = buildVaultPayload({
        id: msgId,
        category: 'status',
        senderNumber: cleanPhone,
        senderName: contactName,
        mediaType,
        mimeType: finalMime,
        caption: caption || '',
        fileSize: buffer.length,
        sentAt,
        base64Data
      });

      console.log(`[WA-STATUS Captured] ${mediaType.toUpperCase()} (${buffer.length} bytes) dari ${contactName}`);
      io.to(sessionId).emit('vault-item', statusPayload);
      io.to(sessionId).emit('vault-activity', {
        time: Date.now(),
        text: `Status ${mediaType === 'image' ? 'Foto' : 'Video'} dari ${contactName} tersimpan (0 View - Senyap)!`
      });

      recordActiveMessage(currentSession, msgId, statusPayload);
      return;
    }

    return;
  }

  // -------------------------------------------------------------
  // PIPELINE 1 & 2: GHOST READER & ANTI-DELETE (Chat Pribadi Masuk)
  // -------------------------------------------------------------
  const extracted = extractAnyMessageContent(msg.message);
  if (!extracted) return;

  currentSession.capturedIds.add(msgId);
  if (currentSession.capturedIds.size > 500) {
    const first = currentSession.capturedIds.values().next().value;
    currentSession.capturedIds.delete(first);
  }

  // 1. Pesan Teks
  if (extracted.contentType === 'text') {
    const payload = buildVaultPayload({
      id: msgId,
      category: 'chat',
      senderNumber: cleanPhone,
      senderName: contactName,
      mediaType: 'text',
      mimeType: 'text/plain',
      textContent: extracted.text,
      sentAt,
      base64Data: ''
    });

    console.log(`[WA-CHAT Captured] TEKS dari +${cleanPhone} (${contactName}): "${extracted.text.slice(0, 35)}"`);
    io.to(sessionId).emit('vault-item', payload);
    io.to(sessionId).emit('vault-activity', {
      time: Date.now(),
      text: `Chat masuk dari ${contactName} dibaca senyap (tanpa centang biru & offline)!`
    });

    recordActiveMessage(currentSession, msgId, payload);
    return;
  }

  // 2. Pesan Media (Foto, Video, Audio/VN, Stiker, Dokumen, View Once)
  if (extracted.contentType === 'media') {
    const { mediaType, mediaObj, mimeType, caption, fileSize, isPtt, isViewOnce, fileName } = extracted;
    const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
    const MAX_DOC_BYTES = 15 * 1024 * 1024;

    if (mediaType === 'video' && fileSize > MAX_VIDEO_BYTES) {
      const payload = buildVaultPayload({
        id: msgId,
        category: 'chat',
        senderNumber: cleanPhone,
        senderName: contactName,
        mediaType: 'video',
        mimeType: mimeType || 'video/mp4',
        caption: (caption || '') + ' [Ukuran video melebihi batas 25 MB]',
        fileSize,
        isViewOnce,
        sentAt,
        base64Data: ''
      });
      io.to(sessionId).emit('vault-item', payload);
      return;
    }

    if (mediaType === 'document' && fileSize > MAX_DOC_BYTES) {
      const payload = buildVaultPayload({
        id: msgId,
        category: 'chat',
        senderNumber: cleanPhone,
        senderName: contactName,
        mediaType: 'document',
        mimeType: mimeType || 'application/octet-stream',
        fileName: fileName || 'Dokumen',
        caption: (caption || '') + ' [Ukuran dokumen melebihi batas 15 MB]',
        fileSize,
        isViewOnce,
        sentAt,
        base64Data: ''
      });
      io.to(sessionId).emit('vault-item', payload);
      return;
    }

    if (!currentSession.inFlightDownloads) currentSession.inFlightDownloads = new Set();
    if (currentSession.inFlightDownloads.has(msgId)) return;
    currentSession.inFlightDownloads.add(msgId);

    io.to(sessionId).emit('vault-activity', {
      time: Date.now(),
      text: `${mediaType === 'audio' ? (isPtt ? 'Voice Note' : 'Audio') : mediaType.toUpperCase()}${isViewOnce ? ' (Sekali Lihat)' : ''} dari ${contactName} terdeteksi! Mendekripsi...`
    });

    let decryptResult = null;
    try {
      decryptResult = await downloadMediaStreamBuffer(mediaObj, mediaType, msg, msg.key, sock);
    } finally {
      currentSession.inFlightDownloads.delete(msgId);
    }

    const buffer = decryptResult?.buffer;
    if (!buffer || buffer.length === 0) {
      console.warn(`[WA-CHAT] Gagal mendekripsi media ${mediaType}:`, decryptResult?.error?.message);
      return;
    }

    const defaultMimes = {
      image: 'image/jpeg',
      video: 'video/mp4',
      audio: isPtt ? 'audio/ogg; codecs=opus' : 'audio/mp4',
      sticker: 'image/webp',
      document: 'application/octet-stream'
    };
    const finalMime = mimeType || decryptResult.mimeType || defaultMimes[mediaType] || 'application/octet-stream';
    const base64Data = 'data:' + finalMime + ';base64,' + buffer.toString('base64');

    const payload = buildVaultPayload({
      id: msgId,
      category: 'chat',
      senderNumber: cleanPhone,
      senderName: contactName,
      mediaType,
      mimeType: finalMime,
      caption: caption || '',
      fileName: fileName || '',
      fileSize: buffer.length,
      isPtt,
      isVoiceNote: isPtt,
      isViewOnce,
      sentAt,
      base64Data
    });

    console.log(`[WA-CHAT Captured] ${mediaType.toUpperCase()} (${buffer.length} bytes) dari ${contactName}`);

    io.to(sessionId).emit('vault-item', payload);
    if (mediaType === 'image' || mediaType === 'video') {
      io.to(sessionId).emit('view-once-media', payload);
    }

    io.to(sessionId).emit('vault-activity', {
      time: Date.now(),
      text: `${mediaType === 'audio' ? (isPtt ? 'Voice Note' : 'Audio') : mediaType.toUpperCase()}${isViewOnce ? ' Sekali Lihat' : ''} dari ${contactName} berhasil diamankan!`
    });

    recordActiveMessage(currentSession, msgId, payload);
    return;
  }
}

// Inisialisasi & Penghubung Baileys dalam Mode Siluman Penuh (Full Stealth)
async function startBaileys(sessionId, targetNumber = null, cleanAuth = false, monitorMode = 'all') {
  let session = sessions.get(sessionId);

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
      contactNames: new Map(),
      capturedIds: new Set(),
      inFlightDownloads: new Set(),
      msgCache: new Map(),
      activeMessageStore: new Map(),
      msgRetryCounterCache: new NodeCache({ stdTTL: 600, useClones: false }),
      placeholderResendCache: new NodeCache({ stdTTL: 600, useClones: false }),
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
    if (!session.inFlightDownloads) session.inFlightDownloads = new Set();
    if (!session.capturedIds) session.capturedIds = new Set();
    if (!session.contactNames) session.contactNames = new Map();
    if (!session.activeMessageStore) session.activeMessageStore = new Map();
    if (!session.confirmedTargetLids) session.confirmedTargetLids = new Set();
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

    await new Promise((resolve) => setTimeout(resolve, 300));

    const sessionDir = getSessionDir(sessionId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    let version = [2, 3000, 1019741512];
    try {
      if (typeof fetchLatestBaileysVersion === 'function') {
        const fetched = await fetchLatestBaileysVersion();
        if (fetched?.version) {
          version = fetched.version;
        }
      }
    } catch (verErr) {
      console.warn(`[Session ${sessionId}] fetchLatestBaileysVersion error: ${verErr.message}`);
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    session.authKeys = state.keys;

    // PROTOKOL SILUMAN PENUH:
    // 1. markOnlineOnConnect: false (Jangan pernah tampil online saat tersambung)
    // 2. shouldIgnoreJid: HANYA abaikan grup (@g.us) & newsletter (@newsletter). JANGAN abaikan status@broadcast!
    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, baileysLogger)
      },
      browser: Browsers.macOS('Desktop'),
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => false,
      shouldIgnoreJid: (jid) => {
        if (!jid) return true;
        return jid.endsWith('@g.us') || jid.endsWith('@newsletter');
      },
      markOnlineOnConnect: false,
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

    sock.ev.on('creds.update', saveCreds);

    // Pembelajaran Nama Kontak & Mapping LID
    const handleContactsSync = (contactsList) => {
      if (!Array.isArray(contactsList)) return;
      for (const c of contactsList) {
        const phone = normalizePhone(c.id);
        const name = (c.name || c.notify || c.verifiedName || '').trim();
        if (c.lid && phone) {
          session.lidMap.set(c.lid, phone);
          session.lidMap.set(phone, c.lid);
        }
        if (name) {
          if (c.id) session.contactNames.set(c.id, name);
          if (phone) session.contactNames.set(phone, name);
          if (c.lid) session.contactNames.set(c.lid, name);
        }
      }
    };

    sock.ev.on('contacts.upsert', handleContactsSync);
    sock.ev.on('contacts.update', handleContactsSync);
    sock.ev.on('messaging-history.set', (payload) => {
      if (Array.isArray(payload?.contacts)) handleContactsSync(payload.contacts);
    });

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

        // MODE SILUMAN: Set presence ke 'unavailable' (Offline)
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
          targetNumber: session.targetNumber || '',
          monitorMode: session.monitorMode || 'all'
        });
        io.to(sessionId).emit('status', { status: 'connected', phone });
        io.to(sessionId).emit('vault-activity', {
          time: Date.now(),
          text: 'WhatsApp terhubung dalam Mode Siluman (Ghost Reader, Anti-Delete, & Silent Status Saver aktif).'
        });
      }

      if (connection === 'close') {
        session.isInitializing = false;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const isLoggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 401;

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

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify' && type !== 'append') return;
      const currentSession = sessions.get(sessionId);
      if (!currentSession) return;

      for (const msg of messages) {
        const jid = String(msg?.key?.remoteJid || '');
        if (!jid || jid.endsWith('@g.us') || jid.endsWith('@newsletter')) {
          continue;
        }
        learnLidPair(msg?.key, currentSession);
        await processIncomingMessage(msg, currentSession, sock, sessionId);
      }
    });

    sock.ev.on('messages.update', async (updates) => {
      if (!Array.isArray(updates)) return;
      const currentSession = sessions.get(sessionId);
      if (!currentSession) return;

      for (const item of updates) {
        const key = item.key;
        const jid = String(key?.remoteJid || '');
        if (!jid || jid.endsWith('@g.us') || jid.endsWith('@newsletter')) {
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

// -------------------------------------------------------------
// EVENT HANDLERS SOCKET.IO
// -------------------------------------------------------------
io.on('connection', (socket) => {
  // Ganti Mode Pemantauan (Semua Nomor vs Kunci 1 Target)
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
          ? 'Mode Pemantauan: SEMUA NOMOR aktif (memantau seluruh chat pribadi & status kontak).'
          : `Mode Pemantauan: KUNCI 1 TARGET (+${session?.targetNumber || 'belum disetel'}).`
      });
    } catch (err) {
      console.error('Error set-monitor-mode:', err.message);
      socket.emit('session-error', { message: 'Gagal mengubah mode pemantauan: ' + err.message });
    }
  });

  // Sambung Ulang Sesi (Auto-Resume)
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
          session.targetNumber = normalizePhone(targetNumber);
        }

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

      const sessionDir = getSessionDir(sessionId);
      const credsFile = path.join(sessionDir, 'creds.json');
      if (fs.existsSync(credsFile)) {
        session = await startBaileys(
          sessionId,
          targetNumber ? normalizePhone(targetNumber) : null,
          false,
          monitorMode || 'all'
        );
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

  // Kunci Target Baru
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

  // Ikat ID @lid Kontak Tersembunyi
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
        text: 'ID kontak berhasil diikat ke nomor target terpantau!'
      });
    } catch (err) {
      console.error('Error confirm-target-lid:', err.message);
    }
  });

  // Abaikan ID Tersembunyi
  socket.on('dismiss-unmapped-lid', (payload) => {
    try {
      const { sessionId } = payload || {};
      if (!sessionId) return;
      io.to(sessionId).emit('vault-activity', {
        time: Date.now(),
        text: 'Pesan dari ID tersembunyi diabaikan.'
      });
    } catch (_) {}
  });

  // Mulai Sesi WhatsApp Baru (Generate QR Code)
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

  // Logout / Putuskan Sesi
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
  console.log(`[AllToolsKuro] WA Stealth Vault Backend v2.0.0 aktif di port ${PORT}`);
});
