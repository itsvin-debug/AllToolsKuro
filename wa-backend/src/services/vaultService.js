const baileysModule = require('@whiskeysockets/baileys');
const { downloadContentFromMessage, downloadMediaMessage } = baileysModule;

const { pinoSilent } = require('../config/waConfig');
const { getDeviceRoomSize, emitToDevice } = require('../utils/deviceAuth');
const {
  globalMediaDownloadQueue,
  normalizePhone,
  argbToHex,
  withTimeout,
  toCleanBuffer
} = require('../utils/mediaHelpers');
const {
  resolveJidToPhone,
  learnLidPair,
  upsertSavedContact,
  resolveDisplayName
} = require('./contactsService');

function buildVaultPayload({
  id,
  category = 'chat',
  senderNumber = '',
  senderLid = '',
  senderName = '',
  mediaType = 'text',
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
    senderLid: String(senderLid || ''),
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

function emitVaultItem(sessionId, session, payload) {
  emitToDevice(sessionId, 'vault-item', payload);

  if (payload.isViewOnce) {
    emitToDevice(sessionId, 'view-once-media', payload);
  }

  if (getDeviceRoomSize(sessionId) === 0) {
    if (!session.pendingMedia) session.pendingMedia = [];
    session.pendingMedia.push(payload);
    if (session.pendingMedia.length > 25) {
      session.pendingMedia.shift();
    }
  }
}

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

async function isAllowedByMode(senderInfo, msg, session) {
  if (!session) return false;
  if (session.monitorMode === 'all') return true;
  if (!session.targetNumber) return false;
  return await isFromTarget(msg, session);
}

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

async function processIncomingStatusMessage(msg, session, sourceTag = 'upsert') {
  if (!msg || !msg.key) return;
  const msgId = String(msg.key.id || '');
  if (!msgId) return;

  if (msg.key.fromMe) return;

  const msgTimestamp = Number(msg.messageTimestamp) ? Number(msg.messageTimestamp) * 1000 : Date.now();
  const nowTime = Date.now();
  if (nowTime - msgTimestamp > 24 * 60 * 60 * 1000) return;

  const unwrapped = unwrapStatusContent(msg.message);
  if (!unwrapped) return;

  if (unwrapped.type === 'protocol' && unwrapped.obj?.type === 0) {
    const targetKeyId = String(unwrapped.obj.key?.id || '');
    if (targetKeyId) {
      const deletedAt = Date.now();
      if (session.statusPointers?.has(targetKeyId)) {
        const ptr = session.statusPointers.get(targetKeyId);
        ptr.isDeleted = true;
        ptr.deletedAt = deletedAt;
      }
      emitToDevice(session.sessionId, 'vault-item-revoked', { id: targetKeyId, deletedAt });
      emitToDevice(session.sessionId, 'vault-activity', {
        time: deletedAt,
        text: 'Status WA telah ditarik/dihapus oleh pengirim (Anti-Delete aktif)!'
      });
    }
    return;
  }

  if (session.statusPointers?.has(msgId)) return;

  learnLidPair(msg.key, session);

  const senderJid = String(msg.key.participant || msg.key.participantAlt || msg.key.participantPn || msg.participant || '');
  const lidCandidate = [
    msg.key.participant,
    msg.key.participantAlt,
    senderJid
  ].find((j) => typeof j === 'string' && j.includes('@lid')) || '';

  const pnCandidate = [
    msg.key.participantPn,
    msg.key.senderPn,
    msg.key.participantAlt,
    senderJid
  ].find((j) => typeof j === 'string' && j && !j.includes('@lid') && j !== 'status@broadcast') || '';

  const cleanNumber = pnCandidate ? pnCandidate.split('@')[0].split(':')[0] : (senderJid ? senderJid.split('@')[0].split(':')[0] : '');
  let phone = !pnCandidate && senderJid.includes('@lid') ? '' : normalizePhone(cleanNumber);
  if ((!phone || phone.length < 7) && senderJid) {
    const resolvedP = await resolveJidToPhone(senderJid, session, msg);
    if (resolvedP) phone = resolvedP;
  }

  const pushName = String(msg.pushName || '').trim();
  const resolvedLid = lidCandidate || (phone && session.lidMap?.get(phone)) || '';

  if (pushName && (phone || senderJid || resolvedLid)) {
    upsertSavedContact(session, {
      id: senderJid,
      lid: resolvedLid,
      phoneNumber: phone,
      notify: pushName
    });
  }

  const senderName = resolveDisplayName(session, {
    senderJid,
    phone,
    lid: resolvedLid,
    pushName,
    isStatus: true
  });

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

  const pointer = {
    id: msgId,
    senderNumber: phone || cleanNumber || senderJid,
    senderLid: resolvedLid,
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

  const roomSize = getDeviceRoomSize(session.sessionId);

  if (roomSize === 0) {
    pointer.pendingDelivery = true;
    return;
  }

  const payload = buildVaultPayload({
    ...pointer,
    category: 'status',
    needsOnDemandLoad: mediaType !== 'text'
  });
  emitVaultItem(session.sessionId, session, payload);

  emitToDevice(session.sessionId, 'vault-activity', {
    time: Date.now(),
    text: `Status ${mediaType === 'audio' ? 'Audio/VN' : mediaType.toUpperCase()} dari ${senderName} tertangkap senyap (0 view)!`
  });

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
        emitToDevice(session.sessionId, 'vault-item-media-ready', {
          id: msgId,
          base64Data,
          mimeType: pointer.mimeType,
          mediaType: pointer.mediaType,
          fileSize: buffer.length
        });
      }
    }, session.sessionId);
  }
}

module.exports = {
  buildVaultPayload,
  emitVaultItem,
  downloadMediaStreamBuffer,
  isFromTarget,
  isAllowedByMode,
  deepExtractViewOnce,
  unwrapStatusContent,
  processIncomingStatusMessage
};
