import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4ArrayBufferTarget } from 'mp4-muxer';
import {
  decodeMediaToAudioBuffer,
  renderTrimmedAudioBuffer,
  encodeTrimmedAudio
} from './audioTrimmerEngine.js';

const TEXT_ENCODER = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
const MAX_SAFE_MP4_BYTES = 2.5 * 1024 * 1024;

function encodeUtf8(str) {
  if (TEXT_ENCODER) return TEXT_ENCODER.encode(str);
  const arr = [];
  for (let i = 0; i < str.length; i++) arr.push(str.charCodeAt(i) & 0xff);
  return new Uint8Array(arr);
}

function writeAscii(buf, offset, str) {
  for (let i = 0; i < str.length; i++) buf[offset + i] = str.charCodeAt(i) & 0xff;
}

function writeUint32LE(buf, offset, val) {
  buf[offset] = val & 0xff;
  buf[offset + 1] = (val >>> 8) & 0xff;
  buf[offset + 2] = (val >>> 16) & 0xff;
  buf[offset + 3] = (val >>> 24) & 0xff;
}

function writeUint24LE(buf, offset, val) {
  buf[offset] = val & 0xff;
  buf[offset + 1] = (val >>> 8) & 0xff;
  buf[offset + 2] = (val >>> 16) & 0xff;
}

function readUint32LE(buf, offset) {
  return (buf[offset] | (buf[offset + 1] << 8) | (buf[offset + 2] << 16) | (buf[offset + 3] << 24)) >>> 0;
}

function readFourCC(buf, offset) {
  return String.fromCharCode(buf[offset], buf[offset + 1], buf[offset + 2], buf[offset + 3]);
}

export function validateSourceMediaDimensions(sourceMedia) {
  if (!sourceMedia) {
    throw new Error('Visual foto atau video belum dipilih.');
  }
  const isVideoEl = typeof HTMLVideoElement !== 'undefined' && sourceMedia instanceof HTMLVideoElement;
  if (isVideoEl) {
    if (sourceMedia.readyState < 2 || !sourceMedia.videoWidth || !sourceMedia.videoHeight) {
      throw new Error('Video belum siap dirender (dimensi 0×0). Coba pilih ulang berkas video.');
    }
    return { width: sourceMedia.videoWidth, height: sourceMedia.videoHeight, isVideo: true };
  }
  const w = sourceMedia.naturalWidth || sourceMedia.width || 0;
  const h = sourceMedia.naturalHeight || sourceMedia.height || 0;
  if (!w || !h || (sourceMedia.complete === false)) {
    throw new Error('Gambar belum selesai dimuat atau rusak (dimensi 0×0).');
  }
  return { width: w, height: h, isVideo: false };
}

export function buildRiffChunk(fourCC, payloadBytes) {
  const len = payloadBytes.length;
  const pad = len % 2;
  const chunk = new Uint8Array(8 + len + pad);
  writeAscii(chunk, 0, fourCC);
  writeUint32LE(chunk, 4, len);
  chunk.set(payloadBytes, 8);
  return chunk;
}

export function buildWhatsAppExifPayload({
  packId = 'kuro.sound.sticker',
  packName = 'Kuro Sound Sticker',
  publisher = 'Kuro Studio',
  emojis = ['🎵', '✨']
} = {}) {
  const metadata = {
    'sticker-pack-id': String(packId || 'kuro.sound.sticker').slice(0, 64),
    'sticker-pack-name': String(packName || 'Kuro Sound Sticker').slice(0, 64),
    'sticker-pack-publisher': String(publisher || 'Kuro Studio').slice(0, 64),
    emojis: Array.isArray(emojis) && emojis.length > 0 ? emojis : ['🎵', '✨']
  };
  const jsonBytes = encodeUtf8(JSON.stringify(metadata));

  const header = new Uint8Array([
    0x49, 0x49, 0x2a, 0x00,
    0x08, 0x00, 0x00, 0x00,
    0x01, 0x00,
    0x41, 0x57,
    0x07, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x16, 0x00, 0x00, 0x00
  ]);
  writeUint32LE(header, 14, jsonBytes.length);

  const out = new Uint8Array(header.length + jsonBytes.length);
  out.set(header, 0);
  out.set(jsonBytes, header.length);
  return out;
}

export function parseWebPChunks(webpBytes) {
  if (!webpBytes || webpBytes.length < 12) {
    throw new Error('Data WebP terlalu pendek.');
  }
  if (readFourCC(webpBytes, 0) !== 'RIFF' || readFourCC(webpBytes, 8) !== 'WEBP') {
    throw new Error('Header RIFF/WEBP tidak valid.');
  }

  const chunks = [];
  let offset = 12;
  while (offset + 8 <= webpBytes.length) {
    const fourCC = readFourCC(webpBytes, offset);
    const size = readUint32LE(webpBytes, offset + 4);
    const dataStart = offset + 8;
    const dataEnd = Math.min(webpBytes.length, dataStart + size);
    chunks.push({
      fourCC,
      size,
      data: webpBytes.subarray(dataStart, dataEnd)
    });
    offset = dataStart + size + (size % 2);
  }
  return chunks;
}

