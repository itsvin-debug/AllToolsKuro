import React, { useState, useEffect } from 'react';
import axios from 'axios';
import CosmicBackButton from './CosmicBackButton';
import { 
  Link2, 
  Clipboard, 
  Download, 
  Music2, 
  Camera, 
  Play, 
  AlertCircle,
  ChevronDown,
  Loader2,
  ArrowRight,
  Music,
  Share2,
  Tv,
  Image as ImageIcon,
  Disc,
  FolderDown,
  Flame,
  Radio,
  ExternalLink
} from 'lucide-react';
import ResultsSection from './ResultsSection';
import { translations } from '../utils/translations';

export default function ConverterScreen({ activePlatform: initialPlatform = 'tiktok', onSelectPlatform, onBack, lang = 'id' }) {
  const isEn = lang === 'en';
  const t = translations[lang] || translations.id;
  const dl = t.downloader;

  const [activePlatform, setActivePlatform] = useState(initialPlatform);
  const [urlInput, setUrlInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [resultData, setResultData] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [suggestedPlatform, setSuggestedPlatform] = useState(null);
  const [selectedFormat, setSelectedFormat] = useState('1080p');

  useEffect(() => {
    setActivePlatform(initialPlatform);
  }, [initialPlatform]);

  // 16 Platform Medsos & Streaming yang Didukung (Dwibahasa dinamis via translations)
  const platforms = [
    {
      id: 'tiktok',
      name: 'TikTok',
      badge: dl.platforms.tiktok.badge,
      placeholder: dl.platforms.tiktok.placeholder,
      hint: dl.platforms.tiktok.hint,
      icon: Music2,
      domains: ['tiktok.com']
    },
    {
      id: 'instagram',
      name: 'Instagram',
      badge: dl.platforms.instagram.badge,
      placeholder: dl.platforms.instagram.placeholder,
      hint: dl.platforms.instagram.hint,
      icon: Camera,
      domains: ['instagram.com', 'instagr.am', 'ig.me']
    },
    {
      id: 'youtube',
      name: 'YouTube',
      badge: dl.platforms.youtube.badge,
      placeholder: dl.platforms.youtube.placeholder,
      hint: dl.platforms.youtube.hint,
      icon: Play,
      domains: ['youtube.com', 'youtu.be']
    },
    {
      id: 'twitter',
      name: 'X (Twitter)',
      badge: dl.platforms.twitter.badge,
      placeholder: dl.platforms.twitter.placeholder,
      hint: dl.platforms.twitter.hint,
      icon: () => (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="w-4 h-4 fill-current inline">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path>
        </svg>
      ),
      domains: ['x.com', 'twitter.com']
    },
    {
      id: 'spotify',
      name: 'Spotify',
      badge: dl.platforms.spotify.badge,
      placeholder: dl.platforms.spotify.placeholder,
      hint: dl.platforms.spotify.hint,
      icon: Music,
      domains: ['spotify.com', 'spotify.link', 'spoti.fi']
    },
    {
      id: 'bilibili',
      name: 'Bilibili',
      badge: dl.platforms.bilibili.badge,
      placeholder: dl.platforms.bilibili.placeholder,
      hint: dl.platforms.bilibili.hint,
      icon: Tv,
      domains: ['bilibili.com', 'bilibili.tv', 'b23.tv']
    },
    {
      id: 'douyin',
      name: 'Douyin',
      badge: dl.platforms.douyin.badge,
      placeholder: dl.platforms.douyin.placeholder,
      hint: dl.platforms.douyin.hint,
      icon: Music2,
      domains: ['douyin.com', 'iesdouyin.com', 'v.douyin.com']
    },
    {
      id: 'rednote',
      name: 'Rednote',
      badge: dl.platforms.rednote.badge,
      placeholder: dl.platforms.rednote.placeholder,
      hint: dl.platforms.rednote.hint,
      icon: Disc,
      domains: ['xiaohongshu.com', 'xhslink.com']
    },
    {
      id: 'threads',
      name: 'Threads',
      badge: dl.platforms.threads.badge,
      placeholder: dl.platforms.threads.placeholder,
      hint: dl.platforms.threads.hint,
      icon: Share2,
      domains: ['threads.net']
    },
    {
      id: 'pinterest',
      name: 'Pinterest',
      badge: dl.platforms.pinterest.badge,
      placeholder: dl.platforms.pinterest.placeholder,
      hint: dl.platforms.pinterest.hint,
      icon: ImageIcon,
      domains: ['pinterest.com', 'pin.it']
    },
    {
      id: 'appleMusic',
      name: 'Apple Music',
      badge: dl.platforms.appleMusic.badge,
      placeholder: dl.platforms.appleMusic.placeholder,
      hint: dl.platforms.appleMusic.hint,
      icon: Music,
      domains: ['music.apple.com']
    },
    {
      id: 'facebook',
      name: 'Facebook',
      badge: dl.platforms.facebook.badge,
      placeholder: dl.platforms.facebook.placeholder,
      hint: dl.platforms.facebook.hint,
      icon: Play,
      domains: ['facebook.com', 'fb.watch']
    },
    {
      id: 'bandcamp',
      name: 'Bandcamp',
      badge: dl.platforms.bandcamp.badge,
      placeholder: dl.platforms.bandcamp.placeholder,
      hint: dl.platforms.bandcamp.hint,
      icon: Disc,
      domains: ['bandcamp.com']
    },
    {
      id: 'pixiv',
      name: 'Pixiv',
      badge: dl.platforms.pixiv.badge,
      placeholder: dl.platforms.pixiv.placeholder,
      hint: dl.platforms.pixiv.hint,
      icon: ImageIcon,
      domains: ['pixiv.net']
    },
    {
      id: 'reddit',
      name: 'Reddit',
      badge: dl.platforms.reddit.badge,
      placeholder: dl.platforms.reddit.placeholder,
      hint: dl.platforms.reddit.hint,
      icon: Disc,
      domains: ['reddit.com', 'redd.it']
    },
    {
      id: 'terabox',
      name: 'Terabox',
      badge: dl.platforms.terabox.badge,
      placeholder: dl.platforms.terabox.placeholder,
      hint: dl.platforms.terabox.hint,
      icon: FolderDown,
      domains: ['terabox.com', '1024tera.com', 'teraboxapp.com']
    }
  ];

  const currentMeta = platforms.find((p) => p.id === activePlatform) || platforms[0];
  const CurrentIcon = currentMeta.icon;

  const handlePasteClipboard = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          handleUrlChange(text);
        }
      }
    } catch {
      // Browser permissions error fallback
    }
  };

  const detectPlatformFromUrl = (url) => {
    const raw = url.toLowerCase().trim();
    for (const p of platforms) {
      for (const d of p.domains) {
        if (raw.includes(d)) {
          return p.id;
        }
      }
    }
    return 'unknown';
  };

  const validateUrlAgainstPlatform = (url, targetPlatformId) => {
    if (!url) {
      setErrorMsg('');
      setSuggestedPlatform(null);
      return false;
    }

    const detected = detectPlatformFromUrl(url);
    const targetObj = platforms.find((p) => p.id === targetPlatformId);

    if (detected !== 'unknown' && detected !== targetPlatformId) {
      const detectedObj = platforms.find((p) => p.id === detected);
      const switchText = dl.switchSuggestion.replace('{suggested}', detectedObj ? detectedObj.name : detected);
      setErrorMsg(switchText);
      setSuggestedPlatform(detected);
      return false;
    }

    if (detected === 'unknown') {
      const allowedDomains = targetObj.domains.join(', ');
      setErrorMsg(
        dl.invalidDomainError.replace('{name}', targetObj.name).replace('{domains}', allowedDomains)
      );
      setSuggestedPlatform(null);
      return false;
    }

    setErrorMsg('');
    setSuggestedPlatform(null);
    return true;
  };

  const handleUrlChange = (val) => {
    setUrlInput(val);
    if (val.trim().length > 10) {
      validateUrlAgainstPlatform(val.trim(), activePlatform);
    } else {
      setErrorMsg('');
      setSuggestedPlatform(null);
    }
  };

  const handleSwitchPlatform = (newPlatformId) => {
    setActivePlatform(newPlatformId);
    if (onSelectPlatform) onSelectPlatform(newPlatformId);
    setErrorMsg('');
    setSuggestedPlatform(null);
    if (urlInput.trim()) {
      validateUrlAgainstPlatform(urlInput.trim(), newPlatformId);
    }
  };

  const handleGenerate = async (e) => {
    if (e) e.preventDefault();
    setErrorMsg('');
    setSuggestedPlatform(null);
    setResultData(null);

    const trimmedUrl = urlInput.trim();
    if (!trimmedUrl) {
      setErrorMsg(dl.emptyUrlError);
      return;
    }

    const isValid = validateUrlAgainstPlatform(trimmedUrl, activePlatform);
    if (!isValid) {
      return;
    }

    try {
      setLoading(true);
      setDownloadProgress(2);

      const progressTimer = setInterval(() => {
        setDownloadProgress((prev) => {
          if (prev >= 92) return prev;
          const inc = Math.floor(Math.random() * 8) + 4;
          return Math.min(92, prev + inc);
        });
      }, 140);

      const response = await axios.post('/api/download', {
        url: trimmedUrl,
        expectedPlatform: activePlatform
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 45000
      });

      clearInterval(progressTimer);

      if (response.data && response.data.success && response.data.data) {
        setDownloadProgress(100);
        const media = response.data.data;
        setTimeout(() => {
          setResultData(media);
          setLoading(false);
          setDownloadProgress(0);
        }, 400);
      } else {
        throw new Error(response.data?.message || (isEn ? 'Failed to process media link.' : 'Gagal memproses tautan media.'));
      }
    } catch (err) {
      const serverMsg = err.response?.data?.message || err.message || (isEn ? 'An error occurred while extracting media.' : 'Terjadi kesalahan saat memproses media.');
      setErrorMsg(serverMsg);
      setLoading(false);
      setDownloadProgress(0);
    }
  };

  const handleReset = () => {
    setUrlInput('');
    setResultData(null);
    setErrorMsg('');
    setSuggestedPlatform(null);
    setDownloadProgress(0);
  };

  return (
    <main className="flex-grow flex flex-col items-center justify-start px-4 sm:px-6 py-6 sm:py-8 max-w-4xl mx-auto w-full">
      
      <div className="w-full flex flex-col gap-5">
        
        {/* Navigation & Header Status */}
        <div className="w-full flex items-center justify-between">
          <CosmicBackButton onClick={onBack} label={t.nav.backToHome} />

          <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded border-2 border-black bg-neutral-100 text-black uppercase">
            {dl.platformsAvailable}
          </span>
        </div>

        {/* Clean Page Title & Functional Description */}
        <div className="w-full border-b-2 border-black pb-4">
          <h1 className="text-xl sm:text-3xl font-black text-black tracking-tight font-display uppercase">
            {dl.title}
          </h1>
          <p className="text-xs sm:text-sm text-neutral-600 mt-1.5 leading-relaxed max-w-2xl">
            {dl.subtitle}
          </p>
        </div>

        {/* ─── 16 PLATFORM SELECTOR GRID (NEOBRUTALISM STYLE) ─── */}
        <div className="w-full">
          <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-black mb-2 flex items-center justify-between">
            <span>{dl.choosePlatform}</span>
            <span className="text-neutral-500 font-bold">{currentMeta.name} {dl.activeStatus}</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5">
            {platforms.map((p) => {
              const Icon = p.icon;
              const isSelected = activePlatform === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => handleSwitchPlatform(p.id)}
                  className={`p-2.5 sm:p-3 rounded-lg border-2 border-black text-left transition-all duration-150 flex flex-col justify-between gap-2 cursor-pointer ${
                    isSelected
                      ? 'bg-black text-white shadow-[3px_3px_0px_#000000] -translate-x-0.5 -translate-y-0.5'
                      : 'bg-white text-black hover:bg-neutral-100 hover:shadow-[2px_2px_0px_#000000]'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className={`w-7 h-7 rounded border border-current flex items-center justify-center ${isSelected ? 'bg-white text-black' : 'bg-neutral-100 text-black'}`}>
                      <Icon className="w-4 h-4 stroke-[2.2]" />
                    </div>
                    <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border border-current ${isSelected ? 'bg-neutral-900 text-white' : 'bg-white text-black'}`}>
                      {p.badge}
                    </span>
                  </div>

                  <div className="font-extrabold text-xs sm:text-sm tracking-tight truncate">
                    {p.name}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ─── ACTIVE FEATURE INTERFACE (INPUT & ACTIONS) ─── */}
        <div className="w-full rounded-xl p-5 sm:p-6 border-2 border-black bg-white shadow-[4px_4px_0px_#000000] flex flex-col gap-4">
          
          <div className="flex items-center gap-3 pb-3 border-b-2 border-black">
            <div className="w-10 h-10 rounded-lg border-2 border-black bg-black text-white flex items-center justify-center">
              <CurrentIcon className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-extrabold text-black uppercase tracking-tight">
                {dl.downloadMediaPrefix} {currentMeta.name}
              </h2>
              <p className="text-xs text-neutral-600 mt-0.5">
                {currentMeta.hint}
              </p>
            </div>
          </div>

          <form onSubmit={handleGenerate} className="flex flex-col gap-3 w-full">
            
            {/* Input URL */}
            <div className="relative w-full">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-black">
                <Link2 className="w-4 h-4 stroke-[2.5]" />
              </div>
              
              <input
                type="text"
                value={urlInput}
                onChange={(e) => handleUrlChange(e.target.value)}
                placeholder={currentMeta.placeholder}
                className="w-full bg-white border-2 border-black text-black text-xs sm:text-sm font-medium rounded-lg py-3.5 pl-10 pr-24 focus:outline-none focus:ring-2 focus:ring-black transition-all placeholder:text-neutral-400"
              />

              <button
                type="button"
                onClick={handlePasteClipboard}
                className="absolute inset-y-0 right-2 px-3 my-2 text-xs font-mono font-bold rounded border border-black bg-neutral-100 hover:bg-neutral-200 text-black transition-all flex items-center gap-1 cursor-pointer"
              >
                <Clipboard className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>{dl.pasteButton}</span>
              </button>
            </div>

            {/* Error Message Box */}
            {errorMsg && (
              <div className="p-3.5 rounded-lg border-2 border-black bg-neutral-100 text-black flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 text-xs">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-black stroke-[2.5]" />
                  <span className="font-medium">{errorMsg}</span>
                </div>

                {suggestedPlatform && (
                  <button
                    type="button"
                    onClick={() => handleSwitchPlatform(suggestedPlatform)}
                    className="shrink-0 px-3 py-1 rounded border-2 border-black bg-black text-white font-bold text-xs hover:bg-neutral-800 transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <span>{dl.switchButton}: {platforms.find(p => p.id === suggestedPlatform)?.name || suggestedPlatform}</span>
                    <ArrowRight className="w-3 h-3 stroke-[2.5]" />
                  </button>
                )}
              </div>
            )}

            {/* Format & Submit Button */}
            <div className="flex flex-col sm:flex-row gap-2.5 w-full">
              <div className="relative sm:w-64">
                <select
                  value={selectedFormat}
                  onChange={(e) => setSelectedFormat(e.target.value)}
                  className="w-full appearance-none bg-white border-2 border-black text-black text-xs sm:text-sm rounded-lg py-3 px-3.5 pr-9 cursor-pointer font-bold focus:outline-none focus:ring-2 focus:ring-black"
                >
                  <option value="2160p">4K Ultra HD {isEn ? '(2160p Ultra Crisp)' : '(2160p Jernih Maksimal)'}</option>
                  <option value="1080p">HD 1080p {isEn ? '(WhatsApp Status Anti-Burik)' : '(Rekomendasi Status WA - Anti Burik)'}</option>
                  <option value="720p">HD 720p {isEn ? '(Fast Standard)' : '(Standar Cepat)'}</option>
                  <option value="mp3">Audio MP3 {isEn ? '(Extract Sound)' : '(Ekstrak Suara)'}</option>
                </select>
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-black">
                  <ChevronDown className="w-4 h-4 stroke-[2.5]" />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex-grow bg-black hover:bg-neutral-800 text-white font-extrabold text-xs sm:text-sm rounded-lg px-6 py-3 border-2 border-black shadow-[3px_3px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>{dl.processingButton} {downloadProgress}%</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 stroke-[2.5]" />
                    <span>{dl.downloadButton} ({currentMeta.name})</span>
                  </>
                )}
              </button>
            </div>

          </form>

        </div>

        {/* Loading Progress State */}
        {loading && (
          <div className="w-full rounded-xl p-6 border-2 border-black bg-white shadow-[3px_3px_0px_#000000] flex flex-col items-center justify-center gap-3">
            <div className="w-full max-w-md flex flex-col items-center gap-2.5">
              <div className="flex items-center justify-between w-full text-xs font-mono font-bold">
                <span className="flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{isEn ? `Extracting ${currentMeta.name} Media...` : `Proses Ekstraksi ${currentMeta.name}`}</span>
                </span>
                <span>{downloadProgress}%</span>
              </div>

              <div className="w-full h-4 rounded-md border-2 border-black p-0.5 bg-white overflow-hidden">
                <div 
                  className="h-full bg-black transition-all duration-150"
                  style={{ width: `${downloadProgress}%` }}
                />
              </div>

              <p className="text-[11px] text-neutral-600 text-center font-mono">
                {downloadProgress < 100 
                  ? (isEn ? `Fetching master quality streams from ${currentMeta.name}...` : `Mengambil tautan media kualitas master dari ${currentMeta.name}...`)
                  : (isEn ? 'Completed. Rendering output media previews...' : 'Selesai. Memuat pratinjau output media...')}
              </p>
            </div>
          </div>
        )}

        {/* Results Section */}
        {!loading && resultData && (
          <ResultsSection 
            result={resultData} 
            preferredFormat={selectedFormat}
            onReset={handleReset}
            onBack={onBack}
            lang={lang}
          />
        )}

      </div>

    </main>
  );
}
