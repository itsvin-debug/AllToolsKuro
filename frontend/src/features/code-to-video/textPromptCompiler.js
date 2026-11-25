/**
 * Kuro Studio - Deep Semantic Parser & Multi-Scene Motion Director
 * Mengurai deskripsi teks bebas menjadi SceneGraph multi-adegan terstruktur
 * lengkap dengan ekstraksi warna #hex ber-konteks, desain berbobot, & zero fake fallback.
 */

import { buildProceduralSceneDocument } from './sceneRendererBuilder';

export const PROMPT_DESIGN_STYLES = [
  { id: 'auto', name: 'Otomatis (Ikuti Teks)', desc: 'Deteksi gaya desain paling akurat dari teks' },
  { id: 'neo-brutalist', name: 'Neo-Brutalist', desc: 'Kartu terang, border hitam tegas & hard shadow' },
  { id: 'glassmorphism', name: 'Glassmorphism 3D', desc: 'Kaca transparan modern & ambient orbs' },
  { id: 'warm-promo', name: 'Sinematik Promo', desc: 'Sorotan harga coret, badge & aura hangat' },
  { id: 'kinetic-type', name: 'Kinetic Tipografi', desc: 'Reveal kata-demi-kata dinamis & narasi' },
  { id: 'editorial-minimal', name: 'Minimalis Terang', desc: 'Bersih lapang, garis aksen halus' },
  { id: 'cyber-neon', name: 'Neon Cyber', desc: 'Grid 3D perspektif, laser glow & spektrum' },
  { id: '3d-space', name: '3D Futuristik', desc: 'Geometri 3D & orbit galaksi berlapis' },
  { id: 'culinary-warm', name: 'Kuliner Hangat', desc: 'Bara hangat, uap aroma & kartu menu' },
  { id: 'quotes-editorial', name: 'Editorial Quotes', desc: 'Tipografi tenang estetik berkelas' }
];

export const PROMPT_COLOR_MOODS = [
  { id: 'auto', name: 'Otomatis (Hex/Teks)', dot: '#38bdf8' },
  {
    id: 'pearl-sky',
    name: 'Mutiara & Biru Langit',
    bg1: '#f8fafc',
    bg2: '#e0f2fe',
    accent: '#38bdf8',
    secondary: '#a78bfa',
    highlight: '#fde047',
    text: '#0f172a',
    muted: '#334155',
    border: '#0f172a',
    dot: '#e0f2fe',
    isLight: true
  },
  {
    id: 'deep-indigo',
    name: 'Deep Indigo Neon',
    bg1: '#07091e',
    bg2: '#1e1b4b',
    accent: '#38bdf8',
    secondary: '#a855f7',
    highlight: '#fde047',
    text: '#f8fafc',
    muted: '#cbd5e1',
    border: '#38bdf8',
    dot: '#4f46e5',
    isLight: false
  },
  {
    id: 'luxury-gold',
    name: 'Emas Mewah',
    bg1: '#0b0b10',
    bg2: '#231807',
    accent: '#facc15',
    secondary: '#fb923c',
    highlight: '#fef08a',
    text: '#ffffff',
    muted: '#d4d4d8',
    border: '#facc15',
    dot: '#facc15',
    isLight: false
  },
  {
    id: 'crimson-fire',
    name: 'Merah Mercon',
    bg1: '#150506',
    bg2: '#420a10',
    accent: '#ef4444',
    secondary: '#f97316',
    highlight: '#fde047',
    text: '#fff5f5',
    muted: '#fecaca',
    border: '#fb923c',
    dot: '#ef4444',
    isLight: false
  },
  {
    id: 'emerald-clean',
    name: 'Emerald Clean',
    bg1: '#04120e',
    bg2: '#073528',
    accent: '#34d399',
    secondary: '#22d3ee',
    highlight: '#fde047',
    text: '#ecfdf5',
    muted: '#a7f3d0',
    border: '#34d399',
    dot: '#34d399',
    isLight: false
  },
  {
    id: 'sakura-pastel',
    name: 'Sakura Pastel',
    bg1: '#fff1f2',
    bg2: '#ffe4e6',
    accent: '#f43f5e',
    secondary: '#fb7185',
    highlight: '#fde047',
    text: '#1f2937',
    muted: '#4b5563',
    border: '#1f2937',
    dot: '#fb7185',
    isLight: true
  },
  {
    id: 'sharp-mono',
    name: 'Monokrom Tajam',
    bg1: '#ffffff',
    bg2: '#e2e8f0',
    accent: '#0f172a',
    secondary: '#475569',
    highlight: '#fde047',
    text: '#09090b',
    muted: '#475569',
    border: '#09090b',
    dot: '#0f172a',
    isLight: true
  },
  {
    id: 'custom',
    name: 'Kustom Sendiri',
    bg1: '#f8fafc',
    bg2: '#e0f2fe',
    accent: '#38bdf8',
    secondary: '#a78bfa',
    highlight: '#fde047',
    text: '#0f172a',
    muted: '#334155',
    border: '#0f172a',
    dot: '#a855f7',
    isLight: true
  }
];

export const PROMPT_BG_PATTERNS = [
  { id: 'auto', name: 'Otomatis' },
  { id: 'grid-tilted', name: 'Grid Kotak Miring' },
  { id: 'grid-3d', name: 'Grid 3D Perspektif' },
  { id: 'aurora', name: 'Aurora Glow' },
  { id: 'waves', name: 'Gelombang Halus' },
  { id: 'plain', name: 'Polos Bersih' }
];

export const PROMPT_HERO_VISUALS = [
  { id: 'auto', name: 'Otomatis' },
  { id: 'browser-mockup', name: 'Browser 3D Melayang' },
  { id: 'device-duo', name: 'Laptop + HP' },
  { id: '3d-geometry', name: 'Geometri 3D Orbit' },
  { id: 'emblem-promo', name: 'Emblem Api / Promo' },
  { id: 'none', name: 'Tanpa Ilustrasi' }
];

export const PROMPT_CARD_STYLES = [
  { id: 'auto', name: 'Otomatis' },
  { id: 'neo-brutalist', name: 'Neo-Brutalist (Border Tegas)' },
  { id: 'glass', name: 'Glassmorphism' },
  { id: 'flat', name: 'Minimalis Flat' },
  { id: 'neon', name: 'Neon Glow' }
];

export const PROMPT_SCENE_PARTICLES = [
  { id: 'auto', name: 'Otomatis' },
  { id: 'petals-stars', name: 'Kelopak & Bintang' },
  { id: 'light-dust', name: 'Debu Cahaya' },
  { id: 'fire-sparks', name: 'Bara Api' },
  { id: 'off', name: 'Matikan' }
];

export const PROMPT_FONT_FAMILIES = [
  { id: 'geometric', name: 'Modern Geometris', css: "'Plus Jakarta Sans', 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif" },
  { id: 'bold-display', name: 'Bold Display', css: "'Montserrat', 'Arial Black', system-ui, sans-serif" },
  { id: 'editorial-serif', name: 'Editorial Serif', css: "'Georgia', 'Times New Roman', serif" },
  { id: 'tech-mono', name: 'Tech Mono', css: "'JetBrains Mono', ui-monospace, 'Cascadia Code', monospace" }
];

