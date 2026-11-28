const fs = require('fs');
const path = require('path');
const baileysModule = require('@whiskeysockets/baileys');
const { sessions } = require('../state/sessionStore');
const { verifyDeviceOwner, emitToDevice, joinExclusiveDeviceRoom } = require('../services/deviceAuthService');
const { getSessionDir } = require('../utils/authFiles');
const { rememberSentMessage, getSentMessage, triggerAuthSnapshotSync } = require('./whatsappSessionHandler');
const { inspectProtobufWire, unwrapMessageContent } = require('../utils/protoWireInspector');

function readInstalledBaileysVersion() {
  try {
    const pkgPath = path.join(__dirname, '../../node_modules/@whiskeysockets/baileys/package.json');
    const parsed = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    if (parsed?.version) return String(parsed.version);
  } catch (_) {}
  return 'unknown';
}

const BAILEYS_VERSION = readInstalledBaileysVersion();

const {
  proto,
  generateMessageIDV2,
  generateMessageID,
  downloadMediaMessage,
  downloadContentFromMessage,
  jidNormalizedUser: baileysJidNorm
} = baileysModule;

const jidNormalizedUser =
  baileysJidNorm ||
  ((jid = '') => {
    const clean = String(jid || '').trim();
    const userPart = clean.split('@')[0].split(':')[0];
    return userPart ? `${userPart}@s.whatsapp.net` : '';
  });

const MAX_STICKER_BYTES = 1024 * 1024;
const MAX_ANIMATED_STICKER_BYTES = 500 * 1024;
const MAX_MUXED_BYTES = 3.5 * 1024 * 1024;
const MIN_MEDIA_BYTES = 100;
const RATE_LIMIT_MS = 1300;
const CALIBRATION_WINDOW_MS = 5 * 60 * 1000;
const DELIVERY_WATCH_MS = 20 * 1000;
const SELF_E2EE_TEST_WATCH_MS = 4500;

const STANDARD_WEBP_CHUNKS = new Set([
  'VP8X',
  'VP8 ',
  'VP8L',
  'ALPH',
  'ANIM',
  'ANMF',
  'ICCP',
  'EXIF',
  'XMP '
]);

const STANDARD_WA_EXIF_KEYS = new Set([
  'sticker-pack-id',
  'sticker-pack-name',
  'sticker-pack-publisher',
  'emojis',
  'android-app-store-link',
  'ios-app-store-link'
]);

const lastStickerSendAt = new Map();

function writeUint32LE(buf, off, val) {
  buf[off] = val & 0xff;
  buf[off + 1] = (val >>> 8) & 0xff;
  buf[off + 2] = (val >>> 16) & 0xff;
  buf[off + 3] = (val >>> 24) & 0xff;
}

function validateStickerWebpBuffer(buf) {
  if (!buf || buf.length <= MIN_MEDIA_BYTES) {
    throw new Error('Berkas stiker WebP terlalu kecil atau kosong.');
  }
  if (buf.length > MAX_STICKER_BYTES) {
    throw new Error('Ukuran stiker WebP melebihi batas 1.0 MB.');
  }
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') {
    throw new Error('Header stiker bukan WebP RIFF yang valid.');
  }

  let offset = 12;
  let hasAnimChunk = false;
  let hasImageFrame = false;
  while (offset + 8 <= buf.length) {
    const fourCC = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (offset + 8 + size > buf.length) {
      throw new Error('Panjang chunk RIFF WebP tidak konsisten atau korup.');
    }
    if (fourCC === 'ANIM' || fourCC === 'ANMF') hasAnimChunk = true;
    if (fourCC === 'VP8 ' || fourCC === 'VP8L' || fourCC === 'ANMF') hasImageFrame = true;
    offset += 8 + size + (size % 2);
  }
  if (!hasImageFrame) {
    throw new Error('Stiker WebP tidak memiliki frame gambar yang valid.');
  }
  if (hasAnimChunk && buf.length > MAX_ANIMATED_STICKER_BYTES) {
    const kb = (buf.length / 1024).toFixed(1);
    throw new Error(`Stiker WebP animasi (${kb} KB) melebihi batas WhatsApp 500 KB. Kurangi durasi atau FPS.`);
  }
  return { isAnimatedBitstream: hasAnimChunk };
}

function validateContainerMagic(buf, expectedKind, label) {
  if (!buf || buf.length <= MIN_MEDIA_BYTES) {
    throw new Error(`Data ${label} terlalu kecil atau kosong.`);
  }
  if (buf.length > MAX_MUXED_BYTES) {
    throw new Error(`Ukuran ${label} melebihi batas aman 3.5 MB.`);
  }
  if (expectedKind === 'mp4') {
    if (buf.length < 12 || buf.toString('ascii', 4, 8) !== 'ftyp') {
      throw new Error(`Header MP4/M4A ${label} tidak memiliki box ftyp yang valid.`);
    }
  } else if (expectedKind === 'webm') {
    if (buf.length < 4 || buf[0] !== 0x1a || buf[1] !== 0x45 || buf[2] !== 0xdf || buf[3] !== 0xa3) {
      throw new Error(`Header WebM ${label} tidak memiliki EBML signature yang valid.`);
    }
  } else if (expectedKind === 'ogg') {
    if (buf.length < 4 || buf.toString('ascii', 0, 4) !== 'OggS') {
      throw new Error(`Header OGG/Opus ${label} tidak valid.`);
    }
  }
  return buf;
}

function decodeBoundedBase64(rawInput, maxBytes, label) {
  if (!rawInput || typeof rawInput !== 'string') {
    throw new Error(`Payload ${label} tidak tersedia.`);
  }
  const commaIdx = rawInput.indexOf(',');
  const pureBase64 =
    commaIdx !== -1 && rawInput.slice(0, commaIdx).includes('base64')
      ? rawInput.slice(commaIdx + 1)
      : rawInput;
  const cleaned = pureBase64.replace(/\s+/g, '');

  const approxBytes = Math.floor((cleaned.length * 3) / 4);
  if (approxBytes <= MIN_MEDIA_BYTES || approxBytes > maxBytes) {
    throw new Error(`Ukuran ${label} di luar batas aman (${MIN_MEDIA_BYTES}B - ${(maxBytes / (1024 * 1024)).toFixed(1)} MB).`);
  }

  const buf = Buffer.from(cleaned, 'base64');
  if (!buf || buf.length <= MIN_MEDIA_BYTES || buf.length > maxBytes) {
    throw new Error(`Ukuran ${label} tidak valid atau melebihi batas server.`);
  }
  return buf;
}

