/**
 * frontend/src/services/manhwaService.js
 * Layanan pencarian dan rekomendasi komik Korea (Manhwa) real-time.
 * Menghubungkan langsung ke AniList GraphQL API (KR Manhwa) dengan fallback cerdas berbasis kombinasi genre.
 */

export const CURATED_MANHWA_DATA = [
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
  },
  {
    id: 114693,
    title: {
      english: "Eleceed",
      romaji: "Eleceed",
      native: "일렉시드"
    },
    score: 8.7,
    description: "Jiwoo adalah remaja penyayang kucing yang menyembunyikan kekuatan kecepatan super. Suatu hari ia menyelamatkan seekor kucing oranye gemuk yang ternyata adalah Kayden — pemburu terkuat di dunia yang sedang menyamar.",
    coverImage: "https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx114693-h48P29b8N76l.jpg",
    genres: ["Action", "Comedy", "Supernatural"],
    chapters: null,
    status: "RELEASING",
    siteUrl: "https://anilist.co/manga/114693"
  },
  {
    id: 121408,
    title: {
      english: "Legend of the Northern Blade",
      romaji: "Bukgeomjeonji",
      native: "북검전기"
    },
    score: 8.8,
    description: "Ketika Sekte Langit Utara yang perkasa difitnah dan dihancurkan oleh para sekutu murahan, Jin Mu-Won, putra semata wayang pemimpin sekte, diam-diam mempelajari seni bela diri kuno demi membalas dendam ayahnya.",
    coverImage: "https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx121408-l4wO7q38910k.jpg",
    genres: ["Action", "Adventure", "Fantasy"],
    chapters: null,
    status: "RELEASING",
    siteUrl: "https://anilist.co/manga/121408"
  },
  {
    id: 125134,
    title: {
      english: "SSS-Class Suicide Hunter",
      romaji: "SSS-geub Jusalheonteo",
      native: "SSS급 죽어야 사는 헌터"
    },
    score: 8.6,
    description: "Gong-Ja Kim hidup dalam rasa iri terhadap para pemburu menara hebat. Secara tak terduga ia mendapatkan kemampuan S-Rank unik: setiap kali ia dibunuh oleh musuh, ia dapat menyalin satu skill musuh dan kembali ke masa lalu.",
    coverImage: "https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx125134-bM8y0738Pq1R.jpg",
    genres: ["Action", "Adventure", "Comedy", "Fantasy"],
    chapters: null,
    status: "RELEASING",
    siteUrl: "https://anilist.co/manga/125134"
  },
  {
    id: 111867,
    title: {
      english: "The Beginning After The End",
      romaji: "The Beginning After The End",
      native: "디 비기닝 애프터 디 엔드"
    },
    score: 8.6,
    description: "Raja Grey yang memiliki kekuatan, kekayaan, dan prestise tak tertandingi di dunia bela diri tiba-tiba terlahir kembali sebagai Arthur Leywin di dunia baru yang dipenuhi sihir dan monster.",
    coverImage: "https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx111867-bW0389196KqP.jpg",
    genres: ["Action", "Adventure", "Fantasy"],
    chapters: null,
    status: "RELEASING",
    siteUrl: "https://anilist.co/manga/111867"
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

export async function searchManhwaRealtime({ query = '', genres = [], sort = 'POPULARITY_DESC' }) {
  const cleanQ = (query || '').trim();
  const selectedGenres = Array.isArray(genres) ? genres.filter(Boolean) : [];

  // 1. Coba langsung fetch ke AniList GraphQL API dari client (dukung CORS publik)
  try {
    const gqlQuery = `
      query ($search: String, $genres: [String], $type: MediaType, $sort: [MediaSort]) {
        Page(page: 1, perPage: 40) {
          media(search: $search, genre_in: $genres, type: $type, countryOfOrigin: "KR", sort: $sort) {
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
      type: 'MANGA',
      sort: [sort]
    };
    if (cleanQ) variables.search = cleanQ;
    if (selectedGenres.length > 0) variables.genres = selectedGenres;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ query: gqlQuery, variables }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const json = await res.json();
      const list = json?.data?.Page?.media;
      if (Array.isArray(list) && list.length > 0) {
        // Jika ada filter multi-genre, prioritaskan manhwa yang mengandung kombinasi genre
        let filteredList = list;
        if (selectedGenres.length > 1) {
          const matchedCombo = list.filter(item => {
            const itemGenres = item.genres || [];
            return selectedGenres.every(g => itemGenres.includes(g));
          });
          if (matchedCombo.length > 0) {
            filteredList = matchedCombo;
          } else {
            // Urutkan berdasarkan jumlah kecocokan genre kombinasi tertinggi
            filteredList = [...list].sort((a, b) => {
              const aCount = (a.genres || []).filter(g => selectedGenres.includes(g)).length;
              const bCount = (b.genres || []).filter(g => selectedGenres.includes(g)).length;
              return bCount - aCount;
            });
          }
        }

        return filteredList.map(item => ({
          id: item.id,
          title: {
            english: item.title?.english || item.title?.romaji || 'Manhwa',
            romaji: item.title?.romaji || item.title?.english || 'Romaji',
            native: item.title?.native || ''
          },
          score: typeof item.averageScore === 'number' ? parseFloat((item.averageScore / 10).toFixed(1)) : 8.5,
          description: cleanHtmlTags(item.description) || 'Sinopsis belum tersedia.',
          coverImage: item.coverImage?.extraLarge || item.coverImage?.large || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop&q=80',
          genres: item.genres || [],
          chapters: item.chapters || null,
          format: item.format || 'MANGA',
          status: item.status || 'RELEASING',
          siteUrl: item.siteUrl || `https://anilist.co/manga/${item.id}`
        }));
      }
    }
  } catch (err) {
    console.warn('[ManhwaService] Direct AniList fetch warning, trying local fallback:', err.message);
  }

  // 2. Fallback cerdas: Saring basis data kurasi lokal berdasarkan teks dan kombinasi genre
  let results = [...CURATED_MANHWA_DATA];

  if (cleanQ) {
    const qLower = cleanQ.toLowerCase();
    results = results.filter(item => {
      return (
        item.title.english.toLowerCase().includes(qLower) ||
        item.title.romaji.toLowerCase().includes(qLower) ||
        item.description.toLowerCase().includes(qLower)
      );
    });
  }

  if (selectedGenres.length > 0) {
    // Cari yang cocok dengan kombinasi genre atau setidaknya salah satu genre
    const strictMatches = results.filter(item => {
      return selectedGenres.every(g => item.genres.includes(g));
    });

    if (strictMatches.length > 0) {
      results = strictMatches;
    } else {
      results = results.filter(item => {
        return selectedGenres.some(g => item.genres.includes(g));
      });
    }
  }

  // Pengurutan
  if (sort === 'SCORE_DESC') {
    results.sort((a, b) => b.score - a.score);
  }

  return results.length > 0 ? results : CURATED_MANHWA_DATA;
}
