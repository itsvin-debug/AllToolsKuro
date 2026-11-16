import axios from 'axios';

/**
 * api/media.js - Konsolidasi API Pencarian Anime & Manhwa Real-Time
 * Vercel Serverless Function yang menggabungkan:
 * 1. Anime: Jikan v4 Anime API + LiveChart.me Airing Episodes Feed
 * 2. Manhwa: Jikan v4 Manga API (type=manhwa) + Kitsu Manga API
 */

const JIKAN_GENRE_MAP = {
  'action': 1,
  'adventure': 2,
  'comedy': 4,
  'drama': 8,
  'fantasy': 10,
  'horror': 14,
  'mystery': 7,
  'romance': 22,
  'sci-fi': 24,
  'slice of life': 36,
  'sports': 30,
  'supernatural': 37,
  'psychological': 40
};

// Dataset cadangan anime jika Jikan rate-limited
const CURATED_ANIME = [
  {
    id: 52991,
    title: { english: "Frieren: Beyond Journey's End", romaji: "Sousou no Frieren", native: "葬送のフリーレン" },
    score: 9.3,
    description: "Setelah perjalanan sepuluh tahun mengalahkan Raja Iblis, penyihir elf Frieren harus menghadapi realitas waktu dan kefanaan rekan-rekannya.",
    coverImage: "https://cdn.myanimelist.net/images/anime/1015/138006l.jpg",
    genres: ["Adventure", "Drama", "Fantasy"],
    episodes: 28,
    status: "FINISHED"
  },
  {
    id: 51009,
    title: { english: "Jujutsu Kaisen Season 2", romaji: "Jujutsu Kaisen 2nd Season", native: "呪術廻戦 懐玉・玉折" },
    score: 8.8,
    description: "Kilas balik masa remaja Gojo Satoru dan Geto Suguru di SMA Jujutsu Tokyo, dilanjutkan dengan insiden Shibuya.",
    coverImage: "https://cdn.myanimelist.net/images/anime/1792/138022l.jpg",
    genres: ["Action", "Fantasy", "Supernatural"],
    episodes: 23,
    status: "FINISHED"
  },
  {
    id: 50265,
    title: { english: "SPY x FAMILY", romaji: "SPY x FAMILY", native: "SPY×FAMILY" },
    score: 8.5,
    description: "Mata-mata ulung Twilight harus membangun keluarga samaran demi misi perdamaian dunia.",
    coverImage: "https://cdn.myanimelist.net/images/anime/1441/122795l.jpg",
    genres: ["Action", "Comedy", "Slice of Life"],
    episodes: 25,
    status: "FINISHED"
  }
];

// Dataset cadangan manhwa jika API eksternal offline
const CURATED_MANHWA = [
  {
    id: 121496,
    title: { english: "Solo Leveling", romaji: "Na Honjaman Level Up", native: "나 혼자만 레벨업" },
    score: 8.7,
    description: "Sung Jin-Woo, pemburu terlemah berperingkat E yang dijuluki 'Senjata Terlemah Umat Manusia', terpilih oleh sistem misterius menjadi pemain tak terbatas.",
    coverImage: "https://cdn.myanimelist.net/images/manga/3/222295l.jpg",
    genres: ["Action", "Adventure", "Fantasy"],
    chapters: 201,
    status: "FINISHED"
  },
  {
    id: 132214,
    title: { english: "Omniscient Reader's Viewpoint", romaji: "Jeonjijeok Dokja Sijeom", native: "전지적 독자 시점" },
    score: 8.9,
    description: "Kim Dokja adalah satu-satunya pembaca setia yang menuntaskan novel web kiamat yang mendadak berubah menjadi kenyataan.",
    coverImage: "https://cdn.myanimelist.net/images/manga/1/242220l.jpg",
    genres: ["Action", "Adventure", "Fantasy", "Psychological"],
    chapters: null,
    status: "RELEASING"
  },
  {
    id: 122663,
    title: { english: "Tower of God", romaji: "Sin-ui Tap", native: "신의 탑" },
    score: 8.5,
    description: "Demi mengejar gadis satu-satunya yang ia kenal, Rachel, Bam nekat membuka pintu Menara misterius penuh ujian maut.",
    coverImage: "https://cdn.myanimelist.net/images/manga/2/231908l.jpg",
    genres: ["Action", "Adventure", "Drama", "Fantasy"],
    chapters: null,
    status: "RELEASING"
  }
];

function cleanHtmlTags(str) {
  if (!str) return '';
  return str.replace(/<[^>]+>/g, '').trim();
}