function decodeOptionalBase64(rawInput, expectedKind, label) {
  if (!rawInput || typeof rawInput !== 'string') return null;
  const buf = decodeBoundedBase64(rawInput, MAX_MUXED_BYTES, label);
  return validateContainerMagic(buf, expectedKind, label);
}

function extractExifJsonFromChunk(chunkBuf) {
  try {
    const startBrace = chunkBuf.indexOf(0x7b);
    const endBrace = chunkBuf.lastIndexOf(0x7d);
    if (startBrace === -1 || endBrace <= startBrace) return null;
    const jsonSlice = chunkBuf.subarray(startBrace, endBrace + 1).toString('utf8');
    const parsed = JSON.parse(jsonSlice);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function inspectMp4Boxes(buf) {
  const topLevelAtoms = [];
  const codecs = new Set();
  const containerBoxes = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl']);
  let visited = 0;

  function walk(start, end, depth) {
    let off = start;
    while (off + 8 <= end && visited < 160 && depth <= 6) {
      visited++;
      let sz = buf.readUInt32BE(off);
      const box = buf.toString('ascii', off + 4, off + 8);
      if (sz === 1 && off + 16 <= end) {
        sz = Number(buf.readBigUInt64BE(off + 8));
      }
      if (!Number.isFinite(sz) || sz < 8 || off + sz > end) break;

      if (depth === 0 && topLevelAtoms.length < 24) {
        topLevelAtoms.push(`${box}:${sz}`);
      }

      if (box === 'stsd' && off + 16 < off + sz) {
        const entryCount = buf.readUInt32BE(off + 12);
        let eOff = off + 16;
        for (let i = 0; i < Math.min(entryCount, 8) && eOff + 8 <= off + sz; i++) {
          const eSz = buf.readUInt32BE(eOff);
          const codec = buf.toString('ascii', eOff + 4, eOff + 8).replace(/[^\x20-\x7e]/g, '');
          if (codec) codecs.add(codec);
          if (eSz < 8) break;
          eOff += eSz;
        }
      } else if (containerBoxes.has(box)) {
        walk(off + 8, off + sz, depth + 1);
      }

      off += sz;
    }
  }

  walk(0, buf.length, 0);
  return { topLevelAtoms, trackCodecs: Array.from(codecs) };
}

function inspectMediaBufferMetadata(buf) {
  if (!buf || buf.length === 0) {
    return { magicHex: '', magicAscii: '', totalBytes: 0, detectedContainer: 'unknown', chunks: [] };
  }

  const head = buf.subarray(0, Math.min(32, buf.length));
  const magicHex = head.toString('hex');
  const magicAscii = Array.from(head, (b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.')).join('');

  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const chunks = [];
    const customChunks = [];
    let exifJson = null;
    let extraExifKeys = [];
    let off = 12;

    while (off + 8 <= buf.length && chunks.length < 48) {
      const fcc = buf.toString('ascii', off, off + 4);
      const sz = buf.readUInt32LE(off + 4);
      const dataStart = off + 8;
      const dataEnd = Math.min(buf.length, dataStart + sz);
      chunks.push(`${fcc}:${sz}`);

      if (!STANDARD_WEBP_CHUNKS.has(fcc)) {
        const sub = buf.subarray(dataStart, Math.min(dataEnd, dataStart + 16));
        customChunks.push({ fourCC: fcc, size: sz, headHex: sub.toString('hex') });
      }
      if (fcc === 'EXIF') {
        const parsed = extractExifJsonFromChunk(buf.subarray(dataStart, dataEnd));
        if (parsed) {
          exifJson = parsed;
          extraExifKeys = Object.keys(parsed).filter((k) => !STANDARD_WA_EXIF_KEYS.has(k));
        }
      }
      off = dataStart + sz + (sz % 2);
    }

    return {
      magicHex,
      magicAscii,
      totalBytes: buf.length,
      detectedContainer: 'webp',
      chunks,
      customChunks,
      exifJson,
      extraExifKeys
    };
  }

  if (buf.length >= 12 && buf.toString('ascii', 4, 8) === 'ftyp') {
    const { topLevelAtoms, trackCodecs } = inspectMp4Boxes(buf);
    return {
      magicHex,
      magicAscii,
      totalBytes: buf.length,
      detectedContainer: 'mp4',
      chunks: topLevelAtoms,
      trackCodecs
    };
  }

  if (buf.length >= 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    const sampleAscii = buf.subarray(0, Math.min(buf.length, 4096)).toString('latin1');
    const codecs = [];
    for (const marker of ['V_VP8', 'V_VP9', 'V_AV1', 'A_OPUS', 'A_VORBIS']) {
      if (sampleAscii.includes(marker)) codecs.push(marker);
    }
    return {
      magicHex,
      magicAscii,
      totalBytes: buf.length,
      detectedContainer: 'webm',
      chunks: codecs,
      trackCodecs: codecs
    };
  }

  if (buf.length >= 4 && buf.toString('ascii', 0, 4) === 'OggS') {
    const sampleAscii = buf.subarray(0, Math.min(buf.length, 256)).toString('ascii');
    return {
      magicHex,
      magicAscii,
      totalBytes: buf.length,
      detectedContainer: 'ogg',
      chunks: [sampleAscii.includes('OpusHead') ? 'OpusHead' : 'OggStream']
    };
  }

  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) {
    return {
      magicHex,
      magicAscii,
      totalBytes: buf.length,
      detectedContainer: 'zip/lottie',
      chunks: ['PKZIP']
    };
  }

  return { magicHex, magicAscii, totalBytes: buf.length, detectedContainer: 'unknown', chunks: [] };
}

function summarizeNonBufferFields(obj) {
  if (!obj || typeof obj !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    if (Buffer.isBuffer(v) || v instanceof Uint8Array) {
      out[k] = `<Bytes:${v.length}>`;
    } else if (typeof v === 'object') {
      if (typeof v.toNumber === 'function') {
        out[k] = v.toNumber();
      } else if (k === 'contextInfo') {
        out[k] = Object.keys(v);
      } else {
        out[k] = summarizeNonBufferFields(v);
      }
    } else {
      out[k] = v;
    }
  }
  return out;
}

function collectUnknownStickerTags(rawWireTree = []) {
  const knownMessageTags = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 16, 17, 18, 22, 26, 35, 37, 44, 50, 56]);
  const tags = [];
  for (const node of rawWireTree) {
    if (!knownMessageTags.has(node.field)) {
      tags.push({ field: node.field, wireType: node.wireType, len: node.len, previewUtf8: node.previewUtf8 });
    }
  }
  return tags;
}

