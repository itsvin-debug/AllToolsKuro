import React, { useState, useEffect } from 'react';
import CosmicBackButton from '../CosmicBackButton';
import { InstagramLogo } from './BrandLogos';
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
  Image, 
  Share2, 
  EyeOff, 
  AlertCircle,
  ClipboardPaste,
  RefreshCw,
  Layers,
  Download,
  Sparkles,
  MessageCircle
} from 'lucide-react';

function formatMetric(num) {
  if (num === null || num === undefined || isNaN(num)) return '0';
  const val = Number(num);
  if (val >= 1000000000) return (val / 1000000000).toFixed(1).replace(/\.0$/, '') + 'B';
  if (val >= 1000000) return (val / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (val >= 1000) return (val / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return val.toLocaleString('id-ID');
}

function normalizeInstagramData(u) {
  if (!u) return null;
  const followers = Number(u.stats?.followers ?? u.followers ?? 0);
  const following = Number(u.stats?.following ?? u.following ?? 0);
  const posts = Number(u.stats?.posts ?? u.posts ?? 0);
  const recentMedia = Array.isArray(u.recentMedia) ? u.recentMedia : [];

  return {
    ...u,
    followers,
    following,
    posts,
    stats: {
      followers,
      following,
      posts
    },
    recentMedia
  };
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
          className="text-[#d946ef] underline font-bold hover:text-[#c026d3] break-all inline-flex items-center gap-0.5"
        >
          <span>{part}</span>
          <ExternalLink className="w-3 h-3 inline" />
        </a>
      );
    }
    return part;
  });
}

