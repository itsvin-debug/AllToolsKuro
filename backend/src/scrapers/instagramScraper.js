import axios from 'axios';

const profileCache = new Map();
const CACHE_TTL_MS = 60 * 1000;

export function extractCleanHandle(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let str = raw.trim();

  if (/^https?:\/\//i.test(str) || /(?:tiktok|instagram|twitter|x|github)\.com\//i.test(str)) {
    try {
      const urlObj = new URL(str.startsWith('http') ? str : `https://${str}`);
      const segments = urlObj.pathname.split('/').filter(Boolean);
      const ignored = ['p', 'reel', 'reels', 'stories', 'tv', 'explore', 'accounts', 'i', 'intent', 'search', 'home', 'video', 'photo'];
      const validSeg = segments.find(s => !ignored.includes(s.toLowerCase()));
      if (validSeg) str = validSeg;
    } catch (_) {}
  }

  str = str.replace(/^@+\s*/, '');
  str = str.split(/[\/\?\&#\s]/)[0];
  return str.replace(/[^a-zA-Z0-9_.-]/g, '').trim();
}

function resolveInstagramUsername(raw) {
  return extractCleanHandle(raw);
}

// Parser meta tag dua arah (kebal urutan atribut property/name dan content)
export function extractMetaTag(html, key) {
  if (!html || typeof html !== 'string') return '';
  const reg1 = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']`, 'i');
  const reg2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`, 'i');
  const match = html.match(reg1) || html.match(reg2);
  if (!match || !match[1]) return '';
  return match[1]
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#064;/g, '@')
    .replace(/&#x2022;/g, '•')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));
}

// Parser angka metrik cerdas dengan dukungan singkatan multi-bahasa
export function parseIgMetric(val) {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  let str = String(val).trim().replace(/\s+/g, '');
  const unitMatch = str.match(/([KMBkmb]|rb|jt)$/i);
  let mult = 1;
  if (unitMatch) {
    const u = unitMatch[1].toLowerCase();
    if (u === 'k' || u === 'rb') mult = 1_000;
    else if (u === 'm' || u === 'jt') mult = 1_000_000;
    else if (u === 'b') mult = 1_000_000_000;
    str = str.replace(/([KMBkmb]|rb|jt)$/i, '');
  }
  if (mult > 1) {
    if (str.includes(',') && !str.includes('.')) str = str.replace(',', '.');
    else str = str.replace(/,/g, '');
    return Math.round(parseFloat(str) * mult) || 0;
  }
  return parseInt(str.replace(/[.,]/g, ''), 10) || 0;
}

export function isValidInstagramData(d) {
  if (!d || !d.username) return false;
  const uName = String(d.username).trim().toLowerCase();
  const rawName = String(d.fullName || d.nickname || '').trim();
  const hasRealName = rawName !== '' && rawName.toLowerCase() !== uName;
  const rawAvatar = String(d.avatar || '');
  const hasValidAvatar = rawAvatar.startsWith('http') && !rawAvatar.includes('default') && !rawAvatar.includes('dumpor-logo');
  const hasBio = Boolean(d.bio && String(d.bio).trim() !== '');
  const followers = Number(d.stats?.followers ?? d.followers ?? 0);
  const following = Number(d.stats?.following ?? d.following ?? 0);
  const posts = Number(d.stats?.posts ?? d.posts ?? 0);
  const hasStats = (followers > 0 || following > 0 || posts > 0);
  const isPrivate = Boolean(d.isPrivate || d.privateAccount || d.is_private);

  return Boolean(hasRealName || hasValidAvatar || hasBio || hasStats || isPrivate);
}

// Normalizer dan parser HTML Instagram komprehensif
export function parseInstagramHtml(html, username) {
  if (!html || typeof html !== 'string') return null;

  const ogTitle = extractMetaTag(html, 'og:title');
  const ogImg = extractMetaTag(html, 'og:image');
  const descTag = extractMetaTag(html, 'description');
  const ogDesc = extractMetaTag(html, 'og:description');
  const combinedDesc = `${descTag} ${ogDesc}`.trim();

  let fullName = '';
  if (ogTitle) {
    fullName = ogTitle.replace(/\s*\(@[a-zA-Z0-9_.]+\).*/, '').replace(/•.*/, '').replace(/\s*\|.*/, '').trim();
  }

  // Parse angka metrik dari teks deskripsi
  const fMatch = combinedDesc.match(/([0-9.,]+(?:\s*[KMBkmb]|rb|jt)?)\s*(?:Followers|Pengikut)/i);
  const foMatch = combinedDesc.match(/([0-9.,]+(?:\s*[KMBkmb]|rb|jt)?)\s*(?:Following|Mengikuti)/i);
  const pMatch = combinedDesc.match(/([0-9.,]+(?:\s*[KMBkmb]|rb|jt)?)\s*(?:Posts|Postingan|Kiriman)/i);

  const followers = fMatch ? parseIgMetric(fMatch[1]) : 0;
  const following = foMatch ? parseIgMetric(foMatch[1]) : 0;
  const posts = pMatch ? parseIgMetric(pMatch[1]) : 0;

  // Ekstraksi bio (dari kutipan 'on Instagram: "..."' atau pemisah dash)
  let bio = '';
  const bioMatch = descTag.match(/on Instagram:\s*["“'«](.+?)["”'»]\s*$/i) ||
                   descTag.match(/on Instagram:\s*["“'«]([^\n\r"”'»]+)/i) ||
                   ogDesc.match(/on Instagram:\s*["“'«](.+?)["”'»]\s*$/i);
  if (bioMatch) bio = bioMatch[1].trim();

  if (!bio) {
    const bioJsonMatch = html.match(/"biography":"([^"]+)"/) || html.match(/"bio":"([^"]+)"/);
    if (bioJsonMatch && bioJsonMatch[1]) {
      try { bio = JSON.parse(`"${bioJsonMatch[1]}"`); } catch { bio = bioJsonMatch[1]; }
    }
  }

  if (!bio && combinedDesc.includes(' - ')) {
    const parts = combinedDesc.split(' - ');
    if (parts.length > 1) {
      const candidate = parts[1].trim();
      if (!candidate.startsWith('See Instagram photos') && !candidate.startsWith('Lihat foto')) {
        bio = candidate;
      }
    }
  }

  const isPrivate = Boolean(
    html.includes('"is_private":true') || 
    html.includes('"isPrivate":true') ||
    html.includes('This Account is Private') || 
    html.includes('Akun Ini Privat')
  );

  const isVerified = Boolean(
    html.includes('"is_verified":true') ||
    html.includes('"isVerified":true') ||
    combinedDesc.toLowerCase().includes('verified')
  );

  let avatar = ogImg || '';
  if (!avatar) {
    const avMatch = html.match(/"profile_pic_url_hd":"([^"]+)"/) || html.match(/"profile_pic_url":"([^"]+)"/);
    if (avMatch) {
      avatar = avMatch[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/').replace(/&amp;/g, '&');
    }
  }

  const extracted = {
    username,
    fullName: fullName || username,
    nickname: fullName || username,
    avatar: (avatar || '').replace(/&amp;/g, '&'),
    bio: bio || '',
    bioLink: null,
    isPrivate,
    privateAccount: isPrivate,
    isVerified,
    verified: isVerified,
    followers,
    following,
    posts,
    stats: { followers, following, posts },
    recentMedia: [],
    category: 'Kreator',
    profileUrl: `https://www.instagram.com/${username}`
  };

  return isValidInstagramData(extracted) ? extracted : null;
}

// Jalur 1: Crawler OpenGraph Meta Bot
async function fetchEngineCrawlerOpenGraph(username) {
  const crawlers = [
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    'WhatsApp/2.23.20.0'
  ];

  for (const ua of crawlers) {
    try {
      const res = await axios.get(`https://www.instagram.com/${encodeURIComponent(username)}/`, {
        timeout: 4000,
        validateStatus: (s) => s < 500,
        headers: {
          'User-Agent': ua,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9,id;q=0.8'
        }
      });

      if (res.status === 404) {
        const err = new Error(`Akun Instagram @${username} tidak ditemukan.`);
        err.isNotFound = true;
        throw err;
      }

      const html = typeof res.data === 'string' ? res.data : '';
      const parsed = parseInstagramHtml(html, username);
      if (parsed) {
        return { source: 'crawler_link_preview', data: parsed };
      }
    } catch (e) {
      if (e.isNotFound) throw e;
    }
  }

  throw new Error('Jalur Crawler did not yield valid profile data');
}

// Jalur 2: Google Edge Relay (Bypass blokir WAF IP Datacenter/AWS Vercel)
async function fetchEngineGoogleRelay(username) {
  const crawlers = [
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    'WhatsApp/2.23.20.0',
    'LinkedInBot/1.0 (compatible; +http://www.linkedin.com)'
  ];

  const targetClean = encodeURIComponent(username);
  const endpoints = [
    `https://www-instagram-com.translate.goog/${targetClean}/?_x_tr_sl=auto&_x_tr_tl=en&_x_tr_hl=en`,
    `https://translate.google.com/translate?sl=auto&tl=en&u=https://www.instagram.com/${targetClean}/`
  ];

  for (const url of endpoints) {
    for (const ua of crawlers) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 5500);
        const res = await fetch(url, {
          headers: {
            'User-Agent': ua,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9'
          },
          signal: ctrl.signal
        });
        clearTimeout(timer);

        if (!res.ok) continue;
        const html = await res.text();
        if (!html || html.length < 1000) continue;

        const parsed = parseInstagramHtml(html, username);
        if (parsed && isValidInstagramData(parsed)) {
          return { source: 'google_edge_relay', data: parsed };
        }
      } catch (_) {}
    }
  }

  throw new Error('Google Relay did not yield valid profile data');
}

