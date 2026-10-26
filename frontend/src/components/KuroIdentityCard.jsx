import React, { useState, useEffect, useRef } from 'react';
import { 
  User, 
  Smartphone, 
  Monitor,
  Tablet,
  Zap,
  Battery, 
  BatteryCharging, 
  Search, 
  ExternalLink, 
  MessageCircle, 
  Radio, 
  LogOut,
  X,
  KeyRound,
  Eye,
  EyeOff,
  ShieldCheck,
  Activity,
  Pencil,
  GitBranch,
  Clock
} from 'lucide-react';
import { getDeviceUserName, setDeviceUserName } from '../services/storageService';
import { translations } from '../utils/translations';

/**
 * Deteksi perangkat, sistem operasi, dan peramban secara universal
 * Mendukung iOS (iPhone, iPadOS), Android, Windows, macOS, Linux, ChromeOS
 * serta peramban web mandiri maupun In-App WebView (TikTok, Instagram, WhatsApp, Facebook, Safari, Chrome, Firefox)
 */
export function detectUserDevice() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { 
      os: 'Windows', 
      browser: 'Browser', 
      type: 'desktop', 
      badge: 'Windows • Browser',
      isIOS: false,
      isAndroid: false
    };
  }

  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const maxTouchPoints = navigator.maxTouchPoints || 0;

  // 1. Deteksi Sistem Operasi
  let os = 'Windows';
  let type = 'desktop';

  const isIPhone = /iPhone/i.test(ua);
  const isIPad = /iPad/i.test(ua) || (platform === 'MacIntel' && maxTouchPoints > 1);
  const isIPod = /iPod/i.test(ua);
  const isIOS = isIPhone || isIPad || isIPod;

  const isAndroid = /Android/i.test(ua);
  const isWindows = /Windows NT|Win32|Win64|WOW64|Windows/i.test(ua) || /Win/i.test(platform);
  const isMac = !isIOS && (/Macintosh|Mac OS X|MacPPC|MacIntel/i.test(ua) || /Mac/i.test(platform));
  const isLinux = !isAndroid && (/Linux|X11/i.test(ua) || /Linux/i.test(platform));
  const isChromeOS = /CrOS/i.test(ua);

  if (isIPhone) {
    os = 'iOS';
    type = 'mobile';
  } else if (isIPad) {
    os = 'iPadOS';
    type = 'tablet';
  } else if (isIPod) {
    os = 'iOS';
    type = 'mobile';
  } else if (isAndroid) {
    os = 'Android';
    type = (/Tablet/i.test(ua) || (maxTouchPoints > 0 && !/Mobile/i.test(ua))) ? 'tablet' : 'mobile';
  } else if (isWindows) {
    os = 'Windows';
    type = 'desktop';
  } else if (isMac) {
    os = 'macOS';
    type = 'desktop';
  } else if (isChromeOS) {
    os = 'ChromeOS';
    type = 'desktop';
  } else if (isLinux) {
    os = 'Linux';
    type = 'desktop';
  }

  // 2. Deteksi Peramban Lintas Platform & In-App WebView
  let browser = 'Browser';
  const isBrave = typeof navigator.brave !== 'undefined' || (navigator.brave && typeof navigator.brave.isBrave === 'function');

  if (/Instagram/i.test(ua)) {
    browser = 'Instagram';
  } else if (/musical_ly|ByteDance|TikTok/i.test(ua)) {
    browser = 'TikTok';
  } else if (/WhatsApp/i.test(ua)) {
    browser = 'WhatsApp';
  } else if (/FBAN|FBAV|FB_IAB/i.test(ua)) {
    browser = 'Facebook';
  } else if (/Twitter|TwitterAndroid|TwitteriPhone/i.test(ua)) {
    browser = 'X';
  } else if (/Line\//i.test(ua)) {
    browser = 'LINE';
  } else if (isBrave) {
    browser = 'Brave';
  } else if (/SamsungBrowser/i.test(ua)) {
    browser = 'Samsung Internet';
  } else if (/Edg\/|EdgiOS|Edge/i.test(ua)) {
    browser = 'Edge';
  } else if (/OPR\/|Opera|OPT\//i.test(ua)) {
    browser = 'Opera';
  } else if (/Vivaldi/i.test(ua)) {
    browser = 'Vivaldi';
  } else if (/UCBrowser/i.test(ua)) {
    browser = 'UC Browser';
  } else if (/Firefox|FxiOS/i.test(ua)) {
    browser = 'Firefox';
  } else if (/CriOS/i.test(ua)) {
    browser = 'Chrome (iOS)';
  } else if (/Chrome/i.test(ua) && !/Edg|OPR|SamsungBrowser/i.test(ua)) {
    browser = 'Chrome';
  } else if (/Safari/i.test(ua) && !/Chrome|CriOS|Android/i.test(ua)) {
    browser = 'Safari';
  } else if (/wv|WebView/i.test(ua)) {
    browser = 'WebView';
  }

  const badge = `${os} • ${browser}`;
  return { os, browser, type, badge, isIOS, isAndroid };
}

