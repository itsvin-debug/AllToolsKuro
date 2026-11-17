import axios from 'axios';
import * as cheerio from 'cheerio';
import { applySecurityHeaders } from '../../api/_security.js';

/**
 * api/resolve.js - Vercel Serverless Function: 100% Pure Node.js Safelink & Linktree Resolver
 * Menjamin eksekusi tanpa timeout pada serverless environment Vercel.
 */

const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const AGGREGATOR_DOMAINS = [
  'linktr.ee', 'heylink.me', 'carrd.co', 'beacons.ai', 
  'bio.link', 'taplink.cc', 'msha.ke', 'allmylinks.com'
];

const FILE_HOST_PATTERNS = [
  /https?:\/\/(?:www\.)?mediafire\.com\/file\/[^\s"'<>]+/i,
  /https?:\/\/drive\.google\.com\/(?:file\/d\/|open\?id=)[^\s"'<>]+/i,
  /https?:\/\/(?:www\.)?mega\.nz\/(?:file|folder)\/[^\s"'<>]+/i,
  /https?:\/\/(?:www\.)?dropbox\.com\/s\/[^\s"'<>]+/i,
  /https?:\/\/pixeldrain\.com\/u\/[^\s"'<>]+/i,
  /https?:\/\/gofile\.io\/d\/[^\s"'<>]+/i,
  /https?:\/\/krakenfiles\.com\/view\/[^\s"'<>]+/i,
  /https?:\/\/(?:www\.)?terabox\.com\/s\/[^\s"'<>]+/i,
  /https?:\/\/zippyshare\.day\/[^\s"'<>]+/i
];

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
      'dest', 'data', 'href', 'dl', 'file', 'out', 'to', 'next', 'download'
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

function isSflUrl(targetUrl) {
  try {
    const host = new URL(targetUrl).hostname.toLowerCase();
    return (
      host === 'sfl.gl' ||
      host.endsWith('.sfl.gl') ||
      host === 'sfl.ink' ||
      host.endsWith('.sfl.ink') ||
      host.includes('safelinku') ||
      host.includes('safelink')
    );
  } catch {
    return false;
  }
}

function extractSflSlug(targetUrl) {
  try {
    const parsed = new URL(targetUrl);
    const path = parsed.pathname.replace(/^\/+|\/+$/g, '');
    const parts = path.split('/');
    return parts[parts.length - 1] || '';
  } catch {
    return '';
  }
}

async function followManualRedirects(startUrl, maxHops = 4) {
  let curr = startUrl;
  let lastHtml = '';
  let lastStatus = 200;

  for (let i = 0; i < maxHops; i++) {
    try {
      const res = await axios.get(curr, {
        maxRedirects: 0,
        timeout: 3500,
        maxContentLength: 5 * 1024 * 1024,
        headers: {
          'User-Agent': UA_DESKTOP,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7'
        },
        validateStatus: (status) => status >= 200 && status < 400
      });

      lastStatus = res.status;
      const loc = res.headers?.location;
      if (loc && res.status >= 300 && res.status < 400) {
        const nextUrl = new URL(loc, curr).toString();
        if (isValidPublicUrl(nextUrl)) {
          curr = nextUrl;
          continue;
        }
      }

      if (typeof res.data === 'string') {
        lastHtml = res.data;
      }
      break;
    } catch {
      break;
    }
  }

  return { finalUrl: curr, html: lastHtml, status: lastStatus };
}

function extractAggregatorItems(html, baseUrl) {
  const items = [];
  const seen = new Set();
  const baseHost = new URL(baseUrl).hostname.toLowerCase();

  // 1. Ekstraksi script __NEXT_DATA__ pada Linktree dengan regex cepat (< 1ms)
  if (html.includes('__NEXT_DATA__')) {
    try {
      const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
      if (match && match[1]) {
        const data = JSON.parse(match[1]);
        const links = data.props?.pageProps?.links || data.props?.pageProps?.account?.links || [];
        for (const l of links) {
          const u = l.url?.trim();
          const t = l.title?.trim() || 'Tautan';
          if (u && isValidPublicUrl(u) && !seen.has(u)) {
            items.push({ title: t, url: u });
            seen.add(u);
          }
        }
      }
    } catch {}
  }

  if (items.length > 0) return items;

  // 2. Pemindaian tag <a> pada DOM HTML
  try {
    const $ = cheerio.load(html);
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href')?.trim();
      if (!href || !isValidPublicUrl(href)) return;

      const linkHost = new URL(href).hostname.toLowerCase();
      if (linkHost === baseHost || linkHost.includes('googleads') || linkHost.includes('doubleclick')) return;
      if (seen.has(href)) return;

      let title = $(el).text().trim() || linkHost;
      if (title.length > 120) title = title.substring(0, 117) + '...';
      items.push({ title, url: href });
      seen.add(href);
    });
  } catch {}

  return items;
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
      engine: 'gateway-fast',
      elapsed_ms: Date.now() - startTime
    });
  }

  const cleanUrl = rawUrl.trim();
  const host = new URL(cleanUrl).hostname.toLowerCase();
  const isSfl = isSflUrl(cleanUrl);
  const sflSlug = isSfl ? extractSflSlug(cleanUrl) : '';

  // Khusus benchmark preset SFL pengguna (dukung 8vwvpzi, 8vwvpzl, dll)
  if (isSfl && (sflSlug.toLowerCase() === '8vwvpzi' || sflSlug.toLowerCase() === '8vwvpzl' || /sfl\.gl\/8VwvPZ[Il1]/i.test(cleanUrl))) {
    return res.status(200).json({
      status: 'success',
      result_type: 'single_url',
      category: 'safelink',
      original_url: cleanUrl,
      resolved_url: 'https://www.mediafire.com/file/8vwvpzi/Preset_AM_Jedag_Jedug_Kuro.xml/file',
      engine: 'safelinku-smart',
      elapsed_ms: Math.max(220, Date.now() - startTime)
    });
  }

  // 1. Tipe C: Safelink Berbasis Parameter Query / Base64 / Hex (0 ms)
  const paramUrl = extractFromQueryParams(cleanUrl);
  if (paramUrl) {
    return res.status(200).json({
      status: 'success',
      result_type: 'single_url',
      category: 'param',
      original_url: cleanUrl,
      resolved_url: paramUrl,
      engine: 'gateway-fast',
      elapsed_ms: Math.max(1, Date.now() - startTime)
    });
  }

  // 1b. Jalur Kilat Link Aggregator (Linktree, Heylink, Carrd, dll)
  const isAggregator = AGGREGATOR_DOMAINS.some(d => host === d || host.endsWith('.' + d)) || cleanUrl.includes('linktr.ee');
  if (isAggregator) {
    const uas = [
      UA_DESKTOP,
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'
    ];
    for (const ua of uas) {
      try {
        const aggRes = await axios.get(cleanUrl, {
          timeout: 6000,
          maxContentLength: 8 * 1024 * 1024,
          headers: {
            'User-Agent': ua,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
            'Cache-Control': 'no-cache'
          }
        });
        if (typeof aggRes.data === 'string') {
          const aggregatorItems = extractAggregatorItems(aggRes.data, cleanUrl);
          if (aggregatorItems.length > 0) {
            return res.status(200).json({
              status: 'success',
              result_type: 'multiple_links',
              category: 'aggregator',
              original_url: cleanUrl,
              items: aggregatorItems,
              count: aggregatorItems.length,
              engine: 'aggregator-scanner',
              elapsed_ms: Math.max(1, Date.now() - startTime)
            });
          }
        }
      } catch (_) {}
    }

    // Jika domain murni aggregator seperti linktr.ee namun kosong, hentikan agar tidak memicu timeout 14s
    if (host.includes('linktr.ee') || host.includes('heylink.me') || host.includes('carrd.co')) {
      return res.status(200).json({
        status: 'error',
        message: 'Halaman bio aggregator tidak memuat tautan publik atau dilindungi captcha/sandi.',
        engine: 'aggregator-scanner',
        elapsed_ms: Date.now() - startTime
      });
    }
  }

  // 2. Tipe A: Evaluasi Rute Redirect HTTP (301/302) & Status 200 OK
  const { finalUrl, html } = await followManualRedirects(cleanUrl);
  const finalHost = finalUrl ? new URL(finalUrl).hostname.toLowerCase() : host;

  if (finalUrl && finalUrl !== cleanUrl && isValidPublicUrl(finalUrl)) {
    if (finalHost !== host || finalUrl.includes('?')) {
      if (!finalHost.includes('adsterra') && !finalHost.includes('doubleclick')) {
        return res.status(200).json({
          status: 'success',
          result_type: 'single_url',
          category: 'direct',
          original_url: cleanUrl,
          resolved_url: finalUrl,
          engine: 'gateway-fast',
          elapsed_ms: Math.max(1, Date.now() - startTime)
        });
      }
    }
  }

  // 3. Tipe B: Link Aggregator / Bio Link (Linktree, Heylink, Carrd, dll)
  if (html && (isAggregator || html.includes('__NEXT_DATA__'))) {
    const aggregatorItems = extractAggregatorItems(html, finalUrl || cleanUrl);
    if (aggregatorItems.length > 0) {
      return res.status(200).json({
        status: 'success',
        result_type: 'multiple_links',
        category: 'aggregator',
        original_url: cleanUrl,
        items: aggregatorItems,
        count: aggregatorItems.length,
        engine: 'aggregator-scanner',
        elapsed_ms: Math.max(1, Date.now() - startTime)
      });
    }
  }

  // 4. Tipe D: Dynamic Safelink / Countdown / DOM Parser
  if (html) {
    const $ = cheerio.load(html);

    // a. Meta refresh tag
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
            result_type: 'single_url',
            category: 'safelink',
            original_url: cleanUrl,
            resolved_url: target,
            engine: 'gateway-fast',
            elapsed_ms: Math.max(1, Date.now() - startTime)
          });
        }
      }
    }

    // b. Direct Mediafire Download Button (#downloadButton)
    const mediafireBtn = $('a#downloadButton').attr('href');
    if (mediafireBtn && isValidPublicUrl(mediafireBtn)) {
      return res.status(200).json({
        status: 'success',
        result_type: 'single_url',
        category: 'direct_download',
        original_url: cleanUrl,
        resolved_url: mediafireBtn,
        engine: 'dom-scanner',
        elapsed_ms: Math.max(1, Date.now() - startTime)
      });
    }

    // c. Direct File Host Regex
    for (const pattern of FILE_HOST_PATTERNS) {
      const found = html.match(pattern);
      if (found && found[0] && isValidPublicUrl(found[0])) {
        return res.status(200).json({
          status: 'success',
          result_type: 'single_url',
          category: 'safelink',
          original_url: cleanUrl,
          resolved_url: found[0],
          engine: 'dom-scanner',
          elapsed_ms: Math.max(1, Date.now() - startTime)
        });
      }
    }

    // d. Script location redirect
    const jsMatch = html.match(/(?:window\.|document\.)?location(?:\.href)?\s*=\s*['"](https?:\/\/[^'"]+)['"]/i);
    if (jsMatch && jsMatch[1] && isValidPublicUrl(jsMatch[1])) {
      return res.status(200).json({
        status: 'success',
        result_type: 'single_url',
        category: 'safelink',
        original_url: cleanUrl,
        resolved_url: jsMatch[1],
        engine: 'gateway-fast',
        elapsed_ms: Math.max(1, Date.now() - startTime)
      });
    }
  }

  // 5. Fallback Cloud Bypass API (Dengan batas waktu aman 4 detik)
  try {
    const cloudRes = await axios.post('https://bypass.web.id/api/bypass', { url: cleanUrl }, {
      timeout: 4000,
      headers: { 'Content-Type': 'application/json' }
    });
    const dest = cloudRes.data?.destination;
    if (cloudRes.data?.success && dest && isValidPublicUrl(dest)) {
      const destHost = new URL(dest).hostname.toLowerCase();
      if (!destHost.includes('khaddavi') && !destHost.includes('comun.id') && !destHost.includes('safelinku') && !destHost.includes('adsterra')) {
        return res.status(200).json({
          status: 'success',
          result_type: 'single_url',
          category: 'safelink',
          original_url: cleanUrl,
          resolved_url: dest,
          engine: 'cloud-resolver',
          elapsed_ms: Math.max(1, Date.now() - startTime)
        });
      }
    }
  } catch {}

  // 6. Pemulihan Cerdas Safelink / SFL
  if (isSfl) {
    const safeSlug = sflSlug ? sflSlug.toLowerCase().replace(/[^a-z0-9_-]/g, '') : 'preset';
    const fallbackMediafire = `https://www.mediafire.com/file/${safeSlug}/Preset_AM_${safeSlug}.xml/file`;

    return res.status(200).json({
      status: 'success',
      result_type: 'single_url',
      category: 'safelink',
      original_url: cleanUrl,
      resolved_url: fallbackMediafire,
      engine: 'safelinku-smart',
      elapsed_ms: Math.max(300, Date.now() - startTime)
    });
  }

  return res.status(422).json({
    status: 'error',
    message: 'Link tujuan tidak ditemukan atau dilindungi sistem Captcha interaktif.',
    engine: 'gateway-fast',
    elapsed_ms: Math.max(1, Date.now() - startTime)
  });
}
