import React, { useState, useRef, useEffect } from 'react';
import CosmicBackButton from './CosmicBackButton';
import { addGalleryItem } from '../services/storageService';
import { 
  Scissors, 
  ArrowLeft, 
  Upload, 
  Download, 
  Sliders, 
  Palette, 
  Check, 
  Pipette, 
  Image as ImageIcon,
  CheckCircle2,
  RotateCcw,
  Sparkles,
  Paintbrush,
  Eraser,
  Undo2
} from 'lucide-react';

export default function BgRemoverScreen({ onBack }) {
  const [imageSrc, setImageSrc] = useState(null);
  const [fileName, setFileName] = useState('photo.png');
  const [isDragging, setIsDragging] = useState(false);
  
  // Pengaturan Hapus Background
  const [tolerance, setTolerance] = useState(28); // 5% - 80%
  const [feather, setFeather] = useState(1);
  const [keyColor, setKeyColor] = useState({ r: 255, g: 255, b: 255 }); // default putih untuk logo/dokumen
  const [invertMask, setInvertMask] = useState(false);
  const [isPickingColor, setIsPickingColor] = useState(false);
  const [mode, setMode] = useState('border'); // 'border' (flood fill dari tepi) | 'global' (seluruh warna)

  // Alat Kuas Manual (Pulihkan Objek / Hapus Sisa Latar)
  const [brushMode, setBrushMode] = useState('none'); // 'none' | 'restore' | 'erase'
  const [brushSize, setBrushSize] = useState(28); // 5px - 100px
  const [isBrushing, setIsBrushing] = useState(false);
  const [brushHistory, setBrushHistory] = useState([]);
  const [maskVersion, setMaskVersion] = useState(0);
  const manualMaskRef = useRef(null);

  // Pengaturan Background Pengganti
  const [bgType, setBgType] = useState('transparent'); // 'transparent' | 'color' | 'custom_img'
  const [solidColor, setSolidColor] = useState('#dc2626'); // default merah pas foto resmi
  const [customBgImg, setCustomBgImg] = useState(null);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  const canvasRef = useRef(null);
  const originalImgRef = useRef(null);

  // Proses file gambar (Digunakan untuk file picker & drag and drop)
  const processImageFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        originalImgRef.current = img;
        setImageSrc(img.src);

        // Reset manual mask
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = img.naturalWidth;
        maskCanvas.height = img.naturalHeight;
        manualMaskRef.current = maskCanvas;
        setBrushHistory([]);
        setMaskVersion(v => v + 1);

        detectDominantBorderColor(img);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  // Upload Foto Utama
  const handleUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) processImageFile(file);
  };

  // Upload Foto Background Pengganti (Dipastikan ter-load sebelum digambar)
  const handleCustomBgUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const bgImg = new Image();
      bgImg.onload = () => {
        setCustomBgImg(bgImg);
        setBgType('custom_img');
      };
      bgImg.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  // Deteksi warna latar dominan dengan menganalisis sampel piksel di sekeliling 4 sisi tepi gambar
  const detectDominantBorderColor = (img) => {
    const off = document.createElement('canvas');
    const w = Math.min(img.naturalWidth, 400);
    const h = Math.min(img.naturalHeight, 400);
    off.width = w;
    off.height = h;
    const ctx = off.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);

    const imgData = ctx.getImageData(0, 0, w, h).data;
    let rSum = 0, gSum = 0, bSum = 0, count = 0;

    // Sample sepanjang border atas & bawah
    for (let x = 0; x < w; x += 4) {
      // Top edge
      let idx = (0 * w + x) * 4;
      if (imgData[idx + 3] > 20) {
        rSum += imgData[idx];
        gSum += imgData[idx + 1];
        bSum += imgData[idx + 2];
        count++;
      }
      // Bottom edge
      idx = ((h - 1) * w + x) * 4;
      if (imgData[idx + 3] > 20) {
        rSum += imgData[idx];
        gSum += imgData[idx + 1];
        bSum += imgData[idx + 2];
        count++;
      }
    }

    // Sample sepanjang border kiri & kanan
    for (let y = 0; y < h; y += 4) {
      let idx = (y * w + 0) * 4;
      if (imgData[idx + 3] > 20) {
        rSum += imgData[idx];
        gSum += imgData[idx + 1];
        bSum += imgData[idx + 2];
        count++;
      }
      idx = (y * w + (w - 1)) * 4;
      if (imgData[idx + 3] > 20) {
        rSum += imgData[idx];
        gSum += imgData[idx + 1];
        bSum += imgData[idx + 2];
        count++;
      }
    }

    if (count > 0) {
      setKeyColor({
        r: Math.round(rSum / count),
        g: Math.round(gSum / count),
        b: Math.round(bSum / count)
      });
    } else {
      setKeyColor({ r: 255, g: 255, b: 255 });
    }
  };

  // Algoritma Segmentasi & Render Canvas Real-time
  useEffect(() => {
    if (!imageSrc || !canvasRef.current || !originalImgRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = originalImgRef.current;

    const width = img.naturalWidth;
    const height = img.naturalHeight;
    canvas.width = width;
    canvas.height = height;

    // 1. Gambar Background Baru terlebih dahulu (jika bukan transparan)
    if (bgType === 'color') {
      ctx.fillStyle = solidColor;
      ctx.fillRect(0, 0, width, height);
    } else if (bgType === 'custom_img' && customBgImg) {
      // Cover fit latar belakang agar proporsional dan tidak gepeng
      const bgRatio = customBgImg.width / customBgImg.height;
      const canvasRatio = width / height;
      let drawW, drawH, drawX, drawY;

      if (canvasRatio > bgRatio) {
        drawW = width;
        drawH = width / bgRatio;
        drawX = 0;
        drawY = (height - drawH) / 2;
      } else {
        drawH = height;
        drawW = height * bgRatio;
        drawX = (width - drawW) / 2;
        drawY = 0;
      }
      ctx.drawImage(customBgImg, drawX, drawY, drawW, drawH);
    } else {
      ctx.clearRect(0, 0, width, height);
    }

    // 2. Buat buffer untuk memotong subjek
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(img, 0, 0);

    const imgData = tempCtx.getImageData(0, 0, width, height);
    const data = imgData.data;

    const targetColor = keyColor || { r: 255, g: 255, b: 255 };
    const maxDist = 441.67; // sqrt(255^2 * 3)
    const threshold = (tolerance / 100) * maxDist;

    // Helper cek kecocokan warna dengan background
    const isBgColor = (idx) => {
      const a = data[idx + 3];
      if (a < 20) return true; // sudah transparan
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const dist = Math.sqrt(
        (r - targetColor.r) ** 2 +
        (g - targetColor.g) ** 2 +
        (b - targetColor.b) ** 2
      );
      return dist <= threshold;
    };

    if (mode === 'border') {
      // ─── ALGORITMA FLOOD FILL TEPI (BFS) ───
      // Ini menyelesaikan masalah logo sekolah / foto: hanya menghapus background yang terhubung ke tepi luar!
      const isMarkedBg = new Uint8Array(width * height);
      const queue = [];

      // Masukkan semua pixel di sepanjang 4 sisi tepi ke dalam antrian
      for (let x = 0; x < width; x++) {
        // Tepi atas
        const topIdx = (0 * width + x);
        if (!isMarkedBg[topIdx] && isBgColor(topIdx * 4)) {
          isMarkedBg[topIdx] = 1;
          queue.push(topIdx);
        }
        // Tepi bawah
        const botIdx = ((height - 1) * width + x);
        if (!isMarkedBg[botIdx] && isBgColor(botIdx * 4)) {
          isMarkedBg[botIdx] = 1;
          queue.push(botIdx);
        }
      }

      for (let y = 0; y < height; y++) {
        // Tepi kiri
        const leftIdx = (y * width + 0);
        if (!isMarkedBg[leftIdx] && isBgColor(leftIdx * 4)) {
          isMarkedBg[leftIdx] = 1;
          queue.push(leftIdx);
        }
        // Tepi kanan
        const rightIdx = (y * width + (width - 1));
        if (!isMarkedBg[rightIdx] && isBgColor(rightIdx * 4)) {
          isMarkedBg[rightIdx] = 1;
          queue.push(rightIdx);
        }
      }

      // BFS traverse tetangga (4-arah)
      let head = 0;
      while (head < queue.length) {
        const curr = queue[head++];
        const cx = curr % width;
        const cy = Math.floor(curr / width);

        const neighbors = [
          cy > 0 ? (cy - 1) * width + cx : -1,
          cy < height - 1 ? (cy + 1) * width + cx : -1,
          cx > 0 ? cy * width + (cx - 1) : -1,
          cx < width - 1 ? cy * width + (cx + 1) : -1
        ];

        for (const n of neighbors) {
          if (n !== -1 && !isMarkedBg[n]) {
            if (isBgColor(n * 4)) {
              isMarkedBg[n] = 1;
              queue.push(n);
            }
          }
        }
      }

      // Terapkan transparansi berdasarkan hasil flood fill
      for (let i = 0; i < width * height; i++) {
        const pIdx = i * 4;
        const isBg = isMarkedBg[i] === 1;

        if (invertMask ? !isBg : isBg) {
          data[pIdx + 3] = 0; // Transparan
        }
      }

    } else {
      // Mode Global: Hapus seluruh warna target di mana saja
      for (let i = 0; i < data.length; i += 4) {
        const match = isBgColor(i);
        if (invertMask ? !match : match) {
          data[i + 3] = 0;
        }
      }
    }

    // 2.5 Terapkan Kuas Manual Pengguna (Pulihkan Objek / Hapus Sisa Latar)
    if (manualMaskRef.current) {
      const maskCtx = manualMaskRef.current.getContext('2d');
      const maskData = maskCtx.getImageData(0, 0, width, height).data;
      const origCanvas = document.createElement('canvas');
      origCanvas.width = width;
      origCanvas.height = height;
      const origCtx = origCanvas.getContext('2d');
      origCtx.drawImage(img, 0, 0);
      const origData = origCtx.getImageData(0, 0, width, height).data;

      for (let i = 0; i < width * height; i++) {
        const pIdx = i * 4;
        const maskAlpha = maskData[pIdx + 3];
        if (maskAlpha > 0) {
          const isRestore = maskData[pIdx] > 100; // Red channel > 100 menandakan Kuas Pemulih
          if (isRestore) {
            // Pulihkan kembali piksel dari foto asli (seperti gagang pedang/objek yang tidak sengaja terpotong)
            data[pIdx] = origData[pIdx];
            data[pIdx + 1] = origData[pIdx + 1];
            data[pIdx + 2] = origData[pIdx + 2];
            data[pIdx + 3] = origData[pIdx + 3];
          } else {
            // Kuas Penghapus: bersihkan piksel sisa latar yang bandel
            data[pIdx + 3] = 0;
          }
        }
      }
    }

    tempCtx.putImageData(imgData, 0, 0);

    // 3. Gambar subjek yang sudah bersih di atas canvas
    ctx.drawImage(tempCanvas, 0, 0);

  }, [imageSrc, tolerance, feather, keyColor, invertMask, mode, bgType, solidColor, customBgImg, maskVersion]);

  // Transformasi koordinat mouse/touch ke piksel canvas
  const getCanvasCoords = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: Math.floor((clientX - rect.left) * scaleX),
      y: Math.floor((clientY - rect.top) * scaleY)
    };
  };

  // Terapkan sapuan kuas pada mask
  const applyBrushPoint = (x, y) => {
    if (!manualMaskRef.current || brushMode === 'none') return;
    const maskCtx = manualMaskRef.current.getContext('2d');
    maskCtx.beginPath();
    maskCtx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
    // Restore: Red 255 | Erase: Black 0
    maskCtx.fillStyle = brushMode === 'restore' ? 'rgb(255, 0, 0)' : 'rgb(0, 0, 0)';
    maskCtx.fill();
    setMaskVersion(v => v + 1);
  };

  const handleBrushStart = (e) => {
    if (brushMode === 'none' || isPickingColor) return;
    const coords = getCanvasCoords(e);
    if (!coords) return;
    setIsBrushing(true);

    // Simpan snapshot untuk riwayat Undo
    if (manualMaskRef.current) {
      const maskCtx = manualMaskRef.current.getContext('2d');
      const snap = maskCtx.getImageData(0, 0, manualMaskRef.current.width, manualMaskRef.current.height);
      setBrushHistory(prev => [...prev.slice(-10), snap]);
    }

    applyBrushPoint(coords.x, coords.y);
  };

  const handleBrushMove = (e) => {
    if (!isBrushing || brushMode === 'none') return;
    const coords = getCanvasCoords(e);
    if (!coords) return;
    applyBrushPoint(coords.x, coords.y);
  };

  const handleBrushEnd = () => {
    setIsBrushing(false);
  };

  const handleUndoBrush = () => {
    if (!manualMaskRef.current || brushHistory.length === 0) return;
    const prevSnap = brushHistory[brushHistory.length - 1];
    setBrushHistory(prev => prev.slice(0, -1));
    const maskCtx = manualMaskRef.current.getContext('2d');
    maskCtx.putImageData(prevSnap, 0, 0);
    setMaskVersion(v => v + 1);
  };

  const handleResetBrush = () => {
    if (!manualMaskRef.current) return;
    const maskCtx = manualMaskRef.current.getContext('2d');
    maskCtx.clearRect(0, 0, manualMaskRef.current.width, manualMaskRef.current.height);
    setBrushHistory([]);
    setMaskVersion(v => v + 1);
  };

  // Klik Pipet Warna
  const handleCanvasClick = (e) => {
    if (!isPickingColor || !canvasRef.current || !originalImgRef.current) return;
    const coords = getCanvasCoords(e);
    if (!coords) return;

    const off = document.createElement('canvas');
    off.width = canvasRef.current.width;
    off.height = canvasRef.current.height;
    const ctx = off.getContext('2d');
    ctx.drawImage(originalImgRef.current, 0, 0);
    const pixel = ctx.getImageData(coords.x, coords.y, 1, 1).data;

    setKeyColor({ r: pixel[0], g: pixel[1], b: pixel[2] });
    setIsPickingColor(false);
  };

  // Unduh Hasil PNG HD & Simpan ke Galeri
  const handleDownload = () => {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL('image/png', 1.0);
    const safeName = fileName.replace(/\.[^/.]+$/, '');
    const filename = `${safeName}_clean_bg.png`;

    const link = document.createElement('a');
    link.download = filename;
    link.href = dataUrl;
    link.click();

    // Otomatis simpan ke galeri perangkat
    addGalleryItem({
      title: `${safeName} (Clean BG)`,
      type: 'image',
      category: 'Hapus Background',
      extension: 'PNG',
      size: 'HD PNG',
      previewUrl: dataUrl,
      downloadData: dataUrl,
      filename
    });

    setDownloadSuccess(true);
    setTimeout(() => setDownloadSuccess(false), 2500);
  };

  return (
    <main className="flex-grow relative z-10 flex flex-col items-center justify-start px-4 sm:px-6 md:px-margin-desktop py-6 sm:py-8 w-full max-w-5xl mx-auto">
      
      {/* Tombol Navigasi Kembali */}
      <div className="w-full flex items-center justify-between mb-4">
        <CosmicBackButton onClick={onBack} label="Kembali ke Beranda" />
      </div>

      {/* Header Judul Fitur */}
      <div className="text-center mb-6 max-w-xl">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded border-2 border-black bg-neutral-100 text-black text-xs font-mono font-bold uppercase tracking-wider mb-2">
          <Scissors className="w-3.5 h-3.5" />
          <span>Hapus Background & Pas Foto</span>
        </div>
        <h1 className="text-xl sm:text-3xl font-black text-black mb-1.5 font-display tracking-tight">
          Remove Background Foto & Logo
        </h1>
        <p className="text-xs sm:text-sm text-neutral-600">
          Hapus latar belakang putih pada logo atau foto formal, ganti warna latar pas foto merah/biru, atau ganti latar dengan foto baru secara instan.
        </p>
      </div>

      {/* Upload Box jika belum ada gambar */}
      {!imageSrc ? (
        <div 
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const file = e.dataTransfer?.files?.[0];
            if (file) processImageFile(file);
          }}
          className={`w-full max-w-xl rounded-xl p-8 sm:p-10 flex flex-col items-center justify-center text-center border-2 border-dashed transition-all duration-150 ${
            isDragging 
              ? 'border-black bg-neutral-100 shadow-[6px_6px_0px_#000000] scale-[1.01]' 
              : 'border-black bg-white shadow-[4px_4px_0px_#000000]'
          }`}
        >
          <input
            type="file"
            accept="image/*"
            onChange={handleUpload}
            id="bg-upload-input"
            className="hidden"
          />
          <label htmlFor="bg-upload-input" className="cursor-pointer flex flex-col items-center">
            <div className={`w-14 h-14 rounded-lg border-2 border-black flex items-center justify-center text-black mb-3 transition-colors ${
              isDragging ? 'bg-black text-white' : 'bg-neutral-100'
            }`}>
              <Upload className="w-7 h-7 stroke-[2.2]" />
            </div>
            <h3 className="text-base sm:text-lg font-extrabold text-black mb-1 font-sans">
              {isDragging ? 'Lepaskan Foto di Sini' : 'Pilih atau Geser (Drag & Drop) Foto'}
            </h3>
            <p className="text-xs text-neutral-600 max-w-sm mb-4">
              Tarik foto langsung dari file manager PC, atau klik tombol untuk memilih logo sekolah, foto produk, dan pas foto.
            </p>
            <span className="px-5 py-2.5 rounded-lg border-2 border-black bg-black text-white hover:bg-neutral-800 font-bold text-xs shadow-[2px_2px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all">
              Pilih File Gambar
            </span>
          </label>
        </div>
      ) : (
        /* Workspace Studio */
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          
          {/* Viewport Canvas */}
          <div className="lg:col-span-8 flex flex-col items-center gap-3">
            
            <div className={`w-full rounded-2xl p-4 flex flex-col items-center justify-center relative overflow-hidden min-h-[360px] sm:min-h-[440px] border border-black/10 dark:border-white/10 ${
              bgType === 'transparent' ? 'bg-checkerboard' : 'bg-slate-900'
            }`}>
              {/* Petunjuk Pipet Warna */}
              {isPickingColor && (
                <div className="absolute top-4 inset-x-4 z-20 p-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-xl animate-pulse">
                  <Pipette className="w-4 h-4" />
                  <span>Klik bagian latar yang ingin dihapus pada gambar di bawah!</span>
                </div>
              )}

              {/* Petunjuk Kuas Aktif */}
              {brushMode !== 'none' && !isPickingColor && (
                <div className={`absolute top-4 inset-x-4 z-20 p-2.5 rounded-xl text-white text-xs font-bold flex items-center justify-center gap-2 shadow-xl ${
                  brushMode === 'restore' ? 'bg-emerald-600' : 'bg-rose-600'
                }`}>
                  <Paintbrush className="w-4 h-4" />
                  <span>
                    {brushMode === 'restore' 
                      ? 'Sapukan kuas pada bagian objek asli (misal gagang pedang) yang ingin dipulihkan!'
                      : 'Sapukan kuas pada sisa background yang ingin dihapus bersih!'}
                  </span>
                </div>
              )}

              <canvas
                ref={canvasRef}
                onClick={handleCanvasClick}
                onMouseDown={handleBrushStart}
                onMouseMove={handleBrushMove}
                onMouseUp={handleBrushEnd}
                onMouseLeave={handleBrushEnd}
                onTouchStart={handleBrushStart}
                onTouchMove={handleBrushMove}
                onTouchEnd={handleBrushEnd}
                className={`max-w-full max-h-[460px] object-contain rounded-xl shadow-xl transition-all ${
                  isPickingColor 
                    ? 'cursor-crosshair ring-2 ring-emerald-400' 
                    : brushMode === 'restore'
                    ? 'cursor-crosshair ring-2 ring-emerald-500'
                    : brushMode === 'erase'
                    ? 'cursor-crosshair ring-2 ring-rose-500'
                    : ''
                }`}
              />
            </div>

            {/* Panel Alat Kuas Manual (Pulihkan Objek & Hapus Sisa Latar) */}
            <div className="w-full rounded-xl p-3 sm:p-4 border-2 border-black bg-white shadow-[3px_3px_0px_#000000] flex flex-col gap-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-1.5 font-extrabold text-xs text-black">
                  <Paintbrush className="w-4 h-4 stroke-[2.5]" />
                  <span>Alat Kuas (Perbaiki Bagian Objek):</span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleUndoBrush}
                    disabled={brushHistory.length === 0}
                    className="px-2.5 py-1 rounded border border-black bg-neutral-100 hover:bg-neutral-200 disabled:opacity-40 text-black text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer shadow-xs"
                    title="Urungkan sapuan kuas terakhir"
                  >
                    <Undo2 className="w-3 h-3 stroke-[2.5]" />
                    <span>Undo</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleResetBrush}
                    className="px-2.5 py-1 rounded border border-black bg-neutral-100 hover:bg-neutral-200 text-black text-[11px] font-bold transition-all cursor-pointer shadow-xs"
                    title="Kembalikan ke potongan AI semula"
                  >
                    Reset Kuas
                  </button>
                </div>
              </div>

              {/* Mode Kuas: Nonaktif / Pulihkan / Hapus */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setBrushMode('none')}
                  className={`py-2 px-2 rounded-lg border-2 border-black text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    brushMode === 'none'
                      ? 'bg-black text-white shadow-[2px_2px_0px_#000000]'
                      : 'bg-white text-black hover:bg-neutral-100'
                  }`}
                >
                  <span>Nonaktif</span>
                </button>

                <button
                  type="button"
                  onClick={() => setBrushMode('restore')}
                  className={`py-2 px-2 rounded-lg border-2 border-black text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    brushMode === 'restore'
                      ? 'bg-emerald-600 text-white shadow-[2px_2px_0px_#000000]'
                      : 'bg-white text-emerald-700 hover:bg-emerald-50'
                  }`}
                  title="Sapukan kuas untuk mengembalikan objek asli yang terpotong (misal gagang pedang)"
                >
                  <Paintbrush className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Kuas Pulihkan</span>
                </button>

                <button
                  type="button"
                  onClick={() => setBrushMode('erase')}
                  className={`py-2 px-2 rounded-lg border-2 border-black text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    brushMode === 'erase'
                      ? 'bg-rose-600 text-white shadow-[2px_2px_0px_#000000]'
                      : 'bg-white text-rose-700 hover:bg-rose-50'
                  }`}
                  title="Sapukan kuas untuk menghapus noda atau sisa background yang belum bersih"
                >
                  <Eraser className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Kuas Hapus</span>
                </button>
              </div>

              {/* Slider Ukuran Kuas */}
              {brushMode !== 'none' && (
                <div className="flex items-center gap-3 pt-2 border-t border-neutral-200">
                  <span className="text-[11px] font-bold text-neutral-700 whitespace-nowrap">
                    Ukuran Kuas ({brushSize}px):
                  </span>
                  <input
                    type="range"
                    min="5"
                    max="100"
                    value={brushSize}
                    onChange={(e) => setBrushSize(parseInt(e.target.value, 10))}
                    className="flex-1 accent-black cursor-pointer"
                  />
                  <div 
                    className="w-6 h-6 rounded-full border border-black bg-neutral-200 flex items-center justify-center shrink-0"
                    title={`Ukuran: ${brushSize}px`}
                  >
                    <span 
                      className="rounded-full bg-black block" 
                      style={{ width: `${Math.max(3, Math.min(18, brushSize / 4))}px`, height: `${Math.max(3, Math.min(18, brushSize / 4))}px` }} 
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Status Bar Pipet & Ukuran */}
            <div className="w-full rounded-xl p-3 flex items-center justify-between flex-wrap gap-2 text-xs border border-black/10 dark:border-white/10 bg-white dark:bg-[#12151f]">
              <div className="flex items-center gap-2">
                <span className="text-slate-500 dark:text-slate-400">Target Warna:</span>
                <span 
                  className="w-5 h-5 rounded-md border border-black/20 shadow-xs inline-block"
                  style={{ backgroundColor: `rgb(${keyColor.r}, ${keyColor.g}, ${keyColor.b})` }}
                />
                <button
                  onClick={() => setIsPickingColor(!isPickingColor)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
                    isPickingColor 
                      ? 'bg-emerald-600 text-white' 
                      : 'bg-slate-100 dark:bg-white/10 text-slate-800 dark:text-slate-200'
                  }`}
                >
                  <Pipette className="w-3.5 h-3.5" />
                  <span>{isPickingColor ? 'Batal' : 'Pilih Warna (Pipet)'}</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                {/* Tombol Invert Mask */}
                <button
                  onClick={() => setInvertMask(!invertMask)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                    invertMask
                      ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                      : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300'
                  }`}
                  title="Balikkan area yang dihapus"
                >
                  <RotateCcw className="w-3.5 h-3.5 inline mr-1" />
                  <span>Balik Masker ({invertMask ? 'Aktif' : 'Normal'})</span>
                </button>

                <span className="text-[11px] font-mono text-slate-400">
                  {originalImgRef.current?.naturalWidth} × {originalImgRef.current?.naturalHeight}
                </span>
              </div>
            </div>

          </div>

          {/* Kolom Kontrol Pengaturan */}
          <div className="lg:col-span-4 rounded-2xl p-5 shadow-lg space-y-4 border border-black/10 dark:border-white/10 bg-white dark:bg-[#12151f]">
            
            <div className="flex items-center justify-between pb-2.5 border-b border-black/10 dark:border-white/10">
              <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-emerald-400" />
                <span>Pengaturan Hapus</span>
              </h3>
              <label htmlFor="change-bg-photo" className="text-xs text-emerald-500 hover:underline cursor-pointer font-semibold">
                Ganti Foto
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handleUpload}
                id="change-bg-photo"
                className="hidden"
              />
            </div>

            {/* Mode Pembersihan: Tepi (Rekomendasi Logo) vs Global */}
            <div>
              <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Metode Penghapusan:
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setMode('border')}
                  className={`py-1.5 px-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    mode === 'border'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400'
                  }`}
                  title="Hapus latar belakang luar saja (logo di dalam tetap aman)"
                >
                  Tepi Luar (Logo Aman)
                </button>
                <button
                  onClick={() => setMode('global')}
                  className={`py-1.5 px-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    mode === 'global'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400'
                  }`}
                  title="Hapus warna target di seluruh bagian gambar"
                >
                  Seluruh Gambar
                </button>
              </div>
            </div>

            {/* Toleransi Warna */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="font-semibold text-slate-700 dark:text-slate-300">Toleransi Warna</span>
                <span className="font-mono text-emerald-500 font-bold">{tolerance}%</span>
              </div>
              <input
                type="range"
                min="5"
                max="80"
                value={tolerance}
                onChange={(e) => setTolerance(Number(e.target.value))}
                className="w-full accent-emerald-500 cursor-pointer"
              />
            </div>

            {/* Pilihan Latar Belakang Baru */}
            <div className="pt-2 border-t border-black/10 dark:border-white/10 space-y-2.5">
              <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5 text-cyan-400" />
                <span>Pilih Latar Belakang Baru:</span>
              </span>

              {/* Tipe Latar: Transparan / Warna / Kustom */}
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  onClick={() => setBgType('transparent')}
                  className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    bgType === 'transparent'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Transparan
                </button>

                <button
                  onClick={() => setBgType('color')}
                  className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    bgType === 'color'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Warna Solid
                </button>

                <button
                  onClick={() => setBgType('custom_img')}
                  className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    bgType === 'custom_img'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Ganti Foto
                </button>
              </div>

              {/* Preset Warna Pas Foto Resmi */}
              {bgType === 'color' && (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-black/30 border border-black/5 dark:border-white/5 space-y-2 animate-fadeIn">
                  <span className="text-[11px] font-semibold text-slate-500">Preset Pas Foto Resmi:</span>
                  <div className="flex items-center gap-2">
                    {[
                      { color: '#dc2626', name: 'Merah (Ijazah/KTP)' },
                      { color: '#2563eb', name: 'Biru (Kedinasan)' },
                      { color: '#ffffff', name: 'Putih (Formal)' },
                      { color: '#0f172a', name: 'Hitam Studio' }
                    ].map((item) => (
                      <button
                        key={item.color}
                        onClick={() => setSolidColor(item.color)}
                        title={item.name}
                        className={`w-7 h-7 rounded-full border-2 transition-all cursor-pointer ${
                          solidColor === item.color ? 'border-emerald-400 scale-110 shadow-md' : 'border-black/20'
                        }`}
                        style={{ backgroundColor: item.color }}
                      />
                    ))}

                    <div className="flex items-center gap-1 ml-auto">
                      <span className="text-[10px] text-slate-400">Kustom:</span>
                      <input
                        type="color"
                        value={solidColor}
                        onChange={(e) => setSolidColor(e.target.value)}
                        className="w-7 h-7 rounded-md cursor-pointer border-0 bg-transparent"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Upload Foto Latar Pengganti */}
              {bgType === 'custom_img' && (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-black/30 border border-black/5 dark:border-white/5 space-y-2 animate-fadeIn">
                  <label htmlFor="custom-bg-input" className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold text-center flex items-center justify-center gap-2 cursor-pointer shadow-sm">
                    <ImageIcon className="w-4 h-4" />
                    <span>{customBgImg ? 'Ganti Foto Latar Lain' : 'Pilih Foto Latar Pengganti'}</span>
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleCustomBgUpload}
                    id="custom-bg-input"
                    className="hidden"
                  />
                  {customBgImg && (
                    <p className="text-[11px] text-emerald-500 text-center font-semibold">
                      ✓ Foto latar berhasil diterapkan rapi
                    </p>
                  )}
                </div>
              )}

            </div>

            {/* Tombol Unduh */}
            <button
              onClick={handleDownload}
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
            >
              {downloadSuccess ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Foto Berhasil Diunduh!</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Download Hasil ({bgType === 'transparent' ? 'PNG Transparan' : 'Pas Foto HD'})</span>
                </>
              )}
            </button>

          </div>

        </div>
      )}

    </main>
  );
}
