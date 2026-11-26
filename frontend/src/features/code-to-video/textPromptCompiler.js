/**
 * Kuro Studio - Deep Compositional 2D & 3D Motion Compiler
 * Memisahkan Zona A (Direktif Visual: warna #hex, objek 2D/3D, atmosfer, tipografi)
 * dari Zona B (Konten & Timeline Adegan Nyata) untuk menghasilkan SceneGraph presisi
 * tanpa template paksaan maupun slide instruksi palsu.
 */

import { buildProceduralSceneDocument } from './sceneRendererBuilder.js';

export const PROMPT_DESIGN_STYLES = [
  { id: 'auto', name: 'Otomatis (Ikuti Teks)', desc: 'Deteksi gaya desain paling akurat dari teks' },
  { id: 'neo-brutalist', name: 'Neo-Brutalist', desc: 'Kartu terang, border hitam tegas & hard shadow' },
  { id: 'glassmorphism', name: 'Frosted Glass 3D', desc: 'Kaca dingin transparan & kilau cahaya berlapis' },
  { id: 'warm-promo', name: 'Sinematik Komersial', desc: 'Produk 3D, pita dinamis, harga coret & badge' },
  { id: 'kinetic-type', name: 'Kinetic Tipografi', desc: 'Reveal kata-demi-kata dinamis & narasi' },
  { id: 'editorial-minimal', name: 'Minimalis Terang', desc: 'Bersih lapang, garis aksen halus' },
  { id: 'cyber-neon', name: 'Neon Cyber', desc: 'Grid 3D perspektif, laser glow & spektrum' },
  { id: '3d-space', name: '3D Futuristik', desc: 'Geometri 3D & orbit galaksi berlapis' },
  { id: 'culinary-warm', name: 'Kuliner Hangat', desc: 'Mangkok beruap hangat & kartu menu' },
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
    name: 'Merah Sinematik',
    bg1: '#b90710',
    bg2: '#3f0206',
    accent: '#ef4444',
    secondary: '#ffffff',
    highlight: '#fde047',
    text: '#ffffff',
    muted: '#fee2e2',
    border: '#ffffff',
    dot: '#e10613',
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
  { id: 'waves', name: 'Pita Gelombang' },
  { id: 'plain', name: 'Polos Bersih' }
];

export const PROMPT_HERO_VISUALS = [
  { id: 'auto', name: 'Otomatis (Ikuti Teks)' },
  { id: 'bottle-can-beverage', name: 'Botol / Kaleng Soda 3D' },
  { id: 'coffee-cup', name: 'Gelas Kopi / Es Boba' },
  { id: 'food-bowl', name: 'Mangkuk Kuliner Hangat' },
  { id: 'browser-ui-3d', name: 'Browser 3D Melayang' },
  { id: 'device-duo-3d', name: 'Laptop + HP 3D' },
  { id: 'geometry-3d', name: 'Geometri 3D Orbit' },
  { id: 'product-pedestal-3d', name: 'Podium Produk 3D' },
  { id: 'kinetic-pure', name: 'Tipografi Kinetik Murni' },
  { id: 'none', name: 'Tanpa Ilustrasi' }
];

export const PROMPT_CARD_STYLES = [
  { id: 'auto', name: 'Otomatis' },
  { id: 'frosted-glass', name: 'Frosted Glass (Kaca Dingin)' },
  { id: 'neo-brutalist', name: 'Neo-Brutalist (Border Tegas)' },
  { id: 'clean-editorial', name: 'Minimalis Editorial' },
  { id: 'neon', name: 'Neon Glow' }
];

