import React, { useState, useRef, useEffect } from 'react';
import CosmicBackButton from './CosmicBackButton';
import { 
  Sparkles, 
  ArrowLeft, 
  Upload, 
  Sliders, 
  Download, 
  RotateCcw, 
  Eye, 
  Layers, 
  Sun, 
  Contrast, 
  Droplet, 
  Zap, 
  Maximize2,
  Check
} from 'lucide-react';
import { addGalleryItem } from '../services/storageService';

export default function PhotoStudioScreen({ onBack }) {
  const [imageSrc, setImageSrc] = useState(null);
  const [fileName, setFileName] = useState('photo.png');
  
  // Parameter Filter FX
  const [blur, setBlur] = useState(0);
  const [sharpen, setSharpen] = useState(30); // Default HD Crisp
  const [brightness, setBrightness] = useState(105);
  const [contrast, setContrast] = useState(115);
  const [saturation, setSaturation] = useState(110);
  const [warmth, setWarmth] = useState(0);
  const [grayscale, setGrayscale] = useState(0);
  const [sepia, setSepia] = useState(0);
  const [vignette, setVignette] = useState(0);
  const [invert, setInvert] = useState(0);
  const [upscaleFactor, setUpscaleFactor] = useState(1); // 1x, 2x, 4x

  const [isComparing, setIsComparing] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const canvasRef = useRef(null);
  const originalImageRef = useRef(null);

  // Preset Filters Cepat
  const applyPreset = (name) => {
    switch (name) {
      case 'hd_crisp':
        setSharpen(75);
        setContrast(125);
        setBrightness(105);
        setSaturation(115);
        setBlur(0);
        setGrayscale(0);
        setSepia(0);
        setVignette(15);
        break;
      case 'dreamy_blur':
        setBlur(6);
        setBrightness(110);
        setContrast(95);
        setSaturation(120);
        setSharpen(0);
        setVignette(25);
        break;
      case 'cinematic':
        setContrast(135);
        setSaturation(125);
        setWarmth(15);
        setSharpen(50);
        setVignette(40);
        setBlur(0);
        break;
      case 'monochrome':
        setGrayscale(100);
        setContrast(140);
        setSharpen(60);
        setBrightness(100);
        setVignette(30);
        setBlur(0);
        break;
      case 'vintage':
        setSepia(70);
        setContrast(110);
        setBrightness(95);
        setWarmth(25);
        setVignette(35);
        setBlur(0.5);
        break;
      default: // Reset
        setBlur(0);
        setSharpen(0);
        setBrightness(100);
        setContrast(100);
        setSaturation(100);
        setWarmth(0);
        setGrayscale(0);
        setSepia(0);
        setVignette(0);
        setInvert(0);
        break;
    }
  };

  // Pilih foto
  const handleImageFile = (file) => {
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        originalImageRef.current = img;
        setImageSrc(img.src);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    handleImageFile(file);
  };

  // Render Canvas Real-Time saat parameter berubah
  useEffect(() => {
    if (!imageSrc || !canvasRef.current || !originalImageRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = originalImageRef.current;

    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;

    if (isComparing) {
      // Tampilkan foto asli tanpa efek saat tombol Compare ditahan
      ctx.filter = 'none';
      ctx.drawImage(img, 0, 0);
      return;
    }

    // Bangun Filter CSS Canvas
    let filterString = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) grayscale(${grayscale}%) sepia(${sepia}%) invert(${invert}%) blur(${blur}px)`;
    ctx.filter = filterString;
    ctx.drawImage(img, 0, 0);

    // Terapkan Smart Sharpening (Convolution Kernel) jika sharpen > 0
    if (sharpen > 0) {
      try {
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;
        const w = canvas.width;
        const h = canvas.height;
        const factor = (sharpen / 100) * 0.8;

        // Convolution 3x3 Unsharp mask kernel
        // [ 0, -1, 0, -1, 4+c, -1, 0, -1, 0 ]
        const buff = new Uint8ClampedArray(data);
        for (let y = 1; y < h - 1; y++) {
          for (let x = 1; x < w - 1; x++) {
            const idx = (y * w + x) * 4;
            for (let c = 0; c < 3; c++) {
              const val = buff[idx + c] * (1 + 4 * factor)
                - buff[((y - 1) * w + x) * 4 + c] * factor
                - buff[((y + 1) * w + x) * 4 + c] * factor
                - buff[(y * w + (x - 1)) * 4 + c] * factor
                - buff[(y * w + (x + 1)) * 4 + c] * factor;
              data[idx + c] = Math.min(255, Math.max(0, val));
            }
          }
        }
        ctx.putImageData(imgData, 0, 0);
      } catch (err) {
        // Skip convolution jika cross-origin
      }
    }

    // Efek Vignette
    if (vignette > 0) {
      const radius = Math.max(canvas.width, canvas.height) * 0.7;
      const grad = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, radius * 0.4,
        canvas.width / 2, canvas.height / 2, radius
      );
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, `rgba(0,0,0,${vignette / 100})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Efek Warmth (Suhu Warna)
    if (warmth !== 0) {
      ctx.fillStyle = warmth > 0 ? `rgba(255, 140, 0, ${warmth / 250})` : `rgba(0, 150, 255, ${Math.abs(warmth) / 250})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

  }, [imageSrc, blur, sharpen, brightness, contrast, saturation, warmth, grayscale, sepia, vignette, invert, isComparing]);

  // Ekspor & Download Foto HD
  const handleDownload = () => {
    if (!canvasRef.current) return;

    const sourceCanvas = canvasRef.current;
    let exportCanvas = sourceCanvas;

    // Jika user memilih Super Resolution Upscale (2x atau 4x)
    if (upscaleFactor > 1) {
      const scaledCanvas = document.createElement('canvas');
      scaledCanvas.width = sourceCanvas.width * upscaleFactor;
      scaledCanvas.height = sourceCanvas.height * upscaleFactor;
      const sCtx = scaledCanvas.getContext('2d');
      sCtx.imageSmoothingEnabled = true;
      sCtx.imageSmoothingQuality = 'high';
      sCtx.drawImage(sourceCanvas, 0, 0, scaledCanvas.width, scaledCanvas.height);
      exportCanvas = scaledCanvas;
    }

    const dataUrl = exportCanvas.toDataURL('image/png', 1.0);
    const link = document.createElement('a');
    const safeName = fileName.replace(/\.[^/.]+$/, '');
    const outFilename = `${safeName}_HD_${upscaleFactor}x.png`;
    link.download = outFilename;
    link.href = dataUrl;
    link.click();

    // Simpan otomatis ke galeri perangkat
    addGalleryItem({
      title: `${safeName} HD (${upscaleFactor}x)`,
      type: 'image',
      category: 'Photo Studio',
      extension: 'PNG',
      size: `${Math.max(1, Math.round(dataUrl.length * 0.75 / 1024))} KB`,
      previewUrl: dataUrl,
      downloadData: dataUrl,
      filename: outFilename
    });

    setDownloadSuccess(true);
    setTimeout(() => setDownloadSuccess(false), 2500);
  };

  return (
    <main className="flex-grow w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 text-black">
      
      {/* Tombol Navigasi Kembali */}
      <div className="mb-5">
        <CosmicBackButton onClick={onBack} label="Kembali ke Beranda" />
      </div>

      {/* Header Judul Fitur */}
      <div className="rounded-xl p-5 sm:p-6 border-2 border-black bg-white shadow-[4px_4px_0px_#000000] mb-6">
        <div className="flex items-center gap-3 pb-3 border-b-2 border-black">
          <div className="w-10 h-10 rounded-md border-2 border-black bg-black text-white flex items-center justify-center shrink-0">
            <Sliders className="w-5 h-5 stroke-[2.2]" />
          </div>
          <div>
            <h1 className="text-base sm:text-xl font-black tracking-tight font-display text-black">
              Photo Studio & Filter HD
            </h1>
            <p className="text-xs text-neutral-600">
              Sesuaikan ketajaman foto, efek kontras, saturasi warna, dan tingkatkan resolusi gambar dengan kontrol presisi.
            </p>
          </div>
        </div>
      </div>

      {/* Upload Box jika belum ada gambar */}
      {!imageSrc ? (
        <div 
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
          onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) handleImageFile(file);
          }}
          onClick={() => document.getElementById('photo-upload-input').click()}
          className={`w-full p-8 sm:p-12 rounded-xl border-2 border-dashed flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
            isDragging
              ? 'border-black bg-neutral-200 scale-[0.99] shadow-[1px_1px_0px_#000000]'
              : 'border-black bg-white hover:bg-neutral-50 shadow-[3px_3px_0px_#000000]'
          }`}
        >
          <input
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            id="photo-upload-input"
            className="hidden"
          />
          <div className="w-12 h-12 rounded-lg border-2 border-black bg-neutral-100 flex items-center justify-center text-black mb-3 shadow-[2px_2px_0px_#000000]">
            <Upload className="w-6 h-6 stroke-[2]" />
          </div>
          <h3 className="font-extrabold text-sm sm:text-base text-black font-sans mb-1">
            Pilih Foto Untuk Diedit & Ditingkatkan ke HD
          </h3>
          <p className="text-xs text-neutral-600 max-w-sm mb-4">
            Mendukung semua format foto (PNG, JPG, WEBP). Diproses langsung secara aman di peramban Anda.
          </p>
          <button
            type="button"
            className="min-h-[44px] px-5 py-2.5 rounded-lg border-2 border-black bg-black text-white font-bold text-xs shadow-[2px_2px_0px_#000000] hover:bg-neutral-800 cursor-pointer"
          >
            Pilih Foto dari Perangkat
          </button>
        </div>
      ) : (
        /* Workspace Studio Foto */
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Kolom Kiri: Canvas Viewport & Presets */}
          <div className="lg:col-span-8 flex flex-col gap-4">
            
            <div className="w-full rounded-xl border-2 border-black bg-white p-4 shadow-[4px_4px_0px_#000000] flex flex-col items-center justify-center relative overflow-hidden min-h-[340px] sm:min-h-[440px]">
              
              {/* Tombol Bandingkan Asli */}
              <div className="absolute top-3 left-3 z-20 flex items-center gap-2">
                <button
                  type="button"
                  onMouseDown={() => setIsComparing(true)}
                  onMouseUp={() => setIsComparing(false)}
                  onTouchStart={() => setIsComparing(true)}
                  onTouchEnd={() => setIsComparing(false)}
                  className="px-3 py-1.5 rounded-lg border-2 border-black bg-white text-xs font-bold text-black flex items-center gap-1.5 shadow-[1.5px_1.5px_0px_#000000] cursor-pointer select-none"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>{isComparing ? 'Melihat Asli' : 'Tahan: Lihat Asli'}</span>
                </button>
              </div>

              {/* Status info resolusi */}
              <div className="absolute top-3 right-3 z-20 px-2.5 py-1 rounded border-2 border-black bg-neutral-100 text-[11px] font-mono font-bold text-black shadow-[1.5px_1.5px_0px_#000000]">
                {originalImageRef.current?.naturalWidth} × {originalImageRef.current?.naturalHeight} px
              </div>

              {/* Canvas Render Element */}
              <canvas
                ref={canvasRef}
                className="max-w-full max-h-[480px] object-contain rounded-lg border border-black shadow-[2px_2px_0px_#000000] transition-all"
              />

            </div>

            {/* Presets Bar */}
            <div className="w-full rounded-xl border-2 border-black bg-white p-3.5 shadow-[3px_3px_0px_#000000] flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-black px-1 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" />
                <span>Preset Filter:</span>
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {[
                  { id: 'hd_crisp', label: 'HD Tajam' },
                  { id: 'cinematic', label: 'Sinematik' },
                  { id: 'dreamy_blur', label: 'Lembut' },
                  { id: 'monochrome', label: 'Hitam-Putih' },
                  { id: 'vintage', label: 'Klasik' },
                  { id: 'reset', label: 'Reset', isReset: true }
                ].map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPreset(preset.id)}
                    className={`px-3 py-1.5 rounded-lg border border-black text-xs font-bold cursor-pointer transition-all ${
                      preset.isReset 
                        ? 'bg-neutral-100 hover:bg-neutral-200 text-black flex items-center gap-1' 
                        : 'bg-white hover:bg-black hover:text-white text-black'
                    }`}
                  >
                    {preset.isReset && <RotateCcw className="w-3 h-3" />}
                    <span>{preset.label}</span>
                  </button>
                ))}
              </div>
            </div>

          </div>

          {/* Kolom Kanan: Panel Kontrol Slider Efek */}
          <div className="lg:col-span-4 rounded-xl border-2 border-black bg-white p-5 shadow-[4px_4px_0px_#000000] space-y-4">
            
            <div className="flex items-center justify-between pb-3 border-b-2 border-black">
              <h3 className="text-sm font-extrabold text-black flex items-center gap-2 font-sans">
                <Sliders className="w-4 h-4" />
                <span>Pengaturan Efek</span>
              </h3>
              <label htmlFor="change-photo-input" className="text-xs font-bold text-black underline cursor-pointer">
                Ganti Foto
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                id="change-photo-input"
                className="hidden"
              />
            </div>

            {/* 1. Ketajaman HD (Sharpen) */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-bold text-black">
                <span className="flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5" /> Ketajaman HD
                </span>
                <span className="font-mono">{sharpen}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={sharpen}
                onChange={(e) => setSharpen(Number(e.target.value))}
                className="w-full accent-black cursor-pointer"
              />
            </div>

            {/* 2. Efek Blur */}
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
                max="25"
                step="0.5"
                value={blur}
                onChange={(e) => setBlur(Number(e.target.value))}
                className="w-full accent-black cursor-pointer"
              />
            </div>

            {/* 3. Kecerahan (Brightness) */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-bold text-black">
                <span className="flex items-center gap-1.5">
                  <Sun className="w-3.5 h-3.5" /> Kecerahan
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

            {/* 4. Kontras (Contrast) */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-bold text-black">
                <span className="flex items-center gap-1.5">
                  <Contrast className="w-3.5 h-3.5" /> Kontras
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

            {/* 5. Saturasi Warna */}
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

            {/* 6. Vignette Sinematik */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-bold text-black">
                <span>Vignette Tepi</span>
                <span className="font-mono">{vignette}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={vignette}
                onChange={(e) => setVignette(Number(e.target.value))}
                className="w-full accent-black cursor-pointer"
              />
            </div>

            {/* 7. Suhu Warna (Warmth) */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-bold text-black">
                <span>Suhu Warna</span>
                <span className="font-mono">{warmth > 0 ? `+${warmth}` : warmth}</span>
              </div>
              <input
                type="range"
                min="-50"
                max="50"
                value={warmth}
                onChange={(e) => setWarmth(Number(e.target.value))}
                className="w-full accent-black cursor-pointer"
              />
            </div>

            {/* Pilihan Resolusi Ekspor */}
            <div className="pt-3 border-t-2 border-black space-y-2">
              <span className="text-xs font-bold text-black flex items-center gap-1.5">
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Resolusi Unduh:</span>
              </span>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { factor: 1, label: 'Asli 1x' },
                  { factor: 2, label: 'HD 2x' },
                  { factor: 4, label: 'Super 4x' }
                ].map((item) => (
                  <button
                    key={item.factor}
                    type="button"
                    onClick={() => setUpscaleFactor(item.factor)}
                    className={`py-1.5 rounded-lg text-xs font-bold border-2 border-black transition-all cursor-pointer ${
                      upscaleFactor === item.factor
                        ? 'bg-black text-white shadow-[1.5px_1.5px_0px_#000000]'
                        : 'bg-white text-black hover:bg-neutral-100'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tombol Download Foto HD */}
            <button
              type="button"
              onClick={handleDownload}
              className="w-full min-h-[44px] py-3 rounded-lg border-2 border-black bg-black text-white font-extrabold text-xs sm:text-sm shadow-[3px_3px_0px_#000000] hover:bg-neutral-800 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all flex items-center justify-center gap-2 cursor-pointer mt-2"
            >
              {downloadSuccess ? (
                <>
                  <Check className="w-4 h-4 text-white stroke-[3]" />
                  <span>Foto Berhasil Diunduh!</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 stroke-[2.5]" />
                  <span>Unduh Foto HD ({upscaleFactor}x)</span>
                </>
              )}
            </button>

          </div>

        </div>
      )}

    </main>
  );
}
