import React, { useState, useRef, useEffect } from 'react';
import CosmicBackButton from './CosmicBackButton';
import { 
  Film, 
  ArrowLeft, 
  Upload, 
  Play, 
  Pause, 
  RotateCcw, 
  Download, 
  Volume2, 
  VolumeX, 
  Zap, 
  Droplet, 
  Sun, 
  Contrast, 
  Sliders, 
  Clock, 
  Sparkles, 
  Check, 
  Loader2,
  Gauge
} from 'lucide-react';

export default function VideoStudioScreen({ onBack, onOpenTrimmer }) {
  const [videoSrc, setVideoSrc] = useState(null);
  const [fileName, setFileName] = useState('video.mp4');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Parameter Filter Video
  const [blur, setBlur] = useState(0);
  const [contrast, setContrast] = useState(115); // HD Boost
  const [brightness, setBrightness] = useState(105);
  const [saturation, setSaturation] = useState(120);
  const [sepia, setSepia] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);

  // Status Ekspor Video
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportedUrl, setExportedUrl] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  const videoRef = useRef(null);
  const exportCanvasRef = useRef(null);

  // Upload video
  const handleVideoFile = (file) => {
    if (!file) return;

    setFileName(file.name);
    const url = URL.createObjectURL(file);
    setVideoSrc(url);
    setIsPlaying(false);
    setExportedUrl(null);
  };

  const handleVideoUpload = (e) => {
    const file = e.target.files?.[0];
    handleVideoFile(file);
  };

  // Toggle Play / Pause
  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  // Update speed
  const changeSpeed = (speed) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
  };

  // Handle time update
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  // Handle seek
  const handleSeek = (e) => {
    const time = Number(e.target.value);
    setCurrentTime(time);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  };

  // Reset filter
  const resetFilters = () => {
    setBlur(0);
    setContrast(100);
    setBrightness(100);
    setSaturation(100);
    setSepia(0);
    changeSpeed(1.0);
  };

  // Format detik ke MM:SS
  const formatTime = (secs) => {
    if (isNaN(secs)) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Ekspor & Render Video dengan Efek menggunakan Canvas & MediaRecorder
  const handleExportVideo = async () => {
    const video = videoRef.current;
    if (!video) return;

    setIsExporting(true);
    setExportProgress(0);
    setExportedUrl(null);

    // Siapkan canvas render
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');

    const stream = canvas.captureStream(30); // 30 FPS HD

    // Tangkap audio jika video memiliki audio track
    let combinedStream = stream;
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioCtx.createMediaElementSource(video);
      const destination = audioCtx.createMediaStreamDestination();
      source.connect(destination);
      source.connect(audioCtx.destination);
      destination.stream.getAudioTracks().forEach(track => stream.addTrack(track));
      combinedStream = stream;
    } catch {
      // Audio capture fallback
    }

    let mimeType = 'video/webm;codecs=vp9';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm';
    }

    const recorder = new MediaRecorder(combinedStream, { mimeType });
    const chunks = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/mp4' });
      const downloadUrl = URL.createObjectURL(blob);
      setExportedUrl(downloadUrl);
      setIsExporting(false);
      setExportProgress(100);
    };

    // Mulai render dari awal video
    video.currentTime = 0;
    video.playbackRate = playbackSpeed;
    video.muted = isMuted;

    recorder.start();
    await video.play();
    setIsPlaying(true);

    const filterString = `blur(${blur}px) contrast(${contrast}%) brightness(${brightness}%) saturate(${saturation}%) sepia(${sepia}%)`;

    const drawFrame = () => {
      if (video.paused || video.ended) {
        if (recorder.state === 'recording') {
          recorder.stop();
        }
        return;
      }

      ctx.filter = filterString;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      if (video.duration) {
        setExportProgress(Math.min(99, Math.round((video.currentTime / video.duration) * 100)));
      }

      requestAnimationFrame(drawFrame);
    };

    requestAnimationFrame(drawFrame);
  };

  const cssFilter = `blur(${blur}px) contrast(${contrast}%) brightness(${brightness}%) saturate(${saturation}%) sepia(${sepia}%)`;

  return (
    <main className="flex-grow w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 text-black">
      
      {/* Tombol Navigasi Kembali & Opsi Trimmer */}
      <div className="w-full flex items-center justify-between mb-5 gap-3">
        <CosmicBackButton onClick={onBack} label="Kembali ke Beranda" />
        {onOpenTrimmer && (
          <button
            onClick={onOpenTrimmer}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white hover:bg-neutral-100 border-2 border-black text-black font-bold text-xs shadow-[2px_2px_0px_#000000] transition-all cursor-pointer min-h-[44px]"
          >
            <span>✂️ Buka Video Trimmer</span>
          </button>
        )}
      </div>

      {/* Header Judul Fitur */}
      <div className="rounded-xl p-5 sm:p-6 border-2 border-black bg-white shadow-[4px_4px_0px_#000000] mb-6">
        <div className="flex items-center gap-3 pb-3 border-b-2 border-black">
          <div className="w-10 h-10 rounded-md border-2 border-black bg-black text-white flex items-center justify-center shrink-0">
            <Film className="w-5 h-5 stroke-[2.2]" />
          </div>
          <div>
            <h1 className="text-base sm:text-xl font-black tracking-tight font-display text-black">
              Video Studio & Filter FX
            </h1>
            <p className="text-xs text-neutral-600">
              Sesuaikan kontras visual, efek blur, saturasi warna, dan kecepatan putar video dengan kontrol presisi.
            </p>
          </div>
        </div>
      </div>

      {/* Upload Box jika belum ada video */}
      {!videoSrc ? (
        <div 
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
          onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) handleVideoFile(file);
          }}
          onClick={() => document.getElementById('video-upload-input').click()}
          className={`w-full p-8 sm:p-12 rounded-xl border-2 border-dashed flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
            isDragging
              ? 'border-black bg-neutral-200 scale-[0.99] shadow-[1px_1px_0px_#000000]'
              : 'border-black bg-white hover:bg-neutral-50 shadow-[3px_3px_0px_#000000]'
          }`}
        >
          <input
            type="file"
            accept="video/*"
            onChange={handleVideoUpload}
            id="video-upload-input"
            className="hidden"
          />
          <div className="w-12 h-12 rounded-lg border-2 border-black bg-neutral-100 flex items-center justify-center text-black mb-3 shadow-[2px_2px_0px_#000000]">
            <Upload className="w-6 h-6 stroke-[2]" />
          </div>
          <h3 className="font-extrabold text-sm sm:text-base text-black font-sans mb-1">
            Pilih Video Untuk Diedit & Ditingkatkan ke HD
          </h3>
          <p className="text-xs text-neutral-600 max-w-sm mb-4">
            Mendukung semua format video (MP4, WebM, MOV). Diproses secara langsung di peramban Anda.
          </p>
          <button
            type="button"
            className="min-h-[44px] px-5 py-2.5 rounded-lg border-2 border-black bg-black text-white font-bold text-xs shadow-[2px_2px_0px_#000000] hover:bg-neutral-800 cursor-pointer"
          >
            Pilih File Video Dari Perangkat
          </button>
        </div>
      ) : (
        /* Workspace Studio Video */
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Kolom Kiri: Pemutar Video & Controls */}
          <div className="lg:col-span-8 flex flex-col gap-4">
            
            <div className="w-full rounded-xl border-2 border-black bg-black p-4 flex flex-col items-center justify-center relative overflow-hidden shadow-[4px_4px_0px_#000000] min-h-[340px] sm:min-h-[440px]">
              
              {/* Video Element */}
              <video
                ref={videoRef}
                src={videoSrc}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
                onEnded={() => setIsPlaying(false)}
                muted={isMuted}
                playsInline
                style={{ filter: cssFilter }}
                className="max-w-full max-h-[440px] rounded-lg transition-all"
              />

              {/* Overlay Play Icon saat pause */}
              {!isPlaying && (
                <button
                  type="button"
                  onClick={togglePlay}
                  className="absolute w-14 h-14 rounded-full border-2 border-black bg-white text-black flex items-center justify-center shadow-[3px_3px_0px_#000000] cursor-pointer transition-transform hover:scale-105"
                >
                  <Play className="w-6 h-6 fill-black ml-1" />
                </button>
              )}

            </div>

            {/* Video Controls Bar */}
            <div className="w-full rounded-xl border-2 border-black bg-white p-4 shadow-[3px_3px_0px_#000000] flex flex-col gap-3">
              
              {/* Timeline Seek Bar */}
              <div className="flex items-center gap-3 w-full">
                <span className="text-[11px] font-mono font-bold text-black w-12 text-right">
                  {formatTime(currentTime)}
                </span>
                <input
                  type="range"
                  min="0"
                  max={duration || 100}
                  step="0.1"
                  value={currentTime}
                  onChange={handleSeek}
                  className="flex-grow accent-black cursor-pointer h-2 rounded bg-neutral-200"
                />
                <span className="text-[11px] font-mono font-bold text-black w-12">
                  {formatTime(duration)}
                </span>
              </div>

              {/* Buttons Row */}
              <div className="flex items-center justify-between flex-wrap gap-2.5">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={togglePlay}
                    className="p-2 rounded-lg border-2 border-black bg-black text-white cursor-pointer shadow-[1.5px_1.5px_0px_#000000]"
                  >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsMuted(!isMuted)}
                    className="p-2 rounded-lg border-2 border-black bg-white hover:bg-neutral-100 text-black cursor-pointer"
                  >
                    {isMuted ? <VolumeX className="w-4 h-4 text-black" /> : <Volume2 className="w-4 h-4" />}
                  </button>

                  <span className="text-xs font-bold text-black ml-1 truncate max-w-[160px]">
                    {fileName}
                  </span>
                </div>

                {/* Speed Controls */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-black flex items-center gap-1 mr-1">
                    <Gauge className="w-3.5 h-3.5" /> Kecepatan:
                  </span>
                  {[0.5, 1.0, 1.5, 2.0].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => changeSpeed(s)}
                      className={`px-2.5 py-1 rounded border-2 border-black text-xs font-bold transition-all cursor-pointer ${
                        playbackSpeed === s
                          ? 'bg-black text-white shadow-[1px_1px_0px_#000000]'
                          : 'bg-white text-black hover:bg-neutral-100'
                      }`}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
              </div>

            </div>

          </div>

          {/* Kolom Kanan: Pengaturan Filter & Ekspor */}
          <div className="lg:col-span-4 rounded-xl border-2 border-black bg-white p-5 shadow-[4px_4px_0px_#000000] space-y-4">
            
            <div className="flex items-center justify-between pb-3 border-b-2 border-black">
              <h3 className="text-sm font-extrabold text-black flex items-center gap-2 font-sans">
                <Sliders className="w-4 h-4" />
                <span>Efek & Filter Video</span>
              </h3>
              <button
                type="button"
                onClick={resetFilters}
                className="text-xs font-bold text-black hover:underline flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            </div>

            {/* 1. HD Contrast */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-bold text-black">
                <span className="flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5" /> Kontras & Definisi
                </span>
                <span className="font-mono">{contrast}%</span>
              </div>
              <input
                type="range"
                min="50"
                max="250"
                value={contrast}
                onChange={(e) => setContrast(Number(e.target.value))}
                className="w-full accent-black cursor-pointer"
              />
            </div>

            {/* 2. Efek Blur Video */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-bold text-black">
                <span className="flex items-center gap-1.5">
                  <Droplet className="w-3.5 h-3.5" /> Efek Blur
                </span>
                <span className="font-mono">{blur}px</span>
              </div>
              <input
                type="range"
                min="0"
                max="20"
                step="0.5"
                value={blur}
                onChange={(e) => setBlur(Number(e.target.value))}
                className="w-full accent-black cursor-pointer"
              />
            </div>

            {/* 3. Kecerahan */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-bold text-black">
                <span className="flex items-center gap-1.5">
                  <Sun className="w-3.5 h-3.5" /> Kecerahan Video
                </span>
                <span className="font-mono">{brightness}%</span>
              </div>
              <input
                type="range"
                min="50"
                max="200"
                value={brightness}
                onChange={(e) => setBrightness(Number(e.target.value))}
                className="w-full accent-black cursor-pointer"
              />
            </div>

            {/* 4. Saturasi Warna */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-bold text-black">
                <span>Saturasi Warna</span>
                <span className="font-mono">{saturation}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="250"
                value={saturation}
                onChange={(e) => setSaturation(Number(e.target.value))}
                className="w-full accent-black cursor-pointer"
              />
            </div>

            {/* 5. Sepia / Film Klasik */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-bold text-black">
                <span>Efek Film Klasik (Sepia)</span>
                <span className="font-mono">{sepia}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={sepia}
                onChange={(e) => setSepia(Number(e.target.value))}
                className="w-full accent-black cursor-pointer"
              />
            </div>

            {/* Ekspor & Render Video Button */}
            <div className="pt-3 border-t-2 border-black space-y-3">
              <button
                type="button"
                onClick={handleExportVideo}
                disabled={isExporting}
                className="w-full min-h-[44px] py-3 rounded-lg border-2 border-black bg-black text-white font-extrabold text-xs sm:text-sm shadow-[3px_3px_0px_#000000] hover:bg-neutral-800 disabled:opacity-50 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Merender Video ({exportProgress}%)...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 stroke-[2.5]" />
                    <span>Render & Unduh Video</span>
                  </>
                )}
              </button>

              {/* Progress bar render */}
              {isExporting && (
                <div className="w-full bg-neutral-100 border border-black rounded-full h-2.5 overflow-hidden">
                  <div 
                    className="bg-black h-full transition-all duration-200"
                    style={{ width: `${exportProgress}%` }}
                  />
                </div>
              )}

              {/* Tombol Unduh Hasil Render */}
              {exportedUrl && (
                <a
                  href={exportedUrl}
                  download={`kuro_enhanced_${fileName.replace(/\.[^/.]+$/, '')}.mp4`}
                  className="w-full min-h-[44px] py-3 rounded-lg border-2 border-black bg-white hover:bg-neutral-100 text-black font-extrabold text-xs sm:text-sm shadow-[2px_2px_0px_#000000] flex items-center justify-center gap-2 cursor-pointer transition-all animate-fadeIn"
                >
                  <Download className="w-4 h-4 stroke-[2.5]" />
                  <span>Simpan Berkas Video</span>
                </a>
              )}
            </div>

          </div>

        </div>
      )}

    </main>
  );
}