async function resolveTikTokUsername(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') return '';
  let input = rawInput.trim();

  if (input.includes('vt.tiktok.com') || input.includes('vm.tiktok.com')) {
    try {
      const fullUrl = input.startsWith('http') ? input : `https://${input}`;
      const head = await axios.get(fullUrl, {
        maxRedirects: 5,
        timeout: 6000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        }
      });
      const resolved = head.request?.res?.responseUrl || head.config?.url;
      if (resolved) input = resolved;
    } catch (err) {
      if (err.response?.headers?.location) {
        input = err.response.headers.location;
      }
    }
  }

  const urlMatch = input.match(/tiktok\.com\/@([a-zA-Z0-9_.]+)/i);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1].replace(/\/.*$/, '').trim();
  }

  if (input.startsWith('@')) {
    return input.replace(/^@+/, '').split(/[\/\?\s]/)[0].trim();
  }

  return input.split(/[\/\?\s]/)[0].replace(/[^a-zA-Z0-9_.]/g, '');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const type = (req.query?.type || req.body?.type || (req.url && req.url.includes('manhwa') ? 'manhwa' : 'anime')).toLowerCase();
  const query = (req.query?.q || req.body?.q || req.query?.query || req.body?.query || '').trim();
  const rawGenres = req.query?.genres || req.body?.genres || '';
  const page = parseInt(req.query?.page || req.body?.page || '1', 10) || 1;

  let genreNames = [];
  if (Array.isArray(rawGenres)) {
    genreNames = rawGenres.filter(Boolean);
  } else if (typeof rawGenres === 'string' && rawGenres.trim()) {
    genreNames = rawGenres.split(',').map(s => s.trim()).filter(Boolean);
  }

  const genreIds = [];
  genreNames.forEach(g => {
    const lower = String(g).toLowerCase();
    if (JIKAN_GENRE_MAP[lower]) {
      genreIds.push(JIKAN_GENRE_MAP[lower]);
    } else if (!isNaN(parseInt(g, 10))) {
      genreIds.push(parseInt(g, 10));
    }
  });

  // ==========================================
  // JALUR 0: TIKTOK PROFILE STALKER (100% ANONIM)
  // ==========================================
  if (type === 'tiktok-stalk' || type === 'tiktok_stalk' || type === 'tiktokstalk') {
    const rawTarget = req.body?.username || req.body?.url || req.query?.username || req.query?.url || query;
    if (!rawTarget) {
      return res.status(400).json({
        success: false,
        error: 'missing_target',
        message: 'Mohon masukkan username atau tautan profil TikTok.'
      });
    }

    const username = await resolveTikTokUsername(rawTarget);
    if (!username) {
      return res.status(400).json({
        success: false,
        error: 'invalid_username',
        message: 'Username TikTok tidak valid.'
      });
    }

    const profileUrl = `https://www.tiktok.com/@${username}`;
    let rawData = null;
    let dataSource = 'rehydration';

    // 1. Jalankan Direct Rehydration Scraper (Sangat Akurat & Menembus WAF TikTok)
    try {
      const directRes = await axios.get(profileUrl, {
        timeout: 9000,
        validateStatus: (status) => status < 500,
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8'
        }
      });

      if (directRes.status === 404) {
        return res.status(404).json({
          status: 'error',
          success: false,
          error: 'user_not_found',
          message: `Akun TikTok @${username} tidak ditemukan atau telah dihapus/diblokir.`
        });
      }

      const html = typeof directRes.data === 'string' ? directRes.data : '';
      const match = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
      if (match && match[1]) {
        const parsed = JSON.parse(match[1]);
        const defaultScope = parsed['__DEFAULT_SCOPE__'] || {};
        const userDetail = defaultScope['webapp.user-detail'] || {};
        const userInfo = userDetail.userInfo;
        if (userInfo && userInfo.user) {
          rawData = {
            user: userInfo.user,
            stats: userInfo.stats || {}
          };
          dataSource = 'tiktok_rehydration';
        }
      }
    } catch (err) {
      if (err.response?.status === 404) {
        return res.status(404).json({
          status: 'error',
          success: false,
          error: 'user_not_found',
          message: `Akun TikTok @${username} tidak ditemukan atau telah dihapus/diblokir.`
        });
      }
    }

    // 2. Jika Scraper Langsung belum dapat, coba API primer siputzx
    if (!rawData) {
      try {
        const apiRes = await axios.get(`https://api.siputzx.my.id/api/stalk/tiktok?username=${encodeURIComponent(username)}`, {
          timeout: 7000,
          validateStatus: () => true,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*'
          }
        });
        const cType = apiRes.headers['content-type'] || '';
        if (apiRes.status === 200 && cType.toLowerCase().includes('application/json')) {
          let bodyData = apiRes.data;
          if (typeof bodyData === 'string') {
            try { bodyData = JSON.parse(bodyData); } catch {}
          }
          if (bodyData && (bodyData.data || bodyData.result)) {
            rawData = bodyData;
            dataSource = 'siputzx';
          }
        }
      } catch (_) {}
    }

    if (!rawData) {
      return res.status(404).json({
        status: 'error',
        success: false,
        error: 'user_not_found',
        message: `Akun TikTok @${username} tidak ditemukan atau data publik tidak tersedia.`
      });
    }

    // 3. Normalisasi Multi-Path & Penanganan Nilai Suka Overflow
    const userObj = rawData?.data?.user || rawData?.result?.user || rawData?.user || rawData?.data || rawData || {};
    const statsObj = rawData?.data?.stats || rawData?.result?.stats || rawData?.stats || rawData?.data || rawData || {};

    const uniqueId = userObj.uniqueId || userObj.username || username;
    const nickname = userObj.nickname || userObj.name || uniqueId;
    const avatar = userObj.avatarLarger || userObj.avatarMedium || userObj.avatarThumb || userObj.avatar || '';
    const signature = typeof (userObj.signature || userObj.bio) === 'string' ? (userObj.signature || userObj.bio) : '';
    const verified = Boolean(userObj.verified || userObj.isVerified);
    const isPrivate = Boolean(userObj.privateAccount || userObj.isPrivate || userObj.isSecret);
    const secUid = userObj.secUid || '';
    const id = userObj.id || userObj.uid || userObj.userId || '';
    const region = userObj.region || '';
    const bioLinkRaw = userObj.bioLink?.link || (typeof userObj.bioLink === 'string' ? userObj.bioLink : null);

    const followers = Number(statsObj.followerCount ?? statsObj.followers ?? 0);
    const following = Number(statsObj.followingCount ?? statsObj.following ?? 0);
    
    let likes = 0;
    if (statsObj.heart && Number(statsObj.heart) > 0) {
      likes = Number(statsObj.heart);
    } else if (statsObj.heartCount && Number(statsObj.heartCount) > 0) {
      likes = Number(statsObj.heartCount);
    } else if (statsObj.likes) {
      likes = Number(statsObj.likes);
    }

    const videos = Number(statsObj.videoCount ?? statsObj.videos ?? 0);
    const friends = Number(statsObj.friendCount ?? statsObj.friends ?? 0);

    return res.status(200).json({
      success: true,
      source: dataSource,
      timestamp: new Date().toISOString(),
      data: {
        username: uniqueId,
        nickname,
        avatar,
        bio: signature,
        bioLink: bioLinkRaw,
        verified,
        privateAccount: isPrivate,
        id,
        secUid,
        region,
        profileUrl,
        stats: {
          followers,
          following,
          likes,
          videos,
          friends
        }
      }
    });
  }

  // ==========================================
  // JALUR 1: MANHWA FINDER
  // ==========================================
  if (type === 'manhwa') {
    try {
      const params = {
        type: 'manhwa',
        order_by: 'score',
        sort: 'desc',
        limit: 24,
        page
      };
      if (genreIds.length > 0) params.genres = genreIds.join(',');
      if (query) params.q = query;

      const jikanRes = await axios.get('https://api.jikan.moe/v4/manga', {
        params,
        timeout: 5500,
        headers: { 'User-Agent': 'AllToolsKuro/1.5.0 (KuroStudio Platform)' }
      });

      const items = jikanRes.data?.data;
      if (Array.isArray(items) && items.length > 0) {
        const formatted = items.map(item => ({
          id: item.mal_id,
          title: {
            english: item.title_english || item.title || 'Manhwa Title',
            romaji: item.title || item.title_japanese || 'Romaji',
            native: item.title_japanese || ''
          },
          score: typeof item.score === 'number' ? parseFloat(item.score.toFixed(1)) : 8.6,
          description: cleanHtmlTags(item.synopsis) || 'Sinopsis manhwa belum tersedia.',
          coverImage: item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop&q=80',
          genres: (item.genres || []).map(g => g.name),
          chapters: item.chapters || null,
          format: 'MANHWA',
          status: item.publishing ? 'RELEASING' : 'FINISHED'
        }));

        return res.status(200).json({ success: true, source: 'jikan_v4_manhwa', count: formatted.length, data: formatted });
      }
    } catch (_) {}

    // Fallback Kitsu Manga API
    try {
      const kitsuBase = process.env.KITSU_API_BASE || 'https://kitsu.io/api/edge';
      const kitsuParams = { 'filter[subtype]': 'manhwa', 'page[limit]': 20 };
      if (query) kitsuParams['filter[text]'] = query;
      else kitsuParams['sort'] = '-averageRating';

      const kitsuRes = await axios.get(`${kitsuBase}/manga`, { params: kitsuParams, timeout: 4500 });
      const kItems = kitsuRes.data?.data;
      if (Array.isArray(kItems) && kItems.length > 0) {
        const formatted = kItems.map(item => {
          const attr = item.attributes || {};
          const avgRating = attr.averageRating ? parseFloat((parseFloat(attr.averageRating) / 10).toFixed(1)) : 8.5;
          return {
            id: `kitsu-${item.id}`,
            title: {
              english: attr.canonicalTitle || attr.titles?.en || 'Manhwa Title',
              romaji: attr.titles?.en_jp || attr.canonicalTitle || 'Romaji',
              native: attr.titles?.ja_jp || ''
            },
            score: avgRating,
            description: cleanHtmlTags(attr.synopsis || attr.description) || 'Sinopsis manhwa belum tersedia.',
            coverImage: attr.posterImage?.large || attr.posterImage?.original || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop&q=80',
            genres: genreNames.length > 0 ? genreNames : ['Manhwa', 'Webtoon'],
            chapters: attr.chapterCount || null,
            format: 'MANHWA',
            status: attr.status === 'finished' ? 'FINISHED' : 'RELEASING'
          };
        });
        return res.status(200).json({ success: true, source: 'kitsu_manga', count: formatted.length, data: formatted });
      }
    } catch (_) {}

    return res.status(200).json({ success: true, source: 'curated_manhwa', count: CURATED_MANHWA.length, data: CURATED_MANHWA });
  }

  // ==========================================
  // JALUR 2: ANIME FINDER
  // ==========================================
  try {
    const params = {
      order_by: 'score',
      sort: 'desc',
      limit: 24,
      page
    };
    if (genreIds.length > 0) params.genres = genreIds.join(',');
    if (query) params.q = query;

    const jikanRes = await axios.get('https://api.jikan.moe/v4/anime', {
      params,
      timeout: 5500,
      headers: { 'User-Agent': 'AllToolsKuro/1.5.0 (KuroStudio Platform)' }
    });

    const items = jikanRes.data?.data;
    if (Array.isArray(items) && items.length > 0) {
      const formatted = items.map(item => ({
        id: item.mal_id,
        title: {
          english: item.title_english || item.title || 'Anime Title',
          romaji: item.title || item.title_japanese || 'Romaji',
          native: item.title_japanese || ''
        },
        score: typeof item.score === 'number' ? parseFloat(item.score.toFixed(1)) : 8.5,
        description: cleanHtmlTags(item.synopsis) || 'Sinopsis anime belum tersedia.',
        coverImage: item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop&q=80',
        genres: (item.genres || []).map(g => g.name),
        episodes: item.episodes || null,
        format: item.type || 'TV',
        status: item.status === 'Finished Airing' ? 'FINISHED' : 'RELEASING'
      }));

      return res.status(200).json({ success: true, source: 'jikan_v4_anime', count: formatted.length, data: formatted });
    }
  } catch (_) {}

  // Fallback LiveChart.me Airing Episodes Feed
  try {
    const liveChartUrl = process.env.LIVECHART_API_BASE || 'https://www.livechart.me/feeds/episodes';
    const lcRes = await axios.get(liveChartUrl, { timeout: 4500, headers: { 'User-Agent': 'AllToolsKuro/1.5.0' } });
    const xml = lcRes.data;
    if (typeof xml === 'string' && xml.includes('<item>')) {
      const items = [];
      const itemRegex = /<item>([\s\S]*?)<\/item>/g;
      let match;
      let count = 0;
      while ((match = itemRegex.exec(xml)) !== null && count < 20) {
        const itemBlock = match[1];
        const titleMatch = itemBlock.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || itemBlock.match(/<title>(.*?)<\/title>/);
        const descMatch = itemBlock.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) || itemBlock.match(/<description>(.*?)<\/description>/);
        const imgMatch = itemBlock.match(/<media:thumbnail[^>]+url="([^"]+)"/) || itemBlock.match(/<enclosure[^>]+url="([^"]+)"/);

        const rawTitle = titleMatch ? titleMatch[1].trim() : '';
        if (rawTitle) {
          items.push({
            id: `livechart-${count + 1}`,
            title: { english: rawTitle, romaji: rawTitle, native: '' },
            score: 8.5,
            description: cleanHtmlTags(descMatch ? descMatch[1] : '') || 'Episode anime tersinkronisasi via LiveChart.me.',
            coverImage: imgMatch ? imgMatch[1] : 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop&q=80',
            genres: genreNames.length > 0 ? genreNames : ['Anime', 'Airing'],
            episodes: null,
            format: 'TV',
            status: 'RELEASING'
          });
          count++;
        }
      }
      if (items.length > 0) {
        return res.status(200).json({ success: true, source: 'livechart_episodes', count: items.length, data: items });
      }
    }
  } catch (_) {}

  return res.status(200).json({ success: true, source: 'curated_anime', count: CURATED_ANIME.length, data: CURATED_ANIME });
}

