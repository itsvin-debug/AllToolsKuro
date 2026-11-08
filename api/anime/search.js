import axios from 'axios';

// Dataset cadangan anime jika koneksi AniList GraphQL offline atau timeout
const FALLBACK_ANIME_DATA = [
  {
    id: 154587,
    title: {
      english: "Frieren: Beyond Journey's End",
      romaji: "Sousou no Frieren",
      native: "葬送のフリーレン"
    },
    score: 9.1,
    description: "Setelah perjalanan panjang mengalahkan Raja Iblis, penyihir elf Frieren harus menghadapi realitas waktu dan kefanaan rekan-rekannya, memulai pengembaraan baru untuk memahami arti kehidupan manusia.",
    coverImage: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx154587-qQTzQnEJJ3oB.jpg",
    genres: ["Adventure", "Drama", "Fantasy"],
    episodes: 28,
    status: "FINISHED",
    siteUrl: "https://anilist.co/anime/154587"
  },
  {
    id: 142838,
    title: {
      english: "Jujutsu Kaisen Season 2",
      romaji: "Jujutsu Kaisen 2nd Season",
      native: "呪術廻戦 懐玉・玉折 / 渋谷事変"
    },
    score: 8.8,
    description: "Kilas balik masa lalu Gojo Satoru dan Geto Suguru di SMA Jujutsu Tokyo, dilanjutkan dengan insiden Shibuya yang mengubah peta pertempuran penyihir jujutsu selamanya.",
    coverImage: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx142838-kJbeiz4291yX.jpg",
    genres: ["Action", "Fantasy", "Supernatural"],
    episodes: 23,
    status: "FINISHED",
    siteUrl: "https://anilist.co/anime/142838"
  },
  {
    id: 140960,
    title: {
      english: "SPY x FAMILY",
      romaji: "SPY x FAMILY",
      native: "SPY×FAMILY"
    },
    score: 8.5,
    description: "Mata-mata ulung berkode Twilight harus membangun keluarga samaran demi misi perdamaian dunia, tanpa mengetahui bahwa sang istri adalah pembunuh bayaran dan anak angkatnya adalah cenayang pembaca pikiran.",
    coverImage: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx140960-YrkFGyLQ962H.jpg",
    genres: ["Action", "Comedy", "Slice of Life", "Supernatural"],
    episodes: 25,
    status: "FINISHED",
    siteUrl: "https://anilist.co/anime/140960"
  },
  {
    id: 145064,
    title: {
      english: "Oshi No Ko",
      romaji: "【OSHI NO KO】",
      native: "【推しの子】"
    },
    score: 8.6,
    description: "Dokter kandungan Goro bereinkarnasi sebagai anak dari idola legendaris Ai Hoshino, memasuki industri hiburan Jepang yang gemerlap namun penuh intrik dan misteri kematian sang ibu.",
    coverImage: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx145064-iQ0XN3q3eZ78.jpg",
    genres: ["Drama", "Mystery", "Supernatural"],
    episodes: 11,
    status: "FINISHED",
    siteUrl: "https://anilist.co/anime/145064"
  },
  {
    id: 130003,
    title: {
      english: "Bocchi the Rock!",
      romaji: "Bocchi the Rock!",
      native: "ぼっち・ざ・ろっく！"
    },
    score: 8.8,
    description: "Hitori Gotoh, gadis pemalu dengan kecemasan sosial ekstrem yang jago bermain gitar di kamar, tiba-tiba diajak bergabung ke grup band Kessoku Band dan memulai perjalanan musiknya di panggung nyata.",
    coverImage: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx130003-5A54848h43b.jpg",
    genres: ["Comedy", "Music", "Slice of Life"],
    episodes: 12,
    status: "FINISHED",
    siteUrl: "https://anilist.co/anime/130003"
  },
  {
    id: 113415,
    title: {
      english: "Jujutsu Kaisen",
      romaji: "Jujutsu Kaisen",
      native: "呪術廻戦"
    },
    score: 8.6,
    description: "Yuuji Itadori menelan jari kutukan Sukuna demi menyelamatkan temannya, menyeret dirinya masuk ke dunia pertempuran kutukan bersama para penyihir SMA Jujutsu.",
    coverImage: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx113415-bbBWj4pUbAw8.jpg",
    genres: ["Action", "Fantasy", "Supernatural"],
    episodes: 24,
    status: "FINISHED",
    siteUrl: "https://anilist.co/anime/113415"
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

  // Parsing array genre jika ada
  let genreList = [];
  if (Array.isArray(rawGenres)) {
    genreList = rawGenres.filter(Boolean);
  } else if (typeof rawGenres === 'string' && rawGenres.trim()) {
    genreList = rawGenres.split(',').map(s => s.trim()).filter(Boolean);
  }

  // GraphQL Query ke AniList
  const gqlQuery = `
    query ($page: Int, $perPage: Int, $search: String, $genres: [String], $sort: [MediaSort]) {
      Page(page: $page, perPage: $perPage) {
        media(search: $search, genre_in: $genres, type: ANIME, sort: $sort) {
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
          episodes
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
          : '8.4';

        return {
          id: item.id,
          title: {
            english: item.title?.english || item.title?.romaji || 'Anime Title',
            romaji: item.title?.romaji || item.title?.english || 'Romaji',
            native: item.title?.native || ''
          },
          score: parseFloat(scoreVal),
          description: cleanHtmlTags(item.description) || 'Sinopsis belum tersedia.',
          coverImage: item.coverImage?.extraLarge || item.coverImage?.large || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop&q=80',
          genres: Array.isArray(item.genres) ? item.genres : [],
          episodes: item.episodes || null,
          format: item.format || 'TV',
          status: item.status || 'UNKNOWN',
          siteUrl: item.siteUrl || `https://anilist.co/anime/${item.id}`
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
    console.warn('AniList query warning, using fallback dataset:', err.message);
  }

  // Fallback lokal jika AniList offline atau tidak ada koneksi internet
  let filtered = [...FALLBACK_ANIME_DATA];
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
    data: filtered.length > 0 ? filtered : FALLBACK_ANIME_DATA
  });
}

