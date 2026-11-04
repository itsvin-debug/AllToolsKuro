import React, { useState, useEffect } from 'react';
import JSZip from 'jszip';
import CosmicBackButton from './CosmicBackButton';
import { 
  Images, 
  Download, 
  Trash2, 
  FileText, 
  Film, 
  Music, 
  Eye, 
  Play, 
  X, 
  ArrowRight,
  Code2,
  ChevronLeft,
  ChevronRight,
  Layers,
  Sparkles,
  RefreshCw,
  FileArchive
} from 'lucide-react';
import { getGalleryItems, removeGalleryItem } from '../services/storageService';
import { translations } from '../utils/translations';

export default function GalleryScreen({ onBack, onOpenTool, lang = 'id', onShowToast }) {
  const isEn = lang === 'en';
  const [items, setItems] = useState([]);
  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'slide' | 'image' | 'video' | 'document' | 'audio'
  const [previewModalItem, setPreviewModalItem] = useState(null);
  const [cardSlideIndices, setCardSlideIndices] = useState({});
  const [modalSlideIndex, setModalSlideIndex] = useState(0);
  const [touchStartX, setTouchStartX] = useState(null);
  const [modalTouchStartX, setModalTouchStartX] = useState(null);
  const [isDownloadingBatch, setIsDownloadingBatch] = useState(false);
  const [batchProgressText, setBatchProgressText] = useState('');
  const [videoPlaybackError, setVideoPlaybackError] = useState(false);
  
  const t = translations[lang] || translations.id;

  // Sinkronisasi otomatis saat berkas baru ditambahkan dari alat mana pun
  useEffect(() => {
    const loadItems = () => {
      setItems(getGalleryItems());
    };

    loadItems();

    window.addEventListener('kuro_gallery_updated', loadItems);
    window.addEventListener('storage', loadItems);

    return () => {
      window.removeEventListener('kuro_gallery_updated', loadItems);
      window.removeEventListener('storage', loadItems);
    };
  }, []);

  // Keyboard navigation untuk modal pratinjau carousel slide
  useEffect(() => {
    if (!previewModalItem) return;
    const slides = previewModalItem.slides || [];
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setPreviewModalItem(null);
      } else if (e.key === 'ArrowLeft' && slides.length > 1) {
        setModalSlideIndex(prev => (prev - 1 + slides.length) % slides.length);
      } else if (e.key === 'ArrowRight' && slides.length > 1) {
        setModalSlideIndex(prev => (prev + 1) % slides.length);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewModalItem]);

  const openPreview = (item, initialIndex = 0) => {
    setVideoPlaybackError(false);
    setPreviewModalItem(item);
    setModalSlideIndex(initialIndex);
  };

  const handleDelete = (id) => {
    const updated = removeGalleryItem(id);
    setItems(updated);
    if (previewModalItem?.id === id) {
      setPreviewModalItem(null);
    }
    if (onShowToast) {
      onShowToast(t.gallery.itemDeleted);
    }
  };

  // Unduh ulang berkas dari galeri tanpa membuka tab/halaman putih
  const handleDownload = async (item, specificSlide = null) => {
    try {
      // 1. Jika mengunduh 1 slide spesifik dari album slide
      if (specificSlide) {
        const rawUrl = specificSlide.url || specificSlide.proxyUrl || '';
        const isVid = specificSlide.type === 'video';
        const ext = isVid ? 'mp4' : 'jpg';
        const filename = specificSlide.filename || `slide_${Date.now()}.${ext}`;
        const proxyUrl = specificSlide.proxyUrl || `/api/proxy-download?url=${encodeURIComponent(rawUrl)}&filename=${encodeURIComponent(filename)}`;

        const link = document.createElement('a');
        link.style.display = 'none';
        link.href = proxyUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        if (onShowToast) {
          onShowToast(`${t.gallery.downloadSuccess} (${filename})`);
        }
        return;
      }

      // 2. Jika mengunduh seluruh koleksi slide dalam 1 arsip ZIP
      if ((item.type === 'slide' || Boolean(item.slides?.length)) && item.slides) {
        setIsDownloadingBatch(true);
        setBatchProgressText(isEn ? 'Preparing ZIP archive...' : 'Menyiapkan arsip ZIP...');

        const zip = new JSZip();
        const folder = zip.folder('slides');
        const total = item.slides.length;

        for (let i = 0; i < total; i++) {
          const s = item.slides[i];
          const isVid = s.type === 'video';
          const ext = isVid ? 'mp4' : 'jpg';
          const sName = s.filename || `slide_${i + 1}.${ext}`;
          setBatchProgressText(
            isEn 
              ? `Downloading slide ${i + 1} of ${total}...` 
              : `Mengunduh slide ${i + 1} dari ${total}...`
          );

          try {
            const proxy = s.proxyUrl || `/api/proxy-download?url=${encodeURIComponent(s.url)}&filename=${encodeURIComponent(sName)}`;
            const res = await fetch(proxy);
            if (res.ok) {
              const blob = await res.blob();
              folder.file(sName, blob);
            }
          } catch {}
        }

        // Sertakan trek audio di dalam ZIP jika tersedia
        if (item.audio && item.audio.url) {
          try {
            setBatchProgressText(isEn ? 'Including audio track...' : 'Menyertakan trek audio...');
            const aName = item.audio.filename || 'audio.mp3';
            const aProxy = item.audio.proxyUrl || `/api/proxy-download?url=${encodeURIComponent(item.audio.url)}&filename=${encodeURIComponent(aName)}`;
            const aRes = await fetch(aProxy);
            if (aRes.ok) {
              const aBlob = await aRes.blob();
              folder.file(aName, aBlob);
            }
          } catch {}
        }

        setBatchProgressText(isEn ? 'Compressing ZIP archive...' : 'Mengompres arsip ZIP...');
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const zipUrl = window.URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = zipUrl;
        a.download = item.filename || `kuro_slides_${Date.now()}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => window.URL.revokeObjectURL(zipUrl), 3000);

        setIsDownloadingBatch(false);
        setBatchProgressText('');
        if (onShowToast) {
          onShowToast(`${t.gallery.downloadSuccess} (${item.filename || 'slides.zip'})`);
        }
        return;
      }

      // 3. Format berkas standar (single video, foto tunggal, audio, dokumen)
      const rawUrl = item.downloadData || item.previewUrl || '';
      const filename = item.filename || `kuro_${item.title.toLowerCase().replace(/\s+/g, '_')}.${(item.extension || 'mp4').toLowerCase()}`;

      if (rawUrl.startsWith('data:') || rawUrl.startsWith('blob:')) {
        const link = document.createElement('a');
        link.style.display = 'none';
        link.href = rawUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
        const proxyUrl = `/api/proxy-download?url=${encodeURIComponent(rawUrl)}&filename=${encodeURIComponent(filename)}`;
        const link = document.createElement('a');
        link.style.display = 'none';
        link.href = proxyUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else if (rawUrl) {
        const link = document.createElement('a');
        link.style.display = 'none';
        link.href = rawUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }

      if (onShowToast) {
        onShowToast(`${t.gallery.downloadSuccess} (${filename})`);
      }
    } catch {
      if (onShowToast) onShowToast(isEn ? 'Failed to download file.' : 'Gagal memulai unduhan.');
    } finally {
      setIsDownloadingBatch(false);
      setBatchProgressText('');
    }
  };

  const filteredItems = items.filter(item => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'slide') return item.type === 'slide' || Boolean(item.slides?.length);
    if (activeFilter === 'image') return item.type === 'image' || item.type === 'slide' || Boolean(item.slides?.length);
    if (activeFilter === 'video') return item.type === 'video' || item.slides?.some(s => s.type === 'video');
    return item.type === activeFilter;
  });

  const getIconForType = (type) => {
    switch (type) {
      case 'slide':
        return Layers;
      case 'video':
        return Film;
      case 'document':
        return FileText;
      case 'audio':
        return Music;
      case 'image':
      default:
        return Images;
    }
  };

  return (
    <main className="flex-grow flex flex-col items-center justify-start px-3 sm:px-6 py-5 sm:py-8 max-w-5xl mx-auto w-full">
      <div className="w-full flex flex-col gap-4 sm:gap-5">
        
        {/* Header Navigasi & Kembali */}
        <div className="w-full flex items-center justify-between">
          <CosmicBackButton onClick={onBack} label={t.nav.backToHome} />

          <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded border-2 border-black bg-neutral-100 text-black uppercase">
            {items.length} {t.gallery.itemsCount}
          </span>
        </div>

        {/* Banner Judul Layar */}
        <div className="w-full rounded-xl border-2 border-black p-4 sm:p-6 bg-white shadow-[4px_4px_0px_#000000] flex flex-col gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg border-2 border-black bg-black text-white flex items-center justify-center shrink-0">
              <Images className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <h1 className="text-base sm:text-xl font-black text-black tracking-tight font-display">
                {t.gallery.title}
              </h1>
              <p className="text-xs text-neutral-600 mt-0.5">
                {t.gallery.subtitle}
              </p>
            </div>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1.5 w-full custom-scrollbar">
          {[
            { id: 'all', label: t.gallery.filterAll },
            { id: 'slide', label: t.gallery.filterSlide || (isEn ? 'Media Slides' : 'Slide Media') },
            { id: 'image', label: t.gallery.filterImage },
            { id: 'video', label: t.gallery.filterVideo },
            { id: 'document', label: t.gallery.filterDoc },
            { id: 'audio', label: t.gallery.filterAudio }
          ].map(f => {
            const isActive = activeFilter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setActiveFilter(f.id)}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg border-2 border-black text-xs font-bold transition-all cursor-pointer shrink-0 min-h-[36px] sm:min-h-[40px] flex items-center justify-center ${
                  isActive
                    ? 'bg-black text-white shadow-[2px_2px_0px_#000000] -translate-x-0.5 -translate-y-0.5'
                    : 'bg-white text-black hover:bg-neutral-100 shadow-[1px_1px_0px_#000000]'
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        {/* Daftar Hasil Karya: Grid Responsif (2 Kolom Mobile, 3 Kolom Desktop) */}
        {filteredItems.length === 0 ? (
          <div className="w-full rounded-xl border-2 border-black p-8 sm:p-12 bg-white shadow-[4px_4px_0px_#000000] text-center flex flex-col items-center justify-center gap-3">
            <div className="w-14 h-14 rounded-full border-2 border-black bg-neutral-100 flex items-center justify-center text-black mb-1">
              <Images className="w-7 h-7 stroke-[1.8]" />
            </div>
            <h2 className="text-base font-extrabold text-black font-display">
              {t.gallery.emptyTitle}
            </h2>
            <p className="text-xs text-neutral-600 max-w-md">
              {t.gallery.emptyDesc}
            </p>
            <button
              type="button"
              onClick={onBack}
              className="mt-2 px-4 py-2 rounded-lg border-2 border-black bg-black text-white text-xs font-bold hover:bg-neutral-800 transition-all flex items-center gap-1.5 shadow-[2px_2px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none cursor-pointer min-h-[44px]"
            >
              <span>{t.gallery.exploreTools}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-2.5 sm:gap-4 md:gap-5">
            {filteredItems.map(item => {
              const ItemIcon = getIconForType(item.type);
              const isSlideCollection = item.type === 'slide' || Boolean(item.slides && item.slides.length > 0);
              const hasVideo = item.type === 'video' && !isSlideCollection;
              const hasImage = item.type === 'image' && !isSlideCollection;
              const hasAudio = item.type === 'audio';
              const isDocument = item.type === 'document';

              const slides = isSlideCollection ? item.slides : [];
              const currentSlideIdx = cardSlideIndices[item.id] || 0;
              const currentSlide = slides[currentSlideIdx] || slides[0] || {};

              const thumbnailSrc = item.thumbnail || (hasImage ? (item.previewUrl || item.downloadData) : null);

              return (
                <div 
                  key={item.id}
                  className="rounded-xl border-2 border-black bg-white shadow-[2px_2px_0px_#000000] sm:shadow-[3px_3px_0px_#000000] hover:shadow-[4px_4px_0px_#000000] transition-all flex flex-col justify-between overflow-hidden"
                >
                  
                  {/* 1. Header Informasi Asal Alat */}
                  <div className="p-2 sm:p-3 border-b-2 border-black bg-neutral-50 flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="w-5 h-5 sm:w-6 sm:h-6 rounded border border-black bg-white flex items-center justify-center text-black shrink-0">
                        <ItemIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5 stroke-[2.2]" />
                      </div>
                      <span className="text-[9px] sm:text-[10px] font-mono font-bold text-neutral-700 truncate max-w-[85px] sm:max-w-[130px]">
                        {item.category}
                      </span>
                    </div>

                    <span className="text-[8px] sm:text-[9px] font-mono font-bold px-1 sm:px-1.5 py-0.5 rounded border border-black bg-black text-white shrink-0">
                      {isSlideCollection ? 'SLIDES' : item.extension}
                    </span>
                  </div>

                  {/* 2. AREA OUTPUT VISUAL (Bisa Dilihat / Digeser Langsung) */}
                  <div className="relative w-full bg-neutral-100 border-b-2 border-black overflow-hidden flex items-center justify-center group select-none">
                    
                    {/* A. Pratinjau Koleksi Slide (Bisa Digeser Langsung di Card) */}
                    {isSlideCollection && (
                      <div 
                        onTouchStart={(e) => setTouchStartX(e.touches[0].clientX)}
                        onTouchEnd={(e) => {
                          if (touchStartX === null) return;
                          const diffX = touchStartX - e.changedTouches[0].clientX;
                          if (Math.abs(diffX) > 35) {
                            if (diffX > 0) {
                              setCardSlideIndices(prev => ({
                                ...prev,
                                [item.id]: (currentSlideIdx + 1) % slides.length
                              }));
                            } else {
                              setCardSlideIndices(prev => ({
                                ...prev,
                                [item.id]: (currentSlideIdx - 1 + slides.length) % slides.length
                              }));
                            }
                          }
                          setTouchStartX(null);
                        }}
                        onClick={() => openPreview(item, currentSlideIdx)}
                        className="relative w-full h-36 sm:h-48 bg-neutral-950 flex items-center justify-center cursor-pointer select-none overflow-hidden group/slide"
                        title={isEn ? 'Click to open slide album' : 'Klik untuk membuka album slide'}
                      >
                        {currentSlide.type === 'video' ? (
                          <div className="relative w-full h-full flex items-center justify-center bg-black">
                            <video
                              key={currentSlide.streamUrl || currentSlide.url}
                              src={currentSlide.streamUrl || currentSlide.url}
                              poster={currentSlide.thumbnail || undefined}
                              muted
                              playsInline
                              className="max-h-full max-w-full object-contain pointer-events-none"
                            />
                            <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                              <div className="w-8 h-8 rounded-full bg-white text-black border-2 border-black flex items-center justify-center shadow-[1px_1px_0px_#000000]">
                                <Play className="w-4 h-4 fill-current ml-0.5" />
                              </div>
                            </div>
                          </div>
                        ) : (
                          <img
                            key={currentSlide.url}
                            src={currentSlide.thumbnail || currentSlide.url}
                            alt={`Slide ${currentSlideIdx + 1}`}
                            className="max-h-full max-w-full object-contain transition-transform duration-200"
                            referrerPolicy="no-referrer"
                          />
                        )}

                        {/* Tombol Geser Slide Kiri & Kanan di Dalam Kartu */}
                        {slides.length > 1 && (
                          <>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCardSlideIndices(prev => ({
                                  ...prev,
                                  [item.id]: (currentSlideIdx - 1 + slides.length) % slides.length
                                }));
                              }}
                              className="absolute left-1.5 top-1/2 -translate-y-1/2 w-7 h-7 sm:w-8 sm:h-8 rounded-md bg-white/95 text-black border-2 border-black flex items-center justify-center shadow-[1px_1px_0px_#000000] hover:bg-neutral-100 active:scale-95 transition-all z-10 cursor-pointer min-h-[32px] min-w-[32px]"
                              aria-label="Slide Sebelumnya"
                            >
                              <ChevronLeft className="w-4 h-4 stroke-[2.5]" />
                            </button>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCardSlideIndices(prev => ({
                                  ...prev,
                                  [item.id]: (currentSlideIdx + 1) % slides.length
                                }));
                              }}
                              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 sm:w-8 sm:h-8 rounded-md bg-white/95 text-black border-2 border-black flex items-center justify-center shadow-[1px_1px_0px_#000000] hover:bg-neutral-100 active:scale-95 transition-all z-10 cursor-pointer min-h-[32px] min-w-[32px]"
                              aria-label="Slide Selanjutnya"
                            >
                              <ChevronRight className="w-4 h-4 stroke-[2.5]" />
                            </button>
                          </>
                        )}

                        {/* Badge Indikator Slide */}
                        <div className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded border border-black bg-black/85 text-white font-mono text-[8px] sm:text-[9px] font-bold z-10">
                          {currentSlideIdx + 1} / {slides.length}
                        </div>

                        <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded border border-black bg-white/95 text-black font-mono text-[8px] sm:text-[9px] font-bold z-10 flex items-center gap-1 shadow-xs">
                          {currentSlide.type === 'video' ? (
                            <>
                              <Film className="w-2.5 h-2.5 stroke-[2.5]" />
                              <span>VIDEO</span>
                            </>
                          ) : (
                            <>
                              <Images className="w-2.5 h-2.5 stroke-[2.5]" />
                              <span>FOTO</span>
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    {/* B. Pratinjau Video Tunggal */}
                    {hasVideo && (
                      <div 
                        onClick={() => openPreview(item)}
                        className="relative w-full aspect-[9/16] sm:aspect-video bg-neutral-900 flex items-center justify-center cursor-pointer overflow-hidden group/vid select-none"
                        title={isEn ? 'Click to play video' : 'Klik untuk memutar video'}
                      >
                        {thumbnailSrc && (
                          <img
                            src={thumbnailSrc}
                            alt={item.title}
                            className="w-full h-full object-cover group-hover/vid:scale-105 transition-transform duration-200"
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              const fallback = e.currentTarget.parentElement.querySelector('.video-card-fallback');
                              if (fallback) fallback.style.display = 'flex';
                            }}
                          />
                        )}

                        <div 
                          className={`video-card-fallback w-full h-full flex flex-col items-center justify-center p-3 text-center bg-gradient-to-b from-neutral-800 via-neutral-900 to-black ${thumbnailSrc ? 'hidden' : 'flex'}`}
                        >
                          <div className="w-10 h-10 rounded-lg border-2 border-white/20 bg-neutral-800/80 flex items-center justify-center mb-1 text-white shadow-sm">
                            <Film className="w-5 h-5 text-neutral-200" />
                          </div>
                          <span className="text-[10px] font-mono font-bold text-white tracking-wide uppercase line-clamp-1">
                            {item.title || 'Video Player'}
                          </span>
                          <span className="text-[9px] font-mono text-neutral-400 mt-0.5">
                            {item.size || 'HD MP4'}
                          </span>
                        </div>

                        {/* Tombol Play Overlay */}
                        <div className="absolute inset-0 bg-black/20 group-hover/vid:bg-black/40 transition-colors flex items-center justify-center pointer-events-none">
                          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-white text-black border-2 border-black flex items-center justify-center shadow-[2px_2px_0px_#000000] group-hover/vid:scale-110 transition-transform">
                            <Play className="w-5 h-5 sm:w-6 sm:h-6 fill-current ml-0.5" />
                          </div>
                        </div>

                        <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded border border-black bg-black/90 text-white font-mono text-[8px] sm:text-[9px] font-bold">
                          {item.size || 'HD MP4'}
                        </span>
                      </div>
                    )}

                    {/* C. Pratinjau Foto Tunggal & QR Code */}
                    {hasImage && (
                      <div 
                        onClick={() => openPreview(item)}
                        className="relative w-full h-32 sm:h-44 bg-white flex items-center justify-center p-2 sm:p-3 cursor-pointer select-none"
                        title="Klik untuk memperbesar gambar"
                      >
                        <img
                          src={thumbnailSrc || item.previewUrl || item.downloadData}
                          alt={item.title}
                          className="max-h-full max-w-full object-contain rounded"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 bg-black/0 hover:bg-black/10 transition-colors flex items-center justify-center">
                          <span className="opacity-0 group-hover:opacity-100 transition-opacity px-2 py-0.5 rounded border border-black bg-white text-black font-mono text-[9px] font-bold shadow-[1px_1px_0px_#000000] flex items-center gap-1">
                            <Eye className="w-3 h-3 stroke-[2.5]" />
                            <span>Perbesar</span>
                          </span>
                        </div>
                      </div>
                    )}

                    {/* D. Pratinjau Audio */}
                    {hasAudio && (
                      <div 
                        onClick={() => openPreview(item)}
                        className="w-full p-3 sm:p-4 flex flex-col items-center justify-center gap-2 bg-neutral-50 cursor-pointer"
                      >
                        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full border-2 border-black bg-white flex items-center justify-center text-black shadow-[1px_1px_0px_#000000]">
                          <Music className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.2]" />
                        </div>
                        <span className="text-[10px] font-mono font-bold text-center line-clamp-1">
                          Putar Audio MP3
                        </span>
                      </div>
                    )}

                    {/* E. Pratinjau Dokumen & XML */}
                    {isDocument && (
                      <div 
                        onClick={() => openPreview(item)}
                        className="w-full p-3 bg-neutral-900 text-neutral-200 font-mono text-[10px] sm:text-[11px] h-32 sm:h-40 overflow-hidden flex flex-col justify-between cursor-pointer select-none"
                        title="Klik untuk melihat isi berkas"
                      >
                        <div className="flex items-center justify-between pb-1 border-b border-neutral-700 text-neutral-400 text-[9px]">
                          <span className="flex items-center gap-1">
                            <Code2 className="w-3 h-3 text-cyan-400" />
                            <span>{item.extension}</span>
                          </span>
                          <span>Buka</span>
                        </div>
                        <div className="text-[9.5px] sm:text-[10px] leading-relaxed text-neutral-300 font-mono line-clamp-3 select-none">
                          {item.downloadData?.startsWith('data:') 
                            ? decodeURIComponent(item.downloadData.split(',')[1] || '').slice(0, 100)
                            : item.title}
                        </div>
                        <div className="pt-1 flex items-center justify-end text-cyan-300 text-[9px] font-bold">
                          <span>Lihat Berkas</span>
                        </div>
                      </div>
                    )}

                  </div>

                  {/* 3. Body Info Judul & Metadata */}
                  <div className="p-2.5 sm:p-3 flex flex-col flex-1 gap-1">
                    <h3 className="font-extrabold text-[11px] sm:text-xs md:text-sm text-black tracking-tight line-clamp-2 leading-snug">
                      {item.title}
                    </h3>
                    <div className="flex items-center gap-1.5 text-[9px] sm:text-[10px] font-mono text-neutral-500 mt-auto pt-1">
                      <span>{item.size || (isSlideCollection ? `${slides.length} Slide` : 'HD')}</span>
                      <span>•</span>
                      <span>{new Date(item.createdAt || Date.now()).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {/* 4. Actions Footer (Unduh Ulang & Hapus) */}
                  <div className="p-2 sm:p-2.5 border-t-2 border-black bg-white flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleDownload(item)}
                      disabled={isDownloadingBatch}
                      className="flex-1 py-2 px-2 sm:px-3 rounded-lg border-2 border-black bg-black hover:bg-neutral-800 text-white font-bold text-[10px] sm:text-xs flex items-center justify-center gap-1 shadow-[1.5px_1.5px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer min-h-[44px] disabled:opacity-50"
                    >
                      <Download className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span className="truncate">
                        {isSlideCollection 
                          ? (isEn ? 'Download ZIP' : 'Unduh ZIP') 
                          : t.gallery.redownload}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      className="p-2 rounded-lg border-2 border-black bg-white hover:bg-red-50 text-neutral-700 hover:text-red-600 shadow-[1.5px_1.5px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0"
                      title={t.gallery.delete}
                      aria-label={t.gallery.delete}
                    >
                      <Trash2 className="w-4 h-4 stroke-[2.2]" />
                    </button>
                  </div>

                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* ─── MODAL PRATINJAU OUTPUT BERKAS LENGKAP ─── */}
      {previewModalItem && (() => {
        const isModalSlide = previewModalItem.type === 'slide' || Boolean(previewModalItem.slides?.length);
        const modalSlides = isModalSlide ? (previewModalItem.slides || []) : [];
        const activeModalSlide = modalSlides[modalSlideIndex] || modalSlides[0] || {};

        return (
          <div 
            className="fixed inset-0 z-[110] bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
            onClick={() => setPreviewModalItem(null)}
          >
            <div 
              className="w-full max-w-sm sm:max-w-xl md:max-w-2xl rounded-xl border-2 border-black bg-white p-3.5 sm:p-5 shadow-[5px_5px_0px_#000000] flex flex-col gap-3.5 max-h-[92vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header Modal */}
              <div className="flex items-center justify-between pb-3 border-b-2 border-black">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded border border-black bg-black text-white shrink-0">
                    {isModalSlide ? 'SLIDES' : previewModalItem.extension}
                  </span>
                  <h3 className="font-extrabold text-xs sm:text-base text-black truncate">
                    {previewModalItem.title}
                  </h3>
                </div>

                <button
                  type="button"
                  onClick={() => setPreviewModalItem(null)}
                  className="p-1.5 rounded-md border-2 border-black bg-white hover:bg-neutral-100 text-black shadow-[1px_1px_0px_#000000] cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center"
                  aria-label="Tutup Pratinjau"
                >
                  <X className="w-4 h-4 stroke-[2.5]" />
                </button>
              </div>

              {/* Media Content Body */}
              <div className="w-full rounded-lg border-2 border-black bg-neutral-900 overflow-hidden flex items-center justify-center min-h-[220px]">
                
                {/* 1. Pratinjau Koleksi Slide Modal */}
                {isModalSlide && (
                  <div 
                    className="w-full flex flex-col items-center justify-center relative bg-neutral-950 p-2 select-none min-h-[260px]"
                    onTouchStart={(e) => setModalTouchStartX(e.touches[0].clientX)}
                    onTouchEnd={(e) => {
                      if (modalTouchStartX === null) return;
                      const diffX = modalTouchStartX - e.changedTouches[0].clientX;
                      if (Math.abs(diffX) > 35) {
                        if (diffX > 0) {
                          setModalSlideIndex(prev => (prev + 1) % modalSlides.length);
                        } else {
                          setModalSlideIndex(prev => (prev - 1 + modalSlides.length) % modalSlides.length);
                        }
                      }
                      setModalTouchStartX(null);
                    }}
                  >
                    <div className="relative w-full max-h-[55vh] flex items-center justify-center overflow-hidden">
                      {activeModalSlide.type === 'video' ? (
                        <video
                          key={activeModalSlide.streamUrl || activeModalSlide.url}
                          src={activeModalSlide.streamUrl || activeModalSlide.url}
                          poster={activeModalSlide.thumbnail || undefined}
                          controls
                          autoPlay
                          playsInline
                          className="max-h-[52vh] w-auto max-w-full aspect-[9/16] sm:aspect-auto object-contain bg-black mx-auto"
                        />
                      ) : (
                        <img
                          key={activeModalSlide.url}
                          src={activeModalSlide.url}
                          alt={`Slide ${modalSlideIndex + 1}`}
                          className="max-h-[52vh] max-w-full object-contain mx-auto"
                          referrerPolicy="no-referrer"
                        />
                      )}

                      {/* Tombol Navigasi Kiri & Kanan Modal */}
                      {modalSlides.length > 1 && (
                        <>
                          <button
                            type="button"
                            onClick={() => setModalSlideIndex(prev => (prev - 1 + modalSlides.length) % modalSlides.length)}
                            className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-lg bg-white text-black border-2 border-black flex items-center justify-center shadow-[2px_2px_0px_#000000] hover:bg-neutral-100 active:scale-95 transition-all z-20 cursor-pointer min-h-[44px] min-w-[44px]"
                            aria-label="Slide Sebelumnya"
                          >
                            <ChevronLeft className="w-5 h-5 stroke-[2.5]" />
                          </button>

                          <button
                            type="button"
                            onClick={() => setModalSlideIndex(prev => (prev + 1) % modalSlides.length)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-lg bg-white text-black border-2 border-black flex items-center justify-center shadow-[2px_2px_0px_#000000] hover:bg-neutral-100 active:scale-95 transition-all z-20 cursor-pointer min-h-[44px] min-w-[44px]"
                            aria-label="Slide Selanjutnya"
                          >
                            <ChevronRight className="w-5 h-5 stroke-[2.5]" />
                          </button>
                        </>
                      )}

                      {/* Badges Modal */}
                      <div className="absolute bottom-2 right-2 px-2.5 py-0.5 rounded border border-black bg-black text-white font-mono text-[10px] font-bold z-10">
                        {modalSlideIndex + 1} / {modalSlides.length}
                      </div>

                      <div className="absolute top-2 left-2 px-2 py-0.5 rounded border border-black bg-white text-black font-mono text-[10px] font-bold z-10 flex items-center gap-1 shadow-sm">
                        {activeModalSlide.type === 'video' ? (
                          <>
                            <Film className="w-3 h-3 stroke-[2.5]" />
                            <span>VIDEO SLIDE</span>
                          </>
                        ) : (
                          <>
                            <Images className="w-3 h-3 stroke-[2.5]" />
                            <span>FOTO SLIDE</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Thumbnail Strip Modal */}
                    {modalSlides.length > 1 && (
                      <div className="w-full flex items-center justify-start sm:justify-center gap-1.5 overflow-x-auto py-2 px-1 custom-scrollbar mt-2 border-t border-neutral-800">
                        {modalSlides.map((s, sIdx) => {
                          const isSelected = sIdx === modalSlideIndex;
                          return (
                            <button
                              key={s.id || sIdx}
                              type="button"
                              onClick={() => setModalSlideIndex(sIdx)}
                              className={`relative w-10 h-10 rounded overflow-hidden shrink-0 border-2 transition-all cursor-pointer ${
                                isSelected
                                  ? 'border-white shadow-[1px_1px_0px_#ffffff] scale-105'
                                  : 'border-neutral-700 opacity-60 hover:opacity-100'
                              }`}
                            >
                              {s.type === 'video' ? (
                                <div className="w-full h-full bg-black flex items-center justify-center text-white">
                                  <Play className="w-3.5 h-3.5 fill-white" />
                                </div>
                              ) : (
                                <img
                                  src={s.thumbnail || s.url}
                                  alt={`Thumb ${sIdx + 1}`}
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Pemutar Trek Audio Postingan jika ada */}
                    {previewModalItem.audio && (
                      <div className="w-full mt-2 p-2.5 rounded-lg border-2 border-black bg-white text-black flex items-center justify-between gap-2 shadow-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-8 h-8 rounded border border-black bg-neutral-100 flex items-center justify-center shrink-0">
                            <Music className="w-4 h-4 stroke-[2]" />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-[9px] font-mono font-bold text-neutral-500 uppercase">
                              Trek Audio
                            </span>
                            <span className="text-xs font-bold truncate">
                              {previewModalItem.audio.title || 'Audio Postingan'}
                            </span>
                          </div>
                        </div>
                        <audio
                          controls
                          src={previewModalItem.audio.streamUrl || previewModalItem.audio.url}
                          className="h-8 max-w-[170px] sm:max-w-[240px]"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* 2. Pratinjau Video Tunggal Modal */}
                {!isModalSlide && previewModalItem.type === 'video' && (
                  <div className="w-full flex items-center justify-center bg-black min-h-[240px]">
                    {videoPlaybackError ? (
                      <div className="w-full flex flex-col items-center justify-center p-6 text-center text-white bg-neutral-900 gap-3">
                        <div className="w-12 h-12 rounded-full border-2 border-white/30 bg-neutral-800 flex items-center justify-center">
                          <Film className="w-6 h-6 text-neutral-300" />
                        </div>
                        <div className="flex flex-col gap-1 max-w-sm">
                          <h3 className="font-extrabold text-sm text-white">
                            {isEn ? 'Direct Preview Unavailable' : 'Pratinjau Video Tidak Dapat Dimuat Langsung'}
                          </h3>
                          <p className="text-xs text-neutral-400">
                            {isEn 
                              ? 'The streaming token from the external CDN has expired or blocked embedding. You can still download the video directly to your device.' 
                              : 'Token streaming dari server asal telah kedaluwarsa atau dibatasi. Kamu tetap dapat mengunduh berkas video ini langsung ke penyimpanan perangkat.'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDownload(previewModalItem)}
                          className="mt-1 px-4 py-2.5 rounded-lg border-2 border-white bg-white text-black font-extrabold text-xs flex items-center gap-1.5 shadow-[2px_2px_0px_#ffffff] cursor-pointer hover:bg-neutral-200 transition-all"
                        >
                          <Download className="w-4 h-4 stroke-[2.5]" />
                          <span>{isEn ? 'Download Video File' : 'Unduh Berkas Video Sekarang'}</span>
                        </button>
                      </div>
                    ) : (
                      <video
                        src={
                          previewModalItem.previewUrl?.startsWith('http') && !previewModalItem.previewUrl?.includes('proxy')
                            ? `/api/proxy-stream?url=${encodeURIComponent(previewModalItem.previewUrl)}&type=video`
                            : (previewModalItem.previewUrl || previewModalItem.downloadData)
                        }
                        poster={previewModalItem.thumbnail || undefined}
                        controls
                        autoPlay
                        playsInline
                        preload="metadata"
                        className="max-h-[65vh] sm:max-h-[58vh] w-auto max-w-full aspect-[9/16] sm:aspect-auto object-contain bg-black mx-auto"
                        onError={(e) => {
                          if (previewModalItem.downloadData && e.target.src !== previewModalItem.downloadData) {
                            e.target.src = previewModalItem.downloadData;
                          } else {
                            setVideoPlaybackError(true);
                          }
                        }}
                      />
                    )}
                  </div>
                )}

                {/* 3. Pratinjau Foto Tunggal & QR Code Modal */}
                {!isModalSlide && previewModalItem.type === 'image' && (
                  <div className="p-3 sm:p-4 flex items-center justify-center bg-white w-full">
                    <img
                      src={previewModalItem.thumbnail || previewModalItem.previewUrl || previewModalItem.downloadData}
                      alt={previewModalItem.title}
                      className="max-h-[62vh] max-w-full object-contain"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                )}

                {/* 4. Pratinjau Audio Modal */}
                {!isModalSlide && previewModalItem.type === 'audio' && (
                  <div className="p-6 w-full flex flex-col items-center justify-center gap-3 bg-white text-black">
                    <div className="w-14 h-14 rounded-full border-2 border-black bg-black text-white flex items-center justify-center">
                      <Music className="w-7 h-7 stroke-[2]" />
                    </div>
                    <span className="font-extrabold text-sm text-black text-center">
                      {previewModalItem.title}
                    </span>
                    <audio
                      controls
                      autoPlay
                      src={
                        previewModalItem.previewUrl?.startsWith('http') && !previewModalItem.previewUrl?.includes('proxy')
                          ? `/api/proxy-stream?url=${encodeURIComponent(previewModalItem.previewUrl)}&type=audio`
                          : (previewModalItem.previewUrl || previewModalItem.downloadData)
                      }
                      className="w-full max-w-md mt-2"
                    />
                  </div>
                )}

                {/* 5. Pratinjau Dokumen & XML Modal */}
                {!isModalSlide && previewModalItem.type === 'document' && (
                  <div className="w-full p-4 bg-neutral-900 text-neutral-100 font-mono text-xs max-h-[50vh] overflow-y-auto">
                    <pre className="whitespace-pre-wrap break-all">
                      {previewModalItem.downloadData?.startsWith('data:')
                        ? decodeURIComponent(previewModalItem.downloadData.split(',')[1] || '')
                        : previewModalItem.title}
                    </pre>
                  </div>
                )}

              </div>

              {/* Footer Modal Actions */}
              <div className="flex flex-col sm:flex-row items-center justify-between pt-2 border-t-2 border-black gap-2">
                <span className="text-xs font-mono text-neutral-500 self-start sm:self-auto">
                  {isModalSlide 
                    ? `${modalSlides.length} Slide Total` 
                    : (previewModalItem.size || 'HD')}
                </span>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  {isModalSlide ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleDownload(previewModalItem, activeModalSlide)}
                        className="flex-1 sm:flex-none px-3 py-2 rounded-lg border-2 border-black bg-white hover:bg-neutral-100 text-black font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-[1.5px_1.5px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer min-h-[44px]"
                      >
                        <Download className="w-3.5 h-3.5 stroke-[2.5]" />
                        <span>{t.gallery.downloadCurrentSlide || 'Unduh Slide Ini'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDownload(previewModalItem)}
                        disabled={isDownloadingBatch}
                        className="flex-1 sm:flex-none px-3.5 py-2 rounded-lg border-2 border-black bg-black hover:bg-neutral-800 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-[2px_2px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer min-h-[44px] disabled:opacity-50"
                      >
                        {isDownloadingBatch ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>{batchProgressText || 'Menyiapkan...'}</span>
                          </>
                        ) : (
                          <>
                            <FileArchive className="w-3.5 h-3.5 stroke-[2.5]" />
                            <span>{t.gallery.downloadAllSlides || 'Unduh Semua Slide (ZIP)'}</span>
                          </>
                        )}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleDownload(previewModalItem)}
                      className="px-3.5 py-2 rounded-lg border-2 border-black bg-black hover:bg-neutral-800 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-[2px_2px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer min-h-[44px]"
                    >
                      <Download className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>{t.gallery.redownload}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setPreviewModalItem(null)}
                    className="px-3 py-2 rounded-lg border-2 border-black bg-white hover:bg-neutral-100 text-black font-bold text-xs shadow-[1.5px_1.5px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer min-h-[44px]"
                  >
                    Tutup
                  </button>
                </div>
              </div>

            </div>
          </div>
        );
      })()}

    </main>
  );
}
