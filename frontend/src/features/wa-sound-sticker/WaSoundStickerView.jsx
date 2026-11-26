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
  Download,
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
  Info
} from 'lucide-react';
import { downloadBlob } from '../../shared/utils/fileDownload';
import { copyTextToClipboard } from '../../shared/utils/clipboard';
import { isValidPairingPhone, formatPairingCodeDisplay } from '../../shared/utils/waPhoneUtils';
import {
  decodeMediaToAudioBuffer,
  extractWaveformPeaks,
  renderTrimmedAudioBuffer,
  encodeTrimmedAudio,
  createSnippetPlayer
} from './audioTrimmerEngine';
import { buildWaWebpStickerBlob, composeSoundStickerMp4 } from './soundStickerComposer';
import WaSoundStickerPreview from './WaSoundStickerPreview';
import {
  getWaBackendUrl,
  normalizeWaPhone,
  getOrCreateDeviceCredentials,
  getSavedPairingPhone,
  setSavedPairingPhone,
  hasSavedDeviceLink,
  loadDeviceAuthSnapshotLocal,
  saveDeviceAuthSnapshotLocal,
  clearDeviceAuthSnapshotLocal,
  blobToBase64String
} from './deviceSessionHelper';

const MAX_VISUAL_FILE_BYTES = 25 * 1024 * 1024;
const MAX_AUDIO_FILE_BYTES = 25 * 1024 * 1024;
const RECOMMENDED_FULL_SEC = 15;
const MAX_CLIP_DURATION_SEC = 30;

function formatTimeSec(sec = 0) {
  const safe = Math.max(0, Number(sec) || 0);
  const mins = Math.floor(safe / 60);
  const rem = (safe % 60).toFixed(1).padStart(4, '0');
  return `${mins}:${rem}`;
}

