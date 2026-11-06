import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  X, 
  Send, 
  Sparkles, 
  Compass, 
  ChevronRight, 
  StopCircle, 
  ArrowUpRight, 
  Maximize2,
  RotateCcw
} from 'lucide-react';
import KuroCharacter from './KuroCharacter';

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

  // Kunci penyimpanan riwayat lokal terisolasi khusus perangkat ini saja
  const DEVICE_CHAT_STORAGE_KEY = 'kuro_device_ai_chat_history';

  // Obrolan terisolasi per perangkat (Local to this device only, tidak bercampur antar perangkat)
  const [messages, setMessages] = useState(() => {
    try {
      const saved = localStorage.getItem(DEVICE_CHAT_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      // Abaikan error parsing
    }
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

  // Simpan riwayat secara lokal di perangkat ini saja setiap kali ada obrolan baru
  useEffect(() => {
    try {
      if (messages.length > 0) {
        localStorage.setItem(DEVICE_CHAT_STORAGE_KEY, JSON.stringify(messages.slice(-25)));
      } else {
        localStorage.removeItem(DEVICE_CHAT_STORAGE_KEY);
      }
    } catch (e) {
      // Abaikan error storage quota
    }
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
    const speed = 18; // 18ms per karakter agar typewriter mengalir mulus dan sinkron dengan bibir

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

  // Sapaan otomatis saat pengguna pertama kali membuka web (jika belum ada riwayat sebelumnya)
  useEffect(() => {
    if (hasGreetedRef.current) return;
    hasGreetedRef.current = true;

    // Jika perangkat ini sudah memiliki riwayat pesan, tampilkan riwayat tanpa mengulang sapaan
    try {
      const saved = localStorage.getItem(DEVICE_CHAT_STORAGE_KEY);
      if (saved && JSON.parse(saved).length > 0) return;
    } catch (e) {}

    // Beri jeda 800ms agar halaman utama termuat stabil terlebih dahulu
    const greetTimer = setTimeout(() => {
      setMode('chat_popup');
      setAnimState('wave');

      const greetingText = 'Halo! Aku AI Kuro, asisten penyihir penjelajah yang siap membantumu menjelaskan seluruh fitur keren di web ini.';
      
      // Tunggu animasi melambaikan tangan sejenak lalu mulai berbicara
      setTimeout(() => {
        streamText(greetingText, () => {
          setMessages([{ sender: 'ai', text: greetingText, animation: 'idle' }]);
        });
      }, 700);
    }, 800);

    return () => clearTimeout(greetTimer);
  }, [streamText]);

  // Buka widget secara manual saat tombol collapsed diklik
  const handleOpenWidget = () => {
    setMode('chat_popup');
    setAnimState('wave');

    if (messages.length === 0) {
      const greeting = 'Halo! Aku AI Kuro, asisten penyihir penjelajah yang siap membantumu menjelaskan seluruh fitur keren di web ini.';
      streamText(greeting, () => {
        setMessages([{ sender: 'ai', text: greeting, animation: 'idle' }]);
      });
    } else {
      setTimeout(() => setAnimState('idle'), 1200);
    }
  };

  // Fitur Hapus Riwayat (Clear History) Khusus Perangkat Ini & Reset ke Sapaan Awal
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

    const welcomeReset = 'Halo! Aku AI Kuro, asisten penyihir penjelajah yang siap membantumu menjelaskan seluruh fitur keren di web ini.';
    setTimeout(() => {
      streamText(welcomeReset, () => {
        setMessages([{ sender: 'ai', text: welcomeReset, animation: 'idle' }]);
      });
    }, 450);
  };

  // Batalkan seluruh timer tour, streaming teks, dan kembalikan kontrol penuh kepada pengguna
  const handleCancelTour = () => {
    if (typingTimerRef.current) {
      clearInterval(typingTimerRef.current);
      typingTimerRef.current = null;
    }
    if (tourSequenceRef.current) {
      clearTimeout(tourSequenceRef.current);
      tourSequenceRef.current = null;
    }
    document.querySelectorAll('.ring-purple-600').forEach(el => {
      el.classList.remove('ring-4', 'ring-purple-600', 'ring-offset-2');
    });
    setIsTourActive(false);
    setHighlightedToolId(null);
    setIsTyping(false);
    setAnimState('idle');
    setMode('collapsed');
  };

  // Tutup widget sepenuhnya
  const handleCloseWidget = () => {
    if (typingTimerRef.current) {
      clearInterval(typingTimerRef.current);
      typingTimerRef.current = null;
    }
    handleCancelTour();
    setMode('collapsed');
    setAnimState('idle');
    setIsTyping(false);
  };

  // Auto-scroll halus ke posisi kartu alat tertentu di layar
  const scrollToToolElement = (toolId) => {
    if (currentScreen !== 'welcome' && onNavigateScreen) {
      onNavigateScreen('welcome');
    }

    setHighlightedToolId(toolId);

    setTimeout(() => {
      const el = document.getElementById(`tool-${toolId}`) || document.querySelector(`[data-tool-id="${toolId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Efek sorotan ring neobrutalist kontras tinggi
        el.classList.add('ring-4', 'ring-purple-600', 'ring-offset-2', 'transition-all');
        setTimeout(() => {
          el.classList.remove('ring-4', 'ring-purple-600', 'ring-offset-2');
        }, 4500);
      }
    }, 280);
  };

  // Eksekusi tour 12 fitur secara berurutan satu per satu
  const executeTourStep = useCallback((index) => {
    if (index >= KURO_TOOLS_CATALOG.length) {
      setAnimState('wave');
      const completionText = 'Fufufu~ Selesai! Itu dia seluruh 13 fitur hebat yang ada di Kuro Studio. Sekarang giliranmu untuk berkreasi dan mencoba setiap fiturnya!';
      streamText(completionText, () => {
        setMessages(prev => [...prev, { sender: 'ai', text: completionText, animation: 'wave' }]);
        setIsTourActive(false);
      });
      return;
    }

    const currentTool = KURO_TOOLS_CATALOG[index];
    setTourIndex(index);
    scrollToToolElement(currentTool.id);

    const stepText = `Fitur ${index + 1} dari ${KURO_TOOLS_CATALOG.length}: ${currentTool.name} (${currentTool.tag}). ${currentTool.desc}`;
    streamText(stepText, () => {
      setMessages(prev => [...prev, { sender: 'ai', text: stepText, animation: 'talking', toolId: currentTool.id }]);
      
      // Auto-progress ke fitur berikutnya setelah penjelasan selesai
      if (tourSequenceRef.current) clearTimeout(tourSequenceRef.current);
      tourSequenceRef.current = setTimeout(() => {
        executeTourStep(index + 1);
      }, 4000);
    });
  }, [streamText, currentScreen, onNavigateScreen]);

  // Mulai tour seluruh fitur
  const handleStartTour = () => {
    setMode('floating_helper');
    setIsTourActive(true);
    setTourIndex(0);
    executeTourStep(0);
  };

  // Navigasi ke fitur tunggal (Single Tool Guidance)
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

  // Kirim pesan obrolan ke Backend (FastAPI / Vercel Serverless)
  const handleSendMessage = async (customMessage = null) => {
    const textToSend = (customMessage || inputText).trim();
    if (!textToSend || isTyping) return;

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
          history: newHistory.slice(-5)
        })
      });

      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}`);
      }

      const data = await res.json();
      const reply = cleanSpeechText(data.reply || 'Halo! Ada yang bisa AI Kuro bantu seputar Kuro Studio?');
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
      console.warn('[AI Kuro] Request fallback:', err);
      // Fallback ramah jika koneksi terputus atau pertanyaan di luar topik
      const lower = textToSend.toLowerCase();
      const isOut = ['resep', 'masak', 'politik', 'presiden', 'matematika', 'rumus', 'sejarah', 'cuaca', 'ramalan', 'zodiak'].some(k => lower.includes(k));
      
      if (!isOut && (lower.includes('safelink') || lower.includes('bypass') || lower.includes('shortlink') || lower.includes('sfl'))) {
        handleGuideSpecificTool('resolver', 'Tentu saja! Ini dia fitur Safelink Resolver. Alat untuk melewati tautan safelink bertingkat seperti Sfl.gl atau SafelinkU agar langsung membuka file aslinya tanpa menunggu iklan.');
        return;
      }

      const fallbackMsg = isOut
        ? 'Maaf ya, Kuro hanya bisa membantu menjelaskan seputar fitur-fitur dan cara penggunaan website ini! Fufufu~ Coba tanyakan salah satu dari 13 fitur hebat kami.'
        : 'Halo! Aku AI Kuro, asisten penyihir penjelajah yang siap membantumu. Mau tahu penjelasan seputar 13 fitur Kuro Studio?';
      
      const anim = isOut ? 'confused' : 'talking';
      setAnimState(anim);
      streamText(fallbackMsg, () => {
        setMessages(prev => [...prev, { sender: 'ai', text: fallbackMsg, animation: anim }]);
      }, anim);
    }
  };

  return (
    <>
      {/* ─── 1. TOMBOL WIDGET MELAYANG (COLLAPSED) ─── */}
      {mode === 'collapsed' && (
        <div className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-50 flex items-center gap-2 group">
          {/* Label Sapaan saat Hover */}
          <div className="hidden sm:flex items-center gap-1.5 bg-white border-2 border-black px-3 py-1.5 rounded-lg shadow-[2px_2px_0px_#000000] text-xs font-bold font-mono text-black pointer-events-none group-hover:opacity-100 opacity-90 transition-opacity">
            <Sparkles className="w-3.5 h-3.5 text-purple-600" />
            <span>Tanya AI Kuro</span>
          </div>

          <button
            type="button"
            onClick={handleOpenWidget}
            className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white border-2 border-black shadow-[3px_3px_0px_#000000] hover:shadow-[4px_4px_0px_#000000] hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all flex items-center justify-center relative cursor-pointer overflow-hidden p-1 bg-gradient-to-b from-purple-100 to-white"
            title="Buka Asisten AI Kuro"
            aria-label="Buka Asisten AI Kuro"
          >
            {/* Karakter Vektor SVG Elaina */}
            <KuroCharacter state="wave" size={54} />
            {/* Badge Status Sihir Aktif */}
            <span className="absolute top-1.5 right-1.5 w-3 h-3 rounded-full bg-purple-600 border border-black animate-pulse" />
          </button>
        </div>
      )}

      {/* ─── 2. POPUP CHAT INTERAKTIF (NORMAL CHAT MODE) ─── */}
      {mode === 'chat_popup' && (
        <div className="fixed bottom-20 right-3 sm:bottom-6 sm:right-6 z-50 w-[92vw] sm:w-[380px] max-h-[85vh] sm:max-h-[580px] bg-white border-2 border-black rounded-2xl shadow-[5px_5px_0px_#000000] flex flex-col overflow-hidden text-black animate-in fade-in slide-in-from-bottom-4 duration-200">
          
          {/* Header Popup: Karakter, Nama, & Tombol Kontrol */}
          <div className="p-3.5 bg-purple-600 text-white border-b-2 border-black flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-11 h-11 rounded-xl bg-white border-2 border-black overflow-hidden shrink-0 shadow-[1.5px_1.5px_0px_#000000] flex items-center justify-center p-0.5">
                <KuroCharacter state={animState} size={42} />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="font-black text-sm tracking-tight text-white">AI Kuro</span>
                  <span className="bg-amber-300 text-black text-[9px] font-mono font-black px-1.5 py-0.2 rounded border border-black">
                    ELAINA
                  </span>
                </div>
                <span className="text-[10px] text-purple-100 font-mono font-medium flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-ping" />
                  Penyihir Penjelajah Web
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleClearHistory}
                className="w-8 h-8 rounded-lg bg-white hover:bg-rose-50 text-neutral-800 hover:text-rose-600 border-2 border-black shadow-[1.5px_1.5px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 flex items-center justify-center transition-all cursor-pointer"
                title="Hapus Riwayat Obrolan (Mulai Ulang Sapaan)"
                aria-label="Hapus Riwayat Obrolan"
              >
                <RotateCcw className="w-3.5 h-3.5 stroke-[2.5]" />
              </button>
              <button
                type="button"
                onClick={handleStartTour}
                className="px-2 py-1 bg-amber-300 hover:bg-amber-400 text-black text-xs font-bold rounded-lg border-2 border-black shadow-[1.5px_1.5px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 flex items-center gap-1 transition-all cursor-pointer"
                title="Mulai Tour Seluruh Fitur"
              >
                <Compass className="w-3.5 h-3.5" />
                <span className="hidden xs:inline">Tour Web</span>
              </button>
              <button
                type="button"
                onClick={handleCloseWidget}
                className="w-8 h-8 rounded-lg bg-white hover:bg-neutral-100 text-black border-2 border-black shadow-[1.5px_1.5px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 flex items-center justify-center transition-all cursor-pointer"
                aria-label="Tutup Chat"
              >
                <X className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>
          </div>

          {/* Area Riwayat Pesan Obrolan */}
          <div className="flex-1 p-4 overflow-y-auto max-h-[360px] flex flex-col gap-3 bg-neutral-50/70 text-xs">
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`flex gap-2 items-start ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {m.sender === 'ai' && (
                  <div className="w-8 h-8 rounded-lg bg-purple-100 border border-black overflow-hidden shrink-0 mt-0.5 flex items-center justify-center">
                    <KuroCharacter state={m.animation || 'idle'} size={32} />
                  </div>
                )}
                <div
                  className={`p-3 rounded-xl border-2 border-black max-w-[82%] text-xs leading-relaxed font-sans ${
                    m.sender === 'user'
                      ? 'bg-black text-white shadow-[2px_2px_0px_#a855f7]'
                      : 'bg-white text-black shadow-[2px_2px_0px_#000000]'
                  }`}
                >
                  <p className="whitespace-pre-line">{cleanSpeechText(m.text)}</p>

                  {/* Tombol Pintasan Buka Fitur */}
                  {m.toolId && onOpenTool && (
                    <button
                      type="button"
                      onClick={() => onOpenTool(m.toolId)}
                      className="mt-2.5 inline-flex items-center gap-1 px-2.5 py-1 rounded bg-purple-600 hover:bg-purple-700 text-white font-bold text-[11px] border border-black shadow-xs cursor-pointer"
                    >
                      <span>Buka Fitur Ini</span>
                      <ArrowUpRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* Bubble Respons Typewriter Streaming */}
            {isTyping && displayedReply && (
              <div className="flex gap-2 items-start justify-start">
                <div className="w-8 h-8 rounded-lg bg-purple-100 border border-black overflow-hidden shrink-0 mt-0.5 flex items-center justify-center">
                  <KuroCharacter state="talking" size={32} />
                </div>
                <div className="p-3 rounded-xl border-2 border-black bg-white text-black shadow-[2px_2px_0px_#000000] max-w-[82%] text-xs leading-relaxed font-sans">
                  <p className="whitespace-pre-line">{displayedReply}</p>
                  <span className="inline-block w-1.5 h-3 ml-1 bg-purple-600 animate-pulse" />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Prompt Cepat (Quick Suggestions) */}
          <div className="px-3 py-2 bg-neutral-100 border-t-2 border-black flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={handleStartTour}
              className="px-2.5 py-1 rounded-md bg-purple-100 hover:bg-purple-200 text-purple-900 border border-black text-[11px] font-bold font-mono shrink-0 cursor-pointer shadow-xs"
            >
              Jelaskan Semua Fitur
            </button>
            <button
              type="button"
              onClick={() => handleSendMessage('Jelaskan fitur media downloader')}
              className="px-2.5 py-1 rounded-md bg-white hover:bg-neutral-200 text-black border border-black text-[11px] font-bold font-mono shrink-0 cursor-pointer shadow-xs"
            >
              Media Downloader
            </button>
            <button
              type="button"
              onClick={() => handleSendMessage('Jelaskan fitur cari link jj')}
              className="px-2.5 py-1 rounded-md bg-white hover:bg-neutral-200 text-black border border-black text-[11px] font-bold font-mono shrink-0 cursor-pointer shadow-xs"
            >
              Cari Link JJ
            </button>
            <button
              type="button"
              onClick={() => handleSendMessage('Jelaskan fitur hapus background')}
              className="px-2.5 py-1 rounded-md bg-white hover:bg-neutral-200 text-black border border-black text-[11px] font-bold font-mono shrink-0 cursor-pointer shadow-xs"
            >
              Hapus Background
            </button>
          </div>

          {/* Form Input Obrolan */}
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
              placeholder="Tanya seputar fitur Kuro Studio..."
              disabled={isTyping}
              className="flex-1 bg-neutral-100 border-2 border-black rounded-lg px-3 py-2 text-xs font-medium text-black placeholder:text-neutral-500 focus:outline-none focus:bg-white"
            />
            <button
              type="submit"
              disabled={!inputText.trim() || isTyping}
              className="w-9 h-9 rounded-lg bg-black hover:bg-neutral-800 disabled:opacity-50 text-white border-2 border-black shadow-[1.5px_1.5px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 flex items-center justify-center transition-all cursor-pointer"
              aria-label="Kirim Pesan"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>

        </div>
      )}

      {/* ─── 3. FLOATING HELPER MODE (GUIDED TOUR & AUTO-SCROLL) ─── */}
      {mode === 'floating_helper' && (
        <div className="fixed bottom-20 right-3 sm:bottom-8 sm:right-8 z-50 flex items-end gap-3 max-w-[360px] sm:max-w-[460px] animate-in fade-in slide-in-from-right-4 duration-200">
          
          {/* Balon Penjelasan Interaktif */}
          <div className="flex-1 bg-white border-2 border-black rounded-2xl p-4 shadow-[4px_4px_0px_#000000] flex flex-col gap-2.5 text-black">
            
            {/* Header Helper: Nomor Urut Tour & Tombol Cancel */}
            <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-purple-600 animate-ping" />
                <span className="text-xs font-mono font-black text-purple-700 uppercase">
                  {isTourActive ? `Guided Tour (${tourIndex + 1}/12)` : 'Panduan Fitur'}
                </span>
              </div>

              {/* Tombol Cancel / Batal yang Mudah Diakses */}
              <button
                type="button"
                onClick={handleCancelTour}
                className="px-2.5 py-1 rounded-md bg-rose-500 hover:bg-rose-600 text-white text-[11px] font-bold font-mono border-2 border-black shadow-[1px_1px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 flex items-center gap-1 transition-all cursor-pointer"
                title="Batalkan Tour dan Kembalikan Kontrol Penuh"
              >
                <StopCircle className="w-3.5 h-3.5" />
                <span>Cancel</span>
              </button>
            </div>

            {/* Isi Teks Typewriter Streaming Bersih */}
            <div className="text-xs font-medium leading-relaxed font-sans min-h-[48px] text-neutral-800">
              <p className="whitespace-pre-line">{displayedReply || cleanSpeechText(messages[messages.length - 1]?.text)}</p>
              {isTyping && <span className="inline-block w-1.5 h-3 ml-1 bg-purple-600 animate-pulse" />}
            </div>

            {/* Kontrol Aksi Lanjutan */}
            <div className="flex items-center justify-between gap-2 pt-1 border-t border-neutral-100">
              {highlightedToolId && onOpenTool && (
                <button
                  type="button"
                  onClick={() => {
                    handleCancelTour();
                    onOpenTool(highlightedToolId);
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-black hover:bg-neutral-800 text-white font-bold text-xs border-2 border-black shadow-[1.5px_1.5px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 flex items-center gap-1 transition-all cursor-pointer"
                >
                  <span>Buka Fitur</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              )}

              {isTourActive ? (
                <button
                  type="button"
                  onClick={() => executeTourStep(tourIndex + 1)}
                  disabled={isTyping}
                  className="ml-auto px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-black text-xs border-2 border-black shadow-[1.5px_1.5px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <span>{tourIndex === 11 ? 'Selesai' : 'Fitur Berikutnya'}</span>
                  <ChevronRight className="w-3.5 h-3.5 stroke-[3]" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setMode('chat_popup')}
                  className="ml-auto px-3 py-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-black font-bold text-xs border-2 border-black shadow-[1.5px_1.5px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 flex items-center gap-1 transition-all cursor-pointer"
                >
                  <span>Buka Obrolan</span>
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

          </div>

          {/* Karakter Vektor Elaina + Tombol Cancel Langsung pada Avatar Sisi Kanan */}
          <div className="flex flex-col items-center gap-1.5 shrink-0">
            <div 
              className="w-18 h-18 sm:w-22 sm:h-22 rounded-2xl bg-white border-2 border-black p-1 shadow-[3px_3px_0px_#000000] relative cursor-pointer hover:scale-105 transition-transform flex items-center justify-center bg-gradient-to-b from-purple-100/80 to-white"
              onClick={() => setMode('chat_popup')}
              title="Klik untuk membuka obrolan penuh"
            >
              <KuroCharacter state={animState} size={74} />
            </div>

            {/* Tombol Cancel / Batal Langsung pada Avatar Kanan Sesuai Kebutuhan Spesifikasi */}
            <button
              type="button"
              onClick={handleCancelTour}
              className="w-full px-2 py-1 rounded-md bg-rose-500 hover:bg-rose-600 text-white text-[11px] font-black font-mono border-2 border-black shadow-[1.5px_1.5px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 flex items-center justify-center gap-1 transition-all cursor-pointer"
              title="Batalkan Tour dan Kembalikan Kontrol Penuh"
            >
              <StopCircle className="w-3.5 h-3.5" />
              <span>Cancel</span>
            </button>
          </div>

        </div>
      )}
    </>
  );
}
