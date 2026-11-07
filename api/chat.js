// api/chat.js - Vercel Serverless Endpoint untuk KuroBot (Maskot & Asisten AI AllToolsKuro)

const KURO_TOOLS = {
  downloader: {
    id: 'downloader',
    name: 'Media Downloader',
    element_id: 'tool-downloader',
    keywords: [
      'download', 'downloader', 'unduh', 'tiktok', 'instagram', 'youtube', 'ig', 'yt', 
      'video', 'sw', 'story', 'status wa', 'sound', 'musik', 'lagu tiktok', 'audio tiktok',
      'slide tiktok', 'foto tiktok', 'anti burik'
    ],
    desc: 'Media Downloader serbaguna untuk mengunduh video, foto slide album, dan audio MP3 tanpa watermark dari berbagai platform (TikTok, IG, YT, dll.) dengan kualitas hingga 4K dan optimasi 1080p Status WA Anti-Burik.'
  },
  jjFinder: {
    id: 'jjFinder',
    name: 'Cari Link JJ',
    element_id: 'tool-jjFinder',
    keywords: [
      'jj', 'jedag jedug', 'sound jj', 'preset', 'remix', 'am', 'alight motion', 
      'capcut jj', 'sound jedag', 'jedag-jedug', 'preset am', 'jedug', 'capcut',
      'template capcut', 'xml', 'xml google drive', 'preset alight motion'
    ],
    desc: 'Fitur Cari Link JJ untuk menemukan ribuan sound jedag-jedug viral, template CapCut, preset Alight Motion, dan file XML Google Drive siap pakai untuk konten kreatifmu.'
  },
  pngToPdf: {
    id: 'pngToPdf',
    name: 'PNG to PDF',
    element_id: 'tool-pngToPdf',
    keywords: [
      'png to pdf', 'gambar ke pdf', 'foto ke pdf', 'convert pdf', 'satukan gambar', 
      'gabung foto jadi pdf', 'jpg to pdf', 'pdf foto', 'bikin pdf dari foto'
    ],
    desc: 'Alat untuk menggabungkan banyak gambar atau foto (PNG/JPG) menjadi satu dokumen PDF berkualitas tinggi secara cepat dan teratur.'
  },
  linkToDoc: {
    id: 'linkToDoc',
    name: 'Link to PDF/PPT',
    element_id: 'tool-linkToDoc',
    keywords: [
      'link to doc', 'link to pdf', 'link to ppt', 'scribd', 'slideshare', 'dokumen', 
      'presentasi', 'ekstrak dokumen', 'unduh scribd', 'download slideshare', 'link doc'
    ],
    desc: 'Konverter dokumen online yang mengekstrak materi kuliah, slide presentasi, atau dokumen dari Scribd dan SlideShare menjadi file PDF atau PPT utuh langsung dari tautan web.'
  },
  imageToLink: {
    id: 'imageToLink',
    name: 'File ke Link',
    element_id: 'tool-imageToLink',
    keywords: [
      'image to link', 'file ke link', 'upload gambar', 'hosting gambar', 'url foto', 
      'link gambar', 'jadikan link', 'ubah foto jadi link', 'hosting foto'
    ],
    desc: 'Layanan hosting instan untuk mengubah file foto atau gambar lokal menjadi URL tautan web publik yang dapat langsung dibagikan ke mana saja.'
  },
  compressor: {
    id: 'compressor',
    name: 'Kompres Media HD',
    element_id: 'tool-compressor',
    keywords: [
      'kompres', 'compress', 'compressor', 'kecilkan ukuran', 'hemat memori', 'video kecil', 
      'foto kecil', 'kompres video', 'kompres gambar', 'kecilkan file', 'hemat kuota'
    ],
    desc: 'Pengompres media cerdas untuk merampingkan ukuran file video dan gambar secara drastis tanpa membuat tampilan visual burik atau pecah.'
  },
  qrStudio: {
    id: 'qrStudio',
    name: 'QR Code Studio',
    element_id: 'tool-qrStudio',
    keywords: [
      'qr', 'qrcode', 'barcode', 'qr studio', 'bikin qr', 'kode qr', 'scan', 
      'buat barcode', 'qr custom', 'desain qr'
    ],
    desc: 'QR Code Studio bernuansa neobrutalist untuk membuat kode QR estetik dengan logo kustom, pewarnaan fleksibel, dan resolusi tajam.'
  },
  audioMerger: {
    id: 'audioMerger',
    name: 'Audio Merger',
    element_id: 'tool-audioMerger',
    keywords: [
      'audio merger', 'gabung lagu', 'gabung audio', 'satukan musik', 'merge sound', 
      'sambung musik', 'gabung mp3', 'sambung lagu', 'kombinasi audio'
    ],
    desc: 'Alat penggabung beberapa trek audio menjadi satu kesatuan alunan musik yang mulus dengan transisi yang rapi.'
  },
  photoStudio: {
    id: 'photoStudio',
    name: 'Photo Studio',
    element_id: 'tool-photoStudio',
    keywords: [
      'photo studio', 'edit foto', 'filter foto', 'rotasi foto', 'editor gambar', 
      'efek foto', 'percantik foto', 'studio foto'
    ],
    desc: 'Studio kreasi foto untuk mempercantik foto dengan aneka filter neobrutalist, rotasi, penyesuaian kontras, dan efek artistik instan.'
  },
  videoStudio: {
    id: 'videoStudio',
    name: 'Video Studio',
    element_id: 'tool-videoStudio',
    keywords: [
      'video studio', 'edit video', 'filter video', 'kecepatan video', 'speed video', 
      'rasio video', 'studio video', 'ubah rasio video'
    ],
    desc: 'Studio pengeditan video dengan kontrol kecepatan pemutaran, rasio aspek (9:16, 16:9, 1:1), filter warna, dan pratinjau instan.'
  },
  videoTrimmer: {
    id: 'videoTrimmer',
    name: 'Video Trimmer',
    element_id: 'tool-videoTrimmer',
    keywords: [
      'trimmer', 'potong video', 'cut video', 'durasi video', 'trim video', 
      'pangkas video', 'pangkas durasi', 'cut durasi', 'potong detik'
    ],
    desc: 'Pemotong video presisi tinggi untuk memangkas detik awal atau akhir klip video secara akurat tanpa menurunkan kualitas aslinya.'
  },
  bgRemover: {
    id: 'bgRemover',
    name: 'Hapus Background',
    element_id: 'tool-bgRemover',
    keywords: [
      'bg remover', 'hapus background', 'hilangkan latar', 'background transparan', 
      'remove bg', 'transparan', 'hapus latar', 'potong background', 'bikin png transparan'
    ],
    desc: 'Penghapus latar belakang gambar berbasis AI yang memotong subjek foto utama secara rapi dan otomatis menjadi PNG transparan.'
  },
  resolver: {
    id: 'resolver',
    name: 'Safelink Bypasser & Link Resolver',
    element_id: 'tool-resolver',
    keywords: [
      'resolver', 'safelink', 'shortlink', 'bypass link', 'lewati link', 'buka link',
      'resolve link', 'ouo', 'bitly', 's.id', 'linkvertise', 'adf.ly', 'url resolver',
      'sfl', 'sfl.gl', 'safelinku', 'bypass', 'lewati safelink', 'mediafire link',
      'bypasser', 'link safelink', 'iklan link', 'lewati iklan', 'lewat link', 'safelink bypasser'
    ],
    desc: 'Fitur Safelink Bypasser untuk melewati safelink bertingkat (Sfl.gl, SafelinkU, Ouo, Bitly, dll), melewati hitungan waktu dan iklan membingungkan agar langsung mendapatkan link unduhan asli (Mediafire, Google Drive, Mega, dll) secara instan dan aman.'
  }
};

