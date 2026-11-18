import React, { useState, useRef, useMemo } from 'react';
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
  CheckCircle2,
  Layers,
  ListFilter
} from 'lucide-react';
import CosmicBackButton from './CosmicBackButton';
import { logHistoryItem } from '../services/storageService';
import { readClipboardText } from '../utils/clipboard';

// Definisi 5 tahapan alur kerja bypass safelink (sesuai indikator step-by-step)
const RESOLVER_STEPS = [
  {
    id: 1,
    num: '01',
    title: 'Validasi Format URL',
    desc: 'Menganalisis skema & struktur tautan masukan',
    icon: Search
  },
  {
    id: 2,
    num: '02',
    title: 'Klasifikasi Tipe URL',
    desc: 'Deteksi tipe: Direct, Aggregator (Linktree), atau Safelink',
    icon: Link2
  },
  {
    id: 3,
    num: '03',
    title: 'Evaluasi Redirect HTTP',
    desc: 'Memeriksa header 301/302 atau respons 200 OK',
    icon: Globe
  },
  {
    id: 4,
    num: '04',
    title: 'Deep Scraper / Ekstraksi Bio',
    desc: 'Menjalankan parser Linktree, DOM, atau penembus proteksi',
    icon: Cog
  },
  {
    id: 5,
    num: '05',
    title: 'Bypass Selesai',
    desc: 'Tautan unduhan / daftar link berhasil diperoleh',
    icon: CheckCircle2
  }
];

function extractClientAggregatorItems(content, targetUrl) {
  if (!content || typeof content !== 'string') return [];
  const items = [];
  const seen = new Set();
  let baseHost = '';
  try { baseHost = new URL(targetUrl).hostname.toLowerCase(); } catch {}

  // 1. Ekstraksi script __NEXT_DATA__
  if (content.includes('__NEXT_DATA__')) {
    try {
      const match = content.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
      if (match && match[1]) {
        const parsed = JSON.parse(match[1]);
        const links = parsed.props?.pageProps?.links || parsed.props?.pageProps?.account?.links || [];
        for (const l of links) {
          const u = l.url?.trim();
          const t = l.title?.trim() || 'Tautan Eksternal';
          if (u && (u.startsWith('http://') || u.startsWith('https://')) && !seen.has(u)) {
            items.push({ title: t, url: u });
            seen.add(u);
          }
        }
      }
    } catch {}
  }

  if (items.length > 0) return items;

  // 2. Ekstraksi format markdown dari Jina Reader
  if (content.includes('](') || content.includes('Markdown Content:')) {
    const linkRegex = /\[(?:!\[[^\]]*\]\([^\)]*\)\s*)?([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g;
    let match;
    while ((match = linkRegex.exec(content)) !== null) {
      let title = match[1].trim().replace(/^!\[[^\]]*\]\([^\)]*\)\s*/, '').trim();
      const url = match[2].trim();
      if (!url.startsWith('http')) continue;
      try {
        const linkHost = new URL(url).hostname.toLowerCase();
        if (linkHost === baseHost || linkHost.includes('jina.ai') || linkHost.includes('cookie') || title.toLowerCase() === 'tiktok' || title.toLowerCase() === 'report') continue;
      } catch {}
      if (!seen.has(url)) {
        seen.add(url);
        if (title.length > 120) title = title.substring(0, 117) + '...';
        items.push({ title: title || 'Tautan', url });
      }
    }
  }

  return items;
}