export default function WaSoundStickerView({ onBack, onShowToast }) {
  // ─── 1. VISUAL STATE (FOTO / VIDEO 512x512) ───
  const [visualFileMeta, setVisualFileMeta] = useState(null);
  const [sourceMedia, setSourceMedia] = useState(null);
  const [isVideoSource, setIsVideoSource] = useState(false);
  const [visualVideoFile, setVisualVideoFile] = useState(null);
  const [visualPreviewUrl, setVisualPreviewUrl] = useState('');

  const [cropMode, setCropMode] = useState('cover'); // 'cover' | 'contain'
  const [bgStyle, setBgStyle] = useState('solid'); // 'solid' | 'blur' | 'transparent'
  const [bgColor, setBgColor] = useState('#111827');
  const [motionEffect, setMotionEffect] = useState('static'); // 'static' | 'zoom' | 'bounce' | 'wobble'
  const [stickerText, setStickerText] = useState('');
  const [textPosition, setTextPosition] = useState('bottom'); // 'bottom' | 'middle' | 'top'
  const [textSize, setTextSize] = useState(46); // 28..64 px
  const [packName, setPackName] = useState('Kuro Sound Sticker');
  const [packPublisher, setPackPublisher] = useState('Kuro Studio');

  // ─── 2. SOUND & WAVEFORM TRIMMER STATE ───
  const [audioFileMeta, setAudioFileMeta] = useState(null);
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

  const waveformCanvasRef = useRef(null);
  const trimPlayerRef = useRef(null);
  const visualInputRef = useRef(null);
  const audioInputRef = useRef(null);

  // ─── 3. OPSI TAMBAHAN & STATUS KONEKSI WA PER-PERANGKAT ───
  const [includeFavoriteWebp, setIncludeFavoriteWebp] = useState(false);
  const [{ sessionId, deviceToken }] = useState(() => getOrCreateDeviceCredentials());
  const backendUrl = useMemo(() => getWaBackendUrl(), []);
  const socketRef = useRef(null);

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

  const [sendProgress, setSendProgress] = useState({ active: false, label: '', percent: 0 });
  const [lastSendSuccess, setLastSendSuccess] = useState(null);
  const [downloadingKey, setDownloadingKey] = useState('');

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

  // Bersihkan resource URL & pemutar saat keluar
  useEffect(() => {
    trimPlayerRef.current = createSnippetPlayer();
    return () => {
      trimPlayerRef.current?.stop();
      if (visualPreviewUrl) {
        try { URL.revokeObjectURL(visualPreviewUrl); } catch {}
      }
      if (sourceMedia instanceof HTMLVideoElement) {
        try { sourceMedia.pause(); } catch {}
      }
    };
  }, []);

  // ─── KONEKSI SOCKET.IO TERISOLASI PER-PERANGKAT ───
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
      setSendProgress({ active: false, label: '', percent: 0 });
    });

    sock.on('sound-sticker-result', (res) => {
      if (unmounted) return;
      setSendProgress({ active: false, label: '', percent: 0 });
      if (res?.ok) {
        setLastSendSuccess(res);
        setWaError(null);
        onShowToast?.('Stiker Suara berhasil masuk ke chat WA Anda sendiri!', 'success');
      } else {
        const errText = res?.error || 'Gagal mengirim stiker ke WhatsApp.';
        setWaError(errText);
        onShowToast?.(errText, 'error');
      }
    });

    return () => {
      unmounted = true;
      sock.disconnect();
      socketRef.current = null;
    };
  }, [backendUrl, sessionId, deviceToken, onShowToast]);

  // ─── HANDLE UNGGAH FOTO / VIDEO (LANGKAH 1) ───
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

    if (visualPreviewUrl) {
      try { URL.revokeObjectURL(visualPreviewUrl); } catch {}
    }
    const objUrl = URL.createObjectURL(file);

    try {
      if (isVideo) {
        const videoEl = document.createElement('video');
        videoEl.muted = true;
        videoEl.playsInline = true;
        videoEl.crossOrigin = 'anonymous';
        videoEl.preload = 'auto';
        videoEl.src = objUrl;

        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Waktu muat video habis.')), 10000);
          videoEl.onloadeddata = () => { clearTimeout(timer); resolve(); };
          videoEl.onerror = () => { clearTimeout(timer); reject(new Error('Browser gagal memuat video ini.')); };
        });

        setSourceMedia(videoEl);
        setIsVideoSource(true);
        setVisualVideoFile(file);
        setVisualPreviewUrl(objUrl);
        setVisualFileMeta({
          name: file.name,
          kind: 'video',
          duration: Number(videoEl.duration || 0),
          width: videoEl.videoWidth,
          height: videoEl.videoHeight
        });
        onShowToast?.('Video dimuat ke stiker kotak 512×512.', 'success');
      } else {
        const imgEl = new Image();
        imgEl.crossOrigin = 'anonymous';
        imgEl.src = objUrl;

        await new Promise((resolve, reject) => {
          imgEl.onload = resolve;
          imgEl.onerror = () => reject(new Error('Gagal memuat file foto.'));
        });

        setSourceMedia(imgEl);
        setIsVideoSource(false);
        setVisualVideoFile(null);
        setVisualPreviewUrl(objUrl);
        setVisualFileMeta({
          name: file.name,
          kind: 'image',
          width: imgEl.naturalWidth,
          height: imgEl.naturalHeight
        });
        onShowToast?.('Foto dimuat ke stiker kotak 512×512.', 'success');
      }
    } catch (err) {
      try { URL.revokeObjectURL(objUrl); } catch {}
      onShowToast?.(err.message || 'Gagal membaca berkas visual.', 'error');
    }
  };

  // ─── HANDLE UNGGAH / EKSTRAK AUDIO (LANGKAH 2) ───
  const loadAudioSource = async (file, labelPrefix = '') => {
    if (!file) return;
    if (file.size > MAX_AUDIO_FILE_BYTES) {
      onShowToast?.('Ukuran file audio melebihi batas maksimal 25 MB.', 'error');
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
      const initialCutEnd = decoded.duration <= 6
        ? safeFullEnd
        : Number(Math.min(5.0, safeFullEnd).toFixed(1));

      setAudioBuffer(decoded);
      setWaveformPeaks(peaks);
      setAudioFileMeta({ name: `${labelPrefix}${file.name}`, duration: decoded.duration });
      setTrimMode(decoded.duration <= capSec ? 'full' : 'cut');
      setStartSec(0);
      setEndSec(decoded.duration <= capSec ? safeFullEnd : initialCutEnd);
      onShowToast?.(`Audio berhasil dimuat (${decoded.duration.toFixed(1)} detik).`, 'success');
    } catch (err) {
      onShowToast?.(err.message || 'Gagal memproses file audio.', 'error');
    } finally {
      setIsDecodingAudio(false);
    }
  };

  const applyFullModeBounds = useCallback(
    (buf, use15sCap) => {
      if (!buf) return;
      const cap = use15sCap ? RECOMMENDED_FULL_SEC : MAX_CLIP_DURATION_SEC;
      const clampedEnd = Number(Math.min(buf.duration, cap).toFixed(1));
      setStartSec(0);
      setEndSec(Math.max(0.2, clampedEnd));
    },
    []
  );

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

  // Gambar Canvas Waveform Visual Interaktif
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
      ctx.fillStyle = '#9ca3af';
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Unggah audio atau klik "Pakai Suara Asli dari Video"', w * 0.5, h * 0.54);
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
    if (distToStart <= distToEnd) {
      updateSafeStart(clickedSec);
    } else {
      updateSafeEnd(clickedSec);
    }
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

  // ─── TAUTAN WHATSAPP PER PERANGKAT ───
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
    setConnectionStatus('disconnected');
  };

  // ─── BUILDER & PENGIRIMAN 1-FILE STIKER SUARA 512x512 ───
  const buildOutputAssets = useCallback(
    async ({ needMp4 = false, needWebp = false, needAudio = false, onStage }) => {
      let mp4Blob = null;
      let webpBlob = null;
      let audioEnc = null;
      let trimmedBuf = null;

      if (needMp4 || needAudio) {
        if (!audioBuffer) {
          throw new Error('Silakan masukkan Audio/Sound di Langkah 2 terlebih dahulu.');
        }
        onStage?.(`Memotong Audio (${startSec.toFixed(1)}s – ${endSec.toFixed(1)}s)...`, 25);
        trimmedBuf = await renderTrimmedAudioBuffer(audioBuffer, {
          startSec,
          endSec,
          volume,
          fadeSmooth
        });
      }

      if (needMp4 && trimmedBuf) {
        onStage?.('Merakit Stiker 512×512 Bersuara...', 45);
        mp4Blob = await composeSoundStickerMp4({
          sourceMedia,
          trimmedAudioBuffer: trimmedBuf,
          renderOptions,
          onProgress: (p) => onStage?.(`Merakit Stiker 512×512 Bersuara (${p}%)...`, 45 + Math.round(p * 0.35))
        });
      }

      if (needWebp) {
        onStage?.('Membuat versi Stiker WebP 512×512...', 82);
        const animDur = audioBuffer ? Math.min(5, selectedDuration) : 3.5;
        webpBlob = await buildWaWebpStickerBlob({
          sourceMedia,
          isAnimated: isVideoSource || motionEffect !== 'static',
          durationSec: animDur,
          renderOptions,
          packMeta: { packName, publisher: packPublisher }
        });
      }

      if (needAudio && trimmedBuf) {
        onStage?.('Mengencode Potongan Sound...', 70);
        audioEnc = await encodeTrimmedAudio(trimmedBuf);
      }

      return { mp4Blob, webpBlob, audioEnc };
    },
    [
      audioBuffer,
      startSec,
      endSec,
      volume,
      fadeSmooth,
      sourceMedia,
      renderOptions,
      selectedDuration,
      isVideoSource,
      motionEffect,
      packName,
      packPublisher
    ]
  );

  const handleSendToSelfWa = async () => {
    if (sendProgress.active) return;
    if (!sourceMedia) {
      onShowToast?.('Pilih Foto atau Video di Langkah 1 terlebih dahulu.', 'error');
      return;
    }
    if (!audioBuffer) {
      onShowToast?.('Masukkan Audio/Sound di Langkah 2 terlebih dahulu.', 'error');
      return;
    }
    if (connectionStatus !== 'connected' || !socketRef.current) {
      onShowToast?.('Perangkat WA belum tertaut aktif. Tautkan di Langkah 4.', 'error');
      return;
    }

    setWaError(null);
    setLastSendSuccess(null);
    setSendProgress({ active: true, label: 'Memotong Audio...', percent: 15 });

    try {
      const { mp4Blob, webpBlob } = await buildOutputAssets({
        needMp4: true,
        needWebp: includeFavoriteWebp,
        onStage: (label, percent) => setSendProgress({ active: true, label, percent })
      });

      if (!mp4Blob || mp4Blob.size > 4.5 * 1024 * 1024) {
        throw new Error('Ukuran Stiker Suara melebihi 4.5 MB. Perpendek durasi potongan audio.');
      }
      if (webpBlob && webpBlob.size > 1.2 * 1024 * 1024) {
        throw new Error('Versi stiker WebP melebihi batas 1.2 MB.');
      }

      setSendProgress({ active: true, label: 'Mengirim ke Chat WA Anda...', percent: 94 });
      const videoMp4Base64 = await blobToBase64String(mp4Blob);
      const stickerWebpBase64 = webpBlob ? await blobToBase64String(webpBlob) : '';

      socketRef.current.emit('send-self-sound-sticker', {
        sessionId,
        deviceToken,
        videoMp4Base64,
        stickerWebpBase64,
        includeFavoriteWebp: Boolean(includeFavoriteWebp && stickerWebpBase64),
        caption: stickerText ? `${stickerText.toUpperCase()} — ${packName}` : ''
      });
    } catch (err) {
      setSendProgress({ active: false, label: '', percent: 0 });
      setWaError(err.message || 'Gagal menyiapkan berkas untuk WA.');
      onShowToast?.(err.message || 'Gagal menyiapkan stiker suara.', 'error');
    }
  };

  const handleLocalDownload = async (kind) => {
    if (downloadingKey) return;
    if ((kind === 'mp4' || kind === 'webp') && !sourceMedia) {
      onShowToast?.('Pilih Foto atau Video terlebih dahulu.', 'error');
      return;
    }
    if ((kind === 'mp4' || kind === 'audio') && !audioBuffer) {
      onShowToast?.('Masukkan Audio/Sound terlebih dahulu.', 'error');
      return;
    }

    setDownloadingKey(kind);
    try {
      const { mp4Blob, webpBlob, audioEnc } = await buildOutputAssets({
        needMp4: kind === 'mp4',
        needWebp: kind === 'webp',
        needAudio: kind === 'audio'
      });

      const stamp = Date.now();
      if (kind === 'mp4' && mp4Blob) {
        downloadBlob(mp4Blob, `kuro_sound_sticker_${stamp}.mp4`);
      } else if (kind === 'webp' && webpBlob) {
        downloadBlob(webpBlob, `kuro_sticker_${stamp}.webp`);
      } else if (kind === 'audio' && audioEnc?.blob) {
        downloadBlob(audioEnc.blob, `kuro_sound_trim_${stamp}.${audioEnc.ext}`);
      }
      onShowToast?.('Berkas berhasil diunduh ke perangkat Anda!', 'success');
    } catch (err) {
      onShowToast?.(err.message || 'Gagal mengunduh berkas.', 'error');
    } finally {
      setDownloadingKey('');
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-5 overflow-x-hidden min-w-0">
      {/* Header Studio */}
      <div className="bg-white border-2 border-black shadow-[4px_4px_0px_#000] p-3.5 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="p-2 bg-white hover:bg-neutral-100 border-2 border-black shadow-[2px_2px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer shrink-0"
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
                WA SOUND
              </span>
            </div>
            <p className="text-xs text-neutral-700 font-semibold mt-0.5">
              Buat stiker kotak 1:1 (512&times;512) bersuara dengan teks meme &amp; potongan detik presisi, lalu kirim langsung ke WA sendiri.
            </p>
          </div>
        </div>

        <span className={`px-2.5 py-1 border-2 border-black font-mono font-black text-[10px] self-start sm:self-center shrink-0 ${
          connectionStatus === 'connected' ? 'bg-emerald-300 text-black' : 'bg-yellow-200 text-black'
        }`}>
          {connectionStatus === 'connected' ? `WA AKTIF +${connectedPhone}` : 'WA BELUM TERTAUT'}
        </span>
      </div>

      {/* Workspace 2 Kolom Responsif */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* ─── KOLOM KIRI: INPUT VISUAL & PEMOTONG SOUND ─── */}
        <div className="lg:col-span-7 space-y-5 min-w-0">
          {/* LANGKAH 1: VISUAL 512x512 + TEKS MEME */}
          <section className="bg-white border-2 border-black shadow-[4px_4px_0px_#000] p-3.5 sm:p-5 space-y-4 min-w-0">
            <div className="flex items-center justify-between gap-2 pb-2 border-b-2 border-black">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-yellow-300 border border-black font-black text-[10px] uppercase">
                  Langkah 1
                </span>
                <h2 className="font-black text-sm uppercase text-black">
                  Visual Kotak 1:1 &amp; Teks Meme
                </h2>
              </div>
              {visualFileMeta && (
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-neutral-100 border border-black">
                  {visualFileMeta.kind === 'video' ? 'VIDEO' : 'FOTO'}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => visualInputRef.current?.click()}
              className="w-full p-4 border-2 border-dashed border-black bg-neutral-50 hover:bg-yellow-50 transition-colors flex flex-col items-center justify-center gap-1.5 text-center cursor-pointer min-h-[104px]"
            >
              <div className="flex items-center gap-2 text-black">
                <ImageIcon className="w-5 h-5" />
                <Film className="w-5 h-5" />
              </div>
              <span className="font-black text-xs text-black break-all">
                {visualFileMeta ? `Ganti Visual: ${visualFileMeta.name}` : 'Pilih Foto (JPG/PNG/WebP) atau Video (MP4/WebM/MOV)'}
              </span>
              <span className="text-[11px] font-semibold text-neutral-600">
                1:1 Persegi 512&times;512 px &bull; Diproses 100% di perangkat Anda (maks 25 MB)
              </span>
            </button>
            <input
              ref={visualInputRef}
              type="file"
              accept="image/*,video/*"
              onChange={(e) => handleSelectVisualFile(e.target.files?.[0])}
              className="hidden"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {/* Framing 1:1 */}
              <div className="space-y-1.5">
                <label className="font-black uppercase text-[10px] text-neutral-700 block">
                  Framing 1:1:
                </label>
                <div className="grid grid-cols-2 border-2 border-black bg-white">
                  <button
                    type="button"
                    onClick={() => setCropMode('cover')}
                    className={`py-2 px-2 font-black text-[11px] cursor-pointer ${
                      cropMode === 'cover' ? 'bg-black text-yellow-300' : 'hover:bg-neutral-100'
                    }`}
                  >
                    Crop Penuh
                  </button>
                  <button
                    type="button"
                    onClick={() => setCropMode('contain')}
                    className={`py-2 px-2 font-black text-[11px] border-l-2 border-black cursor-pointer ${
                      cropMode === 'contain' ? 'bg-black text-yellow-300' : 'hover:bg-neutral-100'
                    }`}
                  >
                    Pas (Fit)
                  </button>
                </div>
              </div>

              {/* Latar Fit / Kotak */}
              <div className="space-y-1.5">
                <label className="font-black uppercase text-[10px] text-neutral-700 block">
                  Latar Belakang Kotak:
                </label>
                <div className="flex items-center gap-2">
                  <select
                    value={bgStyle}
                    onChange={(e) => setBgStyle(e.target.value)}
                    className="flex-1 bg-white border-2 border-black p-2 font-bold text-xs cursor-pointer"
                  >
                    <option value="solid">Latar Warna Solid</option>
                    <option value="blur">Latar Blur Otomatis (Fit)</option>
                    <option value="transparent">Transparan (Khusus .webp)</option>
                  </select>
                  {bgStyle === 'solid' && (
                    <input
                      type="color"
                      value={bgColor}
                      onChange={(e) => setBgColor(e.target.value)}
                      className="w-10 h-9 border-2 border-black bg-white p-0.5 cursor-pointer"
                      aria-label="Warna latar stiker"
                    />
                  )}
                </div>
              </div>

              {/* Efek Gerak jika Foto */}
              {!isVideoSource && (
                <div className="space-y-1.5">
                  <label className="font-black uppercase text-[10px] text-neutral-700 block">
                    Efek Gerak Foto:
                  </label>
                  <select
                    value={motionEffect}
                    onChange={(e) => setMotionEffect(e.target.value)}
                    className="w-full bg-white border-2 border-black p-2 font-bold text-xs cursor-pointer"
                  >
                    <option value="static">Diam (Statis)</option>
                    <option value="zoom">Zoom Halus</option>
                    <option value="bounce">Denyut Irama (Beat Bounce)</option>
                    <option value="wobble">Goyang Meme</option>
                  </select>
                </div>
              )}

              {/* Teks Meme Gaya WA */}
              <div className={`space-y-1.5 ${isVideoSource ? 'sm:col-span-2' : ''}`}>
                <label className="font-black uppercase text-[10px] text-neutral-700 block">
                  Teks Meme Stiker WA (Putih Outline Hitam):
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={stickerText}
                    maxLength={40}
                    onChange={(e) => setStickerText(e.target.value)}
                    placeholder="Contoh: JAWA JAWA JAWA"
                    className="flex-1 min-w-0 bg-white border-2 border-black px-2.5 py-2 font-bold text-xs"
                  />
                  <select
                    value={textPosition}
                    onChange={(e) => setTextPosition(e.target.value)}
                    className="bg-white border-2 border-black p-2 font-bold text-xs cursor-pointer"
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
                    <span>Ukuran Teks Meme:</span>
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
                <label className="font-black uppercase text-[10px] text-neutral-700 block">
                  Nama Pack Stiker:
                </label>
                <input
                  type="text"
                  value={packName}
                  maxLength={50}
                  onChange={(e) => setPackName(e.target.value)}
                  className="w-full bg-white border-2 border-black px-2.5 py-1.5 font-bold text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="font-black uppercase text-[10px] text-neutral-700 block">
                  Nama Pembuat:
                </label>
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

          {/* LANGKAH 2: AUDIO & PEMOTONG DETIK PRESISI */}
          <section className="bg-white border-2 border-black shadow-[4px_4px_0px_#000] p-3.5 sm:p-5 space-y-4 min-w-0">
            <div className="flex items-center justify-between gap-2 pb-2 border-b-2 border-black flex-wrap">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-cyan-300 border border-black font-black text-[10px] uppercase">
                  Langkah 2
                </span>
                <h2 className="font-black text-sm uppercase text-black flex items-center gap-1.5">
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
                className="flex-1 p-3 border-2 border-black bg-neutral-50 hover:bg-cyan-50 font-black text-xs flex items-center justify-center gap-2 cursor-pointer min-w-0"
              >
                {isDecodingAudio ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <Music className="w-4 h-4 shrink-0" />}
                <span className="truncate">
                  {audioFileMeta ? `Ganti Sound (${audioFileMeta.name})` : 'Pilih File Audio (MP3/WAV/M4A/OGG/AAC)'}
                </span>
              </button>
              <input
                ref={audioInputRef}
                type="file"
                accept="audio/*,video/*"
                onChange={(e) => loadAudioSource(e.target.files?.[0])}
                className="hidden"
              />

              {isVideoSource && visualVideoFile && (
                <button
                  type="button"
                  onClick={() => loadAudioSource(visualVideoFile, '[Suara Video] ')}
                  disabled={isDecodingAudio}
                  className="px-3 py-3 bg-yellow-300 hover:bg-yellow-400 border-2 border-black shadow-[2px_2px_0px_#000] font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                >
                  <Film className="w-4 h-4" />
                  <span>Pakai Suara Asli dari Video</span>
                </button>
              )}
            </div>

            {/* Sakelar 2 Mode: Full Sound vs Atur Detik (Potong) */}
            <div className="grid grid-cols-2 border-2 border-black bg-white">
              <button
                type="button"
                onClick={() => handleChangeTrimMode('full')}
                className={`py-2 px-3 font-black text-xs cursor-pointer ${
                  trimMode === 'full' ? 'bg-black text-cyan-300' : 'hover:bg-neutral-100'
                }`}
              >
                Full Sound
              </button>
              <button
                type="button"
                onClick={() => handleChangeTrimMode('cut')}
                className={`py-2 px-3 font-black text-xs border-l-2 border-black cursor-pointer ${
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
                  Audio lebih dari 15 detik. Batasi otomatis 15s agar ringan &amp; cepat dikirim?
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

            {/* Waveform Interaktif */}
            <div className="border-2 border-black bg-neutral-50 overflow-hidden">
              <canvas
                ref={waveformCanvasRef}
                width={640}
                height={96}
                onClick={handleWaveformClick}
                className="w-full h-24 block cursor-pointer"
                title="Klik pada waveform untuk mengatur titik mulai atau selesai"
              />
            </div>

            {audioBuffer && (
              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-2.5 bg-neutral-50 border border-black space-y-1.5">
                    <div className="flex items-center justify-between font-black text-[11px]">
                      <span>Mulai (detik):</span>
                      <span className="font-mono text-emerald-700">{formatTimeSec(startSec)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => updateSafeStart(startSec - 0.5)}
                        className="px-2 py-1.5 bg-white hover:bg-neutral-200 border border-black font-mono font-black text-[11px] cursor-pointer"
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
                        className="px-2 py-1.5 bg-white hover:bg-neutral-200 border border-black font-mono font-black text-[11px] cursor-pointer"
                      >
                        +0.5s
                      </button>
                    </div>
                  </div>

                  <div className="p-2.5 bg-neutral-50 border border-black space-y-1.5">
                    <div className="flex items-center justify-between font-black text-[11px]">
                      <span>Selesai (detik):</span>
                      <span className="font-mono text-emerald-700">{formatTimeSec(endSec)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => updateSafeEnd(endSec - 0.5)}
                        className="px-2 py-1.5 bg-white hover:bg-neutral-200 border border-black font-mono font-black text-[11px] cursor-pointer"
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
                        className="px-2 py-1.5 bg-white hover:bg-neutral-200 border border-black font-mono font-black text-[11px] cursor-pointer"
                      >
                        +0.5s
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 bg-emerald-50 border-2 border-black">
                  <span className="font-black text-xs">
                    Durasi Stiker Suara: <span className="font-mono text-emerald-800">{selectedDuration} detik</span>
                  </span>

                  <button
                    type="button"
                    onClick={handleToggleTestSound}
                    className={`px-3 py-2 border-2 border-black shadow-[2px_2px_0px_#000] font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer ${
                      isTestingSound ? 'bg-rose-500 text-white' : 'bg-yellow-300 hover:bg-yellow-400 text-black'
                    }`}
                  >
                    {isTestingSound ? <Square className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-black" />}
                    <span>{isTestingSound ? 'Hentikan Tes' : 'Tes Potongan Sound'}</span>
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
                    <span>Fade Halus Awal/Akhir (40ms anti klik)</span>
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
        </div>

        {/* ─── KOLOM KANAN: LIVE PREVIEW STIKER SUARA WA & KIRIM ─── */}
        <div className="lg:col-span-5 space-y-5 min-w-0">
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

          {/* LANGKAH 4: KONEKSI WA PER PERANGKAT & KIRIM / UNDUH */}
          <section className="bg-white border-2 border-black shadow-[4px_4px_0px_#000] p-3.5 sm:p-4 space-y-3.5 min-w-0">
            <div className="flex items-center justify-between gap-2 pb-2 border-b-2 border-black">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-black text-yellow-300 border border-black font-black text-[10px] uppercase">
                  Langkah 4
                </span>
                <h3 className="font-black text-xs sm:text-sm uppercase text-black">
                  Kirim ke WA Saya &amp; Unduh
                </h3>
              </div>
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            </div>

            {connectionStatus === 'connected' ? (
              <div className="p-3 bg-emerald-100 border-2 border-black space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span className="font-black text-xs text-black truncate">
                      WA Terhubung &bull; +{connectedPhone} &mdash; Siap Kirim
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleLogoutWa}
                    className="px-2 py-1 bg-white hover:bg-rose-50 border border-black font-bold text-[10px] flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    <LogOut className="w-3 h-3" />
                    <span>Putus</span>
                  </button>
                </div>
                <p className="text-[11px] font-semibold text-neutral-700">
                  Dikirim sebagai 1 objek kotak 1:1 bersuara langsung ke chat Anda sendiri.
                </p>
              </div>
            ) : (
              <div className="p-3 bg-neutral-50 border-2 border-black space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-black text-xs text-black">
                    Tautkan Perangkat WA Anda
                  </span>
                  <span className="text-[10px] font-mono font-bold text-neutral-600">
                    {socketConnected ? (hasSavedAuth ? 'Memulihkan...' : 'Server Siap') : 'Menghubungkan...'}
                  </span>
                </div>

                <div className="grid grid-cols-2 border-2 border-black bg-white text-[11px]">
                  <button
                    type="button"
                    onClick={() => setAuthMethod('pairing')}
                    className={`py-1.5 font-black flex items-center justify-center gap-1 cursor-pointer ${
                      authMethod === 'pairing' ? 'bg-black text-yellow-300' : 'hover:bg-neutral-100'
                    }`}
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>Kode Pairing</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthMethod('qr')}
                    className={`py-1.5 font-black border-l-2 border-black flex items-center justify-center gap-1 cursor-pointer ${
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
                        className="flex-1 min-w-0 bg-white border-2 border-black px-2.5 py-2 text-xs font-bold"
                      />
                      <button
                        type="button"
                        onClick={() => handleStartPairing('pairing')}
                        disabled={isRequestingPairing || !socketConnected}
                        className="px-3 py-2 bg-yellow-300 hover:bg-yellow-400 disabled:opacity-50 border-2 border-black font-black text-xs cursor-pointer shrink-0 flex items-center gap-1"
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
                        className="w-full py-2.5 bg-yellow-300 hover:bg-yellow-400 border-2 border-black font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Muat QR Code Tautan</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            <label className="flex items-center justify-between gap-2 px-2.5 py-2 bg-neutral-50 border border-black text-[11px] font-bold cursor-pointer">
              <span>Sertakan juga versi Stiker .webp untuk simpan ke Favorit WA</span>
              <input
                type="checkbox"
                checked={includeFavoriteWebp}
                onChange={(e) => setIncludeFavoriteWebp(e.target.checked)}
                className="w-4 h-4 accent-black cursor-pointer"
              />
            </label>

            {waError && (
              <div className="p-2.5 bg-rose-100 border-2 border-rose-500 text-rose-950 text-[11px] font-bold flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{waError}</span>
              </div>
            )}

            {lastSendSuccess?.ok && (
              <div className="p-2.5 bg-emerald-100 border-2 border-black text-emerald-950 text-[11px] font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>Berhasil Masuk ke WA Anda! Buka chat &ldquo;Pesan Diri Sendiri&rdquo; di WhatsApp.</span>
              </div>
            )}

            {sendProgress.active && (
              <div className="p-2.5 bg-yellow-50 border-2 border-black space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-black">
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    {sendProgress.label}
                  </span>
                  <span className="font-mono">{sendProgress.percent}%</span>
                </div>
                <div className="w-full h-2.5 bg-white border border-black overflow-hidden">
                  <div
                    style={{ width: `${Math.max(5, Math.min(100, sendProgress.percent))}%` }}
                    className="h-full bg-emerald-500 transition-all duration-200"
                  />
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={handleSendToSelfWa}
              disabled={sendProgress.active || !sourceMedia || !audioBuffer || connectionStatus !== 'connected'}
              className="w-full py-3 px-4 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-45 text-black border-2 border-black shadow-[3px_3px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 font-black text-sm flex items-center justify-center gap-2 cursor-pointer transition-all"
            >
              {sendProgress.active ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              <span>Kirim Stiker Suara ke WA Saya</span>
            </button>

            <div className="pt-2 border-t-2 border-black space-y-2">
              <span className="text-[10px] font-black uppercase text-neutral-600 block">
                Atau Unduh Lokal ke Perangkat Anda (0 Beban Server):
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleLocalDownload('mp4')}
                  disabled={Boolean(downloadingKey) || !sourceMedia || !audioBuffer}
                  className="py-2 px-2 bg-white hover:bg-cyan-100 disabled:opacity-40 border-2 border-black shadow-[2px_2px_0px_#000] font-black text-[11px] flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 shrink-0" />
                  <span>{downloadingKey === 'mp4' ? 'Merakit...' : 'Stiker (.mp4)'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleLocalDownload('webp')}
                  disabled={Boolean(downloadingKey) || !sourceMedia}
                  className="py-2 px-2 bg-white hover:bg-yellow-100 disabled:opacity-40 border-2 border-black shadow-[2px_2px_0px_#000] font-black text-[11px] flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 shrink-0" />
                  <span>{downloadingKey === 'webp' ? 'Memproses...' : 'Stiker (.webp)'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleLocalDownload('audio')}
                  disabled={Boolean(downloadingKey) || !audioBuffer}
                  className="py-2 px-2 bg-white hover:bg-emerald-100 disabled:opacity-40 border-2 border-black shadow-[2px_2px_0px_#000] font-black text-[11px] flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 shrink-0" />
                  <span>{downloadingKey === 'audio' ? 'Memotong...' : 'Sound (.m4a)'}</span>
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
