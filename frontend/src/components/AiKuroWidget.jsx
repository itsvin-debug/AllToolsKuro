import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  X, 
  Minus,
  Send, 
  Sparkles, 
  ArrowUpRight, 
  RotateCcw,
  AlertTriangle,
  Flame,
  GripHorizontal,
  Move
} from 'lucide-react';
import KuroCharacter from './KuroCharacter';
import { 
  getDeviceUserName, 
  getDeviceAngerState, 
  recordDeviceStrike 
} from '../services/storageService';

// Bersihkan markdown mentah agar tampilan ucapan Kuro tetap rapi
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

// Katalog 17 utilitas AllToolsKuro lengkap untuk penjelasan fitur
const KURO_TOOLS_CATALOG = [
  {
    id: 'downloader',
    name: 'Media Downloader',
    tag: 'All-in-One HD',
    desc: 'Unduh video, album slide foto, dan audio MP3 tanpa watermark dari TikTok, Instagram, YouTube, dan medsos lainnya hingga kualitas 4K & Status WA Anti-Burik 1080p.'
  },
  {
    id: 'tiktokStalker',
    name: 'Social Media Stalker',
    tag: 'Multi-Platform OSINT',
    desc: 'Pantau profil, statistik followers, bio, dan postingan akun TikTok, Instagram, X (Twitter), dan GitHub secara 100% anonim tanpa login.'
  },
  {
    id: 'resolver',
    name: 'Safelink & Link Resolver',
    tag: 'Bypass Link & Iklan',
    desc: 'Lewati safelink bertingkat (Sfl.gl, SafelinkU, Ouo, dll) langsung ke direct download (Mediafire, GDrive, Mega) dan ekstrak seluruh tautan bio Linktree instan.'
  },
  {
    id: 'animeFinder',
    name: 'Rekomendasi Anime',
    tag: 'Database MyAnimeList',
    desc: 'Jelajahi ribuan anime terbaik berdasarkan kombinasi genre favorit, skor rating MyAnimeList, poster visual HD, dan sinopsis lengkap.'
  },
  {
    id: 'manhwaFinder',
    name: 'Rekomendasi Manhwa',
    tag: 'Komik Webtoon Korea',
    desc: 'Temukan komik Korea (Manhwa) terpopuler dengan filter genre, skor pembaca, cover jernih, dan rangkuman alur cerita seru.'
  },
  {
    id: 'jjFinder',
    name: 'Cari Link JJ',
    tag: 'Jedag-Jedug Viral',
    desc: 'Temukan ribuan sound jedag-jedug viral, template CapCut siap pakai, preset Alight Motion, dan backsound tren terbaru untuk konten kreatif.'
  },
  {
    id: 'pngToPdf',
    name: 'PNG to PDF',
    tag: 'Konversi Dokumen',
    desc: 'Satukan banyak file gambar PNG dan JPG menjadi satu berkas PDF rapi dengan tata letak proporsional dan resolusi tajam.'
  },
  {
    id: 'linkToDoc',
    name: 'Link to PDF/PPT',
    tag: 'Ekstraktor Materi',
    desc: 'Ekstrak dokumen kuliah dan presentasi dari Scribd atau SlideShare menjadi berkas PDF atau PPT utuh langsung dari tautan web.'
  },
  {
    id: 'imageToLink',
    name: 'File ke Link',
    tag: 'Hosting Instan',
    desc: 'Unggah foto dari perangkatmu dan dapatkan tautan URL publik instan berkecepatan tinggi untuk dibagikan ke mana saja.'
  },
  {
    id: 'compressor',
    name: 'Kompres Media & PDF',
    tag: 'Hemat Memori',
    desc: 'Kecilkan ukuran video, foto, dan dokumen PDF secara signifikan tanpa merusak isi atau membuat gambar pecah.'
  },
  {
    id: 'qrStudio',
    name: 'QR Code Studio',
    tag: 'Desain Kustom',
    desc: 'Studio pembuat kode QR estetik dengan logo kustom, pewarnaan neobrutalist fleksibel, dan resolusi tinggi yang siap dipindai.'
  },
  {
    id: 'audioMerger',
    name: 'Audio Merger',
    tag: 'Kombinasi Suara',
    desc: 'Gabungkan beberapa trek audio atau musik menjadi satu kesatuan alunan utuh dengan perpindahan lagu yang mulus.'
  },
  {
    id: 'photoStudio',
    name: 'Photo Studio',
    tag: 'Filter & Efek',
    desc: 'Editor foto instan dengan ragam filter neobrutalist, rotasi, penyesuaian kontras, serta efek grafis artistik untuk mempercantik gambarmu.'
  },
  {
    id: 'videoStudio',
    name: 'Video Studio',
    tag: 'Studio Kreatif',
    desc: 'Editor video praktis untuk mengatur kecepatan pemutaran, rotasi, rasio layar 9:16 story & 16:9 layar lebar, serta filter visual.'
  },
  {
    id: 'videoTrimmer',
    name: 'Video Trimmer',
    tag: 'Pemotong Presisi',
    desc: 'Pangkas detik awal atau akhir klip videomu secara presisi tanpa menurunkan bitrate asli atau merusak kualitas audionya.'
  },
  {
    id: 'bgRemover',
    name: 'Hapus Background',
    tag: 'AI Background Remover',
    desc: 'Hapus latar belakang foto dalam satu kali klik menggunakan kecerdasan buatan untuk menghasilkan file PNG transparan rapi.'
  },
  {
    id: 'ipChecker',
    name: 'IP & DNS Checker',
    tag: 'Analisis Jaringan',
    desc: 'Cek telemetri IP publik, operator ISP, nomor ASN, koordinat lokasi, dan deteksi VPN/Proxy secara real-time.'
  }
];

