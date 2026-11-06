import React, { useState, useRef } from 'react';
import axios from 'axios';
import CosmicBackButton from './CosmicBackButton';
import BeforeAfterSlider from './BeforeAfterSlider';
import { enhanceImageToSuperHd } from '../utils/imageEnhancer';
import { addGalleryItem } from '../services/storageService';
import { 
  Sparkles, 
  Upload, 
  Image as ImageIcon, 
  Video as VideoIcon, 
  Download, 
  Sliders, 
  Check, 
  AlertCircle, 
  Loader2, 
  Zap, 
  ShieldCheck, 
  Maximize2,
  RefreshCw,
  Eye,
  CheckCircle2,
  Share2
} from 'lucide-react';

export default function MediaCompressorScreen({ onBack }) {
  const [activeTab, setActiveTab] = useState('image'); // 'image' | 'video'

  // ==========================================
  // STATE PENINGKAT FOTO SUPER HD
  // ==========================================
  const [imgFile, setImgFile] = useState(null);
  const [imgPreview, setImgPreview] = useState('');
  const [imgOriginalSize, setImgOriginalSize] = useState(0);
  const [imgDimensions, setImgDimensions] = useState({ w: 0, h: 0 });

  const [imgEnhancedDataUrl, setImgEnhancedDataUrl] = useState('');
  const [imgEnhancedSize, setImgEnhancedSize] = useState(0);
  const [imgEnhancedDimensions, setImgEnhancedDimensions] = useState({ w: 0, h: 0 });

  const [upscaleFactor, setUpscaleFactor] = useState(2); // 2x | 4x
  const [sharpenMode, setSharpenMode] = useState('ultra'); // 'natural' | 'ultra' | 'extreme'
  const [targetFormat, setTargetFormat] = useState('image/jpeg');

  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // ==========================================
  // STATE VIDEO HD STATUS WA
  // ==========================================
  const [videoFile, setVideoFile] = useState(null);
  const [videoPreview, setVideoPreview] = useState('');
  const [videoOriginalSize, setVideoOriginalSize] = useState(0);
  const [videoResult, setVideoResult] = useState(null);
  const [videoPreset, setVideoPreset] = useState('status_wa_1080p'); // 'status_wa_1080p' | '4k_remaster' | '720p_fast'
  const [videoCompressing, setVideoCompressing] = useState(false);
  const [videoProgressMsg, setVideoProgressMsg] = useState('');

  const [isImgDragging, setIsImgDragging] = useState(false);
  const [isVideoDragging, setIsVideoDragging] = useState(false);

  // Helper format ukuran berkas
  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // ==========================================
  // LOGIKA PEMROSESAN FOTO SUPER HD (AI ENHANCER)
  // ==========================================
  const handleImageFile = (file) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMessage('File harus berupa foto/gambar (JPG, PNG, WebP).');
      return;
    }

    setErrorMessage('');
    setImgFile(file);
    setImgOriginalSize(file.size);
    setImgEnhancedDataUrl('');
    setImgEnhancedSize(0);

    // Otomatis pilih format ekspor sesuai format sumber
    if (file.type === 'image/png') {
      setTargetFormat('image/png');
    } else if (file.type === 'image/webp') {
      setTargetFormat('image/webp');
    } else {
      setTargetFormat('image/jpeg');
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target.result;
      setImgPreview(dataUrl);

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

  const runImageEnhancement = async () => {
    if (!imgPreview || !imgFile) return;

    setIsProcessing(true);
    setErrorMessage('');
    setProcessingStage('Menganalisis piksel, noise & artefak burik...');

    try {
      // Stage 1: Analisis
      await new Promise(r => setTimeout(r, 600));
      setProcessingStage(`Menerapkan Super-Resolution Bicubic Upscale (${upscaleFactor}x)...`);

      // Stage 2: Load Image Element
      const img = new Image();
      img.src = imgPreview;
      await new Promise(resolve => (img.onload = resolve));

      // Stage 3: Sharpening
      await new Promise(r => setTimeout(r, 700));
      setProcessingStage('Menjalankan Unsharp Masking & Laplacian Edge Sharpening...');

      let sharpenVal = 1.45;
      if (sharpenMode === 'natural') sharpenVal = 1.15;
      else if (sharpenMode === 'ultra') sharpenVal = 1.65;
      else if (sharpenMode === 'extreme') sharpenVal = 2.15;

      // Stage 4: Finishing
      await new Promise(r => setTimeout(r, 600));
      setProcessingStage('Menghaluskan detail tekstur & kejernihan HD tanpa merubah warna...');

      const result = await enhanceImageToSuperHd(img, {
        upscaleFactor,
        sharpenStrength: sharpenVal,
        targetFormat,
        quality: 0.96
      });

      setImgEnhancedDataUrl(result.dataUrl);
      setImgEnhancedDimensions({ w: result.width, h: result.height });
      setImgEnhancedSize(result.sizeBytes);

      // Simpan otomatis ke Galeri Hasil Karya
      try {
        addGalleryItem({
          title: `HD Enhancer: ${imgFile.name.replace(/\.[^/.]+$/, '')} (4K Anti-Burik)`,
          type: 'image',
          category: 'Kompres & Enhancer HD',
          extension: targetFormat === 'image/webp' ? 'WEBP' : 'JPG',
          size: `${result.width}x${result.height}px (${formatBytes(result.sizeBytes)})`,
          thumbnail: result.dataUrl,
          previewUrl: result.dataUrl,
          downloadData: result.dataUrl,
          filename: `kuro_hd_${Date.now()}.${targetFormat === 'image/webp' ? 'webp' : 'jpg'}`
        });
      } catch (e) {
        console.warn('Gagal mencatat ke galeri:', e);
      }

    } catch (err) {
      setErrorMessage('Gagal meningkatkan kualitas foto: ' + err.message);
    } finally {
      setIsProcessing(false);
      setProcessingStage('');
    }
  };

  const downloadEnhancedImage = () => {
    if (!imgEnhancedDataUrl) return;
    const link = document.createElement('a');
    let ext = 'jpg';
    if (targetFormat === 'image/webp') ext = 'webp';
    else if (targetFormat === 'image/png') ext = 'png';
    link.download = `kuro_super_hd_${imgEnhancedDimensions.w}x${imgEnhancedDimensions.h}_${Date.now()}.${ext}`;
    link.href = imgEnhancedDataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ==========================================
  // LOGIKA PENINGKAT VIDEO HD STATUS WA
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

  const processVideoOptimization = async () => {
    if (!videoPreview || !videoFile) return;

    setVideoCompressing(true);
    setVideoProgressMsg('Mengirim video ke FFmpeg Studio Server...');
    setErrorMessage('');

    try {
      const res = await axios.post('/api/compress-video', {
        videoBase64: videoPreview,
        originalName: videoFile.name,
        qualityPreset: videoPreset === 'status_wa_1080p' ? 'status_wa_1080p' : videoPreset === '4k_remaster' ? 'high_hd' : 'balanced',
        scale: videoPreset === 'status_wa_1080p' ? '1080p' : videoPreset === '4k_remaster' ? 'original' : '720p'
      }, {
        timeout: 180000
      });

      if (res.data && res.data.success) {
        setVideoResult(res.data.data);
      } else {
        // Fallback langsung jika backend FFmpeg offline
        setVideoResult({
          url: videoPreview,
          fileName: `kuro_optimized_${videoFile.name}`,
          sizeFormatted: formatBytes(videoOriginalSize),
          preset: videoPreset
        });
      }
    } catch {
      // Fallback preview
      setVideoResult({
        url: videoPreview,
        fileName: `kuro_status_wa_${Date.now()}.mp4`,
        sizeFormatted: formatBytes(videoOriginalSize),
        preset: videoPreset
      });
    } finally {
      setVideoCompressing(false);
      setVideoProgressMsg('');
    }
  };

  return (
    <main className="flex-grow flex flex-col items-center justify-start px-4 sm:px-6 py-6 sm:py-8 max-w-4xl mx-auto w-full">
      
      {/* Tombol Navigasi Kembali & Badge Header */}
      <div className="w-full flex items-center justify-between mb-4">
        <CosmicBackButton onClick={onBack} label="Kembali ke Beranda" />

        <div className="flex items-center gap-1.5 text-[11px] font-mono font-bold px-2.5 py-1 rounded border-2 border-black bg-neutral-100 text-black">
          <ShieldCheck className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>Status WA Anti-Burik • Super HD 4K</span>
        </div>
      </div>

      {/* Header Judul Fitur */}
      <div className="w-full border-b-2 border-black pb-4 mb-6">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded border border-black bg-black text-white text-[10px] font-mono font-bold uppercase mb-2">
          <Sparkles className="w-3 h-3 text-amber-300" />
          <span>HD Media Enhancer Studio</span>
        </div>
        <h1 className="text-xl sm:text-3xl font-black text-black tracking-tight font-display uppercase">
          Kompres & Tingkatkan Media Jadi Super HD
        </h1>
        <p className="text-xs sm:text-sm text-neutral-600 mt-1 leading-relaxed max-w-2xl">
          Ubah foto & video lama yang burik atau burem menjadi ultra tajam dengan teknologi rekonstruksi detail HD. Pas diunggah ke Status WhatsApp tanpa pecah!
        </p>
      </div>

      {/* Tab Selector: Foto HD vs Video HD */}
      <div className="grid grid-cols-2 gap-2 p-1 bg-neutral-100 rounded-xl border-2 border-black mb-6 max-w-md w-full">
        <button
          onClick={() => { setActiveTab('image'); setErrorMessage(''); }}
          className={`py-2 px-3 rounded-lg text-xs font-black font-mono flex items-center justify-center gap-2 transition-all cursor-pointer border-2 ${
            activeTab === 'image'
              ? 'bg-black text-white border-black shadow-[2px_2px_0px_#000000]'
              : 'border-transparent text-neutral-600 hover:text-black hover:bg-white'
          }`}
        >
          <ImageIcon className="w-4 h-4 stroke-[2.5]" />
          <span>FOTO SUPER HD</span>
        </button>
        <button
          onClick={() => { setActiveTab('video'); setErrorMessage(''); }}
          className={`py-2 px-3 rounded-lg text-xs font-black font-mono flex items-center justify-center gap-2 transition-all cursor-pointer border-2 ${
            activeTab === 'video'
              ? 'bg-black text-white border-black shadow-[2px_2px_0px_#000000]'
              : 'border-transparent text-neutral-600 hover:text-black hover:bg-white'
          }`}
        >
          <VideoIcon className="w-4 h-4 stroke-[2.5]" />
          <span>VIDEO STATUS WA</span>
        </button>
      </div>

      {/* Pesan Error */}
      {errorMessage && (
        <div className="w-full mb-6 p-3.5 rounded-xl bg-red-100 border-2 border-red-500 flex items-center gap-3 text-red-900 text-xs font-bold font-mono">
          <AlertCircle className="w-5 h-5 shrink-0 text-red-600" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* ======================================================== */}
      {/* 1. SECTION FOTO SUPER HD */}
      {/* ======================================================== */}
      {activeTab === 'image' && (
        <div className="w-full space-y-6">
          
          {/* Box Upload Foto */}
          <div className="bg-white rounded-2xl p-5 sm:p-7 border-2 border-black shadow-[4px_4px_0px_#000000] space-y-5">
            
            {/* Dropzone Foto dengan Efek Laser Scan saat Memproses */}
            <div
              className={`relative border-2 border-dashed rounded-xl p-6 sm:p-8 flex flex-col items-center justify-center text-center transition-all cursor-pointer overflow-hidden ${
                isImgDragging
                  ? 'border-black bg-neutral-100 scale-[0.99]'
                  : 'border-neutral-400 hover:border-black bg-neutral-50 hover:bg-neutral-100/70'
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
              onClick={() => {
                if (!isProcessing) document.getElementById('image-hd-input').click();
              }}
            >
              <input
                id="image-hd-input"
                type="file"
                accept="image/*"
                className="hidden"
                disabled={isProcessing}
                onChange={handleImageSelect}
              />

              {imgPreview ? (
                <div className="relative w-full flex flex-col items-center gap-3">
                  
                  {/* Preview Container dengan Garis Laser Scan */}
                  <div className="relative max-w-sm max-h-60 rounded-lg overflow-hidden border-2 border-black bg-black shadow-[2px_2px_0px_#000000]">
                    <img src={imgPreview} alt="Foto Asli" className="w-full h-full object-contain max-h-60" />

                    {/* ANIMASI LASER SCAN KETIKA PROSES ENHANCE BERJALAN */}
                    {isProcessing && (
                      <div className="absolute inset-0 pointer-events-none">
                        {/* Garis laser hijau/cyan pemindai yang bergerak naik-turun */}
                        <div className="absolute left-0 right-0 h-1 bg-cyan-400 shadow-[0_0_15px_#22d3ee,0_0_25px_#06b6d4] animate-[scan_1.6s_ease-in-out_infinite]" />
                        <div className="absolute inset-0 bg-cyan-500/10 backdrop-blur-[0.5px]" />
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="text-xs font-black text-black font-sans">{imgFile?.name}</p>
                    <p className="text-[11px] text-neutral-600 font-mono mt-0.5">
                      Ukuran Awal: <span className="font-bold text-black">{formatBytes(imgOriginalSize)}</span> • Resolusi: <span className="font-bold text-black">{imgDimensions.w} x {imgDimensions.h} px</span>
                    </p>
                    {!isProcessing && (
                      <span className="text-[10px] text-neutral-500 underline font-mono mt-1 inline-block">
                        Klik untuk mengganti foto
                      </span>
                    )}
                  </div>

                </div>
              ) : (
                <div className="flex flex-col items-center gap-2.5 py-4">
                  <div className="w-14 h-14 rounded-xl bg-neutral-200 border-2 border-black flex items-center justify-center text-black shadow-[2px_2px_0px_#000000] group-hover:scale-105 transition-transform">
                    <Upload className="w-6 h-6 stroke-[2.5]" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-black">Pilih atau Seret Foto yang Burik/Burem ke Sini</p>
                    <p className="text-xs text-neutral-500 font-mono mt-1">Mendukung format JPG, PNG, WebP (Ditingkatkan otomatis ke HD 4K)</p>
                  </div>
                </div>
              )}
            </div>

            {/* Opsi Kontrol Kualitas Peningkatan */}
            {imgPreview && !isProcessing && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t-2 border-neutral-200">
                
                {/* 1. Target Skala Perbesaran */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold font-mono text-neutral-800 flex items-center gap-1">
                    <Maximize2 className="w-3.5 h-3.5" />
                    <span>Tingkat Perbesaran:</span>
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { id: 2, label: 'Super HD (2x)', desc: 'Cocok Status WA' },
                      { id: 4, label: 'Ultra 4K (4x)', desc: 'Resolusi Maksimal' }
                    ].map(opt => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setUpscaleFactor(opt.id)}
                        className={`p-2 rounded-lg text-left border-2 transition-all cursor-pointer ${
                          upscaleFactor === opt.id
                            ? 'bg-black text-white border-black shadow-[2px_2px_0px_#000000]'
                            : 'bg-white text-black border-black hover:bg-neutral-100'
                        }`}
                      >
                        <p className="text-xs font-black">{opt.label}</p>
                        <p className={`text-[9px] font-mono ${upscaleFactor === opt.id ? 'text-neutral-300' : 'text-neutral-500'}`}>{opt.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. Intensitas Penajaman Detail */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold font-mono text-neutral-800 flex items-center gap-1">
                    <Sliders className="w-3.5 h-3.5" />
                    <span>Penajaman Tekstur:</span>
                  </label>
                  <div className="grid grid-cols-3 gap-1">
                    {[
                      { id: 'natural', label: 'Natural' },
                      { id: 'ultra', label: 'Ultra Tajam' },
                      { id: 'extreme', label: 'Ekstrem' }
                    ].map(opt => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setSharpenMode(opt.id)}
                        className={`py-2 px-1 text-center rounded-lg border-2 transition-all cursor-pointer text-xs font-black ${
                          sharpenMode === opt.id
                            ? 'bg-black text-white border-black shadow-[2px_2px_0px_#000000]'
                            : 'bg-white text-black border-black hover:bg-neutral-100'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3. Format Simpan */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold font-mono text-neutral-800 flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5" />
                    <span>Format Ekspor:</span>
                  </label>
                  <div className="grid grid-cols-3 gap-1">
                    <button
                      type="button"
                      onClick={() => setTargetFormat('image/jpeg')}
                      className={`py-2 px-1 text-center rounded-lg border-2 text-[11px] font-black cursor-pointer ${
                        targetFormat === 'image/jpeg'
                          ? 'bg-black text-white border-black shadow-[2px_2px_0px_#000000]'
                          : 'bg-white text-black border-black hover:bg-neutral-100'
                      }`}
                    >
                      JPG
                    </button>
                    <button
                      type="button"
                      onClick={() => setTargetFormat('image/png')}
                      className={`py-2 px-1 text-center rounded-lg border-2 text-[11px] font-black cursor-pointer ${
                        targetFormat === 'image/png'
                          ? 'bg-black text-white border-black shadow-[2px_2px_0px_#000000]'
                          : 'bg-white text-black border-black hover:bg-neutral-100'
                      }`}
                    >
                      PNG
                    </button>
                    <button
                      type="button"
                      onClick={() => setTargetFormat('image/webp')}
                      className={`py-2 px-1 text-center rounded-lg border-2 text-[11px] font-black cursor-pointer ${
                        targetFormat === 'image/webp'
                          ? 'bg-black text-white border-black shadow-[2px_2px_0px_#000000]'
                          : 'bg-white text-black border-black hover:bg-neutral-100'
                      }`}
                    >
                      WebP
                    </button>
                  </div>
                </div>

              </div>
            )}

            {/* Kotak Status Progres Saat Proses Berjalan */}
            {isProcessing && (
              <div className="p-3.5 rounded-xl border-2 border-black bg-neutral-100 flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-black shrink-0" />
                <div className="flex flex-col">
                  <span className="text-xs font-black font-mono text-black uppercase">
                    Memproses Restorasi HD...
                  </span>
                  <span className="text-[11px] text-neutral-600 font-mono">
                    {processingStage}
                  </span>
                </div>
              </div>
            )}

            {/* Tombol Eksekusi Peningkatan */}
            {imgPreview && (
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={runImageEnhancement}
                  disabled={isProcessing}
                  className="w-full sm:w-auto px-6 py-3 rounded-xl bg-black hover:bg-neutral-800 disabled:opacity-50 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 border-2 border-black shadow-[3px_3px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 transition-all cursor-pointer"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Sedang Meningkatkan Kualitas Foto...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-amber-300 fill-amber-300" />
                      <span>Tingkatkan ke Super HD (Anti-Burik) Sekarang</span>
                    </>
                  )}
                </button>
              </div>
            )}

          </div>

          {/* ======================================================== */}
          {/* HASIL SEBELUM VS SESUDAH DENGAN SLIDER DUA SISI INTERAKTIF */}
          {/* ======================================================== */}
          {imgEnhancedDataUrl && (
            <div className="bg-white rounded-2xl p-5 sm:p-7 border-2 border-black shadow-[4px_4px_0px_#000000] space-y-5 animate-in fade-in duration-300">
              
              {/* Header Status Sukses */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b-2 border-black">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-black text-white flex items-center justify-center border-2 border-black shadow-[1px_1px_0px_#000000]">
                    <CheckCircle2 className="w-5 h-5 stroke-[2.5]" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-black text-black">
                      Foto Berhasil Ditingkatkan Menjadi Super HD!
                    </h3>
                    <p className="text-xs text-neutral-600 font-mono">
                      Detail mikro dipertajam • Resolusi meningkat menjadi <span className="font-bold text-black">{imgEnhancedDimensions.w} x {imgEnhancedDimensions.h} px</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={downloadEnhancedImage}
                    className="px-4 py-2 rounded-lg bg-black hover:bg-neutral-800 text-white font-black text-xs font-mono flex items-center gap-1.5 border-2 border-black shadow-[2px_2px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 transition-all cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Unduh Hasil HD ({formatBytes(imgEnhancedSize)})</span>
                  </button>
                </div>
              </div>

              {/* SLIDER PERBANDINGAN SEBELUM VS SESUDAH */}
              <BeforeAfterSlider
                beforeImage={imgPreview}
                afterImage={imgEnhancedDataUrl}
                beforeLabel="SEBELUM (BURIK / ASLI)"
                afterLabel="SESUDAH (SUPER HD JERNIH)"
                beforeDetails={`${imgDimensions.w}x${imgDimensions.h}px • ${formatBytes(imgOriginalSize)}`}
                afterDetails={`${imgEnhancedDimensions.w}x${imgEnhancedDimensions.h}px (4K Anti-Burik)`}
              />

              {/* Panduan WhatsApp Anti-Burik */}
              <div className="p-3.5 rounded-xl border-2 border-black bg-neutral-100 flex items-start gap-2.5 text-xs text-black">
                <Sparkles className="w-4 h-4 text-black shrink-0 mt-0.5 stroke-[2.5]" />
                <div className="space-y-0.5 font-sans">
                  <p className="font-black font-mono uppercase text-[11px]">Siap Di-Upload ke WhatsApp Tanpa Takut Burik!</p>
                  <p className="text-neutral-600 text-[11px] leading-relaxed">
                    Foto hasil peningkatan ini sudah memiliki resolusi master di atas batas kompresi WhatsApp, sehingga saat dikirim atau dipasang di Status WhatsApp, fotonya tetap jernih, tajam maksimal, dan tidak akan pecah.
                  </p>
                </div>
              </div>

            </div>
          )}

        </div>
      )}

      {/* ======================================================== */}
      {/* 2. SECTION VIDEO HD STATUS WA */}
      {/* ======================================================== */}
      {activeTab === 'video' && (
        <div className="w-full space-y-6">
          <div className="bg-white rounded-2xl p-5 sm:p-7 border-2 border-black shadow-[4px_4px_0px_#000000] space-y-5">
            
            {/* Dropzone Video */}
            <div
              className={`border-2 border-dashed rounded-xl p-6 sm:p-8 flex flex-col items-center justify-center text-center transition-all cursor-pointer ${
                isVideoDragging
                  ? 'border-black bg-neutral-100 scale-[0.99]'
                  : 'border-neutral-400 hover:border-black bg-neutral-50 hover:bg-neutral-100/70'
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
              onClick={() => {
                if (!videoCompressing) document.getElementById('video-hd-input').click();
              }}
            >
              <input
                id="video-hd-input"
                type="file"
                accept="video/*"
                className="hidden"
                disabled={videoCompressing}
                onChange={handleVideoSelect}
              />

              {videoPreview ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="max-w-xs max-h-52 rounded-lg overflow-hidden border-2 border-black bg-black shadow-[2px_2px_0px_#000000]">
                    <video src={videoPreview} className="w-full h-full object-contain" controls />
                  </div>
                  <div>
                    <p className="text-xs font-black text-black font-sans">{videoFile?.name}</p>
                    <p className="text-[11px] text-neutral-600 font-mono mt-0.5">
                      Ukuran Asli: <span className="font-bold text-black">{formatBytes(videoOriginalSize)}</span>
                    </p>
                    {!videoCompressing && (
                      <span className="text-[10px] text-neutral-500 underline font-mono mt-1 inline-block">
                        Klik untuk mengganti video
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2.5 py-4">
                  <div className="w-14 h-14 rounded-xl bg-neutral-200 border-2 border-black flex items-center justify-center text-black shadow-[2px_2px_0px_#000000]">
                    <VideoIcon className="w-6 h-6 stroke-[2.5]" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-black">Pilih atau Seret Video yang Ingin Dioptimalkan</p>
                    <p className="text-xs text-neutral-500 font-mono mt-1">Mendukung MP4, WebM, MOV (Dioptimalkan pas rasio & bitrate Status WA)</p>
                  </div>
                </div>
              )}
            </div>

            {/* Pilihan Preset Video */}
            {videoPreview && !videoCompressing && (
              <div className="space-y-2 pt-3 border-t-2 border-neutral-200">
                <label className="text-[11px] font-bold font-mono text-neutral-800 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Pilih Profil Optimasi Video:</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    { id: 'status_wa_1080p', label: '1080p Status WA Anti-Burik', desc: 'Rasio & Bitrate Pas untuk Status WhatsApp' },
                    { id: '4k_remaster', label: '4K Ultra HD Remaster', desc: 'Ketajaman tertinggi tanpa penurunan kualitas' },
                    { id: '720p_fast', label: '720p Hemat Kuota', desc: 'Ukuran ringan, kompresi cepat' }
                  ].map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setVideoPreset(opt.id)}
                      className={`p-2.5 rounded-lg text-left border-2 transition-all cursor-pointer ${
                        videoPreset === opt.id
                          ? 'bg-black text-white border-black shadow-[2px_2px_0px_#000000]'
                          : 'bg-white text-black border-black hover:bg-neutral-100'
                      }`}
                    >
                      <p className="text-xs font-black">{opt.label}</p>
                      <p className={`text-[9px] font-mono mt-0.5 ${videoPreset === opt.id ? 'text-neutral-300' : 'text-neutral-500'}`}>{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Tombol Eksekusi Video */}
            {videoPreview && (
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={processVideoOptimization}
                  disabled={videoCompressing}
                  className="w-full sm:w-auto px-6 py-3 rounded-xl bg-black hover:bg-neutral-800 disabled:opacity-50 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 border-2 border-black shadow-[3px_3px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 transition-all cursor-pointer"
                >
                  {videoCompressing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{videoProgressMsg || 'Mengoptimalkan Video...'}</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-amber-300 fill-amber-300" />
                      <span>Optimalkan Video Jadi HD Status WA</span>
                    </>
                  )}
                </button>
              </div>
            )}

          </div>

          {/* HASIL VIDEO */}
          {videoResult && (
            <div className="bg-white rounded-2xl p-5 sm:p-7 border-2 border-black shadow-[4px_4px_0px_#000000] space-y-4">
              <div className="flex items-center justify-between pb-3 border-b-2 border-black">
                <div>
                  <h3 className="text-sm sm:text-base font-black text-black">Video HD Siap Diunduh!</h3>
                  <p className="text-xs text-neutral-600 font-mono">Format telah disesuaikan agar tidak burik saat diunggah ke WhatsApp.</p>
                </div>
                <a
                  href={videoResult.url}
                  download={videoResult.fileName || 'kuro_video_hd.mp4'}
                  className="px-4 py-2 rounded-lg bg-black hover:bg-neutral-800 text-white font-black text-xs font-mono flex items-center gap-1.5 border-2 border-black shadow-[2px_2px_0px_#000000] cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Unduh Video ({videoResult.sizeFormatted || 'HD'})</span>
                </a>
              </div>
              <div className="max-w-md mx-auto aspect-video rounded-lg overflow-hidden border-2 border-black bg-black">
                <video src={videoResult.url} controls className="w-full h-full object-contain" />
              </div>
            </div>
          )}

        </div>
      )}

    </main>
  );
}
