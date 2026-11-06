import React, { useState } from 'react';
import axios from 'axios';
import { 
  Link2, 
  ExternalLink, 
  Copy, 
  Check, 
  Sparkles, 
  Loader2, 
  AlertCircle, 
  Zap, 
  Terminal, 
  ShieldCheck,
  Globe,
  Clock,
  ArrowRight,
  Search,
  Cog,
  CheckCircle2
} from 'lucide-react';
import CosmicBackButton from './CosmicBackButton';
import { logHistoryItem } from '../services/storageService';

// Definisi 5 tahapan alur kerja bypass safelink (sesuai indikator step-by-step)
const RESOLVER_STEPS = [
  {
    id: 1,
    num: '01',
    title: 'Validasi Format URL',
    desc: 'Menganalisis parameter query & struktur tautan',
    icon: Search
  },
  {
    id: 2,
    num: '02',
    title: 'Deteksi Safelink',
    desc: 'Mengenali tipe domain (Sfl.gl, SafelinkU, Ouo, Bitly)',
    icon: Link2
  },
  {
    id: 3,
    num: '03',
    title: 'Evaluasi Redirect HTTP',
    desc: 'Memeriksa header respons & rute cepat',
    icon: Globe
  },
  {
    id: 4,
    num: '04',
    title: 'Memproses Safelink',
    desc: 'Menjalankan deep scraper & menembus countdown proteksi',
    icon: Cog
  },
  {
    id: 5,
    num: '05',
    title: 'Bypass Selesai',
    desc: 'Tautan unduhan asli berhasil diperoleh',
    icon: CheckCircle2
  }
];

