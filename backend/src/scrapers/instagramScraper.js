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

// Jalur 1: Instagram Embed Captioned & Profile JSON Extractor
async function fetchEngineEmbedProfile(username) {
  const urls = [
    `https://www.instagram.com/${encodeURIComponent(username)}/embed/captioned/`,
    `https://www.instagram.com/${encodeURIComponent(username)}/embed/`
  ];

  for (const url of urls) {
    try {
      const res = await axios.get(url, {
        timeout: 3000,
        validateStatus: (s) => s < 500,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8'
        }
      });

      if (res.status === 404) continue;
      const html = typeof res.data === 'string' ? res.data : '';
      if (!html) continue;

      let fullName = '';
      let avatar = '';
      let bio = '';
      let followers = 0;
      let following = 0;
      let posts = 0;
      let isPrivate = html.includes('"is_private":true') || html.includes('This Account is Private') || html.includes('Akun Ini Privat');

      // 1. Ekstraksi JSON terstruktur dari script
      const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
      for (const s of scripts) {
        if (!fullName) {
          const fnMatch = s.match(/"full_name":"([^"]+)"/);
          if (fnMatch) {
            try { fullName = JSON.parse(`"${fnMatch[1]}"`); } catch { fullName = fnMatch[1]; }
          }
        }
        if (!avatar) {
          const avMatch = s.match(/"profile_pic_url_hd":"([^"]+)"/) || s.match(/"profile_pic_url":"([^"]+)"/);
          if (avMatch) {
            avatar = avMatch[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/').replace(/&amp;/g, '&');
          }
        }
        if (!bio) {
          const bioMatch = s.match(/"biography":"([^"]+)"/);
          if (bioMatch) {
            try { bio = JSON.parse(`"${bioMatch[1]}"`); } catch { bio = bioMatch[1]; }
          }
        }
        if (!followers) {
          const fMatch = s.match(/"edge_followed_by":\s*\{\s*"count":\s*(\d+)/) || s.match(/"follower_count":\s*(\d+)/);
          if (fMatch) followers = Number(fMatch[1]);
        }
        if (!following) {
          const foMatch = s.match(/"edge_follow":\s*\{\s*"count":\s*(\d+)/) || s.match(/"following_count":\s*(\d+)/);
          if (foMatch) following = Number(foMatch[1]);
        }
        if (!posts) {
          const pMatch = s.match(/"edge_owner_to_timeline_media":\s*\{\s*"count":\s*(\d+)/) || s.match(/"media_count":\s*(\d+)/);
          if (pMatch) posts = Number(pMatch[1]);
        }
      }

      // 2. Ekstraksi meta tag jika script belum lengkap
      if (!avatar) {
        const ogImg = html.match(/property="og:image" content="([^"]+)"/) || html.match(/content="([^"]+)" property="og:image"/);
        if (ogImg) avatar = decodeHtmlEntities(ogImg[1]).replace(/&amp;/g, '&');
      }
      if (!fullName) {
        const ogTitle = html.match(/property="og:title" content="([^"]+)"/) || html.match(/content="([^"]+)" property="og:title"/);
        if (ogTitle) {
          fullName = decodeHtmlEntities(ogTitle[1]).replace(/\s*\(@[a-zA-Z0-9_.]+\).*/, '').replace(/•.*/, '').replace(/&amp;/g, '&').trim();
        }
      }

      const extracted = {
        username,
        fullName: fullName || username,
        nickname: fullName || username,
        avatar: (avatar || '').replace(/&amp;/g, '&'),
        bio,
        bioLink: null,
        isPrivate,
        privateAccount: isPrivate,
        isVerified: html.includes('"is_verified":true'),
        verified: html.includes('"is_verified":true'),
        followers,
        following,
        posts,
        stats: { followers, following, posts },
        recentMedia: [],
        category: 'Kreator',
        profileUrl: `https://www.instagram.com/${username}`
      };

      if (isValidInstagramData(extracted)) {
        return { source: 'instagram_embed', data: extracted };
      }
    } catch (_) {}
  }

  throw new Error('Jalur Embed did not yield valid profile data');
}

// Jalur 2: Social Link-Preview Meta Parser (Multi-Crawler User-Agent)
async function fetchEngineCrawlerOpenGraph(username) {
  const crawlers = [
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    'WhatsApp/2.23.20.0'
  ];

  for (const ua of crawlers) {
    try {
      const res = await axios.get(`https://www.instagram.com/${encodeURIComponent(username)}/`, {
        timeout: 3000,
        validateStatus: (status) => status < 500,
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
      const descMatch = html.match(/property="og:description" content="([^"]+)"/) || 
                        html.match(/content="([^"]+)" property="og:description"/) ||
                        html.match(/name="description" content="([^"]+)"/) ||
                        html.match(/content="([^"]+)" name="description"/);
      const titleMatch = html.match(/property="og:title" content="([^"]+)"/) || html.match(/content="([^"]+)" property="og:title"/);
      const imgMatch = html.match(/property="og:image" content="([^"]+)"/) || html.match(/content="([^"]+)" property="og:image"/);

      if (descMatch && descMatch[1]) {
        const rawDesc = decodeHtmlEntities(descMatch[1]);
        const statsExtracted = extractInstagramStatsFromText(rawDesc);
        const rawTitle = titleMatch ? decodeHtmlEntities(titleMatch[1]) : '';
        const nameExtracted = rawTitle ? rawTitle.replace(/\s*\(@[a-zA-Z0-9_.]+\).*/, '').replace(/•.*/, '').replace(/&amp;/g, '&').trim() : username;
        const isPrivate = html.includes('"is_private":true') || html.includes('"isPrivate":true');
        const rawImg = imgMatch ? decodeHtmlEntities(imgMatch[1]).replace(/&amp;/g, '&') : '';

        let bio = '';
        const bioMetaMatch = html.match(/name="description" content="[^"]*on Instagram: &quot;([^&"]+)&quot;"/) ||
                             html.match(/content="[^"]*on Instagram: &quot;([^&"]+)&quot;" name="description"/);
        if (bioMetaMatch && bioMetaMatch[1]) {
          bio = decodeHtmlEntities(bioMetaMatch[1]);
        }
        if (!bio) {
          const bioJsonMatch = html.match(/"biography":"([^"]+)"/) || html.match(/"bio":"([^"]+)"/);
          if (bioJsonMatch && bioJsonMatch[1]) {
            try {
              bio = JSON.parse(`"${bioJsonMatch[1]}"`);
            } catch {
              bio = bioJsonMatch[1];
            }
          }
        }
        if (!bio && rawDesc.includes(' - ')) {
          const afterDash = rawDesc.split(' - ')[1]?.trim();
          if (afterDash && !afterDash.startsWith('See Instagram photos') && !afterDash.startsWith('Lihat foto')) {
            bio = afterDash;
          }
        }

        const extracted = {
          username,
          fullName: nameExtracted || username,
          nickname: nameExtracted || username,
          avatar: rawImg,
          bio: bio || '',
          bioLink: null,
          isPrivate,
          privateAccount: isPrivate,
          isVerified: rawDesc.toLowerCase().includes('verified') || html.includes('"is_verified":true'),
          verified: rawDesc.toLowerCase().includes('verified') || html.includes('"is_verified":true'),
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
        };

        if (isValidInstagramData(extracted)) {
          return {
            source: 'crawler_link_preview',
            data: extracted
          };
        }
      }
    } catch (e) {
      if (e.isNotFound) throw e;
    }
  }

  throw new Error('Jalur Crawler did not yield valid profile data');
}

// Jalur 3: Google Edge Relay (Bypass blokir IP Datacenter/AWS Vercel)
async function fetchEngineGoogleRelay(username) {
  try {
    const target = `https://www.instagram.com/${encodeURIComponent(username)}/`;
    const gtUrl = `https://translate.google.com/translate?sl=auto&tl=en&u=${encodeURIComponent(target)}`;
    const res = await axios.get(gtUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Cookie': 'CONSENT=YES+; SOCS=CAISHAgBEhJnd3NfMjAyMzA4MTAtMF9SQzEaAmVuIAEaBgiA_LmnBg'
      },
      timeout: 3000,
      validateStatus: (s) => s < 500
    });

    const html = typeof res.data === 'string' ? res.data : '';
    if (!html || res.status === 404) {
      throw new Error(`Google Relay empty or status ${res.status}`);
    }

    const descMatch = html.match(/property="og:description" content="([^"]+)"/) || 
                      html.match(/content="([^"]+)" property="og:description"/) ||
                      html.match(/name="description" content="([^"]+)"/) ||
                      html.match(/content="([^"]+)" name="description"/);
    const titleMatch = html.match(/property="og:title" content="([^"]+)"/) || html.match(/content="([^"]+)" property="og:title"/);
    const imgMatch = html.match(/property="og:image" content="([^"]+)"/) || html.match(/content="([^"]+)" property="og:image"/);

    if (descMatch && descMatch[1]) {
      const rawDesc = decodeHtmlEntities(descMatch[1]);
      const statsExtracted = extractInstagramStatsFromText(rawDesc);
      const rawTitle = titleMatch ? decodeHtmlEntities(titleMatch[1]) : '';
      const nameExtracted = rawTitle ? rawTitle.replace(/\s*\(@[a-zA-Z0-9_.]+\).*/, '').replace(/•.*/, '').trim() : username;
      const isPrivate = html.includes('"is_private":true') || html.includes('"isPrivate":true') || !html.includes('"edge_owner_to_timeline_media"');
      const rawImg = imgMatch ? decodeHtmlEntities(imgMatch[1]) : '';

      let bio = '';
      const bioMetaMatch = html.match(/name="description" content="[^"]*on Instagram: &quot;([^&"]+)&quot;"/) ||
                           html.match(/content="[^"]*on Instagram: &quot;([^&"]+)&quot;" name="description"/);
      if (bioMetaMatch && bioMetaMatch[1]) {
        bio = decodeHtmlEntities(bioMetaMatch[1]);
      }
      if (!bio) {
        const bioJsonMatch = html.match(/"biography":"([^"]+)"/) || html.match(/"bio":"([^"]+)"/);
        if (bioJsonMatch && bioJsonMatch[1]) {
          try {
            bio = JSON.parse(`"${bioJsonMatch[1]}"`);
          } catch {
            bio = bioJsonMatch[1];
          }
        }
      }
      if (!bio && rawDesc.includes(' - ')) {
        const afterDash = rawDesc.split(' - ')[1]?.trim();
        if (afterDash && !afterDash.startsWith('See Instagram photos') && !afterDash.startsWith('Lihat foto')) {
          bio = afterDash;
        }
      }

      const extracted = {
        username,
        fullName: nameExtracted || username,
        nickname: nameExtracted || username,
        avatar: rawImg,
        bio: bio || '',
        bioLink: null,
        isPrivate,
        privateAccount: isPrivate,
        isVerified: rawDesc.toLowerCase().includes('verified') || html.includes('"is_verified":true'),
        verified: rawDesc.toLowerCase().includes('verified') || html.includes('"is_verified":true'),
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
      };

      if (isValidInstagramData(extracted)) {
        return {
          source: 'google_edge_relay',
          data: extracted
        };
      } else {
        throw new Error(`Google Relay extracted invalid: name=${extracted.fullName} av=${Boolean(extracted.avatar)} bio=${extracted.bio} stat=${extracted.followers}`);
      }
    } else {
      throw new Error(`Google Relay no descMatch: status=${res.status} len=${html.length} hasTitle=${Boolean(titleMatch)}`);
    }
  } catch (err) {
    throw new Error(`Google Relay error: ${err.message}`);
  }
}

// Fallback Direct Web Profile API
async function fetchEngineWebProfileApi(username) {
  try {
    const webRes = await axios.get(`https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`, {
      timeout: 3000,
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
        return {
          source: 'instagram_direct_api',
          data: extracted
        };
      }
    }
  } catch (err) {
    if (err.isNotFound) throw err;
  }
  throw new Error('Jalur Web Profile API did not yield valid profile data');
}

// Jalur 4: Edge Markdown / Reader API (r.jina.ai)
async function fetchEngineJinaReader(username) {
  try {
    const res = await axios.get(`https://r.jina.ai/https://www.instagram.com/${encodeURIComponent(username)}/`, {
      timeout: 3000,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      },
      validateStatus: (s) => s < 500
    });

    const data = res.data?.data || res.data || {};
    const title = data.title || '';
    const desc = data.description || '';
    const content = data.content || '';
    const combined = `${title} ${desc} ${content}`;

    if (combined.includes('Log into Instagram') && !combined.includes('Followers') && !combined.includes('Pengikut')) {
      throw new Error('Jina returned login redirect');
    }

    const stats = extractInstagramStatsFromText(combined);
    let fullName = '';
    if (title) {
      const tMatch = title.match(/([^\(@•]+)(?:\s*\(@|\s*•)/);
      if (tMatch && tMatch[1]) fullName = tMatch[1].trim();
    }

    const isPrivate = combined.includes('This Account is Private') || combined.includes('Akun Ini Privat');

    let bio = '';
    const bioMatch = content.match(/(?:Bio|Description|Biography):\s*([^\n]+)/i) || 
                     desc.match(/on Instagram:\s*"([^"]+)"/i);
    if (bioMatch && bioMatch[1]) bio = bioMatch[1].trim();

    const extracted = {
      username,
      fullName: fullName || username,
      nickname: fullName || username,
      avatar: '',
      bio,
      bioLink: null,
      isPrivate,
      privateAccount: isPrivate,
      isVerified: combined.includes('Verified') || combined.includes('Terverifikasi'),
      verified: combined.includes('Verified') || combined.includes('Terverifikasi'),
      followers: stats.followers,
      following: stats.following,
      posts: stats.posts,
      stats,
      recentMedia: [],
      category: 'Kreator',
      profileUrl: `https://www.instagram.com/${username}`
    };

    if (isValidInstagramData(extracted)) {
      return {
        source: 'jina_edge_reader',
        data: extracted
      };
    }
  } catch (err) {}
  throw new Error('Jalur Jina Edge Reader did not yield valid profile data');
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

  // Eksekusi paralel seluruh mesin scraper dengan timeout ketat 3 detik per request
  const [resCrawler, resEmbed, resRelay, resJina, resWebApi] = await Promise.allSettled([
    fetchEngineCrawlerOpenGraph(username),
    fetchEngineEmbedProfile(username),
    fetchEngineGoogleRelay(username),
    fetchEngineJinaReader(username),
    fetchEngineWebProfileApi(username)
  ]);

  const dataCrawler = resCrawler.status === 'fulfilled' ? resCrawler.value?.data : null;
  const dataEmbed = resEmbed.status === 'fulfilled' ? resEmbed.value?.data : null;
  const dataRelay = resRelay.status === 'fulfilled' ? resRelay.value?.data : null;
  const dataJina = resJina.status === 'fulfilled' ? resJina.value?.data : null;
  const dataWebApi = resWebApi.status === 'fulfilled' ? resWebApi.value?.data : null;

  // Deep merge seluruh hasil metadata parsial yang berhasil
  let mergedData = deepMergeInstagramData(dataCrawler || dataRelay, dataEmbed);
  mergedData = deepMergeInstagramData(mergedData, dataWebApi);
  mergedData = deepMergeInstagramData(mergedData, dataJina);

  // JANGAN PERNAH kembalikan objek palsu serba 0 jika tidak ada bukti data nyata
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
    ? (dataEmbed ? 'native_hybrid_merged' : 'crawler_link_preview')
    : (dataEmbed ? 'instagram_embed' : (dataRelay ? 'google_edge_relay' : (dataJina ? 'jina_edge_reader' : 'instagram_direct_api')));

  return {
    success: true,
    platform: 'instagram',
    source: finalSource,
    cached: false,
    data: mergedData
  };
}

export default scrapeInstagram;