export const PROMPT_TEXT_SCALES = [
  { id: 'compact', name: 'Ringkas', factor: 0.86 },
  { id: 'normal', name: 'Normal', factor: 1.0 },
  { id: 'punchy', name: 'Besar Punchy', factor: 1.15 }
];

export const PROMPT_TEXT_ALIGNS = [
  { id: 'center', name: 'Tengah' },
  { id: 'left', name: 'Kiri Modern' }
];

export const PROMPT_TRANSITIONS = [
  { id: 'auto', name: 'Otomatis' },
  { id: 'wipe', name: 'Wipe Cepat' },
  { id: 'zoom', name: 'Zoom Smooth' },
  { id: 'slide', name: 'Slide Elastis' },
  { id: 'fade', name: 'Fade Sinematik' }
];

export const PROMPT_EASINGS = [
  { id: 'bouncy', name: 'Elastis (Bouncy)' },
  { id: 'smooth', name: 'Sinematik Halus' },
  { id: 'energetic', name: 'Cepat & Enerjik' },
  { id: 'calm', name: 'Tenang & Elegan' }
];

export const DEFAULT_TEXT_OPTIONS = {
  designStyle: 'auto',
  mood: 'auto',
  usePromptHexColors: true,
  customBg1: '#f8fafc',
  customBg2: '#e0f2fe',
  customAccent: '#38bdf8',
  customText: '#0f172a',
  bgPattern: 'auto',
  heroVisual: 'auto',
  cardStyle: 'auto',
  sceneParticles: 'auto',
  fontFamily: 'geometric',
  textScale: 'normal',
  textAlign: 'left',
  showProgressBar: true,
  showShimmer: true,
  showBrandBadge: true,
  showMetricCounters: true,
  transitionStyle: 'auto',
  motionEasing: 'bouncy',
  autoDuration: false
};

export const QUICK_PROMPT_SAMPLES = [
  {
    id: 'kuro-neobrutalist',
    label: 'Web Platform Neo-Brutalist',
    options: { designStyle: 'auto', mood: 'auto' },
    prompt: `Brand: KURO STUDIO
Judul: SATU WEB UNTUK SEMUA ALAT DIGITALMU!
Subjudul: Cepat, ringan, tanpa watermark, langsung jalan di HP & PC.

DESAIN & PALET WARNA:
- Gaya visual: Modern Neo-Brutalist bersih dipadukan aksen 3D glassmorphism futuristik (bukan tema gelap polos membosankan).
- Warna latar: Gradasi terang lembut putih mutiara (#f8fafc) ke biru langit pucat (#e0f2fe) dengan pola grid kotak tipis bergerak miring pelan di latar belakang.
- Warna aksen: Biru langit elektrik (#38bdf8), ungu lavender (#a78bfa), kuning stabilo (#fde047) untuk badge sorotan, dan garis tepi hitam tegas (#0f172a) dengan bayangan keras (hard shadow 6px 6px).

ALUR ADEGAN (TOTAL 12 DETIK, 60 FPS):
Adegan 1 (0.0s - 3.5s) Hook: Tampilkan badge KURO STUDIO memantul masuk, judul besar reveal per kata, dan ilustrasi jendela browser 3D melayang yang merakit komponennya.
Adegan 2 (3.5s - 8.5s) Fitur Utama:
- Downloader All-in-One | Unduh video TikTok, IG & YouTube bebas watermark
- Ghost WA Stealth Vault | Amankan view once dan baca chat tanpa centang biru
- Photo & PDF Studio | Edit, kompres, & konversi file seketika di browser
- Code to Video Engine | Render HTML/JS/CSS menjadi video MP4 60 FPS HD
Adegan 3 (8.5s - 12.0s) Closing CTA: Kartu penutup sorotan kuning stabilo dengan ajakan "COBA GRATIS SEKARANG", alamat alltoolskuro.vercel.app, serta progress bar tipis di bawah.`
  },
  {
    id: 'kuliner',
    label: 'Iklan Kuliner / Minuman',
    options: { designStyle: 'warm-promo', mood: 'crimson-fire' },
    prompt: `Brand: BAKSO KURO
Judul: BAKSO URAT MERCON PEDAS GILA!
Subjudul: Kuah kaldu sapi asli gurih berkepul, bikin nagih sejak suapan pertama.

Adegan 1 Hook: Mangkuk bakso urat mercon beruap dengan bara hangat menyala di latar.
Adegan 2 Keunggulan & Harga:
- 100% Daging Sapi Segar | Tanpa pengawet, tekstur urat renyah mantap
- Sambal Rawit Meledak | Level pedas bisa pilih sesuai nyali
Harga spesial diskon Rp 18.000 dari Rp 25.000 gratis es teh manis!
Adegan 3 CTA: Pesan sekarang di GoFood, GrabFood & ShopeeFood.`
  },
  {
    id: 'web-jasa',
    label: 'Promo Jasa Web & Aplikasi',
    options: { designStyle: 'glassmorphism', mood: 'deep-indigo' },
    prompt: `Brand: STUDIO DIGITAL NUSANTARA
Judul: BIKIN WEBSITE UMKM PROFESIONAL DALAM 3 HARI!
Subjudul: Tampilan premium di HP & laptop, siap tarik pembeli dari Google & WhatsApp.

Adegan 1 Showcase: Mockup laptop dan HP melayang berdampingan dengan grid neon biru (#38bdf8).
Adegan 2 Paket & Fitur:
- Desain Responsif Modern | Nyaman dibuka di layar HP dan desktop
- Gratis Domain .COM 1 Tahun | Plus SSL HTTPS & optimasi kecepatan 100%
Harga mulai Rp 499.000 dari Rp 950.000.
Adegan 3 Kontak CTA: Konsultasi gratis WA 0812-3456-7890 sekarang.`
  },
  {
    id: 'space-3d',
    label: 'Animasi 3D Luar Angkasa',
    options: { designStyle: '3d-space', mood: 'deep-indigo' },
    prompt: `Brand: VOYAGER LAB
Judul: MENJELAJAH ORBIT PLANET & NEBULA TANPA BATAS
Subjudul: Visualisasi antariksa 3D sinematik 60 FPS dengan kedalaman bintang parallax.

Adegan 1 Orbit: Objek planet cincin 3D berputar halus menembus kabut galaksi ungu (#a855f7) dan biru (#38bdf8).
Adegan 2 Statistik Misi:
- Kecepatan Cahaya Render 60 FPS
- Resolusi Ultra Tajam hingga 1440p
- 100% Deterministik Tanpa Frame Drop
Adegan 3 Penutup: Mulai ekspedisi visualmu hari ini.`
  },
  {
    id: 'quotes',
    label: 'Quotes Estetik Sinematik',
    options: { designStyle: 'quotes-editorial', mood: 'sakura-pastel' },
    prompt: `Brand: JURNAL SENJA
Judul: KONSISTENSI KECIL MENGALAHKAN RENCANA BESAR YANG TERTUNDA
Subjudul: Refleksi tenang untuk kreator yang sedang bertumbuh setiap hari.

Adegan 1 Renungan: Jangan takut melangkah pelan hari ini, karena batu karang pun ditempa oleh tetesan air yang sabar.
Adegan 2 Pesan Inti: Fokuslah pada kemajuan 1% lebih baik setiap pekan, bukan kesempurnaan sesaat yang melemahkan.
Adegan 3 Penutup: Simpan kutipan ini dan bagikan ke teman seperjuanganmu.`
  }
];

