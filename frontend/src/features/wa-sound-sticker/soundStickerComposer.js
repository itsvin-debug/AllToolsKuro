import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4ArrayBufferTarget } from 'mp4-muxer';

const TEXT_ENCODER = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
const MAX_SAFE_MP4_BYTES = 4.5 * 1024 * 1024;

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
  vp8xPayload[0] = (hasAlpha ? 0x10 : 0x00) | 0x08;
  writeUint24LE(vp8xPayload, 4, 511);
  writeUint24LE(vp8xPayload, 7, 511);

  const exifPayload = buildWhatsAppExifPayload(meta);

  return assembleRiffWebp([
    buildRiffChunk('VP8X', vp8xPayload),
    ...imageChunks.map((c) => buildRiffChunk(c.fourCC, c.data)),
    buildRiffChunk('EXIF', exifPayload)
  ]);
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

  return assembleRiffWebp([
    buildRiffChunk('VP8X', vp8xPayload),
    buildRiffChunk('ANIM', animPayload),
    ...anmfChunks,
    buildRiffChunk('EXIF', exifPayload)
  ]);
}

/**
 * Renderer Kotak 512x512 Terpadu (Dipakai bersama oleh Preview Chat WA, MP4 Composer, & WebP)
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
    textSize = 46, // 28..64
    audioPulse = 0,
    forVideoBackground = false
  } = options;

  ctx.clearRect(0, 0, size, size);

  if (sourceMedia) {
    const mediaW = sourceMedia.videoWidth || sourceMedia.naturalWidth || sourceMedia.width || size;
    const mediaH = sourceMedia.videoHeight || sourceMedia.naturalHeight || sourceMedia.height || size;
    const safeW = Math.max(1, mediaW);
    const safeH = Math.max(1, mediaH);

    // Latar kotak bila mode Fit (Contain) atau video opaque
    if (cropMode === 'contain' && bgStyle === 'blur') {
      ctx.save();
      const fillScale = Math.max(size / safeW, size / safeH) * 1.12;
      const bgW = safeW * fillScale;
      const bgH = safeH * fillScale;
      ctx.filter = 'blur(18px) brightness(0.68)';
      ctx.drawImage(sourceMedia, (size - bgW) * 0.5, (size - bgH) * 0.5, bgW, bgH);
      ctx.restore();
    } else if (bgStyle === 'solid' || (forVideoBackground && bgStyle === 'transparent')) {
      ctx.fillStyle = bgStyle === 'solid' ? bgColor : '#111827';
      ctx.fillRect(0, 0, size, size);
    }

    const baseScale = cropMode === 'contain'
      ? Math.min(size / safeW, size / safeH)
      : Math.max(size / safeW, size / safeH);

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

    const drawW = safeW * baseScale * extraScale;
    const drawH = safeH * baseScale * extraScale;

    ctx.save();
    ctx.translate(size * 0.5 + tx, size * 0.5 + ty);
    if (rotRad !== 0) ctx.rotate(rotRad);
    ctx.drawImage(sourceMedia, -drawW * 0.5, -drawH * 0.5, drawW, drawH);
    ctx.restore();
  } else if (forVideoBackground || bgStyle === 'solid') {
    ctx.fillStyle = bgStyle === 'solid' ? bgColor : '#111827';
    ctx.fillRect(0, 0, size, size);
  }

  // Teks meme khas stiker WA (Kapital tebal, isi #ffffff, outline hitam >= 6px, drop shadow)
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
 * Buat Blob Stiker WebP (Statis atau Animasi) 512x512 dengan EXIF WhatsApp
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
    if (bestBlob.size <= 500 * 1024) break;
  }

  onProgress?.(100);
  return bestBlob;
}

function computePerFrameAudioEnvelope(audioBuffer, frameCount) {
  const levels = new Array(frameCount).fill(0);
  if (!audioBuffer || audioBuffer.length === 0) return levels;
  const ch = audioBuffer.getChannelData(0);
  const blockSize = Math.max(1, Math.floor(ch.length / frameCount));
  let maxVal = 0.001;

  for (let f = 0; f < frameCount; f++) {
    const start = f * blockSize;
    const end = Math.min(ch.length, start + blockSize);
    const step = Math.max(1, Math.floor((end - start) / 48));
    let sum = 0;
    let cnt = 0;
    for (let i = start; i < end; i += step) {
      sum += Math.abs(ch[i] || 0);
      cnt++;
    }
    const avg = cnt > 0 ? sum / cnt : 0;
    levels[f] = avg;
    if (avg > maxVal) maxVal = avg;
  }
  return levels.map((v) => Math.min(1, v / maxVal));
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
  return {
    ...meta,
    decoderConfig: {
      ...dc,
      colorSpace: safeCs
    }
  };
}

async function selectSupportedVideoConfig(width, height, fps, bitrate) {
  if (typeof window === 'undefined' || typeof window.VideoEncoder !== 'function' || typeof window.VideoFrame !== 'function') {
    return null;
  }
  const codecs = ['avc1.42001f', 'avc1.4d002a', 'avc1.420028', 'avc1.64001f'];
  const accelModes = ['prefer-hardware', 'no-preference', 'prefer-software'];
  for (const hardwareAcceleration of accelModes) {
    for (const codec of codecs) {
      try {
        const cfg = {
          codec,
          width,
          height,
          bitrate,
          framerate: fps,
          hardwareAcceleration,
          avc: { format: 'avc' },
          latencyMode: 'quality'
        };
        const res = await window.VideoEncoder.isConfigSupported(cfg);
        if (res?.supported) return res.config || cfg;
      } catch {}
    }
  }
  return null;
}

async function selectSupportedAudioConfig(sampleRate, numberOfChannels) {
  if (typeof window === 'undefined' || typeof window.AudioEncoder !== 'function' || typeof window.AudioData !== 'function') {
    return null;
  }
  const candidates = [
    { codec: 'mp4a.40.2', sampleRate, numberOfChannels, bitrate: 96000 },
    { codec: 'mp4a.40.2', sampleRate: 44100, numberOfChannels, bitrate: 96000 }
  ];
  for (const cfg of candidates) {
    try {
      const res = await window.AudioEncoder.isConfigSupported(cfg);
      if (res?.supported) return res.config || cfg;
    } catch {}
  }
  return null;
}

async function encodeMp4WebCodecs({
  sourceMedia,
  trimmedAudioBuffer,
  renderOptions,
  fps,
  videoBitrate,
  onProgress
}) {
  const durSec = Math.max(0.5, Math.min(30, trimmedAudioBuffer.duration));
  const numberOfChannels = Math.min(2, Math.max(1, trimmedAudioBuffer.numberOfChannels));
  const vCfg = await selectSupportedVideoConfig(512, 512, fps, videoBitrate);
  const aCfg = await selectSupportedAudioConfig(trimmedAudioBuffer.sampleRate, numberOfChannels);
  if (!vCfg || !aCfg) return null;

  const target = new Mp4ArrayBufferTarget();
  const muxer = new Mp4Muxer({
    target,
    video: { codec: 'avc', width: 512, height: 512 },
    audio: { codec: 'aac', numberOfChannels: aCfg.numberOfChannels, sampleRate: aCfg.sampleRate },
    fastStart: 'in-memory'
  });

  let encodeError = null;
  const videoEncoder = new window.VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, sanitizeVideoMeta(meta)),
    error: (e) => { encodeError = e; }
  });
  videoEncoder.configure(vCfg);

  const audioEncoder = new window.AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (e) => { encodeError = e; }
  });
  audioEncoder.configure(aCfg);

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d', { alpha: false });

  const isVideoEl = typeof HTMLVideoElement !== 'undefined' && sourceMedia instanceof HTMLVideoElement;
  const srcVideoDur = isVideoEl && Number.isFinite(sourceMedia.duration) && sourceMedia.duration > 0
    ? sourceMedia.duration
    : durSec;

  const totalFrames = Math.max(1, Math.round(durSec * fps));
  const levels = computePerFrameAudioEnvelope(trimmedAudioBuffer, totalFrames);
  const frameDurationUs = Math.round(1_000_000 / fps);

  for (let i = 0; i < totalFrames; i++) {
    if (encodeError) break;
    const tSec = i / fps;
    if (isVideoEl) {
      const targetT = srcVideoDur > 0.1 ? (tSec % srcVideoDur) : 0;
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
        sourceMedia.currentTime = targetT;
        setTimeout(finish, 150);
      });
    }

    renderStickerCanvasFrame(
      ctx,
      sourceMedia,
      { ...renderOptions, audioPulse: levels[i] || 0, forVideoBackground: true },
      tSec
    );

    const frame = new window.VideoFrame(canvas, {
      timestamp: Math.round(tSec * 1_000_000),
      duration: frameDurationUs
    });
    while (videoEncoder.encodeQueueSize > 8 && !encodeError) {
      await new Promise((r) => setTimeout(r, 4));
    }
    videoEncoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
    frame.close();

    if (i % 4 === 0) {
      onProgress?.(Math.min(88, Math.round((i / totalFrames) * 85)));
    }
  }

  const chData = [];
  for (let c = 0; c < aCfg.numberOfChannels; c++) {
    chData.push(trimmedAudioBuffer.getChannelData(Math.min(c, trimmedAudioBuffer.numberOfChannels - 1)));
  }
  const totalSamples = trimmedAudioBuffer.length;
  const chunkSamples = 1024;
  for (let off = 0; off < totalSamples; off += chunkSamples) {
    if (encodeError) break;
    const count = Math.min(chunkSamples, totalSamples - off);
    const planar = new Float32Array(count * aCfg.numberOfChannels);
    for (let c = 0; c < aCfg.numberOfChannels; c++) {
      planar.set(chData[c].subarray(off, off + count), c * count);
    }
    const audioData = new window.AudioData({
      format: 'f32-planar',
      sampleRate: aCfg.sampleRate,
      numberOfFrames: count,
      numberOfChannels: aCfg.numberOfChannels,
      timestamp: Math.round((off / aCfg.sampleRate) * 1_000_000),
      data: planar
    });
    audioEncoder.encode(audioData);
    audioData.close();
  }

  await videoEncoder.flush();
  await audioEncoder.flush();
  videoEncoder.close();
  audioEncoder.close();

  if (encodeError) throw encodeError;
  muxer.finalize();
  onProgress?.(100);
  return new Blob([target.buffer], { type: 'video/mp4' });
}

async function encodeFallbackMediaRecorder({
  sourceMedia,
  trimmedAudioBuffer,
  renderOptions,
  onProgress
}) {
  const durSec = Math.max(0.5, Math.min(30, trimmedAudioBuffer.duration));
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d', { alpha: false });

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const actx = new AudioCtx();
  const dest = actx.createMediaStreamDestination();
  const src = actx.createBufferSource();
  src.buffer = trimmedAudioBuffer;
  src.connect(dest);

  const canvasStream = canvas.captureStream(30);
  const combinedStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...dest.stream.getAudioTracks()
  ]);

  const mimeCandidates = ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  const mimeType = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || 'video/webm';

  const recorder = new MediaRecorder(combinedStream, {
    mimeType,
    videoBitsPerSecond: 700000,
    audioBitsPerSecond: 96000
  });
  const chunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const isVideoEl = typeof HTMLVideoElement !== 'undefined' && sourceMedia instanceof HTMLVideoElement;
  if (isVideoEl) {
    try {
      sourceMedia.currentTime = 0;
      sourceMedia.loop = true;
      await sourceMedia.play();
    } catch {}
  }

  const levels = computePerFrameAudioEnvelope(trimmedAudioBuffer, Math.max(10, Math.round(durSec * 30)));
  let rafId = 0;
  const startedAt = performance.now();

  return await new Promise((resolve, reject) => {
    recorder.onerror = (err) => {
      cancelAnimationFrame(rafId);
      try { actx.close(); } catch {}
      reject(err?.error || new Error('MediaRecorder gagal merekam stiker bersuara.'));
    };
    recorder.onstop = () => {
      cancelAnimationFrame(rafId);
      if (isVideoEl) {
        try { sourceMedia.pause(); } catch {}
      }
      try { actx.close(); } catch {}
      onProgress?.(100);
      resolve(new Blob(chunks, { type: mimeType.split(';')[0] }));
    };

    const drawTick = () => {
      const elapsed = (performance.now() - startedAt) / 1000;
      const idx = Math.min(levels.length - 1, Math.max(0, Math.floor(elapsed * 30)));
      renderStickerCanvasFrame(
        ctx,
        sourceMedia,
        { ...renderOptions, audioPulse: levels[idx] || 0, forVideoBackground: true },
        elapsed
      );
      onProgress?.(Math.min(95, Math.round((elapsed / durSec) * 90)));
      if (elapsed < durSec) {
        rafId = requestAnimationFrame(drawTick);
      }
    };

    recorder.start(250);
    src.start(0);
    rafId = requestAnimationFrame(drawTick);

    setTimeout(() => {
      try { src.stop(); } catch {}
      if (recorder.state !== 'inactive') recorder.stop();
    }, Math.round(durSec * 1000) + 120);
  });
}

/**
 * Kompositor 1-File Stiker Kotak 512x512 Bersuara (MP4 30 FPS H.264+AAC <= 4.5 MB, dengan Fallback MediaRecorder)
 */
