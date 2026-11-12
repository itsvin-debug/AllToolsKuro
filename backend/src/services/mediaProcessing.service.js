import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import util from 'util';
import axios from 'axios';
import { PDFDocument, PDFName, PDFNumber, PDFRawStream } from 'pdf-lib';
import zlib from 'zlib';

const execPromise = util.promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, '../../uploads');
const tempDir = path.join(uploadsDir, 'temp');

// Pastikan direktori uploads dan temp ada
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

export function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Kompresi video dengan ffmpeg.
export async function compressVideoService({
  videoBase64,
  originalName = 'video.mp4',
  crf = 28,
  qualityPreset = 'balanced', // 'ultra_kb' | 'balanced' | 'high_hd'
  scale = 'original'         // 'original' | '720p' | '480p'
}) {
  const uid = Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const inputPath = path.join(tempDir, `input_${uid}.mp4`);
  const outputPath = path.join(uploadsDir, `kaze_compressed_${uid}.mp4`);

  try {
    const base64Data = videoBase64.replace(/^data:video\/[a-zA-Z0-9.-]+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(inputPath, buffer);

    const originalSize = buffer.length;

    let targetCrf = 28;
    let audioBitrate = '96k';
    let scaleFilter = '';

    if (qualityPreset === 'ultra_kb') {
      targetCrf = 33;
      audioBitrate = '64k';
      if (scale === 'original') {
        scaleFilter = '-vf "scale=trunc(iw/2)*2:trunc(ih/2)*2"';
      }
    } else if (qualityPreset === 'status_wa_1080p') {
      targetCrf = 19;
      audioBitrate = '160k';
    } else if (qualityPreset === 'high_hd') {
      targetCrf = 22;
      audioBitrate = '128k';
    } else {
      targetCrf = Number(crf) || 28;
      audioBitrate = '96k';
    }

    if (scale === '1080p') {
      scaleFilter = '-vf "scale=-2:1080"';
    } else if (scale === '720p') {
      scaleFilter = '-vf "scale=-2:720"';
    } else if (scale === '480p') {
      scaleFilter = '-vf "scale=-2:480"';
    } else if (!scaleFilter) {
      scaleFilter = '-vf "scale=trunc(iw/2)*2:trunc(ih/2)*2"';
    }

    const ffmpegCmd = `ffmpeg -y -i "${inputPath}" -c:v libx264 -crf ${targetCrf} -preset veryfast ${scaleFilter} -c:a aac -b:a ${audioBitrate} -pix_fmt yuv420p -movflags +faststart "${outputPath}"`;
    
    await execPromise(ffmpegCmd, { timeout: 120000 });

    if (!fs.existsSync(outputPath)) {
      throw new Error('Gagal menghasilkan file video hasil kompresi.');
    }

    const compressedStat = fs.statSync(outputPath);
    const compressedSize = compressedStat.size;
    const savingsBytes = originalSize - compressedSize;
    const savingsPercent = originalSize > 0 
      ? Math.max(0, Math.round((savingsBytes / originalSize) * 100)) 
      : 0;

    const fileName = path.basename(outputPath);
    const relativeUrl = `/uploads/${fileName}`;

    return {
      success: true,
      fileName,
      originalName,
      url: relativeUrl,
      originalSize,
      originalSizeFormatted: formatBytes(originalSize),
      compressedSize,
      compressedSizeFormatted: formatBytes(compressedSize),
      savingsPercent: `${savingsPercent}%`,
      savedFormatted: formatBytes(savingsBytes)
    };
  } finally {
    try {
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
    } catch {
      // ignore
    }
  }
}

// Penggabungan media (Audio & Video) via FFmpeg. Mendukung output Video MP4 jika ada video, atau Audio MP3 jika hanya audio.
export async function mergeAudiosService({ tracks = [] }) {
  if (!tracks || tracks.length === 0) {
    throw new Error('Tidak ada track media yang diberikan untuk digabungkan.');
  }

  const uid = Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const tempFiles = [];

  // Deteksi apakah ada track yang berupa video
  const videoTrackIndex = tracks.findIndex(t => 
    t.isVideo || 
    (t.base64 && t.base64.startsWith('data:video/')) || 
    (t.name && (t.name.endsWith('.mp4') || t.name.endsWith('.webm') || t.name.endsWith('.mov')))
  );

  const hasVideo = videoTrackIndex !== -1;

  try {
    if (hasVideo) {
      // ─── PENGGABUNGAN VIDEO DENGAN AUDIO -> OUTPUT MP4 ───
      const videoTrack = tracks[videoTrackIndex];
      const audioTracks = tracks.filter((_, idx) => idx !== videoTrackIndex);

      const videoInPath = path.join(tempDir, `video_in_${uid}.mp4`);
      const videoBase64 = (videoTrack.base64 || '').replace(/^data:video\/[a-zA-Z0-9.-]+;base64,/, '');
      fs.writeFileSync(videoInPath, Buffer.from(videoBase64, 'base64'));
      tempFiles.push(videoInPath);

      const vStartTime = Number(videoTrack.startTime) || 0;
      const vEndTime = Number(videoTrack.endTime) || 0;
      let vTimeFilter = `-ss ${vStartTime}`;
      if (vEndTime > vStartTime) {
        vTimeFilter += ` -to ${vEndTime}`;
      }

      const outputPath = path.join(uploadsDir, `kuro_merged_video_${uid}.mp4`);

      if (audioTracks.length > 0) {
        // Ambil audio track untuk disematkan ke video
        const audioTrack = audioTracks[0];
        const audioInPath = path.join(tempDir, `audio_in_${uid}.mp3`);
        const audioBase64 = (audioTrack.base64 || '').replace(/^data:[a-zA-Z0-9.-]+\/[a-zA-Z0-9.-]+;base64,/, '');
        fs.writeFileSync(audioInPath, Buffer.from(audioBase64, 'base64'));
        tempFiles.push(audioInPath);

        const aStartTime = Number(audioTrack.startTime) || 0;
        const aEndTime = Number(audioTrack.endTime) || 0;
        const aVol = Number(audioTrack.volume) || 1.0;
        let aTimeFilter = `-ss ${aStartTime}`;
        if (aEndTime > aStartTime) {
          aTimeFilter += ` -to ${aEndTime}`;
        }

        const audioTrimmedPath = path.join(tempDir, `audio_trimmed_${uid}.mp3`);
        const trimAudioCmd = `ffmpeg -y ${aTimeFilter} -i "${audioInPath}" -filter:a "volume=${aVol}" -ar 44100 -ac 2 "${audioTrimmedPath}"`;
        await execPromise(trimAudioCmd, { timeout: 45000 });
        tempFiles.push(audioTrimmedPath);

        // Gabungkan video dengan track audio baru via FFmpeg
        const mergeCmd = `ffmpeg -y ${vTimeFilter} -i "${videoInPath}" -i "${audioTrimmedPath}" -map 0:v:0 -map 1:a:0 -c:v libx264 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest "${outputPath}"`;
        await execPromise(mergeCmd, { timeout: 60000 });
      } else {
        // Hanya video yang dipotong durasinya
        const cutCmd = `ffmpeg -y ${vTimeFilter} -i "${videoInPath}" -c:v libx264 -pix_fmt yuv420p -c:a aac "${outputPath}"`;
        await execPromise(cutCmd, { timeout: 60000 });
      }

      if (!fs.existsSync(outputPath)) {
        throw new Error('Gagal menggabungkan file video dan audio.');
      }

      const stat = fs.statSync(outputPath);
      const fileName = path.basename(outputPath);
      return {
        success: true,
        isVideo: true,
        fileName,
        url: `/uploads/${fileName}`,
        size: stat.size,
        sizeFormatted: formatBytes(stat.size),
        totalTracksMerged: tracks.length
      };

    } else {
      // ─── PENGGABUNGAN AUDIO TRACK SAJA -> OUTPUT MP3 ───
      const trimmedFiles = [];
      const outputPath = path.join(uploadsDir, `kaze_merged_audio_${uid}.mp3`);
      const listFilePath = path.join(tempDir, `concat_list_${uid}.txt`);
      tempFiles.push(listFilePath);

      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        const trackInPath = path.join(tempDir, `track_in_${uid}_${i}.mp3`);
        const trackOutPath = path.join(tempDir, `track_trimmed_${uid}_${i}.mp3`);
        tempFiles.push(trackInPath, trackOutPath);

        const base64Data = (track.base64 || '').replace(/^data:[a-zA-Z0-9.-]+\/[a-zA-Z0-9.-]+;base64,/, '');
        fs.writeFileSync(trackInPath, Buffer.from(base64Data, 'base64'));

        const startTime = Number(track.startTime) || 0;
        const endTime = Number(track.endTime) || 0;
        const volume = Number(track.volume) || 1.0;

        let timeFilter = `-ss ${startTime}`;
        if (endTime > startTime) {
          timeFilter += ` -to ${endTime}`;
        }

        const trimCmd = `ffmpeg -y ${timeFilter} -i "${trackInPath}" -filter:a "volume=${volume}" -vn -ar 44100 -ac 2 -b:a 192k "${trackOutPath}"`;
        await execPromise(trimCmd, { timeout: 45000 });

        if (fs.existsSync(trackOutPath)) {
          trimmedFiles.push(trackOutPath);
        }
      }

      if (trimmedFiles.length === 0) {
        throw new Error('Tidak ada potongan audio yang berhasil diproses.');
      }

      const listContent = trimmedFiles.map(f => `file '${f.replace(/\\/g, '/')}'`).join('\n');
      fs.writeFileSync(listFilePath, listContent, 'utf8');

      const concatCmd = `ffmpeg -y -f concat -safe 0 -i "${listFilePath}" -c copy "${outputPath}"`;
      await execPromise(concatCmd, { timeout: 60000 });

      if (!fs.existsSync(outputPath)) {
        throw new Error('Gagal menggabungkan seluruh track audio.');
      }

      const stat = fs.statSync(outputPath);
      const fileName = path.basename(outputPath);
      return {
        success: true,
        isVideo: false,
        fileName,
        url: `/uploads/${fileName}`,
        size: stat.size,
        sizeFormatted: formatBytes(stat.size),
        totalTracksMerged: trimmedFiles.length
      };
    }
  } finally {
    tempFiles.forEach(f => {
      try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
    });
  }
}

