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
  RefreshCw
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
    { id: 'resolver', label: t.welcome?.tools?.resolver?.name || 'Safelink Resolver', icon: Link2 }
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
              {/* Versi Web: Tombol Unduh APK */}
              {!appUpdate.isNativeApp ? (
                <a
                  href="/AllToolsKuro.apk"
                  download="AllToolsKuro.apk"
                  className="px-2.5 sm:px-3 py-1.5 rounded-lg border-2 border-black bg-white text-black font-bold text-xs sm:text-sm hover:bg-neutral-100 transition-all flex items-center gap-1.5 shadow-[2px_2px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer no-underline select-none"
                  title="Unduh Aplikasi AllToolsKuro (.apk)"
                >
                  <Download className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span className="whitespace-nowrap">{t.nav.downloadApk || 'Unduh APK'}</span>
                </a>
              ) : (
                /* Versi Aplikasi Android: Tombol Update dengan Pulse & Red Dot Badge */
                <button
                  type="button"
                  onClick={appUpdate.openModal}
                  className={`px-2.5 sm:px-3 py-1.5 rounded-lg border-2 border-black bg-white text-black font-bold text-xs sm:text-sm hover:bg-neutral-100 transition-all flex items-center gap-1.5 shadow-[2px_2px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer relative select-none ${
                    appUpdate.hasUpdate ? 'ring-2 ring-blue-500/70 bg-blue-50/70 animate-pulse' : ''
                  }`}
                  title={appUpdate.hasUpdate ? 'Pembaruan aplikasi tersedia! Klik untuk update' : 'Versi aplikasi sudah terbaru'}
                >
                  <RefreshCw className={`w-3.5 h-3.5 stroke-[2.5] text-blue-600 ${appUpdate.isChecking ? 'animate-spin' : ''}`} />
                  <span className="whitespace-nowrap">Update</span>

                  {/* Dot Notification Badge Titik Merah Dinamis */}
                  {appUpdate.hasUpdate && (
                    <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-600 border border-black"></span>
                    </span>
                  )}
                </button>
              )}

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

      {/* Modal Pembaruan Aplikasi Android (#1a1a2e Anime Modern) */}
      <UpdateModal
        isOpen={appUpdate.showModal}
        onClose={appUpdate.closeModal}
        latestInfo={appUpdate.latestInfo}
        localVersion={appUpdate.localVersion}
        isDownloading={appUpdate.isDownloading}
        downloadProgress={appUpdate.downloadProgress}
        downloadStatus={appUpdate.downloadStatus}
        onStartDownload={appUpdate.startDownloadUpdate}
      />
    </header>
  );
}
