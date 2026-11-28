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

const OGG_CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let j = 0; j < 8; j++) {
      r = (r & 0x80000000) !== 0 ? ((r << 1) ^ 0x04c11db7) >>> 0 : (r << 1) >>> 0;
    }
    table[i] = r >>> 0;
  }
  return table;
})();

function computeOggCrc32Bytes(bytes) {
  let crc = 0;
  for (let i = 0; i < bytes.length; i++) {
    crc = ((crc << 8) ^ OGG_CRC_TABLE[((crc >>> 24) ^ bytes[i]) & 0xff]) >>> 0;
  }
  return crc >>> 0;
}

function getOpusPacketSampleCount(frame) {
  if (!frame || frame.length === 0) return 960;
  const toc = frame[0];
  const config = toc >> 3;
  const code = toc & 0x03;

  let samplesPerFrame = 960;
  if (config < 12) {
    const silkMs = [10, 20, 40, 60];
    samplesPerFrame = silkMs[config & 0x03] * 48;
  } else if (config < 16) {
    samplesPerFrame = (config & 0x01) !== 0 ? 960 : 480;
  } else {
    samplesPerFrame = 120 << (config & 0x03);
  }

  let frameCount = 1;
  if (code === 1 || code === 2) {
    frameCount = 2;
  } else if (code === 3 && frame.length >= 2) {
    frameCount = Math.max(1, frame[1] & 0x3f);
  }
  return samplesPerFrame * frameCount;
}

function readEbmlVintId(bytes, offset) {
  if (offset >= bytes.length) return null;
  const first = bytes[offset];
  if (first === 0) return null;
  let len = 1;
  let mask = 0x80;
  while (len <= 4 && (first & mask) === 0) {
    len++;
    mask >>= 1;
  }
  if (len > 4 || offset + len > bytes.length) return null;
  let id = 0;
  for (let i = 0; i < len; i++) {
    id = id * 256 + bytes[offset + i];
  }
  return { id, length: len };
}

function readEbmlVintSize(bytes, offset) {
  if (offset >= bytes.length) return null;
  const first = bytes[offset];
  if (first === 0) return null;
  let len = 1;
  let mask = 0x80;
  while (len <= 8 && (first & mask) === 0) {
    len++;
    mask >>= 1;
  }
  if (len > 8 || offset + len > bytes.length) return null;
  let value = first & (mask - 1);
  let allOnes = value === mask - 1;
  for (let i = 1; i < len; i++) {
    const b = bytes[offset + i];
    if (b !== 0xff) allOnes = false;
    value = value * 256 + b;
  }
  return { value: allOnes ? Infinity : value, length: len };
}

function extractOpusFramesFromBlock(blockBytes) {
  if (!blockBytes || blockBytes.length < 4) return [];
  const trackVint = readEbmlVintSize(blockBytes, 0);
  if (!trackVint) return [];
  const trackNum = trackVint.value;
  let pos = trackVint.length + 2;
  if (pos >= blockBytes.length) return [];

  const flags = blockBytes[pos++];
  const lacing = (flags >> 1) & 0x03;

  if (lacing === 0) {
    const frame = blockBytes.subarray(pos);
    return frame.length > 0 ? [{ trackNum, frame }] : [];
  }

  if (pos >= blockBytes.length) return [];
  const frameCount = blockBytes[pos++] + 1;
  const out = [];

  if (lacing === 1) {
    const sizes = [];
    for (let i = 0; i < frameCount - 1; i++) {
      let sz = 0;
      while (pos < blockBytes.length) {
        const b = blockBytes[pos++];
        sz += b;
        if (b < 255) break;
      }
      sizes.push(sz);
    }
    for (const sz of sizes) {
      if (pos + sz <= blockBytes.length && sz > 0) {
        out.push({ trackNum, frame: blockBytes.subarray(pos, pos + sz) });
      }
      pos += sz;
    }
    if (pos < blockBytes.length) out.push({ trackNum, frame: blockBytes.subarray(pos) });
    return out;
  }

  if (lacing === 2) {
    const rem = blockBytes.length - pos;
    const fSize = Math.floor(rem / frameCount);
    for (let i = 0; i < frameCount && fSize > 0; i++) {
      out.push({ trackNum, frame: blockBytes.subarray(pos, pos + fSize) });
      pos += fSize;
    }
    return out;
  }

  const sizes = [];
  const firstSz = readEbmlVintSize(blockBytes, pos);
  if (!firstSz) return [];
  pos += firstSz.length;
  let curSz = firstSz.value;
  sizes.push(curSz);
  for (let i = 1; i < frameCount - 1; i++) {
    const deltaVint = readEbmlVintSize(blockBytes, pos);
    if (!deltaVint) break;
    pos += deltaVint.length;
    const bias = Math.pow(2, 7 * deltaVint.length - 1) - 1;
    curSz += deltaVint.value - bias;
    sizes.push(Math.max(0, curSz));
  }
  for (const sz of sizes) {
    if (pos + sz <= blockBytes.length && sz > 0) {
      out.push({ trackNum, frame: blockBytes.subarray(pos, pos + sz) });
    }
    pos += sz;
  }
  if (pos < blockBytes.length) out.push({ trackNum, frame: blockBytes.subarray(pos) });
  return out;
}