export default function KuroIdentityCard({ 
  searchQuery, 
  setSearchQuery, 
  onSearchSubmit,
  lang = 'id'
}) {
  const t = translations[lang] || translations.id;

  const [role, setRole] = useState(() => {
    const isAuth = localStorage.getItem('kuro_admin_auth') === 'true' || 
                   localStorage.getItem('kaze_admin_auth') === 'true';
    return isAuth ? 'Admin' : 'Member';
  });

  const [showLoginModal, setShowLoginModal] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const videoRef = useRef(null);
  const bannerContainerRef = useRef(null);

  // Nama Pengguna Terdeteksi pada Perangkat Ini (Tersimpan Terisolasi Khusus Perangkat Ini)
  const [deviceUserName, setDeviceUserNameState] = useState(() => {
    return getDeviceUserName();
  });
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');

  /**
   * Format jam lokal dengan deteksi zona waktu Indonesia (WIB, WITA, WIT)
   */
  const formatIndonesianTime = (date = new Date()) => {
    const pad = (n) => String(n).padStart(2, '0');
    const h = pad(date.getHours());
    const m = pad(date.getMinutes());
    const s = pad(date.getSeconds());

    let tzCode = 'WIB';
    try {
      const tzName = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      const offsetHours = -date.getTimezoneOffset() / 60;

      // WIT (Waktu Indonesia Timur - UTC+9: Maluku, Papua, Jayapura)
      if (/Jayapura|East_Indonesia|Ambon|Papua/i.test(tzName) || offsetHours === 9) {
        tzCode = 'WIT';
      }
      // WITA (Waktu Indonesia Tengah - UTC+8: Bali, NTB, NTT, Kalimantan Timur/Selatan, Sulawesi)
      else if (/Makassar|Ujung_Pandang|Denpasar|Bali|Balikpapan|Banjarmasin|Manado|Mataram|Kupang/i.test(tzName) || offsetHours === 8) {
        tzCode = 'WITA';
      }
      // WIB (Waktu Indonesia Barat - UTC+7: Jawa, Sumatera, Kalimantan Barat/Tengah)
      else if (/Jakarta|Pontianak|West_Indonesia|Sumatra|Java/i.test(tzName) || offsetHours === 7) {
        tzCode = 'WIB';
      } else if (offsetHours > 0) {
        tzCode = `UTC+${offsetHours}`;
      } else if (offsetHours < 0) {
        tzCode = `UTC${offsetHours}`;
      } else {
        tzCode = 'UTC';
      }
    } catch {
      tzCode = 'WIB';
    }

    return `${h}.${m}.${s} ${tzCode}`;
  };

  // Live Device Clock (Real-Time mengikuti jam perangkat lokal pengguna & zona WIB/WITA/WIT)
  const [deviceTime, setDeviceTime] = useState(() => formatIndonesianTime());

  useEffect(() => {
    const updateClock = () => {
      setDeviceTime(formatIndonesianTime());
    };
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  // Telemetri Jaringan Real-Time (Latency MS 0 - 999 ms)
  const [networkLatency, setNetworkLatency] = useState(null);
  const [networkQuality, setNetworkQuality] = useState('good'); // 'good' | 'medium' | 'slow'

  // Effect untuk mengukur latensi jaringan pengguna secara real-time
  useEffect(() => {
    let isMounted = true;
    let timeoutId = null;

    const pingServer = async () => {
      const startTime = performance.now();
      try {
        const controller = new AbortController();
        const abortTimeout = setTimeout(() => controller.abort(), 3500);

        const res = await fetch(`/api/ping?_t=${Date.now()}`, {
          method: 'GET',
          cache: 'no-store',
          signal: controller.signal,
          headers: { 'Cache-Control': 'no-cache, no-store' }
        });
        clearTimeout(abortTimeout);

        if (!isMounted) return;

        if (res.ok) {
          const endTime = performance.now();
          const rtt = Math.round(endTime - startTime);
          const clamped = Math.max(0, Math.min(999, rtt));
          setNetworkLatency(clamped);
          setNetworkQuality(clamped < 100 ? 'good' : clamped < 280 ? 'medium' : 'slow');
        } else {
          fallbackPing(startTime);
        }
      } catch (err) {
        if (!isMounted) return;
        fallbackPing(startTime);
      } finally {
        if (isMounted) {
          const nextInterval = 2500 + Math.random() * 500;
          timeoutId = setTimeout(pingServer, nextInterval);
        }
      }
    };

    const fallbackPing = (startTime) => {
      if (typeof navigator !== 'undefined' && navigator.connection && typeof navigator.connection.rtt === 'number') {
        const rawRtt = navigator.connection.rtt;
        const jitter = Math.floor((Math.random() - 0.5) * 12);
        const computed = Math.max(0, Math.min(999, rawRtt + jitter));
        setNetworkLatency(computed);
        setNetworkQuality(computed < 100 ? 'good' : computed < 280 ? 'medium' : 'slow');
      } else {
        const endTime = performance.now();
        const estimated = Math.max(15, Math.min(999, Math.round(endTime - startTime)));
        setNetworkLatency(estimated);
        setNetworkQuality(estimated < 100 ? 'good' : estimated < 280 ? 'medium' : 'slow');
      }
    };

    pingServer();

    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  const [deviceInfo, setDeviceInfo] = useState(() => detectUserDevice());
  const [showBrowserInBadge, setShowBrowserInBadge] = useState(true);

  // Status Baterai Lintas Platform
  const [batteryLevel, setBatteryLevel] = useState(() => {
    const saved = localStorage.getItem('kuro_battery_level') || localStorage.getItem('kaze_battery_level');
    return saved ? parseInt(saved, 10) : 100;
  });
  const [isCharging, setIsCharging] = useState(false);
  const [batteryMode, setBatteryMode] = useState('checking'); // 'native', 'system', 'fallback'

  const triggerWallpaperPlayback = () => {
    const video = videoRef.current;
    if (!video) return;

    try {
      video.defaultMuted = true;
      video.muted = true;
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {});
      }
    } catch {
      // Abaikan jika browser membatasi autoplay
    }
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.defaultMuted = true;
    video.muted = true;
    video.playsInline = true;

    triggerWallpaperPlayback();

    const handleUserInteraction = () => {
      if (video && video.paused) {
        triggerWallpaperPlayback();
      }
    };

    const handleVisibility = () => {
      if (!document.hidden && video && video.paused) {
        triggerWallpaperPlayback();
      }
    };

    window.addEventListener('pointerdown', handleUserInteraction, { passive: true });
    window.addEventListener('touchstart', handleUserInteraction, { passive: true });
    window.addEventListener('scroll', handleUserInteraction, { passive: true });
    window.addEventListener('keydown', handleUserInteraction, { passive: true });
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('pointerdown', handleUserInteraction);
      window.removeEventListener('touchstart', handleUserInteraction);
      window.removeEventListener('scroll', handleUserInteraction);
      window.removeEventListener('keydown', handleUserInteraction);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('kuro_user_role', role);
  }, [role]);

  // Manajemen Baterai Universal
  useEffect(() => {
    const currentDevice = detectUserDevice();
    setDeviceInfo(currentDevice);

    let batteryManager = null;
    let isSubscribed = true;

    let batteryInterval = null;

    // 1. Cek Native W3C Battery Status API (Chrome, Edge, Samsung Internet di Android/Desktop)
    if (typeof navigator !== 'undefined' && typeof navigator.getBattery === 'function') {
      navigator.getBattery()
        .then((battery) => {
          if (!isSubscribed) return;
          batteryManager = battery;
          
          const syncNativeBattery = () => {
            if (!isSubscribed || !battery) return;
            const level = Math.round((battery.level || 0) * 100);
            const safeLevel = isNaN(level) ? 100 : Math.max(0, Math.min(100, level));
            setBatteryLevel(safeLevel);
            setIsCharging(Boolean(battery.charging));
            setBatteryMode('native');
            try {
              localStorage.setItem('kuro_battery_level', safeLevel.toString());
            } catch {}
          };

          syncNativeBattery();
          battery.addEventListener('levelchange', syncNativeBattery);
          battery.addEventListener('chargingchange', syncNativeBattery);
        })
        .catch(() => {
          startSystemBatteryPolling();
        });
    } else {
      startSystemBatteryPolling();
    }

    function startSystemBatteryPolling() {
      fetchSystemBattery(currentDevice);
      // Polling setiap 4 detik untuk peramban seperti Firefox / Safari desktop
      if (currentDevice.type === 'desktop') {
        batteryInterval = setInterval(() => {
          if (isSubscribed) fetchSystemBattery(currentDevice);
        }, 4000);
      }
    }

    async function fetchSystemBattery(dev) {
      if (!isSubscribed) return;

      // Jika di desktop (Windows/Mac/Linux), ambil telemetri hardware server
      if (dev.type === 'desktop') {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 2500);
          const res = await fetch('/api/system-battery', {
            signal: controller.signal,
            headers: { 'Cache-Control': 'no-cache' }
          });
          clearTimeout(timeoutId);

          if (res.ok && isSubscribed) {
            const data = await res.json();
            if (data && typeof data.level === 'number') {
              setBatteryLevel(data.level);
              setIsCharging(Boolean(data.isCharging));
              setBatteryMode(data.source === 'hardware' ? 'system' : 'fallback');
              try {
                localStorage.setItem('kuro_battery_level', data.level.toString());
              } catch {}
              return;
            }
          }
        } catch {
          // Gagal fetch, gunakan fallback
        }
      }

      // Fallback untuk iOS (iPhone/iPad) & peramban mobile tanpa Battery API
      if (isSubscribed) {
        setBatteryLevel(100);
        setIsCharging(false);
        setBatteryMode('fallback');
      }
    }

    return () => {
      isSubscribed = false;
      if (batteryInterval) clearInterval(batteryInterval);
      if (batteryManager) {
        batteryManager.removeEventListener('levelchange', () => {});
        batteryManager.removeEventListener('chargingchange', () => {});
      }
    };
  }, []);

  const handleAdminLogin = async (e) => {
    e.preventDefault();
    const pass = adminPassword.trim();
    if (!pass) {
      setLoginError('Silakan masukkan kata sandi admin.');
      return;
    }

    setIsLoggingIn(true);
    setLoginError('');

    const envPassword = (import.meta.env.VITE_ADMIN_PASSWORD || 'VINZ6767').trim();

    if (pass === envPassword) {
      setRole('Admin');
      localStorage.setItem('kuro_user_role', 'Admin');
      localStorage.setItem('kuro_admin_auth', 'true');
      setShowLoginModal(false);
      setAdminPassword('');
      setLoginError('');
      setIsLoggingIn(false);
      return;
    }

    try {
      const res = await fetch('/api/verify-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pass })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setRole('Admin');
        localStorage.setItem('kuro_user_role', 'Admin');
        localStorage.setItem('kuro_admin_auth', 'true');
        setShowLoginModal(false);
        setAdminPassword('');
        setLoginError('');
        setIsLoggingIn(false);
        return;
      }
    } catch {
      // Abaikan
    }

    setIsLoggingIn(false);
    setLoginError('Kata sandi admin salah. Akses role Admin ditolak.');
  };

  const handleAdminLogout = () => {
    setRole('Member');
    localStorage.setItem('kuro_user_role', 'Member');
    localStorage.removeItem('kuro_admin_auth');
    localStorage.removeItem('kaze_admin_auth');
  };

  return (
    <div className="w-full flex flex-col gap-4 mb-5">
      
      {/* ─── 1. TOP PROFILE & VIDEO SHOWCASE CARD (CLEAN NEOBRUTALISM) ─── */}
      <div className="rounded-xl border-2 border-black p-4 sm:p-5 bg-white shadow-[4px_4px_0px_#000000]">
        <div className="flex flex-col md:flex-row items-center md:items-stretch gap-5 sm:gap-6">
          
          {/* Sisi Kiri: Anime Live Wallpaper (Proporsi Asli 9:16 Full Frame HD) */}
          <div className="w-full md:w-auto flex justify-center shrink-0">
            <div 
              ref={bannerContainerRef}
              className="relative w-[190px] sm:w-[205px] md:w-[195px] lg:w-[210px] aspect-[9/16] rounded-xl overflow-hidden bg-neutral-100 border-2 border-black shadow-[3px_3px_0px_#000000] select-none"
            >
              <video 
                ref={videoRef}
                src="/videos/wpanime.mp4"
                poster="/videos/wpanime-poster.webp"
                preload="auto"
                autoPlay 
                loop 
                muted
                playsInline
                onCanPlay={triggerWallpaperPlayback}
                onLoadedData={triggerWallpaperPlayback}
                onEnded={triggerWallpaperPlayback}
                className="w-full h-full object-cover object-center select-none pointer-events-none"
              />
            </div>
          </div>

          {/* Sisi Kanan: Identitas Kuro & Metrik Real-time */}
          <div className="flex-1 w-full flex flex-col justify-between space-y-3 min-w-0">
            
            {/* Header Nama Kreator */}
            <div className="flex items-center justify-between pb-3 border-b-2 border-black">
              <div className="flex flex-col">
                <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 font-bold">
                  {t.identity.creatorName}
                </span>
                <span className="text-xl sm:text-2xl font-black text-black tracking-tight font-display">
                  kuro
                </span>
              </div>

              <div className="w-12 h-12 rounded-full border-2 border-black overflow-hidden bg-neutral-100 flex items-center justify-center shadow-[2px_2px_0px_#000000] shrink-0">
                <User className="w-7 h-7 text-black stroke-[2]" />
              </div>
            </div>

            {/* Nama Pengguna Perangkat & Status Terdeteksi (Tersimpan Terisolasi Khusus Perangkat Ini) */}
            {deviceUserName && !isEditingName ? (
              <div className="p-2.5 rounded-lg border-2 border-black bg-neutral-50 shadow-[2px_2px_0px_#000000] flex items-center justify-between gap-2">
                <div className="flex flex-col min-w-0">
                  <span className="text-[9px] font-mono uppercase text-neutral-500 font-bold">
                    {t.identity.deviceUser}
                  </span>
                  <span className="font-extrabold text-xs sm:text-sm text-black truncate">
                    {deviceUserName}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-black bg-black text-white text-[9px] sm:text-[10px] font-mono font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
                    <span>{t.identity.deviceDetected}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setNameInput(deviceUserName);
                      setIsEditingName(true);
                    }}
                    className="p-1 rounded border border-black bg-white hover:bg-neutral-200 text-black shadow-[1.5px_1.5px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer"
                    title={t.identity.edit}
                  >
                    <Pencil className="w-3 h-3 stroke-[2.5]" />
                  </button>
                </div>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const trimmed = nameInput.trim();
                  if (trimmed) {
                    setDeviceUserName(trimmed);
                    setDeviceUserNameState(trimmed);
                    setIsEditingName(false);
                  }
                }}
                className="p-2.5 rounded-lg border-2 border-black bg-neutral-50 shadow-[2px_2px_0px_#000000] space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase font-bold text-neutral-600">
                    {isEditingName ? t.identity.edit : t.identity.inputUsername}
                  </span>
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-black bg-white text-black font-bold">
                    {t.identity.deviceDetected}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder={t.identity.enterUsername}
                    maxLength={30}
                    className="flex-1 px-2.5 py-1.5 rounded border border-black text-xs font-semibold text-black placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-black bg-white shadow-inner"
                    autoFocus={isEditingName}
                  />
                  <button
                    type="submit"
                    disabled={!nameInput.trim()}
                    className="px-3 py-1.5 rounded border border-black bg-black text-white text-xs font-extrabold hover:bg-neutral-800 disabled:opacity-50 cursor-pointer shadow-[1.5px_1.5px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all shrink-0"
                  >
                    {t.identity.save}
                  </button>
                  {isEditingName && (
                    <button
                      type="button"
                      onClick={() => setIsEditingName(false)}
                      className="px-2 py-1.5 rounded border border-black bg-white hover:bg-neutral-100 text-xs font-bold text-black shadow-[1.5px_1.5px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer shrink-0"
                    >
                      {t.identity.adminCancel}
                    </button>
                  )}
                </div>
              </form>
            )}

            {/* Metrik Perangkat & Daya */}
            <div className="space-y-2 text-xs font-semibold">
              
              {/* Status Jaringan */}
              <div className="flex items-center justify-between">
                <span className="text-neutral-600 font-medium flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5 text-black stroke-[2.5]" />
                  <span>{t.identity.status}</span>
                </span>
                <span className="font-mono font-bold text-black uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-black inline-block animate-pulse" />
                  <span>{t.identity.online}</span>
                </span>
              </div>

              {/* Region */}
              <div className="flex items-center justify-between">
                <span className="text-neutral-600 font-medium">{t.identity.region}</span>
                <span className="font-bold text-black flex items-center gap-1.5">
                  <span className="inline-block w-4 h-3 rounded-xs overflow-hidden border border-black shrink-0">
                    <span className="block w-full h-1/2 bg-[#EE1B24]" />
                    <span className="block w-full h-1/2 bg-[#FFFFFF]" />
                  </span>
                  <span>Indonesia</span>
                </span>
              </div>

              {/* Perangkat & Peramban Universal */}
              <div className="flex items-center justify-between">
                <span className="text-neutral-600 font-medium flex items-center gap-1.5">
                  {deviceInfo.type === 'desktop' ? (
                    <Monitor className="w-3.5 h-3.5 text-black stroke-[2.5]" />
                  ) : deviceInfo.type === 'tablet' ? (
                    <Tablet className="w-3.5 h-3.5 text-black stroke-[2.5]" />
                  ) : (
                    <Smartphone className="w-3.5 h-3.5 text-black stroke-[2.5]" />
                  )}
                  <span>{t.identity.device}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowBrowserInBadge(prev => !prev)}
                  className="font-mono font-bold text-black px-2 py-0.5 rounded border border-black bg-neutral-100 hover:bg-neutral-200 shadow-[1.5px_1.5px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer text-[11px]"
                  title={`OS: ${deviceInfo.os} | Browser: ${deviceInfo.browser}`}
                >
                  {showBrowserInBadge ? `${deviceInfo.os} • ${deviceInfo.browser}` : deviceInfo.os}
                </button>
              </div>

              {/* Telemetri Baterai Real-time */}
              <div className="flex items-center justify-between">
                <span className="text-neutral-600 font-medium flex items-center gap-1.5">
                  {isCharging ? (
                    <BatteryCharging className="w-3.5 h-3.5 text-black stroke-[2.5]" />
                  ) : (
                    <Battery className="w-3.5 h-3.5 text-black stroke-[2.5]" />
                  )}
                  <span>{t.identity.battery}</span>
                </span>
                
                <div 
                  className="flex items-center gap-1.5 font-mono font-bold text-black"
                  title={
                    batteryMode === 'fallback'
                      ? `${deviceInfo.os} Battery Status`
                      : isCharging 
                        ? `Charging (${batteryLevel}%)` 
                        : `Battery (${batteryLevel}%)`
                  }
                >
                  <div className="w-10 h-2.5 rounded-sm border border-black p-[1px] flex items-center bg-white">
                    <div 
                      className="h-full bg-black transition-all duration-300" 
                      style={{ width: `${Math.min(100, Math.max(8, batteryLevel))}%` }}
                    />
                  </div>

                  {batteryMode === 'fallback' && deviceInfo.isIOS ? (
                    <span className="text-[11px]">{t.identity.batteryActive}</span>
                  ) : (
                    <span>{batteryLevel}%</span>
                  )}

                  {isCharging ? (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-black bg-black text-white text-[10px] font-mono font-bold">
                      <Zap className="w-2.5 h-2.5 fill-current text-white" />
                      <span className="text-[9px]">{t.identity.charging}</span>
                    </span>
                  ) : batteryMode === 'fallback' ? (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded border border-black bg-neutral-100 text-black text-[9px] font-mono font-bold">
                      {t.identity.batteryActive}
                    </span>
                  ) : null}
                </div>
              </div>

              {/* Telemetri Jaringan Real-Time (Latency MS 0 - 999 ms) */}
              <div className="flex items-center justify-between">
                <span className="text-neutral-600 font-medium flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-black stroke-[2.5]" />
                  <span>{t.identity.network}</span>
                </span>
                <div className="flex items-center gap-1.5 font-mono font-bold text-black">
                  <span 
                    className={`inline-block w-2 h-2 rounded-full ${
                      networkQuality === 'good' ? 'bg-emerald-500 animate-pulse' :
                      networkQuality === 'medium' ? 'bg-amber-500 animate-pulse' :
                      'bg-red-500 animate-pulse'
                    }`}
                  />
                  <span className="text-[11px] bg-neutral-100 px-2 py-0.5 rounded border border-black shadow-[1px_1px_0px_#000000]">
                    {networkLatency !== null ? `${networkLatency} ms` : t.identity.detecting}
                  </span>
                </div>
              </div>

              {/* TAMPILAN JAM PERANGKAT REAL-TIME (Mengikuti waktu perangkat pengguna secara langsung) */}
              <div className="flex items-center justify-between">
                <span className="text-neutral-600 font-medium flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-black stroke-[2.5]" />
                  <span>{t.identity.deviceTime}</span>
                </span>
                <div className="flex items-center gap-1.5 font-mono font-bold text-black">
                  <span className="inline-block w-2 h-2 rounded-full bg-black animate-pulse" />
                  <span className="text-[11px] bg-neutral-100 px-2 py-0.5 rounded border border-black shadow-[1px_1px_0px_#000000]">
                    {deviceTime}
                  </span>
                </div>
              </div>

              {/* Status Role Pengguna */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-neutral-600 font-medium">{t.identity.role}</span>
                <div className="flex items-center gap-1.5">
                  {role === 'Admin' ? (
                    <div className="flex items-center gap-1">
                      <span className="px-2 py-0.5 rounded border border-black bg-black text-white font-mono text-[10px] font-bold">
                        {t.identity.admin}
                      </span>
                      <button
                        onClick={handleAdminLogout}
                        className="p-1 rounded border border-black bg-white hover:bg-neutral-100 text-black shadow-[1.5px_1.5px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer"
                        title="Logout Admin"
                      >
                        <LogOut className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded border border-black bg-neutral-100 text-black font-mono text-[10px] font-bold">
                        {t.identity.member}
                      </span>
                      <button
                        onClick={() => {
                          setShowLoginModal(true);
                          setLoginError('');
                        }}
                        className="px-2.5 py-0.5 rounded border border-black bg-white hover:bg-neutral-100 text-black font-mono text-[10px] font-bold shadow-[1.5px_1.5px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer"
                      >
                        {t.identity.login}
                      </button>
                    </div>
                  )}
                </div>
              </div>

            </div>

          </div>

        </div>
      </div>

      {/* ─── 2. INPUT PENCARIAN ALAT CEPAT (HIGH-CONTRAST MONOCHROME) ─── */}
      <form 
        onSubmit={(e) => {
          e.preventDefault();
          if (onSearchSubmit) onSearchSubmit(searchQuery);
        }}
        className="w-full flex items-center gap-2"
      >
        <div className="relative flex-grow">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-black stroke-[2.5]" />
          <input
            id="search-tools-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t.identity.searchPlaceholder}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border-2 border-black bg-white text-black placeholder:text-neutral-500 text-xs sm:text-sm font-medium outline-none focus:ring-2 focus:ring-black transition-all shadow-[2px_2px_0px_#000000]"
          />
        </div>
        <button
          type="submit"
          className="px-5 py-2.5 rounded-lg border-2 border-black bg-black text-white font-extrabold text-xs sm:text-sm shadow-[2px_2px_0px_#000000] hover:bg-neutral-800 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer shrink-0"
        >
          {t.nav.search}
        </button>
      </form>

      {/* ─── 3. SALURAN KOMUNITAS & MEDIA SOSIAL & REPO GITHUB ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <a 
          href="https://whatsapp.com/channel/0029VbDfI32EAKWIfTviOv3I" 
          target="_blank" 
          rel="noopener noreferrer"
          className="w-full py-2.5 px-4 rounded-lg border-2 border-black bg-white hover:bg-neutral-50 text-black font-bold text-xs flex items-center justify-between shadow-[2px_2px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <MessageCircle className="w-4 h-4 stroke-[2.5]" />
            <span>{t.identity.whatsappChannel}</span>
          </div>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>

        <a 
          href="https://www.tiktok.com/@kazexy1?_r=1&_t=ZS-9AI327NzPvw" 
          target="_blank" 
          rel="noopener noreferrer"
          className="w-full py-2.5 px-4 rounded-lg border-2 border-black bg-white hover:bg-neutral-50 text-black font-bold text-xs flex items-center justify-between shadow-[2px_2px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <span className="font-mono font-black text-xs">TT</span>
            <span>{t.identity.tiktokChannel}</span>
          </div>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>

        <a 
          href="https://github.com/itsvin-debug/AllToolsKuro.git" 
          target="_blank" 
          rel="noopener noreferrer"
          className="w-full py-2.5 px-4 rounded-lg border-2 border-black bg-white hover:bg-neutral-50 text-black font-bold text-xs flex items-center justify-between shadow-[2px_2px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 stroke-[2.5]" />
            <span>{t.identity.githubRepo}</span>
          </div>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* ─── MODAL LOGIN ADMIN (CLEAN NEOBRUTALISM) ─── */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-none animate-fadeIn">
          <div className="w-full max-w-sm rounded-xl p-6 bg-white border-2 border-black shadow-[6px_6px_0px_#000000] text-black">
            <div className="flex items-center justify-between pb-3 mb-4 border-b-2 border-black">
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 stroke-[2.5]" />
                <h3 className="font-extrabold text-sm sm:text-base">{t.identity.adminModalTitle}</h3>
              </div>
              <button
                onClick={() => setShowLoginModal(false)}
                className="p-1 rounded border border-black hover:bg-neutral-100 cursor-pointer"
              >
                <X className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>

            <form onSubmit={handleAdminLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-black mb-1.5 uppercase">
                  {t.identity.adminModalTitle}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={adminPassword}
                    onChange={(e) => {
                      setAdminPassword(e.target.value);
                      setLoginError('');
                    }}
                    placeholder={t.identity.adminPasswordPlaceholder}
                    autoFocus
                    className="w-full pl-3.5 pr-10 py-2.5 rounded-lg border-2 border-black bg-white text-black text-xs sm:text-sm font-medium outline-none focus:ring-2 focus:ring-black"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(prev => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-black cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {loginError && (
                <p className="text-xs text-black bg-neutral-100 p-2 rounded border border-black font-medium">
                  {loginError}
                </p>
              )}

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowLoginModal(false)}
                  className="flex-1 py-2.5 rounded-lg border-2 border-black bg-white hover:bg-neutral-100 text-xs font-bold cursor-pointer"
                >
                  {t.identity.adminCancel}
                </button>
                <button
                  type="submit"
                  disabled={isLoggingIn}
                  className="flex-1 py-2.5 rounded-lg border-2 border-black bg-black text-white hover:bg-neutral-800 disabled:opacity-50 font-bold text-xs shadow-[2px_2px_0px_#000000] cursor-pointer"
                >
                  {isLoggingIn ? t.identity.detecting : t.identity.adminSubmit}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