const POSITION_STORAGE_KEY = 'kuro_bot_floating_pos';
const DEVICE_CHAT_STORAGE_KEY = 'kuro_device_ai_chat_history';

// Hitung koordinat default yang aman pada viewport saat ini
function computeDefaultPosition(isPopup) {
  if (typeof window === 'undefined') return { x: 24, y: 100 };
  const screenW = window.innerWidth;
  const screenH = window.innerHeight;
  const isMobile = screenW < 640;

  if (isPopup) {
    const w = isMobile ? Math.floor(screenW * 0.92) : 385;
    const h = Math.min(Math.floor(screenH * 0.82), isMobile ? 520 : 560);
    const x = isMobile ? Math.max(12, Math.floor((screenW - w) / 2)) : Math.max(16, screenW - w - 24);
    const y = isMobile ? Math.max(16, screenH - h - 100) : Math.max(16, screenH - h - 24);
    return { x, y };
  }

  const w = isMobile ? 48 : 56;
  const h = isMobile ? 48 : 56;
  const x = isMobile ? Math.max(16, screenW - w - 16) : Math.max(16, screenW - w - 24);
  const y = isMobile ? Math.max(16, screenH - h - 100) : Math.max(16, screenH - h - 24);
  return { x, y };
}

// Muat dan validasi koordinat tersimpan
function getInitialPosition() {
  if (typeof window === 'undefined') return { x: 24, y: 100 };
  try {
    const raw = localStorage.getItem(POSITION_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (
        typeof parsed.x === 'number' && 
        typeof parsed.y === 'number' && 
        !isNaN(parsed.x) && 
        !isNaN(parsed.y) &&
        parsed.x >= 0 && 
        parsed.y >= 0 &&
        parsed.x < window.innerWidth &&
        parsed.y < window.innerHeight
      ) {
        return parsed;
      }
    }
  } catch (_) {}
  return computeDefaultPosition(false);
}

