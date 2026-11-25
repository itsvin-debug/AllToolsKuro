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

const CORS_FRIENDLY_HOSTS = ['pbs.twimg.com', 'f4.bcbits.com', 'i.scdn.co', 'mzstatic.com'];

function isCorsFriendlyUrl(targetUrl) {
  try {
    const host = new URL(targetUrl).hostname.toLowerCase();
    return CORS_FRIENDLY_HOSTS.some((h) => host === h || host.endsWith('.' + h));
  } catch {
    return false;
  }
}

function getBackupBackendBaseUrl() {
  const nativeBase = getApiBaseUrl();
  const waEnvBase = (import.meta?.env?.VITE_WA_BACKEND_URL || '').trim().replace(/\/+$/, '');
  if (waEnvBase) return waEnvBase;
  if (nativeBase && typeof window !== 'undefined' && nativeBase !== window.location.origin) {
    return nativeBase;
  }
  if (typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname)) {
    return 'http://localhost:4000';
  }
  return '';
}

async function readStreamToBlob(res, onProgress) {
  const totalHeader = Number(res.headers.get('content-length') || res.headers.get('x-file-size') || 0);
  const contentType = res.headers.get('content-type') || 'application/octet-stream';

  if (!res.body || typeof res.body.getReader !== 'function') {
    const blob = await res.blob();
    onProgress?.({ percent: 100, loadedBytes: blob.size, totalBytes: blob.size });
    return blob;
  }

  const reader = res.body.getReader();
  const chunks = [];
  let loaded = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value && value.byteLength > 0) {
      chunks.push(value);
      loaded += value.byteLength;
      if (onProgress) {
        const pct = totalHeader > 0
          ? Math.min(98, Math.max(10, Math.round((loaded / totalHeader) * 100)))
          : Math.min(92, 15 + Math.round(loaded / (256 * 1024)) * 5);
        onProgress({ percent: pct, loadedBytes: loaded, totalBytes: totalHeader || loaded });
      }
    }
  }

  onProgress?.({ percent: 99, loadedBytes: loaded, totalBytes: totalHeader || loaded });
  return new Blob(chunks, { type: contentType });
}

/**
 * downloadMediaViaProxy — Unduh media 3-lapis tahan HTTP 400/413:
 *   1. Direct CORS (khusus host ramah CORS, hemat server)
 *   2. Vercel POST /api/proxy-download (stream dengan Content-Length progress)
 *   3. Auto-fallback Render POST ${WA_BACKEND_URL}/api/proxy-download (untuk video HD > 4.5 MB)
 */
export async function downloadMediaViaProxy({
  url,
  filename = 'kuro-media',
  platform = '',
  referer = '',
  allowDirectCors = true,
  onLoading,
  onProgress,
  onError
} = {}) {
  if (!url || typeof url !== 'string' || !url.trim()) {
    const msg = 'URL media tidak valid atau kosong.';
    onError?.(msg);
    throw new Error(msg);
  }

  // Ekstrak raw URL jika caller telanjur mengirim `/api/proxy-download?url=...`
  let targetUrl = url.trim();
  if (targetUrl.startsWith('/api/proxy-download') || targetUrl.startsWith('/api/proxy-stream')) {
    try {
      const parsedProxy = new URL(targetUrl, window.location.origin);
      const inner = parsedProxy.searchParams.get('url');
      if (inner) targetUrl = inner.trim();
    } catch {}
  }

  const urlExtMatch = targetUrl.split('?')[0].split('#')[0].match(/\.([a-zA-Z0-9]{2,8})$/);
  const fallbackExt = urlExtMatch ? urlExtMatch[1].toLowerCase() : 'mp4';
  const safeName = sanitizeFilename(filename, fallbackExt);

  onLoading?.(true);
  onProgress?.({ percent: 8, loadedBytes: 0, totalBytes: 0 });

  let lastError = null;

  // Lapis 1: Direct CORS cepat khusus domain ramah CORS
  if (allowDirectCors && isCorsFriendlyUrl(targetUrl)) {
    try {
      const directRes = await fetch(targetUrl, { method: 'GET', mode: 'cors', signal: AbortSignal.timeout(15000) });
      const directCt = (directRes.headers.get('content-type') || '').toLowerCase();
      if (directRes.ok && !directCt.includes('text/html')) {
        const blob = await readStreamToBlob(directRes, onProgress);
        if (blob && blob.size > 0) {
          onProgress?.({ percent: 100, loadedBytes: blob.size, totalBytes: blob.size });
          onLoading?.(false);
          return downloadBlob(blob, safeName);
        }
      }
    } catch {}
  }

  // Susun Lapis 2 (Vercel POST) + Lapis 3 (Render Backend POST fallback)
  const postTargets = ['/api/proxy-download'];
  const backupBase = getBackupBackendBaseUrl();
  if (backupBase) {
    postTargets.push(`${backupBase}/api/proxy-download`);
  }

  const payload = JSON.stringify({
    url: targetUrl,
    filename: safeName,
    platform,
    referer
  });

  for (const endpoint of postTargets) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        signal: AbortSignal.timeout(45000)
      });

      const ct = (res.headers.get('content-type') || '').toLowerCase();

      if (!res.ok) {
        if (ct.includes('application/json')) {
          try {
            const errJson = await res.json();
            lastError = errJson?.error || errJson?.message || `Server mengembalikan HTTP ${res.status}`;
          } catch {
            lastError = `Server mengembalikan HTTP ${res.status}`;
          }
        } else {
          lastError = res.status === 413
            ? 'Ukuran video melebihi batas serverless, mengalihkan ke jalur streaming cadangan...'
            : `Server mengembalikan HTTP ${res.status}`;
        }
        continue;
      }

      if (ct.includes('text/html')) {
        lastError = 'Server mengembalikan halaman HTML, bukan berkas media. Tautan mungkin sudah kedaluwarsa.';
        continue;
      }

      const blob = await readStreamToBlob(res, onProgress);
      if (!blob || blob.size === 0) {
        lastError = 'Berkas yang diterima kosong (0 byte).';
        continue;
      }

      onProgress?.({ percent: 100, loadedBytes: blob.size, totalBytes: blob.size });
      onLoading?.(false);
      return downloadBlob(blob, safeName);
    } catch (err) {
      lastError = err?.name === 'TimeoutError'
        ? 'Koneksi unduhan habis waktu (timeout).'
        : (err?.message || 'Gagal terhubung ke server proxy.');
    }
  }

  onLoading?.(false);
  const finalMsg = lastError || 'Tautan unduhan kedaluwarsa atau gagal diambil. Silakan klik Proses Ulang.';
  onError?.(finalMsg);
  throw new Error(finalMsg);
}
