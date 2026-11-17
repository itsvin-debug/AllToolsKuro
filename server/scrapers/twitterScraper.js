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
  return str.replace(/^@+\s*/, '').split(/[\/\?\s]/)[0].trim();
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

async function fetchWithTimeout(url, options = {}, timeoutMs = 4000) {
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

// Engine 1: FxTwitter Official Public API
async function fetchFxTwitter(username) {
  const res = await fetchWithTimeout(`https://api.fxtwitter.com/${encodeURIComponent(username)}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'application/json'
    }
  }, 4000);

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
        stats: {
          followers: Number(u.followers ?? u.followers_count ?? 0),
          following: Number(u.following ?? u.following_count ?? 0),
          tweets: Number(u.tweets ?? u.tweets_count ?? 0),
          likes: Number(u.likes ?? u.likes_count ?? 0)
        },
        mediaCount: Number(u.media_count || 0),
        location: u.location || '',
        createTime: formatDate(u.joined),
        profileUrl: `https://x.com/${u.screen_name || username}`
      }
    };
  }
  throw new Error('FxTwitter empty');
}

// Engine 2: VxTwitter API (Mendukung screen_name dan nama profil murni)
async function fetchVxTwitter(username) {
  const res = await fetchWithTimeout(`https://api.vxtwitter.com/${encodeURIComponent(username)}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json'
    }
  }, 4000);

  if (res.status === 404) {
    const notFoundErr = new Error('user_not_found');
    notFoundErr.statusCode = 404;
    throw notFoundErr;
  }

  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { throw new Error('VxTwitter non-json'); }

  if (json?.screen_name || json?.user_screen_name || json?.name || json?.user_name) {
    const u = json;
    const usernameClean = u.screen_name || u.user_screen_name || username;
    const nameClean = u.name || u.user_name || usernameClean;
    const avatarRaw = u.profile_image_url || u.user_profile_image_url || '';
    const avatarHd = avatarRaw.replace(/_normal(\.[a-zA-Z0-9]+)$/, '_400x400$1');

    return {
      source: 'vxtwitter_api',
      data: {
        username: usernameClean,
        nickname: nameClean,
        avatar: avatarHd,
        banner: u.banner_url || u.user_banner_url || '',
        bio: u.description || u.user_description || '',
        verified: Boolean(u.verified || u.user_verified),
        privateAccount: Boolean(u.protected),
        followers: Number(u.followers_count ?? u.user_followers_count ?? 0),
        following: Number(u.following_count ?? u.user_following_count ?? 0),
        tweets: Number(u.tweet_count ?? u.user_statuses_count ?? 0),
        likes: Number(u.favourites_count ?? u.user_favourites_count ?? 0),
        stats: {
          followers: Number(u.followers_count ?? u.user_followers_count ?? 0),
          following: Number(u.following_count ?? u.user_following_count ?? 0),
          tweets: Number(u.tweet_count ?? u.user_statuses_count ?? 0),
          likes: Number(u.favourites_count ?? u.user_favourites_count ?? 0)
        },
        mediaCount: Number(u.media_count || 0),
        location: u.location || '',
        createTime: formatDate(u.created_at),
        profileUrl: `https://x.com/${usernameClean}`
      }
    };
  }
  throw new Error('VxTwitter empty');
}

// Engine 3: Twitter Official Syndication Profile Endpoint
async function fetchSyndicationProfile(username) {
  try {
    const res = await fetchWithTimeout(`https://syndication.twitter.com/srv/timeline-profile/screen-name/${encodeURIComponent(username)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    }, 4000);

    const html = await res.text();
    const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (match && match[1]) {
      const nextData = JSON.parse(match[1]);
      const user = nextData?.props?.pageProps?.timeline?.entries?.[0]?.content?.tweet?.user 
                || nextData?.props?.pageProps?.headerProps?.user;
      if (user) {
        return {
          source: 'twitter_syndication',
          data: {
            username: user.screen_name || username,
            nickname: user.name || user.screen_name || username,
            avatar: (user.profile_image_url_https || '').replace(/_normal\./, '_400x400.'),
            banner: '',
            bio: user.description || '',
            verified: Boolean(user.verified || user.is_blue_verified),
            privateAccount: Boolean(user.protected),
            followers: Number(user.followers_count ?? user.normal_followers_count ?? 0),
            following: Number(user.friends_count ?? 0),
            tweets: Number(user.statuses_count ?? 0),
            likes: Number(user.favourites_count ?? 0),
            stats: {
              followers: Number(user.followers_count ?? user.normal_followers_count ?? 0),
              following: Number(user.friends_count ?? 0),
              tweets: Number(user.statuses_count ?? 0),
              likes: Number(user.favourites_count ?? 0)
            },
            mediaCount: Number(user.media_count ?? 0),
            location: user.location || '',
            createTime: formatDate(user.created_at),
            profileUrl: `https://x.com/${user.screen_name || username}`
          }
        };
      }
    }
  } catch (_) {}

  // Fallback ke widget follow button info
  try {
    const res = await fetchWithTimeout(`https://cdn.syndication.twimg.com/widgets/followbutton/info.json?screen_names=${encodeURIComponent(username)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    }, 3000);
    const json = await res.json();
    if (Array.isArray(json) && json.length > 0) {
      const u = json[0];
      const fCount = Number(u.followers_count || 0);
      const sCount = Number(u.statuses_count || 0);
      return {
        source: 'twimg_widget',
        data: {
          username: u.screen_name || username,
          nickname: u.name || u.screen_name || username,
          avatar: (u.profile_image_url_https || '').replace(/_normal\./, '_400x400.'),
          banner: '',
          bio: '',
          verified: Boolean(u.verified),
          privateAccount: Boolean(u.protected),
          followers: fCount,
          following: 0,
          tweets: sCount,
          likes: 0,
          stats: {
            followers: fCount,
            following: 0,
            tweets: sCount,
            likes: 0
          },
          mediaCount: 0,
          location: '',
          createTime: null,
          profileUrl: `https://x.com/${u.screen_name || username}`
        }
      };
    }
  } catch (_) {}

  throw new Error('Syndication profile empty');
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
  let sourceEngine = 'fxtwitter_api';

  try {
    const winner = await Promise.any([
      fetchFxTwitter(username),
      fetchVxTwitter(username),
      fetchSyndicationProfile(username)
    ]);
    mappedData = winner.data;
    sourceEngine = winner.source;
  } catch (err) {
    return {
      success: false,
      statusCode: 404,
      error: 'user_not_found',
      message: `Akun X (Twitter) @${username} tidak ditemukan atau data publik tidak dapat diakses.`
    };
  }

  if (!mappedData || !mappedData.username) {
    return {
      success: false,
      statusCode: 404,
      error: 'user_not_found',
      message: `Akun X (Twitter) @${username} tidak ditemukan atau data publik tidak dapat diakses.`
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