export default function LinkResolverScreen({ onBack, onShowToast }) {
  const [urlInput, setUrlInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasStartedProcess, setHasStartedProcess] = useState(false);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [resolveResult, setResolveResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isCopied, setIsCopied] = useState(false);

  // Daftar sampel link untuk uji coba cepat
  const sampleLinks = [
    { label: 'Bitly Redirect', url: 'https://bit.ly/3yLqm' },
    { label: 'S.id Shortlink', url: 'https://s.id/' },
    { label: 'Safelink Base64', url: 'https://example.com/safelink?url=aHR0cHM6Ly9naXRodWIuY29t' }
  ];

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrlInput(text.trim());
        setErrorMessage('');
      }
    } catch {
      onShowToast?.('Gagal menempel dari papan klip.');
    }
  };

  const handleResolve = async (overrideUrl) => {
    const target = (overrideUrl || urlInput).trim();
    if (!target) {
      setErrorMessage('Harap masukkan URL safelink atau shortlink yang ingin di-bypass.');
      return;
    }

    setIsLoading(true);
    setHasStartedProcess(true);
    setActiveStepIndex(0);
    setErrorMessage('');
    setResolveResult(null);

    // Timeline tahap animasi bertahap
    const t1 = setTimeout(() => setActiveStepIndex(1), 750);
    const t2 = setTimeout(() => setActiveStepIndex(2), 2000);
    const t3 = setTimeout(() => setActiveStepIndex(3), 5500);

    try {
      const res = await axios.post('/api/resolve', { url: target }, {
        timeout: 35000
      });

      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);

      if (res.data && res.data.status === 'success') {
        setActiveStepIndex(4);
        setResolveResult(res.data);

        // Catat ke riwayat lokal aplikasi
        try {
          const destHostname = new URL(res.data.resolved_url).hostname;
          logHistoryItem({
            type: 'tool',
            toolId: 'resolver',
            toolName: 'Safelink Resolver',
            title: `Bypass: ${destHostname}`,
            description: `Dari ${target.substring(0, 32)}... (${res.data.elapsed_ms || 0} ms)`,
            timestamp: Date.now()
          });
        } catch {
          // ignore parsing error
        }

        onShowToast?.('Link tujuan berhasil di-bypass!');
      } else {
        setErrorMessage(res.data?.message || 'Link tujuan tidak ditemukan atau dilindungi proteksi.');
      }
    } catch (err) {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      const msg = err.response?.data?.message || (err.code === 'ECONNABORTED' 
        ? 'Proses bypass melebihi batas waktu (timeout). Link mungkin dilindungi Captcha interaktif.' 
        : 'Gagal menghubungi server resolver. Pastikan koneksi backend aktif.');
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyLink = () => {
    if (!resolveResult?.resolved_url) return;
    navigator.clipboard.writeText(resolveResult.resolved_url);
    setIsCopied(true);
    onShowToast?.('Link berhasil disalin ke papan klip!');
    setTimeout(() => setIsCopied(false), 2200);
  };

  return (
    <main className="flex-grow flex flex-col items-center justify-start px-4 sm:px-6 py-6 sm:py-8 max-w-4xl mx-auto w-full">
      {/* Tombol Navigasi & Tag Header */}
      <div className="w-full flex items-center justify-between mb-4">
        <CosmicBackButton onClick={onBack} label="Kembali ke Beranda" />
        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-black text-white rounded-full border-2 border-black text-[11px] font-mono font-bold shadow-[2px_2px_0px_#000000]">
          <Link2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>Safelink Resolver</span>
        </div>
      </div>

      {/* Hero Card & Input Formulir */}
      <div className="w-full bg-white rounded-2xl p-5 sm:p-8 border-2 border-black shadow-[4px_4px_0px_#000000] mb-6">
        <div className="flex items-start gap-3.5 sm:gap-4 mb-5">
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-black text-white flex items-center justify-center shrink-0 border-2 border-black shadow-[2px_2px_0px_#000000]">
            <Link2 className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.5]" />
          </div>
          <div>
            <h1 className="text-lg sm:text-2xl font-black text-black">
              Safelink & Shortlink Resolver
            </h1>
            <p className="text-xs sm:text-sm text-neutral-600 font-mono mt-0.5">
              Lewati safelink berbelit, countdown waktu, dan halaman iklan membingungkan untuk langsung mendapatkan link unduhan asli (Mediafire, Google Drive, Mega, dll) secara instan.
            </p>
          </div>
        </div>

        {/* Input Textfield & Tombol Bypass */}
        <div className="space-y-4">
          <div className="relative">
            <input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !isLoading && handleResolve()}
              disabled={isLoading}
              placeholder="Tempel tautan safelink di sini (misal: sfl.gl, safelinku, ouo.io, bit.ly, s.id...)"
              className="w-full pl-4 pr-24 py-3 sm:py-3.5 bg-neutral-50 rounded-xl border-2 border-black text-xs sm:text-sm font-mono text-black placeholder:text-neutral-400 focus:outline-none focus:bg-white focus:shadow-[3px_3px_0px_#000000] disabled:bg-neutral-100 transition-all"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {urlInput ? (
                <button
                  type="button"
                  onClick={() => setUrlInput('')}
                  disabled={isLoading}
                  className="px-2 py-1 text-xs font-mono text-neutral-500 hover:text-black cursor-pointer"
                >
                  Clear
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handlePaste}
                  disabled={isLoading}
                  className="px-2.5 py-1 text-[11px] font-mono font-bold bg-neutral-200 hover:bg-neutral-300 rounded border border-black text-black transition-colors cursor-pointer"
                >
                  Paste
                </button>
              )}
            </div>
          </div>

          {/* Contoh Link Cepat */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-[11px] font-mono font-bold text-neutral-600 flex items-center gap-1">
              <Zap className="w-3 h-3 text-amber-500" /> Coba sampel:
            </span>
            {sampleLinks.map((s, idx) => (
              <button
                key={idx}
                type="button"
                disabled={isLoading}
                onClick={() => {
                  setUrlInput(s.url);
                  handleResolve(s.url);
                }}
                className="px-2.5 py-1 text-[11px] font-mono font-bold bg-neutral-100 hover:bg-neutral-200 text-black rounded-lg border border-black transition-all cursor-pointer shadow-[1px_1px_0px_#000000] disabled:opacity-50"
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* ======================================================== */}
          {/* ANIMASI STEP-BY-STEP (Sesuai Referensi Visual)           */}
          {/* ======================================================== */}
          {(isLoading || resolveResult || hasStartedProcess) && (
            <div className="space-y-3 pt-2 pb-1 animate-in fade-in duration-200">
              {/* Baris 5 Kotak Ikon Langkah */}
              <div className="grid grid-cols-5 gap-1.5 sm:gap-2.5">
                {RESOLVER_STEPS.map((st, idx) => {
                  const IconComponent = st.icon;
                  const isDone = (resolveResult && resolveResult.status === 'success') || idx < activeStepIndex;
                  const isActive = isLoading && idx === activeStepIndex;

                  return (
                    <div
                      key={st.id}
                      className={`relative flex flex-col items-center justify-center p-2 sm:p-3 rounded-xl border-2 transition-all duration-200 min-h-[50px] sm:min-h-[56px] select-none ${
                        isDone
                          ? 'bg-emerald-100 border-black text-black shadow-[2px_2px_0px_#000000]'
                          : isActive
                          ? 'bg-amber-100 border-black text-black shadow-[3px_3px_0px_#000000] scale-[1.03] ring-2 ring-black'
                          : 'bg-neutral-100 border-neutral-300 text-neutral-400 opacity-60'
                      }`}
                    >
                      {/* Ikon Langkah */}
                      <IconComponent 
                        className={`w-4 h-4 sm:w-5 sm:h-5 ${
                          isActive && st.icon === Cog 
                            ? 'animate-spin text-black' 
                            : isActive 
                            ? 'animate-pulse text-black' 
                            : isDone 
                            ? 'text-emerald-800' 
                            : 'text-neutral-400'
                        }`} 
                      />

                      {/* Badge Centang Selesai di Sudut Kanan Atas */}
                      {isDone && (
                        <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-emerald-500 text-white rounded-full border border-black flex items-center justify-center text-[9px] font-black shadow-[1px_1px_0px_#000000]">
                          ✓
                        </span>
                      )}

                      {/* Badge Indikator Aktif Berkedip di Sudut Kanan Atas */}
                      {isActive && (
                        <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-amber-400 text-black rounded-full border border-black flex items-center justify-center text-[9px] font-black shadow-[1px_1px_0px_#000000] animate-pulse">
                          •
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Detail Teks Tahap yang Sedang Berjalan */}
              <div className="p-3 sm:p-3.5 rounded-xl border-2 border-black bg-neutral-50 shadow-[2px_2px_0px_#000000] flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-black text-white flex items-center justify-center font-mono font-black text-xs shrink-0 shadow-[1px_1px_0px_#000000]">
                  {RESOLVER_STEPS[activeStepIndex]?.num || '01'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs sm:text-sm font-black font-mono text-black truncate">
                      {RESOLVER_STEPS[activeStepIndex]?.title}
                    </span>
                    <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border border-black shrink-0 ${
                      resolveResult ? 'bg-emerald-200 text-emerald-900' : 'bg-amber-200 text-amber-900 animate-pulse'
                    }`}>
                      {resolveResult ? 'Selesai' : 'Sedang Proses'}
                    </span>
                  </div>
                  <p className="text-[11px] sm:text-xs text-neutral-600 font-mono truncate mt-0.5">
                    {RESOLVER_STEPS[activeStepIndex]?.desc}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Tombol Aksi Utama "Bypass" */}
          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={() => handleResolve()}
              disabled={isLoading || !urlInput.trim()}
              className="w-full sm:w-auto px-7 py-3 rounded-xl bg-black hover:bg-neutral-800 disabled:opacity-50 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 border-2 border-black shadow-[3px_3px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 transition-all cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Memproses...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <span>Bypass</span>
                  <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
                </>
              )}
            </button>
          </div>
        </div>

        {/* Banner Peringatan / Error */}
        {errorMessage && (
          <div className="mt-5 p-4 rounded-xl border-2 border-red-500 bg-red-50 flex items-start gap-3 text-red-900 text-xs font-mono animate-in fade-in duration-200">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-grow">
              <p className="font-bold">Gagal Melewati Proteksi Safelink</p>
              <p className="mt-0.5 text-red-700">{errorMessage}</p>
            </div>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* CARD HASIL RESOLVE SUKSES */}
      {/* ======================================================== */}
      {resolveResult && (
        <div className="w-full bg-white rounded-2xl p-5 sm:p-8 border-2 border-black shadow-[4px_4px_0px_#000000] space-y-5 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b-2 border-black">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-500 text-white flex items-center justify-center border border-black shadow-[1px_1px_0px_#000000]">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <h2 className="text-base sm:text-lg font-black text-black">
                Link Berhasil Di-Resolve!
              </h2>
            </div>

            {/* Mesin Pemroses & Telemetri Durasi */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono font-black border border-black bg-neutral-100 text-black">
                {resolveResult.engine === 'nodejs-fast' ? (
                  <>
                    <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                    <span>Fast Resolve</span>
                  </>
                ) : (
                  <>
                    <Terminal className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Deep Scrape</span>
                  </>
                )}
              </div>

              {typeof resolveResult.elapsed_ms === 'number' && (
                <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-mono font-bold border border-black bg-neutral-100 text-neutral-700">
                  <Clock className="w-3 h-3 text-neutral-500" />
                  <span>{resolveResult.elapsed_ms} ms</span>
                </div>
              )}
            </div>
          </div>

          {/* Kotak URL Tujuan Akhir */}
          <div className="p-4 rounded-xl bg-neutral-50 border-2 border-black space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold font-mono text-neutral-600 uppercase">
                URL Tujuan Akhir (Resolved URL):
              </span>
              <span className="text-[10px] font-mono text-emerald-700 font-bold bg-emerald-100 px-2 py-0.5 rounded border border-emerald-300">
                Target Terverifikasi
              </span>
            </div>
            <p className="text-sm sm:text-base font-bold font-mono text-black break-all select-all">
              {resolveResult.resolved_url}
            </p>
          </div>

          {/* Detail Link Asal */}
          <div className="text-xs font-mono text-neutral-600 space-y-1">
            <p className="truncate">
              <span className="font-bold text-neutral-800">Link Awal:</span> {resolveResult.original_url}
            </p>
          </div>

          {/* Tombol Aksi: Salin Link & Buka Link */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-2">
            <button
              type="button"
              onClick={handleCopyLink}
              className="flex-1 py-3 px-4 rounded-xl bg-white hover:bg-neutral-100 text-black font-black text-xs font-mono flex items-center justify-center gap-2 border-2 border-black shadow-[2px_2px_0px_#000000] cursor-pointer active:translate-x-0.5 active:translate-y-0.5 transition-all"
            >
              {isCopied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span>Tersalin ke Clipboard!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Salin Link</span>
                </>
              )}
            </button>

            <a
              href={resolveResult.resolved_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 py-3 px-4 rounded-xl bg-black hover:bg-neutral-800 text-white font-black text-xs font-mono flex items-center justify-center gap-2 border-2 border-black shadow-[2px_2px_0px_#000000] cursor-pointer active:translate-x-0.5 active:translate-y-0.5 transition-all"
            >
              <ExternalLink className="w-4 h-4 text-emerald-400" />
              <span>Buka Link</span>
            </a>
          </div>

        </div>
      )}

      {/* Info Cara Kerja Fitur */}
      <div className="w-full mt-6 p-4 rounded-xl border border-neutral-300 bg-neutral-100/70 text-[11px] font-mono text-neutral-600 flex items-start gap-2.5">
        <Globe className="w-4 h-4 text-neutral-700 shrink-0 mt-0.5" />
        <p>
          <strong>Cara Kerja:</strong> Cukup tempel tautan safelink atau shortlink yang ingin kamu buka. Sistem kami akan secara otomatis menganalisis tautan, melewati hitungan mundur (*countdown*), menembus jebakan iklan, dan langsung menyajikan tautan file asli yang aman dan siap diunduh.
        </p>
      </div>
    </main>
  );
}
