import React, { useState, useRef } from 'react';
import CosmicBackButton from './CosmicBackButton';
import { addGalleryItem } from '../services/storageService';
import { 
  Flame, 
  Search, 
  Download, 
  Copy, 
  Check, 
  CheckCircle2, 
  Loader2, 
  Film, 
  Music, 
  ExternalLink, 
  Play, 
  Pause, 
  AlertCircle, 
  FolderDown, 
  Smartphone, 
  Clapperboard,
  Sparkles,
  Clipboard,
  ShieldCheck,
  Radio,
  FileCode
} from 'lucide-react';

// 5 Langkah alur deteksi mesin pencari preset JJ
const JJ_SEARCH_STEPS = [
  {
    id: 1,
    num: '01',
    title: 'Validasi Link Video',
    desc: 'Menganalisis format URL TikTok JJ'
  },
  {
    id: 2,
    num: '02',
    title: 'Scan Anchor Video',
    desc: 'Mendeteksi tombol template CapCut resmi'
  },
  {
    id: 3,
    num: '03',
    title: 'Analisis Caption & Komentar',
    desc: 'Memindai link Alight Motion & Google Drive XML'
  },
  {
    id: 4,
    num: '04',
    title: 'Sound Fingerprinting',
    desc: 'Pencocokan trek sound & reverse search JJ identik'
  },
  {
    id: 5,
    num: '05',
    title: 'Preset Siap Digunakan',
    desc: 'Menyiapkan tautan direct template & audio'
  }
];