function concatUint8Arrays(parts) {
  const totalLen = parts.reduce((acc, p) => acc + p.length, 0);
  const merged = new Uint8Array(totalLen);
  let pos = 0;
  for (const p of parts) {
    merged.set(p, pos);
    pos += p.length;
  }
  return merged;
}

function assembleRiffWebp(chunkBuffers) {
  const body = concatUint8Arrays(chunkBuffers);
  const riff = new Uint8Array(12 + body.length);
  writeAscii(riff, 0, 'RIFF');
  writeUint32LE(riff, 4, 4 + body.length);
  writeAscii(riff, 8, 'WEBP');
  riff.set(body, 12);
  return riff;
}

export function validateWaWebpBinary(webpBytes, { expectAnimated, enforceStaticCap = false } = {}) {
  if (!webpBytes || webpBytes.length < 30) {
    throw new Error('Berkas WebP terlalu pendek atau tidak lengkap.');
  }
  if (readFourCC(webpBytes, 0) !== 'RIFF' || readFourCC(webpBytes, 8) !== 'WEBP') {
    throw new Error('Header RIFF/WEBP tidak valid.');
  }
  const declaredSize = readUint32LE(webpBytes, 4);
  if (declaredSize !== webpBytes.length - 8) {
    throw new Error('Ukuran header RIFF WebP tidak cocok dengan panjang biner.');
  }
  if (webpBytes.length % 2 !== 0) {
    throw new Error('Total byte WebP harus genap per spesifikasi RIFF.');
  }

  const chunks = [];
  let offset = 12;
  while (offset + 8 <= webpBytes.length) {
    const fourCC = readFourCC(webpBytes, offset);
    const size = readUint32LE(webpBytes, offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + size;
    if (dataEnd > webpBytes.length) {
      throw new Error(`Chunk ${fourCC} melampaui batas panjang file WebP.`);
    }
    chunks.push({ fourCC, size, data: webpBytes.subarray(dataStart, dataEnd) });
    offset = dataEnd + (size % 2);
  }
  if (offset !== webpBytes.length) {
    throw new Error('Trailing padding WebP RIFF tidak konsisten.');
  }

  const vp8x = chunks.find((c) => c.fourCC === 'VP8X');
  if (!vp8x || vp8x !== chunks[0] || vp8x.data.length < 10) {
    throw new Error('Stiker WebP wajib diawali header Extended VP8X 10 byte.');
  }
  const vp8xFlags = vp8x.data[0];
  const vp8xWidth = (vp8x.data[4] | (vp8x.data[5] << 8) | (vp8x.data[6] << 16)) + 1;
  const vp8xHeight = (vp8x.data[7] | (vp8x.data[8] << 8) | (vp8x.data[9] << 16)) + 1;
  if (vp8xWidth !== 512 || vp8xHeight !== 512 || (vp8xFlags & 0x08) === 0) {
    throw new Error('Header VP8X wajib berukuran 512x512 dengan flag EXIF aktif.');
  }

  const exif = chunks.find((c) => c.fourCC === 'EXIF');
  if (!exif || exif.data.length < 24) {
    throw new Error('Chunk EXIF WhatsApp tidak lengkap.');
  }
  const hasTiffMagic =
    exif.data[0] === 0x49 &&
    exif.data[1] === 0x49 &&
    exif.data[2] === 0x2a &&
    exif.data[3] === 0x00 &&
    exif.data[10] === 0x41 &&
    exif.data[11] === 0x57;
  if (!hasTiffMagic) {
    throw new Error('Header TIFF EXIF WhatsApp tidak valid.');
  }

  const hasAnim = chunks.some((c) => c.fourCC === 'ANIM');
  const hasAnmf = chunks.some((c) => c.fourCC === 'ANMF');
  const isAnimated = hasAnim || hasAnmf;

  if (expectAnimated === true && (!hasAnim || !hasAnmf || (vp8xFlags & 0x02) === 0)) {
    throw new Error('Stiker animasi wajib memiliki flag ANIM, chunk ANIM, dan minimal 1 frame ANMF.');
  }
  if (isAnimated && webpBytes.length > 480 * 1024) {
    throw new Error(`Ukuran WebP animasi (${(webpBytes.length / 1024).toFixed(1)} KB) melebihi batas aman 480 KB.`);
  }
  if (!isAnimated && enforceStaticCap && webpBytes.length > 100 * 1024) {
    throw new Error(`Ukuran WebP statis (${(webpBytes.length / 1024).toFixed(1)} KB) melebihi target 100 KB.`);
  }

  return chunks;
}

export function verifyWebpRiffIntegrity(webpBytes) {
  return validateWaWebpBinary(webpBytes);
}

export function injectExifIntoStaticWebp(webpBytes, meta = {}) {
  const chunks = parseWebPChunks(webpBytes);
  const imageChunks = chunks.filter(
    (c) => c.fourCC === 'ALPH' || c.fourCC === 'VP8 ' || c.fourCC === 'VP8L'
  );
  if (imageChunks.length === 0) {
    throw new Error('Payload frame gambar WebP tidak ditemukan.');
  }

  const hasAlpha = imageChunks.some(
    (c) => c.fourCC === 'ALPH' || (c.fourCC === 'VP8L' && c.data.length >= 5 && (c.data[4] & 0x10) !== 0)
  );
  const vp8xPayload = new Uint8Array(10);
  vp8xPayload[0] = (hasAlpha ? 0x10 : 0x00) | 0x08;
  writeUint24LE(vp8xPayload, 4, 511);
  writeUint24LE(vp8xPayload, 7, 511);

  const exifPayload = buildWhatsAppExifPayload(meta);

  const out = assembleRiffWebp([
    buildRiffChunk('VP8X', vp8xPayload),
    ...imageChunks.map((c) => buildRiffChunk(c.fourCC, c.data)),
    buildRiffChunk('EXIF', exifPayload)
  ]);
  verifyWebpRiffIntegrity(out);
  return out;
}

export function injectWhatsAppExifToWebp(webpBytes, packName = 'Kuro Sound Sticker', publisher = 'Kuro Studio') {
  return injectExifIntoStaticWebp(webpBytes, { packName, publisher });
}

export function muxAnimatedWebp(framesPayload = [], meta = {}) {
  if (!Array.isArray(framesPayload) || framesPayload.length === 0) {
    throw new Error('Minimal 1 frame diperlukan untuk membuat stiker animasi WebP.');
  }

  let hasAlpha = false;
  const anmfChunks = [];

  for (const frame of framesPayload) {
    const parsed = parseWebPChunks(frame.webpBytes);
    const subChunks = parsed.filter(
      (c) => c.fourCC === 'ALPH' || c.fourCC === 'VP8 ' || c.fourCC === 'VP8L'
    );
    if (subChunks.length === 0) continue;
    if (subChunks.some((c) => c.fourCC === 'ALPH' || (c.fourCC === 'VP8L' && c.data.length >= 5 && (c.data[4] & 0x10) !== 0))) {
      hasAlpha = true;
    }

    const encodedSub = concatUint8Arrays(subChunks.map((c) => buildRiffChunk(c.fourCC, c.data)));
    const header = new Uint8Array(16);
    writeUint24LE(header, 0, 0);
    writeUint24LE(header, 3, 0);
    writeUint24LE(header, 6, 511);
    writeUint24LE(header, 9, 511);
    writeUint24LE(header, 12, Math.max(20, Math.round(frame.durationMs || 83)));
    header[15] = 0x03;

    const anmfPayload = concatUint8Arrays([header, encodedSub]);
    anmfChunks.push(buildRiffChunk('ANMF', anmfPayload));
  }

  if (anmfChunks.length === 0) {
    throw new Error('Gagal merakit frame ANMF stiker WebP.');
  }

  const vp8xPayload = new Uint8Array(10);
  vp8xPayload[0] = (hasAlpha ? 0x10 : 0x00) | 0x08 | 0x02;
  writeUint24LE(vp8xPayload, 4, 511);
  writeUint24LE(vp8xPayload, 7, 511);

  const animPayload = new Uint8Array([0, 0, 0, 0, 0, 0]);
  const exifPayload = buildWhatsAppExifPayload(meta);

  const out = assembleRiffWebp([
    buildRiffChunk('VP8X', vp8xPayload),
    buildRiffChunk('ANIM', animPayload),
    ...anmfChunks,
    buildRiffChunk('EXIF', exifPayload)
  ]);
  verifyWebpRiffIntegrity(out);
  return out;
}

/**
 * Renderer Kotak 512x512 Terpadu (Dipakai oleh Live Preview Stiker Suara WA & Kompositor WebP)
 */
export function renderStickerCanvasFrame(ctx, sourceMedia, options = {}, tSec = 0) {
  if (!ctx) return;
  const size = 512;
  const {
    cropMode = 'cover', // 'cover' | 'contain'
    bgStyle = 'solid', // 'solid' | 'blur' | 'transparent'
    bgColor = '#111827',
    motionEffect = 'static', // 'static' | 'zoom' | 'bounce' | 'wobble'
    stickerText = '',
    textPosition = 'bottom', // 'bottom' | 'middle' | 'top'
    textSize = 46,
    audioPulse = 0
  } = options;

  ctx.clearRect(0, 0, size, size);

  if (sourceMedia) {
    const mediaW = sourceMedia.videoWidth || sourceMedia.naturalWidth || sourceMedia.width || 0;
    const mediaH = sourceMedia.videoHeight || sourceMedia.naturalHeight || sourceMedia.height || 0;
    if (mediaW > 0 && mediaH > 0) {
      if (cropMode === 'contain' && bgStyle === 'blur') {
        ctx.save();
        const fillScale = Math.max(size / mediaW, size / mediaH) * 1.12;
        const bgW = mediaW * fillScale;
        const bgH = mediaH * fillScale;
        ctx.filter = 'blur(18px) brightness(0.68)';
        ctx.drawImage(sourceMedia, (size - bgW) * 0.5, (size - bgH) * 0.5, bgW, bgH);
        ctx.restore();
      } else if (bgStyle === 'solid') {
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, size, size);
      }

      const baseScale = cropMode === 'contain'
        ? Math.min(size / mediaW, size / mediaH)
        : Math.max(size / mediaW, size / mediaH);

      let extraScale = 1;
      let rotRad = 0;
      let tx = 0;
      let ty = 0;

      if (motionEffect === 'zoom') {
        extraScale = 1 + 0.08 * (0.5 - 0.5 * Math.cos(tSec * 2.0));
      } else if (motionEffect === 'bounce') {
        const pulse = Math.max(Math.abs(Math.sin(tSec * Math.PI * 2.4)) * 0.06, audioPulse * 0.09);
        extraScale = 1 + pulse;
        ty = -pulse * 36;
      } else if (motionEffect === 'wobble') {
        rotRad = Math.sin(tSec * 7.0) * 0.08;
        tx = Math.cos(tSec * 5.6) * 8;
        extraScale = 1.04;
      }

      const drawW = mediaW * baseScale * extraScale;
      const drawH = mediaH * baseScale * extraScale;

      ctx.save();
      ctx.translate(size * 0.5 + tx, size * 0.5 + ty);
      if (rotRad !== 0) ctx.rotate(rotRad);
      ctx.drawImage(sourceMedia, -drawW * 0.5, -drawH * 0.5, drawW, drawH);
      ctx.restore();
    }
  } else if (bgStyle === 'solid') {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, size, size);
  }

  // Teks meme khas stiker WA (Kapital tebal, isi putih, outline hitam >= 6px, drop shadow)
  const cleanText = String(stickerText || '').trim().toUpperCase();
  if (cleanText) {
    ctx.save();
    const lines = cleanText.split(/\r?\n/).slice(0, 2);
    const safeFontSize = Math.max(26, Math.min(68, Number(textSize) || 46));
    ctx.font = `900 ${safeFontSize}px Impact, "Arial Black", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;

    const lineStep = safeFontSize * 1.12;
    let startY = size - 44 - (lines.length - 1) * lineStep;
    if (textPosition === 'top') {
      startY = 46;
    } else if (textPosition === 'middle') {
      startY = size * 0.5 - ((lines.length - 1) * lineStep) * 0.5;
    }

    const outlineWidth = Math.max(6, Math.round(safeFontSize * 0.22));
    lines.forEach((line, idx) => {
      const y = startY + idx * lineStep;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.72)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 3;
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = outlineWidth;
      ctx.strokeText(line, size * 0.5, y, size - 32);

      ctx.shadowColor = 'transparent';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(line, size * 0.5, y, size - 32);
    });
    ctx.restore();
  }
}

async function canvasToWebpBytes(canvas, quality) {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
  if (!blob) throw new Error('Browser gagal mengekspor kanvas ke format WebP.');
  const buf = await blob.arrayBuffer();
  return new Uint8Array(buf);
}

/**
 * Buat Blob Stiker WebP 512x512 (Statis/Animasi) dengan WhatsApp EXIF
 */
export async function buildWaWebpStickerBlob({
  sourceMedia,
  isAnimated = false,
  durationSec = 3,
  renderOptions = {},
  packMeta = {},
  onProgress
}) {
  const { isVideo: isVideoEl } = validateSourceMediaDimensions(sourceMedia);
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d', { alpha: true });

  const needsAnim = Boolean(isAnimated && (isVideoEl || renderOptions.motionEffect !== 'static'));

  if (!needsAnim) {
    const staticQualities = [0.85, 0.72, 0.58, 0.44, 0.30, 0.20];
    let bestStaticBytes = null;
    for (let i = 0; i < staticQualities.length; i++) {
      renderStickerCanvasFrame(ctx, sourceMedia, renderOptions, 0);
      const rawBytes = await canvasToWebpBytes(canvas, staticQualities[i]);
      const finalBytes = injectExifIntoStaticWebp(rawBytes, packMeta);
      bestStaticBytes = finalBytes;
      if (finalBytes.byteLength <= 100 * 1024) break;
    }
    validateWaWebpBinary(bestStaticBytes, { expectAnimated: false, enforceStaticCap: true });
    onProgress?.(100);
    return new Blob([bestStaticBytes], { type: 'image/webp' });
  }

  const clampedDur = Math.max(1, Math.min(5.0, Number(durationSec) || 3));
  const videoTotalDur = isVideoEl && Number.isFinite(sourceMedia.duration) && sourceMedia.duration > 0
    ? sourceMedia.duration
    : clampedDur;

  const MAX_ANIM_TARGET_BYTES = 480 * 1024;
  const encodePasses = [
    { fps: 10, quality: 0.70, maxDur: 5.0 },
    { fps: 8, quality: 0.55, maxDur: 4.5 },
    { fps: 6, quality: 0.42, maxDur: 3.8 },
    { fps: 5, quality: 0.30, maxDur: 2.8 }
  ];
  let bestBlob = null;

  for (let pIdx = 0; pIdx < encodePasses.length; pIdx++) {
    const pass = encodePasses[pIdx];
    const passDur = Math.min(clampedDur, pass.maxDur);
    const totalFrames = Math.max(4, Math.round(passDur * pass.fps));
    const frameDurationMs = Math.round(1000 / pass.fps);
    const frames = [];

    for (let i = 0; i < totalFrames; i++) {
      const tSec = i / pass.fps;
      if (isVideoEl) {
        const seekTime = videoTotalDur > 0.1 ? (tSec % videoTotalDur) : 0;
        await new Promise((resolve) => {
          let done = false;
          const finish = () => {
            if (!done) {
              done = true;
              sourceMedia.removeEventListener('seeked', finish);
              resolve();
            }
          };
          sourceMedia.addEventListener('seeked', finish, { once: true });
          sourceMedia.currentTime = seekTime;
          setTimeout(finish, 180);
        });
      }

      renderStickerCanvasFrame(ctx, sourceMedia, renderOptions, tSec);
      const webpBytes = await canvasToWebpBytes(canvas, pass.quality);
      frames.push({ webpBytes, durationMs: frameDurationMs });
      onProgress?.(Math.min(95, Math.round(((i + 1) / totalFrames) * 85)));
    }

    const muxed = muxAnimatedWebp(frames, packMeta);
    bestBlob = new Blob([muxed], { type: 'image/webp' });
    if (bestBlob.size <= MAX_ANIM_TARGET_BYTES) {
      validateWaWebpBinary(muxed, { expectAnimated: true });
      break;
    }
  }

  if (!bestBlob || bestBlob.size <= 200) {
    throw new Error('Hasil stiker WebP kosong atau gagal dikodekan.');
  }
  if (bestBlob.size > 480 * 1024) {
    const kb = (bestBlob.size / 1024).toFixed(0);
    throw new Error(`Ukuran stiker animasi (${kb} KB) masih melebihi batas aman 480 KB WhatsApp. Potong durasi menjadi 2-3 detik.`);
  }

  onProgress?.(100);
  return bestBlob;
}

function sanitizeVideoMeta(meta) {
  if (!meta || !meta.decoderConfig) return meta;
  const dc = meta.decoderConfig;
  const rawCs = dc.colorSpace;
  if (rawCs === null || typeof rawCs !== 'object') {
    const { colorSpace: _omit, ...restDc } = dc;
    return { ...meta, decoderConfig: restDc };
  }
  const safeCs = {
    primaries: rawCs.primaries || 'bt709',
    transfer: rawCs.transfer || 'bt709',
    matrix: rawCs.matrix || 'bt709',
    fullRange: typeof rawCs.fullRange === 'boolean' ? rawCs.fullRange : false
  };
  return { ...meta, decoderConfig: { ...dc, colorSpace: safeCs } };
}

/**
 * Kompositor Kontainer Audio+Visual 512x512 Ringan (Untuk jalur muxed apabila blueprint membutuhkan MP4)
 */
export async function composeMuxedStickerContainer({
  sourceMedia,
  trimmedAudioBuffer,
  renderOptions = {},
  onProgress
}) {
  const { isVideo: isVideoEl } = validateSourceMediaDimensions(sourceMedia);
  if (!trimmedAudioBuffer) throw new Error('Audio potongan belum tersedia.');
  if (typeof window.VideoEncoder !== 'function' || typeof window.AudioEncoder !== 'function') {
    throw new Error('WebCodecs encoder belum tersedia di browser ini.');
  }

  const durSec = Math.max(0.5, Math.min(15, trimmedAudioBuffer.duration));
  const fps = 24;
  const bitrate = Math.max(200_000, Math.min(600_000, Math.floor((1.2 * 1024 * 1024 * 8) / durSec) - 96_000));
  const channels = Math.min(2, Math.max(1, trimmedAudioBuffer.numberOfChannels));

  const vSupport = await window.VideoEncoder.isConfigSupported({
    codec: 'avc1.42001f',
    width: 512,
    height: 512,
    bitrate,
    framerate: fps,
    avc: { format: 'avc' }
  });
  const aSupport = await window.AudioEncoder.isConfigSupported({
    codec: 'mp4a.40.2',
    sampleRate: trimmedAudioBuffer.sampleRate,
    numberOfChannels: channels,
    bitrate: 96000
  });
  if (!vSupport?.supported || !aSupport?.supported) {
    throw new Error('Perangkat tidak mendukung encoder H.264/AAC.');
  }

  const target = new Mp4ArrayBufferTarget();
  const muxer = new Mp4Muxer({
    target,
    video: { codec: 'avc', width: 512, height: 512 },
    audio: { codec: 'aac', numberOfChannels: channels, sampleRate: trimmedAudioBuffer.sampleRate },
    fastStart: 'in-memory'
  });

  let videoEncoder = null;
  let audioEncoder = null;

  try {
    videoEncoder = new window.VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, sanitizeVideoMeta(meta)),
      error: () => {}
    });
    videoEncoder.configure(vSupport.config);

    audioEncoder = new window.AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: () => {}
    });
    audioEncoder.configure(aSupport.config);

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d', { alpha: false });
    const totalFrames = Math.max(1, Math.round(durSec * fps));
    const frameUs = Math.round(1_000_000 / fps);
    const srcDur = isVideoEl && Number.isFinite(sourceMedia.duration) && sourceMedia.duration > 0 ? sourceMedia.duration : durSec;

    for (let i = 0; i < totalFrames; i++) {
      const tSec = i / fps;
      if (isVideoEl) {
        await new Promise((resolve) => {
          let done = false;
          const finish = () => {
            if (!done) {
              done = true;
              sourceMedia.removeEventListener('seeked', finish);
              resolve();
            }
          };
          sourceMedia.addEventListener('seeked', finish, { once: true });
          sourceMedia.currentTime = tSec % srcDur;
          setTimeout(finish, 140);
        });
      }
      renderStickerCanvasFrame(ctx, sourceMedia, { ...renderOptions, bgStyle: 'solid' }, tSec);
      const frame = new window.VideoFrame(canvas, { timestamp: Math.round(tSec * 1_000_000), duration: frameUs });
      try {
        videoEncoder.encode(frame, { keyFrame: i % 48 === 0 });
      } finally {
        frame.close();
      }
      if (i % 6 === 0) onProgress?.(Math.min(85, Math.round((i / totalFrames) * 80)));
    }

    const chData = [];
    for (let c = 0; c < channels; c++) {
      chData.push(trimmedAudioBuffer.getChannelData(Math.min(c, trimmedAudioBuffer.numberOfChannels - 1)));
    }
    const totalSamples = trimmedAudioBuffer.length;
    for (let off = 0; off < totalSamples; off += 1024) {
      const count = Math.min(1024, totalSamples - off);
      const planar = new Float32Array(count * channels);
      for (let c = 0; c < channels; c++) planar.set(chData[c].subarray(off, off + count), c * count);
      const ad = new window.AudioData({
        format: 'f32-planar',
        sampleRate: trimmedAudioBuffer.sampleRate,
        numberOfFrames: count,
        numberOfChannels: channels,
        timestamp: Math.round((off / trimmedAudioBuffer.sampleRate) * 1_000_000),
        data: planar
      });
      try {
        audioEncoder.encode(ad);
      } finally {
        ad.close();
      }
    }

    await videoEncoder.flush();
    await audioEncoder.flush();
    muxer.finalize();
    onProgress?.(100);

    const blob = new Blob([target.buffer], { type: 'video/mp4' });
    if (blob.size <= 200 || blob.size > MAX_SAFE_MP4_BYTES) {
      throw new Error('Kontainer stiker melebihi batas 1.5 MB atau kosong.');
    }
    return blob;
  } finally {
    try { videoEncoder?.close?.(); } catch {}
    try { audioEncoder?.close?.(); } catch {}
  }
}

export function arrayBufferToBase64(bufferOrView) {
  if (!bufferOrView) return '';
  const bytes =
    bufferOrView instanceof Uint8Array
      ? bufferOrView
      : ArrayBuffer.isView(bufferOrView)
        ? new Uint8Array(bufferOrView.buffer, bufferOrView.byteOffset, bufferOrView.byteLength)
        : new Uint8Array(bufferOrView);
  if (bytes.byteLength === 0) return '';

  const chunkSize = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function blobToBase64Local(blob) {
  if (blob && typeof blob.arrayBuffer === 'function') {
    return arrayBufferToBase64(await blob.arrayBuffer());
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || '');
      const idx = result.indexOf(',');
      resolve(idx !== -1 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(new Error('Gagal membaca berkas ke base64.'));
    reader.readAsDataURL(blob);
  });
}

export async function loadMediaElementFromFile(file) {
  if (!file) throw new Error('Berkas visual belum dipilih.');
  const mime = String(file.type || '').toLowerCase();
  const isVideo = mime.startsWith('video/') || /\.(mp4|webm|mov|m4v)$/i.test(file.name);
  const objectUrl = URL.createObjectURL(file);

  try {
    if (isVideo) {
      const videoEl = document.createElement('video');
      videoEl.muted = true;
      videoEl.playsInline = true;
      videoEl.crossOrigin = 'anonymous';
      videoEl.preload = 'auto';
      videoEl.src = objectUrl;

      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Waktu muat video habis: ${file.name}`)), 10000);
        videoEl.onloadeddata = () => {
          clearTimeout(timer);
          resolve();
        };
        videoEl.onerror = () => {
          clearTimeout(timer);
          reject(new Error(`Browser gagal memuat video: ${file.name}`));
        };
      });

      validateSourceMediaDimensions(videoEl);
      return { mediaEl: videoEl, objectUrl, isVideo: true };
    }

    const imgEl = new Image();
    imgEl.crossOrigin = 'anonymous';
    imgEl.src = objectUrl;
    await new Promise((resolve, reject) => {
      imgEl.onload = resolve;
      imgEl.onerror = () => reject(new Error(`Gagal memuat foto: ${file.name}`));
    });
    if (imgEl.decode) {
      await imgEl.decode().catch(() => {});
    }
    validateSourceMediaDimensions(imgEl);
    return { mediaEl: imgEl, objectUrl, isVideo: false };
  } catch (err) {
    try { URL.revokeObjectURL(objectUrl); } catch {}
    throw err;
  }
}

