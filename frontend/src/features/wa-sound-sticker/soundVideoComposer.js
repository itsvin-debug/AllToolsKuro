import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4ArrayBufferTarget } from 'mp4-muxer';
import { renderStickerCanvasFrame } from './webpStickerEncoder';

const MAX_SAFE_VIDEO_BYTES = 4.5 * 1024 * 1024;

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

function drawAudioWaveStrip(ctx, audioLevel = 0, tSec = 0) {
  const barCount = 14;
  const width = 220;
  const startX = (512 - width) * 0.5;
  const baseY = 486;
  const gap = width / barCount;

  ctx.save();
  for (let i = 0; i < barCount; i++) {
    const phase = Math.sin(tSec * 9 + i * 0.7) * 0.5 + 0.5;
    const h = 4 + Math.round((audioLevel * 18 + 4) * (0.4 + phase * 0.6));
    const x = startX + i * gap + 2;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(x - 1, baseY - h - 1, Math.max(4, gap - 5), h + 2);
    ctx.fillStyle = '#4ade80';
    ctx.fillRect(x, baseY - h, Math.max(2, gap - 7), h);
  }
  ctx.restore();
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
  showVisualizer,
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
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
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
    if (showVisualizer) {
      drawAudioWaveStrip(ctx, levels[i] || 0, tSec);
    }

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

  // Encode seluruh trek audio potongan
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
  showVisualizer,
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

  const canvasStream = canvas.captureStream(20);
  const combinedStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...dest.stream.getAudioTracks()
  ]);

  const mimeCandidates = ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  const mimeType = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || 'video/webm';

  const recorder = new MediaRecorder(combinedStream, {
    mimeType,
    videoBitsPerSecond: 650000,
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

  const levels = computePerFrameAudioEnvelope(trimmedAudioBuffer, Math.max(10, Math.round(durSec * 20)));
  let rafId = 0;
  const startedAt = performance.now();

  return await new Promise((resolve, reject) => {
    recorder.onerror = (err) => {
      cancelAnimationFrame(rafId);
      try { actx.close(); } catch {}
      reject(err?.error || new Error('MediaRecorder gagal merekam video bersuara.'));
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
      const idx = Math.min(levels.length - 1, Math.max(0, Math.floor(elapsed * 20)));
      renderStickerCanvasFrame(
        ctx,
        sourceMedia,
        { ...renderOptions, audioPulse: levels[idx] || 0, forVideoBackground: true },
        elapsed
      );
      if (showVisualizer) drawAudioWaveStrip(ctx, levels[idx] || 0, elapsed);
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
      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
    }, Math.round(durSec * 1000) + 120);
  });
}

/**
 * Kompositor 512x512 Foto/Video + Potongan Sound menjadi Video MP4 <= 4.5 MB
 */
export async function composeSoundVideoMp4({
  sourceMedia,
  trimmedAudioBuffer,
  renderOptions = {},
  showVisualizer = true,
  onProgress
}) {
  if (!sourceMedia) throw new Error('Visual foto atau video belum dimuat.');
  if (!trimmedAudioBuffer) throw new Error('Audio potongan belum tersedia.');

  const durSec = Math.max(0.5, Math.min(30, trimmedAudioBuffer.duration));
  const fps = durSec > 15 ? 20 : 24;
  const maxTotalBits = 4.0 * 1024 * 1024 * 8;
  const safeBitrate = Math.max(240_000, Math.min(1_200_000, Math.floor(maxTotalBits / durSec) - 110_000));

  try {
    let mp4Blob = await encodeMp4WebCodecs({
      sourceMedia,
      trimmedAudioBuffer,
      renderOptions,
      showVisualizer,
      fps,
      videoBitrate: safeBitrate,
      onProgress
    });

    if (mp4Blob && mp4Blob.size > MAX_SAFE_VIDEO_BYTES) {
      mp4Blob = await encodeMp4WebCodecs({
        sourceMedia,
        trimmedAudioBuffer,
        renderOptions,
        showVisualizer,
        fps: 18,
        videoBitrate: Math.max(220_000, Math.floor(safeBitrate * 0.55)),
        onProgress
      });
    }

    if (mp4Blob && mp4Blob.size > 0) {
      return mp4Blob;
    }
  } catch {
    // Fallback mulus ke MediaRecorder bila WebCodecs tidak tersedia
  }

  return encodeFallbackMediaRecorder({
    sourceMedia,
    trimmedAudioBuffer,
    renderOptions,
    showVisualizer,
    onProgress
  });
}
