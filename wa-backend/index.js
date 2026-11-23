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
  makeCacheableSignalKeyStore,
  Browsers,
  proto
} = require('@whiskeysockets/baileys');
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

// Helper Standardisasi Payload WA Vault (Anti React Error #31 - Semua Nilai Primitif)
function buildVaultPayload({
  id,
  senderNumber = '',
  senderName = 'Target',
  mediaType = 'text',
  mimeType = '',
  caption = '',
  text = '',
  fileName = '',
  fileSize = 0,
  isPtt = false,
  isViewOnce = false,
  isDeleted = false,
  deletedAt = null,
  isEdited = false,
  editedText = null,
  editedAt = null,
  sentAt = Date.now(),
  base64Data = null
}) {
  return {
    id: String(id || Date.now()),
    senderNumber: String(senderNumber || ''),
    senderName: String(senderName || 'Target'),
    mediaType: String(mediaType || 'text'),
    mimeType: String(mimeType || ''),
    caption: String(caption || ''),
    text: String(text || ''),
    fileName: String(fileName || ''),
    fileSize: Number(fileSize || 0),
    isPtt: Boolean(isPtt),
    isViewOnce: Boolean(isViewOnce),
    isDeleted: Boolean(isDeleted),
    deletedAt: deletedAt ? Number(deletedAt) : null,
    isEdited: Boolean(isEdited),
    editedText: editedText ? String(editedText) : null,
    editedAt: editedAt ? Number(editedAt) : null,
    sentAt: Number(sentAt || Date.now()),
    base64Data: typeof base64Data === 'string' ? base64Data : null
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
            (await isFromTarget(decodedMsg, currentSession));

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
              const { mediaType, mediaObj, unwrappedMessage } = mediaExtraction;
              if (mediaObj.mediaKey && !Buffer.isBuffer(mediaObj.mediaKey)) {
                try {
                  mediaObj.mediaKey = Buffer.from(mediaObj.mediaKey);
                } catch (_) {}
              }

              io.to(sessionId).emit('vault-activity', {
                time: Date.now(),
                text: 'Media View Once target diterima via Peer Sync! Mendekripsi...'
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
                console.warn(`[WA-VAULT][PEER-DECODE] Tahap 1 gagal (${err1.message}), mencoba Tahap 2 fallback...`);
              }

              if (!buffer || buffer.length === 0) {
                try {
                  buffer = await downloadMediaMessage(
                    { key: decodedMsg.key, message: unwrappedMessage },
                    'buffer',
                    {},
                    { logger: baileysLogger, reuploadRequest: sock.updateMediaMessage }
                  );
                } catch (err2) {
                  errDetail = err2.message;
                  console.error('[WA-VAULT][PEER-DOWNLOAD-ERR] Tahap 2 gagal:', err2.message);
                }
              }

              if (buffer && buffer.length > 0) {
                const mimeType = mediaObj.mimetype || (mediaType === 'image' ? 'image/jpeg' : 'video/mp4');
                const base64Data = 'data:' + mimeType + ';base64,' + buffer.toString('base64');
                const sentAt = Number(decodedMsg.messageTimestamp) ? Number(decodedMsg.messageTimestamp) * 1000 : Date.now();

                const payload = buildVaultPayload({
                  id: String(decodedMsg.key?.id || Date.now()),
                  senderNumber: currentSession.targetNumber,
                  senderName: String(decodedMsg.pushName || (currentSession.targetNumber ? '+' + currentSession.targetNumber : 'Target')),
                  mediaType: String(mediaType),
                  mimeType: String(mimeType),
                  caption: String(mediaObj.caption || ''),
                  fileSize: buffer.length,
                  isViewOnce: true,
                  sentAt: Number(sentAt),
                  base64Data
                });

                console.log(`[WA-VAULT Captured via Peer Sync] ${mediaType.toUpperCase()} (${buffer.length} bytes) dari target +${currentSession.targetNumber}`);

                io.to(sessionId).emit('vault-item', payload);
                io.to(sessionId).emit('view-once-media', payload);
                io.to(sessionId).emit('vault-activity', {
                  time: Date.now(),
                  text: 'Berhasil membuka media View Once dari target via Peer Sync!'
                });

                const room = io.sockets.adapter.rooms.get(sessionId);
                if (!room || room.size === 0) {
                  if (!currentSession.pendingMedia) currentSession.pendingMedia = [];
                  currentSession.pendingMedia.push(payload);
                  if (currentSession.pendingMedia.length > 20) {
                    currentSession.pendingMedia.shift();
                  }
                }
              } else {
                console.error('[WA-VAULT][PEER-DOWNLOAD-ERR]', errDetail || 'Buffer kosong');
                io.to(sessionId).emit('vault-activity', {
                  time: Date.now(),
                  text: 'Gagal mendekripsi media Peer Sync: ' + (errDetail || 'Buffer kosong')
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

  const matched = await isFromTarget(msg, currentSession);

  // 2. Tangkap media <unavailable> (hasMessage: false) & emit kartu placeholder ber-ID sama
  if (!msg.message) {
    if (matched && msg.key?.fromMe === false) {
      if (!currentSession.pendingUnavailableIds) currentSession.pendingUnavailableIds = new Set();
      if (msg.key?.id) {
        if (currentSession.pendingUnavailableIds.size >= 50) {
          const first = currentSession.pendingUnavailableIds.values().next().value;
          currentSession.pendingUnavailableIds.delete(first);
        }
        currentSession.pendingUnavailableIds.add(msg.key.id);
      }

      // Buat placeholder kartu di web sehingga pengguna langsung tahu ada media sekali lihat masuk
      const placeholderPayload = buildVaultPayload({
        id: String(msg.key?.id || Date.now()),
        senderNumber: currentSession.targetNumber,
        senderName: String(msg.pushName || (currentSession.targetNumber ? '+' + currentSession.targetNumber : 'Target')),
        mediaType: 'viewonce-blocked',
        mimeType: '',
        caption: 'Media sekali lihat terenkripsi (status unavailable). Menunggu respon dekripsi dari HP utama...',
        isViewOnce: true,
        sentAt: Number(msg.messageTimestamp) ? Number(msg.messageTimestamp) * 1000 : Date.now(),
        base64Data: null
      });

      io.to(sessionId).emit('vault-item', placeholderPayload);

      io.to(sessionId).emit('vault-activity', {
        time: Date.now(),
        text: 'Media sekali lihat dari target masuk (status unavailable). Meminta salinan dekripsi dari HP utama...'
      });

      try {
        if (typeof sock?.requestPlaceholderResend === 'function') {
          console.log('[WA-VAULT] Meminta placeholder resend untuk unavailable key:', msg.key?.id);
          await sock.requestPlaceholderResend(msg.key);
        } else {
          console.warn('[WA-VAULT][RESEND-ERR] sock.requestPlaceholderResend tidak tersedia di Baileys.');
        }
      } catch (err) {
        console.log('[WA-VAULT][RESEND-ERR]', err.message);
      }
    }
    return;
  }

  // JALUR 2: Bypass "Reply / Quoted Message" ala bot WA (.rvo tanpa perintah khusus)
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
      let quotedViewOnce = deepExtractViewOnce(ctx.quotedMessage);
      const isQuotedInUnavailable = ctx.stanzaId && currentSession.pendingUnavailableIds?.has(ctx.stanzaId);

      if (!quotedViewOnce) {
        if (
          ctx.quotedMessage?.imageMessage &&
          (ctx.quotedMessage.imageMessage.viewOnce === true ||
            isQuotedInUnavailable ||
            ctx.quotedMessage.viewOnceMessage ||
            ctx.quotedMessage.viewOnceMessageV2 ||
            (ctx.quotedMessage.imageMessage.mediaKey && (ctx.quotedMessage.imageMessage.url || ctx.quotedMessage.imageMessage.directPath)))
        ) {
          quotedViewOnce = {
            mediaType: 'image',
            mediaObj: ctx.quotedMessage.imageMessage,
            unwrappedMessage: { imageMessage: ctx.quotedMessage.imageMessage }
          };
        } else if (
          ctx.quotedMessage?.videoMessage &&
          (ctx.quotedMessage.videoMessage.viewOnce === true ||
            isQuotedInUnavailable ||
            ctx.quotedMessage.viewOnceMessage ||
            ctx.quotedMessage.viewOnceMessageV2 ||
            (ctx.quotedMessage.videoMessage.mediaKey && (ctx.quotedMessage.videoMessage.url || ctx.quotedMessage.videoMessage.directPath)))
        ) {
          quotedViewOnce = {
            mediaType: 'video',
            mediaObj: ctx.quotedMessage.videoMessage,
            unwrappedMessage: { videoMessage: ctx.quotedMessage.videoMessage }
          };
        }
      }

      if (quotedViewOnce) {
        const { mediaType, mediaObj, unwrappedMessage } = quotedViewOnce;
        if (mediaObj.mediaKey && !Buffer.isBuffer(mediaObj.mediaKey)) {
          try {
            mediaObj.mediaKey = Buffer.from(mediaObj.mediaKey);
          } catch (_) {}
        }

        io.to(sessionId).emit('vault-activity', {
          time: Date.now(),
          text: 'Terdeteksi balasan (reply) pesan View Once target! Mendekripsi via jalur Reply Bypass...'
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
          console.warn(`[WA-VAULT][REPLY-BYPASS] Tahap 1 gagal (${err1.message}), mencoba Tahap 2 fallback...`);
        }

        if (!buffer || buffer.length === 0) {
          try {
            buffer = await downloadMediaMessage(
              {
                key: {
                  remoteJid,
                  id: ctx.stanzaId || msg.key?.id,
                  fromMe: false
                },
                message: unwrappedMessage
              },
              'buffer',
              {},
              { logger: baileysLogger, reuploadRequest: sock.updateMediaMessage }
            );
          } catch (err2) {
            errDetail = err2.message;
            console.error('[WA-VAULT][REPLY-BYPASS] Tahap 2 juga gagal:', err2.message);
          }
        }

        if (buffer && buffer.length > 0) {
          const mimeType = mediaObj.mimetype || (mediaType === 'image' ? 'image/jpeg' : 'video/mp4');
          const base64Data = 'data:' + mimeType + ';base64,' + buffer.toString('base64');
          const sentAt = Number(msg.messageTimestamp) ? Number(msg.messageTimestamp) * 1000 : Date.now();

          const payload = buildVaultPayload({
            id: String(ctx.stanzaId || msg.key?.id || Date.now()),
            senderNumber: currentSession.targetNumber,
            senderName: String(currentSession.targetNumber ? '+' + currentSession.targetNumber : 'Target'),
            mediaType: String(mediaType),
            mimeType: String(mimeType),
            caption: String(mediaObj.caption || ''),
            fileSize: buffer.length,
            isViewOnce: true,
            sentAt: Number(sentAt),
            base64Data
          });

          console.log(`[WA-VAULT Captured via Reply Bypass] ${mediaType.toUpperCase()} (${buffer.length} bytes) dari target +${currentSession.targetNumber}`);

          io.to(sessionId).emit('vault-item', payload);
          io.to(sessionId).emit('view-once-media', payload);
          io.to(sessionId).emit('vault-activity', {
            time: Date.now(),
            text: 'Berhasil membuka View Once via jalur Reply Bypass!'
          });

          const room = io.sockets.adapter.rooms.get(sessionId);
          if (!room || room.size === 0) {
            if (!currentSession.pendingMedia) currentSession.pendingMedia = [];
            currentSession.pendingMedia.push(payload);
            if (currentSession.pendingMedia.length > 20) {
              currentSession.pendingMedia.shift();
            }
          }
          return;
        } else {
          io.to(sessionId).emit('vault-activity', {
            time: Date.now(),
            text: 'Gagal mendekripsi media quoted reply: ' + (errDetail || 'Buffer kosong')
          });
          return;
        }
      }
    }

    // Peringatan fromMe HANYA jika bukan protocol sync, bukan reply yang memuat media, dan memang View Once keluar
    const viewOnceOut = deepExtractViewOnce(msg.message);
    if (viewOnceOut) {
      io.to(sessionId).emit('vault-activity', {
        time: Date.now(),
        text: 'Terdeteksi pesan View Once KELUAR (fromMe). Kirim dari HP target ke akun yang tertaut agar bisa ditangkap.'
      });
    }
    return;
  }

  // JALUR 1: Tangkap SEMUA jenis pesan masuk dari target (fromMe: false)
  const extracted = extractAnyMessageContent(msg.message);

  if (!extracted) {
    return;
  }

  if (matched) {
    // 1. Teks Biasa dari Target
    if (extracted.contentType === 'text') {
      const payload = buildVaultPayload({
        id: String(msg.key?.id || Date.now()),
        senderNumber: currentSession.targetNumber,
        senderName: String(msg.pushName || (currentSession.targetNumber ? '+' + currentSession.targetNumber : 'Target')),
        mediaType: 'text',
        mimeType: 'text/plain',
        text: extracted.text,
        isViewOnce: false,
        sentAt: Number(msg.messageTimestamp) ? Number(msg.messageTimestamp) * 1000 : Date.now(),
        base64Data: null
      });

      console.log(`[WA-VAULT Captured] TEKS dari target +${currentSession.targetNumber}: "${extracted.text.slice(0, 40)}"`);

      io.to(sessionId).emit('vault-item', payload);
      io.to(sessionId).emit('vault-activity', {
        time: Date.now(),
        text: 'Pesan teks dari target berhasil ditangkap & diamankan!'
      });

      const room = io.sockets.adapter.rooms.get(sessionId);
      if (!room || room.size === 0) {
        if (!currentSession.pendingMedia) currentSession.pendingMedia = [];
        currentSession.pendingMedia.push(payload);
        if (currentSession.pendingMedia.length > 20) currentSession.pendingMedia.shift();
      }
      return;
    }

    // 2. Media dari Target (Foto, Video, Audio/VN, Stiker, Dokumen)
    const { mediaType, mediaObj, unwrappedMessage, mimeType, caption, fileSize, isPtt, isViewOnce, fileName } = extracted;

    const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
    const MAX_DOC_BYTES = 15 * 1024 * 1024;

    // Batasi ukuran video (maks 25 MB)
    if (mediaType === 'video' && fileSize > MAX_VIDEO_BYTES) {
      const payload = buildVaultPayload({
        id: String(msg.key?.id || Date.now()),
        senderNumber: currentSession.targetNumber,
        senderName: String(msg.pushName || (currentSession.targetNumber ? '+' + currentSession.targetNumber : 'Target')),
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
        text: 'Video dari target berukuran > 25 MB dicatat tanpa mengunduh buffer.'
      });
      return;
    }

    // Batasi ukuran dokumen (maks 15 MB)
    if (mediaType === 'document' && fileSize > MAX_DOC_BYTES) {
      const payload = buildVaultPayload({
        id: String(msg.key?.id || Date.now()),
        senderNumber: currentSession.targetNumber,
        senderName: String(msg.pushName || (currentSession.targetNumber ? '+' + currentSession.targetNumber : 'Target')),
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
        text: 'Dokumen dari target berukuran > 15 MB dicatat tanpa mengunduh buffer.'
      });
      return;
    }

    io.to(sessionId).emit('vault-activity', {
      time: Date.now(),
      text: `${mediaType === 'audio' ? (isPtt ? 'Voice Note (VN)' : 'Audio') : mediaType.toUpperCase()}${isViewOnce ? ' (View Once)' : ''} dari target terdeteksi! Mendekripsi...`
    });

    let buffer = null;
    let errDetail = '';

    if (mediaObj?.mediaKey && !Buffer.isBuffer(mediaObj.mediaKey)) {
      try {
        mediaObj.mediaKey = Buffer.from(mediaObj.mediaKey);
      } catch (_) {}
    }

    try {
      const stream = await downloadContentFromMessage(mediaObj, mediaType === 'sticker' ? 'sticker' : mediaType);
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
      senderNumber: currentSession.targetNumber,
      senderName: String(msg.pushName || (currentSession.targetNumber ? '+' + currentSession.targetNumber : 'Target')),
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

    console.log(`[WA-VAULT Captured] ${mediaType.toUpperCase()} (${buffer.length} bytes) dari target +${currentSession.targetNumber}`);

    io.to(sessionId).emit('vault-item', payload);
    if (mediaType === 'image' || mediaType === 'video') {
      io.to(sessionId).emit('view-once-media', payload);
    }

    io.to(sessionId).emit('vault-activity', {
      time: Date.now(),
      text: `Berhasil menangkap ${mediaType.toUpperCase()}${isViewOnce ? ' Sekali Lihat' : ''} dari target!`
    });

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
    // Pengirim @lid yang belum terpetakan (pertahankan jaring pengaman 1-klik)
    const { mediaType, mediaObj, unwrappedMessage, mimeType, caption } = extracted;
    let buffer = null;
    try {
      const stream = await downloadContentFromMessage(mediaObj, mediaType === 'sticker' ? 'sticker' : mediaType);
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
      const finalMime = mimeType || (mediaType === 'image' ? 'image/jpeg' : 'video/mp4');
      const base64Data = 'data:' + finalMime + ';base64,' + buffer.toString('base64');
      const sentAt = Number(msg.messageTimestamp) ? Number(msg.messageTimestamp) * 1000 : Date.now();

      const unmappedPayload = buildVaultPayload({
        id: String(msg.key?.id || Date.now()),
        senderNumber: currentSession.targetNumber,
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
      text: 'Pesan dari nomor lain (bukan target terkunci) diabaikan.'
    });
  }
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
      pendingUnavailableIds: new Set(),
      msgCache: new Map(),
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
    if (!session.confirmedTargetLids) session.confirmedTargetLids = new Set();
    if (!session.unmappedLidQueue) session.unmappedLidQueue = new Map();
    if (!session.pendingUnavailableIds) session.pendingUnavailableIds = new Set();
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
      browser: Browsers.ubuntu('Chrome'),
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => false,
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
          targetNumber: session.targetNumber || ''
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
              socket.emit('vault-item', item);
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
