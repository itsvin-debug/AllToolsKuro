/**
 * script.js - Client-Side Engine untuk Asisten AI Kuro (Persona Chibi Elaina)
 * Mendukung Avatar Vektor SVG Dinamis, Efek Typewriter Lip-Sync, 
 * Auto-Scroll Mulus, Tour 12 Fitur, dan Tombol Pembatalan (Cancel) Seketika.
 */

// 1. Data Resmi 12 Fitur Kuro Studio untuk Sekuens Tour
const KURO_TOOLS = [
  { id: 'downloader', name: 'Media Downloader', tag: 'All-in-One HD', elementId: 'tool-downloader', desc: 'Pengunduh serbaguna untuk video, foto slide album, dan audio MP3 tanpa watermark dari TikTok, IG, YT, dan lainnya hingga kualitas 4K dan 1080p Status WA Anti-Burik.' },
  { id: 'jjFinder', name: 'Cari Link JJ', tag: 'Jedag-Jedug Viral', elementId: 'tool-jjFinder', desc: 'Temukan ribuan sound jedag-jedug viral, preset Alight Motion, dan backsound tren terbaru dengan tautan langsung siap pakai.' },
  { id: 'pngToPdf', name: 'PNG to PDF', tag: 'Konversi Dokumen', elementId: 'tool-pngToPdf', desc: 'Satukan banyak file gambar atau foto PNG dan JPG menjadi satu berkas PDF rapi dengan tata letak proporsional dan kualitas tajam.' },
  { id: 'linkToDoc', name: 'Link to PDF/PPT', tag: 'Ekstraktor Materi', elementId: 'tool-linkToDoc', desc: 'Ekstrak dokumen kuliah dan presentasi dari Scribd atau SlideShare menjadi berkas PDF atau PPT utuh langsung dari tautan web.' },
  { id: 'imageToLink', name: 'File ke Link', tag: 'Hosting Instan', elementId: 'tool-imageToLink', desc: 'Unggah foto dari perangkatmu dan dapatkan tautan URL publik instan berkecepatan tinggi untuk dibagikan ke mana saja.' },
  { id: 'compressor', name: 'Kompres Media HD', tag: 'Hemat Memori', elementId: 'tool-compressor', desc: 'Kecilkan ukuran file video dan gambar secara drastis tanpa membuat visual pecah atau burik, sangat hemat kuota dan memori.' },
  { id: 'qrStudio', name: 'QR Code Studio', tag: 'Desain Kustom', elementId: 'tool-qrStudio', desc: 'Studio pembuat kode QR estetik dengan logo kustom, pewarnaan neobrutalist fleksibel, dan resolusi tinggi yang siap dipindai.' },
  { id: 'audioMerger', name: 'Audio Merger', tag: 'Kombinasi Suara', elementId: 'tool-audioMerger', desc: 'Gabungkan beberapa trek audio atau musik menjadi satu kesatuan alunan utuh dengan sambungan lagu yang mulus dan jernih.' },
  { id: 'photoStudio', name: 'Photo Studio', tag: 'Filter & Efek', elementId: 'tool-photoStudio', desc: 'Editor foto instan dengan ragam filter neobrutalist, rotasi, penyesuaian kontras, serta efek grafis artistik untuk mempercantik gambarmu.' },
  { id: 'videoStudio', name: 'Video Studio', tag: 'Studio Kreatif', elementId: 'tool-videoStudio', desc: 'Editor video praktis untuk mengatur kecepatan pemutaran, mengubah rasio layar 9:16 untuk story dan 16:9 untuk layar lebar, serta filter visual.' },
  { id: 'videoTrimmer', name: 'Video Trimmer', tag: 'Pemotong Presisi', elementId: 'tool-videoTrimmer', desc: 'Pangkas detik awal atau akhir klip videomu secara akurat tanpa menurunkan bitrate asli atau merusak kualitas audionya.' },
  { id: 'bgRemover', name: 'Hapus Background', tag: 'AI Background Remover', elementId: 'tool-bgRemover', desc: 'Hapus latar belakang foto dalam satu kali klik menggunakan kecerdasan AI untuk menghasilkan file PNG transparan yang rapi dan presisi.' }
];

