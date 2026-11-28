const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const baileysModule = require('@whiskeysockets/baileys');
const { sessions } = require('../state/sessionStore');
const {
  verifyDeviceOwner,
  emitToDevice,
  joinExclusiveDeviceRoom,
  emitAuthSnapshotNow
} = require('../services/deviceAuthService');
const { getSessionDir, clearOwnSignalSessionFilesOnDisk } = require('../utils/authFiles');
const {
  BAILEYS_VERSION,
  getGlobalSoundStickerSpec,
  promoteVerifiedBlueprintToGlobalSpec,
  validateStickerMediaPayload,
  isCalibrated,
  getBlueprint,
  getSummary
} = require('../config/soundStickerSpec');
const {
  rememberSentMessage,
  getSentMessage,
  watchE2eeMessageId,
  softRestartBaileysPreserveAuth,
  pushCalibrationLog,
  pushDeliveryTrace,
  getEncodedProtoSize,
  syncCalibrationProtoObserver,
  registerCalibrationUpsertProcessor,
  registerKlonCommandProcessor,
  registerStickerDumpProcessor,
  isOwnerSelfMessage
} = require('./whatsappSessionHandler');
const {
  inspectProtobufWire,
  verifyWireBytesStrict,
  diffUnknownWireFields,
  extractOpaqueInnerMessageTree,
  installAudioStickerProtoExtension,
  getRecentRawWireFrames,
  getRecentRawWireBytesSnapshots,
  appendWireFieldsToEncodedMessage,
  withScopedPatchedMessageEncode,
  unwrapMessageContent,
  extractTextAndQuoted
} = require('../utils/protoWireInspector');
const { ensureValidOggOpusBuffer } = require('../utils/oggOpusEncoder');

const {
  proto,
  generateWAMessage,
  generateWAMessageFromContent,
  generateMessageIDV2,
  prepareWAMessageMedia,
  downloadMediaMessage,
  downloadContentFromMessage,
  jidNormalizedUser: baileysJidNorm
} = baileysModule;

