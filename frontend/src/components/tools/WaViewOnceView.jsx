import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import QRCode from 'qrcode';
import {
  ArrowLeft,
  ShieldCheck,
  QrCode,
  Smartphone,
  Lock,
  Unlock,
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
  ShieldAlert,
  Activity
} from 'lucide-react';
import {
  saveMediaItem,
  getAllMediaItems,
  deleteMediaById,
  clearAllMedia
} from '../../utils/waMediaDB';

const STORAGE_SESSION_ID = 'wa_vault_session_id';
const STORAGE_LOCKED_TARGET = 'wa_vault_locked_target';

// Helper pengaman wajib agar TIDAK ADA objek yang lolos sebagai React child (Anti React Error #31)
const safeText = (val) => {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string' || typeof val === 'number') return String(val);
  if (typeof val === 'object' && 'message' in val) return String(val.message || '');
  return '';
};

// Helper normalisasi nomor WA ke format digit standar WhatsApp (628xxx)
function normalizePhone(raw) {
  if (!raw) return '';
  let digits = String(raw).replace(/\D/g, '');
  if (digits.startsWith('0')) {
    digits = '62' + digits.slice(1);
  } else if (digits.startsWith('8')) {
    digits = '62' + digits;
  }
  return digits;
}

// Format waktu pengiriman asli dari WhatsApp (format lokal Indonesia: 23 Nov 2026 • 14:20 WIB)
function formatWaDate(timestamp) {
  if (!timestamp) return '-';
  const num = Number(timestamp);
  if (isNaN(num) || num <= 0) return '-';
  const date = new Date(num);
  if (isNaN(date.getTime())) return '-';

  const datePart = date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
  const timePart = date.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit'
  });
  return `${datePart} • ${timePart} WIB`;
}

