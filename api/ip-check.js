import axios from 'axios';
import { applySecurityHeaders, validateRequestSecurity } from './_security.js';

function isPrivateIp(ip) {
  if (!ip || typeof ip !== 'string') return true;
  const clean = ip.trim().replace(/^::ffff:/, '');

  if (clean === 'localhost' || clean === '127.0.0.1' || clean === '::1' || clean === '0.0.0.0') {
    return true;
  }
  if (/^10\./.test(clean)) return true;
  if (/^192\.168\./.test(clean)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(clean)) return true;
  if (/^169\.254\./.test(clean)) return true;
  if (/^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./.test(clean)) return true;
  if (/^fe80:/i.test(clean) || /^fc00:/i.test(clean) || /^fd/i.test(clean)) return true;

  return false;
}

function extractClientIp(req) {
  const cfIp = req.headers['cf-connecting-ip'];
  if (cfIp && typeof cfIp === 'string' && cfIp.trim()) return cfIp.trim();

  const realIp = req.headers['x-real-ip'];
  if (realIp && typeof realIp === 'string' && realIp.trim()) return realIp.trim();

  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded && typeof forwarded === 'string') {
    const list = forwarded.split(',').map((s) => s.trim()).filter(Boolean);
    for (const item of list) {
      if (!isPrivateIp(item)) return item;
    }
    if (list[0]) return list[0];
  }

  const socketAddress = req.socket?.remoteAddress || req.connection?.remoteAddress || req.ip;
  if (socketAddress && typeof socketAddress === 'string') {
    return socketAddress.replace(/^::ffff:/, '').trim();
  }

  return '127.0.0.1';
}

function getCountryFlagEmoji(countryCode) {
  if (!countryCode || countryCode.length !== 2) return '🌐';
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

export default async function handler(req, res) {
  applySecurityHeaders(res);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!validateRequestSecurity(req, res)) return;

  const clientIp = extractClientIp(req);
  const requestedIp = req.query.ip ? String(req.query.ip).trim() : null;

  let targetIp = requestedIp || clientIp;
  if (targetIp === 'self' || targetIp === 'me') targetIp = clientIp;

  // Proteksi SSRF
  if (requestedIp && isPrivateIp(targetIp)) {
    return res.status(403).json({
      success: false,
      error: 'ssrf_blocked',
      message: 'Lookup ke IP lokal atau jaringan privat (RFC 1918 / Loopback) dilarang demi keamanan sistem.'
    });
  }

  const isLocalClient = isPrivateIp(targetIp);
  const startTime = Date.now();

  try {
    const ipwhoPromise = axios.get(`https://ipwho.is/${isLocalClient ? '' : encodeURIComponent(targetIp)}`, {
      timeout: 5500,
      headers: {
        'User-Agent': 'KuroStudio-NetworkTelemetry/1.0',
        'Accept': 'application/json'
      }
    }).then(r => r.data).catch(() => null);

    const ipApiUrl = isLocalClient 
      ? 'http://ip-api.com/json/?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,asname,reverse,mobile,proxy,hosting,query'
      : `http://ip-api.com/json/${encodeURIComponent(targetIp)}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,asname,reverse,mobile,proxy,hosting,query`;

    const ipApiPromise = axios.get(ipApiUrl, {
      timeout: 5500,
      headers: {
        'User-Agent': 'KuroStudio-NetworkTelemetry/1.0',
        'Accept': 'application/json'
      }
    }).then(r => r.data).catch(() => null);

    const [ipwhoData, ipApiData] = await Promise.all([ipwhoPromise, ipApiPromise]);

    if ((!ipwhoData || !ipwhoData.success) && (!ipApiData || ipApiData.status !== 'success')) {
      return res.status(200).json(buildFallbackTelemetry(targetIp, startTime));
    }

    const finalIp = ipwhoData?.ip || ipApiData?.query || targetIp;
    const ipType = finalIp.includes(':') ? 'IPv6' : 'IPv4';

    const asnNumber = ipwhoData?.connection?.asn 
      ? `AS${ipwhoData.connection.asn}` 
      : (ipApiData?.as ? (ipApiData.as.split(' ')[0] || 'AS---') : 'AS---');

    const asnName = ipwhoData?.connection?.org 
      || ipwhoData?.connection?.isp 
      || ipApiData?.asname 
      || ipApiData?.org 
      || 'Autonomous System';

    const isProxyOrVpn = Boolean(ipApiData?.proxy);
    const isHosting = Boolean(ipApiData?.hosting);
    const isMobile = Boolean(ipApiData?.mobile);
    const reverseDns = ipApiData?.reverse || ipwhoData?.connection?.domain || '';

    let connectionType = 'Residensial / Broadband (Fiber/Cable)';
    if (isMobile) {
      connectionType = 'Jaringan Seluler / Data Seluler (4G/5G)';
    } else if (isHosting) {
      connectionType = 'Pusat Data / Server Cloud (Hosting/VPS)';
    }

    let securityRating = 'Aman (Residensial)';
    let threatBadgeColor = 'emerald';
    if (isProxyOrVpn) {
      securityRating = 'Peringatan: VPN / Proxy / Exit Node Terdeteksi';
      threatBadgeColor = 'rose';
    } else if (isHosting) {
      securityRating = 'Koneksi Server / Datacenter';
      threatBadgeColor = 'amber';
    }

    const lat = ipwhoData?.latitude || ipApiData?.lat || 0;
    const lon = ipwhoData?.longitude || ipApiData?.lon || 0;
    const countryName = ipwhoData?.country || ipApiData?.country || 'Unknown Country';
    const countryCode = (ipwhoData?.country_code || ipApiData?.countryCode || 'UN').toUpperCase();

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      elapsedMs: Math.max(1, Date.now() - startTime),
      ip: finalIp,
      type: ipType,
      isSelf: !requestedIp || requestedIp === 'self' || requestedIp === clientIp,
      isp: {
        name: ipwhoData?.connection?.isp || ipApiData?.isp || 'Unknown ISP',
        organization: ipwhoData?.connection?.org || ipApiData?.org || 'Unknown Organization',
        domain: ipwhoData?.connection?.domain || ''
      },
      asn: {
        code: asnNumber,
        name: asnName,
        route: ipApiData?.as || `${asnNumber} ${asnName}`
      },
      location: {
        country: countryName,
        countryCode: countryCode,
        flagEmoji: ipwhoData?.flag?.emoji || getCountryFlagEmoji(countryCode),
        flagSvg: ipwhoData?.flag?.img || `https://flagcdn.com/${countryCode.toLowerCase()}.svg`,
        region: ipwhoData?.region || ipApiData?.regionName || '',
        city: ipwhoData?.city || ipApiData?.city || '',
        postal: ipwhoData?.postal || ipApiData?.zip || '',
        latitude: lat,
        longitude: lon,
        mapsUrl: `https://www.google.com/maps?q=${lat},${lon}`
      },
      timezone: {
        id: ipwhoData?.timezone?.id || ipApiData?.timezone || 'UTC',
        abbr: ipwhoData?.timezone?.abbr || '',
        utc: ipwhoData?.timezone?.utc || '+00:00',
        currentTime: ipwhoData?.timezone?.current_time || new Date().toISOString()
      },
      connection: {
        type: connectionType,
        isMobile,
        isHosting,
        reverseDns: reverseDns || 'Tidak ada PTR record'
      },
      security: {
        isVpn: isProxyOrVpn,
        isProxy: isProxyOrVpn,
        isHosting: isHosting,
        isTor: false,
        threatLevel: isProxyOrVpn ? 'high' : isHosting ? 'moderate' : 'low',
        ratingText: securityRating,
        badgeColor: threatBadgeColor
      },
      dns: {
        reverseDns: reverseDns || '-',
        recommendedPublicDns: [
          { provider: 'Cloudflare', primary: '1.1.1.1', secondary: '1.0.0.1', description: 'Kecepatan tinggi & privasi ketat' },
          { provider: 'Google Public DNS', primary: '8.8.8.8', secondary: '8.8.4.4', description: 'Global anycast & reliabilitas tinggi' },
          { provider: 'Quad9', primary: '9.9.9.9', secondary: '149.112.112.112', description: 'Proteksi malware & phishing bawaan' }
        ]
      }
    });
  } catch (err) {
    console.error('Error saat Vercel serverless IP check:', err.message);
    return res.status(200).json(buildFallbackTelemetry(targetIp, startTime));
  }
}

