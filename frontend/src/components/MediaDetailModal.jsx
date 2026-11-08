import React, { useState, useEffect } from 'react';
import { 
  X, 
  Star, 
  Tv, 
  BookOpen, 
  Calendar, 
  Copy, 
  Check, 
  ExternalLink,
  Layers,
  Sparkles
} from 'lucide-react';

// Cache memori untuk terjemahan sinopsis agar pergantian bahasa seketika
const translationCache = new Map();

/**
 * frontend/src/components/MediaDetailModal.jsx
 * Modal Popup Detail In-App Neobrutalism untuk Anime & Manhwa
 * Mendukung teks sinopsis bilingual dinamis (ID / EN) sesuai bahasa yang dipilih.
 */
export default function MediaDetailModal({
  isOpen,
  onClose,
  item,
  mediaType = 'anime',
  lang = 'id',
  onShowToast
}) {
  const [copied, setCopied] = useState(false);
  const [synopsisText, setSynopsisText] = useState(item?.description || '');
  const [isTranslating, setIsTranslating] = useState(false);

  // Terjemahkan atau sesuaikan sinopsis berdasarkan preferensi bahasa (ID / EN)
  useEffect(() => {
    if (!item) return;
    const baseText = item.description || '';
    if (!baseText) {
      setSynopsisText('');
      return;
    }

    const isIndonesian = lang === 'id';
    const looksIndonesian = /\b(dan|yang|di|dengan|adalah|pemburu|dunia|setelah|sebuah|mereka|karena)\b/i.test(baseText);

    if (isIndonesian && looksIndonesian) {
      setSynopsisText(baseText);
      return;
    }
    if (!isIndonesian && !looksIndonesian) {
      setSynopsisText(baseText);
      return;
    }

    const targetLang = isIndonesian ? 'id' : 'en';
    const cacheKey = `${item.id || item.title?.english}_${targetLang}`;
    if (translationCache.has(cacheKey)) {
      setSynopsisText(translationCache.get(cacheKey));
      return;
    }

    let isCancelled = false;
    setIsTranslating(true);
    const sourceLang = isIndonesian ? 'en' : 'id';
    const cleanText = baseText.replace(/<[^>]+>/g, '').slice(0, 1500);

    fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(cleanText)}`)
      .then(res => res.json())
      .then(data => {
        if (!isCancelled && data && Array.isArray(data[0])) {
          const translated = data[0].map(chunk => chunk[0]).join('');
          if (translated) {
            translationCache.set(cacheKey, translated);
            setSynopsisText(translated);
          }
        }
      })
      .catch(() => {
        if (!isCancelled) setSynopsisText(baseText);
      })
      .finally(() => {
        if (!isCancelled) setIsTranslating(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [item, lang]);

  if (!isOpen || !item) return null;

  const isAnime = mediaType === 'anime';
  const titlePrimary = item.title?.english || item.title?.romaji || (isAnime ? 'Anime' : 'Manhwa');
  const titleSecondary = item.title?.romaji !== titlePrimary ? item.title?.romaji : item.title?.native;
  const ratingScore = item.score ? Number(item.score).toFixed(1) : '8.5';
  const statusLabel = item.status === 'FINISHED' 
    ? (lang === 'en' ? 'Completed' : 'Tamat') 
    : (lang === 'en' ? 'Releasing' : 'Sedang Rilis');
  const countLabel = isAnime 
    ? (item.episodes ? `${item.episodes} ${lang === 'en' ? 'Episodes' : 'Episode'}` : (lang === 'en' ? 'Airing' : 'Tayang'))
    : (item.chapters ? `${item.chapters} ${lang === 'en' ? 'Chapters' : 'Chapter'}` : (lang === 'en' ? 'Ongoing' : 'Berlanjut'));
  const yearLabel = item.year || item.seasonYear || (lang === 'en' ? 'Popular' : 'Populer');

  const handleCopyTitle = async () => {
    try {
      await navigator.clipboard.writeText(titlePrimary);
      setCopied(true);
      if (onShowToast) onShowToast(lang === 'en' ? 'Title copied to clipboard!' : 'Judul berhasil disalin!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      if (onShowToast) onShowToast(lang === 'en' ? 'Failed to copy title' : 'Gagal menyalin judul');
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-2xl bg-white dark:bg-[#18181b] border-2 border-black rounded-2xl shadow-[6px_6px_0px_#000000] overflow-hidden flex flex-col max-h-[90vh] relative animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Top Header */}
        <div className="p-3.5 sm:p-4 border-b-2 border-black bg-gradient-to-r from-blue-50/80 via-purple-50/50 to-white dark:from-zinc-900 dark:to-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-black font-black text-[11px] shadow-[1px_1px_0px_#000000] ${
              isAnime ? 'bg-cyan-300 text-black' : 'bg-purple-300 text-black'
            }`}>
              {isAnime ? <Tv className="w-3.5 h-3.5" /> : <BookOpen className="w-3.5 h-3.5" />}
              {isAnime ? (lang === 'en' ? 'ANIME DETAIL' : 'DETAIL ANIME') : (lang === 'en' ? 'MANHWA DETAIL' : 'DETAIL MANHWA')}
            </span>
            <span className="text-xs font-mono font-bold text-neutral-500 hidden sm:inline">
              #{item.id}
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg border-2 border-black bg-white dark:bg-zinc-800 text-black dark:text-white hover:bg-neutral-100 dark:hover:bg-zinc-700 shadow-[1.5px_1.5px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer"
            aria-label="Tutup"
          >
            <X className="w-4 h-4 stroke-[2.5]" />
          </button>
        </div>

        {/* Modal Body Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 custom-scrollbar text-black dark:text-white">
          <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
            {/* Poster Besar dengan Badge Rating */}
            <div className="w-full sm:w-48 shrink-0 relative aspect-[3/4] rounded-xl overflow-hidden border-2 border-black bg-zinc-900 shadow-[3px_3px_0px_#000000]">
              <img 
                src={item.coverImage} 
                alt={titlePrimary}
                className="w-full h-full object-cover"
              />
              <div className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-lg bg-yellow-300 border-2 border-black font-black text-xs text-black shadow-[2px_2px_0px_#000000] flex items-center gap-1 z-10">
                <Star className="w-3.5 h-3.5 fill-black text-black" />
                <span>{ratingScore}</span>
              </div>
            </div>

            {/* Meta Informasi */}
            <div className="flex-1 flex flex-col justify-between">
              <div>
                <h2 className="text-xl sm:text-2xl font-black tracking-tight leading-snug">
                  {titlePrimary}
                </h2>
                {titleSecondary && (
                  <p className="mt-1 text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 font-medium italic">
                    {titleSecondary}
                  </p>
                )}

                {/* Badges Grid */}
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className="px-2.5 py-1 rounded-md bg-neutral-100 dark:bg-zinc-800 border border-black font-bold">
                    {statusLabel}
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-neutral-100 dark:bg-zinc-800 border border-black font-bold">
                    {countLabel}
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-amber-100 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 border border-black font-bold flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {yearLabel}
                  </span>
                </div>

                {/* Genre Chips */}
                <div className="mt-3.5 flex flex-wrap gap-1.5">
                  {(item.genres || []).map((genre) => (
                    <span
                      key={genre}
                      className="px-2 py-0.5 rounded text-[11px] font-extrabold bg-blue-50 dark:bg-zinc-800 text-blue-900 dark:text-blue-200 border border-black shadow-[1px_1px_0px_#000000]"
                    >
                      {genre}
                    </span>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-4 pt-3 border-t border-neutral-200 dark:border-zinc-800 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyTitle}
                  className="px-3.5 py-2 rounded-xl bg-white dark:bg-zinc-800 hover:bg-neutral-100 dark:hover:bg-zinc-700 text-black dark:text-white border-2 border-black font-black text-xs shadow-[2px_2px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[3]" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? (lang === 'en' ? 'Copied!' : 'Tersalin!') : (lang === 'en' ? 'Copy Title' : 'Salin Judul')}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Sinopsis Lengkap Scrollable */}
          <div className="pt-3 border-t border-neutral-200 dark:border-zinc-800">
            <h3 className="text-xs font-black uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-2 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>{lang === 'en' ? 'Full Synopsis' : 'Sinopsis Cerita Lengkap'}</span>
            </h3>
            <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-zinc-900 border-2 border-black shadow-[2px_2px_0px_#000000] text-xs sm:text-sm leading-relaxed max-h-56 overflow-y-auto custom-scrollbar whitespace-pre-line text-neutral-800 dark:text-neutral-200">
              {isTranslating ? (
                <div className="flex items-center gap-2 text-neutral-500 py-2">
                  <span className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  <span>{lang === 'en' ? 'Translating synopsis...' : 'Menyesuaikan bahasa sinopsis...'}</span>
                </div>
              ) : (
                synopsisText || (lang === 'en' ? 'No synopsis available for this title.' : 'Sinopsis cerita lengkap belum tersedia untuk judul ini.')
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-3 sm:p-4 border-t-2 border-black bg-neutral-50 dark:bg-zinc-900 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-black text-white dark:bg-white dark:text-black font-extrabold text-xs sm:text-sm border-2 border-black shadow-[2px_2px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer"
          >
            {lang === 'en' ? 'Close Detail' : 'Tutup Detail'}
          </button>
        </div>
      </div>
    </div>
  );
}
