import axios from 'axios';

// Dataset cadangan Manhwa Korea populer jika koneksi AniList offline
const FALLBACK_MANHWA_DATA = [
  {
    id: 105398,
    title: {
      english: "Solo Leveling",
      romaji: "Na Honjaman Level Up",
      native: "나 혼자만 레벨업"
    },
    score: 8.7,
    description: "Sung Jin-Woo, pemburu terlemah berperingkat E yang dijuluki 'Senjata Terlemah Umat Manusia', terjebak dalam Double Dungeon maut. Saat di ambang kematian, ia terpilih oleh sistem misterius menjadi satu-satunya pemain yang bisa menaikkan level kekuatannya tanpa batas.",
    coverImage: "https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx105398-b673Vt5ZSuz3.jpg",
    genres: ["Action", "Adventure", "Fantasy"],
    chapters: 201,
    status: "FINISHED",
    siteUrl: "https://anilist.co/manga/105398"
  },
  {
    id: 119257,
    title: {
      english: "Omniscient Reader's Viewpoint",
      romaji: "Jeonjijeok Dokja Sijeom",
      native: "전지적 독자 시점"
    },
    score: 8.9,
    description: "Kim Dokja adalah satu-satunya pembaca setia yang menuntaskan novel web 'Tiga Cara Bertahan Hidup di Dunia yang Hancur'. Ketika dunia novel tersebut mendadak menjadi kenyataan kiamat nyata, Dokja menggunakan pengetahuannya untuk bertahan hidup.",
    coverImage: "https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx119257-W1U8y996Fq1S.jpg",
    genres: ["Action", "Adventure", "Fantasy", "Psychological"],
    chapters: null,
    status: "RELEASING",
    siteUrl: "https://anilist.co/manga/119257"
  },
  {
    id: 85143,
    title: {
      english: "Tower of God",
      romaji: "Sin-ui Tap",
      native: "신의 탑"
    },
    score: 8.5,
    description: "Demi mengejar gadis satu-satunya yang ia kenal, Rachel, Bam nekat membuka pintu Menara misterius. Di dalam Menara, setiap lantai menyajikan ujian maut demi menggapai impian, kekuasaan, atau rahasia dunia.",
    coverImage: "https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx85143-pC4x7tL38L9z.jpg",
    genres: ["Action", "Adventure", "Drama", "Fantasy", "Mystery"],
    chapters: null,
    status: "RELEASING",
    siteUrl: "https://anilist.co/manga/85143"
  },
  {
    id: 125642,
    title: {
      english: "Return of the Blossoming Blade",
      romaji: "Hwasan Gwi-hwan",
      native: "화산귀환"
    },
    score: 8.8,
    description: "Chung Myung, Pendekar Pedang Suci Bunga Plum dari Sekte Mount Hua, gugur setelah membunuh Raja Iblis Cheon Ma. 100 tahun kemudian, ia terlahir kembali sebagai anak pengemis dan mendapati sektenya yang agung telah hancur dan dilupakan.",
    coverImage: "https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx125642-z7yQv6Vf1l1Q.jpg",
    genres: ["Action", "Adventure", "Comedy", "Fantasy"],
    chapters: null,
    status: "RELEASING",
    siteUrl: "https://anilist.co/manga/125642"
  },
  {
    id: 120853,
    title: {
      english: "Nano Machine",
      romaji: "Nano Machine",
      native: "나노마신"
    },
    score: 8.4,
    description: "Cheon Yeo-Woon, pangeran terbuang dari Sekte Iblis Agung yang selalu diracuni dan diancam dibunuh, tiba-tiba didatangi keturunannya dari masa depan yang menyuntikkan mesin nano berteknologi tinggi ke dalam aliran darahnya.",
    coverImage: "https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx120853-aA4qI3jJ88rY.jpg",
    genres: ["Action", "Fantasy", "Sci-Fi"],
    chapters: null,
    status: "RELEASING",
    siteUrl: "https://anilist.co/manga/120853"
  },
  {
    id: 85482,
    title: {
      english: "Wind Breaker",
      romaji: "Wind Breaker",
      native: "윈드브레이커"
    },
    score: 8.6,
    description: "Jay adalah ketua OSIS teladan yang berprestasi namun dingin. Kehidupannya berubah total ketika bakat bersepeda jalanan ekstrimnya terungkap dan membawanya bergabung ke kru balap jalanan 'Hummingbird'.",
    coverImage: "https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx85482-3tL63JqH99cZ.jpg",
    genres: ["Action", "Comedy", "Drama", "Sports"],
    chapters: null,
    status: "RELEASING",
    siteUrl: "https://anilist.co/manga/85482"
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
  const sort = req.query?.sort || req.body?.sort || 'POPULARITY_DESC';
  const page = parseInt(req.query?.page || req.body?.page || '1', 10) || 1;

  let genreList = [];
  if (Array.isArray(rawGenres)) {
    genreList = rawGenres.filter(Boolean);
  } else if (typeof rawGenres === 'string' && rawGenres.trim()) {
    genreList = rawGenres.split(',').map(s => s.trim()).filter(Boolean);
  }

  // Query AniList khusus untuk Manhwa Korea (countryOfOrigin: KR, type: MANGA)
  const gqlQuery = `
    query ($page: Int, $perPage: Int, $search: String, $genres: [String], $sort: [MediaSort]) {
      Page(page: $page, perPage: $perPage) {
        media(search: $search, genre_in: $genres, type: MANGA, countryOfOrigin: "KR", sort: $sort) {
          id
          title {
            romaji
            english
            native
          }
          averageScore
          description
          coverImage {
            large
            extraLarge
          }
          genres
          chapters
          format
          status
          siteUrl
        }
      }
    }
  `;

  const variables = {
    page,
    perPage: 15,
    sort: [sort]
  };

  if (query) variables.search = query;
  if (genreList.length > 0) variables.genres = genreList;

  try {
    const response = await axios.post(
      'https://graphql.anilist.co',
      { query: gqlQuery, variables },
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 9000
      }
    );

    const mediaList = response.data?.data?.Page?.media;
    if (Array.isArray(mediaList) && mediaList.length > 0) {
      const formatted = mediaList.map(item => {
        const scoreVal = typeof item.averageScore === 'number' 
          ? (item.averageScore / 10).toFixed(1) 
          : '8.5';

        return {
          id: item.id,
          title: {
            english: item.title?.english || item.title?.romaji || 'Manhwa Title',
            romaji: item.title?.romaji || item.title?.english || 'Romaji',
            native: item.title?.native || ''
          },
          score: parseFloat(scoreVal),
          description: cleanHtmlTags(item.description) || 'Sinopsis manhwa belum tersedia.',
          coverImage: item.coverImage?.extraLarge || item.coverImage?.large || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop&q=80',
          genres: Array.isArray(item.genres) ? item.genres : [],
          chapters: item.chapters || null,
          format: item.format || 'MANGA',
          status: item.status || 'RELEASING',
          siteUrl: item.siteUrl || `https://anilist.co/manga/${item.id}`
        };
      });

      return res.status(200).json({
        success: true,
        source: 'anilist',
        query,
        genres: genreList,
        count: formatted.length,
        data: formatted
      });
    }
  } catch (err) {
    console.warn('AniList Manhwa query warning, using fallback dataset:', err.message);
  }

  // Fallback lokal jika AniList offline
  let filtered = [...FALLBACK_MANHWA_DATA];
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

  if (genreList.length > 0) {
    filtered = filtered.filter(item => {
      return genreList.some(g => item.genres.includes(g));
    });
  }

  return res.status(200).json({
    success: true,
    source: 'fallback',
    query,
    genres: genreList,
    count: filtered.length,
    data: filtered.length > 0 ? filtered : FALLBACK_MANHWA_DATA
  });
}
