import axios from 'axios';

const profileCache = new Map();
const CACHE_TTL_MS = 60 * 1000;

function resolveTwitterUsername(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let str = raw.trim();
  const urlMatch = str.match(/(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)/i);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1].replace(/\/.*$/, '').trim();
  }
  return str.replace(/^@+/, '').split(/[\/\?\s]/)[0].trim();
}

function formatDate(isoOrDateStr) {
  if (!isoOrDateStr) return null;
  try {
    const d = new Date(isoOrDateStr);
    if (isNaN(d.getTime())) return String(isoOrDateStr);
    return d.toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return null;
  }
}

// Helper HTTP request dengan AbortController dan batas waktu ketat
async function fetchWithTimeout(url, options = {}, timeoutMs = 3500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchFxTwitter(username) {
  const res = await fetchWithTimeout(`https://api.fxtwitter.com/${encodeURIComponent(username)}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'application/json'
    }
  }, 3500);

  if (res.status === 404) {
    const notFoundErr = new Error('user_not_found');
    notFoundErr.statusCode = 404;
    throw notFoundErr;
  }

  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { throw new Error('FxTwitter non-json'); }

  if (json?.code === 404) {
    const notFoundErr = new Error('user_not_found');
    notFoundErr.statusCode = 404;
    throw notFoundErr;
  }

  if (json?.user) {
    const u = json.user;
    const avatarRaw = u.avatar_url || '';
    const avatarHd = avatarRaw.replace(/_normal(\.[a-zA-Z0-9]+)$/, '_400x400$1');
    const isVerified = Boolean(u.verification?.verified || u.verified);

    return {
      source: 'fxtwitter_api',
      data: {
        username: u.screen_name || username,
        nickname: u.name || username,
        avatar: avatarHd,
        banner: u.banner_url || '',
        bio: u.description || '',
        verified: isVerified,
        privateAccount: Boolean(u.protected),
        followers: Number(u.followers ?? u.followers_count ?? 0),
        following: Number(u.following ?? u.following_count ?? 0),
        tweets: Number(u.tweets ?? u.tweets_count ?? 0),
        likes: Number(u.likes ?? u.likes_count ?? 0),
        mediaCount: Number(u.media_count || 0),
        location: u.location || '',
        createTime: formatDate(u.joined),
        profileUrl: `https://x.com/${u.screen_name || username}`
      }
    };
  }
  throw new Error('FxTwitter empty');
}

async function fetchVxTwitter(username) {
  const res = await fetchWithTimeout(`https://api.vxtwitter.com/${encodeURIComponent(username)}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json'
    }
  }, 3500);

  if (res.status === 404) {
    const notFoundErr = new Error('user_not_found');
    notFoundErr.statusCode = 404;
    throw notFoundErr;
  }

  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { throw new Error('VxTwitter non-json'); }

  if (json?.user_screen_name || json?.user_name) {
    const u = json;
    const avatarRaw = u.user_profile_image_url || '';
    const avatarHd = avatarRaw.replace(/_normal(\.[a-zA-Z0-9]+)$/, '_400x400$1');

    return {
      source: 'vxtwitter_api',
      data: {
        username: u.user_screen_name || username,
        nickname: u.user_name || u.user_screen_name || username,
        avatar: avatarHd,
        banner: '',
        bio: u.user_description || '',
        verified: Boolean(u.user_verified),
        privateAccount: false,
        followers: Number(u.user_followers_count || 0),
        following: Number(u.user_following_count || 0),
        tweets: Number(u.user_statuses_count || 0),
        likes: Number(u.user_favourites_count || 0),
        mediaCount: 0,
        location: '',
        createTime: null,
        profileUrl: `https://x.com/${u.user_screen_name || username}`
      }
    };
  }
  throw new Error('VxTwitter empty');
}