// Jalur 3: Direct Web Profile API
async function fetchEngineWebProfileApi(username) {
  try {
    const webRes = await axios.get(`https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`, {
      timeout: 3500,
      validateStatus: (status) => status < 500,
      headers: {
        'x-ig-app-id': '936619743392459',
        'x-asbd-id': '129477',
        'x-ig-www-claim': '0',
        'x-requested-with': 'XMLHttpRequest',
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
        'Referer': `https://www.instagram.com/${username}/`
      }
    });

    if (webRes.status === 404) {
      const err = new Error(`Akun Instagram @${username} tidak ditemukan.`);
      err.isNotFound = true;
      throw err;
    }

    if (webRes.status === 200 && webRes.data?.data?.user) {
      const u = webRes.data.data.user;
      const followers = Number(u.edge_followed_by?.count || 0);
      const following = Number(u.edge_follow?.count || 0);
      const posts = Number(u.edge_owner_to_timeline_media?.count || 0);

      const recentMedia = (u.edge_owner_to_timeline_media?.edges || []).slice(0, 6).map(edge => {
        const node = edge.node || {};
        return {
          id: node.id,
          shortcode: node.shortcode,
          url: `https://www.instagram.com/p/${node.shortcode}/`,
          displayUrl: node.display_url || node.thumbnail_src || '',
          likes: Number(node.edge_liked_by?.count || node.edge_media_preview_like?.count || 0),
          comments: Number(node.edge_media_to_comment?.count || 0),
          caption: node.edge_media_to_caption?.edges?.[0]?.node?.text || '',
          isVideo: Boolean(node.is_video)
        };
      });

      const extracted = {
        username: u.username || username,
        fullName: u.full_name || u.username || username,
        nickname: u.full_name || u.username || username,
        avatar: u.profile_pic_url_hd || u.profile_pic_url || '',
        bio: u.biography || '',
        bioLink: u.external_url || null,
        isPrivate: Boolean(u.is_private),
        privateAccount: Boolean(u.is_private),
        isVerified: Boolean(u.is_verified),
        verified: Boolean(u.is_verified),
        followers,
        following,
        posts,
        stats: { followers, following, posts },
        recentMedia,
        category: u.category_name || 'Kreator',
        profileUrl: `https://www.instagram.com/${u.username || username}`
      };

      if (isValidInstagramData(extracted)) {
        return { source: 'instagram_direct_api', data: extracted };
      }
    }
  } catch (err) {
    if (err.isNotFound) throw err;
  }
  throw new Error('Jalur Web Profile API did not yield valid profile data');
}

