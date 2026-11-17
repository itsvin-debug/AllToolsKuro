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
  const clean = str.replace(/,/g, '').trim().toLowerCase();
  if (clean.endsWith('jt') || clean.endsWith('m')) {
    return Math.round(parseFloat(clean.replace(/(?:jt|m)$/, '')) * 1000000);
  }
  if (clean.endsWith('rb') || clean.endsWith('k')) {
    return Math.round(parseFloat(clean.replace(/(?:rb|k)$/, '')) * 1000);
  }
  if (clean.endsWith('b')) {
    return Math.round(parseFloat(clean.replace(/b$/, '')) * 1000000000);
  }
  return parseInt(clean.replace(/[^0-9]/g, ''), 10) || 0;
}

function extractInstagramStatsFromText(text) {
  if (!text) return { followers: 0, following: 0, posts: 0 };
  
  const followersMatch = text.match(/([0-9.,]+(?:\s*[KMBkmb]|rb|jt)?)\s*(?:Followers|Pengikut)/i);
  const followingMatch = text.match(/([0-9.,]+(?:\s*[KMBkmb]|rb|jt)?)\s*(?:Following|Mengikuti)/i);
  const postsMatch = text.match(/([0-9.,]+(?:\s*[KMBkmb]|rb|jt)?)\s*(?:Posts|Postingan|Kiriman)/i);

  return {
    followers: followersMatch ? parseMetricString(followersMatch[1]) : 0,
    following: followingMatch ? parseMetricString(followingMatch[1]) : 0,
    posts: postsMatch ? parseMetricString(postsMatch[1]) : 0
  };
}

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

async function fetchEngine1DirectApi(username) {
  try {
    const webRes = await axios.get(`https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`, {
      timeout: 3500,
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

      return {
        data: {
          username: u.username || username,
          nickname: u.full_name || u.username || username,
          avatar: u.profile_pic_url_hd || u.profile_pic_url || '',
          bio: u.biography || '',
          bioLink: u.external_url || null,
          verified: Boolean(u.is_verified),
          privateAccount: Boolean(u.is_private),
          followers,
          following,
          posts,
          stats: { followers, following, posts },
          recentMedia,
          category: u.category_name || 'Kreator',
          profileUrl: `https://www.instagram.com/${u.username || username}`
        },
        source: 'instagram_direct_api'
      };
    }
  } catch (err) {
    if (err.isNotFound) throw err;
  }
  throw new Error('Engine 1 Direct API did not yield valid profile data');
}

async function fetchEngineEmbed(username) {
  try {
    const res = await fetchWithTimeout(`https://www.instagram.com/${encodeURIComponent(username)}/embed/`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    }, 3500);

    const html = await res.text();
    if (res.status === 404) {
      const err = new Error(`Akun Instagram @${username} tidak ditemukan.`);
      err.isNotFound = true;
      throw err;
    }

    if (html) {
      const descMatch = html.match(/property="og:description" content="([^"]+)"/) || html.match(/content="([^"]+)" property="og:description"/);
      const imgMatch = html.match(/property="og:image" content="([^"]+)"/) || html.match(/content="([^"]+)" property="og:image"/);
      const titleMatch = html.match(/<title>([^<]+)<\/title>/);

      if (descMatch && descMatch[1]) {
        const rawDesc = decodeHtmlEntities(descMatch[1]);
        const statsExtracted = extractInstagramStatsFromText(rawDesc);
        let name = username;
        if (titleMatch && titleMatch[1]) {
          name = decodeHtmlEntities(titleMatch[1]).replace(/\s*\(@[a-zA-Z0-9_.]+\).*/, '').replace(/•.*/, '').trim();
        }

        const rawImg = imgMatch ? decodeHtmlEntities(imgMatch[1]) : '';
        return {
          data: {
            username,
            nickname: name || username,
            avatar: rawImg,
            bio: rawDesc.includes(' - ') ? rawDesc.split(' - ')[1]?.trim() || '' : '',
            bioLink: null,
            verified: rawDesc.toLowerCase().includes('verified'),
            privateAccount: false,
            followers: statsExtracted.followers,
            following: statsExtracted.following,
            posts: statsExtracted.posts,
            stats: {
              followers: statsExtracted.followers,
              following: statsExtracted.following,
              posts: statsExtracted.posts
            },
            recentMedia: [],
            category: 'Kreator',
            profileUrl: `https://www.instagram.com/${username}`
          },
          source: 'instagram_embed'
        };
      }
    }
  } catch (err) {
    if (err.isNotFound) throw err;
  }
  throw new Error('Engine Embed did not yield valid profile data');
}