// 2. Fungsi Generator SVG Maskot Chibi Elaina (100% Vektor Dinamis)
function renderKuroSvg(state = 'idle') {
  const isTalking = state === 'talking';
  const isWaving = state === 'wave';
  const isConfused = state === 'confused';
  const isThinking = state === 'thinking';

  return `
    <svg viewBox="0 0 240 240" fill="none" xmlns="http://www.w3.org/2000/svg" class="kuro-svg-element">
      <defs>
        <linearGradient id="hairGrad_${state}" x1="120" y1="80" x2="120" y2="190" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#f1f3f9" />
          <stop offset="60%" stop-color="#d8dce8" />
          <stop offset="100%" stop-color="#b4b9cb" />
        </linearGradient>
        <linearGradient id="robeGrad_${state}" x1="120" y1="40" x2="120" y2="210" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#4c3b60" />
          <stop offset="100%" stop-color="#312242" />
        </linearGradient>
        <linearGradient id="ribbonGrad_${state}" x1="120" y1="95" x2="120" y2="115" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#e3d6f0" />
          <stop offset="100%" stop-color="#bfa9d8" />
        </linearGradient>
        <linearGradient id="eyeGrad_${state}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#1d4ed8" />
          <stop offset="60%" stop-color="#3b82f6" />
          <stop offset="100%" stop-color="#60a5fa" />
        </linearGradient>
        <linearGradient id="goldGrad_${state}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#fde047" />
          <stop offset="50%" stop-color="#eab308" />
          <stop offset="100%" stop-color="#ca8a04" />
        </linearGradient>
      </defs>

      <g class="anim-kuro-body">
        <!-- Rambut Belakang -->
        <path d="M 68 135 C 55 170 72 205 105 212 C 120 215 135 212 172 205 C 185 170 172 135 168 135 Z" fill="url(#hairGrad_${state})" stroke="#1e1826" stroke-width="2.5" stroke-linejoin="round" />
        
        <!-- Jubah Ungu Tua -->
        <path d="M 72 165 Q 52 195 48 215 C 65 218 85 216 120 216 C 155 216 175 218 192 215 Q 188 195 168 165 Z" fill="url(#robeGrad_${state})" stroke="#1e1826" stroke-width="3" stroke-linejoin="round" />
        
        <!-- Bintang Emas Bawah Jubah -->
        <g fill="#fde047" stroke="#1e1826" stroke-width="1">
          <path d="M 78 206 L 80 202 L 82 206 L 86 208 L 82 210 L 80 214 L 78 210 L 74 208 Z" />
          <path d="M 118 206 L 120 202 L 122 206 L 126 208 L 122 210 L 120 214 L 118 210 L 114 208 Z" />
          <path d="M 158 206 L 160 202 L 162 206 L 166 208 L 162 210 L 160 214 L 158 210 L 154 208 Z" />
        </g>

        <!-- Kerah Putih & Dasi -->
        <path d="M 102 162 L 120 178 L 138 162 L 128 156 L 112 156 Z" fill="#ffffff" stroke="#1e1826" stroke-width="2" />
        <path d="M 114 163 L 120 180 L 126 163 Z" fill="#7c5295" />

        <!-- Bros Bintang Emas Khas Elaina -->
        <g transform="translate(120, 168) scale(1.1)">
          <path d="M 0 -8 L 2.4 -2.5 L 8 -2.4 L 3.8 1.6 L 5.2 7.2 L 0 4.2 L -5.2 7.2 L -3.8 1.6 L -8 -2.4 L -2.4 -2.5 Z" fill="url(#goldGrad_${state})" stroke="#1e1826" stroke-width="1.2" stroke-linejoin="round" />
        </g>

        <!-- Kepala Chibi -->
        <path d="M 80 128 C 78 155 94 168 120 168 C 146 168 162 155 160 128 C 160 102 146 95 120 95 C 94 95 80 102 80 128 Z" fill="#fff3ec" stroke="#1e1826" stroke-width="2.5" stroke-linejoin="round" />
        <ellipse cx="94" cy="144" rx="7" ry="4" fill="#fca5a5" opacity="0.65" />
        <ellipse cx="146" cy="144" rx="7" ry="4" fill="#fca5a5" opacity="0.65" />

        <!-- Mata Anime -->
        ${!isThinking ? `
          <g class="anim-kuro-eyes">
            <g transform="translate(98, 134)">
              ${isConfused ? `
                <ellipse cx="0" cy="0" rx="6" ry="6.5" fill="url(#eyeGrad_${state})" stroke="#1e1826" stroke-width="2" />
                <circle cx="-1.5" cy="-2" r="2.2" fill="#ffffff" />
                <path d="M -7 -9 Q 0 -5 6 -7" stroke="#4a3b5c" stroke-width="2.2" stroke-linecap="round" />
              ` : `
                <ellipse cx="0" cy="0" rx="6.5" ry="8" fill="url(#eyeGrad_${state})" stroke="#1e1826" stroke-width="2" />
                <circle cx="-1.5" cy="-2.5" r="2.8" fill="#ffffff" />
                <circle cx="2" cy="2.5" r="1.3" fill="#ffffff" opacity="0.9" />
                <path d="M -8 -8 Q 0 -11 8 -7" stroke="#1e1826" stroke-width="2.8" stroke-linecap="round" />
              `}
            </g>
            <g transform="translate(142, 134)">
              ${isConfused ? `
                <ellipse cx="0" cy="0" rx="6" ry="6.5" fill="url(#eyeGrad_${state})" stroke="#1e1826" stroke-width="2" />
                <circle cx="-1.5" cy="-2" r="2.2" fill="#ffffff" />
                <path d="M -6 -7 Q 0 -9 7 -5" stroke="#4a3b5c" stroke-width="2.2" stroke-linecap="round" />
              ` : `
                <ellipse cx="0" cy="0" rx="6.5" ry="8" fill="url(#eyeGrad_${state})" stroke="#1e1826" stroke-width="2" />
                <circle cx="-1.5" cy="-2.5" r="2.8" fill="#ffffff" />
                <circle cx="2" cy="2.5" r="1.3" fill="#ffffff" opacity="0.9" />
                <path d="M -8 -7 Q 0 -11 8 -8" stroke="#1e1826" stroke-width="2.8" stroke-linecap="round" />
              `}
            </g>
          </g>
        ` : `
          <!-- Mata Merenung -->
          <path d="M 92 133 Q 98 139 104 133" stroke="#1e1826" stroke-width="2.5" stroke-linecap="round" fill="none" />
          <path d="M 136 133 Q 142 139 148 133" stroke="#1e1826" stroke-width="2.5" stroke-linecap="round" fill="none" />
        `}

        <circle cx="120" cy="141" r="1" fill="#e09f87" />

        <!-- Mulut Dinamis -->
        ${isTalking ? `
          <path d="M 112 147 Q 120 155 128 147" fill="#be123c" stroke="#1e1826" stroke-width="2" stroke-linecap="round" class="anim-kuro-talking-mouth" />
        ` : isConfused ? `
          <path d="M 114 150 Q 120 146 126 149" fill="none" stroke="#1e1826" stroke-width="2" stroke-linecap="round" />
        ` : isThinking ? `
          <ellipse cx="120" cy="149" rx="2.5" ry="3.5" fill="#be123c" stroke="#1e1826" stroke-width="1.5" />
        ` : `
          <path d="M 113 146 Q 120 152 127 146" fill="none" stroke="#1e1826" stroke-width="2" stroke-linecap="round" />
        `}

        <!-- Rambut Poni Depan -->
        <path d="M 80 112 Q 95 136 100 126 Q 110 138 120 120 Q 130 138 140 126 Q 148 136 160 112 Z" fill="url(#hairGrad_${state})" stroke="#1e1826" stroke-width="2.5" stroke-linejoin="round" />
        <path d="M 80 115 C 72 135 68 165 78 180 C 82 170 85 145 88 128 Z" fill="url(#hairGrad_${state})" stroke="#1e1826" stroke-width="2.2" stroke-linejoin="round" />
        <path d="M 160 115 C 168 135 172 165 162 180 C 158 170 155 145 152 128 Z" fill="url(#hairGrad_${state})" stroke="#1e1826" stroke-width="2.2" stroke-linejoin="round" />

        <!-- Topi Penyihir Khas Elaina -->
        <g transform="${isConfused ? 'rotate(-7, 120, 95)' : 'rotate(0, 120, 95)'}">
          <path d="M 32 108 C 45 92 195 92 208 108 C 190 120 50 120 32 108 Z" fill="url(#robeGrad_${state})" stroke="#1e1826" stroke-width="3" stroke-linejoin="round" />
          <path d="M 72 98 Q 112 50 130 38 Q 155 24 182 32 Q 170 48 152 64 Q 162 82 168 98 Z" fill="url(#robeGrad_${state})" stroke="#1e1826" stroke-width="3" stroke-linejoin="round" />
          <polygon points="188,44 190,48 194,49 191,52 192,56 188,54 184,56 185,52 182,49 186,48" fill="#fde047" stroke="#1e1826" stroke-width="1" />
          <path d="M 72 98 Q 120 90 168 98 L 166 86 Q 120 78 74 86 Z" fill="url(#ribbonGrad_${state})" stroke="#1e1826" stroke-width="2" />
          
          <!-- Pita Kupu-Kupu Besar -->
          <g transform="translate(155, 88)">
            <ellipse cx="-8" cy="-2" rx="9" ry="7" fill="#eddff6" stroke="#1e1826" stroke-width="2" transform="rotate(-15)" />
            <ellipse cx="8" cy="-2" rx="9" ry="7" fill="#eddff6" stroke="#1e1826" stroke-width="2" transform="rotate(15)" />
            <circle cx="0" cy="-2" r="5" fill="#c3a8df" stroke="#1e1826" stroke-width="2" />
            <path d="M -3 3 L -7 16 L -1 13 L 2 16 L 1 3 Z" fill="#d9c3ee" stroke="#1e1826" stroke-width="1.5" />
          </g>
        </g>

        <!-- Tangan Melambai atau Normal -->
        ${isWaving ? `
          <g class="anim-kuro-wave">
            <path d="M 166 160 Q 182 148 190 134 Q 180 128 166 148 Z" fill="url(#robeGrad_${state})" stroke="#1e1826" stroke-width="2.5" />
            <ellipse cx="187" cy="133" rx="5" ry="3" fill="#ffffff" stroke="#1e1826" stroke-width="1.5" transform="rotate(-35, 187, 133)" />
            <path d="M 186 130 C 188 122 195 118 200 123 C 203 126 201 133 194 136 Z" fill="#fff3ec" stroke="#1e1826" stroke-width="2" />
          </g>
        ` : `
          <g>
            <path d="M 162 165 Q 172 178 175 188 Q 168 192 158 178 Z" fill="url(#robeGrad_${state})" stroke="#1e1826" stroke-width="2" />
            <circle cx="174" cy="190" r="4.5" fill="#fff3ec" stroke="#1e1826" stroke-width="1.8" />
          </g>
        `}

        <g>
          <path d="M 78 165 Q 68 178 65 188 Q 72 192 82 178 Z" fill="url(#robeGrad_${state})" stroke="#1e1826" stroke-width="2" />
          <circle cx="66" cy="190" r="4.5" fill="#fff3ec" stroke="#1e1826" stroke-width="1.8" />
        </g>

        <!-- Sepatu Bot -->
        <g>
          <path d="M 98 214 L 98 226 C 98 229 90 231 86 229 C 83 227 88 220 92 215 Z" fill="#543729" stroke="#1e1826" stroke-width="2" />
          <path d="M 142 214 L 142 226 C 142 229 150 231 154 229 C 157 227 152 220 148 215 Z" fill="#543729" stroke="#1e1826" stroke-width="2" />
          <rect x="94" y="219" width="6" height="3" fill="#fde047" stroke="#1e1826" stroke-width="1" />
          <rect x="140" y="219" width="6" height="3" fill="#fde047" stroke="#1e1826" stroke-width="1" />
        </g>
      </g>

      <!-- Status Bingung: Keringat & Tanda Tanya -->
      ${isConfused ? `
        <g transform="translate(62, 102)" class="anim-kuro-sweat">
          <path d="M 0 -6 C 4 -2 5 3 2 6 C -1 8 -5 6 -5 2 C -5 -2 0 -6 0 -6 Z" fill="#38bdf8" stroke="#0284c7" stroke-width="1.5" />
        </g>
        <g transform="translate(182, 70)" class="anim-kuro-question">
          <rect x="-3" y="-3" width="26" height="26" rx="6" fill="#fef08a" stroke="#1e1826" stroke-width="2" />
          <text x="10" y="16" text-anchor="middle" font-size="16" font-weight="900" fill="#1e1826" font-family="monospace">?</text>
        </g>
      ` : ''}

      <!-- Status Berpikir: Bintang Berputar -->
      ${isThinking ? `
        <g transform="translate(180, 68)" class="anim-kuro-sparkle">
          <polygon points="0,-7 2,-2 7,0 2,2 0,7 -2,2 -7,0 -2,-2" fill="#fde047" stroke="#ca8a04" stroke-width="1" />
        </g>
      ` : ''}
    </svg>
  `;
}