export default function LinkResolverScreen({ onBack, onShowToast }) {
  const [urlInput, setUrlInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasStartedProcess, setHasStartedProcess] = useState(false);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [resolveResult, setResolveResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [isAllCopied, setIsAllCopied] = useState(false);
  const [copiedItemIndex, setCopiedItemIndex] = useState(null);
  const [searchFilter, setSearchFilter] = useState('');
  const inputRef = useRef(null);

  // Daftar sampel link untuk uji coba cepat
  const sampleLinks = [
    { label: 'Linktree Bio', url: 'https://linktr.ee/miuillust' },
    { label: 'SFL Mediafire', url: 'https://sfl.gl/8VwvPZI' },
    { label: 'S.id Shortlink', url: 'https://s.id/1x' },
    { label: 'Safelink Base64', url: 'https://safelink.blogger.com/go?url=aHR0cHM6Ly93d3cubWVkaWFmaXJlLmNvbS9maWxlL3NhbXBsZS56aXA=' },
    { label: 'Bitly Redirect', url: 'https://bit.ly/3sample' }
  ];

  const handlePaste = async () => {
    const res = await readClipboardText();
    if (res.success && res.text) {
      setUrlInput(res.text);
      setErrorMessage('');
      if (inputRef.current) inputRef.current.focus();
      onShowToast?.('Tautan berhasil ditempel!');
    } else {
      if (inputRef.current) inputRef.current.focus();
      onShowToast?.(res.message || 'Papan klip masih kosong.');
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
    setSearchFilter('');
    setCopiedItemIndex(null);

    // Animasi visual dinamis
    const animTimer1 = setTimeout(() => setActiveStepIndex(1), 180);
    const animTimer2 = setTimeout(() => setActiveStepIndex(2), 380);
    const animTimer3 = setTimeout(() => setActiveStepIndex(3), 680);

    const isAggregator = /linktr\.ee|heylink\.me|carrd\.co|bio\.link|beacons\.ai|taplink\.cc/i.test(target);

    // Saluran 1: Backend resolver API (5s timeout)
    const runBackend = async () => {
      const res = await axios.post('/api/resolve', { url: target }, { timeout: 5000 });
      if (res.data?.status === 'success') return res.data;
      throw new Error(res.data?.message || 'Backend resolver tidak menemukan tautan');
    };

    // Saluran 2: Jina AI Edge Reader (4.5s timeout)
    const runClientJina = async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4500);
      try {
        const res = await fetch(`https://r.jina.ai/${target}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error('Jina non-200');
        const text = await res.text();
        const items = extractClientAggregatorItems(text, target);
        if (items.length > 0) {
          return {
            status: 'success',
            result_type: 'multiple_links',
            category: 'aggregator',
            original_url: target,
            items,
            count: items.length,
            engine: 'jina-edge-reader',
            elapsed_ms: 1200
          };
        }
        throw new Error('Jina empty');
      } finally {
        clearTimeout(timer);
      }
    };

    // Saluran 3: CodeTabs CORS Proxy (4.5s timeout)
    const runClientCodeTabs = async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4500);
      try {
        const res = await fetch(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(target)}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error('CodeTabs non-200');
        const text = await res.text();
        const items = extractClientAggregatorItems(text, target);
        if (items.length > 0) {
          return {
            status: 'success',
            result_type: 'multiple_links',
            category: 'aggregator',
            original_url: target,
            items,
            count: items.length,
            engine: 'client-edge-relay',
            elapsed_ms: 1200
          };
        }
        throw new Error('CodeTabs empty');
      } finally {
        clearTimeout(timer);
      }
    };

    // Saluran 4: AllOrigins Proxy (4.5s timeout)
    const runClientAllOrigins = async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4500);
      try {
        const res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error('AllOrigins non-200');
        const text = await res.text();
        const items = extractClientAggregatorItems(text, target);
        if (items.length > 0) {
          return {
            status: 'success',
            result_type: 'multiple_links',
            category: 'aggregator',
            original_url: target,
            items,
            count: items.length,
            engine: 'client-edge-relay',
            elapsed_ms: 1200
          };
        }
        throw new Error('AllOrigins empty');
      } finally {
        clearTimeout(timer);
      }
    };

    try {
      let finalData = null;
      if (isAggregator) {
        finalData = await Promise.any([
          runBackend(),
          runClientJina(),
          runClientCodeTabs(),
          runClientAllOrigins()
        ]);
      } else {
        finalData = await runBackend();
      }

      clearTimeout(animTimer1);
      clearTimeout(animTimer2);
      clearTimeout(animTimer3);

      setActiveStepIndex(3);
      await new Promise((r) => setTimeout(r, 120));
      setActiveStepIndex(4);
      setResolveResult(finalData);

      try {
        const isMultiple = finalData.result_type === 'multiple_links' || (Array.isArray(finalData.items) && finalData.items.length > 0);
        const destHostname = isMultiple 
          ? `Bio Aggregator (${finalData.count || finalData.items?.length} link)`
          : (finalData.resolved_url ? new URL(finalData.resolved_url).hostname : 'Resolved Link');

        logHistoryItem({
          type: 'tool',
          toolId: 'resolver',
          toolName: 'Safelink Resolver',
          title: destHostname,
          description: `Dari ${target.substring(0, 32)}... (${finalData.elapsed_ms || 0} ms)`,
          timestamp: Date.now()
        });
      } catch {}

      if (finalData.result_type === 'multiple_links') {
        onShowToast?.(`Berhasil mengekstrak ${finalData.count || finalData.items?.length} tautan!`);
      } else {
        onShowToast?.('Link tujuan berhasil di-bypass!');
      }
    } catch (err) {
      clearTimeout(animTimer1);
      clearTimeout(animTimer2);
      clearTimeout(animTimer3);
      const msg = err.response?.data?.message || err.message || (err.code === 'ECONNABORTED' 
        ? 'Proses bypass melebihi batas waktu (timeout). Link mungkin dilindungi Captcha interaktif.' 
        : 'Gagal menghubungi server resolver. Pastikan koneksi backend aktif.');
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopySingleDestination = () => {
    if (!resolveResult?.resolved_url) return;
    navigator.clipboard.writeText(resolveResult.resolved_url);
    setIsCopied(true);
    onShowToast?.('Link berhasil disalin ke papan klip!');
    setTimeout(() => setIsCopied(false), 2200);
  };

  const handleCopySingleLink = (url, idx) => {
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopiedItemIndex(idx);
    onShowToast?.('Tautan disalin!');
    setTimeout(() => setCopiedItemIndex(null), 1800);
  };

  const handleCopyAllLinks = () => {
    if (!resolveResult?.items?.length) return;
    const all = resolveResult.items.map(it => `${it.title ? it.title + ' - ' : ''}${it.url}`).join('\n');
    navigator.clipboard.writeText(all);
    setIsAllCopied(true);
    onShowToast?.(`Berhasil menyalin ${resolveResult.items.length} tautan ke papan klip!`);
    setTimeout(() => setIsAllCopied(false), 2200);
  };

  const filteredAggregatorItems = useMemo(() => {
    if (!resolveResult?.items || !Array.isArray(resolveResult.items)) return [];
    if (!searchFilter.trim()) return resolveResult.items;
    const q = searchFilter.toLowerCase();
    return resolveResult.items.filter(
      it => (it.title && it.title.toLowerCase().includes(q)) || (it.url && it.url.toLowerCase().includes(q))
    );
  }, [resolveResult, searchFilter]);

  return (
    <main className="flex-grow flex flex-col items-center justify-start px-3 sm:px-6 py-4 sm:py-8 max-w-4xl mx-auto w-full">
      {/* Tombol Navigasi & Tag Header */}
      <div className="w-full flex items-center justify-between mb-3 sm:mb-4">
        <CosmicBackButton onClick={onBack} label="Kembali ke Beranda" />
        <div className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 bg-black text-white rounded-full border-2 border-black text-[10px] sm:text-[11px] font-mono font-bold shadow-[2px_2px_0px_#000000]">
          <Link2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>Safelink Resolver</span>
        </div>
      </div>

      {/* Hero Card & Input Formulir */}
      <div className="w-full bg-white rounded-2xl p-4 sm:p-8 border-2 border-black shadow-[4px_4px_0px_#000000] mb-6">
        <div className="flex items-start gap-3 sm:gap-4 mb-4 sm:mb-5">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-black text-white flex items-center justify-center shrink-0 border-2 border-black shadow-[2px_2px_0px_#000000]">
            <Link2 className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.5]" />
          </div>
          <div>
            <h1 className="text-lg sm:text-2xl font-black text-black tracking-tight">
              Safelink & Shortlink Resolver
            </h1>
            <p className="text-xs sm:text-sm text-neutral-600 font-mono mt-0.5 leading-relaxed">
              Lewati safelink berbelit, countdown waktu, dan halaman iklan membingungkan untuk langsung mendapatkan link unduhan asli (Mediafire, Google Drive, Mega) atau mengekstrak isi halaman aggregator (Linktree).
            </p>
          </div>
        </div>

        {/* Input Textfield & Tombol Bypass */}
        <div className="space-y-4">
          <div className="relative">
            <input
              ref={inputRef}
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !isLoading && handleResolve()}
              disabled={isLoading}
              placeholder="Tempel tautan di sini (misal: linktr.ee, sfl.gl, safelinku, bit.ly, s.id...)"
              className="w-full pl-4 pr-24 py-3 sm:py-3.5 bg-neutral-50 rounded-xl border-2 border-black text-xs sm:text-sm font-mono text-black placeholder:text-neutral-400 focus:outline-none focus:bg-white focus:shadow-[3px_3px_0px_#000000] disabled:bg-neutral-100 transition-all"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
              {urlInput && (
                <button
                  type="button"
                  onClick={() => { setUrlInput(''); setErrorMessage(''); }}
                  disabled={isLoading}
                  className="px-2 py-1 text-xs font-mono text-neutral-500 hover:text-black cursor-pointer"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={handlePaste}
                disabled={isLoading}
                className="px-2.5 py-1 text-[11px] font-mono font-bold bg-neutral-100 hover:bg-neutral-200 rounded border border-black text-black transition-all cursor-pointer shadow-[1px_1px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5"
              >
                Tempel
              </button>
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
          {/* ANIMASI STEP-BY-STEP                                     */}
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
                      resolveResult 
                        ? 'bg-emerald-200 text-emerald-900' 
                        : errorMessage 
                        ? 'bg-rose-200 text-rose-900' 
                        : (activeStepIndex === 2 
                            ? 'bg-blue-100 text-blue-900' 
                            : 'bg-amber-200 text-amber-900 animate-pulse')
                    }`}>
                      {resolveResult 
                        ? 'Selesai' 
                        : errorMessage 
                        ? 'Gagal' 
                        : (activeStepIndex === 2 ? 'Lanjut ke Deep Scan' : 'Sedang Proses')}
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
      {/* KARTU HASIL RESOLVE (SINGLE URL & MULTIPLE LINKS)        */}
      {/* ======================================================== */}
      {resolveResult && (
        <div className="w-full bg-white rounded-2xl p-5 sm:p-7 border-2 border-black shadow-[4px_4px_0px_#000000] space-y-5 animate-in fade-in duration-200">
          
          {/* Header Card */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b-2 border-black">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-500 text-white flex items-center justify-center border border-black shadow-[1px_1px_0px_#000000]">
                {resolveResult.result_type === 'multiple_links' ? (
                  <Layers className="w-4 h-4" />
                ) : (
                  <ShieldCheck className="w-4 h-4" />
                )}
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-black text-black">
                  {resolveResult.result_type === 'multiple_links'
                    ? `Ditemukan ${resolveResult.count || resolveResult.items?.length || 0} Tautan!`
                    : 'Link Berhasil Di-Resolve!'}
                </h2>
                <p className="text-[11px] font-mono text-neutral-500">
                  {resolveResult.result_type === 'multiple_links'
                    ? 'Halaman aggregator / bio link berhasil diekstrak bersih tanpa iklan'
                    : 'Tautan asli file unduhan berhasil diverifikasi'}
                </p>
              </div>
            </div>

            {/* Badge Kategori & Mesin */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold border border-black bg-neutral-100 text-neutral-800">
                {resolveResult.category === 'aggregator' ? (
                  <>
                    <Layers className="w-3 h-3 text-indigo-600" />
                    <span>Bio Aggregator</span>
                  </>
                ) : resolveResult.category === 'direct' ? (
                  <>
                    <Globe className="w-3 h-3 text-blue-600" />
                    <span>Direct 301/302</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-3 h-3 text-amber-500 fill-amber-500" />
                    <span>Safelink Bypass</span>
                  </>
                )}
              </span>

              {typeof resolveResult.elapsed_ms === 'number' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold border border-black bg-neutral-100 text-neutral-700">
                  <Clock className="w-3 h-3 text-neutral-500" />
                  <span>{resolveResult.elapsed_ms} ms</span>
                </span>
              )}
            </div>
          </div>

          {/* JIKA HASIL ADALAH MULTIPLE LINKS (LINKTREE, AGGREGATOR, DLL) */}
          {resolveResult.result_type === 'multiple_links' && Array.isArray(resolveResult.items) ? (
            <div className="space-y-4">
              
              {/* Bilah Kontrol: Filter Pencarian & Salin Semua */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                  <input
                    type="text"
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    placeholder={`Cari dari ${resolveResult.items.length} link...`}
                    className="w-full pl-9 pr-3 py-2 text-xs font-mono bg-neutral-50 border border-black rounded-lg focus:outline-none focus:bg-white"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleCopyAllLinks}
                  className="px-3.5 py-2 rounded-lg bg-black hover:bg-neutral-800 text-white font-mono font-bold text-xs flex items-center justify-center gap-1.5 border border-black shadow-[2px_2px_0px_#000000] cursor-pointer active:translate-x-0.5 active:translate-y-0.5"
                >
                  {isAllCopied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Semua Tersalin!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Salin Semua ({resolveResult.items.length})</span>
                    </>
                  )}
                </button>
              </div>

              {/* Daftar Scrollable Item Tautan */}
              <div className="max-h-[380px] overflow-y-auto space-y-2 pr-1 border border-neutral-200 rounded-xl p-2 bg-neutral-50/50">
                {filteredAggregatorItems.map((item, idx) => {
                  const isItemCopied = copiedItemIndex === idx;
                  return (
                    <div
                      key={idx}
                      className="p-3 bg-white rounded-xl border border-black shadow-[2px_2px_0px_#000000] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:bg-neutral-50 transition-all"
                    >
                      <div className="flex items-start gap-2.5 min-w-0 flex-1">
                        <span className="w-6 h-6 rounded bg-neutral-100 text-neutral-700 text-[10px] font-mono font-black flex items-center justify-center shrink-0 border border-neutral-300">
                          {idx + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs sm:text-sm font-bold text-black truncate">
                            {item.title || 'Tautan Tanpa Judul'}
                          </p>
                          <p className="text-[11px] font-mono text-neutral-500 truncate mt-0.5">
                            {item.url}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
                        <button
                          type="button"
                          onClick={() => handleCopySingleLink(item.url, idx)}
                          className="px-2.5 py-1.5 rounded-lg border border-black bg-neutral-100 hover:bg-neutral-200 text-black text-[11px] font-mono font-bold flex items-center gap-1 shadow-[1px_1px_0px_#000000] cursor-pointer"
                        >
                          {isItemCopied ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-600" />
                              <span>Disalin</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Salin</span>
                            </>
                          )}
                        </button>

                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1.5 rounded-lg border border-black bg-black hover:bg-neutral-800 text-white text-[11px] font-mono font-bold flex items-center gap-1 shadow-[1px_1px_0px_#000000] cursor-pointer"
                        >
                          <ExternalLink className="w-3 h-3 text-emerald-400" />
                          <span>Buka</span>
                        </a>
                      </div>
                    </div>
                  );
                })}

                {filteredAggregatorItems.length === 0 && (
                  <p className="text-center text-xs font-mono text-neutral-500 py-6">
                    Tidak ada tautan yang cocok dengan kata kunci pencarian.
                  </p>
                )}
              </div>

            </div>
          ) : (
            /* JIKA HASIL ADALAH SINGLE URL (MEDIAFIRE, GDRIVE, DSB) */
            <div className="space-y-4">
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

              <div className="text-xs font-mono text-neutral-600 space-y-1">
                <p className="truncate">
                  <span className="font-bold text-neutral-800">Link Awal:</span> {resolveResult.original_url}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={handleCopySingleDestination}
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

        </div>
      )}

      {/* Info Cara Kerja Fitur */}
      <div className="w-full mt-6 p-4 rounded-xl border border-neutral-300 bg-neutral-100/70 text-[11px] font-mono text-neutral-600 flex items-start gap-2.5">
        <Globe className="w-4 h-4 text-neutral-700 shrink-0 mt-0.5" />
        <p>
          <strong>Cara Kerja:</strong> Cukup tempel tautan safelink, shortlink, atau bio aggregator (Linktree). Sistem kami secara otomatis mengidentifikasi tipe URL, memproses redirect, melewati hitungan mundur (*countdown*), dan menyajikan link asli baik berupa berkas tunggal (Mediafire/Drive) maupun daftar lengkap tautan.
        </p>
      </div>
    </main>
  );
}
