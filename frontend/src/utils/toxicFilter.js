// Modul deteksi bahasa kasar, makian, & kata toxic (KBBI, Daerah, & Internasional)

// Daftar kata aman yang sering memicu false positive
const SAFE_WHITELIST = new Set([
  'class', 'classes', 'bypass', 'bypasser', 'pass', 'password', 'asset', 'assets',
  'analisis', 'analisa', 'analitik', 'analytics', 'analysis',
  'titik', 'konten', 'kontak', 'bantuan', 'assalamualaikum', 'situs',
  'dokumen', 'format', 'materi', 'kompres', 'kompresor', 'koleksi',
  'informasi', 'bakar', 'berakar', 'asumsi', 'otak', 'mata', 'pahat',
  'pantai', 'pantau', 'pemberian', 'berita', 'berbagi', 'kucing', 'kelinci',
  'bebek', 'ayam', 'kuda', 'sapi', 'kambing', 'pembantu'
]);

// Kamus kata kasar multi-kategori
const TOXIC_PATTERNS = [
  // 1. KBBI, Slang Indonesia, & Makian Umum
  'anjing', 'anj', 'anjr', 'anjir', 'anjg', 'asu', 'asw', 'babi', 'bangsat', 'bgst', 'bngst',
  'bajingan', 'brengsek', 'kontol', 'kontl', 'kntl', 'memek', 'mmk', 'ngentot', 'ngntt', 'ngtd',
  'ngentd', 'entot', 'pepek', 'peler', 'jembut', 'pecun', 'lonte', 'perek', 'pelacur', 'jalang',
  'sundal', 'keparat', 'sialan', 'bangke', 'tolol', 'goblok', 'gblk', 'bodoh', 'bodo', 'bego',
  'dongo', 'dungu', 'idiot', 'cacat', 'najis', 'laknat', 'biadab', 'bedebah', 'tai', 'taik',
  'tahi', 'berak', 'bacot', 'bacod', 'bct', 'cocot', 'congor', 'cangkem', 'pantek', 'puki',
  'pukimak', 'kimak', 'bencong', 'banci', 'mampus', 'modar', 'mati aja', 'setan', 'iblis',
  'jahanam', 'itil', 'tetek', 'toket', 'penis', 'vagina', 'kelamin', 'bokep', 'porno', 'sange', 'jablay',

  // 2. Bahasa Daerah (Jawa, Sunda, Batak, Minang, Makassar, Bali, dll.)
  'jancok', 'jancuk', 'dancok', 'cok', 'cuk', 'matamu', 'ndasmu', 'gatel', 'gateli', 'kirek',
  'celeng', 'wedhus', 'bajigur', 'taek', 'mbokne ancok', 'picek', 'budek', 'edan', 'gemblung',
  'pekok', 'kopok', 'goblog', 'belegug', 'koplok', 'anying', 'kehed', 'kunyuk', 'monyet',
  'bagong', 'heunceut', 'kanjut', 'ngewe', 'jurig', 'borokokok', 'lancau', 'lanciao', 'cibai',
  'cuki', 'cukimai', 'kampret', 'sompret', 'geblek', 'sinting', 'sarap', 'sundala', 'telaso',
  'laso', 'kongkong', 'pepe', 'tete', 'ngana pe puki', 'cicing', 'naskleng', 'nasbedag', 'sundel',

  // 3. Internasional: Inggris
  'fuck', 'fck', 'fuk', 'fucking', 'fucker', 'motherfucker', 'mfer', 'shit', 'sh1t', 'bullshit',
  'bitch', 'btch', 'bitches', 'asshole', 'a55hole', 'bastard', 'dick', 'cock', 'pussy', 'cunt',
  'whore', 'slut', 'nigga', 'nigger', 'negro', 'retard', 'moron', 'dumbass', 'jackass', 'stfu',
  'gtfo', 'kys', 'suck my dick', 'wanker', 'twat', 'bollocks', 'prick', 'faggot', 'chink', 'spic', 'kike',

  // 4. Internasional: Jepang (Romaji & Kana)
  'kuso', 'baka', 'aho', 'shine', 'kisama', 'temee', 'yarou', 'chikusho', 'uzai', 'kimoi',
  'gomi', 'kutabare', 'busu', 'manko', 'chinko', 'くそ', 'ばか', '死ね',

  // 5. Internasional: Korea (Romaji & Hangul)
  'shibal', 'ssibal', 'sibal', 'gaesaekki', 'byeongsin', 'jiral', 'saekki', 'michin', 'nom',
  '씨발', '시발', '개새끼', '병신',

  // 6. Internasional: Spanyol, Prancis, Jerman, Rusia, Mandarin, dll.
  'puta', 'puto', 'pendejo', 'cabron', 'mierda', 'joder', 'maricon', 'merde', 'putain',
  'salope', 'connard', 'scheisse', 'arschloch', 'hurensohn', 'blyat', 'suka', 'cyka',
  'kurwa', 'cao ni ma', 'chao ni ma', 'kanina', 'knn', 'cb'
];