// Simpan file lokal dan unggah ke CDN publik jika tersedia.
export async function uploadUniversalFileService({
  fileBase64,
  originalName = 'file',
  mimeType = ''
}) {
  if (!fileBase64) {
    throw new Error('File tidak boleh kosong.');
  }

  let detectedMime = mimeType;
  let ext = 'bin';

  const matches = fileBase64.match(/^data:([a-zA-Z0-9.-]+\/[a-zA-Z0-9.-]+);base64,(.+)$/);
  let buffer;

  if (matches && matches.length === 3) {
    detectedMime = matches[1];
    buffer = Buffer.from(matches[2], 'base64');
  } else {
    buffer = Buffer.from(fileBase64, 'base64');
  }

  const mimeLower = (detectedMime || '').toLowerCase();
  const nameExt = path.extname(originalName).toLowerCase().replace('.', '');

  if (mimeLower.includes('pdf') || nameExt === 'pdf') {
    ext = 'pdf';
    detectedMime = 'application/pdf';
  } else if (mimeLower.includes('mp4') || nameExt === 'mp4') {
    ext = 'mp4';
    detectedMime = 'video/mp4';
  } else if (mimeLower.includes('webm') || nameExt === 'webm') {
    ext = 'webm';
    detectedMime = 'video/webm';
  } else if (mimeLower.includes('png') || nameExt === 'png') {
    ext = 'png';
    detectedMime = 'image/png';
  } else if (mimeLower.includes('jpeg') || mimeLower.includes('jpg') || nameExt === 'jpg' || nameExt === 'jpeg') {
    ext = 'jpg';
    detectedMime = 'image/jpeg';
  } else if (mimeLower.includes('webp') || nameExt === 'webp') {
    ext = 'webp';
    detectedMime = 'image/webp';
  } else if (mimeLower.includes('gif') || nameExt === 'gif') {
    ext = 'gif';
    detectedMime = 'image/gif';
  } else if (nameExt) {
    ext = nameExt;
  }

  const uniqueId = Date.now() + '_' + Math.random().toString(36).substring(2, 8);
  const cleanBaseName = path.basename(originalName, path.extname(originalName)).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
  const fileName = `kaze_${cleanBaseName}_${uniqueId}.${ext}`;
  const filePath = path.join(uploadsDir, fileName);

  fs.writeFileSync(filePath, buffer);

  const localRelativeUrl = `/uploads/${fileName}`;
  let publicUrl = localRelativeUrl;

  // Coba unggah ke CDN publik Uguu agar bisa diakses internet
  try {
    const formData = new FormData();
    const blob = new Blob([buffer], { type: detectedMime || 'application/octet-stream' });
    formData.append('files[]', blob, fileName);

    const cloudRes = await axios.post('https://uguu.se/upload.php', formData, {
      timeout: 8000
    });

    if (cloudRes.data && cloudRes.data.success && Array.isArray(cloudRes.data.files) && cloudRes.data.files[0]?.url) {
      publicUrl = cloudRes.data.files[0].url;
    }
  } catch (err) {
    // Tetap gunakan localRelativeUrl jika CDN eksternal timeout
    publicUrl = localRelativeUrl;
  }

  let category = 'image';
  if (ext === 'pdf') category = 'pdf';
  else if (['mp4', 'webm', 'mov', 'mkv'].includes(ext)) category = 'video';
  else if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) category = 'audio';

  let markdownTag = `[${originalName}](${publicUrl})`;
  let htmlTag = `<a href="${publicUrl}" target="_blank" rel="noopener noreferrer">${originalName}</a>`;

  if (category === 'image') {
    markdownTag = `![${originalName}](${publicUrl})`;
    htmlTag = `<img src="${publicUrl}" alt="${originalName}" />`;
  } else if (category === 'video') {
    htmlTag = `<video src="${publicUrl}" controls width="640"></video>`;
  } else if (category === 'pdf') {
    htmlTag = `<iframe src="${publicUrl}" width="100%" height="600"></iframe>`;
  }

  return {
    success: true,
    category,
    fileName,
    originalName,
    ext,
    mimeType: detectedMime,
    url: publicUrl,
    localUrl: localRelativeUrl,
    sizeBytes: buffer.length,
    sizeFormatted: formatBytes(buffer.length),
    markdown: markdownTag,
    html: htmlTag
  };
}

