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
  deliveryRoute: 'jalur_d_uncalibrated_webp',
  calibrated: false,
  hasAudioSignature: false,
  messageType: 'stickerMessage',
  container: 'webp',
  mimetype: 'image/webp',
  hkdfMediaType: 'sticker',
  canEncodeCleanly: false,
  hasUnsupportedUnknownProtoFields: false,
  reason: 'Belum dikalibrasi. Kiriman memakai WebP 512x512 bersih via sock.sendMessage (0% "Menunggu pesan ini").',
  baileysVersion: BAILEYS_VERSION,
  maxStaticBytes: MAX_STATIC_WEBP_BYTES,
  maxAnimatedBytes: MAX_ANIMATED_WEBP_BYTES,
  maxMuxedBytes: MAX_MUXED_CONTAINER_BYTES,
  protoPatchRules: {
    wrapperChain: [],
    topLevelKeys: [],
    innerMeta: {},
    unknownWireFields: [],
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

function sanitizeUnknownWireFields(rawFields = []) {
  if (!Array.isArray(rawFields)) return [];
  return rawFields.slice(0, 16).map((t) => ({
    scope: typeof t.scope === 'string' ? t.scope.slice(0, 32) : 'Message',
    ...(t.parentField ? { parentField: Number(t.parentField) } : {}),
    field: Number(t.field),
    wireType: Number(t.wireType),
    ...(t.varintValue !== undefined ? { varintValue: t.varintValue } : {}),
    ...(t.len !== undefined ? { len: Number(t.len) || 0 } : {}),
    ...(typeof t.previewUtf8 === 'string' ? { previewUtf8: t.previewUtf8.slice(0, 96) } : {}),
    ...(typeof t.hexHead === 'string' ? { hexHead: t.hexHead.slice(0, 32) } : {}),
    ...(Array.isArray(t.subFields) ? { subFields: t.subFields.slice(0, 16) } : {})
  }));
}

function getGlobalSoundStickerSpec() {
  return {
    version: activeSpec.version,
    mode: activeSpec.mode,
    deliveryRoute: activeSpec.deliveryRoute,
    calibrated: activeSpec.calibrated,
    hasAudioSignature: activeSpec.hasAudioSignature,
    messageType: activeSpec.messageType,
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
      innerMeta: { ...activeSpec.protoPatchRules.innerMeta },
      unknownWireFields: activeSpec.protoPatchRules.unknownWireFields.map((t) => ({ ...t })),
      unknownTags: activeSpec.protoPatchRules.unknownTags.map((t) => ({ ...t })),
      customRiffChunks: activeSpec.protoPatchRules.customRiffChunks.map((c) => ({ ...c })),
      extraExifKeys: [...activeSpec.protoPatchRules.extraExifKeys],
      exifTemplate: activeSpec.protoPatchRules.exifTemplate ? { ...activeSpec.protoPatchRules.exifTemplate } : null,
      hasDirectAudioEmbed: activeSpec.protoPatchRules.hasDirectAudioEmbed
    },
    updatedAt: activeSpec.updatedAt
  };
}

let activeBlueprintSnapshot = null;

/**
 * Promosikan struktur protokol anonim hasil deteksi ke spec global (mendukung Jalur A, B, C, dan D).
 */
