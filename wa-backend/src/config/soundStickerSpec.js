const fs = require('fs');
const path = require('path');

function readInstalledBaileysVersion() {
  try {
    const pkgPath = path.join(__dirname, '../../node_modules/@whiskeysockets/baileys/package.json');
    const parsed = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    if (parsed?.version) return String(parsed.version);
  } catch (_) {}
  return '6.7.24';
}

const BAILEYS_VERSION = readInstalledBaileysVersion();
const MAX_STATIC_WEBP_BYTES = 100 * 1024;
const MAX_ANIMATED_WEBP_BYTES = 480 * 1024;
const MAX_MUXED_CONTAINER_BYTES = 3 * 1024 * 1024;

// Spesifikasi global anonim di RAM server (tanpa nomor HP/JID/media pengguna)
const activeSpec = {
  version: 1,
  mode: 'native_webp_clean',
  calibrated: false,
  container: 'webp',
  mimetype: 'image/webp',
  hkdfMediaType: 'sticker',
  canEncodeCleanly: false,
  hasUnsupportedUnknownProtoFields: false,
  reason: 'Menggunakan WebP 512x512 native bersih agar 100% langsung terbaca tanpa "Menunggu pesan ini".',
  baileysVersion: BAILEYS_VERSION,
  maxStaticBytes: MAX_STATIC_WEBP_BYTES,
  maxAnimatedBytes: MAX_ANIMATED_WEBP_BYTES,
  maxMuxedBytes: MAX_MUXED_CONTAINER_BYTES,
  protoPatchRules: {
    wrapperChain: [],
    topLevelKeys: [],
    unknownTags: [],
    customRiffChunks: [],
    extraExifKeys: [],
    exifTemplate: null,
    hasDirectAudioEmbed: false
  },
  updatedAt: null
};

function sanitizeAnonymousExifTemplate(exifJson, extraKeys = []) {
  if (!exifJson || typeof exifJson !== 'object' || !Array.isArray(extraKeys) || extraKeys.length === 0) {
    return null;
  }
  const tpl = {};
  for (const k of extraKeys.slice(0, 12)) {
    const cleanKey = String(k || '').slice(0, 48);
    if (!cleanKey) continue;
    const val = exifJson[k];
    if (typeof val === 'number' || typeof val === 'boolean') {
      tpl[cleanKey] = val;
    } else if (typeof val === 'string' && !/\d{8,}/.test(val)) {
      tpl[cleanKey] = val.slice(0, 64);
    }
  }
  return Object.keys(tpl).length > 0 ? tpl : null;
}

function getGlobalSoundStickerSpec() {
  return {
    version: activeSpec.version,
    mode: activeSpec.mode,
    calibrated: activeSpec.calibrated,
    container: activeSpec.container,
    mimetype: activeSpec.mimetype,
    hkdfMediaType: activeSpec.hkdfMediaType,
    canEncodeCleanly: activeSpec.canEncodeCleanly,
    hasUnsupportedUnknownProtoFields: activeSpec.hasUnsupportedUnknownProtoFields,
    reason: activeSpec.reason,
    baileysVersion: activeSpec.baileysVersion,
    maxStaticBytes: activeSpec.maxStaticBytes,
    maxAnimatedBytes: activeSpec.maxAnimatedBytes,
    maxMuxedBytes: activeSpec.maxMuxedBytes,
    protoPatchRules: {
      wrapperChain: [...activeSpec.protoPatchRules.wrapperChain],
      topLevelKeys: [...activeSpec.protoPatchRules.topLevelKeys],
      unknownTags: activeSpec.protoPatchRules.unknownTags.map((t) => ({ ...t })),
      customRiffChunks: activeSpec.protoPatchRules.customRiffChunks.map((c) => ({ ...c })),
      extraExifKeys: [...activeSpec.protoPatchRules.extraExifKeys],
      exifTemplate: activeSpec.protoPatchRules.exifTemplate ? { ...activeSpec.protoPatchRules.exifTemplate } : null,
      hasDirectAudioEmbed: activeSpec.protoPatchRules.hasDirectAudioEmbed
    },
    updatedAt: activeSpec.updatedAt
  };
}

