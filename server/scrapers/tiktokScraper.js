import axios from 'axios';

// In-Memory Cache (TTL 60 detik) untuk proteksi anti-rate-limit
const profileCache = new Map();
const CACHE_TTL_MS = 60 * 1000;

const USER_AGENTS = [
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'
];

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

// Pengurai cerdas tautan & shortlink TikTok (vt/vm) menjadi username murni
export async function resolveTiktokUsername(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') return '';
  let input = rawInput.trim();

  // Resolusi shortlink vt.tiktok.com atau vm.tiktok.com
  if (input.includes('vt.tiktok.com') || input.includes('vm.tiktok.com')) {
    try {
      const fullUrl = input.startsWith('http') ? input : `https://${input}`;
      const res = await axios.get(fullUrl, {
        maxRedirects: 5,
        timeout: 8000,
        headers: { 'User-Agent': USER_AGENTS[0] }
      });
      const resolved = res.request?.res?.responseUrl || res.config?.url;
      if (resolved) {
        input = resolved;
      }
    } catch (err) {
      if (err.response?.headers?.location) {
        input = err.response.headers.location;
      }
    }
  }

  return extractCleanHandle(input);
}

// Konversi timestamp UNIX ke teks tanggal terbaca
function formatUnixTimestamp(unix) {
  if (!unix || isNaN(unix)) return null;
  try {
    const d = new Date(Number(unix) * 1000);
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

// Layer 1: Node.js Direct Hydration Extractor
async function extractLayer1Hydration(username) {
  const profileUrl = `https://www.tiktok.com/@${username}`;
  try {
    const res = await axios.get(profileUrl, {
      timeout: 3000,
      validateStatus: (status) => status < 500,
      headers: {
        'User-Agent': USER_AGENTS[0],
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Upgrade-Insecure-Requests': '1'
      }
    });

    if (res.status === 404) {
      return { notFound: true };
    }

    if (res.status !== 200) {
      throw new Error(`Layer 1 received non-200 HTTP status: ${res.status}`);
    }

    const html = typeof res.data === 'string' ? res.data : '';

    // 1. Ekstraksi __UNIVERSAL_DATA_FOR_REHYDRATION__
    const match = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
    if (match && match[1]) {
      try {
        const parsed = JSON.parse(match[1]);
        const defaultScope = parsed['__DEFAULT_SCOPE__'] || {};
        const userDetail = defaultScope['webapp.user-detail'] || {};

        if (userDetail.statusCode === 10202 || userDetail.statusCode === 10221) {
          return { notFound: true };
        }

        const userInfo = userDetail.userInfo;
        if (userInfo && userInfo.user && (userInfo.user.uniqueId || userInfo.user.nickname)) {
          return {
            source: 'layer1_rehydration',
            user: userInfo.user,
            stats: userInfo.stats || {},
            statsV2: userInfo.statsV2 || {}
          };
        }
      } catch (_) {}
    }

    // 2. Fallback SIGI_STATE
    const sigiMatch = html.match(/<script id="SIGI_STATE"[^>]*>([\s\S]*?)<\/script>/);
    if (sigiMatch && sigiMatch[1]) {
      try {
        const sigiJson = JSON.parse(sigiMatch[1]);
        const usersMap = sigiJson.UserModule?.users || {};
        const statsMap = sigiJson.UserModule?.stats || {};
        const user = usersMap[username] || Object.values(usersMap)[0];
        const stats = statsMap[username] || Object.values(statsMap)[0];
        if (user && (user.uniqueId || user.nickname)) {
          return {
            source: 'layer1_sigi_state',
            user,
            stats: stats || {},
            statsV2: {}
          };
        }
      } catch (_) {}
    }
  } catch (err) {
    if (err.response?.status === 404) {
      return { notFound: true };
    }
    throw new Error(`Layer 1 failed: ${err.message}`);
  }

  throw new Error('Layer 1 did not find valid TikTok user data in HTML');
}

// Layer 2: Crawler Bot OpenGraph Extractor (Bypass SlardarWAF)
async function extractLayerCrawlerOpenGraph(username) {
  const profileUrl = `https://www.tiktok.com/@${username}`;
  const crawlers = [
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    'WhatsApp/2.23.20.0'
  ];

  for (const ua of crawlers) {
    try {
      const res = await axios.get(profileUrl, {
        timeout: 3000,
        validateStatus: (status) => status < 500,
        headers: {
          'User-Agent': ua,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8'
        }
      });

      if (res.status === 404) return { notFound: true };
      const html = typeof res.data === 'string' ? res.data : '';
      if (!html || html.length < 300) continue;

      const titleMatch = html.match(/property="og:title" content="([^"]+)"/) || 
                         html.match(/content="([^"]+)" property="og:title"/) ||
                         html.match(/property="twitter:title" content="([^"]+)"/) || 
                         html.match(/name="twitter:title" content="([^"]+)"/) ||
                         html.match(/content="([^"]+)" property="twitter:title"/);

      const descMatch = html.match(/property="og:description" content="([^"]+)"/) || 
                        html.match(/content="([^"]+)" property="og:description"/) ||
                        html.match(/property="twitter:description" content="([^"]+)"/) || 
                        html.match(/name="twitter:description" content="([^"]+)"/) ||
                        html.match(/content="([^"]+)" property="twitter:description"/);

      const imgMatch = html.match(/property="og:image" content="([^"]+)"/) || 
                       html.match(/content="([^"]+)" property="og:image"/) ||
                       html.match(/property="twitter:image" content="([^"]+)"/) || 
                       html.match(/name="twitter:image" content="([^"]+)"/) ||
                       html.match(/content="([^"]+)" property="twitter:image"/);

      const idMatch = html.match(/user\/profile\/(\d+)/);

      if (descMatch && descMatch[1]) {
        const desc = decodeHtmlEntities(descMatch[1]);
        const fMatch = desc.match(/([0-9.,]+(?:\s*[KMBkmb]|rb|jt)?)\s*Followers/i);
        const foMatch = desc.match(/([0-9.,]+(?:\s*[KMBkmb]|rb|jt)?)\s*Following/i);
        const lMatch = desc.match(/([0-9.,]+(?:\s*[KMBkmb]|rb|jt)?)\s*Likes/i);

        const rawTitle = titleMatch ? decodeHtmlEntities(titleMatch[1]) : '';
        const nickname = rawTitle.replace(/\s*on TikTok.*/i, '').trim() || username;
        const avatar = imgMatch ? decodeHtmlEntities(imgMatch[1]).replace(/&amp;/g, '&') : '';
        const id = idMatch ? idMatch[1] : '';

        // Deteksi halaman 404 / placeholder generik TikTok
        if (
          rawTitle.includes('Kunjungi TikTok') ||
          rawTitle.includes('Watch more videos') ||
          rawTitle.includes('Watch trending videos') ||
          avatar.includes('poster-square.png') ||
          (!fMatch && !foMatch && !lMatch && !id)
        ) {
          return { notFound: true };
        }

        return {
          source: 'layer_crawler_opengraph',
          user: {
            uniqueId: username,
            nickname,
            avatarLarger: avatar,
            avatarMedium: avatar,
            avatarThumb: avatar,
            signature: '',
            verified: false,
            privateAccount: false,
            region: 'Global',
            id
          },
          stats: {
            followerCount: fMatch ? parseMetricString(fMatch[1]) : 0,
            followingCount: foMatch ? parseMetricString(foMatch[1]) : 0,
            heartCount: lMatch ? parseMetricString(lMatch[1]) : 0,
            videoCount: 0,
            friendCount: 0
          },
          statsV2: {}
        };
      }
    } catch (_) {}
  }

  throw new Error('Crawler bot did not find valid TikTok user data');
}