function isInterestingSoundBlueprint(topLevelKeys, wrapperChain, stickerMeta, mediaInspection, rawWireTree) {
  const mime = String(stickerMeta?.mimetype || '').toLowerCase();
  if (mime && mime !== 'image/webp') return true;
  if (topLevelKeys.some((k) => k !== 'stickerMessage' && k !== 'messageContextInfo')) return true;
  if (wrapperChain.some((w) => w !== 'deviceSentMessage')) return true;
  if (Array.isArray(mediaInspection?.customChunks) && mediaInspection.customChunks.length > 0) return true;
  if (Array.isArray(mediaInspection?.extraExifKeys) && mediaInspection.extraExifKeys.length > 0) return true;
  if (mediaInspection?.detectedContainer && mediaInspection.detectedContainer !== 'webp') return true;
  if (collectUnknownStickerTags(rawWireTree).length > 0) return true;
  return false;
}

function sanitizeBlueprint(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const sm = raw.stickerMeta && typeof raw.stickerMeta === 'object' ? raw.stickerMeta : {};
  const mi = raw.mediaInspection && typeof raw.mediaInspection === 'object' ? raw.mediaInspection : {};
  return {
    capturedAt: Number(raw.capturedAt) || Date.now(),
    topLevelKeys: Array.isArray(raw.topLevelKeys) ? raw.topLevelKeys.slice(0, 16).map(String) : [],
    wrapperChain: Array.isArray(raw.wrapperChain) ? raw.wrapperChain.slice(0, 8).map(String) : [],
    unknownWireTags: Array.isArray(raw.unknownWireTags) ? raw.unknownWireTags.slice(0, 16) : [],
    rawWireTree: Array.isArray(raw.rawWireTree) ? raw.rawWireTree.slice(0, 32) : [],
    stickerMeta: {
      mimetype: typeof sm.mimetype === 'string' ? sm.mimetype.slice(0, 64) : 'image/webp',
      isAnimated: Boolean(sm.isAnimated),
      isLottie: Boolean(sm.isLottie),
      isAvatar: Boolean(sm.isAvatar),
      isAiSticker: Boolean(sm.isAiSticker),
      width: Number(sm.width) || 512,
      height: Number(sm.height) || 512,
      accessibilityLabel: typeof sm.accessibilityLabel === 'string' ? sm.accessibilityLabel.slice(0, 120) : undefined
    },
    mediaInspection: {
      detectedContainer: typeof mi.detectedContainer === 'string' ? mi.detectedContainer.slice(0, 24) : 'webp',
      chunks: Array.isArray(mi.chunks) ? mi.chunks.slice(0, 48).map(String) : [],
      customChunks: Array.isArray(mi.customChunks) ? mi.customChunks.slice(0, 12) : [],
      extraExifKeys: Array.isArray(mi.extraExifKeys) ? mi.extraExifKeys.slice(0, 24).map(String) : [],
      exifJson: mi.exifJson && typeof mi.exifJson === 'object' ? mi.exifJson : null,
      trackCodecs: Array.isArray(mi.trackCodecs) ? mi.trackCodecs.slice(0, 12).map(String) : []
    }
  };
}

function buildRiffChunkBuffer(fourCC, payloadBuf) {
  const fcc = String(fourCC || 'META').padEnd(4, ' ').slice(0, 4);
  const len = payloadBuf.length;
  const pad = len % 2;
  const out = Buffer.alloc(8 + len + pad);
  out.write(fcc, 0, 4, 'ascii');
  writeUint32LE(out, 4, len);
  payloadBuf.copy(out, 8);
  return out;
}

function applyBlueprintToWebp(webpBuf, blueprint, { audioBuf, durationSec } = {}) {
  const customChunks = blueprint?.mediaInspection?.customChunks || [];
  const extraKeys = blueprint?.mediaInspection?.extraExifKeys || [];
  const blueprintExif = blueprint?.mediaInspection?.exifJson;

  if (customChunks.length === 0 && extraKeys.length === 0) {
    return { finalWebpBuf: webpBuf, customized: false };
  }

  let off = 12;
  const keptChunks = [];
  let vp8xChunk = null;

  while (off + 8 <= webpBuf.length) {
    const fcc = webpBuf.toString('ascii', off, off + 4);
    const sz = webpBuf.readUInt32LE(off + 4);
    const dataStart = off + 8;
    const dataEnd = Math.min(webpBuf.length, dataStart + sz);
    const dataBuf = webpBuf.subarray(dataStart, dataEnd);

    if (fcc === 'VP8X') {
      vp8xChunk = Buffer.from(dataBuf);
    } else if (fcc === 'EXIF' && extraKeys.length > 0 && blueprintExif) {
      const parsed = extractExifJsonFromChunk(dataBuf) || {};
      for (const k of extraKeys) {
        if (k in blueprintExif && typeof blueprintExif[k] !== 'object') {
          parsed[k] = blueprintExif[k];
        }
      }
      if (durationSec && !('duration' in parsed) && 'duration' in blueprintExif) {
        parsed.duration = Number(durationSec) || 3;
      }
      const jsonBytes = Buffer.from(JSON.stringify(parsed), 'utf8');
      const header = Buffer.from([
        0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41,
        0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00
      ]);
      writeUint32LE(header, 14, jsonBytes.length);
      keptChunks.push(buildRiffChunkBuffer('EXIF', Buffer.concat([header, jsonBytes])));
    } else {
      keptChunks.push(buildRiffChunkBuffer(fcc, dataBuf));
    }
    off = dataStart + sz + (sz % 2);
  }

  if (customChunks.length > 0 && audioBuf && audioBuf.length > MIN_MEDIA_BYTES) {
    for (const cc of customChunks) {
      if (cc?.fourCC && cc.fourCC.length === 4) {
        keptChunks.push(buildRiffChunkBuffer(cc.fourCC, audioBuf));
        break;
      }
    }
  }

  const headChunk = vp8xChunk ? [buildRiffChunkBuffer('VP8X', vp8xChunk)] : [];
  const body = Buffer.concat([...headChunk, ...keptChunks]);
  const riff = Buffer.alloc(12 + body.length);
  riff.write('RIFF', 0, 4, 'ascii');
  writeUint32LE(riff, 4, 4 + body.length);
  riff.write('WEBP', 8, 4, 'ascii');
  body.copy(riff, 12);

  if (riff.length > MAX_STICKER_BYTES) {
    return { finalWebpBuf: webpBuf, customized: false };
  }
  return { finalWebpBuf: riff, customized: true };
}

