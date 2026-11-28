import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { io } from 'socket.io-client';
import QRCode from 'qrcode';
import {
  ArrowLeft,
  Image as ImageIcon,
  Film,
  Music,
  Scissors,
  Play,
  Square,
  Send,
  Smartphone,
  QrCode,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Copy,
  Check,
  Volume2,
  VolumeX,
  RefreshCw,
  LogOut,
  ShieldCheck,
  Info,
  Plus,
  Layers,
  Sparkles,
  ArrowRight,
  Activity,
  Eye,
  Trash2
} from 'lucide-react';
import { copyTextToClipboard } from '../../shared/utils/clipboard';
import { isValidPairingPhone, formatPairingCodeDisplay } from '../../shared/utils/waPhoneUtils';
import {
  decodeMediaToAudioBuffer,
  extractWaveformPeaks,
  renderTrimmedAudioBuffer,
  probeVideoMetadata,
  createSnippetPlayer,
  parseDecimalSafe
} from './audioTrimmerEngine';
import {
  validateSourceMediaDimensions,
  createSquareThumbnailDataUrl,
  loadMediaElementFromFile,
  releaseMediaElement,
  buildStickerSendPayload,
  createPlainTestStickerWebpBase64,
  validateSelectedFile
} from './soundStickerComposer';
import WaSoundStickerPreview from './WaSoundStickerPreview';
import StickerQueueList from './StickerQueueList';
import {
  getWaBackendUrl,
  getOrCreateDeviceCredentials,
  getSavedPairingPhone,
  setSavedPairingPhone,
  hasSavedDeviceLink,
  loadDeviceAuthSnapshotLocal,
  saveDeviceAuthSnapshotLocal,
  clearDeviceAuthSnapshotLocal,
  normalizeWaPhone
} from './deviceSessionHelper';

const MAX_VISUAL_FILE_BYTES = 25 * 1024 * 1024;
const MAX_AUDIO_FILE_BYTES = 15 * 1024 * 1024;
const RECOMMENDED_FULL_SEC = 8;
const MAX_CLIP_DURATION_SEC = 8;
const BATCH_DELAY_MS = 1400;

function formatTimeSec(sec = 0) {
  const safe = Math.max(0, parseDecimalSafe(sec, 0));
  const mins = Math.floor(safe / 60);
  const rem = (safe % 60).toFixed(1).padStart(4, '0');
  return `${mins}:${rem}`;
}

function DecimalSecInput({ value, onCommit, ariaLabel }) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(() => String(value ?? 0));

  useEffect(() => {
    if (!focused) {
      setDraft(String(value ?? 0));
    }
  }, [value, focused]);

  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      value={focused ? draft : String(value ?? 0)}
      onFocus={() => {
        setFocused(true);
        setDraft(String(value ?? 0));
      }}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        const normalized = raw.trim().replace(',', '.');
        if (normalized && !normalized.endsWith('.') && /^-?\d+(\.\d+)?$/.test(normalized)) {
          const parsed = parseFloat(normalized);
          if (Number.isFinite(parsed)) onCommit?.(parsed);
        }
      }}
      onBlur={() => {
        setFocused(false);
        const parsed = parseDecimalSafe(draft, value);
        onCommit?.(parsed);
        setDraft(String(parsed));
      }}
      className="flex-1 min-w-0 bg-white border border-black px-2 py-1.5 font-mono font-bold text-center"
    />
  );
}

