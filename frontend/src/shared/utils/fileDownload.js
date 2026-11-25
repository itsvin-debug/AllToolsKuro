/**
 * Kuro Studio - Cross-Device Resilient File Download Utility
 * Menangani unduhan Blob, Base64/DataURL, Teks/XML/JSON/SRT, dan URL eksternal
 * agar bekerja konsisten di Desktop (Chrome/Firefox/Safari), Mobile Browser, dan Android WebView.
 */

import { getApiBaseUrl } from '../config/apiConfig.js';

const REVOKE_DELAY_MS = 30000;

const MIME_TO_EXT = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'application/json': 'json',
  'application/xml': 'xml',
  'text/xml': 'xml',
  'text/html': 'html',
  'text/css': 'css',
  'text/javascript': 'js',
  'text/plain': 'txt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx'
};

export function sanitizeFilename(name, fallbackExt = 'bin') {
  const cleanExt = String(fallbackExt || 'bin')
    .replace(/^\.+/, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase() || 'bin';

  let base = String(name || 'kuro_studio_file')
    .replace(/[\r\n\t]/g, ' ')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/^\.+/, '')
    .trim();

  if (!base) {
    base = `kuro_studio_${Date.now()}`;
  }

  // Pastikan nama memiliki ekstensi yang valid tanpa memotong nama secara sembarangan
  const lastDot = base.lastIndexOf('.');
  let stem = base;
  let ext = '';
  if (lastDot > 0 && lastDot < base.length - 1) {
    const candidateExt = base.slice(lastDot + 1).replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    if (candidateExt.length >= 2 && candidateExt.length <= 12) {
      stem = base.slice(0, lastDot);
      ext = candidateExt;
    }
  }

  const finalExt = ext || cleanExt;
  const maxStemLen = Math.max(12, 120 - finalExt.length - 1);
  const safeStem = (stem || 'kuro_studio_file').replace(/_+$/, '').slice(0, maxStemLen) || 'kuro_studio_file';

  return `${safeStem}.${finalExt}`;
}

export function downloadBlob(blob, filename = 'kuro_studio_file.bin') {
  if (!(blob instanceof Blob) || blob.size <= 0) {
    throw new Error('Berkas kosong (0 byte) atau gagal dibuat oleh peramban.');
  }
  if (typeof document === 'undefined' || typeof URL === 'undefined') {
    throw new Error('Lingkungan unduhan peramban tidak tersedia.');
  }

  const inferredExt = MIME_TO_EXT[String(blob.type || '').split(';')[0].trim().toLowerCase()] || 'bin';
  const safeName = sanitizeFilename(filename, inferredExt);
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.style.display = 'none';
  link.href = url;
  link.download = safeName;
  link.setAttribute('download', safeName);
  link.rel = 'noopener noreferrer';

  document.body.appendChild(link);
  link.click();
  link.remove();

  // Tunda revokeObjectURL minimal 30 detik agar Safari, Firefox, dan Android WebView sempat membaca stream Blob
  setTimeout(() => {
    try {
      URL.revokeObjectURL(url);
    } catch {}
  }, REVOKE_DELAY_MS);

  return { ok: true, filename: safeName, sizeBytes: blob.size };
}