/**
 * Promosikan metadata struktur protokol anonim dari blueprint terkalibrasi ke spec global.
 * Tidak pernah menyimpan nomor WA, JID, mediaKey, URL, maupun bytes media pengguna.
 */
function promoteVerifiedBlueprintToGlobalSpec(blueprint) {
  if (!blueprint || typeof blueprint !== 'object') {
    return getGlobalSoundStickerSpec();
  }

  const mi = blueprint.mediaInspection && typeof blueprint.mediaInspection === 'object' ? blueprint.mediaInspection : {};
  const sm = blueprint.stickerMeta && typeof blueprint.stickerMeta === 'object' ? blueprint.stickerMeta : {};
  const unknownTags = Array.isArray(blueprint.unknownWireTags)
    ? blueprint.unknownWireTags.slice(0, 12).map((t) => ({
        field: Number(t.field),
        wireType: Number(t.wireType),
        len: Number(t.len) || 0
      }))
    : [];

  const detectedContainer = String(mi.detectedContainer || 'webp').slice(0, 24);
  const mimetype = String(sm.mimetype || 'image/webp').slice(0, 64);
  const hkdfMediaType = String(blueprint.decryptedByMediaType || (detectedContainer === 'webp' ? 'sticker' : 'document')).slice(0, 24);
  const customChunks = Array.isArray(mi.customChunks)
    ? mi.customChunks.slice(0, 8).map((c) => ({
        fourCC: String(c.fourCC || '').slice(0, 4),
        size: Number(c.size) || 0
      }))
    : [];
  const extraExifKeys = Array.isArray(mi.extraExifKeys) ? mi.extraExifKeys.slice(0, 12).map(String) : [];

  const hasUnknownProto = unknownTags.length > 0;
  const isCleanWebpCustom =
    detectedContainer === 'webp' &&
    !hasUnknownProto &&
    (customChunks.length > 0 || extraExifKeys.length > 0);

  activeSpec.version += 1;
  activeSpec.calibrated = true;
  activeSpec.container = detectedContainer;
  activeSpec.mimetype = mimetype;
  activeSpec.hkdfMediaType = hkdfMediaType;
  activeSpec.hasUnsupportedUnknownProtoFields = hasUnknownProto;
  activeSpec.updatedAt = Date.now();
  activeSpec.protoPatchRules = {
    wrapperChain: Array.isArray(blueprint.wrapperChain) ? blueprint.wrapperChain.slice(0, 6).map(String) : [],
    topLevelKeys: Array.isArray(blueprint.topLevelKeys) ? blueprint.topLevelKeys.slice(0, 12).map(String) : [],
    unknownTags,
    customRiffChunks: customChunks,
    extraExifKeys,
    exifTemplate: sanitizeAnonymousExifTemplate(mi.exifJson, extraExifKeys),
    hasDirectAudioEmbed: customChunks.length > 0
  };

  if (isCleanWebpCustom) {
    activeSpec.mode = 'verified_webp_chunk_clone';
    activeSpec.canEncodeCleanly = true;
    activeSpec.reason = 'Format global aktif: WebP chunk/EXIF terverifikasi cocok dengan WAProto 6.7.24.';
  } else if (hasUnknownProto) {
    activeSpec.mode = 'detected_unsupported_proto_tag';
    activeSpec.canEncodeCleanly = false;
    activeSpec.reason = `Contoh stiker audio memakai protobuf tag baru (${unknownTags.map((t) => `#${t.field}`).join(', ')}) di luar skema WAProto ${BAILEYS_VERSION}; pengiriman memakai WebP bersih agar 0% "Menunggu pesan ini".`;
  } else if (detectedContainer !== 'webp') {
    activeSpec.mode = 'detected_non_webp_container';
    activeSpec.canEncodeCleanly = false;
    activeSpec.reason = `Contoh terdeteksi container ${detectedContainer.toUpperCase()} (HKDF: ${hkdfMediaType}); menjaga pengiriman WebP bersih agar bebas dari "Menunggu pesan ini".`;
  } else {
    activeSpec.mode = 'native_webp_clean';
    activeSpec.canEncodeCleanly = false;
    activeSpec.reason = 'Contoh berformat WebP standar WhatsApp; memakai jalur WebP 512x512 bersih.';
  }

  return getGlobalSoundStickerSpec();
}

