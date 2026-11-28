const { spawn } = require('child_process');

// Ogg CRC32 lookup table (polynomial 0x04c11db7 MSB-first, non-reflected, init 0, no final XOR — RFC 3533 / RFC 7845)
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

function computeOggCrc32(buf) {
  let crc = 0;
  for (let i = 0; i < buf.length; i++) {
    crc = ((crc << 8) ^ OGG_CRC_TABLE[((crc >>> 24) ^ buf[i]) & 0xff]) >>> 0;
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
    const silkmMs = [10, 20, 40, 60];
    samplesPerFrame = silkmMs[config & 0x03] * 48;
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
    id = (id * 256) + bytes[offset + i];
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
  let allOnes = value === (mask - 1);
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
  let pos = trackVint.length + 2; // lewati 2 byte relative timecode
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
    // Xiph lacing
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
    // Fixed-size lacing
    const rem = blockBytes.length - pos;
    const fSize = Math.floor(rem / frameCount);
    for (let i = 0; i < frameCount && fSize > 0; i++) {
      out.push({ trackNum, frame: blockBytes.subarray(pos, pos + fSize) });
      pos += fSize;
    }
    return out;
  }

  // EBML lacing (lacing === 3)
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

function buildOggPage(packets, { headerType = 0, granulePos = 0, serial = 0x4b55524f, seq = 0 } = {}) {
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
  const page = Buffer.alloc(headerLen + dataLen);

  page.write('OggS', 0, 4, 'ascii');
  page[4] = 0;
  page[5] = headerType & 0xff;

  const gBig = BigInt(Math.max(0, Math.round(granulePos)));
  page.writeUInt32LE(Number(gBig & 0xffffffffn), 6);
  page.writeUInt32LE(Number((gBig >> 32n) & 0xffffffffn), 10);

  page.writeUInt32LE(serial >>> 0, 14);
  page.writeUInt32LE(seq >>> 0, 18);
  page.writeUInt32LE(0, 22);
  page[26] = segTable.length;

  for (let i = 0; i < segTable.length; i++) {
    page[27 + i] = segTable[i];
  }

  let bodyOff = headerLen;
  for (const pkt of packets) {
    Buffer.from(pkt).copy(page, bodyOff);
    bodyOff += pkt.length;
  }

  const crc = computeOggCrc32(page);
  page.writeUInt32LE(crc, 22);
  return page;
}

/**
 * Remux container WebM/EBML (A_OPUS) menjadi container Ogg/Opus RFC 7845 murni di RAM.
 */
function remuxWebmOpusToOggOpus(webmBuffer) {
  const bytes = Buffer.isBuffer(webmBuffer) ? webmBuffer : Buffer.from(webmBuffer);
  if (bytes.length < 16 || bytes[0] !== 0x1a || bytes[1] !== 0x45 || bytes[2] !== 0xdf || bytes[3] !== 0xa3) {
    throw new Error('Buffer sumber bukan container WebM/EBML yang valid.');
  }

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
        if (currentTrack.codec === 'A_OPUS' || (currentTrack.type === 2 && !opusTrackNum)) {
          opusTrackNum = currentTrack.num;
          if (currentTrack.codecPrivate && currentTrack.codecPrivate.length >= 19 && currentTrack.codecPrivate.toString('ascii', 0, 8) === 'OpusHead') {
            channels = Math.max(1, Math.min(2, currentTrack.codecPrivate[9] || currentTrack.channels || 1));
            preSkip = currentTrack.codecPrivate.readUInt16LE(10) || 312;
            inputSampleRate = currentTrack.codecPrivate.readUInt32LE(12) || 48000;
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
          for (let i = 0; i < slice.length; i++) v = (v * 256) + slice[i];
          currentTrack.num = v;
        } else if (idInfo.id === 0x83) {
          currentTrack.type = slice[0];
        } else if (idInfo.id === 0x86) {
          currentTrack.codec = slice.toString('ascii').replace(/\0+$/, '');
        } else if (idInfo.id === 0x63a2) {
          currentTrack.codecPrivate = slice;
        } else if (idInfo.id === 0x9f && slice.length >= 1) {
          currentTrack.channels = slice[0];
        } else if (idInfo.id === 0xb5) {
          if (slice.length === 4) currentTrack.sampleRate = slice.readFloatBE(0);
          else if (slice.length === 8) currentTrack.sampleRate = slice.readDoubleBE(0);
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
    throw new Error('Tidak ditemukan paket audio Opus di dalam WebM.');
  }

  // Page 0: OpusHead (19 bytes)
  const opusHead = Buffer.alloc(19);
  opusHead.write('OpusHead', 0, 8, 'ascii');
  opusHead[8] = 1;
  opusHead[9] = channels;
  opusHead.writeUInt16LE(preSkip, 10);
  opusHead.writeUInt32LE(inputSampleRate, 12);
  opusHead.writeInt16LE(0, 16);
  opusHead[18] = 0;

  // Page 1: OpusTags
  const vendor = Buffer.from('KuroStudio', 'utf8');
  const opusTags = Buffer.alloc(16 + vendor.length);
  opusTags.write('OpusTags', 0, 8, 'ascii');
  opusTags.writeUInt32LE(vendor.length, 8);
  vendor.copy(opusTags, 12);
  opusTags.writeUInt32LE(0, 12 + vendor.length);

  const serial = 0x4b55524f;
  const pages = [
    buildOggPage([opusHead], { headerType: 0x02, granulePos: 0, serial, seq: 0 }),
    buildOggPage([opusTags], { headerType: 0x00, granulePos: 0, serial, seq: 1 })
  ];

  // Page 2..N: grup hingga ~25 paket per page (atau split sebelum > 200 segmen)
  let seq = 2;
  let granulePos = preSkip;
  let batch = [];
  let segUsed = 0;

  for (let i = 0; i < opusFrames.length; i++) {
    const frame = opusFrames[i];
    const pktSegs = Math.floor(frame.length / 255) + 1;
    if (batch.length > 0 && (batch.length >= 25 || segUsed + pktSegs > 240)) {
      pages.push(buildOggPage(batch, { headerType: 0x00, granulePos, serial, seq: seq++ }));
      batch = [];
      segUsed = 0;
    }
    granulePos += getOpusPacketSampleCount(frame);
    batch.push(frame);
    segUsed += pktSegs;
  }

  if (batch.length > 0) {
    pages.push(buildOggPage(batch, { headerType: 0x04, granulePos, serial, seq: seq++ }));
  }

  return Buffer.concat(pages);
}

function validateOggOpusBuffer(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 48) return false;
  if (buf.toString('ascii', 0, 4) !== 'OggS') return false;
  if ((buf[5] & 0x02) === 0) return false;
  const segCount = buf[26];
  const headerLen = 27 + segCount;
  if (buf.length < headerLen + 19) return false;
  if (buf.toString('ascii', headerLen, headerLen + 8) !== 'OpusHead') return false;
  const pageLen = headerLen + Array.from(buf.subarray(27, headerLen)).reduce((a, b) => a + b, 0);
  if (buf.length < pageLen) return false;
  const declaredCrc = buf.readUInt32LE(22);
  const copy = Buffer.from(buf.subarray(0, pageLen));
  copy.writeUInt32LE(0, 22);
  return computeOggCrc32(copy) === declaredCrc;
}

function transcodeToOggOpusPipe(audioBuf) {
  return new Promise((resolve, reject) => {
    const ff = spawn(
      'ffmpeg',
      ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-vn', '-c:a', 'libopus', '-b:a', '64k', '-vbr', 'on', '-ar', '48000', '-ac', '1', '-f', 'ogg', 'pipe:1'],
      { stdio: ['pipe', 'pipe', 'pipe'] }
    );

    const outChunks = [];
    const errChunks = [];
    let settled = false;

    const finishErr = (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    };

    ff.on('error', (err) => {
      finishErr(new Error(`ffmpeg tidak tersedia di server untuk konversi ke Ogg/Opus (${err.message}).`));
    });
    ff.stdout.on('data', (c) => outChunks.push(c));
    ff.stderr.on('data', (c) => errChunks.push(c));
    ff.on('close', (code) => {
      if (settled) return;
      settled = true;
      if (code === 0 && outChunks.length > 0) {
        const out = Buffer.concat(outChunks);
        if (validateOggOpusBuffer(out)) {
          resolve(out);
          return;
        }
      }
      const stderrText = Buffer.concat(errChunks).toString('utf8').trim();
      reject(new Error(stderrText || `Konversi audio ke Ogg/Opus gagal (exit code ${code}).`));
    });

    try {
      ff.stdin.end(audioBuf);
    } catch (e) {
      finishErr(e);
    }
  });
}

async function ensureValidOggOpusBuffer(audioBuf, audioMime = '') {
  const buf = Buffer.isBuffer(audioBuf) ? audioBuf : Buffer.from(audioBuf || []);
  if (buf.length < 32) {
    throw new Error('Buffer audio potongan terlalu kecil atau kosong.');
  }

  if (buf.toString('ascii', 0, 4) === 'OggS' && buf.subarray(0, Math.min(buf.length, 256)).includes('OpusHead')) {
    return buf;
  }

  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    return remuxWebmOpusToOggOpus(buf);
  }

  return transcodeToOggOpusPipe(buf);
}

module.exports = {
  computeOggCrc32,
  getOpusPacketSampleCount,
  remuxWebmOpusToOggOpus,
  validateOggOpusBuffer,
  transcodeToOggOpusPipe,
  ensureValidOggOpusBuffer
};