function promoteVerifiedBlueprintToGlobalSpec(blueprint) {
  if (!blueprint || typeof blueprint !== 'object') {
    return getGlobalSoundStickerSpec();
  }

  // Tolak keras blueprint gagal dekripsi (stub: 2) atau paket wire kosong tanpa struktur
  if (blueprint.stubType !== null && blueprint.stubType !== undefined) {
    return getGlobalSoundStickerSpec();
  }

  const mi = blueprint.mediaInspection && typeof blueprint.mediaInspection === 'object' ? blueprint.mediaInspection : {};
  const hasOpaqueFields = Array.isArray(blueprint.opaqueInnerFields) && blueprint.opaqueInnerFields.length > 0;
  const hasWireTree = Array.isArray(blueprint.rawWireTree) && blueprint.rawWireTree.length > 0;
  const rawBytesLen = Number(blueprint.rawWireBytesLength || blueprint.quotedWireBytes || 0);
  if (rawBytesLen === 0 && !hasOpaqueFields && !hasWireTree && !(Number(mi.totalBytes) > 0)) {
    return getGlobalSoundStickerSpec();
  }

  const sm = (blueprint.innerMeta || blueprint.stickerMeta || {}) && typeof (blueprint.innerMeta || blueprint.stickerMeta) === 'object'
    ? (blueprint.innerMeta || blueprint.stickerMeta)
    : {};
  const unknownWireFields = sanitizeUnknownWireFields(blueprint.unknownWireFields || blueprint.unknownWireTags || []);

  const topKeys = Array.isArray(blueprint.topLevelKeys) ? blueprint.topLevelKeys.slice(0, 12).map(String) : [];
  const detectedMsgType = String(
    blueprint.messageType ||
      topKeys.find((k) => k !== 'messageContextInfo') ||
      'stickerMessage'
  ).slice(0, 48);

  const detectedContainer = String(mi.detectedContainer || mi.container || 'webp').slice(0, 24);
  const mimetype = String(sm.mimetype || 'image/webp').slice(0, 64);
  const hkdfMediaType = String(
    blueprint.hkdfMediaType ||
      blueprint.decryptedByMediaType ||
      (detectedContainer === 'webp' ? 'sticker' : detectedContainer === 'mp4' || detectedContainer === 'webm' ? 'video' : 'document')
  ).slice(0, 24);
  const customChunks = Array.isArray(mi.customChunks)
    ? mi.customChunks.slice(0, 8).map((c) => ({
        fourCC: String(c.fourCC || '').slice(0, 4),
        size: Number(c.size) || 0
      }))
    : [];
  const extraExifKeys = Array.isArray(mi.extraExifKeys) ? mi.extraExifKeys.slice(0, 12).map(String) : [];

  const isMuxedContainer =
    detectedContainer === 'mp4' ||
    detectedContainer === 'webm' ||
    mimetype.toLowerCase().includes('mp4') ||
    mimetype.toLowerCase().includes('webm');
  const isCleanWebpCustom =
    detectedContainer === 'webp' &&
    unknownWireFields.length === 0 &&
    (customChunks.length > 0 || extraExifKeys.length > 0);
  const hasUnknownProto = unknownWireFields.length > 0;
  const isAltMessageCarrier =
    detectedMsgType !== 'stickerMessage' && (isMuxedContainer || Boolean(sm.gifPlayback) || Boolean(sm.ptt) || detectedMsgType === 'ptvMessage' || detectedMsgType === 'videoMessage' || detectedMsgType === 'lottieStickerMessage');

  activeSpec.version += 1;
  activeSpec.calibrated = true;
  activeSpec.messageType = detectedMsgType;
  activeSpec.container = detectedContainer;
  activeSpec.mimetype = mimetype;
  activeSpec.hkdfMediaType = hkdfMediaType;
  activeSpec.hasUnsupportedUnknownProtoFields = false;
  activeSpec.updatedAt = Date.now();
  activeSpec.protoPatchRules = {
    wrapperChain: Array.isArray(blueprint.wrapperChain) ? blueprint.wrapperChain.slice(0, 6).map(String) : [],
    topLevelKeys: topKeys,
    innerMeta: {
      mimetype,
      isAnimated: Boolean(sm.isAnimated),
      isLottie: Boolean(sm.isLottie),
      gifPlayback: Boolean(sm.gifPlayback),
      width: Number(sm.width) || 512,
      height: Number(sm.height) || 512,
      seconds: Number(sm.seconds) || undefined
    },
    unknownWireFields,
    unknownTags: unknownWireFields,
    customRiffChunks: customChunks,
    extraExifKeys,
    exifTemplate: sanitizeAnonymousExifTemplate(mi.exifJson, extraExifKeys),
    hasDirectAudioEmbed: customChunks.length > 0 || isMuxedContainer || hasUnknownProto
  };

  if (hasUnknownProto) {
    activeSpec.mode = 'wire_exact_proto_patch';
    activeSpec.deliveryRoute = 'jalur_b_wire_patch';
    activeSpec.hasAudioSignature = true;
    activeSpec.canEncodeCleanly = true;
    activeSpec.reason = `Blueprint Stiker Audio terkalibrasi (Jalur B: ${unknownWireFields.map((t) => `#${t.field}`).join(', ')}, HKDF: ${hkdfMediaType}).`;
  } else if (detectedMsgType === 'stickerMessage' && isMuxedContainer) {
    activeSpec.mode = 'sticker_muxed_container';
    activeSpec.deliveryRoute = 'jalur_a_muxed_sticker';
    activeSpec.hasAudioSignature = true;
    activeSpec.canEncodeCleanly = true;
    activeSpec.reason = `Blueprint Stiker Audio terkalibrasi (Jalur A: stickerMessage bermedia ${detectedContainer.toUpperCase()}, HKDF: ${hkdfMediaType}).`;
  } else if (isCleanWebpCustom) {
    activeSpec.mode = 'verified_webp_chunk_clone';
    activeSpec.deliveryRoute = 'jalur_a_webp_chunk';
    activeSpec.hasAudioSignature = true;
    activeSpec.canEncodeCleanly = true;
    activeSpec.reason = 'Blueprint Stiker Audio terkalibrasi (Jalur A: WebP chunk/EXIF audio terverifikasi).';
  } else if (isAltMessageCarrier) {
    activeSpec.mode = 'alt_message_type_clone';
    activeSpec.deliveryRoute = 'jalur_c_alt_message';
    activeSpec.hasAudioSignature = true;
    activeSpec.canEncodeCleanly = true;
    activeSpec.reason = `Blueprint Stiker Audio terkalibrasi (Jalur C: ${detectedMsgType} via HKDF ${hkdfMediaType}).`;
  } else {
    activeSpec.mode = 'native_webp_clean';
    activeSpec.deliveryRoute = 'jalur_d_uncalibrated_webp';
    activeSpec.hasAudioSignature = false;
    activeSpec.canEncodeCleanly = false;
    activeSpec.reason = 'Contoh terdeteksi berformat WebP standar tanpa trek suara/unknown tag; menjaga pengiriman WebP bersih.';
  }

  activeBlueprintSnapshot = {
    version: activeSpec.version,
    capturedAt: Number(blueprint.capturedAt) || Date.now(),
    baileysVersion: String(blueprint.baileysVersion || BAILEYS_VERSION).slice(0, 24),
    source: typeof blueprint.source === 'string' ? blueprint.source.slice(0, 32) : 'captured',
    msgId: typeof blueprint.msgId === 'string' ? blueprint.msgId.slice(0, 64) : undefined,
    upsertType: typeof blueprint.upsertType === 'string' ? blueprint.upsertType.slice(0, 24) : 'notify',
    fromMe: blueprint.fromMe !== undefined ? Boolean(blueprint.fromMe) : undefined,
    stubType: blueprint.stubType !== undefined && blueprint.stubType !== null ? blueprint.stubType : null,
    wrapperChain: Array.isArray(blueprint.wrapperChain) ? blueprint.wrapperChain.slice(0, 8).map(String) : [],
    topLevelKeys: topKeys,
    innerKeys: Array.isArray(blueprint.innerKeys) ? blueprint.innerKeys.slice(0, 16).map(String) : [],
    messageType: detectedMsgType,
    hkdfMediaType,
    innerMeta: activeSpec.protoPatchRules.innerMeta,
    unknownWireFields,
    rawWireTree: Array.isArray(blueprint.rawWireTree) ? blueprint.rawWireTree.slice(0, 32) : [],
    opaqueInnerFields: Array.isArray(blueprint.opaqueInnerFields) ? blueprint.opaqueInnerFields.slice(0, 32) : [],
    rawWireBytesLength: Number(blueprint.rawWireBytesLength || blueprint.quotedWireBytes || 0) || undefined,
    decryptErrors: blueprint.decryptErrors && typeof blueprint.decryptErrors === 'object' ? blueprint.decryptErrors : undefined,
    quotedWireBytes: Number(blueprint.quotedWireBytes) || undefined,
    matchedCachedSticker: Boolean(blueprint.matchedCachedSticker),
    stanzaMeta: blueprint.stanzaMeta && typeof blueprint.stanzaMeta === 'object'
      ? {
          id: blueprint.stanzaMeta.id ? String(blueprint.stanzaMeta.id).slice(0, 64) : undefined,
          type: String(blueprint.stanzaMeta.type || '').slice(0, 32),
          mediatype: String(blueprint.stanzaMeta.mediatype || '').slice(0, 32),
          childTags: Array.isArray(blueprint.stanzaMeta.childTags) ? blueprint.stanzaMeta.childTags.slice(0, 12).map(String) : [],
          encAttrs: Array.isArray(blueprint.stanzaMeta.encAttrs) ? blueprint.stanzaMeta.encAttrs.slice(0, 8).map(String) : [],
          at: Number(blueprint.stanzaMeta.at) || undefined
        }
      : null,
    mediaInspection: {
      container: detectedContainer,
      detectedContainer,
      totalBytes: Number(mi.totalBytes) || 0,
      customChunks,
      extraExifKeys,
      trackCodecs: Array.isArray(mi.trackCodecs) ? mi.trackCodecs.slice(0, 12).map(String) : [],
      durationSec: Number.isFinite(Number(mi.durationSec)) ? Number(mi.durationSec) : undefined
    }
  };

  return getGlobalSoundStickerSpec();
}

function isCalibrated() {
  return Boolean(activeSpec.calibrated);
}

function getBlueprint() {
  return activeBlueprintSnapshot ? { ...activeBlueprintSnapshot } : null;
}

function getSummary() {
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
  validateStickerMediaPayload,
  isCalibrated,
  getBlueprint,
  getSummary
};
