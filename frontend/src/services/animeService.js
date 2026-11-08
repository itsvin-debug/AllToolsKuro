/**
 * frontend/src/services/animeService.js
 * Layanan pencarian dan rekomendasi anime real-time.
 * Menghubungkan langsung ke AniList GraphQL API dengan fallback cerdas berbasis kombinasi genre.
 */

export const CURATED_ANIME_DATA = [
  {
    id: 154587,
    title: {
      english: "Frieren: Beyond Journey's End",
      romaji: "Sousou no Frieren",
      native: "葬送のフリーレン"
    },
    score: 9.1,
    description: "Setelah perjalanan sepuluh tahun mengalahkan Raja Iblis, penyihir elf Frieren harus menghadapi kenyataan kefanaan rekan-rekannya, memulai pengembaraan baru untuk memahami arti waktu dan hubungan manusia.",
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
    description: "Kilas balik masa remaja Gojo Satoru dan Geto Suguru di SMA Jujutsu, dilanjutkan dengan insiden Shibuya yang mengubah tatanan dunia penyihir selamanya.",
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
    description: "Mata-mata ulung Twilight harus membangun keluarga samaran demi misi perdamaian dunia, tanpa mengetahui bahwa sang istri adalah pembunuh bayaran dan anak angkatnya adalah cenayang telepati.",
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
    description: "Hitori Gotoh, gadis pemalu dengan kecemasan sosial yang jago bermain gitar di kamar, tiba-tiba diajak bergabung ke grup band Kessoku Band dan memulai perjalanan musiknya di panggung nyata.",
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
  },
  {
    id: 101922,
    title: {
      english: "Demon Slayer: Kimetsu no Yaiba",
      romaji: "Kimetsu no Yaiba",
      native: "鬼滅の刃"
    },
    score: 8.5,
    description: "Tanjiro Kamado bertekad menjadi pembasmi iblis untuk membalaskan dendam keluarganya dan mengembalikan adiknya, Nezuko, yang telah berubah menjadi iblis, kembali menjadi manusia.",
    coverImage: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx101922-WBsBlCoPuQ75.jpg",
    genres: ["Action", "Adventure", "Fantasy", "Supernatural"],
    episodes: 26,
    status: "FINISHED",
    siteUrl: "https://anilist.co/anime/101922"
  },
  {
    id: 16498,
    title: {
      english: "Attack on Titan",
      romaji: "Shingeki no Kyojin",
      native: "進撃の巨人"
    },
    score: 8.5,
    description: "Setelah kampung halamannya dihancurkan oleh para Raksasa pemakan manusia, Eren Yeager bersumpah membersihkan bumi dari semua raksasa dengan bergabung ke Pasukan Pengintai.",
    coverImage: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx16498-C6FPmWm59CyP.jpg",
    genres: ["Action", "Drama", "Fantasy", "Mystery"],
    episodes: 25,
    status: "FINISHED",
    siteUrl: "https://anilist.co/anime/16498"
  },
  {
    id: 127230,
    title: {
      english: "Chainsaw Man",
      romaji: "Chainsaw Man",
      native: "チェンソーマン"
    },
    score: 8.4,
    description: "Denji yang terlilit hutang ayahnya hidup bersama iblis gergaji Pochita. Setelah dikhianati dan dibunuh yakuza, Pochita melebur dengan jantung Denji, melahirkan manusia iblis gergaji legendaris.",
    coverImage: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx127230-NuQyuwhmZDe4.png",
    genres: ["Action", "Comedy", "Drama", "Supernatural"],
    episodes: 12,
    status: "FINISHED",
    siteUrl: "https://anilist.co/anime/127230"
  },
  {
    id: 21827,
    title: {
      english: "Violet Evergarden",
      romaji: "Violet Evergarden",
      native: "ヴァイオレット・エヴァーガーデン"
    },
    score: 8.6,
    description: "Mantan prajurit anak bernama Violet Evergarden mulai bekerja sebagai 'Auto Memory Doll', menulis surat untuk menyalurkan perasaan orang lain sembari mencari arti kata 'Aku mencintaimu' dari Mayor Gilbert.",
    coverImage: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21827-vEflrqP0BwtD.jpg",
    genres: ["Drama", "Fantasy", "Slice of Life"],
    episodes: 13,
    status: "FINISHED",
    siteUrl: "https://anilist.co/anime/21827"
  },
  {
    id: 101921,
    title: {
      english: "Kaguya-sama: Love is War",
      romaji: "Kaguya-sama wa Kokurasetai",
      native: "かぐや様は告らせたい～天才たちの恋愛頭脳戦～"
    },
    score: 8.4,
    description: "Dua elit jenius di Akademi Shuchiin, Miyuki Shirogane dan Kaguya Shinomiya, saling menyukai namun harga diri mereka yang tinggi memicu perang kecerdasan: siapa yang menyatakan cinta duluan, dialah yang kalah!",
    coverImage: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx101921-VvdGQyN1vU2P.jpg",
    genres: ["Comedy", "Psychological", "Romance", "Slice of Life"],
    episodes: 12,
    status: "FINISHED",
    siteUrl: "https://anilist.co/anime/101921"
  },
  {
    id: 126130,
    title: {
      english: "Cyberpunk: Edgerunners",
      romaji: "Cyberpunk: Edgerunners",
      native: "サイバーパンク エッジランナーズ"
    },
    score: 8.6,
    description: "Di kota masa depan Night City yang terobsesi dengan teknologi dan modifikasi tubuh, David Martinez kehilangan segalanya dan memilih bertahan hidup sebagai 'Edgerunner' — tentara bayaran kriminal.",
    coverImage: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx126130-i4t65gRk8xV5.jpg",
    genres: ["Action", "Drama", "Sci-Fi"],
    episodes: 10,
    status: "FINISHED",
    siteUrl: "https://anilist.co/anime/126130"
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

export async function searchAnimeRealtime({ query = '', genres = [], sort = 'POPULARITY_DESC' }) {
  const cleanQ = (query || '').trim();
  const selectedGenres = Array.isArray(genres) ? genres.filter(Boolean) : [];

  // 1. Coba langsung fetch ke AniList GraphQL API dari client (dukung CORS publik)
  try {
    const gqlQuery = `
      query ($search: String, $genres: [String], $type: MediaType, $sort: [MediaSort]) {
        Page(page: 1, perPage: 40) {
          media(search: $search, genre_in: $genres, type: $type, sort: $sort) {
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
      type: 'ANIME',
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
        // Jika ada filter multi-genre, prioritaskan anime yang mengandung kombinasi genre
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
            english: item.title?.english || item.title?.romaji || 'Anime',
            romaji: item.title?.romaji || item.title?.english || 'Romaji',
            native: item.title?.native || ''
          },
          score: typeof item.averageScore === 'number' ? parseFloat((item.averageScore / 10).toFixed(1)) : 8.5,
          description: cleanHtmlTags(item.description) || 'Sinopsis belum tersedia.',
          coverImage: item.coverImage?.extraLarge || item.coverImage?.large || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop&q=80',
          genres: item.genres || [],
          episodes: item.episodes || null,
          format: item.format || 'TV',
          status: item.status || 'FINISHED',
          siteUrl: item.siteUrl || `https://anilist.co/anime/${item.id}`
        }));
      }
    }
  } catch (err) {
    console.warn('[AnimeService] Direct AniList fetch warning, trying local fallback:', err.message);
  }

  // 2. Fallback cerdas: Saring basis data kurasi lokal berdasarkan teks dan kombinasi genre
  let results = [...CURATED_ANIME_DATA];

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

  return results.length > 0 ? results : CURATED_ANIME_DATA;
}