export function releaseMediaElement(mediaEl, objectUrl) {
  if (typeof HTMLVideoElement !== 'undefined' && mediaEl instanceof HTMLVideoElement) {
    try {
      mediaEl.pause();
      mediaEl.removeAttribute('src');
      mediaEl.load();
    } catch {}
  }
  if (objectUrl) {
    try { URL.revokeObjectURL(objectUrl); } catch {}
  }
}

export function createSquareThumbnailDataUrl(sourceMedia, renderOptions = {}) {
  try {
    validateSourceMediaDimensions(sourceMedia);
    const fullCanvas = document.createElement('canvas');
    fullCanvas.width = 512;
    fullCanvas.height = 512;
    const fullCtx = fullCanvas.getContext('2d', { alpha: true });
    renderStickerCanvasFrame(fullCtx, sourceMedia, renderOptions, 0);

    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = 160;
    thumbCanvas.height = 160;
    const thumbCtx = thumbCanvas.getContext('2d', { alpha: true });
    thumbCtx.drawImage(fullCanvas, 0, 0, 160, 160);
    return thumbCanvas.toDataURL('image/webp', 0.72);
  } catch {
    return '';
  }
}

async function composeViaMediaRecorderFallback({ sourceMedia, trimmedAudioBuffer, renderOptions, onProgress }) {
  if (typeof window.MediaRecorder !== 'function') {
    throw new Error('Browser tidak mendukung MediaRecorder maupun WebCodecs.');
  }
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) throw new Error('AudioContext tidak tersedia.');

  const durSec = Math.max(0.5, Math.min(12, trimmedAudioBuffer.duration));
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d', { alpha: false });

  const stream = canvas.captureStream(24);
  const audioCtx = new AudioCtx();
  const dest = audioCtx.createMediaStreamDestination();
  const srcNode = audioCtx.createBufferSource();
  srcNode.buffer = trimmedAudioBuffer;
  srcNode.connect(dest);

  const combined = new MediaStream([
    ...stream.getVideoTracks(),
    ...dest.stream.getAudioTracks()
  ]);

  const mimeType = window.MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
    ? 'video/webm;codecs=vp8,opus'
    : 'video/webm';

  let rafId = 0;
  let recorder = null;
  try {
    const chunks = [];
    recorder = new window.MediaRecorder(combined, { mimeType, videoBitsPerSecond: 450_000 });
    const donePromise = new Promise((resolve, reject) => {
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => resolve();
      recorder.onerror = (ev) => reject(ev?.error || new Error('MediaRecorder gagal.'));
    });

    if (audioCtx.state === 'suspended') await audioCtx.resume();
    recorder.start(200);
    srcNode.start(0);

    const startWall = performance.now();
    const isVideoEl = typeof HTMLVideoElement !== 'undefined' && sourceMedia instanceof HTMLVideoElement;
    if (isVideoEl) {
      try {
        sourceMedia.muted = true;
        sourceMedia.currentTime = 0;
        await sourceMedia.play();
      } catch {}
    }

    await new Promise((resolve) => {
      const step = () => {
        const elapsed = (performance.now() - startWall) / 1000;
        renderStickerCanvasFrame(ctx, sourceMedia, { ...renderOptions, bgStyle: 'solid' }, elapsed);
        onProgress?.(Math.min(92, Math.round((elapsed / durSec) * 90)));
        if (elapsed >= durSec) {
          resolve();
          return;
        }
        rafId = requestAnimationFrame(step);
      };
      rafId = requestAnimationFrame(step);
    });

    if (recorder.state === 'recording') recorder.stop();
    await donePromise;
    onProgress?.(100);
    return new Blob(chunks, { type: mimeType.split(';')[0] });
  } finally {
    if (rafId) cancelAnimationFrame(rafId);
    try { srcNode.stop(); } catch {}
    try { combined.getTracks().forEach((t) => t.stop()); } catch {}
    try { await audioCtx.close(); } catch {}
  }
}

