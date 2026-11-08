import React from 'react';
import { 
  Sparkles, 
  Download, 
  X, 
  CheckCircle2, 
  ArrowUpCircle,
  ShieldCheck,
  RefreshCw,
  Check
} from 'lucide-react';

export default function UpdateModal({
  isOpen,
  onClose,
  latestInfo,
  localVersion,
  hasUpdate = true,
  isDownloading = false,
  downloadProgress = 0,
  downloadPhase = '',
  downloadStatus = 'idle',
  onStartDownload,
  onCheckAgain,
  isChecking = false,
  lang = 'id'
}) {
  if (!isOpen) return null;

  const isEn = lang === 'en';
  const newVersion = latestInfo?.latestVersion || '1.5.0';
  const releaseNotes = latestInfo?.releaseNotes || (isEn 
    ? 'Release Update v1.5.0: Bilingual Anime & Manhwa Synopses (ID / EN) In-App, CapCut Finder cleanup, and Serverless optimization.'
    : 'Rilis Pembaruan v1.5.0: Sinopsis Rekomendasi Anime & Manhwa Bilingual (ID / EN) Otomatis, Pembersihan CapCut Finder, dan Konsolidasi 15 Utilitas Kuro.');
  
  const defaultFeaturesId = [
    'Sinopsis Bilingual Otomatis: Sinopsis anime & manhwa otomatis berbahasa Indonesia jika memilih bahasa Indonesia, dan berbahasa Inggris jika memilih English.',
    'Detail In-App Modal: Baca sinopsis lengkap, skor rating, status rilis, dan episode langsung di dalam modal tanpa redirect ke situs luar.',
    'Pembersihan Antarmuka: Menghapus fitur Pencari Template CapCut yang tidak berfungsi agar navigasi lebih rapi dan gesit.',
    'Sistem In-App Update: Pembaruan versi aplikasi langsung di dalam antarmuka dengan animasi progres tanpa pop-up download browser.',
    'Penyesuaian Pemandu Tour & Bot: Pemandu tour Kuro dan asisten AI kini presisi mengenali 15 fitur utilitas lengkap.'
  ];

  const defaultFeaturesEn = [
    'Automatic Bilingual Synopses: Anime & manhwa synopses auto-translate to Indonesian when Indonesian is selected, or native English when in English mode.',
    'In-App Detail Modal: Read full synopses, rating scores, status, and episodes directly inside the modal with zero external redirects.',
    'Interface Cleanup: Removed malfunctioning CapCut template finder for a cleaner, snappier navigation experience.',
    'In-App Update System: Seamless app updates executed directly inside the app interface with rich progress animations and no browser download prompts.',
    'Kuro Tour & Bot Sync: Kuro tour guide and AI assistant now accurately recognize all 15 technical utilities.'
  ];

  const features = latestInfo?.features || (isEn ? defaultFeaturesEn : defaultFeaturesId);
  const fileSize = latestInfo?.fileSize || '12.8 MB';

  const isCompleted = downloadStatus === 'completed';

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
        <div className={`p-4 sm:p-5 border-b-2 border-black flex items-start justify-between relative z-10 ${
          !hasUpdate && !isCompleted
            ? 'bg-gradient-to-r from-emerald-50/90 via-teal-50/50 to-white'
            : isCompleted
              ? 'bg-gradient-to-r from-emerald-100/90 via-emerald-50 to-white'
              : 'bg-gradient-to-r from-blue-50/80 via-purple-50/50 to-white'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl border-2 border-black flex items-center justify-center text-white shrink-0 shadow-[2px_2px_0px_#000000] ${
              !hasUpdate || isCompleted ? 'bg-emerald-600' : 'bg-blue-600'
            }`}>
              {!hasUpdate || isCompleted ? (
                <CheckCircle2 className="w-6 h-6 stroke-[2.5]" />
              ) : (
                <ArrowUpCircle className="w-6 h-6 stroke-[2.5]" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded border-2 border-black text-white shadow-[1px_1px_0px_#000000] ${
                  !hasUpdate || isCompleted ? 'bg-emerald-600' : 'bg-blue-600'
                }`}>
                  {!hasUpdate || isCompleted 
                    ? (isEn ? 'Up To Date' : 'Versi Terbaru')
                    : 'New Release'}
                </span>
                <span className="text-[11px] font-mono text-neutral-600 font-bold">
                  v{hasUpdate && !isCompleted ? newVersion : localVersion}
                </span>
              </div>
              <h2 id="modal-update-title" className="text-base sm:text-lg font-black tracking-tight text-black mt-1">
                {isCompleted
                  ? (isEn ? 'Update Successfully Applied!' : 'Pembaruan Berhasil Diterapkan!')
                  : hasUpdate 
                    ? (isEn ? 'App Update Available!' : 'Pembaruan Aplikasi Tersedia!') 
                    : (isEn ? 'No Update Available' : 'Tidak Ada Update Tersedia')}
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

        {/* ─── 2. KONTEN DETAIL MODAL ─── */}
        <div className="p-4 sm:p-5 space-y-3.5 max-h-[62vh] overflow-y-auto text-xs relative z-10 font-sans custom-scrollbar">
          
          {/* KASUS A: SUDAH VERSI TERBARU / TIDAK ADA UPDATE TERSEDIA */}
          {!hasUpdate && !isCompleted && (
            <div className="p-4 rounded-xl bg-emerald-50 border-2 border-black shadow-[3px_3px_0px_#000000] flex flex-col items-center text-center gap-2">
              <div className="w-12 h-12 rounded-full bg-emerald-500 border-2 border-black flex items-center justify-center text-white shadow-[2px_2px_0px_#000000]">
                <Check className="w-7 h-7 stroke-[3]" />
              </div>
              <h3 className="text-sm font-black text-black">
                {isEn ? 'Your App is Up to Date!' : 'Versi Anda Sudah Paling Baru!'}
              </h3>
              <p className="text-[11px] text-neutral-700 leading-relaxed max-w-xs font-medium">
                {isEn 
                  ? `AllToolsKuro on your device is currently running the newest release (v${localVersion}). No new updates are required.` 
                  : `Aplikasi AllToolsKuro di perangkat Anda sudah berjalan pada versi paling mutakhir (v${localVersion}). Belum ada pembaruan baru dari developer.`}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] font-mono font-bold bg-white px-2 py-0.5 rounded border border-black text-emerald-800 shadow-[1px_1px_0px_#000000]">
                  {isEn ? 'Status: Active & Secure' : 'Status: Aktif & Mutakhir'}
                </span>
              </div>
            </div>
          )}

          {/* KASUS B: PEMBARUAN BARU SAJA SELESAI DITERAPKAN (ANIMASI BERHASIL) */}
          {isCompleted && (
            <div className="p-4 rounded-xl bg-emerald-50 border-2 border-black shadow-[3px_3px_0px_#000000] flex flex-col items-center text-center gap-2 animate-in zoom-in-95 duration-200">
              <div className="w-12 h-12 rounded-full bg-emerald-600 border-2 border-black flex items-center justify-center text-white shadow-[2px_2px_0px_#000000] animate-bounce">
                <CheckCircle2 className="w-7 h-7 stroke-[2.5]" />
              </div>
              <h3 className="text-sm font-black text-black">
                {isEn ? 'Update Successfully Applied!' : 'Pembaruan Berhasil Diterapkan!'}
              </h3>
              <p className="text-[11px] text-neutral-700 leading-relaxed font-medium">
                {isEn 
                  ? `All features and optimizations of version v${newVersion} are now fully active directly in this application.` 
                  : `Seluruh fitur baru dan optimalisasi performa versi v${newVersion} kini telah aktif langsung di aplikasi ini.`}
              </p>
            </div>
          )}

          {/* KASUS C: ADA UPDATE TERSEDIA - KOTAK BANDINGKAN VERSI */}
          {hasUpdate && !isCompleted && (
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
                  Verified Build
                </span>
              </div>
            </div>
          )}

          {/* Ringkasan Catatan Rilis */}
          <div className="p-3 rounded-xl bg-blue-50/60 border-2 border-black shadow-[2px_2px_0px_#000000]">
            <span className="text-[10px] uppercase font-mono tracking-wider text-blue-700 font-extrabold block mb-1 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              {isEn ? 'Release Highlights' : 'Catatan Rilis'}
            </span>
            <p className="text-neutral-800 leading-relaxed font-medium">
              {releaseNotes}
            </p>
          </div>

          {/* Daftar Fitur Aktif / Fitur Baru */}
          <div>
            <span className="text-[10px] uppercase font-mono tracking-wider text-neutral-700 font-extrabold block mb-2">
              {hasUpdate && !isCompleted
                ? (isEn ? 'New Features & Enhancements:' : 'Fitur Baru & Penyempurnaan:')
                : (isEn ? 'Active Features in this Release:' : 'Fitur Aktif Pada Versi Ini:')}
            </span>
            <div className="space-y-2">
              {features.map((feat, idx) => (
                <div 
                  key={idx}
                  className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white border-2 border-black shadow-[2px_2px_0px_#000000] text-neutral-800"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5 stroke-[2.5]" />
                  <span className="text-[11px] leading-snug font-medium">{feat}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ─── 3. PROGRESS BAR IN-APP UPDATE NEOBRUTALIST ─── */}
          {isDownloading && (
            <div className="p-3.5 rounded-xl bg-amber-50 border-2 border-black shadow-[3px_3px_0px_#000000] space-y-2 animate-in fade-in duration-200">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-extrabold text-black flex items-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />
                  {isEn ? 'Applying In-App Update...' : 'Menerapkan Pembaruan In-App...'}
                </span>
                <span className="text-white font-mono font-black bg-blue-600 px-2 py-0.5 rounded border border-black shadow-[1px_1px_0px_#000000]">
                  {downloadProgress}%
                </span>
              </div>

              {/* Progress Bar Track Solid Neobrutalist */}
              <div className="w-full h-3.5 rounded-lg bg-neutral-200 border-2 border-black overflow-hidden p-0.5 shadow-[1px_1px_0px_#000000]">
                <div 
                  className="h-full rounded bg-blue-600 border border-black transition-all duration-150"
                  style={{ width: `${downloadProgress}%` }}
                />
              </div>

              <p className="text-[10px] text-neutral-700 font-mono font-medium truncate">
                {downloadPhase || (isEn ? 'Processing components in background...' : 'Memproses komponen di latar belakang...')}
              </p>
            </div>
          )}

        </div>

        {/* ─── 4. FOOTER AKSI NEOBRUTALIST ─── */}
        <div className="p-4 sm:p-5 border-t-2 border-black bg-neutral-50 flex items-center justify-between gap-2.5 relative z-10">
          
          {/* Tombol Kiri: Cek Lagi (jika sudah versi terbaru) atau Tutup */}
          {!hasUpdate && !isCompleted ? (
            <button
              type="button"
              onClick={onCheckAgain}
              disabled={isChecking}
              className="px-3.5 py-2 rounded-xl border-2 border-black bg-white hover:bg-neutral-100 text-black font-bold text-xs shadow-[2px_2px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 stroke-[2.5] ${isChecking ? 'animate-spin text-blue-600' : ''}`} />
              <span>{isChecking ? (isEn ? 'Checking...' : 'Memeriksa...') : (isEn ? 'Check Again' : 'Cek Pembaruan Lagi')}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              disabled={isDownloading}
              className="px-4 py-2 rounded-xl border-2 border-black bg-white hover:bg-neutral-100 text-black font-bold text-xs shadow-[2px_2px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all disabled:opacity-40 cursor-pointer"
            >
              {isEn ? 'Cancel' : 'Batal'}
            </button>
          )}

          {/* Tombol Kanan: Update Sekarang atau Selesai */}
          {isCompleted || (!hasUpdate && !isCompleted) ? (
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-xl border-2 border-black bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow-[3px_3px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5 stroke-[3]" />
              <span>{isEn ? 'Close / Done' : 'Selesai'}</span>
            </button>
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
                  <span>{isEn ? 'Updating...' : 'Memperbarui...'}</span>
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