// 3. Utilitas Pembersih Teks Ucapan Bot
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

// 4. Manajemen State Aplikasi
let currentMode = 'collapsed'; // 'collapsed' | 'chat_popup' | 'floating_helper'
let currentAnimState = 'idle';
let chatHistory = [];
let isTourActive = false;
let currentTourIndex = 0;
let typingInterval = null;
let tourTimeout = null;

// Elemen DOM
const triggerBtn = document.getElementById('kuroTriggerBtn');
const triggerAvatarContainer = document.getElementById('kuroTriggerAvatarContainer');
const chatPopup = document.getElementById('kuroChatPopup');
const headerAvatarContainer = document.getElementById('kuroHeaderAvatarContainer');
const closePopupBtn = document.getElementById('btnClosePopup');
const quickTourBtn = document.getElementById('btnQuickTour');
const chatLogs = document.getElementById('kuroChatLogs');
const kuroForm = document.getElementById('kuroForm');
const kuroInput = document.getElementById('kuroInput');
const floatingHelper = document.getElementById('kuroFloatingHelper');
const helperAvatarContainer = document.getElementById('kuroHelperAvatarContainer');
const helperText = document.getElementById('helperText');
const helperTourTag = document.getElementById('helperTourTag');
const btnNextStep = document.getElementById('btnNextStep');
const btnCancelTour = document.getElementById('btnCancelTour');
const btnCancelAvatar = document.getElementById('btnCancelAvatar');