function attachStickerDeliveryWatcher(io, sessionId, session, messageId, queueId = null) {
  const sock = session?.sock;
  if (!sock?.ev || !messageId) return;

  const statusLabels = {
    0: 'Gagal dekripsi / ditolak perangkat (coba Reset E2EE)',
    2: 'Terkirim ke Server ✓',
    3: 'Diterima HP ✓✓',
    4: 'Dibaca di HP ✓✓'
  };

  let timer = null;
  const emitAck = (status, stubParams = []) => {
    const isError = status === 0;
    const extraErr = isError && stubParams?.length ? ` (${stubParams.join(', ')})` : '';
    const payload = {
      ...(queueId ? { queueId } : {}),
      messageId,
      status,
      isError,
      canResetE2ee: isError,
      label: (statusLabels[status] || 'Terkirim') + extraErr
    };
    emitToDevice(io, sessionId, 'sound-sticker-item-ack', payload);
    emitToDevice(io, sessionId, 'sound-sticker-delivery-update', payload);
  };

  const onMessagesUpdate = (updates) => {
    if (!Array.isArray(updates)) return;
    for (const upd of updates) {
      if (upd?.key?.id !== messageId) continue;
      const st = Number(upd?.update?.status);
      if (Number.isFinite(st) && (st === 0 || st >= 2)) {
        emitAck(st, upd?.update?.messageStubParameters);
        if (st === 0 || st >= 3) {
          cleanup();
          break;
        }
      }
    }
  };

  const onReceiptUpdate = (updates) => {
    if (!Array.isArray(updates)) return;
    for (const upd of updates) {
      if (upd?.key?.id !== messageId) continue;
      const st = upd?.receipt?.readTimestamp || upd?.receipt?.playedTimestamp ? 4 : 3;
      emitAck(st);
      cleanup();
      break;
    }
  };

  const cleanup = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    try {
      sock.ev.off('messages.update', onMessagesUpdate);
      sock.ev.off('message-receipt.update', onReceiptUpdate);
    } catch (_) {}
  };

  sock.ev.on('messages.update', onMessagesUpdate);
  sock.ev.on('message-receipt.update', onReceiptUpdate);
  timer = setTimeout(cleanup, DELIVERY_WATCH_MS);
}

/**
 * Detektor Deep Wire-Level Pasif & Aktif (notify + append, selfPn + selfLid, unwrap deviceSentMessage).
 */
function attachCalibrationListener(io, sessionId, session) {
  if (!session) return;

  session._onCalibrationUpsert = async ({ messages, type }) => {
    try {
      const curSession = sessions.get(sessionId);
      if (!curSession || !Array.isArray(messages) || messages.length === 0) return;

      const isArmed = Boolean(
        curSession.calibratingSoundSticker &&
          curSession.calibrationArmedUntil &&
          Date.now() <= curSession.calibrationArmedUntil
      );
      if (curSession.calibratingSoundSticker && !isArmed) {
        curSession.calibratingSoundSticker = false;
      }

      const selfPn = curSession.sock?.user?.id ? jidNormalizedUser(curSession.sock.user.id) : '';
      const selfLid = curSession.sock?.user?.lid ? jidNormalizedUser(curSession.sock.user.lid) : '';

      for (const msg of messages) {
        if (!msg?.key) continue;

        const remoteRaw = String(msg.key.remoteJid || '');
        const remoteNorm = remoteRaw ? jidNormalizedUser(remoteRaw) : '';
        const isSelfOwner = Boolean(
          msg.key.fromMe === true ||
            (selfPn && remoteNorm === selfPn) ||
            (selfLid && remoteNorm === selfLid)
        );

        // Jangan kalibrasi ulang dari pesan outgoing yang dikirim oleh web ini sendiri
        if (msg.key.id && getSentMessage(curSession, msg.key.id)) {
          continue;
        }

        const { innerMessage, wrapperChain } = unwrapMessageContent(msg.message);
        const innerKeys = Object.keys(innerMessage || {});

        // Selama mode deteksi format menyala, izinkan chat self (PN/LID), pesan fromMe, maupun stiker masuk di chat lain
        if (!isArmed && !isSelfOwner) continue;
        if (isArmed && !isSelfOwner && !innerMessage?.stickerMessage && !innerMessage?.lottieStickerMessage) {
          continue;
        }

        if (isArmed) {
          emitToDevice(io, sessionId, 'sound-sticker-calibration-log', {
            at: Date.now(),
            upsertType: type || 'notify',
            remoteJid: remoteRaw,
            fromMe: Boolean(msg.key.fromMe),
            wrapperChain,
            keys: innerKeys,
            stubType: msg.messageStubType || null
          });
        }

        if (!innerMessage || typeof innerMessage !== 'object') continue;

        const stickerNode = innerMessage.stickerMessage || innerMessage.lottieStickerMessage?.message?.stickerMessage || null;
        const ptvOrMedia = innerMessage.ptvMessage || (isArmed ? innerMessage.videoMessage || innerMessage.documentMessage : null);
        const mediaTarget = stickerNode || ptvOrMedia;

        const latestRawPacket = Array.isArray(curSession.lastRawWirePackets) && curSession.lastRawWirePackets.length > 0
          ? curSession.lastRawWirePackets[curSession.lastRawWirePackets.length - 1]
          : null;

        let encodedProtoWireTree = [];
        try {
          if (proto?.Message?.encode) {
            const bytes = proto.Message.encode(innerMessage).finish();
            encodedProtoWireTree = inspectProtobufWire(bytes, 3);
          }
        } catch (_) {}

        const rawWireTree = latestRawPacket?.wireTree?.length ? latestRawPacket.wireTree : encodedProtoWireTree;
        const unknownWireTags = collectUnknownStickerTags(rawWireTree);

        const nonContextKeys = innerKeys.filter((k) => k !== 'messageContextInfo');
        const hasUnrecognizedWirePayload = isArmed && nonContextKeys.length === 0 && rawWireTree.length > 0;
        const looksLikeSticker =
          Boolean(stickerNode) ||
          innerKeys.some((k) => k.toLowerCase().includes('sticker')) ||
          hasUnrecognizedWirePayload;

        if (!looksLikeSticker && !(isArmed && mediaTarget)) {
          continue;
        }

        let mediaInspection = null;
        if (mediaTarget) {
          let dlBuf = null;
          try {
            if (typeof downloadMediaMessage === 'function') {
              dlBuf = await downloadMediaMessage(
                { key: msg.key, message: innerMessage },
                'buffer',
                {},
                { reuploadRequest: curSession.sock?.updateMediaMessage }
              );
            } else if (typeof downloadContentFromMessage === 'function') {
              const kind = stickerNode ? 'sticker' : innerMessage.videoMessage ? 'video' : 'document';
              const stream = await downloadContentFromMessage(mediaTarget, kind);
              const chunks = [];
              let size = 0;
              for await (const chunk of stream) {
                if (size < 768 * 1024) chunks.push(chunk);
                size += chunk.length;
              }
              dlBuf = Buffer.concat(chunks);
            }
            if (dlBuf && dlBuf.length > 0) {
              mediaInspection = inspectMediaBufferMetadata(dlBuf);
            }
          } catch (dlErr) {
            mediaInspection = { error: dlErr.message };
          } finally {
            dlBuf = null;
          }
        }

        const stickerMeta = summarizeNonBufferFields(stickerNode || innerMessage);
        if (!isArmed && !isInterestingSoundBlueprint(innerKeys, wrapperChain, stickerMeta, mediaInspection, rawWireTree)) {
          continue;
        }

        curSession.calibratingSoundSticker = false;
        curSession.calibrationArmedUntil = 0;

        const blueprint = {
          capturedAt: Date.now(),
          baileysVersion: '6.7.24',
          upsertType: type || 'notify',
          wrapperChain,
          topLevelKeys: innerKeys,
          hasMessageContextInfo: Boolean(innerMessage.messageContextInfo || msg.message?.messageContextInfo),
          stickerMeta,
          unknownWireTags,
          rawWireTree,
          mediaInspection,
          messageKeys: innerKeys,
          stickerFields: stickerMeta,
          binarySummary: mediaInspection
        };

        curSession.soundStickerBlueprint = sanitizeBlueprint(blueprint);
        emitToDevice(io, sessionId, 'sound-sticker-blueprint-ready', { blueprint });
        emitToDevice(io, sessionId, 'sound-sticker-schema-detected', blueprint);
        break;
      }
    } catch (err) {
      console.warn(`[BlueprintInspector ${sessionId}] Error:`, err.message);
    }
  };
}