// Deep Merge Engine penggabung metadata parsial dari berbagai jalur
function deepMergeInstagramData(primary, secondary) {
  if (!primary) return secondary || null;
  if (!secondary) return primary || null;

  const username = primary.username || secondary.username;
  const fullName = (primary.fullName && primary.fullName.toLowerCase() !== username.toLowerCase())
    ? primary.fullName
    : (secondary.fullName || primary.fullName || username);

  const avatar = (primary.avatar && primary.avatar.startsWith('http') && !primary.avatar.includes('default'))
    ? primary.avatar
    : (secondary.avatar || primary.avatar || '');

  const bio = primary.bio || secondary.bio || '';
  const isPrivate = Boolean(primary.isPrivate || secondary.isPrivate || primary.privateAccount || secondary.privateAccount);
  const isVerified = Boolean(primary.isVerified || secondary.isVerified || primary.verified || secondary.verified);

  const followers = Math.max(Number(primary.followers || primary.stats?.followers || 0), Number(secondary.followers || secondary.stats?.followers || 0));
  const following = Math.max(Number(primary.following || primary.stats?.following || 0), Number(secondary.following || secondary.stats?.following || 0));
  const posts = Math.max(Number(primary.posts || primary.stats?.posts || 0), Number(secondary.posts || secondary.stats?.posts || 0));

  const recentMedia = (Array.isArray(primary.recentMedia) && primary.recentMedia.length > 0)
    ? primary.recentMedia
    : (Array.isArray(secondary.recentMedia) ? secondary.recentMedia : []);

  return {
    username,
    fullName,
    nickname: fullName,
    avatar,
    bio,
    bioLink: primary.bioLink || secondary.bioLink || null,
    isPrivate,
    privateAccount: isPrivate,
    isVerified,
    verified: isVerified,
    followers,
    following,
    posts,
    stats: { followers, following, posts },
    recentMedia,
    category: primary.category || secondary.category || 'Kreator',
    profileUrl: `https://www.instagram.com/${username}`
  };
}

