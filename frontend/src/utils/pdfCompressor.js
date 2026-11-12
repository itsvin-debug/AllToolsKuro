import { PDFDocument, PDFName, PDFNumber, PDFRawStream } from 'pdf-lib';

// Konfigurasi preset optimasi kompresi PDF
export const PDF_PRESETS = {
  optimal: {
    id: 'optimal',
    label: 'Optimal & Seimbang',
    badge: 'Rekomendasi',
    desc: 'Kompresi cerdas objek dan gambar, font tetap tajam, ukuran susut 40% - 70%.',
    jpegQuality: 0.70,
    maxDimension: 1600
  },
  extreme: {
    id: 'extreme',
    label: 'Ekstrem (Dokumen Ringan)',
    badge: 'Maksimal',
    desc: 'Ukuran sekecil mungkin untuk upload portal CPNS/tugas dengan batas berkas ketat.',
    jpegQuality: 0.45,
    maxDimension: 1080
  },
  high_quality: {
    id: 'high_quality',
    label: 'Kualitas Tinggi (Portofolio)',
    badge: 'Presisi HD',
    desc: 'Mempertahankan resolusi tinggi untuk dicetak atau dokumen kontrak resmi.',
    jpegQuality: 0.88,
    maxDimension: 2200
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
function loadImageElement(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Gagal memproses gambar tertanam.'));
    img.src = dataUrl;
  });
}

// Optimasi dan re-encoding gambar raster di dalam memori browser
async function optimizeRasterBytes(rawBytes, isJpeg, maxDim, quality) {
  try {
    const mime = isJpeg ? 'image/jpeg' : 'image/png';
    const blob = new Blob([rawBytes], { type: mime });
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
        targetH = Math.round((origH * maxDim) / origW);
      } else {
        targetH = maxDim;
        targetW = Math.round((origW * maxDim) / origH);
      }
    }

    // Gambar ulang di kanvas untuk re-encoding
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Latar putih jika ada transparansi pada konversi ke JPEG
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const recompressedBlob = await new Promise((res) => {
      canvas.toBlob((b) => res(b), 'image/jpeg', quality);
    });

    if (!recompressedBlob) return null;
    const recompressedBytes = new Uint8Array(await recompressedBlob.arrayBuffer());

    // Ambil hasil jika ukuran berkurang
    if (recompressedBytes.length < rawBytes.length) {
      return {
        bytes: recompressedBytes,
        width: targetW,
        height: targetH
      };
    }
  } catch {
    // Lewati jika format stream gambar tidak didukung kanvas
  }
  return null;
}

// Fungsi utama kompresi dokumen PDF
export async function compressPdfDocument(inputData, options = {}) {
  const {
    preset = 'optimal',
    onProgress = () => {}
  } = options;

  const config = PDF_PRESETS[preset] || PDF_PRESETS.optimal;

  onProgress('Membaca struktur internal dokumen PDF...', 15);
  const arrayBuffer = await toArrayBuffer(inputData);
  const originalSize = arrayBuffer.byteLength;

  // Muat dokumen PDF tanpa mengubah metadata teks/vektor
  const pdfDoc = await PDFDocument.load(arrayBuffer, {
    ignoreEncryption: true,
    updateMetadata: false
  });

  const pageCount = pdfDoc.getPageCount();
  onProgress(`Menganalisis ${pageCount} halaman dokumen...`, 30);

  // Telusuri seluruh objek internal untuk mengompresi gambar tertanam
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

          // Deteksi apakah JPEG (/DCTDecode) atau Flate/PNG (/FlateDecode)
          const isJpeg = filterStr.includes('DCTDecode');
          const isFlate = filterStr.includes('FlateDecode');

          if ((isJpeg || isFlate) && obj.contents && obj.contents.length > 5120) {
            const optimized = await optimizeRasterBytes(
              obj.contents,
              isJpeg,
              config.maxDimension,
              config.jpegQuality
            );

            if (optimized) {
              obj.contents = optimized.bytes;
              obj.dict.set(PDFName.of('Filter'), PDFName.of('DCTDecode'));
              obj.dict.set(PDFName.of('Length'), PDFNumber.of(optimized.bytes.length));
              optimizedImages++;
            }
          }

          const percent = 45 + Math.round((currentIdx / imageCount) * 35);
          onProgress(`Memproses elemen visual (${currentIdx}/${imageCount})...`, Math.min(80, percent));
        }
      }
    }
  }

  onProgress('Mengemas objek dalam Object Stream PDF 1.5...', 85);

  // Bersihkan identitas duplikat di trailer tanpa mengganggu isi
  try {
    pdfDoc.setProducer('Kuro Studio PDF Optimizer');
    pdfDoc.setCreator('Kuro Studio');
  } catch {}

  // Simpan dengan Object Streams aktif untuk kompresi struktur kamus PDF
  const compressedBytes = await pdfDoc.save({
    useObjectStreams: true,
    addDefaultPage: false,
    updateFieldAppearances: false
  });

  onProgress('Menyusun pratinjau dokumen...', 95);

  const compressedBlob = new Blob([compressedBytes], { type: 'application/pdf' });
  const dataUrl = URL.createObjectURL(compressedBlob);

  const newSize = compressedBytes.length;
  const savingsBytes = Math.max(0, originalSize - newSize);
  const savingsPercent = originalSize > 0
    ? Math.round((savingsBytes / originalSize) * 100)
    : 0;

  onProgress('Kompresi selesai!', 100);

  return {
    success: true,
    originalSizeBytes: originalSize,
    compressedSizeBytes: newSize,
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