// Layer Jina Reader: Edge Reader Extractor bypass WAF datacenter
async function extractLayerJinaReader(username) {
  try {
    const res = await fetchWithTimeout(`https://r.jina.ai/https://www.tiktok.com/@${encodeURIComponent(username)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/plain, text/markdown, */*'
      }
    }, 3000);

    if (res.status === 404) return { notFound: true };
    if (!res.ok) throw new Error(`Jina non-200: ${res.status}`);

    const md = await res.text();
    if (!md || md.length < 100) throw new Error('Jina response empty');

    if (md.includes("Couldn't find this account") || md.includes('Account not found')) {
      return { notFound: true };
    }

    const avatarMatch = md.match(/!\[(?:Image \d+|Avatar|Profile)?[^\]]*\]\((https:\/\/[^\s\)]+tiktokcdn[^\s\)]+)\)/i);
    const nameMatch = md.match(/^#\s+(.+)$/m);
    const followingMatch = md.match(/\*\*([0-9.,]+(?:\s*[KMBkmb]|rb|jt)?)\*\*\s*Following/i);
    const followersMatch = md.match(/\*\*([0-9.,]+(?:\s*[KMBkmb]|rb|jt)?)\*\*\s*Followers/i);
    const likesMatch = md.match(/\*\*([0-9.,]+(?:\s*[KMBkmb]|rb|jt)?)\*\*\s*Likes/i);
    const bioMatch = md.match(/\[Message\]\([^\)]+\)\s*\n+(?:##\s*)?([^\n#]+)/i);

    const nickname = nameMatch ? nameMatch[1].trim() : username;
    const avatar = avatarMatch ? avatarMatch[1] : '';
    const followers = followersMatch ? parseMetricString(followersMatch[1]) : 0;
    const following = followingMatch ? parseMetricString(followingMatch[1]) : 0;
    const likes = likesMatch ? parseMetricString(likesMatch[1]) : 0;
    const bio = bioMatch ? bioMatch[1].trim() : '';

    if (nickname || avatar || followers > 0 || likes > 0) {
      return {
        source: 'layer_jina_edge_reader',
        user: {
          uniqueId: username,
          nickname,
          avatarLarger: avatar,
          avatarMedium: avatar,
          avatarThumb: avatar,
          signature: bio,
          verified: false,
          privateAccount: false,
          region: 'Global'
        },
        stats: {
          followerCount: followers,
          followingCount: following,
          heartCount: likes,
          videoCount: 0,
          friendCount: 0
        },
        statsV2: {}
      };
    }
  } catch (err) {
    throw new Error(`Jina reader failed: ${err.message}`);
  }
  throw new Error('Jina did not extract user');
}

// Engine 2A: TikWM JSON Cloud API
async function extractTikWM(username) {
  try {
    const res = await fetchWithTimeout(`https://www.tikwm.com/api/user/info?unique_id=${encodeURIComponent(username)}`, {
      method: 'POST',
      headers: {
        'User-Agent': USER_AGENTS[0],
        'Accept': 'application/json, text/plain, */*'
      }
    }, 3000);

    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { throw new Error('TikWM non-json'); }

    if (json && (json.code === 0 || json.data?.user)) {
      const d = json.data;
      if (d?.user && (d.user.uniqueId || d.user.nickname)) {
        return {
          source: 'layer2_tikwm_cloud',
          user: d.user || {},
          stats: d.stats || {},
          statsV2: {}
        };
      }
    }
  } catch (err) {
    throw new Error(`TikWM failed: ${err.message}`);
  }
  throw new Error('TikWM empty user');
}