function buildOggPageBytes(packets, { headerType = 0, granulePos = 0, serial = 0x4b55524f, seq = 0 } = {}) {
  const segTable = [];
  for (const pkt of packets) {
    let rem = pkt.length;
    while (rem >= 255) {
      segTable.push(255);
      rem -= 255;
    }
    segTable.push(rem);
  }
  if (segTable.length > 255) {
    throw new Error('Ogg page segment table melebihi 255 segmen.');
  }

  const headerLen = 27 + segTable.length;
  const dataLen = packets.reduce((acc, p) => acc + p.length, 0);
  const page = new Uint8Array(headerLen + dataLen);
  const view = new DataView(page.buffer);

  page[0] = 0x4f;
  page[1] = 0x67;
  page[2] = 0x67;
  page[3] = 0x53;
  page[4] = 0;
  page[5] = headerType & 0xff;

  const gBig = BigInt(Math.max(0, Math.round(granulePos)));
  view.setUint32(6, Number(gBig & 0xffffffffn), true);
  view.setUint32(10, Number((gBig >> 32n) & 0xffffffffn), true);

  view.setUint32(14, serial >>> 0, true);
  view.setUint32(18, seq >>> 0, true);
  view.setUint32(22, 0, true);
  page[26] = segTable.length;

  for (let i = 0; i < segTable.length; i++) {
    page[27 + i] = segTable[i];
  }

  let bodyOff = headerLen;
  for (const pkt of packets) {
    page.set(pkt, bodyOff);
    bodyOff += pkt.length;
  }

  view.setUint32(22, computeOggCrc32Bytes(page), true);
  return page;
}

/**
 * Remux container WebM/Opus menjadi container Ogg/Opus RFC 7845 murni di browser (pure JS).
 */
