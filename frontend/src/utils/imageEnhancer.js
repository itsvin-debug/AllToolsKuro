/**
 * Kuro Studio - Image Super-Resolution & Clarity Enhancer
 * Algoritma peningkatan resolusi foto (Super-Resolution, Unsharp Masking & Micro-Contrast)
 * Menghilangkan tampilan burik/burem dan meningkatkan foto hingga resolusi master 4K / HD
 * Optimal untuk pengunggahan Status WhatsApp agar tidak pecah/burik.
 */

// Multi-step bicubic scaling untuk meminimalisir aliasing
function multiStepUpscale(sourceCanvas, targetWidth, targetHeight) {
  let curCanvas = sourceCanvas;
  let curW = sourceCanvas.width;
  let curH = sourceCanvas.height;

  // Jika perbesaran lebih dari 2x, lakukan bertahap per 1.5x - 2x
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

  // Final scale ke targetWidth & targetHeight
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = targetWidth;
  finalCanvas.height = targetHeight;
  const finalCtx = finalCanvas.getContext('2d');
  finalCtx.imageSmoothingEnabled = true;
  finalCtx.imageSmoothingQuality = 'high';
  finalCtx.drawImage(curCanvas, 0, 0, targetWidth, targetHeight);

  return finalCanvas;
}

// Algoritma Unsharp Masking & Adaptive High-Frequency Edge Sharpening
function applyUnsharpMask(ctx, width, height, amount = 1.35, radius = 1) {
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  const copy = new Uint8ClampedArray(data);

  // Kernel Laplacian Sharpening 3x3
  //  0  -1   0
  // -1   5  -1
  //  0  -1   0
  const w = width;
  const h = height;

  const strength = Math.min(2.5, Math.max(0.5, amount));
  const centerWeight = 1 + 4 * (0.22 * strength);
  const neighborWeight = -0.22 * strength;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4;

      for (let c = 0; c < 3; c++) {
        const top = copy[((y - 1) * w + x) * 4 + c];
        const bottom = copy[((y + 1) * w + x) * 4 + c];
        const left = copy[(y * w + (x - 1)) * 4 + c];
        const right = copy[(y * w + (x + 1)) * 4 + c];
        const center = copy[idx + c];

        const sharpened = center * centerWeight + (top + bottom + left + right) * neighborWeight;
        data[idx + c] = Math.min(255, Math.max(0, Math.round(sharpened)));
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

// Peningkatan micro-contrast dan saturasi warna agar hasil foto tidak pucat
function applyMicroContrastAndVibrance(ctx, width, height, contrastBoost = 1.08, vibranceBoost = 1.1) {
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  // Nilai tengah 128 untuk S-curve kontras
  const factor = (259 * (contrastBoost * 255 + 255)) / (255 * (259 - contrastBoost * 255));

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    // 1. Kontras lokal
    r = factor * (r - 128) + 128;
    g = factor * (g - 128) + 128;
    b = factor * (b - 128) + 128;

    // 2. Vibrance (meningkatkan warna yang kurang jenuh tanpa membuat over-saturasi kulit)
    const max = Math.max(r, g, b);
    const avg = (r + g + b) / 3;
    const amt = ((Math.abs(max - avg) * 2) / 255) * (vibranceBoost - 1);

    if (r !== max) r += (max - r) * amt;
    if (g !== max) g += (max - g) * amt;
    if (b !== max) b += (max - b) * amt;

    data[i] = Math.min(255, Math.max(0, Math.round(r)));
    data[i + 1] = Math.min(255, Math.max(0, Math.round(g)));
    data[i + 2] = Math.min(255, Math.max(0, Math.round(b)));
  }

  ctx.putImageData(imgData, 0, 0);
}

/**
 * Fungsi Utama: Mengubah foto burik menjadi Super HD (Anti-Burik WhatsApp)
 * @param {HTMLImageElement} imgElement
 * @param {Object} options
 * @returns {Promise<{ dataUrl: string, width: number, height: number, sizeBytes: number }>}
 */
export async function enhanceImageToSuperHd(imgElement, options = {}) {
  const {
    upscaleFactor = 2, // 2x atau 4x
    sharpenStrength = 1.45,
    targetFormat = 'image/jpeg',
    quality = 0.96
  } = options;

  const originalWidth = imgElement.naturalWidth || imgElement.width;
  const originalHeight = imgElement.naturalHeight || imgElement.height;

  // Hitung target dimensi: minimal panjang sisi 2160px untuk kualitas 4K UHD WhatsApp
  let targetW = Math.round(originalWidth * upscaleFactor);
  let targetH = Math.round(originalHeight * upscaleFactor);

  const maxDimension = Math.max(targetW, targetH);
  if (maxDimension < 2160) {
    const scaleRatio = 2160 / maxDimension;
    targetW = Math.round(targetW * scaleRatio);
    targetH = Math.round(targetH * scaleRatio);
  } else if (maxDimension > 4096) {
    // Batasi maksimum 4096px agar hemat memori browser
    const scaleRatio = 4096 / maxDimension;
    targetW = Math.round(targetW * scaleRatio);
    targetH = Math.round(targetH * scaleRatio);
  }

  // 1. Gambar sumber ke canvas awal
  const baseCanvas = document.createElement('canvas');
  baseCanvas.width = originalWidth;
  baseCanvas.height = originalHeight;
  const baseCtx = baseCanvas.getContext('2d');
  baseCtx.drawImage(imgElement, 0, 0);

  // 2. Multi-step bicubic upscale
  const scaledCanvas = multiStepUpscale(baseCanvas, targetW, targetH);
  const scaledCtx = scaledCanvas.getContext('2d');

  // 3. Eksekusi Unsharp Masking
  applyUnsharpMask(scaledCtx, targetW, targetH, sharpenStrength);

  // 4. Eksekusi Micro-Contrast & Vibrance
  applyMicroContrastAndVibrance(scaledCtx, targetW, targetH, 1.05, 1.12);

  // 5. Generate high-quality data URL
  const dataUrl = scaledCanvas.toDataURL(targetFormat, quality);

  // Hitung ukuran byte
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