export default function JjFinderScreen({ onBack, onShowToast }) {
  const [inputQuery, setInputQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [hasStartedSearch, setHasStartedSearch] = useState(false);
  const [error, setError] = useState('');
  const [resultData, setResultData] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioElement, setAudioElement] = useState(null);
  const inputRef = useRef(null);

  // Penempelan dari clipboard langsung tanpa prompt sekunder
  const handlePaste = async () => {
    let text = '';
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        text = await navigator.clipboard.readText();
      }
    } catch {
      // Permission API browser dibatasi
    }

    if (text && text.trim()) {
      setInputQuery(text.trim());
      setError('');
      if (inputRef.current) inputRef.current.focus();
      if (onShowToast) onShowToast('Tautan video berhasil ditempel!');
    } else {
      if (inputRef.current) {
        inputRef.current.focus();
        try { document.execCommand('paste'); } catch {}
      }
      if (onShowToast) onShowToast('Tekan lama pada kolom input untuk menempel tautan.');
    }
  };

  // Peluncuran skema universal CapCut dengan fallback otomatis ke web
  const handleOpenCapCut = (cc) => {
    if (!cc) return;
    const deepLink = cc.deep_link || `capcut://template/detail?template_id=${cc.template_id}&enter_from=template`;
    const webUrl = cc.web_url || cc.url || `https://www.capcut.com/template-detail/${cc.template_id}`;

    let didBlur = false;
    const handleBlur = () => { didBlur = true; };
    window.addEventListener('blur', handleBlur, { once: true });

    window.location.href = deepLink;

    setTimeout(() => {
      window.removeEventListener('blur', handleBlur);
      if (!didBlur) {
        window.open(webUrl, '_blank', 'noopener,noreferrer');
      }
    }, 1200);
  };

  const handleSearch = async (e, directQuery = null) => {
    if (e) e.preventDefault();
    const targetQuery = (directQuery !== null ? directQuery : inputQuery).trim();

    if (!targetQuery) {
      setError('Masukkan tautan video TikTok JJ terlebih dahulu.');
      return;
    }

    setLoading(true);
    setHasStartedSearch(true);
    setActiveStepIndex(0);
    setError('');
    setResultData(null);
    setIsPlayingAudio(false);
    if (audioElement) {
      audioElement.pause();
    }

    // Animasi bertahap visual 5 langkah
    const timer1 = setTimeout(() => setActiveStepIndex(1), 250);
    const timer2 = setTimeout(() => setActiveStepIndex(2), 650);
    const timer3 = setTimeout(() => setActiveStepIndex(3), 1100);

    try {
      let res = await fetch('/api/jj-finder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: targetQuery })
      });

      if (res.status === 404 || !res.ok) {
        const fallbackRes = await fetch('/api/jj/find', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: targetQuery })
        });
        if (fallbackRes.ok) {
          res = fallbackRes;
        }
      }

      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      setActiveStepIndex(3);
      await new Promise((r) => setTimeout(r, 200));

      const contentType = res.headers.get('content-type') || '';
      let data = null;

      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const rawText = await res.text();
        try {
          data = JSON.parse(rawText);
        } catch {
          throw new Error('Layanan sedang memproses data TikTok. Coba klik "Cari Preset" sekali lagi.');
        }
      }

      if (res.ok && data?.success && data?.data) {
        setActiveStepIndex(4);
        setResultData(data.data);
        const jj = data.data;

        // Otomatis simpan ke riwayat galeri lokal
        try {
          addGalleryItem({
            title: jj.video_info?.title || jj.capcut?.title || 'Preset Jedag Jedug TikTok',
            type: 'document',
            category: 'Cari Link JJ',
            extension: 'XML',
            size: jj.xml_gdrive?.file_size || '5MB',
            previewUrl: jj.video_info?.cover || jj.capcut?.cover_url || null,
            downloadData: jj.xml_gdrive?.download_url || jj.alight_motion?.url || jj.capcut?.url || null,
            filename: `jj_preset_${Date.now()}.xml`
          });
        } catch {}

        if (onShowToast) onShowToast('Preset Jedag-Jedug berhasil ditemukan!');
      } else {
        throw new Error(data?.message || 'Gagal mengekstrak preset dari tautan TikTok ini.');
      }
    } catch (err) {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      setError(err.message || 'Terjadi kendala saat menghubungkan ke server pencarian JJ.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text, id) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    if (onShowToast) onShowToast('Tautan berhasil disalin ke papan klip!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const togglePlayAudio = (audioUrl) => {
    if (!audioUrl) return;

    if (isPlayingAudio && audioElement) {
      audioElement.pause();
      setIsPlayingAudio(false);
      return;
    }

    if (audioElement && audioElement.src === audioUrl) {
      audioElement.play().then(() => setIsPlayingAudio(true)).catch(() => {});
      return;
    }

    if (audioElement) {
      audioElement.pause();
    }

    const audio = new Audio(audioUrl);
    audio.onended = () => setIsPlayingAudio(false);
    audio.onerror = () => setIsPlayingAudio(false);
    audio.play().then(() => {
      setAudioElement(audio);
      setIsPlayingAudio(true);
    }).catch(() => {
      setIsPlayingAudio(false);
    });
  };

  const capcut = resultData?.capcut;
  const alight = resultData?.alight_motion;
  const gdrive = resultData?.xml_gdrive;
  const audio = resultData?.audio;
  const video = resultData?.video_info;
  const confidence = resultData?.source_confidence || 'Cocok via Sound JJ Identik';

  return (
    <main className="flex-grow w-full max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 text-black">
      
      {/* Tombol Navigasi Kembali */}
      <div className="mb-5">
        <CosmicBackButton onClick={onBack} label="Kembali ke Beranda" />
      </div>

      {/* ─── 1. KARTU PENCARIAN & INPUT LINK TIKTOK JJ ─── */}
      <div className="rounded-2xl p-5 sm:p-7 border-2 border-black bg-white shadow-[4px_4px_0px_#000000] mb-6">
        
        <div className="flex items-center gap-3.5 pb-4 border-b-2 border-black">
          <div className="w-11 h-11 rounded-xl border-2 border-black bg-black text-white flex items-center justify-center shrink-0 shadow-[2px_2px_0px_#000000]">
            <Flame className="w-6 h-6 stroke-[2.2] text-amber-400" />
          </div>
          <div>
            <h1 className="text-lg sm:text-2xl font-black tracking-tight font-display text-black">
              Cari Link JJ (Jedag-Jedug)
            </h1>
            <p className="text-xs sm:text-sm text-neutral-600 font-mono mt-0.5">
              Temukan direct link Template CapCut, Preset 5MB Alight Motion, berkas XML Google Drive, dan Sound Audio asli dari video TikTok JJ.
            </p>
          </div>
        </div>

        {/* Form Input: Tombol Tempel di dalam Input, Tombol Cari Preset di Bawah Input */}
        <form onSubmit={handleSearch} className="mt-5 space-y-4">
          
          {/* Kolom Input dengan Tombol Tempel di Kanan Dalam */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500 stroke-[2.5]" />
            <input
              ref={inputRef}
              type="text"
              value={inputQuery}
              onChange={(e) => {
                setInputQuery(e.target.value);
                setError('');
              }}
              disabled={loading}
              placeholder="Tempel link TikTok JJ (misal: https://vt.tiktok.com/... atau https://www.tiktok.com/@.../video/...)"
              className="w-full pl-10 pr-24 py-3.5 rounded-xl border-2 border-black bg-neutral-50 text-black text-xs sm:text-sm font-mono outline-none focus:bg-white focus:shadow-[3px_3px_0px_#000000] placeholder:text-neutral-400 transition-all disabled:bg-neutral-100"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
              {inputQuery && (
                <button
                  type="button"
                  onClick={() => { setInputQuery(''); setError(''); }}
                  disabled={loading}
                  className="px-2 py-1 text-xs font-mono text-neutral-500 hover:text-black cursor-pointer"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={handlePaste}
                disabled={loading}
                className="px-2.5 py-1 text-[11px] font-mono font-bold bg-neutral-100 hover:bg-neutral-200 text-black rounded border border-black shadow-[1px_1px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 transition-all cursor-pointer flex items-center gap-1"
              >
                <Clipboard className="w-3 h-3 stroke-[2.5]" />
                <span>Tempel</span>
              </button>
            </div>
          </div>

          {/* Tombol Cari Preset di Bawah Input Sesuai Permintaan */}
          <button
            type="submit"
            disabled={loading}
            className="w-full sm:w-auto px-7 py-3.5 rounded-xl border-2 border-black bg-black text-white font-extrabold text-xs sm:text-sm shadow-[3px_3px_0px_#000000] hover:bg-neutral-800 active:translate-x-0.5 active:translate-y-0.5 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>Memindai 4-Layer Preset...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>Cari Preset</span>
              </>
            )}
          </button>
        </form>

        {/* ─── ANIMASI 5-STEP SEARCHING STATE ─── */}
        {(loading || resultData || hasStartedSearch) && (
          <div className="mt-5 space-y-3 pt-3 border-t-2 border-black animate-in fade-in duration-200">
            
            {/* Indikator 5 Kotak */}
            <div className="grid grid-cols-5 gap-1.5 sm:gap-2.5">
              {JJ_SEARCH_STEPS.map((st, idx) => {
                const isDone = !!resultData || idx < activeStepIndex;
                const isActive = loading && idx === activeStepIndex;

                return (
                  <div
                    key={st.id}
                    className={`relative flex flex-col items-center justify-center p-2 sm:p-2.5 rounded-xl border-2 transition-all duration-200 min-h-[48px] sm:min-h-[52px] select-none ${
                      isDone
                        ? 'bg-emerald-100 border-black text-black shadow-[2px_2px_0px_#000000]'
                        : isActive
                        ? 'bg-amber-100 border-black text-black shadow-[3px_3px_0px_#000000] scale-[1.03] ring-2 ring-black'
                        : 'bg-neutral-100 border-neutral-300 text-neutral-400 opacity-60'
                    }`}
                  >
                    <span className="font-mono font-black text-xs sm:text-sm">
                      {st.num}
                    </span>

                    {isDone && (
                      <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-emerald-500 text-white rounded-full border border-black flex items-center justify-center text-[9px] font-black shadow-[1px_1px_0px_#000000]">
                        ✓
                      </span>
                    )}

                    {isActive && (
                      <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-amber-400 text-black rounded-full border border-black flex items-center justify-center text-[9px] font-black shadow-[1px_1px_0px_#000000] animate-pulse">
                        •
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Status Tahap Aktif */}
            <div className="p-3 sm:p-3.5 rounded-xl border-2 border-black bg-neutral-50 shadow-[2px_2px_0px_#000000] flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-black text-white flex items-center justify-center font-mono font-black text-xs shrink-0 shadow-[1px_1px_0px_#000000]">
                {JJ_SEARCH_STEPS[activeStepIndex]?.num || '01'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs sm:text-sm font-black font-mono text-black truncate">
                    {JJ_SEARCH_STEPS[activeStepIndex]?.title}
                  </span>
                  <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border border-black shrink-0 ${
                    resultData
                      ? 'bg-emerald-200 text-emerald-900'
                      : error
                      ? 'bg-rose-200 text-rose-900'
                      : 'bg-amber-200 text-amber-900 animate-pulse'
                  }`}>
                    {resultData ? 'Selesai' : error ? 'Gagal' : 'Sedang Proses'}
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs text-neutral-600 font-mono truncate mt-0.5">
                  {JJ_SEARCH_STEPS[activeStepIndex]?.desc}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Pesan Kesalahan */}
        {error && (
          <div className="mt-4 p-4 rounded-xl border-2 border-rose-500 bg-rose-50 text-rose-950 text-xs font-mono flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 stroke-[2.5] text-rose-600" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* ─── 2. OUTPUT 4 KARTU TERSTRUKTUR PRESET JJ ─── */}
      {resultData && (
        <div className="space-y-6 animate-in fade-in duration-200">
          
          {/* Header Ringkasan & Badge Confidence */}
          <div className="p-4 sm:p-5 rounded-2xl border-2 border-black bg-white shadow-[4px_4px_0px_#000000] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-black text-white flex items-center justify-center border-2 border-black shadow-[1px_1px_0px_#000000]">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-black text-black">
                  Hasil Penemuan Preset JJ
                </h2>
                <p className="text-[11px] font-mono text-neutral-600">
                  {video?.author ? `Kreator: ${video.author}` : 'Preset berhasil dipetakan'}
                </p>
              </div>
            </div>

            {/* Confidence Badge */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 border-black text-xs font-mono font-bold shadow-[2px_2px_0px_#000000] bg-emerald-100 text-emerald-950">
              <Sparkles className="w-3.5 h-3.5 text-emerald-700" />
              <span>{confidence}</span>
            </div>
          </div>

          {/* Grid 4 Kartu Terstruktur */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
            
            {/* KARTU 1: TEMPLATE CAPCUT */}
            {capcut && (
              <div className="rounded-2xl border-2 border-black bg-white p-5 shadow-[4px_4px_0px_#000000] flex flex-col justify-between gap-4">
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-black bg-black text-white text-[10px] font-mono font-bold">
                      <Clapperboard className="w-3 h-3 text-amber-400" />
                      <span>Template CapCut</span>
                    </span>
                    <span className="text-[11px] font-mono text-neutral-500">
                      Rasio {capcut.ratio || '9:16'} • {capcut.duration || '15s'}
                    </span>
                  </div>

                  <h3 className="text-sm sm:text-base font-black text-black line-clamp-2">
                    {capcut.title || 'Template CapCut Jedag Jedug'}
                  </h3>

                  <p className="text-xs text-neutral-600 font-mono">
                    Template ID: <span className="font-bold text-black">{capcut.template_id}</span>
                  </p>
                </div>

                <div className="pt-2 border-t border-neutral-200 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenCapCut(capcut)}
                    className="w-full py-2.5 px-4 rounded-xl border-2 border-black bg-black text-white hover:bg-neutral-800 text-xs font-mono font-black flex items-center justify-center gap-2 shadow-[2px_2px_0px_#000000] cursor-pointer"
                  >
                    <Clapperboard className="w-4 h-4 text-emerald-400" />
                    <span>Pakai di CapCut</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>

                  <div className="flex items-center gap-2">
                    <a
                      href={capcut.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 py-2 px-3 rounded-lg border border-black bg-neutral-100 hover:bg-neutral-200 text-black text-xs font-mono font-bold text-center"
                    >
                      Buka Web CapCut
                    </a>
                    <button
                      type="button"
                      onClick={() => handleCopy(capcut.url, 'capcut')}
                      className="py-2 px-3 rounded-lg border border-black bg-neutral-100 hover:bg-neutral-200 text-black text-xs font-mono font-bold flex items-center gap-1 cursor-pointer"
                    >
                      {copiedId === 'capcut' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>Salin</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* KARTU 2: PRESET 5MB ALIGHT MOTION */}
            {alight && (
              <div className="rounded-2xl border-2 border-black bg-white p-5 shadow-[4px_4px_0px_#000000] flex flex-col justify-between gap-4">
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-black bg-black text-white text-[10px] font-mono font-bold">
                      <Smartphone className="w-3 h-3 text-cyan-400" />
                      <span>{alight.badge || 'Preset 5MB'}</span>
                    </span>
                    <span className="text-[11px] font-mono text-neutral-500 font-bold">
                      {alight.file_size || '4.8 MB'}
                    </span>
                  </div>

                  <h3 className="text-sm sm:text-base font-black text-black line-clamp-2">
                    {alight.title || 'Preset 5MB Alight Motion'}
                  </h3>

                  <p className="text-xs text-neutral-600 font-mono">
                    Tautan impor langsung ke aplikasi Alight Motion tanpa kuota XML.
                  </p>
                </div>

                <div className="pt-2 border-t border-neutral-200 flex flex-col gap-2">
                  <a
                    href={alight.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-2.5 px-4 rounded-xl border-2 border-black bg-black text-white hover:bg-neutral-800 text-xs font-mono font-black flex items-center justify-center gap-2 shadow-[2px_2px_0px_#000000] cursor-pointer"
                  >
                    <Smartphone className="w-4 h-4 text-cyan-400" />
                    <span>Buka Alight Motion</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>

                  <button
                    type="button"
                    onClick={() => handleCopy(alight.url, 'alight')}
                    className="w-full py-2 px-3 rounded-lg border border-black bg-neutral-100 hover:bg-neutral-200 text-black text-xs font-mono font-bold flex items-center justify-center gap-1 cursor-pointer"
                  >
                    {copiedId === 'alight' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>Salin Link Preset 5MB</span>
                  </button>
                </div>
              </div>
            )}

            {/* KARTU 3: XML PRESET GOOGLE DRIVE */}
            {gdrive && (
              <div className="rounded-2xl border-2 border-black bg-white p-5 shadow-[4px_4px_0px_#000000] flex flex-col justify-between gap-4">
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-black bg-black text-white text-[10px] font-mono font-bold">
                      <FolderDown className="w-3 h-3 text-emerald-400" />
                      <span>{gdrive.badge || 'XML Preset'}</span>
                    </span>
                    <span className="text-[11px] font-mono text-neutral-500 font-bold">
                      {gdrive.file_size || '210 KB'}
                    </span>
                  </div>

                  <h3 className="text-sm sm:text-base font-black text-black line-clamp-2">
                    {gdrive.title || 'XML Preset Google Drive'}
                  </h3>

                  <p className="text-xs text-neutral-600 font-mono">
                    Berkas XML murni, kompatibel dengan semua versi Alight Motion lawas & baru.
                  </p>
                </div>

                <div className="pt-2 border-t border-neutral-200 flex flex-col gap-2">
                  <a
                    href={gdrive.download_url || gdrive.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-2.5 px-4 rounded-xl border-2 border-black bg-black text-white hover:bg-neutral-800 text-xs font-mono font-black flex items-center justify-center gap-2 shadow-[2px_2px_0px_#000000] cursor-pointer"
                  >
                    <Download className="w-4 h-4 text-emerald-400" />
                    <span>Unduh XML Langsung</span>
                  </a>

                  <div className="flex items-center gap-2">
                    <a
                      href={gdrive.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 py-2 px-3 rounded-lg border border-black bg-neutral-100 hover:bg-neutral-200 text-black text-xs font-mono font-bold text-center"
                    >
                      Buka Drive
                    </a>
                    <button
                      type="button"
                      onClick={() => handleCopy(gdrive.download_url || gdrive.url, 'gdrive')}
                      className="py-2 px-3 rounded-lg border border-black bg-neutral-100 hover:bg-neutral-200 text-black text-xs font-mono font-bold flex items-center gap-1 cursor-pointer"
                    >
                      {copiedId === 'gdrive' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>Salin</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* KARTU 4: SOUND / AUDIO ASLI */}
            {audio && (
              <div className="rounded-2xl border-2 border-black bg-white p-5 shadow-[4px_4px_0px_#000000] flex flex-col justify-between gap-4">
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-black bg-black text-white text-[10px] font-mono font-bold">
                      <Music className="w-3 h-3 text-pink-400" />
                      <span>Audio JJ Asli</span>
                    </span>
                    <span className="text-[11px] font-mono text-neutral-500 font-bold">
                      {audio.duration || '00:15'}
                    </span>
                  </div>

                  <h3 className="text-sm sm:text-base font-black text-black line-clamp-2">
                    {audio.title || 'Sound Jedag Jedug TikTok'}
                  </h3>

                  <p className="text-xs text-neutral-600 font-mono">
                    Artis/Kreator: <span className="font-bold text-black">{audio.author || 'TikTok Music'}</span>
                  </p>
                </div>

                <div className="pt-2 border-t border-neutral-200 flex flex-col gap-2">
                  {audio.audio_url ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => togglePlayAudio(audio.audio_url)}
                        className="py-2.5 px-4 rounded-xl border-2 border-black bg-neutral-100 hover:bg-neutral-200 text-black text-xs font-mono font-black flex items-center justify-center gap-1.5 cursor-pointer shadow-[1px_1px_0px_#000000]"
                      >
                        {isPlayingAudio ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                        <span>{isPlayingAudio ? 'Jeda Suara' : 'Pratinjau'}</span>
                      </button>

                      <a
                        href={audio.audio_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        download="sound_jj_kuro.mp3"
                        className="flex-1 py-2.5 px-4 rounded-xl border-2 border-black bg-black text-white hover:bg-neutral-800 text-xs font-mono font-black flex items-center justify-center gap-2 shadow-[2px_2px_0px_#000000] cursor-pointer"
                      >
                        <Download className="w-4 h-4 text-emerald-400" />
                        <span>Unduh MP3</span>
                      </a>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleCopy(inputQuery, 'audio')}
                      className="w-full py-2.5 px-4 rounded-xl border-2 border-black bg-neutral-100 hover:bg-neutral-200 text-black text-xs font-mono font-bold flex items-center justify-center gap-1 cursor-pointer"
                    >
                      {copiedId === 'audio' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>Salin Info Sound</span>
                    </button>
                  )}
                </div>
              </div>
            )}

          </div>

        </div>
      )}

    </main>
  );
}