export function normalizeHex(rawHex = '') {
  const clean = String(rawHex || '').trim();
  if (!/^#[0-9a-fA-F]{3,6}$/.test(clean)) return '';
  if (clean.length === 4) {
    return `#${clean[1]}${clean[1]}${clean[2]}${clean[2]}${clean[3]}${clean[3]}`.toLowerCase();
  }
  return clean.slice(0, 7).toLowerCase();
}

export function getHexLuminance(hex = '#0f172a') {
  const n = normalizeHex(hex) || '#0f172a';
  const r = parseInt(n.slice(1, 3), 16) / 255;
  const g = parseInt(n.slice(3, 5), 16) / 255;
  const b = parseInt(n.slice(5, 7), 16) / 255;
  return r * 0.299 + g * 0.587 + b * 0.114;
}

function isNegatedTerm(lowerText, indexOfMatch) {
  const windowBefore = lowerText.slice(Math.max(0, indexOfMatch - 32), indexOfMatch);
  return /\b(?:bukan|tanpa|jangan|tidak|anti|hindari|no|not)\s+(?:tema|gaya|warna|latar|efek|mode)?\s*$/i.test(windowBefore)
    || /\b(?:bukan|tanpa|jangan|tidak|anti|hindari)\b[^.!?\n]{0,22}$/i.test(windowBefore);
}

function scoreKeywordList(lower, weightedTerms) {
  let score = 0;
  for (const [regex, weight] of weightedTerms) {
    const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`;
    const re = new RegExp(regex.source, flags);
    let m;
    while ((m = re.exec(lower)) !== null) {
      if (isNegatedTerm(lower, m.index)) {
        score -= weight * 1.2;
      } else {
        score += weight;
      }
    }
  }
  return score;
}

function extractContextualHexColors(rawPrompt) {
  const matches = Array.from(rawPrompt.matchAll(/#[0-9a-fA-F]{3,6}\b/g));
  const bgCandidates = [];
  const accentCandidates = [];
  const highlightCandidates = [];
  const borderTextCandidates = [];
  const allFound = [];

  for (const m of matches) {
    const hex = normalizeHex(m[0]);
    if (!hex) continue;
    allFound.push(hex);

    const beforeRaw = rawPrompt.slice(Math.max(0, m.index - 70), m.index);
    const localBefore = beforeRaw.split(/[,;\n]/).pop().toLowerCase();
    const afterRaw = rawPrompt.slice(m.index + m[0].length, Math.min(rawPrompt.length, m.index + m[0].length + 55));
    const localAfter = afterRaw.split(/[,;\n]/)[0].toLowerCase();
    const lineCtx = (rawPrompt.slice(0, m.index).split('\n').pop() + ' ' + localAfter).toLowerCase();
    const phrase = `${localBefore} ${localAfter}`;

    if (/\b(?:tepi|border|garis|bayangan|shadow|teks|text|ink|outline)\b/.test(phrase)) {
      borderTextCandidates.push(hex);
    } else if (/\b(?:sorotan|badge|highlight|stabilo|tag|stiker)\b/.test(phrase)) {
      highlightCandidates.push(hex);
    } else if (/\b(?:latar|background|gradasi|putih mutiara|pucat|canvas)\b/.test(lineCtx) && !/\baksen\b/.test(lineCtx)) {
      bgCandidates.push(hex);
    } else {
      accentCandidates.push(hex);
    }
  }

  return {
    allFound: [...new Set(allFound)],
    bg1: bgCandidates[0] || '',
    bg2: bgCandidates[1] || '',
    accent: accentCandidates[0] || '',
    secondary: accentCandidates[1] || '',
    highlight: highlightCandidates[0] || '',
    borderText: borderTextCandidates[0] || ''
  };
}

function detectDesignSystem(lower, explicitStyle = 'auto') {
  const mapExplicit = {
    'neo-brutalist': 'neo-brutalist',
    glassmorphism: 'glassmorphism',
    'warm-promo': 'warm-promo',
    'culinary-warm': 'warm-promo',
    'kinetic-type': 'kinetic-type',
    'editorial-minimal': 'editorial-minimal',
    'quotes-editorial': 'editorial-minimal',
    'cyber-neon': 'cyber-neon',
    '3d-space': '3d-space'
  };
  if (explicitStyle && explicitStyle !== 'auto' && mapExplicit[explicitStyle]) {
    return mapExplicit[explicitStyle];
  }

  const scores = {
    'neo-brutalist': scoreKeywordList(lower, [
      [/neo[\s-]?brutalis[mt]?/i, 8],
      [/hard[\s-]?shadow|bayangan keras/i, 6],
      [/border hitam|garis tepi hitam|garis tegas|kotak tegas/i, 6],
      [/terang lembut|putih mutiara/i, 3]
    ]),
    glassmorphism: scoreKeywordList(lower, [
      [/glassmorphism|frosted glass|efek kaca|transparan blur/i, 5],
      [/ambient orb|floating card/i, 3]
    ]),
    'cyber-neon': scoreKeywordList(lower, [
      [/cyberpunk|neon glow|matrix|hologram|synthwave|spektrum audio|gaming/i, 5],
      [/grid 3d|perspektif neon|laser/i, 3]
    ]),
    'warm-promo': scoreKeywordList(lower, [
      [/bakso|kuliner|minuman|makanan|pedas|mercon|kuah|kopi|matcha|resto|warung|cafe|diskon\s+menu/i, 6],
      [/promo kilat|flash sale|beli\s+\d+\s+gratis/i, 4]
    ]),
    'editorial-minimal': scoreKeywordList(lower, [
      [/quotes|kutipan|motivasi|renungan|puisi|sajak|refleksi|editorial/i, 7],
      [/minimalis bersih|estetik tenang|jurnal/i, 4]
    ]),
    '3d-space': scoreKeywordList(lower, [
      [/tata surya|luar angkasa|antariksa|astronot|galaksi|nebula|orbit planet|planet cincin/i, 7]
    ])
  };

  let best = 'neo-brutalist';
  let bestScore = 0;
  for (const [k, sc] of Object.entries(scores)) {
    if (sc > bestScore) {
      bestScore = sc;
      best = k;
    }
  }
  return bestScore > 0 ? best : 'editorial-minimal';
}

function detectHeroVisual(lower, designSystem, explicitHero = 'auto') {
  if (explicitHero && explicitHero !== 'auto') return explicitHero;
  if (/\b(?:jendela\s+browser|browser\s+3d|browser\s+mockup)\b/.test(lower)) {
    return 'browser-mockup';
  }
  if (/\b(?:laptop|smartphone|mockup\s+hp)\b/.test(lower)) {
    return 'device-duo';
  }
  if (/\b(?:browser|website|web\s+platform|dashboard|landing\s+page|saas|aplikasi\s+web)\b/.test(lower)) {
    return 'browser-mockup';
  }
  if (/\b(?:mobile\s*&\s*pc|hp\s*&\s*pc|perangkat|responsif)\b/.test(lower)) {
    return 'device-duo';
  }
  if (designSystem === '3d-space' || /\b(?:planet|orbit|tata surya|kubus 3d|geometri 3d|wireframe)\b/.test(lower)) {
    return '3d-geometry';
  }
  if (designSystem === 'warm-promo' || /\b(?:bakso|kopi|makan|minum|api|mercon)\b/.test(lower)) {
    return 'emblem-promo';
  }
  if (designSystem === 'editorial-minimal') {
    return 'none';
  }
  return 'browser-mockup';
}

function resolvePalette(rawPrompt, lower, designSystem, options = {}) {
  const moodId = options.mood || 'auto';
  const useHex = options.usePromptHexColors !== false;
  const hexInfo = extractContextualHexColors(rawPrompt);

  let baseMood = PROMPT_COLOR_MOODS.find((m) => m.id === moodId && m.id !== 'auto');

  if (!baseMood) {
    // Cek kecenderungan terang vs gelap dengan deteksi negasi
    const lightScore = scoreKeywordList(lower, [
      [/putih mutiara|gradasi terang|tema terang|latar terang|biru langit pucat|sakura|ivory|terang bersih/i, 6],
      [/neo[\s-]?brutalis/i, 4]
    ]);
    const darkScore = scoreKeywordList(lower, [
      [/tema gelap|latar gelap|hitam pekat|malam|dark mode|obsidian/i, 5]
    ]);

    if (designSystem === 'warm-promo') {
      baseMood = PROMPT_COLOR_MOODS.find((m) => m.id === 'crimson-fire');
    } else if (designSystem === '3d-space' || designSystem === 'cyber-neon') {
      baseMood = PROMPT_COLOR_MOODS.find((m) => m.id === 'deep-indigo');
    } else if (lightScore >= darkScore || designSystem === 'neo-brutalist') {
      baseMood = PROMPT_COLOR_MOODS.find((m) => m.id === 'pearl-sky');
    } else {
      baseMood = PROMPT_COLOR_MOODS.find((m) => m.id === 'deep-indigo');
    }
  }

  let pal = { ...baseMood };

  if (moodId === 'custom') {
    pal.bg1 = normalizeHex(options.customBg1 || options.bgColor1) || pal.bg1;
    pal.bg2 = normalizeHex(options.customBg2 || options.bgColor2) || pal.bg2;
    pal.accent = normalizeHex(options.customAccent || options.tintColor) || pal.accent;
    pal.text = normalizeHex(options.customText || options.hudTextColor) || pal.text;
    pal.isLight = getHexLuminance(pal.bg1) > 0.55;
    pal.border = pal.isLight ? '#0f172a' : pal.accent;
    pal.muted = pal.isLight ? '#334155' : '#cbd5e1';
    return pal;
  }

  if (useHex && hexInfo.allFound.length > 0) {
    if (hexInfo.bg1) pal.bg1 = hexInfo.bg1;
    if (hexInfo.bg2) pal.bg2 = hexInfo.bg2;
    else if (hexInfo.bg1) pal.bg2 = hexInfo.bg1;

    if (hexInfo.accent) pal.accent = hexInfo.accent;
    if (hexInfo.secondary) pal.secondary = hexInfo.secondary;
    if (hexInfo.highlight) pal.highlight = hexInfo.highlight;
    if (hexInfo.borderText) {
      pal.border = hexInfo.borderText;
      if (getHexLuminance(pal.bg1) > 0.55) {
        pal.text = hexInfo.borderText;
      }
    }
    pal.isLight = getHexLuminance(pal.bg1) > 0.55;
    pal.text = pal.isLight ? (hexInfo.borderText && getHexLuminance(hexInfo.borderText) < 0.45 ? hexInfo.borderText : '#0f172a') : '#f8fafc';
    pal.muted = pal.isLight ? '#334155' : '#cbd5e1';
    if (!hexInfo.borderText) {
      pal.border = pal.isLight ? '#0f172a' : pal.accent;
    }
    pal.name = 'Hex Kustom dari Teks';
  }

  return pal;
}

function stripLabeledPrefix(line = '') {
  return String(line)
    .replace(/^(?:brand|merek|nama brand|judul|headline|title|subjudul|subtitle|tagline|cta|ajakan|link|harga|promo|hook)\s*[:=\-]\s*/i, '')
    .trim();
}

function isDesignSpecLine(line = '') {
  const low = line.trim().toLowerCase();
  if (!low) return true;
  if (/^[-*•]?\s*(?:gaya visual|warna latar|warna aksen|palet warna|desain & palet|alur adegan|progress bar|catatan visual)\s*[:]/i.test(low)) {
    return true;
  }
  if (/^(?:DESAIN\s*&\s*PALET\s*WARNA|ALUR\s*ADEGAN|SPESIFIKASI\s*VISUAL)[:\s]*$/i.test(line.trim())) {
    return true;
  }
  if (/^[-*•]?\s*(?:progress bar|shadow|bayangan keras|garis tepi hitam|tema gelap)/i.test(low) && !/fitur|keunggulan|paket/i.test(low)) {
    return true;
  }
  return false;
}

function extractExplicitDurationSec(rawPrompt) {
  const minMatch = rawPrompt.match(/(?:total|durasi)\s*[:=]?\s*(\d{1,2})\s*(?:menit|minutes?|m\b)/i);
  if (minMatch) return Math.min(300, Math.max(5, parseInt(minMatch[1], 10) * 60));

  const secMatch = rawPrompt.match(/(?:total|durasi)\s*[:=]?\s*(\d{1,3})\s*(?:detik|seconds?|s\b)/i);
  if (secMatch) return Math.min(300, Math.max(4, parseInt(secMatch[1], 10)));

  // Cari timestamp akhir terbesar misal (8.5s - 12.0s) atau (0:00 - 2:00)
  const minSecRanges = Array.from(rawPrompt.matchAll(/(\d{1,2}):([0-5]\d)\s*(?:-|s\.d|sd|to)\s*(\d{1,2}):([0-5]\d)/g));
  if (minSecRanges.length > 0) {
    const last = minSecRanges[minSecRanges.length - 1];
    const total = parseInt(last[3], 10) * 60 + parseInt(last[4], 10);
    if (total >= 4) return Math.min(300, total);
  }

  const secRanges = Array.from(rawPrompt.matchAll(/(\d+(?:\.\d+)?)\s*s\s*[-–—]\s*(\d+(?:\.\d+)?)\s*s/gi));
  if (secRanges.length > 0) {
    const maxEnd = Math.max(...secRanges.map((m) => parseFloat(m[2]) || 0));
    if (maxEnd >= 4) return Math.min(300, Math.round(maxEnd));
  }

  return 0;
}

function normalizePriceNumber(rawStr) {
  const cleaned = rawStr.toLowerCase().replace(/\s+/g, '');
  let mult = 1;
  if (cleaned.endsWith('rb') || cleaned.endsWith('k')) mult = 1000;
  if (cleaned.endsWith('jt')) mult = 1000000;
  const digits = cleaned.replace(/[^0-9]/g, '');
  return (parseInt(digits, 10) || 0) * mult;
}

function extractPromoDetails(rawPrompt) {
  const priceMatches = Array.from(
    rawPrompt.matchAll(/(?:rp\.?\s*|idr\s*|\$)\s*\d[\d.,]*(?:\s*(?:rb|k|jt))?|\b\d+(?:[.,]\d+)?\s*(?:rb|ribu|jt)\b/gi)
  ).map((m) => m[0].trim());

  const uniquePrices = [...new Set(priceMatches)];
  let promoPrice = '';
  let oldPrice = '';

  if (uniquePrices.length >= 2) {
    const sorted = uniquePrices
      .map((label) => ({ label, num: normalizePriceNumber(label) }))
      .filter((x) => x.num > 0)
      .sort((a, b) => a.num - b.num);
    if (sorted.length >= 2) {
      promoPrice = sorted[0].label;
      oldPrice = sorted[sorted.length - 1].label;
      if (promoPrice === oldPrice) oldPrice = '';
    }
  } else if (uniquePrices.length === 1) {
    promoPrice = uniquePrices[0];
  }

  const discMatch = rawPrompt.match(/(?:diskon|hemat|potongan|off)\s*(\d{1,2}\s*%)/i)
    || rawPrompt.match(/(\d{1,2}\s*%)\s*(?:off|diskon|hemat)/i);
  const discountBadge = discMatch
    ? `HEMAT ${discMatch[1].replace(/\s+/g, '')}`
    : (promoPrice && oldPrice ? 'PROMO SPESIAL' : '');

  return { promoPrice, oldPrice, discountBadge };
}

function extractMetricsFromText(rawText = '') {
  const matches = Array.from(
    rawText.matchAll(/\b(\d{1,4}(?:[.,]\d+)?)\s*(%|FPS|p\b|x\b|jam|hari|menit|detik|ms|K\+|M\+|\+)/gi)
  );
  const out = [];
  const seen = new Set();
  for (const m of matches) {
    const val = `${m[1]}${m[2] === 'jam' || m[2] === 'hari' || m[2] === 'menit' || m[2] === 'detik' ? ` ${m[2]}` : m[2]}`;
    if (seen.has(val)) continue;
    seen.add(val);
    const after = rawText.slice(m.index + m[0].length, m.index + m[0].length + 34).split(/[,.;\n|]/)[0].trim();
    const before = rawText.slice(Math.max(0, m.index - 28), m.index).split(/[,.;\n|]/).pop().trim();
    const label = (after.length >= 3 ? after : before) || 'Performa Optimal';
    out.push({ value: val, label: label.slice(0, 32) });
    if (out.length >= 3) break;
  }
  return out;
}

function extractCoreEntities(rawPrompt) {
  const lines = rawPrompt.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // 1. Ekstrak Brand murni (tanpa fallback palsu)
  let brand = '';
  for (const line of lines) {
    const m = line.match(/^(?:[-*•]\s*)?(?:brand|merek|nama brand|studio|oleh)\s*[:=]\s*(.+)$/i);
    if (m) {
      brand = m[1].replace(/^(?:brand|merek)\s*:\s*/i, '').trim();
      break;
    }
  }
  if (!brand) {
    const byMatch = rawPrompt.match(/\b(?:by|oleh)\s+([A-Z0-9][A-Za-z0-9\s.&'-]{1,26}?)(?=[,.;:\n]|$)/i);
    if (byMatch) brand = byMatch[1].trim();
  }
  if (!brand) {
    const handleMatch = rawPrompt.match(/@([A-Za-z0-9_.]{3,24})/);
    if (handleMatch) brand = `@${handleMatch[1]}`;
  }

  // 2. Ekstrak Judul & Subjudul eksplisit
  let headline = '';
  let subheadline = '';
  for (const line of lines) {
    const hMatch = line.match(/^(?:[-*•]\s*)?(?:judul(?:\s+utama)?|headline|title)\s*[:=]\s*(.+)$/i);
    if (hMatch && !headline) {
      headline = stripLabeledPrefix(hMatch[1]);
      continue;
    }
    const sMatch = line.match(/^(?:[-*•]\s*)?(?:subjudul|subtitle|tagline|keterangan)\s*[:=]\s*(.+)$/i);
    if (sMatch && !subheadline) {
      subheadline = stripLabeledPrefix(sMatch[1]);
    }
  }

  // Fallback Judul & Subjudul dari baris non-instruksi pertama
  const contentLines = lines.filter((l) => !isDesignSpecLine(l) && !/^(?:brand|merek)\s*[:=]/i.test(l));
  if (!headline) {
    const firstValid = contentLines.find((l) => !/^(?:adegan|scene|bagian|slide)\s*\d+/i.test(l));
    headline = stripLabeledPrefix(firstValid || 'PRESENTASI VISUAL').slice(0, 72);
  }
  if (!subheadline) {
    const secondValid = contentLines.filter((l) => l !== headline && !/^(?:adegan|scene|bagian|slide)\s*\d+/i.test(l))[0];
    subheadline = secondValid ? stripLabeledPrefix(secondValid).slice(0, 110) : '';
  }

  // 3. Ekstrak CTA, Domain & Kontak tanpa jebakan kata acak
  let cta = '';
  const quotedCta = rawPrompt.match(/(?:ajakan|cta|tombol)[^"\n]*["“]([^"”]{3,42})["”]/i);
  const labeledCta = rawPrompt.match(/^(?:[-*•]\s*)?(?:cta|tombol cta|ajakan)\s*[:=]\s*(.+)$/im);
  const waMatch = rawPrompt.match(/\b(?:WA|WhatsApp)\s*[:#]?\s*((?:\+?62|08)[\d\s-]{7,15})/i);
  const domainMatch = rawPrompt.match(/\b([a-z0-9-]+\.(?:vercel\.app|id|com|co\.id|net|io|app|org))\b/i);
  const marketMatch = rawPrompt.match(/\b((?:GoFood|GrabFood|ShopeeFood|Tokopedia|Shopee|TikTok\s*Shop)(?:\s*(?:,|dan|&|\/)\s*(?:GoFood|GrabFood|ShopeeFood|Tokopedia|Shopee|TikTok\s*Shop))*)/i);

  if (quotedCta) {
    cta = quotedCta[1].trim().toUpperCase();
  } else if (labeledCta) {
    cta = stripLabeledPrefix(labeledCta[1]).toUpperCase();
  } else if (waMatch) {
    cta = `KONSULTASI WA ${waMatch[1].trim()}`;
  } else {
    const actionMatch = rawPrompt.match(/\b((?:coba|pesan|beli|mulai|klaim|daftar|booking|konsultasi|kunjungi|simpan|bagikan)(?:\s+(?:gratis|sekarang|di|hari ini|kutipan)){1,3})/i);
    if (actionMatch && !isNegatedTerm(rawPrompt.toLowerCase(), actionMatch.index)) {
      cta = actionMatch[1].trim().toUpperCase();
    }
  }

  const channelParts = [];
  if (domainMatch) channelParts.push(domainMatch[1]);
  if (marketMatch) channelParts.push(`Tersedia di ${marketMatch[1].replace(/\s*,\s*/g, ' • ')}`);
  if (waMatch && (!cta || !cta.includes(waMatch[1].trim()))) {
    channelParts.push(`WA ${waMatch[1].trim()}`);
  }

  const promo = extractPromoDetails(rawPrompt);

  return {
    brand: brand ? brand.toUpperCase() : '',
    headline: stripLabeledPrefix(headline),
    subheadline: stripLabeledPrefix(subheadline),
    cta,
    channelLine: channelParts.join('  •  '),
    ...promo,
    rawPrompt
  };
}

function parseBulletCardItem(rawLine) {
  const clean = rawLine.replace(/^[-*•\d.)\s]+/, '').trim();
  if (!clean || isDesignSpecLine(clean)) return null;

  if (clean.includes('|')) {
    const [left, ...rest] = clean.split('|');
    return {
      title: left.replace(/^(?:kartu|poin|fitur)\s*\d*\s*[:=]\s*/i, '').trim().slice(0, 44),
      desc: rest.join(' • ').trim().slice(0, 96)
    };
  }
  const colonIdx = clean.indexOf(':');
  if (colonIdx > 2 && colonIdx < 36 && !/^https?:/i.test(clean)) {
    return {
      title: clean.slice(0, colonIdx).replace(/^(?:kartu|poin|fitur)\s*\d*\s*/i, '').trim().slice(0, 44),
      desc: clean.slice(colonIdx + 1).trim().slice(0, 96)
    };
  }
  return {
    title: clean.slice(0, 44),
    desc: clean.length > 44 ? clean.slice(44, 120).trim() : ''
  };
}

function splitExplicitScenes(rawPrompt) {
  const lines = rawPrompt.split(/\r?\n/);
  const sceneHeaderRe = /^(?:[-*•#]*\s*)?(?:adegan|scene|bagian|slide)\s*(\d+)\b(.*)$/i;

  const explicitBlocks = [];
  let currentBlock = null;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    const headerMatch = trimmed.match(sceneHeaderRe);
    if (headerMatch) {
      if (currentBlock) explicitBlocks.push(currentBlock);
      const restHeader = headerMatch[2] || '';
      const timeRangeMatch = restHeader.match(/(\d+(?:\.\d+)?)\s*s?\s*[-–—]\s*(\d+(?:\.\d+)?)\s*s?/i);
      const minSecMatch = restHeader.match(/(\d{1,2}):([0-5]\d)\s*[-–—]\s*(\d{1,2}):([0-5]\d)/);

      let startSec = null;
      let endSec = null;
      if (minSecMatch) {
        startSec = parseInt(minSecMatch[1], 10) * 60 + parseInt(minSecMatch[2], 10);
        endSec = parseInt(minSecMatch[3], 10) * 60 + parseInt(minSecMatch[4], 10);
      } else if (timeRangeMatch) {
        startSec = parseFloat(timeRangeMatch[1]);
        endSec = parseFloat(timeRangeMatch[2]);
      }

      const cleanTitle = restHeader
        .replace(/\(?\d+(?:\.\d+)?\s*s?\s*[-–—]\s*\d+(?:\.\d+)?\s*s?\)?/gi, '')
        .replace(/\(?(\d{1,2}):([0-5]\d)\s*[-–—]\s*(\d{1,2}):([0-5]\d)\)?/g, '')
        .replace(/^[\s:.\-–—]+|[\s:.\-–—]+$/g, '')
        .trim();

      currentBlock = {
        index: parseInt(headerMatch[1], 10),
        headerLabel: cleanTitle,
        startSec,
        endSec,
        lines: []
      };
      continue;
    }

    if (currentBlock) {
      currentBlock.lines.push(trimmed);
    }
  }
  if (currentBlock) explicitBlocks.push(currentBlock);

  return explicitBlocks;
}

function buildMultiSceneTimeline({ rawPrompt, entities, designSystem, heroVisual, targetDuration, transitionStyle }) {
  const explicitBlocks = splitExplicitScenes(rawPrompt);
  const scenes = [];

  if (explicitBlocks.length > 0) {
    explicitBlocks.forEach((block, idx) => {
      const joinedBody = block.lines.join(' ');
      const headerLow = `${block.headerLabel} ${joinedBody}`.toLowerCase();
      const bulletCards = [];
      const plainParagraphs = [];

      for (const l of block.lines) {
        if (/^[-*•]\s+|^\d+\.\s+/.test(l) || l.includes('|')) {
          const card = parseBulletCardItem(l);
          if (card) bulletCards.push(card);
        } else if (!isDesignSpecLine(l)) {
          const cleanP = stripLabeledPrefix(l);
          if (cleanP.length >= 3) plainParagraphs.push(cleanP);
        }
      }

      let kind = 'StoryNarrativeScene';
      const isFirst = idx === 0;
      const isLast = idx === explicitBlocks.length - 1;

      if (isFirst || /\b(?:hook|intro|pembuka|reveal|showcase)\b/.test(headerLow)) {
        kind = 'HookHeroScene';
      } else if (isLast && (/\b(?:closing|penutup|cta|kontak|ajakan|akhir)\b/.test(headerLow) || entities.cta || entities.channelLine)) {
        kind = 'ClosingCTAScene';
      } else if (/\b(?:harga|promo|paket|diskon)\b/.test(headerLow) && (entities.promoPrice || /\brp\b/i.test(joinedBody))) {
        kind = 'PricingPromoScene';
      } else if (/\b(?:statistik|angka|metrik|performa|data|fakta)\b/.test(headerLow) && extractMetricsFromText(joinedBody).length > 0) {
        kind = 'MetricStatsScene';
      } else if (bulletCards.length >= 2 || /\b(?:fitur|keunggulan|paket|menu|poin)\b/.test(headerLow)) {
        kind = 'FeatureGridScene';
      }

      const sceneTitle =
        kind === 'HookHeroScene'
          ? entities.headline
          : kind === 'ClosingCTAScene'
          ? (entities.cta || block.headerLabel || entities.headline)
          : (block.headerLabel.replace(/[:]+$/g, '').trim() || plainParagraphs[0]?.slice(0, 48) || entities.headline);

      const sceneSubtitle =
        kind === 'HookHeroScene'
          ? (entities.subheadline || plainParagraphs[0] || '')
          : kind === 'ClosingCTAScene'
          ? (entities.channelLine || plainParagraphs[0] || entities.subheadline)
          : (plainParagraphs.filter((p) => p !== sceneTitle).join(' ').slice(0, 150));

      const metrics = kind === 'MetricStatsScene' ? extractMetricsFromText(joinedBody) : [];
      const fallbackCards = bulletCards.length > 0
        ? bulletCards
        : plainParagraphs.slice(0, 4).map((p) => ({ title: p.slice(0, 44), desc: p.slice(44, 110) }));

      scenes.push({
        id: `scene-${idx + 1}`,
        index: idx,
        kind,
        title: sceneTitle,
        subtitle: sceneSubtitle,
        badge: entities.brand || '',
        cards: fallbackCards.slice(0, 6),
        metrics,
        promoPrice: entities.promoPrice,
        oldPrice: entities.oldPrice,
        discountBadge: entities.discountBadge,
        cta: entities.cta,
        channelLine: entities.channelLine,
        heroVisual: kind === 'HookHeroScene' ? heroVisual : 'none',
        explicitStart: block.startSec,
        explicitEnd: block.endSec,
        transition: transitionStyle === 'auto'
          ? (idx % 3 === 0 ? 'wipe' : idx % 3 === 1 ? 'slide' : 'zoom')
          : transitionStyle
      });
    });
  } else {
    // Parsing cerdas untuk prompt paragraf / daftar poin tanpa label Adegan eksplisit
    const lines = rawPrompt.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !isDesignSpecLine(l));
    const bullets = lines.filter((l) => /^[-*•]\s+|^\d+\.\s+/.test(l) || l.includes('|')).map(parseBulletCardItem).filter(Boolean);
    const sentences = lines
      .filter((l) => !/^[-*•]\s+|^\d+\.\s+/.test(l) && !/^(?:brand|merek|judul|subjudul|cta)\s*[:=]/i.test(l))
      .join(' ')
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 6);

    // Adegan 1: Hook
    scenes.push({
      id: 'scene-1',
      index: 0,
      kind: 'HookHeroScene',
      title: entities.headline,
      subtitle: entities.subheadline || sentences[0] || '',
      badge: entities.brand,
      cards: [],
      metrics: [],
      heroVisual,
      transition: transitionStyle === 'auto' ? 'wipe' : transitionStyle
    });

    // Adegan Tengah: Fitur / Harga / Metrik / Narasi bertingkat
    if (bullets.length >= 2) {
      for (let i = 0; i < bullets.length; i += 4) {
        const chunk = bullets.slice(i, i + 4);
        scenes.push({
          id: `scene-${scenes.length + 1}`,
          index: scenes.length,
          kind: 'FeatureGridScene',
          title: i === 0 ? 'KEUNGGULAN UTAMA' : 'FITUR LANJUTAN',
          subtitle: '',
          badge: entities.brand,
          cards: chunk,
          metrics: [],
          heroVisual: 'none',
          transition: transitionStyle === 'auto' ? 'slide' : transitionStyle
        });
      }
    } else if (sentences.length >= 2) {
      // Naskah cerita / quotes multi-adegan untuk durasi panjang (hingga 5 menit!)
      for (let i = 0; i < Math.min(sentences.length, 24); i += 2) {
        const chunkTitle = sentences[i].slice(0, 72);
        const chunkSub = sentences[i + 1] ? sentences[i + 1].slice(0, 120) : '';
        const localMetrics = extractMetricsFromText(`${chunkTitle} ${chunkSub}`);
        scenes.push({
          id: `scene-${scenes.length + 1}`,
          index: scenes.length,
          kind: localMetrics.length >= 2 ? 'MetricStatsScene' : 'StoryNarrativeScene',
          title: chunkTitle,
          subtitle: chunkSub,
          badge: entities.brand,
          cards: [],
          metrics: localMetrics,
          heroVisual: 'none',
          transition: transitionStyle === 'auto' ? 'fade' : transitionStyle
        });
      }
    }

    if (entities.promoPrice) {
      scenes.push({
        id: `scene-${scenes.length + 1}`,
        index: scenes.length,
        kind: 'PricingPromoScene',
        title: 'PENAWARAN SPESIAL',
        subtitle: entities.subheadline,
        badge: entities.discountBadge || entities.brand,
        promoPrice: entities.promoPrice,
        oldPrice: entities.oldPrice,
        discountBadge: entities.discountBadge,
        cards: [],
        metrics: [],
        heroVisual: 'none',
        transition: transitionStyle === 'auto' ? 'zoom' : transitionStyle
      });
    }

    if (entities.cta || entities.channelLine || scenes.length === 1) {
      scenes.push({
        id: `scene-${scenes.length + 1}`,
        index: scenes.length,
        kind: 'ClosingCTAScene',
        title: entities.cta || entities.headline,
        subtitle: entities.channelLine || entities.subheadline,
        badge: entities.brand,
        cta: entities.cta || 'LIHAT SELENGKAPNYA →',
        channelLine: entities.channelLine,
        cards: [],
        metrics: [],
        heroVisual: 'none',
        transition: transitionStyle === 'auto' ? 'fade' : transitionStyle
      });
    }
  }

  // Hitung alokasi waktu presisi dari 0 .. totalDuration
  const explicitTotal = extractExplicitDurationSec(rawPrompt);
  const wordCount = rawPrompt.trim().split(/\s+/).filter(Boolean).length;
  const recommendedDuration = explicitTotal > 0
    ? explicitTotal
    : Math.max(8, Math.min(300, Math.max(scenes.length * 4, Math.round(wordCount * 0.35))));

  const finalTotalDuration = Math.max(3, Math.min(300, Number(targetDuration) || recommendedDuration));

  const hasExplicitAll = scenes.every(
    (s) => typeof s.explicitStart === 'number' && typeof s.explicitEnd === 'number' && s.explicitEnd > s.explicitStart
  );
  const rawMaxExplicit = hasExplicitAll ? Math.max(...scenes.map((s) => s.explicitEnd)) : 0;

  if (hasExplicitAll && rawMaxExplicit > 0) {
    const scaleFactor = finalTotalDuration / rawMaxExplicit;
    scenes.forEach((s, idx) => {
      s.startTime = Number((s.explicitStart * scaleFactor).toFixed(3));
      s.endTime = idx === scenes.length - 1
        ? finalTotalDuration
        : Number((s.explicitEnd * scaleFactor).toFixed(3));
      s.duration = Math.max(0.5, Number((s.endTime - s.startTime).toFixed(3)));
    });
  } else {
    // Beri bobot sedikit lebih besar pada adegan ber-kartu/teks panjang
    const weights = scenes.map((s) => {
      if (s.kind === 'FeatureGridScene') return 1.35;
      if (s.kind === 'StoryNarrativeScene') return 1.15;
      return 1.0;
    });
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let cursor = 0;
    scenes.forEach((s, idx) => {
      const span = idx === scenes.length - 1
        ? (finalTotalDuration - cursor)
        : (weights[idx] / totalWeight) * finalTotalDuration;
      s.startTime = Number(cursor.toFixed(3));
      s.endTime = Number((cursor + span).toFixed(3));
      s.duration = Math.max(0.5, Number(span.toFixed(3)));
      cursor += span;
    });
  }

  return { scenes, recommendedDuration, totalDuration: finalTotalDuration };
}

/**
 * Compiler Utama Text Prompt -> SceneGraph Multi-Adegan + Kode HTML5 Canvas 60 FPS
 */
export function compileTextPromptToSceneGraph(rawPromptText = '', rawOptions = {}, requestedDurationSec = 12) {
  const optIn = rawOptions || {};
  const isPure = Boolean(optIn.pureBypassMode);

  const normalizedFont = !optIn.fontFamily || optIn.fontFamily === 'original' ? 'geometric' : optIn.fontFamily;
  const normalizedPattern = !optIn.bgPattern || optIn.bgPattern === 'none' ? 'auto' : optIn.bgPattern;
  const normalizedTransition = !optIn.transitionStyle || optIn.transitionStyle === 'none' ? 'auto' : optIn.transitionStyle;

  const options = isPure
    ? { ...DEFAULT_TEXT_OPTIONS, autoDuration: Boolean(optIn.autoDuration) }
    : {
        ...DEFAULT_TEXT_OPTIONS,
        ...optIn,
        designStyle: optIn.designStyle || optIn.visualStyle || 'auto',
        bgPattern: normalizedPattern,
        fontFamily: normalizedFont,
        transitionStyle: normalizedTransition,
        sceneParticles: optIn.sceneParticles || (optIn.particles ? (optIn.particleStyle || 'petals-stars') : 'auto'),
        showProgressBar: optIn.showProgressBar ?? true,
        showShimmer: optIn.showShimmer ?? true,
        showBrandBadge: optIn.showBrandBadge ?? true,
        showMetricCounters: optIn.showMetricCounters ?? true,
        customBg1: optIn.customBg1 || optIn.bgColor1 || DEFAULT_TEXT_OPTIONS.customBg1,
        customBg2: optIn.customBg2 || optIn.bgColor2 || DEFAULT_TEXT_OPTIONS.customBg2,
        customAccent: optIn.customAccent || optIn.tintColor || DEFAULT_TEXT_OPTIONS.customAccent,
        customText: optIn.customText || optIn.hudTextColor || DEFAULT_TEXT_OPTIONS.customText
      };

  const promptText = String(rawPromptText || '').trim() || QUICK_PROMPT_SAMPLES[0].prompt;
  const lower = promptText.toLowerCase();

  const designSystem = detectDesignSystem(lower, options.designStyle);
  const heroVisual = detectHeroVisual(lower, designSystem, options.heroVisual);
  const palette = resolvePalette(promptText, lower, designSystem, options);
  const entities = extractCoreEntities(promptText);
  if (!isPure && optIn.brandBadgeEnabled && String(optIn.brandBadgeText || '').trim()) {
    entities.brand = String(optIn.brandBadgeText).trim().toUpperCase();
  }

  const explicitPromptDur = extractExplicitDurationSec(promptText);
  const durationToUse = options.autoDuration
    ? (explicitPromptDur || undefined)
    : Math.max(3, Math.min(300, Number(requestedDurationSec) || explicitPromptDur || 12));

  const timeline = buildMultiSceneTimeline({
    rawPrompt: promptText,
    entities,
    designSystem,
    heroVisual,
    targetDuration: durationToUse,
    transitionStyle: options.transitionStyle || 'auto'
  });

  // Bangun layer & subtitle SRT yang 100% sinkron dengan seluruh adegan untuk Alight Motion / CapCut / FCPXML
  const layers = [
    {
      id: 'bg-stage',
      kind: 'background',
      label: 'Latar Dinamis',
      startTime: 0,
      endTime: timeline.totalDuration,
      color: palette.bg1
    }
  ];
  const subtitles = [];

  timeline.scenes.forEach((scene, sIdx) => {
    if (scene.badge && options.showBrandBadge !== false) {
      layers.push({
        id: `s${sIdx + 1}-badge`,
        kind: 'badge',
        text: scene.badge,
        startTime: scene.startTime,
        endTime: scene.endTime,
        x: 0.5,
        y: 0.12,
        fontSize: 22,
        color: palette.isLight ? palette.border : palette.text,
        bgColor: palette.highlight || palette.accent
      });
    }

    if (scene.title) {
      layers.push({
        id: `s${sIdx + 1}-headline`,
        kind: 'headline',
        text: scene.title,
        startTime: scene.startTime,
        endTime: scene.endTime,
        x: 0.5,
        y: 0.3,
        fontSize: 48,
        color: palette.text
      });
      subtitles.push({
        startTime: scene.startTime,
        endTime: scene.endTime,
        text: scene.title
      });
    }

    if (scene.subtitle) {
      layers.push({
        id: `s${sIdx + 1}-subtitle`,
        kind: 'subheadline',
        text: scene.subtitle,
        startTime: Number((scene.startTime + 0.15).toFixed(2)),
        endTime: scene.endTime,
        x: 0.5,
        y: 0.44,
        fontSize: 24,
        color: palette.muted
      });
    }

    (scene.cards || []).forEach((card, cIdx) => {
      layers.push({
        id: `s${sIdx + 1}-card-${cIdx + 1}`,
        kind: 'point',
        text: card.desc ? `${card.title}: ${card.desc}` : card.title,
        startTime: Number(Math.min(scene.endTime - 0.3, scene.startTime + 0.25 + cIdx * 0.18).toFixed(2)),
        endTime: scene.endTime,
        x: 0.5,
        y: Math.min(0.84, 0.52 + cIdx * 0.1),
        fontSize: 22,
        color: palette.text,
        bgColor: palette.bg1
      });
    });

    if (scene.kind === 'PricingPromoScene' && scene.promoPrice) {
      layers.push({
        id: `s${sIdx + 1}-price`,
        kind: 'price',
        text: scene.oldPrice ? `${scene.promoPrice} (dari ${scene.oldPrice})` : scene.promoPrice,
        startTime: scene.startTime,
        endTime: scene.endTime,
        x: 0.5,
        y: 0.65,
        fontSize: 42,
        color: palette.accent
      });
    }

    if (scene.kind === 'ClosingCTAScene' && scene.cta) {
      layers.push({
        id: `s${sIdx + 1}-cta`,
        kind: 'cta',
        text: scene.cta,
        startTime: scene.startTime,
        endTime: scene.endTime,
        x: 0.5,
        y: 0.78,
        fontSize: 26,
        color: palette.isLight ? '#0f172a' : '#09090b',
        bgColor: palette.highlight || palette.accent
      });
    }
  });

  const designStyleMeta = PROMPT_DESIGN_STYLES.find((d) => d.id === designSystem) || PROMPT_DESIGN_STYLES[1];

  const sceneGraph = {
    version: '3.0',
    duration: timeline.totalDuration,
    recommendedDuration: timeline.recommendedDuration,
    designSystem,
    topic: designSystem,
    topicLabel: designStyleMeta.name,
    heroVisual,
    palette,
    entities: {
      ...entities,
      keyPoints: timeline.scenes.flatMap((s) => (s.cards || []).map((c) => c.title)).slice(0, 6)
    },
    scenes: timeline.scenes,
    layers,
    subtitles,
    renderOptions: options
  };

  const generatedHtmlCode = buildProceduralSceneDocument(sceneGraph, false);
  const generatedCleanBgHtmlCode = buildProceduralSceneDocument(sceneGraph, true);

  return {
    sceneGraph,
    generatedHtmlCode,
    generatedCleanBgHtmlCode,
    summary: {
      topicLabel: designStyleMeta.name,
      designSystem,
      heroVisual,
      colorName: palette.name,
      brand: entities.brand || 'Tanpa Label Brand',
      headline: entities.headline,
      sceneCount: timeline.scenes.length,
      recommendedDuration: timeline.recommendedDuration,
      isLightTheme: Boolean(palette.isLight),
      hasPromoPrice: Boolean(entities.promoPrice),
      hexColors: extractContextualHexColors(promptText).allFound.slice(0, 6)
    }
  };
}