// Engine 2B: Siputzx Public Cloud API
async function extractSiputzx(username) {
  try {
    const res = await fetchWithTimeout(`https://api.siputzx.my.id/api/stalk/tiktok?username=${encodeURIComponent(username)}`, {
      headers: { 'User-Agent': USER_AGENTS[1] }
    }, 3000);

    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { throw new Error('Siputzx non-json'); }

    const sData = json?.data || json?.result;
    if (json && (json.status || json.code === 200) && sData && (sData.username || sData.uniqueId || sData.nickname)) {
      return {
        source: 'layer2_siputzx_cloud',
        user: {
          uniqueId: sData.username || sData.uniqueId || username,
          nickname: sData.nickname || sData.name || username,
          avatarLarger: sData.avatar || sData.avatarLarger || '',
          avatarMedium: sData.avatar || '',
          avatarThumb: sData.avatar || '',
          signature: sData.bio || sData.description || sData.signature || '',
          verified: Boolean(sData.verified),
          privateAccount: Boolean(sData.privateAccount),
          region: sData.region || 'Global'
        },
        stats: {
          followerCount: sData.followers || sData.followerCount || 0,
          followingCount: sData.following || sData.followingCount || 0,
          heartCount: sData.likes || sData.heartCount || 0,
          videoCount: sData.videos || sData.videoCount || 0,
          friendCount: 0
        },
        statsV2: {}
      };
    }
  } catch (err) {
    throw new Error(`Siputzx failed: ${err.message}`);
  }
  throw new Error('Siputzx empty');
}

