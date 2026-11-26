const baileysModule = require('@whiskeysockets/baileys');
const { sessions } = require('../state/sessionStore');
const { verifyDeviceOwner, emitToDevice } = require('../services/deviceAuthService');
const { rememberSentMessage, getSentMessage } = require('./whatsappSessionHandler');

const {
  proto,
  prepareWAMessageMedia,
  generateWAMessageFromContent,
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
const MAX_MUXED_BYTES = 3.5 * 1024 * 1024;
const MIN_MEDIA_BYTES = 100;
const RATE_LIMIT_MS = 4000;
const CALIBRATION_WINDOW_MS = 3 * 60 * 1000;
const DELIVERY_WATCH_MS = 15 * 1000;

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
    const startBrace = chunkBuf.indexOf(0x7b); // '{'
    const endBrace = chunkBuf.lastIndexOf(0x7d); // '}'
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
      detectedContainer: 'lottie-zip',
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

function isInterestingSoundBlueprint(topLevelKeys, stickerMeta, mediaInspection) {
  const mime = String(stickerMeta?.mimetype || '').toLowerCase();
  if (mime && mime !== 'image/webp') return true;
  if (topLevelKeys.some((k) => k !== 'stickerMessage' && k !== 'messageContextInfo')) return true;
  if (Array.isArray(mediaInspection?.customChunks) && mediaInspection.customChunks.length > 0) return true;
  if (Array.isArray(mediaInspection?.extraExifKeys) && mediaInspection.extraExifKeys.length > 0) return true;
  if (mediaInspection?.detectedContainer && mediaInspection.detectedContainer !== 'webp') return true;
  return false;
}

function sanitizeBlueprint(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const sm = raw.stickerMeta && typeof raw.stickerMeta === 'object' ? raw.stickerMeta : {};
  const mi = raw.mediaInspection && typeof raw.mediaInspection === 'object' ? raw.mediaInspection : {};
  return {
    capturedAt: Number(raw.capturedAt) || Date.now(),
    topLevelKeys: Array.isArray(raw.topLevelKeys) ? raw.topLevelKeys.slice(0, 16).map(String) : [],
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

function attachStickerDeliveryWatcher(io, sessionId, session, messageId) {
  const sock = session?.sock;
  if (!sock?.ev || !messageId) return;

  const statusLabels = {
    2: 'Diterima server WhatsApp',
    3: 'Terkirim ke perangkat WA Anda',
    4: 'Dibaca di perangkat WA Anda'
  };

  let timer = null;
  const onMessagesUpdate = (updates) => {
    if (!Array.isArray(updates)) return;
    for (const upd of updates) {
      if (upd?.key?.id !== messageId) continue;
      const st = Number(upd?.update?.status);
      if (st >= 2) {
        emitToDevice(io, sessionId, 'sound-sticker-delivery-update', {
          messageId,
          status: st,
          label: statusLabels[st] || 'Terkirim'
        });
        if (st >= 3) {
          cleanup();
          break;
        }
      }
    }
  };

  const cleanup = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    try {
      sock.ev.off('messages.update', onMessagesUpdate);
    } catch (_) {}
  };

  sock.ev.on('messages.update', onMessagesUpdate);
  timer = setTimeout(cleanup, DELIVERY_WATCH_MS);
}

function attachCalibrationListener(io, sessionId, session) {
  const sock = session?.sock;
  if (!sock || session._calibrationHookSock === sock) return;
  session._calibrationHookSock = sock;

  sock.ev.on('messages.upsert', async ({ messages }) => {
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

      const selfJid = curSession.sock?.user?.id ? jidNormalizedUser(curSession.sock.user.id) : '';

      for (const msg of messages) {
        if (!msg?.message || !msg?.key) continue;
        const remoteNorm = jidNormalizedUser(msg.key.remoteJid || '');
        if (!msg.key.fromMe || (selfJid && remoteNorm !== selfJid)) continue;

        // Jangan pernah mengkalibrasi ulang dari pesan stiker yang baru dikirim oleh server ini sendiri
        if (msg.key.id && getSentMessage(curSession, msg.key.id)) {
          continue;
        }

        const topLevelKeys = Object.keys(msg.message);
        const stickerNode =
          msg.message.stickerMessage ||
          msg.message.lottieStickerMessage?.message?.stickerMessage ||
          msg.message.ephemeralMessage?.message?.stickerMessage ||
          null;
        const mediaTarget = stickerNode || msg.message.videoMessage || msg.message.documentMessage;

        const looksLikeSticker =
          Boolean(stickerNode) || topLevelKeys.some((k) => k.toLowerCase().includes('sticker'));
        if (!looksLikeSticker && !(isArmed && mediaTarget)) {
          continue;
        }

        let mediaInspection = null;
        if (mediaTarget) {
          let dlBuf = null;
          try {
            if (typeof downloadMediaMessage === 'function') {
              dlBuf = await downloadMediaMessage(
                msg,
                'buffer',
                {},
                { reuploadRequest: curSession.sock?.updateMediaMessage }
              );
            } else if (typeof downloadContentFromMessage === 'function') {
              const stream = await downloadContentFromMessage(mediaTarget, stickerNode ? 'sticker' : 'document');
              const chunks = [];
              let size = 0;
              for await (const chunk of stream) {
                if (size < 512 * 1024) chunks.push(chunk);
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

        const stickerMeta = summarizeNonBufferFields(stickerNode || msg.message);
        if (!isArmed && !isInterestingSoundBlueprint(topLevelKeys, stickerMeta, mediaInspection)) {
          continue;
        }

        curSession.calibratingSoundSticker = false;
        curSession.calibrationArmedUntil = 0;

        const blueprint = {
          capturedAt: Date.now(),
          baileysVersion: '6.7.24',
          topLevelKeys,
          hasMessageContextInfo: Boolean(msg.message.messageContextInfo),
          stickerMeta,
          messageKeys: topLevelKeys,
          stickerFields: stickerMeta,
          mediaInspection,
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
  });
}

async function buildAndSendSoundSticker({ io, sessionId, session, selfJid, payload }) {
  let stickerWebpBuf = null;
  let muxedMp4Buf = null;
  let muxedWebmBuf = null;
  let audioOpusBuf = null;
  let audioM4aBuf = null;
  let containerBuf = null;

  try {
    const {
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

    const activeBlueprint = sanitizeBlueprint(clientBlueprint) || session.soundStickerBlueprint || null;
    const safeWidth = Math.max(16, Math.min(1024, Number(width) || 512));
    const safeHeight = Math.max(16, Math.min(1024, Number(height) || 512));

    let modeUsed = 'safe-webp-sticker';
    let note = 'Stiker WebP 512x512 native terkirim aman tanpa bubble video/VN.';
    let mediaMsg = null;

    const bpMime = String(activeBlueprint?.stickerMeta?.mimetype || '').toLowerCase();
    const bpContainer = activeBlueprint?.mediaInspection?.detectedContainer || '';

    if (
      activeBlueprint &&
      (bpContainer === 'mp4' || bpContainer === 'webm' || bpMime.includes('video/mp4') || bpMime.includes('video/webm')) &&
      (muxedMp4Buf || muxedWebmBuf)
    ) {
      // Kasus 2: Blueprint menggunakan stickerMessage bermedia kontainer MP4 / WebM
      const preferWebm = bpContainer === 'webm' || bpMime.includes('webm');
      containerBuf = preferWebm && muxedWebmBuf ? muxedWebmBuf : muxedMp4Buf || muxedWebmBuf;
      const targetMime = preferWebm && muxedWebmBuf ? 'video/webm' : 'video/mp4';

      mediaMsg = await prepareWAMessageMedia(
        { sticker: containerBuf },
        {
          upload: session.sock.waUploadToServer,
          mediaTypeOverride: 'sticker'
        }
      );
      if (mediaMsg?.stickerMessage) {
        mediaMsg.stickerMessage.mimetype = bpMime || targetMime;
        mediaMsg.stickerMessage.isAnimated = true;
        mediaMsg.stickerMessage.width = safeWidth;
        mediaMsg.stickerMessage.height = safeHeight;
        mediaMsg.stickerMessage.stickerSentTs = Date.now();
        if (activeBlueprint.stickerMeta?.accessibilityLabel) {
          mediaMsg.stickerMessage.accessibilityLabel = activeBlueprint.stickerMeta.accessibilityLabel;
        }
      }
      modeUsed = `blueprint-${targetMime}`;
      note = `Dikirim mengikuti blueprint container ${targetMime} asli WhatsApp.`;
    } else {
      // Kasus 1 (Blueprint WebP + custom chunk/EXIF) atau Kasus 3 (Default WebP 512x512 aman)
      const bestAudioBuf = audioOpusBuf || audioM4aBuf;
      const { finalWebpBuf, customized } = activeBlueprint
        ? applyBlueprintToWebp(stickerWebpBuf, activeBlueprint, { audioBuf: bestAudioBuf, durationSec })
        : { finalWebpBuf: stickerWebpBuf, customized: false };

      mediaMsg = await prepareWAMessageMedia(
        {
          sticker: finalWebpBuf,
          mimetype: 'image/webp',
          isAnimated: Boolean(isAnimatedBitstream),
          width: safeWidth,
          height: safeHeight
        },
        {
          upload: session.sock.waUploadToServer,
          mediaTypeOverride: 'sticker'
        }
      );
      if (mediaMsg?.stickerMessage) {
        mediaMsg.stickerMessage.mimetype = 'image/webp';
        mediaMsg.stickerMessage.isAnimated = Boolean(isAnimatedBitstream);
        mediaMsg.stickerMessage.width = safeWidth;
        mediaMsg.stickerMessage.height = safeHeight;
        mediaMsg.stickerMessage.stickerSentTs = Date.now();
        if (activeBlueprint?.stickerMeta?.accessibilityLabel) {
          mediaMsg.stickerMessage.accessibilityLabel = activeBlueprint.stickerMeta.accessibilityLabel;
        }
      }
      if (customized) {
        modeUsed = 'blueprint-webp-injected';
        note = 'Dikirim mengikuti blueprint WebP + metadata/chunk custom hasil kalibrasi.';
      }
    }

    stickerWebpBuf = null;
    muxedMp4Buf = null;
    muxedWebmBuf = null;
    audioOpusBuf = null;
    audioM4aBuf = null;
    containerBuf = null;

    if (!mediaMsg?.stickerMessage) {
      throw new Error('Gagal membangun objek stickerMessage WAProto.');
    }

    const userJid = session.sock.authState?.creds?.me?.id || selfJid;
    const customMsgId =
      typeof generateMessageIDV2 === 'function'
        ? generateMessageIDV2(session.sock.user.id)
        : typeof generateMessageID === 'function'
          ? generateMessageID()
          : undefined;

    const waMsg = generateWAMessageFromContent(selfJid, mediaMsg, {
      userJid,
      ...(customMsgId ? { messageId: customMsgId } : {})
    });

    // Guard anti pesan 0-byte & verifikasi WAProto sebelum enkripsi Signal
    const verifyErr = proto?.Message?.verify?.(waMsg.message);
    if (verifyErr) {
      throw new Error(`Struktur WAProto stiker tidak valid: ${verifyErr}`);
    }
    const encodedWire = proto?.Message?.encode ? proto.Message.encode(waMsg.message).finish() : null;
    if (!encodedWire || encodedWire.length <= 16) {
      throw new Error('Payload protobuf stiker kosong/terpangkas (<= 16 byte), pengiriman dibatalkan.');
    }

    // Simpan ke sentMessageStore SEBELUM relayMessage agar Signal retry receipt tidak pernah jatuh ke payload kosong
    rememberSentMessage(session, waMsg.key.id, waMsg.message);
    attachStickerDeliveryWatcher(io, sessionId, session, waMsg.key.id);

    await session.sock.relayMessage(selfJid, waMsg.message, {
      messageId: waMsg.key.id,
      useUserDevicesCache: false
    });

    return {
      ok: true,
      messageId: waMsg.key.id,
      protocol: 'native-stickerMessage',
      modeUsed,
      hasBlueprint: Boolean(activeBlueprint),
      needsBlueprintCalibration: !activeBlueprint,
      isAnimated: Boolean(mediaMsg.stickerMessage.isAnimated),
      encodedBytes: encodedWire.length,
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

/**
 * Handler Socket.io Khusus Stiker Suara WA (Native `stickerMessage`, Wire-Blueprint Cloner, Anti 0-byte)
 * DILARANG mengirim videoMessage maupun audioMessage terpisah.
 */
function registerStickerSenderHandler(io, socket) {
  socket.on('start-sound-sticker-calibration', (payload) => {
    try {
      const { sessionId, deviceToken } = payload || {};
      const tokenHash = verifyDeviceOwner(socket, sessionId, deviceToken);
      if (!tokenHash) return;

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

  socket.on('send-self-sound-sticker', async (payload) => {
    const { sessionId, deviceToken } = payload || {};

    try {
      const tokenHash = verifyDeviceOwner(socket, sessionId, deviceToken);
      if (!tokenHash) return;

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
          error: 'Perangkat WhatsApp belum tertaut aktif. Tautkan WhatsApp Anda terlebih dahulu.'
        });
      }

      const now = Date.now();
      const prevSentAt = lastStickerSendAt.get(sessionId) || 0;
      if (now - prevSentAt < RATE_LIMIT_MS) {
        const waitSec = Math.ceil((RATE_LIMIT_MS - (now - prevSentAt)) / 1000);
        return emitToDevice(io, sessionId, 'sound-sticker-result', {
          ok: false,
          error: `Jeda anti-spam aktif. Tunggu ${waitSec} detik sebelum mengirim ulang.`
        });
      }

      const selfJid = jidNormalizedUser(session.sock.user.id);
      if (!selfJid || !selfJid.endsWith('@s.whatsapp.net')) {
        return emitToDevice(io, sessionId, 'sound-sticker-result', {
          ok: false,
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
