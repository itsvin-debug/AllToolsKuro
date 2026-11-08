import axios from 'axios';

/**
 * api/anime/search.js - Vercel Serverless & Express Endpoint
 * Integrasi resmi ke Jikan API v4 Publik:
 * https://api.jikan.moe/v4/anime?genres={genreId}&order_by=score&sort=desc
 */

// Pemetaan Genre Name ke Jikan v4 ID resmi
const JIKAN_ANIME_GENRE_MAP = {
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

// Dataset kurasi anime cadangan jika Jikan API publik terkena rate-limiting (429)
const CURATED_ANIME_BACKUP = [
  {
    id: 52991,
    title: {
      english: "Frieren: Beyond Journey's End",
      romaji: "Sousou no Frieren",
      native: "葬送のフリーレン"
    },
    score: 9.3,
    description: "Setelah perjalanan sepuluh tahun mengalahkan Raja Iblis, penyihir elf Frieren harus menghadapi realitas waktu dan kefanaan rekan-rekannya, memulai pengembaraan baru untuk memahami arti waktu dan hubungan manusia.",
    coverImage: "https://cdn.myanimelist.net/images/anime/1015/138006l.jpg",
    genres: ["Adventure", "Drama", "Fantasy"],
    episodes: 28,
    format: "TV",
    status: "FINISHED",
    siteUrl: "https://myanimelist.net/anime/52991"
  },
  {
    id: 51009,
    title: {
      english: "Jujutsu Kaisen Season 2",
      romaji: "Jujutsu Kaisen 2nd Season",
      native: "呪術廻戦 懐玉・玉折 / 渋谷事変"
    },
    score: 8.8,
    description: "Kilas balik masa remaja Gojo Satoru dan Geto Suguru di SMA Jujutsu Tokyo, dilanjutkan dengan insiden Shibuya yang mengubah tatanan dunia penyihir selamanya.",
    coverImage: "https://cdn.myanimelist.net/images/anime/1792/138022l.jpg",
    genres: ["Action", "Fantasy", "Supernatural"],
    episodes: 23,
    format: "TV",
    status: "FINISHED",
    siteUrl: "https://myanimelist.net/anime/51009"
  },
  {
    id: 50265,
    title: {
      english: "SPY x FAMILY",
      romaji: "SPY x FAMILY",
      native: "SPY×FAMILY"
    },
    score: 8.5,
    description: "Mata-mata ulung Twilight harus membangun keluarga samaran demi misi perdamaian dunia, tanpa mengetahui bahwa sang istri adalah pembunuh bayaran dan anak angkatnya adalah cenayang telepati.",
    coverImage: "https://cdn.myanimelist.net/images/anime/1441/122795l.jpg",
    genres: ["Action", "Comedy", "Slice of Life", "Supernatural"],
    episodes: 25,
    format: "TV",
    status: "FINISHED",
    siteUrl: "https://myanimelist.net/anime/50265"
  },
  {
    id: 52034,
    title: {
      english: "Oshi No Ko",
      romaji: "【OSHI NO KO】",
      native: "【推しの子】"
    },
    score: 8.7,
    description: "Dokter kandungan Goro bereinkarnasi sebagai anak dari idola legendaris Ai Hoshino, memasuki industri hiburan Jepang yang gemerlap namun penuh intrik dan misteri kematian sang ibu.",
    coverImage: "https://cdn.myanimelist.net/images/anime/1813/134444l.jpg",
    genres: ["Drama", "Mystery", "Supernatural"],
    episodes: 11,
    format: "TV",
    status: "FINISHED",
    siteUrl: "https://myanimelist.net/anime/52034"
  },
  {
    id: 47917,
    title: {
      english: "Bocchi the Rock!",
      romaji: "Bocchi the Rock!",
      native: "ぼっち・ざ・ろっく！"
    },
    score: 8.8,
    description: "Hitori Gotoh, gadis pemalu dengan kecemasan sosial yang jago bermain gitar di kamar, tiba-tiba diajak bergabung ke grup band Kessoku Band dan memulai perjalanan musiknya di panggung nyata.",
    coverImage: "https://cdn.myanimelist.net/images/anime/1448/127956l.jpg",
    genres: ["Comedy", "Slice of Life"],
    episodes: 12,
    format: "TV",
    status: "FINISHED",
    siteUrl: "https://myanimelist.net/anime/47917"
  },
  {
    id: 40748,
    title: {
      english: "Jujutsu Kaisen",
      romaji: "Jujutsu Kaisen",
      native: "呪術廻戦"
    },
    score: 8.6,
    description: "Yuuji Itadori menelan jari kutukan Sukuna demi menyelamatkan temannya, menyeret dirinya masuk ke dunia pertempuran kutukan bersama para penyihir SMA Jujutsu.",
    coverImage: "https://cdn.myanimelist.net/images/anime/1171/109222l.jpg",
    genres: ["Action", "Fantasy", "Supernatural"],
    episodes: 24,
    format: "TV",
    status: "FINISHED",
    siteUrl: "https://myanimelist.net/anime/40748"
  }
];

function cleanHtmlTags(str) {
  if (!str) return '';
  return str
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?i>/gi, '')
    .replace(/<\/?b>/gi, '')
    .replace(/<[^>]+>/g, '')
    .trim();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const query = (req.query?.q || req.body?.q || req.query?.query || req.body?.query || '').trim();
  const rawGenres = req.query?.genres || req.body?.genres || '';
  const page = parseInt(req.query?.page || req.body?.page || '1', 10) || 1;

  // Parsing genre yang masuk (bisa nama string atau angka)
  let genreNames = [];
  if (Array.isArray(rawGenres)) {
    genreNames = rawGenres.filter(Boolean);
  } else if (typeof rawGenres === 'string' && rawGenres.trim()) {
    genreNames = rawGenres.split(',').map(s => s.trim()).filter(Boolean);
  }

  // Petakan ke ID Jikan v4
  const genreIds = [];
  genreNames.forEach(g => {
    const lower = String(g).toLowerCase();
    if (JIKAN_ANIME_GENRE_MAP[lower]) {
      genreIds.push(JIKAN_ANIME_GENRE_MAP[lower]);
    } else if (!isNaN(parseInt(g, 10))) {
      genreIds.push(parseInt(g, 10));
    }
  });

  // 1. Panggil Jikan API v4 Publik secara langsung
  try {
    const params = {
      order_by: 'score',
      sort: 'desc',
      limit: 24,
      page
    };

    if (genreIds.length > 0) {
      params.genres = genreIds.join(',');
    }
    if (query) {
      params.q = query;
    }

    const jikanRes = await axios.get('https://api.jikan.moe/v4/anime', {
      params,
      timeout: 6500,
      headers: {
        'User-Agent': 'AllToolsKuro/1.3.0 (KuroStudio Multi-Tool Platform)'
      }
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
        description: cleanHtmlTags(item.synopsis) || 'Sinopsis belum tersedia.',
        coverImage: item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop&q=80',
        genres: (item.genres || []).map(g => g.name),
        episodes: item.episodes || null,
        format: item.type || 'TV',
        status: item.status === 'Finished Airing' ? 'FINISHED' : 'RELEASING',
        siteUrl: item.url || `https://myanimelist.net/anime/${item.mal_id}`
      }));

      return res.status(200).json({
        success: true,
        source: 'jikan_v4',
        query,
        genres: genreNames,
        count: formatted.length,
        data: formatted
      });
    }
  } catch (err) {
    console.warn('[Jikan v4 Anime] Fetch warning, activating resilient fallback:', err.message);
  }

  // 2. Fallback cerdas: Saring dataset kurasi lokal agar pengguna tidak mengalami layar kosong
  let filtered = [...CURATED_ANIME_BACKUP];
  if (query) {
    const qLower = query.toLowerCase();
    filtered = filtered.filter(item => {
      return (
        item.title.english.toLowerCase().includes(qLower) ||
        item.title.romaji.toLowerCase().includes(qLower) ||
        item.description.toLowerCase().includes(qLower)
      );
    });
  }

  if (genreNames.length > 0) {
    filtered = filtered.filter(item => {
      return genreNames.some(g => item.genres.some(ig => ig.toLowerCase() === g.toLowerCase()));
    });
  }

  return res.status(200).json({
    success: true,
    source: 'fallback_curated',
    query,
    genres: genreNames,
    count: filtered.length > 0 ? filtered.length : CURATED_ANIME_BACKUP.length,
    data: filtered.length > 0 ? filtered : CURATED_ANIME_BACKUP
  });
}
