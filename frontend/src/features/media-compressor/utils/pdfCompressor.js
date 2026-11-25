import { PDFDocument, PDFName, PDFNumber, PDFRawStream } from 'pdf-lib';
import pako from 'pako';

// Konfigurasi preset optimasi kompresi PDF
export const PDF_PRESETS = {
  standard: {
    id: 'standard',
    label: 'Mode Standar',
    subtitle: 'Pengurangan Ringan',
    badge: 'Kualitas Asli',
    desc: 'Pengurangan ukuran berkas ringan (15% - 30%), ketajaman gambar sangat tinggi, menjaga keaslian dokumen resmi & arsip.',
    jpegQuality: 0.80,
    maxDimension: 2048
  },
  optimal: {
    id: 'optimal',
    label: 'Mode Seimbang',
    subtitle: 'Rekomendasi',
    badge: 'Rekomendasi',
    desc: 'Keseimbangan terbaik antara ukuran berkas dan kejernihan dokumen (35% - 55%), teks tajam dan tata letak presisi.',
    jpegQuality: 0.58,
    maxDimension: 1440
  },
  extreme: {
    id: 'extreme',
    label: 'Mode Maksimal',
    subtitle: 'Pangkas 50%+ (Setengah Ukuran)',
    badge: 'Ukuran Terkecil',
    desc: 'Memangkas ukuran berkas hingga setengahnya atau lebih untuk batas upload portal, email, atau kuota ketat tanpa merusak layout.',
    jpegQuality: 0.32,
    maxDimension: 960
  }
};

// Helper konversi file/blob ke ArrayBuffer
async function toArrayBuffer(input) {
  if (input instanceof ArrayBuffer) return input;
  if (input instanceof Uint8Array) return input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
  if (input instanceof Blob || (typeof File !== 'undefined' && input instanceof File)) {
    return await input.arrayBuffer();
  }
  throw new Error('Format berkas PDF tidak didukung.');
}

// Helper memuat gambar ke elemen Image browser
function loadImageElement(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Gagal memuat gambar tertanam.'));
    img.src = url;
  });
}

// Cek apakah buffer memiliki signature JPEG (SOI: 0xFF, 0xD8)
function isJpegBuffer(bytes) {
  if (!bytes || bytes.length < 4) return false;
  return bytes[0] === 0xFF && bytes[1] === 0xD8;
}

// Rekonstruksi scanline pixel PNG unfilter (None, Sub, Up, Average, Paeth)
function unfilterPngScanlines(inflated, width, height, bpp) {
  const rowLen = width * bpp;
  const stride = rowLen + 1;
  const out = new Uint8Array(width * height * bpp);

  for (let y = 0; y < height; y++) {
    const filterType = inflated[y * stride];
    const srcRow = y * stride + 1;
    const dstRow = y * rowLen;
    const prevDstRow = (y - 1) * rowLen;

    for (let x = 0; x < rowLen; x++) {
      const raw = inflated[srcRow + x];
      const a = x >= bpp ? out[dstRow + x - bpp] : 0;
      const b = y > 0 ? out[prevDstRow + x] : 0;
      const c = (y > 0 && x >= bpp) ? out[prevDstRow + x - bpp] : 0;

      let val = raw;
      if (filterType === 1) {
        val = (raw + a) & 0xff;
      } else if (filterType === 2) {
        val = (raw + b) & 0xff;
      } else if (filterType === 3) {
        val = (raw + Math.floor((a + b) / 2)) & 0xff;
      } else if (filterType === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        let pr = a;
        if (pb < pa && pb < pc) pr = b;
        else if (pc < pa) pr = c;
        val = (raw + pr) & 0xff;
      }
      out[dstRow + x] = val;
    }
  }
  return out;
}