export function remuxWebmOpusToOggOpus(webmInput) {
  const bytes =
    webmInput instanceof Uint8Array
      ? webmInput
      : webmInput instanceof ArrayBuffer
        ? new Uint8Array(webmInput)
        : new Uint8Array(webmInput.buffer, webmInput.byteOffset || 0, webmInput.byteLength);

  if (bytes.length < 16 || bytes[0] !== 0x1a || bytes[1] !== 0x45 || bytes[2] !== 0xdf || bytes[3] !== 0xa3) {
    throw new Error('Buffer bukan container WebM/EBML yang valid.');
  }

  const asciiDecoder = new TextDecoder('ascii');
  const MASTER_IDS = new Set([0x1a45dfa3, 0x18538067, 0x1654ae6b, 0xae, 0xe1, 0x1f43b675, 0xa0]);
  let channels = 1;
  let preSkip = 312;
  let inputSampleRate = 48000;
  let opusTrackNum = null;
  let currentTrack = { num: null, type: null, codec: '', channels: 1, sampleRate: 48000, codecPrivate: null };
  const rawBlocks = [];

  function walkEbml(start, end, depth = 0) {
    if (depth > 8) return;
    let pos = start;
    while (pos < end) {
      const idInfo = readEbmlVintId(bytes, pos);
      if (!idInfo) break;
      const szInfo = readEbmlVintSize(bytes, pos + idInfo.length);
      if (!szInfo) break;

      const bodyStart = pos + idInfo.length + szInfo.length;
      const bodyEnd = szInfo.value === Infinity ? end : Math.min(end, bodyStart + szInfo.value);

      if (idInfo.id === 0xae) {
        currentTrack = { num: null, type: null, codec: '', channels: 1, sampleRate: 48000, codecPrivate: null };
        walkEbml(bodyStart, bodyEnd, depth + 1);
        if (currentTrack.codec === 'A_OPUS' || (currentTrack.type === 2 && opusTrackNum == null)) {
          opusTrackNum = currentTrack.num;
          const priv = currentTrack.codecPrivate;
          if (priv && priv.length >= 19 && asciiDecoder.decode(priv.subarray(0, 8)) === 'OpusHead') {
            const pv = new DataView(priv.buffer, priv.byteOffset, priv.byteLength);
            channels = Math.max(1, Math.min(2, priv[9] || currentTrack.channels || 1));
            preSkip = pv.getUint16(10, true) || 312;
            inputSampleRate = pv.getUint32(12, true) || 48000;
          } else {
            channels = Math.max(1, Math.min(2, currentTrack.channels || 1));
            inputSampleRate = Math.round(currentTrack.sampleRate) || 48000;
          }
        }
      } else if (MASTER_IDS.has(idInfo.id)) {
        walkEbml(bodyStart, bodyEnd, depth + 1);
      } else {
        const slice = bytes.subarray(bodyStart, bodyEnd);
        if (idInfo.id === 0xd7) {
          let v = 0;
          for (let i = 0; i < slice.length; i++) v = v * 256 + slice[i];
          currentTrack.num = v;
        } else if (idInfo.id === 0x83) {
          currentTrack.type = slice[0];
        } else if (idInfo.id === 0x86) {
          currentTrack.codec = asciiDecoder.decode(slice).replace(/\0+$/, '');
        } else if (idInfo.id === 0x63a2) {
          currentTrack.codecPrivate = slice;
        } else if (idInfo.id === 0x9f && slice.length >= 1) {
          currentTrack.channels = slice[0];
        } else if (idInfo.id === 0xb5) {
          const sv = new DataView(slice.buffer, slice.byteOffset, slice.byteLength);
          if (slice.length === 4) currentTrack.sampleRate = sv.getFloat32(0, false);
          else if (slice.length === 8) currentTrack.sampleRate = sv.getFloat64(0, false);
        } else if (idInfo.id === 0xa3 || idInfo.id === 0xa1) {
          for (const item of extractOpusFramesFromBlock(slice)) {
            rawBlocks.push(item);
          }
        }
      }

      if (bodyEnd <= pos) break;
      pos = bodyEnd;
    }
  }

  walkEbml(0, bytes.length, 0);

  const opusFrames = rawBlocks
    .filter((b) => opusTrackNum == null || b.trackNum === opusTrackNum)
    .map((b) => b.frame)
    .filter((f) => f && f.length > 0);

  if (opusFrames.length === 0) {
    throw new Error('Tidak ditemukan paket audio Opus di dalam container WebM.');
  }

  const encoder = new TextEncoder();
  const opusHead = new Uint8Array(19);
  opusHead.set(encoder.encode('OpusHead'), 0);
  opusHead[8] = 1;
  opusHead[9] = channels;
  const headView = new DataView(opusHead.buffer);
  headView.setUint16(10, preSkip, true);
  headView.setUint32(12, inputSampleRate, true);
  headView.setInt16(16, 0, true);
  opusHead[18] = 0;

  const vendorBytes = encoder.encode('KuroStudio');
  const opusTags = new Uint8Array(16 + vendorBytes.length);
  opusTags.set(encoder.encode('OpusTags'), 0);
  const tagsView = new DataView(opusTags.buffer);
  tagsView.setUint32(8, vendorBytes.length, true);
  opusTags.set(vendorBytes, 12);
  tagsView.setUint32(12 + vendorBytes.length, 0, true);

  const serial = 0x4b55524f;
  const pages = [
    buildOggPageBytes([opusHead], { headerType: 0x02, granulePos: 0, serial, seq: 0 }),
    buildOggPageBytes([opusTags], { headerType: 0x00, granulePos: 0, serial, seq: 1 })
  ];

  let seq = 2;
  let granulePos = preSkip;
  let batch = [];
  let segUsed = 0;

  for (let i = 0; i < opusFrames.length; i++) {
    const frame = opusFrames[i];
    const pktSegs = Math.floor(frame.length / 255) + 1;
    if (batch.length > 0 && (batch.length >= 25 || segUsed + pktSegs > 240)) {
      pages.push(buildOggPageBytes(batch, { headerType: 0x00, granulePos, serial, seq: seq++ }));
      batch = [];
      segUsed = 0;
    }
    granulePos += getOpusPacketSampleCount(frame);
    batch.push(frame);
    segUsed += pktSegs;
  }

  if (batch.length > 0) {
    pages.push(buildOggPageBytes(batch, { headerType: 0x04, granulePos, serial, seq: seq++ }));
  }

  const totalLen = pages.reduce((acc, p) => acc + p.length, 0);
  const out = new Uint8Array(totalLen);
  let offset = 0;
  for (const p of pages) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

async function recordAudioBufferWithMediaRecorder(trimmedBuffer, mimeType) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx || typeof MediaRecorder === 'undefined') {
    throw new Error('MediaRecorder tidak tersedia.');
  }

  let audioCtx;
  try {
    audioCtx = new AudioCtx({ sampleRate: 48000 });
  } catch {
    audioCtx = new AudioCtx();
  }

  const dest = audioCtx.createMediaStreamDestination();
  let safetyTimer = null;

  try {
    await audioCtx.resume?.().catch(() => {});
    const recBuf = audioCtx.createBuffer(1, trimmedBuffer.length, trimmedBuffer.sampleRate);
    recBuf.copyToChannel(trimmedBuffer.getChannelData(0), 0);

    const source = audioCtx.createBufferSource();
    source.buffer = recBuf;
    source.connect(dest);

    const chunks = [];
    const recorder = new MediaRecorder(dest.stream, {
      mimeType,
      audioBitsPerSecond: 48000
    });

    return await new Promise((resolve, reject) => {
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunks.push(ev.data);
      };
      recorder.onerror = (ev) => {
        reject(ev?.error || new Error('MediaRecorder gagal merekam audio Opus.'));
      };
      recorder.onstop = () => {
        if (safetyTimer) clearTimeout(safetyTimer);
        const blob = new Blob(chunks, { type: mimeType });
        if (blob.size <= 64) {
          reject(new Error('Hasil rekaman audio Opus kosong.'));
          return;
        }
        resolve(blob);
      };
      source.onended = () => {
        setTimeout(() => {
          if (recorder.state === 'recording') {
            recorder.stop();
          }
        }, 40);
      };

      recorder.start(100);
      source.start(0);
      safetyTimer = setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop();
      }, Math.ceil((trimmedBuffer.duration + 0.8) * 1000));
    });
  } finally {
    if (safetyTimer) clearTimeout(safetyTimer);
    try {
      dest.stream.getTracks().forEach((t) => t.stop());
    } catch {}
    await audioCtx.close?.().catch(() => {});
  }
}