// Update Tampilan Avatar pada seluruh container
function updateAvatarContainers(state) {
  currentAnimState = state;
  const svgHtml = renderKuroSvg(state);
  if (triggerAvatarContainer) triggerAvatarContainer.innerHTML = svgHtml;
  if (headerAvatarContainer) headerAvatarContainer.innerHTML = svgHtml;
  if (helperAvatarContainer) helperAvatarContainer.innerHTML = svgHtml;
}

// Efek Mengetik Bertahap (Typewriter Streaming) tersinkronisasi dengan gerak mulut bot
function typewriterStream(text, targetElement, onComplete) {
  if (typingInterval) {
    clearInterval(typingInterval);
    typingInterval = null;
  }

  const clean = cleanSpeechText(text);
  updateAvatarContainers('talking');
  targetElement.textContent = '';

  let idx = 0;
  const speed = 18; // 18ms per karakter

  typingInterval = setInterval(() => {
    idx += 1;
    if (idx >= clean.length) {
      targetElement.textContent = clean;
      clearInterval(typingInterval);
      typingInterval = null;
      updateAvatarContainers('idle');
      if (onComplete) onComplete();
    } else {
      targetElement.textContent = clean.slice(0, idx);
    }
  }, speed);
}

// Fungsi Auto-Scroll Halus ke Elemen Fitur
function scrollToElement(elementId) {
  const el = document.getElementById(elementId) || document.querySelector(`[data-tool-id="${elementId}"]`);
  if (!el) return;

  // Smooth scroll terpusat
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // Efek Sorotan Neon Ring Neobrutalist
  el.classList.add('tool-highlighted');
  setTimeout(() => {
    el.classList.remove('tool-highlighted');
  }, 4500);
}