export default function AiKuroWidget({ currentScreen, onNavigateScreen, onOpenTool }) {
  // Mode tampilan: false = collapsed (tombol mengambang), true = chat popup terbuka
  const [isOpen, setIsOpen] = useState(false);
  const [animState, setAnimState] = useState('idle');

  // Posisi mengambang persisten
  const [pos, setPos] = useState(getInitialPosition);
  const widgetRef = useRef(null);

  // State gestur drag
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef({
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
    isDragging: false,
    startTime: 0
  });

  // Modal alert syarat isi nama panggilan
  const [showNameAlert, setShowNameAlert] = useState(false);

  // Status ngambek per perangkat (3-Strike System & 30 Menit Cooldown)
  const [angerState, setAngerState] = useState(() => getDeviceAngerState());
  const [remainingCountdown, setRemainingCountdown] = useState('');

  // Riwayat pesan tersimpan per perangkat
  const [messages, setMessages] = useState(() => {
    try {
      const saved = localStorage.getItem(DEVICE_CHAT_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (_) {}
    return [];
  });

  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [displayedReply, setDisplayedReply] = useState('');

  const messagesEndRef = useRef(null);
  const typingTimerRef = useRef(null);
  const hasGreetedRef = useRef(false);

  // Fungsi Strict Viewport Clamping (mencegah koordinat keluar batas layar)
  const clampPosition = useCallback((targetPos, openState) => {
    if (typeof window === 'undefined') return targetPos;
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const isMobile = screenW < 640;

    const el = widgetRef.current;
    const rect = el ? el.getBoundingClientRect() : null;

    const widgetWidth = rect?.width || (openState ? Math.min(Math.floor(screenW * 0.92), 385) : (isMobile ? 48 : 56));
    const widgetHeight = rect?.height || (openState ? Math.min(Math.floor(screenH * 0.82), 560) : (isMobile ? 48 : 56));

    // Beri batas bawah ekstra untuk mobile bottom nav (96px)
    const bottomClearance = isMobile ? 96 : 16;
    const topClearance = 16;
    const horizontalPadding = 12;

    const rawX = (typeof targetPos?.x === 'number' && !isNaN(targetPos.x)) 
      ? targetPos.x 
      : (screenW - widgetWidth - 24);
    const rawY = (typeof targetPos?.y === 'number' && !isNaN(targetPos.y)) 
      ? targetPos.y 
      : (screenH - widgetHeight - bottomClearance);

    const safeX = Math.max(horizontalPadding, Math.min(rawX, screenW - widgetWidth - horizontalPadding));
    const safeY = Math.max(topClearance, Math.min(rawY, screenH - widgetHeight - bottomClearance));

    return { x: Math.round(safeX), y: Math.round(safeY) };
  }, []);

  // Strict Viewport Clamping otomatis saat resize layar, perubahan mode, atau isi pesan
  useEffect(() => {
    const handleViewportCheck = () => {
      setPos(prev => {
        const clamped = clampPosition(prev, isOpen);
        if (clamped.x !== prev.x || clamped.y !== prev.y) {
          try {
            localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(clamped));
          } catch (_) {}
          return clamped;
        }
        return prev;
      });
    };

    handleViewportCheck();
    const rafId = requestAnimationFrame(handleViewportCheck);
    const timer = setTimeout(handleViewportCheck, 120);

    window.addEventListener('resize', handleViewportCheck);
    return () => {
      window.removeEventListener('resize', handleViewportCheck);
      cancelAnimationFrame(rafId);
      clearTimeout(timer);
    };
  }, [isOpen, messages.length, displayedReply, clampPosition]);

  // Monitor status ngambek dan live countdown
  useEffect(() => {
    const updateAngerTimer = () => {
      const current = getDeviceAngerState();
      setAngerState(current);

      if (current.isAngry && current.remainingMs > 0) {
        const totalSeconds = Math.max(0, Math.floor(current.remainingMs / 1000));
        const mins = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
        const secs = String(totalSeconds % 60).padStart(2, '0');
        setRemainingCountdown(`${mins}:${secs}`);
      } else {
        setRemainingCountdown('');
      }
    };

    updateAngerTimer();
    const interval = setInterval(updateAngerTimer, 1000);
    return () => clearInterval(interval);
  }, []);

  // Simpan riwayat chat lokal di perangkat
  useEffect(() => {
    try {
      if (messages.length > 0) {
        localStorage.setItem(DEVICE_CHAT_STORAGE_KEY, JSON.stringify(messages.slice(-25)));
      } else {
        localStorage.removeItem(DEVICE_CHAT_STORAGE_KEY);
      }
    } catch (_) {}
  }, [messages]);

  // Auto-scroll obrolan ke bagian bawah
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, displayedReply, isOpen]);

  // Efek mengetik bertahap karakter per karakter (Typewriter Effect + Lip-Sync)
  const streamText = useCallback((fullText, onComplete, finalAnim = 'idle') => {
    if (typingTimerRef.current) {
      clearInterval(typingTimerRef.current);
    }

    const clean = cleanSpeechText(fullText);
    setAnimState('talking');
    setIsTyping(true);
    setDisplayedReply('');

    let currentIndex = 0;
    const speed = 16;

    typingTimerRef.current = setInterval(() => {
      currentIndex += 1;
      if (currentIndex >= clean.length) {
        setDisplayedReply(clean);
        clearInterval(typingTimerRef.current);
        typingTimerRef.current = null;
        setIsTyping(false);
        setAnimState(finalAnim);
        if (onComplete) onComplete();
      } else {
        setDisplayedReply(clean.slice(0, currentIndex));
      }
    }, speed);
  }, []);

  // Sapaan otomatis pertama kali jika nama sudah terisi
  useEffect(() => {
    if (hasGreetedRef.current) return;
    hasGreetedRef.current = true;

    const userName = getDeviceUserName();
    if (!userName || !userName.trim()) return;

    try {
      const saved = localStorage.getItem(DEVICE_CHAT_STORAGE_KEY);
      if (saved && JSON.parse(saved).length > 0) return;
    } catch (_) {}

    const greetTimer = setTimeout(() => {
      setIsOpen(true);
      setAnimState('wave');

      const greetingText = `Halo ${userName}! Aku KuroBot, asisten AI resmi AllToolsKuro. Ada yang bisa aku bantu seputar fitur dan navigasi hari ini?`;
      
      setTimeout(() => {
        streamText(greetingText, () => {
          setMessages([{ sender: 'ai', text: greetingText, animation: 'idle' }]);
        });
      }, 600);
    }, 900);

    return () => clearTimeout(greetTimer);
  }, [streamText]);

  // Buka jendela chat secara manual
  const handleOpenWidget = () => {
    const userName = getDeviceUserName();

    if (!userName || !userName.trim()) {
      if (currentScreen !== 'welcome' && onNavigateScreen) {
        onNavigateScreen('welcome');
      }
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('kuro_focus_username_input'));
      }, 200);

      setShowNameAlert(true);
      return;
    }

    setIsOpen(true);
    setAnimState('wave');

    if (messages.length === 0) {
      const greeting = `Halo ${userName}! Aku KuroBot, asisten AI resmi AllToolsKuro. Ada yang bisa aku bantu seputar fitur dan navigasi hari ini?`;
      streamText(greeting, () => {
        setMessages([{ sender: 'ai', text: greeting, animation: 'idle' }]);
      });
    } else {
      setTimeout(() => setAnimState('idle'), 1000);
    }
  };

  // Tutup dan perkecil jendela chat ke launcher mengambang
  const handleCloseWidget = () => {
    if (typingTimerRef.current) {
      clearInterval(typingTimerRef.current);
      typingTimerRef.current = null;
    }
    setIsTyping(false);
    setIsOpen(false);
    setAnimState('idle');
  };

  // Navigasi ke fitur terpilih & perkecil jendela chat
  const handleOpenTool = (toolId) => {
    if (onOpenTool) {
      onOpenTool(toolId);
    }
    handleCloseWidget();
  };

  // Aksi Jelaskan Semua Fitur (menampilkan daftar 17 fitur di dalam pesan chat)
  const handleExplainAllFeatures = () => {
    const userName = getDeviceUserName() || 'Kawan';
    const introText = `Halo ${userName}! AllToolsKuro memiliki ${KURO_TOOLS_CATALOG.length} utilitas lengkap untuk kebutuhan media, dokumen, dan intelijen digital secara gratis. Berikut daftar lengkap seluruh fiturnya:`;

    setMessages(prev => [
      ...prev,
      { sender: 'user', text: 'Jelaskan Semua Fitur' },
      { 
        sender: 'ai', 
        text: introText, 
        animation: 'wave',
        isCatalogList: true 
      }
    ]);
    setAnimState('wave');
  };

  // Hapus riwayat chat di perangkat & reset
  const handleClearHistory = () => {
    if (typingTimerRef.current) {
      clearInterval(typingTimerRef.current);
      typingTimerRef.current = null;
    }

    try {
      localStorage.removeItem(DEVICE_CHAT_STORAGE_KEY);
    } catch (_) {}

    setMessages([]);
    setDisplayedReply('');
    setIsTyping(false);
    setAnimState('wave');

    const userName = getDeviceUserName() || 'Kawan';
    const welcomeReset = `Halo ${userName}! Aku KuroBot, asisten AI resmi AllToolsKuro. Riwayat obrolan telah dibersihkan. Ada yang ingin ditanyakan seputar fitur hari ini?`;
    setTimeout(() => {
      streamText(welcomeReset, () => {
        setMessages([{ sender: 'ai', text: welcomeReset, animation: 'idle' }]);
      });
    }, 300);
  };

  // Rotasi cepat posisi widget ke 4 sudut layar yang aman
  const cycleQuadrantPosition = () => {
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const isMobile = screenW < 640;

    const w = isOpen ? (isMobile ? Math.floor(screenW * 0.92) : 385) : (isMobile ? 48 : 56);
    const h = isOpen ? Math.min(Math.floor(screenH * 0.82), isMobile ? 520 : 560) : (isMobile ? 48 : 56);
    const bottomClearance = isMobile ? 96 : 16;

    const corners = [
      { x: screenW - w - 16, y: screenH - h - bottomClearance }, // Bawah-Kanan
      { x: 16, y: screenH - h - bottomClearance },                // Bawah-Kiri
      { x: 16, y: 16 },                                          // Atas-Kiri
      { x: screenW - w - 16, y: 16 }                             // Atas-Kanan
    ];

    // Cari sudut terdekat saat ini lalu pilih sudut berikutnya
    let closestIndex = 0;
    let minDistance = Infinity;
    corners.forEach((c, idx) => {
      const d = Math.hypot(c.x - pos.x, c.y - pos.y);
      if (d < minDistance) {
        minDistance = d;
        closestIndex = idx;
      }
    });

    const nextCorner = corners[(closestIndex + 1) % corners.length];
    const clamped = clampPosition(nextCorner, isOpen);
    setPos(clamped);
    try {
      localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(clamped));
    } catch (_) {}
  };

  // Kirim pesan obrolan (dengan proteksi kata kasar & ngambek 30 menit)
  const handleSendMessage = async (customMessage = null) => {
    const textToSend = (customMessage || inputText).trim();
    if (!textToSend || isTyping) return;

    const userName = getDeviceUserName() || 'Kawan';

    // 1. Cek status ngambek
    const currentAnger = getDeviceAngerState();
    if (currentAnger.isAngry) {
      const totalSeconds = Math.max(0, Math.floor(currentAnger.remainingMs / 1000));
      const mins = Math.floor(totalSeconds / 60);
      const secs = totalSeconds % 60;
      const angryRefusal = `Hmph! Aku masih ngambek sama kamu, ${userName}! Jangan ajak aku bicara dulu! (Sisa waktu ngambek: ${mins} menit ${secs} detik).`;

      setInputText('');
      setAnimState('angry');
      streamText(angryRefusal, () => {
        setMessages(prev => [
          ...prev, 
          { sender: 'user', text: textToSend },
          { sender: 'ai', text: angryRefusal, animation: 'angry' }
        ]);
      }, 'angry');
      return;
    }

    // 2. Deteksi kata kasar & makian
    const isProfane = /\b(nigga|nigger|negro|niggas|niggers|chink|spic|kike|faggot|retard|anjing|asw|asu|babi|kontol|kontl|kntl|memek|mmk|jembut|peler|pepek|itil|pantek|ngentot|ngntt|bangsat|bgst|bngst|bajingan|goblok|gblk|tolol|bego|idiot|bodoh|bodo|pekok|tai|taik|bokep|porno|sange|lonte|perek|jablay|bencong|banci|fuck|shit|bitch|asshole|dick|pussy|cunt|anj|anjr|anjir)\b/i.test(textToSend);

    if (isProfane) {
      setInputText('');
      setDisplayedReply('');

      const newHistory = [...messages, { sender: 'user', text: textToSend }];
      setMessages(newHistory);

      const strikeResult = recordDeviceStrike();
      setAngerState(getDeviceAngerState());

      let warningMsg = '';
      let targetAnim = 'confused';
      if (strikeResult.strikes === 1) {
        warningMsg = `Hmph! ${userName}, kata-kata itu tidak sopan sama sekali! Tolong jaga bahasamu ya, jangan membuat Kuro kesal! (Peringatan 1/3)`;
        targetAnim = 'confused';
      } else if (strikeResult.strikes === 2) {
        warningMsg = `Mou! Sudah kubilang jangan bicara kasar, ${userName}! Kalau kamu mengulanginya sekali lagi, Kuro benar-benar akan ngambek! (Peringatan 2/3)`;
        targetAnim = 'angry';
      } else {
        warningMsg = `Cukup! Aku benar-benar marah dan ngambek padamu, ${userName}! Jangan ajak aku bicara selama 30 menit ke depan! Hmph! 💢 (Peringatan 3/3)`;
        targetAnim = 'angry';
      }

      setAnimState(targetAnim);
      streamText(warningMsg, () => {
        setMessages(prev => [...prev, { sender: 'ai', text: warningMsg, animation: targetAnim }]);
      }, targetAnim);
      return;
    }

    // 3. Deteksi lokal pertanyaan pengenalan & daftar semua fitur
    const lower = textToSend.toLowerCase();
    if (
      lower.includes('jelaskan semua fitur') || 
      lower.includes('semua fitur') || 
      lower.includes('daftar fitur') || 
      lower.includes('list fitur') || 
      lower.includes('apa saja fiturnya') ||
      lower.includes('fitur apa saja')
    ) {
      setInputText('');
      handleExplainAllFeatures();
      return;
    }

    // 4. Proses chat ke backend
    setInputText('');
    setDisplayedReply('');

    const newHistory = [...messages, { sender: 'user', text: textToSend }];
    setMessages(newHistory);
    setIsTyping(true);
    setAnimState('thinking');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToSend,
          userName: userName,
          history: newHistory.slice(-5)
        })
      });

      if (!res.ok) throw new Error(`HTTP error ${res.status}`);

      const data = await res.json();
      const reply = cleanSpeechText(data.reply || `Halo ${userName}! Ada yang bisa KuroBot bantu seputar AllToolsKuro?`);
      const anim = (data.animation === 'confused' || data.animation === 'angry') ? data.animation : (data.animation || 'talking');
      const targetTool = data.target_tool || data.targetTool || null;

      setAnimState(anim);

      if (data.action === 'start_tour' || data.action === 'explain_features') {
        handleExplainAllFeatures();
      } else {
        streamText(reply, () => {
          setMessages(prev => [...prev, { 
            sender: 'ai', 
            text: reply, 
            animation: anim,
            toolId: targetTool
          }]);
        }, anim);
      }
    } catch (_) {
      // Fallback offline jika koneksi AI terganggu
      if (lower.includes('safelink') || lower.includes('bypass') || lower.includes('shortlink') || lower.includes('linktree')) {
        const fbMsg = `Ini dia fitur Safelink & Linktree Resolver, ${userName}! Alat instan untuk melewati tautan iklan bertingkat (Sfl.gl, SafelinkU, Ouo) langsung ke unduhan Mediafire/GDrive dan mengekstrak tautan Linktree.`;
        setAnimState('talking');
        streamText(fbMsg, () => {
          setMessages(prev => [...prev, { sender: 'ai', text: fbMsg, animation: 'talking', toolId: 'resolver' }]);
        });
        return;
      }

      if (lower.includes('stalk') || lower.includes('tiktok') || lower.includes('instagram') || lower.includes('twitter') || lower.includes('github')) {
        const fbMsg = `Fitur Social Media Stalker siap memantau profil TikTok, Instagram, X (Twitter), dan GitHub secara 100% anonim tanpa login, ${userName}!`;
        setAnimState('talking');
        streamText(fbMsg, () => {
          setMessages(prev => [...prev, { sender: 'ai', text: fbMsg, animation: 'talking', toolId: 'tiktokStalker' }]);
        });
        return;
      }

      if (lower.includes('anime')) {
        const fbMsg = `Fitur Rekomendasi Anime menyediakan ribuan judul terbaik berdasarkan kombinasi genre dan rating MyAnimeList, ${userName}.`;
        setAnimState('talking');
        streamText(fbMsg, () => {
          setMessages(prev => [...prev, { sender: 'ai', text: fbMsg, animation: 'talking', toolId: 'animeFinder' }]);
        });
        return;
      }

      if (lower.includes('manhwa')) {
        const fbMsg = `Fitur Rekomendasi Manhwa menghadirkan katalog komik Korea terlengkap dengan sinopsis dan skor pembaca, ${userName}.`;
        setAnimState('talking');
        streamText(fbMsg, () => {
          setMessages(prev => [...prev, { sender: 'ai', text: fbMsg, animation: 'talking', toolId: 'manhwaFinder' }]);
        });
        return;
      }

      if (lower.includes('capcut') || lower.includes('preset') || lower.includes('alight motion') || lower.includes('jj')) {
        const fbMsg = `Fitur Cari Link JJ menyediakan ribuan sound viral, preset Alight Motion, dan template CapCut siap pakai, ${userName}.`;
        setAnimState('talking');
        streamText(fbMsg, () => {
          setMessages(prev => [...prev, { sender: 'ai', text: fbMsg, animation: 'talking', toolId: 'jjFinder' }]);
        });
        return;
      }

      const defaultFallback = `KuroBot siap membantu kebutuhan media, dokumen, dan navigasi di AllToolsKuro, ${userName}! Tanyakan seputar fitur yang tersedia atau klik 'Jelaskan Semua Fitur'.`;
      setAnimState('confused');
      streamText(defaultFallback, () => {
        setMessages(prev => [...prev, { sender: 'ai', text: defaultFallback, animation: 'confused' }]);
      }, 'confused');
    }
  };

  // ─── GESTUR DRAGGING DENGAN CLAMPING PREVENT-OFFSCREEN ───
  const handleDragStart = (e) => {
    if (e.target.closest('button') || e.target.closest('input')) return;
    if (e.button !== undefined && e.button !== 0) return;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    dragStateRef.current = {
      startX: clientX,
      startY: clientY,
      originX: pos.x,
      originY: pos.y,
      isDragging: false,
      lastDx: 0,
      lastDy: 0,
      startTime: Date.now()
    };

    const handleMove = (moveEv) => {
      const curX = moveEv.touches ? moveEv.touches[0].clientX : moveEv.clientX;
      const curY = moveEv.touches ? moveEv.touches[0].clientY : moveEv.clientY;
      const dx = curX - dragStateRef.current.startX;
      const dy = curY - dragStateRef.current.startY;
      dragStateRef.current.lastDx = dx;
      dragStateRef.current.lastDy = dy;

      if (!dragStateRef.current.isDragging && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
        dragStateRef.current.isDragging = true;
        setIsDragging(true);
      }

      if (dragStateRef.current.isDragging) {
        if (moveEv.cancelable) moveEv.preventDefault();
        setDragOffset({ x: dx, y: dy });
      }
    };

    const handleEnd = () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
      window.removeEventListener('touchcancel', handleEnd);

      const { isDragging: wasDragging, originX, originY, startTime } = dragStateRef.current;
      const duration = Date.now() - startTime;

      setIsDragging(false);
      setDragOffset({ x: 0, y: 0 });

      // Jika hanya ketukan singkat tanpa drag pada tombol launcher, buka chat
      if (!wasDragging && !isOpen && duration < 350) {
        handleOpenWidget();
        return;
      }

      if (wasDragging) {
        const rawNewX = originX + (dragStateRef.current.lastDx || 0);
        const rawNewY = originY + (dragStateRef.current.lastDy || 0);
        const clamped = clampPosition({ x: rawNewX, y: rawNewY }, isOpen);
        setPos(clamped);
        try {
          localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(clamped));
        } catch (_) {}
      }
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleEnd);
    window.addEventListener('touchcancel', handleEnd);
  };

  // Posisi render visual saat ini (posisi dasar + offset pergeseran selama drag)
  const currentRenderX = pos.x + dragOffset.x;
  const currentRenderY = pos.y + dragOffset.y;

  return (
    <>
      {/* ─── 1. MODAL ALERT PERINGATAN WAJIB ISI NAMA ─── */}
      {showNameAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div 
            className="w-full max-w-sm rounded-2xl border-2 border-black bg-white text-black shadow-[6px_6px_0px_#000000] p-5 space-y-4"
            role="alertdialog"
            aria-labelledby="name-alert-title"
          >
            <div className="flex items-center gap-2.5 text-amber-600 font-black text-base border-b-2 border-black pb-2.5">
              <AlertTriangle className="w-5 h-5 stroke-[2.5]" />
              <span id="name-alert-title">Syarat Akses Chatbot</span>
            </div>

            <p className="text-xs text-neutral-800 leading-relaxed font-semibold">
              Silakan masukkan nama panggilan Anda terlebih dahulu di halaman utama sebelum menggunakan chatbot!
            </p>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowNameAlert(false);
                  window.dispatchEvent(new CustomEvent('kuro_focus_username_input'));
                }}
                className="px-4 py-2 rounded-xl border-2 border-black bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs shadow-[2px_2px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer"
              >
                Isi Nama Sekarang
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 2. TOMBOL LAUNCHER MENGAMBANG (COLLAPSED) — SELALU ADA DI LAYAR ─── */}
      {!isOpen && (
        <div 
          ref={widgetRef}
          onMouseDown={handleDragStart}
          onTouchStart={handleDragStart}
          style={{
            position: 'fixed',
            left: `${currentRenderX}px`,
            top: `${currentRenderY}px`,
            zIndex: 50
          }}
          className={`flex items-center gap-2 select-none touch-none ${
            isDragging ? 'cursor-grabbing' : 'cursor-grab transition-[left,top] duration-150 ease-out'
          }`}
        >
          {/* Label Sapaan Desktop */}
          <div className="hidden sm:flex items-center gap-1.5 bg-white text-black border-2 border-black px-3 py-1.5 rounded-xl shadow-[3px_3px_0px_#000000] text-xs font-bold font-mono pointer-events-none select-none">
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            <span>Tanya KuroBot</span>
          </div>

          <button
            type="button"
            onClick={handleOpenWidget}
            className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-white border-2 border-black ${
              isDragging 
                ? 'shadow-[4px_4px_0px_#000000] scale-105' 
                : 'shadow-[3px_3px_0px_#000000] hover:shadow-[4px_4px_0px_#000000] hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5'
            } transition-all flex items-center justify-center relative overflow-hidden p-1 cursor-pointer`}
            title="Klik untuk buka chat, atau tahan & geser untuk atur posisi"
            aria-label="Buka Asisten KuroBot"
          >
            <KuroCharacter state="wave" size={typeof window !== 'undefined' && window.innerWidth < 640 ? 38 : 46} />
            
            {/* Status Aktif / Ngambek */}
            <span 
              className={`absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full border border-black ${
                angerState.isAngry ? 'bg-rose-500 animate-ping' : 'bg-blue-600 animate-pulse'
              }`} 
            />

            {/* Indikator Titik Geser */}
            <div className="absolute bottom-1 inset-x-0 flex justify-center items-center pointer-events-none opacity-40">
              <div className="w-3.5 h-0.5 rounded-full bg-black" />
            </div>
          </button>
        </div>
      )}

      {/* ─── 3. POPUP JENDELA CHAT (EXPANDED) — STRICT VIEWPORT CLAMPED ─── */}
      {isOpen && (
        <div 
          ref={widgetRef}
          style={{
            position: 'fixed',
            left: `${currentRenderX}px`,
            top: `${currentRenderY}px`,
            zIndex: 50
          }}
          className={`w-[92vw] sm:w-[385px] max-h-[82vh] sm:max-h-[560px] rounded-2xl border-2 border-black bg-white text-black shadow-[6px_6px_0px_#000000] flex flex-col overflow-hidden animate-in fade-in duration-150 ${
            isDragging ? 'select-none' : 'transition-[left,top] duration-150 ease-out'
          }`}
        >
          {/* Header Popup: Drag Handle, Karakter, Nama, & Kontrol Minimalkan */}
          <div 
            onMouseDown={handleDragStart}
            onTouchStart={handleDragStart}
            className={`p-3 bg-neutral-50 text-black border-b-2 border-black flex items-center justify-between select-none touch-none ${
              isDragging ? 'cursor-grabbing bg-neutral-100' : 'cursor-grab'
            }`}
          >
            <div className="flex items-center gap-2.5 pointer-events-none">
              <div className="w-10 h-10 rounded-xl bg-blue-600 border-2 border-black overflow-hidden shrink-0 shadow-[2px_2px_0px_#000000] flex items-center justify-center p-0.5">
                <KuroCharacter state={animState} size={38} />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="font-black text-sm tracking-tight text-black">KuroBot</span>
                  <span className="bg-blue-600 text-white text-[9px] font-mono font-bold px-1.5 py-0.2 rounded border border-black shadow-[1px_1px_0px_#000000]">
                    AI ASISTEN
                  </span>
                </div>
                <span className="text-[10px] text-neutral-600 font-mono font-bold flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${angerState.isAngry ? 'bg-rose-500' : 'bg-emerald-500'} animate-pulse`} />
                  {angerState.isAngry ? 'Sedang Ngambek' : 'Siap Membantu'}
                </span>
              </div>
            </div>

            {/* Kontrol Header */}
            <div className="flex items-center gap-1.5">
              {/* Tombol Rotasi Cepat Posisi 4 Sudut */}
              <button
                type="button"
                onClick={cycleQuadrantPosition}
                className="w-7 h-7 rounded-lg bg-white hover:bg-neutral-100 text-neutral-800 border-2 border-black shadow-[1.5px_1.5px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 flex items-center justify-center transition-all cursor-pointer"
                title="Pindah ke Sudut Layar Lainnya"
                aria-label="Pindah sudut posisi widget"
              >
                <Move className="w-3.5 h-3.5 stroke-[2.5]" />
              </button>

              {/* Indikator Geser */}
              <div 
                className="hidden xs:flex items-center gap-1 px-1.5 py-0.5 rounded border border-neutral-300 bg-white text-neutral-500 text-[9px] font-mono select-none"
                title="Tahan dan geser untuk memindahkan jendela chat"
              >
                <GripHorizontal className="w-3.5 h-3.5" />
                <span className="font-bold">Geser</span>
              </div>

              {/* Tombol Hapus Riwayat Chat */}
              <button
                type="button"
                onClick={handleClearHistory}
                className="w-7 h-7 rounded-lg bg-white hover:bg-rose-50 text-neutral-700 hover:text-rose-600 border-2 border-black shadow-[1.5px_1.5px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 flex items-center justify-center transition-all cursor-pointer"
                title="Hapus Riwayat Chat"
                aria-label="Hapus Riwayat Chat"
              >
                <RotateCcw className="w-3.5 h-3.5 stroke-[2.5]" />
              </button>

              {/* Tombol Minimalkan (-) */}
              <button
                type="button"
                onClick={handleCloseWidget}
                className="w-7 h-7 rounded-lg bg-white hover:bg-neutral-100 text-neutral-700 hover:text-black border-2 border-black shadow-[1.5px_1.5px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 flex items-center justify-center transition-all cursor-pointer"
                title="Minimalkan ke Tombol Mengambang"
                aria-label="Minimalkan Chat"
              >
                <Minus className="w-4 h-4 stroke-[2.5]" />
              </button>

              {/* Tombol Tutup (X) */}
              <button
                type="button"
                onClick={handleCloseWidget}
                className="w-7 h-7 rounded-lg bg-white hover:bg-neutral-100 text-neutral-700 hover:text-black border-2 border-black shadow-[1.5px_1.5px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 flex items-center justify-center transition-all cursor-pointer"
                title="Tutup Chat"
                aria-label="Tutup Chat"
              >
                <X className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>
          </div>

          {/* Banner Peringatan Ngambek */}
          {angerState.isAngry && (
            <div className="p-2.5 bg-rose-100 border-b-2 border-black text-rose-800 text-xs font-mono font-bold flex items-center justify-between px-3">
              <span className="flex items-center gap-1.5">
                <Flame className="w-4 h-4 text-rose-600 animate-pulse stroke-[2.5]" />
                <span>KuroBot Sedang Ngambek!</span>
              </span>
              <span className="bg-rose-600 text-white px-2 py-0.5 rounded border border-black font-black text-[11px]">
                {remainingCountdown || '30:00'}
              </span>
            </div>
          )}

          {/* Area Riwayat Pesan Obrolan Neobrutalist Terang */}
          <div className="flex-1 p-3.5 overflow-y-auto max-h-[360px] flex flex-col gap-3 bg-neutral-50/70 text-xs custom-scrollbar">
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`flex gap-2 items-start ${
                  m.sender === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {m.sender === 'ai' && (
                  <div className="w-7 h-7 rounded-lg bg-blue-600 border-2 border-black overflow-hidden shrink-0 mt-0.5 flex items-center justify-center p-0.5 shadow-[1.5px_1.5px_0px_#000000]">
                    <KuroCharacter state={m.animation || 'idle'} size={28} />
                  </div>
                )}
                
                {/* Bubble Chat */}
                <div
                  className={`p-3 rounded-xl border-2 border-black max-w-[88%] text-xs leading-relaxed font-sans shadow-[2px_2px_0px_#000000] ${
                    m.sender === 'user'
                      ? 'bg-blue-600 text-white font-medium text-right'
                      : 'bg-white text-neutral-900 text-left'
                  }`}
                >
                  {m.isCatalogList ? (
                    <div className="space-y-2">
                      <p className="whitespace-pre-line font-medium text-neutral-800">{cleanSpeechText(m.text)}</p>
                      
                      {/* Daftar 17 Utilitas AllToolsKuro dengan Scroll Terbatas max-h-[50vh] */}
                      <div className="max-h-[50vh] sm:max-h-[300px] overflow-y-auto space-y-2 pr-1 custom-scrollbar pt-1">
                        {KURO_TOOLS_CATALOG.map((tool, tIdx) => (
                          <div 
                            key={tool.id}
                            className="p-2.5 rounded-xl border border-black bg-neutral-50 hover:bg-blue-50/50 transition-colors shadow-[1px_1px_0px_#000000] flex flex-col gap-1.5"
                          >
                            <div className="flex items-center justify-between gap-1">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-[10px] font-mono font-black text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded border border-blue-900/30">
                                  [{tIdx + 1}/{KURO_TOOLS_CATALOG.length}]
                                </span>
                                <span className="font-black text-xs text-neutral-900 truncate">
                                  {tool.name}
                                </span>
                              </div>
                              <span className="text-[9px] font-mono font-bold text-neutral-600 bg-neutral-200/80 px-1.5 py-0.5 rounded shrink-0">
                                {tool.tag}
                              </span>
                            </div>
                            <p className="text-[11px] text-neutral-700 leading-relaxed font-sans">
                              {tool.desc}
                            </p>
                            <div className="pt-1 flex justify-end">
                              <button
                                type="button"
                                onClick={() => handleOpenTool(tool.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 active:translate-x-0.5 active:translate-y-0.5 text-white font-bold text-[10px] border border-black shadow-[1px_1px_0px_#000000] cursor-pointer transition-all"
                              >
                                <span>Buka Fitur Ini</span>
                                <ArrowUpRight className="w-3 h-3 stroke-[2.5]" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="whitespace-pre-line">{cleanSpeechText(m.text)}</p>

                      {/* Tombol Pintasan Buka Fitur Tunggal */}
                      {m.toolId && onOpenTool && (
                        <button
                          type="button"
                          onClick={() => handleOpenTool(m.toolId)}
                          className="mt-2.5 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 active:translate-x-0.5 active:translate-y-0.5 text-white font-bold text-[11px] border border-black shadow-[1px_1px_0px_#000000] cursor-pointer transition-all"
                        >
                          <span>Buka Fitur Ini</span>
                          <ArrowUpRight className="w-3 h-3 stroke-[2.5]" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Bubble Respons Typewriter Streaming */}
            {isTyping && displayedReply && (
              <div className="flex gap-2 items-start justify-start">
                <div className="w-7 h-7 rounded-lg bg-blue-600 border-2 border-black overflow-hidden shrink-0 mt-0.5 flex items-center justify-center p-0.5 shadow-[1.5px_1.5px_0px_#000000]">
                  <KuroCharacter state="talking" size={28} />
                </div>
                <div className="p-3 rounded-xl border-2 border-black bg-white text-neutral-900 shadow-[2px_2px_0px_#000000] max-w-[85%] text-xs leading-relaxed font-sans text-left">
                  <p className="whitespace-pre-line">{displayedReply}</p>
                  <span className="inline-block w-1.5 h-3 ml-1 bg-blue-600 animate-pulse" />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Prompt Cepat (Quick Suggestions) */}
          <div className="px-3 py-2 bg-neutral-100 border-t-2 border-black flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={handleExplainAllFeatures}
              className="px-2.5 py-1 rounded-md bg-white hover:bg-blue-50 text-blue-700 border border-black text-[11px] font-bold font-mono shrink-0 cursor-pointer shadow-[1px_1px_0px_#000000] transition-colors"
            >
              Jelaskan Semua Fitur
            </button>
            <button
              type="button"
              onClick={() => handleSendMessage('apa saja fitur social media stalker?')}
              className="px-2.5 py-1 rounded-md bg-white hover:bg-neutral-50 text-neutral-800 border border-black text-[11px] font-semibold font-mono shrink-0 cursor-pointer shadow-[1px_1px_0px_#000000] transition-colors"
            >
              Social Media Stalker
            </button>
            <button
              type="button"
              onClick={() => handleSendMessage('bagaimana cara kerja safelink resolver?')}
              className="px-2.5 py-1 rounded-md bg-white hover:bg-neutral-50 text-neutral-800 border border-black text-[11px] font-semibold font-mono shrink-0 cursor-pointer shadow-[1px_1px_0px_#000000] transition-colors"
            >
              Safelink Bypasser
            </button>
            <button
              type="button"
              onClick={() => handleSendMessage('cara cari template capcut dan preset jedag-jedug?')}
              className="px-2.5 py-1 rounded-md bg-white hover:bg-neutral-50 text-neutral-800 border border-black text-[11px] font-semibold font-mono shrink-0 cursor-pointer shadow-[1px_1px_0px_#000000] transition-colors"
            >
              Template CapCut
            </button>
            <button
              type="button"
              onClick={() => handleSendMessage('rekomendasi anime apa yang bagus ditonton?')}
              className="px-2.5 py-1 rounded-md bg-white hover:bg-neutral-50 text-neutral-800 border border-black text-[11px] font-semibold font-mono shrink-0 cursor-pointer shadow-[1px_1px_0px_#000000] transition-colors"
            >
              Rekomendasi Anime
            </button>
            <button
              type="button"
              onClick={() => handleSendMessage('apa saja format yang didukung downloader?')}
              className="px-2.5 py-1 rounded-md bg-white hover:bg-neutral-50 text-neutral-800 border border-black text-[11px] font-semibold font-mono shrink-0 cursor-pointer shadow-[1px_1px_0px_#000000] transition-colors"
            >
              Media Downloader
            </button>
          </div>

          {/* Kotak Input Pesan Neobrutalist Terang */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="p-3 bg-white border-t-2 border-black flex items-center gap-2"
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={angerState.isAngry ? `Kuro sedang ngambek... (${remainingCountdown})` : 'Tanya seputar fitur AllToolsKuro...'}
              disabled={isTyping || angerState.isAngry}
              maxLength={200}
              className="flex-1 px-3 py-2 rounded-xl border-2 border-black bg-neutral-50 text-neutral-900 placeholder:text-neutral-400 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-black disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isTyping || !inputText.trim() || angerState.isAngry}
              className="p-2.5 rounded-xl border-2 border-black bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40 shadow-[2px_2px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer shrink-0"
              title="Kirim Pesan"
              aria-label="Kirim Pesan"
            >
              <Send className="w-4 h-4 stroke-[2.5]" />
            </button>
          </form>

        </div>
      )}
    </>
  );
}