export async function scrapeInstagram(rawInput, options = {}) {
  const forceRefresh = Boolean(options.forceRefresh || options.refresh);
  const username = resolveInstagramUsername(rawInput);

  if (!username) {
    return {
      success: false,
      statusCode: 400,
      error: 'invalid_username',
      message: 'Username atau tautan Instagram tidak valid.'
    };
  }

  const cacheKey = username.toLowerCase();
  const cached = profileCache.get(cacheKey);
  if (!forceRefresh && cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    return {
      success: true,
      platform: 'instagram',
      source: 'memory_cache',
      cached: true,
      data: cached.data
    };
  }

  // Eksekusi paralel seluruh mesin scraper dengan batas waktu masing-masing
  const [resCrawler, resRelay, resWebApi] = await Promise.allSettled([
    fetchEngineCrawlerOpenGraph(username),
    fetchEngineGoogleRelay(username),
    fetchEngineWebProfileApi(username)
  ]);

  const dataCrawler = resCrawler.status === 'fulfilled' ? resCrawler.value?.data : null;
  const dataRelay = resRelay.status === 'fulfilled' ? resRelay.value?.data : null;
  const dataWebApi = resWebApi.status === 'fulfilled' ? resWebApi.value?.data : null;

  // Deep merge seluruh hasil metadata parsial yang berhasil
  let mergedData = deepMergeInstagramData(dataCrawler || dataRelay, dataWebApi);
  if (dataRelay) {
    mergedData = deepMergeInstagramData(mergedData, dataRelay);
  }

  if (!isValidInstagramData(mergedData)) {
    return {
      success: false,
      statusCode: 404,
      error: 'user_not_found',
      message: `Akun Instagram @${username} tidak ditemukan atau data publik tidak dapat diakses.`
    };
  }

  profileCache.set(cacheKey, {
    timestamp: Date.now(),
    data: mergedData
  });

  const finalSource = dataCrawler 
    ? (dataRelay ? 'native_hybrid_merged' : 'crawler_link_preview')
    : (dataRelay ? 'google_edge_relay' : 'instagram_direct_api');

  return {
    success: true,
    platform: 'instagram',
    source: finalSource,
    cached: false,
    data: mergedData
  };
}

export default scrapeInstagram;