// Tabel konversi leetspeak
const LEET_MAP = {
  '0': 'o',
  '1': 'i',
  '!': 'i',
  '|': 'i',
  '3': 'e',
  '4': 'a',
  '@': 'a',
  '5': 's',
  '$': 's',
  '7': 't',
  '8': 'b'
};

/**
 * Normalisasi teks bertahap untuk mencegah teknik bypass (leetspeak, spasi/simbol penyamar, huruf ganda)
 */
export function normalizeText(raw) {
  if (!raw || typeof raw !== 'string') return '';

  let s = raw.toLowerCase().trim();

  // 1. Konversi leetspeak
  let leetReplaced = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    leetReplaced += LEET_MAP[ch] || ch;
  }
  s = leetReplaced;

  // 2. Gabungkan huruf terpisah spasi (contoh: a n j i n g -> anjing)
  s = s.replace(/\b([a-z0-9])(?:\s+([a-z0-9]))+\b/gi, (match) => match.replace(/\s+/g, ''));

  // 3. Hapus simbol pemisah di antara huruf alfabet (contoh: a.n.j.i.n.g, b-a-b-i, k_o_n_t_o_l)
  s = s.replace(/([a-z0-9])[\._\-\+\*\/\\~#@,;:]+(?=[a-z0-9])/gi, (match, p1) => p1);

  // 4. Kompresi huruf berulang 3+ menjadi 1 (contoh: anjiiiiing -> anjing, kontooool -> kontol)
  s = s.replace(/([a-z])\1{2,}/gi, (match, p1) => p1);

  return s;
}

/**
 * Memeriksa apakah teks mengandung kata kasar / makian
 * @param {string} text - Teks yang akan diperiksa
 * @returns {boolean} - true jika terdeteksi toxic
 */
export function isToxicText(text) {
  if (!text || typeof text !== 'string') return false;

  const rawLower = text.toLowerCase().trim();
  if (!rawLower) return false;

  // Whitelist kata tunggal
  const singleClean = rawLower.replace(/[^a-z0-9]/g, '');
  if (SAFE_WHITELIST.has(singleClean)) return false;

  // Tokenisasi kata normal untuk periksa whitelist utuh
  const rawWords = rawLower.split(/\s+/).map(w => w.replace(/[^a-z0-9]/g, ''));
  const allWhitelisted = rawWords.length > 0 && rawWords.every(w => !w || SAFE_WHITELIST.has(w));
  if (allWhitelisted) return false;

  // Teks hasil normalisasi
  const normalized = normalizeText(text);

  // Teks ultra-compressed (semua huruf ganda 2+ dikompresi menjadi 1)
  const ultraCompressed = normalized.replace(/([a-z])\1+/gi, (match, p1) => p1);

  for (const pattern of TOXIC_PATTERNS) {
    // Pola non-latin (Hangul, Kana, Kanji)
    if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/.test(pattern)) {
      if (rawLower.includes(pattern)) return true;
      continue;
    }

    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i');

    // 1. Cek pada teks normalisasi
    if (regex.test(normalized)) {
      let isSafe = false;
      for (const safe of SAFE_WHITELIST) {
        if (safe.includes(pattern) && normalized.includes(safe)) {
          isSafe = true;
          break;
        }
      }
      if (!isSafe) return true;
    }

    // 2. Cek pada teks ultra-compressed
    if (regex.test(ultraCompressed)) {
      let isSafe = false;
      for (const safe of SAFE_WHITELIST) {
        if (safe.includes(pattern) && ultraCompressed.includes(safe)) {
          isSafe = true;
          break;
        }
      }
      if (!isSafe) return true;
    }

    // 3. Cek pada raw lower jika pattern mengandung spasi (contoh: 'mati aja', 'suck my dick', 'cao ni ma', 'ngana pe puki')
    if (pattern.includes(' ') && rawLower.includes(pattern)) {
      return true;
    }
  }

  return false;
}

/**
 * Detail deteksi kata kasar
 */
export function checkProfanity(text) {
  const isToxic = isToxicText(text);
  return { isToxic };
}
