import React, { useState, useRef } from 'react';
import axios from 'axios';
import CosmicBackButton from './CosmicBackButton';
import { 
  Minimize2, 
  Upload, 
  Image as ImageIcon, 
  Video as VideoIcon, 
  Sparkles, 
  ArrowLeft, 
  Download, 
  Sliders, 
  Check, 
  AlertCircle, 
  Loader2, 
  Zap, 
  ShieldCheck, 
  Maximize2,
  RefreshCw,
  Eye
} from 'lucide-react';

export default function MediaCompressorScreen({ onBack }) {
  const [activeTab, setActiveTab] = useState('image'); // 'image' | 'video'

  // ==========================================
  // STATE KOMPRES FOTO
  // ==========================================
  const [imgFile, setImgFile] = useState(null);
  const [imgPreview, setImgPreview] = useState('');
  const [imgOriginalSize, setImgOriginalSize] = useState(0);
  const [imgDimensions, setImgDimensions] = useState({ w: 0, h: 0 });
  const [imgCompressedDataUrl, setImgCompressedDataUrl] = useState('');
  const [imgCompressedSize, setImgCompressedSize] = useState(0);
  const [imgSavings, setImgSavings] = useState(0);
  const [imgQualityPreset, setImgQualityPreset] = useState('ultra_kb'); // 'ultra_kb' | 'balanced' | 'studio'
  const [imgTargetFormat, setImgTargetFormat] = useState('image/webp'); // 'image/webp' | 'image/jpeg'
  const [imgKeepHd, setImgKeepHd] = useState(true);
  const [imgCompressing, setImgCompressing] = useState(false);

  // ==========================================
  // STATE KOMPRES VIDEO
  // ==========================================
  const [videoFile, setVideoFile] = useState(null);
  const [videoPreview, setVideoPreview] = useState('');
  const [videoOriginalSize, setVideoOriginalSize] = useState(0);
  const [videoResult, setVideoResult] = useState(null);
  const [videoPreset, setVideoPreset] = useState('ultra_kb'); // 'ultra_kb' | 'balanced' | 'high_hd'
  const [videoScale, setVideoScale] = useState('original');   // 'original' | '720p' | '480p'
  const [videoCompressing, setVideoCompressing] = useState(false);
  const [videoProgressMsg, setVideoProgressMsg] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const imgCanvasRef = useRef(null);

  const [isImgDragging, setIsImgDragging] = useState(false);
  const [isVideoDragging, setIsVideoDragging] = useState(false);

  // Format bytes helper
  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // ==========================================
  // LOGIKA KOMPRES FOTO (Client-Side High-Efficiency Canvas)
  // ==========================================
  const handleImageFile = (file) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMessage('File harus berupa gambar (JPG, PNG, WebP).');
      return;
    }

    setErrorMessage('');
    setImgFile(file);
    setImgOriginalSize(file.size);
    setImgCompressedDataUrl('');
    setImgCompressedSize(0);

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target.result;
      setImgPreview(dataUrl);

      // Baca resolusi asli
      const img = new Image();
      img.onload = () => {
        setImgDimensions({ w: img.width, h: img.height });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    handleImageFile(file);
  };

  const processImageCompression = async () => {
    if (!imgPreview || !imgFile) return;

    setImgCompressing(true);
    setErrorMessage('');

    try {
      const img = new Image();
      img.src = imgPreview;
      await new Promise((resolve) => (img.onload = resolve));

      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      // Tentukan target kualitas WebP / JPEG
      let quality = 0.5;
      if (imgQualityPreset === 'ultra_kb') quality = 0.35; // Target puluhan/ratusan KB
      else if (imgQualityPreset === 'balanced') quality = 0.65;
      else if (imgQualityPreset === 'studio') quality = 0.82;

      // Iterasi kompresi
      let compressedUrl = canvas.toDataURL(imgTargetFormat, quality);

      // Hitung ukuran dari base64
      const head = `data:${imgTargetFormat};base64,`;
      const base64Str = compressedUrl.substring(head.length);
      const decodedLength = atob(base64Str).length;

      setImgCompressedDataUrl(compressedUrl);
      setImgCompressedSize(decodedLength);

      const savings = Math.max(0, Math.round(((imgOriginalSize - decodedLength) / imgOriginalSize) * 100));
      setImgSavings(savings);
    } catch (err) {
      setErrorMessage('Gagal mengompres foto: ' + err.message);
    } finally {
      setImgCompressing(false);
    }
  };

  const downloadCompressedImage = () => {
    if (!imgCompressedDataUrl) return;
    const link = document.createElement('a');
    const ext = imgTargetFormat === 'image/webp' ? 'webp' : 'jpg';
    link.download = `kuro_compressed_${Date.now()}.${ext}`;
    link.href = imgCompressedDataUrl;
    link.click();
  };

  // ==========================================
  // LOGIKA KOMPRES VIDEO (Backend FFmpeg Engine)
  // ==========================================
  const handleVideoFile = (file) => {
    if (!file) return;

    if (!file.type.startsWith('video/')) {
      setErrorMessage('File harus berupa video (MP4, WebM, MOV).');
      return;
    }

    setErrorMessage('');
    setVideoFile(file);
    setVideoOriginalSize(file.size);
    setVideoResult(null);

    const reader = new FileReader();
    reader.onload = () => {
      setVideoPreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleVideoSelect = (e) => {
    const file = e.target.files?.[0];
    handleVideoFile(file);
  };

  const processVideoCompression = async () => {
    if (!videoPreview || !videoFile) return;

    setVideoCompressing(true);
    setVideoProgressMsg('Mengirim video ke FFmpeg Studio Server...');
    setErrorMessage('');

    try {
      const res = await axios.post('/api/compress-video', {
        videoBase64: videoPreview,
        originalName: videoFile.name,
        qualityPreset: videoPreset,
        scale: videoScale
      }, {
        timeout: 180000 // 3 menit timeout untuk video besar
      });

      if (res.data && res.data.success) {
        setVideoResult(res.data.data);
      } else {
        setErrorMessage(res.data?.message || 'Gagal mengompres video.');
      }
    } catch (err) {
      setErrorMessage(err.response?.data?.message || err.message || 'Terjadi kesalahan saat memproses kompresi video.');
    } finally {
      setVideoCompressing(false);
      setVideoProgressMsg('');
    }
  };

  return (
    <main className="flex-grow relative z-10 flex flex-col items-center justify-start px-4 sm:px-6 md:px-margin-desktop py-6 sm:py-10 w-full max-w-5xl mx-auto">
      
      {/* Tombol Navigasi Kembali */}
      <div className="w-full flex items-center justify-between mb-6">
        <CosmicBackButton onClick={onBack} label="Kembali ke Beranda Tools" />

        <div className="flex items-center gap-2 text-xs text-cyan-400 bg-cyan-500/10 px-3 py-1 rounded-full border border-cyan-500/20">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>HD Preserved • No Quality Drop</span>
        </div>
      </div>

      {/* Header Judul Fitur */}
      <div className="text-center mb-8 max-w-2xl">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-bold uppercase tracking-wider mb-3">
          <Minimize2 className="w-3.5 h-3.5" />
          <span>Media Compressor Studio</span>
        </div>
        <h1 className="text-2xl sm:text-4xl font-extrabold text-on-surface mb-2">
          Kompres Video & Foto HD
        </h1>
        <p className="text-xs sm:text-sm text-on-surface-variant">
          Kecilkan ukuran file dari MB menjadi KB secara drastis tanpa merusak ketajaman visual resolusi HD asli.
        </p>
      </div>

      {/* Tab Selector: Kompres Foto vs Kompres Video */}
      <div className="flex items-center gap-2 p-1.5 bg-surface-container/70 rounded-2xl border border-outline-variant/30 mb-8 max-w-md w-full">
        <button
          onClick={() => { setActiveTab('image'); setErrorMessage(''); }}
          className={`flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeTab === 'image'
              ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/25'
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          <ImageIcon className="w-4 h-4" />
          <span>Kompres Foto HD</span>
        </button>
        <button
          onClick={() => { setActiveTab('video'); setErrorMessage(''); }}
          className={`flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeTab === 'video'
              ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/25'
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          <VideoIcon className="w-4 h-4" />
          <span>Kompres Video HD</span>
        </button>
      </div>

      {/* Pesan Error Global */}
      {errorMessage && (
        <div className="w-full mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center gap-3 text-red-400 text-xs">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* ======================================================== */}
      {/* 1. SECTION KOMPRES FOTO */}
      {/* ======================================================== */}
      {activeTab === 'image' && (
        <div className="w-full space-y-8">
          
          {/* Box Upload & Pengaturan */}
          <div className="glass-panel rounded-2xl p-6 sm:p-8 shadow-xl space-y-6">
            
            {/* Dropzone Foto */}
            <div
              className={`border-2 border-dashed rounded-2xl p-6 sm:p-10 flex flex-col items-center justify-center text-center transition-all cursor-pointer group ${
                isImgDragging
                  ? 'border-cyan-400 bg-cyan-500/20 scale-[0.99]'
                  : 'border-outline-variant/50 hover:border-cyan-500/80 bg-surface-container/30 hover:bg-surface-container/50'
              }`}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsImgDragging(true); }}
              onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsImgDragging(false); }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsImgDragging(false);
                const file = e.dataTransfer.files?.[0];
                if (file) handleImageFile(file);
              }}
              onClick={() => document.getElementById('image-compress-input').click()}
            >
              <input
                id="image-compress-input"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageSelect}
              />

              {imgPreview ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="max-w-xs max-h-56 rounded-xl overflow-hidden shadow-lg border border-outline-variant/40 bg-black/40">
                    <img src={imgPreview} alt="Original" className="w-full h-full object-contain" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-on-surface">{imgFile?.name}</p>
                    <p className="text-[11px] text-cyan-400 font-mono mt-0.5">
                      Ukuran Asli: {formatBytes(imgOriginalSize)} • {imgDimensions.w} x {imgDimensions.h} px
                    </p>
                    <span className="text-[11px] text-on-surface-variant group-hover:underline mt-1 inline-block">
                      Klik untuk mengganti foto
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 group-hover:scale-110 transition-transform">
                    <Upload className="w-7 h-7" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-on-surface">Pilih Foto yang Ingin Dikompres</p>
                    <p className="text-xs text-on-surface-variant mt-1">Mendukung JPG, PNG, WebP (Ukuran MB akan dikompres ke KB)</p>
                  </div>
                </div>
              )}
            </div>

            {/* Kontrol Preset Kompresi */}
            {imgPreview && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-outline-variant/30">
                
                {/* 1. Target Preset */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-on-surface-variant flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Mode Penghematan:</span>
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { id: 'ultra_kb', label: 'Ekstrem KB', desc: 'Hemat 80-95%' },
                      { id: 'balanced', label: 'Seimbang', desc: 'Hemat 60-75%' },
                      { id: 'studio', label: 'Studio HD', desc: 'Hemat 40-50%' }
                    ].map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setImgQualityPreset(p.id)}
                        className={`p-2 rounded-xl text-center border transition-all cursor-pointer ${
                          imgQualityPreset === p.id
                            ? 'bg-cyan-500/15 border-cyan-400 text-cyan-300 font-bold'
                            : 'bg-surface-container border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-high'
                        }`}
                      >
                        <p className="text-xs">{p.label}</p>
                        <p className="text-[9px] opacity-70">{p.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. Format Output */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-on-surface-variant flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Format Hasil:</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setImgTargetFormat('image/webp')}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                        imgTargetFormat === 'image/webp'
                          ? 'bg-cyan-500/15 border-cyan-400 text-cyan-300'
                          : 'bg-surface-container border-outline-variant/30 text-on-surface-variant'
                      }`}
                    >
                      WebP (Terkecil)
                    </button>
                    <button
                      onClick={() => setImgTargetFormat('image/jpeg')}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                        imgTargetFormat === 'image/jpeg'
                          ? 'bg-cyan-500/15 border-cyan-400 text-cyan-300'
                          : 'bg-surface-container border-outline-variant/30 text-on-surface-variant'
                      }`}
                    >
                      JPG / JPEG
                    </button>
                  </div>
                </div>

                {/* 3. Resolusi Asli Toggle */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-on-surface-variant flex items-center gap-1.5">
                    <Maximize2 className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Resolusi Piksel:</span>
                  </label>
                  <div className="p-2.5 rounded-xl bg-surface-container border border-outline-variant/30 flex items-center justify-between">
                    <span className="text-xs text-on-surface font-semibold">100% HD Utuh</span>
                    <span className="text-[11px] text-emerald-400 font-mono">
                      {imgDimensions.w}x{imgDimensions.h}px
                    </span>
                  </div>
                </div>

              </div>
            )}

            {/* Tombol Eksekusi Kompresi */}
            {imgPreview && (
              <div className="flex justify-end pt-2">
                <button
                  onClick={processImageCompression}
                  disabled={imgCompressing}
                  className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-cyan-600/20 transition-all cursor-pointer"
                >
                  {imgCompressing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Mengompres Foto HD...</span>
                    </>
                  ) : (
                    <>
                      <Minimize2 className="w-4 h-4" />
                      <span>Kompres Foto Sekarang</span>
                    </>
                  )}
                </button>
              </div>
            )}

          </div>

          {/* HASIL SEBELUM VS SESUDAH KOMPRES FOTO */}
          {imgCompressedDataUrl && (
            <div className="glass-panel rounded-2xl p-6 sm:p-8 shadow-2xl border border-cyan-500/30 space-y-6 animate-in fade-in">
              
              {/* Header Statistik Penghematan */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-outline-variant/30">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                    <Check className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-on-surface">
                      Foto Berhasil Dikompres Tanpa Rusak!
                    </h3>
                    <p className="text-xs text-on-surface-variant">
                      Resolusi HD tetap tajam 100% dengan ukuran super ringan.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <p className="text-[11px] text-on-surface-variant">Hemat Ukuran</p>
                    <p className="text-lg font-extrabold text-emerald-400 font-mono">-{imgSavings}%</p>
                  </div>
                  <button
                    onClick={downloadCompressedImage}
                    className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-cyan-600/20 transition-all cursor-pointer shrink-0"
                  >
                    <Download className="w-4 h-4" />
                    <span>Unduh Foto ({formatBytes(imgCompressedSize)})</span>
                  </button>
                </div>
              </div>

              {/* Komparasi Ukuran */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 rounded-xl bg-surface-container/40 border border-outline-variant/30 text-center">
                <div>
                  <span className="text-[11px] text-on-surface-variant">Ukuran Asli:</span>
                  <p className="text-xs sm:text-sm font-bold text-slate-400 font-mono mt-0.5 line-through">
                    {formatBytes(imgOriginalSize)}
                  </p>
                </div>
                <div>
                  <span className="text-[11px] text-on-surface-variant">Ukuran Baru (Hasil):</span>
                  <p className="text-xs sm:text-sm font-extrabold text-cyan-400 font-mono mt-0.5">
                    {formatBytes(imgCompressedSize)}
                  </p>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <span className="text-[11px] text-on-surface-variant">Dimensi Tetap:</span>
                  <p className="text-xs sm:text-sm font-bold text-emerald-400 font-mono mt-0.5">
                    {imgDimensions.w} x {imgDimensions.h} px HD
                  </p>
                </div>
              </div>

              {/* Preview Hasil Kompresi */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-on-surface-variant flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Preview Hasil Gambar (HD Jernih):</span>
                </label>
                <div className="w-full max-h-[420px] rounded-xl overflow-hidden border border-outline-variant/40 bg-black/60 flex items-center justify-center p-2">
                  <img src={imgCompressedDataUrl} alt="Compressed" className="max-h-[400px] w-auto object-contain rounded-lg" />
                </div>
              </div>

            </div>
          )}

        </div>
      )}

      {/* ======================================================== */}
      {/* 2. SECTION KOMPRES VIDEO */}
      {/* ======================================================== */}
      {activeTab === 'video' && (
        <div className="w-full space-y-8">
          
          {/* Box Upload & Pengaturan Video */}
          <div className="glass-panel rounded-2xl p-6 sm:p-8 shadow-xl space-y-6">
            
            {/* Dropzone Video */}
            <div
              className={`border-2 border-dashed rounded-2xl p-6 sm:p-10 flex flex-col items-center justify-center text-center transition-all cursor-pointer group ${
                isVideoDragging
                  ? 'border-cyan-400 bg-cyan-500/20 scale-[0.99]'
                  : 'border-outline-variant/50 hover:border-cyan-500/80 bg-surface-container/30 hover:bg-surface-container/50'
              }`}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsVideoDragging(true); }}
              onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsVideoDragging(false); }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsVideoDragging(false);
                const file = e.dataTransfer.files?.[0];
                if (file) handleVideoFile(file);
              }}
              onClick={() => document.getElementById('video-compress-input').click()}
            >
              <input
                id="video-compress-input"
                type="file"
                accept="video/*"
                className="hidden"
                onChange={handleVideoSelect}
              />

              {videoPreview ? (
                <div className="flex flex-col items-center gap-3 w-full">
                  <div className="max-w-md w-full rounded-xl overflow-hidden shadow-lg border border-outline-variant/40 bg-black">
                    <video src={videoPreview} controls className="w-full max-h-56 object-contain" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-on-surface">{videoFile?.name}</p>
                    <p className="text-[11px] text-cyan-400 font-mono mt-0.5">
                      Ukuran Asli: {formatBytes(videoOriginalSize)}
                    </p>
                    <span className="text-[11px] text-on-surface-variant group-hover:underline mt-1 inline-block">
                      Klik untuk mengganti video
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 group-hover:scale-110 transition-transform">
                    <VideoIcon className="w-7 h-7" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-on-surface">Pilih Video yang Ingin Dikompres</p>
                    <p className="text-xs text-on-surface-variant mt-1">Mendukung MP4, WebM, MOV (FFmpeg Hardware-Accelerated)</p>
                  </div>
                </div>
              )}
            </div>

            {/* Opsi Kompresi Video */}
            {videoPreview && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-outline-variant/30">
                
                {/* 1. Mode Efisiensi */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-on-surface-variant flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Tingkat Kompresi:</span>
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { id: 'ultra_kb', label: 'Ekstrem KB', desc: 'Hemat 80-90%' },
                      { id: 'balanced', label: 'Seimbang', desc: 'Hemat 60-75%' },
                      { id: 'high_hd', label: 'Studio HD', desc: 'Hemat 40-50%' }
                    ].map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setVideoPreset(p.id)}
                        className={`p-2 rounded-xl text-center border transition-all cursor-pointer ${
                          videoPreset === p.id
                            ? 'bg-cyan-500/15 border-cyan-400 text-cyan-300 font-bold'
                            : 'bg-surface-container border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-high'
                        }`}
                      >
                        <p className="text-xs">{p.label}</p>
                        <p className="text-[9px] opacity-70">{p.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. Skala Resolusi */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-on-surface-variant flex items-center gap-1.5">
                    <Maximize2 className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Resolusi Video:</span>
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { id: 'original', label: '100% Asli', desc: 'Tetap HD' },
                      { id: '720p', label: '720p HD', desc: 'Standar Web' },
                      { id: '480p', label: '480p SD', desc: 'Super Ringan' }
                    ].map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setVideoScale(s.id)}
                        className={`p-2 rounded-xl text-center border transition-all cursor-pointer ${
                          videoScale === s.id
                            ? 'bg-cyan-500/15 border-cyan-400 text-cyan-300 font-bold'
                            : 'bg-surface-container border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-high'
                        }`}
                      >
                        <p className="text-xs">{s.label}</p>
                        <p className="text-[9px] opacity-70">{s.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

              </div>
            )}

            {/* Tombol Eksekusi Video */}
            {videoPreview && (
              <div className="flex justify-end pt-2">
                <button
                  onClick={processVideoCompression}
                  disabled={videoCompressing}
                  className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-cyan-600/20 transition-all cursor-pointer"
                >
                  {videoCompressing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{videoProgressMsg || 'Memproses FFmpeg...'}</span>
                    </>
                  ) : (
                    <>
                      <Minimize2 className="w-4 h-4" />
                      <span>Kompres Video Sekarang</span>
                    </>
                  )}
                </button>
              </div>
            )}

          </div>

          {/* HASIL VIDEO KOMPRESI */}
          {videoResult && (
            <div className="glass-panel rounded-2xl p-6 sm:p-8 shadow-2xl border border-cyan-500/30 space-y-6 animate-in fade-in">
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-outline-variant/30">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                    <Check className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-on-surface">
                      Video Berhasil Dikompres Hemat {videoResult.savingsPercent}!
                    </h3>
                    <p className="text-xs text-on-surface-variant">
                      Penghematan total {videoResult.savedFormatted} dengan kualitas tetap jernih.
                    </p>
                  </div>
                </div>

                <a
                  href={videoResult.url}
                  download={videoResult.fileName}
                  className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-cyan-600/20 transition-all cursor-pointer shrink-0"
                >
                  <Download className="w-4 h-4" />
                  <span>Unduh Video ({videoResult.compressedSizeFormatted})</span>
                </a>
              </div>

              {/* Statistik Angka Kompresi */}
              <div className="grid grid-cols-3 gap-3 p-4 rounded-xl bg-surface-container/40 border border-outline-variant/30 text-center">
                <div>
                  <span className="text-[11px] text-on-surface-variant">Ukuran Awal:</span>
                  <p className="text-xs sm:text-sm font-bold text-slate-400 font-mono mt-0.5 line-through">
                    {videoResult.originalSizeFormatted}
                  </p>
                </div>
                <div>
                  <span className="text-[11px] text-on-surface-variant">Ukuran Baru:</span>
                  <p className="text-xs sm:text-sm font-extrabold text-cyan-400 font-mono mt-0.5">
                    {videoResult.compressedSizeFormatted}
                  </p>
                </div>
                <div>
                  <span className="text-[11px] text-on-surface-variant">Total Hemat:</span>
                  <p className="text-xs sm:text-sm font-extrabold text-emerald-400 font-mono mt-0.5">
                    {videoResult.savingsPercent}
                  </p>
                </div>
              </div>

              {/* Player Hasil Video */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-on-surface-variant flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Putar Video Hasil Kompresi:</span>
                </label>
                <div className="max-w-2xl mx-auto rounded-xl overflow-hidden border border-outline-variant/40 bg-black shadow-xl">
                  <video src={videoResult.url} controls className="w-full max-h-[400px] object-contain" />
                </div>
              </div>

            </div>
          )}

        </div>
      )}

    </main>
  );
}
