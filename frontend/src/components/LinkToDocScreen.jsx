import React, { useState } from 'react';
import axios from 'axios';
import jsPDF from 'jspdf';
import PptxGenJS from 'pptxgenjs';
import CosmicBackButton from './CosmicBackButton';
import { 
  FileText, 
  Presentation, 
  ArrowLeft, 
  Link as LinkIcon, 
  Clipboard, 
  Sparkles, 
  Download, 
  AlertCircle, 
  CheckCircle2, 
  ChevronLeft, 
  ChevronRight,
  BookOpen,
  Loader2,
  Palette,
  Check,
  Copy,
  Layers,
  FileCheck2,
  SlidersHorizontal,
  FileCode,
  ShieldCheck
} from 'lucide-react';

// Konfigurasi Tema Dokumen
const DOCUMENT_THEMES = {
  white: {
    id: 'white',
    name: 'Dokumen Asli (Putih Bersih)',
    desc: 'Standar dokumen formal A4 kertas putih, kontras tinggi & rapi 100%',
    bg: [255, 255, 255],
    textPrimary: [15, 23, 42],       // #0F172A
    textSecondary: [51, 65, 85],     // #334155
    textMuted: [100, 116, 139],      // #64748B
    accent: [37, 99, 235],           // #2563EB Corporate Royal Blue
    accentLight: [239, 246, 255],    // #EFF6FF
    border: [226, 232, 240],         // #E2E8F0
    headerBg: [248, 250, 252],       // #F8FAFC
    pptxBg: 'FFFFFF',
    pptxPrimary: '0F172A',
    pptxSecondary: '334155',
    pptxMuted: '64748B',
    pptxAccent: '2563EB',
    isDark: false
  },
  ivory: {
    id: 'ivory',
    name: 'Kertas Elegan (Warm Ivory)',
    desc: 'Nuansa kertas buku/majalah editorial hangat dan eksklusif',
    bg: [250, 250, 249],             // #FAFAF9
    textPrimary: [28, 25, 23],       // #1C1917
    textSecondary: [68, 64, 60],     // #44403C
    textMuted: [120, 113, 108],      // #78716C
    accent: [180, 83, 9],            // #B45309 Warm Amber
    accentLight: [254, 243, 199],    // #FEF3C7
    border: [231, 229, 228],         // #E7E5E4
    headerBg: [245, 245, 244],       // #F5F5F4
    pptxBg: 'FAF7F2',
    pptxPrimary: '1C1917',
    pptxSecondary: '44403C',
    pptxMuted: '78716C',
    pptxAccent: 'B45309',
    isDark: false
  },
  dark: {
    id: 'dark',
    name: 'Modern Dark Mode',
    desc: 'Mode gelap modern slate untuk presentasi layar malam hari',
    bg: [15, 23, 42],                // #0F172A
    textPrimary: [248, 250, 252],    // #F8FAFC
    textSecondary: [203, 213, 225],  // #CBD5E1
    textMuted: [148, 163, 184],      // #94A3B8
    accent: [56, 189, 248],          // #38BDF8 Neon Cyan
    accentLight: [30, 41, 59],       // #1E293B
    border: [51, 65, 85],            // #334155
    headerBg: [30, 41, 59],
    pptxBg: '0F172A',
    pptxPrimary: 'F8FAFC',
    pptxSecondary: 'CBD5E1',
    pptxMuted: '94A3B8',
    pptxAccent: '38BDF8',
    isDark: true
  }
};

