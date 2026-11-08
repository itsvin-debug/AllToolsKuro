import React from 'react';
import { 
  Sparkles, 
  Download, 
  X, 
  CheckCircle2, 
  ArrowUpCircle,
  ShieldCheck,
  RefreshCw,
  ExternalLink
} from 'lucide-react';

export default function UpdateModal({
  isOpen,
  onClose,
  latestInfo,
  localVersion,
  isDownloading,
  downloadProgress,
  downloadStatus,
  onStartDownload,
  lang = 'id'
}) {
  if (!isOpen) return null;

  const isEn = lang === 'en';
  const newVersion = latestInfo?.latestVersion || '1.4.0';
  const releaseNotes = latestInfo?.releaseNotes || (isEn 
    ? 'Release Update v1.4.0: 3 New Features (CapCut JJ, Anime & Manhwa Recommendations) with Real-Time Search and In-App Detail Modal.'
    : 'Rilis Pembaruan v1.4.0: 3 Fitur Baru (CapCut JJ, Rekomendasi Anime & Manhwa) dengan Real-Time Search dan In-App Modal Detail.');
  
  const defaultFeaturesId = [
    'Pencari Template CapCut JJ: Cari preset JJ viral via lirik/lagu dengan direct link resmi CapCut dan cover aesthetic (bebas video dummy).',
    'Pencari Rekomendasi Anime: Rekomendasi cerdas modal genre tunggal & kombinasi multi-genre, skor rating MAL, dan Modal Detail In-App tanpa redirect keluar.',
    'Pencari Rekomendasi Manhwa: Kurasi webtoon Korea modal kombinasi genre, rating pembaca, cover HD, dan Modal Detail In-App sinopsis lengkap.',
    'LiveChart.me & Kitsu Manga API: Integrasi data episode & webtoon Korea secara real-time.',
    'Sistem Update Otomatis: Deteksi perubahan web secara real-time langsung melalui tombol update aplikasi.'
  ];

  const defaultFeaturesEn = [
    'CapCut JJ Template Finder: Find viral JJ presets via lyrics/song with official CapCut direct links and clean aesthetic covers (no dummy videos).',
    'Anime Recommendation Finder: Smart multi-genre combination presets, MAL scores, and In-App Detail Modal with no external redirects.',
    'Manhwa Recommendation Finder: Korean webtoon curation with genre combinations, reader ratings, HD covers, and In-App full synopsis modal.',
    'LiveChart.me & Kitsu Manga API: Real-time sync for airing episodes and rich Korean manhwa metadata.',
    'Automated In-App Updater: Real-time detection of web features directly via the app update button.'
  ];

  const features = latestInfo?.features || (isEn ? defaultFeaturesEn : defaultFeaturesId);
  const fileSize = latestInfo?.fileSize || '12.8 MB';
  const apkDownloadUrl = latestInfo?.apkUrl || 'https://alltoolskuro.vercel.app/AllToolsKuro.apk';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      
      {/* Container Utama Modal (Neobrutalism Anime Terang - Bersih & Selaras Tema Web) */}
      <div 
        className="w-full max-w-md rounded-2xl border-2 border-black bg-white text-black shadow-[6px_6px_0px_#000000] overflow-hidden flex flex-col relative"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-update-title"
      >

        {/* ─── 1. HEADER MODAL NEOBRUTALIST ─── */}
        <div className="p-4 sm:p-5 border-b-2 border-black bg-gradient-to-r from-blue-50/80 via-purple-50/50 to-white flex items-start justify-between relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 border-2 border-black flex items-center justify-center text-white shrink-0 shadow-[2px_2px_0px_#000000]">
              <ArrowUpCircle className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded border-2 border-black bg-blue-600 text-white shadow-[1px_1px_0px_#000000]">
                  New Release
                </span>
                <span className="text-[11px] font-mono text-neutral-600 font-bold">
                  {fileSize}
                </span>
              </div>
              <h2 id="modal-update-title" className="text-base sm:text-lg font-black tracking-tight text-black mt-1">
                {isEn ? 'App Update Available!' : 'Pembaruan Aplikasi Tersedia!'}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isDownloading}
            className="p-1.5 rounded-lg border-2 border-black bg-white text-black hover:bg-neutral-100 shadow-[2px_2px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all disabled:opacity-40 cursor-pointer"
            aria-label={isEn ? 'Close dialog' : 'Tutup dialog'}
          >
            <X className="w-4 h-4 stroke-[2.5]" />
          </button>
        </div>

        {/* ─── 2. KONTEN DETAIL VERSI & RELEASE NOTES ─── */}
        <div className="p-4 sm:p-5 space-y-3.5 max-h-[62vh] overflow-y-auto text-xs relative z-10 font-sans custom-scrollbar">
          
          {/* Identitas Aplikasi & Perbandingan Versi */}
          <div className="grid grid-cols-2 gap-2.5 p-3 rounded-xl bg-neutral-50 border-2 border-black shadow-[2px_2px_0px_#000000]">
            <div>
              <span className="text-[10px] uppercase font-mono tracking-wider text-neutral-500 block font-bold">
                {isEn ? 'App & Package' : 'Aplikasi & ID'}
              </span>
              <span className="font-black text-black text-xs sm:text-sm block truncate mt-0.5">
                AllToolsKuro
              </span>
              <span className="text-[10px] font-mono text-neutral-500 block truncate">
                com.kuro.alltools
              </span>
            </div>

            <div className="text-right border-l-2 border-black pl-2.5">
              <span className="text-[10px] uppercase font-mono tracking-wider text-neutral-500 block font-bold">
                {isEn ? 'New Version' : 'Versi Baru'}
              </span>
              <div className="flex items-center justify-end gap-1.5 mt-0.5">
                <span className="text-[11px] font-mono text-neutral-400 line-through">
                  v{localVersion}
                </span>
                <span className="text-xs sm:text-sm font-mono font-black text-white bg-blue-600 px-2 py-0.5 rounded border border-black shadow-[1px_1px_0px_#000000]">
                  v{newVersion}
                </span>
              </div>
              <span className="text-[10px] text-emerald-700 font-mono font-bold block mt-1 flex items-center justify-end gap-1">
                <ShieldCheck className="w-3.5 h-3.5 stroke-[2.5]" />
                Verified APK
              </span>
            </div>
          </div>

          {/* Ringkasan Catatan Rilis */}
          <div className="p-3 rounded-xl bg-blue-50/60 border-2 border-black shadow-[2px_2px_0px_#000000]">
            <span className="text-[10px] uppercase font-mono tracking-wider text-blue-700 font-extrabold block mb-1 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              {isEn ? 'Release Notes' : 'Catatan Rilis'}
            </span>
            <p className="text-neutral-800 leading-relaxed font-medium">
              {releaseNotes}
            </p>
          </div>

          {/* Daftar Fitur Baru & Penyempurnaan */}
          <div>
            <span className="text-[10px] uppercase font-mono tracking-wider text-neutral-700 font-extrabold block mb-2">
              {isEn ? 'New Features & Enhancements:' : 'Fitur Baru & Penyempurnaan:'}
            </span>
            <div className="space-y-2">
              {features.map((feat, idx) => (
                <div 
                  key={idx}
                  className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white border-2 border-black shadow-[2px_2px_0px_#000000] text-neutral-800"
                >
                  <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5 stroke-[2.5]" />
                  <span className="text-[11px] leading-snug font-medium">{feat}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ─── 3. PROGRESS BAR PENGUNDUHAN NEOBRUTALIST ─── */}
          {isDownloading && (
            <div className="p-3.5 rounded-xl bg-neutral-50 border-2 border-black shadow-[2px_2px_0px_#000000] space-y-2">
              <div className="flex items-center justify-between text-[11px] font-mono">
                <span className="text-blue-700 flex items-center gap-1.5 font-bold">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600 stroke-[2.5]" />
                  {downloadStatus === 'completed' 
                    ? (isEn ? 'Download Finished' : 'Unduhan Selesai') 
                    : (isEn ? 'Downloading APK Update...' : 'Mengunduh Pembaruan APK...')}
                </span>
                <span className="text-white font-mono font-black bg-blue-600 px-2 py-0.5 rounded border border-black shadow-[1px_1px_0px_#000000]">
                  {downloadProgress}%
                </span>
              </div>

              {/* Progress Bar Track Solid */}
              <div className="w-full h-3.5 rounded-lg bg-neutral-200 border-2 border-black overflow-hidden p-0.5 shadow-[1px_1px_0px_#000000]">
                <div 
                  className="h-full rounded bg-blue-600 border border-black transition-all duration-150"
                  style={{ width: `${downloadProgress}%` }}
                />
              </div>

              <p className="text-[10px] text-neutral-600 font-mono">
                {downloadStatus === 'completed' 
                  ? (isEn ? 'Launching Android package installer... Please apply update.' : 'Membuka installer paket Android... Silakan pasang pembaruan.') 
                  : (isEn ? 'Please wait, APK file is being prepared in background.' : 'Mohon tunggu sejenak, berkas APK sedang disiapkan di latar belakang.')}
              </p>
            </div>
          )}

        </div>

        {/* ─── 4. FOOTER AKSI NEOBRUTALIST (UPDATE & CANCEL) ─── */}
        <div className="p-4 sm:p-5 border-t-2 border-black bg-neutral-50 flex items-center justify-end gap-2.5 relative z-10">
          
          {/* Tombol Cancel */}
          <button
            type="button"
            onClick={onClose}
            disabled={isDownloading}
            className="px-4 py-2 rounded-xl border-2 border-black bg-white hover:bg-neutral-100 text-black font-bold text-xs shadow-[2px_2px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all disabled:opacity-40 cursor-pointer"
          >
            {isEn ? 'Cancel' : 'Batal'}
          </button>

          {/* Tombol Update atau Buka Installer Jika Unduhan Selesai */}
          {downloadStatus === 'completed' ? (
            <a
              href={apkDownloadUrl}
              target="_system"
              download="AllToolsKuro.apk"
              className="px-5 py-2 rounded-xl border-2 border-black bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow-[3px_3px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>{isEn ? 'Open APK File' : 'Buka Berkas APK'}</span>
            </a>
          ) : (
            <button
              type="button"
              onClick={onStartDownload}
              disabled={isDownloading}
              className="px-5 py-2 rounded-xl border-2 border-black bg-blue-600 hover:bg-blue-700 text-white font-black text-xs shadow-[3px_3px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isDownloading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin stroke-[2.5]" />
                  <span>{isEn ? 'Processing...' : 'Memproses...'}</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>{isEn ? 'Update Now' : 'Update Sekarang'}</span>
                </>
              )}
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
