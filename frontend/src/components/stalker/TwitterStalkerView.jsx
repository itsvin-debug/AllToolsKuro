import React, { useState, useEffect } from 'react';
import CosmicBackButton from '../CosmicBackButton';
import { TwitterXLogo } from './BrandLogos';
import { 
  Search, 
  Lock, 
  Globe, 
  ExternalLink, 
  Copy, 
  Check, 
  RotateCcw, 
  ShieldCheck, 
  Heart, 
  Users, 
  UserPlus, 
  MessageSquare, 
  Share2, 
  EyeOff, 
  AlertCircle,
  ClipboardPaste,
  RefreshCw,
  Layers,
  Download,
  Calendar,
  MapPin
} from 'lucide-react';

function extractCleanHandle(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let str = raw.trim();
  if (/^https?:\/\//i.test(str) || /(?:tiktok|instagram|twitter|x|github)\.com\//i.test(str)) {
    try {
      const urlObj = new URL(str.startsWith('http') ? str : `https://${str}`);
      const segments = urlObj.pathname.split('/').filter(Boolean);
      const ignored = ['p', 'reel', 'reels', 'stories', 'tv', 'explore', 'accounts', 'i', 'intent', 'search', 'home', 'video', 'photo'];
      const validSeg = segments.find(s => !ignored.includes(s.toLowerCase()));
      if (validSeg) str = validSeg;
    } catch (_) {}
  }
  str = str.replace(/^@+\s*/, '');
  str = str.split(/[\/\?\&#\s]/)[0];
  return str.replace(/[^a-zA-Z0-9_.-]/g, '').trim();
}

function formatMetric(num) {
  if (num === null || num === undefined || isNaN(num)) return '0';
  const val = Number(num);
  if (val >= 1000000000) return (val / 1000000000).toFixed(1).replace(/\.0$/, '') + 'B';
  if (val >= 1000000) return (val / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (val >= 1000) return (val / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return val.toLocaleString('id-ID');
}

function renderBioWithLinks(text) {
  if (!text) return null;
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);

  return parts.map((part, index) => {
    if (part.match(urlRegex)) {
      return (
        <a 
          key={index} 
          href={part} 
          target="_blank" 
          rel="noopener noreferrer" 
          className="text-[#0ea5e9] underline font-bold hover:text-[#0284c7] break-all inline-flex items-center gap-0.5"
        >
          <span>{part}</span>
          <ExternalLink className="w-3 h-3 inline" />
        </a>
      );
    }
    return part;
  });
}

export default function TwitterStalkerView({ onBack, onChangePlatform, onShowToast, lang = 'id' }) {
  const isEn = lang === 'en';

  const [inputVal, setInputVal] = useState('');
  const [loading, setLoading] = useState(false);
  const [scanStep, setScanStep] = useState(0);
  const [profileData, setProfileData] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedIntel, setCopiedIntel] = useState(false);

  useEffect(() => {
    let interval = null;
    if (loading) {
      setScanStep(0);
      interval = setInterval(() => {
        setScanStep(prev => (prev < 2 ? prev + 1 : prev));
      }, 700);
    } else {
      setScanStep(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [loading]);

  const fetchTwitterData = async (target, forceRefresh = false) => {
    const clean = extractCleanHandle(target);
    if (!clean) return null;

    // 1. Direct browser fetch ke api.fxtwitter.com (Sangat cepat, bebas blokir IP, batas 4s)
    const runFxTwitter = async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);
      try {
        const fxRes = await fetch(`https://api.fxtwitter.com/${encodeURIComponent(clean)}`, {
          headers: { 'Accept': 'application/json' },
          signal: ctrl.signal
        });
        const fxText = await fxRes.text();
        let fxJson = null;
        try { fxJson = JSON.parse(fxText); } catch { throw new Error('FxTwitter non-json'); }
        if (fxJson?.code === 200 && fxJson.user) {
          const u = fxJson.user;
          const followers = Number(u.followers ?? u.followers_count ?? 0);
          const following = Number(u.following ?? u.following_count ?? 0);
          const tweets = Number(u.tweets ?? u.tweets_count ?? 0);
          const likes = Number(u.likes ?? u.likes_count ?? 0);
          return {
            success: true,
            data: {
              username: u.screen_name || clean,
              nickname: u.name || clean,
              avatar: u.avatar_url ? u.avatar_url.replace('_normal.', '.') : '',
              banner: u.banner_url || '',
              bio: u.description || '',
              bioLink: u.website || null,
              verified: Boolean(u.verification?.verified || u.verified),
              privateAccount: Boolean(u.protected),
              joinedDate: u.joined ? new Date(u.joined).toLocaleDateString(isEn ? 'en-US' : 'id-ID', { month: 'short', year: 'numeric' }) : null,
              location: u.location || '',
              profileUrl: `https://x.com/${u.screen_name || clean}`,
              followers,
              following,
              tweets,
              likes,
              stats: {
                followers,
                following,
                tweets,
                likes
              }
            }
          };
        }
        throw new Error('FxTwitter empty');
      } finally {
        clearTimeout(timer);
      }
    };

    // 2. Fallback backend server (/api/stalk/twitter, batas waktu 15s)
    const runBackend = async () => {
      const backendCtrl = new AbortController();
      const bTimer = setTimeout(() => backendCtrl.abort(), 15000);
      try {
        const res = await fetch('/api/stalk/twitter', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ username: clean, refresh: forceRefresh }),
          signal: backendCtrl.signal
        });
        const ct = res.headers.get('content-type') || '';
        if (!ct.includes('application/json')) throw new Error('Backend non-json');
        const text = await res.text();
        let parsed = null;
        try { parsed = JSON.parse(text); } catch { throw new Error('Backend json parse failed'); }
        if (res.ok && parsed.success && parsed.data) {
          return parsed;
        }
        throw new Error(parsed?.message || 'Backend empty');
      } finally {
        clearTimeout(bTimer);
      }
    };

    // 3. Fallback vxtwitter (batas 3.5s)
    const runVxTwitter = async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 3500);
      try {
        const vxRes = await fetch(`https://api.vxtwitter.com/${encodeURIComponent(clean)}`, {
          headers: { 'Accept': 'application/json' },
          signal: ctrl.signal
        });
        const vxText = await vxRes.text();
        let vxJson = null;
        try { vxJson = JSON.parse(vxText); } catch { throw new Error('VxTwitter non-json'); }
        const sName = vxJson?.screen_name || vxJson?.user_screen_name;
        if (sName || vxJson?.name || vxJson?.user_name) {
          const rawAvatar = vxJson.profile_image_url || vxJson.user_profile_image_url || '';
          const avatarHd = rawAvatar ? rawAvatar.replace(/_normal(\.[a-zA-Z0-9]+)$/, '_400x400$1') : '';
          const followers = Number(vxJson.followers_count ?? vxJson.user_followers_count ?? 0);
          const following = Number(vxJson.following_count ?? vxJson.user_following_count ?? 0);
          const tweets = Number(vxJson.tweet_count ?? vxJson.user_statuses_count ?? 0);
          const likes = Number(vxJson.favourites_count ?? vxJson.user_favourites_count ?? 0);
          return {
            success: true,
            data: {
              username: sName || clean,
              nickname: vxJson.name || vxJson.user_name || sName || clean,
              avatar: avatarHd,
              banner: vxJson.banner_url || vxJson.user_banner_url || '',
              bio: vxJson.description || vxJson.user_description || vxJson.text || '',
              bioLink: null,
              verified: Boolean(vxJson.verified || vxJson.user_verified),
              privateAccount: Boolean(vxJson.protected),
              joinedDate: vxJson.created_at ? new Date(vxJson.created_at).toLocaleDateString(isEn ? 'en-US' : 'id-ID', { month: 'short', year: 'numeric' }) : null,
              location: vxJson.location || '',
              profileUrl: `https://x.com/${sName || clean}`,
              followers,
              following,
              tweets,
              likes,
              stats: {
                followers,
                following,
                tweets,
                likes
              }
            }
          };
        }
        throw new Error('VxTwitter empty');
      } finally {
        clearTimeout(timer);
      }
    };

    try {
      return await Promise.any([runFxTwitter(), runBackend(), runVxTwitter()]);
    } catch (_) {
      return null;
    }
  };

  const handleStalk = async (targetUsername) => {
    const raw = (targetUsername || inputVal).trim();
    if (!raw) {
      onShowToast?.(isEn ? 'Please enter an X (Twitter) username or link.' : 'Masukkan username atau tautan X (Twitter).', 'warning');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setProfileData(null);

    try {
      const json = await fetchTwitterData(raw, false);

      if (!json || !json.data) {
        throw new Error(isEn ? 'X (Twitter) profile not found.' : 'Profil X (Twitter) tidak ditemukan.');
      }

      setProfileData(json.data);
      onShowToast?.(isEn ? 'X (Twitter) profile loaded!' : 'Intel profil X berhasil dimuat!', 'success');
    } catch (err) {
      setErrorMsg(err.message || (isEn ? 'Failed to fetch X profile.' : 'Gagal mengambil data profil X.'));
      onShowToast?.(err.message || (isEn ? 'Failed to fetch X profile.' : 'Gagal mengambil data profil X.'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    const target = profileData?.username || inputVal.trim();
    if (!target) return;

    setLoading(true);
    setErrorMsg(null);

    try {
      const json = await fetchTwitterData(target, true);

      if (!json || !json.data) {
        throw new Error(isEn ? 'Failed to refresh profile.' : 'Gagal menyegarkan profil.');
      }

      setProfileData(json.data);
      onShowToast?.(isEn ? 'X profile refreshed!' : 'Profil X berhasil disegarkan!', 'success');
    } catch (err) {
      setErrorMsg(err.message || (isEn ? 'Failed to refresh profile.' : 'Gagal menyegarkan profil.'));
      onShowToast?.(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setInputVal(text.trim());
        onShowToast?.(isEn ? 'Link pasted!' : 'Tautan berhasil ditempel!', 'info');
      }
    } catch {
      onShowToast?.(isEn ? 'Failed to read clipboard.' : 'Gagal membaca papan klip.', 'warning');
    }
  };

  const handleCopyProfileUrl = () => {
    if (!profileData?.profileUrl) return;
    navigator.clipboard.writeText(profileData.profileUrl);
    setCopiedLink(true);
    onShowToast?.(isEn ? 'Profile URL copied!' : 'Tautan profil berhasil disalin!', 'success');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyAllIntel = () => {
    if (!profileData) return;
    const stats = profileData.stats || {};
    const text = [
      `🐦 X / TWITTER INTEL REPORT (KURO STUDIO)`,
      `Username: @${profileData.username}`,
      `Nama: ${profileData.nickname}`,
      `Status: ${profileData.verified ? 'Terverifikasi' : 'Reguler'} | ${profileData.privateAccount ? 'Privat' : 'Publik'}`,
      `Pengikut: ${(stats.followers ?? profileData.followers ?? 0).toLocaleString()}`,
      `Mengikuti: ${(stats.following ?? profileData.following ?? 0).toLocaleString()}`,
      `Total Tweet: ${(stats.tweets ?? profileData.tweets ?? 0).toLocaleString()}`,
      `Bergabung: ${profileData.joinedDate || '-'}`,
      `Lokasi: ${profileData.location || '-'}`,
      `Bio: ${profileData.bio || '-'}`,
      `Tautan: ${profileData.profileUrl}`
    ].join('\n');

    navigator.clipboard.writeText(text);
    setCopiedIntel(true);
    onShowToast?.(isEn ? 'Full report copied to clipboard!' : 'Laporan lengkap disalin ke papan klip!', 'success');
    setTimeout(() => setCopiedIntel(false), 2000);
  };

  const scanStatusMessages = isEn ? [
    'Connecting to X API & Syndication mirrors...',
    'Resolving user telemetry, tweets & verified badges...',
    'Synthesizing X / Twitter OSINT metrics...'
  ] : [
    'Menghubungkan ke node X / Twitter & mirror syndication...',
    'Mengekstrak telemetri profil, total tweet & badge...',
    'Menyusun analitik intelijen akun X (Twitter)...'
  ];

  return (
    <div className="w-full max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-8 space-y-4 sm:space-y-6">
      {/* Header & Back / Change Platform Navigation */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <CosmicBackButton onClick={onBack} onBack={onBack} label={isEn ? 'Back' : 'Kembali'} />
          {onChangePlatform && (
            <button
              type="button"
              onClick={onChangePlatform}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-neutral-100 hover:bg-neutral-200 border-2 border-black text-black font-bold text-xs sm:text-sm tracking-tight transition-all duration-150 shadow-[2px_2px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer"
              title={isEn ? 'Switch Platform' : 'Ganti Platform'}
            >
              <Layers className="w-4 h-4 stroke-[2.5]" />
              <span>{isEn ? 'Switch Platform' : 'Ganti Platform'}</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#10b981] text-black text-[11px] sm:text-xs font-black uppercase tracking-wider border-2 border-black rounded-lg shadow-[2px_2px_0px_#000000]">
            <EyeOff className="w-3.5 h-3.5" />
            100% Anonymous
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#facc15] text-black text-[11px] sm:text-xs font-black uppercase tracking-wider border-2 border-black rounded-lg shadow-[2px_2px_0px_#000000]">
            <ShieldCheck className="w-3.5 h-3.5" />
            Zero Footprint
          </span>
        </div>
      </div>

      {/* Main Title Banner */}
      <div className="bg-white border-2 border-black rounded-2xl p-4 sm:p-6 shadow-[4px_4px_0px_#000000] relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
          <div className="flex items-center gap-3 sm:block">
            <div className="w-11 h-11 sm:w-14 sm:h-14 bg-black border-2 border-black rounded-xl shadow-[3px_3px_0px_#000000] text-white shrink-0 flex items-center justify-center">
              <TwitterXLogo className="w-6 h-6 sm:w-7 sm:h-7" />
            </div>
            <h1 className="text-lg sm:text-2xl md:text-3xl font-black text-black uppercase tracking-tight sm:hidden leading-tight">
              X Profile Stalker
            </h1>
          </div>
          <div className="space-y-1">
            <h1 className="hidden sm:block text-2xl md:text-3xl font-black text-black uppercase tracking-tight">
              X / Twitter Profile Stalker
            </h1>
            <p className="text-xs sm:text-sm md:text-base font-semibold text-neutral-600 leading-relaxed">
              {isEn ? 'Inspect X accounts, followers, tweets, join dates, and HD profile photos without login.' : 'Lacak profil X, jumlah followers, tweet, tanggal bergabung, lokasi & bio secara anonim.'}
            </p>
          </div>
        </div>
      </div>

      {/* Search & Input Card */}
      <div className="bg-white border-2 border-black rounded-2xl p-4 sm:p-6 shadow-[4px_4px_0px_#000000] space-y-4">
        <form onSubmit={(e) => { e.preventDefault(); handleStalk(); }} className="space-y-3">
          <label className="block text-[11px] sm:text-xs font-black tracking-wider uppercase text-neutral-800">
            {isEn ? 'Target X / Twitter Username or URL' : 'Target Username atau Tautan Akun X (Twitter)'}
          </label>

          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500 font-bold">
                @
              </span>
              <input
                type="text"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                placeholder={isEn ? 'Enter X username (e.g. @elonmusk)...' : 'Masukkan username X (misal @elonmusk)...'}
                className="w-full pl-8 pr-11 py-3 bg-neutral-50 border-2 border-black rounded-xl font-bold text-sm md:text-base text-black placeholder-neutral-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#0ea5e9] transition-all"
              />
              <button
                type="button"
                onClick={handlePaste}
                title={isEn ? 'Paste from clipboard' : 'Tempel dari papan klip'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-neutral-600 hover:text-black hover:bg-neutral-200 rounded-lg transition-colors cursor-pointer"
              >
                <ClipboardPaste className="w-4 h-4" />
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="px-6 py-3 bg-black hover:bg-neutral-800 text-white font-black text-sm md:text-base border-2 border-black rounded-xl shadow-[3px_3px_0px_#000000] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0px_#000000] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed shrink-0"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>{isEn ? 'Scanning...' : 'Memindai...'}</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  <span>{isEn ? 'Inspect Profile' : 'Mulai Lacak Profil'}</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Quick Target Chips */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs font-bold text-neutral-600">
          <span className="text-neutral-400 mr-0.5">{isEn ? 'Quick try:' : 'Coba cepat:'}</span>
          {['@elonmusk', '@nasa', '@playstation', '@openai'].map(username => (
            <button
              key={username}
              type="button"
              onClick={() => {
                setInputVal(username);
                handleStalk(username);
              }}
              className="px-2.5 py-1 bg-neutral-100 hover:bg-neutral-200 border-2 border-black rounded-lg text-black font-extrabold shadow-[2px_2px_0px_#000000] hover:translate-x-[1px] hover:translate-y-[1px] active:translate-x-[2px] active:translate-y-[2px] transition-all cursor-pointer"
            >
              {username}
            </button>
          ))}
        </div>
      </div>

      {/* Search Radar Sweep State */}
      {loading && (
        <div className="bg-white border-2 border-black rounded-2xl p-8 shadow-[4px_4px_0px_#000000] text-center space-y-5">
          <div className="relative w-28 h-28 mx-auto flex items-center justify-center">
            <div className="absolute inset-0 border-2 border-black rounded-full bg-sky-100 animate-ping opacity-25" />
            <div className="absolute inset-2 border-2 border-black rounded-full bg-sky-50" />
            <div className="absolute inset-6 border-2 border-dashed border-black/40 rounded-full" />
            <div className="absolute inset-10 border-2 border-black/60 rounded-full bg-sky-100/50" />
            
            <div className="absolute inset-0 rounded-full overflow-hidden">
              <div 
                className="w-full h-full origin-center animate-[spin_2s_linear_infinite]"
                style={{
                  background: 'conic-gradient(from 0deg, transparent 0deg, rgba(14, 165, 233, 0.4) 300deg, #0ea5e9 360deg)'
                }}
              />
            </div>

            <TwitterXLogo className="w-8 h-8 relative z-10 animate-pulse text-black" />
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-black text-black uppercase tracking-wide">
              {scanStatusMessages[scanStep]}
            </h3>
            <p className="text-xs font-bold text-neutral-500">
              {isEn ? 'Bypassing visitor logs • 100% hidden profile reconnaissance' : 'Melewati log pengunjung • Pemeriksaan profil 100% tersembunyi'}
            </p>
          </div>
        </div>
      )}

      {/* Error Banner */}
      {errorMsg && !loading && (
        <div className="bg-red-50 border-2 border-black rounded-2xl p-5 shadow-[4px_4px_0px_#000000] flex items-start gap-3.5">
          <AlertCircle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="font-black text-red-900 text-sm md:text-base">
              {isEn ? 'Scan Interrupted' : 'Pemindaian Terkendala'}
            </h4>
            <p className="text-xs md:text-sm font-semibold text-red-700">
              {errorMsg}
            </p>
          </div>
        </div>
      )}

      {/* Profile Intel Dashboard */}
      {profileData && !loading && (
        <div className="space-y-5">
          <div className="bg-white border-2 border-black rounded-2xl overflow-hidden shadow-[4px_4px_0px_#000000]">
            {/* Banner Header Image */}
            {profileData.banner && (
              <div className="w-full h-28 sm:h-44 bg-neutral-200 border-b-2 border-black overflow-hidden relative">
                <img 
                  src={profileData.banner.startsWith('http') ? `/api/stalk/image-proxy?url=${encodeURIComponent(profileData.banner)}` : profileData.banner} 
                  alt="X Banner" 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                  crossOrigin="anonymous"
                  onError={(e) => {
                    e.target.style.display = 'none';
                  }}
                />
              </div>
            )}

            <div className="p-4 sm:p-6 space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
                {/* Profile Avatar HD */}
                <div className="relative">
                  <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl border-2 border-black overflow-hidden shadow-[3px_3px_0px_#000000] bg-neutral-100 flex items-center justify-center shrink-0">
                    {profileData.avatar ? (
                      <img 
                        src={profileData.avatar.startsWith('http') ? `https://wsrv.nl/?url=${encodeURIComponent(profileData.avatar)}&w=300&h=300&fit=cover` : profileData.avatar} 
                        alt={profileData.nickname || profileData.username} 
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                        crossOrigin="anonymous"
                        onError={(e) => {
                          if (e.target.dataset.triedProxy !== 'true') {
                            e.target.dataset.triedProxy = 'true';
                            e.target.src = `/api/stalk/image-proxy?url=${encodeURIComponent(profileData.avatar)}`;
                          } else if (e.target.dataset.triedDirect !== 'true') {
                            e.target.dataset.triedDirect = 'true';
                            e.target.src = profileData.avatar;
                          } else {
                            e.target.style.display = 'none';
                            if (e.target.nextSibling) {
                              e.target.nextSibling.style.display = 'flex';
                            }
                          }
                        }}
                      />
                    ) : null}
                    <div 
                      style={{ display: profileData.avatar ? 'none' : 'flex' }}
                      className="w-full h-full items-center justify-center bg-black text-white text-3xl font-black uppercase"
                    >
                      {profileData.username?.slice(0, 2) || 'X'}
                    </div>
                  </div>

                  {profileData.verified && (
                    <div 
                      title={isEn ? 'Verified Account' : 'Akun Terverifikasi'}
                      className="absolute -bottom-1 -right-1 p-1.5 bg-[#0ea5e9] text-white border-2 border-black rounded-full shadow-[2px_2px_0px_#000000]"
                    >
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </div>
                  )}
                </div>

                {/* Title & Account Meta */}
                <div className="flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl sm:text-2xl font-black text-black">
                      {profileData.nickname || profileData.username}
                    </h2>
                    {profileData.verified && (
                      <span className="px-2 py-0.5 bg-[#0ea5e9] text-white text-[10px] font-black uppercase border border-black rounded shadow-[1px_1px_0px_#000000]">
                        {isEn ? 'Verified' : 'Terverifikasi'}
                      </span>
                    )}
                    {profileData.privateAccount ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-neutral-800 text-white text-[10px] font-black uppercase border border-black rounded shadow-[1px_1px_0px_#000000]">
                        <Lock className="w-3 h-3" />
                        {isEn ? 'Private' : 'Privat'}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#10b981] text-black text-[10px] font-black uppercase border border-black rounded shadow-[1px_1px_0px_#000000]">
                        <Globe className="w-3 h-3" />
                        {isEn ? 'Public' : 'Publik'}
                      </span>
                    )}
                  </div>

                  <div className="text-sm font-extrabold text-[#0ea5e9]">
                    @{profileData.username}
                  </div>

                  {/* Joined Date & Location */}
                  <div className="flex flex-wrap gap-2 text-xs font-bold text-neutral-600 pt-0.5">
                    {profileData.joinedDate && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-neutral-100 border border-black rounded-lg">
                        <Calendar className="w-3 h-3 text-neutral-500" />
                        <span>{isEn ? 'Joined' : 'Bergabung'}: <span className="text-black font-semibold">{profileData.joinedDate}</span></span>
                      </span>
                    )}
                    {profileData.location && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-neutral-100 border border-black rounded-lg">
                        <MapPin className="w-3 h-3 text-neutral-500" />
                        <span>{profileData.location}</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="grid grid-cols-2 gap-2 w-full mt-3 sm:mt-0 sm:w-auto sm:flex sm:flex-col">
                  <a
                    href={profileData.profileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-black border-2 border-black rounded-xl font-black text-xs shadow-[2px_2px_0px_#000000] hover:translate-x-[1px] hover:translate-y-[1px] transition-all flex items-center justify-center gap-1.5 cursor-pointer text-center"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Open Profile' : 'Buka Profil X'}</span>
                  </a>
                  <button
                    type="button"
                    onClick={handleCopyProfileUrl}
                    className="px-4 py-2 bg-white hover:bg-neutral-50 text-black border-2 border-black rounded-xl font-black text-xs shadow-[2px_2px_0px_#000000] hover:translate-x-[1px] hover:translate-y-[1px] transition-all flex items-center justify-center gap-1.5 cursor-pointer text-center"
                  >
                    {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedLink ? (isEn ? 'Copied!' : 'Tersalin!') : (isEn ? 'Copy URL' : 'Salin Tautan')}</span>
                  </button>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-2.5 pt-2">
                <div className="bg-[#f0f9ff] border-2 border-black rounded-xl p-3.5 shadow-[2px_2px_0px_#000000] text-center space-y-1">
                  <div className="flex items-center justify-center text-[#0ea5e9] mb-1">
                    <Users className="w-4 h-4" />
                  </div>
                  <div className="text-lg sm:text-xl font-black text-black">
                    {formatMetric(profileData.stats?.followers ?? profileData.followers)}
                  </div>
                  <div className="text-[11px] font-extrabold uppercase text-neutral-600">
                    {isEn ? 'Followers' : 'Pengikut'}
                  </div>
                </div>

                <div className="bg-[#f0f9ff] border-2 border-black rounded-xl p-3.5 shadow-[2px_2px_0px_#000000] text-center space-y-1">
                  <div className="flex items-center justify-center text-[#0ea5e9] mb-1">
                    <UserPlus className="w-4 h-4" />
                  </div>
                  <div className="text-lg sm:text-xl font-black text-black">
                    {formatMetric(profileData.stats?.following ?? profileData.following)}
                  </div>
                  <div className="text-[11px] font-extrabold uppercase text-neutral-600">
                    {isEn ? 'Following' : 'Mengikuti'}
                  </div>
                </div>

                <div className="bg-[#f0f9ff] border-2 border-black rounded-xl p-3.5 shadow-[2px_2px_0px_#000000] text-center space-y-1">
                  <div className="flex items-center justify-center text-[#0ea5e9] mb-1">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  <div className="text-lg sm:text-xl font-black text-black">
                    {formatMetric(profileData.stats?.tweets ?? profileData.tweets)}
                  </div>
                  <div className="text-[11px] font-extrabold uppercase text-neutral-600">
                    {isEn ? 'Tweets' : 'Postingan'}
                  </div>
                </div>
              </div>

              {/* Bio Section */}
              <div className="bg-neutral-50 border-2 border-black rounded-xl p-4 shadow-[2px_2px_0px_#000000] space-y-2">
                <div className="text-xs font-black uppercase text-neutral-500 tracking-wider">
                  {isEn ? 'Bio / Profile Description' : 'Bio / Deskripsi Akun X'}
                </div>
                <div className="text-sm font-semibold text-black whitespace-pre-line leading-relaxed">
                  {profileData.bio ? renderBioWithLinks(profileData.bio) : (
                    <span className="italic text-neutral-400">
                      {isEn ? 'No bio description provided.' : 'Tidak ada bio yang dicantumkan.'}
                    </span>
                  )}
                </div>
              </div>

              {/* Refresh and Copy Intel Controls */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleRefresh}
                  className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 border-2 border-black rounded-xl font-black text-xs text-black shadow-[2px_2px_0px_#000000] hover:translate-x-[1px] hover:translate-y-[1px] active:translate-x-[2px] active:translate-y-[2px] transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>{isEn ? 'Refresh Data' : 'Segarkan Data'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopyAllIntel}
                  className="px-4 py-2 bg-black hover:bg-neutral-800 text-white border-2 border-black rounded-xl font-black text-xs shadow-[2px_2px_0px_#000000] hover:translate-x-[1px] hover:translate-y-[1px] active:translate-x-[2px] active:translate-y-[2px] transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedIntel ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedIntel ? (isEn ? 'Report Copied!' : 'Laporan Tersalin!') : (isEn ? 'Copy Full Report' : 'Salin Laporan Lengkap')}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