/**
 * Tahap 1 Kompositor: Gabungkan Visual + Audio menjadi Video 512x512 Bersuara.
 */
export async function composeSoundVideoStage1({
  sourceMedia,
  trimmedAudioBuffer,
  renderOptions = {},
  onProgress
}) {
  try {
    const blob = await composeMuxedStickerContainer({
      sourceMedia,
      trimmedAudioBuffer,
      renderOptions,
      onProgress
    });
    return { blob, mimeType: 'video/mp4', ext: 'mp4', durationSec: trimmedAudioBuffer.duration };
  } catch {
    const blob = await composeViaMediaRecorderFallback({
      sourceMedia,
      trimmedAudioBuffer,
      renderOptions,
      onProgress
    });
    return { blob, mimeType: 'video/webm', ext: 'webm', durationSec: trimmedAudioBuffer.duration };
  }
}

/**
 * Bangkitkan 1 stiker WebP 512x512 polos tervalidasi (untuk Tes Stiker Polos E2EE vs Format).
 */
export async function createPlainTestStickerWebpBase64(packName = 'Kuro E2EE Test', publisher = 'Kuro Studio') {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d', { alpha: true });

  ctx.fillStyle = '#fef08a';
  ctx.fillRect(24, 24, 464, 464);
  ctx.lineWidth = 14;
  ctx.strokeStyle = '#000000';
  ctx.strokeRect(24, 24, 464, 464);
  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 44px system-ui, -apple-system, sans-serif';
  ctx.fillText('KURO E2EE OK', 256, 224);
  ctx.font = '700 24px monospace';
  ctx.fillText('TEST STIKER WEBP', 256, 290);

  const rawBytes = await canvasToWebpBytes(canvas, 0.8);
  const withExif = injectExifIntoStaticWebp(rawBytes, { packName, publisher });
  validateWaWebpBinary(withExif, { expectAnimated: false, enforceStaticCap: true });
  return arrayBufferToBase64(withExif);
}