// Layer 4: TikTok Official oEmbed & Meta Tag Fallback
async function extractLayer4OEmbed(username) {
  const profileUrl = `https://www.tiktok.com/@${username}`;
  try {
    const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(profileUrl)}`;
    const res = await fetchWithTimeout(oembedUrl, {
      headers: { 'User-Agent': USER_AGENTS[1] }
    }, 2500);

    if (res.status === 400 || res.status === 404) {
      return { notFound: true };
    }

    if (res.ok) {
      const oembedData = await res.json();
      if (oembedData && oembedData.author_name) {
        let ogImage = '';
        let ogDesc = '';
        try {
          const pageRes = await fetchWithTimeout(profileUrl, {
            headers: { 'User-Agent': USER_AGENTS[0] }
          }, 1500);
          if (pageRes.ok) {
            const html = await pageRes.text();
            const imgMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
            if (imgMatch) ogImage = imgMatch[1];
            const descMatch = html.match(/<meta property="og:description" content="([^"]+)"/) || html.match(/<meta name="description" content="([^"]+)"/);
            if (descMatch) ogDesc = descMatch[1];
          }
        } catch (_) {}

        return {
          source: 'layer4_official_oembed',
          user: {
            uniqueId: username,
            nickname: oembedData.author_name,
            avatarLarger: ogImage,
            avatarMedium: ogImage,
            avatarThumb: ogImage,
            signature: ogDesc,
            verified: false,
            privateAccount: false,
            region: 'Global'
          },
          stats: {
            followerCount: 0,
            followingCount: 0,
            heartCount: 0,
            videoCount: 0,
            friendCount: 0
          },
          statsV2: {}
        };
      }
    }
  } catch (err) {
    if (err.message?.includes('400') || err.message?.includes('404')) {
      return { notFound: true };
    }
    throw new Error(`Layer 4 failed: ${err.message}`);
  }

  throw new Error('Layer 4 oEmbed did not return valid user');
}

// Petakan struktur data mentah ke skema keluaran konsisten
function mapProfileData(raw, username) {
  const user = raw.user || {};
  const stats = raw.stats || {};
  const statsV2 = raw.statsV2 || {};

  const cleanUsername = user.uniqueId || user.username || username;
  const nickname = user.nickname || user.name || cleanUsername;
  const avatar = user.avatarLarger || user.avatarMedium || user.avatarThumb || user.avatar || '';
  const bio = typeof user.signature === 'string' ? user.signature : (typeof user.bio === 'string' ? user.bio : '');
  const bioLink = user.bioLink?.link || (typeof user.bioLink === 'string' ? user.bioLink : null);
  const verified = Boolean(user.verified || user.isVerified);
  const privateAccount = Boolean(user.privateAccount || user.secret || user.isPrivate);
  const region = user.region || 'Global';
  const createDate = formatUnixTimestamp(user.createTime);
  const secUid = user.secUid || '';
  const id = user.id || user.uid || user.userId || '';

  const followers = Number(stats.followerCount ?? statsV2.followerCount ?? 0);
  const following = Number(stats.followingCount ?? statsV2.followingCount ?? 0);
  
  let likes = 0;
  if (stats.heart && Number(stats.heart) > 0) {
    likes = Number(stats.heart);
  } else if (stats.heartCount && Number(stats.heartCount) > 0) {
    likes = Number(stats.heartCount);
  } else if (statsV2.heartCount && Number(statsV2.heartCount) > 0) {
    likes = Number(statsV2.heartCount);
  } else if (stats.likes) {
    likes = Number(stats.likes);
  }

  const videos = Number(stats.videoCount ?? statsV2.videoCount ?? 0);
  const friends = Number(stats.friendCount ?? statsV2.friendCount ?? 0);

  return {
    username: cleanUsername,
    nickname,
    avatar,
    bio,
    bioLink,
    verified,
    privateAccount,
    region,
    id,
    secUid,
    createTime: createDate,
    profileUrl: `https://www.tiktok.com/@${cleanUsername}`,
    stats: {
      followers,
      following,
      likes,
      videos,
      friends
    }
  };
}

