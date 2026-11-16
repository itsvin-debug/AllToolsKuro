import React, { useState, useEffect } from 'react';
import CosmicBackButton from './CosmicBackButton';
import { 
  Search, 
  UserCheck, 
  Lock, 
  Globe, 
  ExternalLink, 
  Copy, 
  Check, 
  RotateCcw, 
  ShieldCheck, 
  Radio, 
  Sparkles, 
  Heart, 
  Users, 
  UserPlus, 
  Video, 
  Share2, 
  EyeOff, 
  AlertCircle,
  ClipboardPaste,
  RefreshCw,
  Calendar
} from 'lucide-react';
import { translations } from '../utils/translations';

// Helper pemformat angka besar (misal 1250000 -> 1.25M)
function formatMetric(num) {
  if (num === null || num === undefined || isNaN(num)) return '0';
  const val = Number(num);
  if (val >= 1000000000) return (val / 1000000000).toFixed(1).replace(/\.0$/, '') + 'B';
  if (val >= 1000000) return (val / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (val >= 1000) return (val / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return val.toLocaleString('id-ID');
}

// Helper perender bio multi-baris dengan deteksi tautan otomatis
function renderBioWithLinks(text) {
  if (!text) return null;
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, idx) => {
    if (part.match(urlRegex)) {
      return (
        <a
          key={idx}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#f43f5e] hover:underline font-extrabold inline-flex items-center gap-0.5 break-all"
        >
          <span>{part}</span>
          <ExternalLink className="w-3 h-3 inline" />
        </a>
      );
    }
    return part;
  });
}

