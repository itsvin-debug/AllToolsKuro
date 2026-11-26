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

const MAX_WEBP_BYTES = 1.2 * 1024 * 1024;
const MAX_AUDIO_BYTES = 3 * 1024 * 1024;
const MAX_VIDEO_BYTES = 5 * 1024 * 1024;
const RATE_LIMIT_MS = 4000;

const ALLOWED_AUDIO_MIMES = new Set([
  'audio/mp4',
  'audio/aac',
  'audio/ogg; codecs=opus',
  'audio/ogg;codecs=opus',
  'audio/ogg',
  'audio/mpeg',
  'audio/wav',
  'audio/webm'
]);

const lastStickerSendAt = new Map();

function decodeBoundedBase64(rawInput, maxBytes, label) {
  if (!rawInput || typeof rawInput !== 'string') {
    throw new Error(`Payload ${label} tidak tersedia.`);
  }
  const commaIdx = rawInput.indexOf(',');
  const pureBase64 = commaIdx !== -1 && rawInput.slice(0, commaIdx).includes('base64')
    ? rawInput.slice(commaIdx + 1)
    : rawInput;
  const cleaned = pureBase64.replace(/\s+/g, '');

  // Estimasi awal sebelum alokasi Buffer agar RAM tetap aman
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
 * Handler Socket.io Terisolasi & Zero-Disk untuk Pengiriman Stiker Suara ke Nomor Pemilik Sendiri
 */
function registerStickerSenderHandler(io, socket) {
  socket.on('send-self-sound-sticker', async (payload) => {
    let stickerBuf = null;
    let audioBuf = null;
    let videoBuf = null;

    const {
      sessionId,
      deviceToken,
      deliveryMode = 'combo',
      stickerWebpBase64,
      audioBase64,
      audioMime = 'audio/mp4',
      audioPtt = false,
      videoMp4Base64,
      useCircularPtv = false,
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

      // Target mutlak terkunci hanya ke JID akun WhatsApp pemilik sesi sendiri
      const selfJid = jidNormalizedUser(session.sock.user.id);
      if (!selfJid || !selfJid.endsWith('@s.whatsapp.net')) {
        return emitToDevice(io, sessionId, 'sound-sticker-result', {
          ok: false,
          error: 'Nomor WhatsApp pemilik sesi tidak dapat diverifikasi.'
        });
      }

      const mode = deliveryMode === 'video-note' || deliveryMode === 'both' ? deliveryMode : 'combo';
      const normalizedMime = String(audioMime || 'audio/mp4').trim().toLowerCase();
      const safeAudioMime = ALLOWED_AUDIO_MIMES.has(normalizedMime) ? normalizedMime : 'audio/mp4';
      const safeCaption = String(caption || '').slice(0, 300).trim();

      if (mode === 'combo') {
        stickerBuf = decodeBoundedBase64(stickerWebpBase64, MAX_WEBP_BYTES, 'stiker WebP');
        audioBuf = decodeBoundedBase64(audioBase64, MAX_AUDIO_BYTES, 'audio potongan');

        const sentStickerMsg = await session.sock.sendMessage(selfJid, { sticker: stickerBuf });
        stickerBuf = null;

        await session.sock.sendMessage(
          selfJid,
          {
            audio: audioBuf,
            mimetype: safeAudioMime,
            ptt: Boolean(audioPtt)
          },
          sentStickerMsg ? { quoted: sentStickerMsg } : undefined
        );
        audioBuf = null;
      } else if (mode === 'video-note') {
        videoBuf = decodeBoundedBase64(videoMp4Base64, MAX_VIDEO_BYTES, 'video stiker');
        await session.sock.sendMessage(selfJid, {
          video: videoBuf,
          mimetype: 'video/mp4',
          ptv: Boolean(useCircularPtv),
          gifPlayback: false,
          caption: Boolean(useCircularPtv) ? '' : safeCaption
        });
        videoBuf = null;
      } else {
        stickerBuf = decodeBoundedBase64(stickerWebpBase64, MAX_WEBP_BYTES, 'stiker WebP');
        videoBuf = decodeBoundedBase64(videoMp4Base64, MAX_VIDEO_BYTES, 'video stiker');

        const sentStickerMsg = await session.sock.sendMessage(selfJid, { sticker: stickerBuf });
        stickerBuf = null;

        await session.sock.sendMessage(
          selfJid,
          {
            video: videoBuf,
            mimetype: 'video/mp4',
            ptv: Boolean(useCircularPtv),
            gifPlayback: false,
            caption: Boolean(useCircularPtv) ? '' : safeCaption
          },
          sentStickerMsg ? { quoted: sentStickerMsg } : undefined
        );
        videoBuf = null;
      }

      session.lastActive = Date.now();
      lastStickerSendAt.set(sessionId, Date.now());

      emitToDevice(io, sessionId, 'sound-sticker-result', {
        ok: true,
        deliveryMode: mode,
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
      stickerBuf = null;
      audioBuf = null;
      videoBuf = null;
    }
  });
}

module.exports = {
  registerStickerSenderHandler
};
