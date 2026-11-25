/**
 * Kuro Studio - Client-Side Text-to-Animation SceneGraph Compiler
 * Mengurai teks bebas / ide / prompt (Bahasa Indonesia & Inggris) menjadi grafik adegan animasi
 * responsif 60 FPS yang aman di seluruh rasio aspek tanpa overflow teks.
 */

export const PROMPT_VISUAL_STYLES = [
  { id: 'auto', name: 'Otomatis', desc: 'Deteksi gaya terbaik dari teks' },
  { id: 'promo-komersial', name: 'Iklan Promo', desc: 'Sorotan harga, badge & CTA kuat' },
  { id: 'showcase-produk', name: 'Showcase Produk', desc: 'Kartu fitur rapi & bingkai mockup' },
  { id: 'quotes-estetik', name: 'Quotes Sinematik', desc: 'Tipografi tenang multi-adegan' },
  { id: 'space-3d', name: 'Luar Angkasa 3D', desc: 'Planet orbit, nebula & kedalaman bintang' },
  { id: 'cyber-futuristik', name: 'Neon Cyber', desc: 'Grid futuristik, HUD & efek kilau' }
];

export const PROMPT_COLOR_MOODS = [
  { id: 'auto', name: 'Otomatis', dot: '#facc15' },
  {
    id: 'obsidian-gold',
    name: 'Emas Gelap',
    bg1: '#0b0b10',
    bg2: '#241807',
    accent: '#facc15',
    secondary: '#fb923c',
    text: '#ffffff',
    muted: '#d4d4d8',
    dot: '#facc15',
    isLight: false
  },
  {
    id: 'crimson-fire',
    name: 'Merah Berapi',
    bg1: '#150506',
    bg2: '#420a10',
    accent: '#ef4444',
    secondary: '#f97316',
    text: '#fff5f5',
    muted: '#fecaca',
    dot: '#ef4444',
    isLight: false
  },
  {
    id: 'cobalt-neon',
    name: 'Biru Teknologi',
    bg1: '#050b1a',
    bg2: '#0f2557',
    accent: '#38bdf8',
    secondary: '#818cf8',
    text: '#f0f9ff',
    muted: '#bae6fd',
    dot: '#38bdf8',
    isLight: false
  },
  {
    id: 'cyber-emerald',
    name: 'Hijau Cyber',
    bg1: '#04120e',
    bg2: '#073528',
    accent: '#34d399',
    secondary: '#22d3ee',
    text: '#ecfdf5',
    muted: '#a7f3d0',
    dot: '#34d399',
    isLight: false
  },
  {
    id: 'cosmic-violet',
    name: 'Ungu Kosmik',
    bg1: '#070414',
    bg2: '#230b4a',
    accent: '#c084fc',
    secondary: '#38bdf8',
    text: '#faf5ff',
    muted: '#e9d5ff',
    dot: '#c084fc',
    isLight: false
  },
  {
    id: 'editorial-ivory',
    name: 'Terang Minimal',
    bg1: '#f8fafc',
    bg2: '#e2e8f0',
    accent: '#0f172a',
    secondary: '#ca8a04',
    text: '#09090b',
    muted: '#475569',
    dot: '#0f172a',
    isLight: true
  }
];

export const QUICK_PROMPT_SAMPLES = [
  {
    id: 'kuliner',
    label: 'Iklan Kuliner / Minuman',
    style: 'promo-komersial',
    mood: 'crimson-fire',
    prompt:
      'Iklan promo Bakso Urat Mercon by Bakso Kuro, kuah kaldu pedas gurih 100% daging sapi asli, harga spesial Rp 18.000 dari Rp 25.000, gratis es teh manis, tersedia di GoFood dan GrabFood, warna merah hitam berapi.'
  },
  {
    id: 'web-jasa',
    label: 'Promo Jasa Web & Aplikasi',
    style: 'showcase-produk',
    mood: 'cobalt-neon',
    prompt:
      'Promo jasa pembuatan website UMKM dan toko online profesional by Kuro Web Studio, responsif HP & desktop, gratis domain .com, pengerjaan cepat 3 hari, mulai Rp 499.000 dari Rp 950.000, konsultasi WA 0812-3456-7890.'
  },
  {
    id: 'space-3d',
    label: 'Animasi 3D Luar Angkasa',
    style: 'space-3d',
    mood: 'cosmic-violet',
    prompt:
      'Animasi sinematik perjalanan orbit planet dan tata surya masa depan oleh Astro Kuro Lab, visual nebula bercahaya, bintang parallax 60 FPS, jelajahi galaksi tanpa batas, mulai eksplorasi sekarang.'
  },
  {
    id: 'quotes',
    label: 'Quotes Estetik Sinematik',
    style: 'quotes-estetik',
    mood: 'editorial-ivory',
    prompt:
      'Quotes motivasi harian oleh Jurnal Senja: Jangan takut berjalan lambat, karena konsistensi kecil setiap hari jauh lebih kuat daripada niat besar yang hanya bertahan semalam. Tetap melangkah dan percaya proses.'
  },
  {
    id: 'cyber-product',
    label: 'Iklan Produk Neon Cyber',
    style: 'cyber-futuristik',
    mood: 'cyber-emerald',
    prompt:
      'Launching earphone gaming Kuro Sonic X1 dengan latency 18ms ultra cepat, baterai awet 48 jam, active noise cancelling pro, promo flash sale Rp 299.000 dari Rp 499.000, beli sekarang di official store.'
  }
];

