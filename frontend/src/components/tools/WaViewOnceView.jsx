import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import QRCode from 'qrcode';
import {
  ArrowLeft,
  ShieldCheck,
  QrCode,
  Smartphone,
  Plus,
  Trash2,
  Download,
  Eye,
  RefreshCw,
  LogOut,
  AlertTriangle,
  Info,
  CheckCircle2,
  Clock,
  Film,
  Image as ImageIcon,
  ExternalLink,
  ShieldAlert
} from 'lucide-react';
import {
  saveMediaItem,
  getAllMediaItems,
  deleteMediaItem,
  clearAllMediaItems
} from '../../utils/waMediaDB';

const STORAGE_SESSION_ID = 'wa_vault_session_id';
const STORAGE_SESSION_TOKEN = 'wa_vault_session_token';
const STORAGE_TARGETS = 'wa_vault_target_numbers';

// Helper generator kunci acak 32-byte hexadecimal
function generateSecretToken() {
  const array = new Uint8Array(32);
  window.crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// Helper normalisasi nomor WA Indonesia/Internasional ke digit murni
function normalizeTargetNumber(raw) {
  if (!raw) return '';
  let digits = String(raw).replace(/\D/g, '');
  if (digits.startsWith('08')) {
    digits = '628' + digits.slice(2);
  } else if (digits.startsWith('8')) {
    digits = '628' + digits.slice(1);
  }
  return digits;
}

export default function WaViewOnceView({ onBack, onShowToast, lang = 'id' }) {
  // Identitas sesi multi-user terisolasi
  const [sessionId] = useState(() => {
    let id = localStorage.getItem(STORAGE_SESSION_ID);
    if (!id) {
      id = window.crypto?.randomUUID ? window.crypto.randomUUID() : `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      localStorage.setItem(STORAGE_SESSION_ID, id);
    }
    return id;
  });

  const [sessionToken] = useState(() => {
    let token = localStorage.getItem(STORAGE_SESSION_TOKEN);
    if (!token) {
      token = generateSecretToken();
      localStorage.setItem(STORAGE_SESSION_TOKEN, token);
    }
    return token;
  });

  // Target nomor WA yang dipantau
  const [targetNumbers, setTargetNumbers] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_TARGETS);
      return saved ? JSON.parse(saved) : [];
    } catch (_) {
      return [];
    }
  });

  const [inputTarget, setInputTarget] = useState('');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected'); // disconnected | connecting | qr_ready | connected | reconnecting
  const [backendError, setBackendError] = useState(null);
  const [isServerStarting, setIsServerStarting] = useState(false);

  // Galeri Media IndexedDB
  const [mediaList, setMediaList] = useState([]);
  const [mediaFilter, setMediaFilter] = useState('all'); // all | image | video
  const [previewMedia, setPreviewMedia] = useState(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const socketRef = useRef(null);
  const backendUrl = import.meta.env.VITE_WA_BACKEND_URL || 'http://localhost:4000';

  // Muat riwayat media tersimpan di IndexedDB saat pertama kali dibuka
  useEffect(() => {
    loadSavedMedia();
  }, []);

  async function loadSavedMedia() {
    try {
      const items = await getAllMediaItems();
      setMediaList(items);
    } catch (err) {
      console.error('Gagal membaca IndexedDB:', err);
    }
  }

  // Simpan perubahan nomor target ke LocalStorage & sinkronkan ke backend jika socket aktif
  const syncTargetsToBackend = (newList) => {
    localStorage.setItem(STORAGE_TARGETS, JSON.stringify(newList));
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('set-targets', {
        sessionId,
        sessionToken,
        targets: newList
      });
    }
  };

  // Inisialisasi koneksi Socket.io ke backend Render
  const handleStartSession = () => {
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('start-session', { sessionId, sessionToken });
      return;
    }

    setConnectionStatus('connecting');
    setBackendError(null);
    setIsServerStarting(true);

    const socket = io(backendUrl, {
      transports: ['websocket', 'polling'],
      timeout: 25000,
      reconnectionAttempts: 5
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsServerStarting(false);
      socket.emit('start-session', { sessionId, sessionToken });
      // Kirim target nomor yang sudah tersimpan
      if (targetNumbers.length > 0) {
        socket.emit('set-targets', { sessionId, sessionToken, targets: targetNumbers });
      }
    });

    socket.on('connect_error', (err) => {
      console.warn('Socket connect error:', err.message);
      setIsServerStarting(true);
      setConnectionStatus('connecting');
      setBackendError(
        'Menghubungkan ke server backend Render... (jika backend sedang bangun dari mode tidur, proses membutuhkan waktu ~30 detik).'
      );
    });

    socket.on('qr', async ({ qr, qrDataUrl }) => {
      setConnectionStatus('qr_ready');
      setIsServerStarting(false);
      setBackendError(null);
      if (qrDataUrl) {
        setQrCodeDataUrl(qrDataUrl);
      } else if (qr) {
        try {
          const generated = await QRCode.toDataURL(qr, { margin: 1, scale: 7 });
          setQrCodeDataUrl(generated);
        } catch (_) {
          setQrCodeDataUrl(null);
        }
      }
    });

    socket.on('status', ({ status, reason }) => {
      setConnectionStatus(status);
      setIsServerStarting(false);
      if (status === 'connected') {
        setQrCodeDataUrl(null);
        setBackendError(null);
        if (onShowToast) onShowToast({ message: 'WhatsApp berhasil terhubung!', type: 'success' });
      } else if (status === 'disconnected') {
        setQrCodeDataUrl(null);
        if (reason === 'logged_out' && onShowToast) {
          onShowToast({ message: 'Sesi WhatsApp telah dikeluarkan dari perangkat.', type: 'info' });
        }
      }
    });

    socket.on('session-error', ({ message }) => {
      setBackendError(message || 'Terjadi kesalahan pada sesi.');
      if (onShowToast) onShowToast({ message: message || 'Sesi bermasalah', type: 'error' });
    });

    socket.on('view-once-media', async (mediaPayload) => {
      try {
        await saveMediaItem(mediaPayload);
        setMediaList((prev) => [mediaPayload, ...prev.filter((m) => m.id !== mediaPayload.id)]);
        if (onShowToast) {
          onShowToast({
            message: `Media Sekali Lihat baru ditangkap dari ${mediaPayload.senderNumber}!`,
            type: 'success'
          });
        }
      } catch (err) {
        console.error('Gagal menyimpan media sekali lihat:', err);
      }
    });
  };

  // Putuskan sesi WhatsApp & bersihkan data sesi di Render
  const handleLogoutSession = () => {
    if (socketRef.current) {
      socketRef.current.emit('logout-session', { sessionId, sessionToken });
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setConnectionStatus('disconnected');
    setQrCodeDataUrl(null);
    setBackendError(null);
    if (onShowToast) onShowToast({ message: 'Sesi WhatsApp berhasil diputuskan.', type: 'info' });
  };

  // Tambah nomor target
  const handleAddTarget = (e) => {
    e.preventDefault();
    const normalized = normalizeTargetNumber(inputTarget);
    if (!normalized || normalized.length < 8) {
      if (onShowToast) onShowToast({ message: 'Masukkan nomor WhatsApp valid (minimal 8 digit).', type: 'error' });
      return;
    }
    if (targetNumbers.includes(normalized)) {
      if (onShowToast) onShowToast({ message: 'Nomor ini sudah ada dalam daftar target.', type: 'info' });
      setInputTarget('');
      return;
    }

    const updated = [...targetNumbers, normalized];
    setTargetNumbers(updated);
    syncTargetsToBackend(updated);
    setInputTarget('');
    if (onShowToast) onShowToast({ message: `Nomor +${normalized} ditambahkan ke target.`, type: 'success' });
  };

  // Hapus nomor target
  const handleRemoveTarget = (targetToRemove) => {
    const updated = targetNumbers.filter((n) => n !== targetToRemove);
    setTargetNumbers(updated);
    syncTargetsToBackend(updated);
    if (onShowToast) onShowToast({ message: `Nomor +${targetToRemove} dihapus dari target.`, type: 'info' });
  };

  // Unduh media ke perangkat lokal pengguna
  const handleDownloadMedia = (item) => {
    try {
      const link = document.createElement('a');
      link.href = item.base64Data;
      const ext = item.mediaType === 'video' ? 'mp4' : 'jpg';
      const cleanSender = item.senderNumber || 'target';
      link.download = `WA_ViewOnce_${cleanSender}_${item.id}.${ext}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      if (onShowToast) onShowToast({ message: 'Mengunduh berkas media...', type: 'success' });
    } catch (err) {
      if (onShowToast) onShowToast({ message: 'Gagal mengunduh berkas.', type: 'error' });
    }
  };

  // Hapus satu item media dari IndexedDB
  const handleDeleteMedia = async (id) => {
    try {
      await deleteMediaItem(id);
      setMediaList((prev) => prev.filter((item) => item.id !== id));
      if (onShowToast) onShowToast({ message: 'Item berhasil dihapus dari galeri.', type: 'info' });
    } catch (err) {
      if (onShowToast) onShowToast({ message: 'Gagal menghapus item.', type: 'error' });
    }
  };

  // Bersihkan semua media di IndexedDB
  const handleClearAllMedia = async () => {
    try {
      await clearAllMediaItems();
      setMediaList([]);
      setShowClearConfirm(false);
      if (onShowToast) onShowToast({ message: 'Seluruh galeri berhasil dibersihkan.', type: 'info' });
    } catch (err) {
      if (onShowToast) onShowToast({ message: 'Gagal membersihkan galeri.', type: 'error' });
    }
  };

  // Filter media yang tampil
  const filteredMedia = mediaList.filter((item) => {
    if (mediaFilter === 'image') return item.mediaType === 'image';
    if (mediaFilter === 'video') return item.mediaType === 'video';
    return true;
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      
      {/* Tombol Navigasi Kembali */}
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-white border-2 border-black rounded-lg font-bold text-xs shadow-[2px_2px_0px_#000] hover:bg-neutral-100 active:translate-x-[1px] active:translate-y-[1px] transition-all"
      >
        <ArrowLeft className="w-4 h-4" />
        Kembali ke Beranda
      </button>

      {/* Header Utama Fitur */}
      <div className="bg-white border-2 border-black rounded-xl p-5 md:p-6 shadow-[4px_4px_0px_#000] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="w-10 h-10 rounded-lg bg-emerald-500 border-2 border-black flex items-center justify-center shadow-[2px_2px_0px_#000]">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-black uppercase tracking-tight text-neutral-900">
                WA View Once Vault
              </h1>
              <span className="inline-block px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-black rounded text-[11px] font-bold">
                WA MEDIA • ZERO-DISK VAULT
              </span>
            </div>
          </div>
          <p className="text-xs md:text-sm text-neutral-700 max-w-2xl leading-relaxed">
            Tangkap dan simpan foto/video sekali lihat (View Once) dari kontak WhatsApp target secara otomatis via
            perangkat tertaut. Media disimpan langsung ke penyimpanan lokal browser (IndexedDB) secara pribadi.
          </p>
        </div>

        {/* Badge Status Real-Time */}
        <div className="flex flex-col items-start md:items-end gap-1.5 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-neutral-600">Status Sesi:</span>
            {connectionStatus === 'connected' && (
              <span className="px-2.5 py-1 bg-emerald-400 text-black border-2 border-black rounded-lg text-xs font-black shadow-[2px_2px_0px_#000] flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-black animate-ping" />
                Terhubung
              </span>
            )}
            {connectionStatus === 'qr_ready' && (
              <span className="px-2.5 py-1 bg-amber-300 text-black border-2 border-black rounded-lg text-xs font-black shadow-[2px_2px_0px_#000] flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-black animate-pulse" />
                Menunggu Scan QR
              </span>
            )}
            {connectionStatus === 'connecting' && (
              <span className="px-2.5 py-1 bg-blue-300 text-black border-2 border-black rounded-lg text-xs font-black shadow-[2px_2px_0px_#000] flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Menghubungkan...
              </span>
            )}
            {connectionStatus === 'disconnected' && (
              <span className="px-2.5 py-1 bg-neutral-200 text-neutral-700 border-2 border-black rounded-lg text-xs font-bold shadow-[2px_2px_0px_#000]">
                Terputus
              </span>
            )}
            {connectionStatus === 'reconnecting' && (
              <span className="px-2.5 py-1 bg-yellow-300 text-black border-2 border-black rounded-lg text-xs font-black shadow-[2px_2px_0px_#000] flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Menyambung Ulang...
              </span>
            )}
          </div>
          <span className="text-[10px] text-neutral-500 font-mono">
            Sesi ID: {sessionId.slice(0, 8)}...
          </span>
        </div>
      </div>

      {/* Banner Peringatan / Status Cold-Start Render */}
      {backendError && (
        <div className="bg-amber-50 border-2 border-black rounded-xl p-4 shadow-[3px_3px_0px_#000] flex items-start gap-3 text-xs md:text-sm text-amber-900">
          <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">Informasi Koneksi Server:</p>
            <p className="text-amber-800 leading-relaxed">{backendError}</p>
          </div>
        </div>
      )}

      {/* Grid 2 Kolom Panel Kontrol (Tautkan Perangkat & Nomor Target) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Panel 1: Tautkan Perangkat (QR Code) */}
        <div className="bg-white border-2 border-black rounded-xl p-5 shadow-[4px_4px_0px_#000] flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b-2 border-black pb-3">
              <div className="flex items-center gap-2">
                <QrCode className="w-5 h-5 text-neutral-900" />
                <h2 className="font-black text-sm md:text-base uppercase tracking-tight">
                  Tautkan Perangkat WhatsApp
                </h2>
              </div>
              {connectionStatus === 'connected' && (
                <button
                  onClick={handleLogoutSession}
                  className="px-2.5 py-1 bg-rose-500 text-white border-2 border-black rounded-md text-xs font-bold shadow-[2px_2px_0px_#000] hover:bg-rose-600 active:translate-x-[1px] active:translate-y-[1px] flex items-center gap-1.5"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Putuskan
                </button>
              )}
            </div>

            {/* Area Tampilan QR Code / Panduan */}
            {connectionStatus === 'qr_ready' && qrCodeDataUrl ? (
              <div className="flex flex-col items-center justify-center p-4 bg-neutral-50 border-2 border-black rounded-xl space-y-3">
                <div className="p-2 bg-white border-2 border-black rounded-lg shadow-[3px_3px_0px_#000]">
                  <img
                    src={qrCodeDataUrl}
                    alt="WhatsApp QR Code"
                    className="w-52 h-52 object-contain"
                  />
                </div>
                <div className="text-center space-y-1">
                  <p className="font-black text-xs text-neutral-900">Pindai QR ini di aplikasi WhatsApp HP kamu</p>
                  <ol className="text-[11px] text-neutral-600 space-y-0.5 text-left list-decimal list-inside bg-white p-2.5 border border-black rounded">
                    <li>Buka WhatsApp di HP target/kamu</li>
                    <li>Ketuk <b>Titik Tiga</b> atau <b>Pengaturan</b></li>
                    <li>Pilih <b>Perangkat Tertaut</b> &gt; <b>Tautkan Perangkat</b></li>
                  </ol>
                </div>
              </div>
            ) : connectionStatus === 'connected' ? (
              <div className="flex flex-col items-center justify-center py-8 px-4 bg-emerald-50 border-2 border-black rounded-xl text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-emerald-400 border-2 border-black flex items-center justify-center shadow-[2px_2px_0px_#000]">
                  <CheckCircle2 className="w-7 h-7 text-black" />
                </div>
                <h3 className="font-black text-sm text-neutral-900">Perangkat Berhasil Ditautkan!</h3>
                <p className="text-xs text-neutral-600 max-w-sm">
                  WhatsApp aktif memantau pesan sekali lihat yang masuk dari daftar nomor target yang ditentukan.
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 px-4 bg-neutral-50 border-2 border-dashed border-neutral-300 rounded-xl text-center space-y-2">
                <Smartphone className="w-10 h-10 text-neutral-400" />
                <p className="font-bold text-xs text-neutral-700">Perangkat belum terhubung</p>
                <p className="text-[11px] text-neutral-500 max-w-xs">
                  Tekan tombol di bawah untuk membuat sesi baru dan menampilkan kode QR WhatsApp.
                </p>
              </div>
            )}
          </div>

          {/* Tombol Aksi Sesi */}
          {connectionStatus !== 'connected' && (
            <button
              onClick={handleStartSession}
              disabled={connectionStatus === 'connecting'}
              className="w-full py-2.5 px-4 bg-black text-white border-2 border-black rounded-xl font-black text-xs md:text-sm shadow-[3px_3px_0px_#22c55e] hover:bg-neutral-800 active:translate-x-[1px] active:translate-y-[1px] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {connectionStatus === 'connecting' ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Sedang Menghubungkan...
                </>
              ) : (
                <>
                  <QrCode className="w-4 h-4" />
                  Mulai &amp; Buat QR Code
                </>
              )}
            </button>
          )}
        </div>

        {/* Panel 2: Manajemen Nomor Target */}
        <div className="bg-white border-2 border-black rounded-xl p-5 shadow-[4px_4px_0px_#000] flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b-2 border-black pb-3">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-neutral-900" />
                <h2 className="font-black text-sm md:text-base uppercase tracking-tight">
                  Nomor Target Terpantau
                </h2>
              </div>
              <span className="px-2 py-0.5 bg-neutral-100 border border-black rounded text-[11px] font-black">
                {targetNumbers.length} TARGET
              </span>
            </div>

            <p className="text-xs text-neutral-600">
              Hanya pesan <i>View Once</i> dari nomor di bawah yang akan ditangkap &amp; disimpan. Nomor lain diabaikan secara total.
            </p>

            {/* Form Input Tambah Nomor */}
            <form onSubmit={handleAddTarget} className="flex gap-2">
              <input
                type="text"
                value={inputTarget}
                onChange={(e) => setInputTarget(e.target.value)}
                placeholder="Contoh: 08123456789 atau 628xxx"
                className="flex-1 px-3 py-2 bg-neutral-50 border-2 border-black rounded-xl text-xs font-mono font-medium outline-none focus:bg-white focus:ring-2 focus:ring-black"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-emerald-400 text-black border-2 border-black rounded-xl font-black text-xs shadow-[2px_2px_0px_#000] hover:bg-emerald-300 active:translate-x-[1px] active:translate-y-[1px] flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                Tambah
              </button>
            </form>

            {/* Daftar Chip Nomor Target */}
            <div className="min-h-[140px] p-3 bg-neutral-50 border-2 border-black rounded-xl flex flex-wrap gap-2 items-start content-start">
              {targetNumbers.length === 0 ? (
                <div className="w-full flex flex-col items-center justify-center py-6 text-neutral-400 text-xs text-center space-y-1">
                  <Info className="w-6 h-6 text-neutral-300" />
                  <p className="font-semibold text-neutral-600">Belum ada target yang ditambahkan</p>
                  <p className="text-[11px] text-neutral-400">Masukkan nomor WA target di atas untuk mulai memantau.</p>
                </div>
              ) : (
                targetNumbers.map((num) => (
                  <div
                    key={num}
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border-2 border-black rounded-lg text-xs font-mono font-bold shadow-[2px_2px_0px_#000]"
                  >
                    <span className="text-emerald-700">+{num}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveTarget(num)}
                      className="text-neutral-400 hover:text-rose-600 ml-1"
                      title="Hapus Target"
                    >
                      &times;
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="p-2.5 bg-blue-50 border border-black rounded-lg flex items-start gap-2 text-[11px] text-blue-900">
            <Info className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
            <span>Format otomatis: nomor lokal berawalan <b>08xx</b> diubah menjadi kode internasional <b>628xx</b>.</span>
          </div>
        </div>

      </div>

      {/* Panel 3: Galeri Media Tersimpan (IndexedDB) */}
      <div className="bg-white border-2 border-black rounded-xl p-5 md:p-6 shadow-[4px_4px_0px_#000] space-y-4">
        
        {/* Header Galeri & Tombol Aksi */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b-2 border-black pb-4">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-neutral-900" />
              <h2 className="font-black text-base md:text-lg uppercase tracking-tight">
                Galeri Media Sekali Lihat ({mediaList.length})
              </h2>
            </div>
            <p className="text-xs text-neutral-600">
              Media foto/video sekali lihat yang berhasil ditangkap tersimpan aman di IndexedDB browser perangkat Anda.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Filter Media */}
            <div className="flex border-2 border-black rounded-lg overflow-hidden text-xs font-bold">
              <button
                onClick={() => setMediaFilter('all')}
                className={`px-3 py-1 ${mediaFilter === 'all' ? 'bg-black text-white' : 'bg-white text-black hover:bg-neutral-100'}`}
              >
                Semua
              </button>
              <button
                onClick={() => setMediaFilter('image')}
                className={`px-3 py-1 border-l-2 border-black ${mediaFilter === 'image' ? 'bg-black text-white' : 'bg-white text-black hover:bg-neutral-100'}`}
              >
                Foto
              </button>
              <button
                onClick={() => setMediaFilter('video')}
                className={`px-3 py-1 border-l-2 border-black ${mediaFilter === 'video' ? 'bg-black text-white' : 'bg-white text-black hover:bg-neutral-100'}`}
              >
                Video
              </button>
            </div>

            {/* Tombol Bersihkan Galeri */}
            {mediaList.length > 0 && (
              <button
                onClick={() => setShowClearConfirm(true)}
                className="px-3 py-1 bg-rose-100 text-rose-800 border-2 border-black rounded-lg text-xs font-bold shadow-[2px_2px_0px_#000] hover:bg-rose-200 active:translate-x-[1px] active:translate-y-[1px] flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Bersihkan Galeri
              </button>
            )}
          </div>
        </div>

        {/* Dialog Konfirmasi Hapus Semua */}
        {showClearConfirm && (
          <div className="p-4 bg-rose-50 border-2 border-rose-500 rounded-xl space-y-2">
            <div className="flex items-center gap-2 text-rose-900 font-bold text-xs md:text-sm">
              <ShieldAlert className="w-4 h-4 text-rose-600" />
              Yakin ingin mengosongkan semua media tersimpan di IndexedDB?
            </div>
            <p className="text-xs text-rose-700">Tindakan ini permanen dan tidak dapat dibatalkan.</p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleClearAllMedia}
                className="px-3 py-1 bg-rose-600 text-white border border-black rounded font-bold text-xs hover:bg-rose-700"
              >
                Ya, Kosongkan
              </button>
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-3 py-1 bg-white border border-black rounded font-bold text-xs hover:bg-neutral-100"
              >
                Batal
              </button>
            </div>
          </div>
        )}

        {/* Grid Media Card */}
        {filteredMedia.length === 0 ? (
          <div className="py-14 flex flex-col items-center justify-center text-center space-y-2">
            <div className="w-12 h-12 rounded-xl bg-neutral-100 border-2 border-black flex items-center justify-center shadow-[2px_2px_0px_#000]">
              <Eye className="w-6 h-6 text-neutral-400" />
            </div>
            <h3 className="font-bold text-sm text-neutral-800">Belum ada media View Once yang tertangkap</h3>
            <p className="text-xs text-neutral-500 max-w-sm">
              Ketika kontak di daftar target mengirimkan foto atau video sekali lihat, media akan otomatis muncul di sini.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredMedia.map((item) => (
              <div
                key={item.id}
                className="bg-neutral-50 border-2 border-black rounded-xl p-3 shadow-[3px_3px_0px_#000] flex flex-col justify-between space-y-3"
              >
                {/* Visual Media Preview */}
                <div className="relative rounded-lg overflow-hidden border-2 border-black bg-black aspect-video flex items-center justify-center">
                  {item.mediaType === 'video' ? (
                    <video
                      src={item.base64Data}
                      controls
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <img
                      src={item.base64Data}
                      alt={item.caption || 'View Once Image'}
                      className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform"
                      onClick={() => setPreviewMedia(item)}
                    />
                  )}

                  <span className="absolute top-2 left-2 px-2 py-0.5 bg-black/80 text-white rounded text-[10px] font-black uppercase tracking-wider border border-white/20 flex items-center gap-1">
                    {item.mediaType === 'video' ? (
                      <>
                        <Film className="w-3 h-3 text-amber-400" /> Video
                      </>
                    ) : (
                      <>
                        <ImageIcon className="w-3 h-3 text-cyan-400" /> Foto
                      </>
                    )}
                  </span>
                </div>

                {/* Metadata Pengirim & Waktu */}
                <div className="space-y-1 text-xs">
                  <div className="flex items-center justify-between font-bold text-neutral-900">
                    <span className="truncate max-w-[170px]" title={item.senderName || item.senderNumber}>
                      {item.senderName || item.senderNumber}
                    </span>
                    <span className="text-[10px] text-neutral-500 font-mono">
                      +{item.senderNumber}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 text-[11px] text-neutral-500">
                    <Clock className="w-3 h-3" />
                    <span>
                      {new Date(item.timestamp).toLocaleString(lang === 'id' ? 'id-ID' : 'en-US', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>

                  {item.caption && (
                    <p className="text-[11px] text-neutral-700 italic line-clamp-2 pt-1 border-t border-neutral-200">
                      "{item.caption}"
                    </p>
                  )}
                </div>

                {/* Tombol Aksi Item */}
                <div className="flex items-center gap-2 pt-2 border-t border-neutral-200">
                  <button
                    onClick={() => handleDownloadMedia(item)}
                    className="flex-1 py-1.5 px-3 bg-emerald-400 text-black border-2 border-black rounded-lg font-black text-xs shadow-[2px_2px_0px_#000] hover:bg-emerald-300 active:translate-x-[1px] active:translate-y-[1px] transition-all flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Unduh
                  </button>
                  <button
                    onClick={() => handleDeleteMedia(item.id)}
                    className="p-1.5 bg-white text-rose-600 border-2 border-black rounded-lg hover:bg-rose-50 active:translate-x-[1px] active:translate-y-[1px]"
                    title="Hapus dari Penyimpanan"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>

      {/* Modal Pratinjau Gambar Penuh */}
      {previewMedia && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={() => setPreviewMedia(null)}
        >
          <div
            className="bg-white border-2 border-black rounded-xl p-3 max-w-3xl max-h-[90vh] overflow-hidden flex flex-col space-y-3 shadow-[6px_6px_0px_#000]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b-2 border-black pb-2">
              <span className="font-bold text-xs text-neutral-800">
                Pratinjau Foto Sekali Lihat - +{previewMedia.senderNumber}
              </span>
              <button
                onClick={() => setPreviewMedia(null)}
                className="w-6 h-6 border-2 border-black rounded bg-neutral-100 font-bold text-xs flex items-center justify-center hover:bg-neutral-200"
              >
                &times;
              </button>
            </div>
            <div className="overflow-auto max-h-[70vh] flex items-center justify-center bg-black rounded-lg">
              <img
                src={previewMedia.base64Data}
                alt="Full preview"
                className="max-h-[68vh] object-contain"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => handleDownloadMedia(previewMedia)}
                className="px-4 py-1.5 bg-emerald-400 text-black border-2 border-black rounded-lg font-bold text-xs shadow-[2px_2px_0px_#000] hover:bg-emerald-300"
              >
                Unduh Foto
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
