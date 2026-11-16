import React, { useState } from 'react';
import CosmicBackButton from '../CosmicBackButton';
import { 
  Search, 
  Globe, 
  ExternalLink, 
  Copy, 
  Check, 
  RotateCcw, 
  ShieldCheck, 
  Star, 
  Users, 
  UserPlus, 
  BookOpen, 
  Share2, 
  EyeOff, 
  AlertCircle,
  ClipboardPaste,
  RefreshCw,
  Layers,
  Download,
  Calendar,
  MapPin,
  Building,
  Briefcase
} from 'lucide-react';

function GithubIcon({ className = "w-6 h-6", ...props }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
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
          className="text-[#10b981] underline font-bold hover:text-[#059669] break-all inline-flex items-center gap-0.5"
        >
          <span>{part}</span>
          <ExternalLink className="w-3 h-3 inline" />
        </a>
      );
    }
    return part;
  });
}

export default function GithubStalkerView({ onBack, onChangePlatform, onShowToast, lang = 'id' }) {
  const isEn = lang === 'en';

  const [inputVal, setInputVal] = useState('');
  const [loading, setLoading] = useState(false);
  const [profileData, setProfileData] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedIntel, setCopiedIntel] = useState(false);

  const handleStalk = async (targetUsername) => {
    const raw = (targetUsername || inputVal).trim();
    if (!raw) {
      onShowToast?.(isEn ? 'Please enter a GitHub username or link.' : 'Masukkan username atau tautan GitHub.', 'warning');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setProfileData(null);

    try {
      const res = await fetch('/api/stalk/github', {
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
      } catch {
        throw new Error(isEn ? 'Server did not return valid JSON.' : 'Server tidak merespons JSON.');
      }

      if (!res.ok || json.status === 'error' || json.success === false) {
        throw new Error(json.message || (isEn ? 'GitHub profile not found.' : 'Profil GitHub tidak ditemukan.'));
      }

      setProfileData(json.data);
      onShowToast?.(isEn ? 'GitHub intel loaded!' : 'Intel profil GitHub berhasil dimuat!', 'success');
    } catch (err) {
      setErrorMsg(err.message || (isEn ? 'Failed to fetch GitHub profile.' : 'Gagal memuat profil GitHub.'));
      onShowToast?.(err.message, 'error');
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
      const res = await fetch('/api/stalk/github', {
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
        throw new Error(json.message || (isEn ? 'GitHub profile not found.' : 'Profil GitHub tidak ditemukan.'));
      }

      setProfileData(json.data);
      onShowToast?.(isEn ? 'GitHub intel refreshed!' : 'Intel profil GitHub disegarkan!', 'success');
    } catch (err) {
      setErrorMsg(err.message);
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
        onShowToast?.(isEn ? 'Link pasted!' : 'Tautan ditempel!', 'info');
      }
    } catch {
      onShowToast?.(isEn ? 'Clipboard error.' : 'Gagal membaca papan klip.', 'warning');
    }
  };

  const handleCopyProfileUrl = () => {
    if (!profileData?.profileUrl) return;
    navigator.clipboard.writeText(profileData.profileUrl);
    setCopiedLink(true);
    onShowToast?.(isEn ? 'Profile link copied!' : 'Tautan profil disalin!', 'success');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyAllIntel = () => {
    if (!profileData) return;
    const text = [
      `🎯 GITHUB DEVELOPER REPORT (KURO STUDIO)`,
      `Username: @${profileData.username}`,
      `Nama: ${profileData.nickname}`,
      `Status: ${profileData.status}`,
      `Pengikut: ${profileData.followers?.toLocaleString() || 0}`,
      `Mengikuti: ${profileData.following?.toLocaleString() || 0}`,
      `Repositori Publik: ${profileData.publicRepos?.toLocaleString() || 0}`,
      `Total Bintang (Stars): ${profileData.totalStars?.toLocaleString() || 0}`,
      `Gist Publik: ${profileData.publicGists?.toLocaleString() || 0}`,
      `Perusahaan: ${profileData.company || '-'}`,
      `Lokasi: ${profileData.location || '-'}`,
      `Website / Blog: ${profileData.blog || '-'}`,
      `Bergabung: ${profileData.createTime || '-'}`,
      `Bio: ${profileData.bio || '-'}`,
      `Tautan: ${profileData.profileUrl}`
    ].join('\n');

    navigator.clipboard.writeText(text);
    setCopiedIntel(true);
    onShowToast?.(isEn ? 'Report copied to clipboard!' : 'Laporan lengkap disalin!', 'success');
    setTimeout(() => setCopiedIntel(false), 2000);
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-6 md:py-8 space-y-6">
      {/* Header & Back / Change Platform Navigation */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
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
          <div className="p-3.5 bg-[#10b981] border-2 border-black rounded-xl shadow-[3px_3px_0px_#000000] text-white shrink-0">
            <GithubIcon className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl md:text-3xl font-black text-black uppercase tracking-tight">
              GitHub Developer Stalker
            </h1>
            <p className="text-sm md:text-base font-semibold text-neutral-600">
              {isEn ? 'Analyze developer profiles, total stars, public repos, followers, and tech contributions.' : 'Analisis profil developer, total stars repositori, public repos, followers, dan bio GitHub.'}
            </p>
          </div>
        </div>
      </div>

      {/* Search & Input Card */}
      <div className="bg-white border-2 border-black rounded-2xl p-5 md:p-6 shadow-[4px_4px_0px_#000000] space-y-4">
        <form onSubmit={(e) => { e.preventDefault(); handleStalk(); }} className="space-y-3">
          <label className="block text-xs font-black tracking-wider uppercase text-neutral-800">
            {isEn ? 'Target GitHub Username or Profile URL' : 'Target Username atau Tautan Profil GitHub'}
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
                placeholder={isEn ? 'Enter GitHub username (e.g. @torvalds)...' : 'Masukkan username GitHub (misal @torvalds)...'}
                className="w-full pl-8 pr-11 py-3 bg-neutral-50 border-2 border-black rounded-xl font-bold text-sm md:text-base text-black placeholder-neutral-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#10b981] transition-all"
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
              className="px-6 py-3 bg-[#10b981] hover:bg-[#059669] text-white font-black text-sm md:text-base border-2 border-black rounded-xl shadow-[3px_3px_0px_#000000] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0px_#000000] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed shrink-0"
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
          {['@torvalds', '@shadcn', '@vercel', '@facebook'].map(username => (
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
          <div className="bg-white border-2 border-black rounded-2xl p-6 shadow-[4px_4px_0px_#000000] space-y-6">
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
                          if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex';
                        }
                      }}
                    />
                  ) : null}
                  <div 
                    style={{ display: profileData.avatar ? 'none' : 'flex' }}
                    className="w-full h-full items-center justify-center bg-black text-white text-3xl font-black uppercase"
                  >
                    {profileData.username?.slice(0, 2) || 'GH'}
                  </div>
                </div>
              </div>

              {/* Title & Account Meta */}
              <div className="flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl sm:text-2xl font-black text-black">
                    {profileData.nickname || profileData.username}
                  </h2>
                  <span className="px-2 py-0.5 bg-[#10b981] text-black text-[10px] font-black uppercase border border-black rounded shadow-[1px_1px_0px_#000000]">
                    {profileData.status || 'Public Developer'}
                  </span>
                </div>

                <div className="text-sm font-extrabold text-[#10b981]">
                  @{profileData.username}
                </div>

                {/* Company, Location & Joined Badges */}
                <div className="flex flex-wrap gap-2 text-xs font-bold text-neutral-600 pt-1">
                  {profileData.company && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-neutral-100 border border-black rounded-lg">
                      <Building className="w-3 h-3 text-neutral-500" />
                      <span className="text-black font-semibold">{profileData.company}</span>
                    </span>
                  )}
                  {profileData.location && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-neutral-100 border border-black rounded-lg">
                      <MapPin className="w-3 h-3 text-neutral-500" />
                      <span className="text-black">{profileData.location}</span>
                    </span>
                  )}
                  {profileData.createTime && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-neutral-100 border border-black rounded-lg">
                      <Calendar className="w-3 h-3 text-neutral-500" />
                      <span>{isEn ? 'Joined' : 'Bergabung'}: <span className="text-black">{profileData.createTime}</span></span>
                    </span>
                  )}
                </div>
              </div>

              {/* External Link & Copy */}
              <div className="flex sm:flex-col gap-2 w-full sm:w-auto">
                <a
                  href={profileData.profileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 sm:flex-none px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-black border-2 border-black rounded-xl font-black text-xs shadow-[2px_2px_0px_#000000] hover:translate-x-[1px] hover:translate-y-[1px] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>{isEn ? 'Open GitHub' : 'Buka GitHub'}</span>
                </a>
                <button
                  type="button"
                  onClick={handleCopyProfileUrl}
                  className="flex-1 sm:flex-none px-4 py-2 bg-white hover:bg-neutral-50 text-black border-2 border-black rounded-xl font-black text-xs shadow-[2px_2px_0px_#000000] hover:translate-x-[1px] hover:translate-y-[1px] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedLink ? (isEn ? 'Copied!' : 'Tersalin!') : (isEn ? 'Copy Link' : 'Salin Tautan')}</span>
                </button>
              </div>
            </div>

            {/* 4-Column Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="bg-[#f0fdf4] border-2 border-black rounded-xl p-3.5 shadow-[2px_2px_0px_#000000] text-center space-y-1">
                <div className="flex items-center justify-center text-emerald-600 mb-1">
                  <Users className="w-4 h-4" />
                </div>
                <div className="text-lg sm:text-2xl font-black text-black">
                  {formatMetric(profileData.followers)}
                </div>
                <div className="text-[11px] font-extrabold uppercase text-neutral-600">
                  {isEn ? 'Followers' : 'Pengikut'}
                </div>
              </div>

              <div className="bg-[#eff6ff] border-2 border-black rounded-xl p-3.5 shadow-[2px_2px_0px_#000000] text-center space-y-1">
                <div className="flex items-center justify-center text-blue-600 mb-1">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div className="text-lg sm:text-2xl font-black text-black">
                  {formatMetric(profileData.following)}
                </div>
                <div className="text-[11px] font-extrabold uppercase text-neutral-600">
                  {isEn ? 'Following' : 'Mengikuti'}
                </div>
              </div>

              <div className="bg-[#fefce8] border-2 border-black rounded-xl p-3.5 shadow-[2px_2px_0px_#000000] text-center space-y-1">
                <div className="flex items-center justify-center text-amber-600 mb-1">
                  <BookOpen className="w-4 h-4" />
                </div>
                <div className="text-lg sm:text-2xl font-black text-black">
                  {formatMetric(profileData.publicRepos)}
                </div>
                <div className="text-[11px] font-extrabold uppercase text-neutral-600">
                  {isEn ? 'Public Repos' : 'Repositori Publik'}
                </div>
              </div>

              <div className="bg-[#fff1f2] border-2 border-black rounded-xl p-3.5 shadow-[2px_2px_0px_#000000] text-center space-y-1">
                <div className="flex items-center justify-center text-rose-600 mb-1">
                  <Star className="w-4 h-4 fill-rose-600" />
                </div>
                <div className="text-lg sm:text-2xl font-black text-black">
                  {formatMetric(profileData.totalStars)}
                </div>
                <div className="text-[11px] font-extrabold uppercase text-neutral-600">
                  {isEn ? 'Total Stars' : 'Total Bintang (Stars)'}
                </div>
              </div>
            </div>

            {/* Bio & Description Card */}
            <div className="bg-neutral-50 border-2 border-black rounded-xl p-4 shadow-[2px_2px_0px_#000000] space-y-2">
              <div className="text-xs font-black uppercase tracking-wider text-neutral-500">
                {isEn ? 'Bio / Description' : 'Bio / Deskripsi'}
              </div>
              <div className="text-sm md:text-base font-semibold text-neutral-900 whitespace-pre-line break-words leading-relaxed">
                {profileData.bio ? renderBioWithLinks(profileData.bio) : <span className="text-neutral-400 italic">{isEn ? 'No bio provided.' : 'Tidak ada bio yang dicantumkan.'}</span>}
              </div>

              {profileData.blog && (
                <div className="pt-2 border-t border-neutral-200 flex items-center gap-2">
                  <span className="text-xs font-bold text-neutral-500">{isEn ? 'Website' : 'Situs Web'}:</span>
                  <a
                    href={profileData.blog.startsWith('http') ? profileData.blog : `https://${profileData.blog}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-black text-[#10b981] hover:underline flex items-center gap-1"
                  >
                    <span>{profileData.blog}</span>
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

                {profileData.avatar && (
                  <a
                    href={`/api/stalk/image-proxy?url=${encodeURIComponent(profileData.avatar)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={`github_${profileData.username}_avatar.jpg`}
                    className="flex-1 sm:flex-none px-4 py-2.5 bg-white hover:bg-neutral-50 text-black font-black text-xs md:text-sm border-2 border-black rounded-xl shadow-[2px_2px_0px_#000000] hover:translate-x-[1px] hover:translate-y-[1px] transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>{isEn ? 'Download HD Avatar' : 'Unduh Foto Profil HD'}</span>
                  </a>
                )}

                <button
                  type="button"
                  disabled={loading}
                  onClick={handleRefresh}
                  className="flex-1 sm:flex-none px-4 py-2.5 bg-neutral-100 hover:bg-neutral-200 text-black font-black text-xs md:text-sm border-2 border-black rounded-xl shadow-[3px_3px_0px_#000000] hover:translate-x-[1px] hover:translate-y-[1px] active:translate-x-[2px] active:translate-y-[2px] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  title={isEn ? 'Force refresh live data' : 'Segarkan data live'}
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
