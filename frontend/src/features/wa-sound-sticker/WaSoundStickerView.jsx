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
  RefreshCw,
  LogOut,
  ShieldCheck,
  Info,
  Wrench,
  Plus,
  Layers,
  Sparkles,
  ArrowRight,
  Activity
} from 'lucide-react';
import { copyTextToClipboard } from '../../shared/utils/clipboard';
import { isValidPairingPhone, formatPairingCodeDisplay } from '../../shared/utils/waPhoneUtils';
import {
  decodeMediaToAudioBuffer,
  extractWaveformPeaks,
  renderTrimmedAudioBuffer,
  probeVideoMetadata,
  createSnippetPlayer
} from './audioTrimmerEngine';
import {
  validateSourceMediaDimensions,
  createSquareThumbnailDataUrl,
  composeSoundVideoStage1,
  loadMediaElementFromFile,
  releaseMediaElement,
  buildStickerSendPayload
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
const RECOMMENDED_FULL_SEC = 15;
const MAX_CLIP_DURATION_SEC = 30;
const BATCH_DELAY_MS = 1500;

function formatTimeSec(sec = 0) {
  const safe = Math.max(0, Number(sec) || 0);
  const mins = Math.floor(safe / 60);
  const rem = (safe % 60).toFixed(1).padStart(4, '0');
  return `${mins}:${rem}`;
}

export default function WaSoundStickerView({ onBack, onShowToast }) {
  // ─── NAVIGASI MOBILE & MODE INPUT ───
  const [mobileTab, setMobileTab] = useState('create'); // 'create' | 'queue' | 'wa'
  const [inputMode, setInputMode] = useState('single'); // 'single' | 'multi'

  // ─── 1. MODE A: VISUAL & SOUND (1-PER-1 -> ANTREAN) ───
  const [visualFileMeta, setVisualFileMeta] = useState(null);
  const [visualFileObj, setVisualFileObj] = useState(null);
  const [sourceMedia, setSourceMedia] = useState(null);
  const [isVideoSource, setIsVideoSource] = useState(false);
  const [visualPreviewUrl, setVisualPreviewUrl] = useState('');

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

  // ─── 2. MODE B: MULTI-UPLOAD VIDEO BERSUARA SEKALIGUS ───
  const [multiMaxCapSec, setMultiMaxCapSec] = useState(8);
  const [isImportingMulti, setIsImportingMulti] = useState(false);

  // ─── 3. ANTREAN BATCH ───
  const [stickerQueue, setStickerQueue] = useState([]);
  const [isBatchSending, setIsBatchSending] = useState(false);
  const [batchProgress, setBatchProgress] = useState(null);
  const pendingSendResolversRef = useRef(new Map());
  const activeVisualUrlRef = useRef('');

  const waveformCanvasRef = useRef(null);
  const trimPlayerRef = useRef(null);
  const visualInputRef = useRef(null);
  const audioInputRef = useRef(null);
  const multiVideoInputRef = useRef(null);

  // ─── 4. KONEKSI WA TERISOLASI PER-PERANGKAT & KALIBRASI SKEMA ───
  const [{ sessionId, deviceToken }] = useState(() => getOrCreateDeviceCredentials());
  const backendUrl = useMemo(() => getWaBackendUrl(), []);
  const socketRef = useRef(null);
  const e2eeResetTimerRef = useRef(null);
  const e2eeTestTimerRef = useRef(null);

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
  const [e2eeDiagStatus, setE2eeDiagStatus] = useState(null);
  const [lastSendResult, setLastSendResult] = useState(null);
  const [deliveryStatus, setDeliveryStatus] = useState(null);
  const [calibrationArmed, setCalibrationArmed] = useState(false);
  const [calibrationMeta, setCalibrationMeta] = useState(null);
  const [calibrationLogs, setCalibrationLogs] = useState([]);
  const [deliveryTraces, setDeliveryTraces] = useState([]);
  const [soundStickerBlueprint, setSoundStickerBlueprint] = useState(() => {
    try {
      const raw =
        sessionId &&
        (localStorage.getItem(`kuro_sound_sticker_blueprint_${sessionId}`) ||
          localStorage.getItem(`kuro_wa_sound_sticker_blueprint_${sessionId}`));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [copiedSchema, setCopiedSchema] = useState(false);

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
    return () => {
      trimPlayerRef.current?.stop();
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

    sock.on('auth-snapshot-sync', (data) => {
      if (data?.snapshot && data.sessionId === sessionId) {
        saveDeviceAuthSnapshotLocal(sessionId, deviceToken, data.snapshot);
        setHasSavedAuth(true);
      }
    });

    sock.on('session-error', (data) => {
      if (unmounted) return;
      setIsRequestingPairing(false);
      setWaError(data?.message || 'Terjadi gangguan pada koneksi WhatsApp.');
    });

    sock.on('sound-sticker-calibration-armed', (info) => {
      if (unmounted) return;
      setCalibrationArmed(true);
      setCalibrationMeta(info && typeof info === 'object' ? info : null);
      setCalibrationLogs([]);
      const phoneLabel = info?.linkedPhone ? `+${info.linkedPhone}` : 'perangkat tertaut';
      onShowToast?.(`Deteksi aktif di ${phoneLabel}: teruskan 1 stiker audio sekarang.`, 'info');
    });

    sock.on('sound-sticker-calibration-error', (payload) => {
      if (unmounted) return;
      setCalibrationArmed(false);
      onShowToast?.(payload?.error || 'Deteksi format gagal dimulai.', 'error');
    });

    sock.on('sound-sticker-calibration-log', (entry) => {
      if (unmounted || !entry) return;
      setCalibrationLogs((prev) => [...prev.slice(-11), entry]);
    });

    sock.on('sound-sticker-delivery-trace', (trace) => {
      if (unmounted || !trace) return;
      setDeliveryTraces((prev) => [...prev.slice(-5), trace]);
    });

    sock.on('self-e2ee-reset-result', (res) => {
      if (unmounted || !res) return;
      if (e2eeResetTimerRef.current) clearTimeout(e2eeResetTimerRef.current);
      setIsRefreshingE2ee(false);
      setE2eeDiagStatus({ kind: 'reset', ...res });
      if (res.ok) {
        onShowToast?.(`Kunci E2EE disegarkan (${res.clearedCount || 0} sesi dihapus).`, 'success');
      } else {
        onShowToast?.(res.error || 'Gagal mereset kunci E2EE.', 'error');
      }
    });

    sock.on('self-e2ee-test-result', (res) => {
      if (unmounted || !res) return;
      if (e2eeTestTimerRef.current) clearTimeout(e2eeTestTimerRef.current);
      setIsTestingE2ee(false);
      setE2eeDiagStatus({ kind: 'test', ...res });
      if (res.ok) {
        onShowToast?.(res.ackLabel || 'Tes E2EE berhasil terkirim (0 error).', 'success');
      } else {
        onShowToast?.(res.error || 'Tes E2EE gagal mencapai perangkat.', 'error');
      }
    });

    sock.on('wa-e2ee-refreshed', (res) => {
      if (unmounted) return;
      if (e2eeResetTimerRef.current) clearTimeout(e2eeResetTimerRef.current);
      setIsRefreshingE2ee(false);
      if (res?.ok) {
        onShowToast?.('Kunci enkripsi E2EE WhatsApp berhasil disegarkan.', 'success');
      } else {
        onShowToast?.(res?.error || 'Gagal menyegarkan kunci E2EE.', 'error');
      }
    });

    const handleBlueprintCaptured = (payloadOrBlueprint) => {
      if (unmounted) return;
      const bp = payloadOrBlueprint?.blueprint || payloadOrBlueprint;
      if (!bp || typeof bp !== 'object') return;
      setCalibrationArmed(false);
      setSoundStickerBlueprint(bp);
      try {
        if (sessionId) {
          localStorage.setItem(`kuro_sound_sticker_blueprint_${sessionId}`, JSON.stringify(bp));
        }
      } catch {}
      onShowToast?.('Format Stiker Suara WA berhasil dideteksi & disimpan!', 'success');
    };

    sock.on('sound-sticker-blueprint-ready', handleBlueprintCaptured);
    sock.on('sound-sticker-schema-detected', handleBlueprintCaptured);

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
        onShowToast?.(errText, 'error');
      }
    });

    return () => {
      unmounted = true;
      if (e2eeResetTimerRef.current) clearTimeout(e2eeResetTimerRef.current);
      if (e2eeTestTimerRef.current) clearTimeout(e2eeTestTimerRef.current);
      sock.disconnect();
      socketRef.current = null;
    };
  }, [backendUrl, sessionId, deviceToken, onShowToast]);

  // ─── HANDLE UNGGAH VISUAL (MODE A) ───
  const handleSelectVisualFile = async (file) => {
    if (!file) return;
    if (file.size > MAX_VISUAL_FILE_BYTES) {
      onShowToast?.('Ukuran visual melebihi batas maksimal 25 MB.', 'error');
      return;
    }

    const mime = String(file.type || '').toLowerCase();
    const isVideo = mime.startsWith('video/') || /\.(mp4|webm|mov|m4v)$/i.test(file.name);
    const isImage = mime.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif)$/i.test(file.name);

    if (!isVideo && !isImage) {
      onShowToast?.('Format visual tidak didukung. Pilih foto (JPG/PNG/WebP) atau video (MP4/WebM/MOV).', 'error');
      return;
    }

    releaseMediaElement(sourceMedia, visualPreviewUrl);

    try {
      const { mediaEl, objectUrl, isVideo: loadedVideo } = await loadMediaElementFromFile(file);
      activeVisualUrlRef.current = objectUrl;
      setVisualPreviewUrl(objectUrl);
      setSourceMedia(mediaEl);
      setVisualFileObj(file);
      setIsVideoSource(loadedVideo);
      setVisualFileMeta({
        name: file.name,
        kind: loadedVideo ? 'video' : 'image',
        duration: loadedVideo ? Number(mediaEl.duration || 0) : 0,
        width: loadedVideo ? mediaEl.videoWidth : mediaEl.naturalWidth,
        height: loadedVideo ? mediaEl.videoHeight : mediaEl.naturalHeight
      });
      onShowToast?.(`${loadedVideo ? 'Video' : 'Foto'} dimuat ke pratinjau 512×512.`, 'success');
    } catch (err) {
      onShowToast?.(err.message || 'Gagal membaca berkas visual.', 'error');
    }
  };

  // ─── HANDLE UNGGAH / EKSTRAK AUDIO (MODE A) ───
  const loadAudioSource = async (file, labelPrefix = '') => {
    if (!file) return;
    if (file.size > MAX_AUDIO_FILE_BYTES && labelPrefix === '') {
      onShowToast?.('Ukuran file audio melebihi batas maksimal 15 MB.', 'error');
      return;
    }

    const fileNameLower = String(file.name || '').toLowerCase();
    const mimeLower = String(file.type || '').toLowerCase();
    const isAllowedExt = /\.(mp3|m4a|wav|ogg|aac|opus|flac|amr|3gp|m4r|wma|mp4|webm|mov|m4v|mkv|avi)$/i.test(fileNameLower);
    const isObviouslyRejected =
      /\.(jpg|jpeg|png|webp|gif|bmp|svg|heic|pdf|apk|zip|rar|7z|doc|docx|xls|xlsx|ppt|pptx|txt|json|html|exe)$/i.test(fileNameLower) ||
      mimeLower.startsWith('image/') ||
      mimeLower === 'application/pdf' ||
      mimeLower.includes('android.package-archive') ||
      mimeLower.includes('zip');
    const isMediaMime =
      mimeLower.startsWith('audio/') ||
      mimeLower.startsWith('video/') ||
      mimeLower === '' ||
      mimeLower === 'application/octet-stream' ||
      mimeLower === 'application/ogg';

    if (isObviouslyRejected || (!isAllowedExt && !isMediaMime)) {
      onShowToast?.(
        'File yang dipilih bukan file suara/audio. Silakan pilih file MP3, M4A, WAV, OGG, AAC, atau video MP4 dari File Manager.',
        'error'
      );
      return;
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
    const clampedEnd = Number(Math.min(buf.duration, cap).toFixed(1));
    setStartSec(0);
    setEndSec(Math.max(0.2, clampedEnd));
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
    let s = Math.max(0, Math.min(total - 0.2, Number(nextStart) || 0));
    s = Number(s.toFixed(1));
    let e = endSec;
    if (e - s < 0.2) e = Number(Math.min(total, s + 0.5).toFixed(1));
    if (e - s > MAX_CLIP_DURATION_SEC) e = Number((s + MAX_CLIP_DURATION_SEC).toFixed(1));
    setTrimMode('cut');
    setStartSec(s);
    setEndSec(e);
  };

  const updateSafeEnd = (nextEnd) => {
    if (!audioBuffer) return;
    const total = audioBuffer.duration;
    let e = Math.max(0.2, Math.min(total, Number(nextEnd) || total));
    e = Number(e.toFixed(1));
    let s = startSec;
    if (e - s < 0.2) s = Number(Math.max(0, e - 0.5).toFixed(1));
    if (e - s > MAX_CLIP_DURATION_SEC) s = Number(Math.max(0, e - MAX_CLIP_DURATION_SEC).toFixed(1));
    setTrimMode('cut');
    setStartSec(s);
    setEndSec(e);
  };

  const selectedDuration = useMemo(
    () => Math.max(0.2, Number((endSec - startSec).toFixed(1))),
    [startSec, endSec]
  );

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
    const startRatio = startSec / totalDur;
    const endRatio = endSec / totalDur;

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
      const playAbs = Math.min(totalDur, startSec + testPlayheadSec);
      const px = (playAbs / totalDur) * w;
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(px - 1, 0, 2, h);
    }
  }, [audioBuffer, waveformPeaks, startSec, endSec, isTestingSound, testPlayheadSec]);

  const handleWaveformClick = (e) => {
    if (!audioBuffer || !waveformCanvasRef.current) return;
    const rect = waveformCanvasRef.current.getBoundingClientRect();
    const clickRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
    const clickedSec = Number((clickRatio * audioBuffer.duration).toFixed(1));
    const distToStart = Math.abs(clickedSec - startSec);
    const distToEnd = Math.abs(clickedSec - endSec);
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
    await trimPlayerRef.current?.play(audioBuffer, startSec, endSec, volume, {
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

      let stagedMuxedBlob = null;
      let stagedMuxedExt = null;
      const bpContainer = soundStickerBlueprint?.mediaInspection?.detectedContainer || '';
      const bpMime = String(soundStickerBlueprint?.stickerMeta?.mimetype || '').toLowerCase();
      if (bpContainer === 'mp4' || bpContainer === 'webm' || bpMime.includes('mp4') || bpMime.includes('webm')) {
        try {
          const trimmed = await renderTrimmedAudioBuffer(audioBuffer, { startSec, endSec, volume, fadeSmooth });
          const stage1 = await composeSoundVideoStage1({ sourceMedia, trimmedAudioBuffer: trimmed, renderOptions });
          stagedMuxedBlob = stage1.blob;
          stagedMuxedExt = stage1.ext;
        } catch {}
      }

      const itemId = `stk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const newItem = {
        id: itemId,
        title: visualFileMeta?.name || `Stiker #${stickerQueue.length + 1}`,
        sourceKind: 'composed',
        visualFile: visualFileObj,
        audioFile: audioFileObj,
        audioBuffer,
        thumbnailUrl,
        totalDuration: audioBuffer.duration,
        startSec,
        endSec,
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

  // ─── MODE B: MULTI-UPLOAD BANYAK VIDEO SEKALIGUS KE ANTREAN ───
  const handleSelectMultiVideos = async (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    if (files.length > 10) {
      onShowToast?.('Maksimal 10 video per batch upload agar browser HP tetap ringan.', 'info');
    }
    const chosen = files.slice(0, 10);
    setIsImportingMulti(true);

    const addedItems = [];
    let firstVisualFile = null;

    for (const file of chosen) {
      if (file.size > MAX_VISUAL_FILE_BYTES) {
        onShowToast?.(`${file.name} melebihi batas 25 MB, dilewati.`, 'error');
        continue;
      }

      let tempLoaded = null;
      try {
        const meta = await probeVideoMetadata(file);
        tempLoaded = await loadMediaElementFromFile(file);
        const clipEnd = Number(Math.max(0.5, Math.min(meta.duration, multiMaxCapSec)).toFixed(1));
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
          visualFile: file,
          audioFile: null,
          audioBuffer: null,
          thumbnailUrl: thumbUrl,
          totalDuration: meta.duration,
          startSec: 0,
          endSec: clipEnd,
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

        if (!firstVisualFile) firstVisualFile = file;
      } catch (err) {
        onShowToast?.(err.message || `Gagal memuat ${file.name}.`, 'error');
      } finally {
        if (tempLoaded) releaseMediaElement(tempLoaded.mediaEl, tempLoaded.objectUrl);
      }
    }

    setIsImportingMulti(false);
    if (addedItems.length > 0) {
      setStickerQueue((prev) => [...prev, ...addedItems]);
      onShowToast?.(`${addedItems.length} video bersuara masuk ke Antrean Stiker Audio!`, 'success');
      if (firstVisualFile) {
        handleSelectVisualFile(firstVisualFile);
        loadAudioSource(firstVisualFile, '[Video] ').catch(() => {});
      }
    }
  };

  // ─── PREVIEW ITEM ANTREAN KE LIVE STAGE ───
  const handlePreviewQueueItem = async (item) => {
    if (!item?.visualFile) return;
    setCropMode(item.cropMode || 'cover');
    setStickerText(item.stickerText || '');
    setPackName(item.packName || 'Kuro Sound Sticker');
    setPackPublisher(item.packPublisher || 'Kuro Studio');

    await handleSelectVisualFile(item.visualFile);
    if (item.audioBuffer) {
      setAudioBuffer(item.audioBuffer);
      setWaveformPeaks(extractWaveformPeaks(item.audioBuffer, 96));
      setStartSec(item.startSec || 0);
      setEndSec(item.endSec || 5);
    } else {
      await loadAudioSource(item.visualFile, '[Video] ');
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
        item,
        blueprint: soundStickerBlueprint
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
    [connectionStatus, deviceToken, sessionId, soundStickerBlueprint]
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

    const tempItem = {
      id: `direct_${Date.now()}`,
      title: visualFileMeta?.name || 'Stiker Suara',
      sourceKind: 'composed',
      visualFile: visualFileObj,
      audioFile: audioFileObj,
      audioBuffer,
      thumbnailUrl: createSquareThumbnailDataUrl(sourceMedia, renderOptions),
      totalDuration: audioBuffer.duration,
      startSec,
      endSec,
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

  // Kirim Semua Antrean Berurutan (Jeda 1500ms Antar Item)
  const handleSendAllQueue = async () => {
    if (isBatchSending) return;
    if (connectionStatus !== 'connected') {
      onShowToast?.('Tautkan WhatsApp terlebih dahulu di Koneksi WA.', 'error');
      setMobileTab('wa');
      return;
    }

    const targets = stickerQueue.filter((it) => it.status !== 'delivered' && it.status !== 'server_ack');
    if (targets.length === 0) return;

    setIsBatchSending(true);
    let okCount = 0;

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

    setIsBatchSending(false);
    setBatchProgress(null);
    if (okCount === targets.length) {
      onShowToast?.(`${okCount} Stiker berhasil dikirim ke chat WA Anda!`, 'success');
    } else {
      onShowToast?.(`${okCount}/${targets.length} terkirim. Item gagal dapat dicoba ulang 1 klik.`, 'info');
    }
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

  const handleArmCalibration = () => {
    if (connectionStatus !== 'connected' || !socketRef.current) {
      onShowToast?.('Tautkan WhatsApp terlebih dahulu sebelum memulai deteksi format.', 'error');
      return;
    }
    setCalibrationLogs([]);
    socketRef.current.emit('start-sound-sticker-calibration', { sessionId, deviceToken });
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
    if (connectionStatus !== 'connected' || !socketRef.current || isTestingE2ee) return;
    if (e2eeTestTimerRef.current) clearTimeout(e2eeTestTimerRef.current);
    setIsTestingE2ee(true);
    setE2eeDiagStatus(null);
    socketRef.current.emit('test-self-e2ee', { sessionId, deviceToken });
    e2eeTestTimerRef.current = setTimeout(() => setIsTestingE2ee(false), 10000);
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
              onClick={() => setInputMode('single')}
              className={`py-2.5 px-3 font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 min-h-[44px] cursor-pointer ${
                inputMode === 'single' ? 'bg-yellow-300 text-black' : 'bg-white text-neutral-700 hover:bg-neutral-50'
              }`}
            >
              <Sparkles className="w-4 h-4 shrink-0" />
              <span className="truncate">Video + Sound</span>
            </button>
            <button
              type="button"
              onClick={() => setInputMode('multi')}
              className={`py-2.5 px-3 font-black text-xs sm:text-sm border-l-2 border-black flex items-center justify-center gap-1.5 min-h-[44px] cursor-pointer ${
                inputMode === 'multi' ? 'bg-cyan-300 text-black' : 'bg-white text-neutral-700 hover:bg-neutral-50'
              }`}
            >
              <Layers className="w-4 h-4 shrink-0" />
              <span className="truncate">Video Bersuara Banyak</span>
            </button>
          </div>

          {inputMode === 'single' ? (
            <>
              {/* MODE A — INPUT VISUAL + OPSI 1:1 */}
              <section className="bg-white border-2 border-black shadow-[4px_4px_0px_#000] p-3.5 sm:p-4 space-y-3.5 min-w-0">
                <div className="flex items-center justify-between gap-2 pb-2 border-b-2 border-black">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-yellow-300 border border-black font-black text-[10px] uppercase">
                      Mode A • 1
                    </span>
                    <h2 className="font-black text-xs sm:text-sm uppercase text-black">
                      Pilih Foto atau Video (1:1)
                    </h2>
                  </div>
                  {visualFileMeta && (
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-neutral-100 border border-black">
                      {visualFileMeta.kind === 'video' ? 'VIDEO' : 'FOTO'} ({visualFileMeta.width}&times;{visualFileMeta.height})
                    </span>
                  )}
                </div>

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
                    {visualFileMeta ? `Ganti Visual: ${visualFileMeta.name}` : 'Pilih 1 Foto atau Video (MP4/WebM/JPG/PNG)'}
                  </span>
                  <span className="text-[11px] font-semibold text-neutral-600">
                    Kotak 512&times;512 px &bull; Diproses lokal di perangkat (maks 25 MB)
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

              {/* MODE A — INPUT SOUND & WAVEFORM TRIMMER */}
              <section className="bg-white border-2 border-black shadow-[4px_4px_0px_#000] p-3.5 sm:p-4 space-y-3.5 min-w-0">
                <div className="flex items-center justify-between gap-2 pb-2 border-b-2 border-black flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-cyan-300 border border-black font-black text-[10px] uppercase">
                      Mode A • 2
                    </span>
                    <h2 className="font-black text-xs sm:text-sm uppercase text-black flex items-center gap-1.5">
                      <Scissors className="w-4 h-4" />
                      Sound &amp; Atur Detik Potongan
                    </h2>
                  </div>
                  {audioFileMeta && (
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-emerald-100 border border-black">
                      Asli: {audioFileMeta.duration.toFixed(1)}s
                    </span>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    onClick={() => audioInputRef.current?.click()}
                    disabled={isDecodingAudio}
                    className="flex-1 p-3 border-2 border-black bg-neutral-50 hover:bg-cyan-50 font-black text-xs flex items-center justify-center gap-2 cursor-pointer min-w-0 min-h-[42px]"
                  >
                    {isDecodingAudio ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <Music className="w-4 h-4 shrink-0" />}
                    <span className="truncate">
                      {audioFileMeta ? `Ganti Sound (${audioFileMeta.name})` : 'Pilih File Audio (MP3/WAV/M4A/OGG)'}
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
                      onClick={() => loadAudioSource(visualFileObj, '[Suara Video] ')}
                      disabled={isDecodingAudio}
                      className="px-3 py-2.5 bg-yellow-300 hover:bg-yellow-400 border-2 border-black shadow-[2px_2px_0px_#000] font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer shrink-0 min-h-[42px]"
                    >
                      <Film className="w-4 h-4" />
                      <span>Pakai Suara Video</span>
                    </button>
                  )}
                </div>

                <p className="text-[11px] font-semibold text-neutral-600 leading-snug">
                  Pilih file sound dari File Manager / Unduhan (MP3, M4A, WAV, OGG, AAC, OPUS, atau ekstrak suara dari Video MP4/WebM).
                </p>

                <div className="grid grid-cols-2 border-2 border-black bg-white">
                  <button
                    type="button"
                    onClick={() => handleChangeTrimMode('full')}
                    className={`py-2 px-3 font-black text-xs min-h-[38px] cursor-pointer ${
                      trimMode === 'full' ? 'bg-black text-cyan-300' : 'hover:bg-neutral-100'
                    }`}
                  >
                    Full Sound
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
                      Durasi &gt; 15s. Batasi 15s agar ukuran aman?
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
                      <span>Batasi 15s</span>
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
                          <span className="font-mono text-emerald-700">{formatTimeSec(startSec)}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => updateSafeStart(startSec - 0.5)}
                            className="px-2.5 py-1.5 bg-white hover:bg-neutral-200 border border-black font-mono font-black text-[11px] cursor-pointer"
                          >
                            -0.5s
                          </button>
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            max={Math.max(0, audioBuffer.duration - 0.2).toFixed(1)}
                            value={startSec}
                            onChange={(e) => updateSafeStart(e.target.value)}
                            className="flex-1 min-w-0 bg-white border border-black px-2 py-1.5 font-mono font-bold text-center"
                          />
                          <button
                            type="button"
                            onClick={() => updateSafeStart(startSec + 0.5)}
                            className="px-2.5 py-1.5 bg-white hover:bg-neutral-200 border border-black font-mono font-black text-[11px] cursor-pointer"
                          >
                            +0.5s
                          </button>
                        </div>
                      </div>

                      <div className="p-2 bg-neutral-50 border border-black space-y-1">
                        <div className="flex items-center justify-between font-black text-[11px]">
                          <span>Selesai:</span>
                          <span className="font-mono text-emerald-700">{formatTimeSec(endSec)}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => updateSafeEnd(endSec - 0.5)}
                            className="px-2.5 py-1.5 bg-white hover:bg-neutral-200 border border-black font-mono font-black text-[11px] cursor-pointer"
                          >
                            -0.5s
                          </button>
                          <input
                            type="number"
                            step="0.1"
                            min="0.2"
                            max={audioBuffer.duration.toFixed(1)}
                            value={endSec}
                            onChange={(e) => updateSafeEnd(e.target.value)}
                            className="flex-1 min-w-0 bg-white border border-black px-2 py-1.5 font-mono font-bold text-center"
                          />
                          <button
                            type="button"
                            onClick={() => updateSafeEnd(endSec + 0.5)}
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
                startSec={startSec}
                endSec={endSec}
                volume={volume}
                fadeSmooth={fadeSmooth}
                renderOptions={renderOptions}
              />

              <div className="flex flex-col sm:flex-row gap-2.5">
                <button
                  type="button"
                  onClick={handleAddModeAToQueue}
                  disabled={isComposingStage1 || !sourceMedia || !audioBuffer}
                  className="flex-1 py-3 px-4 bg-yellow-300 hover:bg-yellow-400 disabled:opacity-45 text-black border-2 border-black shadow-[3px_3px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 font-black text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer min-h-[46px]"
                >
                  {isComposingStage1 ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 stroke-[2.5]" />}
                  <span>+ Tambah ke Antrean Stiker Audio</span>
                </button>

                <button
                  type="button"
                  onClick={handleSendCurrentSingle}
                  disabled={isBatchSending || isComposingStage1 || !sourceMedia || !audioBuffer}
                  className="py-3 px-4 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-45 text-black border-2 border-black shadow-[3px_3px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 font-black text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer min-h-[46px] shrink-0"
                >
                  <Send className="w-4 h-4" />
                  <span>Kirim Langsung 1 Ini</span>
                </button>
              </div>
            </>
          ) : (
            /* MODE B — MULTI-UPLOAD VIDEO BERSUARA SEKALIGUS */
            <section className="bg-white border-2 border-black shadow-[4px_4px_0px_#000] p-3.5 sm:p-5 space-y-4 min-w-0">
              <div className="flex items-center justify-between gap-2 pb-2 border-b-2 border-black">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-cyan-300 border border-black font-black text-[10px] uppercase">
                    Mode B • Batch
                  </span>
                  <h2 className="font-black text-xs sm:text-sm uppercase text-black">
                    Unggah Banyak Video Bersuara Sekaligus
                  </h2>
                </div>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-neutral-100 border border-black">
                  Maks 10 Video
                </span>
              </div>

              <button
                type="button"
                onClick={() => multiVideoInputRef.current?.click()}
                disabled={isImportingMulti}
                className="w-full p-5 border-2 border-dashed border-black bg-cyan-50/70 hover:bg-cyan-100 transition-colors flex flex-col items-center justify-center gap-2 text-center cursor-pointer min-h-[130px]"
              >
                {isImportingMulti ? (
                  <Loader2 className="w-7 h-7 animate-spin text-black" />
                ) : (
                  <Layers className="w-7 h-7 text-black" />
                )}
                <span className="font-black text-xs sm:text-sm text-black">
                  {isImportingMulti ? 'Membaca video & membuat thumbnail 1:1...' : 'Pilih Banyak Video Bersuara Sekaligus'}
                </span>
                <span className="text-[11px] font-semibold text-neutral-700 max-w-md">
                  Cocok jika video Anda sudah ada suaranya (MP4/WebM/MOV). Semua file langsung masuk ke Antrean Stiker Audio (crop 1:1 &amp; pertahankan audio asli).
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
                <div className="space-y-1">
                  <label className="font-black uppercase text-[10px] text-neutral-700 block">Framing Batch 1:1:</label>
                  <div className="grid grid-cols-2 border-2 border-black bg-white">
                    <button
                      type="button"
                      onClick={() => setCropMode('cover')}
                      className={`py-2 px-2 font-black text-[11px] min-h-[38px] cursor-pointer ${
                        cropMode === 'cover' ? 'bg-black text-cyan-300' : 'hover:bg-neutral-100'
                      }`}
                    >
                      Crop Penuh
                    </button>
                    <button
                      type="button"
                      onClick={() => setCropMode('contain')}
                      className={`py-2 px-2 font-black text-[11px] border-l-2 border-black min-h-[38px] cursor-pointer ${
                        cropMode === 'contain' ? 'bg-black text-cyan-300' : 'hover:bg-neutral-100'
                      }`}
                    >
                      Pas (Fit)
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="font-black uppercase text-[10px] text-neutral-700 block">Batas Potong Otomatis:</label>
                  <select
                    value={multiMaxCapSec}
                    onChange={(e) => setMultiMaxCapSec(Number(e.target.value))}
                    className="w-full bg-white border-2 border-black p-2 font-bold text-xs cursor-pointer min-h-[38px]"
                  >
                    <option value={5}>Maksimal 5 detik</option>
                    <option value={8}>Maksimal 8 detik (Disarankan)</option>
                    <option value={10}>Maksimal 10 detik</option>
                    <option value={15}>Maksimal 15 detik</option>
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
                      disabled={isTestingE2ee || isRefreshingE2ee}
                      className="px-2.5 py-1 bg-cyan-200 hover:bg-cyan-300 disabled:opacity-50 border-2 border-black shadow-[1px_1px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] font-black text-[10px] flex items-center gap-1 cursor-pointer min-h-[34px]"
                      title="Kirim 1 pesan teks tes ke nomor sendiri untuk cek ACK enkripsi E2EE real-time"
                    >
                      {isTestingE2ee ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Activity className="w-3 h-3" />
                      )}
                      <span>{isTestingE2ee ? 'Menguji...' : 'Tes E2EE'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleRefreshE2ee}
                      disabled={isRefreshingE2ee || isTestingE2ee}
                      className="px-2.5 py-1 bg-yellow-200 hover:bg-yellow-300 disabled:opacity-50 border-2 border-black shadow-[1px_1px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] font-black text-[10px] flex items-center gap-1 cursor-pointer min-h-[34px]"
                      title="Hapus sesi kunci Signal self-chat yang macet dan tarik pre-key baru tanpa scan ulang"
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
                {e2eeDiagStatus && (
                  <div
                    className={`p-2 border-2 border-black text-[10px] font-mono space-y-0.5 ${
                      e2eeDiagStatus.ok ? 'bg-white text-black' : 'bg-rose-100 text-rose-950'
                    }`}
                  >
                    <div className="font-black flex items-center justify-between gap-2 flex-wrap">
                      <span>
                        {e2eeDiagStatus.kind === 'test'
                          ? e2eeDiagStatus.ackLabel || e2eeDiagStatus.error
                          : e2eeDiagStatus.ok
                            ? `Reset Kunci E2EE Selesai (${e2eeDiagStatus.clearedCount || 0} file sesi lama dibersihkan)`
                            : e2eeDiagStatus.error}
                      </span>
                      {e2eeDiagStatus.baileysVersion && (
                        <span className="px-1.5 py-0.5 bg-neutral-100 border border-black text-[9px]">
                          Baileys v{e2eeDiagStatus.baileysVersion}
                        </span>
                      )}
                    </div>
                    {e2eeDiagStatus.messageId && (
                      <div className="text-neutral-600">
                        ID: #{String(e2eeDiagStatus.messageId).slice(-10)}
                        {e2eeDiagStatus.encodedBytes ? ` • ${e2eeDiagStatus.encodedBytes} B proto` : ''}
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

            {lastSendResult?.ok && (
              <div className="p-2.5 bg-emerald-100 border-2 border-black text-emerald-950 text-[11px] font-semibold space-y-1">
                <div className="font-black flex items-center justify-between gap-1.5 flex-wrap">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span>{deliveryStatus?.label || 'Terkirim ke chat WA Anda!'}</span>
                  </span>
                  {lastSendResult.messageId && (
                    <span className="font-mono text-[10px] px-1.5 py-0.5 bg-white border border-black">
                      #{String(lastSendResult.messageId).slice(-8)}
                    </span>
                  )}
                </div>
                {lastSendResult.note && (
                  <p className="text-[10px] text-neutral-800 leading-snug">{lastSendResult.note}</p>
                )}
                {deliveryTraces.length > 0 && (
                  <div className="pt-1 border-t border-black/20 font-mono text-[9px] text-neutral-700 space-y-0.5">
                    {deliveryTraces.slice(-3).map((t, idx) => (
                      <div key={`${t.at}-${idx}`} className="truncate">
                        [{t.event}] #{String(t.messageId || '').slice(-6)} {t.detail}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Kalibrasi Blueprint Stiker Suara WA (1x Saja Per Perangkat) */}
            <div className="pt-2 border-t-2 border-black space-y-2">
              {soundStickerBlueprint && !calibrationArmed ? (
                <div className="p-2.5 bg-emerald-50 border-2 border-black space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="px-2 py-0.5 bg-emerald-300 border border-black font-black text-[10px] uppercase text-black">
                      Format Stiker Suara Berhasil Terdeteksi!
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={async () => {
                          await copyTextToClipboard(JSON.stringify(soundStickerBlueprint, null, 2));
                          setCopiedSchema(true);
                          setTimeout(() => setCopiedSchema(false), 1800);
                        }}
                        className="px-2 py-1 bg-white hover:bg-neutral-100 border border-black font-bold text-[10px] flex items-center gap-1 cursor-pointer"
                      >
                        {copiedSchema ? <Check className="w-3 h-3 text-emerald-700" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedSchema ? 'Tersalin' : 'Salin Blueprint JSON'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleArmCalibration}
                        disabled={connectionStatus !== 'connected'}
                        className="px-2 py-1 bg-yellow-200 hover:bg-yellow-300 disabled:opacity-45 border border-black font-bold text-[10px] cursor-pointer"
                      >
                        Deteksi Ulang
                      </button>
                    </div>
                  </div>
                  <div className="text-[10px] font-mono text-neutral-800 space-y-0.5">
                    <div>
                      Container: <b>{soundStickerBlueprint.mediaInspection?.detectedContainer || 'unknown'}</b> &bull; Mimetype:{' '}
                      <b>{soundStickerBlueprint.stickerMeta?.mimetype || 'image/webp'}</b>
                    </div>
                    {soundStickerBlueprint.mediaInspection?.chunks?.length > 0 && (
                      <div className="truncate">
                        Chunks: {soundStickerBlueprint.mediaInspection.chunks.slice(0, 8).join(', ')}
                      </div>
                    )}
                    <div>
                      Wire Tags: <b>{soundStickerBlueprint.rawWireTree?.length || 0}</b>
                      {soundStickerBlueprint.unknownWireTags?.length > 0
                        ? ` (Tag Baru: ${soundStickerBlueprint.unknownWireTags.map((t) => `#${t.field}`).join(', ')})`
                        : ''}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-2.5 bg-yellow-50 border-2 border-black space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-black text-[11px] uppercase text-black">
                      Deteksi Format Stiker Suara WA (1x Saja)
                    </span>
                    <Wrench className="w-3.5 h-3.5 text-black shrink-0" />
                  </div>
                  <p className="text-[11px] font-semibold text-neutral-700 leading-snug">
                    {calibrationArmed
                      ? `Aktif Mendengarkan di +${calibrationMeta?.linkedPhone || connectedPhone} — Teruskan 1 Stiker Audio Sekarang!`
                      : "Teruskan 1 contoh stiker suara dari bot/chat ke 'Pesan Diri Sendiri' Anda — web menyalin format aslinya otomatis!"}
                  </p>
                  <button
                    type="button"
                    onClick={handleArmCalibration}
                    disabled={connectionStatus !== 'connected'}
                    className="w-full py-2 px-3 bg-yellow-300 hover:bg-yellow-400 disabled:opacity-45 border-2 border-black shadow-[2px_2px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer min-h-[40px]"
                  >
                    {calibrationArmed ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wrench className="w-3.5 h-3.5" />}
                    <span>
                      {calibrationArmed
                        ? 'Menunggu 1 Contoh Stiker Suara Masuk...'
                        : 'Mulai Deteksi Format'}
                    </span>
                  </button>

                  {calibrationArmed && (
                    <div className="p-2 bg-white border border-black space-y-1 text-[10px] font-mono">
                      <div className="font-black uppercase text-neutral-600">
                        Log Aktivitas Masuk (Real-Time):
                      </div>
                      {calibrationLogs.length === 0 ? (
                        <div className="text-neutral-500">
                          Menunggu pesan masuk dari HP Anda (notify / append / LID)...
                        </div>
                      ) : (
                        calibrationLogs.map((item, idx) => (
                          <div key={`${item.at}-${idx}`} className="text-neutral-800 truncate">
                            [{item.upsertType}] {item.remoteJid ? `${String(item.remoteJid).split('@')[0].slice(-8)} ` : ''}
                            {item.wrapperChain?.length ? `${item.wrapperChain.join(' -> ')} -> ` : ''}
                            {(item.keys || []).join(', ') || 'raw-wire'}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
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
