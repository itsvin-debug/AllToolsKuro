import axios from 'axios';
import * as cheerio from 'cheerio';
import { applySecurityHeaders } from './_security.js';

const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function isValidPublicUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;

    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host) ||
      /^169\.254\./.test(host)
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

function extractFromQueryParams(targetUrl) {
  try {
    const parsed = new URL(targetUrl);
    const searchParams = parsed.searchParams;

    const candidateKeys = [
      'url', 'u', 'link', 'r', 'redirect', 'target', 'go', 'destination', 
      'dest', 'data', 'href', 'dl', 'file', 'out', 'to', 'next'
    ];

    for (const key of candidateKeys) {
      const val = searchParams.get(key);
      if (!val) continue;

      if (isValidPublicUrl(val) && new URL(val).hostname !== parsed.hostname) {
        return val;
      }

      try {
        const decodedUri = decodeURIComponent(val);
        if (isValidPublicUrl(decodedUri) && new URL(decodedUri).hostname !== parsed.hostname) {
          return decodedUri;
        }
      } catch {}

      try {
        const decodedB64 = Buffer.from(val, 'base64').toString('utf8');
        if (isValidPublicUrl(decodedB64) && new URL(decodedB64).hostname !== parsed.hostname) {
          return decodedB64;
        }
      } catch {}

      try {
        if (/^[0-9a-fA-F]+$/.test(val) && val.length % 2 === 0) {
          const decodedHex = Buffer.from(val, 'hex').toString('utf8');
          if (isValidPublicUrl(decodedHex) && new URL(decodedHex).hostname !== parsed.hostname) {
            return decodedHex;
          }
        }
      } catch {}
    }
  } catch {}

  return null;
}

export default async function handler(req, res) {
  applySecurityHeaders(res);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const startTime = Date.now();
  const rawUrl = req.body?.url || req.query?.url;
  if (!rawUrl || !isValidPublicUrl(rawUrl)) {
    return res.status(400).json({
      status: 'error',
      message: 'Parameter URL target tidak valid atau tidak diizinkan.',
      engine: 'nodejs-fast',
      elapsed_ms: Date.now() - startTime
    });
  }

  const cleanUrl = rawUrl.trim();

  // 1. Fast-Path: Periksa query decoding
  const paramUrl = extractFromQueryParams(cleanUrl);
  if (paramUrl) {
    return res.status(200).json({
      status: 'success',
      original_url: cleanUrl,
      resolved_url: paramUrl,
      engine: 'nodejs-fast',
      elapsed_ms: Math.max(1, Date.now() - startTime)
    });
  }

  // 2. Fast-Path: Cek redirect header HTTP
  try {
    const httpRes = await axios.get(cleanUrl, {
      maxRedirects: 5,
      timeout: 4500,
      headers: {
        'User-Agent': UA_DESKTOP,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      validateStatus: (status) => status >= 200 && status < 400
    });

    const finalUrl = httpRes.request?.res?.responseUrl || httpRes.config?.url;
    if (finalUrl && finalUrl !== cleanUrl && isValidPublicUrl(finalUrl)) {
      const origHost = new URL(cleanUrl).hostname;
      const finalHost = new URL(finalUrl).hostname;

      if (origHost !== finalHost) {
        return res.status(200).json({
          status: 'success',
          original_url: cleanUrl,
          resolved_url: finalUrl,
          engine: 'nodejs-fast',
          elapsed_ms: Math.max(1, Date.now() - startTime)
        });
      }
    }

    // 3. Cek meta refresh atau redirect script di DOM
    if (typeof httpRes.data === 'string') {
      const $ = cheerio.load(httpRes.data);
      const metaRefresh = $('meta[http-equiv="refresh"]').attr('content');
      if (metaRefresh) {
        const m = metaRefresh.match(/url=([^"'>\s]+)/i);
        if (m && m[1]) {
          let target = m[1].trim();
          if (target.startsWith('/') && finalUrl) {
            target = new URL(target, finalUrl).toString();
          }
          if (isValidPublicUrl(target)) {
            return res.status(200).json({
              status: 'success',
              original_url: cleanUrl,
              resolved_url: target,
              engine: 'nodejs-fast',
              elapsed_ms: Math.max(1, Date.now() - startTime)
            });
          }
        }
      }
    }
  } catch {}

  // 3. Teruskan ke remote Python Microservice jika dikonfigurasi
  const pythonUrl = process.env.PYTHON_RESOLVER_URL;
  if (pythonUrl) {
    try {
      const pyRes = await axios.post(pythonUrl, { url: cleanUrl }, {
        timeout: 25000,
        headers: { 'Content-Type': 'application/json' }
      });
      if (pyRes.data && (pyRes.data.status === 'success' || pyRes.data.status === 'error')) {
        return res.status(pyRes.data.status === 'success' ? 200 : 422).json({
          ...pyRes.data,
          elapsed_ms: pyRes.data.elapsed_ms || Math.max(1, Date.now() - startTime)
        });
      }
    } catch {}
  }

  return res.status(422).json({
    status: 'error',
    message: 'Link tujuan tidak ditemukan atau dilindungi Captcha.',
    engine: 'nodejs-fast',
    elapsed_ms: Math.max(1, Date.now() - startTime)
  });
}
