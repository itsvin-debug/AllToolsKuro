import { validateRequestSecurity } from './_security.js';
import { Readable } from 'stream';

// MIME type → ekstensi file
const MIME_EXT_MAP = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/x-matroska': 'mkv',
  'video/x-msvideo': 'avi',
  'video/3gpp': '3gp',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/webm': 'weba',
  'audio/aac': 'aac',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'application/octet-stream': 'bin',
};

// Blok IP lokal/private untuk mencegah SSRF
function isPrivateOrLoopback(hostname) {
  if (!hostname) return true;
  const h = hostname.toLowerCase();
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '::1' ||
    /^0\./.test(h) ||
    /^10\./.test(h) ||
    /^127\./.test(h) ||
    /^169\.254\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^fd[0-9a-f]{2}:/i.test(h) ||   // IPv6 ULA
    /^fe80:/i.test(h)                 // IPv6 link-local
  );
}

// Sanitasi nama file: hanya alfanumerik, titik, strip, dan underscore
function sanitizeFilename(raw) {
  if (!raw || typeof raw !== 'string') return 'kuro-media';
  return raw
    .replace(/[^\w.\-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 180) || 'kuro-media';
}

// Tentukan referer yang tepat berdasarkan domain CDN target
function resolveReferer(lowerUrl) {
  if (/tikwm\.com/.test(lowerUrl)) return 'https://www.tikwm.com/';
  if (/tiktok|tikcdn|muscdn|ibytedtos|byteoversea|bytegecko/.test(lowerUrl)) return 'https://www.tiktok.com/';
  if (/instagram|cdninstagram|fbcdn/.test(lowerUrl)) return 'https://www.instagram.com/';
  if (/twimg|twitter\.com|x\.com/.test(lowerUrl)) return 'https://twitter.com/';
  if (/googlevideo|youtube|ytimg/.test(lowerUrl)) return 'https://www.youtube.com/';
  if (/bilibili|bilivideo|hdslb/.test(lowerUrl)) return 'https://www.bilibili.com/';
  if (/douyin|iesdouyin|zijieapi/.test(lowerUrl)) return 'https://www.douyin.com/';
  if (/pximg|pixiv/.test(lowerUrl)) return 'https://www.pixiv.net/';
  if (/reddit|redd\.it/.test(lowerUrl)) return 'https://www.reddit.com/';
  if (/facebook|fb\.watch/.test(lowerUrl)) return 'https://www.facebook.com/';
  if (/scdn\.co|spotify/.test(lowerUrl)) return 'https://open.spotify.com/';
  if (/mzstatic|apple\.com/.test(lowerUrl)) return 'https://music.apple.com/';
  if (/pinterest|pinimg/.test(lowerUrl)) return 'https://www.pinterest.com/';
  if (/bandcamp|bcbits/.test(lowerUrl)) return 'https://bandcamp.com/';
  if (/xiaohongshu|xhscdn|rednote/.test(lowerUrl)) return 'https://www.xiaohongshu.com/';
  if (/threads\.net/.test(lowerUrl)) return 'https://www.threads.net/';
  if (/terabox/.test(lowerUrl)) return 'https://www.terabox.com/';
  if (/savenow\.to/.test(lowerUrl)) return 'https://y2down.cc/';
  return null;
}

// Tentukan ekstensi dari MIME atau dari URL path
function inferExt(mimeType, urlPath) {
  if (mimeType) {
    const clean = mimeType.split(';')[0].trim().toLowerCase();
    if (MIME_EXT_MAP[clean]) return MIME_EXT_MAP[clean];
  }
  const m = (urlPath || '').split('?')[0].match(/\.([a-zA-Z0-9]{2,8})$/);
  return m ? m[1].toLowerCase() : null;
}

// Pastikan nama file memiliki ekstensi yang sesuai dengan konten
function ensureExt(filename, ext) {
  if (!ext) return filename;
  const dot = filename.lastIndexOf('.');
  const existingExt = dot > 0 ? filename.slice(dot + 1).toLowerCase() : '';
  if (existingExt === ext || existingExt.length >= 2) return filename;
  return `${filename}.${ext}`;
}

export default async function handler(req, res) {
  // Validasi keamanan (rate limit, UA scanner, path traversal)
  if (!validateRequestSecurity(req, res)) return;

  // CORS headers — wajib untuk semua respons termasuk error
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Length, Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ error: 'Method tidak diizinkan.' });
  }

  const rawUrl = req.query?.url;
  if (!rawUrl || typeof rawUrl !== 'string') {
    return res.status(400).json({ error: 'Parameter url tidak boleh kosong.' });
  }

  let targetUrl;
  try {
    targetUrl = decodeURIComponent(rawUrl).trim();
  } catch {
    return res.status(400).json({ error: 'URL tidak dapat di-decode.' });
  }

  // Validasi protokol — hanya http/https yang diizinkan
  if (!/^https?:\/\//i.test(targetUrl)) {
    return res.status(400).json({ error: 'Hanya URL http/https yang diizinkan.' });
  }

  // Validasi hostname: blokir IP lokal/private (anti-SSRF)
  let parsedUrl;
  try {
    parsedUrl = new URL(targetUrl);
  } catch {
    return res.status(400).json({ error: 'URL tidak valid.' });
  }

  if (isPrivateOrLoopback(parsedUrl.hostname)) {
    return res.status(403).json({ error: 'Akses ke host lokal atau jaringan privat tidak diizinkan.' });
  }

  const rawFilename = req.query?.filename;
  let baseFilename = sanitizeFilename(rawFilename || parsedUrl.pathname.split('/').pop() || 'kuro-media');
  const isStream = req.query?.stream === 'true' || req.query?.type === 'video' || req.query?.type === 'audio';

  const lowerUrl = targetUrl.toLowerCase();
  const referer = resolveReferer(lowerUrl);

  const fetchHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
  };
  if (referer) {
    fetchHeaders['Referer'] = referer;
    fetchHeaders['Origin'] = new URL(referer).origin;
  }

  // Teruskan Range header jika ada (untuk streaming media lanjutan)
  if (req.headers['range']) {
    fetchHeaders['Range'] = req.headers['range'];
  }

  let upstream;
  try {
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 25000);

    upstream = await fetch(targetUrl, {
      method: 'GET',
      headers: fetchHeaders,
      redirect: 'follow',
      signal: ctrl.signal,
    });

    clearTimeout(timeoutId);
  } catch (err) {
    const isTimeout = err?.name === 'AbortError';
    return res.status(504).json({
      error: isTimeout ? 'Timeout saat mengambil berkas dari CDN.' : `Gagal terhubung ke CDN: ${err?.message || 'unknown'}`,
    });
  }

  if (!upstream.ok) {
    return res.status(upstream.status).json({
      error: `CDN menolak permintaan: HTTP ${upstream.status} ${upstream.statusText}`,
    });
  }

  const upstreamContentType = upstream.headers.get('content-type') || '';

  // Tolak jika upstream mengembalikan HTML (bukan media) — cegah unduh file 404 HTML berlabel .mp4
  if (upstreamContentType.includes('text/html') && !isStream) {
    return res.status(502).json({
      error: 'CDN mengembalikan halaman HTML, bukan berkas media. Link mungkin sudah kedaluwarsa.',
    });
  }

  const ext = inferExt(upstreamContentType, parsedUrl.pathname);
  const finalFilename = ensureExt(baseFilename, ext);
  const finalMime = upstreamContentType || 'application/octet-stream';

  res.setHeader('Content-Type', finalMime);
  res.setHeader('Cache-Control', 'no-store');

  if (isStream) {
    res.setHeader('Content-Disposition', `inline; filename="${finalFilename}"`);
  } else {
    const encoded = encodeURIComponent(finalFilename);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${finalFilename}"; filename*=UTF-8''${encoded}`
    );
  }

  const contentLength = upstream.headers.get('content-length');
  if (contentLength) res.setHeader('Content-Length', contentLength);

  const contentRange = upstream.headers.get('content-range');
  if (contentRange) res.setHeader('Content-Range', contentRange);

  if (upstream.status === 206) res.status(206);

  // Streaming body langsung ke client — tanpa buffer penuh di RAM
  if (req.method === 'HEAD') {
    return res.end();
  }

  try {
    if (upstream.body && typeof upstream.body.getReader === 'function') {
      // Node 18+ Web Streams → Node Readable stream
      Readable.fromWeb(upstream.body).pipe(res);
    } else {
      // Fallback: buffer seluruh respons (untuk Node versi lama / body kecil)
      const buffer = Buffer.from(await upstream.arrayBuffer());
      res.send(buffer);
    }
  } catch (err) {
    if (!res.headersSent) {
      res.status(502).json({ error: 'Gagal mengalirkan berkas dari CDN.' });
    }
  }
}
