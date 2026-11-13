import React, { useState, useEffect, useCallback } from 'react';
import CosmicBackButton from './CosmicBackButton';
import { 
  Globe, 
  Wifi, 
  Layers, 
  MapPin, 
  Clock, 
  ShieldCheck, 
  ShieldAlert, 
  Server, 
  RefreshCw, 
  Copy, 
  Check, 
  ExternalLink, 
  Search, 
  RotateCcw,
  Radio,
  Sparkles,
  AlertTriangle
} from 'lucide-react';

export default function IpCheckerScreen({ onBack, onShowToast, lang = 'id' }) {
  const isEn = lang === 'en';

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // Pencarian kustom IP / Domain
  const [customInput, setCustomInput] = useState('');
  const [activeQueryIp, setActiveQueryIp] = useState('');

  // Status salin
  const [copiedIp, setCopiedIp] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedDns, setCopiedDns] = useState(null);

  const fetchIpData = useCallback(async (queryIp = '', isManualRefresh = false) => {
    if (isManualRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setErrorMsg(null);

    try {
      const url = queryIp ? `/api/ip-check?ip=${encodeURIComponent(queryIp)}` : '/api/ip-check';
      const res = await fetch(url);
      const json = await res.json();

      if (!res.ok || json.error === 'ssrf_blocked') {
        throw new Error(json.message || (isEn ? 'Failed to fetch IP details.' : 'Gagal memuat telemetri IP.'));
      }

      setData(json);
      setActiveQueryIp(queryIp);
    } catch (err) {
      setErrorMsg(err.message || (isEn ? 'Network error while fetching IP data.' : 'Terjadi kendala jaringan saat memuat data IP.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isEn]);

  useEffect(() => {
    fetchIpData('');
  }, [fetchIpData]);

  const handleSearchSubmit = (e) => {
    if (e) e.preventDefault();
    const clean = customInput.trim();
    if (!clean) return;
    fetchIpData(clean);
  };

  const handleResetToSelf = () => {
    setCustomInput('');
    fetchIpData('');
  };

  // Salin hanya alamat IP utama
  const handleCopyIp = async () => {
    if (!data?.ip) return;
    try {
      await navigator.clipboard.writeText(data.ip);
      setCopiedIp(true);
      onShowToast?.(isEn ? 'IP Address copied to clipboard!' : 'Alamat IP berhasil disalin ke papan klip!');
      setTimeout(() => setCopiedIp(false), 2000);
    } catch {}
  };

  // Salin IP DNS publik
  const handleCopyDns = async (dnsIp) => {
    try {
      await navigator.clipboard.writeText(dnsIp);
      setCopiedDns(dnsIp);
      onShowToast?.(isEn ? `DNS ${dnsIp} copied!` : `IP DNS ${dnsIp} berhasil disalin!`);
      setTimeout(() => setCopiedDns(null), 2000);
    } catch {}
  };

  // Salin seluruh laporan telemetri jaringan
  const handleCopyAllDetails = async () => {
    if (!data) return;

    const report = [
      `=== KURO STUDIO NETWORK TELEMETRY ===`,
      `IP Address       : ${data.ip} (${data.type || 'IPv4'})`,
      `ISP Provider     : ${data.isp?.name || '-'}`,
      `Organization     : ${data.isp?.organization || '-'}`,
      `ASN              : ${data.asn?.code || '-'} (${data.asn?.name || '-'})`,
      `Location         : ${data.location?.city || '-'}, ${data.location?.region || '-'}, ${data.location?.country || '-'}`,
      `Coordinates      : ${data.location?.latitude || '-'}, ${data.location?.longitude || '-'}`,
      `Timezone         : ${data.timezone?.id || '-'} (${data.timezone?.utc || '-'})`,
      `Connection Type  : ${data.connection?.type || '-'}`,
      `VPN / Proxy      : ${data.security?.isVpn ? 'YES (Detected)' : 'NO (Clean)'}`,
      `Hosting / Cloud  : ${data.security?.isHosting ? 'YES (Datacenter)' : 'NO (Residential)'}`,
      `Reverse DNS      : ${data.dns?.reverseDns || '-'}`,
      `Generated At     : ${new Date().toLocaleString()}`,
      `=====================================`
    ].join('\n');

    try {
      await navigator.clipboard.writeText(report);
      setCopiedAll(true);
      onShowToast?.(isEn ? 'Full network report copied to clipboard!' : 'Seluruh detail telemetri berhasil disalin!');
      setTimeout(() => setCopiedAll(false), 2500);
    } catch {}
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-3 sm:px-6 py-4 sm:py-6 flex flex-col gap-4 sm:gap-6">
      
      {/* ─── 1. TOP HEADER & NAVIGATION ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-[#18181b] border-2 border-black rounded-xl p-3.5 sm:p-4 shadow-[4px_4px_0px_#000000]">
        <div className="flex items-center gap-3">
          <CosmicBackButton onClick={onBack} />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-xl font-black text-black dark:text-white tracking-tight">
                {isEn ? 'IP, ISP, ASN, & DNS Checker' : 'Pemeriksa IP, ISP, ASN, & DNS'}
              </h1>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 border border-black text-[10px] font-bold text-emerald-800 dark:text-emerald-300">
                <Radio className="w-2.5 h-2.5 text-emerald-600 animate-pulse" />
                <span>{isEn ? 'LIVE' : 'TELEMETRI AKTIF'}</span>
              </span>
            </div>
            <p className="text-xs text-neutral-600 dark:text-neutral-400 font-medium mt-0.5">
              {isEn 
                ? 'Comprehensive telemetry for visitor IP, operator, routing ASN, and security status' 
                : 'Analisis mendalam telemetri IP publik, operator ISP, routing ASN, dan status privasi jaringan'}
            </p>
          </div>
        </div>

        {/* Quick Refresh Button */}
        <button
          type="button"
          onClick={() => fetchIpData(activeQueryIp, true)}
          disabled={loading || refreshing}
          className="self-start sm:self-auto px-3.5 py-2 rounded-lg bg-black text-white hover:bg-neutral-800 border-2 border-black text-xs font-bold shadow-[2px_2px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          <span>{isEn ? 'Refresh Telemetry' : 'Cek Ulang Jaringan'}</span>
        </button>
      </div>

      {/* ─── 2. CUSTOM IP / DOMAIN SEARCH BAR ─── */}
      <div className="bg-white dark:bg-[#18181b] border-2 border-black rounded-xl p-3.5 sm:p-4 shadow-[4px_4px_0px_#000000]">
        <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              type="text"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              placeholder={isEn ? 'Check any IP or domain (e.g. 1.1.1.1, 8.8.8.8, cloudflare.com)...' : 'Cek IP atau domain lain (contoh: 1.1.1.1, 8.8.8.8, google.com)...'}
              className="w-full pl-9 pr-3 py-2.5 rounded-lg border-2 border-black bg-neutral-50 dark:bg-neutral-900 text-black dark:text-white text-xs sm:text-sm font-mono font-medium focus:outline-none focus:bg-white dark:focus:bg-black transition-all"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={loading || refreshing || !customInput.trim()}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-lg bg-cyan-300 hover:bg-cyan-400 text-black border-2 border-black font-extrabold text-xs shadow-[2px_2px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer disabled:opacity-50 min-h-[40px] flex items-center justify-center gap-1.5"
            >
              <Search className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>{isEn ? 'Lookup IP' : 'Cek IP'}</span>
            </button>

            {activeQueryIp && (
              <button
                type="button"
                onClick={handleResetToSelf}
                className="px-3 py-2.5 rounded-lg bg-white dark:bg-neutral-800 hover:bg-neutral-100 text-black dark:text-white border-2 border-black font-bold text-xs shadow-[2px_2px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer min-h-[40px] flex items-center gap-1"
                title={isEn ? 'Reset to your own IP' : 'Kembali ke IP sendiri'}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden xs:inline">{isEn ? 'My IP' : 'IP Saya'}</span>
              </button>
            )}
          </div>
        </form>
      </div>

      {/* ─── 3. ERROR BANNER ─── */}
      {errorMsg && (
        <div className="p-3.5 sm:p-4 rounded-xl border-2 border-black bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 flex items-center justify-between gap-3 shadow-[3px_3px_0px_#000000]">
          <div className="flex items-center gap-2 text-xs sm:text-sm font-bold">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => fetchIpData(activeQueryIp)}
            className="px-3 py-1 bg-rose-600 text-white rounded-lg border border-black font-extrabold text-xs shadow-[1.5px_1.5px_0px_#000000] cursor-pointer hover:bg-rose-700 shrink-0"
          >
            {isEn ? 'Retry' : 'Coba Lagi'}
          </button>
        </div>
      )}

      {/* ─── 4. SKELETON LOADING ─── */}
      {loading && (
        <div className="flex flex-col gap-4 animate-pulse">
          <div className="w-full h-36 bg-zinc-200 dark:bg-zinc-800 rounded-xl border-2 border-black shadow-[4px_4px_0px_#000000]" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-44 bg-zinc-200 dark:bg-zinc-800 rounded-xl border-2 border-black shadow-[3px_3px_0px_#000000]" />
            ))}
          </div>
        </div>
      )}

      {/* ─── 5. MAIN TELEMETRY CONTENT ─── */}
      {!loading && data && (
        <>
          {/* HERO IP ADDRESS CARD */}
          <div className="w-full bg-white dark:bg-[#18181b] border-2 border-black rounded-xl p-4 sm:p-6 shadow-[4px_4px_0px_#000000] relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-4">
            
            <div className="flex flex-col gap-1.5 z-10">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-mono font-black uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  {data.isSelf ? (isEn ? 'YOUR PUBLIC IP ADDRESS' : 'ALAMAT IP PUBLIK ANDA') : (isEn ? 'TARGET IP LOOKUP' : 'TARGET PENCARIAN IP')}
                </span>

                <span className="px-2 py-0.5 rounded bg-black text-white text-[10px] font-mono font-extrabold border border-black">
                  {data.type || 'IPv4'}
                </span>

                {data.security?.isVpn ? (
                  <span className="px-2 py-0.5 rounded bg-rose-200 dark:bg-rose-900/60 text-rose-950 dark:text-rose-200 text-[10px] font-extrabold border border-black flex items-center gap-1">
                    <ShieldAlert className="w-3 h-3 text-rose-600" />
                    <span>VPN / PROXY</span>
                  </span>
                ) : data.security?.isHosting ? (
                  <span className="px-2 py-0.5 rounded bg-amber-200 dark:bg-amber-900/60 text-amber-950 dark:text-amber-200 text-[10px] font-extrabold border border-black flex items-center gap-1">
                    <Server className="w-3 h-3 text-amber-600" />
                    <span>DATACENTER</span>
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded bg-emerald-200 dark:bg-emerald-900/60 text-emerald-950 dark:text-emerald-200 text-[10px] font-extrabold border border-black flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-emerald-700" />
                    <span>RESIDENTIAL</span>
                  </span>
                )}
              </div>

              {/* Main IP Display */}
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-2xl sm:text-4xl font-black font-mono tracking-tight text-black dark:text-white select-all">
                  {data.ip}
                </h2>

                {data.location?.flagSvg && (
                  <img
                    src={data.location.flagSvg}
                    alt={data.location.country || 'Flag'}
                    className="w-7 h-5 sm:w-8 sm:h-6 object-cover rounded border border-black shadow-sm"
                    loading="lazy"
                  />
                )}
              </div>

              <div className="flex items-center gap-2 text-xs font-semibold text-neutral-600 dark:text-neutral-300 mt-0.5">
                <span>{data.location?.city ? `${data.location.city}, ` : ''}{data.location?.country || 'Unknown'}</span>
                <span>•</span>
                <span className="font-mono">{data.isp?.name || 'Unknown ISP'}</span>
              </div>
            </div>

            {/* Quick Action Button */}
            <div className="flex items-center gap-2 z-10">
              <button
                type="button"
                onClick={handleCopyIp}
                className="w-full sm:w-auto px-4 py-2.5 rounded-lg bg-yellow-300 hover:bg-yellow-400 text-black border-2 border-black font-extrabold text-xs sm:text-sm shadow-[2px_2px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {copiedIp ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-700 stroke-[3]" />
                    <span>{isEn ? 'Copied!' : 'IP Disalin!'}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 stroke-[2.5]" />
                    <span>{isEn ? 'Copy IP' : 'Salin IP'}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* 6 NEOBRUTALIST GRID CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
            
            {/* CARD 1: OPERATOR & ISP */}
            <div className="bg-white dark:bg-[#18181b] border-2 border-black rounded-xl p-4 shadow-[3px_3px_0px_#000000] flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b-2 border-black pb-2 mb-3">
                  <span className="text-xs font-black uppercase tracking-wider text-black dark:text-white flex items-center gap-1.5">
                    <Wifi className="w-3.5 h-3.5" />
                    <span>{isEn ? 'ISP & Operator' : 'Penyedia ISP & Operator'}</span>
                  </span>
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-neutral-100 dark:bg-neutral-800 border border-black">
                    NETWORK
                  </span>
                </div>

                <div className="flex flex-col gap-2">
                  <div>
                    <span className="text-[10px] font-bold text-neutral-500 uppercase">{isEn ? 'ISP Name' : 'Nama Operator (ISP)'}</span>
                    <p className="text-xs sm:text-sm font-black text-black dark:text-white leading-snug">
                      {data.isp?.name || '-'}
                    </p>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-neutral-500 uppercase">{isEn ? 'Organization' : 'Organisasi / Perusahaan'}</span>
                    <p className="text-xs font-extrabold text-neutral-800 dark:text-neutral-200">
                      {data.isp?.organization || '-'}
                    </p>
                  </div>

                  {data.isp?.domain && (
                    <div>
                      <span className="text-[10px] font-bold text-neutral-500 uppercase">Domain</span>
                      <p className="text-xs font-mono font-bold text-cyan-700 dark:text-cyan-400">
                        {data.isp.domain}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-neutral-200 dark:border-neutral-800 text-[10px] text-neutral-500 font-semibold">
                {isEn ? 'Detected from public AS announcement' : 'Terdeteksi dari rute publik AS'}
              </div>
            </div>

            {/* CARD 2: ASN (AUTONOMOUS SYSTEM) */}
            <div className="bg-white dark:bg-[#18181b] border-2 border-black rounded-xl p-4 shadow-[3px_3px_0px_#000000] flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b-2 border-black pb-2 mb-3">
                  <span className="text-xs font-black uppercase tracking-wider text-black dark:text-white flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Autonomous System (ASN)' : 'Sistem Otonom (ASN)'}</span>
                  </span>
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-cyan-100 dark:bg-cyan-950 border border-black text-cyan-900 dark:text-cyan-200">
                    BGP
                  </span>
                </div>

                <div className="flex flex-col gap-2">
                  <div>
                    <span className="text-[10px] font-bold text-neutral-500 uppercase">{isEn ? 'ASN Number' : 'Nomor ASN'}</span>
                    <p className="text-sm font-mono font-black text-black dark:text-white">
                      {data.asn?.code || 'AS---'}
                    </p>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-neutral-500 uppercase">{isEn ? 'AS Name' : 'Nama Jaringan AS'}</span>
                    <p className="text-xs font-extrabold text-neutral-800 dark:text-neutral-200 leading-snug">
                      {data.asn?.name || '-'}
                    </p>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-neutral-500 uppercase">{isEn ? 'Route Announcement' : 'Rute Prefiks BGP'}</span>
                    <p className="text-[11px] font-mono text-neutral-600 dark:text-neutral-400 truncate">
                      {data.asn?.route || '-'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-neutral-200 dark:border-neutral-800 text-[10px] text-neutral-500 font-semibold">
                {isEn ? 'Global internet routing identifier' : 'Identifikasi routing global BGP'}
              </div>
            </div>

            {/* CARD 3: GEOLOCATION */}
            <div className="bg-white dark:bg-[#18181b] border-2 border-black rounded-xl p-4 shadow-[3px_3px_0px_#000000] flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b-2 border-black pb-2 mb-3">
                  <span className="text-xs font-black uppercase tracking-wider text-black dark:text-white flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Geographic Location' : 'Lokasi Geografis'}</span>
                  </span>
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-neutral-100 dark:bg-neutral-800 border border-black flex items-center gap-1">
                    <span>{data.location?.flagEmoji || '📍'}</span>
                    <span>{data.location?.countryCode || 'ID'}</span>
                  </span>
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-neutral-500">{isEn ? 'Country' : 'Negara'}:</span>
                    <span className="font-extrabold text-black dark:text-white">{data.location?.country || '-'}</span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-neutral-500">{isEn ? 'City / Region' : 'Kota / Wilayah'}:</span>
                    <span className="font-extrabold text-black dark:text-white">
                      {data.location?.city ? `${data.location.city}, ` : ''}{data.location?.region || '-'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-neutral-500">{isEn ? 'Postal Code' : 'Kode Pos'}:</span>
                    <span className="font-mono font-extrabold text-black dark:text-white">{data.location?.postal || '-'}</span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-neutral-500">{isEn ? 'Coordinates' : 'Koordinat'}:</span>
                    <span className="font-mono text-[11px] font-bold text-neutral-700 dark:text-neutral-300">
                      {data.location?.latitude?.toFixed(4)}, {data.location?.longitude?.toFixed(4)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
                <a
                  href={data.location?.mapsUrl || `https://www.google.com/maps?q=${data.location?.latitude},${data.location?.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-black text-cyan-700 dark:text-cyan-400 hover:underline cursor-pointer"
                >
                  <span>{isEn ? 'View on Google Maps' : 'Buka di Google Maps'}</span>
                  <ExternalLink className="w-3 h-3 stroke-[2.5]" />
                </a>
              </div>
            </div>

            {/* CARD 4: TIMEZONE & LOCAL TIME */}
            <div className="bg-white dark:bg-[#18181b] border-2 border-black rounded-xl p-4 shadow-[3px_3px_0px_#000000] flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b-2 border-black pb-2 mb-3">
                  <span className="text-xs font-black uppercase tracking-wider text-black dark:text-white flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Timezone & Clock' : 'Zona Waktu & Jam Lokal'}</span>
                  </span>
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-neutral-100 dark:bg-neutral-800 border border-black">
                    {data.timezone?.abbr || 'GMT'}
                  </span>
                </div>

                <div className="flex flex-col gap-2">
                  <div>
                    <span className="text-[10px] font-bold text-neutral-500 uppercase">{isEn ? 'Timezone ID' : 'Nama Zona Waktu'}</span>
                    <p className="text-xs sm:text-sm font-black text-black dark:text-white">
                      {data.timezone?.id || '-'}
                    </p>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-neutral-500">{isEn ? 'UTC Offset' : 'Offset UTC'}:</span>
                    <span className="font-mono font-extrabold text-black dark:text-white">
                      {data.timezone?.utc || '+00:00'}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-neutral-500 uppercase">{isEn ? 'Current Local Time' : 'Waktu Lokal Wilayah'}</span>
                    <p className="text-xs font-mono font-bold text-neutral-700 dark:text-neutral-300">
                      {data.timezone?.currentTime ? new Date(data.timezone.currentTime).toLocaleString() : new Date().toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-neutral-200 dark:border-neutral-800 text-[10px] text-neutral-500 font-semibold">
                {isEn ? 'Synchronized with local regional NTP' : 'Tersinkronisasi otomatis dengan waktu wilayah'}
              </div>
            </div>

            {/* CARD 5: PRIVACY & SECURITY CHECK */}
            <div className="bg-white dark:bg-[#18181b] border-2 border-black rounded-xl p-4 shadow-[3px_3px_0px_#000000] flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b-2 border-black pb-2 mb-3">
                  <span className="text-xs font-black uppercase tracking-wider text-black dark:text-white flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Privacy & Security' : 'Privasi & Keamanan'}</span>
                  </span>
                  <span className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded border border-black ${
                    data.security?.threatLevel === 'high' 
                      ? 'bg-rose-200 text-rose-900' 
                      : data.security?.threatLevel === 'moderate' 
                      ? 'bg-amber-200 text-amber-900' 
                      : 'bg-emerald-200 text-emerald-900'
                  }`}>
                    {data.security?.threatLevel ? data.security.threatLevel.toUpperCase() : 'SAFE'}
                  </span>
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-neutral-500">{isEn ? 'VPN Detection' : 'Deteksi VPN'}:</span>
                    <span className={`font-black ${data.security?.isVpn ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {data.security?.isVpn ? (isEn ? 'Yes (Detected)' : 'Terdeteksi') : (isEn ? 'No (Clean)' : 'Tidak')}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-neutral-500">{isEn ? 'Proxy / Exit Node' : 'Deteksi Proxy'}:</span>
                    <span className={`font-black ${data.security?.isProxy ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {data.security?.isProxy ? (isEn ? 'Yes' : 'Terdeteksi') : (isEn ? 'No' : 'Tidak')}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-neutral-500">{isEn ? 'Hosting / Datacenter' : 'Pusat Data / Server'}:</span>
                    <span className={`font-black ${data.security?.isHosting ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {data.security?.isHosting ? (isEn ? 'Yes (Cloud/VPS)' : 'Ya (Hosting/VPS)') : (isEn ? 'No (ISP Klien)' : 'Bukan')}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-neutral-500">{isEn ? 'Connection Profile' : 'Tipe Jaringan'}:</span>
                    <span className="font-extrabold text-[11px] text-black dark:text-white truncate">
                      {data.connection?.type || 'Broadband'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-neutral-200 dark:border-neutral-800 text-[10px] font-bold text-neutral-600 dark:text-neutral-400">
                {data.security?.ratingText || (isEn ? 'Standard network connection' : 'Status keamanan normal')}
              </div>
            </div>

            {/* CARD 6: DNS TELEMETRY & PUBLIC DNS RECOMMENDATIONS */}
            <div className="bg-white dark:bg-[#18181b] border-2 border-black rounded-xl p-4 shadow-[3px_3px_0px_#000000] flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b-2 border-black pb-2 mb-3">
                  <span className="text-xs font-black uppercase tracking-wider text-black dark:text-white flex items-center gap-1.5">
                    <Server className="w-3.5 h-3.5" />
                    <span>{isEn ? 'DNS & PTR Records' : 'DNS & Rekomendasi'}</span>
                  </span>
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-neutral-100 dark:bg-neutral-800 border border-black">
                    PORT 53
                  </span>
                </div>

                <div className="flex flex-col gap-2">
                  <div>
                    <span className="text-[10px] font-bold text-neutral-500 uppercase">{isEn ? 'Reverse DNS (PTR Hostname)' : 'Reverse DNS (PTR)'}</span>
                    <p className="text-xs font-mono font-bold text-black dark:text-white truncate">
                      {data.dns?.reverseDns || '-'}
                    </p>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-neutral-500 uppercase mb-1 block">
                      {isEn ? 'Fast Public DNS Suggestions' : 'Pilihan Public DNS Cepat'}
                    </span>
                    <div className="flex flex-col gap-1.5">
                      {data.dns?.recommendedPublicDns?.map((dns) => (
                        <div 
                          key={dns.provider}
                          className="flex items-center justify-between p-1.5 rounded-lg bg-neutral-100 dark:bg-neutral-800/60 border border-neutral-300 dark:border-neutral-700"
                        >
                          <div className="flex flex-col">
                            <span className="text-[10px] font-black text-black dark:text-white">{dns.provider}</span>
                            <span className="text-[9px] font-mono font-bold text-cyan-700 dark:text-cyan-400">{dns.primary}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleCopyDns(dns.primary)}
                            className="p-1 rounded bg-white dark:bg-black border border-black hover:bg-neutral-100 text-black dark:text-white cursor-pointer"
                            title={`Salin ${dns.primary}`}
                          >
                            {copiedDns === dns.primary ? (
                              <Check className="w-3 h-3 text-emerald-600 stroke-[3]" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-neutral-200 dark:border-neutral-800 text-[10px] text-neutral-500 font-semibold">
                {isEn ? 'Click copy icon to copy resolver IP' : 'Klik ikon salin untuk menyalin alamat resolver'}
              </div>
            </div>

          </div>

          {/* ─── 6. FOOTER ACTION BAR ─── */}
          <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-2">
            <button
              type="button"
              onClick={handleCopyAllDetails}
              className="w-full sm:flex-1 py-3 px-4 rounded-xl bg-black hover:bg-neutral-800 text-white border-2 border-black font-extrabold text-xs sm:text-sm shadow-[3px_3px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all flex items-center justify-center gap-2 cursor-pointer min-h-[44px]"
            >
              {copiedAll ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400 stroke-[3]" />
                  <span>{isEn ? 'All Details Copied to Clipboard!' : 'Seluruh Laporan Berhasil Disalin!'}</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 stroke-[2.5]" />
                  <span>{isEn ? 'Copy Full Telemetry Report' : 'Salin Semua Detail Telemetri'}</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => fetchIpData(activeQueryIp, true)}
              disabled={refreshing}
              className="w-full sm:w-auto py-3 px-6 rounded-xl bg-white dark:bg-neutral-800 hover:bg-neutral-100 text-black dark:text-white border-2 border-black font-extrabold text-xs sm:text-sm shadow-[3px_3px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all flex items-center justify-center gap-2 cursor-pointer min-h-[44px]"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{isEn ? 'Refresh Data' : 'Perbarui Data'}</span>
            </button>
          </div>
        </>
      )}

    </div>
  );
}