/**
 * Pengirim Resmi Berbasis `sock.sendMessage(selfJid, ...)` + Blueprint Patcher + Zero "Menunggu Pesan Ini".
 */
async function buildAndSendSoundSticker({ io, sessionId, session, selfJid, payload }) {
  let stickerWebpBuf = null;
  let muxedMp4Buf = null;
  let muxedWebmBuf = null;
  let audioOpusBuf = null;
  let audioM4aBuf = null;
  let containerBuf = null;

  try {
    const {
      queueId = null,
      stickerWebpBase64,
      muxedWebmBase64,
      muxedMp4Base64,
      audioOpusBase64,
      audioM4aBase64,
      durationSec = 3,
      width = 512,
      height = 512,
      blueprint: clientBlueprint
    } = payload || {};

    stickerWebpBuf = decodeBoundedBase64(stickerWebpBase64, MAX_STICKER_BYTES, 'stiker WebP 512x512');
    const { isAnimatedBitstream } = validateStickerWebpBuffer(stickerWebpBuf);

    muxedMp4Buf = decodeOptionalBase64(muxedMp4Base64, 'mp4', 'muxed MP4');
    muxedWebmBuf = decodeOptionalBase64(muxedWebmBase64, 'webm', 'muxed WebM');
    audioOpusBuf = decodeOptionalBase64(audioOpusBase64, 'ogg', 'audio Opus');
    audioM4aBuf = decodeOptionalBase64(audioM4aBase64, 'mp4', 'audio M4A');

    // Segarkan sesi Signal perangkat utama (+ LID jika ada) sebelum enkripsi E2EE self-chat
    const assertTargets = [selfJid];
    if (session.sock?.user?.lid) {
      const selfLid = jidNormalizedUser(session.sock.user.lid);
      if (selfLid) assertTargets.push(selfLid);
    }
    try {
      await session.sock.assertSessions(assertTargets, false);
    } catch (_) {}

    const activeBlueprint = sanitizeBlueprint(clientBlueprint) || session.soundStickerBlueprint || null;
    const safeWidth = Math.max(16, Math.min(1024, Number(width) || 512));
    const safeHeight = Math.max(16, Math.min(1024, Number(height) || 512));

    const customMsgId =
      typeof generateMessageIDV2 === 'function'
        ? generateMessageIDV2(session.sock.user.id)
        : typeof generateMessageID === 'function'
          ? generateMessageID()
          : undefined;

    let modeUsed = 'official-sendMessage-webp';
    let note = 'Terkirim via jalur resmi sock.sendMessage (WebP 512x512 + EXIF) tanpa bubble video/VN.';
    let sentMsg = null;
    let encodedLen = 0;

    const bpMime = String(activeBlueprint?.stickerMeta?.mimetype || '').toLowerCase();
    const bpContainer = activeBlueprint?.mediaInspection?.detectedContainer || '';
    const useMuxedBlueprint = Boolean(
      activeBlueprint &&
        (bpContainer === 'mp4' || bpContainer === 'webm' || bpMime.includes('video/mp4') || bpMime.includes('video/webm')) &&
        (muxedMp4Buf || muxedWebmBuf)
    );

    let mediaToSend = null;
    let patchMime = null;
    let patchAnimated = Boolean(isAnimatedBitstream);

    if (useMuxedBlueprint) {
      const preferWebm = bpContainer === 'webm' || bpMime.includes('webm');
      containerBuf = preferWebm && muxedWebmBuf ? muxedWebmBuf : muxedMp4Buf || muxedWebmBuf;
      const targetMime = preferWebm && muxedWebmBuf ? 'video/webm' : 'video/mp4';
      mediaToSend = containerBuf;
      patchMime = bpMime || targetMime;
      patchAnimated = true;
      modeUsed = `blueprint-${targetMime}`;
      note = `Dikirim via jalur resmi E2EE mengikuti blueprint ${targetMime} asli WhatsApp.`;
    } else {
      const bestAudioBuf = audioOpusBuf || audioM4aBuf;
      const { finalWebpBuf, customized } = activeBlueprint
        ? applyBlueprintToWebp(stickerWebpBuf, activeBlueprint, { audioBuf: bestAudioBuf, durationSec })
        : { finalWebpBuf: stickerWebpBuf, customized: false };
      if (customized) {
        validateStickerWebpBuffer(finalWebpBuf);
        modeUsed = 'blueprint-webp-injected';
        note = 'Dikirim via jalur resmi sock.sendMessage mengikuti blueprint WebP hasil deteksi.';
      }
      mediaToSend = finalWebpBuf;
    }

    // Hook patchMessageBeforeSending sementara agar proto.Message terverifikasi > 16 byte & masuk sentMessageStore SEBELUM stanza terkirim
    const prevPatch = session._patchOutgoingWire;
    session._patchOutgoingWire = (outgoingMsg) => {
      const inner = outgoingMsg?.deviceSentMessage?.message || outgoingMsg;
      if (inner?.stickerMessage) {
        if (patchMime) inner.stickerMessage.mimetype = patchMime;
        if (useMuxedBlueprint || customized) {
          inner.stickerMessage.isAnimated = patchAnimated;
          inner.stickerMessage.width = safeWidth;
          inner.stickerMessage.height = safeHeight;
        }
        const verifyErr = proto?.Message?.verify?.(inner);
        if (verifyErr) {
          throw new Error(`Struktur WAProto stiker tidak valid: ${verifyErr}`);
        }
        const wire = proto?.Message?.encode ? proto.Message.encode(inner).finish() : null;
        if (!wire || wire.length <= 16) {
          throw new Error('Payload protobuf stiker kosong (<= 16 byte), dibatalkan.');
        }
        encodedLen = wire.length;
        if (customMsgId) rememberSentMessage(session, customMsgId, inner);
      }
      return outgoingMsg;
    };

    try {
      attachStickerDeliveryWatcher(io, sessionId, session, customMsgId, queueId);
      sentMsg = await session.sock.sendMessage(
        selfJid,
        { sticker: mediaToSend },
        { ...(customMsgId ? { messageId: customMsgId } : {}) }
      );
    } finally {
      session._patchOutgoingWire = prevPatch;
    }

    const finalMsgId = sentMsg?.key?.id || customMsgId;
    if (sentMsg?.key?.id && sentMsg?.message) {
      rememberSentMessage(session, sentMsg.key.id, sentMsg.message);
      if (!encodedLen && proto?.Message?.encode) {
        try {
          encodedLen = proto.Message.encode(sentMsg.message).finish().length;
        } catch (_) {}
      }
    }

    if (finalMsgId && finalMsgId !== customMsgId) {
      attachStickerDeliveryWatcher(io, sessionId, session, finalMsgId, queueId);
    }

    // Sinkronkan snapshot kunci Signal terbaru agar ratchet key HP & server tetap sinkron
    triggerAuthSnapshotSync(io, sessionId, session);

    return {
      ok: true,
      ...(queueId ? { queueId } : {}),
      messageId: finalMsgId,
      protocol: 'official-sendMessage-sticker',
      modeUsed,
      hasBlueprint: Boolean(activeBlueprint),
      needsCalibration: !activeBlueprint,
      isAnimated: patchAnimated,
      encodedBytes: encodedLen,
      note,
      selfJid,
      sentAt: Date.now()
    };
  } finally {
    stickerWebpBuf = null;
    muxedMp4Buf = null;
    muxedWebmBuf = null;
    audioOpusBuf = null;
    audioM4aBuf = null;
    containerBuf = null;
  }
}