export async function composeSoundStickerMp4({
  sourceMedia,
  trimmedAudioBuffer,
  renderOptions = {},
  onProgress
}) {
  if (!sourceMedia) throw new Error('Visual foto atau video belum dimuat.');
  if (!trimmedAudioBuffer) throw new Error('Audio potongan belum tersedia.');

  const durSec = Math.max(0.5, Math.min(30, trimmedAudioBuffer.duration));
  const fps = 30;
  const maxTotalBits = 4.0 * 1024 * 1024 * 8;
  const safeBitrate = Math.max(260_000, Math.min(1_250_000, Math.floor(maxTotalBits / durSec) - 110_000));

  try {
    let mp4Blob = await encodeMp4WebCodecs({
      sourceMedia,
      trimmedAudioBuffer,
      renderOptions,
      fps,
      videoBitrate: safeBitrate,
      onProgress
    });

    if (mp4Blob && mp4Blob.size > MAX_SAFE_MP4_BYTES) {
      mp4Blob = await encodeMp4WebCodecs({
        sourceMedia,
        trimmedAudioBuffer,
        renderOptions,
        fps: 24,
        videoBitrate: Math.max(220_000, Math.floor(safeBitrate * 0.55)),
        onProgress
      });
    }

    if (mp4Blob && mp4Blob.size > 0) return mp4Blob;
  } catch {
    // Fallback mulus ke MediaRecorder jika browser menolak WebCodecs
  }

  return encodeFallbackMediaRecorder({
    sourceMedia,
    trimmedAudioBuffer,
    renderOptions,
    onProgress
  });
}
