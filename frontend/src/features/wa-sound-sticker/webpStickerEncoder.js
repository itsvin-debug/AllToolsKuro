const TEXT_ENCODER = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;

function encodeUtf8(str) {
  if (TEXT_ENCODER) return TEXT_ENCODER.encode(str);
  const arr = [];
  for (let i = 0; i < str.length; i++) {
    arr.push(str.charCodeAt(i) & 0xff);
  }
  return new Uint8Array(arr);
}

function writeAscii(buf, offset, str) {
  for (let i = 0; i < str.length; i++) {
    buf[offset + i] = str.charCodeAt(i) & 0xff;
  }
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
  return (
    buf[offset] |
    (buf[offset + 1] << 8) |
    (buf[offset + 2] << 16) |
    (buf[offset + 3] << 24)
  ) >>> 0;
}

function readFourCC(buf, offset) {
  return String.fromCharCode(buf[offset], buf[offset + 1], buf[offset + 2], buf[offset + 3]);
}

/**
 * Bentuk 1 chunk RIFF dengan panjang data genap terjamin (pad byte 0x00 bila ganjil)
 */
export function buildRiffChunk(fourCC, payloadBytes) {
  const len = payloadBytes.length;
  const pad = len % 2;
  const chunk = new Uint8Array(8 + len + pad);
  writeAscii(chunk, 0, fourCC);
  writeUint32LE(chunk, 4, len);
  chunk.set(payloadBytes, 8);
  return chunk;
}

/**
 * Bangkitkan payload chunk EXIF berstandar resmi WhatsApp Sticker Pack
 */
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

  // Header TIFF IFD standar stiker WhatsApp (tag 0x5741, type UNDEFINED=7, offset=0x16)
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

/**
 * Urai seluruh chunk dari buffer RIFF/WEBP
 */
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

/**
 * Suntikkan chunk EXIF & VP8X pada stiker WebP statis 512x512
 */
export function injectExifIntoStaticWebp(webpBytes, meta = {}) {
  const chunks = parseWebPChunks(webpBytes);
  const imageChunks = chunks.filter(
    (c) => c.fourCC === 'ALPH' || c.fourCC === 'VP8 ' || c.fourCC === 'VP8L'
  );
  if (imageChunks.length === 0) {
    throw new Error('Payload frame gambar WebP tidak ditemukan.');
  }

  const hasAlpha = imageChunks.some((c) => c.fourCC === 'ALPH' || c.fourCC === 'VP8L');
  const vp8xPayload = new Uint8Array(10);
  vp8xPayload[0] = (hasAlpha ? 0x10 : 0x00) | 0x08; // Alpha (L) + EXIF (E)
  writeUint24LE(vp8xPayload, 4, 511);
  writeUint24LE(vp8xPayload, 7, 511);

  const exifPayload = buildWhatsAppExifPayload(meta);

  const outputChunks = [
    buildRiffChunk('VP8X', vp8xPayload),
    ...imageChunks.map((c) => buildRiffChunk(c.fourCC, c.data)),
    buildRiffChunk('EXIF', exifPayload)
  ];

  return assembleRiffWebp(outputChunks);
}

/**
 * Rakit Animated WebP 512x512 + WhatsApp EXIF dari array frame WebP statis
 */
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
    if (subChunks.some((c) => c.fourCC === 'ALPH' || c.fourCC === 'VP8L')) {
      hasAlpha = true;
    }

    const encodedSub = concatUint8Arrays(subChunks.map((c) => buildRiffChunk(c.fourCC, c.data)));
    const header = new Uint8Array(16);
    writeUint24LE(header, 0, 0);
    writeUint24LE(header, 3, 0);
    writeUint24LE(header, 6, 511);
    writeUint24LE(header, 9, 511);
    writeUint24LE(header, 12, Math.max(20, Math.round(frame.durationMs || 83)));
    header[15] = 0x03; // Dispose ke bg + tanpa blend kotor agar bingkai transparan bersih

    const anmfPayload = concatUint8Arrays([header, encodedSub]);
    anmfChunks.push(buildRiffChunk('ANMF', anmfPayload));
  }

  if (anmfChunks.length === 0) {
    throw new Error('Gagal merakit frame ANMF stiker WebP.');
  }

  const vp8xPayload = new Uint8Array(10);
  vp8xPayload[0] = (hasAlpha ? 0x10 : 0x00) | 0x08 | 0x02; // Alpha + EXIF + Animasi
  writeUint24LE(vp8xPayload, 4, 511);
  writeUint24LE(vp8xPayload, 7, 511);

  const animPayload = new Uint8Array([0, 0, 0, 0, 0, 0]);
  const exifPayload = buildWhatsAppExifPayload(meta);

  return assembleRiffWebp([
    buildRiffChunk('VP8X', vp8xPayload),
    buildRiffChunk('ANIM', animPayload),
    ...anmfChunks,
    buildRiffChunk('EXIF', exifPayload)
  ]);
}

function drawRoundedRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Renderer Frame Visual 512x512 Terpadu (Dipakai bersama oleh WebP, Preview Chat WA, & MP4 Video Composer)
 */