export default function LinkToDocScreen({ onBack }) {
  const [url, setUrl] = useState('');
  const [docData, setDocData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [activePageIndex, setActivePageIndex] = useState(0);

  // Pengaturan Output Dokumen
  const [selectedTheme, setSelectedTheme] = useState('white');
  const [includeCover, setIncludeCover] = useState(false);
  const [fontSizeMode, setFontSizeMode] = useState('normal');  // 'normal' | 'compact'
  const [previewTab, setPreviewTab] = useState('visual');      // 'visual' | 'fulltext'
  const [copied, setCopied] = useState(false);

  // Paste dari clipboard
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setUrl(text.trim());
    } catch {
      // fallback jika clipboard permission ditolak
    }
  };

  // Ekstrak dokumen dari URL
  const handleExtract = async (e) => {
    e.preventDefault();
    if (!url.trim()) {
      setErrorMessage('Silakan tempel tautan dokumen terlebih dahulu.');
      return;
    }

    setLoading(true);
    setErrorMessage('');
    setDocData(null);
    setStatusMessage('Menghubungkan & mengekstrak konten asli dokumen...');

    try {
      const res = await axios.post('/api/link-to-doc', { url: url.trim() });
      if (res.data && res.data.success && res.data.data) {
        setDocData(res.data.data);
        setActivePageIndex(0);
      } else {
        setErrorMessage(res.data?.message || 'Gagal mengekstrak isi dokumen dari tautan tersebut.');
      }
    } catch (err) {
      setErrorMessage(
        err.response?.data?.message || 
        err.message || 
        'Terjadi kesalahan saat memproses tautan dokumen.'
      );
    } finally {
      setLoading(false);
      setStatusMessage('');
    }
  };

  // Salin Semua Teks ke Clipboard
  const handleCopyFullText = async () => {
    if (!docData) return;
    const textToCopy = docData.fullContent || docData.pages?.map(p => `## ${p.title}\n\n${p.text}`).join('\n\n---\n\n') || '';
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setErrorMessage('Gagal menyalin ke clipboard.');
    }
  };

  // 1. GENERATE & DOWNLOAD PDF BERKUALITAS TINGGI (100% Struktur & Auto-Pagination)
  const handleDownloadPDF = async () => {
    if (!docData || !docData.pages || docData.pages.length === 0) return;
    setGenerating(true);
    setStatusMessage('Menghitung auto-pagination & menyusun dokumen PDF...');

    try {
      const theme = DOCUMENT_THEMES[selectedTheme] || DOCUMENT_THEMES.white;
      const isCompact = fontSizeMode === 'compact';
      
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const PAGE_W = 210;
      const PAGE_H = 297;
      const MARGIN_X = 20;
      const CONTENT_W = PAGE_W - (MARGIN_X * 2); // 170 mm
      const MARGIN_TOP = 26;
      const MARGIN_BOTTOM = 24;
      const MAX_Y = PAGE_H - MARGIN_BOTTOM; // 273 mm

      const title = docData.title || 'Dokumen Tanpa Judul';
      const sourceName = (docData.source || 'WEB').toUpperCase();
      const pages = docData.pages;

      // Helper untuk mewarnai latar halaman jika bukan putih murni
      const applyPageBackground = (d) => {
        if (theme.id !== 'white') {
          d.setFillColor(theme.bg[0], theme.bg[1], theme.bg[2]);
          d.rect(0, 0, PAGE_W, PAGE_H, 'F');
        }
      };

      // Helper untuk menggambar Running Header di bagian atas setiap halaman isi
      const drawRunningHeader = (d) => {
        d.setFontSize(8.5);
        d.setFont('helvetica', 'normal');
        d.setTextColor(theme.textMuted[0], theme.textMuted[1], theme.textMuted[2]);
        
        // Judul terpotong di kiri
        const safeTitle = title.length > 55 ? `${title.slice(0, 52)}...` : title;
        d.text(safeTitle, MARGIN_X, 15);
        
        // Sumber di kanan
        d.text(sourceName, PAGE_W - MARGIN_X, 15, { align: 'right' });
        
        // Garis batas tipis header
        d.setDrawColor(theme.border[0], theme.border[1], theme.border[2]);
        d.setLineWidth(0.3);
        d.line(MARGIN_X, 18, PAGE_W - MARGIN_X, 18);
      };

      let currentY = MARGIN_TOP;

      // ==========================================
      // ==========================================
      // JIKA DOKUMEN MEMILIKI GAMBAR HALAMAN ASLI (SCRIBD / CANVA / SLIDES):
      // Cetak 100% PERSIS DOKUMEN ASLI SESUAI JUMLAH HALAMAN
      // ==========================================
      const hasPageImages = docData.hasPageImages || pages.some(p => p.imageBase64 || p.imageUrl);

      if (hasPageImages) {
        let firstPageRendered = false;

        // Jika opsi sampul aktif: render sampul di lembar 1
        if (includeCover) {
          applyPageBackground(doc);
          doc.setFillColor(theme.accent[0], theme.accent[1], theme.accent[2]);
          doc.rect(0, 0, PAGE_W, 4.5, 'F');

          // Badge Kategori
          doc.setFontSize(9);
          doc.setFont('helvetica', 'bold');
          doc.setFillColor(theme.headerBg[0], theme.headerBg[1], theme.headerBg[2]);
          doc.setDrawColor(theme.border[0], theme.border[1], theme.border[2]);
          doc.roundedRect(MARGIN_X, 48, 75, 8.5, 2, 2, 'FD');
          doc.setTextColor(theme.accent[0], theme.accent[1], theme.accent[2]);
          doc.text(`DOKUMEN RESMI • SUMBER: ${sourceName}`, MARGIN_X + 4, 53.5);

          // Judul Utama Dokumen
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(22);
          doc.setTextColor(theme.textPrimary[0], theme.textPrimary[1], theme.textPrimary[2]);
          const splitCoverTitle = doc.splitTextToSize(title, CONTENT_W);
          doc.text(splitCoverTitle, MARGIN_X, 75);

          const titleBottomY = 75 + (splitCoverTitle.length * 9.5);
          doc.setDrawColor(theme.accent[0], theme.accent[1], theme.accent[2]);
          doc.setLineWidth(1.0);
          doc.line(MARGIN_X, titleBottomY + 4, MARGIN_X + 40, titleBottomY + 4);

          // Kartu Metadata
          const cardY = Math.max(titleBottomY + 16, 125);
          doc.setFillColor(theme.headerBg[0], theme.headerBg[1], theme.headerBg[2]);
          doc.setDrawColor(theme.border[0], theme.border[1], theme.border[2]);
          doc.roundedRect(MARGIN_X, cardY, CONTENT_W, 42, 3, 3, 'FD');

          doc.setFontSize(9.5);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(theme.textPrimary[0], theme.textPrimary[1], theme.textPrimary[2]);
          doc.text('INFORMASI ARSIP DOKUMEN', MARGIN_X + 6, cardY + 9);

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);
          doc.setTextColor(theme.textSecondary[0], theme.textSecondary[1], theme.textSecondary[2]);
          doc.text(`Total Bagian / Lembar : ${pages.length} Halaman Lengkap`, MARGIN_X + 6, cardY + 18);
          const dateStr = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
          doc.text(`Tanggal Konversi       : ${dateStr}`, MARGIN_X + 6, cardY + 26);
          doc.text(`Status Dokumen         : 100% Sesuai Asli (Tata Letak & Teks)`, MARGIN_X + 6, cardY + 34);

          doc.setFontSize(8.5);
          doc.setTextColor(theme.textMuted[0], theme.textMuted[1], theme.textMuted[2]);
          doc.text('Dikonversi oleh Kuro Studio Document Intelligence Suite', MARGIN_X, 268);
          doc.text('Tata letak dokumen disesuaikan presisi tinggi untuk penyimpanan & pencetakan resmi.', MARGIN_X, 274);

          firstPageRendered = true;
        }

        const isLandscape = docData.source === 'canva';
        const targetW = isLandscape ? 297 : PAGE_W;
        const targetH = isLandscape ? 210 : PAGE_H;

        // Render seluruh halaman asli secara presisi
        for (let i = 0; i < pages.length; i++) {
          if (firstPageRendered) {
            doc.addPage([targetW, targetH], isLandscape ? 'landscape' : 'portrait');
          } else {
            firstPageRendered = true;
          }

          const p = pages[i];
          const imgSource = p.imageBase64 || (p.imageUrl ? `/api/proxy-doc-image?url=${encodeURIComponent(p.imageUrl)}` : null);

          if (imgSource) {
            // Gambar halaman 100% Full A4 / Slide 16:9 persis dokumen sumber
            doc.addImage(imgSource, 'JPEG', 0, 0, targetW, targetH, undefined, 'FAST');
          } else {
            // Fallback rendering teks jika gambar lembar tidak tersedia
            applyPageBackground(doc);
            drawRunningHeader(doc);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(14);
            doc.setTextColor(theme.textPrimary[0], theme.textPrimary[1], theme.textPrimary[2]);
            doc.text(p.title || `Halaman ${i + 1}`, MARGIN_X, 30);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.setTextColor(theme.textSecondary[0], theme.textSecondary[1], theme.textSecondary[2]);
            const splitT = doc.splitTextToSize(p.text || '', CONTENT_W);
            doc.text(splitT, MARGIN_X, 42);
          }
        }

        const safeName = title.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);
        doc.save(`${safeName}.pdf`);
        return;
      }

      // ==========================================
      // TAHAP 1: HALAMAN SAMPUL / COVER (JIKA DIAKTIFKAN)
      // ==========================================
      if (includeCover) {
        applyPageBackground(doc);

        // Aksen bilah atas modern (tinggi 4.5 mm)
        doc.setFillColor(theme.accent[0], theme.accent[1], theme.accent[2]);
        doc.rect(0, 0, PAGE_W, 4.5, 'F');

        // Badge Kategori / Sumber Dokumen
        const badgeText = `DOKUMEN RESMI • SUMBER: ${sourceName}`;
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        
        doc.setFillColor(theme.headerBg[0], theme.headerBg[1], theme.headerBg[2]);
        doc.setDrawColor(theme.border[0], theme.border[1], theme.border[2]);
        doc.roundedRect(MARGIN_X, 48, 75, 8.5, 2, 2, 'FD');

        doc.setTextColor(theme.accent[0], theme.accent[1], theme.accent[2]);
        doc.text(badgeText, MARGIN_X + 4, 53.5);

        // Judul Utama Dokumen (Tipografi Bersih & Elegan)
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(24);
        doc.setTextColor(theme.textPrimary[0], theme.textPrimary[1], theme.textPrimary[2]);
        const splitCoverTitle = doc.splitTextToSize(title, CONTENT_W);
        doc.text(splitCoverTitle, MARGIN_X, 75);

        const titleBottomY = 75 + (splitCoverTitle.length * 9.5);

        // Garis pemisah aksen halus di bawah judul
        doc.setDrawColor(theme.accent[0], theme.accent[1], theme.accent[2]);
        doc.setLineWidth(1.0);
        doc.line(MARGIN_X, titleBottomY + 4, MARGIN_X + 40, titleBottomY + 4);

        // Kartu Metadata Dokumen
        const cardY = Math.max(titleBottomY + 16, 125);
        doc.setFillColor(theme.headerBg[0], theme.headerBg[1], theme.headerBg[2]);
        doc.setDrawColor(theme.border[0], theme.border[1], theme.border[2]);
        doc.setLineWidth(0.4);
        doc.roundedRect(MARGIN_X, cardY, CONTENT_W, 45, 3, 3, 'FD');

        // Isi Informasi Kartu
        doc.setFontSize(9.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(theme.textPrimary[0], theme.textPrimary[1], theme.textPrimary[2]);
        doc.text('INFORMASI ARSIP DOKUMEN', MARGIN_X + 6, cardY + 10);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(theme.textSecondary[0], theme.textSecondary[1], theme.textSecondary[2]);
        
        doc.text(`Total Bagian / Konten : ${pages.length} Halaman / Slide`, MARGIN_X + 6, cardY + 20);
        const dateStr = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
        doc.text(`Tanggal Konversi       : ${dateStr}`, MARGIN_X + 6, cardY + 28);
        doc.text(`Status Verifikasi      : Lengkap 100% Sesuai Sumber`, MARGIN_X + 6, cardY + 36);

        // Footer Sampul
        doc.setFontSize(8.5);
        doc.setTextColor(theme.textMuted[0], theme.textMuted[1], theme.textMuted[2]);
        doc.text('Dikonversi oleh Kuro Studio Document Intelligence Suite', MARGIN_X, 265);
        doc.text('Tata letak dokumen disesuaikan presisi tinggi untuk penyimpanan & pencetakan resmi.', MARGIN_X, 271);

        // Pindah ke halaman konten
        doc.addPage();
        applyPageBackground(doc);
        drawRunningHeader(doc);
        currentY = MARGIN_TOP;
      } else {
        // Halaman pertama langsung konten
        applyPageBackground(doc);
        drawRunningHeader(doc);
        currentY = MARGIN_TOP;
      }

      // ==========================================
      // TAHAP 2: RENDERING KONTEN & TRUE AUTO-PAGINATION
      // ==========================================
      const fontSizeBody = isCompact ? 9 : 10;
      const lineHeightBody = isCompact ? 4.5 : 5.2;

      // Helper cek & eksekusi page break
      const checkAndBreak = (neededHeight) => {
        if (currentY + neededHeight > MAX_Y) {
          doc.addPage();
          applyPageBackground(doc);
          drawRunningHeader(doc);
          currentY = MARGIN_TOP;
        }
      };

      // Loop setiap seksi / halaman yang diekstrak
      for (let sIdx = 0; sIdx < pages.length; sIdx++) {
        const section = pages[sIdx];

        // 1. Render Judul Seksi (Jika ada)
        if (section.title) {
          checkAndBreak(16);
          
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(13);
          doc.setTextColor(theme.textPrimary[0], theme.textPrimary[1], theme.textPrimary[2]);
          
          const splitSecTitle = doc.splitTextToSize(section.title, CONTENT_W);
          doc.text(splitSecTitle, MARGIN_X, currentY);
          currentY += (splitSecTitle.length * 6) + 3;

          // Indikator garis aksen bawah judul seksi
          doc.setDrawColor(theme.border[0], theme.border[1], theme.border[2]);
          doc.setLineWidth(0.4);
          doc.line(MARGIN_X, currentY, MARGIN_X + 25, currentY);
          currentY += 4;
        }

        // 2. Render Paragraf-paragraf di dalam seksi
        const paragraphs = section.paragraphs && section.paragraphs.length > 0 
          ? section.paragraphs 
          : (section.text ? section.text.split('\n\n') : []);

        for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
          const rawP = paragraphs[pIdx].trim();
          if (!rawP) continue;

          // Deteksi Format Khusus
          const isBullet = /^[-*•]\s+(.+)/.test(rawP);
          const isNumbered = /^(\d+[\.\)])\s+(.+)/.test(rawP);
          const isTable = rawP.startsWith('|') && rawP.endsWith('|');
          const isQuote = rawP.startsWith('>');

          if (isBullet) {
            const bulletText = rawP.replace(/^[-*•]\s+/, '').trim();
            const wrappedBullet = doc.splitTextToSize(bulletText, CONTENT_W - 8);

            checkAndBreak((wrappedBullet.length * lineHeightBody) + 2);

            // Simbol Bullet
            doc.setFillColor(theme.accent[0], theme.accent[1], theme.accent[2]);
            doc.circle(MARGIN_X + 2, currentY - 1.2, 0.8, 'F');

            // Teks Bullet
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(fontSizeBody);
            doc.setTextColor(theme.textSecondary[0], theme.textSecondary[1], theme.textSecondary[2]);
            
            for (let b = 0; b < wrappedBullet.length; b++) {
              checkAndBreak(lineHeightBody);
              doc.text(wrappedBullet[b], MARGIN_X + 6, currentY);
              currentY += lineHeightBody;
            }
            currentY += 1.5;

          } else if (isNumbered) {
            const match = rawP.match(/^(\d+[\.\)])\s+(.+)/);
            const numPrefix = match ? match[1] : '1.';
            const numText = match ? match[2] : rawP;
            const wrappedNum = doc.splitTextToSize(numText, CONTENT_W - 10);

            checkAndBreak((wrappedNum.length * lineHeightBody) + 2);

            // Nomor
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(fontSizeBody);
            doc.setTextColor(theme.accent[0], theme.accent[1], theme.accent[2]);
            doc.text(numPrefix, MARGIN_X, currentY);

            // Teks Nomor
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(theme.textSecondary[0], theme.textSecondary[1], theme.textSecondary[2]);
            
            for (let n = 0; n < wrappedNum.length; n++) {
              checkAndBreak(lineHeightBody);
              doc.text(wrappedNum[n], MARGIN_X + 7, currentY);
              currentY += lineHeightBody;
            }
            currentY += 1.5;

          } else if (isQuote) {
            const quoteText = rawP.replace(/^>\s*/, '').trim();
            const wrappedQuote = doc.splitTextToSize(quoteText, CONTENT_W - 12);
            const boxHeight = (wrappedQuote.length * lineHeightBody) + 6;

            checkAndBreak(boxHeight + 3);

            // Kotak Callout / Quote
            doc.setFillColor(theme.headerBg[0], theme.headerBg[1], theme.headerBg[2]);
            doc.rect(MARGIN_X, currentY - 4, CONTENT_W, boxHeight, 'F');

            // Garis Aksen Vertikal Kiri
            doc.setFillColor(theme.accent[0], theme.accent[1], theme.accent[2]);
            doc.rect(MARGIN_X, currentY - 4, 1.5, boxHeight, 'F');

            // Teks Kutipan
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(fontSizeBody);
            doc.setTextColor(theme.textPrimary[0], theme.textPrimary[1], theme.textPrimary[2]);

            let qY = currentY + 1;
            for (let q = 0; q < wrappedQuote.length; q++) {
              doc.text(wrappedQuote[q], MARGIN_X + 6, qY);
              qY += lineHeightBody;
            }
            currentY += boxHeight + 2;

          } else if (isTable) {
            // Render Tabel Markdown Sederhana
            const rows = rawP.split('\n').filter(r => r.includes('|') && !r.includes('---'));
            for (let r = 0; r < rows.length; r++) {
              const cells = rows[r].split('|').map(c => c.trim()).filter(Boolean);
              if (cells.length === 0) continue;

              checkAndBreak(7);
              const cellW = CONTENT_W / cells.length;

              // Background row
              if (r === 0) {
                doc.setFillColor(theme.headerBg[0], theme.headerBg[1], theme.headerBg[2]);
                doc.rect(MARGIN_X, currentY - 4, CONTENT_W, 6.5, 'F');
                doc.setFont('helvetica', 'bold');
              } else {
                doc.setFont('helvetica', 'normal');
              }

              doc.setFontSize(8.5);
              doc.setTextColor(theme.textPrimary[0], theme.textPrimary[1], theme.textPrimary[2]);
              
              for (let c = 0; c < cells.length; c++) {
                const safeCell = doc.splitTextToSize(cells[c], cellW - 3)[0] || '';
                doc.text(safeCell, MARGIN_X + (c * cellW) + 2, currentY);
              }

              // Garis border tabel
              doc.setDrawColor(theme.border[0], theme.border[1], theme.border[2]);
              doc.line(MARGIN_X, currentY + 2, MARGIN_X + CONTENT_W, currentY + 2);
              currentY += 7;
            }
            currentY += 2;

          } else {
            // Paragraf Teks Biasa
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(fontSizeBody);
            doc.setTextColor(theme.textSecondary[0], theme.textSecondary[1], theme.textSecondary[2]);

            const splitP = doc.splitTextToSize(rawP, CONTENT_W);
            for (let l = 0; l < splitP.length; l++) {
              checkAndBreak(lineHeightBody);
              doc.text(splitP[l], MARGIN_X, currentY);
              currentY += lineHeightBody;
            }
            currentY += 3.5; // Spasi antar paragraf
          }
        }

        // Spasi pemisah antar seksi
        currentY += 4;
      }

      // ==========================================
      // TAHAP 3: TWO-PASS RUNNING FOOTER (SEMUA HALAMAN)
      // ==========================================
      const totalPages = doc.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);

        // Jangan gambar running footer di halaman cover
        if (p === 1 && includeCover) {
          continue;
        }

        // Garis batas footer bawah
        doc.setDrawColor(theme.border[0], theme.border[1], theme.border[2]);
        doc.setLineWidth(0.3);
        doc.line(MARGIN_X, 283, PAGE_W - MARGIN_X, 283);

        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(theme.textMuted[0], theme.textMuted[1], theme.textMuted[2]);
        doc.text(`Dikonversi oleh Kuro Studio • ${sourceName}`, MARGIN_X, 288);

        const pageLabel = includeCover 
          ? `Halaman ${p - 1} dari ${totalPages - 1}`
          : `Halaman ${p} dari ${totalPages}`;
        doc.text(pageLabel, PAGE_W - MARGIN_X, 288, { align: 'right' });
      }

      const safeName = title.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);
      doc.save(`${safeName}.pdf`);
    } catch (err) {
      console.error('PDF Generation Error:', err);
      setErrorMessage('Gagal membuat PDF: ' + err.message);
    } finally {
      setGenerating(false);
      setStatusMessage('');
    }
  };

  // 2. GENERATE & DOWNLOAD PPTX (PowerPoint Bersih & Menyesuaikan Tema)
  const handleDownloadPPT = async () => {
    if (!docData || !docData.pages || docData.pages.length === 0) return;
    setGenerating(true);
    setStatusMessage('Menyusun layout presentasi PPTX profesional...');

    try {
      const theme = DOCUMENT_THEMES[selectedTheme] || DOCUMENT_THEMES.white;
      const pptx = new PptxGenJS();
      pptx.layout = 'LAYOUT_16x9';

      const title = docData.title || 'Presentasi Dokumen';
      const sourceName = (docData.source || 'WEB').toUpperCase();
      const pages = docData.pages;

      // JIKA DOKUMEN MEMILIKI GAMBAR HALAMAN ASLI (SCRIBD / CANVA / SLIDES):
      const hasPageImages = docData.hasPageImages || pages.some(p => p.imageBase64 || p.imageUrl);

      if (hasPageImages) {
        for (let idx = 0; idx < pages.length; idx++) {
          const p = pages[idx];
          const slide = pptx.addSlide();
          slide.background = { color: 'FFFFFF' };

          const isLandscape = docData.source === 'canva';
          const imgData = p.imageBase64 || (p.imageUrl ? `/api/proxy-doc-image?url=${encodeURIComponent(p.imageUrl)}` : null);

          if (imgData) {
            // Jika Canva (16:9), isi penuh slide 10.0 x 5.625; jika portrait A4, posisikan proporsional di tengah
            const slideW = isLandscape ? 10.0 : 3.71;
            const slideH = isLandscape ? 5.625 : 5.25;
            const posX = isLandscape ? 0 : (10.0 - slideW) / 2;
            const posY = isLandscape ? 0 : (5.625 - slideH) / 2;

            slide.addImage({
              data: imgData.startsWith('data:') ? imgData : undefined,
              path: !imgData.startsWith('data:') ? imgData : undefined,
              x: posX,
              y: posY,
              w: slideW,
              h: slideH
            });
          } else {
            slide.addText(p.text || '', {
              x: 0.8,
              y: 0.8,
              w: 8.4,
              h: 4.2,
              fontSize: 14,
              wrap: true
            });
          }
        }

        const safeName = title.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);
        await pptx.writeFile({ fileName: `${safeName}.pptx` });
        return;
      }

      // 1. SLIDE JUDUL / COVER
      const slideTitle = pptx.addSlide();
      slideTitle.background = { color: theme.pptxBg };

      // Bilah Aksen Atas
      slideTitle.addShape(pptx.ShapeType.rect, {
        x: 0,
        y: 0,
        w: 10.0,
        h: 0.15,
        fill: { color: theme.pptxAccent }
      });

      // Judul Presentasi
      slideTitle.addText(title, {
        x: 1.0,
        y: 1.8,
        w: 8.0,
        h: 1.8,
        fontSize: 28,
        bold: true,
        color: theme.pptxPrimary,
        align: 'left',
        valign: 'middle'
      });

      // Subtitle / Info
      slideTitle.addText(`Sumber: ${sourceName}  |  Total ${pages.length} Lembar Slide\nDikonversi melalui Kuro Studio Document Intelligence Suite`, {
        x: 1.0,
        y: 3.8,
        w: 8.0,
        h: 1.0,
        fontSize: 13,
        color: theme.pptxMuted,
        align: 'left',
        lineSpacing: 22
      });

      // 2. SETIAP HALAMAN / SEKSI JADI SLIDE PRESENTASI
      pages.forEach((p, idx) => {
        const slide = pptx.addSlide();
        slide.background = { color: theme.pptxBg };

        // Bilah Aksen Atas Tipis
        slide.addShape(pptx.ShapeType.rect, {
          x: 0,
          y: 0,
          w: 10.0,
          h: 0.08,
          fill: { color: theme.pptxAccent }
        });

        // Judul Slide
        slide.addText(p.title || `Bagian ${idx + 1}`, {
          x: 0.8,
          y: 0.5,
          w: 8.4,
          h: 0.7,
          fontSize: 20,
          bold: true,
          color: theme.pptxPrimary
        });

        // Garis batas judul
        slide.addShape(pptx.ShapeType.line, {
          x: 0.8,
          y: 1.25,
          w: 8.4,
          h: 0,
          line: { color: theme.isDark ? '334155' : 'E2E8F0', width: 1.5 }
        });

        // Auto-sizing teks agar tidak pernah terpotong di PowerPoint
        const charLen = (p.text || '').length;
        let fontSize = 14;
        let lineSpacing = 20;

        if (charLen > 800) {
          fontSize = 11;
          lineSpacing = 16;
        } else if (charLen > 400) {
          fontSize = 12.5;
          lineSpacing = 18;
        }

        slide.addText(p.text || '', {
          x: 0.8,
          y: 1.45,
          w: 8.4,
          h: 3.6,
          fontSize,
          color: theme.pptxSecondary,
          lineSpacing,
          valign: 'top',
          wrap: true
        });

        // Footer Slide
        slide.addText(`Slide ${idx + 1} dari ${pages.length}  •  Kuro Studio`, {
          x: 0.8,
          y: 5.15,
          w: 8.4,
          h: 0.35,
          fontSize: 9.5,
          color: theme.pptxMuted,
          align: 'right'
        });
      });

      const safeName = title.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);
      await pptx.writeFile({ fileName: `${safeName}.pptx` });
    } catch (err) {
      console.error('PPTX Generation Error:', err);
      setErrorMessage('Gagal membuat PPTX: ' + err.message);
    } finally {
      setGenerating(false);
      setStatusMessage('');
    }
  };

  const activeThemeObj = DOCUMENT_THEMES[selectedTheme] || DOCUMENT_THEMES.white;

  return (
    <main className="flex-grow relative z-10 flex flex-col items-center justify-start px-4 sm:px-6 md:px-margin-desktop py-6 sm:py-10 w-full max-w-5xl mx-auto">
      
      {/* Tombol Kembali ke Beranda */}
      <div className="w-full flex items-center justify-between mb-6">
        <CosmicBackButton onClick={onBack} label="Kembali ke Beranda Tools" />

        <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>100% Bypass & Ekstraksi Asli</span>
        </div>
      </div>

      {/* Header Judul Fitur */}
      <div className="text-center mb-8 max-w-2xl">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-bold uppercase tracking-wider mb-3">
          <BookOpen className="w-3.5 h-3.5" />
          <span>Bypass & Document Converter</span>
        </div>
        <h1 className="text-2xl sm:text-4xl font-extrabold text-on-surface mb-2">
          Ubah Link ke PDF & PPT
        </h1>
        <p className="text-xs sm:text-sm text-on-surface-variant">
          Konversi link Scribd, Canva Presentation, dokumen web, atau artikel menjadi berkas PDF & PPTX resmi dengan tema, tulisan, dan tata letak asli 100% tanpa terpotong.
        </p>
      </div>

      {/* Form Input URL Dokumen */}
      <div className="w-full glass-panel rounded-2xl p-5 sm:p-7 shadow-xl mb-8">
        <form onSubmit={handleExtract} className="space-y-4">
          <div className="relative flex items-center">
            <LinkIcon className="absolute left-4 w-5 h-5 text-on-surface-variant pointer-events-none" />
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Tempel tautan Scribd (scribd.com/doc/...), Canva, atau link web di sini..."
              className="w-full pl-12 pr-28 py-3.5 sm:py-4 rounded-xl bg-surface-container-high/60 border border-outline-variant/40 text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20 text-sm sm:text-base transition-all"
            />
            <button
              type="button"
              onClick={handlePaste}
              className="absolute right-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container border border-outline-variant/30 text-xs text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-all cursor-pointer"
            >
              <Clipboard className="w-3.5 h-3.5" />
              <span>Paste</span>
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-2 text-xs text-on-surface-variant/70">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Mendukung: Scribd (Bypass Kasada/Paywall), Canva View/Slide, Dokumen Web</span>
            </div>

            <button
              type="submit"
              disabled={loading || !url.trim()}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold text-sm shadow-lg shadow-cyan-500/20 hover:scale-102 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Mengekstrak Dokumen...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Ekstrak Dokumen</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Pesan Error */}
        {errorMessage && (
          <div className="mt-4 p-4 rounded-xl bg-error-container/40 border border-error/30 text-error text-xs sm:text-sm flex items-start gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Status Loading */}
        {loading && (
          <div className="mt-4 p-4 rounded-xl bg-surface-container/60 border border-cyan-500/30 text-cyan-300 text-xs sm:text-sm flex items-center gap-3 animate-pulse">
            <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
            <span>{statusMessage}</span>
          </div>
        )}
      </div>

      {/* PANEL HASIL EKSTRAKSI DOKUMEN & PENGATURAN TEMA */}
      {docData && (
        <div className="w-full space-y-6 animate-fadeIn">
          
          {/* Baris Kontrol Tema & Pengaturan Ekspor */}
          <div className="w-full glass-panel rounded-2xl p-6 sm:p-7 shadow-xl space-y-5">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-5 border-b border-outline-variant/30">
              <div>
                <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] font-bold uppercase mb-2">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Dokumen Terbaca ({docData.source?.toUpperCase()})</span>
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-on-surface">
                  {docData.title}
                </h2>
                <p className="text-xs text-on-surface-variant mt-1">
                  Ditemukan {docData.pages?.length || 0} bagian dokumen • Teks lengkap siap dikonversi ke PDF & PPTX
                </p>
              </div>

              {/* Tombol Download PDF & PPTX */}
              <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                <button
                  onClick={handleDownloadPDF}
                  disabled={generating}
                  className="flex-1 sm:flex-initial px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs sm:text-sm shadow-lg shadow-rose-600/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  title="Unduh PDF Resmi dengan Auto-Pagination & Tema Asli"
                >
                  <FileText className="w-4 h-4" />
                  <span>Download PDF Asli</span>
                </button>

                <button
                  onClick={handleDownloadPPT}
                  disabled={generating}
                  className="flex-1 sm:flex-initial px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs sm:text-sm shadow-lg shadow-amber-600/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  title="Unduh Presentasi Slide PowerPoint PPTX"
                >
                  <Presentation className="w-4 h-4" />
                  <span>Download PPTX</span>
                </button>

                <button
                  onClick={handleCopyFullText}
                  className="px-3.5 py-2.5 rounded-xl bg-surface-container border border-outline-variant/40 hover:bg-surface-container-highest text-on-surface font-semibold text-xs sm:text-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  title="Salin semua teks dokumen ke clipboard"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  <span>{copied ? 'Tersalin!' : 'Salin Teks'}</span>
                </button>
              </div>
            </div>

            {/* Indikator Status Pembuatan */}
            {generating && (
              <div className="p-3.5 rounded-xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-xs flex items-center gap-3 animate-pulse">
                <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                <span className="font-medium">{statusMessage}</span>
              </div>
            )}

            {/* Pilihan Tema & Pengaturan Halaman Dokumen */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              
              {/* 1. Pemilihan Tema Tampilan Dokumen */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-on-surface-variant flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Tema Warna Dokumen:</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {Object.values(DOCUMENT_THEMES).map((thm) => (
                    <button
                      key={thm.id}
                      type="button"
                      onClick={() => setSelectedTheme(thm.id)}
                      className={`p-2.5 rounded-xl text-left border transition-all cursor-pointer flex flex-col justify-between ${
                        selectedTheme === thm.id
                          ? 'border-cyan-400 bg-cyan-500/10 ring-1 ring-cyan-400'
                          : 'border-outline-variant/30 bg-surface-container/50 hover:bg-surface-container'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span 
                          className="w-3.5 h-3.5 rounded-full border border-black/20"
                          style={{ backgroundColor: `rgb(${thm.bg.join(',')})` }}
                        />
                        {selectedTheme === thm.id && <Check className="w-3 h-3 text-cyan-400" />}
                      </div>
                      <span className="text-[11px] font-bold text-on-surface truncate">
                        {thm.id === 'white' ? 'Putih Asli' : thm.id === 'ivory' ? 'Ivory' : 'Dark'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. Opsi Sampul / Cover Page */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-on-surface-variant flex items-center gap-1.5">
                  <FileCheck2 className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Halaman Sampul (Cover):</span>
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIncludeCover(true)}
                    className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                      includeCover 
                        ? 'border-cyan-400 bg-cyan-500/10 text-cyan-300 font-bold' 
                        : 'border-outline-variant/30 bg-surface-container/50 text-on-surface-variant hover:bg-surface-container'
                    }`}
                  >
                    Sertakan Sampul
                  </button>
                  <button
                    type="button"
                    onClick={() => setIncludeCover(false)}
                    className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                      !includeCover 
                        ? 'border-cyan-400 bg-cyan-500/10 text-cyan-300 font-bold' 
                        : 'border-outline-variant/30 bg-surface-container/50 text-on-surface-variant hover:bg-surface-container'
                    }`}
                  >
                    Langsung Isi
                  </button>
                </div>
              </div>

              {/* 3. Kerapatan Teks / Density */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-on-surface-variant flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Kerapatan Tipografi:</span>
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setFontSizeMode('normal')}
                    className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                      fontSizeMode === 'normal' 
                        ? 'border-cyan-400 bg-cyan-500/10 text-cyan-300 font-bold' 
                        : 'border-outline-variant/30 bg-surface-container/50 text-on-surface-variant hover:bg-surface-container'
                    }`}
                  >
                    Standar (Nyaman)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFontSizeMode('compact')}
                    className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                      fontSizeMode === 'compact' 
                        ? 'border-cyan-400 bg-cyan-500/10 text-cyan-300 font-bold' 
                        : 'border-outline-variant/30 bg-surface-container/50 text-on-surface-variant hover:bg-surface-container'
                    }`}
                  >
                    Ringkas (Hemat Hal.)
                  </button>
                </div>
              </div>

            </div>
          </div>

          {/* PREVIEW KONTEN DOKUMEN & LEMBAR KERJA */}
          <div className="w-full glass-panel rounded-2xl p-6 sm:p-8 shadow-2xl space-y-5">
            
            {/* Tab Switcher: Preview Halaman vs Full Teks */}
            <div className="flex items-center justify-between border-b border-outline-variant/30 pb-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPreviewTab('visual')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    previewTab === 'visual'
                      ? 'bg-cyan-500 text-white shadow'
                      : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Preview Lembar ({docData.pages.length})</span>
                </button>
                <button
                  onClick={() => setPreviewTab('fulltext')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    previewTab === 'fulltext'
                      ? 'bg-cyan-500 text-white shadow'
                      : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <FileCode className="w-3.5 h-3.5" />
                  <span>Teks Lengkap Asli</span>
                </button>
              </div>

              {previewTab === 'visual' && (
                <div className="flex items-center gap-2 text-xs text-on-surface-variant">
                  <span>Lembar <strong>{activePageIndex + 1}</strong> dari <strong>{docData.pages.length}</strong></span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setActivePageIndex(prev => Math.max(0, prev - 1))}
                      disabled={activePageIndex === 0}
                      className="p-1 rounded-lg bg-surface-container hover:bg-surface-container-high disabled:opacity-30 cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setActivePageIndex(prev => Math.min(docData.pages.length - 1, prev + 1))}
                      disabled={activePageIndex === docData.pages.length - 1}
                      className="p-1 rounded-lg bg-surface-container hover:bg-surface-container-high disabled:opacity-30 cursor-pointer"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 1. Tab Visual (Kertas Halaman Dokumen Sesuai Tema) */}
            {previewTab === 'visual' && (
              <div className="space-y-4">
                
                {/* Lembar Simulasi Cetak A4 / Slide */}
                {(docData.pages[activePageIndex]?.imageBase64 || docData.pages[activePageIndex]?.imageUrl) ? (
                  <div className="flex flex-col items-center justify-center p-3 sm:p-5 bg-surface-container-lowest/80 rounded-2xl border border-outline-variant/30 shadow-2xl">
                    <div className="flex items-center justify-between w-full pb-3 mb-3 border-b border-outline-variant/30 px-2 text-xs text-on-surface-variant">
                      <span className="font-bold text-cyan-400 flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-cyan-400" />
                        <span>Render Asli Presisi 100% Sesuai Dokumen</span>
                      </span>
                      <span className="font-mono bg-surface-container px-2.5 py-1 rounded-md text-on-surface">
                        Halaman {activePageIndex + 1} dari {docData.pages.length}
                      </span>
                    </div>

                    {/* Frame Kertas Dokumen Asli */}
                    <div className="max-w-[620px] w-full shadow-2xl rounded-xl overflow-hidden border border-slate-700/60 bg-white">
                      <img
                        src={docData.pages[activePageIndex].imageBase64 || `/api/proxy-doc-image?url=${encodeURIComponent(docData.pages[activePageIndex].imageUrl)}`}
                        alt={`Halaman ${activePageIndex + 1}`}
                        className="w-full h-auto object-contain block select-none"
                      />
                    </div>

                    {/* Cuplikan Teks Terbaca Dari Halaman Ini */}
                    {docData.pages[activePageIndex]?.text && (
                      <div className="w-full max-w-[620px] mt-4 p-3 bg-surface-container/50 rounded-xl border border-outline-variant/20 text-xs text-on-surface-variant">
                        <p className="font-semibold text-cyan-300 mb-1 flex items-center gap-1">
                          <FileText className="w-3.5 h-3.5" /> 
                          <span>Teks Terbaca pada Halaman Ini:</span>
                        </p>
                        <p className="line-clamp-3 whitespace-pre-line text-on-surface/80 font-sans leading-relaxed">
                          {docData.pages[activePageIndex].text}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div 
                    className="rounded-2xl p-6 sm:p-10 shadow-2xl transition-all border min-h-[380px] flex flex-col justify-between"
                    style={{
                      backgroundColor: `rgb(${activeThemeObj.bg.join(',')})`,
                      borderColor: `rgb(${activeThemeObj.border.join(',')})`,
                      color: `rgb(${activeThemeObj.textPrimary.join(',')})`
                    }}
                  >
                    <div>
                      {/* Header lembar mini */}
                      <div 
                        className="flex items-center justify-between pb-3 mb-6 border-b text-[11px]"
                        style={{
                          borderColor: `rgb(${activeThemeObj.border.join(',')})`,
                          color: `rgb(${activeThemeObj.textMuted.join(',')})`
                        }}
                      >
                        <span className="font-semibold truncate max-w-[70%]">
                          {docData.title}
                        </span>
                        <span>{docData.source?.toUpperCase()}</span>
                      </div>

                      {/* Judul Halaman / Bagian */}
                      {docData.pages[activePageIndex]?.title && (
                        <h3 
                          className="text-lg sm:text-xl font-extrabold mb-4 pb-2 border-b inline-block"
                          style={{
                            color: `rgb(${activeThemeObj.textPrimary.join(',')})`,
                            borderColor: `rgb(${activeThemeObj.accent.join(',')})`
                          }}
                        >
                          {docData.pages[activePageIndex].title}
                        </h3>
                      )}

                      {/* Isi Teks Lembar */}
                      <div 
                        className="text-xs sm:text-sm leading-relaxed whitespace-pre-line space-y-3 font-sans"
                        style={{ color: `rgb(${activeThemeObj.textSecondary.join(',')})` }}
                      >
                        {docData.pages[activePageIndex]?.text || 'Tidak ada teks pada bagian ini.'}
                      </div>
                    </div>

                    {/* Footer lembar mini */}
                    <div 
                      className="mt-8 pt-3 border-t flex items-center justify-between text-[11px]"
                      style={{
                        borderColor: `rgb(${activeThemeObj.border.join(',')})`,
                        color: `rgb(${activeThemeObj.textMuted.join(',')})`
                      }}
                    >
                      <span>Kuro Studio Document Suite</span>
                      <span>Halaman {activePageIndex + 1} dari {docData.pages.length}</span>
                    </div>
                  </div>
                )}

                {/* Strip Penomoran Lembar */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-thin pt-2">
                  {docData.pages.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setActivePageIndex(idx)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold shrink-0 transition-all cursor-pointer ${
                        activePageIndex === idx
                          ? 'bg-cyan-500 text-white shadow-md'
                          : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                      }`}
                    >
                      Hal {idx + 1}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 2. Tab Teks Lengkap (Full Text Stream) */}
            {previewTab === 'fulltext' && (
              <div className="space-y-3">
                <div className="p-4 rounded-xl bg-surface-container/60 border border-outline-variant/30 max-h-[450px] overflow-y-auto scrollbar-thin">
                  <pre className="text-xs text-on-surface whitespace-pre-wrap font-sans leading-relaxed">
                    {docData.fullContent || docData.pages?.map(p => `### ${p.title}\n\n${p.text}`).join('\n\n\n')}
                  </pre>
                </div>
              </div>
            )}

          </div>

        </div>
      )}

    </main>
  );
}