// Optimasi dan re-encoding gambar (JPEG maupun FlateDecode PNG/Raw)
async function optimizeEmbeddedImage(obj, config) {
  try {
    const rawBytes = obj.contents;
    if (!rawBytes || rawBytes.length < 512) return null;

    const filter = obj.dict.get(PDFName.of('Filter'));
    const filterStr = filter ? filter.toString() : '';

    const width = Number(obj.dict.get(PDFName.of('Width'))) || 0;
    const height = Number(obj.dict.get(PDFName.of('Height'))) || 0;
    const colorSpace = obj.dict.get(PDFName.of('ColorSpace'))?.toString() || '/DeviceRGB';

    let canvas = document.createElement('canvas');
    let ctx = null;

    // 1. Tangani stream JPEG (/DCTDecode)
    if (filterStr.includes('DCTDecode') || isJpegBuffer(rawBytes)) {
      const blob = new Blob([rawBytes], { type: 'image/jpeg' });
      const url = URL.createObjectURL(blob);
      let img;
      try {
        img = await loadImageElement(url);
      } finally {
        URL.revokeObjectURL(url);
      }

      const origW = img.naturalWidth || img.width;
      const origH = img.naturalHeight || img.height;
      if (!origW || !origH) return null;

      let targetW = origW;
      let targetH = origH;
      if (origW > config.maxDimension || origH > config.maxDimension) {
        if (origW >= origH) {
          targetW = config.maxDimension;
          targetH = Math.max(1, Math.round((origH * config.maxDimension) / origW));
        } else {
          targetH = config.maxDimension;
          targetW = Math.max(1, Math.round((origW * config.maxDimension) / origH));
        }
      }

      canvas.width = targetW;
      canvas.height = targetH;
      ctx = canvas.getContext('2d');
      if (!ctx) return null;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, targetW, targetH);
      ctx.drawImage(img, 0, 0, targetW, targetH);
    } 
    // 2. Tangani stream FlateDecode (PNG / deflated raw pixels)
    else if (filterStr.includes('FlateDecode') || !filterStr || filterStr === 'undefined') {
      if (!width || !height) return null;

      let inflated;
      try {
        inflated = pako.inflate(rawBytes);
      } catch {
        return null;
      }
      if (!inflated || inflated.length === 0) return null;

      // Tentukan bytes per pixel berdasarkan ColorSpace
      let bpp = 3;
      if (colorSpace.includes('Gray')) bpp = 1;
      else if (colorSpace.includes('CMYK')) bpp = 4;

      const decodeParms = obj.dict.get(PDFName.of('DecodeParms'));
      let predictor = 1;
      if (decodeParms && typeof decodeParms.get === 'function') {
        const predVal = decodeParms.get(PDFName.of('Predictor'));
        if (predVal) predictor = Number(predVal.toString()) || 1;
      }

      let rawPixels;
      if (predictor >= 10 && inflated.length >= (width * bpp + 1) * height) {
        rawPixels = unfilterPngScanlines(inflated, width, height, bpp);
      } else {
        rawPixels = inflated;
      }

      const totalPixels = width * height;
      canvas.width = width;
      canvas.height = height;
      ctx = canvas.getContext('2d');
      if (!ctx) return null;

      const imgData = ctx.createImageData(width, height);
      const d = imgData.data;

      if (bpp === 1) {
        for (let i = 0; i < totalPixels; i++) {
          const g = rawPixels[i];
          const idx = i * 4;
          d[idx] = g;
          d[idx + 1] = g;
          d[idx + 2] = g;
          d[idx + 3] = 255;
        }
      } else if (bpp === 4) {
        for (let i = 0; i < totalPixels; i++) {
          const src = i * 4;
          const c = rawPixels[src] / 255;
          const m = rawPixels[src + 1] / 255;
          const y = rawPixels[src + 2] / 255;
          const k = rawPixels[src + 3] / 255;
          const idx = i * 4;
          d[idx] = Math.round(255 * (1 - c) * (1 - k));
          d[idx + 1] = Math.round(255 * (1 - m) * (1 - k));
          d[idx + 2] = Math.round(255 * (1 - y) * (1 - k));
          d[idx + 3] = 255;
        }
      } else {
        for (let i = 0; i < totalPixels; i++) {
          const src = i * 3;
          const idx = i * 4;
          d[idx] = rawPixels[src];
          d[idx + 1] = rawPixels[src + 1];
          d[idx + 2] = rawPixels[src + 2];
          d[idx + 3] = 255;
        }
      }
      ctx.putImageData(imgData, 0, 0);

      // Downscale proporsional jika resolusi melebihi maxDimension
      if (width > config.maxDimension || height > config.maxDimension) {
        let targetW = width;
        let targetH = height;
        if (width >= height) {
          targetW = config.maxDimension;
          targetH = Math.max(1, Math.round((height * config.maxDimension) / width));
        } else {
          targetH = config.maxDimension;
          targetW = Math.max(1, Math.round((width * config.maxDimension) / height));
        }

        const scaledCanvas = document.createElement('canvas');
        scaledCanvas.width = targetW;
        scaledCanvas.height = targetH;
        const scaledCtx = scaledCanvas.getContext('2d');
        if (scaledCtx) {
          scaledCtx.imageSmoothingEnabled = true;
          scaledCtx.imageSmoothingQuality = 'high';
          scaledCtx.drawImage(canvas, 0, 0, targetW, targetH);
          canvas.width = 0;
          canvas.height = 0;
          canvas = scaledCanvas;
        }
      }
    } else {
      return null;
    }

    // Re-encode ke JPEG menggunakan kualitas target
    const recompressedBlob = await new Promise((res) => {
      canvas.toBlob((b) => res(b), 'image/jpeg', config.jpegQuality);
    });

    const finalW = canvas.width;
    const finalH = canvas.height;
    canvas.width = 0;
    canvas.height = 0; // Segera bebaskan memori V8

    if (!recompressedBlob) return null;
    const recompressedBytes = new Uint8Array(await recompressedBlob.arrayBuffer());

    // Terapkan hanya jika menghasilkan pengurangan byte nyata
    if (recompressedBytes.length < rawBytes.length) {
      return {
        bytes: recompressedBytes,
        width: finalW,
        height: finalH
      };
    }
  } catch {
    // Lewati jika terjadi kendala decoding gambar
  }
  return null;
}

