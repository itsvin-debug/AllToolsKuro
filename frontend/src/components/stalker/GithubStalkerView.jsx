import React, { useState, useEffect } from 'react';
import CosmicBackButton from '../CosmicBackButton';
import { GitHubLogo } from './BrandLogos';
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
  Briefcase,
  GitBranch,
  GitFork
} from 'lucide-react';

const LANGUAGE_COLORS = {
  JavaScript: '#f1e05a',
  TypeScript: '#3178c6',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Python: '#3572A5',
  Java: '#b07219',
  Go: '#00ADD8',
  Rust: '#dea584',
  C: '#555555',
  'C++': '#f34b7d',
  'C#': '#178600',
  PHP: '#4F5D95',
  Ruby: '#701516',
  Dart: '#00B4AB',
  Kotlin: '#A97BFF',
  Swift: '#F05138',
  Shell: '#89e051',
  Vue: '#41b883',
  Svelte: '#ff3e00'
};

function getLanguageColor(lang) {
  return LANGUAGE_COLORS[lang] || '#8b949e';
}

function formatMetric(num) {
  if (num === null || num === undefined || isNaN(num)) return '0';
  const val = Number(num);
  if (val >= 1000000000) return (val / 1000000000).toFixed(1).replace(/\.0$/, '') + 'B';
  if (val >= 1000000) return (val / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (val >= 1000) return (val / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return val.toLocaleString('id-ID');
}

function formatDate(isoString) {
  if (!isoString) return null;
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return null;
  }
}

function normalizeGithubData(u, repos = []) {
  if (!u) return null;
  const followers = Number(u.stats?.followers ?? u.followers ?? 0);
  const following = Number(u.stats?.following ?? u.following ?? 0);
  const publicRepos = Number(u.stats?.publicRepos ?? u.public_repos ?? u.publicRepos ?? 0);
  const totalStars = Number(u.stats?.totalStars ?? u.totalStars ?? (Array.isArray(repos) ? repos.reduce((acc, r) => acc + (r.stargazers_count || r.stars || 0), 0) : 0));
  const publicGists = Number(u.stats?.publicGists ?? u.public_gists ?? u.publicGists ?? 0);

  const reposList = Array.isArray(u.reposList) && u.reposList.length > 0 
    ? u.reposList 
    : (Array.isArray(repos) ? repos.slice(0, 12).map(r => ({
        name: r.name,
        description: r.description || '',
        language: r.language || '',
        stars: Number(r.stargazers_count || r.stars || 0),
        forks: Number(r.forks_count || r.forks || 0),
        url: r.html_url || r.url || `https://github.com/${u.login || u.username}/${r.name}`,
        isFork: Boolean(r.fork || r.isFork)
      })) : []);

  const created = u.createdAt || u.createTime || formatDate(u.created_at);

  return {
    username: u.login || u.username,
    nickname: u.name || u.nickname || u.login || u.username,
    avatar: u.avatar_url || u.avatar || '',
    bio: u.bio || '',
    status: u.hireable ? 'Hireable' : (u.status || 'Public Developer'),
    followers,
    following,
    publicRepos,
    totalStars,
    publicGists,
    stats: {
      followers,
      following,
      publicRepos,
      totalStars,
      publicGists
    },
    reposList,
    location: u.location || '',
    company: u.company || '',
    blog: u.blog ? (u.blog.startsWith('http') ? u.blog : `https://${u.blog}`) : '',
    createdAt: created,
    createTime: created,
    profileUrl: u.html_url || u.profileUrl || `https://github.com/${u.login || u.username}`
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
      .replace(/^https?:\/\/(?:www\.)?github\.com\//i, '')
      .replace(/^@+/, '')
      .split('/')[0]
      .split('?')[0]
      .trim();

    if (!cleanUsername) {
      onShowToast?.(isEn ? 'Please enter a GitHub username or link.' : 'Masukkan username atau tautan GitHub.', 'warning');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setProfileData(null);

    try {
      let resolvedData = null;

      // 1. Prioritas: Direct Client-Side Fetch (Membypass rate limit Vercel IP pool)
      try {
        const userRes = await fetch(`https://api.github.com/users/${encodeURIComponent(cleanUsername)}`, {
          headers: { 'Accept': 'application/vnd.github.v3+json' }
        });

        if (userRes.status === 404) {
          throw new Error(isEn ? `GitHub user @${cleanUsername} not found.` : `Akun GitHub @${cleanUsername} tidak ditemukan.`);
        }

        if (userRes.ok) {
          const userData = await userRes.json();
          let reposData = [];
          try {
            const reposRes = await fetch(`https://api.github.com/users/${encodeURIComponent(cleanUsername)}/repos?per_page=100&sort=pushed`, {
              headers: { 'Accept': 'application/vnd.github.v3+json' }
            });
            if (reposRes.ok) {
              reposData = await reposRes.json();
            }
          } catch (_) {}

          resolvedData = normalizeGithubData(userData, reposData);
        }
      } catch (clientErr) {
        if (clientErr.message?.includes('not found') || clientErr.message?.includes('tidak ditemukan')) {
          throw clientErr;
        }
      }

      // 2. Fallback: Backend Scraper API jika direct fetch terkendala
      if (!resolvedData) {
        const res = await fetch('/api/stalk/github', {
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
          throw new Error(json.message || (isEn ? 'GitHub developer profile not found.' : 'Profil developer GitHub tidak ditemukan.'));
        }

        resolvedData = normalizeGithubData(json.data);
      }

      if (!resolvedData) {
        throw new Error(isEn ? 'Could not load profile data.' : 'Data profil tidak dapat dimuat.');
      }

      setProfileData(resolvedData);
      onShowToast?.(isEn ? 'GitHub profile loaded!' : 'Intel profil GitHub berhasil dimuat!', 'success');
    } catch (err) {
      setErrorMsg(err.message || (isEn ? 'Failed to fetch GitHub profile.' : 'Gagal mengambil data profil GitHub.'));
      onShowToast?.(err.message || (isEn ? 'Failed to fetch GitHub profile.' : 'Gagal mengambil data profil GitHub.'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    const target = profileData?.username || inputVal.trim();
    if (!target) return;
    await handleStalk(target);
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
    const text = [
      `🐙 GITHUB INTEL REPORT (KURO STUDIO)`,
      `Username: @${profileData.username}`,
      `Nama: ${profileData.nickname}`,
      `Total Stars: ${stats.totalStars?.toLocaleString() || 0}`,
      `Public Repos: ${stats.publicRepos || 0}`,
      `Followers: ${stats.followers?.toLocaleString() || 0}`,
      `Following: ${stats.following?.toLocaleString() || 0}`,
      `Company: ${profileData.company || '-'}`,
      `Lokasi: ${profileData.location || '-'}`,
      `Website: ${profileData.blog || '-'}`,
      `Bio: ${profileData.bio || '-'}`,
      `Tautan: ${profileData.profileUrl}`
    ].join('\n');

    navigator.clipboard.writeText(text);
    setCopiedIntel(true);
    onShowToast?.(isEn ? 'Report copied to clipboard!' : 'Laporan lengkap disalin!', 'success');
    setTimeout(() => setCopiedIntel(false), 2000);
  };

  const scanStatusMessages = isEn ? [
    'Connecting to GitHub REST & GraphQL API mirrors...',
    'Aggregating public repositories, total stars & metrics...',
    'Synthesizing open-source developer telemetry...'
  ] : [
    'Menghubungkan ke API publik & mirror GitHub...',
    'Menghitung total stars repositori & riwayat commit...',
    'Menyusun telemetri developer open-source...'
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
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="p-2.5 sm:p-3.5 bg-[#24292f] border-2 border-black rounded-xl shadow-[3px_3px_0px_#000000] text-white shrink-0">
            <GitHubLogo className="w-6 h-6 sm:w-7 sm:h-7" />
          </div>
          <div className="space-y-1">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-black text-black uppercase tracking-tight">
              GitHub Developer Stalker
            </h1>
            <p className="text-xs sm:text-sm md:text-base font-semibold text-neutral-600 leading-relaxed">
              {isEn ? 'Analyze developer profiles, total stars, public repos, followers, and tech contributions.' : 'Analisis profil developer, total stars repositori, public repos, followers, dan bio GitHub.'}
            </p>
          </div>
        </div>
      </div>

      {/* Search & Input Card */}
      <div className="bg-white border-2 border-black rounded-2xl p-4 sm:p-6 shadow-[4px_4px_0px_#000000] space-y-4">
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

      {/* Search Radar Sweep State */}
      {loading && (
        <div className="bg-white border-2 border-black rounded-2xl p-8 shadow-[4px_4px_0px_#000000] text-center space-y-5">
          <div className="relative w-28 h-28 mx-auto flex items-center justify-center">
            <div className="absolute inset-0 border-2 border-black rounded-full bg-emerald-100 animate-ping opacity-25" />
            <div className="absolute inset-2 border-2 border-black rounded-full bg-emerald-50" />
            <div className="absolute inset-6 border-2 border-dashed border-black/40 rounded-full" />
            <div className="absolute inset-10 border-2 border-black/60 rounded-full bg-emerald-100/50" />
            
            <div className="absolute inset-0 rounded-full overflow-hidden">
              <div 
                className="w-full h-full origin-center animate-[spin_2s_linear_infinite]"
                style={{
                  background: 'conic-gradient(from 0deg, transparent 0deg, rgba(16, 185, 129, 0.4) 300deg, #10b981 360deg)'
                }}
              />
            </div>

            <GitHubLogo className="w-8 h-8 relative z-10 animate-pulse text-black" />
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-black text-black uppercase tracking-wide">
              {scanStatusMessages[scanStep]}
            </h3>
            <p className="text-xs font-bold text-neutral-500">
              {isEn ? 'Querying GitHub GraphQL & REST API • 100% anonymous' : 'Memindai node publik GitHub API • 100% anonim'}
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
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl border-2 border-black overflow-hidden shadow-[3px_3px_0px_#000000] bg-neutral-100 flex items-center justify-center shrink-0">
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
                    className="w-full h-full items-center justify-center bg-black text-white text-3xl font-black uppercase"
                  >
                    {profileData.username?.slice(0, 2) || 'GH'}
                  </div>
                </div>
              </div>

              {/* Title & Account Meta */}
              <div className="flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl sm:text-2xl font-black text-black">
                    {profileData.nickname || profileData.username}
                  </h2>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#10b981] text-black text-[10px] font-black uppercase border border-black rounded shadow-[1px_1px_0px_#000000]">
                    <Globe className="w-3 h-3" />
                    {isEn ? 'Public' : 'Publik'}
                  </span>
                </div>

                <div className="text-sm font-extrabold text-[#10b981]">
                  @{profileData.username}
                </div>

                {/* Company, Location & Joined */}
                <div className="flex flex-wrap gap-2 text-xs font-bold text-neutral-600 pt-0.5">
                  {profileData.company && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-neutral-100 border border-black rounded-lg">
                      <Building className="w-3 h-3 text-neutral-500" />
                      <span>{profileData.company}</span>
                    </span>
                  )}
                  {profileData.location && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-neutral-100 border border-black rounded-lg">
                      <MapPin className="w-3 h-3 text-neutral-500" />
                      <span>{profileData.location}</span>
                    </span>
                  )}
                  {profileData.createdAt && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-neutral-100 border border-black rounded-lg">
                      <Calendar className="w-3 h-3 text-neutral-500" />
                      <span>{isEn ? 'Joined' : 'Bergabung'}: <span className="text-black font-semibold">{profileData.createdAt}</span></span>
                    </span>
                  )}
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
                  <span>{isEn ? 'Open Profile' : 'Buka Profil GitHub'}</span>
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

            {/* 4-Column Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="bg-[#f0fdf4] border-2 border-black rounded-xl p-3.5 shadow-[2px_2px_0px_#000000] text-center space-y-1">
                <div className="flex items-center justify-center text-[#eab308] mb-1">
                  <Star className="w-4 h-4 fill-current" />
                </div>
                <div className="text-lg sm:text-xl font-black text-black">
                  {formatMetric(profileData.stats?.totalStars)}
                </div>
                <div className="text-[11px] font-extrabold uppercase text-neutral-600">
                  {isEn ? 'Total Stars' : 'Total Stars'}
                </div>
              </div>

              <div className="bg-[#f0fdf4] border-2 border-black rounded-xl p-3.5 shadow-[2px_2px_0px_#000000] text-center space-y-1">
                <div className="flex items-center justify-center text-[#10b981] mb-1">
                  <BookOpen className="w-4 h-4" />
                </div>
                <div className="text-lg sm:text-xl font-black text-black">
                  {formatMetric(profileData.stats?.publicRepos)}
                </div>
                <div className="text-[11px] font-extrabold uppercase text-neutral-600">
                  {isEn ? 'Public Repos' : 'Repositori'}
                </div>
              </div>

              <div className="bg-[#f0fdf4] border-2 border-black rounded-xl p-3.5 shadow-[2px_2px_0px_#000000] text-center space-y-1">
                <div className="flex items-center justify-center text-[#10b981] mb-1">
                  <Users className="w-4 h-4" />
                </div>
                <div className="text-lg sm:text-xl font-black text-black">
                  {formatMetric(profileData.stats?.followers)}
                </div>
                <div className="text-[11px] font-extrabold uppercase text-neutral-600">
                  {isEn ? 'Followers' : 'Pengikut'}
                </div>
              </div>

              <div className="bg-[#f0fdf4] border-2 border-black rounded-xl p-3.5 shadow-[2px_2px_0px_#000000] text-center space-y-1">
                <div className="flex items-center justify-center text-[#10b981] mb-1">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div className="text-lg sm:text-xl font-black text-black">
                  {formatMetric(profileData.stats?.following)}
                </div>
                <div className="text-[11px] font-extrabold uppercase text-neutral-600">
                  {isEn ? 'Following' : 'Mengikuti'}
                </div>
              </div>
            </div>

            {/* Bio & Blog Section */}
            <div className="bg-neutral-50 border-2 border-black rounded-xl p-4 shadow-[2px_2px_0px_#000000] space-y-2">
              <div className="text-xs font-black uppercase text-neutral-500 tracking-wider">
                {isEn ? 'Developer Bio' : 'Bio Developer'}
              </div>
              <div className="text-sm font-semibold text-black whitespace-pre-line leading-relaxed">
                {profileData.bio ? renderBioWithLinks(profileData.bio) : (
                  <span className="italic text-neutral-400">
                    {isEn ? 'No bio description provided.' : 'Tidak ada bio yang dicantumkan.'}
                  </span>
                )}
              </div>
              {profileData.blog && (
                <div className="pt-2 border-t border-neutral-200">
                  <a
                    href={profileData.blog.startsWith('http') ? profileData.blog : `https://${profileData.blog}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-[#10b981] hover:underline break-all"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>{profileData.blog}</span>
                  </a>
                </div>
              )}
            </div>

            {/* Public Repositories Section */}
            {profileData.reposList && profileData.reposList.length > 0 && (
              <div className="bg-white border-2 border-black rounded-xl p-4 shadow-[2px_2px_0px_#000000] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-[#10b981] text-black border-2 border-black rounded-lg">
                      <GitBranch className="w-4 h-4 stroke-[2.5]" />
                    </div>
                    <div>
                      <h3 className="text-xs sm:text-sm font-black uppercase text-black tracking-wide">
                        {isEn ? 'Public Repositories' : 'Isi Akun & Repositori Publik Terbaru'}
                      </h3>
                      <p className="text-[11px] font-bold text-neutral-500">
                        {isEn ? 'Latest updated repositories' : 'Daftar repositori aktif terbaru'}
                      </p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 bg-neutral-100 border-2 border-black rounded-lg text-[10px] sm:text-xs font-black text-black">
                    {profileData.reposList.length} {isEn ? 'Repos' : 'Repo'}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
                  {profileData.reposList.map((repo, idx) => (
                    <a
                      key={repo.name || idx}
                      href={repo.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-3 bg-neutral-50 hover:bg-[#f0fdf4] border-2 border-black rounded-xl shadow-[2px_2px_0px_#000000] hover:translate-x-[1px] hover:translate-y-[1px] transition-all flex flex-col justify-between gap-2.5 group cursor-pointer"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-black text-sm text-black group-hover:text-[#059669] truncate">
                            {repo.name}
                          </span>
                          <ExternalLink className="w-3.5 h-3.5 text-neutral-400 group-hover:text-black shrink-0" />
                        </div>
                        {repo.description ? (
                          <p className="text-xs font-medium text-neutral-600 line-clamp-2 leading-relaxed">
                            {repo.description}
                          </p>
                        ) : (
                          <p className="text-xs italic text-neutral-400">
                            {isEn ? 'No description provided' : 'Tanpa deskripsi'}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-xs font-bold text-neutral-600 pt-1.5 border-t border-neutral-200">
                        {repo.language && (
                          <span className="inline-flex items-center gap-1.5">
                            <span 
                              className="w-2.5 h-2.5 rounded-full border border-black/40 shrink-0"
                              style={{ backgroundColor: getLanguageColor(repo.language) }}
                            />
                            <span className="text-neutral-700 font-extrabold">{repo.language}</span>
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 text-neutral-700">
                          <Star className="w-3 h-3 text-[#eab308] fill-current" />
                          <span>{repo.stars}</span>
                        </span>
                        {repo.forks > 0 && (
                          <span className="inline-flex items-center gap-1 text-neutral-700">
                            <GitFork className="w-3 h-3 text-neutral-500" />
                            <span>{repo.forks}</span>
                          </span>
                        )}
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
                className="px-4 py-2 bg-[#10b981] hover:bg-[#059669] text-white border-2 border-black rounded-xl font-black text-xs shadow-[2px_2px_0px_#000000] hover:translate-x-[1px] hover:translate-y-[1px] active:translate-x-[2px] active:translate-y-[2px] transition-all flex items-center gap-1.5 cursor-pointer"
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