// Hentikan Tour dan Semua Timer Seketika (Cancel Tour)
function cancelTour() {
  if (typingInterval) {
    clearInterval(typingInterval);
    typingInterval = null;
  }
  if (tourTimeout) {
    clearTimeout(tourTimeout);
    tourTimeout = null;
  }
  isTourActive = false;
  currentTourIndex = 0;

  // Hapus semua efek sorotan di kartu
  document.querySelectorAll('.tool-highlighted').forEach(el => el.classList.remove('tool-highlighted'));

  // Sembunyikan floating helper dan kembalikan ke tombol collapsed
  if (floatingHelper) floatingHelper.classList.add('hidden');
  if (triggerBtn) triggerBtn.classList.remove('hidden');
  updateAvatarContainers('idle');
}

// Eksekusi Langkah Tour 12 Fitur
function executeTourStep(index) {
  if (index >= KURO_TOOLS.length) {
    isTourActive = false;
    updateAvatarContainers('wave');
    const finishMsg = 'Fufufu~ Selesai! Itu dia seluruh 12 fitur hebat yang ada di Kuro Studio. Sekarang giliranmu untuk mencoba setiap fiturnya!';
    typewriterStream(finishMsg, helperText, () => {
      setTimeout(() => {
        cancelTour();
      }, 3500);
    });
    return;
  }

  isTourActive = true;
  currentTourIndex = index;
  const tool = KURO_TOOLS[index];

  if (helperTourTag) {
    helperTourTag.textContent = `GUIDED TOUR (${index + 1}/12)`;
  }

  scrollToElement(tool.elementId);

  const stepDesc = `Fitur ${index + 1} dari 12: ${tool.name} (${tool.tag}). ${tool.desc}`;
  typewriterStream(stepDesc, helperText, () => {
    // Lanjut otomatis ke fitur berikutnya setelah jeda 4 detik
    if (tourTimeout) clearTimeout(tourTimeout);
    tourTimeout = setTimeout(() => {
      executeTourStep(index + 1);
    }, 4200);
  });
}

