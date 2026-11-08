import React, { useState, useEffect, useRef } from 'react';
import CosmicBackButton from './CosmicBackButton';
import { translations } from '../utils/translations';
import { searchCapCutRealtime, CURATED_TEMPLATES } from '../services/capcutService';
import { 
  Flame, 
  Search, 
  ExternalLink, 
  Copy, 
  Check, 
  X, 
  Sparkles, 
  Loader2, 
  Film, 
  Play, 
  Music, 
  TrendingUp,
  Radio
} from 'lucide-react';

// Daftar tag pencarian populer (tanpa "wong ai ni" sesuai revisi pengguna)
const QUICK_TAGS = [
  'DJ Jedag Jedug',
  'JJ Tipis',
  'Bercanda',
  'Anime Edit',
  'Sound Seram',
  'JJ Mengkane'
];

export default function CapCutFinderScreen({ onBack, onShowToast, lang = 'id' }) {
  const t = translations[lang] || translations.id;
  const ct = t.capcutFinder;

  const [searchQuery, setSearchQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState(() => CURATED_TEMPLATES);
  const [copiedId, setCopiedId] = useState(null);
  const inputRef = useRef(null);

  // Pencarian real-time saat teks pencarian berubah (debounce 250ms)
  useEffect(() => {
    let isCancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const results = await searchCapCutRealtime(searchQuery);
        if (!isCancelled) {
          setTemplates(results);
          setActiveQuery(searchQuery.trim());
        }
      } finally {
        if (!isCancelled) setLoading(false);
      }
    }, 250);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery]);

  const handleSearchSubmit = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    try {
      const results = await searchCapCutRealtime(searchQuery);
      setTemplates(results);
      setActiveQuery(searchQuery.trim());
    } finally {
      setLoading(false);
    }
  };

  const handleSelectQuickTag = (tag) => {
    setSearchQuery(tag);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setTemplates(CURATED_TEMPLATES);
    setActiveQuery('');
    if (inputRef.current) inputRef.current.focus();
  };

  const handleCopyLink = async (template) => {
    const targetUrl = template.capcutUrl || `https://www.capcut.com/id-id/templates?q=${encodeURIComponent(template.title)}`;
    try {
      await navigator.clipboard.writeText(targetUrl);
      setCopiedId(template.id);
      if (onShowToast) onShowToast(ct.copied || 'Tautan CapCut berhasil disalin!');
      setTimeout(() => setCopiedId(null), 2500);
    } catch {
      if (onShowToast) onShowToast('Gagal menyalin link.');
    }
  };

  const handleOpenCapCut = (template) => {
    const targetUrl = template.capcutUrl || `https://www.capcut.com/id-id/templates?q=${encodeURIComponent(template.title)}`;
    window.open(targetUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-6 md:py-8 flex flex-col gap-6">
      {/* Top Header & Cosmic Back Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <CosmicBackButton onClick={onBack} label={lang === 'en' ? 'Back to Home' : 'Kembali ke Beranda'} />
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-yellow-300 border-2 border-black font-extrabold text-xs shadow-[2px_2px_0px_#000000]">
            <Flame className="w-3.5 h-3.5 fill-black" />
            CAPCUT PRESET JJ
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-300 border-2 border-black font-extrabold text-xs shadow-[2px_2px_0px_#000000]">
            <Radio className="w-3.5 h-3.5 text-black animate-pulse" />
            REAL-TIME LIVE
          </span>
        </div>
      </div>

      {/* Hero Title Section */}
      <div className="bg-white dark:bg-[#18181b] border-2 border-black rounded-2xl p-6 md:p-8 shadow-[4px_4px_0px_0px_#000000]">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-[#ffef5c] border-2 border-black shadow-[2px_2px_0px_#000000] flex items-center justify-center shrink-0">
            <Film className="w-6 h-6 md:w-7 md:h-7 text-black stroke-[2.5]" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-black dark:text-white uppercase">
              {ct.title}
            </h1>
            <p className="mt-1 text-sm md:text-base text-zinc-600 dark:text-zinc-300 font-medium">
              {ct.subtitle}
            </p>
          </div>
        </div>

        {/* Search Bar Form */}
        <form onSubmit={handleSearchSubmit} className="mt-6 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={ct.searchPlaceholder}
              className="w-full pl-11 pr-10 py-3.5 rounded-xl border-2 border-black bg-[#fafafa] dark:bg-[#27272a] text-black dark:text-white font-medium text-sm md:text-base shadow-[2px_2px_0px_#000000] focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white transition-all placeholder:text-zinc-400"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md text-zinc-500 hover:text-black dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
                title="Hapus pencarian"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-black text-white dark:bg-white dark:text-black font-extrabold text-sm md:text-base border-2 border-black shadow-[3px_3px_0px_#000000] hover:bg-zinc-800 dark:hover:bg-zinc-100 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all cursor-pointer shrink-0 disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{ct.searching}</span>
              </>
            ) : (
              <>
                <Search className="w-4 h-4 stroke-[3]" />
                <span>{ct.searchBtn}</span>
              </>
            )}
          </button>
        </form>

        {/* Popular Quick Keyword Chips (Wong Ai Ni telah dihapus sesuai permintaan pengguna) */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5" />
            {ct.popularSearches}
          </span>
          {QUICK_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => handleSelectQuickTag(tag)}
              className={`px-2.5 py-1 rounded-lg border-2 border-black text-xs font-bold transition-all shadow-[2px_2px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer ${
                searchQuery.toLowerCase() === tag.toLowerCase()
                  ? 'bg-black text-white dark:bg-white dark:text-black'
                  : 'bg-white text-black dark:bg-[#27272a] dark:text-zinc-200 hover:bg-[#fff9b8]'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Results Header Info */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-extrabold text-black dark:text-white uppercase tracking-wider">
            {activeQuery ? `HASIL: "${activeQuery}"` : 'SEMUA TEMPLATE JJ PILIHAN'}
          </span>
          <span className="px-2 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-800 text-black dark:text-zinc-200 text-xs font-black border border-black">
            {templates.length}
          </span>
        </div>
        <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium hidden sm:inline">
          {ct.videoLoopNote}
        </span>
      </div>

      {/* Template Cards Grid */}
      {templates.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map((tpl) => (
            <div
              key={tpl.id}
              className="bg-white dark:bg-[#18181b] border-2 border-black rounded-2xl p-4 shadow-[4px_4px_0px_0px_#000000] hover:shadow-[6px_6px_0px_0px_#000000] hover:-translate-y-0.5 transition-all flex flex-col"
            >
              {/* Video Player Container */}
              <div className="relative w-full aspect-[9/12] sm:aspect-[9/13] bg-black rounded-xl overflow-hidden border-2 border-black mb-3.5 group">
                <video
                  src={tpl.videoUrl}
                  poster={tpl.thumbnail}
                  autoPlay
                  muted
                  loop
                  playsInline
                  className="w-full h-full object-cover"
                />

                {/* Badges on Top of Video */}
                <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 z-10">
                  {tpl.badge && (
                    <span className="px-2 py-0.5 rounded-md bg-yellow-300 border border-black font-black text-[10px] text-black shadow-[1px_1px_0px_#000000]">
                      {tpl.badge}
                    </span>
                  )}
                  {tpl.duration && (
                    <span className="px-2 py-0.5 rounded-md bg-black/80 border border-white/40 font-bold text-[10px] text-white">
                      {tpl.duration}
                    </span>
                  )}
                </div>

                {/* Looping indicator bottom right */}
                <div className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded bg-black/75 border border-white/20 text-[10px] font-bold text-white flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  <span>LOOP</span>
                </div>
              </div>

              {/* Title & Creator */}
              <div className="flex flex-col flex-1">
                <h3 className="font-black text-base md:text-lg text-black dark:text-white leading-snug line-clamp-2">
                  {tpl.title}
                </h3>

                <div className="mt-2 flex items-center justify-between text-xs text-zinc-600 dark:text-zinc-300">
                  <span className="font-bold flex items-center gap-1 text-black dark:text-white">
                    <span className="w-2 h-2 rounded-full bg-black dark:bg-white" />
                    {tpl.creator}
                  </span>
                  {tpl.uses && (
                    <span className="font-semibold text-zinc-500 dark:text-zinc-400">
                      {tpl.uses}
                    </span>
                  )}
                </div>

                {/* Lyrics snippet */}
                {tpl.lyrics && (
                  <div className="mt-2.5 px-2.5 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-300 dark:border-zinc-700 text-xs text-zinc-600 dark:text-zinc-300 italic flex items-center gap-1.5">
                    <Music className="w-3.5 h-3.5 shrink-0 text-zinc-400" />
                    <span className="truncate">"{tpl.lyrics}"</span>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="mt-4 pt-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenCapCut(tpl)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-[#22c55e] hover:bg-[#16a34a] text-black font-black text-xs sm:text-sm border-2 border-black shadow-[2px_2px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>{ct.openInCapcut}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleCopyLink(tpl)}
                    className="p-2.5 rounded-xl bg-white dark:bg-[#27272a] hover:bg-zinc-100 dark:hover:bg-zinc-700 text-black dark:text-white border-2 border-black shadow-[2px_2px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
                    title={ct.copyLink}
                  >
                    {copiedId === tpl.id ? (
                      <Check className="w-4 h-4 text-emerald-600 stroke-[3]" />
                    ) : (
                      <Copy className="w-4 h-4 stroke-[2.5]" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && templates.length === 0 && (
        <div className="bg-white dark:bg-[#18181b] border-2 border-black rounded-2xl p-10 text-center shadow-[4px_4px_0px_0px_#000000] flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-red-100 border-2 border-black flex items-center justify-center text-red-600">
            <Film className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-black text-black dark:text-white uppercase">
            {ct.noResultsTitle}
          </h3>
          <p className="text-sm text-zinc-600 dark:text-zinc-300 max-w-md">
            {ct.noResultsDesc}
          </p>
          <button
            type="button"
            onClick={handleClearSearch}
            className="mt-2 px-5 py-2 rounded-xl bg-black text-white dark:bg-white dark:text-black border-2 border-black font-extrabold text-xs shadow-[2px_2px_0px_#000000] cursor-pointer"
          >
            Tampilkan Semua Template
          </button>
        </div>
      )}
    </div>
  );
}
