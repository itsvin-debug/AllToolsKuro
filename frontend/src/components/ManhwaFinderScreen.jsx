import React, { useState, useEffect, useRef } from 'react';
import CosmicBackButton from './CosmicBackButton';
import { translations } from '../utils/translations';
import { 
  BookOpen, 
  Search, 
  Star, 
  ExternalLink, 
  Copy, 
  Check, 
  X, 
  Filter, 
  Sparkles, 
  Loader2, 
  Layers, 
  ChevronDown, 
  ChevronUp,
  Bookmark,
  TrendingUp
} from 'lucide-react';

const MANHWA_GENRES = [
  'Action',
  'Adventure',
  'Comedy',
  'Drama',
  'Fantasy',
  'Mystery',
  'Psychological',
  'Romance',
  'Sci-Fi',
  'Slice of Life',
  'Sports',
  'Supernatural'
];

export default function ManhwaFinderScreen({ onBack, onShowToast, lang = 'id' }) {
  const t = translations[lang] || translations.id;
  const mt = t.manhwaFinder;

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [sortOrder, setSortOrder] = useState('POPULARITY_DESC');
  const [loading, setLoading] = useState(false);
  const [manhwaList, setManhwaList] = useState([]);
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [copiedId, setCopiedId] = useState(null);
  const inputRef = useRef(null);

  // Ambil data rekomendasi manhwa saat halaman pertama kali dibuka
  useEffect(() => {
    fetchManhwa('', [], 'POPULARITY_DESC');
  }, []);

  const fetchManhwa = async (query = searchQuery, genres = selectedGenres, sort = sortOrder) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.append('q', query.trim());
      if (genres.length > 0) params.append('genres', genres.join(','));
      if (sort) params.append('sort', sort);

      const res = await fetch(`/api/manhwa/search?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.data)) {
          setManhwaList(data.data);
        }
      }
    } catch (err) {
      console.warn('Gagal memuat rekomendasi manhwa:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e) => {
    if (e) e.preventDefault();
    fetchManhwa(searchQuery, selectedGenres, sortOrder);
  };

  const handleToggleGenre = (genre) => {
    const updated = selectedGenres.includes(genre)
      ? selectedGenres.filter(g => g !== genre)
      : [...selectedGenres, genre];
    setSelectedGenres(updated);
    fetchManhwa(searchQuery, updated, sortOrder);
  };

  const handleClearAllGenres = () => {
    setSelectedGenres([]);
    fetchManhwa(searchQuery, [], sortOrder);
  };

  const handleSortChange = (newSort) => {
    setSortOrder(newSort);
    fetchManhwa(searchQuery, selectedGenres, newSort);
  };

  const toggleExpandSynopsis = (id) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCopyTitle = async (manhwa) => {
    const titleText = manhwa.title?.english || manhwa.title?.romaji || 'Manhwa Title';
    try {
      await navigator.clipboard.writeText(titleText);
      setCopiedId(manhwa.id);
      if (onShowToast) onShowToast(mt.copiedTitle || 'Judul manhwa disalin ke papan klip!');
      setTimeout(() => setCopiedId(null), 2500);
    } catch {
      if (onShowToast) onShowToast('Gagal menyalin judul.');
    }
  };

  const handleOpenDetail = (manhwa) => {
    const url = manhwa.siteUrl || `https://anilist.co/manga/${manhwa.id}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-6 md:py-8 flex flex-col gap-6">
      {/* Top Header & Cosmic Back Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <CosmicBackButton onClick={onBack} label={lang === 'en' ? 'Back to Home' : 'Kembali ke Beranda'} />
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-300 border-2 border-black font-extrabold text-xs shadow-[2px_2px_0px_#000000]">
            <BookOpen className="w-3.5 h-3.5 text-black" />
            KOREAN WEBTOON
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-300 border-2 border-black font-extrabold text-xs shadow-[2px_2px_0px_#000000]">
            <Star className="w-3.5 h-3.5 fill-black text-black" />
            TOP RATED
          </span>
        </div>
      </div>

      {/* Hero Title & Search Section */}
      <div className="bg-white dark:bg-[#18181b] border-2 border-black rounded-2xl p-6 md:p-8 shadow-[4px_4px_0px_0px_#000000]">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-[#d8b4fe] border-2 border-black shadow-[2px_2px_0px_#000000] flex items-center justify-center shrink-0">
            <BookOpen className="w-6 h-6 md:w-7 md:h-7 text-black stroke-[2.5]" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-black dark:text-white uppercase">
              {mt.title}
            </h1>
            <p className="mt-1 text-sm md:text-base text-zinc-600 dark:text-zinc-300 font-medium">
              {mt.subtitle}
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
              placeholder={mt.searchPlaceholder}
              className="w-full pl-11 pr-10 py-3.5 rounded-xl border-2 border-black bg-[#fafafa] dark:bg-[#27272a] text-black dark:text-white font-medium text-sm md:text-base shadow-[2px_2px_0px_#000000] focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white transition-all placeholder:text-zinc-400"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  fetchManhwa('', selectedGenres, sortOrder);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md text-zinc-500 hover:text-black dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                title="Hapus"
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
                <span>{mt.searching}</span>
              </>
            ) : (
              <>
                <Search className="w-4 h-4 stroke-[3]" />
                <span>{mt.searchBtn}</span>
              </>
            )}
          </button>
        </form>

        {/* Multi-Genre Filter Chips */}
        <div className="mt-5 pt-5 border-t border-zinc-200 dark:border-zinc-800 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5 uppercase tracking-wider">
              <Filter className="w-3.5 h-3.5" />
              {mt.filterGenre} {selectedGenres.length > 0 && `(${selectedGenres.length})`}
            </span>
            {selectedGenres.length > 0 && (
              <button
                type="button"
                onClick={handleClearAllGenres}
                className="text-xs font-bold text-red-600 dark:text-red-400 hover:underline cursor-pointer"
              >
                Reset Filter
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {MANHWA_GENRES.map((genre) => {
              const isSelected = selectedGenres.includes(genre);
              return (
                <button
                  key={genre}
                  type="button"
                  onClick={() => handleToggleGenre(genre)}
                  className={`px-3 py-1 rounded-lg border-2 border-black text-xs font-bold transition-all shadow-[2px_2px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer ${
                    isSelected
                      ? 'bg-purple-300 text-black font-extrabold'
                      : 'bg-white text-zinc-700 dark:bg-[#27272a] dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                  }`}
                >
                  {genre}
                </button>
              );
            })}
          </div>
        </div>

        {/* Sorting Buttons */}
        <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Urutkan:</span>
          {[
            { id: 'POPULARITY_DESC', label: mt.sortPopular },
            { id: 'SCORE_DESC', label: mt.sortScore },
            { id: 'TRENDING_DESC', label: mt.sortTrending }
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSortChange(item.id)}
              className={`px-3 py-1 rounded-md text-xs font-bold border border-black transition-all cursor-pointer ${
                sortOrder === item.id
                  ? 'bg-black text-white dark:bg-white dark:text-black shadow-[1px_1px_0px_#000000]'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Results Count Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-extrabold text-black dark:text-white uppercase tracking-wider">
            {searchQuery ? `Hasil: "${searchQuery}"` : 'REKOMENDASI MANHWA KOREA TERBAIK'}
          </span>
          <span className="px-2 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-800 text-black dark:text-zinc-200 text-xs font-black border border-black">
            {manhwaList.length}
          </span>
        </div>
      </div>

      {/* Loading Skeleton */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n} className="bg-white dark:bg-[#18181b] border-2 border-black rounded-2xl p-4 shadow-[4px_4px_0px_0px_#000000] animate-pulse flex flex-col gap-3">
              <div className="w-full aspect-[3/4] bg-zinc-200 dark:bg-zinc-800 rounded-xl border-2 border-black" />
              <div className="h-5 bg-zinc-200 dark:bg-zinc-800 rounded w-3/4" />
              <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-1/2" />
              <div className="h-16 bg-zinc-200 dark:bg-zinc-800 rounded mt-2" />
            </div>
          ))}
        </div>
      )}

      {/* Manhwa Cards Grid */}
      {!loading && manhwaList.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {manhwaList.map((manhwa) => {
            const isExpanded = expandedIds.has(manhwa.id);
            const titlePrimary = manhwa.title?.english || manhwa.title?.romaji || 'Manhwa';
            const titleSecondary = manhwa.title?.romaji !== titlePrimary ? manhwa.title?.romaji : manhwa.title?.native;

            return (
              <div
                key={manhwa.id}
                className="bg-white dark:bg-[#18181b] border-2 border-black rounded-2xl p-4 shadow-[4px_4px_0px_0px_#000000] hover:shadow-[6px_6px_0px_0px_#000000] hover:-translate-y-0.5 transition-all flex flex-col"
              >
                {/* Cover Image Container */}
                <div className="relative w-full aspect-[3/4] bg-zinc-900 rounded-xl overflow-hidden border-2 border-black mb-3.5 group">
                  <img
                    src={manhwa.coverImage}
                    alt={titlePrimary}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />

                  {/* Rating Score Badge */}
                  <div className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-lg bg-yellow-300 border-2 border-black font-black text-xs text-black shadow-[2px_2px_0px_#000000] flex items-center gap-1 z-10">
                    <Star className="w-3.5 h-3.5 fill-black text-black" />
                    <span>{manhwa.score}</span>
                  </div>

                  {/* Status & Chapters Badge */}
                  <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5 z-10">
                    <span className="px-2 py-0.5 rounded-md bg-black/85 border border-white/40 text-[11px] font-bold text-white">
                      {manhwa.status === 'FINISHED' ? mt.statusFinished : mt.statusReleasing}
                    </span>
                    {manhwa.chapters && (
                      <span className="px-2 py-0.5 rounded-md bg-white/95 border border-black text-[11px] font-black text-black">
                        {manhwa.chapters} {mt.chapters}
                      </span>
                    )}
                  </div>
                </div>

                {/* Title & Native Hangul */}
                <div className="flex flex-col flex-1">
                  <h3 className="font-black text-base md:text-lg text-black dark:text-white leading-snug line-clamp-2">
                    {titlePrimary}
                  </h3>
                  {titleSecondary && (
                    <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400 font-medium truncate">
                      {titleSecondary}
                    </p>
                  )}

                  {/* Genre Pills */}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {manhwa.genres.slice(0, 4).map((g) => (
                      <span
                        key={g}
                        className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-[10px] font-extrabold text-zinc-800 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-700"
                      >
                        {g}
                      </span>
                    ))}
                  </div>

                  {/* Synopsis Description with Expandable Read More */}
                  <div className="mt-3 text-xs text-zinc-600 dark:text-zinc-300 font-normal leading-relaxed">
                    <p className={isExpanded ? '' : 'line-clamp-3'}>
                      {manhwa.description}
                    </p>
                    {manhwa.description && manhwa.description.length > 120 && (
                      <button
                        type="button"
                        onClick={() => toggleExpandSynopsis(manhwa.id)}
                        className="mt-1 font-bold text-black dark:text-white underline inline-flex items-center gap-0.5 hover:text-purple-600 cursor-pointer"
                      >
                        {isExpanded ? (
                          <>
                            <span>{mt.readLess}</span>
                            <ChevronUp className="w-3.5 h-3.5" />
                          </>
                        ) : (
                          <>
                            <span>{mt.readMore}</span>
                            <ChevronDown className="w-3.5 h-3.5" />
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="mt-4 pt-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenDetail(manhwa)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-purple-300 hover:bg-purple-400 text-black font-black text-xs sm:text-sm border-2 border-black shadow-[2px_2px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
                    >
                      <ExternalLink className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>{mt.openOfficial}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleCopyTitle(manhwa)}
                      className="p-2.5 rounded-xl bg-white dark:bg-[#27272a] hover:bg-zinc-100 dark:hover:bg-zinc-700 text-black dark:text-white border-2 border-black shadow-[2px_2px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
                      title={mt.copyTitle}
                    >
                      {copiedId === manhwa.id ? (
                        <Check className="w-4 h-4 text-emerald-600 stroke-[3]" />
                      ) : (
                        <Copy className="w-4 h-4 stroke-[2.5]" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {!loading && manhwaList.length === 0 && (
        <div className="bg-white dark:bg-[#18181b] border-2 border-black rounded-2xl p-10 text-center shadow-[4px_4px_0px_0px_#000000] flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-purple-100 border-2 border-black flex items-center justify-center text-purple-600">
            <BookOpen className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-black text-black dark:text-white uppercase">
            {mt.noResultsTitle}
          </h3>
          <p className="text-sm text-zinc-600 dark:text-zinc-300 max-w-md">
            {mt.noResultsDesc}
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setSelectedGenres([]);
              fetchManhwa('', [], sortOrder);
            }}
            className="mt-2 px-5 py-2 rounded-xl bg-black text-white dark:bg-white dark:text-black border-2 border-black font-extrabold text-xs shadow-[2px_2px_0px_#000000] cursor-pointer"
          >
            Reset Semua Filter
          </button>
        </div>
      )}
    </div>
  );
}
