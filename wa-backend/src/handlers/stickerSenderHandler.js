const baileysModule = require('@whiskeysockets/baileys');
const { sessions } = require('../state/sessionStore');
const { verifyDeviceOwner, emitToDevice } = require('../services/deviceAuthService');
const { rememberSentMessage } = require('./whatsappSessionHandler');

const {
  proto,
  prepareWAMessageMedia,
  generateWAMessageFromContent,
  generateMessageIDV2,
  generateMessageID,
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

const MAX_STICKER_BYTES = 1.5 * 1024 * 1024;
const RATE_LIMIT_MS = 4000;
const CALIBRATION_WINDOW_MS = 120 * 1000;
const DELIVERY_WATCH_MS = 15 * 1000;

const lastStickerSendAt = new Map();

function validateStickerWebpBuffer(buf) {
  if (!buf || buf.length < 12) {
    throw new Error('Berkas stiker WebP terlalu pendek atau rusak.');
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
    if (fourCC === 'ANIM' || fourCC === 'ANMF') {
      hasAnimChunk = true;
    }
    if (fourCC === 'VP8 ' || fourCC === 'VP8L' || fourCC === 'ANMF') {
      hasImageFrame = true;
    }
    offset += 8 + size + (size % 2);
  }
  if (!hasImageFrame) {
    throw new Error('Stiker WebP tidak memiliki frame gambar yang valid.');
  }
  return { isAnimatedBitstream: hasAnimChunk };
}

function attachStickerDeliveryWatcher(io, sessionId, session, messageId) {
  const sock = session?.sock;
  if (!sock?.ev || !messageId) return;

  const statusLabels = {
    2: 'Terkirim ke server WhatsApp',
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
  if (approxBytes <= 0 || approxBytes > maxBytes) {
    throw new Error(`Ukuran ${label} melebihi batas aman (${(maxBytes / (1024 * 1024)).toFixed(1)} MB).`);
  }

  const buf = Buffer.from(cleaned, 'base64');
  if (!buf || buf.length === 0) {
    throw new Error(`Data ${label} kosong atau rusak.`);
  }
  if (buf.length > maxBytes) {
    throw new Error(`Ukuran ${label} melebihi batas aman server.`);
  }
  return buf;
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

function inspectMagicAndChunks(buf) {
  if (!buf || buf.length === 0) return { magicHex: '', magicAscii: '', containers: [] };
  const head = buf.subarray(0, Math.min(32, buf.length));
  const magicHex = head.toString('hex');
  const magicAscii = Array.from(head, (b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.')).join('');

  const containers = [];
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    let off = 12;
    while (off + 8 <= buf.length && containers.length < 40) {
      const fcc = buf.toString('ascii', off, off + 4);
      const sz = buf.readUInt32LE(off + 4);
      containers.push(`${fcc}:${sz}`);
      off += 8 + sz + (sz % 2);
    }
  } else if (buf.length >= 12 && buf.toString('ascii', 4, 8) === 'ftyp') {
    let off = 0;
    while (off + 8 <= buf.length && containers.length < 40) {
      const sz = buf.readUInt32BE(off);
      const box = buf.toString('ascii', off + 4, off + 8);
      if (sz < 8) break;
      containers.push(`${box}:${sz}`);
      off += sz;
    }
  }

  return { magicHex, magicAscii, totalBytes: buf.length, containers };
}

function attachCalibrationListener(io, sessionId, session) {
  const sock = session?.sock;
  if (!sock || session._calibrationHookSock === sock) return;
  session._calibrationHookSock = sock;

  sock.ev.on('messages.upsert', async ({ messages }) => {
    try {
      const curSession = sessions.get(sessionId);
      if (!curSession || !curSession.calibrationArmedUntil || Date.now() > curSession.calibrationArmedUntil) {
        return;
      }
      if (!Array.isArray(messages) || messages.length === 0) return;

      const selfJid = curSession.sock?.user?.id ? jidNormalizedUser(curSession.sock.user.id) : '';

      for (const msg of messages) {
        if (!msg?.message || !msg?.key) continue;
        const remoteNorm = jidNormalizedUser(msg.key.remoteJid || '');
        if (!msg.key.fromMe || (selfJid && remoteNorm !== selfJid)) continue;

        const msgKeys = Object.keys(msg.message);
        const stickerNode = msg.message.stickerMessage || msg.message.lottieStickerMessage?.message?.stickerMessage;
        const mediaTarget = stickerNode || msg.message.videoMessage || msg.message.documentMessage;
        if (!stickerNode && !msgKeys.some((k) => k.toLowerCase().includes('sticker'))) {
          continue;
        }

        curSession.calibrationArmedUntil = 0;

        let binarySummary = null;
        if (mediaTarget && typeof downloadContentFromMessage === 'function') {
          let dlBuf = null;
          try {
            const stream = await downloadContentFromMessage(mediaTarget, stickerNode ? 'sticker' : 'document');
            const chunks = [];
            let size = 0;
            for await (const chunk of stream) {
              if (size < 256 * 1024) chunks.push(chunk);
              size += chunk.length;
            }
            dlBuf = Buffer.concat(chunks);
            binarySummary = inspectMagicAndChunks(dlBuf);
          } catch (dlErr) {
            binarySummary = { error: dlErr.message };
          } finally {
            dlBuf = null;
          }
        }

        const schemaReport = {
          capturedAt: Date.now(),
          baileysVersion: '6.7.24',
          waProtoHasStickerAudioField: false,
          messageKeys: msgKeys,
          stickerFields: summarizeNonBufferFields(stickerNode || msg.message),
          binarySummary
        };

        emitToDevice(io, sessionId, 'sound-sticker-schema-detected', schemaReport);
        break;
      }
    } catch (err) {
      console.warn(`[Calibration ${sessionId}] Error:`, err.message);
    }
  });
}

/**
 * Handler Socket.io Khusus Stiker Suara WA (Native `stickerMessage` + Kalibrasi Skema Zero-Disk)
 * DILARANG mengirim videoMessage maupun audioMessage terpisah.
 *
 * Hasil Audit WAProto (@whiskeysockets/baileys@6.7.24):
 * IStickerMessage pada WAProto/index.d.ts hanya memiliki field:
 * url, fileSha256, fileEncSha256, mediaKey, mimetype, height, width, directPath,
 * fileLength, mediaKeyTimestamp, firstFrameLength, firstFrameSidecar, isAnimated,
 * pngThumbnail, contextInfo, stickerSentTs, isAvatar, isAiSticker, isLottie, accessibilityLabel.
 * Belum ada field audio/sound pada IStickerMessage di versi 6.7.24 ini.
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
          error: 'Hubungkan WhatsApp terlebih dahulu sebelum memulai kalibrasi skema.'
        });
      }

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
    let stickerBuf = null;

    const {
      sessionId,
      deviceToken,
      stickerWebpBase64,
      isAnimated = false,
      width = 512,
      height = 512
    } = payload || {};

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

      stickerBuf = decodeBoundedBase64(stickerWebpBase64, MAX_STICKER_BYTES, 'stiker WebP 512x512');
      const { isAnimatedBitstream } = validateStickerWebpBuffer(stickerBuf);
      const actualAnimated = Boolean(isAnimatedBitstream);
      const safeWidth = Math.max(16, Math.min(1024, Number(width) || 512));
      const safeHeight = Math.max(16, Math.min(1024, Number(height) || 512));

      // Kirim murni melalui jalur native `stickerMessage` dengan validasi protobuf & retry store E2EE
      const mediaMsg = await prepareWAMessageMedia(
        {
          sticker: stickerBuf,
          mimetype: 'image/webp',
          isAnimated: actualAnimated,
          width: safeWidth,
          height: safeHeight
        },
        {
          upload: session.sock.waUploadToServer,
          mediaTypeOverride: 'sticker'
        }
      );
      stickerBuf = null;

      if (!mediaMsg?.stickerMessage) {
        throw new Error('Gagal mengunggah media stiker ke CDN WhatsApp.');
      }

      mediaMsg.stickerMessage.mimetype = 'image/webp';
      mediaMsg.stickerMessage.isAnimated = actualAnimated;
      mediaMsg.stickerMessage.width = safeWidth;
      mediaMsg.stickerMessage.height = safeHeight;
      mediaMsg.stickerMessage.stickerSentTs = Date.now();

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

      const verifyErr = proto?.Message?.verify?.(waMsg.message);
      if (verifyErr) {
        throw new Error(`Struktur WAProto stiker tidak valid: ${verifyErr}`);
      }

      // Wajib cache sebelum relayMessage agar Signal retry receipt tidak pernah jatuh ke payload kosong
      rememberSentMessage(session, waMsg.key.id, waMsg.message);
      attachStickerDeliveryWatcher(io, sessionId, session, waMsg.key.id);

      await session.sock.relayMessage(selfJid, waMsg.message, {
        messageId: waMsg.key.id,
        useUserDevicesCache: false
      });

      session.lastActive = Date.now();
      lastStickerSendAt.set(sessionId, Date.now());

      emitToDevice(io, sessionId, 'sound-sticker-result', {
        ok: true,
        messageId: waMsg.key.id,
        protocol: 'native-stickerMessage',
        isAnimated: actualAnimated,
        waProtoSupportsAudio: false,
        needsSchemaCalibration: true,
        selfJid,
        sentAt: Date.now()
      });
    } catch (err) {
      console.error('Error send-self-sound-sticker:', err.message);
      if (sessionId) {
        emitToDevice(io, sessionId, 'sound-sticker-result', {
          ok: false,
          error: err.message || 'Gagal mengirim stiker ke WhatsApp.'
        });
      }
    } finally {
      stickerBuf = null;
    }
  });
}

module.exports = {
  registerStickerSenderHandler
};
