import axios from 'axios';

/**
 * api/manhwa/search.js - Vercel Serverless & Express Endpoint
 * Integrasi resmi ke Jikan API v4 Publik (Manga Endpoint untuk Manhwa):
 * https://api.jikan.moe/v4/manga?type=manhwa&order_by=score&sort=desc
 */

// Pemetaan Genre Name ke Jikan v4 ID resmi
const JIKAN_MANGA_GENRE_MAP = {
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

// Dataset kurasi komik Korea (Manhwa) cadangan jika Jikan API publik rate-limited
const CURATED_MANHWA_BACKUP = [
  {
    id: 121496,
    title: {
      english: "Solo Leveling",
      romaji: "Na Honjaman Level Up",
      native: "나 혼자만 레벨업"
    },
    score: 8.7,
    description: "Sung Jin-Woo, pemburu terlemah berperingkat E yang dijuluki 'Senjata Terlemah Umat Manusia', terjebak dalam Double Dungeon maut. Saat di ambang kematian, ia terpilih oleh sistem misterius menjadi satu-satunya pemain yang bisa menaikkan level kekuatannya tanpa batas.",
    coverImage: "https://cdn.myanimelist.net/images/manga/3/222295l.jpg",
    genres: ["Action", "Adventure", "Fantasy"],
    chapters: 201,
    format: "MANHWA",
    status: "FINISHED",
    siteUrl: "https://myanimelist.net/manga/121496"
  },
  {
    id: 132214,
    title: {
      english: "Omniscient Reader's Viewpoint",
      romaji: "Jeonjijeok Dokja Sijeom",
      native: "전지적 독자 시점"
    },
    score: 8.9,
    description: "Kim Dokja adalah satu-satunya pembaca setia yang menuntaskan novel web 'Tiga Cara Bertahan Hidup di Dunia yang Hancur'. Ketika dunia novel tersebut mendadak menjadi kenyataan kiamat nyata, Dokja menggunakan pengetahuannya untuk bertahan hidup.",
    coverImage: "https://cdn.myanimelist.net/images/manga/1/242220l.jpg",
    genres: ["Action", "Adventure", "Fantasy", "Psychological"],
    chapters: null,
    format: "MANHWA",
    status: "RELEASING",
    siteUrl: "https://myanimelist.net/manga/132214"
  },
  {
    id: 122663,
    title: {
      english: "Tower of God",
      romaji: "Sin-ui Tap",
      native: "신의 탑"
    },
    score: 8.5,
    description: "Demi mengejar gadis satu-satunya yang ia kenal, Rachel, Bam nekat membuka pintu Menara misterius. Di dalam Menara, setiap lantai menyajikan ujian maut demi menggapai impian, kekuasaan, atau rahasia dunia.",
    coverImage: "https://cdn.myanimelist.net/images/manga/2/231908l.jpg",
    genres: ["Action", "Adventure", "Drama", "Fantasy", "Mystery"],
    chapters: null,
    format: "MANHWA",
    status: "RELEASING",
    siteUrl: "https://myanimelist.net/manga/122663"
  },
  {
    id: 141351,
    title: {
      english: "Return of the Blossoming Blade",
      romaji: "Hwasan Gwi-hwan",
      native: "화산귀환"
    },
    score: 8.8,
    description: "Chung Myung, Pendekar Pedang Suci Bunga Plum dari Sekte Mount Hua, gugur setelah membunuh Raja Iblis Cheon Ma. 100 tahun kemudian, ia terlahir kembali sebagai anak pengemis dan mendapati sektenya yang agung telah hancur dan dilupakan.",
    coverImage: "https://cdn.myanimelist.net/images/manga/3/256885l.jpg",
    genres: ["Action", "Adventure", "Comedy", "Fantasy"],
    chapters: null,
    format: "MANHWA",
    status: "RELEASING",
    siteUrl: "https://myanimelist.net/manga/141351"
  },
  {
    id: 129759,
    title: {
      english: "Nano Machine",
      romaji: "Nano Machine",
      native: "나노마신"
    },
    score: 8.4,
    description: "Cheon Yeo-Woon, pangeran terbuang dari Sekte Iblis Agung yang selalu diracuni dan diancam dibunuh, tiba-tiba didatangi keturunannya dari masa depan yang menyuntikkan mesin nano berteknologi tinggi ke dalam aliran darahnya.",
    coverImage: "https://cdn.myanimelist.net/images/manga/2/236746l.jpg",
    genres: ["Action", "Fantasy", "Sci-Fi"],
    chapters: null,
    format: "MANHWA",
    status: "RELEASING",
    siteUrl: "https://myanimelist.net/manga/129759"
  },
  {
    id: 111233,
    title: {
      english: "Wind Breaker",
      romaji: "Wind Breaker",
      native: "윈드브레이커"
    },
    score: 8.6,
    description: "Jay adalah ketua OSIS teladan yang berprestasi namun dingin. Kehidupannya berubah total ketika bakat bersepeda jalanan ekstrimnya terungkap dan membawanya bergabung ke kru balap jalanan 'Hummingbird'.",
    coverImage: "https://cdn.myanimelist.net/images/manga/1/206927l.jpg",
    genres: ["Action", "Comedy", "Drama", "Sports"],
    chapters: null,
    format: "MANHWA",
    status: "RELEASING",
    siteUrl: "https://myanimelist.net/manga/111233"
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
    if (JIKAN_MANGA_GENRE_MAP[lower]) {
      genreIds.push(JIKAN_MANGA_GENRE_MAP[lower]);
    } else if (!isNaN(parseInt(g, 10))) {
      genreIds.push(parseInt(g, 10));
    }
  });

  // 1. Panggil Jikan API v4 Publik (Endpoint Manga dengan type=manhwa)
  try {
    const params = {
      type: 'manhwa',
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

    const jikanRes = await axios.get('https://api.jikan.moe/v4/manga', {
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
        status: item.publishing ? 'RELEASING' : 'FINISHED',
        siteUrl: item.url || `https://myanimelist.net/manga/${item.mal_id}`
      }));

      return res.status(200).json({
        success: true,
        source: 'jikan_v4_manhwa',
        query,
        genres: genreNames,
        count: formatted.length,
        data: formatted
      });
    }
  } catch (err) {
    console.warn('[Jikan v4 Manhwa] Fetch warning, activating resilient fallback:', err.message);
  }

  // 2. Provider Sekunder: Kitsu Manga API Publik untuk Komik Korea (Manhwa)
  try {
    const kitsuParams = {
      'filter[subtype]': 'manhwa',
      'page[limit]': 20
    };
    if (query) {
      kitsuParams['filter[text]'] = query;
    } else {
      kitsuParams['sort'] = '-averageRating';
    }

    const kitsuBase = process.env.KITSU_API_BASE || 'https://kitsu.io/api/edge';
    const kitsuRes = await axios.get(`${kitsuBase}/manga`, {
      params: kitsuParams,
      timeout: 5000,
      headers: {
        'Accept': 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json'
      }
    });

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
          status: attr.status === 'finished' ? 'FINISHED' : 'RELEASING',
          siteUrl: `https://kitsu.io/manga/${attr.slug || item.id}`
        };
      });

      return res.status(200).json({
        success: true,
        source: 'kitsu_manga',
        query,
        genres: genreNames,
        count: formatted.length,
        data: formatted
      });
    }
  } catch (err) {
    console.warn('[Kitsu Manga API] Fetch warning, proceeding to curated dataset:', err.message);
  }

  // 3. Fallback cerdas: Saring dataset kurasi lokal agar pengguna tidak mengalami layar kosong
  let filtered = [...CURATED_MANHWA_BACKUP];
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
    count: filtered.length > 0 ? filtered.length : CURATED_MANHWA_BACKUP.length,
    data: filtered.length > 0 ? filtered : CURATED_MANHWA_BACKUP
  });
}