function detectTopic(lower, requestedStyle = 'auto') {
  if (requestedStyle === 'space-3d') return 'space-3d';
  if (requestedStyle === 'quotes-estetik') return 'aesthetic-quotes';
  if (requestedStyle === 'cyber-futuristik') return 'cyber-neon';

  if (/\b(planet|angkasa|galaksi|galaxy|orbit|bintang|nebula|antariksa|roket|space|cosmos|surya|mars|bulan)\b/.test(lower)) {
    return 'space-3d';
  }
  if (/\b(quote|quotes|kutipan|motivasi|renungan|puisi|sajak|filosofi|jurnal|mindset|wisdom|inspiring)\b/.test(lower)) {
    return 'aesthetic-quotes';
  }
  if (/\b(bakso|kopi|makan|minum|kuliner|pedas|burger|mie|ramen|boba|teh|ayam|kue|warung|resto|cafe|food|drink)\b/.test(lower)) {
    return 'culinary';
  }
  if (/\b(gaming|neon|cyber|futuristik|earphone|headset|ai|robot|chip|rgb|synth|tech|kripto|crypto)\b/.test(lower)) {
    return 'cyber-neon';
  }
  if (/\b(web|website|aplikasi|app|toko online|landing page|software|jasa|agency|saas|ui|ux|domain|seo)\b/.test(lower)) {
    return 'tech-web';
  }

  if (requestedStyle === 'promo-komersial') return 'culinary';
  if (requestedStyle === 'showcase-produk') return 'tech-web';
  return 'general';
}

function resolveColorPalette(lower, topic, requestedMood = 'auto') {
  if (requestedMood && requestedMood !== 'auto') {
    const chosen = PROMPT_COLOR_MOODS.find((m) => m.id === requestedMood);
    if (chosen) return chosen;
  }

  if (/\b(merah|berapi|pedas|api|cabai|crimson|red|lava)\b/.test(lower)) {
    return PROMPT_COLOR_MOODS.find((m) => m.id === 'crimson-fire');
  }
  if (/\b(ungu|galaksi|nebula|kosmik|violet|purple|galaxy|cosmos)\b/.test(lower)) {
    return PROMPT_COLOR_MOODS.find((m) => m.id === 'cosmic-violet');
  }
  if (/\b(hijau|emerald|cyber|matcha|segar|mint|green)\b/.test(lower)) {
    return PROMPT_COLOR_MOODS.find((m) => m.id === 'cyber-emerald');
  }
  if (/\b(biru|teknologi|langit|laut|cobalt|blue|tech|web)\b/.test(lower)) {
    return PROMPT_COLOR_MOODS.find((m) => m.id === 'cobalt-neon');
  }
  if (/\b(terang|putih|minimalis|bersih|ivory|editorial|krem|pastel|cerah|senja)\b/.test(lower)) {
    return PROMPT_COLOR_MOODS.find((m) => m.id === 'editorial-ivory');
  }
  if (/\b(emas|gold|mewah|luxury|premium|hitam emas|obsidian)\b/.test(lower)) {
    return PROMPT_COLOR_MOODS.find((m) => m.id === 'obsidian-gold');
  }

  const topicDefaults = {
    culinary: 'crimson-fire',
    'tech-web': 'cobalt-neon',
    'space-3d': 'cosmic-violet',
    'aesthetic-quotes': 'editorial-ivory',
    'cyber-neon': 'cyber-emerald',
    general: 'obsidian-gold'
  };
  return PROMPT_COLOR_MOODS.find((m) => m.id === topicDefaults[topic]) || PROMPT_COLOR_MOODS[1];
}

function normalizePriceNumber(rawStr) {
  const cleaned = rawStr.toLowerCase().replace(/\s+/g, '');
  let mult = 1;
  if (cleaned.endsWith('rb') || cleaned.endsWith('k')) mult = 1000;
  if (cleaned.endsWith('jt')) mult = 1000000;
  const digits = cleaned.replace(/[^0-9]/g, '');
  const val = parseInt(digits, 10) || 0;
  return val * mult;
}

function extractPromoDetails(rawPrompt) {
  const priceMatches = Array.from(
    rawPrompt.matchAll(/(?:rp\.?\s*|idr\s*|\$)\s*\d[\d.,]*(?:\s*(?:rb|k|jt))?|\b\d+(?:[.,]\d+)?\s*(?:rb|ribu|jt)\b/gi)
  ).map((m) => m[0].trim());

  const uniquePrices = [];
  for (const p of priceMatches) {
    if (!uniquePrices.includes(p)) uniquePrices.push(p);
  }

  let promoPrice = '';
  let oldPrice = '';

  if (uniquePrices.length >= 2) {
    const parsed = uniquePrices
      .map((label) => ({ label, num: normalizePriceNumber(label) }))
      .sort((a, b) => a.num - b.num);
    promoPrice = parsed[0].label;
    oldPrice = parsed[parsed.length - 1].label;
    if (promoPrice === oldPrice) oldPrice = '';
  } else if (uniquePrices.length === 1) {
    promoPrice = uniquePrices[0];
  }

  const discMatch = rawPrompt.match(/(?:diskon|hemat|potongan|off|sale)\s*(\d{1,2}\s*%)/i)
    || rawPrompt.match(/(\d{1,2}\s*%)\s*(?:off|diskon|hemat)/i);
  const discountBadge = discMatch ? `HEMAT ${discMatch[1].replace(/\s+/g, '')}` : (promoPrice && oldPrice ? 'PROMO SPESIAL' : '');

  return { promoPrice, oldPrice, discountBadge };
}