const TOUR_ORDER = [
  'downloader', 'jjFinder', 'pngToPdf', 'linkToDoc',
  'imageToLink', 'compressor', 'qrStudio', 'audioMerger',
  'photoStudio', 'videoStudio', 'videoTrimmer', 'bgRemover', 'resolver'
];

function cleanSpeechText(text) {
  if (!text) return '';
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .replace(/#{1,6}\s+/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
}

// Deteksi kata kasar, makian, ujaran kebencian, atau rasisme
function isProfaneOrAbusive(text) {
  const abusivePatterns = [
    /\b(nigga|nigger|negro|niggas|niggers|chink|spic|kike|faggot|retard)\b/i,
    /\b(anjing|asw|asu|babi|kontol|memek|jembut|peler|pepek|bangsat|bajingan|pantek|itil)\b/i,
    /\b(goblok|tolol|bego|idiot|bodoh|tai|taik|kampret|ngentot|ngentd|bokep|porno|sange|lonte|perek|jablay|bencong|banci)\b/i,
    /\b(fuck|shit|bitch|asshole|bastard|dick|pussy|cunt|motherfucker|whore|slut)\b/i
  ];
  return abusivePatterns.some(regex => regex.test(text));
}

// Deteksi teks acak atau simbol random tanpa arti (gibberish)
function isGibberishOrRandom(text) {
  const clean = text.trim();
  if (!clean || clean.length < 2) return true;

  // Hanya simbol berulang tanpa kata (contoh: ????, ....., !@#$)
  if (/^[^a-zA-Z0-9\s]+$/.test(clean)) return true;

  // Karakter berulang berlebihan (contoh: aaaaaaa, asdfgh, zzzzzz, wkwkwk tanpa konteks)
  if (/^(.)\1{4,}$/.test(clean)) return true;
  if (/^[b-df-hj-np-tv-z]{5,}$/i.test(clean)) return true;

  return false;
}

// Cek apakah pesan berkaitan langsung dengan ekosistem AllToolsKuro
function isAllToolsKuroTopic(text) {
  const clean = text.toLowerCase();

  const fullKeywords = [
    'kuro', 'kurobot', 'alltoolskuro', 'alltools', 'studio', 'fitur', 'alat', 'tool', 
    'menu', 'panduan', 'cara pakai', 'cara menggunakan', 'bantuan', 'tour', 'tur',
    'safelink', 'bypass', 'bypasser', 'sfl', 'sfl.gl', 'safelinku', 'ouo', 'bitly', 'shortlink', 'resolver',
    'capcut', 'template', 'template capcut', 'jedag jedug', 'jedag-jedug',
    'preset', 'alight motion', 'preset am', 'xml', 'google drive', 'drive xml',
    'download', 'downloader', 'unduh', 'tiktok', 'instagram', 'youtube', 'status wa', 'anti burik',
    'png to pdf', 'pdf', 'ppt', 'dokumen', 'scribd', 'slideshare', 'doc',
    'image to link', 'file ke link', 'kompres', 'compress', 'qrcode',
    'audio', 'musik', 'lagu', 'merger', 'photo studio', 'video studio', 'trimmer', 'potong video',
    'hapus background', 'bg remover', 'transparan', 'gratis', 'update', 'pembaruan', 'apk', 'aplikasi'
  ];

  // Kata kunci pendek wajib menggunakan word boundary agar tidak cocok dengan substring kata lain (misal "ig" di dalam "nigga")
  const shortKeywords = ['ig', 'yt', 'am', 'sw', 'jj', 'qr'];

  const hasFull = fullKeywords.some(kw => clean.includes(kw));
  if (hasFull) return true;

  return shortKeywords.some(kw => new RegExp(`\\b${kw}\\b`, 'i').test(clean));
}

function detectToolMention(text) {
  const clean = text.toLowerCase();
  for (const [toolId, toolData] of Object.entries(KURO_TOOLS)) {
    if (clean.includes(toolData.name.toLowerCase())) {
      return toolId;
    }
    for (const kw of toolData.keywords) {
      if (kw.length <= 3) {
        // Kata pendek wajib word boundary ketat
        if (new RegExp(`\\b${kw}\\b`, 'i').test(clean)) {
          return toolId;
        }
      } else {
        const regex = new RegExp(`(^|\\s)${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`, 'i');
        if (regex.test(clean) || clean.includes(kw)) {
          return toolId;
        }
      }
    }
  }
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(200).json({ status: 'online', service: 'KuroBot AI Assistant Engine' });
  }

  try {
    let rawBody = req.body;
    if (typeof rawBody === 'string') {
      try {
        rawBody = JSON.parse(rawBody);
      } catch {
        rawBody = {};
      }
    }

    const message = (rawBody && typeof rawBody === 'object' && typeof rawBody.message === 'string')
      ? rawBody.message
      : (req.query && typeof req.query.message === 'string' ? req.query.message : '');

    const cleanMsg = message.trim();
    const lowerMsg = cleanMsg.toLowerCase();

    // 1. FILTER KATA KASAR / MAKIAN / UJARAN KEBENCIAN
    if (isProfaneOrAbusive(lowerMsg)) {
      return res.status(200).json({
        reply: '? Maaf, kata-kata tersebut tidak pantas. Saya hanya asisten khusus untuk membantu fitur dan panduan navigasi di AllToolsKuro!',
        is_valid_context: false,
        isValidContext: false,
        animation: 'confused',
        action: 'none'
      });
    }

    // 2. FILTER TEKS ACAK / RANDOM GIBBERISH
    if (isGibberishOrRandom(cleanMsg)) {
      return res.status(200).json({
        reply: '? Maaf, saya tidak mengerti maksud Anda. Saya hanya asisten khusus untuk membantu fitur dan navigasi di AllToolsKuro!',
        is_valid_context: false,
        isValidContext: false,
        animation: 'confused',
        action: 'none'
      });
    }

    // 3. FILTER GUARDRAILS UTAMA: WAJIB TERIKAT DENGAN EKOSISTEM ALLTOOLSKURO
    if (!isAllToolsKuroTopic(lowerMsg)) {
      return res.status(200).json({
        reply: '? Eh? Pertanyaan di luar topik! Silakan tanyakan seputar fitur Safelink Bypasser, pencarian template CapCut, Preset Alight Motion, atau alat lainnya di AllToolsKuro saja ya.',
        is_valid_context: false,
        isValidContext: false,
        animation: 'confused',
        action: 'none'
      });
    }

    // 4. DETEKSI TOUR FITUR LENGKAP
    const isTourRequest = /\b(tour|tur|keliling|panduan lengkap|semua fitur|jelaskan semua|demo semua)\b/i.test(lowerMsg);
    if (isTourRequest) {
      const first = TOUR_ORDER[0];
      return res.status(200).json({
        reply: 'Fufufu~ Pilihan tepat! Saya akan memandu Anda melihat dan memahami seluruh 13 fitur hebat di AllToolsKuro satu per satu. Ayo ikuti saya!',
        is_valid_context: true,
        isValidContext: true,
        animation: 'talking',
        action: 'start_tour',
        target_tool: first,
        targetTool: first,
        target_element: `tool-${first}`,
        targetElement: `tool-${first}`,
        tour_sequence: TOUR_ORDER,
        tourSequence: TOUR_ORDER
      });
    }

    // 5. DETEKSI FITUR SPESIFIK: SAFELINK BYPASSER / RESOLVER
    if (lowerMsg.includes('safelink') || lowerMsg.includes('bypass') || lowerMsg.includes('shortlink') || lowerMsg.includes('sfl') || lowerMsg.includes('resolver')) {
      const tool = KURO_TOOLS['resolver'];
      return res.status(200).json({
        reply: `Tentu saja! Ini dia fitur ${tool.name}. ${tool.desc} Tempelkan tautan safelink Anda untuk langsung mendapatkan link unduhan asli tanpa iklan bertingkat!`,
        is_valid_context: true,
        isValidContext: true,
        animation: 'talking',
        action: 'navigate_tool',
        target_tool: 'resolver',
        targetTool: 'resolver',
        target_element: tool.element_id,
        targetElement: tool.element_id
      });
    }

    // 6. DETEKSI FITUR SPESIFIK: TEMPLATE CAPCUT / PRESET ALIGHT MOTION / XML GOOGLE DRIVE
    if (lowerMsg.includes('capcut') || lowerMsg.includes('alight motion') || lowerMsg.includes('xml') || lowerMsg.includes('preset') || lowerMsg.includes('jj') || lowerMsg.includes('jedag')) {
      const tool = KURO_TOOLS['jjFinder'];
      return res.status(200).json({
        reply: `Siap! Fitur ${tool.name} menyediakan ribuan template CapCut, preset Alight Motion (AM), dan berkas XML Google Drive serta sound jedag-jedug viral yang siap digunakan.`,
        is_valid_context: true,
        isValidContext: true,
        animation: 'talking',
        action: 'navigate_tool',
        target_tool: 'jjFinder',
        targetTool: 'jjFinder',
        target_element: tool.element_id,
        targetElement: tool.element_id
      });
    }

    // 7. DETEKSI FITUR LAINNYA DI KATALOG ALAT
    const targetToolId = detectToolMention(lowerMsg);
    if (targetToolId) {
      const tool = KURO_TOOLS[targetToolId];
      return res.status(200).json({
        reply: `Tentu! Ini dia fitur ${tool.name}. ${tool.desc} Anda bisa langsung menggunakannya sekarang!`,
        is_valid_context: true,
        isValidContext: true,
        animation: 'talking',
        action: 'navigate_tool',
        target_tool: targetToolId,
        targetTool: targetToolId,
        target_element: tool.element_id,
        targetElement: tool.element_id
      });
    }

    // 8. DETEKSI IDENTITAS KUROBOT
    if (lowerMsg.includes('siapa kamu') || lowerMsg.includes('kurobot') || lowerMsg.includes('nama kamu') || lowerMsg.includes('tentang kamu')) {
      return res.status(200).json({
        reply: 'Halo! Saya adalah KuroBot, maskot dan asisten AI resmi untuk aplikasi web AllToolsKuro. Tugas saya adalah membantu navigasi serta menjelaskan seluruh fitur utilitas hebat kami!',
        is_valid_context: true,
        isValidContext: true,
        animation: 'wave',
        action: 'none'
      });
    }

    // 9. DETEKSI PERTANYAAN UMUM FITUR / PANDUAN APLIKASI
    if (lowerMsg.includes('fitur') || lowerMsg.includes('alat') || lowerMsg.includes('bisa apa') || lowerMsg.includes('panduan') || lowerMsg.includes('cara')) {
      const overviewText = 
        'AllToolsKuro memiliki 13 fitur utilitas lengkap:\n' +
        '1. Media: Media Downloader (4K & 1080p Status WA Anti-Burik), Cari Link JJ (Template CapCut & Preset Alight Motion), dan Audio Merger.\n' +
        '2. Dokumen: Safelink Bypasser (Bypass link iklan Sfl.gl/SafelinkU ke direct link), PNG to PDF, Link to PDF/PPT (Scribd/SlideShare), dan File ke Link.\n' +
        '3. Studio & Visual: Hapus Background AI, QR Code Studio, Photo Studio, Video Studio, Kompres Media HD, dan Video Trimmer.\n\n' +
        'Fitur mana yang ingin Anda gunakan hari ini?';

      return res.status(200).json({
        reply: overviewText,
        is_valid_context: true,
        isValidContext: true,
        animation: 'talking',
        action: 'none'
      });
    }

    // 10. JIKA TIDAK ADA INTENSI SPESIFIK YANG COCOK, TOLAK DENGAN TANDA TANYA
    return res.status(200).json({
      reply: '? Maaf, saya tidak mengerti maksud Anda. Saya hanya asisten khusus untuk membantu fitur dan navigasi di AllToolsKuro!',
      is_valid_context: false,
      isValidContext: false,
      animation: 'confused',
      action: 'none'
    });

  } catch (err) {
    return res.status(200).json({
      reply: '? Maaf, terjadi kendala teknis sesaat. Silakan tanyakan kembali seputar fitur AllToolsKuro!',
      error: err.message,
      is_valid_context: false,
      isValidContext: false,
      animation: 'confused',
      action: 'none'
    });
  }
}
