// api/chat.js - Vercel Serverless Endpoint untuk AI Kuro (Persona Elaina)

const KURO_TOOLS = {
  downloader: {
    id: 'downloader',
    name: 'Media Downloader',
    keywords: ['download', 'downloader', 'unduh', 'tiktok', 'instagram', 'youtube', 'ig', 'yt', 'video', 'sw', 'story', 'status wa', 'sound'],
    desc: 'Media Downloader serbaguna untuk mengunduh video, foto slide album, dan audio MP3 tanpa watermark dari berbagai platform (TikTok, IG, YT, dll.) dengan kualitas hingga 4K dan optimasi 1080p Status WA Anti-Burik.'
  },
  jjFinder: {
    id: 'jjFinder',
    name: 'Cari Link JJ',
    keywords: ['jj', 'jedag jedug', 'sound jj', 'preset', 'remix', 'am', 'alight motion', 'capcut jj'],
    desc: 'Fitur Cari Link JJ untuk menemukan sound jedag-jedug viral, preset Alight Motion, dan backsound kekinian dengan tautan langsung siap pakai.'
  },
  pngToPdf: {
    id: 'pngToPdf',
    name: 'PNG to PDF',
    keywords: ['png to pdf', 'gambar ke pdf', 'foto ke pdf', 'convert pdf', 'satukan gambar'],
    desc: 'Alat untuk menggabungkan banyak gambar atau foto (PNG/JPG) menjadi satu dokumen PDF berkualitas tinggi secara cepat dan teratur.'
  },
  linkToDoc: {
    id: 'linkToDoc',
    name: 'Link to PDF/PPT',
    keywords: ['link to doc', 'link to pdf', 'link to ppt', 'scribd', 'slideshare', 'dokumen', 'presentasi'],
    desc: 'Konverter dokumen online yang mengekstrak materi kuliah, slide presentasi, atau dokumen dari Scribd dan SlideShare menjadi file PDF atau PPT utuh.'
  },
  imageToLink: {
    id: 'imageToLink',
    name: 'File ke Link',
    keywords: ['image to link', 'file ke link', 'upload gambar', 'hosting gambar', 'url foto', 'link gambar'],
    desc: 'Layanan hosting instan untuk mengubah file foto atau gambar lokal menjadi URL tautan web publik yang dapat langsung dibagikan ke mana saja.'
  },
  compressor: {
    id: 'compressor',
    name: 'Kompres Media HD',
    keywords: ['kompres', 'compress', 'compressor', 'kecilkan ukuran', 'hemat memori', 'video kecil', 'foto kecil'],
    desc: 'Pengompres media cerdas untuk merampingkan ukuran file video dan gambar secara drastis tanpa membuat tampilan visual burik atau pecah.'
  },
  qrStudio: {
    id: 'qrStudio',
    name: 'QR Code Studio',
    keywords: ['qr', 'qrcode', 'barcode', 'qr studio', 'bikin qr', 'kode qr', 'scan'],
    desc: 'QR Code Studio bernuansa neobrutalist untuk membuat kode QR estetik dengan logo kustom, pewarnaan fleksibel, dan resolusi tajam.'
  },
  audioMerger: {
    id: 'audioMerger',
    name: 'Audio Merger',
    keywords: ['audio merger', 'gabung lagu', 'gabung audio', 'satukan musik', 'merge sound', 'sambung musik'],
    desc: 'Alat penggabung beberapa trek audio menjadi satu kesatuan alunan musik yang mulus dengan transisi yang rapi.'
  },
  photoStudio: {
    id: 'photoStudio',
    name: 'Photo Studio',
    keywords: ['photo studio', 'edit foto', 'filter foto', 'rotasi foto', 'editor gambar', 'efek foto'],
    desc: 'Studio kreasi foto untuk mempercantik foto dengan aneka filter neobrutalist, rotasi, penyesuaian kontras, dan efek artistik instan.'
  },
  videoStudio: {
    id: 'videoStudio',
    name: 'Video Studio',
    keywords: ['video studio', 'edit video', 'filter video', 'kecepatan video', 'speed video', 'rasio video'],
    desc: 'Studio pengeditan video dengan kontrol kecepatan pemutaran, rasio aspek (9:16, 16:9, 1:1), filter warna, dan pratinjau instan.'
  },
  videoTrimmer: {
    id: 'videoTrimmer',
    name: 'Video Trimmer',
    keywords: ['trimmer', 'potong video', 'cut video', 'durasi video', 'trim video', 'pangkas'],
    desc: 'Pemotong video presisi tinggi untuk memangkas detik awal atau akhir klip video secara akurat tanpa menurunkan kualitas aslinya.'
  },
  bgRemover: {
    id: 'bgRemover',
    name: 'Hapus Background',
    keywords: ['bg remover', 'hapus background', 'hilangkan latar', 'background transparan', 'remove bg', 'transparan'],
    desc: 'Penghapus latar belakang gambar berbasis AI yang memotong subjek foto utama secara rapi dan otomatis menjadi PNG transparan.'
  }
};

const TOUR_ORDER = [
  'downloader', 'jjFinder', 'pngToPdf', 'linkToDoc',
  'imageToLink', 'compressor', 'qrStudio', 'audioMerger',
  'photoStudio', 'videoStudio', 'videoTrimmer', 'bgRemover'
];