/**
 * Tahap 2 Kompositor: Siapkan paket Stiker WebP 512x512 + optional audio/muxed container siap kirim WA.
 */
export async function buildStickerSendPayload({ item, blueprint, onProgress }) {
  let loaded = null;
  try {
    if (!item?.visualFile) {
      throw new Error('Berkas visual item antrean tidak tersedia.');
    }

    loaded = await loadMediaElementFromFile(item.visualFile);
    const { mediaEl, isVideo } = loaded;

    let audioBuf = item.audioBuffer || null;
    if (!audioBuf && item.audioFile) {
      audioBuf = await decodeMediaToAudioBuffer(item.audioFile);
    } else if (!audioBuf && isVideo) {
      audioBuf = await decodeMediaToAudioBuffer(item.visualFile).catch(() => null);
    }

    const totalAudioDur = audioBuf ? audioBuf.duration : Number(item.totalDuration) || 5;
    const safeStart = Math.max(0, Number(item.startSec) || 0);
    const safeEnd = Math.max(safeStart + 0.3, Math.min(totalAudioDur, Number(item.endSec) || totalAudioDur));
    const durationSec = Math.max(0.5, Number((safeEnd - safeStart).toFixed(1)));

    const renderOptions = {
      cropMode: item.cropMode || 'cover',
      bgStyle: item.bgStyle || 'solid',
      bgColor: item.bgColor || '#111827',
      motionEffect: isVideo ? 'static' : item.motionEffect || 'static',
      stickerText: item.stickerText || '',
      textPosition: item.textPosition || 'bottom',
      textSize: Number(item.textSize) || 46
    };

    const willAnimate = isVideo || renderOptions.motionEffect !== 'static';
    const webpBlob = await buildWaWebpStickerBlob({
      sourceMedia: mediaEl,
      isAnimated: willAnimate,
      durationSec: Math.min(5, durationSec),
      renderOptions,
      packMeta: { packName: item.packName || 'Kuro Sound Sticker', publisher: item.packPublisher || 'Kuro Studio' },
      onProgress: (p) => onProgress?.(Math.min(72, Math.round(p * 0.72)))
    });

    if (!webpBlob || webpBlob.size <= 200 || webpBlob.size > 1024 * 1024) {
      throw new Error('Ukuran stiker WebP tidak valid atau melebihi batas 1 MB.');
    }

    const stickerWebpBase64 = await blobToBase64Local(webpBlob);
    let audioBase64;
    let audioMime;
    let audioM4aBase64;
    let muxedMp4Base64;
    let muxedWebmBase64;
    let thumbnailJpegBase64;

    try {
      const thumbCanvas = document.createElement('canvas');
      thumbCanvas.width = 256;
      thumbCanvas.height = 256;
      const thumbCtx = thumbCanvas.getContext('2d', { alpha: false });
      renderStickerCanvasFrame(thumbCtx, mediaEl, { ...renderOptions, bgStyle: 'solid' }, 0);
      const dataUrl = thumbCanvas.toDataURL('image/jpeg', 0.65);
      const commaIdx = dataUrl.indexOf(',');
      if (commaIdx !== -1) thumbnailJpegBase64 = dataUrl.slice(commaIdx + 1);
    } catch {}

    // Selalu rakit potongan audio & video 512x512 bersuara saat audio tersedia (Jalur A/B/C)
    let trimmedAudio = null;
    if (audioBuf) {
      trimmedAudio = await renderTrimmedAudioBuffer(audioBuf, {
        startSec: safeStart,
        endSec: safeEnd,
        volume: item.volume ?? 1,
        fadeSmooth: item.fadeSmooth !== false
      });
    }

    if (trimmedAudio) {
      onProgress?.(78);
      try {
        const enc = await encodeTrimmedAudio(trimmedAudio);
        if (enc?.blob && enc.blob.size > 100 && enc.blob.size <= 1024 * 1024) {
          audioBase64 = await blobToBase64Local(enc.blob);
          audioMime = enc.mimeType || 'audio/mp4';
          if (enc.ext === 'm4a') audioM4aBase64 = audioBase64;
        }
      } catch {}

      onProgress?.(86);
      try {
        const muxed = item.stagedMuxedBlob
          ? { blob: item.stagedMuxedBlob, ext: item.stagedMuxedExt || 'mp4' }
          : await composeSoundVideoStage1({ sourceMedia: mediaEl, trimmedAudioBuffer: trimmedAudio, renderOptions });
        if (muxed?.blob && muxed.blob.size > 100 && muxed.blob.size <= 2.5 * 1024 * 1024) {
          const b64 = await blobToBase64Local(muxed.blob);
          if (muxed.ext === 'webm') muxedWebmBase64 = b64;
          else muxedMp4Base64 = b64;
        }
      } catch {}
    }

    onProgress?.(95);
    return {
      queueId: item.id,
      stickerWebpBase64,
      ...(audioBase64 ? { audioBase64, audioMime } : {}),
      ...(audioM4aBase64 ? { audioM4aBase64 } : {}),
      ...(muxedMp4Base64 ? { muxedMp4Base64 } : {}),
      ...(muxedWebmBase64 ? { muxedWebmBase64 } : {}),
      ...(thumbnailJpegBase64 ? { thumbnailJpegBase64 } : {}),
      durationSec,
      isAnimated: willAnimate,
      width: 512,
      height: 512,
      packName: item.packName || 'Kuro Sound Sticker',
      packAuthor: item.packPublisher || 'Kuro Studio',
      blueprint: blueprint || undefined
    };
  } finally {
    if (loaded) {
      releaseMediaElement(loaded.mediaEl, loaded.objectUrl);
    }
  }
}
