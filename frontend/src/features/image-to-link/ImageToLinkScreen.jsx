import React, { useState, useEffect } from 'react';
import axios from 'axios';
import CosmicBackButton from '../../shared/components/CosmicBackButton';
import { copyTextToClipboard } from '../../shared/utils/clipboard';
import { 
  Link2, 
  Upload, 
  Image as ImageIcon, 
  Video as VideoIcon,
  FileText,
  Check, 
  Copy, 
  ExternalLink, 
  ArrowLeft, 
  QrCode, 
  Code, 
  Sparkles, 
  History, 
  Trash2, 
  AlertCircle,
  Loader2,
  FileCode,
  Download
} from 'lucide-react';

export default function ImageToLinkScreen({ onBack, onOpenQrStudio, onShowToast }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileType, setFileType] = useState('image'); // 'image' | 'video' | 'pdf'
  const [previewUrl, setPreviewUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [resultData, setResultData] = useState(null);
  const [copiedField, setCopiedField] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [uploadHistory, setUploadHistory] = useState([]);

  // Load history dari localStorage saat mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('kuro_file_links_history') || localStorage.getItem('kaze_file_links_history');
      if (saved) setUploadHistory(JSON.parse(saved));
    } catch {
      // ignore
    }
  }, []);

  const saveToHistory = (item) => {
    const updated = [item, ...uploadHistory.filter(h => h.url !== item.url)].slice(0, 10);
    setUploadHistory(updated);
    try {
      localStorage.setItem('kuro_file_links_history', JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  const clearHistory = () => {
    setUploadHistory([]);
    try {
      localStorage.removeItem('kuro_file_links_history');
      localStorage.removeItem('kaze_file_links_history');
    } catch {
      // ignore
    }
    onShowToast?.('Riwayat tautan berhasil dibersihkan.', 'info');
  };

  // Deteksi tipe file
  const detectFileType = (file) => {
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('video/')) return 'video';
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) return 'pdf';
    return 'other';
  };

  // Handle pilih file
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processSelectedFile(file);
  };

  // Handle Drop file
  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    processSelectedFile(file);
  };

  const processSelectedFile = (file) => {
    const type = detectFileType(file);
    if (type === 'other') {
      setErrorMessage('Format file tidak didukung. Harap unggah Foto (JPG, PNG, WebP), Video (MP4, WebM), atau Dokumen PDF.');
      return;
    }

    setErrorMessage('');
    setSelectedFile(file);
    setFileType(type);
    setResultData(null);

    const reader = new FileReader();
    reader.onload = () => {
      setPreviewUrl(reader.result);
    };
    reader.readAsDataURL(file);
  };

  // Upload ke backend
  const handleUpload = async () => {
    if (!previewUrl || !selectedFile) return;

    setUploading(true);
    setErrorMessage('');

    try {
      const res = await axios.post('/api/upload-file', {
        fileBase64: previewUrl,
        originalName: selectedFile.name,
        mimeType: selectedFile.type
      });

      if (res.data && res.data.success) {
        const item = res.data.data;
        setResultData(item);
        saveToHistory({
          url: item.url,
          fileName: item.fileName,
          category: item.category || fileType,
          sizeFormatted: item.sizeFormatted,
          date: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
          preview: fileType === 'image' ? previewUrl : null
        });
      } else {
        setErrorMessage(res.data?.message || 'Gagal mengubah file menjadi tautan.');
      }
    } catch (err) {
      const status = err.response?.status;
      if (status === 404 || status === 502) {
        setErrorMessage('Layanan hosting file lokal (/api/upload-file) memerlukan server Express Node.js aktif dan tidak tersedia pada mode serverless statis.');
      } else {
        setErrorMessage(err.response?.data?.message || err.message || 'Terjadi kesalahan saat mengunggah file.');
      }
    } finally {
      setUploading(false);
    }
  };

  // Copy helper
  const handleCopy = async (text, fieldName) => {
    const res = await copyTextToClipboard(text);
    if (res.success) {
      setCopiedField(fieldName);
      onShowToast?.('Tautan berhasil disalin ke papan klip!', 'success');
      setTimeout(() => setCopiedField(null), 2500);
    } else {
      onShowToast?.(res.message || 'Gagal menyalin tautan.', 'error');
    }
  };

  return (
    <main className="flex-grow w-full max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 text-black">
      
      {/* Tombol Navigasi Kembali */}
      <div className="mb-5">
        <CosmicBackButton onClick={onBack} label="Kembali ke Beranda" />
      </div>

      {/* Header Judul Fitur */}
      <div className="rounded-xl p-5 sm:p-6 border-2 border-black bg-white shadow-[4px_4px_0px_#000000] mb-6">
        <div className="flex items-center gap-3 pb-3 border-b-2 border-black">
          <div className="w-10 h-10 rounded-md border-2 border-black bg-black text-white flex items-center justify-center shrink-0">
            <Link2 className="w-5 h-5 stroke-[2.2]" />
          </div>
          <div>
            <h1 className="text-base sm:text-xl font-black tracking-tight font-display text-black">
              Ubah File Menjadi Link
            </h1>
            <p className="text-xs text-neutral-600">
              Unggah foto, video, atau dokumen PDF untuk mendapatkan tautan publik langsung yang dapat diakses dari perangkat manapun.
            </p>
          </div>
        </div>
      </div>

      {/* Upload Box Zone */}
      <div className="w-full rounded-xl p-6 sm:p-8 border-2 border-black bg-white shadow-[4px_4px_0px_#000000] mb-6">
        
        {/* Drop Area */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="border-2 border-dashed border-black rounded-xl p-6 sm:p-10 flex flex-col items-center justify-center text-center transition-all bg-neutral-50 hover:bg-neutral-100 cursor-pointer"
          onClick={() => document.getElementById('file-upload-input').click()}
        >
          <input
            id="file-upload-input"
            type="file"
            accept="image/*,video/mp4,video/webm,video/quicktime,application/pdf"
            className="hidden"
            onChange={handleFileChange}
          />

          {previewUrl ? (
            <div className="w-full flex flex-col items-center gap-4">
              {fileType === 'image' && (
                <div className="max-w-xs max-h-60 rounded-lg overflow-hidden border-2 border-black bg-neutral-100 shadow-[2px_2px_0px_#000000]">
                  <img src={previewUrl} alt="Preview" className="w-full h-full object-contain" />
                </div>
              )}

              {fileType === 'video' && (
                <div className="max-w-md w-full rounded-lg overflow-hidden border-2 border-black bg-black shadow-[2px_2px_0px_#000000]">
                  <video src={previewUrl} controls className="w-full max-h-60 object-contain" />
                </div>
              )}

              {fileType === 'pdf' && (
                <div className="flex items-center gap-3 p-4 rounded-lg bg-neutral-100 border-2 border-black max-w-md w-full shadow-[2px_2px_0px_#000000]">
                  <div className="w-12 h-12 rounded-lg bg-black text-white flex items-center justify-center shrink-0">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div className="text-left overflow-hidden">
                    <p className="text-xs font-bold text-black truncate">{selectedFile?.name}</p>
                    <p className="text-[11px] text-neutral-600">Dokumen PDF Siap Dijadikan Tautan</p>
                  </div>
                </div>
              )}

              <div className="text-center">
                <p className="text-xs font-bold text-black">{selectedFile?.name}</p>
                <p className="text-[11px] text-neutral-600 font-mono">
                  {(selectedFile?.size / (1024 * 1024)).toFixed(2)} MB • {fileType.toUpperCase()}
                </p>
                <span className="text-[11px] text-black font-bold underline mt-1 inline-block">
                  Klik untuk mengganti berkas
                </span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-lg border-2 border-black bg-neutral-100 flex items-center justify-center text-black shadow-[2px_2px_0px_#000000]">
                <Upload className="w-6 h-6 stroke-[2]" />
              </div>
              <div>
                <p className="text-sm font-bold text-black font-sans">
                  Pilih atau Tarik Berkas ke Sini
                </p>
                <p className="text-xs text-neutral-600 mt-1">
                  Mendukung Foto (JPG, PNG, WEBP), Video (MP4, WebM), dan Dokumen PDF
                </p>
              </div>
              <span className="text-[11px] px-3 py-1 rounded border border-black bg-white font-mono font-bold text-black">
                Maksimal 100 MB per berkas
              </span>
            </div>
          )}
        </div>

        {/* Pesan Error */}
        {errorMessage && (
          <div className="mt-4 p-3 rounded-lg bg-neutral-100 border-2 border-black flex items-center gap-2 text-black text-xs font-bold">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Tombol Upload */}
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={handleUpload}
            disabled={!previewUrl || uploading}
            className="w-full sm:w-auto min-h-[44px] px-6 py-2.5 rounded-lg border-2 border-black bg-black hover:bg-neutral-800 disabled:opacity-50 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-[2px_2px_0px_#000000] cursor-pointer"
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Mengunggah Berkas...</span>
              </>
            ) : (
              <>
                <Link2 className="w-4 h-4" />
                <span>Buat Tautan Sekarang</span>
              </>
            )}
          </button>
        </div>

      </div>

      {/* HASIL OUTPUT LINK BERHASIL */}
      {resultData && (
        <div className="w-full rounded-xl p-5 sm:p-6 border-2 border-black bg-white shadow-[4px_4px_0px_#000000] space-y-5 mb-6 animate-fadeIn">
          <div className="flex items-center justify-between pb-3 border-b-2 border-black">
            <div className="flex items-center gap-2 text-black">
              <Check className="w-5 h-5 stroke-[3]" />
              <h3 className="text-sm sm:text-base font-extrabold font-sans">
                Tautan Berhasil Dibuat
              </h3>
            </div>
            <span className="text-[11px] font-mono font-bold text-black bg-neutral-100 border border-black px-2.5 py-0.5 rounded">
              {resultData.sizeFormatted}
            </span>
          </div>

          {/* 1. Direct URL */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-black flex items-center justify-between">
              <span>Tautan Langsung (Direct Link):</span>
              <span className="text-[10px] text-neutral-600 font-mono">Bisa dibagikan di WhatsApp, Discord, Browser</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={resultData.url}
                className="flex-grow px-3.5 py-2.5 rounded-lg border-2 border-black bg-neutral-50 text-xs font-mono font-bold text-black outline-none"
              />
              <button
                type="button"
                onClick={() => handleCopy(resultData.url, 'url')}
                className="min-h-[44px] px-4 py-2.5 rounded-lg border-2 border-black bg-black hover:bg-neutral-800 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 shadow-[2px_2px_0px_#000000] cursor-pointer"
              >
                {copiedField === 'url' ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedField === 'url' ? 'Disalin' : 'Salin'}</span>
              </button>
              <a
                href={resultData.url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[44px] px-3 py-2.5 rounded-lg border-2 border-black bg-white hover:bg-neutral-100 text-black shrink-0 flex items-center justify-center shadow-[2px_2px_0px_#000000] cursor-pointer"
                title="Buka Tautan"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* 2. Tombol Cepat: Jadikan Kode QR */}
          <div className="p-4 rounded-lg border-2 border-black bg-neutral-50 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg border-2 border-black bg-black text-white flex items-center justify-center shrink-0 shadow-[1.5px_1.5px_0px_#000000]">
                <QrCode className="w-5 h-5" />
              </div>
              <div className="text-left">
                <h4 className="text-xs font-extrabold text-black font-sans">Jadikan Tautan Ini Kode QR</h4>
                <p className="text-[11px] text-neutral-600">
                  Kustomisasi bingkai, logo tengah, dan tata letak di QR Studio.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                if (onOpenQrStudio) onOpenQrStudio(resultData.url);
              }}
              className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-lg border-2 border-black bg-black hover:bg-neutral-800 text-white font-bold text-xs flex items-center justify-center gap-2 shrink-0 shadow-[2px_2px_0px_#000000] cursor-pointer"
            >
              <span>Buka di QR Studio</span>
            </button>
          </div>

          {/* 3. Format Embed (HTML & Markdown) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            
            {/* Markdown */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-black flex items-center gap-1.5">
                <FileCode className="w-3.5 h-3.5" />
                <span>Format Markdown:</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={resultData.markdown}
                  className="flex-grow px-3 py-2 rounded-lg border-2 border-black bg-neutral-50 text-[11px] font-mono font-bold text-black truncate outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleCopy(resultData.markdown, 'md')}
                  className="p-2 rounded-lg border-2 border-black bg-white hover:bg-neutral-100 text-black shrink-0 cursor-pointer shadow-[1.5px_1.5px_0px_#000000]"
                  title="Salin Markdown"
                >
                  {copiedField === 'md' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* HTML Tag */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-black flex items-center gap-1.5">
                <Code className="w-3.5 h-3.5" />
                <span>Format HTML Embed:</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={resultData.html}
                  className="flex-grow px-3 py-2 rounded-lg border-2 border-black bg-neutral-50 text-[11px] font-mono font-bold text-black truncate outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleCopy(resultData.html, 'html')}
                  className="p-2 rounded-lg border-2 border-black bg-white hover:bg-neutral-100 text-black shrink-0 cursor-pointer shadow-[1.5px_1.5px_0px_#000000]"
                  title="Salin HTML"
                >
                  {copiedField === 'html' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

          </div>

        </div>
      )}

      {/* RIWAYAT PENGUNGGAHAN TERAKHIR */}
      {uploadHistory.length > 0 && (
        <div className="w-full rounded-xl p-5 sm:p-6 border-2 border-black bg-white shadow-[4px_4px_0px_#000000] space-y-4">
          <div className="flex items-center justify-between border-b-2 border-black pb-3">
            <div className="flex items-center gap-2 text-xs font-bold text-black">
              <History className="w-4 h-4" />
              <span>Riwayat Berkas Terunggah</span>
            </div>
            <button
              type="button"
              onClick={clearHistory}
              className="text-[11px] font-bold text-black hover:underline flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
              <span>Hapus Semua</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {uploadHistory.map((item, idx) => (
              <div 
                key={idx} 
                className="p-3 rounded-lg border-2 border-black bg-neutral-50 flex items-center justify-between gap-3 shadow-[2px_2px_0px_#000000]"
              >
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <div className="w-8 h-8 rounded border border-black bg-white flex items-center justify-center text-black shrink-0">
                    {item.category === 'video' ? <VideoIcon className="w-4 h-4" /> : item.category === 'pdf' ? <FileText className="w-4 h-4" /> : <ImageIcon className="w-4 h-4" />}
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-xs font-bold text-black truncate">{item.fileName}</p>
                    <p className="text-[10px] text-neutral-600 font-mono">{item.sizeFormatted || item.date}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleCopy(item.url, `hist_${idx}`)}
                    className="p-1.5 rounded border border-black bg-white hover:bg-neutral-100 text-black cursor-pointer"
                    title="Salin Tautan"
                  >
                    {copiedField === `hist_${idx}` ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded border border-black bg-white hover:bg-neutral-100 text-black"
                    title="Buka Tautan"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </main>
  );
}