function detectToolMention(text) {
  const clean = text.toLowerCase();
  for (const [toolId, toolData] of Object.entries(KURO_TOOLS)) {
    if (clean.includes(toolData.name.toLowerCase())) {
      return toolId;
    }
    for (const kw of toolData.keywords) {
      const regex = new RegExp(`\\b${kw}\\b`, 'i');
      if (regex.test(clean)) {
        return toolId;
      }
    }
  }
  return null;
}

function isOutOfTopic(text) {
  const clean = text.toLowerCase();
  const outPatterns = [
    /\bresep\b/i, /\bmasak\b/i, /\bpolitik\b/i, /\bpresiden\b/i,
    /\bmatematika\b/i, /\brumus\b/i, /\bsejarah\b/i, /\bagama\b/i,
    /\bcuaca\b/i, /\bramalan\b/i, /\bzodiak\b/i, /\bpuisi cinta\b/i,
    /\bkimia\b/i, /\bfisika\b/i, /\bbiologi\b/i
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
    if (['tour', 'tur', 'semua fitur', 'jelaskan semua', 'keliling', 'panduan lengkap', 'apa saja fitur'].some(k => lowerMsg.includes(k))) {
      return res.status(200).json({
        reply: 'Fufufu~ Pilihan tepat! Aku akan mengajakmu berkeliling melihat dan memahami seluruh 12 fitur hebat di Kuro Studio satu per satu. Ayo ikuti aku!',
        animation: 'talking',
        action: 'start_tour',
        targetTool: TOUR_ORDER[0],
        tourSequence: TOUR_ORDER
      });
    }

    // 2. Guardrails Cepat: Tolak Topik di Luar Web Kuro
    if (isOutOfTopic(lowerMsg)) {
      return res.status(200).json({
        reply: 'Maaf ya, Kuro hanya bisa membantu menjelaskan seputar fitur-fitur dan cara penggunaan website ini! Fufufu~ Coba tanyakan salah satu dari 12 fitur hebat kami!',
        animation: 'confused',
        action: 'none',
        targetTool: null
      });
    }

    // 3. Deteksi Penjelasan Fitur Spesifik
    const targetToolId = detectToolMention(lowerMsg);
    const isExplanation = ['jelaskan', 'apa itu', 'cara pakai', 'bagaimana', 'bisa apa', 'fitur', 'fungsi'].some(k => lowerMsg.includes(k));

    const geminiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || process.env.AI_GEMINIKURO_KEY;

    if (geminiKey && geminiKey.startsWith('AIzaSy')) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [{ text: `Kamu adalah AI Kuro (persona Elaina dari Majo no Tabitabi), asisten cerdas, ramah, dan percaya diri khusus website Kuro Studio (AllToolsKuro). Jawab dalam format JSON murni: {"reply": "...", "animation": "wave|talking|confused|idle", "action": "none|navigate_tool|start_tour", "targetTool": "downloader|..."|null}. Pesan pengguna: ${cleanMsg}` }]
              }
            ],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.4,
              maxOutputTokens: 500
            }
          })
        });

        if (response.ok) {
          const data = await response.json();
          const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawText) {
            const parsed = JSON.parse(rawText.replace(/```json|```/g, '').trim());
            const act = parsed.action || (targetToolId && isExplanation ? 'navigate_tool' : 'none');
            return res.status(200).json({
              reply: parsed.reply || 'Halo! Ada yang bisa AI Kuro bantu seputar Kuro Studio?',
              animation: parsed.animation || 'talking',
              action: act,
              targetTool: parsed.targetTool || targetToolId || null,
              tourSequence: act === 'start_tour' ? TOUR_ORDER : null
            });
          }
        }
      } catch (err) {
        console.warn('[AI Kuro Vercel] Gemini fallback:', err.message);
      }
    }

    // 4. Fallback Terstruktur Berbasis Persona Elaina
    if (targetToolId) {
      const tool = KURO_TOOLS[targetToolId];
      return res.status(200).json({
        reply: `Tentu saja! Ini dia fitur **${tool.name}**. ${tool.desc} Kamu bisa langsung menggunakannya sekarang!`,
        animation: 'talking',
        action: 'navigate_tool',
        targetTool: targetToolId,
        tourSequence: null
      });
    }

    if (['halo', 'hai', 'hi', 'salam', 'pagi', 'siang', 'malam'].some(k => lowerMsg.includes(k))) {
      return res.status(200).json({
        reply: 'Halo! Aku AI Kuro, penyihir asisten terhebat yang siap membantumu menjelajahi setiap sudut website Kuro ini! Mau tahu fitur apa hari ini?',
        animation: 'wave',
        action: 'none',
        targetTool: null
      });
    }

    if (['siapa kamu', 'nama kamu', 'elaina', 'kuro'].some(k => lowerMsg.includes(k))) {
      return res.status(200).json({
        reply: 'Namaku AI Kuro! Penyihir asisten cerdas yang terinspirasi dari sang pengelana hebat Elaina. Tugas utamaku adalah memastikan pengalamanmu di Kuro Studio menyenangkan dan tanpa kendala!',
        animation: 'wave',
        action: 'none',
        targetTool: null
      });
    }

    return res.status(200).json({
      reply: 'Maaf ya, Kuro hanya bisa membantu menjelaskan seputar fitur-fitur dan cara penggunaan website ini! Ada fitur Kuro Studio yang ingin kamu tanyakan?',
      animation: 'confused',
      action: 'none',
      targetTool: null
    });
  } catch (err) {
    return res.status(500).json({
      reply: 'Maaf, terjadi gangguan sesaat pada mantra sihirku. Coba tanyakan lagi ya!',
      animation: 'confused',
      action: 'none'
    });
  }
}
