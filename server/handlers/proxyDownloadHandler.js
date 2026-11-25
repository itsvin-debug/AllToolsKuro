import { validateRequestSecurity } from '../../api/_security.js';
import { Readable } from 'stream';
import net from 'net';

const UA_CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const MIME_EXT_MAP = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/x-matroska': 'mkv',
  'video/x-msvideo': 'avi',
  'video/3gpp': '3gp',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/webm': 'weba',
  'audio/aac': 'aac',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'application/pdf': 'pdf',
  'application/zip': 'zip'
};

function isPrivateOrLoopback(hostname) {
  if (!hostname) return true;
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h === 'localhost.localdomain' || h === 'ip6-localhost' || h === '::1') {
    return true;
  }
  if (net.isIPv4(h)) {
    const parts = h.split('.').map(Number);
    if (parts[0] === 0 || parts[0] === 10 || parts[0] === 127) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    return false;
  }
  if (net.isIPv6(h)) {
    return h === '::' || h === '::1' || /^fe80:/i.test(h) || /^(fc|fd)[0-9a-f]{2}:/i.test(h);
  }
  return false;
}

function sanitizeFilename(raw) {
  if (!raw || typeof raw !== 'string') return 'kuro-media';
  const cleaned = raw
    .replace(/[\r\n\t]/g, ' ')
    .replace(/[^\w.\-\s]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_.-]+|[_-]+$/g, '')
    .slice(0, 180);
  return cleaned || 'kuro-media';
}

function resolvePlatformReferer(platformHint = '', targetUrl = '') {
  const p = String(platformHint || '').toLowerCase();
  const u = String(targetUrl || '').toLowerCase();

  if (p.includes('tiktok') || /tikwm\.com/.test(u)) {
    return /tikwm\.com/.test(u) ? 'https://www.tikwm.com/' : 'https://www.tiktok.com/';
  }
  if (/tiktok|tikcdn|tiktokv|muscdn|ibytedtos|byteoversea|bytegecko/.test(u)) return 'https://www.tiktok.com/';
  if (p.includes('instagram') || /instagram|cdninstagram/.test(u)) return 'https://www.instagram.com/';
  if (p.includes('facebook') || /facebook|fbcdn|fb\.watch/.test(u)) return 'https://www.facebook.com/';
  if (p.includes('twitter') || p === 'x' || /twimg|twitter\.com|x\.com/.test(u)) return 'https://x.com/';
  if (p.includes('pinterest') || /pinterest|pinimg/.test(u)) return 'https://www.pinterest.com/';
  if (p.includes('youtube') || /googlevideo|youtube|ytimg/.test(u)) return 'https://www.youtube.com/';
  if (p.includes('threads') || /threads\.(?:net|com)/.test(u)) return 'https://www.threads.net/';
  if (p.includes('douyin') || /douyin|iesdouyin|zijieapi/.test(u)) return 'https://www.douyin.com/';
  if (p.includes('bilibili') || /bilibili|bilivideo|hdslb/.test(u)) return 'https://www.bilibili.com/';
  if (p.includes('pixiv') || /pximg|pixiv/.test(u)) return 'https://www.pixiv.net/';
  if (p.includes('reddit') || /reddit|redd\.it/.test(u)) return 'https://www.reddit.com/';
  if (p.includes('rednote') || /xiaohongshu|xhscdn/.test(u)) return 'https://www.xiaohongshu.com/';
  if (p.includes('capcut') || /capcut/.test(u)) return 'https://www.capcut.com/';
  if (p.includes('soundcloud') || /soundcloud|sndcdn/.test(u)) return 'https://soundcloud.com/';
  if (/savenow\.to/.test(u)) return 'https://y2down.cc/';
  return null;
}