function buildFallbackTelemetry(ip, startTime) {
  const isV6 = (ip || '').includes(':');
  return {
    success: true,
    isFallback: true,
    timestamp: new Date().toISOString(),
    elapsedMs: Math.max(1, Date.now() - startTime),
    ip: ip || '127.0.0.1',
    type: isV6 ? 'IPv6' : 'IPv4',
    isSelf: true,
    isp: {
      name: 'Penyedia Jaringan Lokal',
      organization: 'Local Network',
      domain: '-'
    },
    asn: {
      code: 'AS---',
      name: 'Private/Local ASN',
      route: 'Local Routing'
    },
    location: {
      country: 'Indonesia',
      countryCode: 'ID',
      flagEmoji: '🇮🇩',
      flagSvg: 'https://flagcdn.com/id.svg',
      region: 'Jakarta',
      city: 'Jakarta',
      postal: '-',
      latitude: -6.2088,
      longitude: 106.8456,
      mapsUrl: 'https://www.google.com/maps?q=-6.2088,106.8456'
    },
    timezone: {
      id: 'Asia/Jakarta',
      abbr: 'WIB',
      utc: '+07:00',
      currentTime: new Date().toISOString()
    },
    connection: {
      type: 'Koneksi Lokal / Standar',
      isMobile: false,
      isHosting: false,
      reverseDns: '-'
    },
    security: {
      isVpn: false,
      isProxy: false,
      isHosting: false,
      isTor: false,
      threatLevel: 'low',
      ratingText: 'Data Cadangan (Layanan Lookup Timeout)',
      badgeColor: 'emerald'
    },
    dns: {
      reverseDns: '-',
      recommendedPublicDns: [
        { provider: 'Cloudflare', primary: '1.1.1.1', secondary: '1.0.0.1', description: 'Kecepatan tinggi & privasi ketat' },
        { provider: 'Google Public DNS', primary: '8.8.8.8', secondary: '8.8.4.4', description: 'Global anycast & reliabilitas tinggi' },
        { provider: 'Quad9', primary: '9.9.9.9', secondary: '149.112.112.112', description: 'Proteksi malware & phishing bawaan' }
      ]
    }
  };
}