export default function WaSoundStickerView({ onBack, onShowToast }) {
  // ─── NAVIGASI MOBILE & MODE INPUT ───
  const [mobileTab, setMobileTab] = useState('create'); // 'create' | 'queue' | 'wa'
  const [inputMode, setInputMode] = useState('single'); // 'single' | 'multi'

  // ─── 1. MODE A: FOTO/VIDEO & SOUND (1-PER-1 -> ANTREAN) ───
  const [visualFileMeta, setVisualFileMeta] = useState(null);
  const [visualFileObj, setVisualFileObj] = useState(null);
  const [sourceMedia, setSourceMedia] = useState(null);
  const [isVideoSource, setIsVideoSource] = useState(false);
  const [visualPreviewUrl, setVisualPreviewUrl] = useState('');
  const [videoStartSec, setVideoStartSec] = useState(0);
  const [videoEndSec, setVideoEndSec] = useState(8);
  const [visualRejectError, setVisualRejectError] = useState('');
  const [audioRejectError, setAudioRejectError] = useState('');
  const [multiRejectError, setMultiRejectError] = useState('');

  const [cropMode, setCropMode] = useState('cover'); // 'cover' | 'contain'
  const [bgStyle, setBgStyle] = useState('solid'); // 'solid' | 'blur' | 'transparent'
  const [bgColor, setBgColor] = useState('#111827');
  const [motionEffect, setMotionEffect] = useState('static');
  const [stickerText, setStickerText] = useState('');
  const [textPosition, setTextPosition] = useState('bottom');
  const [textSize, setTextSize] = useState(46);
  const [packName, setPackName] = useState('Kuro Sound Sticker');
  const [packPublisher, setPackPublisher] = useState('Kuro Studio');

  // Sound & Waveform Trimmer
  const [audioFileMeta, setAudioFileMeta] = useState(null);
  const [audioFileObj, setAudioFileObj] = useState(null);
  const [audioBuffer, setAudioBuffer] = useState(null);
  const [waveformPeaks, setWaveformPeaks] = useState([]);
  const [trimMode, setTrimMode] = useState('cut'); // 'full' | 'cut'
  const [limitFull15s, setLimitFull15s] = useState(true);
  const [startSec, setStartSec] = useState(0);
  const [endSec, setEndSec] = useState(5);
  const [volume, setVolume] = useState(1.0);
  const [fadeSmooth, setFadeSmooth] = useState(true);

  const [isTestingSound, setIsTestingSound] = useState(false);
  const [testPlayheadSec, setTestPlayheadSec] = useState(0);
  const [isDecodingAudio, setIsDecodingAudio] = useState(false);
  const [isComposingStage1, setIsComposingStage1] = useState(false);

  // Mode B: daftar draft multi video untuk dicek & diatur sebelum masuk antrean atau dikirim
  const [multiMaxCapSec, setMultiMaxCapSec] = useState(8);
  const [isImportingMulti, setIsImportingMulti] = useState(false);
  const [multiDraftItems, setMultiDraftItems] = useState([]);
  const [activeDraftPreviewId, setActiveDraftPreviewId] = useState(null);
  const [activeDraftMedia, setActiveDraftMedia] = useState(null);
  const [playingDraftAudioId, setPlayingDraftAudioId] = useState(null);

  // ─── 3. ANTREAN BATCH ───
  const [stickerQueue, setStickerQueue] = useState([]);
  const [isBatchSending, setIsBatchSending] = useState(false);
  const [batchProgress, setBatchProgress] = useState(null);
  const pendingSendResolversRef = useRef(new Map());
  const activeVisualUrlRef = useRef('');
  const activeDraftMediaRef = useRef(null);
  const activeDraftPreviewIdRef = useRef(null);

  const waveformCanvasRef = useRef(null);
  const trimPlayerRef = useRef(null);
  const draftAudioPlayerRef = useRef(null);
  const visualInputRef = useRef(null);
  const audioInputRef = useRef(null);
  const multiVideoInputRef = useRef(null);
  const multiReplaceAudioInputRef = useRef(null);
  const multiReplaceTargetIdRef = useRef(null);

  // ─── 4. KONEKSI WA TERISOLASI PER-PERANGKAT & KALIBRASI SKEMA ───
  const [{ sessionId, deviceToken }] = useState(() => getOrCreateDeviceCredentials());
  const backendUrl = useMemo(() => getWaBackendUrl(), []);
  const socketRef = useRef(null);
  const onShowToastRef = useRef(onShowToast);
  useEffect(() => {
    onShowToastRef.current = onShowToast;
  }, [onShowToast]);
  const e2eeResetTimerRef = useRef(null);
  const e2eeTestTimerRef = useRef(null);
  const plainStickerTestTimerRef = useRef(null);

  const [socketConnected, setSocketConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [connectedPhone, setConnectedPhone] = useState('');
  const [authMethod, setAuthMethod] = useState('pairing');
  const [pairingPhone, setPairingPhone] = useState(() => getSavedPairingPhone());
  const [pairingCode, setPairingCode] = useState('');
  const [isRequestingPairing, setIsRequestingPairing] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [waError, setWaError] = useState(null);
  const [hasSavedAuth, setHasSavedAuth] = useState(() => hasSavedDeviceLink(sessionId));

  const [isRefreshingE2ee, setIsRefreshingE2ee] = useState(false);
  const [isTestingE2ee, setIsTestingE2ee] = useState(false);
  const [isTestingPlainSticker, setIsTestingPlainSticker] = useState(false);
  const [e2eeDiagStatus, setE2eeDiagStatus] = useState(null);
  const [lastSendResult, setLastSendResult] = useState(null);
  const [deliveryStatus, setDeliveryStatus] = useState(null);
  const [deliveryTraces, setDeliveryTraces] = useState([]);

  const renderOptions = useMemo(
    () => ({
      cropMode,
      bgStyle,
      bgColor,
      motionEffect: isVideoSource ? 'static' : motionEffect,
      stickerText,
      textPosition,
      textSize
    }),
    [cropMode, bgStyle, bgColor, isVideoSource, motionEffect, stickerText, textPosition, textSize]
  );

  useEffect(() => {
    trimPlayerRef.current = createSnippetPlayer();
    draftAudioPlayerRef.current = createSnippetPlayer();
    return () => {
      trimPlayerRef.current?.stop();
      draftAudioPlayerRef.current?.stop();
      if (activeDraftMediaRef.current) {
        releaseMediaElement(activeDraftMediaRef.current.mediaEl, activeDraftMediaRef.current.objectUrl);
        activeDraftMediaRef.current = null;
      }
      if (activeVisualUrlRef.current) {
        try { URL.revokeObjectURL(activeVisualUrlRef.current); } catch {}
      }
      for (const rejector of pendingSendResolversRef.current.values()) {
        try { rejector.reject(new Error('Halaman ditutup.')); } catch {}
      }
      pendingSendResolversRef.current.clear();
    };
  }, []);

  // ─── KONEKSI SOCKET.IO PER-PERANGKAT ───
  useEffect(() => {
    if (!sessionId || !deviceToken) return undefined;
    let unmounted = false;

    fetch(`${backendUrl}/ping`, { mode: 'cors' }).catch(() => {});

    const sock = io(backendUrl, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 12,
      reconnectionDelay: 1500
    });
    socketRef.current = sock;

    const doResume = async () => {
      const snapshot = await loadDeviceAuthSnapshotLocal(sessionId);
      if (unmounted) return;
      sock.emit('resume-session', {
        sessionId,
        deviceToken,
        authSnapshot: snapshot || undefined
      });
    };

    sock.on('connect', () => {
      if (unmounted) return;
      setSocketConnected(true);
      setWaError(null);
      doResume();
    });

    sock.on('disconnect', () => {
      if (unmounted) return;
      setSocketConnected(false);
    });

    sock.on('connect_error', () => {
      if (unmounted) return;
      setSocketConnected(false);
    });

    sock.on('session-status', (data) => {
      if (unmounted || !data) return;
      const st = data.status || 'disconnected';
      setConnectionStatus(st);
      if (st === 'connected') {
        setIsRequestingPairing(false);
        setConnectedPhone(data.phone || '');
        setPairingCode('');
        setQrCodeDataUrl('');
        setWaError(null);
        setHasSavedAuth(true);
      } else if (st === 'pairing_ready' && data.code) {
        setIsRequestingPairing(false);
        setPairingCode(String(data.code));
        setWaError(null);
      } else if (st === 'disconnected') {
        setIsRequestingPairing(false);
        setConnectedPhone('');
        setPairingCode('');
        if (data.reason === 'explicit_logout') {
          clearDeviceAuthSnapshotLocal(sessionId);
          setHasSavedAuth(false);
        } else if (data.reason === 'pairing_expired' && data.message) {
          setWaError(data.message);
        }
      }
    });

    sock.on('pairing-code', (data) => {
      if (unmounted || !data?.code) return;
      setIsRequestingPairing(false);
      setPairingCode(String(data.code));
      setConnectionStatus('pairing_ready');
      setWaError(null);
    });

    const handleQrPayload = async (data) => {
      if (unmounted) return;
      setIsRequestingPairing(false);
      if (data?.qrDataUrl) {
        setQrCodeDataUrl(data.qrDataUrl);
        setConnectionStatus('qr_ready');
        return;
      }
      if (data?.qr) {
        try {
          const url = await QRCode.toDataURL(data.qr, { width: 240, margin: 1 });
          if (!unmounted) {
            setQrCodeDataUrl(url);
            setConnectionStatus('qr_ready');
          }
        } catch {}
      }
    };
    sock.on('qr-code', handleQrPayload);
    sock.on('qr', handleQrPayload);

    sock.on('auth-snapshot-sync', async (data) => {
      if (unmounted) return;
      if (data?.snapshot?.files?.['creds.json'] && (!data.sessionId || data.sessionId === sessionId)) {
        setHasSavedAuth(true);
        await saveDeviceAuthSnapshotLocal(sessionId, deviceToken, data.snapshot, data.updatedAt || Date.now());
      }
    });

    sock.on('session-error', (data) => {
      if (unmounted) return;
      setIsRequestingPairing(false);
      setWaError(data?.message || 'Terjadi gangguan pada koneksi WhatsApp.');
    });

    sock.on('sound-sticker-delivery-trace', (trace) => {
      if (unmounted || !trace) return;
      setDeliveryTraces((prev) => [...prev.slice(-19), trace]);
    });

    sock.on('sound-sticker-delivery-trace-history', (items) => {
      if (unmounted || !Array.isArray(items) || items.length === 0) return;
      setDeliveryTraces(items.slice(-20));
    });

    sock.on('plain-sticker-test-result', (res) => {
      if (unmounted || !res) return;
      if (plainStickerTestTimerRef.current) clearTimeout(plainStickerTestTimerRef.current);
      setIsTestingPlainSticker(false);
      setE2eeDiagStatus({ kind: 'plain_sticker', ...res });
      if (res.ok) {
        onShowToastRef.current?.(res.ackLabel || 'Stiker polos berhasil terkirim ke HP!', 'success');
      } else {
        onShowToastRef.current?.(res.error || 'Tes Stiker Polos gagal.', 'error');
      }
    });

    sock.on('self-e2ee-reset-result', (res) => {
      if (unmounted || !res) return;
      if (e2eeResetTimerRef.current) clearTimeout(e2eeResetTimerRef.current);
      setIsRefreshingE2ee(false);
      setE2eeDiagStatus({ kind: 'reset', ...res });
      if (res.ok) {
        onShowToastRef.current?.(`Kunci E2EE disegarkan (${res.clearedCount || 0} sesi dihapus).`, 'success');
      } else {
        onShowToastRef.current?.(res.error || 'Gagal mereset kunci E2EE.', 'error');
      }
    });

    sock.on('self-e2ee-test-result', (res) => {
      if (unmounted || !res) return;
      if (e2eeTestTimerRef.current) clearTimeout(e2eeTestTimerRef.current);
      setIsTestingE2ee(false);
      setE2eeDiagStatus({ kind: 'test', ...res });
      if (res.ok) {
        onShowToastRef.current?.(res.ackLabel || 'Tes E2EE berhasil terkirim (0 error).', 'success');
      } else {
        onShowToastRef.current?.(res.error || 'Tes E2EE gagal mencapai perangkat.', 'error');
      }
    });

    sock.on('wa-e2ee-refreshed', (res) => {
      if (unmounted) return;
      if (e2eeResetTimerRef.current) clearTimeout(e2eeResetTimerRef.current);
      setIsRefreshingE2ee(false);
      if (res?.ok) {
        onShowToastRef.current?.('Kunci enkripsi E2EE WhatsApp berhasil disegarkan.', 'success');
      } else {
        onShowToastRef.current?.(res?.error || 'Gagal menyegarkan kunci E2EE.', 'error');
      }
    });

    const handleAckEvent = (upd) => {
      if (unmounted || !upd) return;
      if (upd.queueId) {
        setStickerQueue((prev) =>
          prev.map((it) => {
            if (it.id !== upd.queueId && it.messageId !== upd.messageId) return it;
            if (upd.isError) {
              return { ...it, status: 'failed', error: upd.label };
            }
            return {
              ...it,
              status: upd.status >= 3 ? 'delivered' : 'server_ack',
              error: null
            };
          })
        );
      }
      if (upd.messageId) {
        setDeliveryStatus((prev) => {
          if (prev?.messageId && prev.messageId !== upd.messageId) return prev;
          return upd;
        });
      }
    };

    sock.on('sound-sticker-item-ack', handleAckEvent);
    sock.on('sound-sticker-delivery-update', handleAckEvent);

    sock.on('sound-sticker-result', (res) => {
      if (unmounted || !res) return;
      if (res.queueId && pendingSendResolversRef.current.has(res.queueId)) {
        const entry = pendingSendResolversRef.current.get(res.queueId);
        pendingSendResolversRef.current.delete(res.queueId);
        if (res.ok) entry.resolve(res);
        else entry.reject(new Error(res.error || 'Gagal mengirim stiker ke WA.'));
      }

      if (res.ok) {
        setLastSendResult(res);
        setDeliveryStatus((prev) =>
          prev?.messageId === res.messageId
            ? prev
            : { messageId: res.messageId, status: 1, label: 'Terkirim via E2EE (menunggu ACK perangkat)' }
        );
        setWaError(null);
      } else if (!res.queueId) {
        const errText = res.error || 'Gagal mengirim stiker ke WhatsApp.';
        setWaError(errText);
        onShowToastRef.current?.(errText, 'error');
      }
    });

    const handleVisibilityChange = () => {
      if (unmounted) return;
      if (document.visibilityState === 'visible' && !sock.connected) {
        sock.connect();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      unmounted = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (e2eeResetTimerRef.current) clearTimeout(e2eeResetTimerRef.current);
      if (e2eeTestTimerRef.current) clearTimeout(e2eeTestTimerRef.current);
      if (plainStickerTestTimerRef.current) clearTimeout(plainStickerTestTimerRef.current);
      sock.disconnect();
      socketRef.current = null;
    };
  }, [backendUrl, sessionId, deviceToken]);

  // ─── HANDLE UNGGAH VISUAL (MODE A) ───
  const handleSelectVisualFile = async (file) => {
    if (!file) return;
    setVisualRejectError('');
    if (file.size > MAX_VISUAL_FILE_BYTES) {
      const msg = 'Ukuran visual melebihi batas maksimal 25 MB.';
      setVisualRejectError(msg);
      onShowToast?.(msg, 'error');
      return;
    }

    const check = validateSelectedFile(file, 'visual');
    if (!check.ok) {
      setVisualRejectError(check.error);
      onShowToast?.(check.error, 'error');
      return;
    }

    releaseMediaElement(sourceMedia, visualPreviewUrl);

    try {
      const { mediaEl, objectUrl, isVideo: loadedVideo } = await loadMediaElementFromFile(file);
      activeVisualUrlRef.current = objectUrl;
      const vidDur = loadedVideo ? Number(mediaEl.duration || 0) : 0;
      setVisualPreviewUrl(objectUrl);
      setSourceMedia(mediaEl);
      setVisualFileObj(file);
      setIsVideoSource(loadedVideo);
      setVideoStartSec(0);
      setVideoEndSec(loadedVideo && vidDur > 0 ? Number(Math.min(MAX_CLIP_DURATION_SEC, vidDur).toFixed(1)) : 8);
      setVisualFileMeta({
        name: file.name,
        kind: loadedVideo ? 'video' : 'image',
        duration: vidDur,
        width: loadedVideo ? mediaEl.videoWidth : mediaEl.naturalWidth,
        height: loadedVideo ? mediaEl.videoHeight : mediaEl.naturalHeight
      });
      onShowToast?.(`${loadedVideo ? 'Video' : 'Foto'} dimuat ke pratinjau 512×512.`, 'success');
    } catch (err) {
      setVisualPreviewUrl('');
      setSourceMedia(null);
      setVisualFileObj(null);
      setVisualFileMeta(null);
      onShowToast?.(err.message || 'Gagal membaca berkas visual.', 'error');
    }
  };

  const updateSafeVideoStart = (nextStart) => {
    const total = Number(visualFileMeta?.duration) || 8;
    const parsed = parseDecimalSafe(nextStart, 0);
    const s = Number(Math.max(0, Math.min(Math.max(0, total - 0.5), parsed)).toFixed(1));
    let e = parseDecimalSafe(videoEndSec, Math.min(total, s + 5));
    if (e - s < 0.5) e = Number(Math.min(total, s + 0.5).toFixed(1));
    if (e - s > MAX_CLIP_DURATION_SEC) e = Number(Math.min(total, s + MAX_CLIP_DURATION_SEC).toFixed(1));
    setVideoStartSec(s);
    setVideoEndSec(e);
  };

  const updateSafeVideoEnd = (nextEnd) => {
    const total = Number(visualFileMeta?.duration) || 8;
    const parsed = parseDecimalSafe(nextEnd, total);
    const e = Number(Math.max(0.5, Math.min(total, parsed)).toFixed(1));
    let s = parseDecimalSafe(videoStartSec, 0);
    if (e - s < 0.5) s = Number(Math.max(0, e - 0.5).toFixed(1));
    if (e - s > MAX_CLIP_DURATION_SEC) s = Number(Math.max(0, e - MAX_CLIP_DURATION_SEC).toFixed(1));
    setVideoStartSec(s);
    setVideoEndSec(e);
  };

  // ─── HANDLE UNGGAH / EKSTRAK AUDIO (MODE A) ───
  const loadAudioSource = async (file, labelPrefix = '', { allowVideoSource = false } = {}) => {
    if (!file) return;
    setAudioRejectError('');
    if (file.size > MAX_AUDIO_FILE_BYTES && !allowVideoSource) {
      const msg = 'Ukuran file audio melebihi batas maksimal 15 MB.';
      setAudioRejectError(msg);
      onShowToast?.(msg, 'error');
      return;
    }

    if (!allowVideoSource) {
      const check = validateSelectedFile(file, 'audio');
      if (!check.ok) {
        setAudioRejectError(check.error);
        onShowToast?.(check.error, 'error');
        return;
      }
    }

    trimPlayerRef.current?.stop();
    setIsTestingSound(false);
    setIsDecodingAudio(true);

    try {
      const decoded = await decodeMediaToAudioBuffer(file);
      const peaks = extractWaveformPeaks(decoded, 96);
      const capSec = limitFull15s ? RECOMMENDED_FULL_SEC : MAX_CLIP_DURATION_SEC;
      const safeFullEnd = Number(Math.min(decoded.duration, capSec).toFixed(1));
      const initialCutEnd = decoded.duration <= 6 ? safeFullEnd : Number(Math.min(5.0, safeFullEnd).toFixed(1));

      setAudioBuffer(decoded);
      setAudioFileObj(file);
      setWaveformPeaks(peaks);
      setAudioFileMeta({ name: `${labelPrefix}${file.name}`, duration: decoded.duration });
      setTrimMode(decoded.duration <= capSec ? 'full' : 'cut');
      setStartSec(0);
      setEndSec(decoded.duration <= capSec ? safeFullEnd : initialCutEnd);
      onShowToast?.(`Sound dimuat (${decoded.duration.toFixed(1)} detik).`, 'success');
    } catch (err) {
      onShowToast?.(err.message || 'Gagal memproses file sound.', 'error');
    } finally {
      setIsDecodingAudio(false);
    }
  };

  const applyFullModeBounds = useCallback((buf, use15sCap) => {
    if (!buf) return;
    const cap = use15sCap ? RECOMMENDED_FULL_SEC : MAX_CLIP_DURATION_SEC;
    const clampedEnd = Number(Math.max(0.2, Math.min(buf.duration, cap)).toFixed(1));
    setStartSec(0);
    setEndSec(clampedEnd);
  }, []);

  const handleChangeTrimMode = (mode) => {
    setTrimMode(mode);
    if (mode === 'full' && audioBuffer) {
      applyFullModeBounds(audioBuffer, limitFull15s);
    }
  };

  const updateSafeStart = (nextStart) => {
    if (!audioBuffer) return;
    const total = audioBuffer.duration;
    const parsedStart = parseDecimalSafe(nextStart, 0);
    let s = Math.max(0, Math.min(Math.max(0, total - 0.2), parsedStart));
    s = Number(s.toFixed(1));
    const currentEnd = parseDecimalSafe(endSec, Math.min(total, s + 0.5));
    let e = currentEnd;
    if (e - s < 0.2) e = Number(Math.min(total, s + 0.5).toFixed(1));
    if (e - s > MAX_CLIP_DURATION_SEC) e = Number((s + MAX_CLIP_DURATION_SEC).toFixed(1));
    setTrimMode('cut');
    setStartSec(s);
    setEndSec(e);
  };

  const updateSafeEnd = (nextEnd) => {
    if (!audioBuffer) return;
    const total = audioBuffer.duration;
    const parsedEnd = parseDecimalSafe(nextEnd, total);
    let e = Math.max(0.2, Math.min(total, parsedEnd));
    e = Number(e.toFixed(1));
    const currentStart = parseDecimalSafe(startSec, 0);
    let s = currentStart;
    if (e - s < 0.2) s = Number(Math.max(0, e - 0.5).toFixed(1));
    if (e - s > MAX_CLIP_DURATION_SEC) s = Number(Math.max(0, e - MAX_CLIP_DURATION_SEC).toFixed(1));
    setTrimMode('cut');
    setStartSec(s);
    setEndSec(e);
  };

  const effectiveBounds = useMemo(() => {
    if (!audioBuffer || !Number.isFinite(audioBuffer.duration) || audioBuffer.duration <= 0) {
      return { start: 0, end: 0, duration: 0, isValid: false };
    }
    const total = audioBuffer.duration;
    const cap = limitFull15s ? RECOMMENDED_FULL_SEC : MAX_CLIP_DURATION_SEC;
    if (trimMode === 'full') {
      const endFull = Number(Math.max(0.2, Math.min(total, cap)).toFixed(1));
      return { start: 0, end: endFull, duration: endFull, isValid: endFull >= 0.2 };
    }
    const safeS = Math.max(0, Math.min(Math.max(0, total - 0.2), parseDecimalSafe(startSec, 0)));
    const safeE = Math.max(safeS + 0.2, Math.min(total, parseDecimalSafe(endSec, total)));
    const startVal = Number(safeS.toFixed(1));
    const endVal = Number(safeE.toFixed(1));
    const durVal = Number(Math.max(0.2, endVal - startVal).toFixed(1));
    return {
      start: startVal,
      end: endVal,
      duration: durVal,
      isValid: Number.isFinite(durVal) && durVal >= 0.2
    };
  }, [audioBuffer, trimMode, limitFull15s, startSec, endSec]);

  const selectedDuration = effectiveBounds.duration;

  // Gambar Waveform Audio Interaktif
  useEffect(() => {
    const canvas = waveformCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#fafafa';
    ctx.fillRect(0, 0, w, h);

    if (!audioBuffer || waveformPeaks.length === 0) {
      ctx.fillStyle = '#71717a';
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Pilih file sound atau klik "Pakai Suara Video"', w * 0.5, h * 0.54);
      return;
    }

    const totalDur = Math.max(0.1, audioBuffer.duration);
    const startRatio = effectiveBounds.start / totalDur;
    const endRatio = effectiveBounds.end / totalDur;

    const selX = startRatio * w;
    const selW = Math.max(2, (endRatio - startRatio) * w);
    ctx.fillStyle = 'rgba(16, 185, 129, 0.22)';
    ctx.fillRect(selX, 0, selW, h);

    const barCount = waveformPeaks.length;
    const stepW = w / barCount;
    for (let i = 0; i < barCount; i++) {
      const ratio = (i + 0.5) / barCount;
      const inZone = ratio >= startRatio && ratio <= endRatio;
      const barH = Math.max(4, waveformPeaks[i] * (h - 14));
      const x = i * stepW + 1;
      const y = (h - barH) * 0.5;
      ctx.fillStyle = inZone ? '#059669' : '#cbd5e1';
      ctx.fillRect(x, y, Math.max(2, stepW - 2), barH);
    }

    ctx.fillStyle = '#000000';
    ctx.fillRect(Math.max(0, selX - 1), 0, 2, h);
    ctx.fillRect(Math.min(w - 2, selX + selW - 1), 0, 2, h);

    if (isTestingSound) {
      const playAbs = Math.min(totalDur, effectiveBounds.start + testPlayheadSec);
      const px = (playAbs / totalDur) * w;
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(px - 1, 0, 2, h);
    }
  }, [audioBuffer, waveformPeaks, effectiveBounds, isTestingSound, testPlayheadSec]);

  const handleWaveformClick = (e) => {
    if (!audioBuffer || !waveformCanvasRef.current) return;
    const rect = waveformCanvasRef.current.getBoundingClientRect();
    const clickRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
    const clickedSec = Number((clickRatio * audioBuffer.duration).toFixed(1));
    const distToStart = Math.abs(clickedSec - effectiveBounds.start);
    const distToEnd = Math.abs(clickedSec - effectiveBounds.end);
    if (distToStart <= distToEnd) updateSafeStart(clickedSec);
    else updateSafeEnd(clickedSec);
  };

  const handleToggleTestSound = async () => {
    if (!audioBuffer) return;
    if (isTestingSound) {
      trimPlayerRef.current?.stop();
      setIsTestingSound(false);
      setTestPlayheadSec(0);
      return;
    }

    setIsTestingSound(true);
    setTestPlayheadSec(0);
    await trimPlayerRef.current?.play(audioBuffer, effectiveBounds.start, effectiveBounds.end, volume, {
      fadeSmooth,
      onTick: (sec) => setTestPlayheadSec(sec),
      onEnded: () => {
        setIsTestingSound(false);
        setTestPlayheadSec(0);
      }
    });
  };

  // ─── TAHAP 1 MODE A: GABUNG VIDEO+SOUND & MASUKKAN KE ANTREAN ───
  const handleAddModeAToQueue = async () => {
    if (isComposingStage1) return;
    if (!sourceMedia || !visualFileObj) {
      onShowToast?.('Pilih Foto atau Video di Langkah 1 terlebih dahulu.', 'error');
      return;
    }
    if (!audioBuffer) {
      onShowToast?.('Masukkan Audio/Sound terlebih dahulu.', 'error');
      return;
    }

    setIsComposingStage1(true);
    try {
      validateSourceMediaDimensions(sourceMedia);
      const thumbnailUrl = createSquareThumbnailDataUrl(sourceMedia, renderOptions);

      const stagedMuxedBlob = null;
      const stagedMuxedExt = null;

      const vStart = isVideoSource ? Math.max(0, Number(videoStartSec) || 0) : 0;
      const vTotal = Number(visualFileMeta?.duration) || effectiveBounds.duration;
      const vEnd = isVideoSource
        ? Math.max(vStart + 0.5, Math.min(Math.max(vStart + 0.5, vTotal), Number(videoEndSec) || vTotal))
        : effectiveBounds.duration;

      const itemId = `stk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const newItem = {
        id: itemId,
        title: visualFileMeta?.name || `Stiker #${stickerQueue.length + 1}`,
        sourceKind: 'composed',
        visualKind: isVideoSource ? 'video' : 'image',
        visualFile: visualFileObj,
        audioFile: audioFileObj,
        audioBuffer,
        thumbnailUrl,
        totalDuration: audioBuffer.duration,
        videoDuration: vTotal,
        videoStartSec: vStart,
        videoEndSec: vEnd,
        startSec: effectiveBounds.start,
        endSec: effectiveBounds.end,
        volume,
        fadeSmooth,
        cropMode,
        bgStyle,
        bgColor,
        motionEffect: isVideoSource ? 'static' : motionEffect,
        stickerText,
        textPosition,
        textSize,
        packName,
        packPublisher,
        stagedMuxedBlob,
        stagedMuxedExt,
        status: 'ready',
        error: null
      };

      setStickerQueue((prev) => [...prev, newItem]);
      setStickerText('');
      onShowToast?.('Ditambahkan ke Antrean Stiker Audio!', 'success');
    } catch (err) {
      onShowToast?.(err.message || 'Gagal merakit item antrean.', 'error');
    } finally {
      setIsComposingStage1(false);
    }
  };

  const closeDraftPreview = useCallback(() => {
    draftAudioPlayerRef.current?.stop();
    setPlayingDraftAudioId(null);
    activeDraftPreviewIdRef.current = null;
    setActiveDraftPreviewId(null);
    if (activeDraftMediaRef.current) {
      releaseMediaElement(activeDraftMediaRef.current.mediaEl, activeDraftMediaRef.current.objectUrl);
      activeDraftMediaRef.current = null;
    }
    setActiveDraftMedia(null);
  }, []);

  const openDraftPreview = useCallback(
    async (draftItem) => {
      if (!draftItem?.visualFile) return;
      if (activeDraftPreviewIdRef.current === draftItem.id && activeDraftMediaRef.current) {
        closeDraftPreview();
        return;
      }

      if (activeDraftMediaRef.current) {
        releaseMediaElement(activeDraftMediaRef.current.mediaEl, activeDraftMediaRef.current.objectUrl);
        activeDraftMediaRef.current = null;
      }
      activeDraftPreviewIdRef.current = draftItem.id;
      setActiveDraftPreviewId(draftItem.id);
      setActiveDraftMedia(null);

      try {
        const loaded = await loadMediaElementFromFile(draftItem.visualFile);
        if (activeDraftPreviewIdRef.current !== draftItem.id) {
          releaseMediaElement(loaded.mediaEl, loaded.objectUrl);
          return;
        }
        const mediaState = { itemId: draftItem.id, ...loaded };
        activeDraftMediaRef.current = mediaState;
        setActiveDraftMedia(mediaState);
      } catch (err) {
        if (activeDraftPreviewIdRef.current === draftItem.id) {
          activeDraftPreviewIdRef.current = null;
          setActiveDraftPreviewId(null);
          onShowToast?.(err.message || 'Gagal membuka pratinjau video.', 'error');
        }
      }
    },
    [closeDraftPreview, onShowToast]
  );

  // Tambahkan dan kurasi video terpilih ke daftar draft Mode B sebelum masuk antrean atau kirim
  const handleSelectMultiVideos = async (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    setMultiRejectError('');

    const validVideoFiles = [];
    let rejectedCount = 0;
    for (const f of files) {
      const check = validateSelectedFile(f, 'video_only');
      if (check.ok) validVideoFiles.push(f);
      else rejectedCount++;
    }

    if (rejectedCount > 0) {
      const rejectMsg = `Mode Multi Video hanya menerima file video. ${rejectedCount} file foto/audio ditolak otomatis.`;
      setMultiRejectError(rejectMsg);
      onShowToast?.(rejectMsg, 'error');
    }
    if (validVideoFiles.length === 0) return;

    const remainingSlots = Math.max(0, 10 - multiDraftItems.length);
    if (remainingSlots === 0) {
      onShowToast?.('Daftar cek Multi Video sudah mencapai batas 10 video.', 'error');
      return;
    }
    if (validVideoFiles.length > remainingSlots) {
      onShowToast?.(`Hanya ${remainingSlots} video tambahan yang dimuat (maks 10 video agar browser HP tetap ringan).`, 'info');
    }

    const chosen = validVideoFiles.slice(0, remainingSlots);
    setIsImportingMulti(true);
    const addedItems = [];

    for (const file of chosen) {
      if (file.size > MAX_VISUAL_FILE_BYTES) {
        onShowToast?.(`${file.name} melebihi batas 25 MB, dilewati.`, 'error');
        continue;
      }

      let tempLoaded = null;
      try {
        const meta = await probeVideoMetadata(file);
        tempLoaded = await loadMediaElementFromFile(file);

        let decodedAudio = null;
        let peaks = [];
        let audioStatus = 'missing';
        try {
          decodedAudio = await decodeMediaToAudioBuffer(file);
          peaks = extractWaveformPeaks(decodedAudio, 64);
          audioStatus = 'ready';
        } catch {
          audioStatus = 'missing';
        }

        const capSec = Math.min(MAX_CLIP_DURATION_SEC, Number(multiMaxCapSec) || 8);
        const vClipEnd = Number(Math.max(0.5, Math.min(meta.duration, capSec)).toFixed(1));
        const aTotal = decodedAudio ? decodedAudio.duration : meta.duration;
        const aClipEnd = Number(Math.max(0.2, Math.min(aTotal, capSec)).toFixed(1));

        const itemRenderOpts = {
          cropMode,
          bgStyle: 'solid',
          bgColor: '#111827',
          motionEffect: 'static',
          stickerText: '',
          textPosition: 'bottom',
          textSize: 46
        };
        const thumbUrl = createSquareThumbnailDataUrl(tempLoaded.mediaEl, itemRenderOpts);
        const itemId = `mv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

        addedItems.push({
          id: itemId,
          title: file.name,
          sourceKind: 'multi-video',
          visualKind: 'video',
          visualFile: file,
          audioFile: null,
          audioBuffer: decodedAudio,
          waveformPeaks: peaks,
          audioStatus,
          thumbnailUrl: thumbUrl,
          totalDuration: aTotal,
          videoDuration: meta.duration,
          videoStartSec: 0,
          videoEndSec: vClipEnd,
          startSec: 0,
          endSec: aClipEnd,
          volume: 1.0,
          fadeSmooth: true,
          cropMode,
          bgStyle: 'solid',
          bgColor: '#111827',
          motionEffect: 'static',
          stickerText: '',
          textPosition: 'bottom',
          textSize: 46,
          packName,
          packPublisher,
          status: 'ready',
          error: null
        });
      } catch (err) {
        onShowToast?.(err.message || `Gagal memuat ${file.name}.`, 'error');
      } finally {
        if (tempLoaded) releaseMediaElement(tempLoaded.mediaEl, tempLoaded.objectUrl);
      }
    }

    setIsImportingMulti(false);
    if (addedItems.length > 0) {
      setMultiDraftItems((prev) => [...prev, ...addedItems]);
      onShowToast?.(`${addedItems.length} video dimuat. Cek & atur durasi sebelum masuk antrean atau kirim.`, 'success');
      if (!activeDraftPreviewId) {
        openDraftPreview(addedItems[0]);
      }
    }
  };

  const handleUpdateDraftItem = (id, patch) => {
    setMultiDraftItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };

  const handleRemoveDraftItem = (id) => {
    if (playingDraftAudioId === id) {
      draftAudioPlayerRef.current?.stop();
      setPlayingDraftAudioId(null);
    }
    if (activeDraftPreviewId === id) {
      closeDraftPreview();
    }
    setMultiDraftItems((prev) => prev.filter((it) => it.id !== id));
  };

  const handleToggleDraftAudio = async (draftItem) => {
    if (!draftItem) return;
    if (playingDraftAudioId === draftItem.id) {
      draftAudioPlayerRef.current?.stop();
      setPlayingDraftAudioId(null);
      return;
    }
    if (!draftItem.audioBuffer) {
      onShowToast?.(`"${draftItem.title}" tidak memiliki audio terbaca. Pilih file audio pengganti terlebih dahulu.`, 'error');
      return;
    }
    setPlayingDraftAudioId(draftItem.id);
    await draftAudioPlayerRef.current?.play(
      draftItem.audioBuffer,
      draftItem.startSec || 0,
      draftItem.endSec || Math.min(8, draftItem.audioBuffer.duration),
      draftItem.volume ?? 1,
      {
        fadeSmooth: draftItem.fadeSmooth !== false,
        onEnded: () => setPlayingDraftAudioId((cur) => (cur === draftItem.id ? null : cur))
      }
    );
  };

  const handleAssignDraftAudioFile = async (file) => {
    const targetId = multiReplaceTargetIdRef.current;
    multiReplaceTargetIdRef.current = null;
    if (!file || !targetId) return;

    const check = validateSelectedFile(file, 'audio');
    if (!check.ok) {
      setMultiRejectError(check.error);
      onShowToast?.(check.error, 'error');
      return;
    }
    if (file.size > MAX_AUDIO_FILE_BYTES) {
      const msg = 'Ukuran file audio pengganti melebihi batas maksimal 15 MB.';
      setMultiRejectError(msg);
      onShowToast?.(msg, 'error');
      return;
    }

    try {
      const decoded = await decodeMediaToAudioBuffer(file);
      const peaks = extractWaveformPeaks(decoded, 64);
      const capSec = Math.min(MAX_CLIP_DURATION_SEC, Number(multiMaxCapSec) || 8);
      const nextEnd = Number(Math.max(0.2, Math.min(decoded.duration, capSec)).toFixed(1));
      setMultiDraftItems((prev) =>
        prev.map((it) =>
          it.id === targetId
            ? {
                ...it,
                audioFile: file,
                audioBuffer: decoded,
                waveformPeaks: peaks,
                audioStatus: 'ready',
                totalDuration: decoded.duration,
                startSec: 0,
                endSec: nextEnd
              }
            : it
        )
      );
      setMultiRejectError('');
      onShowToast?.(`Audio "${file.name}" dipasang ke item Multi Video.`, 'success');
    } catch (err) {
      onShowToast?.(err.message || 'Gagal membaca file audio pengganti.', 'error');
    }
  };

  const buildReadyQueueItemsFromDrafts = () => {
    if (multiDraftItems.length === 0) {
      onShowToast?.('Pilih minimal 1 video di Multi Video terlebih dahulu.', 'error');
      return null;
    }
    const silentItems = multiDraftItems.filter((d) => !d.audioBuffer && !d.audioFile);
    if (silentItems.length > 0) {
      const msg = `${silentItems.length} video (${silentItems[0].title}) belum memiliki trek suara. Pasang file audio pengganti atau hapus item tersebut agar stiker tidak bisu.`;
      setMultiRejectError(msg);
      onShowToast?.(msg, 'error');
      return null;
    }
    setMultiRejectError('');
    return multiDraftItems.map((d) => ({
      ...d,
      packName,
      packPublisher,
      status: 'ready',
      error: null
    }));
  };

  const handleAddMultiDraftToQueue = () => {
    const readyItems = buildReadyQueueItemsFromDrafts();
    if (!readyItems) return;
    closeDraftPreview();
    setStickerQueue((prev) => [...prev, ...readyItems]);
    setMultiDraftItems([]);
    onShowToast?.(`${readyItems.length} video bersuara ditambahkan ke Antrean!`, 'success');
  };

  // ─── PREVIEW ITEM ANTREAN KE LIVE STAGE ───
  const handlePreviewQueueItem = async (item) => {
    if (!item?.visualFile) return;
    closeDraftPreview();
    setCropMode(item.cropMode || 'cover');
    setBgStyle(item.bgStyle || 'solid');
    setBgColor(item.bgColor || '#111827');
    setStickerText(item.stickerText || '');
    setPackName(item.packName || 'Kuro Sound Sticker');
    setPackPublisher(item.packPublisher || 'Kuro Studio');

    await handleSelectVisualFile(item.visualFile);
    if (item.videoStartSec !== undefined) setVideoStartSec(item.videoStartSec);
    if (item.videoEndSec !== undefined) setVideoEndSec(item.videoEndSec);

    if (item.audioBuffer) {
      setAudioBuffer(item.audioBuffer);
      setAudioFileObj(item.audioFile || null);
      setAudioFileMeta({
        name: item.audioFile?.name || `[Audio] ${item.title}`,
        duration: item.audioBuffer.duration
      });
      setWaveformPeaks(item.waveformPeaks?.length ? item.waveformPeaks : extractWaveformPeaks(item.audioBuffer, 96));
      setStartSec(item.startSec || 0);
      setEndSec(item.endSec || Math.min(8, item.audioBuffer.duration));
    } else {
      await loadAudioSource(item.audioFile || item.visualFile, item.audioFile ? '' : '[Video] ', { allowVideoSource: !item.audioFile });
      setStartSec(item.startSec || 0);
      setEndSec(item.endSec || 5);
    }
    setInputMode('single');
    setMobileTab('create');
  };

  // ─── KIRIM 1 ITEM (LANGSUNG / RETRY / BAGIAN DARI BATCH) ───
  const sendSingleQueueItem = useCallback(
    async (item) => {
      if (!socketRef.current || connectionStatus !== 'connected') {
        throw new Error('Perangkat WA belum tertaut aktif.');
      }

      setStickerQueue((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, status: 'composing', error: null } : it))
      );

      const payload = await buildStickerSendPayload({
        item
      });

      setStickerQueue((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, status: 'sending', error: null } : it))
      );

      const res = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pendingSendResolversRef.current.delete(item.id);
          reject(new Error('Batas waktu tunggu server (30s) terlampaui.'));
        }, 30000);

        pendingSendResolversRef.current.set(item.id, {
          resolve: (r) => {
            clearTimeout(timer);
            resolve(r);
          },
          reject: (e) => {
            clearTimeout(timer);
            reject(e);
          }
        });

        socketRef.current.emit('send-self-sound-sticker', {
          sessionId,
          deviceToken,
          ...payload
        });
      });

      setStickerQueue((prev) =>
        prev.map((it) =>
          it.id === item.id
            ? {
                ...it,
                messageId: res.messageId,
                status: it.status === 'delivered' ? 'delivered' : 'server_ack',
                error: null
              }
            : it
        )
      );

      return res;
    },
    [connectionStatus, deviceToken, sessionId]
  );

  // Kirim Langsung 1 Ini dari Mode A
  const handleSendCurrentSingle = async () => {
    if (isBatchSending) return;
    if (!sourceMedia || !visualFileObj || !audioBuffer) {
      onShowToast?.('Lengkapi visual dan audio terlebih dahulu.', 'error');
      return;
    }
    if (connectionStatus !== 'connected') {
      onShowToast?.('Tautkan WhatsApp terlebih dahulu.', 'error');
      setMobileTab('wa');
      return;
    }

    const vStart = isVideoSource ? Math.max(0, Number(videoStartSec) || 0) : 0;
    const vTotal = Number(visualFileMeta?.duration) || effectiveBounds.duration;
    const vEnd = isVideoSource
      ? Math.max(vStart + 0.5, Math.min(Math.max(vStart + 0.5, vTotal), Number(videoEndSec) || vTotal))
      : effectiveBounds.duration;

    const tempItem = {
      id: `direct_${Date.now()}`,
      title: visualFileMeta?.name || 'Stiker Suara',
      sourceKind: 'composed',
      visualKind: isVideoSource ? 'video' : 'image',
      visualFile: visualFileObj,
      audioFile: audioFileObj,
      audioBuffer,
      thumbnailUrl: createSquareThumbnailDataUrl(sourceMedia, renderOptions),
      totalDuration: audioBuffer.duration,
      videoDuration: vTotal,
      videoStartSec: vStart,
      videoEndSec: vEnd,
      startSec: effectiveBounds.start,
      endSec: effectiveBounds.end,
      volume,
      fadeSmooth,
      cropMode,
      bgStyle,
      bgColor,
      motionEffect: isVideoSource ? 'static' : motionEffect,
      stickerText,
      textPosition,
      textSize,
      packName,
      packPublisher,
      status: 'composing',
      error: null
    };

    setIsBatchSending(true);
    setBatchProgress({ current: 1, total: 1, label: 'Merakit & mengirim Stiker ke WA...' });
    try {
      await sendSingleQueueItem(tempItem);
      onShowToast?.('Stiker terkirim ke chat WA Anda sendiri!', 'success');
    } catch (err) {
      setWaError(err.message || 'Gagal mengirim stiker.');
      onShowToast?.(err.message || 'Gagal mengirim stiker.', 'error');
    } finally {
      setIsBatchSending(false);
      setBatchProgress(null);
    }
  };

  const executeSequentialSendList = async (targets) => {
    if (!targets || targets.length === 0) return;
    setIsBatchSending(true);
    let okCount = 0;

    try {
      for (let i = 0; i < targets.length; i++) {
        const item = targets[i];
        setBatchProgress({
          current: i + 1,
          total: targets.length,
          label: `Mengirim Stiker ${i + 1} dari ${targets.length}: ${item.title}`
        });

        try {
          await sendSingleQueueItem(item);
          okCount++;
        } catch (err) {
          setStickerQueue((prev) =>
            prev.map((it) => (it.id === item.id ? { ...it, status: 'failed', error: err.message } : it))
          );
        }

        if (i < targets.length - 1) {
          await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
        }
      }
    } finally {
      setIsBatchSending(false);
      setBatchProgress(null);
    }

    if (okCount === targets.length) {
      onShowToast?.(`${okCount} Stiker berhasil dikirim ke chat WA Anda!`, 'success');
    } else {
      onShowToast?.(`${okCount}/${targets.length} terkirim. Item gagal dapat dicoba ulang di tab Antrean.`, 'info');
    }
  };

  // Kirim Semua Antrean Berurutan (Jeda 1400ms Antar Item)
  const handleSendAllQueue = async () => {
    if (isBatchSending) return;
    if (connectionStatus !== 'connected') {
      onShowToast?.('Tautkan WhatsApp terlebih dahulu di Koneksi WA.', 'error');
      setMobileTab('wa');
      return;
    }

    const targets = stickerQueue.filter((it) => it.status !== 'delivered' && it.status !== 'server_ack');
    await executeSequentialSendList(targets);
  };

  const handleSendMultiDraftNow = async () => {
    if (isBatchSending) return;
    const readyItems = buildReadyQueueItemsFromDrafts();
    if (!readyItems) return;
    if (connectionStatus !== 'connected') {
      onShowToast?.('Tautkan WhatsApp terlebih dahulu di Koneksi WA.', 'error');
      setMobileTab('wa');
      return;
    }
    closeDraftPreview();
    setStickerQueue((prev) => [...prev, ...readyItems]);
    setMultiDraftItems([]);
    await executeSequentialSendList(readyItems);
  };

  const handleRetryQueueItem = async (item) => {
    if (isBatchSending || connectionStatus !== 'connected') return;
    setIsBatchSending(true);
    setBatchProgress({ current: 1, total: 1, label: `Mengirim ulang ${item.title}...` });
    try {
      await sendSingleQueueItem(item);
      onShowToast?.(`${item.title} berhasil dikirim ulang!`, 'success');
    } catch (err) {
      setStickerQueue((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, status: 'failed', error: err.message } : it))
      );
      onShowToast?.(err.message || 'Gagal kirim ulang.', 'error');
    } finally {
      setIsBatchSending(false);
      setBatchProgress(null);
    }
  };

  // ─── TAUTAN WHATSAPP & DETEKSI FORMAT ───
  const handleStartPairing = (method) => {
    const sock = socketRef.current;
    if (!sock || !socketConnected) {
      onShowToast?.('Menghubungkan ke server WA... Coba beberapa detik lagi.', 'info');
      return;
    }

    setWaError(null);
    if (method === 'pairing') {
      if (isRequestingPairing) return;
      const clean = normalizeWaPhone(pairingPhone);
      if (!isValidPairingPhone(clean)) {
        onShowToast?.('Masukkan nomor WA valid diawali 628xxx atau 08xxx (9–15 digit).', 'error');
        return;
      }
      setSavedPairingPhone(clean);
      setIsRequestingPairing(true);
      setPairingCode('');
      setConnectionStatus('connecting');
      sock.emit('start-session', {
        sessionId,
        deviceToken,
        authMethod: 'pairing',
        pairingPhone: clean,
        forceNew: true
      });
    } else {
      setIsRequestingPairing(false);
      setQrCodeDataUrl('');
      setConnectionStatus('generating_qr');
      sock.emit('start-session', {
        sessionId,
        deviceToken,
        authMethod: 'qr',
        forceNew: true
      });
    }
  };

  const handleLogoutWa = () => {
    socketRef.current?.emit('logout-session', { sessionId, deviceToken });
    clearDeviceAuthSnapshotLocal(sessionId);
    setHasSavedAuth(false);
    setConnectedPhone('');
    setPairingCode('');
    setQrCodeDataUrl('');
    setLastSendResult(null);
    setDeliveryStatus(null);
    setConnectionStatus('disconnected');
  };

  const handleRefreshE2ee = () => {
    if (connectionStatus !== 'connected' || !socketRef.current || isRefreshingE2ee) return;
    if (e2eeResetTimerRef.current) clearTimeout(e2eeResetTimerRef.current);
    setIsRefreshingE2ee(true);
    setE2eeDiagStatus(null);
    socketRef.current.emit('reset-self-e2ee-keys', { sessionId, deviceToken });
    e2eeResetTimerRef.current = setTimeout(() => setIsRefreshingE2ee(false), 12000);
  };

  const handleTestSelfE2ee = () => {
    if (connectionStatus !== 'connected' || !socketRef.current || isTestingE2ee || isTestingPlainSticker) return;
    if (e2eeTestTimerRef.current) clearTimeout(e2eeTestTimerRef.current);
    setIsTestingE2ee(true);
    setE2eeDiagStatus(null);
    setDeliveryTraces([]);
    socketRef.current.emit('test-self-e2ee', { sessionId, deviceToken });
    e2eeTestTimerRef.current = setTimeout(() => setIsTestingE2ee(false), 10000);
  };

  const handleTestPlainSticker = async () => {
    if (connectionStatus !== 'connected' || !socketRef.current || isTestingPlainSticker || isTestingE2ee) return;
    if (plainStickerTestTimerRef.current) clearTimeout(plainStickerTestTimerRef.current);
    setIsTestingPlainSticker(true);
    setE2eeDiagStatus(null);
    setDeliveryTraces([]);
    try {
      const stickerWebpBase64 = await createPlainTestStickerWebpBase64(packName, packPublisher);
      socketRef.current.emit('test-plain-sticker', { sessionId, deviceToken, stickerWebpBase64 });
      plainStickerTestTimerRef.current = setTimeout(() => setIsTestingPlainSticker(false), 12000);
    } catch (err) {
      setIsTestingPlainSticker(false);
      onShowToast?.(err.message || 'Gagal menyiapkan stiker uji WebP.', 'error');
    }
  };

  const renderSendOutcomeCard = () => {
    if (!lastSendResult?.ok) return null;
    const isAudioSticker = lastSendResult.isAudioSticker !== false;
    const webpKb = Number.isFinite(Number(lastSendResult.webpBytes))
      ? `${(Number(lastSendResult.webpBytes) / 1024).toFixed(1)} KB`
      : null;
    const oggKb = Number.isFinite(Number(lastSendResult.oggBytes))
      ? `${(Number(lastSendResult.oggBytes) / 1024).toFixed(1)} KB`
      : null;
    const durLabel = Number.isFinite(Number(lastSendResult.durationSec))
      ? `${Number(lastSendResult.durationSec).toFixed(1)}s`
      : null;

    return (
      <div
        className={`p-3 border-2 border-black shadow-[3px_3px_0px_#000] text-[11px] font-semibold space-y-2 ${
          isAudioSticker ? 'bg-emerald-100 text-emerald-950' : 'bg-amber-50 text-black'
        }`}
      >
        <div className="font-black flex items-center justify-between gap-1.5 flex-wrap">
          <span className="flex items-center gap-1.5">
            {isAudioSticker ? (
              <Volume2 className="w-4 h-4 text-emerald-700 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-amber-700 shrink-0" />
            )}
            <span>
              {isAudioSticker
                ? 'Stiker Audio Terkirim ke WA Anda ✓✓'
                : 'Stiker Polos Terkirim ke WA Anda ✓✓'}
            </span>
          </span>
          {lastSendResult.messageId && (
            <span className="font-mono text-[10px] px-1.5 py-0.5 bg-white border border-black">
              #{String(lastSendResult.messageId).slice(-8)}
            </span>
          )}
        </div>

        <div className="text-[10px] font-mono text-neutral-800">
          Status: {deliveryStatus?.label || 'Terkirim via Protokol Native #134'}
        </div>

        {(webpKb || oggKb || durLabel) && (
          <div className="flex flex-wrap gap-1.5 font-mono text-[10px] font-bold text-black">
            {webpKb && (
              <span className="px-2 py-0.5 bg-white border border-black">
                WebP: {webpKb}
              </span>
            )}
            {oggKb && (
              <span className="px-2 py-0.5 bg-white border border-black">
                Audio Ogg/Opus: {oggKb}
              </span>
            )}
            {durLabel && (
              <span className="px-2 py-0.5 bg-white border border-black">
                Durasi: {durLabel}
              </span>
            )}
          </div>
        )}

        {lastSendResult.reason && (
          <p className="text-[10px] text-neutral-700 leading-snug">{lastSendResult.reason}</p>
        )}

        {deliveryTraces.length > 0 && (
          <div className="pt-1 border-t border-black/20 font-mono text-[9px] text-neutral-700 space-y-0.5">
            {deliveryTraces.slice(-3).map((t, idx) => (
              <div key={`${t.at}-${idx}`} className="truncate">
                [{t.phase || t.event}] #{String(t.messageId || '').slice(-6)} {t.detail}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-3 sm:px-6 py-3 sm:py-6 pb-20 lg:pb-8 space-y-4 overflow-x-hidden min-w-0">
      {/* Header Studio */}
      <header className="bg-white border-2 border-black shadow-[4px_4px_0px_#000] p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="w-10 h-10 flex items-center justify-center bg-white hover:bg-neutral-100 border-2 border-black shadow-[2px_2px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer shrink-0"
            title="Kembali ke Beranda"
            aria-label="Kembali ke Beranda"
          >
            <ArrowLeft className="w-4 h-4 stroke-[2.5]" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base sm:text-xl font-black uppercase tracking-tight text-black flex items-center gap-1.5">
                <Volume2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>Stiker Suara WA</span>
              </h1>
              <span className="px-2 py-0.5 bg-emerald-300 border border-black font-mono font-black text-[10px]">
                STIKER AUDIO
              </span>
            </div>
            <p className="text-xs text-neutral-700 font-semibold mt-0.5 leading-snug">
              Rakit stiker 1:1 bersuara, kumpulkan di antrean, lalu kirim sekaligus langsung ke chat WhatsApp Anda.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setMobileTab('wa')}
          className={`px-2.5 py-1.5 border-2 border-black font-mono font-black text-[10px] self-start sm:self-center shrink-0 cursor-pointer ${
            connectionStatus === 'connected' ? 'bg-emerald-300 text-black' : 'bg-yellow-200 text-black'
          }`}
        >
          {connectionStatus === 'connected' ? `WA AKTIF +${connectedPhone}` : 'WA BELUM TERTAUT'}
        </button>
      </header>

      {/* Navigasi 3 Tab Mobile (< 1024px) */}
      <nav className="grid grid-cols-3 border-2 border-black bg-white shadow-[3px_3px_0px_#000] lg:hidden">
        <button
          type="button"
          onClick={() => setMobileTab('create')}
          className={`py-2.5 px-2 font-black text-xs min-h-[42px] truncate cursor-pointer ${
            mobileTab === 'create' ? 'bg-black text-yellow-300' : 'text-black hover:bg-neutral-100'
          }`}
        >
          Buat Stiker
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('queue')}
          className={`py-2.5 px-2 font-black text-xs border-l-2 border-black min-h-[42px] truncate cursor-pointer ${
            mobileTab === 'queue' ? 'bg-black text-emerald-300' : 'text-black hover:bg-neutral-100'
          }`}
        >
          Antrean ({stickerQueue.length})
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('wa')}
          className={`py-2.5 px-2 font-black text-xs border-l-2 border-black min-h-[42px] truncate cursor-pointer ${
            mobileTab === 'wa' ? 'bg-black text-cyan-300' : 'text-black hover:bg-neutral-100'
          }`}
        >
          Koneksi WA
        </button>
      </nav>

      {/* Workspace 2 Kolom Responsif */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* ─── KOLOM KIRI: 2-MODE CREATOR & LIVE PREVIEW ─── */}
        <div className={`lg:col-span-7 space-y-4 min-w-0 ${mobileTab === 'create' ? 'block' : 'hidden lg:block'}`}>
          {/* Switcher Mode A vs Mode B */}
          <div className="grid grid-cols-2 border-2 border-black bg-white shadow-[4px_4px_0px_#000]">
            <button
              type="button"
              onClick={() => {
                closeDraftPreview();
                setInputMode('single');
              }}
              className={`py-2.5 px-2 sm:px-3 font-black text-[11px] sm:text-sm flex items-center justify-center gap-1 min-h-[44px] cursor-pointer whitespace-nowrap ${
                inputMode === 'single' ? 'bg-yellow-300 text-black' : 'bg-white text-neutral-700 hover:bg-neutral-50'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span>Foto/Video + Sound</span>
            </button>
            <button
              type="button"
              onClick={() => {
                trimPlayerRef.current?.stop();
                setIsTestingSound(false);
                setInputMode('multi');
              }}
              className={`py-2.5 px-2 sm:px-3 font-black text-[11px] sm:text-sm border-l-2 border-black flex items-center justify-center gap-1 min-h-[44px] cursor-pointer whitespace-nowrap ${
                inputMode === 'multi' ? 'bg-cyan-300 text-black' : 'bg-white text-neutral-700 hover:bg-neutral-50'
              }`}
            >
              <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span>Multi Video</span>
            </button>
          </div>

          {inputMode === 'single' ? (
            <>
              {/* MODE A — LANGKAH 1: VISUAL STIKER (FOTO ATAU VIDEO) */}
              <section className="bg-white border-2 border-black shadow-[4px_4px_0px_#000] p-3.5 sm:p-4 space-y-3.5 min-w-0">
                <div className="flex items-start justify-between gap-2 pb-2 border-b-2 border-black flex-wrap">
                  <div className="flex items-center gap-2 min-w-0 flex-wrap">
                    <span className="px-2 py-0.5 bg-yellow-300 border border-black font-black text-[10px] uppercase whitespace-nowrap shrink-0">
                      Langkah 1
                    </span>
                    <h2 className="font-black text-xs sm:text-sm uppercase text-black leading-tight">
                      Visual Stiker (Foto atau Video)
                    </h2>
                  </div>
                  {visualFileMeta && (
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-neutral-100 border border-black shrink-0">
                      {visualFileMeta.kind === 'video'
                        ? `VIDEO • ${Number(visualFileMeta.duration || 0).toFixed(1)}s`
                        : 'FOTO'} ({visualFileMeta.width}&times;{visualFileMeta.height})
                    </span>
                  )}
                </div>

                <p className="text-[11px] font-semibold text-neutral-700 leading-snug">
                  Pilih 1 foto (JPG/PNG/WebP) atau 1 video pendek (MP4/MOV/WebM) sebagai tampilan stiker 1:1. File audio otomatis ditolak.
                </p>

                <button
                  type="button"
                  onClick={() => visualInputRef.current?.click()}
                  className="w-full p-4 border-2 border-dashed border-black bg-neutral-50 hover:bg-yellow-50 transition-colors flex flex-col items-center justify-center gap-1.5 text-center cursor-pointer min-h-[96px]"
                >
                  <div className="flex items-center gap-2 text-black">
                    <ImageIcon className="w-5 h-5" />
                    <Film className="w-5 h-5" />
                  </div>
                  <span className="font-black text-xs text-black break-all">
                    {visualFileMeta ? `Ganti Visual: ${visualFileMeta.name}` : 'Pilih Foto (JPG/PNG/WebP) atau Video (MP4/MOV/WebM)'}
                  </span>
                  <span className="text-[11px] font-semibold text-neutral-600">
                    Kotak 1:1 otomatis &bull; Diproses lokal di HP (maks 25 MB)
                  </span>
                </button>
                <input
                  ref={visualInputRef}
                  type="file"
                  accept="image/*,video/*"
                  onChange={(e) => {
                    const picked = e.target.files?.[0];
                    e.target.value = '';
                    handleSelectVisualFile(picked);
                  }}
                  className="hidden"
                />

                {visualRejectError && (
                  <div className="p-2.5 bg-rose-50 border-2 border-rose-600 text-[11px] font-bold text-rose-900 flex items-start gap-1.5">
                    <AlertCircle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
                    <span>{visualRejectError}</span>
                  </div>
                )}

                {isVideoSource && visualFileMeta?.duration > 0 && (
                  <div className="p-2.5 bg-yellow-50 border-2 border-black space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="font-black text-[11px] uppercase text-black">
                        Potong Durasi Video (Maks 8 Detik)
                      </span>
                      <span className="px-2 py-0.5 bg-white border border-black font-mono font-bold text-[10px]">
                        Klip: {Math.max(0.5, videoEndSec - videoStartSec).toFixed(1)}s / {Number(visualFileMeta.duration).toFixed(1)}s
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="p-2 bg-white border border-black space-y-1">
                        <div className="flex items-center justify-between font-black text-[11px]">
                          <span>Mulai Video:</span>
                          <span className="font-mono text-emerald-700">{formatTimeSec(videoStartSec)}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => updateSafeVideoStart(videoStartSec - 0.5)}
                            className="px-2 py-1 bg-neutral-100 hover:bg-neutral-200 border border-black font-mono font-black text-[11px] cursor-pointer"
                          >
                            -0.5s
                          </button>
                          <DecimalSecInput
                            ariaLabel="Detik mulai video"
                            value={videoStartSec}
                            onCommit={updateSafeVideoStart}
                          />
                          <button
                            type="button"
                            onClick={() => updateSafeVideoStart(videoStartSec + 0.5)}
                            className="px-2 py-1 bg-neutral-100 hover:bg-neutral-200 border border-black font-mono font-black text-[11px] cursor-pointer"
                          >
                            +0.5s
                          </button>
                        </div>
                      </div>
                      <div className="p-2 bg-white border border-black space-y-1">
                        <div className="flex items-center justify-between font-black text-[11px]">
                          <span>Selesai Video:</span>
                          <span className="font-mono text-emerald-700">{formatTimeSec(videoEndSec)}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => updateSafeVideoEnd(videoEndSec - 0.5)}
                            className="px-2 py-1 bg-neutral-100 hover:bg-neutral-200 border border-black font-mono font-black text-[11px] cursor-pointer"
                          >
                            -0.5s
                          </button>
                          <DecimalSecInput
                            ariaLabel="Detik selesai video"
                            value={videoEndSec}
                            onCommit={updateSafeVideoEnd}
                          />
                          <button
                            type="button"
                            onClick={() => updateSafeVideoEnd(videoEndSec + 0.5)}
                            className="px-2 py-1 bg-neutral-100 hover:bg-neutral-200 border border-black font-mono font-black text-[11px] cursor-pointer"
                          >
                            +0.5s
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="space-y-1">
                    <label className="font-black uppercase text-[10px] text-neutral-700 block">Framing 1:1:</label>
                    <div className="grid grid-cols-2 border-2 border-black bg-white">
                      <button
                        type="button"
                        onClick={() => setCropMode('cover')}
                        className={`py-2 px-2 font-black text-[11px] min-h-[38px] cursor-pointer ${
                          cropMode === 'cover' ? 'bg-black text-yellow-300' : 'hover:bg-neutral-100'
                        }`}
                      >
                        Crop Penuh
                      </button>
                      <button
                        type="button"
                        onClick={() => setCropMode('contain')}
                        className={`py-2 px-2 font-black text-[11px] border-l-2 border-black min-h-[38px] cursor-pointer ${
                          cropMode === 'contain' ? 'bg-black text-yellow-300' : 'hover:bg-neutral-100'
                        }`}
                      >
                        Pas (Fit)
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="font-black uppercase text-[10px] text-neutral-700 block">Latar Belakang:</label>
                    <div className="flex items-center gap-2">
                      <select
                        value={bgStyle}
                        onChange={(e) => setBgStyle(e.target.value)}
                        className="flex-1 bg-white border-2 border-black p-2 font-bold text-xs cursor-pointer min-h-[38px]"
                      >
                        <option value="solid">Warna Solid</option>
                        <option value="blur">Blur Otomatis</option>
                        <option value="transparent">Transparan</option>
                      </select>
                      {bgStyle === 'solid' && (
                        <input
                          type="color"
                          value={bgColor}
                          onChange={(e) => setBgColor(e.target.value)}
                          className="w-10 h-9 border-2 border-black bg-white p-0.5 cursor-pointer shrink-0"
                          aria-label="Warna latar stiker"
                        />
                      )}
                    </div>
                  </div>

                  {!isVideoSource && (
                    <div className="space-y-1">
                      <label className="font-black uppercase text-[10px] text-neutral-700 block">Efek Gerak Foto:</label>
                      <select
                        value={motionEffect}
                        onChange={(e) => setMotionEffect(e.target.value)}
                        className="w-full bg-white border-2 border-black p-2 font-bold text-xs cursor-pointer min-h-[38px]"
                      >
                        <option value="static">Diam (Statis)</option>
                        <option value="zoom">Zoom Halus</option>
                        <option value="bounce">Denyut Irama</option>
                        <option value="wobble">Goyang Meme</option>
                      </select>
                    </div>
                  )}

                  <div className={`space-y-1 ${isVideoSource ? 'sm:col-span-2' : ''}`}>
                    <label className="font-black uppercase text-[10px] text-neutral-700 block">
                      Teks Meme Stiker (Opsional):
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={stickerText}
                        maxLength={40}
                        onChange={(e) => setStickerText(e.target.value)}
                        placeholder="Contoh: JAWA JAWA JAWA"
                        className="flex-1 min-w-0 bg-white border-2 border-black px-2.5 py-2 font-bold text-xs min-h-[38px]"
                      />
                      <select
                        value={textPosition}
                        onChange={(e) => setTextPosition(e.target.value)}
                        className="bg-white border-2 border-black p-2 font-bold text-xs cursor-pointer min-h-[38px]"
                      >
                        <option value="bottom">Bawah</option>
                        <option value="middle">Tengah</option>
                        <option value="top">Atas</option>
                      </select>
                    </div>
                  </div>

                  {stickerText.trim() && (
                    <div className="sm:col-span-2 space-y-1">
                      <div className="flex justify-between font-bold text-[11px]">
                        <span>Ukuran Teks:</span>
                        <span className="font-mono">{textSize}px</span>
                      </div>
                      <input
                        type="range"
                        min="28"
                        max="64"
                        step="2"
                        value={textSize}
                        onChange={(e) => setTextSize(Number(e.target.value))}
                        className="w-full accent-black cursor-pointer h-2"
                      />
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="font-black uppercase text-[10px] text-neutral-700 block">Nama Pack:</label>
                    <input
                      type="text"
                      value={packName}
                      maxLength={50}
                      onChange={(e) => setPackName(e.target.value)}
                      className="w-full bg-white border-2 border-black px-2.5 py-1.5 font-bold text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-black uppercase text-[10px] text-neutral-700 block">Pembuat:</label>
                    <input
                      type="text"
                      value={packPublisher}
                      maxLength={50}
                      onChange={(e) => setPackPublisher(e.target.value)}
                      className="w-full bg-white border-2 border-black px-2.5 py-1.5 font-bold text-xs"
                    />
                  </div>
                </div>
              </section>

              {/* MODE A — LANGKAH 2: SUARA STIKER (FILE AUDIO) */}
              <section className="bg-white border-2 border-black shadow-[4px_4px_0px_#000] p-3.5 sm:p-4 space-y-3.5 min-w-0">
                <div className="flex items-start justify-between gap-2 pb-2 border-b-2 border-black flex-wrap">
                  <div className="flex items-center gap-2 min-w-0 flex-wrap">
                    <span className="px-2 py-0.5 bg-cyan-300 border border-black font-black text-[10px] uppercase whitespace-nowrap shrink-0">
                      Langkah 2
                    </span>
                    <h2 className="font-black text-xs sm:text-sm uppercase text-black flex items-center gap-1.5 leading-tight">
                      <Scissors className="w-4 h-4 shrink-0" />
                      <span>Suara Stiker (File Audio)</span>
                    </h2>
                  </div>
                  {audioFileMeta && (
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-emerald-100 border border-black shrink-0">
                      Asli: {audioFileMeta.duration.toFixed(1)}s
                    </span>
                  )}
                </div>

                <p className="text-[11px] font-semibold text-neutral-700 leading-snug">
                  Pilih file suara (MP3/WAV/OGG/M4A/AAC) untuk audio stiker. Foto &amp; video otomatis ditolak di sini.
                </p>

                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    onClick={() => audioInputRef.current?.click()}
                    disabled={isDecodingAudio}
                    className="flex-1 p-3 border-2 border-black bg-neutral-50 hover:bg-cyan-50 font-black text-xs flex items-center justify-center gap-2 cursor-pointer min-w-0 min-h-[42px]"
                  >
                    {isDecodingAudio ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <Music className="w-4 h-4 shrink-0" />}
                    <span className="truncate">
                      {audioFileMeta ? `Ganti Audio (${audioFileMeta.name})` : 'Pilih File Audio (MP3/WAV/OGG/M4A/AAC)'}
                    </span>
                  </button>
                  <input
                    ref={audioInputRef}
                    type="file"
                    onChange={(e) => {
                      const picked = e.target.files?.[0];
                      e.target.value = '';
                      loadAudioSource(picked);
                    }}
                    className="hidden"
                  />

                  {isVideoSource && visualFileObj && (
                    <button
                      type="button"
                      onClick={() => loadAudioSource(visualFileObj, '[Suara Video] ', { allowVideoSource: true })}
                      disabled={isDecodingAudio}
                      className="px-3 py-2.5 bg-yellow-300 hover:bg-yellow-400 border-2 border-black shadow-[2px_2px_0px_#000] font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer shrink-0 min-h-[42px]"
                    >
                      <Film className="w-4 h-4" />
                      <span>Pakai Suara Video</span>
                    </button>
                  )}
                </div>

                {audioRejectError && (
                  <div className="p-2.5 bg-rose-50 border-2 border-rose-600 text-[11px] font-bold text-rose-900 flex items-start gap-1.5">
                    <AlertCircle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
                    <span>{audioRejectError}</span>
                  </div>
                )}

                <div className="grid grid-cols-2 border-2 border-black bg-white">
                  <button
                    type="button"
                    onClick={() => handleChangeTrimMode('full')}
                    className={`py-2 px-3 font-black text-xs min-h-[38px] cursor-pointer ${
                      trimMode === 'full' ? 'bg-black text-cyan-300' : 'hover:bg-neutral-100'
                    }`}
                  >
                    Full (Maks 8s)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleChangeTrimMode('cut')}
                    className={`py-2 px-3 font-black text-xs border-l-2 border-black min-h-[38px] cursor-pointer ${
                      trimMode === 'cut' ? 'bg-black text-cyan-300' : 'hover:bg-neutral-100'
                    }`}
                  >
                    Atur Detik (Potong)
                  </button>
                </div>

                {trimMode === 'full' && audioBuffer && audioBuffer.duration > RECOMMENDED_FULL_SEC && (
                  <div className="p-2.5 bg-amber-50 border border-black text-[11px] font-semibold flex items-center justify-between gap-2 flex-wrap">
                    <span className="flex items-center gap-1.5">
                      <Info className="w-4 h-4 text-amber-700 shrink-0" />
                      Durasi &gt; 8s. Batasi 8s agar ukuran aman?
                    </span>
                    <label className="flex items-center gap-1.5 font-black cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={limitFull15s}
                        onChange={(e) => {
                          const next = e.target.checked;
                          setLimitFull15s(next);
                          applyFullModeBounds(audioBuffer, next);
                        }}
                        className="w-4 h-4 accent-black"
                      />
                      <span>Batasi 8s</span>
                    </label>
                  </div>
                )}

                <div className="border-2 border-black bg-neutral-50 overflow-hidden">
                  <canvas
                    ref={waveformCanvasRef}
                    width={640}
                    height={88}
                    onClick={handleWaveformClick}
                    className="w-full h-22 block cursor-pointer"
                    title="Ketuk waveform untuk mengatur titik mulai atau selesai"
                  />
                </div>

                {audioBuffer && (
                  <div className="space-y-3 text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div className="p-2 bg-neutral-50 border border-black space-y-1">
                        <div className="flex items-center justify-between font-black text-[11px]">
                          <span>Mulai:</span>
                          <span className="font-mono text-emerald-700">{formatTimeSec(effectiveBounds.start)}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => updateSafeStart(effectiveBounds.start - 0.5)}
                            className="px-2.5 py-1.5 bg-white hover:bg-neutral-200 border border-black font-mono font-black text-[11px] cursor-pointer"
                          >
                            -0.5s
                          </button>
                          <DecimalSecInput
                            ariaLabel="Detik mulai sound"
                            value={effectiveBounds.start}
                            onCommit={updateSafeStart}
                          />
                          <button
                            type="button"
                            onClick={() => updateSafeStart(effectiveBounds.start + 0.5)}
                            className="px-2.5 py-1.5 bg-white hover:bg-neutral-200 border border-black font-mono font-black text-[11px] cursor-pointer"
                          >
                            +0.5s
                          </button>
                        </div>
                      </div>

                      <div className="p-2 bg-neutral-50 border border-black space-y-1">
                        <div className="flex items-center justify-between font-black text-[11px]">
                          <span>Selesai:</span>
                          <span className="font-mono text-emerald-700">{formatTimeSec(effectiveBounds.end)}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => updateSafeEnd(effectiveBounds.end - 0.5)}
                            className="px-2.5 py-1.5 bg-white hover:bg-neutral-200 border border-black font-mono font-black text-[11px] cursor-pointer"
                          >
                            -0.5s
                          </button>
                          <DecimalSecInput
                            ariaLabel="Detik selesai sound"
                            value={effectiveBounds.end}
                            onCommit={updateSafeEnd}
                          />
                          <button
                            type="button"
                            onClick={() => updateSafeEnd(effectiveBounds.end + 0.5)}
                            className="px-2.5 py-1.5 bg-white hover:bg-neutral-200 border border-black font-mono font-black text-[11px] cursor-pointer"
                          >
                            +0.5s
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 bg-emerald-50 border-2 border-black">
                      <span className="font-black text-xs">
                        Durasi Stiker: <span className="font-mono text-emerald-800">{selectedDuration} detik</span>
                      </span>

                      <button
                        type="button"
                        onClick={handleToggleTestSound}
                        className={`px-3 py-2 border-2 border-black shadow-[2px_2px_0px_#000] font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer min-h-[38px] ${
                          isTestingSound ? 'bg-rose-500 text-white' : 'bg-yellow-300 hover:bg-yellow-400 text-black'
                        }`}
                      >
                        {isTestingSound ? <Square className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-black" />}
                        <span>{isTestingSound ? 'Hentikan Tes' : 'Tes Sound'}</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                      <div>
                        <div className="flex justify-between font-bold text-[11px] mb-1">
                          <span>Volume Sound:</span>
                          <span className="font-mono">{Math.round(volume * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min="0.5"
                          max="1.5"
                          step="0.05"
                          value={volume}
                          onChange={(e) => setVolume(Number(e.target.value))}
                          className="w-full accent-black cursor-pointer h-2"
                        />
                      </div>

                      <label className="flex items-center justify-between gap-2 text-[11px] font-bold cursor-pointer">
                        <span>Fade Halus 40ms</span>
                        <input
                          type="checkbox"
                          checked={fadeSmooth}
                          onChange={(e) => setFadeSmooth(e.target.checked)}
                          className="w-4 h-4 accent-black cursor-pointer"
                        />
                      </label>
                    </div>
                  </div>
                )}
              </section>

              {/* LIVE PREVIEW STIKER + AKSI TAMBAH ANTREAN / KIRIM LANGSUNG */}
              <WaSoundStickerPreview
                sourceMedia={sourceMedia}
                isVideoSource={isVideoSource}
                audioBuffer={audioBuffer}
                waveformPeaks={waveformPeaks}
                startSec={effectiveBounds.start}
                endSec={effectiveBounds.end}
                videoStartSec={videoStartSec}
                videoEndSec={videoEndSec}
                volume={volume}
                fadeSmooth={fadeSmooth}
                renderOptions={renderOptions}
              />

              {(() => {
                const missingMsg = !sourceMedia || !visualFileObj
                  ? 'Pilih Foto atau Video di Langkah 1 untuk mengaktifkan tombol aksi.'
                  : !audioBuffer || !effectiveBounds.isValid
                    ? 'Pilih file Audio / Sound di Langkah 2 untuk mengaktifkan tombol aksi.'
                    : isComposingStage1
                      ? 'Sedang menyiapkan item ke antrean...'
                      : isBatchSending
                        ? 'Sedang mengirim stiker ke WhatsApp...'
                        : null;
                const canQueue = Boolean(sourceMedia && visualFileObj && audioBuffer && effectiveBounds.isValid && !isComposingStage1);
                const canSend = Boolean(canQueue && !isBatchSending);

                return (
                  <div className="space-y-2">
                    {missingMsg && (
                      <div className="px-3 py-2 bg-amber-50 border-2 border-black text-[11px] font-bold text-neutral-800 flex items-center gap-1.5">
                        <Info className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                        <span>{missingMsg}</span>
                      </div>
                    )}
                    {isBatchSending && batchProgress && (
                      <div className="p-2.5 bg-yellow-50 border-2 border-black space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] font-black gap-2">
                          <span className="truncate inline-flex items-center gap-1.5">
                            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                            {batchProgress.label}
                          </span>
                          <span className="font-mono shrink-0">
                            {batchProgress.current}/{batchProgress.total}
                          </span>
                        </div>
                        <div className="w-full h-2.5 bg-white border border-black overflow-hidden">
                          <div
                            style={{ width: `${Math.round((batchProgress.current / Math.max(1, batchProgress.total)) * 100)}%` }}
                            className="h-full bg-emerald-400 transition-all duration-300"
                          />
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={handleAddModeAToQueue}
                        disabled={!canQueue}
                        className="w-full py-3 px-4 bg-yellow-300 hover:bg-yellow-400 disabled:opacity-45 text-black border-2 border-black shadow-[3px_3px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 font-black text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer min-h-[46px]"
                      >
                        {isComposingStage1 ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <Plus className="w-4 h-4 stroke-[2.5] shrink-0" />}
                        <span>+ Ke Antrean</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleSendCurrentSingle}
                        disabled={!canSend}
                        className="w-full py-3 px-4 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-45 text-black border-2 border-black shadow-[3px_3px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 font-black text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer min-h-[46px]"
                      >
                        <Send className="w-4 h-4 shrink-0" />
                        <span>Kirim</span>
                      </button>
                    </div>
                    {mobileTab === 'create' && <div className="lg:hidden">{renderSendOutcomeCard()}</div>}
                  </div>
                );
              })()}
            </>
          ) : (
            /* Mode B: Multi Video dengan cek pratinjau visual + audio sebelum masuk antrean/kirim */
            <div className="space-y-4 min-w-0">
              <section className="bg-white border-2 border-black shadow-[4px_4px_0px_#000] p-3.5 sm:p-5 space-y-4 min-w-0">
                <div className="flex items-center justify-between gap-2 pb-2 border-b-2 border-black flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="px-2 py-0.5 bg-cyan-300 border border-black font-black text-[10px] uppercase whitespace-nowrap shrink-0">
                      Multi Video
                    </span>
                    <h2 className="font-black text-xs sm:text-sm uppercase text-black leading-tight">
                      Pilih, Cek &amp; Atur Video Bersuara
                    </h2>
                  </div>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-neutral-100 border border-black shrink-0">
                    {multiDraftItems.length}/10 Video
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => multiVideoInputRef.current?.click()}
                  disabled={isImportingMulti || multiDraftItems.length >= 10}
                  className="w-full p-4 border-2 border-dashed border-black bg-cyan-50/70 hover:bg-cyan-100 disabled:opacity-50 transition-colors flex flex-col items-center justify-center gap-1.5 text-center cursor-pointer min-h-[112px]"
                >
                  {isImportingMulti ? (
                    <Loader2 className="w-6 h-6 animate-spin text-black" />
                  ) : (
                    <Layers className="w-6 h-6 text-black" />
                  )}
                  <span className="font-black text-xs sm:text-sm text-black">
                    {isImportingMulti
                      ? 'Membaca video & mengekstrak audio untuk dicek...'
                      : multiDraftItems.length > 0
                        ? '+ Tambah Video Lain (MP4/WebM/MOV)'
                        : 'Pilih Banyak Video Bersuara Sekaligus'}
                  </span>
                  <span className="text-[11px] font-semibold text-neutral-700 max-w-md leading-snug">
                    Hanya menerima file VIDEO (MP4/WebM/MOV). Foto &amp; audio ditolak otomatis. Setelah dipilih, video dan suaranya langsung tampil di bawah untuk dicek sebelum dikirim.
                  </span>
                </button>
                <input
                  ref={multiVideoInputRef}
                  type="file"
                  multiple
                  accept="video/mp4,video/webm,video/quicktime,video/*"
                  onChange={(e) => {
                    handleSelectMultiVideos(e.target.files);
                    e.target.value = '';
                  }}
                  className="hidden"
                />

                {/* Input audio pengganti khusus Android bila video tidak memiliki trek audio terbaca */}
                <input
                  ref={multiReplaceAudioInputRef}
                  type="file"
                  onChange={(e) => {
                    const picked = e.target.files?.[0];
                    e.target.value = '';
                    handleAssignDraftAudioFile(picked);
                  }}
                  className="hidden"
                />

                {multiRejectError && (
                  <div className="p-2.5 bg-rose-50 border-2 border-rose-600 text-[11px] font-bold text-rose-900 flex items-start gap-1.5">
                    <AlertCircle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
                    <span>{multiRejectError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
                  <div className="space-y-1">
                    <label className="font-black uppercase text-[10px] text-neutral-700 block">Framing Default 1:1:</label>
                    <div className="grid grid-cols-2 border-2 border-black bg-white">
                      <button
                        type="button"
                        onClick={() => {
                          setCropMode('cover');
                          if (multiDraftItems.length > 0) {
                            setMultiDraftItems((prev) => prev.map((it) => ({ ...it, cropMode: 'cover' })));
                          }
                        }}
                        className={`py-2 px-2 font-black text-[11px] min-h-[38px] cursor-pointer ${
                          cropMode === 'cover' ? 'bg-black text-cyan-300' : 'hover:bg-neutral-100'
                        }`}
                      >
                        Crop Penuh
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCropMode('contain');
                          if (multiDraftItems.length > 0) {
                            setMultiDraftItems((prev) => prev.map((it) => ({ ...it, cropMode: 'contain' })));
                          }
                        }}
                        className={`py-2 px-2 font-black text-[11px] border-l-2 border-black min-h-[38px] cursor-pointer ${
                          cropMode === 'contain' ? 'bg-black text-cyan-300' : 'hover:bg-neutral-100'
                        }`}
                      >
                        Pas (Fit)
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="font-black uppercase text-[10px] text-neutral-700 block">Batas Potong Default:</label>
                    <select
                      value={multiMaxCapSec}
                      onChange={(e) => setMultiMaxCapSec(Number(e.target.value))}
                      className="w-full bg-white border-2 border-black p-2 font-bold text-xs cursor-pointer min-h-[38px]"
                    >
                      <option value={5}>Maksimal 5 detik</option>
                      <option value={8}>Maksimal 8 detik (Disarankan)</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="font-black uppercase text-[10px] text-neutral-700 block">Nama Pack WA:</label>
                    <input
                      type="text"
                      value={packName}
                      maxLength={50}
                      onChange={(e) => setPackName(e.target.value)}
                      className="w-full bg-white border-2 border-black px-2.5 py-1.5 font-bold text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-black uppercase text-[10px] text-neutral-700 block">Pembuat:</label>
                    <input
                      type="text"
                      value={packPublisher}
                      maxLength={50}
                      onChange={(e) => setPackPublisher(e.target.value)}
                      className="w-full bg-white border-2 border-black px-2.5 py-1.5 font-bold text-xs"
                    />
                  </div>
                </div>
              </section>

              {/* Panel daftar video terpilih beserta pratinjau visual, audio, dan kontrol durasi */}
              {multiDraftItems.length > 0 && (() => {
                const activeDraftItem = multiDraftItems.find((it) => it.id === activeDraftPreviewId) || null;
                return (
                  <section className="bg-white border-2 border-black shadow-[4px_4px_0px_#000] p-3.5 sm:p-4 space-y-3.5 min-w-0">
                    <div className="flex items-center justify-between gap-2 pb-2 border-b-2 border-black flex-wrap">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="px-2 py-0.5 bg-emerald-300 border border-black font-black text-[10px] uppercase shrink-0">
                          Cek &amp; Atur
                        </span>
                        <h3 className="font-black text-xs sm:text-sm uppercase text-black">
                          Video Terpilih ({multiDraftItems.length})
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          closeDraftPreview();
                          setMultiDraftItems([]);
                        }}
                        disabled={isBatchSending}
                        className="px-2.5 py-1 bg-white hover:bg-rose-50 border border-black font-bold text-[10px] cursor-pointer"
                      >
                        Bersihkan Daftar
                      </button>
                    </div>

                    {activeDraftItem && activeDraftMedia && activeDraftMedia.itemId === activeDraftItem.id && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-yellow-100 border-2 border-black text-xs">
                          <span className="font-black truncate">
                            Pratinjau Video + Audio: {activeDraftItem.title}
                          </span>
                          <button
                            type="button"
                            onClick={closeDraftPreview}
                            className="px-2 py-0.5 bg-white border border-black font-bold text-[10px] cursor-pointer shrink-0"
                          >
                            Tutup Preview
                          </button>
                        </div>
                        <WaSoundStickerPreview
                          sourceMedia={activeDraftMedia.mediaEl}
                          isVideoSource={true}
                          audioBuffer={activeDraftItem.audioBuffer}
                          waveformPeaks={activeDraftItem.waveformPeaks || []}
                          startSec={activeDraftItem.startSec}
                          endSec={activeDraftItem.endSec}
                          videoStartSec={activeDraftItem.videoStartSec}
                          videoEndSec={activeDraftItem.videoEndSec}
                          volume={activeDraftItem.volume ?? 1}
                          fadeSmooth={activeDraftItem.fadeSmooth !== false}
                          renderOptions={{
                            cropMode: activeDraftItem.cropMode || 'cover',
                            bgStyle: activeDraftItem.bgStyle || 'solid',
                            bgColor: activeDraftItem.bgColor || '#111827',
                            motionEffect: 'static',
                            stickerText: activeDraftItem.stickerText || '',
                            textPosition: activeDraftItem.textPosition || 'bottom',
                            textSize: Number(activeDraftItem.textSize) || 46
                          }}
                        />
                      </div>
                    )}

                    <div className="space-y-3">
                      {multiDraftItems.map((draft, idx) => {
                        const isPlayingAudio = playingDraftAudioId === draft.id;
                        const isPreviewOpen = activeDraftPreviewId === draft.id;
                        const vMax = Math.max(0.5, Number(draft.videoDuration) || 8);
                        const aMax = Math.max(0.5, Number(draft.totalDuration) || 8);
                        const vClipDur = Math.max(0.5, Number(draft.videoEndSec || 0) - Number(draft.videoStartSec || 0)).toFixed(1);
                        const aClipDur = Math.max(0.2, Number(draft.endSec || 0) - Number(draft.startSec || 0)).toFixed(1);
                        const hasAudio = Boolean(draft.audioBuffer || draft.audioFile);

                        return (
                          <div key={draft.id} className="border-2 border-black bg-neutral-50 p-3 space-y-2.5 min-w-0">
                            <div className="flex items-start gap-2.5 min-w-0">
                              <button
                                type="button"
                                onClick={() => handleToggleDraftAudio(draft)}
                                className="relative w-16 h-16 shrink-0 border-2 border-black bg-neutral-900 overflow-hidden cursor-pointer active:scale-95 transition-transform"
                                title={hasAudio ? 'Ketuk untuk putar/hentikan audio video' : 'Audio belum terdeteksi'}
                                aria-label={isPlayingAudio ? `Hentikan audio ${draft.title}` : `Putar audio ${draft.title}`}
                              >
                                {draft.thumbnailUrl ? (
                                  <img src={draft.thumbnailUrl} alt={draft.title} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-[10px] font-mono text-white">
                                    1:1
                                  </div>
                                )}
                                <span
                                  className={`absolute top-1 left-1 w-5 h-5 rounded-full flex items-center justify-center ${
                                    isPlayingAudio ? 'bg-emerald-500 text-white' : 'bg-black/70 text-white'
                                  }`}
                                >
                                  {isPlayingAudio ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
                                </span>
                              </button>

                              <div className="flex-1 min-w-0 space-y-1">
                                <div className="flex items-start justify-between gap-1.5">
                                  <span className="font-black text-xs text-black truncate">
                                    {idx + 1}. {draft.title}
                                  </span>
                                  <span
                                    className={`px-1.5 py-0.5 border border-black font-mono font-bold text-[10px] shrink-0 ${
                                      hasAudio ? 'bg-emerald-200 text-black' : 'bg-rose-200 text-rose-950'
                                    }`}
                                  >
                                    {hasAudio ? 'Audio Siap' : 'Tanpa Audio'}
                                  </span>
                                </div>

                                <div className="flex items-center gap-1.5 flex-wrap font-mono text-[10px] font-bold text-neutral-700">
                                  <span className="px-1.5 py-0.5 bg-white border border-black">
                                    Asli: {vMax.toFixed(1)}s
                                  </span>
                                  <span className="px-1.5 py-0.5 bg-yellow-100 border border-black text-black">
                                    Video: {vClipDur}s
                                  </span>
                                  <span className="px-1.5 py-0.5 bg-cyan-100 border border-black text-black">
                                    Sound: {aClipDur}s
                                  </span>
                                </div>

                                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                                  <button
                                    type="button"
                                    onClick={() => openDraftPreview(draft)}
                                    className={`px-2.5 py-1 border border-black font-black text-[10px] inline-flex items-center gap-1 cursor-pointer min-h-[34px] ${
                                      isPreviewOpen ? 'bg-black text-yellow-300' : 'bg-yellow-300 hover:bg-yellow-400 text-black'
                                    }`}
                                  >
                                    <Eye className="w-3 h-3" />
                                    <span>{isPreviewOpen ? 'Tutup Pratinjau' : 'Cek Video + Audio'}</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleToggleDraftAudio(draft)}
                                    disabled={!hasAudio}
                                    className={`px-2.5 py-1 disabled:opacity-40 border border-black font-bold text-[10px] inline-flex items-center gap-1 cursor-pointer min-h-[34px] ${
                                      isPlayingAudio ? 'bg-rose-500 text-white' : 'bg-white hover:bg-emerald-100 text-black'
                                    }`}
                                  >
                                    {isPlayingAudio ? <Square className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
                                    <span>{isPlayingAudio ? 'Stop Audio' : 'Putar Audio'}</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      multiReplaceTargetIdRef.current = draft.id;
                                      multiReplaceAudioInputRef.current?.click();
                                    }}
                                    className="px-2.5 py-1 bg-white hover:bg-cyan-50 border border-black font-bold text-[10px] inline-flex items-center gap-1 cursor-pointer min-h-[34px]"
                                  >
                                    <Music className="w-3 h-3" />
                                    <span>{hasAudio ? 'Ganti Audio' : 'Pilih Audio'}</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleRemoveDraftItem(draft.id)}
                                    className="px-2 py-1 bg-white hover:bg-rose-100 border border-black font-bold text-[10px] inline-flex items-center gap-1 cursor-pointer min-h-[34px] ml-auto"
                                    aria-label={`Hapus ${draft.title}`}
                                  >
                                    <Trash2 className="w-3 h-3 text-rose-700" />
                                    <span>Hapus</span>
                                  </button>
                                </div>
                              </div>
                            </div>

                            {!hasAudio && (
                              <div className="p-2 bg-rose-50 border border-rose-600 text-[10px] font-bold text-rose-900 flex items-center gap-1.5">
                                <AlertCircle className="w-3.5 h-3.5 text-rose-700 shrink-0" />
                                <span>Audio asli video tidak terdeteksi browser. Klik &ldquo;Pilih Audio&rdquo; agar stiker tetap bersuara di WhatsApp.</span>
                              </div>
                            )}

                            {/* Kontrol Atur Durasi Video, Durasi Audio, Framing & Teks */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                              <div className="p-1.5 bg-white border border-black space-y-1">
                                <span className="font-black text-[10px] uppercase block text-neutral-700">Mulai Video (s)</span>
                                <DecimalSecInput
                                  ariaLabel={`Mulai video ${draft.title}`}
                                  value={draft.videoStartSec ?? 0}
                                  onCommit={(val) => {
                                    const s = Number(Math.max(0, Math.min(Math.max(0, vMax - 0.5), parseDecimalSafe(val, 0))).toFixed(1));
                                    let e = Number(draft.videoEndSec ?? Math.min(vMax, s + 5));
                                    if (e - s < 0.5) e = Number(Math.min(vMax, s + 0.5).toFixed(1));
                                    if (e - s > MAX_CLIP_DURATION_SEC) e = Number(Math.min(vMax, s + MAX_CLIP_DURATION_SEC).toFixed(1));
                                    handleUpdateDraftItem(draft.id, { videoStartSec: s, videoEndSec: e });
                                  }}
                                />
                              </div>

                              <div className="p-1.5 bg-white border border-black space-y-1">
                                <span className="font-black text-[10px] uppercase block text-neutral-700">Selesai Video (s)</span>
                                <DecimalSecInput
                                  ariaLabel={`Selesai video ${draft.title}`}
                                  value={draft.videoEndSec ?? Math.min(vMax, 8)}
                                  onCommit={(val) => {
                                    const e = Number(Math.max(0.5, Math.min(vMax, parseDecimalSafe(val, vMax))).toFixed(1));
                                    let s = Number(draft.videoStartSec ?? 0);
                                    if (e - s < 0.5) s = Number(Math.max(0, e - 0.5).toFixed(1));
                                    if (e - s > MAX_CLIP_DURATION_SEC) s = Number(Math.max(0, e - MAX_CLIP_DURATION_SEC).toFixed(1));
                                    handleUpdateDraftItem(draft.id, { videoStartSec: s, videoEndSec: e });
                                  }}
                                />
                              </div>

                              <div className="p-1.5 bg-white border border-black space-y-1">
                                <span className="font-black text-[10px] uppercase block text-neutral-700">Mulai Audio (s)</span>
                                <DecimalSecInput
                                  ariaLabel={`Mulai audio ${draft.title}`}
                                  value={draft.startSec ?? 0}
                                  onCommit={(val) => {
                                    const s = Number(Math.max(0, Math.min(Math.max(0, aMax - 0.2), parseDecimalSafe(val, 0))).toFixed(1));
                                    let e = Number(draft.endSec ?? Math.min(aMax, s + 5));
                                    if (e - s < 0.2) e = Number(Math.min(aMax, s + 0.5).toFixed(1));
                                    if (e - s > MAX_CLIP_DURATION_SEC) e = Number(Math.min(aMax, s + MAX_CLIP_DURATION_SEC).toFixed(1));
                                    handleUpdateDraftItem(draft.id, { startSec: s, endSec: e });
                                  }}
                                />
                              </div>

                              <div className="p-1.5 bg-white border border-black space-y-1">
                                <span className="font-black text-[10px] uppercase block text-neutral-700">Selesai Audio (s)</span>
                                <DecimalSecInput
                                  ariaLabel={`Selesai audio ${draft.title}`}
                                  value={draft.endSec ?? Math.min(aMax, 8)}
                                  onCommit={(val) => {
                                    const e = Number(Math.max(0.2, Math.min(aMax, parseDecimalSafe(val, aMax))).toFixed(1));
                                    let s = Number(draft.startSec ?? 0);
                                    if (e - s < 0.2) s = Number(Math.max(0, e - 0.5).toFixed(1));
                                    if (e - s > MAX_CLIP_DURATION_SEC) s = Number(Math.max(0, e - MAX_CLIP_DURATION_SEC).toFixed(1));
                                    handleUpdateDraftItem(draft.id, { startSec: s, endSec: e });
                                  }}
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs items-end">
                              <div className="sm:col-span-2">
                                <label className="font-black text-[10px] uppercase text-neutral-700 block mb-0.5">
                                  Teks Meme (Opsional):
                                </label>
                                <input
                                  type="text"
                                  maxLength={40}
                                  value={draft.stickerText || ''}
                                  onChange={(e) => handleUpdateDraftItem(draft.id, { stickerText: e.target.value })}
                                  placeholder="Kosongkan jika tanpa teks"
                                  className="w-full border border-black px-2 py-1.5 font-bold text-xs bg-white"
                                />
                              </div>
                              <div>
                                <label className="font-black text-[10px] uppercase text-neutral-700 block mb-0.5">
                                  Framing 1:1:
                                </label>
                                <select
                                  value={draft.cropMode || 'cover'}
                                  onChange={(e) => handleUpdateDraftItem(draft.id, { cropMode: e.target.value })}
                                  className="w-full border border-black px-2 py-1.5 font-bold text-xs bg-white cursor-pointer"
                                >
                                  <option value="cover">Crop Penuh</option>
                                  <option value="contain">Pas (Fit)</option>
                                </select>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })()}

              {/* Tombol aksi utama Multi Video: + Ke Antrean dan Kirim */}
              <div className="space-y-2">
                {multiDraftItems.length === 0 && (
                  <div className="px-3 py-2 bg-cyan-50 border-2 border-black text-[11px] font-bold text-neutral-800 flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-cyan-800 shrink-0" />
                    <span>Pilih minimal 1 video di atas untuk melihat pratinjau, mengatur durasi, lalu pilih + Ke Antrean atau Kirim.</span>
                  </div>
                )}

                {isBatchSending && batchProgress && (
                  <div className="p-2.5 bg-yellow-50 border-2 border-black space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-black gap-2">
                      <span className="truncate inline-flex items-center gap-1.5">
                        <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                        {batchProgress.label}
                      </span>
                      <span className="font-mono shrink-0">
                        {batchProgress.current}/{batchProgress.total}
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-white border border-black overflow-hidden">
                      <div
                        style={{ width: `${Math.round((batchProgress.current / Math.max(1, batchProgress.total)) * 100)}%` }}
                        className="h-full bg-emerald-400 transition-all duration-300"
                      />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={handleAddMultiDraftToQueue}
                    disabled={multiDraftItems.length === 0 || isImportingMulti || isBatchSending}
                    className="w-full py-3 px-4 bg-yellow-300 hover:bg-yellow-400 disabled:opacity-45 text-black border-2 border-black shadow-[3px_3px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 font-black text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer min-h-[46px]"
                  >
                    <Plus className="w-4 h-4 stroke-[2.5] shrink-0" />
                    <span>
                      {multiDraftItems.length > 0 ? `+ Ke Antrean (${multiDraftItems.length})` : '+ Ke Antrean'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSendMultiDraftNow}
                    disabled={multiDraftItems.length === 0 || isImportingMulti || isBatchSending}
                    className="w-full py-3 px-4 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-45 text-black border-2 border-black shadow-[3px_3px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 font-black text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer min-h-[46px]"
                  >
                    <Send className="w-4 h-4 shrink-0" />
                    <span>
                      {isBatchSending
                        ? 'Mengirim...'
                        : multiDraftItems.length > 0
                          ? `Kirim (${multiDraftItems.length})`
                          : 'Kirim'}
                    </span>
                  </button>
                </div>

                {mobileTab === 'create' && <div className="lg:hidden">{renderSendOutcomeCard()}</div>}
              </div>
            </div>
          )}
        </div>

        {/* ─── KOLOM KANAN: ANTREAN BATCH & KONEKSI WA + DETEKSI FORMAT ─── */}
        <div className={`lg:col-span-5 space-y-4 min-w-0 ${mobileTab === 'create' ? 'hidden lg:block' : 'block'}`}>
          <div className={mobileTab === 'queue' ? 'block' : 'hidden lg:block'}>
            <StickerQueueList
              items={stickerQueue}
              isBatchSending={isBatchSending}
              batchProgress={batchProgress}
              waConnected={connectionStatus === 'connected'}
              onPreviewItem={handlePreviewQueueItem}
              onUpdateItem={(id, patch) =>
                setStickerQueue((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)))
              }
              onRetryItem={handleRetryQueueItem}
              onRemoveItem={(id) => setStickerQueue((prev) => prev.filter((it) => it.id !== id))}
              onSendAll={handleSendAllQueue}
              onClearAll={() => setStickerQueue([])}
            />
            {mobileTab === 'queue' && <div className="lg:hidden mt-3">{renderSendOutcomeCard()}</div>}
          </div>

          <section className={`bg-white border-2 border-black shadow-[4px_4px_0px_#000] p-3.5 sm:p-4 space-y-3.5 min-w-0 ${
            mobileTab === 'wa' ? 'block' : 'hidden lg:block'
          }`}>
            <div className="flex items-center justify-between gap-2 pb-2 border-b-2 border-black">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-black text-yellow-300 border border-black font-black text-[10px] uppercase">
                  Koneksi WA
                </span>
                <h3 className="font-black text-xs sm:text-sm uppercase text-black">
                  Tautan &amp; Deteksi Format
                </h3>
              </div>
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            </div>

            {connectionStatus === 'connected' ? (
              <div className="p-3 bg-emerald-100 border-2 border-black space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span className="font-black text-xs text-black truncate">
                      WA Terhubung &bull; +{connectedPhone}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={handleTestSelfE2ee}
                      disabled={isTestingE2ee || isRefreshingE2ee || isTestingPlainSticker}
                      className="px-2.5 py-1 bg-cyan-200 hover:bg-cyan-300 disabled:opacity-50 border-2 border-black shadow-[1px_1px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] font-black text-[10px] flex items-center gap-1 cursor-pointer min-h-[34px]"
                      title="Kirim 1 pesan teks tes ke nomor sendiri untuk cek ACK enkripsi E2EE real-time"
                    >
                      {isTestingE2ee ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Activity className="w-3 h-3" />
                      )}
                      <span>{isTestingE2ee ? 'Menguji...' : 'Tes E2EE (Teks)'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleTestPlainSticker}
                      disabled={isTestingPlainSticker || isTestingE2ee || isRefreshingE2ee}
                      className="px-2.5 py-1 bg-white hover:bg-neutral-100 disabled:opacity-50 border-2 border-black shadow-[1px_1px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] font-black text-[10px] flex items-center gap-1 cursor-pointer min-h-[34px]"
                      title="Kirim 1 stiker WebP polos 512x512 tervalidasi untuk memisahkan isu E2EE vs format audio"
                    >
                      {isTestingPlainSticker ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Sparkles className="w-3 h-3" />
                      )}
                      <span>{isTestingPlainSticker ? 'Menguji...' : 'Tes Stiker Polos'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleRefreshE2ee}
                      disabled={isRefreshingE2ee || isTestingE2ee || isTestingPlainSticker}
                      className="px-2.5 py-1 bg-yellow-200 hover:bg-yellow-300 disabled:opacity-50 border-2 border-black shadow-[1px_1px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] font-black text-[10px] flex items-center gap-1 cursor-pointer min-h-[34px]"
                      title="Soft-restart sesi Signal self-chat & tarik pre-key baru tanpa scan ulang"
                    >
                      <RefreshCw className={`w-3 h-3 ${isRefreshingE2ee ? 'animate-spin' : ''}`} />
                      <span>Reset Kunci E2EE</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleLogoutWa}
                      className="px-2.5 py-1 bg-white hover:bg-rose-50 border-2 border-black font-black text-[10px] flex items-center gap-1 cursor-pointer min-h-[34px]"
                    >
                      <LogOut className="w-3 h-3" />
                      <span>Putus</span>
                    </button>
                  </div>
                </div>
                <p className="text-[11px] font-semibold text-neutral-700">
                  Target terkunci ke nomor Anda sendiri via jalur resmi <code className="font-mono">sock.sendMessage</code>.
                </p>
                {(e2eeDiagStatus || deliveryTraces.length > 0) && (
                  <div
                    className={`p-2 border-2 border-black text-[10px] font-mono space-y-0.5 ${
                      e2eeDiagStatus?.ok === false ? 'bg-rose-100 text-rose-950' : 'bg-white text-black'
                    }`}
                  >
                    {e2eeDiagStatus && (
                      <div className="font-black flex items-center justify-between gap-2 flex-wrap">
                        <span>
                          {e2eeDiagStatus.kind === 'test' || e2eeDiagStatus.kind === 'plain_sticker'
                            ? e2eeDiagStatus.ackLabel || e2eeDiagStatus.error
                            : e2eeDiagStatus.ok
                              ? `Reset Kunci E2EE Selesai (${e2eeDiagStatus.clearedCount || 0} file sesi lama + soft-restart)`
                              : e2eeDiagStatus.error}
                        </span>
                        {e2eeDiagStatus.baileysVersion && (
                          <span className="px-1.5 py-0.5 bg-neutral-100 border border-black text-[9px]">
                            Baileys v{e2eeDiagStatus.baileysVersion}
                          </span>
                        )}
                      </div>
                    )}
                    {e2eeDiagStatus?.messageId && (
                      <div className="text-neutral-600">
                        ID: #{String(e2eeDiagStatus.messageId).slice(-10)}
                        {e2eeDiagStatus.encodedBytes ? ` • ${e2eeDiagStatus.encodedBytes} B proto` : ''}
                      </div>
                    )}
                    {deliveryTraces.length > 0 && (
                      <div className={`${e2eeDiagStatus ? 'pt-1 border-t border-black/15' : ''} space-y-0.5 text-[9px] text-neutral-700`}>
                        {deliveryTraces.slice(-5).map((t, idx) => (
                          <div key={`${t.at}-${idx}`} className="truncate">
                            [{t.phase || t.event}] #{String(t.messageId || '').slice(-6)} {t.detail}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-3 bg-neutral-50 border-2 border-black space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-black text-xs text-black">Tautkan Perangkat WA Anda</span>
                  <span className="text-[10px] font-mono font-bold text-neutral-600">
                    {socketConnected ? (hasSavedAuth ? 'Memulihkan...' : 'Server Siap') : 'Menghubungkan...'}
                  </span>
                </div>

                <div className="grid grid-cols-2 border-2 border-black bg-white text-[11px]">
                  <button
                    type="button"
                    onClick={() => setAuthMethod('pairing')}
                    className={`py-2 font-black flex items-center justify-center gap-1 cursor-pointer min-h-[38px] ${
                      authMethod === 'pairing' ? 'bg-black text-yellow-300' : 'hover:bg-neutral-100'
                    }`}
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>Kode Pairing</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthMethod('qr')}
                    className={`py-2 font-black border-l-2 border-black flex items-center justify-center gap-1 cursor-pointer min-h-[38px] ${
                      authMethod === 'qr' ? 'bg-black text-yellow-300' : 'hover:bg-neutral-100'
                    }`}
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    <span>Scan QR Code</span>
                  </button>
                </div>

                {authMethod === 'pairing' ? (
                  <div className="space-y-2">
                    <div className="flex gap-1.5">
                      <input
                        type="tel"
                        value={pairingPhone}
                        onChange={(e) => setPairingPhone(e.target.value)}
                        placeholder="Nomor WA Anda: 62812xxxx"
                        className="flex-1 min-w-0 bg-white border-2 border-black px-2.5 py-2 text-xs font-bold min-h-[40px]"
                      />
                      <button
                        type="button"
                        onClick={() => handleStartPairing('pairing')}
                        disabled={isRequestingPairing || !socketConnected}
                        className="px-3 py-2 bg-yellow-300 hover:bg-yellow-400 disabled:opacity-50 border-2 border-black font-black text-xs cursor-pointer shrink-0 flex items-center gap-1 min-h-[40px]"
                      >
                        {isRequestingPairing ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Meminta...</span>
                          </>
                        ) : (
                          <span>Minta Kode</span>
                        )}
                      </button>
                    </div>
                    {pairingCode && (
                      <div className="p-2.5 bg-emerald-50 border-2 border-black space-y-2">
                        <div className="flex items-center justify-between gap-2 bg-white border-2 border-black px-2.5 py-2">
                          <span className="font-mono font-black text-lg tracking-widest text-black select-all">
                            {formatPairingCodeDisplay(pairingCode)}
                          </span>
                          <button
                            type="button"
                            onClick={async () => {
                              await copyTextToClipboard(pairingCode);
                              setCopiedCode(true);
                              setTimeout(() => setCopiedCode(false), 1800);
                            }}
                            className="px-2 py-1 bg-emerald-300 border border-black font-bold text-[10px] flex items-center gap-1 cursor-pointer"
                          >
                            {copiedCode ? <Check className="w-3 h-3 text-emerald-900" /> : <Copy className="w-3 h-3" />}
                            <span>{copiedCode ? 'Tersalin' : 'Salin'}</span>
                          </button>
                        </div>
                        <p className="text-[10px] font-semibold text-neutral-700 leading-snug">
                          Buka WhatsApp HP &gt; <b>Perangkat Tertaut</b> &gt; <b>Tautkan Perangkat</b> &gt; <b>Tautkan dengan nomor telepon saja</b>, lalu ketik 8 karakter di atas.
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    {qrCodeDataUrl ? (
                      <img src={qrCodeDataUrl} alt="QR WhatsApp" className="w-44 h-44 border-2 border-black bg-white p-1" />
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleStartPairing('qr')}
                        className="w-full py-2.5 bg-yellow-300 hover:bg-yellow-400 border-2 border-black font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer min-h-[40px]"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Muat QR Code Tautan</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {waError && (
              <div className="p-2.5 bg-rose-100 border-2 border-rose-500 text-rose-950 text-[11px] font-bold flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{waError}</span>
              </div>
            )}

            {renderSendOutcomeCard()}

            {/* Status Permanen Engine Stiker Audio WA */}
            <div className="pt-2 border-t-2 border-black">
              <div className="p-3 bg-emerald-50 border-2 border-black shadow-[3px_3px_0px_#000] space-y-1.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 font-black text-[11px] uppercase text-black">
                    <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span>Engine Stiker Audio WA: Aktif Permanen</span>
                  </span>
                  <span className="px-2 py-0.5 bg-emerald-300 border border-black font-mono font-black text-[10px] text-black">
                    PRO #134
                  </span>
                </div>
                <p className="text-[11px] font-semibold text-neutral-800 leading-snug">
                  Protokol Native #134 &bull; WebP 512&times;512 + Ogg/Opus &bull; Siap kirim langsung tanpa kalibrasi.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Floating/Sticky Mini-Bar Mobile saat Antrean Terisi */}
      {mobileTab === 'create' && stickerQueue.length > 0 && (
        <div className="lg:hidden sticky bottom-2 z-20 bg-black text-white border-2 border-black shadow-[4px_4px_0px_#10b981] px-3 py-2.5 flex items-center justify-between gap-2">
          <div className="text-xs font-black truncate">
            {stickerQueue.length} Stiker di Antrean
          </div>
          <button
            type="button"
            onClick={() => setMobileTab('queue')}
            className="px-3 py-1.5 bg-emerald-400 hover:bg-emerald-300 text-black border border-black font-black text-xs inline-flex items-center gap-1 cursor-pointer shrink-0"
          >
            <span>Lihat &amp; Kirim</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
