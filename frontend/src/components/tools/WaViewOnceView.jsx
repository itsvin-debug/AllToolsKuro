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
  FileText,
  Mic,
  Copy,
  Check,
  Paperclip,
  MessageSquare,
  Edit3,
  Users,
  Radio,
  Search,
  Sparkles,
  X,
  Maximize2
} from 'lucide-react';
import {
  saveMediaItem,
  getAllMediaItems,
  deleteMediaById,
  deleteMediaByIds,
  clearAllMedia,
  updateMediaItem
} from '../../utils/waMediaDB';

const STORAGE_SESSION_ID = 'wa_vault_session_id';
const STORAGE_LOCKED_TARGET = 'wa_vault_locked_target';
const STORAGE_CONFIRMED_LIDS = 'wa_vault_confirmed_lids';
const STORAGE_MONITOR_MODE = 'wa_vault_monitor_mode';
const STORAGE_ACTIVE_TAB = 'wa_vault_active_tab';

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

// Format waktu pengiriman asli WhatsApp (23 Nov 2026 • 14:20 WIB)
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

// Format ukuran file (B, KB, MB)
function formatBytes(bytes) {
  const num = Number(bytes);
  if (!num || num <= 0) return '';
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / (1024 * 1024)).toFixed(1)} MB`;
}

// Helper unduh file Base64 via Blob (Stabil di browser desktop & WebView HP / APK)
function downloadBase64File(base64Data, fileName, mimeType) {
  if (!base64Data) return;
  try {
    const parts = base64Data.split(',');
    const mime = mimeType || (parts[0].match(/:(.*?);/) || [])[1] || 'application/octet-stream';
    const b64 = parts.length > 1 ? parts[1] : parts[0];
    const byteCharacters = atob(b64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: mime });
    const blobUrl = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = fileName || `WA_Vault_${Date.now()}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
    }, 15000);
  } catch (err) {
    console.error('Gagal mengunduh file via Blob:', err);
  }
}