function extractBrandAndCta(rawPrompt, topic) {
  let brand = '';
  const byMatch = rawPrompt.match(/(?:\b(?:by|oleh|brand|merek|toko)\b)\s+([A-Za-z0-9][A-Za-z0-9\s.&'-]{1,26}?)(?=[,.;:\n]|$|\b(?:dengan|kuah|harga|promo|responsif|visual|warna)\b)/i);
  if (byMatch) {
    brand = byMatch[1].trim();
  } else {
    const handleMatch = rawPrompt.match(/@([A-Za-z0-9_.]{3,24})/);
    if (handleMatch) brand = `@${handleMatch[1]}`;
  }

  if (!brand) {
    if (topic === 'space-3d') brand = 'ASTRO STUDIO';
    else if (topic === 'aesthetic-quotes') brand = 'CATATAN HARIAN';
    else if (topic === 'cyber-neon') brand = 'NEON LAB';
    else brand = 'KURO STUDIO';
  }

  // Deteksi kontak, URL, marketplace, atau ajakan aksi (CTA)
  let cta = '';
  let channelLine = '';

  const waMatch = rawPrompt.match(/(?:wa|whatsapp|hubungi|kontak)[:\s]*((?:\+?62|08)[\d\s-]{7,15})/i);
  const domainMatch = rawPrompt.match(/\b([a-z0-9-]+\.(?:id|com|co\.id|net|io|app))\b/i);
  const marketMatch = rawPrompt.match(/\b((?:gofood|grabfood|shopeefood|tokopedia|shopee|lazada|tiktok shop)(?:\s*(?:,|dan|&|\/)\s*(?:gofood|grabfood|shopeefood|tokopedia|shopee|lazada|tiktok shop))*)/i);

  const ctaVerbMatch = rawPrompt.match(/\b((?:pesan|order|beli|coba|daftar|klaim|booking|konsultasi|mulai eksplorasi|dapatkan|miliki)(?:\s+[a-z0-9]+){0,3})/i);

  if (waMatch) {
    cta = `KONSULTASI • ${waMatch[1].trim()}`;
  } else if (ctaVerbMatch) {
    cta = `${ctaVerbMatch[1].trim().toUpperCase()} →`;
  } else if (topic === 'aesthetic-quotes') {
    cta = 'SIMPAN & BAGIKAN QUOTES';
  } else if (topic === 'space-3d') {
    cta = 'JELAJAHI GALAKSI →';
  } else {
    cta = 'COBA SEKARANG →';
  }

  const channelParts = [];
  if (marketMatch) channelParts.push(`Tersedia di ${marketMatch[1].replace(/\s*,\s*/g, ' • ')}`);
  if (domainMatch) channelParts.push(domainMatch[1]);
  if (!waMatch) {
    const loosePhone = rawPrompt.match(/\b(?:\+?62|08)\d[\d-]{7,13}\b/);
    if (loosePhone) channelParts.push(`WA ${loosePhone[0]}`);
  }
  channelLine = channelParts.join('  •  ');

  return { brand: brand.toUpperCase(), cta, channelLine };
}

function cleanTextSegment(seg = '') {
  return seg
    .replace(/\b(?:by|oleh)\s+[A-Za-z0-9][A-Za-z0-9\s.&'-]{1,26}/gi, '')
    .replace(/\bwarna\s+[a-z\s]{3,28}$/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[,.:;\-\s]+|[,.:;\-\s]+$/g, '')
    .trim();
}

function buildHeadlinesAndPoints(rawPrompt, topic, entities) {
  const normalized = rawPrompt.replace(/\r/g, '').trim();

  if (topic === 'aesthetic-quotes') {
    const colonSplit = normalized.split(/[:\u2014]/);
    const quoteBody = (colonSplit.length > 1 ? colonSplit.slice(1).join(':') : normalized).trim();
    const sentences = quoteBody
      .split(/(?<=[.!?])\s+|\n+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 4);

    const headline = sentences[0]
      ? sentences[0].slice(0, 74)
      : 'Langkah kecil hari ini membentuk masa depan.';
    const subheadline = sentences[1]
      ? sentences[1].slice(0, 96)
      : 'Tetap konsisten, bertumbuh tenang, dan nikmati prosesnya.';
    const keyPoints = sentences.slice(2, 5).map((s) => s.slice(0, 52));
    if (keyPoints.length === 0) {
      keyPoints.push('Fokus pada kemajuan, bukan kesempurnaan sesaat');
    }
    return { headline, subheadline, keyPoints };
  }

  const rawClauses = normalized
    .split(/[\n,;]+|(?:\.\s+)/)
    .map((c) => cleanTextSegment(c))
    .filter((c) => c.length > 2);

  let leadClause = rawClauses[0] || 'Karya Visual Sinematik';
  leadClause = leadClause
    .replace(/^(?:iklan\s+promo|iklan\s+produk|promo\s+jasa|animasi\s+sinematik|launching)\s+/i, '')
    .replace(/\b(?:rp\.?\s*|idr\s*|\$)\d[\d.,]*(?:\s*(?:rb|k|jt))?/gi, '')
    .trim();

  const headline = (leadClause.length >= 4 ? leadClause : 'PROMO SPESIAL HARI INI').slice(0, 56).toUpperCase();

  // Saring klausa fitur (buang klausa harga/wa mentah agar tidak dobel)
  const filteredPoints = rawClauses
    .slice(1)
    .filter((c) => {
      const low = c.toLowerCase();
      if (/^(?:harga|mulai|dari)\s*(?:rp|idr|\$)/i.test(low) && entities.promoPrice) return false;
      if (/^(?:tersedia di|beli sekarang|pesan sekarang|konsultasi|wa\s)/i.test(low)) return false;
      if (/^(?:warna)\s+/i.test(low)) return false;
      return c.length >= 4;
    })
    .map((c) => c.slice(0, 44));

  const subheadline = filteredPoints[0]
    ? `${filteredPoints[0]}${filteredPoints[1] ? ` • ${filteredPoints[1]}` : ''}`.slice(0, 90)
    : 'Visual gerak 60 FPS langsung dari browser tanpa ribet.';

  const keyPoints = filteredPoints.slice(0, 4);
  if (keyPoints.length === 0) {
    keyPoints.push(
      'Visual Responsif HD di Semua Rasio',
      'Transisi Tipografi & Ilustrasi Presisi',
      'Siap Ekspor MP4, CapCut & Alight Motion'
    );
  }

  return { headline, subheadline, keyPoints };
}

/**
 * Menghasilkan SceneGraph terstruktur + dokumen HTML5 Canvas penuh + dokumen latar polos tanpa teks.
 */
export function compileTextPromptToSceneGraph(rawPromptText = '', options = {}, durationSec = 10) {
  const promptText = String(rawPromptText || '').trim() || QUICK_PROMPT_SAMPLES[0].prompt;
  const lower = promptText.toLowerCase();
  const dur = Math.max(2, Math.min(Number(durationSec) || 10, 60));

  const visualStyle = options.visualStyle || 'auto';
  const moodId = options.mood || 'auto';

  const topic = detectTopic(lower, visualStyle);
  const palette = resolveColorPalette(lower, topic, moodId);
  const promo = extractPromoDetails(promptText);
  const identity = extractBrandAndCta(promptText, topic);

  const entities = {
    ...identity,
    ...promo,
    rawPrompt: promptText
  };

  const textParts = buildHeadlinesAndPoints(promptText, topic, entities);
  entities.headline = textParts.headline;
  entities.subheadline = textParts.subheadline;
  entities.keyPoints = textParts.keyPoints;

  const layers = [];
  const subtitles = [];

  layers.push({
    id: 'bg-stage',
    kind: 'background',
    label: 'Latar & Efek Atmosfer',
    startTime: 0,
    endTime: dur,
    color: palette.bg1
  });

  layers.push({
    id: 'hero-illustration',
    kind: 'illustration',
    label: `Ilustrasi Tema (${topic})`,
    topic,
    startTime: 0,
    endTime: dur,
    color: palette.accent
  });

  layers.push({
    id: 'text-brand',
    kind: 'badge',
    text: entities.brand,
    startTime: 0,
    endTime: dur,
    x: 0.5,
    y: 0.12,
    fontSize: 22,
    color: palette.accent,
    bgColor: palette.bg2
  });

  layers.push({
    id: 'text-headline',
    kind: 'headline',
    text: entities.headline,
    startTime: 0.15,
    endTime: dur,
    x: 0.5,
    y: 0.28,
    fontSize: 54,
    color: palette.text
  });
  subtitles.push({
    startTime: 0.15,
    endTime: Math.min(dur, dur * 0.45),
    text: `${entities.brand} — ${entities.headline}`
  });

  layers.push({
    id: 'text-subheadline',
    kind: 'subheadline',
    text: entities.subheadline,
    startTime: Math.min(dur * 0.12, 0.6),
    endTime: dur,
    x: 0.5,
    y: 0.42,
    fontSize: 26,
    color: palette.muted
  });

  const pointWindowStart = Math.min(dur * 0.2, 1.0);
  const pointWindowEnd = dur * 0.86;
  const pointSpan = Math.max(1.2, (pointWindowEnd - pointWindowStart) / Math.max(1, entities.keyPoints.length));

  entities.keyPoints.forEach((pt, idx) => {
    const s = Number((pointWindowStart + idx * (pointSpan * 0.45)).toFixed(2));
    layers.push({
      id: `text-point-${idx + 1}`,
      kind: 'point',
      index: idx,
      text: pt,
      startTime: s,
      endTime: dur,
      x: 0.5,
      y: 0.56 + idx * 0.08,
      fontSize: 24,
      color: palette.text,
      accent: palette.accent
    });
    subtitles.push({
      startTime: Number((pointWindowStart + idx * pointSpan).toFixed(2)),
      endTime: Number(Math.min(dur, pointWindowStart + (idx + 1) * pointSpan).toFixed(2)),
      text: pt
    });
  });

  if (entities.promoPrice) {
    const priceText = entities.oldPrice
      ? `${entities.promoPrice} (dari ${entities.oldPrice})`
      : entities.promoPrice;
    layers.push({
      id: 'text-promo-price',
      kind: 'price',
      text: priceText,
      promoPrice: entities.promoPrice,
      oldPrice: entities.oldPrice,
      badge: entities.discountBadge,
      startTime: Math.min(dur * 0.25, 1.1),
      endTime: dur,
      x: 0.5,
      y: 0.72,
      fontSize: 44,
      color: palette.accent
    });
  }

  layers.push({
    id: 'text-cta',
    kind: 'cta',
    text: entities.cta,
    startTime: Math.min(dur * 0.35, 1.4),
    endTime: dur,
    x: 0.5,
    y: 0.87,
    fontSize: 24,
    color: palette.isLight ? '#ffffff' : '#09090b',
    bgColor: palette.accent
  });

  if (entities.channelLine) {
    layers.push({
      id: 'text-channel',
      kind: 'caption',
      text: entities.channelLine,
      startTime: Math.min(dur * 0.4, 1.6),
      endTime: dur,
      x: 0.5,
      y: 0.94,
      fontSize: 18,
      color: palette.muted
    });
  }

  const topicLabels = {
    culinary: 'Kuliner & Promo',
    'tech-web': 'Teknologi & Jasa Web',
    'space-3d': 'Luar Angkasa 3D',
    'aesthetic-quotes': 'Quotes Sinematik',
    'cyber-neon': 'Neon Cyber',
    general: 'Kreatif Umum'
  };

  const sceneGraph = {
    version: '2.0',
    duration: dur,
    topic,
    topicLabel: topicLabels[topic] || 'Kreatif Umum',
    visualStyle,
    palette,
    entities,
    layers,
    subtitles
  };

  const generatedHtmlCode = buildCompiledCanvasDocument(sceneGraph, false);
  const generatedCleanBgHtmlCode = buildCompiledCanvasDocument(sceneGraph, true);

  return {
    sceneGraph,
    generatedHtmlCode,
    generatedCleanBgHtmlCode,
    summary: {
      topicLabel: sceneGraph.topicLabel,
      colorName: palette.name,
      brand: entities.brand,
      headline: entities.headline,
      pointCount: entities.keyPoints.length,
      hasPromoPrice: Boolean(entities.promoPrice)
    }
  };
}

/**
 * Builder dokumen HTML5 Canvas deterministik 60 FPS untuk full render & latar polos tanpa teks.
 */
function buildCompiledCanvasDocument(sceneGraph, cleanBgOnly = false) {
  const serializedConfig = JSON.stringify({
    duration: sceneGraph.duration,
    topic: sceneGraph.topic,
    palette: sceneGraph.palette,
    entities: sceneGraph.entities,
    cleanBgOnly
  }).replace(/<\/script>/gi, '<\\/script>');

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${cleanBgOnly ? 'Latar Polos' : sceneGraph.entities.brand} — Kuro Studio</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: ${sceneGraph.palette.bg1}; }
    canvas { display: block; width: 100%; height: 100%; }
  </style>
</head>
<body>
<canvas id="textStage"></canvas>
<script>
(function() {
  var CFG = ${serializedConfig};
  var canvas = document.getElementById('textStage');
  var ctx = canvas.getContext('2d');

  function syncCanvasSize() {
    var w = window.innerWidth || 1280;
    var h = window.innerHeight || 720;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }
  syncCanvasSize();
  window.addEventListener('resize', syncCanvasSize);

  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function easeOutCubic(t) { var u = 1 - clamp01(t); return 1 - u * u * u; }
  function easeOutBack(t) {
    var x = clamp01(t);
    var c1 = 1.70158;
    var c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  }

  function hexToRgba(hex, alpha) {
    var c = String(hex || '#facc15').replace('#', '');
    if (c.length === 3) c = c[0]+c[0]+c[1]+c[1]+c[2]+c[2];
    var r = parseInt(c.slice(0, 2), 16) || 0;
    var g = parseInt(c.slice(2, 4), 16) || 0;
    var b = parseInt(c.slice(4, 6), 16) || 0;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  function drawRoundRect(x, y, w, h, r) {
    var rad = Math.min(r, w * 0.5, h * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }

  // Helper anti-overflow: menyesuaikan font & memotong rapi bila ruang vertikal terbatas
  function drawWrappedFittedText(text, x, y, maxW, maxH, opts) {
    var weight = (opts && opts.weight) || '800';
    var family = (opts && opts.family) || "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
    var maxSize = (opts && opts.maxSize) || 56;
    var minSize = (opts && opts.minSize) || 14;
    var align = (opts && opts.align) || 'center';
    var lineMult = (opts && opts.lineHeight) || 1.2;
    var maxLines = (opts && opts.maxLines) || 4;
    var color = (opts && opts.color) || '#ffffff';

    var cleanText = String(text || '').trim();
    if (!cleanText) return 0;

    var chosenSize = minSize;
    var chosenLines = [cleanText];

    for (var s = maxSize; s >= minSize; s -= 2) {
      ctx.font = weight + ' ' + s + 'px ' + family;
      var words = cleanText.split(/\\s+/);
      var lines = [];
      var cur = '';

      for (var i = 0; i < words.length; i++) {
        var word = words[i];
        var test = cur ? (cur + ' ' + word) : word;
        if (ctx.measureText(test).width <= maxW) {
          cur = test;
        } else {
          if (cur) lines.push(cur);
          if (ctx.measureText(word).width > maxW) {
            var trimmed = word;
            while (trimmed.length > 3 && ctx.measureText(trimmed + '...').width > maxW) {
              trimmed = trimmed.slice(0, -1);
            }
            cur = trimmed + (trimmed.length < word.length ? '...' : '');
          } else {
            cur = word;
          }
        }
      }
      if (cur) lines.push(cur);

      var totalH = lines.length * s * lineMult;
      if (lines.length <= maxLines && totalH <= maxH) {
        chosenSize = s;
        chosenLines = lines;
        break;
      }
      if (s === minSize) {
        chosenSize = minSize;
        var cap = Math.max(1, Math.min(maxLines, Math.floor(maxH / (minSize * lineMult))));
        chosenLines = lines.slice(0, cap);
        if (lines.length > cap && chosenLines.length > 0) {
          var lastIdx = chosenLines.length - 1;
          var last = chosenLines[lastIdx];
          while (last.length > 3 && ctx.measureText(last + '...').width > maxW) {
            last = last.slice(0, -1);
          }
          chosenLines[lastIdx] = last + '...';
        }
      }
    }

    ctx.save();
    ctx.font = weight + ' ' + chosenSize + 'px ' + family;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'top';
    var stepY = chosenSize * lineMult;
    for (var j = 0; j < chosenLines.length; j++) {
      ctx.fillText(chosenLines[j], x, y + j * stepY, maxW);
    }
    ctx.restore();
    return chosenLines.length * stepY;
  }

  function drawHeroIllustration(topic, cx, cy, radius, t, pal) {
    ctx.save();
    ctx.translate(cx, cy);

    if (topic === 'culinary') {
      // Uap hangat naik + mangkuk kuah menyala + api rempah
      for (var i = 0; i < 3; i++) {
        var ph = (t * 0.9 + i * 0.33) % 1;
        ctx.beginPath();
        var sx = (i - 1) * radius * 0.24;
        for (var k = 0; k <= 12; k++) {
          var py = -radius * 0.2 - k * (radius * 0.05) - ph * radius * 0.22;
          var px = sx + Math.sin(t * 4 + k * 0.6 + i) * radius * 0.07;
          if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.strokeStyle = hexToRgba(pal.accent, (1 - ph) * 0.55);
        ctx.lineWidth = Math.max(2, radius * 0.04);
        ctx.lineCap = 'round';
        ctx.stroke();
      }
      // Mangkuk
      ctx.beginPath();
      ctx.arc(0, radius * 0.08, radius * 0.62, 0, Math.PI);
      ctx.closePath();
      ctx.fillStyle = pal.isLight ? '#18181b' : '#f8fafc';
      ctx.fill();
      ctx.strokeStyle = pal.accent;
      ctx.lineWidth = Math.max(3, radius * 0.05);
      ctx.stroke();

      // Kuah & isian
      ctx.beginPath();
      ctx.ellipse(0, radius * 0.08, radius * 0.58, radius * 0.16, 0, 0, Math.PI * 2);
      ctx.fillStyle = pal.secondary;
      ctx.fill();

      var orbs = [[-0.2, 0.04, 0.15], [0.05, 0.01, 0.18], [0.24, 0.05, 0.13]];
      for (var b = 0; b < orbs.length; b++) {
        ctx.beginPath();
        ctx.arc(orbs[b][0] * radius, orbs[b][1] * radius + Math.sin(t * 3 + b) * 3, orbs[b][2] * radius, 0, Math.PI * 2);
        ctx.fillStyle = '#5c2d16';
        ctx.fill();
        ctx.beginPath();
        ctx.arc((orbs[b][0] - 0.04) * radius, (orbs[b][1] - 0.03) * radius, orbs[b][2] * radius * 0.35, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fill();
      }
    } else if (topic === 'space-3d') {
      // Planet berputar dengan cincin orbit miring
      var glow = ctx.createRadialGradient(0, 0, radius * 0.2, 0, 0, radius * 1.15);
      glow.addColorStop(0, hexToRgba(pal.accent, 0.4));
      glow.addColorStop(1, hexToRgba(pal.accent, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 1.15, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.48, 0, Math.PI * 2);
      var pGrad = ctx.createLinearGradient(-radius * 0.4, -radius * 0.4, radius * 0.5, radius * 0.5);
      pGrad.addColorStop(0, pal.accent);
      pGrad.addColorStop(1, pal.bg2);
      ctx.fillStyle = pGrad;
      ctx.fill();

      ctx.save();
      ctx.rotate(-0.32 + Math.sin(t * 0.7) * 0.08);
      ctx.beginPath();
      ctx.ellipse(0, 0, radius * 0.92, radius * 0.24, 0, 0, Math.PI * 2);
      ctx.strokeStyle = hexToRgba(pal.secondary, 0.85);
      ctx.lineWidth = Math.max(3, radius * 0.055);
      ctx.stroke();

      var satAngle = t * 1.8;
      ctx.beginPath();
      ctx.arc(Math.cos(satAngle) * radius * 0.92, Math.sin(satAngle) * radius * 0.24, radius * 0.08, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.restore();
    } else if (topic === 'tech-web') {
      // Jendela UI responsif animasi
      var bw = radius * 1.5;
      var bh = radius * 1.05;
      ctx.save();
      ctx.translate(0, Math.sin(t * 2.2) * radius * 0.05);
      drawRoundRect(-bw * 0.5, -bh * 0.5, bw, bh, radius * 0.14);
      ctx.fillStyle = pal.isLight ? '#0f172a' : 'rgba(15, 23, 42, 0.85)';
      ctx.fill();
      ctx.strokeStyle = pal.accent;
      ctx.lineWidth = 3;
      ctx.stroke();

      // Bar kontrol window
      for (var d = 0; d < 3; d++) {
        ctx.beginPath();
        ctx.arc(-bw * 0.38 + d * radius * 0.14, -bh * 0.36, radius * 0.04, 0, Math.PI * 2);
        ctx.fillStyle = d === 0 ? '#ef4444' : d === 1 ? '#facc15' : '#22c55e';
        ctx.fill();
      }
      // Bar kode / metrik animasi
      for (var line = 0; line < 4; line++) {
        var pulseW = bw * (0.45 + 0.28 * Math.sin(t * 2.4 + line * 1.1));
        drawRoundRect(-bw * 0.38, -bh * 0.14 + line * radius * 0.17, pulseW, radius * 0.08, 4);
        ctx.fillStyle = line % 2 === 0 ? hexToRgba(pal.accent, 0.85) : hexToRgba(pal.secondary, 0.7);
        ctx.fill();
      }
      ctx.restore();
    } else if (topic === 'cyber-neon') {
      // Reticle futuristik berputar + batang spektrum
      for (var rIdx = 0; rIdx < 3; rIdx++) {
        ctx.save();
        ctx.rotate(t * (rIdx % 2 === 0 ? 0.9 : -1.2) + rIdx);
        ctx.beginPath();
        ctx.arc(0, 0, radius * (0.45 + rIdx * 0.2), 0.2, Math.PI * 1.45);
        ctx.strokeStyle = rIdx === 1 ? pal.secondary : pal.accent;
        ctx.lineWidth = Math.max(2, radius * 0.045);
        ctx.stroke();
        ctx.restore();
      }
      for (var bar = -4; bar <= 4; bar++) {
        var bhNeon = radius * (0.18 + 0.3 * Math.abs(Math.sin(t * 4.5 + bar * 0.6)));
        ctx.fillStyle = hexToRgba(pal.accent, 0.9);
        ctx.fillRect(bar * radius * 0.13 - radius * 0.04, -bhNeon * 0.5, radius * 0.08, bhNeon);
      }
    } else {
      // Aesthetic quotes & general: lingkaran cahaya halus berlapis
      for (var g = 0; g < 3; g++) {
        var rPulse = radius * (0.48 + g * 0.2 + Math.sin(t * 1.5 + g) * 0.04);
        ctx.beginPath();
        ctx.arc(0, 0, rPulse, 0, Math.PI * 2);
        ctx.strokeStyle = hexToRgba(pal.accent, 0.45 - g * 0.12);
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.26, 0, Math.PI * 2);
      ctx.fillStyle = hexToRgba(pal.secondary, 0.28);
      ctx.fill();
    }

    ctx.restore();
  }

  var particles = [];
  for (var pIdx = 0; pIdx < 42; pIdx++) {
    particles.push({
      x: ((pIdx * 73) % 100) / 100,
      y: ((pIdx * 37) % 100) / 100,
      r: 1.5 + (pIdx % 4) * 1.1,
      spd: 0.03 + (pIdx % 5) * 0.015
    });
  }

  function renderAtTime(t) {
    syncCanvasSize();
    var W = canvas.width;
    var H = canvas.height;
    var pal = CFG.palette;
    var ent = CFG.entities;
    var dur = Math.max(2, CFG.duration || 10);
    var isPortrait = W / Math.max(1, H) < 1.15;

    // 1. Latar gradien dinamis
    var bgGrad = ctx.createRadialGradient(
      W * (0.5 + Math.sin(t * 0.4) * 0.08),
      H * (0.35 + Math.cos(t * 0.35) * 0.06),
      W * 0.05,
      W * 0.5,
      H * 0.5,
      Math.max(W, H) * 0.85
    );
    bgGrad.addColorStop(0, pal.bg2);
    bgGrad.addColorStop(1, pal.bg1);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // 2. Grid perspektif / partikel atmosfer
    ctx.save();
    ctx.strokeStyle = hexToRgba(pal.accent, pal.isLight ? 0.08 : 0.07);
    ctx.lineWidth = 1;
    var gridGap = Math.round(Math.min(W, H) * 0.09);
    for (var gx = 0; gx < W; gx += gridGap) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
    }
    for (var gy = 0; gy < H; gy += gridGap) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
    }
    ctx.restore();

    for (var i = 0; i < particles.length; i++) {
      var pt = particles[i];
      var px = pt.x * W;
      var py = ((pt.y - t * pt.spd) % 1 + 1) % 1 * H;
      ctx.beginPath();
      ctx.arc(px, py, pt.r * (Math.min(W, H) / 720), 0, Math.PI * 2);
      ctx.fillStyle = hexToRgba(i % 2 === 0 ? pal.accent : pal.secondary, 0.36);
      ctx.fill();
    }

    // 3. Ilustrasi prosedural sesuai tema
    var heroCx = isPortrait ? W * 0.5 : W * 0.77;
    var heroCy = isPortrait ? H * 0.25 : H * 0.47;
    var heroR = isPortrait ? Math.min(W * 0.16, H * 0.1) : Math.min(W * 0.14, H * 0.23);
    drawHeroIllustration(CFG.topic, heroCx, heroCy, heroR, t, pal);

    // Apabila mode Latar Polos Tanpa Teks (untuk CapCut / Premiere), berhenti di sini!
    if (CFG.cleanBgOnly) {
      return;
    }

    // 4. Tata letak aman anti-terpotong (Landscape 2 kolom vs Portrait vertikal)
    var padX = Math.round(W * 0.055);
    var safeW = W - padX * 2;
    var colX = isPortrait ? padX : padX;
    var textAreaW = isPortrait ? safeW : Math.round(safeW * 0.62);
    var centerTextX = isPortrait ? W * 0.5 : colX;
    var alignMode = isPortrait ? 'center' : 'left';

    var introFade = easeOutCubic(t / 0.45);
    var outroFade = t > dur - 0.35 ? clamp01((dur - t) / 0.35) : 1;
    var masterAlpha = Math.min(introFade, outroFade);
    ctx.save();
    ctx.globalAlpha = masterAlpha;

    // A. Badge Merek
    var brandY = isPortrait ? H * 0.065 : H * 0.095;
    var brandFontSize = Math.round(Math.min(W, H) * 0.025);
    ctx.font = '900 ' + brandFontSize + 'px system-ui, sans-serif';
    var badgeText = String(ent.brand || 'KURO STUDIO');
    var badgeW = Math.min(textAreaW, ctx.measureText(badgeText).width + brandFontSize * 1.8);
    var badgeH = brandFontSize * 2.1;
    var badgeX = isPortrait ? (W - badgeW) * 0.5 : colX;
    drawRoundRect(badgeX, brandY, badgeW, badgeH, badgeH * 0.5);
    ctx.fillStyle = hexToRgba(pal.accent, 0.16);
    ctx.fill();
    ctx.strokeStyle = pal.accent;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = pal.accent;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(badgeText, badgeX + badgeW * 0.5, brandY + badgeH * 0.52, badgeW - 14);

    // B. Headline Utama (Kinetic Slam)
    var headStartY = isPortrait ? H * 0.39 : H * 0.19;
    var headMaxH = isPortrait ? H * 0.17 : H * 0.24;
    var headSlide = (1 - easeOutBack(Math.min(1, t / 0.55))) * 26;
    var headHUsed = drawWrappedFittedText(ent.headline, centerTextX, headStartY + headSlide, textAreaW, headMaxH, {
      weight: '900',
      maxSize: isPortrait ? Math.round(W * 0.066) : Math.round(H * 0.075),
      minSize: 18,
      align: alignMode,
      maxLines: 3,
      lineHeight: 1.15,
      color: pal.text
    });

    // C. Subjudul
    var subY = headStartY + headHUsed + Math.round(H * 0.015);
    var subMaxH = isPortrait ? H * 0.09 : H * 0.12;
    var subProgress = easeOutCubic((t - 0.25) / 0.5);
    ctx.save();
    ctx.globalAlpha = masterAlpha * subProgress;
    var subHUsed = drawWrappedFittedText(ent.subheadline, centerTextX, subY, textAreaW, subMaxH, {
      weight: '600',
      maxSize: isPortrait ? Math.round(W * 0.032) : Math.round(H * 0.034),
      minSize: 13,
      align: alignMode,
      maxLines: 2,
      lineHeight: 1.25,
      color: pal.muted
    });
    ctx.restore();

    // D. Kartu Poin Unggulan + Harga Promo (bila ada)
    var cardsTopY = subY + subHUsed + Math.round(H * 0.025);
    var ctaHeight = Math.round(Math.min(W, H) * 0.075);
    var bottomLimitY = H * 0.82;
    var availCardsH = Math.max(40, bottomLimitY - cardsTopY);
    var pts = (ent.keyPoints || []).slice(0, isPortrait ? 3 : 3);

    if (ent.promoPrice && !isPortrait) {
      // Harga promo diletakkan tepat di bawah ilustrasi sebelah kanan agar seimbang
      var pBoxW = Math.round(W * 0.26);
      var pBoxH = Math.round(H * 0.19);
      var pBoxX = heroCx - pBoxW * 0.5;
      var pBoxY = heroCy + heroR + Math.round(H * 0.04);
      var pEnter = easeOutBack(Math.min(1, Math.max(0, (t - 0.5) / 0.5)));
      if (pEnter > 0.02) {
        ctx.save();
        ctx.globalAlpha = masterAlpha * pEnter;
        drawRoundRect(pBoxX, pBoxY, pBoxW, pBoxH, 14);
        ctx.fillStyle = pal.isLight ? '#0f172a' : 'rgba(9, 9, 11, 0.84)';
        ctx.fill();
        ctx.strokeStyle = pal.accent;
        ctx.lineWidth = 2.5;
        ctx.stroke();

        if (ent.oldPrice) {
          ctx.font = '700 ' + Math.round(H * 0.026) + 'px system-ui, sans-serif';
          ctx.fillStyle = '#94a3b8';
          ctx.textAlign = 'center';
          ctx.fillText(ent.oldPrice, heroCx, pBoxY + pBoxH * 0.28, pBoxW - 20);
          var tw = ctx.measureText(ent.oldPrice).width;
          ctx.beginPath();
          ctx.moveTo(heroCx - tw * 0.55, pBoxY + pBoxH * 0.28);
          ctx.lineTo(heroCx + tw * 0.55, pBoxY + pBoxH * 0.28);
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }
        ctx.font = '900 ' + Math.round(H * 0.052) + 'px system-ui, sans-serif';
        ctx.fillStyle = pal.accent;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(ent.promoPrice, heroCx, pBoxY + pBoxH * (ent.oldPrice ? 0.66 : 0.52), pBoxW - 18);
        ctx.restore();
      }
    }

    var rowH = Math.min(Math.round(availCardsH / Math.max(1, pts.length)) - 8, Math.round(H * 0.088));
    if (rowH >= 28 && pts.length > 0) {
      for (var idx = 0; idx < pts.length; idx++) {
        var delay = 0.45 + idx * 0.35;
        var cardProg = easeOutCubic((t - delay) / 0.45);
        if (cardProg <= 0.01) continue;
        var cyRow = cardsTopY + idx * (rowH + 8);
        var cardW = isPortrait ? safeW : textAreaW;
        var cardX = colX + (1 - cardProg) * 32;
        ctx.save();
        ctx.globalAlpha = masterAlpha * cardProg;
        drawRoundRect(cardX, cyRow, cardW, rowH, 10);
        ctx.fillStyle = pal.isLight ? 'rgba(15, 23, 42, 0.06)' : 'rgba(255, 255, 255, 0.07)';
        ctx.fill();
        ctx.strokeStyle = hexToRgba(pal.accent, 0.5);
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Aksen bilah kiri
        ctx.fillStyle = pal.accent;
        ctx.fillRect(cardX, cyRow + 6, 4, rowH - 12);

        drawWrappedFittedText(pts[idx], cardX + 16, cyRow + Math.round(rowH * 0.24), cardW - 28, rowH * 0.72, {
          weight: '700',
          maxSize: Math.round(rowH * 0.44),
          minSize: 12,
          align: 'left',
          maxLines: 1,
          color: pal.text
        });
        ctx.restore();
      }
    }

    // E. Harga promo khusus Portrait di atas CTA
    if (ent.promoPrice && isPortrait) {
      var portPriceText = (ent.oldPrice ? ent.oldPrice + '  ->  ' : '') + ent.promoPrice;
      drawWrappedFittedText(portPriceText, W * 0.5, H * 0.785, safeW, H * 0.06, {
        weight: '900',
        maxSize: Math.round(W * 0.056),
        minSize: 18,
        align: 'center',
        maxLines: 1,
        color: pal.accent
      });
    }

    // F. Tombol CTA + Channel Info di Bawah Layar (Zona Aman)
    var ctaProg = easeOutBack(Math.min(1, Math.max(0, (t - 0.85) / 0.5)));
    if (ctaProg > 0.02) {
      var ctaY = H * 0.845;
      var ctaText = String(ent.cta || 'COBA SEKARANG →');
      var ctaFont = Math.round(Math.min(W, H) * 0.027);
      ctx.font = '900 ' + ctaFont + 'px system-ui, sans-serif';
      var ctaW = Math.min(safeW, Math.max(W * 0.28, ctx.measureText(ctaText).width + ctaFont * 2.4));
      var ctaX = isPortrait ? (W - ctaW) * 0.5 : colX;

      ctx.save();
      ctx.globalAlpha = masterAlpha * ctaProg;
      drawRoundRect(ctaX, ctaY, ctaW, ctaHeight, 12);
      ctx.fillStyle = pal.accent;
      ctx.fill();
      ctx.fillStyle = pal.isLight ? '#ffffff' : '#09090b';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ctaText, ctaX + ctaW * 0.5, ctaY + ctaHeight * 0.52, ctaW - 18);
      ctx.restore();
    }

    if (ent.channelLine) {
      drawWrappedFittedText(ent.channelLine, centerTextX, H * 0.935, safeW, H * 0.05, {
        weight: '700',
        maxSize: Math.round(Math.min(W, H) * 0.021),
        minSize: 11,
        align: alignMode,
        maxLines: 1,
        color: pal.muted
      });
    }

    ctx.restore();
  }

  var tStart = performance.now();
  function loop(now) {
    var elapsedSec;
    if (typeof window.__ctvNowSec === 'number') {
      elapsedSec = window.__ctvNowSec;
    } else {
      elapsedSec = ((now - tStart) / 1000) % Math.max(2, CFG.duration || 10);
    }
    renderAtTime(elapsedSec);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
</script>
</body>
</html>`;
}
