/**
 * Kuro Studio - Image Super-Resolution & Clarity Enhancer
 * Penajaman dan peningkatan resolusi foto tanpa mengubah warna asli.
 * Menggunakan transformasi ruang warna YCbCr (Rec. 601) sehingga hanya kanal
 * luminansi (Y) yang dipertajam, sedangkan krominansi warna (Cb, Cr) tetap 100% identik.
 */

function multiStepUpscale(sourceCanvas, targetWidth, targetHeight) {
  let curCanvas = sourceCanvas;
  let curW = sourceCanvas.width;
  let curH = sourceCanvas.height;

  // Lakukan perbesaran bertahap per 1.5x agar interpolasi piksel tetap halus
  while (curW * 1.5 < targetWidth || curH * 1.5 < targetHeight) {
    const nextW = Math.min(targetWidth, Math.round(curW * 1.5));
    const nextH = Math.min(targetHeight, Math.round(curH * 1.5));

    const stepCanvas = document.createElement('canvas');
    stepCanvas.width = nextW;
    stepCanvas.height = nextH;
    const stepCtx = stepCanvas.getContext('2d');
    stepCtx.imageSmoothingEnabled = true;
    stepCtx.imageSmoothingQuality = 'high';
    stepCtx.drawImage(curCanvas, 0, 0, nextW, nextH);

    curCanvas = stepCanvas;
    curW = nextW;
    curH = nextH;
  }

  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = targetWidth;
  finalCanvas.height = targetHeight;
  const finalCtx = finalCanvas.getContext('2d');
  finalCtx.imageSmoothingEnabled = true;
  finalCtx.imageSmoothingQuality = 'high';
  finalCtx.drawImage(curCanvas, 0, 0, targetWidth, targetHeight);

  return finalCanvas;
}

/**
 * Penajaman Luminance dalam ruang warna YCbCr standar ITU-R BT.601.
 * Menjaga warna asli (Cb dan Cr) tidak bergeser sama sekali.
 */
function applyColorPreservingSharpen(ctx, width, height, amount = 1.35) {
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  const totalPixels = width * height;

  const yChan = new Float32Array(totalPixels);
  const cbChan = new Float32Array(totalPixels);
  const crChan = new Float32Array(totalPixels);

  // 1. Konversi RGB ke YCbCr
  for (let i = 0, p = 0; p < totalPixels; i += 4, p++) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    yChan[p] = 0.299 * r + 0.587 * g + 0.114 * b;
    cbChan[p] = -0.168736 * r - 0.331264 * g + 0.5 * b;
    crChan[p] = 0.5 * r - 0.418688 * g - 0.081312 * b;
  }

  const strength = Math.min(2.2, Math.max(0.4, amount));
  const w = width;
  const h = height;
  const noiseThreshold = 1.5;

  // 2. Unsharp masking pada kanal luminansi Y saja
  for (let y = 1; y < h - 1; y++) {
    const rowOffset = y * w;
    for (let x = 1; x < w - 1; x++) {
      const idx = rowOffset + x;
      const centerY = yChan[idx];
      const topY = yChan[idx - w];
      const bottomY = yChan[idx + w];
      const leftY = yChan[idx - 1];
      const rightY = yChan[idx + 1];

      // Laplacian kernel
      const edgeDiff = (4 * centerY) - (topY + bottomY + leftY + rightY);

      if (Math.abs(edgeDiff) > noiseThreshold) {
        const deltaY = Math.max(-28, Math.min(28, edgeDiff * 0.22 * strength));
        const newY = Math.max(0, Math.min(255, centerY + deltaY));

        const cb = cbChan[idx];
        const cr = crChan[idx];

        // 3. Konversi kembali YCbCr ke RGB murni
        const rNew = newY + 1.402 * cr;
        const gNew = newY - 0.344136 * cb - 0.714136 * cr;
        const bNew = newY + 1.772 * cb;

        const pixelIdx = idx * 4;
        data[pixelIdx] = Math.max(0, Math.min(255, Math.round(rNew)));
        data[pixelIdx + 1] = Math.max(0, Math.min(255, Math.round(gNew)));
        data[pixelIdx + 2] = Math.max(0, Math.min(255, Math.round(bNew)));
        // Kanal alpha data[pixelIdx + 3] tetap dipertahankan
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

/**
 * Meningkatkan resolusi dan ketajaman detail tanpa merusak atau mengubah saturasi warna asli.
 * @param {HTMLImageElement} imgElement
 * @param {Object} options
 * @returns {Promise<{ dataUrl: string, width: number, height: number, sizeBytes: number }>}
 */
export async function enhanceImageToSuperHd(imgElement, options = {}) {
  const {
    upscaleFactor = 2,
    sharpenStrength = 1.35,
    targetFormat = 'image/jpeg',
    quality = 0.96
  } = options;

  const originalWidth = imgElement.naturalWidth || imgElement.width;
  const originalHeight = imgElement.naturalHeight || imgElement.height;

  let targetW = Math.round(originalWidth * upscaleFactor);
  let targetH = Math.round(originalHeight * upscaleFactor);

  const maxDimension = Math.max(targetW, targetH);
  if (maxDimension < 2160) {
    const scaleRatio = 2160 / maxDimension;
    targetW = Math.round(targetW * scaleRatio);
    targetH = Math.round(targetH * scaleRatio);
  } else if (maxDimension > 4096) {
    const scaleRatio = 4096 / maxDimension;
    targetW = Math.round(targetW * scaleRatio);
    targetH = Math.round(targetH * scaleRatio);
  }

  // 1. Gambar ke canvas awal
  const baseCanvas = document.createElement('canvas');
  baseCanvas.width = originalWidth;
  baseCanvas.height = originalHeight;
  const baseCtx = baseCanvas.getContext('2d');
  baseCtx.drawImage(imgElement, 0, 0);

  // 2. Multi-step bicubic upscale
  const scaledCanvas = multiStepUpscale(baseCanvas, targetW, targetH);
  const scaledCtx = scaledCanvas.getContext('2d');

  // 3. Penajaman berbasis kanal luminansi (menjamin warna tidak berubah)
  applyColorPreservingSharpen(scaledCtx, targetW, targetH, sharpenStrength);

  // 4. Ekspor ke data URL
  const dataUrl = scaledCanvas.toDataURL(targetFormat, quality);

  const head = `data:${targetFormat};base64,`;
  const base64Str = dataUrl.substring(head.length);
  const sizeBytes = atob(base64Str).length;

  return {
    dataUrl,
    width: targetW,
    height: targetH,
    sizeBytes
  };
}
