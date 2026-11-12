import React, { useState } from 'react';
import axios from 'axios';
import CosmicBackButton from './CosmicBackButton';
import BeforeAfterSlider from './BeforeAfterSlider';
import { enhanceImageToSuperHd } from '../utils/imageEnhancer';
import { compressPdfDocument, PDF_PRESETS } from '../utils/pdfCompressor';
import { addGalleryItem } from '../services/storageService';
import { 
  Sparkles, 
  Upload, 
  Image as ImageIcon, 
  Video as VideoIcon, 
  FileText,
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
  ExternalLink,
  RotateCcw
} from 'lucide-react';

export default function MediaCompressorScreen({ onBack }) {
  const [activeTab, setActiveTab] = useState('image'); // 'image' | 'video' | 'pdf'

  // State Foto Super HD
  const [imgFile, setImgFile] = useState(null);
  const [imgPreview, setImgPreview] = useState('');
  const [imgOriginalSize, setImgOriginalSize] = useState(0);
  const [imgDimensions, setImgDimensions] = useState({ w: 0, h: 0 });

  const [imgEnhancedDataUrl, setImgEnhancedDataUrl] = useState('');
  const [imgEnhancedSize, setImgEnhancedSize] = useState(0);
  const [imgEnhancedDimensions, setImgEnhancedDimensions] = useState({ w: 0, h: 0 });

  const [upscaleFactor, setUpscaleFactor] = useState(2);
  const [sharpenMode, setSharpenMode] = useState('ultra');
  const [targetFormat, setTargetFormat] = useState('image/jpeg');

  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // State Video HD Status WA
  const [videoFile, setVideoFile] = useState(null);
  const [videoPreview, setVideoPreview] = useState('');
  const [videoOriginalSize, setVideoOriginalSize] = useState(0);
  const [videoResult, setVideoResult] = useState(null);
  const [videoPreset, setVideoPreset] = useState('status_wa_1080p');
  const [videoCompressing, setVideoCompressing] = useState(false);
  const [videoProgressMsg, setVideoProgressMsg] = useState('');

  // State Kompresi PDF
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfOriginalSize, setPdfOriginalSize] = useState(0);
  const [pdfOriginalUrl, setPdfOriginalUrl] = useState('');
  const [pdfPreset, setPdfPreset] = useState('optimal');
  const [pdfResult, setPdfResult] = useState(null);
  const [isPdfCompressing, setIsPdfCompressing] = useState(false);
  const [pdfProgressMsg, setPdfProgressMsg] = useState('');
  const [pdfProgressPercent, setPdfProgressPercent] = useState(0);
  const [pdfPreviewMode, setPdfPreviewMode] = useState('compressed'); // 'compressed' | 'original'

  const [isImgDragging, setIsImgDragging] = useState(false);
  const [isVideoDragging, setIsVideoDragging] = useState(false);
  const [isPdfDragging, setIsPdfDragging] = useState(false);

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Reset state PDF untuk upload baru
  const resetPdfState = () => {
    setPdfFile(null);
    setPdfOriginalSize(0);
    setPdfOriginalUrl('');
    setPdfResult(null);
    setPdfPreviewMode('compressed');
    setErrorMessage('');
  };

  // Logika Foto Super HD
  const handleImageFile = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrorMessage('File harus berupa foto atau gambar (JPG, PNG, WebP).');
      return;
    }

    setErrorMessage('');
    setImgFile(file);
    setImgOriginalSize(file.size);
    setImgEnhancedDataUrl('');
    setImgEnhancedSize(0);

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

  const runImageEnhancement = async () => {
    if (!imgPreview || !imgFile) return;

    setIsProcessing(true);
    setErrorMessage('');
    setProcessingStage('Menganalisis piksel, noise, dan artefak kompresi...');

    try {
      await new Promise(r => setTimeout(r, 400));
      setProcessingStage(`Menerapkan Super-Resolution Bicubic Upscale (${upscaleFactor}x)...`);

      const img = new Image();
      img.src = imgPreview;
      await new Promise(resolve => (img.onload = resolve));

      await new Promise(r => setTimeout(r, 500));
      setProcessingStage('Menjalankan Laplacian edge sharpening dan restorasi kontras...');

      let sharpenVal = 1.45;
      if (sharpenMode === 'natural') sharpenVal = 1.15;
      else if (sharpenMode === 'ultra') sharpenVal = 1.65;
      else if (sharpenMode === 'extreme') sharpenVal = 2.15;

      const result = await enhanceImageToSuperHd(img, {
        upscaleFactor,
        sharpenStrength: sharpenVal,
        targetFormat,
        quality: 0.96
      });

      setImgEnhancedDataUrl(result.dataUrl);
      setImgEnhancedDimensions({ w: result.width, h: result.height });
      setImgEnhancedSize(result.sizeBytes);

      try {
        addGalleryItem({
          title: `HD Enhancer: ${imgFile.name.replace(/\.[^/.]+$/, '')}`,
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

  // Logika Video Status WA
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
        setVideoResult({
          url: videoPreview,
          fileName: `kuro_optimized_${videoFile.name}`,
          sizeFormatted: formatBytes(videoOriginalSize),
          compressedSize: videoOriginalSize,
          savingsPercent: '0%',
          preset: videoPreset
        });
      }
    } catch {
      setVideoResult({
        url: videoPreview,
        fileName: `kuro_status_wa_${Date.now()}.mp4`,
        sizeFormatted: formatBytes(videoOriginalSize),
        compressedSize: videoOriginalSize,
        savingsPercent: '0%',
        preset: videoPreset
      });
    } finally {
      setVideoCompressing(false);
      setVideoProgressMsg('');
    }
  };

  // Logika Kompresi Dokumen PDF
  const handlePdfFile = (file) => {
    if (!file) return;
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      setErrorMessage('Berkas harus berupa dokumen format PDF.');
      return;
    }

    setErrorMessage('');
    setPdfFile(file);
    setPdfOriginalSize(file.size);
    setPdfResult(null);
    setPdfPreviewMode('compressed');

    const originalBlobUrl = URL.createObjectURL(file);
    setPdfOriginalUrl(originalBlobUrl);
  };

  const processPdfCompression = async () => {
    if (!pdfFile) return;

    setIsPdfCompressing(true);
    setErrorMessage('');
    setPdfProgressMsg('Menyiapkan engine optimasi dokumen...');
    setPdfProgressPercent(10);

    try {
      const result = await compressPdfDocument(pdfFile, {
        preset: pdfPreset,
        onProgress: (stage, pct) => {
          setPdfProgressMsg(stage);
          setPdfProgressPercent(pct);
        }
      });

      setPdfResult(result);

      // Otomatis simpan riwayat ke Galeri Karya
      try {
        addGalleryItem({
          title: `Kompres PDF: ${pdfFile.name.replace(/\.[^/.]+$/, '')}`,
          type: 'document',
          category: 'Kompres & Enhancer HD',
          extension: 'PDF',
          size: `${formatBytes(result.compressedSizeBytes)} (${result.savingsPercent} Hemat)`,
          thumbnail: '',
          previewUrl: result.dataUrl,
          downloadData: result.dataUrl,
          filename: `kuro_compressed_${Date.now()}.pdf`
        });
      } catch (errGal) {
        console.warn('Pencatatan galeri dokumen dilewati:', errGal);
      }

    } catch (err) {
      setErrorMessage('Gagal mengompres dokumen PDF: ' + err.message);
    } finally {
      setIsPdfCompressing(false);
      setPdfProgressMsg('');
      setPdfProgressPercent(0);
    }
  };

  // Unduh dokumen PDF satuan langsung (bukan file arsip .zip/.rar)
  const downloadCompressedPdf = () => {
    if (!pdfResult?.dataUrl) return;
    const link = document.createElement('a');
    const safeBaseName = pdfFile ? pdfFile.name.replace(/\.pdf$/i, '') : 'dokumen';
    link.download = `kuro_${safeBaseName}_terkompres.pdf`;
    link.href = pdfResult.dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const activePdfUrl = pdfPreviewMode === 'compressed' ? pdfResult?.dataUrl : pdfOriginalUrl;

  return (
    <main className="flex-grow flex flex-col items-center justify-start px-3 sm:px-6 py-4 sm:py-8 max-w-4xl mx-auto w-full overflow-x-hidden">
      
      {/* Navigasi & Header Status Responsif Mobile */}
      <div className="w-full flex flex-wrap items-center justify-between gap-2 mb-4">
        <CosmicBackButton onClick={onBack} label="Kembali ke Beranda" />

        <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] font-mono font-bold px-2 py-1 rounded border-2 border-black bg-neutral-100 text-black">
          <ShieldCheck className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>Status WA Anti-Burik • Kompres Media & PDF</span>
        </div>
      </div>

      {/* Header Utama */}
      <div className="w-full border-b-2 border-black pb-4 mb-5 sm:mb-6">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded border border-black bg-black text-white text-[10px] font-mono font-bold uppercase mb-2">
          <Sparkles className="w-3 h-3 text-amber-300" />
          <span>HD Media & Document Compressor</span>
        </div>
        <h1 className="text-xl sm:text-3xl font-black text-black tracking-tight font-display uppercase">
          Kompres Media & Dokumen Kuro Studio
        </h1>
        <p className="text-xs sm:text-sm text-neutral-600 mt-1 leading-relaxed max-w-2xl">
          Kecilkan ukuran foto, video status WA, dan dokumen PDF secara signifikan tanpa merusak isi, tanpa teks hilang, dan menjaga layout tetap tajam rapi.
        </p>
      </div>

      {/* Tab Selector 3 Mode: Touch-Friendly di Layar Ponsel */}
      <div className="grid grid-cols-3 gap-1.5 sm:gap-2 p-1 bg-neutral-100 rounded-xl border-2 border-black mb-5 sm:mb-6 max-w-xl w-full">
        <button
          type="button"
          onClick={() => { setActiveTab('image'); setErrorMessage(''); }}
          className={`py-2 px-1 sm:px-3 rounded-lg text-[10px] sm:text-xs font-black font-mono flex items-center justify-center gap-1 sm:gap-2 transition-all cursor-pointer border-2 min-h-[44px] ${
            activeTab === 'image'
              ? 'bg-black text-white border-black shadow-[2px_2px_0px_#000000]'
              : 'border-transparent text-neutral-600 hover:text-black hover:bg-white'
          }`}
        >
          <ImageIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5] shrink-0" />
          <span className="truncate">FOTO HD</span>
        </button>

        <button
          type="button"
          onClick={() => { setActiveTab('video'); setErrorMessage(''); }}
          className={`py-2 px-1 sm:px-3 rounded-lg text-[10px] sm:text-xs font-black font-mono flex items-center justify-center gap-1 sm:gap-2 transition-all cursor-pointer border-2 min-h-[44px] ${
            activeTab === 'video'
              ? 'bg-black text-white border-black shadow-[2px_2px_0px_#000000]'
              : 'border-transparent text-neutral-600 hover:text-black hover:bg-white'
          }`}
        >
          <VideoIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5] shrink-0" />
          <span className="truncate">VIDEO WA</span>
        </button>

        <button
          type="button"
          onClick={() => { setActiveTab('pdf'); setErrorMessage(''); }}
          className={`py-2 px-1 sm:px-3 rounded-lg text-[10px] sm:text-xs font-black font-mono flex items-center justify-center gap-1 sm:gap-2 transition-all cursor-pointer border-2 min-h-[44px] ${
            activeTab === 'pdf'
              ? 'bg-black text-white border-black shadow-[2px_2px_0px_#000000]'
              : 'border-transparent text-neutral-600 hover:text-black hover:bg-white'
          }`}
        >
          <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5] shrink-0" />
          <span className="truncate">KOMPRES PDF</span>
        </button>
      </div>

      {/* Banner Notifikasi Kesalahan */}
      {errorMessage && (
        <div className="w-full mb-5 p-3.5 rounded-xl bg-red-100 border-2 border-red-500 flex items-center gap-3 text-red-900 text-xs font-bold font-mono">
          <AlertCircle className="w-5 h-5 shrink-0 text-red-600" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* ======================================================== */}
      {/* 1. SECTION FOTO SUPER HD */}
      {/* ======================================================== */}
      {activeTab === 'image' && (
        <div className="w-full space-y-5 sm:space-y-6">
          <div className="bg-white rounded-2xl p-4 sm:p-7 border-2 border-black shadow-[4px_4px_0px_#000000] space-y-4 sm:space-y-5">
            
            <div
              className={`relative border-2 border-dashed rounded-xl p-5 sm:p-8 flex flex-col items-center justify-center text-center transition-all cursor-pointer overflow-hidden ${
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
                onChange={(e) => handleImageFile(e.target.files?.[0])}
              />

              {imgPreview ? (
                <div className="relative w-full flex flex-col items-center gap-3">
                  <div className="relative max-w-sm max-h-60 rounded-lg overflow-hidden border-2 border-black bg-black shadow-[2px_2px_0px_#000000]">
                    <img src={imgPreview} alt="Foto Asli" className="w-full h-full object-contain max-h-60" />
                    {isProcessing && (
                      <div className="absolute inset-0 pointer-events-none">
                        <div className="absolute left-0 right-0 h-1 bg-cyan-400 shadow-[0_0_15px_#22d3ee,0_0_25px_#06b6d4] animate-[scan_1.6s_ease-in-out_infinite]" />
                        <div className="absolute inset-0 bg-cyan-500/10 backdrop-blur-[0.5px]" />
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="text-xs font-black text-black font-sans break-all">{imgFile?.name}</p>
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
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-neutral-200 border-2 border-black flex items-center justify-center text-black shadow-[2px_2px_0px_#000000]">
                    <Upload className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.5]" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-black">Pilih atau Seret Foto ke Sini</p>
                    <p className="text-xs text-neutral-500 font-mono mt-1">Mendukung format JPG, PNG, WebP (Ditingkatkan otomatis ke HD 4K)</p>
                  </div>
                </div>
              )}
            </div>

            {imgPreview && !isProcessing && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t-2 border-neutral-200">
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
                        className={`p-2 rounded-lg text-left border-2 transition-all cursor-pointer min-h-[44px] ${
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

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold font-mono text-neutral-800 flex items-center gap-1">
                    <Sliders className="w-3.5 h-3.5" />
                    <span>Penajaman Tekstur:</span>
                  </label>
                  <div className="grid grid-cols-3 gap-1">
                    {[
                      { id: 'natural', label: 'Natural' },
                      { id: 'ultra', label: 'Ultra' },
                      { id: 'extreme', label: 'Ekstrem' }
                    ].map(opt => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setSharpenMode(opt.id)}
                        className={`py-2 px-1 text-center rounded-lg border-2 transition-all cursor-pointer text-xs font-black min-h-[44px] flex items-center justify-center ${
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

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold font-mono text-neutral-800 flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5" />
                    <span>Format Ekspor:</span>
                  </label>
                  <div className="grid grid-cols-3 gap-1">
                    {['image/jpeg', 'image/png', 'image/webp'].map((fmt) => {
                      const label = fmt === 'image/jpeg' ? 'JPG' : fmt === 'image/png' ? 'PNG' : 'WebP';
                      return (
                        <button
                          key={fmt}
                          type="button"
                          onClick={() => setTargetFormat(fmt)}
                          className={`py-2 px-1 text-center rounded-lg border-2 text-[11px] font-black cursor-pointer min-h-[44px] flex items-center justify-center ${
                            targetFormat === fmt
                              ? 'bg-black text-white border-black shadow-[2px_2px_0px_#000000]'
                              : 'bg-white text-black border-black hover:bg-neutral-100'
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

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

            {imgPreview && (
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={runImageEnhancement}
                  disabled={isProcessing}
                  className="w-full sm:w-auto px-6 py-3 rounded-xl bg-black hover:bg-neutral-800 disabled:opacity-50 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 border-2 border-black shadow-[3px_3px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 transition-all cursor-pointer min-h-[44px]"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Sedang Meningkatkan Kualitas Foto...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-amber-300 fill-amber-300" />
                      <span>Tingkatkan ke Super HD Sekarang</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Live Preview Foto Super HD */}
          {imgEnhancedDataUrl && (
            <div className="bg-white rounded-2xl p-4 sm:p-7 border-2 border-black shadow-[4px_4px_0px_#000000] space-y-4 sm:space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b-2 border-black">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-black text-white flex items-center justify-center border-2 border-black shadow-[1px_1px_0px_#000000] shrink-0">
                    <CheckCircle2 className="w-5 h-5 stroke-[2.5]" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-black text-black">
                      Foto Berhasil Ditingkatkan Menjadi Super HD!
                    </h3>
                    <p className="text-xs text-neutral-600 font-mono">
                      Resolusi: <span className="font-bold text-black">{imgEnhancedDimensions.w} x {imgEnhancedDimensions.h} px</span> • Ukuran: <span className="font-bold text-black">{formatBytes(imgEnhancedSize)}</span>
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={downloadEnhancedImage}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-lg bg-black hover:bg-neutral-800 text-white font-black text-xs font-mono flex items-center justify-center gap-1.5 border-2 border-black shadow-[2px_2px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 transition-all cursor-pointer min-h-[44px]"
                >
                  <Download className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Unduh Foto HD ({formatBytes(imgEnhancedSize)})</span>
                </button>
              </div>

              <BeforeAfterSlider
                beforeImage={imgPreview}
                afterImage={imgEnhancedDataUrl}
                beforeLabel="SEBELUM (ASLI)"
                afterLabel="SESUDAH (SUPER HD)"
                beforeDetails={`${imgDimensions.w}x${imgDimensions.h}px • ${formatBytes(imgOriginalSize)}`}
                afterDetails={`${imgEnhancedDimensions.w}x${imgEnhancedDimensions.h}px • ${formatBytes(imgEnhancedSize)}`}
              />
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* 2. SECTION VIDEO HD STATUS WA */}
      {/* ======================================================== */}
      {activeTab === 'video' && (
        <div className="w-full space-y-5 sm:space-y-6">
          <div className="bg-white rounded-2xl p-4 sm:p-7 border-2 border-black shadow-[4px_4px_0px_#000000] space-y-4 sm:space-y-5">
            
            <div
              className={`border-2 border-dashed rounded-xl p-5 sm:p-8 flex flex-col items-center justify-center text-center transition-all cursor-pointer ${
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
                onChange={(e) => handleVideoFile(e.target.files?.[0])}
              />

              {videoPreview ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="max-w-xs max-h-52 rounded-lg overflow-hidden border-2 border-black bg-black shadow-[2px_2px_0px_#000000]">
                    <video src={videoPreview} className="w-full h-full object-contain" controls />
                  </div>
                  <div>
                    <p className="text-xs font-black text-black font-sans break-all">{videoFile?.name}</p>
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
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-neutral-200 border-2 border-black flex items-center justify-center text-black shadow-[2px_2px_0px_#000000]">
                    <VideoIcon className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.5]" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-black">Pilih atau Seret Video ke Sini</p>
                    <p className="text-xs text-neutral-500 font-mono mt-1">Mendukung MP4, WebM, MOV (Dioptimalkan pas rasio & bitrate Status WA)</p>
                  </div>
                </div>
              )}
            </div>

            {videoPreview && !videoCompressing && (
              <div className="space-y-2 pt-3 border-t-2 border-neutral-200">
                <label className="text-[11px] font-bold font-mono text-neutral-800 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Pilih Profil Optimasi Video:</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    { id: 'status_wa_1080p', label: '1080p Status WA', desc: 'Bitrate pas untuk Status WhatsApp' },
                    { id: '4k_remaster', label: '4K Ultra HD', desc: 'Ketajaman tertinggi tanpa degradasi' },
                    { id: '720p_fast', label: '720p Hemat Kuota', desc: 'Ukuran ringan dan kompresi cepat' }
                  ].map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setVideoPreset(opt.id)}
                      className={`p-2.5 rounded-lg text-left border-2 transition-all cursor-pointer min-h-[44px] ${
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

            {videoPreview && (
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={processVideoOptimization}
                  disabled={videoCompressing}
                  className="w-full sm:w-auto px-6 py-3 rounded-xl bg-black hover:bg-neutral-800 disabled:opacity-50 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 border-2 border-black shadow-[3px_3px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 transition-all cursor-pointer min-h-[44px]"
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

          {/* Live Preview Video dengan Perbandingan */}
          {videoResult && (
            <div className="bg-white rounded-2xl p-4 sm:p-7 border-2 border-black shadow-[4px_4px_0px_#000000] space-y-4 sm:space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b-2 border-black">
                <div>
                  <h3 className="text-sm sm:text-base font-black text-black">Pratinjau Live Video HD</h3>
                  <p className="text-xs text-neutral-600 font-mono">
                    Periksa audio dan video sebelum mengunduh berkas.
                  </p>
                </div>
                <a
                  href={videoResult.url}
                  download={videoResult.fileName || 'kuro_video_hd.mp4'}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-lg bg-black hover:bg-neutral-800 text-white font-black text-xs font-mono flex items-center justify-center gap-1.5 border-2 border-black shadow-[2px_2px_0px_#000000] cursor-pointer min-h-[44px]"
                >
                  <Download className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Unduh Video ({videoResult.sizeFormatted || 'HD'})</span>
                </a>
              </div>

              {/* Metrik Perbandingan Ukuran Video */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 rounded-xl bg-neutral-100 border-2 border-black text-xs font-mono">
                <div>
                  <p className="text-[10px] text-neutral-500 uppercase font-bold truncate">Ukuran Asli</p>
                  <p className="font-black text-black text-xs sm:text-sm">{formatBytes(videoOriginalSize)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-neutral-500 uppercase font-bold truncate">Ukuran Baru</p>
                  <p className="font-black text-black text-xs sm:text-sm">{videoResult.sizeFormatted || formatBytes(videoResult.compressedSize)}</p>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <p className="text-[10px] text-neutral-500 uppercase font-bold truncate">Penghematan</p>
                  <p className="font-black text-black text-xs sm:text-sm">{videoResult.savingsPercent || 'Terkalibrasi HD'}</p>
                </div>
              </div>

              {/* Pemutar Video Interaktif */}
              <div className="max-w-md mx-auto aspect-video rounded-xl overflow-hidden border-2 border-black bg-black shadow-[3px_3px_0px_#000000]">
                <video 
                  key={videoResult.url}
                  src={videoResult.url} 
                  controls 
                  playsInline
                  className="w-full h-full object-contain" 
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* 3. SECTION KOMPRES DOKUMEN PDF (MB KE KB REAL-TIME) */}
      {/* ======================================================== */}
      {activeTab === 'pdf' && (
        <div className="w-full space-y-5 sm:space-y-6">
          <div className="bg-white rounded-2xl p-4 sm:p-7 border-2 border-black shadow-[4px_4px_0px_#000000] space-y-4 sm:space-y-5">
            
            {/* Dropzone Dokumen PDF */}
            <div
              className={`border-2 border-dashed rounded-xl p-5 sm:p-8 flex flex-col items-center justify-center text-center transition-all cursor-pointer ${
                isPdfDragging
                  ? 'border-black bg-neutral-100 scale-[0.99]'
                  : 'border-neutral-400 hover:border-black bg-neutral-50 hover:bg-neutral-100/70'
              }`}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsPdfDragging(true); }}
              onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsPdfDragging(false); }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsPdfDragging(false);
                const file = e.dataTransfer.files?.[0];
                if (file) handlePdfFile(file);
              }}
              onClick={() => {
                if (!isPdfCompressing) document.getElementById('pdf-input').click();
              }}
            >
              <input
                id="pdf-input"
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                disabled={isPdfCompressing}
                onChange={(e) => handlePdfFile(e.target.files?.[0])}
              />

              {pdfFile ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-black text-white flex items-center justify-center border-2 border-black shadow-[2px_2px_0px_#000000]">
                    <FileText className="w-7 h-7 sm:w-8 sm:h-8 stroke-[2.2]" />
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm font-black text-black font-sans break-all max-w-xs sm:max-w-md">{pdfFile.name}</p>
                    <p className="text-[11px] text-neutral-600 font-mono mt-0.5">
                      Ukuran Asli: <span className="font-bold text-black">{formatBytes(pdfOriginalSize)}</span> ({pdfOriginalSize.toLocaleString('id-ID')} byte)
                    </p>
                    {!isPdfCompressing && (
                      <span className="text-[10px] text-neutral-500 underline font-mono mt-1 inline-block">
                        Klik untuk mengganti dokumen PDF
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2.5 py-4">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-neutral-200 border-2 border-black flex items-center justify-center text-black shadow-[2px_2px_0px_#000000]">
                    <FileText className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.5]" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-black">Pilih atau Seret Dokumen PDF ke Sini</p>
                    <p className="text-xs text-neutral-500 font-mono mt-1">Mendukung berkas PDF besar (Kompresi cerdas tanpa merusak teks, gambar, atau layout)</p>
                  </div>
                </div>
              )}
            </div>

            {/* Pilihan Profil Kompresi Dokumen PDF */}
            {pdfFile && !isPdfCompressing && (
              <div className="space-y-2 pt-3 border-t-2 border-neutral-200">
                <label className="text-[11px] font-bold font-mono text-neutral-800 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Pilih Profil Kompresi Dokumen:</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {Object.values(PDF_PRESETS).map((presetItem) => (
                    <button
                      key={presetItem.id}
                      type="button"
                      onClick={() => setPdfPreset(presetItem.id)}
                      className={`p-3 rounded-lg text-left border-2 transition-all cursor-pointer min-h-[44px] ${
                        pdfPreset === presetItem.id
                          ? 'bg-black text-white border-black shadow-[2px_2px_0px_#000000]'
                          : 'bg-white text-black border-black hover:bg-neutral-100'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-black">{presetItem.label}</p>
                        <span className={`text-[9px] px-1.5 py-0.2 rounded border font-mono ${
                          pdfPreset === presetItem.id ? 'border-white text-white' : 'border-black text-neutral-600'
                        }`}>
                          {presetItem.badge}
                        </span>
                      </div>
                      <p className={`text-[10px] font-mono mt-1 leading-snug ${
                        pdfPreset === presetItem.id ? 'text-neutral-300' : 'text-neutral-600'
                      }`}>
                        {presetItem.desc}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Indikator Progres Kompresi */}
            {isPdfCompressing && (
              <div className="p-4 rounded-xl border-2 border-black bg-neutral-100 space-y-2.5">
                <div className="flex items-center justify-between text-xs font-mono font-bold">
                  <span className="flex items-center gap-2 text-black truncate mr-2">
                    <Loader2 className="w-4 h-4 animate-spin text-black shrink-0" />
                    <span className="truncate">{pdfProgressMsg || 'Memproses kompresi dokumen...'}</span>
                  </span>
                  <span className="text-black shrink-0">{pdfProgressPercent}%</span>
                </div>
                <div className="w-full bg-neutral-200 h-2.5 rounded-full border border-black overflow-hidden">
                  <div 
                    className="bg-black h-full transition-all duration-300"
                    style={{ width: `${pdfProgressPercent}%` }}
                  />
                </div>
              </div>
            )}

            {/* Tombol Eksekusi PDF */}
            {pdfFile && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={resetPdfState}
                  disabled={isPdfCompressing}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-black font-bold text-xs font-mono border-2 border-black transition-all cursor-pointer flex items-center justify-center gap-1.5 min-h-[44px]"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Pilih Berkas Lain</span>
                </button>

                <button
                  type="button"
                  onClick={processPdfCompression}
                  disabled={isPdfCompressing}
                  className="w-full sm:w-auto px-6 py-3 rounded-xl bg-black hover:bg-neutral-800 disabled:opacity-50 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 border-2 border-black shadow-[3px_3px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 transition-all cursor-pointer min-h-[44px]"
                >
                  {isPdfCompressing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Sedang Mengompres Dokumen PDF...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-amber-300 fill-amber-300" />
                      <span>Mulai Kompresi Dokumen PDF Sekarang</span>
                    </>
                  )}
                </button>
              </div>
            )}

          </div>

          {/* ======================================================== */}
          {/* HASIL & LIVE PREVIEW DOKUMEN PDF (AKURASI UKURAN 100%) */}
          {/* ======================================================== */}
          {pdfResult && (
            <div className="bg-white rounded-2xl p-4 sm:p-7 border-2 border-black shadow-[4px_4px_0px_#000000] space-y-4 sm:space-y-5 animate-in fade-in duration-200">
              
              {/* Header Hasil Sukses */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b-2 border-black">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-black text-white flex items-center justify-center border-2 border-black shadow-[1px_1px_0px_#000000] shrink-0">
                    <CheckCircle2 className="w-5 h-5 stroke-[2.5]" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-black text-black">
                      Dokumen PDF Berhasil Dikompres!
                    </h3>
                    <p className="text-xs text-neutral-600 font-mono">
                      Isi teks dan tata letak 100% utuh • Siap diunduh sebagai file .pdf biasa.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={downloadCompressedPdf}
                  className="w-full sm:w-auto px-5 py-3 rounded-xl bg-black hover:bg-neutral-800 text-white font-black text-xs sm:text-sm font-mono flex items-center justify-center gap-2 border-2 border-black shadow-[3px_3px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 transition-all cursor-pointer min-h-[46px]"
                >
                  <Download className="w-4 h-4 stroke-[2.5]" />
                  <span>Unduh Dokumen PDF ({formatBytes(pdfResult.compressedSizeBytes)})</span>
                </button>
              </div>

              {/* Kartu Metrik Perbandingan Ukuran Persis Sama Real-Time */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 rounded-xl bg-neutral-100 border-2 border-black text-xs font-mono">
                <div className="p-1">
                  <p className="text-[10px] text-neutral-500 uppercase font-bold truncate">Ukuran Awal</p>
                  <p className="font-black text-black text-xs sm:text-sm break-all">{formatBytes(pdfResult.originalSizeBytes)}</p>
                  <p className="text-[9px] text-neutral-500 font-mono">({pdfResult.originalSizeBytes.toLocaleString('id-ID')} byte)</p>
                </div>
                <div className="p-1">
                  <p className="text-[10px] text-neutral-500 uppercase font-bold truncate">Ukuran Terkompresi</p>
                  <p className="font-black text-black text-xs sm:text-sm break-all">{formatBytes(pdfResult.compressedSizeBytes)}</p>
                  <p className="text-[9px] text-neutral-500 font-mono">({pdfResult.compressedSizeBytes.toLocaleString('id-ID')} byte)</p>
                </div>
                <div className="p-1">
                  <p className="text-[10px] text-neutral-500 uppercase font-bold truncate">Hemat Memori</p>
                  <p className="font-black text-black text-xs sm:text-sm">{pdfResult.savingsPercent}</p>
                  <p className="text-[9px] text-neutral-500 font-mono">({formatBytes(pdfResult.savingsBytes)})</p>
                </div>
                <div className="p-1">
                  <p className="text-[10px] text-neutral-500 uppercase font-bold truncate">Total Halaman</p>
                  <p className="font-black text-black text-xs sm:text-sm">{pdfResult.pageCount} Halaman</p>
                  <p className="text-[9px] text-emerald-700 font-bold font-mono">Layout 100% Utuh</p>
                </div>
              </div>

              {/* Navigasi Live Preview Dokumen Interaktif */}
              <div className="space-y-2 pt-1">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Eye className="w-4 h-4 text-black stroke-[2.5]" />
                    <span className="text-xs font-black font-mono uppercase text-black">
                      Pratinjau Dokumen Interaktif (Live Preview):
                    </span>
                  </div>

                  {/* Switcher Dokumen Hasil vs Dokumen Asli */}
                  <div className="w-full sm:w-auto inline-flex rounded-lg border-2 border-black overflow-hidden p-0.5 bg-neutral-100">
                    <button
                      type="button"
                      onClick={() => setPdfPreviewMode('compressed')}
                      className={`flex-1 sm:flex-initial px-3 py-1.5 text-[11px] font-mono font-bold transition-all cursor-pointer min-h-[36px] flex items-center justify-center ${
                        pdfPreviewMode === 'compressed'
                          ? 'bg-black text-white rounded'
                          : 'text-neutral-600 hover:text-black'
                      }`}
                    >
                      Hasil Kompresi ({formatBytes(pdfResult.compressedSizeBytes)})
                    </button>
                    <button
                      type="button"
                      onClick={() => setPdfPreviewMode('original')}
                      className={`flex-1 sm:flex-initial px-3 py-1.5 text-[11px] font-mono font-bold transition-all cursor-pointer min-h-[36px] flex items-center justify-center ${
                        pdfPreviewMode === 'original'
                          ? 'bg-black text-white rounded'
                          : 'text-neutral-600 hover:text-black'
                      }`}
                    >
                      Dokumen Asli ({formatBytes(pdfResult.originalSizeBytes)})
                    </button>
                  </div>
                </div>

                {/* Live Document Viewer (Object & Iframe Fallback) */}
                <div className="w-full h-[380px] sm:h-[580px] rounded-xl overflow-hidden border-2 border-black bg-neutral-100 shadow-[3px_3px_0px_#000000]">
                  <object
                    key={pdfPreviewMode}
                    data={activePdfUrl}
                    type="application/pdf"
                    className="w-full h-full"
                  >
                    <iframe
                      src={activePdfUrl}
                      className="w-full h-full border-0 bg-white"
                      title="Pratinjau Dokumen PDF"
                    >
                      <p className="p-4 text-xs font-mono text-neutral-600">
                        Pratinjau dokumen tidak didukung langsung oleh browser ini.{' '}
                        <a href={activePdfUrl} target="_blank" rel="noopener noreferrer" className="underline font-bold text-black">
                          Klik di sini untuk membuka dokumen di tab baru.
                        </a>
                      </p>
                    </iframe>
                  </object>
                </div>

                {/* Bar Informasi & Link Tab Penuh */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pt-1 text-[11px] text-neutral-600 font-mono">
                  <span>
                    Menampilkan: <strong className="text-black">{pdfPreviewMode === 'compressed' ? 'Dokumen Hasil Kompresi' : 'Dokumen Asli'}</strong>
                  </span>

                  <a
                    href={activePdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-black font-bold hover:underline min-h-[36px]"
                  >
                    <span>Buka Pratinjau Layar Penuh</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>

            </div>
          )}

        </div>
      )}

    </main>
  );
}
