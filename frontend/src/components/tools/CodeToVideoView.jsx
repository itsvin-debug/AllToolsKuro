/**
 * Kuro Studio - Code to Video Studio
 * Konversi kode visual HTML/CSS/JS menjadi video animasi 3D sinematik
 * dengan Three.js 3D compositor, awan, partikel udara, dan ekspor MP4/WebM.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowLeft,
  Play,
  Pause,
  RotateCcw,
  Copy,
  Check,
  Download,
  Upload,
  Code2,
  Sparkles,
  Cloud,
  Layers,
  Type,
  Sliders,
  AlertCircle,
  Clapperboard,
  Film,
  Video,
  Eye,
  Maximize2,
  Minimize2,
  CheckCircle2,
  Flame
} from 'lucide-react';
import { CODE_TEMPLATES } from '../../utils/codeToVideoTemplates';
import {
  CodeToVideoCompositor,
  CodeSandboxRunner,
  computeTargetDimensions,
  exportVideo
} from '../../utils/codeToVideoEngine';

export default function CodeToVideoView({ onBack, onShowToast, lang = 'id' }) {
  // --- STATE TEMPLATE & KODE ---
  const [selectedTemplateId, setSelectedTemplateId] = useState('neon-wave');
  const [code, setCode] = useState(() => {
    const saved = localStorage.getItem('kuro_code_to_video_code');
    if (saved) return saved;
    return CODE_TEMPLATES[0].code;
  });
  const [copied, setCopied] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [errorLog, setErrorLog] = useState(null);

  // --- STATE PENGATURAN VISUAL 3D & ATMOSPHERE ---
  const [settings, setSettings] = useState(() => {
    return { ...CODE_TEMPLATES[0].defaults };
  });

  const [activeTab, setActiveTab] = useState('camera'); // 'hud', 'camera', 'fx'

  // --- STATE VIEWPORT & PREVIEW ---
  const [isPlaying, setIsPlaying] = useState(true);
  const [fpsDisplay, setFpsDisplay] = useState(60);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // --- STATE EKSPOR VIDEO ---
  const [exportRes, setExportRes] = useState('1080p');
  const [exportAspect, setExportAspect] = useState('16:9');
  const [exportFps, setExportFps] = useState(30);
  const [exportDuration, setExportDuration] = useState(10);
  const [customDuration, setCustomDuration] = useState(10);
  const [isCustomDuration, setIsCustomDuration] = useState(false);
  const [exportBitrate, setExportBitrate] = useState('standard');

  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState({
    frame: 0,
    totalFrames: 0,
    percent: 0,
    timeRemainingSec: 0
  });
  const [renderResult, setRenderResult] = useState(null);

  // --- REFS ---
  const canvasRef = useRef(null);
  const viewportRef = useRef(null);
  const compositorRef = useRef(null);
  const sandboxRef = useRef(null);
  const animationFrameId = useRef(null);
  const startTimeRef = useRef(performance.now());
  const pausedTimeRef = useRef(0);
  const abortControllerRef = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);

  // Simpan kode otomatis ke localStorage
  useEffect(() => {
    try {
      localStorage.setItem('kuro_code_to_video_code', code);
    } catch {
      // Abaikan jika quota penuh
    }
  }, [code]);

  // Inisialisasi Compositor & Sandbox Runner saat komponen dimuat
  useEffect(() => {
    if (!canvasRef.current) return;

    const { width, height } = computeTargetDimensions('720p', exportAspect);
    const comp = new CodeToVideoCompositor(canvasRef.current, width, height);
    compositorRef.current = comp;

    const sand = new CodeSandboxRunner(comp);
    sandboxRef.current = sand;
    sand.updateCode(code, 'auto');

    startTimeRef.current = performance.now();

    // Render loop untuk live preview
    let lastTime = performance.now();
    let frameCount = 0;
    let lastFpsUpdate = performance.now();

    const loop = (now) => {
      if (isPlaying && compositorRef.current && sandboxRef.current) {
        const elapsed = (now - startTimeRef.current) / 1000;

        // 1. Jalankan animasi sandbox
        sandboxRef.current.renderStep(elapsed);
        if (sandboxRef.current.lastError) {
          setErrorLog(sandboxRef.current.lastError);
        }

        // 2. Render 3D Scene Three.js & HUD
        compositorRef.current.renderFrame(elapsed, settings);

        // Hitung FPS live
        frameCount++;
        if (now - lastFpsUpdate >= 1000) {
          setFpsDisplay(frameCount);
          frameCount = 0;
          lastFpsUpdate = now;
        }
      }

      animationFrameId.current = requestAnimationFrame(loop);
    };

    animationFrameId.current = requestAnimationFrame(loop);

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
      if (sandboxRef.current) {
        sandboxRef.current.dispose();
      }
      if (compositorRef.current) {
        compositorRef.current.dispose();
      }
    };
  }, []);

  // Update aspect ratio di live preview
  useEffect(() => {
    if (!compositorRef.current) return;
    const { width, height } = computeTargetDimensions('720p', exportAspect);
    compositorRef.current.resize(width, height);
  }, [exportAspect]);

  // Update kode di sandbox saat user mengedit kode
  const handleApplyCode = useCallback(() => {
    if (sandboxRef.current) {
      sandboxRef.current.updateCode(code, 'auto');
      if (sandboxRef.current.lastError) {
        setErrorLog(sandboxRef.current.lastError);
        onShowToast?.(sandboxRef.current.lastError, 'error');
      } else {
        setErrorLog(null);
        onShowToast?.('Pratinjau visual berhasil diperbarui.', 'success');
      }
    }
  }, [code, onShowToast]);

  // Ganti Template Preset
  const handleSelectTemplate = (templateId) => {
    const tmpl = CODE_TEMPLATES.find((t) => t.id === templateId);
    if (!tmpl) return;

    setSelectedTemplateId(templateId);
    setCode(tmpl.code);
    setSettings({ ...tmpl.defaults });
    setErrorLog(null);

    if (sandboxRef.current) {
      sandboxRef.current.updateCode(tmpl.code, 'auto');
    }
    onShowToast?.(`Template "${tmpl.name}" dimuat.`, 'info');
  };

  // Salin Kode ke Clipboard
  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      onShowToast?.('Kode berhasil disalin ke clipboard.', 'success');
    } catch {
      onShowToast?.('Gagal menyalin kode.', 'error');
    }
  };

  // Reset Kode ke template awal
  const handleResetCode = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      setTimeout(() => setConfirmReset(false), 3000);
      return;
    }
    const currentTmpl = CODE_TEMPLATES.find((t) => t.id === selectedTemplateId) || CODE_TEMPLATES[0];
    setCode(currentTmpl.code);
    setSettings({ ...currentTmpl.defaults });
    setConfirmReset(false);
    setErrorLog(null);

    if (sandboxRef.current) {
      sandboxRef.current.updateCode(currentTmpl.code, 'auto');
    }
    onShowToast?.('Kode berhasil direset ke bawaan template.', 'info');
  };

  // Ekspor Kode ke File (.html atau .js)
  const handleExportCodeFile = () => {
    const isHtml = code.trim().startsWith('<') || code.includes('<html');
    const ext = isHtml ? 'html' : 'js';
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kuro_animation_${selectedTemplateId}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    onShowToast?.(`File kuro_animation_${selectedTemplateId}.${ext} berhasil diunduh.`, 'success');
  };

  // Impor File Kode (.html, .js, .txt)
  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content === 'string') {
        setCode(content);
        if (sandboxRef.current) {
          sandboxRef.current.updateCode(content, 'auto');
        }
        onShowToast?.(`File "${file.name}" berhasil diimpor.`, 'success');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Handle tombol Tab di Textarea untuk indentasi 2 spasi
  const handleKeyDown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.target;
      const start = target.selectionStart;
      const end = target.selectionEnd;

      const newCode = code.substring(0, start) + '  ' + code.substring(end);
      setCode(newCode);

      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + 2;
      }, 0);
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleApplyCode();
    }
  };

  // Toggle Play / Pause
  const handleTogglePlay = () => {
    setIsPlaying((prev) => !prev);
  };

  // Restart Animasi ke Detik 0
  const handleRestart = () => {
    startTimeRef.current = performance.now();
    setIsPlaying(true);
  };

  // Toggle Fullscreen Viewport
  const handleToggleFullscreen = () => {
    if (!viewportRef.current) return;
    if (!document.fullscreenElement) {
      viewportRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // --- MULAI RENDER VIDEO ---
  const handleStartRender = async () => {
    if (!compositorRef.current || !sandboxRef.current) return;

    setIsRendering(true);
    setRenderResult(null);
    setRenderProgress({
      frame: 0,
      totalFrames: 1,
      percent: 0,
      timeRemainingSec: 0
    });

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const finalDuration = isCustomDuration ? Math.max(1, Math.min(customDuration, 60)) : exportDuration;

    try {
      const result = await exportVideo({
        compositor: compositorRef.current,
        sandbox: sandboxRef.current,
        settings,
        resolution: exportRes,
        aspectRatio: exportAspect,
        fps: exportFps,
        duration: finalDuration,
        bitratePreset: exportBitrate,
        signal: abortController.signal,
        onProgress: (p) => {
          setRenderProgress(p);
        }
      });

      setRenderResult(result);
      onShowToast?.(`Video ${result.format.toUpperCase()} berhasil dirender (${result.sizeMB} MB)!`, 'success');
    } catch (err) {
      if (abortController.signal.aborted) {
        onShowToast?.('Proses render dibatalkan.', 'info');
      } else {
        onShowToast?.(`Gagal render video: ${err.message}`, 'error');
      }
    } finally {
      setIsRendering(false);
      abortControllerRef.current = null;

      // Kembalikan ukuran canvas viewport ke pratinjau normal
      const { width, height } = computeTargetDimensions('720p', exportAspect);
      compositorRef.current.resize(width, height);
    }
  };

  // Batalkan Render
  const handleCancelRender = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  // Unduh Video Hasil Render
  const handleDownloadVideo = () => {
    if (!renderResult?.url) return;
    const a = document.createElement('a');
    a.href = renderResult.url;
    a.download = `KuroStudio_Video_${Date.now()}.${renderResult.format}`;
    a.click();
    onShowToast?.('Video sedang diunduh.', 'success');
  };

  // Hitung jumlah baris untuk nomor baris di editor
  const lineCount = code.split('\n').length;
  const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1);

  return (
    <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-6">
      
      {/* ─── 1. TOP HEADER & TEMPLATE SELECTOR ─── */}
      <div className="bg-white border-2 border-black shadow-[4px_4px_0px_#000] p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 sm:p-2.5 bg-[#fafafa] hover:bg-neutral-200 border-2 border-black shadow-[2px_2px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 transition-all"
            title="Kembali ke Beranda"
          >
            <ArrowLeft className="w-5 h-5 text-black" />
          </button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-black flex items-center gap-2">
                <Clapperboard className="w-6 h-6 text-black fill-yellow-400" />
                Code to Video Studio
              </h1>
              <span className="px-2.5 py-0.5 bg-yellow-300 text-black border-2 border-black text-xs font-black shadow-[1.5px_1.5px_0px_#000]">
                NEW • 3D RENDER
              </span>
              <span className="px-2.5 py-0.5 bg-cyan-300 text-black border-2 border-black text-xs font-black shadow-[1.5px_1.5px_0px_#000] hidden sm:inline-block">
                CLIENT-SIDE MP4
              </span>
            </div>
            <p className="text-xs sm:text-sm text-neutral-600 font-semibold mt-0.5">
              Ubah kode visual HTML/CSS/JS menjadi video animasi 3D sinematik dengan partikel, awan, dan ekspor 1440p.
            </p>
          </div>
        </div>

        {/* Pemilih Template Animasi */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <span className="text-xs font-black uppercase text-neutral-500 whitespace-nowrap">
            Template:
          </span>
          <select
            value={selectedTemplateId}
            onChange={(e) => handleSelectTemplate(e.target.value)}
            className="flex-1 md:w-60 bg-white border-2 border-black p-2 font-bold text-xs sm:text-sm shadow-[2px_2px_0px_#000] focus:outline-none focus:ring-2 focus:ring-black cursor-pointer"
          >
            {CODE_TEMPLATES.map((tmpl) => (
              <option key={tmpl.id} value={tmpl.id}>
                {tmpl.name} ({tmpl.badge})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ─── 2. MAIN 2-COLUMN WORKSPACE (EDITOR & 3D PREVIEW) ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* ─── KOLOM KIRI (EDITOR KODE) ─── */}
        <div className="lg:col-span-6 bg-white border-2 border-black shadow-[4px_4px_0px_#000] flex flex-col overflow-hidden">
          
          {/* Action Header Editor */}
          <div className="p-3 bg-neutral-100 border-b-2 border-black flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Code2 className="w-4 h-4 text-black" />
              <span className="text-xs font-black uppercase tracking-wider text-black">
                Editor Animasi
              </span>
              <span className="text-[10px] bg-neutral-200 border border-black px-1.5 py-0.5 font-mono font-bold">
                Ctrl+Enter: Run
              </span>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Tombol Jalankan / Update */}
              <button
                onClick={handleApplyCode}
                className="px-3 py-1 bg-green-400 hover:bg-green-300 text-black border-2 border-black shadow-[2px_2px_0px_#000] font-black text-xs flex items-center gap-1 active:translate-x-0.5 active:translate-y-0.5 transition-all"
                title="Terapkan Perubahan Kode (Ctrl+Enter)"
              >
                <Play className="w-3.5 h-3.5 fill-black" />
                Update
              </button>

              {/* Tombol Salin */}
              <button
                onClick={handleCopyCode}
                className="px-2.5 py-1 bg-white hover:bg-neutral-200 text-black border-2 border-black shadow-[1.5px_1.5px_0px_#000] font-bold text-xs flex items-center gap-1 active:translate-x-0.5 active:translate-y-0.5 transition-all"
                title="Salin Kode ke Clipboard"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-green-700" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Tersalin' : 'Salin'}
              </button>

              {/* Tombol Reset */}
              <button
                onClick={handleResetCode}
                className={`px-2.5 py-1 border-2 border-black shadow-[1.5px_1.5px_0px_#000] font-bold text-xs flex items-center gap-1 active:translate-x-0.5 active:translate-y-0.5 transition-all ${
                  confirmReset ? 'bg-red-500 text-white animate-pulse' : 'bg-white hover:bg-neutral-200 text-black'
                }`}
                title="Reset Kode ke Bawaan Template"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {confirmReset ? 'Yakin?' : 'Reset'}
              </button>

              {/* Tombol Ekspor Kode */}
              <button
                onClick={handleExportCodeFile}
                className="px-2 py-1 bg-white hover:bg-neutral-200 text-black border-2 border-black shadow-[1.5px_1.5px_0px_#000] font-bold text-xs flex items-center gap-1"
                title="Unduh Berkas Kode"
              >
                <Download className="w-3.5 h-3.5" />
              </button>

              {/* Tombol Impor File */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-2 py-1 bg-white hover:bg-neutral-200 text-black border-2 border-black shadow-[1.5px_1.5px_0px_#000] font-bold text-xs flex items-center gap-1"
                title="Unggah Berkas Kode (.html, .js)"
              >
                <Upload className="w-3.5 h-3.5" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".html,.htm,.js,.txt"
                onChange={handleImportFile}
                className="hidden"
              />
            </div>
          </div>

          {/* Area Editor Teks dengan Baris Nomor */}
          <div className="relative flex bg-[#121218] text-white font-mono text-xs sm:text-sm min-h-[440px] max-h-[560px] overflow-hidden">
            {/* Nomor Baris */}
            <div className="w-12 bg-[#09090d] text-neutral-500 py-3 select-none text-right pr-3 font-mono text-xs border-r border-neutral-800 overflow-hidden leading-relaxed">
              {lineNumbers.map((num) => (
                <div key={num}>{num}</div>
              ))}
            </div>

            {/* Textarea Kode */}
            <textarea
              ref={textareaRef}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={handleKeyDown}
              spellCheck="false"
              className="flex-1 p-3 bg-transparent text-emerald-400 font-mono text-xs sm:text-sm leading-relaxed resize-none focus:outline-none overflow-y-auto whitespace-pre selection:bg-neutral-700 selection:text-white"
              placeholder="// Tulis kode animasi Canvas 2D atau HTML/CSS di sini..."
            />
          </div>

          {/* Log Kesalahan (Error Console) jika ada */}
          {errorLog && (
            <div className="p-3 bg-red-100 border-t-2 border-black text-red-900 font-mono text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Error Console:</span> {errorLog}
              </div>
            </div>
          )}
        </div>

        {/* ─── KOLOM KANAN (3D VIEWPORT & VISUAL CONTROLS) ─── */}
        <div className="lg:col-span-6 space-y-4">
          
          {/* 3D Viewport Box */}
          <div
            ref={viewportRef}
            className="bg-black border-2 border-black shadow-[4px_4px_0px_#000] p-2 relative flex flex-col items-center justify-center overflow-hidden"
          >
            {/* Frame Aspect Ratio Container */}
            <div className="w-full relative flex items-center justify-center bg-neutral-950 overflow-hidden">
              <canvas
                ref={canvasRef}
                className="w-full h-auto object-contain max-h-[420px] rounded-sm"
              />
            </div>

            {/* Viewport Floating Controls Bar */}
            <div className="w-full bg-neutral-900/90 text-white p-2.5 mt-2 flex items-center justify-between border border-neutral-700 text-xs">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleTogglePlay}
                  className="p-1.5 bg-white text-black hover:bg-neutral-200 border border-black font-black"
                  title={isPlaying ? 'Jeda Pratinjau' : 'Jalankan Pratinjau'}
                >
                  {isPlaying ? <Pause className="w-3.5 h-3.5 fill-black" /> : <Play className="w-3.5 h-3.5 fill-black" />}
                </button>
                <button
                  onClick={handleRestart}
                  className="p-1.5 bg-neutral-800 text-white hover:bg-neutral-700 border border-neutral-600 font-bold"
                  title="Mulai Ulang dari Detik 0"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono text-[11px] text-neutral-400 pl-1">
                  FPS: <span className="text-green-400 font-bold">{fpsDisplay}</span>
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono px-2 py-0.5 bg-neutral-800 border border-neutral-700 text-yellow-300">
                  {exportAspect} &bull; 3D ENGINE
                </span>
                <button
                  onClick={handleToggleFullscreen}
                  className="p-1.5 bg-neutral-800 text-white hover:bg-neutral-700 border border-neutral-600"
                  title="Layar Penuh"
                >
                  {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          {/* Tabbed Controls Panel */}
          <div className="bg-white border-2 border-black shadow-[4px_4px_0px_#000] p-4">
            
            {/* Navigasi Tab */}
            <div className="flex border-b-2 border-black mb-4 gap-2">
              <button
                onClick={() => setActiveTab('camera')}
                className={`px-3 py-2 text-xs font-black uppercase flex items-center gap-1.5 border-t-2 border-l-2 border-r-2 border-black -mb-[2px] ${
                  activeTab === 'camera' ? 'bg-yellow-300 text-black' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                3D Kamera & Latar
              </button>

              <button
                onClick={() => setActiveTab('fx')}
                className={`px-3 py-2 text-xs font-black uppercase flex items-center gap-1.5 border-t-2 border-l-2 border-r-2 border-black -mb-[2px] ${
                  activeTab === 'fx' ? 'bg-cyan-300 text-black' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Awan & Partikel
              </button>

              <button
                onClick={() => setActiveTab('hud')}
                className={`px-3 py-2 text-xs font-black uppercase flex items-center gap-1.5 border-t-2 border-l-2 border-r-2 border-black -mb-[2px] ${
                  activeTab === 'hud' ? 'bg-pink-300 text-black' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                <Type className="w-3.5 h-3.5" />
                Tipografi HUD
              </button>
            </div>

            {/* TAB 1: 3D KAMERA & LATAR */}
            {activeTab === 'camera' && (
              <div className="space-y-4 text-xs">
                {/* Presets Sudut Cepat */}
                <div>
                  <span className="font-bold text-neutral-700 block mb-1.5">Preset Sudut 3D:</span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {[
                      { name: 'Flat Depan', rx: 0, ry: 0, rz: 0 },
                      { name: 'Isometric', rx: 22, ry: -25, rz: 0 },
                      { name: 'Cinematic Tilt', rx: 16, ry: -20, rz: 0 },
                      { name: 'Top-Down', rx: 45, ry: 0, rz: 0 }
                    ].map((p) => (
                      <button
                        key={p.name}
                        onClick={() =>
                          setSettings((s) => ({
                            ...s,
                            rotateX: p.rx,
                            rotateY: p.ry,
                            rotateZ: p.rz
                          }))
                        }
                        className="p-1.5 bg-neutral-100 hover:bg-neutral-200 border border-black font-bold text-center active:bg-yellow-200 transition-colors"
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Slider Rotasi Pitch (X), Yaw (Y), Roll (Z) */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <div className="flex justify-between font-bold mb-1">
                      <span>Pitch (X):</span>
                      <span className="font-mono">{settings.rotateX}°</span>
                    </div>
                    <input
                      type="range"
                      min="-60"
                      max="60"
                      value={settings.rotateX}
                      onChange={(e) => setSettings((s) => ({ ...s, rotateX: Number(e.target.value) }))}
                      className="w-full accent-black cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between font-bold mb-1">
                      <span>Yaw (Y):</span>
                      <span className="font-mono">{settings.rotateY}°</span>
                    </div>
                    <input
                      type="range"
                      min="-60"
                      max="60"
                      value={settings.rotateY}
                      onChange={(e) => setSettings((s) => ({ ...s, rotateY: Number(e.target.value) }))}
                      className="w-full accent-black cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between font-bold mb-1">
                      <span>Roll (Z):</span>
                      <span className="font-mono">{settings.rotateZ}</span>
                    </div>
                    <input
                      type="range"
                      min="-45"
                      max="45"
                      value={settings.rotateZ}
                      onChange={(e) => setSettings((s) => ({ ...s, rotateZ: Number(e.target.value) }))}
                      className="w-full accent-black cursor-pointer"
                    />
                  </div>
                </div>

                {/* Zoom & Auto-Orbit */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-neutral-200">
                  <div>
                    <div className="flex justify-between font-bold mb-1">
                      <span>Zoom Kamera:</span>
                      <span className="font-mono">{settings.zoom}x</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="2.0"
                      step="0.05"
                      value={settings.zoom}
                      onChange={(e) => setSettings((s) => ({ ...s, zoom: Number(e.target.value) }))}
                      className="w-full accent-black cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between font-bold mb-1">
                      <span>Kecepatan Gerak:</span>
                      <span className="font-mono">{settings.motionSpeed}x</span>
                    </div>
                    <input
                      type="range"
                      min="0.25"
                      max="3.0"
                      step="0.25"
                      value={settings.motionSpeed}
                      onChange={(e) => setSettings((s) => ({ ...s, motionSpeed: Number(e.target.value) }))}
                      className="w-full accent-black cursor-pointer"
                    />
                  </div>
                </div>

                {/* Auto-Orbit Toggle */}
                <div className="flex items-center justify-between p-2.5 bg-neutral-50 border border-black">
                  <div>
                    <span className="font-black text-black block">Auto-Orbit / Melayang 3D</span>
                    <span className="text-[11px] text-neutral-500">Efek gerakan mengambang halus bernapas di ruang 3D</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.autoOrbit}
                    onChange={(e) => setSettings((s) => ({ ...s, autoOrbit: e.target.checked }))}
                    className="w-5 h-5 accent-black cursor-pointer"
                  />
                </div>

                {/* Latar Belakang */}
                <div className="pt-2 border-t border-neutral-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-neutral-800">Tipe Latar Belakang:</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSettings((s) => ({ ...s, bgType: 'gradient' }))}
                        className={`px-2 py-0.5 border border-black font-bold text-[11px] ${
                          settings.bgType === 'gradient' ? 'bg-black text-white' : 'bg-white text-black'
                        }`}
                      >
                        Gradien
                      </button>
                      <button
                        onClick={() => setSettings((s) => ({ ...s, bgType: 'solid' }))}
                        className={`px-2 py-0.5 border border-black font-bold text-[11px] ${
                          settings.bgType === 'solid' ? 'bg-black text-white' : 'bg-white text-black'
                        }`}
                      >
                        Solid
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-neutral-600">Warna 1:</span>
                      <input
                        type="color"
                        value={settings.bgColor1}
                        onChange={(e) => setSettings((s) => ({ ...s, bgColor1: e.target.value }))}
                        className="w-8 h-8 p-0 border border-black cursor-pointer"
                      />
                    </div>
                    {settings.bgType === 'gradient' && (
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-neutral-600">Warna 2:</span>
                        <input
                          type="color"
                          value={settings.bgColor2}
                          onChange={(e) => setSettings((s) => ({ ...s, bgColor2: e.target.value }))}
                          className="w-8 h-8 p-0 border border-black cursor-pointer"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: AWAN & PARTIKEL */}
            {activeTab === 'fx' && (
              <div className="space-y-4 text-xs">
                {/* 1. Pengaturan Awan 3D */}
                <div className="p-3 bg-neutral-50 border border-black space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Cloud className="w-4 h-4 text-black" />
                      <span className="font-black text-black">Awan Atmosferik 3D</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.clouds}
                      onChange={(e) => setSettings((s) => ({ ...s, clouds: e.target.checked }))}
                      className="w-4 h-4 accent-black cursor-pointer"
                    />
                  </div>

                  {settings.clouds && (
                    <div className="space-y-2 pt-1 border-t border-neutral-200">
                      <div>
                        <div className="flex justify-between font-bold mb-1">
                          <span>Densitas / Opasitas Awan:</span>
                          <span className="font-mono">{Math.round(settings.cloudDensity * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min="0.05"
                          max="0.8"
                          step="0.05"
                          value={settings.cloudDensity}
                          onChange={(e) => setSettings((s) => ({ ...s, cloudDensity: Number(e.target.value) }))}
                          className="w-full accent-black cursor-pointer"
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="font-bold">Warna / Tint Awan:</span>
                        <input
                          type="color"
                          value={settings.cloudColor}
                          onChange={(e) => setSettings((s) => ({ ...s, cloudColor: e.target.value }))}
                          className="w-8 h-8 p-0 border border-black cursor-pointer"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. Pengaturan Partikel Udara 3D */}
                <div className="p-3 bg-neutral-50 border border-black space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-black" />
                      <span className="font-black text-black">Partikel Udara 3D</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.particles}
                      onChange={(e) => setSettings((s) => ({ ...s, particles: e.target.checked }))}
                      className="w-4 h-4 accent-black cursor-pointer"
                    />
                  </div>

                  {settings.particles && (
                    <div className="space-y-2.5 pt-1 border-t border-neutral-200">
                      <div>
                        <span className="font-bold block mb-1">Gaya Partikel:</span>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1">
                          {[
                            { id: 'dust', label: 'Bokeh Dust' },
                            { id: 'stars', label: 'Stars' },
                            { id: 'snow', label: 'Soft Snow' },
                            { id: 'sparks', label: 'Neon Sparks' }
                          ].map((st) => (
                            <button
                              key={st.id}
                              onClick={() => setSettings((s) => ({ ...s, particleStyle: st.id }))}
                              className={`p-1.5 border border-black font-bold text-center text-[11px] ${
                                settings.particleStyle === st.id ? 'bg-cyan-300 text-black' : 'bg-white hover:bg-neutral-100'
                              }`}
                            >
                              {st.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between font-bold mb-1">
                          <span>Kepadatan Partikel:</span>
                          <span className="font-mono">{settings.particleCount} titik</span>
                        </div>
                        <input
                          type="range"
                          min="25"
                          max="300"
                          step="25"
                          value={settings.particleCount}
                          onChange={(e) => setSettings((s) => ({ ...s, particleCount: Number(e.target.value) }))}
                          className="w-full accent-black cursor-pointer"
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="font-bold">Warna Cahaya Partikel:</span>
                        <input
                          type="color"
                          value={settings.particleColor}
                          onChange={(e) => setSettings((s) => ({ ...s, particleColor: e.target.value }))}
                          className="w-8 h-8 p-0 border border-black cursor-pointer"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 3: TIPOGRAFI HUD */}
            {activeTab === 'hud' && (
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between p-2.5 bg-neutral-50 border border-black">
                  <div>
                    <span className="font-black text-black block">Tampilkan HUD Overlay</span>
                    <span className="text-[11px] text-neutral-500">Badge judul & subjudul neobrutalist di layar video</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.hudEnabled}
                    onChange={(e) => setSettings((s) => ({ ...s, hudEnabled: e.target.checked }))}
                    className="w-5 h-5 accent-black cursor-pointer"
                  />
                </div>

                {settings.hudEnabled && (
                  <div className="space-y-3 pt-2">
                    <div>
                      <label className="font-bold text-neutral-800 block mb-1">Judul Utama (Title):</label>
                      <input
                        type="text"
                        value={settings.hudTitle}
                        onChange={(e) => setSettings((s) => ({ ...s, hudTitle: e.target.value }))}
                        placeholder="Contoh: CYBER HARMONICS"
                        className="w-full bg-white border-2 border-black p-2 font-bold font-mono text-xs focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="font-bold text-neutral-800 block mb-1">Subjudul (Subtitle):</label>
                      <input
                        type="text"
                        value={settings.hudSubtitle}
                        onChange={(e) => setSettings((s) => ({ ...s, hudSubtitle: e.target.value }))}
                        placeholder="Contoh: NEON OSCILLOSCOPE FREQUENCY"
                        className="w-full bg-white border-2 border-black p-2 font-bold font-mono text-xs focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="font-bold text-neutral-800 block mb-1">Posisi HUD di Layar:</label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                        {[
                          { id: 'bottom-left', label: 'Bawah Kiri' },
                          { id: 'bottom-center', label: 'Bawah Tengah' },
                          { id: 'top-left', label: 'Atas Kiri' },
                          { id: 'top-center', label: 'Atas Tengah' }
                        ].map((pos) => (
                          <button
                            key={pos.id}
                            onClick={() => setSettings((s) => ({ ...s, hudPosition: pos.id }))}
                            className={`p-1.5 border border-black font-bold text-[11px] text-center ${
                              settings.hudPosition === pos.id ? 'bg-pink-300 text-black' : 'bg-white hover:bg-neutral-100'
                            }`}
                          >
                            {pos.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── 3. BOTTOM PANEL: EKSPOR VIDEO SINEMATIK ─── */}
      <div className="bg-white border-2 border-black shadow-[4px_4px_0px_#000] p-4 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-3 border-b-2 border-black gap-2">
          <div>
            <h2 className="text-lg sm:text-xl font-black uppercase text-black flex items-center gap-2">
              <Film className="w-5 h-5 text-black fill-cyan-400" />
              Pengaturan Ekspor Video Sinematik
            </h2>
            <p className="text-xs sm:text-sm text-neutral-600 font-semibold">
              Render video berkualitas tinggi langsung di browser tanpa perantara server.
            </p>
          </div>
          <span className="px-3 py-1 bg-neutral-100 border border-black font-mono font-bold text-xs">
            Format: {typeof window !== 'undefined' && 'VideoEncoder' in window ? 'MP4 (H.264)' : 'WebM'}
          </span>
        </div>

        {/* Grid Opsi Pengaturan Ekspor */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 text-xs">
          
          {/* Resolusi */}
          <div className="space-y-1.5">
            <label className="font-black uppercase tracking-wider text-neutral-700">Resolusi:</label>
            <select
              value={exportRes}
              onChange={(e) => setExportRes(e.target.value)}
              disabled={isRendering}
              className="w-full bg-white border-2 border-black p-2 font-bold shadow-[2px_2px_0px_#000] focus:outline-none"
            >
              <option value="480p">480p (Cepat & Ringan)</option>
              <option value="720p">720p (HD Standar)</option>
              <option value="1080p">1080p (Full HD Tajam)</option>
              <option value="1440p">1440p (2K Ultra HD)</option>
            </select>
          </div>

          {/* Rasio Aspek */}
          <div className="space-y-1.5">
            <label className="font-black uppercase tracking-wider text-neutral-700">Rasio Aspek:</label>
            <select
              value={exportAspect}
              onChange={(e) => setExportAspect(e.target.value)}
              disabled={isRendering}
              className="w-full bg-white border-2 border-black p-2 font-bold shadow-[2px_2px_0px_#000] focus:outline-none"
            >
              <option value="16:9">16:9 (Landscape YouTube)</option>
              <option value="9:16">9:16 (Story / TikTok / Reels)</option>
              <option value="1:1">1:1 (Square Persegi)</option>
              <option value="4:5">4:5 (Feed Vertikal)</option>
              <option value="21:9">21:9 (Ultrawide Bioskop)</option>
            </select>
          </div>

          {/* Frame Rate (FPS) */}
          <div className="space-y-1.5">
            <label className="font-black uppercase tracking-wider text-neutral-700">Frame Rate:</label>
            <select
              value={exportFps}
              onChange={(e) => setExportFps(Number(e.target.value))}
              disabled={isRendering}
              className="w-full bg-white border-2 border-black p-2 font-bold shadow-[2px_2px_0px_#000] focus:outline-none"
            >
              <option value="24">24 FPS (Sinematik Film)</option>
              <option value="30">30 FPS (Standar Halus)</option>
              <option value="60">60 FPS (Ultra Mulus)</option>
            </select>
          </div>

          {/* Durasi */}
          <div className="space-y-1.5">
            <label className="font-black uppercase tracking-wider text-neutral-700">Durasi Video:</label>
            <select
              value={isCustomDuration ? 'custom' : exportDuration}
              onChange={(e) => {
                if (e.target.value === 'custom') {
                  setIsCustomDuration(true);
                } else {
                  setIsCustomDuration(false);
                  setExportDuration(Number(e.target.value));
                }
              }}
              disabled={isRendering}
              className="w-full bg-white border-2 border-black p-2 font-bold shadow-[2px_2px_0px_#000] focus:outline-none"
            >
              <option value="5">5 Detik</option>
              <option value="10">10 Detik</option>
              <option value="15">15 Detik</option>
              <option value="30">30 Detik</option>
              <option value="custom">Kustom (1-60s)...</option>
            </select>

            {isCustomDuration && (
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={customDuration}
                  onChange={(e) => setCustomDuration(Number(e.target.value))}
                  disabled={isRendering}
                  className="w-full bg-white border-2 border-black p-1 font-bold font-mono text-xs"
                />
                <span className="font-bold text-[11px]">detik</span>
              </div>
            )}
          </div>

          {/* Kualitas Bitrate */}
          <div className="space-y-1.5">
            <label className="font-black uppercase tracking-wider text-neutral-700">Bitrate Kualitas:</label>
            <select
              value={exportBitrate}
              onChange={(e) => setExportBitrate(e.target.value)}
              disabled={isRendering}
              className="w-full bg-white border-2 border-black p-2 font-bold shadow-[2px_2px_0px_#000] focus:outline-none"
            >
              <option value="light">Ringan (2.5 Mbps)</option>
              <option value="standard">Standar (6 Mbps)</option>
              <option value="high">Tinggi (12 Mbps)</option>
              <option value="ultra">Ultra (24 Mbps)</option>
            </select>
          </div>
        </div>

        {/* Tombol Mulai Render */}
        {!isRendering && !renderResult && (
          <button
            onClick={handleStartRender}
            className="w-full py-4 bg-black text-white hover:bg-neutral-800 border-2 border-black shadow-[4px_4px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 font-black text-base uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <Video className="w-5 h-5 text-yellow-400 fill-yellow-400" />
            Mulai Render Video ({exportRes} &bull; {isCustomDuration ? customDuration : exportDuration}s)
          </button>
        )}

        {/* Indikator Status Render Aktif */}
        {isRendering && (
          <div className="p-4 bg-yellow-50 border-2 border-black space-y-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 font-bold text-xs">
              <span className="flex items-center gap-2 text-black">
                <span className="w-3 h-3 rounded-full bg-yellow-500 animate-ping inline-block" />
                Sedang me-render frame: {renderProgress.frame} / {renderProgress.totalFrames} ({renderProgress.percent}%)
              </span>
              <span className="font-mono text-neutral-600">
                Sisa waktu: ~{renderProgress.timeRemainingSec} detik lagi
              </span>
            </div>

            {/* Progress Bar dengan Efek Garis Neobrutalist */}
            <div className="w-full h-6 bg-white border-2 border-black relative overflow-hidden">
              <div
                className="h-full bg-black transition-all duration-150"
                style={{ width: `${renderProgress.percent}%` }}
              />
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleCancelRender}
                className="px-4 py-1.5 bg-red-500 hover:bg-red-600 text-white border-2 border-black shadow-[2px_2px_0px_#000] font-black text-xs uppercase cursor-pointer"
              >
                Batalkan Render
              </button>
            </div>
          </div>
        )}

        {/* Hasil Render Selesai */}
        {renderResult && (
          <div className="p-4 sm:p-5 bg-green-50 border-2 border-black space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-700" />
                <span className="font-black text-base text-black uppercase">
                  Video Berhasil Dirender!
                </span>
              </div>
              <div className="flex items-center gap-2 font-mono font-bold text-xs">
                <span className="px-2 py-0.5 bg-white border border-black">
                  {renderResult.width}x{renderResult.height}
                </span>
                <span className="px-2 py-0.5 bg-white border border-black">
                  {renderResult.sizeMB} MB
                </span>
                <span className="px-2 py-0.5 bg-yellow-300 border border-black">
                  {renderResult.format.toUpperCase()}
                </span>
              </div>
            </div>

            {/* Video Player Hasil Render */}
            <div className="max-w-md mx-auto border-2 border-black bg-black overflow-hidden shadow-[3px_3px_0px_#000]">
              <video
                src={renderResult.url}
                controls
                autoPlay
                loop
                playsInline
                className="w-full h-auto object-contain max-h-[360px]"
              />
            </div>

            {/* Tombol Aksi Download & Render Ulang */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                onClick={handleDownloadVideo}
                className="w-full sm:w-auto px-6 py-3 bg-green-400 hover:bg-green-300 text-black border-2 border-black shadow-[3px_3px_0px_#000] font-black text-sm uppercase flex items-center justify-center gap-2 active:translate-x-0.5 active:translate-y-0.5 transition-all cursor-pointer"
              >
                <Download className="w-4 h-4" />
                Unduh Video ({renderResult.format.toUpperCase()})
              </button>

              <button
                onClick={() => setRenderResult(null)}
                className="w-full sm:w-auto px-6 py-3 bg-white hover:bg-neutral-100 text-black border-2 border-black shadow-[3px_3px_0px_#000] font-bold text-sm uppercase flex items-center justify-center gap-2 active:translate-x-0.5 active:translate-y-0.5 transition-all cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                Ubah Opsi & Render Ulang
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