// Mulai Tour 12 Fitur
function startFullTour() {
  if (chatPopup) chatPopup.classList.add('hidden');
  if (triggerBtn) triggerBtn.classList.add('hidden');
  if (floatingHelper) floatingHelper.classList.remove('hidden');

  executeTourStep(0);
}

// Mode Panduan Fitur Tunggal (Single Tool Guide)
function guideSpecificTool(toolId, customText) {
  if (chatPopup) chatPopup.classList.add('hidden');
  if (triggerBtn) triggerBtn.classList.add('hidden');
  if (floatingHelper) floatingHelper.classList.remove('hidden');

  isTourActive = false;
  const tool = KURO_TOOLS.find(t => t.id === toolId) || KURO_TOOLS[0];
  
  if (helperTourTag) {
    helperTourTag.textContent = `PANDUAN FITUR`;
  }

  scrollToElement(tool.elementId);

  const desc = customText || `Ini dia fitur ${tool.name}! ${tool.desc}`;
  typewriterStream(desc, helperText);
}

// Kirim Pesan ke Backend FastAPI (/api/chat)
async function sendMessage(text) {
  const cleanMsg = text.trim();
  if (!cleanMsg) return;

  // Tampilkan pesan user di logs
  appendChatBubble('user', cleanMsg);
  kuroInput.value = '';

  updateAvatarContainers('thinking');

  // Siapkan bubble AI untuk efek typewriter
  const aiBubble = appendChatBubble('ai', 'Sedang memikirkan...');

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: cleanMsg,
        history: chatHistory.slice(-4)
      })
    });

    if (!res.ok) throw new Error(`HTTP error ${res.status}`);

    const data = await res.json();
    const replyText = cleanSpeechText(data.reply || 'Halo! Ada yang bisa AI Kuro bantu?');
    const anim = data.animation || 'talking';
    const action = data.action || 'none';
    const targetTool = data.target_tool || null;

    chatHistory.push({ sender: 'user', text: cleanMsg });
    chatHistory.push({ sender: 'ai', text: replyText });

    if (action === 'start_tour') {
      startFullTour();
    } else if (action === 'navigate_tool' && targetTool) {
      guideSpecificTool(targetTool, replyText);
    } else {
      typewriterStream(replyText, aiBubble, () => {
        updateAvatarContainers(anim === 'confused' ? 'confused' : 'idle');
      });
    }

  } catch (err) {
    console.warn('[AI Kuro] Request fallback:', err);
    const fallbackMsg = 'Halo! Aku AI Kuro, penyihir penjelajah yang siap memandu seputar 12 fitur Kuro Studio. Coba tanyakan salah satu fitur kami!';
    typewriterStream(fallbackMsg, aiBubble, () => {
      updateAvatarContainers('idle');
    });
  }
}

