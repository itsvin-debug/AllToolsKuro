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
  Calendar
} from 'lucide-react';

export default function UpdateModal({
  isOpen,
  onClose,
  latestInfo,
  localVersion,
  hasUpdate = false,
  pendingCount = 0,
  pendingUpdates = [],
  isDownloading = false,
  downloadProgress = 1,
  downloadPhase = '',
  downloadStatus = 'idle',
  onStartDownload,
  onCheckAgain,
  isChecking = false,
  lang = 'id'
}) {
  if (!isOpen) return null;

  const isEn = lang === 'en';
  const newVersion = latestInfo?.latestVersion || '1.5.2';
  const isCompleted = downloadStatus === 'completed';

  // Fallback deskripsi rilis jika data belum termuat
  const releaseNotes = latestInfo?.releaseNotes || (isEn 
    ? 'Release Update v1.5.2: KuroBot 4-Quadrant Docking, Accumulated Live Updates, and Bilingual Metadata.'
    : 'Rilis Pembaruan v1.5.2: Peningkatan Posisi 4-Kuadran KuroBot & In-App Live Update Akumulatif Tanpa Unduh Ulang Browser.');
  
  const defaultFeaturesId = [
    'Widget AI KuroBot 4-Kuadran: Bebas digeser ke sudut mana pun dengan penyimpanan LocalStorage.',
    'In-App Live Update Akumulatif: Melacak seluruh pembaruan tertunda secara kronologis.',
    'Badge Notifikasi Angka Dinamis: Tombol update menampilkan jumlah pembaruan tertunda.',
    'Animasi Progres Live 1% - 100%: Sinkronisasi aset pembaruan langsung di aplikasi.',
    'Status Up-to-Date Otomatis: Menampilkan \'Tidak ada update tersedia\' begitu selesai.'
  ];

  const defaultFeaturesEn = [
    'KuroBot 4-Quadrant Docking: Drag freely to any corner with persistent LocalStorage state.',
    'Accumulated Live Updates: Chronological view of all pending releases in a single dialog.',
    'Dynamic Counter Badge: Update button reflects exact count of pending releases.',
    'Live In-App Progress (1% - 100%): Seamless patch synchronization directly inside the interface.',
    'Automated Up-to-Date State: Displays \'No update available\' once all releases are applied.'
  ];

  const features = latestInfo?.features || (isEn ? defaultFeaturesEn : defaultFeaturesId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      
      {/* Container Utama Modal (Neobrutalism Khas Kuro Studio - Border Tegas & Kontras) */}
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
              : 'bg-gradient-to-r from-amber-50/90 via-rose-50/60 to-white'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl border-2 border-black flex items-center justify-center text-white shrink-0 shadow-[2px_2px_0px_#000000] ${
              !hasUpdate || isCompleted ? 'bg-emerald-600' : 'bg-rose-500'
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
                  !hasUpdate || isCompleted ? 'bg-emerald-600' : 'bg-rose-500'
                }`}>
                  {!hasUpdate || isCompleted 
                    ? (isEn ? 'Up To Date' : 'Versi Terbaru')
                    : pendingCount > 1 
                      ? `${pendingCount} ${isEn ? 'Releases' : 'Pembaruan'}`
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
                    ? (isEn ? 'App Live Update Available!' : 'Pembaruan Aplikasi Tersedia!') 
                    : (isEn ? 'No Update Available' : 'Tidak ada update tersedia')}
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
                {isEn ? 'No update available' : 'Tidak ada update tersedia'}
              </h3>
              <p className="text-[11px] text-neutral-700 leading-relaxed max-w-xs font-medium">
                {isEn 
                  ? `AllToolsKuro on your device is already running on the latest version (v${localVersion}). No new updates are required.` 
                  : `Aplikasi AllToolsKuro di perangkat Anda sudah berjalan pada versi paling mutakhir (v${localVersion}). Belum ada pembaruan baru dari developer.`}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] font-mono font-bold bg-white px-2 py-0.5 rounded border border-black text-emerald-800 shadow-[1px_1px_0px_#000000]">
                  {isEn ? 'Status: Active & Up to Date' : 'Status: Aktif & Paling Mutakhir'}
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

          {/* KASUS C: ADA PEMBARUAN TERSEDIA - KOTAK BANDINGKAN VERSI */}
          {hasUpdate && !isCompleted && (
            <>
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
                    {isEn ? 'Upgrade Version' : 'Versi Baru'}
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
                    Verified Live Bundle
                  </span>
                </div>
              </div>

              {/* Banner Akumulasi jika ada lebih dari 1 rilis tertunda */}
              {pendingCount > 1 && (
                <div className="p-2.5 rounded-xl bg-amber-100 border-2 border-black shadow-[2px_2px_0px_#000000] flex items-center gap-2">
                  <Layers className="w-4 h-4 text-amber-700 shrink-0" />
                  <span className="text-[11px] font-bold text-amber-950">
                    {isEn 
                      ? `Accumulated ${pendingCount} pending updates will be synced together in this single update.` 
                      : `Terdapat ${pendingCount} pembaruan yang menumpuk. Seluruhnya akan langsung diterapkan sekaligus.`}
                  </span>
                </div>
              )}
            </>
          )}

          {/* DAFTAR AKUMULASI RIWAYAT PEMBARUAN (JIKA ADA BEBERAPA RILIS TERTUNDA) */}
          {hasUpdate && !isCompleted && pendingUpdates.length > 0 ? (
            <div>
              <span className="text-[10px] uppercase font-mono tracking-wider text-neutral-700 font-extrabold block mb-2">
                {isEn ? 'Accumulated Release Notes:' : 'Rincian Riwayat Pembaruan Terakumulasi:'}
              </span>
              <div className="space-y-2.5">
                {pendingUpdates.map((release, idx) => (
                  <div 
                    key={idx}
                    className="p-3 rounded-xl bg-white border-2 border-black shadow-[2px_2px_0px_#000000] space-y-1.5"
                  >
                    <div className="flex items-center justify-between border-b border-neutral-200 pb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono font-black bg-blue-600 text-white px-2 py-0.5 rounded border border-black shadow-[1px_1px_0px_#000000]">
                          v{release.version}
                        </span>
                        <span className="font-bold text-black text-[11px] truncate">
                          {release.title}
                        </span>
                      </div>
                      {release.date && (
                        <span className="text-[9px] font-mono text-neutral-500 flex items-center gap-1 shrink-0">
                          <Calendar className="w-2.5 h-2.5" />
                          {release.date}
                        </span>
                      )}
                    </div>
                    <ul className="space-y-1 text-neutral-800 pt-0.5">
                      {release.changes?.map((chg, cIdx) => (
                        <li key={cIdx} className="flex items-start gap-1.5 text-[10.5px] leading-snug">
                          <span className="text-blue-600 font-bold">•</span>
                          <span>{chg}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* TAMPILAN FITUR PADA VERSI SAAT INI (SAAT SUDAH TERBARU) */
            <div className="space-y-2.5">
              <div className="p-3 rounded-xl bg-blue-50/60 border-2 border-black shadow-[2px_2px_0px_#000000]">
                <span className="text-[10px] uppercase font-mono tracking-wider text-blue-700 font-extrabold block mb-1 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                  {isEn ? 'Current Version Features' : 'Fitur Aktif Pada Versi Ini'}
                </span>
                <p className="text-neutral-800 leading-relaxed font-medium">
                  {releaseNotes}
                </p>
              </div>

              <div>
                <span className="text-[10px] uppercase font-mono tracking-wider text-neutral-700 font-extrabold block mb-1.5">
                  {isEn ? 'Included Enhancements:' : 'Penyempurnaan Terpasang:'}
                </span>
                <div className="space-y-1.5">
                  {features.map((feat, idx) => (
                    <div 
                      key={idx}
                      className="flex items-start gap-2 p-2 rounded-lg bg-white border border-black text-neutral-800"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5 stroke-[2.5]" />
                      <span className="text-[10.5px] leading-snug font-medium">{feat}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ─── 3. PROGRESS BAR IN-APP LIVE UPDATE (1% - 100%) ─── */}
          {isDownloading && (
            <div className="p-3.5 rounded-xl bg-amber-50 border-2 border-black shadow-[3px_3px_0px_#000000] space-y-2 animate-in fade-in duration-200">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-extrabold text-black flex items-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />
                  {isEn ? 'Syncing Live In-App Update...' : 'Menyinkronkan Pembaruan In-App...'}
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
                {downloadPhase || (isEn ? 'Applying update bundles in background...' : 'Menerapkan berkas pembaruan di latar belakang...')}
              </p>
            </div>
          )}

        </div>

        {/* ─── 4. FOOTER AKSI NEOBRUTALIST ─── */}
        <div className="p-4 sm:p-5 border-t-2 border-black bg-neutral-50 flex items-center justify-between gap-2.5 relative z-10">
          
          {/* Tombol Kiri: Cek Pembaruan Lagi (jika sudah versi terbaru) atau Batal */}
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