// Pemotong durasi video dengan ffmpeg.
export async function trimVideoService({
  videoBase64,
  startTime = 0,
  endTime = 0,
  originalName = 'video.mp4'
}) {
  if (!videoBase64) {
    throw new Error('File video tidak boleh kosong.');
  }

  const startSec = Math.max(0, parseFloat(startTime) || 0);
  const endSec = parseFloat(endTime) || 0;

  if (endSec <= startSec) {
    throw new Error('Waktu selesai (End Time) harus lebih besar dari waktu mulai (Start Time).');
  }

  const durationSec = endSec - startSec;
  const uid = Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const ext = path.extname(originalName).toLowerCase() || '.mp4';
  const cleanBase = path.basename(originalName, ext).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 25);
  
  const inputPath = path.join(tempDir, `trim_in_${uid}${ext}`);
  const outputPath = path.join(uploadsDir, `kaze_trimmed_${cleanBase}_${uid}.mp4`);

  try {
    const base64Data = videoBase64.replace(/^data:[a-zA-Z0-9.-]+\/[a-zA-Z0-9.-]+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(inputPath, buffer);

    const originalSize = buffer.length;

    // Coba stream copy (-c copy) tanpa re-encoding
    let trimCmd = `ffmpeg -y -ss ${startSec} -to ${endSec} -i "${inputPath}" -c copy -avoid_negative_ts make_zero -movflags +faststart "${outputPath}"`;
    
    let execSuccess = false;
    try {
      await execPromise(trimCmd, { timeout: 60000 });
      if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1000) {
        execSuccess = true;
      }
    } catch (errCopy) {
      console.warn('Stream copy gagal pada potongan ini, beralih ke exact frame cut fallback... Detail:', errCopy.message);
    }

    // Fallback transcode jika stream copy gagal pada keyframe
    if (!execSuccess) {
      const fallbackCmd = `ffmpeg -y -ss ${startSec} -to ${endSec} -i "${inputPath}" -c:v libx264 -crf 18 -preset ultrafast -c:a aac -b:a 192k -movflags +faststart "${outputPath}"`;
      await execPromise(fallbackCmd, { timeout: 90000 });
    }

    if (!fs.existsSync(outputPath)) {
      throw new Error('Gagal menghasilkan file video hasil potongan.');
    }

    const stat = fs.statSync(outputPath);
    const fileName = path.basename(outputPath);
    const relativeUrl = `/uploads/${fileName}`;

    return {
      success: true,
      fileName,
      originalName,
      url: relativeUrl,
      duration: durationSec.toFixed(2),
      startTime: startSec,
      endTime: endSec,
      size: stat.size,
      sizeFormatted: formatBytes(stat.size),
      originalSizeFormatted: formatBytes(originalSize)
    };
  } finally {
    try {
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
    } catch {}
  }
}

