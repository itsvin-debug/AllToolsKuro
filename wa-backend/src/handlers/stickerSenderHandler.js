const baileysModule = require('@whiskeysockets/baileys');
const { sessions } = require('../state/sessionStore');
const { verifyDeviceOwner, emitToDevice } = require('../services/deviceAuthService');

const jidNormalizedUser =
  baileysModule.jidNormalizedUser ||
  ((jid = '') => {
    const clean = String(jid || '').trim();
    const userPart = clean.split('@')[0].split(':')[0];
    return userPart ? `${userPart}@s.whatsapp.net` : '';
  });

const MAX_VIDEO_BYTES = 5 * 1024 * 1024;
const MAX_WEBP_BYTES = 1.2 * 1024 * 1024;
const RATE_LIMIT_MS = 4000;

const lastStickerSendAt = new Map();

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

/**
 * Handler Socket.io Terisolasi & Zero-Disk untuk Stiker Suara Kotak 1:1 (Target Terkunci ke Diri Sendiri)
 * Audit WAProto (@whiskeysockets/baileys@6.7.24):
 * IStickerMessage belum memiliki field audio/sound dan memaksa mimetype 'image/webp'.
 * Pengiriman 1-file kotak 512x512 MP4 bersuara (video 1:1 gifPlayback:false ptv:false) menjaga objek tunggal bersuara di WA.
 */
function registerStickerSenderHandler(io, socket) {
  socket.on('send-self-sound-sticker', async (payload) => {
    let videoBuf = null;
    let stickerBuf = null;

    const {
      sessionId,
      deviceToken,
      videoMp4Base64,
      stickerWebpBase64 = '',
      includeFavoriteWebp = false,
      caption = ''
    } = payload || {};

    try {
      const tokenHash = verifyDeviceOwner(socket, sessionId, deviceToken);
      if (!tokenHash) return;

      const session = sessions.get(sessionId);
      if (!session || session.status !== 'connected' || !session.sock || !session.sock.user?.id) {
        return emitToDevice(io, sessionId, 'sound-sticker-result', {
          ok: false,
          error: 'Perangkat WhatsApp belum tertaut aktif. Hubungkan WhatsApp Anda terlebih dahulu.'
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

      // Target pengiriman terkunci mutlak ke nomor pemilik perangkat sendiri
      const selfJid = jidNormalizedUser(session.sock.user.id);
      if (!selfJid || !selfJid.endsWith('@s.whatsapp.net')) {
        return emitToDevice(io, sessionId, 'sound-sticker-result', {
          ok: false,
          error: 'Nomor WhatsApp pemilik sesi tidak dapat diverifikasi.'
        });
      }

      const safeCaption = String(caption || '').slice(0, 300).trim();
      videoBuf = decodeBoundedBase64(videoMp4Base64, MAX_VIDEO_BYTES, 'stiker suara 512x512 MP4');

      // Kirim 1 file kotak persegi 512x512 MP4 bersuara (bukan bulat PTV dan bukan Voice Note terpisah)
      const sentVideoMsg = await session.sock.sendMessage(selfJid, {
        video: videoBuf,
        mimetype: 'video/mp4',
        gifPlayback: false,
        ptv: false,
        caption: safeCaption
      });
      videoBuf = null;

      if (includeFavoriteWebp && stickerWebpBase64) {
        stickerBuf = decodeBoundedBase64(stickerWebpBase64, MAX_WEBP_BYTES, 'versi stiker WebP');
        await session.sock.sendMessage(
          selfJid,
          { sticker: stickerBuf },
          sentVideoMsg ? { quoted: sentVideoMsg } : undefined
        );
        stickerBuf = null;
      }

      session.lastActive = Date.now();
      lastStickerSendAt.set(sessionId, Date.now());

      emitToDevice(io, sessionId, 'sound-sticker-result', {
        ok: true,
        deliveryMode: includeFavoriteWebp && stickerWebpBase64 ? 'square-mp4+webp' : 'square-mp4',
        selfJid,
        sentAt: Date.now()
      });
    } catch (err) {
      console.error('Error send-self-sound-sticker:', err.message);
      if (sessionId) {
        emitToDevice(io, sessionId, 'sound-sticker-result', {
          ok: false,
          error: err.message || 'Gagal mengirim stiker suara ke WhatsApp.'
        });
      }
    } finally {
      videoBuf = null;
      stickerBuf = null;
    }
  });
}

module.exports = {
  registerStickerSenderHandler
};