export default function InstagramStalkerView({ onBack, onChangePlatform, onShowToast, lang = 'id' }) {
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

  const handleStalk = async (targetUsername) => {
    const raw = (targetUsername || inputVal).trim();
    const cleanUsername = raw
      .replace(/^https?:\/\/(?:www\.)?instagram\.com\//i, '')
      .replace(/^@+/, '')
      .split('/')[0]
      .split('?')[0]
      .trim();

    if (!cleanUsername) {
      onShowToast?.(isEn ? 'Please enter an Instagram username or URL.' : 'Masukkan username atau tautan Instagram.', 'warning');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setProfileData(null);

    try {
      const res = await fetch('/api/stalk/instagram', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ username: cleanUsername })
      });

      const rawText = await res.text();
      let json = null;
      try {
        json = JSON.parse(rawText);
      } catch {
        throw new Error(isEn ? 'Server did not return valid JSON.' : 'Server tidak merespons JSON.');
      }

      if (!res.ok || json.status === 'error' || json.success === false) {
        throw new Error(json.message || (isEn ? 'Instagram profile not found.' : 'Profil Instagram tidak ditemukan.'));
      }

      setProfileData(normalizeInstagramData(json.data));
      onShowToast?.(isEn ? 'Instagram profile loaded!' : 'Intel profil Instagram berhasil dimuat!', 'success');
    } catch (err) {
      setErrorMsg(err.message || (isEn ? 'Failed to fetch Instagram profile.' : 'Gagal mengambil data profil Instagram.'));
      onShowToast?.(err.message || (isEn ? 'Failed to fetch Instagram profile.' : 'Gagal mengambil data profil Instagram.'), 'error');
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
      const res = await fetch('/api/stalk/instagram', {
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
        throw new Error(isEn ? 'Server did not return valid JSON.' : 'Gagal membaca respons server.');
      }

      if (!res.ok || json.status === 'error' || json.success === false) {
        throw new Error(json.message || (isEn ? 'Profile not found.' : 'Profil tidak ditemukan.'));
      }

      setProfileData(normalizeInstagramData(json.data));
      onShowToast?.(isEn ? 'Instagram profile refreshed!' : 'Profil Instagram berhasil disegarkan!', 'success');
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
    onShowToast?.(isEn ? 'Profile link copied!' : 'Tautan profil berhasil disalin!', 'success');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyAllIntel = () => {
    if (!profileData) return;
    const stats = profileData.stats || {};
    const followers = stats.followers ?? profileData.followers ?? 0;
    const following = stats.following ?? profileData.following ?? 0;
    const posts = stats.posts ?? profileData.posts ?? 0;

    const text = [
      `📸 INSTAGRAM INTEL REPORT (KURO STUDIO)`,
      `Username: @${profileData.username}`,
      `Nama: ${profileData.nickname}`,
      `Status: ${profileData.verified ? 'Terverifikasi' : 'Reguler'} | ${profileData.privateAccount ? 'Privat' : 'Publik'}`,
      `Pengikut: ${followers.toLocaleString('id-ID')}`,
      `Mengikuti: ${following.toLocaleString('id-ID')}`,
      `Total Post: ${posts.toLocaleString('id-ID')}`,
      `Bio: ${profileData.bio || '-'}`,
      `Tautan: ${profileData.profileUrl}`
    ].join('\n');

    navigator.clipboard.writeText(text);
    setCopiedIntel(true);
    onShowToast?.(isEn ? 'Full report copied to clipboard!' : 'Laporan lengkap disalin ke papan klip!', 'success');
    setTimeout(() => setCopiedIntel(false), 2000);
  };

  const scanStatusMessages = isEn ? [
    'Connecting to Instagram CDN & Graph nodes...',
    'Extracting public metadata, avatar & bio...',
    'Synthesizing Instagram OSINT telemetry...'
  ] : [
    'Menghubungkan ke Instagram CDN & Graph nodes...',
    'Mengekstrak metadata publik, foto avatar & bio...',
    'Menyusun telemetri intelijen akun Instagram...'
  ];

  return (
    <div className="w-full max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-8 space-y-4 sm:space-y-6">
      {/* Header & Back Navigation */}
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
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="p-2 sm:p-2.5 bg-neutral-900 border-2 border-black rounded-xl shadow-[3px_3px_0px_#000000] text-white shrink-0">
            <InstagramLogo className="w-7 h-7 sm:w-8 sm:h-8" />
          </div>
          <div className="space-y-1">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-black text-black uppercase tracking-tight">
              Instagram Profile Stalker
            </h1>
            <p className="text-xs sm:text-sm md:text-base font-semibold text-neutral-600 leading-relaxed">
              {isEn ? 'Inspect Instagram accounts, followers, posts, HD avatars, and privacy status 100% anonymously.' : 'Pantau akun Instagram, followers, foto profil HD, status privat & bio secara 100% anonim.'}
            </p>
          </div>
        </div>
      </div>

      {/* Search & Input Card */}
      <div className="bg-white border-2 border-black rounded-2xl p-4 sm:p-6 shadow-[4px_4px_0px_#000000] space-y-4">
        <form onSubmit={(e) => { e.preventDefault(); handleStalk(); }} className="space-y-3">
          <label className="block text-xs font-black tracking-wider uppercase text-neutral-800">
            {isEn ? 'Target Instagram Username or Profile URL' : 'Target Username atau Tautan Profil Instagram'}
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
                placeholder={isEn ? 'Enter Instagram username or link (e.g. @cristiano)...' : 'Masukkan username atau link Instagram (misal @cristiano)...'}
                className="w-full pl-8 pr-11 py-3 bg-neutral-50 border-2 border-black rounded-xl font-bold text-sm md:text-base text-black placeholder-neutral-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#d946ef] transition-all"
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
              className="px-6 py-3 bg-[#d946ef] hover:bg-[#c026d3] text-white font-black text-sm md:text-base border-2 border-black rounded-xl shadow-[3px_3px_0px_#000000] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0px_#000000] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed shrink-0"
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
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs font-bold text-neutral-600">
          <span className="text-neutral-400">{isEn ? 'Quick try:' : 'Coba cepat:'}</span>
          {['@instagram', '@cristiano', '@leomessi', '@nasa'].map(username => (
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
            <div className="absolute inset-0 border-2 border-black rounded-full bg-fuchsia-100 animate-ping opacity-25" />
            <div className="absolute inset-2 border-2 border-black rounded-full bg-fuchsia-50" />
            <div className="absolute inset-6 border-2 border-dashed border-black/40 rounded-full" />
            <div className="absolute inset-10 border-2 border-black/60 rounded-full bg-fuchsia-100/50" />
            
            <div className="absolute inset-0 rounded-full overflow-hidden">
              <div 
                className="w-full h-full origin-center animate-[spin_2s_linear_infinite]"
                style={{
                  background: 'conic-gradient(from 0deg, transparent 0deg, rgba(217, 70, 239, 0.4) 300deg, #d946ef 360deg)'
                }}
              />
            </div>

            <InstagramLogo className="w-8 h-8 relative z-10 animate-pulse" />
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
          <div className="bg-white border-2 border-black rounded-2xl p-4 sm:p-6 shadow-[4px_4px_0px_#000000] space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
              {/* Profile Avatar HD */}
              <div className="relative">
                <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl border-2 border-black overflow-hidden shadow-[3px_3px_0px_#000000] bg-neutral-100 flex items-center justify-center shrink-0">
                  {profileData.avatar ? (
                    <img 
                      src={profileData.avatar.startsWith('http') ? `/api/stalk/image-proxy?url=${encodeURIComponent(profileData.avatar)}` : profileData.avatar} 
                      alt={profileData.nickname || profileData.username} 
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                      crossOrigin="anonymous"
                      onError={(e) => {
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
                    className="w-full h-full items-center justify-center bg-gradient-to-tr from-[#d946ef] to-[#ec4899] text-white text-3xl font-black uppercase"
                  >
                    {profileData.username?.slice(0, 2) || 'IG'}
                  </div>
                </div>

                {profileData.verified && (
                  <div 
                    title={isEn ? 'Verified Account' : 'Akun Terverifikasi'}
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

                <div className="text-sm font-extrabold text-[#d946ef]">
                  @{profileData.username}
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex sm:flex-col gap-2 w-full sm:w-auto">
                <a
                  href={profileData.profileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 sm:flex-none px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-black border-2 border-black rounded-xl font-black text-xs shadow-[2px_2px_0px_#000000] hover:translate-x-[1px] hover:translate-y-[1px] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>{isEn ? 'Open Profile' : 'Buka Profil Instagram'}</span>
                </a>
                <button
                  type="button"
                  onClick={handleCopyProfileUrl}
                  className="flex-1 sm:flex-none px-4 py-2 bg-white hover:bg-neutral-50 text-black border-2 border-black rounded-xl font-black text-xs shadow-[2px_2px_0px_#000000] hover:translate-x-[1px] hover:translate-y-[1px] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedLink ? (isEn ? 'Copied!' : 'Tersalin!') : (isEn ? 'Copy URL' : 'Salin Tautan')}</span>
                </button>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-3 pt-2">
              <div className="bg-[#fdf4ff] border-2 border-black rounded-xl p-3.5 shadow-[2px_2px_0px_#000000] text-center space-y-1">
                <div className="flex items-center justify-center text-[#d946ef] mb-1">
                  <Users className="w-4 h-4" />
                </div>
                <div className="text-lg sm:text-xl font-black text-black">
                  {formatMetric(profileData.stats?.followers ?? profileData.followers)}
                </div>
                <div className="text-[11px] font-extrabold uppercase text-neutral-600">
                  {isEn ? 'Followers' : 'Pengikut'}
                </div>
              </div>

              <div className="bg-[#fdf4ff] border-2 border-black rounded-xl p-3.5 shadow-[2px_2px_0px_#000000] text-center space-y-1">
                <div className="flex items-center justify-center text-[#d946ef] mb-1">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div className="text-lg sm:text-xl font-black text-black">
                  {formatMetric(profileData.stats?.following ?? profileData.following)}
                </div>
                <div className="text-[11px] font-extrabold uppercase text-neutral-600">
                  {isEn ? 'Following' : 'Mengikuti'}
                </div>
              </div>

              <div className="bg-[#fdf4ff] border-2 border-black rounded-xl p-3.5 shadow-[2px_2px_0px_#000000] text-center space-y-1">
                <div className="flex items-center justify-center text-[#d946ef] mb-1">
                  <Image className="w-4 h-4" />
                </div>
                <div className="text-lg sm:text-xl font-black text-black">
                  {formatMetric(profileData.stats?.posts ?? profileData.posts)}
                </div>
                <div className="text-[11px] font-extrabold uppercase text-neutral-600">
                  {isEn ? 'Posts' : 'Postingan'}
                </div>
              </div>
            </div>

            {/* Private Account Notice Banner */}
            {profileData.privateAccount && (
              <div className="bg-amber-50 border-2 border-black rounded-xl p-4 shadow-[2px_2px_0px_#000000] flex items-start gap-3">
                <div className="p-2 bg-[#facc15] text-black border-2 border-black rounded-lg shrink-0">
                  <Lock className="w-4 h-4 stroke-[2.5]" />
                </div>
                <div className="space-y-0.5">
                  <h4 className="font-black text-black text-xs sm:text-sm uppercase tracking-wide">
                    {isEn ? 'Private Instagram Account' : 'Akun Instagram Bersifat Privat'}
                  </h4>
                  <p className="text-xs font-semibold text-neutral-600 leading-relaxed">
                    {isEn 
                      ? 'Follower, following, and post metrics are verified. Photos and media are locked by account privacy.'
                      : 'Metrik pengikut, mengikuti, dan total postingan berhasil diverifikasi. Foto dan media dikunci oleh setelan privasi pemilik akun.'}
                  </p>
                </div>
              </div>
            )}

            {/* Bio Section */}
            <div className="bg-neutral-50 border-2 border-black rounded-xl p-4 shadow-[2px_2px_0px_#000000] space-y-2">
              <div className="text-xs font-black uppercase text-neutral-500 tracking-wider">
                {isEn ? 'Bio / Profile Description' : 'Bio / Deskripsi Profil'}
              </div>
              <div className="text-sm font-semibold text-black whitespace-pre-line leading-relaxed">
                {profileData.bio ? renderBioWithLinks(profileData.bio) : (
                  <span className="italic text-neutral-400">
                    {isEn ? 'No bio description provided.' : 'Tidak ada bio yang dicantumkan.'}
                  </span>
                )}
              </div>
              {profileData.bioLink && (
                <div className="pt-2 border-t border-neutral-200">
                  <a
                    href={profileData.bioLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-[#d946ef] hover:underline break-all"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>{profileData.bioLink}</span>
                  </a>
                </div>
              )}
            </div>

            {/* Recent Public Posts Grid */}
            {!profileData.privateAccount && profileData.recentMedia && profileData.recentMedia.length > 0 && (
              <div className="bg-white border-2 border-black rounded-xl p-4 shadow-[2px_2px_0px_#000000] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-[#d946ef] text-white border-2 border-black rounded-lg">
                      <Image className="w-4 h-4 stroke-[2.5]" />
                    </div>
                    <div>
                      <h3 className="text-xs sm:text-sm font-black uppercase text-black tracking-wide">
                        {isEn ? 'Recent Media Posts' : 'Isi Postingan Terbaru'}
                      </h3>
                      <p className="text-[11px] font-bold text-neutral-500">
                        {isEn ? 'Latest public photos & reels' : 'Pratinjau foto & reels publik'}
                      </p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 bg-neutral-100 border-2 border-black rounded-lg text-[10px] sm:text-xs font-black text-black">
                    {profileData.recentMedia.length} {isEn ? 'Posts' : 'Postingan'}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
                  {profileData.recentMedia.map((m, idx) => (
                    <a
                      key={m.id || idx}
                      href={m.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group relative bg-neutral-100 border-2 border-black rounded-xl overflow-hidden shadow-[2px_2px_0px_#000000] hover:translate-x-[1px] hover:translate-y-[1px] transition-all aspect-square block cursor-pointer"
                    >
                      <img
                        src={m.displayUrl ? `/api/stalk/image-proxy?url=${encodeURIComponent(m.displayUrl)}` : ''}
                        alt={m.caption || `Post ${idx + 1}`}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        loading="lazy"
                        onError={(e) => {
                          if (m.displayUrl && e.target.dataset.triedDirect !== 'true') {
                            e.target.dataset.triedDirect = 'true';
                            e.target.src = m.displayUrl;
                          }
                        }}
                      />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 text-white font-black text-xs p-2">
                        <div className="flex items-center gap-1">
                          <Heart className="w-3.5 h-3.5 fill-current text-rose-400" />
                          <span>{formatMetric(m.likes)}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <MessageCircle className="w-3.5 h-3.5 fill-current text-neutral-200" />
                          <span>{formatMetric(m.comments)}</span>
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

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
                className="px-4 py-2 bg-[#d946ef] hover:bg-[#c026d3] text-white border-2 border-black rounded-xl font-black text-xs shadow-[2px_2px_0px_#000000] hover:translate-x-[1px] hover:translate-y-[1px] active:translate-x-[2px] active:translate-y-[2px] transition-all flex items-center gap-1.5 cursor-pointer"
              >
                {copiedIntel ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedIntel ? (isEn ? 'Report Copied!' : 'Laporan Tersalin!') : (isEn ? 'Copy Full Report' : 'Salin Laporan Lengkap')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