// Layanan Utama Pelacak Profil TikTok 100% Mandiri
export async function stalkTiktokProfile(rawInput, options = {}) {
  const forceRefresh = Boolean(options.forceRefresh || options.refresh);
  const username = await resolveTiktokUsername(rawInput);

  if (!username) {
    return {
      success: false,
      status: 'error',
      statusCode: 400,
      error: 'invalid_username',
      message: 'Username atau tautan profil TikTok tidak valid. Mohon periksa kembali input Anda.'
    };
  }

  const cacheKey = username.toLowerCase();
  const cached = profileCache.get(cacheKey);

  // Cek In-Memory Cache jika tidak dipaksa refresh
  if (!forceRefresh && cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    return {
      success: true,
      status: 'success',
      source: 'memory_cache',
      cached: true,
      timestamp: new Date(cached.timestamp).toISOString(),
      data: cached.data
    };
  }

  // Eksekusi paralel semua engine dengan batas waktu 3 detik
  const engineTasks = [
    extractLayer1Hydration(username).catch(e => ({ error: e.message })),
    extractLayerJinaReader(username).catch(e => ({ error: e.message })),
    extractLayerCrawlerOpenGraph(username).catch(e => ({ error: e.message })),
    extractTikWM(username).catch(e => ({ error: e.message })),
    extractLayer4OEmbed(username).catch(e => ({ error: e.message })),
    extractSiputzx(username).catch(e => ({ error: e.message }))
  ];

  const settled = await Promise.allSettled(engineTasks);
  const successfulResults = settled
    .filter(r => r.status === 'fulfilled' && r.value && !r.value.error)
    .map(r => r.value);

  const hasNotFound = successfulResults.some(r => r.notFound);
  const validDataResults = successfulResults.filter(r => !r.notFound && r.user);

  if (validDataResults.length === 0) {
    if (hasNotFound) {
      return {
        success: false,
        status: 'error',
        statusCode: 404,
        error: 'user_not_found',
        message: `Akun TikTok @${username} tidak ditemukan atau telah dihapus/diblokir.`
      };
    }
    return {
      success: false,
      status: 'error',
      statusCode: 404,
      error: 'user_not_found',
      message: `Akun TikTok @${username} tidak dapat diakses atau profil bersifat privat tanpa metadata publik.`
    };
  }

  // Urutkan berdasarkan kelengkapan metrik & avatar
  validDataResults.sort((a, b) => {
    const scoreA = (a.user?.avatarLarger || a.user?.avatar ? 2 : 0) + 
                   (a.stats?.followerCount > 0 ? 2 : 0) + 
                   (a.user?.signature ? 1 : 0);
    const scoreB = (b.user?.avatarLarger || b.user?.avatar ? 2 : 0) + 
                   (b.stats?.followerCount > 0 ? 2 : 0) + 
                   (b.user?.signature ? 1 : 0);
    return scoreB - scoreA;
  });

  // Gabungkan atribut dari hasil lain untuk memaksimalkan kelengkapan data
  const base = validDataResults[0];
  const mergedResult = {
    source: base.source || 'concurrent_hybrid',
    user: { ...base.user },
    stats: { ...base.stats },
    statsV2: { ...(base.statsV2 || {}) }
  };

  for (const item of validDataResults) {
    if (!mergedResult.user.avatarLarger && (item.user?.avatarLarger || item.user?.avatar)) {
      mergedResult.user.avatarLarger = item.user.avatarLarger || item.user.avatar;
    }
    if (!mergedResult.user.signature && item.user?.signature) {
      mergedResult.user.signature = item.user.signature;
    }
    if ((!mergedResult.stats.followerCount || mergedResult.stats.followerCount === 0) && item.stats?.followerCount > 0) {
      mergedResult.stats.followerCount = item.stats.followerCount;
    }
    if ((!mergedResult.stats.heartCount || mergedResult.stats.heartCount === 0) && (item.stats?.heartCount > 0 || item.stats?.likes > 0)) {
      mergedResult.stats.heartCount = item.stats.heartCount || item.stats.likes;
    }
    if ((!mergedResult.stats.followingCount || mergedResult.stats.followingCount === 0) && item.stats?.followingCount > 0) {
      mergedResult.stats.followingCount = item.stats.followingCount;
    }
    if ((!mergedResult.stats.videoCount || mergedResult.stats.videoCount === 0) && item.stats?.videoCount > 0) {
      mergedResult.stats.videoCount = item.stats.videoCount;
    }
  }

  const mappedData = mapProfileData(mergedResult, username);

  profileCache.set(cacheKey, {
    data: mappedData,
    timestamp: Date.now()
  });

  return {
    success: true,
    status: 'success',
    source: mergedResult.source || 'concurrent_hybrid',
    cached: false,
    timestamp: new Date().toISOString(),
    data: mappedData
  };
}

export async function scrapeTiktok(target, options = {}) {
  return await stalkTiktokProfile(target, options);
}

export default scrapeTiktok;
