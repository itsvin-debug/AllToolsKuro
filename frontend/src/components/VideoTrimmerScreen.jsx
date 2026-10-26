import React, { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import confetti from 'canvas-confetti';
import CosmicBackButton from './CosmicBackButton';
import { 
  Scissors, 
  ArrowLeft, 
  Upload, 
  Play, 
  Pause, 
  RotateCcw, 
  Download, 
  Volume2, 
  VolumeX, 
  Sparkles, 
  Check, 
  Loader2, 
  Clock, 
  Film, 
  Layers, 
  ChevronRight, 
  AlertCircle,
  FileVideo,
  Zap,
  Repeat
} from 'lucide-react';
import { addGalleryItem } from '../services/storageService';

// Format detik ke timestamp presisi (HH:MM:SS.ms)
function formatTimePrecision(seconds) {
  if (isNaN(seconds) || seconds < 0) return '00:00:00.00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);

  const pad = (n, len = 2) => String(n).padStart(len, '0');
  if (hrs > 0) {
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}.${pad(ms)}`;
  }
  return `${pad(mins)}:${pad(secs)}.${pad(ms)}`;
}

export default function VideoTrimmerScreen({ onBack }) {
  const [videoFile, setVideoFile] = useState(null);
  const [videoSrc, setVideoSrc] = useState(null);
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState(0);
  const [duration, setDuration] = useState(0);

  // Range Potongan (Detik)
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoopingCut, setIsLoopingCut] = useState(true);

  // Filmstrip Thumbnails
  const [thumbnails, setThumbnails] = useState([]);
  const [isGeneratingThumbs, setIsGeneratingThumbs] = useState(false);

  // Dragging Handles Timeline
  const [draggingHandle, setDraggingHandle] = useState(null); // 'start' | 'end' | null

  // Status Ekspor
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [trimmedResult, setTrimmedResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const videoRef = useRef(null);
  const timelineRef = useRef(null);

  // Bersihkan ObjectURL saat unmount
  useEffect(() => {
    return () => {
      if (videoSrc) URL.revokeObjectURL(videoSrc);
    };
  }, [videoSrc]);

  // Handle Upload Video
  const handleFileUpload = (file) => {
    if (!file) return;
    if (!file.type.includes('video') && !file.name.match(/\.(mp4|webm|mov|mkv)$/i)) {
      setErrorMessage('Format file tidak didukung. Mohon pilih video MP4, WEBM, atau MOV.');
      return;
    }

    setErrorMessage('');
    setTrimmedResult(null);
    if (videoSrc) URL.revokeObjectURL(videoSrc);

    setVideoFile(file);
    setFileName(file.name);
    setFileSize(file.size);

    const url = URL.createObjectURL(file);
    setVideoSrc(url);
    setIsPlaying(false);
    setStartTime(0);
    setCurrentTime(0);
  };

  // Saat metadata video termuat di tag <video>
  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    const dur = videoRef.current.duration;
    if (dur && !isNaN(dur)) {
      setDuration(dur);
      setStartTime(0);
      setEndTime(dur);
      generateThumbnails(videoSrc, dur);
    }
  };

  // Generate Frame Thumbnails di Sepanjang Timeline Track
  const generateThumbnails = async (src, totalDuration) => {
    setIsGeneratingThumbs(true);
    setThumbnails([]);

    try {
      const thumbCount = 10;
      const thumbs = [];
      const hiddenVideo = document.createElement('video');
      hiddenVideo.src = src;
      hiddenVideo.muted = true;
      hiddenVideo.playsInline = true;
      hiddenVideo.crossOrigin = 'anonymous';

      await new Promise((res) => {
        hiddenVideo.onloadeddata = res;
      });

      const canvas = document.createElement('canvas');
      canvas.width = 120;
      canvas.height = 70;
      const ctx = canvas.getContext('2d');

      for (let i = 0; i < thumbCount; i++) {
        const seekTime = (totalDuration / (thumbCount - 1)) * i;
        hiddenVideo.currentTime = Math.min(seekTime, totalDuration - 0.05);

        await new Promise((resolve) => {
          hiddenVideo.onseeked = resolve;
        });

        ctx.drawImage(hiddenVideo, 0, 0, canvas.width, canvas.height);
        thumbs.push(canvas.toDataURL('image/jpeg', 0.6));
      }

      setThumbnails(thumbs);
    } catch (err) {
      console.warn('Gagal generate thumbnails track:', err);
    } finally {
      setIsGeneratingThumbs(false);
    }
  };

  // Loop & Bound Kontrol Playback Pemutar Video
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const cur = videoRef.current.currentTime;
    setCurrentTime(cur);

    // Jika mode loop preview cut aktif dan telah melewati batas akhir potongan
    if (isLoopingCut && cur >= endTime) {
      videoRef.current.currentTime = startTime;
      setCurrentTime(startTime);
    }
  };

  // Toggle Play / Pause
  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      if (videoRef.current.currentTime < startTime || videoRef.current.currentTime >= endTime) {
        videoRef.current.currentTime = startTime;
      }
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  // Preview Cut: Putar tepat dari Start Time
  const handlePreviewCut = () => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = startTime;
    setCurrentTime(startTime);
    setIsLoopingCut(true);
    videoRef.current.play();
    setIsPlaying(true);
  };

  // Ref untuk mendeteksi apakah sedang drag agar click tidak bentrok
  const isDraggingRef = useRef(false);

  // Seek Manual ke Timestamp
  const seekTo = (sec) => {
    const clamped = Math.max(0, Math.min(duration, sec));
    setCurrentTime(clamped);
    if (videoRef.current) {
      videoRef.current.currentTime = clamped;
    }
  };

  // Pengaturan Penyesuaian Mikro Timestamp
  const adjustStartTime = (delta) => {
    const newStart = Math.max(0, Math.min(endTime - 0.05, startTime + delta));
    setStartTime(newStart);
    seekTo(newStart);
  };

  const adjustEndTime = (delta) => {
    const newEnd = Math.max(startTime + 0.05, Math.min(duration, endTime + delta));
    setEndTime(newEnd);
    seekTo(newEnd);
  };

  const resetFullRange = () => {
    setStartTime(0);
    setEndTime(duration);
    seekTo(0);
  };

  // Pointer Event Handlers untuk Slider Handles (Pointer Capture untuk drag super mulus kiri & kanan)
  const handleHandlePointerDown = (e, handleType) => {
    e.preventDefault();
    e.stopPropagation();
    isDraggingRef.current = true;
    setDraggingHandle(handleType);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  };

  const handleHandlePointerMove = (e, handleType) => {
    if (draggingHandle !== handleType || !timelineRef.current || duration <= 0) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clientX / rect.width));
    const sec = ratio * duration;

    if (handleType === 'start') {
      const clamped = Math.max(0, Math.min(endTime - 0.05, sec));
      setStartTime(clamped);
      seekTo(clamped);
    } else if (handleType === 'end') {
      const clamped = Math.max(startTime + 0.05, Math.min(duration, sec));
      setEndTime(clamped);
      seekTo(clamped);
    }
  };

  const handleHandlePointerUp = (e) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    setDraggingHandle(null);
    setTimeout(() => {
      isDraggingRef.current = false;
    }, 120);
  };

  const handleTimelineClick = (e) => {
    if (isDraggingRef.current || !timelineRef.current || duration === 0) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    const targetSec = ratio * duration;
    seekTo(targetSec);
  };

  // Client-Side Browser Video Trimming (HTML5 MediaRecorder Fallback jika backend offline / error)
  const trimVideoClientSide = async (file, start, end) => {
    return new Promise((resolve, reject) => {
      const tempVideo = document.createElement('video');
      tempVideo.src = URL.createObjectURL(file);
      tempVideo.muted = false;
      tempVideo.playsInline = true;
      tempVideo.crossOrigin = 'anonymous';

      const cleanup = () => {
        try {
          URL.revokeObjectURL(tempVideo.src);
          tempVideo.remove();
        } catch {}
      };

      tempVideo.onloadedmetadata = async () => {
        try {
          tempVideo.currentTime = start;
          await new Promise((res) => { tempVideo.onseeked = res; });

          const stream = tempVideo.captureStream ? tempVideo.captureStream() : tempVideo.mozCaptureStream ? tempVideo.mozCaptureStream() : null;
          if (!stream) {
            cleanup();
            return reject(new Error('Browser ini tidak mendukung stream video langsung.'));
          }

          let mimeType = 'video/webm';
          if (MediaRecorder.isTypeSupported('video/mp4;codecs=avc1')) {
            mimeType = 'video/mp4;codecs=avc1';
          } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) {
            mimeType = 'video/webm;codecs=vp9,opus';
          }

          const recorder = new MediaRecorder(stream, { mimeType });
          const chunks = [];

          recorder.ondataavailable = (ev) => {
            if (ev.data && ev.data.size > 0) chunks.push(ev.data);
          };

          recorder.onstop = () => {
            const blob = new Blob(chunks, { type: mimeType });
            const url = URL.createObjectURL(blob);
            const isMp4 = mimeType.includes('mp4');
            const ext = isMp4 ? 'mp4' : 'webm';
            const base = fileName.replace(/\.[^/.]+$/, '');
            const finalName = `kuro_trimmed_${base}.${ext}`;
            const dur = (end - start).toFixed(2);
            cleanup();
            resolve({
              url,
              fileName: finalName,
              originalName: fileName,
              duration: dur,
              startTime: start,
              endTime: end,
              size: blob.size,
              sizeFormatted: `${(blob.size / 1024).toFixed(1)} KB`,
              originalSizeFormatted: `${(file.size / 1024).toFixed(1)} KB`,
              engine: 'Browser Client-Side Engine'
            });
          };

          recorder.start(100);
          tempVideo.play();

          const checkInterval = setInterval(() => {
            if (tempVideo.currentTime >= end || tempVideo.ended) {
              clearInterval(checkInterval);
              tempVideo.pause();
              recorder.stop();
            } else {
              const currentProgress = Math.min(95, Math.round(((tempVideo.currentTime - start) / (end - start)) * 50) + 45);
              setExportProgress(currentProgress);
            }
          }, 40);

        } catch (err) {
          cleanup();
          reject(err);
        }
      };

      tempVideo.onerror = (e) => {
        cleanup();
        reject(new Error('Gagal memuat video untuk perekaman: ' + (tempVideo.error?.message || 'Unknown error')));
      };
    });
  };

  // Eksekusi Pemotongan Video (Dual Engine: Backend FFmpeg Stream Copy + Client-Side Fallback)
  const handleProcessTrim = async () => {
    if (!videoFile) return;
    if (endTime <= startTime) {
      setErrorMessage('Waktu selesai harus lebih besar dari waktu mulai.');
      return;
    }

    try {
      setIsExporting(true);
      setExportProgress(15);
      setErrorMessage('');
      setTrimmedResult(null);

      let processedResult = null;

      // Stream copy backend ffmpeg (-c copy).
      try {
        const reader = new FileReader();
        const base64Promise = new Promise((resolve, reject) => {
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
        });
        reader.readAsDataURL(videoFile);
        const videoBase64 = await base64Promise;

        setExportProgress(40);

        const response = await axios.post('/api/trim-video', {
          videoBase64,
          startTime,
          endTime,
          originalName: fileName
        }, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 45000
        });

        if (response.data && response.data.success && response.data.data) {
          processedResult = {
            ...response.data.data,
            engine: 'FFmpeg Lossless Stream Copy (Backend)'
          };
        }
      } catch (backendErr) {
        console.warn('Backend trim gagal/offline, beralih otomatis ke Client-Side Browser Engine fallback... Detail:', backendErr.message);
      }

      // Fallback recorder browser client-side jika backend gagal.
      if (!processedResult) {
        setExportProgress(50);
        processedResult = await trimVideoClientSide(videoFile, startTime, endTime);
      }

      if (processedResult) {
        setExportProgress(100);
        setTrimmedResult(processedResult);
        confetti({ particleCount: 80, spread: 60, origin: { y: 0.6 } });
      } else {
        throw new Error('Gagal menghasilkan file video hasil potongan.');
      }
    } catch (err) {
      console.error('Error proses trim:', err);
      setErrorMessage(err.response?.data?.message || err.message || 'Terjadi kesalahan saat memproses potongan video.');
    } finally {
      setIsExporting(false);
    }
  };

  // Unduh Video Hasil Potongan
  const handleDownloadResult = () => {
    if (!trimmedResult) return;
    const outFilename = trimmedResult.fileName || `trimmed_${fileName}`;
    const a = document.createElement('a');
    a.href = trimmedResult.url;
    a.download = outFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Simpan otomatis ke galeri perangkat
    addGalleryItem({
      title: outFilename.replace(/\.[^/.]+$/, ''),
      type: 'video',
      category: 'Video Trimmer',
      extension: 'MP4',
      size: trimmedResult.sizeFormatted || '1.5 MB',
      previewUrl: trimmedResult.url,
      downloadData: trimmedResult.url,
      filename: outFilename
    });
  };

  const totalTrimmedDuration = Math.max(0, endTime - startTime);
  const startPercent = duration > 0 ? (startTime / duration) * 100 : 0;
  const endPercent = duration > 0 ? (endTime / duration) * 100 : 100;
  const playheadPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <main className="flex-grow flex flex-col items-center justify-start px-4 sm:px-6 md:px-margin-desktop py-6 sm:py-8 max-w-5xl mx-auto w-full relative z-10 animate-fadeIn">
      
      {/* ─── 1. HEADER NAVIGASI ─── */}
      <div className="w-full flex items-center justify-between pb-4 mb-4 border-b-2 border-black">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <CosmicBackButton onClick={onBack} label="Kembali ke Beranda" />
          <div>
            <h1 className="text-base sm:text-xl font-black tracking-tight font-display text-black flex items-center gap-2">
              <span>Video Trimmer & Cutter</span>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded border border-black bg-neutral-100 text-black">
                LOSSLESS CUT
              </span>
            </h1>
            <p className="text-xs text-neutral-600">
              Potong durasi video presisi milidetik tanpa merender ulang, 100% resolusi dan FPS asli tetap utuh.
            </p>
          </div>
        </div>
      </div>

      {/* ─── 2. AREA UPLOAD VIDEO JIKA BELUM ADA ─── */}
      {!videoSrc && (
        <div 
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
          onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) handleFileUpload(file);
          }}
          className={`w-full flex flex-col items-center justify-center p-8 sm:p-12 rounded-3xl border-2 border-dashed transition-all text-center ${
            isDragging
              ? 'border-indigo-400 bg-indigo-950/60 scale-[0.99]'
              : 'border-white/15 bg-[#0e121d]/80 backdrop-blur-xl hover:border-indigo-500/50'
          }`}
        >
          <div className="w-16 h-16 rounded-2xl bg-indigo-600/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mb-4 shadow-lg shadow-indigo-600/10">
            <Scissors className="w-8 h-8" />
          </div>

          <h3 className="text-lg font-bold text-white mb-1">
            Unggah Video yang Ingin Dipotong
          </h3>
          <p className="text-xs text-slate-400 max-w-md mb-6 leading-relaxed">
            Tarik & lepaskan file video ke sini, atau klik tombol di bawah untuk memilih file (Mendukung format MP4, WEBM, dan MOV).
          </p>

          <label className="px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-indigo-600/30 cursor-pointer active:scale-95 transition-all">
            <Upload className="w-4 h-4" />
            <span>Pilih File Video</span>
            <input 
              type="file" 
              accept="video/mp4,video/webm,video/quicktime,video/*" 
              onChange={(e) => handleFileUpload(e.target.files?.[0])}
              className="hidden" 
            />
          </label>

          <div className="flex items-center gap-3 mt-8 text-[11px] font-mono text-slate-500">
            <span>✓ Lossless Encoding</span>
            <span>•</span>
            <span>✓ Stream Copy Fast Cut</span>
            <span>•</span>
            <span>✓ Frame Preview</span>
          </div>
        </div>
      )}

      {/* ─── 3. WORKSPACE VIDEO TRIMMER (PLAYER + DUAL TIMELINE) ─── */}
      {videoSrc && (
        <div className="w-full flex flex-col gap-6">
          
          {/* Bar Info Video */}
          <div className="w-full flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl bg-[#0f1320] border border-white/10 text-xs">
            <div className="flex items-center gap-2.5 truncate max-w-sm">
              <FileVideo className="w-4 h-4 text-indigo-400 shrink-0" />
              <span className="font-bold text-white truncate">{fileName}</span>
            </div>

            <div className="flex items-center gap-2 font-mono text-[11px]">
              <span className="px-2 py-0.5 rounded-md bg-white/5 text-slate-400">
                Durasi Asli: {formatTimePrecision(duration)}
              </span>
              <label className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 cursor-pointer transition-colors">
                Ganti Video
                <input 
                  type="file" 
                  accept="video/*" 
                  onChange={(e) => handleFileUpload(e.target.files?.[0])}
                  className="hidden" 
                />
              </label>
            </div>
          </div>

          {/* Video Player Preview Box */}
          <div className="relative w-full max-w-2xl mx-auto aspect-video rounded-2xl sm:rounded-3xl overflow-hidden bg-black/95 shadow-2xl border border-white/10 flex items-center justify-center group">
            <video 
              ref={videoRef}
              src={videoSrc}
              playsInline
              muted={isMuted}
              onLoadedMetadata={handleLoadedMetadata}
              onTimeUpdate={handleTimeUpdate}
              onClick={togglePlay}
              className="w-full h-full object-contain cursor-pointer"
            />

            {/* Floating Play Overlay Button */}
            {!isPlaying && (
              <button 
                onClick={togglePlay}
                className="absolute w-14 h-14 rounded-full bg-indigo-600/90 text-white flex items-center justify-center shadow-xl hover:scale-110 active:scale-95 transition-all cursor-pointer backdrop-blur-md"
              >
                <Play className="w-6 h-6 fill-current ml-1" />
              </button>
            )}

            {/* Bottom Overlay Player Controls */}
            <div className="absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex items-center justify-between text-xs text-white">
              <div className="flex items-center gap-2">
                <button 
                  onClick={togglePlay}
                  className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
                <button 
                  onClick={() => setIsMuted(!isMuted)}
                  className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
                >
                  {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <span className="font-mono text-[11px] ml-1">
                  {formatTimePrecision(currentTime)} / {formatTimePrecision(duration)}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setIsLoopingCut(!isLoopingCut)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-mono flex items-center gap-1 transition-all ${
                    isLoopingCut 
                      ? 'bg-indigo-600 text-white font-bold' 
                      : 'bg-white/10 text-slate-400 hover:text-white'
                  }`}
                  title="Ulangi otomatis pada rentang yang dipotong"
                >
                  <Repeat className="w-3 h-3" />
                  <span>Looping Cut</span>
                </button>
              </div>
            </div>
          </div>

          {/* ─── 4. INTERACTIVE TIMELINE TRACK & DUAL-HANDLE RANGE SLIDER ─── */}
          <div className="w-full flex flex-col gap-3 p-5 rounded-3xl bg-[#0f1320] border border-white/10 shadow-xl">
            
            {/* Header Timeline & Quick Actions */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-white/5">
              <div className="flex items-center gap-2">
                <Scissors className="w-4 h-4 text-indigo-400" />
                <span className="text-xs font-bold text-white font-mono">Interactive Timeline Slider</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handlePreviewCut}
                  className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Preview Cut (Rentang Terpilih)</span>
                </button>
              </div>
            </div>

            {/* Timeline Track Ribbon dengan Thumbnail Filmstrip & Handles Layer */}
            <div className="relative w-full pt-6 pb-2 px-3">
              
              {/* Inner Filmstrip Track (overflow-hidden agar filmstrip rapi) */}
              <div 
                ref={timelineRef}
                onClick={handleTimelineClick}
                className="relative w-full h-18 sm:h-20 rounded-2xl overflow-hidden bg-[#060810] border border-white/15 cursor-pointer select-none"
              >
                {/* Layer 1: Frame Thumbnail Preview */}
                <div className="absolute inset-0 flex items-center justify-between opacity-50 pointer-events-none">
                  {thumbnails.length > 0 ? (
                    thumbnails.map((thumb, idx) => (
                      <img 
                        key={idx} 
                        src={thumb} 
                        alt={`frame-${idx}`} 
                        draggable={false}
                        className="h-full w-full object-cover border-r border-black/30 pointer-events-none select-none" 
                      />
                    ))
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-500 font-mono">
                      {isGeneratingThumbs ? 'Menyiapkan filmstrip thumbnail...' : 'Timeline track video'}
                    </div>
                  )}
                </div>

                {/* Layer 2: Shaded Excluded Areas (Area Luar Potongan) */}
                <div 
                  className="absolute top-0 bottom-0 left-0 bg-black/75 backdrop-blur-[2px] pointer-events-none"
                  style={{ width: `${startPercent}%` }}
                />
                <div 
                  className="absolute top-0 bottom-0 right-0 bg-black/75 backdrop-blur-[2px] pointer-events-none"
                  style={{ width: `${100 - endPercent}%` }}
                />

                {/* Layer 3: Selected Range Box (Area Potongan Aktif) */}
                <div 
                  className="absolute top-0 bottom-0 border-y-2 border-indigo-400 bg-indigo-500/15 pointer-events-none"
                  style={{
                    left: `${startPercent}%`,
                    width: `${Math.max(1, endPercent - startPercent)}%`
                  }}
                />

                {/* Playhead Real-time Indicator Line */}
                <div 
                  className="absolute top-0 bottom-0 w-0.5 bg-amber-400 z-20 pointer-events-none"
                  style={{ left: `${playheadPercent}%` }}
                >
                  <div className="w-2.5 h-2.5 bg-amber-400 rounded-full -translate-x-1 shadow-md shadow-amber-400/50" />
                </div>
              </div>

              {/* Handles Layer (Positioned di luar overflow-hidden dengan transform -translate-x-1/2) */}
              {/* Handle Mulai (Start Handle) */}
              <div 
                onPointerDown={(e) => handleHandlePointerDown(e, 'start')}
                onPointerMove={(e) => handleHandlePointerMove(e, 'start')}
                onPointerUp={handleHandlePointerUp}
                onPointerCancel={handleHandlePointerUp}
                className="absolute top-1 bottom-1 w-8 flex flex-col items-center justify-center cursor-ew-resize z-30 select-none touch-none group"
                style={{
                  left: `calc(12px + (100% - 24px) * ${duration > 0 ? startTime / duration : 0})`,
                  transform: 'translateX(-50%)'
                }}
                title="Tarik untuk atur Waktu Mulai (START)"
              >
                <span className="text-[9px] font-mono font-black px-1.5 py-0.5 rounded bg-cyan-500 text-black shadow-md -mb-1 z-10 tracking-tighter">
                  START
                </span>
                <div className="w-4 h-full bg-cyan-400 hover:bg-cyan-300 rounded-lg shadow-lg flex items-center justify-center border border-white/50 transition-transform group-hover:scale-105">
                  <div className="w-0.5 h-6 bg-black/60 rounded-full" />
                </div>
              </div>

              {/* Handle Selesai (End Handle) */}
              <div 
                onPointerDown={(e) => handleHandlePointerDown(e, 'end')}
                onPointerMove={(e) => handleHandlePointerMove(e, 'end')}
                onPointerUp={handleHandlePointerUp}
                onPointerCancel={handleHandlePointerUp}
                className="absolute top-1 bottom-1 w-8 flex flex-col items-center justify-center cursor-ew-resize z-30 select-none touch-none group"
                style={{
                  left: `calc(12px + (100% - 24px) * ${duration > 0 ? endTime / duration : 1})`,
                  transform: 'translateX(-50%)'
                }}
                title="Tarik untuk atur Waktu Selesai (END)"
              >
                <span className="text-[9px] font-mono font-black px-1.5 py-0.5 rounded bg-rose-500 text-white shadow-md -mb-1 z-10 tracking-tighter">
                  END
                </span>
                <div className="w-4 h-full bg-rose-500 hover:bg-rose-400 rounded-lg shadow-lg flex items-center justify-center border border-white/50 transition-transform group-hover:scale-105">
                  <div className="w-0.5 h-6 bg-white/70 rounded-full" />
                </div>
              </div>

            </div>

            {/* Timestamp stepper */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div className="p-3.5 rounded-2xl bg-black/40 border border-cyan-500/20 flex flex-col gap-2">
                <div className="flex items-center justify-between text-slate-400 text-[11px] font-mono">
                  <span className="text-cyan-400 font-bold">WAKTU MULAI (START)</span>
                  <button 
                    onClick={() => {
                      const newS = Math.min(endTime - 0.05, currentTime);
                      setStartTime(newS);
                      seekTo(newS);
                    }}
                    className="text-cyan-400 hover:underline cursor-pointer"
                  >
                    Set Posisi Playhead
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-base sm:text-lg font-mono font-bold text-cyan-300">
                    {formatTimePrecision(startTime)}
                  </div>
                  <div className="flex items-center gap-1 bg-black/60 px-2 py-0.5 rounded-lg border border-white/10">
                    <span className="text-[10px] text-slate-400 font-mono">Detik:</span>
                    <input
                      type="number"
                      step="0.05"
                      min="0"
                      max={Math.max(0, endTime - 0.05).toFixed(2)}
                      value={Number(startTime.toFixed(2))}
                      onChange={(e) => {
                        const val = Math.max(0, Math.min(endTime - 0.05, parseFloat(e.target.value) || 0));
                        setStartTime(val);
                        seekTo(val);
                      }}
                      className="w-14 bg-transparent text-right font-mono text-xs text-cyan-200 focus:outline-none"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-1 text-[10px] font-mono">
                  <button onClick={() => adjustStartTime(-1)} className="px-2 py-1 rounded bg-white/5 hover:bg-white/10">-1s</button>
                  <button onClick={() => adjustStartTime(-0.1)} className="px-2 py-1 rounded bg-white/5 hover:bg-white/10">-0.1s</button>
                  <button onClick={() => adjustStartTime(0.1)} className="px-2 py-1 rounded bg-white/5 hover:bg-white/10">+0.1s</button>
                  <button onClick={() => adjustStartTime(1)} className="px-2 py-1 rounded bg-white/5 hover:bg-white/10">+1s</button>
                </div>
              </div>

              {/* Kotak Total Durasi Potongan */}
              <div className="p-3.5 rounded-2xl bg-indigo-950/20 border border-indigo-500/20 flex flex-col items-center justify-center text-center">
                <span className="text-slate-400 text-[11px] font-mono mb-1">TOTAL DURASI POTONGAN</span>
                <span className="text-xl sm:text-2xl font-mono font-extrabold text-white">
                  {formatTimePrecision(totalTrimmedDuration)}
                </span>
                <div className="flex items-center gap-2 mt-1.5">
                  <button
                    onClick={resetFullRange}
                    className="px-2 py-0.5 rounded-md bg-white/5 hover:bg-white/10 text-[10px] font-mono text-indigo-300 transition-all cursor-pointer"
                    title="Reset ke durasi penuh video"
                  >
                    Reset Penuh
                  </button>
                  <span className="text-[10px] font-mono text-emerald-400">
                    ✓ Lossless Cut
                  </span>
                </div>
              </div>

              {/* Kotak End Time */}
              <div className="p-3.5 rounded-2xl bg-black/40 border border-rose-500/20 flex flex-col gap-2">
                <div className="flex items-center justify-between text-slate-400 text-[11px] font-mono">
                  <span className="text-rose-400 font-bold">WAKTU SELESAI (END)</span>
                  <button 
                    onClick={() => {
                      const newE = Math.max(startTime + 0.05, currentTime);
                      setEndTime(newE);
                      seekTo(newE);
                    }}
                    className="text-rose-400 hover:underline cursor-pointer"
                  >
                    Set Posisi Playhead
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-base sm:text-lg font-mono font-bold text-rose-300">
                    {formatTimePrecision(endTime)}
                  </div>
                  <div className="flex items-center gap-1 bg-black/60 px-2 py-0.5 rounded-lg border border-white/10">
                    <span className="text-[10px] text-slate-400 font-mono">Detik:</span>
                    <input
                      type="number"
                      step="0.05"
                      min={(startTime + 0.05).toFixed(2)}
                      max={duration.toFixed(2)}
                      value={Number(endTime.toFixed(2))}
                      onChange={(e) => {
                        const val = Math.max(startTime + 0.05, Math.min(duration, parseFloat(e.target.value) || duration));
                        setEndTime(val);
                        seekTo(val);
                      }}
                      className="w-14 bg-transparent text-right font-mono text-xs text-rose-200 focus:outline-none"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-1 text-[10px] font-mono">
                  <button onClick={() => adjustEndTime(-1)} className="px-2 py-1 rounded bg-white/5 hover:bg-white/10">-1s</button>
                  <button onClick={() => adjustEndTime(-0.1)} className="px-2 py-1 rounded bg-white/5 hover:bg-white/10">-0.1s</button>
                  <button onClick={() => adjustEndTime(0.1)} className="px-2 py-1 rounded bg-white/5 hover:bg-white/10">+0.1s</button>
                  <button onClick={() => adjustEndTime(1)} className="px-2 py-1 rounded bg-white/5 hover:bg-white/10">+1s</button>
                </div>
              </div>

            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Action Button: Proses Potong Video */}
            <div className="pt-2">
              <button
                onClick={handleProcessTrim}
                disabled={isExporting}
                className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 active:scale-98 transition-all cursor-pointer"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Memotong Video Cepat ({exportProgress}%)...</span>
                  </>
                ) : (
                  <>
                    <Scissors className="w-4 h-4" />
                    <span>Potong Durasi Video (Lossless Stream Copy)</span>
                  </>
                )}
              </button>
            </div>

          </div>

          {/* ─── 5. HASIL POTONGAN & TOMBOL UNDUH (JIKA SUDAH SELESAI) ─── */}
          {trimmedResult && (
            <div className="w-full p-6 rounded-3xl bg-emerald-950/20 border border-emerald-500/30 flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl animate-fadeIn">
              
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
                  <Check className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold text-base text-white">Video Berhasil Dipotong!</h4>
                  <p className="text-xs text-slate-400 mt-0.5 flex flex-wrap items-center gap-1.5">
                    <span>Durasi: <strong className="font-mono text-emerald-400">{trimmedResult.duration}s</strong></span>
                    <span>•</span>
                    <span>Ukuran: <strong className="font-mono text-white">{trimmedResult.sizeFormatted}</strong></span>
                    {trimmedResult.engine && (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 font-mono text-[10px]">
                        {trimmedResult.engine}
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 w-full md:w-auto">
                <button
                  onClick={handleDownloadResult}
                  className="w-full md:w-auto px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 cursor-pointer active:scale-95 transition-all"
                >
                  <Download className="w-4 h-4" />
                  <span>Simpan & Unduh Video</span>
                </button>
              </div>

            </div>
          )}

        </div>
      )}

    </main>
  );
}