function validateStickerMediaPayload(buf, opts = {}) {
  const { allowMuxed = false } = opts || {};
  if (!Buffer.isBuffer(buf) || buf.length < 20) {
    throw new Error('Berkas stiker terlalu kecil atau kosong.');
  }

  const isRiffWebp = buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';
  if (isRiffWebp) {
    const declaredSize = buf.readUInt32LE(4);
    if (declaredSize !== buf.length - 8) {
      throw new Error('Header panjang RIFF WebP tidak sesuai dengan ukuran biner.');
    }

    let offset = 12;
    let hasVp8x = false;
    let hasExif = false;
    let hasAnim = false;
    let hasAnmf = false;
    let hasImageFrame = false;

    while (offset + 8 <= buf.length) {
      const fourCC = buf.toString('ascii', offset, offset + 4);
      const size = buf.readUInt32LE(offset + 4);
      if (offset + 8 + size > buf.length) {
        throw new Error('Panjang chunk RIFF WebP tidak konsisten atau terpotong.');
      }
      if (fourCC === 'VP8X') hasVp8x = true;
      if (fourCC === 'EXIF') hasExif = true;
      if (fourCC === 'ANIM') hasAnim = true;
      if (fourCC === 'ANMF') hasAnmf = true;
      if (fourCC === 'VP8 ' || fourCC === 'VP8L' || fourCC === 'ANMF') hasImageFrame = true;
      offset += 8 + size + (size % 2);
    }

    if (!hasImageFrame) {
      throw new Error('Stiker WebP tidak memiliki frame gambar yang valid.');
    }

    const isAnimatedBitstream = hasAnim || hasAnmf;
    if (isAnimatedBitstream && buf.length > MAX_ANIMATED_WEBP_BYTES) {
      throw new Error(`Stiker WebP animasi (${(buf.length / 1024).toFixed(1)} KB) melebihi batas aman 480 KB.`);
    }
    if (!isAnimatedBitstream && buf.length > MAX_STATIC_WEBP_BYTES) {
      throw new Error(`Stiker WebP statis (${(buf.length / 1024).toFixed(1)} KB) melebihi batas aman 100 KB.`);
    }

    return {
      container: 'webp',
      isAnimatedBitstream,
      hasVp8x,
      hasExif,
      bytes: buf.length
    };
  }

  if (allowMuxed) {
    if (buf.length > MAX_MUXED_CONTAINER_BYTES) {
      throw new Error('Ukuran container muxed melebihi batas maksimal 3.0 MB.');
    }
    const isMp4 = buf.length >= 12 && buf.toString('ascii', 4, 8) === 'ftyp';
    const isWebm = buf.length >= 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3;
    if (isMp4 || isWebm) {
      return {
        container: isMp4 ? 'mp4' : 'webm',
        isAnimatedBitstream: true,
        hasVp8x: false,
        hasExif: false,
        bytes: buf.length
      };
    }
  }

  throw new Error('Format media stiker bukan WebP RIFF yang valid.');
}

module.exports = {
  BAILEYS_VERSION,
  MAX_STATIC_WEBP_BYTES,
  MAX_ANIMATED_WEBP_BYTES,
  MAX_MUXED_CONTAINER_BYTES,
  getGlobalSoundStickerSpec,
  promoteVerifiedBlueprintToGlobalSpec,
  validateStickerMediaPayload
};