async function fetchSyndication(username) {
  const res = await fetchWithTimeout(`https://cdn.syndication.twimg.com/widgets/followbutton/info.json?screen_names=${encodeURIComponent(username)}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json'
    }
  }, 3500);

  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { throw new Error('Syndication non-json'); }

  if (Array.isArray(json) && json.length > 0) {
    const u = json[0];
    return {
      source: 'syndication_api',
      data: {
        username: u.screen_name || username,
        nickname: u.name || u.screen_name || username,
        avatar: (u.profile_image_url_https || '').replace(/_normal\./, '_400x400.'),
        banner: '',
        bio: '',
        verified: Boolean(u.verified),
        privateAccount: Boolean(u.protected),
        followers: Number(u.followers_count || 0),
        following: 0,
        tweets: Number(u.statuses_count || 0),
        likes: 0,
        mediaCount: 0,
        location: '',
        createTime: null,
        profileUrl: `https://x.com/${u.screen_name || username}`
      }
    };
  }
  throw new Error('Syndication empty');
}

export async function scrapeTwitter(rawInput, options = {}) {
  const forceRefresh = Boolean(options.forceRefresh || options.refresh);
  const username = resolveTwitterUsername(rawInput);

  if (!username) {
    return {
      success: false,
      statusCode: 400,
      error: 'invalid_username',
      message: 'Username atau tautan X (Twitter) tidak valid.'
    };
  }

  const cacheKey = username.toLowerCase();
  const cached = profileCache.get(cacheKey);
  if (!forceRefresh && cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    return {
      success: true,
      platform: 'twitter',
      source: 'memory_cache',
      cached: true,
      data: cached.data
    };
  }

  let mappedData = null;
  let sourceEngine = 'fxtwitter';

  try {
    const winner = await Promise.any([
      fetchFxTwitter(username),
      fetchVxTwitter(username),
      fetchSyndication(username)
    ]);
    mappedData = winner.data;
    sourceEngine = winner.source;
  } catch (err) {
    if (err.message === 'user_not_found') {
      return {
        success: false,
        statusCode: 404,
        error: 'user_not_found',
        message: `Akun X @${username} tidak ditemukan atau telah ditangguhkan.`
      };
    }
  }

  // Fallback Mirror (siputzx) jika semua engine publik gagal
  if (!mappedData) {
    try {
      const mirrorRes = await fetchWithTimeout(`https://api.siputzx.my.id/api/stalk/twitter?username=${encodeURIComponent(username)}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      }, 3500);
      const text = await mirrorRes.text();
      let body = null;
      try { body = JSON.parse(text); } catch {}
      const u = body?.data || body?.result || body;
      if (u && (u.username || u.screen_name || u.name)) {
        const sName = u.screen_name || u.username || username;
        mappedData = {
          username: sName,
          nickname: u.name || sName,
          avatar: (u.avatar || u.profile_image_url_https || '').replace(/_normal\./, '_400x400.'),
          banner: u.banner || u.profile_banner_url || '',
          bio: u.bio || u.description || '',
          verified: Boolean(u.verified),
          privateAccount: Boolean(u.protected || u.is_private),
          followers: Number(u.followers || u.followers_count || 0),
          following: Number(u.following || u.following_count || 0),
          tweets: Number(u.tweets || u.statuses_count || 0),
          likes: Number(u.likes || u.favourites_count || 0),
          mediaCount: Number(u.media_count || 0),
          location: u.location || '',
          createTime: formatDate(u.created_at || u.joined),
          profileUrl: `https://x.com/${sName}`
        };
        sourceEngine = 'siputzx_mirror';
      }
    } catch (_) {}
  }

  if (!mappedData) {
    return {
      success: false,
      statusCode: 404,
      error: 'user_not_found',
      message: `Akun X @${username} tidak ditemukan atau data publik tidak tersedia.`
    };
  }

  profileCache.set(cacheKey, {
    timestamp: Date.now(),
    data: mappedData
  });

  return {
    success: true,
    platform: 'twitter',
    source: sourceEngine,
    cached: false,
    data: mappedData
  };
}

export default scrapeTwitter;