// Normalisasi satu pintu untuk kontrak schema vault item
function normalizeVaultItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const now = Date.now();
  const rawId = safeText(raw.id);
  const rawText = safeText(raw.textContent || raw.text || raw.caption || '');
  const isPtt = Boolean(raw.isVoiceNote || raw.isPtt);
  const sentTime = Number(raw.sentAt || raw.timestamp) || now;

  return {
    id: rawId || `msg_${now}_${Math.random().toString(36).substring(2, 7)}`,
    category: raw.category === 'status' ? 'status' : 'chat',
    senderNumber: safeText(raw.senderNumber),
    senderName: safeText(raw.senderName) || 'Kontak WhatsApp',
    mediaType: safeText(raw.mediaType) || 'text',
    mimeType: safeText(raw.mimeType),
    caption: safeText(raw.caption),
    textContent: rawText,
    text: rawText,
    bgColor: raw.bgColor ? safeText(raw.bgColor) : null,
    fileName: safeText(raw.fileName),
    fileSize: Number(raw.fileSize) || 0,
    isPtt,
    isVoiceNote: isPtt,
    isViewOnce: Boolean(raw.isViewOnce),
    isDeleted: Boolean(raw.isDeleted),
    deletedAt: raw.deletedAt ? Number(raw.deletedAt) : null,
    isEdited: Boolean(raw.isEdited),
    editedText: safeText(raw.editedText),
    editedAt: raw.editedAt ? Number(raw.editedAt) : null,
    sentAt: sentTime,
    base64Data: typeof raw.base64Data === 'string' ? raw.base64Data : ''
  };
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

  // 2. Kunci 1 Target Aktif
  const [lockedTarget, setLockedTarget] = useState(() => {
    const saved = localStorage.getItem(STORAGE_LOCKED_TARGET);
    return saved ? normalizePhone(saved) : null;
  });
  const lockedTargetRef = useRef(lockedTarget);
  useEffect(() => {
    lockedTargetRef.current = lockedTarget;
  }, [lockedTarget]);

  // Mode Pemantauan: 'all' (Semua Kontak - Default) vs 'single' (Kunci 1 Target)
  const [monitorMode, setMonitorMode] = useState(() => {
    return localStorage.getItem(STORAGE_MONITOR_MODE) || 'all';
  });
  const monitorModeRef = useRef(monitorMode);
  useEffect(() => {
    monitorModeRef.current = monitorMode;
  }, [monitorMode]);

  // Tab Utama: 'chat' (Ghost Reader) | 'antidelete' (Anti-Delete & Edit) | 'status' (Silent Status SW)
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem(STORAGE_ACTIVE_TAB) || 'chat';
  });
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    localStorage.setItem(STORAGE_ACTIVE_TAB, tab);
  };

  const [inputTarget, setInputTarget] = useState('');
  const [authMethodTab, setAuthMethodTab] = useState('pairing'); // 'pairing' | 'qr'
  const [inputPairingPhone, setInputPairingPhone] = useState('');
  const [pairingCode, setPairingCode] = useState(null);
  const [isRequestingPairing, setIsRequestingPairing] = useState(false);
  const [copiedPairingCode, setCopiedPairingCode] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('connecting'); // disconnected | connecting | qr_ready | connected | reconnecting
  const [connectedPhone, setConnectedPhone] = useState(null);
  const [backendError, setBackendError] = useState(null);
  const [vaultActivity, setVaultActivity] = useState(null);
  const [confirmedLids, setConfirmedLids] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_CONFIRMED_LIDS);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // 3. Vault Pesan & Media Tersimpan di IndexedDB
  const [mediaList, setMediaList] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [subFilter, setSubFilter] = useState('all'); // Filter sekunder per tab
  const [previewMedia, setPreviewMedia] = useState(null);
  const [confirmClearTab, setConfirmClearTab] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  const socketRef = useRef(null);
  const backendUrl = import.meta.env.VITE_WA_BACKEND_URL || 'http://localhost:4000';

  useEffect(() => {
    loadSavedMedia();
    initSocketConnection();

    return () => {
      if (socketRef.current) {
        socketRef.current.off('connect');
        socketRef.current.off('connect_error');
        socketRef.current.off('session-status');
        socketRef.current.off('status');
        socketRef.current.off('pairing-code');
        socketRef.current.off('pairing-error');
        socketRef.current.off('monitor-mode-updated');
        socketRef.current.off('qr-code');
        socketRef.current.off('qr');
        socketRef.current.off('target-synced');
        socketRef.current.off('target-updated');
        socketRef.current.off('vault-item');
        socketRef.current.off('vault-item-update');
        socketRef.current.off('vault-item-revoked');
        socketRef.current.off('vault-item-edited');
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
      const sanitized = (items || [])
        .map((item) => normalizeVaultItem(item))
        .filter(Boolean);
      setMediaList(sanitized);
    } catch (err) {
      console.error('Gagal membaca data IndexedDB:', err);
    }
  }

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

    socket.on('connect', () => {
      setBackendError(null);
      const savedTarget = localStorage.getItem(STORAGE_LOCKED_TARGET);
      const savedMode = localStorage.getItem(STORAGE_MONITOR_MODE) || monitorModeRef.current;
      let savedLids = [];
      try {
        savedLids = JSON.parse(localStorage.getItem(STORAGE_CONFIRMED_LIDS)) || [];
      } catch (_) {}

      socket.emit('resume-session', {
        sessionId,
        targetNumber: savedTarget ? normalizePhone(savedTarget) : null,
        confirmedLids: savedLids,
        monitorMode: savedMode
      });
    });

    socket.on('connect_error', (err) => {
      console.warn('Socket connect error:', err?.message || err);
      setConnectionStatus('connecting');
      setBackendError(
        'Menghubungkan ke backend server WhatsApp... (jika backend Render sedang cold-start, proses membutuhkan waktu ~30 detik).'
      );
    });

    socket.on('session-status', (payload) => {
      const status = safeText(payload?.status) || 'connecting';
      const phone = safeText(payload?.phone);
      const reason = safeText(payload?.reason);
      const message = safeText(payload?.message);
      const targetNumber = safeText(payload?.targetNumber);
      const serverMode = safeText(payload?.monitorMode);
      const serverPairingCode = safeText(payload?.pairingCode);

      setConnectionStatus(status);

      if (serverPairingCode) {
        setPairingCode(serverPairingCode);
      }

      if (serverMode === 'all' || serverMode === 'single') {
        setMonitorMode(serverMode);
        localStorage.setItem(STORAGE_MONITOR_MODE, serverMode);
      }

      if (targetNumber && !lockedTargetRef.current) {
        const clean = normalizePhone(targetNumber);
        setLockedTarget(clean);
        localStorage.setItem(STORAGE_LOCKED_TARGET, clean);
      }

      if (status === 'connected') {
        setQrCodeDataUrl(null);
        setPairingCode(null);
        setIsRequestingPairing(false);
        setBackendError(null);
        if (phone) setConnectedPhone(phone);
        triggerToast('WhatsApp berhasil terhubung dalam Mode Siluman!', 'success');
      } else if (status === 'pairing_ready') {
        setConnectedPhone(null);
        setIsRequestingPairing(false);
      } else if (status === 'qr_ready') {
        setConnectedPhone(null);
      } else if (status === 'reconnecting') {
        setQrCodeDataUrl(null);
      } else if (status === 'disconnected') {
        setQrCodeDataUrl(null);
        setPairingCode(null);
        setIsRequestingPairing(false);
        setConnectedPhone(null);
        if (reason === 'logged_out' || message) {
          triggerToast(message || 'Sesi WhatsApp dikeluarkan dari perangkat.', 'info');
        }
      }
    });

    socket.on('pairing-code', (payload) => {
      const code = safeText(payload?.code || payload?.rawCode);
      if (code) {
        setPairingCode(code);
        setConnectionStatus('pairing_ready');
        setIsRequestingPairing(false);
        setBackendError(null);
        triggerToast(`Kode Sandi Pairing diterima: ${code}`, 'success');
      }
    });

    socket.on('pairing-error', (payload) => {
      const message = safeText(payload?.message) || 'Gagal membuat kode sandi.';
      setIsRequestingPairing(false);
      setBackendError(message);
      triggerToast(message, 'error');
    });

    socket.on('monitor-mode-updated', (payload) => {
      const serverMode = safeText(payload?.monitorMode);
      if (serverMode === 'all' || serverMode === 'single') {
        setMonitorMode(serverMode);
        localStorage.setItem(STORAGE_MONITOR_MODE, serverMode);
      }
    });

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

    socket.on('vault-activity', (data) => {
      if (data && typeof data === 'object') {
        setVaultActivity({
          time: Number(data.time) || Date.now(),
          text: safeText(data.text)
        });
      }
    });

    // PENERIMAAN ITEM VAULT (Chat Pribadi & Status WA)
    socket.on('vault-item', (rawPayload) => {
      try {
        const cleanItem = normalizeVaultItem(rawPayload);
        if (!cleanItem) return;

        setMediaList((prev) => {
          const index = prev.findIndex((m) => m.id === cleanItem.id);
          if (index !== -1) {
            const next = [...prev];
            next[index] = { ...cleanItem };
            return next;
          }
          return [cleanItem, ...prev];
        });

        saveMediaItem(cleanItem).catch((dbErr) => {
          console.warn('[WA-VAULT-DB] Gagal menyimpan item:', dbErr?.message || dbErr);
        });

        if (cleanItem.category === 'status') {
          triggerToast(`Status baru dari ${cleanItem.senderName} berhasil diamankan! (0 View)`, 'success');
        } else if (cleanItem.mediaType === 'text') {
          triggerToast(`Pesan teks masuk dari ${cleanItem.senderName} (Dibaca Senyap)`, 'info');
        } else {
          triggerToast(
            `${cleanItem.mediaType.toUpperCase()} masuk dari ${cleanItem.senderName} berhasil diamankan!`,
            'success'
          );
        }
      } catch (err) {
        console.error('Gagal memproses item vault:', err);
      }
    });

    // ANTI-DELETE REAL-TIME: Pesan Ditarik Pengirim
    socket.on('vault-item-revoked', ({ id, deletedAt }) => {
      try {
        const targetId = safeText(id);
        if (!targetId) return;
        const delTime = Number(deletedAt) || Date.now();

        setMediaList((prev) =>
          prev.map((item) =>
            item.id === targetId ? { ...item, isDeleted: true, deletedAt: delTime } : item
          )
        );

        updateMediaItem(targetId, { isDeleted: true, deletedAt: delTime }).catch((dbErr) => {
          console.warn('[WA-VAULT-DB] Gagal memperbarui status hapus:', dbErr?.message || dbErr);
        });

        triggerToast('Pengirim baru saja MENGHAPUS / MENARIK pesan! (Pesan tetap tersimpan di browser)', 'error');
      } catch (err) {
        console.error('Gagal memproses revoke item:', err);
      }
    });

    // ANTI-EDIT REAL-TIME: Teks Pesan Diedit Pengirim
    socket.on('vault-item-edited', ({ id, editedText, editedAt }) => {
      try {
        const targetId = safeText(id);
        const newText = safeText(editedText);
        if (!targetId || !newText) return;
        const editTime = Number(editedAt) || Date.now();

        setMediaList((prev) =>
          prev.map((item) =>
            item.id === targetId
              ? { ...item, isEdited: true, editedText: newText, editedAt: editTime }
              : item
          )
        );

        updateMediaItem(targetId, { isEdited: true, editedText: newText, editedAt: editTime }).catch((dbErr) => {
          console.warn('[WA-VAULT-DB] Gagal memperbarui edit teks:', dbErr?.message || dbErr);
        });

        triggerToast('Pengirim baru saja MENGEDIT teks pesan!', 'info');
      } catch (err) {
        console.error('Gagal memproses edit teks:', err);
      }
    });
  }

  // Beralih Mode Pemantauan
  const handleSetMonitorMode = (newMode) => {
    const cleanMode = newMode === 'single' ? 'single' : 'all';
    setMonitorMode(cleanMode);
    localStorage.setItem(STORAGE_MONITOR_MODE, cleanMode);
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('set-monitor-mode', {
        sessionId,
        monitorMode: cleanMode,
        targetNumber: lockedTargetRef.current
      });
    }
    triggerToast(
      cleanMode === 'all'
        ? 'Mode Semua Nomor aktif (Pantau seluruh chat pribadi & status kontak)'
        : 'Mode Kunci 1 Target aktif',
      'info'
    );
  };

  // Permintaan Kode Sandi (Pairing Code)
  const handleRequestPairingCode = (e) => {
    if (e) e.preventDefault();
    const clean = normalizePhone(inputPairingPhone);
    if (!clean || clean.length < 9) {
      triggerToast('Masukkan nomor WhatsApp yang valid (minimal 9 digit, contoh: 6281234567890).', 'error');
      return;
    }
    setIsRequestingPairing(true);
    setBackendError(null);
    setPairingCode(null);
    setConnectionStatus('connecting');

    if (!socketRef.current || !socketRef.current.connected) {
      initSocketConnection();
    }

    if (socketRef.current) {
      socketRef.current.emit('request-pairing-code', {
        sessionId,
        phoneNumber: clean
      });
    }
    triggerToast('Meminta kode sandi (Pairing Code) ke server WhatsApp...', 'info');
  };

  // Salin Kode Sandi Pairing
  const handleCopyPairingCode = () => {
    if (!pairingCode) return;
    try {
      const rawCode = pairingCode.replace(/[^a-zA-Z0-9]/g, '');
      navigator.clipboard.writeText(rawCode);
      setCopiedPairingCode(true);
      setTimeout(() => setCopiedPairingCode(false), 2500);
      triggerToast('Kode sandi berhasil disalin ke clipboard!', 'success');
    } catch (_) {
      triggerToast('Gagal menyalin kode sandi.', 'error');
    }
  };

  // Mulai Sesi Baru / Scan QR
  const handleStartSession = () => {
    if (!socketRef.current || !socketRef.current.connected) {
      initSocketConnection();
    }
    setConnectionStatus('connecting');
    setBackendError(null);
    setPairingCode(null);
    if (socketRef.current) {
      socketRef.current.emit('start-session', {
        sessionId,
        targetNumber: lockedTargetRef.current,
        monitorMode: monitorModeRef.current,
        authMethod: 'qr'
      });
    }
  };

  // Putuskan Sesi
  const handleLogoutSession = () => {
    if (socketRef.current) {
      socketRef.current.emit('logout-session', { sessionId });
    }
    setConnectionStatus('disconnected');
    setQrCodeDataUrl(null);
    setPairingCode(null);
    setIsRequestingPairing(false);
    setConnectedPhone(null);
    setBackendError(null);
    triggerToast('Sesi WhatsApp berhasil diputuskan.', 'info');
  };

  // Kunci Target
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
        confirmedLids,
        monitorMode: monitorModeRef.current
      });
    }

    triggerToast(`Nomor target +${normalized} berhasil dikunci!`, 'success');
  };

  // Buka Kunci Target
  const handleUnlockTarget = () => {
    setLockedTarget(null);
    localStorage.removeItem(STORAGE_LOCKED_TARGET);
    setConfirmedLids([]);
    localStorage.removeItem(STORAGE_CONFIRMED_LIDS);

    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('set-target', {
        sessionId,
        targetNumber: null,
        confirmedLids: [],
        monitorMode: monitorModeRef.current
      });
    }

    triggerToast('Target dibuka. Silakan masukkan nomor target baru.', 'info');
  };

  // Salin Teks
  const handleCopyText = (text, id) => {
    if (!text) return;
    try {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
      triggerToast('Teks berhasil disalin ke clipboard!', 'success');
    } catch (_) {
      triggerToast('Gagal menyalin teks.', 'error');
    }
  };

  // Unduh Media (Menggunakan Blob Helper)
  const handleDownloadItem = (item) => {
    if (!item.base64Data) {
      triggerToast('Data media tidak tersedia untuk diunduh.', 'error');
      return;
    }
    let ext = 'bin';
    if (item.mediaType === 'image') ext = 'jpg';
    else if (item.mediaType === 'video') ext = 'mp4';
    else if (item.mediaType === 'audio') ext = item.isPtt ? 'ogg' : 'mp3';
    else if (item.mediaType === 'sticker') ext = 'webp';
    else if (item.fileName && item.fileName.includes('.')) {
      ext = item.fileName.split('.').pop();
    }

    const cleanSender = safeText(item.senderNumber) || 'kontak';
    const cleanId = safeText(item.id) || Date.now();
    const fileName = item.fileName || `WA_Vault_${item.category}_${cleanSender}_${cleanId}.${ext}`;

    downloadBase64File(item.base64Data, fileName, item.mimeType);
    triggerToast('Mengunduh media ke perangkat...', 'success');
  };

  // Hapus 1 Item
  const handleDeleteItem = async (id) => {
    try {
      setMediaList((prev) => prev.filter((item) => item.id !== id));
      await deleteMediaById(id);
      triggerToast('Item berhasil dihapus dari database.', 'info');
    } catch (err) {
      triggerToast('Gagal menghapus item.', 'error');
    }
  };

  // Filter Items Berdasarkan Tab Aktif & Sub-Filter & Pencarian
  const tabFilteredItems = useMemo(() => {
    return mediaList.filter((item) => {
      // 1. Filter Tab Utama
      if (activeTab === 'chat') {
        if (item.category !== 'chat') return false;
      } else if (activeTab === 'antidelete') {
        if (!item.isDeleted && !item.isEdited) return false;
      } else if (activeTab === 'status') {
        if (item.category !== 'status') return false;
      }

      // 2. Sub-Filter
      if (subFilter !== 'all') {
        if (activeTab === 'chat') {
          if (subFilter === 'text') {
            if (item.mediaType !== 'text') return false;
          } else if (subFilter === 'image') {
            if (item.mediaType !== 'image') return false;
          } else if (subFilter === 'video') {
            if (item.mediaType !== 'video') return false;
          } else if (subFilter === 'audio') {
            if (item.mediaType !== 'audio') return false;
          } else if (subFilter === 'file_sticker') {
            if (item.mediaType !== 'document' && item.mediaType !== 'sticker') return false;
          }
        } else if (activeTab === 'antidelete') {
          if (subFilter === 'deleted' && !item.isDeleted) return false;
          if (subFilter === 'edited' && !item.isEdited) return false;
        } else if (activeTab === 'status') {
          if (subFilter === 'image' && item.mediaType !== 'image') return false;
          if (subFilter === 'video' && item.mediaType !== 'video') return false;
          if (subFilter === 'text' && item.mediaType !== 'text') return false;
        }
      }

      // 3. Pencarian Kata Kunci
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const sender = (item.senderNumber || '').toLowerCase();
        const name = (item.senderName || '').toLowerCase();
        const text = (item.textContent || item.text || item.caption || '').toLowerCase();
        const edited = (item.editedText || '').toLowerCase();
        const file = (item.fileName || '').toLowerCase();

        return (
          sender.includes(query) ||
          name.includes(query) ||
          text.includes(query) ||
          edited.includes(query) ||
          file.includes(query)
        );
      }

      return true;
    });
  }, [mediaList, activeTab, subFilter, searchQuery]);

  // Hapus Seluruh Item pada Tab Ini (Safe 2-Click)
  const handleExecuteClearTab = async () => {
    try {
      const idsToDelete = tabFilteredItems.map((item) => item.id);
      if (idsToDelete.length === 0) return;

      setMediaList((prev) => prev.filter((item) => !idsToDelete.includes(item.id)));
      await deleteMediaByIds(idsToDelete);
      setConfirmClearTab(false);
      triggerToast(`${idsToDelete.length} item pada tab ini berhasil dibersihkan!`, 'info');
    } catch (err) {
      triggerToast('Gagal membersihkan item pada tab.', 'error');
    }
  };

  // Jumlah count badges
  const chatCount = useMemo(() => mediaList.filter((m) => m.category === 'chat').length, [mediaList]);
  const antiDeleteCount = useMemo(() => mediaList.filter((m) => m.isDeleted || m.isEdited).length, [mediaList]);
  const statusCount = useMemo(() => mediaList.filter((m) => m.category === 'status').length, [mediaList]);

  return (
    <div className="max-w-6xl mx-auto px-3 md:px-6 py-6 space-y-6">
      
      {/* Tombol Kembali ke Beranda */}
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-white border-2 border-black rounded-lg font-bold text-xs shadow-[2px_2px_0px_#000] hover:bg-neutral-100 active:translate-x-[1px] active:translate-y-[1px] transition-all"
      >
        <ArrowLeft className="w-4 h-4" />
        Kembali ke Beranda
      </button>

      {/* Header Utama: WA Stealth Vault */}
      <div className="bg-white border-2 border-black rounded-xl p-5 md:p-6 shadow-[4px_4px_0px_#000] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="w-10 h-10 rounded-lg bg-black border-2 border-black flex items-center justify-center shadow-[2px_2px_0px_#22c55e]">
              <ShieldCheck className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-black uppercase tracking-tight text-neutral-900">
                WA Stealth Vault
              </h1>
              <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                <span className="px-2 py-0.5 bg-black text-emerald-400 border border-black rounded text-[10px] font-mono font-bold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  GHOST MODE • TANPA CENTANG BIRU
                </span>
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-900 border border-black rounded text-[10px] font-bold">
                  ZERO-DISK INDEXEDDB
                </span>
              </div>
            </div>
          </div>
          <p className="text-xs md:text-sm text-neutral-700 max-w-2xl leading-relaxed">
            <b>3 Fungsi Siluman WhatsApp dalam 1 Vault:</b> Ghost Reader (baca chat tanpa centang biru &amp; offline), Anti-Delete &amp; Edit (amankan pesan yang ditarik/diedit), dan Silent Status Saver (intip status kontak tanpa ketahuan / 0 view count).
          </p>
        </div>

        {/* Status Koneksi */}
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
              <span className="px-2.5 py-1 bg-amber-300 text-black border-2 border-black rounded-lg text-xs font-black shadow-[2px_2px_0px_#000] flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-black animate-pulse" />
                Kode Sandi Siap
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

      {/* Banner Error / Informasi Koneksi */}
      {backendError && (
        <div className="bg-amber-50 border-2 border-black rounded-xl p-4 shadow-[3px_3px_0px_#000] flex items-start gap-3 text-xs md:text-sm text-amber-900">
          <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">Informasi Server:</p>
            <p className="text-amber-800 leading-relaxed">{safeText(backendError)}</p>
          </div>
        </div>
      )}

      {/* Panel Kontrol 2 Kolom (Tautkan Perangkat WhatsApp & Mode Pemantauan) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Kolom 1: Tautkan Perangkat WhatsApp */}
        <div className="bg-white border-2 border-black rounded-xl p-5 shadow-[4px_4px_0px_#000] flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b-2 border-black pb-3">
              <div className="flex items-center gap-2">
                <QrCode className="w-5 h-5 text-neutral-900" />
                <h2 className="font-black text-sm md:text-base uppercase tracking-tight">
                  Tautkan WhatsApp (Mode Siluman)
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

            {/* Konten Penautan (Pairing Code vs QR Code) */}
            {connectionStatus === 'connected' ? (
              <div className="flex flex-col items-center justify-center py-6 px-4 bg-emerald-50 border-2 border-black rounded-xl text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-emerald-400 border-2 border-black flex items-center justify-center shadow-[2px_2px_0px_#000]">
                  <CheckCircle2 className="w-7 h-7 text-black" />
                </div>
                <h3 className="font-black text-sm text-neutral-900">Perangkat Terhubung dalam Mode Siluman!</h3>
                <p className="text-xs text-neutral-600 max-w-sm">
                  <b>Mode Hantu Aktif:</b> Laporan status online dinonaktifkan, dan tanda centang biru diblokir penuh sehingga pengirim tidak akan pernah tahu Anda telah membaca pesan atau mengintip status mereka.
                </p>
                <div className="pt-2 flex flex-wrap gap-1.5 justify-center">
                  <span className="px-2.5 py-0.5 bg-black text-emerald-400 border border-black rounded text-[11px] font-mono font-bold">
                    Offline Presence Enforced
                  </span>
                  <span className="px-2.5 py-0.5 bg-white text-neutral-800 border border-black rounded text-[11px] font-bold">
                    Zero Blue Ticks
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Switcher Tab Metode Login: Pairing Code vs QR Code */}
                <div className="flex rounded-lg border-2 border-black overflow-hidden p-0.5 bg-neutral-100 shadow-[2px_2px_0px_#000]">
                  <button
                    type="button"
                    onClick={() => setAuthMethodTab('pairing')}
                    className={`flex-1 py-1.5 px-2 text-xs font-black rounded-md flex items-center justify-center gap-1.5 transition-all ${
                      authMethodTab === 'pairing'
                        ? 'bg-black text-white shadow-[1px_1px_0px_#22c55e]'
                        : 'text-neutral-700 hover:bg-neutral-200'
                    }`}
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    Kode Sandi (Pairing Code)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthMethodTab('qr')}
                    className={`flex-1 py-1.5 px-2 text-xs font-black rounded-md flex items-center justify-center gap-1.5 transition-all ${
                      authMethodTab === 'qr'
                        ? 'bg-black text-white shadow-[1px_1px_0px_#22c55e]'
                        : 'text-neutral-700 hover:bg-neutral-200'
                    }`}
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    Scan QR Code
                  </button>
                </div>

                {/* Tab 1: Pairing Code */}
                {authMethodTab === 'pairing' && (
                  pairingCode ? (
                    <div className="flex flex-col items-center justify-center p-4 bg-emerald-50 border-2 border-black rounded-xl space-y-3 shadow-[3px_3px_0px_#000]">
                      <span className="text-[10px] font-black uppercase text-emerald-800 tracking-wider">
                        Kode Sandi WhatsApp Anda
                      </span>
                      <div className="px-5 py-2.5 bg-white border-2 border-black rounded-xl shadow-[3px_3px_0px_#000]">
                        <span className="font-mono font-black text-2xl md:text-3xl tracking-widest text-neutral-900 select-all">
                          {pairingCode}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleCopyPairingCode}
                        className="px-4 py-1.5 bg-black text-white border-2 border-black rounded-lg text-xs font-black shadow-[2px_2px_0px_#22c55e] hover:bg-neutral-800 active:translate-x-[1px] active:translate-y-[1px] flex items-center gap-1.5"
                      >
                        {copiedPairingCode ? (
                          <>
                            <Check className="w-4 h-4 text-emerald-400" />
                            Tersalin ke Clipboard!
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4" />
                            Salin Kode Sandi
                          </>
                        )}
                      </button>

                      <div className="text-left w-full bg-white p-3 border-2 border-black rounded-lg space-y-1">
                        <p className="font-black text-xs text-neutral-900">Cara Memasukkan di WhatsApp:</p>
                        <ol className="text-[11px] text-neutral-700 space-y-1 list-decimal list-inside leading-relaxed">
                          <li>Buka WhatsApp di HP Anda</li>
                          <li>Ketuk <b>Titik Tiga</b> (Android) atau <b>Pengaturan</b> (iPhone)</li>
                          <li>Pilih <b>Perangkat Tertaut</b> &gt; <b>Tautkan Perangkat</b></li>
                          <li>Ketuk <b>Tautkan dengan nomor telepon saja</b> di bagian bawah</li>
                          <li>Masukkan 8 karakter kode di atas</li>
                        </ol>
                      </div>

                      <button
                        type="button"
                        onClick={() => { setPairingCode(null); setIsRequestingPairing(false); }}
                        className="text-[11px] font-bold text-neutral-600 hover:text-black underline"
                      >
                        Ganti Nomor / Minta Kode Baru
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handleRequestPairingCode} className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-neutral-800">
                          Nomor WhatsApp HP Anda:
                        </label>
                        <input
                          type="text"
                          value={inputPairingPhone}
                          onChange={(e) => setInputPairingPhone(e.target.value)}
                          placeholder="Contoh: 08123456789 atau 628xxx"
                          className="w-full px-3 py-2 bg-neutral-50 border-2 border-black rounded-xl text-xs font-mono font-bold outline-none focus:bg-white focus:ring-2 focus:ring-black"
                        />
                        <p className="text-[10px] text-neutral-500">
                          Tanpa kamera. Masukkan nomor WhatsApp aktif di HP Anda untuk mendapatkan 8 digit kode penautan.
                        </p>
                      </div>
                      <button
                        type="submit"
                        disabled={isRequestingPairing || connectionStatus === 'connecting'}
                        className="w-full py-2.5 px-4 bg-black text-white border-2 border-black rounded-xl font-black text-xs md:text-sm shadow-[3px_3px_0px_#22c55e] hover:bg-neutral-800 active:translate-x-[1px] active:translate-y-[1px] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {isRequestingPairing || connectionStatus === 'connecting' ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            Meminta Kode Sandi...
                          </>
                        ) : (
                          <>
                            <Smartphone className="w-4 h-4" />
                            Dapatkan Kode Sandi (Pairing Code)
                          </>
                        )}
                      </button>
                    </form>
                  )
                )}

                {/* Tab 2: Scan QR Code */}
                {authMethodTab === 'qr' && (
                  connectionStatus === 'qr_ready' && qrCodeDataUrl ? (
                    <div className="flex flex-col items-center justify-center p-4 bg-neutral-50 border-2 border-black rounded-xl space-y-3">
                      <div className="p-2 bg-white border-2 border-black rounded-lg shadow-[3px_3px_0px_#000]">
                        <img
                          src={qrCodeDataUrl}
                          alt="WhatsApp QR Code"
                          className="w-48 h-48 object-contain"
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
                  ) : (
                    <div className="space-y-3">
                      <div className="flex flex-col items-center justify-center py-6 px-4 bg-neutral-50 border-2 border-dashed border-neutral-300 rounded-xl text-center space-y-2">
                        <QrCode className="w-10 h-10 text-neutral-400" />
                        <p className="font-bold text-xs text-neutral-700">QR Code belum dibuat</p>
                        <p className="text-[11px] text-neutral-500 max-w-xs">
                          Tekan tombol di bawah untuk meminta kode QR penautan WhatsApp Mode Siluman.
                        </p>
                      </div>
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
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        </div>

        {/* Kolom 2: Mode Pemantauan & Kunci Target */}
        <div className="bg-white border-2 border-black rounded-xl p-5 shadow-[4px_4px_0px_#000] flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b-2 border-black pb-3">
              <div className="flex items-center gap-2">
                {monitorMode === 'all' ? (
                  <Users className="w-5 h-5 text-neutral-900" />
                ) : (
                  <Lock className="w-5 h-5 text-neutral-900" />
                )}
                <h2 className="font-black text-sm md:text-base uppercase tracking-tight">
                  Cakupan Pemantauan
                </h2>
              </div>
              <span className={`px-2 py-0.5 border border-black rounded text-[11px] font-black ${
                monitorMode === 'all'
                  ? 'bg-cyan-300 text-black'
                  : lockedTarget
                  ? 'bg-emerald-300 text-black'
                  : 'bg-neutral-100 text-neutral-600'
              }`}>
                {monitorMode === 'all' ? 'SEMUA NOMOR' : lockedTarget ? '1 TARGET TERKUNCI' : 'BELUM TERKUNCI'}
              </span>
            </div>

            {/* Switcher Mode: Semua Nomor vs Kunci 1 Target */}
            <div className="flex rounded-lg border-2 border-black overflow-hidden p-0.5 bg-neutral-100 shadow-[2px_2px_0px_#000]">
              <button
                type="button"
                onClick={() => handleSetMonitorMode('all')}
                className={`flex-1 py-1.5 px-2 text-xs font-black rounded-md flex items-center justify-center gap-1.5 transition-all ${
                  monitorMode === 'all'
                    ? 'bg-black text-white shadow-[1px_1px_0px_#22c55e]'
                    : 'text-neutral-700 hover:bg-neutral-200'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                Semua Nomor (Rekomendasi)
              </button>
              <button
                type="button"
                onClick={() => handleSetMonitorMode('single')}
                className={`flex-1 py-1.5 px-2 text-xs font-black rounded-md flex items-center justify-center gap-1.5 transition-all ${
                  monitorMode === 'single'
                    ? 'bg-black text-white shadow-[1px_1px_0px_#22c55e]'
                    : 'text-neutral-700 hover:bg-neutral-200'
                }`}
              >
                <Lock className="w-3.5 h-3.5" />
                Kunci 1 Target
              </button>
            </div>

            {monitorMode === 'all' ? (
              <div className="p-4 bg-cyan-50 border-2 border-black rounded-xl shadow-[3px_3px_0px_#000] space-y-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-cyan-400 border-2 border-black flex items-center justify-center shadow-[1.5px_1.5px_0px_#000]">
                    <Users className="w-4 h-4 text-black" />
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-black text-cyan-900 tracking-wider">
                      Mode Bebas Aktif
                    </span>
                    <p className="font-black text-sm text-neutral-900">
                      Pantau Seluruh Chat &amp; Status Kontak
                    </p>
                  </div>
                </div>
                <p className="text-xs text-neutral-700 leading-relaxed">
                  Menangkap semua pesan masuk (chat, foto, video, voice note) dan status WhatsApp dari siapa pun tanpa dibatasi 1 nomor target.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {lockedTarget ? (
                  <div className="p-4 bg-emerald-50 border-2 border-black rounded-xl shadow-[3px_3px_0px_#000] space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-emerald-400 border-2 border-black flex items-center justify-center shadow-[1.5px_1.5px_0px_#000]">
                          <Lock className="w-4 h-4 text-black" />
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
                  <form onSubmit={handleLockTarget} className="space-y-2">
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
                  </form>
                )}
              </div>
            )}
          </div>

          <div className="p-2.5 bg-neutral-100 border border-black rounded-lg flex items-start gap-2 text-[11px] text-neutral-700">
            <Info className="w-4 h-4 text-neutral-600 shrink-0 mt-0.5" />
            <span>
              Format otomatis: awalan 08xx langsung disesuaikan ke format standar internasional 628xx.
            </span>
          </div>
        </div>

      </div>

      {/* Baris Aktivitas Real-Time */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-white border-2 border-black rounded-xl text-xs font-mono shadow-[3px_3px_0px_#000] text-neutral-800">
        <span className={`w-2 h-2 rounded-full shrink-0 ${vaultActivity ? 'bg-emerald-500 animate-ping' : connectionStatus === 'connected' ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
        <Activity className="w-4 h-4 text-neutral-700 shrink-0" />
        {vaultActivity && (
          <span className="font-bold text-neutral-500 shrink-0">
            {new Date(vaultActivity.time).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}:
          </span>
        )}
        <span className="truncate font-semibold">
          {vaultActivity && safeText(vaultActivity.text)
            ? safeText(vaultActivity.text)
            : connectionStatus === 'connected'
              ? 'WhatsApp terhubung dalam Mode Siluman. Siap mengamankan chat & status kontak...'
              : 'Menghubungkan ke backend server WhatsApp...'}
        </span>
      </div>

      {/* WORKSPACE UTAMA: 3 TAB SILUMAN */}
      <div className="bg-white border-2 border-black rounded-xl p-5 md:p-6 shadow-[4px_4px_0px_#000] space-y-5">
        
        {/* Navigasi 3 Tab Utama */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-2 border-black pb-4">
          <div className="flex flex-wrap items-center gap-2">
            
            {/* Tab 1: Ghost Reader */}
            <button
              type="button"
              onClick={() => handleTabChange('chat')}
              className={`px-3.5 py-2 rounded-xl border-2 border-black text-xs md:text-sm font-black flex items-center gap-2 transition-all ${
                activeTab === 'chat'
                  ? 'bg-black text-white shadow-[2px_2px_0px_#22c55e]'
                  : 'bg-neutral-50 text-neutral-700 hover:bg-neutral-100 shadow-[2px_2px_0px_#000]'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              <span>Ghost Reader (Chat)</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                activeTab === 'chat' ? 'bg-emerald-400 text-black' : 'bg-neutral-200 text-neutral-800'
              }`}>
                {chatCount}
              </span>
            </button>

            {/* Tab 2: Anti-Delete & Edit */}
            <button
              type="button"
              onClick={() => handleTabChange('antidelete')}
              className={`px-3.5 py-2 rounded-xl border-2 border-black text-xs md:text-sm font-black flex items-center gap-2 transition-all ${
                activeTab === 'antidelete'
                  ? 'bg-rose-600 text-white shadow-[2px_2px_0px_#000]'
                  : 'bg-neutral-50 text-neutral-700 hover:bg-neutral-100 shadow-[2px_2px_0px_#000]'
              }`}
            >
              <ShieldAlert className="w-4 h-4" />
              <span>Anti-Delete &amp; Edit</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                antiDeleteCount > 0 ? 'bg-amber-300 text-black' : 'bg-neutral-200 text-neutral-800'
              }`}>
                {antiDeleteCount}
              </span>
            </button>

            {/* Tab 3: Silent Status (SW) */}
            <button
              type="button"
              onClick={() => handleTabChange('status')}
              className={`px-3.5 py-2 rounded-xl border-2 border-black text-xs md:text-sm font-black flex items-center gap-2 transition-all ${
                activeTab === 'status'
                  ? 'bg-purple-600 text-white shadow-[2px_2px_0px_#000]'
                  : 'bg-neutral-50 text-neutral-700 hover:bg-neutral-100 shadow-[2px_2px_0px_#000]'
              }`}
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>Silent Status (SW)</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                activeTab === 'status' ? 'bg-amber-300 text-black' : 'bg-neutral-200 text-neutral-800'
              }`}>
                {statusCount}
              </span>
            </button>

          </div>

          {/* Tombol Bersihkan Tab Ini */}
          {tabFilteredItems.length > 0 && (
            <button
              onClick={() => setConfirmClearTab(true)}
              className="self-start sm:self-auto px-3 py-1.5 bg-rose-100 text-rose-800 border-2 border-black rounded-lg text-xs font-black shadow-[2px_2px_0px_#000] hover:bg-rose-200 active:translate-x-[1px] active:translate-y-[1px] flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Bersihkan Tab Ini
            </button>
          )}
        </div>

        {/* Dialog Konfirmasi Bersihkan Tab */}
        {confirmClearTab && (
          <div className="p-4 bg-rose-50 border-2 border-rose-500 rounded-xl space-y-2 shadow-[3px_3px_0px_#000]">
            <div className="flex items-center gap-2 text-rose-900 font-black text-xs md:text-sm">
              <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0" />
              Yakin ingin membersihkan {tabFilteredItems.length} item dari tab ini?
            </div>
            <p className="text-xs text-rose-700">
              Data yang terhapus dari IndexedDB browser tidak dapat dikembalikan lagi.
            </p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleExecuteClearTab}
                className="px-3.5 py-1.5 bg-rose-600 text-white border-2 border-black rounded-lg font-black text-xs hover:bg-rose-700 shadow-[2px_2px_0px_#000]"
              >
                Ya, Hapus {tabFilteredItems.length} Item
              </button>
              <button
                onClick={() => setConfirmClearTab(false)}
                className="px-3 py-1.5 bg-white text-black border-2 border-black rounded-lg font-bold text-xs hover:bg-neutral-100 shadow-[2px_2px_0px_#000]"
              >
                Batal
              </button>
            </div>
          </div>
        )}

        {/* Toolbar: Pencarian & Sub-Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          
          {/* Input Pencarian */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari pengirim, isi chat, caption status, atau file..."
              className="w-full pl-9 pr-8 py-1.5 bg-neutral-50 border-2 border-black rounded-xl text-xs font-semibold outline-none focus:bg-white focus:ring-2 focus:ring-black"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-black"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Sub-Filters Dinamis Berdasarkan Tab */}
          <div className="flex flex-wrap border-2 border-black rounded-lg overflow-hidden text-xs font-bold shrink-0">
            {activeTab === 'chat' && (
              <>
                <button
                  onClick={() => setSubFilter('all')}
                  className={`px-2.5 py-1 ${subFilter === 'all' ? 'bg-black text-white' : 'bg-white text-black hover:bg-neutral-100'}`}
                >
                  Semua
                </button>
                <button
                  onClick={() => setSubFilter('image')}
                  className={`px-2.5 py-1 border-l-2 border-black ${subFilter === 'image' ? 'bg-black text-white' : 'bg-white text-black hover:bg-neutral-100'}`}
                >
                  Foto
                </button>
                <button
                  onClick={() => setSubFilter('video')}
                  className={`px-2.5 py-1 border-l-2 border-black ${subFilter === 'video' ? 'bg-black text-white' : 'bg-white text-black hover:bg-neutral-100'}`}
                >
                  Video
                </button>
                <button
                  onClick={() => setSubFilter('audio')}
                  className={`px-2.5 py-1 border-l-2 border-black ${subFilter === 'audio' ? 'bg-black text-white' : 'bg-white text-black hover:bg-neutral-100'}`}
                >
                  Audio/VN
                </button>
                <button
                  onClick={() => setSubFilter('text')}
                  className={`px-2.5 py-1 border-l-2 border-black ${subFilter === 'text' ? 'bg-black text-white' : 'bg-white text-black hover:bg-neutral-100'}`}
                >
                  Teks
                </button>
                <button
                  onClick={() => setSubFilter('file_sticker')}
                  className={`px-2.5 py-1 border-l-2 border-black ${subFilter === 'file_sticker' ? 'bg-black text-white' : 'bg-white text-black hover:bg-neutral-100'}`}
                >
                  Dokumen/Stiker
                </button>
              </>
            )}

            {activeTab === 'antidelete' && (
              <>
                <button
                  onClick={() => setSubFilter('all')}
                  className={`px-2.5 py-1 ${subFilter === 'all' ? 'bg-black text-white' : 'bg-white text-black hover:bg-neutral-100'}`}
                >
                  Semua
                </button>
                <button
                  onClick={() => setSubFilter('deleted')}
                  className={`px-2.5 py-1 border-l-2 border-black ${subFilter === 'deleted' ? 'bg-rose-600 text-white' : 'bg-white text-rose-700 hover:bg-rose-50'}`}
                >
                  Ditarik / Dihapus
                </button>
                <button
                  onClick={() => setSubFilter('edited')}
                  className={`px-2.5 py-1 border-l-2 border-black ${subFilter === 'edited' ? 'bg-blue-600 text-white' : 'bg-white text-blue-700 hover:bg-blue-50'}`}
                >
                  Diedit
                </button>
              </>
            )}

            {activeTab === 'status' && (
              <>
                <button
                  onClick={() => setSubFilter('all')}
                  className={`px-2.5 py-1 ${subFilter === 'all' ? 'bg-black text-white' : 'bg-white text-black hover:bg-neutral-100'}`}
                >
                  Semua
                </button>
                <button
                  onClick={() => setSubFilter('image')}
                  className={`px-2.5 py-1 border-l-2 border-black ${subFilter === 'image' ? 'bg-purple-600 text-white' : 'bg-white text-black hover:bg-neutral-100'}`}
                >
                  Foto
                </button>
                <button
                  onClick={() => setSubFilter('video')}
                  className={`px-2.5 py-1 border-l-2 border-black ${subFilter === 'video' ? 'bg-purple-600 text-white' : 'bg-white text-black hover:bg-neutral-100'}`}
                >
                  Video
                </button>
                <button
                  onClick={() => setSubFilter('text')}
                  className={`px-2.5 py-1 border-l-2 border-black ${subFilter === 'text' ? 'bg-purple-600 text-white' : 'bg-white text-black hover:bg-neutral-100'}`}
                >
                  Teks Warna
                </button>
              </>
            )}
          </div>
        </div>

        {/* KONTEN GRID MEDIA ITEM */}
        {tabFilteredItems.length === 0 ? (
          <div className="py-16 flex flex-col items-center justify-center text-center space-y-2.5">
            <div className="w-12 h-12 rounded-xl bg-neutral-100 border-2 border-black flex items-center justify-center shadow-[2px_2px_0px_#000]">
              <Eye className="w-6 h-6 text-neutral-400" />
            </div>
            <h3 className="font-black text-sm text-neutral-800">
              {activeTab === 'chat' && 'Belum ada chat masuk'}
              {activeTab === 'antidelete' && 'Belum ada pesan yang ditarik atau diedit'}
              {activeTab === 'status' && 'Belum ada status kontak yang tertangkap'}
            </h3>
            <p className="text-xs text-neutral-500 max-w-sm leading-relaxed">
              {activeTab === 'chat' && 'Saat ada kontak yang mengirim pesan teks, foto, video, suara, atau dokumen, pesan akan otomatis masuk ke sini tanpa menimbulkan centang biru di HP pengirim.'}
              {activeTab === 'antidelete' && 'Jika pengirim menarik/menghapus pesan untuk semua orang atau mengedit teks pesan, salinan aslinya akan ditandai dan diamankan di sini.'}
              {activeTab === 'status' && 'Saat kontak Anda membuat Status WhatsApp baru (foto, video, atau teks), sistem akan otomatis mengamankannya dengan 0 View Count (nama Anda tidak akan pernah muncul di daftar pemirsa SW mereka).'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tabFilteredItems.map((item) => {
              const isStatusItem = item.category === 'status';

              return (
                <div
                  key={item.id}
                  className={`rounded-xl p-3.5 flex flex-col justify-between space-y-3 transition-all ${
                    item.isDeleted
                      ? 'bg-rose-50/50 border-2 border-rose-600 shadow-[4px_4px_0px_#e11d48]'
                      : isStatusItem
                      ? 'bg-purple-50/30 border-2 border-purple-900 shadow-[3px_3px_0px_#7e22ce]'
                      : 'bg-white border-2 border-black shadow-[3px_3px_0px_#000]'
                  }`}
                >
                  {/* Badge Dihapus / Ditarik Pengirim */}
                  {item.isDeleted && (
                    <div className="px-2.5 py-1 bg-rose-600 text-white rounded-lg border-2 border-black text-[11px] font-black uppercase tracking-wider shadow-[2px_2px_0px_#000] flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <ShieldAlert className="w-3.5 h-3.5" />
                        {isStatusItem ? 'STATUS DITARIK OLEH PEMBUAT' : 'DIHAPUS PENGIRIM'}
                      </span>
                      {item.deletedAt && (
                        <span className="font-mono text-[10px] opacity-90">
                          {new Date(item.deletedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                        </span>
                      )}
                    </div>
                  )}

                  {/* Header Kartu: Pengirim & Badge Tipe */}
                  <div className="flex items-center justify-between gap-2 border-b-2 border-black pb-2.5">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-300 text-black border-2 border-black rounded-lg text-xs font-black shadow-[1.5px_1.5px_0px_#000] truncate max-w-[210px]">
                      <Smartphone className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate font-mono">+{safeText(item.senderNumber)}</span>
                      {safeText(item.senderName) && (
                        <span className="text-[11px] font-sans font-bold text-neutral-800 truncate">
                          • {safeText(item.senderName)}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      {isStatusItem ? (
                        <span className="px-2 py-0.5 border-2 border-black rounded text-[10px] font-black uppercase tracking-wider shadow-[1px_1px_0px_#000] bg-emerald-300 text-black flex items-center gap-1">
                          <Radio className="w-3 h-3" /> 0 VIEW
                        </span>
                      ) : item.isViewOnce ? (
                        <span className="px-1.5 py-0.5 bg-yellow-300 text-neutral-900 border border-black rounded text-[9px] font-black">
                          1x LIHAT
                        </span>
                      ) : null}

                      <span className={`px-2 py-0.5 border-2 border-black rounded text-[10px] font-black uppercase tracking-wider shadow-[1px_1px_0px_#000] flex items-center gap-1 ${
                        item.mediaType === 'video'
                          ? 'bg-purple-200 text-purple-900'
                          : item.mediaType === 'image'
                          ? 'bg-cyan-200 text-cyan-900'
                          : item.mediaType === 'audio'
                          ? 'bg-amber-200 text-amber-900'
                          : item.mediaType === 'sticker'
                          ? 'bg-pink-200 text-pink-900'
                          : item.mediaType === 'document'
                          ? 'bg-emerald-200 text-emerald-900'
                          : 'bg-neutral-200 text-neutral-900'
                      }`}>
                        {item.mediaType === 'video' && <><Film className="w-3 h-3" /> VIDEO</>}
                        {item.mediaType === 'image' && <><ImageIcon className="w-3 h-3" /> FOTO</>}
                        {item.mediaType === 'audio' && <><Mic className="w-3 h-3" /> {item.isPtt ? 'VOICE NOTE' : 'AUDIO'}</>}
                        {item.mediaType === 'sticker' && <>STIKER</>}
                        {item.mediaType === 'document' && <><Paperclip className="w-3 h-3" /> DOKUMEN</>}
                        {item.mediaType === 'text' && <><MessageSquare className="w-3 h-3" /> TEKS</>}
                      </span>
                    </div>
                  </div>

                  {/* KONTEN PESAN / STATUS */}
                  {item.mediaType === 'text' ? (
                    isStatusItem ? (
                      /* Status Teks Berwarna WA */
                      <div
                        style={{ backgroundColor: item.bgColor || '#1e293b' }}
                        className="rounded-xl p-6 min-h-[160px] flex items-center justify-center text-center border-2 border-black shadow-[2px_2px_0px_#000]"
                      >
                        <p className="text-white font-bold text-sm md:text-base leading-relaxed break-words max-w-xs drop-shadow-sm">
                          {safeText(item.textContent || item.text)}
                        </p>
                      </div>
                    ) : (
                      /* Chat Teks Biasa + Blok Edit */
                      <div className="space-y-2">
                        <div className="p-3 bg-neutral-50 border-2 border-black rounded-lg text-sm text-neutral-900 font-medium whitespace-pre-wrap break-words">
                          {safeText(item.textContent || item.text)}
                        </div>

                        {item.isEdited && item.editedText && (
                          <div className="p-2.5 bg-blue-50 border border-blue-400 rounded-lg space-y-1 text-xs">
                            <div className="flex items-center gap-1.5 font-bold text-blue-900">
                              <Edit3 className="w-3.5 h-3.5 text-blue-700" />
                              <span>Setelah Diedit ({formatWaDate(item.editedAt)}):</span>
                            </div>
                            <p className="text-blue-950 font-semibold whitespace-pre-wrap break-words pl-5">
                              {safeText(item.editedText)}
                            </p>
                          </div>
                        )}
                      </div>
                    )
                  ) : item.mediaType === 'image' ? (
                    /* Foto Chat atau Status Foto */
                    <div className="space-y-2">
                      <div className={`relative rounded-lg overflow-hidden border-2 border-black bg-black ${isStatusItem ? 'aspect-[4/5]' : 'aspect-video'} flex items-center justify-center group`}>
                        <img
                          src={item.base64Data}
                          alt={safeText(item.caption) || 'Vault Image'}
                          loading="lazy"
                          className="w-full h-full object-cover cursor-pointer group-hover:scale-105 transition-transform"
                          onClick={() => setPreviewMedia(item)}
                        />
                        <button
                          onClick={() => setPreviewMedia(item)}
                          className="absolute bottom-2 right-2 p-1.5 bg-black/70 text-white rounded border border-white/50 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Perbesar Pratinjau"
                        >
                          <Maximize2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {safeText(item.caption) && (
                        <p className="text-xs text-neutral-800 italic bg-neutral-50 p-2 border border-black rounded">
                          "{safeText(item.caption)}"
                        </p>
                      )}
                    </div>
                  ) : item.mediaType === 'video' ? (
                    /* Video Chat atau Status Video */
                    <div className="space-y-2">
                      <div className={`relative rounded-lg overflow-hidden border-2 border-black bg-black ${isStatusItem ? 'aspect-[4/5]' : 'aspect-video'} flex items-center justify-center`}>
                        {item.base64Data ? (
                          <video
                            src={item.base64Data}
                            controls
                            playsInline
                            preload="metadata"
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <div className="p-4 text-center text-white text-xs">
                            <Film className="w-8 h-8 mx-auto mb-1 text-neutral-400" />
                            <span>Video ({formatBytes(item.fileSize)})</span>
                          </div>
                        )}
                      </div>
                      {safeText(item.caption) && (
                        <p className="text-xs text-neutral-800 italic bg-neutral-50 p-2 border border-black rounded">
                          "{safeText(item.caption)}"
                        </p>
                      )}
                    </div>
                  ) : item.mediaType === 'audio' ? (
                    /* Audio / Voice Note */
                    <div className="space-y-2 p-3 bg-neutral-50 border-2 border-black rounded-lg">
                      <div className="flex items-center gap-2 text-xs font-bold text-neutral-800">
                        <Mic className="w-4 h-4 text-amber-600" />
                        <span>{item.isPtt ? 'Voice Note WhatsApp' : 'File Audio'}</span>
                        {item.fileSize > 0 && (
                          <span className="font-mono text-[10px] text-neutral-500">
                            ({formatBytes(item.fileSize)})
                          </span>
                        )}
                      </div>
                      {item.base64Data ? (
                        <audio src={item.base64Data} controls preload="metadata" className="w-full h-10" />
                      ) : (
                        <p className="text-xs text-neutral-500">Audio belum diunduh</p>
                      )}
                    </div>
                  ) : item.mediaType === 'sticker' ? (
                    /* Stiker */
                    <div className="py-2 flex items-center justify-center bg-neutral-50 border-2 border-black rounded-lg">
                      {item.base64Data ? (
                        <img src={item.base64Data} alt="Stiker WA" className="w-28 h-28 object-contain" />
                      ) : (
                        <span className="text-xs text-neutral-500">Stiker WhatsApp</span>
                      )}
                    </div>
                  ) : item.mediaType === 'document' ? (
                    /* Dokumen */
                    <div className="p-3 bg-neutral-50 border-2 border-black rounded-lg space-y-1.5">
                      <div className="flex items-center gap-2">
                        <Paperclip className="w-5 h-5 text-emerald-700 shrink-0" />
                        <div className="overflow-hidden">
                          <p className="font-bold text-xs text-neutral-900 truncate">
                            {safeText(item.fileName) || 'Dokumen'}
                          </p>
                          <p className="font-mono text-[10px] text-neutral-500">
                            {formatBytes(item.fileSize)} • {safeText(item.mimeType)}
                          </p>
                        </div>
                      </div>
                      {safeText(item.caption) && (
                        <p className="text-xs text-neutral-700 italic pt-1 border-t border-neutral-200">
                          "{safeText(item.caption)}"
                        </p>
                      )}
                    </div>
                  ) : null}

                  {/* Metadata Waktu & Tanggal Asli WhatsApp */}
                  <div className="text-[11px] text-neutral-600 flex items-center justify-between pt-1">
                    <div className="flex items-center gap-1 font-mono">
                      <Clock className="w-3.5 h-3.5 text-neutral-500" />
                      <span>{formatWaDate(item.sentAt || item.timestamp)}</span>
                    </div>
                  </div>

                  {/* Tombol Aksi: Salin / Unduh & Hapus Satuan */}
                  <div className="flex items-center gap-2 pt-2 border-t-2 border-black">
                    {item.mediaType === 'text' ? (
                      <button
                        onClick={() => handleCopyText(item.textContent || item.text, item.id)}
                        className="flex-1 py-1.5 px-3 bg-neutral-100 text-black border-2 border-black rounded-lg font-bold text-xs shadow-[2px_2px_0px_#000] hover:bg-neutral-200 active:translate-x-[1px] active:translate-y-[1px] transition-all flex items-center justify-center gap-1.5"
                      >
                        {copiedId === item.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            Tersalin!
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            Salin Teks
                          </>
                        )}
                      </button>
                    ) : item.base64Data ? (
                      <button
                        onClick={() => handleDownloadItem(item)}
                        className={`flex-1 py-1.5 px-3 border-2 border-black rounded-lg font-black text-xs shadow-[2px_2px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] transition-all flex items-center justify-center gap-1.5 ${
                          isStatusItem
                            ? 'bg-purple-300 text-black hover:bg-purple-200'
                            : 'bg-emerald-400 text-black hover:bg-emerald-300'
                        }`}
                      >
                        <Download className="w-3.5 h-3.5" />
                        {isStatusItem ? 'Unduh SW' : 'Unduh Media'}
                      </button>
                    ) : null}

                    <button
                      onClick={() => handleDeleteItem(item.id)}
                      className="p-1.5 bg-rose-100 text-rose-700 border-2 border-black rounded-lg hover:bg-rose-200 active:translate-x-[1px] active:translate-y-[1px] shadow-[1.5px_1.5px_0px_#000]"
                      title="Hapus dari Browser"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* Modal Pratinjau Foto Penuh (Lightbox) */}
      {previewMedia && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={() => setPreviewMedia(null)}
        >
          <div
            className="bg-white border-2 border-black rounded-xl p-3.5 max-w-3xl max-h-[90vh] overflow-hidden flex flex-col space-y-3 shadow-[6px_6px_0px_#000]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b-2 border-black pb-2">
              <span className="font-bold text-xs text-neutral-800">
                Pratinjau Foto • {safeText(previewMedia.senderName)} (+{safeText(previewMedia.senderNumber)})
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