function decodeBase64ToUint8Array(pureBase64) {
  const cleaned = String(pureBase64 || '').replace(/\s+/g, '');
  const binaryString = window.atob(cleaned);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  const chunkSize = 32768;

  for (let offset = 0; offset < len; offset += chunkSize) {
    const end = Math.min(offset + chunkSize, len);
    for (let i = offset; i < end; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
  }
  return bytes;
}

export async function downloadBase64(base64OrDataUrl, filename = 'download', defaultMime = 'application/octet-stream') {
  if (!base64OrDataUrl || typeof base64OrDataUrl !== 'string') {
    throw new Error('Data berkas Base64 kosong atau tidak valid.');
  }

  const trimmed = base64OrDataUrl.trim();
  let mimeType = defaultMime;
  let blob = null;

  if (trimmed.startsWith('data:')) {
    const commaIdx = trimmed.indexOf(',');
    if (commaIdx === -1) {
      throw new Error('Format Data URL tidak valid.');
    }
    const header = trimmed.slice(5, commaIdx);
    const payload = trimmed.slice(commaIdx + 1);
    const isBase64 = header.toLowerCase().includes(';base64');
    const extractedMime = header.split(';')[0]?.trim();
    if (extractedMime) mimeType = extractedMime;

    if (isBase64) {
      try {
        const bytes = decodeBase64ToUint8Array(payload);
        blob = new Blob([bytes], { type: mimeType });
      } catch {
        const res = await fetch(trimmed);
        blob = await res.blob();
      }
    } else {
      const decodedText = decodeURIComponent(payload);
      blob = new Blob([decodedText], { type: mimeType || 'text/plain;charset=utf-8' });
    }
  } else {
    const bytes = decodeBase64ToUint8Array(trimmed);
    blob = new Blob([bytes], { type: mimeType });
  }

  const fallbackExt = MIME_TO_EXT[String(mimeType || '').split(';')[0].trim().toLowerCase()] || 'bin';
  return downloadBlob(blob, sanitizeFilename(filename, fallbackExt));
}

export function downloadText(textContent, filename = 'document.txt', mimeType = 'text/plain;charset=utf-8') {
  if (textContent === undefined || textContent === null) {
    throw new Error('Konten teks kosong sehingga berkas tidak dapat dibuat.');
  }
  const str = typeof textContent === 'string' ? textContent : JSON.stringify(textContent, null, 2);
  if (!str.length) {
    throw new Error('Berkas teks kosong (0 byte).');
  }
  const cleanMime = String(mimeType || '').split(';')[0].trim().toLowerCase();
  const fallbackExt = MIME_TO_EXT[cleanMime] || 'txt';
  const blob = new Blob([str], { type: mimeType });
  return downloadBlob(blob, sanitizeFilename(filename, fallbackExt));
}

export async function downloadFromUrl(fileUrl, filename = 'kuro_download') {
  if (!fileUrl || typeof fileUrl !== 'string') {
    throw new Error('URL berkas tujuan tidak valid atau kosong.');
  }

  const cleanUrl = fileUrl.trim();
  if (cleanUrl.startsWith('data:')) {
    return downloadBase64(cleanUrl, filename);
  }

  const urlExtMatch = cleanUrl.split('?')[0].split('#')[0].match(/\.([a-zA-Z0-9]{2,8})$/);
  const fallbackExt = urlExtMatch ? urlExtMatch[1].toLowerCase() : 'bin';
  const safeName = sanitizeFilename(filename, fallbackExt);

  try {
    const res = await fetch(cleanUrl);
    if (res.ok) {
      const blob = await res.blob();
      if (blob && blob.size > 0) {
        return downloadBlob(blob, safeName);
      }
    }
  } catch {
    // Server eksternal memblokir CORS: lanjut ke anchor fallback di bawah
  }

  if (cleanUrl.startsWith('blob:')) {
    throw new Error('Sesi Blob lokal telah kedaluwarsa. Silakan buat ulang berkas terlebih dahulu.');
  }

  const link = document.createElement('a');
  link.style.display = 'none';
  link.href = cleanUrl;
  link.download = safeName;
  link.setAttribute('download', safeName);
  link.target = '_blank';
  link.rel = 'noopener noreferrer';

  document.body.appendChild(link);
  link.click();
  link.remove();

  return { ok: true, filename: safeName, fallbackAnchor: true };
}

/**
 * downloadMediaViaProxy — Unduh media dari URL eksternal (TikTok, IG, YT, dll.)
 * melalui /api/proxy-download dengan validasi content-type anti-HTML,
 * fallback ke wa-backend jika Vercel gagal, dan state loading untuk UI.
 *
 * @param {object} options
 * @param {string} options.url            - URL CDN media target
 * @param {string} [options.filename]     - Nama file tujuan (tanpa harus ada ekstensi)
 * @param {function} [options.onLoading]  - Callback(true/false) untuk state loading tombol
 * @param {function} [options.onError]    - Callback(message) untuk tampil toast error
 * @returns {Promise<{ok:boolean, filename?:string, sizeBytes?:number}>}
 */
export async function downloadMediaViaProxy({ url, filename = 'kuro-media', onLoading, onError } = {}) {
  if (!url || typeof url !== 'string' || !url.trim()) {
    const msg = 'URL media tidak valid atau kosong.';
    onError?.(msg);
    throw new Error(msg);
  }

  const urlExtMatch = url.split('?')[0].split('#')[0].match(/\.([a-zA-Z0-9]{2,8})$/);
  const fallbackExt = urlExtMatch ? urlExtMatch[1].toLowerCase() : 'mp4';
  const safeName = sanitizeFilename(filename, fallbackExt);

  onLoading?.(true);

  const proxyEndpoints = [
    `/api/proxy-download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(safeName)}`,
  ];

  // Fallback ke wa-backend jika tersedia (untuk video HD besar > 4.5MB yang melebihi limit Vercel)
  try {
    const backendBase = getApiBaseUrl();
    if (backendBase && typeof window !== 'undefined' && backendBase !== window.location.origin) {
      proxyEndpoints.push(
        `${backendBase}/api/proxy-download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(safeName)}`
      );
    }
  } catch {
    // getApiBaseUrl tidak tersedia atau tidak ada backend tambahan — abaikan
  }

  let lastError = null;
  for (const proxyUrl of proxyEndpoints) {
    try {
      const res = await fetch(proxyUrl);

      // Tolak jika bukan respons sukses
      if (!res.ok) {
        lastError = `Server mengembalikan HTTP ${res.status}`;
        continue;
      }

      // Tolak jika content-type adalah HTML (artinya halaman 404/error, bukan media)
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('text/html')) {
        lastError = 'Server mengembalikan halaman HTML, bukan berkas media. Link mungkin kedaluwarsa.';
        continue;
      }

      const blob = await res.blob();
      if (!blob || blob.size === 0) {
        lastError = 'Berkas yang diterima kosong (0 byte).';
        continue;
      }

      onLoading?.(false);
      return downloadBlob(blob, safeName);
    } catch (err) {
      lastError = err?.message || 'Gagal terhubung ke server proxy.';
    }
  }

  onLoading?.(false);
  const finalMsg = lastError || 'Semua jalur unduhan gagal. Silakan coba lagi atau proses ulang link.';
  onError?.(finalMsg);
  throw new Error(finalMsg);
}
