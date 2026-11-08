import React from 'react';
import { 
  Sparkles, 
  Download, 
  X, 
  CheckCircle2, 
  ArrowUpCircle,
  ShieldCheck,
  RefreshCw,
  Check,
  Layers,
  Wifi,
  Calendar,
  AlertCircle
} from 'lucide-react';

export default function UpdateModal({
  isOpen,
  onClose,
  latestInfo,
  localVersion,
  hasUpdate = true,
  missedCount = 0,
  pendingCount = 0,
  missedUpdates = [],
  pendingUpdates = [],
  isDownloading = false,
  downloadProgress = 0,
  downloadPhase = '',
  downloadStatus = 'idle',
  networkSpeedLabel = '',
  onStartDownload,
  onCheckAgain,
  isChecking = false,
  lang = 'id'
}) {
  if (!isOpen) return null;

  const isEn = lang === 'en';
  const newVersion = latestInfo?.latestVersion || '1.5.1';
  const effectiveCount = missedCount || pendingCount || 0;
  const rawList = (missedUpdates && missedUpdates.length > 0) 
    ? missedUpdates 
    : (pendingUpdates && pendingUpdates.length > 0 ? pendingUpdates : []);
  const releaseNotes = latestInfo?.releaseNotes || (isEn 
    ? 'Release Update v1.5.1: In-App OTA Update Engine, Accumulated Changelog, and KuroBot 4-Quadrant Docking.'
    : 'Rilis Pembaruan v1.5.1: Sistem In-App OTA Update Internal (Tanpa Keluar APK), Akumulasi Changelog, dan Docking KuroBot 4-Kuadran.');
  
  const defaultFeaturesId = [
    'Sistem In-App OTA Update: Pembaruan internal langsung di dalam aplikasi Android tanpa download file APK lewat browser.',
    'Akumulasi Changelog & Badge Angka: Badge menampilkan jumlah pembaruan yang tertinggal dan riwayat perubahannya.',
    'Widget KuroBot 4-Kuadran: Widget AI bebas digeser ke Kiri-Atas, Kanan-Atas, Kiri-Bawah, atau Kanan-Bawah dengan penyimpanan posisi persisten.',
    'Sinopsis Rekomendasi Bilingual: Sinopsis anime & manhwa otomatis berbahasa Indonesia jika memilih ID, dan English jika memilih EN.',
    'Pembersihan Antarmuka & Optimasi: Menghapus modul CapCut yang tidak berfungsi agar navigasi lebih gesit dan bebas error.'
  ];

  const defaultFeaturesEn = [
    'In-App OTA Update Engine: Seamless in-app updates applied directly without downloading APK files via browser.',
    'Accumulated Changelog & Badge Counter: Badge displays count of pending updates and full chronological change history.',
    'KuroBot 4-Quadrant Widget: AI widget can be repositioned freely across all 4 screen corners with persistent LocalStorage.',
    'Automatic Bilingual Synopses: Anime & manhwa synopses auto-translate to Indonesian or native English based on app language.',
    'Interface Cleanup & Performance: Removed non-functional CapCut tool for cleaner and snappier navigation.'
  ];

  const features = latestInfo?.features || (isEn ? defaultFeaturesEn : defaultFeaturesId);
  const isCompleted = downloadStatus === 'completed';

  // Daftar akumulasi versi yang tertinggal
  const displayMissedList = Array.isArray(rawList) && rawList.length > 0 
    ? rawList 
    : (latestInfo?.changelog ? latestInfo.changelog.slice(0, 1) : []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      
      {/* Container Utama Modal (Neobrutalism Solid - Border 2px Hitam & Bayangan Keras) */}
      <div 
        className="w-full max-w-lg rounded-2xl border-2 border-black bg-white text-black shadow-[6px_6px_0px_#000000] overflow-hidden flex flex-col relative max-h-[90vh]"
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
              : 'bg-gradient-to-r from-blue-50/80 via-amber-50/50 to-white'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-xl border-2 border-black flex items-center justify-center text-white shrink-0 shadow-[2px_2px_0px_#000000] ${
              !hasUpdate || isCompleted ? 'bg-emerald-600' : 'bg-blue-600'
            }`}>
              {!hasUpdate || isCompleted ? (
                <CheckCircle2 className="w-6 h-6 stroke-[2.5]" />
              ) : (
                <ArrowUpCircle className="w-6 h-6 stroke-[2.5]" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded border-2 border-black text-white shadow-[1px_1px_0px_#000000] ${
                  !hasUpdate || isCompleted ? 'bg-emerald-600' : 'bg-blue-600'
                }`}>
                  {!hasUpdate || isCompleted 
                    ? (isEn ? 'Up To Date' : 'Versi Terbaru')
                    : 'OTA In-App Release'}
                </span>
                
                {/* Badge Akumulasi Pembaruan jika lebih dari 1 */}
                {hasUpdate && !isCompleted && effectiveCount > 1 && (
                  <span className="text-[10px] font-mono font-black uppercase tracking-wider px-2 py-0.5 rounded border-2 border-black bg-amber-400 text-black shadow-[1px_1px_0px_#000000] flex items-center gap-1">
                    <Layers className="w-3 h-3 stroke-[2.5]" />
                    {effectiveCount} {isEn ? 'Updates Pending' : 'Pembaruan Menumpuk'}
                  </span>
                )}

                <span className="text-[11px] font-mono text-neutral-600 font-bold">
                  v{hasUpdate && !isCompleted ? newVersion : localVersion}
                </span>
              </div>

              <h2 id="modal-update-title" className="text-base sm:text-lg font-black tracking-tight text-black mt-1">
                {isCompleted
                  ? (isEn ? 'Update Successfully Applied!' : 'Pembaruan Berhasil Diterapkan!')
                  : hasUpdate 
                    ? (effectiveCount > 1 
                        ? (isEn ? `${effectiveCount} App Updates Available!` : `Ada ${effectiveCount} Pembaruan Tersedia!`)
                        : (isEn ? 'App Update Available!' : 'Pembaruan Aplikasi Tersedia!'))
                    : (isEn ? 'Update tidak tersedia' : 'Update tidak tersedia')}
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

        {/* ─── 2. KONTEN DETAIL MODAL & CHANGELOG ─── */}
        <div className="p-4 sm:p-5 space-y-3.5 overflow-y-auto text-xs relative z-10 font-sans custom-scrollbar flex-1">
          
          {/* KASUS A: SUDAH VERSI TERBARU / TIDAK ADA UPDATE TERSEDIA */}
          {!hasUpdate && !isCompleted && (
            <div className="p-4 rounded-xl bg-emerald-50 border-2 border-black shadow-[3px_3px_0px_#000000] flex flex-col items-center text-center gap-2">
              <div className="w-12 h-12 rounded-full bg-emerald-500 border-2 border-black flex items-center justify-center text-white shadow-[2px_2px_0px_#000000]">
                <Check className="w-7 h-7 stroke-[3]" />
              </div>
              <h3 className="text-sm font-black text-black">
                {isEn ? 'Update Not Available' : 'Update tidak tersedia'}
              </h3>
              <p className="text-[11px] text-neutral-700 leading-relaxed max-w-sm font-medium">
                {isEn 
                  ? `AllToolsKuro on your Android device is running the latest release (v${localVersion}). Your application is up to date.` 
                  : `Aplikasi AllToolsKuro di perangkat Android Anda sudah berjalan pada versi paling mutakhir (v${localVersion}). Versi Anda sudah paling baru.`}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] font-mono font-bold bg-white px-2.5 py-0.5 rounded border border-black text-emerald-800 shadow-[1px_1px_0px_#000000]">
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
                {isEn ? 'In-App Update Successfully Applied!' : 'Pembaruan In-App Berhasil Diterapkan!'}
              </h3>
              <p className="text-[11px] text-neutral-700 leading-relaxed font-medium max-w-sm">
                {isEn 
                  ? `All accumulated updates and optimizations for version v${newVersion} have been applied live inside the application. No manual APK download was needed!` 
                  : `Seluruh pembaruan dan perbaikan versi v${newVersion} kini telah aktif langsung di dalam aplikasi tanpa perlu unduh file APK baru.`}
              </p>
            </div>
          )}

          {/* KASUS C: ADA UPDATE TERSEDIA - KOTAK IDENTITAS, VERSI & CATATAN RILIS */}
          {hasUpdate && !isCompleted && (
            <>
              <div className="grid grid-cols-2 gap-2.5 p-3 rounded-xl bg-neutral-50 border-2 border-black shadow-[2px_2px_0px_#000000]">
                <div>
                  <span className="text-[10px] uppercase font-mono tracking-wider text-neutral-500 block font-bold">
                    {isEn ? 'App & ID' : 'APLIKASI & ID'}
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
                    {isEn ? 'New Version' : 'VERSI BARU'}
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

              {/* CATATAN RILIS (SESUAI REFERENSI UI) */}
              {releaseNotes && (
                <div className="p-3 rounded-xl bg-white border-2 border-black shadow-[2px_2px_0px_#000000] space-y-1">
                  <span className="text-[10px] uppercase font-mono tracking-wider text-blue-600 font-extrabold flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    {isEn ? 'Release Notes' : 'CATATAN RILIS'}
                  </span>
                  <p className="text-[11px] text-neutral-800 font-medium leading-relaxed">
                    {releaseNotes}
                  </p>
                </div>
              )}
            </>
          )}

          {/* DAFTAR AKUMULASI CHANGELOG (JIKA MENUMPUK BEBERAPA KALI UPDATE) */}
          {hasUpdate && !isCompleted && displayMissedList.length > 0 && (
            <div className="space-y-2.5">
              <span className="text-[10px] uppercase font-mono tracking-wider text-neutral-700 font-extrabold block flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-blue-600" />
                {displayMissedList.length > 1 
                  ? (isEn ? `Accumulated Release History (${displayMissedList.length} updates):` : `Daftar Seluruh ${displayMissedList.length} Pembaruan yang Tertinggal:`)
                  : (isEn ? 'Release Highlights:' : 'Rincian Pembaruan Versi Baru:')}
              </span>

              <div className="space-y-2.5 max-h-[36vh] overflow-y-auto custom-scrollbar pr-1">
                {displayMissedList.map((item, idx) => (
                  <div 
                    key={idx}
                    className="p-3 rounded-xl bg-white border-2 border-black shadow-[2px_2px_0px_#000000] space-y-1.5"
                  >
                    <div className="flex items-center justify-between border-b border-neutral-200 pb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono font-black px-1.5 py-0.2 bg-blue-600 text-white rounded border border-black shadow-[1px_1px_0px_#000000]">
                          v{item.version}
                        </span>
                        <span className="font-bold text-black text-xs">{item.title || `Versi ${item.version}`}</span>
                      </div>
                      {item.date && (
                        <span className="text-[10px] font-mono text-neutral-500 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {item.date}
                        </span>
                      )}
                    </div>

                    <ul className="space-y-1 pt-0.5">
                      {(item.features || []).map((feat, fIdx) => (
                        <li key={fIdx} className="flex items-start gap-1.5 text-[11px] text-neutral-700 font-medium leading-relaxed">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5 stroke-[2.5]" />
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* DAFTAR FITUR SAAT VERSI SUDAH MUTAKHIR */}
          {!hasUpdate && !isCompleted && (
            <div className="space-y-2">
              <span className="text-[10px] uppercase font-mono tracking-wider text-neutral-700 font-extrabold block">
                {isEn ? 'Active Features in Current Build:' : 'Fitur & Patch Aktif Pada Versi Ini:'}
              </span>
              <div className="space-y-1.5">
                {features.map((feat, idx) => (
                  <div 
                    key={idx}
                    className="flex items-start gap-2 p-2 rounded-lg bg-white border-2 border-black shadow-[1.5px_1.5px_0px_#000000] text-neutral-800"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5 stroke-[2.5]" />
                    <span className="text-[11px] leading-snug font-medium">{feat}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─── 3. PROGRESS BAR REAL-TIME IN-APP OTA (1% - 100%) ─── */}
          {isDownloading && (
            <div className="p-3.5 rounded-xl bg-amber-50 border-2 border-black shadow-[3px_3px_0px_#000000] space-y-2 animate-in fade-in duration-200">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-extrabold text-black flex items-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />
                  {isEn ? 'Applying In-App OTA Update...' : 'Menerapkan Pembaruan In-App OTA...'}
                </span>
                <div className="flex items-center gap-2">
                  {networkSpeedLabel && (
                    <span className="text-[10px] font-mono text-neutral-600 flex items-center gap-1 font-bold">
                      <Wifi className="w-3 h-3 text-emerald-600" />
                      {networkSpeedLabel}
                    </span>
                  )}
                  <span className="text-white font-mono font-black bg-blue-600 px-2 py-0.5 rounded border border-black shadow-[1px_1px_0px_#000000]">
                    {downloadProgress}%
                  </span>
                </div>
              </div>

              {/* Progress Bar Track Solid Neobrutalist */}
              <div className="w-full h-3.5 rounded-lg bg-neutral-200 border-2 border-black overflow-hidden p-0.5 shadow-[1px_1px_0px_#000000]">
                <div 
                  className="h-full rounded bg-blue-600 border border-black transition-all duration-100 ease-linear"
                  style={{ width: `${downloadProgress}%` }}
                />
              </div>

              <p className="text-[10px] text-neutral-700 font-mono font-medium truncate">
                {downloadPhase || (isEn ? 'Downloading and applying assets in background...' : 'Mengunduh dan menerapkan aset di latar belakang...')}
              </p>
            </div>
          )}

        </div>

        {/* ─── 4. FOOTER AKSI NEOBRUTALIST ─── */}
        <div className="p-4 sm:p-5 border-t-2 border-black bg-neutral-50 flex items-center justify-between gap-2.5 relative z-10">
          
          {/* Tombol Kiri: Cek Lagi atau Batal */}
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

          {/* Tombol Kanan: Update Sekarang atau Tutup */}
          {isCompleted || (!hasUpdate && !isCompleted) ? (
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-xl border-2 border-black bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow-[3px_3px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5 stroke-[3]" />
              <span>{isEn ? 'Close' : 'Tutup'}</span>
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
                  <span>{isEn ? 'Applying...' : 'Menerapkan...'}</span>
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
