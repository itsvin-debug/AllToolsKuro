import React, { useState, useMemo } from 'react';
import CosmicBackButton from '../../shared/components/CosmicBackButton';
import { 
  Settings as SettingsIcon, 
  Sliders, 
  Folder, 
  Globe, 
  AlertCircle, 
  Info, 
  ChevronRight, 
  Search, 
  Check, 
  Copy, 
  RefreshCcw, 
  Trash2, 
  HelpCircle, 
  ExternalLink, 
  X,
  Layers,
  ShieldCheck,
  Smartphone,
  ArrowLeft
} from 'lucide-react';
import { translations } from '../../shared/utils/translations';
import { getDeviceId, resetDeviceSettings, clearGallery } from '../../shared/utils/storageService';
import ConfirmModal from '../../shared/components/ConfirmModal';

export default function SettingsScreen({ 
  settings, 
  onUpdateSettings, 
  onBack, 
  onShowToast 
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSectionId, setActiveSectionId] = useState(null);
  const [copiedDeviceId, setCopiedDeviceId] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(null);

  const lang = settings.language || 'id';
  const isEn = lang === 'en';
  const t = translations[lang] || translations.id;
  const st = t.settings;

  const deviceId = getDeviceId();

  const handleToggle = (key, customOnMsg, customOffMsg) => {
    const nextVal = !settings[key];
    onUpdateSettings({ [key]: nextVal });

    if (onShowToast) {
      const msg = nextVal ? customOnMsg : customOffMsg;
      onShowToast(msg);
    }
  };

  const handleLanguageChange = (newLang) => {
    if (newLang === settings.language) return;
    onUpdateSettings({ language: newLang });
    if (onShowToast) {
      onShowToast(newLang === 'en' ? 'Language switched to English' : 'Bahasa berhasil diubah ke Bahasa Indonesia');
    }
  };

  const handleFontChange = (fontName) => {
    onUpdateSettings({ fontFamily: fontName });
    if (onShowToast) {
      onShowToast(`${t.toasts.fontChanged} ${fontName}`);
    }
  };

  const handleTextSizeChange = (size) => {
    onUpdateSettings({ textSize: size });
    if (onShowToast) {
      const label = size === 'small' ? st.textSizeSmall : size === 'large' ? st.textSizeLarge : st.textSizeNormal;
      onShowToast(`${t.toasts.textSizeChanged} ${label}`);
    }
  };

  const handleSpeedChange = (speed) => {
    onUpdateSettings({ animationSpeed: speed });
    if (onShowToast) {
      const label = speed === 'fast' ? st.animFast : speed === 'relaxed' ? st.animRelaxed : st.animNormal;
      onShowToast(`${st.animSpeedTitle}: ${label}`);
    }
  };

  const handleCornerChange = (corner) => {
    onUpdateSettings({ cornerStyle: corner });
    if (onShowToast) {
      const label = corner === 'sharp' ? st.cornerSharp : corner === 'soft' ? st.cornerSoft : st.cornerRounded;
      onShowToast(`${t.toasts.cornerChanged} ${label}`);
    }
  };

  const handleBorderChange = (thickness) => {
    onUpdateSettings({ borderThickness: thickness });
    if (onShowToast) {
      const label = thickness === 'thin' ? st.borderThin : thickness === 'heavy' ? st.borderHeavy : st.borderNormal;
      onShowToast(`${t.toasts.borderChanged} ${label}`);
    }
  };

  const handleShadowChange = (shadow) => {
    onUpdateSettings({ shadowOffset: shadow });
    if (onShowToast) {
      const label = shadow === 'flat' ? st.shadowFlat : shadow === 'deep' ? st.shadowDeep : st.shadowHard;
      onShowToast(`${t.toasts.shadowChanged} ${label}`);
    }
  };

  const handleBgFxChange = (fx) => {
    onUpdateSettings({ backgroundFx: fx });
    if (onShowToast) {
      const label = fx === 'grid' ? st.bgFxGrid : fx === 'off' ? st.bgFxOff : st.bgFxSakura;
      onShowToast(`${t.toasts.bgFxChanged} ${label}`);
    }
  };

  const handleAccentChange = (accent) => {
    onUpdateSettings({ accentColor: accent });
    if (onShowToast) {
      const label = accent === 'yellow' ? st.accentYellow : accent === 'pink' ? st.accentPink : accent === 'mint' ? st.accentMint : st.accentMonochrome;
      onShowToast(`${t.toasts.accentChanged} ${label}`);
    }
  };

  const handleCopyDeviceId = () => {
    navigator.clipboard?.writeText(deviceId);
    setCopiedDeviceId(true);
    if (onShowToast) {
      onShowToast(isEn ? 'Device ID copied to clipboard' : 'Device ID berhasil disalin ke clipboard');
    }
    setTimeout(() => setCopiedDeviceId(false), 2000);
  };

  const handleClearGallery = () => {
    setConfirmDialog({
      title: isEn ? 'Clear Gallery' : 'Kosongkan Galeri',
      message: st.clearGalleryConfirm,
      confirmText: isEn ? 'Yes, Delete All' : 'Ya, Hapus Semua',
      type: 'danger',
      onConfirm: () => {
        clearGallery();
        setConfirmDialog(null);
        if (onShowToast) {
          onShowToast(st.galleryClearedMsg);
        }
      }
    });
  };

  const handleFactoryReset = () => {
    setConfirmDialog({
      title: isEn ? 'Factory Reset' : 'Reset ke Setelan Pabrik',
      message: st.factoryResetConfirm,
      confirmText: isEn ? 'Yes, Reset Now' : 'Ya, Reset Sekarang',
      type: 'danger',
      onConfirm: () => {
        const defaults = resetDeviceSettings();
        onUpdateSettings(defaults);
        setConfirmDialog(null);
        if (onShowToast) {
          onShowToast(st.factoryResetSuccessMsg);
        }
      }
    });
  };

  // Definisi 6 Kartu Utama (Sesuai Struktur Visual Foto 2)
  const sections = useMemo(() => [
    {
      id: 'general',
      icon: SettingsIcon,
      title: st.secGeneral.title,
      subtitle: st.secGeneral.subtitle,
      keywords: ['bahasa', 'language', 'otomasi', 'automation', 'keamanan', 'security', 'privasi', 'privacy']
    },
    {
      id: 'lookFeel',
      icon: Sliders,
      title: st.secLookFeel.title,
      subtitle: st.secLookFeel.subtitle,
      keywords: ['tema', 'theme', 'dark mode', 'gelap', 'font', 'tipografi', 'animasi', 'animation', 'sudut', 'corner', 'kompak', 'compact']
    },
    {
      id: 'storage',
      icon: Folder,
      title: st.secStorage.title,
      subtitle: st.secStorage.subtitle,
      keywords: ['penyimpanan', 'storage', 'download', 'unduh', 'device id', 'perangkat', 'galeri', 'gallery', 'riwayat', 'history', 'isolasi']
    },
    {
      id: 'network',
      icon: Globe,
      title: st.secNetwork.title,
      subtitle: st.secNetwork.subtitle,
      keywords: ['jaringan', 'network', 'koneksi', 'connection', 'performa', 'performance', 'latency', 'latensi', 'ping', 'server', 'engine']
    },
    {
      id: 'advanced',
      icon: AlertCircle,
      title: st.secAdvanced.title,
      subtitle: st.secAdvanced.subtitle,
      keywords: ['advanced', 'lanjutan', 'retensi', 'retention', 'autoplay', 'putar', 'reset', 'pabrik', 'factory']
    },
    {
      id: 'about',
      icon: Info,
      title: st.secAbout.title,
      subtitle: st.secAbout.subtitle,
      keywords: ['about', 'tentang', 'help', 'bantuan', 'faq', 'versi', 'version', 'developer', 'pengembang', 'tiktok', 'whatsapp', 'github']
    }
  ], [st]);

  // Filter pencarian preferensi
  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return sections;
    const q = searchQuery.toLowerCase();
    return sections.filter(sec => 
      sec.title.toLowerCase().includes(q) ||
      sec.subtitle.toLowerCase().includes(q) ||
      sec.keywords.some(k => k.includes(q))
    );
  }, [sections, searchQuery]);

  const activeSectionObj = sections.find(s => s.id === activeSectionId);

  // Navigasi ke sub-halaman kategori pengaturan
  const openSubpage = (sectionId) => {
    setActiveSectionId(sectionId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Navigasi kembali ke menu utama pengaturan
  const backToSettingsList = () => {
    setActiveSectionId(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <main className="flex-grow flex flex-col items-center justify-start px-4 sm:px-6 py-6 sm:py-8 max-w-2xl mx-auto w-full">
      <div className="w-full flex flex-col gap-5">
        
        {/* TAMPILAN 1: MENU UTAMA PENGATURAN (DAFTAR 6 PILIHAN KARTU FOTO 2) */}
        {!activeSectionId && (
          <>
            {/* Header Navigasi Atas & Kolom Pencarian */}
            <div className="w-full flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <CosmicBackButton onClick={onBack} label={t.nav.backToHome} />

                <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded border-2 border-black bg-neutral-100 text-black uppercase">
                  {isEn ? 'KURO • PREFERENCES' : 'KURO • PREFERENSI'}
                </span>
              </div>

              {/* Input Pencarian Pengaturan */}
              <div className="relative w-full">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-black stroke-[2.5]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={st.searchPlaceholder}
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl border-2 border-black bg-white text-black placeholder:text-neutral-500 text-xs sm:text-sm font-medium outline-none focus:ring-2 focus:ring-black transition-all shadow-[2px_2px_0px_#000000]"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-black hover:bg-neutral-100 rounded cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Judul SETTINGS Tipografi Tebal Sesuai Foto 2 */}
            <div className="w-full pt-1 pb-1">
              <h1 className="text-2xl sm:text-3xl font-black text-black tracking-tight font-display uppercase">
                {st.title}
              </h1>
              <p className="text-xs text-neutral-600 mt-0.5">
                {st.subtitle}
              </p>
            </div>

            {/* Daftar Vertikal 6 Opsi (Klik Langsung Buka Halaman Baru) */}
            <div className="w-full flex flex-col gap-3.5">
              {filteredSections.map((sec) => {
                const Icon = sec.icon;

                return (
                  <button
                    key={sec.id}
                    type="button"
                    onClick={() => openSubpage(sec.id)}
                    className="w-full rounded-xl border-2 border-black bg-white shadow-[3px_3px_0px_#000000] hover:shadow-[4px_4px_0px_#000000] hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0px_#000000] transition-all p-3.5 sm:p-4 flex items-center justify-between gap-3 text-left cursor-pointer group"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      {/* Kotak Ikon Tebal Khas Neo-Brutalist */}
                      <div className="w-11 h-11 rounded-lg border-2 border-black bg-neutral-100 group-hover:bg-black group-hover:text-white transition-colors flex items-center justify-center text-black shrink-0 shadow-[1.5px_1.5px_0px_#000000]">
                        <Icon className="w-5 h-5 stroke-[2.2]" />
                      </div>

                      <div className="flex flex-col min-w-0">
                        <span className="font-black text-sm sm:text-base text-black tracking-tight uppercase font-display truncate">
                          {sec.title}
                        </span>
                        <span className="text-[11px] text-neutral-500 font-sans truncate">
                          {sec.subtitle}
                        </span>
                      </div>
                    </div>

                    <div className="w-8 h-8 rounded-lg border-2 border-black bg-neutral-100 group-hover:bg-black group-hover:text-white flex items-center justify-center text-black shrink-0 shadow-[1px_1px_0px_#000000] transition-colors">
                      <ChevronRight className="w-4 h-4 stroke-[2.5]" />
                    </div>
                  </button>
                );
              })}

              {filteredSections.length === 0 && (
                <div className="p-8 text-center border-2 border-dashed border-black rounded-xl bg-white">
                  <p className="text-xs font-bold text-neutral-600">
                    {isEn ? 'No settings matched your search.' : 'Tidak ada pengaturan yang cocok dengan pencarian Anda.'}
                  </p>
                </div>
              )}
            </div>
          </>
        )}

        {/* TAMPILAN 2: HALAMAN SUB-DETAIL OPSI PENGATURAN (DEDICATED SUBPAGE) */}
        {activeSectionId && activeSectionObj && (
          <div className="w-full flex flex-col gap-4 animate-in fade-in duration-150">
            
            {/* Header Sub-Halaman dengan Tombol Kembali ke Pengaturan */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={backToSettingsList}
                className="px-3 py-1.5 rounded-lg border-2 border-black bg-white text-black font-bold text-xs sm:text-sm hover:bg-black hover:text-white transition-all flex items-center gap-1.5 shadow-[2px_2px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4 stroke-[2.5]" />
                <span>{isEn ? 'Back to Settings' : 'Kembali ke Pengaturan'}</span>
              </button>

              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded border border-black bg-neutral-100 text-black uppercase">
                {activeSectionObj.title}
              </span>
            </div>

            {/* Banner Kategori yang Sedang Dibuka */}
            <div className="w-full rounded-xl border-2 border-black p-4 bg-white shadow-[3px_3px_0px_#000000] flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-lg border-2 border-black bg-black text-white flex items-center justify-center shrink-0 shadow-[1.5px_1.5px_0px_#000000]">
                {React.createElement(activeSectionObj.icon, { className: 'w-6 h-6 stroke-[2.2]' })}
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-black text-black uppercase tracking-tight font-display">
                  {activeSectionObj.title}
                </h2>
                <p className="text-xs text-neutral-600">
                  {activeSectionObj.subtitle}
                </p>
              </div>
            </div>

            {/* 1. GENERAL PREFERENCES SUBPAGE */}
            {activeSectionId === 'general' && (
              <div className="flex flex-col gap-3.5">
                {/* Pilihan Bahasa Antarmuka */}
                <div className="p-4 rounded-xl border-2 border-black bg-white shadow-[3px_3px_0px_#000000] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-xs sm:text-sm text-black">
                      {st.languageTitle}
                    </h3>
                    <p className="text-[11px] text-neutral-600 mt-0.5">
                      {st.languageDesc}
                    </p>
                  </div>

                  <div className="inline-flex rounded-lg border-2 border-black p-0.5 bg-neutral-100 shadow-[1px_1px_0px_#000000] shrink-0 self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => handleLanguageChange('id')}
                      className={`px-3 py-1.5 rounded-md text-xs font-bold font-mono flex items-center gap-1.5 transition-all cursor-pointer ${
                        lang === 'id' ? 'bg-black text-white shadow-xs' : 'text-neutral-700 hover:text-black'
                      }`}
                    >
                      <span>🇮🇩 ID</span>
                      {lang === 'id' && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleLanguageChange('en')}
                      className={`px-3 py-1.5 rounded-md text-xs font-bold font-mono flex items-center gap-1.5 transition-all cursor-pointer ${
                        lang === 'en' ? 'bg-black text-white shadow-xs' : 'text-neutral-700 hover:text-black'
                      }`}
                    >
                      <span>🇺🇸 EN</span>
                      {lang === 'en' && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </button>
                  </div>
                </div>

                {/* Otomasi Input URL */}
                <div className="p-4 rounded-xl border-2 border-black bg-white shadow-[3px_3px_0px_#000000] flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-bold text-xs sm:text-sm text-black">
                      {st.inputAutoTitle}
                    </h3>
                    <p className="text-[11px] text-neutral-600 mt-0.5">
                      {st.inputAutoDesc}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggle('inputAutomation', t.toasts.inputAutoToggled, t.toasts.inputAutoToggled)}
                    className={`w-12 h-6 rounded-full border-2 border-black p-0.5 transition-colors cursor-pointer shrink-0 ${
                      settings.inputAutomation ? 'bg-black' : 'bg-neutral-200'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white border border-black transition-transform ${
                      settings.inputAutomation ? 'translate-x-6' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                {/* Keamanan Sesi & Privasi */}
                <div className="p-4 rounded-xl border-2 border-black bg-white shadow-[3px_3px_0px_#000000] flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-bold text-xs sm:text-sm text-black">
                      {st.appSecurityTitle}
                    </h3>
                    <p className="text-[11px] text-neutral-600 mt-0.5">
                      {st.appSecurityDesc}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggle('appSecurity', t.toasts.securityToggled, t.toasts.securityToggled)}
                    className={`w-12 h-6 rounded-full border-2 border-black p-0.5 transition-colors cursor-pointer shrink-0 ${
                      settings.appSecurity ? 'bg-black' : 'bg-neutral-200'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white border border-black transition-transform ${
                      settings.appSecurity ? 'translate-x-6' : 'translate-x-0'
                    }`} />
                  </button>
                </div>
              </div>
            )}

            {/* 2. LOOK & FEEL SUBPAGE */}
            {activeSectionId === 'lookFeel' && (
              <div className="flex flex-col gap-3.5">
                
                {/* Dark Mode Toggle */}
                <div className="p-4 rounded-xl border-2 border-black bg-white shadow-[3px_3px_0px_#000000] flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-bold text-xs sm:text-sm text-black">
                      {st.darkModeTitle}
                    </h3>
                    <p className="text-[11px] text-neutral-600 mt-0.5">
                      {st.darkModeDesc}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggle('darkMode', t.toasts.darkModeOn, t.toasts.darkModeOff)}
                    className={`w-12 h-6 rounded-full border-2 border-black p-0.5 transition-colors cursor-pointer shrink-0 ${
                      settings.darkMode ? 'bg-black' : 'bg-neutral-200'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white border border-black transition-transform ${
                      settings.darkMode ? 'translate-x-6' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                {/* Mode Ringkas (Compact Mode) */}
                <div className="p-4 rounded-xl border-2 border-black bg-white shadow-[3px_3px_0px_#000000] flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-bold text-xs sm:text-sm text-black">
                      {st.compactModeTitle}
                    </h3>
                    <p className="text-[11px] text-neutral-600 mt-0.5">
                      {st.compactModeDesc}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggle('compactMode', t.toasts.compactModeOn, t.toasts.compactModeOff)}
                    className={`w-12 h-6 rounded-full border-2 border-black p-0.5 transition-colors cursor-pointer shrink-0 ${
                      settings.compactMode ? 'bg-black' : 'bg-neutral-200'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white border border-black transition-transform ${
                      settings.compactMode ? 'translate-x-6' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                {/* 1. OPSI FONT APLIKASI (5 PILIHAN FONT) */}
                <div className="p-4 rounded-xl border-2 border-black bg-white shadow-[3px_3px_0px_#000000] flex flex-col gap-2.5">
                  <div>
                    <h3 className="font-bold text-xs sm:text-sm text-black">
                      {st.fontTitle}
                    </h3>
                    <p className="text-[11px] text-neutral-600 mt-0.5">
                      {st.fontDesc}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {[
                      { name: 'Inter', desc: 'Default Sans', style: { fontFamily: "'Inter', sans-serif" } },
                      { name: 'Outfit', desc: 'Display Sans', style: { fontFamily: "'Outfit', sans-serif" } },
                      { name: 'JetBrains Mono', desc: 'Code Mono', style: { fontFamily: "'JetBrains Mono', monospace" } },
                      { name: 'Plus Jakarta Sans', desc: 'Clean Sans', style: { fontFamily: "'Plus Jakarta Sans', sans-serif" } },
                      { name: 'Space Grotesk', desc: 'Brutalist Display', style: { fontFamily: "'Space Grotesk', sans-serif" } }
                    ].map(font => {
                      const isSelected = settings.fontFamily === font.name;
                      return (
                        <button
                          key={font.name}
                          type="button"
                          onClick={() => handleFontChange(font.name)}
                          className={`py-2 px-2.5 rounded-lg border-2 border-black text-left flex flex-col justify-center transition-all cursor-pointer min-h-[44px] ${
                            isSelected
                              ? 'bg-black text-white shadow-[2px_2px_0px_#000000] active-accent-target'
                              : 'bg-white text-black hover:bg-neutral-100'
                          }`}
                        >
                          <div className="flex items-center justify-between w-full">
                            <span className="font-bold text-xs truncate" style={font.style}>
                              {font.name}
                            </span>
                            {isSelected && <Check className="w-3 h-3 stroke-[3] shrink-0 ml-1" />}
                          </div>
                          <span className={`text-[10px] ${isSelected ? 'text-neutral-300' : 'text-neutral-500'}`}>
                            {font.desc}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. NEOBRUTALIST BORDER & SHADOW */}
                <div className="p-4 rounded-xl border-2 border-black bg-white shadow-[3px_3px_0px_#000000] flex flex-col gap-3.5">
                  
                  {/* Border Thickness */}
                  <div className="flex flex-col gap-2">
                    <div>
                      <h3 className="font-bold text-xs sm:text-sm text-black">
                        {st.borderThicknessTitle}
                      </h3>
                      <p className="text-[11px] text-neutral-600 mt-0.5">
                        {st.borderThicknessDesc}
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: 'thin', label: st.borderThin },
                        { id: 'normal', label: st.borderNormal },
                        { id: 'heavy', label: st.borderHeavy }
                      ].map(item => {
                        const isSelected = (settings.borderThickness || 'normal') === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => handleBorderChange(item.id)}
                            className={`py-2 px-2 rounded-lg border-2 border-black text-xs font-bold transition-all cursor-pointer min-h-[44px] flex items-center justify-center gap-1 ${
                              isSelected
                                ? 'bg-black text-white shadow-[2px_2px_0px_#000000] active-accent-target'
                                : 'bg-white text-black hover:bg-neutral-100'
                            }`}
                          >
                            <span>{item.label}</span>
                            {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Hard Shadow Offset */}
                  <div className="flex flex-col gap-2 pt-2 border-t border-neutral-200">
                    <div>
                      <h3 className="font-bold text-xs sm:text-sm text-black">
                        {st.shadowOffsetTitle}
                      </h3>
                      <p className="text-[11px] text-neutral-600 mt-0.5">
                        {st.shadowOffsetDesc}
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: 'flat', label: st.shadowFlat },
                        { id: 'hard', label: st.shadowHard },
                        { id: 'deep', label: st.shadowDeep }
                      ].map(item => {
                        const isSelected = (settings.shadowOffset || 'hard') === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => handleShadowChange(item.id)}
                            className={`py-2 px-2 rounded-lg border-2 border-black text-xs font-bold transition-all cursor-pointer min-h-[44px] flex items-center justify-center gap-1 ${
                              isSelected
                                ? 'bg-black text-white shadow-[2px_2px_0px_#000000] active-accent-target'
                                : 'bg-white text-black hover:bg-neutral-100'
                            }`}
                          >
                            <span>{item.label}</span>
                            {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                </div>

                {/* 3. ACCENT HIGHLIGHT COLOR */}
                <div className="p-4 rounded-xl border-2 border-black bg-white shadow-[3px_3px_0px_#000000] flex flex-col gap-2.5">
                  <div>
                    <h3 className="font-bold text-xs sm:text-sm text-black">
                      {st.accentColorTitle}
                    </h3>
                    <p className="text-[11px] text-neutral-600 mt-0.5">
                      {st.accentColorDesc}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      { 
                        id: 'monochrome', 
                        name: st.accentMonochrome, 
                        swatchBg: '#000000', 
                        dotColor: '#ffffff'
                      },
                      { 
                        id: 'yellow', 
                        name: st.accentYellow, 
                        swatchBg: '#FFE600', 
                        dotColor: '#000000'
                      },
                      { 
                        id: 'pink', 
                        name: st.accentPink, 
                        swatchBg: '#FF76CE', 
                        dotColor: '#000000'
                      },
                      { 
                        id: 'mint', 
                        name: st.accentMint, 
                        swatchBg: '#00F5D4', 
                        dotColor: '#000000'
                      }
                    ].map(accent => {
                      const isSelected = (settings.accentColor || 'monochrome') === accent.id;
                      return (
                        <button
                          key={accent.id}
                          type="button"
                          onClick={() => handleAccentChange(accent.id)}
                          className={`p-2.5 rounded-lg border-2 border-black text-left flex items-center justify-between gap-2.5 transition-all cursor-pointer min-h-[44px] ${
                            isSelected
                              ? 'bg-neutral-100 shadow-[2px_2px_0px_#000000] ring-2 ring-black'
                              : 'bg-white hover:bg-neutral-50'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {/* Kotak Swatch Warna dengan Border Tebal */}
                            <div 
                              className="w-5 h-5 rounded border-2 border-black shrink-0 flex items-center justify-center shadow-[1px_1px_0px_#000000]"
                              style={{ backgroundColor: accent.swatchBg }}
                            >
                              {isSelected && (
                                <div 
                                  className="w-2 h-2 rounded-full" 
                                  style={{ backgroundColor: accent.dotColor }}
                                />
                              )}
                            </div>
                            <span className="font-bold text-xs text-black truncate">
                              {accent.name}
                            </span>
                          </div>

                          {isSelected && (
                            <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border border-black bg-black text-white shrink-0">
                              ACTIVE
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 4. BACKGROUND VISUAL FX & POWER SAVING MODE */}
                <div className="p-4 rounded-xl border-2 border-black bg-white shadow-[3px_3px_0px_#000000] flex flex-col gap-3.5">
                  <div className="flex flex-col gap-2">
                    <div>
                      <h3 className="font-bold text-xs sm:text-sm text-black">
                        {st.backgroundFxTitle}
                      </h3>
                      <p className="text-[11px] text-neutral-600 mt-0.5">
                        {st.backgroundFxDesc}
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: 'sakura', label: st.bgFxSakura, icon: '🌸' },
                        { id: 'grid', label: st.bgFxGrid, icon: '⚡' },
                        { id: 'off', label: st.bgFxOff, icon: '🚫' }
                      ].map(item => {
                        const isSelected = (settings.backgroundFx || 'sakura') === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => handleBgFxChange(item.id)}
                            className={`py-2 px-1.5 rounded-lg border-2 border-black text-xs font-bold transition-all cursor-pointer min-h-[44px] flex flex-col sm:flex-row items-center justify-center gap-1 text-center ${
                              isSelected
                                ? 'bg-black text-white shadow-[2px_2px_0px_#000000] active-accent-target'
                                : 'bg-white text-black hover:bg-neutral-100'
                            }`}
                          >
                            <span>{item.icon}</span>
                            <span className="truncate">{item.label.split(' ')[0]}</span>
                            {isSelected && <Check className="w-3 h-3 stroke-[3] hidden sm:inline" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Toggle Matikan Animasi (Power Saving Mode) */}
                  <div className="pt-2 border-t border-neutral-200 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-bold text-xs sm:text-sm text-black">
                        {st.powerSavingTitle}
                      </h3>
                      <p className="text-[11px] text-neutral-600 mt-0.5">
                        {st.powerSavingDesc}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggle('hideAnimations', t.toasts.animationsOff, t.toasts.animationsOn)}
                      className={`w-12 h-6 rounded-full border-2 border-black p-0.5 transition-colors cursor-pointer shrink-0 ${
                        settings.hideAnimations ? 'bg-black' : 'bg-neutral-200'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full bg-white border border-black transition-transform ${
                        settings.hideAnimations ? 'translate-x-6' : 'translate-x-0'
                      }`} />
                    </button>
                  </div>
                </div>

                {/* Ukuran Teks */}
                <div className="p-4 rounded-xl border-2 border-black bg-white shadow-[3px_3px_0px_#000000] flex flex-col gap-2">
                  <h3 className="font-bold text-xs sm:text-sm text-black">
                    {st.textSizeTitle}
                  </h3>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'small', label: st.textSizeSmall },
                      { id: 'normal', label: st.textSizeNormal },
                      { id: 'large', label: st.textSizeLarge }
                    ].map(item => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleTextSizeChange(item.id)}
                        className={`py-2 px-2 rounded-lg border-2 border-black text-xs font-bold transition-all cursor-pointer min-h-[44px] ${
                          settings.textSize === item.id
                            ? 'bg-black text-white shadow-[2px_2px_0px_#000000] active-accent-target'
                            : 'bg-white text-black hover:bg-neutral-100'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Kecepatan Animasi */}
                <div className="p-4 rounded-xl border-2 border-black bg-white shadow-[3px_3px_0px_#000000] flex flex-col gap-2">
                  <h3 className="font-bold text-xs sm:text-sm text-black">
                    {st.animSpeedTitle}
                  </h3>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'fast', label: st.animFast },
                      { id: 'normal', label: st.animNormal },
                      { id: 'relaxed', label: st.animRelaxed }
                    ].map(item => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSpeedChange(item.id)}
                        className={`py-2 px-2 rounded-lg border-2 border-black text-xs font-bold transition-all cursor-pointer min-h-[44px] ${
                          settings.animationSpeed === item.id
                            ? 'bg-black text-white shadow-[2px_2px_0px_#000000] active-accent-target'
                            : 'bg-white text-black hover:bg-neutral-100'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sudut Card (Corner Radius) */}
                <div className="p-4 rounded-xl border-2 border-black bg-white shadow-[3px_3px_0px_#000000] flex flex-col gap-2">
                  <h3 className="font-bold text-xs sm:text-sm text-black">
                    {st.cornerStyleTitle}
                  </h3>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'rounded', label: st.cornerRounded },
                      { id: 'sharp', label: st.cornerSharp },
                      { id: 'soft', label: st.cornerSoft }
                    ].map(item => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleCornerChange(item.id)}
                        className={`py-2 px-2 rounded-lg border-2 border-black text-xs font-bold transition-all cursor-pointer min-h-[44px] ${
                          settings.cornerStyle === item.id
                            ? 'bg-black text-white shadow-[2px_2px_0px_#000000] active-accent-target'
                            : 'bg-white text-black hover:bg-neutral-100'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

              </div>
            )}

            {/* 3. STORAGE & DOWNLOAD SUBPAGE */}
            {activeSectionId === 'storage' && (
              <div className="flex flex-col gap-3.5">
                
                {/* Status Isolasi Device ID */}
                <div className="p-4 rounded-xl border-2 border-black bg-white shadow-[3px_3px_0px_#000000] flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-xs sm:text-sm text-black">
                      {st.deviceIdTitle}
                    </h3>
                    <span className="text-[9px] font-mono px-2 py-0.5 rounded border border-black bg-emerald-100 text-black font-bold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
                      <span>{isEn ? 'DEVICE ISOLATION ACTIVE' : 'ISOLASI PERANGKAT AKTIF'}</span>
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-600">
                    {st.deviceIdDesc}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="flex-1 p-2 rounded border border-black bg-neutral-100 font-mono text-[11px] font-bold text-black truncate select-all">
                      {deviceId}
                    </code>
                    <button
                      type="button"
                      onClick={handleCopyDeviceId}
                      className="px-3 py-2 rounded border border-black bg-white hover:bg-neutral-100 text-xs font-bold text-black flex items-center gap-1.5 shadow-[1px_1px_0px_#000000] cursor-pointer shrink-0"
                    >
                      {copiedDeviceId ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedDeviceId ? (isEn ? 'Copied' : 'Tersalin') : (isEn ? 'Copy ID' : 'Salin ID')}</span>
                    </button>
                  </div>
                </div>

                {/* Tampilkan Tab Galeri di Navbar */}
                <div className="p-4 rounded-xl border-2 border-black bg-white shadow-[3px_3px_0px_#000000] flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-bold text-xs sm:text-sm text-black">
                      {st.showGalleryTitle}
                    </h3>
                    <p className="text-[11px] text-neutral-600 mt-0.5">
                      {st.showGalleryDesc}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggle('showGallery', t.toasts.galleryVisible, t.toasts.galleryHidden)}
                    className={`w-12 h-6 rounded-full border-2 border-black p-0.5 transition-colors cursor-pointer shrink-0 ${
                      settings.showGallery !== false ? 'bg-black' : 'bg-neutral-200'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white border border-black transition-transform ${
                      settings.showGallery !== false ? 'translate-x-6' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                {/* Tampilkan Tab Riwayat di Navbar */}
                <div className="p-4 rounded-xl border-2 border-black bg-white shadow-[3px_3px_0px_#000000] flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-bold text-xs sm:text-sm text-black">
                      {st.showHistoryTitle}
                    </h3>
                    <p className="text-[11px] text-neutral-600 mt-0.5">
                      {st.showHistoryDesc}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggle('showHistory', t.toasts.historyVisible, t.toasts.historyHidden)}
                    className={`w-12 h-6 rounded-full border-2 border-black p-0.5 transition-colors cursor-pointer shrink-0 ${
                      settings.showHistory !== false ? 'bg-black' : 'bg-neutral-200'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white border border-black transition-transform ${
                      settings.showHistory !== false ? 'translate-x-6' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                {/* Bersihkan Galeri Perangkat */}
                <div className="p-4 rounded-xl border-2 border-black bg-white shadow-[3px_3px_0px_#000000] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-bold text-xs sm:text-sm text-black">
                      {st.clearGalleryTitle}
                    </h3>
                    <p className="text-[11px] text-neutral-600 mt-0.5">
                      {st.clearGalleryDesc}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleClearGallery}
                    className="px-4 py-2 rounded-lg border-2 border-black bg-white hover:bg-red-50 text-red-600 font-bold text-xs flex items-center gap-1.5 shadow-[1.5px_1.5px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none cursor-pointer shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{st.clearGalleryBtn}</span>
                  </button>
                </div>

              </div>
            )}

            {/* 4. NETWORK & PERFORMANCE SUBPAGE */}
            {activeSectionId === 'network' && (
              <div className="flex flex-col gap-3.5">
                
                {/* Dual Engine FFmpeg + Browser */}
                <div className="p-4 rounded-xl border-2 border-black bg-white shadow-[3px_3px_0px_#000000] flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-xs sm:text-sm text-black">
                      {st.engineTitle}
                    </h3>
                    <span className="text-[9px] font-mono px-2 py-0.5 rounded border border-black bg-black text-white font-bold">
                      LOSSLESS ENGINE
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-600">
                    {st.engineDesc}
                  </p>
                </div>

                {/* Kesiapan Mode Luring */}
                <div className="p-4 rounded-xl border-2 border-black bg-white shadow-[3px_3px_0px_#000000] flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-xs sm:text-sm text-black">
                      {st.offlineModeTitle}
                    </h3>
                    <span className="text-[9px] font-mono px-2 py-0.5 rounded border border-black bg-neutral-100 text-black font-bold">
                      CLIENT-SIDE READY
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-600">
                    {st.offlineModeDesc}
                  </p>
                </div>

              </div>
            )}

            {/* 5. ADVANCED & SYSTEM RESET SUBPAGE */}
            {activeSectionId === 'advanced' && (
              <div className="flex flex-col gap-3.5">
                
                {/* Batas Retensi Riwayat */}
                <div className="p-4 rounded-xl border-2 border-black bg-white shadow-[3px_3px_0px_#000000] flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-bold text-xs sm:text-sm text-black">
                      {st.historyLimitTitle}
                    </h3>
                    <p className="text-[11px] text-neutral-600 mt-0.5">
                      {st.historyLimitDesc}
                    </p>
                  </div>
                  <span className="text-xs font-mono font-bold px-2.5 py-1 rounded border border-black bg-neutral-100 text-black shrink-0">
                    50 Max
                  </span>
                </div>

                {/* Factory Reset Pengaturan */}
                <div className="p-4 rounded-xl border-2 border-black bg-white shadow-[3px_3px_0px_#000000] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-bold text-xs sm:text-sm text-black">
                      {st.factoryResetTitle}
                    </h3>
                    <p className="text-[11px] text-neutral-600 mt-0.5">
                      {st.factoryResetDesc}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleFactoryReset}
                    className="px-4 py-2 rounded-lg border-2 border-black bg-black text-white hover:bg-neutral-800 font-bold text-xs flex items-center gap-1.5 shadow-[1.5px_1.5px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none cursor-pointer shrink-0"
                  >
                    <RefreshCcw className="w-3.5 h-3.5" />
                    <span>{st.factoryResetBtn}</span>
                  </button>
                </div>

              </div>
            )}

            {/* 6. ABOUT & HELP SUBPAGE */}
            {activeSectionId === 'about' && (
              <div className="flex flex-col gap-3.5">
                
                {/* Versi Web */}
                <div className="p-4 rounded-xl border-2 border-black bg-white shadow-[3px_3px_0px_#000000] flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-xs sm:text-sm text-black">
                        {st.versionTitle}
                      </h3>
                      <span className="text-[9px] font-mono px-2 py-0.5 rounded border border-black bg-black text-white font-bold">
                        {st.versionBadge}
                      </span>
                    </div>
                    <p className="text-[11px] text-neutral-600 mt-0.5">
                      {st.versionDesc}
                    </p>
                  </div>
                </div>

                {/* FAQ Singkat */}
                <div className="p-4 rounded-xl border-2 border-black bg-white shadow-[3px_3px_0px_#000000] flex flex-col gap-2">
                  <h3 className="font-bold text-xs sm:text-sm text-black flex items-center gap-1.5">
                    <HelpCircle className="w-4 h-4 stroke-[2.2]" />
                    <span>{st.helpTitle}</span>
                  </h3>

                  <div className="flex flex-col gap-2 mt-1">
                    <div className="border border-black rounded-lg p-2.5 bg-neutral-50 text-xs">
                      <p className="font-bold text-black mb-1">
                        Q: {st.help1Q}
                      </p>
                      <p className="text-neutral-600 text-[11px] leading-relaxed">
                        A: {st.help1A}
                      </p>
                    </div>
                    <div className="border border-black rounded-lg p-2.5 bg-neutral-50 text-xs">
                      <p className="font-bold text-black mb-1">
                        Q: {st.help2Q}
                      </p>
                      <p className="text-neutral-600 text-[11px] leading-relaxed">
                        A: {st.help2A}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Tautan Komunitas & Pengembang */}
                <div className="p-4 rounded-xl border-2 border-black bg-white shadow-[3px_3px_0px_#000000] flex flex-col gap-2.5">
                  <h3 className="font-bold text-xs sm:text-sm text-black">
                    {st.devLinksTitle}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <a
                      href="https://whatsapp.com/channel/0029VbDfI32EAKWIfTviOv3I"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2.5 rounded-lg border border-black bg-neutral-50 hover:bg-neutral-100 text-xs font-bold flex items-center justify-between shadow-[1px_1px_0px_#000000]"
                    >
                      <span className="truncate">{st.linkWhatsapp}</span>
                      <ExternalLink className="w-3 h-3 shrink-0 ml-1" />
                    </a>
                    <a
                      href="https://www.tiktok.com/@kazexy1?_r=1&_t=ZS-9AI327NzPvw"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2.5 rounded-lg border border-black bg-neutral-50 hover:bg-neutral-100 text-xs font-bold flex items-center justify-between shadow-[1px_1px_0px_#000000]"
                    >
                      <span className="truncate">{st.linkTiktok}</span>
                      <ExternalLink className="w-3 h-3 shrink-0 ml-1" />
                    </a>
                    <a
                      href="https://github.com/itsvin-debug/AllToolsKuro.git"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2.5 rounded-lg border border-black bg-neutral-50 hover:bg-neutral-100 text-xs font-bold flex items-center justify-between shadow-[1px_1px_0px_#000000]"
                    >
                      <span className="truncate">{st.linkGithub}</span>
                      <ExternalLink className="w-3 h-3 shrink-0 ml-1" />
                    </a>
                  </div>
                </div>

              </div>
            )}

          </div>
        )}

      </div>

      {confirmDialog && (
        <ConfirmModal
          isOpen={Boolean(confirmDialog)}
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmText={confirmDialog.confirmText}
          cancelText={isEn ? 'Cancel' : 'Batal'}
          type={confirmDialog.type || 'danger'}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </main>
  );
}
