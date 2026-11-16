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

  // 1. Engine 1: FxTwitter & VxTwitter Public API
  try {
    const fxRes = await axios.get(`https://api.fxtwitter.com/${encodeURIComponent(username)}`, {
      timeout: 7000,
      validateStatus: (status) => status < 500,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      }
    });

    if (fxRes.status === 404 || fxRes.data?.code === 404) {
      return {
        success: false,
        statusCode: 404,
        error: 'user_not_found',
        message: `Akun X @${username} tidak ditemukan atau telah ditangguhkan.`
      };
    }

    if (fxRes.status === 200 && fxRes.data?.user) {
      const u = fxRes.data.user;
      const avatarRaw = u.avatar_url || '';
      const avatarHd = avatarRaw.replace(/_normal(\.[a-zA-Z0-9]+)$/, '_400x400$1');

      const isVerified = Boolean(u.verification?.verified || u.verified);

      mappedData = {
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
      };
      sourceEngine = 'fxtwitter_api';
    }
  } catch (err) {
    if (err.response?.status === 404) {
      return {
        success: false,
        statusCode: 404,
        error: 'user_not_found',
        message: `Akun X @${username} tidak ditemukan atau telah ditangguhkan.`
      };
    }
  }

  // 1b. Engine 1b: Fallback ke VxTwitter jika FxTwitter timeout
  if (!mappedData) {
    try {
      const vxRes = await axios.get(`https://api.vxtwitter.com/${encodeURIComponent(username)}`, {
        timeout: 6000,
        validateStatus: (status) => status < 500,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      });
      if (vxRes.status === 200 && vxRes.data?.user_screen_name) {
        const u = vxRes.data;
        const avatarRaw = u.user_profile_image_url || '';
        const avatarHd = avatarRaw.replace(/_normal(\.[a-zA-Z0-9]+)$/, '_400x400$1');

        mappedData = {
          username: u.user_screen_name,
          nickname: u.user_name || u.user_screen_name,
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
          profileUrl: `https://x.com/${u.user_screen_name}`
        };
        sourceEngine = 'vxtwitter_api';
      }
    } catch (_) {}
  }

  // 1c. Engine 1c: Syndication Followbutton JSON
  if (!mappedData) {
    try {
      const synRes = await axios.get(`https://cdn.syndication.twimg.com/widgets/followbutton/info.json?screen_names=${encodeURIComponent(username)}`, {
        timeout: 5000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      });
      if (Array.isArray(synRes.data) && synRes.data.length > 0) {
        const u = synRes.data[0];
        mappedData = {
          username: u.screen_name,
          nickname: u.name || u.screen_name,
          avatar: (u.profile_image_url_https || '').replace(/_normal\./, '_400x400.'),
          banner: '',
          bio: '',
          verified: Boolean(u.verified),
          privateAccount: Boolean(u.protected),
          followers: Number(u.followers_count || 0),
          following: 0,
          tweets: 0,
          likes: 0,
          mediaCount: 0,
          location: '',
          createTime: null,
          profileUrl: `https://x.com/${u.screen_name}`
        };
        sourceEngine = 'twitter_syndication';
      }
    } catch (_) {}
  }

  // 2. Engine 2: Fallback Mirror (siputzx) jika semua engine publik gagal
  if (!mappedData) {
    try {
      const mirrorRes = await axios.get(`https://api.siputzx.my.id/api/stalk/twitter?username=${encodeURIComponent(username)}`, {
        timeout: 7000,
        validateStatus: () => true,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      });
      const cType = mirrorRes.headers['content-type'] || '';
      if (mirrorRes.status === 200 && cType.toLowerCase().includes('application/json')) {
        const body = mirrorRes.data;
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