export const PROMPT_SCENE_PARTICLES = [
  { id: 'auto', name: 'Otomatis' },
  { id: 'petals-stars', name: 'Kelopak & Bintang' },
  { id: 'light-dust', name: 'Gelembung / Embun' },
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
- Ghost WA Stealth Vault | Baca chat tanpa centang biru & amankan Status WA 0 view
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

/**
 * Deteksi warna #hex berdasarkan perannya (bgPrimary, bgSecondary, bgGlow, textPrimary, ribbonColor, frostAccent, badgeColor)
 */
function extractContextualHexColors(rawPrompt) {
  const matches = Array.from(rawPrompt.matchAll(/#[0-9a-fA-F]{3,6}\b/g));
  const bgCandidates = [];
  const bgGlowCandidates = [];
  const ribbonCandidates = [];
  const frostCandidates = [];
  const badgeCandidates = [];
  const textCandidates = [];
  const otherAccents = [];
  const allFound = [];

  for (const m of matches) {
    const hex = normalizeHex(m[0]);
    if (!hex) continue;
    allFound.push(hex);

    const beforeRaw = rawPrompt.slice(Math.max(0, m.index - 75), m.index);
    const localBefore = beforeRaw.split(/[,;\n]/).pop().toLowerCase();
    const afterRaw = rawPrompt.slice(m.index + m[0].length, Math.min(rawPrompt.length, m.index + m[0].length + 60));
    const localAfter = afterRaw.split(/[,;\n]/)[0].toLowerCase();
    const lineCtx = (rawPrompt.slice(0, m.index).split('\n').pop() + ' ' + localAfter).toLowerCase();
    const phrase = `${localBefore} ${localAfter}`;

    if (/\b(?:tepi|border|garis|bayangan|shadow|teks|text|ink|outline|font)\b/.test(phrase)) {
      textCandidates.push(hex);
    } else if (/\b(?:glow|aura|sorotan tengah|cahaya tengah|nyala)\b/.test(phrase)) {
      bgGlowCandidates.push(hex);
    } else if (/\b(?:pita|ribbon|gelombang|wave)\b/.test(phrase)) {
      ribbonCandidates.push(hex);
    } else if (/\b(?:es|frost|embun|dingin|kaca|frosted|ice|kristal)\b/.test(phrase)) {
      frostCandidates.push(hex);
    } else if (/\b(?:sorotan|badge|highlight|stabilo|tag|stiker|cta|tombol|promo|diskon)\b/.test(phrase)) {
      badgeCandidates.push(hex);
    } else if (/\b(?:latar|background|gradasi|kanvas|merah menyala|putih mutiara|pucat)\b/.test(lineCtx) && !/\baksen\b/.test(lineCtx)) {
      bgCandidates.push(hex);
    } else {
      otherAccents.push(hex);
    }
  }

  return {
    allFound: [...new Set(allFound)],
    bgPrimary: bgCandidates[0] || '',
    bgSecondary: bgCandidates[1] || '',
    bgGlow: bgGlowCandidates[0] || bgCandidates[2] || '',
    textPrimary: textCandidates[0] || '',
    ribbonColor: ribbonCandidates[0] || otherAccents[0] || '',
    frostAccent: frostCandidates[0] || otherAccents[1] || otherAccents[0] || '',
    badgeColor: badgeCandidates[0] || otherAccents[1] || ''
  };
}

const DIRECTIVE_SECTION_HEADER_RE =
  /^(?:[-*•#]*\s*)?(?:\*{1,2})?(?:DESAIN(?:\s*&\s*PALET(?:\s*WARNA)?)?|PALET\s*WARNA|BENTUKAN(?:\s*&\s*ELEMEN(?:\s*VISUAL)?)?|ELEMEN\s*VISUAL|GAYA\s*VISUAL|TIPOGRAFI(?:\s*&\s*EFEK)?|PENCAHAYAAN(?:\s*&\s*ATMOSFER)?|ATMOSFER|EFEK\s*VISUAL|SPESIFIKASI(?:\s*VISUAL)?|WARNA\s*&\s*GAYA)\s*[:=\-]?\s*(?:\*{1,2})?$/i;

const DIRECTIVE_INLINE_LINE_RE =
  /^(?:[-*•#]*\s*)?(?:\*{1,2})?(?:gaya\s+visual|warna\s+latar|warna\s+aksen|warna\s+teks|warna\s+pita|palet\s+warna|bentukan|elemen\s+visual|tipografi|pencahayaan|atmosfer|efek\s+visual|latar\s+belakang|background|partikel|transisi|progress\s*bar|catatan\s+visual|kamera|gerakan)\s*[:=]/i;

const SCENE_SECTION_EXIT_RE =
  /^(?:[-*•#]*\s*)?(?:\*{1,2})?(?:ALUR\s*ADEGAN|TIMELINE(?:\s*ADEGAN)?|RANGKAIAN\s*ADEGAN|SKENARIO|NASKAH\s*ADEGAN)\b.*$/i;

const EXPLICIT_SCENE_HEADER_RE =
  /^(?:[-*•#]*\s*|\d+[.)]\s*)?(?:\*{1,2})?(?:adegan|scene|bagian|slide)\s*(\d+)\b(.*)$/i;

function isDesignSpecLine(line = '') {
  const low = line.trim().toLowerCase();
  if (!low) return true;
  if (DIRECTIVE_SECTION_HEADER_RE.test(line.trim())) return true;
  if (DIRECTIVE_INLINE_LINE_RE.test(low)) return true;
  if (SCENE_SECTION_EXIT_RE.test(line.trim())) return true;
  if (/^[-*•]?\s*(?:progress bar|shadow|bayangan keras|garis tepi hitam|tema gelap|efek kaca dingin)/i.test(low) && !/\|/.test(low)) {
    return true;
  }
  return false;
}

/**
 * Memisahkan prompt menjadi Zona A (Direktif Visual) & Zona B (Konten & Adegan Nyata)
 */
function parsePromptZones(rawPrompt) {
  const lines = String(rawPrompt || '').split(/\r?\n/);
  const directiveLines = [];
  const headerContentLines = [];
  const freeContentLines = [];
  const explicitScenes = [];

  let inDirectiveSection = false;
  let currentScene = null;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    // Cek header Adegan eksplisit terlebih dahulu (keluar dari Zona A seketika!)
    const sceneMatch = trimmed.match(EXPLICIT_SCENE_HEADER_RE);
    if (sceneMatch) {
      inDirectiveSection = false;
      if (currentScene) explicitScenes.push(currentScene);

      const restHeader = String(sceneMatch[2] || '').replace(/^\*{1,2}|\*{1,2}$/g, '');
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
        .replace(/\*+/g, '')
        .replace(/^[\s:.\-–—]+|[\s:.\-–—]+$/g, '')
        .trim();

      currentScene = {
        index: parseInt(sceneMatch[1], 10),
        headerLabel: cleanTitle,
        startSec,
        endSec,
        lines: []
      };
      continue;
    }

    // Cek heading Alur Adegan -> keluar dari Zona A agar isi adegan dibaca sebagai Zona B
    if (SCENE_SECTION_EXIT_RE.test(trimmed)) {
      inDirectiveSection = false;
      continue;
    }

    // Cek heading Zona A (Direktif Visual)
    if (DIRECTIVE_SECTION_HEADER_RE.test(trimmed)) {
      inDirectiveSection = true;
      currentScene = null;
      directiveLines.push(trimmed);
      continue;
    }

    if (inDirectiveSection) {
      directiveLines.push(trimmed);
      continue;
    }

    if (DIRECTIVE_INLINE_LINE_RE.test(trimmed)) {
      directiveLines.push(trimmed);
      continue;
    }

    if (currentScene) {
      currentScene.lines.push(trimmed);
    } else if (/^(?:brand|merek|nama brand|judul|headline|title|subjudul|subtitle|tagline|cta|ajakan|harga|promo)\s*[:=]/i.test(trimmed)) {
      headerContentLines.push(trimmed);
    } else {
      freeContentLines.push(trimmed);
    }
  }

  if (currentScene) explicitScenes.push(currentScene);

  return {
    directiveLines,
    headerContentLines,
    freeContentLines,
    explicitScenes
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
    glassmorphism: scoreKeywordList(lower, [
      [/glassmorphism|frosted\s*glass|efek kaca|kaca dingin|transparan blur/i, 7],
      [/ambient orb|floating card/i, 3]
    ]),
    'neo-brutalist': scoreKeywordList(lower, [
      [/neo[\s-]?brutalis[mt]?/i, 8],
      [/hard[\s-]?shadow|bayangan keras/i, 6],
      [/border hitam|garis tepi hitam|garis tegas|kotak tegas/i, 6]
    ]),
    'cyber-neon': scoreKeywordList(lower, [
      [/cyberpunk|neon glow|matrix|hologram|synthwave|spektrum audio|gaming/i, 6],
      [/grid 3d|perspektif neon|laser/i, 3]
    ]),
    'warm-promo': scoreKeywordList(lower, [
      [/iklan minuman|commercial|coca[\s-]?cola|soda|minuman dingin|botol|kaleng/i, 6],
      [/bakso|kuliner|makanan|pedas|mercon|kuah|kopi|matcha|resto|warung|cafe/i, 6],
      [/promo|flash sale|beli\s+\d+\s+gratis|diskon/i, 4]
    ]),
    'editorial-minimal': scoreKeywordList(lower, [
      [/quotes|kutipan|motivasi|renungan|puisi|sajak|refleksi|editorial/i, 7],
      [/minimalis bersih|estetik tenang|jurnal/i, 4]
    ]),
    '3d-space': scoreKeywordList(lower, [
      [/tata surya|luar angkasa|antariksa|astronot|galaksi|nebula|orbit planet|planet cincin/i, 7]
    ])
  };

  let best = 'editorial-minimal';
  let bestScore = 0;
  for (const [k, sc] of Object.entries(scores)) {
    if (sc > bestScore) {
      bestScore = sc;
      best = k;
    }
  }
  return best;
}

/**
 * Pemilih Hero Object Akurat Berbasis Keyword Spesifik (Anti-Salah-Objek!)
 */
function detectHeroVisual(lower, designSystem, explicitHero = 'auto') {
  if (explicitHero && explicitHero !== 'auto') {
    if (explicitHero === 'browser-mockup') return 'browser-ui-3d';
    if (explicitHero === 'device-duo') return 'device-duo-3d';
    if (explicitHero === '3d-geometry') return 'geometry-3d';
    if (explicitHero === 'emblem-promo') return 'food-bowl';
    return explicitHero;
  }

  // 1. Botol / Kaleng Minuman Soda (Coca-Cola, Sirup, Jus, Teh Botol, Isotonik)
  if (/\b(?:botol|kaleng|soda|coca[\s-]?cola|cola|pepsi|sprite|fanta|minuman dingin|minuman bersoda|sirup|jus buah|teh botol|sparkling|isotonik)\b/i.test(lower)) {
    return 'bottle-can-beverage';
  }
  // 2. Gelas Kopi / Boba / Matcha
  if (/\b(?:kopi|coffee|matcha|boba|latte|es kopi|gelas|milk tea|thai tea|espresso)\b/i.test(lower)) {
    return 'coffee-cup';
  }
  // 3. Mangkuk Kuliner (HANYA jika teks eksplisit menyebut kuliner kuah/mangkuk)
  if (/\b(?:bakso|mie\s+ayam|ramen|soto|sop|sup|mangkuk|mangkok|seblak|kuah kaldu)\b/i.test(lower)) {
    return 'food-bowl';
  }
  // 4. Website / Browser UI 3D
  if (/\b(?:jendela browser|browser 3d|browser mockup|website|web platform|dashboard|landing page|saas|aplikasi web)\b/i.test(lower)) {
    return 'browser-ui-3d';
  }
  // 5. Laptop + HP
  if (/\b(?:laptop|smartphone|mockup hp|mobile\s*&\s*pc|hp\s*&\s*pc)\b/i.test(lower)) {
    return 'device-duo-3d';
  }
  // 6. Geometri 3D & Luar Angkasa
  if (designSystem === '3d-space' || /\b(?:planet|orbit|tata surya|galaksi|nebula|kubus 3d|prisma|kristal 3d|wireframe)\b/i.test(lower)) {
    return 'geometry-3d';
  }
  // 7. Produk Fisik Podium 3D
  if (/\b(?:produk|parfum|skincare|serum|sepatu|gadget|jam tangan|headset|kamera|podium|stage 3d)\b/i.test(lower)) {
    return 'product-pedestal-3d';
  }
  // 8. Tipografi Kinetik / Quotes / Editorial
  if (designSystem === 'editorial-minimal' || designSystem === 'kinetic-type' || /\b(?:quotes|kutipan|edukasi|puisi|narasi|teks murni)\b/i.test(lower)) {
    return 'kinetic-pure';
  }

  return /\b(?:promo|diskon|harga|rp\.?)\b/i.test(lower) ? 'product-pedestal-3d' : 'kinetic-pure';
}

function detectVisualLayers(lower, heroVisual, designSystem) {
  return {
    dynamicRibbonWave: /\b(?:pita|ribbon|gelombang putih|wave)\b/i.test(lower) || heroVisual === 'bottle-can-beverage',
    fizzBubbles: /\b(?:gelembung|soda|fizz|karbonasi|sparkling|berbuih)\b/i.test(lower),
    floatingIceCubes: /\b(?:es batu|kristal es|ice cube|bongkahan es|ice cold|dingin menggigil)\b/i.test(lower),
    frostMist: /\b(?:kabut dingin|embun|frost|uap dingin|asap dingin|frosted|berembun)\b/i.test(lower),
    perspectiveGrid3d: designSystem === 'cyber-neon' || designSystem === '3d-space' || /\b(?:grid 3d|perspektif neon|cyberpunk)\b/i.test(lower),
    tiltedGrid: designSystem === 'neo-brutalist' || /\b(?:grid kotak|miring|neo[\s-]?brutalis)\b/i.test(lower),
    shimmerSweep: /\b(?:kilau|shimmer|kilatan|mengilap|glossy|specular)\b/i.test(lower) || true,
    animatedStrikethrough: /\b(?:dicoret|harga coret|dari\s+rp)\b/i.test(lower) || true,
    wordMaskReveal: /\b(?:kata demi kata|mask|reveal)\b/i.test(lower) || true,
    bottomProgressBar: !/\btanpa\s+progress\s*bar\b/i.test(lower)
  };
}

function resolvePalette(rawPrompt, lower, designSystem, options = {}) {
  const moodId = options.mood || 'auto';
  const useHex = options.usePromptHexColors !== false;
  const hexInfo = extractContextualHexColors(rawPrompt);

  let baseMood = PROMPT_COLOR_MOODS.find((m) => m.id === moodId && m.id !== 'auto');

  if (!baseMood) {
    const redScore = scoreKeywordList(lower, [
      [/merah|crimson|coca[\s-]?cola|ruby|maroon|menyala/i, 5]
    ]);
    const lightScore = scoreKeywordList(lower, [
      [/putih mutiara|gradasi terang|tema terang|latar terang|biru langit pucat|sakura|ivory|terang bersih/i, 6],
      [/neo[\s-]?brutalis/i, 4]
    ]);
    const darkScore = scoreKeywordList(lower, [
      [/tema gelap|latar gelap|hitam pekat|malam|dark mode|obsidian|marun gelap/i, 5]
    ]);

    if (redScore >= 5 || designSystem === 'warm-promo') {
      baseMood = PROMPT_COLOR_MOODS.find((m) => m.id === 'crimson-fire');
    } else if (designSystem === '3d-space' || designSystem === 'cyber-neon') {
      baseMood = PROMPT_COLOR_MOODS.find((m) => m.id === 'deep-indigo');
    } else if (lightScore > darkScore || designSystem === 'neo-brutalist') {
      baseMood = PROMPT_COLOR_MOODS.find((m) => m.id === 'pearl-sky');
    } else {
      baseMood = PROMPT_COLOR_MOODS.find((m) => m.id === 'deep-indigo');
    }
  }

  let pal = {
    ...baseMood,
    bgPrimary: baseMood.bg1,
    bgSecondary: baseMood.bg2,
    bgGlow: baseMood.accent,
    textPrimary: baseMood.text,
    ribbonColor: baseMood.secondary,
    frostAccent: baseMood.accent,
    badgeColor: baseMood.highlight || baseMood.accent
  };

  if (moodId === 'custom') {
    pal.bgPrimary = normalizeHex(options.customBg1 || options.bgColor1) || pal.bg1;
    pal.bgSecondary = normalizeHex(options.customBg2 || options.bgColor2) || pal.bg2;
    pal.frostAccent = normalizeHex(options.customAccent || options.tintColor) || pal.accent;
    pal.textPrimary = normalizeHex(options.customText || options.hudTextColor) || pal.text;
    pal.bg1 = pal.bgPrimary;
    pal.bg2 = pal.bgSecondary;
    pal.accent = pal.frostAccent;
    pal.text = pal.textPrimary;
    pal.isLight = getHexLuminance(pal.bg1) > 0.55;
    pal.border = pal.isLight ? '#0f172a' : pal.accent;
    pal.muted = pal.isLight ? '#334155' : '#e2e8f0';
    return pal;
  }

  if (useHex && hexInfo.allFound.length > 0) {
    if (hexInfo.bgPrimary) pal.bgPrimary = hexInfo.bgPrimary;
    else if (hexInfo.allFound[0]) pal.bgPrimary = hexInfo.allFound[0];

    if (hexInfo.bgSecondary) pal.bgSecondary = hexInfo.bgSecondary;
    else if (hexInfo.bgGlow) pal.bgSecondary = hexInfo.bgGlow;
    else if (hexInfo.allFound[1] && hexInfo.allFound[1] !== pal.bgPrimary) pal.bgSecondary = hexInfo.allFound[1];
    else pal.bgSecondary = pal.bgPrimary;

    pal.bgGlow = hexInfo.bgGlow || hexInfo.frostAccent || pal.bgPrimary;
    pal.ribbonColor = hexInfo.ribbonColor || pal.secondary || '#ffffff';
    pal.frostAccent = hexInfo.frostAccent || pal.accent || '#bae6fd';
    pal.badgeColor = hexInfo.badgeColor || pal.highlight || '#fde047';

    pal.bg1 = pal.bgPrimary;
    pal.bg2 = pal.bgSecondary;
    pal.accent = pal.frostAccent;
    pal.secondary = pal.ribbonColor;
    pal.highlight = pal.badgeColor;

    pal.isLight = getHexLuminance(pal.bg1) > 0.55;
    if (hexInfo.textPrimary) {
      const lumT = getHexLuminance(hexInfo.textPrimary);
      pal.textPrimary = (pal.isLight && lumT > 0.65) || (!pal.isLight && lumT < 0.35)
        ? (pal.isLight ? '#0f172a' : '#ffffff')
        : hexInfo.textPrimary;
    } else {
      pal.textPrimary = pal.isLight ? '#0f172a' : '#ffffff';
    }
    pal.text = pal.textPrimary;
    pal.muted = pal.isLight ? '#334155' : 'rgba(255,255,255,0.85)';
    pal.border = pal.isLight ? '#0f172a' : pal.accent;
    pal.name = 'Hex Kustom dari Teks';
  }

  return pal;
}

function stripLabeledPrefix(line = '') {
  return String(line)
    .replace(/^(?:[-*•]\s*)?(?:brand|merek|nama brand|judul(?:\s+utama)?|headline|title|subjudul|subtitle|tagline|cta|ajakan|link|harga|promo|hook)\s*[:=\-]\s*/i, '')
    .trim();
}

function extractQuotedStrings(text = '') {
  const results = [];
  const re = /["“]([^"”\n]{2,110})["”]/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const val = m[1].trim();
    if (val && !results.includes(val)) results.push(val);
  }
  return results;
}

function extractExplicitDurationSec(rawPrompt) {
  const minMatch = rawPrompt.match(/(?:total|durasi)\s*[:=]?\s*(\d{1,2})\s*(?:menit|minutes?|m\b)/i);
  if (minMatch) return Math.min(300, Math.max(5, parseInt(minMatch[1], 10) * 60));

  const secMatch = rawPrompt.match(/(?:total|durasi)\s*[:=]?\s*(\d{1,3})\s*(?:detik|seconds?|s\b)/i);
  if (secMatch) return Math.min(300, Math.max(4, parseInt(secMatch[1], 10)));

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

  const noteMatch = rawPrompt.match(/(?:catatan|promo berlaku|gratis|bonus|khusus)[^.\n]{4,70}/i);
  const promoNote = noteMatch ? noteMatch[0].trim() : '';

  return { promoPrice, oldPrice, discountBadge, promoNote };
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

function extractCoreEntities(rawPrompt, zones) {
  const contentPool = [...zones.headerContentLines, ...zones.freeContentLines];

  let brand = '';
  for (const line of contentPool) {
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

  let headline = '';
  let subheadline = '';
  for (const line of contentPool) {
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

  const nonLabeled = zones.freeContentLines.filter((l) => !isDesignSpecLine(l));
  if (!headline) {
    headline = stripLabeledPrefix(nonLabeled[0] || brand || 'PRESENTASI VISUAL').slice(0, 72);
  }
  if (!subheadline) {
    const nextLine = nonLabeled.find((l) => l !== headline);
    subheadline = nextLine ? stripLabeledPrefix(nextLine).slice(0, 110) : '';
  }

  let cta = '';
  const quotedCta = rawPrompt.match(/(?:ajakan|cta|tombol|closing)[^"\n]*["“]([^"”]{3,56})["”]/i);
  const labeledCta = rawPrompt.match(/^(?:[-*•]\s*)?(?:cta|tombol cta|ajakan)\s*[:=]\s*(.+)$/im);
  const waMatch = rawPrompt.match(/\b(?:WA|WhatsApp)\s*[:#]?\s*((?:\+?62|08)[\d\s-]{7,15})/i);
  const domainMatch = rawPrompt.match(/\b([a-z0-9-]+\.(?:vercel\.app|id|com|co\.id|net|io|app|org))\b/i);
  const marketMatch = rawPrompt.match(/\b((?:GoFood|GrabFood|ShopeeFood|Tokopedia|Shopee|TikTok\s*Shop|Minimarket|Indomaret|Alfamart)(?:\s*(?:,|dan|&|\/)\s*(?:GoFood|GrabFood|ShopeeFood|Tokopedia|Shopee|TikTok\s*Shop|Minimarket|Indomaret|Alfamart))*)/i);

  if (quotedCta) {
    cta = quotedCta[1].trim().toUpperCase();
  } else if (labeledCta) {
    cta = stripLabeledPrefix(labeledCta[1]).toUpperCase();
  } else if (waMatch) {
    cta = `KONSULTASI WA ${waMatch[1].trim()}`;
  } else {
    const actionMatch = rawPrompt.match(/\b((?:coba|pesan|beli|mulai|klaim|daftar|booking|konsultasi|kunjungi|simpan|bagikan|rasakan)(?:\s+(?:gratis|sekarang|di|hari ini|kesegarannya|kutipan)){1,3})/i);
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
  const clean = rawLine.replace(/^[-*•\d.)\s]+/, '').replace(/\*+/g, '').trim();
  if (!clean || isDesignSpecLine(clean)) return null;

  if (clean.includes('|')) {
    const [left, ...rest] = clean.split('|');
    return {
      title: left.replace(/^(?:kartu|poin|fitur|keunggulan)\s*\d*\s*[:=]\s*/i, '').trim().slice(0, 48),
      desc: rest.join(' • ').trim().slice(0, 100)
    };
  }
  const dashSplit = clean.match(/^(.{3,48}?)\s+[—–-]\s+(.{3,110})$/);
  if (dashSplit) {
    return {
      title: dashSplit[1].trim(),
      desc: dashSplit[2].trim()
    };
  }
  const colonIdx = clean.indexOf(':');
  if (colonIdx > 2 && colonIdx < 42 && !/^https?:/i.test(clean)) {
    return {
      title: clean.slice(0, colonIdx).replace(/^(?:kartu|poin|fitur|keunggulan)\s*\d*\s*/i, '').trim().slice(0, 48),
      desc: clean.slice(colonIdx + 1).trim().slice(0, 100)
    };
  }
  return {
    title: clean.slice(0, 48),
    desc: clean.length > 48 ? clean.slice(48, 120).trim() : ''
  };
}

/**
 * Membersihkan instruksi sutradara ("Tampilkan...", "Animasikan...", "Efek...")
 * agar yang tampil di layar adalah copy iklan/konten yang tajam.
 */
function extractScreenCopyFromSceneBlock(block, entities, isFirst, isLast) {
  const joinedBody = block.lines.join('\n');
  const quotes = extractQuotedStrings(`${block.headerLabel}\n${joinedBody}`);

  const cards = [];
  const cleanNotes = [];
  for (const l of block.lines) {
    const stripped = l.replace(/^[-*•]\s+|^\d+[.)]\s+/, '').trim();
    if (/^[-*•]\s+|^\d+[.)]\s+/.test(l) || stripped.includes('|') || /\s+[—–]\s+/.test(stripped)) {
      if (!/^(?:tampilkan|munculkan|animasikan|efek|latar|background|kamera|transisi)\b/i.test(stripped)) {
        const card = parseBulletCardItem(l);
        if (card) cards.push(card);
        continue;
      }
    }
    if (!isDesignSpecLine(l)) {
      const plain = stripLabeledPrefix(stripped);
      const isStageDirection = /^(?:tampilkan|munculkan|masukkan|animasikan|latar|efek|dengan efek|kamera|transisi|geser|muncul)\b/i.test(plain);
      if (!isStageDirection && plain.length >= 3) {
        cleanNotes.push(plain);
      }
    }
  }

  let headline = '';
  let subtitle = '';
  let sceneBadge = entities.brand || '';
  let sceneCta = entities.cta || '';

  if (isFirst) {
    if (quotes.length >= 2) {
      sceneBadge = quotes[0].toUpperCase();
      headline = quotes[1];
      subtitle = entities.subheadline || '';
    } else if (quotes.length === 1) {
      headline = entities.headline || quotes[0];
      subtitle = quotes[0] !== headline ? quotes[0] : entities.subheadline;
    } else {
      headline = entities.headline;
      subtitle = entities.subheadline || cleanNotes[0] || '';
    }
  } else if (isLast) {
    if (quotes.length >= 2) {
      headline = quotes[0];
      sceneCta = quotes[quotes.length - 1].toUpperCase();
      subtitle = entities.promoNote || entities.channelLine || cleanNotes[0] || '';
    } else if (quotes.length === 1) {
      headline = quotes[0];
      sceneCta = quotes[0].includes('•') ? quotes[0].toUpperCase() : (entities.cta || quotes[0].toUpperCase());
      subtitle = entities.promoNote || entities.channelLine || cleanNotes[0] || '';
    } else {
      headline = entities.cta || block.headerLabel || entities.headline;
      subtitle = entities.promoNote || entities.channelLine || cleanNotes[0] || entities.subheadline;
    }
  } else {
    headline = quotes[0] || block.headerLabel.replace(/[:]+$/g, '').trim() || cleanNotes[0] || entities.headline;
    subtitle = quotes[1] || cleanNotes.filter((n) => n !== headline).join(' • ').slice(0, 140);
  }

  return { headline, subtitle, sceneBadge, sceneCta, cards };
}

function buildMultiSceneTimeline({ rawPrompt, zones, entities, heroVisual, targetDuration, transitionStyle }) {
  const explicitBlocks = zones.explicitScenes;
  const scenes = [];

  if (explicitBlocks.length > 0) {
    // Gunakan JUMLAH ADEGAN PERSIS sesuai prompt pengguna (mis. 3 Adegan -> tetap 3!)
    explicitBlocks.forEach((block, idx) => {
      const isFirst = idx === 0;
      const isLast = idx === explicitBlocks.length - 1;
      const joinedBody = block.lines.join(' ');
      const headerLow = `${block.headerLabel} ${joinedBody}`.toLowerCase();
      const copy = extractScreenCopyFromSceneBlock(block, entities, isFirst, isLast);
      const localPromo = extractPromoDetails(joinedBody);
      const hasPriceInfo = Boolean(localPromo.promoPrice || (isLast && entities.promoPrice && /\b(?:harga|promo|diskon|rp)\b/.test(headerLow)));

      let kind = 'StoryNarrativeScene';
      if (isFirst || /\b(?:hook|intro|pembuka|reveal)\b/.test(headerLow)) {
        kind = 'HookHeroScene';
      } else if (isLast && hasPriceInfo) {
        kind = 'PricingPromoScene';
      } else if (isLast || /\b(?:closing|penutup|cta|kontak|ajakan|akhir)\b/.test(headerLow)) {
        kind = 'ClosingCTAScene';
      } else if (/\b(?:harga|promo|paket|diskon)\b/.test(headerLow) && (localPromo.promoPrice || entities.promoPrice)) {
        kind = 'PricingPromoScene';
      } else if (/\b(?:statistik|angka|metrik|performa|data|fakta)\b/.test(headerLow) && extractMetricsFromText(joinedBody).length > 0) {
        kind = 'MetricStatsScene';
      } else if (copy.cards.length >= 2 || /\b(?:fitur|keunggulan|showcase|paket|menu|poin)\b/.test(headerLow)) {
        kind = 'FeatureGridScene';
      }

      const metrics = kind === 'MetricStatsScene' ? extractMetricsFromText(joinedBody) : [];
      const fallbackCards = copy.cards.length > 0
        ? copy.cards
        : (copy.subtitle && kind === 'FeatureGridScene' ? [{ title: copy.subtitle, desc: '' }] : []);

      scenes.push({
        id: `scene-${idx + 1}`,
        index: idx,
        kind,
        title: copy.headline,
        subtitle: copy.subtitle,
        badge: copy.sceneBadge || entities.brand || '',
        cards: fallbackCards.slice(0, 6),
        metrics,
        promoPrice: localPromo.promoPrice || (hasPriceInfo ? entities.promoPrice : ''),
        oldPrice: localPromo.oldPrice || (hasPriceInfo ? entities.oldPrice : ''),
        discountBadge: localPromo.discountBadge || entities.discountBadge,
        promoNote: localPromo.promoNote || entities.promoNote,
        cta: copy.sceneCta || entities.cta,
        channelLine: entities.channelLine,
        heroVisual: kind === 'HookHeroScene' ? heroVisual : (kind === 'PricingPromoScene' && heroVisual === 'bottle-can-beverage' ? heroVisual : 'none'),
        explicitStart: block.startSec,
        explicitEnd: block.endSec,
        transition: transitionStyle === 'auto'
          ? (idx % 3 === 0 ? 'wipe' : idx % 3 === 1 ? 'slide' : 'zoom')
          : transitionStyle
      });
    });
  } else {
    // Prompt paragraf tanpa header Adegan N (Zona A sudah disaring tuntas -> mustahil jadi slide instruksi!)
    const contentOnly = zones.freeContentLines.filter((l) => !isDesignSpecLine(l));
    const bullets = contentOnly
      .filter((l) => /^[-*•]\s+|^\d+[.)]\s+/.test(l) || l.includes('|') || /\s+[—–]\s+/.test(l))
      .map(parseBulletCardItem)
      .filter(Boolean);

    const proseSentences = contentOnly
      .filter((l) => !/^[-*•]\s+|^\d+[.)]\s+/.test(l) && !/^(?:brand|merek|judul|subjudul|cta|harga|promo)\s*[:=]/i.test(l))
      .join(' ')
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 6);

    scenes.push({
      id: 'scene-1',
      index: 0,
      kind: 'HookHeroScene',
      title: entities.headline,
      subtitle: entities.subheadline || proseSentences[0] || '',
      badge: entities.brand,
      cards: [],
      metrics: [],
      heroVisual,
      transition: transitionStyle === 'auto' ? 'wipe' : transitionStyle
    });

    if (bullets.length >= 2) {
      for (let i = 0; i < Math.min(bullets.length, 8); i += 4) {
        scenes.push({
          id: `scene-${scenes.length + 1}`,
          index: scenes.length,
          kind: 'FeatureGridScene',
          title: i === 0 ? 'KEUNGGULAN UTAMA' : 'DETAIL LAINNYA',
          subtitle: '',
          badge: entities.brand,
          cards: bullets.slice(i, i + 4),
          metrics: [],
          heroVisual: 'none',
          transition: transitionStyle === 'auto' ? 'slide' : transitionStyle
        });
      }
    } else if (proseSentences.length >= 2) {
      for (let i = 0; i < Math.min(proseSentences.length, 6); i += 2) {
        const chunkTitle = proseSentences[i].slice(0, 72);
        const chunkSub = proseSentences[i + 1] ? proseSentences[i + 1].slice(0, 120) : '';
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
        subtitle: entities.promoNote || entities.subheadline,
        badge: entities.discountBadge || entities.brand,
        promoPrice: entities.promoPrice,
        oldPrice: entities.oldPrice,
        discountBadge: entities.discountBadge,
        promoNote: entities.promoNote,
        cta: entities.cta,
        cards: [],
        metrics: [],
        heroVisual: heroVisual === 'bottle-can-beverage' ? heroVisual : 'none',
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

  const explicitTotal = extractExplicitDurationSec(rawPrompt);
  const wordCount = rawPrompt.trim().split(/\s+/).filter(Boolean).length;
  const recommendedDuration = explicitTotal > 0
    ? explicitTotal
    : Math.max(8, Math.min(300, Math.max(scenes.length * 4, Math.round(wordCount * 0.25))));

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
    const weights = scenes.map((s) => {
      if (s.kind === 'FeatureGridScene') return 1.35;
      if (s.kind === 'PricingPromoScene') return 1.15;
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
 * Compiler Utama Text Prompt -> SceneGraph Compositional + HTML5 2D/3D Canvas 60 FPS
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

  const zones = parsePromptZones(promptText);
  const designSystem = detectDesignSystem(lower, options.designStyle);
  const heroVisual = detectHeroVisual(lower, designSystem, options.heroVisual);
  const visualLayers = detectVisualLayers(lower, heroVisual, designSystem);
  const palette = resolvePalette(promptText, lower, designSystem, options);
  const entities = extractCoreEntities(promptText, zones);

  if (!isPure && optIn.brandBadgeEnabled && String(optIn.brandBadgeText || '').trim()) {
    entities.brand = String(optIn.brandBadgeText).trim().toUpperCase();
  }

  const explicitPromptDur = extractExplicitDurationSec(promptText);
  const durationToUse = options.autoDuration
    ? (explicitPromptDur || undefined)
    : Math.max(3, Math.min(300, Number(requestedDurationSec) || explicitPromptDur || 12));

  const timeline = buildMultiSceneTimeline({
    rawPrompt: promptText,
    zones,
    entities,
    heroVisual,
    targetDuration: durationToUse,
    transitionStyle: options.transitionStyle || 'auto'
  });

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

    if (scene.promoPrice) {
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

    if ((scene.kind === 'ClosingCTAScene' || scene.kind === 'PricingPromoScene') && scene.cta) {
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
    version: '4.0',
    duration: timeline.totalDuration,
    recommendedDuration: timeline.recommendedDuration,
    designSystem,
    topic: designSystem,
    topicLabel: designStyleMeta.name,
    heroVisual,
    visualLayers,
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