function isOwnSignalSessionFile(fname, ownPhone, ownLidUser) {
  if (!fname || typeof fname !== 'string') return false;
  if (fname === 'creds.json' || fname === '.owner.hash') return false;
  if (!fname.startsWith('session-') || !fname.endsWith('.json')) return false;
  const body = fname.slice('session-'.length, -'.json'.length);
  const matchesPrefix = (prefix) => {
    if (!prefix) return false;
    if (body === prefix) return true;
    const boundary = body[prefix.length];
    return body.startsWith(prefix) && (boundary === '.' || boundary === '-' || boundary === '_' || boundary === '@');
  };
  return matchesPrefix(ownPhone) || matchesPrefix(ownLidUser);
}

async function performResetSelfE2eeKeys(io, sessionId, session) {
  const selfJid = jidNormalizedUser(session.sock.user.id);
  const selfLid = session.sock?.user?.lid ? jidNormalizedUser(session.sock.user.lid) : '';
  const ownPhone = selfJid ? selfJid.split('@')[0].split(':')[0] : '';
  const ownLidUser = selfLid ? selfLid.split('@')[0].split(':')[0] : '';

  const baseTargets = [selfJid, ...(selfLid ? [selfLid] : [])].filter(Boolean);
  const targetSet = new Set(baseTargets);
  try {
    if (typeof session.sock?.getUSyncDevices === 'function') {
      const discovered = await session.sock.getUSyncDevices(baseTargets, false, false);
      if (Array.isArray(discovered)) {
        for (const item of discovered) {
          if (typeof item === 'string' && item.includes('@')) {
            targetSet.add(item);
          } else if (item && typeof item === 'object' && item.user) {
            const isOwnerLid = ownLidUser && String(item.user) === ownLidUser;
            const server = item.server || (isOwnerLid ? 'lid' : 's.whatsapp.net');
            const encoded = typeof baileysModule.jidEncode === 'function'
              ? baileysModule.jidEncode(item.user, server, item.device)
              : item.device != null && item.device > 0
                ? `${item.user}:${item.device}@${server}`
                : `${item.user}@${server}`;
            if (encoded) targetSet.add(encoded);
          }
        }
      }
    }
  } catch (_) {}
  const uniqueTargets = Array.from(targetSet);

  const sessionDir = getSessionDir(sessionId);
  const clearedFiles = [];
  const nullSessionMap = {};

  if (sessionDir && fs.existsSync(sessionDir)) {
    const entries = fs.readdirSync(sessionDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !isOwnSignalSessionFile(entry.name, ownPhone, ownLidUser)) continue;
      const bodyId = entry.name.slice('session-'.length, -'.json'.length);
      if (bodyId) nullSessionMap[bodyId] = null;
      try {
        fs.unlinkSync(path.join(sessionDir, entry.name));
        clearedFiles.push(entry.name);
      } catch (_) {}
    }
  }

  for (const targetJid of uniqueTargets) {
    try {
      const sigAddr = session.sock?.signalRepository?.jidToSignalProtocolAddress?.(targetJid);
      if (sigAddr) nullSessionMap[sigAddr] = null;
    } catch (_) {}
  }

  // Kosongkan cache RAM makeCacheableSignalKeyStore (TTL 5 menit) agar pre-key baru benar-benar dipakai
  for (let dev = 0; dev <= 5; dev++) {
    if (ownPhone) nullSessionMap[`${ownPhone}.${dev}`] = null;
    if (ownLidUser) {
      nullSessionMap[`${ownLidUser}.${dev}`] = null;
      nullSessionMap[`${ownLidUser}_1.${dev}`] = null;
    }
  }

  if (Object.keys(nullSessionMap).length > 0 && typeof session.sock?.authState?.keys?.set === 'function') {
    try {
      await session.sock.authState.keys.set({ session: nullSessionMap });
    } catch (_) {}
  }

  await session.sock.assertSessions(uniqueTargets, true);
  triggerAuthSnapshotSync(io, sessionId, session);

  return {
    ok: true,
    clearedCount: clearedFiles.length,
    clearedFiles,
    refreshedTargets: uniqueTargets.length,
    selfJid,
    selfLid,
    baileysVersion: BAILEYS_VERSION,
    resetAt: Date.now()
  };
}