async function fetchEngine2OpenGraph(username) {
  try {
    const ogRes = await axios.get(`https://www.instagram.com/${encodeURIComponent(username)}/`, {
      timeout: 3500,
      validateStatus: (status) => status < 500,
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,id;q=0.8'
      }
    });

    if (ogRes.status === 404) {
      const err = new Error(`Akun Instagram @${username} tidak ditemukan.`);
      err.isNotFound = true;
      throw err;
    }

    if (ogRes.status === 200 && ogRes.data) {
      const html = typeof ogRes.data === 'string' ? ogRes.data : '';
      const descMatch = html.match(/<meta property="og:description" content="([^"]+)"/);
      const imgMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
      const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);

      if (descMatch && descMatch[1]) {
        const rawDesc = decodeHtmlEntities(descMatch[1]);
        const statsExtracted = extractInstagramStatsFromText(rawDesc);

        let name = username;
        if (titleMatch && titleMatch[1]) {
          const rawTitle = decodeHtmlEntities(titleMatch[1]);
          name = rawTitle.replace(/\s*\(@[a-zA-Z0-9_.]+\).*/, '').trim();
        }

        let bio = '';
        const bioJsonMatch = html.match(/"biography":"([^"]+)"/) || html.match(/"bio":"([^"]+)"/);
        if (bioJsonMatch && bioJsonMatch[1]) {
          try {
            bio = JSON.parse(`"${bioJsonMatch[1]}"`);
          } catch {
            bio = bioJsonMatch[1];
          }
        }

        if (!bio && rawDesc.includes(' - ')) {
          const afterDash = rawDesc.split(' - ')[1]?.trim();
          if (afterDash && !afterDash.startsWith('See Instagram photos') && !afterDash.startsWith('Lihat foto')) {
            bio = afterDash;
          }
        }

        const rawImg = imgMatch ? decodeHtmlEntities(imgMatch[1]) : '';
        const isPrivate = html.includes('"is_private":true') || html.includes('"isPrivate":true');

        return {
          data: {
            username,
            nickname: name || username,
            avatar: rawImg,
            bio: bio || '',
            bioLink: null,
            verified: rawDesc.toLowerCase().includes('verified') || html.includes('"is_verified":true'),
            privateAccount: isPrivate,
            followers: statsExtracted.followers,
            following: statsExtracted.following,
            posts: statsExtracted.posts,
            stats: {
              followers: statsExtracted.followers,
              following: statsExtracted.following,
              posts: statsExtracted.posts
            },
            recentMedia: [],
            category: 'Kreator',
            profileUrl: `https://www.instagram.com/${username}`
          },
          source: 'instagram_opengraph_mobile'
        };
      }
    }
  } catch (err) {
    if (err.isNotFound) throw err;
  }
  throw new Error('Engine 2 OpenGraph did not yield valid profile data');
}

async function fetchEngine3Mirror(username) {
  try {
    const mirrorRes = await axios.get(`https://api.siputzx.my.id/api/stalk/instagram?username=${encodeURIComponent(username)}`, {
      timeout: 3500,
      validateStatus: () => true,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    const cType = mirrorRes.headers?.['content-type'] || '';
    if (mirrorRes.status === 200 && cType.toLowerCase().includes('application/json')) {
      const body = mirrorRes.data;
      const u = body?.data || body?.result || body;
      if (u && (u.username || u.name || u.full_name)) {
        const uName = u.username || username;
        const followers = Number(u.followers || u.follower_count || 0);
        const following = Number(u.following || u.following_count || 0);
        const posts = Number(u.posts || u.media_count || 0);

        return {
          data: {
            username: uName,
            nickname: u.full_name || u.name || uName,
            avatar: u.avatar || u.profile_pic_url_hd || u.photo_profile || '',
            bio: u.bio || u.biography || '',
            bioLink: u.bio_link || u.external_url || null,
            verified: Boolean(u.verified || u.is_verified),
            privateAccount: Boolean(u.is_private || u.private),
            followers,
            following,
            posts,
            stats: { followers, following, posts },
            recentMedia: Array.isArray(u.recentMedia || u.posts_data) ? (u.recentMedia || u.posts_data) : [],
            category: u.category || 'Kreator',
            profileUrl: `https://www.instagram.com/${uName}`
          },
          source: 'siputzx_mirror'
        };
      }
    }
  } catch (_) {}
  throw new Error('Engine 3 Mirror did not yield valid profile data');
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

  try {
    // Jalankan seluruh engine Instagram secara paralel menggunakan Promise.any (< 3.5s)
    const winner = await Promise.any([
      fetchEngine1DirectApi(username),
      fetchEngineEmbed(username),
      fetchEngine2OpenGraph(username),
      fetchEngine3Mirror(username)
    ]);
    mappedData = winner.data;
    sourceEngine = winner.source;
  } catch (err) {
    return {
      success: false,
      statusCode: 404,
      error: 'user_not_found',
      message: `Akun Instagram @${username} tidak ditemukan atau data publik tidak dapat diakses.`
    };
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
