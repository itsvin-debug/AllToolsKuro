import React, { useState, useEffect, useRef } from 'react';
import { 
  User, 
  Crown, 
  ShieldCheck, 
  Smartphone, 
  Monitor,
  Laptop,
  Tablet,
  Zap,
  Battery, 
  BatteryCharging, 
  CheckCircle2, 
  Search, 
  ExternalLink, 
  MessageCircle, 
  Radio, 
  Lock,
  LogOut,
  X,
  KeyRound,
  Eye,
  EyeOff
} from 'lucide-react';
import { setAdminAuth, isAdminAuthenticated } from '../services/storageService';

export default function KazeIdentityCard({ 
  searchQuery, 
  setSearchQuery, 
  onSearchSubmit,
  onAuthChange
}) {
  const [role, setRole] = useState(() => {
    return isAdminAuthenticated() ? 'Admin' : 'Member';
  });

  useEffect(() => {
    const handleAuthEvent = (e) => {
      const active = e?.detail?.isAdmin ?? isAdminAuthenticated();
      setRole(active ? 'Admin' : 'Member');
    };
    window.addEventListener('kuro_admin_auth_updated', handleAuthEvent);
    return () => {
      window.removeEventListener('kuro_admin_auth_updated', handleAuthEvent);
    };
  }, []);

  const [showLoginModal, setShowLoginModal] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const videoRef = useRef(null);
  const bannerContainerRef = useRef(null);

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
      // ignore
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

function detectUserDevice() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { os: 'Windows', browser: 'Browser', type: 'desktop', badge: 'Windows • Browser' };
  }

  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const maxTouchPoints = navigator.maxTouchPoints || 0;

  // 1. Deteksi Browser Lintas Platform (Chrome, Firefox, Safari, Edge, Opera, Brave, Samsung Internet, Vivaldi)
  let browser = 'Browser';
  const isBrave = typeof navigator.brave !== 'undefined' || (navigator.brave && typeof navigator.brave.isBrave === 'function');

  if (isBrave) browser = 'Brave';
  else if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/i.test(ua)) browser = 'Opera';
  else if (/Vivaldi/i.test(ua)) browser = 'Vivaldi';
  else if (/SamsungBrowser/i.test(ua)) browser = 'Samsung Internet';
  else if (/Firefox|FxiOS/i.test(ua)) browser = 'Firefox';
  else if (/Chrome|CriOS/i.test(ua) && !/Edg/i.test(ua)) browser = 'Chrome';
  else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari';

  // 2. Deteksi Sistem Operasi
  let os = 'Windows';
  let type = 'desktop';

  const clientPlatform = navigator.userAgentData?.platform;
  if (clientPlatform) {
    const cp = clientPlatform.toLowerCase();
    if (cp.includes('win')) { os = 'Windows'; type = 'desktop'; }
    else if (cp.includes('mac')) { os = 'macOS'; type = 'desktop'; }
    else if (cp.includes('android')) { os = 'Android'; type = 'mobile'; }
    else if (cp.includes('linux')) { os = 'Linux'; type = 'desktop'; }
    else if (cp.includes('ios')) { os = 'iOS'; type = 'mobile'; }
  } else {
    // Universal Fallback untuk Firefox, Safari, dan browser non-Chromium
    if (/iPhone/i.test(ua)) {
      os = 'iOS';
      type = 'mobile';
    } else if (/iPad|iPod/i.test(ua) || (platform === 'MacIntel' && maxTouchPoints > 1)) {
      os = 'iOS';
      type = 'tablet';
    } else if (/Android/i.test(ua)) {
      os = 'Android';
      type = (/Tablet/i.test(ua) || (maxTouchPoints > 0 && !/Mobile/i.test(ua))) ? 'tablet' : 'mobile';
    } else if (/Windows NT|Win32|Win64|WOW64|Windows/i.test(ua) || /Win/i.test(platform)) {
      os = 'Windows';
      type = 'desktop';
    } else if (/Macintosh|Mac OS X|MacPPC|MacIntel/i.test(ua) || /Mac/i.test(platform)) {
      os = 'macOS';
      type = 'desktop';
    } else if (/Linux|X11/i.test(ua) || /Linux/i.test(platform)) {
      os = 'Linux';
      type = 'desktop';
    }
  }

  const badge = `${os} • ${browser}`;
  return { os, browser, type, badge };
}

  const [deviceInfo, setDeviceInfo] = useState(() => detectUserDevice());
  const [showBrowserInBadge, setShowBrowserInBadge] = useState(true);
  const [batteryLevel, setBatteryLevel] = useState(() => {
    const saved = localStorage.getItem('kaze_battery_level');
    return saved ? parseInt(saved, 10) : 96;
  });
  const [isCharging, setIsCharging] = useState(true);
  const [hasBatteryApi, setHasBatteryApi] = useState(true);

  useEffect(() => {
    localStorage.setItem('kaze_user_role', role);
  }, [role]);

  useEffect(() => {
    setDeviceInfo(detectUserDevice());

    let batteryManager = null;
    let isSubscribed = true;

    // Ambil status telemetri baterai real-time dari backend sistem agar seragam di semua browser
    const fetchSystemBattery = async () => {
      try {
        const res = await fetch('/api/system-battery', {
          headers: { 'Cache-Control': 'no-cache' }
        });
        if (res.ok) {
          const data = await res.json();
          if (data && isSubscribed) {
            const level = typeof data.level === 'number' ? data.level : 100;
            setBatteryLevel(level);
            setIsCharging(Boolean(data.isCharging));
            setHasBatteryApi(true);
            try {
              localStorage.setItem('kaze_battery_level', level.toString());
            } catch {}
          }
        }
      } catch {
        // Fallback aman
      }
    };

    fetchSystemBattery();
    const batteryPollInterval = setInterval(fetchSystemBattery, 25000);

    const syncBatteryState = (battery) => {
      if (!isSubscribed || !battery) return;
      const level = Math.round((battery.level || 0) * 100);
      const safeLevel = isNaN(level) ? 100 : Math.max(0, Math.min(100, level));
      setBatteryLevel(safeLevel);
      setIsCharging(Boolean(battery.charging));
      setHasBatteryApi(true);
      try {
        localStorage.setItem('kaze_battery_level', safeLevel.toString());
      } catch {}
    };

    const handleBatteryLevelChange = () => {
      if (batteryManager) syncBatteryState(batteryManager);
    };

    const handleChargingChange = () => {
      if (batteryManager) syncBatteryState(batteryManager);
    };

    // Jika browser mendukung native W3C Battery Status API (Chrome, Edge, Opera, Samsung Internet)
    if (typeof navigator !== 'undefined' && typeof navigator.getBattery === 'function') {
      navigator.getBattery()
        .then((battery) => {
          if (!isSubscribed) return;
          batteryManager = battery;
          syncBatteryState(battery);

          battery.addEventListener('levelchange', handleBatteryLevelChange);
          battery.addEventListener('chargingchange', handleChargingChange);
        })
        .catch(() => {});
    }

    return () => {
      isSubscribed = false;
      clearInterval(batteryPollInterval);
      if (batteryManager) {
        batteryManager.removeEventListener('levelchange', handleBatteryLevelChange);
        batteryManager.removeEventListener('chargingchange', handleChargingChange);
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
      setAdminAuth(true);
      if (onAuthChange) onAuthChange(true);
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
        setAdminAuth(true);
        if (onAuthChange) onAuthChange(true);
        setShowLoginModal(false);
        setAdminPassword('');
        setLoginError('');
        setIsLoggingIn(false);
        return;
      }
    } catch {
      // ignore
    }

    setIsLoggingIn(false);
    setLoginError('Kata sandi admin salah. Akses role Admin ditolak.');
  };

  const handleAdminLogout = () => {
    setRole('Member');
    setAdminAuth(false);
    if (onAuthChange) onAuthChange(false);
  };

  return (
    <div className="w-full flex flex-col gap-4 mb-5">
      
      {/* ─── 1. TOP PROFILE & VIDEO SHOWCASE CARD (CLEAN NEOBRUTALISM) ─── */}
      <div className="rounded-xl border-2 border-black p-4 sm:p-5 bg-white shadow-[4px_4px_0px_#000000]">
        <div className="flex flex-col md:flex-row items-center md:items-stretch gap-5 sm:gap-6">
          
          {/* Left: Anime Live Wallpaper (9:16 Native Full Frame, Clean Visual) */}
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

          {/* Right: User Information & Real-time Metrics */}
          <div className="flex-1 w-full flex flex-col justify-between space-y-3 min-w-0">
            
            {/* Header: Username & Circular Avatar */}
            <div className="flex items-center justify-between pb-3 border-b-2 border-black">
              <div className="flex flex-col">
                <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 font-bold">
                  Nama Kreator
                </span>
                <span className="text-xl sm:text-2xl font-black text-black tracking-tight font-display">
                  kaze
                </span>
              </div>

              <div className="w-12 h-12 rounded-full border-2 border-black overflow-hidden bg-neutral-100 flex items-center justify-center shadow-[2px_2px_0px_#000000] shrink-0">
                <User className="w-7 h-7 text-black stroke-[2]" />
              </div>
            </div>

            {/* Metrics List */}
            <div className="space-y-2 text-xs font-semibold">
              
              {/* Status */}
              <div className="flex items-center justify-between">
                <span className="text-neutral-600 font-medium flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5 text-black stroke-[2.5]" />
                  <span>Status</span>
                </span>
                <span className="font-mono font-bold text-black uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-black inline-block animate-pulse" />
                  <span>ONLINE</span>
                </span>
              </div>

              {/* Region */}
              <div className="flex items-center justify-between">
                <span className="text-neutral-600 font-medium">Region</span>
                <span className="font-bold text-black flex items-center gap-1.5">
                  <span className="inline-block w-4 h-3 rounded-xs overflow-hidden border border-black shrink-0">
                    <span className="block w-full h-1/2 bg-[#EE1B24]" />
                    <span className="block w-full h-1/2 bg-[#FFFFFF]" />
                  </span>
                  <span>Indonesia</span>
                </span>
              </div>

              {/* Perangkat */}
              <div className="flex items-center justify-between">
                <span className="text-neutral-600 font-medium flex items-center gap-1.5">
                  {deviceInfo.type === 'desktop' ? (
                    <Monitor className="w-3.5 h-3.5 text-black stroke-[2.5]" />
                  ) : deviceInfo.type === 'tablet' ? (
                    <Tablet className="w-3.5 h-3.5 text-black stroke-[2.5]" />
                  ) : (
                    <Smartphone className="w-3.5 h-3.5 text-black stroke-[2.5]" />
                  )}
                  <span>Perangkat</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowBrowserInBadge(prev => !prev)}
                  className="font-mono font-bold text-black px-2 py-0.5 rounded border border-black bg-neutral-100 hover:bg-neutral-200 transition-colors cursor-pointer text-[11px]"
                  title={`Sistem Operasi: ${deviceInfo.os} | Browser: ${deviceInfo.browser} (Klik untuk beralih format)`}
                >
                  {showBrowserInBadge ? `${deviceInfo.os} • ${deviceInfo.browser}` : deviceInfo.os}
                </button>
              </div>

              {/* Baterai */}
              <div className="flex items-center justify-between">
                <span className="text-neutral-600 font-medium flex items-center gap-1.5">
                  {isCharging ? (
                    <BatteryCharging className="w-3.5 h-3.5 text-black stroke-[2.5]" />
                  ) : (
                    <Battery className="w-3.5 h-3.5 text-black stroke-[2.5]" />
                  )}
                  <span>Baterai</span>
                </span>
                <div className="flex items-center gap-1.5 font-mono font-bold text-black">
                  <div className="w-10 h-2.5 rounded-sm border border-black p-[1px] flex items-center bg-white">
                    <div 
                      className="h-full bg-black transition-all duration-300" 
                      style={{ width: `${Math.min(100, Math.max(5, batteryLevel))}%` }}
                    />
                  </div>
                  <span>{batteryLevel}%</span>
                  {isCharging && (
                    <span 
                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-black bg-black text-white text-[10px] font-mono font-bold" 
                      title={isCharging ? `Perangkat sedang dicas (${batteryLevel}%)` : `Daya AC Aktif (${batteryLevel}%)`}
                    >
                      <Zap className="w-2.5 h-2.5 fill-current text-white" />
                      <span className="text-[9px]">CAS</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Role */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-neutral-600 font-medium">Role</span>
                <div className="flex items-center gap-1.5">
                  {role === 'Admin' ? (
                    <div className="flex items-center gap-1">
                      <span className="px-2 py-0.5 rounded border border-black bg-black text-white font-mono text-[10px] font-bold">
                        ADMIN
                      </span>
                      <button
                        onClick={handleAdminLogout}
                        className="p-1 rounded border border-black bg-white hover:bg-neutral-100 text-black cursor-pointer"
                        title="Keluar dari Admin"
                      >
                        <LogOut className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded border border-black bg-neutral-100 text-black font-mono text-[10px] font-bold">
                        MEMBER
                      </span>
                      <button
                        onClick={() => {
                          setShowLoginModal(true);
                          setLoginError('');
                        }}
                        className="px-2 py-0.5 rounded border border-black bg-white hover:bg-neutral-100 text-black font-mono text-[10px] font-bold cursor-pointer"
                      >
                        Login
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
            placeholder="Cari alat di Kaze Studio (Media Downloader, PDF, QR Code, Kompres...)"
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border-2 border-black bg-white text-black placeholder:text-neutral-500 text-xs sm:text-sm font-medium outline-none focus:ring-2 focus:ring-black transition-all shadow-[2px_2px_0px_#000000]"
          />
        </div>
        <button
          type="submit"
          className="px-5 py-2.5 rounded-lg border-2 border-black bg-black text-white font-extrabold text-xs sm:text-sm shadow-[2px_2px_0px_#000000] hover:bg-neutral-800 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer shrink-0"
        >
          Cari
        </button>
      </form>

      {/* ─── 3. SALURAN KOMUNITAS & MEDIA SOSIAL ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <a 
          href="https://whatsapp.com/channel/0029VbDfI32EAKWIfTviOv3I" 
          target="_blank" 
          rel="noopener noreferrer"
          className="w-full py-2.5 px-4 rounded-lg border-2 border-black bg-white hover:bg-neutral-50 text-black font-bold text-xs flex items-center justify-between shadow-[2px_2px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <MessageCircle className="w-4 h-4 stroke-[2.5]" />
            <span>Saluran WhatsApp</span>
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
            <span>@kazexy1 (TikTok)</span>
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
                <h3 className="font-extrabold text-sm sm:text-base">Login Admin Kaze</h3>
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
                  Kata Sandi Admin
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={adminPassword}
                    onChange={(e) => {
                      setAdminPassword(e.target.value);
                      setLoginError('');
                    }}
                    placeholder="Masukkan sandi admin..."
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
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isLoggingIn}
                  className="flex-1 py-2.5 rounded-lg border-2 border-black bg-black text-white hover:bg-neutral-800 disabled:opacity-50 font-bold text-xs shadow-[2px_2px_0px_#000000] cursor-pointer"
                >
                  {isLoggingIn ? 'Memeriksa...' : 'Masuk Admin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
