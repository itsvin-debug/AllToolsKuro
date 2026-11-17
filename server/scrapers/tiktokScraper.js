import axios from 'axios';

// In-Memory Cache (TTL 60 detik) untuk proteksi anti-rate-limit
const profileCache = new Map();
const CACHE_TTL_MS = 60 * 1000;

const USER_AGENTS = [
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'
];

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

  // Pola URL web profil atau video tiktok.com/@username
  const urlMatch = input.match(/tiktok\.com\/@([a-zA-Z0-9_.]+)/i);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1].replace(/\/.*$/, '').trim();
  }

  // Jika diawali simbol @ (dengan toleransi spasi di depannya)
  if (input.startsWith('@')) {
    return input.replace(/^@+\s*/, '').split(/[\/\?\s]/)[0].trim();
  }

  return input.split(/[\/\?\s]/)[0].replace(/[^a-zA-Z0-9_.]/g, '');
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
      timeout: 3500,
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

// Engine 2A: TikWM JSON Cloud API
async function extractTikWM(username) {
  try {
    const res = await fetchWithTimeout(`https://www.tikwm.com/api/user/info?unique_id=${encodeURIComponent(username)}`, {
      method: 'POST',
      headers: {
        'User-Agent': USER_AGENTS[0],
        'Accept': 'application/json, text/plain, */*'
      }
    }, 3500);

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
    }, 3500);

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

  let extractedResult = null;

  // Eksekusi paralel Engine TikWM, Siputzx, dan Direct Hydration secara serentak
  try {
    extractedResult = await Promise.any([
      extractTikWM(username),
      extractSiputzx(username),
      extractLayer1Hydration(username)
    ]);
  } catch (_) {
    try {
      extractedResult = await extractLayer4OEmbed(username);
    } catch (_) {}
  }

  if (extractedResult?.notFound) {
    return {
      success: false,
      status: 'error',
      statusCode: 404,
      error: 'user_not_found',
      message: `Akun TikTok @${username} tidak ditemukan atau telah dihapus/diblokir.`
    };
  }

  if (!extractedResult || !extractedResult.user) {
    return {
      success: false,
      status: 'error',
      statusCode: 404,
      error: 'user_not_found',
      message: `Akun TikTok @${username} tidak dapat diakses atau profil bersifat privat tanpa metadata publik.`
    };
  }

  const mappedData = mapProfileData(extractedResult, username);

  profileCache.set(cacheKey, {
    data: mappedData,
    timestamp: Date.now()
  });

  return {
    success: true,
    status: 'success',
    source: extractedResult.source || 'self_hosted_scraper',
    cached: false,
    timestamp: new Date().toISOString(),
    data: mappedData
  };
}

export async function scrapeTiktok(target, options = {}) {
  return await stalkTiktokProfile(target, options);
}

export default scrapeTiktok;
