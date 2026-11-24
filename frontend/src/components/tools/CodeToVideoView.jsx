/**
 * Kuro Studio - Code to Video Studio v3
 * Re-Architecture: True Full-Screen Cinematic + Deterministic 60fps HD Video Renderer.
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
  Type,
  Sliders,
  AlertCircle,
  Clapperboard,
  Film,
  Video,
  Maximize2,
  Minimize2,
  CheckCircle2,
  Tv,
  Maximize,
  SlidersHorizontal,
  Flame,
  Layers
} from 'lucide-react';
import {
  CODE_TEMPLATES,
  buildCompositeHtml
} from '../../utils/codeToVideoTemplates';
import {
  CodeToVideoCompositor,
  CodeSandboxRunner,
  computeTargetDimensions,
  exportVideo,
  BITRATE_PRESETS
} from '../../utils/codeToVideoEngine';

export default function CodeToVideoView({ onBack, onShowToast, lang = 'id' }) {
  // --- TEMPLATE & MODE EDITOR ---
  const [selectedTemplateId, setSelectedTemplateId] = useState('promo-ad');
  const [editorMode, setEditorMode] = useState('hybrid'); // 'hybrid' | 'canvas'
  const [hybridTab, setHybridTab] = useState('all'); // 'all' | 'html' | 'css' | 'js'

  // State potongan kode
  const [codeAll, setCodeAll] = useState(() => {
    return localStorage.getItem('kuro_c2v_code_all') ||
      buildCompositeHtml(CODE_TEMPLATES[0].html, CODE_TEMPLATES[0].css, CODE_TEMPLATES[0].js);
  });
  const [codeHtml, setCodeHtml] = useState(CODE_TEMPLATES[0].html || '');
  const [codeCss, setCodeCss] = useState(CODE_TEMPLATES[0].css || '');
  const [codeJs, setCodeJs] = useState(CODE_TEMPLATES[0].js || '');
  const [codeCanvas, setCodeCanvas] = useState(CODE_TEMPLATES[2].code || '');

  const [copied, setCopied] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [errorLog, setErrorLog] = useState(null);

  // --- SETTINGS (SYNCHRONIZED VIA settingsRef) ---
  const [settings, setSettings] = useState(() => {
    return {
      stage3d: false, // Default: OFF (100% Full Layar Sinematik Murni)
      vignette: true,
      colorBoost: false,
      ...CODE_TEMPLATES[0].defaults
    };
  });

  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // Tab Pengaturan Visual & Tab Mobile
  const [activeTab, setActiveTab] = useState('camera'); // 'camera' | 'fx' | 'hud'
  const [mobileSection, setMobileSection] = useState('preview'); // 'preview' | 'editor' | 'export'

  // --- VIEWPORT & PREVIEW STATE ---
  const [isPlaying, setIsPlaying] = useState(true);
  const [fpsDisplay, setFpsDisplay] = useState(60);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // --- EKSPOR VIDEO SETTINGS ---
  const [exportRes, setExportRes] = useState('1080p');
  const [exportAspect, setExportAspect] = useState('16:9');
  const [exportFps, setExportFps] = useState(60);
  const [exportDuration, setExportDuration] = useState(10);
  const [exportBitrate, setExportBitrate] = useState('high');
  const [autoDownload, setAutoDownload] = useState(true);

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
  const abortControllerRef = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);

  // Auto-save kode ke storage
  useEffect(() => {
    try {
      localStorage.setItem('kuro_c2v_code_all', codeAll);
    } catch {}
  }, [codeAll]);

  // Inisialisasi Engine & Sandbox Runner
  useEffect(() => {
    if (!canvasRef.current) return;

    const { width, height } = computeTargetDimensions('720p', exportAspect);
    const comp = new CodeToVideoCompositor(canvasRef.current, width, height);
    compositorRef.current = comp;

    const sand = new CodeSandboxRunner(comp);
    sandboxRef.current = sand;

    const initialCode = editorMode === 'canvas' ? codeCanvas : codeAll;
    sand.updateCode(initialCode, editorMode === 'canvas' ? 'canvas' : 'html');

    startTimeRef.current = performance.now();

    let frameCount = 0;
    let lastFpsUpdate = performance.now();

    // Loop animasi live preview bebas stale-closure
    const loop = (now) => {
      if (isPlaying && compositorRef.current && sandboxRef.current) {
        const curSettings = settingsRef.current;
        const spd = curSettings.motionSpeed || 1.0;
        const elapsed = ((now - startTimeRef.current) / 1000) * spd;

        sandboxRef.current.renderStep(elapsed);
        if (sandboxRef.current.lastError) {
          setErrorLog(sandboxRef.current.lastError);
        }

        compositorRef.current.renderFrame(elapsed, curSettings);

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
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
      if (sandboxRef.current) sandboxRef.current.dispose();
      if (compositorRef.current) compositorRef.current.dispose();
    };
  }, []);

  // Update dimensi pratinjau saat rasio aspek berubah
  useEffect(() => {
    if (!compositorRef.current) return;
    const { width, height } = computeTargetDimensions('720p', exportAspect);
    compositorRef.current.resize(width, height);
    sandboxRef.current?.resize(width, height);
  }, [exportAspect]);

  // Terapkan perubahan kode ke Sandbox
  const handleApplyCode = useCallback(() => {
    if (!sandboxRef.current) return;

    let targetCode = '';
    let targetType = 'auto';

    if (editorMode === 'canvas') {
      targetCode = codeCanvas;
      targetType = 'canvas';
    } else {
      if (hybridTab === 'all') {
        targetCode = codeAll;
      } else {
        targetCode = buildCompositeHtml(codeHtml, codeCss, codeJs);
        setCodeAll(targetCode);
      }
      targetType = 'html';
    }

    sandboxRef.current.updateCode(targetCode, targetType);

    if (sandboxRef.current.lastError) {
      setErrorLog(sandboxRef.current.lastError);
      onShowToast?.(sandboxRef.current.lastError, 'error');
    } else {
      setErrorLog(null);
      onShowToast?.('Pratinjau visual berhasil diperbarui.', 'success');
    }
  }, [editorMode, hybridTab, codeAll, codeHtml, codeCss, codeJs, codeCanvas, onShowToast]);

  // Ganti Template Preset
  const handleSelectTemplate = (templateId) => {
    const tmpl = CODE_TEMPLATES.find((t) => t.id === templateId);
    if (!tmpl) return;

    setSelectedTemplateId(templateId);
    setSettings((prev) => ({
      ...prev,
      ...tmpl.defaults
    }));
    setErrorLog(null);

    if (tmpl.category === 'canvas') {
      setEditorMode('canvas');
      setCodeCanvas(tmpl.code);
      if (sandboxRef.current) sandboxRef.current.updateCode(tmpl.code, 'canvas');
    } else {
      setEditorMode('hybrid');
      setHybridTab('all');
      setCodeHtml(tmpl.html || '');
      setCodeCss(tmpl.css || '');
      setCodeJs(tmpl.js || '');

      const comp = buildCompositeHtml(tmpl.html, tmpl.css, tmpl.js);
      setCodeAll(comp);
      if (sandboxRef.current) sandboxRef.current.updateCode(comp, 'html');
    }

    onShowToast?.(`Template "${tmpl.name}" aktif.`, 'info');
  };

  // Preset Cepat Komposisi
  const handleQuickPreset = (presetName) => {
    if (presetName === 'clean-full') {
      setSettings((s) => ({
        ...s,
        stage3d: false,
        clouds: false,
        particles: false,
        hudEnabled: false,
        vignette: false,
        colorBoost: false
      }));
      onShowToast?.('Mode Fullscreen Murni aktif (semua efek dimatikan).', 'info');
    } else if (presetName === 'cinematic-full') {
      setSettings((s) => ({
        ...s,
        stage3d: false,
        particles: true,
        particleStyle: 'sparks',
        particleCount: 100,
        vignette: true,
        colorBoost: true
      }));
      onShowToast?.('Preset Sinematik aktif (Full Layar + Partikel + Vignette).', 'info');
    } else if (presetName === 'studio-3d') {
      setSettings((s) => ({
        ...s,
        stage3d: true,
        autoOrbit: true,
        clouds: true,
        particles: true,
        particleStyle: 'stars',
        vignette: false
      }));
      onShowToast?.('Preset Studio 3D aktif (Bingkai TV + Orbit + Awan).', 'info');
    }
  };

  // Salin Kode
  const handleCopyCode = async () => {
    try {
      const activeCode =
        editorMode === 'canvas'
          ? codeCanvas
          : hybridTab === 'all'
          ? codeAll
          : hybridTab === 'html'
          ? codeHtml
          : hybridTab === 'css'
          ? codeCss
          : codeJs;
      await navigator.clipboard.writeText(activeCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      onShowToast?.('Kode berhasil disalin.', 'success');
    } catch {
      onShowToast?.('Gagal menyalin kode.', 'error');
    }
  };

  // Reset Kode
  const handleResetCode = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      setTimeout(() => setConfirmReset(false), 3000);
      return;
    }
    const currentTmpl = CODE_TEMPLATES.find((t) => t.id === selectedTemplateId) || CODE_TEMPLATES[0];
    handleSelectTemplate(currentTmpl.id);
    setConfirmReset(false);
    onShowToast?.('Kode direset ke bawaan template.', 'info');
  };

  // Ekspor File Kode
  const handleExportCodeFile = () => {
    const activeCode = editorMode === 'canvas' ? codeCanvas : codeAll;
    const ext = editorMode === 'canvas' ? 'js' : 'html';
    const blob = new Blob([activeCode], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kuro_studio_${selectedTemplateId}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    onShowToast?.(`Berkas kuro_studio_${selectedTemplateId}.${ext} diunduh.`, 'success');
  };

  // Impor File Kode
  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content === 'string') {
        const trimmed = content.trim();
        if (
          trimmed.includes('<!DOCTYPE') ||
          trimmed.includes('<html') ||
          trimmed.includes('<body') ||
          trimmed.includes('<div')
        ) {
          setEditorMode('hybrid');
          setHybridTab('all');
          setCodeAll(content);
          if (sandboxRef.current) sandboxRef.current.updateCode(content, 'html');
        } else {
          setEditorMode('canvas');
          setCodeCanvas(content);
          if (sandboxRef.current) sandboxRef.current.updateCode(content, 'canvas');
        }
        onShowToast?.(`Berkas "${file.name}" berhasil diimpor.`, 'success');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Tab key & Ctrl+Enter handler
  const handleKeyDown = (e, currentSetter, currentVal) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.target;
      const start = target.selectionStart;
      const end = target.selectionEnd;

      const newVal = currentVal.substring(0, start) + '  ' + currentVal.substring(end);
      currentSetter(newVal);

      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + 2;
      }, 0);
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleApplyCode();
    }
  };

  // Controls Player
  const handleTogglePlay = () => setIsPlaying((prev) => !prev);
  const handleRestart = () => {
    startTimeRef.current = performance.now();
    setIsPlaying(true);
  };
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

  // --- MULAI RENDER VIDEO DETERMINISTIK 60 FPS ---
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

    const finalDuration = Math.max(1, Math.min(Number(exportDuration) || 10, 60));

    try {
      const result = await exportVideo({
        compositor: compositorRef.current,
        sandbox: sandboxRef.current,
        settings: settingsRef.current,
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

      if (autoDownload && result.url) {
        const a = document.createElement('a');
        a.href = result.url;
        a.download = `KuroStudio_Video_${Date.now()}.${result.format}`;
        a.click();
      }
    } catch (err) {
      if (abortController.signal.aborted) {
        onShowToast?.('Proses render dibatalkan.', 'info');
      } else {
        onShowToast?.(`Gagal render: ${err.message}`, 'error');
      }
    } finally {
      setIsRendering(false);
      abortControllerRef.current = null;

      const { width, height } = computeTargetDimensions('720p', exportAspect);
      compositorRef.current.resize(width, height);
    }
  };

  const handleCancelRender = () => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
  };

  const handleDownloadVideo = () => {
    if (!renderResult?.url) return;
    const a = document.createElement('a');
    a.href = renderResult.url;
    a.download = `KuroStudio_Video_${Date.now()}.${renderResult.format}`;
    a.click();
    onShowToast?.('Mengunduh video...', 'success');
  };

  // Ringkasan real-time
  const targetDims = computeTargetDimensions(exportRes, exportAspect);
  const activeBitrateVal = BITRATE_PRESETS[exportBitrate] || 16_000_000;
  const estimatedMB = (((activeBitrateVal * (Number(exportDuration) || 10)) / 8) / (1024 * 1024)).toFixed(1);

  // Teks aktif editor
  let activeCodeText = codeAll;
  let activeCodeSetter = setCodeAll;
  if (editorMode === 'canvas') {
    activeCodeText = codeCanvas;
    activeCodeSetter = setCodeCanvas;
  } else if (hybridTab === 'html') {
    activeCodeText = codeHtml;
    activeCodeSetter = setCodeHtml;
  } else if (hybridTab === 'css') {
    activeCodeText = codeCss;
    activeCodeSetter = setCodeCss;
  } else if (hybridTab === 'js') {
    activeCodeText = codeJs;
    activeCodeSetter = setCodeJs;
  }

  const lineCount = activeCodeText.split('\n').length;
  const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1);

  return (
    <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-6 pb-28">
      
      {/* ─── 1. TOP HEADER & TEMPLATE SELECTOR ─── */}
      <div className="bg-white border-2 border-black shadow-[4px_4px_0px_#000] p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 sm:p-2.5 bg-[#fafafa] hover:bg-neutral-200 border-2 border-black shadow-[2px_2px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 transition-all cursor-pointer"
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
                TRUE FULLSCREEN
              </span>
              <span className="px-2.5 py-0.5 bg-cyan-300 text-black border-2 border-black text-xs font-black shadow-[1.5px_1.5px_0px_#000] hidden sm:inline-block">
                60 FPS DETERMINISTIC
              </span>
            </div>
            <p className="text-xs sm:text-sm text-neutral-600 font-semibold mt-0.5">
              Video animasi sinematik full-bleed 100% layar penuh atau panggung TV 3D dengan WebCodecs MP4.
            </p>
          </div>
        </div>

        {/* Template Selector */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <span className="text-xs font-black uppercase text-neutral-500 whitespace-nowrap">
            Template:
          </span>
          <select
            value={selectedTemplateId}
            onChange={(e) => handleSelectTemplate(e.target.value)}
            className="flex-1 md:w-64 bg-white border-2 border-black p-2 font-bold text-xs sm:text-sm shadow-[2px_2px_0px_#000] focus:outline-none focus:ring-2 focus:ring-black cursor-pointer"
          >
            {CODE_TEMPLATES.map((tmpl) => (
              <option key={tmpl.id} value={tmpl.id}>
                {tmpl.name} ({tmpl.badge})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ─── MOBILE SECTION SWITCHER (md:hidden) ─── */}
      <div className="flex md:hidden bg-white border-2 border-black shadow-[3px_3px_0px_#000] p-1 gap-1">
        <button
          onClick={() => setMobileSection('preview')}
          className={`flex-1 py-2 text-xs font-black uppercase text-center transition-colors ${
            mobileSection === 'preview' ? 'bg-black text-white' : 'hover:bg-neutral-100 text-black'
          }`}
        >
          Studio & Efek
        </button>
        <button
          onClick={() => setMobileSection('editor')}
          className={`flex-1 py-2 text-xs font-black uppercase text-center transition-colors ${
            mobileSection === 'editor' ? 'bg-black text-white' : 'hover:bg-neutral-100 text-black'
          }`}
        >
          Editor Kode
        </button>
        <button
          onClick={() => setMobileSection('export')}
          className={`flex-1 py-2 text-xs font-black uppercase text-center transition-colors ${
            mobileSection === 'export' ? 'bg-black text-white' : 'hover:bg-neutral-100 text-black'
          }`}
        >
          Render Video
        </button>
      </div>

      {/* ─── 2. MAIN 2-COLUMN WORKSPACE ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* ─── KOLOM KIRI: EDITOR KODE ─── */}
        <div
          className={`lg:col-span-6 bg-white border-2 border-black shadow-[4px_4px_0px_#000] flex flex-col overflow-hidden ${
            mobileSection === 'editor' ? 'block' : 'hidden lg:flex'
          }`}
        >
          {/* Header Editor: Mode Switcher & Sub-Tabs */}
          <div className="p-3 bg-neutral-100 border-b-2 border-black space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-black uppercase text-black flex items-center gap-1">
                  <Code2 className="w-4 h-4 text-black" />
                  Mode:
                </span>
                <div className="flex border-2 border-black bg-white">
                  <button
                    onClick={() => {
                      setEditorMode('hybrid');
                      if (sandboxRef.current) sandboxRef.current.updateCode(codeAll, 'html');
                    }}
                    className={`px-2.5 py-1 text-xs font-black cursor-pointer ${
                      editorMode === 'hybrid' ? 'bg-yellow-300 text-black' : 'hover:bg-neutral-100'
                    }`}
                  >
                    Gabungan (HTML+CSS+JS)
                  </button>
                  <button
                    onClick={() => {
                      setEditorMode('canvas');
                      if (sandboxRef.current) sandboxRef.current.updateCode(codeCanvas, 'canvas');
                    }}
                    className={`px-2.5 py-1 text-xs font-black border-l-2 border-black cursor-pointer ${
                      editorMode === 'canvas' ? 'bg-yellow-300 text-black' : 'hover:bg-neutral-100'
                    }`}
                  >
                    Pure JS Canvas
                  </button>
                </div>
              </div>

              <span className="text-[10px] bg-neutral-200 border border-black px-1.5 py-0.5 font-mono font-bold">
                Ctrl+Enter: Run
              </span>
            </div>

            {/* Sub-tab untuk Mode Gabungan */}
            {editorMode === 'hybrid' && (
              <div className="flex gap-1 border-t border-neutral-300 pt-2 overflow-x-auto scrollbar-none">
                {[
                  { id: 'all', label: 'Semua (Single File)' },
                  { id: 'html', label: 'HTML / SVG' },
                  { id: 'css', label: 'CSS' },
                  { id: 'js', label: 'JavaScript' }
                ].map((st) => (
                  <button
                    key={st.id}
                    onClick={() => setHybridTab(st.id)}
                    className={`px-2.5 py-1 text-xs font-bold border border-black transition-colors cursor-pointer whitespace-nowrap ${
                      hybridTab === st.id ? 'bg-black text-white' : 'bg-white text-neutral-800 hover:bg-neutral-200'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Area Editor Teks */}
          <div className="relative flex bg-[#121218] text-white font-mono text-xs sm:text-sm min-h-[440px] max-h-[560px] overflow-hidden">
            <div className="w-12 bg-[#09090d] text-neutral-500 py-3 select-none text-right pr-3 font-mono text-xs border-r border-neutral-800 overflow-hidden leading-relaxed">
              {lineNumbers.map((num) => (
                <div key={num}>{num}</div>
              ))}
            </div>

            <textarea
              ref={textareaRef}
              value={activeCodeText}
              onChange={(e) => activeCodeSetter(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, activeCodeSetter, activeCodeText)}
              spellCheck="false"
              className="flex-1 p-3 bg-transparent text-emerald-400 font-mono text-xs sm:text-sm leading-relaxed resize-none focus:outline-none overflow-y-auto whitespace-pre selection:bg-neutral-700 selection:text-white"
              placeholder="// Tulis kode animasi di sini..."
            />
          </div>

          {/* Error Console */}
          {errorLog && (
            <div className="p-3 bg-red-100 border-t-2 border-black text-red-900 font-mono text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Error Console:</span> {errorLog}
              </div>
            </div>
          )}

          {/* Action Bar di Bawah Editor */}
          <div className="p-3 bg-neutral-100 border-t-2 border-black flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                onClick={handleApplyCode}
                className="px-4 py-2 bg-green-400 hover:bg-green-300 text-black border-2 border-black shadow-[2px_2px_0px_#000] font-black text-xs flex items-center gap-1.5 active:translate-x-0.5 active:translate-y-0.5 transition-all cursor-pointer min-h-[38px]"
                title="Terapkan Kode ke Pratinjau (Ctrl+Enter)"
              >
                <Play className="w-4 h-4 fill-black" />
                Jalankan / Update
              </button>

              <button
                onClick={handleResetCode}
                className={`px-3 py-2 border-2 border-black shadow-[1.5px_1.5px_0px_#000] font-bold text-xs flex items-center gap-1 active:translate-x-0.5 active:translate-y-0.5 transition-all cursor-pointer min-h-[38px] ${
                  confirmReset ? 'bg-red-500 text-white animate-pulse' : 'bg-white hover:bg-neutral-200 text-black'
                }`}
                title="Kembalikan ke Template Asli"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {confirmReset ? 'Yakin Reset?' : 'Reset'}
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={handleCopyCode}
                className="px-3 py-2 bg-white hover:bg-neutral-200 text-black border-2 border-black shadow-[1.5px_1.5px_0px_#000] font-bold text-xs flex items-center gap-1 min-h-[38px] cursor-pointer"
                title="Salin Kode"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-green-700" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Tersalin' : 'Salin'}
              </button>

              <button
                onClick={handleExportCodeFile}
                className="px-3 py-2 bg-white hover:bg-neutral-200 text-black border-2 border-black shadow-[1.5px_1.5px_0px_#000] font-bold text-xs flex items-center gap-1 min-h-[38px] cursor-pointer"
                title="Unduh Berkas Kode"
              >
                <Download className="w-3.5 h-3.5" />
                Ekspor
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-2 bg-white hover:bg-neutral-200 text-black border-2 border-black shadow-[1.5px_1.5px_0px_#000] font-bold text-xs flex items-center gap-1 min-h-[38px] cursor-pointer"
                title="Unggah Berkas Kode (.html, .js)"
              >
                <Upload className="w-3.5 h-3.5" />
                Impor
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".html,.htm,.js,.txt,.css"
                onChange={handleImportFile}
                className="hidden"
              />
            </div>
          </div>
        </div>

        {/* ─── KOLOM KANAN: PREVIEW & PENGATURAN STUDIO ─── */}
        <div
          className={`lg:col-span-6 space-y-4 ${
            mobileSection === 'preview' ? 'block' : 'hidden lg:block'
          }`}
        >
          {/* Quick Preset Action Bar */}
          <div className="bg-white border-2 border-black shadow-[4px_4px_0px_#000] p-2.5 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-black uppercase text-neutral-600 flex items-center gap-1.5">
              <SlidersHorizontal className="w-4 h-4 text-black" />
              Preset Komposisi:
            </span>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => handleQuickPreset('clean-full')}
                className="px-2.5 py-1 bg-yellow-300 hover:bg-yellow-400 border border-black font-black text-[11px] shadow-[1.5px_1.5px_0px_#000] cursor-pointer"
                title="100% Layar Penuh Tanpa Efek Tambahan"
              >
                Fullscreen Murni
              </button>
              <button
                onClick={() => handleQuickPreset('cinematic-full')}
                className="px-2.5 py-1 bg-cyan-300 hover:bg-cyan-400 border border-black font-black text-[11px] shadow-[1.5px_1.5px_0px_#000] cursor-pointer"
                title="Layar Penuh + Partikel + Vignette Sinematik"
              >
                Sinematik HD
              </button>
              <button
                onClick={() => handleQuickPreset('studio-3d')}
                className="px-2.5 py-1 bg-pink-300 hover:bg-pink-400 border border-black font-black text-[11px] shadow-[1.5px_1.5px_0px_#000] cursor-pointer"
                title="Bingkai TV 3D + Orbit + Awan"
              >
                Panggung 3D
              </button>
            </div>
          </div>

          {/* Viewport Box (Canvas Output) */}
          <div
            ref={viewportRef}
            className="bg-black border-2 border-black shadow-[4px_4px_0px_#000] p-2 relative flex flex-col items-center justify-center overflow-hidden"
          >
            <div className="w-full relative flex items-center justify-center bg-neutral-950 overflow-hidden min-h-[220px]">
              <canvas
                ref={canvasRef}
                className="w-full h-auto object-contain max-h-[420px] rounded-sm"
              />
              {!isPlaying && (
                <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/80 text-yellow-300 border border-yellow-400 font-mono text-[10px] font-bold">
                  PAUSED
                </div>
              )}
              {isRendering && (
                <div className="absolute top-2 left-2 px-2 py-0.5 bg-red-600 text-white font-mono text-[10px] font-black animate-pulse">
                  REC ●
                </div>
              )}
            </div>

            {/* Viewport Controls Bar */}
            <div className="w-full bg-neutral-900/90 text-white p-2.5 mt-2 flex items-center justify-between border border-neutral-700 text-xs">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleTogglePlay}
                  className="p-1.5 bg-white text-black hover:bg-neutral-200 border border-black font-black cursor-pointer"
                  title={isPlaying ? 'Jeda' : 'Putar'}
                >
                  {isPlaying ? <Pause className="w-3.5 h-3.5 fill-black" /> : <Play className="w-3.5 h-3.5 fill-black" />}
                </button>
                <button
                  onClick={handleRestart}
                  className="p-1.5 bg-neutral-800 text-white hover:bg-neutral-700 border border-neutral-600 font-bold cursor-pointer"
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
                  {exportAspect} &bull; {settings.stage3d ? '3D TV FRAME' : '100% FULLSCREEN'}
                </span>
                <button
                  onClick={handleToggleFullscreen}
                  className="p-1.5 bg-neutral-800 text-white hover:bg-neutral-700 border border-neutral-600 cursor-pointer"
                  title="Layar Penuh"
                >
                  {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          {/* 3 Tab Pengaturan: SELALU Tersedia & Bebas Dikombinasi */}
          <div className="bg-white border-2 border-black shadow-[4px_4px_0px_#000] p-4">
            
            {/* Header Tab */}
            <div className="flex border-b-2 border-black mb-4 gap-2 overflow-x-auto pb-1 scrollbar-none">
              <button
                onClick={() => setActiveTab('camera')}
                className={`px-3 py-2 text-xs font-black uppercase flex items-center gap-1.5 border-t-2 border-l-2 border-r-2 border-black -mb-[2px] cursor-pointer whitespace-nowrap ${
                  activeTab === 'camera' ? 'bg-yellow-300 text-black' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                <Tv className="w-3.5 h-3.5" />
                Panggung & 3D TV
              </button>

              <button
                onClick={() => setActiveTab('fx')}
                className={`px-3 py-2 text-xs font-black uppercase flex items-center gap-1.5 border-t-2 border-l-2 border-r-2 border-black -mb-[2px] cursor-pointer whitespace-nowrap ${
                  activeTab === 'fx' ? 'bg-cyan-300 text-black' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Awan & Partikel
              </button>

              <button
                onClick={() => setActiveTab('hud')}
                className={`px-3 py-2 text-xs font-black uppercase flex items-center gap-1.5 border-t-2 border-l-2 border-r-2 border-black -mb-[2px] cursor-pointer whitespace-nowrap ${
                  activeTab === 'hud' ? 'bg-pink-300 text-black' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                <Type className="w-3.5 h-3.5" />
                Tipografi HUD
              </button>
            </div>

            {/* TAB 1: PANGGUNG & KAMERA 3D */}
            {activeTab === 'camera' && (
              <div className="space-y-4 text-xs">
                
                {/* Sakelar Toggle Utama: Bingkai TV / Panggung 3D */}
                <div className="p-3 bg-neutral-50 border-2 border-black flex items-center justify-between">
                  <div>
                    <span className="font-black text-black block text-sm">
                      Aktifkan Bingkai TV / Panggung 3D
                    </span>
                    <span className="text-[11px] text-neutral-500">
                      {settings.stage3d
                        ? 'Animasi dimuat ke dalam bingkai TV 3D mengambang dengan latar.'
                        : 'OFF: Animasi tampil 100% Layar Penuh (Full-Bleed, 0px margin, tanpa TV).'}
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.stage3d}
                    onChange={(e) => setSettings((s) => ({ ...s, stage3d: e.target.checked }))}
                    className="w-5 h-5 accent-black cursor-pointer"
                  />
                </div>

                {/* Kontrol saat Mode Full Layar (stage3d === false) */}
                {!settings.stage3d && (
                  <div className="space-y-3 pt-1">
                    <div className="p-2.5 bg-green-50 border border-green-800 text-green-950 font-bold text-xs flex items-center gap-2">
                      <Maximize className="w-4 h-4 text-green-700" />
                      Mode Full Layar Sinematik Aktif: Video memenuhi 100% kanvas secara murni.
                    </div>

                    <div>
                      <div className="flex justify-between font-bold mb-1">
                        <span>Kecepatan Gerak (Speed Multiplier):</span>
                        <span className="font-mono">{settings.motionSpeed}x</span>
                      </div>
                      <input
                        type="range"
                        min="0.25"
                        max="3.0"
                        step="0.25"
                        value={settings.motionSpeed}
                        onChange={(e) => setSettings((s) => ({ ...s, motionSpeed: Number(e.target.value) }))}
                        className="w-full accent-black cursor-pointer h-2"
                      />
                    </div>

                    <div className="pt-2 border-t border-neutral-200 space-y-2">
                      <span className="font-black text-neutral-800 block">Polesan Sinematik HD:</span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <label className="flex items-center gap-2 p-2 bg-neutral-50 border border-black cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={Boolean(settings.vignette)}
                            onChange={(e) => setSettings((s) => ({ ...s, vignette: e.target.checked }))}
                            className="w-4 h-4 accent-black cursor-pointer"
                          />
                          <span className="font-bold">Vignette Halus (Edge Shadow)</span>
                        </label>

                        <label className="flex items-center gap-2 p-2 bg-neutral-50 border border-black cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={Boolean(settings.colorBoost)}
                            onChange={(e) => setSettings((s) => ({ ...s, colorBoost: e.target.checked }))}
                            className="w-4 h-4 accent-black cursor-pointer"
                          />
                          <span className="font-bold">Color & Contrast Polish</span>
                        </label>
                      </div>
                    </div>
                  </div>
                )}

                {/* Kontrol saat Mode Bingkai TV 3D (stage3d === true) */}
                {settings.stage3d && (
                  <div className="space-y-4 pt-1">
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
                            className="p-2 bg-neutral-100 hover:bg-neutral-200 border border-black font-bold text-center active:bg-yellow-200 transition-colors cursor-pointer"
                          >
                            {p.name}
                          </button>
                        ))}
                      </div>
                    </div>

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
                          className="w-full accent-black cursor-pointer h-2"
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
                          className="w-full accent-black cursor-pointer h-2"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between font-bold mb-1">
                          <span>Roll (Z):</span>
                          <span className="font-mono">{settings.rotateZ}°</span>
                        </div>
                        <input
                          type="range"
                          min="-45"
                          max="45"
                          value={settings.rotateZ}
                          onChange={(e) => setSettings((s) => ({ ...s, rotateZ: Number(e.target.value) }))}
                          className="w-full accent-black cursor-pointer h-2"
                        />
                      </div>
                    </div>

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
                          className="w-full accent-black cursor-pointer h-2"
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
                          className="w-full accent-black cursor-pointer h-2"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-2.5 bg-neutral-50 border border-black">
                      <div>
                        <span className="font-black text-black block">Auto-Orbit 3D</span>
                        <span className="text-[11px] text-neutral-500">Gerakan melayang bernapas di ruang 3D</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={settings.autoOrbit}
                        onChange={(e) => setSettings((s) => ({ ...s, autoOrbit: e.target.checked }))}
                        className="w-5 h-5 accent-black cursor-pointer"
                      />
                    </div>

                    <div className="pt-2 border-t border-neutral-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-neutral-800">Latar Belakang TV:</span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setSettings((s) => ({ ...s, bgType: 'gradient' }))}
                            className={`px-2.5 py-1 border border-black font-bold text-[11px] cursor-pointer ${
                              settings.bgType === 'gradient' ? 'bg-black text-white' : 'bg-white text-black'
                            }`}
                          >
                            Gradien
                          </button>
                          <button
                            onClick={() => setSettings((s) => ({ ...s, bgType: 'solid' }))}
                            className={`px-2.5 py-1 border border-black font-bold text-[11px] cursor-pointer ${
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
              </div>
            )}

            {/* TAB 2: AWAN & PARTIKEL */}
            {activeTab === 'fx' && (
              <div className="space-y-4 text-xs">
                {/* Awan Atmosferik */}
                <div className="p-3 bg-neutral-50 border border-black space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Cloud className="w-4 h-4 text-black" />
                      <span className="font-black text-black">Awan Atmosferik</span>
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
                          <span>Densitas / Opasitas:</span>
                          <span className="font-mono">{Math.round(settings.cloudDensity * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min="0.05"
                          max="0.9"
                          step="0.05"
                          value={settings.cloudDensity}
                          onChange={(e) => setSettings((s) => ({ ...s, cloudDensity: Number(e.target.value) }))}
                          className="w-full accent-black cursor-pointer h-2"
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="font-bold">Warna Awan:</span>
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

                {/* Partikel Udara */}
                <div className="p-3 bg-neutral-50 border border-black space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-black" />
                      <span className="font-black text-black">Partikel Udara</span>
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
                              className={`p-2 border border-black font-bold text-center text-[11px] cursor-pointer ${
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
                          <span>Kepadatan:</span>
                          <span className="font-mono">{settings.particleCount} titik</span>
                        </div>
                        <input
                          type="range"
                          min="20"
                          max="300"
                          step="20"
                          value={settings.particleCount}
                          onChange={(e) => setSettings((s) => ({ ...s, particleCount: Number(e.target.value) }))}
                          className="w-full accent-black cursor-pointer h-2"
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="font-bold">Warna Cahaya:</span>
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
                    <span className="font-black text-black block">Tampilkan Judul & Subjudul</span>
                    <span className="text-[11px] text-neutral-500">Badge teks tajam langsung di video (Full Layar & 3D)</span>
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
                      <label className="font-bold text-neutral-800 block mb-1">Judul Utama:</label>
                      <input
                        type="text"
                        value={settings.hudTitle}
                        onChange={(e) => setSettings((s) => ({ ...s, hudTitle: e.target.value }))}
                        placeholder="Contoh: SPECIAL LAUNCH"
                        className="w-full bg-white border-2 border-black p-2 font-bold font-mono text-xs focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="font-bold text-neutral-800 block mb-1">Subjudul:</label>
                      <input
                        type="text"
                        value={settings.hudSubtitle}
                        onChange={(e) => setSettings((s) => ({ ...s, hudSubtitle: e.target.value }))}
                        placeholder="Contoh: LIMITED EDITION COLLECTION"
                        className="w-full bg-white border-2 border-black p-2 font-bold font-mono text-xs focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="font-bold text-neutral-800 block mb-1">Posisi HUD:</label>
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
                            className={`p-2 border border-black font-bold text-[11px] text-center cursor-pointer ${
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

      {/* ─── 3. BOTTOM PANEL: EKSPOR VIDEO DETERMINISTIK 60 FPS ─── */}
      <div
        className={`bg-white border-2 border-black shadow-[4px_4px_0px_#000] p-4 sm:p-6 space-y-5 ${
          mobileSection === 'export' ? 'block' : 'hidden lg:block'
        }`}
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-3 border-b-2 border-black gap-2">
          <div>
            <h2 className="text-lg sm:text-xl font-black uppercase text-black flex items-center gap-2">
              <Film className="w-5 h-5 text-black fill-cyan-400" />
              Ekspor Video Deterministik 60 FPS HD
            </h2>
            <p className="text-xs sm:text-sm text-neutral-600 font-semibold">
              Render video bebas patah-patah dengan WebCodecs MP4 dan Virtual Clock Frame Stepping.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-yellow-300 border border-black font-mono font-bold text-xs shadow-[1.5px_1.5px_0px_#000]">
              {targetDims.width} &times; {targetDims.height} px &bull; ~{estimatedMB} MB
            </span>
          </div>
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
              className="w-full bg-white border-2 border-black p-2 font-bold shadow-[2px_2px_0px_#000] focus:outline-none min-h-[40px] cursor-pointer"
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
              className="w-full bg-white border-2 border-black p-2 font-bold shadow-[2px_2px_0px_#000] focus:outline-none min-h-[40px] cursor-pointer"
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
              className="w-full bg-white border-2 border-black p-2 font-bold shadow-[2px_2px_0px_#000] focus:outline-none min-h-[40px] cursor-pointer"
            >
              <option value="60">60 FPS (Super Mulus)</option>
              <option value="30">30 FPS (Standar Halus)</option>
              <option value="24">24 FPS (Sinematik Film)</option>
            </select>
          </div>

          {/* Durasi Bebas Desimal */}
          <div className="space-y-1.5">
            <label className="font-black uppercase tracking-wider text-neutral-700">Durasi Video (Detik):</label>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min="1"
                max="60"
                step="0.5"
                value={exportDuration}
                onChange={(e) => setExportDuration(Number(e.target.value))}
                disabled={isRendering}
                className="w-24 bg-white border-2 border-black p-2 font-bold font-mono text-xs shadow-[2px_2px_0px_#000] focus:outline-none min-h-[40px]"
              />
              <div className="flex gap-1 flex-wrap">
                {[5, 10, 15, 30].map((sec) => (
                  <button
                    key={sec}
                    onClick={() => setExportDuration(sec)}
                    disabled={isRendering}
                    className={`px-2 py-1 text-[11px] font-bold border border-black cursor-pointer ${
                      Number(exportDuration) === sec ? 'bg-black text-white' : 'bg-neutral-100 hover:bg-neutral-200'
                    }`}
                  >
                    {sec}s
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Kualitas Bitrate */}
          <div className="space-y-1.5">
            <label className="font-black uppercase tracking-wider text-neutral-700">Bitrate Kualitas:</label>
            <select
              value={exportBitrate}
              onChange={(e) => setExportBitrate(e.target.value)}
              disabled={isRendering}
              className="w-full bg-white border-2 border-black p-2 font-bold shadow-[2px_2px_0px_#000] focus:outline-none min-h-[40px] cursor-pointer"
            >
              <option value="light">Ringan (4 Mbps)</option>
              <option value="standard">Standar (8 Mbps)</option>
              <option value="high">Tinggi (16 Mbps)</option>
              <option value="ultra">Ultra (26 Mbps)</option>
            </select>
          </div>
        </div>

        {/* Checkbox Unduh Otomatis */}
        <div className="flex items-center gap-2 pt-1">
          <input
            type="checkbox"
            id="autoDownloadCheckbox"
            checked={autoDownload}
            onChange={(e) => setAutoDownload(e.target.checked)}
            className="w-4 h-4 accent-black cursor-pointer"
          />
          <label htmlFor="autoDownloadCheckbox" className="text-xs font-bold text-neutral-800 cursor-pointer select-none">
            Otomatis unduh berkas MP4 setelah proses render selesai
          </label>
        </div>

        {/* Tombol Mulai Render */}
        {!isRendering && !renderResult && (
          <button
            onClick={handleStartRender}
            className="w-full py-4 bg-black text-white hover:bg-neutral-800 border-2 border-black shadow-[4px_4px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 font-black text-base uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer min-h-[48px]"
          >
            <Video className="w-5 h-5 text-yellow-400 fill-yellow-400" />
            Mulai Render Video ({targetDims.width}&times;{targetDims.height} &bull; {exportFps} FPS &bull; {exportDuration}s)
          </button>
        )}

        {/* Status Render Aktif */}
        {isRendering && (
          <div className="p-4 bg-yellow-50 border-2 border-black space-y-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 font-bold text-xs">
              <span className="flex items-center gap-2 text-black">
                <span className="w-3 h-3 rounded-full bg-yellow-500 animate-ping inline-block" />
                Me-render frame: {renderProgress.frame} / {renderProgress.totalFrames} ({renderProgress.percent}%) &bull; Deterministik 60 FPS
              </span>
              <span className="font-mono text-neutral-600">
                Sisa waktu: ~{renderProgress.timeRemainingSec} detik
              </span>
            </div>

            <div className="w-full h-6 bg-white border-2 border-black relative overflow-hidden">
              <div
                className="h-full bg-black transition-all duration-150"
                style={{ width: `${renderProgress.percent}%` }}
              />
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleCancelRender}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white border-2 border-black shadow-[2px_2px_0px_#000] font-black text-xs uppercase cursor-pointer min-h-[38px]"
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
                  {renderResult.width} &times; {renderResult.height}
                </span>
                <span className="px-2 py-0.5 bg-white border border-black">
                  {renderResult.sizeMB} MB
                </span>
                <span className="px-2 py-0.5 bg-yellow-300 border border-black">
                  {renderResult.format.toUpperCase()}
                </span>
              </div>
            </div>

            {/* Video Player */}
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

            {/* Tombol Unduh & Render Ulang */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                onClick={handleDownloadVideo}
                className="w-full sm:w-auto px-6 py-3.5 bg-green-400 hover:bg-green-300 text-black border-2 border-black shadow-[3px_3px_0px_#000] font-black text-sm uppercase flex items-center justify-center gap-2 active:translate-x-0.5 active:translate-y-0.5 transition-all cursor-pointer min-h-[44px]"
              >
                <Download className="w-4 h-4" />
                Unduh Video ({renderResult.format.toUpperCase()})
              </button>

              <button
                onClick={() => setRenderResult(null)}
                className="w-full sm:w-auto px-6 py-3.5 bg-white hover:bg-neutral-100 text-black border-2 border-black shadow-[3px_3px_0px_#000] font-bold text-sm uppercase flex items-center justify-center gap-2 active:translate-x-0.5 active:translate-y-0.5 transition-all cursor-pointer min-h-[44px]"
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