// Hindari double-decode pada signed URL (misal token %2F / %3D dari TikTok CDN)
function safeDecodeOnce(rawUrl = '') {
  const trimmed = String(rawUrl || '').trim();
  if (/^https?%3A/i.test(trimmed)) {
    try {
      return decodeURIComponent(trimmed).trim();
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

function inferExt(mimeType, urlPath) {
  if (mimeType) {
    const clean = mimeType.split(';')[0].trim().toLowerCase();
    if (MIME_EXT_MAP[clean]) return MIME_EXT_MAP[clean];
  }
  const m = (urlPath || '').split('?')[0].match(/\.([a-zA-Z0-9]{2,6})$/);
  return m ? m[1].toLowerCase() : null;
}

function ensureExt(filename, ext) {
  if (!ext) return filename;
  const dot = filename.lastIndexOf('.');
  const existing = dot > 0 ? filename.slice(dot + 1).toLowerCase() : '';
  if (existing && existing.length >= 2 && existing.length <= 5) {
    return filename;
  }
  return `${filename}.${ext}`;
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
    return req.body;
  }
  if (typeof req.body === 'string' && req.body.trim()) {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  if (typeof req.on !== 'function') return {};
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 65536) req.destroy?.();
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

async function fetchWithRetry(targetUrl, referer, rangeHeader, signal) {
  // Tahap 1: Header spesifik platform tanpa Origin/Host pemicu HTTP 400 TikTok
  const stage1Headers = {
    'User-Agent': UA_CHROME,
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9'
  };
  if (referer) stage1Headers['Referer'] = referer;
  if (rangeHeader) stage1Headers['Range'] = rangeHeader;

  let res = await fetch(targetUrl, {
    method: 'GET',
    headers: stage1Headers,
    redirect: 'follow',
    signal
  });

  // Tahap 2: Clean retry hanya jika upstream menolak 400/403/406
  if (!res.ok && (res.status === 400 || res.status === 403 || res.status === 406)) {
    try { await res.body?.cancel?.(); } catch {}
    const cleanHeaders = { 'User-Agent': UA_CHROME };
    if (rangeHeader) cleanHeaders['Range'] = rangeHeader;
    res = await fetch(targetUrl, {
      method: 'GET',
      headers: cleanHeaders,
      redirect: 'follow',
      signal
    });
  }

  return res;
}

async function resolveSaveNowIfNeeded(targetUrl) {
  if (!targetUrl.includes('savenow.to/api/progress') && !targetUrl.includes('/api/progress?id=')) {
    return targetUrl;
  }
  for (let i = 0; i < 15; i++) {
    try {
      const r = await fetch(targetUrl, {
        headers: { 'User-Agent': UA_CHROME, 'Referer': 'https://y2down.cc/' },
        signal: AbortSignal.timeout(4000)
      });
      if (r.ok) {
        const data = await r.json();
        if (data?.download_url) return data.download_url;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 800));
  }
  return targetUrl;
}

export default async function handler(req, res) {
  if (!validateRequestSecurity(req, res)) return;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Disposition, Content-Type, X-File-Size');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'HEAD') {
    return res.status(405).json({ error: 'Method tidak diizinkan.' });
  }

  const body = req.method === 'POST' ? await readJsonBody(req) : {};
  const query = req.query || {};

  const rawUrl = body.url || query.url;
  const rawFilename = body.filename || query.filename;
  const platformHint = body.platform || query.platform || '';
  const explicitReferer = body.referer || query.referer || '';
  const isStream = String(body.stream || query.stream || '') === 'true' || query.type === 'video' || query.type === 'audio';

  if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return res.status(400).json({ error: 'Parameter url tidak boleh kosong.' });
  }

  // Untuk POST JSON body, URL sudah string utuh (jangan di-decode ulang!)
  let targetUrl = req.method === 'POST' ? rawUrl.trim() : safeDecodeOnce(rawUrl);

  if (!/^https?:\/\//i.test(targetUrl)) {
    return res.status(400).json({ error: 'Hanya protokol http atau https yang diizinkan.' });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(targetUrl);
  } catch {
    return res.status(400).json({ error: 'Format URL tidak valid.' });
  }

  if (isPrivateOrLoopback(parsedUrl.hostname)) {
    return res.status(403).json({ error: 'Akses ke alamat lokal atau jaringan privat ditolak.' });
  }

  targetUrl = await resolveSaveNowIfNeeded(targetUrl);
  try {
    parsedUrl = new URL(targetUrl);
  } catch {}

  if (isPrivateOrLoopback(parsedUrl.hostname)) {
    return res.status(403).json({ error: 'Tujuan redirect tidak diizinkan.' });
  }

  const baseName = sanitizeFilename(rawFilename || parsedUrl.pathname.split('/').pop() || 'kuro-media');
  const referer = explicitReferer || resolvePlatformReferer(platformHint, targetUrl);

  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), 28000);

  let upstream;
  try {
    upstream = await fetchWithRetry(targetUrl, referer, req.headers['range'], ctrl.signal);
  } catch (err) {
    clearTimeout(timeoutId);
    const isTimeout = err?.name === 'AbortError';
    return res.status(isTimeout ? 504 : 502).json({
      error: isTimeout
        ? 'Waktu tunggu habis saat mengambil berkas dari CDN sumber.'
        : `Gagal terhubung ke CDN sumber: ${err?.message || 'Koneksi terputus'}`
    });
  }
  clearTimeout(timeoutId);

  if (!upstream.ok) {
    const status = upstream.status || 502;
    return res.status(status).json({
      error: status === 403 || status === 400 || status === 410
        ? `Tautan CDN menolak atau kedaluwarsa (HTTP ${status}). Silakan klik Proses Ulang.`
        : `CDN sumber mengembalikan error HTTP ${status}.`
    });
  }

  const upstreamCT = (upstream.headers.get('content-type') || '').toLowerCase();
  if (upstreamCT.includes('text/html')) {
    try { await upstream.body?.cancel?.(); } catch {}
    return res.status(502).json({
      error: 'CDN mengembalikan halaman HTML, bukan berkas media. Link kemungkinan kedaluwarsa atau privat.'
    });
  }

  const ext = inferExt(upstreamCT, parsedUrl.pathname);
  const finalFilename = ensureExt(baseName, ext);
  const finalMime = upstream.headers.get('content-type') || 'application/octet-stream';

  res.setHeader('Content-Type', finalMime);
  res.setHeader('Cache-Control', 'no-store');

  if (isStream) {
    res.setHeader('Content-Disposition', `inline; filename="${finalFilename}"`);
  } else {
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${finalFilename}"; filename*=UTF-8''${encodeURIComponent(finalFilename)}`
    );
  }

  const contentLength = upstream.headers.get('content-length');
  if (contentLength) {
    res.setHeader('Content-Length', contentLength);
    res.setHeader('X-File-Size', contentLength);
  }

  const contentRange = upstream.headers.get('content-range');
  if (contentRange) res.setHeader('Content-Range', contentRange);

  if (upstream.status === 206) res.status(206);

  if (req.method === 'HEAD') {
    return res.end();
  }

  try {
    if (upstream.body && typeof upstream.body.getReader === 'function') {
      const nodeStream = Readable.fromWeb(upstream.body);
      req.on('close', () => {
        try { nodeStream.destroy(); } catch {}
      });
      nodeStream.on('error', () => {
        if (!res.headersSent) res.status(502).json({ error: 'Aliran stream CDN terputus.' });
        else try { res.end(); } catch {}
      });
      nodeStream.pipe(res);
    } else {
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.setHeader('Content-Length', String(buf.length));
      res.setHeader('X-File-Size', String(buf.length));
      res.send(buf);
    }
  } catch {
    if (!res.headersSent) {
      res.status(502).json({ error: 'Gagal mengalirkan berkas dari CDN.' });
    }
  }
}