// Tambah Pesan ke Log Obrolan
function appendChatBubble(sender, text) {
  const row = document.createElement('div');
  row.className = `chat-bubble-row ${sender === 'user' ? 'user-row' : 'ai-row'}`;

  if (sender === 'ai') {
    const avatarMini = document.createElement('div');
    avatarMini.className = 'chat-mini-avatar';
    avatarMini.innerHTML = renderKuroSvg('idle');
    row.appendChild(avatarMini);
  }

  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${sender === 'user' ? 'user-bubble' : 'ai-bubble'}`;
  bubble.textContent = text;
  row.appendChild(bubble);

  chatLogs.appendChild(row);
  chatLogs.scrollTop = chatLogs.scrollHeight;

  return bubble;
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  // Inisialisasi SVG Avatar
  updateAvatarContainers('idle');

  // Tombol Buka Popup
  if (triggerBtn) {
    triggerBtn.addEventListener('click', () => {
      triggerBtn.classList.add('hidden');
      chatPopup.classList.remove('hidden');
      updateAvatarContainers('wave');

      if (chatLogs.children.length === 0) {
        const welcome = 'Halo! Aku AI Kuro, asisten penyihir penjelajah yang siap membantumu menjelaskan seluruh fitur keren di web ini.';
        const bubble = appendChatBubble('ai', '');
        typewriterStream(welcome, bubble);
      } else {
        setTimeout(() => updateAvatarContainers('idle'), 800);
      }
    });
  }

  // Tombol Tutup Popup
  if (closePopupBtn) {
    closePopupBtn.addEventListener('click', () => {
      chatPopup.classList.add('hidden');
      triggerBtn.classList.remove('hidden');
      updateAvatarContainers('idle');
    });
  }

  // Tombol Tour Web dari Header Popup
  if (quickTourBtn) {
    quickTourBtn.addEventListener('click', () => {
      startFullTour();
    });
  }

  // Submit Form Pesan
  if (kuroForm) {
    kuroForm.addEventListener('submit', (e) => {
      e.preventDefault();
      sendMessage(kuroInput.value);
    });
  }

  // Tombol Saran Cepat (Chips)
  document.querySelectorAll('.chip-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const prompt = btn.getAttribute('data-prompt');
      if (prompt) sendMessage(prompt);
    });
  });

  // Tombol Cancel Tour (Header & Avatar)
  if (btnCancelTour) {
    btnCancelTour.addEventListener('click', cancelTour);
  }
  if (btnCancelAvatar) {
    btnCancelAvatar.addEventListener('click', cancelTour);
  }

  // Tombol Fitur Berikutnya pada Helper
  if (btnNextStep) {
    btnNextStep.addEventListener('click', () => {
      if (tourTimeout) clearTimeout(tourTimeout);
      executeTourStep(currentTourIndex + 1);
    });
  }

  // Sapaan otomatis pertama kali web dibuka
  setTimeout(() => {
    if (triggerBtn && !triggerBtn.classList.contains('hidden')) {
      updateAvatarContainers('wave');
      setTimeout(() => updateAvatarContainers('idle'), 2200);
    }
  }, 900);
});