export default function TiktokStalkerScreen({ onBack, onShowToast, lang = 'id' }) {
  const isEn = lang === 'en';
  const t = translations[lang]?.tiktokStalker || translations.id.tiktokStalker;

  const [inputVal, setInputVal] = useState('');
  const [loading, setLoading] = useState(false);
  const [scanStep, setScanStep] = useState(0); // 0: connect, 1: fetch, 2: compile
  const [profileData, setProfileData] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedIntel, setCopiedIntel] = useState(false);

  // Efek teks pemindaian radar progresif
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

  const handleStalk = async (targetUsername) => {
    const raw = (targetUsername || inputVal).trim();
    if (!raw) {
      onShowToast?.(isEn ? 'Please enter a TikTok username or link.' : 'Masukkan username atau tautan TikTok.', 'warning');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setProfileData(null);

    try {
      // Panggil endpoint backend / tools / api
      const res = await fetch('/api/tools/tiktok-stalk', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ username: raw })
      });

      const rawText = await res.text();
      let json = null;
      try {
        json = JSON.parse(rawText);
      } catch (parseErr) {
        throw new Error(
          isEn 
            ? 'Backend server did not return valid JSON. Make sure the API server is running or check external API status.'
            : 'Server backend tidak merespons format JSON. Pastikan server API sudah berjalan atau API eksternal sedang gangguan.'
        );
      }

      if (!res.ok || json.status === 'error' || json.success === false) {
        throw new Error(json.message || t.errorNotFound);
      }

      setProfileData(json.data);
      onShowToast?.(isEn ? 'TikTok account intel loaded!' : 'Intel profil TikTok berhasil dimuat!', 'success');
    } catch (err) {
      setErrorMsg(err.message || t.errorNotFound);
      onShowToast?.(err.message || t.errorNotFound, 'error');
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
      const res = await fetch('/api/tools/tiktok-stalk', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ username: target, refresh: true })
      });

      const rawText = await res.text();
      let json = null;
      try {
        json = JSON.parse(rawText);
      } catch {
        throw new Error(isEn ? 'Failed to parse server response.' : 'Gagal membaca respons server.');
      }

      if (!res.ok || json.status === 'error' || json.success === false) {
        throw new Error(json.message || t.errorNotFound);
      }

      setProfileData(json.data);
      onShowToast?.(isEn ? 'Profile intel refreshed!' : 'Intel profil berhasil disegarkan!', 'success');
    } catch (err) {
      setErrorMsg(err.message || t.errorNotFound);
      onShowToast?.(err.message || t.errorNotFound, 'error');
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
    onShowToast?.(t.copiedSuccess, 'success');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyAllIntel = () => {
    if (!profileData) return;
    const stats = profileData.stats || {};
    const text = [
      `🎯 TIKTOK INTEL REPORT (KURO STUDIO)`,
      `Username: @${profileData.username}`,
      `Nama: ${profileData.nickname}`,
      `Status: ${profileData.verified ? 'Terverifikasi' : 'Reguler'} | ${profileData.privateAccount ? 'Privat' : 'Publik'}`,
      `Pengikut: ${stats.followers?.toLocaleString() || 0}`,
      `Mengikuti: ${stats.following?.toLocaleString() || 0}`,
      `Total Suka: ${stats.likes?.toLocaleString() || 0}`,
      `Total Video: ${stats.videos?.toLocaleString() || 0}`,
      `Bio: ${profileData.bio || '-'}`,
      `Tautan: ${profileData.profileUrl}`
    ].join('\n');

    navigator.clipboard.writeText(text);
    setCopiedIntel(true);
    onShowToast?.(isEn ? 'Full report copied to clipboard!' : 'Laporan lengkap disalin ke papan klip!', 'success');
    setTimeout(() => setCopiedIntel(false), 2000);
  };

  const scanStatusMessages = [
    t.radarInit,
    t.radarFetching,
    t.radarAnalyzing
  ];

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-6 md:py-8 space-y-6">
      {/* Header & Back Navigation */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <CosmicBackButton onBack={onBack} label={isEn ? 'Back' : 'Kembali'} />

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#10b981] text-black text-xs font-black uppercase tracking-wider border-2 border-black rounded-lg shadow-[2px_2px_0px_#000000]">
            <EyeOff className="w-3.5 h-3.5" />
            100% Anonymous
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#facc15] text-black text-xs font-black uppercase tracking-wider border-2 border-black rounded-lg shadow-[2px_2px_0px_#000000]">
            <ShieldCheck className="w-3.5 h-3.5" />
            Zero Footprint
          </span>
        </div>
      </div>

      {/* Main Title Banner */}
      <div className="bg-white border-2 border-black rounded-2xl p-6 shadow-[4px_4px_0px_#000000] relative overflow-hidden">
        <div className="flex items-start gap-4">
          <div className="p-3.5 bg-[#f43f5e] border-2 border-black rounded-xl shadow-[3px_3px_0px_#000000] text-white shrink-0">
            <Radio className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl md:text-3xl font-black text-black uppercase tracking-tight">
              {t.title}
            </h1>
            <p className="text-sm md:text-base font-semibold text-neutral-600">
              {t.subtitle}
            </p>
          </div>
        </div>
      </div>

      {/* Search & Input Card */}
      <div className="bg-white border-2 border-black rounded-2xl p-5 md:p-6 shadow-[4px_4px_0px_#000000] space-y-4">
        <form onSubmit={(e) => { e.preventDefault(); handleStalk(); }} className="space-y-3">
          <label className="block text-xs font-black tracking-wider uppercase text-neutral-800">
            {isEn ? 'Target TikTok Username or Profile URL' : 'Target Username atau Tautan Profil TikTok'}
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
                placeholder={t.inputPlaceholder}
                className="w-full pl-8 pr-11 py-3 bg-neutral-50 border-2 border-black rounded-xl font-bold text-sm md:text-base text-black placeholder-neutral-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#f43f5e] transition-all"
              />
              <button
                type="button"
                onClick={handlePaste}
                title={isEn ? 'Paste from clipboard' : 'Tempel dari papan klip'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-neutral-600 hover:text-black hover:bg-neutral-200 rounded-lg transition-colors"
              >
                <ClipboardPaste className="w-4 h-4" />
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="px-6 py-3 bg-[#f43f5e] hover:bg-[#e11d48] text-white font-black text-sm md:text-base border-2 border-black rounded-xl shadow-[3px_3px_0px_#000000] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0px_#000000] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed shrink-0"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>{t.stalking}</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  <span>{t.stalkBtn}</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Quick Target Chips */}
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs font-bold text-neutral-600">
          <span className="text-neutral-400">{isEn ? 'Quick try:' : 'Coba cepat:'}</span>
          {['@tiktok', '@khaby.lame', '@mrbeast', '@zachking'].map(username => (
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

      {/* Radar Scanning High-Craft State */}
      {loading && (
        <div className="bg-white border-2 border-black rounded-2xl p-8 shadow-[4px_4px_0px_#000000] text-center space-y-6">
          <div className="relative w-32 h-32 mx-auto flex items-center justify-center">
            {/* Concentric Radar Rings */}
            <div className="absolute inset-0 border-2 border-black/20 rounded-full animate-ping opacity-30" />
            <div className="absolute inset-2 border-2 border-black rounded-full bg-emerald-50" />
            <div className="absolute inset-6 border-2 border-dashed border-black/40 rounded-full" />
            <div className="absolute inset-10 border-2 border-black/60 rounded-full bg-emerald-100/50" />
            
            {/* Radar Sweeper Line */}
            <div className="absolute inset-0 rounded-full overflow-hidden">
              <div 
                className="w-full h-full origin-center animate-[spin_2s_linear_infinite]"
                style={{
                  background: 'conic-gradient(from 0deg, transparent 0deg, rgba(16, 185, 129, 0.4) 300deg, #10b981 360deg)'
                }}
              />
            </div>

            <Radio className="w-8 h-8 text-black relative z-10 animate-pulse" />
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-black text-black uppercase tracking-wide">
              {scanStatusMessages[scanStep]}
            </h3>
            <p className="text-xs font-bold text-neutral-500">
              {isEn ? 'Bypassing visitor logs • 100% hidden profile inspection' : 'Melewati log pengunjung • Pemeriksaan profil 100% tersembunyi'}
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
          {/* Main Profile Info Card */}
          <div className="bg-white border-2 border-black rounded-2xl p-6 shadow-[4px_4px_0px_#000000] space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
              {/* Profile Avatar HD */}
              <div className="relative">
                <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl border-2 border-black overflow-hidden shadow-[3px_3px_0px_#000000] bg-neutral-100 flex items-center justify-center shrink-0">
                  {profileData.avatar ? (
                    <img 
                      src={profileData.avatar.startsWith('http') ? `/api/tools/tiktok-avatar?url=${encodeURIComponent(profileData.avatar)}` : profileData.avatar} 
                      alt={profileData.nickname || profileData.username} 
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                      crossOrigin="anonymous"
                      onError={(e) => {
                        // Jika proxy gagal, coba URL avatar langsung dengan no-referrer
                        if (e.target.dataset.triedDirect !== 'true') {
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
                    className="w-full h-full items-center justify-center bg-gradient-to-tr from-[#f43f5e] to-[#fb7185] text-white text-3xl font-black uppercase"
                  >
                    {profileData.username?.slice(0, 2) || 'TT'}
                  </div>
                </div>

                {profileData.verified && (
                  <div 
                    title={t.verifiedBadge}
                    className="absolute -bottom-1 -right-1 p-1.5 bg-[#06b6d4] text-white border-2 border-black rounded-full shadow-[2px_2px_0px_#000000]"
                  >
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  </div>
                )}
              </div>

              {/* Title & Account Meta */}
              <div className="flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl sm:text-2xl font-black text-black">
                    {profileData.nickname || profileData.username}
                  </h2>
                  {profileData.verified && (
                    <span className="px-2 py-0.5 bg-[#06b6d4] text-white text-[10px] font-black uppercase border border-black rounded shadow-[1px_1px_0px_#000000]">
                      {t.verifiedBadge}
                    </span>
                  )}
                  {profileData.privateAccount ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-neutral-800 text-white text-[10px] font-black uppercase border border-black rounded shadow-[1px_1px_0px_#000000]">
                      <Lock className="w-3 h-3" />
                      {t.privateBadge}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#10b981] text-black text-[10px] font-black uppercase border border-black rounded shadow-[1px_1px_0px_#000000]">
                      <Globe className="w-3 h-3" />
                      {t.publicBadge}
                    </span>
                  )}
                </div>

                <div className="text-sm font-extrabold text-[#f43f5e]">
                  @{profileData.username}
                </div>

                {/* Region, SecUid & CreateDate Badges */}
                <div className="flex flex-wrap gap-2 text-xs font-bold text-neutral-600 pt-1">
                  {profileData.region && (
                    <span className="px-2.5 py-0.5 bg-neutral-100 border border-black rounded-lg">
                      Region: <span className="text-black uppercase">{profileData.region}</span>
                    </span>
                  )}
                  {profileData.createTime && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-neutral-100 border border-black rounded-lg">
                      <Calendar className="w-3 h-3 text-neutral-500" />
                      <span>{isEn ? 'Joined' : 'Bergabung'}: <span className="text-black font-semibold">{profileData.createTime}</span></span>
                    </span>
                  )}
                  {profileData.id && (
                    <span className="px-2.5 py-0.5 bg-neutral-100 border border-black rounded-lg">
                      ID: <span className="text-black font-mono">{profileData.id}</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Quick Profile External Link */}
              <div className="flex sm:flex-col gap-2 w-full sm:w-auto">
                <a
                  href={profileData.profileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 sm:flex-none px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-black border-2 border-black rounded-xl font-black text-xs shadow-[2px_2px_0px_#000000] hover:translate-x-[1px] hover:translate-y-[1px] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>{t.openTiktok}</span>
                </a>
                <button
                  type="button"
                  onClick={handleCopyProfileUrl}
                  className="flex-1 sm:flex-none px-4 py-2 bg-white hover:bg-neutral-50 text-black border-2 border-black rounded-xl font-black text-xs shadow-[2px_2px_0px_#000000] hover:translate-x-[1px] hover:translate-y-[1px] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedLink ? (isEn ? 'Copied!' : 'Tersalin!') : t.copyProfileUrl}</span>
                </button>
              </div>
            </div>

            {/* 5-Column Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 pt-2">
              <div className="bg-[#f0fdf4] border-2 border-black rounded-xl p-3.5 shadow-[2px_2px_0px_#000000] text-center space-y-1">
                <div className="flex items-center justify-center text-emerald-600 mb-1">
                  <Users className="w-4 h-4" />
                </div>
                <div className="text-lg sm:text-xl font-black text-black">
                  {formatMetric(profileData.stats?.followers)}
                </div>
                <div className="text-[11px] font-extrabold uppercase text-neutral-600">
                  {t.statFollowers}
                </div>
              </div>

              <div className="bg-[#eff6ff] border-2 border-black rounded-xl p-3.5 shadow-[2px_2px_0px_#000000] text-center space-y-1">
                <div className="flex items-center justify-center text-blue-600 mb-1">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div className="text-lg sm:text-xl font-black text-black">
                  {formatMetric(profileData.stats?.following)}
                </div>
                <div className="text-[11px] font-extrabold uppercase text-neutral-600">
                  {t.statFollowing}
                </div>
              </div>

              <div className="bg-[#fff1f2] border-2 border-black rounded-xl p-3.5 shadow-[2px_2px_0px_#000000] text-center space-y-1">
                <div className="flex items-center justify-center text-rose-600 mb-1">
                  <Heart className="w-4 h-4" />
                </div>
                <div className="text-lg sm:text-xl font-black text-black">
                  {formatMetric(profileData.stats?.likes)}
                </div>
                <div className="text-[11px] font-extrabold uppercase text-neutral-600">
                  {t.statLikes}
                </div>
              </div>

              <div className="bg-[#fefce8] border-2 border-black rounded-xl p-3.5 shadow-[2px_2px_0px_#000000] text-center space-y-1">
                <div className="flex items-center justify-center text-amber-600 mb-1">
                  <Video className="w-4 h-4" />
                </div>
                <div className="text-lg sm:text-xl font-black text-black">
                  {formatMetric(profileData.stats?.videos)}
                </div>
                <div className="text-[11px] font-extrabold uppercase text-neutral-600">
                  {t.statVideos}
                </div>
              </div>

              <div className="col-span-2 sm:col-span-1 bg-[#faf5ff] border-2 border-black rounded-xl p-3.5 shadow-[2px_2px_0px_#000000] text-center space-y-1">
                <div className="flex items-center justify-center text-purple-600 mb-1">
                  <UserCheck className="w-4 h-4" />
                </div>
                <div className="text-lg sm:text-xl font-black text-black">
                  {formatMetric(profileData.stats?.friends)}
                </div>
                <div className="text-[11px] font-extrabold uppercase text-neutral-600">
                  {t.statFriends}
                </div>
              </div>
            </div>

            {/* Bio & Description Card */}
            <div className="bg-neutral-50 border-2 border-black rounded-xl p-4 shadow-[2px_2px_0px_#000000] space-y-2">
              <div className="text-xs font-black uppercase tracking-wider text-neutral-500">
                {t.bioTitle}
              </div>
              <div className="text-sm md:text-base font-semibold text-neutral-900 whitespace-pre-line break-words leading-relaxed">
                {profileData.bio ? renderBioWithLinks(profileData.bio) : <span className="text-neutral-400 italic">{t.bioEmpty}</span>}
              </div>

              {/* Bio Link if available */}
              {profileData.bioLink && (
                <div className="pt-2 border-t border-neutral-200 flex items-center gap-2">
                  <span className="text-xs font-bold text-neutral-500">{t.bioLinkTitle}:</span>
                  <a
                    href={profileData.bioLink.startsWith('http') ? profileData.bioLink : `https://${profileData.bioLink}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-black text-[#f43f5e] hover:underline flex items-center gap-1"
                  >
                    <span>{profileData.bioLink}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>

            {/* Bottom Actions */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={handleCopyAllIntel}
                  className="flex-1 sm:flex-none px-5 py-2.5 bg-[#facc15] hover:bg-[#eab308] text-black font-black text-xs md:text-sm border-2 border-black rounded-xl shadow-[3px_3px_0px_#000000] hover:translate-x-[1px] hover:translate-y-[1px] transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {copiedIntel ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
                  <span>{copiedIntel ? (isEn ? 'Intel Copied!' : 'Intel Berhasil Disalin!') : (isEn ? 'Copy Full Intel Report' : 'Salin Laporan Intel Lengkap')}</span>
                </button>

                <button
                  type="button"
                  disabled={loading}
                  onClick={handleRefresh}
                  className="flex-1 sm:flex-none px-4 py-2.5 bg-neutral-100 hover:bg-neutral-200 text-black font-black text-xs md:text-sm border-2 border-black rounded-xl shadow-[3px_3px_0px_#000000] hover:translate-x-[1px] hover:translate-y-[1px] active:translate-x-[2px] active:translate-y-[2px] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  title={isEn ? 'Force refresh live data from TikTok' : 'Segarkan data live dari TikTok'}
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  <span>{isEn ? 'Refresh Data' : 'Segarkan Data'}</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  setInputVal('');
                  setProfileData(null);
                }}
                className="w-full sm:w-auto px-5 py-2.5 bg-white hover:bg-neutral-100 text-black font-black text-xs md:text-sm border-2 border-black rounded-xl shadow-[2px_2px_0px_#000000] hover:translate-x-[1px] hover:translate-y-[1px] transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>{isEn ? 'Scan Another Account' : 'Lacak Akun Lain'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