// Layanan kompresi dokumen PDF aman tanpa merusak struktur halaman
export async function compressPdfService({
  pdfBase64,
  originalName = 'document.pdf',
  preset = 'optimal'
}) {
  if (!pdfBase64) {
    throw new Error('Data berkas PDF tidak boleh kosong.');
  }

  const cleanBase64 = pdfBase64.replace(/^data:application\/pdf;base64,/, '');
  const inputBuffer = Buffer.from(cleanBase64, 'base64');
  const originalSize = inputBuffer.length;

  const pdfDoc = await PDFDocument.load(inputBuffer, {
    ignoreEncryption: true,
    updateMetadata: false
  });

  // Hapus metadata XML bloat
  try {
    if (pdfDoc.catalog.has(PDFName.of('Metadata'))) {
      pdfDoc.catalog.delete(PDFName.of('Metadata'));
    }
  } catch {}

  const pages = pdfDoc.getPages();
  for (const page of pages) {
    try {
      if (page.node.has(PDFName.of('PieceInfo'))) page.node.delete(PDFName.of('PieceInfo'));
      if (page.node.has(PDFName.of('Thumb'))) page.node.delete(PDFName.of('Thumb'));
    } catch {}
  }

  // Parameter preset
  let jpegQuality = 58;
  let maxDimension = 1440;
  if (preset === 'extreme') {
    jpegQuality = 32;
    maxDimension = 960;
  } else if (preset === 'standard') {
    jpegQuality = 80;
    maxDimension = 2048;
  }

  // Optimasi image streams via sharp jika tersedia
  try {
    const sharpModule = await import('sharp');
    const sharp = sharpModule.default || sharpModule;

    const indirectObjects = pdfDoc.context.enumerateIndirectObjects();
    for (const [, obj] of indirectObjects) {
      if (obj instanceof PDFRawStream) {
        const subtype = obj.dict.get(PDFName.of('Subtype'))?.toString();
        if (subtype === '/Image' && obj.contents && obj.contents.length > 512) {
          const filter = obj.dict.get(PDFName.of('Filter'))?.toString() || '';
          const width = Number(obj.dict.get(PDFName.of('Width'))) || 0;
          const height = Number(obj.dict.get(PDFName.of('Height'))) || 0;
          const colorSpace = obj.dict.get(PDFName.of('ColorSpace'))?.toString() || '/DeviceRGB';

          let recompressed = null;
          let newW = width;
          let newH = height;

          if (filter.includes('DCTDecode')) {
            try {
              const meta = await sharp(obj.contents).metadata();
              const w = meta.width || width;
              const h = meta.height || height;
              let resizeOpts = {};
              if (w > maxDimension || h > maxDimension) {
                if (w >= h) {
                  resizeOpts = { width: maxDimension };
                  newW = maxDimension;
                  newH = Math.max(1, Math.round((h * maxDimension) / w));
                } else {
                  resizeOpts = { height: maxDimension };
                  newH = maxDimension;
                  newW = Math.max(1, Math.round((w * maxDimension) / h));
                }
              }
              let pipeline = sharp(obj.contents);
              if (resizeOpts.width || resizeOpts.height) {
                pipeline = pipeline.resize(resizeOpts);
              }
              recompressed = await pipeline.jpeg({ quality: jpegQuality }).toBuffer();
            } catch {}
          } else if (filter.includes('FlateDecode') || !filter || filter === 'undefined') {
            try {
              const inflated = zlib.inflateSync(Buffer.from(obj.contents));
              let channels = 3;
              if (colorSpace.includes('Gray')) channels = 1;
              else if (colorSpace.includes('CMYK')) channels = 4;

              if (width > 0 && height > 0 && inflated.length >= width * height * channels) {
                let pipeline = sharp(Buffer.from(inflated.slice(0, width * height * channels)), {
                  raw: { width, height, channels }
                });

                if (width > maxDimension || height > maxDimension) {
                  if (width >= height) {
                    newW = maxDimension;
                    newH = Math.max(1, Math.round((height * maxDimension) / width));
                    pipeline = pipeline.resize({ width: maxDimension });
                  } else {
                    newH = maxDimension;
                    newW = Math.max(1, Math.round((width * maxDimension) / height));
                    pipeline = pipeline.resize({ height: maxDimension });
                  }
                }

                recompressed = await pipeline.jpeg({ quality: jpegQuality }).toBuffer();
              }
            } catch {}
          }

          if (recompressed && recompressed.length < obj.contents.length) {
            obj.contents = recompressed;
            obj.dict.set(PDFName.of('Filter'), PDFName.of('DCTDecode'));
            obj.dict.set(PDFName.of('Length'), PDFNumber.of(recompressed.length));
            obj.dict.set(PDFName.of('ColorSpace'), PDFName.of('DeviceRGB'));
            obj.dict.set(PDFName.of('BitsPerComponent'), PDFNumber.of(8));
            obj.dict.delete(PDFName.of('DecodeParms'));
            if (newW && newH) {
              obj.dict.set(PDFName.of('Width'), PDFNumber.of(newW));
              obj.dict.set(PDFName.of('Height'), PDFNumber.of(newH));
            }
          }
        }
      }
    }
  } catch {}

  try {
    pdfDoc.setProducer('Kuro Studio PDF Optimizer');
    pdfDoc.setCreator('Kuro Studio');
  } catch {}

  const compressedBytes = await pdfDoc.save({
    useObjectStreams: true,
    addDefaultPage: false,
    updateFieldAppearances: false
  });

  let finalBuffer = Buffer.from(compressedBytes);
  if (finalBuffer.length > originalSize) {
    finalBuffer = inputBuffer;
  }

  const uid = Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const cleanBase = path.basename(originalName, '.pdf').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
  const fileName = `kuro_compressed_${cleanBase}_${uid}.pdf`;
  const outputPath = path.join(uploadsDir, fileName);

  fs.writeFileSync(outputPath, finalBuffer);

  const compressedSize = finalBuffer.length;
  const savingsBytes = Math.max(0, originalSize - compressedSize);
  const savingsPercent = originalSize > 0
    ? Math.round((savingsBytes / originalSize) * 100)
    : 0;

  return {
    success: true,
    fileName,
    originalName,
    url: `/uploads/${fileName}`,
    pageCount: pdfDoc.getPageCount(),
    originalSize,
    originalSizeFormatted: formatBytes(originalSize),
    compressedSize,
    compressedSizeFormatted: formatBytes(compressedSize),
    savingsPercent: `${savingsPercent}%`,
    savedFormatted: formatBytes(savingsBytes),
    preset
  };
}
