// api/chat.js - Vercel Serverless Endpoint untuk AI Kuro (Persona Elaina)

const KURO_TOOLS = {
  downloader: {
    id: 'downloader',
    name: 'Media Downloader',
    element_id: 'tool-downloader',
    keywords: ['download', 'downloader', 'unduh', 'tiktok', 'instagram', 'youtube', 'ig', 'yt', 'video', 'sw', 'story', 'status wa', 'sound'],
    desc: 'Media Downloader serbaguna untuk mengunduh video, foto slide album, dan audio MP3 tanpa watermark dari berbagai platform (TikTok, IG, YT, dll.) dengan kualitas hingga 4K dan optimasi 1080p Status WA Anti-Burik.'
  },
  jjFinder: {
    id: 'jjFinder',
    name: 'Cari Link JJ',
    element_id: 'tool-jjFinder',
    keywords: ['jj', 'jedag jedug', 'sound jj', 'preset', 'remix', 'am', 'alight motion', 'capcut jj'],
    desc: 'Fitur Cari Link JJ untuk menemukan sound jedag-jedug viral, preset Alight Motion, dan backsound kekinian dengan tautan langsung siap pakai.'
  },
  pngToPdf: {
    id: 'pngToPdf',
    name: 'PNG to PDF',
    element_id: 'tool-pngToPdf',
    keywords: ['png to pdf', 'gambar ke pdf', 'foto ke pdf', 'convert pdf', 'satukan gambar'],
    desc: 'Alat untuk menggabungkan banyak gambar atau foto (PNG/JPG) menjadi satu dokumen PDF berkualitas tinggi secara cepat dan teratur.'
  },
  linkToDoc: {
    id: 'linkToDoc',
    name: 'Link to PDF/PPT',
    element_id: 'tool-linkToDoc',
    keywords: ['link to doc', 'link to pdf', 'link to ppt', 'scribd', 'slideshare', 'dokumen', 'presentasi'],
    desc: 'Konverter dokumen online yang mengekstrak materi kuliah, slide presentasi, atau dokumen dari Scribd dan SlideShare menjadi file PDF atau PPT utuh.'
  },
  imageToLink: {
    id: 'imageToLink',
    name: 'File ke Link',
    element_id: 'tool-imageToLink',
    keywords: ['image to link', 'file ke link', 'upload gambar', 'hosting gambar', 'url foto', 'link gambar'],
    desc: 'Layanan hosting instan untuk mengubah file foto atau gambar lokal menjadi URL tautan web publik yang dapat langsung dibagikan ke mana saja.'
  },
  compressor: {
    id: 'compressor',
    name: 'Kompres Media HD',
    element_id: 'tool-compressor',
    keywords: ['kompres', 'compress', 'compressor', 'kecilkan ukuran', 'hemat memori', 'video kecil', 'foto kecil'],
    desc: 'Pengompres media cerdas untuk merampingkan ukuran file video dan gambar secara drastis tanpa membuat tampilan visual burik atau pecah.'
  },
  qrStudio: {
    id: 'qrStudio',
    name: 'QR Code Studio',
    element_id: 'tool-qrStudio',
    keywords: ['qr', 'qrcode', 'barcode', 'qr studio', 'bikin qr', 'kode qr', 'scan'],
    desc: 'QR Code Studio bernuansa neobrutalist untuk membuat kode QR estetik dengan logo kustom, pewarnaan fleksibel, dan resolusi tajam.'
  },
  audioMerger: {
    id: 'audioMerger',
    name: 'Audio Merger',
    element_id: 'tool-audioMerger',
    keywords: ['audio merger', 'gabung lagu', 'gabung audio', 'satukan musik', 'merge sound', 'sambung musik'],
    desc: 'Alat penggabung beberapa trek audio menjadi satu kesatuan alunan musik yang mulus dengan transisi yang rapi.'
  },
  photoStudio: {
    id: 'photoStudio',
    name: 'Photo Studio',
    element_id: 'tool-photoStudio',
    keywords: ['photo studio', 'edit foto', 'filter foto', 'rotasi foto', 'editor gambar', 'efek foto'],
    desc: 'Studio kreasi foto untuk mempercantik foto dengan aneka filter neobrutalist, rotasi, penyesuaian kontras, dan efek artistik instan.'
  },
  videoStudio: {
    id: 'videoStudio',
    name: 'Video Studio',
    element_id: 'tool-videoStudio',
    keywords: ['video studio', 'edit video', 'filter video', 'kecepatan video', 'speed video', 'rasio video'],
    desc: 'Studio pengeditan video dengan kontrol kecepatan pemutaran, rasio aspek (9:16, 16:9, 1:1), filter warna, dan pratinjau instan.'
  },
  videoTrimmer: {
    id: 'videoTrimmer',
    name: 'Video Trimmer',
    element_id: 'tool-videoTrimmer',
    keywords: ['trimmer', 'potong video', 'cut video', 'durasi video', 'trim video', 'pangkas'],
    desc: 'Pemotong video presisi tinggi untuk memangkas detik awal atau akhir klip video secara akurat tanpa menurunkan kualitas aslinya.'
  },
  bgRemover: {
    id: 'bgRemover',
    name: 'Hapus Background',
    element_id: 'tool-bgRemover',
    keywords: ['bg remover', 'hapus background', 'hilangkan latar', 'background transparan', 'remove bg', 'transparan'],
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
    const targetToolId = detectToolMention(lowerMsg);

    // 1. Deteksi Permintaan Tour Berkelanjutan (12 Fitur Web)
    const isTourRequest = /\b(tour|tur|keliling|panduan lengkap|apa saja fitur)\b|semua fitur|jelaskan semua/i.test(lowerMsg);
    if (isTourRequest && !targetToolId) {
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

    // 2. Guardrails: Tolak Topik di Luar Web Kuro
    if (isOutOfTopic(lowerMsg)) {
      return res.status(200).json({
        reply: 'Maaf ya, Kuro hanya bisa membantu menjelaskan seputar fitur-fitur dan cara penggunaan website ini! Fufufu~ Coba tanyakan salah satu dari 12 fitur hebat kami!',
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

    // 3. Deteksi Penjelasan Fitur Spesifik
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
                parts: [{ text: `Kamu adalah AI Kuro (persona Elaina dari Majo no Tabitabi), asisten cerdas, ramah, dan percaya diri khusus website Kuro Studio (AllToolsKuro). Jawab dalam format JSON murni: {"reply": "...", "is_valid_context": true|false, "animation": "wave|talking|confused|idle", "action": "none|navigate_tool|start_tour", "target_tool": "downloader|..."|null}. JANGAN gunakan tanda bintang ganda **. Pesan pengguna: ${cleanMsg}` }]
              }
            ],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.3,
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
            const tool = parsed.target_tool || parsed.targetTool || targetToolId || null;
            const valid = parsed.is_valid_context !== undefined ? parsed.is_valid_context : true;
            return res.status(200).json({
              reply: cleanSpeechText(parsed.reply) || 'Halo! Ada yang bisa AI Kuro bantu seputar Kuro Studio?',
              is_valid_context: valid,
              isValidContext: valid,
              animation: parsed.animation || 'talking',
              action: act,
              target_tool: tool,
              targetTool: tool,
              target_element: tool ? `tool-${tool}` : null,
              targetElement: tool ? `tool-${tool}` : null,
              tour_sequence: act === 'start_tour' ? TOUR_ORDER : null,
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

    if (['halo', 'hai', 'hi', 'salam', 'pagi', 'siang', 'malam'].some(k => lowerMsg.includes(k))) {
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

    if (['siapa kamu', 'nama kamu', 'elaina', 'kuro'].some(k => lowerMsg.includes(k))) {
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

    return res.status(200).json({
      reply: 'Maaf ya, Kuro hanya bisa membantu menjelaskan seputar fitur-fitur dan cara penggunaan website ini! Ada fitur Kuro Studio yang ingin kamu tanyakan?',
      is_valid_context: false,
      isValidContext: false,
      animation: 'confused',
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