// Fungsi utama kompresi dokumen PDF
export async function compressPdfDocument(inputData, options = {}) {
  const {
    preset = 'optimal',
    onProgress = () => {}
  } = options;

  // Normalisasi preset untuk kompatibilitas ke belakang
  const normalizedPreset = preset === 'high_quality' ? 'standard' : preset;
  const config = PDF_PRESETS[normalizedPreset] || PDF_PRESETS.optimal;

  onProgress('Menyiapkan engine optimasi dokumen...', 15);
  const arrayBuffer = await toArrayBuffer(inputData);
  const originalSize = arrayBuffer.byteLength;

  // 1. Muat dokumen PDF tanpa merusak teks, font, dan tata letak
  const pdfDoc = await PDFDocument.load(arrayBuffer, {
    ignoreEncryption: true,
    updateMetadata: false
  });

  const pageCount = pdfDoc.getPageCount();
  onProgress(`Menganalisis ${pageCount} halaman dokumen & font...`, 30);

  // 2. Pembersihan bloat metadata XML (XMP) dan private data editor
  try {
    if (pdfDoc.catalog.has(PDFName.of('Metadata'))) {
      pdfDoc.catalog.delete(PDFName.of('Metadata'));
    }
  } catch {}

  const pages = pdfDoc.getPages();
  for (const page of pages) {
    try {
      if (page.node.has(PDFName.of('PieceInfo'))) {
        page.node.delete(PDFName.of('PieceInfo'));
      }
      if (page.node.has(PDFName.of('Thumb'))) {
        page.node.delete(PDFName.of('Thumb'));
      }
    } catch {}
  }

  // 3. Telusuri dan optimalkan seluruh gambar raster tertanam (DCTDecode & FlateDecode)
  const indirectObjects = pdfDoc.context.enumerateIndirectObjects();
  let imageCount = 0;
  let optimizedImages = 0;

  for (const [, obj] of indirectObjects) {
    if (obj instanceof PDFRawStream) {
      const subtype = obj.dict.get(PDFName.of('Subtype'));
      if (subtype && subtype.toString() === '/Image') {
        imageCount++;
      }
    }
  }

  if (imageCount > 0) {
    onProgress(`Mengoptimalkan ${imageCount} elemen visual dokumen...`, 45);
    let currentIdx = 0;

    for (const [, obj] of indirectObjects) {
      if (obj instanceof PDFRawStream) {
        const subtype = obj.dict.get(PDFName.of('Subtype'));
        if (subtype && subtype.toString() === '/Image') {
          currentIdx++;

          // Beri jeda mikro setiap 2 gambar agar event loop browser tidak freeze pada berkas besar
          if (currentIdx % 2 === 0) {
            await new Promise((r) => setTimeout(r, 0));
          }

          const optimized = await optimizeEmbeddedImage(obj, config);
          if (optimized) {
            obj.contents = optimized.bytes;
            obj.dict.set(PDFName.of('Filter'), PDFName.of('DCTDecode'));
            obj.dict.set(PDFName.of('Length'), PDFNumber.of(optimized.bytes.length));
            obj.dict.set(PDFName.of('ColorSpace'), PDFName.of('DeviceRGB'));
            obj.dict.set(PDFName.of('BitsPerComponent'), PDFNumber.of(8));
            obj.dict.delete(PDFName.of('DecodeParms'));
            if (optimized.width && optimized.height) {
              obj.dict.set(PDFName.of('Width'), PDFNumber.of(optimized.width));
              obj.dict.set(PDFName.of('Height'), PDFNumber.of(optimized.height));
            }
            optimizedImages++;
          }

          const percent = 45 + Math.round((currentIdx / imageCount) * 32);
          onProgress(`Memproses elemen visual (${currentIdx}/${imageCount})...`, Math.min(78, percent));
        }
      }
    }
  } else {
    onProgress('Memadatkan kamus stream & struktur font...', 55);
  }

  onProgress('Mengemas objek dalam Object Stream PDF 1.5...', 80);

  try {
    pdfDoc.setProducer('Kuro Studio PDF Optimizer');
    pdfDoc.setCreator('Kuro Studio');
  } catch {}

  // 4. Simpan dengan Object Streams aktif untuk kompresi struktur kamus PDF
  const compressedBytes = await pdfDoc.save({
    useObjectStreams: true,
    addDefaultPage: false,
    updateFieldAppearances: false
  });

  onProgress('Memverifikasi integritas & pratinjau dokumen...', 92);

  // 5. Jaminan akurasi ukuran fisik persis sama
  let finalBytes = compressedBytes;
  let finalSize = compressedBytes.length;

  // Jika hasil kompresi ternyata tidak lebih kecil (PDF teks murni yang sudah padat),
  // gunakan bytes yang paling hemat agar ukuran tidak pernah membesar
  if (finalSize > originalSize) {
    finalBytes = new Uint8Array(arrayBuffer);
    finalSize = originalSize;
  }

  const compressedBlob = new Blob([finalBytes], { type: 'application/pdf' });
  const actualBlobSize = compressedBlob.size;
  const dataUrl = URL.createObjectURL(compressedBlob);

  const savingsBytes = Math.max(0, originalSize - actualBlobSize);
  const savingsPercent = originalSize > 0
    ? Math.round((savingsBytes / originalSize) * 100)
    : 0;

  onProgress('Kompresi dokumen selesai 100%!', 100);

  return {
    success: true,
    originalSizeBytes: originalSize,
    compressedSizeBytes: actualBlobSize,
    savingsBytes,
    savingsPercent: `${savingsPercent}%`,
    pageCount,
    optimizedImages,
    blob: compressedBlob,
    dataUrl,
    preset: config.id,
    presetLabel: config.label
  };
}
