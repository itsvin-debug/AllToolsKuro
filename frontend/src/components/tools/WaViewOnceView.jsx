import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  Activity,
  Copy,
  Search,
  MessageSquare,
  FileText,
  Radio,
  Users,
  Check,
  X
} from 'lucide-react';
import {
  saveMediaItem,
  updateMediaItem,
  getAllMediaItems,
  deleteMediaById,
  deleteMediaByIds,
  clearAllMedia
} from '../../utils/waMediaDB';

const STORAGE_SESSION_ID = 'wa_vault_session_id';
const STORAGE_LOCKED_TARGET = 'wa_vault_locked_target';
const STORAGE_CONFIRMED_LIDS = 'wa_vault_confirmed_lids';
const STORAGE_PAIRING_PHONE = 'wa_vault_pairing_phone';
const STORAGE_MONITOR_MODE = 'wa_vault_monitor_mode';

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

// Format waktu pengiriman asli dari WhatsApp (23 Nov 2026 • 14:20 WIB)
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

// Helper download file Blob untuk mobile & desktop
function downloadBase64File(base64Data, filename = 'download', mimeType = '') {
  try {
    if (!base64Data) return;
    const parts = base64Data.split(';base64,');
    const contentType = mimeType || (parts[0] ? parts[0].replace('data:', '') : 'application/octet-stream');
    const raw = window.atob(parts[1] || parts[0]);
    const rawLength = raw.length;
    const uInt8Array = new Uint8Array(rawLength);
    for (let i = 0; i < rawLength; ++i) {
      uInt8Array[i] = raw.charCodeAt(i);
    }
    const blob = new Blob([uInt8Array], { type: contentType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch (err) {
    console.error('Download error:', err);
  }
}

export default function WaViewOnceView({ onBack, onShowToast }) {
  const triggerToast = (msg, type = 'info') => {
    if (!onShowToast) return;
    const cleanMsg = safeText(msg);
    try {
      onShowToast(cleanMsg, type);
    } catch (_) {
      onShowToast({ message: cleanMsg, type });
    }
  };

  // 1. Identitas sesi unik
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

  // 2. Metode Penautan: Kode Pairing (Rekomendasi) atau Scan QR Code
  const [authMethod, setAuthMethod] = useState('pairing');
  const [pairingPhone, setPairingPhone] = useState(() => {
    return localStorage.getItem(STORAGE_PAIRING_PHONE) || '';
  });
  const [pairingCode, setPairingCode] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);

  // Status pembuatan QR & Watchdog Timeout 15 Detik
  const [qrGenerating, setQrGenerating] = useState(false);
  const [qrWatchdogExpired, setQrWatchdogExpired] = useState(false);
  const qrWatchdogRef = useRef(null);

  // 3. Mode Pemantauan: 'all' (Semua Kontak) vs 'single' (Kunci 1 Target)
  const [monitorMode, setMonitorMode] = useState(() => {
    return localStorage.getItem(STORAGE_MONITOR_MODE) || 'all';
  });

  // Kunci 1 Nomor Target
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
  const [socketConnected, setSocketConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('connecting'); // disconnected | connecting | generating_qr | pairing_ready | qr_ready | connected | reconnecting
  const [connectedPhone, setConnectedPhone] = useState(null);
  const [backendError, setBackendError] = useState(null);
  const [vaultActivity, setVaultActivity] = useState(null);
  const [unmappedLidAlert, setUnmappedLidAlert] = useState(null);
  const [confirmedLids, setConfirmedLids] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_CONFIRMED_LIDS);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // 4. State Galeri & Tab Fungsi 4-in-1
  // 'view_once' | 'ghost_reader' | 'anti_delete' | 'status_saver'
  const [activeTab, setActiveTab] = useState('view_once');
  const [subFilter, setSubFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [mediaList, setMediaList] = useState([]);
  const [previewMedia, setPreviewMedia] = useState(null);
  const [copiedItemId, setCopiedItemId] = useState(null);
  const [confirmClearTab, setConfirmClearTab] = useState(null); // null | 'view_once' | 'ghost_reader' | 'anti_delete' | 'status_saver' | 'all'

  const socketRef = useRef(null);
  const backendUrl = import.meta.env.VITE_WA_BACKEND_URL || 'http://localhost:4000';

  const startQrWatchdog = () => {
    if (qrWatchdogRef.current) clearTimeout(qrWatchdogRef.current);
    setQrGenerating(true);
    setQrWatchdogExpired(false);
    qrWatchdogRef.current = setTimeout(() => {
      setQrGenerating(false);
      setQrWatchdogExpired(true);
    }, 15000);
  };

  const clearQrWatchdog = () => {
    if (qrWatchdogRef.current) {
      clearTimeout(qrWatchdogRef.current);
      qrWatchdogRef.current = null;
    }
    setQrGenerating(false);
    setQrWatchdogExpired(false);
  };

  // Muat data dari IndexedDB & inisialisasi koneksi saat halaman dibuka
  useEffect(() => {
    try {
      fetch(`${backendUrl}/ping`, { mode: 'cors' }).catch(() => {});
    } catch (_) {}

    loadSavedMedia();
    initSocketConnection();

    return () => {
      clearQrWatchdog();
      if (socketRef.current) {
        socketRef.current.off('connect');
        socketRef.current.off('disconnect');
        socketRef.current.off('connect_error');
        socketRef.current.off('session-status');
        socketRef.current.off('status');
        socketRef.current.off('pairing-code');
        socketRef.current.off('qr-code');
        socketRef.current.off('qr');
        socketRef.current.off('target-synced');
        socketRef.current.off('target-updated');
        socketRef.current.off('monitor-mode-synced');
        socketRef.current.off('vault-item');
        socketRef.current.off('vault-item-revoked');
        socketRef.current.off('vault-item-edited');
        socketRef.current.off('view-once-media');
        socketRef.current.off('vault-activity');
        socketRef.current.off('unmapped-lid-view-once');
        socketRef.current.off('session-error');
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  async function loadSavedMedia() {
    try {
      const items = await getAllMediaItems();
      setMediaList(items || []);
    } catch (err) {
      console.error('Gagal membaca IndexedDB:', err);
    }
  }

  function initSocketConnection() {
    if (socketRef.current && socketRef.current.connected) return;

    setConnectionStatus('connecting');
    setBackendError(null);

    const socket = io(backendUrl, {
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1500,
      timeout: 20000
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setSocketConnected(true);
      setBackendError(null);

      const savedTarget = localStorage.getItem(STORAGE_LOCKED_TARGET);
      const savedMode = localStorage.getItem(STORAGE_MONITOR_MODE) || 'all';
      let savedLids = [];
      try {
        savedLids = JSON.parse(localStorage.getItem(STORAGE_CONFIRMED_LIDS)) || [];
      } catch (_) {}

      socket.emit('resume-session', {
        sessionId,
        monitorMode: savedMode,
        targetNumber: savedTarget ? normalizePhone(savedTarget) : null,
        confirmedLids: savedLids
      });
    });

    socket.on('disconnect', () => {
      setSocketConnected(false);
    });

    socket.on('connect_error', (err) => {
      console.warn('Socket connect error:', err?.message || err);
      setSocketConnected(false);
      setConnectionStatus('connecting');
      setBackendError(
        'Membangunkan server backend Render... (jika server sedang tidur, proses butuh ~30-50 detik).'
      );
    });

    socket.on('session-status', (payload) => {
      const status = safeText(payload?.status) || 'connecting';
      const phone = safeText(payload?.phone);
      const reason = safeText(payload?.reason);
      const message = safeText(payload?.message);
      const targetNumber = safeText(payload?.targetNumber);
      const code = safeText(payload?.code);
      const mode = safeText(payload?.monitorMode);

      setConnectionStatus(status);

      if (mode && (mode === 'all' || mode === 'single')) {
        setMonitorMode(mode);
        localStorage.setItem(STORAGE_MONITOR_MODE, mode);
      }

      if (code) {
        setPairingCode(code);
      }

      if (status === 'generating_qr') {
        setQrGenerating(true);
      } else if (status === 'qr_ready') {
        clearQrWatchdog();
      } else if (status === 'pairing_ready') {
        clearQrWatchdog();
        setConnectedPhone(null);
      }

      if (targetNumber && !lockedTargetRef.current) {
        const clean = normalizePhone(targetNumber);
        setLockedTarget(clean);
        localStorage.setItem(STORAGE_LOCKED_TARGET, clean);
      }

      if (status === 'connected') {
        clearQrWatchdog();
        setQrCodeDataUrl(null);
        setPairingCode('');
        setBackendError(null);
        if (phone) setConnectedPhone(phone);
        triggerToast('WhatsApp berhasil terhubung (Ghost Mode Aktif)!', 'success');
      } else if (status === 'disconnected') {
        clearQrWatchdog();
        setQrCodeDataUrl(null);
        setPairingCode('');
        setConnectedPhone(null);
        if (reason === 'logged_out' || message) {
          triggerToast(message || 'Sesi WhatsApp dikeluarkan dari perangkat.', 'info');
        }
      }
    });

    socket.on('pairing-code', (payload) => {
      const code = safeText(payload?.code);
      if (code) {
        clearQrWatchdog();
        setPairingCode(code);
        setConnectionStatus('pairing_ready');
        setBackendError(null);
        triggerToast('Kode pairing WhatsApp berhasil dibuat!', 'success');
      }
    });

    const handleQrReceive = async (payload) => {
      clearQrWatchdog();
      const qr = typeof payload?.qr === 'string' ? payload.qr : '';
      const qrDataUrl = typeof payload?.qrDataUrl === 'string' ? payload.qrDataUrl : '';

      setConnectionStatus('qr_ready');
      setBackendError(null);

      if (qrDataUrl) {
        setQrCodeDataUrl(qrDataUrl);
      } else if (qr) {
        try {
          const generated = await QRCode.toDataURL(qr, { margin: 1, width: 260, errorCorrectionLevel: 'M' });
          setQrCodeDataUrl(generated);
        } catch (_) {
          setQrCodeDataUrl(null);
        }
      }
    };

    socket.on('qr-code', handleQrReceive);
    socket.on('qr', handleQrReceive);

    socket.on('target-synced', (payload) => {
      const synced = safeText(payload?.targetNumber);
      if (synced) {
        const clean = normalizePhone(synced);
        setLockedTarget(clean);
        localStorage.setItem(STORAGE_LOCKED_TARGET, clean);
      }
    });

    socket.on('monitor-mode-synced', (payload) => {
      const mode = safeText(payload?.monitorMode);
      if (mode === 'all' || mode === 'single') {
        setMonitorMode(mode);
        localStorage.setItem(STORAGE_MONITOR_MODE, mode);
      }
    });

    socket.on('session-error', (payload) => {
      clearQrWatchdog();
      const message = safeText(payload?.message) || 'Terjadi kendala pada sesi WhatsApp.';
      setBackendError(message);
      triggerToast(message, 'error');
    });

    socket.on('vault-activity', (data) => {
      if (data && typeof data === 'object') {
        setVaultActivity({
          time: Number(data.time) || Date.now(),
          text: safeText(data.text)
        });
      }
    });

    socket.on('unmapped-lid-view-once', (data) => {
      if (data && data.lid) {
        setUnmappedLidAlert({
          lid: safeText(data.lid),
          pushName: safeText(data.pushName) || 'Kontak WhatsApp',
          mediaType: data.mediaType === 'video' ? 'video' : 'image',
          sentAt: Number(data.sentAt) || Date.now()
        });
      }
    });

    // PENERIMAAN ITEM VAULT 4-IN-1 REAL-TIME (Simpan ke IndexedDB & Tampilkan Teratas)
    socket.on('vault-item', async (rawPayload) => {
      try {
        const item = {
          id: safeText(rawPayload?.id) || `vi_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          category: rawPayload?.category === 'status' ? 'status' : 'chat',
          senderNumber: safeText(rawPayload?.senderNumber),
          senderName: safeText(rawPayload?.senderName),
          mediaType: safeText(rawPayload?.mediaType) || 'text',
          mimeType: safeText(rawPayload?.mimeType),
          textContent: safeText(rawPayload?.textContent),
          caption: safeText(rawPayload?.caption),
          bgColor: safeText(rawPayload?.bgColor),
          fileName: safeText(rawPayload?.fileName),
          fileSize: Number(rawPayload?.fileSize) || 0,
          isVoiceNote: Boolean(rawPayload?.isVoiceNote),
          isViewOnce: Boolean(rawPayload?.isViewOnce),
          isDeleted: Boolean(rawPayload?.isDeleted),
          deletedAt: rawPayload?.deletedAt ? Number(rawPayload.deletedAt) : null,
          isEdited: Boolean(rawPayload?.isEdited),
          editedText: safeText(rawPayload?.editedText),
          editedAt: rawPayload?.editedAt ? Number(rawPayload.editedAt) : null,
          sentAt: Number(rawPayload?.sentAt) || Date.now(),
          base64Data: typeof rawPayload?.base64Data === 'string' ? rawPayload.base64Data : ''
        };

        await saveMediaItem(item);
        setMediaList((prev) => [item, ...prev.filter((m) => m.id !== item.id)]);

        if (item.isViewOnce) {
          triggerToast(`Media Sekali Lihat baru diamankan dari ${item.senderName}!`, 'success');
        } else if (item.category === 'status') {
          triggerToast(`Status WA baru diamankan secara senyap dari ${item.senderName}!`, 'info');
        } else {
          triggerToast(`Pesan baru diamankan dari ${item.senderName}!`, 'info');
        }
      } catch (err) {
        console.error('Gagal memproses item vault:', err);
      }
    });

    // EVENT ANTI-DELETE: Pesan ditarik oleh pengirim
    socket.on('vault-item-revoked', async ({ id, deletedAt }) => {
      try {
        const cleanId = safeText(id);
        const delTime = Number(deletedAt) || Date.now();
        await updateMediaItem(cleanId, { isDeleted: true, deletedAt: delTime });
        setMediaList((prev) =>
          prev.map((m) => (m.id === cleanId ? { ...m, isDeleted: true, deletedAt: delTime } : m))
        );
        triggerToast('Ada pesan yang ditarik/dihapus pengirim (Anti-Delete aktif)!', 'error');
      } catch (err) {
        console.error('Gagal menandai pesan revoked:', err);
      }
    });

    // EVENT ANTI-EDIT: Pesan diedit oleh pengirim
    socket.on('vault-item-edited', async ({ id, editedText, editedAt }) => {
      try {
        const cleanId = safeText(id);
        const editTime = Number(editedAt) || Date.now();
        const text = safeText(editedText);
        await updateMediaItem(cleanId, { isEdited: true, editedText: text, editedAt: editTime });
        setMediaList((prev) =>
          prev.map((m) =>
            m.id === cleanId ? { ...m, isEdited: true, editedText: text, editedAt: editTime } : m
          )
        );
        triggerToast('Ada pesan yang diedit oleh pengirim!', 'info');
      } catch (err) {
        console.error('Gagal menandai pesan edited:', err);
      }
    });

    // Kompatibilitas mundur event view-once-media
    socket.on('view-once-media', async (rawPayload) => {
      try {
        if (!rawPayload?.id) return;
        const item = {
          id: safeText(rawPayload.id),
          category: 'chat',
          senderNumber: safeText(rawPayload.senderNumber),
          senderName: safeText(rawPayload.senderName),
          mediaType: rawPayload.mediaType === 'video' ? 'video' : 'image',
          mimeType: safeText(rawPayload.mimeType),
          caption: safeText(rawPayload.caption),
          isViewOnce: true,
          sentAt: Number(rawPayload.sentAt) || Date.now(),
          base64Data: typeof rawPayload.base64Data === 'string' ? rawPayload.base64Data : ''
        };
        await saveMediaItem(item);
        setMediaList((prev) => [item, ...prev.filter((m) => m.id !== item.id)]);
      } catch (_) {}
    });
  }

  // Mulai Sesi WhatsApp
  const handleStartSession = (method = authMethod, forceNew = false) => {
    if (!socketRef.current || !socketRef.current.connected) {
      initSocketConnection();
    }

    if (method === 'pairing') {
      clearQrWatchdog();
      const cleanPhone = normalizePhone(pairingPhone);
      if (!cleanPhone || cleanPhone.length < 9) {
        triggerToast('Masukkan nomor HP WhatsApp Anda yang valid (minimal 9 digit).', 'error');
        return;
      }
      localStorage.setItem(STORAGE_PAIRING_PHONE, cleanPhone);
      setConnectionStatus('connecting');
      setBackendError(null);
      setPairingCode('');

      if (socketRef.current) {
        socketRef.current.emit('start-session', {
          sessionId,
          monitorMode,
          targetNumber: lockedTargetRef.current,
          authMethod: 'pairing',
          pairingPhone: cleanPhone,
          forceNew
        });
      }
    } else {
      startQrWatchdog();
      setConnectionStatus('generating_qr');
      setBackendError(null);
      setQrCodeDataUrl(null);

      if (socketRef.current) {
        socketRef.current.emit('start-session', {
          sessionId,
          monitorMode,
          targetNumber: lockedTargetRef.current,
          authMethod: 'qr',
          forceNew
        });
      }
    }
  };

  const switchAuthMethod = (method) => {
    setAuthMethod(method);
    if (connectionStatus !== 'connected') {
      clearQrWatchdog();
      if (connectionStatus === 'generating_qr') {
        setConnectionStatus('disconnected');
      }
    }
  };

  const handleCopyPairingCode = () => {
    if (!pairingCode) return;
    try {
      navigator.clipboard.writeText(pairingCode);
      setCopiedCode(true);
      triggerToast('Kode pairing berhasil disalin!', 'success');
      setTimeout(() => setCopiedCode(false), 2500);
    } catch (_) {
      triggerToast('Gagal menyalin kode.', 'error');
    }
  };

  const handleLogoutSession = () => {
    clearQrWatchdog();
    if (socketRef.current) {
      socketRef.current.emit('logout-session', { sessionId });
    }
    setConnectionStatus('disconnected');
    setQrCodeDataUrl(null);
    setPairingCode('');
    setConnectedPhone(null);
    setBackendError(null);
    triggerToast('Sesi WhatsApp berhasil diputuskan.', 'info');
  };

  // Ubah Mode Pemantauan (Semua Nomor vs Kunci 1 Target)
  const handleChangeMonitorMode = (newMode) => {
    setMonitorMode(newMode);
    localStorage.setItem(STORAGE_MONITOR_MODE, newMode);
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('set-monitor-mode', { sessionId, monitorMode: newMode });
    }
    triggerToast(
      newMode === 'all'
        ? 'Mode diubah: Memantau semua kontak WhatsApp.'
        : 'Mode diubah: Memantau target terkunci.',
      'info'
    );
  };

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
        targetNumber: normalized,
        confirmedLids
      });
    }

    triggerToast(`Nomor target +${normalized} berhasil dikunci!`, 'success');
  };

  const handleUnlockTarget = () => {
    setLockedTarget(null);
    localStorage.removeItem(STORAGE_LOCKED_TARGET);
    setConfirmedLids([]);
    localStorage.removeItem(STORAGE_CONFIRMED_LIDS);
    setUnmappedLidAlert(null);

    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('set-target', {
        sessionId,
        targetNumber: null,
        confirmedLids: []
      });
    }

    triggerToast('Target dibuka. Silakan masukkan nomor target baru.', 'info');
  };

  const handleConfirmTargetLid = () => {
    if (!unmappedLidAlert) return;
    const lid = unmappedLidAlert.lid;
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('confirm-target-lid', { sessionId, lid });
    }
    const updated = Array.from(new Set([...confirmedLids, lid]));
    setConfirmedLids(updated);
    localStorage.setItem(STORAGE_CONFIRMED_LIDS, JSON.stringify(updated));
    setUnmappedLidAlert(null);
    triggerToast('ID kontak WhatsApp berhasil diikat ke nomor target!', 'success');
  };

  const handleDismissUnmappedLid = () => {
    if (!unmappedLidAlert) return;
    const lid = unmappedLidAlert.lid;
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('dismiss-unmapped-lid', { sessionId, lid });
    }
    setUnmappedLidAlert(null);
    triggerToast('Pesan diabaikan.', 'info');
  };

  // Unduh Item (Foto, Video, Audio, Dokumen)
  const handleDownloadItem = (item) => {
    try {
      if (!item.base64Data) {
        triggerToast('Item ini tidak memuat file media.', 'info');
        return;
      }
      const ext =
        item.mediaType === 'video'
          ? 'mp4'
          : item.mediaType === 'audio'
          ? 'mp3'
          : item.mediaType === 'sticker'
          ? 'webp'
          : item.mediaType === 'document'
          ? item.fileName?.split('.').pop() || 'bin'
          : 'jpg';

      const cleanSender = safeText(item.senderNumber) || 'kontak';
      const cleanId = safeText(item.id) || Date.now();
      const prefix = item.isViewOnce
        ? 'ViewOnce'
        : item.category === 'status'
        ? 'StatusWA'
        : 'ChatWA';

      const filename = `${prefix}_${cleanSender}_${cleanId}.${ext}`;
      downloadBase64File(item.base64Data, filename, item.mimeType);
      triggerToast('Mengunduh media...', 'success');
    } catch (err) {
      triggerToast('Gagal mengunduh media.', 'error');
    }
  };

  // Salin Teks ke Clipboard
  const handleCopyText = (text, id) => {
    if (!text) return;
    try {
      navigator.clipboard.writeText(text);
      setCopiedItemId(id);
      triggerToast('Teks berhasil disalin!', 'success');
      setTimeout(() => setCopiedItemId(null), 2000);
    } catch (_) {
      triggerToast('Gagal menyalin teks.', 'error');
    }
  };

  // Hapus Satu Item
  const handleDeleteItem = async (id) => {
    try {
      await deleteMediaById(id);
      setMediaList((prev) => prev.filter((item) => item.id !== id));
      triggerToast('Item berhasil dihapus.', 'info');
    } catch (err) {
      triggerToast('Gagal menghapus item.', 'error');
    }
  };

  // Hitung jumlah item per tab secara real-time
  const counts = useMemo(() => {
    let vo = 0;
    let gr = 0;
    let ad = 0;
    let sw = 0;

    for (const it of mediaList) {
      if (it.isViewOnce) vo++;
      if (it.category === 'chat') gr++;
      if (it.isDeleted || it.isEdited) ad++;
      if (it.category === 'status') sw++;
    }

    return { vo, gr, ad, sw };
  }, [mediaList]);

  // Filter daftar item berdasarkan tab aktif & sub-filter & pencarian
  const filteredItems = useMemo(() => {
    let list = [];

    if (activeTab === 'view_once') {
      list = mediaList.filter((it) => it.isViewOnce === true);
      if (subFilter === 'image') list = list.filter((it) => it.mediaType === 'image');
      if (subFilter === 'video') list = list.filter((it) => it.mediaType === 'video');
      if (subFilter === 'audio') list = list.filter((it) => it.mediaType === 'audio');
    } else if (activeTab === 'ghost_reader') {
      list = mediaList.filter((it) => it.category === 'chat');
      if (subFilter === 'text') list = list.filter((it) => it.mediaType === 'text');
      if (subFilter === 'image') list = list.filter((it) => it.mediaType === 'image');
      if (subFilter === 'video') list = list.filter((it) => it.mediaType === 'video');
      if (subFilter === 'audio') list = list.filter((it) => it.mediaType === 'audio');
      if (subFilter === 'doc') list = list.filter((it) => it.mediaType === 'document' || it.mediaType === 'sticker');
    } else if (activeTab === 'anti_delete') {
      list = mediaList.filter((it) => it.isDeleted === true || it.isEdited === true);
      if (subFilter === 'deleted') list = list.filter((it) => it.isDeleted === true);
      if (subFilter === 'edited') list = list.filter((it) => it.isEdited === true);
    } else if (activeTab === 'status_saver') {
      list = mediaList.filter((it) => it.category === 'status');
      if (subFilter === 'image') list = list.filter((it) => it.mediaType === 'image');
      if (subFilter === 'video') list = list.filter((it) => it.mediaType === 'video');
      if (subFilter === 'text') list = list.filter((it) => it.mediaType === 'text');
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (it) =>
          safeText(it.senderName).toLowerCase().includes(q) ||
          safeText(it.senderNumber).includes(q) ||
          safeText(it.textContent).toLowerCase().includes(q) ||
          safeText(it.caption).toLowerCase().includes(q) ||
          safeText(it.fileName).toLowerCase().includes(q)
      );
    }

    return list;
  }, [mediaList, activeTab, subFilter, searchQuery]);

  // Eksekusi pembersihan item tab saat ini
  const handleExecuteClearTab = async (tabKey) => {
    try {
      if (tabKey === 'all') {
        await clearAllMedia();
        setMediaList([]);
        triggerToast('Seluruh data vault berhasil dibersihkan.', 'info');
      } else {
        const idsToDelete = filteredItems.map((it) => it.id);
        await deleteMediaByIds(idsToDelete);
        setMediaList((prev) => prev.filter((it) => !idsToDelete.includes(it.id)));
        triggerToast('Item pada tab ini berhasil dibersihkan.', 'info');
      }
      setConfirmClearTab(null);
    } catch (err) {
      triggerToast('Gagal membersihkan item.', 'error');
    }
  };

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
                WA Stealth &amp; View Once Vault
              </h1>
              <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                <span className="inline-block px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-black rounded text-[10px] font-black uppercase">
                  GHOST MODE • 0 CENTANG BIRU
                </span>
                <span className="inline-block px-2 py-0.5 bg-neutral-100 text-neutral-800 border border-black rounded text-[10px] font-black uppercase">
                  ZERO-DISK INDEXEDDB
                </span>
              </div>
            </div>
          </div>
          <p className="text-xs md:text-sm text-neutral-700 max-w-2xl leading-relaxed">
            Platform 4-in-1: Tangkap media Sekali Lihat (View Once), baca chat pribadi tanpa centang biru (Ghost Reader),
            cegah pesan ditarik/diedit (Anti-Delete), dan amankan Status WA kontak tanpa terlihat (0 view).
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
            {connectionStatus === 'pairing_ready' && (
              <span className="px-2.5 py-1 bg-emerald-300 text-black border-2 border-black rounded-lg text-xs font-black shadow-[2px_2px_0px_#000] flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-black animate-pulse" />
                Kode Pairing Siap
              </span>
            )}
            {connectionStatus === 'qr_ready' && (
              <span className="px-2.5 py-1 bg-amber-300 text-black border-2 border-black rounded-lg text-xs font-black shadow-[2px_2px_0px_#000] flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-black animate-pulse" />
                Menunggu Scan QR
              </span>
            )}
            {(connectionStatus === 'generating_qr' || qrGenerating) && (
              <span className="px-2.5 py-1 bg-amber-200 text-black border-2 border-black rounded-lg text-xs font-black shadow-[2px_2px_0px_#000] flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Membuat QR...
              </span>
            )}
            {connectionStatus === 'connecting' && !qrGenerating && (
              <span className="px-2.5 py-1 bg-blue-300 text-black border-2 border-black rounded-lg text-xs font-black shadow-[2px_2px_0px_#000] flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                {socketConnected ? 'Inisialisasi Sesi...' : 'Menghubungkan Server...'}
              </span>
            )}
            {connectionStatus === 'reconnecting' && (
              <span className="px-2.5 py-1 bg-yellow-300 text-black border-2 border-black rounded-lg text-xs font-black shadow-[2px_2px_0px_#000] flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Menyambung Ulang...
              </span>
            )}
            {connectionStatus === 'disconnected' && !qrGenerating && (
              <span className="px-2.5 py-1 bg-neutral-200 text-neutral-700 border-2 border-black rounded-lg text-xs font-bold shadow-[2px_2px_0px_#000]">
                {socketConnected ? 'Siap Ditautkan' : 'Terputus'}
              </span>
            )}
          </div>
          <span className="text-[10px] text-neutral-500 font-mono">
            Sesi ID: {safeText(sessionId).slice(0, 8)}...
          </span>
        </div>
      </div>

      {/* Banner Informasi Koneksi */}
      {backendError && (
        <div className="bg-amber-50 border-2 border-black rounded-xl p-4 shadow-[3px_3px_0px_#000] flex items-start gap-3 text-xs md:text-sm text-amber-900">
          <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">Informasi Koneksi Server:</p>
            <p className="text-amber-800 leading-relaxed">{safeText(backendError)}</p>
          </div>
        </div>
      )}

      {/* Grid 2 Kolom Panel Kontrol (Tautkan Perangkat & Cakupan Pemantauan) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Panel 1: Tautkan Perangkat WhatsApp (Kode Pairing & Scan QR) */}
        <div className="bg-white border-2 border-black rounded-xl p-5 shadow-[4px_4px_0px_#000] flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b-2 border-black pb-3">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-neutral-900" />
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

            {/* Jika Terhubung */}
            {connectionStatus === 'connected' ? (
              <div className="flex flex-col items-center justify-center py-6 px-4 bg-emerald-50 border-2 border-black rounded-xl text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-emerald-400 border-2 border-black flex items-center justify-center shadow-[2px_2px_0px_#000]">
                  <CheckCircle2 className="w-7 h-7 text-black" />
                </div>
                <h3 className="font-black text-sm text-neutral-900">Perangkat Berhasil Ditautkan!</h3>
                <p className="text-xs text-neutral-700 max-w-sm">
                  Ghost Mode Aktif: Memantau secara senyap tanpa centang biru dan tanpa ketahuan online.
                </p>
                <div className="pt-1 flex flex-wrap items-center justify-center gap-2">
                  <span className="px-2.5 py-0.5 bg-white border border-black rounded text-[11px] font-mono font-bold text-emerald-800 shadow-[1px_1px_0px_#000]">
                    Auto-Resume Aktif
                  </span>
                  <span className="px-2.5 py-0.5 bg-emerald-200 border border-black rounded text-[11px] font-bold text-emerald-900 shadow-[1px_1px_0px_#000]">
                    4 Fitur Stealth Aktif
                  </span>
                </div>
              </div>
            ) : (
              /* Jika Belum Terhubung: Tab Kode Pairing | Scan QR */
              <div className="space-y-3">
                <div className="flex border-2 border-black rounded-lg overflow-hidden text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => switchAuthMethod('pairing')}
                    className={`flex-1 py-1.5 px-2 text-center transition-colors flex items-center justify-center gap-1.5 ${
                      authMethod === 'pairing'
                        ? 'bg-black text-white font-black'
                        : 'bg-white text-neutral-700 hover:bg-neutral-100'
                    }`}
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>Kode Pairing</span>
                    <span className="text-[10px] bg-emerald-400 text-black px-1.5 py-0.2 rounded font-black tracking-tight">
                      Rekomendasi
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => switchAuthMethod('qr')}
                    className={`flex-1 py-1.5 px-2 text-center border-l-2 border-black transition-colors flex items-center justify-center gap-1.5 ${
                      authMethod === 'qr'
                        ? 'bg-black text-white font-black'
                        : 'bg-white text-neutral-700 hover:bg-neutral-100'
                    }`}
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    <span>Scan QR Code</span>
                  </button>
                </div>

                {/* Konten Tab Kode Pairing */}
                {authMethod === 'pairing' && (
                  <div className="space-y-3">
                    {connectionStatus === 'pairing_ready' && pairingCode ? (
                      <div className="flex flex-col items-center justify-center p-4 bg-emerald-50 border-2 border-black rounded-xl space-y-3">
                        <div className="text-center space-y-1 w-full">
                          <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800">
                            Kode Pairing WhatsApp Anda
                          </span>
                          <div className="p-3 bg-white border-2 border-black rounded-xl shadow-[3px_3px_0px_#000] flex items-center justify-center gap-3">
                            <span className="font-mono text-2xl md:text-3xl font-black tracking-widest text-neutral-900 select-all">
                              {pairingCode.length === 8
                                ? `${pairingCode.slice(0, 4)}-${pairingCode.slice(4)}`
                                : pairingCode}
                            </span>
                            <button
                              type="button"
                              onClick={handleCopyPairingCode}
                              className="px-2.5 py-1.5 bg-emerald-400 text-black border-2 border-black rounded-lg hover:bg-emerald-300 active:translate-x-[1px] active:translate-y-[1px] shadow-[1.5px_1.5px_0px_#000] font-black text-xs flex items-center gap-1"
                              title="Salin Kode"
                            >
                              {copiedCode ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-black" />
                                  <span>Tersalin!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5 text-black" />
                                  <span>Salin</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>

                        <div className="text-center space-y-1 w-full">
                          <p className="font-black text-xs text-neutral-900">Langkah di aplikasi WhatsApp HP Anda:</p>
                          <ol className="text-[11px] text-neutral-700 space-y-1 text-left list-decimal list-inside bg-white p-2.5 border border-black rounded leading-relaxed">
                            <li>Buka WhatsApp di HP Anda</li>
                            <li>Buka <b>Perangkat Tertaut</b> &gt; <b>Tautkan Perangkat</b></li>
                            <li>Pilih <b>Tautkan dengan nomor telepon saja</b> di bagian bawah</li>
                            <li>Masukkan kode 8 karakter di atas</li>
                          </ol>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="p-3 bg-neutral-50 border-2 border-black rounded-xl space-y-2">
                          <div className="space-y-0.5">
                            <label className="text-xs font-black text-neutral-900 flex items-center gap-1.5">
                              <Smartphone className="w-3.5 h-3.5 text-neutral-700" />
                              Nomor HP Akun WhatsApp Anda:
                            </label>
                            <p className="text-[11px] text-neutral-600">
                              Masukkan nomor WhatsApp yang sedang aktif di HP Anda untuk meminta kode tautan (8 digit).
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={pairingPhone}
                              onChange={(e) => setPairingPhone(e.target.value)}
                              placeholder="Contoh: 08123456789 atau 628xxx"
                              className="flex-1 px-3 py-2 bg-white border-2 border-black rounded-xl text-xs font-mono font-bold outline-none focus:ring-2 focus:ring-black"
                            />
                            <button
                              type="button"
                              onClick={() => handleStartSession('pairing')}
                              disabled={connectionStatus === 'connecting' && !socketConnected}
                              className="px-4 py-2 bg-emerald-400 text-black border-2 border-black rounded-xl font-black text-xs shadow-[2px_2px_0px_#000] hover:bg-emerald-300 active:translate-x-[1px] active:translate-y-[1px] flex items-center gap-1.5 shrink-0 disabled:opacity-50"
                            >
                              {connectionStatus === 'connecting' && !socketConnected ? (
                                <>
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                  <span>Meminta...</span>
                                </>
                              ) : (
                                <>
                                  <Smartphone className="w-3.5 h-3.5" />
                                  <span>Minta Kode</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>

                        <div className="p-2.5 bg-neutral-50 border-2 border-dashed border-neutral-300 rounded-xl text-center py-3 text-neutral-600 text-[11px] leading-relaxed">
                          <b>Tips:</b> Penautan via Kode Pairing lebih stabil, cepat, dan tidak mudah terputus dibandingkan scan kamera QR.
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Konten Tab Scan QR Code */}
                {authMethod === 'qr' && (
                  <div className="space-y-3">
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
                        <button
                          type="button"
                          onClick={() => handleStartSession('qr', true)}
                          className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 bg-white text-neutral-800 border-2 border-black rounded-lg text-xs font-bold shadow-[2px_2px_0px_#000] hover:bg-neutral-100 active:translate-x-[1px] active:translate-y-[1px]"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          Muat Ulang QR Baru
                        </button>
                      </div>
                    ) : qrWatchdogExpired ? (
                      <div className="p-5 bg-amber-50 border-2 border-black rounded-xl space-y-3 text-center">
                        <div className="flex items-center justify-center gap-2 text-amber-900 font-bold text-xs">
                          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                          <span>Pembuatan QR memakan waktu lebih lama dari biasanya.</span>
                        </div>
                        <p className="text-[11px] text-amber-800 leading-relaxed">
                          Server backend Render mungkin baru bangun. Silakan coba buat ulang sekarang.
                        </p>
                        <button
                          type="button"
                          onClick={() => handleStartSession('qr', true)}
                          className="px-4 py-2 bg-emerald-400 text-black border-2 border-black rounded-xl font-black text-xs shadow-[2px_2px_0px_#000] hover:bg-emerald-300 active:translate-x-[1px] active:translate-y-[1px] inline-flex items-center gap-1.5"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          Coba Buat QR Lagi
                        </button>
                      </div>
                    ) : qrGenerating || connectionStatus === 'generating_qr' ? (
                      <div className="flex flex-col items-center justify-center py-8 px-4 bg-neutral-50 border-2 border-dashed border-neutral-400 rounded-xl text-center space-y-3">
                        <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin" />
                        <div className="space-y-1">
                          <p className="font-black text-xs text-neutral-900">
                            {socketConnected
                              ? 'Membuat QR Code WhatsApp...'
                              : 'Membangunkan server backend Render (maks ~50 detik saat server tidur)...'}
                          </p>
                          <p className="text-[11px] text-neutral-500 max-w-xs">
                            {socketConnected
                              ? 'QR Code akan muncul dalam 1–2 detik.'
                              : 'Mohon tunggu sebentar, server sedang diaktifkan.'}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-6 px-4 bg-neutral-50 border-2 border-dashed border-neutral-300 rounded-xl text-center space-y-2">
                        <QrCode className="w-10 h-10 text-neutral-400" />
                        <p className="font-bold text-xs text-neutral-700">Scan QR Code WhatsApp</p>
                        <p className="text-[11px] text-neutral-500 max-w-xs">
                          Klik tombol di bawah untuk membuat QR Code penautan WhatsApp.
                        </p>
                        <button
                          type="button"
                          onClick={() => handleStartSession('qr')}
                          className="mt-2 py-2 px-4 bg-black text-white border-2 border-black rounded-xl font-black text-xs shadow-[3px_3px_0px_#22c55e] hover:bg-neutral-800 active:translate-x-[1px] active:translate-y-[1px] transition-all flex items-center justify-center gap-2"
                        >
                          <QrCode className="w-4 h-4" />
                          Mulai &amp; Buat QR Code
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Panel 2: Cakupan Pemantauan (Semua Nomor vs Kunci 1 Target) */}
        <div className="bg-white border-2 border-black rounded-xl p-5 shadow-[4px_4px_0px_#000] flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b-2 border-black pb-3">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-neutral-900" />
                <h2 className="font-black text-sm md:text-base uppercase tracking-tight">
                  Cakupan Pemantauan
                </h2>
              </div>
              <span className={`px-2 py-0.5 border border-black rounded text-[11px] font-black ${monitorMode === 'all' ? 'bg-cyan-200 text-black' : 'bg-emerald-300 text-black'}`}>
                {monitorMode === 'all' ? 'SEMUA NOMOR' : '1 NOMOR TERKUNCI'}
              </span>
            </div>

            {/* Segmented Mode Switcher */}
            <div className="flex border-2 border-black rounded-lg overflow-hidden text-xs font-bold">
              <button
                type="button"
                onClick={() => handleChangeMonitorMode('all')}
                className={`flex-1 py-1.5 px-2 text-center transition-colors flex items-center justify-center gap-1.5 ${
                  monitorMode === 'all'
                    ? 'bg-black text-white font-black'
                    : 'bg-white text-neutral-700 hover:bg-neutral-100'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Semua Nomor (Ghost All)</span>
              </button>
              <button
                type="button"
                onClick={() => handleChangeMonitorMode('single')}
                className={`flex-1 py-1.5 px-2 text-center border-l-2 border-black transition-colors flex items-center justify-center gap-1.5 ${
                  monitorMode === 'single'
                    ? 'bg-black text-white font-black'
                    : 'bg-white text-neutral-700 hover:bg-neutral-100'
                }`}
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Kunci 1 Target</span>
              </button>
            </div>

            {/* Mode Semua Nomor */}
            {monitorMode === 'all' ? (
              <div className="p-4 bg-cyan-50 border-2 border-black rounded-xl shadow-[3px_3px_0px_#000] space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-cyan-300 border-2 border-black flex items-center justify-center shadow-[1px_1px_0px_#000]">
                    <Users className="w-4 h-4 text-black" />
                  </div>
                  <div>
                    <h4 className="font-black text-xs text-neutral-900 uppercase">Memantau Seluruh Kontak</h4>
                    <p className="text-[11px] text-neutral-600">
                      Semua chat masuk, View Once, pesan ditarik, dan Status WA dari seluruh kontak tersimpan di sini.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              /* Mode Kunci 1 Target */
              <div className="space-y-3">
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
                  </div>
                ) : (
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
                        Kunci
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>

          <div className="p-2.5 bg-blue-50 border border-black rounded-lg flex items-start gap-2 text-[11px] text-blue-900">
            <Info className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
            <span>
              <b>Ghost Mode:</b> Pesan yang masuk di sini tidak akan terkirim centang biru (read receipt) ke pengirim.
            </span>
          </div>
        </div>

      </div>

      {/* Kontainer Bawah: 4-in-1 Vault Tabs */}
      <div className="bg-white border-2 border-black rounded-xl p-5 md:p-6 shadow-[4px_4px_0px_#000] space-y-4">
        
        {/* Header Tabs 4-in-1 Utama */}
        <div className="flex flex-col gap-3 border-b-2 border-black pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* 4 Tombol Tab Utama */}
            <div className="flex flex-wrap gap-2 text-xs font-black">
              {/* Tab 1: View Once */}
              <button
                type="button"
                onClick={() => {
                  setActiveTab('view_once');
                  setSubFilter('all');
                }}
                className={`px-3.5 py-2 rounded-xl border-2 border-black flex items-center gap-1.5 transition-all shadow-[2px_2px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] ${
                  activeTab === 'view_once'
                    ? 'bg-amber-300 text-black'
                    : 'bg-white text-neutral-700 hover:bg-neutral-100'
                }`}
              >
                <Eye className="w-4 h-4" />
                <span>Media 1x Lihat</span>
                <span className="px-1.5 py-0.2 bg-black text-white rounded text-[10px] font-mono">
                  {counts.vo}
                </span>
              </button>

              {/* Tab 2: Ghost Reader */}
              <button
                type="button"
                onClick={() => {
                  setActiveTab('ghost_reader');
                  setSubFilter('all');
                }}
                className={`px-3.5 py-2 rounded-xl border-2 border-black flex items-center gap-1.5 transition-all shadow-[2px_2px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] ${
                  activeTab === 'ghost_reader'
                    ? 'bg-emerald-300 text-black'
                    : 'bg-white text-neutral-700 hover:bg-neutral-100'
                }`}
              >
                <MessageSquare className="w-4 h-4" />
                <span>Ghost Reader</span>
                <span className="px-1.5 py-0.2 bg-black text-white rounded text-[10px] font-mono">
                  {counts.gr}
                </span>
              </button>

              {/* Tab 3: Anti-Delete */}
              <button
                type="button"
                onClick={() => {
                  setActiveTab('anti_delete');
                  setSubFilter('all');
                }}
                className={`px-3.5 py-2 rounded-xl border-2 border-black flex items-center gap-1.5 transition-all shadow-[2px_2px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] ${
                  activeTab === 'anti_delete'
                    ? 'bg-rose-400 text-white'
                    : 'bg-white text-neutral-700 hover:bg-neutral-100'
                }`}
              >
                <ShieldAlert className="w-4 h-4" />
                <span>Anti-Delete &amp; Edit</span>
                <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${counts.ad > 0 ? 'bg-rose-600 text-white animate-pulse' : 'bg-black text-white'}`}>
                  {counts.ad}
                </span>
              </button>

              {/* Tab 4: Silent Status Saver */}
              <button
                type="button"
                onClick={() => {
                  setActiveTab('status_saver');
                  setSubFilter('all');
                }}
                className={`px-3.5 py-2 rounded-xl border-2 border-black flex items-center gap-1.5 transition-all shadow-[2px_2px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] ${
                  activeTab === 'status_saver'
                    ? 'bg-cyan-300 text-black'
                    : 'bg-white text-neutral-700 hover:bg-neutral-100'
                }`}
              >
                <Radio className="w-4 h-4" />
                <span>Silent Status (SW)</span>
                <span className="px-1.5 py-0.2 bg-black text-white rounded text-[10px] font-mono">
                  {counts.sw}
                </span>
              </button>
            </div>

            {/* Tombol Bersihkan Tab Ini */}
            {filteredItems.length > 0 && (
              <button
                type="button"
                onClick={() => setConfirmClearTab(activeTab)}
                className="px-3 py-1.5 bg-rose-100 text-rose-800 border-2 border-black rounded-lg text-xs font-black shadow-[2px_2px_0px_#000] hover:bg-rose-200 active:translate-x-[1px] active:translate-y-[1px] flex items-center gap-1.5 shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Bersihkan Tab Ini
              </button>
            )}
          </div>

          {/* Sub-Filters & Search Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
            {/* Sub-Filters per Tab */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
              {activeTab === 'view_once' && (
                <>
                  {['all', 'image', 'video', 'audio'].map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setSubFilter(f)}
                      className={`px-2.5 py-1 rounded-lg border border-black ${
                        subFilter === f ? 'bg-black text-white font-black' : 'bg-white text-neutral-700 hover:bg-neutral-100'
                      }`}
                    >
                      {f === 'all' ? 'Semua' : f === 'image' ? 'Foto' : f === 'video' ? 'Video' : 'Audio'}
                    </button>
                  ))}
                </>
              )}

              {activeTab === 'ghost_reader' && (
                <>
                  {['all', 'text', 'image', 'video', 'audio', 'doc'].map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setSubFilter(f)}
                      className={`px-2.5 py-1 rounded-lg border border-black ${
                        subFilter === f ? 'bg-black text-white font-black' : 'bg-white text-neutral-700 hover:bg-neutral-100'
                      }`}
                    >
                      {f === 'all'
                        ? 'Semua'
                        : f === 'text'
                        ? 'Teks'
                        : f === 'image'
                        ? 'Foto'
                        : f === 'video'
                        ? 'Video'
                        : f === 'audio'
                        ? 'Audio/VN'
                        : 'File/Stiker'}
                    </button>
                  ))}
                </>
              )}

              {activeTab === 'anti_delete' && (
                <>
                  {['all', 'deleted', 'edited'].map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setSubFilter(f)}
                      className={`px-2.5 py-1 rounded-lg border border-black ${
                        subFilter === f ? 'bg-black text-white font-black' : 'bg-white text-neutral-700 hover:bg-neutral-100'
                      }`}
                    >
                      {f === 'all' ? 'Semua' : f === 'deleted' ? 'Dihapus' : 'Diedit'}
                    </button>
                  ))}
                </>
              )}

              {activeTab === 'status_saver' && (
                <>
                  {['all', 'image', 'video', 'text'].map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setSubFilter(f)}
                      className={`px-2.5 py-1 rounded-lg border border-black ${
                        subFilter === f ? 'bg-black text-white font-black' : 'bg-white text-neutral-700 hover:bg-neutral-100'
                      }`}
                    >
                      {f === 'all' ? 'Semua SW' : f === 'image' ? 'Foto' : f === 'video' ? 'Video' : 'Teks'}
                    </button>
                  ))}
                </>
              )}
            </div>

            {/* Kolom Pencarian */}
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari pengirim / teks..."
                className="w-full pl-8 pr-3 py-1.5 bg-neutral-50 border-2 border-black rounded-lg text-xs font-bold outline-none focus:bg-white focus:ring-1 focus:ring-black"
              />
            </div>
          </div>
        </div>

        {/* Baris Status Aktivitas Real-Time */}
        <div className="flex items-center gap-2 px-3 py-2 bg-neutral-100 border-2 border-black rounded-lg text-xs font-mono shadow-[2px_2px_0px_#000] text-neutral-800">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              vaultActivity
                ? 'bg-emerald-500 animate-ping'
                : connectionStatus === 'connected'
                ? 'bg-emerald-500'
                : socketConnected
                ? 'bg-emerald-400'
                : 'bg-amber-500 animate-pulse'
            }`}
          />
          <Activity className="w-3.5 h-3.5 text-neutral-700 shrink-0" />
          {vaultActivity && (
            <span className="font-bold text-neutral-500 shrink-0">
              {new Date(vaultActivity.time).toLocaleTimeString('id-ID', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
              })}
              :
            </span>
          )}
          <span className="truncate font-semibold">
            {vaultActivity && safeText(vaultActivity.text)
              ? safeText(vaultActivity.text)
              : connectionStatus === 'connected'
              ? 'Ghost Mode Aktif: Memantau pesan sekali lihat, chat pribadi, anti-delete, dan status WhatsApp.'
              : socketConnected
              ? 'Terhubung ke server. Silakan tautkan perangkat WhatsApp Anda.'
              : 'Menghubungkan ke backend server WhatsApp...'}
          </span>
        </div>

        {/* Tip Khusus per Tab */}
        {activeTab === 'view_once' && (
          <div className="flex items-start gap-2.5 px-3.5 py-2.5 bg-amber-50 border-2 border-black rounded-lg text-xs shadow-[2px_2px_0px_#000] text-amber-950">
            <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <span className="font-semibold leading-relaxed">
              <b className="font-black text-black">Tip Media Sekali Lihat:</b> Media tertangkap otomatis pada detik ke-0 tanpa perlu dibuka di HP. Jika ditahan oleh HP Anda, cukup balas (reply) pesan View Once tersebut dari HP dengan chat biasa tanpa membukanya.
            </span>
          </div>
        )}

        {activeTab === 'ghost_reader' && (
          <div className="flex items-start gap-2.5 px-3.5 py-2.5 bg-emerald-50 border-2 border-black rounded-lg text-xs shadow-[2px_2px_0px_#000] text-emerald-950">
            <Info className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
            <span className="font-semibold leading-relaxed">
              <b className="font-black text-black">Tip Ghost Reader:</b> Semua pesan teks, foto, video, VN, dan dokumen masuk diamankan di sini tanpa memicu centang biru (read receipt) dan akun Anda tidak dipaksa Online.
            </span>
          </div>
        )}

        {activeTab === 'anti_delete' && (
          <div className="flex items-start gap-2.5 px-3.5 py-2.5 bg-rose-50 border-2 border-black rounded-lg text-xs shadow-[2px_2px_0px_#000] text-rose-950">
            <ShieldAlert className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
            <span className="font-semibold leading-relaxed">
              <b className="font-black text-black">Anti-Delete &amp; Anti-Edit Aktif:</b> Jika pengirim menarik/menghapus pesan untuk semua orang atau mengedit teks, salinan aslinya tetap tersimpan utuh di sini lengkap dengan perbandingan teks sebelum &amp; sesudah diedit.
            </span>
          </div>
        )}

        {activeTab === 'status_saver' && (
          <div className="flex items-start gap-2.5 px-3.5 py-2.5 bg-cyan-50 border-2 border-black rounded-lg text-xs shadow-[2px_2px_0px_#000] text-cyan-950">
            <Radio className="w-4 h-4 text-cyan-700 shrink-0 mt-0.5" />
            <span className="font-semibold leading-relaxed">
              <b className="font-black text-black">Silent Status Saver (0 View):</b> Seluruh Story / Status WhatsApp foto, video, dan teks dari kontak diamankan otomatis tanpa nomor Anda masuk ke daftar penonton story mereka.
            </span>
          </div>
        )}

        {/* Dialog Konfirmasi Hapus Tab Inline */}
        {confirmClearTab && (
          <div className="p-4 bg-rose-50 border-2 border-rose-500 rounded-xl space-y-2 shadow-[3px_3px_0px_#000] animate-in fade-in duration-200">
            <div className="flex items-center gap-2 text-rose-900 font-bold text-xs md:text-sm">
              <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0" />
              Yakin ingin membersihkan item pada tab ini ({filteredItems.length} item)?
            </div>
            <p className="text-xs text-rose-700">Item yang tersimpan di IndexedDB browser Anda untuk tab ini akan dihapus permanen.</p>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleExecuteClearTab(confirmClearTab)}
                className="px-3.5 py-1.5 bg-rose-600 text-white border-2 border-black rounded-lg font-black text-xs hover:bg-rose-700 shadow-[2px_2px_0px_#000]"
              >
                Ya, Hapus Item Tab Ini
              </button>
              <button
                type="button"
                onClick={() => setConfirmClearTab(null)}
                className="px-3 py-1.5 bg-white text-black border-2 border-black rounded-lg font-bold text-xs hover:bg-neutral-100 shadow-[2px_2px_0px_#000]"
              >
                Batal
              </button>
            </div>
          </div>
        )}

        {/* Alert 1-Klik untuk ID Kontak Tersembunyi */}
        {unmappedLidAlert && (
          <div className="bg-amber-100 border-2 border-black rounded-xl p-4 shadow-[4px_4px_0px_#000] space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-400 border-2 border-black flex items-center justify-center shrink-0 shadow-[2px_2px_0px_#000]">
                <ShieldAlert className="w-5 h-5 text-black" />
              </div>
              <div className="space-y-1 text-xs md:text-sm text-neutral-900">
                <p className="font-black uppercase tracking-tight">
                  Pesan Masuk Dari ID Kontak Tersembunyi (@lid)
                </p>
                <p className="text-neutral-700 leading-relaxed text-xs">
                  Pesan masuk dari: <b>{safeText(unmappedLidAlert.pushName)}</b> (<span className="font-mono text-[11px] font-bold">{safeText(unmappedLidAlert.lid)}</span>). Apakah ini target Anda?
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1 sm:pl-12">
              <button
                onClick={handleConfirmTargetLid}
                className="px-4 py-2 bg-emerald-400 text-black border-2 border-black rounded-xl font-black text-xs shadow-[2px_2px_0px_#000] hover:bg-emerald-300 active:translate-x-[1px] active:translate-y-[1px] transition-all flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                Ya, Ikat ke Target
              </button>
              <button
                onClick={handleDismissUnmappedLid}
                className="px-3.5 py-2 bg-white text-neutral-700 border-2 border-black rounded-xl font-bold text-xs shadow-[2px_2px_0px_#000] hover:bg-neutral-100 active:translate-x-[1px] active:translate-y-[1px] transition-all"
              >
                Bukan Target (Abaikan)
              </button>
            </div>
          </div>
        )}

        {/* GRID KARTU KONTEN VAULT */}
        {filteredItems.length === 0 ? (
          <div className="py-14 flex flex-col items-center justify-center text-center space-y-2">
            <div className="w-12 h-12 rounded-xl bg-neutral-100 border-2 border-black flex items-center justify-center shadow-[2px_2px_0px_#000]">
              <Eye className="w-6 h-6 text-neutral-400" />
            </div>
            <h3 className="font-bold text-sm text-neutral-800">Belum ada item di tab ini</h3>
            <p className="text-xs text-neutral-500 max-w-sm">
              {activeTab === 'view_once'
                ? 'Foto atau video sekali lihat yang masuk akan otomatis tertangkap dan muncul di sini.'
                : activeTab === 'ghost_reader'
                ? 'Chat pribadi masuk akan tersimpan di sini tanpa memicu centang biru.'
                : activeTab === 'anti_delete'
                ? 'Pesan yang dihapus atau diedit oleh pengirim akan otomatis tercatat di sini.'
                : 'Status WhatsApp dari kontak akan diamankan secara senyap (0 view) di sini.'}
            </p>
          </div>
        ) : activeTab === 'status_saver' ? (
          /* Grid Khusus Story / Status WhatsApp (1 Kolom Mobile, 2–3 Kolom Desktop) */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                className={`bg-white border-2 rounded-xl p-3 shadow-[3px_3px_0px_#000] flex flex-col justify-between space-y-3 ${
                  item.isDeleted ? 'border-rose-500 bg-rose-50/20' : 'border-black'
                }`}
              >
                {/* Header Status SW */}
                <div className="flex items-center justify-between gap-2 border-b-2 border-black pb-2">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-cyan-200 text-black border-2 border-black rounded-lg text-xs font-black shadow-[1.5px_1.5px_0px_#000] truncate max-w-[210px]">
                    <Radio className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{safeText(item.senderName) || `+${safeText(item.senderNumber)}`}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {item.isDeleted && (
                      <span className="px-1.5 py-0.5 bg-rose-500 text-white border border-black rounded text-[9px] font-black uppercase">
                        DIHAPUS
                      </span>
                    )}
                    <span className="px-1.5 py-0.5 bg-emerald-200 text-emerald-950 border border-black rounded text-[10px] font-black uppercase">
                      0 View
                    </span>
                  </div>
                </div>

                {/* Media Story */}
                <div className="relative rounded-lg overflow-hidden border-2 border-black aspect-video flex items-center justify-center bg-black">
                  {item.mediaType === 'video' ? (
                    <video
                      src={item.base64Data}
                      controls
                      playsInline
                      preload="metadata"
                      className="w-full h-full object-contain"
                    />
                  ) : item.mediaType === 'image' ? (
                    <img
                      src={item.base64Data}
                      alt={safeText(item.caption) || 'Status WA'}
                      loading="lazy"
                      className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform"
                      onClick={() => setPreviewMedia(item)}
                    />
                  ) : (
                    /* SW Teks dengan Warna Asli */
                    <div
                      style={{ backgroundColor: item.bgColor || '#1e293b' }}
                      className="w-full h-full p-4 flex items-center justify-center text-center overflow-auto"
                    >
                      <p className="font-black text-sm md:text-base text-white select-all break-words leading-relaxed">
                        {safeText(item.textContent)}
                      </p>
                    </div>
                  )}
                </div>

                {/* Metadata Waktu & Caption */}
                <div className="space-y-1.5 text-xs bg-neutral-50 p-2 border border-black rounded-lg">
                  <div className="flex items-center gap-1.5 font-bold text-neutral-700 text-[11px]">
                    <Clock className="w-3.5 h-3.5 shrink-0 text-neutral-500" />
                    <span>Upload SW: {formatWaDate(item.sentAt)}</span>
                  </div>
                  {safeText(item.caption) && (
                    <p className="text-[11px] text-neutral-800 italic pt-1 border-t border-neutral-200">
                      "{safeText(item.caption)}"
                    </p>
                  )}
                </div>

                {/* Tombol Aksi SW */}
                <div className="flex items-center gap-2 pt-2 border-t-2 border-black">
                  {item.mediaType === 'text' ? (
                    <button
                      type="button"
                      onClick={() => handleCopyText(item.textContent, item.id)}
                      className="flex-1 py-1.5 px-3 bg-cyan-300 text-black border-2 border-black rounded-lg font-black text-xs shadow-[2px_2px_0px_#000] hover:bg-cyan-200 active:translate-x-[1px] active:translate-y-[1px] flex items-center justify-center gap-1.5"
                    >
                      {copiedItemId === item.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      Salin Teks SW
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleDownloadItem(item)}
                      className="flex-1 py-1.5 px-3 bg-emerald-400 text-black border-2 border-black rounded-lg font-black text-xs shadow-[2px_2px_0px_#000] hover:bg-emerald-300 active:translate-x-[1px] active:translate-y-[1px] flex items-center justify-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Unduh SW
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDeleteItem(item.id)}
                    className="p-1.5 bg-rose-100 text-rose-700 border-2 border-black rounded-lg hover:bg-rose-200 active:translate-x-[1px] active:translate-y-[1px] shadow-[1.5px_1.5px_0px_#000]"
                    title="Hapus dari Vault"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Grid Kartu Chat, View Once, & Anti-Delete */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                className={`bg-white border-2 rounded-xl p-3 shadow-[3px_3px_0px_#000] flex flex-col justify-between space-y-3 ${
                  item.isDeleted ? 'border-rose-500 bg-rose-50/20' : 'border-black'
                }`}
              >
                {/* Header Kartu: Pengirim & Tipe Media */}
                <div className="flex items-center justify-between gap-2 border-b-2 border-black pb-2">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-300 text-black border-2 border-black rounded-lg text-xs font-black shadow-[1.5px_1.5px_0px_#000] truncate max-w-[210px]">
                    <Smartphone className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">
                      {safeText(item.senderName) || `+${safeText(item.senderNumber)}`}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {/* Badge View Once Emas */}
                    {item.isViewOnce && (
                      <span className="px-1.5 py-0.5 bg-amber-400 text-black border border-black rounded text-[10px] font-black uppercase tracking-wider">
                        1x LIHAT
                      </span>
                    )}

                    {/* Badge Anti-Delete Merah */}
                    {item.isDeleted && (
                      <span className="px-1.5 py-0.5 bg-rose-600 text-white border border-black rounded text-[10px] font-black uppercase tracking-wider">
                        DIHAPUS
                      </span>
                    )}

                    {/* Badge Anti-Edit Amber */}
                    {item.isEdited && (
                      <span className="px-1.5 py-0.5 bg-amber-400 text-black border border-black rounded text-[10px] font-black uppercase tracking-wider">
                        DIEDIT
                      </span>
                    )}

                    {/* Badge Jenis Media */}
                    <span
                      className={`px-2 py-0.5 border-2 border-black rounded text-[10px] font-black uppercase tracking-wider shadow-[1px_1px_0px_#000] flex items-center gap-1 ${
                        item.mediaType === 'video'
                          ? 'bg-purple-200 text-purple-900'
                          : item.mediaType === 'audio'
                          ? 'bg-emerald-200 text-emerald-950'
                          : item.mediaType === 'text'
                          ? 'bg-neutral-200 text-neutral-800'
                          : item.mediaType === 'sticker'
                          ? 'bg-pink-200 text-pink-900'
                          : item.mediaType === 'document'
                          ? 'bg-blue-200 text-blue-900'
                          : 'bg-cyan-200 text-cyan-900'
                      }`}
                    >
                      {item.mediaType === 'video' ? (
                        <>
                          <Film className="w-3 h-3" /> VIDEO
                        </>
                      ) : item.mediaType === 'audio' ? (
                        <>
                          <Radio className="w-3 h-3" /> {item.isVoiceNote ? 'VOICE NOTE' : 'AUDIO'}
                        </>
                      ) : item.mediaType === 'text' ? (
                        <>
                          <MessageSquare className="w-3 h-3" /> TEKS
                        </>
                      ) : item.mediaType === 'document' ? (
                        <>
                          <FileText className="w-3 h-3" /> DOKUMEN
                        </>
                      ) : (
                        <>
                          <ImageIcon className="w-3 h-3" /> FOTO
                        </>
                      )}
                    </span>
                  </div>
                </div>

                {/* Konten Media / Bubble Pesan */}
                <div className="space-y-2">
                  {/* Foto atau Stiker */}
                  {(item.mediaType === 'image' || item.mediaType === 'sticker') && item.base64Data && (
                    <div className="relative rounded-lg overflow-hidden border-2 border-black bg-black aspect-video flex items-center justify-center">
                      <img
                        src={item.base64Data}
                        alt="Media Vault"
                        loading="lazy"
                        className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform"
                        onClick={() => setPreviewMedia(item)}
                      />
                    </div>
                  )}

                  {/* Video */}
                  {item.mediaType === 'video' && item.base64Data && (
                    <div className="relative rounded-lg overflow-hidden border-2 border-black bg-black aspect-video flex items-center justify-center">
                      <video
                        src={item.base64Data}
                        controls
                        playsInline
                        preload="metadata"
                        className="w-full h-full object-contain"
                      />
                    </div>
                  )}

                  {/* Audio / Voice Note */}
                  {item.mediaType === 'audio' && item.base64Data && (
                    <div className="p-2 bg-neutral-100 border-2 border-black rounded-lg">
                      <audio src={item.base64Data} controls className="w-full h-9" />
                    </div>
                  )}

                  {/* Dokumen */}
                  {item.mediaType === 'document' && (
                    <div className="p-3 bg-neutral-50 border-2 border-black rounded-lg flex items-center gap-2.5">
                      <FileText className="w-6 h-6 text-blue-600 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-xs truncate text-neutral-900">{safeText(item.fileName) || 'Dokumen'}</p>
                        <p className="text-[10px] text-neutral-500 font-mono">
                          {item.fileSize ? `${(item.fileSize / 1024).toFixed(1)} KB` : 'Dokumen'}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Pesan Teks Normal */}
                  {item.mediaType === 'text' && !item.isEdited && (
                    <div className="p-3 bg-neutral-50 border-2 border-black rounded-lg text-xs leading-relaxed text-neutral-900 select-all font-semibold">
                      {safeText(item.textContent)}
                    </div>
                  )}

                  {/* Perbandingan Pesan Diedit (Anti-Edit) */}
                  {item.isEdited && (
                    <div className="space-y-1.5 text-xs">
                      <div className="p-2 bg-rose-50 border border-rose-300 rounded text-rose-950">
                        <span className="text-[10px] uppercase font-black text-rose-800 block">Pesan Asli:</span>
                        <p className="line-through opacity-80">{safeText(item.textContent) || '-'}</p>
                      </div>
                      <div className="p-2 bg-emerald-50 border border-emerald-300 rounded text-emerald-950 font-bold">
                        <span className="text-[10px] uppercase font-black text-emerald-800 block">Setelah Diedit:</span>
                        <p>{safeText(item.editedText)}</p>
                      </div>
                    </div>
                  )}

                  {/* Peringatan Pesan Dihapus Pengirim (Anti-Delete) */}
                  {item.isDeleted && (
                    <div className="p-2 bg-rose-500 text-white border border-black rounded text-[11px] font-bold flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4 shrink-0" />
                      <span>Pesan ini telah ditarik/dihapus oleh pengirim!</span>
                    </div>
                  )}
                </div>

                {/* Metadata Jam & Caption */}
                <div className="space-y-1.5 text-xs bg-neutral-50 p-2 border border-black rounded-lg">
                  <div className="flex items-center gap-1.5 font-bold text-neutral-700 text-[11px]">
                    <Clock className="w-3.5 h-3.5 shrink-0 text-neutral-500" />
                    <span>Waktu Kirim WA: {formatWaDate(item.sentAt)}</span>
                  </div>
                  {safeText(item.caption) && (
                    <p className="text-[11px] text-neutral-800 italic pt-1 border-t border-neutral-200">
                      "{safeText(item.caption)}"
                    </p>
                  )}
                </div>

                {/* Tombol Aksi */}
                <div className="flex items-center gap-2 pt-2 border-t-2 border-black">
                  {item.mediaType === 'text' ? (
                    <button
                      type="button"
                      onClick={() => handleCopyText(item.isEdited ? item.editedText : item.textContent, item.id)}
                      className="flex-1 py-1.5 px-3 bg-neutral-200 text-black border-2 border-black rounded-lg font-black text-xs shadow-[2px_2px_0px_#000] hover:bg-neutral-300 active:translate-x-[1px] active:translate-y-[1px] flex items-center justify-center gap-1.5"
                    >
                      {copiedItemId === item.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      Salin Teks
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleDownloadItem(item)}
                      disabled={!item.base64Data}
                      className="flex-1 py-1.5 px-3 bg-emerald-400 text-black border-2 border-black rounded-lg font-black text-xs shadow-[2px_2px_0px_#000] hover:bg-emerald-300 active:translate-x-[1px] active:translate-y-[1px] flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Unduh
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDeleteItem(item.id)}
                    className="p-1.5 bg-rose-100 text-rose-700 border-2 border-black rounded-lg hover:bg-rose-200 active:translate-x-[1px] active:translate-y-[1px] shadow-[1.5px_1.5px_0px_#000]"
                    title="Hapus dari Vault"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>

      {/* Lightbox Modal Pratinjau Foto Penuh */}
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
                Pratinjau Media • {safeText(previewMedia.senderName) || `+${safeText(previewMedia.senderNumber)}`}
              </span>
              <button
                type="button"
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
                {formatWaDate(previewMedia.sentAt)}
              </span>
              <button
                type="button"
                onClick={() => handleDownloadItem(previewMedia)}
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
