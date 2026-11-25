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
  Move,
  ArrowRight,
  CheckCircle2
} from 'lucide-react';
import KuroCharacter from './KuroCharacter';
import { 
  getDeviceUserName, 
  getDeviceAngerState, 
  recordDeviceStrike,
  resetDeviceAngerState 
} from '../../shared/utils/storageService';
import { isToxicText } from '../../shared/utils/toxicFilter';
import { cleanSpeechText, KURO_TOOLS_CATALOG } from './kurobotCatalog';

const POSITION_STORAGE_KEY = 'kuro_bot_floating_pos';
const MOBILE_POSITION_STORAGE_KEY = 'kuro_bot_floating_pos_mobile';
const DEVICE_CHAT_STORAGE_KEY = 'kuro_device_ai_chat_history';

function getPosStorageKey(screenW = typeof window !== 'undefined' ? window.innerWidth : 1024) {
  return screenW < 768 ? MOBILE_POSITION_STORAGE_KEY : POSITION_STORAGE_KEY;
}

// Hitung koordinat default yang aman menempel ke tepi kiri atau kanan
function computeDefaultPosition(isPopup, dockSide = 'right') {
  if (typeof window === 'undefined') return { x: 12, y: 100, dockSide: 'right' };
  const screenW = window.innerWidth;
  const screenH = window.innerHeight;
  const isMobile = screenW < 768;

  if (isPopup) {
    const w = isMobile ? Math.floor(screenW * 0.92) : 385;
    const h = Math.min(Math.floor(screenH * 0.82), isMobile ? 520 : 560);
    const x = dockSide === 'left' ? 12 : Math.max(12, screenW - w - 12);
    const y = isMobile ? Math.max(16, screenH - h - 96) : Math.max(16, screenH - h - 24);
    return { x, y, dockSide };
  }

  const w = isMobile ? 48 : 175;
  const h = isMobile ? 48 : 56;
  const x = dockSide === 'left' ? 12 : Math.max(12, screenW - w - 12);
  const y = isMobile ? Math.max(16, screenH - h - 96) : Math.max(16, screenH - h - 24);
  return { x, y, dockSide };
}

// Muat dan validasi koordinat tersimpan dengan jaminan edge-docked
function getInitialPosition() {
  if (typeof window === 'undefined') return { x: 12, y: 100, dockSide: 'right' };
  try {
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const isMobile = screenW < 768;
    const raw = localStorage.getItem(getPosStorageKey(screenW));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed.y === 'number' && !isNaN(parsed.y)) {
        const dockSide = parsed.dockSide === 'left' ? 'left' : 'right';
        const w = isMobile ? 48 : 175;
        const h = isMobile ? 48 : 56;
        const bottomClearance = isMobile ? 96 : 16;
        const x = dockSide === 'left' ? 12 : Math.max(12, screenW - w - 12);
        const y = Math.max(16, Math.min(parsed.y, screenH - h - bottomClearance));
        return { x, y, dockSide };
      }
    }
  } catch (_) {}
  return computeDefaultPosition(false, 'right');
}

