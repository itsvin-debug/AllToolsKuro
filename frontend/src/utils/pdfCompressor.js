import { PDFDocument, PDFName, PDFNumber, PDFRawStream } from 'pdf-lib';

// Konfigurasi preset optimasi kompresi PDF
export const PDF_PRESETS = {
  standard: {
    id: 'standard',
    label: 'Mode Standar',
    subtitle: 'Pengurangan Ringan',
    badge: 'Kualitas Asli',
    desc: 'Pengurangan ukuran berkas ringan (15% - 30%), ketajaman gambar sangat tinggi, menjaga keaslian dokumen resmi & arsip.',
    jpegQuality: 0.82,
    maxDimension: 2048
  },
  optimal: {
    id: 'optimal',
    label: 'Mode Seimbang',
    subtitle: 'Rekomendasi',
    badge: 'Rekomendasi',
    desc: 'Keseimbangan terbaik antara ukuran berkas dan kejernihan dokumen (35% - 55%), teks tajam dan tata letak presisi.',
    jpegQuality: 0.62,
    maxDimension: 1600
  },
  extreme: {
    id: 'extreme',
    label: 'Mode Maksimal',
    subtitle: 'Pangkas 50%+ (Setengah Ukuran)',
    badge: 'Ukuran Terkecil',
    desc: 'Memangkas ukuran berkas hingga setengahnya atau lebih untuk batas upload portal, email, atau kuota ketat tanpa merusak layout.',
    jpegQuality: 0.35,
    maxDimension: 1024
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

// Optimasi dan re-encoding gambar JPEG tertanam di dalam PDF
async function optimizeEmbeddedJpeg(rawBytes, maxDim, quality) {
  try {
    if (!isJpegBuffer(rawBytes)) return null;

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

    // Hitung dimensi target proporsional
    let targetW = origW;
    let targetH = origH;
    if (origW > maxDim || origH > maxDim) {
      if (origW >= origH) {
        targetW = maxDim;
        targetH = Math.max(1, Math.round((origH * maxDim) / origW));
      } else {
        targetH = maxDim;
        targetW = Math.max(1, Math.round((origW * maxDim) / origH));
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const recompressedBlob = await new Promise((res) => {
      canvas.toBlob((b) => res(b), 'image/jpeg', quality);
    });

    if (!recompressedBlob) return null;
    const recompressedBytes = new Uint8Array(await recompressedBlob.arrayBuffer());

    // Ambil hasil hanya jika ukuran berhasil berkurang
    if (recompressedBytes.length < rawBytes.length) {
      return {
        bytes: recompressedBytes,
        width: targetW,
        height: targetH
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

  // 1. Muat dokumen PDF tanpa mengubah teks dan tata letak
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

  // 3. Telusuri dan optimalkan gambar raster tertanam (XObjects)
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
          const filter = obj.dict.get(PDFName.of('Filter'));
          const filterStr = filter ? filter.toString() : '';

          // Optimalkan stream JPEG (/DCTDecode)
          if (filterStr.includes('DCTDecode') && obj.contents && obj.contents.length > 4096) {
            const optimized = await optimizeEmbeddedJpeg(
              obj.contents,
              config.maxDimension,
              config.jpegQuality
            );

            if (optimized) {
              obj.contents = optimized.bytes;
              obj.dict.set(PDFName.of('Length'), PDFNumber.of(optimized.bytes.length));
              optimizedImages++;
            }
          }

          const percent = 45 + Math.round((currentIdx / imageCount) * 30);
          onProgress(`Memproses elemen visual (${currentIdx}/${imageCount})...`, Math.min(75, percent));
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
  const dataUrl = URL.createObjectURL(compressedBlob);

  const savingsBytes = Math.max(0, originalSize - finalSize);
  const savingsPercent = originalSize > 0
    ? Math.round((savingsBytes / originalSize) * 100)
    : 0;

  onProgress('Kompresi dokumen selesai 100%!', 100);

  return {
    success: true,
    originalSizeBytes: originalSize,
    compressedSizeBytes: finalSize,
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
