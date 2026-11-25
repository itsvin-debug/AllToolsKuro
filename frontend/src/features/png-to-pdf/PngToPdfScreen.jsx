import React, { useState, useRef } from 'react';
import CosmicBackButton from '../../shared/components/CosmicBackButton';
import { jsPDF } from 'jspdf';
import { addGalleryItem } from '../../shared/utils/storageService';
import { downloadBlob } from '../../shared/utils/fileDownload';
import { 
  Images, 
  Upload, 
  Trash2, 
  ArrowLeft, 
  ArrowRight, 
  FileDown, 
  AlignLeft, 
  AlignCenter, 
  AlignRight, 
  AlignJustify,
  Bold, 
  Italic, 
  Underline,
  Strikethrough,
  Check, 
  AlertCircle, 
  Loader2, 
  FileText, 
  X,
  Eye,
  Sliders,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Smartphone,
  CheckSquare,
  Square,
  Layers,
  Sparkles,
  List,
  ListOrdered,
  Indent,
  Outdent,
  Type,
  Eraser,
  Highlighter,
  Palette,
  Superscript
} from 'lucide-react';
import { translations } from '../../shared/utils/translations';

export default function PngToPdfScreen({ onBack, onShowToast, lang = 'id' }) {
  const isEn = lang === 'en';
  const t = translations[lang] || translations.id;
  const pt = t.pngToPdf || translations.id.pngToPdf;

  const [images, setImages] = useState([]);
  const [docTitle, setDocTitle] = useState('Kuro_Dokumen');
  const [pageOrientation, setPageOrientation] = useState('p'); // 'p' (Portrait) | 'l' (Landscape)
  const [pageMargin, setPageMargin] = useState(15); // mm: 10, 15, 20
  const [showPageNumbers, setShowPageNumbers] = useState(true);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [showMarginGuide, setShowMarginGuide] = useState(true);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState('');
  const [error, setError] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);

  // Modal download & file naming
  const [showNameModal, setShowNameModal] = useState(false);
  const [pdfDownloadName, setPdfDownloadName] = useState('Kuro_Dokumen');
  const [downloadSuccessToast, setDownloadSuccessToast] = useState('');

  const fileInputRef = useRef(null);

  // Format berkas foto yang diunggah
  const handleFiles = (files) => {
    if (!files || files.length === 0) return;
    setError('');

    const validFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (validFiles.length === 0) {
      setError(isEn ? 'Only image files (PNG, JPG, JPEG, WEBP) are supported.' : 'Hanya berkas gambar (PNG, JPG, JPEG, WEBP) yang didukung.');
      return;
    }

    const newEntries = [];
    let loadedCount = 0;

    validFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const previewUrl = e.target.result;
        const img = new Image();
        img.onload = () => {
          newEntries.push({
            id: `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            file,
            previewUrl,
            width: img.naturalWidth || 800,
            height: img.naturalHeight || 600,
            name: file.name,
            sizeKb: Math.round(file.size / 1024),
            
            // TATA LETAK FOTO & HALAMAN
            photoScale: 'fit', // 'fit' | 'fill' | 'compact'
            photoAlign: 'center', // 'center' | 'left' | 'right'
            photoBorder: 'none', // 'none' | 'thin' | 'brutal'
            photoGap: 8, // mm
            textPosition: 'below', // 'below' | 'above'

            // TOOLBAR TIPOGRAFI WORD / DOCS
            text: '',
            fontFamily: 'times', // 'times' (Times New Roman), 'helvetica' (Arial/Sans), 'courier' (Courier New)
            fontSize: 16, // pt
            isBold: false,
            isItalic: false,
            isUnderline: false,
            isStrike: false,
            isSuperscript: false,
            textColor: '#000000',
            highlightColor: 'transparent',
            textAlign: 'left', // 'left', 'center', 'right', 'justify'
            lineHeight: 1.35, // 1.0, 1.15, 1.35, 1.5, 2.0
            headingStyle: 'normal' // 'normal', 'h1', 'h2', 'h3', 'title'
          });

          loadedCount++;
          if (loadedCount === validFiles.length) {
            setImages(prev => [...prev, ...newEntries]);
          }
        };
        img.onerror = () => {
          loadedCount++;
          if (loadedCount === validFiles.length) {
            setImages(prev => [...prev, ...newEntries]);
          }
        };
        img.src = previewUrl;
      };
      reader.readAsDataURL(file);
    });
  };

  const onFileInputChange = (e) => {
    handleFiles(e.target.files);
    e.target.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const removeImage = (id) => {
    setImages(prev => {
      const filtered = prev.filter(img => img.id !== id);
      if (activePageIndex >= filtered.length) {
        setActivePageIndex(Math.max(0, filtered.length - 1));
      }
      return filtered;
    });
  };

  const moveImage = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= images.length) return;
    const clone = [...images];
    const temp = clone[index];
    clone[index] = clone[target];
    clone[target] = temp;
    setImages(clone);
    setActivePageIndex(target);
  };

  const updateActivePageField = (field, value) => {
    if (!images[activePageIndex]) return;
    const pageId = images[activePageIndex].id;
    setImages(prev => prev.map(img => img.id === pageId ? { ...img, [field]: value } : img));
  };

  // Quick Font Size Steppers (A+ and A-)
  const changeFontSize = (delta) => {
    const current = images[activePageIndex]?.fontSize || 16;
    const next = Math.min(48, Math.max(8, current + delta));
    updateActivePageField('fontSize', next);
  };

  // Quick Change Case (Aa)
  const toggleCase = () => {
    const currentText = images[activePageIndex]?.text || '';
    if (!currentText) return;
    if (currentText === currentText.toUpperCase()) {
      updateActivePageField('text', currentText.toLowerCase());
    } else if (currentText === currentText.toLowerCase()) {
      // Capitalize Words
      updateActivePageField('text', currentText.replace(/\b\w/g, l => l.toUpperCase()));
    } else {
      updateActivePageField('text', currentText.toUpperCase());
    }
  };

  // Clear Formatting
  const clearFormatting = () => {
    if (!images[activePageIndex]) return;
    const pageId = images[activePageIndex].id;
    setImages(prev => prev.map(img => img.id === pageId ? {
      ...img,
      fontSize: 14,
      fontFamily: 'times',
      isBold: false,
      isItalic: false,
      isUnderline: false,
      isStrike: false,
      isSuperscript: false,
      textColor: '#000000',
      highlightColor: 'transparent',
      textAlign: 'left',
      headingStyle: 'normal'
    } : img));
  };

  // Quick Heading Preset Styles
  const applyHeadingStyle = (style) => {
    if (!images[activePageIndex]) return;
    const presets = {
      normal: { fontSize: 14, isBold: false, isItalic: false, headingStyle: 'normal' },
      h1: { fontSize: 24, isBold: true, isItalic: false, headingStyle: 'h1' },
      h2: { fontSize: 20, isBold: true, isItalic: false, headingStyle: 'h2' },
      h3: { fontSize: 16, isBold: true, isItalic: false, headingStyle: 'h3' },
      title: { fontSize: 28, isBold: true, isItalic: false, headingStyle: 'title' }
    };
    const chosen = presets[style] || presets.normal;
    setImages(prev => prev.map((img, idx) => idx === activePageIndex ? { ...img, ...chosen } : img));
  };

  // Insert Bullet / Numbered list
  const insertListPrefix = (prefixType) => {
    const current = images[activePageIndex]?.text || '';
    const lines = current.split('\n');
    const updatedLines = lines.map((line, idx) => {
      const cleanLine = line.replace(/^([•\-\*]|\d+\.)\s*/, '');
      if (prefixType === 'bullet') {
        return `• ${cleanLine}`;
      } else if (prefixType === 'number') {
        return `${idx + 1}. ${cleanLine}`;
      }
      return cleanLine;
    });
    updateActivePageField('text', updatedLines.join('\n'));
  };

  // Terapkan ke semua halaman
  const applySettingsToAllPages = () => {
    if (images.length === 0) return;
    const src = images[activePageIndex];
    setImages(prev => prev.map(item => ({
      ...item,
      photoScale: src.photoScale,
      photoAlign: src.photoAlign,
      photoBorder: src.photoBorder,
      photoGap: src.photoGap,
      textPosition: src.textPosition,
      fontFamily: src.fontFamily,
      fontSize: src.fontSize,
      isBold: src.isBold,
      isItalic: src.isItalic,
      isUnderline: src.isUnderline,
      textAlign: src.textAlign,
      lineHeight: src.lineHeight
    })));
    setDownloadSuccessToast(isEn ? 'Typography & layout style applied to all pages!' : 'Gaya tata letak & font berhasil diterapkan ke semua halaman!');
    setTimeout(() => setDownloadSuccessToast(''), 3000);
  };

  // Ekspor Dokumen PDF dengan jsPDF
  const processAndDownloadPdf = async (customName) => {
    if (images.length === 0) {
      setError(isEn ? 'Please upload at least 1 image to create a PDF.' : 'Unggah minimal 1 gambar untuk membuat dokumen PDF.');
      return;
    }

    setIsGenerating(true);
    setGenerationProgress(isEn ? 'Preparing PDF document layout...' : 'Menyiapkan tata letak dokumen PDF...');
    setError('');

    try {
      const doc = new jsPDF({
        orientation: pageOrientation,
        unit: 'mm',
        format: 'a4',
        compress: true
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = Number(pageMargin);
      const contentWidth = pageWidth - (margin * 2);
      const footerReserve = showPageNumbers ? 10 : 0;
      const contentHeight = pageHeight - (margin * 2) - footerReserve;

      for (let i = 0; i < images.length; i++) {
        setGenerationProgress(isEn ? `Rendering page ${i + 1} of ${images.length}...` : `Merender halaman ${i + 1} dari ${images.length}...`);
        if (i > 0) {
          doc.addPage('a4', pageOrientation);
        }

        const item = images[i];
        const hasText = Boolean(item.text && item.text.trim());
        const fontStyle = item.isBold && item.isItalic ? 'bolditalic' : item.isBold ? 'bold' : item.isItalic ? 'italic' : 'normal';
        const gapMm = Number(item.photoGap || 8);

        let textLines = [];
        let textBlockHeight = 0;
        let lineHeightMm = 0;

        if (hasText) {
          doc.setFont(item.fontFamily === 'times' ? 'times' : item.fontFamily === 'courier' ? 'courier' : 'helvetica', fontStyle);
          doc.setFontSize(item.fontSize);
          textLines = doc.splitTextToSize(item.text.trim(), contentWidth);
          lineHeightMm = (item.fontSize * 0.3527) * (item.lineHeight || 1.35);
          textBlockHeight = (textLines.length * lineHeightMm);
        }

        const availableImgHeight = Math.max(10, contentHeight - (hasText ? textBlockHeight + gapMm : 0));
        const imgAspect = item.width / item.height;

        let renderImgWidth = contentWidth;
        let renderImgHeight = renderImgWidth / imgAspect;

        if (item.photoScale === 'compact') {
          renderImgWidth = contentWidth * 0.70;
          renderImgHeight = renderImgWidth / imgAspect;
        }

        if (renderImgHeight > availableImgHeight) {
          renderImgHeight = availableImgHeight;
          renderImgWidth = renderImgHeight * imgAspect;
        }

        if (renderImgWidth > contentWidth) {
          renderImgWidth = contentWidth;
          renderImgHeight = renderImgWidth / imgAspect;
        }

        let imgX = margin;
        if (item.photoAlign === 'center') {
          imgX = margin + ((contentWidth - renderImgWidth) / 2);
        } else if (item.photoAlign === 'right') {
          imgX = margin + (contentWidth - renderImgWidth);
        }

        let imgY = margin;
        let textY = margin;

        if (hasText) {
          const totalBlockHeight = renderImgHeight + gapMm + textBlockHeight;
          const startY = margin + Math.max(0, (contentHeight - totalBlockHeight) / 2);

          if (item.textPosition === 'above') {
            textY = startY + (item.fontSize * 0.3527);
            imgY = startY + textBlockHeight + gapMm;
          } else {
            imgY = startY;
            textY = startY + renderImgHeight + gapMm + (item.fontSize * 0.3527);
          }

          doc.setFont(item.fontFamily === 'times' ? 'times' : item.fontFamily === 'courier' ? 'courier' : 'helvetica', fontStyle);
          doc.setFontSize(item.fontSize);
          doc.setTextColor(0, 0, 0);

          let textAnchorX = margin;
          if (item.textAlign === 'center') {
            textAnchorX = margin + (contentWidth / 2);
          } else if (item.textAlign === 'right') {
            textAnchorX = margin + contentWidth;
          }

          doc.text(textLines, textAnchorX, textY, { 
            align: item.textAlign === 'justify' ? 'left' : item.textAlign,
            lineHeightFactor: item.lineHeight || 1.35 
          });
        } else {
          imgY = margin + Math.max(0, (contentHeight - renderImgHeight) / 2);
        }

        // Cetak foto
        try {
          doc.addImage(
            item.previewUrl,
            'JPEG',
            imgX,
            imgY,
            renderImgWidth,
            renderImgHeight,
            undefined,
            'FAST'
          );
        } catch {
          doc.addImage(
            item.previewUrl,
            imgX,
            imgY,
            renderImgWidth,
            renderImgHeight
          );
        }

        // Cetak nomor halaman di footer jika aktif
        if (showPageNumbers) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);
          doc.setTextColor(120, 120, 120);
          doc.text(
            `${i + 1} / ${images.length}`,
            pageWidth / 2,
            pageHeight - 6,
            { align: 'center' }
          );
        }
      }

      const finalFileName = `${(customName || docTitle).trim().replace(/\s+/g, '_')}.pdf`;
      const pdfBlob = doc.output('blob');
      const dlRes = downloadBlob(pdfBlob, finalFileName);

      // Simpan Data URI aman jika <= 2 MB agar unduh ulang di Galeri tetap valid setelah halaman dimuat ulang
      let galleryDataUri = null;
      if (pdfBlob.size <= 2 * 1024 * 1024) {
        try {
          galleryDataUri = doc.output('datauristring');
        } catch {}
      }

      addGalleryItem({
        title: customName || docTitle,
        type: 'document',
        category: 'PNG to PDF',
        extension: 'PDF',
        size: `${Math.max(1, Math.round(pdfBlob.size / 1024))} KB`,
        previewUrl: images[0]?.previewUrl || null,
        downloadData: galleryDataUri,
        filename: dlRes.filename
      });

      setShowNameModal(false);
      const okMsg = isEn ? `PDF exported successfully: ${dlRes.filename}` : `PDF berhasil diekspor: ${dlRes.filename}`;
      setDownloadSuccessToast(okMsg);
      onShowToast?.(okMsg, 'success');
      setTimeout(() => setDownloadSuccessToast(''), 4000);

    } catch (err) {
      setError(err.message || (isEn ? 'Failed to compile PDF document.' : 'Gagal menyusun dokumen PDF.'));
    } finally {
      setIsGenerating(false);
      setGenerationProgress('');
    }
  };

  const activePage = images[activePageIndex] || null;

  return (
    <main className="flex-grow flex flex-col items-center justify-start px-3 sm:px-6 py-6 sm:py-8 max-w-5xl mx-auto w-full">
      <div className="w-full flex flex-col gap-5">
        
        {/* Header Navigasi & Info */}
        <div className="w-full flex items-center justify-between">
          <CosmicBackButton onClick={onBack} label={t.nav.backToHome} />

          <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded border-2 border-black bg-neutral-100 text-black uppercase">
            {pt.badge}
          </span>
        </div>

        {/* Banner Judul Fitur */}
        <div className="w-full border-b-2 border-black pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-3xl font-black text-black tracking-tight font-display uppercase">
              {pt.title}
            </h1>
            <p className="text-xs sm:text-sm text-neutral-600 mt-0.5 leading-relaxed">
              {pt.subtitle}
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3.5 py-2 rounded-lg border-2 border-black bg-white hover:bg-neutral-100 text-black font-extrabold text-xs flex items-center gap-1.5 shadow-[2px_2px_0px_#000000] cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{pt.addPhotos}</span>
            </button>

            {images.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setPdfDownloadName(docTitle.trim() || 'Kuro_Dokumen');
                  setShowNameModal(true);
                }}
                disabled={isGenerating}
                className="px-4 py-2 rounded-lg border-2 border-black bg-black text-white hover:bg-neutral-800 disabled:opacity-50 font-extrabold text-xs flex items-center gap-1.5 shadow-[2px_2px_0px_#000000] cursor-pointer"
              >
                <FileDown className="w-3.5 h-3.5" />
                <span>{isGenerating ? pt.generatingPdf : pt.generatePdfBtn}</span>
              </button>
            )}
          </div>
        </div>

        {/* Toast Notifikasi Feedback */}
        {downloadSuccessToast && (
          <div className="p-3.5 rounded-lg border-2 border-black bg-neutral-100 text-black font-bold text-xs flex items-center gap-2 shadow-[2px_2px_0px_#000000]">
            <Check className="w-4 h-4 stroke-[3]" />
            <span>{downloadSuccessToast}</span>
          </div>
        )}

        {/* Input File Tersembunyi */}
        <input 
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          onChange={onFileInputChange}
          className="hidden"
        />

        {/* Area Drag & Drop Saat Kosong */}
        {images.length === 0 && (
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`w-full p-10 sm:p-14 rounded-xl border-2 border-dashed border-black flex flex-col items-center justify-center text-center cursor-pointer transition-all bg-white shadow-[3px_3px_0px_#000000] ${
              isDragOver ? 'bg-neutral-100 scale-[0.99]' : 'hover:bg-neutral-50'
            }`}
          >
            <div className="w-14 h-14 rounded-xl border-2 border-black bg-neutral-100 flex items-center justify-center text-black mb-3 shadow-[2px_2px_0px_#000000]">
              <Upload className="w-7 h-7 stroke-[2]" />
            </div>
            <h2 className="font-black text-base sm:text-lg text-black font-display uppercase">
              {isEn ? 'Drop or Select Images to Start Document' : 'Tarik atau Pilih Foto untuk Mulai Membuat Dokumen'}
            </h2>
            <p className="text-xs text-neutral-600 max-w-md mt-1">
              {isEn 
                ? 'Combine multiple pictures into an organized Word/Docs layout with typography, alignment, and instant PDF download.' 
                : 'Satukan banyak gambar menjadi dokumen terstruktur ala Word/Docs dengan tipografi, perataan, dan ekspor instan PDF.'}
            </p>
          </div>
        )}

        {/* ─── WORKSPACE DOKUMEN: TOOLBAR WORD / DOCS & PAPER CANVAS ─── */}
        {images.length > 0 && activePage && (
          <div className="w-full flex flex-col gap-4">
            
            {/* 1. DOCUMENT TOP BAR (FILE NAME & PAGE CONTROLS) */}
            <div className="w-full rounded-xl border-2 border-black bg-white p-3 shadow-[2px_2px_0px_#000000] flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                <input
                  type="text"
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  placeholder="Kuro_Dokumen"
                  className="px-2 py-1 rounded border border-black font-bold text-xs sm:text-sm bg-neutral-50 focus:bg-white outline-none"
                />
                <span className="text-xs font-mono font-bold text-neutral-500">.pdf</span>
              </div>

              {/* Page Navigator */}
              <div className="flex items-center gap-1.5 font-mono text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setActivePageIndex(prev => Math.max(0, prev - 1))}
                  disabled={activePageIndex === 0}
                  className="w-7 h-7 rounded border border-black bg-white hover:bg-neutral-100 disabled:opacity-30 flex items-center justify-center cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span>{pt.previewPage} {activePageIndex + 1} / {images.length}</span>
                <button
                  type="button"
                  onClick={() => setActivePageIndex(prev => Math.min(images.length - 1, prev + 1))}
                  disabled={activePageIndex === images.length - 1}
                  className="w-7 h-7 rounded border border-black bg-white hover:bg-neutral-100 disabled:opacity-30 flex items-center justify-center cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Quick Paper Settings */}
              <div className="flex items-center gap-2">
                <select
                  value={pageOrientation}
                  onChange={(e) => setPageOrientation(e.target.value)}
                  className="px-2 py-1 rounded border border-black text-xs font-bold bg-white cursor-pointer"
                >
                  <option value="p">{pt.orientationPortrait}</option>
                  <option value="l">{pt.orientationLandscape}</option>
                </select>

                <select
                  value={pageMargin}
                  onChange={(e) => setPageMargin(Number(e.target.value))}
                  className="px-2 py-1 rounded border border-black text-xs font-bold bg-white cursor-pointer"
                >
                  <option value={10}>{pt.marginNarrow} (10mm)</option>
                  <option value={15}>{pt.marginNormal} (15mm)</option>
                  <option value={20}>{pt.marginWide} (20mm)</option>
                </select>

                <button
                  type="button"
                  onClick={applySettingsToAllPages}
                  className="px-2.5 py-1 rounded border border-black bg-neutral-100 hover:bg-neutral-200 text-[11px] font-bold cursor-pointer"
                  title="Terapkan font dan layout halaman ini ke semua halaman"
                >
                  {isEn ? 'Apply All' : 'Salin ke Semua'}
                </button>
              </div>
            </div>

            {/* 2. TOOLBAR TIPOGRAFI WORD / DOCS (SESUAI FOTO 1) */}
            <div className="w-full rounded-xl border-2 border-black bg-neutral-100 p-2 sm:p-2.5 shadow-[3px_3px_0px_#000000] flex flex-wrap items-center gap-1.5 select-none overflow-x-auto">
              
              {/* Cluster 1: Font Family Selector */}
              <select
                value={activePage.fontFamily}
                onChange={(e) => updateActivePageField('fontFamily', e.target.value)}
                className="px-2 py-1.5 rounded-lg border-2 border-black bg-white font-bold text-xs cursor-pointer shadow-[1px_1px_0px_#000000]"
                title={pt.toolbarFont}
              >
                <option value="times">Times New Roman</option>
                <option value="helvetica">Arial (Helvetica)</option>
                <option value="courier">Courier New</option>
              </select>

              {/* Cluster 2: Font Size & A+ / A- */}
              <div className="flex items-center rounded-lg border-2 border-black bg-white shadow-[1px_1px_0px_#000000] overflow-hidden">
                <select
                  value={activePage.fontSize}
                  onChange={(e) => updateActivePageField('fontSize', Number(e.target.value))}
                  className="px-2 py-1.5 text-xs font-bold font-mono bg-transparent outline-none cursor-pointer"
                  title={pt.toolbarSize}
                >
                  {[10, 12, 14, 16, 18, 20, 24, 28, 32, 40].map(sz => (
                    <option key={sz} value={sz}>{sz}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => changeFontSize(2)}
                  className="px-1.5 py-1 border-l border-black hover:bg-neutral-100 text-xs font-black cursor-pointer"
                  title="Perbesar Ukuran Font (A+)"
                >
                  A+
                </button>
                <button
                  type="button"
                  onClick={() => changeFontSize(-2)}
                  className="px-1.5 py-1 border-l border-black hover:bg-neutral-100 text-xs font-black cursor-pointer"
                  title="Perkecil Ukuran Font (A-)"
                >
                  A-
                </button>
              </div>

              {/* Cluster 3: Case & Clear Formatting */}
              <button
                type="button"
                onClick={toggleCase}
                className="w-8 h-8 rounded-lg border-2 border-black bg-white hover:bg-neutral-100 flex items-center justify-center text-xs font-black shadow-[1px_1px_0px_#000000] cursor-pointer"
                title={pt.toolbarCase}
              >
                Aa
              </button>

              <button
                type="button"
                onClick={clearFormatting}
                className="w-8 h-8 rounded-lg border-2 border-black bg-white hover:bg-neutral-100 flex items-center justify-center text-xs shadow-[1px_1px_0px_#000000] cursor-pointer"
                title="Hapus Pemformatan"
              >
                <Eraser className="w-4 h-4" />
              </button>

              {/* Separator Divider */}
              <div className="w-[1px] h-6 bg-neutral-400 mx-0.5" />

              {/* Cluster 4: Bold, Italic, Underline, Strike */}
              <button
                type="button"
                onClick={() => updateActivePageField('isBold', !activePage.isBold)}
                className={`w-8 h-8 rounded-lg border-2 border-black flex items-center justify-center text-xs font-bold shadow-[1px_1px_0px_#000000] cursor-pointer ${
                  activePage.isBold ? 'bg-black text-white' : 'bg-white text-black hover:bg-neutral-100'
                }`}
                title={pt.toolbarBold}
              >
                <Bold className="w-3.5 h-3.5 stroke-[2.8]" />
              </button>

              <button
                type="button"
                onClick={() => updateActivePageField('isItalic', !activePage.isItalic)}
                className={`w-8 h-8 rounded-lg border-2 border-black flex items-center justify-center text-xs font-bold shadow-[1px_1px_0px_#000000] cursor-pointer ${
                  activePage.isItalic ? 'bg-black text-white' : 'bg-white text-black hover:bg-neutral-100'
                }`}
                title={pt.toolbarItalic}
              >
                <Italic className="w-3.5 h-3.5 stroke-[2.8]" />
              </button>

              <button
                type="button"
                onClick={() => updateActivePageField('isUnderline', !activePage.isUnderline)}
                className={`w-8 h-8 rounded-lg border-2 border-black flex items-center justify-center text-xs font-bold shadow-[1px_1px_0px_#000000] cursor-pointer ${
                  activePage.isUnderline ? 'bg-black text-white' : 'bg-white text-black hover:bg-neutral-100'
                }`}
                title={pt.toolbarUnderline}
              >
                <Underline className="w-3.5 h-3.5 stroke-[2.8]" />
              </button>

              <button
                type="button"
                onClick={() => updateActivePageField('isStrike', !activePage.isStrike)}
                className={`w-8 h-8 rounded-lg border-2 border-black flex items-center justify-center text-xs font-bold shadow-[1px_1px_0px_#000000] cursor-pointer ${
                  activePage.isStrike ? 'bg-black text-white' : 'bg-white text-black hover:bg-neutral-100'
                }`}
                title={pt.toolbarStrike}
              >
                <Strikethrough className="w-3.5 h-3.5 stroke-[2.8]" />
              </button>

              {/* Separator Divider */}
              <div className="w-[1px] h-6 bg-neutral-400 mx-0.5" />

              {/* Cluster 5: Alignment */}
              <div className="flex items-center rounded-lg border-2 border-black bg-white shadow-[1px_1px_0px_#000000] overflow-hidden">
                {[
                  { id: 'left', icon: AlignLeft, label: pt.toolbarAlignLeft },
                  { id: 'center', icon: AlignCenter, label: pt.toolbarAlignCenter },
                  { id: 'right', icon: AlignRight, label: pt.toolbarAlignRight },
                  { id: 'justify', icon: AlignJustify, label: pt.toolbarJustify }
                ].map(item => {
                  const Icon = item.icon;
                  const isSelected = activePage.textAlign === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => updateActivePageField('textAlign', item.id)}
                      className={`w-7 h-7 flex items-center justify-center cursor-pointer transition-colors ${
                        isSelected ? 'bg-black text-white' : 'hover:bg-neutral-100 text-black'
                      }`}
                      title={item.label}
                    >
                      <Icon className="w-3.5 h-3.5 stroke-[2.5]" />
                    </button>
                  );
                })}
              </div>

              {/* Cluster 6: Bullets & Numbering */}
              <button
                type="button"
                onClick={() => insertListPrefix('bullet')}
                className="w-8 h-8 rounded-lg border-2 border-black bg-white hover:bg-neutral-100 flex items-center justify-center text-xs shadow-[1px_1px_0px_#000000] cursor-pointer"
                title={pt.toolbarBullet}
              >
                <List className="w-4 h-4 stroke-[2.5]" />
              </button>

              <button
                type="button"
                onClick={() => insertListPrefix('number')}
                className="w-8 h-8 rounded-lg border-2 border-black bg-white hover:bg-neutral-100 flex items-center justify-center text-xs shadow-[1px_1px_0px_#000000] cursor-pointer"
                title={pt.toolbarNumber}
              >
                <ListOrdered className="w-4 h-4 stroke-[2.5]" />
              </button>

              {/* Separator Divider */}
              <div className="w-[1px] h-6 bg-neutral-400 mx-0.5" />

              {/* Cluster 7: Quick Heading Presets */}
              <div className="flex items-center gap-1">
                {[
                  { id: 'normal', label: pt.styleNormal },
                  { id: 'h1', label: pt.styleHeading1 },
                  { id: 'h2', label: pt.styleHeading2 }
                ].map(h => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => applyHeadingStyle(h.id)}
                    className={`px-2 py-1 rounded-lg border-2 border-black text-xs font-bold transition-all cursor-pointer shadow-[1px_1px_0px_#000000] ${
                      activePage.headingStyle === h.id ? 'bg-black text-white' : 'bg-white text-black hover:bg-neutral-100'
                    }`}
                  >
                    {h.label}
                  </button>
                ))}
              </div>

            </div>

            {/* 3. WORD / DOCS CANVAS (LEMBAR KERTAS PUTIH REALISTIS) */}
            <div className="w-full flex flex-col items-center justify-center bg-neutral-200 p-4 sm:p-8 rounded-xl border-2 border-black shadow-[3px_3px_0px_#000000] overflow-x-auto">
              
              <div 
                className={`bg-white border border-neutral-300 shadow-[0px_4px_24px_rgba(0,0,0,0.18)] transition-all flex flex-col justify-between ${
                  pageOrientation === 'l'
                    ? 'w-full max-w-[840px] min-h-[580px]'
                    : 'w-full max-w-[620px] min-h-[820px]'
                }`}
                style={{
                  padding: `${pageMargin}mm`,
                  fontFamily: activePage.fontFamily === 'times' ? 'Times New Roman, serif' : activePage.fontFamily === 'courier' ? 'Courier New, monospace' : 'Arial, sans-serif'
                }}
              >
                {/* Content Area Inside Paper */}
                <div className="flex-1 flex flex-col gap-4">
                  
                  {/* Text Before Photo (Jika posisi teks di atas) */}
                  {activePage.textPosition === 'above' && (
                    <textarea
                      value={activePage.text}
                      onChange={(e) => updateActivePageField('text', e.target.value)}
                      placeholder={pt.textPlaceholder}
                      rows={4}
                      className="w-full bg-transparent resize-y outline-none border-b border-dashed border-neutral-300 focus:border-black p-2 transition-colors"
                      style={{
                        fontSize: `${activePage.fontSize}pt`,
                        fontWeight: activePage.isBold ? 'bold' : 'normal',
                        fontStyle: activePage.isItalic ? 'italic' : 'normal',
                        textDecoration: [
                          activePage.isUnderline ? 'underline' : '',
                          activePage.isStrike ? 'line-through' : ''
                        ].filter(Boolean).join(' ') || 'none',
                        textAlign: activePage.textAlign
                      }}
                    />
                  )}

                  {/* Photo Container */}
                  <div 
                    className="flex flex-col"
                    style={{
                      alignItems: activePage.photoAlign === 'center' ? 'center' : activePage.photoAlign === 'right' ? 'flex-end' : 'flex-start'
                    }}
                  >
                    <div 
                      className={`relative group rounded overflow-hidden ${
                        activePage.photoScale === 'compact' ? 'w-[70%]' : 'w-full'
                      }`}
                    >
                      <img
                        src={activePage.previewUrl}
                        alt={activePage.name}
                        className={`w-full max-h-[460px] object-contain rounded transition-all ${
                          activePage.photoBorder === 'brutal' ? 'border-2 border-black' : activePage.photoBorder === 'thin' ? 'border border-neutral-300' : ''
                        }`}
                      />
                    </div>
                  </div>

                  {/* Text After Photo (Jika posisi teks di bawah) */}
                  {activePage.textPosition === 'below' && (
                    <textarea
                      value={activePage.text}
                      onChange={(e) => updateActivePageField('text', e.target.value)}
                      placeholder={pt.textPlaceholder}
                      rows={5}
                      className="w-full bg-transparent resize-y outline-none border-t border-dashed border-neutral-300 focus:border-black p-2 transition-colors"
                      style={{
                        fontSize: `${activePage.fontSize}pt`,
                        fontWeight: activePage.isBold ? 'bold' : 'normal',
                        fontStyle: activePage.isItalic ? 'italic' : 'normal',
                        textDecoration: [
                          activePage.isUnderline ? 'underline' : '',
                          activePage.isStrike ? 'line-through' : ''
                        ].filter(Boolean).join(' ') || 'none',
                        textAlign: activePage.textAlign
                      }}
                    />
                  )}

                </div>

                {/* Footer Lembar Kertas */}
                {showPageNumbers && (
                  <div className="pt-4 border-t border-neutral-200 text-center font-sans text-xs text-neutral-400">
                    {activePageIndex + 1} / {images.length}
                  </div>
                )}

              </div>

            </div>

            {/* 4. PENGATURAN TATA LETAK FOTO HALAMAN INI */}
            <div className="w-full rounded-xl border-2 border-black bg-white p-4 shadow-[3px_3px_0px_#000000] flex flex-wrap items-center justify-between gap-3 text-xs">
              
              <div className="flex flex-wrap items-center gap-3">
                {/* Ukuran Foto */}
                <div className="flex items-center gap-1.5">
                  <span className="font-bold">{isEn ? 'Photo Scale:' : 'Skala Foto:'}</span>
                  <select
                    value={activePage.photoScale}
                    onChange={(e) => updateActivePageField('photoScale', e.target.value)}
                    className="p-1 rounded border border-black font-semibold bg-neutral-50"
                  >
                    <option value="fit">{isEn ? 'Fit Page (100%)' : 'Pas Halaman (100%)'}</option>
                    <option value="compact">{isEn ? 'Compact (70%)' : 'Kompak (70%)'}</option>
                  </select>
                </div>

                {/* Posisi Teks Relatif */}
                <div className="flex items-center gap-1.5">
                  <span className="font-bold">{isEn ? 'Text Position:' : 'Posisi Teks:'}</span>
                  <select
                    value={activePage.textPosition}
                    onChange={(e) => updateActivePageField('textPosition', e.target.value)}
                    className="p-1 rounded border border-black font-semibold bg-neutral-50"
                  >
                    <option value="below">{isEn ? 'Below Photo' : 'Di Bawah Foto'}</option>
                    <option value="above">{isEn ? 'Above Photo' : 'Di Atas Foto'}</option>
                  </select>
                </div>

                {/* Perataan Foto */}
                <div className="flex items-center gap-1.5">
                  <span className="font-bold">{isEn ? 'Photo Align:' : 'Posisi Foto:'}</span>
                  <select
                    value={activePage.photoAlign}
                    onChange={(e) => updateActivePageField('photoAlign', e.target.value)}
                    className="p-1 rounded border border-black font-semibold bg-neutral-50"
                  >
                    <option value="center">{isEn ? 'Center' : 'Tengah'}</option>
                    <option value="left">{isEn ? 'Left' : 'Kiri'}</option>
                    <option value="right">{isEn ? 'Right' : 'Kanan'}</option>
                  </select>
                </div>
              </div>

              {/* Hapus & Urutan Halaman */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => moveImage(activePageIndex, -1)}
                  disabled={activePageIndex === 0}
                  className="px-2 py-1 rounded border border-black bg-white hover:bg-neutral-100 disabled:opacity-30 font-bold"
                >
                  {isEn ? 'Move Page Up' : 'Naikkan Halaman'}
                </button>
                <button
                  type="button"
                  onClick={() => moveImage(activePageIndex, 1)}
                  disabled={activePageIndex === images.length - 1}
                  className="px-2 py-1 rounded border border-black bg-white hover:bg-neutral-100 disabled:opacity-30 font-bold"
                >
                  {isEn ? 'Move Page Down' : 'Turunkan Halaman'}
                </button>
                <button
                  type="button"
                  onClick={() => removeImage(activePage.id)}
                  className="px-2 py-1 rounded border border-black bg-red-50 text-red-600 hover:bg-red-100 font-bold flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isEn ? 'Delete Page' : 'Hapus Halaman'}</span>
                </button>
              </div>

            </div>

          </div>
        )}

      </div>

      {/* ─── MODAL KONFIRMASI NAMA BERKAS UNDUHAN ─── */}
      {showNameModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl border-2 border-black bg-white p-5 sm:p-6 shadow-[5px_5px_0px_#000000] flex flex-col gap-4 animate-in fade-in">
            <div className="flex items-center justify-between border-b-2 border-black pb-3">
              <h3 className="font-black text-base sm:text-lg text-black font-display uppercase">
                {pt.downloadModalTitle}
              </h3>
              <button
                type="button"
                onClick={() => setShowNameModal(false)}
                className="p-1 hover:bg-neutral-100 rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-neutral-600">
              {pt.downloadModalDesc}
            </p>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-black font-mono">
                {pt.fileNameLabel}:
              </label>
              <div className="flex items-center">
                <input
                  type="text"
                  value={pdfDownloadName}
                  onChange={(e) => setPdfDownloadName(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-l-lg border-2 border-black bg-white text-xs font-bold outline-none"
                  autoFocus
                />
                <span className="px-3 py-2 border-2 border-l-0 border-black bg-neutral-100 text-xs font-mono font-bold">
                  .pdf
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t-2 border-black">
              <button
                type="button"
                onClick={() => setShowNameModal(false)}
                className="px-4 py-2 rounded-lg border-2 border-black bg-white hover:bg-neutral-100 text-xs font-bold cursor-pointer"
              >
                {t.identity.adminCancel}
              </button>
              <button
                type="button"
                onClick={() => processAndDownloadPdf(pdfDownloadName)}
                disabled={isGenerating}
                className="px-5 py-2 rounded-lg border-2 border-black bg-black text-white hover:bg-neutral-800 disabled:opacity-50 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shadow-[2px_2px_0px_#000000]"
              >
                <FileDown className="w-4 h-4" />
                <span>{isGenerating ? pt.generatingPdf : pt.confirmDownloadBtn}</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