export default function WaViewOnceView({ onBack, onShowToast }) {
  // Bridge helper toast aman untuk mencegah lewatnya object sebagai React child
  const triggerToast = (msg, type = 'info') => {
    if (!onShowToast) return;
    const cleanMsg = safeText(msg);
    try {
      onShowToast(cleanMsg, type);
    } catch (_) {
      onShowToast({ message: cleanMsg, type });
    }
  };

  // 1. Identitas sesi unik terisolasi per browser
  const [sessionId] = useState(() => {
    let id = localStorage.getItem(STORAGE_SESSION_ID);
    if (!id) {
      id = window.crypto?.randomUUID
        ? window.crypto.randomUUID()
        : `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      localStorage.setItem(STORAGE_SESSION_ID, id);
    }
    return id;
  });

  // 2. Kunci HANYA 1 nomor target aktif (Single Locked Target)
  const [lockedTarget, setLockedTarget] = useState(() => {
    const saved = localStorage.getItem(STORAGE_LOCKED_TARGET);
    return saved ? normalizePhone(saved) : null;
  });

  const lockedTargetRef = useRef(lockedTarget);
  useEffect(() => {
    lockedTargetRef.current = lockedTarget;
  }, [lockedTarget]);

  const [inputTarget, setInputTarget] = useState('');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('connecting'); // disconnected | connecting | qr_ready | connected | reconnecting
  const [connectedPhone, setConnectedPhone] = useState(null);
  const [backendError, setBackendError] = useState(null);
  const [vaultActivity, setVaultActivity] = useState(null); // Status aktivitas real-time deteksi/dekripsi

  // 3. Galeri Media Tersimpan di IndexedDB
  const [mediaList, setMediaList] = useState([]);
  const [mediaFilter, setMediaFilter] = useState('all'); // all | image | video
  const [previewMedia, setPreviewMedia] = useState(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const socketRef = useRef(null);
  const backendUrl = import.meta.env.VITE_WA_BACKEND_URL || 'http://localhost:4000';

  // Muat galeri dari IndexedDB dan otomatis inisialisasi koneksi saat halaman dibuka
  useEffect(() => {
    loadSavedMedia();
    initSocketConnection();

    return () => {
      if (socketRef.current) {
        socketRef.current.off('connect');
        socketRef.current.off('connect_error');
        socketRef.current.off('session-status');
        socketRef.current.off('status');
        socketRef.current.off('qr-code');
        socketRef.current.off('qr');
        socketRef.current.off('target-synced');
        socketRef.current.off('target-updated');
        socketRef.current.off('view-once-media');
        socketRef.current.off('vault-activity');
        socketRef.current.off('session-error');
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  async function loadSavedMedia() {
    try {
      const items = await getAllMediaItems();
      const sanitizedItems = (items || []).map((item) => ({
        id: safeText(item?.id) || `vo_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        senderNumber: safeText(item?.senderNumber),
        senderName: safeText(item?.senderName),
        mediaType: item?.mediaType === 'video' ? 'video' : 'image',
        mimeType: safeText(item?.mimeType) || (item?.mediaType === 'video' ? 'video/mp4' : 'image/jpeg'),
        caption: safeText(item?.caption),
        sentAt: Number(item?.sentAt || item?.timestamp) || Date.now(),
        base64Data: typeof item?.base64Data === 'string' ? item.base64Data : ''
      }));
      setMediaList(sanitizedItems);
    } catch (err) {
      console.error('Gagal membaca IndexedDB:', err);
    }
  }

  // Inisialisasi koneksi Socket.IO & Auto-Resume sesi (Anti-Scan Ulang)
  function initSocketConnection() {
    if (socketRef.current && socketRef.current.connected) return;

    setConnectionStatus('connecting');
    setBackendError(null);

    const socket = io(backendUrl, {
      transports: ['websocket', 'polling'],
      timeout: 30000,
      reconnectionAttempts: 10,
      reconnectionDelay: 1500
    });

    socketRef.current = socket;

    // Setiap kali terhubung, kirim 'resume-session' beserta targetNumber dari localStorage
    socket.on('connect', () => {
      setBackendError(null);
      const savedTarget = localStorage.getItem(STORAGE_LOCKED_TARGET);
      socket.emit('resume-session', {
        sessionId,
        targetNumber: savedTarget ? normalizePhone(savedTarget) : null
      });
    });

    socket.on('connect_error', (err) => {
      console.warn('Socket connect error:', err?.message || err);
      setConnectionStatus('connecting');
      setBackendError(
        'Menghubungkan ke backend server... (jika backend Render sedang bangun dari mode tidur, proses membutuhkan waktu ~30 detik).'
      );
    });

    // Event status sesi terkini dari backend (dengan sanitasi nilai primitif ketat)
    socket.on('session-status', (payload) => {
      const status = safeText(payload?.status) || 'connecting';
      const phone = safeText(payload?.phone);
      const reason = safeText(payload?.reason);
      const message = safeText(payload?.message);
      const targetNumber = safeText(payload?.targetNumber);

      setConnectionStatus(status);

      if (targetNumber && !lockedTargetRef.current) {
        const clean = normalizePhone(targetNumber);
        setLockedTarget(clean);
        localStorage.setItem(STORAGE_LOCKED_TARGET, clean);
      }

      if (status === 'connected') {
        setQrCodeDataUrl(null);
        setBackendError(null);
        if (phone) setConnectedPhone(phone);
        triggerToast('WhatsApp berhasil terhubung!', 'success');

        // Pastikan targetNumber tersinkronisasi kembali saat status connected
        const currentSavedTarget = localStorage.getItem(STORAGE_LOCKED_TARGET);
        if (currentSavedTarget) {
          socket.emit('resume-session', {
            sessionId,
            targetNumber: normalizePhone(currentSavedTarget)
          });
        }
      } else if (status === 'qr_ready') {
        setConnectedPhone(null);
      } else if (status === 'reconnecting') {
        setQrCodeDataUrl(null);
      } else if (status === 'disconnected') {
        setQrCodeDataUrl(null);
        setConnectedPhone(null);
        if (reason === 'logged_out' || message) {
          triggerToast(message || 'Sesi WhatsApp dikeluarkan dari perangkat.', 'info');
        }
      }
    });

    // Kompatibilitas event status biasa
    socket.on('status', (payload) => {
      const status = safeText(payload?.status);
      const phone = safeText(payload?.phone);
      if (status) setConnectionStatus(status);
      if (status === 'connected') {
        setQrCodeDataUrl(null);
        if (phone) setConnectedPhone(phone);
      } else if (status === 'disconnected') {
        setQrCodeDataUrl(null);
        setConnectedPhone(null);
      }
    });

    // Penerimaan QR Code
    const handleQrReceive = async (payload) => {
      const qr = typeof payload?.qr === 'string' ? payload.qr : '';
      const qrDataUrl = typeof payload?.qrDataUrl === 'string' ? payload.qrDataUrl : '';

      setConnectionStatus('qr_ready');
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
    };

    socket.on('qr-code', handleQrReceive);
    socket.on('qr', handleQrReceive);

    // Sinkronisasi nomor target dari server
    const handleTargetSync = (payload) => {
      const synced = safeText(payload?.targetNumber);
      if (synced) {
        const clean = normalizePhone(synced);
        setLockedTarget(clean);
        localStorage.setItem(STORAGE_LOCKED_TARGET, clean);
      }
    };

    socket.on('target-synced', handleTargetSync);
    socket.on('target-updated', handleTargetSync);

    socket.on('session-error', (payload) => {
      const message = safeText(payload?.message) || 'Terjadi kendala pada sesi WhatsApp.';
      setBackendError(message);
      triggerToast(message, 'error');
    });

    // Baris Aktivitas Real-Time Vault (Deteksi & Dekripsi)
    socket.on('vault-activity', (data) => {
      if (data && typeof data === 'object') {
        setVaultActivity({
          time: Number(data.time) || Date.now(),
          text: safeText(data.text)
        });
      }
    });

    // Tangkap Media View Once Real-Time (Simpan ke IndexedDB & Tampilkan Paling Atas Langsung Terbuka)
    socket.on('view-once-media', async (rawPayload) => {
      try {
        const mediaPayload = {
          id: safeText(rawPayload?.id) || `vo_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          senderNumber: safeText(rawPayload?.senderNumber),
          senderName: safeText(rawPayload?.senderName),
          mediaType: rawPayload?.mediaType === 'video' ? 'video' : 'image',
          mimeType: safeText(rawPayload?.mimeType) || (rawPayload?.mediaType === 'video' ? 'video/mp4' : 'image/jpeg'),
          caption: safeText(rawPayload?.caption),
          sentAt: Number(rawPayload?.sentAt) || Date.now(),
          base64Data: typeof rawPayload?.base64Data === 'string' ? rawPayload.base64Data : ''
        };

        if (mediaPayload.base64Data) {
          await saveMediaItem(mediaPayload);
          setMediaList((prev) => [mediaPayload, ...prev.filter((m) => m.id !== mediaPayload.id)]);
          triggerToast(`Media Sekali Lihat baru ditangkap dari +${mediaPayload.senderNumber}!`, 'success');
        }
      } catch (err) {
        console.error('Gagal menyimpan media sekali lihat ke IndexedDB:', err);
      }
    });
  }

  // Tombol Mulai & Buat QR Code Baru secara manual
  const handleStartSession = () => {
    if (!socketRef.current || !socketRef.current.connected) {
      initSocketConnection();
    }
    setConnectionStatus('connecting');
    setBackendError(null);
    if (socketRef.current) {
      socketRef.current.emit('start-session', {
        sessionId,
        targetNumber: lockedTargetRef.current
      });
    }
  };

  // Putuskan Sesi WhatsApp (Logout)
  const handleLogoutSession = () => {
    if (socketRef.current) {
      socketRef.current.emit('logout-session', { sessionId });
    }
    setConnectionStatus('disconnected');
    setQrCodeDataUrl(null);
    setConnectedPhone(null);
    setBackendError(null);
    triggerToast('Sesi WhatsApp berhasil diputuskan.', 'info');
  };

  // Kunci 1 Nomor Target (Validasi ketat minimal 9 digit & normalisasi)
  const handleLockTarget = (e) => {
    e.preventDefault();
    const normalized = normalizePhone(inputTarget);
    if (!normalized || normalized.length < 9) {
      triggerToast('Masukkan nomor WhatsApp valid (minimal 9 digit).', 'error');
      return;
    }

    setLockedTarget(normalized);
    localStorage.setItem(STORAGE_LOCKED_TARGET, normalized);
    setInputTarget('');

    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('set-target', {
        sessionId,
        targetNumber: normalized
      });
    }

    triggerToast(`Nomor target +${normalized} berhasil dikunci!`, 'success');
  };

  // Buka Kunci / Ganti Nomor Target
  const handleUnlockTarget = () => {
    setLockedTarget(null);
    localStorage.removeItem(STORAGE_LOCKED_TARGET);

    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('set-target', {
        sessionId,
        targetNumber: null
      });
    }

    triggerToast('Target dibuka. Silakan masukkan nomor target baru.', 'info');
  };

  // Unduh Media ke Perangkat Lokal (.jpg / .mp4)
  const handleDownloadMedia = (item) => {
    try {
      const link = document.createElement('a');
      link.href = item.base64Data;
      const ext = item.mediaType === 'video' ? 'mp4' : 'jpg';
      const cleanSender = safeText(item.senderNumber) || 'target';
      const cleanId = safeText(item.id) || Date.now();
      link.download = `WA_ViewOnce_${cleanSender}_${cleanId}.${ext}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      triggerToast('Mengunduh media...', 'success');
    } catch (err) {
      triggerToast('Gagal mengunduh media.', 'error');
    }
  };

  // Hapus Satu Item Media dari UI & IndexedDB (Ikon tempat sampah merah)
  const handleDeleteMedia = async (id) => {
    try {
      await deleteMediaById(id);
      setMediaList((prev) => prev.filter((item) => item.id !== id));
      triggerToast('Item berhasil dihapus dari galeri.', 'info');
    } catch (err) {
      triggerToast('Gagal menghapus item.', 'error');
    }
  };

  // Bersihkan Seluruh Galeri Media di UI & IndexedDB (Clear All)
  const handleClearAllMedia = async () => {
    try {
      await clearAllMedia();
      setMediaList([]);
      setShowClearConfirm(false);
      triggerToast('Seluruh galeri berhasil dibersihkan.', 'info');
    } catch (err) {
      triggerToast('Gagal membersihkan galeri.', 'error');
    }
  };

  // Filter Media
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
                REAL-TIME CAPTURE • ZERO-DISK VAULT
              </span>
            </div>
          </div>
          <p className="text-xs md:text-sm text-neutral-700 max-w-2xl leading-relaxed">
            Tangkap dan simpan foto/video sekali lihat (View Once) dari nomor target secara real-time via perangkat
            tertaut tanpa perlu dibuka di HP. Media tersimpan permanen di IndexedDB browser Anda.
          </p>
        </div>

        {/* Badge Status Real-Time */}
        <div className="flex flex-col items-start md:items-end gap-1.5 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-neutral-600">Status Sesi:</span>
            {connectionStatus === 'connected' && (
              <span className="px-2.5 py-1 bg-emerald-400 text-black border-2 border-black rounded-lg text-xs font-black shadow-[2px_2px_0px_#000] flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-black animate-ping" />
                Terhubung {safeText(connectedPhone) ? `(+${safeText(connectedPhone)})` : ''}
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
            {connectionStatus === 'reconnecting' && (
              <span className="px-2.5 py-1 bg-yellow-300 text-black border-2 border-black rounded-lg text-xs font-black shadow-[2px_2px_0px_#000] flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Menyambung Ulang...
              </span>
            )}
            {connectionStatus === 'disconnected' && (
              <span className="px-2.5 py-1 bg-neutral-200 text-neutral-700 border-2 border-black rounded-lg text-xs font-bold shadow-[2px_2px_0px_#000]">
                Terputus
              </span>
            )}
          </div>
          <span className="text-[10px] text-neutral-500 font-mono">
            Sesi ID: {safeText(sessionId).slice(0, 8)}...
          </span>
        </div>
      </div>

      {/* Banner Informasi Koneksi / Cold-Start Render */}
      {backendError && (
        <div className="bg-amber-50 border-2 border-black rounded-xl p-4 shadow-[3px_3px_0px_#000] flex items-start gap-3 text-xs md:text-sm text-amber-900">
          <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">Informasi Koneksi Server:</p>
            <p className="text-amber-800 leading-relaxed">{safeText(backendError)}</p>
          </div>
        </div>
      )}

      {/* Grid 2 Kolom Panel Kontrol (Tautkan Perangkat & Kunci 1 Nomor Target) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Panel 1: Tautkan Perangkat WhatsApp (QR Code) */}
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
                    <li>Buka WhatsApp di HP Anda</li>
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
                  Sesi WhatsApp aktif memantau pesan sekali lihat yang masuk dari nomor target terkunci.
                </p>
                <div className="pt-2">
                  <span className="px-3 py-1 bg-white border-2 border-black rounded-lg text-xs font-mono font-bold shadow-[2px_2px_0px_#000] text-emerald-800">
                    Auto-Resume Aktif • Anti-Scan Ulang
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 px-4 bg-neutral-50 border-2 border-dashed border-neutral-300 rounded-xl text-center space-y-2">
                <Smartphone className="w-10 h-10 text-neutral-400" />
                <p className="font-bold text-xs text-neutral-700">Perangkat belum terhubung</p>
                <p className="text-[11px] text-neutral-500 max-w-xs">
                  Tekan tombol di bawah untuk meminta kode QR penautan WhatsApp.
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

        {/* Panel 2: Kunci 1 Nomor Target Terpantau */}
        <div className="bg-white border-2 border-black rounded-xl p-5 shadow-[4px_4px_0px_#000] flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b-2 border-black pb-3">
              <div className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-neutral-900" />
                <h2 className="font-black text-sm md:text-base uppercase tracking-tight">
                  Kunci 1 Nomor Target
                </h2>
              </div>
              <span className={`px-2 py-0.5 border border-black rounded text-[11px] font-black ${lockedTarget ? 'bg-emerald-300 text-black' : 'bg-neutral-100 text-neutral-600'}`}>
                {lockedTarget ? '1 TARGET TERKUNCI' : 'BELUM TERKUNCI'}
              </span>
            </div>

            <p className="text-xs text-neutral-600">
              Sistem akan <b>mengunci 1 nomor target saja</b> untuk akurasi maksimal. Hanya pesan <i>View Once</i> dari nomor ini yang akan ditangkap &amp; disimpan.
            </p>

            {/* Jika Nomor Target Sudah Terkunci */}
            {lockedTarget ? (
              <div className="p-4 bg-emerald-50 border-2 border-black rounded-xl shadow-[3px_3px_0px_#000] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-emerald-400 border-2 border-black flex items-center justify-center shadow-[1.5px_1.5px_0px_#000]">
                      <Lock className="w-5 h-5 text-black" />
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-black text-emerald-800 tracking-wider">Target Terkunci</span>
                      <p className="font-mono font-black text-base text-neutral-900 tracking-tight">
                        +{safeText(lockedTarget)}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleUnlockTarget}
                    className="px-3 py-1.5 bg-white text-rose-700 border-2 border-black rounded-lg text-xs font-bold shadow-[2px_2px_0px_#000] hover:bg-rose-50 active:translate-x-[1px] active:translate-y-[1px] flex items-center gap-1.5"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    Ganti Target
                  </button>
                </div>
                <div className="p-2 bg-white/80 border border-emerald-300 rounded text-[11px] text-emerald-900 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Target aktif terpantau secara real-time. Tersinkronisasi otomatis dengan server.</span>
                </div>
              </div>
            ) : (
              /* Jika Belum Ada Target Terkunci */
              <form onSubmit={handleLockTarget} className="space-y-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={inputTarget}
                    onChange={(e) => setInputTarget(e.target.value)}
                    placeholder="Contoh: 08123456789 atau 628xxx"
                    className="flex-1 px-3 py-2 bg-neutral-50 border-2 border-black rounded-xl text-xs font-mono font-bold outline-none focus:bg-white focus:ring-2 focus:ring-black"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-emerald-400 text-black border-2 border-black rounded-xl font-black text-xs shadow-[2px_2px_0px_#000] hover:bg-emerald-300 active:translate-x-[1px] active:translate-y-[1px] flex items-center gap-1.5 shrink-0"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    Kunci Target
                  </button>
                </div>
                <div className="p-2.5 bg-neutral-50 border-2 border-dashed border-neutral-300 rounded-xl text-center py-4 text-neutral-500 text-xs">
                  <Info className="w-5 h-5 mx-auto mb-1 text-neutral-400" />
                  Masukkan nomor WhatsApp target di atas dan klik <b>Kunci Target</b>.
                </div>
              </form>
            )}
          </div>

          <div className="p-2.5 bg-blue-50 border border-black rounded-lg flex items-start gap-2 text-[11px] text-blue-900">
            <Info className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
            <span>Format otomatis: nomor awalan <b>08xx</b> langsung diubah ke <b>628xx</b> (minimal 9 digit).</span>
          </div>
        </div>

      </div>

      {/* Panel 3: Galeri Media Tersimpan (IndexedDB Permanen & Real-Time) */}
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
              Media foto/video sekali lihat yang berhasil ditangkap tersimpan permanen di IndexedDB browser Anda.
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

            {/* Tombol Clear All / Hapus Semua */}
            {mediaList.length > 0 && (
              <button
                onClick={() => setShowClearConfirm(true)}
                className="px-3 py-1 bg-rose-100 text-rose-800 border-2 border-black rounded-lg text-xs font-black shadow-[2px_2px_0px_#000] hover:bg-rose-200 active:translate-x-[1px] active:translate-y-[1px] flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear All
              </button>
            )}
          </div>
        </div>

        {/* Baris Status Aktivitas Real-Time Vault (Wajib Terlihat) */}
        <div className="flex items-center gap-2 px-3 py-2 bg-neutral-100 border-2 border-black rounded-lg text-xs font-mono shadow-[2px_2px_0px_#000] text-neutral-800">
          <span className={`w-2 h-2 rounded-full shrink-0 ${vaultActivity ? 'bg-emerald-500 animate-ping' : connectionStatus === 'connected' ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
          <Activity className="w-3.5 h-3.5 text-neutral-700 shrink-0" />
          {vaultActivity && (
            <span className="font-bold text-neutral-500 shrink-0">
              {new Date(vaultActivity.time).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}:
            </span>
          )}
          <span className="truncate font-semibold">
            {vaultActivity && safeText(vaultActivity.text)
              ? safeText(vaultActivity.text)
              : connectionStatus === 'connected'
                ? lockedTarget
                  ? `Server aktif memantau pesan View Once dari +${safeText(lockedTarget)} (menunggu kiriman media...)`
                  : 'WhatsApp terhubung. Silakan kunci 1 nomor target untuk mulai memantau.'
                : 'Menghubungkan ke backend server WhatsApp...'}
          </span>
        </div>

        {/* Dialog Konfirmasi Clear All */}
        {showClearConfirm && (
          <div className="p-4 bg-rose-50 border-2 border-rose-500 rounded-xl space-y-2 shadow-[3px_3px_0px_#000]">
            <div className="flex items-center gap-2 text-rose-900 font-bold text-xs md:text-sm">
              <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0" />
              Yakin ingin mengosongkan seluruh galeri media di browser ini?
            </div>
            <p className="text-xs text-rose-700">Semua foto dan video sekali lihat yang tersimpan di IndexedDB akan dihapus permanen.</p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleClearAllMedia}
                className="px-3 py-1.5 bg-rose-600 text-white border-2 border-black rounded-lg font-black text-xs hover:bg-rose-700 shadow-[2px_2px_0px_#000]"
              >
                Ya, Hapus Semua
              </button>
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-3 py-1.5 bg-white text-black border-2 border-black rounded-lg font-bold text-xs hover:bg-neutral-100 shadow-[2px_2px_0px_#000]"
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
              Saat nomor target yang terkunci mengirimkan foto atau video sekali lihat, media akan otomatis muncul di sini secara real-time.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredMedia.map((item) => (
              <div
                key={item.id}
                className="bg-white border-2 border-black rounded-xl p-3 shadow-[3px_3px_0px_#000] flex flex-col justify-between space-y-3"
              >
                {/* Header Metadata Kartu: Badge Nomor Pengirim Mencolok */}
                <div className="flex items-center justify-between gap-2 border-b-2 border-black pb-2">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-300 text-black border-2 border-black rounded-lg text-xs font-black shadow-[1.5px_1.5px_0px_#000] truncate max-w-[210px]">
                    <Smartphone className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate font-mono">+{safeText(item.senderNumber)}</span>
                    {safeText(item.senderName) && (
                      <span className="text-[11px] font-sans font-bold text-neutral-800 truncate">
                        • {safeText(item.senderName)}
                      </span>
                    )}
                  </div>
                  
                  {/* Badge Jenis Media */}
                  <span className={`px-2 py-0.5 border-2 border-black rounded text-[10px] font-black uppercase tracking-wider shadow-[1px_1px_0px_#000] flex items-center gap-1 ${
                    item.mediaType === 'video' ? 'bg-purple-200 text-purple-900' : 'bg-cyan-200 text-cyan-900'
                  }`}>
                    {item.mediaType === 'video' ? (
                      <>
                        <Film className="w-3 h-3" /> VIDEO
                      </>
                    ) : (
                      <>
                        <ImageIcon className="w-3 h-3" /> FOTO
                      </>
                    )}
                  </span>
                </div>

                {/* Visual Media Preview (Langsung terbuka tanpa klik di HP) */}
                <div className="relative rounded-lg overflow-hidden border-2 border-black bg-black aspect-video flex items-center justify-center">
                  {item.mediaType === 'video' ? (
                    <video
                      src={item.base64Data}
                      controls
                      playsInline
                      preload="metadata"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <img
                      src={item.base64Data}
                      alt={safeText(item.caption) || 'View Once Image'}
                      loading="lazy"
                      className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform"
                      onClick={() => setPreviewMedia(item)}
                    />
                  )}
                </div>

                {/* Metadata Tanggal & Jam Asli WhatsApp */}
                <div className="space-y-1.5 text-xs bg-neutral-50 p-2 border border-black rounded-lg">
                  <div className="flex items-center gap-1.5 font-bold text-neutral-800 text-[11px]">
                    <Clock className="w-3.5 h-3.5 text-neutral-600 shrink-0" />
                    <span>Waktu Kirim Asli WA:</span>
                  </div>
                  <p className="font-mono text-[11px] text-neutral-900 font-bold pl-5">
                    {formatWaDate(item.sentAt || item.timestamp)}
                  </p>

                  {safeText(item.caption) && (
                    <div className="pt-1.5 border-t border-neutral-200 text-[11px] text-neutral-700 italic">
                      "{safeText(item.caption)}"
                    </div>
                  )}
                </div>

                {/* Tombol Aksi: Unduh Langsung & Hapus Satuan */}
                <div className="flex items-center gap-2 pt-2 border-t-2 border-black">
                  <button
                    onClick={() => handleDownloadMedia(item)}
                    className="flex-1 py-1.5 px-3 bg-emerald-400 text-black border-2 border-black rounded-lg font-black text-xs shadow-[2px_2px_0px_#000] hover:bg-emerald-300 active:translate-x-[1px] active:translate-y-[1px] transition-all flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Unduh
                  </button>
                  <button
                    onClick={() => handleDeleteMedia(item.id)}
                    className="p-1.5 bg-rose-100 text-rose-700 border-2 border-black rounded-lg hover:bg-rose-200 active:translate-x-[1px] active:translate-y-[1px] shadow-[1.5px_1.5px_0px_#000]"
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

      {/* Modal Pratinjau Foto Penuh */}
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
                Pratinjau Foto Sekali Lihat • +{safeText(previewMedia.senderNumber)}
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
            <div className="flex justify-between items-center pt-1 text-xs">
              <span className="text-neutral-500 font-mono text-[11px]">
                {formatWaDate(previewMedia.sentAt || previewMedia.timestamp)}
              </span>
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
