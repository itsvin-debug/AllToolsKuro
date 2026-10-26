import React, { useState, useEffect } from 'react';
import { 
  Download,
  Flame, 
  FileText, 
  Link2, 
  Minimize2, 
  QrCode, 
  Music, 
  Sparkles, 
  Film, 
  Scissors, 
  ArrowRight, 
  X,
  Filter,
  Images,
  Lock,
  Unlock
} from 'lucide-react';
import KuroIdentityCard from './KuroIdentityCard';
import { translations } from '../utils/translations';
import { getLockedTools, toggleToolLock, syncLockedToolsFromServer } from '../services/storageService';

export default function WelcomeScreen({ onSelectPlatform, onOpenTool, onShowToast, lang = 'id' }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');

  const [isAdmin, setIsAdmin] = useState(() => {
    return localStorage.getItem('kuro_admin_auth') === 'true' || 
           localStorage.getItem('kaze_admin_auth') === 'true' ||
           localStorage.getItem('kuro_user_role') === 'Admin';
  });

  const [lockedTools, setLockedTools] = useState(() => getLockedTools());

  useEffect(() => {
    // Sinkronisasi status kunci terbaru dari server saat halaman dimuat
    syncLockedToolsFromServer().then((latest) => {
      if (Array.isArray(latest)) setLockedTools(latest);
    });

    const handleSync = () => {
      const isAuth = localStorage.getItem('kuro_admin_auth') === 'true' || 
                     localStorage.getItem('kaze_admin_auth') === 'true' ||
                     localStorage.getItem('kuro_user_role') === 'Admin';
      setIsAdmin(isAuth);
      setLockedTools(getLockedTools());
    };

    window.addEventListener('kuro_locked_tools_updated', handleSync);
    window.addEventListener('storage', handleSync);
    return () => {
      window.removeEventListener('kuro_locked_tools_updated', handleSync);
      window.removeEventListener('storage', handleSync);
    };
  }, []);

  const t = translations[lang] || translations.id;
  const wt = t.welcome;

  const categories = [
    { id: 'all', label: wt.catAll, count: 12 },
    { id: 'downloader', label: wt.catDownloader, count: 2 },
    { id: 'file', label: wt.catFile, count: 4 },
    { id: 'creative', label: wt.catCreative, count: 5 },
    { id: 'utility', label: wt.catUtility, count: 1 }
  ];

  const tools = [
    {
      id: 'downloader',
      category: 'downloader',
      name: wt.tools.downloader.name,
      desc: wt.tools.downloader.desc,
      tag: wt.tools.downloader.tag,
      icon: Download,
      onClick: () => onOpenTool('downloader')
    },
    {
      id: 'jjFinder',
      category: 'downloader',
      name: wt.tools.jjFinder.name,
      desc: wt.tools.jjFinder.desc,
      tag: wt.tools.jjFinder.tag,
      icon: Flame,
      onClick: () => onOpenTool('jjFinder')
    },
    {
      id: 'pngToPdf',
      category: 'file',
      name: wt.tools.pngToPdf.name,
      desc: wt.tools.pngToPdf.desc,
      tag: wt.tools.pngToPdf.tag,
      icon: Images,
      onClick: () => onOpenTool('pngToPdf')
    },
    {
      id: 'linkToDoc',
      category: 'file',
      name: wt.tools.linkToDoc.name,
      desc: wt.tools.linkToDoc.desc,
      tag: wt.tools.linkToDoc.tag,
      icon: FileText,
      onClick: () => onOpenTool('linkToDoc')
    },
    {
      id: 'imageToLink',
      category: 'file',
      name: wt.tools.imageToLink.name,
      desc: wt.tools.imageToLink.desc,
      tag: wt.tools.imageToLink.tag,
      icon: Link2,
      onClick: () => onOpenTool('imageToLink')
    },
    {
      id: 'compressor',
      category: 'file',
      name: wt.tools.compressor.name,
      desc: wt.tools.compressor.desc,
      tag: wt.tools.compressor.tag,
      icon: Minimize2,
      onClick: () => onOpenTool('compressor')
    },
    {
      id: 'qrStudio',
      category: 'creative',
      name: wt.tools.qrStudio.name,
      desc: wt.tools.qrStudio.desc,
      tag: wt.tools.qrStudio.tag,
      icon: QrCode,
      onClick: () => onOpenTool('qrStudio')
    },
    {
      id: 'audioMerger',
      category: 'creative',
      name: wt.tools.audioMerger.name,
      desc: wt.tools.audioMerger.desc,
      tag: wt.tools.audioMerger.tag,
      icon: Music,
      onClick: () => onOpenTool('audioMerger')
    },
    {
      id: 'photoStudio',
      category: 'creative',
      name: wt.tools.photoStudio.name,
      desc: wt.tools.photoStudio.desc,
      tag: wt.tools.photoStudio.tag,
      icon: Sparkles,
      onClick: () => onOpenTool('photoStudio')
    },
    {
      id: 'videoStudio',
      category: 'creative',
      name: wt.tools.videoStudio.name,
      desc: wt.tools.videoStudio.desc,
      tag: wt.tools.videoStudio.tag,
      icon: Film,
      onClick: () => onOpenTool('videoStudio')
    },
    {
      id: 'videoTrimmer',
      category: 'creative',
      name: wt.tools.videoTrimmer.name,
      desc: wt.tools.videoTrimmer.desc,
      tag: wt.tools.videoTrimmer.tag,
      icon: Scissors,
      onClick: () => onOpenTool('videoTrimmer')
    },
    {
      id: 'bgRemover',
      category: 'utility',
      name: wt.tools.bgRemover.name,
      desc: wt.tools.bgRemover.desc,
      tag: wt.tools.bgRemover.tag,
      icon: Scissors,
      onClick: () => onOpenTool('bgRemover')
    }
  ];

  const filteredTools = tools.filter((tool) => {
    const matchesCategory = activeCategory === 'all' || tool.category === activeCategory;
    if (!matchesCategory) return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      tool.name.toLowerCase().includes(q) ||
      tool.desc.toLowerCase().includes(q) ||
      tool.tag.toLowerCase().includes(q)
    );
  });

  return (
    <main className="flex-grow flex flex-col items-center justify-start px-4 sm:px-6 py-6 sm:py-8 w-full max-w-4xl mx-auto">
      
      {/* ─── 1. IDENTITAS & MEDIA PROFIL ─── */}
      <KuroIdentityCard 
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onSearchSubmit={(q) => setSearchQuery(q)}
        lang={lang}
      />

      {/* ─── 2. SECTION ALAT UTAMA ─── */}
      <section className="w-full mt-3 flex flex-col gap-4">
        
        {/* Header Kategori Filter */}
        <div className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b-2 border-black">
          <div>
            <h2 className="text-base sm:text-lg font-black tracking-tight font-display text-black flex items-center gap-2">
              <span>{wt.mainTools}</span>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded border border-black bg-black text-white">
                {filteredTools.length} {wt.toolsCount}
              </span>
            </h2>
            <p className="text-xs text-neutral-600 mt-0.5">
              {wt.subtitle}
            </p>
          </div>

          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="text-xs text-black font-mono font-bold flex items-center gap-1 self-start sm:self-auto cursor-pointer hover:underline"
            >
              <X className="w-3.5 h-3.5" />
              <span>{wt.resetSearch}</span>
            </button>
          )}
        </div>

        {/* Filter Kategori: Pills Neobrutalisme */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1.5 w-full custom-scrollbar">
          {categories.map((cat) => {
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all duration-150 cursor-pointer flex items-center gap-1.5 shrink-0 border-2 border-black ${
                  isActive
                    ? 'bg-black text-white shadow-[2px_2px_0px_#000000]'
                    : 'bg-white text-black hover:bg-neutral-100'
                }`}
              >
                <span>{cat.label}</span>
                <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded border border-black ${
                  isActive ? 'bg-white text-black' : 'bg-neutral-100 text-black'
                }`}>
                  {cat.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Grid Card Alat: Clean Neobrutalism (NO POP-UPS) */}
        {filteredTools.length === 0 ? (
          <div className="w-full py-12 rounded-xl border-2 border-black text-center flex flex-col items-center justify-center p-6 bg-white shadow-[3px_3px_0px_#000000]">
            <Filter className="w-8 h-8 text-black stroke-[2] mb-2" />
            <p className="font-extrabold text-sm text-black">Alat tidak ditemukan</p>
            <p className="text-xs text-neutral-600 mt-1">Coba gunakan kata kunci pencarian yang lain.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-4 w-full">
            {filteredTools.map((tool) => {
              const Icon = tool.icon;
              const isLocked = lockedTools.includes(tool.id);

              const handleCardClick = () => {
                if (isLocked && !isAdmin) {
                  if (onShowToast) {
                    onShowToast(`⚠️ Fitur "${tool.name}" sedang dikunci oleh Admin untuk perbaikan dan tidak dapat digunakan.`);
                  }
                  return;
                }
                tool.onClick();
              };

              return (
                <div
                  key={tool.id}
                  onClick={handleCardClick}
                  className={`rounded-xl border-2 p-3 sm:p-5 flex flex-col justify-between text-left transition-all duration-150 select-none min-h-[180px] sm:min-h-[190px] relative overflow-hidden ${
                    isLocked && !isAdmin 
                      ? 'border-neutral-400 bg-neutral-100 shadow-none cursor-not-allowed opacity-95' 
                      : isLocked && isAdmin
                      ? 'border-amber-600 bg-amber-50/60 shadow-[2px_2px_0px_#d97706] sm:shadow-[3px_3px_0px_#d97706] hover:-translate-x-0.5 hover:-translate-y-0.5 cursor-pointer'
                      : 'border-black bg-white shadow-[2px_2px_0px_#000000] sm:shadow-[3px_3px_0px_#000000] hover:shadow-[4px_4px_0px_#000000] hover:-translate-x-0.5 hover:-translate-y-0.5 cursor-pointer'
                  }`}
                >
                  {/* Watermark Gembok untuk Member saat Terkunci */}
                  {isLocked && !isAdmin && (
                    <div className="absolute -right-5 -bottom-5 pointer-events-none text-neutral-300/70 select-none">
                      <Lock className="w-28 h-28 stroke-[1.5]" />
                    </div>
                  )}

                  {/* Header Card: Icon, Admin Lock Button, & Tag Badge */}
                  <div className="flex items-center justify-between w-full mb-2 sm:mb-2.5 gap-1.5 relative z-10">
                    <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-md border-2 flex items-center justify-center shrink-0 ${
                      isLocked && !isAdmin
                        ? 'border-neutral-400 bg-neutral-200 text-neutral-500 shadow-none'
                        : isLocked && isAdmin
                        ? 'border-amber-600 bg-amber-200 text-amber-900 shadow-[1px_1px_0px_#d97706]'
                        : 'border-black bg-white text-black shadow-[1px_1px_0px_#000000] sm:shadow-[1.5px_1.5px_0px_#000000]'
                    }`}>
                      <Icon className="w-4 h-4 sm:w-4.5 sm:h-4.5 stroke-[2.2]" />
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Kontrol Kunci / Buka Kunci Khusus Admin */}
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={async (e) => {
                            e.stopPropagation();
                            await toggleToolLock(tool.id);
                            setLockedTools(getLockedTools());
                            if (onShowToast) {
                              onShowToast(isLocked ? `Fitur "${tool.name}" dibuka untuk semua pengguna.` : `Fitur "${tool.name}" dikunci untuk perbaikan.`);
                            }
                          }}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border transition-all cursor-pointer flex items-center gap-1 ${
                            isLocked
                              ? 'border-amber-600 bg-amber-400 text-black hover:bg-amber-500 shadow-xs'
                              : 'border-black bg-neutral-100 text-black hover:bg-neutral-200'
                          }`}
                          title={isLocked ? 'Klik untuk membuka kunci fitur' : 'Klik untuk mengunci fitur'}
                        >
                          {isLocked ? (
                            <>
                              <Lock className="w-2.5 h-2.5 stroke-[2.5]" />
                              <span className="hidden xs:inline">Terkunci</span>
                            </>
                          ) : (
                            <>
                              <Unlock className="w-2.5 h-2.5 stroke-[2.5]" />
                              <span className="hidden xs:inline">Kunci</span>
                            </>
                          )}
                        </button>
                      )}

                      {/* Badge Kunci untuk Member Biasa */}
                      {!isAdmin && isLocked ? (
                        <span className="text-[9px] sm:text-[10px] font-mono font-black px-1.5 sm:px-2 py-0.5 rounded border-2 border-amber-600 bg-amber-300 text-black flex items-center gap-1 shadow-[1px_1px_0px_#d97706]">
                          <Lock className="w-2.5 h-2.5 stroke-[3]" />
                          <span>TERKUNCI</span>
                        </span>
                      ) : (
                        <span className="text-[9px] sm:text-[10px] font-mono font-bold px-1.5 sm:px-2 py-0.5 rounded border border-black bg-neutral-100 text-black truncate max-w-[80px] xs:max-w-[100px] sm:max-w-none text-right">
                          {tool.tag}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Body Card: Judul & Deskripsi Fungsional */}
                  <div className="my-1 sm:my-1.5 flex flex-col flex-1 relative z-10">
                    <h3 className={`text-xs sm:text-base font-extrabold tracking-tight font-sans line-clamp-2 leading-snug flex items-center gap-1.5 ${
                      isLocked && !isAdmin ? 'text-neutral-500' : 'text-black'
                    }`}>
                      {isLocked && !isAdmin && (
                        <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0 stroke-[2.5]" />
                      )}
                      <span>{tool.name}</span>
                    </h3>
                    <p className={`text-[10.5px] sm:text-xs mt-1 line-clamp-2 leading-tight sm:leading-relaxed ${
                      isLocked && !isAdmin ? 'text-neutral-500 font-medium' : 'text-neutral-600'
                    }`}>
                      {isLocked && !isAdmin 
                        ? 'Fitur ini sedang ditutup dan dalam tahap perbaikan oleh Admin.' 
                        : tool.desc}
                    </p>
                  </div>

                  {/* Footer Card: Tombol Buka Alat */}
                  <div className="mt-2.5 sm:mt-3 pt-2 sm:pt-2.5 border-t border-black/15 relative z-10">
                    {isLocked && !isAdmin ? (
                      <button
                        type="button"
                        disabled
                        className="w-full py-1.5 sm:py-2 px-2 sm:px-3 rounded-lg border-2 border-neutral-300 bg-neutral-200 text-neutral-500 font-bold text-[11px] sm:text-xs flex items-center justify-center gap-1.5 cursor-not-allowed shadow-none"
                      >
                        <Lock className="w-3 h-3 stroke-[2.5]" />
                        <span>Akses Ditutup (Perbaikan)</span>
                      </button>
                    ) : isLocked && isAdmin ? (
                      <button
                        type="button"
                        className="w-full py-1.5 sm:py-2 px-2 sm:px-3 rounded-lg border-2 border-amber-600 bg-amber-400 hover:bg-amber-500 text-black font-bold text-[11px] sm:text-xs flex items-center justify-center gap-1 transition-colors cursor-pointer"
                      >
                        <Lock className="w-3 h-3 stroke-[2.5]" />
                        <span>Buka (Admin Test)</span>
                        <ArrowRight className="w-3 h-3 stroke-[2.5]" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="w-full py-1.5 sm:py-2 px-2 sm:px-3 rounded-lg border-2 border-black bg-black text-white font-bold text-[11px] sm:text-xs flex items-center justify-center gap-1 sm:gap-1.5 hover:bg-neutral-800 transition-colors cursor-pointer"
                      >
                        <span>Buka Alat</span>
                        <ArrowRight className="w-3 h-3 sm:w-3.5 sm:h-3.5 stroke-[2.5]" />
                      </button>
                    )}
                  </div>

                </div>
              );
            })}
          </div>
        )}

      </section>

    </main>
  );
}