/**
 * Encode potongan AudioBuffer langsung ke Ogg/Opus (`audio/ogg; codecs=opus`),
 * atau fallback M4A/AAC (WebCodecs + mp4-muxer) / WAV 22kHz.
 */
export async function encodeTrimmedAudio(trimmedBuffer) {
  if (!trimmedBuffer) throw new Error('Audio potongan kosong.');

  if (
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    typeof MediaRecorder.isTypeSupported === 'function'
  ) {
    if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
      try {
        const directBlob = await recordAudioBufferWithMediaRecorder(trimmedBuffer, 'audio/ogg;codecs=opus');
        const head = new Uint8Array(await directBlob.slice(0, 4).arrayBuffer());
        if (head[0] === 0x4f && head[1] === 0x67 && head[2] === 0x67 && head[3] === 0x53) {
          return {
            blob: new Blob([directBlob], { type: 'audio/ogg; codecs=opus' }),
            mimeType: 'audio/ogg; codecs=opus',
            ext: 'ogg',
            pttCapable: true
          };
        }
      } catch {}
    }

    const webmMime = ['audio/webm;codecs=opus', 'audio/webm'].find((m) =>
      MediaRecorder.isTypeSupported(m)
    );
    if (webmMime) {
      try {
        const webmBlob = await recordAudioBufferWithMediaRecorder(trimmedBuffer, webmMime);
        const webmBuf = await webmBlob.arrayBuffer();
        const oggBytes = remuxWebmOpusToOggOpus(webmBuf);
        return {
          blob: new Blob([oggBytes], { type: 'audio/ogg; codecs=opus' }),
          mimeType: 'audio/ogg; codecs=opus',
          ext: 'ogg',
          pttCapable: true
        };
      } catch {}
    }
  }

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
            pttCapable: false
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
