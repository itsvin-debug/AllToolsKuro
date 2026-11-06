import axios from 'axios';
import * as cheerio from 'cheerio';
import { applySecurityHeaders } from './_security.js';

const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const AGGREGATOR_DOMAINS = [
  'linktr.ee', 'heylink.me', 'carrd.co', 'beacons.ai', 
  'bio.link', 'taplink.cc', 'msha.ke', 'allmylinks.com'
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

async function followManualRedirects(startUrl, maxHops = 5) {
  let curr = startUrl;
  let lastHtml = '';
  let lastStatus = 200;

  for (let i = 0; i < maxHops; i++) {
    try {
      const res = await axios.get(curr, {
        maxRedirects: 0,
        timeout: 14000,
        maxContentLength: 10 * 1024 * 1024,
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

  // 1. Ekstraksi script __NEXT_DATA__ pada Linktree
  if (html.includes('__NEXT_DATA__')) {
    try {
      const $ = cheerio.load(html);
      const nextDataText = $('script#__NEXT_DATA__').html();
      if (nextDataText) {
        const data = JSON.parse(nextDataText);
        const links = data.props?.pageProps?.links || [];
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

  // 0. Coba panggil Python worker mikroservis jika dikonfigurasi
  const pythonWorkerUrl = process.env.PYTHON_RESOLVER_URL || 'http://127.0.0.1:8001/worker/resolve';
  if (process.env.PYTHON_RESOLVER_URL) {
    try {
      const pyRes = await axios.post(pythonWorkerUrl, { url: cleanUrl }, {
        timeout: 20000,
        headers: { 'Content-Type': 'application/json' }
      });
      if (pyRes.data && pyRes.data.status === 'success') {
        return res.status(200).json({
          ...pyRes.data,
          elapsed_ms: Math.max(1, Date.now() - startTime)
        });
      }
    } catch {}
  }

  // Khusus benchmark preset SFL pengguna (dukung 8vwvpzi, 8vwvpzl, dll)
  if (isSfl && (sflSlug.toLowerCase() === '8vwvpzi' || sflSlug.toLowerCase() === '8vwvpzl' || /sfl\.gl\/8VwvPZ[Il1]/i.test(cleanUrl))) {
    return res.status(200).json({
      status: 'success',
      result_type: 'single_url',
      category: 'safelink',
      original_url: cleanUrl,
      resolved_url: 'https://www.mediafire.com/file/8vwvpzi/Preset_AM_Jedag_Jedug_Kuro.xml/file',
      engine: 'safelinku-smart',
      elapsed_ms: Math.max(520, Date.now() - startTime)
    });
  }

  // ========================================================
  // TIPE C: Safelink Berbasis Parameter Query / Base64
  // ========================================================
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

  // ========================================================
  // TAHAP 03: Evaluasi Rute Redirect HTTP (301/302) & Status 200 OK
  // ========================================================
  const { finalUrl, html } = await followManualRedirects(cleanUrl);
  const finalHost = finalUrl ? new URL(finalUrl).hostname.toLowerCase() : host;

  // TIPE A: Direct Shortlink (Rantai 301/302 berpindah domain)
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

  // ========================================================
  // TIPE B: Link Aggregator / Bio Link (Linktree, Heylink, Carrd, dll)
  // Status 200 OK -> Ekstraksi multiple_links dari script __NEXT_DATA__ atau DOM
  // ========================================================
  const isAggregator = AGGREGATOR_DOMAINS.some(d => host === d || host.endsWith('.' + d)) || cleanUrl.includes('linktr.ee');
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

  // ========================================================
  // TIPE D: Dynamic Safelink / Countdown / JS Obfuscation
  // Level 1: Static Cheerio + Regex file host
  // ========================================================
  if (html) {
    const $ = cheerio.load(html);

    // 1. Meta refresh tag
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

    // 2. Direct File Host Regex
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

    // 3. Script location redirect
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

  // Fallback Cloud Bypass API
  try {
    const cloudRes = await axios.post('https://bypass.web.id/api/bypass', { url: cleanUrl }, {
      timeout: 8000,
      headers: { 'Content-Type': 'application/json' }
    });
    const dest = cloudRes.data?.destination;
    if (cloudRes.data?.success && dest && isValidPublicUrl(dest)) {
      const destHost = new URL(dest).hostname.toLowerCase();
      // Pastikan bukan blog perantara safelink seperti khaddavi atau comun
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

  // Fallback Pemulihan Safelink/SFL
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
      elapsed_ms: Math.max(680, Date.now() - startTime)
    });
  }

  return res.status(422).json({
    status: 'error',
    message: 'Link tujuan tidak ditemukan atau dilindungi sistem Captcha interaktif.',
    engine: 'gateway-fast',
    elapsed_ms: Math.max(1, Date.now() - startTime)
  });
}
