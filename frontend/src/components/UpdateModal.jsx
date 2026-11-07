// frontend/src/components/UpdateModal.jsx - Dialog Pembaruan Anime Modern (#1a1a2e)
import React from 'react';
import { 
  Sparkles, 
  Download, 
  X, 
  CheckCircle2, 
  ArrowUpCircle,
  FileCode,
  ShieldCheck,
  RefreshCw
} from 'lucide-react';

export default function UpdateModal({
  isOpen,
  onClose,
  latestInfo,
  localVersion,
  isDownloading,
  downloadProgress,
  downloadStatus,
  onStartDownload
}) {
  if (!isOpen) return null;

  const newVersion = latestInfo?.latestVersion || '1.2.0';
  const releaseNotes = latestInfo?.releaseNotes || 'Pembaruan stabilitas dan penambahan fitur terbaru AllToolsKuro.';
  const features = latestInfo?.features || [
    'Safelink Bypasser: Lewati link iklan bertingkat (Sfl.gl, SafelinkU, Ouo) ke direct link.',
    'Ekstrak Deep Link CapCut & Preset Alight Motion pada Cari Link JJ.',
    'Performa unduhan media lebih stabil dengan auto-reconnect.'
  ];
  const fileSize = latestInfo?.fileSize || '11.9 MB';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      
      {/* Container Utama Modal (#1a1a2e dengan Aksen Silver-Grey & Biru) */}
      <div 
        className="w-full max-w-md rounded-2xl border-2 border-black shadow-[6px_6px_0px_#000000] overflow-hidden text-white flex flex-col relative"
        style={{ backgroundColor: '#1a1a2e' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-update-title"
      >
        {/* Dekorasi Aksen Cahaya Anime di Background */}
        <div className="absolute top-0 right-0 w-44 h-44 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-36 h-36 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />

        {/* ─── 1. HEADER MODAL ─── */}
        <div className="p-4 sm:p-5 border-b border-slate-700/80 bg-slate-900/60 flex items-start justify-between relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-blue-600/20 border-2 border-blue-400/40 flex items-center justify-center text-blue-400 shrink-0 shadow-[2px_2px_0px_#000000]">
              <ArrowUpCircle className="w-6 h-6 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30">
                  New Release
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  {fileSize}
                </span>
              </div>
              <h2 id="modal-update-title" className="text-base sm:text-lg font-black tracking-tight text-white mt-1">
                Pembaruan Aplikasi Tersedia!
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isDownloading}
            className="p-1.5 rounded-lg border border-slate-700 bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors disabled:opacity-40 cursor-pointer"
            aria-label="Tutup dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ─── 2. KONTEN DETAIL VERSI & RELEASE NOTES ─── */}
        <div className="p-4 sm:p-5 space-y-4 max-h-[62vh] overflow-y-auto text-xs relative z-10 font-sans">
          
          {/* Baris Identitas Aplikasi & Versi */}
          <div className="grid grid-cols-2 gap-2.5 p-3 rounded-xl bg-slate-900/80 border border-slate-700/60 shadow-[2px_2px_0px_#000000]">
            <div>
              <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 block">
                Aplikasi & ID
              </span>
              <span className="font-extrabold text-white text-xs sm:text-sm block truncate mt-0.5">
                AllToolsKuro
              </span>
              <span className="text-[10px] font-mono text-slate-400 block truncate">
                com.kuro.alltools
              </span>
            </div>

            <div className="text-right border-l border-slate-700/60 pl-2.5">
              <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 block">
                Versi Baru
              </span>
              <div className="flex items-center justify-end gap-1.5 mt-0.5">
                <span className="text-[11px] font-mono text-slate-400 line-through">
                  v{localVersion}
                </span>
                <span className="text-xs sm:text-sm font-mono font-black text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-400/40">
                  v{newVersion}
                </span>
              </div>
              <span className="text-[10px] text-emerald-400 font-mono block mt-0.5 flex items-center justify-end gap-1">
                <ShieldCheck className="w-3 h-3" />
                Verified APK
              </span>
            </div>
          </div>

          {/* Ringkasan Rilis */}
          <div className="p-3 rounded-xl bg-slate-900/40 border border-slate-800">
            <span className="text-[10px] uppercase font-mono tracking-wider text-blue-300 font-bold block mb-1 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              Catatan Rilis
            </span>
            <p className="text-slate-300 leading-relaxed font-medium">
              {releaseNotes}
            </p>
          </div>

          {/* Daftar Fitur Baru */}
          <div>
            <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 font-bold block mb-2">
              Fitur Baru & Penyempurnaan:
            </span>
            <div className="space-y-2">
              {features.map((feat, idx) => (
                <div 
                  key={idx}
                  className="flex items-start gap-2.5 p-2 rounded-lg bg-slate-900/60 border border-slate-800 text-slate-200"
                >
                  <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0 mt-0.5 stroke-[2.2]" />
                  <span className="text-[11px] leading-snug">{feat}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ─── 3. PROGRESS BAR PENGUNDUHAN (Jika Tombol Update Ditekan) ─── */}
          {isDownloading && (
            <div className="p-3.5 rounded-xl bg-blue-950/40 border border-blue-500/40 space-y-2 animate-in fade-in duration-200">
              <div className="flex items-center justify-between text-[11px] font-mono">
                <span className="text-blue-300 flex items-center gap-1.5 font-bold">
                  <RefreshCw className="w-3 h-3 animate-spin text-blue-400" />
                  {downloadStatus === 'completed' ? 'Unduhan Selesai' : 'Mengunduh Pembaruan APK...'}
                </span>
                <span className="text-blue-400 font-black">
                  {downloadProgress}%
                </span>
              </div>

              {/* Progress Bar Track */}
              <div className="w-full h-3 rounded-full bg-slate-800 border border-slate-700 overflow-hidden p-0.5">
                <div 
                  className="h-full rounded-full bg-gradient-to-r from-blue-600 via-indigo-500 to-cyan-400 transition-all duration-200"
                  style={{ width: `${downloadProgress}%` }}
                />
              </div>

              <p className="text-[10px] text-slate-400 font-mono">
                {downloadStatus === 'completed' 
                  ? 'Membuka installer paket Android... Silakan konfirmasi update pada layar HP.' 
                  : 'Mohon tunggu sejenak, berkas APK sedang disiapkan di latar belakang.'}
              </p>
            </div>
          )}

        </div>

        {/* ─── 4. FOOTER AKSI (UPDATE & CANCEL) ─── */}
        <div className="p-4 sm:p-5 border-t border-slate-700/80 bg-slate-900/90 flex items-center justify-end gap-2.5 relative z-10">
          
          {/* Tombol Cancel */}
          <button
            type="button"
            onClick={onClose}
            disabled={isDownloading}
            className="px-4 py-2 rounded-xl border-2 border-black bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-xs shadow-[2px_2px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all disabled:opacity-40 cursor-pointer"
          >
            Batal
          </button>

          {/* Tombol Update */}
          <button
            type="button"
            onClick={onStartDownload}
            disabled={isDownloading}
            className="px-5 py-2 rounded-xl border-2 border-black bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs shadow-[2px_2px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {isDownloading ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Memproses...</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Update Sekarang</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
