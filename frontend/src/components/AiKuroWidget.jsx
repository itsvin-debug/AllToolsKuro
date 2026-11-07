import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  X, 
  Send, 
  Sparkles, 
  Compass, 
  ChevronRight, 
  StopCircle, 
  ArrowUpRight, 
  RotateCcw,
  ArrowLeftRight,
  AlertTriangle,
  Flame,
  Clock
} from 'lucide-react';
import KuroCharacter from './KuroCharacter';
import { 
  getDeviceUserName, 
  getDeviceAngerState, 
  recordDeviceStrike, 
  resetDeviceAngerState 
} from '../services/storageService';

// Fungsi utilitas pembersih teks agar ucapan Kuro tampil natural tanpa simbol markdown mentah (** atau #)
function cleanSpeechText(text) {
  if (!text) return '';
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1') // Buang format tebal bintang ganda
    .replace(/\*(.*?)\*/g, '$1')     // Buang format miring
    .replace(/__(.*?)__/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .replace(/#{1,6}\s+/g, '')        // Buang tag heading
    .replace(/`([^`]+)`/g, '$1')      // Buang backtick inline code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Ambil teks label link saja
    .trim();
}

// Data resmi 13 utilitas Kuro Studio untuk sekuens Guided Tour Otomatis
const KURO_TOOLS_CATALOG = [
  {
    id: 'downloader',
    name: 'Media Downloader',
    tag: 'All-in-One HD',
    desc: 'Pengunduh serbaguna untuk mengunduh video, foto slide album, dan audio MP3 tanpa watermark dari TikTok, Instagram, YouTube, dan medsos lainnya dengan kualitas jernih hingga 4K serta opsi 1080p Status WA Anti-Burik agar tidak pecah saat di-upload.'
  },
  {
    id: 'jjFinder',
    name: 'Cari Link JJ',
    tag: 'Jedag-Jedug Viral',
    desc: 'Temukan ribuan sound jedag-jedug viral, preset Alight Motion, dan backsound tren terbaru dengan tautan langsung siap pakai untuk konten kreatifmu.'
  },
  {
    id: 'pngToPdf',
    name: 'PNG to PDF',
    tag: 'Konversi Dokumen',
    desc: 'Satukan banyak file gambar atau foto PNG dan JPG menjadi satu berkas PDF rapi dengan tata letak proporsional dan kualitas visual tajam.'
  },
  {
    id: 'linkToDoc',
    name: 'Link to PDF/PPT',
    tag: 'Ekstraktor Materi',
    desc: 'Ekstrak dokumen kuliah dan materi presentasi dari Scribd atau SlideShare menjadi berkas PDF atau PPT utuh langsung dari tautan web.'
  },
  {
    id: 'imageToLink',
    name: 'File ke Link',
    tag: 'Hosting Instan',
    desc: 'Unggah foto dari perangkatmu dan dapatkan tautan URL publik instan berkecepatan tinggi untuk dibagikan ke mana saja.'
  },
  {
    id: 'compressor',
    name: 'Kompres Media HD',
    tag: 'Hemat Memori',
    desc: 'Kecilkan ukuran file video dan gambar secara drastis tanpa membuat visual pecah atau burik, sangat hemat kuota dan memori.'
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
    desc: 'Gabungkan beberapa trek audio atau musik menjadi satu kesatuan alunan utuh dengan perpindahan lagu yang mulus dan jernih.'
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
    desc: 'Editor video praktis untuk mengatur kecepatan pemutaran, mengubah rasio layar 9:16 untuk story dan 16:9 untuk layar lebar, serta filter visual.'
  },
  {
    id: 'videoTrimmer',
    name: 'Video Trimmer',
    tag: 'Pemotong Presisi',
    desc: 'Pangkas detik awal atau akhir klip videomu secara akurat tanpa menurunkan bitrate asli atau merusak kualitas audionya.'
  },
  {
    id: 'bgRemover',
    name: 'Hapus Background',
    tag: 'AI Background Remover',
    desc: 'Hapus latar belakang foto dalam satu kali klik menggunakan kecerdasan AI untuk menghasilkan file PNG transparan yang rapi dan presisi.'
  },
  {
    id: 'resolver',
    name: 'Safelink & Link Resolver',
    tag: 'Bypass Link & Iklan',
    desc: 'Lewati tautan safelink bertingkat (seperti Sfl.gl, SafelinkU, Ouo, Bitly, dll), lewati hitungan detik dan halaman iklan membingungkan untuk langsung mengambil link unduhan asli (Mediafire, Google Drive, Mega, dll) secara instan dan aman.'
  }
];

export default function AiKuroWidget({ currentScreen, onNavigateScreen, onOpenTool }) {
  // Mode tampilan: 'collapsed' | 'chat_popup' | 'floating_helper'
  const [mode, setMode] = useState('collapsed');
  
  // State animasi karakter: 'idle' | 'wave' | 'talking' | 'confused' | 'thinking'
  const [animState, setAnimState] = useState('idle');

  // Posisi docking pop-up: 'right' | 'left'
  const [dockPosition, setDockPosition] = useState(() => {
    if (typeof window === 'undefined') return 'right';
    return localStorage.getItem('kuro_chat_dock_side') || 'right';
  });

  // Modal alert syarat isi nama panggilan
  const [showNameAlert, setShowNameAlert] = useState(false);

  // State sistem ngambek per perangkat (3-Strike System & 30 Menit Cooldown)
  const [angerState, setAngerState] = useState(() => getDeviceAngerState());
  const [remainingCountdown, setRemainingCountdown] = useState('');

  // Kunci penyimpanan riwayat lokal terisolasi khusus perangkat ini saja
  const DEVICE_CHAT_STORAGE_KEY = 'kuro_device_ai_chat_history';

  // Obrolan terisolasi per perangkat
  const [messages, setMessages] = useState(() => {
    try {
      const saved = localStorage.getItem(DEVICE_CHAT_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return [];
  });

  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [displayedReply, setDisplayedReply] = useState('');

  // Tour State
  const [isTourActive, setIsTourActive] = useState(false);
  const [tourIndex, setTourIndex] = useState(0);
  const [highlightedToolId, setHighlightedToolId] = useState(null);

  const messagesEndRef = useRef(null);
  const typingTimerRef = useRef(null);
  const tourSequenceRef = useRef(null);
  const hasGreetedRef = useRef(false);

  // Monitor status ngambek dan live countdown 30 menit
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

  // Simpan riwayat secara lokal di perangkat ini saja setiap kali ada obrolan baru
  useEffect(() => {
    try {
      if (messages.length > 0) {
        localStorage.setItem(DEVICE_CHAT_STORAGE_KEY, JSON.stringify(messages.slice(-25)));
      } else {
        localStorage.removeItem(DEVICE_CHAT_STORAGE_KEY);
      }
    } catch (e) {}
  }, [messages]);

  // Auto-scroll riwayat obrolan ke bawah
  useEffect(() => {
    if (mode === 'chat_popup') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, displayedReply, mode]);

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
    const speed = 18;

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

  // Sapaan otomatis saat pengguna pertama kali membuka web (Hanya jika nama sudah terisi)
  useEffect(() => {
    if (hasGreetedRef.current) return;
    hasGreetedRef.current = true;

    // Jika pengguna belum mengisi nama, jangan munculkan popup otomatis
    const userName = getDeviceUserName();
    if (!userName || !userName.trim()) return;

    try {
      const saved = localStorage.getItem(DEVICE_CHAT_STORAGE_KEY);
      if (saved && JSON.parse(saved).length > 0) return;
    } catch (e) {}

    const greetTimer = setTimeout(() => {
      setMode('chat_popup');
      setAnimState('wave');

      const greetingText = `Halo ${userName}! Aku KuroBot, asisten AI dan maskot resmi AllToolsKuro. Ada yang bisa aku bantu seputar fitur dan navigasi hari ini?`;
      
      setTimeout(() => {
        streamText(greetingText, () => {
          setMessages([{ sender: 'ai', text: greetingText, animation: 'idle' }]);
        });
      }, 700);
    }, 900);

    return () => clearTimeout(greetTimer);
  }, [streamText]);

  // Toggle posisi docking (Kiri <-> Kanan)
  const toggleDockPosition = () => {
    const next = dockPosition === 'right' ? 'left' : 'right';
    setDockPosition(next);
    try {
      localStorage.setItem('kuro_chat_dock_side', next);
    } catch (e) {}
  };

  // Buka widget secara manual dengan pemeriksaan nama pengguna
  const handleOpenWidget = () => {
    const userName = getDeviceUserName();

    // 1. Validasi Nama Pengguna & Syarat Akses Chatbot
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

    setMode('chat_popup');
    setAnimState('wave');

    if (messages.length === 0) {
      const greeting = `Halo ${userName}! Aku KuroBot, asisten AI dan maskot resmi AllToolsKuro. Ada yang bisa aku bantu seputar fitur dan navigasi hari ini?`;
      streamText(greeting, () => {
        setMessages([{ sender: 'ai', text: greeting, animation: 'idle' }]);
      });
    } else {
      setTimeout(() => setAnimState('idle'), 1200);
    }
  };

  // Fitur Hapus Riwayat Khusus Perangkat Ini & Reset ke Sapaan Awal
  const handleClearHistory = () => {
    if (typingTimerRef.current) {
      clearInterval(typingTimerRef.current);
      typingTimerRef.current = null;
    }
    if (tourSequenceRef.current) {
      clearTimeout(tourSequenceRef.current);
      tourSequenceRef.current = null;
    }

    try {
      localStorage.removeItem(DEVICE_CHAT_STORAGE_KEY);
    } catch (e) {}

    setMessages([]);
    setDisplayedReply('');
    setIsTyping(false);
    setAnimState('wave');

    const userName = getDeviceUserName() || 'Kawan';
    const welcomeReset = `Halo ${userName}! Aku KuroBot, asisten AI dan maskot resmi AllToolsKuro. Ada yang bisa aku bantu seputar fitur dan navigasi hari ini?`;
    setTimeout(() => {
      streamText(welcomeReset, () => {
        setMessages([{ sender: 'ai', text: welcomeReset, animation: 'idle' }]);
      });
    }, 450);
  };

  // Batalkan seluruh timer tour
  const handleCancelTour = () => {
    if (typingTimerRef.current) {
      clearInterval(typingTimerRef.current);
      typingTimerRef.current = null;
    }
    if (tourSequenceRef.current) {
      clearTimeout(tourSequenceRef.current);
      tourSequenceRef.current = null;
    }
    document.querySelectorAll('.ring-blue-500').forEach(el => {
      el.classList.remove('ring-4', 'ring-blue-500', 'ring-offset-2', 'ring-offset-white', 'transition-all', 'duration-300');
    });

    setIsTourActive(false);
    setHighlightedToolId(null);
    setMode('chat_popup');
    setAnimState('idle');
  };

  const handleCloseWidget = () => {
    handleCancelTour();
    setMode('collapsed');
    setAnimState('idle');
  };

  // Scroll otomatis ke kartu fitur target
  const scrollToToolElement = (toolId) => {
    document.querySelectorAll('.ring-blue-500').forEach(el => {
      el.classList.remove('ring-4', 'ring-blue-500', 'ring-offset-2', 'ring-offset-white', 'transition-all', 'duration-300');
    });

    const targetElement = document.getElementById(`tool-${toolId}`);
    if (targetElement) {
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      targetElement.classList.add('ring-4', 'ring-blue-500', 'ring-offset-2', 'ring-offset-white', 'transition-all', 'duration-300');
      setHighlightedToolId(toolId);
    }
  };

  // Eksekusi sekuens langkah tour satu per satu
  const executeTourStep = useCallback((index) => {
    if (index >= KURO_TOOLS_CATALOG.length) {
      document.querySelectorAll('.ring-blue-500').forEach(el => {
        el.classList.remove('ring-4', 'ring-blue-500', 'ring-offset-2', 'ring-offset-white', 'transition-all', 'duration-300');
      });

      setHighlightedToolId(null);
      setIsTourActive(false);

      const userName = getDeviceUserName() || 'Kawan';
      const finishMsg = `Selesai! Itu dia 13 fitur hebat di AllToolsKuro, ${userName}! Silakan coba salah satu alat yang kamu butuhkan sekarang!`;
      streamText(finishMsg, () => {
        setMessages(prev => [...prev, { sender: 'ai', text: finishMsg, animation: 'wave' }]);
      }, 'wave');
      return;
    }

    if (currentScreen !== 'welcome' && onNavigateScreen) {
      onNavigateScreen('welcome');
    }

    const currentTool = KURO_TOOLS_CATALOG[index];
    setTourIndex(index);
    scrollToToolElement(currentTool.id);

    const stepSpeech = `[${index + 1}/13] ${currentTool.name} (${currentTool.tag}): ${currentTool.desc}`;
    streamText(stepSpeech, () => {
      setMessages(prev => [...prev, { 
        sender: 'ai', 
        text: stepSpeech, 
        animation: 'talking', 
        toolId: currentTool.id,
        tourStep: index + 1 
      }]);

      tourSequenceRef.current = setTimeout(() => {
        executeTourStep(index + 1);
      }, 5500);
    });
  }, [streamText, currentScreen, onNavigateScreen]);

  // Mulai tour seluruh fitur
  const handleStartTour = () => {
    setMode('floating_helper');
    setIsTourActive(true);
    setTourIndex(0);
    executeTourStep(0);
  };

  // Navigasi ke fitur tunggal
  const handleGuideSpecificTool = (toolId, customText) => {
    setMode('floating_helper');
    setIsTourActive(false);
    scrollToToolElement(toolId);

    const tool = KURO_TOOLS_CATALOG.find(t => t.id === toolId);
    const explanation = cleanSpeechText(customText) || (tool 
      ? `Ini dia fitur ${tool.name}! ${tool.desc} Klik tombol Buka Fitur untuk langsung menggunakannya.`
      : 'Fitur siap digunakan!');

    streamText(explanation, () => {
      setMessages(prev => [...prev, { sender: 'ai', text: explanation, animation: 'talking', toolId }]);
    });
  };

  // Kirim pesan obrolan ke Backend (dengan sistem peringatan kata kasar & ngambek 30 menit)
  const handleSendMessage = async (customMessage = null) => {
    const textToSend = (customMessage || inputText).trim();
    if (!textToSend || isTyping) return;

    const userName = getDeviceUserName() || 'Kawan';

    // 1. CEK STATUS NGAMBEK 30 MENIT PER PERANGKAT
    const currentAnger = getDeviceAngerState();
    if (currentAnger.isAngry) {
      const totalSeconds = Math.max(0, Math.floor(currentAnger.remainingMs / 1000));
      const mins = Math.floor(totalSeconds / 60);
      const secs = totalSeconds % 60;
      const angryRefusal = `? Hmph! Aku masih ngambek sama kamu, ${userName}! Jangan ajak aku bicara dulu! (Sisa waktu ngambek: ${mins} menit ${secs} detik).`;

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

    // 2. DETEKSI KATA KASAR / SLURS / MAKIAN UNTUK SISTEM 3 PERINGATAN (STRIKES)
    const isProfane = /\b(nigga|nigger|negro|niggas|niggers|chink|spic|kike|faggot|retard|anjing|asw|asu|babi|kontol|memek|jembut|peler|pepek|itil|pantek|ngentot|ngentd|bangsat|bajingan|goblok|tolol|bego|idiot|bodoh|tai|taik|bokep|porno|sange|lonte|perek|jablay|bencong|banci|fuck|shit|bitch|asshole|bastard|dick|pussy|cunt)\b/i.test(textToSend);

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
        warningMsg = `? Eh... tolong jangan berkata kasar atau tidak sopan ya, ${userName}! Aku beri peringatan ke-1 nih!`;
        targetAnim = 'confused';
      } else if (strikeResult.strikes === 2) {
        warningMsg = `? Heh! Masih berani berkata seperti itu?! Ini peringatan ke-2 ya, ${userName}! Kalau sekali lagi kamu kasar, aku bakal ngambek dan nggak mau bicara sama kamu selama 30 menit!`;
        targetAnim = 'angry';
      } else {
        warningMsg = `? Hmph! Kamu keterlaluan banget, ${userName}! Aku ngambek total dan nggak mau ngobrol sama kamu selama 30 menit! Hmph!`;
        targetAnim = 'angry';
      }

      setAnimState(targetAnim);
      streamText(warningMsg, () => {
        setMessages(prev => [...prev, { sender: 'ai', text: warningMsg, animation: targetAnim }]);
      }, targetAnim);
      return;
    }

    // 3. JIKA BUKAN KATA KASAR, PROSES CHAT KE BACKEND
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

      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}`);
      }

      const data = await res.json();
      const reply = cleanSpeechText(data.reply || `Halo ${userName}! Ada yang bisa KuroBot bantu seputar AllToolsKuro?`);
      const isValidContext = data.is_valid_context !== undefined ? data.is_valid_context : (data.isValidContext !== undefined ? data.isValidContext : true);
      const anim = (!isValidContext || data.animation === 'confused') ? 'confused' : (data.animation || 'talking');
      const action = data.action || 'none';
      const targetTool = data.target_tool || data.targetTool || null;

      setAnimState(anim);

      if (action === 'start_tour') {
        handleStartTour();
      } else if (action === 'navigate_tool' && targetTool) {
        handleGuideSpecificTool(targetTool, reply);
      } else {
        streamText(reply, () => {
          setMessages(prev => [...prev, { sender: 'ai', text: reply, animation: anim }]);
        }, anim);
      }
    } catch (err) {
      console.warn('[KuroBot] Request fallback:', err);
      const lower = textToSend.toLowerCase();

      if (lower.includes('safelink') || lower.includes('bypass') || lower.includes('shortlink') || lower.includes('sfl')) {
        handleGuideSpecificTool('resolver', `Tentu saja, ${userName}! Ini dia fitur Safelink Bypasser. Alat untuk melewati tautan safelink bertingkat seperti Sfl.gl atau SafelinkU agar langsung membuka file aslinya.`);
        return;
      }

      if (lower.includes('capcut') || lower.includes('template') || lower.includes('preset') || lower.includes('alight motion') || lower.includes('xml')) {
        handleGuideSpecificTool('jjFinder', `Tentu, ${userName}! Fitur Cari Link JJ menyediakan ribuan template CapCut, preset Alight Motion, dan file XML Google Drive yang siap digunakan.`);
        return;
      }

      const fallbackMsg = `? Maaf ${userName}, saya tidak mengerti maksud Anda. Saya hanya asisten khusus untuk membantu fitur dan navigasi di AllToolsKuro!`;
      setAnimState('confused');
      streamText(fallbackMsg, () => {
        setMessages(prev => [...prev, { sender: 'ai', text: fallbackMsg, animation: 'confused' }]);
      }, 'confused');
    }
  };

  return (
    <>
      {/* ─── 1. MODAL ALERT PERINGATAN WAJIB ISI NAMA ─── */}
      {showNameAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 animate-in fade-in duration-150">
          <div 
            className="w-full max-w-sm rounded-2xl border-2 border-black shadow-[6px_6px_0px_#000000] p-5 space-y-4 text-white"
            style={{ backgroundColor: '#1a1a2e' }}
            role="alertdialog"
            aria-labelledby="name-alert-title"
          >
            <div className="flex items-center gap-2.5 text-amber-400 font-black text-base border-b-2 border-black pb-2.5">
              <AlertTriangle className="w-5 h-5 stroke-[2.5]" />
              <span id="name-alert-title">Syarat Akses Chatbot</span>
            </div>

            <p className="text-xs text-slate-200 leading-relaxed font-medium">
              Silakan masukkan nama panggilan Anda terlebih dahulu di halaman utama sebelum menggunakan chatbot!
            </p>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowNameAlert(false);
                  window.dispatchEvent(new CustomEvent('kuro_focus_username_input'));
                }}
                className="px-4 py-2 rounded-xl border-2 border-black bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs shadow-[2px_2px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer"
              >
                Isi Nama Sekarang
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 2. TOMBOL WIDGET MELAYANG (COLLAPSED) DENGAN DOCKING KIRI / KANAN ─── */}
      {mode === 'collapsed' && (
        <div 
          className={`fixed bottom-20 sm:bottom-6 z-50 flex items-center gap-2 group transition-all duration-200 ${
            dockPosition === 'left' ? 'left-4 sm:left-6 flex-row-reverse' : 'right-4 sm:right-6'
          }`}
        >
          {/* Label Sapaan saat Hover */}
          <div className="hidden sm:flex items-center gap-1.5 bg-[#1a1a2e] text-white border-2 border-black px-3 py-1.5 rounded-lg shadow-[2px_2px_0px_#000000] text-xs font-bold font-mono pointer-events-none group-hover:opacity-100 opacity-90 transition-opacity">
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            <span>Tanya KuroBot</span>
          </div>

          <button
            type="button"
            onClick={handleOpenWidget}
            className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-[#1a1a2e] border-2 border-black shadow-[3px_3px_0px_#000000] hover:shadow-[5px_5px_0px_#000000] hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all flex items-center justify-center relative cursor-pointer overflow-hidden p-1"
            title="Buka Asisten KuroBot"
            aria-label="Buka Asisten KuroBot"
          >
            {/* Karakter Vektor SVG Elaina */}
            <KuroCharacter state="wave" size={54} />
            {/* Badge Status Aktif / Ngambek */}
            <span 
              className={`absolute top-1.5 right-1.5 w-3 h-3 rounded-full border border-black ${
                angerState.isAngry ? 'bg-rose-500 animate-ping' : 'bg-blue-500 animate-pulse'
              }`} 
            />
          </button>
        </div>
      )}

      {/* ─── 3. POPUP CHAT INTERAKTIF NEOBRUTALIST (ANTI-SLOP THEME) ─── */}
      {mode === 'chat_popup' && (
        <div 
          className={`fixed bottom-20 sm:bottom-6 z-50 w-[92vw] sm:w-[385px] max-h-[85vh] sm:max-h-[580px] rounded-2xl border-2 border-black shadow-[6px_6px_0px_#000000] flex flex-col overflow-hidden text-white animate-in fade-in duration-200 ${
            dockPosition === 'left' ? 'left-3 sm:left-6' : 'right-3 sm:right-6'
          }`}
          style={{ backgroundColor: '#1a1a2e' }}
        >
          
          {/* Header Popup: Karakter, Nama, Toggle Posisi, & Kontrol */}
          <div className="p-3 bg-[#131322] text-white border-b-2 border-black flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-blue-600 border-2 border-black overflow-hidden shrink-0 shadow-[2px_2px_0px_#000000] flex items-center justify-center p-0.5">
                <KuroCharacter state={animState} size={38} />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="font-black text-sm tracking-tight text-white">KuroBot</span>
                  <span className="bg-blue-600 text-white text-[9px] font-mono font-bold px-1.5 py-0.2 rounded border border-black shadow-[1px_1px_0px_#000000]">
                    AI ASISTEN
                  </span>
                </div>
                <span className="text-[10px] text-slate-300 font-mono font-medium flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${angerState.isAngry ? 'bg-rose-400' : 'bg-emerald-400'} animate-pulse`} />
                  {angerState.isAngry ? 'Sedang Ngambek' : 'Siap Membantu'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {/* Tombol Toggle Posisi Docking (Kiri / Kanan) */}
              <button
                type="button"
                onClick={toggleDockPosition}
                className="w-7 h-7 rounded-lg bg-[#282a3c] hover:bg-[#34374e] text-slate-200 hover:text-white border-2 border-black shadow-[1.5px_1.5px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 flex items-center justify-center transition-all cursor-pointer"
                title={dockPosition === 'right' ? 'Pindah ke Kiri Layar' : 'Pindah ke Kanan Layar'}
                aria-label="Pindah Posisi Chatbot"
              >
                <ArrowLeftRight className="w-3.5 h-3.5 stroke-[2.5]" />
              </button>

              {/* Tombol Hapus Riwayat Chat */}
              <button
                type="button"
                onClick={handleClearHistory}
                className="w-7 h-7 rounded-lg bg-[#282a3c] hover:bg-rose-900/60 text-slate-200 hover:text-rose-300 border-2 border-black shadow-[1.5px_1.5px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 flex items-center justify-center transition-all cursor-pointer"
                title="Hapus Riwayat Chat"
                aria-label="Hapus Riwayat Chat"
              >
                <RotateCcw className="w-3.5 h-3.5 stroke-[2.5]" />
              </button>

              {/* Tombol Tour Fitur */}
              <button
                type="button"
                onClick={handleStartTour}
                className="px-2 py-1 bg-amber-400 hover:bg-amber-300 text-black text-xs font-black rounded-lg border-2 border-black shadow-[1.5px_1.5px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 flex items-center gap-1 transition-all cursor-pointer"
                title="Mulai Tour 13 Fitur"
              >
                <Compass className="w-3.5 h-3.5 stroke-[2.5]" />
                <span className="hidden xs:inline">Tour</span>
              </button>

              {/* Tombol Tutup */}
              <button
                type="button"
                onClick={handleCloseWidget}
                className="w-7 h-7 rounded-lg bg-[#282a3c] hover:bg-[#34374e] text-slate-200 hover:text-white border-2 border-black shadow-[1.5px_1.5px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 flex items-center justify-center transition-all cursor-pointer"
                aria-label="Tutup Chat"
              >
                <X className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>
          </div>

          {/* Banner Peringatan & Status Ngambek 30 Menit */}
          {angerState.isAngry && (
            <div className="p-2.5 bg-rose-950/90 border-b-2 border-black text-rose-200 text-xs font-mono font-bold flex items-center justify-between px-3">
              <span className="flex items-center gap-1.5">
                <Flame className="w-4 h-4 text-rose-400 animate-pulse stroke-[2.5]" />
                <span>KuroBot Sedang Ngambek!</span>
              </span>
              <span className="bg-rose-600 text-white px-2 py-0.5 rounded border border-black font-black text-[11px]">
                {remainingCountdown || '30:00'}
              </span>
            </div>
          )}

          {/* Area Riwayat Pesan Obrolan Neobrutalist */}
          <div className="flex-1 p-3.5 overflow-y-auto max-h-[350px] flex flex-col gap-3 bg-[#111220] text-xs custom-scrollbar">
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`flex gap-2 items-start ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {m.sender === 'ai' && (
                  <div className="w-7 h-7 rounded-lg bg-blue-600 border-2 border-black overflow-hidden shrink-0 mt-0.5 flex items-center justify-center p-0.5 shadow-[1.5px_1.5px_0px_#000000]">
                    <KuroCharacter state={m.animation || 'idle'} size={28} />
                  </div>
                )}
                
                {/* Bubble Chat: Biru Elektrik untuk User, Dark Neobrutalist #1f2038 untuk AI */}
                <div
                  className={`p-3 rounded-xl border-2 border-black max-w-[85%] text-xs leading-relaxed font-sans shadow-[2px_2px_0px_#000000] ${
                    m.sender === 'user'
                      ? 'bg-blue-600 text-white font-medium text-right'
                      : 'bg-[#1f2038] text-slate-100 text-left'
                  }`}
                >
                  <p className="whitespace-pre-line">{cleanSpeechText(m.text)}</p>

                  {/* Tombol Pintasan Buka Fitur */}
                  {m.toolId && onOpenTool && (
                    <button
                      type="button"
                      onClick={() => onOpenTool(m.toolId)}
                      className="mt-2.5 inline-flex items-center gap-1 px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-bold text-[11px] border border-black shadow-xs cursor-pointer"
                    >
                      <span>Buka Fitur Ini</span>
                      <ArrowUpRight className="w-3 h-3 stroke-[2.5]" />
                    </button>
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
                <div className="p-3 rounded-xl border-2 border-black bg-[#1f2038] text-slate-100 shadow-[2px_2px_0px_#000000] max-w-[85%] text-xs leading-relaxed font-sans text-left">
                  <p className="whitespace-pre-line">{displayedReply}</p>
                  <span className="inline-block w-1.5 h-3 ml-1 bg-blue-400 animate-pulse" />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Prompt Cepat (Quick Suggestions) */}
          <div className="px-3 py-2 bg-[#131322] border-t-2 border-black flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={handleStartTour}
              className="px-2.5 py-1 rounded-md bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 border border-black text-[11px] font-bold font-mono shrink-0 cursor-pointer shadow-xs"
            >
              Jelaskan Semua Fitur
            </button>
            <button
              type="button"
              onClick={() => handleSendMessage('Jelaskan fitur safelink bypasser')}
              className="px-2.5 py-1 rounded-md bg-[#24263a] hover:bg-[#30334e] text-slate-200 border border-black text-[11px] font-bold font-mono shrink-0 cursor-pointer shadow-xs"
            >
              Safelink Bypasser
            </button>
            <button
              type="button"
              onClick={() => handleSendMessage('Jelaskan fitur cari link jj capcut')}
              className="px-2.5 py-1 rounded-md bg-[#24263a] hover:bg-[#30334e] text-slate-200 border border-black text-[11px] font-bold font-mono shrink-0 cursor-pointer shadow-xs"
            >
              Cari Link JJ
            </button>
            <button
              type="button"
              onClick={() => handleSendMessage('Jelaskan fitur media downloader')}
              className="px-2.5 py-1 rounded-md bg-[#24263a] hover:bg-[#30334e] text-slate-200 border border-black text-[11px] font-bold font-mono shrink-0 cursor-pointer shadow-xs"
            >
              Media Downloader
            </button>
          </div>

          {/* Form Input Obrolan Neobrutalist */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="p-3 bg-[#131322] border-t-2 border-black flex items-center gap-2"
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={angerState.isAngry ? 'KuroBot sedang ngambek (30 menit)...' : 'Tanya seputar fitur AllToolsKuro...'}
              disabled={isTyping || angerState.isAngry}
              className="flex-1 bg-[#0e0f1a] border-2 border-black rounded-lg px-3 py-2 text-xs font-medium text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!inputText.trim() || isTyping || angerState.isAngry}
              className="w-9 h-9 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white border-2 border-black shadow-[2px_2px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none flex items-center justify-center transition-all cursor-pointer"
              aria-label="Kirim Pesan"
            >
              <Send className="w-3.5 h-3.5 stroke-[2.5]" />
            </button>
          </form>

        </div>
      )}

      {/* ─── 4. FLOATING HELPER MODE (GUIDED TOUR & AUTO-SCROLL) ─── */}
      {mode === 'floating_helper' && (
        <div 
          className={`fixed bottom-20 sm:bottom-8 z-50 flex items-end gap-3 max-w-[360px] sm:max-w-[460px] animate-in fade-in duration-200 ${
            dockPosition === 'left' ? 'left-3 sm:left-8' : 'right-3 sm:right-8'
          }`}
        >
          {/* Balon Penjelasan Interaktif */}
          <div 
            className="flex-1 rounded-2xl border-2 border-black p-4 shadow-[5px_5px_0px_#000000] flex flex-col gap-2.5 text-white"
            style={{ backgroundColor: '#1a1a2e' }}
          >
            {/* Header Helper: Nomor Urut Tour & Tombol Cancel */}
            <div className="flex items-center justify-between border-b-2 border-black pb-2">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
                <span className="text-xs font-mono font-black text-blue-400 uppercase">
                  {isTourActive ? `Guided Tour (${tourIndex + 1}/${KURO_TOOLS_CATALOG.length})` : 'Panduan Fitur'}
                </span>
              </div>

              <button
                type="button"
                onClick={handleCancelTour}
                className="p-1 rounded-lg bg-[#282a3c] hover:bg-[#34374e] text-slate-200 border border-black shadow-xs cursor-pointer transition-colors"
                title="Hentikan Tour"
                aria-label="Hentikan Tour"
              >
                <StopCircle className="w-3.5 h-3.5 stroke-[2.5]" />
              </button>
            </div>

            {/* Konten Penjelasan Typewriter */}
            <p className="text-xs text-slate-100 font-sans leading-relaxed whitespace-pre-line">
              {displayedReply || (messages.length > 0 ? messages[messages.length - 1].text : '')}
            </p>

            {/* Footer Helper: Tombol Navigasi Lanjut */}
            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => setMode('chat_popup')}
                className="text-[11px] font-mono text-slate-300 hover:text-white underline cursor-pointer"
              >
                Buka Chatbot
              </button>

              {isTourActive && (
                <button
                  type="button"
                  onClick={() => {
                    if (tourSequenceRef.current) clearTimeout(tourSequenceRef.current);
                    executeTourStep(tourIndex + 1);
                  }}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-extrabold rounded-lg border-2 border-black shadow-[1.5px_1.5px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 flex items-center gap-1 cursor-pointer transition-all"
                >
                  <span>Berikutnya</span>
                  <ChevronRight className="w-3 h-3 stroke-[2.5]" />
                </button>
              )}
            </div>
          </div>

          {/* Karakter Avatar di Sisi Balon */}
          <div className="w-16 h-16 rounded-2xl bg-[#1a1a2e] border-2 border-black shadow-[3px_3px_0px_#000000] overflow-hidden flex items-center justify-center p-1 shrink-0">
            <KuroCharacter state={animState} size={54} />
          </div>
        </div>
      )}
    </>
  );
}