installAudioStickerProtoExtension(proto);

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
const SELF_E2EE_TEST_WATCH_MS = 5000;

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
  } else if (expectedKind === 'audio') {
    const isMp4 = buf.length >= 12 && buf.toString('ascii', 4, 8) === 'ftyp';
    const isOgg = buf.length >= 4 && buf.toString('ascii', 0, 4) === 'OggS';
    const isWebm = buf.length >= 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3;
    const isWav = buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WAVE';
    const isMp3 = buf.length >= 3 && (buf.toString('ascii', 0, 3) === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0));
    if (!isMp4 && !isOgg && !isWebm && !isWav && !isMp3) {
      throw new Error(`Format audio ${label} tidak dikenali.`);
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
  let durationSec = null;
  let resolution = null;

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

      if (box === 'mvhd' && off + 28 <= off + sz) {
        const version = buf[off + 8];
        if (version === 0 && off + 28 <= buf.length) {
          const timescale = buf.readUInt32BE(off + 20);
          const duration = buf.readUInt32BE(off + 24);
          if (timescale > 0 && duration > 0) {
            durationSec = Number((duration / timescale).toFixed(2));
          }
        } else if (version === 1 && off + 36 <= buf.length) {
          const timescale = buf.readUInt32BE(off + 28);
          const duration = Number(buf.readBigUInt64BE(off + 32));
          if (timescale > 0 && duration > 0) {
            durationSec = Number((duration / timescale).toFixed(2));
          }
        }
      } else if (box === 'tkhd' && off + 92 <= off + sz) {
        const version = buf[off + 8];
        const dimOff = version === 1 ? off + 96 : off + 84;
        if (dimOff + 8 <= buf.length) {
          const w = Math.round(buf.readUInt32BE(dimOff) / 65536);
          const h = Math.round(buf.readUInt32BE(dimOff + 4) / 65536);
          if (w > 0 && h > 0) {
            resolution = `${w}x${h}`;
          }
        }
      } else if (box === 'stsd' && off + 16 < off + sz) {
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
  return { topLevelAtoms, trackCodecs: Array.from(codecs), durationSec, resolution };
}

const AUDIO_BINARY_SIGNATURES = [
  { label: 'OggS', needle: Buffer.from('OggS', 'ascii'), startAt: 0 },
  { label: 'OpusHead', needle: Buffer.from('OpusHead', 'ascii'), startAt: 0 },
  { label: 'OpusTags', needle: Buffer.from('OpusTags', 'ascii'), startAt: 0 },
  { label: 'ftyp', needle: Buffer.from('ftyp', 'ascii'), startAt: 0 },
  { label: 'moov', needle: Buffer.from('moov', 'ascii'), startAt: 0 },
  { label: 'ID3', needle: Buffer.from('ID3', 'ascii'), startAt: 0 },
  { label: 'WAVE', needle: Buffer.from('WAVE', 'ascii'), startAt: 0 },
  { label: 'fLaC', needle: Buffer.from('fLaC', 'ascii'), startAt: 0 },
  { label: 'AUDI', needle: Buffer.from('AUDI', 'ascii'), startAt: 0 },
  { label: 'SOUN', needle: Buffer.from('SOUN', 'ascii'), startAt: 0 },
  { label: 'MP3', needle: Buffer.from('MP3', 'ascii'), startAt: 0 },
  { label: 'audio', needle: Buffer.from('audio', 'ascii'), startAt: 0 },
  { label: 'sound', needle: Buffer.from('sound', 'ascii'), startAt: 0 },
  { label: 'MP3_SYNC(fffb)', needle: Buffer.from([0xff, 0xfb]), startAt: 0 },
  { label: 'ADTS_AAC(fff1)', needle: Buffer.from([0xff, 0xf1]), startAt: 0 },
  { label: 'AMR(#!)', needle: Buffer.from('#!', 'ascii'), startAt: 0 },
  { label: 'RIFF_2ND', needle: Buffer.from('RIFF', 'ascii'), startAt: 1 }
];

function toPrintableAscii(buf, maxLen = 64) {
  if (!buf || buf.length === 0) return '';
  const slice = buf.subarray(0, Math.min(maxLen, buf.length));
  return Array.from(slice, (b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.')).join('');
}

function resolveChunkOwnerAtOffset(offset, chunkRanges = [], riffEndOffset = 0) {
  if (offset < 12) return 'header';
  for (const r of chunkRanges) {
    if (offset >= r.start && offset < r.end) return r.fourcc;
  }
  if (riffEndOffset > 0 && offset >= riffEndOffset) return 'trailing';
  return 'unknown';
}

function scanAudioSignatures(buf, chunkRanges = null, riffEndOffset = null) {
  if (!Buffer.isBuffer(buf) || buf.length === 0) return [];

  let resolvedRanges = Array.isArray(chunkRanges) ? chunkRanges : null;
  let resolvedRiffEnd = Number.isFinite(riffEndOffset) ? riffEndOffset : null;

  if (!resolvedRanges && buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF') {
    resolvedRiffEnd = 8 + buf.readUInt32LE(4);
    resolvedRanges = [];
    let off = 12;
    const limit = Math.min(buf.length, resolvedRiffEnd);
    while (off + 8 <= limit) {
      const fcc = buf.toString('ascii', off, off + 4);
      const sz = buf.readUInt32LE(off + 4);
      const end = Math.min(buf.length, off + 8 + sz + (sz % 2));
      resolvedRanges.push({ fourcc: fcc, start: off, end });
      off = off + 8 + sz + (sz % 2);
    }
  }

  const hits = [];
  const seen = new Set();
  for (const spec of AUDIO_BINARY_SIGNATURES) {
    let idx = buf.indexOf(spec.needle, spec.startAt || 0);
    while (idx !== -1) {
      const owner = resolveChunkOwnerAtOffset(idx, resolvedRanges || [], resolvedRiffEnd || buf.length);
      const dedupKey = `${spec.label}:${owner}`;
      if (!seen.has(dedupKey)) {
        seen.add(dedupKey);
        hits.push({ sig: spec.label, offset: idx, chunkOwner: owner });
        if (hits.length >= 10) return hits;
      }
      idx = buf.indexOf(spec.needle, idx + spec.needle.length);
    }
  }
  return hits;
}

function parseAnmfSubChunks(buf, range) {
  if (!range || range.dataEnd - range.dataStart <= 16) return [];
  const subList = [];
  let off = range.dataStart + 16;
  while (off + 8 <= range.dataEnd && subList.length < 24) {
    const fcc = buf.toString('ascii', off, off + 4);
    const sz = buf.readUInt32LE(off + 4);
    const next = off + 8 + sz + (sz % 2);
    subList.push({
      fourcc: fcc,
      size: sz,
      isForeign: !['VP8 ', 'VP8L', 'ALPH'].includes(fcc)
    });
    if (next <= off) break;
    off = next;
  }
  return subList;
}

function inspectWebpBinaryForensics(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') {
    return null;
  }

  const totalFileBytes = buf.length;
  const riffDeclaredSize = buf.readUInt32LE(4);
  const riffEndOffset = 8 + riffDeclaredSize;
  const trailingBytesCount = Math.max(0, totalFileBytes - riffEndOffset);
  const trailingSlice = trailingBytesCount > 0 ? buf.subarray(riffEndOffset, Math.min(totalFileBytes, riffEndOffset + 64)) : null;
  const trailingHeadHex = trailingSlice ? trailingSlice.toString('hex') : '';
  const trailingHeadAscii = trailingSlice ? toPrintableAscii(trailingSlice, 64) : '';

  const chunkRanges = [];
  const nonAnmfChunks = [];
  const customChunks = [];
  const chunksBeforeAnmf = [];
  const chunksAfterAnmf = [];
  let seenAnmf = false;
  let anmfCount = 0;
  let anmfTotalBytes = 0;
  let firstAnmfRange = null;
  let lastAnmfRange = null;

  let vp8xDetails = null;
  let vp8xFlags = null;
  let exifJson = null;
  let fullExifString = '';
  let extraExifKeys = [];
  let xmpText = '';

  let off = 12;
  const limit = Math.min(totalFileBytes, riffEndOffset);
  while (off + 8 <= limit) {
    const fcc = buf.toString('ascii', off, off + 4);
    const sz = buf.readUInt32LE(off + 4);
    const dataStart = off + 8;
    const dataEnd = Math.min(limit, dataStart + sz);
    const chunkEnd = Math.min(limit, dataStart + sz + (sz % 2));
    chunkRanges.push({ fourcc: fcc, start: off, end: chunkEnd });

    if (fcc === 'ANMF') {
      seenAnmf = true;
      anmfCount++;
      anmfTotalBytes += sz;
      const r = { dataStart, dataEnd };
      if (!firstAnmfRange) firstAnmfRange = r;
      lastAnmfRange = r;
    } else {
      const label = `${fcc}@${off}:${sz}`;
      if (!seenAnmf) chunksBeforeAnmf.push(label);
      else chunksAfterAnmf.push(label);

      const headSlice = buf.subarray(dataStart, Math.min(dataEnd, dataStart + 32));
      nonAnmfChunks.push({
        fourcc: fcc,
        offset: off,
        size: sz,
        headHex: headSlice.toString('hex'),
        headAscii: toPrintableAscii(headSlice, 32)
      });

      if (!STANDARD_WEBP_CHUNKS.has(fcc)) {
        customChunks.push({
          fourCC: fcc,
          offset: off,
          size: sz,
          headHex: headSlice.toString('hex'),
          headAscii: toPrintableAscii(headSlice, 32)
        });
      }

      if (fcc === 'VP8X' && dataEnd - dataStart >= 10) {
        const flagsByte = buf[dataStart];
        vp8xFlags = flagsByte;
        vp8xDetails = {
          flagsByte,
          flagsBinary: flagsByte.toString(2).padStart(8, '0'),
          flags: {
            bit0_reserved: (flagsByte & 0x01) !== 0,
            anim: (flagsByte & 0x02) !== 0,
            xmp: (flagsByte & 0x04) !== 0,
            exif: (flagsByte & 0x08) !== 0,
            alpha: (flagsByte & 0x10) !== 0,
            icc: (flagsByte & 0x20) !== 0,
            bit6_reserved: (flagsByte & 0x40) !== 0,
            bit7_reserved: (flagsByte & 0x80) !== 0
          },
          canvasWidth: (buf[dataStart + 4] | (buf[dataStart + 5] << 8) | (buf[dataStart + 6] << 16)) + 1,
          canvasHeight: (buf[dataStart + 7] | (buf[dataStart + 8] << 8) | (buf[dataStart + 9] << 16)) + 1
        };
      } else if (fcc === 'EXIF') {
        const exifBuf = buf.subarray(dataStart, dataEnd);
        const parsed = extractExifJsonFromChunk(exifBuf);
        if (parsed) {
          exifJson = parsed;
          extraExifKeys = Object.keys(parsed).filter((k) => !STANDARD_WA_EXIF_KEYS.has(k));
          fullExifString = JSON.stringify(parsed).slice(0, 2000);
        } else {
          fullExifString = toPrintableAscii(exifBuf, 2000);
        }
      } else if (fcc === 'XMP ') {
        xmpText = buf.subarray(dataStart, Math.min(dataEnd, dataStart + 2000)).toString('utf8');
      }
    }

    off = dataStart + sz + (sz % 2);
  }

  const chunksSummary = [
    ...chunksBeforeAnmf,
    ...(anmfCount > 0 ? [`ANMF x ${anmfCount} (total ${anmfTotalBytes} B)`] : []),
    ...chunksAfterAnmf
  ];

  const anmfSubChunks = {
    first: parseAnmfSubChunks(buf, firstAnmfRange),
    last: lastAnmfRange && lastAnmfRange !== firstAnmfRange ? parseAnmfSubChunks(buf, lastAnmfRange) : []
  };
  const audioSignatures = scanAudioSignatures(buf, chunkRanges, riffEndOffset);

  return {
    totalFileBytes,
    riffDeclaredSize,
    riffEndOffset,
    trailingBytesCount,
    trailingHeadHex,
    trailingHeadAscii,
    vp8xFlags,
    vp8xDetails,
    nonAnmfChunks,
    customChunks,
    anmfCount,
    anmfTotalBytes,
    anmfSubChunks,
    exifJson,
    fullExifString,
    extraExifKeys,
    xmpText,
    audioSignatures,
    chunksSummary
  };
}

function inspectMediaBufferMetadata(buf) {
  if (!buf || buf.length === 0) {
    return { magicHex: '', magicAscii: '', totalBytes: 0, detectedContainer: 'unknown', container: 'unknown', chunks: [] };
  }

  const head = buf.subarray(0, Math.min(64, buf.length));
  const magicHex = head.toString('hex');
  const magicAscii = toPrintableAscii(head, 64);

  const webpForensics = inspectWebpBinaryForensics(buf);
  if (webpForensics) {
    return {
      magicHex,
      magicAscii,
      totalBytes: buf.length,
      container: 'webp',
      detectedContainer: 'webp',
      vp8xFlags: webpForensics.vp8xFlags,
      chunks: webpForensics.chunksSummary,
      customChunks: webpForensics.customChunks,
      exifJson: webpForensics.exifJson,
      extraExifKeys: webpForensics.extraExifKeys,
      webpForensics
    };
  }

  if (buf.length >= 12 && buf.toString('ascii', 4, 8) === 'ftyp') {
    const { topLevelAtoms, trackCodecs, durationSec, resolution } = inspectMp4Boxes(buf);
    return {
      magicHex,
      magicAscii,
      totalBytes: buf.length,
      container: 'mp4',
      detectedContainer: 'mp4',
      chunks: topLevelAtoms,
      trackCodecs,
      durationSec,
      resolution
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
      container: 'webm',
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
      container: 'ogg',
      detectedContainer: 'ogg',
      chunks: [sampleAscii.includes('OpusHead') ? 'OpusHead' : 'OggStream']
    };
  }

  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) {
    return {
      magicHex,
      magicAscii,
      totalBytes: buf.length,
      container: 'zip',
      detectedContainer: 'zip',
      chunks: ['PKZIP']
    };
  }

  return { magicHex, magicAscii, totalBytes: buf.length, container: 'unknown', detectedContainer: 'unknown', chunks: [] };
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
  return diffUnknownWireFields(rawWireTree);
}

function isInterestingSoundBlueprint(topLevelKeys, wrapperChain, innerMeta, mediaInspection, rawWireTree) {
  const mime = String(innerMeta?.mimetype || '').toLowerCase();
  if (mime && mime !== 'image/webp') return true;
  if (topLevelKeys.some((k) => k !== 'stickerMessage' && k !== 'messageContextInfo')) return true;
  if (wrapperChain.some((w) => w !== 'deviceSentMessage')) return true;
  if (Array.isArray(mediaInspection?.customChunks) && mediaInspection.customChunks.length > 0) return true;
  if (Array.isArray(mediaInspection?.extraExifKeys) && mediaInspection.extraExifKeys.length > 0) return true;
  const cont = mediaInspection?.detectedContainer || mediaInspection?.container;
  if (cont && cont !== 'webp') return true;
  if (collectUnknownStickerTags(rawWireTree).length > 0) return true;
  return false;
}

function sanitizeBlueprint(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const sm = (raw.innerMeta || raw.stickerMeta || {}) && typeof (raw.innerMeta || raw.stickerMeta) === 'object'
    ? (raw.innerMeta || raw.stickerMeta)
    : {};
  const mi = raw.mediaInspection && typeof raw.mediaInspection === 'object' ? raw.mediaInspection : {};
  const topKeys = Array.isArray(raw.topLevelKeys) ? raw.topLevelKeys.slice(0, 16).map(String) : [];
  const messageType = typeof raw.messageType === 'string'
    ? raw.messageType.slice(0, 48)
    : (topKeys.find((k) => k !== 'messageContextInfo') || 'stickerMessage');
  const unknownList = Array.isArray(raw.unknownWireFields)
    ? raw.unknownWireFields.slice(0, 16)
    : (Array.isArray(raw.unknownWireTags) ? raw.unknownWireTags.slice(0, 16) : []);
  const hkdfKey = typeof raw.hkdfMediaType === 'string'
    ? raw.hkdfMediaType.slice(0, 24)
    : (typeof raw.decryptedByMediaType === 'string' ? raw.decryptedByMediaType.slice(0, 24) : null);

  const normalizedMeta = {
    ...Object.fromEntries(
      Object.entries(sm).filter(
        ([k, v]) =>
          v !== null &&
          v !== undefined &&
          !['url', 'directPath', 'mediaKey', 'fileSha256', 'fileEncSha256'].includes(k) &&
          typeof v !== 'object'
      )
    ),
    mimetype: typeof sm.mimetype === 'string' ? sm.mimetype.slice(0, 64) : 'image/webp',
    isAnimated: Boolean(sm.isAnimated),
    isLottie: Boolean(sm.isLottie),
    isAvatar: Boolean(sm.isAvatar),
    isAiSticker: Boolean(sm.isAiSticker),
    gifPlayback: Boolean(sm.gifPlayback),
    seconds: Number.isFinite(Number(sm.seconds)) ? Number(sm.seconds) : undefined,
    width: Number(sm.width) || 512,
    height: Number(sm.height) || 512,
    accessibilityLabel: typeof sm.accessibilityLabel === 'string' ? sm.accessibilityLabel.slice(0, 240) : undefined
  };

  return {
    capturedAt: Number(raw.capturedAt) || Date.now(),
    baileysVersion: typeof raw.baileysVersion === 'string' ? raw.baileysVersion.slice(0, 24) : BAILEYS_VERSION,
    source: typeof raw.source === 'string' ? raw.source.slice(0, 32) : undefined,
    msgId: typeof raw.msgId === 'string' ? raw.msgId.slice(0, 64) : undefined,
    upsertType: typeof raw.upsertType === 'string' ? raw.upsertType.slice(0, 24) : undefined,
    fromMe: raw.fromMe !== undefined ? Boolean(raw.fromMe) : undefined,
    remoteJid: typeof raw.remoteJid === 'string' ? raw.remoteJid.slice(0, 64) : undefined,
    stubType: raw.stubType !== undefined && raw.stubType !== null ? raw.stubType : null,
    stanzaMeta: raw.stanzaMeta && typeof raw.stanzaMeta === 'object'
      ? {
          id: raw.stanzaMeta.id ? String(raw.stanzaMeta.id).slice(0, 64) : undefined,
          type: String(raw.stanzaMeta.type || '').slice(0, 32),
          mediatype: String(raw.stanzaMeta.mediatype || '').slice(0, 32),
          childTags: Array.isArray(raw.stanzaMeta.childTags) ? raw.stanzaMeta.childTags.slice(0, 12).map(String) : [],
          encAttrs: Array.isArray(raw.stanzaMeta.encAttrs) ? raw.stanzaMeta.encAttrs.slice(0, 8).map(String) : [],
          at: Number(raw.stanzaMeta.at) || undefined
        }
      : null,
    innerKeys: Array.isArray(raw.innerKeys) ? raw.innerKeys.slice(0, 16).map(String) : [],
    matchedCachedSticker: Boolean(raw.matchedCachedSticker),
    decryptErrors: raw.decryptErrors && typeof raw.decryptErrors === 'object' ? raw.decryptErrors : undefined,
    topLevelKeys: topKeys,
    wrapperChain: Array.isArray(raw.wrapperChain) ? raw.wrapperChain.slice(0, 8).map(String) : [],
    messageType,
    hkdfMediaType: hkdfKey,
    decryptedByMediaType: hkdfKey,
    unknownWireFields: unknownList,
    unknownWireTags: unknownList,
    rawWireTree: Array.isArray(raw.rawWireTree) ? raw.rawWireTree.slice(0, 32) : [],
    opaqueInnerFields: Array.isArray(raw.opaqueInnerFields) ? raw.opaqueInnerFields.slice(0, 32) : [],
    rawWireBytesLength: Number(raw.rawWireBytesLength || raw.quotedWireBytes || 0) || undefined,
    innerMeta: normalizedMeta,
    stickerMeta: normalizedMeta,
    mediaInspection: {
      container: typeof (mi.container || mi.detectedContainer) === 'string' ? String(mi.container || mi.detectedContainer).slice(0, 24) : 'webp',
      detectedContainer: typeof (mi.detectedContainer || mi.container) === 'string' ? String(mi.detectedContainer || mi.container).slice(0, 24) : 'webp',
      magicHex: typeof mi.magicHex === 'string' ? mi.magicHex.slice(0, 128) : undefined,
      magicAscii: typeof mi.magicAscii === 'string' ? mi.magicAscii.slice(0, 64) : undefined,
      totalBytes: Number(mi.totalBytes) || 0,
      vp8xFlags: Number.isFinite(Number(mi.vp8xFlags)) ? Number(mi.vp8xFlags) : undefined,
      chunks: Array.isArray(mi.chunks) ? mi.chunks.map(String) : [],
      customChunks: Array.isArray(mi.customChunks) ? mi.customChunks : [],
      extraExifKeys: Array.isArray(mi.extraExifKeys) ? mi.extraExifKeys.slice(0, 24).map(String) : [],
      exifJson: mi.exifJson && typeof mi.exifJson === 'object' ? mi.exifJson : null,
      webpForensics: mi.webpForensics && typeof mi.webpForensics === 'object' ? mi.webpForensics : undefined,
      trackCodecs: Array.isArray(mi.trackCodecs) ? mi.trackCodecs.slice(0, 12).map(String) : [],
      durationSec: Number.isFinite(Number(mi.durationSec)) ? Number(mi.durationSec) : undefined,
      resolution: typeof mi.resolution === 'string' ? mi.resolution.slice(0, 24) : undefined
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
function scanDynamicMediaNode(innerMessage) {
  if (!innerMessage || typeof innerMessage !== 'object') return null;
  for (const [k, val] of Object.entries(innerMessage)) {
    if (k === 'messageContextInfo' || !val || typeof val !== 'object') continue;
    if (val.mediaKey || val.directPath || val.url || val.fileSha256) {
      return { fieldName: k, node: val };
    }
  }
  return null;
}

async function inspectMediaCandidateInRam({ curSession, keyObj, innerMessage, mediaTarget, stickerNode }) {
  let mediaInspection = null;
  let decryptedByMediaType = null;
  const decryptErrors = {};
  if (!mediaTarget) {
    return { mediaInspection, decryptedByMediaType, decryptErrors };
  }

  let dlBuf = null;
  try {
    const naturalKind = stickerNode
      ? 'sticker'
      : innerMessage?.videoMessage || innerMessage?.ptvMessage
        ? 'video'
        : innerMessage?.audioMessage
          ? 'audio'
          : innerMessage?.imageMessage
            ? 'image'
            : 'document';

    if (typeof downloadContentFromMessage === 'function') {
      const candidates = Array.from(new Set([naturalKind, 'sticker', 'video', 'audio', 'document', 'image']));
      for (const kind of candidates) {
        try {
          const stream = await downloadContentFromMessage(mediaTarget, kind);
          const chunks = [];
          let size = 0;
          for await (const chunk of stream) {
            if (size < 1024 * 1024) chunks.push(chunk);
            size += chunk.length;
          }
          const candidateBuf = Buffer.concat(chunks);
          if (candidateBuf && candidateBuf.length > 0) {
            dlBuf = candidateBuf;
            decryptedByMediaType = kind;
            break;
          }
          decryptErrors[kind] = 'buffer kosong';
        } catch (kindErr) {
          decryptErrors[kind] = kindErr?.message || 'gagal dekripsi';
        }
      }
    }

    if (
      (!dlBuf || dlBuf.length === 0) &&
      typeof downloadMediaMessage === 'function' &&
      keyObj &&
      (stickerNode || innerMessage?.videoMessage || innerMessage?.audioMessage || innerMessage?.documentMessage || innerMessage?.ptvMessage || innerMessage?.imageMessage)
    ) {
      try {
        dlBuf = await downloadMediaMessage(
          { key: keyObj, message: innerMessage },
          'buffer',
          {},
          { reuploadRequest: curSession?.sock?.updateMediaMessage }
        );
        if (dlBuf && dlBuf.length > 0) decryptedByMediaType = naturalKind;
      } catch (dlMsgErr) {
        decryptErrors.downloadMediaMessage = dlMsgErr?.message || 'gagal downloadMediaMessage';
      }
    }

    if (dlBuf && dlBuf.length > 0) {
      mediaInspection = inspectMediaBufferMetadata(dlBuf);
    }
  } catch (dlErr) {
    decryptErrors.fatal = dlErr?.message || 'error inspeksi media';
  } finally {
    dlBuf = null;
  }

  return { mediaInspection, decryptedByMediaType, decryptErrors };
}

async function processCalibrationUpsert(io, sessionId, session, { messages, type }) {
  try {
    const curSession = sessions.get(sessionId) || session;
    if (!curSession || !Array.isArray(messages) || messages.length === 0) return;

    const isArmed = Boolean(
      curSession.calibratingSoundSticker &&
        (!curSession.calibrationArmedUntil || Date.now() <= curSession.calibrationArmedUntil)
    );
    if (curSession.calibratingSoundSticker && !isArmed) {
      curSession.calibratingSoundSticker = false;
      syncCalibrationProtoObserver();
    }
    if (!isArmed) return;

    const selfPnNum = curSession.sock?.user?.id
      ? String(curSession.sock.user.id).split('@')[0].split(':')[0].replace(/\D/g, '')
      : '';
    const selfLidNum = curSession.sock?.user?.lid
      ? String(curSession.sock.user.lid).split('@')[0].split(':')[0].replace(/\D/g, '')
      : '';

    for (const msg of messages) {
      if (!msg?.key) continue;

      const remoteRaw = String(msg.key.remoteJid || '');
      const remoteAlt = String(msg.key.remoteJidAlt || '');
      const participantRaw = String(msg.key.participant || '');

      // Tolak status WA, grup, dan channel sebelum inspeksi apa pun
      if (
        remoteRaw === 'status@broadcast' ||
        remoteRaw.endsWith('@g.us') ||
        remoteRaw.endsWith('@newsletter')
      ) {
        continue;
      }

      // Abaikan stiker/teks keluar yang berasal dari sesi web ini sendiri
      if (msg.key.id && getSentMessage(curSession, msg.key.id)) {
        continue;
      }

      const topKeys = Object.keys(msg.message || {});
      const { innerMessage, wrapperChain } = unwrapMessageContent(msg.message);
      const innerKeys = Object.keys(innerMessage || {});
      const nonContextKeys = innerKeys.filter((k) => k !== 'messageContextInfo');

      const matchesSelf = Boolean(
        msg.key.fromMe === true ||
          (selfPnNum && (remoteRaw.includes(selfPnNum) || remoteAlt.includes(selfPnNum) || participantRaw.includes(selfPnNum))) ||
          (selfLidNum && (remoteRaw.includes(selfLidNum) || remoteAlt.includes(selfLidNum) || participantRaw.includes(selfLidNum)))
      );
      const isPrivateSticker = Boolean(
        innerMessage?.stickerMessage ||
          innerMessage?.lottieStickerMessage ||
          innerKeys.some((k) => k.toLowerCase().includes('sticker'))
      );

      if (!matchesSelf && !isPrivateSticker) {
        continue;
      }

      const stubLabel = msg.messageStubType
        ? `${msg.messageStubType}${msg.messageStubParameters?.length ? `(${msg.messageStubParameters.join(',')})` : ''}`
        : '-';
      const displayKeys = innerKeys.length > 0 ? innerKeys : (msg.messageStubType ? [`stub:${stubLabel}`] : ['empty-message']);

      pushCalibrationLog(io, sessionId, curSession, {
        upsertType: `SELF-UPSERT:${type || 'notify'}`,
        remoteJid: remoteRaw || participantRaw,
        fromMe: Boolean(msg.key.fromMe),
        wrapperChain,
        keys: displayKeys,
        stubType: msg.messageStubType || null,
        detail: `id=${msg.key.id || '-'} fromMe=${Boolean(msg.key.fromMe)} jid=${remoteRaw || participantRaw || '-'} stub=${stubLabel} topKeys=[${topKeys.join(',')}] innerKeys=[${innerKeys.join(',')}]`
      });

      const dynamicMedia = scanDynamicMediaNode(innerMessage);
      const stickerNode =
        innerMessage?.stickerMessage ||
        innerMessage?.lottieStickerMessage?.message?.stickerMessage ||
        null;
      const ptvOrMedia =
        innerMessage?.ptvMessage ||
        innerMessage?.videoMessage ||
        innerMessage?.audioMessage ||
        innerMessage?.documentMessage ||
        dynamicMedia?.node ||
        null;
      const mediaTarget = stickerNode || ptvOrMedia;

      const isTextOnly =
        nonContextKeys.length > 0 &&
        nonContextKeys.every((k) => k === 'conversation' || k === 'extendedTextMessage');
      const isProtocolNoise =
        !mediaTarget &&
        !msg.messageStubType &&
        nonContextKeys.length > 0 &&
        nonContextKeys.every((k) => k === 'senderKeyDistributionMessage' || k === 'protocolMessage' || k === 'reactionMessage');

      if ((isTextOnly || isProtocolNoise) && !stickerNode) {
        continue;
      }

      // Tolak pesan stub E2EE (misal stub: 2 / No session) agar tidak pernah jadi blueprint kosong
      if (msg.messageStubType !== null && msg.messageStubType !== undefined) {
        continue;
      }

      const now = Date.now();
      const recentStanzas = Array.isArray(curSession.recentSelfStanzas) ? curSession.recentSelfStanzas : [];
      const fallbackStanzas = Array.isArray(curSession.lastCbMessageMeta) ? curSession.lastCbMessageMeta : [];
      const matchedStanza =
        recentStanzas.find((s) => msg.key.id && s.id === msg.key.id) ||
        [...recentStanzas].reverse().find((s) => now - (s.at || 0) <= 15000) ||
        [...fallbackStanzas].reverse().find((s) => now - (s.at || 0) <= 15000) ||
        null;

      let encodedBytesLen = 0;
      let encodedProtoWireTree = [];
      try {
        if (proto?.Message?.encode && (msg.message || innerMessage)) {
          const bytes = proto.Message.encode(msg.message || innerMessage).finish();
          encodedBytesLen = bytes.length;
          encodedProtoWireTree = inspectProtobufWire(bytes, 8);
        }
      } catch (_) {}

      const globalFrames = getRecentRawWireFrames();
      const sessionFrames = Array.isArray(curSession.lastRawWirePackets) ? curSession.lastRawWirePackets : [];
      const candidateFrames = [...sessionFrames, ...globalFrames].filter(
        (f) => f && Array.isArray(f.wireTree) && f.wireTree.length > 0 && now - (f.capturedAt || f.at || 0) <= 5000
      );
      const meaningfulKeys = Array.from(
        new Set([...topKeys, ...innerKeys].filter((k) => k && k !== 'messageContextInfo'))
      );
      const reversedFrames = [...candidateFrames].reverse();
      const matchedWirePacket =
        (meaningfulKeys.length > 0
          ? reversedFrames.find((f) => meaningfulKeys.some((mk) => Array.isArray(f.decodedKeys) && f.decodedKeys.includes(mk)))
          : null) ||
        (encodedBytesLen > 0
          ? [...candidateFrames].sort((a, b) => Math.abs((a.byteLength || 0) - encodedBytesLen) - Math.abs((b.byteLength || 0) - encodedBytesLen))[0]
          : reversedFrames[0]) ||
        null;

      const rawWireTree = matchedWirePacket?.wireTree?.length ? matchedWirePacket.wireTree : encodedProtoWireTree;
      const opaqueInnerFields = extractOpaqueInnerMessageTree(rawWireTree);
      const unknownWireFields = diffUnknownWireFields(rawWireTree);

      const hasOpaqueOrUnknownProto = Boolean(
        nonContextKeys.length === 0 && (msg.message || (matchedWirePacket && matchedWirePacket.wireTree?.length))
      );

      const shouldCaptureBlueprint = Boolean(
        mediaTarget ||
          stickerNode ||
          msg.message?.deviceSentMessage ||
          unknownWireFields.length > 0 ||
          hasOpaqueOrUnknownProto ||
          (matchedStanza && matchedStanza.mediatype === 'sticker')
      );

      if (!shouldCaptureBlueprint) {
        continue;
      }

      const rawBytesTotal = Number(matchedWirePacket?.byteLength || encodedBytesLen || 0);
      if (rawBytesTotal === 0 && opaqueInnerFields.length === 0 && !mediaTarget) {
        continue;
      }

      const { mediaInspection, decryptedByMediaType, decryptErrors } = await inspectMediaCandidateInRam({
        curSession,
        keyObj: msg.key,
        innerMessage,
        mediaTarget,
        stickerNode
      });

      const primaryMsgType =
        nonContextKeys[0] ||
        (unknownWireFields[0]?.field ? `unknownField#${unknownWireFields[0].field}` : null) ||
        (msg.messageStubType ? `stub:${msg.messageStubType}` : 'stickerMessage');
      const innerMeta = summarizeNonBufferFields(stickerNode || ptvOrMedia || innerMessage?.[primaryMsgType] || innerMessage || {});

      curSession.calibratingSoundSticker = false;
      curSession.calibrationArmedUntil = 0;
      if (curSession._calibrationExpireTimer) {
        clearTimeout(curSession._calibrationExpireTimer);
        curSession._calibrationExpireTimer = null;
      }
      syncCalibrationProtoObserver();

      const rawBlueprint = {
        capturedAt: Date.now(),
        baileysVersion: BAILEYS_VERSION,
        source: 'armed-capture',
        msgId: msg.key.id || null,
        upsertType: type || 'notify',
        fromMe: Boolean(msg.key.fromMe),
        remoteJid: remoteRaw || participantRaw || null,
        stubType: msg.messageStubType || null,
        stanzaMeta: matchedStanza
          ? {
              id: matchedStanza.id || null,
              type: matchedStanza.type || '',
              mediatype: matchedStanza.mediatype || '',
              childTags: Array.isArray(matchedStanza.childTags) ? matchedStanza.childTags : [],
              encAttrs: Array.isArray(matchedStanza.encAttrs) ? matchedStanza.encAttrs : [],
              at: matchedStanza.at || Date.now()
            }
          : null,
        wrapperChain,
        topLevelKeys: topKeys,
        innerKeys,
        messageType: primaryMsgType,
        hkdfMediaType: decryptedByMediaType,
        decryptedByMediaType,
        hasMessageContextInfo: Boolean(innerMessage?.messageContextInfo || msg.message?.messageContextInfo),
        innerMeta,
        stickerMeta: innerMeta,
        unknownWireFields,
        unknownWireTags: unknownWireFields,
        rawWireTree,
        opaqueInnerFields,
        rawWireBytesLength: rawBytesTotal,
        mediaInspection,
        decryptErrors,
        messageKeys: innerKeys,
        stickerFields: innerMeta,
        binarySummary: mediaInspection
      };

      const blueprint = sanitizeBlueprint(rawBlueprint) || rawBlueprint;
      const existingHasRich = Boolean(
        curSession.soundStickerBlueprint &&
          ((Array.isArray(curSession.soundStickerBlueprint.opaqueInnerFields) && curSession.soundStickerBlueprint.opaqueInnerFields.length > 0) ||
            curSession.soundStickerBlueprint.mediaInspection?.totalBytes > 0)
      );
      const incomingHasRich = Boolean(opaqueInnerFields.length > 0 || mediaInspection?.totalBytes > 0);
      if (!existingHasRich || incomingHasRich) {
        curSession.soundStickerBlueprint = blueprint;
      }
      const globalSpec = promoteVerifiedBlueprintToGlobalSpec(blueprint);

      pushCalibrationLog(io, sessionId, curSession, {
        upsertType: 'BLUEPRINT-CAPTURED',
        remoteJid: remoteRaw || participantRaw,
        fromMe: Boolean(msg.key.fromMe),
        wrapperChain: [primaryMsgType, mediaInspection?.detectedContainer || 'no-media'].filter(Boolean),
        keys: [
          `HKDF:${decryptedByMediaType || '-'}`,
          `mime:${innerMeta?.mimetype || '-'}`,
          `unknownTags:${unknownWireFields.length}`,
          ...(unknownWireFields.map((t) => `#${t.field}:${t.scope}`))
        ],
        detail: `type=${primaryMsgType} hkdf=${decryptedByMediaType || '-'} container=${mediaInspection?.detectedContainer || 'none'} unknownTags=${unknownWireFields.length}${Object.keys(decryptErrors).length ? ` decryptErrs=${Object.keys(decryptErrors).length}` : ''}`
      });

      emitToDevice(io, sessionId, 'sound-sticker-spec-sync', globalSpec);
      emitToDevice(io, sessionId, 'sound-sticker-blueprint-ready', { blueprint, globalSpec });
      emitToDevice(io, sessionId, 'sound-sticker-schema-detected', { ...blueprint, globalSpec });
      break;
    }
  } catch (err) {
    console.warn(`[BlueprintInspector ${sessionId}] Error:`, err.message);
  } finally {
    syncCalibrationProtoObserver();
  }
}

registerCalibrationUpsertProcessor(processCalibrationUpsert);

/**
 * Auto-Dump & Inspektor Stiker Audio (.klon / klon maupun stiker masuk langsung ke chat pribadi).
 */
async function inspectAndDumpSticker(io, sessionId, session, msg, opts = {}) {
  const {
    triggerReason = 'klon-command',
    upsertType = 'notify',
    contextInfo: preContextInfo = null,
    sendReplyToSelf = false
  } = opts || {};
  let activeSession = sessions.get(sessionId) || session;
  let selfJid = '';
  try {
    if (!activeSession || !msg?.key || !activeSession.sock?.user?.id) return null;
    if (!isOwnerSelfMessage(msg, activeSession.sock)) return null;
    if (msg.key.id && getSentMessage(activeSession, msg.key.id)) return null;

    if (!activeSession._dumpedStickerIds) activeSession._dumpedStickerIds = new Set();
    if (msg.key.id && activeSession._dumpedStickerIds.has(msg.key.id)) return null;
    if (msg.key.id) {
      activeSession._dumpedStickerIds.add(msg.key.id);
      if (activeSession._dumpedStickerIds.size > 40) {
        const firstId = activeSession._dumpedStickerIds.keys().next().value;
        if (firstId) activeSession._dumpedStickerIds.delete(firstId);
      }
    }

    selfJid = jidNormalizedUser(activeSession.sock.user.id);
    if (!selfJid || !selfJid.endsWith('@s.whatsapp.net')) return null;

    const extracted = extractTextAndQuoted(msg.message);
    const contextInfo = preContextInfo || extracted.contextInfo || null;
    const quotedRaw = contextInfo?.quotedMessage || null;
    const stanzaId = contextInfo?.stanzaId || null;
    const cachedSticker =
      (stanzaId || msg.key.id) && activeSession.recentOwnerStickers instanceof Map
        ? activeSession.recentOwnerStickers.get(stanzaId || msg.key.id) || null
        : null;

    const isKlonCmd =
      triggerReason === 'klon-command' ||
      extracted.normalizedText === '.klon' ||
      extracted.normalizedText.startsWith('.klon ') ||
      extracted.normalizedText.startsWith('.klon\n') ||
      extracted.normalizedText === 'klon' ||
      extracted.normalizedText.startsWith('klon ');

    // Target yang dibedah: quotedMessage bila ada (reply .klon), atau pesan langsung bila bukan reply
    const directMessage = msg.message || null;
    const targetRaw = quotedRaw || (isKlonCmd ? null : directMessage);

    if (!targetRaw && !cachedSticker) {
      if (isKlonCmd) {
        const guideText = '⚠️ .klon aktif! Silakan Balas (Reply) 1 stiker audio lalu ketik .klon.';
        console.log('[STICKER-DUMP]', JSON.stringify({ status: 'no-quoted-message', trigger: triggerReason, msgId: msg.key.id || null }));
        console.log('[KLON-RESULT]', JSON.stringify({ status: 'no-quoted-message', msgId: msg.key.id || null }));
        await sendOfficialSelfMessage(io, sessionId, activeSession, selfJid, { text: guideText }, '.klon missing-quote');
      }
      return null;
    }

    // Tolak pesan stub E2EE (misal stub: 2 / No session) pada jalur auto-dump
    if (msg.messageStubType !== null && msg.messageStubType !== undefined && !isKlonCmd) {
      return null;
    }

    const inspectedSource = targetRaw || {};
    const { innerMessage: tInner, wrapperChain } = unwrapMessageContent(inspectedSource);
    const topKeys = Object.keys(inspectedSource);
    const innerKeys = Object.keys(tInner || {});
    const nonContext = innerKeys.filter((k) => k !== 'messageContextInfo');
    const dynamicMedia = scanDynamicMediaNode(tInner);
    const stickerNode =
      tInner?.stickerMessage ||
      tInner?.lottieStickerMessage?.message?.stickerMessage ||
      null;
    const ptvOrMedia =
      tInner?.ptvMessage ||
      tInner?.videoMessage ||
      tInner?.audioMessage ||
      tInner?.documentMessage ||
      dynamicMedia?.node ||
      null;
    const mediaTarget = stickerNode || ptvOrMedia;

    let encodedBytes = 0;
    let encodedWireTree = [];
    try {
      if (targetRaw && proto?.Message?.encode) {
        const bytes = proto.Message.encode(targetRaw).finish();
        encodedBytes = bytes.length;
        encodedWireTree = inspectProtobufWire(bytes, 8);
      }
    } catch (_) {}

    const rawSnaps = getRecentRawWireBytesSnapshots(5000).map((s) => ({
      capturedAt: s.capturedAt,
      byteLength: s.byteLength,
      decodedKeys: s.decodedKeys || [],
      wireTree: inspectProtobufWire(s.rawBytes, 8)
    }));
    const globalFrames = getRecentRawWireFrames();
    const sessionFrames = Array.isArray(activeSession.lastRawWirePackets) ? activeSession.lastRawWirePackets : [];
    const now = Date.now();
    const candidates = [...rawSnaps, ...sessionFrames, ...globalFrames].filter(
      (f) => f && Array.isArray(f.wireTree) && f.wireTree.length > 0 && now - (f.capturedAt || f.at || 0) <= 5000
    );
    const lookupKeys = isKlonCmd ? ['extendedTextMessage', 'deviceSentMessage'] : topKeys.filter((k) => k !== 'messageContextInfo');
    const matchedWirePacket =
      [...candidates]
        .reverse()
        .find((f) => Array.isArray(f.decodedKeys) && lookupKeys.some((lk) => f.decodedKeys.includes(lk))) ||
      candidates[candidates.length - 1] ||
      null;

    const cachedWireTree = cachedSticker?.rawWireBytes ? inspectProtobufWire(cachedSticker.rawWireBytes, 8) : [];
    const rawWireTree = matchedWirePacket?.wireTree?.length ? matchedWirePacket.wireTree : encodedWireTree;
    const effectiveWireTree = rawWireTree.length > 0 ? rawWireTree : cachedWireTree;
    const opaqueInnerFields = extractOpaqueInnerMessageTree(effectiveWireTree);
    const rawWireBytesLength = Number(matchedWirePacket?.byteLength || cachedSticker?.rawWireBytes?.length || encodedBytes || 0);

    // Gabungkan unknown tags dari pesan reply & pesan stiker asli yang ter-cache (deduplikasi)
    const unknownMap = new Map();
    for (const entry of [...diffUnknownWireFields(rawWireTree), ...diffUnknownWireFields(cachedWireTree)]) {
      const k = `${entry.scope}:${entry.parentField || 0}:${entry.field}:${entry.wireType}`;
      if (!unknownMap.has(k)) unknownMap.set(k, entry);
    }
    const unknownWireFields = Array.from(unknownMap.values());

    const { mediaInspection, decryptedByMediaType, decryptErrors } = await inspectMediaCandidateInRam({
      curSession: activeSession,
      keyObj: { remoteJid: msg.key.remoteJid || selfJid, fromMe: Boolean(msg.key.fromMe), id: stanzaId || msg.key.id },
      innerMessage: tInner || inspectedSource,
      mediaTarget,
      stickerNode
    });

    // Tolak blueprint kosong tanpa isi wire & tanpa media agar tidak menimpa blueprint valid
    if (rawWireBytesLength === 0 && opaqueInnerFields.length === 0 && !(mediaInspection?.totalBytes > 0)) {
      if (isKlonCmd) {
        const emptyMsg = '⚠️ Data wire & media stiker kosong (tidak dapat diinspeksi). Coba balas 1 stiker lain dengan .klon.';
        await sendOfficialSelfMessage(io, sessionId, activeSession, selfJid, { text: emptyMsg }, '.klon empty-capture').catch(() => {});
      }
      return null;
    }

    const mergedInnerKeys = innerKeys.length > 0 ? innerKeys : (cachedSticker?.innerKeys || []);
    const mergedNonContext = nonContext.length > 0 ? nonContext : mergedInnerKeys.filter((k) => k !== 'messageContextInfo');
    const primaryMsgType =
      mergedNonContext[0] ||
      (unknownWireFields[0]?.field ? `unknownField#${unknownWireFields[0].field}` : 'stickerMessage');
    const innerMeta = summarizeNonBufferFields(
      stickerNode || ptvOrMedia || tInner?.[primaryMsgType] || tInner || cachedSticker?.stickerMeta || {}
    );
    const recentStanzas = Array.isArray(activeSession.recentSelfStanzas) ? activeSession.recentSelfStanzas : [];
    const lookupStanzaId = stanzaId || msg.key.id;
    const matchedStanza =
      recentStanzas.find((s) => lookupStanzaId && s.id === lookupStanzaId) ||
      recentStanzas[recentStanzas.length - 1] ||
      null;

    const rawBlueprint = {
      capturedAt: Date.now(),
      baileysVersion: BAILEYS_VERSION,
      source: isKlonCmd ? 'klon-reply' : triggerReason,
      msgId: stanzaId || msg.key.id || null,
      upsertType: isKlonCmd ? 'klon-reply' : upsertType,
      fromMe: Boolean(msg.key.fromMe),
      remoteJid: msg.key.remoteJid || selfJid,
      stubType: msg.messageStubType || null,
      stanzaMeta: matchedStanza
        ? {
            id: matchedStanza.id || null,
            type: matchedStanza.type || '',
            mediatype: matchedStanza.mediatype || '',
            childTags: Array.isArray(matchedStanza.childTags) ? matchedStanza.childTags : [],
            encAttrs: Array.isArray(matchedStanza.encAttrs) ? matchedStanza.encAttrs : [],
            at: matchedStanza.at || Date.now()
          }
        : null,
      wrapperChain: wrapperChain.length > 0 ? wrapperChain : (cachedSticker?.wrapperChain || []),
      topLevelKeys: topKeys.length > 0 ? topKeys : (cachedSticker?.topLevelKeys || []),
      innerKeys: mergedInnerKeys,
      messageType: primaryMsgType,
      hkdfMediaType: decryptedByMediaType,
      decryptedByMediaType,
      hasMessageContextInfo: Boolean(tInner?.messageContextInfo || inspectedSource?.messageContextInfo),
      innerMeta,
      stickerMeta: innerMeta,
      unknownWireFields,
      unknownWireTags: unknownWireFields,
      rawWireTree: effectiveWireTree,
      opaqueInnerFields,
      rawWireBytesLength,
      mediaInspection,
      decryptErrors,
      messageKeys: mergedInnerKeys,
      stickerFields: innerMeta,
      binarySummary: mediaInspection,
      quotedWireBytes: encodedBytes,
      matchedCachedSticker: Boolean(cachedSticker)
    };

    const blueprint = sanitizeBlueprint(rawBlueprint) || rawBlueprint;
    const existingHasRich = Boolean(
      activeSession.soundStickerBlueprint &&
        ((Array.isArray(activeSession.soundStickerBlueprint.opaqueInnerFields) && activeSession.soundStickerBlueprint.opaqueInnerFields.length > 0) ||
          activeSession.soundStickerBlueprint.mediaInspection?.totalBytes > 0)
    );
    const incomingHasRich = Boolean(opaqueInnerFields.length > 0 || mediaInspection?.totalBytes > 0);
    if (!existingHasRich || incomingHasRich) {
      activeSession.soundStickerBlueprint = blueprint;
    }
    const globalSpec = promoteVerifiedBlueprintToGlobalSpec(blueprint);

    const dumpObject = {
      status: 'captured',
      trigger: triggerReason,
      msgId: blueprint.msgId,
      matchedCachedSticker: Boolean(cachedSticker),
      wrapperChain: blueprint.wrapperChain,
      topKeys: blueprint.topLevelKeys,
      keys: mergedInnerKeys,
      innerMeta,
      mime: innerMeta?.mimetype || '-',
      hkdf: decryptedByMediaType || '-',
      container: mediaInspection?.detectedContainer || 'unknown',
      magicHex: mediaInspection?.magicHex || '',
      magicAscii: mediaInspection?.magicAscii || '',
      chunks: Array.isArray(mediaInspection?.chunks) ? mediaInspection.chunks : [],
      customChunks: Array.isArray(mediaInspection?.customChunks) ? mediaInspection.customChunks : [],
      exifJson: mediaInspection?.exifJson || null,
      trackCodecs: Array.isArray(mediaInspection?.trackCodecs) ? mediaInspection.trackCodecs : [],
      opaqueInnerFields,
      unknownTags: unknownWireFields.map((t) => `#${t.field}:w${t.wireType}:${t.scope}`),
      decryptErrors,
      specMode: globalSpec.mode,
      deliveryRoute: globalSpec.deliveryRoute
    };

    const wf = mediaInspection?.webpForensics || null;

    pushCalibrationLog(io, sessionId, activeSession, {
      upsertType: 'BLUEPRINT-CAPTURED',
      remoteJid: msg.key.remoteJid || selfJid,
      fromMe: Boolean(msg.key.fromMe),
      wrapperChain: [primaryMsgType, mediaInspection?.detectedContainer || 'no-media'],
      keys: [
        `trigger:${triggerReason}`,
        `HKDF:${decryptedByMediaType || '-'}`,
        `mime:${innerMeta?.mimetype || '-'}`,
        `unknownTags:${unknownWireFields.length}`
      ],
      detail: `[${triggerReason}] type=${primaryMsgType} hkdf=${decryptedByMediaType || '-'} container=${mediaInspection?.detectedContainer || 'none'} unknownTags=${unknownWireFields.length}`
    });

    emitToDevice(io, sessionId, 'sound-sticker-spec-sync', globalSpec);
    emitToDevice(io, sessionId, 'sound-sticker-blueprint-ready', { blueprint, globalSpec });
    emitToDevice(io, sessionId, 'sound-sticker-schema-detected', { ...blueprint, globalSpec });

    const detectedCont = mediaInspection?.detectedContainer || 'unknown';
    const hasCustomAudioSignatures = Boolean(wf?.audioSignatures?.length || wf?.trailingBytesCount > 0);
    const shouldReplyInWa = Boolean(
      sendReplyToSelf ||
        isKlonCmd ||
        globalSpec.hasAudioSignature ||
        hasCustomAudioSignatures ||
        unknownWireFields.length > 0 ||
        (detectedCont !== 'webp' && detectedCont !== 'unknown')
    );

    if (shouldReplyInWa) {
      const unknownText = dumpObject.unknownTags.length > 0 ? dumpObject.unknownTags.join(', ') : '0';
      const errKeys = Object.keys(decryptErrors || {});
      const replyLines = [
        '🔬 *.klon Forensik Stiker Lengkap*',
        `• Spec: ${globalSpec.mode} | HKDF: ${decryptedByMediaType || '-'} | Mime: ${innerMeta?.mimetype || '-'}`
      ];

      if (wf) {
        const vp8FlagsStr = wf.vp8xDetails
          ? `0x${wf.vp8xDetails.flagsByte.toString(16).padStart(2, '0')} (${wf.vp8xDetails.flagsBinary}) ${wf.vp8xDetails.canvasWidth}x${wf.vp8xDetails.canvasHeight} | reserved0=${wf.vp8xDetails.flags.bit0_reserved} reserved6=${wf.vp8xDetails.flags.bit6_reserved} reserved7=${wf.vp8xDetails.flags.bit7_reserved}`
          : '-';
        const nonAnmfText = wf.nonAnmfChunks.length > 0
          ? wf.nonAnmfChunks.map((c) => `${c.fourcc}@${c.offset}:${c.size}B`).join(', ')
          : '-';
        const firstSub = wf.anmfSubChunks?.first?.map((s) => `${s.fourcc}:${s.size}${s.isForeign ? '[FOREIGN]' : ''}`).join(',') || '-';
        const lastSub = wf.anmfSubChunks?.last?.length
          ? wf.anmfSubChunks.last.map((s) => `${s.fourcc}:${s.size}${s.isForeign ? '[FOREIGN]' : ''}`).join(',')
          : '';
        const sigText = wf.audioSignatures.length > 0
          ? wf.audioSignatures.map((s) => `${s.sig}@${s.offset}(${s.chunkOwner})`).join(', ')
          : 'none';

        replyLines.push(
          `• TotalBytes vs RiffEnd: ${wf.totalFileBytes} B vs ${wf.riffEndOffset} B (Trailing: ${wf.trailingBytesCount} B${wf.trailingHeadAscii ? ` | ASCII=${wf.trailingHeadAscii}` : ''})`,
          `• Non-ANMF Chunks: ${nonAnmfText}`,
          `• ANMF: ${wf.anmfCount} frame (total ${wf.anmfTotalBytes} B) | first=[${firstSub}]${lastSub ? ` last=[${lastSub}]` : ''}`,
          `• VP8X Flags: ${vp8FlagsStr}`,
          `• Full EXIF: ${wf.fullExifString || '-'}`,
          ...(wf.xmpText ? [`• XMP: ${wf.xmpText}`] : []),
          `• Audio Signatures: ${sigText}`
        );
      } else {
        const chunksText = dumpObject.chunks.length > 0 ? dumpObject.chunks.join(', ') : '-';
        const exifText = dumpObject.exifJson ? JSON.stringify(dumpObject.exifJson).slice(0, 2000) : '-';
        replyLines.push(
          `• Container: ${detectedCont}`,
          `• Chunks/Atoms: ${chunksText}`,
          `• Full EXIF: ${exifText}`
        );
      }

      replyLines.push(
        `• StickerMeta: ${JSON.stringify(innerMeta)}`,
        `• Unknown Wire Tags: ${unknownText}`,
        ...(errKeys.length && !decryptedByMediaType ? [`• Decrypt Errors: ${errKeys.map((k) => `${k}=${decryptErrors[k]}`).join('; ')}`] : [])
      );
      await sendOfficialSelfMessage(io, sessionId, activeSession, selfJid, { text: replyLines.join('\n') }, '.klon Forensic Report');
    }

    return blueprint;
  } catch (err) {
    console.error('[STICKER-DUMP-ERR]', err);
    if (sendReplyToSelf && activeSession && selfJid && selfJid.endsWith('@s.whatsapp.net')) {
      await sendOfficialSelfMessage(
        io,
        sessionId,
        activeSession,
        selfJid,
        { text: `❌ .klon error: ${err?.message || 'Gagal menganalisis stiker.'}` },
        '.klon error'
      ).catch(() => {});
    }
    return null;
  }
}

async function handleKlonReplyCommand(io, sessionId, session, msg) {
  return inspectAndDumpSticker(io, sessionId, session, msg, {
    triggerReason: 'klon-command',
    upsertType: 'klon-reply',
    sendReplyToSelf: true
  });
}

registerKlonCommandProcessor(handleKlonReplyCommand);
registerStickerDumpProcessor(inspectAndDumpSticker);

/**
 * Daftarkan handler upsert kalibrasi pada objek sesi (dipelihara untuk kompatibilitas).
 */
function attachCalibrationListener(io, sessionId, session) {
  if (!session) return;
  session._onCalibrationUpsert = (payload) => processCalibrationUpsert(io, sessionId, session, payload);
  if (session.sock) {
    const { attachSoundStickerSniffer } = require('./whatsappSessionHandler');
    attachSoundStickerSniffer(io, session, session.sock);
  }
}

/**
 * Jalur kirim resmi berbasis `sock.sendMessage(selfJid, content)` + cache sentMessageStore untuk Signal retry.
 */
async function sendOfficialSelfMessage(io, sessionId, session, selfJid, content, traceLabel = 'sock.sendMessage') {
  if (!session?.sock?.user?.id) {
    throw new Error('Sesi WhatsApp belum terhubung aktif.');
  }

  const sentMsg = await session.sock.sendMessage(selfJid, content);
  const messageId = sentMsg?.key?.id || '';
  const encodedBytes = getEncodedProtoSize(sentMsg?.message);

  if (messageId && sentMsg?.message) {
    rememberSentMessage(session, messageId, sentMsg.message);
  }
  if (messageId) {
    watchE2eeMessageId(session, messageId);
    pushDeliveryTrace(io, sessionId, session, {
      messageId,
      phase: 'sent',
      event: 'sock.sendMessage',
      isError: false,
      detail: `${traceLabel} (${encodedBytes || '?'} B proto) -> menunggu ACK HP`
    });
  }
  emitAuthSnapshotNow(io, sessionId, session);

  return { sentMsg, messageId, encodedBytes };
}

/**
 * Uji kirim diagnostik (Tes E2EE Teks / Tes Stiker Polos) dengan pemantauan ACK non-blocking yang bersih.
 */
async function runSelfE2eeDiagnosticSend({
  io,
  sessionId,
  session,
  selfJid,
  content,
  traceLabel,
  defaultWaitLabel,
  errorPrefix,
  serverAckLabel,
  deliveredAckLabel
}) {
  let ackStatus = 1;
  let ackLabel = defaultWaitLabel;
  let ackError = false;
  let trackedId = '';
  const earlyUpdates = [];

  const handleAckUpdate = (upd) => {
    const st = Number(upd?.update?.status);
    if (!Number.isFinite(st)) return false;
    ackStatus = st;
    if (st === 0 || st < 0) {
      ackError = true;
      ackLabel = errorPrefix;
      return true;
    }
    if (st >= 3) {
      ackLabel = deliveredAckLabel;
      return true;
    }
    if (st === 2) {
      ackLabel = serverAckLabel;
    }
    return false;
  };

  let onAckUpdate = null;
  let onReceiptUpdate = null;
  const ackPromise = new Promise((resolve) => {
    const timer = setTimeout(
      () => resolve({ status: ackStatus, label: ackLabel, isError: ackError }),
      SELF_E2EE_TEST_WATCH_MS
    );
    onAckUpdate = (updates) => {
      if (!Array.isArray(updates)) return;
      for (const upd of updates) {
        if (!trackedId) {
          if (upd?.key?.fromMe) earlyUpdates.push(upd);
          continue;
        }
        if (upd?.key?.id !== trackedId) continue;
        if (handleAckUpdate(upd)) {
          clearTimeout(timer);
          resolve({ status: ackStatus, label: ackLabel, isError: ackError });
          return;
        }
      }
    };
    onReceiptUpdate = (updates) => {
      if (!Array.isArray(updates) || !trackedId) return;
      for (const upd of updates) {
        if (upd?.key?.id !== trackedId) continue;
        ackStatus = 3;
        ackLabel = deliveredAckLabel;
        clearTimeout(timer);
        resolve({ status: 3, label: ackLabel, isError: false });
        return;
      }
    };
    session.sock.ev.on('messages.update', onAckUpdate);
    session.sock.ev.on('message-receipt.update', onReceiptUpdate);
  });

  try {
    const sent = await sendOfficialSelfMessage(io, sessionId, session, selfJid, content, traceLabel);
    trackedId = sent.messageId;

    for (const upd of earlyUpdates) {
      if (upd?.key?.id === trackedId && handleAckUpdate(upd)) {
        break;
      }
    }

    const settledAck =
      ackError || ackStatus >= 3
        ? { status: ackStatus, label: ackLabel, isError: ackError }
        : await ackPromise;

    return {
      ok: !settledAck.isError,
      messageId: sent.messageId,
      encodedBytes: sent.encodedBytes,
      ackStatus: settledAck.status,
      ackLabel: settledAck.label,
      error: settledAck.isError ? settledAck.label : null
    };
  } finally {
    if (onAckUpdate) {
      try { session.sock?.ev?.off?.('messages.update', onAckUpdate); } catch (_) {}
    }
    if (onReceiptUpdate) {
      try { session.sock?.ev?.off?.('message-receipt.update', onReceiptUpdate); } catch (_) {}
    }
  }
}

async function relayVerifiedMessageObject(io, sessionId, session, selfJid, messageObject, traceLabel, { patchedBytes = null } = {}) {
  const verifyErr = proto?.Message?.verify?.(messageObject);
  if (verifyErr) {
    throw new Error(`Payload WAProto gagal verifikasi: ${verifyErr}`);
  }

  const encodedLen = patchedBytes ? patchedBytes.length : getEncodedProtoSize(messageObject);
  if (!encodedLen || encodedLen <= 16) {
    throw new Error('Payload protobuf pesan terlalu pendek (<= 16 B), dibatalkan agar tidak memicu "Menunggu pesan ini".');
  }
  if (patchedBytes) {
    const wireOk = verifyWireBytesStrict(patchedBytes);
    if (!wireOk.ok) {
      throw new Error(`Verifikasi wire pasca-patch gagal: ${wireOk.error}`);
    }
  }

  const waMsg = generateWAMessageFromContent(selfJid, messageObject, {
    userJid: session.sock.user.id
  });
  const finalId = waMsg.key.id;

  // Simpan message ke cache E2EE sebelum relay agar Signal retry selalu terlayani
  rememberSentMessage(session, finalId, waMsg.message);
  watchE2eeMessageId(session, finalId);

  if (patchedBytes) {
    await withScopedPatchedMessageEncode(proto.Message, waMsg.message, patchedBytes, async () => {
      await session.sock.relayMessage(selfJid, waMsg.message, { messageId: finalId });
    });
  } else {
    await session.sock.relayMessage(selfJid, waMsg.message, { messageId: finalId });
  }

  pushDeliveryTrace(io, sessionId, session, {
    messageId: finalId,
    phase: 'sent',
    event: patchedBytes ? 'wire-cloner' : 'relayMessage',
    isError: false,
    detail: `${traceLabel} (${encodedLen} B proto) -> menunggu ACK HP`
  });
  emitAuthSnapshotNow(io, sessionId, session);

  return { messageId: finalId, encodedBytes: encodedLen };
}

async function uploadMediaNodeForCloner(session, hkdfType, mediaBuf, extraFields = {}) {
  const safeKind = ['sticker', 'video', 'audio', 'document', 'image'].includes(hkdfType) ? hkdfType : 'sticker';
  const payload = { [safeKind]: mediaBuf, ...extraFields };
  if (safeKind === 'video' && !payload.jpegThumbnail) {
    payload.jpegThumbnail = Buffer.alloc(0);
  }
  if (safeKind === 'audio' && payload.seconds === undefined) {
    payload.seconds = 3;
  }

  const uploaded = await prepareWAMessageMedia(payload, {
    upload: session.sock.waUploadToServer
  });
  const node = uploaded?.[`${safeKind}Message`] || Object.values(uploaded || {})[0];
  if (!node || !node.mediaKey || !node.url) {
    throw new Error(`Upload media HKDF (${safeKind}) gagal menghasilkan kredensial media.`);
  }
  return node;
}

/**
 * Jalur A2: stickerMessage bermedia MP4/WebM menggunakan HKDF media type eksak dari blueprint.
 */
async function sendJalurAMuxedSticker({ io, sessionId, session, selfJid, muxedBuf, containerExt, activeSpec, pngThumbnail, queueId }) {
  const hkdfKey = activeSpec.hkdfMediaType || 'sticker';
  const targetMime =
    activeSpec.mimetype && (activeSpec.mimetype.includes('mp4') || activeSpec.mimetype.includes('webm'))
      ? activeSpec.mimetype
      : containerExt === 'webm'
        ? 'video/webm'
        : 'video/mp4';

  const mediaNode = await uploadMediaNodeForCloner(session, hkdfKey, muxedBuf);
  const stickerMsg = {
    url: mediaNode.url,
    directPath: mediaNode.directPath,
    mediaKey: mediaNode.mediaKey,
    fileSha256: mediaNode.fileSha256,
    fileEncSha256: mediaNode.fileEncSha256,
    fileLength: mediaNode.fileLength,
    mediaKeyTimestamp: mediaNode.mediaKeyTimestamp,
    mimetype: targetMime,
    isAnimated: true,
    width: 512,
    height: 512,
    stickerSentTs: Date.now(),
    ...(pngThumbnail ? { pngThumbnail } : {})
  };

  const protoObj = proto.Message.fromObject({ stickerMessage: stickerMsg });
  return relayVerifiedMessageObject(
    io,
    sessionId,
    session,
    selfJid,
    protoObj,
    queueId ? `Jalur A2 (${targetMime}) #${String(queueId).slice(-5)}` : `Jalur A2 (${targetMime})`
  );
}

/**
 * Jalur B: Suntikkan unknown wire tags (scalar atau sub-message audio) dengan verifikasi wire round-trip ketat.
 */
async function sendJalurBWirePatchedSticker({ io, sessionId, session, selfJid, stickerWebpBuf, audioBuf, audioMime, durationSec, unknownFields, queueId }) {
  const needsMediaUpload = unknownFields.some(
    (u) => u.wireType === 2 && Array.isArray(u.subFields) && u.subFields.some((s) => Number(s.len) === 32 || String(s.previewUtf8 || '').includes('/'))
  );

  let audioUploadMeta = {
    mimetype: audioMime || 'audio/mp4',
    seconds: Math.max(1, Math.round(Number(durationSec) || 3))
  };

  if (needsMediaUpload) {
    if (!audioBuf) {
      throw new Error('Blueprint Jalur B memerlukan track audio yang diunggah, namun audio potongan tidak tersedia.');
    }
    const audioNode = await uploadMediaNodeForCloner(session, 'audio', audioBuf, {
      ptt: false,
      mimetype: audioMime || 'audio/mp4',
      seconds: Math.max(1, Math.round(Number(durationSec) || 3))
    });
    audioUploadMeta = {
      url: audioNode.url,
      directPath: audioNode.directPath,
      mediaKey: audioNode.mediaKey,
      fileSha256: audioNode.fileSha256,
      fileEncSha256: audioNode.fileEncSha256,
      fileLength: Number(audioNode.fileLength) || audioBuf.length,
      mimetype: audioMime || audioNode.mimetype || 'audio/mp4',
      seconds: Math.max(1, Math.round(Number(durationSec) || 3))
    };
  }

  const baseMsg = await generateWAMessage(
    selfJid,
    { sticker: stickerWebpBuf },
    {
      userJid: session.sock.user.id,
      upload: session.sock.waUploadToServer
    }
  );
  if (!baseMsg?.message) {
    throw new Error('Gagal membangun pesan dasar WebP sebelum patch protobuf.');
  }

  const patched = appendWireFieldsToEncodedMessage(baseMsg.message, audioUploadMeta, unknownFields, {
    protoMessageCls: proto.Message
  });

  return relayVerifiedMessageObject(
    io,
    sessionId,
    session,
    selfJid,
    baseMsg.message,
    queueId ? `Jalur B Wire-Patch #${String(queueId).slice(-5)}` : 'Jalur B Wire-Patch',
    { patchedBytes: patched.bytes }
  );
}

/**
 * Jalur C: Tipe pesan alternatif (lottieStickerMessage / ptvMessage / videoMessage) sesuai blueprint.
 */
async function sendJalurCAltMessage({ io, sessionId, session, selfJid, messageType, innerMeta, stickerWebpBuf, muxedBuf, jpegThumbBuf, queueId }) {
  if (messageType === 'lottieStickerMessage') {
    const mediaNode = await uploadMediaNodeForCloner(session, 'sticker', stickerWebpBuf);
    const protoObj = proto.Message.fromObject({
      lottieStickerMessage: {
        message: {
          stickerMessage: {
            ...mediaNode,
            mimetype: innerMeta?.mimetype || 'application/was',
            isAnimated: true,
            isLottie: true,
            width: 512,
            height: 512,
            stickerSentTs: Date.now()
          }
        }
      }
    });
    return relayVerifiedMessageObject(io, sessionId, session, selfJid, protoObj, 'Jalur C lottieStickerMessage');
  }

  if ((messageType === 'ptvMessage' || messageType === 'videoMessage') && muxedBuf) {
    return sendOfficialSelfMessage(
      io,
      sessionId,
      session,
      selfJid,
      {
        video: muxedBuf,
        ptv: messageType === 'ptvMessage',
        gifPlayback: Boolean(innerMeta?.gifPlayback),
        mimetype: innerMeta?.mimetype || 'video/mp4',
        ...(jpegThumbBuf ? { jpegThumbnail: jpegThumbBuf } : {})
      },
      queueId ? `Jalur C (${messageType}) #${String(queueId).slice(-5)}` : `Jalur C (${messageType})`
    );
  }

  return sendOfficialSelfMessage(
    io,
    sessionId,
    session,
    selfJid,
    { sticker: stickerWebpBuf },
    queueId ? `Jalur C Fallback #${String(queueId).slice(-5)}` : 'Jalur C Fallback'
  );
}

function writeUint24LE(buf, off, val) {
  buf[off] = val & 0xff;
  buf[off + 1] = (val >>> 8) & 0xff;
  buf[off + 2] = (val >>> 16) & 0xff;
}

function buildWaExifPayloadBuffer({
  packName = 'Kuro Sound Sticker',
  packAuthor = 'Kuro Studio',
  emojis = ['🎵', '✨']
} = {}) {
  const meta = {
    'sticker-pack-id': 'kuro.sound.sticker',
    'sticker-pack-name': String(packName || 'Kuro Sound Sticker').slice(0, 64),
    'sticker-pack-publisher': String(packAuthor || 'Kuro Studio').slice(0, 64),
    emojis: Array.isArray(emojis) && emojis.length > 0 ? emojis : ['🎵', '✨']
  };
  const jsonBytes = Buffer.from(JSON.stringify(meta), 'utf8');
  const header = Buffer.from([
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41,
    0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00
  ]);
  writeUint32LE(header, 14, jsonBytes.length);
  return Buffer.concat([header, jsonBytes]);
}

/**
 * Pastikan WebP untuk Stiker Audio berformat Animated WebP valid (VP8X flag ANIM+EXIF+ALPHA, ANIM loop=0, 2x ANMF, EXIF).
 */
function ensureAnimatedAudioStickerWebp(webpBuf, meta = {}) {
  if (!Buffer.isBuffer(webpBuf) || webpBuf.length < 30) {
    throw new Error('Buffer WebP tidak valid.');
  }
  if (webpBuf.toString('ascii', 0, 4) !== 'RIFF' || webpBuf.toString('ascii', 8, 12) !== 'WEBP') {
    throw new Error('Header RIFF/WEBP tidak valid.');
  }

  let off = 12;
  let vp8xData = null;
  let exifData = null;
  let hasAnim = false;
  let hasAnmf = false;
  let hasAlpha = false;
  const frameSubChunks = [];

  while (off + 8 <= webpBuf.length) {
    const fcc = webpBuf.toString('ascii', off, off + 4);
    const sz = webpBuf.readUInt32LE(off + 4);
    const dataStart = off + 8;
    const dataEnd = Math.min(webpBuf.length, dataStart + sz);
    const dataBuf = webpBuf.subarray(dataStart, dataEnd);

    if (fcc === 'VP8X' && dataBuf.length >= 10) {
      vp8xData = Buffer.from(dataBuf);
      if ((dataBuf[0] & 0x10) !== 0) hasAlpha = true;
    } else if (fcc === 'ANIM') {
      hasAnim = true;
    } else if (fcc === 'ANMF') {
      hasAnmf = true;
    } else if (fcc === 'EXIF') {
      exifData = Buffer.from(dataBuf);
    } else if (fcc === 'ALPH' || fcc === 'VP8 ' || fcc === 'VP8L') {
      if (fcc === 'ALPH' || (fcc === 'VP8L' && dataBuf.length >= 5 && (dataBuf[4] & 0x10) !== 0)) {
        hasAlpha = true;
      }
      frameSubChunks.push(buildRiffChunkBuffer(fcc, dataBuf));
    }

    off = dataStart + sz + (sz % 2);
  }

  if (hasAnim && hasAnmf && vp8xData && (vp8xData[0] & 0x02) !== 0) {
    return { webpBuf, isAnimated: true };
  }
  if (frameSubChunks.length === 0) {
    throw new Error('Frame VP8/VP8L tidak ditemukan untuk konversi Animated WebP.');
  }

  const vp8xPayload = Buffer.alloc(10);
  vp8xPayload[0] = (hasAlpha ? 0x10 : 0x00) | 0x08 | 0x02;
  writeUint24LE(vp8xPayload, 4, 511);
  writeUint24LE(vp8xPayload, 7, 511);

  const animPayload = Buffer.alloc(6, 0);
  const encodedSub = Buffer.concat(frameSubChunks);
  const anmfHeader = Buffer.alloc(16);
  writeUint24LE(anmfHeader, 0, 0);
  writeUint24LE(anmfHeader, 3, 0);
  writeUint24LE(anmfHeader, 6, 511);
  writeUint24LE(anmfHeader, 9, 511);
  writeUint24LE(anmfHeader, 12, 500);
  anmfHeader[15] = 0x03;

  const anmfChunk = buildRiffChunkBuffer('ANMF', Buffer.concat([anmfHeader, encodedSub]));
  const exifChunk = buildRiffChunkBuffer('EXIF', exifData || buildWaExifPayloadBuffer(meta));
  const body = Buffer.concat([
    buildRiffChunkBuffer('VP8X', vp8xPayload),
    buildRiffChunkBuffer('ANIM', animPayload),
    anmfChunk,
    anmfChunk,
    exifChunk
  ]);

  const out = Buffer.alloc(12 + body.length);
  out.write('RIFF', 0, 4, 'ascii');
  writeUint32LE(out, 4, 4 + body.length);
  out.write('WEBP', 8, 4, 'ascii');
  body.copy(out, 12);

  if (out.length > MAX_ANIMATED_STICKER_BYTES) {
    return { webpBuf, isAnimated: false };
  }
  return { webpBuf: out, isAnimated: true };
}

/**
 * Pengirim Native WA Audio Sticker (#134 -> #1 -> #26 StickerMessage + #26 AudioMessage Ogg/Opus) — Zero-Disk & Anti "Menunggu pesan ini".
 */
async function sendNativeProto134AudioSticker({
  io,
  sessionId,
  session,
  selfJid,
  stickerWebpBuf,
  isAnimated = false,
  audioBuf,
  audioMime = '',
  durationSec = 3,
  stickerEmoji = '✨',
  packName = 'Kuro Sound Sticker',
  packAuthor = 'Kuro Studio',
  queueId = null
}) {
  if (!session?.sock?.user?.id) {
    throw new Error('Sesi WhatsApp belum terhubung aktif.');
  }

  let oggOpusBuf = null;
  let finalWebpBuf = stickerWebpBuf;
  try {
    const animResult = ensureAnimatedAudioStickerWebp(stickerWebpBuf, { packName, packAuthor });
    finalWebpBuf = animResult.webpBuf;
    const finalIsAnimated = Boolean(animResult.isAnimated || isAnimated);

    oggOpusBuf = await ensureValidOggOpusBuffer(audioBuf, audioMime);
    const safeSeconds = Math.max(1, Math.round(Number(durationSec) || 1));

    const uploadedSticker = await uploadMediaNodeForCloner(session, 'sticker', finalWebpBuf);
    const uploadedAudio = await uploadMediaNodeForCloner(session, 'audio', oggOpusBuf, {
      mimetype: 'audio/ogg; codecs=opus',
      ptt: false,
      seconds: safeSeconds
    });

    const nowMs = Date.now();
    const nowSec = Math.floor(nowMs / 1000);

    const audioObj = {
      url: uploadedAudio.url,
      mimetype: 'audio/ogg; codecs=opus',
      fileSha256: uploadedAudio.fileSha256,
      fileLength: uploadedAudio.fileLength || oggOpusBuf.length,
      seconds: safeSeconds,
      mediaKey: uploadedAudio.mediaKey,
      fileEncSha256: uploadedAudio.fileEncSha256,
      directPath: uploadedAudio.directPath,
      mediaKeyTimestamp: uploadedAudio.mediaKeyTimestamp || nowSec,
      contextInfo: {
        mediaKeyContext: {
          type: 1,
          mediaKey: uploadedAudio.mediaKey
        }
      }
    };

    const stickerObj = {
      url: uploadedSticker.url,
      fileSha256: uploadedSticker.fileSha256,
      fileEncSha256: uploadedSticker.fileEncSha256,
      mediaKey: uploadedSticker.mediaKey,
      mimetype: 'image/webp',
      height: 64,
      width: 64,
      directPath: uploadedSticker.directPath,
      fileLength: uploadedSticker.fileLength || finalWebpBuf.length,
      mediaKeyTimestamp: uploadedSticker.mediaKeyTimestamp || nowSec,
      ...(uploadedSticker.firstFrameLength ? { firstFrameLength: uploadedSticker.firstFrameLength } : {}),
      ...(uploadedSticker.firstFrameSidecar ? { firstFrameSidecar: uploadedSticker.firstFrameSidecar } : {}),
      isAnimated: finalIsAnimated,
      contextInfo: {
        mediaKeyContext: {
          type: 1,
          mediaKey: uploadedSticker.mediaKey
        }
      },
      stickerSentTs: nowMs,
      isAvatar: false,
      isAiSticker: false,
      isLottie: false,
      mediaKeyDomain: 0,
      stickerEmoji: typeof stickerEmoji === 'string' && stickerEmoji.trim() ? stickerEmoji.trim().slice(0, 16) : '✨',
      audioStickerMessage: audioObj
    };

    const messageSecret = crypto.randomBytes(32);
    const protoMsg = proto.Message.fromObject({
      audioStickerFutureProof: {
        message: {
          stickerMessage: stickerObj
        }
      },
      messageContextInfo: {
        messageSecret
      }
    });

    const encodedBytes = proto.Message.encode(protoMsg).finish();
    if (!encodedBytes || encodedBytes.length <= 500) {
      throw new Error(`Payload Stiker Audio #134 terlalu pendek (${encodedBytes?.length || 0} B).`);
    }

    const wireTree = inspectProtobufWire(encodedBytes, 8);
    const f134 = wireTree.find((n) => n.field === 134);
    const f1 = f134?.subFields?.find((n) => n.field === 1);
    const f26 = f1?.subFields?.find((n) => n.field === 26);
    const f26Audio = f26?.subFields?.find((n) => n.field === 26);
    const audioMimeLeaf = f26Audio?.subFields?.find((n) => n.field === 2);
    const f35 = wireTree.find((n) => n.field === 35);
    const f35Secret = f35?.subFields?.find((n) => n.field === 3);
    if (!f134 || !f1 || !f26 || !f26Audio || !String(audioMimeLeaf?.utf8 || '').includes('audio/ogg') || !f35Secret || f35Secret.len !== 32) {
      throw new Error('Validasi wire #134 -> #1 -> #26 + #35.3 (messageSecret 32B) gagal.');
    }

    const msgId =
      typeof generateMessageIDV2 === 'function'
        ? generateMessageIDV2(session.sock.user.id)
        : `KURO${nowMs.toString(16).toUpperCase()}`;

    // Simpan ke cache E2EE sebelum relayMessage agar retry Signal langsung melayani proto identik
    rememberSentMessage(session, msgId, protoMsg);
    watchE2eeMessageId(session, msgId);

    console.log('[AUDIO-STICKER-WIRE]', JSON.stringify({
      msgId,
      targetJid: selfJid,
      encodedLen: encodedBytes.length,
      hasTag134: Boolean(f134),
      hasTag26Audio: Boolean(f26Audio),
      hasMsgSecret: Boolean(f35Secret && f35Secret.len === 32),
      isAnimated: finalIsAnimated,
      stanzaType: 'text',
      webpBytes: finalWebpBuf.length,
      oggBytes: oggOpusBuf.length
    }));

    // Gunakan stanza standar Baileys FutureProof (type="text", tanpa additionalAttributes.type="media") agar tidak dibuang silent oleh WA Android
    await session.sock.relayMessage(selfJid, protoMsg, {
      messageId: msgId,
      useUserDevicesCache: true
    });

    const traceLabel = queueId ? `Stiker Audio #134 #${String(queueId).slice(-5)}` : 'Stiker Audio #134';
    pushDeliveryTrace(io, sessionId, session, {
      messageId: msgId,
      phase: 'sent',
      event: 'proto134-relay',
      isError: false,
      detail: `${traceLabel} (${encodedBytes.length} B proto, WebP ${(finalWebpBuf.length / 1024).toFixed(1)} KB, Ogg ${(oggOpusBuf.length / 1024).toFixed(1)} KB) -> menunggu ACK HP`
    });
    emitAuthSnapshotNow(io, sessionId, session);

    return {
      messageId: msgId,
      encodedBytes: encodedBytes.length,
      webpBytes: finalWebpBuf.length,
      oggBytes: oggOpusBuf.length,
      isAnimated: finalIsAnimated
    };
  } finally {
    oggOpusBuf = null;
    finalWebpBuf = null;
  }
}

/**
 * Mesin Perakitan & Pengirim Stiker Audio Native #134 — Zero "Menunggu pesan ini".
 */
async function buildAndSendSoundSticker({ io, sessionId, session, selfJid, payload }) {
  let stickerWebpBuf = null;
  let muxedMp4Buf = null;
  let muxedWebmBuf = null;
  let audioOpusBuf = null;
  let audioM4aBuf = null;
  let audioUnifiedBuf = null;
  let jpegThumbBuf = null;
  let pngThumbBuf = null;

  try {
    const {
      queueId = null,
      stickerWebpBase64,
      muxedWebmBase64,
      muxedMp4Base64,
      audioBase64,
      audioMime = '',
      audioOpusBase64,
      audioM4aBase64,
      thumbnailJpegBase64,
      thumbnailPngBase64,
      durationSec = 3,
      stickerEmoji = '✨'
    } = payload || {};

    stickerWebpBuf = decodeBoundedBase64(stickerWebpBase64, MAX_STICKER_BYTES, 'stiker WebP 512x512');
    const validatedWebp = validateStickerMediaPayload(stickerWebpBuf);
    const isAnimatedBitstream = validatedWebp.isAnimatedBitstream;
    const webpBytes = stickerWebpBuf.length;

    muxedMp4Buf = decodeOptionalBase64(muxedMp4Base64, 'mp4', 'muxed MP4');
    muxedWebmBuf = decodeOptionalBase64(muxedWebmBase64, 'webm', 'muxed WebM');
    audioUnifiedBuf = decodeOptionalBase64(audioBase64, 'audio', 'audio potongan');
    audioOpusBuf = decodeOptionalBase64(audioOpusBase64, 'ogg', 'audio Opus');
    audioM4aBuf = decodeOptionalBase64(audioM4aBase64, 'mp4', 'audio M4A');
    if (thumbnailJpegBase64 && typeof thumbnailJpegBase64 === 'string') {
      try {
        jpegThumbBuf = decodeBoundedBase64(thumbnailJpegBase64, 256 * 1024, 'thumbnail');
      } catch (_) {}
    }
    if (thumbnailPngBase64 && typeof thumbnailPngBase64 === 'string') {
      try {
        const candidatePng = decodeBoundedBase64(thumbnailPngBase64, 64 * 1024, 'pngThumbnail');
        if (candidatePng.length >= 8 && candidatePng[0] === 0x89 && candidatePng[1] === 0x50 && candidatePng[2] === 0x4e && candidatePng[3] === 0x47) {
          pngThumbBuf = candidatePng;
        }
      } catch (_) {}
    }

    const activeSpec = getGlobalSoundStickerSpec();
    const bestAudioBuf = audioOpusBuf || audioUnifiedBuf || audioM4aBuf;
    const bestAudioMime = audioOpusBuf ? 'audio/ogg; codecs=opus' : (audioMime || 'audio/mp4');

    let modeUsed = 'native_webp_clean';
    let audioEmbedded = false;
    let isAudioSticker = false;
    let needsCalibration = false;
    let reason = activeSpec.reason;
    let note = 'Stiker WebP 512x512 terkirim via sock.sendMessage (0 error E2EE).';
    let sendRes = null;
    let oggBytes = 0;

      if (bestAudioBuf) {
        sendRes = await sendNativeProto134AudioSticker({
          io,
          sessionId,
          session,
          selfJid,
          stickerWebpBuf,
          isAnimated: isAnimatedBitstream,
          audioBuf: bestAudioBuf,
          audioMime: bestAudioMime,
          durationSec,
          stickerEmoji,
          packName: payload?.packName,
          packAuthor: payload?.packAuthor,
          queueId
        });
        modeUsed = 'wa_proto_134_audio_sticker_v1';
        audioEmbedded = true;
        isAudioSticker = true;
        needsCalibration = false;
        oggBytes = sendRes.oggBytes || 0;
        reason = 'Stiker Audio Native (#134 • Animated WebP + Ogg/Opus) terkirim bersih ke WhatsApp Anda.';
        note = 'Dikirim lewat Protokol Native #134 -> #1 -> #26 (Animated WebP + AudioMessage audio/ogg; codecs=opus).';
      } else {
      sendRes = await sendOfficialSelfMessage(
        io,
        sessionId,
        session,
        selfJid,
        { sticker: stickerWebpBuf },
        queueId ? `Stiker Polos #${String(queueId).slice(-5)} -> sock.sendMessage` : 'Stiker Polos -> sock.sendMessage'
      );
      modeUsed = 'native_webp_clean';
      audioEmbedded = false;
      isAudioSticker = false;
      needsCalibration = false;
      reason = 'Stiker WebP polos terkirim bersih (item tanpa audio).';
      note = 'Dikirim lewat sock.sendMessage (WebP 512x512 tanpa audio).';
    }

    if (sendRes?.messageId) {
      attachStickerDeliveryWatcher(io, sessionId, session, sendRes.messageId, queueId);
    }

    return {
      ok: true,
      ...(queueId ? { queueId } : {}),
      messageId: sendRes.messageId,
      deliveryTraceId: sendRes.messageId,
      protocol: isAudioSticker ? 'wa-proto-134-audio-sticker' : 'sock.sendMessage-sticker',
      modeUsed,
      deliveryRoute: isAudioSticker ? 'jalur_proto_134_permanent' : 'native_webp_clean',
      isAudioSticker,
      audioEmbedded,
      reason,
      globalSpecMode: activeSpec.mode,
      hasBlueprint: true,
      needsCalibration,
      isAnimated: Boolean(sendRes?.isAnimated ?? isAnimatedBitstream),
      encodedBytes: sendRes.encodedBytes,
      webpBytes: sendRes?.webpBytes || webpBytes,
      oggBytes,
      durationSec: Math.max(0.5, Number(durationSec) || 1),
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
    audioUnifiedBuf = null;
    jpegThumbBuf = null;
    pngThumbBuf = null;
  }
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
  const { clearedFiles, nullSessionMap } = clearOwnSignalSessionFilesOnDisk(sessionDir, ownPhone, ownLidUser);

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

  try {
    session.msgRetryCounterCache?.flushAll?.();
    session.msgCache?.clear?.();
    session.sentMessageStore?.clear?.();
    session.watchedE2eeIds?.clear?.();
  } catch (_) {}

  if (typeof session.sock?.authState?.keys?.set === 'function') {
    try {
      const keyPatch = {};
      if (Object.keys(nullSessionMap).length > 0) keyPatch.session = nullSessionMap;
      if (selfJid) keyPatch['sender-key-memory'] = { [selfJid]: null };
      if (Object.keys(keyPatch).length > 0) {
        await session.sock.authState.keys.set(keyPatch);
      }
    } catch (_) {}
  }

  emitAuthSnapshotNow(io, sessionId, session);

  // Soft-restart Baileys sambil menjaga creds.json agar state Signal/NodeCache/libsignal bersih 100%
  const { connected, session: freshSession } = await softRestartBaileysPreserveAuth(io, sessionId, 14000);
  const targetSock = freshSession?.sock || session.sock;
  if (freshSession) {
    attachCalibrationListener(io, sessionId, freshSession);
  }

  if (connected && targetSock?.user?.id) {
    const freshSet = new Set([selfJid, ...(selfLid ? [selfLid] : [])]);
    try {
      if (typeof targetSock.getUSyncDevices === 'function') {
        const discovered = await targetSock.getUSyncDevices(Array.from(freshSet), false, false);
        if (Array.isArray(discovered)) {
          for (const item of discovered) {
            if (typeof item === 'string' && item.includes('@')) {
              freshSet.add(item);
            } else if (item && typeof item === 'object' && item.user) {
              const isOwnerLid = ownLidUser && String(item.user) === ownLidUser;
              const server = item.server || (isOwnerLid ? 'lid' : 's.whatsapp.net');
              const encoded = typeof baileysModule.jidEncode === 'function'
                ? baileysModule.jidEncode(item.user, server, item.device)
                : item.device != null && item.device > 0
                  ? `${item.user}:${item.device}@${server}`
                  : `${item.user}@${server}`;
              if (encoded) freshSet.add(encoded);
            }
          }
        }
      }
    } catch (_) {}
    await targetSock.assertSessions(Array.from(freshSet), true);
  }

  emitAuthSnapshotNow(io, sessionId, freshSession || session);

  return {
    ok: true,
    softRestarted: Boolean(connected),
    clearedCount: clearedFiles.length,
    clearedFiles,
    refreshedTargets: uniqueTargets.length,
    selfJid,
    selfLid,
    baileysVersion: BAILEYS_VERSION,
    resetAt: Date.now()
  };
}

function emitSessionDiagnosticsReplay(socket, session) {
  if (!socket || !session) return;
  socket.emit('sound-sticker-spec-sync', getGlobalSoundStickerSpec());
  if (session.soundStickerBlueprint) {
    socket.emit('sound-sticker-blueprint-ready', {
      blueprint: session.soundStickerBlueprint,
      globalSpec: getGlobalSoundStickerSpec()
    });
  }
  if (session.calibratingSoundSticker && session.calibrationArmedUntil > Date.now()) {
    socket.emit('sound-sticker-calibration-armed', {
      sessionId: session.sessionId,
      linkedPhone: session.phone || (session.sock?.user?.id ? String(session.sock.user.id).split('@')[0].split(':')[0] : ''),
      linkedLid: session.sock?.user?.lid || null,
      baileysVersion: BAILEYS_VERSION,
      armedUntil: session.calibrationArmedUntil,
      resumed: true
    });
  }
  if (Array.isArray(session.calibrationLogs) && session.calibrationLogs.length > 0) {
    socket.emit('sound-sticker-calibration-history', session.calibrationLogs.slice(-25));
  }
  if (Array.isArray(session.deliveryTraces) && session.deliveryTraces.length > 0) {
    socket.emit('sound-sticker-delivery-trace-history', session.deliveryTraces.slice(-25));
  }
}

function buildCalibrationStatePayload(session) {
  const armed = Boolean(
    session?.calibratingSoundSticker &&
      (!session.calibrationArmedUntil || Date.now() <= session.calibrationArmedUntil)
  );
  if (session?.calibratingSoundSticker && !armed) {
    session.calibratingSoundSticker = false;
    session.calibrationArmedUntil = 0;
    syncCalibrationProtoObserver();
  }
  const linkedPhone = session?.phone || (session?.sock?.user?.id ? String(session.sock.user.id).split('@')[0].split(':')[0] : '');
  const linkedLid = session?.sock?.user?.lid || session?.accountLid || null;
  return {
    ok: true,
    connected: session?.status === 'connected',
    calibrating: armed,
    armedUntil: armed ? session.calibrationArmedUntil : 0,
    linkedPhone: linkedPhone || '',
    linkedLid,
    baileysVersion: BAILEYS_VERSION,
    logs: Array.isArray(session?.calibrationLogs) ? session.calibrationLogs.slice(-25) : [],
    blueprint: session?.soundStickerBlueprint || getBlueprint() || null,
    globalSpec: getSummary(),
    serverTime: Date.now()
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
        const errMsg = 'Hubungkan WhatsApp terlebih dahulu sebelum memulai deteksi format.';
        emitToDevice(io, sessionId, 'sound-sticker-calibration-error', { error: errMsg });
        return emitToDevice(io, sessionId, 'sound-sticker-result', {
          ok: false,
          error: errMsg
        });
      }

      session.calibrationLogs = [];
      session.recentSelfStanzas = [];
      session.lastCbMessageMeta = [];
      session.calibratingSoundSticker = true;
      session.calibrationArmedUntil = Date.now() + CALIBRATION_WINDOW_MS;
      if (session._calibrationExpireTimer) {
        clearTimeout(session._calibrationExpireTimer);
      }
      session._calibrationExpireTimer = setTimeout(() => {
        session._calibrationExpireTimer = null;
        if (session.calibratingSoundSticker) {
          session.calibratingSoundSticker = false;
          session.calibrationArmedUntil = 0;
          syncCalibrationProtoObserver();
        }
      }, CALIBRATION_WINDOW_MS + 250);
      attachCalibrationListener(io, sessionId, session);
      syncCalibrationProtoObserver();

      const linkedPhone = session.phone || String(session.sock.user.id).split('@')[0].split(':')[0];
      const linkedLid = session.sock?.user?.lid || null;

      emitToDevice(io, sessionId, 'sound-sticker-calibration-armed', {
        sessionId,
        linkedPhone,
        linkedLid,
        baileysVersion: BAILEYS_VERSION,
        armedUntil: session.calibrationArmedUntil
      });

      pushCalibrationLog(io, sessionId, session, {
        upsertType: 'armed',
        remoteJid: `${linkedPhone}@s.whatsapp.net`,
        fromMe: false,
        wrapperChain: ['listener-ready'],
        keys: [linkedPhone, linkedLid ? String(linkedLid).split('@')[0] : 'no-lid'],
        detail: `Mendengarkan KHUSUS chat Anda (+${linkedPhone}) — spam grup & status disaring`
      });
    } catch (err) {
      console.error('Error start-sound-sticker-calibration:', err.message);
    }
  });

  socket.on('sync-sound-sticker-blueprint', (payload) => {
    try {
      const { sessionId, deviceToken, blueprint } = payload || {};
      const tokenHash = verifyDeviceOwner(socket, sessionId, deviceToken);
      if (!tokenHash) return;
      joinExclusiveDeviceRoom(socket, sessionId);

      const cleanBp = sanitizeBlueprint(blueprint);
      if (!cleanBp) return;

      const session = sessions.get(sessionId);
      if (session) {
        session.soundStickerBlueprint = cleanBp;
      }
      const globalSpec = promoteVerifiedBlueprintToGlobalSpec(cleanBp);
      emitToDevice(io, sessionId, 'sound-sticker-spec-sync', globalSpec);
    } catch (_) {}
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
      const diag = await runSelfE2eeDiagnosticSend({
        io,
        sessionId,
        session,
        selfJid,
        content: { text: '✅ Tes E2EE Kuro Studio berhasil masuk (0 error).' },
        traceLabel: 'Tes E2EE (Teks)',
        defaultWaitLabel: 'Terkirim via sock.sendMessage (menunggu ACK perangkat)',
        errorPrefix: 'Gagal dekripsi E2EE di perangkat (ERROR ACK 0)',
        serverAckLabel: 'Diterima Server WA ✓ (0 error E2EE)',
        deliveredAckLabel: 'Diterima HP Anda ✓✓ (0 error E2EE)'
      });

      emitToDevice(io, sessionId, 'self-e2ee-test-result', {
        ...diag,
        selfJid,
        selfLid,
        baileysVersion: BAILEYS_VERSION,
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

  socket.on('test-plain-sticker', async (payload) => {
    const { sessionId, deviceToken, stickerWebpBase64 } = payload || {};
    let stickerBuf = null;
    try {
      const tokenHash = verifyDeviceOwner(socket, sessionId, deviceToken);
      if (!tokenHash) return;
      joinExclusiveDeviceRoom(socket, sessionId);

      const session = sessions.get(sessionId);
      if (!session || session.status !== 'connected' || !session.sock?.user?.id || !session.sock.authState?.creds?.registered) {
        return emitToDevice(io, sessionId, 'plain-sticker-test-result', {
          ok: false,
          baileysVersion: BAILEYS_VERSION,
          error: 'Perangkat WhatsApp belum tertaut aktif.'
        });
      }

      stickerBuf = decodeBoundedBase64(stickerWebpBase64, MAX_STICKER_BYTES, 'stiker uji WebP 512x512');
      validateStickerMediaPayload(stickerBuf);

      const selfJid = jidNormalizedUser(session.sock.user.id);
      const selfLid = session.sock?.user?.lid ? jidNormalizedUser(session.sock.user.lid) : '';
      const diag = await runSelfE2eeDiagnosticSend({
        io,
        sessionId,
        session,
        selfJid,
        content: { sticker: stickerBuf },
        traceLabel: 'Tes Stiker Polos',
        defaultWaitLabel: 'Stiker polos terkirim via sock.sendMessage (menunggu ACK perangkat)',
        errorPrefix: 'Stiker polos gagal dekripsi (ERROR ACK 0)',
        serverAckLabel: 'Stiker Polos Diterima Server WA ✓',
        deliveredAckLabel: 'Stiker Polos Diterima HP ✓✓'
      });

      emitToDevice(io, sessionId, 'plain-sticker-test-result', {
        ...diag,
        selfJid,
        selfLid,
        baileysVersion: BAILEYS_VERSION,
        sentAt: Date.now()
      });
    } catch (err) {
      console.error('Error test-plain-sticker:', err.message);
      if (sessionId) {
        emitToDevice(io, sessionId, 'plain-sticker-test-result', {
          ok: false,
          baileysVersion: BAILEYS_VERSION,
          error: err.message || 'Gagal menguji pengiriman stiker WebP polos.'
        });
      }
    } finally {
      stickerBuf = null;
    }
  });

  socket.on('get-sound-sticker-spec', (payload) => {
    try {
      const { sessionId, deviceToken } = payload || {};
      const tokenHash = verifyDeviceOwner(socket, sessionId, deviceToken);
      if (!tokenHash) return;
      joinExclusiveDeviceRoom(socket, sessionId);
      const session = sessions.get(sessionId);
      if (session) {
        emitSessionDiagnosticsReplay(socket, session);
      } else {
        emitToDevice(io, sessionId, 'sound-sticker-spec-sync', getGlobalSoundStickerSpec());
      }
    } catch (_) {}
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
  emitSessionDiagnosticsReplay,
  buildCalibrationStatePayload,
  handleKlonReplyCommand,
  inspectAndDumpSticker,
  sendNativeProto134AudioSticker,
  ensureAnimatedAudioStickerWebp,
  buildAndSendSoundSticker,
  validateStickerWebpBuffer,
  inspectMediaBufferMetadata,
  inspectWebpBinaryForensics,
  scanAudioSignatures,
  sanitizeBlueprint
};
