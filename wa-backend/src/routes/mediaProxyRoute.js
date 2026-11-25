/**
 * Zero-Disk Streaming Media Proxy Cadangan untuk AllToolsKuro Render Backend
 * Menangani video HD > 4.5 MB tanpa menyentuh disk maupun logic Baileys WA.
 */

const express = require('express');
const net = require('net');
const { Readable } = require('stream');

const router = express.Router();

const UA_CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const MIME_EXT_MAP = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/x-matroska': 'mkv',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
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
    const p = h.split('.').map(Number);
    if (p[0] === 0 || p[0] === 10 || p[0] === 127) return true;
    if (p[0] === 169 && p[1] === 254) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    return false;
  }
  if (net.isIPv6(h)) {
    return h === '::' || h === '::1' || /^fe80:/i.test(h) || /^(fc|fd)[0-9a-f]{2}:/i.test(h);
  }
  return false;
}

function sanitizeFilename(raw) {
  if (!raw || typeof raw !== 'string') return 'kuro-media';
  const s = raw
    .replace(/[\r\n\t]/g, ' ')
    .replace(/[^\w.\-\s]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_.-]+|[_-]+$/g, '')
    .slice(0, 180);
  return s || 'kuro-media';
}

function resolveReferer(platformHint = '', targetUrl = '') {
  const p = String(platformHint || '').toLowerCase();
  const u = String(targetUrl || '').toLowerCase();
  if (p.includes('tiktok') || /tikwm\.com/.test(u)) return /tikwm/.test(u) ? 'https://www.tikwm.com/' : 'https://www.tiktok.com/';
  if (/tiktok|tikcdn|tiktokv|muscdn|ibytedtos|byteoversea/.test(u)) return 'https://www.tiktok.com/';
  if (p.includes('instagram') || /instagram|cdninstagram/.test(u)) return 'https://www.instagram.com/';
  if (p.includes('facebook') || /facebook|fbcdn/.test(u)) return 'https://www.facebook.com/';
  if (p.includes('twitter') || p === 'x' || /twimg|twitter\.com|x\.com/.test(u)) return 'https://x.com/';
  if (p.includes('pinterest') || /pinterest|pinimg/.test(u)) return 'https://www.pinterest.com/';
  if (p.includes('youtube') || /googlevideo|youtube|ytimg/.test(u)) return 'https://www.youtube.com/';
  if (p.includes('douyin') || /douyin|iesdouyin/.test(u)) return 'https://www.douyin.com/';
  return null;
}

function safeDecodeOnce(rawUrl = '') {
  const t = String(rawUrl || '').trim();
  if (/^https?%3A/i.test(t)) {
    try { return decodeURIComponent(t).trim(); } catch { return t; }
  }
  return t;
}

function ensureExt(filename, mimeType, urlPath) {
  const cleanMime = String(mimeType || '').split(';')[0].trim().toLowerCase();
  const extFromMime = MIME_EXT_MAP[cleanMime];
  const extFromUrl = (urlPath || '').split('?')[0].match(/\.([a-zA-Z0-9]{2,6})$/)?.[1]?.toLowerCase();
  const ext = extFromMime || extFromUrl;
  if (!ext) return filename;
  const dot = filename.lastIndexOf('.');
  const cur = dot > 0 ? filename.slice(dot + 1).toLowerCase() : '';
  if (cur && cur.length >= 2 && cur.length <= 5) return filename;
  return `${filename}.${ext}`;
}

async function handleProxyDownload(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Disposition, Content-Type, X-File-Size');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const body = req.method === 'POST' ? (req.body || {}) : {};
  const query = req.query || {};
  const rawUrl = body.url || query.url;
  const rawFilename = body.filename || query.filename;
  const platformHint = body.platform || query.platform || '';
  const explicitReferer = body.referer || query.referer || '';
  const isStream = String(body.stream || query.stream || '') === 'true';

  if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return res.status(400).json({ error: 'Parameter url wajib diisi.' });
  }

  const targetUrl = req.method === 'POST' ? rawUrl.trim() : safeDecodeOnce(rawUrl);
  if (!/^https?:\/\//i.test(targetUrl)) {
    return res.status(400).json({ error: 'Hanya URL http/https yang diizinkan.' });
  }

  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return res.status(400).json({ error: 'URL tidak valid.' });
  }

  if (isPrivateOrLoopback(parsed.hostname)) {
    return res.status(403).json({ error: 'Akses ke host lokal/privat dilarang.' });
  }

  const baseName = sanitizeFilename(rawFilename || parsed.pathname.split('/').pop() || 'kuro-media');
  const referer = explicitReferer || resolveReferer(platformHint, targetUrl);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45000);

  let upstream;
  try {
    const h1 = { 'User-Agent': UA_CHROME, 'Accept': '*/*' };
    if (referer) h1['Referer'] = referer;
    if (req.headers['range']) h1['Range'] = req.headers['range'];

    upstream = await fetch(targetUrl, { method: 'GET', headers: h1, redirect: 'follow', signal: ctrl.signal });
    if (!upstream.ok && (upstream.status === 400 || upstream.status === 403 || upstream.status === 406)) {
      try { await upstream.body?.cancel?.(); } catch {}
      const h2 = { 'User-Agent': UA_CHROME };
      if (req.headers['range']) h2['Range'] = req.headers['range'];
      upstream = await fetch(targetUrl, { method: 'GET', headers: h2, redirect: 'follow', signal: ctrl.signal });
    }
  } catch (err) {
    clearTimeout(timer);
    const isAbort = err?.name === 'AbortError';
    return res.status(isAbort ? 504 : 502).json({
      error: isAbort ? 'Timeout menghubungi CDN.' : `Gagal terhubung ke CDN: ${err?.message || 'unknown'}`
    });
  }
  clearTimeout(timer);

  if (!upstream.ok) {
    return res.status(upstream.status || 502).json({
      error: `CDN menolak permintaan: HTTP ${upstream.status}`
    });
  }

  const ct = (upstream.headers.get('content-type') || '').toLowerCase();
  if (ct.includes('text/html')) {
    try { await upstream.body?.cancel?.(); } catch {}
    return res.status(502).json({ error: 'CDN mengembalikan HTML, bukan berkas media.' });
  }

  const finalName = ensureExt(baseName, ct, parsed.pathname);
  res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader(
    'Content-Disposition',
    isStream
      ? `inline; filename="${finalName}"`
      : `attachment; filename="${finalName}"; filename*=UTF-8''${encodeURIComponent(finalName)}`
  );

  const cl = upstream.headers.get('content-length');
  if (cl) {
    res.setHeader('Content-Length', cl);
    res.setHeader('X-File-Size', cl);
  }
  const cr = upstream.headers.get('content-range');
  if (cr) res.setHeader('Content-Range', cr);
  if (upstream.status === 206) res.status(206);

  if (req.method === 'HEAD') return res.end();

  try {
    if (upstream.body && typeof upstream.body.getReader === 'function') {
      const nodeStream = Readable.fromWeb(upstream.body);
      req.on('close', () => { try { nodeStream.destroy(); } catch {} });
      nodeStream.on('error', () => {
        if (!res.headersSent) res.status(502).json({ error: 'Stream CDN terputus.' });
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
    if (!res.headersSent) res.status(502).json({ error: 'Gagal mengalirkan media.' });
  }
}

router.options('/api/proxy-download', handleProxyDownload);
router.post('/api/proxy-download', handleProxyDownload);
router.get('/api/proxy-download', handleProxyDownload);
router.head('/api/proxy-download', handleProxyDownload);

module.exports = router;