function registerStickerSenderHandler(io, socket) {
  socket.on('start-sound-sticker-calibration', (payload) => {
    try {
      const { sessionId, deviceToken } = payload || {};
      const tokenHash = verifyDeviceOwner(socket, sessionId, deviceToken);
      if (!tokenHash) return;
      joinExclusiveDeviceRoom(socket, sessionId);

      const session = sessions.get(sessionId);
      if (!session || session.status !== 'connected' || !session.sock?.user?.id) {
        return emitToDevice(io, sessionId, 'sound-sticker-result', {
          ok: false,
          error: 'Hubungkan WhatsApp terlebih dahulu sebelum memulai deteksi format.'
        });
      }

      session.calibratingSoundSticker = true;
      session.calibrationArmedUntil = Date.now() + CALIBRATION_WINDOW_MS;
      attachCalibrationListener(io, sessionId, session);

      emitToDevice(io, sessionId, 'sound-sticker-calibration-armed', {
        armedUntil: session.calibrationArmedUntil
      });
    } catch (err) {
      console.error('Error start-sound-sticker-calibration:', err.message);
    }
  });

  socket.on('refresh-wa-e2ee-sessions', async (payload) => {
    try {
      const { sessionId, deviceToken } = payload || {};
      const tokenHash = verifyDeviceOwner(socket, sessionId, deviceToken);
      if (!tokenHash) return;
      joinExclusiveDeviceRoom(socket, sessionId);

      const session = sessions.get(sessionId);
      if (!session || session.status !== 'connected' || !session.sock?.user?.id) {
        return emitToDevice(io, sessionId, 'wa-e2ee-refreshed', {
          ok: false,
          error: 'Perangkat WhatsApp belum terhubung.'
        });
      }

      const resetRes = await performResetSelfE2eeKeys(io, sessionId, session);
      emitToDevice(io, sessionId, 'wa-e2ee-refreshed', resetRes);
    } catch (err) {
      console.error('Error refresh-wa-e2ee-sessions:', err.message);
      const sessionId = payload?.sessionId;
      if (sessionId) {
        emitToDevice(io, sessionId, 'wa-e2ee-refreshed', {
          ok: false,
          error: err.message || 'Gagal menyegarkan sesi enkripsi.'
        });
      }
    }
  });

  socket.on('reset-self-e2ee-keys', async (payload) => {
    const { sessionId, deviceToken } = payload || {};
    try {
      const tokenHash = verifyDeviceOwner(socket, sessionId, deviceToken);
      if (!tokenHash) return;
      joinExclusiveDeviceRoom(socket, sessionId);

      const session = sessions.get(sessionId);
      if (!session || session.status !== 'connected' || !session.sock?.user?.id) {
        return emitToDevice(io, sessionId, 'self-e2ee-reset-result', {
          ok: false,
          baileysVersion: BAILEYS_VERSION,
          error: 'Perangkat WhatsApp belum terhubung.'
        });
      }

      const resetRes = await performResetSelfE2eeKeys(io, sessionId, session);
      emitToDevice(io, sessionId, 'self-e2ee-reset-result', resetRes);
      emitToDevice(io, sessionId, 'wa-e2ee-refreshed', resetRes);
    } catch (err) {
      console.error('Error reset-self-e2ee-keys:', err.message);
      if (sessionId) {
        emitToDevice(io, sessionId, 'self-e2ee-reset-result', {
          ok: false,
          baileysVersion: BAILEYS_VERSION,
          error: err.message || 'Gagal mereset kunci Signal E2EE.'
        });
      }
    }
  });

  socket.on('test-self-e2ee', async (payload) => {
    const { sessionId, deviceToken } = payload || {};
    try {
      const tokenHash = verifyDeviceOwner(socket, sessionId, deviceToken);
      if (!tokenHash) return;
      joinExclusiveDeviceRoom(socket, sessionId);

      const session = sessions.get(sessionId);
      if (!session || session.status !== 'connected' || !session.sock?.user?.id || !session.sock.authState?.creds?.registered) {
        return emitToDevice(io, sessionId, 'self-e2ee-test-result', {
          ok: false,
          baileysVersion: BAILEYS_VERSION,
          error: 'Perangkat WhatsApp belum tertaut aktif.'
        });
      }

      const selfJid = jidNormalizedUser(session.sock.user.id);
      const selfLid = session.sock?.user?.lid ? jidNormalizedUser(session.sock.user.lid) : '';
      try {
        await session.sock.assertSessions([selfJid, ...(selfLid ? [selfLid] : [])], false);
      } catch (_) {}

      const customMsgId =
        typeof generateMessageIDV2 === 'function'
          ? generateMessageIDV2(session.sock.user.id)
          : typeof generateMessageID === 'function'
            ? generateMessageID()
            : undefined;

      let encodedBytes = 0;
      const prevPatch = session._patchOutgoingWire;
      session._patchOutgoingWire = (outgoingMsg) => {
        const inner = outgoingMsg?.deviceSentMessage?.message || outgoingMsg;
        if (inner && typeof inner === 'object') {
          try {
            if (proto?.Message?.encode) {
              encodedBytes = proto.Message.encode(inner).finish().length;
            }
          } catch (_) {}
          if (customMsgId) rememberSentMessage(session, customMsgId, inner);
        }
        return outgoingMsg;
      };

      let ackStatus = 1;
      let ackLabel = 'Terkirim via server E2EE (menunggu ACK perangkat)';
      let ackError = false;
      let onAckUpdate = null;

      const ackPromise = new Promise((resolve) => {
        const timer = setTimeout(() => resolve({ status: ackStatus, label: ackLabel, isError: ackError }), SELF_E2EE_TEST_WATCH_MS);
        onAckUpdate = (updates) => {
          if (!Array.isArray(updates) || !customMsgId) return;
          for (const upd of updates) {
            if (upd?.key?.id !== customMsgId) continue;
            const st = Number(upd?.update?.status);
            if (!Number.isFinite(st)) continue;
            ackStatus = st;
            if (st === 0 || st < 0) {
              ackError = true;
              ackLabel = 'Gagal dekripsi E2EE di perangkat (ERROR ACK 0)';
              clearTimeout(timer);
              resolve({ status: ackStatus, label: ackLabel, isError: true });
              return;
            }
            if (st >= 3) {
              ackLabel = 'Diterima HP Anda ✓✓ (0 error E2EE)';
              clearTimeout(timer);
              resolve({ status: ackStatus, label: ackLabel, isError: false });
              return;
            }
            if (st === 2) {
              ackLabel = 'Diterima Server WA ✓ (0 error E2EE)';
            }
          }
        };
        session.sock.ev.on('messages.update', onAckUpdate);
      });

      let sentMsg = null;
      try {
        sentMsg = await session.sock.sendMessage(
          selfJid,
          { text: '✅ Tes E2EE Kuro Studio berhasil masuk (0 error).' },
          { ...(customMsgId ? { messageId: customMsgId } : {}) }
        );
      } finally {
        session._patchOutgoingWire = prevPatch;
      }

      const finalMsgId = sentMsg?.key?.id || customMsgId || '';
      if (sentMsg?.key?.id && sentMsg?.message) {
        rememberSentMessage(session, sentMsg.key.id, sentMsg.message);
      }

      const settledAck = await ackPromise.finally(() => {
        if (onAckUpdate) {
          try {
            session.sock?.ev?.off?.('messages.update', onAckUpdate);
          } catch (_) {}
        }
      });

      triggerAuthSnapshotSync(io, sessionId, session);

      emitToDevice(io, sessionId, 'self-e2ee-test-result', {
        ok: !settledAck.isError,
        messageId: finalMsgId,
        selfJid,
        selfLid,
        baileysVersion: BAILEYS_VERSION,
        encodedBytes,
        ackStatus: settledAck.status,
        ackLabel: settledAck.label,
        error: settledAck.isError ? settledAck.label : null,
        sentAt: Date.now()
      });
    } catch (err) {
      console.error('Error test-self-e2ee:', err.message);
      if (sessionId) {
        emitToDevice(io, sessionId, 'self-e2ee-test-result', {
          ok: false,
          baileysVersion: BAILEYS_VERSION,
          error: err.message || 'Gagal menjalankan Tes E2EE ke nomor sendiri.'
        });
      }
    }
  });

  socket.on('send-self-sound-sticker', async (payload) => {
    const { sessionId, deviceToken, queueId = null } = payload || {};

    try {
      const tokenHash = verifyDeviceOwner(socket, sessionId, deviceToken);
      if (!tokenHash) return;
      joinExclusiveDeviceRoom(socket, sessionId);

      const session = sessions.get(sessionId);
      if (
        !session ||
        session.status !== 'connected' ||
        !session.sock ||
        !session.sock.user?.id ||
        !session.sock.authState?.creds?.registered
      ) {
        return emitToDevice(io, sessionId, 'sound-sticker-result', {
          ok: false,
          ...(queueId ? { queueId } : {}),
          error: 'Perangkat WhatsApp belum tertaut aktif. Tautkan WhatsApp Anda terlebih dahulu.'
        });
      }

      const now = Date.now();
      const prevSentAt = lastStickerSendAt.get(sessionId) || 0;
      if (now - prevSentAt < RATE_LIMIT_MS) {
        const waitSec = Math.ceil((RATE_LIMIT_MS - (now - prevSentAt)) / 1000);
        return emitToDevice(io, sessionId, 'sound-sticker-result', {
          ok: false,
          ...(queueId ? { queueId } : {}),
          error: `Jeda anti-spam aktif. Tunggu ${waitSec} detik sebelum mengirim ulang.`
        });
      }

      const selfJid = jidNormalizedUser(session.sock.user.id);
      if (!selfJid || !selfJid.endsWith('@s.whatsapp.net')) {
        return emitToDevice(io, sessionId, 'sound-sticker-result', {
          ok: false,
          ...(queueId ? { queueId } : {}),
          error: 'Nomor WhatsApp pemilik sesi tidak dapat diverifikasi.'
        });
      }

      attachCalibrationListener(io, sessionId, session);
      const result = await buildAndSendSoundSticker({ io, sessionId, session, selfJid, payload });

      session.lastActive = Date.now();
      lastStickerSendAt.set(sessionId, Date.now());
      emitToDevice(io, sessionId, 'sound-sticker-result', result);
    } catch (err) {
      console.error('Error send-self-sound-sticker:', err.message);
      if (sessionId) {
        emitToDevice(io, sessionId, 'sound-sticker-result', {
          ok: false,
          ...(queueId ? { queueId } : {}),
          error: err.message || 'Gagal mengirim stiker ke WhatsApp.'
        });
      }
    }
  });
}

module.exports = {
  registerStickerSenderHandler,
  attachCalibrationListener,
  buildAndSendSoundSticker,
  validateStickerWebpBuffer,
  inspectMediaBufferMetadata,
  sanitizeBlueprint
};