export default function AiKuroWidget({ currentScreen, onNavigateScreen, onOpenTool }) {
  // Mode tampilan: false = collapsed (tombol mengambang), true = chat popup terbuka
  const [isOpen, setIsOpen] = useState(false);
  const [animState, setAnimState] = useState('idle');

  // Posisi mengambang persisten dengan strict magnetic edge-docking (left/right)
  const [pos, setPos] = useState(getInitialPosition);
  const widgetRef = useRef(null);

  // State gestur drag berbasis Universal Pointer Events
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef({
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
    isDragging: false,
    pointerId: null,
    startTime: 0,
    lastDx: 0,
    lastDy: 0
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

  // Fungsi Strict Viewport Clamping & Edge-Docking (hanya kiri atau kanan)
  const clampPosition = useCallback((targetPos, openState) => {
    if (typeof window === 'undefined') return targetPos;
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const isMobile = screenW < 768;

    const el = widgetRef.current;
    const rect = el ? el.getBoundingClientRect() : null;

    const widgetWidth = rect?.width || (openState ? (isMobile ? Math.floor(screenW * 0.92) : 385) : (isMobile ? 48 : 175));
    const widgetHeight = rect?.height || (openState ? (isMobile ? 520 : 560) : (isMobile ? 48 : 56));

    const bottomClearance = isMobile ? 96 : 16;
    const topClearance = 16;

    // Tentukan dockSide berdasarkan targetPos atau center X
    const dockSide = targetPos?.dockSide === 'left' ? 'left' : (
      (targetPos?.x !== undefined && (targetPos.x + widgetWidth / 2 < screenW / 2)) ? 'left' : 'right'
    );

    const safeX = dockSide === 'left' ? 12 : Math.max(12, screenW - widgetWidth - 12);
    const rawY = typeof targetPos?.y === 'number' && !isNaN(targetPos.y) ? targetPos.y : (screenH - widgetHeight - bottomClearance);
    const safeY = Math.max(topClearance, Math.min(rawY, screenH - widgetHeight - bottomClearance));

    return { x: Math.round(safeX), y: Math.round(safeY), dockSide };
  }, []);

  // Strict Viewport Clamping otomatis saat resize layar
  const lastBreakpointRef = useRef(typeof window !== 'undefined' ? window.innerWidth < 768 : false);
  useEffect(() => {
    const handleViewportCheck = () => {
      const nowMobile = window.innerWidth < 768;
      if (nowMobile !== lastBreakpointRef.current) {
        lastBreakpointRef.current = nowMobile;
        setPos(clampPosition(getInitialPosition(), isOpen));
        return;
      }
      setPos(prev => {
        const clamped = clampPosition(prev, isOpen);
        if (clamped.x !== prev.x || clamped.y !== prev.y || clamped.dockSide !== prev.dockSide) {
          try {
            localStorage.setItem(getPosStorageKey(window.innerWidth), JSON.stringify(clamped));
          } catch (_) {}
          return clamped;
        }
        return prev;
      });
    };

    handleViewportCheck();
    window.addEventListener('resize', handleViewportCheck);
    return () => window.removeEventListener('resize', handleViewportCheck);
  }, [isOpen, clampPosition]);

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
    const speed = 14;

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

  // Navigasi ke fitur terpilih
  const handleOpenTool = (toolId) => {
    if (onOpenTool) {
      onOpenTool(toolId);
    }
  };

  // ─── FITUR TUR INTERAKTIF SATU PER SATU (17 FITUR) ───
  const highlightToolElement = (toolId) => {
    if (currentScreen !== 'welcome' && onNavigateScreen) {
      onNavigateScreen('welcome');
    }
    setTimeout(() => {
      const el = document.getElementById(`tool-${toolId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('ring-4', 'ring-blue-600', 'ring-offset-2', 'animate-pulse');
        setTimeout(() => {
          el.classList.remove('ring-4', 'ring-blue-600', 'ring-offset-2', 'animate-pulse');
        }, 2800);
      }
    }, 250);
  };

  const handleStartTourStep = (stepIndex) => {
    if (stepIndex < 0 || stepIndex >= KURO_TOOLS_CATALOG.length) return;

    const tool = KURO_TOOLS_CATALOG[stepIndex];
    highlightToolElement(tool.id);

    const userName = getDeviceUserName() || 'Kawan';
    const intro = stepIndex === 0 
      ? `Halo ${userName}! Mari kita mulai Tur Interaktif AllToolsKuro. Berikut fitur ke-[1/17]:`
      : `Berikut fitur ke-[${stepIndex + 1}/17]:`;

    const fullTourMsg = `${intro}\n\n📌 **${tool.name}** [${tool.tag}]\n${tool.desc}\n\n💡 **Cara Pakai:** ${tool.howToUse}`;

    setAnimState('wave');
    streamText(fullTourMsg, () => {
      setMessages(prev => [
        ...prev,
        {
          sender: 'ai',
          text: fullTourMsg,
          animation: 'wave',
          isTourStep: true,
          stepIndex,
          tool
        }
      ]);
    });
  };

  const handleFinishTour = () => {
    const userName = getDeviceUserName() || 'Kawan';
    const endMsg = `Tur seluruh 17 fitur selesai! Sekarang kamu sudah mengenal seluruh utilitas di AllToolsKuro. Selamat mencoba, ${userName}! Jika butuh bantuan kapan saja, Kuro siap membantumu. ✨`;
    setAnimState('wave');
    streamText(endMsg, () => {
      setMessages(prev => [
        ...prev,
        { sender: 'ai', text: endMsg, animation: 'idle' }
      ]);
    });
  };

  // Hapus riwayat chat di perangkat & reset total status ngambek
  const handleClearHistory = () => {
    if (typingTimerRef.current) {
      clearInterval(typingTimerRef.current);
      typingTimerRef.current = null;
    }

    try {
      localStorage.removeItem(DEVICE_CHAT_STORAGE_KEY);
    } catch (_) {}

    resetDeviceAngerState();
    setAngerState({ strikes: 0, angryUntil: 0, isAngry: false, remainingMs: 0 });
    setRemainingCountdown('');

    setMessages([]);
    setDisplayedReply('');
    setIsTyping(false);
    setAnimState('wave');

    const userName = getDeviceUserName() || 'Kawan';
    const welcomeReset = `Halo ${userName}! Aku KuroBot, asisten AI resmi AllToolsKuro. Riwayat obrolan dan status ngambek telah dibersihkan. Ada yang ingin ditanyakan seputar fitur hari ini?`;
    setTimeout(() => {
      streamText(welcomeReset, () => {
        setMessages([{ sender: 'ai', text: welcomeReset, animation: 'idle' }]);
      });
    }, 300);
  };

  // Membujuk KuroBot agar memaafkan user dan membatalkan status ngambek secara manis
  const handleApologize = () => {
    resetDeviceAngerState();
    setAngerState({ strikes: 0, angryUntil: 0, isAngry: false, remainingMs: 0 });
    setRemainingCountdown('');
    setInputText('');
    setDisplayedReply('');
    setAnimState('wave');

    const userName = getDeviceUserName() || 'Kawan';
    const apologyReply = `Umm... Karena kamu berniat baik dan minta maaf dengan tulus, Kuro maafkan ya, ${userName}! Tapi jangan diulangi lagi, oke? Janji! ✨ Sekarang ada yang bisa Kuro bantu seputar utilitas Kuro Studio?`;
    
    streamText(apologyReply, () => {
      setMessages(prev => [
        ...prev,
        { sender: 'user', text: 'Maaf ya Kuro, aku minta maaf 🙏' },
        { sender: 'ai', text: apologyReply, animation: 'idle' }
      ]);
    }, 'idle');
  };

  // Rotasi cepat posisi widget menempel ke 4 sudut layar (kiri-atas, kanan-atas, kanan-bawah, kiri-bawah)
  const cycleQuadrantPosition = () => {
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const isMobile = screenW < 768;

    const w = isOpen ? (isMobile ? Math.floor(screenW * 0.92) : 385) : (isMobile ? 48 : 175);
    const h = isOpen ? Math.min(Math.floor(screenH * 0.82), isMobile ? 520 : 560) : (isMobile ? 48 : 56);
    const bottomClearance = isMobile ? 96 : 16;

    const corners = [
      { x: screenW - w - 12, y: screenH - h - bottomClearance, dockSide: 'right' }, // Kanan-Bawah
      { x: 12, y: screenH - h - bottomClearance, dockSide: 'left' },               // Kiri-Bawah
      { x: 12, y: 16, dockSide: 'left' },                                         // Kiri-Atas
      { x: screenW - w - 12, y: 16, dockSide: 'right' }                            // Kanan-Atas
    ];

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
      localStorage.setItem(getPosStorageKey(screenW), JSON.stringify(clamped));
    } catch (_) {}
  };

  // Kirim pesan obrolan (dengan proteksi kata kasar & ngambek 30 menit)
  const handleSendMessage = async (customMessage = null) => {
    const textToSend = (customMessage || inputText).trim();
    if (!textToSend || isTyping) return;

    const userName = getDeviceUserName() || 'Kawan';

    // 1. Cek status ngambek & deteksi upaya minta maaf
    const currentAnger = getDeviceAngerState();
    if (currentAnger.isAngry) {
      const isApology = /maaf|sorry|ampun|maafin|janji|peace|bujuk|jangan ngambek/i.test(textToSend);
      if (isApology) {
        handleApologize();
        return;
      }

      const totalSeconds = Math.max(0, Math.floor(currentAnger.remainingMs / 1000));
      const mins = Math.floor(totalSeconds / 60);
      const secs = totalSeconds % 60;
      const angryRefusal = `Hmph! Kuro masih ngambek sama kamu, ${userName}! Minta maaf dulu dong secara tulus atau bujuk Kuro pakai permen! 💢 (Sisa waktu ngambek: ${mins}m ${secs}s)`;

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

    // 2. Deteksi kata kasar menyeluruh (KBBI, Daerah, & Internasional + Anti-Bypass)
    if (isToxicText(textToSend)) {
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
      lower.includes('fitur apa saja') ||
      lower.includes('mulai tur')
    ) {
      setInputText('');
      setMessages(prev => [...prev, { sender: 'user', text: 'Jelaskan Semua Fitur' }]);
      handleStartTourStep(0);
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
        handleStartTourStep(0);
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

  // ─── GESTUR DRAGGING DENGAN UNIVERSAL POINTER EVENTS & STRICT LEFT/RIGHT MAGNETIC SNAPPING ───
  const handleLauncherPointerDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    const pointerId = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(pointerId);
    } catch (_) {}

    dragStateRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: pos.x,
      originY: pos.y,
      isDragging: false,
      pointerId,
      lastDx: 0,
      lastDy: 0,
      startTime: Date.now()
    };
  };

  const handleLauncherPointerMove = (e) => {
    if (dragStateRef.current.pointerId === null || dragStateRef.current.pointerId === undefined) return;
    const dx = e.clientX - dragStateRef.current.startX;
    const dy = e.clientY - dragStateRef.current.startY;
    dragStateRef.current.lastDx = dx;
    dragStateRef.current.lastDy = dy;
    const dist = Math.hypot(dx, dy);

    if (!dragStateRef.current.isDragging && dist >= 6) {
      dragStateRef.current.isDragging = true;
      setIsDragging(true);
    }

    if (dragStateRef.current.isDragging) {
      const screenW = window.innerWidth;
      const screenH = window.innerHeight;
      const isMobile = screenW < 640;
      const el = widgetRef.current;
      const rect = el ? el.getBoundingClientRect() : null;
      const widgetW = rect?.width || (isMobile ? 48 : 175);
      const widgetH = rect?.height || (isMobile ? 48 : 56);
      const bottomClearance = isMobile ? 88 : 16;
      const topClearance = 16;

      const proposedX = dragStateRef.current.originX + dx;
      const proposedY = dragStateRef.current.originY + dy;

      const clampedX = Math.max(0, Math.min(proposedX, screenW - widgetW));
      const clampedY = Math.max(topClearance, Math.min(proposedY, screenH - widgetH - bottomClearance));

      setDragOffset({ x: clampedX - dragStateRef.current.originX, y: clampedY - dragStateRef.current.originY });
    }
  };

  const handleLauncherPointerUp = (e) => {
    if (dragStateRef.current.pointerId === null || dragStateRef.current.pointerId === undefined) return;
    const pointerId = dragStateRef.current.pointerId;
    try {
      e.currentTarget.releasePointerCapture(pointerId);
    } catch (_) {}
    dragStateRef.current.pointerId = null;

    const wasDragging = dragStateRef.current.isDragging;
    setIsDragging(false);
    setDragOffset({ x: 0, y: 0 });

    // Jika pergerakan pointer kurang dari 6px, aksi dihitung sebagai klik biasa
    if (!wasDragging) {
      handleOpenWidget();
      return;
    }

    // Drag selesai: magnetik snap tegas ke sisi kiri atau kanan layar
    const rawNewX = dragStateRef.current.originX + (dragStateRef.current.lastDx || 0);
    const rawNewY = dragStateRef.current.originY + (dragStateRef.current.lastDy || 0);

    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const isMobile = screenW < 768;
    const el = widgetRef.current;
    const rect = el ? el.getBoundingClientRect() : null;
    const widgetW = rect?.width || (isMobile ? 48 : 175);
    const widgetH = rect?.height || (isMobile ? 48 : 56);
    const bottomClearance = isMobile ? 96 : 16;
    const topClearance = 16;

    const centerX = rawNewX + widgetW / 2;
    const newDockSide = centerX < screenW / 2 ? 'left' : 'right';
    const snappedX = newDockSide === 'left' ? 12 : Math.max(12, screenW - widgetW - 12);
    const clampedY = Math.max(topClearance, Math.min(rawNewY, screenH - widgetH - bottomClearance));

    const nextPos = { x: Math.round(snappedX), y: Math.round(clampedY), dockSide: newDockSide };
    setPos(nextPos);
    try {
      localStorage.setItem(getPosStorageKey(screenW), JSON.stringify(nextPos));
    } catch (_) {}
  };

  // Drag handle untuk memindahkan header popup obrolan saat terbuka
  const handleHeaderPointerDown = (e) => {
    if (e.target.closest('button')) return;
    if (e.button !== undefined && e.button !== 0) return;
    const pointerId = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(pointerId);
    } catch (_) {}
    dragStateRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: pos.x,
      originY: pos.y,
      isDragging: false,
      pointerId,
      lastDx: 0,
      lastDy: 0,
      startTime: Date.now()
    };
  };

  const handleHeaderPointerMove = (e) => {
    if (dragStateRef.current.pointerId === null || dragStateRef.current.pointerId === undefined) return;
    const dx = e.clientX - dragStateRef.current.startX;
    const dy = e.clientY - dragStateRef.current.startY;
    dragStateRef.current.lastDx = dx;
    dragStateRef.current.lastDy = dy;
    const dist = Math.hypot(dx, dy);

    if (!dragStateRef.current.isDragging && dist >= 6) {
      dragStateRef.current.isDragging = true;
      setIsDragging(true);
    }

    if (dragStateRef.current.isDragging) {
      const screenW = window.innerWidth;
      const screenH = window.innerHeight;
      const el = widgetRef.current;
      const rect = el ? el.getBoundingClientRect() : null;
      const widgetW = rect?.width || 385;
      const widgetH = rect?.height || 560;
      const bottomClearance = 16;
      const topClearance = 16;

      const proposedX = dragStateRef.current.originX + dx;
      const proposedY = dragStateRef.current.originY + dy;

      const clampedX = Math.max(12, Math.min(proposedX, screenW - widgetW - 12));
      const clampedY = Math.max(topClearance, Math.min(proposedY, screenH - widgetH - bottomClearance));

      setDragOffset({ x: clampedX - dragStateRef.current.originX, y: clampedY - dragStateRef.current.originY });
    }
  };

  const handleHeaderPointerUp = (e) => {
    if (dragStateRef.current.pointerId === null || dragStateRef.current.pointerId === undefined) return;
    const pointerId = dragStateRef.current.pointerId;
    try {
      e.currentTarget.releasePointerCapture(pointerId);
    } catch (_) {}
    dragStateRef.current.pointerId = null;

    const wasDragging = dragStateRef.current.isDragging;
    setIsDragging(false);
    setDragOffset({ x: 0, y: 0 });

    if (wasDragging) {
      const rawNewX = dragStateRef.current.originX + (dragStateRef.current.lastDx || 0);
      const rawNewY = dragStateRef.current.originY + (dragStateRef.current.lastDy || 0);

      const screenW = window.innerWidth;
      const screenH = window.innerHeight;
      const el = widgetRef.current;
      const rect = el ? el.getBoundingClientRect() : null;
      const widgetW = rect?.width || 385;
      const widgetH = rect?.height || 560;
      const bottomClearance = 16;
      const topClearance = 16;

      const clampedX = Math.max(12, Math.min(rawNewX, screenW - widgetW - 12));
      const clampedY = Math.max(topClearance, Math.min(rawNewY, screenH - widgetH - bottomClearance));
      const dockSide = clampedX + widgetW / 2 < screenW / 2 ? 'left' : 'right';

      const nextPos = { x: Math.round(clampedX), y: Math.round(clampedY), dockSide };
      setPos(nextPos);
      try {
        localStorage.setItem(getPosStorageKey(screenW), JSON.stringify(nextPos));
      } catch (_) {}
    }
  };

  // Posisi render visual saat ini (posisi dasar + offset pergeseran selama drag)
  const currentRenderX = pos.x + dragOffset.x;
  const currentRenderY = pos.y + dragOffset.y;
  const isDockedLeft = pos.dockSide === 'left';

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

      {/* ─── 2. TOMBOL LAUNCHER MENGAMBANG (COLLAPSED) — STRICT LEFT/RIGHT EDGE DOCKED ─── */}
      {!isOpen && (
        <div 
          ref={widgetRef}
          onPointerDown={handleLauncherPointerDown}
          onPointerMove={handleLauncherPointerMove}
          onPointerUp={handleLauncherPointerUp}
          onPointerCancel={handleLauncherPointerUp}
          style={{
            position: 'fixed',
            left: `${currentRenderX}px`,
            top: `${currentRenderY}px`,
            zIndex: 50,
            touchAction: 'none',
            userSelect: 'none',
            transition: isDragging 
              ? 'none' 
              : 'left 0.28s cubic-bezier(0.22, 1, 0.36, 1), top 0.28s cubic-bezier(0.22, 1, 0.36, 1)'
          }}
          className={`flex items-center gap-2 select-none ${
            isDragging ? 'cursor-grabbing' : 'cursor-grab'
          }`}
        >
          {/* Posisi Kiri: Maskot di kiri, Label di kanan */}
          {isDockedLeft ? (
            <>
              <div
                className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-white border-2 border-black ${
                  isDragging 
                    ? 'shadow-[4px_4px_0px_#000000] scale-105' 
                    : 'shadow-[3px_3px_0px_#000000] hover:shadow-[4px_4px_0px_#000000] hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5'
                } transition-all flex items-center justify-center relative overflow-hidden p-1 cursor-pointer shrink-0`}
                title="Klik untuk buka chat, atau tahan & geser untuk atur posisi"
                aria-label="Buka Asisten KuroBot"
              >
                <KuroCharacter state="wave" size={typeof window !== 'undefined' && window.innerWidth < 640 ? 38 : 46} />
                <span 
                  className={`absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full border border-black ${
                    angerState.isAngry ? 'bg-rose-500 animate-ping' : 'bg-blue-600 animate-pulse'
                  }`} 
                />
                <div className="absolute bottom-1 inset-x-0 flex justify-center items-center pointer-events-none opacity-40">
                  <div className="w-3.5 h-0.5 rounded-full bg-black" />
                </div>
              </div>

              <div className="hidden sm:flex items-center gap-1.5 bg-white text-black border-2 border-black px-3 py-1.5 rounded-xl shadow-[3px_3px_0px_#000000] text-xs font-bold font-mono pointer-events-none select-none">
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                <span>Tanya KuroBot</span>
              </div>
            </>
          ) : (
            /* Posisi Kanan: Label di kiri, Maskot di kanan */
            <>
              <div className="hidden sm:flex items-center gap-1.5 bg-white text-black border-2 border-black px-3 py-1.5 rounded-xl shadow-[3px_3px_0px_#000000] text-xs font-bold font-mono pointer-events-none select-none">
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                <span>Tanya KuroBot</span>
              </div>

              <div
                className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-white border-2 border-black ${
                  isDragging 
                    ? 'shadow-[4px_4px_0px_#000000] scale-105' 
                    : 'shadow-[3px_3px_0px_#000000] hover:shadow-[4px_4px_0px_#000000] hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5'
                } transition-all flex items-center justify-center relative overflow-hidden p-1 cursor-pointer shrink-0`}
                title="Klik untuk buka chat, atau tahan & geser untuk atur posisi"
                aria-label="Buka Asisten KuroBot"
              >
                <KuroCharacter state="wave" size={typeof window !== 'undefined' && window.innerWidth < 640 ? 38 : 46} />
                <span 
                  className={`absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full border border-black ${
                    angerState.isAngry ? 'bg-rose-500 animate-ping' : 'bg-blue-600 animate-pulse'
                  }`} 
                />
                <div className="absolute bottom-1 inset-x-0 flex justify-center items-center pointer-events-none opacity-40">
                  <div className="w-3.5 h-0.5 rounded-full bg-black" />
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ─── 3. POPUP JENDELA CHAT (EXPANDED) — STRICT VIEWPORT CLAMPED ─── */}
      {isOpen && (
        <div 
          ref={widgetRef}
          style={
            typeof window !== 'undefined' && window.innerWidth < 640
              ? undefined
              : {
                  position: 'fixed',
                  left: `${currentRenderX}px`,
                  top: `${currentRenderY}px`,
                  zIndex: 50,
                  transition: isDragging 
                    ? 'none' 
                    : 'left 0.28s cubic-bezier(0.22, 1, 0.36, 1), top 0.28s cubic-bezier(0.22, 1, 0.36, 1)'
                }
          }
          className={
            typeof window !== 'undefined' && window.innerWidth < 640
              ? "fixed left-3 right-3 mx-auto bottom-20 z-50 w-[calc(100vw-24px)] max-w-[380px] max-h-[70vh] rounded-2xl border-2 border-black bg-white text-black shadow-[6px_6px_0px_#000000] flex flex-col overflow-hidden animate-in fade-in duration-150"
              : `sm:w-[385px] max-h-[82vh] sm:max-h-[560px] rounded-2xl border-2 border-black bg-white text-black shadow-[6px_6px_0px_#000000] flex flex-col overflow-hidden animate-in fade-in duration-150 ${
                  isDragging ? 'select-none' : ''
                }`
          }
        >
          {/* Header Popup: Drag Handle, Karakter, Nama, & Kontrol Minimalkan */}
          <div 
            onPointerDown={handleHeaderPointerDown}
            onPointerMove={handleHeaderPointerMove}
            onPointerUp={handleHeaderPointerUp}
            onPointerCancel={handleHeaderPointerUp}
            style={{ touchAction: 'none' }}
            className={`p-3 bg-neutral-50 text-black border-b-2 border-black flex items-center justify-between select-none ${
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
            <div className="p-2.5 bg-rose-100 border-b-2 border-black text-rose-800 text-xs font-mono font-bold flex items-center justify-between px-3 gap-2 flex-wrap">
              <span className="flex items-center gap-1.5">
                <Flame className="w-4 h-4 text-rose-600 animate-pulse stroke-[2.5]" />
                <span>KuroBot Sedang Ngambek!</span>
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleApologize}
                  className="px-2.5 py-0.5 rounded border-2 border-black bg-amber-300 hover:bg-amber-400 text-neutral-900 font-sans font-bold text-[11px] shadow-[1.5px_1.5px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer flex items-center gap-1"
                  title="Minta maaf dan bujuk Kuro agar tidak ngambek"
                >
                  <span>Bujuk Kuro 🍬</span>
                </button>
                <span className="bg-rose-600 text-white px-2 py-0.5 rounded border border-black font-black text-[11px]">
                  {remainingCountdown || '30:00'}
                </span>
              </div>
            </div>
          )}

          {/* Area Riwayat Pesan Obrolan Neobrutalist Terang */}
          <div className="flex-1 p-3.5 overflow-y-auto min-h-[160px] flex flex-col gap-3 bg-neutral-50/70 text-xs custom-scrollbar">
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
                  {m.isTourStep && m.tool ? (
                    <div className="space-y-2.5">
                      <p className="whitespace-pre-line font-medium text-neutral-800">{cleanSpeechText(m.text)}</p>
                      
                      {/* Navigasi Tur Interaktif Satu per Satu */}
                      <div className="pt-2 border-t border-neutral-200 flex flex-wrap gap-2 items-center justify-between">
                        <div className="flex flex-wrap items-center gap-2">
                          {/* Tombol Lanjut Fitur Berikutnya */}
                          {m.stepIndex < KURO_TOOLS_CATALOG.length - 1 ? (
                            <button
                              type="button"
                              onClick={() => handleStartTourStep(m.stepIndex + 1)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 active:translate-x-0.5 active:translate-y-0.5 text-white font-black text-[11px] border border-black shadow-[1.5px_1.5px_0px_#000000] cursor-pointer transition-all"
                            >
                              <span>Lanjut Fitur Berikutnya</span>
                              <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={handleFinishTour}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:translate-x-0.5 active:translate-y-0.5 text-white font-black text-[11px] border border-black shadow-[1.5px_1.5px_0px_#000000] cursor-pointer transition-all"
                            >
                              <span>Selesai Tur</span>
                              <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.5]" />
                            </button>
                          )}

                          {/* Tombol Buka Fitur Ini Langsung */}
                          <button
                            type="button"
                            onClick={() => handleOpenTool(m.tool.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 active:translate-x-0.5 active:translate-y-0.5 text-neutral-900 font-bold text-[11px] border border-black shadow-[1px_1px_0px_#000000] cursor-pointer transition-all"
                            title="Buka halaman fitur ini sekarang"
                          >
                            <span>Buka Fitur Ini</span>
                            <ArrowUpRight className="w-3.5 h-3.5 stroke-[2.5]" />
                          </button>
                        </div>

                        {/* Tombol Akhiri Tur Kapan Saja */}
                        {m.stepIndex < KURO_TOOLS_CATALOG.length - 1 && (
                          <button
                            type="button"
                            onClick={handleFinishTour}
                            className="text-[10px] text-neutral-500 hover:text-neutral-900 font-bold underline cursor-pointer px-1 py-1"
                          >
                            Selesai Tur
                          </button>
                        )}
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
                          <ArrowUpRight className="w-3.5 h-3.5 stroke-[2.5]" />
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
              onClick={() => {
                setMessages(prev => [...prev, { sender: 'user', text: 'Jelaskan Semua Fitur' }]);
                handleStartTourStep(0);
              }}
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
              placeholder={angerState.isAngry ? `Kuro sedang ngambek... (${remainingCountdown}) • Ketik maaf untuk membujuk` : 'Tanya seputar fitur AllToolsKuro...'}
              disabled={isTyping}
              maxLength={200}
              className="flex-1 px-3 py-2 rounded-xl border-2 border-black bg-neutral-50 text-neutral-900 placeholder:text-neutral-400 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-black disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isTyping || !inputText.trim()}
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
