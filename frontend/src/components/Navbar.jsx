import React, { useState, useRef, useEffect } from 'react';
import { 
  ArrowLeft, 
  ChevronDown,
  Search,
  Check,
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
  Images,
  Home,
  History,
  Settings,
  RefreshCw,
  Tv,
  BookOpen
} from 'lucide-react';
import { translations } from '../utils/translations';
import { useAppUpdate } from '../hooks/useAppUpdate';
import UpdateModal from './UpdateModal';

export default function Navbar({ 
  currentScreen, 
  onSelectTool, 
  onGoHome, 
  onNavigate,
  settings 
}) {
  const [toolsDropdownOpen, setToolsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const appUpdate = useAppUpdate();

  const lang = settings?.language || 'id';
  const t = translations[lang] || translations.id;

  const showGallery = settings?.showGallery !== false;
  const showHistory = settings?.showHistory !== false;

  const tools = [
    { id: 'downloader', label: t.welcome?.tools?.downloader?.name || 'Media Downloader', icon: Download },
    { id: 'jjFinder', label: t.welcome?.tools?.jjFinder?.name || 'Cari Link JJ', icon: Flame },
    { id: 'pngToPdf', label: t.welcome?.tools?.pngToPdf?.name || 'PNG to PDF', icon: Images },
    { id: 'linkToDoc', label: t.welcome?.tools?.linkToDoc?.name || 'Link to PDF/PPT', icon: FileText },
    { id: 'imageToLink', label: t.welcome?.tools?.imageToLink?.name || 'File ke Link', icon: Link2 },
    { id: 'compressor', label: t.welcome?.tools?.compressor?.name || 'Kompres Media HD', icon: Minimize2 },
    { id: 'qrStudio', label: t.welcome?.tools?.qrStudio?.name || 'QR Code Studio', icon: QrCode },
    { id: 'audioMerger', label: t.welcome?.tools?.audioMerger?.name || 'Audio Merger', icon: Music },
    { id: 'photoStudio', label: t.welcome?.tools?.photoStudio?.name || 'Photo Studio', icon: Sparkles },
    { id: 'videoStudio', label: t.welcome?.tools?.videoStudio?.name || 'Video Studio', icon: Film },
    { id: 'videoTrimmer', label: t.welcome?.tools?.videoTrimmer?.name || 'Video Trimmer', icon: Scissors },
    { id: 'bgRemover', label: t.welcome?.tools?.bgRemover?.name || 'Hapus Background', icon: Scissors },
    { id: 'resolver', label: t.welcome?.tools?.resolver?.name || 'Safelink Resolver', icon: Link2 },
    { id: 'animeFinder', label: t.welcome?.tools?.animeFinder?.name || 'Rekomendasi Anime', icon: Tv },
    { id: 'manhwaFinder', label: t.welcome?.tools?.manhwaFinder?.name || 'Rekomendasi Manhwa', icon: BookOpen }
  ];

  const currentToolObj = tools.find(t => t.id === currentScreen);
  const isMainTab = currentScreen === 'welcome' || currentScreen === 'gallery' || currentScreen === 'history' || currentScreen === 'settings';

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setToolsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearchClick = () => {
    if (currentScreen !== 'welcome' && onGoHome) {
      onGoHome();
      setTimeout(() => {
        const searchEl = document.getElementById('search-tools-input');
        if (searchEl) {
          searchEl.focus();
          searchEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
      return;
    }

    const searchEl = document.getElementById('search-tools-input');
    if (searchEl) {
      searchEl.focus();
      searchEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const desktopNavItems = [
    { id: 'welcome', label: t.nav.home, icon: Home },
    ...(showGallery ? [{ id: 'gallery', label: t.nav.gallery, icon: Images }] : []),
    ...(showHistory ? [{ id: 'history', label: t.nav.history, icon: History }] : []),
    { id: 'settings', label: t.nav.settings, icon: Settings }
  ];

  return (
    <header className="sticky top-0 z-50 bg-white border-b-2 border-black w-full">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-3">
        
        {/* Brand Logo: KURO STUDIO */}
        <button
          onClick={onGoHome}
          className="flex items-center gap-2 group cursor-pointer text-left transition-transform active:scale-98 shrink-0"
          title="Kuro Studio - Beranda"
        >
          <div className="w-8 h-8 rounded-md bg-black text-white flex items-center justify-center font-mono font-black text-sm border-2 border-black shadow-[1.5px_1.5px_0px_#000000]">
            K
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="font-black text-lg sm:text-xl tracking-tight text-black font-display">
              KURO
            </span>
            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border border-black bg-white text-black tracking-wider uppercase">
              STUDIO
            </span>
          </div>
        </button>

        {/* Desktop Navigation Links & Search Menu */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          
          {/* Navigation Bar Desktop (Di dekat menu cari bagian atas) */}
          <nav aria-label="Desktop Navigation" className="hidden md:flex items-center gap-1 bg-neutral-100 p-1 rounded-lg border-2 border-black">
            {desktopNavItems.map(item => {
              const Icon = item.icon;
              const isActive = currentScreen === item.id || (item.id === 'welcome' && !['gallery', 'history', 'settings'].includes(currentScreen));
              
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  className={`px-2.5 py-1 rounded-md text-xs font-bold font-sans flex items-center gap-1.5 transition-all cursor-pointer ${
                    isActive
                      ? 'bg-black text-white shadow-[1.5px_1.5px_0px_#000000]'
                      : 'text-neutral-700 hover:text-black hover:bg-white/70'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 stroke-[2.2]" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Tombol Unduh APK / Update & Cari atau Tool Switcher */}
          {isMainTab ? (
            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* Tombol In-App Update dengan Pulse & Badge jika ada pembaruan baru */}
              <button
                type="button"
                onClick={appUpdate.openModal}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg border-2 border-black font-bold text-xs sm:text-sm transition-all flex items-center gap-1.5 shadow-[2px_2px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer relative select-none ${
                  appUpdate.hasUpdate 
                    ? 'bg-rose-500 text-white hover:bg-rose-600 animate-pulse ring-2 ring-rose-400' 
                    : 'bg-white text-black hover:bg-neutral-100'
                }`}
                title={appUpdate.hasUpdate 
                  ? (lang === 'en' ? 'App update available! Click to update' : 'Pembaruan aplikasi tersedia! Klik untuk update') 
                  : (lang === 'en' ? 'App is up to date' : 'Versi aplikasi sudah terbaru')}
              >
                <RefreshCw className={`w-3.5 h-3.5 stroke-[2.5] ${appUpdate.hasUpdate ? 'text-white' : 'text-blue-600'} ${appUpdate.isChecking ? 'animate-spin' : ''}`} />
                <span className="whitespace-nowrap">
                  {appUpdate.hasUpdate 
                    ? (lang === 'en' ? `Update (${appUpdate.pendingCount})` : `Update (${appUpdate.pendingCount})`) 
                    : 'Update'}
                </span>

                {/* Badge Notifikasi Angka Dinamis (Menghitung Akumulasi Update Tertunda) */}
                {appUpdate.pendingCount > 0 && (
                  <span className="absolute -top-2 -right-2 flex items-center justify-center">
                    <span className="animate-ping absolute inline-flex h-4 w-4 rounded-full bg-yellow-400 opacity-80"></span>
                    <span className="relative inline-flex min-w-4.5 h-4.5 px-1 rounded-full bg-yellow-400 text-black border-2 border-black font-black text-[9px] items-center justify-center shadow-[1px_1px_0px_#000000]">
                      {appUpdate.pendingCount}
                    </span>
                  </span>
                )}
              </button>

              <button
                onClick={handleSearchClick}
                className="px-3.5 py-1.5 rounded-lg border-2 border-black bg-black text-white font-bold text-xs sm:text-sm hover:bg-neutral-800 transition-all flex items-center gap-1.5 shadow-[2px_2px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer"
              >
                <Search className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>{t.nav.search}</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2" ref={dropdownRef}>
              <button
                onClick={onGoHome}
                className="px-3 py-1.5 rounded-lg border-2 border-black bg-white text-black font-bold text-xs sm:text-sm hover:bg-black hover:text-white transition-all flex items-center gap-1.5 shadow-[2px_2px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5 stroke-[2.5]" />
                <span className="hidden xs:inline">{t.nav.backToHome}</span>
              </button>

              {/* Tool Switcher Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setToolsDropdownOpen(!toolsDropdownOpen)}
                  className="px-3 py-1.5 rounded-lg border-2 border-black bg-white text-black font-bold text-xs flex items-center gap-1.5 transition-all shadow-[2px_2px_0px_#000000] hover:bg-neutral-50 cursor-pointer"
                >
                  <span className="max-w-[120px] truncate">
                    {currentToolObj?.label || t.nav.switchTool}
                  </span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-150 ${toolsDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {toolsDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-56 rounded-lg p-1.5 bg-white border-2 border-black shadow-[4px_4px_0px_#000000] z-50">
                    <div className="px-2.5 py-1 text-[10px] font-mono uppercase text-black font-bold border-b border-black mb-1">
                      {t.nav.switchTool}
                    </div>
                    <div className="max-h-64 overflow-y-auto space-y-0.5 custom-scrollbar">
                      {tools.map((t) => {
                        const Icon = t.icon;
                        const isCurrent = t.id === currentScreen;
                        return (
                          <button
                            key={t.id}
                            onClick={() => {
                              onSelectTool(t.id);
                              setToolsDropdownOpen(false);
                            }}
                            className={`w-full px-2 py-1.5 rounded text-left text-xs font-semibold flex items-center justify-between gap-2 transition-all cursor-pointer ${
                              isCurrent
                                ? 'bg-black text-white'
                                : 'text-black hover:bg-neutral-100'
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate">
                              <Icon className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">{t.label}</span>
                            </div>
                            {isCurrent && <Check className="w-3.5 h-3.5 shrink-0 stroke-[3]" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

      </div>

      {/* ─── NOTIFIKASI BANNER SAAT ADA PEMBARUAN VERSI BARU ─── */}
      {appUpdate.hasUpdate && (
        <div className="w-full bg-gradient-to-r from-amber-300 via-rose-300 to-amber-300 border-t-2 border-b-2 border-black px-4 py-2 flex items-center justify-between gap-3 text-xs font-bold shadow-[0_2px_4px_rgba(0,0,0,0.1)]">
          <div className="flex items-center gap-2 truncate">
            <span className="bg-black text-white text-[10px] font-mono px-2 py-0.5 rounded border border-black uppercase tracking-wider shrink-0 animate-pulse">
              {appUpdate.pendingCount > 1 
                ? `${appUpdate.pendingCount} Updates (v${appUpdate.latestInfo?.latestVersion || '1.5.2'})`
                : `Update v${appUpdate.latestInfo?.latestVersion || '1.5.2'}`}
            </span>
            <span className="truncate text-black font-extrabold text-[11px] sm:text-xs">
              {lang === 'en' 
                ? `${appUpdate.pendingCount} accumulated updates available! Tap to apply all in-app.` 
                : `${appUpdate.pendingCount} pembaruan terakumulasi! Ketuk untuk terapkan langsung di aplikasi.`}
            </span>
          </div>
          <button
            type="button"
            onClick={appUpdate.openModal}
            className="px-3 py-1 bg-black text-white text-[11px] font-extrabold rounded-lg border-2 border-black hover:bg-neutral-800 transition-all shrink-0 shadow-[2px_2px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none cursor-pointer flex items-center gap-1.5"
          >
            <RefreshCw className="w-3 h-3 stroke-[2.5]" />
            <span>{lang === 'en' ? 'Update Now' : 'Update Sekarang'}</span>
          </button>
        </div>
      )}

      {/* Modal Pembaruan Aplikasi In-App */}
      <UpdateModal
        isOpen={appUpdate.showModal}
        onClose={appUpdate.closeModal}
        latestInfo={appUpdate.latestInfo}
        localVersion={appUpdate.localVersion}
        hasUpdate={appUpdate.hasUpdate}
        missedCount={appUpdate.missedCount}
        pendingCount={appUpdate.pendingCount}
        missedUpdates={appUpdate.missedUpdates}
        pendingUpdates={appUpdate.pendingUpdates}
        isDownloading={appUpdate.isDownloading}
        downloadProgress={appUpdate.downloadProgress}
        downloadPhase={appUpdate.downloadPhase}
        downloadStatus={appUpdate.downloadStatus}
        networkSpeedLabel={appUpdate.networkSpeedLabel}
        onStartDownload={appUpdate.startDownloadUpdate}
        onCheckAgain={appUpdate.checkForUpdates}
        isChecking={appUpdate.isChecking}
        lang={lang}
      />
    </header>
  );
}