export function renderStickerCanvasFrame(ctx, sourceMedia, options = {}, tSec = 0) {
  if (!ctx) return;
  const size = 512;
  const {
    cropMode = 'cover',
    bgStyle = 'transparent',
    bgColor = '#ffffff',
    motionEffect = 'static',
    stickerText = '',
    textPosition = 'bottom',
    audioPulse = 0,
    forVideoBackground = false
  } = options;

  ctx.clearRect(0, 0, size, size);

  // Latar kanvas
  if (bgStyle === 'solid' || (forVideoBackground && bgStyle === 'transparent')) {
    ctx.fillStyle = bgStyle === 'solid' ? bgColor : '#111827';
    ctx.fillRect(0, 0, size, size);
  }

  if (sourceMedia) {
    const mediaW = sourceMedia.videoWidth || sourceMedia.naturalWidth || sourceMedia.width || size;
    const mediaH = sourceMedia.videoHeight || sourceMedia.naturalHeight || sourceMedia.height || size;
    const safeW = Math.max(1, mediaW);
    const safeH = Math.max(1, mediaH);

    const baseScale = cropMode === 'contain'
      ? Math.min(size / safeW, size / safeH)
      : Math.max(size / safeW, size / safeH);

    let extraScale = 1;
    let rotRad = 0;
    let tx = 0;
    let ty = 0;

    if (motionEffect === 'zoom') {
      extraScale = 1 + 0.08 * (0.5 - 0.5 * Math.cos(tSec * 1.8));
    } else if (motionEffect === 'bounce') {
      const pulse = Math.max(Math.abs(Math.sin(tSec * Math.PI * 2.2)) * 0.06, audioPulse * 0.08);
      extraScale = 1 + pulse;
      ty = -pulse * 40;
    } else if (motionEffect === 'wobble') {
      rotRad = Math.sin(tSec * 6.5) * 0.075;
      tx = Math.cos(tSec * 5.2) * 8;
      extraScale = 1.03;
    }

    const drawW = safeW * baseScale * extraScale;
    const drawH = safeH * baseScale * extraScale;

    ctx.save();
    if (cropMode === 'cover' && bgStyle === 'transparent' && !forVideoBackground) {
      // Sudut sedikit membulat rapi agar stiker cover foto tampak bersih seperti stiker WA
      drawRoundedRectPath(ctx, 8, 8, size - 16, size - 16, 40);
      ctx.clip();
    }
    ctx.translate(size * 0.5 + tx, size * 0.5 + ty);
    if (rotRad !== 0) ctx.rotate(rotRad);
    ctx.drawImage(sourceMedia, -drawW * 0.5, -drawH * 0.5, drawW, drawH);
    ctx.restore();
  }

  // Teks stiker tebal khas WhatsApp (isi putih dengan outline hitam)
  const cleanText = String(stickerText || '').trim();
  if (cleanText) {
    ctx.save();
    const lines = cleanText.split(/\r?\n/).slice(0, 2);
    const maxLen = Math.max(...lines.map((l) => l.length));
    const fontSize = maxLen > 18 ? 34 : maxLen > 12 ? 42 : 50;
    ctx.font = `900 ${fontSize}px Impact, "Arial Black", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;

    const lineStep = fontSize * 1.12;
    const startY = textPosition === 'top'
      ? 46 + ((lines.length - 1) * lineStep) * 0.1
      : size - 46 - (lines.length - 1) * lineStep;

    lines.forEach((line, idx) => {
      const y = startY + idx * lineStep;
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = Math.max(7, Math.round(fontSize * 0.22));
      ctx.strokeText(line, size * 0.5, y, size - 36);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(line, size * 0.5, y, size - 36);
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
 * Buat Blob Stiker WebP (Statis atau Animasi) 512x512 dengan EXIF Pack WhatsApp & batas aman <= 500 KB
 */
export async function buildWaWebpStickerBlob({
  sourceMedia,
  isAnimated = false,
  durationSec = 3,
  renderOptions = {},
  packMeta = {},
  onProgress
}) {
  if (!sourceMedia) throw new Error('Visual foto atau video belum dimuat.');
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d', { alpha: true });

  const isVideoEl = typeof HTMLVideoElement !== 'undefined' && sourceMedia instanceof HTMLVideoElement;
  const needsAnim = Boolean(isAnimated && (isVideoEl || renderOptions.motionEffect !== 'static'));

  if (!needsAnim) {
    renderStickerCanvasFrame(ctx, sourceMedia, renderOptions, 0);
    const rawBytes = await canvasToWebpBytes(canvas, 0.88);
    const finalBytes = injectExifIntoStaticWebp(rawBytes, packMeta);
    onProgress?.(100);
    return new Blob([finalBytes], { type: 'image/webp' });
  }

  const fps = 12;
  const clampedDur = Math.max(1, Math.min(5.5, Number(durationSec) || 3));
  const totalFrames = Math.max(6, Math.round(clampedDur * fps));
  const frameDurationMs = Math.round(1000 / fps);
  const videoTotalDur = isVideoEl && Number.isFinite(sourceMedia.duration) && sourceMedia.duration > 0
    ? sourceMedia.duration
    : clampedDur;

  const qualities = [0.78, 0.62, 0.45, 0.34];
  let bestBlob = null;

  for (let qIdx = 0; qIdx < qualities.length; qIdx++) {
    const q = qualities[qIdx];
    const stepStride = qIdx === qualities.length - 1 && totalFrames > 28 ? 2 : 1;
    const frames = [];

    for (let i = 0; i < totalFrames; i += stepStride) {
      const tSec = i / fps;
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
      const webpBytes = await canvasToWebpBytes(canvas, q);
      frames.push({ webpBytes, durationMs: frameDurationMs * stepStride });
      onProgress?.(Math.min(95, Math.round(((i + 1) / totalFrames) * 85)));
    }

    const muxed = muxAnimatedWebp(frames, packMeta);
    bestBlob = new Blob([muxed], { type: 'image/webp' });
    if (bestBlob.size <= 500 * 1024) {
      break;
    }
  }

  onProgress?.(100);
  return bestBlob;
}
