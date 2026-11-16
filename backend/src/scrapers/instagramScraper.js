import axios from 'axios';

const profileCache = new Map();
const CACHE_TTL_MS = 60 * 1000;

function resolveInstagramUsername(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let str = raw.trim();
  const urlMatch = str.match(/instagram\.com\/([a-zA-Z0-9_.]+)/i);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1].replace(/\/.*$/, '').trim();
  }
  return str.replace(/^@+/, '').split(/[\/\?\s]/)[0].trim();
}

function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&#064;/g, '@')
    .replace(/&#x2022;/g, '•')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function parseMetricString(str) {
  if (!str) return 0;
  const clean = str.replace(/,/g, '').trim().toUpperCase();
  if (clean.endsWith('M')) {
    return Math.round(parseFloat(clean) * 1000000);
  }
  if (clean.endsWith('K')) {
    return Math.round(parseFloat(clean) * 1000);
  }
  return parseInt(clean.replace(/[^0-9]/g, ''), 10) || 0;
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

  let mappedData = null;
  let sourceEngine = 'web_profile_info';

  // 1. Engine 1: Direct Internal Web API
  try {
    const webRes = await axios.get(`https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`, {
      timeout: 7000,
      validateStatus: (status) => status < 500,
      headers: {
        'x-ig-app-id': '936619743392459',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
        'Referer': 'https://www.instagram.com/'
      }
    });

    if (webRes.status === 404) {
      return {
        success: false,
        statusCode: 404,
        error: 'user_not_found',
        message: `Akun Instagram @${username} tidak ditemukan atau telah dinonaktifkan.`
      };
    }

    if (webRes.status === 200 && webRes.data?.data?.user) {
      const u = webRes.data.data.user;
      mappedData = {
        username: u.username || username,
        nickname: u.full_name || u.username || username,
        avatar: u.profile_pic_url_hd || u.profile_pic_url || '',
        bio: u.biography || '',
        bioLink: u.external_url || null,
        verified: Boolean(u.is_verified),
        privateAccount: Boolean(u.is_private),
        followers: Number(u.edge_followed_by?.count || 0),
        following: Number(u.edge_follow?.count || 0),
        posts: Number(u.edge_owner_to_timeline_media?.count || 0),
        category: u.category_name || 'Kreator',
        profileUrl: `https://www.instagram.com/${u.username || username}`
      };
      sourceEngine = 'instagram_direct_api';
    }
  } catch (err) {
    if (err.response?.status === 404) {
      return {
        success: false,
        statusCode: 404,
        error: 'user_not_found',
        message: `Akun Instagram @${username} tidak ditemukan atau telah dinonaktifkan.`
      };
    }
  }

  // 2. Engine 2: OpenGraph HTML Scraping Fallback (Mobile Engine)
  if (!mappedData) {
    try {
      const ogRes = await axios.get(`https://www.instagram.com/${encodeURIComponent(username)}/`, {
        timeout: 8000,
        validateStatus: (status) => status < 500,
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9,id;q=0.8'
        }
      });

      if (ogRes.status === 404) {
        return {
          success: false,
          statusCode: 404,
          error: 'user_not_found',
          message: `Akun Instagram @${username} tidak ditemukan.`
        };
      }

      if (ogRes.status === 200 && ogRes.data) {
        const html = typeof ogRes.data === 'string' ? ogRes.data : '';
        const descMatch = html.match(/<meta property="og:description" content="([^"]+)"/);
        const imgMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
        const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);

        if (descMatch && descMatch[1]) {
          const rawDesc = decodeHtmlEntities(descMatch[1]);
          const statRegex = /([0-9.,KMBkmb]+)\s+Followers,\s+([0-9.,KMBkmb]+)\s+Following,\s+([0-9.,KMBkmb]+)\s+Posts/i;
          const statsParsed = rawDesc.match(statRegex);

          let name = username;
          if (titleMatch && titleMatch[1]) {
            const rawTitle = decodeHtmlEntities(titleMatch[1]);
            name = rawTitle.replace(/\s*\(@[a-zA-Z0-9_.]+\).*/, '').trim();
          }

          const rawImg = imgMatch ? decodeHtmlEntities(imgMatch[1]) : '';

          mappedData = {
            username,
            nickname: name || username,
            avatar: rawImg,
            bio: '',
            bioLink: null,
            verified: rawDesc.toLowerCase().includes('verified') || html.includes('"is_verified":true'),
            privateAccount: html.includes('"is_private":true'),
            followers: statsParsed ? parseMetricString(statsParsed[1]) : 0,
            following: statsParsed ? parseMetricString(statsParsed[2]) : 0,
            posts: statsParsed ? parseMetricString(statsParsed[3]) : 0,
            category: 'Kreator',
            profileUrl: `https://www.instagram.com/${username}`
          };
          sourceEngine = 'instagram_opengraph_mobile';
        }
      }
    } catch (_) {}
  }

  // 3. Engine 3: Fallback Public Mirror (siputzx)
  if (!mappedData) {
    try {
      const mirrorRes = await axios.get(`https://api.siputzx.my.id/api/stalk/instagram?username=${encodeURIComponent(username)}`, {
        timeout: 7000,
        validateStatus: () => true,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      });
      const cType = mirrorRes.headers['content-type'] || '';
      if (mirrorRes.status === 200 && cType.toLowerCase().includes('application/json')) {
        const body = mirrorRes.data;
        const u = body?.data || body?.result || body;
        if (u && (u.username || u.name || u.full_name)) {
          const uName = u.username || username;
          mappedData = {
            username: uName,
            nickname: u.full_name || u.name || uName,
            avatar: u.avatar || u.profile_pic_url_hd || u.photo_profile || '',
            bio: u.bio || u.biography || '',
            bioLink: u.bio_link || u.external_url || null,
            verified: Boolean(u.verified || u.is_verified),
            privateAccount: Boolean(u.is_private || u.private),
            followers: Number(u.followers || u.follower_count || 0),
            following: Number(u.following || u.following_count || 0),
            posts: Number(u.posts || u.media_count || 0),
            category: u.category || 'Kreator',
            profileUrl: `https://www.instagram.com/${uName}`
          };
          sourceEngine = 'siputzx_mirror';
        }
      }
    } catch (_) {}
  }

  if (!mappedData) {
    return {
      success: false,
      statusCode: 404,
      error: 'user_not_found',
      message: `Akun Instagram @${username} tidak ditemukan atau data publik tidak dapat diakses.`
    };
  }

  profileCache.set(cacheKey, {
    timestamp: Date.now(),
    data: mappedData
  });

  return {
    success: true,
    platform: 'instagram',
    source: sourceEngine,
    cached: false,
    data: mappedData
  };
}

export default scrapeInstagram;
