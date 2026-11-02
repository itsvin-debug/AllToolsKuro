// api/chat.js - Vercel Serverless Endpoint untuk AI Kuro (Persona Elaina)

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
      'capcut jj', 'sound jedag', 'jedag-jedug', 'preset am', 'jedug'
    ],
    desc: 'Fitur Cari Link JJ untuk menemukan ribuan sound jedag-jedug viral, preset Alight Motion, dan backsound tren terbaru dengan tautan langsung siap pakai.'
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
  }
};

const TOUR_ORDER = [
  'downloader', 'jjFinder', 'pngToPdf', 'linkToDoc',
  'imageToLink', 'compressor', 'qrStudio', 'audioMerger',
  'photoStudio', 'videoStudio', 'videoTrimmer', 'bgRemover'
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

function detectToolMention(text) {
  const clean = text.toLowerCase();
  for (const [toolId, toolData] of Object.entries(KURO_TOOLS)) {
    if (clean.includes(toolData.name.toLowerCase())) {
      return toolId;
    }
    for (const kw of toolData.keywords) {
      const regex = new RegExp(`(^|\\s)${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`, 'i');
      if (regex.test(clean) || clean.includes(kw)) {
        return toolId;
      }
    }
  }
  return null;
}

// Deteksi topik yang BENAR-BENAR di luar konteks web
function isStrictlyOutOfTopic(text) {
  const clean = text.toLowerCase();
  
  // Jika teks menyebutkan web, kuro, fitur, alat, download, video, foto, audio, pdf, dll. -> BUKAN luar topik!
  const webKeywords = [
    'web', 'website', 'kuro', 'studio', 'fitur', 'alat', 'tool', 'menu', 
    'download', 'unduh', 'video', 'foto', 'gambar', 'musik', 'sound', 
    'lagu', 'pdf', 'ppt', 'doc', 'link', 'qr', 'barcode', 'kompres', 
    'potong', 'trim', 'background', 'transparan', 'jedag', 'jj', 'preset',
    'status wa', 'sw', 'anti burik', 'gratis', 'cara pakai', 'panduan'
  ];
  if (webKeywords.some(kw => clean.includes(kw))) {
    return false;
  }

  const outPatterns = [
    /\bresep\b/i, /\bmasak\b/i, /\bpolitik\b/i, /\bpresiden\b/i,
    /\bmatematika\b/i, /\brumus\b/i, /\bsejarah\b/i, /\bagama\b/i,
    /\bcuaca\b/i, /\bramalan\b/i, /\bzodiak\b/i, /\bpuisi cinta\b/i,
    /\bkimia\b/i, /\bfisika\b/i, /\bbiologi\b/i, /\bsepak bola\b/i,
    /\bpertandingan\b/i, /\bklasemen\b/i, /\bgosip\b/i
  ];
  return outPatterns.some(p => p.test(clean));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(200).json({ status: 'online', service: 'AI Kuro Chatbot Engine' });
  }

  try {
    const { message = '', history = [] } = req.body || {};
    const cleanMsg = message.trim();
    const lowerMsg = cleanMsg.toLowerCase();

    // 1. Deteksi Permintaan Tour Berkelanjutan (Sequence Tour)
    const isTourRequest = /\b(tour|tur|keliling|panduan lengkap|semua fitur|jelaskan semua|demo semua)\b/i.test(lowerMsg);
    if (isTourRequest) {
      const first = TOUR_ORDER[0];
      return res.status(200).json({
        reply: 'Fufufu~ Pilihan tepat! Aku akan mengajakmu berkeliling melihat dan memahami seluruh 12 fitur hebat di Kuro Studio satu per satu. Ayo ikuti aku!',
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

    // 2. Deteksi Pertanyaan Umum Seputar Fitur Web ("jelasin fitur web ini", "fitur apa aja", "kuro studio ini apa")
    const isGeneralWebFeaturesQuery = (
      lowerMsg.includes('jelasin fitur') ||
      lowerMsg.includes('jelaskan fitur') ||
      lowerMsg.includes('fitur web') ||
      lowerMsg.includes('fitur website') ||
      lowerMsg.includes('fitur apa') ||
      lowerMsg.includes('apa saja fitur') ||
      lowerMsg.includes('ada fitur apa') ||
      lowerMsg.includes('menu apa') ||
      lowerMsg.includes('alat apa') ||
      lowerMsg.includes('web ini tentang apa') ||
      lowerMsg.includes('web ini buat apa') ||
      lowerMsg.includes('kuro studio ini apa') ||
      lowerMsg.includes('bisa apa aja') ||
      lowerMsg.includes('daftar fitur') ||
      lowerMsg.includes('katalog')
    );

    if (isGeneralWebFeaturesQuery) {
      const overviewText = 
        'Fufufu~ Tentu saja! Kuro Studio (AllToolsKuro) punya 12 fitur hebat serbaguna yang terbagi dalam 4 kategori utama:\n\n' +
        '1. Media & Audio: Media Downloader (Unduh video 4K & 1080p Status WA Anti-Burik tanpa watermark dari TikTok, IG, YT), Cari Link JJ (Preset AM & Sound viral), dan Audio Merger.\n\n' +
        '2. Dokumen & Cloud: PNG to PDF (Satukan banyak foto jadi PDF rapi), Link to PDF/PPT (Ekstrak materi Scribd & SlideShare), dan File ke Link (Hosting gambar instan jadi tautan publik).\n\n' +
        '3. Studio Kreatif & AI: Hapus Background AI (PNG transparan 1-klik), QR Code Studio (Kode QR neobrutalist dengan logo), dan Photo Studio.\n\n' +
        '4. Editor Video & Media: Kompres Media HD (Kecilkan file video/foto tanpa burik), Video Studio, dan Video Trimmer.\n\n' +
        'Kamu bisa klik tombol Tour Web di atas untuk panduan interaktif, atau sebutkan fitur yang ingin kamu coba!';

      return res.status(200).json({
        reply: overviewText,
        is_valid_context: true,
        isValidContext: true,
        animation: 'talking',
        action: 'none',
        target_tool: null,
        targetTool: null,
        target_element: null,
        targetElement: null
      });
    }

    // 3. Deteksi Pertanyaan Cara Pakai / Panduan Website
    const isGuidanceQuery = (
      lowerMsg.includes('cara pakai') ||
      lowerMsg.includes('cara menggunakan') ||
      lowerMsg.includes('gimana cara') ||
      lowerMsg.includes('panduan') ||
      lowerMsg.includes('bingung')
    );

    if (isGuidanceQuery && !detectToolMention(lowerMsg)) {
      const guideText = 
        'Caranya sangat mudah! Kamu cukup pilih salah satu dari 12 kartu alat di halaman utama Kuro Studio:\n' +
        '• Mau unduh video? Klik Media Downloader lalu tempel tautan video dari TikTok, IG, atau YT.\n' +
        '• Mau satukan foto jadi dokumen? Klik PNG to PDF.\n' +
        '• Mau hilangkan latar foto? Klik Hapus Background.\n' +
        '• Mau bikin kode barcode? Klik QR Code Studio.\n\n' +
        'Atau klik tombol Tour Web di kanan atas, dan aku akan mengajakmu berkeliling melihat cara kerja tiap fiturnya!';

      return res.status(200).json({
        reply: guideText,
        is_valid_context: true,
        isValidContext: true,
        animation: 'talking',
        action: 'none',
        target_tool: null,
        targetTool: null,
        target_element: null,
        targetElement: null
      });
    }

    // 4. Deteksi Pertanyaan Biaya / Gratis
    if (lowerMsg.includes('gratis') || lowerMsg.includes('bayar') || lowerMsg.includes('biaya') || lowerMsg.includes('langganan') || lowerMsg.includes('tarif')) {
      return res.status(200).json({
        reply: 'Semua 12 fitur di Kuro Studio 100% gratis tanpa biaya langganan apapun! Kamu bebas download video, convert dokumen, kompres file, hingga edit media sepuasnya tanpa watermark fufufu~',
        is_valid_context: true,
        isValidContext: true,
        animation: 'talking',
        action: 'none',
        target_tool: null,
        targetTool: null,
        target_element: null,
        targetElement: null
      });
    }

    // 5. Deteksi Pertanyaan Khusus Status WA Anti-Burik
    if (lowerMsg.includes('status wa') || lowerMsg.includes('sw') || lowerMsg.includes('anti burik') || lowerMsg.includes('tidak burik') || lowerMsg.includes('biar jernih')) {
      const dl = KURO_TOOLS['downloader'];
      return res.status(200).json({
        reply: 'Fufufu~ Khusus untuk Status WhatsApp, fitur Media Downloader kami menyediakan resolusi khusus 1080p Status WA Anti-Burik! Sistem mengoptimalkan bitrate agar video tidak dikompres pecah saat diunggah ke status WhatsApp.',
        is_valid_context: true,
        isValidContext: true,
        animation: 'talking',
        action: 'navigate_tool',
        target_tool: 'downloader',
        targetTool: 'downloader',
        target_element: dl.element_id,
        targetElement: dl.element_id
      });
    }

    // 6. Deteksi Fitur Spesifik (Auto-Scroll & Panduan Tool)
    const targetToolId = detectToolMention(lowerMsg);
    if (targetToolId) {
      const tool = KURO_TOOLS[targetToolId];
      return res.status(200).json({
        reply: `Tentu saja! Ini dia fitur ${tool.name}. ${tool.desc} Kamu bisa langsung menggunakannya sekarang!`,
        is_valid_context: true,
        isValidContext: true,
        animation: 'talking',
        action: 'navigate_tool',
        target_tool: targetToolId,
        targetTool: targetToolId,
        target_element: tool.element_id,
        targetElement: tool.element_id,
        tour_sequence: null,
        tourSequence: null
      });
    }

    // 7. Sapaan & Identitas
    if (['halo', 'hai', 'hi', 'salam', 'pagi', 'siang', 'malam', 'assalamualaikum'].some(k => lowerMsg.includes(k))) {
      return res.status(200).json({
        reply: 'Halo! Aku AI Kuro, penyihir asisten terhebat yang siap membantumu menjelajahi setiap sudut website Kuro ini! Mau tahu fitur apa hari ini?',
        is_valid_context: true,
        isValidContext: true,
        animation: 'wave',
        action: 'none',
        target_tool: null,
        targetTool: null,
        target_element: null,
        targetElement: null
      });
    }

    if (['siapa kamu', 'nama kamu', 'siapa kuro', 'tentang kamu', 'asal usulmu'].some(k => lowerMsg.includes(k))) {
      return res.status(200).json({
        reply: 'Namaku AI Kuro! Penyihir asisten cerdas yang terinspirasi dari sang pengelana hebat Elaina. Tugas utamaku adalah memastikan pengalamanmu di Kuro Studio menyenangkan dan tanpa kendala!',
        is_valid_context: true,
        isValidContext: true,
        animation: 'wave',
        action: 'none',
        target_tool: null,
        targetTool: null,
        target_element: null,
        targetElement: null
      });
    }

    // 8. Guardrails KETAT: Tolak HANYA jika pertanyaan benar-benar di luar konteks website
    if (isStrictlyOutOfTopic(lowerMsg)) {
      return res.status(200).json({
        reply: 'Maaf ya, Kuro hanya bisa membantu menjawab hal seputar fitur, alat, dan panduan penggunaan website Kuro Studio! Fufufu~ Coba tanyakan seputar 12 fitur hebat kami!',
        is_valid_context: false,
        isValidContext: false,
        animation: 'confused',
        action: 'none',
        target_tool: null,
        targetTool: null,
        target_element: null,
        targetElement: null
      });
    }

    // 9. Respon Default yang Ramah & Menjelaskan Fitur (BUKAN Menolak)
    return res.status(200).json({
      reply: 'Ada yang bisa Kuro bantu seputar website Kuro Studio? Kamu bisa tanyakan cara penggunaan 12 alat kami (seperti Media Downloader, PNG to PDF, Hapus Background, QR Studio) atau klik tombol Tour Web untuk berkeliling otomatis!',
      is_valid_context: true,
      isValidContext: true,
      animation: 'talking',
      action: 'none',
      target_tool: null,
      targetTool: null,
      target_element: null,
      targetElement: null
    });

  } catch (err) {
    return res.status(500).json({
      reply: 'Maaf, terjadi gangguan sesaat pada mantra sihirku. Coba tanyakan lagi ya!',
      is_valid_context: false,
      isValidContext: false,
      animation: 'confused',
      action: 'none'
    });
  }
}
