import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4ArrayBufferTarget } from 'mp4-muxer';

export function parseDecimalSafe(val, fallback = 0) {
  if (typeof val === 'number') return Number.isFinite(val) ? val : fallback;
  if (val === null || val === undefined) return fallback;
  const cleaned = String(val).trim().replace(',', '.');
  if (!cleaned) return fallback;
  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getAudioContextCtor() {
  if (typeof window === 'undefined') return null;
  return window.AudioContext || window.webkitAudioContext || null;
}

/**
 * Baca durasi, dimensi, dan petunjuk trek audio dari berkas video tanpa membebani RAM (revoke langsung).
 */
export async function probeVideoMetadata(file) {
  if (!file) throw new Error('File video belum dipilih.');
  const url = URL.createObjectURL(file);
  const videoEl = document.createElement('video');
  videoEl.muted = true;
  videoEl.playsInline = true;
  videoEl.preload = 'metadata';

  try {
    videoEl.src = url;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Waktu muat metadata habis: ${file.name}`)), 9000);
      videoEl.onloadedmetadata = () => {
        clearTimeout(timer);
        resolve();
      };
      videoEl.onerror = () => {
        clearTimeout(timer);
        reject(new Error(`Video tidak dapat dibaca browser: ${file.name}`));
      };
    });

    const duration = Number.isFinite(videoEl.duration) && videoEl.duration > 0 ? videoEl.duration : 5;
    const width = Number(videoEl.videoWidth) || 512;
    const height = Number(videoEl.videoHeight) || 512;
    const hasAudioTrackHint =
      typeof videoEl.mozHasAudio === 'boolean'
        ? videoEl.mozHasAudio
        : videoEl.audioTracks
          ? videoEl.audioTracks.length > 0
          : true;

    return {
      duration,
      width,
      height,
      hasAudioTrackHint,
      defaultStartSec: 0,
      defaultEndSec: Number(Math.max(0.5, Math.min(duration, 8.0)).toFixed(1))
    };
  } finally {
    try {
      videoEl.removeAttribute('src');
      videoEl.load();
    } catch {}
    try {
      URL.revokeObjectURL(url);
    } catch {}
  }
}

/**
 * Decode berkas audio (MP3/WAV/M4A/OGG) atau ekstrak trek audio dari video (MP4/WebM/MOV)
 */
export async function decodeMediaToAudioBuffer(file) {
  if (!file) throw new Error('File audio/video belum dipilih.');
  const AudioCtx = getAudioContextCtor();
  if (!AudioCtx) {
    throw new Error('Browser tidak mendukung Web Audio API untuk memproses suara.');
  }

  const arrayBuffer = await file.arrayBuffer();
  const ctx = new AudioCtx();
  try {
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    if (!audioBuffer || audioBuffer.length === 0 || audioBuffer.numberOfChannels === 0) {
      throw new Error('Berkas tidak memiliki trek audio yang dapat diproses.');
    }
    return audioBuffer;
  } catch (err) {
    const detail = err?.name ? ` (${err.name})` : '';
    throw new Error(
      `Format audio "${file.name}" tidak didukung oleh decoder browser ini${detail} atau tidak memiliki trek suara. Coba file MP3, WAV, M4A (AAC), OGG, atau video MP4.`
    );
  } finally {
    try {
      await ctx.close();
    } catch {}
  }
}

/**
 * Bangkitkan array amplitudo ternormalisasi [0.06..1.0] untuk menggambar Waveform visual
 */
export function extractWaveformPeaks(audioBuffer, barCount = 96) {
  if (!audioBuffer || audioBuffer.length === 0) return new Array(barCount).fill(0.1);
  const count = Math.max(16, Math.min(256, Number(barCount) || 96));
  const totalSamples = audioBuffer.length;
  const channels = audioBuffer.numberOfChannels;
  const blockSize = Math.max(1, Math.floor(totalSamples / count));

  const chData = [];
  for (let c = 0; c < channels; c++) {
    chData.push(audioBuffer.getChannelData(c));
  }

  const peaks = new Array(count);
  let maxPeak = 0.001;

  for (let i = 0; i < count; i++) {
    const start = i * blockSize;
    const end = Math.min(totalSamples, start + blockSize);
    const step = Math.max(1, Math.floor((end - start) / 64));
    let highest = 0;
    for (let s = start; s < end; s += step) {
      let sumAbs = 0;
      for (let c = 0; c < channels; c++) {
        sumAbs += Math.abs(chData[c][s] || 0);
      }
      const avg = sumAbs / channels;
      if (avg > highest) highest = avg;
    }
    peaks[i] = highest;
    if (highest > maxPeak) maxPeak = highest;
  }

  return peaks.map((v) => Math.max(0.06, Math.min(1, v / maxPeak)));
}

/**
 * Potong AudioBuffer presisi [startSec, endSec] + gain volume + fade in/out 40ms anti klik
 */
export async function renderTrimmedAudioBuffer(
  audioBuffer,
  { startSec = 0, endSec = 5, volume = 1.0, fadeSmooth = true } = {}
) {
  if (!audioBuffer) throw new Error('Audio belum tersedia.');
  const totalDur = audioBuffer.duration;
  const safeStart = Math.max(0, Math.min(totalDur - 0.1, parseDecimalSafe(startSec, 0)));
  const safeEnd = Math.max(safeStart + 0.1, Math.min(totalDur, parseDecimalSafe(endSec, totalDur)));
  const clipDur = safeEnd - safeStart;

  const targetRate = 44100;
  const targetChannels = Math.min(2, Math.max(1, audioBuffer.numberOfChannels));
  const frameCount = Math.max(1, Math.round(clipDur * targetRate));
  const gainVal = Math.max(0.5, Math.min(1.5, Number(volume) || 1.0));

  const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OfflineCtx) {
    throw new Error('OfflineAudioContext tidak tersedia pada browser ini.');
  }

  const offline = new OfflineCtx(targetChannels, frameCount, targetRate);
  const src = offline.createBufferSource();
  src.buffer = audioBuffer;

  const gainNode = offline.createGain();
  if (fadeSmooth && clipDur > 0.12) {
    const fadeSec = Math.min(0.04, clipDur * 0.25);
    gainNode.gain.setValueAtTime(0.001, 0);
    gainNode.gain.linearRampToValueAtTime(gainVal, fadeSec);
    gainNode.gain.setValueAtTime(gainVal, Math.max(fadeSec, clipDur - fadeSec));
    gainNode.gain.linearRampToValueAtTime(0.001, clipDur);
  } else {
    gainNode.gain.setValueAtTime(gainVal, 0);
  }

  src.connect(gainNode);
  gainNode.connect(offline.destination);
  src.start(0, safeStart, clipDur);

  return offline.startRendering();
}

function encodeMonoWavBlob(audioBuffer) {
  const srcRate = audioBuffer.sampleRate;
  const outRate = 22050;
  const ratio = srcRate / outRate;
  const outLen = Math.max(1, Math.floor(audioBuffer.length / ratio));
  const channels = audioBuffer.numberOfChannels;

  const chArrays = [];
  for (let c = 0; c < channels; c++) chArrays.push(audioBuffer.getChannelData(c));

  const dataByteLen = outLen * 2;
  const wav = new ArrayBuffer(44 + dataByteLen);
  const view = new DataView(wav);

  const writeAscii = (off, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i));
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataByteLen, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, outRate, true);
  view.setUint32(28, outRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, 'data');
  view.setUint32(40, dataByteLen, true);

  let offset = 44;
  for (let i = 0; i < outLen; i++) {
    const srcIdx = Math.min(audioBuffer.length - 1, Math.floor(i * ratio));
    let sample = 0;
    for (let c = 0; c < channels; c++) sample += chArrays[c][srcIdx] || 0;
    sample /= channels;
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  return new Blob([wav], { type: 'audio/wav' });
}

/**
 * Encode potongan AudioBuffer ke M4A/AAC (WebCodecs + mp4-muxer), atau fallback WAV 22kHz
 */
export async function encodeTrimmedAudio(trimmedBuffer) {
  if (!trimmedBuffer) throw new Error('Audio potongan kosong.');
  const sampleRate = trimmedBuffer.sampleRate;
  const numberOfChannels = Math.min(2, Math.max(1, trimmedBuffer.numberOfChannels));

  if (typeof window !== 'undefined' && typeof window.AudioEncoder === 'function' && typeof window.AudioData === 'function') {
    const configs = [
      { codec: 'mp4a.40.2', sampleRate, numberOfChannels, bitrate: 96000 },
      { codec: 'mp4a.40.2', sampleRate: 44100, numberOfChannels, bitrate: 96000 }
    ];

    for (const cfg of configs) {
      try {
        const support = await window.AudioEncoder.isConfigSupported(cfg);
        if (!support?.supported) continue;

        const target = new Mp4ArrayBufferTarget();
        const muxer = new Mp4Muxer({
          target,
          audio: {
            codec: 'aac',
            numberOfChannels: cfg.numberOfChannels,
            sampleRate: cfg.sampleRate
          },
          fastStart: 'in-memory'
        });

        let encodeErr = null;
        const encoder = new window.AudioEncoder({
          output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
          error: (err) => {
            encodeErr = err;
          }
        });
        encoder.configure(cfg);

        const totalFrames = trimmedBuffer.length;
        const chunkFrames = 1024;
        const chData = [];
        for (let c = 0; c < cfg.numberOfChannels; c++) {
          chData.push(trimmedBuffer.getChannelData(Math.min(c, trimmedBuffer.numberOfChannels - 1)));
        }

        for (let offset = 0; offset < totalFrames; offset += chunkFrames) {
          if (encodeErr) break;
          const count = Math.min(chunkFrames, totalFrames - offset);
          const planar = new Float32Array(count * cfg.numberOfChannels);
          for (let c = 0; c < cfg.numberOfChannels; c++) {
            planar.set(chData[c].subarray(offset, offset + count), c * count);
          }
          const audioData = new window.AudioData({
            format: 'f32-planar',
            sampleRate: cfg.sampleRate,
            numberOfFrames: count,
            numberOfChannels: cfg.numberOfChannels,
            timestamp: Math.round((offset / cfg.sampleRate) * 1_000_000),
            data: planar
          });
          encoder.encode(audioData);
          audioData.close();
        }

        await encoder.flush();
        encoder.close();
        if (encodeErr) throw encodeErr;

        muxer.finalize();
        const blob = new Blob([target.buffer], { type: 'audio/mp4' });
        if (blob.size > 0) {
          return {
            blob,
            mimeType: 'audio/mp4',
            ext: 'm4a',
            pttCapable: true
          };
        }
      } catch {
        // Coba fallback berikutnya jika WebCodecs AAC ditolak oleh perangkat tertentu
      }
    }
  }

  const wavBlob = encodeMonoWavBlob(trimmedBuffer);
  return {
    blob: wavBlob,
    mimeType: 'audio/wav',
    ext: 'wav',
    pttCapable: false
  };
}

/**
 * Pemutar pratinjau audio presisi [startSec, endSec] untuk Audio Trimmer & Bubble WA
 */
export function createSnippetPlayer() {
  let ctx = null;
  let source = null;
  let gainNode = null;
  let rafId = 0;
  let playing = false;

  const stop = () => {
    playing = false;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    if (source) {
      try {
        source.onended = null;
        source.stop();
        source.disconnect();
      } catch {}
      source = null;
    }
    if (gainNode) {
      try {
        gainNode.disconnect();
      } catch {}
      gainNode = null;
    }
  };

  const play = async (audioBuffer, startSec = 0, endSec = 5, volume = 1.0, { offsetInside = 0, fadeSmooth = true, onTick, onEnded } = {}) => {
    stop();
    if (!audioBuffer) return;

    const AudioCtx = getAudioContextCtor();
    if (!AudioCtx) return;
    if (!ctx || ctx.state === 'closed') {
      ctx = new AudioCtx();
    }
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const total = audioBuffer.duration;
    const s = Math.max(0, Math.min(total - 0.05, parseDecimalSafe(startSec, 0)));
    const e = Math.max(s + 0.05, Math.min(total, parseDecimalSafe(endSec, total)));
    const clipLen = e - s;
    const clampedOffset = Math.max(0, Math.min(clipLen - 0.02, Number(offsetInside) || 0));
    const playDur = clipLen - clampedOffset;

    const srcNode = ctx.createBufferSource();
    srcNode.buffer = audioBuffer;

    const gNode = ctx.createGain();
    const gVal = Math.max(0.5, Math.min(1.5, Number(volume) || 1.0));
    const t0 = ctx.currentTime;
    if (fadeSmooth && playDur > 0.12) {
      const fade = Math.min(0.04, playDur * 0.2);
      gNode.gain.setValueAtTime(0.001, t0);
      gNode.gain.linearRampToValueAtTime(gVal, t0 + fade);
      gNode.gain.setValueAtTime(gVal, t0 + playDur - fade);
      gNode.gain.linearRampToValueAtTime(0.001, t0 + playDur);
    } else {
      gNode.gain.setValueAtTime(gVal, t0);
    }

    srcNode.connect(gNode);
    gNode.connect(ctx.destination);

    source = srcNode;
    gainNode = gNode;
    playing = true;
    const startedAtWall = performance.now();

    srcNode.onended = () => {
      if (!playing) return;
      stop();
      onTick?.(clipLen);
      onEnded?.();
    };

    srcNode.start(0, s + clampedOffset, playDur);

    const tick = () => {
      if (!playing) return;
      const elapsed = Math.min(clipLen, clampedOffset + (performance.now() - startedAtWall) / 1000);
      onTick?.(elapsed);
      if (elapsed < clipLen && playing) {
        rafId = requestAnimationFrame(tick);
      }
    };
    rafId = requestAnimationFrame(tick);
  };

  return {
    play,
    stop,
    isPlaying: () => playing
  };
}
